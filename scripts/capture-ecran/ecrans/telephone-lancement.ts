// Le premier écran de l'app Android, sur une installation neuve (#1161) : le téléphone n'est appairé
// à aucune station — ce qu'on attend du chef, le code à taper ou le QR à scanner.
import { type Ecran, MAINTENANT } from "./commun.ts";
import { demarrageDuTelephone, HAUTEUR, LARGEUR } from "./telephone-commun.ts";

export const ecran: Ecran = {
  dit: "Le premier écran de l'app Android, installée neuve : relier le téléphone aux projets, par le code ou le QR",
  largeur: LARGEUR,
  hauteur: HAUTEUR,
  etapes: [],
  donnees: () => ({ maintenant: MAINTENANT, reponses: { demarrage: demarrageDuTelephone() }, envois: {} }),
};
