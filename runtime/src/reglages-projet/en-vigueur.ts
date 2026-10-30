// Les réglages du projet tels que le runtime les applique (épique 1301) : ceux
// que son dépôt porte (`reglages.ts`) passent avant ceux que la box tient — la
// branche de la ligne de configuration de la station, et les décisions du chef
// au journal : le calibrage du manager et du reviewer, le plafond de
// calibrage, les réglages du closer. Un projet dont le dépôt n'a pas encore le fichier garde ceux de
// la box, comme avant.
//
// Le fichier se lit sur la branche d'intégration telle que le dernier
// rapatriement l'a vue (`lireALaBase`), comme la liste réseau du projet — pas
// dans l'arbre de travail du clone : la station n'y change jamais rien
// (`depot.ts`), il reste tel qu'au clonage. Une PR mergée vaut donc dès le
// rapatriement suivant — chaque cook préparé, chaque passage de la pass en
// fait un —, sans redémarrage ni `sudo`.
//
// La branche se résout avant de savoir où lire, une fois, à l'ouverture de la
// cuisine : c'est d'elle que partent les worktrees.
import { existsSync, readFileSync } from "node:fs";
import { join } from "node:path";
import type { Calibrage } from "../calibrage.ts";
import { lireALaBase } from "../depot.ts";
import { ConfigInvalide } from "../runtime.ts";
import { brancheDuClaudeMd, FAMILLES_DE_SEUILS, FICHIER, reglagesDuTexte, ReglageRefuse, SEUILS_DU_PROJET, type ReglagesProjet } from "./reglages.ts";

// Les réglages que la branche d'intégration porte, ou null si elle n'a pas le
// fichier. Lève `ReglageRefuse` si le fichier n'est pas fait de réglages du
// projet, et une erreur de `git` si la branche ne se lit pas : illisible
// n'est pas absent.
export function reglagesALaBase(lieu: { clone: string; base: string }, env?: NodeJS.ProcessEnv): ReglagesProjet | null {
  const texte = lireALaBase(lieu, FICHIER, env);
  return texte === null ? null : reglagesDuTexte(texte);
}

// D'où vient la branche d'intégration : le fichier du dépôt, la ligne de la
// station, ou la ligne « Branche d'intégration » du `CLAUDE.md` du clone.
export type ProvenanceDeLaBranche = "projet.json" | "configuration" | "CLAUDE.md";

export type BrancheDuProjet = {
  // Null : ni le dépôt ni la ligne ne la disent.
  branche: string | null;
  provenance: ProvenanceDeLaBranche | null;
  // Ce qui n'a pas pu se lire en chemin, dit au chef : rien n'en est deviné.
  problemes: string[];
};

const message = (erreur: unknown) => (erreur instanceof Error ? erreur.message : String(erreur));

// La branche d'intégration du projet. Dans l'ordre :
//   1. celle que le fichier porte sur la branche que la ligne nomme — la
//      ligne n'est alors qu'un point de départ ;
//   2. celle que le fichier porte dans l'arbre du clone — un clone frais, sur
//      la branche par défaut de son dépôt, qu'aucune ligne ne nomme ;
//   3. celle de la ligne, pour un dépôt sans le fichier ;
//   4. celle que le `CLAUDE.md` du clone déclare.
// Ne lève jamais : un fichier illisible est dit dans `problemes`, et c'est la
// lecture des réglages à la base qui le refuse.
export function brancheDuProjet(clone: string, ligne: string | null, env?: NodeJS.ProcessEnv): BrancheDuProjet {
  const problemes: string[] = [];
  const essayer = <T>(ou: string, lire: () => T): T | null => {
    try {
      return lire();
    } catch (erreur) {
      problemes.push(`${FICHIER} not read on ${ou} — ${message(erreur)}`);
      return null;
    }
  };
  const duFichier = (reglages: ReglagesProjet | null): BrancheDuProjet | null => (reglages === null ? null : { branche: reglages.integrationBranch, provenance: "projet.json", problemes });
  if (ligne !== null) {
    const lu = duFichier(essayer(`origin/${ligne}`, () => reglagesALaBase({ clone, base: ligne }, env)));
    if (lu !== null) return lu;
  }
  const arbre = join(clone, FICHIER);
  if (existsSync(arbre)) {
    const lu = duFichier(essayer("the clone's working tree", () => reglagesDuTexte(readFileSync(arbre, "utf8"))));
    if (lu !== null) return lu;
  }
  if (ligne !== null) return { branche: ligne, provenance: "configuration", problemes };
  const claudeMd = join(clone, "CLAUDE.md");
  const declaree = existsSync(claudeMd) ? essayer("the clone's CLAUDE.md", () => brancheDuClaudeMd(readFileSync(claudeMd, "utf8"))) : null;
  return declaree === null ? { branche: null, provenance: null, problemes } : { branche: declaree, provenance: "CLAUDE.md", problemes };
}

