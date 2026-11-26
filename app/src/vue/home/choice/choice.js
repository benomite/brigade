// @ts-check
// Les deux choix de l'écran d'accueil (ticket 4087, épique 4086) : « visit a real kitchen », la cuisine de Brigade en
// lecture seule avec sa visite guidée (visit/visit.js), et « add my project », l'écran « Add a project ». Côte à côte,
// sur une même rangée, sous le compte GitHub : rien ne s'ouvre ni ne s'ajoute avant que le nouveau venu ait choisi.
// Ce module ne touche pas `document` : il reçoit de quoi créer un élément (briques.js), et rend des éléments.

import { button } from "../../composants/button/button.js";
import { AJOUTER_UN_PROJECT } from "../../lexique.js";

/** @typedef {import("../../briques.js").Fabrique} Fabrique */

const VISITER = "visit a real kitchen";
export const VISITER_SURVOL = "Watch Brigade's own kitchen, benomite/brigade, cook its tickets, with a guided tour. Read-only: nothing is cloned or added.";
export const AJOUTER_LE_MIEN = "add my project";
export const AJOUTER_LE_MIEN_SURVOL = `Opens ${AJOUTER_UN_PROJECT}, to pick one of your GitHub repositories for the kitchen to cook.`;

// La rangée des deux choix, de même poids : aucun ne prend la place du geste recommandé de l'écran (la connexion à GitHub,
// « open this project »), et la visite se propose sans s'imposer.
/** @param {Fabrique} doc @param {{ visiter: (() => void) | undefined, ajouter: () => void }} action */
export function poserLesDeuxChoice(doc, action) {
  const rangee = doc.createElement("p");
  rangee.className = "gestes deux-choix";
  const visiter = button(doc, VISITER, action.visiter);
  visiter.title = VISITER_SURVOL;
  visiter.dataset.choix = "visiter";
  const ajouter = button(doc, AJOUTER_LE_MIEN, action.ajouter);
  ajouter.title = AJOUTER_LE_MIEN_SURVOL;
  ajouter.dataset.choix = "ajouter";
  rangee.append(visiter, ajouter);
  return rangee;
}
