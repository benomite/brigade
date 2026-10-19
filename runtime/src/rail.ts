// Les gestes du rail : prêter un ticket à une station — une seule à la fois —
// et le faire avancer jusqu'au service. Chaque geste vérifie puis écrit dans
// une seule transaction d'écriture : deux gestes concurrents se suivent, ils ne
// se croisent pas.
import { LEASE_EXPIRED, FIN_DE_86, motifDeRelance, type FaitRail } from "./events/rail.ts";
import { fournitTout } from "./capacites.ts";
import { illisible, requises } from "./card.ts";
import type { Log } from "./log.ts";
import { cooksEnCours } from "./projections/guardrails.ts";
import { communsDuRail, lireRail, ticketDuRail, type Etat, type TicketRail } from "./projections/rail.ts";
import { recouvrement } from "./zones.ts";

// Le geste ne s'applique pas à l'état du rail : ticket absent, déjà pris, tenu
// par une autre station… Une station qui le reçoit a perdu son ticket.
export class GesteRefuse extends Error {
  constructor(message: string) {
    super(message);
    this.name = "GesteRefuse";
  }
}

export type OptionsRail = {
  projet: string;
  // Le temps qu'un ticket reste prêté sans renouvellement : passé ce délai,
  // il est rendu.
  dureeBailMs: number;
  maintenant?: () => Date;
};

// Une station telle qu'elle se présente au rail : son nom, les capacités
// qu'elle fournit et, si elle ne prend pas les tickets ordinaires — ceux qui
// ne demandent rien —, `ordinaires: false` : elle ne prend alors que ceux qui
// demandent une de ses capacités.
export type Preneuse = { station: string; fournit: readonly string[]; ordinaires?: boolean };

export type Rail = {
  // Le rail, dans l'ordre de service.
  tickets(): TicketRail[];
  // Prête à la station le premier ticket en attente que rien ne retient, ou
  // rien s'il n'y en a pas. Devant plusieurs stations, données avec ce
  // qu'elles fournissent : le premier ticket, dans l'ordre de service, que
  // l'une d'elles peut cuisiner — elle fournit tout ce que sa fiche demande —,
  // prêté à la première d'entre elles qui le peut. Seul ce qu'un ticket
  // demande écarte une station : un ticket qui ne demande rien va à la
  // première, sauf celles qui ne prennent pas les tickets ordinaires. Un
  // simple nom de station ne dit pas ce qu'elle fournit : les capacités ne
  // sont alors pas regardées.
  // `enCuisine` : les tickets dont elle n'a pas fini la
  // cuisine, chacun avec la zone qu'il portait à sa prise. Elle ne les reprend
  // pas, et leur zone reste tenue même s'ils ont quitté ses mains : un ticket
  // rendu ou retiré du rail pendant que son cook tourne ne libère rien tant
  // que ce cook écrit encore.
  // `seul` : ce ticket-là, ou rien — la réparation d'une base rouge, seule à
  // en partir.
  prendre(station: string | readonly Preneuse[], cooking?: ReadonlyMap<number, string[]>, seul?: number): TicketRail | null;
  // Combien de tickets `prendre` pourrait donner, sans en prendre aucun : ce
  // qui attend derrière une station qui se retient. `preneuses` : seulement
  // ceux que l'une de ces stations peut cuisiner.
  servables(cooking?: ReadonlyMap<number, string[]>, preneuses?: readonly Preneuse[], seul?: number): number;
  // Repousse l'échéance du bail : le travail de la station a progressé.
  renouveler(ticket: number, station: string): void;
  // Remet le ticket en attente. Avec `station`, c'est elle qui le rend, et elle
  // doit le tenir ; sans, c'est le runtime.
  rendre(ticket: number, motif: string, station?: string): void;
  envoyerEnPass(ticket: number, station: string): void;
  servir(ticket: number): void;
  // `retour` : l'heure à laquelle le ticket redeviendra servable, si elle est
  // connue. Sans elle, il reste 86 jusqu'à ce qu'on le rende.
  quatreVingtSix(ticket: number, raison: { motif: string; retour?: Date; station?: string }): void;
  // Rend les tickets dont le bail est échu et ceux dont le 86 est passé. Rend
  // le nombre de tickets remis en attente. Un ticket dont le cook tourne
  // encore n'en est pas : c'est à sa station de l'arrêter et de récolter ce
  // qu'il laisse, avant de dire la suite.
  relever(): number;
};

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
// servis (`attend`) ou, plus grave, dont l'un a été abandonné (`bloque`) —
// celui-là ne partira pas sans un geste du chef. Ou, quand rien de cela ne le
// retient, sa zone (`zone`) : un ticket parti et pas encore servi en tient un
// chemin.
export function retenue(ticket: TicketRail): "attend" | "bloque" | "zone" | null {
  if (ticket.state !== "waiting") return null;
  if (ticket.awaits.length === 0) return ticket.held.length === 0 ? null : "zone";
  return ticket.awaits.some((attendu) => attendu.left !== null) ? "bloque" : "attend";
}

