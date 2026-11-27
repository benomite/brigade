// @ts-check
// La ligne d'erreur de l'app (ticket 2919, maquette `Components.dc.html` de docs/maquettes/app/) : une lecture ou un geste
// qui échoue se dit en une seule ligne (« historique indisponible »), jamais le détail ; ce que la box, le réseau ou `gh`
// a répondu est au survol. Chaque écran passe par ici ; sa peau est dans `line-error.css`, à côté, qui ne lit que
// `data-ligne="erreur"` et ne nomme aucun écran.
// `ligne` : la phrase, ou un élément déjà posé (une phrase dont les mots entre accents graves sont en code).
// `classe` : le crochet que la vue et ses tests gardent pour retrouver la ligne (il ne porte aucune règle) ; `alerte` : la
// ligne se lit d'office aux lecteurs d'écran, pour l'échec d'un geste qu'on vient de faire.
// Ce module ne touche pas `document` : il reçoit de quoi créer un élément, la vue lui donne le sien et les tests un faux.

import { hover } from "../../bricks.js";

/** @typedef {{ createElement(balise: string): any }} Fabrique */

/** @param {Fabrique} doc @param {string | any} line @param {string} [detail] @param {{ classe?: string, balise?: string, alerte?: boolean }} [options] */
export function lineError(doc, line, detail = "", { classe = "indisponible", balise = "p", alerte: alert = false } = {}) {
  const created = doc.createElement(balise);
  created.className = classe;
  created.dataset.ligne = "erreur";
  if (alert) created.role = "alert";
  if (typeof line !== "string") created.append(line);
  else if (line !== "") {
    const text = doc.createElement("span");
    text.textContent = line;
    text.title = line;
    created.append(text);
  }
  if (detail.trim() !== "") created.append(hover(doc, detail));
  return created;
}
