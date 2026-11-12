// La même carte (#3370), à la largeur du téléphone de la maquette (390 × 844) : la liste des cartes qui attendent le chef,
// où #50 est.
import type { Ecran } from "./commun.ts";
import { donnees } from "./ecart-du-manager-commun.ts";

export const ecran: Ecran = {
  dit: "Le téléphone, 390 × 844 (#3370) : la liste des cartes qui attendent le chef — #50, écarté par le manager avec `question`",
  largeur: 390,
  hauteur: 844,
  etapes: [],
  donnees,
};
