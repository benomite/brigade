// @ts-check
// Ce que la page d'un projet montre tant qu'il n'est pas prêt (ticket 3166, épique 3164). « Add a project » choisit un
// dépôt, crée le projet et ouvre sa page (ticket 3181) : là, à la place du rail, une question à la fois, sous une ligne qui
// dit où l'on en est (« 1 of 2: who cooks it ») — rien d'autre ne lui dispute la page :
//   1. qui le cuit — cet ordinateur d'abord, puis les stations du compte ; le choix recommandé est une station du compte
//      en ligne, sinon cet ordinateur (ticket 3187, choix-station/). Un clic, et la page passe à la suite. Une station
//      qui le cuit déjà : la question n'est pas posée ;
//   2. sa mise en place pour Brigade, seulement s'il ne l'est pas (la lecture de ticket 2628, `checkRepoSetup`) : le second
//      la fait dans sa colonne, à droite, et la page dit à chaque instant ce qui est attendu et de qui — le second qui lit
//      le dépôt, le chef qui lui répond, la PR de mise en place qui attend son merge —, avec le bouton du geste quand il y en a un.
// Prêt : le rail reprend la page, et le second demande au-dessus ce que le chef veut changer d'abord (premier-ticket/, ticket 3306).
// Un projet où le compte ne peut pas écrire (ticket 3163) n'ouvre rien de tout cela.
// La question « qui le cuit » est le choix de station de l'onglet Stations (stations-tab/choice.js, ticket 3195) : les mêmes
// choix, la même liste ; cette page n'y ajoute que sa phrase. Sous la liste, « Add a server » (add-server/, ticket
// 4347) : la ligne d'installation d'un serveur, puis le serveur vu arriver, à qui le projet se confie d'un clic.
// Ce module ne touche pas `document` : il reçoit de quoi créer un élément (bricks.js), et rend des éléments.

import { buttonAction, hover } from "../bricks.js";
import { actions } from "../journey-project/connection.js";
import { refusalSays } from "../projects-served/projects-served.js";
import { PREPARE } from "../page-project/repository-not-prepare.js";
import { THIS_COMPUTER, READ_OF, RETRY } from "../lexicon.js";
import { AT_RETURN } from "../choice-station/choice-station.js";
import { HERE, setTheChoice } from "../stations-tab/choice.js";
import { placeAddServer } from "../add-server/add-server.js";

/** @typedef {import("../bricks.js").Fabrique} Fabrique */
/** @typedef {import("../page-project/repository-not-prepare.js").State} Preparation */
// La question « qui le cuit » : à poser ; pas à poser, une station le cuit déjà (`inutile`) ; le choix qui s'écrit
// (`enCours`, la clé du choix) ; répondue (`ajoutee`) ; ou refusée, sa ligne et son détail.
/** @typedef {"a-faire" | "inutile" | "ajoutee" | { enCours: string } | { ligne: string, detail: string }} Station */
/** @typedef {import("../stations-tab/choice.js").Choice} Choice */
// Ce que la vue sait du second du projet : il ne part pas (`empeche`), il propose des choix au chef (`propose`), et ce
// que le titre de son terminal dit — au travail, ou au repos à son invite (`travailDuSecond`).
/** @typedef {{ empeche?: boolean, propose?: boolean, titre?: "travail" | "repos" }} Second */
// De qui l'attente est : du chef, du second, ou de l'app.
/** @typedef {"toi" | "second" | "app"} Who */
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
/** @typedef {{ etape: "station" } | { etape: "setup", attente: Wait, qui: Who } | { etape: "pret" }} Seen */
/**
 * @typedef {{
 *   choisir: (choice: Choice) => void,
 *   relire: () => void,
 *   preparer: () => void,
 *   ouvrirLaCarte: () => void,
 *   serveur?: import("../add-server/add-server.js").ActionsOfServer,
 * }} ActionsOfJourney
 */

