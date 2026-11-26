// @ts-check
// Le quota GitHub affiché du compte, en tête de l'onglet Stations (ticket 3483, épique 3475) : combien est utilisé sur
// combien, quand la fenêtre se renouvelle, et — d'un clic — ce qui l'use : les appels de la dernière heure, par station et
// par projet, du plus gros utilisateur au plus petit. Elle vire à l'orange quand le quota est près de manquer, avant toute
// pause : ni le jaune de la pause, ni le rouge d'une panne. `quotaGithub` vient des faits (runtime) :
// `{ limite: 'core' | 'ecriture', pauseJusqua, utilise, maximum, renouvellement, parStationEtProjet: [{ station, projet, typeAppel, nombre }] }`.
// Rien n'y est cru sur parole : un compte qui ne se lit pas (maximum absent ou nul, utilisé illisible) se dit en une ligne, sans
// chiffre inventé. Ce module ne touche ni `document` ni le pont : la vue lui donne une fabrique (briques.js).

import { replie } from "../briques.js";
import { lineEmpty } from "../composants/line-empty/line-empty.js";

/** @typedef {{ createElement(balise: string): any }} Fabrique */
/** @typedef {{ station: string, projet: string, typeAppel: string, nombre: number }} Call */
/** @typedef {{ limite: string, pauseJusqua?: string | null, utilise: number, maximum: number, renouvellement?: string | null, parStationEtProjet: readonly Call[] }} QuotaGithub */

// Au-delà de cette part utilisée, l'affichage prévient.
export const THRESHOLD_D_ALERT = 0.8;
export const TITRE = "GitHub quota";
export const SANS_DONNEES = "No GitHub calls recorded over the last hour.";
export const ILLISIBLE = "GitHub quota unreadable";
export const DETAIL = "Calls over the last hour";
export const DETAIL_RESUME = "per station and per project";
// Chaque limite en clair.
const LIMITES = /** @type {Record<string, string>} */ ({ core: "reads and writes", ecriture: "writes" });

const nombreFini = (/** @type {unknown} */ n) => typeof n === "number" && Number.isFinite(n);
// L'heure locale en 24 h, « 14:32 », comme `heureHM` (format.ts, que la vue ne charge pas : elle ne lit que des .js).
const heureHM = (/** @type {string} */ iso) => new Date(iso).toLocaleTimeString("en-GB", { hour: "2-digit", minute: "2-digit", hour12: false });
const instant = (/** @type {unknown} */ v) => (typeof v === "string" && !Number.isNaN(Date.parse(v)) ? v : undefined);

// Ce que le quota dit, d'après `quotaGithub` : la part utilisée (0 à 1), le ton, la ligne — ou rien qui se lise.
/** @param {QuotaGithub} quota */
export function readDuQuota(quota) {
  const { utilise, maximum } = quota;
  if (!nombreFini(utilise) || !nombreFini(maximum) || maximum <= 0 || utilise < 0) return { lisible: false };
  const part = Math.min(utilise / maximum, 1);
  const renouvellement = instant(quota.renouvellement);
  const quoi = Object.hasOwn(LIMITES, quota.limite) ? ` (${LIMITES[quota.limite]})` : "";
  return {
    lisible: true,
    part,
    ton: utilise / maximum >= THRESHOLD_D_ALERT ? "alerte" : "normal",
    ligne: `${utilise} / ${maximum} calls used${quoi}`,
    renouvellement: renouvellement === undefined ? "renewal time unknown" : `renews around ${heureHM(renouvellement)}`,
  };
}

// Les appels de la dernière heure, du plus gros utilisateur au plus petit — les lignes qui ne se lisent pas sont omises.
/** @param {readonly Call[]} calls */
export function linesDeLUsage(calls) {
  return calls
    .filter((a) => typeof a === "object" && a !== null && nombreFini(a.nombre) && a.nombre > 0 && typeof a.station === "string" && typeof a.projet === "string")
    .toSorted((a, b) => b.nombre - a.nombre)
    .map((a) => `${a.station}, ${a.projet}: ${a.nombre} ${a.typeAppel}`);
}

/** @param {Fabrique} doc @param {string} balise @param {string} [texte] */
function cree(doc, balise, texte) {
  const pose = doc.createElement(balise);
  if (texte !== undefined) pose.textContent = texte;
  return pose;
}

// Le détail que le chef a ouvert reste ouvert d'une lecture à l'autre : l'onglet se repose à chaque lecture.
let detailOuvert = false;

// La affiche, et son détail replié.
/** @param {Fabrique} doc @param {QuotaGithub} quota */
export function poserLeQuota(doc, quota) {
  const racine = cree(doc, "section");
  racine.className = "quota-github";
  racine.ariaLabel = TITRE;
  const affiche = readDuQuota(quota);
  if (!affiche.lisible) {
    racine.dataset.ton = "illisible";
    racine.append(lineEmpty(doc, ILLISIBLE, { classe: "quota-illisible" }));
    return racine;
  }
  racine.dataset.ton = affiche.ton;
  const tete = cree(doc, "p");
  tete.className = "quota-ligne";
  tete.append(cree(doc, "strong", TITRE), cree(doc, "span", `${affiche.ligne} — ${affiche.renouvellement}`));
  const bar = cree(doc, "div");
  bar.className = "quota-barre";
  bar.role = "meter";
  bar.ariaLabel = `${quota.utilise} of ${quota.maximum} GitHub calls used`;
  const rempli = cree(doc, "div");
  rempli.className = "quota-rempli";
  rempli.style.setProperty("--part", `${Math.round((affiche.part ?? 0) * 100)}%`);
  bar.append(rempli);
  const lines = linesDeLUsage(Array.isArray(quota.parStationEtProjet) ? quota.parStationEtProjet : []);
  const contenu = cree(doc, "div");
  contenu.className = "quota-usage";
  if (lines.length === 0) contenu.append(lineEmpty(doc, SANS_DONNEES, { classe: "quota-sans-donnees" }));
  else {
    const liste = cree(doc, "ul");
    for (const line of lines) liste.append(cree(doc, "li", line));
    contenu.append(liste);
  }
  racine.append(tete, bar, replie(doc, { titre: DETAIL, resume: DETAIL_RESUME, ouvert: detailOuvert, basculer: (ouvert) => void (detailOuvert = ouvert) }, [contenu]));
  return racine;
}
