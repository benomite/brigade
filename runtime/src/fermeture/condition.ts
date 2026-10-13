// Ce qui décide si une passe qui écrit peut partir, lu dans le journal seul :
// ses réglages, celle qui range déjà, sa condition d'exécution — combien de
// cooks sont en vol —, et ce que ces cooks tiennent. La commande du chef et le
// runtime lisent la même chose : ce que l'une refuse, l'autre ne le lance pas.
import type { Base } from "../base.ts";
import type { MotifDeRefus, ReglagesDeFermeture } from "../evenements/fermeture.ts";
import { illisible } from "../fiche.ts";
import type { Journal } from "../journal.ts";
import { cooksEnCours, etatDesGardeFous } from "../projections/garde-fous.ts";
import { lireRail, type TicketRail } from "../projections/rail.ts";
import { possede } from "../zones.ts";

// Les réglages en vigueur, ou null si aucun runtime n'a démarré avec eux.
export function reglagesEnVigueur(journal: Journal): ReglagesDeFermeture | null {
  return journal.duType("closing.configured", 1)[0]?.payload ?? null;
}

// Ce que `passeEnCours` rend d'une passe que le runtime n'a pas encore prise.
export const DEMANDEE = "demandée";

// La passe qui range : son run, `DEMANDEE` si le runtime ne l'a pas encore
// prise, ou null.
export function passeEnCours(journal: Journal): string | null {
  const dernier = <T extends "closing.requested" | "closing.refused" | "closing.started" | "closing.ended">(type: T) => journal.duType(type, 1)[0];
  const partie = dernier("closing.started");
  if (partie && partie.seq > (dernier("closing.ended")?.seq ?? 0)) return partie.payload.run;
  const demandee = dernier("closing.requested");
  return demandee && demandee.seq > Math.max(partie?.seq ?? 0, dernier("closing.refused")?.seq ?? 0) ? DEMANDEE : null;
}

// Un cook en vol, et la zone qu'il tient. Nulle : son ticket n'en déclare
// aucune qui se lise — la passe ne peut pas savoir ce qu'il écrit, il tient
// donc tout.
export type Vol = { ticket: number; zone: string[] | null };

const zoneDe = (ticket: TicketRail | undefined): string[] | null =>
  ticket?.card && illisible(ticket.card) === null && ticket.card.zone.length > 0 ? ticket.card.zone : null;

// Les cooks en vol : les tickets qu'une station tient, et ceux dont un cook
// tourne encore après avoir quitté ses mains — rendu, ou sorti du rail, il
// écrit toujours. La relecture d'un ticket en pass n'en est pas : le reviewer
// n'écrit rien. Les lancements sans ticket non plus — un jugement du manager,
// la passe elle-même.
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

// Ce que la passe s'interdit : la zone de chaque cook en vol, et celle de
// chaque ticket en pass — sa livraison n'est pas encore sur la base, et un
// renvoi y ramènerait un cook. `zone` nulle : tout le dépôt.
export function zonesTenues(base: Base): Vol[] {
  const vols = cooksEnVol(base);
  const enPass = lireRail(base).flatMap((ticket) => (ticket.state === "pass" && zoneDe(ticket) !== null ? [{ ticket: ticket.ticket, zone: zoneDe(ticket) }] : []));
  return [...vols, ...enPass];
}

// Celui qui tient ce fichier, et par quel chemin (`*` : tout le dépôt), ou null.
export function tenant(tenues: Vol[], fichier: string): { ticket: number; chemin: string } | null {
  for (const { ticket, zone } of tenues) {
    if (zone === null) return { ticket, chemin: "*" };
    const chemin = zone.find((possedant) => possede(possedant, fichier));
    if (chemin !== undefined) return { ticket, chemin };
  }
  return null;
}

// La condition d'exécution, mesurée. `enVol` : les cooks en vol ; `rail` : les
// tickets du rail qui ne sont pas servis. Elle est remplie quand moins de cooks
// que le seuil sont en vol — un rail vide n'en porte aucun.
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

// Ce qui retient une passe de partir, ou null si rien : ses réglages, les
// garde-fous de la cuisine, puis sa condition d'exécution. `occupee` : une
// passe range déjà.
export function refus(base: Base, reglages: ReglagesDeFermeture | null, occupee: boolean): Refus | null {
  const sans = (reason: MotifDeRefus, detail: string | null = null): Refus => ({ reason, observed: null, limit: null, detail });
  if (!reglages?.calibration) return sans("unconfigured");
  if (occupee) return sans("busy");
  const gardeFous = etatDesGardeFous(base);
  if (gardeFous.stoppedAt !== null) return sans("stopped", gardeFous.stoppedAt);
  if (gardeFous.breakerOpenedAt !== null) return sans("breaker", gardeFous.breakerOpenedAt);
  const condition = mesurerCondition(base, reglages.cooksBelow);
  if (!condition.remplie) return { reason: "cooks", observed: condition.enVol, limit: condition.seuil, detail: String(condition.rail) };
  if (condition.sansZone.length > 0) return sans("zoneless", condition.sansZone.map((ticket) => `#${ticket}`).join(", "));
  return null;
}
