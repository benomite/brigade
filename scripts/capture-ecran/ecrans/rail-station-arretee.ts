// Le rail de « parade » : huit tickets `fire` en file depuis 14 h, sa station box/claude arrêtée
// (rail-station-arretee-commun.ts). En tête du rail, l'attente de la file (#3433) : sa cause et son geste.
import { configuration, cuisine, demarrage, type Ecran, MAINTENANT } from "./commun.ts";
import { PROJETS, RENDUS } from "./cuisine-figee.ts";
import { RENDU_STATION_ARRETEE } from "./rail-station-arretee-commun.ts";

export const ecran: Ecran = {
  dit: "Le rail de « parade » : huit tickets `fire` en file depuis 14 h, sa station box/claude arrêtée — l'attente de la file en tête du rail, sa cause et, la station étant sur un autre ordinateur, la phrase « Start it on its computer » sans bouton (#3433, #3637)",
  largeur: 1440,
  hauteur: 640,
  etapes: [{ cliquer: '#projets > button[title^="parade — "]' }],
  donnees: () => ({ maintenant: MAINTENANT, reponses: { demarrage: demarrage(configuration(PROJETS)), espace: [] }, envois: cuisine({ ...RENDUS, parade: RENDU_STATION_ARRETEE }) }),
};
