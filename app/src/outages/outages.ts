// Les pannes d'une station, dites sur sa ligne de la home : chacune en une ligne, avec un
// bouton — jamais une suite de commandes (docs/superpowers/specs/2026-10-15-station-refonte-design.md,
// « Quand ça casse »). Trois pannes, lues dans ce que la station publie sur GitHub, son seul canal
// avec l'app (runtime/src/appairage/etats.ts) :
//
// - **injoignable** : plus aucun signe de vie depuis dix minutes — « box has given no sign of life
//   for 10 min ». Le bouton relit GitHub tout de suite : l'app ne joint pas la station, elle ne
//   peut que regarder si elle a reparlé. Un redémarrage — une mise à jour — tient sous les dix
//   minutes, et n'est pas une panne ;
// - **mise à jour revenue en arrière** : la version visée n'a pas démarré, la station est restée
//   sur la sienne — « update to version 1.5.0 failed — stayed on version 1.4.0 ». Rien n'est à
//   faire : la suivante sera essayée seule. Le bouton l'écarte de la home ;
// - **connexion Max perdue** : plus rien ne cuit sur la station tant que le chef ne s'est pas
//   reconnecté. Le bouton lance le login (actions.ts) — c'est le seul geste qu'elle demande.
//
// Ce module ne dit que ses propres mots : des noms et des versions, jamais le motif d'un échec ni
// la raison d'une perte, qui peuvent porter une commande. Une station hors ligne ne dit pas sa
// connexion : ce qu'elle en a publié avant de se taire n'est plus vrai à coup sûr.
import { duration, lineOf } from "../stations/stations.ts";
import type { DocumentStation } from "../stations/document.ts";

export type SubjectOfOutage = "injoignable" | "mise-a-jour" | "connexion-max";
// Ce que le bouton d'une panne fait : relire GitHub, écarter la ligne, lancer le login.
export type ActionOfOutage = "relire" | "ecarter" | "login";
// `cle` : ce qui la distingue parmi les pannes de sa station — une mise à jour écartée ne
// revient pas, la suivante qui rate si.
// `survol` : l'explication, qui ne se lit qu'au survol de la ligne — jamais dans la page.
export type Outage = { cle: string; sujet: SubjectOfOutage; ligne: string; survol: string; bouton: { libelle: string; geste: ActionOfOutage } };

// Le silence au-delà duquel une station est en panne.
export const UNREACHABLE_AFTER_MS = 10 * 60_000;

// Depuis quand la station se tait : l'heure de son arrêt, ou son dernier signe de vie.
function silence(document: DocumentStation, now: number): number {
  const sign = Date.parse(document.signeDeVie);
  const stopped = document.arreteeLe === null ? null : Date.parse(document.arreteeLe);
  return now - (stopped !== null && stopped >= sign ? stopped : sign);
}

// Les pannes d'une station, à cet instant, dans l'ordre où elles se lisent.
export function outagesOf(document: DocumentStation, now: number): Outage[] {
  const outages: Outage[] = [];
  const outsideLine = lineOf(document, now).etat === "hors-ligne";
  const kills = silence(document, now);
  if (outsideLine && kills >= UNREACHABLE_AFTER_MS)
    outages.push({ cle: "injoignable", sujet: "injoignable", ligne: `offline for ${duration(kills)}`, survol: `${document.nom} has given no sign of life for ${duration(kills)}: the app can only look on GitHub whether it has spoken again`, bouton: { libelle: "check again", geste: "relire" } });
  const putting = document.miseAJour;
  if (putting !== null)
    outages.push({
      cle: `mise-a-jour:${putting.le}`,
      sujet: "mise-a-jour",
      ligne: `update to version ${putting.visee} failed`,
      survol: putting.retourRate ? `the station is on neither version: check ${document.nom}` : `${document.nom} stayed on version ${putting.restauree}; the next version will be tried on its own`,
      bouton: { libelle: "dismiss", geste: "ecarter" },
    });
  const connection = document.connexionMax;
  if (!outsideLine && connection?.etat === "perdue") {
    const since = connection.depuis === null ? "" : ` ${duration(now - Date.parse(connection.depuis))} ago`;
    outages.push({ cle: `connexion-max:${connection.depuis ?? ""}`, sujet: "connexion-max", ligne: `Max connection lost${since}`, survol: `nothing cooks on ${document.nom} until you log in`, bouton: { libelle: "log in", geste: "login" } });
  }
  return outages;
}
