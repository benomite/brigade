// Où en est la mise à jour de la station de l'ordinateur, sans rien
// télécharger : le statut qu'elle tient, tel que l'app le lit.
//
//   node src/station-update/main.ts status
//
// Il écrit le JSON du statut (`statut.ts`) : `stationVersion`,
// `latestStationVersion`, `behind`, puis le reste. Une station qui n'a pas
// encore regardé dit sa version et aucun retard.
//
// L'environnement : BRIGADE_STATION_DIR, le répertoire de la station
// (obligatoire). Codes de sortie : 0, ou 2 sur un refus.
import { resolve } from "node:path";
import { versionDuRuntime } from "../mise-a-jour/en-service.ts";
import { lireStatut, statutVierge } from "./statut.ts";

const REFUS = 2;

function refuser(motif: string): never {
  console.error(`brigade: station update refused — ${motif}`);
  process.exit(REFUS);
}

const racine = resolve(process.env.BRIGADE_STATION_DIR || refuser("BRIGADE_STATION_DIR is not set"));
const [commande] = process.argv.slice(2);
if (commande !== "status") refuser(`unknown command “${commande ?? ""}” — expected status`);
console.log(JSON.stringify(lireStatut(racine) ?? statutVierge(versionDuRuntime()), null, 2));
