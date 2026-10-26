// The rail: the project's tickets, each with its state. This is where one
// reads "what is there to serve, who holds what, and since when?".
//
// Time never enters here: an expired lease does not give the ticket back, the
// `ticket.released` event does. Replaying the log at another time gives the
// same rail back.
//
// Dependencies are not kept anywhere either: what a ticket awaits is in its
// card, and the fate of each ticket — served, or gone without being so — in a
// table the log fills. A ticket that is awaited therefore need not be on the
// rail for it to be known whether it was served.
import type { Base } from "../base.ts";
import type { Evenement } from "../evenements.ts";
import type { FaitGardeFous } from "../events/guardrails.ts";
import { NON_JUGEE, type FaitPass, type Finding } from "../events/pass.ts";
import { ATTEND_UN_TIERS, REVENU_D_ATTENTE, type FaitRail } from "../events/rail.ts";
import type { FaitStation } from "../events/station.ts";
import type { Fiche } from "../fiche.ts";
import { bilanDEpique } from "../bilan-epique.ts";
import { definirProjection } from "../projection.ts";
import { horsZone, recouvrement } from "../zones.ts";
import { constats } from "./pass.ts";
import { decoupageDe } from "./splits.ts";

export type Etat = "waiting" | "taken" | "pass" | "served" | "86";

// A ticket the card says to await and which has not been served. `left`: it
// left the rail without being so — dropped —, why, and by which event.
export type Attendu = { ticket: number; left: { reason: string; seq: number } | null };

// What a WAITING ticket awaits from a third party: `what`, in the chef's words,
// from whom (`who`), since when (`since`, its being put on hold — an update
// does not change it), when to come back to it (`followUp`), and what "it has
// arrived" will do with it (`onArrival`, in plain words).
export type AttenteDeTiers = { what: string; who: string; since: string; followUp: string; onArrival: string };

// What "it has arrived" does to a WAITING ticket: it goes back to the kitchen,
// without going back past the chef — onto its open delivery if it carries one.
export function direALArrivee(delivery: string | null): string {
  return delivery === "open"
    ? "il repart en cuisine, sans repasser par TODO : un cook reprend sa livraison ouverte (sa branche et sa PR)"
    : "il repart en cuisine, sans repasser par TODO : il est remis sur le rail, et un cook le prend à son tour";
}

// The same, in English: what `status` says.
export function direALArriveeEn(delivery: string | null): string {
  return delivery === "open"
    ? "it goes back to the kitchen, without going through TODO: a cook takes up its open delivery (its branch and its PR)"
    : "it goes back to the kitchen, without going through TODO: it is put back on the rail, and a cook takes it in its turn";
}

// A ticket gone to the kitchen and not yet served, whose zone overlaps this
// one's. `path`: the path by which they overlap. `outside`: that path is one
// the other ticket wrote outside its own zone — its card does not claim it.
export type Tenu = { ticket: number; path: string; outside?: true };

export type TicketRail = {
  ticket: number;
  title: string;
  priority: number | null;
  createdAt: string;
  url: string;
  state: Etat;
  // Since when it has been in this state.
  since: string;
  // The station that holds it (taken) or that cooked it (in pass, served).
  station: string | null;
  leaseUntil: string | null;
  // Taken: the last time its station saw its worktree move — the take, then
  // each renewal of the lease. A date, never a duration.
  progressedAt: string | null;
  // The calibration set on the issue, dimension by dimension.
  model: string | null;
  effort: string | null;
  // The card set on the issue, or null if it carries none.
  card: Fiche | null;
  // Those of the tickets of its card that are not served. Empty: nothing
  // holds it back.
  awaits: Attendu[];
  // Queued: those that hold a path of its zone. Empty: its zone is
  // free.
  held: Tenu[];
  // The files its last delivery wrote outside its zone, and that its card
  // still does not claim — the project's common paths aside. Empty: nothing
  // to settle. Not empty, they are held like its zone, for as long as it
  // holds its zone: until its delivery is on the base, or a new delivery
  // writes none of them, or its card is amended to claim them.
  outOfZone: string[];
  // Queued: those, among `awaits`, that are frozen — 86 that the pass could
  // not judge, with no return time: nothing will make them leave without the
  // chef. This ticket will not leave before them. Does not change what holds
  // it back, only what is said about it. Never among `held`: a ticket 86
  // holds no zone.
  frozenBy: number[];
  // Reason and return time of an 86.
  reason: string | null;
  until: string | null;
  // In WAITING — 86 awaiting a third party —, what it awaits. Null otherwise.
  waitingFor: AttenteDeTiers | null;
  // Back from WAITING to TODO: why, in plain words ("follow-up of 21/10: no
  // answer", "new on the issue", "chef"). Null otherwise, and as soon as
  // the ticket changes state.
  resumedBecause: string | null;
};

type Payload<T extends FaitRail["type"]> = Required<Extract<FaitRail, { type: T }>["payload"]>;
type Effet<T extends FaitRail["type"]> = (base: Base, ticket: number, evenement: Evenement<Extract<FaitRail, { type: T }>>) => void;

