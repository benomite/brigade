// The guardrails state: the settings in force, the running cooks, the
// breaker and the "stop". This is where a cook launch reads whether it may
// start, and where the chief reads why a ticket stopped.
import { estGeste, type Activite } from "../activite.ts";
import type { Base } from "../base.ts";
import type { FaitGardeFous, MotifArret, Plafonds } from "../events/guardrails.ts";
import { definirProjection } from "../projection.ts";

export type EtatGardeFous = {
  // Unknown as long as no runtime has started with its guardrails.
  limits: Plafonds | null;
  breakerThreshold: number | null;
  // Consecutive failures, counted in launch order: those of the cooks
  // launched after the last cook that succeeded, since the last "resume".
  failures: number;
  // Non-null: the breaker is open, the kitchen is stopped by the chief.
  breakerOpenedAt: string | null;
  stoppedAt: string | null;
};

export type CookEnCours = { run: string; ticket: number | null; launchedAt: string; limits: Plafonds; stream: string };

// A cook's last reading: what it had used up at `at`.
export type Mesure = { run: string; at: string; turns: number; tokens: number };

// What a set of launches used up. `reviews`, `judgments`: among them, the
// reviewer's reviews and the manager's judgments.
export type Consommation = { runs: number; reviews: number; judgments: number; turns: number; tokens: number };

export type Arret = {
  run: string;
  ticket: number | null;
  at: string;
  reason: MotifArret;
  limit: number | null;
  observed: number | null;
};

// The state fits on a single row, created at the first event that touches it.
const modifierEtat = (base: Base, affectation: string, ...parametres: Array<string | number | null>) => {
  base.executer("INSERT OR IGNORE INTO guard_state (id) VALUES (1)");
  base.executer(`UPDATE guard_state SET ${affectation} WHERE id = 1`, ...parametres);
};

// What a cook tells the breaker, and the count that follows. With several
// cooks the endings interleave: "consecutive" is therefore counted in launch
// order. A success only clears the failures of cooks launched before it — an
// old cook that ends well says nothing about those that left after it.
// A failure judged before the last "resume" no longer counts.
const juger = (base: Base, run: string, verdict: "good" | "bad", seq: number) => {
  base.executer("UPDATE cook_runs SET judgment = ?, judged_seq = ? WHERE run = ?", verdict, seq, run);
  modifierEtat(
    base,
    `failures = (
       SELECT count(*) FROM cook_runs
       WHERE judgment = 'bad'
         AND judged_seq > (SELECT resumed_seq FROM guard_state WHERE id = 1)
         AND launched_seq > coalesce((SELECT max(launched_seq) FROM cook_runs WHERE judgment = 'good'), 0)
     )`,
  );
};

