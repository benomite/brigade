// Le sort du worktree de chaque cook, une fois ce cook fini : rangé, ou gardé
// — et pourquoi. C'est ici que se retrouve ce que le runtime n'a pas pu
// ranger. Et les branches locales déjà parties.
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

export const nettoyage = definirProjection<FaitNettoyage>({
  nom: "nettoyage",
  tables: ["worktree_fates", "branch_fates"],
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
  `,
  sur: {
    "worktree.removed": (base, { ticket, at, payload }) => {
      ranger(base, ticket, at, payload.worktree, payload.branch, "removed");
      // Avant #164, la branche locale partait avec le worktree.
      if (payload.harvest === undefined) elaguer(base, payload.branch);
    },
    "worktree.kept": (base, { ticket, at, payload }) => ranger(base, ticket, at, payload.worktree, payload.branch, "kept", payload.reason, payload.detail),
    "branch.removed": (base, { payload }) => elaguer(base, payload.branch),
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
