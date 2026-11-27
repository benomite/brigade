// @ts-check
// La confirmation de l'app (ticket 2919, maquette `Components.dc.html` de docs/maquettes/app/) : un geste qui engage se
// confirme en ligne, directement sous le bouton qui l'a demandé — jamais dans une fenêtre. Ce que le geste fait, sa ligne
// de prix s'il coûte (une seule), les deux réponses. Sa peau est dans `confirmation.css`, à côté, qui ne nomme aucun écran :
// un écran ne pose que sa place. Les boutons sont ceux de la famille unique (components/button).
// Ce module ne touche pas `document` : il reçoit de quoi créer un élément, la vue lui donne le sien et les tests un faux.

import { priceSays, hover } from "../../bricks.js";
import { button } from "../button/button.js";

/** @typedef {{ createElement(balise: string): any }} Fabrique */

// Une confirmation de geste : ce que le geste fait, sa ligne de prix s'il coûte — une seule —, et les réponses. Sans coût,
// aucune ligne de prix : pas de « gratuit », pas de ligne vide. Deux formes, une seule pièce :
// - `oui` / `non` : un « oui » recommandé et un « non » discret (`gestes.oui`, `gestes.non`) ;
// - `choix` : un « oui » par choix, chacun avec ce qu'il engage (`dit`), puis `non` (`gestes.non`) ; `aCote` pose ce que
//   chaque réponse engage à côté de son bouton, sinon c'est dans le survol du bouton. `phrase` est un prix déjà dit
//   (`aide` au survol), à la place de `prix`.
/** @param {Fabrique} doc @param {{ titre: string, prix?: number | string | null, phrase?: string, aide?: string, oui?: string, non: string, choix?: { libelle: string, dit: string, partir: () => void }[], aCote?: boolean }} confirmation @param {{ oui?: () => void, non: () => void }} actions */
export function confirmationOfAction(doc, { titre: title, prix: price, phrase: sentence, aide: help = "", oui: yes, non: not, choix: choice, aCote: aSide = false }, actions) {
  const root = doc.createElement("section");
  root.className = "confirmation";
  root.ariaLabel = title;
  const header = doc.createElement("p");
  header.className = "titre";
  header.textContent = title;
  root.append(header);
  const cost = sentence ?? priceSays(price);
  if (cost !== "") {
    const line = doc.createElement("p");
    line.className = "prix";
    line.textContent = cost.replace(/\s*\n\s*/g, " ");
    if (help !== "") line.append(hover(doc, help));
    root.append(line);
  }
  if (choice === undefined) {
    root.append(button(doc, yes ?? "", actions.oui ?? (() => {}), { sorte: "recommande" }), button(doc, not, actions.non, { sorte: "discret" }));
    return root;
  }
  /** @param {any} answer @param {string} said */
  const row = (answer, said) => {
    const line = doc.createElement("p");
    line.className = "gestes";
    if (aSide) {
      const engaged = doc.createElement("span");
      engaged.textContent = said;
      line.append(answer, engaged);
    } else {
      answer.title = said;
      line.append(answer);
    }
    return line;
  };
  for (const { libelle: wording, dit: said, partir: leave } of choice) {
    const answer = button(doc, wording, leave, { sorte: "recommande" });
    answer.dataset.oui = "";
    root.append(row(answer, said));
  }
  root.append(row(button(doc, not, actions.non, { sorte: "discret" }), "nothing goes"));
  return root;
}
