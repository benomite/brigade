// Les vies successives du runtime : quand il a démarré, et comment chacune
// s'est terminée. C'est ici que se lit « un runtime tournait-il, et a-t-il été
// arrêté proprement ? ».
import type { Base } from "../base.ts";
import type { FaitRuntime } from "../evenements/runtime.ts";
import { definirProjection } from "../projection.ts";

export type Session = { startedSeq: number; startedAt: string; pid: number; host: string };

const terminer = (fin: "stopped" | "interrupted") => (base: Base, evenement: { seq: number; at: string }) => {
  base.executer(
    "UPDATE runtime_sessions SET ended_seq = ?, ended_at = ?, ending = ? WHERE ended_seq IS NULL",
    evenement.seq,
    evenement.at,
    fin,
  );
};

export const sessions = definirProjection<FaitRuntime>({
  nom: "sessions",
  tables: ["runtime_sessions"],
  schema: `
    CREATE TABLE IF NOT EXISTS runtime_sessions (
      started_seq INTEGER PRIMARY KEY,
      started_at  TEXT NOT NULL,
      pid         INTEGER NOT NULL,
      host        TEXT NOT NULL,
      ended_seq   INTEGER,
      ended_at    TEXT,
      ending      TEXT
    ) STRICT;
  `,
  sur: {
    "runtime.started": (base, evenement) => {
      base.executer(
        "INSERT INTO runtime_sessions (started_seq, started_at, pid, host) VALUES (?, ?, ?, ?)",
        evenement.seq,
        evenement.at,
        evenement.payload.pid,
        evenement.payload.host,
      );
    },
    "runtime.stopped": terminer("stopped"),
    "runtime.interrupted": terminer("interrupted"),
  },
});

// La session qui n'a pas de fin au journal : le runtime qui tourne, ou celui
// qui est mort sans avoir pu l'écrire.
export function sessionEnCours(base: Base): Session | null {
  return (
    base.lire<Session>(
      `SELECT started_seq AS startedSeq, started_at AS startedAt, pid, host
       FROM runtime_sessions WHERE ended_seq IS NULL ORDER BY started_seq DESC LIMIT 1`,
    )[0] ?? null
  );
}
