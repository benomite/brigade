// « Tous les projets » sur le téléphone appairé (#1414) : chaque projet de la station, lu à son guichet, avec sa ligne —
// `parade` au travail, une décision qui attend le chef ; `cantine` calme.
import { type Ecran } from "./commun.ts";
import { guichet, HAUTEUR, LARGEUR, lireLaStation, PROJETS } from "./telephone-projets-commun.ts";

const donnees = await lireLaStation({ repondre: guichet(), connus: PROJETS });
export const ecran: Ecran = {
  dit: "« Tous les projets » sur le téléphone appairé : chaque projet de la station, lu à son guichet, avec sa ligne, en 412 × 915",
  largeur: LARGEUR,
  hauteur: HAUTEUR,
  etapes: [],
  donnees: () => donnees,
};
