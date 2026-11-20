// « parade », le rail de rail-station-arretee-commun.ts, dont le disjoncteur s'est ouvert (#3602) : sa cuisine est
// retenue, la ligne `kitchen` de `status` dit « breaker OPEN » — la cause que l'app reçoit déjà (#3529).
import type { Rendu } from "./commun.ts";
import { RENDU_STATION_ARRETEE } from "./rail-station-arretee-commun.ts";

export const RENDU_DISJONCTEUR: Rendu = {
  ...RENDU_STATION_ARRETEE,
  facts: { ...RENDU_STATION_ARRETEE.facts, etat: "retenue" },
  status: `kitchen    held · breaker OPEN for 2 h 05 (3 failures in a row, failing ticket #4, exit code 1)\n${RENDU_STATION_ARRETEE.status}`,
};
