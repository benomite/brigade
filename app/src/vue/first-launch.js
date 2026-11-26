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
// Ce module ne touche pas `document` : il reçoit de quoi créer un élément (briques.js), et rend des éléments.

import { buttonAction } from "./briques.js";
import { phrase } from "./onboarding/journey.js";
import { buttonDeLaPage, connectionDite, actions, phraseEtDetail } from "./journey-project/connection.js";
import { poserLeAccount, SE_CONNECTER } from "./journey-project/account.js";
import { button as buttonDeLaFamille } from "./composants/button/button.js";
import { lineEmpty } from "./composants/line-empty/line-empty.js";
import { lineError } from "./composants/line-error/line-error.js";
import { REESSAYER, PAS_ENCORE } from "./lexique.js";
import { poserLesDeuxChoice } from "./home/choice/choice.js";
import { poserLesTools } from "./tools-required/tools-required.js";

// La connexion à GitHub et ses mots, dits pareil partout : le rail publié et les stations du compte les prennent ici.
export { buttonDeLaPage, connectionDite, CONNECTION_EN_ROUTE, actions, phraseEtDetail, ROUVRIR_LA_PAGE, tapeLeCode } from "./journey-project/connection.js";

/** @typedef {import("./briques.js").Fabrique} Fabrique */
/** @typedef {import("../first-launch.ts").StationsDuChef} StationsDuChef */
/** @typedef {import("../first-launch.ts").StationAppairee} Station */
/** @typedef {import("../first-launch.ts").Ouverture} Ouverture */
/** @typedef {import("../first-launch.ts").Progres} Progres */
/** @typedef {import("../connection-github.ts").AccountGitHub} AccountGitHub */
/** @typedef {import("./journey-project/connection.js").Connection} Connection */
/** @typedef {import("./journey-project/account.js").ActionsDuAccount} ActionsDuAccount */

// Ce que la vue tient de l'écran. `stations` : absentes, leur lecture est en route. `ouverture` : le projet qu'un
// clic ouvre — sa branche d'intégration quand GitHub l'a donnée, l'étape de sa copie, puis, ratée, ce que le runtime en dit —
// ou, Claude Code pas connecté sur cet ordinateur, rien de commencé (ticket 4057) et ce que son login a rendu. `connexion` : la connexion à GitHub
// lancée — en route, son code à taper, ou pourquoi elle n'a pas abouti. `compte` : le compte GitHub de cet
// ordinateur, que l'écran dit en tête — absent, sa lecture est en route.
/**
 * @typedef {{
 *   poste: string,
 *   stations?: StationsDuChef,
 *   ouverture?: { station: string, projet: string, depot: string, base?: string, etape?: Progres, echec?: Extract<Ouverture, { state: "failed" | "login" }>, login?: import("../outages/actions.ts").RenduDeOutage },
 *   connexion?: Connection,
 *   compte?: AccountGitHub,
 *   saisie?: { projet: string },
 *   outils?: import("./tools-required/tools-required.js").StateDesTools,
 * }} StateDuFirst
 */
/**
 * @typedef {{
 *   ouvrir: (station: string, project: string, repository: string, base?: string) => void,
 *   seConnecter: () => void,
 *   seConnecterAClaude?: () => void,
 *   relire: () => void,
 *   ouvrirLaPage: (url: string) => void,
 *   ajouterUnProjet: () => void,
 *   visiter?: () => void,
 *   outils?: { ouvrir: (url: string) => void, verifier: () => void },
 * } & ActionsDuAccount} ActionsDuFirst
 */

export const PROJECT = "The project to work on";
export const PROJECT_EXEMPLE = "owner/repo";
export const OUVRIR_CE_PROJECT = "open this project";
export const PROJECT_MANQUE = "Type the project to work on: its GitHub repository, `owner/repo`.";
export const ACCOUNT_MANQUE = "Connect to GitHub above, or type the project as `owner/repo`: a name alone does not say whose it is.";
export const PROJECT_ILLISIBLE = "This is not a GitHub repository, `owner/repo`.";
// Ce que l'app fait pendant qu'elle lit (elle cherche les stations liées au compte GitHub de cet ordinateur), et la suite sans station :
// le formulaire et « pick one of your repositories instead » restent sous la phrase (sans station, le projet s'ouvre sur cet ordinateur).
export const READ = "Looking for the stations linked to your GitHub account… If you have no station yet, go on to the next step: type the project to work on below, or add one of your repositories.";
/** @param {string} workstation */
export const OUVRIR_UN_PROJECT = (workstation) => `Open one of your projects on ${workstation}: one click, no folder to choose.`;
export const RELIRE = "read again";
export { REESSAYER };
export const PAR_SES_DEPOTS = "pick one of your repositories instead";
export const BIENVENUE = "Welcome to brigade. Add the first project its kitchen will cook.";
export const SANS_PROJECT = PAS_ENCORE("project on this station");
export const REPOSITORY_INCONNU = "its station does not say which GitHub repository it is, so it cannot be cloned from here";
export const SANS_KITCHEN = "does not cook";
/** @param {string} project */
export const ouvertureDe = (project) => `Opening ${project}…`;
// Le geste qui connecte Claude Code sur cet ordinateur : le mot du bouton de la panne « Max connection lost » (outages/outages.ts).
export const SE_CONNECTER_A_CLAUDE = "log in";

