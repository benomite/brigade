// @ts-check
// Ce qui manque à la station pour les tests d'un projet, sur sa page (ticket 1400, épique 1393) : une carte par
// besoin que sa principale publie en attente (ticket 1398, `choix` du suivi) — ce qui manque en une phrase,
// pourquoi dessous, et ses issues, chacune un bouton avec ce qui en suit sous lui : le cuire sur une station qui
// l'a, le fournir sur celle-ci, adapter les tests. Deux besoins, deux cartes. Un clic retient l'issue ; la carte
// part dès qu'elle est écrite. Aucun choix en attente, aucune carte. La carte dit ce que le blocage du besoin
// disait (même clé, `need:<besoin>`) : la ligne du blocage ne se répète pas dessous. Ce module ne connaît aucun
// besoin ni aucune issue : il montre ceux que la station publie. Il ne touche pas `document` (bricks.js).


/** @typedef {import("../bricks.js").Fabrique} Fabrique */
/** @typedef {import("../../projects/request.ts").Choice} Choice */
/** @typedef {import("../../projects/request.ts").Blockage} Blockage */
// Pourquoi une issue n'a pas été retenue, en une ligne, et ce que GitHub a dit au survol.
/** @typedef {{ refus: string, detail?: string }} Refusal */

export const RECOMMENDED = "recommended";
export const IN_PROGRESS = "recording your choice…";






