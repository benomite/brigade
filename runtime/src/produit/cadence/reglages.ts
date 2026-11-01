// The settings of the product role's cadence, read from the environment of the
// project's runtime: each project has its own unit, so its own cap.
//
//   BRIGADE_PRODUCT_DAILY_CAP        the issues the role may file in a UTC day (3)
//   BRIGADE_PRODUCT_INTERVAL_HOURS   the least time between two runs (4)
//
// The cap bounds what is filed; the interval bounds what is spent: a run that
// files nothing still costs a judgement of the quota, and the rail stays empty
// until the manager has fired what the role filed.
import { lire } from "../../plafonds.ts";

export const PLAFOND_PAR_DEFAUT = 3;
export const INTERVALLE_PAR_DEFAUT_H = 4;

export type ReglagesCadence = { plafond: number; intervalleMs: number };

export function configCadence(env: NodeJS.ProcessEnv): ReglagesCadence {
  const plafond = lire(env, "BRIGADE_PRODUCT_DAILY_CAP", PLAFOND_PAR_DEFAUT, "an integer, 0 or more", (valeur) => Number.isSafeInteger(valeur) && valeur >= 0);
  const heures = lire(env, "BRIGADE_PRODUCT_INTERVAL_HOURS", INTERVALLE_PAR_DEFAUT_H, "a number of hours greater than zero, 24 at most", (valeur) => valeur > 0 && valeur <= 24);
  return { plafond, intervalleMs: Math.round(heures * 3_600_000) };
}
