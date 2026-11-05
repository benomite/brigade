// La page de « parade » : les temps des derniers tickets — Médiane au-dessus du plafond (#2346, épique #2336).
import type { Ecran } from "./commun.ts";
import { OUVRIR } from "./cuisine-demenagee.ts";
import { avec, LENT } from "./projet-temps-commun.ts";

export const ecran: Ecran = {
  dit: "L'espace de « parade », bloc des temps de tickets : Médiane au-dessus du plafond (#2346)",
  largeur: 1440,
  hauteur: 900,
  etapes: [OUVRIR],
  donnees: avec(LENT),
};
