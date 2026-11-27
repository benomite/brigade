// Les alertes du haut du rail (#3823, épique #3820) : une alerte n'est montrée que vraie et actionnable. Le 2026-11-17 et
// 18, le rail disait FAULT « No station serves this project » sur chaque projet que parade-box servait, pendant que
// l'en-tête montrait parade-box en train de cuire (#3797, #3818) ; dans le même temps, une base rouge qui tenait toute la
// cuisine (#3812) et un ticket relancé 1 198 fois (#3813) n'ont rien montré pendant 26 h.
//
// Ce module ne lit rien : il juge ce qu'on lui donne, comme `reason.ts`, sur lequel il se pose. Chaque alerte porte :
//   - un fait que le chef peut vérifier (`fait`) : depuis quand, et quel ticket ou quel check — sans lui, rien n'est dit ;
//   - un geste qui la lève (`geste`, ses mots ; `bouton`, celui de l'app quand elle en a un), ou ce que la cuisine fait
//     déjà pour la lever (`geree`) — sans l'un ni l'autre, elle n'est pas montrée ;
// et ne contredit jamais l'en-tête du même écran : une station qui cuit ce projet (`entete.cuisinent`), un cook qui tourne
// ou qui a tourné il y a moins de `COOK_RECENT_MS`, et aucune alerte ne dit qu'aucun cook ne peut partir.
//
// Les sortes :
//   aucune-station     aucune station ne sert le projet (sélection) ;
//   aucun-cook         celles qui peuvent le servir sont arrêtées ou hors ligne ;
//   base-rouge         la branche d'intégration est rouge, et une réparation la tient ou un geste la lève ;
//   relance-en-boucle  un ticket a été pris `SEUIL_DE_BOUCLE` fois ou plus ;
//   tout-mis-de-cote   les seuls tickets `fire` sont parqués par leurs échecs (#3875 ; `parked`, son commentaire le dit, #4129) :
//                      aucun ne part ;
//   cuisine-muette     rien servi depuis `MUETTE_MS` alors qu'un ticket est prêt : une ligne, qui nomme la cause connue
//                      — une des quatre ci-dessus, ou la raison de l'attente de la file (`expliquerLAttente`) —, jamais
//                      « cause inconnue » seule.
import { disponible } from "../../../runtime/src/enregistrement-station/contrat.ts";
import { stationDe } from "../../../runtime/src/stations-github/stations.ts";
import { dureeCourte, MOTS_DU_GESTE, type Geste, type StationDuCompte, type StationsLues } from "../../../runtime/src/attente-du-rail/stations.ts";
import { expliquerLAttente, type TicketDuRail } from "../../../runtime/src/attente-du-rail/raison.ts";

// Un cook qui a tourné il y a moins de cinq minutes : aucune alerte ne dit qu'aucun cook ne peut partir.
const COOK_RECENT_MS = 5 * 60_000;
// Rien servi depuis une demi-heure, un ticket prêt : la cuisine muette se dit.
const SILENT_MS = 30 * 60_000;
// Un ticket pris dix fois tourne en boucle : un ticket ordinaire est pris une fois, et renvoyé deux fois au plus.
const THRESHOLD_OF_LOOP = 10;

export type KindOfAlert = "aucune-station" | "aucun-cook" | "base-rouge" | "relance-en-boucle" | "tout-mis-de-cote" | "cuisine-muette";
export type CauseKnown = Exclude<KindOfAlert, "cuisine-muette" | "tout-mis-de-cote">;

// Le fait que le chef vérifie : depuis quand, et quel ticket ou quel check.
type DoneVerifiable = { depuis: string; ticket?: number; check?: string };
export type AlertOfRail = { sorte: KindOfAlert; phrase: string; fait: DoneVerifiable; geste: string | null; geree: string | null; bouton?: Geste; cause?: CauseKnown };

// La base rouge, telle que le rail la lit : depuis quand, le check en échec, le ticket qui la porte sur le rail (sa
// réparation `repair-main`, que la cuisine cuit avant tout autre), la réparation qu'un cook tient, et le geste qui la
// lève quand on le connaît.
export type BaseRedRead = { depuis: string; check: string; ticket: number | null; reparation?: number | null; geste?: string | null };
// Un ticket et ses prises : combien de fois, depuis la première. `auMoins` : la lecture s'est arrêtée avant la dernière.
// Un ticket mis de côté par ses échecs : depuis quand, et la raison que la station a écrite (nulle sans commentaire).
type SetAsideRead = { ticket: number; depuis: string; raison: string | null };
// `arret` : ce que le ticket dit déjà de sa boucle — en WAITING (la station l'y a mis ; `qui` : ce qu'il attend, nul s'il ne se lit
// pas) ou avec une carte qui attend le chef (`besoin` : la question de la carte, nulle sans raison écrite).
type StopOfTheLoop = { sorte: "waiting"; qui: string | null } | { sorte: "carte"; besoin: string | null };
export type RelaunchRead = { ticket: number; fois: number; depuis: string; auMoins?: boolean; arret?: StopOfTheLoop };

