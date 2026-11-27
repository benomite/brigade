// @ts-check
// Le geste que le second nomme, sous son terminal (ticket 1521, épique 1518) : quand ce que le chef doit faire est une
// commande — merger, lancer une pass —, le second la publie par son canal (runtime/src/second-propositions/), et
// l'onglet du second la montre sur un bouton, à la place des choix (second/choice.js) : un bouton dit dans les mots du
// chef, jamais la ligne de commande à l'écran. La commande exacte, entière, ni coupée ni rognée, se lit au survol du
// bouton, puis dans l'aide repliée de la confirmation qu'un clic ouvre ; « run it » la tape dans le
// terminal du second, puis Entrée, comme le chef l'aurait tapée, et « cancel » ne fait rien. Le second ne lance
// jamais rien : seul le « run it » du chef écrit dans le terminal. Lancé, ou le second passé à autre chose, le bouton
// part. Ce module ne touche pas `document` : il reçoit de quoi créer un élément (bricks.js), et rend des éléments.

import { folded, hover } from "../bricks.js";
import { confirmationOfAction } from "../components/confirmation/confirmation.js";
import { button as buttonOfTheFamily } from "../components/button/button.js";
import { YES, CANCEL } from "../lexicon.js";

/** @typedef {import("../bricks.js").Fabrique} Fabrique */
/** @typedef {import("./choice.js").Action} Action */

export const EXPECTED = "The second asks you to run a command";
export const HELP = "a click asks you to confirm: the command runs in the second's terminal, in your name, only once you do — hover the button to read it";
export const BUTTON = "Run the second's command…";
export const SEE = "the exact command";
export const TITLE = "Run this command in the second's terminal, in your name?";
export const LAUNCH = YES("run it");
export { CANCEL };

/** @param {Fabrique} doc @param {string} balise @param {string} [text] */
function created(doc, balise, text) {
  const pose = doc.createElement(balise);
  if (text !== undefined) pose.textContent = text;
  return pose;
}

// La commande telle que le second l'a publiée, en police de terminal : ses espaces gardés, une commande longue qui passe
// à la ligne plutôt que d'être coupée. Elle ne passe à la ligne qu'entre ses mots — chacun d'un tenant, `--merge` ne
// se lit jamais `--` puis `merge` —, sauf un mot plus long que la ligne. Son texte reste la commande, à l'octet près.
/** @param {Fabrique} doc @param {string} balise @param {string} command */
function commandWhole(doc, balise, command) {
  const pose = created(doc, balise);
  pose.className = "commande mono";
  pose.append(
    ...command.split(/( +)/).filter((piece) => piece !== "").map((piece) => {
      if (piece.startsWith(" ")) return piece;
      const word = created(doc, "span", piece);
      word.className = "mot";
      return word;
    }),
  );
  return pose;
}

// La zone sous le terminal : ce qu'on attend du chef, en une phrase, puis le bouton qui montre la commande ; sa
// confirmation dessous, quand le chef l'a ouverte. `basculer` ouvre ou referme la confirmation, `annuler` la referme,
// `lancer` est le « run it » — seul geste qui fasse partir la commande, et c'est la vue qui l'écrit.
/** @param {Fabrique} doc @param {Action} proposal @param {{ ouverte: boolean, basculer: () => void, annuler: () => void, lancer: () => void }} gestes */
export function setActionOfSecond(doc, proposal, { ouverte: openOne, basculer: toggle, annuler: cancel, lancer: launch }) {
  const root = created(doc, "section");
  root.className = "geste-du-second";
  root.ariaLabel = EXPECTED;
  root.dataset.proposition = proposal.id;
  const expected = created(doc, "p");
  expected.className = "attendu";
  expected.append(EXPECTED, hover(doc, HELP));
  const button = buttonOfTheFamily(doc, BUTTON, toggle);
  button.className = "geste";
  button.ariaExpanded = String(openOne);
  // La commande exacte, entière, au survol du bouton : nothing runs before the chef's “run it”.
  root.append(expected, hover(doc, proposal.command, button));
  if (openOne) {
    const confirmation = confirmationOfAction(doc, { titre: TITLE, oui: LAUNCH, non: CANCEL }, { oui: launch, non: cancel });
    // La commande redite entière, dans une aide repliée sous la question, avant « run it ».
    confirmation.children[0]?.after(folded(doc, { titre: SEE, resume: "what runs, word for word" }, [commandWhole(doc, "p", proposal.command)]));
    root.append(confirmation);
  }
  return root;
}
