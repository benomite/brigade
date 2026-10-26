// The automatic trigger of the writing closing: for a project whose closer is
// set, the runtime requests a pass on its own — the same request as the chef's
// `closing write`, under the same start condition and the same guardrails —
// as soon as one of two symptoms shows since the last pass that left:
//
// - `MERGES_PER_PASS` merges on the integration branch;
// - a drift threshold of the project crossed (`drift.crossed`).
//
// And never more than one request per project within `ONE_PASS_A_DAY_MS`,
// whoever made it and whatever became of it. Read from the log alone: what
// triggers is what the log says, nothing is counted elsewhere.
import type { Base } from "../base.ts";
import type { FaitDerive } from "../events/drift.ts";

// The merges since the last pass that left beyond which a pass is requested.
export const MERGES_PER_PASS = 20;
// The shortest gap between two requests of a project: a day.
export const ONE_PASS_A_DAY_MS = 24 * 60 * 60 * 1000;

type Crossing = Extract<FaitDerive, { type: "drift.crossed" }>["payload"];

// Why the runtime requests a pass. `merges`: how many since the last pass
// that left. `drift`: the first threshold crossed since then.
export type Trigger = { reason: "merges"; merges: number } | { reason: "drift"; crossing: Crossing };

const last = (base: Base, type: string) => base.lire<{ seq: number; at: string }>("SELECT seq, at FROM events WHERE type = ? ORDER BY seq DESC LIMIT 1", type)[0];

// What would make the runtime request a pass now, or null. It does not ask
// whether the closer is set nor whether a pass may leave: that is the
// caller's, as for the chef's gesture.
export function trigger(base: Base, now: Date): Trigger | null {
  const requested = last(base, "closing.requested");
  if (requested !== undefined && now.getTime() - Date.parse(requested.at) < ONE_PASS_A_DAY_MS) return null;
  // A pass that left restarts both counters; a request refused, withdrawn or
  // waiting does not — the cap above keeps it from coming back the same day.
  const since = last(base, "closing.started")?.seq ?? 0;
  const merges = base.lire<{ n: number }>("SELECT count(*) AS n FROM events WHERE type = 'merge.done' AND seq > ?", since)[0]?.n ?? 0;
  if (merges >= MERGES_PER_PASS) return { reason: "merges", merges };
  const crossed = base.lire<{ payload: string }>("SELECT payload FROM events WHERE type = 'drift.crossed' AND seq > ? ORDER BY seq LIMIT 1", since)[0];
  return crossed === undefined ? null : { reason: "drift", crossing: JSON.parse(crossed.payload) as Crossing };
}
