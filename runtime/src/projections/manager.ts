// L'état du manager : son interrupteur, et où en est chaque issue qu'il a
// regardée. C'est ici qu'il lit, à chaque réveil, ce qu'il a déjà décidé — il
// ne garde rien en mémoire — et que le chef lit pourquoi.
import type { Base } from "../base.ts";
import type { FaitManager } from "../evenements/manager.ts";
import { definirProjection } from "../projection.ts";

export type EtatManager = { active: boolean; since: string; by: string };

export type IssueDuManager = {
  ticket: number;
  // `aside` : écartée par le code. `failed` : jugement illisible.
  decision: "fire" | "refused" | "failed" | "aside";
  // L'empreinte de ce qui a été jugé ; nulle pour une issue écartée.
  fingerprint: string | null;
  kind: string | null;
  reason: string;
  missing: string | null;
  model: string | null;
  effort: string | null;
  calibration: string | null;
  run: string | null;
  // Écartée alors qu'elle portait `fire`.
  fired: boolean;
  at: string;
  // Ce que cette décision a posé ; nul tant que rien n'est posé.
  labels: string[] | null;
  commented: boolean;
  // Tout ce que le manager a jamais posé sur l'issue.
  posed: string[];
};

const texte = (valeur: unknown): valeur is string => typeof valeur === "string" && valeur !== "";
const texteOuRien = (valeur: unknown) => (texte(valeur) ? valeur : null);

const basculer = (base: Base, active: number, at: string, by: string) => {
  base.executer(
    `INSERT INTO manager_state (id, active, since, by) VALUES (1, ?, ?, ?)
     ON CONFLICT (id) DO UPDATE SET active = excluded.active, since = excluded.since, by = excluded.by`,
    active,
    at,
    by,
  );
};

type Decision = Pick<IssueDuManager, "decision" | "reason"> & Partial<Omit<IssueDuManager, "ticket" | "decision" | "reason" | "at" | "labels" | "commented" | "posed">>;

// Une décision remplace la précédente : ce qui a été posé et dit pour l'autre
// ne vaut pas pour elle. Seul `posed` traverse.
const decider = (base: Base, ticket: number | null, seq: number, at: string, decision: Decision) => {
  if (ticket === null) return;
  base.executer(
    `INSERT INTO manager_issues (ticket, decision, fingerprint, kind, reason, missing, model, effort, calibration, run, fired, decided_seq, at)
     VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
     ON CONFLICT (ticket) DO UPDATE SET
       decision = excluded.decision, fingerprint = excluded.fingerprint, kind = excluded.kind, reason = excluded.reason,
       missing = excluded.missing, model = excluded.model, effort = excluded.effort, calibration = excluded.calibration,
       run = excluded.run, fired = excluded.fired, decided_seq = excluded.decided_seq, at = excluded.at,
       labels = NULL, commented = 0`,
    ticket,
    decision.decision,
    decision.fingerprint ?? null,
    decision.kind ?? null,
    decision.reason,
    decision.missing ?? null,
    decision.model ?? null,
    decision.effort ?? null,
    decision.calibration ?? null,
    decision.run ?? null,
    decision.fired ? 1 : 0,
    seq,
    at,
  );
};

