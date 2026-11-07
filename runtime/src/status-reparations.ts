// The "repairs" line of `status` (#2696, epic #2661): the repairs of main over
// the merged PRs, and their ratio — the quality figure of #2659. A repair of
// main is a ticket opened by a red main (its red-commit mark, read on GitHub at
// merge); a merged PR is a merged ticket whose GitHub markers were recorded
// with its time (`qualite-github.ts`, #2707). The window is the one of the
// ticket times `status` already reports on — the recent tickets of
// `temps-max/mesure.ts` —, and the count is `mesure-qualite.ts`'s: no second
// source, no second window.
import { mesurerQualite, type QualiteDuTicket } from "./mesure-qualite.ts";
import { qualitesDesTemps } from "./qualite-github.ts";

export function direLesReparations<T extends { ticket: number; mergedAt?: string }>(temps: readonly T[], qualites: ReadonlyMap<number, QualiteDuTicket>): string {
  const q = mesurerQualite(temps, qualites);
  const ratio = q.reparationsParMerge === null ? "n/a" : String(Math.round(q.reparationsParMerge * 1000) / 1000);
  return `${"repairs".padEnd(11)} ${q.reparations} repairs of main / ${q.mesures} merged PRs = ${ratio} (recent tickets)`;
}

export function ligneDesReparations<T extends { ticket: number; mergedAt?: string; qualite?: unknown }>(temps: readonly T[]): string {
  return direLesReparations(temps, qualitesDesTemps(temps));
}
