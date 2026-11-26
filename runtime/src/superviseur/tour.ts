// Ce que le superviseur observe du tour GitHub seul (brigade-github.ts) : son
// client est enveloppé, et chaque lecture des tickets, des checks de la base,
// chaque commentaire d'échec et chaque merge y laisse ce que le déclencheur
// demande (`declencheur.ts`), sans un appel de plus à GitHub.
//
// - Le dernier merge : un merge que ce tour a fait, ou un ticket en pass qui
//   n'est plus parmi les tickets ouverts — une autre station l'a mergé.
// - Les cuisinables : les tickets `fire` qu'une station prendrait — ni pris, ni
//   en pass, au calibrage complet, ni mis de côté, ni parqué — pour le chef
//   (`chef-todo`) ou pour un autre (`parked`) —, ni une épique
//   ni un besoin dont un ticket lancé est né (#2618, #3479) —, et depuis quand :
//   le premier tour qui a vu chacun attendre. Un ticket que la porte de prise
//   a sauté parce qu'il n'attend que des tickets en cuisson n'en est pas un :
//   le cook en cours le lèvera (#3647). Ce que la porte de prise a dit des
//   cuisinables qu'elle a sautés va au dossier du manager (`brancher.ts`).
// - Les prises sans livrer : le compte `n=` que la station écrit dans le
//   commentaire de chaque cook arrêté sans livraison (`MARQUE_D_ECHEC`), plus un par
//   relance à vide sur une CI rouge, sans `n=` (`A_VIDE`, #4008) ; un `n=` fait foi.
// - `main` rouge : depuis le premier tour qui a lu un check rouge sur sa tête,
//   nul dès qu'aucun ne l'est ; et le début que ses checks rouges portent (#4382).
// - Le dernier correctif de la base (#4382) : la PR que ce tour a mergée, la
//   livraison qu'une autre station a mergée, ou la relance des jobs rouges de
//   `main` par le superviseur — le post-mortem d'une panne y lit ce qui l'a corrigée.
//
// Rien n'est tenu d'un process à l'autre : à l'ouverture, les comptes repartent.
//
// Le même client porte ce que lit le réveil sans progrès (`inactivite/observer.ts`, #4027).
import type { GitHubDuTour, TicketLu } from "../brigade-github.ts";
import type { PRDeLaPorte, RaisonDuSaut } from "../claim-gate.ts";
import { horsDesBesoins } from "../besoin/besoin.ts";
import { calibrage, complet } from "../calibrage.ts";
import type { CheckVu } from "../carte-ci-windows.ts";
import { estParque, LABEL_IN_PASS, LABEL_TAKEN, LABEL_PARKED, LABELS_D_AVANT_PARKED } from "../github-etat/etats.ts";
import { estMisDeCote, MIS_DE_COTE } from "../github.ts";
import { CHEF_TODO } from "../github-seul/carte-todo/carte-todo.ts";
import { jobDuCheck } from "../github.ts";
import { MARQUE_D_ECHEC } from "../qualite-github.ts";
import { PRIO_REPARATION } from "../reparation.ts";
import { suivreLesProgres, type SuiviDesProgres } from "../inactivite/observer.ts";
import { reveil, type FaitsDuProjet } from "./declencheur.ts";
import { bloqueDe, type Bloque } from "./zone-liberee.ts";

// Les labels d'un ticket qui n'attend pas la cuisine.
const AILLEURS: readonly string[] = [...MIS_DE_COTE, CHEF_TODO, LABEL_PARKED, ...LABELS_D_AVANT_PARKED, LABEL_TAKEN, LABEL_IN_PASS];

const PRISES = new RegExp(`^${MARQUE_D_ECHEC} n=(\\d+)`);
const A_VIDE = /the cook added nothing, and the delivery still has work left — /; // `brigade-github.ts`

