// La file de la pass : les livraisons dans leur pass — leurs gates, leur
// relecture, leur CI, puis leur merge en vol —, et celles qui attendent leur
// tour, dans l'ordre où elles ont été livrées : celui de leur dernier
// `ticket.passing`, ou de leur `pass.entered` hors du rail. Plusieurs
// livraisons sont dans leur pass à la fois quand leurs zones ne se recouvrent
// pas — les zones que le manager donne à chaque ticket, sur sa fiche —, au plus
// autant que le plafond des jugements simultanés (`BRIGADE_MAX_JUDGEMENTS`).
// Deux livraisons sur une même zone s'attendent ; celle qui n'a pas de zone,
// ou qui a écrit hors de la sienne, se juge seule. Une livraison qui ne
// commence pas — GitHub qui bute, une PR qui ne s'ouvre pas — ne tient pas la
// file : seule en tient une place celle qui est dans sa pass.
import type { Base } from "./base.ts";
import type { Journal } from "./journal.ts";
import { JUGEMENTS_PAR_DEFAUT } from "./plafonds.ts";
import { plafondDesJugements } from "./projections/guardrails.ts";
import { lirePass, passDuTicket, type PassDeTicket } from "./projections/pass.ts";
import { communsDuRail, ticketDuRail } from "./projections/rail.ts";
import { sessionEnCours } from "./projections/sessions.ts";
import { nomEtatEn } from "./rail.ts";
import { recouvrement } from "./zones.ts";

// Les phases d'une livraison dans sa pass : jugée, ou son merge en vol.
const DANS_SA_PASS = ["judging", "merging"];

// La pass suit encore cette livraison : son ticket est en pass, ou elle est hors du rail.
const suivie = (base: Base, livraison: PassDeTicket) => livraison.horsRail || ticketDuRail(base, livraison.ticket)?.state === "pass";

// Les livraisons que la pass connaît, dans l'ordre de la file. Celles qui
// n'ont jamais été livrées — un premier cook en cours — viennent après, par numéro.
// `ecartees` : celles dont le jugement n'a pas pu commencer — elles passent
// après les autres, pour ne pas leur tenir la file.
export function fileDeLaPass(base: Base, ecartees: ReadonlySet<number> = new Set()): PassDeTicket[] {
  const livrees = new Map(
    base
      .lire<{ ticket: number; seq: number }>("SELECT ticket, MAX(seq) AS seq FROM events WHERE type IN ('ticket.passing', 'pass.entered') AND ticket IN (SELECT ticket FROM pass) GROUP BY ticket")
      .map(({ ticket, seq }) => [ticket, seq]),
  );
  const rang = (livraison: PassDeTicket) => livrees.get(livraison.ticket) ?? Number.MAX_SAFE_INTEGER;
  const ecartee = (livraison: PassDeTicket) => (ecartees.has(livraison.ticket) ? 1 : 0);
  return lirePass(base).sort((a, b) => ecartee(a) - ecartee(b) || rang(a) - rang(b) || a.ticket - b.ticket);
}

// Le plafond des jugements simultanés en vigueur : celui que le runtime a écrit
// au journal à son démarrage. Un journal qui ne le dit pas : celui par défaut.
export const plafondEnVigueur = (base: Base) => plafondDesJugements(base) ?? JUGEMENTS_PAR_DEFAUT;

// Ce qui retient une livraison de commencer sa pass.
// `seule` : elle se juge seule — sans zone déclarée, ou écrite hors de sa zone —,
// et d'autres sont dans leur pass. `seul` : `ticket` se juge seul, dans sa pass
// ou devant elle dans la file. `zone` : sa zone recouvre celle de `ticket`, par
// `chemin`. `place` : les `plafond` places de la pass sont prises.
export type Pourquoi =
  | { quoi: "seule"; cause: "sans-zone" | "hors-zone" }
  | { quoi: "seul"; ticket: number }
  | { quoi: "zone"; ticket: number; chemin: string }
  | { quoi: "place"; plafond: number };

