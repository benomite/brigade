// The drift facts: the thresholds the chef declares on the project's measures,
// and what the runtime says when one of them crosses one.

// A threshold is null while the chef has not declared it: nothing is then
// reported on that account. `growthPercent` applies to the slope — the growth
// of a state measure over the last ten merges —, the others to its value.
// `ticketTokens` and `lostTokens` apply to the cost of the last ten merges:
// the tokens of the most expensive ticket, and the sum of those of the
// launches that delivered nothing. A log written before them does not carry
// them: read as null.
export type Seuils = {
  tests: number | null;
  testsSeconds: number | null;
  gatesSeconds: number | null;
  contextKb: number | null;
  repoMb: number | null;
  merges: number | null;
  growthPercent: number | null;
  ticketTokens?: number | null;
  lostTokens?: number | null;
  // The share of tickets delivered first try (in %) below which the queue says
  // so, and the window of served tickets it looks at. When not declared: 50 and
  // 10 (`renvois.ts`). A log written before them does not carry them.
  firstTryPercent?: number | null;
  firstTryWindow?: number | null;
};

export type DriftFact =
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
