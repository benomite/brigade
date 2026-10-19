// The emergency alert in progress: the last one the runtime issued, as long as
// the emergency it announces is not lifted. It lives in the log, so it
// survives a runtime restart and can be read with the app closed.
import type { Base } from "../base.ts";
import type { FaitUrgence } from "../events/emergency.ts";
import { definirProjection } from "../projection.ts";

// `emiseLe`: the first emission of this emergency; `derniereLe`: the most
// recent (a reminder, or the first); `rappels`: how many reminders since.
export type AlerteEnCours = {
  key: string;
  label: string;
  decision: string;
  ticket: number | null;
  cause: string;
  geste: string;
  since: string;
  emiseLe: string;
  derniereLe: string;
  rappels: number;
};

export const alerteUrgence = definirProjection<FaitUrgence>({
  nom: "urgence-alerte",
  tables: ["urgence_alerte"],
  schema: `
    CREATE TABLE IF NOT EXISTS urgence_alerte (
      id         INTEGER PRIMARY KEY CHECK (id = 1),
      key        TEXT NOT NULL,
      label      TEXT NOT NULL,
      decision   TEXT NOT NULL,
      ticket     INTEGER,
      cause      TEXT NOT NULL,
      geste      TEXT NOT NULL,
      since      TEXT NOT NULL,
      emise_le   TEXT NOT NULL,
      derniere   TEXT NOT NULL,
      rappels    INTEGER NOT NULL
    ) STRICT;
  `,
  sur: {
    "urgence.alerted": (base, { at, payload }) => {
      const meme = base.lire<{ emise_le: string; rappels: number }>("SELECT emise_le, rappels FROM urgence_alerte WHERE id = 1 AND key = ?", payload.key)[0];
      const emise = meme !== undefined && payload.reminder ? meme.emise_le : at;
      const rappels = meme !== undefined && payload.reminder ? meme.rappels + 1 : 0;
      base.executer(
        "INSERT OR REPLACE INTO urgence_alerte (id, key, label, decision, ticket, cause, geste, since, emise_le, derniere, rappels) VALUES (1, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)",
        payload.key, payload.label, payload.decision, payload.ticket, payload.cause, payload.geste, payload.since, emise, at, rappels,
      );
    },
    "urgence.lifted": (base) => base.executer("DELETE FROM urgence_alerte"),
  },
});

export function alerteEnCours(base: Base): AlerteEnCours | null {
  const lue = base.lire<{ key: string; label: string; decision: string; ticket: number | null; cause: string; geste: string; since: string; emise_le: string; derniere: string; rappels: number }>(
    "SELECT key, label, decision, ticket, cause, geste, since, emise_le, derniere, rappels FROM urgence_alerte WHERE id = 1",
  )[0];
  return lue === undefined
    ? null
    : { key: lue.key, label: lue.label, decision: lue.decision, ticket: lue.ticket, cause: lue.cause, geste: lue.geste, since: lue.since, emiseLe: lue.emise_le, derniereLe: lue.derniere, rappels: lue.rappels };
}
