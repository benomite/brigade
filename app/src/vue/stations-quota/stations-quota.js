// @ts-check
// La jauge du quota GitHub du compte, en tête de l'onglet Stations (ticket 3483, épique 3475) : combien est utilisé sur
// combien, quand la fenêtre se renouvelle, et — d'un clic — ce qui l'use : les appels de la dernière heure, par station et
// par projet, du plus gros utilisateur au plus petit. Elle vire à l'orange quand le quota est près de manquer, avant toute
// pause : ni le jaune de la pause, ni le rouge d'une panne. `quotaGithub` vient des faits (runtime) :
// `{ limite: 'core' | 'ecriture', pauseJusqua, utilise, maximum, renouvellement, parStationEtProjet: [{ station, projet, typeAppel, nombre }] }`.
// Rien n'y est cru sur parole : un compte qui ne se lit pas (maximum absent ou nul, utilisé illisible) se dit en une ligne, sans
// chiffre inventé. Ce module ne touche ni `document` ni le pont : la vue lui donne une fabrique (briques.js).

import { replie } from "../briques.js";
import { ligneVide } from "../composants/ligne-vide/ligne-vide.js";

/** @typedef {{ createElement(balise: string): any }} Fabrique */
/** @typedef {{ station: string, projet: string, typeAppel: string, nombre: number }} Appel */
/** @typedef {{ limite: string, pauseJusqua?: string | null, utilise: number, maximum: number, renouvellement?: string | null, parStationEtProjet: readonly Appel[] }} QuotaGithub */

// Au-delà de cette part utilisée, la jauge prévient.
export const SEUIL_D_ALERTE = 0.8;
export const TITRE = "GitHub quota";
export const SANS_DONNEES = "No GitHub calls recorded over the last hour.";
export const ILLISIBLE = "GitHub quota unavailable";
export const DETAIL = "Calls over the last hour";
export const DETAIL_RESUME = "per station and per project";
// Chaque limite en clair.
const LIMITES = /** @type {Record<string, string>} */ ({ core: "reads and writes", ecriture: "writes" });

const nombreFini = (/** @type {unknown} */ n) => typeof n === "number" && Number.isFinite(n);
// L'heure locale en 24 h, « 14:32 », comme `heureHM` (format.ts, que la vue ne charge pas : elle ne lit que des .js).
const heureHM = (/** @type {string} */ iso) => new Date(iso).toLocaleTimeString("en-GB", { hour: "2-digit", minute: "2-digit", hour12: false });
const instant = (/** @type {unknown} */ v) => (typeof v === "string" && !Number.isNaN(Date.parse(v)) ? v : undefined);

// Ce que la jauge dit, d'après `quotaGithub` : la part utilisée (0 à 1), le ton, la ligne — ou rien qui se lise.
/** @param {QuotaGithub} quota */
export function jaugeDe(quota) {
  const { utilise, maximum } = quota;
  if (!nombreFini(utilise) || !nombreFini(maximum) || maximum <= 0 || utilise < 0) return { lisible: false };
  const part = Math.min(utilise / maximum, 1);
  const renouvellement = instant(quota.renouvellement);
  const quoi = Object.hasOwn(LIMITES, quota.limite) ? ` (${LIMITES[quota.limite]})` : "";
  return {
    lisible: true,
    part,
    ton: utilise / maximum >= SEUIL_D_ALERTE ? "alerte" : "normal",
    ligne: `${utilise} / ${maximum} calls used${quoi}`,
    renouvellement: renouvellement === undefined ? "renewal time unknown" : `renews around ${heureHM(renouvellement)}`,
  };
}

// Les appels de la dernière heure, du plus gros utilisateur au plus petit — les lignes qui ne se lisent pas sont omises.
/** @param {readonly Appel[]} appels */
export function lignesDeLUsage(appels) {
  return appels
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

// La jauge, et son détail replié.
/** @param {Fabrique} doc @param {QuotaGithub} quota */
export function poserLaJauge(doc, quota) {
  const racine = cree(doc, "section");
  racine.className = "jauge-du-quota";
  racine.ariaLabel = TITRE;
  const jauge = jaugeDe(quota);
  if (!jauge.lisible) {
    racine.dataset.ton = "illisible";
    racine.append(ligneVide(doc, ILLISIBLE, { classe: "quota-illisible" }));
    return racine;
  }
  racine.dataset.ton = jauge.ton;
  const tete = cree(doc, "p");
  tete.className = "quota-ligne";
  tete.append(cree(doc, "strong", TITRE), cree(doc, "span", `${jauge.ligne} — ${jauge.renouvellement}`));
  const barre = cree(doc, "div");
  barre.className = "quota-barre";
  barre.role = "meter";
  barre.ariaLabel = `${quota.utilise} of ${quota.maximum} GitHub calls used`;
  const rempli = cree(doc, "div");
  rempli.className = "quota-rempli";
  rempli.style.setProperty("--part", `${Math.round((jauge.part ?? 0) * 100)}%`);
  barre.append(rempli);
  const lignes = lignesDeLUsage(Array.isArray(quota.parStationEtProjet) ? quota.parStationEtProjet : []);
  const contenu = cree(doc, "div");
  contenu.className = "quota-usage";
  if (lignes.length === 0) contenu.append(ligneVide(doc, SANS_DONNEES, { classe: "quota-sans-donnees" }));
  else {
    const liste = cree(doc, "ul");
    for (const ligne of lignes) liste.append(cree(doc, "li", ligne));
    contenu.append(liste);
  }
  racine.append(tete, barre, replie(doc, { titre: DETAIL, resume: DETAIL_RESUME, ouvert: detailOuvert, basculer: (ouvert) => void (detailOuvert = ouvert) }, [contenu]));
  return racine;
}
