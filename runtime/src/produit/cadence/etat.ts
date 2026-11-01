// What the cadence of the product role keeps, in the project's own log base
// (`<state directory>/log.db`): one row, so one project's cadence never reads
// another's. It holds the chef's switch and daily cap, and what the runtime
// last saw: when the role last ran, how many issues it filed today, and the day
// the cap was last said to be reached.
//
// It is not a projection — nothing in the log writes it, and a replay of the
// log leaves it as it is. The runtime writes what it ran and counted; the
// chef's gesture (`commande.ts`) writes the switch and the cap; `status` reads
// it, without ever writing.
import type { Base } from "../../base.ts";

// The issues the role may file in a day, when the chef has not set it.
export const PLAFOND_PAR_DEFAUT = 3;
// Off until the chef turns it on: a project brigade serves does not start
// filing issues on its repository, and spending its quota, unasked.
export const ALLUME_PAR_DEFAUT = false;

const TABLE = "product_cadence";

const SCHEMA = `
  CREATE TABLE IF NOT EXISTS ${TABLE} (
    id          INTEGER PRIMARY KEY CHECK (id = 1),
    enabled     INTEGER NOT NULL CHECK (enabled IN (0, 1)),
    cap         INTEGER NOT NULL CHECK (cap >= 0),
    last_run_at TEXT,
    day         TEXT,
    filed       INTEGER NOT NULL DEFAULT 0 CHECK (filed >= 0),
    cap_said_on TEXT
  ) STRICT;
`;

// `allume`: the role may run. `plafond`: the issues it may file in a day.
// `dernierPassage`: when it last ran, ISO, or null if never. `jour`, `deposees`:
// the day (`YYYY-MM-DD`, UTC) of the last count, and how many it filed that
// day. `plafondDitLe`: the day the cap was last said to be reached.
export type EtatCadence = { allume: boolean; plafond: number; dernierPassage: string | null; jour: string | null; deposees: number; plafondDitLe: string | null };

const PAR_DEFAUT: EtatCadence = { allume: ALLUME_PAR_DEFAUT, plafond: PLAFOND_PAR_DEFAUT, dernierPassage: null, jour: null, deposees: 0, plafondDitLe: null };

// The day of an instant, as the cap counts it: in UTC.
export const jourDe = (instant: Date): string => instant.toISOString().slice(0, 10);

// Creates the table if it is missing, and its row with the defaults: off, the
// default cap, never run.
export function poserLaCadence(base: Base): void {
  base.script(SCHEMA);
  base.executer(`INSERT INTO ${TABLE} (id, enabled, cap) VALUES (1, ?, ?) ON CONFLICT (id) DO NOTHING`, ALLUME_PAR_DEFAUT ? 1 : 0, PLAFOND_PAR_DEFAUT);
}

const posee = (base: Base) => base.lire<{ n: number }>("SELECT count(*) AS n FROM sqlite_master WHERE type = 'table' AND name = ?", TABLE)[0]?.n === 1;

// What the cadence holds. A base where it was never set — a project whose
// runtime predates it, read by `status` without writing — holds the defaults.
export function lireLaCadence(base: Base): EtatCadence {
  if (!posee(base)) return { ...PAR_DEFAUT };
  const ligne = base.lire<{ enabled: number; cap: number; last_run_at: string | null; day: string | null; filed: number; cap_said_on: string | null }>(
    `SELECT enabled, cap, last_run_at, day, filed, cap_said_on FROM ${TABLE} WHERE id = 1`,
  )[0];
  if (ligne === undefined) return { ...PAR_DEFAUT };
  return { allume: ligne.enabled === 1, plafond: ligne.cap, dernierPassage: ligne.last_run_at, jour: ligne.day, deposees: ligne.filed, plafondDitLe: ligne.cap_said_on };
}

// The issues filed on `jour`, as last counted: none if the last count is of
// another day.
export const deposeesLe = (etat: EtatCadence, jour: string): number => (etat.jour === jour ? etat.deposees : 0);

export function allumer(base: Base, allume: boolean): void {
  poserLaCadence(base);
  base.executer(`UPDATE ${TABLE} SET enabled = ? WHERE id = 1`, allume ? 1 : 0);
}

export function plafonner(base: Base, plafond: number): void {
  if (!Number.isSafeInteger(plafond) || plafond < 0) throw new RangeError(`invalid daily cap: ${plafond}`);
  poserLaCadence(base);
  base.executer(`UPDATE ${TABLE} SET cap = ? WHERE id = 1`, plafond);
}

// Writes how many issues the role filed on `jour`. A count is never lowered
// within a day: GitHub may not show yet an issue just filed.
export function compter(base: Base, jour: string, deposees: number): void {
  poserLaCadence(base);
  base.executer(`UPDATE ${TABLE} SET filed = CASE WHEN day = ? THEN max(filed, ?) ELSE ? END, day = ? WHERE id = 1`, jour, deposees, deposees, jour);
}

export function noterPassage(base: Base, instant: Date): void {
  poserLaCadence(base);
  base.executer(`UPDATE ${TABLE} SET last_run_at = ? WHERE id = 1`, instant.toISOString());
}

export function noterPlafondDit(base: Base, jour: string): void {
  poserLaCadence(base);
  base.executer(`UPDATE ${TABLE} SET cap_said_on = ? WHERE id = 1`, jour);
}
