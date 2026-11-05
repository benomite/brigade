// @ts-check
// Ce qui est le plus lent dans le projet, sur sa page (ticket 2351, épique 2337) : la phrase que la station publie
// pour le projet (`nommerLePlusLent`, runtime/src/lenteur/nommer.ts), telle quelle — « CI: 7 min median », « a cook
// spends 70 % of its time in tests ». Pas de phrase, pas de ligne : jamais de ligne vide ni de pastille de remplissage.
// Ce module ne touche pas `document` : il reçoit de quoi créer un élément (briques.js).

import { survol } from "../briques.js";

/** @typedef {import("../briques.js").Fabrique} Fabrique */
/** @typedef {{ partie: string, phrase: string, chiffres: string }} Lenteur */

// La ligne à poser sur la page du projet, ou null. Les chiffres sont au survol, pas écrits sous la phrase.
/**
 * @param {Fabrique} doc
 * @param {Lenteur | null | undefined} lenteur
 */
export function poserLaLenteur(doc, lenteur) {
  if (lenteur === null || lenteur === undefined || lenteur.phrase.trim() === "") return null;
  const pose = doc.createElement("p");
  pose.className = "lenteur";
  pose.dataset.partie = lenteur.partie;
  pose.textContent = lenteur.phrase;
  if (lenteur.chiffres.trim() !== "") pose.append(survol(doc, lenteur.chiffres));
  return pose;
}
