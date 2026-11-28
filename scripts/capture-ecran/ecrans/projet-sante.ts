// La page de « parade », Settings et sa section « all projects » : les chiffres d'autonomie et les lignes de tous les projets.
import type { Ecran } from "./commun.ts";
import { donnees, OUVRIR, SUR_LA_BOX } from "./cuisine-demenagee.ts";
import { NORMAL } from "./projet-temps-commun.ts";

// Le bandeau de santé est une section de Settings (#3014) : le chef l'ouvre, puis la section est amenée à l'écran.
export const SETTINGS = { cliquer: "#onglets-du-projet button:nth-child(4)" };
export const SECTION = { defiler: "#bandeau-sante" };

export const ecran: Ecran = {
  dit: "L'espace de « parade », Settings et sa section des chiffres d'autonomie et de tous les projets (#3014)",
  largeur: 1440,
  hauteur: 900,
  etapes: [OUVRIR, SETTINGS, SECTION],
  donnees: () => donnees({ ...SUR_LA_BOX, temps: { enregistrements: NORMAL, lostTimeMaxMin: 2 } }),
};