export const BLOCKED = "BLOQUÉ";
// Un ticket en attente d'un tiers : 86 sans heure de retour, que seul un geste
// du chef en sort.
export const EN_WAITING = "WAITING";

const GELE = "bloqué";
const DIT_GELE = "86 sans heure de retour, non jugé par la pass";

// L'état d'un ticket tel que le rail le montre : en attente et bloqué sont le
// même état au journal, pas le même à l'œil. Bloqué : un ticket qu'il attend a
// été abandonné, ou gelé — 86 sans heure de retour, que la pass n'a pas jugé.
// De même, WAITING est un 86 : celui d'un ticket en attente d'un tiers.
export function etatLu(ticket: TicketRail): string {
  if (ticket.waitingFor !== null) return EN_WAITING;
  return retenue(ticket) === "bloque" || ticket.frozenBy.length > 0 ? BLOCKED : nomEtat(ticket.state);
}

export const BLOCKED_EN = "BLOCKED";

// L'état lu en anglais : le même que `etatLu`, mot pour mot traduit.
export function etatLuEn(ticket: TicketRail): string {
  if (ticket.waitingFor !== null) return EN_WAITING;
  return retenue(ticket) === "bloque" || ticket.frozenBy.length > 0 ? BLOCKED_EN : nomEtatEn(ticket.state);
}

const ABANDONS: Record<string, string> = {
  closed: "issue fermée sans avoir été servie",
  unfired: "label `fire` retiré",
  gone: "issue disparue",
  "hors-cuisine": "label `hors-cuisine` posé : ce ticket ne se sert pas sur cette box",
};

export function nomAbandon(motif: string): string {
  return ABANDONS[motif] ?? motif;
}

// Les mêmes, en anglais : ce que dit le bloc `awaiting` de `status`.
const ABANDONS_EN: Record<string, string> = {
  closed: "issue closed without being served",
  unfired: "label `fire` removed",
  gone: "issue gone",
  "hors-cuisine": "label `hors-cuisine` set: this ticket is not served on this box",
};

export function nomAbandonEn(motif: string): string {
  return ABANDONS_EN[motif] ?? motif;
}

const GELE_EN = "blocked";
const DIT_GELE_EN = "86 with no return time, not judged by the pass";

const numeros = (tickets: { ticket: number }[]) => tickets.map(({ ticket }) => `#${ticket}`).join(", ");

// Pourquoi un ticket en attente ne part pas, ou null si rien ne le retient.
export function direRetenue(ticket: TicketRail): string | null {
  if (retenue(ticket) === null) return null;
  const droppedOnes = ticket.awaits.filter((attendu) => attendu.left !== null);
  const enCours = ticket.awaits.filter((attendu) => attendu.left === null);
  const gele = (attendu: { ticket: number }) => ticket.frozenBy.includes(attendu.ticket);
  const blocked = droppedOnes.map((attendu) => `#${attendu.ticket} abandonné (${nomAbandon(attendu.left?.reason ?? "")})`).join(", ");
  const attendus = enCours.filter((attendu) => !gele(attendu));
  return [
    ...(droppedOnes.length === 0 ? [] : [blocked]),
    ...enCours.filter(gele).map((attendu) => `${GELE} par #${attendu.ticket} (${DIT_GELE})`),
    ...(attendus.length === 0 ? [] : [`attend ${droppedOnes.length === 0 ? "" : "aussi "}${numeros(attendus)}`]),
    ...ticket.held.map((tenant) => (gele(tenant) ? `${GELE} par #${tenant.ticket} (${DIT_GELE} — zone tenue : ${tenant.path})` : `zone tenue par #${tenant.ticket} (${tenant.path})`)),
  ].join(" · ");
}

