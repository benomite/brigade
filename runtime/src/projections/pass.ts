// La pass : pour chaque ticket livré, où en est son jugement, et combien de
// renvois il a consommés. Et le grant `merge` : son état, chacun de ses usages.
// C'est ici que la pass lit ce qu'il lui reste à faire — donc ce qui était en
// cours se retrouve après un redémarrage — et que le chef lit « pourquoi ce
// code est-il sur la base ? ».
import type { Base } from "../base.ts";
import type { FaitGardeFous } from "../evenements/garde-fous.ts";
import type { ActionDeGrant, CauseDExtinction, FaitPass, Finding, Verdict } from "../evenements/pass.ts";
import type { FaitRail } from "../evenements/rail.ts";
import type { FaitStation } from "../evenements/station.ts";
import { definirProjection } from "../projection.ts";

// `cooking` : un cook travaille. `delivered` : il a livré, rien n'est jugé.
// `judging` : gates ou CI en cours. `green` / `red` : jugé, pas encore décidé.
// `merging` : l'intention de merger est écrite, pas son résultat. `served` :
// verte et sans diff — servie sans merge. `deferred` : rouge, entre les mains
// du manager. `replaying` : verte, la base a avancé sur ses fichiers — les
// gates se rejouent sur le résultat du merge. `waiting` : verte, sous grant,
// et pas mergée pour l'instant — `reason` dit ce qu'elle attend. `closed` : sa
// PR a été fermée sans merge — `reason` reste celui de la phase quittée.
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
  | "escalated"
  | "closed";

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
  // Les déclarations du projet (réseau, secrets) que la livraison touche.
  declarations: string[];
  // Le ticket n'a produit aucun diff : son verdict ne tient qu'au reviewer.
  noDiff: boolean;
  findings: string[];
  review: Relue | null;
  // Les renvois consommés.
  returns: number;
  // Pourquoi la pass s'est arrêtée, a remonté, ou attend.
  reason: string | null;
  // Arrêtée faute de grant : l'instant où il s'était éteint seul, s'il l'était.
  grantExpired: string | null;
  // La base telle qu'elle était quand la pass l'a vue avancer sous ce verdict,
  // et celle sur laquelle le résultat du merge a été rejoué vert.
  movedBase: string | null;
  checkedBase: string | null;
  // La pass a choisi de la merger sans rejeu, sur une base qui avait avancé.
  unverified: boolean;
};

// Une livraison que son ticket a laissée en quittant le rail sans qu'elle soit
// mergée, et dont la pass n'a encore rien dit. `verdict` : celui de cette
// livraison, nul si elle n'était pas jugée. `reason`, `seq` : le départ.
export type Orpheline = { ticket: number; branch: string; pr: string | null; verdict: Verdict | null; reason: string; seq: number };

// Ce que le dernier contrôle de la base a dit, et les tickets dont il
// vérifiait le merge.
export type EtatDeLaBase = {
  sha: string;
  outcome: "green" | "red" | "skipped";
  at: string;
  tickets: number[];
  // Rouge : depuis quand elle l'est, d'un contrôle rouge au suivant.
  redSince: string | null;
  // Rouge : le dernier contrôle qui n'a pas pu se jouer depuis. Il n'a rien
  // levé — on ne revient pas d'un rouge faute d'avoir pu vérifier.
  unplayed: { sha: string; at: string } | null;
  // Pourquoi le dernier contrôle non joué — celui-ci, ou `unplayed` sous un
  // rouge — ne l'a pas été : l'essai ne s'est pas fait. Nul : l'arbre n'a pas
  // de gates, ou tout a été joué.
  reason: string | null;
  // Rouge : le rejeu que le chef a demandé, tant qu'aucun contrôle ne l'a
  // servi. `heldAt` : la machine le retient depuis cet instant.
  recheck: { at: string; heldAt: string | null } | null;
};

