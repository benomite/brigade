// @ts-check
// Le choix d'une station (ticket 3195) : la seule pièce qui demande au chef qui cuit un projet — sur l'onglet Stations,
// quand personne ne le cuit (« Choose who cooks it ») ou que sa cuisine déménage (« Move to another station »), et sur la
// page d'un projet pas encore prêt (« 1 of 2: who cooks it », ticket 3166, parcours-premier-projet/). Ce que le choix dit
// des machines vient de choix-station/ (ticket 3187) : cet ordinateur d'abord, son nom d'hôte après lui ; une station hors
// ligne n'est jamais recommandée, et dit sur sa ligne depuis quand, et comment la ramener.
// Un bouton par machine : un clic la choisit. Un choix qui s'écrit grise les boutons et le dit sur sa ligne ; un refus se
// dit en une ligne, son détail au survol.
// Ce module ne touche pas `document` : il reçoit de quoi créer un élément (bricks.js), et rend des éléments.

import { buttonAction } from "../bricks.js";
import { lineError } from "../components/line-error/line-error.js";
import { THIS_COMPUTER, RECORDING } from "../lexicon.js";
import { OUTSIDE_LINE_SINCE } from "../choice-station/choice-station.js";

/** @typedef {import("../bricks.js").Fabrique} Fabrique */
/** @typedef {import("../../stations/stations.ts").StationVue} StationVue */
// Un choix de station : `cle` — `ICI`, ou l'id de la station appairée —, son nom, si elle est hors ligne, et si c'est le
// choix recommandé. `hote` : le nom d'hôte de cet ordinateur, dit après « this computer ». `absente` : hors ligne, depuis
// quand et le geste qui la ramène (choix-station/).
/** @typedef {{ cle: string, nom: string, horsLigne: boolean, recommande: boolean, hote?: string, absente?: string }} Choice */

export const HERE = "ici";

// Les choix de « qui le cuit » : cet ordinateur — s'il a une station (`ici`), son nom d'hôte (`hote`) après lui —, recommandé.
/** @param {{ ici: boolean, hote?: string, maintenant?: number }} offerts @returns {Choice[]} */
export function choiceOfStation({ ici: here, hote: host = "" }) {
  return here ? [{ cle: HERE, nom: THIS_COMPUTER, horsLigne: false, recommande: true, ...(host === "" ? {} : { hote: host }) }] : [];
}

// Les choix d'un déménagement : les stations où la cuisine peut aller, cet ordinateur d'abord — « this computer », son nom
// d'hôte après lui —, puis les autres, en ligne d'abord. Le recommandé est cet ordinateur s'il est en ligne, sinon la
// première en ligne ; une station hors ligne dit depuis quand, et le geste qui la ramène sur sa machine (`ordinateur` : elle
// tourne sur un ordinateur, pas sur une box).
/** @param {readonly StationVue[]} destinations @param {{ locale?: string | null, ordinateur: (station: StationVue) => boolean }} lu @returns {Choice[]} */
export function choiceOfDisplacement(destinations, { locale, ordinateur: computer }) {
  const here = destinations.filter(({ id }) => id === locale);
  const others = destinations.filter(({ id }) => id !== locale);
  const order = [...here, ...others.filter(({ etat: state }) => state === "en-ligne"), ...others.filter(({ etat: state }) => state !== "en-ligne")];
  const recommended = order.find(({ etat: state }) => state === "en-ligne")?.id;
  return order.map((station) => {
    const outsideLine = station.etat !== "en-ligne";
    return {
      cle: station.id,
      nom: station.id === locale ? THIS_COMPUTER : station.nom,
      horsLigne: outsideLine,
      recommande: station.id === recommended,
      ...(station.id === locale ? { hote: station.nom } : {}),
      ...(outsideLine ? { absente: OUTSIDE_LINE_SINCE(station.dit, station.nom, computer(station)) } : {}),
    };
  });
}

/** @param {Fabrique} doc @param {string} balise @param {string} [text] */
function created(doc, balise, text) {
  const pose = doc.createElement(balise);
  if (text !== undefined) pose.textContent = text;
  return pose;
}

// La liste des choix : un bouton par machine, le recommandé distingué, son nom d'hôte à côté de « this computer » ; une
// station hors ligne dit à côté depuis quand, et comment la ramener. `enCours` : la clé du choix qui s'écrit — les boutons
// attendent, sa ligne le dit. `refus` : pourquoi le dernier choix n'a rien écrit, en une ligne, son détail au survol.
/**
 * @param {Fabrique} doc
 * @param {{ choix: readonly Choice[], enCours?: string, refus?: { ligne: string, detail: string } }} etat
 * @param {(choice: Choice) => void} choose
 */
export function setTheChoice(doc, { choix: choice, enCours: inProgress, refus: refusal }, choose) {
  const list = created(doc, "ul");
  list.className = "choix-de-station";
  list.append(
    ...choice.map((oneOf) => {
      const line = created(doc, "li");
      line.dataset.choix = oneOf.cle;
      line.dataset.horsLigne = String(oneOf.horsLigne);
      const action = buttonAction(doc, oneOf.nom, () => choose(oneOf), { recommande: oneOf.recommande });
      const button = action.children?.[0];
      if (button !== undefined) button.disabled = inProgress !== undefined;
      line.append(action);
      if (oneOf.hote !== undefined) line.append(Object.assign(created(doc, "span", oneOf.hote), { className: "hote mono" }));
      const note = inProgress === oneOf.cle ? RECORDING : oneOf.absente;
      if (note !== undefined) line.append(Object.assign(created(doc, "span", note), { className: "dit" }));
      return line;
    }),
  );
  return [list, ...(refusal === undefined ? [] : [lineError(doc, refusal.ligne, refusal.detail, { classe: "erreur", alerte: true })])];
}
