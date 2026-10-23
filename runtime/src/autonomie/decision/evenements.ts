// The facts of a decision routed by the autonomy table (`decision/aiguillage.ts`):
// what brigade decided and tells the chef, for the daily report, and the card
// a decision the chef takes reaches them by.
import type { Fixe, Rangee } from "../table.ts";

export type ChoixDeCarte = { id: string; label: string };

export type FaitAiguillage =
  // `row`: the kind of decision. `decision`: its identity, the same however
  // many times it arises. `what`: what was done, said for the chef. `link`:
  // where to see it. The envelope's `at` is when it was done.
  | { type: "autonomy.reported"; payload: { row: Rangee; decision: string; what: string; link: string } }
  // `question`: what the chef is asked. `choices`: what they can answer, the
  // first being what brigade would do.
  | { type: "autonomy.card-raised"; payload: { row: Rangee | Fixe; decision: string; question: string; choices: ChoixDeCarte[] } };
