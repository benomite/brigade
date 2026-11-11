// La page du coût de tous les projets, et à côté de leurs tokens, leurs chiffres d'autonomie ensemble (#3222) : servi
// sans humain, délai, taux de renvoi, sur les 7 derniers jours ; « served with a human » déplié, chaque ticket avec sa question.
import type { Ecran } from "./commun.ts";
import { DE_TOUS } from "./autonomie-commun.ts";
import { donnees, OUVRIR, SUR_LA_BOX } from "./cuisine-demenagee.ts";
import { SETTINGS } from "./projet-sante.ts";

export const ecran: Ecran = {
  dit: "La page du coût de tous les projets : leurs chiffres d'autonomie ensemble, « served with a human » déplié (#3222)",
  largeur: 1440,
  hauteur: 900,
  etapes: [OUVRIR, SETTINGS, { cliquer: "#couts-de-tous button" }, { cliquer: "#cout button.avec-humain" }],
  donnees: () => donnees(SUR_LA_BOX, { lireAutonomie: DE_TOUS }),
};