// Ce que le runtime lit des réglages du dépôt à l'ouverture de la cuisine. Un
// fichier qui n'est pas fait de réglages du projet est un refus d'ouvrir,
// comme une décision illisible : le runtime ne retombe pas sur ceux de la
// box, que le fichier remplace. Une branche que `git` ne lit pas n'en est pas
// un : la cuisine s'ouvre sur ceux de la box, le dit, et les relit à chaque
// usage.
export function reglagesAuDemarrage(lieu: { clone: string; base: string }, env?: NodeJS.ProcessEnv): { reglages: ReglagesProjet | null; nonLu: string | null } {
  try {
    return { reglages: reglagesALaBase(lieu, env), nonLu: null };
  } catch (erreur) {
    if (erreur instanceof ReglageRefuse) throw erreur;
    return { reglages: null, nonLu: `${FICHIER} not read on origin/${lieu.base} — ${message(erreur)}` };
  }
}

// Les seuils de dérive, de correction et de profil que le dépôt porte, sous
// le nom de la variable de la box que chacun remplace : les lecteurs du
// runtime les lisent comme ils lisaient la box.
function seuilsDuDepot(reglages: ReglagesProjet | null): Record<string, string> {
  const variables: Record<string, string> = {};
  for (const famille of FAMILLES_DE_SEUILS) {
    const poses: Record<string, number | undefined> = reglages?.[famille] ?? {};
    for (const [nom, { variable }] of Object.entries<{ variable: string }>(SEUILS_DU_PROJET[famille])) {
      if (poses[nom] !== undefined) variables[variable] = String(poses[nom]);
    }
  }
  return variables;
}

// Ce que le dépôt fixe des gates que la pass lit de l'environnement et non des
// décisions : le plafond de durée des gates et l'attente de la CI (`configPass`).
// Les quatre budgets, eux, passent par `variablesDuDepot`.
export function variablesDesGatesDuDepot(reglages: ReglagesProjet | null): Record<string, string> {
  const { BRIGADE_GATES_TIMEOUT_SECONDS: timeout, BRIGADE_CI_WAIT_SECONDS: attente } = seuilsDuDepot(reglages);
  return { ...(timeout === undefined ? {} : { BRIGADE_GATES_TIMEOUT_SECONDS: timeout }), ...(attente === undefined ? {} : { BRIGADE_CI_WAIT_SECONDS: attente }) };
}

// Les variables de décision que les réglages du dépôt remplacent : le
// calibrage du manager et du reviewer, les réglages du closer et les seuils de
// dérive, de correction et de profil, le bail et les chemins communs du rail,
// la feuille de route du manager et la politique du carnet, un par un —
// celui que le fichier tait reste celui de la box. Le plafond de calibrage
// n'y est pas : d'où il vient se dit (`plafondDuProjet`, `reagir.ts`).
export function variablesDuDepot(reglages: ReglagesProjet | null): Record<string, string> {
  const calibrages = reglages?.defaultCalibrations ?? {};
  const closer = reglages?.closer ?? {};
  const poser = (prefixe: string, calibrage: Calibrage | undefined) => (calibrage === undefined ? {} : { [`${prefixe}_MODEL`]: calibrage.model, [`${prefixe}_EFFORT`]: calibrage.effort });
  const nombre = (variable: string, valeur: number | undefined) => (valeur === undefined ? {} : { [variable]: String(valeur) });
  return {
    ...poser("BRIGADE_MANAGER", calibrages.manager),
    ...poser("BRIGADE_REVIEWER", calibrages.reviewer),
    ...poser("BRIGADE_CLOSING", closer.calibration),
    ...nombre("BRIGADE_CLOSING_COOKS", closer.cooksBelow),
    ...nombre("BRIGADE_CLOSING_MAX_TOKENS", closer.maxTokens),
    ...nombre("BRIGADE_CLOSING_MAX_REMOVED_LINES", closer.maxRemovedLines),
    ...seuilsDuDepot(reglages),
    ...(reglages?.commonPaths === undefined ? {} : { BRIGADE_COMMON_PATHS: reglages.commonPaths.join(",") }),
  };
}

// Ce que les réglages du dépôt disent, en une ligne pour le journal de la
// station : ce que le dépôt fixe, et ce qu'il laisse à la box.
export function direReglagesDuDepot(branche: BrancheDuProjet, reglages: ReglagesProjet | null, base: string): string {
  const d = (calibrage: Calibrage | undefined) => (calibrage === undefined ? "box" : `${calibrage.model}/${calibrage.effort}`);
  const depuis = { "projet.json": `${FICHIER}`, configuration: "the station's configuration line", "CLAUDE.md": "the clone's CLAUDE.md" };
  const brancheDite = `branch ${branche.branche ?? "?"} (from ${branche.provenance === null ? "nowhere" : depuis[branche.provenance]})`;
  if (reglages === null) return `project settings — ${brancheDite}; origin/${base} has no ${FICHIER}: calibrations, ceiling and closer are the box's`;
  const { manager, reviewer } = reglages.defaultCalibrations ?? {};
  const { calibration, cooksBelow, maxTokens, maxRemovedLines } = reglages.closer ?? {};
  const n = (valeur: number | undefined) => (valeur === undefined ? "box" : String(valeur));
  // Un closer que le fichier tait est tout entier celui de la box.
  const closer = reglages.closer === undefined ? "closer box" : `closer ${d(calibration)}, cooks below ${n(cooksBelow)}, max tokens ${n(maxTokens)}, max removed lines ${n(maxRemovedLines)}`;
  return `project settings — ${brancheDite}; from ${FICHIER} on origin/${base}, reread at each use: manager ${d(manager)}, reviewer ${d(reviewer)}, ceiling ${d(reglages.calibrationCeiling)}, ${closer}${direSeuils(reglages)}`;
}

