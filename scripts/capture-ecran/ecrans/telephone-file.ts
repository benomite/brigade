// La file de `parade` sur le téléphone appairé (#1163), onglet Rail : ce qui attend le chef, puis le rail.
import { type Ecran } from "./commun.ts";
import { HAUTEUR, LARGEUR } from "./telephone-commun.ts";
import { donneesDeLaFile, OUVRIR_PARADE } from "./telephone-file-commun.ts";

export const ecran: Ecran = {
  dit: "La file de « parade » sur le téléphone, onglet Rail : #12 attend ta décision, puis le rail, en 412 × 915",
  largeur: LARGEUR,
  hauteur: HAUTEUR,
  etapes: [OUVRIR_PARADE],
  donnees: donneesDeLaFile,
};
