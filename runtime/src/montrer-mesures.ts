// Le relevé des mesures, en lecture seule :
//   npm --prefix runtime run measures                 par tranches de 10 merges
//   npm --prefix runtime run measures -- --by <n>     par tranches de <n> merges
//   npm --prefix runtime run measures -- --last <n>   les renvois des <n> derniers tickets servis (20 par défaut)
// L'ancienne option `--par` répond encore, en disant la nouvelle (`commandes.ts`).
// La commande n'écrit jamais, et répond pendant que le runtime tourne.
import { enAnglais } from "./commandes.ts";
import { ouvrirJournal } from "./journal.ts";
import { journalPasRejoue } from "./journal-pas-rejoue.ts";
import { decrireReleve, PAR_DEFAUT } from "./mesures.ts";
import { parcoursDesTickets } from "./parcours-des-tickets.ts";
import { livraisonsMergees, seuilsEnVigueur } from "./projections/mesures.ts";
import { decrireRenvois, DERNIERS_PAR_DEFAUT, mesurerRenvois } from "./renvois.ts";

const USAGE = "usage : BRIGADE_STATE_DIR=<répertoire d'état> npm --prefix runtime run measures -- [--by <nombre de merges>] [--last <nombre de tickets>]";

function echouer(code: number, message: string): never {
  console.error(`brigade : ${message}`);
  process.exit(code);
}

const args = enAnglais("measures", process.argv.slice(2), (ligne) => console.error(ligne));
const repertoireEtat = process.env.BRIGADE_STATE_DIR;
if (!repertoireEtat) echouer(2, `BRIGADE_STATE_DIR n'est pas défini\n${USAGE}`);
// Chaque option une fois au plus, suivie d'un entier positif.
const options = new Map<string, number>();
for (let i = 0; i < args.length; i += 2) {
  const [option, valeur] = [args[i] ?? "", args[i + 1]];
  if (!["--by", "--last"].includes(option) || options.has(option) || valeur === undefined || !/^[1-9][0-9]*$/.test(valeur)) echouer(2, USAGE);
  options.set(option, Number(valeur));
}
const par = options.get("--by") ?? PAR_DEFAUT;
const derniers = options.get("--last") ?? DERNIERS_PAR_DEFAUT;

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
  console.log("");
  for (const ligne of decrireRenvois(mesurerRenvois(parcoursDesTickets(base), derniers))) console.log(ligne);
} catch (erreur) {
  // En lecture seule, rien ne crée les tables d'un journal écrit par un
  // runtime d'avant ce relevé.
  if (journalPasRejoue(erreur)) echouer(1, "ce journal n'a pas encore le relevé des mesures : redémarrer le runtime, qui le recalcule");
  throw erreur;
} finally {
  journal.fermer();
}