const texte = (valeur: unknown) => typeof valeur === "string" && valeur !== "";
const texteOuRien = (valeur: unknown) => valeur === null || texte(valeur);
const texteRienOuAbsent = (valeur: unknown) => valeur === undefined || texteOuRien(valeur);
const prioriteOuRien = (valeur: unknown) => valeur === null || Number.isInteger(valeur);
const liste = (valeur: unknown, element: (valeur: unknown) => boolean) => Array.isArray(valeur) && valeur.every(element);
const ficheRienOuAbsente = (valeur: unknown) => {
  if (valeur === undefined || valeur === null) return true;
  if (typeof valeur !== "object") return false;
  const { waitsFor, zone, problems, requires } = valeur as Record<string, unknown>;
  // `requires`: absent from a card that asks for no capability, and from
  // all those written before the rail read them.
  return liste(waitsFor, Number.isSafeInteger) && liste(zone, texte) && liste(problems, texte) && (requires === undefined || liste(requires, texte));
};

const marque = (valeur: unknown) => {
  if (typeof valeur !== "object" || valeur === null) return false;
  const { what, who, followUp } = valeur as Record<string, unknown>;
  return texte(what) && texte(who) && texte(followUp);
};

// What a rail fact must carry to be readable.
const FORMES: { [T in FaitRail["type"]]: { [C in keyof Payload<T>]: (valeur: unknown) => boolean } } = {
  "ticket.arrived": { title: texte, priority: prioriteOuRien, createdAt: texte, url: texte, model: texteRienOuAbsent, effort: texteRienOuAbsent, card: ficheRienOuAbsente },
  "ticket.changed": { title: texte, priority: prioriteOuRien, model: texteRienOuAbsent, effort: texteRienOuAbsent, card: ficheRienOuAbsente },
  "ticket.left": { reason: texte },
  "ticket.taken": { station: texte, leaseUntil: texte },
  "ticket.renewed": { station: texte, leaseUntil: texte },
  "ticket.released": { reason: texte, station: texteOuRien },
  "ticket.passing": { station: texte },
  "ticket.served": {},
  "ticket.86": { reason: texte, until: texteOuRien, why: (valeur) => valeur === undefined || typeof valeur === "string", access: (valeur) => valeur === undefined || (typeof valeur === "object" && valeur !== null) },
  "ticket.fire-unseen": { removedAt: texte },
  "ticket.blocked": { by: Number.isSafeInteger, reason: texte },
  "ticket.waiting": { what: texte, who: texte, followUp: texte },
  "ticket.resumed": { to: (valeur) => valeur === "todo" || valeur === "kitchen", why: texte },
  "waiting.marked": { waiting: (valeur) => valeur === null || marque(valeur), heard: (valeur) => valeur === undefined || Number.isSafeInteger(valeur) },
  "rail.commons": { paths: (valeur) => liste(valeur, texte) },
};

// The log is append-only and replayed at every start: an unreadable fact
// (without a ticket, or of a shape this version does not know) that threw
// here would prevent the runtime from restarting, with no way to remove it. It
// is therefore ignored — it stays in the log, with no effect on the rail.
function lisible<T extends FaitRail["type"]>(type: T, effet: Effet<T>) {
  return (base: Base, evenement: Evenement<Extract<FaitRail, { type: T }>>) => {
    const payload = evenement.payload as Record<string, unknown>;
    const forme: Record<string, (valeur: unknown) => boolean> = FORMES[type];
    if (evenement.ticket === null || payload === null || typeof payload !== "object") return;
    for (const [champ, valide] of Object.entries(forme)) if (!valide(payload[champ])) return;
    effet(base, evenement.ticket, evenement);
  };
}

// The card as the table keeps it: its JSON, fields in a fixed order — two
// equal cards are the same text there. Capabilities appear only when
// requested: a card that requests none keeps its earlier text.
const enTexte = (card: Fiche | null | undefined): string | null =>
  card ? JSON.stringify({ waitsFor: card.waitsFor, zone: card.zone, problems: card.problems, ...(card.requires?.length ? { requires: card.requires } : {}) }) : null;

type Changement = { state: Etat; station?: string | null; leaseUntil?: string | null; progressedAt?: string | null; reason?: string | null; until?: string | null };

// Makes the ticket enter a state. What the change does not name is erased: a
// state keeps nothing of the previous one — not even its wait for a third
// party, which only `ticket.waiting` sets.
function passer(base: Base, ticket: number, at: string, changement: Changement): void {
  base.executer("DELETE FROM rail_waiting WHERE ticket = ?", ticket);
  base.executer("DELETE FROM rail_resumed WHERE ticket = ?", ticket);
  base.executer(
    "UPDATE rail SET state = ?, since = ?, station = ?, lease_until = ?, progressed_at = ?, reason = ?, until = ? WHERE ticket = ?",
    changement.state,
    at,
    changement.station ?? null,
    changement.leaseUntil ?? null,
    changement.progressedAt ?? null,
    changement.reason ?? null,
    changement.until ?? null,
    ticket,
  );
}

