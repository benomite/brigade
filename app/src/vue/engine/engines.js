// @ts-check
// Les moteurs d'une station (ticket 3746, épique 3518) : ce sur quoi ses cooks tournent — l'abonnement Claude, par défaut,
// une clé d'API de Claude, ou Codex — et le moteur de secours, sur lequel ils passent quand le premier est à son plafond.
// Le contrat est celui des réglages de la station, `engine` et `fallbackEngine`, aux valeurs `claude-subscription`,
// `claude-api-key` et `codex`. Ce module tient leurs mots et lit l'état que le runtime publie d'une station (`facts`, son
// champ `engine`) : le moteur choisi, celui sur lequel elle cuit, si c'est le secours, et jusqu'à quand le choisi est bloqué.
// Il ne pose rien.

import { THIS_COMPUTER } from "../lexicon.js";

/** @typedef {"claude-subscription" | "claude-api-key" | "codex"} Engine */
/**
 * L'état du moteur d'une station, tel que le runtime le publie : `choisi` (son réglage `engine`), `actif` (celui sur lequel
 * ses cooks cuisent), `secours` (actif est le moteur de secours), `jusqua` (le choisi est bloqué jusqu'à cette heure, ISO).
 * @typedef {{ choisi: Engine, actif: Engine, secours: boolean, jusqua: string | null }} Status
 */

// Les trois moteurs, dans l'ordre où le chef les choisit : leur nom, et comment une phrase les dit.
export const ENGINES = /** @type {const} */ ([
  { cle: "claude-subscription", nom: "Claude subscription", dit: "the subscription" },
  { cle: "claude-api-key", nom: "Claude API key", dit: "the API key" },
  { cle: "codex", nom: "Codex", dit: "Codex" },
]);
// Sans réglage, la station cuit sur l'abonnement Claude.
/** @type {Engine} */
export const BY_DEFAULT = "claude-subscription";
// Le moteur qui demande une clé.
/** @type {Engine} */
export const A_KEY = "claude-api-key";

export const WORDS = {
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
  aideCle: `kept on ${THIS_COMPUTER} as a secret, readable only by your account; it is never shown again`,
  inconnu: (/** @type {string} */ raw) => `“${raw}” — an engine this app does not know`,
};

/** @param {unknown} key @returns {cle is Engine} */
export const isOneEngine = (key) => ENGINES.some((engine) => engine.cle === key);

/** @param {string} key */
export const nameOf = (key) => ENGINES.find((engine) => engine.cle === key)?.nom ?? key;

// Les moteurs que le secours peut prendre : les deux autres que le moteur choisi.
/** @param {string} engine */
export const fallbackPossible = (engine) => ENGINES.filter(({ cle: key }) => key !== engine);

/** @param {string} key */
const saysOf = (key) => ENGINES.find((engine) => engine.cle === key)?.dit ?? key;

// L'heure jusqu'à laquelle le moteur choisi est bloqué, dite courte, en anglais ; rien, d'une heure illisible.
/** @param {string | null} iso */
function hourSaid(iso) {
  if (iso === null) return null;
  const instant = Date.parse(iso);
  if (Number.isNaN(instant)) return null;
  return new Date(instant).toLocaleString("en-US", { month: "short", day: "numeric", hour: "2-digit", minute: "2-digit" });
}

// La phrase de la carte quand la station cuit sur son secours : sur quoi, pourquoi, et jusqu'à quand — sans date lisible,
// la phrase s'arrête au plafond.
/** @param {Status} statut */
export function sentenceOfFallback({ choisi: chosen, actif: active, jusqua: until }) {
  const when = hourSaid(until);
  return `cooking on ${saysOf(active)}: ${saysOf(chosen)}'s cap is reached${when === null ? "" : ` until ${when}`}`;
}

// L'état publié par le runtime, lu sans rien croire : un état mal formé, ou qui nomme un moteur inconnu, ne se lit pas.
/** @param {unknown} raw @returns {Status | undefined} */
export function statusRead(raw) {
  if (typeof raw !== "object" || raw === null || Array.isArray(raw)) return undefined;
  const { chosen, active, onFallback, blockedUntil } = /** @type {Record<string, unknown>} */ (raw);
  if (!isOneEngine(chosen) || !isOneEngine(active) || typeof onFallback !== "boolean") return undefined;
  return { choisi: chosen, actif: active, secours: onFallback, jusqua: typeof blockedUntil === "string" && blockedUntil !== "" ? blockedUntil : null };
}
