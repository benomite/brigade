// @ts-check
// Les gestes retenus sur le TODO (#4273, épique #4209) : une carte par geste qu'un agent retient pour l'OK du chef — son
// résumé, sa raison, la ligne `awaiting` mot pour mot, et un seul bouton, Approve, qui appelle l'action d'approuver avec
// son id. Faite, la carte quitte la liste ; refusée, elle reste, et dit pourquoi. Ni ssh, ni commande tapée.
// Ce module ne touche pas `document` : il reçoit de quoi créer un élément, la vue lui donne le sien et les tests un faux.
// Il est en JavaScript pour que la vue l'importe telle quelle ; cards-retenues.ts le donne aux modules TypeScript.

import { button } from "../vue/composants/button/button.js";
import { lineError } from "../vue/composants/line-error/line-error.js";

/** @typedef {import("./contract.ts").ActionRetenu} ActionRetenu */
/** @typedef {import("./contract.ts").ReadDesRetenus} ReadDesRetenus */
/** @typedef {import("./contract.ts").Approuver} Approuver */
/** @typedef {{ createElement(balise: string): any }} Fabrique */

const APPROUVER = "Approve";
// L'en-tête des cartes, dans le TODO du projet.
const TETE = "Held for your OK";
// La classe de la ligne d'erreur d'une carte, par laquelle elle se retrouve — et se remplace — au refus suivant.
const ERROR = "erreur-du-geste-retenu";

/**
 * Une carte par geste retenu : son résumé, puis sa raison, et le bouton Approve. Un clic appelle `approuver` avec l'id du
 * geste, le bouton inerte le temps de la réponse ; faite, la carte quitte sa liste ; refusée, elle dit le refus et se
 * reclique.
 * @param {Fabrique} doc @param {readonly ActionRetenu[]} actions @param {Approuver} approuver
 */
export function poserCardsRetenues(doc, actions, approuver) {
  return actions.map((action) => {
    const card = doc.createElement("li");
    card.className = "entree-du-todo";
    card.dataset.geste = action.id;
    const resume = Object.assign(doc.createElement("p"), { className: "demande-du-todo", textContent: action.summary });
    const raison = Object.assign(doc.createElement("p"), { className: "raison-du-geste-retenu", textContent: action.reason });
    const ok = button(doc, APPROUVER, () => void approuverLaCard(), { sorte: "recommande" });
    const answers = doc.createElement("div");
    answers.className = "reponses-du-todo";
    answers.append(ok);
    card.append(resume, raison, answers);
    async function approuverLaCard() {
      ok.disabled = true;
      try {
        await approuver(action.id);
        card.remove();
      } catch (error) {
        for (const ancienne of card.children.filter((/** @type {any} */ pose) => pose.className === ERROR)) ancienne.remove();
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
 * @param {Fabrique} doc @param {ReadDesRetenus | undefined} lus @param {Approuver} approuver
 */
export function poserLesRetenus(doc, lus, approuver) {
  if (lus === undefined) return undefined;
  if ("sans" in lus) return lineError(doc, lus.sans, lus.detail);
  if (lus.gestes.length === 0) return undefined;
  const cadre = doc.createElement("div");
  cadre.className = "todo-du-rail";
  cadre.ariaLabel = TETE;
  const tete = Object.assign(doc.createElement("p"), { className: "tete-du-todo", textContent: `${TETE} (${lus.gestes.length})` });
  const liste = doc.createElement("ol");
  liste.className = "entrees-du-todo";
  liste.append(...poserCardsRetenues(doc, lus.gestes, approuver));
  cadre.append(tete, liste);
  return cadre;
}

/**
 * Ce que le rail vide dit quand des gestes sont retenus (#4273) : « N splits wait for your OK » — jamais un arrêt sans
 * cause, ni une attente de place en cuisine. Nul quand le rail porte un ticket ou qu'aucun geste n'est retenu : la phrase
 * d'avant reste.
 * @param {{ rail: number, retenus: readonly ActionRetenu[] }} etat
 * @returns {string | null}
 */
export function phraseDuRailEmpty({ rail, retenus }) {
  if (rail > 0 || retenus.length === 0) return null;
  return `${retenus.length} splits wait for your OK`;
}

/**
 * Les gestes retenus lus, sans celui que le chef vient d'approuver : la carte ne revient pas avant la lecture suivante.
 * @param {ReadDesRetenus | undefined} lus @param {string} id
 * @returns {ReadDesRetenus | undefined}
 */
export function sansLApprouve(lus, id) {
  if (lus === undefined || "sans" in lus) return lus;
  return { gestes: lus.gestes.filter((action) => action.id !== id) };
}

/**
 * Les gestes retenus d'une lecture : aucun quand elle ne les donne pas.
 * @param {ReadDesRetenus | undefined} lus
 */
export const retenusDe = (lus) => (lus !== undefined && "gestes" in lus ? lus.gestes : []);
