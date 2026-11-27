// @ts-check
// Les projets que sert une station, sur sa page (ticket 3403, épique 3401) : une liste qui se lit seulement. Un projet n'y
// est que si l'onglet Stations du projet montre cette station parmi celles qui le servent (stations-tab/state.js,
// `servantesDe`) : la page et l'onglet lisent la même liste. Chaque projet est un lien vers cet onglet. Ni case, ni champ,
// ni bouton : ce que la station sert se change depuis l'onglet du projet. Ce module ne touche pas `document` : il reçoit de
// quoi créer un élément.

import { lineEmpty } from "../../components/line-empty/line-empty.js";
import { nameOfTaking } from "../../stations-tab/state.js";

/** @typedef {import("../../bricks.js").Fabrique} Fabrique */
/** @typedef {import("../../stations-tab/state.js").Serving} Serving */
/** @typedef {{ id: string, nom: string }} StationOpen */

export const TITLE = "Projects it serves";
export const NO = "This station serves no project yet.";
export const UNREADABLE = "Its projects cannot be read right now.";

// Les projets dont l'onglet Stations montre la station : `servantes` rend, pour un projet, les cartes de son onglet.
// L'ordre est celui des projets de l'app.
/**
 * @param {StationOpen} station
 * @param {readonly string[]} projects
 * @param {(project: string) => readonly Serving[]} servingOnes
 */
export function projectsServedPar(station, projects, servingOnes) {
  const taking = nameOfTaking(station.nom);
  return projects.filter((project) => servingOnes(project).some((servingOne) => (servingOne.id !== "" ? servingOne.id === station.id : servingOne.nom === station.nom || servingOne.prise === taking || nameOfTaking(servingOne.nom) === taking)));
}

// La liste : un lien par projet, vers l'onglet Stations du projet ; ou, sans projet, la phrase qui le dit. `lisible` faux :
// la station ne se lit pas, ce n'est pas qu'elle ne sert rien.
/** @param {Fabrique} doc @param {{ projets: readonly string[], lisible: boolean }} quoi @param {{ ouvrir(project: string): void }} actions */
export function setTheProjectsOfTheStation(doc, { projets: projects, lisible: readable }, actions) {
  const root = doc.createElement("section");
  root.className = "projets-servis-par-la-station";
  const title = doc.createElement("h3");
  title.textContent = TITLE;
  root.append(title);
  if (!readable) {
    root.append(lineEmpty(doc, UNREADABLE));
    return root;
  }
  if (projects.length === 0) {
    root.append(lineEmpty(doc, NO));
    return root;
  }
  const list = doc.createElement("ul");
  for (const project of projects) {
    const item = doc.createElement("li");
    const link = doc.createElement("a");
    link.href = "#";
    link.className = "mono";
    link.dataset.projet = project;
    link.textContent = project;
    link.title = `open the Stations tab of ${project}`;
    link.addEventListener("click", (/** @type {{ preventDefault(): void }} */ event) => {
      event.preventDefault();
      actions.ouvrir(project);
    });
    item.append(link);
    list.append(item);
  }
  root.append(list);
  return root;
}
