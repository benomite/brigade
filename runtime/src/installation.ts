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
import { deduireLesHotes } from "./reseau-cli.ts";
import { DECLARATION_RESEAU, lireDeclaration } from "./reseau.ts";
import { execFile, execFileSync } from "./sans-invite.ts";
import { accessSync, constants, existsSync, lstatSync, readdirSync, readFileSync, realpathSync, rmSync, statSync } from "node:fs";
import { homedir, userInfo } from "node:os";
import { delimiter, dirname, isAbsolute, join, relative, resolve, sep } from "node:path";
import { configRail } from "./alimenter.ts";
import { EFFORTS, MODELES } from "./calibrage.ts";
import { environnementCook, sessionClaude } from "./claude.ts";
import { configJeton, environnementClaude } from "./jeton-claude.ts";
import { configCloison } from "./cloison.ts";
import { SOURCES } from "./code.ts";
import { ouvrirDepot, worktreesDuProjet } from "./depot.ts";
import { cheminJournal, ouvrirJournal } from "./journal.ts";
import { lireSeuils } from "./derive.ts";
import { lireReglages } from "./garde-fous.ts";
import { jouerSetup, SCRIPT_GATES, SCRIPT_SETUP } from "./gates.ts";
import { lireReglage, ouvertDe, Refus } from "./installateur.ts";
import { LABEL } from "./github.ts";
import { POSABLES } from "./poser-decisions.ts";
import { ETAPES } from "./etapes.ts";
import { DECISIONS, decisionsDansLEnvironnement, environnementDecide, gesteDe, lireLesDecisions, type Decision } from "./decisions.ts";
import { configManager } from "./manager.ts";
import { configPass } from "./pass.ts";
import { clientGh, constater, lire as lireLaProtection } from "./proteger-branche.ts";
import { configReviewer } from "./reviewer.ts";
import { lireLeDepot, type DepotDuProjet } from "./reglages-projet/en-vigueur.ts";
import { ConfigInvalide, NOM_DE_PROJET } from "./runtime.ts";
import { configSecrets, lireSecrets } from "./secrets.ts";
import { configStation } from "./station.ts";
import { sonderRenouvellement, systemdReel, type EtatDuRenouvellement, type Systemd } from "./sonde-renouvellement.ts";
import { GESTE_DE_STATION, VARIABLE_DES_STATIONS } from "./stations-declarees.ts";
import { direConnexionTombeeEn, etatStation, GESTE_DE_CONNEXION_TOMBEE_EN, stationsDeconnectees } from "./projections/stations.ts";
import { prendreVerrou, VerrouTenu } from "./verrou.ts";

