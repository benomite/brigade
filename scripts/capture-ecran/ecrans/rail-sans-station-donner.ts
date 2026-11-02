// La carte de #22 dans WAITING de « parade », faute d'une station qui fournit `chrome-connecté` : « Give it to a
// station » cliqué (#1958). Sous la carte, les stations du projet, la première choisie, chacune avec ce qu'elle
// fournit ; puis la confirmation, qui dit ce que la station fournira de plus et le prix du geste.
import { ecran as sansStation } from "./rail-sans-station.ts";
import type { Ecran } from "./commun.ts";

export const ecran: Ecran = {
  ...sansStation,
  dit: "La carte de #22 dans WAITING de « parade » : « Give it to a station » cliqué — les stations du projet, la première choisie, et la confirmation (1958)",
  etapes: [...sansStation.etapes, { cliquer: '#rail button[data-sortie="station"]' }],
};
