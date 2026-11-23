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

import { boutonAction, survol } from "./briques.js";
import { phrase } from "./onboarding/parcours.js";
import { REESSAYER } from "./lexique.js";
import { NOMS } from "./outils-requis/outils-requis.js";

/** @typedef {import("./briques.js").Fabrique} Fabrique */
/** @typedef {import("../terminaux.ts").DitDuSecond} DitDuSecond */

export const REESSAYER_LE_SECOND = REESSAYER;
// Le produit, tel que l'écran le dit ; un outil inconnu garde son nom.
/** @param {string} outil */
const nom = (outil) => /** @type {Record<string, string>} */ (NOMS)[outil] ?? outil;
/** @param {string} outil */
const Nom = (outil) => nom(outil).replace(/^the /, "The ");
/** @param {string} outil */
export const PAGE_DE = (outil) => `how to get ${nom(outil)}`;
// À quoi sert chacun, ici.
/** @type {Record<string, string>} */
export const A_QUOI_IL_SERT = {
  claude: "Claude Code is what the second and the cooks run on, with your Max account.",
  gh: "The GitHub CLI is how brigade reads your stations, their rails and your repositories on GitHub.",
  git: "Git makes and keeps the project's local copy, a git clone.",
};
// Après l'installation de Claude Code, la connexion.
export const PUIS_LA_CONNEXION = `Once it is installed, click “${REESSAYER}”: the second opens, and Claude Code asks you to sign in with your Max account.`;

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
export function poserOutilsDuSecond(doc, dit, { bloque, reessayer, ouvrirLaPage }) {
  const racine = cree(doc, "section");
  racine.className = "outils-du-second";
  racine.classList.toggle("empeche", bloque);
  racine.ariaLabel = bloque ? "Why the second does not start" : "Tools the second is missing";
  if (!bloque && dit.reason !== "") racine.append(phrase(doc, "p", dit.reason));
  if (dit.tools.length > 0) {
    const liste = cree(doc, "ul");
    liste.append(
      ...dit.tools.map(({ tool, reason, install, link }) => {
        const outil = cree(doc, "li");
        outil.className = "outil-manquant";
        // Le binaire, et pourquoi le runtime le dit absent, au survol — sans accents graves : une bulle ne pose pas de code.
        const aide = survol(doc, reason.replaceAll("`", ""));
        outil.append(cree(doc, "strong", Nom(tool)), aide);
        const sert = A_QUOI_IL_SERT[tool];
        if (sert !== undefined) {
          const pourquoi = cree(doc, "p", sert);
          pourquoi.className = "pourquoi";
          outil.append(pourquoi);
        }
        // Le pas, à plat : sa commande se copie.
        const pas = phrase(doc, "p", install);
        pas.className = "pas";
        outil.append(pas);
        if (tool === "claude" && bloque) {
          const connexion = cree(doc, "p", PUIS_LA_CONNEXION);
          connexion.className = "pas";
          outil.append(connexion);
        }
        const page = cree(doc, "p");
        page.className = "gestes";
        page.append(boutonAction(doc, PAGE_DE(tool), () => ouvrirLaPage(link), { recommande: !bloque }));
        outil.append(page);
        return outil;
      }),
    );
    racine.append(liste);
  }
  if (bloque) {
    const gestes = cree(doc, "p");
    gestes.className = "gestes";
    gestes.append(boutonAction(doc, REESSAYER_LE_SECOND, reessayer, { recommande: true }));
    racine.append(gestes);
  }
  return racine;
}