// Ce que le chef a tapé, lu : un dépôt `owner/repo` — ou un nom seul, complété par le compte connecté —, sinon pourquoi
// rien ne s'ouvre. Rien n'est deviné : l'adresse de GitHub se reconnaît, le reste se refuse. Le nom du projet est celui du
// dépôt, en minuscules : l'écran « Add a project » (journey-project/addition.js) le nomme de même.
/** @param {string} account @param {string} project @returns {{ depot: string, nom: string } | { refus: string }} */
export function lireLeProject(account, project) {
  const dit = project.trim();
  const qui = account.trim();
  if (dit === "") return { refus: PROJECT_MANQUE };
  const sansAdresse = dit.replace(/^https?:\/\/github\.com\//, "").replace(/\/+$/, "").replace(/\.git$/, "");
  const complet = /^[A-Za-z0-9][A-Za-z0-9-]*\/[A-Za-z0-9_.-]+$/.test(sansAdresse) ? sansAdresse : /^[A-Za-z0-9_.-]+$/.test(sansAdresse) && qui !== "" ? `${qui}/${sansAdresse}` : undefined;
  if (complet === undefined) return { refus: /^[A-Za-z0-9_.-]+$/.test(sansAdresse) ? ACCOUNT_MANQUE : PROJECT_ILLISIBLE };
  if (!/^[A-Za-z0-9][A-Za-z0-9-]*\/[A-Za-z0-9_.-]+$/.test(complet)) return { refus: PROJECT_ILLISIBLE };
  const name = (complet.split("/")[1] ?? "").toLowerCase().replace(/[^a-z0-9-]+/g, "-").replace(/^-+|-+$/g, "");
  return name === "" ? { refus: PROJECT_ILLISIBLE } : { depot: complet, nom: name };
}

/** @param {Fabrique} doc @param {string} balise @param {string} [texte] */
function cree(doc, balise, texte) {
  const pose = doc.createElement(balise);
  if (texte !== undefined) pose.textContent = texte;
  return pose;
}

// Où en est le projet qu'un clic ouvre — sa copie en cours, ou ce qui l'a empêchée, avec ses gestes. Sous sa station, ou
// sous le formulaire quand il vient de là (station vide) — ou sous la liste de l'écran « Add a project » (addition.js).
/**
 * @param {Fabrique} doc @param {NonNullable<StateDuFirst["ouverture"]>} ouverture @param {{ connexion?: Connection }} state
 * @param {Pick<ActionsDuFirst, "ouvrir" | "seConnecter" | "seConnecterAClaude" | "ouvrirLaPage">} action
 */
export function ouvertureDite(doc, ouverture, state, action) {
  if (ouverture.echec === undefined) {
    const dit = cree(doc, "p", ouverture.etape?.sentence ?? ouvertureDe(ouverture.projet));
    dit.className = "ouverture";
    dit.role = "status";
    return [dit];
  }
  const { echec: failure } = ouverture;
  const reessayer = buttonAction(doc, REESSAYER, () => action.ouvrir(ouverture.station, ouverture.projet, ouverture.depot, ouverture.base));
  // Claude Code pas connecté (ticket 4057) : rien n'a commencé. « log in » lance son login ; la copie repart quand il finit.
  if (failure.state === "login") {
    const login = ouverture.login;
    return [
      lineError(doc, phrase(doc, "span", failure.reason), undefined, { classe: "refus" }),
      ...(login === undefined || "outilManquant" in login ? [] : ["fait" in login ? phrase(doc, "p", login.fait) : lineError(doc, phrase(doc, "span", login.refus), undefined, { classe: "refus" })]),
      actions(doc, [...(action.seConnecterAClaude === undefined ? [] : [buttonAction(doc, SE_CONNECTER_A_CLAUDE, () => action.seConnecterAClaude?.(), { recommande: true })]), reessayer]),
    ];
  }
  const refusal = lineError(doc, phrase(doc, "span", failure.reason), failure.detail, { classe: "refus" });
  const lien = "link" in failure ? failure.link : undefined;
  return [
    refusal,
    // Le bouton de la connexion, dit des mots du compte : un même geste, un même nom sur l'écran.
    ...("action" in failure && failure.action !== undefined ? connectionDite(doc, state.connexion, SE_CONNECTER, action) : []),
    actions(doc, [
      ...(lien === undefined ? [] : [buttonAction(doc, buttonDeLaPage(lien), () => action.ouvrirLaPage(lien), { recommande: !("action" in failure && failure.action !== undefined) })]),
      reessayer,
    ]),
  ];
}

// Une station : sa pastille, son nom, son état — sa machine et sa version au survol —, puis ses projets, chacun un
// bouton qui l'ouvre. Celui qu'un clic ouvre dit, sous la liste, où en est sa copie, ou pourquoi elle a échoué.
/** @param {Fabrique} doc @param {Station} station @param {StateDuFirst} state @param {ActionsDuFirst} action */
function stationDite(doc, station, state, action) {
  const card = cree(doc, "section");
  card.className = "carte station-du-chef";
  card.ariaLabel = station.name;
  const tete = cree(doc, "p");
  tete.className = "tete-de-station";
  tete.title = [station.machine, station.version === "" ? "" : `version ${station.version}`].filter((morceau) => morceau !== "").join(" · ");
  const stateDit = station.online ? "online" : "offline";
  const pill = cree(doc, "span");
  pill.className = "pastille";
  // Le ton et sa forme, comme partout dans la vue (vue.js, `pastille`) : un disque plein, un anneau creux.
  pill.dataset.ton = station.online ? "vert" : "gris";
  pill.dataset.forme = station.online ? "disque" : "anneau";
  pill.title = stateDit;
  const name = cree(doc, "strong", station.name);
  name.className = "mono";
  tete.append(pill, name, cree(doc, "span", station.cooks ? stateDit : `${stateDit} · ${SANS_KITCHEN}`));
  card.append(tete);
  const { ouverture } = state;
  const enCours = ouverture !== undefined && ouverture.echec === undefined;
  if (station.projects.length === 0) {
    const empty = lineEmpty(doc, SANS_PROJECT);
    card.append(empty);
    return card;
  }
  const liste = cree(doc, "p");
  liste.className = "gestes projets-de-station";
  for (const project of station.projects) {
    const repository = project.repository;
    const button = buttonDeLaFamille(doc, project.name, undefined);
    button.className = "mono";
    button.title = repository ?? REPOSITORY_INCONNU;
    button.disabled = repository === null || enCours;
    if (ouverture?.station === station.id && ouverture.projet === project.name) button.ariaPressed = "true";
    if (repository !== null) button.addEventListener("click", () => action.ouvrir(station.id, project.name, repository));
    liste.append(button);
  }
  card.append(liste);
  if (ouverture === undefined || ouverture.station !== station.id) return card;
  card.append(...ouvertureDite(doc, ouverture, state, action));
  return card;
}

// Le formulaire : le projet du chef, un champ vide à l'exemple neutre — son compte est celui que l'écran dit en tête
// connecté, jamais tapé. Ce qui est tapé se garde dans `etat.saisie` d'un affichage à l'autre. Un dépôt s'ouvre par la
// copie du runtime ; ce qui ne se lit pas le dit sous le champ, en une phrase.
/** @param {Fabrique} doc @param {StateDuFirst} state @param {ActionsDuFirst} action */
function formulaireDuProject(doc, state, action) {
  const saisie = state.saisie ?? { projet: "" };
  const account = state.compte !== undefined && "login" in state.compte ? state.compte.login : "";
  const racine = cree(doc, "div");
  racine.className = "formulaire-du-premier";
  /** @param {string} id @param {string} libelle @param {string} exemple @param {"projet"} cle */
  const champ = (id, libelle, exemple, cle) => {
    const name = cree(doc, "label", libelle);
    name.htmlFor = id;
    const entree = cree(doc, "input");
    entree.id = id;
    entree.placeholder = exemple;
    entree.value = saisie[cle];
    entree.autocomplete = "off";
    entree.spellcheck = false;
    entree.addEventListener("input", () => void (saisie[cle] = entree.value));
    return [name, entree];
  };
  const refusal = lineError(doc, "", "", { classe: "refus-champ" });
  refusal.ariaLive = "polite";
  const ouvrir = () => {
    const lu = lireLeProject(account, saisie.projet);
    if ("refus" in lu) return void phraseVers(doc, refusal, lu.refus);
    phraseVers(doc, refusal, "");
    action.ouvrir("", lu.nom, lu.depot);
  };
  const enCours = state.ouverture !== undefined && state.ouverture.echec === undefined;
  // Tant qu'aucun compte n'est connecté, le geste recommandé est celui du compte.
  const button = buttonAction(doc, OUVRIR_CE_PROJECT, ouvrir, { recommande: account !== "" });
  button.children[0].disabled = enCours;
  racine.append(...champ("projet-du-premier", PROJECT, PROJECT_EXEMPLE, "projet"), refusal, actions(doc, [button]));
  if (state.ouverture?.station === "") racine.append(...ouvertureDite(doc, state.ouverture, state, action));
  return racine;
}

// Une phrase posée dans un élément qui existe déjà, ses mots entre accents graves en code.
/** @param {Fabrique} doc @param {any} pose @param {string} texte */
function phraseVers(doc, pose, texte) {
  pose.replaceChildren(...(texte === "" ? [] : [phrase(doc, "span", texte)]));
}

// L'écran entier, d'après ce que la vue tient : la phrase d'accueil et le compte, puis la phrase des stations et ce qui
// suit de leur état. Une connexion qui manque se fait du compte, en tête : la phrase des stations le dit, sans second
// bouton.
/** @param {Fabrique} doc @param {StateDuFirst} state @param {ActionsDuFirst} action */
export function poserFirstLaunch(doc, state, action) {
  const racine = cree(doc, "div");
  racine.className = "premier-lancement";
  // Au premier lancement, chaque bouton est le grand, 44 px (composants/button, ticket 2916).
  racine.dataset.boutons = "grands";
  const home = cree(doc, "p", BIENVENUE);
  home.className = "bienvenue";
  const account = cree(doc, "div");
  account.className = "compte-du-premier";
  racine.append(home, account, poserLesDeuxChoice(doc, { visiter: action.visiter, ajouter: action.ajouterUnProjet }));
  // Un outil qui manque (ticket 4059) tient la place du compte : sans lui, ni la connexion ni le clone ne partent. Le
  // projet tapé reste dessous, tel quel ; les stations, qui ne se lisent pas sans lui, attendent.
  const tools = state.outils === undefined || action.outils === undefined ? [] : poserLesTools(doc, state.outils, action.outils);
  if (state.outils?.manque !== undefined) {
    account.append(...tools);
    racine.append(formulaireDuProject(doc, state, action), actions(doc, [buttonAction(doc, PAR_SES_DEPOTS, action.ajouterUnProjet)]));
    return racine;
  }
  account.append(...tools, ...poserLeAccount(doc, { ...(state.compte === undefined ? {} : { compte: state.compte }), ...(state.connexion === undefined ? {} : { connexion: state.connexion }) }, action));
  const { stations } = state;
  /** @param {string} texte @param {string} [detail] */
  const enTete = (texte, detail) => {
    const tete = phraseEtDetail(doc, "h3", texte, detail);
    tete.className = "tete-des-stations";
    return tete;
  };
  const formulaire = () => formulaireDuProject(doc, state, action);
  if (stations === undefined) {
    racine.append(enTete(READ), formulaire());
  } else if (stations.state === "sign-in-required") {
    racine.append(enTete(stations.reason), formulaire());
  } else if (stations.state === "unavailable") {
    // La page qui lève la panne n'est offerte qu'une fois : le compte, qui bute sur la même, l'offre déjà.
    const lien = state.compte !== undefined && "lien" in state.compte && state.compte.lien === stations.link ? undefined : stations.link;
    const accountLu = state.compte !== undefined && "login" in state.compte;
    racine.append(
      enTete(stations.reason, stations.detail),
      formulaire(),
      actions(doc, [...(lien === undefined ? [] : [buttonAction(doc, buttonDeLaPage(lien), () => action.ouvrirLaPage(lien), { recommande: true })]), buttonAction(doc, RELIRE, action.relire, { recommande: lien === undefined && accountLu })]),
    );
  } else if (stations.stations.length === 0) {
    racine.append(enTete(stations.reason ?? "No station is paired with this GitHub account yet."), formulaire(), actions(doc, [buttonAction(doc, RELIRE, action.relire)]));
  } else {
    racine.append(enTete(OUVRIR_UN_PROJECT(state.poste)), formulaire(), ...stations.stations.map((station) => stationDite(doc, station, state, action)));
    if (stations.unreadable.length > 0) {
      const combien = stations.unreadable.length;
      const illisibles = lineError(doc, `${combien} more station${combien > 1 ? "s" : ""} cannot be read`, stations.unreadable.map(({ id, reason }) => `${id}: ${reason}`).join("\n"));
      racine.append(illisibles);
    }
  }
  racine.append(actions(doc, [buttonAction(doc, PAR_SES_DEPOTS, action.ajouterUnProjet)]));
  return racine;
}
