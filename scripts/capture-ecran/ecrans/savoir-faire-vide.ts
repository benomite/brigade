// L'onglet Know-how de « parade » (#4241) sans entrée : une phrase le dit, aucun geste.
import type { Ecran } from "./commun.ts";
import { OUVRIR_LE_SAVOIR_FAIRE, savoirFaire } from "./savoir-faire-commun.ts";

export const ecran: Ecran = {
  dit: "L'onglet Know-how de « parade » sans entrée : « No know-how yet. »",
  largeur: 1440,
  hauteur: 900,
  etapes: OUVRIR_LE_SAVOIR_FAIRE,
  donnees: savoirFaire([]),
};
