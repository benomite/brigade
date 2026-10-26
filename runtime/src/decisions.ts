// Les décisions du chef : ce qu'il décide pour son projet et qui n'est pas un
// fait de la machine — les stations, les seuils de coût, le calibrage du
// manager, du reviewer et du closer, le budget des gates. Leur support est le
// journal du projet, dans le répertoire d'état : ni le dépôt, où un cook peut
// écrire — un plafond qu'un cook peut relever n'est pas un plafond —, ni le
// drop-in de l'unité, qui ne change que par un `sudo` et un redémarrage. La
// cloison masque le répertoire d'état à tout ce qu'elle lance, et le runtime
// refuse de démarrer si son journal est sous le clone.
//
// Le runtime les relit à chaque lecture : une décision posée vaut à la
// suivante, sans redémarrage, et n'arrête rien de ce qui tourne. La variable
// d'environnement de même nom n'est plus lue : le runtime la dit ignorée.
// Aucune n'a de défaut, sauf le plafond de calibrage du manager — sans
// décision, il vaut `opus` / `high` (`reagir.ts`) — et le budget des gates
// (`cout-des-gates.ts`).
import { existsSync } from "node:fs";
import { Base } from "./base.ts";
import { EFFORTS, MODELES, type Calibrage } from "./calibrage.ts";
import { sous } from "./cloison.ts";
import { lireSeuils } from "./derive.ts";
import type { Evenement } from "./evenements.ts";
import type { Seuils } from "./events/drift.ts";
import type { ReglagesDeFermeture } from "./events/closing.ts";
import { configFermeture, provenancesDeFermeture } from "./closing/settings.ts";
import { lireBudget, lireBudgetDeLaBase } from "./cout-des-gates.ts";
import { cheminJournal, type Journal } from "./journal.ts";
import { configManager } from "./manager.ts";
import { plafondDuProjet, type PlafondLu } from "./reagir.ts";
import { variablesDuDepot } from "./reglages-projet/en-vigueur.ts";
import type { ReglagesProjet } from "./reglages-projet/reglages.ts";
import { configReviewer } from "./reviewer.ts";
import { ConfigInvalide } from "./runtime.ts";
import { lireStations, type StationDeclaree } from "./stations-declarees.ts";

// Les décisions, nommées par la variable qu'elles remplacent.
export const DECISIONS = [
  "BRIGADE_STATIONS",
  "BRIGADE_DRIFT_TICKET_TOKENS",
  "BRIGADE_DRIFT_LOST_TOKENS",
  "BRIGADE_DRIFT_FIRST_TRY_PERCENT",
  "BRIGADE_DRIFT_FIRST_TRY_WINDOW",
  "BRIGADE_GATES_BUDGET_SECONDS",
  "BRIGADE_GATES_BUDGET_CPU_SECONDS",
  "BRIGADE_GATES_BASE_BUDGET_SECONDS",
  "BRIGADE_GATES_BASE_BUDGET_CPU_SECONDS",
  "BRIGADE_MANAGER_MODEL",
  "BRIGADE_MANAGER_EFFORT",
  "BRIGADE_REVIEWER_MODEL",
  "BRIGADE_REVIEWER_EFFORT",
  "BRIGADE_CLOSING_MODEL",
  "BRIGADE_CLOSING_EFFORT",
  "BRIGADE_CLOSING_COOKS",
  "BRIGADE_CLOSING_MAX_TOKENS",
  "BRIGADE_CLOSING_MAX_REMOVED_LINES",
  "BRIGADE_CEILING_MODEL",
  "BRIGADE_CEILING_EFFORT",
] as const;

export type Decision = (typeof DECISIONS)[number];

