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

// Ce que le fichier porte, sous les noms qu'il leur donne.
export type ReglagesProjet = {
  integrationBranch: string;
  defaultCalibrations?: Partial<Record<Role, Calibrage>>;
  calibrationCeiling?: Calibrage;
  closer?: ReglagesDuCloser;
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
};

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

const CLES = ["version", "integrationBranch", "defaultCalibrations", "calibrationCeiling", "closer"];
const CLES_DE_CALIBRAGE = ["model", "effort"];

const estObjet = (valeur: unknown): valeur is Record<string, unknown> => typeof valeur === "object" && valeur !== null && !Array.isArray(valeur);

// Les réglages du projet dont le nom tombe sous le crible sans être ce qu'il
// y reconnaît : `closer.cooksBelow` est la condition de départ de la passe du
// projet, pas le nombre de cooks d'une machine ; `closer.maxTokens`, un
// plafond de consommation, pas un jeton. Ces chemins exacts, et eux seuls :
// le même nom ailleurs reste refusé.
const NOMS_DU_PROJET = new Set(["closer.cooksBelow", "closer.maxTokens"]);

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
  const { integrationBranch, defaultCalibrations, calibrationCeiling, closer } = reglages;
  const duCloser = CLES_DU_CLOSER.flatMap((nom) => {
    const pose = closer?.[nom];
    if (pose === undefined) return [];
    return [[nom, typeof pose === "number" ? pose : calibrage(pose)] as const];
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
  };
}
