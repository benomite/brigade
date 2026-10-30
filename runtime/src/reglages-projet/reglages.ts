// Les réglages d'un projet, versionnés dans son dépôt (épique 1301) : sa
// branche d'intégration, les calibrages par défaut de son manager et de son
// reviewer, son plafond de calibrage, et les réglages de son closer (#1684). Ils vivent dans
// `.claude/brigade/projet.json`, lisibles par quiconque a accès au dépôt, et
// changent par une PR comme le code.
//
// Ce module les lit et les écrit depuis un clone du projet, et rien d'autre :
// - le dépôt GitHub ne s'y écrit pas, il se lit sur l'`origin` du clone ;
// - sans le fichier, la branche d'intégration est celle que la ligne
//   « Branche d'intégration » du `CLAUDE.md` du clone déclare ;
// - l'écriture refuse ce qui est à la machine ou au chef (`prive.ts`), et
//   laisse alors le fichier tel qu'il était ;
// - le fichier écrit est stable : les mêmes réglages donnent les mêmes octets,
//   quel que soit l'ordre où on les a donnés.
//
// Ses messages sont en anglais : c'est l'app qui les montre.
import { existsSync, mkdirSync, readFileSync, renameSync, rmSync, writeFileSync } from "node:fs";
import { dirname, join } from "node:path";
import { promisify } from "node:util";
import { EFFORTS, MODELES, type Calibrage } from "../calibrage.ts";
import { execFile } from "../sans-invite.ts";
import { refusEn } from "../zones.ts";
import { nomPrive, valeurPrivee, type Prive } from "./prive.ts";

export const FICHIER = ".claude/brigade/projet.json";
// La forme du fichier. Un fichier d'une version plus récente vient d'un
// brigade plus récent : il n'est pas lu à moitié.
export const VERSION = 1;

export const ROLES = ["manager", "reviewer"] as const;
export type Role = (typeof ROLES)[number];

// Les réglages du closer (`closing/settings.ts`) : son calibrage, sa
// condition de départ — la passe part quand moins de `cooksBelow` cooks sont
// en vol —, ses plafonds de tokens et de lignes retirées. Chacun est
// facultatif : celui que le fichier tait reste celui de la box.
export const CLES_DU_CLOSER = ["calibration", "cooksBelow", "maxTokens", "maxRemovedLines"] as const;
export type ReglagesDuCloser = { calibration?: Calibrage; cooksBelow?: number; maxTokens?: number; maxRemovedLines?: number };

