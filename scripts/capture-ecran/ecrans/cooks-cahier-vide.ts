// Kitchen > Cooks de « parade », son cahier de leçons vide (#2493) : le bloc « Notebook » le dit en une ligne.
import type { Ecran } from "./commun.ts";
import { COOKS, lire } from "./cooks-cahier.ts";
import { KITCHEN } from "./projet-sante.ts";

export const ecran: Ecran = {
  dit: "Kitchen > Cooks de « parade » sans leçon : le bloc Notebook dit qu'il n'y en a pas encore (#2493)",
  largeur: 1440,
  hauteur: 1900,
  etapes: [{ cliquer: '#projets > button[title^="parade — "]' }, KITCHEN, COOKS],
  donnees: lire({ lecons: [], profils: [] }),
};
