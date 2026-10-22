// La file de la pass : une seule livraison à la fois est dans sa pass — ses
// gates, sa relecture, sa CI, puis son merge en vol —, et les autres attendent
// leur tour, dans l'ordre où elles ont été livrées : celui de leur dernier
// `ticket.passing`, ou de leur `pass.entered` hors du rail. Une livraison qui
// ne commence pas — GitHub qui bute, une PR qui ne s'ouvre pas — ne tient pas
// la file : seule en tient le tour celle qui est dans sa pass.
import type { Base } from "./base.ts";
import type { Journal } from "./journal.ts";
import { lirePass, passDuTicket, type PassDeTicket } from "./projections/pass.ts";
import { ticketDuRail } from "./projections/rail.ts";
import { sessionEnCours } from "./projections/sessions.ts";
import { nomEtatEn } from "./rail.ts";

// Les phases d'une livraison dans sa pass : jugée, ou son merge en vol.
const DANS_SA_PASS = ["judging", "merging"];

// La pass suit encore cette livraison : son ticket est en pass, ou elle est hors du rail.
const suivie = (base: Base, livraison: PassDeTicket) => livraison.horsRail || ticketDuRail(base, livraison.ticket)?.state === "pass";

// Les livraisons que la pass connaît, dans l'ordre de la file. Celles qui
// n'ont jamais été livrées — un premier cook en cours — viennent après, par numéro.
export function fileDeLaPass(base: Base): PassDeTicket[] {
  const livrees = new Map(
    base
      .lire<{ ticket: number; seq: number }>("SELECT ticket, MAX(seq) AS seq FROM events WHERE type IN ('ticket.passing', 'pass.entered') AND ticket IN (SELECT ticket FROM pass) GROUP BY ticket")
      .map(({ ticket, seq }) => [ticket, seq]),
  );
  const rang = (livraison: PassDeTicket) => livrees.get(livraison.ticket) ?? Number.MAX_SAFE_INTEGER;
  return lirePass(base).sort((a, b) => rang(a) - rang(b) || a.ticket - b.ticket);
}

// La livraison qui est dans sa pass, ou null : la première de la file à y être.
export function tenantDeLaPass(base: Base, file = fileDeLaPass(base)): number | null {
  return file.find((livraison) => DANS_SA_PASS.includes(livraison.phase) && suivie(base, livraison))?.ticket ?? null;
}

// Une livraison qui attend son tour : celle qui est dans sa pass, et combien
// de livraisons attendent devant elle. Null si rien ne la retient — la pass
// est libre, ou c'est elle qui y est — ou si elle n'attend pas d'être jugée.
export function tourAttendu(base: Base, ticket: number): { tenant: number; devant: number } | null {
  const file = fileDeLaPass(base);
  const tenant = tenantDeLaPass(base, file);
  const rang = file.findIndex((livraison) => livraison.ticket === ticket);
  const elle = file[rang];
  if (tenant === null || tenant === ticket || elle?.phase !== "delivered" || !suivie(base, elle)) return null;
  const devant = file.slice(0, rang).filter((livraison) => livraison.ticket !== tenant && livraison.phase === "delivered" && suivie(base, livraison)).length;
  return { tenant, devant };
}

// Passé ce délai depuis sa livraison, une livraison à juger que rien ne retient
// est coincée : la pass du runtime qui tourne la prend dans la seconde où la
// file est libre. `status` la signale, et le chef la relance (`pass <n> --relaunch`).
export const COINCEE_APRES_MS = 15 * 60_000;

// Les livraisons à juger que rien ne retient : livrées, jamais jugées depuis,
// toujours suivies par la pass, et aucune autre dans sa pass devant elles.
// Une livraison qui attend son tour, ou ce qu'elle attend (`waiting`), n'en est pas.
function sansPass(base: Base, file = fileDeLaPass(base)): PassDeTicket[] {
  if (tenantDeLaPass(base, file) !== null) return [];
  return file.filter((livraison) => livraison.phase === "delivered" && livraison.branch !== null && suivie(base, livraison));
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
  escalated: "already judged, and escalated to the chef",
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
    if (tour !== null) return refus(`#${ticket} is waiting for its turn — #${tour.tenant} is in its pass, ${tour.devant === 0 ? "next in line" : `${tour.devant} ahead of it`}: it is not stuck, the pass judges it after`);
    const projet = base.lire<{ project: string }>("SELECT project FROM events WHERE ticket = ? ORDER BY seq DESC LIMIT 1", ticket)[0]?.project;
    if (projet === undefined) return refus(`#${ticket} has no event in this log`);
    journal.ajouter({ project: projet, ticket, author: "chef", type: "pass.relaunched", payload: { run: livraison.run } });
    const absent = sessionEnCours(base) === null ? " — no runtime is running: it is judged at its next start" : "";
    return { fait: true, message: `#${ticket}: a judgement is queued — the pass takes it at its turn, and its log shows \`pass.started\`${absent}` };
  });
}
