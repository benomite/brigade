// L'installation de brigade dans un projet, vue de la machine qui le servira :
// ce que le dépôt et la machine doivent porter pour qu'un cook puisse partir,
// vérifié d'un coup et sans rien lancer ; les labels du rail, créés ; le coût
// du setup d'un worktree, mesuré à blanc ; et la désinstallation.
//
// Rien d'un projet n'est écrit ici : tout se lit dans l'environnement du
// service, dans le clone réservé et sur GitHub. La vérification ne fait que
// lire — `git` dans le clone, sans y déplacer une référence, `gh api` en GET,
// `claude auth status`, `systemctl cat` — et n'ouvre pas le journal.
import { execFile, execFileSync } from "node:child_process";
import { accessSync, constants, existsSync, readdirSync, rmSync } from "node:fs";
import { join, relative, resolve } from "node:path";
import { configRail } from "./alimenter.ts";
import { EFFORTS, MODELES } from "./calibrage.ts";
import { environnementCook, sessionClaude } from "./claude.ts";
import { ouvrirDepot } from "./depot.ts";
import { lireSeuils } from "./derive.ts";
import { lireReglages } from "./garde-fous.ts";
import { jouerSetup, SCRIPT_GATES, SCRIPT_SETUP } from "./gates.ts";
import { LABEL } from "./github.ts";
import { configManager } from "./manager.ts";
import { configPass } from "./pass.ts";
import { configReviewer } from "./reviewer.ts";
import { ConfigInvalide } from "./runtime.ts";
import { configStation } from "./station.ts";
import { prendreVerrou, VerrouTenu } from "./verrou.ts";

// Les variables sans lesquelles le runtime refuse de démarrer.
export const VARIABLES = [
  "BRIGADE_STATE_DIR",
  "BRIGADE_PROJECT",
  "BRIGADE_GITHUB_REPO",
  "BRIGADE_REPO_DIR",
  "BRIGADE_BASE_BRANCH",
  "BRIGADE_MANAGER_MODEL",
  "BRIGADE_MANAGER_EFFORT",
  "BRIGADE_REVIEWER_MODEL",
  "BRIGADE_REVIEWER_EFFORT",
] as const;

export type Label = { name: string; color: string; description: string };

// Les labels par lesquels le chef parle au rail : l'entrée, l'ordre de
// service, et le calibrage sans lequel aucun cook ne part.
export const LABELS: Label[] = [
  { name: LABEL, color: "D93F0B", description: "brigade : à servir — l'issue entre sur le rail" },
  { name: "prio:1", color: "000000", description: "À faire en premier" },
  { name: "prio:2", color: "555555", description: "Important, pas bloquant" },
  { name: "prio:3", color: "AAAAAA", description: "Souhaitable, plus tard" },
  ...MODELES.map((modele) => ({ name: `model:${modele}`, color: "5319E7", description: `brigade : le cook de ce ticket tourne sur ${modele}` })),
  ...EFFORTS.map((effort) => ({ name: `effort:${effort}`, color: "1D76DB", description: `brigade : le cook de ce ticket tourne à l'effort ${effort}` })),
];

// `manque` : aucun cook ne doit partir tant que ce n'est pas réglé. `note` :
// à savoir, sans rien retenir. `geste` : ce qui le règle.
export type Constat = { ou: "machine" | "depot" | "github"; etat: "ok" | "manque" | "note"; texte: string; geste?: string };

const DOC = "docs/installer.md";
const BLOC = /^## Équipe multi-agents/;
// Les bindings que le runtime ne lit pas, mais que le cook et les gates lisent.
const BINDINGS_ATTENDUS = ["Zones de fichiers", "Dev local", "Plafond des gates"];
const BRANCHE_PAR_DEFAUT = "main";
const DELAI_MS = 120_000;

type Sortie = { code: number | null; stdout: string; stderr: string; introuvable: boolean };