// La même, en anglais : ce que dit la ligne du ticket dans `status`.
export function direRetenueEn(ticket: TicketRail): string | null {
  if (retenue(ticket) === null) return null;
  const droppedOnes = ticket.awaits.filter((attendu) => attendu.left !== null);
  const enCours = ticket.awaits.filter((attendu) => attendu.left === null);
  const gele = (attendu: { ticket: number }) => ticket.frozenBy.includes(attendu.ticket);
  const blocked = droppedOnes.map((attendu) => `#${attendu.ticket} dropped (${nomAbandonEn(attendu.left?.reason ?? "")})`).join(", ");
  const attendus = enCours.filter((attendu) => !gele(attendu));
  return [
    ...(droppedOnes.length === 0 ? [] : [blocked]),
    ...enCours.filter(gele).map((attendu) => `${GELE_EN} by #${attendu.ticket} (${DIT_GELE_EN})`),
    ...(attendus.length === 0 ? [] : [`${droppedOnes.length === 0 ? "" : "also "}awaiting ${numeros(attendus)}`]),
    ...ticket.held.map((tenant) => (gele(tenant) ? `${GELE_EN} by #${tenant.ticket} (${DIT_GELE_EN} — zone held: ${tenant.path})` : `zone held by #${tenant.ticket} (${tenant.path})`)),
  ].join(" · ");
}

// Une fiche illisible ne retient pas son ticket : il doit partir pour être
// refusé, sur son issue, par la station — un cycle de dépendances, sinon,
// attendrait en silence.
const servable = (ticket: TicketRail) =>
  ticket.state === "waiting" && ((ticket.awaits.length === 0 && ticket.held.length === 0) || illisible(ticket.card) !== null);

// Celles de ces stations qui peuvent cuisiner ce ticket, dans l'ordre donné.
const preneusesDe = (ticket: TicketRail, preneuses: readonly Preneuse[]) =>
  preneuses.filter(({ fournit, ordinaires }) => {
    const demande = requises(ticket.card);
    return fournitTout(fournit, demande) && (ordinaires !== false || demande.length > 0);
  });

