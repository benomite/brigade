// Une cuisine oisive dont tous les tickets `fire` ouverts sont refusés par le
// manager (#2694) : le 7 novembre 2026, le rail était vide, trois `fire`
// étaient refusés, et la ligne de la cuisine retenue se taisait. Elle le dit
// désormais, avec le numéro de chaque ticket et le manque que le manager a donné.
//
// Sans E/S ici : `refusDeLaCuisine` reçoit ce que la boucle a lu. Le compte des
// 15 min part du plus récent de : le dernier service, l'ouverture de la cuisine,
// le dernier refus.
import type { Base } from "./base.ts";
import type { TicketRail } from "./projections/rail.ts";

export const REFUS_APRES_MS = 15 * 60_000;

export type RefusDuManager = { ticket: number; manque: string; at: string };

// Ce que la ligne dit : `since` d'où l'oisiveté se compte, `lines` un refus par ticket.
export type RefusesDeLaCuisine = { since: string; tickets: number[]; lines: string[] };

export const direRefus = ({ ticket, manque }: RefusDuManager): string => `#${ticket} refused by the manager, gap: ${manque}`;

// Les refus du manager sur les issues encore ouvertes, au journal.
export function refusDuJournal(base: Base): RefusDuManager[] {
  return base
    .lire<{ ticket: number; missing: string | null; reason: string; at: string }>("SELECT ticket, missing, reason, at FROM manager_issues WHERE decision = 'refused' AND closed = 0 ORDER BY ticket")
    .map(({ ticket, missing, reason, at }) => ({ ticket, manque: missing ?? reason, at }));
}

// La ligne due, ou null : un cook tourne, un ticket est prenable, un `fire`
// ouvert n'est pas refusé, ou rien n'est refusé. Les `fire` ouverts sont les
// refus, plus les tickets du rail qui attendent ou sont mis de côté.
export function refusDeLaCuisine(
  entree: { rail: TicketRail[]; refus: RefusDuManager[]; enAttente: number[]; dernierService: string | null; ouverture: string | null },
  maintenant: Date,
): RefusesDeLaCuisine | null {
  const { rail, refus, enAttente, dernierService, ouverture } = entree;
  if (refus.length === 0 || enAttente.length > 0 || rail.some(({ state }) => state === "taken" || state === "pass")) return null;
  const refuses = new Set(refus.map(({ ticket }) => ticket));
  if (rail.some(({ ticket, state }) => (state === "waiting" || state === "86") && !refuses.has(ticket))) return null;
  const since = [dernierService, ouverture, ...refus.map(({ at }) => at)].filter((i): i is string => i !== null).sort().at(-1) ?? null;
  if (since === null || maintenant.getTime() - Date.parse(since) < REFUS_APRES_MS) return null;
  return { since, tickets: refus.map(({ ticket }) => ticket), lines: refus.map(direRefus) };
}
