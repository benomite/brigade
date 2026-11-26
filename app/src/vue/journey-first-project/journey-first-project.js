// @ts-check
// Ce que la page d'un projet montre tant qu'il n'est pas prêt (ticket 3166, épique 3164). « Add a project » choisit un
// dépôt, crée le projet et ouvre sa page (ticket 3181) : là, à la place du rail, une question à la fois, sous une ligne qui
// dit où l'on en est (« 1 of 2: who cooks it ») — rien d'autre ne lui dispute la page :
//   1. qui le cuit — cet ordinateur d'abord, puis les stations du compte ; le choix recommandé est une station du compte
//      en ligne, sinon cet ordinateur (ticket 3187, choice-station/). Un clic, et la page passe à la suite. Une station
//      qui le cuit déjà : la question n'est pas posée ;
//   2. sa mise en place pour Brigade, seulement s'il ne l'est pas (la lecture de ticket 2628, `checkRepoSetup`) : le second
//      la fait dans sa colonne, à droite, et la page dit à chaque instant ce qui est attendu et de qui — le second qui lit
//      le dépôt, le chef qui lui répond, la PR de mise en place qui attend son merge —, avec le bouton du geste quand il y en a un.
// Prêt : le rail reprend la page, et le second demande au-dessus ce que le chef veut changer d'abord (premier-ticket/, ticket 3306).
// Un projet où le compte ne peut pas écrire (ticket 3163) n'ouvre rien de tout cela.
// La question « qui le cuit » est le choix de station de l'onglet Stations (stations-tab/choice.js, ticket 3195) : les mêmes
// choix, la même liste ; cette page n'y ajoute que sa phrase.
// Ce module ne touche pas `document` : il reçoit de quoi créer un élément (briques.js), et rend des éléments.

import { buttonAction, survol } from "../briques.js";
import { actions } from "../journey-project/connection.js";
import { refusalDit } from "../projects-served/projects-served.js";
import { PREPARER } from "../page-project/repository-non-prepare.js";
import { CET_ORDINATEUR, READ_DE, REESSAYER } from "../lexique.js";
import { AU_RETOUR } from "../choice-station/choice-station.js";
import { ICI, poserLesChoice } from "../stations-tab/choice.js";

/** @typedef {import("../briques.js").Fabrique} Fabrique */
/** @typedef {import("../page-project/repository-non-prepare.js").State} Preparation */
// La question « qui le cuit » : à poser ; pas à poser, une station le cuit déjà (`inutile`) ; le choix qui s'écrit
// (`enCours`, la clé du choix) ; répondue (`ajoutee`) ; ou refusée, sa ligne et son détail.
/** @typedef {"a-faire" | "inutile" | "ajoutee" | { enCours: string } | { ligne: string, detail: string }} Station */
/** @typedef {import("../stations-tab/choice.js").Choice} Choice */
// Ce que la vue sait du second du projet : il ne part pas (`empeche`), il propose des choix au chef (`propose`), et ce
// que le titre de son terminal dit — au travail, ou au repos à son invite (`travailDuSecond`).
/** @typedef {{ empeche?: boolean, propose?: boolean, titre?: "travail" | "repos" }} Second */
// De qui l'attente est : du chef, du second, ou de l'app.
/** @typedef {"toi" | "second" | "app"} Qui */
/**
 * Où en est la mise en place, et qui on attend :
 *   lecture     l'app lit si le projet est prêt pour Brigade
 *   illisible   cette lecture a échoué : le chef relance
 *   demarrage   le second démarre
 *   lit         le second lit le dépôt et prépare la mise en place
 *   repondre    le second attend la réponse du chef
 *   merger      la PR de mise en place attend le merge du chef — sa carte est rouge sur le rail, comptée dans TODO (ticket 3458)
 *   en-route    l'app met le projet en place (« Set up for Brigade », ticket 2628)
 *   refus       cette mise en place a échoué : le chef relance
 *   empeche     le second ne part pas : sa colonne dit pourquoi
 * @typedef {"lecture" | "illisible" | "demarrage" | "lit" | "repondre" | "merger" | "en-route" | "refus" | "empeche"} Wait
 */
