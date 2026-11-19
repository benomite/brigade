// Les alertes du haut du rail (#3823, épique #3820) : une alerte n'est montrée que vraie et actionnable. Le 2026-11-17 et
// 18, le rail disait FAULT « No station serves this project » sur chaque projet que parade-box servait, pendant que
// l'en-tête montrait parade-box en train de cuire (#3797, #3818) ; dans le même temps, une base rouge qui tenait toute la
// cuisine (#3812) et un ticket relancé 1 198 fois (#3813) n'ont rien montré pendant 26 h.
//
// Ce module ne lit rien : il juge ce qu'on lui donne, comme `raison.ts`, sur lequel il se pose. Chaque alerte porte :
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
//   tout-mis-de-cote   les seuls tickets `fire` sont mis de côté par leurs échecs (`set-aside:failures`, #3875) : aucun ne part ;
//   cuisine-muette     rien servi depuis `MUETTE_MS` alors qu'un ticket est prêt : une ligne, qui nomme la cause connue
//                      — une des quatre ci-dessus, ou la raison de l'attente de la file (`expliquerLAttente`) —, jamais
//                      « cause inconnue » seule.
import { disponible } from "../enregistrement-station/contrat.ts";
import { stationDe } from "../stations-github/stations.ts";
import { dureeCourte, heureUtc, MOTS_DU_GESTE, type Geste, type StationDuCompte, type StationsLues } from "../rail-bloque/rail-bloque.ts";
import { expliquerLAttente, type TicketDuRail } from "./raison.ts";

// Un cook qui a tourné il y a moins de cinq minutes : aucune alerte ne dit qu'aucun cook ne peut partir.
const COOK_RECENT_MS = 5 * 60_000;
// Rien servi depuis une demi-heure, un ticket prêt : la cuisine muette se dit.
const MUETTE_MS = 30 * 60_000;
// Un ticket pris dix fois tourne en boucle : un ticket ordinaire est pris une fois, et renvoyé deux fois au plus.
const SEUIL_DE_BOUCLE = 10;

export type SorteDAlerte = "aucune-station" | "aucun-cook" | "base-rouge" | "relance-en-boucle" | "tout-mis-de-cote" | "cuisine-muette";
export type CauseConnue = Exclude<SorteDAlerte, "cuisine-muette" | "tout-mis-de-cote">;

// Le fait que le chef vérifie : depuis quand, et quel ticket ou quel check.
type FaitVerifiable = { depuis: string; ticket?: number; check?: string };
export type AlerteDuRail = { sorte: SorteDAlerte; phrase: string; fait: FaitVerifiable; geste: string | null; geree: string | null; bouton?: Geste; cause?: CauseConnue };

// La base rouge, telle que le rail la lit : depuis quand, le check en échec, le ticket qui la porte sur le rail (sa
// réparation `repair-main`, que la cuisine cuit avant tout autre), la réparation qu'un cook tient, et le geste qui la
// lève quand on le connaît.
export type BaseRougeLue = { depuis: string; check: string; ticket: number | null; reparation?: number | null; geste?: string | null };
// Un ticket et ses prises : combien de fois, depuis la première. `auMoins` : la lecture s'est arrêtée avant la dernière.
// Un ticket mis de côté par ses échecs : depuis quand, et la raison que la station a écrite (nulle sans commentaire).
type MisDeCoteLu = { ticket: number; depuis: string; raison: string | null };
type RelanceLue = { ticket: number; fois: number; depuis: string; auMoins?: boolean };

export type EntreeDesAlertes = {
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
  baseRouge: BaseRougeLue | null;
  relances: readonly RelanceLue[];
  // Le dernier ticket servi, ou null quand aucun ne l'a été dans la fenêtre lue.
  dernierServiLe: string | null;
  misDeCoteParEchecs?: readonly MisDeCoteLu[];
};