// Lance une commande et rend ce qu'elle a dit, quel que soit son code de
// sortie. Ne lève pas : un binaire absent est une réponse.
function lancer(bin: string, args: string[], options: { cwd?: string; env: NodeJS.ProcessEnv }): Promise<Sortie> {
  return new Promise((resoudre) => {
    execFile(bin, args, { ...options, timeout: DELAI_MS, maxBuffer: 64 * 1024 * 1024 }, (erreur, stdout, stderr) => {
      const code = erreur === null ? 0 : typeof erreur.code === "number" ? erreur.code : null;
      resoudre({ code, stdout, stderr, introuvable: (erreur as NodeJS.ErrnoException | null)?.code === "ENOENT" });
    });
  });
}

type Reponse = { statut: number; corps: string; suivant: string | null };

// `gh api -i` : la réponse HTTP fait foi, pas le code de sortie — `gh` sort en
// erreur sur un 404.
async function appelerGh(bin: string, env: NodeJS.ProcessEnv, args: string[]): Promise<Reponse> {
  const { stdout, stderr } = await lancer(bin, ["api", "-i", ...args], { env });
  const [tete = "", ...reste] = stdout.split(/\r?\n\r?\n/);
  const statut = /^HTTP\/\S+ (\d{3})/.exec(tete)?.[1];
  if (!statut) throw new Error(stderr.trim() || "réponse illisible");
  return { statut: Number(statut), corps: reste.join("\n\n"), suivant: /^link:.*<([^>]+)>;\s*rel="next"/im.exec(tete)?.[1] ?? null };
}

const cheminDesLabels = (depot: string) => `repos/${depot}/labels?per_page=100`;

// Les noms des labels du dépôt, page après page.
async function labelsDuDepot(bin: string, env: NodeJS.ProcessEnv, depot: string): Promise<string[]> {
  const noms: string[] = [];
  for (let chemin: string | null = cheminDesLabels(depot); chemin; ) {
    const page: Reponse = await appelerGh(bin, env, [chemin]);
    if (page.statut !== 200) throw new Error(`HTTP ${page.statut}`);
    noms.push(...(JSON.parse(page.corps) as Array<{ name: string }>).map(({ name }) => name));
    chemin = page.suivant;
  }
  return noms;
}

const message = (erreur: unknown) => (erreur instanceof Error ? erreur.message : String(erreur));

