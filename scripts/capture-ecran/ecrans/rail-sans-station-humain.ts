// La carte de #22 dans WAITING de « parade », faute d'une station qui fournit `chrome-connecté` : « It's a human's
// job » cliqué (#1958). Sous la carte, la confirmation : le ticket quitte le rail et attend dans TODO, tâche du chef.
import { ecran as sansStation } from "./rail-sans-station.ts";
import type { Ecran } from "./commun.ts";

export const ecran: Ecran = {
  ...sansStation,
  dit: "La carte de #22 dans WAITING de « parade » : « It's a human's job » cliqué — sa confirmation (1958)",
  etapes: [...sansStation.etapes, { cliquer: '#rail button[data-sortie="humain"]' }],
};
