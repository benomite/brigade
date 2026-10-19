// The pass: for each delivered ticket, where its judgement stands and how many
// returns it has consumed. And the `merge` grant: its state, each of its uses.
// This is where the pass reads what it still has to do — so what was in
// progress is found again after a restart — and where the chef reads "why is
// this code on the base?".
import type { Base } from "../base.ts";
import type { FaitGardeFous } from "../events/guardrails.ts";
import { motifDArret, motifDeRemontee, SANS_GRANT, type ActionDeGrant, type CauseDExtinction, type FaitPass, type Finding, type Gates, type Verdict } from "../events/pass.ts";
import type { FaitRail } from "../events/rail.ts";
import type { FaitStation } from "../events/station.ts";
import { definirProjection } from "../projection.ts";

// `cooking`: a cook is working. `delivered`: it delivered, nothing is judged.
// `judging`: gates or CI running. `green` / `red`: judged, not yet decided.
// `merging`: the intent to merge is written, not its result. `served`: green
// and without a diff — served without a merge. `deferred`: red, in the
// manager's hands. `waiting`: neither judged nor merged for now — `reason`
// says what it awaits. `closed`: its PR was closed without a merge — `reason`
// stays that of the phase it left.
export type Phase =
  | "cooking"
  | "delivered"
  | "judging"
  | "green"
  | "red"
  | "waiting"
  | "merging"
  | "merged"
  | "served"
  | "held"
  | "returned"
  | "deferred"
  | "escalated"
  | "closed";

// The reviewer's latest review: the delivery it read (`cook`, the cook's run,
// and `sha`), and what it said about it.
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
  // The ticket — or, off the rail, the number of the delivery's PR.
  ticket: number;
  // A delivery the rail does not carry: the PR of a closing pass.
  horsRail: boolean;
  // The delivery: the latest run, its branch, its worktree (relative to the
  // state directory), its PR.
  run: string;
  branch: string | null;
  worktree: string | null;
  pr: string | null;
  number: number | null;
  phase: Phase;
  since: string;
  // Since when the pass has been judging this delivery: the CI wait is counted
  // from there.
  startedAt: string | null;
  // The latest verdict, and what it judges: the branch's commit, the head of
  // the base it was merged with, and the resulting tree.
  verdict: Verdict | null;
  verdictSeq: number | null;
  sha: string | null;
  judgedBase: string | null;
  judgedTree: string | null;
  judgeModified: boolean;
  // The project's declarations (network, secrets) that the delivery touches.
  declarations: string[];
  // The ticket produced no diff: its verdict rests on the reviewer alone.
  noDiff: boolean;
  findings: string[];
  review: Relue | null;
  // The returns consumed.
  returns: number;
  // Why the pass stopped, escalated, or waits — the reason, the one in the
  // chef's gesture; and `cause`, what refines it without changing the gesture.
  reason: string | null;
  cause: string | null;
  // Stopped for lack of a grant: the instant it had expired by itself, if it had.
  grantExpired: string | null;
};

// A delivery that its ticket left behind on leaving the rail without it being
// merged, and about which the pass has not yet said anything. `verdict`: that
// delivery's, null if it was not judged. `reason`, `seq`: the departure.
export type Orpheline = { ticket: number; branch: string; pr: string | null; verdict: Verdict | null; reason: string; seq: number };

// What the latest check of the base said, and the tickets whose merge it was
// verifying.
export type EtatDeLaBase = {
  sha: string;
  outcome: "green" | "red" | "skipped";
  at: string;
  tickets: number[];
  // Red: since when it has been, from one red check to the next.
  redSince: string | null;
  // Red: the latest check that could not be played since. It lifted nothing
  // — one does not come back from red for lack of being able to verify.
  unplayed: { sha: string; at: string } | null;
  // Why the latest unplayed check — this one, or `unplayed` under a red — was
  // not played: the attempt did not happen. Null: the tree has no gates, or
  // everything was played.
  reason: string | null;
  // Red: the requested replay, as long as no check has served it — by the
  // chef, or by the pass itself, which replays once on its own when all is red
  // (`by`). `heldAt`: the machine has withheld it since that instant.
  recheck: { at: string; heldAt: string | null; by: string } | null;
};

// A counted red: how many played checks have observed it since it began to
// last, whether a replay has already been requested for it, and the number of
// the latest played check. A red observed twice stands: it was not transient.
export type RougeCompte = { redChecks: number; replayed: boolean; checkedSeq: number };

// The repair ticket that a red base gave birth to. `redSince`: the red it was
// born for. `failures`: what the base's gates reported as failing. `etat`:
// `en-cours` as long as it is neither served nor gone; `servie` once its
// delivery is merged, as long as nothing says it did not repair; `echouee` if
// it left the rail without being served, if it escalated to the chef, or if
// the base, checked after its merge, stayed red — `echec` says which, null as
// long as it has not failed.
export type ReparationDeLaBase = {
  ticket: number;
  at: string;
  sha: string;
  redSince: string | null;
  failures: string[];
  etat: "en-cours" | "servie" | "echouee";
  echec: EchecDeReparation | null;
};
export type EchecDeReparation = "partie" | "remontee" | "rouge-apres-merge";

