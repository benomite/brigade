// Une app qui s'ouvre sur un ordinateur, trouve sa station de fond — rejointe, ou lancée —, dit ce qu'elle a trouvé, et
// quitte aussitôt : `node fausse-app.ts <répertoire de la station> <point d'entrée de la station>`.
import { lancerLeFond } from "../../src/station-fond/fond.ts";
import { tenirLaStationDeFond } from "../../src/station-fond/attache.ts";

const [, , racine = "", embarque = ""] = process.argv;
const station = tenirLaStationDeFond({
  racine,
  inscrire: async () => ({ par: "aucune" }),
  lancer: () => lancerLeFond({ node: process.execPath, embarque, racine, env: process.env }),
  appairer: async () => ({ refus: "not in this test" }),
  dire: (ligne) => console.error(ligne),
  attenteMs: 1_500,
});
console.log(JSON.stringify(await station.pret));
process.exit(0);
