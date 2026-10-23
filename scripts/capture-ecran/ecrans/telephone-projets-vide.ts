// « Tous les projets » sur le téléphone appairé à une station qui ne sert aucun projet (#1414) : une phrase le dit.
import { type Ecran } from "./commun.ts";
import { guichet, HAUTEUR, LARGEUR, lireLaStation } from "./telephone-projets-commun.ts";

const donnees = await lireLaStation({ repondre: guichet([]), connus: [] });
export const ecran: Ecran = {
  dit: "« Tous les projets » sur le téléphone appairé, la station ne sert aucun projet : une phrase le dit, en 412 × 915",
  largeur: LARGEUR,
  hauteur: HAUTEUR,
  etapes: [],
  donnees: () => donnees,
};