// The base check that the pass cannot start: the base cannot be fetched since
// `at`, and `reason` is what git said about it.
export type ControleRetenu = { at: string; reason: string };

// A grant as it stands at the time it is read. `since`: since when it has been
// in this state — granted, revoked, expired. `by`: who granted or revoked
// it.
export type Grant = {
  action: string;
  active: boolean;
  since: string;
  by: string;
  // Its limits: the instant it expires, the uses it has left. Null, it has
  // none.
  until: string | null;
  usesLeft: number | null;
  // The merges in flight: an intent written, no result yet. Each one holds
  // one of the remaining uses.
  reserved: number;
  // Inactive: the chef revoked it, or it expired by itself — and why.
  ended: "revoked" | "expired" | null;
  cause: CauseDExtinction | null;
  // Expired at read time, without the fact yet being in the log.
  unrecorded: boolean;
};

export type UsageDeGrant = {
  seq: number;
  at: string;
  ticket: number | null;
  action: string;
  pr: string;
  sha: string;
  base: string;
  verdict: number;
  // `done`, `failed`, or nothing as long as the result is not written.
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
// The findings of a review: what does not have their shape is not one.
export const constats = (valeur: unknown): Finding[] =>
  (Array.isArray(valeur) ? valeur : []).flatMap((brut) => {
    const { severity, file, text } = (brut !== null && typeof brut === "object" ? brut : {}) as Record<string, unknown>;
    return (severity === "blocking" || severity === "remark") && texte(text) ? [{ severity, file: texteOuRien(file), text }] : [];
  });

const passer = (base: Base, ticket: number | null, at: string, phase: Phase, affectation = "", ...parametres: Array<string | number | null>) => {
  if (ticket === null) return;
  base.executer(`UPDATE pass SET phase = ?, since = ?${affectation === "" ? "" : `, ${affectation}`} WHERE ticket = ?`, phase, at, ...parametres, ticket);
};

const instantOuRien = (valeur: unknown) => (texte(valeur) && !Number.isNaN(Date.parse(valeur)) ? new Date(valeur).toISOString() : null);
const usagesOuRien = (valeur: unknown) => (Number.isSafeInteger(valeur) && (valeur as number) > 0 ? (valeur as number) : null);

// The granted (`ended` null) or revoked grant. A written but unreadable limit
// does not make an unlimited grant: it is already reached.
const grant = (base: Base, seq: number, at: string, by: string, ended: "revoked" | null, payload: { action?: unknown; until?: unknown; uses?: unknown }) => {
  if (!texte(payload.action)) return;
  const accorde = ended === null;
  base.executer(
    `INSERT INTO grants (action, active, since, by, until, uses_left, ended, cause, granted_seq) VALUES (?, ?, ?, ?, ?, ?, ?, NULL, ?)
     ON CONFLICT (action) DO UPDATE SET active = excluded.active, since = excluded.since, by = excluded.by, until = excluded.until,
       uses_left = excluded.uses_left, ended = excluded.ended, cause = NULL, granted_seq = excluded.granted_seq`,
    payload.action,
    accorde ? 1 : 0,
    at,
    by,
    accorde && payload.until !== undefined ? (instantOuRien(payload.until) ?? at) : null,
    accorde && payload.uses !== undefined ? (usagesOuRien(payload.uses) ?? 0) : null,
    ended,
    seq,
  );
};

// A merge's result is filed onto the intent left without a result. Merged,
// it consumes a use of the grant under which the pass wanted it — not of a
// grant granted since —, whatever the count GitHub names: the pass had asked
// for this merge, and its answer may have been lost. A merge the pass did not
// want finds no intent, and consumes nothing.
const conclureUsage = (base: Base, ticket: number | null, outcome: "done" | "failed") => {
  if (outcome === "done") {
    base.executer(
      `UPDATE grants SET uses_left = uses_left - 1
       WHERE active = 1 AND uses_left > 0
         AND EXISTS (SELECT 1 FROM grant_uses WHERE ticket IS ? AND outcome IS NULL AND action = grants.action AND seq > grants.granted_seq)`,
      ticket,
    );
  }
  base.executer("UPDATE grant_uses SET outcome = ? WHERE ticket IS ? AND outcome IS NULL", outcome, ticket);
};

export const pass = definirProjection<Ecoutes>({
  nom: "pass",
  tables: ["pass", "pass_orphans", "grants", "grant_uses", "base_checks", "base_suspects", "base_holds", "base_repairs", "base_repair_opening"],
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
      judged_base    TEXT,
      judged_tree    TEXT,
      judge_modified INTEGER NOT NULL DEFAULT 0,
      declarations   TEXT NOT NULL DEFAULT '[]',
      no_diff        INTEGER NOT NULL DEFAULT 0,
      findings       TEXT NOT NULL DEFAULT '[]',
      review         TEXT,
      returns        INTEGER NOT NULL DEFAULT 0,
      reason         TEXT,
      cause          TEXT,
      grant_expired  TEXT,
      off_rail       INTEGER NOT NULL DEFAULT 0
    ) STRICT;
    -- Par branche : un ticket revenu puis reparti laisse deux livraisons.
    CREATE TABLE IF NOT EXISTS pass_orphans (
      branch  TEXT PRIMARY KEY,
      ticket  INTEGER NOT NULL,
      pr      TEXT,
      verdict TEXT,
      reason  TEXT NOT NULL,
      seq     INTEGER NOT NULL
    ) STRICT;
    CREATE TABLE IF NOT EXISTS base_checks (
      id      INTEGER PRIMARY KEY CHECK (id = 1),
      sha     TEXT NOT NULL,
      outcome TEXT NOT NULL,
      at      TEXT NOT NULL,
      tickets TEXT NOT NULL,
      red_since       TEXT,
      unplayed_sha    TEXT,
      unplayed_at     TEXT,
      unplayed_reason TEXT,
      recheck_at      TEXT,
      recheck_held_at TEXT,
      recheck_by      TEXT,
      red_checks      INTEGER NOT NULL DEFAULT 0,
      replayed        INTEGER NOT NULL DEFAULT 0,
      checked_seq     INTEGER NOT NULL DEFAULT 0
    ) STRICT;
    -- Les tickets de réparation nés d'une base rouge, et celui dont la
    -- création est annoncée sans être confirmée.
    CREATE TABLE IF NOT EXISTS base_repairs (
      ticket    INTEGER PRIMARY KEY,
      seq       INTEGER NOT NULL,
      at        TEXT NOT NULL,
      sha       TEXT NOT NULL,
      red_since TEXT,
      failures  TEXT NOT NULL
    ) STRICT;
    CREATE TABLE IF NOT EXISTS base_repair_opening (
      id  INTEGER PRIMARY KEY CHECK (id = 1),
      at  TEXT NOT NULL,
      sha TEXT NOT NULL
    ) STRICT;
    CREATE TABLE IF NOT EXISTS base_suspects (
      ticket INTEGER PRIMARY KEY
    ) STRICT;
    -- À part de base_checks : une base jamais contrôlée peut déjà ne pas se rapatrier.
    CREATE TABLE IF NOT EXISTS base_holds (
      id     INTEGER PRIMARY KEY CHECK (id = 1),
      at     TEXT NOT NULL,
      reason TEXT NOT NULL
    ) STRICT;
    CREATE TABLE IF NOT EXISTS grants (
      action TEXT PRIMARY KEY,
      active INTEGER NOT NULL,
      since  TEXT NOT NULL,
      by     TEXT NOT NULL,
      -- Ses limites, nulles s'il n'en a pas ; pourquoi il ne vaut plus ; et le
      -- fait qui l'a accordé : ses usages sont les intentions venues après.
      until       TEXT,
      uses_left   INTEGER,
      ended       TEXT,
      cause       TEXT,
      granted_seq INTEGER NOT NULL
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
    "grant.activated": (base, { seq, at, author, payload }) => grant(base, seq, at, author, null, payload),
    "grant.revoked": (base, { seq, at, author, payload }) => grant(base, seq, at, author, "revoked", payload),
    // A refusal grants nothing: the grants state keeps nothing of it.
    "grant.refused": () => {},
    // An extension only applies to an active grant, and changes only what it
    // names: `since` stays the instant it was granted.
    "grant.extended": (base, { payload }) => {
      const { action, until, uses } = payload as { action?: unknown; until?: unknown; uses?: unknown };
      if (!texte(action)) return;
      if (until === null) base.executer("UPDATE grants SET until = NULL WHERE action = ? AND active = 1", action);
      else if (instantOuRien(until) !== null) base.executer("UPDATE grants SET until = ? WHERE action = ? AND active = 1", instantOuRien(until), action);
      if (uses === null) base.executer("UPDATE grants SET uses_left = NULL WHERE action = ? AND active = 1", action);
      else if (usagesOuRien(uses) !== null) base.executer("UPDATE grants SET uses_left = uses_left + ? WHERE action = ? AND active = 1", usagesOuRien(uses), action);
    },
    "grant.expired": (base, { at, payload }) => {
      if (!texte(payload.action)) return;
      base.executer(
        "UPDATE grants SET active = 0, since = ?, ended = 'expired', cause = ? WHERE action = ? AND active = 1",
        instantOuRien(payload.since) ?? at,
        payload.cause === "uses" ? "uses" : "until",
        payload.action,
      );
    },
    // A cook leaves on the ticket. Relaunched on a return — the same branch —,
    // it leaves the phase as is: if it fails without delivering, the return is
    // still to be done. On another branch, it is a new delivery: nothing that
    // was judged (PR, commit) concerns it, and the return has no object left.
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
    // Off the rail, the delivery enters already delivered, with its PR.
    "pass.entered": (base, { ticket, at, payload }) => {
      if (ticket === null || !texte(payload.run) || !texte(payload.branch) || !texte(payload.pr)) return;
      base.executer(
        "INSERT OR REPLACE INTO pass (ticket, run, branch, pr, number, phase, since, off_rail) VALUES (?, ?, ?, ?, ?, 'delivered', ?, 1)",
        ticket,
        payload.run,
        payload.branch,
        payload.pr,
        entierOuRien(payload.number),
        at,
      );
    },
    "cook.reported": (base, { ticket, at, payload }) => {
      if (payload.ending !== "done") return;
      passer(base, ticket, at, "delivered", "pr = coalesce(?, pr), started_at = NULL, reason = NULL, cause = NULL", texteOuRien(payload.pr));
    },
    "pass.started": (base, { ticket, at, payload }) => {
      passer(
        base,
        ticket,
        at,
        "judging",
        // On another commit, the base of the last verdict says nothing any more.
        "pr = ?, number = ?, judged_base = CASE WHEN sha IS ? THEN judged_base ELSE NULL END, judged_tree = CASE WHEN sha IS ? THEN judged_tree ELSE NULL END, sha = ?, started_at = coalesce(started_at, ?)",
        texteOuRien(payload.pr),
        entierOuRien(payload.number),
        texteOuRien(payload.sha),
        texteOuRien(payload.sha),
        texteOuRien(payload.sha),
        at,
      );
    },
    // The PR is filed onto the delivery, without changing its phase.
    "pass.pr-opened": (base, { ticket, payload }) => {
      if (ticket === null || !texte(payload.pr)) return;
      base.executer("UPDATE pass SET pr = ?, number = ? WHERE ticket = ?", payload.pr, entierOuRien(payload.number), ticket);
    },
    // The review is filed onto the delivery, without changing its phase: the
    // verdict, for its part, may still be waiting for the CI.
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
        "verdict = ?, verdict_seq = ?, sha = ?, judged_base = ?, judged_tree = ?, judge_modified = ?, declarations = ?, no_diff = ?, findings = ?",
        verdict,
        seq,
        texteOuRien(payload.sha),
        texteOuRien(payload.base),
        texteOuRien(payload.merged),
        payload.judgeModified === true ? 1 : 0,
        liste(payload.declarations),
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
    // A merge that nothing judged on the base as it was is to be verified
    // afterwards, on the base itself. It is the fact that says so: a log from
    // before, replayed, makes none of its old merges suspect.
    "merge.done": (base, { ticket, at, payload }) => {
      conclureUsage(base, ticket, "done");
      if (ticket === null) return;
      if (payload.unverified === true) base.executer("INSERT OR IGNORE INTO base_suspects (ticket) VALUES (?)", ticket);
      passer(base, ticket, at, "merged", "reason = NULL, cause = NULL");
      // Off the rail, no `ticket.left` will come to remove it: merged, the
      // pass has nothing left to follow of it.
      base.executer("DELETE FROM pass WHERE ticket = ? AND off_rail = 1", ticket);
    },
    // The decision is to be taken again: the verdict still stands.
    "merge.failed": (base, { ticket, at }) => {
      conclureUsage(base, ticket, "failed");
      passer(base, ticket, at, "green");
    },
    "pass.served": (base, { ticket, at }) => passer(base, ticket, at, "served", "reason = NULL, cause = NULL"),
    // The verdict turns red: the decision is to be taken again, and these
    // findings are the ones that go back.
    "pass.outdated": (base, { ticket, at, payload }) => passer(base, ticket, at, "red", "reason = NULL, cause = NULL, verdict = 'red', findings = ?", liste(payload.findings)),
    "pass.waiting": (base, { ticket, at, payload }) => passer(base, ticket, at, "waiting", "reason = ?, cause = NULL", texteOuRien(payload.reason)),
    "base.checked": (base, { at, seq, payload }) => {
      if (!texte(payload.sha)) return;
      const verifies = (Array.isArray(payload.tickets) ? payload.tickets : []).filter((ticket) => Number.isSafeInteger(ticket));
      const outcome = payload.outcome === "green" || payload.outcome === "skipped" ? payload.outcome : "red";
      const rouge = base.lire<{ red_since: string | null; tickets: string; red_checks: number; replayed: number }>(
        "SELECT red_since, tickets, red_checks, replayed FROM base_checks WHERE outcome = 'red'",
      )[0];
      // A red that stays red keeps its attributed merges: a replay without a new merge does not erase them.
      const attribues: number[] = outcome === "red" && rouge ? JSON.parse(rouge.tickets) : [];
      const tickets = [...new Set([...attribues, ...verifies])];
      // Any check serves the requested replay.
      if (outcome === "skipped" && rouge) {
        // "I could not verify" is not "it is green": the red stays.
        base.executer(
          "UPDATE base_checks SET unplayed_sha = ?, unplayed_at = ?, unplayed_reason = ?, recheck_at = NULL, recheck_held_at = NULL, recheck_by = NULL",
          payload.sha,
          at,
          texteOuRien(payload.reason),
        );
      } else {
        // A red that lasts is counted; a new red starts again at one, and has not yet been replayed.
        const suite = outcome === "red" && rouge !== undefined;
        base.executer(
          `INSERT INTO base_checks (id, sha, outcome, at, tickets, red_since, unplayed_reason, red_checks, replayed, checked_seq) VALUES (1, ?, ?, ?, ?, ?, ?, ?, ?, ?)
           ON CONFLICT (id) DO UPDATE SET sha = excluded.sha, outcome = excluded.outcome, at = excluded.at, tickets = excluded.tickets,
             red_since = excluded.red_since, unplayed_sha = NULL, unplayed_at = NULL, unplayed_reason = excluded.unplayed_reason,
             recheck_at = NULL, recheck_held_at = NULL, recheck_by = NULL,
             red_checks = excluded.red_checks, replayed = excluded.replayed, checked_seq = excluded.checked_seq`,
          payload.sha,
          outcome,
          at,
          JSON.stringify(tickets),
          outcome === "red" ? (rouge?.red_since ?? at) : null,
          outcome === "skipped" ? texteOuRien(payload.reason) : null,
          outcome !== "red" ? 0 : suite ? rouge.red_checks + 1 : 1,
          suite ? rouge.replayed : 0,
          seq,
        );
        // A creation announced and never confirmed no longer holds for a green base.
        if (outcome === "green") base.executer("DELETE FROM base_repair_opening");
      }
      for (const ticket of tickets) base.executer("DELETE FROM base_suspects WHERE ticket = ?", ticket);
    },
    // A chef's request is tried at once, even on a base that could not be
    // fetched: if it still stumbles, it is said again — once.
    // A requested replay, by the chef or by the pass, counts as this red's
    // replay: the pass does not ask for it again by itself.
    "base.recheck-requested": (base, { at, author }) => {
      const { changements } = base.executer("UPDATE base_checks SET recheck_at = ?, recheck_held_at = NULL, recheck_by = ?, replayed = 1 WHERE outcome = 'red'", at, author);
      if (changements > 0) base.executer("DELETE FROM base_holds");
    },
    // The creation of a repair ticket is announced before the call to
    // GitHub, then confirmed: a runtime killed between the two finds it again.
    "base.repair-opening": (base, { at, payload }) => {
      if (!texte(payload.sha)) return;
      base.executer("INSERT INTO base_repair_opening (id, at, sha) VALUES (1, ?, ?) ON CONFLICT (id) DO UPDATE SET at = excluded.at, sha = excluded.sha", at, payload.sha);
    },
    "base.repair-opened": (base, { ticket, seq, at, payload }) => {
      if (ticket === null || !texte(payload.sha)) return;
      base.executer(
        `INSERT OR REPLACE INTO base_repairs (ticket, seq, at, sha, red_since, failures)
         VALUES (?, ?, ?, ?, (SELECT red_since FROM base_checks WHERE outcome = 'red'), ?)`,
        ticket,
        seq,
        at,
        payload.sha,
        liste(payload.failures),
      );
      base.executer("DELETE FROM base_repair_opening");
    },
    "base.recheck-held": (base, { at }) => {
      base.executer("UPDATE base_checks SET recheck_held_at = ? WHERE recheck_at IS NOT NULL", at);
    },
    // The first failure dates the hold: a second, with no resumption between
    // the two, does not make it younger — it only changes the reason, to the one that holds.
    "base.check-held": (base, { at, payload }) => {
      base.executer("INSERT INTO base_holds (id, at, reason) VALUES (1, ?, ?) ON CONFLICT (id) DO UPDATE SET reason = excluded.reason", at, texteOuRien(payload.reason) ?? "");
    },
    "base.check-resumed": (base) => {
      base.executer("DELETE FROM base_holds");
    },
    "pass.held": (base, { ticket, at, payload }) => {
      const { reason, cause } = motifDArret(payload);
      passer(base, ticket, at, "held", "reason = ?, cause = ?, grant_expired = ?", reason, cause, instantOuRien(payload.expired));
    },
    "pass.returned": (base, { ticket, at, payload }) => {
      passer(base, ticket, at, "returned", "returns = ?, findings = ?, started_at = NULL", entierOuRien(payload.n) ?? 0, liste(payload.findings));
    },
    "pass.deferred": (base, { ticket, at }) => passer(base, ticket, at, "deferred"),
    "pass.escalated": (base, { ticket, at, payload }) => {
      const { reason, cause } = motifDeRemontee(payload);
      passer(base, ticket, at, "escalated", "reason = ?, cause = ?", reason, cause);
    },
    // The reason stays: it says what the delivery was when its PR was closed.
    // Off the rail, the pass no longer follows it: no ticket would remove it.
    "pass.pr-closed": (base, { ticket, at, payload }) => {
      passer(base, ticket, at, "closed", "pr = coalesce(?, pr)", texteOuRien(payload.pr));
      base.executer("DELETE FROM pass WHERE ticket = ? AND off_rail = 1", ticket);
    },
    // The ticket leaves the rail: its pass has no object left. The grant's
    // uses, for their part, stay — and so does its delivery, if it is not
    // merged, until the pass has said what remains of it. A first cook still
    // taken has delivered nothing: its end is the station's business.
    "ticket.left": (base, { ticket, seq, payload }) => {
      if (ticket === null) return;
      base.executer(
        `INSERT OR REPLACE INTO pass_orphans (branch, ticket, pr, verdict, reason, seq)
         SELECT branch, ticket, pr, CASE WHEN phase IN ('cooking', 'delivered', 'judging') THEN NULL ELSE verdict END, ?, ?
         FROM pass
         WHERE ticket = ? AND branch IS NOT NULL AND phase NOT IN ('merged', 'served') AND NOT (phase = 'cooking' AND pr IS NULL)`,
        texteOuRien(payload.reason) ?? "",
        seq,
        ticket,
      );
      base.executer("DELETE FROM pass WHERE ticket = ?", ticket);
      // Gone without a delivery to let go of, nobody will say what becomes of
      // a merge intent left in flight: it gives its use back here.
      if (base.lire("SELECT 1 FROM pass_orphans WHERE ticket = ?", ticket).length === 0) conclureUsage(base, ticket, "failed");
    },
    // The pass lets go of the delivery of a ticket that left: a merge intent
    // left in flight finds its end here — consumed if GitHub says the PR is
    // merged, given back otherwise. It no longer holds a use of the grant.
    "pass.abandoned": (base, { ticket, payload }) => {
      base.executer("DELETE FROM pass_orphans WHERE branch IS ?", texteOuRien(payload.branch));
      conclureUsage(base, ticket, payload.merged === true ? "done" : "failed");
    },
  },
});

