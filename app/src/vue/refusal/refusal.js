// @ts-check
// Une carte que plus aucun cook ne prendra (ticket 3147) : sa première ligne dit « Will not start: <pourquoi>. », ce que la
// station en a écrit est derrière « details », en entier, et trois boutons disent ce qui la fait bouger : « Relaunch »
// (le label `served-elsewhere` retiré), « Close as already done » (l'issue fermée comme terminée) et « Ask the second ».
// Un geste attend pendant qu'il part, puis dit pourquoi rien n'a changé s'il est refusé ; parti, la carte est relue et
// n'est plus là, ou plus refusée. Ce module ne touche pas `document` : il reçoit de quoi créer un élément.

import { button } from "../composants/button/button.js";
import { lineError } from "../composants/line-error/line-error.js";
import { detailsDeCard } from "../card-todo.js";
import { rangeeDuSecond } from "../todo-card/demander-au-second.js";

/** @typedef {{ createElement(balise: string): any }} Fabrique */
/** @typedef {"relancer" | "clore"} Action */

export const RELANCER = "Relaunch";
export const CLORE = "Close as already done";
export const DEMANDER_AU_SECOND = "Ask the second";
export const EN_ROUTE = "on its way…";
export const ACTIONS = /** @type {const} */ ([
  { id: "relancer", libelle: RELANCER, titre: "remove `served-elsewhere` from the issue: a cook takes the ticket again in its turn" },
  { id: "clore", libelle: CLORE, titre: "close the issue as completed: the card leaves the rail" },
]);

// La ligne du haut de la carte, et le message de la station derrière « details » — rien, quand la station n'en dit pas plus.
/** @param {Fabrique} doc @param {string} line @param {string} brut */
export function lineDuRefusal(doc, line, brut) {
  const phrase = doc.createElement("p");
  phrase.className = "ligne-carte refus-ligne";
  phrase.textContent = line;
  return { phrase, details: brut.trim() === "" ? undefined : detailsDeCard(doc, brut) };
}

// La rangée des trois boutons. `etat` : le geste de cette carte en route (`envoi`) ou refusé (`refus`) — absent, rien n'est
// parti. `second` : la demande au second de ce ticket, comme sur toute carte (todo-card/demander-au-second.js).
/**
 * @param {Fabrique} doc
 * @param {number} ticket
 * @param {{ envoi: Action } | { refus: string } | undefined} state
 * @param {{ jouer: (id: Action) => void, demander: () => void }} actions
 * @param {{ envoi: true } | { parti: string } | { refus: string } | undefined} second
 */
export function rangeeDuRefusal(doc, ticket, state, actions, second) {
  const rangee = doc.createElement("div");
  rangee.className = "gestes-du-refus";
  const enRoute = state !== undefined && "envoi" in state;
  for (const { id, libelle, titre } of ACTIONS) {
    const clic = button(doc, enRoute && state.envoi === id ? EN_ROUTE : libelle, undefined, { sorte: id === "relancer" ? "recommande" : "secondaire" });
    clic.dataset.geste = `refus-${id}`;
    clic.title = titre;
    clic.disabled = enRoute;
    clic.addEventListener("click", () => actions.jouer(id));
    rangee.append(clic);
  }
  const dernier = rangeeDuSecond(doc, ticket, second, actions.demander, DEMANDER_AU_SECOND);
  dernier.className = "secondaire";
  rangee.append(dernier);
  if (state !== undefined && "refus" in state) rangee.append(lineError(doc, state.refus, "", { classe: "refus", balise: "span" }));
  return rangee;
}
