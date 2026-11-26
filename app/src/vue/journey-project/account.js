// @ts-check
// Le compte GitHub de cet ordinateur (ticket 2475), tel que son `gh` le tient (`compteGitHub`, connection-github.ts) —
// jamais tapé. Connecté, le premier lancement le dit, « connected » et « Connected to GitHub as … » (le login en
// évidence), et offre d'en changer en petit lien discret ; sans compte, il n'y a qu'un bouton, « connect to GitHub » ; illisible, il dit pourquoi en une phrase, son détail au survol, avec la
// page qui le lève et « read again ». L'écran « Add a project » (addition.js, ticket 3181) n'en pose que la connexion qui
// manque, ou pourquoi il ne se lit pas : connecté, il ne dit pas le compte, qui se change dans les réglages.
// Changer de compte, c'est se connecter d'un autre dans le navigateur, par le même geste que la connexion ; au bout, le
// compte est relu (`tenirLeCompte`, `apresLaConnexion`) : l'écran dit celui que l'ordinateur tient désormais.
// Ce module ne touche pas `document` : il reçoit de quoi créer un élément (briques.js), et rend des éléments.

import { buttonAction } from "../briques.js";
import { phrase } from "../onboarding/journey.js";
import { buttonDeLaPage, connectionDite, actions } from "./connection.js";
import { lineError } from "../composants/line-error/line-error.js";
import { READ_DE, CET_ORDINATEUR } from "../lexique.js";

/** @typedef {import("../briques.js").Fabrique} Fabrique */
/** @typedef {import("../../connection-github.ts").AccountGitHub} AccountGitHub */
/**
 * Ce que le compte dit. `compte` : absent, sa lecture est en route ; `connexion` : la connexion à GitHub lancée — la même
 * partout dans l'app (connection.js).
 * @typedef {{ compte?: AccountGitHub, connexion?: import("./connection.js").Connection }} StateDuAccount
 */
/**
 * Ses gestes. `changerDeCompte` : se connecter d'un autre compte — le compte est relu au bout.
 * @typedef {{
 *   seConnecter: () => void,
 *   changerDeCompte: () => void,
 *   relireLeCompte: () => void,
 *   ouvrirLaPage: (url: string) => void,
 * }} ActionsDuAccount
 */

export const READ_DU_ACCOUNT = READ_DE(`the GitHub account of ${CET_ORDINATEUR}`);
export const SE_CONNECTER = "connect to GitHub";
export const CHANGER_DE_ACCOUNT = "switch GitHub account";
export const CHANGER_DE_ACCOUNT_SURVOL = "sign in with another GitHub account on the page that opens: brigade then reads it again";
export const STATE_CONNECTE = "connected";
export const RELIRE_LE_ACCOUNT = "read again";
export const SANS_ANSWER = "Your GitHub account could not be read: the app gave no answer.";
/** @param {string} login */
export const connecteEnTantQue = (login) => `Connected to GitHub as ${login}.`;

/** @param {Fabrique} doc @param {string} balise @param {string} [texte] */
function cree(doc, balise, texte) {
  const pose = doc.createElement(balise);
  if (texte !== undefined) pose.textContent = texte;
  return pose;
}

/** @param {Fabrique} doc @param {StateDuAccount} state @param {ActionsDuAccount} action @returns {any[]} */
export function poserLeAccount(doc, state, action) {
  const { compte: account, connexion: connection } = state;
  if (account === undefined) {
    const dit = cree(doc, "p", READ_DU_ACCOUNT);
    dit.className = "dit";
    dit.role = "status";
    return [dit];
  }
  if ("login" in account) {
    const state = cree(doc, "span", STATE_CONNECTE);
    state.className = "etat-connecte";
    const dit = cree(doc, "p");
    dit.className = "compte-connecte";
    const [avant = "", apres = ""] = connecteEnTantQue(account.login).split(account.login);
    const login = cree(doc, "strong", account.login);
    login.className = "mono";
    dit.append(avant, login, apres);
    const [changer, ...suite] = connectionDite(doc, connection, CHANGER_DE_ACCOUNT, { seConnecter: action.changerDeCompte, ouvrirLaPage: action.ouvrirLaPage }, { recommande: false, sorte: "discret" });
    // Un petit lien sous le compte, pas un bouton : la suite du parcours est d'ajouter un projet.
    changer.className = "gestes changer-de-compte";
    changer.dataset.boutons = "lien";
    changer.children[0].children[0].title = CHANGER_DE_ACCOUNT_SURVOL;
    const card = cree(doc, "div");
    card.className = "compte-carte";
    card.append(state, dit);
    return [card, changer, ...suite];
  }
  if ("nonConnecte" in account) return connectionDite(doc, connection, SE_CONNECTER, action);
  const refusal = lineError(doc, phrase(doc, "span", account.refus), account.detail, { classe: "refus" });
  const lien = account.lien;
  return [
    refusal,
    actions(doc, [
      ...(lien === undefined ? [] : [buttonAction(doc, buttonDeLaPage(lien), () => action.ouvrirLaPage(lien), { recommande: true })]),
      buttonAction(doc, RELIRE_LE_ACCOUNT, action.relireLeCompte, { recommande: lien === undefined }),
    ]),
  ];
}

// Le compte lu, tenu pour l'écran : une lecture à la fois — la dernière demandée l'emporte —, et `rendre` à chaque
// changement. `lireUneFois` à l'ouverture du premier lancement ou de l'ajout ; `apresLaConnexion` au bout d'une connexion, ou d'un changement
// de compte : l'ordinateur en tient peut-être un autre.
/**
 * @param {{ pont: { compteGitHub?(): Promise<AccountGitHub> }, rendre: () => void }} options
 * @returns {{ etat: { compte?: AccountGitHub }, lire: () => Promise<void>, lireUneFois: () => void, apresLaConnexion: () => void }}
 */
export function holdLeAccount({ pont, rendre }) {
  /** @type {{ compte?: AccountGitHub }} */
  const state = {};
  let read = 0;
  async function lire() {
    const demandee = ++read;
    delete state.compte;
    rendre();
    /** @type {AccountGitHub} */
    let lu;
    try {
      lu = (await pont.compteGitHub?.()) ?? { refus: SANS_ANSWER };
    } catch (error) {
      lu = { refus: SANS_ANSWER, detail: error instanceof Error ? error.message : String(error) };
    }
    if (demandee !== read) return;
    state.compte = lu;
    rendre();
  }
  return {
    etat: state,
    lire,
    lireUneFois: () => {
      if (read === 0) void lire();
    },
    apresLaConnexion: () => void lire(),
  };
}
