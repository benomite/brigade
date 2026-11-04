// L'onglet Cooks de « parade » passé sur GitHub seul (#2220) : ses stations d'après les commentaires de prise de ses
// issues — box/claude, qui tient #30 (en pass, PR #41) et #14, et mac/claude, qui tient #16 —, chaque cook la carte de son
// ticket ; et non « aucune station » que le tableau figé de l'ancien chemin dit (github-seul-commun.ts).
import { configuration, cuisine, demarrage, type Ecran, MAINTENANT } from "./commun.ts";
import { PROJETS, RENDUS } from "./cuisine-figee.ts";
import { RENDU_GITHUB } from "./github-seul-commun.ts";

export const ecran: Ecran = {
  dit: "L'onglet Cooks de « parade » sur GitHub seul : ses stations et leurs cooks d'après les commentaires de prise et les PR de ses issues (#2220)",
  largeur: 1440,
  hauteur: 900,
  etapes: [{ cliquer: '#projets > button[title^="parade — "]' }, { cliquer: "#onglets-du-projet button:nth-child(2)" }],
  donnees: () => ({ maintenant: MAINTENANT, reponses: { demarrage: demarrage(configuration(PROJETS)), espace: [] }, envois: cuisine({ ...RENDUS, parade: RENDU_GITHUB }) }),
};