// The link with the guardrails: a taken ticket whose cook died without
// delivering anything goes back to queued. No extra fact — the reason is already
// in the ticket's log (`guard.tripped`, `cook.exited`, `cook.interrupted`).
function rendreApresCook(base: Base, ticket: number | null, at: string): void {
  if (ticket === null) return;
  base.executer(
    `UPDATE rail SET state = 'waiting', since = ?, station = NULL, lease_until = NULL, progressed_at = NULL, reason = NULL, until = NULL
     WHERE ticket = ? AND state = 'taken'`,
    at,
    ticket,
  );
}

// The cook endings after which the ticket has nothing left to await from its
// station. `ok`, `neutral` and `refused` are not: the station says what comes
// next (the pass, the 86, a new attempt or the escalation to the chef).
const FINS_SANS_SUITE: unknown[] = ["failed", "guard", "stop"];

// Served wins over gone, in both orders, and is not undone.
function noterServi(base: Base, ticket: number, seq: number): void {
  base.executer(
    `INSERT INTO rail_outcomes (ticket, outcome, seq) VALUES (?, 'served', ?)
     ON CONFLICT (ticket) DO UPDATE SET outcome = 'served', reason = NULL, seq = excluded.seq`,
    ticket,
    seq,
  );
}

// What a ticket's last delivery wrote outside its zone is forgotten: a new
// delivery is checked again, a merged one is on the base, a ticket gone has
// nothing left to hold.
const oublierHorsZone = (base: Base, ticket: number) => base.executer("DELETE FROM rail_out_of_zone WHERE ticket = ?", ticket);

const fichiersHorsZone = (valeur: unknown) =>
  liste(valeur, (fichier) => typeof fichier === "object" && fichier !== null && texte((fichier as Record<string, unknown>).path));

export const rail = definirProjection<
  | FaitRail
  | Extract<FaitGardeFous, { type: "cook.exited" | "cook.interrupted" }>
  | Extract<FaitPass, { type: "merge.done" }>
  | Extract<FaitStation, { type: "cook.out-of-zone" }>
