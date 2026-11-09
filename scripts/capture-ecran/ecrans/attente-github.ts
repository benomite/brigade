// « parade » sur GitHub seul (#3075) : chaque carte de TODO porte « waiting for… », et la carte de WAITING de #40 dit ce
// qu'elle attend, de qui, sa relance, avec « resume » et « it arrived, back to the kitchen ».
import type { Ecran } from "./commun.ts";
import { donnees, OUVRIR_PARADE } from "./attente-github-commun.ts";

export const ecran: Ecran = {
  dit: "« parade » sur GitHub seul (#3075) : « waiting for… » sur chaque carte de TODO ; #40 dans WAITING — quoi, de qui, sa relance — avec « resume » et « it arrived, back to the kitchen »",
  largeur: 2200,
  hauteur: 760,
  etapes: [OUVRIR_PARADE],
  donnees,
};