// Celles sans lesquelles ce runtime ne sert pas : sans calibrage il refuse de
// démarrer, sans station il démarre et aucun cook ne part. Les seuils n'en
// sont pas : non déclarés, ils ne signalent rien.
export const OBLIGATOIRES: readonly Decision[] = ["BRIGADE_STATIONS", "BRIGADE_MANAGER_MODEL", "BRIGADE_MANAGER_EFFORT", "BRIGADE_REVIEWER_MODEL", "BRIGADE_REVIEWER_EFFORT"];
export type Posees = Partial<Record<Decision, string>>;

const POSEE = "decision.set";
const RETIREE = "decision.withdrawn";

const or = (valeurs: readonly string[]) => `${valeurs.slice(0, -1).join(", ")} or ${valeurs.at(-1)}`;
const parmi = (admis: readonly string[]) => (nom: Decision, valeur: string) => {
  if (!admis.includes(valeur)) throw new ConfigInvalide(`${nom} invalid: “${valeur}” — expected ${or(admis)}`);
};
// Un nombre que lit le lecteur du runtime (seuils, plafonds de la passe) : son
// refus, dit en anglais par la décision qui le pose.
const nombre = (lecteur: (env: Record<string, string>) => unknown, attendu: string) => (nom: Decision, valeur: string) => {
  try {
    lecteur({ [nom]: valeur });
  } catch (erreur) {
    if (!(erreur instanceof ConfigInvalide)) throw erreur;
    throw new ConfigInvalide(`${nom} invalid: “${valeur}” — expected ${attendu}`);
  }
};
const ENTIER = "an integer greater than zero";
const NOMBRE = "a number greater than zero";
const SECONDES = "a number of seconds greater than zero";

// Ce qu'une valeur doit être, lue seule : le lecteur même du runtime, pour
// qu'une décision ne puisse pas valoir ce que la variable ne vaudrait pas.
const VERIFIER: Record<Decision, (nom: Decision, valeur: string) => void> = {
  BRIGADE_STATIONS: (nom, valeur) => void lireStations({ [nom]: valeur }),
  BRIGADE_DRIFT_TICKET_TOKENS: nombre(lireSeuils, ENTIER),
  BRIGADE_DRIFT_LOST_TOKENS: nombre(lireSeuils, ENTIER),
  BRIGADE_DRIFT_FIRST_TRY_PERCENT: nombre(lireSeuils, NOMBRE),
  BRIGADE_DRIFT_FIRST_TRY_WINDOW: nombre(lireSeuils, ENTIER),
  BRIGADE_GATES_BUDGET_SECONDS: nombre(lireBudget, SECONDES),
  BRIGADE_GATES_BUDGET_CPU_SECONDS: nombre(lireBudget, SECONDES),
  BRIGADE_GATES_BASE_BUDGET_SECONDS: nombre(lireBudgetDeLaBase, SECONDES),
  BRIGADE_GATES_BASE_BUDGET_CPU_SECONDS: nombre(lireBudgetDeLaBase, SECONDES),
  BRIGADE_MANAGER_MODEL: parmi(MODELES),
  BRIGADE_MANAGER_EFFORT: parmi(EFFORTS),
  BRIGADE_REVIEWER_MODEL: parmi(MODELES),
  BRIGADE_REVIEWER_EFFORT: parmi(EFFORTS),
  BRIGADE_CLOSING_MODEL: parmi(MODELES),
  BRIGADE_CLOSING_EFFORT: parmi(EFFORTS),
  BRIGADE_CLOSING_COOKS: nombre(configFermeture, ENTIER),
  BRIGADE_CLOSING_MAX_TOKENS: nombre(configFermeture, ENTIER),
  BRIGADE_CLOSING_MAX_REMOVED_LINES: nombre(configFermeture, ENTIER),
  BRIGADE_CEILING_MODEL: parmi(MODELES),
  BRIGADE_CEILING_EFFORT: parmi(EFFORTS),
};

export const estUneDecision = (nom: string): nom is Decision => (DECISIONS as readonly string[]).includes(nom);

function exigerDecision(nom: string): Decision {
  if (!estUneDecision(nom)) throw new ConfigInvalide(`“${nom}” is not a chef's decision — expected ${or(DECISIONS)}`);
  return nom;
}

