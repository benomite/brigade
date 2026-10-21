import type { Captures } from "../captures.ts";

// What a producer proposed for TODO, as it was — null when missing. `kind`:
// `product`, `design`, or one that does not enter (`gesture`…). `statement`:
// what is asked of the chef — to enter, exactly one question. `capture`: the
// screen a producer pointed at, for the triage to read. `choices`: the
// choices proposed, each with what follows it (`then`); null when none.
type Proposed = { kind: string | null; statement: string | null; capture: string | null; choices: Array<{ text: string | null; then: string | null }> | null };

// The facts of the TODO gate (`carte-todo.ts`): what entered the chef's TODO
// queue as a card, what was refused at its door, and why — and what the
// triage, which holds every card before it enters, did with it. Each carries
// the ticket in its envelope.
export type FaitTodo =
  // The card passed the gate: it is in TODO, and replaces the one its ticket
  // carried there before, if any. `kind`: `product` or `design`. `statement`:
  // its one question. `choices`: at least one, each one line, and what
  // follows it — `resume` (the kitchen takes the ticket up again with the
  // answer) or `merge` (the green delivery waiting is merged). `captures`:
  // the screens its ticket delivered, before and after — never null on a
  // `design` card, null on a `product` card whose ticket delivered none.
  | { type: "todo.entered"; payload: { kind: "product" | "design"; statement: string; choices: Array<{ text: string; then: "resume" | "merge" }>; captures: Captures | null } }
  // The card was refused at the gate: it is not in TODO, and goes back to
  // the triage (it is held). `reason`: why, in plain words.
  | { type: "todo.refused"; payload: Proposed & { reason: string } }
  // The card leaves TODO: the decision is taken — the chef answered —, or it
  // is no longer the chef's. `why`: in plain words.
  | { type: "todo.left"; payload: { why: string } }
  // The card is held before TODO (`triage/triage.ts`): it is not in TODO
  // while the triage agent decides.
  | { type: "todo.held"; payload: Proposed }
  // What the triage did with the card it held. `action`: one of its five —
  // `relaunch`, `resplit`, `dependency`, `wait`, `remove` —, done, and said
  // on the issue in `sentence`; `through`: it did not decide, and the card
  // entered TODO with it; `back`: it sent the card to TODO, the gate refused
  // it, and the card stays held, back to the triage. `wait`: the card stays
  // held until `until`, then is triaged again. `run`: the agent's run, null
  // when none answered. `reason`: why, in plain words.
  | {
      type: "todo.triaged";
      payload: { action: "relaunch" | "resplit" | "dependency" | "wait" | "remove" | "through" | "back"; sentence: string | null; reason: string; run: string | null; until?: string | null };
    }
  // The chef answered the card in TODO (`reponse-carte.ts`): by one of its
  // choices (`choice`, its rank from 1) or in free text (`choice` null).
  // `answer`: what was written on the issue. `then`: what followed.
  | { type: "todo.answered"; payload: { choice: number | null; answer: string; then: "resume" | "merge" } };
