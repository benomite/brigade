// @ts-check
// Les seuils de coût de l'onglet Cost (le ticket 912) : celui du ticket le plus cher (`seuil-ticket`) et celui des
// tokens perdus (`seuil-perdus`), tels que `station` les écrit sous « décisions du chef », sur la box de
// chaque projet : « seuil-ticket        800000 ». Un seuil que le chef n'a pas posé s'y lit « non posée — … » :
// il n'est pas communiqué, et rien n'est inventé à sa place — le bloc dit « not communicated » au lieu d'une alerte.
// Au-dessus du seuil, le bloc est mis en évidence et une ligne unique dit le geste ; en dessous, rien de plus.
// Ce module ne touche pas `document` : il reçoit de quoi créer un élément (briques.js), et rend des éléments.

import { NON_COMMUNIQUE } from "./tete.js";

/** @typedef {import("../briques.js").Fabrique} Fabrique */
/** @typedef {{ ticket: number | null, perdus: number | null }} Seuils */

export const OUVRIR_LA_LISTE = "open the list";
export const FERMER_LA_LISTE = "close the list";

const GESTE = /^\s+(seuil-ticket|seuil-perdus)\s+(\d[\d\s  .,]*)$/;

// Les deux seuils que `station` écrit, `null` quand l'un n'est pas posé (ou illisible). Le bloc s'arrête à
// la première ligne qui n'est plus en retrait.
/** @param {string} texte @returns {Seuils} */
export function seuilsDe(texte) {
  /** @type {Seuils} */
  const seuils = { ticket: null, perdus: null };
  const lignes = texte.split("\n");
  const debut = lignes.findIndex((ligne) => /^(décisions du chef|chef's decisions)/.test(ligne));
  if (debut === -1) return seuils;
  for (const ligne of lignes.slice(debut + 1)) {
    if (!/^\s/.test(ligne)) break;
    const lu = GESTE.exec(ligne);
    if (lu === null) continue;
    const valeur = Number(/** @type {string} */ (lu[2]).replace(/\D/g, ""));
    if (valeur > 0) seuils[lu[1] === "seuil-ticket" ? "ticket" : "perdus"] = valeur;
  }
  return seuils;
}

// Les seuils de chaque projet lu, par nom ; un projet non lu, ou dont la box ne dit rien, n'y est pas.
/** @param {{ nom: string }[]} projets @param {Map<string, import("./tete.js").Lecture>} lectures @returns {Map<string, Seuils>} */
export function seuilsDesProjets(projets, lectures) {
  /** @type {Map<string, Seuils>} */
  const lus = new Map();
  for (const { nom } of projets) {
    const lecture = lectures.get(nom);
    const station = lecture !== undefined && "sorties" in lecture ? lecture.sorties.find(({ commande }) => commande === "station") : undefined;
    if (station !== undefined) lus.set(nom, seuilsDe(station.texte));
  }
  return lus;
}

/** @param {number} valeur */
const nombre = (valeur) => valeur.toLocaleString("en-US");

// La ligne d'alerte, ou rien : `null` quand le bloc est sous son seuil. `depasse` : un projet au-dessus de
// son seuil (son nom, son seuil) ; `connu` : au moins un seuil est communiqué. Le geste est un bouton sur la
// ligne même : son libellé, et ce qu'il fait (`ouvrir` reçoit le bouton, que la fiche reprend au retour).
/** @param {Fabrique} doc @param {{ projet: string, seuil: number } | undefined} depasse @param {boolean} connu
 *  @param {string} libelle @param {(bouton: any) => void} ouvrir */
export function poserAlerte(doc, depasse, connu, libelle, ouvrir) {
  if (depasse === undefined && connu) return null;
  const ligne = doc.createElement("p");
  if (depasse === undefined) {
    ligne.className = "alerte-cout sans";
    ligne.textContent = `ceiling: ${NON_COMMUNIQUE}`;
    return ligne;
  }
  ligne.className = "alerte-cout";
  ligne.role = "alert";
  ligne.textContent = `${depasse.projet} · over its ceiling of ${nombre(depasse.seuil)}`;
  const geste = doc.createElement("button");
  geste.className = "alerte-geste";
  geste.textContent = libelle;
  geste.addEventListener("click", () => ouvrir(geste));
  ligne.append(geste);
  return ligne;
}
