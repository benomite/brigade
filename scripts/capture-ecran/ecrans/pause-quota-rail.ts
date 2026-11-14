// Le rail de « parade » pendant une pause de quota GitHub du compte (#3482, pause-quota-commun.ts) : la pause dite une
// fois en tête de l'app, et le rail du projet qui dit seulement qu'il est en pause pour la même raison.
import { configuration, cuisine, demarrage, type Ecran, MAINTENANT } from "./commun.ts";
import { PROJETS, RENDUS } from "./cuisine-figee.ts";
import { RENDU_EN_PAUSE } from "./pause-quota-commun.ts";

export const ecran: Ecran = {
  dit: "Le rail de « parade » pendant une pause de quota GitHub du compte : sa station tourne mais ne peut plus écrire son signe de vie (#3482)",
  largeur: 1440,
  hauteur: 640,
  etapes: [{ cliquer: '#projets > button[title^="parade — "]' }],
  donnees: () => ({ maintenant: MAINTENANT, reponses: { demarrage: demarrage(configuration(PROJETS)), espace: [] }, envois: cuisine({ ...RENDUS, parade: RENDU_EN_PAUSE }) }),
};
