// @ts-check
// L'avis « pas préparé pour Brigade » sous les colonnes, à côté du TODO — il n'est pas un ticket (tickets 2628, 3458, 4261) : le même avis, le même bouton que sur la page du
// projet (page-projet/depot-non-prepare.js) — une même chose se dit partout de la même façon.

import { poserAvisDeDepot } from "../page-projet/depot-non-prepare.js";

/** @typedef {import("../page-projet/depot-non-prepare.js").Etat} Etat */

/** @param {import("../briques.js").Fabrique} doc @param {Etat} etat @param {() => void} preparer */
export const poserAvisDuTodo = (doc, etat, preparer) => poserAvisDeDepot(doc, "todo", etat, preparer);
