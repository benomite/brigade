// Le premier écran de l'app Android, sur une installation neuve (#2500) : le téléphone n'est connecté à
// GitHub sous aucun compte — ce qu'on attend du chef, et « sign in with GitHub ». Ni code d'appairage, ni QR,
// ni adresse de station.
import { type Ecran, MAINTENANT } from "./commun.ts";
import { demarrageDuTelephone, HAUTEUR, LARGEUR } from "./telephone-commun.ts";

export const ecran: Ecran = {
  dit: "Le premier écran de l'app Android, installée neuve : se connecter à GitHub, d'un bouton",
  largeur: LARGEUR,
  hauteur: HAUTEUR,
  etapes: [],
  donnees: () => ({ maintenant: MAINTENANT, reponses: { demarrage: demarrageDuTelephone() }, envois: {} }),
};
