// Le journal du jour d'un projet (ticket 4274, épique 4025, spec 2026-11-23-autonomy-trust-control.md, T1) : tiré des fils
// de ses agents (journal/fils.ts), les gestes du jour — le jour UTC de la lecture, comme les heures que la vue montre —
// rangés par leur sorte : ce qui a été livré, ce qui a cassé, ce que le système a réparé seul, ce qu'il n'a pas pu réparer,
// et ses propres erreurs. Chaque entrée garde l'agent dont elle vient. Rien d'autre : la vue (vue/journal/) le pose tel quel.
import type { GesteDuFil } from "../journal/fils.ts";

export type EntreeDuJournal = { agent: string; at: string; line: string; reason: string; outcome: string };
// `nonRanges` : les gestes du jour d'une sorte que le journal ne connaît pas — comptés, jamais rangés au hasard.
export type JournalDuJour = { delivered: EntreeDuJournal[]; broke: EntreeDuJournal[]; fixedBySelf: EntreeDuJournal[]; notFixed: EntreeDuJournal[]; mistakes: EntreeDuJournal[]; nonRanges: number };

const GROUPE_DE: Record<string, keyof Omit<JournalDuJour, "nonRanges">> = { delivered: "delivered", broke: "broke", fixed: "fixedBySelf", unfixed: "notFixed", mistake: "mistakes" };

const jourUtc = (instant: number) => (Number.isNaN(instant) ? "" : new Date(instant).toISOString().slice(0, 10));

export function journalDuJour(fils: Readonly<Record<string, readonly GesteDuFil[]>>, maintenant: Date): JournalDuJour {
  const journal: JournalDuJour = { delivered: [], broke: [], fixedBySelf: [], notFixed: [], mistakes: [], nonRanges: 0 };
  const aujourdhui = jourUtc(maintenant.getTime());
  const duJour = Object.entries(fils)
    .flatMap(([agent, gestes]) => gestes.map((geste) => ({ agent, geste })))
    .filter(({ geste }) => jourUtc(Date.parse(geste.at)) === aujourdhui)
    .sort((a, b) => Date.parse(a.geste.at) - Date.parse(b.geste.at));
  for (const { agent, geste } of duJour) {
    const groupe = Object.hasOwn(GROUPE_DE, geste.kind) ? GROUPE_DE[geste.kind] : undefined;
    if (groupe === undefined) journal.nonRanges += 1;
    else journal[groupe].push({ agent, at: geste.at, line: geste.line, reason: geste.reason, outcome: geste.outcome });
  }
  return journal;
}
