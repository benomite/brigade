// L'espace de « parade », son projet éteint (#3454) : la tête du rail le dit en une ligne, à côté du bouton qui l'allume.
import { configuration, cuisine, demarrage, type Ecran, MAINTENANT } from "./commun.ts";
import { PROJETS } from "./cuisine-figee.ts";
import { rendus } from "./manager-eteint-commun.ts";

export const ecran: Ecran = {
  dit: "L'espace de « parade », son projet éteint : « project off — nothing new is taken, split or merged » en tête du rail, et « switch the project on… » à côté (#3454)",
  largeur: 1440,
  hauteur: 900,
  etapes: [{ cliquer: '#projets > button[title^="parade — "]' }],
  donnees: () => ({ maintenant: MAINTENANT, reponses: { demarrage: demarrage(configuration(PROJETS)), espace: [] }, envois: cuisine(rendus(false)) }),
};
