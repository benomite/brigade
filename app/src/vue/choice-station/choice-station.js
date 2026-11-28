// @ts-check
// Choisir la station d'un projet (ticket 3187, épique 3182) : ce que le formulaire « Choose the machine that cooks
// <projet> » (vue.js, `poserLaConfiance`) et la question « Who cooks it » (parcours-premier-projet/) disent des machines
// à choisir, en un seul endroit.
//   - L'ordre : cet ordinateur d'abord, nommé « this computer », son nom d'hôte ensuite.
//   - Ce qui est proposé : une station qui peut cuire maintenant. Une station hors ligne n'est jamais cochée d'office ni
//     marquée « recommended » ; aucune en ligne, rien ne l'est.
//   - Une station hors ligne dit, sur une ligne à elle, depuis quand, et le geste qui la ramène sur sa machine. La choisir
//     réussit quand même : elle prend le projet à son retour.
// Ce module ne touche pas `document` : il reçoit de quoi créer un élément (bricks.js), et rend des éléments.


/** @typedef {import("../bricks.js").Fabrique} Fabrique */
/** @typedef {import("../../stations/stations.ts").StationVue} StationVue */

export const RECOMMENDED = "recommended";

// Le geste qui ramène une station, sur sa machine : un ordinateur (Mac, PC) relance la sienne à l'ouverture de sa
// session ou de l'app ; un serveur, au démarrage de la machine, par son service (docs/installation-station.md).
/** @param {string} name @param {boolean} computer */
export const BRING_BACK = (name, computer) =>
  computer ? `open Brigade on ${name}, or log in there: its station starts with your session` : `switch ${name} on, or start its brigade-station service there: it starts with the machine`;

// La ligne d'une station hors ligne : depuis quand (« offline for 22 min », tel que sa lecture le dit), puis son geste.
/** @param {string} since @param {string} name @param {boolean} computer */
export const OUTSIDE_LINE_SINCE = (since, name, computer) => `${since.charAt(0).toUpperCase()}${since.slice(1)}: ${BRING_BACK(name, computer)}`;


// Choisie hors ligne : ce que la page en dit, en clair.
/** @param {string} name @param {string} project */
export const AT_RETURN = (name, project) => `${name} is offline: it takes ${project} when it comes back.`;





