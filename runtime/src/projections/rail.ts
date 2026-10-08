// Le rail : les tickets du projet, chacun avec son état. C'est ici que se lit
// « qu'y a-t-il à servir, qui tient quoi, et depuis quand ? ».
//
// Le temps n'entre jamais ici : un bail échu ne rend pas le ticket, c'est
// l'événement `ticket.released` qui le rend. Rejouer le journal à une autre
// heure redonne le même rail.
import type { Base } from "../base.ts";
import type { Evenement } from "../evenements.ts";
import type { FaitGardeFous } from "../evenements/garde-fous.ts";
import type { FaitRail } from "../evenements/rail.ts";
import { definirProjection } from "../projection.ts";

export type Etat = "waiting" | "taken" | "pass" | "served" | "86";

export type TicketRail = {
  ticket: number;
  title: string;
  priority: number | null;
  createdAt: string;
  url: string;
  state: Etat;
  // Depuis quand il est dans cet état.
  since: string;
  // La station qui le tient (pris) ou qui l'a cuisiné (en pass, servi).
  station: string | null;
  leaseUntil: string | null;
  // Le calibrage posé sur l'issue, dimension par dimension.
  model: string | null;
  effort: string | null;
  // Motif et heure de retour d'un 86.
  reason: string | null;
  until: string | null;
};

type Payload<T extends FaitRail["type"]> = Required<Extract<FaitRail, { type: T }>["payload"]>;
type Effet<T extends FaitRail["type"]> = (base: Base, ticket: number, evenement: Evenement<Extract<FaitRail, { type: T }>>) => void;

const texte = (valeur: unknown) => typeof valeur === "string" && valeur !== "";
const texteOuRien = (valeur: unknown) => valeur === null || texte(valeur);
const texteRienOuAbsent = (valeur: unknown) => valeur === undefined || texteOuRien(valeur);
const prioriteOuRien = (valeur: unknown) => valeur === null || Number.isInteger(valeur);

// Ce qu'un fait du rail doit porter pour être lisible.
const FORMES: { [T in FaitRail["type"]]: { [C in keyof Payload<T>]: (valeur: unknown) => boolean } } = {
  "ticket.arrived": { title: texte, priority: prioriteOuRien, createdAt: texte, url: texte, model: texteRienOuAbsent, effort: texteRienOuAbsent },
  "ticket.changed": { title: texte, priority: prioriteOuRien, model: texteRienOuAbsent, effort: texteRienOuAbsent },
  "ticket.left": { reason: texte },
  "ticket.taken": { station: texte, leaseUntil: texte },
  "ticket.renewed": { station: texte, leaseUntil: texte },
  "ticket.released": { reason: texte, station: texteOuRien },
  "ticket.passing": { station: texte },
  "ticket.served": {},
  "ticket.86": { reason: texte, until: texteOuRien },
};

// Le journal est en ajout seul et rejoué à chaque démarrage : un fait illisible
// (sans ticket, ou d'une forme que cette version ne connaît pas) qui lèverait
// ici empêcherait le runtime de redémarrer, sans qu'on puisse le retirer. Il
// est donc ignoré — il reste au journal, sans effet sur le rail.
function lisible<T extends FaitRail["type"]>(type: T, effet: Effet<T>) {
  return (base: Base, evenement: Evenement<Extract<FaitRail, { type: T }>>) => {
    const payload = evenement.payload as Record<string, unknown>;
    const forme: Record<string, (valeur: unknown) => boolean> = FORMES[type];
    if (evenement.ticket === null || payload === null || typeof payload !== "object") return;
    for (const [champ, valide] of Object.entries(forme)) if (!valide(payload[champ])) return;
    effet(base, evenement.ticket, evenement);
  };
}

type Changement = { state: Etat; station?: string | null; leaseUntil?: string | null; reason?: string | null; until?: string | null };

// Fait entrer le ticket dans un état. Ce que le changement ne nomme pas est
// effacé : un état ne garde rien du précédent.
function passer(base: Base, ticket: number, at: string, changement: Changement): void {
  base.executer(
    "UPDATE rail SET state = ?, since = ?, station = ?, lease_until = ?, reason = ?, until = ? WHERE ticket = ?",
    changement.state,
    at,
    changement.station ?? null,
    changement.leaseUntil ?? null,
    changement.reason ?? null,
    changement.until ?? null,
    ticket,
  );
}

