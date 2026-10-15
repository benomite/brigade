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
import { NON_JUGEE, type FaitPass, type Finding } from "../evenements/pass.ts";
import { ATTEND_UN_TIERS, REDECOUPE, REVENU_D_ATTENTE, SANS_STATION, type FaitRail } from "../evenements/rail.ts";
import type { Fiche } from "../fiche.ts";
import { definirProjection } from "../projection.ts";
import { recouvrement } from "../zones.ts";
import { constats } from "./pass.ts";

export type Etat = "waiting" | "taken" | "pass" | "served" | "86";

// Un ticket que la fiche dit d'attendre et qui n'a pas été servi. `left` : il a
// quitté le rail sans l'être — abandonné —, pourquoi, et par quel événement.
export type Attendu = { ticket: number; left: { reason: string; seq: number } | null };

// Ce qu'un ticket en WAITING attend d'un tiers : `what`, dans les mots du chef,
// de qui (`who`), depuis quand (`since`, sa mise en attente — une mise à jour
// ne le change pas), quand y revenir (`followUp`), et ce que « c'est arrivé »
// fera de lui (`onArrival`, en clair).
export type AttenteDeTiers = { what: string; who: string; since: string; followUp: string; onArrival: string };

// Ce que « c'est arrivé » fait d'un ticket en WAITING : il repart en cuisine,
// sans repasser devant le chef — sur sa livraison ouverte s'il en porte une.
export function direALArrivee(delivery: string | null): string {
  return delivery === "open"
    ? "il repart en cuisine, sans repasser par TODO : un cook reprend sa livraison ouverte (sa branche et sa PR)"
    : "il repart en cuisine, sans repasser par TODO : il est remis sur le rail, et un cook le prend à son tour";
}

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
  // En attente : ceux, parmi `awaits` et `held`, qui sont gelés — 86 que la
  // pass n'a pas pu juger, sans heure de retour : rien ne les fera repartir
  // sans le chef. Ce ticket ne partira pas avant eux. Ne change pas ce qui le
  // retient, seulement ce qu'on en dit.
  frozenBy: number[];
  // Motif et heure de retour d'un 86.
  reason: string | null;
  until: string | null;
  // En WAITING — 86 en attente d'un tiers —, ce qu'il attend. Nul sinon.
  waitingFor: AttenteDeTiers | null;
  // Revenu de WAITING vers TODO : pourquoi, en clair (« relance du 21/10 : pas
  // de réponse », « nouveau sur l'issue », « chef »). Nul sinon, et dès que
  // le ticket change d'état.
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
  // `requires` : absent d'une fiche qui ne demande aucune capacité, et de
  // toutes celles écrites avant que le rail ne les lise.
  return liste(waitsFor, Number.isSafeInteger) && liste(zone, texte) && liste(problems, texte) && (requires === undefined || liste(requires, texte));
};