>({
  nom: "rail",
  tables: ["rail", "rail_outcomes", "rail_commons", "rail_waiting", "rail_waiting_marks", "rail_waiting_heard", "rail_resumed", "rail_out_of_zone"],
  schema: `
    CREATE TABLE IF NOT EXISTS rail (
      ticket      INTEGER PRIMARY KEY,
      title       TEXT NOT NULL,
      priority    INTEGER,
      created_at  TEXT NOT NULL,
      url         TEXT NOT NULL,
      state       TEXT NOT NULL CHECK (state IN ('waiting', 'taken', 'pass', 'served', '86')),
      since       TEXT NOT NULL,
      model       TEXT,
      effort      TEXT,
      card        TEXT,
      station     TEXT,
      -- What the ticket delivered: 'open', a delivery sent to pass and
      -- not yet on the base; 'merged', it is there. Null: nothing delivered.
      delivery    TEXT CHECK (delivery IN ('open', 'merged')),
      lease_until TEXT,
      progressed_at TEXT,
      reason      TEXT,
      until       TEXT
    ) STRICT;
    -- A ticket's fate, whether it is still on the rail or not: served, or
    -- gone without having been so. Served wins, and is not undone.
    CREATE TABLE IF NOT EXISTS rail_outcomes (
      ticket  INTEGER PRIMARY KEY,
      outcome TEXT NOT NULL CHECK (outcome IN ('served', 'left')),
      reason  TEXT,
      seq     INTEGER NOT NULL
    ) STRICT;
    -- The project's paths that belong to no ticket.
    CREATE TABLE IF NOT EXISTS rail_commons (
      path TEXT PRIMARY KEY
    ) STRICT;
    -- The WAITING tickets: what they await from a third party, and the state
    -- they were in before waiting — the one "resume" puts them back in.
    CREATE TABLE IF NOT EXISTS rail_waiting (
      ticket       INTEGER PRIMARY KEY,
      what         TEXT NOT NULL,
      who          TEXT NOT NULL,
      since        TEXT NOT NULL,
      follow_up    TEXT NOT NULL,
      prior_state  TEXT NOT NULL,
      prior_reason TEXT,
      prior_until  TEXT
    ) STRICT;
    -- What each ticket's issue says about its wait, as the runtime put it
    -- there: the JSON of the marked wait, or null — mark removed.
    CREATE TABLE IF NOT EXISTS rail_waiting_marks (
      ticket INTEGER PRIMARY KEY,
      mark   TEXT
    ) STRICT;
    -- How many non-brigade comments the issue carried when its wait was
    -- marked: what is added afterwards brings the ticket back.
    CREATE TABLE IF NOT EXISTS rail_waiting_heard (
      ticket INTEGER PRIMARY KEY,
      heard  INTEGER NOT NULL
    ) STRICT;
    -- A removal of fire that the kitchen did not count as the gesture, for a
    -- held ticket: when GitHub dates it.
    CREATE TABLE IF NOT EXISTS rail_fire_unseen (
      ticket     INTEGER PRIMARY KEY,
      removed_at TEXT NOT NULL
    ) STRICT;
    -- Why a ticket came back from WAITING to TODO.
    CREATE TABLE IF NOT EXISTS rail_resumed (
      ticket INTEGER PRIMARY KEY,
      why    TEXT NOT NULL
    ) STRICT;
    -- The files a ticket's last delivery wrote outside the zone it had when
    -- taken, as the station found them.
    CREATE TABLE IF NOT EXISTS rail_out_of_zone (
      ticket INTEGER NOT NULL,
      path   TEXT NOT NULL,
      PRIMARY KEY (ticket, path)
    ) STRICT;
  `,
  sur: {
    "ticket.arrived": lisible("ticket.arrived", (base, ticket, { at, payload }) => {
      base.executer(
        `INSERT OR REPLACE INTO rail (ticket, title, priority, created_at, url, state, since, model, effort, card)
         VALUES (?, ?, ?, ?, ?, 'waiting', ?, ?, ?, ?)`,
        ticket,
        payload.title,
        payload.priority,
        payload.createdAt,
        payload.url,
        at,
        payload.model ?? null,
        payload.effort ?? null,
        enTexte(payload.card),
      );
      // Back on the rail, it is no longer dropped — and no longer awaits anyone.
      base.executer("DELETE FROM rail_outcomes WHERE ticket = ? AND outcome = 'left'", ticket);
      base.executer("DELETE FROM rail_waiting WHERE ticket = ?", ticket);
      base.executer("DELETE FROM rail_fire_unseen WHERE ticket = ?", ticket);
      oublierHorsZone(base, ticket);
    }),
    "ticket.fire-unseen": lisible("ticket.fire-unseen", (base, ticket, { payload }) => {
      base.executer("INSERT OR REPLACE INTO rail_fire_unseen (ticket, removed_at) VALUES (?, ?)", ticket, payload.removedAt);
    }),
    "ticket.changed": lisible("ticket.changed", (base, ticket, { payload }) => {
      base.executer(
        "UPDATE rail SET title = ?, priority = ?, model = ?, effort = ?, card = ? WHERE ticket = ?",
        payload.title,
        payload.priority,
        payload.model ?? null,
        payload.effort ?? null,
        enTexte(payload.card),
        ticket,
      );
    }),
    "ticket.left": lisible("ticket.left", (base, ticket, { seq, payload }) => {
      base.executer("DELETE FROM rail WHERE ticket = ?", ticket);
      base.executer("DELETE FROM rail_fire_unseen WHERE ticket = ?", ticket);
      base.executer("DELETE FROM rail_waiting WHERE ticket = ?", ticket);
      oublierHorsZone(base, ticket);
      base.executer(
        `INSERT INTO rail_outcomes (ticket, outcome, reason, seq) VALUES (?, 'left', ?, ?)
         ON CONFLICT (ticket) DO UPDATE SET reason = excluded.reason, seq = excluded.seq WHERE outcome = 'left'`,
        ticket,
        payload.reason,
        seq,
      );
    }),
    "ticket.taken": lisible("ticket.taken", (base, ticket, { at, payload }) => {
      // A ticket taken again after the merge of its delivery prepares another one.
      base.executer("UPDATE rail SET delivery = NULL WHERE ticket = ? AND delivery = 'merged'", ticket);
      // A ticket that has just been taken has nothing to blame itself for yet.
      passer(base, ticket, at, { state: "taken", station: payload.station, leaseUntil: payload.leaseUntil, progressedAt: at });
    }),
    // The lease is only renewed on worktree progress: this fact is therefore
    // the progress fact. A cook's report (`cook.progressed`) is not one — it
    // says what the cook consumes, not that it advances.
    "ticket.renewed": lisible("ticket.renewed", (base, ticket, { at, payload }) => {
      base.executer("UPDATE rail SET lease_until = ?, progressed_at = ? WHERE ticket = ? AND state = 'taken'", payload.leaseUntil, at, ticket);
    }),
    "ticket.released": lisible("ticket.released", (base, ticket, { at }) => {
      passer(base, ticket, at, { state: "waiting" });
    }),
    // A new delivery: the station checks it against the zone right after, and
    // says what it writes outside (`cook.out-of-zone`) — nothing, if it writes
    // nothing there.
    "ticket.passing": lisible("ticket.passing", (base, ticket, { at, payload }) => {
      passer(base, ticket, at, { state: "pass", station: payload.station });
      base.executer("UPDATE rail SET delivery = 'open' WHERE ticket = ?", ticket);
      oublierHorsZone(base, ticket);
    }),
    "ticket.served": lisible("ticket.served", (base, ticket, { at, seq }) => {
      base.executer("UPDATE rail SET state = 'served', since = ? WHERE ticket = ?", at, ticket);
      noterServi(base, ticket, seq);
      oublierHorsZone(base, ticket);
    }),
    "ticket.86": lisible("ticket.86", (base, ticket, { at, payload }) => {
      passer(base, ticket, at, { state: "86", reason: payload.reason, until: payload.until });
    }),
    "ticket.blocked": () => {},
    // Only a queued ticket on the rail, or one set aside, awaits a third party:
    // taken, in pass or served, the kitchen holds it.
    "ticket.waiting": lisible("ticket.waiting", (base, ticket, { at, payload }) => {
      const [avant] = base.lire<{ state: Etat; reason: string | null; until: string | null }>("SELECT state, reason, until FROM rail WHERE ticket = ?", ticket);
      if (avant === undefined || (avant.state !== "waiting" && avant.state !== "86")) return;
      const deja = base.lire<{ since: string; prior_state: string; prior_reason: string | null; prior_until: string | null }>(
        "SELECT since, prior_state, prior_reason, prior_until FROM rail_waiting WHERE ticket = ?",
        ticket,
      )[0];
      const prior = deja ?? { since: at, prior_state: avant.state, prior_reason: avant.reason, prior_until: avant.until };
      if (deja === undefined) passer(base, ticket, at, { state: "86", reason: ATTEND_UN_TIERS });
      base.executer(
        `INSERT OR REPLACE INTO rail_waiting (ticket, what, who, since, follow_up, prior_state, prior_reason, prior_until) VALUES (?, ?, ?, ?, ?, ?, ?, ?)`,
        ticket,
        payload.what,
        payload.who,
        prior.since,
        payload.followUp,
        prior.prior_state,
        prior.prior_reason,
        prior.prior_until,
      );
    }),
    // Towards the chef: the state before the wait if it was set aside, otherwise
    // set aside for him. Towards the kitchen: queued on the rail. A ticket
    // turned back to the chef goes back to the kitchen in the same gesture.
    "ticket.resumed": lisible("ticket.resumed", (base, ticket, { at, payload }) => {
      const [sur] = base.lire<{ reason: string | null }>("SELECT reason FROM rail WHERE ticket = ? AND state = '86'", ticket);
      const attente = base.lire<{ prior_state: string; prior_reason: string | null; prior_until: string | null }>(
        "SELECT prior_state, prior_reason, prior_until FROM rail_waiting WHERE ticket = ?",
        ticket,
      )[0];
      if (sur === undefined) return;
      if (payload.to === "kitchen") {
        if (attente !== undefined || sur.reason === REVENU_D_ATTENTE) passer(base, ticket, at, { state: "waiting" });
        return;
      }
      if (attente === undefined) return;
      if (attente.prior_state === "86" && attente.prior_reason !== null) passer(base, ticket, at, { state: "86", reason: attente.prior_reason, until: attente.prior_until });
      else passer(base, ticket, at, { state: "86", reason: REVENU_D_ATTENTE });
      base.executer("INSERT OR REPLACE INTO rail_resumed (ticket, why) VALUES (?, ?)", ticket, payload.why);
    }),
    "waiting.marked": lisible("waiting.marked", (base, ticket, { payload }) => {
      base.executer("INSERT OR REPLACE INTO rail_waiting_marks (ticket, mark) VALUES (?, ?)", ticket, payload.waiting === null ? null : JSON.stringify(marqueDe(payload.waiting)));
      // The count is set at the first mark of this wait, and no longer moves:
      // an update does not make one forget what arrived in the meantime.
      if (payload.waiting === null) base.executer("DELETE FROM rail_waiting_heard WHERE ticket = ?", ticket);
      else if (payload.heard !== undefined) base.executer("INSERT OR IGNORE INTO rail_waiting_heard (ticket, heard) VALUES (?, ?)", ticket, payload.heard);
    }),
    "rail.commons": (base, { payload }) => {
      // This fact concerns no ticket: it does not go through `lisible`.
      if (!FORMES["rail.commons"].paths(payload?.paths)) return;
      base.executer("DELETE FROM rail_commons");
      for (const path of new Set(payload.paths)) base.executer("INSERT INTO rail_commons (path) VALUES (?)", path);
    },
    "cook.exited": (base, { ticket, at, payload }) => {
      if (FINS_SANS_SUITE.includes(payload?.outcome)) rendreApresCook(base, ticket, at);
    },
    "cook.interrupted": (base, { ticket, at }) => rendreApresCook(base, ticket, at),
    // The delivery's files outside its zone replace those of the one before.
    "cook.out-of-zone": (base, { ticket, payload }) => {
      if (ticket === null || !fichiersHorsZone(payload?.files)) return;
      oublierHorsZone(base, ticket);
      for (const path of new Set(payload.files.map((fichier) => fichier.path))) base.executer("INSERT INTO rail_out_of_zone (ticket, path) VALUES (?, ?)", ticket, path);
    },
    // The merge of a delivery counts as service for whoever awaits this ticket,
    // even if the rail could not say so: a ticket escalated to the chef (86)
    // then merged by him is no longer in pass, and `ticket.served` is not
    // written. The ticket's state, for its part, does not change here.
    "merge.done": (base, { ticket, seq }) => {
      if (ticket === null) return;
      noterServi(base, ticket, seq);
      base.executer("UPDATE rail SET delivery = 'merged' WHERE ticket = ?", ticket);
      oublierHorsZone(base, ticket);
    },
  },
});

