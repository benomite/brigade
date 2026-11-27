// @ts-check
// Les gestes retenus sur le TODO (#4273, épique #4209) : une carte par geste qu'un agent retient pour l'OK du chef — son
// résumé, sa raison, la ligne `awaiting` mot pour mot, et un seul bouton, Approve, qui appelle l'action d'approuver avec
// son id. Faite, la carte quitte la liste ; refusée, elle reste, et dit pourquoi. Ni ssh, ni commande tapée.
// Ce module ne touche pas `document` : il reçoit de quoi créer un élément, la vue lui donne le sien et les tests un faux.
// Il est en JavaScript pour que la vue l'importe telle quelle ; cards-held.ts le donne aux modules TypeScript.

import { button } from "../vue/components/button/button.js";
import { lineError } from "../vue/components/line-error/line-error.js";

/** @typedef {import("./contract.ts").ActionHeld} ActionHeld */
/** @typedef {import("./contract.ts").ReadOfHeld} ReadOfHeld */
/** @typedef {import("./contract.ts").Approve} Approve */
/** @typedef {{ createElement(balise: string): any }} Fabrique */

const APPROVE = "Approve";
// L'en-tête des cartes, dans le TODO du projet.
const HEAD = "Held for your OK";
// La classe de la ligne d'erreur d'une carte, par laquelle elle se retrouve — et se remplace — au refus suivant.
const ERROR = "erreur-du-geste-retenu";

/**
 * Une carte par geste retenu : son résumé, puis sa raison, et le bouton Approve. Un clic appelle `approuver` avec l'id du
 * geste, le bouton inerte le temps de la réponse ; faite, la carte quitte sa liste ; refusée, elle dit le refus et se
 * reclique.
 * @param {Fabrique} doc @param {readonly ActionHeld[]} actions @param {Approve} approve
 */
export function setCardsHeld(doc, actions, approve) {
  return actions.map((action) => {
    const card = doc.createElement("li");
    card.className = "entree-du-todo";
    card.dataset.geste = action.id;
    const resume = Object.assign(doc.createElement("p"), { className: "demande-du-todo", textContent: action.summary });
    const reason = Object.assign(doc.createElement("p"), { className: "raison-du-geste-retenu", textContent: action.reason });
    const ok = button(doc, APPROVE, () => void approveTheCard(), { sorte: "recommande" });
    const answers = doc.createElement("div");
    answers.className = "reponses-du-todo";
    answers.append(ok);
    card.append(resume, reason, answers);
    async function approveTheCard() {
      ok.disabled = true;
      try {
        await approve(action.id);
        card.remove();
      } catch (error) {
        for (const oldOne of card.children.filter((/** @type {any} */ pose) => pose.className === ERROR)) oldOne.remove();
        card.append(lineError(doc, error instanceof Error ? error.message : String(error), "", { classe: ERROR, alerte: true }));
      }
      ok.disabled = false;
    }
    return card;
  });
}

/**
 * Le cadre des gestes retenus dans le TODO du projet : l'en-tête et ses cartes ; ou, quand ils ne se lisent pas, une ligne
 * d'erreur — jamais rien à la place. Rien quand aucun geste n'est retenu, ou qu'ils ne sont pas lus ici.
 * @param {Fabrique} doc @param {ReadOfHeld | undefined} readOnes @param {Approve} approve
 */
export function setTheHeld(doc, readOnes, approve) {
  if (readOnes === undefined) return undefined;
  if ("sans" in readOnes) return lineError(doc, readOnes.sans, readOnes.detail);
  if (readOnes.gestes.length === 0) return undefined;
  const frame = doc.createElement("div");
  frame.className = "todo-du-rail";
  frame.ariaLabel = HEAD;
  const head = Object.assign(doc.createElement("p"), { className: "tete-du-todo", textContent: `${HEAD} (${readOnes.gestes.length})` });
  const list = doc.createElement("ol");
  list.className = "entrees-du-todo";
  list.append(...setCardsHeld(doc, readOnes.gestes, approve));
  frame.append(head, list);
  return frame;
}

/**
 * Ce que le rail vide dit quand des gestes sont retenus (#4273) : « N splits wait for your OK » — jamais un arrêt sans
 * cause, ni une attente de place en cuisine. Nul quand le rail porte un ticket ou qu'aucun geste n'est retenu : la phrase
 * d'avant reste.
 * @param {{ rail: number, retenus: readonly ActionHeld[] }} etat
 * @returns {string | null}
 */
export function sentenceOfRailEmpty({ rail, retenus: retainedOnes }) {
  if (rail > 0 || retainedOnes.length === 0) return null;
  return `${retainedOnes.length} splits wait for your OK`;
}

/**
 * Les gestes retenus lus, sans celui que le chef vient d'approuver : la carte ne revient pas avant la lecture suivante.
 * @param {ReadOfHeld | undefined} readOnes @param {string} id
 * @returns {ReadOfHeld | undefined}
 */
export function withoutTheApproved(readOnes, id) {
  if (readOnes === undefined || "sans" in readOnes) return readOnes;
  return { gestes: readOnes.gestes.filter((action) => action.id !== id) };
}

/**
 * Les gestes retenus d'une lecture : aucun quand elle ne les donne pas.
 * @param {ReadOfHeld | undefined} readOnes
 */
export const heldOf = (readOnes) => (readOnes !== undefined && "gestes" in readOnes ? readOnes.gestes : []);