const marque = (valeur: unknown) => {
  if (typeof valeur !== "object" || valeur === null) return false;
  const { what, who, followUp } = valeur as Record<string, unknown>;
  return texte(what) && texte(who) && texte(followUp);
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
  "ticket.waiting": { what: texte, who: texte, followUp: texte },
  "ticket.resumed": { to: (valeur) => valeur === "todo" || valeur === "kitchen", why: texte },
  "waiting.marked": { waiting: (valeur) => valeur === null || marque(valeur), heard: (valeur) => valeur === undefined || Number.isSafeInteger(valeur) },
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
// deux fiches égales y sont le même texte. Les capacités n'y figurent que
// demandées : une fiche qui n'en demande aucune garde son texte d'avant.
const enTexte = (card: Fiche | null | undefined): string | null =>
  card ? JSON.stringify({ waitsFor: card.waitsFor, zone: card.zone, problems: card.problems, ...(card.requires?.length ? { requires: card.requires } : {}) }) : null;

type Changement = { state: Etat; station?: string | null; leaseUntil?: string | null; progressedAt?: string | null; reason?: string | null; until?: string | null };

// Fait entrer le ticket dans un état. Ce que le changement ne nomme pas est
// effacé : un état ne garde rien du précédent — pas même son attente d'un
// tiers, que seul `ticket.waiting` pose.
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
// station. `ok`, `neutral` et `refused` n'en sont pas : la station dit la
// suite (la pass, le 86, un nouvel essai ou la remontée au chef).
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
  tables: ["rail", "rail_outcomes", "rail_commons", "rail_waiting", "rail_waiting_marks", "rail_waiting_heard", "rail_resumed"],
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
      -- Ce que le ticket a livré : 'open', une livraison partie en pass et
      -- pas encore sur la base ; 'merged', elle y est. Nul : rien de livré.
      delivery    TEXT CHECK (delivery IN ('open', 'merged')),
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
    -- Les tickets en WAITING : ce qu'ils attendent d'un tiers, et l'état où
    -- ils étaient avant d'attendre — celui où « reprendre » les remet.
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
    -- Ce que l'issue de chaque ticket dit de son attente, tel que le runtime
    -- l'y a posé : le JSON de l'attente marquée, ou nul — marque retirée.
    CREATE TABLE IF NOT EXISTS rail_waiting_marks (
      ticket INTEGER PRIMARY KEY,
      mark   TEXT
    ) STRICT;
    -- Combien de commentaires hors brigade l'issue portait quand son attente a
    -- été marquée : ce qui s'y ajoute ensuite ramène le ticket.
    CREATE TABLE IF NOT EXISTS rail_waiting_heard (
      ticket INTEGER PRIMARY KEY,
      heard  INTEGER NOT NULL
    ) STRICT;
    -- Pourquoi un ticket est revenu de WAITING vers TODO.
    CREATE TABLE IF NOT EXISTS rail_resumed (
      ticket INTEGER PRIMARY KEY,
      why    TEXT NOT NULL
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
      // Revenu sur le rail, il n'est plus abandonné — et n'attend plus personne.
      base.executer("DELETE FROM rail_outcomes WHERE ticket = ? AND outcome = 'left'", ticket);
      base.executer("DELETE FROM rail_waiting WHERE ticket = ?", ticket);
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
      base.executer("DELETE FROM rail_waiting WHERE ticket = ?", ticket);
      base.executer(
        `INSERT INTO rail_outcomes (ticket, outcome, reason, seq) VALUES (?, 'left', ?, ?)
         ON CONFLICT (ticket) DO UPDATE SET reason = excluded.reason, seq = excluded.seq WHERE outcome = 'left'`,
        ticket,
        payload.reason,
        seq,
      );
    }),
    "ticket.taken": lisible("ticket.taken", (base, ticket, { at, payload }) => {
      // Un ticket repris après le merge de sa livraison en prépare une autre.
      base.executer("UPDATE rail SET delivery = NULL WHERE ticket = ? AND delivery = 'merged'", ticket);
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
      base.executer("UPDATE rail SET delivery = 'open' WHERE ticket = ?", ticket);
    }),
    "ticket.served": lisible("ticket.served", (base, ticket, { at, seq }) => {
      base.executer("UPDATE rail SET state = 'served', since = ? WHERE ticket = ?", at, ticket);
      noterServi(base, ticket, seq);
    }),
    "ticket.86": lisible("ticket.86", (base, ticket, { at, payload }) => {
      passer(base, ticket, at, { state: "86", reason: payload.reason, until: payload.until });
    }),
    "ticket.blocked": () => {},
    // Seul un ticket en attente sur le rail, ou mis de côté, attend un tiers :
    // pris, en pass ou servi, la cuisine le tient.
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
    // Vers le chef : l'état d'avant l'attente s'il était mis de côté, sinon mis
    // de côté pour lui. Vers la cuisine : en attente sur le rail. Un ticket
    // revenu vers le chef repart en cuisine du même geste.
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
      // Le décompte se pose à la première marque de cette attente, et ne bouge
      // plus : une mise à jour ne fait pas oublier ce qui est arrivé entre-temps.
      if (payload.waiting === null) base.executer("DELETE FROM rail_waiting_heard WHERE ticket = ?", ticket);
      else if (payload.heard !== undefined) base.executer("INSERT OR IGNORE INTO rail_waiting_heard (ticket, heard) VALUES (?, ?)", ticket, payload.heard);
    }),
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
      if (ticket === null) return;
      noterServi(base, ticket, seq);
      base.executer("UPDATE rail SET delivery = 'merged' WHERE ticket = ?", ticket);
    },
  },
});