// A mark, fields in a fixed order: two equal marks are the same text there.
const marqueDe = ({ what, who, followUp }: { what: string; who: string; followUp: string }) => ({ what, who, followUp });

const COLONNES = `ticket, title, priority, created_at AS createdAt, url, state, since, model, effort, card, station,
  lease_until AS leaseUntil, progressed_at AS progressedAt, reason, until`;

export type Sort = { outcome: "served" | "left"; reason: string | null; seq: number };

// What the log knows of a ticket's fate, or null if it was neither served nor
// seen leaving — on the rail, or never entered.
export function sortDuTicket(base: Base, ticket: number): Sort | null {
  return base.lire<Sort>("SELECT outcome, reason, seq FROM rail_outcomes WHERE ticket = ?", ticket)[0] ?? null;
}

// The removal of `fire` that the kitchen did not count for this ticket, or null.
export function feuNonVu(base: Base, ticket: number): string | null {
  return base.lire<{ removed_at: string }>("SELECT removed_at FROM rail_fire_unseen WHERE ticket = ?", ticket)[0]?.removed_at ?? null;
}

// A served ticket, as shown after the fact: its title and its issue's
// address, when it was served, the station that cooked it, and the merged PR.
// `title` empty, `url` null: the log never saw the ticket enter the rail — an
// off-rail delivery. `station` null: no station sent it to pass. `pr` null:
// served without a merge, it had nothing to deliver. `review`: what the
// reviewer said of the served delivery, word for word — null when no readable
// review concerns it.
export type Livre = { ticket: number; title: string; url: string | null; servedAt: string; station: string | null; pr: string | null; review: Relecture | null };
// The reviewer's summary and its findings, as it wrote them.
export type Relecture = { summary: string; findings: Finding[] };

