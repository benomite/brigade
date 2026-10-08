// Relit le journal, en lecture seule : `npm --prefix runtime run journal -- [<ticket>]`.
// Avec un numéro de ticket, tout ce qui lui est arrivé, dans l'ordre ; sans,
// tout le journal. Une ligne par événement :
//   <seq>  <horodatage>  <projet>  #<ticket>  <type>  <auteur>  <charge utile>
import type { Evenement } from "./evenements.ts";
import { ouvrirJournal } from "./journal.ts";

const USAGE = "usage : BRIGADE_STATE_DIR=<répertoire d'état> npm --prefix runtime run journal -- [<numéro de ticket>]";

function echouer(code: number, message: string): never {
  console.error(`brigade : ${message}`);
  process.exit(code);
}

function formater(evenement: Evenement): string {
  return [
    evenement.seq,
    evenement.at,
    evenement.project,
    evenement.ticket === null ? "-" : `#${evenement.ticket}`,
    evenement.type,
    evenement.author,
    JSON.stringify(evenement.payload),
  ].join("  ");
}

const args = process.argv.slice(2);
const repertoireEtat = process.env.BRIGADE_STATE_DIR;
if (!repertoireEtat) echouer(2, `BRIGADE_STATE_DIR n'est pas défini\n${USAGE}`);
const [argument] = args;
if (args.length > 1 || (argument !== undefined && !/^[0-9]+$/.test(argument))) echouer(2, USAGE);

let journal;
try {
  journal = ouvrirJournal(repertoireEtat, { lectureSeule: true });
} catch (erreur) {
  echouer(1, erreur instanceof Error ? erreur.message : String(erreur));
}
try {
  const evenements = argument === undefined ? journal.tout() : journal.duTicket(Number(argument));
  if (evenements.length === 0) {
    console.log(argument === undefined ? "journal vide" : `aucun événement pour le ticket ${argument}`);
  }
  for (const evenement of evenements) console.log(formater(evenement));
} finally {
  journal.fermer();
}
