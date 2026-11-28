// @ts-check
// Le premier lancement de l'app sur un ordinateur neuf (ticket 1434, épique 1427) : à la place de « Tous les
// projets », tant que le fichier des projets n'en a aucun. Le chef y retrouve les stations qu'il a appairées et les
// projets que chacune porte, tels que le runtime les lit sur GitHub (ticket 1428), et en ouvre un d'un clic — sans dossier
// à choisir : sa copie est reprise ou clonée par le runtime (ticket 1429), et l'écran dit où elle en est.
// En tête de l'écran, la phrase d'accueil, puis le compte GitHub de cet ordinateur (journey-project/account.js) : lu,
// jamais tapé, et une connexion qui manque s'y fait d'un bouton. Sous lui, toujours une phrase sur les stations : ce qu'on en attend du chef,
// ou pourquoi rien ne se lit — sa raison en une phrase, son détail au survol, et le bouton de la page qui la lève quand
// le runtime en nomme une. L'écran n'est jamais vide.
// Sous elle, le projet qu'il veut cuisiner — un dépôt `owner/repo`, ou un nom seul que complète le compte connecté. Rien
// n'y est prérempli ; son exemple est neutre. L'écran « Add a project », qui choisit parmi ses dépôts (ticket 3181), reste
// à un clic, sous la liste. Sous le compte, les deux choix du nouveau venu, côte à côte (ticket 4087, home/choice/choice.js) :
// « visit a real kitchen » et « add my project ». Rien ne s'ouvre ni ne s'ajoute de lui-même.
// Ce module ne touche pas `document` : il reçoit de quoi créer un élément (bricks.js), et rend des éléments.

import { buttonAction } from "./bricks.js";
import { sentence } from "./onboarding/journey.js";
import { buttonOfThePage, connectionSaid, actions, sentenceAndDetail } from "./journey-project/connection.js";
import { setTheAccount, ITSELF_CONNECT } from "./journey-project/account.js";
import { button as buttonOfTheFamily } from "./components/button/button.js";
import { lineEmpty } from "./components/line-empty/line-empty.js";
import { lineError } from "./components/line-error/line-error.js";
import { RETRY, NOT_STILL } from "./lexicon.js";
import { setTheTwoChoice } from "./home/choice/choice.js";
import { setTheTools } from "./tools-required/tools-required.js";

// La connexion à GitHub et ses mots, dits pareil partout : le rail publié et les stations du compte les prennent ici.
export { buttonOfThePage, connectionSaid, CONNECTION_IN_ROUTE, actions, sentenceAndDetail, REOPEN_THE_PAGE, tapeTheCode } from "./journey-project/connection.js";

/** @typedef {import("./bricks.js").Fabrique} Fabrique */
/** @typedef {import("../first-launch.ts").StationsOfChef} StationsOfChef */
/** @typedef {import("../first-launch.ts").StationPaired} Station */
/** @typedef {import("../first-launch.ts").Opening} Opening */
/** @typedef {import("../first-launch.ts").Progress} Progress */
/** @typedef {import("../connection-github.ts").AccountGitHub} AccountGitHub */
/** @typedef {import("./journey-project/connection.js").Connection} Connection */
/** @typedef {import("./journey-project/account.js").ActionsOfAccount} ActionsOfAccount */

// Ce que la vue tient de l'écran. `stations` : absentes, leur lecture est en route. `ouverture` : le projet qu'un
// clic ouvre — sa branche d'intégration quand GitHub l'a donnée, l'étape de sa copie, puis, ratée, ce que le runtime en dit —
// ou, Claude Code pas connecté sur cet ordinateur, rien de commencé (ticket 4057) et ce que son login a rendu. `connexion` : la connexion à GitHub
// lancée — en route, son code à taper, ou pourquoi elle n'a pas abouti. `compte` : le compte GitHub de cet
// ordinateur, que l'écran dit en tête — absent, sa lecture est en route.
/**
 * @typedef {{
 *   poste: string,
 *   stations?: StationsOfChef,
 *   ouverture?: { station: string, projet: string, depot: string, base?: string, etape?: Progress, echec?: Extract<Opening, { state: "failed" | "login" }> },
 *   connexion?: Connection,
 *   compte?: AccountGitHub,
 *   saisie?: { projet: string },
 *   outils?: import("./tools-required/tools-required.js").StateOfTools,
 * }} StateOfFirst
 */
/**
 * @typedef {{
 *   ouvrir: (station: string, project: string, repository: string, base?: string) => void,
 *   seConnecter: () => void,
 *   relire: () => void,
 *   ouvrirLaPage: (url: string) => void,
 *   ajouterUnProjet: () => void,
 *   visiter?: () => void,
 *   outils?: { ouvrir: (url: string) => void, verifier: () => void },
 * } & ActionsOfAccount} ActionsOfFirst
 */

