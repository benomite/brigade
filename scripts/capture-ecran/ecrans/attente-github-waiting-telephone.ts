// Le même rail (#3075), à la largeur d'un téléphone, amené sur la carte de WAITING de #40 : quoi, de qui, et « resume »,
// « it arrived, back to the kitchen ».
import type { Ecran } from "./commun.ts";
import { donnees, OUVRIR_PARADE } from "./attente-github-commun.ts";

export const ecran: Ecran = {
  dit: "« parade » sur GitHub seul (#3075) à la largeur d'un téléphone : la carte de WAITING de #40, ce qu'elle attend, « resume » et « it arrived »",
  largeur: 412,
  hauteur: 915,
  etapes: [OUVRIR_PARADE, { defiler: '#rail li.bon:has(button[data-attente="attente-reprendre"])' }],
  donnees,
};