// Les seuils que le fichier fixe, nommés ; ce qu'il tait est celui de la box.
function direSeuils(reglages: ReglagesProjet): string {
  const noms = [...FAMILLES_DE_SEUILS.flatMap((famille) => Object.entries(reglages[famille] ?? {}).map(([nom]) => `${famille}.${nom}`)), ...(reglages.commonPaths === undefined ? [] : ["commonPaths"])];
  return noms.length === 0 ? "" : `, thresholds ${noms.join(" ")}`;
}

// L'environnement d'un projet, sa branche d'intégration résolue par son
// dépôt (`brancheDuProjet`) : celui d'une commande lancée hors de sa cuisine.
// Sans clone, ou sans branche dite nulle part, il reste tel quel.
export function avecLaBrancheDuDepot(env: Record<string, string | undefined>): Record<string, string | undefined> {
  const clone = env.BRIGADE_REPO_DIR;
  if (!clone || !existsSync(clone)) return env;
  const { branche } = brancheDuProjet(clone, env.BRIGADE_BASE_BRANCH || null);
  return branche === null ? env : { ...env, BRIGADE_BASE_BRANCH: branche };
}

// Les réglages que porte la branche d'intégration d'un projet, pour une
// commande qui les montre (`facts`, `station`) : null si le dépôt n'a pas le
// fichier, ou s'il ne se lit pas — ce que la cuisine, elle, dit et refuse.
export function reglagesPourMontrer(env: Record<string, string | undefined>): ReglagesProjet | null {
  const { BRIGADE_REPO_DIR: clone, BRIGADE_BASE_BRANCH: base } = avecLaBrancheDuDepot(env);
  if (!clone || !base || !existsSync(clone)) return null;
  try {
    return reglagesALaBase({ clone, base });
  } catch {
    return null;
  }
}

// Ce que la cuisine d'un projet lit de son dépôt en s'ouvrant.
export type DepotDuProjet = {
  // Son environnement, la branche d'intégration résolue (`brancheDuProjet`).
  env: Record<string, string | undefined>;
  branche: BrancheDuProjet;
  // Les réglages que la branche porte, null si elle n'a pas le fichier.
  reglages: ReglagesProjet | null;
  // De quoi les suivre à chaque usage (`suivreDecisions`).
  suivis: { auDemarrage: ReglagesProjet | null; relire: () => ReglagesProjet | null };
  // Ce que la cuisine en dit, une ligne chacun.
  dits: string[];
};

// Lit le dépôt du projet à l'ouverture de sa cuisine : sa branche
// d'intégration, puis les réglages qu'elle porte. Sans clone, rien ne se lit
// et rien ne change — c'est l'absence du clone que la cuisine refuse. Un
// fichier qui n'est pas fait de réglages du projet est un refus d'ouvrir
// (`ConfigInvalide`).
export function lireLeDepot(env: Record<string, string | undefined>): DepotDuProjet {
  const clone = env.BRIGADE_REPO_DIR;
  const ligne = env.BRIGADE_BASE_BRANCH || null;
  const sansDepot = (branche: BrancheDuProjet, dits: string[]): DepotDuProjet => ({ env, branche, reglages: null, suivis: { auDemarrage: null, relire: () => null }, dits });
  if (!clone || !existsSync(clone)) return sansDepot({ branche: ligne, provenance: ligne === null ? null : "configuration", problemes: [] }, []);
  const branche = brancheDuProjet(clone, ligne);
  if (branche.branche === null) return sansDepot(branche, branche.problemes);
  const lieu = { clone, base: branche.branche };
  let lus;
  try {
    lus = reglagesAuDemarrage(lieu);
  } catch (erreur) {
    throw new ConfigInvalide(`the project's settings on origin/${lieu.base} are refused — ${message(erreur)}`);
  }
  return {
    env: { ...env, BRIGADE_BASE_BRANCH: branche.branche },
    branche,
    reglages: lus.reglages,
    suivis: { auDemarrage: lus.reglages, relire: () => reglagesALaBase(lieu) },
    dits: [...branche.problemes, ...(lus.nonLu === null ? [] : [lus.nonLu]), direReglagesDuDepot(branche, lus.reglages, lieu.base)],
  };
}
