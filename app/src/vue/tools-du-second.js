// @ts-check
// Ce que l'onglet Second dit quand le second ne part pas, ou part sans tous ses outils (ticket 1435, épique 1427) : le
// runtime vérifie claude, gh et git avant de le lancer (ticket 1433), et l'app relaie ce qu'il en dit
// (terminaux.ts, `empeche` et `manque`). Sa raison, en une phrase, est la note du second ; ici, sous elle, chaque outil
// qui manque, et ce qui mène le chef jusqu'à lui (ticket 4059) : le produit nommé — Claude Code, pas `claude`, que le
// chef peut confondre avec l'app de bureau Claude : le binaire est au survol, avec la raison du runtime —, à quoi il
// sert ici en une ligne, le pas qui l'installe sur cette machine (la commande se copie), pour Claude Code la connexion
// qui suit, et le bouton de sa page. Un second empêché a son bouton « try again », recommandé : il refait la
// vérification et, les outils installés, part — sans relancer l'app (vue.js relit d'abord les outils, ce qui rattache
// au PATH de l'app un outil que son installeur a posé hors de lui). L'onglet n'est jamais vide : sans outil nommé, la
// raison suffit.
// Ce module ne touche pas `document` : il reçoit de quoi créer un élément (briques.js), et rend des éléments.

import { buttonAction, survol } from "./briques.js";
import { phrase } from "./onboarding/journey.js";
import { REESSAYER } from "./lexique.js";
import { NOMS } from "./tools-required/tools-required.js";

/** @typedef {import("./briques.js").Fabrique} Fabrique */
/** @typedef {import("../terminaux.ts").DitDuSecond} DitDuSecond */

export const REESSAYER_LE_SECOND = REESSAYER;
// Le produit, tel que l'écran le dit ; un outil inconnu garde son nom.
/** @param {string} secondTool */
const name = (secondTool) => /** @type {Record<string, string>} */ (NOMS)[secondTool] ?? secondTool;
/** @param {string} secondTool */
const Name = (secondTool) => name(secondTool).replace(/^the /, "The ");
/** @param {string} secondTool */
export const PAGE_DE = (secondTool) => `how to get ${name(secondTool)}`;
// À quoi sert chacun, ici.
/** @type {Record<string, string>} */
const A_QUOI_IL_SERT = {
  claude: "Claude Code is what the second and the cooks run on, with your Max account.",
  gh: "The GitHub CLI is how brigade reads your stations, their rails and your repositories on GitHub.",
  git: "Git makes and keeps the project's local copy, a git clone.",
};
// Après l'installation de Claude Code, la connexion.
const PUIS_LA_CONNECTION = `Once it is installed, click “${REESSAYER}”: the second opens, and Claude Code asks you to sign in with your Max account.`;

/** @param {Fabrique} doc @param {string} balise @param {string} [texte] */
function cree(doc, balise, texte) {
  const pose = doc.createElement(balise);
  if (texte !== undefined) pose.textContent = texte;
  return pose;
}

// `bloque` : le second ne part pas — sinon il tourne, et la raison dit ce qui échouera. Un second qui tourne n'a pas de
// raison dans sa note : elle est en tête de la liste.
/**
 * @param {Fabrique} doc
 * @param {DitDuSecond} dit
 * @param {{ bloque: boolean, reessayer: () => void, ouvrirLaPage: (url: string) => void }} geste
 */
export function poserToolsDuSecond(doc, dit, { bloque: blocked, reessayer, ouvrirLaPage }) {
  const racine = cree(doc, "section");
  racine.className = "outils-du-second";
  racine.classList.toggle("empeche", blocked);
  racine.ariaLabel = blocked ? "Why the second does not start" : "Tools the second is missing";
  if (!blocked && dit.reason !== "") racine.append(phrase(doc, "p", dit.reason));
  if (dit.tools.length > 0) {
    const liste = cree(doc, "ul");
    liste.append(
      ...dit.tools.map(({ tool, reason, install, link }) => {
        const secondTool = cree(doc, "li");
        secondTool.className = "outil-manquant";
        // Le binaire, et pourquoi le runtime le dit absent, au survol — sans accents graves : une bulle ne pose pas de code.
        const aide = survol(doc, reason.replaceAll("`", ""));
        secondTool.append(cree(doc, "strong", Name(tool)), aide);
        const sert = A_QUOI_IL_SERT[tool];
        if (sert !== undefined) {
          const pourquoi = cree(doc, "p", sert);
          pourquoi.className = "pourquoi";
          secondTool.append(pourquoi);
        }
        // Le pas, à plat : sa commande se copie.
        const pas = phrase(doc, "p", install);
        pas.className = "pas";
        secondTool.append(pas);
        if (tool === "claude" && blocked) {
          const connection = cree(doc, "p", PUIS_LA_CONNECTION);
          connection.className = "pas";
          secondTool.append(connection);
        }
        const page = cree(doc, "p");
        page.className = "gestes";
        page.append(buttonAction(doc, PAGE_DE(tool), () => ouvrirLaPage(link), { recommande: !blocked }));
        secondTool.append(page);
        return secondTool;
      }),
    );
    racine.append(liste);
  }
  if (blocked) {
    const actions = cree(doc, "p");
    actions.className = "gestes";
    actions.append(buttonAction(doc, REESSAYER_LE_SECOND, reessayer, { recommande: true }));
    racine.append(actions);
  }
  return racine;
}