// Refuse une valeur que le runtime ne lirait pas. Vide, ce n'est pas une
// valeur : une décision se retire, elle ne se pose pas à rien.
export function verifierDecision(nom: string, valeur: string): void {
  const decision = exigerDecision(nom);
  if (valeur.trim() === "") throw new ConfigInvalide(`${decision}: an empty value is not a decision — withdraw it to go back to the environment`);
  VERIFIER[decision](decision, valeur.trim());
}

// Les décisions que le journal porte, relues à chaque appel. Une décision que
// ce runtime ne connaît pas — écrite par une version plus récente — est
// ignorée.
export function decisionsPosees(base: Base): Posees {
  const posees: Posees = {};
  const lignes = base.lire<{ type: string; payload: string }>("SELECT type, payload FROM events WHERE type IN (?, ?) ORDER BY seq", POSEE, RETIREE);
  for (const { type, payload } of lignes) {
    const { name, value } = JSON.parse(payload) as { name?: unknown; value?: unknown };
    if (typeof name !== "string" || !estUneDecision(name)) continue;
    if (type === RETIREE) delete posees[name];
    else if (typeof value === "string") posees[name] = value;
  }
  return posees;
}

// L'environnement tel que le runtime le lit : celui de son process, sans les
// variables de décision — le drop-in n'en est plus le support —, avec les
// décisions posées au journal, et par-dessus elles le calibrage du manager et
// du reviewer et les réglages du closer que le dépôt du projet porte
// (`reglages-projet/en-vigueur.ts`).
export function environnementDecide(env: Record<string, string | undefined>, posees: Posees, depot: ReglagesProjet | null = null): Record<string, string | undefined> {
  const sans = { ...env };
  for (const nom of DECISIONS) delete sans[nom];
  return { ...sans, ...posees, ...variablesDuDepot(depot) };
}

// Les variables de décision qu'un environnement porte encore, valeur non
// vide : elles sont ignorées.
export function decisionsDansLEnvironnement(env: Record<string, string | undefined>): Decision[] {
  return DECISIONS.filter((nom) => (env[nom] ?? "") !== "");
}

// Le geste de `station` qui pose une décision.
export function gesteDe(nom: Decision): string {
  return GESTES_DES_DECISIONS[nom];
}
const GESTES_DES_DECISIONS: Record<Decision, string> = {
  BRIGADE_STATIONS: "stations",
  BRIGADE_DRIFT_TICKET_TOKENS: "seuil-ticket",
  BRIGADE_DRIFT_LOST_TOKENS: "seuil-perdus",
  BRIGADE_DRIFT_FIRST_TRY_PERCENT: "seuil-renvois",
  BRIGADE_DRIFT_FIRST_TRY_WINDOW: "fenetre-renvois",
  BRIGADE_GATES_BUDGET_SECONDS: "budget-gates",
  BRIGADE_GATES_BUDGET_CPU_SECONDS: "budget-gates-cpu",
  BRIGADE_GATES_BASE_BUDGET_SECONDS: "budget-base",
  BRIGADE_GATES_BASE_BUDGET_CPU_SECONDS: "budget-base-cpu",
  BRIGADE_MANAGER_MODEL: "manager-modele",
  BRIGADE_MANAGER_EFFORT: "manager-effort",
  BRIGADE_REVIEWER_MODEL: "reviewer-modele",
  BRIGADE_REVIEWER_EFFORT: "reviewer-effort",
  BRIGADE_CLOSING_MODEL: "closer-modele",
  BRIGADE_CLOSING_EFFORT: "closer-effort",
  BRIGADE_CLOSING_COOKS: "closer-cooks",
  BRIGADE_CLOSING_MAX_TOKENS: "closer-tokens",
  BRIGADE_CLOSING_MAX_REMOVED_LINES: "closer-retraits",
  BRIGADE_CEILING_MODEL: "ceiling-modele",
  BRIGADE_CEILING_EFFORT: "ceiling-effort",
};