// Le contrôle de la base que la pass ne peut pas faire partir : la base ne se
// rapatrie pas depuis `at`, et `reason` est ce que git en a dit.
export type ControleRetenu = { at: string; reason: string };

// Un grant tel qu'il vaut à l'heure où on le lit. `since` : depuis quand il
// est dans cet état — accordé, révoqué, éteint. `by` : qui l'a accordé, ou
// révoqué.
export type Grant = {
  action: string;
  active: boolean;
  since: string;
  by: string;
  // Ses limites : l'instant où il s'éteint, les usages qui lui restent. Nulles,
  // il n'en a pas.
  until: string | null;
  usesLeft: number | null;
  // Les merges en vol : une intention écrite, pas encore de résultat. Chacun
  // retient un des usages qui restent.
  reserved: number;
  // Inactif : le chef l'a révoqué, ou il s'est éteint seul — et pourquoi.
  ended: "revoked" | "expired" | null;
  cause: CauseDExtinction | null;
  // Éteint à l'heure de la lecture, sans que le fait soit encore au journal.
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

const instantOuRien = (valeur: unknown) => (texte(valeur) && !Number.isNaN(Date.parse(valeur)) ? new Date(valeur).toISOString() : null);
const usagesOuRien = (valeur: unknown) => (Number.isSafeInteger(valeur) && (valeur as number) > 0 ? (valeur as number) : null);

// Le grant accordé (`ended` nul) ou révoqué. Une limite écrite mais illisible
// ne fait pas un grant sans fin : elle est déjà atteinte.
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

// Le résultat d'un merge se range sur l'intention restée sans résultat. Fait
// par la pass, il consomme un usage du grant sous lequel elle l'a voulu — pas
// d'un grant accordé depuis.
const conclureUsage = (base: Base, ticket: number | null, outcome: string, parLaPass = false) => {
  if (parLaPass) {
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
  tables: ["pass", "pass_orphans", "grants", "grant_uses", "base_checks", "base_suspects", "base_holds"],
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
      declarations   TEXT NOT NULL DEFAULT '[]',
      no_diff        INTEGER NOT NULL DEFAULT 0,
      findings       TEXT NOT NULL DEFAULT '[]',
      review         TEXT,
      returns        INTEGER NOT NULL DEFAULT 0,
      reason         TEXT,
      grant_expired  TEXT,
      moved_base     TEXT,
      checked_base   TEXT,
      unverified     INTEGER NOT NULL DEFAULT 0
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
      recheck_held_at TEXT
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
    // Une prolongation ne vaut que sur un grant actif, et n'y change que ce
    // qu'elle nomme : `since` reste l'instant où il a été accordé.
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
    // La PR se range sur la livraison, sans en changer la phase.
    "pass.pr-opened": (base, { ticket, payload }) => {
      if (ticket === null || !texte(payload.pr)) return;
      base.executer("UPDATE pass SET pr = ?, number = ? WHERE ticket = ?", payload.pr, entierOuRien(payload.number), ticket);
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
        "verdict = ?, verdict_seq = ?, sha = ?, judge_modified = ?, declarations = ?, no_diff = ?, findings = ?, moved_base = NULL, checked_base = NULL, unverified = 0",
        verdict,
        seq,
        texteOuRien(payload.sha),
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
    // Un merge que rien n'a vérifié sur la base telle qu'elle était est à
    // vérifier après coup, sur la base elle-même. C'est le fait qui le dit :
    // un journal d'avant, rejoué, ne rend suspect aucun de ses vieux merges.
    "merge.done": (base, { ticket, at, payload }) => {
      conclureUsage(base, ticket, "done", payload.by === "pass");
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
      const verifies = (Array.isArray(payload.tickets) ? payload.tickets : []).filter((ticket) => Number.isSafeInteger(ticket));
      const outcome = payload.outcome === "green" || payload.outcome === "skipped" ? payload.outcome : "red";
      const rouge = base.lire<{ red_since: string | null; tickets: string }>("SELECT red_since, tickets FROM base_checks WHERE outcome = 'red'")[0];
      // Un rouge qui reste rouge garde ses merges attribués : un rejeu sans nouveau merge ne les efface pas.
      const attribues: number[] = outcome === "red" && rouge ? JSON.parse(rouge.tickets) : [];
      const tickets = [...new Set([...attribues, ...verifies])];
      // Tout contrôle sert le rejeu que le chef a demandé.
      if (outcome === "skipped" && rouge) {
        // « Je n'ai pas pu vérifier » n'est pas « c'est vert » : le rouge reste.
        base.executer(
          "UPDATE base_checks SET unplayed_sha = ?, unplayed_at = ?, unplayed_reason = ?, recheck_at = NULL, recheck_held_at = NULL",
          payload.sha,
          at,
          texteOuRien(payload.reason),
        );
      } else {
        base.executer(
          `INSERT INTO base_checks (id, sha, outcome, at, tickets, red_since, unplayed_reason) VALUES (1, ?, ?, ?, ?, ?, ?)
           ON CONFLICT (id) DO UPDATE SET sha = excluded.sha, outcome = excluded.outcome, at = excluded.at, tickets = excluded.tickets,
             red_since = excluded.red_since, unplayed_sha = NULL, unplayed_at = NULL, unplayed_reason = excluded.unplayed_reason,
             recheck_at = NULL, recheck_held_at = NULL`,
          payload.sha,
          outcome,
          at,
          JSON.stringify(tickets),
          outcome === "red" ? (rouge?.red_since ?? at) : null,
          outcome === "skipped" ? texteOuRien(payload.reason) : null,
        );
      }
      for (const ticket of tickets) base.executer("DELETE FROM base_suspects WHERE ticket = ?", ticket);
    },
    // Une demande du chef se tente aussitôt, même sur une base qui ne se
    // rapatriait pas : si elle bute encore, c'est redit — une fois.
    "base.recheck-requested": (base, { at }) => {
      const { changements } = base.executer("UPDATE base_checks SET recheck_at = ?, recheck_held_at = NULL WHERE outcome = 'red'", at);
      if (changements > 0) base.executer("DELETE FROM base_holds");
    },
    "base.recheck-held": (base, { at }) => {
      base.executer("UPDATE base_checks SET recheck_held_at = ? WHERE recheck_at IS NOT NULL", at);
    },
    // La première panne date la retenue : une seconde, sans reprise entre les
    // deux, ne la rajeunit pas — elle n'en change que le motif, celui qui vaut.
    "base.check-held": (base, { at, payload }) => {
      base.executer("INSERT INTO base_holds (id, at, reason) VALUES (1, ?, ?) ON CONFLICT (id) DO UPDATE SET reason = excluded.reason", at, texteOuRien(payload.reason) ?? "");
    },
    "base.check-resumed": (base) => {
      base.executer("DELETE FROM base_holds");
    },
    "pass.held": (base, { ticket, at, payload }) => passer(base, ticket, at, "held", "reason = ?, grant_expired = ?", texteOuRien(payload.reason), instantOuRien(payload.expired)),
    "pass.returned": (base, { ticket, at, payload }) => {
      passer(base, ticket, at, "returned", "returns = ?, findings = ?, started_at = NULL", entierOuRien(payload.n) ?? 0, liste(payload.findings));
    },
    "pass.deferred": (base, { ticket, at }) => passer(base, ticket, at, "deferred"),
    "pass.escalated": (base, { ticket, at, payload }) => passer(base, ticket, at, "escalated", "reason = ?", texteOuRien(payload.reason)),
    // Le motif reste : il dit ce que la livraison était quand sa PR a été fermée.
    "pass.pr-closed": (base, { ticket, at, payload }) => passer(base, ticket, at, "closed", "pr = coalesce(?, pr)", texteOuRien(payload.pr)),
    // Le ticket quitte le rail : sa pass n'a plus d'objet. Les usages du grant,
    // eux, restent — et sa livraison, si elle n'est pas mergée, jusqu'à ce que
    // la pass ait dit ce qu'il en reste. Un premier cook encore en cuisine n'a
    // rien livré : sa fin est l'affaire de la station.
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
    },
    "pass.abandoned": (base, { payload }) => {
      base.executer("DELETE FROM pass_orphans WHERE branch IS ?", texteOuRien(payload.branch));
    },
  },
});

