// @ts-check
// Le rang de l'essai d'un ticket pris plus d'une fois (ticket 3923), à côté de ses points d'essai : « 2nd try », « 3rd try ».
// Un premier essai n'en porte pas : facts.ts ne le donne qu'à partir du deuxième. Ce module ne touche pas `document` : il
// reçoit de quoi créer un élément (bricks.js).

/** @typedef {import("../bricks.js").Fabrique} Fabrique */

// « 1st », « 2nd », « 3rd », « 4th »… « 11th », « 12th », « 13th », « 21st ».
/** @param {number} n */
function ordinal(n) {
  const ten = n % 100;
  const suffix = ten >= 11 && ten <= 13 ? "th" : ["th", "st", "nd", "rd"][n % 10] ?? "th";
  return `${n}${suffix}`;
}

// Le rang de l'essai en cours, dit en clair.
/** @param {Fabrique} doc @param {number} trials le nombre d'essais du séjour, le courant compris */
export function setRankOfTrial(doc, trials) {
  const rank = doc.createElement("span");
  rank.className = "rang-essai";
  rank.textContent = `${ordinal(trials)} try`;
  return rank;
}