export type EntryOfAlerts = {
  depot: string;
  maintenant: number;
  tickets: readonly TicketDuRail[];
  stations: StationsLues;
  plafondAtteint: boolean;
  // Ce que l'en-tête du même écran dit : les stations qui cuisent ce projet.
  entete: { cuisinent: readonly string[] };
  cookEnCours: boolean;
  // La fin du dernier cook connu, ou null.
  dernierCook: string | null;
  baseRouge: BaseRedRead | null;
  relances: readonly RelaunchRead[];
  // Le dernier ticket servi, ou null quand aucun ne l'a été dans la fenêtre lue.
  dernierServiLe: string | null;
  misDeCoteParEchecs?: readonly SetAsideRead[];
};

const date = (iso: string | null | undefined): number => (typeof iso === "string" ? Date.parse(iso) : Number.NaN);
const sameRepository = (a: string, b: string) => a.toLowerCase() === b.toLowerCase();
const count = (n: number) => n.toLocaleString("en-US");
const list = (names: readonly string[]) => (names.length <= 1 ? (names[0] ?? "") : `${names.slice(0, -1).join(", ")} and ${names.at(-1)}`);
// Une heure, comme `status` les écrit : `14:05 UTC`.
const hourUtc = (iso: string) => `${new Date(iso).toISOString().slice(11, 16)} UTC`;
const sinceWhen = (iso: string, now: number) => `since ${hourUtc(iso)} (${dureeCourte(now - Date.parse(iso))})`;

// Le plus ancien ticket prêt — en file, à la date d'entrée connue —, ou null.
function moreOldReady(tickets: readonly TicketDuRail[]): { ticket: number; entreLe: string } | null {
  const ready = tickets.flatMap(({ ticket, etat: state, entreLe: betweenThe }) => (state === "queued" && betweenThe !== null && !Number.isNaN(date(betweenThe)) ? [{ ticket, entreLe: betweenThe }] : []));
  return ready.sort((a, b) => date(a.entreLe) - date(b.entreLe) || a.ticket - b.ticket)[0] ?? null;
}

// Une cuisine qui cuit ce projet, ou vient de le faire : rien ne dit qu'aucun cook ne peut partir.
const kitchen = (e: EntryOfAlerts) => e.entete.cuisinent.length > 0 || e.cookEnCours || e.plafondAtteint || e.maintenant - date(e.dernierCook) < COOK_RECENT_MS;

// Aucune station, ou aucune qui tourne : le geste est celui de l'onglet Stations (`MOTS_DU_GESTE`).
function alertOfStations(e: EntryOfAlerts): AlertOfRail | null {
  if ("illisibles" in e.stations || kitchen(e)) return null;
  const ready = moreOldReady(e.tickets);
  if (ready === null) return null;
  // Celles qui peuvent le servir : sa sélection le nomme, ou elle n'en publie aucune (#3818) — on ne sait pas ce qu'elle sert.
  const candidates = e.stations.lues.filter(({ selection }) => selection === null || selection.some((chosen) => sameRepository(chosen, e.depot)));
  if (candidates.length === 0) {
    return {
      sorte: "aucune-station",
      phrase: `No station serves this project, so no cook can start: #${ready.ticket} has waited ${sinceWhen(ready.entreLe, e.maintenant)}. ${MOTS_DU_GESTE["ajouter-a-une-station"]}.`,
      fait: { depuis: ready.entreLe, ticket: ready.ticket, check: "the stations' selection" },
      geste: MOTS_DU_GESTE["ajouter-a-une-station"],
      geree: null,
      bouton: "ajouter-a-une-station",
    };
  }
  if (candidates.some((station) => disponible(station, e.maintenant))) return null;
  const names = [...new Set(candidates.map(({ name }) => stationDe(name)))].sort();
  const stoppedEntries = candidates.every(({ stoppedAt, lastSeen }: StationDuCompte) => stoppedAt !== null && date(stoppedAt) >= date(lastSeen));
  // Depuis quand plus aucune ne tourne : le dernier signe de vie de la dernière vue.
  const vueThe = candidates.map(({ lastSeen }) => lastSeen).filter((the) => !Number.isNaN(date(the))).sort((a, b) => date(b) - date(a))[0];
  if (vueThe === undefined) return null;
  const subject = `${names.length > 1 ? "Stations" : "Station"} ${list(names)} ${names.length > 1 ? "have" : "has"} been ${stoppedEntries ? "stopped" : "offline"}`;
  return {
    sorte: "aucun-cook",
    phrase: `${subject} ${sinceWhen(vueThe, e.maintenant)}, so no cook can start: #${ready.ticket} waits. ${MOTS_DU_GESTE["demarrer-la-station"]}.`,
    fait: { depuis: vueThe, ticket: ready.ticket, check: `the signs of life of ${list(names)}` },
    geste: MOTS_DU_GESTE["demarrer-la-station"],
    geree: null,
    bouton: "demarrer-la-station",
  };
}

