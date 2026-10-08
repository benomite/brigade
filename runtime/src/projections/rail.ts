// Le rail : les tickets du projet, chacun avec son état. C'est ici que se lit
// « qu'y a-t-il à servir, qui tient quoi, et depuis quand ? ».
//
// Le temps n'entre jamais ici : un bail échu ne rend pas le ticket, c'est
// l'événement `ticket.released` qui le rend. Rejouer le journal à une autre
// heure redonne le même rail.
//
// Les dépendances non plus ne sont gardées nulle part : ce qu'un ticket attend
// est dans sa fiche, et le sort de chaque ticket — servi, ou parti sans l'être
// — dans une table que le journal remplit. Un ticket attendu n'a donc pas
// besoin d'être sur le rail pour qu'on sache s'il a été servi.
import type { Base } from "../base.ts";
import type { Evenement } from "../evenements.ts";
import type { FaitGardeFous } from "../evenements/garde-fous.ts";
import type { FaitPass } from "../evenements/pass.ts";
import type { FaitRail } from "../evenements/rail.ts";
import type { Fiche } from "../fiche.ts";
import { definirProjection } from "../projection.ts";
import { recouvrement } from "../zones.ts";

export type Etat = "waiting" | "taken" | "pass" | "served" | "86";

// Un ticket que la fiche dit d'attendre et qui n'a pas été servi. `left` : il a
// quitté le rail sans l'être — abandonné —, pourquoi, et par quel événement.
export type Attendu = { ticket: number; left: { reason: string; seq: number } | null };

// Un ticket parti en cuisine et pas encore servi, dont la zone recouvre celle
// de celui-ci. `path` : le chemin par lequel elles se recouvrent.
export type Tenu = { ticket: number; path: string };

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
  // Pris : la dernière fois que sa station a vu son worktree bouger — la
  // prise, puis chaque renouvellement du bail. Une date, jamais une durée.
  progressedAt: string | null;
  // Le calibrage posé sur l'issue, dimension par dimension.
  model: string | null;
  effort: string | null;
  // La fiche posée sur l'issue, ou null si elle n'en porte pas.
  card: Fiche | null;
  // Ceux des tickets de sa fiche qui ne sont pas servis. Vide : rien ne le
  // retient.
  awaits: Attendu[];
  // En attente : ceux qui tiennent un chemin de sa zone. Vide : sa zone est
  // libre.
  held: Tenu[];
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
const liste = (valeur: unknown, element: (valeur: unknown) => boolean) => Array.isArray(valeur) && valeur.every(element);
const ficheRienOuAbsente = (valeur: unknown) => {
  if (valeur === undefined || valeur === null) return true;
  if (typeof valeur !== "object") return false;
  const { waitsFor, zone, problems } = valeur as Record<string, unknown>;
  return liste(waitsFor, Number.isSafeInteger) && liste(zone, texte) && liste(problems, texte);
};

