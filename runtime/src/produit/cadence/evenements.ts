// The facts of the product role's cadence (`cadence.ts`): the kitchen wakes the
// role on its own when the rail empties, within a daily cap the chef can turn
// off in one gesture. Every fact is written by the runtime, except the switch,
// written by whoever the envelope's `author` names.
//
// The log is the cadence's only store: `status` reads its line from these
// facts (`etat.ts`), and nothing is kept in memory between two ticks.

// Why the role was woken: the rail is empty, or an issue opened by someone
// other than the chef has waited more than a day for an answer.
export type RaisonDuReveil = "rail-empty" | "outside-issue-overdue";

// How a run of the role ended. `done`: it answered, and what it proposed was
// filed (up to what the cap left). `unreadable`: it answered with nothing that
// reads as proposals. `failed`: it did not answer — a crash, a guardrail, the
// quota.
export type IssueDuRole = "done" | "unreadable" | "failed";

export type FaitCadence =
  // The settings the runtime applies, written at its start when they changed:
  // `status` reads the cap from here, without the runtime's environment.
  | { type: "product.settings"; payload: { cap: number; intervalHours: number } }
  | { type: "product.switched-on"; payload: Record<string, never> }
  | { type: "product.switched-off"; payload: Record<string, never> }
  // One run of the role. `day`: the UTC day it counts in. `filed`: the issues
  // it filed. `filedToday`: the issues carrying `filed-by:product` created
  // that day, this run's included. `overdue`: the outside issues that woke it.
  | {
      type: "product.ran";
      payload: { run: string | null; reason: RaisonDuReveil; outcome: IssueDuRole; day: string; filed: number[]; filedToday: number; cap: number; overdue: number[]; detail: string | null };
    }
  // A tick would have woken the role, and the day's cap was already reached:
  // nothing ran. Written once a day.
  | { type: "product.cap-reached"; payload: { day: string; filedToday: number; cap: number } };