/** @typedef {{ etape: "station" } | { etape: "setup", attente: Wait, qui: Qui } | { etape: "pret" }} Vu */
/**
 * @typedef {{
 *   choisir: (choice: Choice) => void,
 *   relire: () => void,
 *   preparer: () => void,
 *   ouvrirLaCarte: () => void,
 * }} ActionsDuJourney
 */

export { choiceDeStation, ICI } from "../stations-tab/choice.js";
export const QUESTION_STATION = "who cooks it";
export const QUESTION_SETUP = "its setup for Brigade";
/** @param {number} rang @param {number | undefined} total @param {string} question */
export const PROGRESSION = (rang, total, question) => (total === undefined ? `${question.charAt(0).toUpperCase()}${question.slice(1)}` : `${rang} of ${total}: ${question}`);
/** @param {string} repository */
export const QUI_CUIT = (repository) => `Who cooks ${repository}?`;
/** @param {string} repository */
export const MISE_EN_PLACE = (repository) => `${repository} is being set up for Brigade`;
// La phrase du choix recommandé : cet ordinateur — mot pour mot celle du ticket —, ou une station du compte en ligne.
export const ICI_DIT = "This computer cooks the project's tickets while it is on; you can add a server or another computer later.";
/** @param {string} name */
export const STATION_DIT = (name) => `${name} is online: it cooks the project's tickets; you can add a server or another computer later.`;
// Aucune station en ligne, et cet ordinateur sans station : rien n'est recommandé, et une station choisie prend le projet à
// son retour.
export const AUCUNE_EN_LINE = "None of your stations is online right now: the one you choose takes the project when it comes back.";
export const AUCUN_CHOICE = `No station can take it: ${CET_ORDINATEUR} has no station, and none of yours is paired.`;
/** @param {string} name */
export const INJOIGNABLE = (name) => `${name} could not be given the project.`;

/** @param {string} repository */
export const READ = (repository) => `${READ_DE(`whether ${repository} is set up for Brigade`)} Nothing is awaited from you.`;
/** @param {string} repository */
export const ILLISIBLE = (repository) => `Whether ${repository} is set up for Brigade could not be read. Waiting for you to try again.`;
export const DEMARRAGE = "The second is starting, in its column on the right: it reads your repository first. Nothing is awaited from you yet.";
export const LIT = "The second is reading your repository, in its column on the right. Nothing is awaited from you yet.";
export const REPONDRE = "The second is waiting for your answer, in its column on the right.";
export const MERGER = "The setup pull request is waiting for your merge: its card is red on the rail, counted in TODO.";
// Pourquoi c'est au chef de la merger, comme la carte le dit (runtime/src/second-init/pr-de-setup.ts, `RAISON`).
export const POURQUOI_MERGER = "Only you merge it: it sets what will judge every future delivery — the integration branch, the checks, the file zones. Once it is merged, the project shows as ready.";
export const OUVRIR_LA_CARD = "open its card";
/** @param {string} repository */
export const EN_ROUTE = (repository) => `The app is setting ${repository} up for Brigade. Nothing is awaited from you.`;
/** @param {string} dit */
export const REFUSAL = (dit) => `The setup failed: ${dit.replace(/\.$/, "")}. Waiting for you to try again.`;
export const EMPECHE = "The second could not start: its column says why. Waiting for you to set the project up from here instead.";


// Le titre de la carte qui attend le merge de la PR de mise en place, mot pour mot comme le runtime pose son issue
// (runtime/src/second-init/pr-de-setup.ts, `TITRE`, ticket 3169).
export const TITRE_DE_LA_CARD_DE_SETUP = "Merge the setup pull request";

// Les signes que `claude` met en tête du titre de son terminal, relevés par l'app pour sa saisie (saisie.ts) : « ✳ » au
// repos à son invite, il attend le chef ; un des quatre quarts de cercle, il tourne.
const REPOS = "✳";
const TRAVAIL = ["◐", "◑", "◒", "◓"];

