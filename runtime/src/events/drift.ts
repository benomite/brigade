// The drift facts: the thresholds the chef declares on the project's measures,
// and what the runtime says when one of them crosses one.

// A threshold is null while the chef has not declared it: nothing is then
// reported on that account. `ticketTokens` and `lostTokens` apply to the cost of the last ten merges:
// the tokens of the most expensive ticket, and the sum of those of the
// launches that delivered nothing. A log written before them does not carry
// them: read as null.
export type Seuils = {
  gatesSeconds: number | null;
  ticketTokens?: number | null;
  lostTokens?: number | null;
};

export type FaitDerive =
  // The thresholds in force, written when they change: this is where `status`
  // and `measures` read them.
  | { type: "drift.configured"; payload: { limits: Seuils } }
  // A measure has just crossed its threshold. Written once: nothing repeats it
  // while it stays beyond. `measure`: the measure, or `growth:<measure>` for
  // its slope; `observed`, `limit`: in the threshold's unit.
  | { type: "drift.crossed"; payload: { measure: string; observed: number; limit: number } }
  // It went back under its threshold, or the threshold is no longer declared:
  // a new crossing will be reported.
  | { type: "drift.cleared"; payload: { measure: string } };