// Les variables sans lesquelles le runtime refuse de démarrer.
export const VARIABLES = [
  "BRIGADE_STATE_DIR",
  "BRIGADE_PROJECT",
  "BRIGADE_GITHUB_REPO",
  "BRIGADE_REPO_DIR",
  "BRIGADE_BASE_BRANCH",
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
// à savoir, sans rien retenir. `geste` : ce qui le règle. `etape` : l'étape
// de l'installation (`etapes.ts`) à reprendre pour le régler — tout manque en
// nomme une, rien d'autre n'en nomme. `simple` et `remede`, sur un manque
// seulement : ce qu'il dit au chef en mots simples, et qui le lève et comment
// — ce que le verdict structuré (`verdict.ts`) en rend à l'app.
export type Constat = { ou: "machine" | "depot" | "github"; etat: "ok" | "manque" | "note"; texte: string; geste?: string; etape?: string; simple?: string; remede?: Remede };

// Les étapes de l'installation que l'app fait elle-même, d'un bouton
// (app/src/service.ts : `amorcer`, `declarerStations`, `proteger`, `repondre`) :
// un manque qui s'y lève y renvoie, sans commande à taper.
// L'unité unique que pose le paquet brigade-station, à la place de celle de chaque projet.
const UNITE_DE_LA_STATION = "brigade-station.service";

export const ACTIONS_DE_L_APP = ["init", "stations", "protection", "decisions"] as const;
export type ActionDeLApp = (typeof ACTIONS_DE_L_APP)[number];
// Qui lève un manque, et comment : le chef, d'un bouton de l'app ou par la
// commande exacte à lancer ; ou brigade, seule, sans rien demander.
export type Remede = { qui: "chef"; action: ActionDeLApp } | { qui: "chef"; commande: string } | { qui: "brigade" };
// Ce qu'un juge rend d'un constat : sa ligne, son geste, et pour un manque ce
// qu'il dit au chef.
type Juge = Pick<Constat, "etat" | "texte" | "geste" | "simple" | "remede">;
const parLeChef = (commande: string): Remede => ({ qui: "chef", commande });
const dansLApp = (action: ActionDeLApp): Remede => ({ qui: "chef", action });

// Les étapes que les manques nomment, chacune une fois, dans l'ordre de
// l'installation : celles à reprendre pour que « Vérifier » soit vert.
export function etapesAReprendre(constats: Constat[]): string[] {
  const nommees = new Set(constats.flatMap((constat) => (constat.etat === "manque" && constat.etape !== undefined ? [constat.etape] : [])));
  return ETAPES.map((etape) => etape.id).filter((id) => nommees.has(id));
}

const DOC = "docs/installer.md";
// Ce qui se règle une fois par box, et ce qui se règle par projet.
const DOC_DE_LA_BOX = `${DOC}, “Préparer la box”`;
const DOC_DU_PROJET = `${DOC}, “Déclarer le projet”`;
const DOC_DE_LA_MISE_A_JOUR = `${DOC}, “Mettre brigade à jour”`;
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
  if (!statut) throw new Error(stderr.trim() || "unreadable response");
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

// Le compte qui lance la vérification — celui du service, quand elle est
// lancée comme il faut : c'est à lui qu'un répertoire se rend.
const compte = () => {
  try {
    return userInfo().username;
  } catch {
    return "<service account>";
  }
};

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
// /tmp, et le fichier d'où elle est chargée.
const PROPRIETES = ["Environment", "PrivateTmp", "FragmentPath", "LoadState"];
function lireUnite(sortie: string): { chemin: string | null; tmpPrive: boolean; fragment: string | null; masquee: boolean } {
  const proprietes = new Map(sortie.split("\n").map((ligne): [string, string] => [ligne.split("=", 1)[0] ?? "", ligne.slice(ligne.indexOf("=") + 1)]));
  const chemin = (proprietes.get("Environment") ?? "").split(/\s+/).findLast((affectation) => affectation.startsWith("PATH="));
  return {
    chemin: chemin?.slice("PATH=".length) ?? null,
    tmpPrive: proprietes.get("PrivateTmp") === "yes",
    fragment: proprietes.get("FragmentPath") || null,
    masquee: proprietes.get("LoadState") === "masked",
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
export function jugerUnites(lu: { posees: string; depot: string; unite: string; copies: Copie[] }): Juge {
  const { posees, depot } = lu;
  const nonComparees = (pourquoi: string) => ({ etat: "note" as const, texte: `units not compared with the repository's (${depot}): ${pourquoi}` });
  if (realpathOuTel(posees) === realpathOuTel(depot)) return nonComparees(`systemd loads ${lu.unite} from the repository itself (${posees}), which would be compared with itself`);
  if (lu.copies.length === 0) return nonComparees(`no copy is installed under ${posees}`);
  const perimees = lu.copies.filter((copie) => !copie.identique).map((copie) => copie.nom);
  if (perimees.length === 0) {
    return { etat: "ok", texte: `units up to date: nothing installed under ${posees} differs from the repository (${depot}) — ${lu.copies.map((copie) => copie.nom).join(", ")}` };
  }
  const gestes = [
    // Les unités se recopient telles quelles, toutes ; la cloison porte les
    // réglages du chef.
    ...(perimees.some((nom) => nom !== CLOISON) ? [`\`sudo cp ${depot}/*.service ${depot}/*.timer ${posees}/\``] : []),
    ...(perimees.includes(CLOISON)
      ? [`copy \`${join(depot, CLOISON)}\` over \`${cloisonPosee(posees, lu.unite)}\` carrying your settings over (\`BRIGADE_SANDBOX_HIDDEN\`, \`BRIGADE_SANDBOX_PRIVATE\`)`]
      : []),
  ];
  return {
    etat: "note",
    texte: `units out of date: ${perimees.join(", ")} — what is installed under ${posees} differs from the repository (${depot}), and systemd runs what is installed`,
    geste: `${gestes.join("; ")}; then \`sudo systemctl daemon-reload\`, then \`sudo systemctl restart brigade@<project>.service\` for each project: they apply to the whole box — ${DOC_DE_LA_MISE_A_JOUR}`,
  };
}

// Les hôtes que le setup du projet joint (registres des installeurs connus,
// URLs de dépendances) face à `.claude/brigade/reseau`. Un fichier absent
// compte comme une déclaration vide. `null` : le setup n'ouvre rien à déclarer.
export function jugerReseau(lu: { setup: string; declaration: string | null }): Juge {
  const requis = deduireLesHotes(lu.setup).hotes.map(({ hote }) => hote);
  const declares = lu.declaration === null ? [] : lireDeclaration(lu.declaration).hotes;
  const manquants = requis.filter((hote) => !declares.includes(hote));
  if (manquants.length === 0) {
    return { etat: "ok", texte: requis.length === 0 ? `network: the setup needs no host outside the base set` : `network: the ${requis.length} hosts of the setup are declared in \`${DECLARATION_RESEAU}\`` };
  }
  return {
    etat: "manque",
    texte: `network: the setup reaches ${manquants.join(", ")}, ${lu.declaration === null ? `and \`${DECLARATION_RESEAU}\` is absent` : `missing from \`${DECLARATION_RESEAU}\``} — under the partition, a cook's setup would fail there`,
    geste: `add ${manquants.length > 1 ? "these hosts" : "this host"} to \`${DECLARATION_RESEAU}\` (\`/brigade:init\` does it), committed on the integration branch`,
    simple: `the repository's setup downloads from ${manquants.length > 1 ? "addresses the repository does not declare" : "an address the repository does not declare"} (${manquants.join(", ")}): it would fail for every cook`,
    remede: dansLApp("init"),
  };
}

// Le répertoire de `chemin` où `bin` se lance, ou null. Un binaire désigné par
// un chemin ne se cherche pas : il y est, ou non.
export function trouver(bin: string, chemin: string): string | null {
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
export function jugerTemporaire(lu: { repertoire: string; proprietaire: number; uid: number; prive: boolean }): Juge {
  const { repertoire, uid } = lu;
  const constat = `the temporary directory of \`claude\` (${repertoire}) does not belong to the account (uid ${lu.proprietaire}, expected ${uid})`;
  return {
    ...(lu.prive ? {} : { simple: `the temporary folder of \`claude\` (${repertoire}) belongs to another account: every cook would fail`, remede: parLeChef(`sudo chown -R ${uid} ${repertoire}`) }),
    etat: lu.prive ? "note" : "manque",
    texte: lu.prive
      ? `${constat}: cooks do not see it, the unit has its own /tmp (\`PrivateTmp\`) — but a \`claude\` started by hand under this account refuses to run there, the Max connection included`
      : `${constat}: \`claude\` refuses to run there, every cook would fail`,
    geste: `\`sudo chown -R ${uid} ${repertoire}\` if it belongs to nobody else (\`ls -ld ${repertoire}\`); otherwise \`Environment=CLAUDE_CODE_TMPDIR=<account directory>\` in the unit's drop-in, and the same variable in the shell of the Max connection — ${DOC_DE_LA_BOX}`,
  };
}

// Le réglage du geste d'installation de la box, tel que le geste le lit au
// moment d'installer : la même lecture (`lireReglage`) et le même contrôle de
// propriété du chemin (`ouvertDe`), joués avant qu'un chef n'essaie.
// Absent, ce n'est qu'à savoir : une box qui ne sert pas d'app n'en a pas
// besoin. Présent et faux, c'est un manque.
export const REGLAGE_DU_GESTE = { config: "/etc/brigade-installer.conf", racine: 0, sol: "/" };

export function jugerReglageDuGeste(box: { config: string; racine: number; sol: string } = REGLAGE_DU_GESTE): Juge {
  const { config } = box;
  const doc = `${DOC}, “Le geste d'installation”`;
  const poser = `\`sudo install -d <backups root>\` then \`printf 'sauvegardes=<backups root>\\n' | sudo tee ${config}\` — ${doc}`;
  if (lstatSync(config, { throwIfNoEntry: false }) === undefined) {
    return { etat: "note", texte: `no setting for the installation gesture (${config}): this box adds no project from the app — without it, no backup destination is accepted there`, geste: `if it must serve one: ${poser}` };
  }
  let racine: string;
  try {
    racine = lireReglage(box).sauvegardes;
  } catch (erreur) {
    if (erreur instanceof Refus) {
      // Le geste dit déjà comment le régler, après son dernier « — » ou son « : ».
      const [, commande] = /[—:] (`.*`)$/.exec(erreur.message) ?? [];
      const seule = commande !== undefined && /^`[^`]+`$/.test(commande) ? commande.slice(1, -1) : `sudoedit ${config}`;
      return { etat: "manque", texte: erreur.message, geste: `${commande ?? `fix ${config}, as root`} — ${doc}`, simple: `the box's backup setting (${config}) is refused: no project could be added from the app`, remede: parLeChef(seule) };
    }
    return {
      etat: "manque",
      texte: `the installation gesture's setting (${config}) cannot be read: ${message(erreur)}`,
      geste: `make it readable by everyone, as root: \`sudo chown root:root ${config} && sudo chmod 644 ${config}\` — ${doc}`,
      simple: `the box's backup setting (${config}) is not readable: no project could be added from the app`,
      remede: parLeChef(`sudo chown root:root ${config} && sudo chmod 644 ${config}`),
    };
  }
  const lu = lstatSync(racine, { throwIfNoEntry: false });
  if (lu === undefined) {
    return {
      etat: "manque",
      texte: `the backups root (${racine}, declared in ${config}) does not exist: the gesture would refuse every project`,
      geste: `\`sudo install -d ${racine}\` — ${doc}`,
      simple: `the box's backups folder (${racine}) does not exist: no project could be added from the app`,
      remede: parLeChef(`sudo install -d ${racine}`),
    };
  }
  const ouvert = ouvertDe(box, racine);
  if (ouvert !== null) {
    const { chemin, proprietaire } = ouvert;
    const detail = ouvert.mode === undefined ? ouvert.raison : `${chemin} belongs to uid ${proprietaire} (mode ${ouvert.mode})`;
    return {
      etat: "manque",
      texte: `the backups root (${racine}, declared in ${config}) goes through a directory that root does not hold alone: ${detail} — the gesture would refuse every project, “root creates nothing there”`,
      geste: ouvert.mode === undefined
        ? `replace ${chemin} with a directory owned by root (\`ls -ld ${chemin}\`), or declare another root in ${config} — ${doc}`
        : `give it back to root, if it belongs to nobody else (\`ls -ld ${chemin}\`): \`sudo chown root:root ${chemin} && sudo chmod go-w ${chemin}\` — ${doc}`,
      simple: `the box's backups folder (${racine}) goes through ${chemin}, which an account other than root can modify: no project could be added from the app`,
      // Un chemin qui n'est pas un répertoire ne se remet pas à root : une autre racine se déclare.
      remede: parLeChef(ouvert.mode === undefined ? `sudoedit ${config}` : `sudo chown root:root ${chemin} && sudo chmod go-w ${chemin}`),
    };
  }
  return { etat: "ok", texte: `installation gesture setting: ${config} — backups root ${racine}, held by root alone` };
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
      if (lue?.disconnectedAt) return `${station}: ${direConnexionTombeeEn(lue)}`;
    }
  } catch {
    // Un journal d'avant la station n'a pas ses tables : rien à en lire.
  } finally {
    journal.fermer();
  }
  return null;
}

