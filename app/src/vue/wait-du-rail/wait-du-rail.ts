// Pourquoi la file du rail ne part pas, dans l'app (ticket 3433) : la phrase est celle du runtime
// (runtime/src/attente-du-rail/raison.ts) — l'app n'en écrit aucune. La lecture du rail sur GitHub
// (vue/rail/github.ts, `avecLeRail`) la pose dans `facts` sous `attenteDuRail` ; trois endroits la disent :
//   - le rail du projet, en tête (line-de-l-wait.js) ;
//   - chaque carte en file qui ne part pas la prochaine, sa ligne (facts.ts, `ligneEnAttente`) ;
//   - la file du second (tableau/rail.ts), au-dessus de la ligne `rail` de `status` — les lignes mêmes que
//     `brigade <project> status` écrit.
import { attendusDesCartes, expliquerLAttente, lignesDesCartes, type AttenteDuRail, type Raison, type TicketDuRail, type TicketEnWaiting } from "../../../../runtime/src/attente-du-rail/raison.ts";
import type { Geste, StationsLues } from "../../../../runtime/src/attente-du-rail/stations.ts";
import type { AlertDuRail, CauseConnue, SorteDAlert } from "../../wait-du-rail/alerts.ts";

// Ce que `facts` porte : `attenteDuRail`, la raison, sa phrase et son geste, absente quand rien n'attend ou qu'un cook tourne ;
// `lignesDesCartes`, la ligne de chaque carte en file qui ne part pas la prochaine, absente sans aucune ; `attendusDesCartes`,
// les tickets qu'attend chacune, ceux que sa carte ouvre (ticket 3763), absents sans aucun.
export type LinesDesCards = Record<number, string>;
export type AttendusDesCards = Record<number, number[]>;

const RAISONS: readonly Raison[] = ["aucune-station", "arretee", "hors-ligne", "quota-github", "plafond", "pass", "autre-ticket", "waiting", "normale"];
const ACTIONS: readonly Geste[] = ["demarrer-la-station", "ajouter-a-une-station"];

// GitHub ne publie pas le plafond de cooks de la station : le rail de l'app ne peut pas dire la raison 5 (la file se lit sur GitHub),
// seul `brigade <project> status`, qui tourne sur la station, la dit. L'app ne la devine jamais.
// `waiting` : les tickets en WAITING, qu'une carte en file peut attendre (ticket 3761).
export function waitDuRailDe(repository: string, tickets: readonly TicketDuRail[], stations: StationsLues, maintenant: number, waiting: readonly TicketEnWaiting[] = []): { attenteDuRail?: AttenteDuRail; lignesDesCartes?: LinesDesCards; attendusDesCartes?: AttendusDesCards } {
  const wait = expliquerLAttente({ depot: repository, tickets, stations, plafondAtteint: false, maintenant, waiting });
  const cards = lignesDesCartes(tickets, waiting);
  const attendus = attendusDesCartes(tickets, waiting);
  return { ...(wait === null ? {} : { attenteDuRail: wait }), ...(Object.keys(cards).length === 0 ? {} : { lignesDesCartes: cards }), ...(Object.keys(attendus).length === 0 ? {} : { attendusDesCartes: attendus }) };
}

// `attenteDuRail`, de la racine de `facts` (facts.ts, `comprendre`) : rien de mal formé ne le pose.
export function waitDuRailLue(valeur: unknown): { attenteDuRail?: AttenteDuRail } {
  if (typeof valeur !== "object" || valeur === null || Array.isArray(valeur)) return {};
  const { raison, phrase, geste: action, stations } = valeur as Record<string, unknown>;
  if (!RAISONS.includes(raison as Raison) || typeof phrase !== "string" || phrase === "") return {};
  if (action !== null && !ACTIONS.includes(action as Geste)) return {};
  const noms = Array.isArray(stations) && stations.every((name) => typeof name === "string") ? (stations as string[]) : [];
  return { attenteDuRail: { raison: raison as Raison, phrase, geste: action as Geste | null, stations: noms } };
}

