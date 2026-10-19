// The last successful backup of the state: when, under what name, and how far
// the log it carries goes. This is where "how old is what I could restore?"
// is read — a failure writes nothing to the log: it shows in the age of this
// date.
import type { Base } from "../base.ts";
import type { BackupFact } from "../events/backup.ts";
import { definirProjection } from "../projection.ts";

export type Backup = { at: string; name: string; lastSeq: number };

export const backups = definirProjection<BackupFact>({
  nom: "sauvegardes",
  tables: ["backup_last"],
  schema: `
    CREATE TABLE IF NOT EXISTS backup_last (
      id       INTEGER PRIMARY KEY CHECK (id = 1),
      at       TEXT NOT NULL,
      name     TEXT NOT NULL,
      last_seq INTEGER NOT NULL
    ) STRICT;
  `,
  sur: {
    // Only the last one counts: the row is unique, each success replaces it.
    "backup.completed": (base, evenement) => {
      base.executer(
        "INSERT OR REPLACE INTO backup_last (id, at, name, last_seq) VALUES (1, ?, ?, ?)",
        evenement.at,
        evenement.payload.name,
        evenement.payload.lastSeq,
      );
    },
  },
});

// Null as long as the project has never been backed up.
export function lastBackup(base: Base): Backup | null {
  return base.lire<Backup>("SELECT at, name, last_seq AS lastSeq FROM backup_last WHERE id = 1")[0] ?? null;
}
