// Le sigle d'un projet sous Settings (ticket 1983) : les réglages de « mirrorlab », ouverts par sa case de la
// barre — dans le groupe de toi, à côté de ses couleurs, la ligne de son sigle : celui que l'app tire de son
// nom, et le champ où le chef écrit le sien.
import { configuration, cuisine, demarrage, type Ecran, MAINTENANT } from "./commun.ts";
import { PROJETS_DU_CHEF, RENDUS_DU_CHEF } from "./barre-des-projets.ts";

export const ecran: Ecran = {
  dit: "Les réglages de « mirrorlab », parmi les cinq projets du chef (#1983) : sous toi, la ligne de son sigle dans la barre — tiré de son nom, et le champ pour écrire le sien",
  largeur: 1440,
  hauteur: 1040,
  etapes: [{ cliquer: '#projets > button[title^="mirrorlab — "]' }, { cliquer: "#onglets > button:first-child" }],
  donnees: () => ({ maintenant: MAINTENANT, reponses: { demarrage: demarrage(configuration(PROJETS_DU_CHEF)), espace: [] }, envois: cuisine(RENDUS_DU_CHEF) }),
};
