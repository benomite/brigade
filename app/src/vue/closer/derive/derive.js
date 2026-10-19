// @ts-check
// Proposer un nettoyage quand la dérive franchit son seuil (le ticket 993, épique 986) : `closing --json`
// dit, dans `drift`, si une mesure du relevé a franchi le seuil que le chef lui a déclaré. Franchi, la
// place du lancement (closer/lancement/lancement.js) porte en tête une phrase qui le dit et un bouton qui
// y mène. Ce module ne lance rien et n'écrit aucune demande : son bouton appelle le geste du bouton de
// lancement — l'aperçu, puis la confirmation — et la demande ne part qu'au « oui » du chef. Il ne
// demande rien non plus à la lecture : la proposer, c'est la poser à l'écran, pas la faire.
// Ce module ne touche pas `document` : il reçoit de quoi créer un élément (briques.js).

import { survol } from "../../briques.js";

/** @typedef {import("../../briques.js").Fabrique} Fabrique */
/** @typedef {import("../lancement/lancement.js").Demande} Demande */
/** @typedef {import("../lancement/lancement.js").Etat} Etat */

/** @typedef {{ declared: boolean, crossed: boolean, crossings: { measure: string, observed: number, limit: number, text: string }[] }} Derive */

export const PROPOSITION = "The drift threshold is crossed — a cleanup could bring it back.";
export const PROPOSER = "Review the cleanup…";

/** @param {Fabrique} doc @param {string} balise @param {string} [texte] */
function cree(doc, balise, texte) {
  const pose = doc.createElement(balise);
  if (texte !== undefined) pose.textContent = texte;
  return pose;
}

// Ce que la lecture dit de la dérive : franchie, ou non. Un runtime qui ne la dit pas n'a rien franchi.
/** @param {unknown} fermeture @returns {Derive | undefined} */
export function lireDerive(fermeture) {
  if (fermeture === null || typeof fermeture !== "object") return undefined;
  const { drift } = /** @type {Record<string, any>} */ (fermeture);
  if (drift === null || typeof drift !== "object" || drift.crossed !== true) return undefined;
  const franchies = Array.isArray(drift.crossings) ? drift.crossings.filter((/** @type {any} */ f) => typeof f?.text === "string") : [];
  return { declared: drift.declared === true, crossed: true, crossings: franchies };
}

// La proposition se pose quand la dérive est franchie, qu'aucune demande n'attend ni ne court, et
// qu'aucun geste n'est en route : sinon la place dit déjà où l'on en est.
/** @param {Demande} demande @param {Etat} etat */
export function proposable(demande, etat) {
  if (demande.state === "waiting" || demande.state === "running") return false;
  return etat.etape === "repos" || etat.etape === "refus";
}

// La proposition : une phrase, ce qui a franchi son seuil au survol, et le bouton qui ouvre la même
// confirmation que le bouton de lancement. `lancer` est ce que ce bouton appelle.
/** @param {Fabrique} doc @param {Derive | undefined} derive @param {Demande} demande @param {Etat} etat @param {() => void} lancer @returns {any[]} */
export function poserDerive(doc, derive, demande, etat, lancer) {
  if (derive === undefined || !proposable(demande, etat)) return [];
  const bloc = cree(doc, "div");
  bloc.className = "closer-derive";
  const dit = cree(doc, "p", PROPOSITION);
  dit.className = "attendu";
  const bouton = cree(doc, "button", PROPOSER);
  bouton.type = "button";
  bouton.className = "proposer";
  bouton.addEventListener("click", lancer);
  const geste = cree(doc, "span");
  geste.className = "action";
  geste.append(bouton);
  const detail = derive.crossings.map(({ text }) => text).join(" · ");
  if (detail !== "") geste.append(survol(doc, detail));
  bloc.append(dit, geste);
  return [bloc];
}
