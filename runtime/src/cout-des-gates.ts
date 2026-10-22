// Ce que coûtent les gates d'un projet : chaque passage écrit au journal (son
// projet, son ticket, qui l'a joué, son horloge, son processeur, son heure),
// le budget du projet face auquel il se juge, et ce qu'en lit l'app par
// `facts` — le dernier passage, son dépassement, les totaux et les moyennes de
// la dernière heure et du dernier jour, et la tendance de l'une face à l'autre.
//
// Le budget est une décision du chef, par projet (`decisions.ts`) : une durée
// et un processeur, chacun avec son défaut. La durée par défaut est le seuil de
// dérive de la durée des gates (`derive.ts`) ; le processeur par défaut est
// quatre cœurs pleins sur cette durée — la moitié d'une box de huit cœurs, et
// moins que les quatre à cinq qu'une suite tenait quand trois de front l'ont
// saturée (épique #1313).
import type { Base } from "./base.ts";
import { SEUIL_DUREE_GATES_PAR_DEFAUT } from "./derive.ts";
import type { EmpreinteDesGates } from "./empreinte-des-gates.ts";
import type { CoureurDesGates, FaitGates } from "./events/gates.ts";
import type { Gates } from "./events/pass.ts";
import type { CoutDesGates } from "./gates.ts";
import type { Journal } from "./journal.ts";
import { lire } from "./plafonds.ts";

export const BUDGET_DUREE = "BRIGADE_GATES_BUDGET_SECONDS";
export const BUDGET_PROCESSEUR = "BRIGADE_GATES_BUDGET_CPU_SECONDS";
export const BUDGET_DUREE_PAR_DEFAUT = SEUIL_DUREE_GATES_PAR_DEFAUT;
export const BUDGET_PROCESSEUR_PAR_DEFAUT = 4 * SEUIL_DUREE_GATES_PAR_DEFAUT;

const TYPE: FaitGates["type"] = "gates.ran";
const HEURE_MS = 3_600_000;
const JOUR_MS = 24 * HEURE_MS;
// L'écart, en part de la moyenne du dernier jour, au-delà duquel la moyenne de la dernière heure monte ou
// descend : en deçà, elle tient.
export const ECART_DE_TENDANCE = 0.1;

// `parLeChef` : posé par le chef — faux, c'est le défaut qui vaut.
export type BudgetDesGates = { durationSeconds: number; cpuSeconds: number; parLeChef: { durationSeconds: boolean; cpuSeconds: boolean } };

const secondes = (env: Record<string, string | undefined>, variable: string, defaut: number) =>
  lire(env, variable, defaut, "a number of seconds greater than zero", (valeur) => valeur > 0 && Number.isFinite(valeur));

// Le budget, lu de l'environnement décidé (`environnementDecide`) ou des
// seules décisions posées. Mal écrit, c'est un refus : la décision ne se pose
// pas, comme la variable ne se lirait pas.
export function lireBudget(env: Record<string, string | undefined>): BudgetDesGates {
  const pose = (variable: string) => (env[variable] ?? "") !== "";
  return {
    durationSeconds: secondes(env, BUDGET_DUREE, BUDGET_DUREE_PAR_DEFAUT),
    cpuSeconds: secondes(env, BUDGET_PROCESSEUR, BUDGET_PROCESSEUR_PAR_DEFAUT),
    parLeChef: { durationSeconds: pose(BUDGET_DUREE), cpuSeconds: pose(BUDGET_PROCESSEUR) },
  };
}

// Écrit au journal ce qu'un passage des gates a coûté. Rien sans coût : le
// script n'a pas été lancé. Des gates non jouées n'ont rien coûté non plus.
// `ticket` : nul pour les gates de la base. `empreinte` : ce que le passage a
// jugé (`empreinte-des-gates.ts`), qu'un passage suivant sur le même code
// reprend au lieu de rejouer — une reprise n'écrit rien ici.
export function noterCoutDesGates(journal: Journal, passage: { projet: string; ticket: number | null; coureur: CoureurDesGates; auteur: string; gates: Gates; cout: CoutDesGates | null; empreinte?: EmpreinteDesGates }): void {
  const { cout, gates, empreinte } = passage;
  if (cout === null || gates.outcome === "skipped" || gates.reused !== undefined) return;
  journal.ajouter({
    project: passage.projet,
    ticket: passage.ticket,
    author: passage.auteur,
    type: TYPE,
    payload: { runner: passage.coureur, durationMs: cout.durationMs, cpuMs: cout.cpuMs, outcome: gates.outcome, ...(empreinte ? { tree: empreinte.tree, config: empreinte.config } : {}) },
  });
}

// Un passage relu du journal. `cpuSeconds` : null quand son processeur n'a
// pas été dit (gates coupées).
export type PassageDesGates = {
  project: string;
  ticket: number | null;
  runner: CoureurDesGates;
  outcome: FaitGates["payload"]["outcome"];
  durationSeconds: number;
  cpuSeconds: number | null;
  at: string;
};

