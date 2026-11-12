// La section de Settings de « parade » : ses chiffres d'autonomie (#3379), sous le closer, au-dessus des lignes de tous les projets.
import type { Ecran } from "./commun.ts";
import { DE_PARADE_PARTIEL } from "./autonomie-commun.ts";
import { donnees, OUVRIR, SUR_LA_BOX } from "./cuisine-demenagee.ts";
import { SETTINGS } from "./projet-sante.ts";

export const ecran: Ecran = {
  dit: "L'espace de « parade », Settings : les chiffres d'autonomie du projet sur les 7 derniers jours, GitHub ayant refusé une page : le bloc dit depuis quand ils sont comptés (#3379)",
  largeur: 1440,
  hauteur: 900,
  etapes: [OUVRIR, SETTINGS, { defiler: '#bandeau-sante [data-bloc="chiffres-autonomie"]' }],
  donnees: () => donnees(SUR_LA_BOX, { lireAutonomie: DE_PARADE_PARTIEL }),
};
