// Les découpages du manager : où en est chaque épique qu'il a regardée — une
// question posée, un découpage en cours ou fait —, et les tickets de chacune,
// nés de lui ou rattachés par le chef. C'est ici qu'il lit, à chaque réveil,
// ce qui reste à créer : il ne garde rien en mémoire.
import type { Base } from "../base.ts";
import type { FaitManager, TicketPrevu } from "../evenements/manager.ts";
import { definirProjection } from "../projection.ts";

type FaitDecoupage = Extract<FaitManager, { type: `manager.split${string}` | "manager.closed" | "manager.reopened" }>;

export type Decoupage = {
  epic: number;
  // `split` : découpée, pour toujours. Les trois autres se rejugent quand
  // l'épique change : `asked`, une question attend le chef ; `skipped`, elle
  // liste déjà ses tickets ; `failed`, découpage illisible.
  state: "split" | "asked" | "skipped" | "failed";
  fingerprint: string;
  run: string | null;
  // Le motif du découpage, la question, ou ce qui rend la réponse illisible.
  reason: string;
  // Pourquoi cet ordre ; nul hors d'un découpage.
  order: string | null;
  tickets: TicketPrevu[];
  // Tous les tickets prévus existent et sont lancés.
  done: boolean;
  commented: boolean;
  // L'empreinte de la liste écrite dans le corps de l'épique, ou null.
  listed: string | null;
  at: string;
};

export type TicketDEpique = {
  ticket: number;
  epic: number;
  // Son rang dans le découpage, à partir de 1 ; nul pour un ticket du chef.
  index: number | null;
  title: string;
  // L'issue est ouverte, d'après le dernier sondage qui l'a regardée.
  open: boolean;
  // Sa fiche et `fire` sont posés. Toujours faux pour un ticket du chef.
  fired: boolean;
};

const texte = (valeur: unknown): string => (typeof valeur === "string" ? valeur : "");
const entier = (valeur: unknown): valeur is number => Number.isSafeInteger(valeur);

// Une décision sur une épique remplace la précédente — sauf un découpage, qui
// ne se défait ni ne se refait.
const decider = (base: Base, epic: number | null, seq: number, at: string, decision: Pick<Decoupage, "state" | "fingerprint" | "run" | "reason"> & { order?: string; tickets?: unknown }) => {
  if (epic === null) return;
  base.executer(
    `INSERT INTO manager_splits (epic, state, fingerprint, run, reason, ordering, tickets, decided_seq, at)
     VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?)
     ON CONFLICT (epic) DO UPDATE SET
       state = excluded.state, fingerprint = excluded.fingerprint, run = excluded.run, reason = excluded.reason,
       ordering = excluded.ordering, tickets = excluded.tickets, decided_seq = excluded.decided_seq, at = excluded.at, commented = 0, closed = 0
     WHERE manager_splits.state != 'split'`,
    epic,
    decision.state,
    decision.fingerprint,
    decision.run,
    decision.reason,
    decision.order ?? null,
    JSON.stringify(Array.isArray(decision.tickets) ? decision.tickets : []),
    seq,
    at,
  );
};

const autre = (state: "asked" | "skipped" | "failed", champ: "question" | "reason") => (base: Base, { ticket, seq, at, payload }: { ticket: number | null; seq: number; at: string; payload: Record<string, unknown> }) =>
  decider(base, ticket, seq, at, { state, fingerprint: texte(payload.fingerprint), run: texte(payload.run) || null, reason: texte(payload[champ]) });

const fermer = (closed: number) => (base: Base, { ticket }: { ticket: number | null }) => {
  base.executer("UPDATE manager_splits SET closed = ? WHERE epic IS ?", closed, ticket);
};

