// Ce qui décide si une passe qui écrit peut partir, lu dans le journal seul :
// ses réglages, celle qui range déjà, la demande qui attend, sa condition
// d'exécution — combien de cooks sont en vol —, et ce que ces cooks tiennent.
// La commande du chef, le runtime et la file lisent la même chose : ce que
// l'une refuse, l'autre ne le lance pas.
import type { Base } from "../base.ts";
import { MOTIFS_D_ATTENTE, type FaitFermeture, type MotifDAttente, type MotifDeRefus, type ReglagesDeFermeture } from "../evenements/fermeture.ts";
import { illisible } from "../fiche.ts";
import type { Journal } from "../journal.ts";
import { cooksEnCours, etatDesGardeFous } from "../projections/garde-fous.ts";
import { miseEnServiceRetient } from "../projections/mise-en-service.ts";
import { lireRail, type TicketRail } from "../projections/rail.ts";
import { possede } from "../zones.ts";

type Fait<T extends FaitFermeture["type"]> = { seq: number; at: string; payload: Extract<FaitFermeture, { type: T }>["payload"] };

// Le dernier fait de ce type, lu sur la base : la file la lit sans journal.
function dernier<T extends FaitFermeture["type"]>(base: Base, type: T): Fait<T> | undefined {
  const ligne = base.lire<{ seq: number; at: string; payload: string }>("SELECT seq, at, payload FROM events WHERE type = ? ORDER BY seq DESC LIMIT 1", type)[0];
  return ligne && { seq: ligne.seq, at: ligne.at, payload: JSON.parse(ligne.payload) };
}

const baseDe = (lu: Journal | Base): Base => ("base" in lu ? lu.base : lu);

// Les réglages en vigueur, ou null si aucun runtime n'a démarré avec eux.
export function reglagesEnVigueur(journal: Journal | Base): ReglagesDeFermeture | null {
  return dernier(baseDe(journal), "closing.configured")?.payload ?? null;
}

// Ce que `passeEnCours` rend d'une passe que le runtime n'a pas encore prise.
export const DEMANDEE = "demandée";

// La demande du chef qui attend que la passe parte. `seq`, `depuis` : son
// fait et son instant. `sansIssue` : l'instant où le runtime l'a dite sans
// issue, ou null.
export type Demande = { seq: number; depuis: string; sansIssue: string | null };

// La demande qui attend : ni partie, ni refusée, ni retirée par le chef.
export function demandeEnAttente(base: Base): Demande | null {
  const demandee = dernier(base, "closing.requested");
  if (demandee === undefined) return null;
  const close = Math.max(...(["closing.started", "closing.refused", "closing.cancelled"] as const).map((type) => dernier(base, type)?.seq ?? 0));
  if (demandee.seq < close) return null;
  const bloquee = dernier(base, "closing.stalled");
  return { seq: demandee.seq, depuis: demandee.at, sansIssue: bloquee !== undefined && bloquee.seq > demandee.seq ? bloquee.at : null };
}

// La passe qui range : son run, `DEMANDEE` si une demande attend que le
// runtime la fasse partir, ou null.
export function passeEnCours(journal: Journal | Base): string | null {
  const base = baseDe(journal);
  const partie = dernier(base, "closing.started");
  if (partie && partie.seq > (dernier(base, "closing.ended")?.seq ?? 0)) return partie.payload.run;
  return demandeEnAttente(base) === null ? null : DEMANDEE;
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

// Ce refus fait-il attendre la demande, plutôt que la refuser ? Une mise en
// service demandée, la condition d'exécution : ce qui passe seul.
export const faitAttendre = (motif: Refus): motif is Refus & { reason: MotifDAttente } => (MOTIFS_D_ATTENTE as readonly MotifDeRefus[]).includes(motif.reason);

// Ce qui retient une passe de partir, ou null si rien : ses réglages, les
// garde-fous de la cuisine, une mise en service demandée, puis sa condition
// d'exécution. `occupee` : une passe range déjà.
export function refus(base: Base, reglages: ReglagesDeFermeture | null, occupee: boolean): Refus | null {
  const sans = (reason: MotifDeRefus, detail: string | null = null): Refus => ({ reason, observed: null, limit: null, detail });
  if (!reglages?.calibration) return sans("unconfigured");
  if (occupee) return sans("busy");
  const gardeFous = etatDesGardeFous(base);
  if (gardeFous.stoppedAt !== null) return sans("stopped", gardeFous.stoppedAt);
  if (gardeFous.breakerOpenedAt !== null) return sans("breaker", gardeFous.breakerOpenedAt);
  // Aucun cook ne part tant qu'elle vit : le lancement du closer serait refusé.
  if (miseEnServiceRetient(base)) return sans("deploying");
  const condition = mesurerCondition(base, reglages.cooksBelow);
  if (!condition.remplie) return { reason: "cooks", observed: condition.enVol, limit: condition.seuil, detail: String(condition.rail) };
  if (condition.sansZone.length > 0) return sans("zoneless", condition.sansZone.map((ticket) => `#${ticket}`).join(", "));
  return null;
}
