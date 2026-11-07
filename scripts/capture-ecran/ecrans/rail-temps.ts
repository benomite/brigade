// La bande du rail de « parade » (#2664, épique #2659) : le temps d'un ticket en médiane et p75 contre le plafond, tels
// que la mesure les publie dans `resume` de `temps-tickets.json`. La médiane (14 min) et le p75 (47 min) passent le plafond (10 min).
import type { Ecran } from "./commun.ts";
import { donnees, OUVRIR, SUR_LA_BOX } from "./cuisine-demenagee.ts";
import { LENT } from "./projet-temps-commun.ts";

export const RESUME = { n: 10, medianMin: 14, p75Min: 47, maxMin: 10, phaseLaPlusLongue: { nom: "review", medianMin: 9 } };
export const TEMPS = { enregistrements: LENT, tempsMaxTicketMin: 10, resume: RESUME };

export const ecran: Ecran = {
  dit: "La bande du rail de « parade » : médiane et p75 du temps d'un ticket contre le plafond, au-dessus (#2664)",
  largeur: 1440,
  hauteur: 900,
  etapes: [OUVRIR],
  donnees: () => donnees({ ...SUR_LA_BOX, temps: TEMPS }),
};