export { choiceOfStation, HERE } from "../stations-tab/choice.js";
export const QUESTION_STATION = "who cooks it";
export const QUESTION_SETUP = "its setup for Brigade";
/** @param {number} rank @param {number | undefined} total @param {string} question */
export const PROGRESSION = (rank, total, question) => (total === undefined ? `${question.charAt(0).toUpperCase()}${question.slice(1)}` : `${rank} of ${total}: ${question}`);
/** @param {string} repository */
export const WHO_COOKED = (repository) => `Who cooks ${repository}?`;
/** @param {string} repository */
export const MISE_EN_PLACE = (repository) => `${repository} is being set up for Brigade`;
// La phrase du choix recommandé : cet ordinateur — mot pour mot celle du ticket —, ou une station du compte en ligne.
export const HERE_SAYS = "This computer cooks the project's tickets while it is on; you can add a server or another computer later.";
/** @param {string} name */
export const STATION_SAYS = (name) => `${name} is online: it cooks the project's tickets; you can add a server or another computer later.`;
// Aucune station en ligne, et cet ordinateur sans station : rien n'est recommandé, et une station choisie prend le projet à
// son retour.
export const NO_EN_LINE = "None of your stations is online right now: the one you choose takes the project when it comes back.";
export const NO_CHOICE = `No station can take it: ${THIS_COMPUTER} has no station, and none of yours is paired.`;
/** @param {string} name */
export const UNREACHABLE = (name) => `${name} could not be given the project.`;

/** @param {string} repository */
export const READING = (repository) => `${READ_OF(`whether ${repository} is set up for Brigade`)} Nothing is awaited from you.`;
/** @param {string} repository */
export const UNREADABLE = (repository) => `Whether ${repository} is set up for Brigade could not be read. Waiting for you to try again.`;
export const STARTUP = "The second is starting, in its column on the right: it reads your repository first. Nothing is awaited from you yet.";
export const LIT = "The second is reading your repository, in its column on the right. Nothing is awaited from you yet.";
export const ANSWER = "The second is waiting for your answer, in its column on the right.";
export const MERGER = "The setup pull request is waiting for your merge: its card is red on the rail, counted in TODO.";
// Pourquoi c'est au chef de la merger, comme la carte le dit (runtime/src/second-init/pr-de-setup.ts, `RAISON`).
export const WHY_MERGER = "Only you merge it: it sets what will judge every future delivery — the integration branch, the checks, the file zones. Once it is merged, the project shows as ready.";
export const OPEN_THE_CARD = "open its card";
/** @param {string} repository */
export const EN_ROUTE = (repository) => `The app is setting ${repository} up for Brigade. Nothing is awaited from you.`;
/** @param {string} said */
export const REFUSAL = (said) => `The setup failed: ${said.replace(/\.$/, "")}. Waiting for you to try again.`;
export const PREVENTS = "The second could not start: its column says why. Waiting for you to set the project up from here instead.";


// Le titre de la carte qui attend le merge de la PR de mise en place, mot pour mot comme le runtime pose son issue
// (runtime/src/second-init/pr-de-setup.ts, `TITRE`, ticket 3169).
export const TITLE_OF_THE_CARD_OF_SETUP = "Merge the setup pull request";

// Les signes que `claude` met en tête du titre de son terminal, relevés par l'app pour sa saisie (input.ts) : « ✳ » au
// repos à son invite, il attend le chef ; un des quatre quarts de cercle, il tourne.
const REPOS = "✳";
const WORK = ["◐", "◑", "◒", "◓"];

// Ce que le titre du terminal du second dit de lui : au travail, au repos — ou rien qu'on sache lire.
/** @param {string | undefined} title @returns {"travail" | "repos" | undefined} */
export function workOfSecond(title) {
  if (title === undefined) return undefined;
  if (WORK.some((glyphe) => title.startsWith(glyphe))) return "travail";
  if (title.startsWith(REPOS)) return "repos";
  return undefined;
}

