// @ts-check
// Une carte que plus aucun cook ne prendra (ticket 3147) : sa première ligne dit « Will not start: <pourquoi>. », ce que la
// station en a écrit est derrière « details », en entier, et trois boutons disent ce qui la fait bouger : « Relaunch »
// (le label `served-elsewhere` retiré), « Close as already done » (l'issue fermée comme terminée) et « Ask the second ».
// Un geste attend pendant qu'il part, puis dit pourquoi rien n'a changé s'il est refusé ; parti, la carte est relue et
// n'est plus là, ou plus refusée. Ce module ne touche pas `document` : il reçoit de quoi créer un élément.

import { button } from "../components/button/button.js";
import { lineError } from "../components/line-error/line-error.js";
import { detailsOfCard } from "../card-todo.js";
import { rowOfSecond } from "../todo-card/ask-at-second.js";

/** @typedef {{ createElement(balise: string): any }} Fabrique */
/** @typedef {"relancer" | "clore"} Action */

export const RELAUNCH = "Relaunch";
export const CLOSE = "Close as already done";
export const ASK_AT_SECOND = "Ask the second";
export const EN_ROUTE = "on its way…";
export const ACTIONS = /** @type {const} */ ([
  { id: "relancer", libelle: RELAUNCH, titre: "remove `served-elsewhere` from the issue: a cook takes the ticket again in its turn" },
  { id: "clore", libelle: CLOSE, titre: "close the issue as completed: the card leaves the rail" },
]);

// La ligne du haut de la carte, et le message de la station derrière « details » — rien, quand la station n'en dit pas plus.
/** @param {Fabrique} doc @param {string} line @param {string} raw */
export function lineOfRefusal(doc, line, raw) {
  const sentence = doc.createElement("p");
  sentence.className = "ligne-carte refus-ligne";
  sentence.textContent = line;
  return { phrase: sentence, details: raw.trim() === "" ? undefined : detailsOfCard(doc, raw) };
}

// La rangée des trois boutons. `etat` : le geste de cette carte en route (`envoi`) ou refusé (`refus`) — absent, rien n'est
// parti. `second` : la demande au second de ce ticket, comme sur toute carte (todo-card/ask-at-second.js).
/**
 * @param {Fabrique} doc
 * @param {number} ticket
 * @param {{ envoi: Action } | { refus: string } | undefined} state
 * @param {{ jouer: (id: Action) => void, demander: () => void }} actions
 * @param {{ envoi: true } | { parti: string } | { refus: string } | undefined} second
 */
export function rowOfRefusal(doc, ticket, state, actions, second) {
  const row = doc.createElement("div");
  row.className = "gestes-du-refus";
  const enRoute = state !== undefined && "envoi" in state;
  for (const { id, libelle: wording, titre: title } of ACTIONS) {
    const click = button(doc, enRoute && state.envoi === id ? EN_ROUTE : wording, undefined, { sorte: id === "relancer" ? "recommande" : "secondaire" });
    click.dataset.geste = `refus-${id}`;
    click.title = title;
    click.disabled = enRoute;
    click.addEventListener("click", () => actions.jouer(id));
    row.append(click);
  }
  const last = rowOfSecond(doc, ticket, second, actions.demander, ASK_AT_SECOND);
  last.className = "secondaire";
  row.append(last);
  if (state !== undefined && "refus" in state) row.append(lineError(doc, state.refus, "", { classe: "refus", balise: "span" }));
  return row;
}
