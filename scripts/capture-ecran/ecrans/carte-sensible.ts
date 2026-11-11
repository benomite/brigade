// La carte « review before merge » de #62 dans TODO (ticket 3224) : la question, le lien de la PR #41, « Merge », puis le
// champ de la note vide et « Send back » éteint ; et dans Pass, #30 marqué « sensitive », les autres cartes sans marque.
import type { Ecran } from "./commun.ts";
import { donnees, OUVRIR_PARADE } from "./carte-sensible-commun.ts";

export const ecran: Ecran = {
  dit: "« parade » sur GitHub seul (ticket 3224) : la carte « review before merge » de #62 dans TODO — question, lien de la PR, « Merge », note vide et « Send back » éteint — et #30 marqué « sensitive » dans Pass",
  largeur: 1440,
  hauteur: 900,
  etapes: [OUVRIR_PARADE],
  donnees,
};
