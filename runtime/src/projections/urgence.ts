// L'alerte d'urgence en cours : la dernière que le runtime a émise, tant que
// l'urgence qu'elle annonce n'est pas levée. Elle vit au journal, donc elle
// survit à un redémarrage du runtime et se lit app fermée.
import type { Base } from "../base.ts";
import type { FaitUrgence } from "../evenements/urgence.ts";
import { definirProjection } from "../projection.ts";

// `emiseLe` : la première émission de cette urgence ; `derniereLe` : la plus
// récente (un rappel, ou la première) ; `rappels` : combien de rappels depuis.
export type AlerteEnCours = {
  key: string;
  label: string;
  decision: string;
  ticket: number | null;
  cause: string;
  geste: string;
  depuis: string;
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
    : { key: lue.key, label: lue.label, decision: lue.decision, ticket: lue.ticket, cause: lue.cause, geste: lue.geste, depuis: lue.since, emiseLe: lue.emise_le, derniereLe: lue.derniere, rappels: lue.rappels };
}