const COLONNES = `ticket, run, branch, worktree, pr, number, phase, since, started_at AS startedAt, verdict,
  verdict_seq AS verdictSeq, sha, judge_modified AS judgeModified, declarations, no_diff AS noDiff, findings, review, returns, reason, cause,
  grant_expired AS grantExpired, judged_base AS judgedBase, judged_tree AS judgedTree, off_rail AS horsRail`;

type Ligne = Omit<PassDeTicket, "horsRail" | "judgeModified" | "declarations" | "noDiff" | "findings" | "review"> & {
  horsRail: number;
  judgeModified: number;
  declarations: string;
  noDiff: number;
  findings: string;
  review: string | null;
};

const lire = (ligne: Ligne): PassDeTicket => ({
  ...ligne,
  horsRail: ligne.horsRail === 1,
  judgeModified: ligne.judgeModified === 1,
  declarations: JSON.parse(ligne.declarations),
  noDiff: ligne.noDiff === 1,
  findings: JSON.parse(ligne.findings),
  review: ligne.review === null ? null : JSON.parse(ligne.review),
});

// The tickets the pass knows, in the order of their numbers.
export function lirePass(base: Base): PassDeTicket[] {
  return base.lire<Ligne>(`SELECT ${COLONNES} FROM pass ORDER BY ticket`).map(lire);
}

