// @ts-check
// Le geste d'une carte de TODO (ticket 3132, épique 3128) : quand la carte demande au chef un geste à faire lui-même
// (« Gesture for the chef: From a machine with GitHub access, run: gh issue create … »), il se lit en entier — il passe
// à la ligne, jamais coupé — et un bouton « copy » met la commande exacte dans le presse-papiers. Une carte sans geste
// n'a ni ce bloc ni ce bouton. Ce module ne touche pas `document` : il reçoit de quoi créer un élément et de quoi copier.

import { button } from "../components/button/button.js";

/** @typedef {{ createElement(balise: string): any }} Fabrique */

export const BRAND = "Gesture for the chef:";
export const COPY = "copy";
export const COPIED = "copied";
export const COPY_FAILED = "copy failed";

// Ce que la question d'une carte dit du geste : le texte dit avant la commande, et la commande — ce qui suit « run: » ;
// sans « run: », tout le geste est la commande. Nul quand la question n'est pas un geste du chef.
/** @param {string | null} question @returns {{ avant: string, commande: string } | null} */
export function actionOfTheQuestion(question) {
  if (question === null || !question.startsWith(BRAND)) return null;
  const action = question.slice(BRAND.length).trim();
  if (action === "") return null;
  const cut = /\brun:\s*(\S[\s\S]*)$/.exec(action);
  if (cut === null) return { avant: "", commande: action };
  return { avant: action.slice(0, cut.index).trim(), commande: (cut[1] ?? "").trim() };
}

// Le bloc : le libellé, ce qui précède la commande, la commande entière dans un cadre qui passe à la ligne, et son
// bouton. `copier` rend une promesse : le bouton dit « copied » quand elle tient, « copy failed » (la raison au survol) sinon.
/** @param {Fabrique} doc @param {{ avant: string, commande: string }} geste @param {(text: string) => Promise<unknown> | undefined} copy */
export function blockOfAction(doc, { avant: before, commande: command }, copy) {
  const block = doc.createElement("div");
  block.className = "geste-carte";
  const wording = doc.createElement("p");
  wording.className = "geste-libelle";
  wording.textContent = before === "" ? BRAND : `${BRAND} ${before}`;
  const code = doc.createElement("pre");
  code.className = "geste-commande";
  code.textContent = command;
  const copied = button(doc, COPY, undefined, { sorte: "secondaire" });
  copied.className = "geste-copie";
  copied.dataset.geste = "copier-le-geste";
  copied.addEventListener("click", () => {
    const said = (/** @type {string} */ text, /** @type {string} */ state, /** @type {string} */ detail) => {
      copied.textContent = text;
      copied.dataset.etat = state;
      copied.title = detail;
    };
    let promise;
    try {
      promise = copy(command);
    } catch (error) {
      promise = Promise.reject(error);
    }
    Promise.resolve(promise ?? Promise.reject(new Error("the clipboard is not available here"))).then(
      () => said(COPIED, "copiee", "the command is on your clipboard"),
      (error) => said(COPY_FAILED, "echec", error instanceof Error ? error.message : String(error)),
    );
  });
  block.append(wording, code, copied);
  return block;
}
