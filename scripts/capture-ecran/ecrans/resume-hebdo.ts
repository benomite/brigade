// La page des résumés hebdomadaires (#3263) : « parade », sa semaine du 5 octobre avec ses chiffres d'autonomie — ses
// thèmes, chaque ligne le numéro de son ticket, l'autonomie, puis ce qui attend le chef, et « Publish as release notes ».
import type { Ecran } from "./commun.ts";
import { AVEC_AUTONOMIE, ETAPES } from "./resume-hebdo-commun.ts";

export const ecran: Ecran = {
  dit: "La page des résumés hebdomadaires : la semaine de « parade » avec ses chiffres d'autonomie (#3263)",
  largeur: 1440,
  hauteur: 900,
  etapes: ETAPES,
  donnees: AVEC_AUTONOMIE,
};
