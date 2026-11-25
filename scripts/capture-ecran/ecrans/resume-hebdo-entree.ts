// La ligne « Weekly summary » parmi celles de tous les projets (#3263), dans le bandeau de santé de « parade » : sous
// « Cost » et « Closer », elle ouvre la page des résumés hebdomadaires.
import type { Ecran } from "./commun.ts";
import { donnees, OUVRIR, SUR_LA_BOX } from "./cuisine-demenagee.ts";
import { SETTINGS } from "./projet-sante.ts";

export const ecran: Ecran = {
  dit: "Les lignes de tous les projets dans le bandeau de santé de « parade » : Cost et Weekly summary (#3263 ; la ligne Closer retirée par #4224)",
  largeur: 1440,
  hauteur: 900,
  etapes: [OUVRIR, SETTINGS, { defiler: "#de-tous-les-projets" }],
  donnees: () => donnees(SUR_LA_BOX),
};