// Les lignes `- **Nom** : valeur` du bloc de bindings, ou null s'il n'y est pas.
function lireBindings(claudeMd: string): Map<string, string> | null {
  const lignes = claudeMd.split("\n");
  const debut = lignes.findIndex((ligne) => BLOC.test(ligne));
  if (debut === -1) return null;
  const bindings = new Map<string, string>();
  for (const ligne of lignes.slice(debut + 1)) {
    if (/^## /.test(ligne)) break;
    const [, nom, valeur] = /^- \*\*(.+?)\*\* :\s*(.*)$/.exec(ligne) ?? [];
    if (nom !== undefined && valeur !== undefined) bindings.set(nom, valeur);
  }
  return bindings;
}

// Vérifie qu'un projet est prêt à être servi, et rend tout ce qu'il a
// constaté — ce qui manque, en entier, pas le premier manque. `env` :
// l'environnement dans lequel le runtime du projet démarrerait.
export async function verifier(env: NodeJS.ProcessEnv): Promise<Constat[]> {
  const constats: Constat[] = [];
  const noter = (ou: Constat["ou"], etat: Constat["etat"], texte: string, geste?: string) => void constats.push({ ou, etat, texte, ...(geste === undefined ? {} : { geste }) });
  const projet = env.BRIGADE_PROJECT || "<projet>";
  const unite = `brigade@${projet}.service`;
  const dropIn = `la poser dans le drop-in de l'instance (\`sudo systemctl edit ${unite}\`), ou lancer cette commande avec l'environnement du service — ${DOC}`;

  // --- La machine : les variables, telles que le runtime les lirait.
  // Chaque lecteur s'arrête à son premier refus : les variables absentes sont
  // donc cherchées d'abord, toutes, et dites avec les mots du lecteur quand il
  // en a de plus précis.
  const refus: string[] = [];
  for (const lecteur of [configRail, lireReglages, configStation, configPass, configReviewer, configManager, lireSeuils]) {
    try {
      lecteur(env);
    } catch (erreur) {
      if (!(erreur instanceof ConfigInvalide)) throw erreur;
      refus.push(erreur.message);
    }
  }
  const dits = new Set<string>();
  for (const variable of VARIABLES) {
    const absente = `${variable} n'est pas défini`;
    if (!env[variable]) dits.add(refus.find((texte) => texte.startsWith(absente)) ?? absente);
  }
  for (const texte of refus) dits.add(texte);
  for (const texte of dits) noter("machine", "manque", texte, dropIn);
  if (dits.size === 0) noter("machine", "ok", `les ${VARIABLES.length} variables obligatoires sont posées, et tout ce que le runtime lit de son environnement est lisible`);

  const etat = env.BRIGADE_STATE_DIR;
  if (etat && existsSync(etat)) {
    try {
      accessSync(etat, constants.W_OK);
      noter("machine", "ok", `répertoire d'état : ${etat}`);
    } catch {
      noter("machine", "manque", `le répertoire d'état ${etat} n'est pas inscriptible par ce compte`, "lancer cette commande sous le compte du service, ou lui rendre le répertoire (`chown`)");
    }
  }

  // --- La machine : le clone réservé, et la base qu'il rapatrie.
  const clone = env.BRIGADE_REPO_DIR;
  const base = env.BRIGADE_BASE_BRANCH;
  const depotGitHub = env.BRIGADE_GITHUB_REPO;
  const git = (...args: string[]) => lancer("git", args, { cwd: clone, env });
  // Pourquoi le dépôt ne peut pas être lu, ou null s'il peut l'être.
  let illisible: string | null = null;
  // Le commit de la base sur l'origine, une fois ses objets dans le clone.
  let baseLue = "";
  if (!clone || !base) illisible = "le clone réservé ou la branche d'intégration ne sont pas désignés";
  else if (!existsSync(clone) || (await git("rev-parse", "--git-dir")).code !== 0) {
    illisible = "le clone réservé n'y est pas";
    noter(
      "machine",
      "manque",
      `clone réservé absent : ${clone} n'est pas un dépôt git`,
      `sous le compte du service : \`git clone https://github.com/${depotGitHub || "<owner>/<repo>"}.git ${clone}\``,
    );
  } else {
    const origine = (await git("remote", "get-url", "origin")).stdout.trim();
    const [, vise] = /github\.com[:/]([^/]+\/[^/]+?)(?:\.git)?\/?$/.exec(origine) ?? [];
    if (depotGitHub && vise !== undefined && vise.toLowerCase() !== depotGitHub.toLowerCase()) {
      noter("machine", "manque", `le clone réservé ${clone} est celui de ${vise}, pas de ${depotGitHub} (BRIGADE_GITHUB_REPO)`, "recloner le bon dépôt, ou corriger la variable");
    }
    // La base telle que l'origine la porte à cet instant. Aucune référence du
    // clone n'est déplacée — la station peut y rapatrier au même moment : seuls
    // les objets du commit sont rapportés s'ils manquent.
    const distante = await git("ls-remote", "origin", `refs/heads/${base}`);
    const [tete] = distante.stdout.split(/\s/);
    const rapporte = async (commit: string) =>
      (await git("cat-file", "-e", `${commit}^{commit}`)).code === 0 || (await git("fetch", "--quiet", "--no-write-fetch-head", "--refmap=", "origin", `refs/heads/${base}`)).code === 0;
    if (distante.code !== 0) {
      illisible = "l'origine du clone ne répond pas";
      noter(
        "machine",
        "manque",
        `l'origine du clone ${clone} ne répond pas sous ce compte : ${distante.stderr.trim() || "échec de git ls-remote"}`,
        "ce compte doit lire le dépôt sans rien demander (`gh auth setup-git`, ou une clé SSH)",
      );
    } else if (!tete) {
      illisible = `\`${base}\` n'existe pas sur l'origine`;
      noter("machine", "manque", `la branche \`${base}\` (BRIGADE_BASE_BRANCH) n'existe pas sur l'origine du clone`, "corriger la variable, ou pousser la branche");
    } else if (!(await rapporte(tete))) {
      illisible = `\`${base}\` n'a pas pu être rapportée de l'origine`;
      noter("machine", "manque", `la branche \`${base}\` n'a pas pu être rapportée de l'origine du clone ${clone}`, "vérifier le réseau et le disque du clone");
    } else {
      baseLue = tete;
      noter("machine", "ok", `clone réservé : ${clone}, \`${base}\` lue sur l'origine (${tete.slice(0, 7)})`);
    }
  }

  // --- La machine : la session Max, et l'unité de service.
  const session = await sessionClaude(env.BRIGADE_CLAUDE_BIN || "claude", env);
  if (session === "connectee") noter("machine", "ok", "session Max : `claude` est connecté sous ce compte");
  else if (session === "inconnue") noter("machine", "note", "session Max : `claude auth status` n'a rien dit de lisible — le premier cook tranchera");
  else {
    noter(
      "machine",
      "manque",
      session === "introuvable" ? "pas de session Max : le binaire `claude` est introuvable sous ce compte" : "pas de session Max : `claude` n'est pas connecté sous ce compte",
      "installer le binaire officiel et s'y connecter sous le compte du service (`claude`, puis `/login`)",
    );
  }

  const systemctl = env.BRIGADE_SYSTEMCTL_BIN || "systemctl";
  const installee = await lancer(systemctl, ["cat", unite], { env });
  if (installee.introuvable) noter("machine", "note", `pas de systemd sur cette machine : l'unité ${unite} n'est pas vérifiée`);
  else if (installee.code !== 0) {
    noter("machine", "manque", `l'unité ${unite} n'est pas installée`, `\`sudo cp runtime/deploy/brigade@.service /etc/systemd/system/ && sudo systemctl daemon-reload\` — ${DOC}`);
  } else {
    noter("machine", "ok", `unité de service : ${unite}`);
    const minuteur = `brigade-sauvegarde@${projet}.timer`;
    if ((await lancer(systemctl, ["is-enabled", minuteur], { env })).code !== 0) {
      noter("machine", "note", `la sauvegarde n'est pas programmée (${minuteur}) : rien ne garde le journal de ce projet`, "docs/runtime.md, « Installer la sauvegarde »");
    }
  }

  // --- Le dépôt, tel que sa branche d'intégration le porte sur l'origine.
  if (illisible !== null) noter("depot", "note", `dépôt non vérifié : ${illisible}`);
  else {
    const ref = baseLue;
    const porte = new Map(
      (await git("ls-tree", ref, "--", SCRIPT_GATES, SCRIPT_SETUP)).stdout
        .split("\n")
        .filter(Boolean)
        .map((ligne): [string, string] => [ligne.slice(ligne.indexOf("\t") + 1), ligne.split(" ")[0] ?? ""]),
    );
    // Le runtime exécute ces scripts tels quels : un fichier ordinaire doit
    // porter son droit d'exécution. Un lien mène où il mène.
    const executable = (script: string) => porte.get(script) !== "100644";
    const rendre = (script: string) => `\`git update-index --chmod=+x ${script}\`, commité sur \`${base}\``;

    if (!porte.has(SCRIPT_GATES)) {
      noter("depot", "manque", `\`${SCRIPT_GATES}\` n'est pas sur \`${base}\` : sans gates, la pass ne juge aucune livraison`, `\`/brigade:init\` dans le dépôt, puis merger sur \`${base}\``);
    } else if (!executable(SCRIPT_GATES)) noter("depot", "manque", `\`${SCRIPT_GATES}\` n'est pas exécutable : la pass le lance tel quel`, rendre(SCRIPT_GATES));
    else noter("depot", "ok", `gates : \`${SCRIPT_GATES}\``);

    if (!porte.has(SCRIPT_SETUP)) {
      noter("depot", "note", `pas de \`${SCRIPT_SETUP}\` sur \`${base}\` : le cook part dans un worktree neuf tel quel, sans dépendances installées`);
    } else if (!executable(SCRIPT_SETUP)) noter("depot", "manque", `\`${SCRIPT_SETUP}\` n'est pas exécutable : la station le lance tel quel`, rendre(SCRIPT_SETUP));
    else noter("depot", "ok", `setup du worktree : \`${SCRIPT_SETUP}\``);

    const claudeMd = await git("show", `${ref}:CLAUDE.md`);
    const bindings = claudeMd.code === 0 ? lireBindings(claudeMd.stdout) : null;
    if (bindings === null) {
      noter("depot", "manque", `le bloc de bindings (« ## Équipe multi-agents ») n'est pas dans le \`CLAUDE.md\` de \`${base}\``, `\`/brigade:init\` dans le dépôt, puis merger sur \`${base}\``);
    } else {
      const ligne = bindings.get("Branche d'intégration");
      const declaree = ligne === undefined ? BRANCHE_PAR_DEFAUT : (/`([^`]+)`/.exec(ligne)?.[1] ?? ligne.trim());
      if (declaree !== base) {
        noter(
          "depot",
          "manque",
          `la branche d'intégration n'est pas la même des deux côtés : les bindings disent \`${declaree}\`${ligne === undefined ? " (aucune ligne « Branche d'intégration »)" : ""}, BRIGADE_BASE_BRANCH dit \`${base}\``,
          "corriger celle des deux qui a tort : les cooks lisent les bindings, la station lit la variable",
        );
      } else noter("depot", "ok", `bindings : bloc présent, branche d'intégration \`${base}\``);
      const absents = BINDINGS_ATTENDUS.filter((nom) => !bindings.has(nom));
      if (absents.length > 0) {
        noter("depot", "note", `bindings absents du bloc : ${absents.join(", ")} — le runtime ne les lit pas, le cook et les gates si`, "`/brigade:init` les propose");
      }
    }
  }

  // --- GitHub : le dépôt, et les labels par lesquels le chef parle au rail.
  let rail;
  try {
    rail = configRail(env);
  } catch {
    noter("github", "note", "GitHub non vérifié : BRIGADE_GITHUB_REPO ne désigne pas un dépôt");
  }
  if (rail !== undefined) {
    const { depot, gh } = rail;
    try {
      const lu = await appelerGh(gh, env, [`repos/${depot}`]);
      if (lu.statut !== 200) throw new Error(`HTTP ${lu.statut}`);
      noter("github", "ok", `dépôt lu par \`gh\` : ${depot}`);
      const presents = await labelsDuDepot(gh, env, depot);
      const absents = LABELS.map(({ name }) => name).filter((nom) => !presents.includes(nom));
      if (absents.length === 0) noter("github", "ok", `labels : les ${LABELS.length} y sont`);
      else noter("github", "manque", `labels absents du dépôt : ${absents.join(", ")}`, "`npm --prefix runtime run installation -- labels`");
    } catch (erreur) {
      noter(
        "github",
        "manque",
        `\`gh\` ne lit pas le dépôt ${depot} sous ce compte : ${message(erreur)}`,
        "`gh auth status` sous le compte du service ; un dépôt privé réclame un accès explicite",
      );
    }
  }

  return constats;
}

