// @ts-check
// La confirmation de l'app (ticket 2919, maquette `Components.dc.html` de docs/maquettes/app/) : un geste qui engage se
// confirme en ligne, directement sous le bouton qui l'a demandé — jamais dans une fenêtre. Ce que le geste fait, sa ligne
// de prix s'il coûte (une seule), les deux réponses. Sa peau est dans `confirmation.css`, à côté, qui ne nomme aucun écran :
// un écran ne pose que sa place. Les boutons sont ceux de la famille unique (composants/button).
// Ce module ne touche pas `document` : il reçoit de quoi créer un élément, la vue lui donne le sien et les tests un faux.

import { prixDit, survol } from "../../briques.js";
import { button } from "../button/button.js";

/** @typedef {{ createElement(balise: string): any }} Fabrique */

// Une confirmation de geste : ce que le geste fait, sa ligne de prix s'il coûte — une seule —, et les réponses. Sans coût,
// aucune ligne de prix : pas de « gratuit », pas de ligne vide. Deux formes, une seule pièce :
// - `oui` / `non` : un « oui » recommandé et un « non » discret (`gestes.oui`, `gestes.non`) ;
// - `choix` : un « oui » par choix, chacun avec ce qu'il engage (`dit`), puis `non` (`gestes.non`) ; `aCote` pose ce que
//   chaque réponse engage à côté de son bouton, sinon c'est dans le survol du bouton. `phrase` est un prix déjà dit
//   (`aide` au survol), à la place de `prix`.
/** @param {Fabrique} doc @param {{ titre: string, prix?: number | string | null, phrase?: string, aide?: string, oui?: string, non: string, choix?: { libelle: string, dit: string, partir: () => void }[], aCote?: boolean }} confirmation @param {{ oui?: () => void, non: () => void }} actions */
export function confirmationDeAction(doc, { titre, prix, phrase, aide = "", oui, non, choix: choice, aCote: aSide = false }, actions) {
  const racine = doc.createElement("section");
  racine.className = "confirmation";
  racine.ariaLabel = titre;
  const entete = doc.createElement("p");
  entete.className = "titre";
  entete.textContent = titre;
  racine.append(entete);
  const cost = phrase ?? prixDit(prix);
  if (cost !== "") {
    const line = doc.createElement("p");
    line.className = "prix";
    line.textContent = cost.replace(/\s*\n\s*/g, " ");
    if (aide !== "") line.append(survol(doc, aide));
    racine.append(line);
  }
  if (choice === undefined) {
    racine.append(button(doc, oui ?? "", actions.oui ?? (() => {}), { sorte: "recommande" }), button(doc, non, actions.non, { sorte: "discret" }));
    return racine;
  }
  /** @param {any} answer @param {string} dit */
  const rangee = (answer, dit) => {
    const line = doc.createElement("p");
    line.className = "gestes";
    if (aSide) {
      const engage = doc.createElement("span");
      engage.textContent = dit;
      line.append(answer, engage);
    } else {
      answer.title = dit;
      line.append(answer);
    }
    return line;
  };
  for (const { libelle, dit, partir } of choice) {
    const answer = button(doc, libelle, partir, { sorte: "recommande" });
    answer.dataset.oui = "";
    racine.append(rangee(answer, dit));
  }
  racine.append(rangee(button(doc, non, actions.non, { sorte: "discret" }), "nothing goes"));
  return racine;
}
