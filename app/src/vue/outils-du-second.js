// @ts-check
// Ce que l'onglet Second dit quand le second ne part pas, ou part sans tous ses outils (ticket 1435, épique 1427) : le
// runtime vérifie claude, gh, git et ssh avant de le lancer (ticket 1433), et l'app relaie ce qu'il en dit
// (terminaux.ts, `empeche` et `manque`). Sa raison, en une phrase, est la note du second ; ici, sous elle, chaque outil
// qui manque, nommé, et le bouton de sa page, qui porte le geste. Pourquoi le second en a besoin et la phrase qui dit
// comment l'obtenir sont au survol : jamais une commande à recopier à plat (règles du ticket 830). Un second empêché a son
// bouton « try again », recommandé : il refait la
// vérification et, les outils installés, part. L'onglet n'est jamais vide : sans outil nommé, la raison suffit.
// Ce module ne touche pas `document` : il reçoit de quoi créer un élément (briques.js), et rend des éléments.

import { boutonAction, survol } from "./briques.js";
import { phrase } from "./onboarding/parcours.js";

/** @typedef {import("./briques.js").Fabrique} Fabrique */
/** @typedef {import("../terminaux.ts").DitDuSecond} DitDuSecond */

export const REESSAYER_LE_SECOND = "try again";
/** @param {string} outil */
export const PAGE_DE = (outil) => `how to get ${outil}`;

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
        const nom = cree(doc, "strong", tool);
        nom.className = "mono";
        // Au survol, sans accents graves : une bulle ne pose pas de code.
        const aide = survol(doc, `${reason} ${install}`.replaceAll("`", ""));
        const page = cree(doc, "p");
        page.className = "gestes";
        page.append(boutonAction(doc, PAGE_DE(tool), () => ouvrirLaPage(link), { recommande: !bloque }));
        outil.append(nom, aide, page);
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
