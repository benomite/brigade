// @ts-check
// « ask the second », sur toute carte de TODO (ticket 3133, épique 3128) — avec ou sans geste, avec ou sans question :
// un clic passe la carte au second du projet. Le process principal y écrit un premier message tout prêt — le numéro de
// l'issue, la question de la carte, ce que son issue dit (passation-second.ts) —, sans Entrée : le chef ne colle rien,
// il lit et fait Entrée. Un bouton secondaire, sous tout le reste : la carte se tranche sans lui. Il attend pendant que
// la demande part, puis dit où elle en est, ou pourquoi rien n'est écrit.
// Ce module ne touche pas `document` : il reçoit de quoi créer un élément et le geste du clic.

import { bouton } from "../composants/bouton/bouton.js";
import { ligneErreur } from "../composants/ligne-erreur/ligne-erreur.js";

/** @typedef {{ createElement(balise: string): any }} Fabrique */

// Le mot est celui du runtime (runtime/src/carte-todo/forme.ts, `DEMANDER_AU_SECOND`) et de la fiche (gestes-fiche.ts).
export const DEMANDER = "ask the second";
export const DEMANDE_EN_ROUTE = "asking the second…";

// La rangée du bouton. `second` : la demande de ce ticket, partie de la carte ou de sa fiche — absente, rien n'est parti.
/**
 * @param {Fabrique} doc
 * @param {number} ticket
 * @param {{ envoi: true } | { parti: string } | { refus: string } | undefined} second
 * @param {() => void} demander
 */
export function rangeeDuSecond(doc, ticket, second, demander) {
  const rangee = doc.createElement("p");
  rangee.className = "secondaire";
  const clic = bouton(doc, DEMANDER, undefined, { sorte: "secondaire" });
  clic.className = "demander";
  clic.dataset.geste = "demande-second";
  clic.title = `open the second with this card handed over: #${ticket}, its question and what its issue says — nothing is sent, you press Enter`;
  clic.disabled = second !== undefined && "envoi" in second;
  clic.addEventListener("click", () => demander());
  rangee.append(clic);
  if (second !== undefined) {
    if ("refus" in second) rangee.append(ligneErreur(doc, second.refus, "", { classe: "refus", balise: "span" }));
    else {
      const dite = doc.createElement("span");
      dite.textContent = "envoi" in second ? DEMANDE_EN_ROUTE : second.parti;
      dite.className = "dite";
      rangee.append(dite);
    }
  }
  return rangee;
}
