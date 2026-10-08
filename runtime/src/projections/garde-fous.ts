// L'état des garde-fous : les réglages en vigueur, les cooks en cours, le
// disjoncteur et le « stop ». C'est ici que le lancement d'un cook lit s'il a
// le droit de partir, et que le chef lit pourquoi un ticket s'est arrêté.
import type { Base } from "../base.ts";
import type { FaitGardeFous, MotifArret, Plafonds } from "../evenements/garde-fous.ts";
import { definirProjection } from "../projection.ts";

export type EtatGardeFous = {
  // Inconnus tant qu'aucun runtime n'a démarré avec ses garde-fous.
  limits: Plafonds | null;
  breakerThreshold: number | null;
  // Échecs d'affilée depuis la dernière réussite ou le dernier « reprendre ».
  failures: number;
  // Non nuls : le disjoncteur est ouvert, la cuisine est arrêtée par le chef.
  breakerOpenedAt: string | null;
  stoppedAt: string | null;
};

export type CookEnCours = { run: string; ticket: number | null; launchedAt: string; limits: Plafonds; stream: string };

// Le dernier relevé d'un cook : ce qu'il avait consommé à `at`.
export type Mesure = { run: string; at: string; turns: number; tokens: number };

export type Arret = {
  run: string;
  ticket: number | null;
  at: string;
  reason: MotifArret;
  limit: number | null;
  observed: number | null;
};

// L'état tient sur une seule ligne, créée au premier fait qui la touche.
const modifierEtat = (base: Base, affectation: string, ...parametres: Array<string | number | null>) => {
  base.executer("INSERT OR IGNORE INTO guard_state (id) VALUES (1)");
  base.executer(`UPDATE guard_state SET ${affectation} WHERE id = 1`, ...parametres);
};

export const gardeFous = definirProjection<FaitGardeFous>({
  nom: "garde-fous",
  tables: ["guard_state", "cook_runs", "cook_progress"],
  schema: `
    CREATE TABLE IF NOT EXISTS guard_state (
      id                INTEGER PRIMARY KEY CHECK (id = 1),
      limits            TEXT,
      breaker_threshold INTEGER,
      failures          INTEGER NOT NULL DEFAULT 0,
      breaker_opened_at TEXT,
      stopped_at        TEXT
    ) STRICT;
    CREATE TABLE IF NOT EXISTS cook_runs (
      run          TEXT PRIMARY KEY,
      ticket       INTEGER,
      launched_seq INTEGER NOT NULL,
      launched_at  TEXT NOT NULL,
      limits       TEXT NOT NULL,
      stream       TEXT NOT NULL,
      tripped_seq  INTEGER,
      tripped_at   TEXT,
      reason       TEXT,
      limit_value  INTEGER,
      observed     INTEGER,
      ended_seq    INTEGER,
      ended_at     TEXT,
      ending       TEXT,
      relaunch     INTEGER NOT NULL DEFAULT 0
    ) STRICT;
    CREATE TABLE IF NOT EXISTS cook_progress (
      run    TEXT PRIMARY KEY,
      at     TEXT NOT NULL,
      turns  INTEGER NOT NULL,
      tokens INTEGER NOT NULL
    ) STRICT;
  `,
  sur: {
    "guard.configured": (base, evenement) => {
      modifierEtat(
        base,
        "limits = ?, breaker_threshold = ?",
        JSON.stringify(evenement.payload.limits),
        evenement.payload.breakerThreshold,
      );
    },
    "cook.launched": (base, evenement) => {
      base.executer(
        "INSERT INTO cook_runs (run, ticket, launched_seq, launched_at, limits, stream, relaunch) VALUES (?, ?, ?, ?, ?, ?, ?)",
        evenement.payload.run,
        evenement.ticket,
        evenement.seq,
        evenement.at,
        JSON.stringify(evenement.payload.limits),
        evenement.payload.stream,
        evenement.payload.relaunch === true ? 1 : 0,
      );
    },
    "cook.progressed": (base, evenement) => {
      const { run, turns, tokens } = evenement.payload;
      base.executer("INSERT OR REPLACE INTO cook_progress (run, at, turns, tokens) VALUES (?, ?, ?, ?)", run, evenement.at, turns, tokens);
    },
    "guard.tripped": (base, evenement) => {
      base.executer(
        "UPDATE cook_runs SET tripped_seq = ?, tripped_at = ?, reason = ?, limit_value = ?, observed = ? WHERE run = ?",
        evenement.seq,
        evenement.at,
        evenement.payload.reason,
        evenement.payload.limit,
        evenement.payload.observed,
        evenement.payload.run,
      );
    },
    "cook.exited": (base, evenement) => {
      const { run, outcome } = evenement.payload;
      base.executer("UPDATE cook_runs SET ended_seq = ?, ended_at = ?, ending = ? WHERE run = ?", evenement.seq, evenement.at, outcome, run);
      // Une relance du manager qui livre n'a encore rien réussi : la pass le dira.
      const relance = base.lire<{ relaunch: number }>("SELECT relaunch FROM cook_runs WHERE run = ?", run)[0]?.relaunch === 1;
      if (outcome === "ok" && !relance) modifierEtat(base, "failures = 0");
      if (outcome === "failed" || outcome === "guard") modifierEtat(base, "failures = failures + 1");
    },
    "cook.interrupted": (base, evenement) => {
      base.executer(
        "UPDATE cook_runs SET ended_seq = ?, ended_at = ?, ending = 'interrupted' WHERE run = ?",
        evenement.seq,
        evenement.at,
        evenement.payload.run,
      );
    },
    "relaunch.judged": (base, evenement) => {
      modifierEtat(base, evenement.payload.verdict === "green" ? "failures = 0" : "failures = failures + 1");
    },
    "breaker.opened": (base, evenement) => modifierEtat(base, "breaker_opened_at = ?", evenement.at),
    "kitchen.stopped": (base, evenement) => modifierEtat(base, "stopped_at = ?", evenement.at),
    "kitchen.resumed": (base) => modifierEtat(base, "failures = 0, breaker_opened_at = NULL, stopped_at = NULL"),
  },
});

