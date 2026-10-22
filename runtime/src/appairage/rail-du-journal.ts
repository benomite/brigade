// Le rail d'un projet tel que sa station le publie (`rail-publie.ts`), lu dans
// son journal : les tickets de `facts` (`etat.ts`, `faits`), dans son ordre, avec
// son numéro, son mot d'état, son titre et son adresse — rien d'autre.
import type { Journal } from "../journal.ts";
import { lireRail } from "../projections/rail.ts";
import { etatLu } from "../rail.ts";
import type { TicketPublie } from "./rail-publie.ts";

export const railDuJournal = (journal: Journal): TicketPublie[] =>
  lireRail(journal.base).map((ticket) => ({ ticket: ticket.ticket, etat: etatLu(ticket), titre: ticket.title, url: ticket.url }));
