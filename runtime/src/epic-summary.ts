// Où en sont les tickets d'une épique découpée : combien sont servis, et lesquels
// ne le seront pas sans que le chef s'en mêle — fermés sans livraison, ou sortis
// du rail. Lecture du journal seule.
import type { Base } from "./base.ts";
import { nomAbandon, nomAbandonEn } from "./rail.ts";
import { splitOf, epicTickets } from "./projections/splits.ts";
import { sortDuTicket } from "./projections/rail.ts";

export type EpicSummary = {
  total: number;
  servis: number[];
  // Ceux qui ne sont pas servis et n'ont plus de chemin vers l'être : `dit` en dit la raison, en français (`split.ts` le lit) ; `ditEn`, en anglais (`amont.ts`).
  manquants: { ticket: number; dit: string; ditEn: string }[];
  // Tous ses tickets sont servis, et elle en a.
  allServed: boolean;
};

export function epicSummary(base: Base, epic: number, vues: ReadonlySet<number> = new Set()): EpicSummary {
  const descendance = new Set(vues).add(epic);
  const tickets = epicTickets(base, epic);
  const servedOnes: number[] = [];
  const manquants: EpicSummary["manquants"] = [];
  for (const ticket of tickets) {
    const sort = sortDuTicket(base, ticket.ticket);
    if (sort?.outcome === "served") servedOnes.push(ticket.ticket);
    else if (!descendance.has(ticket.ticket) && splitOf(base, ticket.ticket)?.state === "split") {
      // Une sous-épique est servie par ses propres tickets, à n'importe quelle profondeur ;
      // sinon, ce qui lui manque est ce qui manque à l'épique.
      const sous = epicSummary(base, ticket.ticket, descendance);
      if (sous.allServed) servedOnes.push(ticket.ticket);
      else if (sous.manquants.length > 0) manquants.push(...sous.manquants);
      else if (!ticket.open) manquants.push({ ticket: ticket.ticket, dit: `#${ticket.ticket} fermé sans livraison`, ditEn: `#${ticket.ticket} closed without delivery` });
    }
    else if (!ticket.open) manquants.push({ ticket: ticket.ticket, dit: `#${ticket.ticket} fermé sans livraison`, ditEn: `#${ticket.ticket} closed without delivery` });
    else if (sort?.outcome === "left") manquants.push({ ticket: ticket.ticket, dit: `#${ticket.ticket} sorti du rail (${nomAbandon(sort.reason ?? "")})`, ditEn: `#${ticket.ticket} left the rail (${nomAbandonEn(sort.reason ?? "")})` });
  }
  return { total: tickets.length, servis: servedOnes, manquants, allServed: tickets.length > 0 && servedOnes.length === tickets.length };
}
