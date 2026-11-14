// @ts-check
// Le ticket qui attend d'autres tickets (ticket 3510, épique 3502) : sa carte du rail dit « after #12, #15 » — les numéros
// du champ `attend` de son entrée du rail, que l'ordonnancement du rail écrit (la vue le lit, elle ne le produit pas). Une
// carte dont `attend` est vide ou absent ne porte rien de plus.
// Ce module ne touche pas `document` : il reçoit de quoi créer un élément, et rend un élément, ou rien.

/** @typedef {import("../briques.js").Fabrique} Fabrique */

/** Les mots de la marque : « after #12, #15 ». @param {readonly number[]} numeros */
export const apresDe = (numeros) => `after ${numeros.map((numero) => `#${numero}`).join(", ")}`;

/** @param {Fabrique} doc @param {readonly number[] | undefined} numeros @returns {HTMLElement | null} */
export function marqueApres(doc, numeros) {
  if (numeros === undefined || numeros.length === 0) return null;
  const marque = doc.createElement("span");
  marque.className = "apres mono";
  marque.textContent = apresDe(numeros);
  return marque;
}