// Les seuils du projet (#1671) : ce qui est trop cher ou trop dérivé pour lui
// (`drift`), à partir de quand une correction se répète (`correction`), et les
// seuils de la mesure des profils de cooks (`profile`). Chaque clé dit la
// variable de la box qu'elle remplace, et ce qu'elle doit être — ce que le
// lecteur du runtime refuserait (`derive.ts`, `correctif/reglages.ts`,
// `profils/reglages.ts`). Chacune est facultative : celle que le fichier tait
// reste celle de la box, ou son défaut.
// `zero` : un entier qui peut valoir zéro (un plafond à zéro, un écart nul).
export type SeuilDuProjet = { variable: string; entier: boolean; min: number; max?: number; zero?: boolean };
const seuil = (variable: string, entier = false, min = 0, max?: number): SeuilDuProjet => ({ variable, entier, min, ...(max === undefined ? {} : { max }) });
const entierOuZero = (variable: string): SeuilDuProjet => ({ variable, entier: true, min: 0, zero: true });
export const SEUILS_DU_PROJET = {
  drift: {
    contextKb: seuil("BRIGADE_DRIFT_CONTEXT_KB"),
    gatesSeconds: seuil("BRIGADE_DRIFT_GATES_SECONDS"),
    growthPercent: seuil("BRIGADE_DRIFT_GROWTH_PERCENT"),
    merges: seuil("BRIGADE_DRIFT_MERGES", true),
    repoMb: seuil("BRIGADE_DRIFT_REPO_MB"),
    tests: seuil("BRIGADE_DRIFT_TESTS", true),
    testsSeconds: seuil("BRIGADE_DRIFT_TESTS_SECONDS"),
    ticketTokens: seuil("BRIGADE_DRIFT_TICKET_TOKENS", true),
    lostTokens: seuil("BRIGADE_DRIFT_LOST_TOKENS", true),
    firstTryPercent: seuil("BRIGADE_DRIFT_FIRST_TRY_PERCENT"),
    firstTryWindow: seuil("BRIGADE_DRIFT_FIRST_TRY_WINDOW", true),
  },
  correction: {
    threshold: seuil("BRIGADE_CORRECTION_THRESHOLD", true, 2),
    window: seuil("BRIGADE_CORRECTION_WINDOW", true, 1),
  },
  // Ce que valent les tests et la CI du projet (#1672) : le budget d'un passage
  // de gates de ticket et celui du run complet sur la base, en durée et en
  // processeur (secondes), le plafond de durée des gates et l'attente d'une CI
  // qui ne conclut pas. Ils ne dépendent pas de la machine.
  gates: {
    durationBudgetSeconds: seuil("BRIGADE_GATES_BUDGET_SECONDS", true, 1),
    processorBudgetSeconds: seuil("BRIGADE_GATES_BUDGET_CPU_SECONDS", true, 1),
    baseDurationBudgetSeconds: seuil("BRIGADE_GATES_BASE_BUDGET_SECONDS", true, 1),
    baseProcessorBudgetSeconds: seuil("BRIGADE_GATES_BASE_BUDGET_CPU_SECONDS", true, 1),
    timeoutSeconds: seuil("BRIGADE_GATES_TIMEOUT_SECONDS", true, 1),
    ciWaitSeconds: seuil("BRIGADE_CI_WAIT_SECONDS", true, 1),
  },
  // La règle du rail et le carnet de leçons du projet (#1673) : le bail d'un
  // ticket pris, l'issue de feuille de route que lit le manager, et la
  // politique du carnet — combien de leçons reçoit un cook, combien de rétros
  // promeuvent une leçon, au bout de combien de tickets elle expire, et
  // l'écart qu'un renvoi ou une correction du chef y met. Les chemins communs
  // du rail sont une liste : `commonPaths`, hors de ces familles.
  rail: {
    leaseSeconds: seuil("BRIGADE_LEASE_SECONDS", true, 1),
    roadmapIssue: seuil("BRIGADE_ROADMAP_ISSUE", true, 1),
  },
  lessons: {
    injected: entierOuZero("BRIGADE_INJECTED_LESSONS"),
    promotionRetros: seuil("BRIGADE_PROMOTION_RETROS", true, 1),
    provisionalExpiryTickets: seuil("BRIGADE_PROVISIONAL_EXPIRY_TICKETS", true, 1),
    promotedExpiryTickets: seuil("BRIGADE_PROMOTED_EXPIRY_TICKETS", true, 1),
    sendbackPromotionGap: entierOuZero("BRIGADE_SENDBACK_PROMOTION_GAP"),
  },
  profile: {
    window: seuil("BRIGADE_PROFILE_WINDOW", true, 1),
    minTickets: seuil("BRIGADE_PROFILE_MIN_TICKETS", true, 1),
    gapPoints: seuil("BRIGADE_PROFILE_GAP_POINTS", false, 0, 100),
  },
} as const satisfies Record<string, Record<string, SeuilDuProjet>>;
export const FAMILLES_DE_SEUILS = Object.keys(SEUILS_DU_PROJET) as Array<keyof typeof SEUILS_DU_PROJET>;
export type FamilleDeSeuils = (typeof FAMILLES_DE_SEUILS)[number];
export type SeuilsDuProjet = { [F in FamilleDeSeuils]?: { [K in keyof (typeof SEUILS_DU_PROJET)[F]]?: number } };

