// @ts-check
// La part du quota Max qu'un ticket a coûtée (ticket 3254), en plus de ses tokens (expensive.js, ticket 910). Le quota est
// un réglage du fichier des projets de l'app, `quotaMax`, en tokens pondérés par modèle :
//   { "tokens": 10000000, "semaine": { "jour": "monday", "heure": 0 }, "poids": { "opus": 5 } }
// `semaine` vaut lundi 0 h UTC sans autre mot, un modèle absent de `poids` pèse 1. Les tokens pondérés d'un ticket sont
// la somme, sur ses cooks, de leurs tokens × le poids de leur modèle ; sa part, ce total sur le quota, au dixième
// de pourcent. Un quota absent, nul ou illisible ne donne aucune part : la page le dit en une ligne, et garde les tokens.
// Ce module ne touche pas `document`.

export const UNAVAILABLE = "No share: the weekly quota is not configured.";

const DAYS = ["sunday", "monday", "tuesday", "wednesday", "thursday", "friday", "saturday"];
const HOUR = 3_600_000;

/** @typedef {{ tokens: number | null, jour: number, heure: number, poids: Map<string, number> }} Quota */

/** @param {unknown} v */
const positive = (v) => typeof v === "number" && Number.isFinite(v) && v > 0;

// Le réglage tel qu'écrit, lu. `tokens` est nul quand le quota manque ou ne vaut rien ; une semaine ou un poids
// illisible retombe sur son défaut (lundi 0 h, poids 1) — seul le quota, lui, ne se devine pas.
/** @param {unknown} raw @returns {Quota} */
export function quotaRead(raw) {
  const { tokens, semaine: week, poids: weight } = /** @type {{ tokens?: unknown, semaine?: { jour?: unknown, heure?: unknown } | null, poids?: Record<string, unknown> | null }} */ (
    typeof raw === "object" && raw !== null ? raw : {}
  );
  const day = typeof week?.jour === "string" ? DAYS.indexOf(week.jour.toLowerCase()) : -1;
  const hour = week?.heure;
  /** @type {Map<string, number>} */
  const weightRead = new Map();
  if (typeof weight === "object" && weight !== null) for (const [model, value] of Object.entries(weight)) if (positive(value)) weightRead.set(model, /** @type {number} */ (value));
  return {
    tokens: positive(tokens) ? /** @type {number} */ (tokens) : null,
    jour: day === -1 ? 1 : day,
    heure: typeof hour === "number" && Number.isInteger(hour) && hour >= 0 && hour <= 23 ? hour : 0,
    poids: weightRead,
  };
}

// Le début de la semaine en cours, en UTC : le dernier jour et la dernière heure du réglage, au plus tard maintenant.
/** @param {Quota} quota @param {Date} now @returns {number} */
export function startOfWeek(quota, now) {
  const dayCurrent = new Date(Date.UTC(now.getUTCFullYear(), now.getUTCMonth(), now.getUTCDate(), quota.heure));
  const stepBack = (dayCurrent.getUTCDay() - quota.jour + 7) % 7;
  const start = dayCurrent.getTime() - stepBack * 24 * HOUR;
  return start > now.getTime() ? start - 7 * 24 * HOUR : start;
}

// Les tokens d'un cook, pondérés par son modèle (« sonnet / medium » : `sonnet`). Sans poids, 1.
/** @param {Quota} quota @param {string | null} model @param {number} tokens */
export function weightedOne(quota, model, tokens) {
  return tokens * (model === null ? 1 : (quota.poids.get(model) ?? 1));
}

// « 2.0% » : le total pondéré sur le quota, au dixième ; `null` quand le quota ne permet pas de le dire.
/** @param {Quota} quota @param {number} total @returns {string | null} */
export function partSaid(quota, total) {
  return quota.tokens === null ? null : `${((Math.round((total / quota.tokens) * 1000)) / 10).toFixed(1)}%`;
}
