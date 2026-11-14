// La bande du rail de « parade », le chiffre de la pass survolé (#3512) : chaque phase de la pass des 7 derniers jours, sa
// médiane et son p75, la phase la plus lourde, les runs relancés et ce que les renvois ont coûté.
import type { Ecran } from "./commun.ts";
import { donnees, OUVRIR, SUR_LA_BOX } from "./cuisine-demenagee.ts";
import { TEMPS } from "./rail-temps.ts";

export const ecran: Ecran = {
  dit: "La bande du rail de « parade », la pass survolée : chaque phase des 7 derniers jours, sa médiane et son p75 (#3512)",
  largeur: 1440,
  hauteur: 900,
  etapes: [OUVRIR, { survoler: ".bande-rail .bande-passe" }],
  donnees: () => donnees({ ...SUR_LA_BOX, temps: TEMPS }),
};
