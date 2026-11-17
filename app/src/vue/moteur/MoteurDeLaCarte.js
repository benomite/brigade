// @ts-check
// Le moteur sur la carte d'une station, dans l'onglet Stations (ticket 3746, épique 3518) : une ligne qui dit le moteur
// choisi — « engine: Claude subscription » — et, quand ses cooks cuisent sur le moteur de secours, une seconde, en jaune,
// qui dit sur lequel, pourquoi et jusqu'à quand (« cooking on the API key: the subscription's cap is reached until … »).
// Le moteur choisi vient de l'état que le runtime publie de la station (moteurs.js, `statutLu`) ; à défaut, pour la station
// de cet ordinateur, de son réglage. Rien de lu : la carte ne dit aucun moteur — elle n'en invente pas.
// Ce module ne touche pas `document` : il reçoit de quoi créer un élément.

import { marque } from "../composants/pastille/pastille.js";
import { MOTS, nomDe, phraseDuSecours } from "./moteurs.js";

/** @typedef {import("../briques.js").Fabrique} Fabrique */
/** @typedef {import("./moteurs.js").Statut} Statut */
/** Ce que la carte sait du moteur : l'état publié (`statut`), sinon le moteur choisi en réglage (`choisi`). @typedef {{ statut?: Statut, choisi?: string }} MoteurConnu */

/** @param {Fabrique} doc @param {string} balise @param {string} texte @param {string} [classe] */
function avec(doc, balise, texte, classe) {
  const pose = doc.createElement(balise);
  pose.textContent = texte;
  if (classe !== undefined) pose.className = classe;
  return pose;
}

// Les lignes du moteur d'une station : aucune quand rien n'en est connu.
/** @param {Fabrique} doc @param {MoteurConnu | undefined} connu @returns {any[]} */
export function lignesDuMoteur(doc, connu) {
  const choisi = connu?.statut?.choisi ?? connu?.choisi;
  if (choisi === undefined) return [];
  const ligne = doc.createElement("p");
  ligne.className = "moteur-de-la-carte";
  ligne.append(avec(doc, "span", `${MOTS.moteur}: `), avec(doc, "strong", nomDe(choisi)));
  const statut = connu?.statut;
  if (statut === undefined || !statut.secours) return [ligne];
  const secours = doc.createElement("p");
  secours.className = "moteur-en-secours";
  secours.dataset.ton = "jaune";
  secours.append(marque(doc, "jaune"), avec(doc, "span", phraseDuSecours(statut)));
  return [ligne, secours];
}
