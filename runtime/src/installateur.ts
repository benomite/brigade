// Le geste d'installation de la box : déclarer un projet, de bout en bout, sans
// qu'un humain colle une commande. Il tourne en root — il écrit des unités
// systemd — et sa surface est fermée : deux sous-commandes, une liste fermée
// d'options pour chacune, et pour chaque valeur un motif strict ou une liste
// fermée. Rien de ce qu'il reçoit n'est un chemin libre, une commande ni un
// contenu de fichier ; ce qu'il écrit dans une unité, il le compose lui-même.
//
// Ce fichier porte ce que les deux sous-commandes partagent, et `install` ;
// `uninstall` est dans `desinstallateur.ts`.
//
// Il fait la partie « par projet » de docs/installer.md, et rien d'autre : le
// clone réservé, le drop-in de l'instance, la sauvegarde, la cloison et sa
// porte, et le port de l'arbitre si la box en a un. Préparer la box — le
// compte, ses connexions, les unités, l'arbitre — reste à la main, et il
// refuse une box qui ne l'est pas. Il ne démarre pas le runtime du projet.
//
// Les ports ne lui sont jamais donnés : il attribue celui de la porte, hors de
// ceux que les projets de la box déclarent déjà. Celui de l'arbitre est à la
// box — un seul, le même pour tous ses projets : il le lit, il ne l'attribue
// pas.
//
// Ce qu'il ne peut pas faire tient à ce qu'il n'écrit pas : aucune option ne
// pose une variable de son choix, et les seules qu'il écrit sont celles de
// VARIABLES_POSEES — ni secret, ni clé, ni chemin vers les identifiants du
// compte Max, ni rien qui donne la production d'un projet à la box.
import { execFile } from "node:child_process";
import { existsSync, lchownSync, lstatSync, mkdirSync, readdirSync, readFileSync, rmSync, rmdirSync, writeFileSync, type Stats } from "node:fs";
import { createServer } from "node:net";
import { dirname, join, normalize, sep } from "node:path";
import { EFFORTS, MODELES } from "./calibrage.ts";
import type { AppelDInstallateur } from "./evenements/installateur.ts";
import { NOM_DE_PROJET } from "./runtime.ts";

// La liste fermée des sous-commandes.
export const ACTIONS = ["install", "uninstall"] as const;
export type Action = (typeof ACTIONS)[number];

// La liste fermée des options, et ce que chacune accepte. Une option qui n'y
// est pas est refusée, quelle que soit sa valeur.
const OPTIONS = ["--depot", "--branche", "--sauvegardes", "--manager-modele", "--manager-effort", "--reviewer-modele", "--reviewer-effort"] as const;
type Option = (typeof OPTIONS)[number];
// La branche d'intégration se lit sur l'origine quand elle n'est pas donnée.
const FACULTATIVES: Option[] = ["--branche"];

export const USAGES: Record<Action, string> = {
  install: [
    "usage : sudo brigade-installer install <projet> --depot <propriétaire>/<nom> --sauvegardes <chemin absolu>",
    `           --manager-modele <${MODELES.join("|")}> --manager-effort <${EFFORTS.join("|")}>`,
    `           --reviewer-modele <${MODELES.join("|")}> --reviewer-effort <${EFFORTS.join("|")}>`,
    "           [--branche <branche d'intégration>]",
  ].join("\n"),
  uninstall: ["usage : sudo brigade-installer uninstall <projet> --plan [--supprimer-le-journal]", "        sudo brigade-installer uninstall <projet> --confirmer <projet> [--supprimer-le-journal]"].join("\n"),
};
export const USAGE = ACTIONS.map((action) => USAGES[action]).join("\n");

// Les variables que le geste écrit dans les unités d'un projet, toutes. Aucune
// ne désigne un secret, une clé, ni le répertoire où `claude` garde la
// connexion du compte.
export const VARIABLES_POSEES = [
  "BRIGADE_GITHUB_REPO",
  "BRIGADE_BASE_BRANCH",
  "BRIGADE_MANAGER_MODEL",
  "BRIGADE_MANAGER_EFFORT",
  "BRIGADE_REVIEWER_MODEL",
  "BRIGADE_REVIEWER_EFFORT",
  "BRIGADE_PROXY_PORT",
  "BRIGADE_ARBITER_PORT",
  "BRIGADE_BACKUP_DIR",
] as const;

// Les codes de sortie. 64 et 65 ont le sens qu'ils ont pour le geste
// `brigade` ; les autres ne sont ni les siens ni ceux de la bascule.
export const CODES = {
  // L'appel est mal formé, ou une valeur est hors de ce qui est accepté.
  usage: 64,
  // Le projet à désinstaller n'est pas connu de cette box.
  inconnu: 65,
  // Un autre geste d'installation est en cours sur cette box.
  occupe: 75,
  // La box n'est pas préparée pour ce geste, ou son réglage le refuse.
  boxPasPrete: 76,
  // Celui qui lance n'est pas root : le geste se lance par `sudo`.
  sansDroit: 77,
  // Le projet est déjà installé : rien n'est écrasé.
  dejaInstalle: 78,
  // L'installation a commencé et n'a pas abouti : ce qu'elle avait posé est
  // retiré. Ou la désinstallation : ce qu'elle a retiré l'est, le reste est dit.
  echec: 79,
  // La désinstallation n'est pas confirmée, ou sa confirmation nomme un autre
  // projet : rien n'est retiré.
  sansConfirmation: 80,
  // La désinstallation est retenue par ce qu'elle emporterait : rien n'est retiré.
  retenu: 81,
} as const;

