// @ts-check
// Le moteur sur la carte d'une station, dans l'onglet Stations (ticket 3746, épique 3518) : une ligne qui dit le moteur
// choisi — « engine: Claude subscription » — et, quand ses cooks cuisent sur le moteur de secours, une seconde, en jaune,
// qui dit sur lequel, pourquoi et jusqu'à quand (« cooking on the API key: the subscription's cap is reached until … »).
// Le moteur choisi vient de l'état que le runtime publie de la station (engines.js, `statutLu`) ; à défaut, pour la station
// de cet ordinateur, de son réglage. Rien de lu : la carte ne dit aucun moteur — elle n'en invente pas.
// Ce module ne touche pas `document` : il reçoit de quoi créer un élément.

import { brand } from "../components/pill/pill.js";
import { WORDS, nameOf, sentenceOfFallback } from "./engines.js";

/** @typedef {import("../bricks.js").Fabrique} Fabrique */
/** @typedef {import("./engines.js").Status} Status */
/** Ce que la carte sait du moteur : l'état publié (`statut`), sinon le moteur choisi en réglage (`choisi`). @typedef {{ statut?: Status, choisi?: string }} EngineKnown */

/** @param {Fabrique} doc @param {string} balise @param {string} text @param {string} [classe] */
function withIt(doc, balise, text, classe) {
  const pose = doc.createElement(balise);
  pose.textContent = text;
  if (classe !== undefined) pose.className = classe;
  return pose;
}

// Les lignes du moteur d'une station : aucune quand rien n'en est connu.
/** @param {Fabrique} doc @param {EngineKnown | undefined} knownOne @returns {any[]} */
export function linesOfEngine(doc, knownOne) {
  const chosen = knownOne?.statut?.choisi ?? knownOne?.choisi;
  if (chosen === undefined) return [];
  const line = doc.createElement("p");
  line.className = "moteur-de-la-carte";
  line.append(withIt(doc, "span", `${WORDS.moteur}: `), withIt(doc, "strong", nameOf(chosen)));
  const status = knownOne?.statut;
  if (status === undefined || !status.secours) return [line];
  const fallback = doc.createElement("p");
  fallback.className = "moteur-en-secours";
  fallback.dataset.ton = "jaune";
  fallback.append(brand(doc, "jaune"), withIt(doc, "span", sentenceOfFallback(status)));
  return [line, fallback];
}
