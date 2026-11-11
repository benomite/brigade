// @ts-check
// La connexion de cet ordinateur à GitHub, d'un bouton (ticket 1434) — et ce qui se dit autour : le code à taper sur la
// page ouverte, ou pourquoi elle n'a pas abouti. Le compte du premier lancement et de « Add a project » la pose (compte.js, ticket 2475),
// comme le rail qu'une station publie (rail-publie.js) et les stations du compte (stations-du-compte.js) : partout le
// même bouton, les mêmes mots. Une phrase y garde ses mots entre accents graves en code, son détail au survol.
// Ce module ne touche pas `document` : il reçoit de quoi créer un élément (briques.js), et rend des éléments.

import { boutonAction, survol } from "../briques.js";
import { phrase } from "../onboarding/parcours.js";
import { ligneErreur } from "../composants/ligne-erreur/ligne-erreur.js";

/** @typedef {import("../briques.js").Fabrique} Fabrique */
/** @typedef {import("../../connexion-github.ts").DebutDeConnexion} DebutDeConnexion */
/** @typedef {import("../../connexion-github.ts").FinDeConnexion} FinDeConnexion */
// La connexion lancée : en route, son code à taper, ou pourquoi elle n'a pas abouti.
/** @typedef {{ enRoute: true } | DebutDeConnexion | FinDeConnexion} Connexion */

export const CONNEXION_EN_ROUTE = "signing in…";
export const ROUVRIR_LA_PAGE = "open the GitHub page again";
// Le bouton d'une page qu'un échec nomme : « get the GitHub CLI » pour `gh`, « get Git » pour `git`, sinon la page de GitHub.
/** @param {string} url */
export const boutonDeLaPage = (url) => (url.startsWith("https://cli.github.com") ? "get the GitHub CLI" : url.startsWith("https://git-scm.com") ? "get Git" : "open the page on GitHub");
/** @param {string} code */
export const tapeLeCode = (code) => `Type the code ${code} on the GitHub page that opened in your browser.`;

/** @param {Fabrique} doc @param {string} balise @param {string} [texte] */
function cree(doc, balise, texte) {
  const pose = doc.createElement(balise);
  if (texte !== undefined) pose.textContent = texte;
  return pose;
}

// Une phrase — ses mots entre accents graves, `gh`, posés en code, comme partout (onboarding/parcours.js) —, et son
// détail — ce que `gh` ou `git` a dit — au survol, jamais à plat.
/** @param {Fabrique} doc @param {string} balise @param {string} texte @param {string | undefined} detail */
export function phraseEtDetail(doc, balise, texte, detail) {
  const pose = cree(doc, balise);
  pose.append(phrase(doc, "span", texte));
  if (detail !== undefined && detail.trim() !== "") pose.append(survol(doc, detail));
  return pose;
}

/** @param {Fabrique} doc @param {any[]} boutons */
export function gestes(doc, boutons) {
  const pose = cree(doc, "p");
  pose.className = "gestes";
  pose.append(...boutons);
  return pose;
}

// La connexion à GitHub : son bouton, puis, lancée, le code à taper — ou pourquoi elle n'a pas abouti. Le bouton est le
// geste recommandé, sauf là où un autre l'est (changer de compte, quand un compte est déjà connecté).
/**
 * @param {Fabrique} doc @param {Connexion | undefined} connexion @param {string} libelle
 * @param {{ seConnecter: () => void, ouvrirLaPage: (url: string) => void }} geste @param {{ recommande?: boolean }} [options]
 */
export function connexionDite(doc, connexion, libelle, geste, { recommande = true } = {}) {
  const enRoute = connexion !== undefined && ("enRoute" in connexion || "code" in connexion);
  const bouton = boutonAction(doc, enRoute ? CONNEXION_EN_ROUTE : libelle, geste.seConnecter, { recommande });
  const pose = [gestes(doc, [bouton])];
  bouton.children[0].disabled = enRoute;
  if (connexion === undefined || "enRoute" in connexion || "connecte" in connexion) return pose;
  if ("code" in connexion) {
    const dit = cree(doc, "p");
    dit.className = "code-de-connexion";
    const [avant = "", apres = ""] = tapeLeCode(connexion.code).split(connexion.code);
    const code = cree(doc, "strong", connexion.code);
    code.className = "mono";
    dit.append(avant, code, apres);
    const page = connexion.page;
    return [...pose, dit, gestes(doc, [boutonAction(doc, ROUVRIR_LA_PAGE, () => geste.ouvrirLaPage(page))])];
  }
  const refus = ligneErreur(doc, phrase(doc, "span", connexion.refus), connexion.detail, { classe: "refus" });
  return [...pose, refus];
}
