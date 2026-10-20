// La page de « parade », qui cuit sur sa box (#1095) : « Cooks on box », et « move the kitchen »
// cliqué — le choix de la machine où l'emmener, ce Mac, et son prix en une ligne.
import type { Ecran } from "./commun.ts";
import { DEMENAGER, donnees, OUVRIR, SUR_LA_BOX } from "./cuisine-demenagee.ts";

export const ecran: Ecran = {
  dit: "L'espace de « parade », qui cuit sur sa box : « move the kitchen » ouvert, ce Mac à choisir, le prix en une ligne (#1095)",
  largeur: 1440,
  hauteur: 900,
  etapes: [OUVRIR, DEMENAGER],
  donnees: () => donnees(SUR_LA_BOX),
};
