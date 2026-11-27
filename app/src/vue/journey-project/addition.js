// @ts-check
// L'écran « Add a project » (ticket 3181) : il ne fait que choisir le dépôt. La liste des dépôts du compte GitHub de cet
// ordinateur — les siens et ceux de ses organisations, les plus récemment poussés d'abord (`depotsDuChef`, projects/github.ts) —,
// un champ qui la filtre, et de quoi coller le lien ou le `owner/name` d'un dépôt public qui n'est pas à lui. Rien n'est
// tapé pour les siens : un clic sur l'un l'ouvre — sa copie reprise ou clonée par le runtime, le projet ajouté à la colonne
// de gauche (first-launch.ts) —, et la vue passe à sa page. Ni dossier, ni branche : celle d'intégration est la
// branche par défaut que GitHub donne du dépôt. Rien ne se dit en erreur avant un geste : sans compte connecté, l'écran
// n'a que le bouton de la connexion ; un collage qui n'est pas un dépôt se dit après lui.
// Ce module ne touche pas `document` : il reçoit de quoi créer un élément (bricks.js), et rend des éléments.

import { buttonAction } from "../bricks.js";
import { lineError } from "../components/line-error/line-error.js";
import { ADD_ONE_PROJECT, READ_OF, NOT_REACHED } from "../lexicon.js";
import { sentence } from "../onboarding/journey.js";
import { openingSaid } from "../first-launch.js";
import { setTheAccount } from "./account.js";
import { actions } from "./connection.js";
import { filter } from "./step-project.js";

/** @typedef {import("../bricks.js").Fabrique} Fabrique */
/** @typedef {{ depot: string, base: string }} Repository */
/**
 * Ce que l'écran tient. `compte` : le compte GitHub de cet ordinateur — absent, sa lecture est en route ; `connexion` :
 * la connexion à GitHub lancée. `depots` : ceux du compte — absents, leur lecture est en route ; `{ refus }`, elle a
 * échoué. `saisie` : la recherche et le collage, gardés d'un affichage à l'autre. `refus` : ce qu'un collage a rendu.
 * `ouverture` : le dépôt choisi, que la copie ouvre — l'étape où elle en est, puis, ratée, ce que le runtime en dit.
 * `telephone` : l'app Android, qui n'ajoute aucun projet — elle lit ceux d'un ordinateur sur GitHub.
 * @typedef {{
 *   telephone?: boolean,
 *   compte?: import("../../connection-github.ts").AccountGitHub,
 *   connexion?: import("./connection.js").Connection,
 *   depots?: { depots: readonly Repository[] } | { refus: string },
 *   saisie: { recherche: string, colle: string },
 *   refus?: string,
 *   ouverture?: import("../first-launch.js").StateOfFirst["ouverture"],
 * }} StateOfTheAddition
 */
/**
 * Les gestes de l'écran. `choisir` : ouvrir ce dépôt ; `coller` : lire ce qui a été collé, puis l'ouvrir ; `relire` :
 * relire les dépôts ; `ouvrir` : rouvrir le dépôt dont l'ouverture a raté. Puis ceux de la connexion à GitHub.
 * @typedef {{
 *   choisir: (repository: Repository) => void,
 *   coller: (text: string) => void,
 *   relire: () => void,
 *   ouvrir: (station: string, project: string, repository: string, base?: string) => void,
 *   seConnecter: () => void,
 *   changerDeCompte: () => void,
 *   relireLeCompte: () => void,
 *   ouvrirLaPage: (url: string) => void,
 * }} ActionsOfTheAddition
 */

export const TITLE = ADD_ONE_PROJECT;
export const EXPECTED = "Pick the repository of your project.";
export const WITHOUT_ACCOUNT = "Connect to GitHub to pick one of your repositories.";
export const READING = READ_OF("your repositories on GitHub");
export const UNREADABLE = NOT_REACHED("your repositories");
export const REREAD = "read again";
export const SEARCH = "search your repositories";
export const NO = "No repository matches.";
export const PASTE = "or paste a public repository: its GitHub link, or owner/name";
export const ADD = "add";
export const SINCE_ONE_COMPUTER = "A project is added from a computer, and this phone reads it from GitHub.";
// La ligne qui dit où le dépôt choisi vient d'être cloné : dans le dossier que l'app gère,
// `~/Brigade/<name>` — le dossier du compte écrit `~`, sous macOS, Linux ou Windows.
const HOME = /^(?:\/home|\/Users)\/[^/]+(?=\/|$)|^[A-Za-z]:\\Users\\[^\\]+(?=\\|$)/i;
/** @param {string} folder */
export const CLONE_IN = (folder) => `Cloned into ${folder.replace(HOME, "~")}`;

