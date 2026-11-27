// Une app qui s'ouvre sur un ordinateur, trouve sa station de fond — rejointe, ou lancée —, dit ce qu'elle a trouvé, et
// quitte aussitôt : `node false-app.ts <répertoire de la station> <point d'entrée de la station>`.
import { launchTheBackground } from "../../src/station-background/background.ts";
import { holdTheStationOfBackground } from "../../src/station-background/attached.ts";

const [, , root = "", embedded = ""] = process.argv;
const station = holdTheStationOfBackground({
  racine: root,
  inscrire: async () => ({ par: "aucune" }),
  lancer: () => launchTheBackground({ node: process.execPath, embarque: embedded, racine: root, env: process.env }),
  appairer: async () => ({ refus: "not in this test" }),
  dire: (line) => console.error(line),
  attenteMs: 1_500,
});
console.log(JSON.stringify(await station.pret));
process.exit(0);
