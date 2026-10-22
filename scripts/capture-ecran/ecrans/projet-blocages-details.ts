// La même page (#1399), le « details » du premier blocage cliqué : ce que gh et git ont dit se déplie sous sa
// ligne, en second, sans prendre la place de la phrase.
import type { Ecran } from "./commun.ts";
import { donnees, OUVRIR, SUR_LA_BOX } from "./cuisine-demenagee.ts";
import { BLOCAGES } from "./projet-blocages.ts";

export const ecran: Ecran = {
  dit: "L'espace de « parade » et ses trois blocages, le détail du premier déplié (#1399)",
  largeur: 1440,
  hauteur: 900,
  etapes: [OUVRIR, { cliquer: "#blocages-du-projet li[data-blocage=\"clone\"] summary" }],
  donnees: () => donnees({ ...SUR_LA_BOX, blocages: BLOCAGES }),
};
