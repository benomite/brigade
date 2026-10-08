// La pass : pour chaque ticket livré, où en est son jugement, et combien de
// renvois il a consommés. Et le grant `merge` : son état, chacun de ses usages.
// C'est ici que la pass lit ce qu'il lui reste à faire — donc ce qui était en
// cours se retrouve après un redémarrage — et que le chef lit « pourquoi ce
// code est-il sur la base ? ».
import type { Base } from "../base.ts";
import type { FaitGardeFous } from "../evenements/garde-fous.ts";
import type { ActionDeGrant, FaitPass, Finding, Verdict } from "../evenements/pass.ts";
import type { FaitRail } from "../evenements/rail.ts";
import type { FaitStation } from "../evenements/station.ts";
import { definirProjection } from "../projection.ts";

// `cooking` : un cook travaille. `delivered` : il a livré, rien n'est jugé.
// `judging` : gates ou CI en cours. `green` / `red` : jugé, pas encore décidé.
// `merging` : l'intention de merger est écrite, pas son résultat. `served` :
// verte et sans diff — servie sans merge. `deferred` : rouge, entre les mains
// du manager. `replaying` : verte, la base a avancé sur ses fichiers — les
// gates se rejouent sur le résultat du merge. `waiting` : verte, sous grant,
// et pas mergée pour l'instant — `reason` dit ce qu'elle attend.
export type Phase =
  | "cooking"
  | "delivered"
  | "judging"
  | "green"
  | "red"
  | "replaying"
  | "waiting"
  | "merging"
  | "merged"
  | "served"
  | "held"
  | "returned"
  | "deferred"
  | "escalated";

// La dernière relecture du reviewer : la livraison qu'elle a lue (`cook`, le
// run du cook, et `sha`), et ce qu'il en a dit.
export type Relue = {
  cook: string;
  sha: string;
  run: string;
  outcome: "green" | "red" | "unreadable";
  summary: string | null;
  findings: Finding[];
  reason: string | null;
};

export type PassDeTicket = {
  ticket: number;
  // La livraison : le dernier run, sa branche, son worktree (relatif au
  // répertoire d'état), sa PR.
  run: string;
  branch: string | null;
  worktree: string | null;
  pr: string | null;
  number: number | null;
  phase: Phase;
  since: string;
  // Depuis quand la pass juge cette livraison : c'est de là que se compte
  // l'attente de la CI.
  startedAt: string | null;
  // Le dernier verdict, et le commit qu'il juge.
  verdict: Verdict | null;
  verdictSeq: number | null;
  sha: string | null;
  judgeModified: boolean;
  // Le ticket n'a produit aucun diff : son verdict ne tient qu'au reviewer.
  noDiff: boolean;
  findings: string[];
  review: Relue | null;
  // Les renvois consommés.
  returns: number;
  // Pourquoi la pass s'est arrêtée, a remonté, ou attend.
  reason: string | null;
  // La base telle qu'elle était quand la pass l'a vue avancer sous ce verdict,
  // et celle sur laquelle le résultat du merge a été rejoué vert.
  movedBase: string | null;
  checkedBase: string | null;
  // La pass a choisi de la merger sans rejeu, sur une base qui avait avancé.
  unverified: boolean;
};

// Ce que le dernier contrôle de la base a dit, et les tickets dont il
// vérifiait le merge.
export type EtatDeLaBase = { sha: string; outcome: "green" | "red" | "skipped"; at: string; tickets: number[] };

export type Grant = { action: string; active: boolean; since: string; by: string };

export type UsageDeGrant = {
  seq: number;
  at: string;
  ticket: number | null;
  action: string;
  pr: string;
  sha: string;
  base: string;
  verdict: number;
  // `done`, `failed`, ou rien tant que le résultat n'est pas écrit.
  outcome: string | null;
};

type Ecoutes =
  | FaitPass
  | Extract<FaitGardeFous, { type: "cook.launched" }>
  | Extract<FaitStation, { type: "cook.reported" }>
  | Extract<FaitRail, { type: "ticket.left" }>;

