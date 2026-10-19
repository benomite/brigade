// Les réglages du correctif, lus de l'environnement du runtime comme ceux des
// garde-fous (`plafonds.ts`) : un défaut prudent, que l'unité du projet ajuste.
// Une valeur illisible refuse le démarrage, jamais un repli sur le défaut.
import { lire } from "../plafonds.ts";
import { DERNIERS_PAR_DEFAUT } from "../renvois.ts";

// Le nombre de tickets récents qui, ratés pour la même cause, en font une
// candidate à une correction. Un seul ticket n'est pas une récurrence.
export const SEUIL_PAR_DEFAUT = 3;
// Les derniers tickets servis qu'on regarde : ceux du relevé des renvois.
export const FENETRE_PAR_DEFAUT = DERNIERS_PAR_DEFAUT;

export type ReglagesDuCorrectif = { seuil: number; fenetre: number };

export function lireReglagesDuCorrectif(env: NodeJS.ProcessEnv): ReglagesDuCorrectif {
  return {
    seuil: lire(env, "BRIGADE_CORRECTION_THRESHOLD", SEUIL_PAR_DEFAUT, "an integer of 2 or more", (valeur) => Number.isSafeInteger(valeur) && valeur >= 2),
    fenetre: lire(env, "BRIGADE_CORRECTION_WINDOW", FENETRE_PAR_DEFAUT, "an integer greater than zero", (valeur) => Number.isSafeInteger(valeur) && valeur > 0),
  };
}
