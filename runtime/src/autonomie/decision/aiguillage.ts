// Routing a decision by the project's autonomy table (`autonomie/table.ts`).
// The kitchen calls it whenever a decision of one of the table's kinds arises
// — validating screens, merging, changing a specification, priorities, cost,
// dependencies, publishing — and the position of that kind says where it goes:
//
// - `brigade decides`: the kitchen applies it, with no card and no trace for
//   the chef beyond what applying it writes;
// - `brigade decides and tells me`: the kitchen applies it, and an
//   `autonomy.reported` entry says what was done and where to see it — the
//   daily report reads them (`rapport`);
// - `I decide`: nothing is applied, an `autonomy.card-raised` card asks the
//   chef, with its choices.
//
// The rows that are always `I decide` — production, secrets, what is
// published outside the repository — always raise a card, whatever the table
// says. The table is read again on every routing: a row the chef moves holds
// at the next decision, with no restart.
//
// A row the chef set nothing for routes `today`: the call site keeps the path
// it had before the table, and nothing is written here — a project with no
// table behaves as before. The Merge row is the `merge` grant: it routes
// `today` until the table has set it once, so the pass keeps its own reading
// of the grant (its uses, its deadline) for a project that never touched it.
import type { Base } from "../../base.ts";
import type { Journal } from "../../journal.ts";
import { estFixe, lireAutonomie, type Fixe, type Geste, type Position, type Rangee } from "../table.ts";
import type { ChoixDeCarte } from "./evenements.ts";

export type Decision = {
  row: Rangee | Fixe;
  // Its identity, for instance `merge:#1561`: the same decision arising again
  // while its card is raised raises no second card.
  id: string;
  ticket: number | null;
  // What the chef is asked, if the card is theirs.
  question: string;
  // What the chef can answer, the first being what brigade would do.
  choices: ChoixDeCarte[];
};

// What applying a decision did, said for the chef: the report's entry.
export type Accompli = { what: string; link: string };

export type Voie = "today" | Position;

export type Carte = { seq: number; at: string; ticket: number | null; row: Rangee | Fixe; decision: string; question: string; choices: ChoixDeCarte[] };
export type EntreeDuRapport = { seq: number; at: string; ticket: number | null; row: Rangee; decision: string; what: string; link: string };

export type Aiguillage<T> =
  | { voie: "today"; position: Position }
  | { voie: "brigade-decides"; resultat: T }
  | { voie: "brigade-decides-and-tells-me"; resultat: T; entree: EntreeDuRapport }
  // `nouvelle`: false when the card was already raised for that decision.
  | { voie: "i-decide"; carte: Carte; nouvelle: boolean };

// A decision the routing cannot carry: nothing is applied, nothing written.
export class DecisionInvalide extends Error {}

const RAPPORTEE = "autonomy.reported";
const LEVEE = "autonomy.card-raised";

// Has the table ever set the Merge row? Until then, the row is only the grant
// the pass reads itself.
function mergePoseParLaTable(base: Base): boolean {
  return base.lire("SELECT 1 FROM events WHERE type = 'autonomy.changed' AND json_extract(payload, '$.row') = 'merge' LIMIT 1").length > 0;
}

// Where a decision of that kind goes at `maintenant`, read from the log now.
// For a call site that applies the decision itself: on a `brigade decides and
// tells me`, it then writes the report's entry by `consigner`.
export function voieDe(base: Base, row: Rangee | Fixe, maintenant: Date): { voie: Voie; position: Position } {
  if (estFixe(row)) return { voie: "i-decide", position: "i-decide" };
  const ligne = lireAutonomie(base, maintenant).rows.find((ligne) => ligne.row === row);
  if (!ligne) throw new DecisionInvalide(`“${row}” is not a row of the autonomy table`);
  const today = ligne.source === "default" || (row === "merge" && !mergePoseParLaTable(base));
  return { voie: today ? "today" : ligne.position, position: ligne.position };
}

function exigerDecision(decision: Decision): void {
  if (decision.id.trim() === "") throw new DecisionInvalide("a decision needs an id");
  if (decision.choices.length === 0) throw new DecisionInvalide(`the decision ${decision.id} has no choice to put to the chef`);
  const ids = decision.choices.map(({ id }) => id);
  if (new Set(ids).size !== ids.length) throw new DecisionInvalide(`the decision ${decision.id} lists a choice twice`);
}

