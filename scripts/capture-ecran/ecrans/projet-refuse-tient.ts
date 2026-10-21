// La page de « parade » refusé par sa box, le remède confirmé et joué (#1205) : la station répond que le refus
// tient, et la page dit pourquoi en une phrase, sous le refus ; le bouton reste pour réessayer.
import type { Ecran } from "./commun.ts";
import { donnees, OUVRIR } from "./cuisine-demenagee.ts";
import { COOKS, OUI, PORT, REMEDE, refuse } from "./projet-refuse.ts";

export const ecran: Ecran = {
  dit: "L'espace de « parade » refusé par sa box, le remède joué : la station refuse encore, et la page dit pourquoi en une phrase (#1205)",
  largeur: 1440,
  hauteur: 900,
  etapes: [OUVRIR, COOKS, REMEDE, OUI],
  donnees: () =>
    donnees(refuse(PORT), {
      leverLeRefus: { outcome: "holds", reason: "The action did not go through, so the station still refuses this project: the station's configuration could not be written." },
    }),
};
