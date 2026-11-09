// The `resume` the station serves with a project's ticket times (`temps.resume`, read by the app's
// Ticket time figure). The station served the records and the four figures but never the summary, so
// the app always read "no measure yet" (#3015). Null when no ticket merged in the last 24 h: the app
// then hides the figure instead of showing the stale median of an idle project.
import { JOURNEE_MS } from "../temps-max/mesure.ts";
import { resumer, type Resume } from "../temps-ticket/mesure.ts";
import type { TempsTicket } from "../temps-ticket/ligne-status.ts";
import type { EnregistrementTemps } from "../temps-ticket/synthese.ts";

export function resumeServi(enregistrements: readonly TempsTicket[], lostTimeMaxMin: number, maintenant: number): Resume | null {
  const mesures = enregistrements.filter((t): t is EnregistrementTemps => typeof t.mergedAt === "string" && typeof t.claimedAt === "string");
  if (!mesures.some((t) => Date.parse(t.mergedAt) >= maintenant - JOURNEE_MS)) return null;
  return resumer(mesures, lostTimeMaxMin);
}
