// Montre le rail, en lecture seule : `npm --prefix runtime run rail`.
// Une ligne par ticket, dans l'ordre de service :
//   #<ticket>  <état>  <priorité>  <détail de l'état>  <titre>
import { ouvrirJournal } from "./journal.ts";
import { lireRail, type TicketRail } from "./projections/rail.ts";
import { nomEtat } from "./rail.ts";

const USAGE = "usage : BRIGADE_STATE_DIR=<répertoire d'état> npm --prefix runtime run rail";

function echouer(code: number, message: string): never {
  console.error(`brigade : ${message}`);
  process.exit(code);
}

// Ce que l'état a à dire de plus que son nom : qui, depuis quand, jusqu'à quand.
function detail(ticket: TicketRail): string {
  switch (ticket.state) {
    case "waiting":
      return `depuis ${ticket.since}`;
    case "taken":
      return `par ${ticket.station} depuis ${ticket.since}, bail jusqu'à ${ticket.leaseUntil}`;
    case "pass":
    case "served":
      return `depuis ${ticket.since}, cuisiné par ${ticket.station}`;
    case "86":
      return `depuis ${ticket.since} (${ticket.reason}), ${ticket.until ? `retour à ${ticket.until}` : "sans heure de retour"}`;
  }
}

function formater(ticket: TicketRail): string {
  return [
    `#${ticket.ticket}`,
    nomEtat(ticket.state),
    ticket.priority === null ? "-" : `prio:${ticket.priority}`,
    detail(ticket),
    ticket.title,
  ].join("  ");
}

const repertoireEtat = process.env.BRIGADE_STATE_DIR;
if (!repertoireEtat) echouer(2, `BRIGADE_STATE_DIR n'est pas défini\n${USAGE}`);
if (process.argv.length > 2) echouer(2, USAGE);

let journal;
try {
  journal = ouvrirJournal(repertoireEtat, { lectureSeule: true });
} catch (erreur) {
  echouer(1, erreur instanceof Error ? erreur.message : String(erreur));
}
try {
  const tickets = lireRail(journal.base);
  if (tickets.length === 0) console.log("rail vide");
  for (const ticket of tickets) console.log(formater(ticket));
} finally {
  journal.fermer();
}
