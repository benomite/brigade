// Restaure une sauvegarde dans un répertoire d'état neuf :
//   BRIGADE_STATE_DIR=<état> npm --prefix runtime run restaurer -- <destination>/<horodatage>
// Elle n'écrase jamais un journal. Le runtime se démarre ensuite comme
// d'habitude : il retrouve le journal d'un runtime mort sans préavis.
import { restaurer, SauvegardeRefusee } from "./sauvegarde.ts";

const USAGE = "usage : BRIGADE_STATE_DIR=<répertoire d'état neuf> npm --prefix runtime run restaurer -- <sauvegarde datée>";
const REFUS = 2;

function echouer(code: number, message: string): never {
  console.error(`brigade : ${message}`);
  process.exit(code);
}

const args = process.argv.slice(2);
const repertoireEtat = process.env.BRIGADE_STATE_DIR;
if (!repertoireEtat) echouer(REFUS, `BRIGADE_STATE_DIR n'est pas défini\n${USAGE}`);
const [sauvegarde] = args;
if (args.length !== 1 || sauvegarde === undefined) echouer(REFUS, USAGE);

let bilan;
try {
  bilan = restaurer({ sauvegarde, repertoireEtat });
} catch (erreur) {
  const message = erreur instanceof Error ? erreur.message : String(erreur);
  if (erreur instanceof SauvegardeRefusee) echouer(REFUS, `restauration refusée — ${message}`);
  echouer(1, `restauration en échec — ${message}`);
}
console.log(
  `brigade : état du projet « ${bilan.projet} » restauré dans ${repertoireEtat} — sauvegarde du ${bilan.prise}, ` +
    `${bilan.evenements.toLocaleString("fr-FR")} événements jusqu'au n° ${bilan.dernierSeq}, ${bilan.flux.toLocaleString("fr-FR")} flux bruts`,
);
if (bilan.fluxManquants > 0) {
  console.error(
    `brigade : ${bilan.fluxManquants.toLocaleString("fr-FR")} flux bruts annoncés par la sauvegarde n'ont pas été trouvés — ils vivent dans runs/, à côté des sauvegardes datées : rapatrie-le avec elles. Le journal, lui, est complet`,
  );
}
console.log("brigade : ni le clone de la station ni les worktrees ne sont restaurés — reclone le dépôt, puis démarre le runtime");