const texte = (valeur: unknown): valeur is string => typeof valeur === "string" && valeur !== "";
const texteOuRien = (valeur: unknown) => (texte(valeur) ? valeur : null);
const entierOuRien = (valeur: unknown) => (Number.isSafeInteger(valeur) ? (valeur as number) : null);
const liste = (valeur: unknown) => JSON.stringify(Array.isArray(valeur) ? valeur.filter(texte) : []);
// Les constats d'une relecture : ce qui n'en a pas la forme n'en est pas un.
const constats = (valeur: unknown): Finding[] =>
  (Array.isArray(valeur) ? valeur : []).flatMap((brut) => {
    const { severity, file, text } = (brut !== null && typeof brut === "object" ? brut : {}) as Record<string, unknown>;
    return (severity === "blocking" || severity === "remark") && texte(text) ? [{ severity, file: texteOuRien(file), text }] : [];
  });

const passer = (base: Base, ticket: number | null, at: string, phase: Phase, affectation = "", ...parametres: Array<string | number | null>) => {
  if (ticket === null) return;
  base.executer(`UPDATE pass SET phase = ?, since = ?${affectation === "" ? "" : `, ${affectation}`} WHERE ticket = ?`, phase, at, ...parametres, ticket);
};

const grant = (base: Base, action: unknown, active: number, at: string, by: string) => {
  if (!texte(action)) return;
  base.executer(
    `INSERT INTO grants (action, active, since, by) VALUES (?, ?, ?, ?)
     ON CONFLICT (action) DO UPDATE SET active = excluded.active, since = excluded.since, by = excluded.by`,
    action,
    active,
    at,
    by,
  );
};

// Le résultat d'un merge se range sur l'intention restée sans résultat.
const conclureUsage = (base: Base, ticket: number | null, outcome: string) => {
  base.executer("UPDATE grant_uses SET outcome = ? WHERE ticket IS ? AND outcome IS NULL", outcome, ticket);
};