// La ligne du renouvellement de la session Max : une seule, qui dit s'il
// tourne et réussit, ou ce qui l'en empêche. Une note, jamais un manque : le
// renouvellement ne conditionne pas le départ d'un cook, il en garde la durée.
export function jugerRenouvellement(etat: EtatDuRenouvellement): Juge {
  const ancien = etat.etat === "ok" || etat.dernierReussi === null ? "" : ` (last successful run at ${etat.dernierReussi})`;
  const suite = etat.etat === "ok" || etat.echecsConsecutifs <= 1 ? "" : `, ${etat.echecsConsecutifs} failures in a row`;
  switch (etat.etat) {
    case "ok":
      return { etat: "ok", texte: `renewal: last successful run at ${etat.dernierReussi}` };
    case "minuteur-inactif":
      return { etat: "note", texte: `renewal: timer inactive${ancien}`, geste: "`sudo systemctl enable --now brigade-renouvellement.timer`" };
    case "claude-introuvable":
      return { etat: "note", texte: `renewal: \`claude\` not found${suite}${ancien} — ${etat.raison}`, geste: "make `claude` reachable in the PATH of the brigade-renouvellement.service unit" };
    case "echec":
      return { etat: "note", texte: `renewal: failed${suite}${ancien} — ${etat.raison}`, geste: "`journalctl -u brigade-renouvellement.service` says more" };
  }
}