// Un appel refusé avant d'avoir rien écrit sur la box.
export class Refus extends Error {
  readonly motif: string;
  readonly code: number;

  constructor(motif: string, code: number, message: string) {
    super(message);
    this.name = "Refus";
    this.motif = motif;
    this.code = code;
  }
}

// Une installation commencée qui n'a pas abouti. `defait` : tout ce qu'elle
// avait posé est retiré ; sinon `restes` nomme ce qui n'a pas pu l'être.
export class Echec extends Error {
  readonly defait: boolean;
  readonly restes: string[];

  constructor(message: string, restes: string[]) {
    super(message);
    this.name = "Echec";
    this.defait = restes.length === 0;
    this.restes = restes;
  }
}

export type Demande = {
  projet: string;
  depot: string;
  // null : la branche par défaut de l'origine.
  branche: string | null;
  sauvegardes: string;
  manager: { modele: string; effort: string };
  reviewer: { modele: string; effort: string };
};

const LONGUEUR_MAX_D_UN_ARGUMENT = 256;
const LONGUEUR_MAX_DU_PROJET = 63;
// Un dépôt GitHub : un propriétaire (39 caractères au plus, ni tiret en tête
// ni en queue) et un nom (100 au plus).
const DEPOT = /^[A-Za-z0-9](?:[A-Za-z0-9-]{0,37}[A-Za-z0-9])?\/[A-Za-z0-9_.-]{1,100}$/;
// Une branche : ce qu'un nom de référence git admet de plus simple. Ni blanc,
// ni `%` — qu'une unité systemd développerait —, ni rien à échapper.
const BRANCHE = /^[A-Za-z0-9][A-Za-z0-9._/-]{0,99}$/;
// Un segment de chemin : ni blanc, ni `%`, ni guillemet — il s'écrit tel quel
// dans une unité.
const SEGMENT = /^[A-Za-z0-9_][A-Za-z0-9._-]*$/;
const CONTROLE = /[\u0000-\u001f\u007f]/;

export const usage = (motif: string, message: string) => new Refus(motif, CODES.usage, message);

// Un chemin absolu, normalisé, sans `..`, fait de segments simples — ou le
// refus, dit avec `quoi` pour sujet.
function refusDeChemin(chemin: string, quoi: string, prefixe: string): Refus | null {
  if (!chemin.startsWith(sep)) return usage(`${prefixe}-relatif`, `${quoi} : « ${chemin} » est un chemin relatif — attendu un chemin absolu`);
  const segments = chemin.split(sep).slice(1);
  if (segments.includes("..")) return usage(`${prefixe}-avec-points`, `${quoi} : « ${chemin} » contient \`..\` — attendu un chemin absolu, écrit sans détour`);
  if (chemin === sep || normalize(chemin) !== chemin || chemin.endsWith(sep)) return usage(`${prefixe}-non-normalise`, `${quoi} : « ${chemin} » n'est pas normalisé — ni \`//\`, ni \`/./\`, ni barre finale`);
  if (!segments.every((segment) => SEGMENT.test(segment))) {
    return usage(`${prefixe}-hors-motif`, `${quoi} : « ${chemin} » porte un segment hors motif — lettres, chiffres, \`.\`, \`_\` et \`-\`, sans point ni tiret en tête`);
  }
  return null;
}

