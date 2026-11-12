// La carte de #22 dans TODO (#3369) : la station l’a mis de côté sans PR — sa question, et les boutons « Back to the kitchen » et « Close it ».
import type { Ecran } from "./commun.ts";
import { donnees, OUVRIR_PARADE } from "./mise-de-cote-retenue-commun.ts";

export const ecran: Ecran = {
  dit: "« parade » sur GitHub seul (#3369) : #22 mis de côté par la station sans PR — sa carte dans TODO, sa question et les boutons « Back to the kitchen » et « Close it »",
  largeur: 1440,
  hauteur: 900,
  etapes: [OUVRIR_PARADE],
  donnees,
};
