// @ts-check
// La connexion de cet ordinateur à GitHub, d'un bouton (ticket 1434) — et ce qui se dit autour : le code à taper sur la
// page ouverte, ou pourquoi elle n'a pas abouti. Le compte du premier lancement et de « Add a project » la pose (account.js, ticket 2475),
// comme le rail qu'une station publie (rail-published.js) et les stations du compte (stations-du-account.js) : partout le
// même bouton, les mêmes mots. Une phrase y garde ses mots entre accents graves en code, son détail au survol.
// Ce module ne touche pas `document` : il reçoit de quoi créer un élément (briques.js), et rend des éléments.

import { buttonAction, survol } from "../briques.js";
import { phrase } from "../onboarding/journey.js";
import { lineError } from "../composants/line-error/line-error.js";

/** @typedef {import("../briques.js").Fabrique} Fabrique */
/** @typedef {import("../../connection-github.ts").DebutDeConnection} DebutDeConnection */
/** @typedef {import("../../connection-github.ts").FinDeConnection} FinDeConnection */
// La connexion lancée : en route, son code à taper, ou pourquoi elle n'a pas abouti.
/** @typedef {{ enRoute: true } | DebutDeConnection | FinDeConnection} Connection */

export const CONNECTION_EN_ROUTE = "signing in…";
export const ROUVRIR_LA_PAGE = "open the GitHub page again";
// Le bouton d'une page qu'un échec nomme : « get the GitHub CLI » pour `gh`, « get Git » pour `git`, sinon la page de GitHub.
/** @param {string} url */
export const buttonDeLaPage = (url) => (url.startsWith("https://cli.github.com") ? "get the GitHub CLI" : url.startsWith("https://git-scm.com") ? "get Git" : "open the page on GitHub");
/** @param {string} code */
export const tapeLeCode = (code) => `Type the code ${code} on the GitHub page that opened in your browser.`;

/** @param {Fabrique} doc @param {string} balise @param {string} [texte] */
function cree(doc, balise, texte) {
  const pose = doc.createElement(balise);
  if (texte !== undefined) pose.textContent = texte;
  return pose;
}

// Une phrase — ses mots entre accents graves, `gh`, posés en code, comme partout (onboarding/journey.js) —, et son
// détail — ce que `gh` ou `git` a dit — au survol, jamais à plat.
/** @param {Fabrique} doc @param {string} balise @param {string} texte @param {string | undefined} detail */
export function phraseEtDetail(doc, balise, texte, detail) {
  const pose = cree(doc, balise);
  pose.append(phrase(doc, "span", texte));
  if (detail !== undefined && detail.trim() !== "") pose.append(survol(doc, detail));
  return pose;
}

/** @param {Fabrique} doc @param {any[]} boutons */
export function actions(doc, boutons) {
  const pose = cree(doc, "p");
  pose.className = "gestes";
  pose.append(...boutons);
  return pose;
}

// La connexion à GitHub : son bouton, puis, lancée, le code à taper — ou pourquoi elle n'a pas abouti. Le bouton est le
// geste recommandé, sauf là où un autre l'est (changer de compte, quand un compte est déjà connecté).
/**
 * @param {Fabrique} doc @param {Connection | undefined} connection @param {string} libelle
 * @param {{ seConnecter: () => void, ouvrirLaPage: (url: string) => void }} action @param {{ recommande?: boolean, sorte?: import("../composants/button/button.js").Sorte }} [options]
 */
export function connectionDite(doc, connection, libelle, action, { recommande = true, sorte } = {}) {
  const enRoute = connection !== undefined && ("enRoute" in connection || "code" in connection);
  const button = buttonAction(doc, enRoute ? CONNECTION_EN_ROUTE : libelle, action.seConnecter, { recommande, ...(sorte === undefined ? {} : { sorte }) });
  const pose = [actions(doc, [button])];
  button.children[0].disabled = enRoute;
  if (connection === undefined || "enRoute" in connection || "connecte" in connection) return pose;
  if ("code" in connection) {
    const dit = cree(doc, "p");
    dit.className = "code-de-connexion";
    const [avant = "", apres = ""] = tapeLeCode(connection.code).split(connection.code);
    const code = cree(doc, "strong", connection.code);
    code.className = "mono";
    dit.append(avant, code, apres);
    const page = connection.page;
    return [...pose, dit, actions(doc, [buttonAction(doc, ROUVRIR_LA_PAGE, () => action.ouvrirLaPage(page))])];
  }
  const refusal = lineError(doc, phrase(doc, "span", connection.refus), connection.detail, { classe: "refus" });
  return [...pose, refusal];
}
