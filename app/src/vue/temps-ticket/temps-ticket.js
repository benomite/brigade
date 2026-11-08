// @ts-check
// Les enregistrements des temps des tickets d'un projet (ticket 2346, épique 2336), ceux de `.claude/brigade/temps-tickets.json`
// (secondes entières), et de quoi les lire : le total d'un ticket, la médiane, une durée en clair. Le bloc qui les montre est
// celui du bandeau de santé (projet/bandeau-sante/TempsTickets.js). Ce module ne touche pas `document`.

/** @typedef {{ ticket: number, claimedAt: string, mergedAt: string, cuisson: number, cuissonTests: number, attentePasse: number, revue: number, ci: number, merge: number }} Enregistrement */
/** @typedef {{ enregistrements: unknown[] | undefined, lostTimeMaxMin?: number | undefined, resume?: unknown, chiffres?: unknown }} TempsDuProjet */

/** @param {Enregistrement} e */
const cuisson = (e) => e.cuisson + e.cuissonTests;
/** @param {Enregistrement} e */
export const total = (e) => cuisson(e) + e.attentePasse + e.revue + e.ci + e.merge;

/** @param {number[]} valeurs */
export function mediane(valeurs) {
  const triees = [...valeurs].sort((a, b) => a - b);
  const milieu = triees.length >> 1;
  return triees.length % 2 === 1 ? (triees[milieu] ?? 0) : ((triees[milieu - 1] ?? 0) + (triees[milieu] ?? 0)) / 2;
}

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