export function passDuTicket(base: Base, ticket: number): PassDeTicket | null {
  const ligne = base.lire<Ligne>(`SELECT ${COLONNES} FROM pass WHERE ticket = ?`, ticket)[0];
  return ligne ? lire(ligne) : null;
}

// The return a ticket awaits: the pass judged it red and gave it back to the
// rail, and no cook has delivered since. Its delivery is a branch; its
// worktree is only known if its cook ran on this machine.
export function renvoiEnAttente(base: Base, ticket: number): (PassDeTicket & { branch: string }) | null {
  const connu = passDuTicket(base, ticket);
  if (!connu || connu.phase !== "returned" || connu.branch === null) return null;
  return { ...connu, branch: connu.branch };
}

// The deliveries left by a ticket that went away, about which the pass has not yet said anything.
export function orphelines(base: Base): Orpheline[] {
  return base.lire<Orpheline>("SELECT ticket, branch, pr, verdict, reason, seq FROM pass_orphans ORDER BY seq");
}

// The latest check of the base, or null if it was never checked.
export function etatDeLaBase(base: Base): EtatDeLaBase | null {
  const ligne = base.lire<{
    sha: string;
    outcome: EtatDeLaBase["outcome"];
    at: string;
    tickets: string;
    redSince: string | null;
    unplayedSha: string | null;
    unplayedAt: string | null;
    reason: string | null;
    recheckAt: string | null;
    recheckHeldAt: string | null;
    recheckBy: string | null;
  }>(
    `SELECT sha, outcome, at, tickets, red_since AS redSince, unplayed_sha AS unplayedSha, unplayed_at AS unplayedAt, unplayed_reason AS reason,
            recheck_at AS recheckAt, recheck_held_at AS recheckHeldAt, recheck_by AS recheckBy FROM base_checks`,
  )[0];
  if (!ligne) return null;
  const { sha, outcome, at, redSince, unplayedSha, unplayedAt, reason, recheckAt, recheckHeldAt, recheckBy } = ligne;
  return {
    sha,
    outcome,
    at,
    tickets: JSON.parse(ligne.tickets),
    redSince,
    unplayed: unplayedSha === null || unplayedAt === null ? null : { sha: unplayedSha, at: unplayedAt },
    reason,
    recheck: recheckAt === null ? null : { at: recheckAt, heldAt: recheckHeldAt, by: recheckBy ?? "chef" },
  };
}

