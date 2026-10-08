// Les gestes du rail : prêter un ticket à une station — une seule à la fois —
// et le faire avancer jusqu'au service. Chaque geste vérifie puis écrit dans
// une seule transaction d'écriture : deux gestes concurrents se suivent, ils ne
// se croisent pas.
import { BAIL_ECHU, FIN_DE_86, type FaitRail } from "./evenements/rail.ts";
import { illisible } from "./fiche.ts";
import type { Journal } from "./journal.ts";
import { cooksEnCours } from "./projections/garde-fous.ts";
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

export type Rail = {
  // Le rail, dans l'ordre de service.
  tickets(): TicketRail[];
  // Prête à la station le premier ticket en attente que rien ne retient, ou
  // rien s'il n'y en a pas. `enCuisine` : les tickets dont elle n'a pas fini la
  // cuisine, chacun avec la zone qu'il portait à sa prise. Elle ne les reprend
  // pas, et leur zone reste tenue même s'ils ont quitté ses mains : un ticket
  // rendu ou retiré du rail pendant que son cook tourne ne libère rien tant
  // que ce cook écrit encore.
  prendre(station: string, enCuisine?: ReadonlyMap<number, string[]>): TicketRail | null;
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

export const BLOQUE = "BLOQUÉ";

// L'état d'un ticket tel que le rail le montre : en attente et bloqué sont le
// même état au journal, pas le même à l'œil.
export function etatLu(ticket: TicketRail): string {
  return retenue(ticket) === "bloque" ? BLOQUE : nomEtat(ticket.state);
}

const ABANDONS: Record<string, string> = {
  closed: "issue fermée sans avoir été servie",
  unfired: "label `fire` retiré",
  gone: "issue disparue",
};

export function nomAbandon(motif: string): string {
  return ABANDONS[motif] ?? motif;
}

const numeros = (tickets: { ticket: number }[]) => tickets.map(({ ticket }) => `#${ticket}`).join(", ");

// Pourquoi un ticket en attente ne part pas, ou null si rien ne le retient.
export function direRetenue(ticket: TicketRail): string | null {
  if (retenue(ticket) === null) return null;
  const abandonnes = ticket.awaits.filter((attendu) => attendu.left !== null);
  const enCours = ticket.awaits.filter((attendu) => attendu.left === null);
  const bloque = abandonnes.map((attendu) => `#${attendu.ticket} abandonné (${nomAbandon(attendu.left?.reason ?? "")})`).join(", ");
  return [
    ...(abandonnes.length === 0 ? [] : [bloque]),
    ...(enCours.length === 0 ? [] : [`attend ${abandonnes.length === 0 ? "" : "aussi "}${numeros(enCours)}`]),
    ...ticket.held.map((tenant) => `zone tenue par #${tenant.ticket} (${tenant.path})`),
  ].join(" · ");
}

// Une fiche illisible ne retient pas son ticket : il doit partir pour être
// refusé, sur son issue, par la station — un cycle de dépendances, sinon,
// attendrait en silence.
const servable = (ticket: TicketRail) =>
  ticket.state === "waiting" && ((ticket.awaits.length === 0 && ticket.held.length === 0) || illisible(ticket.card) !== null);

export function ouvrirRail(journal: Journal, options: OptionsRail): Rail {
  const { projet, dureeBailMs } = options;
  const maintenant = options.maintenant ?? (() => new Date());
  const { base } = journal;

  const noter = (ticket: number, station: string | undefined, fait: FaitRail) =>
    journal.ajouter({ project: projet, ticket, author: station === undefined ? "runtime" : `station:${station}`, ...fait });

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
      const enCuisine = new Set(cooksEnCours(base).map((cook) => cook.ticket));
      let rendus = 0;
      for (const ticket of lireRail(base)) {
        if (ticket.state === "taken" && ticket.leaseUntil !== null && ticket.leaseUntil <= instant) {
          if (enCuisine.has(ticket.ticket)) continue;
          noter(ticket.ticket, undefined, { type: "ticket.released", payload: { reason: BAIL_ECHU, station: ticket.station } });
          rendus++;
        } else if (ticket.state === "86" && ticket.until !== null && ticket.until <= instant) {
          noter(ticket.ticket, undefined, { type: "ticket.released", payload: { reason: FIN_DE_86, station: null } });
          rendus++;
        }
      }
      return rendus;
    });

  const exigerMotif = (motif: string): void => {
    if (motif === "") throw new GesteRefuse("un ticket ne change pas d'état sans motif");
  };

  const echeance = () => new Date(maintenant().getTime() + dureeBailMs).toISOString();

  return {
    tickets: () => lireRail(base),
    relever,
    prendre(station, enCuisine) {
      if (station === "") throw new GesteRefuse("une station sans nom ne prend pas de ticket");
      return base.transaction(() => {
        // Un ticket dont le bail vient d'échoir n'attend pas le tick pour
        // redevenir prenable.
        relever();
        const communs = enCuisine?.size ? communsDuRail(base) : [];
        const zoneLibre = (ticket: TicketRail) => {
          const zone = illisible(ticket.card) === null ? (ticket.card?.zone ?? []) : [];
          return ![...(enCuisine?.values() ?? [])].some((tenue) => recouvrement(zone, tenue, communs) !== null);
        };
        const suivant = lireRail(base).find((ticket) => servable(ticket) && !enCuisine?.has(ticket.ticket) && zoneLibre(ticket));
        if (!suivant) return null;
        noter(suivant.ticket, station, { type: "ticket.taken", payload: { station, leaseUntil: echeance() } });
        return ticketDuRail(base, suivant.ticket);
      });
    },
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
