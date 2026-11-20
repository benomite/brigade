// Ce que le superviseur observe du tour GitHub seul (#3914) : le client du
// tour est enveloppé, et chaque lecture des tickets, des checks de la base,
// des commentaires et chaque merge y laisse ce que le déclenchement demande
// (`declenchement.ts`) et ce que le dossier du manager montre (`dossier.ts`),
// sans un appel de plus à GitHub.
//
// - Le dernier merge : un merge que ce tour a fait, ou un ticket en pass qui
//   n'est plus parmi les tickets ouverts — une autre station l'a mergé. À
//   défaut, l'ouverture : rien n'est tenu d'un process à l'autre.
// - Un ticket cuisinable : `fire`, ni pris, ni en pass, ni mis de côté, ni en
//   attente du chef ou d'un tiers, au calibrage complet, ni une épique ni un
//   besoin dont un ticket lancé est né.
// - Les prises de chaque ticket ouvert : les marques de prise de ses
//   commentaires, comptées chaque fois que le tour les lit.
// - La base rouge : depuis le premier tour qui l'a vue rouge, sur un check qui
//   n'est pas informatif (les tests Windows, #2087).
// - La file : les tickets qui attendent une prise, et ce que la porte de prise
//   a dit de chacun qu'elle a sauté.
import { A_LA_MAIN, type GitHubDuTour, type TicketLu } from "../brigade-github.ts";
import { horsDesBesoins } from "../besoin/besoin.ts";
import { calibrage, complet } from "../calibrage.ts";
import { LABEL_IN_PASS, LABEL_TAKEN, LABEL_WAITING } from "../github-etat/etats.ts";
import { stationsDesPrises } from "../github-etat/prise.ts";
import { MIS_DE_COTE } from "../github.ts";
import { CHEF_TODO } from "../github-seul/carte-todo/carte-todo.ts";
import type { Observation } from "./declenchement.ts";
import type { TicketDeLaFile } from "./dossier.ts";

// Les labels d'un ticket qui n'attend pas la cuisine.
const AILLEURS: readonly string[] = [...MIS_DE_COTE, A_LA_MAIN, CHEF_TODO, LABEL_WAITING];

// Les checks Windows sont informatifs (#2087) : rouges sur main, ils ne retiennent rien.
export const estInformatif = (nom: string | undefined) => /^windows (app )?tests\b/i.test(nom ?? "");

export type ObservationDuTour = {
  envelopper(github: GitHubDuTour): GitHubDuTour;
  // Le client enveloppé, une fois le tour ouvert : null avant.
  client(): GitHubDuTour | null;
  // La porte de prise n'a pas pris ce ticket prenable, et `ligne` dit pourquoi.
  sauter(ticket: number, ligne: string): void;
  observation(): Observation;
  file(): TicketDeLaFile[];
};

export function observerLeTour(maintenant: () => Date = () => new Date()): ObservationDuTour {
  const ouverture = maintenant().toISOString();
  let dernierMerge: string | null = null;
  let baseRougeDepuis: string | null = null;
  let checksRouges: string[] = [];
  let ouverts = new Map<number, TicketLu>();
  let enPass = new Set<number>();
  let cuisinables: TicketLu[] = [];
  let sauts = new Map<number, string>();
  const prises = new Map<number, number>();
  let enveloppe: GitHubDuTour | null = null;

  const noterTickets = (tickets: TicketLu[]) => {
    const instant = maintenant().toISOString();
    const suivants = new Map(tickets.map((ticket) => [ticket.number, ticket]));
    if ([...enPass].some((ticket) => !suivants.has(ticket))) dernierMerge = instant;
    ouverts = suivants;
    enPass = new Set(tickets.filter(({ labels }) => labels.includes(LABEL_IN_PASS)).map(({ number }) => number));
    cuisinables = horsDesBesoins(tickets).filter(({ labels }) => !labels.some((label) => AILLEURS.includes(label) || label === LABEL_TAKEN || label === LABEL_IN_PASS) && complet(calibrage(labels)));
    for (const ticket of prises.keys()) if (!suivants.has(ticket)) prises.delete(ticket);
    sauts = new Map([...sauts].filter(([ticket]) => suivants.has(ticket)));
  };

  return {
    client: () => enveloppe,
    sauter: (ticket, ligne) => void sauts.set(ticket, ligne),
    envelopper: (github) =>
      (enveloppe = {
        ...github,
        fires: async () => {
          const tickets = await github.fires();
          noterTickets(tickets);
          return tickets;
        },
        commentaires: async (numero) => {
          const lus = await github.commentaires(numero);
          if (ouverts.has(numero)) prises.set(numero, stationsDesPrises(lus).length);
          return lus;
        },
        checksDeLaBase: async () => {
          const lus = await github.checksDeLaBase();
          checksRouges = lus.filter(({ outcome, name }) => outcome === "red" && !estInformatif(name)).map(({ name }) => name ?? "unnamed check");
          baseRougeDepuis = checksRouges.length === 0 ? null : (baseRougeDepuis ?? maintenant().toISOString());
          return lus;
        },
        merger: async (numero, sha) => {
          const merge = await github.merger(numero, sha);
          if (merge.fait) dernierMerge = maintenant().toISOString();
          return merge;
        },
      }),
    observation: () => ({
      dernierMerge,
      ouverture,
      ticketCuisinable: cuisinables.length > 0,
      prises: [...prises].map(([ticket, fois]) => ({ ticket, prises: fois })),
      baseRougeDepuis,
      checksRouges,
    }),
    file: () => cuisinables.map(({ number, title }) => ({ ticket: number, titre: title, ...(sauts.has(number) ? { ligne: sauts.get(number) as string } : {}) })),
  };
}
