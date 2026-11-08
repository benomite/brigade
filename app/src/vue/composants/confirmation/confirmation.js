// @ts-check
// La confirmation de l'app (ticket 2919, maquette `Components.dc.html` de docs/maquettes/app/) : un geste qui engage se
// confirme en ligne, directement sous le bouton qui l'a demandé — jamais dans une fenêtre. Ce que le geste fait, sa ligne
// de prix s'il coûte (une seule), les deux réponses. Sa peau est dans `confirmation.css`, à côté, qui ne nomme aucun écran :
// un écran ne pose que sa place. Les boutons sont ceux de la famille unique (composants/bouton).
// Ce module ne touche pas `document` : il reçoit de quoi créer un élément, la vue lui donne le sien et les tests un faux.

import { prixDit } from "../../briques.js";
import { bouton } from "../bouton/bouton.js";

/** @typedef {{ createElement(balise: string): any }} Fabrique */

// Une confirmation de geste : ce que le geste fait, sa ligne de prix s'il coûte — une seule —, et les deux réponses.
// Sans coût, aucune ligne de prix : pas de « gratuit », pas de ligne vide.
/** @param {Fabrique} doc @param {{ titre: string, prix?: number | string | null, oui: string, non: string }} confirmation @param {{ oui: () => void, non: () => void }} gestes */
export function confirmationDeGeste(doc, { titre, prix, oui, non }, gestes) {
  const racine = doc.createElement("section");
  racine.className = "confirmation";
  const entete = doc.createElement("p");
  entete.className = "titre";
  entete.textContent = titre;
  racine.append(entete);
  const cout = prixDit(prix);
  if (cout !== "") {
    const ligne = doc.createElement("p");
    ligne.className = "prix";
    ligne.textContent = cout.replace(/\s*\n\s*/g, " ");
    racine.append(ligne);
  }
  racine.append(bouton(doc, oui, gestes.oui, { sorte: "recommande" }), bouton(doc, non, gestes.non, { sorte: "discret" }));
  return racine;
}

// La confirmation que la vue compose elle-même — le prix chiffré par le process principal, un « oui » par choix avec ce qu'il
// engage — repose sur les mêmes pièces : l'enveloppe, et une rangée par réponse. Elles gardent la peau de `confirmation.css`.
/** @param {Fabrique} doc @param {string} [libelle] */
export function enveloppeDeConfirmation(doc, libelle) {
  const racine = doc.createElement("div");
  racine.className = "confirmation";
  racine.role = "group";
  if (libelle !== undefined) racine.ariaLabel = libelle;
  return racine;
}

// Une rangée de réponse : le bouton, et à côté ce qu'il engage (`aCote`) quand ce n'est pas dans son survol.
/** @param {Fabrique} doc @param {any[]} contenu */
export function rangeeDeReponse(doc, contenu) {
  const rangee = doc.createElement("p");
  rangee.className = "gestes";
  rangee.append(...contenu);
  return rangee;
}
