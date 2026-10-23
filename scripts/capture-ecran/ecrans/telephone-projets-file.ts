// La file de `parade` sur le téléphone appairé (#1414), lue au guichet de la station : les cartes que le desktop montre
// de la même file.
import { type Ecran } from "./commun.ts";
import { guichet, HAUTEUR, LARGEUR, lireLaStation, OUVRIR_PARADE, PROJETS } from "./telephone-projets-commun.ts";

const donnees = await lireLaStation({ repondre: guichet(), connus: PROJETS });
export const ecran: Ecran = {
  dit: "La file de « parade » sur le téléphone appairé, lue au guichet de la station : les cartes du desktop, en 412 × 915",
  largeur: LARGEUR,
  hauteur: HAUTEUR,
  etapes: [OUVRIR_PARADE],
  donnees: () => donnees,
};