// The base's red, counted — null if it is not red.
export function rougeCompte(base: Base): RougeCompte | null {
  const ligne = base.lire<{ redChecks: number; replayed: number; checkedSeq: number }>(
    "SELECT red_checks AS redChecks, replayed, checked_seq AS checkedSeq FROM base_checks WHERE outcome = 'red'",
  )[0];
  return ligne ? { redChecks: ligne.redChecks, replayed: ligne.replayed === 1, checkedSeq: ligne.checkedSeq } : null;
}

// The base's latest repair ticket, and where it stands — null if no red base
// ever gave birth to one. Its fate is read on the rail.
export function reparationDeLaBase(base: Base): ReparationDeLaBase | null {
  const ligne = base.lire<{
    ticket: number;
    at: string;
    sha: string;
    redSince: string | null;
    failures: string;
    sortie: string | null;
    sortieSeq: number | null;
    etat: string | null;
    retour: string | null;
  }>(
    `SELECT r.ticket, r.at, r.sha, r.red_since AS redSince, r.failures, o.outcome AS sortie, o.seq AS sortieSeq, t.state AS etat, t.until AS retour
     FROM base_repairs r LEFT JOIN rail_outcomes o ON o.ticket = r.ticket LEFT JOIN rail t ON t.ticket = r.ticket
     ORDER BY r.seq DESC LIMIT 1`,
  )[0];
  if (!ligne) return null;
  const { ticket, at, sha, redSince, sortie, sortieSeq, etat, retour } = ligne;
  const controle = base.lire<{ redSince: string | null; checkedSeq: number }>(
    "SELECT red_since AS redSince, checked_seq AS checkedSeq FROM base_checks WHERE outcome = 'red'",
  )[0];
  // Merged, and the base checked since stayed the same red: it did not repair.
  const rateeApresMerge = sortie === "served" && controle !== undefined && controle.redSince === redSince && controle.checkedSeq > (sortieSeq ?? 0);
  const echec: EchecDeReparation | null = sortie === "left" ? "partie" : rateeApresMerge ? "rouge-apres-merge" : sortie === null && etat === "86" && retour === null ? "remontee" : null;
  return { ticket, at, sha, redSince, failures: JSON.parse(ligne.failures), etat: echec !== null ? "echouee" : sortie === "served" ? "servie" : "en-cours", echec };
}

