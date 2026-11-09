// @ts-check
// Les enregistrements des temps des tickets d'un projet (ticket 2346, épique 2336), ceux de `.claude/brigade/temps-tickets.json`
// (secondes entières), et une durée en clair. La bande du rail en dit le
// dernier merge (projet/rail/bande-rail.js). Ce module ne touche pas `document`.

/** @typedef {{ enregistrements: unknown[] | undefined, lostTimeMaxMin?: number | undefined, resume?: unknown, chiffres?: unknown }} TempsDuProjet */

// Une durée en secondes, en clair : « 45 s », « 12 min », « 1 h 5 min ».
/** @param {number} secondes */
export function dureeEnClair(secondes) {
  const s = Math.round(Math.max(0, secondes));
  if (s < 60) return `${s} s`;
  const minutes = Math.round(s / 60);
  if (minutes < 60) return `${minutes} min`;
  const [h, m] = [Math.floor(minutes / 60), minutes % 60];
  return m === 0 ? `${h} h` : `${h} h ${m} min`;
}