// Crée sur le dépôt les labels qui y manquent. Rejouable : un label présent
// n'est ni recréé ni retouché — sa couleur et sa description sont au projet.
export async function poserLabels(env: NodeJS.ProcessEnv): Promise<{ crees: string[]; presents: string[] }> {
  const { depot, gh } = configRail(env);
  const existants = await labelsDuDepot(gh, env, depot);
  const crees: string[] = [];
  const presents: string[] = [];
  for (const label of LABELS) {
    if (existants.includes(label.name)) {
      presents.push(label.name);
      continue;
    }
    const champs = Object.entries(label).flatMap(([nom, valeur]) => ["-f", `${nom}=${valeur}`]);
    const { statut } = await appelerGh(gh, env, ["-X", "POST", ...champs, `repos/${depot}/labels`]);
    // 422 : il existe déjà — créé entre la lecture et ce geste.
    if (statut === 201) crees.push(label.name);
    else if (statut !== 422) throw new Error(`label \`${label.name}\` refusé par GitHub sur ${depot} : HTTP ${statut}`);
  }
  return { crees, presents };
}

// Le worktree de sonde : un essai jetable, sous un nom qu'aucun run ne porte.
const SONDE = "installation";
// Le numéro que la sonde passe au setup : celui d'aucun ticket.
const TICKET_DE_SONDE = 0;
// La part du bail que la station laisse au setup avant de l'arrêter.
const PART_DU_SETUP = 0.5;