// Le raccord avec les garde-fous : un ticket pris dont le cook est mort sans
// rien livrer revient en attente. Aucun fait de plus — la raison est déjà au
// journal du ticket (`guard.tripped`, `cook.exited`, `cook.interrupted`).
function rendreApresCook(base: Base, ticket: number | null, at: string): void {
  if (ticket === null) return;
  base.executer(
    `UPDATE rail SET state = 'waiting', since = ?, station = NULL, lease_until = NULL, reason = NULL, until = NULL
     WHERE ticket = ? AND state = 'taken'`,
    at,
    ticket,
  );
}

// Les fins de cook après lesquelles le ticket n'a plus rien à attendre de sa
// station. `ok` et `neutral` n'en sont pas : la station dit la suite (la pass,
// le 86).
const FINS_SANS_SUITE: unknown[] = ["failed", "guard", "stop"];

export const rail = definirProjection<FaitRail | Extract<FaitGardeFous, { type: "cook.exited" | "cook.interrupted" }>>({
  nom: "rail",
  tables: ["rail"],
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
      station     TEXT,
      lease_until TEXT,
      reason      TEXT,
      until       TEXT
    ) STRICT;
  `,
  sur: {
    "ticket.arrived": lisible("ticket.arrived", (base, ticket, { at, payload }) => {
      base.executer(
        `INSERT OR REPLACE INTO rail (ticket, title, priority, created_at, url, state, since, model, effort)
         VALUES (?, ?, ?, ?, ?, 'waiting', ?, ?, ?)`,
        ticket,
        payload.title,
        payload.priority,
        payload.createdAt,
        payload.url,
        at,
        payload.model ?? null,
        payload.effort ?? null,
      );
    }),
    "ticket.changed": lisible("ticket.changed", (base, ticket, { payload }) => {
      base.executer(
        "UPDATE rail SET title = ?, priority = ?, model = ?, effort = ? WHERE ticket = ?",
        payload.title,
        payload.priority,
        payload.model ?? null,
        payload.effort ?? null,
        ticket,
      );
    }),
    "ticket.left": lisible("ticket.left", (base, ticket) => {
      base.executer("DELETE FROM rail WHERE ticket = ?", ticket);
    }),
    "ticket.taken": lisible("ticket.taken", (base, ticket, { at, payload }) => {
      passer(base, ticket, at, { state: "taken", station: payload.station, leaseUntil: payload.leaseUntil });
    }),
    "ticket.renewed": lisible("ticket.renewed", (base, ticket, { payload }) => {
      base.executer("UPDATE rail SET lease_until = ? WHERE ticket = ?", payload.leaseUntil, ticket);
    }),
    "ticket.released": lisible("ticket.released", (base, ticket, { at }) => {
      passer(base, ticket, at, { state: "waiting" });
    }),
    "ticket.passing": lisible("ticket.passing", (base, ticket, { at, payload }) => {
      passer(base, ticket, at, { state: "pass", station: payload.station });
    }),
    "ticket.served": lisible("ticket.served", (base, ticket, { at }) => {
      base.executer("UPDATE rail SET state = 'served', since = ? WHERE ticket = ?", at, ticket);
    }),
    "ticket.86": lisible("ticket.86", (base, ticket, { at, payload }) => {
      passer(base, ticket, at, { state: "86", reason: payload.reason, until: payload.until });
    }),
    "cook.exited": (base, { ticket, at, payload }) => {
      if (FINS_SANS_SUITE.includes(payload?.outcome)) rendreApresCook(base, ticket, at);
    },
    "cook.interrupted": (base, { ticket, at }) => rendreApresCook(base, ticket, at),
  },
});

const COLONNES = `ticket, title, priority, created_at AS createdAt, url, state, since, model, effort, station,
  lease_until AS leaseUntil, reason, until`;

// Le rail dans l'ordre de service : `prio:1` d'abord, les tickets sans
// priorité en dernier ; à priorité égale, l'issue la plus ancienne.
export function lireRail(base: Base): TicketRail[] {
  return base.lire<TicketRail>(`SELECT ${COLONNES} FROM rail ORDER BY priority IS NULL, priority, created_at, ticket`);
}

export function ticketDuRail(base: Base, ticket: number): TicketRail | null {
  return base.lire<TicketRail>(`SELECT ${COLONNES} FROM rail WHERE ticket = ?`, ticket)[0] ?? null;
}
