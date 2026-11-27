// @ts-check
// Le quota GitHub affiché du compte, en tête de l'onglet Stations (ticket 3483, épique 3475) : combien est utilisé sur
// combien, quand la fenêtre se renouvelle, et — d'un clic — ce qui l'use : les appels de la dernière heure, par station et
// par projet, du plus gros utilisateur au plus petit. Elle vire à l'orange quand le quota est près de manquer, avant toute
// pause : ni le jaune de la pause, ni le rouge d'une panne. `quotaGithub` vient des faits, que l'app lit de GitHub (quota-github.ts, #4645) :
// `{ limite: 'core' | 'ecriture', pauseJusqua, utilise, maximum, renouvellement, parStationEtProjet?: [{ station, projet, typeAppel, nombre }] }` —
// sans `parStationEtProjet`, rien ne dit qui l'use : la jauge n'a pas de détail.
// Rien n'y est cru sur parole : un compte qui ne se lit pas (maximum absent ou nul, utilisé illisible) se dit en une ligne, sans
// chiffre inventé. Ce module ne touche ni `document` ni le pont : la vue lui donne une fabrique (bricks.js).

import { folded } from "../bricks.js";
import { lineEmpty } from "../components/line-empty/line-empty.js";

/** @typedef {{ createElement(balise: string): any }} Fabrique */
/** @typedef {{ station: string, projet: string, typeAppel: string, nombre: number }} Call */
/** @typedef {{ limite: string, pauseJusqua?: string | null, utilise: number, maximum: number, renouvellement?: string | null, parStationEtProjet?: readonly Call[] }} QuotaGithub */

// Au-delà de cette part utilisée, l'affichage prévient.
export const THRESHOLD_OF_ALERT = 0.8;
export const TITLE = "GitHub quota";
export const WITHOUT_DATA = "No GitHub calls recorded over the last hour.";
export const UNREADABLE = "GitHub quota unreadable";
export const DETAIL = "Calls over the last hour";
export const DETAIL_RESUME = "per station and per project";
// Chaque limite en clair.
const LIMITS = /** @type {Record<string, string>} */ ({ core: "reads and writes", ecriture: "writes" });

const numberFinished = (/** @type {unknown} */ n) => typeof n === "number" && Number.isFinite(n);
// L'heure locale en 24 h, « 14:32 », comme `heureHM` (format.ts, que la vue ne charge pas : elle ne lit que des .js).
const hourHM = (/** @type {string} */ iso) => new Date(iso).toLocaleTimeString("en-GB", { hour: "2-digit", minute: "2-digit", hour12: false });
const instant = (/** @type {unknown} */ v) => (typeof v === "string" && !Number.isNaN(Date.parse(v)) ? v : undefined);

// Ce que le quota dit, d'après `quotaGithub` : la part utilisée (0 à 1), le ton, la ligne — ou rien qui se lise.
/** @param {QuotaGithub} quota */
export function readOfQuota(quota) {
  const { utilise, maximum } = quota;
  if (!numberFinished(utilise) || !numberFinished(maximum) || maximum <= 0 || utilise < 0) return { lisible: false };
  const part = Math.min(utilise / maximum, 1);
  const renewal = instant(quota.renouvellement);
  const what = Object.hasOwn(LIMITS, quota.limite) ? ` (${LIMITS[quota.limite]})` : "";
  return {
    lisible: true,
    part,
    ton: utilise / maximum >= THRESHOLD_OF_ALERT ? "alerte" : "normal",
    ligne: `${utilise} / ${maximum} calls used${what}`,
    renouvellement: renewal === undefined ? "renewal time unknown" : `renews around ${hourHM(renewal)}`,
  };
}

// Les appels de la dernière heure, du plus gros utilisateur au plus petit — les lignes qui ne se lisent pas sont omises.
/** @param {readonly Call[]} calls */
export function linesOfTheUsage(calls) {
  return calls
    .filter((a) => typeof a === "object" && a !== null && numberFinished(a.nombre) && a.nombre > 0 && typeof a.station === "string" && typeof a.projet === "string")
    .toSorted((a, b) => b.nombre - a.nombre)
    .map((a) => `${a.station}, ${a.projet}: ${a.nombre} ${a.typeAppel}`);
}

/** @param {Fabrique} doc @param {string} balise @param {string} [text] */
function created(doc, balise, text) {
  const pose = doc.createElement(balise);
  if (text !== undefined) pose.textContent = text;
  return pose;
}

// Le détail que le chef a ouvert reste ouvert d'une lecture à l'autre : l'onglet se repose à chaque lecture.
let detailOpen = false;

// La affiche, et son détail replié.
/** @param {Fabrique} doc @param {QuotaGithub} quota */
export function setTheQuota(doc, quota) {
  const root = created(doc, "section");
  root.className = "quota-github";
  root.ariaLabel = TITLE;
  const shows = readOfQuota(quota);
  if (!shows.lisible) {
    root.dataset.ton = "illisible";
    root.append(lineEmpty(doc, UNREADABLE, { classe: "quota-illisible" }));
    return root;
  }
  root.dataset.ton = shows.ton;
  const head = created(doc, "p");
  head.className = "quota-ligne";
  head.append(created(doc, "strong", TITLE), created(doc, "span", `${shows.ligne} — ${shows.renouvellement}`));
  const bar = created(doc, "div");
  bar.className = "quota-barre";
  bar.role = "meter";
  bar.ariaLabel = `${quota.utilise} of ${quota.maximum} GitHub calls used`;
  const filled = created(doc, "div");
  filled.className = "quota-rempli";
  filled.style.setProperty("--part", `${Math.round((shows.part ?? 0) * 100)}%`);
  bar.append(filled);
  root.append(head, bar);
  if (quota.parStationEtProjet === undefined) return root;
  const lines = linesOfTheUsage(Array.isArray(quota.parStationEtProjet) ? quota.parStationEtProjet : []);
  const content = created(doc, "div");
  content.className = "quota-usage";
  if (lines.length === 0) content.append(lineEmpty(doc, WITHOUT_DATA, { classe: "quota-sans-donnees" }));
  else {
    const list = created(doc, "ul");
    for (const line of lines) list.append(created(doc, "li", line));
    content.append(list);
  }
  root.append(folded(doc, { titre: DETAIL, resume: DETAIL_RESUME, ouvert: detailOpen, basculer: (opened) => void (detailOpen = opened) }, [content]));
  return root;
}
