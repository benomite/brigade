// La page de « parade », qui cuit sur ce Mac (#1095) : « Cooks on this Mac », sa cuisine qui s'arrête
// avec l'app, et « move the kitchen » ouvert — la box, recommandée, pour l'y ramener.
import type { Ecran } from "./commun.ts";
import { DEMENAGER, donnees, OUVRIR, SUR_CE_MAC } from "./cuisine-demenagee.ts";

export const ecran: Ecran = {
  dit: "L'espace de « parade », qui cuit sur ce Mac : « Cooks on this Mac », sa cuisine qui s'arrête avec l'app, la box recommandée pour l'y ramener (#1095)",
  largeur: 1440,
  hauteur: 900,
  etapes: [OUVRIR, DEMENAGER],
  donnees: () => donnees(SUR_CE_MAC),
};
