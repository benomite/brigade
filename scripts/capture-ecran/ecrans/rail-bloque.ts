// Le rail de « parade » bloqué (#3358) : huit tickets `fire` qu'aucun manager n'a pris depuis 14 h, sa station box/claude
// arrêtée (rail-bloque-commun.ts). En tête du rail, la ligne qui le dit, sa cause et son geste.
import { configuration, cuisine, demarrage, type Ecran, MAINTENANT } from "./commun.ts";
import { PROJETS, RENDUS } from "./cuisine-figee.ts";
import { RENDU_BLOQUE } from "./rail-bloque-commun.ts";

export const ecran: Ecran = {
  dit: "Le rail de « parade » bloqué : huit tickets `fire` qu'aucun manager n'a pris depuis 14 h, sa station box/claude arrêtée — la ligne en tête du rail, sa cause et « Start the station » (#3358)",
  largeur: 1440,
  hauteur: 640,
  etapes: [{ cliquer: '#projets > button[title^="parade — "]' }],
  donnees: () => ({ maintenant: MAINTENANT, reponses: { demarrage: demarrage(configuration(PROJETS)), espace: [] }, envois: cuisine({ ...RENDUS, parade: RENDU_BLOQUE }) }),
};
