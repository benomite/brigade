// L'espace de « parade », son projet allumé (#3454) : ni ligne « project off » en tête du rail, ni bouton qui l'allume.
import { configuration, cuisine, demarrage, type Ecran, MAINTENANT } from "./commun.ts";
import { PROJETS } from "./cuisine-figee.ts";
import { rendus } from "./manager-eteint-commun.ts";

export const ecran: Ecran = {
  dit: "L'espace de « parade », son projet allumé : aucune ligne « project off » en tête du rail (#3454)",
  largeur: 1440,
  hauteur: 900,
  etapes: [{ cliquer: '#projets > button[title^="parade — "]' }],
  donnees: () => ({ maintenant: MAINTENANT, reponses: { demarrage: demarrage(configuration(PROJETS)), espace: [] }, envois: cuisine(rendus(true)) }),
};
