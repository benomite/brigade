// @ts-check
// L'avis « pas préparé pour Brigade » sous les colonnes, à côté du TODO — il n'est pas un ticket (tickets 2628, 3458, 4261) : le même avis, le même bouton que sur la page du
// projet (page-project/repository-non-prepare.js) — une même chose se dit partout de la même façon.

import { poserOpinionDeRepository } from "../page-project/repository-non-prepare.js";

/** @typedef {import("../page-project/repository-non-prepare.js").State} State */

/** @param {import("../briques.js").Fabrique} doc @param {State} state @param {() => void} preparer */
export const poserOpinionDuTodo = (doc, state, preparer) => poserOpinionDeRepository(doc, "todo", state, preparer);