// Vérifie qu'un projet est prêt à être servi, et rend tout ce qu'il a
// constaté — ce qui manque, en entier, pas le premier manque. `env` :
// l'environnement dans lequel le runtime du projet démarrerait.
export async function verifier(env: NodeJS.ProcessEnv, systemd: Systemd = systemdReel): Promise<Constat[]> {
  const constats: Constat[] = [];
  // L'étape d'un manque, quand l'appel n'en nomme pas : le dépôt se règle en
  // l'amorçant ; le reste — la box, GitHub — à l'étape qui vérifie, qui en dit
  // le geste.
  // `pourLeChef` : ce qu'un manque lui dit en mots simples, et ce qui le lève —
  // ni l'un ni l'autre n'est gardé sur ce qui n'est pas un manque.
  const noter = (ou: Constat["ou"], etat: Constat["etat"], texte: string, geste?: string, etape?: string, pourLeChef: Pick<Constat, "simple" | "remede"> = {}) =>
    void constats.push({
      ou,
      etat,
      texte,
      ...(geste === undefined ? {} : { geste }),
      ...(etat === "manque" ? { etape: etape ?? (ou === "depot" ? "init" : "verification") } : {}),
      ...(etat === "manque" && pourLeChef.simple !== undefined ? { simple: pourLeChef.simple } : {}),
      ...(etat === "manque" && pourLeChef.remede !== undefined ? { remede: pourLeChef.remede } : {}),
    });
  const projet = env.BRIGADE_PROJECT || "<project>";
  const unite = `brigade@${projet}.service`;
  const dropIn = `set it in the instance's drop-in (\`sudo systemctl edit ${unite}\`), or run this command with the service environment — ${DOC}`;
  const editerLUnite = parLeChef(`sudo systemctl edit ${unite}`);

  // --- La machine : les variables, telles que le runtime les lirait.
  // Chaque lecteur s'arrête à son premier refus : les variables absentes sont
  // donc cherchées d'abord, toutes, et dites avec les mots du lecteur quand il
  // en a de plus précis.
  const refus: string[] = [];
  // Les décisions du chef ne se lisent plus de l'environnement : le journal
  // les porte, et la variable qui en reste y est ignorée — dite ici.
  const { posees, illisibles } = env.BRIGADE_STATE_DIR ? lireLesDecisions(env.BRIGADE_STATE_DIR) : { posees: {}, illisibles: [] };
  refus.push(...illisibles);
  // Le dépôt du projet dit sa branche et son calibrage avant la box, comme
  // le runtime les lirait.
  let duDepot: DepotDuProjet | null = null;
  try {
    duDepot = lireLeDepot(env);
  } catch (erreur) {
    if (!(erreur instanceof ConfigInvalide)) throw erreur;
    refus.push(erreur.message);
  }
  if (duDepot !== null) env = { ...duDepot.env };
  const lu = environnementDecide(env, posees, duDepot?.reglages ?? null);
  for (const nom of decisionsDansLEnvironnement(env)) {
    noter("machine", "note", `${nom} is still in the unit's environment: the runtime ignores it — a chef's decision is no longer read from there`, `set it with \`brigade ${projet} station ${gesteDe(nom)} <value>\`, then remove \`Environment=${nom}\` from the drop-in — ${DOC_DU_PROJET}`);
  }
  for (const lecteur of [configRail, lireReglages, configStation, configPass, configReviewer, configManager, lireSeuils]) {
    try {
      lecteur(lu);
    } catch (erreur) {
      if (!(erreur instanceof ConfigInvalide)) throw erreur;
      refus.push(erreur.message);
    }
  }
  // Le fichier de secrets et celui du jeton se lisent contre l'état et le
  // clone : sans eux, c'est leur absence qui est dite.
  if (env.BRIGADE_STATE_DIR && env.BRIGADE_REPO_DIR) {
    for (const lecteur of [configSecrets, configJeton]) {
      try {
        lecteur(env, { repertoireEtat: env.BRIGADE_STATE_DIR, clone: env.BRIGADE_REPO_DIR });
      } catch (erreur) {
        if (!(erreur instanceof ConfigInvalide)) throw erreur;
        refus.push(erreur.message);
      }
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
    const absente = `${variable} is not defined`;
    if (!env[variable]) dits.add(refus.find((texte) => texte.startsWith(absente)) ?? absente);
  }
  for (const texte of refus) dits.add(texte);
  // Le point d'entrée du runtime le refuserait avant tout lecteur.
  if (env.BRIGADE_PROJECT && !NOM_DE_PROJET.test(env.BRIGADE_PROJECT)) {
    dits.add(`invalid project name: “${env.BRIGADE_PROJECT}” (BRIGADE_PROJECT) — expected a short identifier in lowercase letters, digits and hyphens (brigade, compta)`);
  }
  // Une décision que l'installation pose se répond à son étape, son choix
  // expliqué ; les autres, par `station`.
  const gesteDeDecision = (decision: Decision) =>
    POSABLES.some((posable) => posable.decision === decision)
      ? `set it with \`brigade ${projet} installation decisions ${gesteDe(decision)} <value>\` — \`brigade ${projet} installation decisions\` gives the question, its options and their effect — ${DOC_DU_PROJET}`
      : `set it with \`brigade ${projet} station ${gesteDe(decision)} <value>\` — ${DOC_DU_PROJET}`;
  // L'étape d'un refus : celle de la décision qu'il nomme — même illisible au
  // journal —, l'ajout pour ce que l'instance du projet pose, la vérification
  // pour le reste de la box.
  const etapeDuRefus = (texte: string) => {
    const nommee = DECISIONS.find((nom) => texte.startsWith(nom)) ?? DECISIONS.find((nom) => texte.includes(nom));
    if (nommee !== undefined) return nommee === VARIABLE_DES_STATIONS ? "stations" : "decisions";
    return VARIABLES.some((variable) => texte.startsWith(variable)) || texte.startsWith("invalid project name") ? "ajout" : "verification";
  };
  // Un refus dit au chef : la décision qu'il nomme, à poser dans l'app quand
  // l'installation la pose, par `station` sinon ; une variable, dans le drop-in.
  const refusPourLeChef = (texte: string, decision: Decision | undefined): Pick<Constat, "simple" | "remede"> => {
    const absente = texte.includes("is not defined") || texte.includes("n'est pas défini");
    if (decision !== undefined) {
      const nom = gesteDe(decision);
      return {
        simple: absente ? `the decision “${nom}” has not been taken` : `the decision “${nom}” has a value that brigade cannot read`,
        remede: decision === VARIABLE_DES_STATIONS ? dansLApp("stations") : POSABLES.some((posable) => posable.decision === decision) ? dansLApp("decisions") : parLeChef(`brigade ${projet} station ${nom} <value>`),
      };
    }
    const variable = VARIABLES.find((nom) => texte.startsWith(nom));
    if (variable !== undefined && absente) return { simple: `the project's service does not have its ${variable} setting`, remede: editerLUnite };
    if (texte.startsWith("invalid project name")) return { simple: `the project's name (“${env.BRIGADE_PROJECT}”) is not a name brigade accepts`, remede: editerLUnite };
    return { simple: "a setting of the project's service is wrong or unreadable", remede: editerLUnite };
  };
  for (const texte of dits) {
    const decision = DECISIONS.find((nom) => texte.startsWith(nom));
    noter("machine", "manque", texte, decision ? gesteDeDecision(decision) : dropIn, etapeDuRefus(texte), refusPourLeChef(texte, decision));
  }
  if (dits.size === 0) noter("machine", "ok", `the ${VARIABLES.length} mandatory variables are set, and everything the runtime reads from its environment is readable`);
  // Les stations : le runtime démarre sans, mais rien n'y est servi. Une
  // déclaration mal écrite est déjà dite, avec les refus.
  if (!lu[VARIABLE_DES_STATIONS]?.trim() && !illisibles.some((texte) => texte.includes(VARIABLE_DES_STATIONS))) {
    noter("machine", "manque", `no station declared (${VARIABLE_DES_STATIONS} is not set in the project's log): the runtime starts, but no cook would leave — tickets would stay queued`, GESTE_DE_STATION, "stations", {
      simple: "no station is declared: no cook would leave",
      remede: dansLApp("stations"),
    });
  }

  const etat = env.BRIGADE_STATE_DIR;
  if (etat && existsSync(etat)) {
    try {
      accessSync(etat, constants.W_OK);
      noter("machine", "ok", `state directory: ${etat}`);
    } catch {
      noter("machine", "manque", `the state directory ${etat} is not writable by this account`, "use the service account for this command, or give it the directory back (`chown`)", undefined, {
        simple: `brigade cannot write to its state folder (${etat})`,
        remede: parLeChef(`sudo chown -R ${compte()} ${etat}`),
      });
    }
  }

  // Le renouvellement de la session Max, en une ligne.
  const renouvellement = jugerRenouvellement(await sonderRenouvellement(systemd));
  noter("machine", renouvellement.etat, renouvellement.texte, renouvellement.geste);

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
  if (!clone || !base) illisible = "the reserved clone or the integration branch are not designated";
  else if (!existsSync(clone) || (await git("rev-parse", "--git-dir")).code !== 0) {
    illisible = "the reserved clone is not there";
    noter(
      "machine",
      "manque",
      `reserved clone absent: ${clone} is not a git repository`,
      `under the service account: \`git clone https://github.com/${depotGitHub || "<owner>/<repo>"}.git ${clone}\``,
      "ajout",
      { simple: `the repository copy does not exist on the box (${clone})`, remede: parLeChef(`git clone https://github.com/${depotGitHub || "<owner>/<repo>"}.git ${clone}`) },
    );
  } else {
    const origine = (await git("remote", "get-url", "origin")).stdout.trim();
    const [, vise] = /github\.com[:/]([^/]+\/[^/]+?)(?:\.git)?\/?$/.exec(origine) ?? [];
    if (depotGitHub && vise !== undefined && vise.toLowerCase() !== depotGitHub.toLowerCase()) {
      noter("machine", "manque", `the reserved clone ${clone} is ${vise}'s, not ${depotGitHub}'s (BRIGADE_GITHUB_REPO)`, "clone the right repository again, or fix the variable", undefined, {
        simple: `the repository copy on the box is ${vise}'s, while the project's service serves ${depotGitHub}`,
        remede: editerLUnite,
      });
    }
    // La base telle que l'origine la porte à cet instant. Aucune référence du
    // clone n'est déplacée — la station peut y rapatrier au même moment : seuls
    // les objets du commit sont rapportés s'ils manquent.
    const distante = await git("ls-remote", "origin", `refs/heads/${base}`);
    const [tete] = distante.stdout.split(/\s/);
    const rapporte = async (commit: string) =>
      (await git("cat-file", "-e", `${commit}^{commit}`)).code === 0 || (await git("fetch", "--quiet", "--no-write-fetch-head", "--refmap=", "origin", `refs/heads/${base}`)).code === 0;
    if (distante.code !== 0) {
      illisible = "the clone's origin does not answer";
      noter(
        "machine",
        "manque",
        `the origin of clone ${clone} does not answer under this account: ${distante.stderr.trim() || "git ls-remote failed"}`,
        "this account must read the repository without being asked anything (`gh auth setup-git`, or an SSH key)",
        undefined,
        { simple: "the box cannot read the repository on GitHub", remede: parLeChef("gh auth setup-git") },
      );
    } else if (!tete) {
      illisible = `\`${base}\` does not exist on the origin`;
      noter("machine", "manque", `the branch \`${base}\` (BRIGADE_BASE_BRANCH) does not exist on the clone's origin`, "fix the variable, or push the branch", undefined, {
        simple: `the integration branch \`${base}\` does not exist on GitHub`,
        remede: parLeChef(`git push origin ${base}`),
      });
    } else if (!(await rapporte(tete))) {
      illisible = `\`${base}\` could not be fetched from the origin`;
      noter("machine", "manque", `the branch \`${base}\` could not be fetched from the origin of clone ${clone}`, "check the network and the clone's disk", undefined, {
        simple: `the box could not fetch the integration branch \`${base}\` from GitHub`,
        // La même lecture, à la main : ce qu'elle dit est ce qui l'arrête.
        remede: parLeChef(`git -C ${clone} fetch origin ${base}`),
      });
    } else {
      baseLue = tete;
      noter("machine", "ok", `reserved clone: ${clone}, \`${base}\` read on the origin (${tete.slice(0, 7)})`);
    }
  }

  // --- La machine : l'identité sous laquelle un cook commite. `git var` la
  // refuse exactement là où `git commit` la refuserait.
  const identite = await lancer("git", ["var", "GIT_COMMITTER_IDENT"], { ...(clone && existsSync(clone) ? { cwd: clone } : {}), env });
  if (identite.code !== 0 && !identite.introuvable) {
    noter(
      "machine",
      "manque",
      `this account has no git identity: a cook could commit nothing (${identite.stderr.trim().split("\n")[0] || "`git var GIT_COMMITTER_IDENT` fails"})`,
      `under the service account: \`git config --global user.name <name>\` and \`git config --global user.email <address>\` — ${DOC_DE_LA_BOX}`,
      undefined,
      { simple: "the service account has no git name: a cook could record nothing", remede: parLeChef("git config --global user.name '<name>' && git config --global user.email '<address>'") },
    );
  }

  // --- La machine : la session Max, et l'unité de service.
  const claude = env.BRIGADE_CLAUDE_BIN || "claude";
  const session = await sessionClaude(claude, environnementClaude(env, env));
  // Ce que `claude auth status` dit d'un identifiant stocké ne dit pas qu'une
  // session est valide : le dernier lancement réel, lui, est au journal — et la
  // station le tient pour ce qu'il est.
  const tombee = connexionTombee(env);
  if (tombee !== null) {
    noter("machine", "manque", `Max session: the station says it is ${tombee}`, GESTE_DE_CONNEXION_TOMBEE_EN, undefined, {
      simple: "the box's connection to Claude (Max) is down: no cook leaves any more",
      remede: parLeChef("claude /login"),
    });
  } else if (session === "connectee") {
    noter("machine", "ok", "Max session: `claude` is logged in under this account — a stored credential, not a proven session: only a real launch says so, and the log carries no authentication failure");
  } else if (session === "inconnue") noter("machine", "note", "Max session: `claude auth status` said nothing readable — the first cook will settle it");
  else {
    noter(
      "machine",
      "manque",
      session === "introuvable" ? "no Max session: the `claude` binary is not found under this account" : "no Max session: `claude` is not logged in under this account",
      "install the official binary and log in under the service account (`claude`, then `/login`)",
      undefined,
      session === "introuvable"
        ? { simple: "`claude` is not installed under the service account: no cook would leave", remede: parLeChef("curl -fsSL https://claude.ai/install.sh | bash") }
        : { simple: "`claude` is not logged in to Max under the service account: no cook would leave", remede: parLeChef("claude /login") },
    );
  }

  const systemctl = env.BRIGADE_SYSTEMCTL_BIN || "systemctl";
  // Vrai : l'unité a son propre /tmp (la cloison le pose).
  let tmpPrive = false;
  const installee = await lancer(systemctl, ["cat", unite], { env });
  if (installee.introuvable) noter("machine", "note", `no systemd on this machine: the unit ${unite} is not checked`);
  else if (installee.code !== 0 && (await lancer(systemctl, ["cat", UNITE_DE_LA_STATION], { env })).code === 0) {
    // Une box de station : le paquet pose une seule unité pour tous les projets,
    // et aucune par projet. Ses copies et son `PATH` sont ceux du paquet.
    tmpPrive = true;
    noter("machine", "ok", `service unit: ${UNITE_DE_LA_STATION} (the station package serves this project: no per-project unit ${unite} needed)`);
  } else if (installee.code !== 0) {
    noter("machine", "manque", `the unit ${unite} is not installed`, `\`sudo cp runtime/deploy/brigade@.service /etc/systemd/system/ && sudo systemctl daemon-reload\` — ${DOC}`, "ajout", {
      simple: "the project's service is not installed on the box",
      remede: parLeChef(`sudo cp ${join(dirname(SOURCES), "deploy/brigade@.service")} /etc/systemd/system/ && sudo systemctl daemon-reload`),
    });
  } else {
    noter("machine", "ok", `service unit: ${unite}`);
    // Le runtime lance `claude` par son nom, dans le `PATH` que l'unité lui
    // donne : celui du shell qui lance cette commande n'en dit rien.
    const donne = lireUnite((await lancer(systemctl, ["show", ...PROPRIETES.flatMap((propriete) => ["-p", propriete]), unite], { env })).stdout);
    tmpPrive = donne.tmpPrive;
    const chemin = donne.chemin ?? PATH_DE_SYSTEMD;
    if (trouver(claude, chemin) === null) {
      // Là où il est sous ce compte : dans son `PATH`, ou là où l'installeur
      // natif le pose.
      const pose = trouver(claude, [env.PATH ?? "", join(env.HOME || homedir(), ".local/bin")].join(delimiter)) ?? "<claude directory>";
      noter(
        "machine",
        "manque",
        `\`claude\` is not found in the \`PATH\` that the unit ${unite} will give the runtime (${chemin}${donne.chemin === null ? ", systemd's default: no `Environment=PATH=` in its drop-ins" : ""}): no cook would leave — the \`PATH\` of the shell running this command does not count`,
        // Sous le `PATH` de systemd, un lien suffit, et vaut pour tous les
        // projets de la box ; un `PATH` posé par un drop-in se corrige là.
        donne.chemin === null
          ? `\`sudo ln -sfn ${join(pose, claude)} /usr/local/bin/${claude}\` — the native installer puts \`claude\` under the account's \`~/.local/bin\`, which systemd does not give the unit; ${DOC_DE_LA_BOX}`
          : `\`sudo systemctl edit ${unite}\`, then \`[Service]\` and \`Environment=PATH=${pose}:${chemin}\`; ${DOC_DE_LA_BOX}`,
        undefined,
        { simple: "the project's service does not find `claude`: no cook would leave", remede: donne.chemin === null ? parLeChef(`sudo ln -sfn ${join(pose, claude)} /usr/local/bin/${claude}`) : editerLUnite },
      );
    }
    const minuteur = `brigade-sauvegarde@${projet}.timer`;
    if ((await lancer(systemctl, ["is-enabled", minuteur], { env })).code !== 0) {
      noter("machine", "note", `the backup is not scheduled (${minuteur}): nothing keeps this project's log`, DOC_DU_PROJET);
    }
    // Le dépôt fait foi pour ce qui vaut pour toute la box : les unités.
    const deploiement = join(SOURCES, "..", "deploy");
    // La box à jour : ses copies face au dépôt. Les unités sont posées là
    // d'où systemd charge celle-ci.
    if (donne.fragment === null) noter("machine", "note", `units not compared with the repository's (${deploiement}): systemd does not say where ${unite} is loaded from`);
    else if (donne.masquee || donne.fragment === "/dev/null") noter("machine", "note", `units not compared with the repository's (${deploiement}): ${unite} is masked, no copy to read`);
    else {
      const posees = dirname(donne.fragment);
      const jugees = jugerUnites({ posees, depot: deploiement, unite, copies: lireCopies(posees, unite, deploiement) });
      noter("machine", jugees.etat, jugees.texte, jugees.geste);
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
    const juge = jugerTemporaire({ repertoire: temporaire, proprietaire, uid, prive: tmpPrive && !env.CLAUDE_CODE_TMPDIR });
    noter("machine", juge.etat, juge.texte, juge.geste, undefined, juge);
  }

  // Le réglage du geste d'installation : c'est ici que se dit une racine que
  // le geste refuserait, avant que le chef n'ajoute un projet depuis l'app.
  // `BRIGADE_INSTALLER_CONFIG` sert aux tests, qui n'ont pas de root : le
  // réglage qu'ils posent est tenu par le compte qui les joue, et la box qu'il
  // décrit commence là où il est posé.
  const posee = env.BRIGADE_INSTALLER_CONFIG;
  const reglage = jugerReglageDuGeste(posee ? { ...REGLAGE_DU_GESTE, config: posee, racine: process.getuid?.() ?? REGLAGE_DU_GESTE.racine, sol: dirname(posee) } : REGLAGE_DU_GESTE);
  noter("machine", reglage.etat, reglage.texte, reglage.geste, undefined, reglage);

  // --- Le dépôt, tel que sa branche d'intégration le porte sur l'origine.
  if (illisible !== null) noter("depot", "note", `repository not checked: ${illisible}`);
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
    const rendre = (script: string) => `\`git update-index --chmod=+x ${script}\`, committed on \`${base}\``;
    const pasExecutable = (script: string, quoi: string) => ({ simple: `the repository's ${quoi} (\`${script}\`) ${quoi.endsWith("gates") ? "are" : "is"} not executable: brigade cannot run ${quoi.endsWith("gates") ? "them" : "it"}`, remede: parLeChef(`git update-index --chmod=+x ${script}`) });

    if (!porte.has(SCRIPT_GATES)) {
      noter("depot", "manque", `\`${SCRIPT_GATES}\` is not on \`${base}\`: without gates, the pass judges no delivery`, `\`/brigade:init\` in the repository, then merge into \`${base}\``, undefined, {
        simple: "the repository has no gates: nothing would judge a delivery",
        remede: dansLApp("init"),
      });
    } else if (!executable(SCRIPT_GATES)) noter("depot", "manque", `\`${SCRIPT_GATES}\` is not executable: the pass runs it as is`, rendre(SCRIPT_GATES), undefined, pasExecutable(SCRIPT_GATES, "gates"));
    else noter("depot", "ok", `gates: \`${SCRIPT_GATES}\``);

    if (!porte.has(SCRIPT_SETUP)) {
      noter("depot", "note", `no \`${SCRIPT_SETUP}\` on \`${base}\`: the cook starts in a fresh worktree as is, with no dependencies installed`);
    } else if (!executable(SCRIPT_SETUP)) noter("depot", "manque", `\`${SCRIPT_SETUP}\` is not executable: the station runs it as is`, rendre(SCRIPT_SETUP), undefined, pasExecutable(SCRIPT_SETUP, "setup"));
    else noter("depot", "ok", `worktree setup: \`${SCRIPT_SETUP}\``);

    if (porte.has(SCRIPT_SETUP)) {
      const setup = await git("show", `${ref}:${SCRIPT_SETUP}`);
      if (setup.code === 0) {
        const declaration = await git("show", `${ref}:${DECLARATION_RESEAU}`);
        const juge = jugerReseau({ setup: setup.stdout, declaration: declaration.code === 0 ? declaration.stdout : null });
        noter("depot", juge.etat, juge.texte, juge.geste, undefined, juge);
      }
    }

    const claudeMd = await git("show", `${ref}:CLAUDE.md`);
    const bindings = claudeMd.code === 0 ? lireBindings(claudeMd.stdout) : null;
    if (bindings === null) {
      noter("depot", "manque", `the bindings block (“## Équipe multi-agents”) is not in the \`CLAUDE.md\` of \`${base}\``, `\`/brigade:init\` in the repository, then merge into \`${base}\``, undefined, {
        simple: "the repository has not been prepared for brigade yet: its `CLAUDE.md` does not carry the block",
        remede: dansLApp("init"),
      });
    } else {
      const ligne = bindings.get("Branche d'intégration");
      const declaree = ligne === undefined ? BRANCHE_PAR_DEFAUT : (/`([^`]+)`/.exec(ligne)?.[1] ?? ligne.trim());
      if (declaree !== base) {
        noter(
          "depot",
          "manque",
          `the integration branch is not the same on both sides: the bindings say \`${declaree}\`${ligne === undefined ? " (no “Branche d'intégration” line)" : ""}, BRIGADE_BASE_BRANCH says \`${base}\``,
          "fix whichever of the two is wrong: cooks read the bindings, the station reads the variable",
          undefined,
          { simple: `the repository and the box do not name the same integration branch (\`${declaree}\` for the repository, \`${base}\` for the box)`, remede: editerLUnite },
        );
      } else noter("depot", "ok", `bindings: block present, integration branch \`${base}\``);
      const absents = BINDINGS_ATTENDUS.filter((nom) => !bindings.has(nom));
      if (absents.length > 0) {
        noter("depot", "note", `bindings missing from the block: ${absents.join(", ")} — the runtime does not read them, the cook and the gates do`, "`/brigade:init` proposes them");
      }
    }
  }

  // --- GitHub : le dépôt, et les labels par lesquels le chef parle au rail.
  let rail;
  try {
    rail = configRail(env);
  } catch {
    noter("github", "note", "GitHub not checked: BRIGADE_GITHUB_REPO does not designate a repository");
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
        noter("github", "manque", `\`gh\` reads ${depot} under this account, without the right to push there: no delivery would leave, no PR would be merged`, "give this account the right to write to the repository (Write role)", undefined, {
          simple: `the box's GitHub account cannot write to ${depot}: no delivery would leave`,
          // Lancée par un administrateur du dépôt, depuis son poste.
          remede: parLeChef(`gh api --method PUT repos/${depot}/collaborators/<the box's GitHub account> -f permission=push`),
        });
      } else noter("github", "ok", `repository read by \`gh\`: ${depot}`);
      // La seconde barrière contre des identifiants livrés. GitHub ne rend son
      // état qu'à qui administre le dépôt.
      const barriere = dit.security_and_analysis?.secret_scanning_push_protection?.status;
      if (barriere !== "enabled") {
        noter(
          "github",
          "note",
          `GitHub's push protection is not observed on ${depot} (GitHub says: ${barriere === undefined ? "nothing, this account does not administer the repository" : `\`${barriere}\``}): the station remains the only barrier against a delivery that would carry credentials`,
          DOC_DU_PROJET,
        );
      }
      const presents = await labelsDuDepot(gh, env, depot);
      const absents = LABELS.map(({ name }) => name).filter((nom) => !presents.includes(nom.toLowerCase()));
      if (absents.length === 0) noter("github", "ok", `labels: all ${LABELS.length} are there`);
      else {
        noter("github", "manque", `labels missing from the repository: ${absents.join(", ")}`, "the same command, followed by `labels`", undefined, {
          simple: `the repository lacks ${absents.length > 1 ? `${absents.length} of the labels` : "one of the labels"} through which you talk to brigade`,
          remede: parLeChef(`brigade ${projet} installation labels`),
        });
      }
      // La protection de la branche d'intégration : la seule que le runtime
      // suppose. Sans branche nommée, son absence est déjà dite plus haut.
      if (base) {
        const constat = constater(await lireLaProtection(clientGh(gh, env), depot, base), depot, base, env);
        noter("github", constat.etat, constat.texte, constat.geste, "protection", { ...constat, remede: dansLApp("protection") });
      }
    } catch (erreur) {
      noter(
        "github",
        "manque",
        `\`gh\` does not read the repository ${depot} under this account: ${message(erreur)}`,
        "`gh auth status` under the service account; a private repository demands explicit access",
        undefined,
        { simple: `the box cannot read the repository ${depot} on GitHub`, remede: parLeChef("gh auth login") },
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
    else if (statut !== 422) throw new Error(`label \`${label.name}\` refused by GitHub on ${depot}: HTTP ${statut}`);
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
  const depot = ouvrirDepot({ clone, base, worktrees: worktreesDuProjet(env, etat), env });
  const sha = await depot.rapatrier();
  // Ce qu'une sonde tuée en plein setup aurait laissé.
  depot.jeter(SONDE);
  const worktree = await depot.essayer(SONDE);
  if (worktree === null) throw new Error("probe worktree could not be set up");
  try {
    const avantOctets = poids(worktree);
    const secrets = lireSecrets(worktree, configSecrets(env, { repertoireEtat: etat, clone }));
    if (!secrets.pret) {
      const sortie = ["project secrets unavailable — the station would launch no cook (86 `secrets-unavailable`):", ...secrets.problemes].join("\n");
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
  const worktrees = worktreesDuProjet(env, etat);
  const accroches = existsSync(worktrees) ? readdirSync(worktrees).filter((nom) => !nom.startsWith(".")).length : 0;

  // Le verrou du runtime, tenu le temps du geste : aucun ne démarre pendant
  // qu'on retire son clone.
  let verrou = null;
  if (existsSync(join(etat, "lock.db"))) {
    try {
      verrou = prendreVerrou(etat);
    } catch (erreur) {
      if (!(erreur instanceof VerrouTenu)) throw erreur;
      throw new InstallationRefusee(`the project's runtime is still running on ${etat}: stop it first — nothing is removed`);
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
    if (!racine) throw new InstallationRefusee(`${clone} is not a git clone: nothing is removed`);
    if (dedans(etat, clone)) {
      throw new InstallationRefusee(`the state directory ${etat} is inside the clone ${clone}: removing it would take the log with it — nothing is removed`);
    }

    // Les commits de toutes les têtes — branches, têtes détachées du clone et
    // de ses worktrees — que l'origine n'a pas ; les remises ; et ce qui n'est
    // pas commité, dans le clone et dans chaque worktree encore là.
    const arbres = lignes("worktree", "list", "--porcelain")
      .flatMap((ligne) => (ligne.startsWith("worktree ") ? [ligne.slice("worktree ".length)] : []))
      .filter((arbre) => existsSync(arbre));
    const perdus = [
      ...lignes("log", "--exclude=refs/stash", "--all", "--not", "--remotes", "--format=%h %s").map((commit) => `commit never pushed: ${commit}`),
      ...lignes("stash", "list").map((remise) => `stash: ${remise}`),
      ...arbres.flatMap((arbre) => lignes("-C", arbre, "status", "--porcelain", "--untracked-files=all").map((fichier) => `uncommitted in ${arbre}: ${fichier.slice(3)}`)),
    ];
    if (confirme && perdus.length > 0) {
      throw new InstallationRefusee(
        [`the clone ${clone} carries what the origin does not have — push it, or undo it, then replay; nothing is removed:`, ...perdus.map((perdu) => `  ${perdu}`)].join("\n"),
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