export type SuiviDuTour = {
  // Le client du tour, enveloppé.
  envelopper(github: GitHubDuTour): GitHubDuTour;
  // La porte de prise n'a pas pris ce ticket prenable, et `ligne` dit pourquoi ;
  // `attendus` : les tickets ouverts qu'il attend, quand c'est ce qui le retient (#3647).
  // `raison` : le code du saut, quand la porte en donne un — `zone-held` et la PR qui tient la zone (#4242).
  sauter(ticket: number, ligne: string, attendus?: readonly number[], raison?: RaisonDuSaut): void;
  // Ce que le déclencheur lit, à l'instant.
  faits(): FaitsDuProjet;
  // Ce que la porte de prise a dit, à son dernier tour, des cuisinables qu'elle a sautés.
  sauts(): string[];
  // Les mêmes sauts, ceux qui portent un code : le ticket, le code et la PR qui tient sa zone (#4242).
  raisonsDesSauts(): Array<{ ticket: number } & RaisonDuSaut>;
  // La porte de prise ne compte plus cette PR ouverte, périmée, sur la zone de ce ticket (#4243).
  perimee(ticket: number, pr: PRDeLaPorte & { number: number }): void;
  // Les PR périmées que la porte a dites depuis l'avant-dernière lecture des tickets, une fois chacune : le superviseur
  // les marque `zone-released` (#4243).
  zonesPerimees(): Bloque[];
  // Le ticket que le réveil sans merge nomme, à l'instant : la porte de prise le prend avant les autres (#4102).
  enPremier(): number[];
  // Les checks de la base au dernier tour (nom et issue), nuls avant le premier.
  checks(): CheckVu[] | null;
  // Un ticket de réparation de la base (`prio:0`) est mis de côté au dernier
  // tour — ses cooks ont échoué, la cuisine ne rendra plus la base verte seule
  // (statuts-ci/regles.ts, #3953). Faux avant le premier tour.
  reparationMiseDeCote(): boolean;
  // Les progrès des tickets et leurs états, que lit le réveil sans progrès (#4027) ; sans eux, ce réveil ne part pas.
  progres?: SuiviDesProgres;
  // Le plus tôt des débuts que portent les checks rouges de la base au dernier tour, nul sans rouge ou sans début (#4382).
  debutDuRouge?(): string | null;
  // Le dernier correctif de la base, et quand ; nul avant le premier (#4382).
  correctif?(): Correctif | null;
  // Un run relancé : un run rouge de la base au dernier tour est une réparation du superviseur (#4382).
  relance?(run: number): void;
  // Le titre d'un ticket ouvert au dernier tour (#4382).
  titre?(ticket: number): string | undefined;
};

export type Correctif = { quoi: string; a: string };
export const REPARE_SEUL = "fixed by itself";

