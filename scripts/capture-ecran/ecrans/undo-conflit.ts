// « undo » cliqué sur #9, servi (ticket 3274) : son merge ne s'annule pas proprement, du travail servi depuis s'appuie
// dessus. Aucune PR ne reste ouverte ; la carte le dit en une ligne, et nomme le ticket déposé pour que la cuisine
// l'annule à la main.
import type { Ecran } from "./commun.ts";
import { ANNULER_9, donnees, OUVRIR_PARADE } from "./undo-commun.ts";

export const ecran: Ecran = {
  dit: "« undo » cliqué sur #9 dans Served de « parade » (ticket 3274) : le revert ne s'applique pas proprement — la carte le dit en une ligne et nomme le ticket déposé pour la cuisine",
  largeur: 2200,
  hauteur: 900,
  etapes: [OUVRIR_PARADE, ANNULER_9],
  donnees: () => donnees({ annulerServi: { fait: "#9 cannot be undone in one click: later work builds on it — ticket #44 asks the kitchen to undo it by hand" } }),
};