const COLONNES = `ticket, run, branch, worktree, pr, number, phase, since, started_at AS startedAt, verdict,
  verdict_seq AS verdictSeq, sha, judge_modified AS judgeModified, declarations, no_diff AS noDiff, findings, review, returns, reason,
  grant_expired AS grantExpired,
  moved_base AS movedBase, checked_base AS checkedBase, unverified`;

type Ligne = Omit<PassDeTicket, "judgeModified" | "declarations" | "noDiff" | "findings" | "review" | "unverified"> & {
  judgeModified: number;
  declarations: string;
  noDiff: number;
  findings: string;
  review: string | null;
  unverified: number;
};

const lire = (ligne: Ligne): PassDeTicket => ({
  ...ligne,
  judgeModified: ligne.judgeModified === 1,
  declarations: JSON.parse(ligne.declarations),
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

// Les livraisons laissées par un ticket parti, dont la pass n'a encore rien dit.
export function orphelines(base: Base): Orpheline[] {
  return base.lire<Orpheline>("SELECT ticket, branch, pr, verdict, reason, seq FROM pass_orphans ORDER BY seq");
}

// Le dernier contrôle de la base, ou null si elle n'a jamais été contrôlée.
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
  }>(
    `SELECT sha, outcome, at, tickets, red_since AS redSince, unplayed_sha AS unplayedSha, unplayed_at AS unplayedAt, unplayed_reason AS reason,
            recheck_at AS recheckAt, recheck_held_at AS recheckHeldAt FROM base_checks`,
  )[0];
  if (!ligne) return null;
  const { sha, outcome, at, redSince, unplayedSha, unplayedAt, reason, recheckAt, recheckHeldAt } = ligne;
  return {
    sha,
    outcome,
    at,
    tickets: JSON.parse(ligne.tickets),
    redSince,
    unplayed: unplayedSha === null || unplayedAt === null ? null : { sha: unplayedSha, at: unplayedAt },
    reason,
    recheck: recheckAt === null ? null : { at: recheckAt, heldAt: recheckHeldAt },
  };
}