// Ce que tout appel porte avant ses options : une sous-commande de la liste
// fermée, et un projet dans le motif. Rien n'est lu de la box.
export function lireAppel(args: string[]): { action: Action; projet: string; reste: string[] } {
  // Avant tout le reste : aucun argument n'est un contenu de fichier.
  for (const arg of args) {
    if (CONTROLE.test(arg)) {
      throw usage("contenu-de-fichier", "un argument porte un saut de ligne ou un caractère de contrôle : aucun argument de ce geste n'est un contenu de fichier — chaque valeur est un nom, un chemin ou un mot d'une liste fermée");
    }
    if (arg.length > LONGUEUR_MAX_D_UN_ARGUMENT) {
      throw usage("contenu-de-fichier", `un argument fait plus de ${LONGUEUR_MAX_D_UN_ARGUMENT} caractères : aucun argument de ce geste n'est un contenu de fichier`);
    }
  }
  const [action, projet, ...reste] = args;
  if (action === undefined) throw usage("sous-commande-manquante", `il manque la sous-commande\n${USAGE}`);
  if (!(ACTIONS as readonly string[]).includes(action)) throw usage("sous-commande-inconnue", `sous-commande inconnue : « ${action} » — ce geste ne connaît que ${ACTIONS.map((connue) => `\`${connue}\``).join(" et ")}\n${USAGE}`);
  const usageDeLAction = USAGES[action as Action];
  if (projet === undefined || projet.startsWith("-")) throw usage("projet-manquant", `il manque le projet\n${usageDeLAction}`);
  if (!NOM_DE_PROJET.test(projet) || projet.length > LONGUEUR_MAX_DU_PROJET) {
    throw usage("projet-hors-motif", `nom de projet hors motif : « ${projet} » — attendu un identifiant court en minuscules, chiffres et tirets (brigade, thermigo), ${LONGUEUR_MAX_DU_PROJET} caractères au plus`);
  }
  return { action: action as Action, projet, reste };
}

// Lit ce que l'appelant a tapé pour `install`, sans rien lire de la box. Tout
// ce qui n'est pas exactement la forme attendue est un refus.
export function lireDemande(args: string[]): Demande {
  const { action, projet, reste } = lireAppel(args);
  if (action !== "install") throw usage("sous-commande-inconnue", `ce n'est pas une installation : « ${action} »\n${USAGES.install}`);

  const lues = new Map<Option, string>();
  for (let i = 0; i < reste.length; i += 2) {
    const option = reste[i] as string;
    if (!option.startsWith("-")) throw usage("argument-en-trop", `argument en trop : « ${option} »\n${USAGES.install}`);
    if (!(OPTIONS as readonly string[]).includes(option)) throw usage("option-inconnue", `option inconnue : « ${option} » — celles de ce geste : ${OPTIONS.join(", ")}`);
    if (lues.has(option as Option)) throw usage("option-en-double", `${option} est donnée deux fois`);
    const valeur = reste[i + 1];
    if (valeur === undefined) throw usage("valeur-manquante", `${option} attend une valeur`);
    lues.set(option as Option, valeur);
  }
  const absentes = OPTIONS.filter((option) => !FACULTATIVES.includes(option) && !lues.has(option));
  if (absentes.length > 0) throw usage("option-manquante", `il manque ${absentes.join(", ")} — aucune n'a de défaut\n${USAGES.install}`);
  const lue = (option: Option) => lues.get(option) as string;

  const depot = lue("--depot");
  const [, nom = ""] = depot.split("/");
  if (!DEPOT.test(depot) || nom === "." || nom === ".." || nom.endsWith(".git")) {
    throw usage("depot-hors-motif", `--depot : « ${depot} » n'est pas un dépôt GitHub — attendu <propriétaire>/<nom>, sans adresse ni \`.git\``);
  }
  const branche = lues.get("--branche") ?? null;
  if (branche !== null && (!BRANCHE.test(branche) || /\.\.|\/\/|\/\.|\.lock(?:\/|$)|[/.]$/.test(branche))) {
    throw usage("branche-hors-motif", `--branche : « ${branche} » n'est pas un nom de branche que ce geste accepte — lettres, chiffres, \`.\`, \`_\`, \`-\` et \`/\``);
  }
  const calibre = (option: Option, admis: readonly string[]) => {
    const valeur = lue(option);
    if (!admis.includes(valeur)) throw usage("calibrage-inconnu", `${option} : « ${valeur} » n'est pas dans la liste — ${admis.join(", ")}`);
    return valeur;
  };
  const manager = { modele: calibre("--manager-modele", MODELES), effort: calibre("--manager-effort", EFFORTS) };
  const reviewer = { modele: calibre("--reviewer-modele", MODELES), effort: calibre("--reviewer-effort", EFFORTS) };
  const sauvegardes = lue("--sauvegardes");
  const refus = refusDeChemin(sauvegardes, "--sauvegardes", "sauvegardes");
  if (refus) throw refus;
  return { projet, depot, branche, sauvegardes, manager, reviewer };
}

const ARGUMENTS_GARDES = 16;
const LONGUEUR_GARDEE = 120;

// Ce qui s'écrit au journal de ce que l'appelant a tapé : borné, pour que ni
// un contenu de fichier ni une ligne sans fin n'y entrent en entier.
export function appelBorne(args: string[]): AppelDInstallateur {
  const coupe = (arg: string) => (arg.length > LONGUEUR_GARDEE ? `${arg.slice(0, LONGUEUR_GARDEE)}… (${arg.length} caractères)` : arg);
  const [action, ...reste] = args;
  return {
    action: action === undefined ? null : coupe(action),
    args: [...reste.slice(0, ARGUMENTS_GARDES).map(coupe), ...(reste.length > ARGUMENTS_GARDES ? [`… (${reste.length} arguments)`] : [])],
  };
}

// Le projet qu'un appel désigne, s'il en désigne un dans le motif.
export function projetDesigne(args: string[]): string | null {
  const projet = args[1];
  return projet !== undefined && NOM_DE_PROJET.test(projet) && projet.length <= LONGUEUR_MAX_DU_PROJET ? projet : null;
}

// Le compte du service : celui sous lequel tournent le runtime et ses cooks.
export type Compte = { nom: string; uid: number; gid: number; home: string };

