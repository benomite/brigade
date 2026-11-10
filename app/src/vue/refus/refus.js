// @ts-check
// Une carte que plus aucun cook ne prendra (ticket 3147) : sa première ligne dit « Will not start: <pourquoi>. », ce que la
// station en a écrit est derrière « details », en entier, et trois boutons disent ce qui la fait bouger : « Relaunch »
// (le label `served-elsewhere` retiré), « Close as already done » (l'issue fermée comme terminée) et « Ask the second ».
// Un geste attend pendant qu'il part, puis dit pourquoi rien n'a changé s'il est refusé ; parti, la carte est relue et
// n'est plus là, ou plus refusée. Ce module ne touche pas `document` : il reçoit de quoi créer un élément.

import { bouton } from "../composants/bouton/bouton.js";
import { ligneErreur } from "../composants/ligne-erreur/ligne-erreur.js";
import { detailsDeCarte } from "../carte-todo.js";
import { rangeeDuSecond } from "../todo-carte/demander-au-second.js";

/** @typedef {{ createElement(balise: string): any }} Fabrique */
/** @typedef {"relancer" | "clore"} Geste */

export const RELANCER = "Relaunch";
export const CLORE = "Close as already done";
export const DEMANDER_AU_SECOND = "Ask the second";
export const EN_ROUTE = "on its way…";
export const GESTES = /** @type {const} */ ([
  { id: "relancer", libelle: RELANCER, titre: "remove `served-elsewhere` from the issue: a cook takes the ticket again in its turn" },
  { id: "clore", libelle: CLORE, titre: "close the issue as completed: the card leaves the rail" },
]);

// La ligne du haut de la carte, et le message de la station derrière « details » — rien, quand la station n'en dit pas plus.
/** @param {Fabrique} doc @param {string} ligne @param {string} brut */
export function ligneDuRefus(doc, ligne, brut) {
  const phrase = doc.createElement("p");
  phrase.className = "ligne-carte refus-ligne";
  phrase.textContent = ligne;
  return { phrase, details: brut.trim() === "" ? undefined : detailsDeCarte(doc, brut) };
}

// La rangée des trois boutons. `etat` : le geste de cette carte en route (`envoi`) ou refusé (`refus`) — absent, rien n'est
// parti. `second` : la demande au second de ce ticket, comme sur toute carte (todo-carte/demander-au-second.js).
/**
 * @param {Fabrique} doc
 * @param {number} ticket
 * @param {{ envoi: Geste } | { refus: string } | undefined} etat
 * @param {{ jouer: (id: Geste) => void, demander: () => void }} gestes
 * @param {{ envoi: true } | { parti: string } | { refus: string } | undefined} second
 */
export function rangeeDuRefus(doc, ticket, etat, gestes, second) {
  const rangee = doc.createElement("div");
  rangee.className = "gestes-du-refus";
  const enRoute = etat !== undefined && "envoi" in etat;
  for (const { id, libelle, titre } of GESTES) {
    const clic = bouton(doc, enRoute && etat.envoi === id ? EN_ROUTE : libelle, undefined, { sorte: id === "relancer" ? "recommande" : "secondaire" });
    clic.dataset.geste = `refus-${id}`;
    clic.title = titre;
    clic.disabled = enRoute;
    clic.addEventListener("click", () => gestes.jouer(id));
    rangee.append(clic);
  }
  const dernier = rangeeDuSecond(doc, ticket, second, gestes.demander, DEMANDER_AU_SECOND);
  dernier.className = "secondaire";
  rangee.append(dernier);
  if (etat !== undefined && "refus" in etat) rangee.append(ligneErreur(doc, etat.refus, "", { classe: "refus", balise: "span" }));
  return rangee;
}
