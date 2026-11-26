// L'onglet Know-how de « parade » (#4241) : chaque entrée, le ticket d'où elle vient, « edit » et « remove ».
import type { Ecran } from "./commun.ts";
import { ENTREES, OUVRIR_LE_SAVOIR_FAIRE, savoirFaire } from "./savoir-faire-commun.ts";

export const ecran: Ecran = {
  dit: "L'onglet Know-how de « parade » : ses entrées, chacune avec son ticket, « edit » et « remove »",
  largeur: 1440,
  hauteur: 900,
  etapes: OUVRIR_LE_SAVOIR_FAIRE,
  donnees: savoirFaire(ENTREES),
};
