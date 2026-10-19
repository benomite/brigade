// The facts of the emergency alert: what the runtime announced to the chef when
// the whole kitchen is waiting on him. The emergency itself is not written (it
// is re-read from the rail); these facts keep only what was said, and when.

export type FaitUrgence =
  // Written when the emergency appears, or when its cause changes (`reminder`
  // false), then once per interval while it does not move (`reminder` true).
  // `key`: what makes it the same emergency — its start and the decisions
  // behind it. `label`: the alert line. `decision`, `ticket`, `cause`, `geste`:
  // the decision that holds back the most tickets, as the state exposes it.
  // `since`: the start of the total stop.
  | {
      type: "urgence.alerted";
      payload: { key: string; label: string; decision: string; ticket: number | null; cause: string; geste: string; since: string; retenus: number[]; reminder: boolean };
    }
  // Written when the announced emergency is lifted: the counter restarts from zero.
  | { type: "urgence.lifted"; payload: { key: string } };
