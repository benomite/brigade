// Où en sont les tickets d'une épique découpée : combien sont servis, et lesquels
// ne le seront pas sans que le chef s'en mêle — fermés sans livraison, ou sortis
// du rail. Lecture du journal seule.
import type { Base } from "./base.ts";
import { nomAbandon } from "./rail.ts";
import { ticketsDEpique } from "./projections/decoupages.ts";
import { sortDuTicket } from "./projections/rail.ts";

export type BilanDEpique = {
  total: number;
  servis: number[];
  // Ceux qui ne sont pas servis et n'ont plus de chemin vers l'être : `dit` en dit la raison.
  manquants: { ticket: number; dit: string }[];
  // Tous ses tickets sont servis, et elle en a.
  toutServi: boolean;
};

export function bilanDEpique(base: Base, epic: number): BilanDEpique {
  const tickets = ticketsDEpique(base, epic);
  const servis: number[] = [];
  const manquants: BilanDEpique["manquants"] = [];
  for (const ticket of tickets) {
    const sort = sortDuTicket(base, ticket.ticket);
    if (sort?.outcome === "served") servis.push(ticket.ticket);
    else if (!ticket.open) manquants.push({ ticket: ticket.ticket, dit: `#${ticket.ticket} fermé sans livraison` });
    else if (sort?.outcome === "left") manquants.push({ ticket: ticket.ticket, dit: `#${ticket.ticket} sorti du rail (${nomAbandon(sort.reason ?? "")})` });
  }
  return { total: tickets.length, servis, manquants, toutServi: tickets.length > 0 && servis.length === tickets.length };
}