// Une marque, champs dans un ordre fixe : deux marques égales y sont le même texte.
const marqueDe = ({ what, who, followUp }: { what: string; who: string; followUp: string }) => ({ what, who, followUp });

const COLONNES = `ticket, title, priority, created_at AS createdAt, url, state, since, model, effort, card, station,
  lease_until AS leaseUntil, progressed_at AS progressedAt, reason, until`;

export type Sort = { outcome: "served" | "left"; reason: string | null; seq: number };

// Ce que le journal sait du sort d'un ticket, ou null s'il n'a été ni servi ni
// vu partir — sur le rail, ou jamais entré.
export function sortDuTicket(base: Base, ticket: number): Sort | null {
  return base.lire<Sort>("SELECT outcome, reason, seq FROM rail_outcomes WHERE ticket = ?", ticket)[0] ?? null;
}

// Un ticket servi, tel qu'on le montre après coup : son titre et l'adresse de
// son issue, quand il a été servi, la station qui l'a cuisiné, et la PR mergée.
// `title` vide, `url` nulle : le journal n'a jamais vu le ticket entrer sur le
// rail — une livraison hors du rail. `station` nulle : aucune station ne l'a
// envoyé en pass. `pr` nulle : servi sans merge, il n'avait rien à livrer.
// `review` : ce que le reviewer a dit de la livraison servie, mot pour mot —
// nulle quand aucune relecture lisible ne porte sur elle.
export type Livre = { ticket: number; title: string; url: string | null; servedAt: string; station: string | null; pr: string | null; review: Relecture | null };
// Le résumé du reviewer et ses constats, tels qu'il les a écrits.
export type Relecture = { summary: string; findings: Finding[] };

const texteDe = (valeur: unknown) => (typeof valeur === "string" && valeur !== "" ? valeur : null);

// La charge du dernier fait de ce type, pour ce ticket, entre deux numéros.
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

// La relecture de ce qui a été servi : la dernière que le reviewer a écrite
// entre la prise du ticket et son service, si elle porte sur la livraison que
// la pass jugeait en dernier — même run, même commit — et qu'elle se lit. Une
// relecture d'une livraison d'avant ne dit pas ce qui a été livré : rien
// plutôt qu'un résumé faux. Sans pass — mergé à la main, servi d'avant la
// relecture —, il n'y en a pas.
function relectureServie(base: Base, ticket: number, prise: number, service: number): Relecture | null {
  const relue = dernierFait(base, ticket, ["pass.reviewed"], prise, service);
  const jugee = dernierFait(base, ticket, ["pass.started"], prise, service);
  if (relue === null || jugee === null || relue.run !== jugee.run || relue.sha !== jugee.sha) return null;
  if (relue.outcome !== "green" && relue.outcome !== "red") return null;
  const summary = texteDe(relue.summary);
  return summary === null ? null : { summary, findings: constats(relue.findings) };
}