const date = (iso: string | null | undefined): number => (typeof iso === "string" ? Date.parse(iso) : Number.NaN);
const memeDepot = (a: string, b: string) => a.toLowerCase() === b.toLowerCase();
const nombre = (n: number) => n.toLocaleString("en-US");
const liste = (noms: readonly string[]) => (noms.length <= 1 ? (noms[0] ?? "") : `${noms.slice(0, -1).join(", ")} and ${noms.at(-1)}`);
const depuisQuand = (iso: string, maintenant: number) => `since ${heureUtc(iso)} (${dureeCourte(maintenant - Date.parse(iso))})`;

// Le plus ancien ticket prêt — en file, à la date d'entrée connue —, ou null.
function plusAncienPret(tickets: readonly TicketDuRail[]): { ticket: number; entreLe: string } | null {
  const prets = tickets.flatMap(({ ticket, etat, entreLe }) => (etat === "queued" && entreLe !== null && !Number.isNaN(date(entreLe)) ? [{ ticket, entreLe }] : []));
  return prets.sort((a, b) => date(a.entreLe) - date(b.entreLe) || a.ticket - b.ticket)[0] ?? null;
}

// Une cuisine qui cuit ce projet, ou vient de le faire : rien ne dit qu'aucun cook ne peut partir.
const cuisine = (e: EntreeDesAlertes) => e.entete.cuisinent.length > 0 || e.cookEnCours || e.plafondAtteint || e.maintenant - date(e.dernierCook) < COOK_RECENT_MS;

// Aucune station, ou aucune qui tourne : le geste est celui de l'onglet Stations (`MOTS_DU_GESTE`).
function alerteDesStations(e: EntreeDesAlertes): AlerteDuRail | null {
  if ("illisibles" in e.stations || cuisine(e)) return null;
  const pret = plusAncienPret(e.tickets);
  if (pret === null) return null;
  // Celles qui peuvent le servir : sa sélection le nomme, ou elle n'en publie aucune (#3818) — on ne sait pas ce qu'elle sert.
  const candidates = e.stations.lues.filter(({ selection }) => selection === null || selection.some((choisi) => memeDepot(choisi, e.depot)));
  if (candidates.length === 0) {
    return {
      sorte: "aucune-station",
      phrase: `No station serves this project, so no cook can start: #${pret.ticket} has waited ${depuisQuand(pret.entreLe, e.maintenant)}. ${MOTS_DU_GESTE["ajouter-a-une-station"]}.`,
      fait: { depuis: pret.entreLe, ticket: pret.ticket, check: "the stations' selection" },
      geste: MOTS_DU_GESTE["ajouter-a-une-station"],
      geree: null,
      bouton: "ajouter-a-une-station",
    };
  }
  if (candidates.some((station) => disponible(station, e.maintenant))) return null;
  const noms = [...new Set(candidates.map(({ name }) => stationDe(name)))].sort();
  const arretees = candidates.every(({ stoppedAt, lastSeen }: StationDuCompte) => stoppedAt !== null && date(stoppedAt) >= date(lastSeen));
  // Depuis quand plus aucune ne tourne : le dernier signe de vie de la dernière vue.
  const vueLe = candidates.map(({ lastSeen }) => lastSeen).filter((le) => !Number.isNaN(date(le))).sort((a, b) => date(b) - date(a))[0];
  if (vueLe === undefined) return null;
  const sujet = `${noms.length > 1 ? "Stations" : "Station"} ${liste(noms)} ${noms.length > 1 ? "have" : "has"} been ${arretees ? "stopped" : "offline"}`;
  return {
    sorte: "aucun-cook",
    phrase: `${sujet} ${depuisQuand(vueLe, e.maintenant)}, so no cook can start: #${pret.ticket} waits. ${MOTS_DU_GESTE["demarrer-la-station"]}.`,
    fait: { depuis: vueLe, ticket: pret.ticket, check: `the signs of life of ${liste(noms)}` },
    geste: MOTS_DU_GESTE["demarrer-la-station"],
    geree: null,
    bouton: "demarrer-la-station",
  };
}

