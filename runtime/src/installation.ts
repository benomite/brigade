// L'installation de brigade dans un projet, vue de la machine qui le servira :
// ce que le dépôt et la machine doivent porter pour qu'un cook puisse partir,
// vérifié d'un coup et sans rien lancer ; les labels du rail, créés ; le coût
// du setup d'un worktree, mesuré à blanc ; et la désinstallation.
//
// Rien d'un projet n'est écrit ici : tout se lit dans l'environnement du
// service, dans le clone réservé et sur GitHub. La vérification ne fait que
// lire — `git` dans le clone, sans y déplacer une référence, `gh api` en GET,
// `claude auth status`, `systemctl cat` et `show`, les unités posées et ce que
// le runtime a laissé de son code en démarrant — et ne lit le journal qu'en
// lecture seule, pour y trouver la connexion Max telle que la station la tient.
import { execFile, execFileSync } from "node:child_process";
import { accessSync, constants, existsSync, lstatSync, readdirSync, readFileSync, realpathSync, rmSync, statSync } from "node:fs";
import { homedir } from "node:os";
import { basename, delimiter, dirname, isAbsolute, join, relative, resolve, sep } from "node:path";
import { configRail } from "./alimenter.ts";
import { EFFORTS, MODELES } from "./calibrage.ts";
import { environnementCook, sessionClaude } from "./claude.ts";
import { configCloison } from "./cloison.ts";
import { empreinteDuCode, lireCodeEnService, SOURCES } from "./code.ts";
import { ouvrirDepot } from "./depot.ts";
import { cheminJournal, ouvrirJournal } from "./journal.ts";
import { lireSeuils } from "./derive.ts";
import { lireReglages } from "./garde-fous.ts";
import { jouerSetup, SCRIPT_GATES, SCRIPT_SETUP } from "./gates.ts";
import { lireReglage, ouvertDe, Refus } from "./installateur.ts";
import { LABEL } from "./github.ts";
import { configManager } from "./manager.ts";
import { configPass } from "./pass.ts";
import { configReviewer } from "./reviewer.ts";
import { ConfigInvalide, NOM_DE_PROJET } from "./runtime.ts";
import { configSecrets, lireSecrets } from "./secrets.ts";
import { configStation } from "./station.ts";
import { GESTE_DE_STATION, VARIABLE_DES_STATIONS } from "./stations-declarees.ts";
import { direConnexionTombee, etatStation, GESTE_DE_CONNEXION, stationsDeconnectees } from "./projections/stations.ts";
import { prendreVerrou, VerrouTenu } from "./verrou.ts";
import { lireCompteRendu } from "./version.ts";

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
// Ce qui se règle une fois par box, et ce qui se règle par projet.
const DOC_DE_LA_BOX = `${DOC}, « Préparer la box »`;
const DOC_DU_PROJET = `${DOC}, « Déclarer le projet »`;
const DOC_DE_LA_MISE_A_JOUR = `${DOC}, « Mettre brigade à jour »`;
// Ce que la box tient en copie : les unités, et la cloison de chaque projet.
const CLOISON = "cloison.conf";
// Les deux réglages que le chef écrit dans sa copie de la cloison : ce n'est
// pas par eux qu'elle date.
const REGLAGE_DE_CLOISON = /^#?Environment=BRIGADE_SANDBOX_(?:HIDDEN|PRIVATE)=.*$/gm;
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