// La box telle que le geste la voit. Rien de ceci ne se lit dans ses arguments
// ni dans son environnement : la box réelle est écrite dans son point d'entrée
// (`installateur-cli.ts`), et seuls les tests en fabriquent une autre.
export type Box = {
  // Le compte qui lance le geste, à qui sont son réglage et ce qui mène aux
  // sauvegardes : root.
  racine: number;
  // Là d'où le geste s'assure qu'un chemin n'est tenu que par root : la racine
  // de la machine.
  sol: string;
  // Là où systemd lit les unités et leurs drop-ins.
  unites: string;
  // Là où vit l'état de chaque projet, tel que `brigade@.service` le désigne.
  etats: string;
  // Le réglage du geste : un fichier de root.
  config: string;
  // Le journal du geste, et son verrou : un répertoire de root.
  journal: string;
  // `runtime/deploy/` du clone de brigade : la cloison s'y copie.
  deploiement: string;
  // Là où la bascule pose, projet par projet, les versions du runtime qu'elle
  // met en service (`brigade-bascule`).
  versions: string;
  systemctl: string;
  getent: string;
  git: string;
  // L'adresse d'où se clone un dépôt.
  origine: (depot: string) => string;
  // L'environnement d'une commande lancée sous le compte du service.
  environnement: (compte: Compte) => Record<string, string>;
  // Vrai si rien n'écoute sur ce port de la boucle locale.
  portLibre: (port: number) => Promise<boolean>;
};

export type Installation = {
  projet: string;
  depot: string;
  branche: string;
  compte: string;
  etat: string;
  clone: string;
  sauvegardes: string;
  // `porte` : attribué par ce geste. `arbitre` : celui de la box, lu — null si
  // elle n'en a pas.
  ports: { porte: number; arbitre: number | null };
  // Les unités du projet, celles que le geste a déclarées.
  unites: string[];
  // Ce qui reste à faire ou à savoir, que le geste ne fait pas.
  aSavoir: string[];
};

// Le `PATH` qu'une unité reçoit de systemd : celui des commandes lancées sous
// le compte, pas celui de qui lance le geste.
export const PATH_DE_SYSTEMD = "/usr/local/sbin:/usr/local/bin:/usr/sbin:/usr/bin";
// Là où la porte d'un projet reçoit son port quand le réglage n'en dit rien.
const PORTS_PAR_DEFAUT: [number, number] = [3128, 3227];
const PREMIER_PORT_LIBRE = 1024;
export const DERNIER_PORT = 65535;
const GABARITS = ["brigade@.service", "brigade-sauvegarde@.service", "brigade-sauvegarde@.timer", "brigade-porte@.service"];
const CLOISON = "cloison.conf";
const ARBITRE = "brigade-arbitre.service";
export const DOC = "docs/installer.md";
const DELAI_DU_CLONE_MS = 600_000;
const DELAI_MS = 120_000;
const ENTETE = `# Posé par brigade-installer — ${DOC}, « Déclarer le projet ».`;

export const pasPrete = (motif: string, message: string) => new Refus(motif, CODES.boxPasPrete, message);

type Sortie = { code: number | null; stdout: string; stderr: string };

// Lance une commande et rend ce qu'elle a dit, quel que soit son code. Jamais
// par un shell : les arguments passent un à un.
export function lancer(bin: string, args: string[], options: { env: Record<string, string>; cwd?: string; uid?: number; gid?: number; delaiMs?: number; signal?: AbortSignal }): Promise<Sortie> {
  const { delaiMs = DELAI_MS, ...reste } = options;
  return new Promise((resoudre) => {
    execFile(bin, args, { ...reste, timeout: delaiMs, maxBuffer: 16 * 1024 * 1024 }, (erreur, stdout, stderr) => {
      const code = erreur === null ? 0 : typeof erreur.code === "number" ? erreur.code : null;
      resoudre({ code, stdout, stderr: stderr || (erreur !== null && code === null ? erreur.message : "") });
    });
  });
}

export const derniereLigne = (texte: string) => texte.trim().split("\n").at(-1) ?? "";

// Vrai si `chemin` est `parent` ou vit dessous. Les deux sont normalisés.
export const sous = (chemin: string, parent: string) => chemin === parent || chemin.startsWith(parent.endsWith(sep) ? parent : `${parent}${sep}`);

// Vrai si un autre que root peut écrire là : ni son propriétaire, ni un groupe
// ou le monde — sauf répertoire collant, où chacun ne touche qu'aux siens.
const ouvert = (lu: Stats, box: Box) => (lu.uid !== 0 && lu.uid !== box.racine) || ((lu.mode & 0o022) !== 0 && (lu.mode & 0o1000) === 0);

// Pourquoi un répertoire ne peut pas recevoir ce que root y crée, ou null :
// chacun de ses ancêtres qui existent, lui compris, doit être un répertoire —
// pas un lien — que root seul peut modifier. Sinon un autre compte y glisserait
// un lien, et root créerait ou donnerait ailleurs.
export function douteux(box: Box, repertoire: string): string | null {
  if (!sous(repertoire, box.sol)) return `${repertoire} n'est pas sous ${box.sol}`;
  let courant = box.sol;
  for (const segment of ["", ...repertoire.slice(box.sol.length).split(sep).filter(Boolean)]) {
    courant = join(courant, segment);
    const lu = lstatSync(courant, { throwIfNoEntry: false });
    if (lu === undefined) return null;
    if (lu.isSymbolicLink()) return `${courant} est un lien`;
    if (!lu.isDirectory()) return `${courant} n'est pas un répertoire`;
    if (ouvert(lu, box)) return `${courant} n'est pas à root seul (uid ${lu.uid}, mode ${(lu.mode & 0o7777).toString(8)})`;
  }
  return null;
}

