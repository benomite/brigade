// @ts-check
// La connexion de cet ordinateur à GitHub, d'un bouton (ticket 1434) — et ce qui se dit autour : le code à taper sur la
// page ouverte, ou pourquoi elle n'a pas abouti. Le compte du premier lancement et de « Add a project » la pose (account.js, ticket 2475),
// comme les stations du compte (stations-of-account.js) : partout le
// même bouton, les mêmes mots. Une phrase y garde ses mots entre accents graves en code, son détail au survol.
// Ce module ne touche pas `document` : il reçoit de quoi créer un élément (bricks.js), et rend des éléments.

import { buttonAction, sentence } from "../bricks.js";
import { lineError } from "../components/line-error/line-error.js";

/** @typedef {import("../bricks.js").Fabrique} Fabrique */
/** @typedef {import("../../connection-github.ts").StartOfConnection} StartOfConnection */
/** @typedef {import("../../connection-github.ts").EndOfConnection} EndOfConnection */
// La connexion lancée : en route, son code à taper, ou pourquoi elle n'a pas abouti.
/** @typedef {{ enRoute: true } | StartOfConnection | EndOfConnection} Connection */

export const CONNECTION_IN_ROUTE = "signing in…";
export const REOPEN_THE_PAGE = "open the GitHub page again";
// Le bouton d'une page qu'un échec nomme : « get the GitHub CLI » pour `gh`, « get Git » pour `git`, sinon la page de GitHub.
/** @param {string} url */
export const buttonOfThePage = (url) => (url.startsWith("https://cli.github.com") ? "get the GitHub CLI" : url.startsWith("https://git-scm.com") ? "get Git" : "open the page on GitHub");
/** @param {string} code */
export const tapeTheCode = (code) => `Type the code ${code} on the GitHub page that opened in your browser.`;

/** @param {Fabrique} doc @param {string} balise @param {string} [text] */
function created(doc, balise, text) {
  const pose = doc.createElement(balise);
  if (text !== undefined) pose.textContent = text;
  return pose;
}


/** @param {Fabrique} doc @param {any[]} buttons */
export function actions(doc, buttons) {
  const pose = created(doc, "p");
  pose.className = "gestes";
  pose.append(...buttons);
  return pose;
}

// La connexion à GitHub : son bouton, puis, lancée, le code à taper — ou pourquoi elle n'a pas abouti. Le bouton est le
// geste recommandé, sauf là où un autre l'est (changer de compte, quand un compte est déjà connecté).
/**
 * @param {Fabrique} doc @param {Connection | undefined} connection @param {string} wording
 * @param {{ seConnecter: () => void, ouvrirLaPage: (url: string) => void }} action @param {{ recommande?: boolean, sorte?: import("../components/button/button.js").Kind }} [options]
 */
export function connectionSaid(doc, connection, wording, action, { recommande: recommended = true, sorte: kind } = {}) {
  const inRoute = connection !== undefined && ("enRoute" in connection || "code" in connection);
  const button = buttonAction(doc, inRoute ? CONNECTION_IN_ROUTE : wording, action.seConnecter, { recommande: recommended, ...(kind === undefined ? {} : { sorte: kind }) });
  const pose = [actions(doc, [button])];
  button.children[0].disabled = inRoute;
  if (connection === undefined || "enRoute" in connection || "connecte" in connection) return pose;
  if ("code" in connection) {
    const said = created(doc, "p");
    said.className = "code-de-connexion";
    const [before = "", after = ""] = tapeTheCode(connection.code).split(connection.code);
    const code = created(doc, "strong", connection.code);
    code.className = "mono";
    said.append(before, code, after);
    const page = connection.page;
    return [...pose, said, actions(doc, [buttonAction(doc, REOPEN_THE_PAGE, () => action.ouvrirLaPage(page))])];
  }
  const refusal = lineError(doc, sentence(doc, "span", connection.refus), connection.detail, { classe: "refus" });
  return [...pose, refusal];
}
