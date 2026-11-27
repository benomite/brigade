// L'écran « since you were away » (#3305) : le chef rouvre l'app sept jours après sa dernière ouverture ; `parade`, sa semaine
// du 5 octobre avec ses chiffres d'autonomie.
import { CLE_DE_LA_DERNIERE_OUVERTURE } from "../../../app/src/vue/absence/absence.js";
import type { Ecran } from "./commun.ts";
import { AVEC_AUTONOMIE } from "./resume-hebdo-commun.ts";

export const ecran: Ecran = {
  dit: "L'écran « since you were away » : sept jours d'absence, la semaine de « parade » avec ses chiffres d'autonomie (#3305)",
  largeur: 1440,
  hauteur: 900,
  etapes: [],
  donnees: () => ({ ...AVEC_AUTONOMIE(), stockage: { [CLE_DE_LA_DERNIERE_OUVERTURE]: "2026-10-06T08:00:00.000Z" } }),
};
