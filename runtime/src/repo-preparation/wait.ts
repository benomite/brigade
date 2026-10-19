// The kitchen of a project whose preparation ticket the station opened: as
// long as it is not served, it is the only one that can leave — no other
// ticket would be cooked without gates to judge it, nor a setup to prepare
// its worktree. Served, the rail is handed back whole, without the chef lifting
// a finger.
//
// It is the rail the stations read, local and remote alike, that is held
// back: the same restriction as a red base, which lets only its repair leave
// (`seul`). A repair in progress goes first.
import type { RuntimeAvecRail } from "../alimenter.ts";
import { sortDuTicket } from "../projections/rail.ts";
import type { Rail } from "../rail.ts";
import { readPreparation } from "./open.ts";

// The rail departures that free the kitchen without it being served: the
// issue closed by the chef — he gives up on the preparation, or merged it by
// hand —, or gone. A removed `fire` label, on the other hand, only suspends
// it: the rail stays held back.
const RELEASING = ["closed", "gone"];

export type WaitOptions = {
  stateDir: string;
  // A line of the station's service log.
  say: (line: string) => void;
};

export function awaitPreparation<R extends RuntimeAvecRail>(runtime: R, options: WaitOptions): R {
  const preparation = readPreparation(options.stateDir);
  if (preparation === null) return runtime;
  const { ticket } = preparation;
  const { base } = runtime.journal;
  // What was said last: a change is announced once, not on every take.
  let said: "held" | "free" | null = null;
  // The ticket that alone may leave, or undefined: the rail is whole.
  const onlyToLeave = (): number | undefined => {
    const fate = sortDuTicket(base, ticket);
    const free = fate !== null && (fate.outcome === "served" || RELEASING.includes(fate.reason ?? ""));
    if (free && said === "held") {
      options.say(
        fate.outcome === "served"
          ? `brigade : #${ticket} (préparer le dépôt) est servi — le rail démarre`
          : `brigade : #${ticket} (préparer le dépôt) a quitté le rail sans être servi (${fate.reason}) — le rail n'attend plus`,
      );
    }
    if (!free && said !== "held") options.say(`brigade : le rail attend #${ticket} (préparer le dépôt) — aucun autre ticket ne part avant son merge`);
    said = free ? "free" : "held";
    return free ? undefined : ticket;
  };
  const rail: Rail = {
    ...runtime.rail,
    prendre: (who, inKitchen, only) => runtime.rail.prendre(who, inKitchen, only ?? onlyToLeave()),
    servables: (inKitchen, takers, only) => runtime.rail.servables(inKitchen, takers, only ?? onlyToLeave()),
  };
  return { ...runtime, rail };
}