// Une livraison qui attend son tour : celles qui sont dans leur pass, combien
// de livraisons attendent devant elle, et ce qui la retient.
export type Tour = { tenants: number[]; devant: number; pourquoi: Pourquoi };

export type Retenues = {
  // Par défaut, celui en vigueur.
  plafond?: number;
  // Les livraisons que la pass du runtime juge en ce moment, quelle que soit
  // leur phase : elles tiennent leur place avant que `pass.started` ne s'écrive.
  enVol?: ReadonlySet<number>;
  ecartees?: ReadonlySet<number>;
  // Une livraison qui n'est pas `delivered` — qui attendait, ou se rejuge après
  // son verdict — et dont la pass demande le tour, à sa place dans la file.
  aussi?: number;
};

// La zone sur laquelle une livraison se juge — celle de la fiche de son
// ticket —, ou pourquoi elle se juge seule. Hors du rail, une livraison n'a pas
// de fiche ; une fiche illisible ne fait pas foi.
function zoneJugee(base: Base, livraison: PassDeTicket): string[] | "sans-zone" | "hors-zone" {
  if (livraison.horsRail) return "sans-zone";
  const rail = ticketDuRail(base, livraison.ticket);
  const card = rail?.card;
  if (!rail || !card || card.problems.length > 0 || card.zone.length === 0) return "sans-zone";
  return rail.outOfZone.length > 0 ? "hors-zone" : card.zone;
}

// Le tour de chaque livraison que la pass a à juger, dans l'ordre de la file :
// null si rien ne la retient — elle est dans sa pass, ou y entre dès que la
// pass la prend —, sinon ce qui la retient. La file se parcourt dans l'ordre :
// une livraison qui y entrerait prend sa place devant celles qui suivent, et
// une livraison qui attend garde la sienne — rien ne la double sur sa zone, et
// rien ne la double du tout si elle se juge seule.
export function toursDeLaPass(base: Base, retenues: Retenues = {}): Map<number, Tour | null> {
  const plafond = retenues.plafond ?? plafondEnVigueur(base);
  const enVol = retenues.enVol ?? new Set<number>();
  const file = fileDeLaPass(base, retenues.ecartees).filter((livraison) => suivie(base, livraison));
  const communs = communsDuRail(base);
  const tours = new Map<number, Tour | null>();
  // Celles qui ont une place : dans leur pass, puis celles qui y entreraient.
  const places: Array<{ ticket: number; zone: string[] | null }> = [];
  const attentes: Array<{ ticket: number; zone: string[] | null }> = [];
  const zoneDe = (livraison: PassDeTicket) => {
    const zone = zoneJugee(base, livraison);
    return typeof zone === "string" ? null : zone;
  };
  for (const livraison of file) {
    if (!DANS_SA_PASS.includes(livraison.phase) && !enVol.has(livraison.ticket)) continue;
    places.push({ ticket: livraison.ticket, zone: zoneDe(livraison) });
    tours.set(livraison.ticket, null);
  }
  const tenants = places.map(({ ticket }) => ticket);
  for (const livraison of file) {
    const { ticket } = livraison;
    if (tours.has(ticket) || livraison.branch === null || (livraison.phase !== "delivered" && ticket !== retenues.aussi)) continue;
    const jugee = zoneJugee(base, livraison);
    const zone = typeof jugee === "string" ? null : jugee;
    const retenue = ((): Pourquoi | null => {
      const seul = [...places, ...attentes].find((autre) => autre.zone === null);
      if (zone === null) return places.length > 0 ? { quoi: "seule", cause: jugee as "sans-zone" | "hors-zone" } : seul ? { quoi: "seul", ticket: seul.ticket } : null;
      if (seul) return { quoi: "seul", ticket: seul.ticket };
      for (const autre of [...places, ...attentes]) {
        const chemin = recouvrement(zone, autre.zone ?? [], communs);
        if (chemin !== null) return { quoi: "zone", ticket: autre.ticket, chemin };
      }
      return places.length >= plafond ? { quoi: "place", plafond } : null;
    })();
    if (retenue === null) {
      places.push({ ticket, zone });
      tours.set(ticket, null);
      continue;
    }
    tours.set(ticket, { tenants, devant: attentes.length, pourquoi: retenue });
    attentes.push({ ticket, zone });
  }
  return tours;
}

