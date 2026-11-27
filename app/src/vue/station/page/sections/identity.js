// @ts-check
// La section « Identity » de la page d'une station (ticket 2642, épique 2497) : son nom, sa machine, ses cœurs, sa
// version, et où en est sa mise à jour — une ligne chacun, avec la marque de son niveau (`contexte.niveau`, que la coque
// pose). Tout cela vit sur la machine : le niveau de chaque ligne est « this machine », jamais une PR. Le nom, la machine,
// les cœurs et la version se lisent seulement : leurs rangées n'ont pas de contrôle.
// - Cet ordinateur : la mise à jour se fait d'ici — « Update now » quand la station est en retard et que la coque
//   donne le geste (`identite.mettreAJour`) ; à jour, la ligne le dit.
// - Une autre station : la section se montre sans se régler (`contexte.lectureSeule`) — jamais de bouton, la note
//   « only on this station » (OnSiteNote.js) à la place de la mise à jour, qui ne se fait que sur la machine.
// - Ce que la station n'a pas dit (cœurs, version) se dit « unknown », en une ligne, jamais une case vide.
// Ce module ne touche pas `document` : il reçoit de quoi créer un élément, et rend un élément.

import { rowOfSetting } from "../../../components/setting/setting.js";
import { actionOrNote } from "../OnSiteNote.js";
import { PUT_A_DAY } from "../../../lexicon.js";

/** @typedef {import("../../../bricks.js").Fabrique} Fabrique */
/**
 * Ce que la coque lit de la station : sa machine, ses cœurs et sa version telles qu'elle les publie ; `enRetard` :
 * faux à jour, vrai en retard, absent quand elle ne l'a pas dit ; `derniere` : la dernière version connue ;
 * `mettreAJour` : le geste de cet ordinateur — absent ailleurs.
 * @typedef {{ machine?: string, coeurs?: number, version?: string, enRetard?: boolean, derniere?: string, mettreAJour?: () => void }} Identity
 */

export const UNKNOWN = "unknown";
export const A_DAY = "up to date";
export { PUT_A_DAY };
export const HOVER_OF_THE_UPDATE = "The station installs the latest version and restarts; its cooks in flight finish first.";

// La mise à jour, dite d'après ce que la station a publié.
/** @param {Identity} identite */
export function stateOfTheUpdate({ enRetard: enDelay, derniere: last }) {
  if (enDelay === undefined) return UNKNOWN;
  if (!enDelay) return A_DAY;
  return last === undefined || last === "" ? "behind" : `behind — ${last} is out`;
}

/** @param {Fabrique} doc @param {any} context */
export function setSection(doc, context) {
  /** @type {Identity} */
  const identity = context.identite ?? {};
  const root = doc.createElement("div");
  root.className = "identite";
  const said = (/** @type {string | undefined} */ text) => (text === undefined || text.trim() === "" ? UNKNOWN : text.trim());
  const cores = typeof identity.coeurs === "number" && Number.isInteger(identity.coeurs) && identity.coeurs > 0 ? String(identity.coeurs) : UNKNOWN;
  const lines = [
    line(doc, context.niveau("station-nom"), "name", context.station.nom),
    line(doc, context.niveau("station-machine"), "machine", said(identity.machine)),
    line(doc, context.niveau("station-coeurs"), "cores", cores),
    line(doc, context.niveau("station-version"), "version", said(identity.version)),
    line(doc, context.niveau("station-mise-a-jour"), "updates", stateOfTheUpdate(identity), identity.enRetard === true ? actionOrNote(doc, context, { libelle: PUT_A_DAY, geste: identity.mettreAJour, recommande: true }) : undefined),
  ];
  root.append(...lines);
  return root;
}

// Une ligne : une rangée de réglage (components/setting, ticket 2920) — son nom, la marque de son niveau (posée par la
// coque), sa valeur, et son geste s'il y en a un ; sans geste, une rangée qui se lit seulement.
/** @param {Fabrique} doc @param {any} brand @param {string} name @param {string} value @param {any} [action] */
function line(doc, brand, name, value, action) {
  return rowOfSetting(doc, { nom: name, cle: name, niveau: brand, valeur: [value], controle: action === undefined ? [] : [action] });
}
