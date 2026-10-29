// Les réglages des garde-fous : des valeurs par défaut fixées par le chef, que
// l'environnement du runtime (l'unité systemd) peut ajuster. Les mêmes pour
// tous les tickets d'un projet.
import type { Plafonds } from "./events/guardrails.ts";
import { ConfigInvalide } from "./runtime.ts";

export type Reglages = {
  plafonds: Plafonds;
  // Nombre d'échecs d'affilée qui ouvre le disjoncteur.
  seuilDisjoncteur: number;
  // Délai laissé à un cook entre SIGTERM et SIGKILL.
  graceMs: number;
};

const MINUTE = 60_000;
// Au-delà, une minuterie de Node se déclenche tout de suite au lieu d'attendre.
const MINUTES_MAX = Math.floor((2 ** 31 - 1) / MINUTE);

// Une valeur illisible est un refus de démarrer, jamais un repli silencieux
// sur le défaut : un garde-fou ne se désarme pas par une faute de frappe.
export function lire(env: NodeJS.ProcessEnv, variable: string, defaut: number, attendu: string, valide: (valeur: number) => boolean): number {
  const brut = env[variable];
  if (brut === undefined || brut === "") return defaut;
  const valeur = Number(brut);
  if (!valide(valeur)) throw new ConfigInvalide(`invalid ${variable}: “${brut}” — expected ${attendu}`);
  return valeur;
}

const entier = (env: NodeJS.ProcessEnv, variable: string, defaut: number) =>
  lire(env, variable, defaut, "an integer greater than zero", (valeur) => Number.isSafeInteger(valeur) && valeur > 0);

const minutes = (env: NodeJS.ProcessEnv, variable: string, defaut: number) =>
  Math.round(
    lire(env, variable, defaut, `a number of minutes greater than zero, ${MINUTES_MAX} at most`, (valeur) => valeur > 0 && valeur <= MINUTES_MAX) * MINUTE,
  );

export function lireReglages(env: NodeJS.ProcessEnv): Reglages {
  return {
    plafonds: {
      durationMs: minutes(env, "BRIGADE_MAX_MINUTES", 60),
      tokens: entier(env, "BRIGADE_MAX_TOKENS", 2_000_000),
      idleMs: minutes(env, "BRIGADE_IDLE_MINUTES", 10),
    },
    seuilDisjoncteur: entier(env, "BRIGADE_BREAKER_FAILURES", 3),
    graceMs: 10_000,
  };
}
