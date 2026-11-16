// La carte de #22 dans TODO (#3368) : la station l'a mis de côté, sa PR #45 touche à ce qui la juge — sa question, et le
// bouton « Merge the PR of #22 » (#3716).
import type { Ecran } from "./commun.ts";
import { donnees, OUVRIR_PARADE } from "./mise-de-cote-merge-commun.ts";

export const ecran: Ecran = {
  dit: "« parade » sur GitHub seul (#3368) : #22 mis de côté par la station, sa PR #45 touche à ce qui la juge — sa carte dans TODO, sa question et le bouton « Merge the PR of #22 » (#3716)",
  largeur: 1440,
  hauteur: 900,
  etapes: [OUVRIR_PARADE],
  donnees,
};
