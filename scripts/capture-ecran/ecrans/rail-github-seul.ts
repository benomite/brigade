// Le rail de « parade » passé sur GitHub seul (#2220) : ses issues `fire` rangées par état d'après leurs labels, leurs
// commentaires de prise et leurs PR — #21 et #22 sur le rail, #14 et #16 pris, #30 en pass (PR #41), #40 en WAITING —, et
// non le rail figé que le tableau de la cuisine garde de l'ancien chemin (github-seul-commun.ts).
import { configuration, cuisine, demarrage, type Ecran, MAINTENANT } from "./commun.ts";
import { PROJETS, RENDUS } from "./cuisine-figee.ts";
import { RENDU_GITHUB } from "./github-seul-commun.ts";

export const ecran: Ecran = {
  dit: "Le rail de « parade » sur GitHub seul : ses issues `fire` par état — en attente, prises, en pass, en WAITING — d'après leurs labels, leurs prises et leurs PR (#2220)",
  largeur: 2200,
  hauteur: 560,
  etapes: [{ cliquer: '#projets > button[title^="parade — "]' }],
  donnees: () => ({ maintenant: MAINTENANT, reponses: { demarrage: demarrage(configuration(PROJETS)), espace: [] }, envois: cuisine({ ...RENDUS, parade: RENDU_GITHUB }) }),
};
