// « Tous les projets » sur le téléphone appairé, la station injoignable (#1414) : une phrase le dit, ce que le réseau en
// a dit au survol ; les projets de la dernière liste lue restent dessous, chacun `station unreachable`.
import { type Ecran } from "./commun.ts";
import { HAUTEUR, INJOIGNABLE, LARGEUR, lireLaStation, PROJETS } from "./telephone-projets-commun.ts";

const donnees = await lireLaStation({ repondre: () => INJOIGNABLE, connus: PROJETS });
export const ecran: Ecran = {
  dit: "« Tous les projets » sur le téléphone appairé, la station injoignable : une phrase, et les projets connus dessous, en 412 × 915",
  largeur: LARGEUR,
  hauteur: HAUTEUR,
  etapes: [],
  donnees: () => donnees,
};
