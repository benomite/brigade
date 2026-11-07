// L'app Android relancée, le téléphone déjà connecté à GitHub (#2500) : plus d'écran de connexion — elle s'ouvre
// sur « Tous les projets ».
import { type Ecran, MAINTENANT } from "./commun.ts";
import { demarrageDuTelephone, HAUTEUR, LARGEUR } from "./telephone-commun.ts";

export const ecran: Ecran = {
  dit: "L'app Android relancée, le téléphone connecté à GitHub : elle s'ouvre sur « Tous les projets »",
  largeur: LARGEUR,
  hauteur: HAUTEUR,
  etapes: [],
  donnees: () => ({ maintenant: MAINTENANT, reponses: { demarrage: demarrageDuTelephone({ github: { compte: "benomite" } }) }, envois: {} }),
};