export const decoupages = definirProjection<FaitDecoupage>({
  nom: "decoupages",
  tables: ["manager_splits", "manager_split_tickets", "manager_split_intents"],
  schema: `
    CREATE TABLE IF NOT EXISTS manager_splits (
      epic        INTEGER PRIMARY KEY,
      state       TEXT NOT NULL,
      fingerprint TEXT NOT NULL,
      run         TEXT,
      reason      TEXT NOT NULL,
      ordering    TEXT,
      tickets     TEXT NOT NULL DEFAULT '[]',
      done        INTEGER NOT NULL DEFAULT 0,
      commented   INTEGER NOT NULL DEFAULT 0,
      listed      TEXT,
      decided_seq INTEGER NOT NULL,
      at          TEXT NOT NULL,
      closed      INTEGER NOT NULL DEFAULT 0
    ) STRICT;
    CREATE TABLE IF NOT EXISTS manager_split_tickets (
      ticket INTEGER PRIMARY KEY,
      epic   INTEGER NOT NULL,
      idx    INTEGER,
      title  TEXT NOT NULL,
      open   INTEGER NOT NULL DEFAULT 1,
      fired  INTEGER NOT NULL DEFAULT 0
    ) STRICT;
    -- Les créations annoncées : celles sans ticket derrière elles sont à
    -- chercher sur GitHub avant d'être refaites.
    CREATE TABLE IF NOT EXISTS manager_split_intents (
      epic INTEGER NOT NULL,
      idx  INTEGER NOT NULL,
      PRIMARY KEY (epic, idx)
    ) STRICT;
  `,
  sur: {
    "manager.split": (base, { ticket, seq, at, payload }) => {
      decider(base, ticket, seq, at, {
        state: "split",
        fingerprint: texte(payload.fingerprint),
        run: texte(payload.run) || null,
        reason: texte(payload.reason),
        order: texte(payload.order),
        tickets: payload.tickets,
      });
    },
    "manager.split-asked": autre("asked", "question"),
    "manager.split-skipped": autre("skipped", "reason"),
    "manager.split-failed": autre("failed", "reason"),
    "manager.split-creating": (base, { ticket, payload }) => {
      if (ticket !== null && entier(payload.index)) base.executer("INSERT OR IGNORE INTO manager_split_intents (epic, idx) VALUES (?, ?)", ticket, payload.index);
    },
    "manager.split-created": (base, { ticket, payload }) => {
      if (ticket === null || !entier(payload.epic) || !entier(payload.index)) return;
      const prevus = base.lire<{ tickets: string }>("SELECT tickets FROM manager_splits WHERE epic = ?", payload.epic)[0];
      const prevu = (JSON.parse(prevus?.tickets ?? "[]") as TicketPrevu[])[payload.index - 1];
      base.executer("INSERT OR REPLACE INTO manager_split_tickets (ticket, epic, idx, title) VALUES (?, ?, ?, ?)", ticket, payload.epic, payload.index, texte(prevu?.title));
    },
    "manager.split-fired": (base, { ticket }) => {
      base.executer("UPDATE manager_split_tickets SET fired = 1 WHERE ticket IS ?", ticket);
    },
    "manager.split-done": (base, { ticket }) => {
      base.executer("UPDATE manager_splits SET done = 1 WHERE epic IS ? AND state = 'split'", ticket);
    },
    "manager.split-commented": (base, { ticket }) => {
      base.executer("UPDATE manager_splits SET commented = 1 WHERE epic IS ?", ticket);
    },
    "manager.split-adopted": (base, { ticket, payload }) => {
      if (ticket === null || !entier(payload.epic)) return;
      base.executer("INSERT OR IGNORE INTO manager_split_tickets (ticket, epic, idx, title) VALUES (?, ?, NULL, ?)", ticket, payload.epic, texte(payload.title));
    },
    "manager.split-seen": (base, { ticket, payload }) => {
      base.executer("UPDATE manager_split_tickets SET open = ? WHERE ticket IS ?", payload.open === false ? 0 : 1, ticket);
    },
    "manager.split-listed": (base, { ticket, payload }) => {
      base.executer("UPDATE manager_splits SET listed = ? WHERE epic IS ?", texte(payload.digest), ticket);
    },
    "manager.closed": fermer(1),
    "manager.reopened": fermer(0),
  },
});

type LigneDecoupage = Omit<Decoupage, "tickets" | "done" | "commented"> & { tickets: string; done: number; commented: number };
const COLONNES = "epic, state, fingerprint, run, reason, ordering AS \"order\", tickets, done, commented, listed, at";

const lire = (base: Base, suite: string, ...parametres: number[]): Decoupage[] =>
  base.lire<LigneDecoupage>(`SELECT ${COLONNES} FROM manager_splits ${suite}`, ...parametres).map((ligne) => ({
    ...ligne,
    tickets: JSON.parse(ligne.tickets) as TicketPrevu[],
    done: ligne.done === 1,
    commented: ligne.commented === 1,
  }));

export function decoupageDe(base: Base, epic: number): Decoupage | null {
  return lire(base, "WHERE epic = ?", epic)[0] ?? null;
}

// Les épiques découpées, la plus ancienne d'abord.
export function epiquesDecoupees(base: Base): Decoupage[] {
  return lire(base, "WHERE state = 'split' ORDER BY decided_seq");
}

// Les dernières décisions de découpage, la plus récente d'abord.
export function decoupagesDuManager(base: Base, combien: number): Decoupage[] {
  return lire(base, "ORDER BY decided_seq DESC LIMIT ?", combien);
}

// Une épique dont le manager attend le chef : il y a posé une question, ou son
// découpage ne se lit pas. `closed` : elle a quitté la liste des issues
// ouvertes depuis.
export type EpiqueEnAttente = { epic: number; state: "asked" | "failed"; at: string; closed: boolean };

export function epiquesEnAttente(base: Base): EpiqueEnAttente[] {
  return base
    .lire<Omit<EpiqueEnAttente, "closed"> & { closed: number }>("SELECT epic, state, at, closed FROM manager_splits WHERE state IN ('asked', 'failed') ORDER BY epic")
    .map((ligne) => ({ ...ligne, closed: ligne.closed === 1 }));
}

type LigneTicket = Omit<TicketDEpique, "index" | "open" | "fired"> & { idx: number | null; open: number; fired: number };
const tickets = (base: Base, suite: string, parametre: number): TicketDEpique[] =>
  base
    .lire<LigneTicket>(`SELECT ticket, epic, idx, title, open, fired FROM manager_split_tickets ${suite}`, parametre)
    .map(({ idx, open, fired, ...ligne }) => ({ ...ligne, index: idx, open: open === 1, fired: fired === 1 }));

// Les tickets d'une épique : ceux du découpage dans leur ordre, puis ceux que
// le chef y a rattachés.
export function ticketsDEpique(base: Base, epic: number): TicketDEpique[] {
  return tickets(base, "WHERE epic = ? ORDER BY idx IS NULL, idx, ticket", epic);
}

export function ticketDEpique(base: Base, ticket: number): TicketDEpique | null {
  return tickets(base, "WHERE ticket = ?", ticket)[0] ?? null;
}

// Les rangs dont la création a été annoncée.
export function creationsAnnoncees(base: Base, epic: number): number[] {
  return base.lire<{ idx: number }>("SELECT idx FROM manager_split_intents WHERE epic = ?", epic).map(({ idx }) => idx);
}