export function suivreLeTour(maintenant: () => Date = () => new Date()): SuiviDuTour {
  let dernierMerge: string | null = null;
  let mainRougeDepuis: string | null = null;
  let checks: CheckVu[] | null = null;
  let reparationMiseDeCote = false;
  let debutDuRouge: string | null = null;
  let runsRouges = new Set<number>();
  let correctif: Correctif | null = null;
  // Un merge de ce tour depuis la dernière lecture des tickets : le ticket qui quitte la pass est le sien, déjà nommé.
  let mergeDuTour = false;
  let titres = new Map<number, string>();
  // Les cuisinables, et le tour qui a vu chacun commencer d'attendre.
  let cuisinables = new Map<number, string>();
  let enPass = new Set<number>();
  let enCuisson = new Set<number>();
  // Les tickets que la porte de prise a vus attendre un ticket ouvert, au tour en cours.
  let attentes = new Map<number, number[]>();
  let sauts = new Map<number, string>();
  let raisons = new Map<number, RaisonDuSaut>();
  // Les PR périmées dites par la porte, par numéro : avant la dernière lecture des tickets, et depuis.
  let perimees = new Map<number, Bloque>();
  let perimeesDuTour = new Map<number, Bloque>();
  // Les tickets que la porte de prise a sautés depuis la dernière lecture des tickets (#3761) : à la lecture suivante, leurs
  // sauts et leurs attentes restent dits jusqu'à ce que la porte repasse — entre les deux, ce que le superviseur lit dit
  // encore leur cause, jamais rien ; ceux qu'elle n'a pas sautés tombent.
  let sautesDuTour = new Set<number>();
  const prises = new Map<number, number>();
  const progres = suivreLesProgres(maintenant);

  const nAttendQueLaCuisson = (ticket: number): boolean => {
    const attendus = attentes.get(ticket) ?? [];
    return attendus.length > 0 && attendus.every((attendu) => enCuisson.has(attendu));
  };

  const noterTickets = (tickets: TicketLu[]) => {
    const instant = maintenant().toISOString();
    const ouverts = new Set(tickets.map(({ number }) => number));
    const servi = [...enPass].find((ticket) => !ouverts.has(ticket));
    if (servi !== undefined) {
      dernierMerge = instant;
      if (!mergeDuTour) correctif = { quoi: `the delivery of #${servi}, merged by another station`, a: instant };
    }
    mergeDuTour = false;
    titres = new Map(tickets.map(({ number, title }) => [number, title]));
    enPass = new Set(tickets.filter(({ labels }) => labels.includes(LABEL_IN_PASS)).map(({ number }) => number));
    enCuisson = new Set(tickets.filter(({ labels }) => labels.includes(LABEL_TAKEN) || labels.includes(LABEL_IN_PASS)).map(({ number }) => number));
    attentes = new Map([...attentes].filter(([ticket]) => sautesDuTour.has(ticket)));
    sauts = new Map([...sauts].filter(([ticket]) => sautesDuTour.has(ticket)));
    raisons = new Map([...raisons].filter(([ticket]) => sautesDuTour.has(ticket)));
    sautesDuTour = new Set();
    perimees = perimeesDuTour;
    perimeesDuTour = new Map();
    for (const ticket of prises.keys()) if (!ouverts.has(ticket)) prises.delete(ticket);
    const suivants = new Map<number, string>();
    for (const { number, labels } of horsDesBesoins(tickets)) {
      if (!labels.some((label) => AILLEURS.includes(label)) && complet(calibrage(labels))) suivants.set(number, cuisinables.get(number) ?? instant);
    }
    cuisinables = suivants;
  };

  const suivi: SuiviDuTour = {
    sauter: (ticket, ligne, attendus, raison) => {
      sauts.set(ticket, ligne);
      // Repassée sans code, la porte efface celui du tour d'avant.
      raisons.delete(ticket);
      if (raison) raisons.set(ticket, raison);
      sautesDuTour.add(ticket);
      // Repassée, la porte remplace aussi l'attente du tour d'avant.
      attentes.delete(ticket);
      if (attendus !== undefined) attentes.set(ticket, [...attendus]);
    },
    envelopper: (github) => progres.envelopper({
      ...github,
      fires: async () => {
        const tickets = await github.fires();
        noterTickets(tickets);
        reparationMiseDeCote = tickets.some(({ labels }) => labels.includes(PRIO_REPARATION) && (estMisDeCote(labels) || estParque(labels)));
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
        const rouges = lus.filter(({ outcome }) => outcome === "red");
        debutDuRouge = rouges.flatMap(({ startedAt }) => (startedAt !== undefined && !Number.isNaN(Date.parse(startedAt)) ? [startedAt] : [])).sort((a, b) => Date.parse(a) - Date.parse(b))[0] ?? null;
        runsRouges = new Set(rouges.flatMap(({ url }) => jobDuCheck({ url: url ?? null } as Parameters<typeof jobDuCheck>[0])?.run ?? []));
        mainRougeDepuis = lus.some(({ outcome }) => outcome === "red") ? (mainRougeDepuis ?? maintenant().toISOString()) : null;
        return lus;
      },
      merger: async (numero, sha) => {
        const merge = await github.merger(numero, sha);
        if (merge.fait) {
          dernierMerge = maintenant().toISOString();
          correctif = { quoi: `PR #${numero} merged (commit ${sha.slice(0, 7)})`, a: dernierMerge };
          mergeDuTour = true;
        }
        return merge;
      },
      relancerLesEchecs: async (run) => {
        await github.relancerLesEchecs(run);
        suivi.relance?.(run);
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
    raisonsDesSauts: () => [...raisons].filter(([ticket]) => cuisinables.has(ticket) && !nAttendQueLaCuisson(ticket)).sort(([a], [b]) => a - b).map(([ticket, raison]) => ({ ticket, ...raison })),
    perimee: (ticket, pr) => void perimeesDuTour.set(pr.number, bloqueDe(ticket, pr)),
    zonesPerimees: () => [...new Map([...perimees, ...perimeesDuTour]).values()],
    checks: () => checks,
    debutDuRouge: () => debutDuRouge,
    correctif: () => correctif,
    relance: (run) => {
      if (runsRouges.has(run)) correctif = { quoi: `the supervisor reran the failed jobs of main (run ${run}) — ${REPARE_SEUL}`, a: maintenant().toISOString() };
    },
    titre: (ticket) => titres.get(ticket),
    reparationMiseDeCote: () => reparationMiseDeCote,
    progres,
    enPremier: () => {
      const cause = reveil(suivi.faits(), maintenant());
      return cause?.cause === "no-merge" ? [cause.ticket] : [];
    },
  };
  return suivi;
}
