// @ts-check
// Le dépôt choisi dans le parcours d'ajout est-il prêt pour brigade (ticket 2627, épique 2584) ? Dès que le chef le
// choisit, le parcours le vérifie (`checkRepoSetup`) et le dit en une phrase :
//   - prêt : la phrase, et le parcours continue comme avant, sans geste de plus ;
//   - pas prêt : ce qui manque — ses bindings, ses labels, ou les deux, leur liste au survol — et un seul bouton qui
//     le prépare (`runRepoSetup`) : le chef ne voit ni ne tape jamais de commande de préparation ;
//   - en cours : une phrase, aucun bouton ;
//   - échoué : une phrase, la raison au survol, et « try again ».
// Préparé, la phrase le dit et le parcours continue, sans quitter l'écran.
// Ce module ne touche pas `document` : il reçoit de quoi créer un élément (bricks.js), et rend un élément.

import { RETRY } from "../lexicon.js";

/** @typedef {import("../bricks.js").Fabrique} Fabrique */
/**
 * Ce que la vérification et la préparation rendent : prêt, ou ce qui manque — une liste de noms, ou un oui.
 * @typedef {{ ready: boolean, missingBindings?: readonly string[] | boolean, missingLabels?: readonly string[] | boolean }} StateOfRepository
 */

export const READY = (/** @type {string} */ repository) => `${repository} is set up for brigade.`;
export const PREPARE = (/** @type {string} */ repository) => `${repository} is now set up for brigade.`;
export const PREPARE_LABEL = "set it up";
export const IN_PROGRESS = (/** @type {string} */ repository) => `Setting up ${repository} for brigade…`;
export const FAILURE = (/** @type {string} */ repository) => `${repository} could not be set up.`;
export const UNREADABLE = (/** @type {string} */ repository) => `${repository} could not be checked.`;
export { RETRY };

// Ce qui manque, dit d'un mot : ses bindings, ses labels — ou rien. Une liste vide ne manque pas.
/** @param {readonly string[] | boolean | undefined} lack */
function lack(lack) {
  return Array.isArray(lack) ? lack.length > 0 : lack === true;
}




