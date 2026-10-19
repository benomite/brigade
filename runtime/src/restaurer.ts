// Restaure une sauvegarde dans un répertoire d'état neuf :
//   BRIGADE_STATE_DIR=<état> npm --prefix runtime run restore -- <destination>/<horodatage>
// Elle n'écrase jamais un journal. Le runtime se démarre ensuite comme
// d'habitude : il retrouve le journal d'un runtime mort sans préavis.
import { restaurer, SauvegardeRefusee } from "./sauvegarde.ts";

const USAGE = "usage: BRIGADE_STATE_DIR=<new state directory> npm --prefix runtime run restore -- <dated backup>";
const REFUS = 2;

function echouer(code: number, message: string): never {
  console.error(`brigade : ${message}`);
  process.exit(code);
}

const args = process.argv.slice(2);
const repertoireEtat = process.env.BRIGADE_STATE_DIR;
if (!repertoireEtat) echouer(REFUS, `BRIGADE_STATE_DIR is not set\n${USAGE}`);
const [sauvegarde] = args;
if (args.length !== 1 || sauvegarde === undefined) echouer(REFUS, USAGE);

let bilan;
try {
  bilan = restaurer({ sauvegarde, repertoireEtat });
} catch (erreur) {
  const message = erreur instanceof Error ? erreur.message : String(erreur);
  if (erreur instanceof SauvegardeRefusee) echouer(REFUS, `restore refused — ${message}`);
  echouer(1, `restore failed — ${message}`);
}
console.log(
  `brigade : state of project "${bilan.projet}" restored in ${repertoireEtat} — backup of ${bilan.prise}, ` +
    `${bilan.evenements.toLocaleString("en-US")} events up to no. ${bilan.dernierSeq}, ${bilan.flux.toLocaleString("en-US")} raw streams`,
);
if (bilan.fluxManquants > 0) {
  console.error(
    `brigade : ${bilan.fluxManquants.toLocaleString("en-US")} raw streams announced by the backup were not found — they live in runs/, next to the dated backups: bring them over with those. The log itself is complete`,
  );
}
console.log("brigade : neither the station's clone nor the worktrees are restored — clone the repository again, then start the runtime");
