// Ce que l'onboarding d'un projet lit dans son répertoire d'état : le ticket
// de préparation que la station a ouvert (`preparation-depot/ouvrir.ts`), et
// ce que le journal du projet en sait — sa place au rail, son sort, sa
// livraison à la pass —, le premier ticket du chef, et si les cooks tournent
// sans bac à sable. Le journal s'ouvre en lecture seule : la cuisine qui y
// écrit n'est pas dérangée. Absent, ou d'avant les projections qu'il lit, il
// ne dit rien — ce n'est pas une panne : la cuisine ne s'est pas encore ouverte.
import { ouvrirJournal } from "../journal.ts";
import { lirePreparation } from "../preparation-depot/ouvrir.ts";
import { passDuTicket } from "../projections/pass.ts";
import { sortDuTicket, ticketDuRail } from "../projections/rail.ts";
import { lireDecisionSansBacASable } from "./attente.ts";
import { etatDOnboarding, type Entrees, type FaitsDePreparation, type Onboarding } from "./etat.ts";

export type FaitsDuProjet = Pick<Entrees, "preparation" | "premierTicket" | "dejaServi" | "sansBacASable" | "decision">;

const RIEN: FaitsDuProjet = { preparation: null, premierTicket: null, dejaServi: false, sansBacASable: null, decision: null };

export function lireFaitsDuProjet(repertoireEtat: string): FaitsDuProjet {
  const decision = lireDecisionSansBacASable(repertoireEtat);
  const ouverte = lirePreparation(repertoireEtat);
  const sansJournal: FaitsDuProjet = { ...RIEN, decision, preparation: ouverte === null ? null : { ticket: ouverte.ticket, rail: null, sort: null, pass: null } };
  let journal;
  try {
    journal = ouvrirJournal(repertoireEtat, { lectureSeule: true });
  } catch {
    return sansJournal;
  }
  try {
    const { base } = journal;
    const ticket = ouverte?.ticket ?? null;
    let preparation: FaitsDePreparation | null = null;
    if (ticket !== null) {
      const surLeRail = ticketDuRail(base, ticket);
      const sort = sortDuTicket(base, ticket);
      const pass = passDuTicket(base, ticket);
      preparation = {
        ticket,
        rail: surLeRail === null ? null : { etat: surLeRail.state, station: surLeRail.station, raison: surLeRail.reason, retour: surLeRail.until, url: surLeRail.url },
        sort: sort === null ? null : { issue: sort.outcome, raison: sort.reason },
        pass: pass === null ? null : { phase: pass.phase, pr: pass.pr },
      };
    }
    // Les tickets du chef : tous ceux du projet, sauf celui de préparation.
    const premier = base.lire<{ ticket: number; url: string | null }>(
      "SELECT ticket, json_extract(payload, '$.url') AS url FROM events WHERE type = 'ticket.arrived' AND ticket IS NOT NULL AND ticket IS NOT ? ORDER BY seq LIMIT 1",
      ticket,
    )[0];
    const servis = base.lire<{ combien: number }>("SELECT count(*) AS combien FROM events WHERE type = 'ticket.served' AND ticket IS NOT NULL AND ticket IS NOT ?", ticket)[0]?.combien ?? 0;
    const cloison = journal.duType("isolation.configured", 1)[0]?.payload;
    return {
      preparation,
      premierTicket: premier === undefined ? null : { ticket: premier.ticket, url: premier.url ?? "" },
      dejaServi: servis > 0,
      sansBacASable: cloison === undefined ? null : cloison.sandbox === null,
      decision,
    };
  } catch {
    // Un journal d'avant les projections lues ici : rien d'autre que le ticket ouvert.
    return sansJournal;
  } finally {
    journal.fermer();
  }
}

export type OptionsOnboarding = Omit<Entrees, keyof FaitsDuProjet> & { repertoireEtat: string };

// L'onboarding d'un projet, d'après ce que la station en sait et ce que son
// répertoire d'état porte.
export function lireOnboarding({ repertoireEtat, ...entrees }: OptionsOnboarding): Onboarding {
  return etatDOnboarding({ ...entrees, ...lireFaitsDuProjet(repertoireEtat) });
}
