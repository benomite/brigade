// Les gestes du rail : prêter un ticket à une station — une seule à la fois —
// et le faire avancer jusqu'au service. Chaque geste vérifie puis écrit dans
// une seule transaction d'écriture : deux gestes concurrents se suivent, ils ne
// se croisent pas.
import { BAIL_ECHU, FIN_DE_86, type FaitRail } from "./evenements/rail.ts";
import type { Journal } from "./journal.ts";
import { lireRail, ticketDuRail, type Etat, type TicketRail } from "./projections/rail.ts";

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
  // Le silence toléré d'une station : passé ce délai sans renouvellement, son
  // ticket est rendu.
  dureeBailMs: number;
  maintenant?: () => Date;
};

export type Rail = {
  // Le rail, dans l'ordre de service.
  tickets(): TicketRail[];
  // Prête à la station le premier ticket en attente, ou rien s'il n'y en a pas.
  prendre(station: string): TicketRail | null;
  // Repousse l'échéance du bail : la station vit encore.
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
  // le nombre de tickets remis en attente.
  relever(): number;
};

const NOMS: Record<Etat, string> = { waiting: "en attente", taken: "pris", pass: "en pass", served: "servi", "86": "86" };

// L'état d'un ticket tel que le chef le lit.
export function nomEtat(etat: Etat): string {
  return NOMS[etat];
}

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
      let rendus = 0;
      for (const ticket of lireRail(base)) {
        if (ticket.state === "taken" && ticket.leaseUntil !== null && ticket.leaseUntil <= instant) {
          noter(ticket.ticket, undefined, { type: "ticket.released", payload: { reason: BAIL_ECHU, station: ticket.station } });
          rendus++;
        } else if (ticket.state === "86" && ticket.until !== null && ticket.until <= instant) {
          noter(ticket.ticket, undefined, { type: "ticket.released", payload: { reason: FIN_DE_86, station: null } });
          rendus++;
        }
      }
      return rendus;
    });

  const echeance = () => new Date(maintenant().getTime() + dureeBailMs).toISOString();

  return {
    tickets: () => lireRail(base),
    relever,
    prendre(station) {
      if (station === "") throw new GesteRefuse("une station sans nom ne prend pas de ticket");
      return base.transaction(() => {
        // Un ticket dont le bail vient d'échoir n'attend pas le tick pour
        // redevenir prenable.
        relever();
        const suivant = lireRail(base).find((ticket) => ticket.state === "waiting");
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
      base.transaction(() => {
        // Une station ne déclare 86 que le ticket qu'elle tient.
        exiger(ticket, station === undefined ? ["waiting", "taken"] : ["taken"], station);
        noter(ticket, station, { type: "ticket.86", payload: { reason: motif, until: retour?.toISOString() ?? null } });
      });
    },
  };
}