// Les tickets servis depuis `instant` — par le rail, ou par le merge de leur
// livraison —, qu'ils soient encore sur le rail ou non : le plus récent
// d'abord. Un ticket y est une fois, à son dernier service. Une issue fermée
// sans avoir été servie n'y est pas : son sort est d'être partie.
//
// Le ticket a pu quitter le rail : ce qu'on en montre se relit au journal, qui
// garde tout. La PR est celle du dernier merge du ticket avant son service, et
// après sa dernière prise — un ticket servi sans merge n'en garde pas une d'une
// livraison d'avant. La relecture aussi : celle de ce qui a été servi.
export function livresDepuis(base: Base, instant: string): Livre[] {
  return base
    .lire<{ ticket: number; servedAt: string; seq: number }>(
      `SELECT o.ticket AS ticket, e.at AS servedAt, o.seq AS seq FROM rail_outcomes o JOIN events e ON e.seq = o.seq
       WHERE o.outcome = 'served' AND e.at >= ? ORDER BY e.at DESC, o.seq DESC`,
      instant,
    )
    .map(({ ticket, servedAt, seq }) => {
      // Son titre du jour : une issue renommée après son service l'est ici aussi.
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
    return [{ ticket, left: sort ? { reason: sort.reason ?? "", seq: sort.seq } : null }];
  });
}

// Les chemins communs du projet, tels que le journal les porte.
export function communsDuRail(base: Base): string[] {
  return base.lire<{ path: string }>("SELECT path FROM rail_commons ORDER BY path").map(({ path }) => path);
}

const lireFiche = (card: string | null) => (card === null ? null : (JSON.parse(card) as Fiche));

// Ceux qui tiennent la zone d'un ticket en attente : les tickets partis en
// cuisine — pris, en pass, 86 — et ceux que la pass a rendus, en attente avec
// une livraison encore ouverte (sa branche, son worktree, sa PR). Tous lâchent
// leur zone quand leur livraison est sur la base : un ticket remonté au chef
// puis mergé par lui reste 86, sans plus rien tenir. Un ticket que le manager a
// redécoupé non plus, PR ouverte ou pas : ses sous-tickets recouvrent sa zone,
// et il les retiendrait pour toujours. Ni un ticket 86 faute de station qui
// fournisse ce qu'il demande : il n'est jamais parti, et ne partira pas avant
// un geste du chef — sauf s'il porte une livraison ouverte. Ni, de même, un
// ticket en WAITING ou revenu de WAITING devant le chef. Un ticket qu'il attend
// déjà n'y figure pas : la dépendance le dit. Une fiche illisible ne tient
// rien, sa zone ne fait pas foi. Et un ticket qui a lui-même une livraison
// ouverte n'est pas retenu par un autre ticket en attente : deux renvois sur
// une même zone s'attendraient l'un l'autre sans fin.
function tenants(base: Base): (ticket: number, card: Fiche | null, delivery: string | null) => Tenu[] {
  let tenant: { ticket: number; zone: string[]; parti: boolean }[] | undefined;
  let communs: string[] = [];
  return (ticket, card, delivery) => {
    if (!card || card.zone.length === 0 || card.problems.length > 0) return [];
    if (!tenant) {
      communs = communsDuRail(base);
      tenant = base
        .lire<{ ticket: number; card: string; state: Etat }>(
          `SELECT ticket, card, state FROM rail
           WHERE card IS NOT NULL
             AND ((state IN ('taken', 'pass', '86') AND delivery IS NOT 'merged') OR (state = 'waiting' AND delivery = 'open'))
             AND NOT (state = '86' AND reason IS ?)
             AND NOT (state = '86' AND delivery IS NULL AND substr(coalesce(reason, ''), 1, ?) = ?)
             AND NOT (state = '86' AND delivery IS NULL AND reason IN (?, ?))
           ORDER BY ticket`,
          REDECOUPE,
          SANS_STATION.length + 1,
          `${SANS_STATION}:`,
          ATTEND_UN_TIERS,
          REVENU_D_ATTENTE,
        )
        .flatMap((ligne) => {
          const fiche = lireFiche(ligne.card);
          return fiche && fiche.problems.length === 0 && fiche.zone.length > 0 ? [{ ticket: ligne.ticket, zone: fiche.zone, parti: ligne.state !== "waiting" }] : [];
        });
    }
    return tenant.flatMap((autre) => {
      if (autre.ticket === ticket || card.waitsFor.includes(autre.ticket) || (!autre.parti && delivery === "open")) return [];
      const path = recouvrement(card.zone, autre.zone, communs);
      return path === null ? [] : [{ ticket: autre.ticket, path }];
    });
  };
}

