// What decides whether a writing pass may leave, read from the log alone: its
// settings, the one already tidying, the request that is waiting, its start
// condition — how many cooks are in flight —, and what those cooks hold. The
// chef's command, the runtime and the queue read the same thing: what one
// refuses, the other does not launch.
import type { Base } from "../base.ts";
import { MOTIFS_D_ATTENTE, type ClosingFact, type MotifDAttente, type MotifDeRefus, type ClosingSettings } from "../events/closing.ts";
import { illisible } from "../card.ts";
import type { Log } from "../log.ts";
import { cooksEnCours, guardrailsState } from "../projections/guardrails.ts";
import { lireRail, type TicketRail } from "../projections/rail.ts";
import { possede } from "../zones.ts";

type Fait<T extends ClosingFact["type"]> = { seq: number; at: string; payload: Extract<ClosingFact, { type: T }>["payload"] };

// The last fact of this type, read from the base: the queue reads it without a log.
function dernier<T extends ClosingFact["type"]>(base: Base, type: T): Fait<T> | undefined {
  const ligne = base.lire<{ seq: number; at: string; payload: string }>("SELECT seq, at, payload FROM events WHERE type = ? ORDER BY seq DESC LIMIT 1", type)[0];
  return ligne && { seq: ligne.seq, at: ligne.at, payload: JSON.parse(ligne.payload) };
}

const baseDe = (lu: Log | Base): Base => ("base" in lu ? lu.base : lu);

// The settings in force, or null if no runtime has started with them.
export function reglagesEnVigueur(log: Log | Base): ClosingSettings | null {
  return dernier(baseDe(log), "closing.configured")?.payload ?? null;
}

// What `passeEnCours` returns for a pass the runtime has not yet picked up.
export const DEMANDEE = "demandée";

// The chef's request waiting for the pass to leave. `seq`, `since`: its fact
// and its instant. `sansIssue`: the instant the runtime called it stuck with
// no way out, or null.
export type Demande = { seq: number; since: string; sansIssue: string | null };

// The request that is waiting: neither started, nor refused, nor withdrawn by the chef.
export function queuedRequest(base: Base): Demande | null {
  const demandee = dernier(base, "closing.requested");
  if (demandee === undefined) return null;
  const close = Math.max(...(["closing.started", "closing.refused", "closing.cancelled"] as const).map((type) => dernier(base, type)?.seq ?? 0));
  if (demandee.seq < close) return null;
  const blocked = dernier(base, "closing.stalled");
  return { seq: demandee.seq, since: demandee.at, sansIssue: blocked !== undefined && blocked.seq > demandee.seq ? blocked.at : null };
}

// The pass that is tidying: its run, `DEMANDEE` if a request is waiting for
// the runtime to start it, or null.
export function passeEnCours(log: Log | Base): string | null {
  const base = baseDe(log);
  const partie = dernier(base, "closing.started");
  if (partie && partie.seq > (dernier(base, "closing.ended")?.seq ?? 0)) return partie.payload.run;
  return queuedRequest(base) === null ? null : DEMANDEE;
}

// A cook in flight, and the zone it holds. Null: its ticket declares none that
// can be read — the pass cannot know what it writes, so it holds everything.
export type Vol = { ticket: number; zone: string[] | null };

const zoneDe = (ticket: TicketRail | undefined): string[] | null =>
  ticket?.card && illisible(ticket.card) === null && ticket.card.zone.length > 0 ? ticket.card.zone : null;

// The cooks in flight: the tickets a station holds, and those whose cook still
// runs after leaving its hands — handed back, or off the rail, it still
// writes. The review of a ticket in pass is not one: the reviewer writes
// nothing. Nor are launches without a ticket — a manager's judgment, the pass
// itself.
export function cooksEnVol(base: Base): Vol[] {
  const rail = lireRail(base);
  const vols = new Map<number, Vol>(rail.filter(({ state }) => state === "taken").map((ticket) => [ticket.ticket, { ticket: ticket.ticket, zone: zoneDe(ticket) }]));
  for (const { ticket } of cooksEnCours(base)) {
    if (ticket === null || vols.has(ticket)) continue;
    const surLeRail = rail.find((autre) => autre.ticket === ticket);
    if (surLeRail?.state !== "pass") vols.set(ticket, { ticket, zone: zoneDe(surLeRail) });
  }
  return [...vols.values()];
}

// What the pass forbids itself: the zone of each cook in flight, and that of
// each ticket in pass — its delivery is not yet on the base, and a send-back
// would bring a cook there. Null `zone`: the whole repository.
export function zonesTenues(base: Base): Vol[] {
  const vols = cooksEnVol(base);
  const enPass = lireRail(base).flatMap((ticket) => (ticket.state === "pass" && zoneDe(ticket) !== null ? [{ ticket: ticket.ticket, zone: zoneDe(ticket) }] : []));
  return [...vols, ...enPass];
}

// Who holds this file, and through which path (`*`: the whole repository), or null.
export function tenant(tenues: Vol[], fichier: string): { ticket: number; chemin: string } | null {
  for (const { ticket, zone } of tenues) {
    if (zone === null) return { ticket, chemin: "*" };
    const chemin = zone.find((possedant) => possede(possedant, fichier));
    if (chemin !== undefined) return { ticket, chemin };
  }
  return null;
}

// The start condition, measured. `enVol`: the cooks in flight; `rail`: the
// tickets on the rail that are not served. It is met when fewer cooks than the
// threshold are in flight — an empty rail has none.
export type Condition = { enVol: number; seuil: number; rail: number; remplie: boolean; sansZone: number[] };

export function mesurerCondition(base: Base, seuil: number): Condition {
  const vols = cooksEnVol(base);
  return {
    enVol: vols.length,
    seuil,
    rail: lireRail(base).filter(({ state }) => state !== "served").length,
    remplie: vols.length < seuil,
    sansZone: vols.filter(({ zone }) => zone === null).map(({ ticket }) => ticket),
  };
}

export type Refus = { reason: MotifDeRefus; observed: number | null; limit: number | null; detail: string | null };

// Does this refusal make the request wait, rather than be refused? A requested
// switch-on, the start condition: what passes on its own.
export const faitAttendre = (motif: Refus): motif is Refus & { reason: MotifDAttente } => (MOTIFS_D_ATTENTE as readonly MotifDeRefus[]).includes(motif.reason);

// What keeps a pass from leaving, or null if nothing: its settings, the
// kitchen's guardrails, a requested switch-on, then its start condition.
// `occupee`: a pass is already tidying.
export function refus(base: Base, reglages: ClosingSettings | null, occupee: boolean): Refus | null {
  const sans = (reason: MotifDeRefus, detail: string | null = null): Refus => ({ reason, observed: null, limit: null, detail });
  if (!reglages?.calibration) return sans("unconfigured");
  if (occupee) return sans("busy");
  const guardrails = guardrailsState(base);
  if (guardrails.stoppedAt !== null) return sans("stopped", guardrails.stoppedAt);
  if (guardrails.breakerOpenedAt !== null) return sans("breaker", guardrails.breakerOpenedAt);
  const condition = mesurerCondition(base, reglages.cooksBelow);
  if (!condition.remplie) return { reason: "cooks", observed: condition.enVol, limit: condition.seuil, detail: String(condition.rail) };
  if (condition.sansZone.length > 0) return sans("zoneless", condition.sansZone.map((ticket) => `#${ticket}`).join(", "));
  return null;
}
