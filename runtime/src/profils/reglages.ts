// Les réglages de la mesure des profils, lus de l'environnement du runtime
// comme ceux du correctif (`correctif/reglages.ts`) : les seuils de départ
// décidés par le chef, que l'unité du projet ajuste et que la mesure
// corrigera. Ils ne se lisent qu'ici. Une valeur illisible refuse le
// démarrage, jamais un repli sur le défaut.
import { lire } from "../plafonds.ts";
import { ConfigInvalide } from "../runtime.ts";

// Les derniers tickets servis que la mesure regarde.
export const FENETRE_PAR_DEFAUT = 20;
// Le nombre de ces tickets qu'une zone doit porter pour être un domaine.
export const TICKETS_PAR_DEFAUT = 5;
// L'écart, en points, sous la part du projet livrée du premier coup.
export const ECART_PAR_DEFAUT = 20;

export type ReglagesDesProfils = { fenetre: number; tickets: number; ecart: number };

const ENTIER = "an integer greater than zero";
const entier = (valeur: number) => Number.isSafeInteger(valeur) && valeur > 0;

export function lireReglagesDesProfils(env: NodeJS.ProcessEnv): ReglagesDesProfils {
  const reglages = {
    fenetre: lire(env, "BRIGADE_PROFILE_WINDOW", FENETRE_PAR_DEFAUT, ENTIER, entier),
    tickets: lire(env, "BRIGADE_PROFILE_MIN_TICKETS", TICKETS_PAR_DEFAUT, ENTIER, entier),
    ecart: lire(env, "BRIGADE_PROFILE_GAP_POINTS", ECART_PAR_DEFAUT, "a number of points greater than zero, 100 at most", (valeur) => valeur > 0 && valeur <= 100),
  };
  // Plus de tickets que la fenêtre n'en montre : aucun domaine ne serait jamais relevé.
  if (reglages.tickets > reglages.fenetre) {
    throw new ConfigInvalide(`invalid BRIGADE_PROFILE_MIN_TICKETS: “${reglages.tickets}” — expected at most BRIGADE_PROFILE_WINDOW (${reglages.fenetre})`);
  }
  return reglages;
}