export const PROJECT = "The project to work on";
export const PROJECT_EXAMPLE = "owner/repo";
export const OPEN_THIS_PROJECT = "open this project";
export const PROJECT_MISSING = "Type the project to work on: its GitHub repository, `owner/repo`.";
export const ACCOUNT_MISSING = "Connect to GitHub above, or type the project as `owner/repo`: a name alone does not say whose it is.";
export const PROJECT_UNREADABLE = "This is not a GitHub repository, `owner/repo`.";
// Ce que l'app fait pendant qu'elle lit (elle cherche les stations liées au compte GitHub de cet ordinateur), et la suite sans station :
// le formulaire et « pick one of your repositories instead » restent sous la phrase (sans station, le projet s'ouvre sur cet ordinateur).
export const READING = "Looking for the stations linked to your GitHub account… If you have no station yet, go on to the next step: type the project to work on below, or add one of your repositories.";
/** @param {string} workstation */
export const OPEN_ONE_PROJECT = (workstation) => `Open one of your projects on ${workstation}: one click, no folder to choose.`;
export const REREAD = "read again";
export { RETRY };
export const BY_ITS_REPOSITORIES = "pick one of your repositories instead";
export const WELCOME = "Welcome to brigade. Add the first project its kitchen will cook.";
export const WITHOUT_PROJECT = NOT_STILL("project on this station");
export const REPOSITORY_UNKNOWN = "its station does not say which GitHub repository it is, so it cannot be cloned from here";
export const WITHOUT_KITCHEN = "does not cook";
/** @param {string} project */
export const openingOf = (project) => `Opening ${project}…`;

