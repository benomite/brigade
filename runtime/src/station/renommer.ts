// Renomme la station de cette machine : `BRIGADE_STATION_DIR=<répertoire>
// node src/station/renommer.ts <nom>`. Le nom retenu change (`nom.ts`) ; la
// station le déclare à son prochain démarrage, sous les mêmes gists : elle
// remplace l'ancienne dans l'app au lieu de s'y ajouter.
import { resolve } from "node:path";
import { renommerLaStation } from "./nom.ts";

const racine = process.env.BRIGADE_STATION_DIR;
const nom = process.argv[2];
if (!racine || nom === undefined || process.argv.length > 3) {
  console.error("usage : BRIGADE_STATION_DIR=<répertoire> node src/station/renommer.ts <nom>");
  process.exit(2);
}
try {
  const { ancien, nouveau } = renommerLaStation(resolve(racine), nom);
  console.log(ancien === null || ancien === nouveau ? `brigade : la station s'appelle ${nouveau}` : `brigade : la station ${ancien} s'appelle désormais ${nouveau}`);
  if (process.env.BRIGADE_STATION_NOM) console.log(`brigade : BRIGADE_STATION_NOM=${process.env.BRIGADE_STATION_NOM} prime encore sur ce nom : retire-le pour que le renommage compte`);
  console.log("brigade : redémarre la station pour qu'elle se déclare sous ce nom");
} catch (erreur) {
  console.error(`brigade : ${(erreur as Error).message}`);
  process.exit(2);
}
