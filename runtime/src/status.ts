// L'état de la cuisine, en lecture seule :
//   npm --prefix runtime run status                          la photo : runtime, rail, cooks, derniers événements
//   npm --prefix runtime run status -- --suivre [<ticket>]   la photo, puis le journal en direct, jusqu'à Ctrl-C
// La commande n'écrit jamais, et répond pendant que le runtime et ses cooks
// tournent.
import { decrireEtat, lireEtat, suivre } from "./etat.ts";
import { ouvrirJournal } from "./journal.ts";

const USAGE = "usage : BRIGADE_STATE_DIR=<répertoire d'état> npm --prefix runtime run status -- [--suivre [<numéro de ticket>]]";

function echouer(code: number, message: string): never {
  console.error(`brigade : ${message}`);
  process.exit(code);
}

const args = process.argv.slice(2);
const repertoireEtat = process.env.BRIGADE_STATE_DIR;
if (!repertoireEtat) echouer(2, `BRIGADE_STATE_DIR n'est pas défini\n${USAGE}`);
const [option, ticket] = args;
if (args.length > 2 || (option !== undefined && option !== "--suivre") || (ticket !== undefined && !/^[0-9]+$/.test(ticket))) {
  echouer(2, USAGE);
}

let journal;
try {
  journal = ouvrirJournal(repertoireEtat, { lectureSeule: true });
} catch (erreur) {
  echouer(1, erreur instanceof Error ? erreur.message : String(erreur));
}

let etat;
try {
  etat = lireEtat(journal);
} catch (erreur) {
  journal.fermer();
  // En lecture seule, rien ne crée les tables d'un journal écrit par un
  // runtime d'avant ces projections.
  if (erreur instanceof Error && /no such table/.test(erreur.message)) {
    echouer(1, "ce journal n'a pas encore tout l'état que `status` lit : redémarrer le runtime, qui le recalcule");
  }
  throw erreur;
}
for (const ligne of decrireEtat(etat, new Date())) console.log(ligne);

if (option === undefined) {
  journal.fermer();
} else {
  console.log(`\nsuivi en direct${ticket === undefined ? "" : ` du ticket #${ticket}`} — Ctrl-C pour arrêter`);
  const arreter = suivre(journal, {
    depuis: etat.dernierSeq,
    ticket: ticket === undefined ? undefined : Number(ticket),
    ecrire: (ligne) => console.log(ligne),
  });
  for (const signal of ["SIGINT", "SIGTERM"] as const) {
    process.on(signal, () => {
      arreter();
      journal.fermer();
    });
  }
}
