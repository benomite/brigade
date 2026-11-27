// @ts-check
// Le ticket qui attend d'autres tickets (ticket 3510, épique 3502) : sa carte du rail dit « after #12, #15 » — les numéros
// du champ `attend` de son entrée du rail, que l'ordonnancement du rail écrit (la vue le lit, elle ne le produit pas). Une
// carte dont `attend` est vide ou absent ne porte rien de plus.
// Ce module ne touche pas `document` : il reçoit de quoi créer un élément, et rend un élément, ou rien.

/** @typedef {import("../bricks.js").Fabrique} Fabrique */

/** Les mots de la marque : « after #12, #15 ». @param {readonly number[]} numbers */
const afterOf = (numbers) => `after ${numbers.map((number) => `#${number}`).join(", ")}`;

/** @param {Fabrique} doc @param {readonly number[] | undefined} numbers @returns {HTMLElement | null} */
export function brandAfter(doc, numbers) {
  if (numbers === undefined || numbers.length === 0) return null;
  const brand = doc.createElement("span");
  brand.className = "apres mono";
  brand.textContent = afterOf(numbers);
  return brand;
}
