// Ce que le superviseur observe du tour GitHub seul (brigade-github.ts) : son
// client est enveloppé, et chaque lecture des tickets, des checks de la base,
// chaque commentaire d'échec et chaque merge y laisse ce que le déclencheur
// demande (`declencheur.ts`), sans un appel de plus à GitHub.
//
// - Le dernier merge : un merge que ce tour a fait, ou un ticket en pass qui
//   n'est plus parmi les tickets ouverts — une autre station l'a mergé.
// - Les cuisinables : les tickets `fire` qu'une station prendrait — ni pris, ni
//   en pass, au calibrage complet, ni mis de côté, ni en attente du chef
//   (`blocked-on-human`, `chef-todo`) ou d'un tiers (`waiting`), ni une épique
//   ni un besoin dont un ticket lancé est né (#2618, #3479) —, et depuis quand :
//   le premier tour qui a vu chacun attendre. Un ticket que la porte de prise
//   a sauté parce qu'il n'attend que des tickets en cuisson n'en est pas un :
//   le cook en cours le lèvera (#3647). Ce que la porte de prise a dit des
//   cuisinables qu'elle a sautés va au dossier du manager (`brancher.ts`).
// - Les prises sans livrer : le compte `n=` que la station écrit dans le
//   commentaire de chaque cook arrêté sans livraison (`MARQUE_D_ECHEC`), plus
//   chaque relance où le cook n'a rien ajouté sur une CI rouge (#4008) : le
//   commentaire de la station n'a pas de `n=`, la relance s'ajoute au compte ;
//   un `n=` qui suit fait foi, la relance n'est pas comptée deux fois.
// - `main` rouge : depuis le premier tour qui a lu un check rouge sur sa tête,
//   nul dès qu'aucun ne l'est.
//
// Rien n'est tenu d'un process à l'autre : à l'ouverture, les comptes repartent.
import { A_LA_MAIN, type GitHubDuTour, type TicketLu } from "../brigade-github.ts";
import { horsDesBesoins } from "../besoin/besoin.ts";
import { calibrage, complet } from "../calibrage.ts";
import type { CheckVu } from "../carte-ci-windows.ts";
import { LABEL_IN_PASS, LABEL_TAKEN, LABEL_WAITING } from "../github-etat/etats.ts";
import { estMisDeCote, MIS_DE_COTE } from "../github.ts";
import { CHEF_TODO } from "../github-seul/carte-todo/carte-todo.ts";
import { MARQUE_D_ECHEC } from "../qualite-github.ts";
import { PRIO_REPARATION } from "../reparation.ts";
import type { FaitsDuProjet } from "./declencheur.ts";

// Les labels d'un ticket qui n'attend pas la cuisine.
const AILLEURS: readonly string[] = [...MIS_DE_COTE, A_LA_MAIN, CHEF_TODO, LABEL_WAITING, LABEL_TAKEN, LABEL_IN_PASS];

const PRISES = new RegExp(`^${MARQUE_D_ECHEC} n=(\\d+)`);
// Le commentaire de la station quand le cook n'a rien ajouté et que la CI de la PR est rouge (`brigade-github.ts`).
const A_VIDE = /the cook added nothing, and the delivery still has work left — /;

export type SuiviDuTour = {
  // Le client du tour, enveloppé.
  envelopper(github: GitHubDuTour): GitHubDuTour;
  // La porte de prise n'a pas pris ce ticket prenable, et `ligne` dit pourquoi ;
  // `attendus` : les tickets ouverts qu'il attend, quand c'est ce qui le retient (#3647).
  sauter(ticket: number, ligne: string, attendus?: readonly number[]): void;
  // Ce que le déclencheur lit, à l'instant.
  faits(): FaitsDuProjet;
  // Ce que la porte de prise a dit, à son dernier tour, des cuisinables qu'elle a sautés.
  sauts(): string[];
  // Les checks de la base au dernier tour (nom et issue), nuls avant le premier.
  checks(): CheckVu[] | null;
  // Un ticket de réparation de la base (`prio:0`) est mis de côté au dernier
  // tour — ses cooks ont échoué, la cuisine ne rendra plus la base verte seule
  // (statuts-ci/regles.ts, #3953). Faux avant le premier tour.
  reparationMiseDeCote(): boolean;
};

