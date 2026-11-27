// L'onglet Know-how de « parade » (#4570) : chaque entrée par section, le ticket d'où elle vient, « Edit » et « Remove ».
import type { Ecran } from "./commun.ts";
import { ENTREES, OUVRIR_LE_SAVOIR_FAIRE, savoirFaire } from "./savoir-faire-commun.ts";

export const ecran: Ecran = {
  dit: "L'onglet Know-how de « parade » : ses entrées par section, chacune avec son ticket, « Edit » et « Remove »",
  largeur: 1440,
  hauteur: 900,
  etapes: OUVRIR_LE_SAVOIR_FAIRE,
  donnees: savoirFaire(ENTREES),
};
