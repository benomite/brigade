// La page des résumés hebdomadaires (#3263) : « Publish as release notes » cliqué — le tag de version demandé, « Publish »
// recommandé et « Cancel ».
import type { Ecran } from "./commun.ts";
import { AVEC_AUTONOMIE, ETAPES } from "./resume-hebdo-commun.ts";

export const ecran: Ecran = {
  dit: "La page des résumés hebdomadaires : « Publish as release notes » cliqué, le tag de version demandé (#3263)",
  largeur: 1440,
  hauteur: 900,
  etapes: [...ETAPES, { cliquer: "#resumes button.publier" }],
  donnees: AVEC_AUTONOMIE,
};
