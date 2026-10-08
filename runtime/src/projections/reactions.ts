// Les réactions du manager : pour chaque ticket que la pass lui a passé, ce
// qu'il a choisi d'en faire, et où il en est de le faire. C'est ici qu'il lit,
// à chaque réveil, ce qui reste à poser, à dire, à rendre — il ne garde rien en
// mémoire — et que le chef lit pourquoi.
import type { Base } from "../base.ts";
import type { Calibrage } from "../calibrage.ts";
import type { ChoixDeReaction, FaitReaction } from "../evenements/manager.ts";
import { definirProjection } from "../projection.ts";

export type ReactionDeTicket = {
  ticket: number;
  // Le `pass.judged` auquel elle répond.
  verdict: number;
  returns: number;
  choice: ChoixDeReaction;
  reason: string;
  proposal: string | null;
  run: string | null;
  from: Calibrage;
  to: Calibrage | null;
  // Les labels de la montée sont posés.
  raised: boolean;
  commented: boolean;
  at: string;
};

const CHOIX: readonly unknown[] = ["retry", "raise", "split", "escalate"];
const texte = (valeur: unknown): valeur is string => typeof valeur === "string" && valeur !== "";
const calibrage = (valeur: unknown): Calibrage | null => {
  const { model, effort } = (valeur !== null && typeof valeur === "object" ? valeur : {}) as Record<string, unknown>;
  return texte(model) && texte(effort) ? { model, effort } : null;
};

export const reactions = definirProjection<FaitReaction>({
  nom: "reactions",
  tables: ["manager_reactions", "manager_reaction_labels"],
  schema: `
    CREATE TABLE IF NOT EXISTS manager_reactions (
      ticket      INTEGER PRIMARY KEY,
      verdict     INTEGER NOT NULL,
      returns     INTEGER NOT NULL,
      choice      TEXT NOT NULL,
      reason      TEXT NOT NULL,
      proposal    TEXT,
      run         TEXT,
      origin      TEXT NOT NULL,
      target      TEXT,
      raised      INTEGER NOT NULL DEFAULT 0,
      commented   INTEGER NOT NULL DEFAULT 0,
      decided_seq INTEGER NOT NULL,
      at          TEXT NOT NULL
    ) STRICT;
    -- Les labels de calibrage que des montées ont posés : ils sont au manager.
    CREATE TABLE IF NOT EXISTS manager_reaction_labels (
      ticket INTEGER NOT NULL,
      label  TEXT NOT NULL,
      PRIMARY KEY (ticket, label)
    ) STRICT;
  `,
  sur: {
    // Une réaction remplace la précédente : ce qui a été posé et dit pour
    // l'autre ne vaut pas pour elle.
    "manager.reacted": (base, { ticket, seq, at, payload }) => {
      const from = calibrage(payload.from);
      if (ticket === null || !Number.isSafeInteger(payload.verdict) || !CHOIX.includes(payload.choice) || from === null) return;
      base.executer(
        `INSERT OR REPLACE INTO manager_reactions (ticket, verdict, returns, choice, reason, proposal, run, origin, target, decided_seq, at)
         VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`,
        ticket,
        payload.verdict,
        Number.isSafeInteger(payload.returns) ? payload.returns : 0,
        payload.choice,
        texte(payload.reason) ? payload.reason : "",
        texte(payload.proposal) ? payload.proposal : null,
        texte(payload.run) ? payload.run : null,
        JSON.stringify(from),
        JSON.stringify(calibrage(payload.to)),
        seq,
        at,
      );
    },
    "manager.raised": (base, { ticket, payload }) => {
      if (ticket === null) return;
      base.executer("UPDATE manager_reactions SET raised = 1 WHERE ticket = ?", ticket);
      for (const label of Array.isArray(payload.added) ? payload.added.filter(texte) : []) {
        base.executer("INSERT OR IGNORE INTO manager_reaction_labels (ticket, label) VALUES (?, ?)", ticket, label);
      }
    },
    "manager.reaction-commented": (base, { ticket }) => {
      base.executer("UPDATE manager_reactions SET commented = 1 WHERE ticket IS ?", ticket);
    },
  },
});

type Ligne = Omit<ReactionDeTicket, "from" | "to" | "raised" | "commented"> & { origin: string; target: string | null; raised: number; commented: number };

const lire = (base: Base, suite: string, ...parametres: number[]): ReactionDeTicket[] =>
  base
    .lire<Ligne>(`SELECT ticket, verdict, returns, choice, reason, proposal, run, origin, target, raised, commented, at FROM manager_reactions ${suite}`, ...parametres)
    .map(({ origin, target, raised, commented, ...ligne }) => ({
      ...ligne,
      from: JSON.parse(origin) as Calibrage,
      to: target === null ? null : (JSON.parse(target) as Calibrage | null),
      raised: raised === 1,
      commented: commented === 1,
    }));

// La dernière réaction du manager sur un ticket, ou null.
export function reactionDe(base: Base, ticket: number): ReactionDeTicket | null {
  return lire(base, "WHERE ticket = ?", ticket)[0] ?? null;
}

// Les dernières réactions, la plus récente d'abord.
export function reactionsDuManager(base: Base, combien: number): ReactionDeTicket[] {
  return lire(base, "ORDER BY decided_seq DESC LIMIT ?", combien);
}

// Les labels de calibrage que des montées ont posés sur un ticket.
export function labelsMontes(base: Base, ticket: number): string[] {
  return base.lire<{ label: string }>("SELECT label FROM manager_reaction_labels WHERE ticket = ? ORDER BY label", ticket).map(({ label }) => label);
}
