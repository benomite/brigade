// La page des résumés hebdomadaires (#3263) : la même semaine sans chiffres d'autonomie — pas de section Autonomy, et
// « Waiting for the chef » en dernier.
import type { Ecran } from "./commun.ts";
import { ETAPES, SANS_AUTONOMIE } from "./resume-hebdo-commun.ts";

export const ecran: Ecran = {
  dit: "La page des résumés hebdomadaires : la semaine de « parade » sans chiffres d'autonomie (#3263)",
  largeur: 1440,
  hauteur: 900,
  etapes: ETAPES,
  donnees: SANS_AUTONOMIE,
};