// Ce que le fichier porte, sous les noms qu'il leur donne.
export type ReglagesProjet = SeuilsDuProjet & {
  integrationBranch: string;
  defaultCalibrations?: Partial<Record<Role, Calibrage>>;
  calibrationCeiling?: Calibrage;
  closer?: ReglagesDuCloser;
  // Les chemins que le rail traite comme communs à tous les tickets
  // (`BRIGADE_COMMON_PATHS`) : relatifs à la racine du dépôt.
  commonPaths?: string[];
};

// D'où vient ce qu'on a lu : le fichier, la ligne du `CLAUDE.md`, ou rien.
export type Source = "projet.json" | "CLAUDE.md" | "aucune";

export type ReglagesLus = {
  // `owner/name`, lu sur l'`origin` du clone ; null s'il n'y en a pas, ou si
  // ce n'est pas une adresse de github.com.
  depot: string | null;
  source: Source;
  integrationBranch: string | null;
  defaultCalibrations: Partial<Record<Role, Calibrage>>;
  calibrationCeiling: Calibrage | null;
  closer: ReglagesDuCloser;
  commonPaths?: string[];
} & SeuilsDuProjet;

// Pourquoi un réglage est refusé : il est à la machine ou au chef, ou il n'est
// pas un réglage valide du projet.
export type Motif = Prive | "invalide";

export class ReglageRefuse extends Error {
  readonly motif: Motif;
  // Où dans les réglages : `defaultCalibrations.manager.model`.
  readonly cle: string;
  constructor(motif: Motif, cle: string, message: string) {
    super(message);
    this.name = "ReglageRefuse";
    this.motif = motif;
    this.cle = cle;
  }
}