/** @param {Fabrique} doc @param {string} balise @param {string} [text] */
function created(doc, balise, text) {
  const pose = doc.createElement(balise);
  if (text !== undefined) pose.textContent = text;
  return pose;
}

// L'écran, d'après ce que la vue tient.
/** @param {Fabrique} doc @param {StateOfTheAddition} state @param {ActionsOfTheAddition} action */
export function setTheScreenOfAddition(doc, state, action) {
  const root = created(doc, "section");
  root.className = "ajout-d-un-projet carte";
  root.ariaLabel = TITLE;
  const title = created(doc, "h2", TITLE);
  root.append(title);
  const { compte: account, depots: repositories, saisie: input, ouverture: opening } = state;
  if (state.telephone === true) {
    root.append(created(doc, "p", SINCE_ONE_COMPUTER));
    return root;
  }
  // Le compte d'abord : sa lecture en route, la connexion qui manque, ou pourquoi il ne se lit pas.
  if (account === undefined || !("login" in account)) {
    if (account !== undefined && "nonConnecte" in account) root.append(created(doc, "p", WITHOUT_ACCOUNT));
    root.append(...setTheAccount(doc, state, action));
    return root;
  }
  const inProgress = opening !== undefined && opening.echec === undefined;
  const expected = created(doc, "p", EXPECTED);
  expected.className = "attendu";
  root.append(expected);

  if (repositories === undefined) {
    const said = created(doc, "p", READING);
    said.className = "dit";
    said.role = "status";
    root.append(said);
  } else if ("refus" in repositories) {
    root.append(lineError(doc, UNREADABLE, repositories.refus, { classe: "refus" }), actions(doc, [buttonAction(doc, REREAD, action.relire)]));
  } else {
    const search = created(doc, "input");
    search.type = "search";
    search.className = "recherche";
    search.ariaLabel = SEARCH;
    search.placeholder = SEARCH;
    search.value = input.recherche;
    const list = created(doc, "ul");
    list.className = "depots";
    const setList = () => {
      const seenOnes = filter(repositories.depots, input.recherche);
      list.replaceChildren(
        ...(seenOnes.length === 0
          ? [Object.assign(created(doc, "li", NO), { className: "aucun" })]
          : seenOnes.map((repository) => {
              const line = created(doc, "li");
              line.className = "depot";
              line.dataset.depot = repository.depot;
              const choice = buttonAction(doc, repository.depot, () => action.choisir(repository));
              choice.children[0].disabled = inProgress;
              if (opening?.depot === repository.depot) choice.children[0].ariaPressed = "true";
              line.append(choice);
              return line;
            })),
      );
    };
    search.addEventListener("input", () => {
      input.recherche = search.value ?? "";
      setList();
    });
    setList();
    root.append(search, list);
  }

  // Un dépôt public qui n'est pas au chef : son lien ou son nom, collé.
  const pastes = created(doc, "input");
  pastes.type = "text";
  pastes.className = "colle";
  pastes.ariaLabel = PASTE;
  pastes.placeholder = PASTE;
  pastes.value = input.colle;
  pastes.autocomplete = "off";
  pastes.spellcheck = false;
  pastes.addEventListener("input", () => void (input.colle = pastes.value ?? ""));
  const paste = () => {
    if (!inProgress) action.coller(input.colle);
  };
  pastes.addEventListener("keydown", (/** @type {{ key: string }} */ event) => {
    if (event.key === "Enter") paste();
  });
  const add = buttonAction(doc, ADD, paste);
  add.children[0].disabled = inProgress;
  const lineOfPaste = created(doc, "p");
  lineOfPaste.className = "coller";
  lineOfPaste.append(pastes, add);
  root.append(lineOfPaste);
  if (state.refus !== undefined) root.append(lineError(doc, sentence(doc, "span", state.refus), undefined, { classe: "refus", alerte: true }));
  if (opening !== undefined && opening.station === "") root.append(...openingSaid(doc, opening, state.connexion === undefined ? {} : { connexion: state.connexion }, action));
  return root;
}
