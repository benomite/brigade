// L'app Android relancée, le téléphone déjà appairé (#1161) : plus d'écran d'appairage — elle s'ouvre sur
// « Tous les projets ».
import { type Ecran, MAINTENANT } from "./commun.ts";
import { ADRESSE, demarrageDuTelephone, HAUTEUR, LARGEUR } from "./telephone-commun.ts";

export const ecran: Ecran = {
  dit: "L'app Android relancée, le téléphone déjà appairé : elle s'ouvre sur « Tous les projets »",
  largeur: LARGEUR,
  hauteur: HAUTEUR,
  etapes: [],
  donnees: () => ({ maintenant: MAINTENANT, reponses: { demarrage: demarrageDuTelephone({ appaire: true, station: "atelier", adresse: ADRESSE }) }, envois: {} }),
};
