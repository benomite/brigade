// @ts-check
// La part du quota Max qu'un ticket a coûtée (ticket 3254), en plus de ses tokens (chers.js, ticket 910). Le quota est
// un réglage du fichier des projets de l'app, `quotaMax`, en tokens pondérés par modèle :
//   { "tokens": 10000000, "semaine": { "jour": "monday", "heure": 0 }, "poids": { "opus": 5 } }
// `semaine` vaut lundi 0 h UTC sans autre mot, un modèle absent de `poids` pèse 1. Les tokens pondérés d'un ticket sont
// la somme, sur ses cooks, de leurs tokens × le poids de leur modèle ; sa part, ce total sur le quota, au dixième
// de pourcent. Un quota absent, nul ou illisible ne donne aucune part : la page le dit en une ligne, et garde les tokens.
// Ce module ne touche pas `document`.

export const INDISPONIBLE = "Share unavailable: weekly quota is not configured.";

const JOURS = ["sunday", "monday", "tuesday", "wednesday", "thursday", "friday", "saturday"];
const HEURE = 3_600_000;

/** @typedef {{ tokens: number | null, jour: number, heure: number, poids: Map<string, number> }} Quota */

/** @param {unknown} v */
const positif = (v) => typeof v === "number" && Number.isFinite(v) && v > 0;

// Le réglage tel qu'écrit, lu. `tokens` est nul quand le quota manque ou ne vaut rien ; une semaine ou un poids
// illisible retombe sur son défaut (lundi 0 h, poids 1) — seul le quota, lui, ne se devine pas.
/** @param {unknown} brut @returns {Quota} */
export function quotaLu(brut) {
  const { tokens, semaine, poids } = /** @type {{ tokens?: unknown, semaine?: { jour?: unknown, heure?: unknown } | null, poids?: Record<string, unknown> | null }} */ (
    typeof brut === "object" && brut !== null ? brut : {}
  );
  const jour = typeof semaine?.jour === "string" ? JOURS.indexOf(semaine.jour.toLowerCase()) : -1;
  const heure = semaine?.heure;
  /** @type {Map<string, number>} */
  const poidsLus = new Map();
  if (typeof poids === "object" && poids !== null) for (const [modele, valeur] of Object.entries(poids)) if (positif(valeur)) poidsLus.set(modele, /** @type {number} */ (valeur));
  return {
    tokens: positif(tokens) ? /** @type {number} */ (tokens) : null,
    jour: jour === -1 ? 1 : jour,
    heure: typeof heure === "number" && Number.isInteger(heure) && heure >= 0 && heure <= 23 ? heure : 0,
    poids: poidsLus,
  };
}

// Le début de la semaine en cours, en UTC : le dernier jour et la dernière heure du réglage, au plus tard maintenant.
/** @param {Quota} quota @param {Date} maintenant @returns {number} */
export function debutDeSemaine(quota, maintenant) {
  const jourCourant = new Date(Date.UTC(maintenant.getUTCFullYear(), maintenant.getUTCMonth(), maintenant.getUTCDate(), quota.heure));
  const recul = (jourCourant.getUTCDay() - quota.jour + 7) % 7;
  const debut = jourCourant.getTime() - recul * 24 * HEURE;
  return debut > maintenant.getTime() ? debut - 7 * 24 * HEURE : debut;
}

// Les tokens d'un cook, pondérés par son modèle (« sonnet / medium » : `sonnet`). Sans poids, 1.
/** @param {Quota} quota @param {string | null} modele @param {number} tokens */
export function pondere(quota, modele, tokens) {
  return tokens * (modele === null ? 1 : (quota.poids.get(modele) ?? 1));
}

// « 2.0% » : le total pondéré sur le quota, au dixième ; `null` quand le quota ne permet pas de le dire.
/** @param {Quota} quota @param {number} total @returns {string | null} */
export function partDite(quota, total) {
  return quota.tokens === null ? null : `${((Math.round((total / quota.tokens) * 1000)) / 10).toFixed(1)}%`;
}
