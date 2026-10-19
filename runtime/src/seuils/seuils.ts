// Les seuils des leçons d'un projet : quand une leçon provisoire est promue,
// quand une leçon promue ou provisoire expire. Lus de l'environnement du
// runtime comme les réglages des garde-fous (`plafonds.ts`) : un défaut fixé par
// le chef, que l'unité du projet ajuste — chaque projet a donc les siens. Une
// valeur illisible refuse le démarrage, jamais un repli sur le défaut ; l'erreur
// nomme la variable. Les mesures les corrigeront plus tard.
import { lire } from "../plafonds.ts";

// Promotion : des rétros indépendantes, de tickets différents.
export const PROMOTION_PAR_DEFAUT = 3;
// Tickets servis sans reconfirmation : une leçon promue redevient provisoire…
export const EXPIRATION_PROMUE_PAR_DEFAUT = 20;
// … puis, vingt tickets de plus, une leçon provisoire disparaît.
export const EXPIRATION_PROVISOIRE_PAR_DEFAUT = 20;

export type Seuils = { promotion: number; expirationPromue: number; expirationProvisoire: number };

export const VARIABLES = {
  promotion: "BRIGADE_PROMOTION_RETROS",
  expirationPromue: "BRIGADE_PROMOTED_EXPIRY_TICKETS",
  expirationProvisoire: "BRIGADE_PROVISIONAL_EXPIRY_TICKETS",
} as const;

const entier = (env: NodeJS.ProcessEnv, variable: string, defaut: number) =>
  lire(env, variable, defaut, "an integer greater than zero", (valeur) => Number.isSafeInteger(valeur) && valeur > 0);

export function lireSeuils(env: NodeJS.ProcessEnv): Seuils {
  return {
    promotion: entier(env, VARIABLES.promotion, PROMOTION_PAR_DEFAUT),
    expirationPromue: entier(env, VARIABLES.expirationPromue, EXPIRATION_PROMUE_PAR_DEFAUT),
    expirationProvisoire: entier(env, VARIABLES.expirationProvisoire, EXPIRATION_PROVISOIRE_PAR_DEFAUT),
  };
}