export type MesureSetup = {
  // Le commit de la base sur lequel le setup a été joué.
  sha: string;
  // `joue` : le projet a un setup. `pret` : il a réussi sous son plafond.
  joue: boolean;
  pret: boolean;
  dureeMs: number;
  // Le poids du worktree à sa création, puis une fois le setup passé.
  avantOctets: number;
  apresOctets: number;
  // Ce que le setup a écrit.
  sortie: string;
};

const poids = (repertoire: string): number => Number(execFileSync("du", ["-sk", repertoire], { encoding: "utf8" }).split(/\s/)[0]) * 1024;

// Joue le setup du projet une fois, à blanc, comme la station le jouerait
// avant un cook : dans un worktree neuf de la base, avec l'environnement d'un
// cook, sous la moitié du bail. Aucun cook n'est lancé, et le worktree est
// retiré — pas ce que le setup aurait posé ailleurs (une base de test).
export async function mesurerSetup(env: NodeJS.ProcessEnv): Promise<MesureSetup> {
  const etat = env.BRIGADE_STATE_DIR;
  if (!etat) throw new ConfigInvalide("BRIGADE_STATE_DIR n'est pas défini");
  const { clone, base } = configStation(env);
  const { dureeBailMs } = configRail(env);
  const depot = ouvrirDepot({ clone, base, worktrees: join(etat, "worktrees"), env });
  const sha = await depot.rapatrier();
  // Ce qu'une sonde tuée en plein setup aurait laissé.
  depot.jeter(SONDE);
  const worktree = await depot.essayer(SONDE);
  if (worktree === null) throw new Error("worktree de sonde impossible à poser");
  try {
    const avantOctets = poids(worktree);
    const debut = Date.now();
    const setup = await jouerSetup({ worktree, ticket: TICKET_DE_SONDE, env: environnementCook(env), delaiMs: dureeBailMs * PART_DU_SETUP });
    const dureeMs = Date.now() - debut;
    return { sha, joue: setup.pret ? setup.joue : true, pret: setup.pret, dureeMs, avantOctets, apresOctets: poids(worktree), sortie: setup.sortie };
  } finally {
    depot.jeter(SONDE);
  }
}

