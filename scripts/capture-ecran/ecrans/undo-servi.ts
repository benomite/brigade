// La colonne Served de « parade » (ticket 3274) : #9 et #7 servis, chacun avec « undo » sous « open the merged PR » ; les
// cartes des autres colonnes n'en ont pas.
import type { Ecran } from "./commun.ts";
import { donnees, OUVRIR_PARADE } from "./undo-commun.ts";

export const ecran: Ecran = {
  dit: "L'espace de « parade », sa colonne Served en vue (ticket 3274) : #9 et #7 servis portent « undo », les autres cartes non",
  largeur: 2200,
  hauteur: 900,
  etapes: [OUVRIR_PARADE],
  donnees: () => donnees(),
};
