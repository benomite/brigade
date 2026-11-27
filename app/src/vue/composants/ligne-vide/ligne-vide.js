// @ts-check
// La ligne vide de l'app (ticket 2919, maquette `Components.dc.html` de docs/maquettes/app/) : quand il n'y a rien à
// montrer, l'écran le dit en une seule ligne, discrète, et ne dessine rien d'autre. Chaque écran qui n'a rien à dire passe
// par ici ; sa peau est dans `ligne-vide.css`, à côté, qui ne lit que `data-ligne="vide"` et ne nomme aucun écran.
// `classe` : le crochet que la vue et ses tests gardent pour retrouver la ligne (il ne porte aucune règle) ; `balise` : `li`
// quand la ligne vide tient la place d'un élément de liste, `dd` d'une valeur ; `detail` : ce qui l'explique, au survol.
// Ce module ne touche pas `document` : il reçoit de quoi créer un élément, la vue lui donne le sien et les tests un faux.

import { survol } from "../../briques.js";

/** @typedef {{ createElement(balise: string): any }} Fabrique */

/** @param {Fabrique} doc @param {string} texte @param {{ classe?: string, balise?: string, detail?: string }} [options] */
export function ligneVide(doc, texte, { classe = "vide", balise = "p", detail = "" } = {}) {
  const cree = doc.createElement(balise);
  cree.className = classe;
  cree.dataset.ligne = "vide";
  if (detail.trim() === "") {
    cree.textContent = texte;
    return cree;
  }
  const phrase = doc.createElement("span");
  phrase.textContent = texte;
  cree.append(phrase, survol(doc, detail));
  return cree;
}