// Ce qu'un fait du rail doit porter pour être lisible.
const FORMES: { [T in FaitRail["type"]]: { [C in keyof Payload<T>]: (valeur: unknown) => boolean } } = {
  "ticket.arrived": { title: texte, priority: prioriteOuRien, createdAt: texte, url: texte, model: texteRienOuAbsent, effort: texteRienOuAbsent, card: ficheRienOuAbsente },
  "ticket.changed": { title: texte, priority: prioriteOuRien, model: texteRienOuAbsent, effort: texteRienOuAbsent, card: ficheRienOuAbsente },
  "ticket.left": { reason: texte },
  "ticket.taken": { station: texte, leaseUntil: texte },
  "ticket.renewed": { station: texte, leaseUntil: texte },
  "ticket.released": { reason: texte, station: texteOuRien },
  "ticket.passing": { station: texte },
  "ticket.served": {},
  "ticket.86": { reason: texte, until: texteOuRien },
  "ticket.blocked": { by: Number.isSafeInteger, reason: texte },
  "rail.commons": { paths: (valeur) => liste(valeur, texte) },
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

// La fiche telle que la table la garde : son JSON, champs dans un ordre fixe —
// deux fiches égales y sont le même texte.
const enTexte = (card: Fiche | null | undefined): string | null =>
  card ? JSON.stringify({ waitsFor: card.waitsFor, zone: card.zone, problems: card.problems }) : null;

type Changement = { state: Etat; station?: string | null; leaseUntil?: string | null; progressedAt?: string | null; reason?: string | null; until?: string | null };

// Fait entrer le ticket dans un état. Ce que le changement ne nomme pas est
// effacé : un état ne garde rien du précédent.
function passer(base: Base, ticket: number, at: string, changement: Changement): void {
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

// Le raccord avec les garde-fous : un ticket pris dont le cook est mort sans
// rien livrer revient en attente. Aucun fait de plus — la raison est déjà au
// journal du ticket (`guard.tripped`, `cook.exited`, `cook.interrupted`).
function rendreApresCook(base: Base, ticket: number | null, at: string): void {
  if (ticket === null) return;
  base.executer(
    `UPDATE rail SET state = 'waiting', since = ?, station = NULL, lease_until = NULL, progressed_at = NULL, reason = NULL, until = NULL
     WHERE ticket = ? AND state = 'taken'`,
    at,
    ticket,
  );
}

// Les fins de cook après lesquelles le ticket n'a plus rien à attendre de sa
// station. `ok` et `neutral` n'en sont pas : la station dit la suite (la pass,
// le 86).
const FINS_SANS_SUITE: unknown[] = ["failed", "guard", "stop"];

// Servi l'emporte sur parti, dans les deux ordres, et ne se défait pas.
function noterServi(base: Base, ticket: number, seq: number): void {
  base.executer(
    `INSERT INTO rail_outcomes (ticket, outcome, seq) VALUES (?, 'served', ?)
     ON CONFLICT (ticket) DO UPDATE SET outcome = 'served', reason = NULL, seq = excluded.seq`,
    ticket,
    seq,
  );
}

export const rail = definirProjection<
  FaitRail | Extract<FaitGardeFous, { type: "cook.exited" | "cook.interrupted" }> | Extract<FaitPass, { type: "merge.done" }>
>({
  nom: "rail",
  tables: ["rail", "rail_outcomes", "rail_commons"],
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
      lease_until TEXT,
      progressed_at TEXT,
      reason      TEXT,
      until       TEXT
    ) STRICT;
    -- Le sort d'un ticket, qu'il soit encore sur le rail ou non : servi, ou
    -- parti sans l'avoir été. Servi l'emporte, et ne se défait pas.
    CREATE TABLE IF NOT EXISTS rail_outcomes (
      ticket  INTEGER PRIMARY KEY,
      outcome TEXT NOT NULL CHECK (outcome IN ('served', 'left')),
      reason  TEXT,
      seq     INTEGER NOT NULL
    ) STRICT;
    -- Les chemins du projet qui n'appartiennent à aucun ticket.
    CREATE TABLE IF NOT EXISTS rail_commons (
      path TEXT PRIMARY KEY
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
      // Revenu sur le rail, il n'est plus abandonné.
      base.executer("DELETE FROM rail_outcomes WHERE ticket = ? AND outcome = 'left'", ticket);
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
      base.executer(
        `INSERT INTO rail_outcomes (ticket, outcome, reason, seq) VALUES (?, 'left', ?, ?)
         ON CONFLICT (ticket) DO UPDATE SET reason = excluded.reason, seq = excluded.seq WHERE outcome = 'left'`,
        ticket,
        payload.reason,
        seq,
      );
    }),
    "ticket.taken": lisible("ticket.taken", (base, ticket, { at, payload }) => {
      // Un ticket qui vient d'être pris n'a encore rien à se reprocher.
      passer(base, ticket, at, { state: "taken", station: payload.station, leaseUntil: payload.leaseUntil, progressedAt: at });
    }),
    // Le bail ne se renouvelle que sur un progrès du worktree : ce fait est
    // donc le fait de progrès. Le relevé d'un cook (`cook.progressed`) n'en
    // est pas un — il dit ce que le cook consomme, pas qu'il avance.
    "ticket.renewed": lisible("ticket.renewed", (base, ticket, { at, payload }) => {
      base.executer("UPDATE rail SET lease_until = ?, progressed_at = ? WHERE ticket = ? AND state = 'taken'", payload.leaseUntil, at, ticket);
    }),
    "ticket.released": lisible("ticket.released", (base, ticket, { at }) => {
      passer(base, ticket, at, { state: "waiting" });
    }),
    "ticket.passing": lisible("ticket.passing", (base, ticket, { at, payload }) => {
      passer(base, ticket, at, { state: "pass", station: payload.station });
    }),
    "ticket.served": lisible("ticket.served", (base, ticket, { at, seq }) => {
      base.executer("UPDATE rail SET state = 'served', since = ? WHERE ticket = ?", at, ticket);
      noterServi(base, ticket, seq);
    }),
    "ticket.86": lisible("ticket.86", (base, ticket, { at, payload }) => {
      passer(base, ticket, at, { state: "86", reason: payload.reason, until: payload.until });
    }),
    "ticket.blocked": () => {},
    "rail.commons": (base, { payload }) => {
      // Ce fait ne concerne aucun ticket : il ne passe pas par `lisible`.
      if (!FORMES["rail.commons"].paths(payload?.paths)) return;
      base.executer("DELETE FROM rail_commons");
      for (const path of new Set(payload.paths)) base.executer("INSERT INTO rail_commons (path) VALUES (?)", path);
    },
    "cook.exited": (base, { ticket, at, payload }) => {
      if (FINS_SANS_SUITE.includes(payload?.outcome)) rendreApresCook(base, ticket, at);
    },
    "cook.interrupted": (base, { ticket, at }) => rendreApresCook(base, ticket, at),
    // Le merge d'une livraison vaut service pour qui attend ce ticket, même si
    // le rail n'a pas pu le dire : un ticket remonté au chef (86) puis mergé
    // par lui n'est plus en pass, et `ticket.served` ne s'écrit pas. L'état du
    // ticket, lui, ne change pas ici.
    "merge.done": (base, { ticket, seq }) => {
      if (ticket !== null) noterServi(base, ticket, seq);
    },
  },
});

