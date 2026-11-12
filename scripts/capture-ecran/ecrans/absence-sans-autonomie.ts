// L'écran « since you were away » (#3305) : le chef rouvre l'app sept jours après sa dernière ouverture ; `parade`, sa semaine
// du 5 octobre sans chiffres d'autonomie : le bloc est absent.
import { CLE_DE_LA_DERNIERE_OUVERTURE } from "../../../app/src/vue/absence/absence.js";
import type { Ecran } from "./commun.ts";
import { SANS_AUTONOMIE } from "./resume-hebdo-commun.ts";

export const ecran: Ecran = {
  dit: "L'écran « since you were away » : sept jours d'absence, la semaine de « parade » sans chiffres d'autonomie : le bloc est absent (#3305)",
  largeur: 1440,
  hauteur: 900,
  etapes: [],
  donnees: () => ({ ...SANS_AUTONOMIE(), stockage: { [CLE_DE_LA_DERNIERE_OUVERTURE]: "2026-10-06T08:00:00.000Z" } }),
};
