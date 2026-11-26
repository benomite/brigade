// @ts-check
// Les moteurs d'une station (ticket 3746, épique 3518) : ce sur quoi ses cooks tournent — l'abonnement Claude, par défaut,
// une clé d'API de Claude, ou Codex — et le moteur de secours, sur lequel ils passent quand le premier est à son plafond.
// Le contrat est celui des réglages de la station, `engine` et `fallbackEngine`, aux valeurs `claude-subscription`,
// `claude-api-key` et `codex`. Ce module tient leurs mots et lit l'état que le runtime publie d'une station (`facts`, son
// champ `engine`) : le moteur choisi, celui sur lequel elle cuit, si c'est le secours, et jusqu'à quand le choisi est bloqué.
// Il ne pose rien.

import { CET_ORDINATEUR } from "../lexique.js";

/** @typedef {"claude-subscription" | "claude-api-key" | "codex"} Engine */
/**
 * L'état du moteur d'une station, tel que le runtime le publie : `choisi` (son réglage `engine`), `actif` (celui sur lequel
 * ses cooks cuisent), `secours` (actif est le moteur de secours), `jusqua` (le choisi est bloqué jusqu'à cette heure, ISO).
 * @typedef {{ choisi: Engine, actif: Engine, secours: boolean, jusqua: string | null }} Status
 */

// Les trois moteurs, dans l'ordre où le chef les choisit : leur nom, et comment une phrase les dit.
export const MOTEURS = /** @type {const} */ ([
  { cle: "claude-subscription", nom: "Claude subscription", dit: "the subscription" },
  { cle: "claude-api-key", nom: "Claude API key", dit: "the API key" },
  { cle: "codex", nom: "Codex", dit: "Codex" },
]);
// Sans réglage, la station cuit sur l'abonnement Claude.
/** @type {Engine} */
export const PAR_DEFAUT = "claude-subscription";
// Le moteur qui demande une clé.
/** @type {Engine} */
export const A_CLE = "claude-api-key";

export const MOTS = {
  moteur: "engine",
  secours: "fallback engine",
  cle: "Claude API key",
  aucun: "none",
  cleGardee: "saved",
  cleAbsente: "not saved yet",
  masque: "••••••••",
  saisirLaCle: "paste the key",
  remplacerLaCle: "paste a new key to replace it",
  aideMoteur: "what this station's cooks run on",
  aideSecours: "what its cooks run on while the engine has reached its cap — none: they wait",
  aideCle: `kept on ${CET_ORDINATEUR} as a secret, readable only by your account; it is never shown again`,
  inconnu: (/** @type {string} */ brut) => `“${brut}” — an engine this app does not know`,
};

/** @param {unknown} cle @returns {cle is Engine} */
export const estUnEngine = (cle) => MOTEURS.some((engine) => engine.cle === cle);

/** @param {string} cle */
export const nameDe = (cle) => MOTEURS.find((engine) => engine.cle === cle)?.nom ?? cle;

// Les moteurs que le secours peut prendre : les deux autres que le moteur choisi.
/** @param {string} engine */
export const secoursPossibles = (engine) => MOTEURS.filter(({ cle }) => cle !== engine);

/** @param {string} cle */
const ditDe = (cle) => MOTEURS.find((engine) => engine.cle === cle)?.dit ?? cle;

// L'heure jusqu'à laquelle le moteur choisi est bloqué, dite courte, en anglais ; rien, d'une heure illisible.
/** @param {string | null} iso */
function heureDite(iso) {
  if (iso === null) return null;
  const instant = Date.parse(iso);
  if (Number.isNaN(instant)) return null;
  return new Date(instant).toLocaleString("en-US", { month: "short", day: "numeric", hour: "2-digit", minute: "2-digit" });
}

// La phrase de la carte quand la station cuit sur son secours : sur quoi, pourquoi, et jusqu'à quand — sans date lisible,
// la phrase s'arrête au plafond.
/** @param {Status} statut */
export function phraseDuSecours({ choisi, actif, jusqua }) {
  const quand = heureDite(jusqua);
  return `cooking on ${ditDe(actif)}: ${ditDe(choisi)}'s cap is reached${quand === null ? "" : ` until ${quand}`}`;
}

// L'état publié par le runtime, lu sans rien croire : un état mal formé, ou qui nomme un moteur inconnu, ne se lit pas.
/** @param {unknown} brut @returns {Status | undefined} */
export function statusLu(brut) {
  if (typeof brut !== "object" || brut === null || Array.isArray(brut)) return undefined;
  const { chosen, active, onFallback, blockedUntil } = /** @type {Record<string, unknown>} */ (brut);
  if (!estUnEngine(chosen) || !estUnEngine(active) || typeof onFallback !== "boolean") return undefined;
  return { choisi: chosen, actif: active, secours: onFallback, jusqua: typeof blockedUntil === "string" && blockedUntil !== "" ? blockedUntil : null };
}
