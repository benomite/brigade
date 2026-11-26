// @ts-check
// Le rang de l'essai d'un ticket pris plus d'une fois (ticket 3923), à côté de ses points d'essai : « 2nd try », « 3rd try ».
// Un premier essai n'en porte pas : facts.ts ne le donne qu'à partir du deuxième. Ce module ne touche pas `document` : il
// reçoit de quoi créer un élément (briques.js).

/** @typedef {import("../briques.js").Fabrique} Fabrique */

// « 1st », « 2nd », « 3rd », « 4th »… « 11th », « 12th », « 13th », « 21st ».
/** @param {number} n */
function ordinal(n) {
  const dizaine = n % 100;
  const suffixe = dizaine >= 11 && dizaine <= 13 ? "th" : ["th", "st", "nd", "rd"][n % 10] ?? "th";
  return `${n}${suffixe}`;
}

// Le rang de l'essai en cours, dit en clair.
/** @param {Fabrique} doc @param {number} essais le nombre d'essais du séjour, le courant compris */
export function poserRangDTrial(doc, essais) {
  const rang = doc.createElement("span");
  rang.className = "rang-essai";
  rang.textContent = `${ordinal(essais)} try`;
  return rang;
}
