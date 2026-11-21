// Le rail de « parade » quand son disjoncteur est ouvert (#3602) : la ligne d'état dit la cuisine retenue par le disjoncteur.
import { configuration, cuisine, demarrage, type Ecran, MAINTENANT } from "./commun.ts";
import { PROJETS, RENDUS } from "./cuisine-figee.ts";
import { RENDU_DISJONCTEUR } from "./rail-disjoncteur-commun.ts";

export const ecran: Ecran = {
  dit: "Le rail de « parade » dont le disjoncteur est ouvert : la ligne d'état dit « held: breaker open » et n'a aucun bouton (#3602, #3911)",
  largeur: 1440,
  hauteur: 640,
  etapes: [{ cliquer: '#projets > button[title^="parade — "]' }],
  donnees: () => ({ maintenant: MAINTENANT, reponses: { demarrage: demarrage(configuration(PROJETS)), espace: [] }, envois: cuisine({ ...RENDUS, parade: RENDU_DISJONCTEUR }) }),
};