// `lignesDesCartes`, de la racine de `facts` : un ticket, sa ligne ; rien de mal formé ne le pose.
export function linesDesCardsLues(valeur: unknown): { lignesDesCartes?: LinesDesCards } {
  if (typeof valeur !== "object" || valeur === null || Array.isArray(valeur)) return {};
  const lines: LinesDesCards = {};
  for (const [ticket, line] of Object.entries(valeur)) {
    if (!/^[1-9]\d*$/.test(ticket) || typeof line !== "string" || line === "") return {};
    lines[Number(ticket)] = line;
  }
  return Object.keys(lines).length === 0 ? {} : { lignesDesCartes: lines };
}

// `attendusDesCartes`, de la racine de `facts` : un ticket, les tickets qu'il attend ; rien de mal formé ne le pose.
export function attendusDesCardsLus(valeur: unknown): { attendusDesCartes?: AttendusDesCards } {
  if (typeof valeur !== "object" || valeur === null || Array.isArray(valeur)) return {};
  const attendus: AttendusDesCards = {};
  for (const [ticket, siens] of Object.entries(valeur)) {
    if (!/^[1-9]\d*$/.test(ticket) || !Array.isArray(siens) || siens.length === 0 || !siens.every((n) => Number.isInteger(n) && n > 0)) return {};
    attendus[Number(ticket)] = siens as number[];
  }
  return Object.keys(attendus).length === 0 ? {} : { attendusDesCartes: attendus };
}

const SORTES: readonly SorteDAlert[] = ["aucune-station", "aucun-cook", "base-rouge", "relance-en-boucle", "tout-mis-de-cote", "cuisine-muette"];
const texteOuNul = (valeur: unknown): string | null | undefined => (valeur === null ? null : typeof valeur === "string" && valeur !== "" ? valeur : undefined);

// `alertesDuRail`, de la racine de `facts` (ticket 3823, wait-du-rail/alerts.ts) : les alertes du haut du rail.
// Une alerte mal formée — sans fait daté, sans ticket ni check, ou sans geste ni prise en charge — n'est pas lue : la vue ne
// montre que ce que le runtime a jugé montrable.
export function alertsDuRailLues(valeur: unknown): { alertesDuRail?: AlertDuRail[] } {
  if (!Array.isArray(valeur)) return {};
  const lues = valeur.flatMap((brute: unknown): AlertDuRail[] => {
    if (typeof brute !== "object" || brute === null || Array.isArray(brute)) return [];
    const { sorte, phrase, fait, geste: action, geree, bouton: button, cause } = brute as Record<string, unknown>;
    if (!SORTES.includes(sorte as SorteDAlert) || typeof phrase !== "string" || phrase === "" || typeof fait !== "object" || fait === null) return [];
    const { depuis, ticket, check } = fait as Record<string, unknown>;
    if (typeof depuis !== "string" || Number.isNaN(Date.parse(depuis))) return [];
    const numero = typeof ticket === "number" && Number.isInteger(ticket) && ticket > 0 ? ticket : undefined;
    const quel = typeof check === "string" && check !== "" ? check : undefined;
    const lesActions = { geste: texteOuNul(action), geree: texteOuNul(geree) };
    if ((numero === undefined && quel === undefined) || lesActions.geste === undefined || lesActions.geree === undefined || (lesActions.geste === null && lesActions.geree === null)) return [];
    return [{
      sorte: sorte as SorteDAlert,
      phrase,
      fait: { depuis, ...(numero === undefined ? {} : { ticket: numero }), ...(quel === undefined ? {} : { check: quel }) },
      geste: lesActions.geste,
      geree: lesActions.geree,
      ...(ACTIONS.includes(button as Geste) ? { bouton: button as Geste } : {}),
      ...(SORTES.includes(cause as SorteDAlert) && cause !== "cuisine-muette" && cause !== "tout-mis-de-cote" ? { cause: cause as CauseConnue } : {}),
    }];
  });
  return lues.length === 0 ? {} : { alertesDuRail: lues };
}