// Les tickets gelés : 86 sans heure de retour, pour une livraison que la pass
// n'a pas pu juger et qui n'est pas sur la base. Jugé, rendu, retiré du rail
// ou mergé, un ticket cesse de l'être.
function gelesDuRail(base: Base): Set<number> {
  return new Set(
    base
      .lire<{ ticket: number }>("SELECT ticket FROM rail WHERE state = '86' AND until IS NULL AND reason = ? AND delivery IS NOT 'merged'", `pass:${NON_JUGEE}`)
      .map(({ ticket }) => ticket),
  );
}

// Les tickets en WAITING, et ce que chacun attend.
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

type Ligne = Omit<TicketRail, "card" | "awaits" | "held" | "frozenBy" | "waitingFor" | "resumedBecause"> & { card: string | null; delivery: string | null };
function lire(base: Base, suite: string, ...parametres: number[]): TicketRail[] {
  const tenu = tenants(base);
  const geles = gelesDuRail(base);
  const tiers = attentesDeTiers(base);
  const revenus = new Map(base.lire<{ ticket: number; why: string }>("SELECT ticket, why FROM rail_resumed").map(({ ticket, why }) => [ticket, why]));
  return base.lire<Ligne>(`SELECT ${COLONNES}, delivery FROM rail ${suite}`, ...parametres).map(({ delivery, ...ligne }) => {
    const card = lireFiche(ligne.card);
    const awaits = attendus(base, card);
    const held = ligne.state === "waiting" ? tenu(ligne.ticket, card, delivery) : [];
    const frozenBy = ligne.state === "waiting" ? [...new Set([...awaits.map((a) => a.ticket), ...held.map((t) => t.ticket)])].filter((numero) => geles.has(numero)) : [];
    return { ...ligne, card, awaits, held, frozenBy, waitingFor: tiers.get(ligne.ticket) ?? null, resumedBecause: revenus.get(ligne.ticket) ?? null };
  });
}

// Combien de commentaires hors brigade chaque attente marquée a vus à sa pose.
export function commentairesEntendus(base: Base): Map<number, number> {
  return new Map(base.lire<{ ticket: number; heard: number }>("SELECT ticket, heard FROM rail_waiting_heard").map(({ ticket, heard }) => [ticket, heard]));
}

// Ce que l'issue de chaque ticket dit de son attente, tel que le runtime l'y a
// posé, et ce que le rail en sait : les tickets dont l'une ou l'autre n'est pas
// vide. `marked` : l'attente marquée sur l'issue, ou nulle ; `waiting` : celle
// du rail, ou nulle — le ticket n'attend plus, ou n'est plus sur le rail.
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

// Ce que la marque de l'issue doit dire, pour qu'elle soit à jour : le même
// texte pour la même attente.
export const texteDeMarque = (attente: { what: string; who: string; followUp: string } | null): string | null => (attente === null ? null : JSON.stringify(marqueDe(attente)));

// Le rail dans l'ordre de service : `prio:1` d'abord, les tickets sans
// priorité en dernier ; à priorité égale, l'issue la plus ancienne.
export function lireRail(base: Base): TicketRail[] {
  return lire(base, "ORDER BY priority IS NULL, priority, created_at, ticket");
}

export function ticketDuRail(base: Base, ticket: number): TicketRail | null {
  return lire(base, "WHERE ticket = ?", ticket)[0] ?? null;
}

// Combien de tickets la station tient : ceux qu'elle a pris et pas encore
// rendus, envoyés en pass ni déclarés 86 — un par cook, de la prise à sa fin.
export function prisPar(base: Base, station: string): number {
  return base.lire<{ combien: number }>("SELECT count(*) AS combien FROM rail WHERE state = 'taken' AND station = ?", station)[0]?.combien ?? 0;
}
