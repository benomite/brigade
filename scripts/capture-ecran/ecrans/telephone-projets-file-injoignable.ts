// La file de `parade` sur le téléphone appairé, la station injoignable (#1414) : une ligne le dit sous le rail qui n'est
// pas dessiné, son détail au survol — ni GitHub, que le téléphone ne lit pas, ni panneau à droite.
import { type Ecran } from "./commun.ts";
import { HAUTEUR, INJOIGNABLE, LARGEUR, lireLaStation, OUVRIR_PARADE, PROJETS } from "./telephone-projets-commun.ts";

const donnees = await lireLaStation({ repondre: () => INJOIGNABLE, connus: PROJETS });
export const ecran: Ecran = {
  dit: "La file de « parade » sur le téléphone appairé, la station injoignable : « the station did not answer » en une ligne, en 412 × 915",
  largeur: LARGEUR,
  hauteur: HAUTEUR,
  etapes: [OUVRIR_PARADE],
  donnees: () => donnees,
};