function alertOfTheBase(e: EntryOfAlerts): AlertOfRail | null {
  const base = e.baseRouge;
  if (base === null || Number.isNaN(date(base.depuis))) return null;
  const heldOne = base.reparation ?? base.ticket ?? null;
  const check = base.check.trim();
  const action = base.geste ?? null;
  const handled = base.reparation != null ? `The kitchen is repairing it on #${base.reparation}.` : base.ticket !== null ? `The kitchen repairs it on #${base.ticket}.` : null;
  if (heldOne === null && check === "") return null;
  const what = [check === "" ? null : `check ${check} fails`, base.ticket === null ? null : `#${base.ticket}`].filter((oneOf) => oneOf !== null).join(", ");
  return {
    sorte: "base-rouge",
    phrase: `The main branch has been red ${sinceWhen(base.depuis, e.maintenant)} (${what}): no delivery merges.${action === null ? "" : ` ${action}`}`,
    fait: { depuis: base.depuis, ...(heldOne === null ? {} : { ticket: heldOne }), ...(check === "" ? {} : { check }) },
    geste: action,
    geree: handled,
  };
}

// Le ticket le plus relancé au-delà du seuil. Une station met elle-même en WAITING un ticket qui boucle : le chef n'a aucun
// geste à faire (#4042). Quand la boucle est déjà arrêtée — le ticket est en WAITING, ou une carte attend le chef —, la phrase
// le dit, avec la raison, et ne dit jamais comment l'arrêter.
function alertOfRelaunches(e: EntryOfAlerts): AlertOfRail | null {
  const relaunch = e.relances.filter(({ fois: times, depuis: since }) => times >= THRESHOLD_OF_LOOP && !Number.isNaN(date(since))).sort((a, b) => b.fois - a.fois || a.ticket - b.ticket)[0];
  if (relaunch === undefined) return null;
  const done = { depuis: relaunch.depuis, ticket: relaunch.ticket };
  const times = `${relaunch.auMoins === true ? "at least " : ""}${count(relaunch.fois)} times`;
  const { arret: stop } = relaunch;
  if (stop?.sorte === "carte") {
    const need = stop.besoin === null ? "" : `: ${stop.besoin.replace(/[.\s]+$/, "")}`;
    return { sorte: "relance-en-boucle", phrase: `A card waits for the chef on #${relaunch.ticket}${need}. It was relaunched ${times} ${sinceWhen(relaunch.depuis, e.maintenant)}.`, fait: done, geste: null, geree: "The kitchen does not take it while the card waits." };
  }
  if (stop?.sorte === "waiting") {
    const who = stop.qui === null ? "" : `, awaiting ${stop.qui}`;
    return { sorte: "relance-en-boucle", phrase: `The system put #${relaunch.ticket} in WAITING${who}: it was relaunched ${times} ${sinceWhen(relaunch.depuis, e.maintenant)}.`, fait: done, geste: null, geree: "The kitchen does not take it while it is in WAITING." };
  }
  return { sorte: "relance-en-boucle", phrase: `#${relaunch.ticket} has been relaunched ${times} ${sinceWhen(relaunch.depuis, e.maintenant)}: the kitchen loops on it.`, fait: done, geste: null, geree: `The kitchen puts #${relaunch.ticket} in WAITING by itself.` };
}

// Les seuls tickets du rail sont parqués par leurs échecs : aucune station ne les prend, et la file n'attend pas un tour.
// Le geste est celui du superviseur, qui a le ticket : aucune minuterie ne le remet sur le rail. Le ticket le plus ancien parqué est nommé.
function alertOfTicketSetAside(e: EntryOfAlerts): AlertOfRail | null {
  if (e.tickets.length > 0) return null;
  const put = (e.misDeCoteParEchecs ?? []).filter(({ depuis: since }) => !Number.isNaN(date(since))).sort((a, b) => date(a.depuis) - date(b.depuis) || a.ticket - b.ticket)[0];
  if (put === undefined) return null;
  const action = `The supervisor has #${put.ticket} and acts on it with its own gestures; nothing puts it back on the rail by a timer.`;
  const reason = put.raison === null ? "" : `: ${put.raison.replace(/[.\s]+$/, "")}`;
  return {
    sorte: "tout-mis-de-cote",
    phrase: `Nothing is served: #${put.ticket} is parked by its failures ${sinceWhen(put.depuis, e.maintenant)}${reason}. ${action}`,
    fait: { depuis: put.depuis, ticket: put.ticket },
    geste: action,
    geree: null,
  };
}