// Une livraison qui attend son tour, ou null si rien ne la retient — aucune
// livraison n'est dans sa pass, ou elle y est, ou elle y entre — ou si elle
// n'attend pas d'être jugée.
export function tourAttendu(base: Base, ticket: number, retenues: Retenues = {}): Tour | null {
  const tour = toursDeLaPass(base, retenues).get(ticket) ?? null;
  return tour === null || tour.tenants.length === 0 ? null : tour;
}

// Qui est dans sa pass, et la place de celle qui attend : `#17 is in its pass,
// next in line`.
export const direTenants = (tour: Tour) =>
  `${tour.tenants.map((ticket) => `#${ticket}`).join(", ")} ${tour.tenants.length > 1 ? "are in their pass" : "is in its pass"}, ${tour.devant === 0 ? "next in line" : `${tour.devant} ahead of it`}`;

// Ce qui la retient, en clair.
export function direPourquoi(tour: Tour): string {
  const { pourquoi } = tour;
  const ou = (ticket: number) => (tour.tenants.includes(ticket) ? "" : ", ahead of it");
  switch (pourquoi.quoi) {
    case "seule":
      return `judged alone: ${pourquoi.cause === "sans-zone" ? "it declares no zone" : "it wrote outside its zone"}`;
    case "seul":
      return `#${pourquoi.ticket}${ou(pourquoi.ticket)}${tour.tenants.includes(pourquoi.ticket) ? "" : ","} is judged alone`;
    case "zone":
      return `waiting for #${pourquoi.ticket}${ou(pourquoi.ticket)}: their zones overlap on ${pourquoi.chemin}`;
    case "place":
      return `waiting for a free slot: ${pourquoi.plafond} judgement${pourquoi.plafond > 1 ? "s" : ""} at once at most`;
  }
}

// Passé ce délai depuis sa livraison, une livraison à juger que rien ne retient
// est coincée : la pass du runtime qui tourne la prend dans la seconde où la
// file est libre. `status` la signale, et le chef la relance (`pass <n> --relaunch`).
export const COINCEE_APRES_MS = 15 * 60_000;

// Les livraisons à juger que rien ne retient : livrées, jamais jugées depuis,
// toujours suivies par la pass, et qu'aucune livraison dans sa pass ne retient
// — la pass les prendrait à cet instant, ou rien n'est jugé du tout.
// Une livraison qui attend son tour, ou ce qu'elle attend (`waiting`), n'en est pas.
function sansPass(base: Base): PassDeTicket[] {
  const tours = toursDeLaPass(base);
  return fileDeLaPass(base).filter((livraison) => livraison.phase === "delivered" && tours.has(livraison.ticket) && (tours.get(livraison.ticket)?.tenants.length ?? 0) === 0);
}

// Les livraisons coincées à cet instant : à juger, sans pass, depuis plus de
// `COINCEE_APRES_MS`. `since` : leur livraison.
export function livraisonsCoincees(base: Base, maintenant: Date): Array<{ ticket: number; since: string }> {
  return sansPass(base)
    .filter((livraison) => maintenant.getTime() - Date.parse(livraison.since) > COINCEE_APRES_MS)
    .map(({ ticket, since }) => ({ ticket, since }));
}