// Ce que le runtime dit d'une variable de décision laissée dans son
// environnement : nommée, ignorée, et le geste qui la remplace.
export function direDecisionIgnoree(nom: Decision, projet: string): string {
  return `${nom} is ignored in the unit's environment: a chef's decision is no longer read there — set it with \`brigade ${projet} station ${gesteDe(nom)} <value>\`, then remove \`Environment=${nom}\` from the drop-in`;
}

// Le support des décisions : le journal du répertoire d'état. Sous le clone,
// un cook pourrait l'atteindre — c'est un refus de démarrer.
export function supportDesDecisions(lieux: { repertoireEtat: string; clone: string }): string {
  const support = cheminJournal(lieux.repertoireEtat);
  if (sous(lieux.clone, support)) {
    throw new ConfigInvalide(
      `BRIGADE_STATE_DIR (${lieux.repertoireEtat}) est sous BRIGADE_REPO_DIR (${lieux.clone}) : les décisions du chef y seraient à portée d'un cook — un plafond qu'un cook peut relever n'est pas un plafond. Poser le répertoire d'état hors du clone`,
    );
  }
  return support;
}

// Ce que le journal du répertoire d'état porte, sans le refuser : les
// décisions lisibles, et le motif de chacune qui ne l'est pas. Aucun journal,
// aucune décision.
export function lireLesDecisions(repertoireEtat: string): { posees: Posees; illisibles: string[] } {
  const chemin = cheminJournal(repertoireEtat);
  if (!existsSync(chemin)) return { posees: {}, illisibles: [] };
  const base = new Base(chemin, { lectureSeule: true, attenteMs: 5000 });
  try {
    const posees: Posees = {};
    const illisibles: string[] = [];
    for (const [nom, valeur] of Object.entries(decisionsPosees(base))) {
      try {
        verifierDecision(nom, valeur);
        posees[nom as Decision] = valeur;
      } catch (erreur) {
        illisibles.push(`chef's decision unreadable in the log — ${erreur instanceof Error ? erreur.message : String(erreur)}`);
      }
    }
    return { posees, illisibles };
  } finally {
    base.fermer();
  }
}

// Les décisions que le runtime lit avant de démarrer, avant d'avoir ouvert son
// journal pour y écrire. Une décision illisible est un refus de démarrer,
// comme la variable le serait.
export function decisionsAuDemarrage(repertoireEtat: string): Posees {
  const { posees, illisibles } = lireLesDecisions(repertoireEtat);
  if (illisibles[0] !== undefined) throw new ConfigInvalide(illisibles[0]);
  return posees;
}

// Pose une décision au journal, au nom de `auteur`. Rend le fait écrit, ou
// null si elle valait déjà cela. Une valeur que le runtime ne lirait pas est
// refusée, et rien n'est écrit. N'écrit que le journal : ni le dépôt, ni le
// drop-in, et rien n'est arrêté ni relancé.
export function poserDecision(journal: Journal, pose: { projet: string; nom: string; valeur: string; auteur: string }): Evenement | null {
  verifierDecision(pose.nom, pose.valeur);
  const nom = pose.nom as Decision;
  const value = pose.valeur.trim();
  return journal.base.transaction(() => {
    const previous = decisionsPosees(journal.base)[nom] ?? null;
    if (previous === value) return null;
    return journal.ajouter({ project: pose.projet, ticket: null, author: pose.auteur, type: POSEE, payload: { name: nom, value, previous } });
  });
}

// Retire une décision : l'environnement est relu comme avant. Rend le fait
// écrit, ou null si le journal n'en portait pas.
export function retirerDecision(journal: Journal, retrait: { projet: string; nom: string; auteur: string }): Evenement | null {
  const nom = exigerDecision(retrait.nom);
  return journal.base.transaction(() => {
    const previous = decisionsPosees(journal.base)[nom];
    if (previous === undefined) return null;
    return journal.ajouter({ project: retrait.projet, ticket: null, author: retrait.auteur, type: RETIREE, payload: { name: nom, previous } });
  });
}

