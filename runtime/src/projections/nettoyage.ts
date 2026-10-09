// Le sort du worktree de chaque cook, une fois ce cook fini : rangé, ou gardé
// — et pourquoi. C'est ici que se retrouve ce que le runtime n'a pas pu
// ranger. Et les branches locales déjà parties, et le dernier rangement des
// transcripts d'un projet cloisonné.
import type { Base } from "../base.ts";
import type { FaitNettoyage, MotifDeGarde } from "../evenements/nettoyage.ts";
import { definirProjection } from "../projection.ts";

export type WorktreeGarde = { ticket: number; worktree: string; branch: string; reason: MotifDeGarde; detail: string; since: string };

// Chaque motif tel que le chef le lit. Les deux premiers sont ceux d'un
// journal d'avant #164.
const MOTIFS: Record<MotifDeGarde, string> = { "pr-open": "PR encore ouverte", unpushed: "travail non poussé", failed: "rangement en échec" };

export const direMotifDeGarde = (motif: MotifDeGarde) => MOTIFS[motif];

const texte = (valeur: unknown): valeur is string => typeof valeur === "string" && valeur !== "";

// Un fait illisible est ignoré : lever ici empêcherait le runtime de redémarrer.
const ranger = (base: Base, ticket: number | null, at: string, worktree: unknown, branch: unknown, state: "removed" | "kept", reason: unknown = null, detail: unknown = null) => {
  if (ticket === null || !texte(worktree) || !texte(branch) || (state === "kept" && !(texte(reason) && Object.hasOwn(MOTIFS, reason)))) return;
  base.executer(
    `INSERT INTO worktree_fates (worktree, ticket, branch, state, reason, detail, since) VALUES (?, ?, ?, ?, ?, ?, ?)
     ON CONFLICT (worktree) DO UPDATE SET
       ticket = excluded.ticket, branch = excluded.branch, state = excluded.state,
       reason = excluded.reason, detail = excluded.detail, since = excluded.since`,
    worktree,
    ticket,
    branch,
    state,
    texte(reason) ? reason : null,
    texte(detail) ? detail : null,
    at,
  );
};

const elaguer = (base: Base, branch: unknown) => {
  if (texte(branch)) base.executer("INSERT OR IGNORE INTO branch_fates (branch) VALUES (?)", branch);
};

const NOMBRES = ["removed", "freedBytes", "kept", "keptBytes", "keepMs"] as const;

export type RangementDeTranscripts = { at: string } & Record<(typeof NOMBRES)[number], number>;

export const nettoyage = definirProjection<FaitNettoyage>({
  nom: "nettoyage",
  tables: ["worktree_fates", "branch_fates", "transcript_tidy"],
  schema: `
    CREATE TABLE IF NOT EXISTS worktree_fates (
      worktree TEXT PRIMARY KEY,
      ticket   INTEGER NOT NULL,
      branch   TEXT NOT NULL,
      state    TEXT NOT NULL CHECK (state IN ('removed', 'kept')),
      reason   TEXT,
      detail   TEXT,
      since    TEXT NOT NULL
    ) STRICT;
    CREATE TABLE IF NOT EXISTS branch_fates (
      branch TEXT PRIMARY KEY
    ) STRICT;
    CREATE TABLE IF NOT EXISTS transcript_tidy (
      id          INTEGER PRIMARY KEY CHECK (id = 1),
      at          TEXT NOT NULL,
      removed     INTEGER NOT NULL,
      freed_bytes INTEGER NOT NULL,
      kept        INTEGER NOT NULL,
      kept_bytes  INTEGER NOT NULL,
      keep_ms     INTEGER NOT NULL
    ) STRICT;
  `,
  sur: {
    "worktree.removed": (base, { ticket, at, payload }) => {
      ranger(base, ticket, at, payload.worktree, payload.branch, "removed");
      // Avant #164, la branche locale partait avec le worktree.
      if (payload.harvest === undefined) elaguer(base, payload.branch);
    },
    "worktree.kept": (base, { ticket, at, payload }) => ranger(base, ticket, at, payload.worktree, payload.branch, "kept", payload.reason, payload.detail),
    "branch.removed": (base, { payload }) => elaguer(base, payload.branch),
    // Seul le dernier passage compte : la ligne est unique.
    "transcripts.tidied": (base, { at, payload }) => {
      const nombres = NOMBRES.map((nom) => payload[nom]);
      if (!nombres.every((valeur) => Number.isSafeInteger(valeur) && valeur >= 0)) return;
      base.executer("INSERT OR REPLACE INTO transcript_tidy (id, at, removed, freed_bytes, kept, kept_bytes, keep_ms) VALUES (1, ?, ?, ?, ?, ?, ?)", at, ...nombres);
    },
    "transcripts.released": (base) => {
      base.executer("DELETE FROM transcript_tidy");
    },
  },
});

// Les worktrees que le runtime n'a pas rangés, par ticket.
export function worktreesGardes(base: Base): WorktreeGarde[] {
  return base.lire<WorktreeGarde>(
    `SELECT ticket, worktree, branch, reason, detail, since
     FROM worktree_fates WHERE state = 'kept'
     ORDER BY ticket, worktree`,
  );
}

// Le dernier rangement des transcripts, ou null si aucun n'a eu lieu depuis
// que le projet est cloisonné.
export function rangementDesTranscripts(base: Base): RangementDeTranscripts | null {
  return (
    base.lire<RangementDeTranscripts>(
      "SELECT at, removed, freed_bytes AS freedBytes, kept, kept_bytes AS keptBytes, keep_ms AS keepMs FROM transcript_tidy",
    )[0] ?? null
  );
}
