// Le sort du worktree de chaque cook, une fois son ticket servi ou parti :
// retiré, ou gardé — et pourquoi. C'est ici que se retrouve ce que le
// nettoyage n'a pas pu, ou pas voulu, retirer.
import type { Base } from "../base.ts";
import type { FaitNettoyage, MotifDeGarde } from "../evenements/nettoyage.ts";
import { definirProjection } from "../projection.ts";

export type WorktreeGarde = { ticket: number; worktree: string; branch: string; reason: MotifDeGarde; detail: string; since: string };

// Chaque motif tel que le chef le lit.
const MOTIFS: Record<MotifDeGarde, string> = { "pr-open": "PR encore ouverte", unpushed: "travail non poussé", failed: "retrait en échec" };

export const direMotifDeGarde = (motif: MotifDeGarde) => MOTIFS[motif];

const texte = (valeur: unknown): valeur is string => typeof valeur === "string" && valeur !== "";

// Un fait illisible est ignoré : lever ici empêcherait le runtime de redémarrer.
const ranger = (base: Base, ticket: number | null, at: string, worktree: unknown, branch: unknown, state: "removed" | "kept", reason: unknown = null, detail: unknown = null) => {
  if (ticket === null || !texte(worktree) || !texte(branch) || (state === "kept" && !texte(reason))) return;
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

export const nettoyage = definirProjection<FaitNettoyage>({
  nom: "nettoyage",
  tables: ["worktree_fates"],
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
  `,
  sur: {
    "worktree.removed": (base, { ticket, at, payload }) => ranger(base, ticket, at, payload.worktree, payload.branch, "removed"),
    "worktree.kept": (base, { ticket, at, payload }) => ranger(base, ticket, at, payload.worktree, payload.branch, "kept", payload.reason, payload.detail),
  },
});

// Les worktrees gardés, par ticket.
export function worktreesGardes(base: Base): WorktreeGarde[] {
  return base.lire<WorktreeGarde>("SELECT ticket, worktree, branch, reason, detail, since FROM worktree_fates WHERE state = 'kept' ORDER BY ticket, worktree");
}
