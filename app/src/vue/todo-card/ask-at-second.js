// @ts-check
// « ask the second », sur toute carte de TODO (ticket 3133, épique 3128) — avec ou sans geste, avec ou sans question :
// un clic passe la carte au second du projet. Le process principal y écrit un premier message tout prêt — le numéro de
// l'issue, la question de la carte, ce que son issue dit (handover-second.ts) —, sans Entrée : le chef ne colle rien,
// il lit et fait Entrée. Un bouton secondaire, sous tout le reste : la carte se tranche sans lui. Il attend pendant que
// la demande part, puis dit où elle en est, ou pourquoi rien n'est écrit.
// Ce module ne touche pas `document` : il reçoit de quoi créer un élément et le geste du clic.

import { button } from "../components/button/button.js";
import { lineError } from "../components/line-error/line-error.js";

/** @typedef {{ createElement(balise: string): any }} Fabrique */

// Le mot est celui du runtime (runtime/src/carte-todo/forme.ts, `DEMANDER_AU_SECOND`) et de la fiche (card-actions.ts).
export const ASK = "ask the second";
export const REQUEST_IN_ROUTE = "asking the second…";

// La rangée du bouton. `second` : la demande de ce ticket, partie de la carte ou de sa fiche — absente, rien n'est parti.
/**
 * @param {Fabrique} doc
 * @param {number} ticket
 * @param {{ envoi: true } | { parti: string } | { refus: string } | undefined} second
 * @param {() => void} ask
 * @param {string} [wording] le mot du bouton — celui de la carte de TODO par défaut ; une carte refusée dit « Ask the second » (ticket 3147)
 */
export function rowOfSecond(doc, ticket, second, ask, wording = ASK) {
  const row = doc.createElement("p");
  row.className = "secondaire";
  const click = button(doc, wording, undefined, { sorte: "secondaire" });
  click.className = "demander";
  click.dataset.geste = "demande-second";
  click.title = `open the second with this card handed over: #${ticket}, its question and what its issue says — nothing is sent, you press Enter`;
  click.disabled = second !== undefined && "envoi" in second;
  click.addEventListener("click", () => ask());
  row.append(click);
  if (second !== undefined) {
    if ("refus" in second) row.append(lineError(doc, second.refus, "", { classe: "refus", balise: "span" }));
    else {
      const saidOne = doc.createElement("span");
      saidOne.textContent = "envoi" in second ? REQUEST_IN_ROUTE : second.parti;
      saidOne.className = "dite";
      row.append(saidOne);
    }
  }
  return row;
}