export const pass = definirProjection<Ecoutes>({
  nom: "pass",
  tables: ["pass", "grants", "grant_uses", "base_checks", "base_suspects"],
  schema: `
    CREATE TABLE IF NOT EXISTS pass (
      ticket         INTEGER PRIMARY KEY,
      run            TEXT NOT NULL,
      branch         TEXT,
      worktree       TEXT,
      pr             TEXT,
      number         INTEGER,
      phase          TEXT NOT NULL,
      since          TEXT NOT NULL,
      started_at     TEXT,
      verdict        TEXT,
      verdict_seq    INTEGER,
      sha            TEXT,
      judge_modified INTEGER NOT NULL DEFAULT 0,
      no_diff        INTEGER NOT NULL DEFAULT 0,
      findings       TEXT NOT NULL DEFAULT '[]',
      review         TEXT,
      returns        INTEGER NOT NULL DEFAULT 0,
      reason         TEXT,
      moved_base     TEXT,
      checked_base   TEXT,
      unverified     INTEGER NOT NULL DEFAULT 0
    ) STRICT;
    CREATE TABLE IF NOT EXISTS base_checks (
      id      INTEGER PRIMARY KEY CHECK (id = 1),
      sha     TEXT NOT NULL,
      outcome TEXT NOT NULL,
      at      TEXT NOT NULL,
      tickets TEXT NOT NULL
    ) STRICT;
    CREATE TABLE IF NOT EXISTS base_suspects (
      ticket INTEGER PRIMARY KEY
    ) STRICT;
    CREATE TABLE IF NOT EXISTS grants (
      action TEXT PRIMARY KEY,
      active INTEGER NOT NULL,
      since  TEXT NOT NULL,
      by     TEXT NOT NULL
    ) STRICT;
    CREATE TABLE IF NOT EXISTS grant_uses (
      seq     INTEGER PRIMARY KEY,
      at      TEXT NOT NULL,
      ticket  INTEGER,
      action  TEXT NOT NULL,
      pr      TEXT NOT NULL,
      sha     TEXT NOT NULL,
      base    TEXT NOT NULL,
      verdict INTEGER NOT NULL,
      outcome TEXT
    ) STRICT;
  `,
  sur: {
    "grant.activated": (base, { at, author, payload }) => grant(base, payload.action, 1, at, author),
    "grant.revoked": (base, { at, author, payload }) => grant(base, payload.action, 0, at, author),
    // Un cook part sur le ticket. Relancé sur un renvoi — la même branche —, il
    // laisse la phase telle quelle : s'il échoue sans livrer, le renvoi reste à
    // faire. Sur une autre branche, c'est une livraison neuve : rien de ce qui
    // a été jugé (PR, commit) ne la concerne, et le renvoi n'a plus d'objet.
    "cook.launched": (base, { ticket, at, payload }) => {
      if (ticket === null || !texte(payload.run)) return;
      base.executer(
        `INSERT INTO pass (ticket, run, branch, worktree, phase, since) VALUES (?, ?, ?, ?, 'cooking', ?)
         ON CONFLICT (ticket) DO UPDATE SET
           run = excluded.run, branch = excluded.branch, worktree = excluded.worktree,
           phase = CASE WHEN phase = 'returned' AND branch IS excluded.branch THEN phase ELSE 'cooking' END,
           since = CASE WHEN phase = 'returned' AND branch IS excluded.branch THEN since ELSE excluded.since END,
           pr = CASE WHEN branch IS excluded.branch THEN pr ELSE NULL END,
           number = CASE WHEN branch IS excluded.branch THEN number ELSE NULL END,
           sha = CASE WHEN branch IS excluded.branch THEN sha ELSE NULL END`,
        ticket,
        payload.run,
        texteOuRien(payload.branch),
        texteOuRien(payload.worktree),
        at,
      );
    },
    "cook.reported": (base, { ticket, at, payload }) => {
      if (payload.ending !== "done") return;
      passer(base, ticket, at, "delivered", "pr = coalesce(?, pr), started_at = NULL, reason = NULL", texteOuRien(payload.pr));
    },
    "pass.started": (base, { ticket, at, payload }) => {
      passer(
        base,
        ticket,
        at,
        "judging",
        "pr = ?, number = ?, sha = ?, started_at = coalesce(started_at, ?)",
        texteOuRien(payload.pr),
        entierOuRien(payload.number),
        texteOuRien(payload.sha),
        at,
      );
    },
    // La relecture se range sur la livraison, sans en changer la phase : le
    // verdict, lui, attend peut-être encore la CI.
    "pass.reviewed": (base, { ticket, payload }) => {
      if (ticket === null || !texte(payload.run) || !texte(payload.sha) || !texte(payload.review)) return;
      const relue: Relue = {
        cook: payload.run,
        sha: payload.sha,
        run: payload.review,
        outcome: payload.outcome === "green" || payload.outcome === "red" ? payload.outcome : "unreadable",
        summary: texteOuRien(payload.summary),
        findings: constats(payload.findings),
        reason: texteOuRien(payload.reason),
      };
      base.executer("UPDATE pass SET review = ? WHERE ticket = ?", JSON.stringify(relue), ticket);
    },
    "pass.judged": (base, { ticket, at, seq, payload }) => {
      const verdict = payload.verdict === "green" ? "green" : "red";
      passer(
        base,
        ticket,
        at,
        verdict,
        // Un verdict neuf : ce qui a été vu de la base valait pour le précédent.
        "verdict = ?, verdict_seq = ?, sha = ?, judge_modified = ?, no_diff = ?, findings = ?, moved_base = NULL, checked_base = NULL, unverified = 0",
        verdict,
        seq,
        texteOuRien(payload.sha),
        payload.judgeModified === true ? 1 : 0,
        payload.noDiff === true ? 1 : 0,
        liste(payload.findings),
      );
    },
    "grant.used": (base, { ticket, at, seq, payload }) => {
      if (!texte(payload.action) || !texte(payload.pr) || !texte(payload.sha)) return;
      base.executer(
        "INSERT OR REPLACE INTO grant_uses (seq, at, ticket, action, pr, sha, base, verdict) VALUES (?, ?, ?, ?, ?, ?, ?, ?)",
        seq,
        at,
        ticket,
        payload.action,
        payload.pr,
        payload.sha,
        texteOuRien(payload.base) ?? "",
        entierOuRien(payload.verdict) ?? 0,
      );
      passer(base, ticket, at, "merging");
    },
    // Un merge que rien n'a vérifié sur la base telle qu'elle était est à
    // vérifier après coup, sur la base elle-même. C'est le fait qui le dit :
    // un journal d'avant, rejoué, ne rend suspect aucun de ses vieux merges.
    "merge.done": (base, { ticket, at, payload }) => {
      conclureUsage(base, ticket, "done");
      if (ticket === null) return;
      if (payload.unverified === true) base.executer("INSERT OR IGNORE INTO base_suspects (ticket) VALUES (?)", ticket);
      passer(base, ticket, at, "merged", "reason = NULL, unverified = 0");
    },
    // La décision est à reprendre : le verdict tient toujours.
    "merge.failed": (base, { ticket, at }) => {
      conclureUsage(base, ticket, "failed");
      passer(base, ticket, at, "green");
    },
    "pass.served": (base, { ticket, at }) => passer(base, ticket, at, "served", "reason = NULL"),
    "pass.base-moved": (base, { ticket, at, payload }) => {
      const rejeu = payload.replay === true;
      passer(base, ticket, at, rejeu ? "replaying" : "green", "reason = NULL, moved_base = ?, unverified = ?", texteOuRien(payload.base), rejeu ? 0 : 1);
    },
    // Vertes, le verdict tient sur cette base-là. Sinon il devient rouge : la
    // décision est à reprendre, et ce sont ces findings qui repartent.
    "pass.replayed": (base, { ticket, at, payload }) => {
      if ((payload.gates as { outcome?: unknown } | undefined)?.outcome === "green") {
        passer(base, ticket, at, "green", "reason = NULL, checked_base = ?", texteOuRien(payload.base));
      } else passer(base, ticket, at, "red", "reason = NULL, verdict = 'red', findings = ?", liste(payload.findings));
    },
    "pass.outdated": (base, { ticket, at, payload }) => passer(base, ticket, at, "red", "reason = NULL, verdict = 'red', findings = ?", liste(payload.findings)),
    "pass.waiting": (base, { ticket, at, payload }) => passer(base, ticket, at, "waiting", "reason = ?", texteOuRien(payload.reason)),
    "base.checked": (base, { at, payload }) => {
      if (!texte(payload.sha)) return;
      const tickets = (Array.isArray(payload.tickets) ? payload.tickets : []).filter((ticket) => Number.isSafeInteger(ticket));
      const outcome = payload.outcome === "green" || payload.outcome === "skipped" ? payload.outcome : "red";
      base.executer(
        `INSERT INTO base_checks (id, sha, outcome, at, tickets) VALUES (1, ?, ?, ?, ?)
         ON CONFLICT (id) DO UPDATE SET sha = excluded.sha, outcome = excluded.outcome, at = excluded.at, tickets = excluded.tickets`,
        payload.sha,
        outcome,
        at,
        JSON.stringify(tickets),
      );
      for (const ticket of tickets) base.executer("DELETE FROM base_suspects WHERE ticket = ?", ticket);
    },
    "pass.held": (base, { ticket, at, payload }) => passer(base, ticket, at, "held", "reason = ?", texteOuRien(payload.reason)),
    "pass.returned": (base, { ticket, at, payload }) => {
      passer(base, ticket, at, "returned", "returns = ?, findings = ?, started_at = NULL", entierOuRien(payload.n) ?? 0, liste(payload.findings));
    },
    "pass.deferred": (base, { ticket, at }) => passer(base, ticket, at, "deferred"),
    "pass.escalated": (base, { ticket, at, payload }) => passer(base, ticket, at, "escalated", "reason = ?", texteOuRien(payload.reason)),
    // Le ticket quitte le rail : sa pass n'a plus d'objet. Les usages du grant,
    // eux, restent.
    "ticket.left": (base, { ticket }) => {
      if (ticket !== null) base.executer("DELETE FROM pass WHERE ticket = ?", ticket);
    },
  },
});

