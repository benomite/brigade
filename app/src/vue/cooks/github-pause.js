// @ts-check
// Ce que dit la page d'un projet dont le rail n'est pas lu parce que GitHub est en pause (ticket 4620) : le quota horaire du jeton
// du chef est presque épuisé, l'app ne lit plus rien jusqu'à l'heure où il se remplit. Une station sert le projet : la phrase
// ne dit pas le contraire.

/** @param {string} iso */
const hourOf = (iso) => `${new Date(iso).toISOString().slice(11, 16)} UTC`;

/** @param {{ jusqua: string, restant?: number, total?: number }} pause */
export function sentenceOfPause({ jusqua: until, restant: left, total }) {
  const quota = left !== undefined && total !== undefined ? `GitHub's hourly quota is almost used up (${left.toLocaleString("en-US")} of ${total.toLocaleString("en-US")} left)` : "GitHub's hourly quota is used up";
  return `${quota}: the rail is read again at ${hourOf(until)}`;
}