// What the gates said at the latest played check of the red base — null if
// it is not red, or if that check can no longer be read.
export function gatesDuRouge(base: Base): Gates | null {
  const [controle] = base.lire<{ payload: string }>("SELECT e.payload FROM base_checks c JOIN events e ON e.seq = c.checked_seq WHERE c.outcome = 'red' AND e.type = 'base.checked'");
  if (controle === undefined) return null;
  const { gates } = JSON.parse(controle.payload) as { gates?: Gates };
  return gates !== undefined && Array.isArray(gates.failures) ? gates : null;
}

// The repair ticket in progress, if there is one: the one a red base lets
// go, and which the pass judges and merges despite it.
export function reparationEnCours(base: Base): number | null {
  const reparation = reparationDeLaBase(base);
  return reparation?.etat === "en-cours" ? reparation.ticket : null;
}

// The creation of a repair ticket announced and not yet confirmed.
export function reparationAnnoncee(base: Base): { at: string; sha: string } | null {
  return base.lire<{ at: string; sha: string }>("SELECT at, sha FROM base_repair_opening")[0] ?? null;
}

// The base check held back by its fetch, or null.
export function controleRetenu(base: Base): ControleRetenu | null {
  return base.lire<ControleRetenu>("SELECT at, reason FROM base_holds")[0] ?? null;
}

