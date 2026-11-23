// Ce que le réveil sans progrès (`inactivite.ts`, #4027) lit du tour GitHub seul :
// le client de la station est enveloppé (`superviseur/tour.ts`), et ses lectures
// disent, sans un appel de plus à GitHub :
//
// - l'état de chaque ticket suivi, lu de ses labels à chaque lecture des tickets ;
// - un nouveau commit : la tête de la PR d'un ticket a changé depuis la lecture d'avant ;
// - un résultat de CI : les checks conclus d'une tête de PR ont changé depuis la lecture d'avant ;
// - un verdict de relecture : la station poste un verdict (`brigade:verdict`) sur la PR d'un ticket.
//
// Les labels que ce client pose ou retire sont ceux de la station : ils ne comptent pas. Ceux
// que posent les gestes du superviseur, un agent, se notent dans `superviseur/brancher.ts`.
// La première lecture d'une tête ou de ses checks n'est pas un progrès : elle ne dit pas quand
// ils sont arrivés.
import { A_LA_MAIN, type GitHubDuTour } from "../brigade-github.ts";
import { LABEL_IN_PASS, LABEL_TAKEN, LABEL_WAITING } from "../github-etat/etats.ts";
import { MARQUE_DE_VERDICT } from "../github-etat/fusion.ts";
import { CHEF_TODO } from "../github-seul/carte-todo/carte-todo.ts";
import { estMisDeCote } from "../github.ts";
import type { GenreDeProgres, Progres, TicketSuivi } from "./inactivite.ts";

// L'état d'un ticket dans les mots du glossaire, ou null s'il n'est dans aucun des cinq :
// WAITING l'emporte, puis la pass, la cuisine, la mise de côté, puis le ticket parqué
// pour un humain (`blocked-on-human`, `chef-todo`).
function etatSuivi(labels: readonly string[]): string | null {
  if (labels.includes(LABEL_WAITING)) return "WAITING";
  if (labels.includes(LABEL_IN_PASS)) return "in pass";
  if (labels.includes(LABEL_TAKEN)) return "cooking";
  if (estMisDeCote(labels)) return "set aside";
  if (labels.includes(A_LA_MAIN) || labels.includes(CHEF_TODO)) return "parked";
  return null;
}

type Observe = Pick<GitHubDuTour, "fires" | "commenter"> & Partial<Pick<GitHubDuTour, "prsOuvertes" | "prDuTicket" | "prOuverteDuTicket" | "ci">>;

export type SuiviDesProgres = {
  envelopper<G extends Observe>(github: G): G;
  // Les tickets suivis à la dernière lecture des tickets.
  tickets(): TicketSuivi[];
  // Qui reçoit les progrès observés.
  ecouter(noter: (ticket: number, progres: Progres) => void): void;
};

const BRANCHE_DU_TICKET = /^cook\/(\d+)-/;

export function suivreLesProgres(maintenant: () => Date = () => new Date()): SuiviDesProgres {
  let tickets: TicketSuivi[] = [];
  let noter: ((ticket: number, progres: Progres) => void) | null = null;
  // La tête de PR lue de chaque ticket ; le ticket de chaque tête et de chaque PR ; les checks conclus de chaque tête.
  const tetes = new Map<number, string>();
  const ticketDeLaTete = new Map<string, number>();
  const ticketDeLaPR = new Map<number, number>();
  const conclus = new Map<string, string>();

  const signaler = (ticket: number, kind: GenreDeProgres) => noter?.(ticket, { kind, by: "agent", at: maintenant().toISOString() });
  const voir = (ticket: number, pr: { number?: number; sha?: string }) => {
    if (typeof pr.number === "number") ticketDeLaPR.set(pr.number, ticket);
    if (pr.sha === undefined) return;
    ticketDeLaTete.set(pr.sha, ticket);
    const avant = tetes.get(ticket);
    tetes.set(ticket, pr.sha);
    // La première lecture d'une tête, ou la même tête : pas de commit neuf.
    if (avant === undefined || avant === pr.sha) return;
    signaler(ticket, "commit");
  };
  // Les tickets qui ne sont plus ouverts ne se suivent plus.
  const oublier = (ouverts: Set<number>) => {
    for (const [ticket] of tetes) if (!ouverts.has(ticket)) tetes.delete(ticket);
    for (const [sha, ticket] of ticketDeLaTete) {
      if (ouverts.has(ticket)) continue;
      ticketDeLaTete.delete(sha);
      conclus.delete(sha);
    }
    for (const [pr, ticket] of ticketDeLaPR) if (!ouverts.has(ticket)) ticketDeLaPR.delete(pr);
  };

  return {
    tickets: () => tickets,
    ecouter: (ecoute) => void (noter = ecoute),
    envelopper: (github) => {
      const { prsOuvertes, prDuTicket, prOuverteDuTicket, ci } = github;
      return {
        ...github,
        fires: async () => {
          const lus = await github.fires();
          tickets = lus.flatMap(({ number, labels }) => {
            const state = etatSuivi(labels);
            return state === null ? [] : [{ number, state }];
          });
          oublier(new Set(lus.map(({ number }) => number)));
          return lus;
        },
        commenter: async (numero: number, corps: string) => {
          await github.commenter(numero, corps);
          const ticket = ticketDeLaPR.get(numero);
          if (ticket === undefined || !MARQUE_DE_VERDICT.test(corps)) return;
          signaler(ticket, "review");
        },
        ...(prsOuvertes === undefined
          ? {}
          : {
              prsOuvertes: async () => {
                const ouvertes = await prsOuvertes.call(github);
                for (const ouverte of ouvertes) {
                  const numero = BRANCHE_DU_TICKET.exec(ouverte.branche)?.[1];
                  if (typeof numero === "string") voir(Number(numero), ouverte);
                }
                return ouvertes;
              },
            }),
        ...(prDuTicket === undefined
          ? {}
          : {
              prDuTicket: async (issue: number) => {
                const pr = await prDuTicket.call(github, issue);
                if (pr === null) return pr;
                voir(issue, pr);
                return pr;
              },
            }),
        ...(prOuverteDuTicket === undefined
          ? {}
          : {
              prOuverteDuTicket: async (issue: number) => {
                const pr = await prOuverteDuTicket.call(github, issue);
                if (pr === null) return pr;
                voir(issue, pr);
                return pr;
              },
            }),
        ...(ci === undefined
          ? {}
          : {
              ci: async (sha: string) => {
                const checks = await ci.call(github, sha);
                const ticket = ticketDeLaTete.get(sha);
                if (ticket === undefined) return checks;
                const lus = checks
                  .filter(({ outcome }) => outcome === "green" || outcome === "red")
                  .map(({ name, outcome }) => `${name ?? ""}=${outcome}`)
                  .sort()
                  .join("\n");
                const avant = conclus.get(sha);
                conclus.set(sha, lus);
                if (avant === undefined || avant === lus) return checks;
                signaler(ticket, "ci");
                return checks;
              },
            }),
      };
    },
  };
}