type Reglage = { sauvegardes: string; ports: [number, number] };

// Le réglage du geste : un fichier `clé=valeur` qui n'appartient qu'à root.
// `sauvegardes` : la racine sous laquelle une destination de sauvegarde est
// acceptée — elle n'a pas de défaut. `ports` : la plage où la porte d'un projet
// reçoit le sien.
function lireReglage(box: Box): Reglage {
  const poser = `le poser, à root : \`printf 'sauvegardes=<racine des sauvegardes>\\n' | sudo tee ${box.config}\``;
  const lu = lstatSync(box.config, { throwIfNoEntry: false });
  if (lu === undefined) throw pasPrete("reglage-absent", `le réglage du geste (${box.config}) n'existe pas : sans lui, aucune destination de sauvegarde n'est acceptée — ${poser}`);
  if (!lu.isFile()) throw pasPrete("reglage-douteux", `le réglage du geste (${box.config}) n'est pas un fichier ordinaire`);
  if (ouvert(lu, box)) throw pasPrete("reglage-douteux", `le réglage du geste (${box.config}) n'est pas à root seul (uid ${lu.uid}, mode ${(lu.mode & 0o7777).toString(8)}) : un autre compte y écrirait la racine des sauvegardes — \`sudo chown root:root ${box.config} && sudo chmod 644 ${box.config}\``);
  const cles = new Map<string, string>();
  for (const ligne of readFileSync(box.config, "utf8").split("\n")) {
    if (ligne.trim() === "" || ligne.startsWith("#")) continue;
    const [, cle, valeur] = /^([a-z]+)=(.*)$/.exec(ligne) ?? [];
    if (cle === undefined || valeur === undefined || !["sauvegardes", "ports"].includes(cle)) throw pasPrete("reglage-illisible", `le réglage du geste (${box.config}) porte une ligne qui ne se lit pas : « ${ligne} » — attendu \`sauvegardes=<chemin>\` ou \`ports=<début>-<fin>\``);
    cles.set(cle, valeur);
  }
  const sauvegardes = cles.get("sauvegardes");
  if (sauvegardes === undefined) throw pasPrete("reglage-illisible", `le réglage du geste (${box.config}) ne dit pas \`sauvegardes=\` : aucune destination de sauvegarde n'est acceptée — ${poser}`);
  const refus = refusDeChemin(sauvegardes, `\`sauvegardes=\` de ${box.config}`, "reglage");
  if (refus) throw pasPrete("reglage-illisible", refus.message);
  let ports = PORTS_PAR_DEFAUT;
  const plage = cles.get("ports");
  if (plage !== undefined) {
    const [, debut, fin] = /^([0-9]{1,5})-([0-9]{1,5})$/.exec(plage) ?? [];
    ports = [Number(debut), Number(fin)];
    if (debut === undefined || ports[0] < PREMIER_PORT_LIBRE || ports[1] > DERNIER_PORT || ports[0] > ports[1]) {
      throw pasPrete("reglage-illisible", `le réglage du geste (${box.config}) porte une plage de ports qui ne se lit pas : « ${plage} » — attendu <début>-<fin>, de ${PREMIER_PORT_LIBRE} à ${DERNIER_PORT}`);
    }
  }
  return { sauvegardes, ports };
}

export const instances = (projet: string) => ({ runtime: `brigade@${projet}.service`, sauvegarde: `brigade-sauvegarde@${projet}.service`, minuteur: `brigade-sauvegarde@${projet}.timer`, porte: `brigade-porte@${projet}.service` });

// Les affectations `Environment=<variable>=` des drop-ins d'un répertoire,
// dans l'ordre où systemd les lit.
export function affectations(repertoire: string, variable: string): string[] {
  let noms: string[];
  try {
    noms = readdirSync(repertoire).filter((nom) => nom.endsWith(".conf")).sort();
  } catch {
    return [];
  }
  return noms.flatMap((nom) => {
    try {
      return [...readFileSync(join(repertoire, nom), "utf8").matchAll(new RegExp(`^Environment=${variable}=(.*)$`, "gm"))].map(([, valeur = ""]) => valeur.trim());
    } catch {
      return [];
    }
  });
}

// Ce que les unités de la box déclarent déjà pour ces variables, tous drop-ins
// confondus.
function declarees(box: Box, variables: string[]): string[] {
  let noms: string[];
  try {
    noms = readdirSync(box.unites).filter((nom) => nom.endsWith(".d"));
  } catch {
    return [];
  }
  return noms.flatMap((nom) => variables.flatMap((variable) => affectations(join(box.unites, nom), variable)));
}

// Les ports que les unités de la box déclarent déjà : la porte de chaque
// projet, et l'arbitre.
const portsDeclares = (box: Box) => new Set(declarees(box, ["BRIGADE_PROXY_PORT", "BRIGADE_ARBITER_PORT"]).map(Number).filter(Number.isInteger));

// Le port de l'arbitre de la box, ou null si elle n'en a pas déclaré.
function portDeLArbitre(box: Box): number | null {
  const port = Number(affectations(join(box.unites, `${ARBITRE}.d`), "BRIGADE_ARBITER_PORT").at(-1));
  return Number.isInteger(port) && port >= 1 && port <= DERNIER_PORT ? port : null;
}

