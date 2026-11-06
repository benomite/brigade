// @ts-check
// L'étape « récap » du parcours d'ajout (ticket 2478, épique 2473), la dernière, après celle de la station : le projet
// avec sa station, et la phrase de ce qui se passe ensuite — la cuisine prend le premier ticket posé avec le label
// `fire`. Le parcours ne finit jamais sur une page de projet vide : sans station, l'étape le dit et propose de revenir
// à celle d'avant, un bouton ; avec elle, la suite est toujours écrite.
// Ce module ne touche pas `document` : il reçoit de quoi créer un élément (briques.js), et rend des éléments.

import { boutonAction } from "../briques.js";

/** @typedef {import("../briques.js").Fabrique} Fabrique */

export const TITRE = "Ready";
export const ATTENDU = "Your project is set up.";
export const PROJET = "project";
export const STATION = "station";
export const SANS_STATION = "No station cooks this project yet.";
export const CHOISIR_UNE_STATION = "choose a station";
// La suite, dite avec le label en code (accents graves, posés par `phrase`).
export const ENSUITE = "Next: the kitchen takes the first ticket you label `fire`.";

/** @param {Fabrique} doc @param {string} balise @param {string} [texte] */
function cree(doc, balise, texte) {
  const pose = doc.createElement(balise);
  if (texte !== undefined) pose.textContent = texte;
  return pose;
}

// Une phrase dont les mots entre accents graves — le label — sont posés en code.
/** @param {Fabrique} doc @param {string} texte */
function phrase(doc, texte) {
  const pose = cree(doc, "p");
  texte.split("`").forEach((morceau, rang) => {
    if (morceau === "") return;
    if (rang % 2 === 0) pose.append(morceau);
    else {
      const code = cree(doc, "code", morceau);
      code.className = "mono";
      pose.append(code);
    }
  });
  return pose;
}

// Une ligne « étiquette : valeur ».
/** @param {Fabrique} doc @param {string} etiquette @param {string} valeur @param {string} cle */
function ligne(doc, etiquette, valeur, cle) {
  const pose = cree(doc, "p");
  pose.className = "ligne-recap";
  pose.dataset.recap = cle;
  const nom = cree(doc, "span", etiquette);
  nom.className = "etiquette";
  const dit = cree(doc, "strong", valeur);
  dit.className = "valeur";
  pose.append(nom, dit);
  return pose;
}

// L'étape. `projet` : le projet qui vient d'être ajouté ; `station` : le nom de celle qui le cuit, absent tant qu'aucune
// ne l'a reçu ; `retour()` : revenir à l'étape de la station.
/**
 * @param {Fabrique} doc
 * @param {{ projet?: string, station?: string, retour?: () => void }} donnees
 */
export function poserEtapeRecap(doc, { projet, station, retour }) {
  const racine = cree(doc, "section");
  racine.className = "etape-recap";
  racine.ariaLabel = TITRE;
  const attendu = cree(doc, "p", ATTENDU);
  attendu.className = "attendu";
  racine.append(attendu);
  if (projet !== undefined) racine.append(ligne(doc, PROJET, projet, "projet"));
  if (projet === undefined || station === undefined || station.trim() === "") {
    const manque = cree(doc, "p", SANS_STATION);
    manque.className = "erreur";
    racine.append(manque, ...(retour === undefined ? [] : [boutonAction(doc, CHOISIR_UNE_STATION, retour, { recommande: true })]));
    return racine;
  }
  racine.append(ligne(doc, STATION, station, "station"), phrase(doc, ENSUITE));
  return racine;
}

// Le descripteur inscrit dans le registre du parcours (ETAPES, parcours.js) : `id`, `titre`, `faite`, `poser`. La dernière
// étape n'est jamais « faite » : le parcours finit dessus. Elle lit le dépôt retenu (`depot`) et la machine qui l'a reçu
// (`station`) dans l'état du parcours ; son geste : `retour()`, revenir à l'étape de la station. Sans dépôt ou sans station,
// elle le dit — jamais un écran vide.
export const etapeDuRecap = {
  id: "recap",
  titre: TITRE,
  faite: () => false,
  /** @param {Fabrique} doc @param {{ depot?: string, station?: string }} etat @param {{ retour?: () => void }} geste */
  poser: (doc, etat, geste) => [
    poserEtapeRecap(doc, {
      ...(etat.depot === undefined ? {} : { projet: etat.depot }),
      ...(etat.station === undefined ? {} : { station: etat.station }),
      ...(geste.retour === undefined ? {} : { retour: geste.retour }),
    }),
  ],
};
