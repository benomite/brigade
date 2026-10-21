// La file de `parade` sur le téléphone appairé (#1163), onglet Cooks : les cooks en cours, #14 sur la box et #15 sur
// le Mac, et les stations du projet.
import { type Ecran } from "./commun.ts";
import { HAUTEUR, LARGEUR } from "./telephone-commun.ts";
import { donneesDeLaFile, OUVRIR_COOKS, OUVRIR_PARADE } from "./telephone-file-commun.ts";

export const ecran: Ecran = {
  dit: "La file de « parade » sur le téléphone, onglet Cooks : #14 cuit sur la box, #15 sur le Mac, en 412 × 915",
  largeur: LARGEUR,
  hauteur: HAUTEUR,
  etapes: [OUVRIR_PARADE, OUVRIR_COOKS],
  donnees: donneesDeLaFile,
};
