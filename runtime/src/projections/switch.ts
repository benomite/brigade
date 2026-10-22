// The project switch (`events/switch.ts`): on or off, since when, by whom.
// Null as long as no runtime has set it — a log from before the switch, not
// yet restarted: the old switches still hold there (`managerAllume`, the
// `merge` grant), and nothing holds the kitchen.
import type { Base } from "../base.ts";
import type { CauseDeLInterrupteur, FaitInterrupteur } from "../events/switch.ts";
import { definirProjection } from "../projection.ts";

export type EtatInterrupteur = { on: boolean; since: string; by: string; cause: CauseDeLInterrupteur | null };

const basculer = (base: Base, on: number, at: string, by: string, cause: unknown) => {
  base.executer(
    `INSERT INTO project_switch (id, active, since, by, cause) VALUES (1, ?, ?, ?, ?)
     ON CONFLICT (id) DO UPDATE SET active = excluded.active, since = excluded.since, by = excluded.by, cause = excluded.cause`,
    on,
    at,
    by,
    cause === "default" || cause === "carried-over" ? cause : null,
  );
};

export const interrupteur = definirProjection<FaitInterrupteur>({
  nom: "interrupteur",
  tables: ["project_switch"],
  schema: `
    CREATE TABLE IF NOT EXISTS project_switch (
      id     INTEGER PRIMARY KEY CHECK (id = 1),
      active INTEGER NOT NULL,
      since  TEXT NOT NULL,
      by     TEXT NOT NULL,
      cause  TEXT
    ) STRICT;
  `,
  sur: {
    "project.switched-on": (base, { at, author, payload }) => basculer(base, 1, at, author, payload.cause),
    "project.switched-off": (base, { at, author, payload }) => basculer(base, 0, at, author, payload.cause),
  },
});

export function etatDeLInterrupteur(base: Base): EtatInterrupteur | null {
  const ligne = base.lire<{ active: number; since: string; by: string; cause: CauseDeLInterrupteur | null }>("SELECT active, since, by, cause FROM project_switch WHERE id = 1")[0];
  return ligne ? { on: ligne.active === 1, since: ligne.since, by: ligne.by, cause: ligne.cause } : null;
}

// The switch is set, and off: nothing new is taken, judged, split or merged.
// A switch not yet set holds nothing.
export function projetEteint(base: Base): boolean {
  return etatDeLInterrupteur(base)?.on === false;
}
