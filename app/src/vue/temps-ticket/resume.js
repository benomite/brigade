// @ts-check
// Le temps d'un ticket tel que la mesure le résume (ticket 2664, épique 2659) : l'objet `resume` de `temps-tickets.json`
// — `n`, `medianMin`, `p75Min`, `phaseLaPlusLongue` et `perteLaPlusLourde` (`{ nom, medianMin }`) —, lu tel quel, jamais
// recalculé. Le temps d'un ticket n'a pas de plafond (tickets 2670, 2672) : les seuils sont ceux des quatre chiffres du
// projet (`temps.chiffres`). La bande du rail et l'onglet Health les disent des mêmes valeurs et des mêmes mots : ce
// module les leur donne. Il ne touche pas `document`.

import { dureeEnClair } from "./temps-ticket.js";

/** @typedef {{ nom: string, medianMin: number }} Part */
/** @typedef {{ n: number, medianMin: number, p75Min: number, phaseLaPlusLongue: Part | null, perteLaPlusLourde: Part | null }} Resume */
/** @typedef {{ cle: string, nom: string, valeur: string, seuil: string, depasse: boolean, pesent: string[] }} Chiffre */

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
/** @param {{ resume?: unknown } | undefined} temps @returns {Resume | null} */
export function lireLeResume(temps) {
  const r = /** @type {Record<string, unknown> | null | undefined} */ (temps?.resume);
  if (typeof r !== "object" || r === null) return null;
  if (!nombre(r.n) || r.n < 1 || !nombre(r.medianMin) || !nombre(r.p75Min)) return null;
  return { n: r.n, medianMin: r.medianMin, p75Min: r.p75Min, phaseLaPlusLongue: lirePart(r.phaseLaPlusLongue), perteLaPlusLourde: lirePart(r.perteLaPlusLourde) };
}

// Les quatre chiffres du projet que la station publie sous `temps.chiffres` (runtime/src/chiffres-du-projet.ts, ticket 2672) :
// le temps perdu, la cuisson contre l'estimation, le premier coup et les réparations de la base, chacun avec sa valeur dite,
// son seuil, son état rouge et ce qui pèse le plus. Lus tels quels, jamais recalculés ; les entrées illisibles sont écartées,
// et null sans aucune (la vue dit alors « no measure yet »).
/** @param {{ chiffres?: unknown } | undefined} temps @returns {Chiffre[] | null} */
export function lireLesChiffres(temps) {
  if (!Array.isArray(temps?.chiffres)) return null;
  /** @type {Chiffre[]} */
  const lus = [];
  for (const c of /** @type {Record<string, unknown>[]} */ (temps.chiffres)) {
    if (typeof c !== "object" || c === null || typeof c.cle !== "string" || typeof c.nom !== "string" || typeof c.valeur !== "string" || typeof c.seuil !== "string") continue;
    lus.push({ cle: c.cle, nom: c.nom, valeur: c.valeur, seuil: c.seuil, depasse: c.depasse === true, pesent: Array.isArray(c.pesent) ? c.pesent.filter((p) => typeof p === "string") : [] });
  }
  return lus.length === 0 ? null : lus;
}

// Ce qu'un chiffre dit au survol : les tickets, les motifs ou les checks qui pèsent le plus.
/** @param {Chiffre} c */
export const pesentLePlus = (c) => (c.pesent.length === 0 ? `Nothing weighs on ${c.nom} yet.` : `Weighs most: ${c.pesent.join(" · ")}`);

/** @param {number} minutes */
export const enMinutes = (minutes) => dureeEnClair(minutes * 60);

// Un des quatre chiffres passe son seuil.
/** @param {Chiffre[] | null} chiffres */
export const aUnDepassement = (chiffres) => chiffres?.some((c) => c.depasse) === true;

/** @param {Resume} r */
export const surCombien = (r) => (r.n === 1 ? "the only measured ticket" : `the last ${r.n} measured tickets`);
