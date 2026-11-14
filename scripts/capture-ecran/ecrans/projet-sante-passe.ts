// La section de Settings de « parade » : le temps de la pass des 7 derniers jours (#3512), tel que la station le publie
// (`passe`, runtime/src/temps-ticket/passe.ts) — la part qui pèse le plus, chaque phase avec sa médiane et son p75, les
// runs relancés et ce que les renvois ont coûté. La lecture du 2026-11-14 : la CI qui attend ses runners.
import type { Ecran } from "./commun.ts";
import { donnees, OUVRIR, SUR_LA_BOX } from "./cuisine-demenagee.ts";
import { SETTINGS } from "./projet-sante.ts";
import { TEMPS } from "./rail-temps.ts";

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

export const ecran: Ecran = {
  dit: "L'espace de « parade », Settings : le temps de la pass des 7 derniers jours, la part qui pèse le plus et chaque phase (#3512)",
  largeur: 1440,
  hauteur: 900,
  etapes: [OUVRIR, SETTINGS, { defiler: '#bandeau-sante [data-bloc="chiffres-autonomie"]' }],
  donnees: () => donnees({ ...SUR_LA_BOX, temps: { ...TEMPS, passe: PASSE } }),
};