export function ouvrirRail(log: Log, options: OptionsRail): Rail {
  const { projet, dureeBailMs: leaseDurationMs } = options;
  const maintenant = options.maintenant ?? (() => new Date());
  const { base } = log;

  const noter = (ticket: number, station: string | undefined, fait: FaitRail) =>
    log.ajouter({ project: projet, ticket, author: station === undefined ? "runtime" : `station:${station}`, ...fait });

  const exiger = (ticket: number, etats: Etat[], station?: string): TicketRail => {
    const trouve = ticketDuRail(base, ticket);
    if (!trouve) throw new GesteRefuse(`le ticket ${ticket} n'est pas sur le rail`);
    if (!etats.includes(trouve.state)) {
      throw new GesteRefuse(`le ticket ${ticket} est ${nomEtat(trouve.state)} — attendu : ${etats.map(nomEtat).join(" ou ")}`);
    }
    if (station !== undefined && trouve.station !== station) {
      throw new GesteRefuse(`le ticket ${ticket} n'est pas tenu par ${station}${trouve.station ? ` mais par ${trouve.station}` : ""}`);
    }
    return trouve;
  };

  const relever = (): number =>
    base.transaction(() => {
      // Les horodatages sont tous au même format ISO 8601 UTC : l'ordre des
      // chaînes est celui du temps.
      const instant = maintenant().toISOString();
      const cooking = new Set(cooksEnCours(base).map((cook) => cook.ticket));
      let rendus = 0;
      for (const ticket of lireRail(base)) {
        if (ticket.state === "taken" && ticket.leaseUntil !== null && ticket.leaseUntil <= instant) {
          if (cooking.has(ticket.ticket)) continue;
          noter(ticket.ticket, undefined, { type: "ticket.released", payload: { reason: LEASE_EXPIRED, station: ticket.station } });
          rendus++;
        } else if (ticket.state === "86" && ticket.until !== null && ticket.until <= instant) {
          noter(ticket.ticket, undefined, { type: "ticket.released", payload: { reason: FIN_DE_86, station: null } });
          rendus++;
        } else if (ticket.waitingFor !== null && Date.parse(ticket.waitingFor.followUp) <= Date.parse(instant)) {
          // La relance est atteinte : le ticket revient devant le chef, motif dit.
          noter(ticket.ticket, undefined, { type: "ticket.resumed", payload: { to: "todo", why: motifDeRelance(ticket.waitingFor.followUp) } });
          rendus++;
        }
      }
      return rendus;
    });

  const exigerMotif = (motif: string): void => {
    if (motif === "") throw new GesteRefuse("un ticket ne change pas d'état sans motif");
  };

  // Les tickets qu'une station peut prendre, dans l'ordre de service : rien ne
  // les retient sur le rail, et leur zone ne recouvre celle d'aucun ticket
  // encore en cuisine.
  const prenables = (cooking?: ReadonlyMap<number, string[]>, preneuses?: readonly Preneuse[], seul?: number): TicketRail[] => {
    const communs = cooking?.size ? communsDuRail(base) : [];
    const zoneLibre = (ticket: TicketRail) => {
      const zone = illisible(ticket.card) === null ? (ticket.card?.zone ?? []) : [];
      return ![...(cooking?.values() ?? [])].some((tenue) => recouvrement(zone, tenue, communs) !== null);
    };
    const cuisinable = (ticket: TicketRail) => preneuses === undefined || preneusesDe(ticket, preneuses).length > 0;
    return lireRail(base).filter(
      (ticket) => (seul === undefined || ticket.ticket === seul) && servable(ticket) && !cooking?.has(ticket.ticket) && zoneLibre(ticket) && cuisinable(ticket),
    );
  };

  const echeance = () => new Date(maintenant().getTime() + leaseDurationMs).toISOString();

  return {
    tickets: () => lireRail(base),
    relever,
    prendre(qui, cooking, seul) {
      const preneuses = typeof qui === "string" ? undefined : qui;
      if (qui === "" || preneuses?.some(({ station }) => station === "")) throw new GesteRefuse("une station sans nom ne prend pas de ticket");
      return base.transaction(() => {
        // Un ticket dont le bail vient d'échoir n'attend pas le tick pour
        // redevenir prenable.
        relever();
        const suivant = prenables(cooking, preneuses, seul)[0];
        if (!suivant) return null;
        const station = typeof qui === "string" ? qui : preneusesDe(suivant, qui)[0]?.station;
        if (station === undefined) return null;
        noter(suivant.ticket, station, { type: "ticket.taken", payload: { station, leaseUntil: echeance() } });
        return ticketDuRail(base, suivant.ticket);
      });
    },
    servables: (cooking, preneuses, seul) => prenables(cooking, preneuses, seul).length,
    renouveler(ticket, station) {
      base.transaction(() => {
        exiger(ticket, ["taken"], station);
        noter(ticket, station, { type: "ticket.renewed", payload: { station, leaseUntil: echeance() } });
      });
    },
    rendre(ticket, motif, station) {
      exigerMotif(motif);
      base.transaction(() => {
        const tenu = exiger(ticket, ["taken", "pass", "86"], station);
        noter(ticket, station, { type: "ticket.released", payload: { reason: motif, station: tenu.station } });
      });
    },
    envoyerEnPass(ticket, station) {
      base.transaction(() => {
        exiger(ticket, ["taken"], station);
        noter(ticket, station, { type: "ticket.passing", payload: { station } });
      });
    },
    servir(ticket) {
      base.transaction(() => {
        exiger(ticket, ["pass"]);
        noter(ticket, undefined, { type: "ticket.served", payload: {} });
      });
    },
    quatreVingtSix(ticket, { motif, retour, station }) {
      exigerMotif(motif);
      base.transaction(() => {
        // Une station ne déclare 86 que le ticket qu'elle tient. Le runtime, lui,
        // peut aussi le dire d'un ticket en pass : elle remonte au chef.
        exiger(ticket, station === undefined ? ["waiting", "taken", "pass"] : ["taken"], station);
        noter(ticket, station, { type: "ticket.86", payload: { reason: motif, until: retour?.toISOString() ?? null } });
      });
    },
  };
}
