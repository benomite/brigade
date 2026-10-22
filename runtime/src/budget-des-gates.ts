// Le ticket des gates hors budget : ce que la cuisine ouvre seule sur le
// projet quand le dernier passage de ses gates dépasse son budget
// (`cout-des-gates.ts`) — en durée, en processeur, ou les deux. Le chef n'a
// pas à remarquer la dérive : le ticket la dit, avec ce qui a été mesuré, le
// budget, et ce qui le dépasse.
//
// Un seul à la fois par projet : tant que le dernier ouvert l'est encore sur
// GitHub, un passage hors budget n'en ouvre pas d'autre. Fermé — ou disparu —,
// le passage hors budget suivant en ouvre un neuf. Sous le budget, rien ne
// part vers GitHub.
//
// Sa création est annoncée au journal avant l'appel à GitHub : la réponse
// perdue, ou le runtime tué entre les deux, l'issue se retrouve par sa marque
// au lieu d'être ouverte deux fois — comme le ticket de réparation de la base
// (`reparation.ts`).
import { DE_CONFIANCE } from "./alimenter.ts";
import type { Base } from "./base.ts";
import { coutDuProjet, lireBudget, type BudgetDesGates, type PassageDesGates } from "./cout-des-gates.ts";
import { decisionsPosees } from "./decisions.ts";
import type { DimensionDuBudget, FaitBudgetDesGates } from "./events/gates.ts";
import { LABEL, type GitHub } from "./github.ts";
import type { Journal } from "./journal.ts";

// Le calibrage du ticket : alléger une suite sans rien retirer de ce qu'elle
// prouve demande de la lire entière.
export const CALIBRAGE_BUDGET = { model: "opus", effort: "high" } as const;
export const LABELS_BUDGET = [LABEL, `model:${CALIBRAGE_BUDGET.model}`, `effort:${CALIBRAGE_BUDGET.effort}`];

// L'issue retrouvée d'une annonce : créée depuis, avec cette marge.
const MARGE_MS = 600_000;

const OUVERTURE = "gates.budget-ticket-opening" satisfies FaitBudgetDesGates["type"];
const OUVERT = "gates.budget-ticket-opened" satisfies FaitBudgetDesGates["type"];
const FERME = "gates.budget-ticket-closed" satisfies FaitBudgetDesGates["type"];

// La marque d'une issue de budget : le projet, et le numéro de l'annonce au
// journal — c'est elle qui retrouve l'issue d'une création dont la réponse
// s'est perdue, et pas celle d'une annonce d'avant.
const MARQUE = /^\s*<!--\s*brigade:budget-gates (\S+) (\d+)\s*-->\s*$/m;
export const marqueDuBudget = (projet: string, annonce: number) => `<!-- brigade:budget-gates ${projet} ${annonce} -->`;
export function annonceDuBudget(corps: string, projet: string): number | null {
  const lue = MARQUE.exec(corps);
  return lue !== null && lue[1] === projet ? Number(lue[2]) : null;
}

// Ce que le passage dépasse du budget : sa durée, son processeur.
export function dimensionsDepassees(passage: PassageDesGates, budget: BudgetDesGates): DimensionDuBudget[] {
  return [
    ...(passage.durationSeconds > budget.durationSeconds ? (["duration"] as const) : []),
    ...(passage.cpuSeconds !== null && passage.cpuSeconds > budget.cpuSeconds ? (["cpu"] as const) : []),
  ];
}

export type HorsBudget = { projet: string; passage: PassageDesGates; budget: BudgetDesGates; depassees: DimensionDuBudget[] };

const NOMS: Record<DimensionDuBudget, string> = { duration: "wall-clock duration", cpu: "CPU" };
const secondes = (valeur: number | null) => (valeur === null ? "not measured" : `${valeur} s`);
const ecart = (mesure: number | null, budget: number) => (mesure === null ? "" : ` (+${Math.round(((mesure - budget) / budget) * 100)} %)`);

export function titreDuBudget({ projet, passage, budget, depassees }: HorsBudget): string {
  const dites = depassees.map((dimension) =>
    dimension === "duration" ? `${passage.durationSeconds} s for a budget of ${budget.durationSeconds} s` : `${passage.cpuSeconds} s of CPU for a budget of ${budget.cpuSeconds} s`,
  );
  return `Bring the gates of ${projet} back under their budget: ${dites.join(", ")}`;
}

export function corpsDuBudget(horsBudget: HorsBudget, annonce: number): string {
  const { projet, passage, budget, depassees } = horsBudget;
  const origine = (posee: boolean) => (posee ? "set by the chef" : "default");
  const quel = passage.ticket === null ? "the gates of the integration base" : `the gates of #${passage.ticket}`;
  return [
    marqueDuBudget(projet, annonce),
    "",
    "## Context",
    "",
    `The gates of ${projet} went over their budget: ${depassees.map((dimension) => NOMS[dimension]).join(" and ")} exceeded. The run that did it — ${quel}, run by the ${passage.runner} at ${passage.at}, ${passage.outcome} — was measured as follows:`,
    "",
    "| | Measured | Budget | |",
    "|---|---|---|---|",
    `| Duration (wall-clock) | ${secondes(passage.durationSeconds)} | ${budget.durationSeconds} s (${origine(budget.parLeChef.durationSeconds)}) | ${depassees.includes("duration") ? `**exceeded**${ecart(passage.durationSeconds, budget.durationSeconds)}` : "within"} |`,
    `| CPU (user + system, children included) | ${secondes(passage.cpuSeconds)} | ${budget.cpuSeconds} s (${origine(budget.parLeChef.cpuSeconds)}) | ${depassees.includes("cpu") ? `**exceeded**${ecart(passage.cpuSeconds, budget.cpuSeconds)}` : "within"} |`,
    "",
    "Gates over budget hold the box: several suites at once saturate it, and every servable ticket waits. The lever is lighter gates.",
    "",
    "## Acceptance criteria",
    "",
    `- A full run of the gates of ${projet} stays within its budget: at most ${budget.durationSeconds} s of wall-clock time and ${budget.cpuSeconds} s of CPU.`,
    "- The cost is cut at its cause — the costliest tests, what they launch, what they wait for: no test is removed, skipped or weakened to get there.",
    "",
    "---",
    "",
    `_Opened by the kitchen on its own, without the chef: the gates went over their budget. Calibrated \`${CALIBRAGE_BUDGET.model}\` / \`${CALIBRAGE_BUDGET.effort}\`. While it is open, no other one is opened for ${projet}; closed, the next run over budget opens a new one._`,
  ].join("\n");
}

