// Relit le journal, en lecture seule : `npm --prefix runtime run journal -- [<ticket> | --ticks]`.
// Avec un numéro de ticket, tout ce qui lui est arrivé, dans l'ordre ; sans,
// tout le journal — moins les battements du runtime (un par minute, que
// `status` résume), sauf avec `--ticks`. Une ligne par événement.
import { BATTEMENT } from "./evenements/runtime.ts";
import { ouvrirJournal } from "./journal.ts";
import { formaterEvenement } from "./ligne-evenement.ts";

const USAGE = "usage : BRIGADE_STATE_DIR=<répertoire d'état> npm --prefix runtime run journal -- [<numéro de ticket> | --ticks]";

function echouer(code: number, message: string): never {
  console.error(`brigade : ${message}`);
  process.exit(code);
}

const args = process.argv.slice(2);
const repertoireEtat = process.env.BRIGADE_STATE_DIR;
if (!repertoireEtat) echouer(2, `BRIGADE_STATE_DIR n'est pas défini\n${USAGE}`);
const [argument] = args;
const avecTicks = argument === "--ticks";
if (args.length > 1 || (argument !== undefined && !avecTicks && !/^[0-9]+$/.test(argument))) echouer(2, USAGE);

let journal;
try {
  journal = ouvrirJournal(repertoireEtat, { lectureSeule: true });
} catch (erreur) {
  echouer(1, erreur instanceof Error ? erreur.message : String(erreur));
}
try {
  const evenements =
    argument === undefined
      ? journal.tout().filter((evenement) => evenement.type !== BATTEMENT)
      : avecTicks
        ? journal.tout()
        : journal.duTicket(Number(argument));
  if (evenements.length === 0) {
    console.log(argument === undefined || avecTicks ? "journal vide" : `aucun événement pour le ticket ${argument}`);
  }
  for (const evenement of evenements) console.log(formaterEvenement(evenement));
} finally {
  journal.fermer();
}