// Ce que le titre du terminal du second dit de lui : au travail, au repos — ou rien qu'on sache lire.
/** @param {string | undefined} titre @returns {"travail" | "repos" | undefined} */
export function travailDuSecond(titre) {
  if (titre === undefined) return undefined;
  if (TRAVAIL.some((glyphe) => titre.startsWith(glyphe))) return "travail";
  if (titre.startsWith(REPOS)) return "repos";
  return undefined;
}

// La carte de la PR de mise en place, où qu'elle soit sur le rail : son ticket, ou rien.
/** @param {readonly { cartes: readonly any[], autres?: readonly any[] }[] | undefined} colonnes @returns {any} */
export function cardDeSetup(colonnes) {
  return (colonnes ?? []).flatMap(({ cartes: cards, autres = [] }) => [...cards, ...autres]).find((card) => (card.titre ?? card.fiche?.titre) === TITRE_DE_LA_CARD_DE_SETUP);
}


// Où en est le parcours, d'après ce qui est lu. `preparation` : la lecture de ticket 2628 (absente, pas encore lue) ;
// `illisible` : la dernière a échoué, sa phrase ; `carte` : la PR de mise en place attend son merge.
/**
 * @param {{ station: Station, preparation?: Preparation, illisible?: string, carte?: boolean, second: Second }} lu
 * @returns {Vu}
 */
export function vuDuJourney({ station, preparation, illisible, carte: card = false, second }) {
  if (station !== "ajoutee" && station !== "inutile") return { etape: "station" };
  if (preparation?.etape === "prepare") return { etape: "pret" };
  /** @param {Wait} wait @param {Qui} qui @returns {Vu} */
  const setup = (wait, qui) => ({ etape: "setup", attente: wait, qui });
  if (preparation === undefined || preparation.etape === "inconnu") return illisible === undefined ? setup("lecture", "app") : setup("illisible", "toi");
  if (card) return setup("merger", "toi");
  if (preparation.etape === "en-route") return setup("en-route", "app");
  if (preparation.etape === "refus") return setup("refus", "toi");
  if (second.empeche === true) return setup("empeche", "toi");
  if (second.propose === true || second.titre === "repos") return setup("repondre", "toi");
  if (second.titre === "travail") return setup("lit", "second");
  return setup("demarrage", "second");
}

// La ligne de progression : le rang de la question montrée, et combien le projet en pose — la station si elle est à
// poser, la mise en place si la lecture la dit à faire. Tant que la mise en place n'est pas lue, le compte n'est pas dit :
// la ligne ne promet ni n'annonce une question qui n'aura peut-être rien à faire.
/** @param {Vu} vu @param {{ station: Station, preparation?: Preparation }} lu @returns {string} */
export function progression(vu, { station, preparation }) {
  const avecStation = station !== "inutile";
  const step = preparation?.etape;
  const setupConnu = step !== undefined && step !== "inconnu";
  const total = setupConnu ? (avecStation ? 1 : 0) + (step === "prepare" ? 0 : 1) : undefined;
  if (vu.etape === "station") return PROGRESSION(1, total, QUESTION_STATION);
  return PROGRESSION(avecStation ? 2 : 1, total, QUESTION_SETUP);
}

/** @param {Fabrique} doc @param {string} balise @param {string} [texte] */
function cree(doc, balise, texte) {
  const pose = doc.createElement(balise);
  if (texte !== undefined) pose.textContent = texte;
  return pose;
}

// La question « qui le cuit » : la phrase du choix recommandé, puis le choix de station de l'onglet Stations
// (stations-tab/choice.js) — un refus y dit sa cause et son geste (stations-du-account.ts), ce que GitHub a répondu au survol.
/** @param {Fabrique} doc @param {Station} station @param {readonly Choice[]} choice @param {ActionsDuJourney} action */
function corpsDeLaStation(doc, station, choice, action) {
  if (choice.length === 0) return [cree(doc, "p", AUCUN_CHOICE)];
  const recommande = choice.find((un) => un.recommande);
  const dit = cree(doc, "p", recommande === undefined ? AUCUNE_EN_LINE : recommande.cle === ICI ? ICI_DIT : STATION_DIT(recommande.nom));
  dit.className = "phrase";
  const enCours = typeof station === "object" && "enCours" in station ? station.enCours : undefined;
  const refusal = typeof station === "object" && "ligne" in station ? station : undefined;
  return [dit, ...poserLesChoice(doc, { choix: choice, ...(enCours === undefined ? {} : { enCours }), ...(refusal === undefined ? {} : { refus: refusal }) }, action.choisir)];
}