// La carte de la PR de mise en place, où qu'elle soit sur le rail : son ticket, ou rien.
/** @param {readonly { cartes: readonly any[], autres?: readonly any[] }[] | undefined} columns @returns {any} */
export function cardOfSetup(columns) {
  return (columns ?? []).flatMap(({ cartes: cards, autres: others = [] }) => [...cards, ...others]).find((card) => (card.titre ?? card.fiche?.titre) === TITLE_OF_THE_CARD_OF_SETUP);
}


// Où en est le parcours, d'après ce qui est lu. `preparation` : la lecture de ticket 2628 (absente, pas encore lue) ;
// `illisible` : la dernière a échoué, sa phrase ; `carte` : la PR de mise en place attend son merge.
/**
 * @param {{ station: Station, preparation?: Preparation, illisible?: string, carte?: boolean, second: Second }} lu
 * @returns {Seen}
 */
export function seenOfJourney({ station, preparation, illisible: unreadable, carte: card = false, second }) {
  if (station !== "ajoutee" && station !== "inutile") return { etape: "station" };
  if (preparation?.etape === "prepare") return { etape: "pret" };
  /** @param {Wait} wait @param {Who} who @returns {Seen} */
  const setup = (wait, who) => ({ etape: "setup", attente: wait, qui: who });
  if (preparation === undefined || preparation.etape === "inconnu") return unreadable === undefined ? setup("lecture", "app") : setup("illisible", "toi");
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
/** @param {Seen} seenOne @param {{ station: Station, preparation?: Preparation }} lu @returns {string} */
export function progression(seenOne, { station, preparation }) {
  const withStation = station !== "inutile";
  const step = preparation?.etape;
  const setupKnown = step !== undefined && step !== "inconnu";
  const total = setupKnown ? (withStation ? 1 : 0) + (step === "prepare" ? 0 : 1) : undefined;
  if (seenOne.etape === "station") return PROGRESSION(1, total, QUESTION_STATION);
  return PROGRESSION(withStation ? 2 : 1, total, QUESTION_SETUP);
}

/** @param {Fabrique} doc @param {string} balise @param {string} [text] */
function created(doc, balise, text) {
  const pose = doc.createElement(balise);
  if (text !== undefined) pose.textContent = text;
  return pose;
}

// La question « qui le cuit » : la phrase du choix recommandé, puis le choix de station de l'onglet Stations
// (stations-tab/choice.js) — un refus y dit sa cause et son geste (stations-of-account.ts), ce que GitHub a répondu au survol —,
// puis « Add a server » et son panneau (`serveur`, fermé s'il n'est pas dit).
/** @param {Fabrique} doc @param {Station} station @param {readonly Choice[]} choice @param {ActionsOfJourney} action @param {import("../add-server/add-server.js").StateOfServer} [server] */
function bodyOfTheStation(doc, station, choice, action, server = { ouvert: false, vu: { etat: "attente" } }) {
  const oneServer = placeAddServer(doc, server, action.serveur ?? {});
  if (choice.length === 0) return [created(doc, "p", NO_CHOICE), ...oneServer];
  const recommended = choice.find((oneOf) => oneOf.recommande);
  const said = created(doc, "p", recommended === undefined ? NO_EN_LINE : recommended.cle === HERE ? HERE_SAYS : STATION_SAYS(recommended.nom));
  said.className = "phrase";
  const inProgress = typeof station === "object" && "enCours" in station ? station.enCours : undefined;
  const refusal = typeof station === "object" && "ligne" in station ? station : undefined;
  return [said, ...setTheChoice(doc, { choix: choice, ...(inProgress === undefined ? {} : { enCours: inProgress }), ...(refusal === undefined ? {} : { refus: refusal }) }, action.choisir), ...oneServer];
}

// La mise en place : ce qui est attendu, et de qui — une phrase ; ce qui en dit plus au survol ; le bouton, quand le
// geste est au chef ici même.
/** @param {Fabrique} doc @param {string} repository @param {{ attente: Wait, qui: Who }} vu @param {{ illisible?: string, refus?: string }} reasons @param {ActionsOfJourney} action */
function bodyOfSetup(doc, repository, { attente: wait, qui: who }, reasons, action) {
  /** @type {Record<Wait, string>} */
  const sentences = {
    lecture: READING(repository),
    illisible: UNREADABLE(repository),
    demarrage: STARTUP,
    lit: LIT,
    repondre: ANSWER,
    merger: MERGER,
    "en-route": EN_ROUTE(repository),
    refus: REFUSAL(reasons.refus ?? ""),
    empeche: PREVENTS,
  };
  const said = created(doc, "p", sentences[wait]);
  said.className = "phrase";
  said.dataset.attente = wait;
  said.dataset.qui = who;
  const detail = wait === "illisible" ? (reasons.illisible ?? "") : wait === "merger" ? WHY_MERGER : "";
  if (detail.trim() !== "") said.append(hover(doc, detail));
  const button =
    wait === "illisible" ? buttonAction(doc, RETRY, action.relire, { recommande: true })
    : wait === "refus" ? buttonAction(doc, RETRY, action.preparer, { recommande: true })
    : wait === "merger" ? buttonAction(doc, OPEN_THE_CARD, action.ouvrirLaCarte, { recommande: true })
    // Le second ne part pas : la mise en place se fait d'ici, par le geste de l'avis d'un projet pas préparé (ticket 2628).
    : wait === "empeche" ? buttonAction(doc, PREPARE, action.preparer, { recommande: true })
    : undefined;
  return [said, ...(button === undefined ? [] : [actions(doc, [button])])];
}

// La question montrée, à la place du rail : la ligne de progression, la question, puis son corps. `vu` n'est jamais
// « pret » ici : prêt, le rail reprend la page, sous le premier ticket (premier-ticket/).
/**
 * @param {Fabrique} doc
 * @param {{ depot: string, vu: Exclude<Seen, { etape: "pret" }>, progression: string, station: Station, choix: readonly Choice[], illisible?: string, refus?: string, absente?: string, serveur?: import("../add-server/add-server.js").StateOfServer }} donnees
 * @param {ActionsOfJourney} action
 */
export function setJourneyFirstProject(doc, { depot: repository, vu: seenOne, progression: line, station, choix: choice, illisible: unreadable, refus: refusal, absente: absent, serveur: server }, action) {
  const root = created(doc, "section");
  root.className = "parcours-premier-projet carte";
  root.ariaLabel = seenOne.etape === "station" ? WHO_COOKED(repository) : MISE_EN_PLACE(repository);
  root.dataset.etape = seenOne.etape;
  const or = created(doc, "p", line);
  or.className = "progression";
  const title = created(doc, "h2", seenOne.etape === "station" ? WHO_COOKED(repository) : MISE_EN_PLACE(repository));
  title.className = "attendu";
  const body =
    seenOne.etape === "station" ? bodyOfTheStation(doc, station, choice, action, server)
    : bodyOfSetup(doc, repository, seenOne, { ...(unreadable === undefined ? {} : { illisible: unreadable }), ...(refusal === undefined ? {} : { refus: refusal }) }, action);
  root.append(or, title, ...(seenOne.etape === "station" ? [] : atReturn(doc, repository, absent)), ...body);
  return root;
}

// La station choisie hors ligne (ticket 3187) : la page dit, en clair, qu'elle prend le projet à son retour.
/** @param {Fabrique} doc @param {string} repository @param {string | undefined} absent */
function atReturn(doc, repository, absent) {
  if (absent === undefined) return [];
  const said = created(doc, "p", AT_RETURN(absent, repository));
  said.className = "au-retour";
  return [said];
}

// Les parcours tenus pour la vue, un par projet que « Add a project » a ouvert : son dépôt ; où en est « qui le cuit » et
// la station qui l'a reçu ; la phrase d'une lecture de la mise en place qui a échoué ; si la mise en place a demandé
// quelque chose (`setupVu`) ; et, prêt, le premier ticket qui reste au-dessus du rail (`pret`, premier-ticket/). Tenus le temps que l'app tourne.
// `absente` : la station choisie était hors ligne — son nom, tant que la page le dit.
/** @typedef {{ depot: string, station: Station, illisible?: string, setupVu: boolean, pret?: {}, absente?: string }} Journey */
/** @param {{ rendre: (project: string) => void }} options */
export function holdTheJourney({ rendre: render }) {
  /** @type {Map<string, Journey>} */
  const heldOnes = new Map();
  /** @param {string} project @param {(before: Journey) => Journey} change */
  const change = (project, change) => {
    const before = heldOnes.get(project);
    if (before === undefined) return;
    heldOnes.set(project, change(before));
    render(project);
  };
  return {
    /** @param {string} project @returns {Journey | undefined} */
    de: (project) => heldOnes.get(project),
    // `dejaCuit` : une station cuit déjà le projet — « qui le cuit » n'est pas posée.
    /** @param {string} project @param {string} repository @param {boolean} alreadyCooked */
    commencer(project, repository, alreadyCooked) {
      heldOnes.set(project, { depot: repository, station: alreadyCooked ? "inutile" : "a-faire", setupVu: false });
      render(project);
    },
    // `absente` : le nom de la station choisie quand elle était hors ligne.
    /** @param {string} project @param {Station} station @param {string} [absent] */
    station: (project, station, absent) => change(project, ({ absente: _, ...before }) => ({ ...before, station, ...(station === "ajoutee" && absent !== undefined ? { absente: absent } : {}) })),
    /** @param {string} project @param {string | undefined} sentence */
    illisible(project, sentence) {
      if (heldOnes.get(project)?.illisible === sentence) return;
      change(project, ({ illisible: _, ...remains }) => (sentence === undefined ? remains : { ...remains, illisible: sentence }));
    },
    // La mise en place a attendu quelque chose du chef ou du second : prêt, le premier ticket le suivra. Rien
    // n'est redessiné — c'est le dessin qui le dit.
    /** @param {string} project */
    setupMontre(project) {
      const before = heldOnes.get(project);
      if (before !== undefined) heldOnes.set(project, { ...before, setupVu: true });
    },
    // Prêt : la question part, le rail reprend la page. Le premier ticket reste, si le chef a répondu à
    // quelque chose ; sinon, le parcours est fini — il n'y avait rien à faire.
    /** @param {string} project */
    pret(project) {
      const before = heldOnes.get(project);
      if (before === undefined || before.pret !== undefined) return;
      if (before.station === "ajoutee" || before.setupVu) heldOnes.set(project, { ...before, pret: {} });
      else heldOnes.delete(project);
      render(project);
    },
    /** @param {string} project */
    fermer(project) {
      if (heldOnes.delete(project)) render(project);
    },
  };
}

// La station choisie par le geste que l'app a déjà : ce qu'il rend en devient l'état — ajoutée, ou son refus en une ligne.
/** @param {string} name @param {() => Promise<{ refus: string, detail?: string } | object>} write @returns {Promise<Station>} */
export async function addTheStation(name, write) {
  try {
    const readOne = await write();
    if (!("refus" in readOne)) return "ajoutee";
    const said = refusalSays(readOne.refus.replace(/^not saved: /, ""));
    return "detail" in readOne && readOne.detail !== undefined ? { ...said, detail: [said.detail, readOne.detail].filter((end) => end !== "").join(" — ") } : said;
  } catch (error) {
    return { ligne: UNREACHABLE(name), detail: error instanceof Error ? error.message : String(error) };
  }
}
