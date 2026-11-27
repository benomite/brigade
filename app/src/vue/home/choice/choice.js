// @ts-check
// Les deux choix de l'écran d'accueil (ticket 4087, épique 4086) : « visit a real kitchen », la cuisine de Brigade en
// lecture seule avec sa visite guidée (visit/visit.js), et « add my project », l'écran « Add a project ». Côte à côte,
// sur une même rangée, sous le compte GitHub : rien ne s'ouvre ni ne s'ajoute avant que le nouveau venu ait choisi.
// Ce module ne touche pas `document` : il reçoit de quoi créer un élément (bricks.js), et rend des éléments.

import { button } from "../../components/button/button.js";
import { ADD_ONE_PROJECT } from "../../lexicon.js";

/** @typedef {import("../../bricks.js").Fabrique} Fabrique */

const VISIT = "visit a real kitchen";
export const VISIT_HOVER = "Watch Brigade's own kitchen, benomite/brigade, cook its tickets, with a guided tour. Read-only: nothing is cloned or added.";
export const ADD_THE_MINE = "add my project";
export const ADD_THE_MINE_HOVER = `Opens ${ADD_ONE_PROJECT}, to pick one of your GitHub repositories for the kitchen to cook.`;

// La rangée des deux choix, de même poids : aucun ne prend la place du geste recommandé de l'écran (la connexion à GitHub,
// « open this project »), et la visite se propose sans s'imposer.
/** @param {Fabrique} doc @param {{ visiter: (() => void) | undefined, ajouter: () => void }} action */
export function setTheTwoChoice(doc, action) {
  const row = doc.createElement("p");
  row.className = "gestes deux-choix";
  const visit = button(doc, VISIT, action.visiter);
  visit.title = VISIT_HOVER;
  visit.dataset.choix = "visiter";
  const add = button(doc, ADD_THE_MINE, action.ajouter);
  add.title = ADD_THE_MINE_HOVER;
  add.dataset.choix = "ajouter";
  row.append(visit, add);
  return row;
}
