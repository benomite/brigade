// Le journal du jour d'un projet (ticket 4274, épique 4025, spec 2026-11-23-autonomy-trust-control.md, T1) : tiré des fils
// de ses agents (log/threads.ts), les gestes du jour — le jour UTC de la lecture, comme les heures que la vue montre —
// rangés par leur sorte : ce qui a été livré, ce qui a cassé, ce que le système a réparé seul, ce qu'il n'a pas pu réparer,
// et ses propres erreurs. Chaque entrée garde l'agent dont elle vient. Rien d'autre : la vue (vue/log/) le pose tel quel.
import type { ActionOfThread } from "../log/threads.ts";

export type EntryOfLog = { agent: string; at: string; line: string; reason: string; outcome: string };
// `nonRanges` : les gestes du jour d'une sorte que le journal ne connaît pas — comptés, jamais rangés au hasard.
export type LogOfDay = { delivered: EntryOfLog[]; broke: EntryOfLog[]; fixedBySelf: EntryOfLog[]; notFixed: EntryOfLog[]; mistakes: EntryOfLog[]; nonRanges: number };

const GROUP_OF: Record<string, keyof Omit<LogOfDay, "nonRanges">> = { delivered: "delivered", broke: "broke", fixed: "fixedBySelf", unfixed: "notFixed", mistake: "mistakes" };

const dayUtc = (instant: number) => (Number.isNaN(instant) ? "" : new Date(instant).toISOString().slice(0, 10));

export function logOfDay(threads: Readonly<Record<string, readonly ActionOfThread[]>>, now: Date): LogOfDay {
  const log: LogOfDay = { delivered: [], broke: [], fixedBySelf: [], notFixed: [], mistakes: [], nonRanges: 0 };
  const today = dayUtc(now.getTime());
  const ofDay = Object.entries(threads)
    .flatMap(([agent, actions]) => actions.map((action) => ({ agent, geste: action })))
    .filter(({ geste: action }) => dayUtc(Date.parse(action.at)) === today)
    .sort((a, b) => Date.parse(a.geste.at) - Date.parse(b.geste.at));
  for (const { agent, geste: action } of ofDay) {
    const group = Object.hasOwn(GROUP_OF, action.kind) ? GROUP_OF[action.kind] : undefined;
    if (group === undefined) log.nonRanges += 1;
    else log[group].push({ agent, at: action.at, line: action.line, reason: action.reason, outcome: action.outcome });
  }
  return log;
}
