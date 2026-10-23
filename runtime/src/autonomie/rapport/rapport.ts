// The daily report of a project: what brigade decided and told about in the
// last 24 hours, grouped by kind of decision, each entry with a one-line
// summary and a link to what was done. It is data — the app and the chef's
// channel display it, `rapport-cli.ts` prints it — and an empty day is a
// report that says so (`vide`), never an error.
//
// It reads the `autonomy.reported` entries (`decision/aiguillage.ts`), which
// are written for the `brigade decides and tells me` position only: a
// decision made under `brigade decides` or `I decide` leaves no such entry,
// so none can appear here.
import type { Base } from "../../base.ts";
import { rapport as entreesDepuis, type EntreeDuRapport } from "../decision/aiguillage.ts";
import { LIBELLES_DES_RANGEES, RANGEES, type Rangee } from "../table.ts";

export const FENETRE_MS = 24 * 60 * 60 * 1000;

export type LigneDuRapport = { seq: number; at: string; ticket: number | null; decision: string; summary: string; link: string };
export type GroupeDuRapport = { row: Rangee; title: string; entries: LigneDuRapport[] };
export type RapportDuJour = {
  // The window: the last 24 hours before `to`, `from` included.
  from: string;
  to: string;
  // True when nothing was decided and told in the window: `groups` is empty.
  vide: boolean;
  // Only the kinds with entries, in the table's order; entries in the order they were done.
  groups: GroupeDuRapport[];
};

// The one line of an entry: what was done, on one line.
const enUneLigne = (texte: string): string => texte.replace(/\s+/g, " ").trim();

export function rapportDuJour(base: Base, maintenant: Date): RapportDuJour {
  const from = new Date(maintenant.getTime() - FENETRE_MS).toISOString();
  const to = maintenant.toISOString();
  const entrees = entreesDepuis(base, from).filter(({ at }) => at <= to);
  const groups: GroupeDuRapport[] = [];
  for (const row of RANGEES) {
    const deLaRangee = entrees.filter((entree: EntreeDuRapport) => entree.row === row);
    if (deLaRangee.length === 0) continue;
    groups.push({
      row,
      title: LIBELLES_DES_RANGEES[row].titre,
      entries: deLaRangee.map(({ seq, at, ticket, decision, what, link }) => ({ seq, at, ticket, decision, summary: enUneLigne(what), link })),
    });
  }
  return { from, to, vide: groups.length === 0, groups };
}

// The report as the chef reads it by hand.
export function direLeRapport(projet: string, rapport: RapportDuJour): string[] {
  const lignes = [`Daily report of ${projet} — ${rapport.from} to ${rapport.to}`];
  if (rapport.vide) return [...lignes, "Nothing decided and told in the last 24 hours."];
  for (const { title, entries } of rapport.groups) {
    lignes.push("", `${title} (${entries.length})`);
    for (const { summary, link, at } of entries) lignes.push(`  - ${summary} — ${link} (${at})`);
  }
  return lignes;
}
