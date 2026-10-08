// Montre le rail, en lecture seule : `npm --prefix runtime run rail`.
// Une ligne par ticket, dans l'ordre de service :
//   #<ticket>  <état>  <priorité>  <détail de l'état>  <titre>
// puis, en retrait, sa fiche s'il en porte une, et ce que le runtime n'y
// comprend pas.
import { ouvrirJournal } from "./journal.ts";
import { journalPasRejoue } from "./journal-pas-rejoue.ts";
import { communsDuRail, lireRail, type TicketRail } from "./projections/rail.ts";
import { direRetenue, etatLu } from "./rail.ts";

const USAGE = "usage : BRIGADE_STATE_DIR=<répertoire d'état> npm --prefix runtime run rail";

function echouer(code: number, message: string): never {
  console.error(`brigade : ${message}`);
  process.exit(code);
}

// Ce que l'état a à dire de plus que son nom : qui, depuis quand, jusqu'à
// quand — et, pour un ticket en attente qui ne part pas, pourquoi.
function detail(ticket: TicketRail): string {
  switch (ticket.state) {
    case "waiting":
      return [...[direRetenue(ticket) ?? []].flat(), `depuis ${ticket.since}`].join(" — ");
    case "taken":
      return `par ${ticket.station} depuis ${ticket.since}, dernier progrès ${ticket.progressedAt}, bail jusqu'à ${ticket.leaseUntil}`;
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
    etatLu(ticket),
    ticket.priority === null ? "-" : `prio:${ticket.priority}`,
    detail(ticket),
    ticket.title,
  ].join("  ");
}

const RETRAIT = "     ";

function fiche({ card }: TicketRail): string[] {
  if (card === null) return [];
  const attend = card.waitsFor.length === 0 ? "rien" : card.waitsFor.map((numero) => `#${numero}`).join(", ");
  return [
    `${RETRAIT}fiche — attend : ${attend} · zone : ${card.zone.join(", ") || "aucune"}`,
    ...card.problems.map((probleme) => `${RETRAIT}FICHE ILLISIBLE — ${probleme}`),
  ];
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
  const communs = communsDuRail(journal.base);
  if (communs.length > 0) console.log(`chemins communs, à personne : ${communs.join(", ")}`);
  if (tickets.length === 0) console.log("rail vide");
  for (const ticket of tickets) console.log([formater(ticket), ...fiche(ticket)].join("\n"));
} catch (erreur) {
  // En lecture seule, rien ne crée le rail d'un journal écrit par un runtime
  // d'avant ses colonnes d'aujourd'hui.
  if (journalPasRejoue(erreur)) {
    echouer(1, "ce journal n'a pas encore l'état du rail : redémarrer le runtime, qui le recalcule");
  }
  throw erreur;
} finally {
  journal.fermer();
}
