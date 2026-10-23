// @ts-check
// Le geste que le second nomme, sous son terminal (ticket 1521, épique 1518) : quand ce que le chef doit faire est une
// commande — merger, lancer une pass —, le second la publie par son canal (runtime/src/second-propositions/), et
// l'onglet du second la montre sur un bouton, à la place des choix (second/choix.js) : la commande exacte, entière, ni
// coupée, ni rognée, ni cachée. Un clic ouvre une confirmation qui la redit entière ; « run it » la tape dans le
// terminal du second, puis Entrée, comme le chef l'aurait tapée, et « cancel » ne fait rien. Le second ne lance
// jamais rien : seul le « run it » du chef écrit dans le terminal. Lancé, ou le second passé à autre chose, le bouton
// part. Ce module ne touche pas `document` : il reçoit de quoi créer un élément (briques.js), et rend des éléments.

import { confirmationDeGeste, survol } from "../briques.js";

/** @typedef {import("../briques.js").Fabrique} Fabrique */
/** @typedef {import("./choix.js").Geste} Geste */

export const ATTENDU = "The second asks you to run a command";
export const AIDE = "a click shows the command again: it runs in the second's terminal, in your name, only once you confirm — you can also type it there yourself";
export const TITRE = "Run this command in the second's terminal, in your name?";
export const LANCER = "run it";
export const ANNULER = "cancel";

/** @param {Fabrique} doc @param {string} balise @param {string} [texte] */
function cree(doc, balise, texte) {
  const pose = doc.createElement(balise);
  if (texte !== undefined) pose.textContent = texte;
  return pose;
}

// La commande telle que le second l'a publiée, en police de terminal : ses espaces gardés, une commande longue qui passe
// à la ligne plutôt que d'être coupée. Elle ne passe à la ligne qu'entre ses mots — chacun d'un tenant, `--merge` ne
// se lit jamais `--` puis `merge` —, sauf un mot plus long que la ligne. Son texte reste la commande, à l'octet près.
/** @param {Fabrique} doc @param {string} balise @param {string} commande */
function commandeEntiere(doc, balise, commande) {
  const pose = cree(doc, balise);
  pose.className = "commande mono";
  pose.append(
    ...commande.split(/( +)/).filter((morceau) => morceau !== "").map((morceau) => {
      if (morceau.startsWith(" ")) return morceau;
      const mot = cree(doc, "span", morceau);
      mot.className = "mot";
      return mot;
    }),
  );
  return pose;
}

// La zone sous le terminal : ce qu'on attend du chef, en une phrase, puis le bouton qui montre la commande ; sa
// confirmation dessous, quand le chef l'a ouverte. `basculer` ouvre ou referme la confirmation, `annuler` la referme,
// `lancer` est le « run it » — seul geste qui fasse partir la commande, et c'est la vue qui l'écrit.
/** @param {Fabrique} doc @param {Geste} proposition @param {{ ouverte: boolean, basculer: () => void, annuler: () => void, lancer: () => void }} gestes */
export function poserGesteDuSecond(doc, proposition, { ouverte, basculer, annuler, lancer }) {
  const racine = cree(doc, "section");
  racine.className = "geste-du-second";
  racine.ariaLabel = ATTENDU;
  racine.dataset.proposition = proposition.id;
  const attendu = cree(doc, "p");
  attendu.className = "attendu";
  attendu.append(ATTENDU, survol(doc, AIDE));
  const bouton = cree(doc, "button");
  bouton.type = "button";
  bouton.className = "geste";
  bouton.title = "shows the command again first: nothing runs before your “run it”";
  bouton.ariaExpanded = String(ouverte);
  bouton.append(commandeEntiere(doc, "span", proposition.command));
  bouton.addEventListener("click", basculer);
  racine.append(attendu, bouton);
  if (ouverte) {
    const confirmation = confirmationDeGeste(doc, { titre: TITRE, oui: LANCER, non: ANNULER }, { oui: lancer, non: annuler });
    // La commande redite entière, sous la question, avant « run it ».
    confirmation.children[0]?.after(commandeEntiere(doc, "p", proposition.command));
    racine.append(confirmation);
  }
  return racine;
}