// Ce que le chef a tapé, lu : un dépôt `owner/repo` — ou un nom seul, complété par le compte connecté —, sinon pourquoi
// rien ne s'ouvre. Rien n'est deviné : l'adresse de GitHub se reconnaît, le reste se refuse. Le nom du projet est celui du
// dépôt, en minuscules : l'écran « Add a project » (journey-project/addition.js) le nomme de même.
/** @param {string} account @param {string} project @returns {{ depot: string, nom: string } | { refus: string }} */
export function readTheProject(account, project) {
  const said = project.trim();
  const who = account.trim();
  if (said === "") return { refus: PROJECT_MISSING };
  const withoutAddress = said.replace(/^https?:\/\/github\.com\//, "").replace(/\/+$/, "").replace(/\.git$/, "");
  const complete = /^[A-Za-z0-9][A-Za-z0-9-]*\/[A-Za-z0-9_.-]+$/.test(withoutAddress) ? withoutAddress : /^[A-Za-z0-9_.-]+$/.test(withoutAddress) && who !== "" ? `${who}/${withoutAddress}` : undefined;
  if (complete === undefined) return { refus: /^[A-Za-z0-9_.-]+$/.test(withoutAddress) ? ACCOUNT_MISSING : PROJECT_UNREADABLE };
  if (!/^[A-Za-z0-9][A-Za-z0-9-]*\/[A-Za-z0-9_.-]+$/.test(complete)) return { refus: PROJECT_UNREADABLE };
  const name = (complete.split("/")[1] ?? "").toLowerCase().replace(/[^a-z0-9-]+/g, "-").replace(/^-+|-+$/g, "");
  return name === "" ? { refus: PROJECT_UNREADABLE } : { depot: complete, nom: name };
}

/** @param {Fabrique} doc @param {string} balise @param {string} [text] */
function created(doc, balise, text) {
  const pose = doc.createElement(balise);
  if (text !== undefined) pose.textContent = text;
  return pose;
}

// Où en est le projet qu'un clic ouvre — sa copie en cours, ou ce qui l'a empêchée, avec ses gestes. Sous sa station, ou
// sous le formulaire quand il vient de là (station vide) — ou sous la liste de l'écran « Add a project » (addition.js).
/**
 * @param {Fabrique} doc @param {NonNullable<StateOfFirst["ouverture"]>} opening @param {{ connexion?: Connection }} state
 * @param {Pick<ActionsOfFirst, "ouvrir" | "seConnecter" | "ouvrirLaPage">} action
 */
export function openingSaid(doc, opening, state, action) {
  if (opening.echec === undefined) {
    const said = created(doc, "p", opening.etape?.sentence ?? openingOf(opening.projet));
    said.className = "ouverture";
    said.role = "status";
    return [said];
  }
  const { echec: failure } = opening;
  const retry = buttonAction(doc, RETRY, () => action.ouvrir(opening.station, opening.projet, opening.depot, opening.base));
  // Claude Code pas connecté (ticket 4057) : rien n'a commencé. Le chef s'y connecte, puis réessaie.
  if (failure.state === "login") return [lineError(doc, sentence(doc, "span", failure.reason), undefined, { classe: "refus" }), actions(doc, [retry])];
  const refusal = lineError(doc, sentence(doc, "span", failure.reason), failure.detail, { classe: "refus" });
  const link = "link" in failure ? failure.link : undefined;
  return [
    refusal,
    // Le bouton de la connexion, dit des mots du compte : un même geste, un même nom sur l'écran.
    ...("action" in failure && failure.action !== undefined ? connectionSaid(doc, state.connexion, ITSELF_CONNECT, action) : []),
    actions(doc, [
      ...(link === undefined ? [] : [buttonAction(doc, buttonOfThePage(link), () => action.ouvrirLaPage(link), { recommande: !("action" in failure && failure.action !== undefined) })]),
      retry,
    ]),
  ];
}

// Une station : sa pastille, son nom, son état — sa machine et sa version au survol —, puis ses projets, chacun un
// bouton qui l'ouvre. Celui qu'un clic ouvre dit, sous la liste, où en est sa copie, ou pourquoi elle a échoué.
/** @param {Fabrique} doc @param {Station} station @param {StateOfFirst} state @param {ActionsOfFirst} action */
function stationSaid(doc, station, state, action) {
  const card = created(doc, "section");
  card.className = "carte station-du-chef";
  card.ariaLabel = station.name;
  const head = created(doc, "p");
  head.className = "tete-de-station";
  head.title = [station.machine, station.version === "" ? "" : `version ${station.version}`].filter((piece) => piece !== "").join(" · ");
  const stateSays = station.online ? "online" : "offline";
  const pill = created(doc, "span");
  pill.className = "pastille";
  // Le ton et sa forme, comme partout dans la vue (vue.js, `pastille`) : un disque plein, un anneau creux.
  pill.dataset.ton = station.online ? "vert" : "gris";
  pill.dataset.forme = station.online ? "disque" : "anneau";
  pill.title = stateSays;
  const name = created(doc, "strong", station.name);
  name.className = "mono";
  head.append(pill, name, created(doc, "span", station.cooks ? stateSays : `${stateSays} · ${WITHOUT_KITCHEN}`));
  card.append(head);
  const { ouverture: opening } = state;
  const inProgress = opening !== undefined && opening.echec === undefined;
  if (station.projects.length === 0) {
    const empty = lineEmpty(doc, WITHOUT_PROJECT);
    card.append(empty);
    return card;
  }
  const list = created(doc, "p");
  list.className = "gestes projets-de-station";
  for (const project of station.projects) {
    const repository = project.repository;
    const button = buttonOfTheFamily(doc, project.name, undefined);
    button.className = "mono";
    button.title = repository ?? REPOSITORY_UNKNOWN;
    button.disabled = repository === null || inProgress;
    if (opening?.station === station.id && opening.projet === project.name) button.ariaPressed = "true";
    if (repository !== null) button.addEventListener("click", () => action.ouvrir(station.id, project.name, repository));
    list.append(button);
  }
  card.append(list);
  if (opening === undefined || opening.station !== station.id) return card;
  card.append(...openingSaid(doc, opening, state, action));
  return card;
}

// Le formulaire : le projet du chef, un champ vide à l'exemple neutre — son compte est celui que l'écran dit en tête
// connecté, jamais tapé. Ce qui est tapé se garde dans `etat.saisie` d'un affichage à l'autre. Un dépôt s'ouvre par la
// copie du runtime ; ce qui ne se lit pas le dit sous le champ, en une phrase.
/** @param {Fabrique} doc @param {StateOfFirst} state @param {ActionsOfFirst} action */
function formOfProject(doc, state, action) {
  const input = state.saisie ?? { projet: "" };
  const account = state.compte !== undefined && "login" in state.compte ? state.compte.login : "";
  const root = created(doc, "div");
  root.className = "formulaire-du-premier";
  /** @param {string} id @param {string} wording @param {string} example @param {"projet"} key */
  const field = (id, wording, example, key) => {
    const name = created(doc, "label", wording);
    name.htmlFor = id;
    const entry = created(doc, "input");
    entry.id = id;
    entry.placeholder = example;
    entry.value = input[key];
    entry.autocomplete = "off";
    entry.spellcheck = false;
    entry.addEventListener("input", () => void (input[key] = entry.value));
    return [name, entry];
  };
  const refusal = lineError(doc, "", "", { classe: "refus-champ" });
  refusal.ariaLive = "polite";
  const open = () => {
    const readOne = readTheProject(account, input.projet);
    if ("refus" in readOne) return void sentenceTo(doc, refusal, readOne.refus);
    sentenceTo(doc, refusal, "");
    action.ouvrir("", readOne.nom, readOne.depot);
  };
  const inProgress = state.ouverture !== undefined && state.ouverture.echec === undefined;
  // Tant qu'aucun compte n'est connecté, le geste recommandé est celui du compte.
  const button = buttonAction(doc, OPEN_THIS_PROJECT, open, { recommande: account !== "" });
  button.children[0].disabled = inProgress;
  root.append(...field("projet-du-premier", PROJECT, PROJECT_EXAMPLE, "projet"), refusal, actions(doc, [button]));
  if (state.ouverture?.station === "") root.append(...openingSaid(doc, state.ouverture, state, action));
  return root;
}

// Une phrase posée dans un élément qui existe déjà, ses mots entre accents graves en code.
/** @param {Fabrique} doc @param {any} pose @param {string} text */
function sentenceTo(doc, pose, text) {
  pose.replaceChildren(...(text === "" ? [] : [sentence(doc, "span", text)]));
}

// L'écran entier, d'après ce que la vue tient : la phrase d'accueil et le compte, puis la phrase des stations et ce qui
// suit de leur état. Une connexion qui manque se fait du compte, en tête : la phrase des stations le dit, sans second
// bouton.
/** @param {Fabrique} doc @param {StateOfFirst} state @param {ActionsOfFirst} action */
export function setFirstLaunch(doc, state, action) {
  const root = created(doc, "div");
  root.className = "premier-lancement";
  // Au premier lancement, chaque bouton est le grand, 44 px (components/button, ticket 2916).
  root.dataset.boutons = "grands";
  const home = created(doc, "p", WELCOME);
  home.className = "bienvenue";
  const account = created(doc, "div");
  account.className = "compte-du-premier";
  root.append(home, account, setTheTwoChoice(doc, { visiter: action.visiter, ajouter: action.ajouterUnProjet }));
  // Un outil qui manque (ticket 4059) tient la place du compte : sans lui, ni la connexion ni le clone ne partent. Le
  // projet tapé reste dessous, tel quel ; les stations, qui ne se lisent pas sans lui, attendent.
  const tools = state.outils === undefined || action.outils === undefined ? [] : setTheTools(doc, state.outils, action.outils);
  if (state.outils?.manque !== undefined) {
    account.append(...tools);
    root.append(formOfProject(doc, state, action), actions(doc, [buttonAction(doc, BY_ITS_REPOSITORIES, action.ajouterUnProjet)]));
    return root;
  }
  account.append(...tools, ...setTheAccount(doc, { ...(state.compte === undefined ? {} : { compte: state.compte }), ...(state.connexion === undefined ? {} : { connexion: state.connexion }) }, action));
  const { stations } = state;
  /** @param {string} text @param {string} [detail] */
  const inHead = (text, detail) => {
    const head = sentenceAndDetail(doc, "h3", text, detail);
    head.className = "tete-des-stations";
    return head;
  };
  const form = () => formOfProject(doc, state, action);
  if (stations === undefined) {
    root.append(inHead(READING), form());
  } else if (stations.state === "sign-in-required") {
    root.append(inHead(stations.reason), form());
  } else if (stations.state === "unavailable") {
    // La page qui lève la panne n'est offerte qu'une fois : le compte, qui bute sur la même, l'offre déjà.
    const link = state.compte !== undefined && "lien" in state.compte && state.compte.lien === stations.link ? undefined : stations.link;
    const accountRead = state.compte !== undefined && "login" in state.compte;
    root.append(
      inHead(stations.reason, stations.detail),
      form(),
      actions(doc, [...(link === undefined ? [] : [buttonAction(doc, buttonOfThePage(link), () => action.ouvrirLaPage(link), { recommande: true })]), buttonAction(doc, REREAD, action.relire, { recommande: link === undefined && accountRead })]),
    );
  } else if (stations.stations.length === 0) {
    root.append(inHead(stations.reason ?? "No station is paired with this GitHub account yet."), form(), actions(doc, [buttonAction(doc, REREAD, action.relire)]));
  } else {
    root.append(inHead(OPEN_ONE_PROJECT(state.poste)), form(), ...stations.stations.map((station) => stationSaid(doc, station, state, action)));
    if (stations.unreadable.length > 0) {
      const howMany = stations.unreadable.length;
      const unreadable = lineError(doc, `${howMany} more station${howMany > 1 ? "s" : ""} cannot be read`, stations.unreadable.map(({ id, reason }) => `${id}: ${reason}`).join("\n"));
      root.append(unreadable);
    }
  }
  root.append(actions(doc, [buttonAction(doc, BY_ITS_REPOSITORIES, action.ajouterUnProjet)]));
  return root;
}
