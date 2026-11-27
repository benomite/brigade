// @ts-check
// Les seuils de coût de la page des coûts (le ticket 912) — au niveau de l'app, et sur la page d'un projet (ticket 1022) : celui du ticket le plus cher (`seuil-ticket`) et celui des
// tokens perdus (`seuil-perdus`), tels que `station` les écrit sous « décisions du chef », sur la box de
// chaque projet : « seuil-ticket        800000 ». Un seuil que le chef n'a pas posé s'y lit « non posée — … » :
// il n'est pas communiqué, et rien n'est inventé à sa place — le bloc dit « not communicated » au lieu d'une alerte.
// Au-dessus du seuil, le bloc est mis en évidence et une ligne unique dit le geste ; en dessous, rien de plus.
// Ce module ne touche pas `document` : il reçoit de quoi créer un élément (bricks.js), et rend des éléments.

import { NOT_COMMUNICATED } from "./head.js";
import { button } from "../components/button/button.js";
import { lineEmpty } from "../components/line-empty/line-empty.js";

/** @typedef {import("../bricks.js").Fabrique} Fabrique */
/** @typedef {{ ticket: number | null, perdus: number | null }} Thresholds */

export const OPEN_THE_LIST = "open the list";
export const CLOSE_THE_LIST = "close the list";

const ACTION = /^\s+(seuil-ticket|seuil-perdus)\s+(\d[\d\s  .,]*)$/;

// Les deux seuils que `station` écrit, `null` quand l'un n'est pas posé (ou illisible). Le bloc s'arrête à
// la première ligne qui n'est plus en retrait.
/** @param {string} text @returns {Thresholds} */
export function thresholdsOf(text) {
  /** @type {Thresholds} */
  const thresholds = { ticket: null, perdus: null };
  const lines = text.split("\n");
  const start = lines.findIndex((line) => /^(décisions du chef|chef's decisions)/.test(line));
  if (start === -1) return thresholds;
  for (const line of lines.slice(start + 1)) {
    if (!/^\s/.test(line)) break;
    const readOne = ACTION.exec(line);
    if (readOne === null) continue;
    const value = Number(/** @type {string} */ (readOne[2]).replace(/\D/g, ""));
    if (value > 0) thresholds[readOne[1] === "seuil-ticket" ? "ticket" : "perdus"] = value;
  }
  return thresholds;
}

// Les seuils de chaque projet lu, par nom ; un projet non lu, ou dont la box ne dit rien, n'y est pas.
/** @param {{ nom: string }[]} projects @param {Map<string, import("./head.js").Reading>} readings @returns {Map<string, Thresholds>} */
export function thresholdsOfProjects(projects, readings) {
  /** @type {Map<string, Thresholds>} */
  const readOnes = new Map();
  for (const { nom: name } of projects) {
    const reading = readings.get(name);
    const station = reading !== undefined && "sorties" in reading ? reading.sorties.find(({ commande: command }) => command === "station") : undefined;
    if (station !== undefined) readOnes.set(name, thresholdsOf(station.texte));
  }
  return readOnes;
}

/** @param {number} value */
const count = (value) => value.toLocaleString("en-US");

// La ligne d'alerte, ou rien : `null` quand le bloc est sous son seuil. `depasse` : un projet au-dessus de
// son seuil (son nom, son seuil) ; `connu` : au moins un seuil est communiqué. Le geste est un bouton sur la
// ligne même : son libellé, et ce qu'il fait (`ouvrir` reçoit le bouton, que la fiche reprend au retour).
/** @param {Fabrique} doc @param {{ projet: string, seuil: number } | undefined} exceeds @param {boolean} knownOne
 *  @param {string} wording @param {(button: any) => void} open */
export function setAlert(doc, exceeds, knownOne, wording, open) {
  if (exceeds === undefined && knownOne) return null;
  if (exceeds === undefined) return lineEmpty(doc, `ceiling: ${NOT_COMMUNICATED}`, { classe: "alerte-cout sans" });
  const line = doc.createElement("p");
  line.className = "alerte-cout";
  line.role = "alert";
  line.textContent = `${exceeds.projet} · over its ceiling of ${count(exceeds.seuil)}`;
  const action = button(doc, wording, () => open(action));
  action.className = "alerte-geste";
  line.append(action);
  return line;
}
