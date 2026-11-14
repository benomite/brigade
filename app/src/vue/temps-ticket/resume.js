// @ts-check
// Le temps d'un ticket tel que la mesure le résume (ticket 2664, épique 2659) : l'objet `resume` de `temps-tickets.json`
// — `n`, `medianMin`, `p75Min`, `phaseLaPlusLongue` et `perteLaPlusLourde` (`{ nom, medianMin }`) —, lu tel quel, jamais
// recalculé. Le temps d'un ticket n'a pas de plafond (tickets 2670, 2672) : les seuils sont ceux des quatre chiffres du
// projet (`temps.chiffres`). La bande du rail les dit (projet/rail/bande-rail.js) : ce module les lui donne. Il ne touche pas `document`.

import { dureeEnClair } from "./temps-ticket.js";

/** @typedef {{ nom: string, medianMin: number }} Part */
/** @typedef {{ n: number, medianMin: number, p75Min: number, phaseLaPlusLongue: Part | null, perteLaPlusLourde: Part | null }} Resume */
/** @typedef {{ cle: string, nom: string, valeur: string, seuil: string, depasse: boolean, pesent: string[] }} Chiffre */

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


/** @param {Resume} r */
export const surCombien = (r) => (r.n === 1 ? "the only measured ticket" : `the last ${r.n} measured tickets`);

// Le temps de la pass sur les 7 derniers jours que la station publie sous `temps.passe` (runtime/src/temps-ticket/passe.ts,
// ticket 3512) : chaque phase et chaque part de la CI, avec sa médiane et son p75 par livraison — null quand rien ne la
// mesure —, son total et sa part du temps de pass ; la phase et la part qui pèsent le plus, les runs relancés, les renvois.
// Lu tel quel, jamais recalculé ; null s'il est absent, illisible ou sans part qui pèse (la bande ne pose alors rien).
/** @typedef {{ cle: string, nom: string, livraisons: number, medianeS: number | null, p75S: number | null, totalS: number }} PartDeLaPasse */
/** @typedef {{ jours: number, livraisons: number, parts: PartDeLaPasse[], phaseLaPlusLourde: { nom: string, totalS: number } | null, partLaPlusLourde: { nom: string, partPct: number }, relancees: number | null, renvoyees: number, passesRenvoyeesS: number }} Passe */

/** @param {unknown} x */
const nombreOuNul = (x) => x === null || nombre(x);

/** @param {{ passe?: unknown } | undefined} temps @returns {Passe | null} */
export function lireLaPasse(temps) {
  const p = /** @type {Record<string, any> | null | undefined} */ (temps?.passe);
  if (typeof p !== "object" || p === null || !nombre(p.jours) || !nombre(p.livraisons) || p.livraisons < 1 || !Array.isArray(p.parts)) return null;
  const lourde = p.partLaPlusLourde;
  if (typeof lourde?.nom !== "string" || !nombre(lourde.partPct)) return null;
  if (!nombreOuNul(p.relancees) || !nombre(p.renvoyees) || !nombre(p.passesRenvoyeesS)) return null;
  /** @type {PartDeLaPasse[]} */
  const parts = [];
  for (const part of p.parts) {
    if (typeof part?.cle !== "string" || typeof part.nom !== "string" || !nombre(part.livraisons) || !nombreOuNul(part.medianeS) || !nombreOuNul(part.p75S) || !nombre(part.totalS)) continue;
    parts.push({ cle: part.cle, nom: part.nom, livraisons: part.livraisons, medianeS: part.medianeS, p75S: part.p75S, totalS: part.totalS });
  }
  const phase = p.phaseLaPlusLourde;
  return {
    jours: p.jours,
    livraisons: p.livraisons,
    parts,
    phaseLaPlusLourde: typeof phase?.nom === "string" && nombre(phase.totalS) ? { nom: phase.nom, totalS: phase.totalS } : null,
    partLaPlusLourde: { nom: lourde.nom, partPct: lourde.partPct },
    relancees: p.relancees,
    renvoyees: p.renvoyees,
    passesRenvoyeesS: p.passesRenvoyeesS,
  };
}

// Une part de la pass en clair : sa médiane et son p75 ; « no measure yet » sans livraison qui la mesure, jamais 0 à sa place ;
// « none » quand elle n'a duré sur aucune.
/** @param {PartDeLaPasse} part */
export function partEnClair(part) {
  const nom = `${part.nom[0]?.toUpperCase() ?? ""}${part.nom.slice(1)}`;
  if (part.livraisons === 0 || part.medianeS === null || part.p75S === null) return `${nom}: no measure yet.`;
  if (part.totalS === 0) return `${nom}: none.`;
  return `${nom}: median ${dureeEnClair(part.medianeS)}, p75 ${dureeEnClair(part.p75S)}.`;
}
