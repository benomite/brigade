// @ts-check
// Le choix d'une station (ticket 3195) : la seule pièce qui demande au chef qui cuit un projet — sur l'onglet Stations,
// quand personne ne le cuit (« Choose who cooks it ») ou que sa cuisine déménage (« Move to another station »), et sur la
// page d'un projet pas encore prêt (« 1 of 2: who cooks it », ticket 3166, parcours-premier-projet/). Ce que le choix dit
// des machines vient de choix-station/ (ticket 3187) : cet ordinateur d'abord, son nom d'hôte après lui ; une station hors
// ligne n'est jamais recommandée, et dit sur sa ligne depuis quand, et comment la ramener.
// Un bouton par machine : un clic la choisit. Un choix qui s'écrit grise les boutons et le dit sur sa ligne ; un refus se
// dit en une ligne, son détail au survol.
// Ce module ne touche pas `document` : il reçoit de quoi créer un élément (briques.js), et rend des éléments.

import { boutonAction } from "../briques.js";
import { ligneErreur } from "../composants/ligne-erreur/ligne-erreur.js";
import { CET_ORDINATEUR, ENREGISTREMENT } from "../lexique.js";
import { HORS_LIGNE_DEPUIS, horsLigneDuCompte } from "../choix-station/choix-station.js";

/** @typedef {import("../briques.js").Fabrique} Fabrique */
/** Une station appairée du compte, telle que sa lecture la rend. @typedef {import("../../stations-du-compte.ts").StationEnregistree} StationDuCompte */
/** @typedef {import("../../stations/stations.ts").StationVue} StationVue */
// Un choix de station : `cle` — `ICI`, ou l'id de la station appairée —, son nom, si elle est hors ligne, et si c'est le
// choix recommandé. `hote` : le nom d'hôte de cet ordinateur, dit après « this computer ». `absente` : hors ligne, depuis
// quand et le geste qui la ramène (choix-station/).
/** @typedef {{ cle: string, nom: string, horsLigne: boolean, recommande: boolean, hote?: string, absente?: string }} Choix */

export const ICI = "ici";

// Les choix de « qui le cuit » : cet ordinateur d'abord — s'il a une station (`ici`), son nom d'hôte (`hote`) après
// lui —, puis les stations du compte, en ligne d'abord. Le recommandé peut cuire maintenant : la première station du compte en ligne,
// sinon cet ordinateur ; une station hors ligne ne l'est jamais, et sans aucune, rien ne l'est. `stations` : celles du
// compte à qui le dépôt n'est pas encore choisi, hors celle de cet ordinateur (`stationsAProposer`,
// projet/stations/AjoutStation.js). `maintenant` : l'instant d'où se compte le temps hors ligne.
/** @param {{ ici: boolean, hote?: string, stations: readonly StationDuCompte[], maintenant?: number }} offerts @returns {Choix[]} */
export function choixDeStation({ ici, hote = "", stations, maintenant = Date.now() }) {
  const enLigne = stations.find(({ available }) => available)?.id;
  /** @type {Choix[]} */
  const appairees = [...stations.filter(({ available }) => available), ...stations.filter(({ available }) => !available)].map((station) => ({
    cle: station.id,
    nom: station.name,
    horsLigne: !station.available,
    recommande: station.id === enLigne,
    ...(station.available ? {} : { absente: horsLigneDuCompte(station, maintenant) }),
  }));
  /** @type {Choix[]} */
  const cetOrdinateur = ici ? [{ cle: ICI, nom: CET_ORDINATEUR, horsLigne: false, recommande: enLigne === undefined, ...(hote === "" ? {} : { hote }) }] : [];
  return [...cetOrdinateur, ...appairees];
}

// Les choix d'un déménagement : les stations où la cuisine peut aller, cet ordinateur d'abord — « this computer », son nom
// d'hôte après lui —, puis les autres, en ligne d'abord. Le recommandé est cet ordinateur s'il est en ligne, sinon la
// première en ligne ; une station hors ligne dit depuis quand, et le geste qui la ramène sur sa machine (`ordinateur` : elle
// tourne sur un ordinateur, pas sur une box).
/** @param {readonly StationVue[]} destinations @param {{ locale?: string | null, ordinateur: (station: StationVue) => boolean }} lu @returns {Choix[]} */
export function choixDuDeplacement(destinations, { locale, ordinateur }) {
  const ici = destinations.filter(({ id }) => id === locale);
  const autres = destinations.filter(({ id }) => id !== locale);
  const ordre = [...ici, ...autres.filter(({ etat }) => etat === "en-ligne"), ...autres.filter(({ etat }) => etat !== "en-ligne")];
  const recommandee = ordre.find(({ etat }) => etat === "en-ligne")?.id;
  return ordre.map((station) => {
    const horsLigne = station.etat !== "en-ligne";
    return {
      cle: station.id,
      nom: station.id === locale ? CET_ORDINATEUR : station.nom,
      horsLigne,
      recommande: station.id === recommandee,
      ...(station.id === locale ? { hote: station.nom } : {}),
      ...(horsLigne ? { absente: HORS_LIGNE_DEPUIS(station.dit, station.nom, ordinateur(station)) } : {}),
    };
  });
}

/** @param {Fabrique} doc @param {string} balise @param {string} [texte] */
function cree(doc, balise, texte) {
  const pose = doc.createElement(balise);
  if (texte !== undefined) pose.textContent = texte;
  return pose;
}

// La liste des choix : un bouton par machine, le recommandé distingué, son nom d'hôte à côté de « this computer » ; une
// station hors ligne dit à côté depuis quand, et comment la ramener. `enCours` : la clé du choix qui s'écrit — les boutons
// attendent, sa ligne le dit. `refus` : pourquoi le dernier choix n'a rien écrit, en une ligne, son détail au survol.
/**
 * @param {Fabrique} doc
 * @param {{ choix: readonly Choix[], enCours?: string, refus?: { ligne: string, detail: string } }} etat
 * @param {(choix: Choix) => void} choisir
 */
export function poserLesChoix(doc, { choix, enCours, refus }, choisir) {
  const liste = cree(doc, "ul");
  liste.className = "choix-de-station";
  liste.append(
    ...choix.map((un) => {
      const ligne = cree(doc, "li");
      ligne.dataset.choix = un.cle;
      ligne.dataset.horsLigne = String(un.horsLigne);
      const action = boutonAction(doc, un.nom, () => choisir(un), { recommande: un.recommande });
      const bouton = action.children?.[0];
      if (bouton !== undefined) bouton.disabled = enCours !== undefined;
      ligne.append(action);
      if (un.hote !== undefined) ligne.append(Object.assign(cree(doc, "span", un.hote), { className: "hote mono" }));
      const note = enCours === un.cle ? ENREGISTREMENT : un.absente;
      if (note !== undefined) ligne.append(Object.assign(cree(doc, "span", note), { className: "dit" }));
      return ligne;
    }),
  );
  return [liste, ...(refus === undefined ? [] : [ligneErreur(doc, refus.ligne, refus.detail, { classe: "erreur", alerte: true })])];
}