const texteDe = (valeur: unknown) => (typeof valeur === "string" && valeur !== "" ? valeur : null);

// The payload of the latest fact of this type, for this ticket, between two numbers.
function dernierFait(base: Base, ticket: number, types: string[], apres: number, jusqua: number): Record<string, unknown> | null {
  const [ligne] = base.lire<{ payload: string }>(
    `SELECT payload FROM events WHERE ticket = ? AND seq > ? AND seq <= ? AND type IN (SELECT value FROM json_each(?)) ORDER BY seq DESC LIMIT 1`,
    ticket,
    apres,
    jusqua,
    JSON.stringify(types),
  );
  if (ligne === undefined) return null;
  const payload: unknown = JSON.parse(ligne.payload);
  return typeof payload === "object" && payload !== null ? (payload as Record<string, unknown>) : null;
}

// The review of what was served: the latest one the reviewer wrote between
// the ticket's take and its service, if it concerns the delivery the pass last
// judged — same run, same commit — and it can be read. A review of an earlier
// delivery does not say what was delivered: nothing rather than a false
// summary. Without a pass — merged by hand, served from before the review —,
// there is none.
function relectureServie(base: Base, ticket: number, prise: number, service: number): Relecture | null {
  const relue = dernierFait(base, ticket, ["pass.reviewed"], prise, service);
  const jugee = dernierFait(base, ticket, ["pass.started"], prise, service);
  if (relue === null || jugee === null || relue.run !== jugee.run || relue.sha !== jugee.sha) return null;
  if (relue.outcome !== "green" && relue.outcome !== "red") return null;
  const summary = texteDe(relue.summary);
  return summary === null ? null : { summary, findings: constats(relue.findings) };
}

// The tickets served since `instant` — by the rail, or by the merge of their
// delivery —, whether they are still on the rail or not: most recent first. A
// ticket appears once, at its last service. An issue closed without having
// been served is not there: its fate is to be gone.
//
// The ticket may have left the rail: what is shown of it is re-read from the
// log, which keeps everything. The PR is that of the ticket's last merge
// before its service, and after its last take — a ticket served without a
// merge does not keep one from an earlier delivery. The review too: that of
// what was served.
export function livresDepuis(base: Base, instant: string): Livre[] {
  return base
    .lire<{ ticket: number; servedAt: string; seq: number }>(
      `SELECT o.ticket AS ticket, e.at AS servedAt, o.seq AS seq FROM rail_outcomes o JOIN events e ON e.seq = o.seq
       WHERE o.outcome = 'served' AND e.at >= ? ORDER BY e.at DESC, o.seq DESC`,
      instant,
    )
    .map(({ ticket, servedAt, seq }) => {
      // Its title of the day: an issue renamed after its service is renamed here too.
      const nomme = dernierFait(base, ticket, ["ticket.arrived", "ticket.changed"], 0, Number.MAX_SAFE_INTEGER);
      const entre = dernierFait(base, ticket, ["ticket.arrived"], 0, Number.MAX_SAFE_INTEGER);
      const prise = base.lire<{ seq: number | null }>("SELECT max(seq) AS seq FROM events WHERE ticket = ? AND type = 'ticket.taken' AND seq <= ?", ticket, seq)[0]?.seq ?? 0;
      return {
        ticket,
        title: texteDe(nomme?.title) ?? "",
        url: texteDe(entre?.url),
        servedAt,
        station: texteDe(dernierFait(base, ticket, ["ticket.passing"], 0, seq)?.station),
        pr: texteDe(dernierFait(base, ticket, ["merge.done"], prise, seq)?.pr),
        review: relectureServie(base, ticket, prise, seq),
      };
    });
}

