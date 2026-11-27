// What the old runtime's `manager` wrote about its state (the command left with #4710), computed from the same journal
// projections: the `manager` line, and the empty sections the app reads after it. A test that needs the app's reading of
// the project switch (alerts.ts) feeds it this text — the app launches nothing to get it.
import { etatDeLInterrupteur } from "../../../runtime/src/projections/switch.ts";
import { etatDuManager } from "../../../runtime/src/projections/manager.ts";
import type { Journal } from "../../../runtime/src/journal.ts";

export function managerOutput({ base }: Pick<Journal, "base">): string {
  const project = etatDeLInterrupteur(base);
  const state = project === null ? etatDuManager(base) : { active: project.on, since: project.since, by: project.by };
  const follows = project === null ? "" : "the project switch is on: ";
  const line =
    state === null
      ? "OFF — never turned on: no issue is judged, `fire` and the calibration are set by hand"
      : state.active
        ? `ON since ${state.since} (by ${state.by}) — ${follows}it judges the open issues, sets \`fire\` and the calibration`
        : `OFF since ${state.since} (by ${state.by}) — ${project === null ? "" : "the project switch is off: `brigade <project> switch on` turns it on — "}no issue is judged, what it set stays set`;
  return `${"manager".padEnd(22)}${line}\nlatest decisions      none\nset aside             none\n`;
}
