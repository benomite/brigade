// Les cartes qui attendent le chef, à la largeur du téléphone de la maquette (Phone.dc.html, 390 × 844) : l'app s'ouvre
// sur leur liste (ticket 2915). La question de produit de #21, dans « parade ».
import type { Ecran } from "./commun.ts";
import { donneesDe, QUESTION } from "./demo-commun.ts";

export const LARGEUR = 390;
export const HAUTEUR = 844;

export const ecran: Ecran = {
  dit: "Le téléphone, 390 × 844 : la liste des cartes qui attendent le chef — la question de #21, son âge, son genre",
  largeur: LARGEUR,
  hauteur: HAUTEUR,
  etapes: [],
  donnees: () => donneesDe(QUESTION),
};