// Le contrôle de la base que son rapatriement retient, ou null.
export function controleRetenu(base: Base): ControleRetenu | null {
  return base.lire<ControleRetenu>("SELECT at, reason FROM base_holds")[0] ?? null;
}

// Les tickets dont le merge reste à vérifier sur la base.
export function mergesAVerifier(base: Base): number[] {
  return base.lire<{ ticket: number }>("SELECT ticket FROM base_suspects ORDER BY ticket").map(({ ticket }) => ticket);
}

// L'état d'un grant à l'heure `maintenant`, ou null s'il n'a jamais été donné.
// Une échéance passée l'éteint pour qui le lit, que le fait soit au journal ou
// non : rien ne tient à ce qu'une extinction ait été écrite à temps.
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
  // Le dernier usage s'éteint dans la transaction de son merge : c'est l'heure
  // de celui qui le constate.
  if (grant.usesLeft !== null && grant.usesLeft <= 0) return eteint("uses", maintenant.toISOString());
  if (grant.until !== null && grant.until <= maintenant.toISOString()) return eteint("until", grant.until);
  return grant;
}

// Les derniers usages du grant, le plus récent d'abord.
export function usagesDuGrant(base: Base, combien: number): UsageDeGrant[] {
  return base.lire<UsageDeGrant>("SELECT seq, at, ticket, action, pr, sha, base, verdict, outcome FROM grant_uses ORDER BY seq DESC LIMIT ?", combien);
}