export const gardeFous = definirProjection<FaitGardeFous>({
  nom: "garde-fous",
  tables: ["guard_state", "cook_runs", "cook_progress", "cook_activity"],
  schema: `
    CREATE TABLE IF NOT EXISTS guard_state (
      id                INTEGER PRIMARY KEY CHECK (id = 1),
      limits            TEXT,
      breaker_threshold INTEGER,
      failures          INTEGER NOT NULL DEFAULT 0,
      resumed_seq       INTEGER NOT NULL DEFAULT 0,
      breaker_opened_at TEXT,
      stopped_at        TEXT
    ) STRICT;
    CREATE TABLE IF NOT EXISTS cook_runs (
      run          TEXT PRIMARY KEY,
      ticket       INTEGER,
      station      TEXT,
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
      turns        INTEGER,
      tokens       INTEGER,
      relaunch     INTEGER NOT NULL DEFAULT 0,
      resumed_seq  INTEGER,
      judgment     TEXT,
      judged_seq   INTEGER
    ) STRICT;
    CREATE TABLE IF NOT EXISTS cook_progress (
      run    TEXT PRIMARY KEY,
      at     TEXT NOT NULL,
      turns  INTEGER NOT NULL,
      tokens INTEGER NOT NULL
    ) STRICT;
    CREATE TABLE IF NOT EXISTS cook_activity (
      run    TEXT PRIMARY KEY,
      doing  TEXT NOT NULL,
      target TEXT,
      since  TEXT NOT NULL
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
        "INSERT INTO cook_runs (run, ticket, station, launched_seq, launched_at, limits, stream, relaunch) VALUES (?, ?, ?, ?, ?, ?, ?, ?)",
        evenement.payload.run,
        evenement.ticket,
        typeof evenement.payload.station === "string" ? evenement.payload.station : null,
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
      // Ce qu'il fait n'est gardé que s'il a la forme d'une activité : un mot
      // de la liste, une heure, une cible ou rien. Le dernier relevé qui en dit
      // une fait foi ; un relevé muet laisse la précédente.
      const activite: unknown = evenement.payload.activity;
      if (typeof activite !== "object" || activite === null) return;
      const { doing, target, since } = activite as Record<string, unknown>;
      if (!estGeste(doing) || typeof since !== "string" || Number.isNaN(Date.parse(since)) || !(target === null || typeof target === "string")) return;
      base.executer("INSERT OR REPLACE INTO cook_activity (run, doing, target, since) VALUES (?, ?, ?, ?)", run, doing, target, since);
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
      const { run, outcome, turns, tokens } = evenement.payload;
      const entier = (valeur: unknown) => (Number.isSafeInteger(valeur) ? (valeur as number) : null);
      base.executer(
        "UPDATE cook_runs SET ended_seq = ?, ended_at = ?, ending = ?, turns = ?, tokens = ? WHERE run = ?",
        evenement.seq,
        evenement.at,
        outcome,
        entier(turns),
        entier(tokens),
        run,
      );
      // Une relance du manager qui livre n'a encore rien réussi : la pass le dira.
      const relance = base.lire<{ relaunch: number }>("SELECT relaunch FROM cook_runs WHERE run = ?", run)[0]?.relaunch === 1;
      if (outcome === "ok" && !relance) juger(base, run, "good", evenement.seq);
      if (outcome === "failed" || outcome === "guard") juger(base, run, "bad", evenement.seq);
    },
    "cook.interrupted": (base, evenement) => {
      base.executer(
        "UPDATE cook_runs SET ended_seq = ?, ended_at = ?, ending = 'interrupted' WHERE run = ?",
        evenement.seq,
        evenement.at,
        evenement.payload.run,
      );
    },
    // Le cook repris reste en cours : rien ne change dans ce qui se compte.
    // Seule la vie qui le reprend est notée — c'est elle qui range son worktree.
    "cook.resumed": (base, evenement) => {
      base.executer("UPDATE cook_runs SET resumed_seq = ? WHERE run = ?", evenement.seq, evenement.payload.run);
    },
    "relaunch.judged": (base, evenement) => {
      juger(base, evenement.payload.run, evenement.payload.verdict === "green" ? "good" : "bad", evenement.seq);
    },
    "breaker.opened": (base, evenement) => modifierEtat(base, "breaker_opened_at = ?", evenement.at),
    "kitchen.stopped": (base, evenement) => modifierEtat(base, "stopped_at = ?", evenement.at),
    "kitchen.resumed": (base, evenement) =>
      modifierEtat(base, "failures = 0, resumed_seq = ?, breaker_opened_at = NULL, stopped_at = NULL", evenement.seq),
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

// A failure that counts for the breaker: the cook, its ticket, how it
// ended. `code`: that of its exit, null if it died from a signal or a
// guardrail.
export type EchecDuDisjoncteur = { run: string; ticket: number | null; at: string; code: number | null; turns: number | null; tokens: number | null };

// The consecutive failures the breaker counts, in launch order: the same rule
// as `juger`.
export function echecsDuDisjoncteur(base: Base): EchecDuDisjoncteur[] {
  return base.lire<EchecDuDisjoncteur>(
    `SELECT r.run AS run, r.ticket AS ticket, coalesce(r.ended_at, r.launched_at) AS at, r.turns AS turns, r.tokens AS tokens,
            (SELECT json_extract(e.payload, '$.code') FROM events e
              WHERE e.type = 'cook.exited' AND json_extract(e.payload, '$.run') = r.run ORDER BY e.seq DESC LIMIT 1) AS code
     FROM cook_runs r
     WHERE r.judgment = 'bad'
       AND r.judged_seq > coalesce((SELECT resumed_seq FROM guard_state WHERE id = 1), 0)
       AND r.launched_seq > coalesce((SELECT max(launched_seq) FROM cook_runs WHERE judgment = 'good'), 0)
     ORDER BY r.launched_seq`,
  );
}

// The launches with no end in the log: the cooks that are running — those of
// this runtime, or those of a previous life that startup has not yet picked
// up —, or those that died with the runtime.
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

// Ce que fait chaque cook en cours, d'après son dernier relevé qui le dit.
export function activitesDesCooksEnCours(base: Base): Map<string, Activite> {
  const lignes = base.lire<{ run: string; doing: string; target: string | null; since: string }>(
    `SELECT a.run, a.doing, a.target, a.since FROM cook_activity a JOIN cook_runs r ON r.run = a.run WHERE r.ended_seq IS NULL`,
  );
  return new Map(lignes.flatMap(({ run, doing, target, since }) => (estGeste(doing) ? [[run, { doing, target, since }] as const] : [])));
}

// Le dernier cook lancé pour un ticket, et ce qu'il faisait à son dernier
// relevé. `endedAt` : sa fin, nulle tant qu'il tourne. `station` : celle qui
// l'a lancé — `reviewer` pour une relecture de la pass. `measured` : un relevé
// en a été écrit. `activity` : nulle quand aucun relevé n'a dit ce qu'il fait.
export type DernierCook = { run: string; ticket: number; station: string | null; launchedAt: string; endedAt: string | null; measured: boolean; activity: Activite | null };

// The last cook of each ticket that had one.
export function derniersCooks(base: Base): Map<number, DernierCook> {
  // SQLite takes the bare columns from the row holding the max.
  const lignes = base.lire<{ run: string; ticket: number; station: string | null; launchedAt: string; endedAt: string | null; measured: number; doing: string | null; target: string | null; since: string | null }>(
    `SELECT r.run, r.ticket, r.station, r.launched_at AS launchedAt, r.ended_at AS endedAt, p.run IS NOT NULL AS measured,
            a.doing, a.target, a.since, max(r.launched_seq)
     FROM cook_runs r LEFT JOIN cook_progress p ON p.run = r.run LEFT JOIN cook_activity a ON a.run = r.run
     WHERE r.ticket IS NOT NULL GROUP BY r.ticket`,
  );
  return new Map(
    lignes.map(({ run, ticket, station, launchedAt, endedAt, measured, doing, target, since }) => [
      ticket,
      { run, ticket, station, launchedAt, endedAt, measured: measured === 1, activity: estGeste(doing) && since !== null ? { doing, target, since } : null },
    ]),
  );
}

// Le dernier run dont le nom commence ainsi — la dernière relecture d'un
// ticket, que la pass lance hors ticket : quand il est parti, quand il a fini.
export function dernierRunNomme(base: Base, debut: string): { run: string; launchedAt: string; endedAt: string | null } | null {
  return (
    base.lire<{ run: string; launchedAt: string; endedAt: string | null }>(
      `SELECT run, launched_at AS launchedAt, ended_at AS endedAt FROM cook_runs
       WHERE substr(run, 1, length(?)) = ? ORDER BY launched_seq DESC LIMIT 1`,
      debut,
      debut,
    )[0] ?? null
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

// What the running cooks and those that finished since `since` used up — or
// only the running cooks, without `since`. Every launch counts: ticket cooks,
// reviews, judgments. A cook counts for everything it used up, at its end;
// running or dead with the runtime, for its last reading.
// `reviewer`, `manager`: the stations under which the pass and the manager
// launch their cooks.
export function consommation(base: Base, since: string | null = null): Consommation {
  const ligne = base.lire<Consommation>(
    `SELECT count(*) AS runs,
            coalesce(sum(r.station = 'reviewer'), 0) AS reviews,
            coalesce(sum(r.station = 'manager'), 0) AS judgments,
            coalesce(sum(coalesce(r.turns, p.turns, 0)), 0) AS turns,
            coalesce(sum(coalesce(r.tokens, p.tokens, 0)), 0) AS tokens
     FROM cook_runs r LEFT JOIN cook_progress p ON p.run = r.run
     WHERE r.ended_seq IS NULL OR (? IS NOT NULL AND r.ended_at >= ?)`,
    since,
    since,
  )[0];
  return ligne ?? { runs: 0, reviews: 0, judgments: 0, turns: 0, tokens: 0 };
}

// A cook's raw stream, relative to the state directory, and whether it
// delivered — the `ok` ending, which its station gives to the cook whose work
// it sends to the pass. Null if the log does not know this cook.
export function fluxDuCook(base: Base, run: string): { stream: string; livre: boolean } | null {
  const ligne = base.lire<{ stream: string; ending: string | null }>("SELECT stream, ending FROM cook_runs WHERE run = ?", run)[0];
  return ligne ? { stream: ligne.stream, livre: ligne.ending === "ok" } : null;
}
