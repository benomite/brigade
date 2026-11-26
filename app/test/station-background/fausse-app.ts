// Une app qui s'ouvre sur un ordinateur, trouve sa station de fond — rejointe, ou lancée —, dit ce qu'elle a trouvé, et
// quitte aussitôt : `node fausse-app.ts <répertoire de la station> <point d'entrée de la station>`.
import { lancerLeBackground } from "../../src/station-background/background.ts";
import { holdLaStationDeBackground } from "../../src/station-background/attache.ts";

const [, , racine = "", embarque = ""] = process.argv;
const station = holdLaStationDeBackground({
  racine,
  inscrire: async () => ({ par: "aucune" }),
  lancer: () => lancerLeBackground({ node: process.execPath, embarque, racine, env: process.env }),
  appairer: async () => ({ refus: "not in this test" }),
  dire: (line) => console.error(line),
  attenteMs: 1_500,
});
console.log(JSON.stringify(await station.pret));
process.exit(0);
