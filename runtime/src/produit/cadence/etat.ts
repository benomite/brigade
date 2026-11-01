// The cadence's state, read from the log at every read (`evenements.ts`):
// whether the role is on, the cap, when it last ran and how many issues it
// filed today. Nothing is kept in memory; `status` reads the same thing
// through a read-only log, without the runtime's environment.
import type { Base } from "../../base.ts";
import { INTERVALLE_PAR_DEFAUT_H, PLAFOND_PAR_DEFAUT } from "./reglages.ts";

// The day a count belongs to: the UTC day, the one GitHub dates issues in.
export const jourDe = (instant: Date): string => instant.toISOString().slice(0, 10);

export type EtatCadence = {
  // On by default: a project that never touched the switch runs the role.
  on: boolean;
  // The last switch, or null when nobody ever touched it.
  since: string | null;
  by: string | null;
  plafond: number;
  intervalleMs: number;
  // When the role last ran, or null: never.
  dernierRun: string | null;
  jour: string;
  deposesAujourdhui: number;
  // The cap was said reached today.
  plafondDit: boolean;
};

type Ligne = { type: string; at: string; author: string; payload: string };

const dernier = (base: Base, types: string[], suite = "", ...parametres: string[]): Ligne | undefined =>
  base.lire<Ligne>(`SELECT type, at, author, payload FROM events WHERE type IN (${types.map(() => "?").join(", ")}) ${suite} ORDER BY seq DESC LIMIT 1`, ...types, ...parametres)[0];

export function etatDeLaCadence(base: Base, maintenant: Date): EtatCadence {
  const jour = jourDe(maintenant);
  const bascule = dernier(base, ["product.switched-on", "product.switched-off"]);
  const reglages = dernier(base, ["product.settings"]);
  const lus = reglages === undefined ? null : (JSON.parse(reglages.payload) as { cap: number; intervalHours: number });
  const run = dernier(base, ["product.ran"]);
  const compte = dernier(base, ["product.ran", "product.cap-reached"], "AND json_extract(payload, '$.day') = ?", jour);
  const ditAtteint = dernier(base, ["product.cap-reached"], "AND json_extract(payload, '$.day') = ?", jour);
  return {
    on: bascule?.type !== "product.switched-off",
    since: bascule?.at ?? null,
    by: bascule?.author ?? null,
    plafond: lus?.cap ?? PLAFOND_PAR_DEFAUT,
    intervalleMs: (lus?.intervalHours ?? INTERVALLE_PAR_DEFAUT_H) * 3_600_000,
    dernierRun: run?.at ?? null,
    jour,
    deposesAujourdhui: compte === undefined ? 0 : (JSON.parse(compte.payload) as { filedToday: number }).filedToday,
    plafondDit: ditAtteint !== undefined,
  };
}

// The line `status` shows, after its title: on or off, `N/cap` filed today,
// and the last run.
export function direCadence(etat: EtatCadence): string {
  const position = etat.on ? "ON" : `OFF since ${etat.since} (by ${etat.by})`;
  return `${position} — ${etat.deposesAujourdhui}/${etat.plafond} filed today (${etat.jour}, UTC), last run ${etat.dernierRun ?? "never"}`;
}