export const manager = definirProjection<FaitManager>({
  nom: "manager",
  tables: ["manager_state", "manager_issues"],
  schema: `
    CREATE TABLE IF NOT EXISTS manager_state (
      id     INTEGER PRIMARY KEY CHECK (id = 1),
      active INTEGER NOT NULL,
      since  TEXT NOT NULL,
      by     TEXT NOT NULL
    ) STRICT;
    CREATE TABLE IF NOT EXISTS manager_issues (
      ticket      INTEGER PRIMARY KEY,
      decision    TEXT NOT NULL,
      fingerprint TEXT,
      kind        TEXT,
      reason      TEXT NOT NULL,
      missing     TEXT,
      model       TEXT,
      effort      TEXT,
      calibration TEXT,
      run         TEXT,
      fired       INTEGER NOT NULL DEFAULT 0,
      decided_seq INTEGER NOT NULL,
      at          TEXT NOT NULL,
      labels      TEXT,
      commented   INTEGER NOT NULL DEFAULT 0,
      posed       TEXT NOT NULL DEFAULT '[]'
    ) STRICT;
  `,
  sur: {
    "manager.enabled": (base, { at, author }) => basculer(base, 1, at, author),
    "manager.disabled": (base, { at, author }) => basculer(base, 0, at, author),
    "manager.set-aside": (base, { ticket, seq, at, payload }) => {
      decider(base, ticket, seq, at, { decision: "aside", reason: String(payload.reason), fired: payload.fired === true });
    },
    "manager.judged": (base, { ticket, seq, at, payload }) => {
      decider(base, ticket, seq, at, {
        decision: payload.verdict === "fire" ? "fire" : "refused",
        fingerprint: texteOuRien(payload.fingerprint),
        kind: texteOuRien(payload.kind),
        reason: String(payload.reason ?? ""),
        missing: texteOuRien(payload.missing),
        model: texteOuRien(payload.model),
        effort: texteOuRien(payload.effort),
        calibration: texteOuRien(payload.calibration),
        run: texteOuRien(payload.run),
      });
    },
    "manager.failed": (base, { ticket, seq, at, payload }) => {
      decider(base, ticket, seq, at, {
        decision: "failed",
        fingerprint: texteOuRien(payload.fingerprint),
        reason: String(payload.reason ?? ""),
        run: texteOuRien(payload.run),
      });
    },
    "manager.labeled": (base, { ticket, payload }) => {
      const labels = Array.isArray(payload.labels) ? payload.labels.filter(texte) : [];
      const connus = base.lire<{ posed: string }>("SELECT posed FROM manager_issues WHERE ticket IS ?", ticket)[0];
      if (!connus) return;
      const poses = [...new Set([...(JSON.parse(connus.posed) as string[]), ...labels])];
      base.executer("UPDATE manager_issues SET labels = ?, posed = ? WHERE ticket IS ?", JSON.stringify(labels), JSON.stringify(poses), ticket);
    },
    "manager.commented": (base, { ticket }) => {
      base.executer("UPDATE manager_issues SET commented = 1 WHERE ticket IS ?", ticket);
    },
  },
});

export function etatDuManager(base: Base): EtatManager | null {
  const ligne = base.lire<{ active: number; since: string; by: string }>("SELECT active, since, by FROM manager_state WHERE id = 1")[0];
  return ligne ? { ...ligne, active: ligne.active === 1 } : null;
}

export function managerAllume(base: Base): boolean {
  return etatDuManager(base)?.active === true;
}

const COLONNES = "ticket, decision, fingerprint, kind, reason, missing, model, effort, calibration, run, fired, at, labels, commented, posed";

type Ligne = Omit<IssueDuManager, "fired" | "labels" | "commented" | "posed"> & { fired: number; labels: string | null; commented: number; posed: string };

const lire = (base: Base, suite: string, ...parametres: number[]): IssueDuManager[] =>
  base.lire<Ligne>(`SELECT ${COLONNES} FROM manager_issues ${suite}`, ...parametres).map((ligne) => ({
    ...ligne,
    fired: ligne.fired === 1,
    labels: ligne.labels === null ? null : (JSON.parse(ligne.labels) as string[]),
    commented: ligne.commented === 1,
    posed: JSON.parse(ligne.posed) as string[],
  }));

export function issueDuManager(base: Base, ticket: number): IssueDuManager | null {
  return lire(base, "WHERE ticket = ?", ticket)[0] ?? null;
}

// Les dernières décisions, la plus récente d'abord.
export function decisionsDuManager(base: Base, combien: number): IssueDuManager[] {
  return lire(base, "ORDER BY decided_seq DESC LIMIT ?", combien);
}