const COLONNES = `ticket, run, branch, worktree, pr, number, phase, since, started_at AS startedAt, verdict,
  verdict_seq AS verdictSeq, sha, judge_modified AS judgeModified, no_diff AS noDiff, findings, review, returns, reason,
  moved_base AS movedBase, checked_base AS checkedBase, unverified`;

type Ligne = Omit<PassDeTicket, "judgeModified" | "noDiff" | "findings" | "review" | "unverified"> & {
  judgeModified: number;
  noDiff: number;
  findings: string;
  review: string | null;
  unverified: number;
};

const lire = (ligne: Ligne): PassDeTicket => ({
  ...ligne,
  judgeModified: ligne.judgeModified === 1,
  noDiff: ligne.noDiff === 1,
  unverified: ligne.unverified === 1,
  findings: JSON.parse(ligne.findings),
  review: ligne.review === null ? null : JSON.parse(ligne.review),
});

// Les tickets que la pass connaît, dans l'ordre de leurs numéros.
export function lirePass(base: Base): PassDeTicket[] {
  return base.lire<Ligne>(`SELECT ${COLONNES} FROM pass ORDER BY ticket`).map(lire);
}

export function passDuTicket(base: Base, ticket: number): PassDeTicket | null {
  const ligne = base.lire<Ligne>(`SELECT ${COLONNES} FROM pass WHERE ticket = ?`, ticket)[0];
  return ligne ? lire(ligne) : null;
}