// La mise en place : ce qui est attendu, et de qui — une phrase ; ce qui en dit plus au survol ; le bouton, quand le
// geste est au chef ici même.
/** @param {Fabrique} doc @param {string} repository @param {{ attente: Wait, qui: Qui }} vu @param {{ illisible?: string, refus?: string }} raisons @param {ActionsDuJourney} action */
function corpsDuSetup(doc, repository, { attente: wait, qui }, raisons, action) {
  /** @type {Record<Wait, string>} */
  const phrases = {
    lecture: READ(repository),
    illisible: ILLISIBLE(repository),
    demarrage: DEMARRAGE,
    lit: LIT,
    repondre: REPONDRE,
    merger: MERGER,
    "en-route": EN_ROUTE(repository),
    refus: REFUSAL(raisons.refus ?? ""),
    empeche: EMPECHE,
  };
  const dit = cree(doc, "p", phrases[wait]);
  dit.className = "phrase";
  dit.dataset.attente = wait;
  dit.dataset.qui = qui;
  const detail = wait === "illisible" ? (raisons.illisible ?? "") : wait === "merger" ? POURQUOI_MERGER : "";
  if (detail.trim() !== "") dit.append(survol(doc, detail));
  const button =
    wait === "illisible" ? buttonAction(doc, REESSAYER, action.relire, { recommande: true })
    : wait === "refus" ? buttonAction(doc, REESSAYER, action.preparer, { recommande: true })
    : wait === "merger" ? buttonAction(doc, OUVRIR_LA_CARD, action.ouvrirLaCarte, { recommande: true })
    // Le second ne part pas : la mise en place se fait d'ici, par le geste de l'avis d'un projet pas préparé (ticket 2628).
    : wait === "empeche" ? buttonAction(doc, PREPARER, action.preparer, { recommande: true })
    : undefined;
  return [dit, ...(button === undefined ? [] : [actions(doc, [button])])];
}

// La question montrée, à la place du rail : la ligne de progression, la question, puis son corps. `vu` n'est jamais
// « pret » ici : prêt, le rail reprend la page, sous le premier ticket (premier-ticket/).
/**
 * @param {Fabrique} doc
 * @param {{ depot: string, vu: Exclude<Vu, { etape: "pret" }>, progression: string, station: Station, choix: readonly Choice[], illisible?: string, refus?: string, absente?: string }} donnees
 * @param {ActionsDuJourney} action
 */
export function poserJourneyFirstProject(doc, { depot: repository, vu, progression: line, station, choix: choice, illisible, refus: refusal, absente }, action) {
  const racine = cree(doc, "section");
  racine.className = "parcours-premier-projet carte";
  racine.ariaLabel = vu.etape === "station" ? QUI_CUIT(repository) : MISE_EN_PLACE(repository);
  racine.dataset.etape = vu.etape;
  const ou = cree(doc, "p", line);
  ou.className = "progression";
  const titre = cree(doc, "h2", vu.etape === "station" ? QUI_CUIT(repository) : MISE_EN_PLACE(repository));
  titre.className = "attendu";
  const corps =
    vu.etape === "station" ? corpsDeLaStation(doc, station, choice, action)
    : corpsDuSetup(doc, repository, vu, { ...(illisible === undefined ? {} : { illisible }), ...(refusal === undefined ? {} : { refus: refusal }) }, action);
  racine.append(ou, titre, ...(vu.etape === "station" ? [] : auRetour(doc, repository, absente)), ...corps);
  return racine;
}

// La station choisie hors ligne (ticket 3187) : la page dit, en clair, qu'elle prend le projet à son retour.
/** @param {Fabrique} doc @param {string} repository @param {string | undefined} absente */
function auRetour(doc, repository, absente) {
  if (absente === undefined) return [];
  const dit = cree(doc, "p", AU_RETOUR(absente, repository));
  dit.className = "au-retour";
  return [dit];
}