// Les noms des labels du dépôt, page après page — en minuscules : GitHub ne
// distingue pas la casse d'un label, `Fire` y est `fire`.
async function labelsDuDepot(bin: string, env: NodeJS.ProcessEnv, depot: string): Promise<string[]> {
  const noms: string[] = [];
  for (let chemin: string | null = cheminDesLabels(depot); chemin; ) {
    const page: Reponse = await appelerGh(bin, env, [chemin]);
    if (page.statut !== 200) throw new Error(`HTTP ${page.statut}`);
    noms.push(...(JSON.parse(page.corps) as Array<{ name: string }>).map(({ name }) => name.toLowerCase()));
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

// Le `PATH` qu'une unité reçoit quand aucun de ses drop-ins n'en pose : celui
// de systemd, pas celui d'un shell — `~/.local/bin` n'y est pas.
const PATH_DE_SYSTEMD = "/usr/local/sbin:/usr/local/bin:/usr/sbin:/usr/bin";

// Ce que `systemctl show` dit d'une unité : le `PATH` de ses drop-ins, s'ils
// en posent un — la dernière affectation l'emporte —, si elle a son propre
// /tmp, si elle tourne, le fichier d'où elle est chargée, et le répertoire où
// son runtime est lancé.
const PROPRIETES = ["Environment", "PrivateTmp", "ActiveState", "FragmentPath", "LoadState", "WorkingDirectory"];
function lireUnite(sortie: string): { chemin: string | null; tmpPrive: boolean; etat: string; fragment: string | null; masquee: boolean; travail: string | null } {
  const proprietes = new Map(sortie.split("\n").map((ligne): [string, string] => [ligne.split("=", 1)[0] ?? "", ligne.slice(ligne.indexOf("=") + 1)]));
  const chemin = (proprietes.get("Environment") ?? "").split(/\s+/).findLast((affectation) => affectation.startsWith("PATH="));
  return {
    chemin: chemin?.slice("PATH=".length) ?? null,
    tmpPrive: proprietes.get("PrivateTmp") === "yes",
    etat: proprietes.get("ActiveState") ?? "",
    fragment: proprietes.get("FragmentPath") || null,
    masquee: proprietes.get("LoadState") === "masked",
    travail: proprietes.get("WorkingDirectory") || null,
  };
}

type Copie = { nom: string; identique: boolean };

// Là où la box pose la cloison d'un projet : dans le drop-in de son instance.
const cloisonPosee = (posees: string, unite: string) => join(posees, `${unite}.d`, CLOISON);

// Ce que la box a posé de `runtime/deploy/`, comparé à ce que le dépôt porte
// maintenant. Ce qui n'est pas posé n'est pas comparé : une box à un seul
// projet n'a ni arbitre ni cloison. Le geste `brigade` est un lien, pas une
// copie.
function lireCopies(posees: string, unite: string, depot: string): Copie[] {
  const sansReglages = (contenu: string) => contenu.replace(REGLAGE_DE_CLOISON, "");
  let noms: string[];
  try {
    noms = readdirSync(depot);
  } catch {
    return [];
  }
  return noms
    .filter((nom) => nom === CLOISON || /\.(?:service|timer)$/.test(nom))
    .sort()
    .flatMap((nom) => {
      let posee: string;
      try {
        posee = readFileSync(nom === CLOISON ? cloisonPosee(posees, unite) : join(posees, nom), "utf8");
      } catch {
        return [];
      }
      // Un lien vers le fichier du dépôt n'est pas une copie : il serait comparé à lui-même.
      const fichierDuDepot = join(depot, nom);
      const lie = nom === CLOISON ? cloisonPosee(posees, unite) : join(posees, nom);
      if (realpathOuTel(lie) === realpathOuTel(fichierDuDepot)) return [];
      const livree = readFileSync(fichierDuDepot, "utf8");
      return [{ nom, identique: nom === CLOISON ? sansReglages(posee) === sansReglages(livree) : posee === livree }];
    });
}

const realpathOuTel = (chemin: string) => {
  try {
    return realpathSync(chemin);
  } catch {
    return chemin;
  }
};

// Ce que valent les copies de la box face au dépôt : une unité posée avant la
// dernière mise à jour du code reste celle d'avant, et rien d'autre ne le dit.
export function jugerUnites(lu: { posees: string; depot: string; unite: string; copies: Copie[] }): Pick<Constat, "etat" | "texte" | "geste"> {
  const { posees, depot } = lu;
  const nonComparees = (pourquoi: string) => ({ etat: "note" as const, texte: `unités non comparées à celles du dépôt (${depot}) : ${pourquoi}` });
  if (realpathOuTel(posees) === realpathOuTel(depot)) return nonComparees(`systemd charge ${lu.unite} depuis le dépôt lui-même (${posees}), qui serait comparé à lui-même`);
  if (lu.copies.length === 0) return nonComparees(`aucune copie n'est posée sous ${posees}`);
  const perimees = lu.copies.filter((copie) => !copie.identique).map((copie) => copie.nom);
  if (perimees.length === 0) {
    return { etat: "ok", texte: `unités à jour : rien de ce qui est posé sous ${posees} ne diffère du dépôt (${depot}) — ${lu.copies.map((copie) => copie.nom).join(", ")}` };
  }
  const gestes = [
    // Les unités se recopient telles quelles, toutes ; la cloison porte les
    // réglages du chef.
    ...(perimees.some((nom) => nom !== CLOISON) ? [`\`sudo cp ${depot}/*.service ${depot}/*.timer ${posees}/\``] : []),
    ...(perimees.includes(CLOISON)
      ? [`recopier \`${join(depot, CLOISON)}\` sur \`${cloisonPosee(posees, lu.unite)}\` en y reportant tes réglages (\`BRIGADE_SANDBOX_HIDDEN\`, \`BRIGADE_SANDBOX_PRIVATE\`)`]
      : []),
  ];
  return {
    etat: "note",
    texte: `unités périmées : ${perimees.join(", ")} — ce qui est posé sous ${posees} diffère du dépôt (${depot}), et systemd lance ce qui est posé`,
    geste: `${gestes.join(" ; ")} ; puis \`sudo systemctl daemon-reload\`, puis la bascule de chaque projet : elles valent pour toute la box, et aucun retour ne les couvre — ${DOC_DE_LA_MISE_A_JOUR}`,
  };
}

// Sur quel code le runtime du projet tourne. `enService` : l'empreinte qu'il a
// laissée en démarrant, ou null ; `installe` : celle du code installé ;
// `clone` : le `runtime/` du clone, d'où la bascule se lance.
export function jugerCode(lu: { unite: string; projet: string; clone: string; sources: string; etat: string; enService: string | null; installe: string }): Pick<Constat, "etat" | "texte" | "geste"> {
  const { unite, sources } = lu;
  if (lu.etat !== "active" && lu.etat !== "inactive" && lu.etat !== "failed") {
    return { etat: "note", texte: `runtime en transition : ${unite} est \`${lu.etat || "d'état inconnu"}\`, un process sur le code d'avant peut vivre encore — ce qu'il démarrera ne se dit pas avant qu'il soit arrêté ou démarré`, geste: `relancer cette vérification une fois ${unite} posé (\`systemctl is-active ${unite}\`) — ${DOC_DE_LA_MISE_A_JOUR}` };
  }
  if (lu.etat !== "active") return { etat: "ok", texte: `runtime à l'arrêt : ${unite} démarrera sur le code installé (${sources})` };
  if (lu.enService === lu.installe) return { etat: "ok", texte: `runtime à jour : ${unite} tourne sur le code installé (${sources})` };
  return {
    etat: "note",
    texte: `runtime périmé : ${unite} tourne sur le code d'avant — ${lu.enService === null ? `il n'a pas laissé l'empreinte de son code en démarrant, il date d'avant celui qui est installé (${sources})` : `${sources} a changé depuis son démarrage`}`,
    geste: `${basculer(lu.clone, lu.projet)} — ${DOC_DE_LA_MISE_A_JOUR}`,
  };
}

// Le seul geste qui met un runtime à jour : la bascule, lancée du clone.
const basculer = (runtime: string, projet: string) =>
  `\`sudo ${join(runtime, "deploy/brigade-bascule")} ${projet}\`, au moment que tu choisis : ses cooks en vol sont interrompus, et leurs tickets repris par des cooks neufs`;
const court = (commit: string) => commit.slice(0, 12);

// Là où la bascule pose les versions d'un projet, lu dans le répertoire de
// travail de son instance : `<versions>/en-service/runtime` une fois basculé,
// sinon le `runtime/` du clone, dont les versions sont à côté.
function versionsDe(travail: string, projet: string): { versions: string; bascule: boolean } {
  if (basename(dirname(travail)) === "en-service") return { versions: dirname(dirname(travail)), bascule: true };
  return { versions: join(`${dirname(travail)}-versions`, projet), bascule: false };
}

// Où en est la bascule du projet (`deploy/brigade-bascule`). `travail` : le
// répertoire où l'unité lance son runtime, ou null si systemd ne le dit pas ;
// `rendu` : ce que la dernière bascule a laissé ; `attend` : le clone porte un
// runtime que le projet ne sert pas — null s'il ne se lit pas.
export function jugerBascule(lu: { unite: string; projet: string; travail: string | null; rendu: Record<string, string>; attend: boolean | null }): Array<Pick<Constat, "etat" | "texte" | "geste">> {
  const { unite, projet, rendu } = lu;
  if (lu.travail === null) return [];
  const { versions, bascule } = versionsDe(lu.travail, projet);
  const servie = rendu["en-service"];
  const juges: Array<Pick<Constat, "etat" | "texte" | "geste">> = [];
  if (rendu.refusee) {
    juges.push({
      etat: "note",
      texte: `bascule revenue : ${court(rendu.refusee)} n'a pas démarré pour ${unite} — ${rendu.motif || "sans motif noté"} ; ${bascule && servie ? `${court(servie)} est restée en service` : "le projet est resté sur le clone"}`,
      geste: `ce que l'essai a écrit : ${join(versions, "essai.journal")} ; une version corrigée se bascule par le même geste — ${DOC_DE_LA_MISE_A_JOUR}`,
    });
  }
  if (!bascule) {
    juges.push({
      etat: "note",
      texte: `pas encore basculé : ${unite} tourne sur le clone partagé (${lu.travail}) — une mise à jour du clone change le code sous lui, et rien ne le ramène à la version d'avant si la nouvelle ne démarre pas`,
      geste: `${basculer(lu.travail, projet)} — ${DOC_DE_LA_MISE_A_JOUR}`,
    });
  } else if (rendu.refusee) {
    // La version du clone est celle qui vient d'être refusée : elle n'attend pas.
  } else if (lu.attend) {
    juges.push({
      etat: "note",
      texte: `une version attend : le clone (${rendu.clone}) porte un runtime que ${unite} ne sert pas — en service : ${servie ? court(servie) : "inconnue"}`,
      geste: `${basculer(join(rendu.clone ?? "", "runtime"), projet)} — ${DOC_DE_LA_MISE_A_JOUR}`,
    });
  } else {
    juges.push({ etat: "ok", texte: `version en service : ${servie ? court(servie) : "inconnue"} pour ${unite} — ${lu.attend === null ? "le clone ne se lit pas, elle ne lui est pas comparée" : `celle du clone (${rendu.clone})`}` });
  }
  return juges;
}

// Le répertoire de `chemin` où `bin` se lance, ou null. Un binaire désigné par
// un chemin ne se cherche pas : il y est, ou non.
function trouver(bin: string, chemin: string): string | null {
  const executable = (fichier: string) => {
    try {
      accessSync(fichier, constants.X_OK);
      return statSync(fichier).isFile();
    } catch {
      return false;
    }
  };
  if (bin.includes(sep)) return executable(bin) ? dirname(bin) : null;
  return chemin.split(delimiter).find((repertoire) => repertoire !== "" && executable(join(repertoire, bin))) ?? null;
}

// Ce que vaut un répertoire temporaire de `claude` qui n'est pas au compte :
// `claude` refuse de s'en servir (« Temp directory … is owned by uid …
// Refusing to use it »). `prive` : l'unité a son propre /tmp, et ses cooks ne
// voient pas celui-là.
export function jugerTemporaire(lu: { repertoire: string; proprietaire: number; uid: number; prive: boolean }): Pick<Constat, "etat" | "texte" | "geste"> {
  const { repertoire, uid } = lu;
  const constat = `le répertoire temporaire de \`claude\` (${repertoire}) n'est pas au compte (uid ${lu.proprietaire}, attendu ${uid})`;
  return {
    etat: lu.prive ? "note" : "manque",
    texte: lu.prive
      ? `${constat} : les cooks ne le voient pas, l'unité a son propre /tmp (\`PrivateTmp\`) — mais un \`claude\` lancé à la main sous ce compte refuse de s'y lancer, la connexion Max comprise`
      : `${constat} : \`claude\` refuse de s'y lancer, chaque cook échouerait`,
    geste: `\`sudo chown -R ${uid} ${repertoire}\` s'il n'est à personne d'autre (\`ls -ld ${repertoire}\`) ; sinon \`Environment=CLAUDE_CODE_TMPDIR=<répertoire du compte>\` dans le drop-in de l'unité, et la même variable dans le shell de la connexion Max — ${DOC_DE_LA_BOX}`,
  };
}

// Le réglage du geste d'installation de la box, tel que le geste le lit au
// moment d'installer : la même lecture (`lireReglage`) et le même contrôle de
// propriété du chemin (`ouvertDe`), joués avant qu'un chef n'essaie.
// Absent, ce n'est qu'à savoir : une box qui ne sert pas d'app n'en a pas
// besoin. Présent et faux, c'est un manque.
export const REGLAGE_DU_GESTE = { config: "/etc/brigade-installer.conf", racine: 0, sol: "/" };

export function jugerReglageDuGeste(box: { config: string; racine: number; sol: string } = REGLAGE_DU_GESTE): Pick<Constat, "etat" | "texte" | "geste"> {
  const { config } = box;
  const doc = `${DOC}, « Le geste d'installation »`;
  const poser = `\`sudo install -d <racine des sauvegardes>\` puis \`printf 'sauvegardes=<racine des sauvegardes>\\n' | sudo tee ${config}\` — ${doc}`;
  if (lstatSync(config, { throwIfNoEntry: false }) === undefined) {
    return { etat: "note", texte: `pas de réglage du geste d'installation (${config}) : cette box n'ajoute pas de projet depuis l'app — sans lui, aucune destination de sauvegarde n'y est acceptée`, geste: `si elle doit en servir une : ${poser}` };
  }
  let racine: string;
  try {
    racine = lireReglage(box).sauvegardes;
  } catch (erreur) {
    if (erreur instanceof Refus) {
      // Le geste dit déjà comment le régler, après son dernier « — » ou son « : ».
      const [, commande] = /[—:] (`.*`)$/.exec(erreur.message) ?? [];
      return { etat: "manque", texte: erreur.message, geste: `${commande ?? `corriger ${config}, à root`} — ${doc}` };
    }
    return { etat: "manque", texte: `le réglage du geste d'installation (${config}) ne se lit pas : ${message(erreur)}`, geste: `le rendre lisible par tous, à root : \`sudo chown root:root ${config} && sudo chmod 644 ${config}\` — ${doc}` };
  }
  const lu = lstatSync(racine, { throwIfNoEntry: false });
  if (lu === undefined) {
    return { etat: "manque", texte: `la racine des sauvegardes (${racine}, déclarée dans ${config}) n'existe pas : le geste refuserait chaque projet`, geste: `\`sudo install -d ${racine}\` — ${doc}` };
  }
  const ouvert = ouvertDe(box, racine);
  if (ouvert !== null) {
    const { chemin, proprietaire } = ouvert;
    const detail = ouvert.mode === undefined ? ouvert.raison : `${chemin} appartient à l'uid ${proprietaire} (mode ${ouvert.mode})`;
    return {
      etat: "manque",
      texte: `la racine des sauvegardes (${racine}, déclarée dans ${config}) passe par un répertoire que root ne tient pas seul : ${detail} — le geste refuserait chaque projet, « root n'y crée rien »`,
      geste: ouvert.mode === undefined
        ? `remplacer ${chemin} par un répertoire de root (\`ls -ld ${chemin}\`), ou déclarer une autre racine dans ${config} — ${doc}`
        : `le remettre à root, s'il n'est à personne d'autre (\`ls -ld ${chemin}\`) : \`sudo chown root:root ${chemin} && sudo chmod go-w ${chemin}\` — ${doc}`,
    };
  }
  return { etat: "ok", texte: `réglage du geste d'installation : ${config} — racine des sauvegardes ${racine}, tenue par root seul` };
}

// La connexion Max telle que le journal la tient — la phrase de `run station`,
// ou null si rien n'y dit qu'elle est tombée (ou s'il n'y a pas de journal à
// lire : un projet qui n'a jamais démarré n'a aucun lancement à relire).
function connexionTombee(env: NodeJS.ProcessEnv): string | null {
  const etat = env.BRIGADE_STATE_DIR;
  if (!etat || !existsSync(cheminJournal(etat))) return null;
  let journal;
  try {
    journal = ouvrirJournal(etat, { lectureSeule: true });
  } catch {
    return null;
  }
  try {
    for (const station of stationsDeconnectees(journal.base)) {
      const lue = etatStation(journal.base, station);
      if (lue?.disconnectedAt) return `${station} : ${direConnexionTombee(lue)}`;
    }
  } catch {
    // Un journal d'avant la station n'a pas ses tables : rien à en lire.
  } finally {
    journal.fermer();
  }
  return null;
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
  // Le fichier de secrets se lit contre l'état et le clone : sans eux, c'est
  // leur absence qui est dite.
  if (env.BRIGADE_STATE_DIR && env.BRIGADE_REPO_DIR) {
    try {
      configSecrets(env, { repertoireEtat: env.BRIGADE_STATE_DIR, clone: env.BRIGADE_REPO_DIR });
    } catch (erreur) {
      if (!(erreur instanceof ConfigInvalide)) throw erreur;
      refus.push(erreur.message);
    }
    // La cloison aussi : elle doit couvrir l'un et l'autre.
    try {
      configCloison(env, { repertoireEtat: env.BRIGADE_STATE_DIR, clone: env.BRIGADE_REPO_DIR });
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
  // Le point d'entrée du runtime le refuserait avant tout lecteur.
  if (env.BRIGADE_PROJECT && !NOM_DE_PROJET.test(env.BRIGADE_PROJECT)) {
    dits.add(`nom de projet invalide : « ${env.BRIGADE_PROJECT} » (BRIGADE_PROJECT) — attendu un identifiant court en minuscules, chiffres et tirets (brigade, thermigo)`);
  }
  for (const texte of dits) noter("machine", "manque", texte, dropIn);
  if (dits.size === 0) noter("machine", "ok", `les ${VARIABLES.length} variables obligatoires sont posées, et tout ce que le runtime lit de son environnement est lisible`);
  // Les stations : le runtime démarre sans, mais rien n'y est servi. Une
  // déclaration mal écrite est déjà dite, avec les refus.
  if (!env[VARIABLE_DES_STATIONS]?.trim()) {
    noter("machine", "manque", `aucune station déclarée (${VARIABLE_DES_STATIONS} n'est pas défini) : le runtime démarre, mais aucun cook ne partirait — les tickets resteraient en attente`, `${GESTE_DE_STATION} — ${dropIn}`);
  }

  const etat = env.BRIGADE_STATE_DIR;
  if (etat && existsSync(etat)) {
    try {
      accessSync(etat, constants.W_OK);
      noter("machine", "ok", `répertoire d'état : ${etat}`);
    } catch {
      noter("machine", "manque", `le répertoire d'état ${etat} n'est pas inscriptible par ce compte`, "lancer cette commande sous le compte du service, ou lui rendre le répertoire (`chown`)");
    }
  }

  // --- La machine : le clone réservé, et la base telle que son origine la porte.
  const clone = env.BRIGADE_REPO_DIR;
  const base = env.BRIGADE_BASE_BRANCH;
  const depotGitHub = env.BRIGADE_GITHUB_REPO;
  // Sans invite : une origine qui réclame un mot de passe est une origine qui
  // ne répond pas, pas une commande qui attend.
  const git = (...args: string[]) => lancer("git", args, { cwd: clone, env: { ...env, GIT_TERMINAL_PROMPT: "0" } });
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

  // --- La machine : l'identité sous laquelle un cook commite. `git var` la
  // refuse exactement là où `git commit` la refuserait.
  const identite = await lancer("git", ["var", "GIT_COMMITTER_IDENT"], { ...(clone && existsSync(clone) ? { cwd: clone } : {}), env });
  if (identite.code !== 0 && !identite.introuvable) {
    noter(
      "machine",
      "manque",
      `ce compte n'a pas d'identité git : un cook ne pourrait rien commiter (${identite.stderr.trim().split("\n")[0] || "`git var GIT_COMMITTER_IDENT` échoue"})`,
      `sous le compte du service : \`git config --global user.name <nom>\` et \`git config --global user.email <adresse>\` — ${DOC_DE_LA_BOX}`,
    );
  }

  // --- La machine : la session Max, et l'unité de service.
  const claude = env.BRIGADE_CLAUDE_BIN || "claude";
  const session = await sessionClaude(claude, env);
  // Ce que `claude auth status` dit d'un identifiant stocké ne dit pas qu'une
  // session est valide : le dernier lancement réel, lui, est au journal — et la
  // station le tient pour ce qu'il est.
  const tombee = connexionTombee(env);
  if (tombee !== null) {
    noter("machine", "manque", `session Max : la station la dit ${tombee}`, GESTE_DE_CONNEXION);
  } else if (session === "connectee") {
    noter("machine", "ok", "session Max : `claude` est connecté sous ce compte — un identifiant stocké, pas une session éprouvée : seul un lancement réel le dit, et le journal n'y porte aucun échec d'authentification");
  } else if (session === "inconnue") noter("machine", "note", "session Max : `claude auth status` n'a rien dit de lisible — le premier cook tranchera");
  else {
    noter(
      "machine",
      "manque",
      session === "introuvable" ? "pas de session Max : le binaire `claude` est introuvable sous ce compte" : "pas de session Max : `claude` n'est pas connecté sous ce compte",
      "installer le binaire officiel et s'y connecter sous le compte du service (`claude`, puis `/login`)",
    );
  }

  const systemctl = env.BRIGADE_SYSTEMCTL_BIN || "systemctl";
  // Vrai : l'unité a son propre /tmp (la cloison le pose).
  let tmpPrive = false;
  const installee = await lancer(systemctl, ["cat", unite], { env });
  if (installee.introuvable) noter("machine", "note", `pas de systemd sur cette machine : l'unité ${unite} n'est pas vérifiée`);
  else if (installee.code !== 0) {
    noter("machine", "manque", `l'unité ${unite} n'est pas installée`, `\`sudo cp runtime/deploy/brigade@.service /etc/systemd/system/ && sudo systemctl daemon-reload\` — ${DOC}`);
  } else {
    noter("machine", "ok", `unité de service : ${unite}`);
    // Le runtime lance `claude` par son nom, dans le `PATH` que l'unité lui
    // donne : celui du shell qui lance cette commande n'en dit rien.
    const donne = lireUnite((await lancer(systemctl, ["show", ...PROPRIETES.flatMap((propriete) => ["-p", propriete]), unite], { env })).stdout);
    tmpPrive = donne.tmpPrive;
    const chemin = donne.chemin ?? PATH_DE_SYSTEMD;
    if (trouver(claude, chemin) === null) {
      // Là où il est sous ce compte : dans son `PATH`, ou là où l'installeur
      // natif le pose.
      const pose = trouver(claude, [env.PATH ?? "", join(env.HOME || homedir(), ".local/bin")].join(delimiter)) ?? "<répertoire de claude>";
      noter(
        "machine",
        "manque",
        `\`claude\` est introuvable dans le \`PATH\` que l'unité ${unite} donnera au runtime (${chemin}${donne.chemin === null ? ", le défaut de systemd : aucun `Environment=PATH=` dans ses drop-ins" : ""}) : aucun cook ne partirait — le \`PATH\` du shell qui lance cette commande ne compte pas`,
        // Sous le `PATH` de systemd, un lien suffit, et vaut pour tous les
        // projets de la box ; un `PATH` posé par un drop-in se corrige là.
        donne.chemin === null
          ? `\`sudo ln -sfn ${join(pose, claude)} /usr/local/bin/${claude}\` — l'installeur natif pose \`claude\` sous \`~/.local/bin\` du compte, que systemd ne donne pas à l'unité ; ${DOC_DE_LA_BOX}`
          : `\`sudo systemctl edit ${unite}\`, puis \`[Service]\` et \`Environment=PATH=${pose}:${chemin}\` ; ${DOC_DE_LA_BOX}`,
      );
    }
    const minuteur = `brigade-sauvegarde@${projet}.timer`;
    if ((await lancer(systemctl, ["is-enabled", minuteur], { env })).code !== 0) {
      noter("machine", "note", `la sauvegarde n'est pas programmée (${minuteur}) : rien ne garde le journal de ce projet`, DOC_DU_PROJET);
    }
    // Le clone fait foi pour ce qui vaut pour toute la box — les unités, et la
    // bascule elle-même. Un projet basculé lance cette commande depuis la
    // version qu'il sert : son clone est celui que sa bascule a noté.
    const versions = donne.travail === null ? null : versionsDe(donne.travail, projet);
    const rendu = versions === null ? {} : lireCompteRendu(versions.versions);
    const runtimeDuClone = versions?.bascule && rendu.clone ? join(rendu.clone, "runtime") : join(SOURCES, "..");
    const deploiement = join(runtimeDuClone, "deploy");
    // La box à jour : ses copies face au dépôt, et le runtime face au code
    // installé. Les unités sont posées là d'où systemd charge celle-ci.
    if (donne.fragment === null) noter("machine", "note", `unités non comparées à celles du dépôt (${deploiement}) : systemd ne dit pas d'où ${unite} est chargée`);
    else if (donne.masquee || donne.fragment === "/dev/null") noter("machine", "note", `unités non comparées à celles du dépôt (${deploiement}) : ${unite} est masquée, aucune copie à lire`);
    else {
      const posees = dirname(donne.fragment);
      const jugees = jugerUnites({ posees, depot: deploiement, unite, copies: lireCopies(posees, unite, deploiement) });
      noter("machine", jugees.etat, jugees.texte, jugees.geste);
    }
    if (etat && existsSync(etat)) {
      const juge = jugerCode({ unite, projet, clone: runtimeDuClone, sources: SOURCES, etat: donne.etat, enService: lireCodeEnService(etat), installe: empreinteDuCode() });
      noter("machine", juge.etat, juge.texte, juge.geste);
    }
    // La bascule : le projet a-t-il sa version à lui, la dernière est-elle
    // revenue, le clone en porte-t-il une qu'il ne sert pas.
    if (donne.travail !== null) {
      let attend: boolean | null = null;
      try {
        if (rendu.clone) attend = empreinteDuCode(join(rendu.clone, "runtime/src")) !== empreinteDuCode(join(donne.travail, "src"));
      } catch {
        // Le clone ou la version ne se lit pas d'ici : rien n'est comparé.
      }
      for (const juge of jugerBascule({ unite, projet, travail: donne.travail, rendu, attend })) noter("machine", juge.etat, juge.texte, juge.geste);
    }
  }

  // `claude` range ses fichiers temporaires sous son propre nom, par uid, et
  // refuse un répertoire qui n'est pas au compte. Sous `CLAUDE_CODE_TMPDIR`,
  // le /tmp de l'unité n'y change rien.
  const uid = process.getuid?.();
  const temporaire = join(env.CLAUDE_CODE_TMPDIR || "/tmp", `claude-${uid}`);
  let proprietaire: number | undefined;
  try {
    proprietaire = statSync(temporaire, { throwIfNoEntry: false })?.uid;
  } catch {
    // Illisible d'ici : `claude` le dira lui-même.
  }
  if (uid !== undefined && proprietaire !== undefined && proprietaire !== uid) {
    const { etat: gravite, texte, geste } = jugerTemporaire({ repertoire: temporaire, proprietaire, uid, prive: tmpPrive && !env.CLAUDE_CODE_TMPDIR });
    noter("machine", gravite, texte, geste);
  }

  // Le réglage du geste d'installation : c'est ici que se dit une racine que
  // le geste refuserait, avant que le chef n'ajoute un projet depuis l'app.
  // `BRIGADE_INSTALLER_CONFIG` sert aux tests, qui n'ont pas de root : le
  // réglage qu'ils posent est tenu par le compte qui les joue, et la box qu'il
  // décrit commence là où il est posé.
  const posee = env.BRIGADE_INSTALLER_CONFIG;
  const reglage = jugerReglageDuGeste(posee ? { ...REGLAGE_DU_GESTE, config: posee, racine: process.getuid?.() ?? REGLAGE_DU_GESTE.racine, sol: dirname(posee) } : REGLAGE_DU_GESTE);
  noter("machine", reglage.etat, reglage.texte, reglage.geste);

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
      const dit = JSON.parse(lu.corps) as { permissions?: { push?: boolean }; security_and_analysis?: { secret_scanning_push_protection?: { status?: string } } };
      // Sans droit d'écrire, ni push ni merge. GitHub ne dit `permissions`
      // qu'à un compte : absent, rien n'en est conclu.
      if (dit.permissions?.push === false) {
        noter("github", "manque", `\`gh\` lit ${depot} sous ce compte, sans le droit d'y pousser : aucune livraison ne partirait, aucune PR ne serait mergée`, "donner à ce compte le droit d'écrire sur le dépôt (rôle Write)");
      } else noter("github", "ok", `dépôt lu par \`gh\` : ${depot}`);
      // La seconde barrière contre des identifiants livrés. GitHub ne rend son
      // état qu'à qui administre le dépôt.
      const barriere = dit.security_and_analysis?.secret_scanning_push_protection?.status;
      if (barriere !== "enabled") {
        noter(
          "github",
          "note",
          `la push protection de GitHub n'est pas constatée sur ${depot} (GitHub en dit : ${barriere === undefined ? "rien, ce compte n'administre pas le dépôt" : `\`${barriere}\``}) : la station reste la seule barrière contre une livraison qui porterait des identifiants`,
          DOC_DU_PROJET,
        );
      }
      const presents = await labelsDuDepot(gh, env, depot);
      const absents = LABELS.map(({ name }) => name).filter((nom) => !presents.includes(nom.toLowerCase()));
      if (absents.length === 0) noter("github", "ok", `labels : les ${LABELS.length} y sont`);
      else noter("github", "manque", `labels absents du dépôt : ${absents.join(", ")}`, "la même commande, suivie de `labels`");
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
    if (existants.includes(label.name.toLowerCase())) {
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
// cook — secrets du projet compris, et dans sa cloison —, sous la moitié du bail. Aucun cook n'est
// lancé, et le worktree est retiré — pas ce que le setup aurait posé ailleurs
// (une base de test). Sans les secrets que le dépôt déclare, il n'est pas joué :
// la station ne lancerait rien non plus.
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
    const secrets = lireSecrets(worktree, configSecrets(env, { repertoireEtat: etat, clone }));
    if (!secrets.pret) {
      const sortie = ["secrets du projet indisponibles — la station ne lancerait aucun cook (86 `secrets-unavailable`) :", ...secrets.problemes].join("\n");
      return { sha, joue: true, pret: false, dureeMs: 0, avantOctets, apresOctets: avantOctets, sortie };
    }
    const debut = Date.now();
    const setup = await jouerSetup({ worktree, ticket: TICKET_DE_SONDE, env: { ...environnementCook(env), ...secrets.env }, masquer: secrets.masquer, cloison: configCloison(env, { repertoireEtat: etat, clone }), delaiMs: dureeBailMs * PART_DU_SETUP });
    const dureeMs = Date.now() - debut;
    return { sha, joue: setup.pret ? setup.joue : true, pret: setup.pret, dureeMs, avantOctets, apresOctets: poids(worktree), sortie: setup.sortie };
  } finally {
    depot.jeter(SONDE);
  }
}

export type Tenue = {
  // Le setup, mesuré seul, face à la moitié du bail.
  setup: { plafondMs: number; tient: boolean };
  // De combien le dernier cook part après le premier : les vagues de setups
  // qui passent avant la sienne.
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
  return { setup, entree: { vagues, dernierMs: (vagues - 1) * mesure.dureeMs }, disque, tient: setup.tient && disque.tient };
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
  // Les worktrees de cooks encore sous le répertoire d'état.
  worktrees: number;
  // Ce que le clone et ses worktrees portent et que l'origine n'a pas —
  // commits, remises, fichiers non commités : cela partirait avec eux.
  perdus: string[];
};

// Vrai si `chemin` est `parent` ou vit dessous, liens résolus.
function dedans(chemin: string, parent: string): boolean {
  const reel = (lu: string) => (existsSync(lu) ? realpathSync(lu) : resolve(lu));
  const relatif = relative(reel(parent), reel(chemin));
  return relatif === "" || (relatif !== ".." && !relatif.startsWith(`..${sep}`) && !isAbsolute(relatif));
}

// Retire ce que brigade a posé sur la machine pour ce projet et qui appartient
// au compte du service : le clone réservé et les worktrees. Sans `confirme`,
// ne fait que le dire. Confirmée, elle refuse tant que le clone porte quelque
// chose que l'origine n'a pas. Ni l'origine, ni le journal, ni l'unité de
// service ne sont touchés. Rejouable.
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
      // Sans leur clone, ces worktrees ne sont plus lisibles par git : ce
      // qu'ils portent ne peut pas être inventorié.
      const restes = existsSync(worktrees);
      if (confirme) rmSync(worktrees, { recursive: true, force: true });
      return { retire: confirme && restes, clone: null, worktrees: accroches, perdus: [] };
    }
    const git = (...args: string[]) => execFileSync("git", args, { cwd: clone, env, encoding: "utf8", stdio: ["ignore", "pipe", "pipe"] });
    const lignes = (...args: string[]) => git(...args).split("\n").filter(Boolean);
    // `--git-dir` vaut `.git` à la racine d'un clone, et rien d'autre : un
    // sous-répertoire d'un dépôt n'est pas un clone.
    let racine = false;
    try {
      racine = git("rev-parse", "--git-dir").trim() === ".git";
    } catch {}
    if (!racine) throw new InstallationRefusee(`${clone} n'est pas un clone git : rien n'est retiré`);
    if (dedans(etat, clone)) {
      throw new InstallationRefusee(`le répertoire d'état ${etat} est dans le clone ${clone} : le retirer emporterait le journal — rien n'est retiré`);
    }

    // Les commits de toutes les têtes — branches, têtes détachées du clone et
    // de ses worktrees — que l'origine n'a pas ; les remises ; et ce qui n'est
    // pas commité, dans le clone et dans chaque worktree encore là.
    const arbres = lignes("worktree", "list", "--porcelain")
      .flatMap((ligne) => (ligne.startsWith("worktree ") ? [ligne.slice("worktree ".length)] : []))
      .filter((arbre) => existsSync(arbre));
    const perdus = [
      ...lignes("log", "--exclude=refs/stash", "--all", "--not", "--remotes", "--format=%h %s").map((commit) => `commit jamais poussé : ${commit}`),
      ...lignes("stash", "list").map((remise) => `remise : ${remise}`),
      ...arbres.flatMap((arbre) => lignes("-C", arbre, "status", "--porcelain", "--untracked-files=all").map((fichier) => `non commité dans ${arbre} : ${fichier.slice(3)}`)),
    ];
    if (confirme && perdus.length > 0) {
      throw new InstallationRefusee(
        [`le clone ${clone} porte ce que l'origine n'a pas — pousse-le, ou défais-le, puis rejoue ; rien n'est retiré :`, ...perdus.map((perdu) => `  ${perdu}`)].join("\n"),
      );
    }
    if (confirme) {
      rmSync(worktrees, { recursive: true, force: true });
      rmSync(clone, { recursive: true, force: true });
    }
    return { retire: confirme, clone, worktrees: accroches, perdus };
  } finally {
    verrou?.relacher();
  }
}