// Le renvoi qu'un ticket attend : la pass l'a jugé rouge et rendu au rail, et
// aucun cook n'a encore livré depuis.
export function renvoiEnAttente(base: Base, ticket: number): (PassDeTicket & { branch: string; worktree: string }) | null {
  const connu = passDuTicket(base, ticket);
  if (!connu || connu.phase !== "returned" || connu.branch === null || connu.worktree === null) return null;
  return { ...connu, branch: connu.branch, worktree: connu.worktree };
}

// Le dernier contrôle de la base, ou null si elle n'a jamais été contrôlée.
export function etatDeLaBase(base: Base): EtatDeLaBase | null {
  const ligne = base.lire<Omit<EtatDeLaBase, "tickets"> & { tickets: string }>("SELECT sha, outcome, at, tickets FROM base_checks")[0];
  return ligne ? { ...ligne, tickets: JSON.parse(ligne.tickets) } : null;
}

// Les tickets dont le merge reste à vérifier sur la base.
export function mergesAVerifier(base: Base): number[] {
  return base.lire<{ ticket: number }>("SELECT ticket FROM base_suspects ORDER BY ticket").map(({ ticket }) => ticket);
}

// L'état d'un grant, ou null s'il n'a jamais été donné.
export function etatDuGrant(base: Base, action: ActionDeGrant): Grant | null {
  const ligne = base.lire<Omit<Grant, "active"> & { active: number }>("SELECT action, active, since, by FROM grants WHERE action = ?", action)[0];
  return ligne ? { ...ligne, active: ligne.active === 1 } : null;
}

export function grantActif(base: Base, action: ActionDeGrant): boolean {
  return etatDuGrant(base, action)?.active === true;
}

// Les derniers usages du grant, le plus récent d'abord.
export function usagesDuGrant(base: Base, combien: number): UsageDeGrant[] {
  return base.lire<UsageDeGrant>("SELECT seq, at, ticket, action, pr, sha, base, verdict, outcome FROM grant_uses ORDER BY seq DESC LIMIT ?", combien);
}