// Les parcours tenus pour la vue, un par projet que « Add a project » a ouvert : son dépôt ; où en est « qui le cuit » et
// la station qui l'a reçu ; la phrase d'une lecture de la mise en place qui a échoué ; si la mise en place a demandé
// quelque chose (`setupVu`) ; et, prêt, le premier ticket qui reste au-dessus du rail (`pret`, premier-ticket/). Tenus le temps que l'app tourne.
// `absente` : la station choisie était hors ligne — son nom, tant que la page le dit.
/** @typedef {{ depot: string, station: Station, illisible?: string, setupVu: boolean, pret?: {}, absente?: string }} Journey */
/** @param {{ rendre: (project: string) => void }} options */
export function holdLesJourney({ rendre }) {
  /** @type {Map<string, Journey>} */
  const tenus = new Map();
  /** @param {string} project @param {(avant: Journey) => Journey} changer */
  const changer = (project, changer) => {
    const avant = tenus.get(project);
    if (avant === undefined) return;
    tenus.set(project, changer(avant));
    rendre(project);
  };
  return {
    /** @param {string} project @returns {Journey | undefined} */
    de: (project) => tenus.get(project),
    // `dejaCuit` : une station cuit déjà le projet — « qui le cuit » n'est pas posée.
    /** @param {string} project @param {string} repository @param {boolean} dejaCuit */
    commencer(project, repository, dejaCuit) {
      tenus.set(project, { depot: repository, station: dejaCuit ? "inutile" : "a-faire", setupVu: false });
      rendre(project);
    },
    // `absente` : le nom de la station choisie quand elle était hors ligne.
    /** @param {string} project @param {Station} station @param {string} [absente] */
    station: (project, station, absente) => changer(project, ({ absente: _, ...avant }) => ({ ...avant, station, ...(station === "ajoutee" && absente !== undefined ? { absente } : {}) })),
    /** @param {string} project @param {string | undefined} phrase */
    illisible(project, phrase) {
      if (tenus.get(project)?.illisible === phrase) return;
      changer(project, ({ illisible: _, ...reste }) => (phrase === undefined ? reste : { ...reste, illisible: phrase }));
    },
    // La mise en place a attendu quelque chose du chef ou du second : prêt, le premier ticket le suivra. Rien
    // n'est redessiné — c'est le dessin qui le dit.
    /** @param {string} project */
    setupMontre(project) {
      const avant = tenus.get(project);
      if (avant !== undefined) tenus.set(project, { ...avant, setupVu: true });
    },
    // Prêt : la question part, le rail reprend la page. Le premier ticket reste, si le chef a répondu à
    // quelque chose ; sinon, le parcours est fini — il n'y avait rien à faire.
    /** @param {string} project */
    pret(project) {
      const avant = tenus.get(project);
      if (avant === undefined || avant.pret !== undefined) return;
      if (avant.station === "ajoutee" || avant.setupVu) tenus.set(project, { ...avant, pret: {} });
      else tenus.delete(project);
      rendre(project);
    },
    /** @param {string} project */
    fermer(project) {
      if (tenus.delete(project)) rendre(project);
    },
  };
}

// La station choisie par le geste que l'app a déjà : ce qu'il rend en devient l'état — ajoutée, ou son refus en une ligne.
/** @param {string} name @param {() => Promise<{ refus: string, detail?: string } | object>} ecrire @returns {Promise<Station>} */
export async function ajouterLaStation(name, ecrire) {
  try {
    const lu = await ecrire();
    if (!("refus" in lu)) return "ajoutee";
    const dit = refusalDit(lu.refus.replace(/^not saved: /, ""));
    return "detail" in lu && lu.detail !== undefined ? { ...dit, detail: [dit.detail, lu.detail].filter((bout) => bout !== "").join(" — ") } : dit;
  } catch (error) {
    return { ligne: INJOIGNABLE(name), detail: error instanceof Error ? error.message : String(error) };
  }
}
