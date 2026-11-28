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

import { THIS_COMPUTER } from "../lexicon.js";

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

// Les machines dans l'ordre où le choix les montre : celle de cet ordinateur (`locale`) d'abord.
/** @template {{ id: string }} S @param {readonly S[]} stations @param {string | null | undefined} locale @returns {S[]} */
export function thisComputerOfFirst(stations, locale) {
  return [...stations.filter(({ id }) => id === locale), ...stations.filter(({ id }) => id !== locale)];
}

// La machine cochée d'office : la recommandée (`stationRecommandee`, projects.ts — un serveur en ligne), sinon cet
// ordinateur s'il est en ligne, sinon la première en ligne. Aucune en ligne : aucune.
/** @param {readonly Pick<StationVue, "id" | "etat">[]} stations @param {{ recommandee?: string | null, locale?: string | null }} lu */
export function proposedOfOffice(stations, { recommandee: recommended, locale }) {
  const inLine = stations.filter(({ etat: state }) => state === "en-ligne");
  return (inLine.find(({ id }) => id === recommended) ?? inLine.find(({ id }) => id === locale) ?? inLine[0])?.id;
}

// Le nom d'une machine tel que le choix le dit : « this computer » pour celle de cet ordinateur.
/** @param {{ id: string, nom: string }} station @param {string | null | undefined} locale */
export const nameSaid = ({ id, nom: name }, locale) => (id === locale ? THIS_COMPUTER : name);

/** @param {Fabrique} doc @param {string} balise @param {string} [text] */
function created(doc, balise, text) {
  const pose = doc.createElement(balise);
  if (text !== undefined) pose.textContent = text;
  return pose;
}

// Une machine à choisir : un libellé qui la porte entière — son bouton, son nom (« this computer », puis son nom d'hôte),
// sa marque si elle est recommandée —, dessous ce que la choisir implique, et, hors ligne, depuis quand et comment la
// ramener, sur sa propre ligne. Un clic n'importe où la choisit. `nom` : le nom de l'entrée du formulaire, une seule
// machine à la fois.
/**
 * @param {Fabrique} doc
 * @param {{ station: StationVue, nom: string, ici: boolean, choisie: boolean, recommandee: boolean, implique: string, ordinateur: boolean, aria: string }} machine
 * @param {() => void} choose
 */
export function oneMachine(doc, { station, nom: name, ici: here, choisie: chosenOne, recommandee: recommended, implique, ordinateur: computer, aria }, choose) {
  const pose = created(doc, "label");
  pose.className = "machine";
  pose.dataset.choisie = String(chosenOne);
  pose.dataset.etat = station.etat;
  const choice = /** @type {HTMLInputElement} */ (created(doc, "input"));
  choice.type = "radio";
  choice.name = name;
  choice.checked = chosenOne;
  choice.ariaLabel = aria;
  choice.addEventListener("change", () => {
    if (choice.checked) choose();
  });
  const named = created(doc, "span");
  named.className = "nom-de-machine";
  const called = created(doc, "strong", here ? THIS_COMPUTER : station.nom);
  if (!here) called.className = "mono";
  named.append(called);
  if (here) {
    const host = created(doc, "span", station.nom);
    host.className = "hote mono";
    named.append(host);
  }
  if (recommended) {
    const brand = created(doc, "span", RECOMMENDED);
    brand.className = "pilule";
    named.append(brand);
  }
  const said = [implique, ...(station.etat === "illisible" ? [station.dit] : []), ...(station.machine === "" ? [] : [station.machine])].filter((piece) => piece !== "").join(" · ");
  pose.append(choice, named, created(doc, "small", said));
  if (station.etat === "hors-ligne") {
    const absent = created(doc, "small", OUTSIDE_LINE_SINCE(station.dit, station.nom, computer));
    absent.className = "hors-ligne";
    pose.append(absent);
  }
  return pose;
}