export type Tenue = {
  // Le setup, mesuré seul, face à la moitié du bail.
  setup: { plafondMs: number; tient: boolean };
  // Le temps que le dernier cook attend son entrée, vague après vague.
  entree: { vagues: number; dernierMs: number };
  // Ce que prennent tous les worktrees à la fois, face à ce que la machine a.
  disque: { besoin: number; disponible: number; tient: boolean };
  tient: boolean;
};

// Ce que la mesure d'un setup veut dire à `cooks` cooks de front : un worktree
// neuf par cook tient si le setup finit sous son plafond et si tous les
// worktrees tiennent sur le disque, réserve de la station déduite.
export function tenir(mesure: MesureSetup, machine: { cooks: number; entrees: number; bailMs: number; disqueLibre: number; disqueMinOctets: number }): Tenue {
  const plafondMs = machine.bailMs * PART_DU_SETUP;
  const vagues = Math.ceil(machine.cooks / machine.entrees);
  const besoin = machine.cooks * mesure.apresOctets;
  const disponible = machine.disqueLibre - machine.disqueMinOctets;
  const setup = { plafondMs, tient: mesure.pret && mesure.dureeMs <= plafondMs };
  const disque = { besoin, disponible, tient: besoin <= disponible };
  return { setup, entree: { vagues, dernierMs: vagues * mesure.dureeMs }, disque, tient: setup.tient && disque.tient };
}

