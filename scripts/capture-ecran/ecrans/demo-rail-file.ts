// Scène 3 de la démo (ticket 2875) : #21 « L'export du journal » vient d'arriver sur le rail de « parade », en attente.
import type { Ecran } from "./commun.ts";
import { donneesDe, EN_ATTENTE, OUVRIR_PARADE } from "./demo-commun.ts";

export const ecran: Ecran = {
  dit: "La démo, scène 3 : le rail de « parade », #21 en attente, seul ticket",
  largeur: 1440,
  hauteur: 900,
  etapes: [OUVRIR_PARADE],
  donnees: () => donneesDe(EN_ATTENTE),
};
