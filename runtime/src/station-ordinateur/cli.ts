// La liste des projets que la station de cet ordinateur sert sur GitHub seul
// (`projets-servis.ts`), lue et écrite sans l'app :
//
//   BRIGADE_STATION_DIR=<dir> node src/station-ordinateur/cli.ts list
//   BRIGADE_STATION_DIR=<dir> node src/station-ordinateur/cli.ts add <owner>/<repo>
//   BRIGADE_STATION_DIR=<dir> node src/station-ordinateur/cli.ts remove <owner>/<repo>
//
// Chacune écrit la liste qui en résulte sur sa sortie, en JSON (`[]` : aucun
// projet). La station en service la relit à son tour suivant, ou tout de suite
// sur SIGHUP. Code de sortie 2 : la commande est refusée, et rien n'est écrit.
import { resolve } from "node:path";
import { ajouterProjetServi, DepotRefuse, lireProjetsServis, ProjetsServisIllisibles, retirerProjetServi } from "./projets-servis.ts";

const USAGE = "usage: BRIGADE_STATION_DIR=<dir> node src/station-ordinateur/cli.ts list | add <owner>/<repo> | remove <owner>/<repo>";

function refuser(motif: string): never {
  console.error(`brigade : served projects — ${motif}`);
  process.exit(2);
}

const racine = process.env.BRIGADE_STATION_DIR ? resolve(process.env.BRIGADE_STATION_DIR) : refuser(`BRIGADE_STATION_DIR is not set\n${USAGE}`);
const [verbe, depot, ...reste] = process.argv.slice(2);
if (reste.length > 0) refuser(USAGE);

try {
  let liste: string[];
  if (verbe === "list" && depot === undefined) liste = lireProjetsServis(racine);
  else if (verbe === "add" && depot !== undefined) liste = ajouterProjetServi(racine, depot);
  else if (verbe === "remove" && depot !== undefined) liste = retirerProjetServi(racine, depot);
  else refuser(USAGE);
  console.log(JSON.stringify(liste));
} catch (erreur) {
  if (erreur instanceof DepotRefuse || erreur instanceof ProjetsServisIllisibles) refuser(erreur.message);
  throw erreur;
}