// Ce que le runtime lit des décisions, à chaque appel.
export type Decisions = {
  stations(): StationDeclaree[];
  seuils(): Seuils;
  manager(): Calibrage;
  // Jusqu'où le manager monte le calibrage d'un ticket rouge.
  plafond(): PlafondLu;
  reviewer(): Calibrage;
  fermeture(): ReglagesDeFermeture;
};

// Les réglages du dépôt du projet, tels que la cuisine les suit : ceux lus à
// son ouverture, et de quoi les relire — sur la branche d'intégration
// rapatriée, à chaque usage.
export type ReglagesSuivis = { auDemarrage: ReglagesProjet | null; relire: () => ReglagesProjet | null };

// Suit les décisions du chef sur le journal de `base`, par-dessus `env`.
// Chaque lecture relit le journal. Ce qui ne se lit plus — une décision
// retirée sans variable derrière, un journal momentanément illisible — ne
// tombe pas sur un défaut : le runtime s'en tient à ce qu'il lisait, et le dit
// une fois. La première lecture, elle, n'a rien à quoi se tenir : illisible,
// c'est un refus de démarrer.
// `depot` : les réglages que le dépôt du projet porte. Le calibrage du manager
// et du reviewer, le plafond de calibrage et les réglages du closer y sont
// relus à chaque lecture, et passent avant les décisions de la box. Ceux du
// closer disent d'où chacun vient (`from`) : c'est ce que le runtime en note. Illisibles un moment, le runtime s'en
// tient aux derniers qu'il a lus, et le dit une fois.
export function suivreDecisions(base: Base, env: Record<string, string | undefined>, avertir: (message: string) => void = (message) => console.error(message), depot?: ReglagesSuivis): Decisions {
  let derniers = depot?.auDemarrage ?? null;
  let ditDuDepot: string | null = null;
  const duDepot = (premiere: boolean): ReglagesProjet | null => {
    if (depot === undefined || premiere) return derniers;
    try {
      derniers = depot.relire();
      ditDuDepot = null;
    } catch (erreur) {
      const motif = erreur instanceof Error ? erreur.message : String(erreur);
      if (motif !== ditDuDepot) avertir(`brigade : réglages du dépôt non relus — ${motif} ; le runtime s'en tient à ce qu'il lisait`);
      ditDuDepot = motif;
    }
    return derniers;
  };
  // `avecDepot` : la lecture prend les réglages du dépôt — relus à chacune.
  const suivre = <T>(quoi: string, lire: (env: Record<string, string | undefined>, reglages: ReglagesProjet | null) => T, avecDepot = false): (() => T) => {
    const decide = (premiere: boolean) => {
      const reglages = avecDepot ? duDepot(premiere) : null;
      return lire(environnementDecide(env, decisionsPosees(base), reglages), reglages);
    };
    let retenue = decide(true);
    let dit: string | null = null;
    return () => {
      try {
        retenue = decide(false);
        dit = null;
      } catch (erreur) {
        const motif = erreur instanceof Error ? erreur.message : String(erreur);
        if (motif !== dit) avertir(`brigade : ${quoi} non relu — ${motif} ; le runtime s'en tient à ce qu'il lisait`);
        dit = motif;
      }
      return retenue;
    };
  };
  return {
    stations: suivre("les stations", lireStations),
    seuils: suivre("les seuils de la dérive", lireSeuils),
    manager: suivre("le calibrage du manager", (lu) => configManager(lu).calibrage, true),
    plafond: suivre("le plafond de calibrage", plafondDuProjet, true),
    reviewer: suivre("le calibrage du reviewer", (lu) => configReviewer(lu).calibrage, true),
    fermeture: suivre("les réglages du closer", (lu, reglages) => ({ ...configFermeture(lu), from: provenancesDeFermeture(lu, reglages) }), true),
  };
}