// Une branche que git accepte, sans ce qui ferait d'elle autre chose qu'un nom
// (`git check-ref-format`, en plus strict).
const BRANCHE = /^(?!-)(?!.*\.\.)(?!.*\/\/)(?!.*@\{)(?!.*\.lock(?:\/|$))[A-Za-z0-9._/-]+(?<![/.])$/;
const brancheValide = (branche: string) => BRANCHE.test(branche) && !branche.startsWith("/") && !branche.split("/").some((morceau) => morceau.startsWith("."));

const CLES = ["version", "integrationBranch", "defaultCalibrations", "calibrationCeiling", "closer", "commonPaths", ...FAMILLES_DE_SEUILS];
const CLES_DE_CALIBRAGE = ["model", "effort"];

const estObjet = (valeur: unknown): valeur is Record<string, unknown> => typeof valeur === "object" && valeur !== null && !Array.isArray(valeur);

// Les réglages du projet dont le nom tombe sous le crible sans être ce qu'il
// y reconnaît : `closer.cooksBelow` est la condition de départ de la passe du
// projet, pas le nombre de cooks d'une machine ; `closer.maxTokens`, un
// plafond de consommation, pas un jeton. Ces chemins exacts, et eux seuls :
// le même nom ailleurs reste refusé.
// `drift.ticketTokens` et `drift.lostTokens` sont des seuils de coût.
// `commonPaths` dit des chemins du dépôt (relatifs, vérifiés à l'écriture),
// pas ceux d'une machine.
const NOMS_DU_PROJET = new Set(["commonPaths", "closer.cooksBelow", "closer.maxTokens", "drift.ticketTokens", "drift.lostTokens"]);

// Passe tout ce qu'on veut écrire au crible de `prive.ts`, clés et valeurs, à
// toute profondeur — y compris ce qui n'est pas un réglage du projet : c'est
// à ce qu'il est qu'on le refuse, pas seulement parce qu'il est inconnu.
function cribler(valeur: unknown, cle: string): void {
  if (typeof valeur === "string") {
    const constat = valeurPrivee(valeur);
    if (constat !== null) throw new ReglageRefuse(constat.motif, cle, `\`${cle}\` does not belong in the project's repository: ${constat.pourquoi}. ${RESTE[constat.motif]}`);
    return;
  }
  const enfants: Array<[string, unknown]> = Array.isArray(valeur) ? valeur.map((v, i) => [String(i), v]) : estObjet(valeur) ? Object.entries(valeur) : [];
  for (const [nom, enfant] of enfants) {
    const chemin = cle === "" ? nom : `${cle}.${nom}`;
    const constat = Array.isArray(valeur) || NOMS_DU_PROJET.has(chemin) ? null : nomPrive(nom);
    if (constat !== null) throw new ReglageRefuse(constat.motif, chemin, `\`${chemin}\` does not belong in the project's repository: ${constat.pourquoi}. ${RESTE[constat.motif]}`);
    cribler(enfant, chemin);
  }
}

const RESTE: Record<Prive, string> = {
  secret: "Secrets and credentials stay on the machine that uses them, never in git.",
  chemin: "A machine's paths stay in that station's settings, never in git.",
  "limite-machine": "It belongs to the station's settings, never to git.",
};

const invalide = (cle: string, message: string) => new ReglageRefuse("invalide", cle, `\`${cle}\` ${message}`);

function calibrageDe(valeur: unknown, cle: string): Calibrage {
  if (!estObjet(valeur)) throw invalide(cle, "must be an object with `model` and `effort`");
  const inconnue = Object.keys(valeur).find((nom) => !CLES_DE_CALIBRAGE.includes(nom));
  if (inconnue !== undefined) throw invalide(`${cle}.${inconnue}`, `is not part of a calibration: expected \`model\` and \`effort\``);
  const { model, effort } = valeur;
  if (typeof model !== "string" || !(MODELES as readonly string[]).includes(model)) throw invalide(`${cle}.model`, `must be one of ${MODELES.join(", ")}`);
  if (typeof effort !== "string" || !(EFFORTS as readonly string[]).includes(effort)) throw invalide(`${cle}.effort`, `must be one of ${EFFORTS.join(", ")}`);
  return { model, effort };
}

// Les réglages du closer, ou un refus qui dit lequel : une clé inconnue, un
// calibrage incomplet, un nombre qui n'est pas un entier supérieur à zéro —
// ce que le runtime refuserait de la box (`closing/settings.ts`).
function closerDe(valeur: unknown): ReglagesDuCloser {
  if (!estObjet(valeur)) throw invalide("closer", `must be an object of the closer's settings: ${CLES_DU_CLOSER.map((nom) => `\`${nom}\``).join(", ")}`);
  const inconnue = Object.keys(valeur).find((nom) => !(CLES_DU_CLOSER as readonly string[]).includes(nom));
  if (inconnue !== undefined) throw invalide(`closer.${inconnue}`, `is not a setting of the closer: expected ${CLES_DU_CLOSER.map((nom) => `\`${nom}\``).join(", ")}`);
  const closer: ReglagesDuCloser = {};
  if (valeur.calibration !== undefined) closer.calibration = calibrageDe(valeur.calibration, "closer.calibration");
  for (const nom of ["cooksBelow", "maxTokens", "maxRemovedLines"] as const) {
    const nombre = valeur[nom];
    if (nombre === undefined) continue;
    if (typeof nombre !== "number" || !Number.isSafeInteger(nombre) || nombre < 1) throw invalide(`closer.${nom}`, "must be an integer greater than zero");
    closer[nom] = nombre;
  }
  return closer;
}

// Les seuils d'une famille, ou un refus qui dit lequel : une clé inconnue, un
// nombre qui n'est pas de la forme que le lecteur du runtime lit.
function seuilsDe(famille: FamilleDeSeuils, valeur: unknown): Record<string, number> {
  const connus: Record<string, SeuilDuProjet> = SEUILS_DU_PROJET[famille];
  const noms = Object.keys(connus).map((nom) => `\`${nom}\``).join(", ");
  if (!estObjet(valeur)) throw invalide(famille, `must be an object of thresholds: ${noms}`);
  const inconnue = Object.keys(valeur).find((nom) => connus[nom] === undefined);
  if (inconnue !== undefined) throw invalide(`${famille}.${inconnue}`, `is not a ${famille} threshold: expected ${noms}`);
  const seuils: Record<string, number> = {};
  for (const [nom, { entier, min, max, zero }] of Object.entries(connus)) {
    const nombre = valeur[nom];
    if (nombre === undefined) continue;
    const borne = max === undefined ? "" : `, ${max} at most`;
    const attendu = entier ? (zero ? "an integer, zero or more" : min > 1 ? `an integer of ${min} or more` : "an integer greater than zero") : `a number greater than zero${borne}`;
    const bon = typeof nombre === "number" && Number.isFinite(nombre) && (entier ? Number.isSafeInteger(nombre) && nombre >= (zero ? 0 : Math.max(min, 1)) : nombre > min) && (max === undefined || nombre <= max);
    if (!bon) throw invalide(`${famille}.${nom}`, `must be ${attendu}`);
    seuils[nom] = nombre;
  }
  return seuils;
}

