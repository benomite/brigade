// When a tick wakes the product role: a decision with no I/O, so that each
// rule is read, and tested, in one place.
//
// The role runs when all of these hold:
//   - it is on (`interrupteur.ts`), and so is the project — neither the
//     project switch off, nor the chef's "stop", nor the breaker open;
//   - the rail is empty for a cook, or an issue opened by someone other than
//     the chef has waited more than a day for an answer;
//   - its last run is older than the interval;
//   - the day's cap is not reached — counted from the issues carrying
//     `filed-by:product` created that day.
import type { TicketRail } from "../../projections/rail.ts";
import { EN_WAITING, etatLuEn } from "../../rail.ts";
import type { RaisonDuReveil } from "./evenements.ts";

// The rail as the kitchen reads it (#1927): a ticket in WAITING — awaiting a
// third party, a station, or a ticket that does — is nothing for a cook.
export function railVide(rail: readonly TicketRail[]): boolean {
  return rail.every((ticket) => ticket.state === "served" || etatLuEn(ticket) === EN_WAITING);
}

export type CeQueLitLeDeclencheur = {
  // The role's own switch.
  allume: boolean;
  // The project may cook: switch on, no "stop", breaker closed.
  projetAllume: boolean;
  railVide: boolean;
  // The outside issues overdue for an answer: they wake the role on a busy
  // rail, and the role is told about them on an empty one.
  enRetard: () => Promise<number[]>;
  // When the role last ran, or null.
  dernierRun: string | null;
  intervalleMs: number;
  // The issues filed today. Read last: it costs a call to GitHub.
  deposesAujourdhui: () => Promise<number>;
  plafond: number;
  // What the log already counted when it said the cap reached today, or null:
  // a count only grows within a day, GitHub need not be asked again.
  plafondDejaDit: number | null;
  maintenant: Date;
};

export type Decision =
  | { quoi: "rien"; pourquoi: "off" | "project-off" | "rail-busy" | "too-soon" }
  | { quoi: "plafond"; deposes: number }
  | { quoi: "lancer"; raison: RaisonDuReveil; enRetard: number[]; deposes: number };

export async function decider(lu: CeQueLitLeDeclencheur): Promise<Decision> {
  if (!lu.allume) return { quoi: "rien", pourquoi: "off" };
  if (!lu.projetAllume) return { quoi: "rien", pourquoi: "project-off" };
  // The interval before anything that reads GitHub: most ticks stop here.
  if (lu.dernierRun !== null && lu.maintenant.getTime() - Date.parse(lu.dernierRun) < lu.intervalleMs) return { quoi: "rien", pourquoi: "too-soon" };
  const enRetard = await lu.enRetard();
  if (!lu.railVide && enRetard.length === 0) return { quoi: "rien", pourquoi: "rail-busy" };
  if (lu.plafondDejaDit !== null && lu.plafondDejaDit >= lu.plafond) return { quoi: "plafond", deposes: lu.plafondDejaDit };
  const deposes = await lu.deposesAujourdhui();
  if (deposes >= lu.plafond) return { quoi: "plafond", deposes };
  return { quoi: "lancer", raison: lu.railVide ? "rail-empty" : "outside-issue-overdue", enRetard, deposes };
}
