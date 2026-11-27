// @ts-check
// Le compte GitHub de cet ordinateur (ticket 2475), tel que son `gh` le tient (`compteGitHub`, connection-github.ts) —
// jamais tapé. Connecté, le premier lancement le dit, « connected » et « Connected to GitHub as … » (le login en
// évidence), et offre d'en changer en petit lien discret ; sans compte, il n'y a qu'un bouton, « connect to GitHub » ; illisible, il dit pourquoi en une phrase, son détail au survol, avec la
// page qui le lève et « read again ». L'écran « Add a project » (addition.js, ticket 3181) n'en pose que la connexion qui
// manque, ou pourquoi il ne se lit pas : connecté, il ne dit pas le compte, qui se change dans les réglages.
// Changer de compte, c'est se connecter d'un autre dans le navigateur, par le même geste que la connexion ; au bout, le
// compte est relu (`tenirLeCompte`, `apresLaConnexion`) : l'écran dit celui que l'ordinateur tient désormais.
// Ce module ne touche pas `document` : il reçoit de quoi créer un élément (bricks.js), et rend des éléments.

import { buttonAction } from "../bricks.js";
import { sentence } from "../onboarding/journey.js";
import { buttonOfThePage, connectionSaid, actions } from "./connection.js";
import { lineError } from "../components/line-error/line-error.js";
import { READ_OF, THIS_COMPUTER } from "../lexicon.js";

/** @typedef {import("../bricks.js").Fabrique} Fabrique */
/** @typedef {import("../../connection-github.ts").AccountGitHub} AccountGitHub */
/**
 * Ce que le compte dit. `compte` : absent, sa lecture est en route ; `connexion` : la connexion à GitHub lancée — la même
 * partout dans l'app (connection.js).
 * @typedef {{ compte?: AccountGitHub, connexion?: import("./connection.js").Connection }} StateOfAccount
 */
/**
 * Ses gestes. `changerDeCompte` : se connecter d'un autre compte — le compte est relu au bout.
 * @typedef {{
 *   seConnecter: () => void,
 *   changerDeCompte: () => void,
 *   relireLeCompte: () => void,
 *   ouvrirLaPage: (url: string) => void,
 * }} ActionsOfAccount
 */

export const READ_OF_ACCOUNT = READ_OF(`the GitHub account of ${THIS_COMPUTER}`);
export const ITSELF_CONNECT = "connect to GitHub";
export const CHANGE_OF_ACCOUNT = "switch GitHub account";
export const CHANGE_OF_ACCOUNT_HOVER = "sign in with another GitHub account on the page that opens: brigade then reads it again";
export const STATE_CONNECTED = "connected";
export const REREAD_THE_ACCOUNT = "read again";
export const WITHOUT_ANSWER = "Your GitHub account could not be read: the app gave no answer.";
/** @param {string} login */
export const connectedAs = (login) => `Connected to GitHub as ${login}.`;

/** @param {Fabrique} doc @param {string} balise @param {string} [text] */
function created(doc, balise, text) {
  const pose = doc.createElement(balise);
  if (text !== undefined) pose.textContent = text;
  return pose;
}

/** @param {Fabrique} doc @param {StateOfAccount} state @param {ActionsOfAccount} action @returns {any[]} */
export function setTheAccount(doc, state, action) {
  const { compte: account, connexion: connection } = state;
  if (account === undefined) {
    const said = created(doc, "p", READ_OF_ACCOUNT);
    said.className = "dit";
    said.role = "status";
    return [said];
  }
  if ("login" in account) {
    const state = created(doc, "span", STATE_CONNECTED);
    state.className = "etat-connecte";
    const said = created(doc, "p");
    said.className = "compte-connecte";
    const [before = "", after = ""] = connectedAs(account.login).split(account.login);
    const login = created(doc, "strong", account.login);
    login.className = "mono";
    said.append(before, login, after);
    const [change, ...suite] = connectionSaid(doc, connection, CHANGE_OF_ACCOUNT, { seConnecter: action.changerDeCompte, ouvrirLaPage: action.ouvrirLaPage }, { recommande: false, sorte: "discret" });
    // Un petit lien sous le compte, pas un bouton : la suite du parcours est d'ajouter un projet.
    change.className = "gestes changer-de-compte";
    change.dataset.boutons = "lien";
    change.children[0].children[0].title = CHANGE_OF_ACCOUNT_HOVER;
    const card = created(doc, "div");
    card.className = "compte-carte";
    card.append(state, said);
    return [card, change, ...suite];
  }
  if ("nonConnecte" in account) return connectionSaid(doc, connection, ITSELF_CONNECT, action);
  const refusal = lineError(doc, sentence(doc, "span", account.refus), account.detail, { classe: "refus" });
  const link = account.lien;
  return [
    refusal,
    actions(doc, [
      ...(link === undefined ? [] : [buttonAction(doc, buttonOfThePage(link), () => action.ouvrirLaPage(link), { recommande: true })]),
      buttonAction(doc, REREAD_THE_ACCOUNT, action.relireLeCompte, { recommande: link === undefined }),
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
export function holdTheAccount({ pont: bridge, rendre: render }) {
  /** @type {{ compte?: AccountGitHub }} */
  const state = {};
  let reading = 0;
  async function read() {
    const requested = ++reading;
    delete state.compte;
    render();
    /** @type {AccountGitHub} */
    let readOne;
    try {
      readOne = (await bridge.compteGitHub?.()) ?? { refus: WITHOUT_ANSWER };
    } catch (error) {
      readOne = { refus: WITHOUT_ANSWER, detail: error instanceof Error ? error.message : String(error) };
    }
    if (requested !== reading) return;
    state.compte = readOne;
    render();
  }
  return {
    etat: state,
    lire: read,
    lireUneFois: () => {
      if (reading === 0) void read();
    },
    apresLaConnexion: () => void read(),
  };
}
