// « Tous les projets » : l'écran sur lequel l'app s'ouvre — la barre, l'état du code et des
// stations, puis une carte par projet.
import { configuration, cuisine, demarrage, type Ecran, MAINTENANT } from "./commun.ts";
import { PROJETS, RENDUS } from "./cuisine-figee.ts";

export const ecran: Ecran = {
  dit: "« Tous les projets », à l'ouverture de l'app : deux projets sur une box, l'un au travail",
  largeur: 1440,
  hauteur: 900,
  etapes: [],
  donnees: () => ({ maintenant: MAINTENANT, reponses: { demarrage: demarrage(configuration(PROJETS)) }, envois: cuisine(RENDUS) }),
};
