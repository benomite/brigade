// Les mots du rail du journal : l'état d'un ticket, ce qui le retient, pourquoi
// il en est parti. Rien ici ne prête plus un ticket : c'est la station GitHub
// seul qui prend les tickets sur GitHub (#2061), et le journal garde son rail
// comme historique, que `status` et le manager relisent.
import type { Attendu, AttenduEnWaiting, Etat, TicketRail } from "./projections/rail.ts";
import { manqueDuTicket } from "./capacites.ts";

// Le geste ne s'applique pas à l'état du rail : ticket absent, déjà pris, tenu
// par une autre station… Une station qui le reçoit a perdu son ticket.
export class GesteRefuse extends Error {
  constructor(message: string) {
    super(message);
    this.name = "GesteRefuse";
  }
}

const NOMS: Record<Etat, string> = { waiting: "en attente", taken: "pris", pass: "en pass", served: "servi", "86": "86" };

// L'état d'un ticket tel que le chef le lit.
export function nomEtat(etat: Etat): string {
  return NOMS[etat];
}

// Les mêmes, en anglais : ce que dit `status` (glossaire §2).
const NOMS_EN: Record<Etat, string> = { waiting: "queued", taken: "taken", pass: "in pass", served: "served", "86": "86" };

export function nomEtatEn(etat: Etat): string {
  return NOMS_EN[etat];
}

// Ce qui retient un ticket en attente : des tickets de sa fiche pas encore
// servis (`attend`) — sur le rail, ou partis l'issue encore ouverte : il les
// attend sur le rail, jamais dans TODO (#1834). Ou, quand rien de cela ne le
// retient, sa zone (`zone`) : un ticket parti et pas encore servi en tient un
// chemin.
export function retenue(ticket: TicketRail): "attend" | "zone" | null {
  if (ticket.state !== "waiting") return null;
  if (ticket.awaits.length === 0) return ticket.held.length === 0 ? null : "zone";
  return "attend";
}

export const BLOQUE = "BLOQUÉ";
// Un ticket que quelque chose hors de la cuisine retient (#1924) : un tiers —
// 86 sans heure de retour, que seul un geste du chef en sort —, ou une station
// qu'aucune ne remplace — 86 `no-station: …`, qui revient seul sur le rail dès
// qu'une station fournit ce que sa fiche demande. Ou un ticket en WAITING que
// sa fiche attend, de proche en proche (#1926) : un ticket du rail n'attend
// que des tickets du rail, et il y revient seul dès qu'il n'en attend plus
// aucun en WAITING.
export const EN_WAITING = "WAITING";

// En WAITING : il attend un tiers, une station qui fournisse ce qu'il demande,
// ou un ticket en WAITING.
const enWaiting = (ticket: TicketRail) => ticket.waitingFor !== null || manqueDuTicket(ticket) !== null || ticket.waitingOn.length > 0;

const GELE = "bloqué";
const DIT_GELE = "86 sans heure de retour, non jugé par la pass";

// L'état d'un ticket tel que le rail le montre : en attente et bloqué sont le
// même état au journal, pas le même à l'œil. Bloqué : un ticket qu'il attend
// est gelé — 86 sans heure de retour, que la pass n'a pas jugé. De même,
// WAITING est un 86 : celui d'un ticket en attente d'un tiers, ou d'une
// station qu'aucune ne remplace. Il n'est plus du rail : la cuisine ne peut pas
// le prendre.
export function etatLu(ticket: TicketRail): string {
  if (enWaiting(ticket)) return EN_WAITING;
  return ticket.frozenBy.length > 0 ? BLOQUE : nomEtat(ticket.state);
}

export const BLOQUE_EN = "BLOCKED";

// L'état lu en anglais : le même que `etatLu`, mot pour mot traduit.
export function etatLuEn(ticket: TicketRail): string {
  if (enWaiting(ticket)) return EN_WAITING;
  return ticket.frozenBy.length > 0 ? BLOQUE_EN : nomEtatEn(ticket.state);
}

const ABANDONS: Record<string, string> = {
  closed: "issue fermée sans avoir été servie",
  unfired: "label `fire` retiré",
  gone: "issue disparue",
  "served-elsewhere": "label `served-elsewhere` posé : ce ticket ne se sert pas sur cette box",
};

export function nomAbandon(motif: string): string {
  return ABANDONS[motif] ?? motif;
}

// Les mêmes, en anglais : ce que dit le bloc `awaiting` de `status`.
const ABANDONS_EN: Record<string, string> = {
  closed: "issue closed without being served",
  unfired: "label `fire` removed",
  gone: "issue gone",
  "served-elsewhere": "label `served-elsewhere` set: this ticket is not served on this box",
};

export function nomAbandonEn(motif: string): string {
  return ABANDONS_EN[motif] ?? motif;
}

const GELE_EN = "blocked";
const DIT_GELE_EN = "set aside (86) by the pass, not judged";

// Un ticket attendu parti du rail l'issue encore ouverte, en clair.
const parti = (attendu: Attendu) => `#${attendu.ticket} (hors du rail, issue ouverte : ${nomAbandon(attendu.left?.reason ?? "")})`;
const partiEn = (attendu: Attendu) => `#${attendu.ticket} (off the rail, issue still open: ${nomAbandonEn(attendu.left?.reason ?? "")})`;

// Un ticket attendu en WAITING, et, s'il n'y est pas de lui-même, les tickets
// en WAITING d'eux-mêmes au bout de sa chaîne (#1926).
const numeros = (tickets: readonly number[]) => tickets.map((ticket) => `#${ticket}`).join(", ");
const enWaitingFr = ({ ticket, roots }: AttenduEnWaiting) => `#${ticket} (${EN_WAITING}${roots.length === 0 ? "" : `, derrière ${numeros(roots)}`})`;
const enWaitingEn = ({ ticket, roots }: AttenduEnWaiting) => `#${ticket} (${EN_WAITING}${roots.length === 0 ? "" : `, behind ${numeros(roots)}`})`;