// The tickets whose merge remains to be verified on the base.
export function mergesAVerifier(base: Base): number[] {
  return base.lire<{ ticket: number }>("SELECT ticket FROM base_suspects ORDER BY ticket").map(({ ticket }) => ticket);
}

// A grant's state at time `maintenant`, or null if it was never given. A
// passed deadline expires it for whoever reads it, whether the fact is in the
// log or not: nothing depends on an expiry having been written in time.
export function etatDuGrant(base: Base, action: ActionDeGrant, maintenant: Date): Grant | null {
  const ligne = base.lire<{ action: string; active: number; since: string; by: string; until: string | null; usesLeft: number | null; ended: Grant["ended"]; cause: Grant["cause"]; reserved: number }>(
    `SELECT action, active, since, by, until, uses_left AS usesLeft, ended, cause,
            (SELECT count(*) FROM grant_uses WHERE action = grants.action AND outcome IS NULL AND seq > grants.granted_seq) AS reserved
     FROM grants WHERE action = ?`,
    action,
  )[0];
  if (!ligne) return null;
  const grant = { ...ligne, active: ligne.active === 1, reserved: ligne.active === 1 ? ligne.reserved : 0, unrecorded: false };
  if (!grant.active) return grant;
  const eteint = (cause: CauseDExtinction, since: string): Grant => ({ ...grant, active: false, since, reserved: 0, ended: "expired", cause, unrecorded: true });
  // The last use expires in the transaction of its merge: this is the time
  // of whoever observes it.
  if (grant.usesLeft !== null && grant.usesLeft <= 0) return eteint("uses", maintenant.toISOString());
  if (grant.until !== null && grant.until <= maintenant.toISOString()) return eteint("until", grant.until);
  return grant;
}