// Le compte du service, lu là où le geste `brigade` le lit : dans l'unité.
export async function lireCompte(box: Box, unite: string, env: Record<string, string>): Promise<Compte> {
  const montre = await lancer(box.systemctl, ["show", "-p", "User", "--value", unite], { env });
  if (montre.code !== 0) throw pasPrete("systemd-muet", `systemd n'a pas répondu pour ${unite} (\`systemctl show -p User\` rend ${montre.code}) : ${derniereLigne(montre.stderr)}`);
  const nom = montre.stdout.trim();
  const preparer = `${DOC}, « Préparer la box »`;
  if (!/^[a-z_][a-z0-9_-]{0,31}$/.test(nom) || nom === "root") {
    throw pasPrete("compte-inconnu", `le compte du service ne se lit pas dans ${unite} (\`User=${nom}\`) : le runtime d'un projet ne tourne pas sous root — ${preparer}`);
  }
  const fiche = await lancer(box.getent, ["passwd", nom], { env });
  const [, , uid, gid, , home] = fiche.stdout.trim().split(":");
  if (fiche.code !== 0 || !/^[0-9]+$/.test(uid ?? "") || !/^[0-9]+$/.test(gid ?? "") || !home?.startsWith(sep)) {
    throw pasPrete("compte-inconnu", `le compte du service « ${nom} » (${unite}) n'existe pas sur cette box — ${preparer}`);
  }
  if (Number(uid) === 0) throw pasPrete("compte-inconnu", `le compte du service « ${nom} » est root : le runtime d'un projet ne tourne pas sous root — ${preparer}`);
  return { nom, uid: Number(uid), gid: Number(gid), home };
}

// Vrai si rien n'écoute sur ce port de la boucle locale, à cet instant.
export function portLibre(port: number): Promise<boolean> {
  return new Promise((resoudre) => {
    const essai = createServer();
    essai.once("error", () => resoudre(false));
    essai.listen(port, "127.0.0.1", () => essai.close(() => resoudre(true)));
  });
}