// Ce qu'une livraison est devenue, quand elle n'est plus à juger.
const JUGEE: Partial<Record<PassDeTicket["phase"], string>> = {
  green: "already judged green",
  red: "already judged red",
  held: "already judged green, and stopped",
  returned: "already judged red, and returned to a cook",
  deferred: "already judged red, and with the manager",
  escalated: "already judged, and escalated",
  closed: "already judged — its PR is closed without merge",
  merged: "already merged",
  served: "already served",
};

export type Relance = { fait: true; message: string } | { fait: false; raison: string };

// Le geste du chef sur une livraison coincée : son jugement est relancé, par la
// file de la pass — un `pass.relaunched` réveille la pass du runtime qui
// tourne, qui la prend à son tour. Une livraison qui a sa pass, qui attend son
// tour ou ce qu'elle attend, déjà jugée ou mergée, est refusée, et rien n'est
// écrit. Vérifier et écrire tiennent dans une seule transaction.
export function relancerLeJugement(journal: Journal, ticket: number): Relance {
  const { base } = journal;
  const refus = (raison: string): Relance => ({ fait: false, raison });
  return base.transaction((): Relance => {
    const livraison = passDuTicket(base, ticket);
    const rail = ticketDuRail(base, ticket);
    if (livraison === null) {
      if (rail !== null) return refus(`#${ticket} is ${nomEtatEn(rail.state)} and has never been delivered: there is no delivery to judge`);
      // Merged, then gone from the rail: its pass went with it, but the log still says how it ended.
      const fin = base.lire<{ type: string }>("SELECT type FROM events WHERE ticket = ? AND type IN ('merge.done', 'ticket.served') ORDER BY seq DESC LIMIT 1", ticket)[0]?.type;
      if (fin !== undefined) return refus(`#${ticket} is ${fin === "merge.done" ? JUGEE.merged : JUGEE.served}: there is no judgement to relaunch`);
      return refus(`#${ticket} has never been through the pass: there is no delivery to judge`);
    }
    const jugee = JUGEE[livraison.phase];
    if (jugee !== undefined) return refus(`#${ticket} is ${jugee}: there is no judgement to relaunch`);
    if (!suivie(base, livraison)) return refus(rail === null ? `#${ticket} left the rail: the pass no longer follows its delivery` : `#${ticket} is ${nomEtatEn(rail.state)}, not in pass: there is no delivery to judge`);
    switch (livraison.phase) {
      case "cooking":
        return refus(`#${ticket} is being cooked: there is no delivery to judge yet`);
      case "judging":
        return refus(`#${ticket} already has an active pass: it is being judged since ${livraison.startedAt ?? livraison.since} — nothing to relaunch`);
      case "merging":
        return refus(`#${ticket} already has an active pass: its merge is in flight since ${livraison.since} — nothing to relaunch`);
      case "waiting":
        return refus(`#${ticket} is queued (${livraison.reason ?? "no reason given"}): it is not stuck, the pass takes it up on its own once that is lifted`);
    }
    if (livraison.branch === null) return refus(`#${ticket} delivered no branch: the pass has nothing to judge`);
    const tour = tourAttendu(base, ticket);
    if (tour !== null) return refus(`#${ticket} is waiting for its turn — ${direTenants(tour)}: it is not stuck, the pass judges it after`);
    const projet = base.lire<{ project: string }>("SELECT project FROM events WHERE ticket = ? ORDER BY seq DESC LIMIT 1", ticket)[0]?.project;
    if (projet === undefined) return refus(`#${ticket} has no event in this log`);
    journal.ajouter({ project: projet, ticket, author: "chef", type: "pass.relaunched", payload: { run: livraison.run } });
    const absent = sessionEnCours(base) === null ? " — no runtime is running: it is judged at its next start" : "";
    return { fait: true, message: `#${ticket}: a judgement is queued — the pass takes it at its turn, and its log shows \`pass.started\`${absent}` };
  });
}
