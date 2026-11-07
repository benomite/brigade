// @ts-check
// Le temps d'un ticket tel que la mesure le résume (ticket 2664, épique 2659) : l'objet `resume` de `temps-tickets.json`
// — `n`, `medianMin`, `p75Min`, `perduMedianMin`, `lostTimeMaxMin`, `phaseLaPlusLongue` et `perteLaPlusLourde`
// (`{ nom, medianMin }`) —, lu tel quel, jamais recalculé. Le temps d'un ticket n'a plus de plafond (ticket 2670) : seul
// son temps perdu (l'attente avant la prise, les cuissons ratées, les renvois) en a un, sur sa médiane. La bande du rail
// et l'onglet Health le disent des mêmes chiffres et des mêmes mots : ce module les leur donne. Il ne touche pas `document`.

import { dureeEnClair, seuilPerdu } from "./temps-ticket.js";

/** @typedef {{ nom: string, medianMin: number }} Part */
/** @typedef {{ n: number, medianMin: number, p75Min: number, perduMedianMin: number, lostTimeMaxMin: number, phaseLaPlusLongue: Part | null, perteLaPlusLourde: Part | null }} Resume */

// Ce que les deux vues disent quand la mesure n'a rien publié : ni un blanc ni un zéro.
export const SANS_MESURE = "no measure yet";
export const SANS_MESURE_DETAIL = "The station has not published a ticket time measure yet: this is not a count of zero tickets";

/** @param {unknown} x @returns {x is number} */
const nombre = (x) => typeof x === "number" && Number.isFinite(x) && x >= 0;

// Une part nommée du résumé (la phase la plus longue, la perte la plus lourde), ou null.
/** @param {unknown} lu @returns {Part | null} */
function lirePart(lu) {
  const p = /** @type {Record<string, unknown> | null | undefined} */ (lu);
  const nom = typeof p?.nom === "string" ? p.nom : typeof p?.phase === "string" ? p.phase : undefined;
  return nom !== undefined && nombre(p?.medianMin) ? { nom, medianMin: /** @type {number} */ (p?.medianMin) } : null;
}

// Le résumé publié dans `temps.resume`, ou null s'il est absent ou illisible (la vue dit alors « no measure yet »). Le
// seuil est celui du résumé, sinon celui que la station publie à côté (`temps.lostTimeMaxMin`), sinon 2 minutes.
/** @param {{ resume?: unknown, lostTimeMaxMin?: number | undefined } | undefined} temps @returns {Resume | null} */
export function lireLeResume(temps) {
  const r = /** @type {Record<string, unknown> | null | undefined} */ (temps?.resume);
  if (typeof r !== "object" || r === null) return null;
  if (!nombre(r.n) || r.n < 1 || !nombre(r.medianMin) || !nombre(r.p75Min) || !nombre(r.perduMedianMin)) return null;
  const lostTimeMaxMin = nombre(r.lostTimeMaxMin) && r.lostTimeMaxMin > 0 ? r.lostTimeMaxMin : seuilPerdu(temps ?? {});
  return { n: r.n, medianMin: r.medianMin, p75Min: r.p75Min, perduMedianMin: r.perduMedianMin, lostTimeMaxMin, phaseLaPlusLongue: lirePart(r.phaseLaPlusLongue), perteLaPlusLourde: lirePart(r.perteLaPlusLourde) };
}

/** @param {number} minutes */
export const enMinutes = (minutes) => dureeEnClair(minutes * 60);

// Au-dessus du seuil : la médiane du temps perdu. La médiane et le p75 du temps total n'ont pas de plafond.
/** @param {Resume} r */
export const depasse = (r) => ({ perdu: r.perduMedianMin > r.lostTimeMaxMin });
/** @param {Resume} r */
export const estDepasse = (r) => depasse(r).perdu;

/** @param {Resume} r */
export const surCombien = (r) => (r.n === 1 ? "the only measured ticket" : `the last ${r.n} measured tickets`);
