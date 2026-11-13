// Scène 6 de la démo (ticket 2875) : la carte de #21, rouge sur le rail de « parade » (#3458), à la largeur d'un téléphone
// (412 × 915), la rangée des colonnes amenée sur elle.
import type { Ecran } from "./commun.ts";
import { donneesDe, OUVRIR_PARADE, QUESTION } from "./demo-commun.ts";

export const CARTE = '.carte-todo[data-sorte="product"]';

export const ecran: Ecran = {
  dit: "La démo, scène 6 : la carte de #21 à la largeur d'un téléphone — sa question de produit, un bouton par choix, le champ du texte libre",
  largeur: 412,
  hauteur: 915,
  etapes: [OUVRIR_PARADE, { defiler: CARTE }],
  donnees: () => donneesDe(QUESTION),
};
