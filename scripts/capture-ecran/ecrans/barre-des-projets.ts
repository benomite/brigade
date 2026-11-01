// La barre et les cinq projets du chef (ticket 1983) : brigade, mirrorscreen, mirrorlab, escale et
// calculus-workspace, chacun sa couleur d'onglet, sur « Tous les projets ». Chaque case écrit le sigle de
// son projet, en grand, sur une ligne — `MS` et `ML` pour les deux qui commencent pareil — ; le nom entier
// est au survol, et sur la carte de chaque projet.
import type { Projet } from "../../../app/src/config.ts";
import { configuration, cuisine, demarrage, type Ecran, MAINTENANT } from "./commun.ts";
import { RENDUS } from "./cuisine-figee.ts";

// Leurs couleurs sont celles de la palette ; les deux premiers cuisent comme « parade », les autres comme « cantine ».
export const PROJETS_DU_CHEF: Projet[] = [
  { nom: "brigade", dossier: "/Users/chef/code/brigade", couleurs: { onglet: "#f2994a", accent: "#f2994a" } },
  { nom: "mirrorscreen", dossier: "/Users/chef/code/mirrorscreen", couleurs: { onglet: "#25c0c5", accent: "#25c0c5" } },
  { nom: "mirrorlab", dossier: "/Users/chef/code/mirrorlab", couleurs: { onglet: "#a98cf2", accent: "#a98cf2" } },
  { nom: "escale", dossier: "/Users/chef/code/escale", couleurs: { onglet: "#f28cbf", accent: "#f28cbf" } },
  { nom: "calculus-workspace", dossier: "/Users/chef/code/calculus-workspace", couleurs: { onglet: "#4579eb", accent: "#4579eb" } },
];

export const RENDUS_DU_CHEF = Object.fromEntries(PROJETS_DU_CHEF.map(({ nom }, rang) => [nom, rang < 2 ? RENDUS.parade! : RENDUS.cantine!]));

export const ecran: Ecran = {
  dit: "La barre et les cinq projets du chef (#1983) sur « Tous les projets » : un sigle par case, en grand, sur une ligne — MS et ML pour mirrorscreen et mirrorlab",
  largeur: 1440,
  hauteur: 900,
  etapes: [],
  donnees: () => ({ maintenant: MAINTENANT, reponses: { demarrage: demarrage(configuration(PROJETS_DU_CHEF)) }, envois: cuisine(RENDUS_DU_CHEF) }),
};
