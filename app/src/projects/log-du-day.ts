// Le journal du jour d'un projet (ticket 4274, épique 4025, spec 2026-11-23-autonomy-trust-control.md, T1) : tiré des fils
// de ses agents (log/fils.ts), les gestes du jour — le jour UTC de la lecture, comme les heures que la vue montre —
// rangés par leur sorte : ce qui a été livré, ce qui a cassé, ce que le système a réparé seul, ce qu'il n'a pas pu réparer,
// et ses propres erreurs. Chaque entrée garde l'agent dont elle vient. Rien d'autre : la vue (vue/log/) le pose tel quel.
import type { ActionDuFil } from "../log/fils.ts";

export type EntreeDuLog = { agent: string; at: string; line: string; reason: string; outcome: string };
// `nonRanges` : les gestes du jour d'une sorte que le journal ne connaît pas — comptés, jamais rangés au hasard.
export type LogDuDay = { delivered: EntreeDuLog[]; broke: EntreeDuLog[]; fixedBySelf: EntreeDuLog[]; notFixed: EntreeDuLog[]; mistakes: EntreeDuLog[]; nonRanges: number };

const GROUPE_DE: Record<string, keyof Omit<LogDuDay, "nonRanges">> = { delivered: "delivered", broke: "broke", fixed: "fixedBySelf", unfixed: "notFixed", mistake: "mistakes" };

const dayUtc = (instant: number) => (Number.isNaN(instant) ? "" : new Date(instant).toISOString().slice(0, 10));

export function logDuDay(fils: Readonly<Record<string, readonly ActionDuFil[]>>, maintenant: Date): LogDuDay {
  const log: LogDuDay = { delivered: [], broke: [], fixedBySelf: [], notFixed: [], mistakes: [], nonRanges: 0 };
  const aujourdhui = dayUtc(maintenant.getTime());
  const duDay = Object.entries(fils)
    .flatMap(([agent, actions]) => actions.map((action) => ({ agent, geste: action })))
    .filter(({ geste: action }) => dayUtc(Date.parse(action.at)) === aujourdhui)
    .sort((a, b) => Date.parse(a.geste.at) - Date.parse(b.geste.at));
  for (const { agent, geste: action } of duDay) {
    const groupe = Object.hasOwn(GROUPE_DE, action.kind) ? GROUPE_DE[action.kind] : undefined;
    if (groupe === undefined) log.nonRanges += 1;
    else log[groupe].push({ agent, at: action.at, line: action.line, reason: action.reason, outcome: action.outcome });
  }
  return log;
}
