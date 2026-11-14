// La bande du rail de « parade » (#2664, épique #2659, #2670, #3013) : le temps d'un ticket en médiane, sans plafond, le
// p75 et le temps perdu au survol, tels que la mesure les publie dans `resume` de `temps-tickets.json` ; le dernier merge. Le temps
// perdu (5 min, surtout des cuissons ratées) passe le seuil (2 min). À côté, la pass des 7 derniers jours (#3512) : la part
// qui pèse le plus sur son temps, chaque phase au survol.
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
// Le temps de la pass sur 7 jours, tel que la station le publie (`passe`, runtime/src/temps-ticket/passe.ts) : la lecture
// du 2026-11-14, la CI qui attend ses runners.
const part = (cle: string, nom: string, livraisons: number, medianeS: number | null, p75S: number | null, totalS: number, partPct: number | null) => ({ cle, nom, livraisons, medianeS, p75S, totalS, partPct });
export const PASSE = {
  jours: 7,
  livraisons: 12,
  parts: [
    part("attente", "waiting for the pass", 12, 120, 300, 2400, 9),
    part("gates", "gates", 12, 0, 0, 0, 0),
    part("revue", "review", 12, 240, 420, 3600, 14),
    part("ci", "CI", 12, 1100, 1500, 14_000, 54),
    part("merge", "merge", 12, 10, 20, 150, 1),
    part("ciAttente", "CI waiting for runners", 9, 1200, 1680, 16_200, 62),
    part("ciCourse", "CI running", 9, 420, 540, 4000, 15),
  ],
  phaseLaPlusLourde: { nom: "CI", totalS: 14_000 },
  partLaPlusLourde: { nom: "CI waiting for runners", partPct: 62 },
  relancees: 4,
  renvoyees: 2,
  passesRenvoyeesS: 1500,
};
export const TEMPS = { enregistrements: LENT, lostTimeMaxMin: 2, resume: RESUME, passe: PASSE };

export const ecran: Ecran = {
  dit: "La bande du rail de « parade » : la médiane du temps d'un ticket, le p75 et le temps perdu au survol, la part qui pèse le plus sur la pass, le dernier merge (#2664, #2670, #3013, #3512)",
  largeur: 1440,
  hauteur: 900,
  etapes: [OUVRIR],
  donnees: () => donnees({ ...SUR_LA_BOX, temps: TEMPS }),
};
