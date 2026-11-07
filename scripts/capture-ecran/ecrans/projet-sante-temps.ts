// Kitchen > Health de « parade » (#2664, épique #2659) : les mêmes médiane et p75 que la bande du rail, contre le plafond, et la phase la plus longue.
import type { Ecran } from "./commun.ts";
import { donnees, OUVRIR, SUR_LA_BOX } from "./cuisine-demenagee.ts";
import { KITCHEN } from "./projet-sante.ts";
import { TEMPS } from "./rail-temps.ts";

export const ecran: Ecran = {
  dit: "L'espace de « parade », Kitchen > Health : médiane et p75 contre le plafond, et la phase la plus longue (#2664)",
  largeur: 1440,
  hauteur: 900,
  etapes: [OUVRIR, KITCHEN],
  donnees: () => donnees({ ...SUR_LA_BOX, temps: TEMPS }),
};
