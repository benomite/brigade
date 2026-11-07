// Kitchen > Health de « parade » (#2664, épique #2659) : les mêmes médiane, p75 et temps perdu contre son seuil que la bande du rail (#2670), la perte la plus lourde et la phase la plus longue.
import type { Ecran } from "./commun.ts";
import { donnees, OUVRIR, SUR_LA_BOX } from "./cuisine-demenagee.ts";
import { KITCHEN } from "./projet-sante.ts";
import { TEMPS } from "./rail-temps.ts";

export const ecran: Ecran = {
  dit: "L'espace de « parade », Kitchen > Health : médiane, p75, temps perdu contre son seuil, la perte la plus lourde et la phase la plus longue (#2664, #2670)",
  largeur: 1440,
  hauteur: 900,
  etapes: [OUVRIR, KITCHEN],
  donnees: () => donnees({ ...SUR_LA_BOX, temps: TEMPS }),
};
