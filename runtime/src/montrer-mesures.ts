// Le relevé des mesures, en lecture seule :
//   npm --prefix runtime run mesures                 par tranches de 10 merges
//   npm --prefix runtime run mesures -- --par <n>    par tranches de <n> merges
// La commande n'écrit jamais, et répond pendant que le runtime tourne.
import { ouvrirJournal } from "./journal.ts";
import { journalPasRejoue } from "./journal-pas-rejoue.ts";
import { decrireReleve, PAR_DEFAUT } from "./mesures.ts";
import { livraisonsMergees, seuilsEnVigueur } from "./projections/mesures.ts";

const USAGE = "usage : BRIGADE_STATE_DIR=<répertoire d'état> npm --prefix runtime run mesures -- [--par <nombre de merges>]";

function echouer(code: number, message: string): never {
  console.error(`brigade : ${message}`);
  process.exit(code);
}

const args = process.argv.slice(2);
const repertoireEtat = process.env.BRIGADE_STATE_DIR;
if (!repertoireEtat) echouer(2, `BRIGADE_STATE_DIR n'est pas défini\n${USAGE}`);
const [option, taille] = args;
if (args.length !== 0 && (args.length !== 2 || option !== "--par" || taille === undefined || !/^[1-9][0-9]*$/.test(taille))) echouer(2, USAGE);
const par = taille === undefined ? PAR_DEFAUT : Number(taille);

let journal;
try {
  journal = ouvrirJournal(repertoireEtat, { lectureSeule: true });
} catch (erreur) {
  echouer(1, erreur instanceof Error ? erreur.message : String(erreur));
}
try {
  const { base } = journal;
  const projet = base.lire<{ project: string }>("SELECT project FROM events ORDER BY seq DESC LIMIT 1")[0]?.project ?? null;
  for (const ligne of decrireReleve({ projet, livraisons: livraisonsMergees(base), seuils: seuilsEnVigueur(base) }, par)) console.log(ligne);
} catch (erreur) {
  // En lecture seule, rien ne crée les tables d'un journal écrit par un
  // runtime d'avant ce relevé.
  if (journalPasRejoue(erreur)) echouer(1, "ce journal n'a pas encore le relevé des mesures : redémarrer le runtime, qui le recalcule");
  throw erreur;
} finally {
  journal.fermer();
}
