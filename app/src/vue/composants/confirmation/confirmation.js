// @ts-check
// La confirmation de l'app (ticket 2919, maquette `Components.dc.html` de docs/maquettes/app/) : un geste qui engage se
// confirme en ligne, directement sous le bouton qui l'a demandé — jamais dans une fenêtre. Ce que le geste fait, sa ligne
// de prix s'il coûte (une seule), les deux réponses. Sa peau est dans `confirmation.css`, à côté, qui ne nomme aucun écran :
// un écran ne pose que sa place. Les boutons sont ceux de la famille unique (composants/bouton).
// Ce module ne touche pas `document` : il reçoit de quoi créer un élément, la vue lui donne le sien et les tests un faux.

import { prixDit, survol } from "../../briques.js";
import { bouton } from "../bouton/bouton.js";

/** @typedef {{ createElement(balise: string): any }} Fabrique */

// Une confirmation de geste : ce que le geste fait, sa ligne de prix s'il coûte — une seule —, et les réponses. Sans coût,
// aucune ligne de prix : pas de « gratuit », pas de ligne vide. Deux formes, une seule pièce :
// - `oui` / `non` : un « oui » recommandé et un « non » discret (`gestes.oui`, `gestes.non`) ;
// - `choix` : un « oui » par choix, chacun avec ce qu'il engage (`dit`), puis `non` (`gestes.non`) ; `aCote` pose ce que
//   chaque réponse engage à côté de son bouton, sinon c'est dans le survol du bouton. `phrase` est un prix déjà dit
//   (`aide` au survol), à la place de `prix`.
/** @param {Fabrique} doc @param {{ titre: string, prix?: number | string | null, phrase?: string, aide?: string, oui?: string, non: string, choix?: { libelle: string, dit: string, partir: () => void }[], aCote?: boolean }} confirmation @param {{ oui?: () => void, non: () => void }} gestes */
export function confirmationDeGeste(doc, { titre, prix, phrase, aide = "", oui, non, choix, aCote = false }, gestes) {
  const racine = doc.createElement("section");
  racine.className = "confirmation";
  racine.ariaLabel = titre;
  const entete = doc.createElement("p");
  entete.className = "titre";
  entete.textContent = titre;
  racine.append(entete);
  const cout = phrase ?? prixDit(prix);
  if (cout !== "") {
    const ligne = doc.createElement("p");
    ligne.className = "prix";
    ligne.textContent = cout.replace(/\s*\n\s*/g, " ");
    if (aide !== "") ligne.append(survol(doc, aide));
    racine.append(ligne);
  }
  if (choix === undefined) {
    racine.append(bouton(doc, oui ?? "", gestes.oui ?? (() => {}), { sorte: "recommande" }), bouton(doc, non, gestes.non, { sorte: "discret" }));
    return racine;
  }
  /** @param {any} reponse @param {string} dit */
  const rangee = (reponse, dit) => {
    const ligne = doc.createElement("p");
    ligne.className = "gestes";
    if (aCote) {
      const engage = doc.createElement("span");
      engage.textContent = dit;
      ligne.append(reponse, engage);
    } else {
      reponse.title = dit;
      ligne.append(reponse);
    }
    return ligne;
  };
  for (const { libelle, dit, partir } of choix) {
    const reponse = bouton(doc, libelle, partir, { sorte: "recommande" });
    reponse.dataset.oui = "";
    racine.append(rangee(reponse, dit));
  }
  racine.append(rangee(bouton(doc, non, gestes.non, { sorte: "discret" }), "nothing goes"));
  return racine;
}