export type CoutDuProjet = {
  budget: BudgetDesGates;
  // Le dernier passage du projet, null s'il n'en a eu aucun.
  latest: PassageDesGates | null;
  // Le dernier passage dépasse le budget : sa durée ou son processeur. Faux
  // sans passage.
  overBudget: boolean;
  // Les passages des dernières 24 heures, jusqu'à la lecture comprise.
  lastDay: FenetreDesGates;
  // Ceux de la dernière heure, de même.
  lastHour: FenetreDesGates;
  // Ce que coûte un passage en moyenne, sur chaque fenêtre : la durée sur tous
  // ses passages, le processeur sur ceux qui l'ont dit — null sans passage.
  averages: { lastHour: MoyennesDesGates; lastDay: MoyennesDesGates };
  // La moyenne de la dernière heure face à celle du dernier jour : `up` ou
  // `down` au-delà de `ECART_DE_TENDANCE`, `steady` en deçà — null quand l'une
  // des deux manque.
  trend: { durationSeconds: TendanceDesGates | null; cpuSeconds: TendanceDesGates | null };
};

// Les passages d'une fenêtre : combien, et leur horloge et leur processeur au
// total (un passage sans processeur compte 0).
export type FenetreDesGates = { runs: number; durationSeconds: number; cpuSeconds: number };
export type MoyennesDesGates = { durationSeconds: number | null; cpuSeconds: number | null };
export type TendanceDesGates = "up" | "down" | "steady";

const enSecondes = (ms: number) => Math.round(ms / 100) / 10;

type Ligne = { project: string; ticket: number | null; payload: string; at: string };
const relu = ({ project, ticket, payload, at }: Ligne): PassageDesGates => {
  const lu = JSON.parse(payload) as FaitGates["payload"];
  return { project, ticket, runner: lu.runner, outcome: lu.outcome, durationSeconds: enSecondes(lu.durationMs), cpuSeconds: lu.cpuMs === null ? null : enSecondes(lu.cpuMs), at };
};

// Les passages du projet, du plus récent au plus ancien, jusqu'à `depuis`
// exclu — tous, sans `depuis`.
export function passagesDesGates(base: Base, projet: string, depuis?: Date): PassageDesGates[] {
  const lignes = base.lire<Ligne>("SELECT project, ticket, payload, at FROM events WHERE type = ? AND project = ? ORDER BY seq DESC", TYPE, projet);
  const limite = depuis?.getTime();
  const passages: PassageDesGates[] = [];
  for (const ligne of lignes) {
    if (limite !== undefined && Date.parse(ligne.at) <= limite) break;
    passages.push(relu(ligne));
  }
  return passages;
}

export const depasse = (passage: PassageDesGates, budget: BudgetDesGates) => passage.durationSeconds > budget.durationSeconds || (passage.cpuSeconds !== null && passage.cpuSeconds > budget.cpuSeconds);

// Ce que les gates du projet coûtent face à son budget : la lecture de `facts`.
export function coutDuProjet(base: Base, projet: string, budget: BudgetDesGates, maintenant: Date): CoutDuProjet {
  const latest = base.lire<Ligne>("SELECT project, ticket, payload, at FROM events WHERE type = ? AND project = ? ORDER BY seq DESC LIMIT 1", TYPE, projet).map(relu)[0] ?? null;
  const jour = passagesDesGates(base, projet, new Date(maintenant.getTime() - JOUR_MS)).filter((passage) => Date.parse(passage.at) <= maintenant.getTime());
  const heure = jour.filter((passage) => Date.parse(passage.at) > maintenant.getTime() - HEURE_MS);
  const somme = (valeurs: number[]) => Math.round(valeurs.reduce((total, valeur) => total + valeur * 10, 0)) / 10;
  const moyenne = (valeurs: number[]) => (valeurs.length === 0 ? null : Math.round((valeurs.reduce((total, valeur) => total + valeur, 0) / valeurs.length) * 10) / 10);
  const fenetre = (passages: PassageDesGates[]): FenetreDesGates => ({ runs: passages.length, durationSeconds: somme(passages.map((passage) => passage.durationSeconds)), cpuSeconds: somme(passages.map((passage) => passage.cpuSeconds ?? 0)) });
  const moyennes = (passages: PassageDesGates[]): MoyennesDesGates => ({
    durationSeconds: moyenne(passages.map((passage) => passage.durationSeconds)),
    cpuSeconds: moyenne(passages.flatMap((passage) => (passage.cpuSeconds === null ? [] : [passage.cpuSeconds]))),
  });
  const tendance = (recente: number | null, reference: number | null): TendanceDesGates | null => {
    if (recente === null || reference === null || reference === 0) return null;
    if (recente > reference * (1 + ECART_DE_TENDANCE)) return "up";
    return recente < reference * (1 - ECART_DE_TENDANCE) ? "down" : "steady";
  };
  const averages = { lastHour: moyennes(heure), lastDay: moyennes(jour) };
  return {
    budget,
    latest,
    overBudget: latest !== null && depasse(latest, budget),
    lastDay: fenetre(jour),
    lastHour: fenetre(heure),
    averages,
    trend: { durationSeconds: tendance(averages.lastHour.durationSeconds, averages.lastDay.durationSeconds), cpuSeconds: tendance(averages.lastHour.cpuSeconds, averages.lastDay.cpuSeconds) },
  };
}