export class InstallationRefusee extends Error {
  constructor(message: string) {
    super(message);
    this.name = "InstallationRefusee";
  }
}

export type Desinstallation = {
  // Vrai si quelque chose vient d'être retiré.
  retire: boolean;
  // Le clone réservé, ou null s'il n'y est déjà plus.
  clone: string | null;
  // Les worktrees de cooks encore accrochés.
  worktrees: number;
  // Les commits du clone qui ne sont sur aucune branche de l'origine : ils
  // partent avec lui.
  nonPousses: string[];
};

// Retire ce que brigade a posé sur la machine pour ce projet et qui appartient
// au compte du service : le clone réservé et les worktrees. Sans `confirme`,
// ne fait que le dire. Ni l'origine, ni le journal, ni l'unité de service ne
// sont touchés. Rejouable.
export function desinstaller(env: NodeJS.ProcessEnv, { confirme }: { confirme: boolean }): Desinstallation {
  const etat = env.BRIGADE_STATE_DIR;
  const clone = env.BRIGADE_REPO_DIR;
  if (!etat) throw new ConfigInvalide("BRIGADE_STATE_DIR n'est pas défini");
  if (!clone) throw new ConfigInvalide("BRIGADE_REPO_DIR n'est pas défini");
  const worktrees = join(etat, "worktrees");
  const accroches = existsSync(worktrees) ? readdirSync(worktrees).filter((nom) => !nom.startsWith(".")).length : 0;

  // Le verrou du runtime, tenu le temps du geste : aucun ne démarre pendant
  // qu'on retire son clone.
  let verrou = null;
  if (existsSync(join(etat, "lock.db"))) {
    try {
      verrou = prendreVerrou(etat);
    } catch (erreur) {
      if (!(erreur instanceof VerrouTenu)) throw erreur;
      throw new InstallationRefusee(`le runtime du projet tourne encore sur ${etat} : l'arrêter d'abord — rien n'est retiré`);
    }
  }
  try {
    if (!existsSync(clone)) {
      if (confirme) rmSync(worktrees, { recursive: true, force: true });
      return { retire: false, clone: null, worktrees: accroches, nonPousses: [] };
    }
    const git = (...args: string[]) => execFileSync("git", args, { cwd: clone, env, encoding: "utf8", stdio: ["ignore", "pipe", "pipe"] }).trim();
    // `--git-dir` vaut `.git` à la racine d'un clone, et rien d'autre : un
    // sous-répertoire d'un dépôt n'est pas un clone.
    let racine = false;
    try {
      racine = git("rev-parse", "--git-dir") === ".git";
    } catch {}
    if (!racine) throw new InstallationRefusee(`${clone} n'est pas un clone git : rien n'est retiré`);
    if (!relative(resolve(clone), resolve(etat)).startsWith("..")) {
      throw new InstallationRefusee(`le répertoire d'état ${etat} est dans le clone ${clone} : le retirer emporterait le journal — rien n'est retiré`);
    }
    const nonPousses = git("log", "--branches", "--not", "--remotes", "--format=%h %s").split("\n").filter(Boolean);
    if (confirme) {
      rmSync(worktrees, { recursive: true, force: true });
      rmSync(clone, { recursive: true, force: true });
    }
    return { retire: confirme, clone, worktrees: accroches, nonPousses };
  } finally {
    verrou?.relacher();
  }
}
