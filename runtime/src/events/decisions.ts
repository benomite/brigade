// The facts of the chef's decisions: what he decides for his project that is
// not a fact of the machine (`decisions.ts`). `name`: the environment variable
// the decision replaces — that is how a decision overrides the environment.
// `previous`: what the log carried for it before, or null if it carried nothing.
export type FaitDecision =
  // The chef sets a value: it holds at the next read, without a restart.
  | { type: "decision.set"; payload: { name: string; value: string; previous: string | null } }
  // He withdraws it: the environment is read as before.
  | { type: "decision.withdrawn"; payload: { name: string; previous: string } };
