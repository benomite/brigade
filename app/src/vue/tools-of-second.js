// @ts-check
// Ce que l'onglet Second dit quand le second ne part pas, ou part sans tous ses outils (ticket 1435, épique 1427) : le
// runtime vérifie claude, gh et git avant de le lancer (ticket 1433), et l'app relaie ce qu'il en dit
// (terminals.ts, `empeche` et `manque`). Sa raison, en une phrase, est la note du second ; ici, sous elle, chaque outil
// qui manque, et ce qui mène le chef jusqu'à lui (ticket 4059) : le produit nommé — Claude Code, pas `claude`, que le
// chef peut confondre avec l'app de bureau Claude : le binaire est au survol, avec la raison du runtime —, à quoi il
// sert ici en une ligne, le pas qui l'installe sur cette machine (la commande se copie), pour Claude Code la connexion
// qui suit, et le bouton de sa page. Un second empêché a son bouton « try again », recommandé : il refait la
// vérification et, les outils installés, part — sans relancer l'app (vue.js relit d'abord les outils, ce qui rattache
// au PATH de l'app un outil que son installeur a posé hors de lui). L'onglet n'est jamais vide : sans outil nommé, la
// raison suffit.
// Ce module ne touche pas `document` : il reçoit de quoi créer un élément (bricks.js), et rend des éléments.

import { buttonAction, hover, sentence } from "./bricks.js";
import { RETRY } from "./lexicon.js";
import { NAMES } from "./tools-required/tools-required.js";

/** @typedef {import("./bricks.js").Fabrique} Fabrique */
/** @typedef {import("../terminals.ts").SaysOfSecond} SaysOfSecond */

export const RETRY_THE_SECOND = RETRY;
// Le produit, tel que l'écran le dit ; un outil inconnu garde son nom.
/** @param {string} secondTool */
const name = (secondTool) => /** @type {Record<string, string>} */ (NAMES)[secondTool] ?? secondTool;
/** @param {string} secondTool */
const Name = (secondTool) => name(secondTool).replace(/^the /, "The ");
/** @param {string} secondTool */
export const PAGE_OF = (secondTool) => `how to get ${name(secondTool)}`;
// À quoi sert chacun, ici.
/** @type {Record<string, string>} */
const A_WHAT_IT_SERVES = {
  claude: "Claude Code is what the second and the cooks run on, with your Max account.",
  gh: "The GitHub CLI is how brigade reads your stations, their rails and your repositories on GitHub.",
  git: "Git makes and keeps the project's local copy, a git clone.",
};
// Après l'installation de Claude Code, la connexion.
const THEN_THE_CONNECTION = `Once it is installed, click “${RETRY}”: the second opens, and Claude Code asks you to sign in with your Max account.`;

/** @param {Fabrique} doc @param {string} balise @param {string} [text] */
function created(doc, balise, text) {
  const pose = doc.createElement(balise);
  if (text !== undefined) pose.textContent = text;
  return pose;
}

// `bloque` : le second ne part pas — sinon il tourne, et la raison dit ce qui échouera. Un second qui tourne n'a pas de
// raison dans sa note : elle est en tête de la liste.
/**
 * @param {Fabrique} doc
 * @param {SaysOfSecond} said
 * @param {{ bloque: boolean, reessayer: () => void, ouvrirLaPage: (url: string) => void }} geste
 */
export function setToolsOfSecond(doc, said, { bloque: blocked, reessayer: retry, ouvrirLaPage: openThePage }) {
  const root = created(doc, "section");
  root.className = "outils-du-second";
  root.classList.toggle("empeche", blocked);
  root.ariaLabel = blocked ? "Why the second does not start" : "Tools the second is missing";
  if (!blocked && said.reason !== "") root.append(sentence(doc, "p", said.reason));
  if (said.tools.length > 0) {
    const list = created(doc, "ul");
    list.append(
      ...said.tools.map(({ tool, reason, install, link }) => {
        const secondTool = created(doc, "li");
        secondTool.className = "outil-manquant";
        // Le binaire, et pourquoi le runtime le dit absent, au survol — sans accents graves : une bulle ne pose pas de code.
        const help = hover(doc, reason.replaceAll("`", ""));
        secondTool.append(created(doc, "strong", Name(tool)), help);
        const serves = A_WHAT_IT_SERVES[tool];
        if (serves !== undefined) {
          const why = created(doc, "p", serves);
          why.className = "pourquoi";
          secondTool.append(why);
        }
        // Le pas, à plat : sa commande se copie.
        const not = sentence(doc, "p", install);
        not.className = "pas";
        secondTool.append(not);
        if (tool === "claude" && blocked) {
          const connection = created(doc, "p", THEN_THE_CONNECTION);
          connection.className = "pas";
          secondTool.append(connection);
        }
        const page = created(doc, "p");
        page.className = "gestes";
        page.append(buttonAction(doc, PAGE_OF(tool), () => openThePage(link), { recommande: !blocked }));
        secondTool.append(page);
        return secondTool;
      }),
    );
    root.append(list);
  }
  if (blocked) {
    const actions = created(doc, "p");
    actions.className = "gestes";
    actions.append(buttonAction(doc, RETRY_THE_SECOND, retry, { recommande: true }));
    root.append(actions);
  }
  return root;
}