function alerteDeLaBase(e: EntreeDesAlertes): AlerteDuRail | null {
  const base = e.baseRouge;
  if (base === null || Number.isNaN(date(base.depuis))) return null;
  const tenue = base.reparation ?? base.ticket ?? null;
  const check = base.check.trim();
  const geste = base.geste ?? null;
  const geree = base.reparation != null ? `The kitchen is repairing it on #${base.reparation}.` : base.ticket !== null ? `The kitchen repairs it on #${base.ticket}.` : null;
  if (tenue === null && check === "") return null;
  const quoi = [check === "" ? null : `check ${check} fails`, base.ticket === null ? null : `#${base.ticket}`].filter((un) => un !== null).join(", ");
  return {
    sorte: "base-rouge",
    phrase: `The main branch has been red ${depuisQuand(base.depuis, e.maintenant)} (${quoi}): no delivery merges.${geste === null ? "" : ` ${geste}`}`,
    fait: { depuis: base.depuis, ...(tenue === null ? {} : { ticket: tenue }), ...(check === "" ? {} : { check }) },
    geste,
    geree,
  };
}

// Le ticket le plus relancé au-delà du seuil. Le geste est celui que le second a fait pour #3813 : le mettre en WAITING
// (`waiting set`), qui le sort du rail.
function alerteDesRelances(e: EntreeDesAlertes): AlerteDuRail | null {
  const relance = e.relances.filter(({ fois, depuis }) => fois >= SEUIL_DE_BOUCLE && !Number.isNaN(date(depuis))).sort((a, b) => b.fois - a.fois || a.ticket - b.ticket)[0];
  if (relance === undefined) return null;
  const geste = `Put #${relance.ticket} in WAITING to stop the loop.`;
  return {
    sorte: "relance-en-boucle",
    phrase: `#${relance.ticket} has been relaunched ${relance.auMoins === true ? "at least " : ""}${nombre(relance.fois)} times ${depuisQuand(relance.depuis, e.maintenant)}: the kitchen loops on it. ${geste}`,
    fait: { depuis: relance.depuis, ticket: relance.ticket },
    geste,
    geree: null,
  };
}

// Les seuls tickets du rail sont mis de côté par leurs échecs : aucune station ne les prend, et la file n'attend pas un tour.
// Le geste est celui qui les remet sur le rail : retirer le label. Le ticket le plus ancien mis de côté est nommé.
function alerteDuTicketMisDeCote(e: EntreeDesAlertes): AlerteDuRail | null {
  if (e.tickets.length > 0) return null;
  const mis = (e.misDeCoteParEchecs ?? []).filter(({ depuis }) => !Number.isNaN(date(depuis))).sort((a, b) => date(a.depuis) - date(b.depuis) || a.ticket - b.ticket)[0];
  if (mis === undefined) return null;
  const geste = `Remove \`set-aside:failures\` from #${mis.ticket} to put it back on the rail.`;
  const raison = mis.raison === null ? "" : `: ${mis.raison.replace(/[.\s]+$/, "")}`;
  return {
    sorte: "tout-mis-de-cote",
    phrase: `Nothing is served: #${mis.ticket} is set aside by its failures ${depuisQuand(mis.depuis, e.maintenant)}${raison}. ${geste}`,
    fait: { depuis: mis.depuis, ticket: mis.ticket },
    geste,
    geree: null,
  };
}

// Ce qu'une cause dit dans la ligne de la cuisine muette, en peu de mots : sa phrase entière est celle de son alerte.
const MOTIFS: Record<CauseConnue, (alerte: AlerteDuRail) => string> = {
  "aucune-station": () => "No station serves this project.",
  "aucun-cook": (alerte) => `${alerte.fait.check === undefined ? "Its stations" : `Its stations (${alerte.fait.check.replace(/^the signs of life of /, "")})`} do not run.`,
  "base-rouge": (alerte) => `The main branch is red${alerte.fait.check === undefined ? "" : ` (${alerte.fait.check})`}, so nothing merges.`,
  "relance-en-boucle": (alerte) => `#${alerte.fait.ticket} is relaunched in a loop.`,
};

