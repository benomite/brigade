// Pourquoi la file du rail ne part pas, dans l'app (ticket 3433) : la phrase est celle du runtime
// (runtime/src/attente-du-rail/raison.ts) — l'app n'en écrit aucune. La lecture du rail sur GitHub
// (vue/rail/github.ts, `avecLeRail`) la pose dans `facts` sous `attenteDuRail` ; trois endroits la disent :
//   - le rail du projet, en tête (line-of-the-wait.js) ;
//   - chaque carte en file qui ne part pas la prochaine, sa ligne (facts.ts, `ligneEnAttente`) ;
//   - la file du second (board/rail.ts), au-dessus de la ligne `rail` de `status` — les lignes mêmes que
//     `brigade <project> status` écrit.
import { attendusDesCartes, expliquerLAttente, lignesDesCartes, type AttenteDuRail, type Raison, type TicketDuRail, type TicketEnWaiting } from "../../../../runtime/src/attente-du-rail/raison.ts";
import type { Geste, StationsLues } from "../../../../runtime/src/attente-du-rail/stations.ts";
import type { AlertOfRail, CauseKnown, KindOfAlert } from "../../wait-of-rail/alerts.ts";

// Ce que `facts` porte : `attenteDuRail`, la raison, sa phrase et son geste, absente quand rien n'attend ou qu'un cook tourne ;
// `lignesDesCartes`, la ligne de chaque carte en file qui ne part pas la prochaine, absente sans aucune ; `attendusDesCartes`,
// les tickets qu'attend chacune, ceux que sa carte ouvre (ticket 3763), absents sans aucun.
export type LinesOfCards = Record<number, string>;
export type ExpectedOfCards = Record<number, number[]>;

const REASONS: readonly Raison[] = ["aucune-station", "arretee", "hors-ligne", "quota-github", "plafond", "pass", "autre-ticket", "waiting", "normale"];
const ACTIONS: readonly Geste[] = ["demarrer-la-station", "ajouter-a-une-station"];

// GitHub ne publie pas le plafond de cooks de la station : le rail de l'app ne peut pas dire la raison 5 (la file se lit sur GitHub),
// seul `brigade <project> status`, qui tourne sur la station, la dit. L'app ne la devine jamais.
// `waiting` : les tickets en WAITING, qu'une carte en file peut attendre (ticket 3761).
export function waitOfRailOf(repository: string, tickets: readonly TicketDuRail[], stations: StationsLues, now: number, waiting: readonly TicketEnWaiting[] = []): { attenteDuRail?: AttenteDuRail; lignesDesCartes?: LinesOfCards; attendusDesCartes?: ExpectedOfCards } {
  const wait = expliquerLAttente({ depot: repository, tickets, stations, plafondAtteint: false, maintenant: now, waiting });
  const cards = lignesDesCartes(tickets, waiting);
  const expected = attendusDesCartes(tickets, waiting);
  return { ...(wait === null ? {} : { attenteDuRail: wait }), ...(Object.keys(cards).length === 0 ? {} : { lignesDesCartes: cards }), ...(Object.keys(expected).length === 0 ? {} : { attendusDesCartes: expected }) };
}

// `attenteDuRail`, de la racine de `facts` (facts.ts, `comprendre`) : rien de mal formé ne le pose.
export function waitOfRailRead(value: unknown): { attenteDuRail?: AttenteDuRail } {
  if (typeof value !== "object" || value === null || Array.isArray(value)) return {};
  const { raison: reason, phrase: sentence, geste: action, stations } = value as Record<string, unknown>;
  if (!REASONS.includes(reason as Raison) || typeof sentence !== "string" || sentence === "") return {};
  if (action !== null && !ACTIONS.includes(action as Geste)) return {};
  const names = Array.isArray(stations) && stations.every((name) => typeof name === "string") ? (stations as string[]) : [];
  return { attenteDuRail: { raison: reason as Raison, phrase: sentence, geste: action as Geste | null, stations: names } };
}