// Ce qui ramène seul sur le rail un ticket en WAITING derrière un autre.
export const RETOUR_DERRIERE_UN_WAITING = "il revient seul sur le rail dès qu'il n'attend plus aucun ticket en WAITING";
export const RETOUR_DERRIERE_UN_WAITING_EN = "back on the rail on its own once it waits for no ticket in WAITING";

// Pourquoi un ticket attend en WAITING derrière d'autres tickets : ceux qu'il
// attend et qui y sont, nommés (#1926). Null s'il n'en attend aucun.
export function direAttenteDUnWaiting(ticket: TicketRail): string | null {
  return ticket.waitingOn.length === 0 ? null : `attend : ${ticket.waitingOn.map(enWaitingFr).join(", ")} — ${RETOUR_DERRIERE_UN_WAITING}`;
}

// Pourquoi un ticket en attente ne part pas, ou null si rien ne le retient.
// Un ticket en WAITING qu'il attend se dit d'abord : c'est lui qui le sort du
// rail.
export function direRetenue(ticket: TicketRail): string | null {
  if (retenue(ticket) === null) return null;
  const gele = (attendu: { ticket: number }) => ticket.frozenBy.includes(attendu.ticket);
  const enWaitingDe = (attendu: { ticket: number }) => ticket.waitingOn.some((tenu) => tenu.ticket === attendu.ticket);
  const attendus = ticket.awaits.filter((attendu) => !gele(attendu) && !enWaitingDe(attendu));
  return [
    ...(ticket.waitingOn.length === 0 ? [] : [`attend ${ticket.waitingOn.map(enWaitingFr).join(", ")}`]),
    ...ticket.awaits.filter(gele).map((attendu) => `${GELE} par #${attendu.ticket} (${DIT_GELE})`),
    ...(attendus.length === 0 ? [] : [`attend ${attendus.map((attendu) => (attendu.left === null ? `#${attendu.ticket}` : parti(attendu))).join(", ")}`]),
    ...ticket.held.map((tenant) => `zone tenue par #${tenant.ticket} (${tenant.path}${tenant.outside ? ", écrit hors de sa zone" : ""})`),
  ].join(" · ");
}

// La même, en anglais : ce que dit la ligne du ticket dans `status`.
export function direRetenueEn(ticket: TicketRail): string | null {
  if (retenue(ticket) === null) return null;
  const gele = (attendu: { ticket: number }) => ticket.frozenBy.includes(attendu.ticket);
  const enWaitingDe = (attendu: { ticket: number }) => ticket.waitingOn.some((tenu) => tenu.ticket === attendu.ticket);
  const attendus = ticket.awaits.filter((attendu) => !gele(attendu) && !enWaitingDe(attendu));
  return [
    ...(ticket.waitingOn.length === 0 ? [] : [`waits for ${ticket.waitingOn.map(enWaitingEn).join(", ")}`]),
    ...ticket.awaits.filter(gele).map((attendu) => `${GELE_EN} by #${attendu.ticket} (${DIT_GELE_EN})`),
    ...(attendus.length === 0 ? [] : [`awaiting ${attendus.map((attendu) => (attendu.left === null ? `#${attendu.ticket}` : partiEn(attendu))).join(", ")}`]),
    ...ticket.held.map((tenant) => `zone held by #${tenant.ticket} (${tenant.path}${tenant.outside ? ", written outside its zone" : ""})`),
  ].join(" · ");
}

// Les attentes que la cuisine a levées d'elle-même : un ticket de la fiche
// fermé sans avoir été servi n'est plus attendu, et le rail le dit (#1834).
// Null s'il n'y en a pas.
export function direAttentesLevees(ticket: TicketRail): string | null {
  if (ticket.dropped.length === 0) return null;
  return ticket.dropped.map(({ ticket: attendu, reason }) => `#${attendu} ${reason === "gone" ? "a disparu" : "a été fermé"} sans avoir été servi : il n'est plus attendu`).join(" · ");
}

export function direAttentesLeveesEn(ticket: TicketRail): string | null {
  if (ticket.dropped.length === 0) return null;
  return ticket.dropped.map(({ ticket: attendu, reason }) => `#${attendu} was ${reason === "gone" ? "deleted" : "closed"} without being served: no longer awaited`).join(" · ");
}

// Ce que la file montre d'un ticket que sa dernière livraison a fait écrire
// hors de sa zone : les chemins en cause, qu'il tient comme sa zone — un ticket
// en attente dessus ne part pas — jusqu'à ce que sa fiche les nomme, qu'une
// nouvelle livraison ne les écrive plus, ou qu'il soit mergé. Null s'il n'y en
// a pas.
const HORS_ZONE_MONTRES = 5;
export function direHorsZoneEn(ticket: TicketRail): string | null {
  const { outOfZone } = ticket;
  if (outOfZone.length === 0) return null;
  const montres = outOfZone.slice(0, HORS_ZONE_MONTRES).join(", ");
  const reste = outOfZone.length - HORS_ZONE_MONTRES;
  return `OUT OF ZONE: wrote ${montres}${reste > 0 ? ` and ${reste} more` : ""}`;
}

// Le détail d'une ligne de la file, suivi de l'écart hors zone du ticket s'il
// en a un.
export function avecHorsZoneEn(detail: string, ticket: TicketRail): string {
  const horsZone = direHorsZoneEn(ticket);
  if (horsZone === null) return detail;
  return detail === "" ? horsZone : `${detail} — ${horsZone}`;
}
