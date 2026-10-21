// Les seuils des leçons d'un projet : quand une leçon provisoire est promue,
// quand une leçon promue ou provisoire expire. Lus de l'environnement du
// runtime comme les réglages des garde-fous (`plafonds.ts`) : un défaut fixé par
// le chef, que l'unité du projet ajuste — chaque projet a donc les siens. Une
// valeur illisible refuse le démarrage, jamais un repli sur le défaut ; l'erreur
// nomme la variable. Les mesures les corrigeront plus tard.
import { lire } from "../plafonds.ts";

// Promotion : des rétros indépendantes, de tickets différents.
export const PROMOTION_PAR_DEFAUT = 3;
// Écart de promotion d'une leçon née d'un renvoi de la passe ou d'une correction
// du chef : elle est promue à `promotion` moins cet écart rétros, jamais moins
// d'une. À 0, elle suit la règle des rétros.
export const ECART_RENVOI_PAR_DEFAUT = 1;
// Tickets servis sans reconfirmation : une leçon promue redevient provisoire…
export const EXPIRATION_PROMUE_PAR_DEFAUT = 20;
// … puis, vingt tickets de plus, une leçon provisoire disparaît.
export const EXPIRATION_PROVISOIRE_PAR_DEFAUT = 20;

export type Seuils = { promotion: number; expirationPromue: number; expirationProvisoire: number; ecartRenvoi: number };

export const VARIABLES = {
  promotion: "BRIGADE_PROMOTION_RETROS",
  expirationPromue: "BRIGADE_PROMOTED_EXPIRY_TICKETS",
  expirationProvisoire: "BRIGADE_PROVISIONAL_EXPIRY_TICKETS",
  ecartRenvoi: "BRIGADE_SENDBACK_PROMOTION_GAP",
} as const;

const entier = (env: NodeJS.ProcessEnv, variable: string, defaut: number) =>
  lire(env, variable, defaut, "an integer greater than zero", (valeur) => Number.isSafeInteger(valeur) && valeur > 0);

// Comme `entier`, mais zéro est permis : c'est l'écart nul.
const entierOuZero = (env: NodeJS.ProcessEnv, variable: string, defaut: number) =>
  lire(env, variable, defaut, "an integer, zero or more", (valeur) => Number.isSafeInteger(valeur) && valeur >= 0);

export function lireSeuils(env: NodeJS.ProcessEnv): Seuils {
  return {
    promotion: entier(env, VARIABLES.promotion, PROMOTION_PAR_DEFAUT),
    expirationPromue: entier(env, VARIABLES.expirationPromue, EXPIRATION_PROMUE_PAR_DEFAUT),
    expirationProvisoire: entier(env, VARIABLES.expirationProvisoire, EXPIRATION_PROVISOIRE_PAR_DEFAUT),
    ecartRenvoi: entierOuZero(env, VARIABLES.ecartRenvoi, ECART_RENVOI_PAR_DEFAUT),
  };
}