// `lignesDesCartes`, de la racine de `facts` : un ticket, sa ligne ; rien de mal formé ne le pose.
export function linesOfCardsRead(value: unknown): { lignesDesCartes?: LinesOfCards } {
  if (typeof value !== "object" || value === null || Array.isArray(value)) return {};
  const lines: LinesOfCards = {};
  for (const [ticket, line] of Object.entries(value)) {
    if (!/^[1-9]\d*$/.test(ticket) || typeof line !== "string" || line === "") return {};
    lines[Number(ticket)] = line;
  }
  return Object.keys(lines).length === 0 ? {} : { lignesDesCartes: lines };
}

// `attendusDesCartes`, de la racine de `facts` : un ticket, les tickets qu'il attend ; rien de mal formé ne le pose.
export function expectedOfCardsRead(value: unknown): { attendusDesCartes?: ExpectedOfCards } {
  if (typeof value !== "object" || value === null || Array.isArray(value)) return {};
  const expected: ExpectedOfCards = {};
  for (const [ticket, itsOwn] of Object.entries(value)) {
    if (!/^[1-9]\d*$/.test(ticket) || !Array.isArray(itsOwn) || itsOwn.length === 0 || !itsOwn.every((n) => Number.isInteger(n) && n > 0)) return {};
    expected[Number(ticket)] = itsOwn as number[];
  }
  return Object.keys(expected).length === 0 ? {} : { attendusDesCartes: expected };
}

const KINDS: readonly KindOfAlert[] = ["aucune-station", "aucun-cook", "base-rouge", "relance-en-boucle", "tout-mis-de-cote", "cuisine-muette"];
const textOrNone = (value: unknown): string | null | undefined => (value === null ? null : typeof value === "string" && value !== "" ? value : undefined);

// `alertesDuRail`, de la racine de `facts` (ticket 3823, wait-of-rail/alerts.ts) : les alertes du haut du rail.
// Une alerte mal formée — sans fait daté, sans ticket ni check, ou sans geste ni prise en charge — n'est pas lue : la vue ne
// montre que ce que le runtime a jugé montrable.
export function alertsOfRailRead(value: unknown): { alertesDuRail?: AlertOfRail[] } {
  if (!Array.isArray(value)) return {};
  const readEntries = value.flatMap((raw: unknown): AlertOfRail[] => {
    if (typeof raw !== "object" || raw === null || Array.isArray(raw)) return [];
    const { sorte: kind, phrase: sentence, fait: done, geste: action, geree: handled, bouton: button, cause } = raw as Record<string, unknown>;
    if (!KINDS.includes(kind as KindOfAlert) || typeof sentence !== "string" || sentence === "" || typeof done !== "object" || done === null) return [];
    const { depuis: since, ticket, check } = done as Record<string, unknown>;
    if (typeof since !== "string" || Number.isNaN(Date.parse(since))) return [];
    const number = typeof ticket === "number" && Number.isInteger(ticket) && ticket > 0 ? ticket : undefined;
    const which = typeof check === "string" && check !== "" ? check : undefined;
    const theActions = { geste: textOrNone(action), geree: textOrNone(handled) };
    if ((number === undefined && which === undefined) || theActions.geste === undefined || theActions.geree === undefined || (theActions.geste === null && theActions.geree === null)) return [];
    return [{
      sorte: kind as KindOfAlert,
      phrase: sentence,
      fait: { depuis: since, ...(number === undefined ? {} : { ticket: number }), ...(which === undefined ? {} : { check: which }) },
      geste: theActions.geste,
      geree: theActions.geree,
      ...(ACTIONS.includes(button as Geste) ? { bouton: button as Geste } : {}),
      ...(KINDS.includes(cause as KindOfAlert) && cause !== "cuisine-muette" && cause !== "tout-mis-de-cote" ? { cause: cause as CauseKnown } : {}),
    }];
  });
  return readEntries.length === 0 ? {} : { alertesDuRail: readEntries };
}
