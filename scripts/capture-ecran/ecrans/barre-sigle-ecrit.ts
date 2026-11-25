// Un sigle écrit par le chef (ticket 1983) : « mirrorlab » porte `LAB` dans le fichier des projets — sa case
// l'écrit, et ses réglages, ouverts, le disent « yours », avec « back to its name ».
import { configuration, cuisine, demarrage, type Ecran, MAINTENANT } from "./commun.ts";
import { PROJETS_DU_CHEF, RENDUS_DU_CHEF } from "./barre-des-projets.ts";

const AVEC_LAB = PROJETS_DU_CHEF.map((projet) => (projet.nom === "mirrorlab" ? { ...projet, sigle: "LAB" } : projet));

export const ecran: Ecran = {
  dit: "Les réglages de « mirrorlab », son sigle écrit par le chef (#1983) : sa case écrit LAB, et sa ligne le dit « yours », avec « back to its name »",
  largeur: 1440,
  hauteur: 1040,
  etapes: [{ cliquer: '#projets > button[title^="mirrorlab — "]' }, { cliquer: "#onglets-du-projet button:nth-child(4)" }],
  donnees: () => ({ maintenant: MAINTENANT, reponses: { demarrage: demarrage(configuration(AVEC_LAB)), espace: [] }, envois: cuisine(RENDUS_DU_CHEF) }),
};