type LigneEvenement = { seq: number; at: string; ticket: number | null; payload: string };

const versCarte = ({ seq, at, ticket, payload }: LigneEvenement): Carte => ({ seq, at, ticket, ...(JSON.parse(payload) as Omit<Carte, "seq" | "at" | "ticket">) });
const versEntree = ({ seq, at, ticket, payload }: LigneEvenement): EntreeDuRapport => ({ seq, at, ticket, ...(JSON.parse(payload) as Omit<EntreeDuRapport, "seq" | "at" | "ticket">) });

// The card raised for that decision, or null.
export function carteDe(base: Base, decision: string): Carte | null {
  const [ligne] = base.lire<LigneEvenement>("SELECT seq, at, ticket, payload FROM events WHERE type = ? AND json_extract(payload, '$.decision') = ? ORDER BY seq LIMIT 1", LEVEE, decision);
  return ligne === undefined ? null : versCarte(ligne);
}

// The cards the routing raised, in order.
export function cartes(base: Base): Carte[] {
  return base.lire<LigneEvenement>("SELECT seq, at, ticket, payload FROM events WHERE type = ? ORDER BY seq", LEVEE).map(versCarte);
}

// The report's entries written since `depuis` (an ISO instant, included), in
// order — every one when it is not given.
export function rapport(base: Base, depuis?: string): EntreeDuRapport[] {
  return base.lire<LigneEvenement>("SELECT seq, at, ticket, payload FROM events WHERE type = ? AND at >= ? ORDER BY seq", RAPPORTEE, depuis ?? "").map(versEntree);
}

// Raises the decision's card, unless it is already raised.
export function leverLaCarte(journal: Journal, geste: Geste, decision: Decision): { carte: Carte; nouvelle: boolean } {
  exigerDecision(decision);
  return journal.base.transaction(() => {
    const deja = carteDe(journal.base, decision.id);
    if (deja !== null) return { carte: deja, nouvelle: false };
    const { row, id, ticket, question, choices } = decision;
    const ecrit = journal.ajouter({ project: geste.projet, ticket, author: geste.auteur, type: LEVEE, payload: { row, decision: id, question, choices } });
    if (ecrit === null) throw new Error(`the card of ${id} was not written`);
    return { carte: versCarte({ seq: ecrit.seq, at: ecrit.at, ticket: ecrit.ticket, payload: JSON.stringify(ecrit.payload) }), nouvelle: true };
  });
}

// Writes the report's entry of a decision brigade applied and tells.
export function consigner(journal: Journal, geste: Geste, decision: Decision, accompli: Accompli): EntreeDuRapport {
  if (estFixe(decision.row)) throw new DecisionInvalide(`the ${decision.row} row is always “I decide”: brigade does not take its decisions`);
  const ecrit = journal.ajouter({
    project: geste.projet,
    ticket: decision.ticket,
    author: geste.auteur,
    type: RAPPORTEE,
    payload: { row: decision.row, decision: decision.id, what: accompli.what, link: accompli.link },
  });
  if (ecrit === null) throw new Error(`the report entry of ${decision.id} was not written`);
  return versEntree({ seq: ecrit.seq, at: ecrit.at, ticket: ecrit.ticket, payload: JSON.stringify(ecrit.payload) });
}

// Routes a decision. `appliquer` is the kitchen's own way of applying it: it is
// called on a `brigade` position only, and what it returns is the call's
// result — with what was done and where to see it, for the report.
// On `today`, nothing is applied nor written: the call site keeps its path.
export async function aiguiller<T extends Accompli>(journal: Journal, geste: Geste, decision: Decision, appliquer: () => T | Promise<T>): Promise<Aiguillage<T>> {
  exigerDecision(decision);
  const { voie, position } = voieDe(journal.base, decision.row, geste.maintenant);
  switch (voie) {
    case "today":
      return { voie, position };
    case "i-decide":
      return { voie, ...leverLaCarte(journal, geste, decision) };
    case "brigade-decides":
      return { voie, resultat: await appliquer() };
    case "brigade-decides-and-tells-me": {
      const resultat = await appliquer();
      return { voie, resultat, entree: consigner(journal, geste, decision, resultat) };
    }
  }
}
