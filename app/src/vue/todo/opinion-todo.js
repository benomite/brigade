// @ts-check
// L'avis « pas préparé pour Brigade » sous les colonnes, à côté du TODO — il n'est pas un ticket (tickets 2628, 3458, 4261) : le même avis, le même bouton que sur la page du
// projet (page-project/repository-not-prepare.js) — une même chose se dit partout de la même façon.

import { setOpinionOfRepository } from "../page-project/repository-not-prepare.js";

/** @typedef {import("../page-project/repository-not-prepare.js").State} State */

/** @param {import("../bricks.js").Fabrique} doc @param {State} state @param {() => void} prepare */
export const setOpinionOfTodo = (doc, state, prepare) => setOpinionOfRepository(doc, "todo", state, prepare);