// Installe un projet sur la box. Tout ce qui peut être refusé l'est avant le
// premier geste : `avantDEcrire` est appelée entre les deux. Ensuite, un pas
// qui échoue défait ceux d'avant, dans l'ordre inverse.
export async function installer(box: Box, demande: Demande, options: { avantDEcrire?: () => void; signal?: AbortSignal } = {}): Promise<Installation> {
  const { projet, depot } = demande;
  const { signal } = options;
  const unites = instances(projet);
  const env = { PATH: PATH_DE_SYSTEMD };
  const dropIns = { runtime: join(box.unites, `${unites.runtime}.d`), sauvegarde: join(box.unites, `${unites.sauvegarde}.d`), porte: join(box.unites, `${unites.porte}.d`) };
  const etat = join(box.etats, projet);
  const clone = join(etat, "depot");

  // --- Ce qui se lit, et se refuse, avant de rien toucher.

  // Un projet déjà là n'est jamais écrasé : ni ses unités, ni son clone.
  const deja = [...Object.values(dropIns), clone].filter((chemin) => lstatSync(chemin, { throwIfNoEntry: false }) !== undefined);
  if (deja.length > 0) {
    throw new Refus("deja-installe", CODES.dejaInstalle, `le projet « ${projet} » est déjà installé sur cette box (${deja.join(", ")}) : rien n'est écrasé, rien n'a changé — pour le réinstaller, le désinstaller d'abord (\`sudo brigade-installer uninstall ${projet} --plan\` dit ce qui serait retiré)`);
  }

  const reglage = lireReglage(box);
  const manquants = GABARITS.filter((nom) => !existsSync(join(box.unites, nom)));
  if (manquants.length > 0) throw pasPrete("unites-absentes", `les unités de brigade ne sont pas posées sous ${box.unites} (${manquants.join(", ")}) — ${DOC}, « Préparer la box »`);
  let cloison: string;
  try {
    cloison = readFileSync(join(box.deploiement, CLOISON), "utf8");
  } catch {
    throw pasPrete("cloison-absente", `la cloison ne se lit pas dans le clone de brigade (${join(box.deploiement, CLOISON)})`);
  }
  const bwrap = /^Environment=BRIGADE_SANDBOX_BIN=(.+)$/m.exec(cloison)?.[1]?.trim();
  if (bwrap === undefined || !existsSync(bwrap)) {
    throw pasPrete("bwrap-absent", `\`bwrap\` n'est pas sur cette box (${bwrap ?? "la cloison ne le nomme pas"}) : le runtime d'un projet cloisonné refuserait de démarrer — \`sudo apt install bubblewrap\` (${DOC}, « La cloison »)`);
  }
  const compte = await lireCompte(box, unites.runtime, env);

  // La destination des sauvegardes : sous la racine que root a écrite, par un
  // chemin que root seul peut modifier, et hors de l'état du projet.
  const { sauvegardes } = demande;
  if (sauvegardes === reglage.sauvegardes || !sous(sauvegardes, reglage.sauvegardes)) {
    throw usage("sauvegardes-hors-racine", `--sauvegardes : « ${sauvegardes} » n'est pas sous la racine autorisée sur cette box (${reglage.sauvegardes}, lue dans ${box.config})`);
  }
  if (sous(sauvegardes, etat)) throw usage("sauvegardes-hors-racine", `--sauvegardes : « ${sauvegardes} » est dans l'état du projet (${etat}) : une sauvegarde ne se garde pas avec ce qu'elle sauve`);
  // Une destination par projet : la sauvegarde refuserait, chaque nuit, celle
  // qui porte déjà les sauvegardes d'un autre.
  const prise = declarees(box, ["BRIGADE_BACKUP_DIR"]).find((autre) => sous(sauvegardes, autre) || sous(autre, sauvegardes));
  if (prise !== undefined) throw usage("sauvegardes-deja-prises", `--sauvegardes : « ${sauvegardes} » croise la destination d'un autre projet de cette box (${prise}) : une destination par projet — en donner une autre sous ${reglage.sauvegardes}`);
  const racine = lstatSync(reglage.sauvegardes, { throwIfNoEntry: false });
  if (racine === undefined) throw pasPrete("racine-des-sauvegardes", `la racine des sauvegardes (${reglage.sauvegardes}, lue dans ${box.config}) n'existe pas — \`sudo install -d ${reglage.sauvegardes}\``);
  const doute = douteux(box, dirname(sauvegardes));
  if (doute !== null) throw pasPrete("racine-des-sauvegardes", `le chemin des sauvegardes (${sauvegardes}) passe par un répertoire que root ne tient pas seul : ${doute} — root n'y crée rien`);
  const destination = lstatSync(sauvegardes, { throwIfNoEntry: false });
  if (destination !== undefined && (!destination.isDirectory() || destination.uid !== compte.uid)) {
    throw pasPrete("destination-des-sauvegardes", `la destination des sauvegardes (${sauvegardes}) existe et n'est pas un répertoire du compte « ${compte.nom} » : rien n'y est changé — en donner une autre, ou la lui rendre`);
  }

  // L'état du projet : absent, ou laissé par une désinstallation — au compte.
  const laisse = lstatSync(etat, { throwIfNoEntry: false });
  if (laisse !== undefined && (!laisse.isDirectory() || laisse.uid !== compte.uid)) {
    throw pasPrete("etat-douteux", `le répertoire d'état du projet (${etat}) existe et n'est pas un répertoire du compte « ${compte.nom} » : rien n'y est changé`);
  }

  // Le port de la porte : le premier de la plage que ni une unité de la box
  // ne déclare, ni un process ne tient.
  const declares = portsDeclares(box);
  let porte: number | null = null;
  for (let port = reglage.ports[0]; port <= reglage.ports[1] && porte === null; port++) {
    if (!declares.has(port) && (await box.portLibre(port))) porte = port;
  }
  if (porte === null) throw pasPrete("aucun-port-libre", `aucun port libre de ${reglage.ports[0]} à ${reglage.ports[1]} pour la porte du projet : élargir la plage (\`ports=<début>-<fin>\` dans ${box.config})`);
  const arbitre = portDeLArbitre(box);

  // --- Ce qui s'écrit. Chaque pas note comment se défaire.
  options.avantDEcrire?.();
  const defaire: Array<{ quoi: string; geste: () => void | Promise<void> }> = [];
  const sousLeCompte = process.getuid?.() === compte.uid ? {} : { uid: compte.uid, gid: compte.gid };
  const duCompte = box.environnement(compte);
  const systemctl = async (...args: string[]) => {
    const rendu = await lancer(box.systemctl, args, { env });
    if (rendu.code !== 0) throw new Error(`\`systemctl ${args.join(" ")}\` rend ${rendu.code} : ${derniereLigne(rendu.stderr)}`);
  };
  // Un répertoire que root crée, puis donne : `mkdir` refuse un nom déjà pris,
  // lien compris, et `lchown` ne suit aucun lien.
  const creer = (repertoire: string, a?: Compte) => {
    mkdirSync(repertoire, { mode: 0o755 });
    defaire.push({ quoi: repertoire, geste: () => rmdirSync(repertoire) });
    if (a !== undefined && process.getuid?.() !== a.uid) lchownSync(repertoire, a.uid, a.gid);
  };

  try {
    const interrompu = () => {
      if (signal?.aborted) throw new Error("le geste a été interrompu");
    };
    if (!existsSync(box.etats)) creer(box.etats);
    if (laisse === undefined) creer(etat, compte);
    // Ce qui mène à la destination reste à root ; elle seule est au compte.
    const aCreer: string[] = [];
    for (let chemin = sauvegardes; lstatSync(chemin, { throwIfNoEntry: false }) === undefined; chemin = dirname(chemin)) aCreer.unshift(chemin);
    for (const chemin of aCreer) creer(chemin, chemin === sauvegardes ? compte : undefined);

    // Le clone réservé, sous le compte du service : c'est lui que GitHub
    // connaît, et root n'a rien à lire d'un dépôt.
    interrompu();
    defaire.push({
      quoi: clone,
      geste: async () => {
        // Sous le compte aussi : ce répertoire est à lui, root n'y suit rien.
        await lancer("rm", ["-rf", "--", clone], { env: duCompte, cwd: sep, ...sousLeCompte });
        if (existsSync(clone)) throw new Error("le clone est resté");
      },
    });
    const clonage = await lancer(box.git, ["clone", "--quiet", "--", box.origine(depot), clone], { env: { ...duCompte, GIT_TERMINAL_PROMPT: "0" }, cwd: sep, ...sousLeCompte, delaiMs: DELAI_DU_CLONE_MS, ...(signal ? { signal } : {}) });
    if (clonage.code !== 0) {
      throw new Error(`le dépôt ${depot} n'a pas pu être cloné sous le compte « ${compte.nom} » : ${derniereLigne(clonage.stderr) || `\`git clone\` rend ${clonage.code}`} — ce compte doit le lire sans rien demander (\`gh auth setup-git\`, ${DOC}, « Préparer la box »)`);
    }
    interrompu();
    const git = (...args: string[]) => lancer(box.git, ["-C", clone, ...args], { env: duCompte, cwd: sep, ...sousLeCompte });
    let branche = demande.branche;
    if (branche === null) {
      const tete = (await git("symbolic-ref", "--short", "refs/remotes/origin/HEAD")).stdout.trim().replace(/^origin\//, "");
      if (!BRANCHE.test(tete)) throw new Error(`la branche par défaut de ${depot} ne se lit pas sur son origine (« ${tete} ») : la donner par \`--branche\``);
      branche = tete;
    } else if ((await git("rev-parse", "--verify", "--quiet", `refs/remotes/origin/${branche}`)).code !== 0) {
      throw new Error(`la branche \`${branche}\` n'existe pas sur l'origine de ${depot}`);
    }

    // Les drop-ins : ce sont eux qui font exister le projet sur la box. Chaque
    // fichier est créé, jamais récrit (`wx`).
    const poser = (repertoire: string, nom: string, contenu: string) => writeFileSync(join(repertoire, nom), contenu, { flag: "wx", mode: 0o644 });
    const variables = (affectes: Array<[(typeof VARIABLES_POSEES)[number], string | number]>) => [ENTETE, "[Service]", ...affectes.map(([variable, valeur]) => `Environment=${variable}=${valeur}`), ""].join("\n");
    // Défaire relit les unités une fois les drop-ins retirés : ce pas se note
    // donc avant eux.
    defaire.push({ quoi: "systemctl daemon-reload", geste: () => systemctl("daemon-reload") });
    for (const repertoire of Object.values(dropIns)) {
      mkdirSync(repertoire, { mode: 0o755 });
      defaire.push({ quoi: repertoire, geste: () => rmSync(repertoire, { recursive: true, force: true }) });
    }
    poser(
      dropIns.runtime,
      "projet.conf",
      variables([
        ["BRIGADE_GITHUB_REPO", depot],
        ["BRIGADE_BASE_BRANCH", branche],
        ["BRIGADE_MANAGER_MODEL", demande.manager.modele],
        ["BRIGADE_MANAGER_EFFORT", demande.manager.effort],
        ["BRIGADE_REVIEWER_MODEL", demande.reviewer.modele],
        ["BRIGADE_REVIEWER_EFFORT", demande.reviewer.effort],
      ]),
    );
    // La cloison, copiée telle quelle ; puis le même port des deux côtés — la
    // porte l'ouvre, le runtime sort par lui.
    poser(dropIns.runtime, CLOISON, cloison);
    poser(dropIns.runtime, "porte.conf", variables([["BRIGADE_PROXY_PORT", porte]]));
    poser(dropIns.porte, "porte.conf", variables([["BRIGADE_PROXY_PORT", porte]]));
    if (arbitre !== null) poser(dropIns.runtime, "arbitre.conf", variables([["BRIGADE_ARBITER_PORT", arbitre]]));
    poser(dropIns.sauvegarde, "projet.conf", variables([["BRIGADE_BACKUP_DIR", sauvegardes]]));

    interrompu();
    await systemctl("daemon-reload");
    for (const unite of [unites.minuteur, unites.porte]) {
      defaire.push({ quoi: unite, geste: () => systemctl("disable", "--now", unite) });
      await systemctl("enable", "--now", unite);
    }

    return {
      projet,
      depot,
      branche,
      compte: compte.nom,
      etat,
      clone,
      sauvegardes,
      ports: { porte, arbitre },
      unites: [unites.runtime, unites.porte, unites.minuteur],
      aSavoir: [
        `le runtime du projet n'est pas démarré : vérifier d'abord (\`brigade ${projet} installation\`), puis \`sudo systemctl enable --now ${unites.runtime}\``,
        ...(arbitre === null ? [`cette box n'a pas d'arbitre déclaré (${ARBITRE}) : ce projet se tient pour seul sur la machine et sur le compte Max — ${DOC}, « L'arbitre »`] : []),
      ],
    };
  } catch (erreur) {
    const restes: string[] = [];
    for (const { quoi, geste } of defaire.reverse()) {
      try {
        await geste();
      } catch (reste) {
        restes.push(`${quoi} (${reste instanceof Error ? reste.message : String(reste)})`);
      }
    }
    throw new Echec(erreur instanceof Error ? erreur.message : String(erreur), restes);
  }
}
