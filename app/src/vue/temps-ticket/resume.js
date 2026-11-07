// @ts-check
// Le temps d'un ticket tel que la mesure le résume (ticket 2664, épique 2659) : l'objet `resume` de `temps-tickets.json`
// — `n`, `medianMin`, `p75Min`, `maxMin`, `phaseLaPlusLongue` (`{ nom, medianMin }`) —, lu tel quel, jamais recalculé. La bande du
// rail et l'onglet Health le disent des mêmes chiffres et des mêmes mots : ce module les leur donne. Il ne touche pas `document`.

import { dureeEnClair } from "./temps-ticket.js";

/** @typedef {{ n: number, medianMin: number, p75Min: number, maxMin: number, phaseLaPlusLongue: { nom: string, medianMin: number } | null }} Resume */

// Ce que les deux vues disent quand la mesure n'a rien publié : ni un blanc ni un zéro.
export const SANS_MESURE = "no measure yet";
export const SANS_MESURE_DETAIL = "The station has not published a ticket time measure yet: this is not a count of zero tickets";

/** @param {unknown} x @returns {x is number} */
const nombre = (x) => typeof x === "number" && Number.isFinite(x) && x >= 0;

// Le résumé publié dans `temps.resume`, ou null s'il est absent ou illisible (la vue dit alors « no measure yet »).
/** @param {{ resume?: unknown } | undefined} temps @returns {Resume | null} */
export function lireLeResume(temps) {
  const r = /** @type {Record<string, unknown> | null | undefined} */ (temps?.resume);
  if (typeof r !== "object" || r === null) return null;
  if (!nombre(r.n) || r.n < 1 || !nombre(r.medianMin) || !nombre(r.p75Min) || !nombre(r.maxMin) || r.maxMin <= 0) return null;
  const p = /** @type {Record<string, unknown> | null | undefined} */ (r.phaseLaPlusLongue);
  const nom = typeof p?.nom === "string" ? p.nom : typeof p?.phase === "string" ? p.phase : undefined;
  const phaseLaPlusLongue = nom !== undefined && nombre(p?.medianMin) ? { nom, medianMin: /** @type {number} */ (p?.medianMin) } : null;
  return { n: r.n, medianMin: r.medianMin, p75Min: r.p75Min, maxMin: r.maxMin, phaseLaPlusLongue };
}

/** @param {number} minutes */
export const enMinutes = (minutes) => dureeEnClair(minutes * 60);

// Au-dessus du plafond : la médiane, le p75, l'un ou l'autre.
/** @param {Resume} r */
export const depasse = (r) => ({ mediane: r.medianMin > r.maxMin, p75: r.p75Min > r.maxMin });
/** @param {Resume} r */
export const estDepasse = (r) => depasse(r).mediane || depasse(r).p75;

/** @param {Resume} r */
export const surCombien = (r) => (r.n === 1 ? "the only measured ticket" : `the last ${r.n} measured tickets`);