type Suivi = { seq: number; at: string; type: FaitBudgetDesGates["type"]; ticket: number | null };

// Le dernier mot du journal sur le ticket de budget du projet.
function dernierSuivi(base: Base, projet: string): Suivi | null {
  return base.lire<Suivi>("SELECT seq, at, type, ticket FROM events WHERE project = ? AND type IN (?, ?, ?) ORDER BY seq DESC LIMIT 1", projet, OUVERTURE, OUVERT, FERME)[0] ?? null;
}

// Le ticket que la cuisine a ouvert pour les gates du projet, tant que rien ne
// l'a vu fermé : ce que `facts` en dit. Null s'il n'y en a pas.
export type TicketDuBudget = { number: number; openedAt: string; exceeded: DimensionDuBudget[] };
export function ticketDuBudget(base: Base, projet: string): TicketDuBudget | null {
  const suivi = dernierSuivi(base, projet);
  if (suivi === null || suivi.type !== OUVERT || suivi.ticket === null) return null;
  const [ligne] = base.lire<{ payload: string }>("SELECT payload FROM events WHERE seq = ?", suivi.seq);
  const { exceeded } = JSON.parse(ligne?.payload ?? "{}") as { exceeded?: DimensionDuBudget[] };
  return { number: suivi.ticket, openedAt: suivi.at, exceeded: exceeded ?? [] };
}

export type OptionsBudget = {
  journal: Journal;
  github: Pick<GitHub, "issue" | "creerIssue" | "issuesDepuis">;
  projet: string;
  auteur: string;
  maintenant: () => Date;
};

// Après un passage des gates : hors budget, et sans ticket de budget ouvert,
// en ouvre un. Rend le ticket du projet et s'il vient d'être ouvert, ou null
// sous le budget. Lève sur une panne de GitHub : rien n'est alors noté que
// l'annonce, et le passage hors budget suivant reprend là.
export async function tenirLeBudget(options: OptionsBudget): Promise<{ ticket: number; ouvert: boolean } | null> {
  const { journal, github, projet, auteur } = options;
  const { base } = journal;
  const budget = lireBudget(decisionsPosees(base));
  const { latest: passage } = coutDuProjet(base, projet, budget, options.maintenant());
  const depassees = passage === null ? [] : dimensionsDepassees(passage, budget);
  if (passage === null || depassees.length === 0) return null;
  const noter = (ticket: number | null, fait: FaitBudgetDesGates) => journal.ajouter({ project: projet, ticket, author: auteur, ...fait });

  let suivi = dernierSuivi(base, projet);
  if (suivi?.type === OUVERT && suivi.ticket !== null) {
    const lue = await github.issue(suivi.ticket);
    if (lue !== null && lue.state === "open") return { ticket: suivi.ticket, ouvert: false };
    noter(suivi.ticket, { type: FERME, payload: { state: lue === null ? "gone" : "closed" } });
    suivi = null;
  }
  // Une annonce sans suite : l'issue a peut-être été créée, sa réponse perdue.
  let annonce = suivi?.type === OUVERTURE ? suivi : null;
  let numero: number | undefined;
  if (annonce !== null) {
    const { seq } = annonce;
    const recentes = await github.issuesDepuis(new Date(Date.parse(annonce.at) - MARGE_MS).toISOString());
    // La marque ne vaut que sur une issue de confiance : n'importe qui peut en
    // ouvrir une qui la porte.
    numero = recentes.find((issue) => DE_CONFIANCE.includes(issue.association) && annonceDuBudget(issue.body, projet) === seq)?.number;
  } else {
    const ecrite = noter(null, { type: OUVERTURE, payload: { exceeded: depassees } });
    if (ecrite === null) throw new Error("annonce du ticket de budget non écrite");
    annonce = { seq: ecrite.seq, at: ecrite.at, type: OUVERTURE, ticket: null };
  }
  const retrouvee = numero !== undefined;
  const horsBudget = { projet, passage, budget, depassees };
  numero ??= await github.creerIssue({ titre: titreDuBudget(horsBudget), corps: corpsDuBudget(horsBudget, annonce.seq), labels: LABELS_BUDGET });
  noter(numero, {
    type: OUVERT,
    payload: {
      durationSeconds: passage.durationSeconds,
      cpuSeconds: passage.cpuSeconds,
      budget: { durationSeconds: budget.durationSeconds, cpuSeconds: budget.cpuSeconds },
      exceeded: depassees,
      reconciled: retrouvee,
    },
  });
  return { ticket: numero, ouvert: !retrouvee };
}
