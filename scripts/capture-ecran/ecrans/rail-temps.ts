// La bande du rail de « parade » (#2664, épique #2659, #2670, #3013) : le temps d'un ticket en médiane, sans plafond, le
// p75 et le temps perdu au survol, tels que la mesure les publie dans `resume` de `temps-tickets.json` ; le dernier merge. Le temps
// perdu (5 min, surtout des cuissons ratées) passe le seuil (2 min).
import type { Ecran } from "./commun.ts";
import { donnees, OUVRIR, SUR_LA_BOX } from "./cuisine-demenagee.ts";
import { LENT } from "./projet-temps-commun.ts";

export const RESUME = {
  n: 10,
  medianMin: 14,
  p75Min: 47,
  perduMedianMin: 5,
  lostTimeMaxMin: 2,
  phaseLaPlusLongue: { nom: "review", medianMin: 9, partPct: 64 },
  perteLaPlusLourde: { nom: "failed cooks", medianMin: 4, partPct: 80 },
};
export const TEMPS = { enregistrements: LENT, lostTimeMaxMin: 2, resume: RESUME };

export const ecran: Ecran = {
  dit: "La bande du rail de « parade » : la médiane du temps d'un ticket, le p75 et le temps perdu au survol, le dernier merge (#2664, #2670, #3013)",
  largeur: 1440,
  hauteur: 900,
  etapes: [OUVRIR],
  donnees: () => donnees({ ...SUR_LA_BOX, temps: TEMPS }),
};
