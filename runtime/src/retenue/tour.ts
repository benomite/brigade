// Ce que la retenue observe du tour GitHub seul (brigade-github.ts) : là, le
// journal ne tient plus le rail, et c'est le tour qui lit les tickets. Son
// client GitHub est enveloppé ; chaque lecture des tickets, des checks de la
// base et chaque merge y laisse ce que le détecteur demande (retenue.ts), sans
// un appel de plus à GitHub.
//
// - Attendent : les tickets `fire` en pass, et ceux qu'une station prendrait —
//   ni `taken`, ni `in-pass`, au calibrage complet. Pas ceux qui attendent le
//   chef (`blocked-on-human`, `chef-todo`), un tiers (`waiting`), ou qui sont
//   sortis de la cuisine (`hors-cuisine`).
// - Servi : un merge que ce tour a fait, ou un ticket en pass qui n'est plus
//   parmi les tickets ouverts — une autre station l'a mergé.
// - Depuis quand ils attendent : le premier tour qui a vu chacun d'eux attendre.
// - Attendent leur CI (#2456) : ceux en pass dont la tête de PR, au dernier
//   tour, n'avait aucun check, ou des checks qui tournaient, et aucun rouge.
//
// Rien n'est tenu d'un process à l'autre : à l'ouverture, le compte repart.
import { A_LA_MAIN, type GitHubDuTour, type TicketLu } from "../brigade-github.ts";
import { calibrage, complet } from "../calibrage.ts";
import { LABEL_IN_PASS, LABEL_TAKEN, LABEL_WAITING } from "../github-etat/etats.ts";
import { HORS_CUISINE } from "../github.ts";
import { CHEF_TODO } from "../github-seul/carte-todo/carte-todo.ts";
import type { CheckVu } from "../carte-ci-windows.ts";
import type { Observation } from "./retenue.ts";

// Les labels d'un ticket qui n'attend pas la cuisine.
const AILLEURS = [HORS_CUISINE, A_LA_MAIN, CHEF_TODO, LABEL_WAITING];

// Ce que le tour a vu : l'observation (sans `eteinte`, que le journal dit), et
// les noms des checks rouges de la base, nuls tant qu'aucun n'est lu.
// `checks` : tous ceux de la base au dernier tour (nom et issue), nuls avant.
// `attenteCI` : les tickets en pass dont la tête attend sa CI, et les checks
// qui y tournent ; nulle si aucun.
export type VueDuTour = Omit<Observation, "eteinte"> & { checksRouges: string[] | null; checks: CheckVu[] | null; attenteCI: { tickets: number[]; running: string[] } | null };

export type SuiviDuTour = {
  // Le client du tour, enveloppé.
  envelopper(github: GitHubDuTour): GitHubDuTour;
  // Le client enveloppé, une fois le tour ouvert : null avant.
  client(): GitHubDuTour | null;
  vue(): VueDuTour;
};

export function suivreLeTour(maintenant: () => Date = () => new Date()): SuiviDuTour {
  const ouverture = maintenant().toISOString();
  let dernierService: string | null = null;
  let checksRouges: string[] | null = null;
  let checks: CheckVu[] | null = null;
  // Les tickets qui attendent, et le tour qui a vu chacun commencer d'attendre.
  let attendent = new Map<number, string>();
  let enPass = new Set<number>();
  let enveloppe: GitHubDuTour | null = null;
  // La tête de la PR de chaque ticket, et les checks lus sur chaque tête.
  const tetes = new Map<number, string>();
  const ciDesTetes = new Map<string, Array<{ name?: string; outcome: string }>>();

  const noterTickets = (tickets: TicketLu[]) => {
    const instant = maintenant().toISOString();
    const ouverts = new Set(tickets.map(({ number }) => number));
    if ([...enPass].some((ticket) => !ouverts.has(ticket))) dernierService = instant;
    const suivants = new Map<number, string>();
    const passes = new Set<number>();
    for (const { number, labels } of tickets) {
      if (labels.some((label) => AILLEURS.includes(label))) continue;
      const passe = labels.includes(LABEL_IN_PASS);
      if (passe) passes.add(number);
      if (passe || (!labels.includes(LABEL_TAKEN) && complet(calibrage(labels)))) suivants.set(number, attendent.get(number) ?? instant);
    }
    attendent = suivants;
    enPass = passes;
  };

  return {
    client: () => enveloppe,
    envelopper: (github) => (enveloppe = {
      ...github,
      fires: async () => {
        const tickets = await github.fires();
        noterTickets(tickets);
        return tickets;
      },
      checksDeLaBase: async () => {
        const lus = await github.checksDeLaBase();
        checksRouges = lus.filter(({ outcome }) => outcome === "red").map(({ name }) => name ?? "unnamed check");
        checks = lus.map(({ name, outcome }) => ({ name, outcome }));
        return lus;
      },
      prDuTicket: async (issue) => {
        const pr = await github.prDuTicket(issue);
        if (pr !== null && pr.state === "open" && !pr.merged) tetes.set(issue, pr.sha);
        else tetes.delete(issue);
        return pr;
      },
      ci: async (sha) => {
        const lus = await github.ci(sha);
        ciDesTetes.set(sha, lus);
        return lus;
      },
      merger: async (numero, sha) => {
        const merge = await github.merger(numero, sha);
        if (merge.fait) dernierService = maintenant().toISOString();
        return merge;
      },
    }),
    vue: () => {
      const depuis = [...attendent.values()].sort()[0] ?? null;
      // Ce qu'on ne garde plus : les têtes des tickets sortis du pass.
      for (const ticket of tetes.keys()) if (!enPass.has(ticket)) tetes.delete(ticket);
      const vives = new Set(tetes.values());
      for (const sha of ciDesTetes.keys()) if (!vives.has(sha)) ciDesTetes.delete(sha);
      const enCours = new Set<string>();
      const attendentLaCI = [...enPass]
        .filter((ticket) => attendent.has(ticket))
        .filter((ticket) => {
          const lus = ciDesTetes.get(tetes.get(ticket) ?? "");
          if (lus === undefined || lus.some(({ outcome }) => outcome === "red")) return false;
          const tournent = lus.filter(({ outcome }) => outcome === "pending");
          for (const { name } of tournent) enCours.add(name ?? "unnamed check");
          return lus.length === 0 || tournent.length > 0;
        })
        .sort((a, b) => a - b);
      const attenteCI = attendentLaCI.length === 0 ? null : { tickets: attendentLaCI, running: [...enCours].sort() };
      return { enAttente: [...attendent.keys()].sort((a, b) => a - b), attenteDepuis: depuis, dernierService, ouverture, checksRouges, checks, attenteCI };
    },
  };
}