const COLONNES = `ticket, title, priority, created_at AS createdAt, url, state, since, model, effort, card, station,
  lease_until AS leaseUntil, progressed_at AS progressedAt, reason, until`;

export type Sort = { outcome: "served" | "left"; reason: string | null; seq: number };

// Ce que le journal sait du sort d'un ticket, ou null s'il n'a été ni servi ni
// vu partir — sur le rail, ou jamais entré.
export function sortDuTicket(base: Base, ticket: number): Sort | null {
  return base.lire<Sort>("SELECT outcome, reason, seq FROM rail_outcomes WHERE ticket = ?", ticket)[0] ?? null;
}

function attendus(base: Base, card: Fiche | null): Attendu[] {
  return (card?.waitsFor ?? []).flatMap((ticket) => {
    const sort = sortDuTicket(base, ticket);
    if (sort?.outcome === "served") return [];
    return [{ ticket, left: sort ? { reason: sort.reason ?? "", seq: sort.seq } : null }];
  });
}

// Les chemins communs du projet, tels que le journal les porte.
export function communsDuRail(base: Base): string[] {
  return base.lire<{ path: string }>("SELECT path FROM rail_commons ORDER BY path").map(({ path }) => path);
}

const lireFiche = (card: string | null) => (card === null ? null : (JSON.parse(card) as Fiche));

// Ceux qui tiennent la zone d'un ticket en attente : partis en cuisine — pris,
// en pass, 86 — et pas servis : un ticket remonté au chef puis mergé par lui
// reste 86, mais sa livraison est sur la base. Un ticket qu'il attend déjà n'y
// figure pas : la dépendance le dit. Une fiche illisible ne tient rien, sa
// zone ne fait pas foi.
function tenants(base: Base): (ticket: number, card: Fiche | null) => Tenu[] {
  let partis: { ticket: number; zone: string[] }[] | undefined;
  let communs: string[] = [];
  return (ticket, card) => {
    if (!card || card.zone.length === 0 || card.problems.length > 0) return [];
    if (!partis) {
      communs = communsDuRail(base);
      partis = base
        .lire<{ ticket: number; card: string }>(
          `SELECT ticket, card FROM rail
           WHERE state IN ('taken', 'pass', '86') AND card IS NOT NULL
             AND ticket NOT IN (SELECT ticket FROM rail_outcomes WHERE outcome = 'served')
           ORDER BY ticket`,
        )
        .flatMap((parti) => {
          const fiche = lireFiche(parti.card);
          return fiche && fiche.problems.length === 0 && fiche.zone.length > 0 ? [{ ticket: parti.ticket, zone: fiche.zone }] : [];
        });
    }
    return partis.flatMap((parti) => {
      if (parti.ticket === ticket || card.waitsFor.includes(parti.ticket)) return [];
      const path = recouvrement(card.zone, parti.zone, communs);
      return path === null ? [] : [{ ticket: parti.ticket, path }];
    });
  };
}

type Ligne = Omit<TicketRail, "card" | "awaits" | "held"> & { card: string | null };
function lire(base: Base, suite: string, ...parametres: number[]): TicketRail[] {
  const tenu = tenants(base);
  return base.lire<Ligne>(`SELECT ${COLONNES} FROM rail ${suite}`, ...parametres).map((ligne) => {
    const card = lireFiche(ligne.card);
    return { ...ligne, card, awaits: attendus(base, card), held: ligne.state === "waiting" ? tenu(ligne.ticket, card) : [] };
  });
}

// Le rail dans l'ordre de service : `prio:1` d'abord, les tickets sans
// priorité en dernier ; à priorité égale, l'issue la plus ancienne.
export function lireRail(base: Base): TicketRail[] {
  return lire(base, "ORDER BY priority IS NULL, priority, created_at, ticket");
}

export function ticketDuRail(base: Base, ticket: number): TicketRail | null {
  return lire(base, "WHERE ticket = ?", ticket)[0] ?? null;
}
