// La dernière sauvegarde réussie de l'état : quand, sous quel nom, et jusqu'où
// va le journal qu'elle porte. C'est ici que se lit « de quand date ce que je
// pourrais restaurer ? » — un échec, lui, n'écrit rien au journal : il se voit
// à l'âge de cette date.
import type { Base } from "../base.ts";
import type { FaitSauvegarde } from "../evenements/sauvegarde.ts";
import { definirProjection } from "../projection.ts";

export type Sauvegarde = { at: string; name: string; lastSeq: number };

export const sauvegardes = definirProjection<FaitSauvegarde>({
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
    // Seule la dernière compte : la ligne est unique, chaque réussite la remplace.
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

// Nulle tant que le projet n'a jamais été sauvegardé.
export function derniereSauvegarde(base: Base): Sauvegarde | null {
  return base.lire<Sauvegarde>("SELECT at, name, last_seq AS lastSeq FROM backup_last WHERE id = 1")[0] ?? null;
}
