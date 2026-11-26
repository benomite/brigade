// @ts-check
// Le geste que le second nomme, sous son terminal (ticket 1521, épique 1518) : quand ce que le chef doit faire est une
// commande — merger, lancer une pass —, le second la publie par son canal (runtime/src/second-propositions/), et
// l'onglet du second la montre sur un bouton, à la place des choix (second/choice.js) : un bouton dit dans les mots du
// chef, jamais la ligne de commande à l'écran. La commande exacte, entière, ni coupée ni rognée, se lit au survol du
// bouton, puis dans l'aide repliée de la confirmation qu'un clic ouvre ; « run it » la tape dans le
// terminal du second, puis Entrée, comme le chef l'aurait tapée, et « cancel » ne fait rien. Le second ne lance
// jamais rien : seul le « run it » du chef écrit dans le terminal. Lancé, ou le second passé à autre chose, le bouton
// part. Ce module ne touche pas `document` : il reçoit de quoi créer un élément (briques.js), et rend des éléments.

import { replie, survol } from "../briques.js";
import { confirmationDeAction } from "../composants/confirmation/confirmation.js";
import { button as buttonDeLaFamille } from "../composants/button/button.js";
import { OUI, ANNULER } from "../lexique.js";

/** @typedef {import("../briques.js").Fabrique} Fabrique */
/** @typedef {import("./choice.js").Action} Action */

export const ATTENDU = "The second asks you to run a command";
export const AIDE = "a click asks you to confirm: the command runs in the second's terminal, in your name, only once you do — hover the button to read it";
export const BUTTON = "Run the second's command…";
export const VOIR = "the exact command";
export const TITRE = "Run this command in the second's terminal, in your name?";
export const LANCER = OUI("run it");
export { ANNULER };

/** @param {Fabrique} doc @param {string} balise @param {string} [texte] */
function cree(doc, balise, texte) {
  const pose = doc.createElement(balise);
  if (texte !== undefined) pose.textContent = texte;
  return pose;
}

// La commande telle que le second l'a publiée, en police de terminal : ses espaces gardés, une commande longue qui passe
// à la ligne plutôt que d'être coupée. Elle ne passe à la ligne qu'entre ses mots — chacun d'un tenant, `--merge` ne
// se lit jamais `--` puis `merge` —, sauf un mot plus long que la ligne. Son texte reste la commande, à l'octet près.
/** @param {Fabrique} doc @param {string} balise @param {string} command */
function commandEntiere(doc, balise, command) {
  const pose = cree(doc, balise);
  pose.className = "commande mono";
  pose.append(
    ...command.split(/( +)/).filter((morceau) => morceau !== "").map((morceau) => {
      if (morceau.startsWith(" ")) return morceau;
      const word = cree(doc, "span", morceau);
      word.className = "mot";
      return word;
    }),
  );
  return pose;
}

// La zone sous le terminal : ce qu'on attend du chef, en une phrase, puis le bouton qui montre la commande ; sa
// confirmation dessous, quand le chef l'a ouverte. `basculer` ouvre ou referme la confirmation, `annuler` la referme,
// `lancer` est le « run it » — seul geste qui fasse partir la commande, et c'est la vue qui l'écrit.
/** @param {Fabrique} doc @param {Action} proposition @param {{ ouverte: boolean, basculer: () => void, annuler: () => void, lancer: () => void }} gestes */
export function poserActionDuSecond(doc, proposition, { ouverte, basculer, annuler, lancer }) {
  const racine = cree(doc, "section");
  racine.className = "geste-du-second";
  racine.ariaLabel = ATTENDU;
  racine.dataset.proposition = proposition.id;
  const attendu = cree(doc, "p");
  attendu.className = "attendu";
  attendu.append(ATTENDU, survol(doc, AIDE));
  const button = buttonDeLaFamille(doc, BUTTON, basculer);
  button.className = "geste";
  button.ariaExpanded = String(ouverte);
  // La commande exacte, entière, au survol du bouton : nothing runs before the chef's “run it”.
  racine.append(attendu, survol(doc, proposition.command, button));
  if (ouverte) {
    const confirmation = confirmationDeAction(doc, { titre: TITRE, oui: LANCER, non: ANNULER }, { oui: lancer, non: annuler });
    // La commande redite entière, dans une aide repliée sous la question, avant « run it ».
    confirmation.children[0]?.after(replie(doc, { titre: VOIR, resume: "what runs, word for word" }, [commandEntiere(doc, "p", proposition.command)]));
    racine.append(confirmation);
  }
  return racine;
}