export function suivreLeTour(maintenant: () => Date = () => new Date()): SuiviDuTour {
  let dernierMerge: string | null = null;
  let mainRougeDepuis: string | null = null;
  let checks: CheckVu[] | null = null;
  let reparationMiseDeCote = false;
  // Les cuisinables, et le tour qui a vu chacun commencer d'attendre.
  let cuisinables = new Map<number, string>();
  let enPass = new Set<number>();
  let enCuisson = new Set<number>();
  // Les tickets que la porte de prise a vus attendre un ticket ouvert, au tour en cours.
  let attentes = new Map<number, number[]>();
  let sauts = new Map<number, string>();
  // Les tickets que la porte de prise a sautés depuis la dernière lecture des tickets (#3761) : à la lecture suivante, leurs
  // sauts et leurs attentes restent dits jusqu'à ce que la porte repasse — entre les deux, ce que le superviseur lit dit
  // encore leur cause, jamais rien ; ceux qu'elle n'a pas sautés tombent.
  let sautesDuTour = new Set<number>();
  const prises = new Map<number, number>();

  const nAttendQueLaCuisson = (ticket: number): boolean => {
    const attendus = attentes.get(ticket) ?? [];
    return attendus.length > 0 && attendus.every((attendu) => enCuisson.has(attendu));
  };

  const noterTickets = (tickets: TicketLu[]) => {
    const instant = maintenant().toISOString();
    const ouverts = new Set(tickets.map(({ number }) => number));
    if ([...enPass].some((ticket) => !ouverts.has(ticket))) dernierMerge = instant;
    enPass = new Set(tickets.filter(({ labels }) => labels.includes(LABEL_IN_PASS)).map(({ number }) => number));
    enCuisson = new Set(tickets.filter(({ labels }) => labels.includes(LABEL_TAKEN) || labels.includes(LABEL_IN_PASS)).map(({ number }) => number));
    attentes = new Map([...attentes].filter(([ticket]) => sautesDuTour.has(ticket)));
    sauts = new Map([...sauts].filter(([ticket]) => sautesDuTour.has(ticket)));
    sautesDuTour = new Set();
    for (const ticket of prises.keys()) if (!ouverts.has(ticket)) prises.delete(ticket);
    const suivants = new Map<number, string>();
    for (const { number, labels } of horsDesBesoins(tickets)) {
      if (!labels.some((label) => AILLEURS.includes(label)) && complet(calibrage(labels))) suivants.set(number, cuisinables.get(number) ?? instant);
    }
    cuisinables = suivants;
  };

  return {
    sauter: (ticket, ligne, attendus) => {
      sauts.set(ticket, ligne);
      sautesDuTour.add(ticket);
      // Repassée, la porte remplace aussi l'attente du tour d'avant.
      attentes.delete(ticket);
      if (attendus !== undefined) attentes.set(ticket, [...attendus]);
    },
    envelopper: (github) => ({
      ...github,
      fires: async () => {
        const tickets = await github.fires();
        noterTickets(tickets);
        reparationMiseDeCote = tickets.some(({ labels }) => labels.includes(PRIO_REPARATION) && estMisDeCote(labels));
        return tickets;
      },
      commenter: async (numero, corps) => {
        await github.commenter(numero, corps);
        const n = PRISES.exec(corps)?.[1];
        if (n !== undefined) prises.set(numero, Number(n));
        else if (A_VIDE.test(corps)) prises.set(numero, (prises.get(numero) ?? 0) + 1);
      },
      checksDeLaBase: async () => {
        const lus = await github.checksDeLaBase();
        checks = lus.map(({ name, outcome }) => ({ name, outcome }));
        mainRougeDepuis = lus.some(({ outcome }) => outcome === "red") ? (mainRougeDepuis ?? maintenant().toISOString()) : null;
        return lus;
      },
      merger: async (numero, sha) => {
        const merge = await github.merger(numero, sha);
        if (merge.fait) dernierMerge = maintenant().toISOString();
        return merge;
      },
    }),
    faits: () => ({
      dernierMerge,
      cuisinables: [...cuisinables]
        .filter(([ticket]) => !nAttendQueLaCuisson(ticket))
        .sort(([a], [b]) => a - b)
        .map(([ticket, depuis]) => ({ ticket, depuis })),
      prises: [...prises].map(([ticket, n]) => ({ ticket, prises: n })),
      mainRougeDepuis,
    }),
    sauts: () => [...sauts].filter(([ticket]) => cuisinables.has(ticket) && !nAttendQueLaCuisson(ticket)).sort(([a], [b]) => a - b).map(([, ligne]) => ligne),
    checks: () => checks,
    reparationMiseDeCote: () => reparationMiseDeCote,
  };
}