function attendus(base: Base, card: Fiche | null): Attendu[] {
  return (card?.waitsFor ?? []).flatMap((ticket) => {
    const sort = sortDuTicket(base, ticket);
    if (sort?.outcome === "served") return [];
    // Un ticket redécoupé qui a quitté le rail n'est pas abandonné : ses
    // morceaux le servent. Tous servis, il est livré ; sinon ils sont en route,
    // et seul un morceau perdu le laisse bloquer ceux qui l'attendent.
    if (sort?.outcome === "left" && decoupageDe(base, ticket)?.state === "split") {
      const bilan = bilanDEpique(base, ticket);
      if (bilan.toutServi) return [];
      if (bilan.manquants.length === 0) return [{ ticket, left: null }];
    }
    return [{ ticket, left: sort ? { reason: sort.reason ?? "", seq: sort.seq } : null }];
  });
}

// The project's common paths, as the log carries them.
export function communsDuRail(base: Base): string[] {
  return base.lire<{ path: string }>("SELECT path FROM rail_commons ORDER BY path").map(({ path }) => path);
}

const lireFiche = (card: string | null) => (card === null ? null : (JSON.parse(card) as Fiche));

// Those who hold the zone of a queued ticket: the tickets in the kitchen —
// taken, in pass — and those the pass gave back, queued with a delivery still
// open (its branch, its worktree, its PR). All of them release their zone when
// their delivery is on the base. A ticket 86 holds nothing, whatever the
// reason and even with an open delivery: escalated to the chef, frozen, set
// aside for a quota, WAITING for a third party, re-split by the manager or
// lacking a station, it waits for a gesture or a time, not for a cook, and
// would hold back every ticket on its zone for as long (#1368). Put back on
// the rail, it claims its zone again under the same rule: queued with an open
// delivery, it holds it — and is itself held by a ticket that took that zone
// in the meantime. A ticket it already awaits does not appear: the dependency
// says so. An unreadable card holds nothing, its zone is not authoritative.
// And a ticket that itself has an open delivery is not held back by another
// queued ticket: two returns on the same zone would await each other forever.
// What a holder wrote outside its zone it holds too, under the same rule: a
// ticket that writes there would collide with it all the same (#1367).
function tenants(base: Base): (ticket: number, card: Fiche | null, delivery: string | null) => Tenu[] {
  let tenant: { ticket: number; zone: string[]; dehors: string[]; parti: boolean }[] | undefined;
  let communs: string[] = [];
  return (ticket, card, delivery) => {
    if (!card || card.zone.length === 0 || card.problems.length > 0) return [];
    if (!tenant) {
      communs = communsDuRail(base);
      const dehors = horsZoneDuRail(base);
      tenant = base
        .lire<{ ticket: number; card: string; state: Etat }>(
          `SELECT ticket, card, state FROM rail
           WHERE card IS NOT NULL
             AND ((state IN ('taken', 'pass') AND delivery IS NOT 'merged') OR (state = 'waiting' AND delivery = 'open'))
           ORDER BY ticket`,
        )
        .flatMap((ligne) => {
          const parsed = lireFiche(ligne.card);
          if (!parsed || parsed.problems.length > 0) return [];
          const ecrits = horsZone(parsed.zone, dehors.get(ligne.ticket) ?? [], communs);
          return parsed.zone.length > 0 || ecrits.length > 0 ? [{ ticket: ligne.ticket, zone: parsed.zone, dehors: ecrits, parti: ligne.state !== "waiting" }] : [];
        });
    }
    return tenant.flatMap((autre): Tenu[] => {
      if (autre.ticket === ticket || card.waitsFor.includes(autre.ticket) || (!autre.parti && delivery === "open")) return [];
      const path = recouvrement(card.zone, autre.zone, communs);
      if (path !== null) return [{ ticket: autre.ticket, path }];
      const dehors = recouvrement(card.zone, autre.dehors, communs);
      return dehors === null ? [] : [{ ticket: autre.ticket, path: dehors, outside: true }];
    });
  };
}

// What each ticket's last delivery wrote outside its zone at the take, as the
// log carries it: whether its card claims it today is read with the card.
function horsZoneDuRail(base: Base): Map<number, string[]> {
  const dehors = new Map<number, string[]>();
  for (const { ticket, path } of base.lire<{ ticket: number; path: string }>("SELECT ticket, path FROM rail_out_of_zone ORDER BY ticket, path")) {
    dehors.set(ticket, [...(dehors.get(ticket) ?? []), path]);
  }
  return dehors;
}