// Ce qu'une cause dit dans la ligne de la cuisine muette, en peu de mots : sa phrase entière est celle de son alerte.
const REASONS: Record<CauseKnown, (alert: AlertOfRail) => string> = {
  "aucune-station": () => "No station serves this project.",
  "aucun-cook": (alert) => `${alert.fait.check === undefined ? "Its stations" : `Its stations (${alert.fait.check.replace(/^the signs of life of /, "")})`} do not run.`,
  "base-rouge": (alert) => `The main branch is red${alert.fait.check === undefined ? "" : ` (${alert.fait.check})`}, so nothing merges.`,
  "relance-en-boucle": (alert) => alert.phrase,
};

function alertOfTheKitchenSilent(e: EntryOfAlerts, causes: readonly AlertOfRail[]): AlertOfRail | null {
  const ready = moreOldReady(e.tickets);
  if (ready === null) return null;
  // Muette depuis le dernier service, ou depuis que le ticket est prêt s'il l'est devenu après.
  const served = date(e.dernierServiLe);
  const since = Number.isNaN(served) || served < date(ready.entreLe) ? ready.entreLe : (e.dernierServiLe as string);
  if (e.maintenant - date(since) < SILENT_MS) return null;
  const head = `Nothing served for ${dureeCourte(e.maintenant - date(since))} while #${ready.ticket} is ready.`;
  const done = { depuis: since, ticket: ready.ticket };
  const [cause] = causes;
  if (cause !== undefined) {
    const kind = cause.sorte as CauseKnown;
    // Le geste de la cause, en toutes lettres à la fin : la ligne est seule en tête du rail, sa cause ne s'y voit pas.
    const action = cause.geste === null ? "" : ` ${cause.geste}${cause.geste.endsWith(".") ? "" : "."}`;
    return { sorte: "cuisine-muette", cause: kind, phrase: `${head} ${REASONS[kind](cause)}${action}`, fait: done, geste: cause.geste, geree: cause.geree, ...(cause.bouton === undefined ? {} : { bouton: cause.bouton }) };
  }
  // Aucune des causes connues : la raison de l'attente de la file la nomme. Un cook qui tourne cuit : rien n'est muet.
  if (kitchen(e)) return null;
  const wait = expliquerLAttente({ depot: e.depot, tickets: e.tickets, stations: e.stations, plafondAtteint: e.plafondAtteint, maintenant: e.maintenant });
  if (wait === null || wait.geste !== null) return null;
  const enLine = "lues" in e.stations ? [...new Set(e.stations.lues.filter((station) => disponible(station, e.maintenant)).map(({ name }) => stationDe(name)))].sort() : [];
  // L'attente ordinaire n'a pas de raison : la station en ligne qui la prendra la tient ; sans elle, rien ne la tient.
  const handled = wait.raison !== "normale" ? "It resolves by itself." : enLine.length > 0 ? `${enLine.length > 1 ? "Stations" : "Station"} ${list(enLine)} ${enLine.length > 1 ? "are" : "is"} online and take${enLine.length > 1 ? "" : "s"} it at the next turn.` : null;
  if (handled === null) return null;
  const reason = wait.raison === "normale" ? "No station fault, red main branch or relaunch loop is found: the queue waits for a free turn." : wait.phrase.replace(/ It resolves by itself\.$/, "");
  return { sorte: "cuisine-muette", phrase: `${head} ${reason}`, fait: done, geste: null, geree: handled };
}

// Les alertes du haut du rail, la plus forte d'abord : la cuisine muette — qui nomme sa cause — puis chaque cause.
// Une alerte sans fait vérifiable, ou sans geste ni prise en charge, n'en fait pas partie.
export function alertsOfRail(entry: EntryOfAlerts): AlertOfRail[] {
  const showable = (alert: AlertOfRail | null): alert is AlertOfRail =>
    alert !== null && !Number.isNaN(date(alert.fait.depuis)) && (alert.fait.ticket !== undefined || (alert.fait.check ?? "") !== "") && Boolean(alert.geste || alert.geree);
  const causes = [alertOfStations(entry), alertOfTheBase(entry), alertOfRelaunches(entry)].filter((alert): alert is AlertOfRail => alert !== null);
  const silentOne = alertOfTheKitchenSilent(entry, causes);
  return [silentOne, ...causes, alertOfTicketSetAside(entry)].filter(showable);
}
