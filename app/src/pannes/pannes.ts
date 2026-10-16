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
//   reconnecté. Le bouton lance le login (gestes.ts) — c'est le seul geste qu'elle demande.
//
// Ce module ne dit que ses propres mots : des noms et des versions, jamais le motif d'un échec ni
// la raison d'une perte, qui peuvent porter une commande. Une station hors ligne ne dit pas sa
// connexion : ce qu'elle en a publié avant de se taire n'est plus vrai à coup sûr.
import { duree, ligneDe } from "../stations/stations.ts";
import type { DocumentStation } from "../stations/document.ts";

export type SujetDePanne = "injoignable" | "mise-a-jour" | "connexion-max";
// Ce que le bouton d'une panne fait : relire GitHub, écarter la ligne, lancer le login.
export type GesteDePanne = "relire" | "ecarter" | "login";
// `cle` : ce qui la distingue parmi les pannes de sa station — une mise à jour écartée ne
// revient pas, la suivante qui rate si.
// `survol` : l'explication, qui ne se lit qu'au survol de la ligne — jamais dans la page.
export type Panne = { cle: string; sujet: SujetDePanne; ligne: string; survol: string; bouton: { libelle: string; geste: GesteDePanne } };

// Le silence au-delà duquel une station est en panne.
export const INJOIGNABLE_APRES_MS = 10 * 60_000;

// Depuis quand la station se tait : l'heure de son arrêt, ou son dernier signe de vie.
function silence(document: DocumentStation, maintenant: number): number {
  const signe = Date.parse(document.signeDeVie);
  const arretee = document.arreteeLe === null ? null : Date.parse(document.arreteeLe);
  return maintenant - (arretee !== null && arretee >= signe ? arretee : signe);
}

// Les pannes d'une station, à cet instant, dans l'ordre où elles se lisent.
export function pannesDe(document: DocumentStation, maintenant: number): Panne[] {
  const pannes: Panne[] = [];
  const horsLigne = ligneDe(document, maintenant).etat === "hors-ligne";
  const tue = silence(document, maintenant);
  if (horsLigne && tue >= INJOIGNABLE_APRES_MS)
    pannes.push({ cle: "injoignable", sujet: "injoignable", ligne: `offline for ${duree(tue)}`, survol: `${document.nom} has given no sign of life for ${duree(tue)}: the app can only look on GitHub whether it has spoken again`, bouton: { libelle: "check again", geste: "relire" } });
  const mise = document.miseAJour;
  if (mise !== null)
    pannes.push({
      cle: `mise-a-jour:${mise.le}`,
      sujet: "mise-a-jour",
      ligne: `update to version ${mise.visee} failed`,
      survol: mise.retourRate ? `the station is on neither version: check ${document.nom}` : `${document.nom} stayed on version ${mise.restauree}; the next version will be tried on its own`,
      bouton: { libelle: "dismiss", geste: "ecarter" },
    });
  const connexion = document.connexionMax;
  if (!horsLigne && connexion?.etat === "perdue") {
    const depuis = connexion.depuis === null ? "" : ` ${duree(maintenant - Date.parse(connexion.depuis))} ago`;
    pannes.push({ cle: `connexion-max:${connexion.depuis ?? ""}`, sujet: "connexion-max", ligne: `Max connection lost${depuis}`, survol: `nothing cooks on ${document.nom} until you log in`, bouton: { libelle: "log in", geste: "login" } });
  }
  return pannes;
}
