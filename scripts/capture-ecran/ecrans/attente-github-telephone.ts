// Le même rail (#3075), à la largeur d'un téléphone (412 × 915), amené sur TODO : la carte de #41 et son
// « waiting for… ».
import type { Ecran } from "./commun.ts";
import { donnees, OUVRIR_PARADE, TODO } from "./attente-github-commun.ts";

export const ecran: Ecran = {
  dit: "« parade » sur GitHub seul (#3075) à la largeur d'un téléphone : la carte de #41 dans TODO et son « waiting for… »",
  largeur: 412,
  hauteur: 915,
  etapes: [OUVRIR_PARADE, { defiler: `${TODO} li.bon:first-of-type` }],
  donnees,
};
