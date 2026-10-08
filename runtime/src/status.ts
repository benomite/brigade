// L'état de la cuisine, en lecture seule :
//   npm --prefix runtime run status                          la photo : runtime, rail, cooks, derniers événements
//   npm --prefix runtime run status -- --suivre [<ticket>]   la photo, puis le journal en direct, jusqu'à Ctrl-C
// BRIGADE_BACKUP_MAX_AGE_HOURS règle l'âge au-delà duquel la dernière sauvegarde
// est marquée (48 par défaut).
// La commande n'écrit jamais, et répond pendant que le runtime et ses cooks
// tournent.
import { AGE_MAX_SAUVEGARDE_MS, decrireEtat, lireEtat, suivre } from "./etat.ts";
import { ouvrirJournal } from "./journal.ts";
import { journalPasRejoue } from "./journal-pas-rejoue.ts";

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
const reglage = process.env.BRIGADE_BACKUP_MAX_AGE_HOURS;
if (reglage !== undefined && !/^[1-9][0-9]*$/.test(reglage)) {
  echouer(2, `BRIGADE_BACKUP_MAX_AGE_HOURS invalide : « ${reglage} » — attendu un nombre d'heures, 1 au moins`);
}
const ageMaxSauvegardeMs = reglage === undefined ? AGE_MAX_SAUVEGARDE_MS : Number(reglage) * 3_600_000;

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
  // runtime d'avant ces projections, ni ne leur donne leur forme du jour.
  if (journalPasRejoue(erreur)) {
    echouer(1, "ce journal n'a pas encore tout l'état que `status` lit : redémarrer le runtime, qui le recalcule");
  }
  throw erreur;
}
for (const ligne of decrireEtat(etat, new Date(), ageMaxSauvegardeMs)) console.log(ligne);

if (option === undefined) {
  journal.fermer();
} else {
  // Les gestionnaires précèdent l'annonce : qui la lit peut signaler sans courir.
  // Un second signal, ou l'autre des deux, ne doit pas refermer le journal.
  let arreter = () => {};
  let arrete = false;
  const arretPropre = () => {
    if (arrete) return;
    arrete = true;
    arreter();
    journal.fermer();
  };
  for (const signal of ["SIGINT", "SIGTERM"] as const) process.on(signal, arretPropre);
  console.log(`\nsuivi en direct${ticket === undefined ? "" : ` du ticket #${ticket}`} — Ctrl-C pour arrêter`);
  arreter = suivre(journal, {
    depuis: etat.dernierSeq,
    ticket: ticket === undefined ? undefined : Number(ticket),
    ecrire: (ligne) => console.log(ligne),
  });
}