// Les chemins communs du rail, ou un refus qui dit lequel : une liste de
// chemins relatifs à la racine du dépôt, sans virgule (la variable de la box
// les sépare par des virgules), et que le rail accepte (`zones.ts`).
function cheminsCommunsDe(valeur: unknown): string[] {
  if (!Array.isArray(valeur)) throw invalide("commonPaths", "must be a list of paths relative to the repository's root");
  return valeur.map((chemin, i) => {
    const cle = `commonPaths.${i}`;
    if (typeof chemin !== "string" || chemin.trim() === "" || chemin.includes(",")) throw invalide(cle, "must be a path relative to the repository's root, without a comma");
    const pourquoi = refusEn(chemin.trim());
    if (pourquoi !== null) throw invalide(cle, `“${chemin}” ${pourquoi}`);
    return chemin.trim();
  });
}

// Les réglages valides tirés d'un objet quelconque, ou un refus qui dit
// lequel et pourquoi. `version` : vrai pour le contenu du fichier, qui la
// porte ; faux pour ce qu'on demande d'écrire, qui ne la porte pas.
function valider(objet: unknown, version: boolean): ReglagesProjet {
  cribler(objet, "");
  if (!estObjet(objet)) throw new ReglageRefuse("invalide", "", "the project settings must be a JSON object");
  const inconnue = Object.keys(objet).find((nom) => !CLES.includes(nom) || (nom === "version" && !version));
  if (inconnue !== undefined) throw invalide(inconnue, `is not a project setting: expected ${CLES.filter((nom) => version || nom !== "version").map((nom) => `\`${nom}\``).join(", ")}`);
  if (version) {
    if (typeof objet.version !== "number" || !Number.isInteger(objet.version) || objet.version < 1) throw invalide("version", `must be a whole number: this brigade writes version ${VERSION}`);
    if (objet.version > VERSION) throw invalide("version", `is ${objet.version}: this file was written by a newer brigade, which this one cannot read (it knows version ${VERSION})`);
  }
  const { integrationBranch, defaultCalibrations, calibrationCeiling, closer } = objet;
  if (typeof integrationBranch !== "string" || !brancheValide(integrationBranch)) throw invalide("integrationBranch", "must be the name of a git branch");
  const reglages: ReglagesProjet = { integrationBranch };
  if (defaultCalibrations !== undefined) {
    if (!estObjet(defaultCalibrations)) throw invalide("defaultCalibrations", `must be an object keyed by role: ${ROLES.map((role) => `\`${role}\``).join(", ")}`);
    const role = Object.keys(defaultCalibrations).find((nom) => !(ROLES as readonly string[]).includes(nom));
    if (role !== undefined) throw invalide(`defaultCalibrations.${role}`, `is not a role with a default calibration: expected ${ROLES.map((r) => `\`${r}\``).join(", ")}`);
    const calibrages: Partial<Record<Role, Calibrage>> = {};
    for (const nom of ROLES) {
      const calibrage = defaultCalibrations[nom];
      if (calibrage !== undefined) calibrages[nom] = calibrageDe(calibrage, `defaultCalibrations.${nom}`);
    }
    if (Object.keys(calibrages).length > 0) reglages.defaultCalibrations = calibrages;
  }
  if (calibrationCeiling !== undefined) reglages.calibrationCeiling = calibrageDe(calibrationCeiling, "calibrationCeiling");
  if (closer !== undefined) {
    const lus = closerDe(closer);
    if (Object.keys(lus).length > 0) reglages.closer = lus;
  }
  if (objet.commonPaths !== undefined) {
    const communs = cheminsCommunsDe(objet.commonPaths);
    if (communs.length > 0) reglages.commonPaths = communs;
  }
  for (const famille of FAMILLES_DE_SEUILS) {
    if (objet[famille] === undefined) continue;
    const lus = seuilsDe(famille, objet[famille]);
    if (Object.keys(lus).length > 0) reglages[famille] = lus;
  }
  return reglages;
}

// Les réglages que l'écriture accepterait, ou le refus qu'elle lèverait —
// sans rien écrire : ce qu'on vérifie avant de préparer quoi que ce soit.
export function validerReglagesProjet(reglages: unknown): ReglagesProjet {
  return valider(reglages, false);
}

// Le texte du fichier : les clés dans un ordre fixe, deux espaces, une fin de
// ligne. Les mêmes réglages donnent les mêmes octets.
export function texteDuFichier(reglages: ReglagesProjet): string {
  const calibrage = ({ model, effort }: Calibrage) => ({ model, effort });
  const { integrationBranch, defaultCalibrations, calibrationCeiling, closer, commonPaths } = reglages;
  const duCloser = CLES_DU_CLOSER.flatMap((nom) => {
    const pose = closer?.[nom];
    if (pose === undefined) return [];
    return [[nom, typeof pose === "number" ? pose : calibrage(pose)] as const];
  });
  const desSeuils = FAMILLES_DE_SEUILS.flatMap((famille) => {
    const poses: Record<string, number | undefined> = reglages[famille] ?? {};
    const lus = Object.keys(SEUILS_DU_PROJET[famille]).flatMap((nom) => (poses[nom] === undefined ? [] : [[nom, poses[nom]] as const]));
    return lus.length === 0 ? [] : [[famille, Object.fromEntries(lus)] as const];
  });
  const roles = ROLES.flatMap((role) => {
    const pose = defaultCalibrations?.[role];
    return pose === undefined ? [] : [[role, calibrage(pose)] as const];
  });
  return `${JSON.stringify(
    {
      version: VERSION,
      integrationBranch,
      ...(roles.length === 0 ? {} : { defaultCalibrations: Object.fromEntries(roles) }),
      ...(calibrationCeiling === undefined ? {} : { calibrationCeiling: calibrage(calibrationCeiling) }),
      ...(duCloser.length === 0 ? {} : { closer: Object.fromEntries(duCloser) }),
      ...(commonPaths === undefined || commonPaths.length === 0 ? {} : { commonPaths }),
      ...Object.fromEntries(desSeuils),
    },
    null,
    2,
  )}\n`;
}

// Écrit les réglages dans le clone. Tout est vérifié avant que rien ne
// s'écrive : un refus laisse le fichier tel qu'il était — absent s'il l'était.
// L'écriture passe par un fichier voisin renommé : le fichier n'est jamais à
// moitié écrit.
export function ecrireReglagesProjet(clone: string, reglages: unknown): ReglagesProjet {
  const valides = valider(reglages, false);
  const fichier = join(clone, FICHIER);
  const texte = texteDuFichier(valides);
  mkdirSync(dirname(fichier), { recursive: true });
  const brouillon = `${fichier}.${process.pid}.tmp`;
  try {
    writeFileSync(brouillon, texte);
    renameSync(brouillon, fichier);
  } finally {
    rmSync(brouillon, { force: true });
  }
  return valides;
}

// `owner/name` d'une adresse de github.com — https, ssh ou scp —, ou null.
export function depotDeLOrigine(url: string): string | null {
  const [, depot] = /^(?:https?:\/\/(?:[^@/]+@)?github\.com\/|(?:ssh:\/\/)?(?:[^@/]+@)?github\.com[:/])([\w.-]+\/[\w.-]+?)(?:\.git)?\/?$/.exec(url.trim()) ?? [];
  return depot ?? null;
}

const lancer = promisify(execFile);

async function origine(clone: string): Promise<string | null> {
  try {
    const { stdout } = await lancer("git", ["-C", clone, "remote", "get-url", "origin"], { encoding: "utf8", timeout: 30_000 });
    return depotDeLOrigine(stdout);
  } catch {
    return null;
  }
}

// La branche que la ligne « Branche d'intégration » du `CLAUDE.md` déclare —
// `- **Branche d'intégration** : \`v2\`` —, ou null.
export function brancheDuClaudeMd(claudeMd: string): string | null {
  const [, entre, nue] = /^[ \t]*(?:[-*][ \t]+)?(?:\*\*)?Branche d['’]intégration(?:\*\*)?[ \t]*:[ \t]*(?:`([^`\n]+)`|(\S+))/m.exec(claudeMd) ?? [];
  const branche = (entre ?? nue)?.trim();
  return branche !== undefined && brancheValide(branche) ? branche : null;
}

// Les réglages que porte le texte du fichier, où qu'on l'ait lu — l'arbre du
// clone, ou une branche (`en-vigueur.ts`). Un texte qui porte autre chose que
// des réglages du projet est un refus dit.
export function reglagesDuTexte(texte: string): ReglagesProjet {
  let contenu: unknown;
  try {
    contenu = JSON.parse(texte);
  } catch {
    // Sans le message de `JSON.parse` : il cite le texte, qui porte peut-être
    // un secret.
    throw new ReglageRefuse("invalide", "", `\`${FICHIER}\` is not valid JSON`);
  }
  return valider(contenu, true);
}

// Les seuils que portent des réglages, famille par famille.
export function seuilsDuProjet(reglages: SeuilsDuProjet | null): SeuilsDuProjet {
  const seuils: SeuilsDuProjet = {};
  for (const famille of FAMILLES_DE_SEUILS) if (reglages?.[famille] !== undefined) seuils[famille] = reglages[famille];
  return seuils;
}

// Lit les réglages du projet dans son clone. Un fichier illisible ou qui porte
// autre chose que des réglages du projet est un refus dit, jamais des
// réglages devinés.
export async function lireReglagesProjet(clone: string): Promise<ReglagesLus> {
  const depot = await origine(clone);
  const fichier = join(clone, FICHIER);
  if (!existsSync(fichier)) {
    const claudeMd = join(clone, "CLAUDE.md");
    const branche = existsSync(claudeMd) ? brancheDuClaudeMd(readFileSync(claudeMd, "utf8")) : null;
    return { depot, source: branche === null ? "aucune" : "CLAUDE.md", integrationBranch: branche, defaultCalibrations: {}, calibrationCeiling: null, closer: {} };
  }
  const reglages = reglagesDuTexte(readFileSync(fichier, "utf8"));
  return {
    depot,
    source: "projet.json",
    integrationBranch: reglages.integrationBranch,
    defaultCalibrations: reglages.defaultCalibrations ?? {},
    calibrationCeiling: reglages.calibrationCeiling ?? null,
    closer: reglages.closer ?? {},
    ...(reglages.commonPaths === undefined ? {} : { commonPaths: reglages.commonPaths }),
    ...seuilsDuProjet(reglages),
  };
}