function alerteDeLaCuisineMuette(e: EntreeDesAlertes, causes: readonly AlerteDuRail[]): AlerteDuRail | null {
  const pret = plusAncienPret(e.tickets);
  if (pret === null) return null;
  // Muette depuis le dernier service, ou depuis que le ticket est prêt s'il l'est devenu après.
  const servi = date(e.dernierServiLe);
  const depuis = Number.isNaN(servi) || servi < date(pret.entreLe) ? pret.entreLe : (e.dernierServiLe as string);
  if (e.maintenant - date(depuis) < MUETTE_MS) return null;
  const tete = `Nothing served for ${dureeCourte(e.maintenant - date(depuis))} while #${pret.ticket} is ready.`;
  const fait = { depuis, ticket: pret.ticket };
  const [cause] = causes;
  if (cause !== undefined) {
    const sorte = cause.sorte as CauseConnue;
    // Le geste de la cause, en toutes lettres à la fin : la ligne est seule en tête du rail, sa cause ne s'y voit pas.
    const geste = cause.geste === null ? "" : ` ${cause.geste}${cause.geste.endsWith(".") ? "" : "."}`;
    return { sorte: "cuisine-muette", cause: sorte, phrase: `${tete} ${MOTIFS[sorte](cause)}${geste}`, fait, geste: cause.geste, geree: cause.geree, ...(cause.bouton === undefined ? {} : { bouton: cause.bouton }) };
  }
  // Aucune des causes connues : la raison de l'attente de la file la nomme. Un cook qui tourne cuit : rien n'est muet.
  if (cuisine(e)) return null;
  const attente = expliquerLAttente({ depot: e.depot, tickets: e.tickets, stations: e.stations, plafondAtteint: e.plafondAtteint, maintenant: e.maintenant });
  if (attente === null || attente.geste !== null) return null;
  const enLigne = "lues" in e.stations ? [...new Set(e.stations.lues.filter((station) => disponible(station, e.maintenant)).map(({ name }) => stationDe(name)))].sort() : [];
  // L'attente ordinaire n'a pas de raison : la station en ligne qui la prendra la tient ; sans elle, rien ne la tient.
  const geree = attente.raison !== "normale" ? "It resolves by itself." : enLigne.length > 0 ? `${enLigne.length > 1 ? "Stations" : "Station"} ${liste(enLigne)} ${enLigne.length > 1 ? "are" : "is"} online and take${enLigne.length > 1 ? "" : "s"} it at the next turn.` : null;
  if (geree === null) return null;
  const raison = attente.raison === "normale" ? "No station fault, red main branch or relaunch loop is found: the queue waits for a free turn." : attente.phrase.replace(/ It resolves by itself\.$/, "");
  return { sorte: "cuisine-muette", phrase: `${tete} ${raison}`, fait, geste: null, geree };
}

// Les alertes du haut du rail, la plus forte d'abord : la cuisine muette — qui nomme sa cause — puis chaque cause.
// Une alerte sans fait vérifiable, ou sans geste ni prise en charge, n'en fait pas partie.
export function alertesDuRail(entree: EntreeDesAlertes): AlerteDuRail[] {
  const montrable = (alerte: AlerteDuRail | null): alerte is AlerteDuRail =>
    alerte !== null && !Number.isNaN(date(alerte.fait.depuis)) && (alerte.fait.ticket !== undefined || (alerte.fait.check ?? "") !== "") && Boolean(alerte.geste || alerte.geree);
  const causes = [alerteDesStations(entree), alerteDeLaBase(entree), alerteDesRelances(entree)].filter((alerte): alerte is AlerteDuRail => alerte !== null);
  const muette = alerteDeLaCuisineMuette(entree, causes);
  return [muette, ...causes, alerteDuTicketMisDeCote(entree)].filter(montrable);
}
