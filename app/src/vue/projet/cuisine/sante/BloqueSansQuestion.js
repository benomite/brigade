// @ts-check
// Les « blocked-on-human » sans question, sur Kitchen > Health (ticket 2557, épique 2553) : le nombre de tickets posés
// en attente du chef sans qu'une question lui soit posée — un défaut de la brigade, pas une information. Il vient du
// champ `blockedWithoutQuestion` du statut du projet (entier). À 0, le chiffre est neutre ; au-dessus, il est en alerte
// (`data-sans-question="alerte"`), rouge et dit en mots. Ce module ne touche pas `document` : il reçoit de quoi créer
// un élément (briques.js) et rend le bloc.

import { survol } from "../../../briques.js";

/** @typedef {import("../../../briques.js").Fabrique} Fabrique */

export const TITRE = "Blocked without a question";
export const AIDE = "Tickets set blocked-on-human with no question for the chef: the brigade should have decided, or asked. Each one is a defect to fix, not a step.";

/** @param {unknown} x @returns {x is number} */
const entier = (x) => typeof x === "number" && Number.isInteger(x) && x >= 0;

// Le bloc à poser sur Health. `data-sans-question` : « zero » (neutre), « alerte » (au moins un) ou « inconnu » (la
// station ne publie pas encore le champ : ce n'est pas un compte de zéro).
/** @param {Fabrique} doc @param {unknown} [valeur] */
export function poserBlocBloqueSansQuestion(doc, valeur) {
  const bloc = doc.createElement("section");
  bloc.className = "bloc-du-projet";
  bloc.dataset.bloc = "bloque-sans-question";
  bloc.ariaLabel = TITRE;
  const titre = doc.createElement("h3");
  titre.textContent = TITRE;
  titre.append(survol(doc, AIDE));
  const ligne = doc.createElement("p");
  ligne.className = "sans-question-ligne";
  bloc.append(titre, ligne);
  if (!entier(valeur)) {
    bloc.dataset.sansQuestion = "inconnu";
    ligne.className = "sans-question-ligne sans-question-inconnu";
    ligne.textContent = "Not available yet";
    ligne.append(survol(doc, "The project's station does not publish this count yet: this is not a count of zero"));
    return bloc;
  }
  const alerte = valeur > 0;
  bloc.dataset.sansQuestion = alerte ? "alerte" : "zero";
  const chiffre = doc.createElement("strong");
  chiffre.className = "sans-question-valeur";
  chiffre.textContent = String(valeur);
  const legende = doc.createElement("span");
  legende.className = "sans-question-legende";
  legende.textContent = alerte ? `ticket${valeur > 1 ? "s" : ""} blocked-on-human with no question — a defect to fix` : "none — every block asks the chef a question";
  if (alerte) ligne.role = "alert";
  ligne.append(chiffre, legende);
  return bloc;
}
