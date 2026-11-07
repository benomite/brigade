// The "repairs" line of `status` (#2696, epic #2661): the repairs of main over
// the merged PRs, and their ratio — the quality figure of #2659. A repair of
// main is a ticket opened by a red main (`base.repair-opened` in the log); a
// merged PR is a merged ticket the log knows. The window is the one of the
// ticket times `status` already reports on — the recent tickets of
// `temps-max/mesure.ts` —, and the count is `mesure-qualite.ts`'s: no second
// source, no second window.
import type { Base } from "./base.ts";
import { mesurerQualite, qualitesDuJournal, type QualiteDuTicket } from "./mesure-qualite.ts";

export function direLesReparations<T extends { ticket: number; mergedAt?: string }>(temps: readonly T[], qualites: ReadonlyMap<number, QualiteDuTicket>): string {
  const q = mesurerQualite(temps, qualites);
  const ratio = q.reparationsParMerge === null ? "n/a" : String(Math.round(q.reparationsParMerge * 1000) / 1000);
  return `${"repairs".padEnd(11)} ${q.reparations} repairs of main / ${q.mesures} merged PRs = ${ratio} (recent tickets)`;
}

export function ligneDesReparations<T extends { ticket: number; mergedAt?: string }>(temps: readonly T[], base: Base): string {
  return direLesReparations(temps, qualitesDuJournal(base));
}