// The frozen tickets: 86 with no return time, for a delivery the pass could
// not judge and which is not on the base. Judged, given back, removed from the
// rail or merged, a ticket stops being so.
function gelesDuRail(base: Base): Set<number> {
  return new Set(
    base
      .lire<{ ticket: number }>("SELECT ticket FROM rail WHERE state = '86' AND until IS NULL AND reason = ? AND delivery IS NOT 'merged'", `pass:${NON_JUGEE}`)
      .map(({ ticket }) => ticket),
  );
}

// The WAITING tickets, and what each one awaits.
function attentesDeTiers(base: Base): Map<number, AttenteDeTiers> {
  return new Map(
    base
      .lire<Omit<AttenteDeTiers, "onArrival"> & { ticket: number; delivery: string | null }>(
        `SELECT w.ticket AS ticket, w.what AS what, w.who AS who, w.since AS since, w.follow_up AS followUp, r.delivery AS delivery
         FROM rail_waiting w JOIN rail r ON r.ticket = w.ticket WHERE r.state = '86' AND r.reason = ?`,
        ATTEND_UN_TIERS,
      )
      .map(({ ticket, delivery, ...attente }) => [ticket, { ...attente, onArrival: direALArrivee(delivery) }]),
  );
}

type Ligne = Omit<TicketRail, "card" | "awaits" | "held" | "outOfZone" | "frozenBy" | "waitingFor" | "resumedBecause"> & { card: string | null; delivery: string | null };
function lire(base: Base, suite: string, ...parametres: number[]): TicketRail[] {
  const tenu = tenants(base);
  const geles = gelesDuRail(base);
  const tiers = attentesDeTiers(base);
  const dehors = horsZoneDuRail(base);
  const communs = dehors.size === 0 ? [] : communsDuRail(base);
  const revenus = new Map(base.lire<{ ticket: number; why: string }>("SELECT ticket, why FROM rail_resumed").map(({ ticket, why }) => [ticket, why]));
  return base.lire<Ligne>(`SELECT ${COLONNES}, delivery FROM rail ${suite}`, ...parametres).map(({ delivery, ...ligne }) => {
    const card = lireFiche(ligne.card);
    const awaits = attendus(base, card);
    const held = ligne.state === "waiting" ? tenu(ligne.ticket, card, delivery) : [];
    const frozenBy = ligne.state === "waiting" ? awaits.map((a) => a.ticket).filter((numero) => geles.has(numero)) : [];
    const outOfZone = card === null || card.problems.length > 0 ? [] : horsZone(card.zone, dehors.get(ligne.ticket) ?? [], communs);
    return { ...ligne, card, awaits, held, outOfZone, frozenBy, waitingFor: tiers.get(ligne.ticket) ?? null, resumedBecause: revenus.get(ligne.ticket) ?? null };
  });
}

// How many non-brigade comments each marked wait saw when it was set.
export function commentairesEntendus(base: Base): Map<number, number> {
  return new Map(base.lire<{ ticket: number; heard: number }>("SELECT ticket, heard FROM rail_waiting_heard").map(({ ticket, heard }) => [ticket, heard]));
}

// What each ticket's issue says about its wait, as the runtime put it there,
// and what the rail knows of it: the tickets for which either is not empty.
// `marked`: the wait marked on the issue, or null; `waiting`: the rail's, or
// null — the ticket no longer waits, or is no longer on the rail.
export type MarqueDAttente = { ticket: number; marked: { what: string; who: string; followUp: string } | null; waiting: AttenteDeTiers | null };
export function marquesDAttente(base: Base): MarqueDAttente[] {
  const tiers = attentesDeTiers(base);
  const marquees = new Map(
    base
      .lire<{ ticket: number; mark: string | null }>("SELECT ticket, mark FROM rail_waiting_marks")
      .map(({ ticket, mark }) => [ticket, mark === null ? null : (JSON.parse(mark) as { what: string; who: string; followUp: string })]),
  );
  return [...new Set([...tiers.keys(), ...marquees.keys()])]
    .sort((a, b) => a - b)
    .map((ticket) => ({ ticket, marked: marquees.get(ticket) ?? null, waiting: tiers.get(ticket) ?? null }))
    .filter(({ marked, waiting }) => marked !== null || waiting !== null);
}

// What the issue's mark must say, for it to be up to date: the same text for
// the same wait.
export const texteDeMarque = (attente: { what: string; who: string; followUp: string } | null): string | null => (attente === null ? null : JSON.stringify(marqueDe(attente)));

// The rail in service order: `prio:1` first, tickets without a priority
// last; at equal priority, the oldest issue.
export function lireRail(base: Base): TicketRail[] {
  return lire(base, "ORDER BY priority IS NULL, priority, created_at, ticket");
}

export function ticketDuRail(base: Base, ticket: number): TicketRail | null {
  return lire(base, "WHERE ticket = ?", ticket)[0] ?? null;
}

// How many tickets the station holds: those it took and has not yet given
// back, sent to pass or declared 86 — one per cook, from the take to its end.
export function prisPar(base: Base, station: string): number {
  return base.lire<{ combien: number }>("SELECT count(*) AS combien FROM rail WHERE state = 'taken' AND station = ?", station)[0]?.combien ?? 0;
}