export function etatDesGardeFous(base: Base): EtatGardeFous {
  const ligne = base.lire<{
    limits: string | null;
    breakerThreshold: number | null;
    failures: number;
    breakerOpenedAt: string | null;
    stoppedAt: string | null;
  }>(
    `SELECT limits, breaker_threshold AS breakerThreshold, failures,
            breaker_opened_at AS breakerOpenedAt, stopped_at AS stoppedAt
     FROM guard_state WHERE id = 1`,
  )[0];
  if (!ligne) return { limits: null, breakerThreshold: null, failures: 0, breakerOpenedAt: null, stoppedAt: null };
  return { ...ligne, limits: ligne.limits === null ? null : JSON.parse(ligne.limits) };
}

// Les lancements sans fin au journal : les cooks qui tournent, ou ceux qui
// sont morts avec le runtime.
export function cooksEnCours(base: Base): CookEnCours[] {
  return base
    .lire<{ run: string; ticket: number | null; launchedAt: string; limits: string; stream: string }>(
      `SELECT run, ticket, launched_at AS launchedAt, limits, stream
       FROM cook_runs WHERE ended_seq IS NULL ORDER BY launched_seq`,
    )
    .map((ligne) => ({ ...ligne, limits: JSON.parse(ligne.limits) }));
}

// Le dernier relevé de chaque cook en cours qui en a un.
export function mesuresDesCooksEnCours(base: Base): Mesure[] {
  return base.lire<Mesure>(
    `SELECT p.run, p.at, p.turns, p.tokens
     FROM cook_progress p JOIN cook_runs r ON r.run = p.run WHERE r.ended_seq IS NULL`,
  );
}

// Les derniers arrêts provoqués par un garde-fou, le plus récent d'abord.
export function arretsRecents(base: Base, combien: number): Arret[] {
  return base.lire<Arret>(
    `SELECT run, ticket, tripped_at AS at, reason, limit_value AS "limit", observed
     FROM cook_runs WHERE tripped_seq IS NOT NULL ORDER BY tripped_seq DESC LIMIT ?`,
    combien,
  );
}
