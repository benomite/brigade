// @ts-check
// Le geste d'une carte de TODO (ticket 3132, épique 3128) : quand la carte demande au chef un geste à faire lui-même
// (« Gesture for the chef: From a machine with GitHub access, run: gh issue create … »), il se lit en entier — il passe
// à la ligne, jamais coupé — et un bouton « copy » met la commande exacte dans le presse-papiers. Une carte sans geste
// n'a ni ce bloc ni ce bouton. Ce module ne touche pas `document` : il reçoit de quoi créer un élément et de quoi copier.

import { button } from "../composants/button/button.js";

/** @typedef {{ createElement(balise: string): any }} Fabrique */

export const MARQUE = "Gesture for the chef:";
export const COPIER = "copy";
export const COPIE = "copied";
export const COPIE_ECHOUEE = "copy failed";

// Ce que la question d'une carte dit du geste : le texte dit avant la commande, et la commande — ce qui suit « run: » ;
// sans « run: », tout le geste est la commande. Nul quand la question n'est pas un geste du chef.
/** @param {string | null} question @returns {{ avant: string, commande: string } | null} */
export function actionDeLaQuestion(question) {
  if (question === null || !question.startsWith(MARQUE)) return null;
  const action = question.slice(MARQUE.length).trim();
  if (action === "") return null;
  const coupe = /\brun:\s*(\S[\s\S]*)$/.exec(action);
  if (coupe === null) return { avant: "", commande: action };
  return { avant: action.slice(0, coupe.index).trim(), commande: (coupe[1] ?? "").trim() };
}

// Le bloc : le libellé, ce qui précède la commande, la commande entière dans un cadre qui passe à la ligne, et son
// bouton. `copier` rend une promesse : le bouton dit « copied » quand elle tient, « copy failed » (la raison au survol) sinon.
/** @param {Fabrique} doc @param {{ avant: string, commande: string }} geste @param {(texte: string) => Promise<unknown> | undefined} copier */
export function blocDuAction(doc, { avant, commande: command }, copier) {
  const bloc = doc.createElement("div");
  bloc.className = "geste-carte";
  const libelle = doc.createElement("p");
  libelle.className = "geste-libelle";
  libelle.textContent = avant === "" ? MARQUE : `${MARQUE} ${avant}`;
  const code = doc.createElement("pre");
  code.className = "geste-commande";
  code.textContent = command;
  const copie = button(doc, COPIER, undefined, { sorte: "secondaire" });
  copie.className = "geste-copie";
  copie.dataset.geste = "copier-le-geste";
  copie.addEventListener("click", () => {
    const dit = (/** @type {string} */ texte, /** @type {string} */ state, /** @type {string} */ detail) => {
      copie.textContent = texte;
      copie.dataset.etat = state;
      copie.title = detail;
    };
    let promesse;
    try {
      promesse = copier(command);
    } catch (error) {
      promesse = Promise.reject(error);
    }
    Promise.resolve(promesse ?? Promise.reject(new Error("the clipboard is not available here"))).then(
      () => dit(COPIE, "copiee", "the command is on your clipboard"),
      (error) => dit(COPIE_ECHOUEE, "echec", error instanceof Error ? error.message : String(error)),
    );
  });
  bloc.append(libelle, code, copie);
  return bloc;
}