// The grant's latest uses, most recent first.
export function usagesDuGrant(base: Base, combien: number): UsageDeGrant[] {
  return base.lire<UsageDeGrant>("SELECT seq, at, ticket, action, pr, sha, base, verdict, outcome FROM grant_uses ORDER BY seq DESC LIMIT ?", combien);
}

// What became of the green deliveries the pass stopped for lack of a grant —
// the figure on which the chef grants it. The count follows the stopped
// delivery, by its PR: a PR rejudged and stopped again counts only once, and
// the merge of another PR of the same ticket says nothing about it.
// `mergees`: the chef merged what it would have merged. `parLaPass`: it merged
// it itself, the grant being granted since — that is not the chef's gesture.
// `refusees`: it closed the PR without merging — a disagreement, which a
// reopening followed by a merge erases. `ouvertes`: nothing is said yet.
// The rest is no longer followed: the ticket left the rail, or a cook went
// back onto it.
export type SansGrant = { arretees: number; mergees: number; parLaPass: number; refusees: number; ouvertes: number };
type Sort = "open" | "chef" | "pass" | "fermee" | "lachee";
export function bilanSansGrant(base: Base): SansGrant {
  const rows = base.lire<{ ticket: number | null; type: string; payload: string }>(
    `SELECT ticket, type, payload FROM events
     WHERE type IN ('pass.started', 'pass.pr-opened', 'pass.held', 'merge.done', 'pass.pr-closed', 'pass.abandoned', 'cook.launched') ORDER BY seq`,
  );
  // The PR of each ticket's current delivery, then the fate of each stopped PR.
  const enCours = new Map<number, string>();
  const arretees = new Map<string, { ticket: number; sort: Sort }>();
  const duTicket = (ticket: number) => [...arretees.values()].filter((arretee) => arretee.ticket === ticket && arretee.sort === "open");
  for (const { ticket, type, payload } of rows) {
    if (ticket === null) continue;
    const dit = JSON.parse(payload) as { reason?: unknown; pr?: unknown; by?: unknown; merged?: unknown; closed?: unknown };
    const pr = typeof dit.pr === "string" ? dit.pr : null;
    const arretee = pr === null ? undefined : arretees.get(pr);
    switch (type) {
      case "pass.started":
      case "pass.pr-opened":
        if (pr !== null) enCours.set(ticket, pr);
        break;
      case "pass.held": {
        const sienne = enCours.get(ticket);
        if (motifDArret(dit).reason === SANS_GRANT && sienne !== undefined && !arretees.has(sienne)) arretees.set(sienne, { ticket, sort: "open" });
        break;
      }
      // Closed then reopened and merged, it is merged.
      case "merge.done":
        if (arretee && arretee.sort !== "chef" && arretee.sort !== "pass") arretee.sort = dit.by === "pass" ? "pass" : "chef";
        break;
      case "pass.pr-closed":
        if (arretee?.sort === "open") arretee.sort = "fermee";
        break;
      // The ticket left the rail: what GitHub said of its PR that day.
      case "pass.abandoned":
        for (const laissee of duTicket(ticket)) laissee.sort = dit.merged === true ? "chef" : dit.closed === true ? "fermee" : "lachee";
        break;
      // A cook goes back onto the ticket: the stopped delivery stays behind it.
      case "cook.launched":
        for (const laissee of duTicket(ticket)) laissee.sort = "lachee";
        enCours.delete(ticket);
        break;
    }
  }
  const combien = (sort: Sort) => [...arretees.values()].filter((arretee) => arretee.sort === sort).length;
  return { arretees: arretees.size, mergees: combien("chef"), parLaPass: combien("pass"), refusees: combien("fermee"), ouvertes: combien("open") };
}
