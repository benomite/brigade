// The facts of the TODO gate (`carte-todo.ts`): what entered the chef's TODO
// queue as a typed card, what was refused at its door, and why. Each carries
// the ticket in its envelope. `kind`: `product`, `design` or `gesture`.
// `statement`: what is expected of the chef, in one line. `capture`: the
// screen or render shown with a `design` card — null on another card without
// one.
export type FaitTodo =
  // The card passed the gate: it is in TODO, and replaces the one its ticket
  // carried there before, if any.
  | { type: "todo.entered"; payload: { kind: "product" | "design" | "gesture"; statement: string; capture: string | null } }
  // The card was refused at the gate: it is not in TODO. `kind`, `statement`,
  // `capture`: what was proposed, as it was — null when missing. `reason`:
  // why, in plain words.
  | { type: "todo.refused"; payload: { kind: string | null; statement: string | null; capture: string | null; reason: string } }
  // The card leaves TODO: the decision is taken, or it is no longer the
  // chef's. `why`: in plain words.
  | { type: "todo.left"; payload: { why: string } };
