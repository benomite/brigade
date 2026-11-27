// @ts-check
// La vue : elle montre, elle ne tient rien. Les pty vivent dans le process
// principal ; ici, un xterm par terminal, gardé tant que l'app est ouverte —
// changer d'espace ou d'onglet ne fait que cacher l'un et montrer l'autre.
// Au centre de l'espace, le rail : c'est la vue centrale, en cinq colonnes — TODO n'en est pas une (ticket 3458). Chaque carte y
// tient en deux lignes — une phrase qui dit ce qui se passe, un signal s'il faut l'attention — ;
// ce que la file dit du ticket en plus (qui le tient, depuis quand, son bail) est dans sa fiche. En haut, les onglets de pages — Rail, Stations,
// Settings, Log : chacune la sortie d'une commande, lue tant qu'elle est affichée — ; une
// page s'ouvre par-dessus le rail, et fermée, le rend tel qu'il était. À droite, en permanence,
// les terminaux : le second, et à côté de lui les shells. Un shell montré ne remplace pas le
// second — son onglet le rend, avec sa conversation. Ce qu'un clic écrit dans le second s'y lit,
// sans que le centre change. Et dans
// le panneau, ce que `status` dit du projet, telle quelle. Ce qui est un tableau à
// états est dessiné — une pastille par projet dans la barre, la carte de projet,
// le rail, la bannière d'arrêt — depuis les faits que la box rend comme des
// faits, et que le process principal a déjà mis en forme (facts.ts) : la vue
// pose un mot, un nombre, une couleur nommée, elle n'en calcule aucun. Sur ce qui se lit, les
// gestes du chef, chacun collé à l'état qu'il change, sous l'une de trois formes :
//   - direct : sa commande part dans le second au clic, s'il est libre, et sa sortie s'y lit ;
//   - confirmé : le clic ouvre, sous le bouton, une confirmation qui dit son prix — ce qu'il
//     interrompt, les cooks en vol et leurs tokens —, et rien ne part avant le « oui » du chef
//     (confirmation.ts) ; « non » la referme, sans rien faire partir ;
//   - avec jugement : une demande en prose s'écrit dans le second, et rien ne l'envoie — c'est
//     l'Entrée du chef qui la fait partir, jamais un clic.
// Ce qui part, et ce qu'une confirmation dit, se décident dans le process principal (actions.ts,
// confirmation.ts, request.ts) : la vue nomme un geste, jamais une commande. Reste un bouton, sur la
// partie closer, qui écrit dans le second le réglage du closer sans l'envoyer (boutons.ts). La vue n'y lit rien —
// elle ne sait pas ce qu'est un ticket. Ce qui attend le chef lui arrive déjà
// mis à part (awaiting.ts) : elle le pose en tête, quel que soit l'onglet.
// Settings (tickets 1700, 2494) ne tient que les réglages du projet, dans un seul groupe, une
// ligne par réglage : son nom, sa valeur en vigueur, un seul contrôle.
// La barre est faite d'icônes : « Tous les projets » en tête — l'accueil, la vue d'ensemble de
// brigade : une ligne par projet, une par station, et la ligne de santé, dites par le process
// principal (home.ts) ; on n'y agit pas, un clic sur une ligne ouvre sa page, et « Cost » celle
// des coûts de tous les projets (ticket 1022) —, le nom de chaque projet, et
// en pied le « + » : l'écran d'ajout, où un projet s'installe sur sa box et se déclare
// dans l'app d'un seul geste. Ce qui manque à un champ, ce qui part vers la box et ce
// qu'elle en a rendu se décident dans le process principal (installation.ts) : la vue
// recueille, signale le champ qu'on lui nomme, et pose ce qu'on lui rend.
// L'installation guidée et la vérification de l'installation ne sont plus dans la vue (ticket 1700) : l'app n'a besoin
// que d'une connexion GitHub. Le retrait du projet est une ligne de Settings, dans le groupe du projet : le retirer de l'app, qui
// n'envoie rien à sa station, après un « yes » — ce qui se refuse et ce qui s'en dit se décident dans retrait.ts.
// La page d'un worktree servi n'est plus nulle part dans l'app (ticket 1846) : le chef suit ce que fait le cook, sur la
// fiche de son ticket (activity-of-cook.js), et sa PR, et essaie l'app construite une fois mergée.
// En tête de l'espace, la bande d'alertes : est-ce que ça peut tourner ? La cuisine —
// une alerte par chose à faire, et
// une ligne « non vérifié » pour chaque état que la box ne dit pas. Vide, elle ne prend aucune
// place. Ce qui s'y dit et ce que son bouton appelle se décident dans alerts.ts : la vue pose.
// Chaque alerte tient en une ligne — ce qui ne va pas — et un contrôle — son geste (ticket 907) :
// confirmé — reprendre —, ou une demande au second quand il faut lire, juger ou agir sur la box ;
// une ligne « non vérifié » mène à la page qui lit l'état, quand il y en a une. Le prix n'est jamais posé à côté : le
// clic ouvre la confirmation, qui le dit. Ce que la box en écrit est derrière « detail ». Le projet
// éteint n'y fait pas de ligne : c'est un interrupteur, un seul pour tout le projet (ticket 1406), en tête
// de l'espace, à droite des onglets — allumé ou éteint, un clic le bascule —, et, éteint, la tête du
// rail est marquée à l'arrêt d'une ligne (ticket 906).
// Arrêter la cuisine est une ligne de Settings, sous le projet.
// Posé dans le conteneur caché de ce qui était sous cette machine, et au survol de « T », le code de l'app lui-même : à jour, ou en retard sur
// l'origine de son clone — et de combien de commits —, avec l'heure de sa lecture ; de même
// pour le clone d'un projet qui est celui de brigade. En retard, un bouton écrit `git pull`
// dans un shell, et n'envoie rien : l'app ne met rien à jour. Ce qui se lit, ce qui s'en dit
// et ce qui s'écrit se décident dans retard.ts.
// Chaque projet a ses deux couleurs, tirées à son ajout et écrites avec lui dans le fichier des
// projets (colors.ts) : celle de son onglet teint sa case dans la barre, celle de son accent
// remplace l'accent de la peau tant que son espace est affiché. Elles se changent sous Paramètres,
// parmi la palette que le process principal donne ; ce qui s'écrit se décide là-bas. Les couleurs
// d'état — vert, jaune, rouge, bleu, gris — n'en dépendent jamais.
// La peau, enfin : la vue n'écrit ni couleur ni police — elles sont dans tokens.css, et le terminal
// y lit les siennes. Elle dit seulement ce qu'un texte est : ce qui se recopie tel quel (`exact`),
// ce que l'app dit elle-même (`propos`), et — tout le reste d'un `pre` — ce que la box a rendu,
// posé mot pour mot.
import { FitAddon } from "@xterm/addon-fit";
import { Terminal as Xterm } from "@xterm/xterm";
// Les briques communes (bricks.js) : une même chose se dit partout de la même façon — le prix
// d'un geste dans son survol, une lecture qui manque en une ligne, une confirmation qui dit son prix.
import { holdBanner } from "./update/banner.js";
import { setConnected, setTheListGitHub, holdConnectionGitHub } from "./connection-github.js";
import { holdOpinionOfBackground } from "./first-launch/opinion-of-background.js";
import { setTheIdentities, holdTheIdentities } from "./identities-github.js";
import { setTheProjectsServed, holdTheProjectsServed } from "./projects-served/projects-served.js";
import { setTheProjectsOfTheStation, projectsServedBy } from "./station/page/StationProjects.js";
import { setStepProject } from "./journey-project/step-project.js";
import { buttonAction, caseATick, priceSays, hover } from "./bricks.js";
import { confirmationOfAction } from "./components/confirmation/confirmation.js";
import { lineError } from "./components/line-error/line-error.js";
import { setTheActionsOfWait, relaunchProposed } from "./wait/wait.js";
import { rowOfSetting as rowOfTheFamily } from "./components/setting/setting.js";
import { button as buttonOfTheFamily, kindOfButton } from "./components/button/button.js";
import { slip as slipOfTheFamily, headOfSlip } from "./components/slip/slip.js";
import { pan } from "./components/pan/pan.js";
import { cardWait, cardOfAnswer } from "./components/card-wait/card-wait.js";
import { stateOfYour, shapeOf, brand as brandOfPill, pill as pillOfState } from "./components/pill/pill.js";
import { setExpensive } from "./cost/expensive.js";
import { setEngine, WITHOUT_ENGINE } from "./delivery-engine/display.js";
import { setCurve } from "./cost/curve.js";
import { setLost } from "./cost/lost.js";
import { setHead } from "./cost/head.js";
import { holdTheFiguresOfAutonomy } from "./autonomy/figures.js";
import { holdTheTeam } from "./autonomy/team.js";
import { holdTheAgents } from "./agents/agents.js";
import { dayOf, setTheCardOfDigest, setTheLog, holdTheCardOfMorning } from "./log/log.js";
import { capacityOfNeed, capacityChoice, comeBack, ONLY, stationAOpen } from "./stations-declared.js";
import { SAYS_TEMPORARY, TEMPORARY } from "./learning.js";
import { absenceALAperture, setAbsence } from "./absence/absence.js";
import { whatAwaitingInTodo, setTheRecap } from "./recap/recap.js";
import { HOME as RESUMES_OF_THE_HOME, holdTheResumesWeekly, TITLE as TITLE_OF_RESUMES } from "./resume-weekly/resume-weekly.js";
import { keepTheKeyboard } from "./keep-the-keyboard.js";
import { ELSEWHERE, setTheCard as setTheCardOfChef, setTheCardAside, setTheList as setTheListOfCards, setTheSend } from "./cards-of-chef/cards-of-chef.js";
import { displayNew, changeOf, setDetailOfValidation } from "./validation-design/detail-of-validation.js";
import { afterRendered as afterTheValidation, CONFIRMATION_MS as CONFIRMATION_VALIDATION_MS, isOneValidation, setCardOfValidation, REPOS as VALIDATION_AT_REST, withoutTheValidated } from "./validation-design/validation-design.js";
import { lineOfRailBlocked } from "./rail-blocked/line-of-rail-blocked.js";
import { lineOfTheWait } from "./wait-of-rail/line-of-the-wait.js";
import { lineOfAlertsOfRail } from "./wait-of-rail/line-of-alerts.js";
import { mountTheBanner } from "./banner-stop/banner-stop.js";
import { whatTheRailSays, lineOfProjectInPause, pauseOfProjects, holdThePause } from "./pause-quota/line-of-the-pause.js";
import { afterRendered as afterTheReview, CONFIRMATION_MS as CONFIRMATION_REVIEW_MS, isOneReview, markSensitive, setCardSensitive, REPOS as REVIEW_AT_REST, WITHOUT_BRIDGE as REVIEW_WITHOUT_BRIDGE } from "./card-sensitive/card-sensitive.js";
import { parkControl } from "./parked/park-control.js";
import { parkGesture } from "./parked/park-gesture.js";
import { afterRendered as afterTheCancellation, setCancellation, REPOS as CANCELLATION_AT_REST, WITHOUT_BRIDGE as CANCELLATION_WITHOUT_BRIDGE } from "./undo/undo.js";
import { afterRendered as afterTheCard, FIELD_OF_CARD, detailsOfCard, setCardOfTodo, REPOS as CARD_AT_REST, seenOfTheCard } from "./card-todo.js";
import { rowOfSecond } from "./todo-card/ask-at-second.js";
import { afterTheRead as afterTheReadOfRepository, UNKNOWN as REPOSITORY_UNKNOWN, sentenceOfRefusal, setOpinionOfRepository } from "./page-project/repository-not-prepare.js";
import { setOpinionOfTodo } from "./todo/opinion-todo.js";
import { setTheOthers } from "./todo/others.js";
import { LIST_OF_CHEF, isRed, tidyTheRail } from "./todo/todo.js";
import { kitchenBoardGrid } from "./kitchen-board/kitchen-board.js";
import { COOKS, OF_RAIL, columnOfPlan, NOT_READY, PASS as COLUMN_PASS, NOTHING_OF_READY, aOneAction, whatAwaitingYou, lineParked, messageOfAlerts, planOfTheKitchen, setTheBandOfTop, setTheTodo } from "./kitchen/kitchen.js";
import { lineOfAlerts, sentenceOfTheWait, heldKnown } from "./line-of-status/line-of-status.js";
import { setLineOfBreaker } from "./todo-breaker-line.js";
import { setRepositoryHeld } from "./onboarding/repository-held.js";
import { setBlockages } from "./project/blockages.js";
import { linesOfRefusal } from "./project/rail/refusal-of-station.js";
import { setDelay } from "./project/delay.js";
import { setTheOffer, firstProjectServed, holdTheOffer } from "./offer-phone/offer-phone.js";
import { setChoice, withoutTheChoice } from "./project/choice.js";
import { setTheSettings } from "./project/settings.js";
import { mountTheHumans, serviceOfBridge } from "./settings-humans/humans.js";
import { mountTheRecurring, serviceOfRecurring } from "./recurring/recurring.js";
import { mountTheCardProject } from "./card-project/mount-card-project.js";
import { mountTheStations, serviceOfBridge as serviceOfStations } from "./settings-stations/stations.js";
import { levelOf, LEVELS_SAID } from "./levels.js";
import { setPageOfStation as setTheShellOfStation } from "./station/page/StationPage.js";
import { diagramHeld, renderWithMermaid } from "./card-diagram/card-diagram.js";
import { lineOfAlert, capRead } from "./stations-of-cooking.js";
import { displacementTracking, isOneComputer, topOf, nameOfTaking, servingOf, ONE_MINUTE_MS } from "./stations-tab/state.js";
import { choiceOfDisplacement } from "./stations-tab/choice.js";
import { serverSeen } from "./add-server/add-server.js";
import { keyOf, OR_DISPLACE, setTheTabOfStations, WHO_COOKED as WHO_COOKED_TAB, WHO_OF_OTHER } from "./stations-tab/stations-tab.js";
import { BY_DEFAULT as ENGINE_BY_DEFAULT } from "./engine/engines.js";
import { setTheCalls } from "./calls-of-the-station.js";
import { cookOfTicket, duration as durationOfCook, action as actionOfCook, setTheActivityOfCook } from "./activity-of-cook.js";
import { setAge, setTrials } from "./cadence.js";
import { setRankOfTrial } from "./card/trial.js";
import { setGuardRepeated } from "./card-ticket/card-ticket.js";
import { setTheWordAtCook } from "./word-at-cook/word-at-cook.js";
import { setTestsOfCard } from "./card-tests/card-tests.js";
import { setLabels } from "./labels-of-slip.js";
import { setTheTrial } from "./trial/trial.js";
import { lineOfRefusal, rowOfRefusal } from "./refusal/refusal.js";
import { afterTheDecision, sentence, setJourney as journeyOfOnboarding } from "./onboarding/journey.js";
import { readTheProject, setFirstLaunch } from "./first-launch.js";
import { holdTheAccount } from "./journey-project/account.js";
import { setTheTools, holdTheTools } from "./tools-required/tools-required.js";
import { REPOSITORY_OF_THE_VISIT, REPLAY, stepsOfTheVisit, markerOfTarget, setTheKitchenVisited, setVisit, holdTheVisit, findTheTarget } from "./visit/visit.js";
import { CLONE_IN, setTheScreenOfAddition } from "./journey-project/addition.js";
import { AT_RETURN, thisComputerOfFirst, nameSaid, proposedOfOffice, BRING_BACK, oneMachine } from "./choice-station/choice-station.js";
import { setTheDeparture, holdTheDepartures } from "./journey-first-project/departure.js";
import { addTheStation, cardOfSetup, choiceOfStation, HERE, setJourneyFirstProject, progression, holdTheJourney, workOfSecond, seenOfJourney } from "./journey-first-project/journey-first-project.js";
import { setTheRequestOfStation, holdTheRequestsOfStation } from "./installation-project/installation-project.js";
import { setFirstTicket, holdTheFirstTickets } from "./first-ticket/first-ticket.js";
import { setStoryOfFirstTicket, holdTheStoryOfFirstTicket } from "./story-first-ticket/story-first-ticket.js";
import { repositoryPastesBy, NOT_ONE_REPOSITORY } from "./journey-project/step-project.js";
import { buttonOfAddition, stateOfTheLine, linesOfProjects, nowOfTheLine } from "./home/projects/projects.js";
import { additionsOfProject as additionsOfRecorded, detailsOf, stateSays, issueOfTheAddition, readOfAccount, lineOfTheRecorded, lineFade, yourOf, oneLineByMachine } from "./stations-of-account.js";
import { setRailPublished } from "./rail-published.js";
import { tellTheRead, setTheRead } from "./rail-read-stale.js";
import { setToolsOfSecond } from "./tools-of-second.js";
import { NO_STATION } from "./cooks/without-station.js";
import { brandAfter } from "./card-wait/card-wait.js";
import { waitExhausted, RAIL_NOT_READ } from "./wait-of-rail.js";
import { AGENTS, MENU, KNOW_HOW, STATIONS } from "./project/menu/menu.js";
import { setTheKnowHow, rereadTheKnowHow } from "./know-how-tab/know-how.js";
import { toggleSwitch as switchOfTheApp } from "./components/switch/switch.js";
import { DONE_SAYS, stationsAPropose, holdTheAdditionOfStation } from "./project/stations/AddStation.js";
import { haltStation, actionOfStop, WITHOUT_ACTION } from "./project/stations/StopStation.js";
import { ORDINARY_IN_PROGRESS, settingsOfTheStation, inputOf } from "./project/stations/StationSettings.js";
import { connectionAtTheStation, linesOfTheStationLocale } from "./project/stations/LocalStation.js";
import { mountThePanel } from "./project/panel-second/panel-second.js";
import { setAddition, setBlockOfProjects } from "./home/projects/ProjectsBlock.js";
import { setBlockOfThePromise } from "./home/promise/PromiseBlock.js";
import { holdBlockOfTheStation } from "./home/station/StationBlock.js";
import { setBlockCapsDuration } from "./project/banner-health/DurationCaps.js";
import { holdTheKnowledge } from "./know-how/know-how.js";
import { setBlockCloser } from "./project/banner-health/Closer.js";
import { setBlockTimeOfThePass } from "./project/banner-health/PassTime.js";
import { setBlockPostMortems } from "./project/banner-health/PostMortems.js";
import { holdTheReport } from "./report/action.js";
import { casesOfVersions, caseOfHere, setVersionsOfStations, statusRead } from "./station-version/station-version.js";
import { lineEmpty } from "./components/line-empty/line-empty.js";
import { lineReadOnly } from "./read-only/read-only.js";
import { WORD_OF_THE_COLUMN, setExplanation, setTheRowOfExplanations, serviceOfExplanations, holdTheExplanations } from "./explanations/explanations.js";
import { THIS_COMPUTER, CANCEL, YES, RETRY, ADD_ONE_PROJECT, NOT_STILL, READ_OF, NOT_REACHED } from "./lexicon.js";
import { sentenceOfRailEmpty, setTheHeld, heldOf, withoutTheApproved } from "./actions-held.js";

// Le format des heures, comme src/format.ts : la vue est un module du navigateur, sans bundler,
// et ne peut pas importer du TypeScript — la locale est la même, anglaise.
const hourOf = (/** @type {number | string | Date} */ instant) => new Date(instant).toLocaleTimeString("en-US");
const dateHour = (/** @type {number | string | Date} */ instant) => new Date(instant).toLocaleString("en-US");

/** @typedef {import("../terminals.ts").Terminal} Terminal */
/** @typedef {import("../bar.ts").Shown} Configuration */
/** @typedef {Configuration["projets"][number]} Project */
/** @typedef {import("../awaiting.ts").Shown} Shown */
/** @typedef {import("../box.ts").Reading} Reading */
/** @typedef {import("../facts.ts").Drawable} Drawable */
/** @typedef {import("../alerts.ts").Alert} Alert */
// Ce que `tabs.ts` nomme : l'onglet Paramètres, qui n'a pas de commande à lui.
const PARAMETERS = "parametres";
// Et la lecture de la page des coûts de l'app (ticket 1022) : `station`, sur la box de chaque projet (tabs.ts, `COUTS`).
const COSTS = "couts";
// Et celle des résumés hebdomadaires (ticket 3263) : lue par le process principal, sans onglet.
const RESUMES = "resumes";
// Les onglets de la page d'un projet (ticket 1184), Rail et Stations.
const RAIL = "rail";
// Le menu du projet (ticket 2485, 2921, 4224, 4241) : Rail · Stations · Agents · Know-how · Settings (project/menu/menu.js).
// Sur un écran étroit — le téléphone (ticket 1186) —, trois colonnes ne tiennent pas : la conversation avec le second
// est un troisième onglet, à la place du panneau de droite.
const CONVERSATION = "second";
const CONVERSATION_TAB = { id: CONVERSATION, titre: "Second" };
const SCREEN_NARROW = "(max-width: 720px)";
const screenNarrow = window.matchMedia?.(SCREEN_NARROW);
const narrow = () => screenNarrow?.matches === true;
// Le panneau du second est à l'écran : ni écran étroit, ni téléphone, ni colonne cachée ou repliée (ticket 3008). Ce qu'il porte ne se montre que s'il l'est.
const panelAFicher = () => !narrow() && phoneSeen === undefined && !columnSecond.hidden && !columnSecond.hasAttribute("data-replie");
// La fenêtre passe d'une largeur à l'autre — un téléphone qu'on tourne, une fenêtre qu'on rétrécit : la page se repose.
screenNarrow?.addEventListener?.("change", () => {
  mark();
  show();
});
// La liste de ce qui attend le chef, que le process principal range à part (facts.ts) : jamais une colonne à l'écran — ses
// cartes sont rouges dans la colonne de leur étape (todo/todo.js, ticket 3458).
const COLUMN_WHO_AWAITING_YOU = LIST_OF_CHEF;
// Les colonnes où quelque chose bouge : Cooks, Pass — et toute colonne où une carte rouge attend le chef. Les autres se
// lisent en défilant, si elles sont hors de vue (ticket 1556).
const COLUMNS_ACTIVE = new Set([COOKS, COLUMN_PASS]);
// Les projets dont la rangée des colonnes a déjà été placée à l'ouverture : ensuite, la lecture suivante garde le défilement du chef.
const rowsPlaced = new Set();
// Le projet et l'onglet que le rail montrait à sa dernière pose : redessiné pour le même, il garde le défilement de la
// page — un clic sur une carte (« Give it to a station ») ne la ramène pas en haut (ticket 2133).
let railPoseOf = "";
// La dernière rangée posée de chaque projet : c'est d'elle que la lecture suivante reprend le défilement.
/** @type {Map<string, HTMLElement>} */
const rows = new Map();
/** @typedef {import("../power-up.ts").Account} Account */
/** @typedef {import("../confirmation.ts").Confirmation} Confirmation */
/** @typedef {import("../service.ts").Guide} Guide */
/** @typedef {import("../removal.ts").Removal} Removal */
/** @typedef {import("../delay.ts").Seen} SeenOfCode */

const brigade = window.brigade;

// Le geste d'un projet, tel que la vue le nomme : par son nom d'étape entre guillemets, « status » —
// jamais par la commande qui le lance, qui ne s'affiche pas (le chef le joue par son bouton).
/** @param {Project} _project @param {string} command */
const gesture = (_project, command) => `the station's “${command.split(" ").filter((m, i, all) => !all.slice(0, i + 1).some((t) => /^[-<]/.test(t))).join(" ")}” step`;
// Ce qui se lit d'un projet : une station le sert (`servi`) — ou cet ordinateur, quand c'est sa station
// qui fait tourner sa cuisine (`ici`, workstation/kitchen-here.ts).
// Tant que la station de cet ordinateur ne tourne pas (`sansStation`), rien n'en est lu : la page
// ne dit que cela, en une ligne (attendre).
/** @param {Project} project */
const itselfLit = (project) => (project.servi === true || project.ici === true) && project.sansStation !== true;
/** @param {string} name */
const projectOf = (name) => configuration.projets.find((project) => project.nom === name);

/** @template {HTMLElement} T @param {string} id @returns {T} */
const element = (id) => /** @type {T} */ (document.getElementById(id));
const bar = element("projets");
const all = element("tous");
const cardsOfChef = element("cartes-du-chef");
const principal = /** @type {HTMLElement} */ (document.querySelector("main"));
const band = element("alertes");
const stop = element("arret");
const space = element("espace");
const tabsOfProject = element("onglets-du-projet");
const labelOfTheStation = element("etiquette-de-station");
const content = element("contenu");
const center = element("centre");
const rail = element("rail");
const card = element("fiche");
const detailOfValidation = element("detail-de-validation");
const readTab = element("lu-onglet");
const tabReading = element("lecture-onglet");
const switchProject = element("interrupteur-projet");
const stopKitchen = element("arreter-cuisine");
const sectionKitchen = element("reglages-cuisine");
const note = element("note");
const tabsTerminals = element("terminaux");
const closeShell = element("fermer-shell");
const listMachines = element("machines");
const columnSecond = element("second");
const noteSecond = element("note-second");
const explanationSecond = element("explication-second");
const explanationsOfChef = element("explications-du-chef");
const toolsOfSecond = element("outils-du-second");
// Le stockage de la vue, ou rien quand son accès est refusé : la lecture de `window.localStorage` lève alors (SecurityError),
// et chacun de ses usagers fait sans lui plutôt que de casser la vue au démarrage.
/** @returns {Storage | undefined} */
function storageOfTheVue() {
  try {
    return window.localStorage ?? undefined;
  } catch {
    return undefined;
  }
}
// La visite d'une vraie cuisine (ticket 4087, visite/) : son écran par-dessus tout, la cuisine de Brigade en lecture seule,
// l'étape où en est la visite guidée, et ce que la dernière lecture de cette cuisine a rendu — absente, elle est en route.
const sectionVisit = element("visite");
// L'app derrière la visite : inerte tant que la visite est ouverte — aucun de ses gestes sur un ticket ne se focalise, ne
// se lit ni ne se clique sous l'écran de la visite, même quand un projet est ouvert dessous.
const frameUnderTheVisit = element("cadre");
const visit = holdTheVisit({ rendre: () => setTheVisit() });
/** @type {import("../visit.ts").KitchenVisited | undefined} */
let kitchenVisited;
let readOfTheVisit = 0;
const markTheTarget = markerOfTarget();
// L'écran « since you were away » (ticket 3305, absence/) : décidé une fois, à l'ouverture — la date de la dernière ouverture
// est alors réécrite —, et montré avant tout autre écran. Vaut la date de l'ancienne ouverture quand l'écran vient.
const absenceSince = absenceALAperture({ stockage: window.localStorage ?? undefined });
const sectionAbsence = element("absence");
/** @type {Map<string, import("./resume-weekly/resume-kitchen.ts").ResumesOfProject>} */
const resumesOfTheAbsence = new Map();
/** @type {Set<string>} */
const readsOfTheAbsence = new Set();
let absenceClosed = false;
let absenceSet = "";
// Ce que la page d'un projet montre tant qu'il n'est pas prêt (ticket 3166, parcours-premier-projet/) : à la place du rail,
// une question à la fois — qui le cuit, puis sa mise en place s'il le faut. Le parcours de chaque projet qu'« Add a
// project » a ouvert ; ceux qui attendent leur première lecture — elle seule dit si le compte GitHub peut écrire dans
// leur dépôt ; les lectures de leur mise en place en route ; et le dernier titre que `claude` a donné au terminal du
// second de chaque projet : au travail, ou au repos à son invite.
const sectionOfJourney = element("parcours-premier-projet");
const journeyOfProjects = holdTheJourney({ rendre: (name) => void (current?.nom === name && setTheProjectAPrepare()) });
// Le récit du premier ticket du premier projet du chef (ticket 3302, recit-premier-ticket/) : au-dessus du rail, une ligne à
// chaque vraie étape que les lectures du rail montrent, gardée dans le stockage de la vue jusqu'à ce que le chef la range.
const sectionOfStory = element("recit-premier-ticket");
const storyOfFirstTicket = holdTheStoryOfFirstTicket({ stockage: window.localStorage ?? undefined, rendre: () => setTheStoryOfFirstTicket() });
// Le départ d'un projet qui arrive avec des issues ouvertes (ticket 3268, journey-first-project/departure.js) : l'écran des
// propositions du second, avant les questions du parcours.
const departuresOfProjects = holdTheDepartures({ rendre: (name) => void (current?.nom === name && setTheProjectAPrepare()) });
// Le premier ticket d'un projet prêt (ticket 3306, premier-ticket/) : la question du second, son brouillon, le « oui » du chef.
const firstTickets = holdTheFirstTickets({
  rendre: (name) => void (current?.nom === name && setTheProjectAPrepare()),
  rediger: (name, request) => brigade.redigerLePremierTicket(name, request),
  creer: (name, draft) => brigade.creerLePremierTicket(name, draft),
});
// Un projet dont la mise en place vient de passer, qu'aucune station ne sert (ticket 3400, installation-projet/) : sa page
// demande aussitôt laquelle le sert, cet ordinateur en tête. Rangée par « not now », la question ne revient pas.
const sectionOfTheRequest = element("installation-projet");
const requestsOfStation = holdTheRequestsOfStation({ rendre: (name) => void (current?.nom === name && setTheRequestOfStationHere()) });
/** @type {Map<string, string>} */
const aGuide = new Map();
/** @type {Set<string>} */
const preparationsInRead = new Set();
/** @type {Map<string, string>} */
const titlesOfSeconds = new Map();
const thread = element("fil");
const banner = element("bandeau");
const headOfSecond = element("tete-du-second");
// Le panneau du second (ticket 2923) : un bouton le replie, son bord gauche se tire ; largeur et état retenus par projet.
// Le rail et lui se partagent la place de l'espace : la largeur du panneau en est bornée.
const panelOfSecond = mountThePanel({
  document,
  colonne: columnSecond,
  tete: headOfSecond,
  stockage: storageOfTheVue(),
  disponible: () => {
    const rail = principal.getBoundingClientRect?.().width;
    const panel = columnSecond.getBoundingClientRect?.().width;
    return rail === undefined || panel === undefined ? undefined : rail + panel;
  },
});
window.addEventListener?.("resize", () => panelOfSecond.reborner());
const message = element("message");
const state = element("etat");
// Settings (ticket 1700, 2494) : un seul groupe, le projet. Ce qui était à cette machine n'y est plus : ses lignes sont
// toujours posées, dans un conteneur caché, jusqu'à ce que Stations les reprenne.
const groupMachine = element("reglages-machine");
const emptyProject = element("vide-project");
const removal = element("retrait");
const colors = element("couleurs");
const acronym = element("sigle");
const menuBar = element("barre-de-menus");
const ordinary = element("ordinaires");
// Les GitHub Apps de la station de cet ordinateur, une ligne par rôle (ticket 2317, identities-github.js) : relues à
// l'ouverture de chaque projet ; un appareil sans station (le téléphone) n'en pose aucune.
const appsGithub = element("apps-github");
const identitiesGithub = holdTheIdentities({ pont: brigade, rendre: () => setTheAppsGithub() });
function setTheAppsGithub() {
  const state = identitiesGithub.etat;
  appsGithub.hidden = state === undefined;
  appsGithub.replaceChildren(...(state === undefined ? [] : [setTheIdentities(document, state, identitiesGithub.gestes)]));
  setTheGroups();
}
// Les projets que la station de cet ordinateur sert (ticket 2359, projets-servis/), lus sans rien régler : une ligne par
// projet de l'app, et, la liste vide, la ligne qui dit que cet ordinateur n'en sert aucun. Ils se changent sur l'onglet
// Stations de chaque projet (ticket 3402). Relus à l'ouverture de chaque projet ; un appareil sans station (le téléphone)
// n'en pose aucun.
const projectsServed = element("projets-servis");
const servedOnes = holdTheProjectsServed({
  pont: brigade,
  rendre: () => {
    setTheProjectsServedHere();
    // L'onglet Stations la lit aussi : la carte de cet ordinateur suit la liste (ticket 3402).
    restTheTabStations();
  },
});
function setTheProjectsServedHere() {
  const state = servedOnes.etat;
  projectsServed.hidden = state === undefined;
  projectsServed.replaceChildren(...(state === undefined ? [] : [setTheProjectsServed(document, { etat: state, projets: configuration.projets, ici: WORKSTATION.nom })]));
  setTheGroups();
  setTheRequestOfStationHere();
}
// La station de cet ordinateur sert-elle le dépôt du projet, d'après sa liste ? Liste non lue, ou dépôt inconnu : on ne
// sait pas (`undefined`).
/** @param {Project} project @returns {boolean | undefined} */
function servedByThisComputer(project) {
  const repository = (project.depot ?? projectsSeen?.projets.find(({ nom: name }) => name === project.nom)?.depot ?? "").toLowerCase();
  const reading = servedOnes.etat?.lecture;
  if (repository === "" || reading === undefined || !("depots" in reading)) return undefined;
  return reading.depots.some((served) => served.toLowerCase() === repository);
}
// « Add a station », dans l'onglet Stations (ticket 2487, project/stations/AddStation.js) : cet ordinateur d'abord, par sa
// liste — puis elle se relit ; une station appairée, par le geste de sa page sur l'accueil. Le parcours change : l'onglet
// se repose, s'il est montré.
const additionOfStation = holdTheAdditionOfStation({
  servirIci: (repository) => serveHereTheRepository(repository),
  choisir: (id, repositories) => chooseForOneRecorded(id, repositories),
  rendre: () => restTheTabStations(),
});
// La station de cet ordinateur sert un dépôt : il entre dans sa liste — puis la liste se relit. « Add a station » le fait.
/** @param {string} repository @returns {Promise<import("./projects-served/projects-served.js").ReadOfProjectsServed>} */
async function serveHereTheRepository(repository) {
  const rendered = (await brigade.servirUnProjet?.(repository, true)) ?? { refus: NOT_REACHED(`${THIS_COMPUTER}'s station`) };
  void servedOnes.lire();
  return rendered;
}
function restTheTabStations() {
  if (current !== undefined && tabOf(current) === STATIONS) setRail(current);
}
// « Add a server » (ticket 4347, add-server/) : son panneau, ouvert pour un projet — sur son onglet Stations ou sa page
// « who cooks it ». `connues` : les stations du compte qu'il avait à son ouverture — une qui n'y était pas est le serveur
// neuf, qui s'enregistre seul sous le compte ; pas encore lues, elles le sont à la première lecture. `copiee` : la ligne
// d'installation vient d'être copiée.
/** @type {{ projet: string, connues?: ReadonlySet<string>, copiee: boolean } | undefined} */
let serverExpected;
/** @param {import("../stations-of-account.ts").StationsOfAccount | undefined} readEntries */
const idsOfAccount = (readEntries) => (readEntries?.state === "listed" ? new Set(readEntries.stations.map(({ id }) => id)) : undefined);
// Le panneau se repose là où il est montré : l'onglet Stations, ou la page d'un projet pas prêt.
function restTheServer() {
  restTheTabStations();
  if (current !== undefined && journeyOfProjects.de(current.nom) !== undefined) setTheProjectAPrepare();
}
// Ce que le panneau montre pour un projet. `confiable` : l'écran sait lui confier le projet — il le nomme alors.
/** @param {string} project @param {boolean} confiable @returns {import("./add-server/add-server.js").StateOfServer} */
function serverOf(project, confiable) {
  const opened = serverExpected?.projet === project;
  const seenOne = serverSeen(opened ? serverExpected?.connues : undefined, recordedAbsent ? undefined : stateOfRecorded.stations);
  return { ouvert: opened, vu: seenOne, copiee: opened && serverExpected?.copiee === true, ...(confiable ? { projet: project } : {}) };
}
// « check again » : les stations du compte se relisent — celles d'avant sont prises à la première lecture qui réussit.
async function rereadTheServer() {
  await readTheRecorded();
  const known = idsOfAccount(recordedAbsent ? undefined : stateOfRecorded.stations);
  if (serverExpected !== undefined && serverExpected.connues === undefined && known !== undefined) serverExpected.connues = known;
  restTheServer();
}
// Les gestes du panneau pour un projet. `confier` : le geste de l'écran qui donne le projet à une station du compte.
/** @param {string} project @param {(station: import("../stations-of-account.ts").StationRecorded) => void} entrust @returns {import("./add-server/add-server.js").ActionsOfServer} */
function actionsOfServer(project, entrust) {
  return {
    basculer: (opened) => {
      if (!opened) {
        serverExpected = undefined;
        return restTheServer();
      }
      const known = idsOfAccount(recordedAbsent ? undefined : stateOfRecorded.stations);
      serverExpected = { projet: project, copiee: false, ...(known === undefined ? {} : { connues: known }) };
      restTheServer();
      void rereadTheServer();
    },
    copier: (command) => {
      void navigator.clipboard?.writeText(command)?.catch(() => {});
      if (serverExpected?.projet === project) serverExpected.copiee = true;
      restTheServer();
    },
    verifier: () => void rereadTheServer(),
    // Confié, le panneau se ferme : l'écran dit, par le geste de « Choose who cooks it », à qui le projet est allé.
    confier: (station) => {
      serverExpected = undefined;
      entrust(station);
      restTheServer();
    },
  };
}
const settingsOfProject = element("reglages-du-projet");
const settingsExtra = element("reglages-du-projet-en-plus");
const opinion = element("avis");
// Les stations que la box de chaque projet déclare, telles que le dernier contrôle de son installation les a lues
// (service.ts, `controle.stations`) : gardées d'un guide à l'autre, jusqu'à la lecture suivante.
/** @type {Map<string, import("../service.ts").StationsRead>} */
const declaredEntries = new Map();
// « report to brigade », sous chaque panne que l'app montre (ticket 1977) : une issue préremplie, ouverte dans le navigateur.
// Sur le téléphone, rien ne l'ouvrirait : le bouton n'y est pas.
const report = holdTheReport({ doc: document, pont: brigade, actif: () => phoneSeen === undefined });
// Le bandeau de la cuisine arrêtée (ticket 3924), en tête du rail : monté une fois, chaque lecture du rail le pose ou le retire.
const hostOfTheStop = document.createElement("div");
hostOfTheStop.className = "hote-bandeau-arret";
// Son geste vise le projet affiché (ticket 4238).
const bannerOfStop = mountTheBanner(document, hostOfTheStop, {
  ouvrirTicket: (ticket) => void (current === undefined ? undefined : openIssue(current, ticket)),
  ouvrirLesChecks: () => void (current === undefined ? undefined : openTheChecks(current)),
  relire: () => readTheFacts(),
});
const alertOfKitchen = document.createElement("div");
alertOfKitchen.id = "alerte-de-cuisine";
const addition = element("ajout");
const review = element("relecture");
// Posé dans le conteneur caché de ce qui était sous cette machine : le code de l'app, et des clones de brigade — la case « T » le dit aussi, au survol.
const code = document.createElement("div");
code.id = "code";
code.ariaLive = "polite";
groupMachine.append(code);
// L'accueil, « Tous les projets » : la vue d'ensemble de brigade (home.ts). Trois blocs (tickets 2638, 3195) : la liste
// des projets — une ligne chacun, un clic ouvre son espace —, la station de cet ordinateur, et toutes les stations.
const projectsOfTheHome = document.createElement("section");
projectsOfTheHome.id = "accueil-projets";
projectsOfTheHome.className = "liste";
projectsOfTheHome.ariaLabel = "Projects";
// Toutes les stations — une ligne par machine, un clic ouvre sa page —, et « + station » : elles valent pour le compte, pas
// pour un projet. Sous l'onglet Stations de chaque projet depuis le ticket 2638, elles reviennent sur l'accueil, un bloc à
// elles sous la station de cet ordinateur (ticket 3195) : l'onglet ne montre que les stations qui servent le projet.
const ALL_THE_STATIONS = "All stations";
const stationsOfTheHome = document.createElement("section");
stationsOfTheHome.id = "toutes-les-stations";
stationsOfTheHome.className = "bloc-de-l-accueil";
stationsOfTheHome.ariaLabel = ALL_THE_STATIONS;
stationsOfTheHome.dataset.bloc = "toutes-les-stations";
// Ses lignes dans une carte, comme celles des projets au-dessus.
const listOfStations = document.createElement("div");
listOfStations.className = "liste";
listOfStations.ariaLive = "polite";
// « + station », sous la liste : le champ du code s'ouvre dessous, et nulle part ailleurs. Il est posé
// une fois : une relecture ne vide pas ce que le chef tape.
const openThePairing = /** @type {HTMLButtonElement} */ (button("+ station", undefined));
openThePairing.className = "ajout-de-station";
const formOfPairing = document.createElement("form");
formOfPairing.hidden = true;
const codeTape = document.createElement("input");
codeTape.placeholder = "the code a new station shows, like 7KQ2-M9XD";
codeTape.ariaLabel = "pairing code";
codeTape.autocomplete = "off";
codeTape.spellcheck = false;
const pairing = buttonOfTheFamily(document, "pair", undefined, { sorte: "recommande", type: "submit" });
const giveUpPairing = /** @type {HTMLButtonElement} */ (button(CANCEL, undefined, "discret"));
const pairingSays = document.createElement("p");
pairingSays.ariaLive = "polite";
formOfPairing.append(codeTape, pairing, giveUpPairing, pairingSays);
// Les stations enregistrées sous le compte GitHub du chef (ticket 1706, stations-of-account.js) : dans la liste des
// stations, une ligne pour chaque machine qu'aucune station appairée ne nomme (ticket 1778) — un clic ouvre sa page, où se
// cochent les projets qu'elle sert ; sous la liste, ce que leur lecture a de plus à dire. Lues à chaque ouverture de l'accueil, ou
// à la demande ; rien n'est posé avant la première réponse, ni sur un pont qui ne les lit pas.
const blockOfRecorded = document.createElement("section");
blockOfRecorded.className = "stations-du-compte";
blockOfRecorded.ariaLive = "polite";
blockOfRecorded.hidden = true;
// La version de la station de cet ordinateur à côté de celle de la box (ticket 2191, station-version/) : sous la liste,
// côte à côte, et ce poste dit en retard quand une station plus haute est publiée. Rien sur le téléphone, qui n'en a pas.
const versionsOfStations = document.createElement("div");
versionsOfStations.ariaLive = "polite";
stationsOfTheHome.append(block("h2", ALL_THE_STATIONS), listOfStations, versionsOfStations, blockOfRecorded, openThePairing, formOfPairing);
/** @type {import("./stations-of-account.js").StateOfAccount} */
const stateOfRecorded = {};
let recordedAbsent = true;
let readOfRecorded = 0;
/** @type {import("./stations-of-account.js").ActionsOfAccount} */
const actionsOfRecorded = {
  ouvrirLaStation: (id) => openStation(id),
  relire: () => {
    void readTheRecorded();
  },
  seConnecter: () => void itselfConnectAGitHub(),
  ouvrirLaPage: (url) => void brigade.ouvrirLaPage?.(url),
  copier: (command) => {
    void navigator.clipboard?.writeText(command)?.catch(() => {});
    stateOfRecorded.copiee = command;
    setStationsOfTheHome();
  },
};
// La page d'une station, ouverte d'un clic sur sa ligne : son état, ses pannes et leur bouton, et les projets qu'elle
// sert — une liste qui se lit seulement, chacun menant à l'onglet Stations de son projet. Rien ne s'y tape au terminal.
const pageOfStation = document.createElement("section");
pageOfStation.id = "station";
pageOfStation.className = "carte";
const inHeadOfStation = document.createElement("header");
const outagesOfStation = document.createElement("div");
outagesOfStation.ariaLive = "polite";
const projectsOfTheStation = document.createElement("div");
projectsOfTheStation.ariaLive = "polite";
const returnALHome = /** @type {HTMLButtonElement} */ (button("‹ All projects", undefined, "discret"));
returnALHome.className = "retour";
// Le plafond de cooks, sous l'en-tête : ce que `status` en dit, et ce qui retient la station.
const capOfStation = document.createElement("div");
capOfStation.className = "plafond-de-station";
capOfStation.ariaLive = "polite";
// La ligne de mise à jour, sous l'en-tête ; et, au bas de la page, « remove the station » et sa confirmation.
const versionOfStation = document.createElement("p");
versionOfStation.className = "version-de-station";
const removalOfStation = document.createElement("div");
removalOfStation.className = "retrait-de-station";
// Ses sections, sous ses pannes (ticket 2641, épique 2497) : identité, connexions, dossiers et bac à sable, capacités,
// cooks — posées par la coque de station/page/StationPage.js.
const sectionsOfStation = document.createElement("div");
sectionsOfStation.className = "sections-de-station";
pageOfStation.append(returnALHome, inHeadOfStation, capOfStation, versionOfStation, outagesOfStation, sectionsOfStation, projectsOfTheStation, removalOfStation);
// Le coût de tous les projets (ticket 1022) : il vaut pour l'ensemble, il vit donc au niveau de l'app, pas dans
// un projet. Une ligne « Cost » l'ouvre, en bas du bandeau de santé de chaque projet (sur l'accueil jusqu'au ticket 2638). Sa page : les tokens
// lancés sur 5 h, 24 h et 7 jours par projet, les tokens perdus, les tickets les plus chers, la courbe, et
// le renvoi vers `/usage` (cost/). Un clic sur un projet l'ouvre ; sur un ticket, ouvre sa fiche dans son projet.
const costsOfTheHome = document.createElement("section");
costsOfTheHome.id = "couts-de-tous";
costsOfTheHome.ariaLabel = "Cost";
const openTheCosts = /** @type {HTMLButtonElement} */ (block("button", ""));
openTheCosts.type = "button";
openTheCosts.className = "ligne";
openTheCosts.ariaLabel = "the cost of all projects";
{
  const suite = block("span", "›");
  suite.className = "ouvrir";
  suite.ariaHidden = "true";
  openTheCosts.append(block("strong", "Cost"), block("span", "tokens over 5 h, 24 h and 7 d · lost tokens · most expensive tickets"), suite);
}
costsOfTheHome.append(openTheCosts);
const pageOfCosts = document.createElement("section");
pageOfCosts.id = "cout";
pageOfCosts.ariaLabel = "Cost of all projects";
const returnOfCosts = /** @type {HTMLButtonElement} */ (button("‹ All projects", undefined, "discret"));
returnOfCosts.className = "retour";
const bodyOfCosts = document.createElement("div");
bodyOfCosts.ariaLive = "polite";
pageOfCosts.append(returnOfCosts, bodyOfCosts);
// Les résumés hebdomadaires de la cuisine de chaque projet (ticket 3263), de même : une ligne « Weekly summary » ouvre leur
// page (resume-hebdomadaire/), lue et publiée par le process principal.
const resumesOfTheHome = document.createElement("section");
resumesOfTheHome.id = "resumes-de-tous";
resumesOfTheHome.ariaLabel = TITLE_OF_RESUMES;
const openTheResumes = /** @type {HTMLButtonElement} */ (block("button", ""));
openTheResumes.type = "button";
openTheResumes.className = "ligne";
openTheResumes.ariaLabel = "the weekly summaries of all projects";
{
  const suite = block("span", "›");
  suite.className = "ouvrir";
  suite.ariaHidden = "true";
  openTheResumes.append(block("strong", TITLE_OF_RESUMES), block("span", RESUMES_OF_THE_HOME), suite);
}
resumesOfTheHome.append(openTheResumes);
// Les lignes de tous les projets, dans le bandeau de santé de chacun (ticket 2638) : elles valent pour l'ensemble.
const ALL_THE_PROJECTS = "All projects";
const ofAllTheProjects = document.createElement("section");
ofAllTheProjects.id = "de-tous-les-projets";
ofAllTheProjects.className = "bloc-du-projet";
ofAllTheProjects.ariaLabel = ALL_THE_PROJECTS;
ofAllTheProjects.dataset.bloc = "de-tous-les-projets";
ofAllTheProjects.append(block("h3", ALL_THE_PROJECTS), costsOfTheHome, resumesOfTheHome);
// L'accueil a les projets et la station de cet ordinateur (ticket 2638, épique 2497) — chacun son composant, sous
// accueil/ —, puis toutes les stations (ticket 3195). La version de l'app et la ligne de santé l'ont quitté sans aller ailleurs : la ligne d'une
// version plus haute, en tête de l'app (update/banner.js), dit la version qui tourne et l'installe.
const blockOfThePromise = setBlockOfThePromise(document);
const blockOfProjects = setBlockOfProjects(document, projectsOfTheHome);
// Le récapitulatif de chaque projet, en tête de l'accueil (ticket 3581, recap/) : sa place, que `poserLeRecapDeLAccueil` remplit.
const recapOfTheHome = document.createElement("div");
recapOfTheHome.id = "recap-de-l-accueil";
// Ce qui en est lu à cette ouverture de l'app, par projet ; ce qui se lit encore ; ce que le runtime sait montré.
// `null` : le pont n'a rien rendu — il ne porte pas le récapitulatif, le projet n'en montre aucun.
/** @type {Map<string, import("./recap/recap-box.ts").ReadOfRecap | null>} */
const recapsRead = new Map();
/** @type {Set<string>} */
const recapsInRead = new Set();
/** @type {Set<string>} */
const recapsMarks = new Set();
// Les premiers réglages de la station qu'on vient d'installer : se connecter à GitHub (le geste que l'app a déjà), puis
// choisir les projets qu'elle sert, sur sa page.
const blockOfTheStation = holdBlockOfTheStation(document, {
  installer: async () => (brigade.installerLaStation === undefined ? { refus: "this app cannot install the station on this device" } : brigade.installerLaStation()),
  etapes: [
    {
      nom: "GitHub",
      dit: "the station reads and pushes your projects through your GitHub account",
      ...(brigade.seConnecterAGitHub === undefined
        ? {}
        : {
            geste: {
              libelle: "Connect to GitHub",
              faire: async () => {
                const start = await brigade.seConnecterAGitHub?.();
                return start !== undefined && "refus" in start ? start : undefined;
              },
            },
          }),
    },
    { nom: "Projects", dit: "choose which projects this station serves, on its page — you can do it later" },
  ],
  ouvrir: (id) => openStation(id),
});
const pageOfResumes = document.createElement("section");
pageOfResumes.id = "resumes";
pageOfResumes.ariaLabel = TITLE_OF_RESUMES;
const returnOfResumes = /** @type {HTMLButtonElement} */ (button("‹ All projects", undefined, "discret"));
returnOfResumes.className = "retour";
const resumesOfAll = holdTheResumesWeekly(document, {
  lire: (name) => brigade.lireLesResumesHebdomadaires(name),
  changerJour: (name, day) => brigade.changerLeJourDuResume(name, day),
  publier: (name, resume, tag) => brigade.publierLeResumeHebdomadaire(name, resume.weekStart, tag),
  ouvrir: (url) => void brigade.ouvrirTicketDuResume(url),
  ouvrirProposition: (url) => void brigade.ouvrirLaProposition(url),
});
pageOfResumes.append(returnOfResumes, resumesOfAll.element);

// La cuisine d'un projet de l'app (ticket 983), en tête de son espace : les stations qui la font, en une
// ligne — chacune avec ce qu'elle en dit, un clic ouvre sa page —, et « + station » pour en ajouter
// une. Tant qu'aucune ne la fait, une phrase le dit, et « choose its machine » ouvre le choix
// parmi les stations appairées : c'est le seul geste qui installe un projet sur une station.
const stationsOfProject = element("stations-du-projet");
// Ce qui bloque le projet affiché (ticket 1399), sous ses stations, tel que le suivi le publie : une ligne par
// blocage (project/blockages.js). Les détails que le chef a dépliés, par projet et blocage : une relecture ne les replie pas.
const delayOfProject = element("delai-du-projet");
// L'équipe du projet affiché (ticket 4029, autonomy/team.js), en tête de sa vue : relue à son ouverture et à chaque
// lecture de son rail, montrée pour lui seul.
// La bande du haut du rail lit son supervisor et son closer : une lecture qui les change la repose (ticket 4238).
// Un clic sur un badge ouvre l'onglet Agents (ticket 4224).
const teamOfProject = holdTheTeam(document, element("equipe-du-projet"), (name) => {
  if (current?.nom === name) setRail(current);
}, () => chooseTab(AGENTS));
// L'onglet Agents du projet affiché (ticket 4224, agents/) : ses agents lus au runtime à l'ouverture de l'onglet, une carte
// chacun ; les listes du modèle et de l'effort sont celles du calibrage que l'app connaît.
const agentsOfProject = holdTheAgents(document, { valeurs: () => PROJECT_CALIBRATION });
// L'offre du téléphone (ticket 3303, offre-telephone/) : sous le délai du premier projet du chef, une fois son premier
// ticket servi, si aucun téléphone n'est déjà connecté au compte GitHub ; acceptée, le lien de l'app Android ; déclinée
// ou suivie, gardée rangée dans le stockage de la vue.
// La carte du digest de la veille (ticket 4274, journal/) : en tête du rail à la première ouverture du projet dans le jour.
const cardOfMorning = holdTheCardOfMorning(storageOfTheVue());
const offerOfPhone = element("offre-telephone");
const offer = holdTheOffer({
  stockage: storageOfTheVue(),
  lire: async () => brigade.lienDeLApk?.(),
  connecte: async () => brigade.telephoneConnecte?.(),
  ouvrir: (link) => void brigade.ouvrirLaPage?.(link),
  rendre: () => setTheOfferOfPhone(current),
});
const bannerHealth = element("bandeau-sante");
const blockagesOfProject = element("blocages-du-projet");
/** @type {Map<string, Set<string>>} */
const blockagesUnfolded = new Map();
// Les projets dont le chef a déplié « Awaiting others » au pied de TODO (ticket 2985) : la lecture suivante la garde dépliée.
/** @type {Set<string>} */
const othersUnfolded = new Set();
// Ce qui manque au projet pour ses tests (ticket 1400), au-dessus de ses blocages : une carte par besoin
// (project/choice.js). Par projet : les choix dont l'issue part (`enCours`), celles qui sont écrites et que la station
// n'a pas encore relues (`retenus`), et pourquoi une issue n'a pas été retenue (`refus`).
const choiceOfProject = element("choix-du-projet");
/** @type {Map<string, { enCours: Set<string>, retenus: Set<string>, refus: Map<string, { refus: string, detail?: string }> }>} */
const choiceHeld = new Map();
const lineOfStationsOfProject = document.createElement("p");
lineOfStationsOfProject.ariaLive = "polite";
const openTheTrust = /** @type {HTMLButtonElement} */ (button("", undefined));
openTheTrust.className = "ajout-de-station";
// Le choix lui-même, une carte (ticket 1107). En tête, une phrase dit ce que le chef fait, et une autre
// ce que fait la machine qu'il choisit. Puis les machines, une à choisir, chacune avec ce qu'elle implique — cet
// ordinateur d'abord, une station en ligne proposée d'office (choix-station/, ticket 3187) —, et les cooks à la fois de
// la machine choisie. Le calibrage du manager et du reviewer n'y est pas : il part tel que l'app le recommande, et se
// change dans les réglages du projet. Chaque valeur arrive posée, avec d'où elle vient : le chef peut tout changer, ou
// lancer sans rien toucher.
const formOfTrust = document.createElement("form");
formOfTrust.className = "confiance";
formOfTrust.hidden = true;
const titleOfTrust = document.createElement("h3");
const meaningOfTrust = document.createElement("p");
meaningOfTrust.className = "aide";
// Un champ : son libellé, en entier au-dessus de lui, et ce qu'il en est dit dessous.
/** @param {string} wording @param {HTMLElement} input @param {HTMLElement | undefined} said @param {HTMLElement} level l'étiquette du réglage (levels.js) */
function fieldOfTrust(wording, input, said, level) {
  const pose = document.createElement("div");
  pose.className = "champ";
  const named = block("label", wording);
  input.id = `confiance-${wording.toLowerCase().replace(/[^a-z]+/g, "-")}`;
  /** @type {HTMLLabelElement} */ (named).htmlFor = input.id;
  pose.append(named, level, input, ...(said === undefined ? [] : [said]));
  return pose;
}
const repositoryOfTrust = /** @type {HTMLSelectElement} */ (document.createElement("select"));
repositoryOfTrust.ariaLabel = "repository";
const baseOfTrust = document.createElement("input");
baseOfTrust.ariaLabel = "integration branch";
baseOfTrust.spellcheck = false;
const fieldOfRepository = fieldOfTrust("Its GitHub repository", repositoryOfTrust, undefined, levelOf(document, "depot"));
const fieldOfTheBase = fieldOfTrust("Its integration branch", baseOfTrust, block("small", "The branch the kitchen delivers to."), levelOf(document, "branche"));
const stationsChosenOfTrust = document.createElement("fieldset");
const legendOfStationsChosen = document.createElement("legend");
const meaningOfStationsChosen = document.createElement("p");
meaningOfStationsChosen.className = "aide";
const choiceOfStationsChosen = document.createElement("div");
choiceOfStationsChosen.className = "machines";
stationsChosenOfTrust.append(legendOfStationsChosen, meaningOfStationsChosen, choiceOfStationsChosen);
const cooksOfTrust = document.createElement("input");
cooksOfTrust.type = "number";
cooksOfTrust.min = "1";
cooksOfTrust.ariaLabel = "cooks at once";
const cooksSaid = document.createElement("small");
cooksSaid.className = "propose";
const fieldOfCooks = fieldOfTrust("Cooks at once", cooksOfTrust, cooksSaid, levelOf(document, "cooks"));
// Une station de plus (ticket 1307) ne dit que ce qui est à sa machine, posé d'emblée : ses cooks, le dossier où sa
// station pose les espaces de travail de ses cooks — qu'elle choisit elle-même : il se lit, il ne se change pas ici —,
// et ce que la machine sait faire, une case par capacité, cochée quand elle y est détectée.
const folderOfTrust = document.createElement("input");
folderOfTrust.readOnly = true;
folderOfTrust.spellcheck = false;
folderOfTrust.ariaLabel = "workspace folder";
const folderSays = document.createElement("small");
const fieldOfFolder = fieldOfTrust("Workspace folder", folderOfTrust, folderSays, levelOf(document, "dossier"));
const capacitiesOfTrust = document.createElement("fieldset");
const legendOfCapacities = document.createElement("legend");
const capacitiesChoice = document.createElement("div");
capacitiesChoice.className = "capacites";
capacitiesOfTrust.append(legendOfCapacities, levelOf(document, "capacites"), capacitiesChoice);
const trustRefused = document.createElement("div");
trustRefused.ariaLive = "polite";
const validateTrust = /** @type {HTMLButtonElement} */ (buttonOfTheFamily(document, "", undefined, { sorte: "recommande", type: "submit" }));
const cancelTrust = /** @type {HTMLButtonElement} */ (button(CANCEL, undefined, "discret"));
const actionsOfTrust = document.createElement("div");
actionsOfTrust.className = "lancer";
actionsOfTrust.append(validateTrust, cancelTrust);
formOfTrust.append(titleOfTrust, meaningOfTrust, fieldOfRepository, fieldOfTheBase, stationsChosenOfTrust, fieldOfCooks, fieldOfFolder, capacitiesOfTrust, trustRefused, actionsOfTrust);
const trustSaid = document.createElement("p");
trustSaid.ariaLive = "polite";
// Déménager sa cuisine (ticket 1095), d'un seul geste : « move the kitchen » ouvre, sous la ligne, le
// choix de la machine où l'emmener — cet ordinateur, sa box, une autre —, et ce que ça coûte, en une
// ligne. Un clic sur une machine la déménage, sans retrait ni rajout. Refusé, la raison se dit en une
// phrase sous la ligne, et la ligne ne change pas : il cuit toujours là où il cuisait.
const openTheMove = /** @type {HTMLButtonElement} */ (button("move the kitchen", undefined));
openTheMove.className = "ajout-de-station";
openTheMove.dataset.geste = "demenager";
// Caché tant qu'aucun projet ouvert ne l'offre : rien ne le montre avant (ticket 4087, la visite n'offre aucun geste).
openTheMove.hidden = true;
const choiceOfMove = document.createElement("section");
choiceOfMove.className = "demenagement";
choiceOfMove.ariaLabel = "Move the kitchen";
choiceOfMove.hidden = true;
const moveSays = document.createElement("p");
moveSays.className = "demenagement-dit";
moveSays.ariaLive = "polite";
// Une station du compte à qui le chef a choisi le projet alors qu'une autre le servait déjà, et qui ne peut pas en
// rejoindre la cuisine (ticket 1790) : sa phrase, sous la ligne — la ligne ne la compte pas parmi ses stations.
const stationRefused = document.createElement("div");
stationRefused.ariaLive = "polite";
stationRefused.hidden = true;
// Le parcours d'un projet neuf (ticket 1111) : de sa station choisie à son premier ticket, en quatre
// étapes, telles que le suivi les publie — à la place du vide sous la ligne (onboarding/journey.js).
const journeyOfProject = document.createElement("div");
journeyOfProject.className = "parcours-du-projet";
journeyOfProject.ariaLive = "polite";
// Ce qui retient la cuisine du projet (ticket 1119) : l'accès au dépôt refusé, avec son geste, ou un worktree
// impossible à préparer, avec sa raison et l'heure du prochain essai — à la place de « prepares it within a minute ».
const repositoryHeld = document.createElement("div");
repositoryHeld.hidden = true;
stationsOfProject.append(lineOfStationsOfProject, openTheMove, openTheTrust, choiceOfMove, formOfTrust, moveSays, stationRefused, repositoryHeld, trustSaid, journeyOfProject);

/** @type {Map<number, { terminal: Terminal, xterm: Xterm, ajuste: FitAddon, cadre: HTMLDivElement }>} */
const views = new Map();
// La page où chaque projet a été laissé : on y revient. Aucune : le rail a le centre.
/** @type {Map<string, string>} */
const leaves = new Map();
// L'onglet que chaque projet montre sous ses pages, Rail ou Stations (ticket 1184) : le dernier que le chef y a ouvert, retenu
// d'une ouverture de l'app à l'autre dans le stockage de la vue. Un projet jamais ouvert s'ouvre sur Rail.
const KEY_OF_TABS = "brigade.onglets-des-projets";
/** @type {Map<string, string> | undefined} */
let tabsHeld;
function retainedOnes() {
  if (tabsHeld !== undefined) return tabsHeld;
  tabsHeld = new Map();
  try {
    const readOnes = JSON.parse(window.localStorage?.getItem(KEY_OF_TABS) ?? "{}");
    for (const [name, id] of Object.entries(readOnes ?? {})) if ([RAIL, STATIONS, AGENTS, KNOW_HOW, CONVERSATION].includes(id)) tabsHeld.set(name, id);
  } catch {
    // Illisible : chaque projet s'ouvre sur Rail, et le prochain choix le réécrit.
  }
  return tabsHeld;
}
// La conversation n'est un onglet que sur un écran étroit : retenue, elle s'ouvre sur Rail sur un écran large.
/** @param {Project} project */
const tabOf = (project) => {
  const retained = retainedOnes().get(project.nom) ?? RAIL;
  return retained === CONVERSATION && !narrow() ? RAIL : retained;
};
/** @param {string} name @param {string} id */
function retain(name, id) {
  retainedOnes().set(name, id);
  try {
    window.localStorage?.setItem(KEY_OF_TABS, JSON.stringify(Object.fromEntries(retainedOnes())));
  } catch {
    // Sans stockage, l'onglet se retient le temps de la session.
  }
}
// Le shell que chaque projet montre à droite, à la place du second. Aucun : c'est le second.
/** @type {Map<string, number>} */
const aRight = new Map();
// Les machines que « + shell » propose, tant que le chef n'a pas choisi — pour le projet où il a cliqué.
/** @type {{ projet: string, machines: { id: string, titre: string }[] } | undefined} */
let choiceOfMachine;
// Les shells fermés : ce qu'ils écrivent encore en mourant n'a plus d'onglet.
/** @type {Set<number>} */
const closed = new Set();
// Aucun : c'est « Tous les projets » qui est affiché — ou l'écran d'ajout.
/** @type {Project | undefined} */
let current;

// Les explications des mots de la cuisine (ticket 3308, explications/) : la première fois que le chef rencontre rail, pass,
// cook, second, TODO ou WAITING, une ligne l'explique à côté du mot. Ce qu'il en a vu est gardé par le runtime du projet,
// pour lui, sur tous ses appareils ; lu à chaque ouverture du projet. Ce qui change à l'écran se repose.
const explanations = holdTheExplanations({ service: serviceOfExplanations(brigade), rendre: (project) => renderTheExplanations(project) });
/** @param {string} project */
function renderTheExplanations(project) {
  if (current?.nom !== project) return;
  setRail(current);
  setTheExplanationOfSecond();
  setTheExplanationsOfChef(project);
}
// Sous l'onglet du second, l'explication du mot « second », quand sa colonne est à l'écran, dépliée.
function setTheExplanationOfSecond() {
  const explained = current !== undefined && current.refus === undefined && !columnSecond.hidden && !columnSecond.hasAttribute("data-replie") && phoneSeen === undefined ? explanationOf(current.nom, "second") : [];
  explanationSecond.hidden = explained.length === 0;
  explanationSecond.replaceChildren(...explained);
}
// L'explication d'un mot à l'écran, si elle s'y montre : marquée vue à ce moment-là.
/** @param {string} project @param {import("./explanations/explanations-box.ts").WordExplained} word @returns {HTMLElement[]} */
function explanationOf(project, word) {
  return explanations.aMontrer(project, word) ? [setExplanation(document, word, () => explanations.ecarter(project, word))] : [];
}
// Celle d'un mot du rail, seulement quand le rail est à l'écran : posé sous Settings ou une page, il n'est pas rencontré.
/** @param {string} project @param {import("./explanations/explanations-box.ts").WordExplained} word @returns {HTMLElement[]} */
function explanationOfRail(project, word) {
  const visible = active();
  return visible === PARAMETERS || TABS.some(({ id }) => id === visible) ? [] : explanationOf(project, word);
}
// Sa rangée de Settings, qui les remontre toutes ; cachée tant que le registre n'est pas lu, et sur un pont qui ne le porte pas.
/** @param {string} project */
function setTheExplanationsOfChef(project) {
  const state = explanations.etat(project);
  explanationsOfChef.hidden = state === undefined || (state.vus === null && state.sans === undefined);
  explanationsOfChef.replaceChildren(...(explanationsOfChef.hidden ? [] : [setTheRowOfExplanations(document, { etat: state, remontrer: () => void explanations.effacer(project) })]));
}
let adds = false;
// La dernière demande de lecture : une par écran affiché, et seules ses lectures s'affichent.
let request = 0;
// L'onglet de contenu dont la commande est lue, et sa demande. Indéfini : à relire.
/** @type {string | undefined} */
let tracking = "";
let requestTab = 0;
// L'onglet que cette demande lit. Celle de la page des coûts lit la box de chaque projet.
/** @type {string | undefined} */
let tabRequest;
// Le dernier `station` lu de chaque projet pour la page des coûts — ou ce qui a été obtenu à sa place.
/** @type {Map<string, Reading>} */
const costsRead = new Map();
// Le rail que sa station publie, par projet sans box ni station ici (ticket 1435, `lireLeRailPublie`), et le rang de sa
// dernière lecture. `sansReponse` : un pont qui ne le lit pas, et l'onglet garde sa phrase d'avant (ticket 1405).
/** @type {Map<string, import("./rail-published.js").StateOfRailPublished & { sansReponse?: true }>} */
const railsPublished = new Map();
/** @type {Map<string, number>} */
const readsPublished = new Map();
// Les onglets de contenu, dits par le process principal au démarrage (tabs.ts).
/** @type {readonly import("../tabs.ts").Tab[]} */
let TABS = [];
// Les couleurs qu'un projet peut prendre, dites de même (colors.ts) : un nom, une valeur.
/** @type {readonly { nom: string, valeur: string }[]} */
let PALETTE = [];
// L'onglet de l'écran principal, Paramètres, et les lectures qu'il range, dits de même.
/** @type {readonly import("../tabs.ts").Heading[]} */
let HEADINGS = [];
// L'onglet qui range ce qui est affiché : une lecture, ou Paramètres lui-même. Le journal n'en a pas.
/** @param {number | string | undefined} id */
const headingOf = (id) => HEADINGS.find(({ lectures: readings }) => readings.includes(/** @type {string} */ (id)));
// Ce qu'engage l'allumage du projet, dit de même (power-up.ts) : la lecture qui le chiffre, et ce qui se pose avant elle.
/** @type {typeof import("../power-up.ts").POWER_UP | undefined} */
let POWER_UP;
// La confirmation ouverte : celle d'un geste, pour un projet, à un endroit — la même ne s'ouvre
// qu'une fois, sous le bouton cliqué. `rendu` : ce qu'elle dit, ou pourquoi le geste ne s'offre
// pas — absent, la demande est en route. `compte` : ce que la box a compté pour « allumer » —
// absent, en cours ; nul, pas demandé. Indéfinie : aucune n'est ouverte, et rien ne part.
/** @type {{ projet: string, cle: string, rendu?: Confirmation | { refus: string }, compte?: Account | null } | undefined} */
let aConfirm;
// Les gestes de la cuisine, dits de même (kitchen.ts) : leurs libellés. Arrêter et reprendre sont la ligne de la
// cuisine, dans Settings ; reprendre est aussi sur ce qui dit la cuisine à l'arrêt.
/** @type {readonly { id: string, libelle: string }[]} */
let KITCHEN_ACTIONS = [];
// Les trois gestes de WAITING, dits de même (wait.ts) : « waiting for… » sur une carte de TODO,
// « resume » et « it arrived » sur une carte de WAITING. La vue les nomme, elle ne sait pas ce qu'ils écrivent.
/** @type {readonly { id: string, libelle: string }[]} */
let ACTIONS_OF_WAIT = [];
// Le formulaire « waiting for… » ouvert sur une carte, par projet et ticket : ce que le chef y a
// rempli, et pourquoi rien n'est parti quand c'est le cas. Le rail se redessine à chaque lecture :
// le formulaire y revient tel que le chef l'a laissé. Absent : la carte porte son bouton.
/** @type {Map<string, { quoi: string, qui: string, relance: string, refus?: string }>} */
const formsOfWait = new Map();
// Ce qu'il est advenu de « it arrived, back to the kitchen » sur une carte de WAITING, par projet et ticket :
// en route, posté sur le tableau de la cuisine — son commentaire au survol —, ou pourquoi rien ne l'est. La carte le
// dit sous ses gestes tant qu'elle est dans WAITING.
/** @type {Map<string, { envoi: true } | { fait: string, detail: string } | { refus: string, detail: string }>} */
const arrivalsOfCards = new Map();
// Le TODO parked du chef (parked/, ticket 4281) : les items dont le contrôle de park est ouvert, et ce que le chef y a tapé,
// par projet et ticket — gardés d'un rendu à l'autre.
/** @type {Map<string, Set<number>>} */
const parkOpen = new Map();
// Ce que le chef a déplié en tête du rail (ticket 4354), par projet : le détail d'une carte d'agent, et la liste du TODO
// (« todo ») — gardés d'un rendu à l'autre.
/** @type {Map<string, Set<string>>} */
const unfoldsOfTop = new Map();
/** @param {string} project */
const unfoldsOf = (project) => unfoldsOfTop.get(project) ?? unfoldsOfTop.set(project, new Set()).get(project) ?? new Set();
/** @type {Map<string, import("./parked/park-control.js").Form>} */
const parkInputs = new Map();
// Les gestes directs, et les confirmés, dits de même (actions.ts) : le clic d'un direct fait partir
// sa commande dans le second — ou dit pourquoi elle ne part pas ; celui d'un confirmé ouvre sa
// confirmation, et rien ne part avant son « oui ». La vue ne le décide pas.
/** @type {readonly string[]} */
let DIRECT = [];
/** @type {readonly string[]} */
let CONFIRMED = [];
// La réponse du chef en route sur une carte de TODO (card-todo.js), par projet et ticket
// (`<projet>#<numéro>`), avec la question à laquelle elle répond. Absente : la carte dit ce que le tableau
// de la cuisine montre de sa dernière réponse. Postée, la carte reste, envoyée et en attente de la cuisine,
// tant que les faits lus portent cette question — nulle sur une carte à un seul geste ; la lecture qui ne la
// porte plus l'oublie. Ce n'est qu'un relais : ce que la carte dit après un redémarrage vient du tableau (ticket 1841).
/** @type {Map<string, { question: string | null, etat: import("./card-todo.js").State }>} */
const answersAtCards = new Map();
// Les cartes « Validate its screen » (validation-design/, ticket 3185) : le geste en route d'ici, et le commentaire tapé,
// par `<projet>#<numéro>` ; et, par projet, les numéros des cartes que le chef a validées ou renvoyées — elles quittent TODO
// tout de suite, et sont oubliées dès qu'une lecture ne les porte plus.
/** @type {Map<string, import("./validation-design/validation-design.js").State>} */
const validations = new Map();
/** @type {Map<string, string>} */
const commentsOfValidation = new Map();
// Les cartes « review before merge » (carte-sensible/, ticket 3224) : la même chose — le geste en route et la note tapée ;
// mergées ou renvoyées d'ici, elles quittent TODO avec les validées (`validees`).
/** @type {Map<string, import("./card-sensitive/card-sensitive.js").State>} */
const reviews = new Map();
/** @type {Map<string, string>} */
const notesOfReview = new Map();
// « undo » sur la carte d'un ticket servi (undo/, ticket 3274) : le geste en route d'ici, ou ce qu'il en est advenu — la
// ligne reste sur la carte tant qu'elle est dans Served.
/** @type {Map<string, import("./undo/undo.js").State>} */
const cancellations = new Map();
/** @type {Map<string, Set<number>>} */
const validated = new Map();
/** @param {string} project */
const validatedOf = (project) => validated.get(project) ?? new Set();
// Le détail en grand d'une carte « Validate its screen » (validation-design/detail-of-validation.js, ticket 3212), ouvert
// d'un clic sur la carte : son projet, son ticket, et ce qu'il montre — côte à côte ou l'une sur l'autre, la capture
// ouverte seule, le zoom de chaque écran —, gardé d'une pose à l'autre.
/** @type {{ projet: string, ticket: number, affichage: import("./validation-design/detail-of-validation.js").Display } | undefined} */
let detailOpen;
// Ce que le chef a tapé dans le champ d'une carte de TODO, par projet et ticket : un rail redessiné le lui rend. Une carte
// partie de TODO ne l'emporte pas (ticket 2151) : un brouillon non vide y reste, sur une carte résolue, jusqu'à ce que le
// chef l'écarte — avec ce que sa carte demandait (`questionsDesBrouillons`).
/** @type {Map<string, string>} */
const draftsOfCards = new Map();
/** @type {Map<string, string | null>} */
const questionsOfDrafts = new Map();
// La carte de TODO où le chef répond (ticket 2151) : tant que le clavier est dans sa carte — son champ, ses choix —, aucune
// lecture ne redessine le rail du projet. La carte n'est ni retirée, ni reposée, ni déplacée, et ce qu'il tape reste sous
// ses doigts. Ce qui arrive entre-temps est tenu (`gele`) et posé quand le clavier quitte la carte ; une carte que la
// lecture ne porte plus le dit à côté de son texte. `bon` : la carte posée ; `carte` : sa partie de TODO.
/** @type {{ projet: string, ticket: number, question: string | null | undefined, bon: HTMLElement, carte: HTMLElement, gele: boolean } | undefined} */
let cardInMain;
// Pourquoi le dernier bouton cliqué n'a rien fait : dit sous les onglets de pages, jusqu'au prochain geste —
// ou, quand c'est le second qui n'a rien reçu, à droite, sous les onglets des terminaux.
let notWritten = "";
let notWrittenSecond = "";
// Un geste confirmé ou direct qui n'a rien envoyé au second : la phrase qui le dit au centre, et de quoi le rejouer
// avec le « oui » déjà donné.
/** @type {{ texte: string, rejouer: () => void } | undefined} */
let actionRate;
// Le terminal qui prend le clavier au prochain affichage : celui qu'un geste du chef vient de
// montrer ou d'écrire. Sans geste, personne ne le prend — le second ne perd pas sa frappe.
/** @type {number | undefined} */
let aFocus;
// La bannière d'arrêt, dite de même (facts.ts) : ce qu'elle dit, et le bouton qui écrit la relance.
/** @type {typeof import("../facts.ts").BANNER | undefined} */
let BANNER;
// Le calibrage que la station accepte, pour le parcours « Add a project » : donné au démarrage.
/** @type {{ modeles: readonly string[], efforts: readonly string[] }} */
let PROJECT_CALIBRATION = { modeles: [], efforts: [] };
// Ce que l'accueil dit en dernier (home.ts) : une ligne par projet, une par station, la santé. Indéfini : pas encore reçu.
/** @type {import("../home.ts").Home | undefined} */
let homeSeen;
// Le téléphone appairé (l'app Android) : sa station, et ce que la dernière lecture de la liste de ses projets en a dit
// (le ticket 1414), relu par `surTelephone`. Indéfini sur le desktop.
/** @type {import("./bridge.d.ts").Phone | undefined} */
let phoneSeen;
// La station dont la page est ouverte, par son gist. Aucune : c'est l'accueil — ou un projet.
/** @type {string | undefined} */
let stationOpen;
// La page de l'app ouverte à la place de l'accueil : celle des coûts de tous les projets (ticket 1022), ou celle de
// leurs résumés hebdomadaires (ticket 3263). Aucune : l'accueil — ou un projet, une station.
/** @type {typeof COSTS | typeof RESUMES | undefined} */
let pageOfTheApp;
// Ce que `faits` a rendu en dernier pour chaque projet, et la demande à laquelle il répond :
// une par barre posée. Sans entrée, le projet n'a pas encore été lu.
/** @type {Map<string, Drawable>} */
const heldOnes = new Map();
// Le dépôt d'un projet où le compte GitHub de cet ordinateur ne peut pas écrire (ticket 3163), d'après sa dernière
// lecture : le projet s'ouvre en lecture seule — tout s'y voit, aucun geste n'y est offert, une ligne en tête le dit.
// L'accès gagné, la lecture suivante ne le porte plus et la vue redevient ordinaire, sans rouvrir le projet.
/** @param {{ nom: string }} project @returns {string | undefined} */
function readOnlyOf(project) {
  const held = heldOnes.get(project.nom);
  return held !== undefined && "tableau" in held ? held.tableau.lectureSeule?.depot : undefined;
}
// L'app n'a pas joint GitHub (board/read.ts, `horsLigne`, ticket 1818) : depuis quand, d'après la première lecture ratée
// de la série. Ce n'est pas une panne : le rail garde sa dernière lecture, atténué, et un seul signe le dit. Il part à la
// première lecture qui joint GitHub.
/** @type {Map<string, string>} */
const outsideLines = new Map();
// Le dernier rail lu, gardé quand les lectures qui l'ont suivi ont raté en ligne (ticket 2151) : depuis quand, d'après la
// première de la série, et la raison de la dernière. Il part à la première lecture qui dessine le rail.
/** @type {Map<string, { depuis: string, raison: string }>} */
const stale = new Map();
// Ce qu'une lecture ratée dit d'elle-même, en une ligne.
/** @param {Drawable} receivedOne */
function reasonOfTheFailure(receivedOne) {
  if ("tableau" in receivedOne) return "";
  const said = "informe" in receivedOne ? receivedOne.informe : receivedOne.erreur;
  return said.trim().split("\n")[0] ?? "";
}
const hourShort = (/** @type {number | string} */ instant) => new Date(instant).toLocaleTimeString("en-US", { hour: "numeric", minute: "2-digit" });
let factsRequest = 0;
// Les projets dont une lecture des faits est partie de la vue — la première, ou une relecture — et n'a pas encore de
// réponse : le haut de leur rail bat doucement, sans phrase, jusqu'à ce que `surFaits` la rende (ticket 1818).
/** @type {Set<string>} */
const inRead = new Set();
// Une lecture des faits demandée au process principal — `relire` : celle de la box, tout de suite ; sinon la première,
// pour une barre posée. Tous les projets sont relus : chacun est en lecture jusqu'à sa réponse.
function readTheFacts(reread = true) {
  for (const { nom: name } of configuration.projets) inRead.add(name);
  if (reread) brigade.relireBox(factsRequest);
  else brigade.faits(++factsRequest);
  if (current !== undefined && !rail.hidden) markRead(current);
}
// Le haut du rail du projet affiché bat tant que sa lecture est en cours : rien d'autre n'est reposé.
/** @param {Project} project */
function markRead(project) {
  if (inRead.has(project.nom) && itselfLit(project) && project.sansStation !== true) rail.dataset.lecture = "";
  else delete rail.dataset.lecture;
}
// Les réglages de chaque projet (ticket 1309) : leur dernière lecture, et l'état de chacun — ce que le chef écrit sans
// l'avoir changé, la proposition qui attend sa réponse, ce que la dernière a rendu. Le plafond, sur Cooks, est le même réglage.
/** @type {Map<string, import("../settings-of-project.ts").ReadOfSettings>} */
const settingsRead = new Map();
/** @type {Map<string, Map<import("../settings-of-project.ts").Key, import("./project/settings.js").State>>} */
const statesOfSettings = new Map();
// La dernière bande d'alertes de chaque projet, telle que le process principal l'a dite (alerts.ts).
/** @type {Map<string, Alert[]>} */
const bands = new Map();
// La ligne du disjoncteur ouvert d'un projet, dans sa dernière bande : celle que `alerts.ts` marque `disjoncteur` (ticket 2140).
/** @param {string} name */
const alertOfBreaker = (name) => (bands.get(name) ?? []).find(({ disjoncteur: breaker }) => breaker === true);
/** @type {Map<string, import("./page-project/repository-not-prepare.js").State>} */
const repositories = new Map();
// Ce que chaque bande dit de son projet sur sa case de la barre (alerts.ts, `signalDe`), et les
// signaux posés : un seul par case.
/** @type {Map<string, {etat: string, dit: string} | undefined>} */
const signals = new Map();
// L'état de l'interrupteur de chaque projet — le manager le suit, et sa ligne le dit —, tel que sa
// dernière bande l'a dit (alerts.ts, `EtatDuManager`) : l'interrupteur, en tête de l'espace, et la
// tête du rail le disent. Sans entrée, il n'est pas encore lu.
/** @type {Map<string, import("../alerts.ts").StateOfManager | undefined>} */
const statesOfManager = new Map();
// Les lignes de la bande dont le « detail » est déplié, par projet et par endroit (`endroitDeLAlerte`) :
// une relecture de la bande ne le replie pas sous les yeux du chef.
/** @type {Set<string>} */
const detailsUnfolded = new Set();
/** @type {Map<string, HTMLElement>} */
const reported = new Map();
// Le projet dont le chef a cliqué la notification d'urgence (notification.ts) : sa ligne d'urgence
// reste marquée choisie tant qu'il reste sur lui. `gesteDeLUrgence` : le bouton de cette ligne, tel
// que la bande l'a posé en dernier — c'est lui qui prend le clavier au clic.
let emergencyChosen = "";
/** @type {HTMLElement | undefined} */
let actionOfTheEmergency;
// Dans la barre, la pastille de chaque projet qui a une box.
/** @type {Map<string, HTMLElement>} */
const pills = new Map();
// Ce que fait chaque cook de chaque projet, tel que la dernière lecture de son tableau le publie (activity-of-cook.js) :
// la fiche d'un ticket en pose son cook.
/** @type {Map<string, import("./activity-of-cook.js").Published>} */
const activitiesPublished = new Map();
// Les cartes de Livré dont le chef a déplié les remarques, par projet et ticket : le rail se
// redessine à chaque lecture, et ce qu'il lit ne se replie pas sous ses yeux.
/** @type {Set<string>} */
const remarksUnfolded = new Set();
// Ce qui est avant le rail, par projet, tel que le process principal l'a rangé (upstream.ts) : la dernière lecture que le
// tableau de la cuisine en donne, pour le projet affiché.
/** @type {Map<string, import("../upstream.ts").Seen>} */
const upstreams = new Map();
// La fiche ouverte par-dessus le rail : son projet, la carte cliquée — telle que la dernière lecture
// la donne —, et son bon, qui reprend le clavier quand elle se ferme. Aucune : le rail est seul.
/** @type {{ projet: Project, carte: import("../facts.ts").Card, retour: HTMLElement } | undefined} */
let openOne;
// La question que pose chaque ticket de T'attend dont la fiche a été ouverte, telle que son issue
// l'écrit (question.ts), par projet et ticket : relue à chaque ouverture. `lue` : absente, la lecture
// est en route. `envoi` : une réponse part — rien d'autre ne part avant qu'elle soit revenue.
// `rendue` : ce qu'il est advenu de la dernière. `quand` : l'heure, au poste, où elle a été posée.
/** @type {Map<string, { lue?: import("../question.ts").Read, envoi?: boolean, rendue?: import("../question.ts").Rendered, quand?: number }>} */
const questions = new Map();
// Une question que la vue sait répondue — postée d'ici, ou répondue sur l'issue — sur une carte que
// le rail remet dans TODO : ce qu'elle en sait date. Relue, mais pas plus d'une fois par minute.
const REREAD_QUESTION_MS = 60_000;
/** @param {{ lue?: import("../question.ts").Read, envoi?: boolean, rendue?: import("../question.ts").Rendered, quand?: number } | undefined} state */
function staleOne(state) {
  if (state === undefined || state.envoi === true || state.quand === undefined) return false;
  const answeredOne = state.rendue?.poste === true || (state.lue !== undefined && "question" in state.lue && state.lue.question.repondue !== undefined);
  return answeredOne && Date.now() - state.quand > REREAD_QUESTION_MS;
}
// Le titre des tickets que la box ne nomme pas, lu par le process principal (question.ts, `titreDe`),
// par `<projet>#<ticket>` : `{ titre }`, ou `{ sans }` quand l'issue n'a pas pu être lue.
/** @type {Map<string, { titre: string } | { sans: string } | undefined>} */
const titles = new Map();
// Les captures des tickets d'interface, lues par le process principal (captures.ts, `lireCapture`), par
// `<projet>#<ticket>:<écran>:<moment>@<commit>` : `{ image }`, en `data:`, ou `{ sans }` quand elle n'a
// pas pu être lue. Présente sans valeur, la lecture est en route.
/** @type {Map<string, import("../captures.ts").Image | undefined>} */
const capturesRead = new Map();
// L'histoire et le coût de chaque ticket dont la fiche a été ouverte (story.ts), par
// `<projet>#<ticket>` : relus à chaque ouverture. Absente de la table, la lecture est en route.
/** @type {Map<string, import("../story.ts").Story>} */
const stories = new Map();
// L'issue de chaque ticket dont la fiche a été ouverte et sa discussion (discussion.ts), par
// `<projet>#<ticket>` : relues à chaque ouverture, et après chaque commentaire. Absente de la
// table, la lecture est en route.
/** @type {Map<string, import("../discussion.ts").Discussion>} */
const discussions = new Map();
// Le diagramme du corps de chaque issue lue, par `<projet>#<ticket>` (vue/card-diagram/, ticket 3773) : rendu une fois par corps.
/** @type {Map<string, import("./card-diagram/card-diagram.js").Held>} */
const diagrams = new Map();
// Le commentaire que le chef écrit sur l'issue, par `<projet>#<ticket>` : une fiche reposée, ou
// un envoi qui échoue, ne le perd pas. Il ne s'efface qu'une fois posté.
/** @type {Map<string, string>} */
const comments = new Map();
// Ce qu'il en est du dernier commentaire envoyé, par `<projet>#<ticket>` : en route, ou ce qui en est advenu.
/** @type {Map<string, { envoi: true } | { rendu: import("../discussion.ts").Commented }>} */
const sendsOfComment = new Map();
// Ce qu'il en est de la dernière demande au second faite depuis le champ de contexte de la fiche, ou
// depuis la carte de TODO (card-todo.js), par `<projet>#<ticket>` : en route, partie (la note du
// terminal), ou ce qui l'a empêchée. La fiche et la carte la disent toutes deux.
/** @type {Map<string, { envoi: true } | { parti: string } | { refus: string }>} */
const requestsAtSecond = new Map();
// Le geste en route (`envoi`) ou refusé (`refus`) d'une carte mise de côté (ticket 3147), par `projet#ticket`.
/** @type {Map<string, { envoi: "relancer" | "clore" } | { refus: string }>} */
const refusalOfCards = new Map();
// Ce que le process principal a lu des essais de chaque projet (trial.ts, ticket 3215) : sa déclaration `.brigade/try.json` et ses essais par ticket.
/** @type {Map<string, import("../trial.ts").SeenOfTrials>} */
const trialsOfProjects = new Map();
/** @param {Project} project */
async function readTheTrials(project) {
  const seenOne = await brigade.essais?.(project.nom);
  if (seenOne === undefined) return;
  trialsOfProjects.set(project.nom, seenOne);
  if (current?.nom === project.nom && !rail.hidden && heldOnes.has(project.nom)) setRail(project);
}
// Les gestes qu'un agent retient pour l'OK du chef, par projet (held/, ticket 4273) : relus à chaque lecture du rail du
// projet affiché. Absents : pas encore lus, ou pas lisibles d'ici — le projet ne cuit pas sur cet ordinateur.
/** @type {Map<string, import("../held/contract.ts").ReadOfHeld | undefined>} */
const heldOfProjects = new Map();
/** @param {Project} project @param {import("../held/contract.ts").ReadOfHeld | undefined} readOnes */
function setTheHeldRead(project, readOnes) {
  heldOfProjects.set(project.nom, readOnes);
  if (current?.nom === project.nom && !rail.hidden && heldOnes.has(project.nom)) setRail(project);
}
/** @param {Project} project */
async function readTheHeld(project) {
  const readOnes = await brigade.gestesRetenus?.(project.nom);
  if (readOnes !== undefined) setTheHeldRead(project, readOnes);
}
// L'OK du chef à un geste retenu : fait, sa carte part et ne revient pas avant la lecture suivante ; refusé, sa carte le dit.
/** @param {Project} project @param {string} id */
async function approveTheActionHeld(project, id) {
  const rendered = await brigade.approuverGeste?.(project.nom, id);
  if (rendered === undefined || "refus" in rendered) throw new Error(rendered?.refus ?? "nothing was approved: the app did not reach this project's station");
  setTheHeldRead(project, withoutTheApproved(heldOfProjects.get(project.nom), id));
}
// Ce que la fiche dit de la vie du ticket vivant (story.ts, `situation`), par `<projet>#<ticket>`.
/** @type {Map<string, import("../story.ts").Situation>} */
const situations = new Map();
// Les gestes de la fiche de chaque ticket ouvert, à cet instant (card-actions.ts), par
// `<projet>#<ticket>` : relus à chaque ouverture, et quand la lecture change ce qui les décide.
// Absents de la table, la lecture est en route ; `{ sans }`, ils n'ont pas pu être lus.
/** @type {Map<string, import("../card-actions.ts").Proposes[] | { sans: string }>} */
const cardsActions = new Map();
// Ce qu'il est advenu du dernier geste de la fiche qui n'est pas parti, par `<projet>#<ticket>` : en une ligne, et ce
// que la station ou le pont en a dit, au survol.
/** @type {Map<string, { dit: string, detail: string }>} */
const cardRefusals = new Map();
// Ce qu'il est advenu du dernier geste de la fiche qui est parti, par `<projet>#<ticket>` (ticket 1164) : en route —
// ses boutons attendent la réponse, et rien ne part deux fois —, fait par la station, sans terminal où le lire — ce
// que le pont du téléphone rend —, ou écrit dans le second, que l'écran étroit ne montre pas à côté de la fiche.
/** @type {Map<string, { envoi: string } | { fait: string, detail: string } | { second: true }>} */
const issuesOfCards = new Map();
// Un geste qui n'est pas parti — le pont a levé, ou ne porte pas l'action (le téléphone, tant que son pont ne la
// prend pas) : une ligne, et pourquoi au survol.
const WITHOUT_SEND = "nothing was sent — nothing was changed";
const WITHOUT_BRIDGE = "this app does not carry this action to the station yet";
// Le geste de la fiche qui coûte et que le chef a cliqué, en attente de sa confirmation, par
// `<projet>#<ticket>` : rien ne part avant son « oui ».
/** @type {Map<string, import("../card-actions.ts").CardId>} */
const cardConfirmations = new Map();
// La priorité que le chef a choisie, pas encore envoyée, par `<projet>#<ticket>` : une fiche
// reposée ne la perd pas.
/** @type {Map<string, string>} */
const prioritiesChosen = new Map();
// La phrase que le chef écrit en réponse, par projet et ticket : une fiche reposée ne la perd pas.
/** @type {Map<string, string>} */
const drafts = new Map();
// « Remove from the app » : le projet dont le retrait attend son « yes », et pourquoi il n'a pas été retiré — chacun
// pour son projet.
let removalOfTheApp = "";
let notRemoved = { projet: "", refus: "" };
// Pourquoi la dernière couleur choisie n'a pas été écrite, et pour quel projet — rien, si elle l'a été.
let colorRefused = { projet: "", refus: "" };
// Pourquoi le dernier sigle écrit ne l'a pas été, et pour quel projet — rien, s'il l'a été.
let acronymRefuses = { projet: "", refus: "" };
// Le dernier refus du réglage de la barre des menus, sous sa ligne.
let menuBarRefused = "";
// Ce qui empêche l'icône de fond de se montrer (main.ts, `iconeDeFond`), relu toutes les minutes ; vide, rien ne la gêne.
let iconOfBackgroundRefused = "";
// Ce que la dernière lecture des clones donne à poser (delay.ts). Indéfini : pas encore lus.
/** @type {SeenOfCode | undefined} */
let codeSeen;
// Pourquoi la dernière mise à jour demandée n'a pas été écrite, ou pas faite : dit sous les clones, jusqu'à la prochaine.
let notUpdated = "";
// L'app se met à jour : son bouton attend qu'elle se relance.
let inPassage = false;
// La mise à jour de l'app installée, telle que la dernière lecture la dit (mise-a-jour/etat.ts). Indéfini : pas encore reçue.
/** @type {import("../update/state.ts").StateOfUpdate | undefined} */
let updateVue;
// Ce que la dernière lecture des stations donne à poser (stations/stations.ts). Indéfini : pas encore lues.
/** @type {import("../stations/stations.ts").SeenOfStations | undefined} */
let stationsViews;
// Les projets des stations (projects/projects.ts). Indéfini : pas encore lus.
/** @type {import("../projects/projects.ts").SeenOfProjects | undefined} */
let projectsSeen;
// Le choix des stations auxquelles confier la cuisine du projet affiché, tant qu'il est ouvert : le
// même que le parcours, pour ce projet-là — une relecture des stations ne perd pas ce qui est coché.
// `choisies` : la seule machine choisie (ticket 3187) ;
// `cooksTouches` : le chef a changé la valeur proposée — elle ne suit plus la machine ni les projets relus.
// `defauts` : ce que cet ordinateur propose pour une station de plus (ticket 1307), lu à l'ouverture ;
// `capacites` : par machine, les capacités cochées — celles qu'on y détecte, tant que le chef n'y a pas touché.
/** @type {{ projet: string, ouvertLe: string, depots: import("../projects/github.ts").RepositoryOfChef[], choisies: Set<string>, touchee: boolean, cooksTouches: boolean, defauts?: import("../projects/projects.ts").DefaultsOfTheMachine, capacites: Map<string, Set<string>> } | undefined} */
let trust;
// Ce que le dernier geste de confiance a rendu, et pour quel projet : dit sous la ligne de ses stations.
// `a` : quand (`Date.now()`). Ce qu'il annonce « within a minute » ne se dit plus passé la minute, ni
// une fois le parcours du projet publié : c'est lui qui dit où il en est (ticket 1111).
let trustSaidFor = { projet: "", dit: "", a: 0 };
// Le parcours prêt d'un projet (ticket 1111) : celui dont la page le montre, et ceux où le chef l'a
// écarté ou déjà vu — il ne revient pas à la visite suivante.
/** @type {string | undefined} */
let readyShows;
/** @type {Set<string>} */
const journeyRanges = new Set();
// Le déménagement dont le choix est ouvert — pour quel projet —, s'il part, et vers quelle station (son gist).
/** @type {{ projet: string, part: boolean, vers?: string } | undefined} */
let move;
// Ce que le dernier déménagement a rendu, et pour quel projet : dit sous la ligne de ses stations —
// refusé, sa raison, et son détail au survol.
let moveSaysFor = { projet: "", dit: "", refus: false, detail: "" };
// La peau du terminal vient des jetons, comme le reste (tokens.css) : ni couleur ni police ne s'écrit ici.
/** @param {string} name */
const token = (name) => getComputedStyle(document.documentElement).getPropertyValue(name).trim();

/**
 * Les flèches et ⌫ modifiées : xterm les envoie en `CSI 1;<mod>` ou en `DEL` nu, que le shell et
 * `claude` écrivent au lieu d'agir. Elles partent comme les lignes de commande les lisent : mot
 * (`ESC b`/`ESC f`), début et fin de ligne (`^A`/`^E`), effacement d'un mot (`ESC DEL`) ou jusqu'au
 * début de ligne (`^U`). Shift seul n'a pas de sélection à étendre : la flèche part nue.
 * @param {{ key: string; shiftKey: boolean; altKey?: boolean; ctrlKey?: boolean; metaKey?: boolean }} touche
 * @returns {string | undefined} ce qui est écrit, ou rien quand la touche reste à xterm
 */
function displace({ key, shiftKey, altKey = false, ctrlKey = false, metaKey = false }) {
  if (key === "Backspace") {
    if (metaKey) return "\x15";
    if (altKey) return "\x1b\x7f";
    return ctrlKey ? "\x17" : undefined;
  }
  const meaning = { ArrowLeft: "D", ArrowRight: "C", ArrowUp: "A", ArrowDown: "B" }[key];
  if (meaning === undefined || !(shiftKey || altKey || ctrlKey || metaKey)) return undefined;
  if (key === "ArrowLeft" || key === "ArrowRight") {
    const left = key === "ArrowLeft";
    if (metaKey) return left ? "\x01" : "\x05";
    if (altKey || ctrlKey) return left ? "\x1bb" : "\x1bf";
  }
  return `\x1b[${meaning}`;
}

// Cet ordinateur, tel que le process principal le dit au démarrage : son nom à l'écran, et s'il est un Mac.
let WORKSTATION = { nom: THIS_COMPUTER, mac: true };

/**
 * Copier et coller dans un terminal, hors d'un Mac. Sur un Mac, Cmd+C et Cmd+V passent par le menu
 * Édition, et Ctrl+C reste au shell. Ailleurs, Ctrl est la touche des deux : comme le Terminal de
 * Windows, Ctrl+Shift+C copie, Ctrl+C copie quand du texte est sélectionné — sans sélection, il
 * interrompt —, et Ctrl+V comme Ctrl+Shift+V collent.
 * @param {{ key: string; shiftKey: boolean; altKey?: boolean; ctrlKey?: boolean; metaKey?: boolean }} touche
 * @param {{ mac: boolean; selection: boolean }} contexte
 * @returns {"copier" | "coller" | undefined} le geste, ou rien quand la touche reste à xterm
 */
function pressedPapers({ key, shiftKey, altKey = false, ctrlKey = false, metaKey = false }, { mac, selection }) {
  if (mac || !ctrlKey || altKey || metaKey) return undefined;
  const letter = key.toLowerCase();
  if (letter === "c" && (shiftKey || selection)) return "copier";
  if (letter === "v") return "coller";
  return undefined;
}

/** @param {number} id */
function vue(id) {
  let heldOne = views.get(id);
  if (heldOne === undefined) {
    const xterm = new Xterm({ fontFamily: token("--police-mono"), fontSize: 13, theme: { background: token("--terminal"), foreground: token("--texte-terminal"), cursor: token("--texte") } });
    const adjusts = new FitAddon();
    const frame = document.createElement("div");
    frame.hidden = true;
    thread.append(frame);
    xterm.loadAddon(adjusts);
    xterm.open(frame);
    xterm.onData((data) => brigade.ecrire(id, data));
    // Shift+Entrée : xterm l'envoie comme Entrée (`\r`) et le shell comme `claude` l'exécutent ou
    // l'envoient. Un retour à la ligne, lui, ne part pas : `ESC` + `\r` pour `claude` (son Alt+Entrée),
    // un saut de ligne cité (`^V` `^J`) pour le shell.
    xterm.attachCustomKeyEventHandler((key) => {
      // Copier : la sélection va au presse-papiers. Coller : la touche est laissée au navigateur, qui
      // colle dans le terminal comme le menu le ferait.
      const gesture = pressedPapers(key, { mac: WORKSTATION.mac, selection: xterm.hasSelection() });
      if (gesture === "copier" && key.type === "keydown" && xterm.hasSelection()) void navigator.clipboard?.writeText(xterm.getSelection());
      if (gesture !== undefined) return false;
      const displacement = displace(key);
      if (displacement !== undefined) {
        if (key.type === "keydown") brigade.ecrire(id, displacement);
        return false;
      }
      if (key.key !== "Enter" || !key.shiftKey) return true;
      if (key.type === "keydown") brigade.ecrire(id, vue(id).terminal.genre === "second" ? "\x1b\r" : "\x16\n");
      return false;
    });
    xterm.onResize(({ cols, rows }) => brigade.redimensionner(id, cols, rows));
    // Le titre que `claude` donne au terminal du second dit s'il tourne ou attend le chef : la mise en place le dit (ticket 3166).
    xterm.onTitleChange((title) => {
      const { terminal } = vue(id);
      if (terminal.genre !== "second") return;
      titlesOfSeconds.set(terminal.projet, title);
      if (current?.nom === terminal.projet) setTheProjectAPrepare();
    });
    /** @type {Terminal} */
    const terminal = { id, projet: "", genre: "shell", titre: "", note: "", arrete: false };
    heldOne = { terminal, xterm, ajuste: adjusts, cadre: frame };
    views.set(id, heldOne);
  }
  return heldOne;
}

const ofCurrent = () => [...views.values()].filter(({ terminal }) => terminal.projet === current?.nom);
const active = () => (current === undefined ? undefined : leaves.get(current.nom));
// La lecture suivie : celle de la page ouverte par-dessus — Settings ne lit rien ; sans page, aucune.
const readEntry = () => {
  const openOne = active();
  return openOne === PARAMETERS ? undefined : openOne;
};
// Settings est ouvert : il ne lit rien, et n'a ni sortie ni heure à poser.
const settingsShown = () => current !== undefined && active() === PARAMETERS;
// L'onglet de la conversation est montré (écran étroit) : le second prend la place du centre. Une page ouverte
// par-dessus — Settings, le journal — le couvre, comme elle couvre Rail.
const conversationShown = () => current !== undefined && active() === undefined && tabOf(current) === CONVERSATION;
const secondOfCurrent = () => ofCurrent().find(({ terminal }) => terminal.genre === "second");
// Le terminal montré à droite : le shell que le chef y a laissé, sinon le second.
const showsARight = () => {
  const shell = current === undefined ? undefined : aRight.get(current.nom);
  return (shell === undefined ? undefined : views.get(shell)) ?? secondOfCurrent();
};

function show() {
  setTheAbsence();
  const visible = active();
  const relays = TABS.find(({ id }) => id === visible);
  const right = showsARight();
  // Le second et les shells, à droite : chaque cadre y est posé une fois, et y reste. Un seul est
  // montré — celui que le chef a choisi ; caché, aucun ne perd ce qu'il avait reçu.
  for (const { terminal, cadre: frame } of views.values()) frame.hidden = terminal.id !== right?.terminal.id;

  const openable = current !== undefined && current.refus === undefined;
  const terminals = ofCurrent().map(({ terminal }) => terminal);
  // En haut, l'onglet de pages, Paramètres. Les terminaux n'en sont pas : ils sont à droite.
  space.textContent = current?.nom ?? "";
  // Rail, Stations, Know-how et Settings, à côté du nom (ticket 1184, 2921, 4241) : celui qui est montré est marqué — aucun quand une page le couvre.
  const opened = current;
  tabsOfProject.hidden = opened === undefined;
  // La station du projet et son état, à côté de l'onglet Stations : c'est là qu'on en ajoute une.
  const station = opened === undefined ? undefined : labelOfStation(opened);
  labelOfTheStation.hidden = station === undefined;
  labelOfTheStation.textContent = station?.dit ?? "";
  labelOfTheStation.title = station?.survol ?? "";
  tabsOfProject.replaceChildren(
    ...(opened === undefined
      ? []
      : [
          ...MENU.map(({ id, titre: title }) => {
            const created = clickable(title, () => chooseTab(id));
            created.role = "tab";
            created.ariaSelected = String(visible === undefined && tabOf(opened) === id);
            return created;
          }),
          ...HEADINGS.map(({ titre: title, id }) => {
            const created = clickable(title, () => activerHeading(id));
            created.role = "tab";
            created.ariaSelected = String(headingOf(visible)?.id === id);
            return created;
          }),
          // Sur un écran étroit, la conversation avec le second est un cinquième onglet, après Settings.
          ...(narrow() && phoneSeen === undefined
            ? [CONVERSATION_TAB].map(({ id, titre: title }) => {
                const created = clickable(title, () => chooseTab(id));
                created.role = "tab";
                created.ariaSelected = String(visible === undefined && tabOf(opened) === id);
                return created;
              })
            : []),
        ]),
  );
  // À droite, au même niveau : le second, ses shells, et de quoi en ouvrir un. Le second a toujours son onglet.
  const second = secondOfCurrent()?.terminal;
  /** @param {string} title @param {number | undefined} id */
  const terminal = (title, id) => {
    const created = clickable(title, () => showARight(id));
    created.role = "tab";
    created.ariaSelected = String(current !== undefined && (id === undefined ? right === undefined || right.terminal.genre === "second" : id === right?.terminal.id));
    return created;
  };
  tabsTerminals.replaceChildren(
    ...(current === undefined
      ? []
      : [
          terminal(second?.titre ?? "Second", undefined),
          ...terminals.filter(({ genre: kind }) => kind !== "second").map(({ titre: title, id }) => terminal(title, id)),
          ...(openable ? [clickable("+ shell", openShell)] : []),
        ]),
  );
  // Le shell montré se ferme pour de bon ; le second, jamais.
  // Le bandeau du shell montré : où l'on est, avec quel compte, dans la couleur du projet.
  const said = right?.terminal.bandeau;
  banner.hidden = said === undefined;
  banner.textContent = said ?? "";
  const tint = current?.couleurs?.onglet ?? current?.couleurs?.accent;
  if (tint === undefined) banner.style.removeProperty("background");
  else banner.style.setProperty("background", tint);
  closeShell.hidden = right === undefined || right.terminal.genre !== "shell";
  closeShell.textContent = closeShell.hidden ? "" : `close ${right?.terminal.titre}`;
  const choice = openable && choiceOfMachine?.projet === current?.nom ? choiceOfMachine : undefined;
  listMachines.hidden = choice === undefined;
  listMachines.replaceChildren(
    ...(choice === undefined
      ? []
      : [block("span", "open a shell on"), ...choice.machines.map(({ id, titre: title }) => button(title, () => void openOn(choice.projet, id))), button(CANCEL, () => void ((choiceOfMachine = undefined), show()), "discret")]),
  );

  // L'explication d'un onglet relayé n'est pas écrite à plat : une icône d'aide la porte.
  // Settings n'en a pas : il n'a que des réglages.
  const tracked = settingsShown() ? undefined : TABS.find(({ id }) => id === readEntry());
  const explanation =
    tracked === undefined || current === undefined
      ? ""
      : `the output of ${gesture(current, tracked.commande)}, as the station returns it${tracked.precision === undefined ? "" : ` (${tracked.precision})`} — re-read on its own every thirty seconds, while this tab is shown`;
  note.replaceChildren(
    ...(actionRate !== undefined
      ? setActionRate(actionRate)
      : notWritten !== "" ? [notWritten] : explanation === "" ? [] : [hover(document, explanation)]),
  );
  note.hidden = (note.childElementCount === 0 && note.textContent === "") || conversationShown();
  // Une page se pose par-dessus le rail : il reste dessous, tel quel, et rien de lui ne se clique au travers.
  content.hidden = relays === undefined && visible !== PARAMETERS;
  rail.inert = !content.hidden || !card.hidden;
  // Settings est une seule page, sans sous-pages (ticket 1700) : son seul groupe, celui du projet, et rien d'autre.
  state.hidden = current === undefined || visible !== PARAMETERS;
  // Les plafonds, le closer et les lignes de tous les projets, leur section de Settings (ticket 3014) : posés tant qu'il
  // est ouvert, vidés sinon.
  if (current !== undefined && settingsShown()) setTheBannerOfHealth(current);
  else bannerHealth.replaceChildren();
  readTab.hidden = relays === undefined;
  // Au centre, seul un fichier des projets illisible a sa raison à la place de l'espace.
  message.hidden = current !== undefined;
  setSecond(openable, right?.terminal);
  setTheGroups();
  draw();
  readTheTab();
  right?.ajuste.fit();
  const focuses = aFocus === undefined ? undefined : views.get(aFocus);
  aFocus = undefined;
  if (focuses !== undefined && !focuses.cadre.hidden) focuses.xterm.focus();
}

// La colonne des terminaux : ses onglets, sa note — ce qu'un geste a écrit dans le terminal
// montré, ou pourquoi rien ne l'a été —, et ce terminal. Un projet qui ne s'ouvre pas n'a pas de
// second : la colonne dit pourquoi, à sa place — sa box, elle, se lit au centre et dans le panneau.
/** @param {boolean} openable @param {Terminal | undefined} shows */
function setSecond(openable, shows) {
  // Sur un écran étroit, la colonne n'est montrée que par son onglet, à la place du centre (ticket 1186) : cachée, elle
  // garde ses terminaux et ce qu'ils avaient reçu.
  const conversation = conversationShown();
  columnSecond.hidden = current === undefined || (narrow() && !conversation);
  // Sur un écran étroit, la colonne est un onglet : ni bord à tirer, ni bouton qui la replie.
  panelOfSecond.poser(current?.nom, !narrow());
  center.hidden = conversation;
  principal.toggleAttribute("data-conversation", conversation);
  // Le téléphone n'a ni terminal ni shell ni second.
  headOfSecond.hidden = phoneSeen !== undefined;
  // Sous son onglet, l'explication du mot « second » (ticket 3308).
  setTheExplanationOfSecond();
  const note =
    current !== undefined && current.refus !== undefined
      ? `“${current.nom}” does not open: ${current.refus} — it has no second`
      : notWrittenSecond !== ""
        ? notWrittenSecond
        : (shows?.note ?? (openable ? "the second is opening…" : ""));
  // Ce que le runtime dit d'un second qui ne part pas nomme ses outils entre accents graves : posés en code (ticket 1435).
  if (shows?.empeche !== undefined && note === shows.note) noteSecond.replaceChildren(sentence(document, "span", note));
  // Un second que la fenêtre rechargée n'a pas pu rattacher (ticket 3159) : sa ligne, et de quoi le reprendre — comme une
  // touche dans un second arrêté, il est relancé sur son fil (terminals.ts).
  else if (shows?.aReprendre === true && note === shows.note) noteSecond.replaceChildren(note, " ", button("resume", () => brigade.ecrire(shows.id, "")));
  else noteSecond.textContent = note;
  // Un second qui ne part pas n'a pas de terminal à montrer : à sa place, pourquoi, et ce qui lui manque (ticket 1435).
  thread.hidden = !openable || phoneSeen !== undefined || shows?.empeche !== undefined;
  // Le second ne part pas, ou part sans tous ses outils (ticket 1435) : sous sa note, chaque outil qui manque, et ce
  // qui l'obtient — et, s'il ne part pas, de quoi réessayer. Sur un projet qui ne s'ouvre pas, il n'y a pas de second.
  const said = !openable || phoneSeen !== undefined ? undefined : (shows?.empeche ?? shows?.manque);
  toolsOfSecond.hidden = said === undefined;
  toolsOfSecond.replaceChildren(
    ...(said === undefined || shows === undefined
      ? []
      : [
          setToolsOfSecond(document, said, {
            bloque: shows.empeche !== undefined,
            // Comme une touche dans un second arrêté : il est relancé, et ses outils revérifiés (terminals.ts).
            reessayer: () => void retryTheSecond(shows.id),
            ouvrirLaPage: (url) => void brigade.ouvrirLaPage?.(url),
          }),
        ]),
  );
}

// « Try again » d'un second empêché : les outils relus d'abord (ticket 4059) — la lecture rattache au PATH de l'app un
// outil que son installeur vient de poser hors de lui —, puis le second relancé, qui les revérifie : installé, il part
// sans que l'app redémarre. Une lecture qui échoue ne retient rien : le plan du second dit lui-même ce qui manque.
/** @param {number} id */
async function retryTheSecond(id) {
  try {
    await brigade.outilsManquants?.();
  } catch {
    // Rien à dire ici : le second relancé dit ce qui lui manque.
  }
  brigade.ecrire(id, "");
}

// Un terminal qu'un geste a rendu se montre à droite, et prend le clavier : un shell, à côté du
// second ; le second, si un shell le cachait. Le centre ne change pas : rien n'y est masqué ni remplacé.
/** @param {string} project @param {Terminal} terminal */
function keep(project, terminal) {
  receive(terminal);
  if (terminal.genre === "second") aRight.delete(project);
  else aRight.set(project, terminal.id);
  if (project === current?.nom) aFocus = terminal.id;
}

// Une ligne courte, et son explication au survol : ce qui s'écrivait en mode d'emploi.
/** @param {string} balise @param {string} line @param {string} help */
function saysAndHelp(balise, line, help) {
  const created = block(balise, line);
  created.append(hover(document, help));
  return created;
}

// Un bouton de geste : celui de la famille unique (components/button, ticket 2916) — secondaire, sauf sorte dite.
/** @param {string} text @param {(() => void) | undefined} gesture @param {import("./components/button/button.js").Kind} [kind] */
function button(text, gesture, kind = "secondaire") {
  return buttonOfTheFamily(document, text, gesture, { sorte: kind });
}

// Ce qui se clique sans être un geste, et n'a pas la forme d'un bouton : un onglet, une case de la barre, une pastille
// de couleur, un interrupteur, un numéro qui ouvre son issue. Chacun a la sienne ; aucun n'est un bouton de la famille.
/** @param {string} text @param {() => void} gesture */
function clickable(text, gesture) {
  const created = document.createElement("button");
  created.textContent = text;
  created.addEventListener("click", gesture);
  return created;
}

// Un bouton qui porte sa commande : elle se lit telle qu'elle sera écrite, au caractère près.
/** @param {string} text @param {() => void} gesture */
function buttonOfCommand(text, gesture) {
  const created = button(text, gesture);
  created.className = "mono";
  return created;
}

// Le logo de brigade (docs/logo/brigade-icone.svg), la queue : la page ne charge aucune image, il est dessiné ici.
function logoOfBrigade() {
  const ns = "http://www.w3.org/2000/svg";
  const svg = document.createElementNS(ns, "svg");
  svg.setAttribute("viewBox", "2 18 60 28");
  svg.setAttribute("aria-hidden", "true");
  for (const [balise, attributs] of /** @type {[string, Record<string, string>][]} */ ([
    ["rect", { x: "2.5", y: "22", width: "14", height: "20", rx: "7", opacity: ".4" }],
    ["rect", { x: "19.5", y: "22", width: "14", height: "20", rx: "7", opacity: ".7" }],
    ["path", { d: "M43.5 22h4a14 10 0 0 1 0 20h-4a7 7 0 0 1-7-7v-6a7 7 0 0 1 7-7z" }],
  ])) {
    const shape = document.createElementNS(ns, balise);
    for (const [name, value] of Object.entries(attributs)) shape.setAttribute(name, value);
    svg.append(shape);
  }
  return svg;
}

// Une entrée de la barre : deux caractères, et ce qu'ils désignent dit en entier
// au survol et à qui ne voit pas l'écran.
/** @param {string} sign @param {string} name @param {() => void} gesture */
function icon(sign, name, gesture) {
  const created = clickable(sign, gesture);
  created.title = name;
  created.ariaLabel = name;
  return created;
}

// Une carte de T'attend n'agit pas non plus : elle écrit une demande en prose dans le second, à
// droite, et rien ne l'envoie — c'est le second qui lit l'issue, explique et répond (request.ts).
// Le rail reste où il est, et la page ouverte par-dessus aussi.
/** @param {number} ticket */
async function ask(ticket) {
  const project = current;
  if (project === undefined) return;
  notWritten = notWrittenSecond = "";
  actionRate = undefined;
  if (project.refus !== undefined) return show();
  try {
    const rendered = await brigade.demander(project.nom, ticket);
    if (rendered === undefined) notWrittenSecond = `nothing written: the last reading of the station no longer names #${ticket}`;
    else if ("refus" in rendered) notWrittenSecond = rendered.refus;
    else keep(project.nom, rendered);
  } catch (error) {
    notWrittenSecond = `nothing written: ${error instanceof Error ? error.message : String(error)}`;
  }
  show();
}

// Une ligne de la bande d'alertes dont le geste demande du jugement : une demande en prose
// s'écrit dans le second, à droite, et rien ne l'envoie — le second lit, explique, et c'est ton
// Entrée qui la fait partir (request.ts). La vue nomme la ligne ; la phrase vient de ce que la
// bande en dit, dans le process principal. Le centre ne change pas.
/** @param {Alert} alerte */
async function askAlert({ sujet: subject, dit: said }) {
  const project = current;
  if (project === undefined) return;
  notWritten = notWrittenSecond = "";
  actionRate = undefined;
  if (project.refus !== undefined) return show();
  try {
    const rendered = await brigade.demanderAlerte(project.nom, subject, said);
    if (rendered === undefined) notWrittenSecond = `nothing written: the band no longer says “${said}”`;
    else if ("refus" in rendered) notWrittenSecond = rendered.refus;
    else keep(project.nom, rendered);
  } catch (error) {
    notWrittenSecond = `nothing written: ${error instanceof Error ? error.message : String(error)}`;
  }
  show();
}

// Un geste du socle, collé à l'état qu'il change : son bouton, et — confirmé et ouvert — sa
// confirmation, dessous. Direct, il part au clic. Confirmé, le clic ouvre ce qu'il coûte, et rien
// ne part ; recliqué, la confirmation se referme. `ou` : l'endroit où il est posé — la même
// confirmation ne s'ouvre que sous le bouton cliqué.
/** @param {Project} project @param {{ id: string, libelle: string, ou: string }} geste */
function setAction(project, { id, libelle: wording, ou: or }) {
  if (!CONFIRMED.includes(id)) {
    const direct = button(wording, () => void writeAction(id));
    direct.dataset.geste = "direct";
    direct.title = "goes straight into the second, if it is free — its output is read there";
    return [direct];
  }
  const key = JSON.stringify([id, "", or]);
  const openOne = aConfirm?.projet === project.nom && aConfirm.cle === key ? aConfirm : undefined;
  const confirms = button(`${wording}…`, () => void openConfirmation(project, key, id));
  confirms.dataset.geste = "confirme";
  confirms.ariaExpanded = String(openOne !== undefined);
  confirms.title = "says what it costs first: nothing goes before your “yes”";
  return openOne === undefined ? [confirms] : [confirms, setConfirmation(project, openOne)];
}

// Le clic d'un geste confirmé : sa confirmation s'ouvre — ce qu'elle dit vient du process
// principal (confirmation.ts) —, et celle qui était ouverte se referme. Rien ne part. Recliqué,
// il la referme. « Allumer » se chiffre aussi : `manager backlog` est demandée à la box, et ses
// nombres rejoignent la confirmation quand elle répond — le « oui » ne les attend pas.
/** @param {Project} project @param {string} key @param {string} id */
async function openConfirmation(project, key, id) {
  notWritten = notWrittenSecond = "";
  actionRate = undefined;
  if (aConfirm?.projet === project.nom && aConfirm.cle === key) {
    aConfirm = undefined;
    return show();
  }
  const openOne = { projet: project.nom, cle: key };
  aConfirm = openOne;
  show();
  /** @type {Confirmation | { refus: string } | undefined} */
  let rendered;
  try {
    rendered = await brigade.confirmer(project.nom, id);
  } catch (error) {
    rendered = { refus: `nothing offered: ${error instanceof Error ? error.message : String(error)}` };
  }
  // Refermée, ou une autre ouverte entre-temps : ce qu'elle dit n'a plus où se poser.
  if (aConfirm !== openOne) return;
  aConfirm = { ...openOne, rendu: rendered ?? { refus: "nothing offered: this action is not confirmed" } };
  show();
  if (rendered === undefined || "refus" in rendered || rendered.chiffrer !== true) return;
  const account = await brigade.compter(project.nom).catch(() => undefined);
  if (aConfirm?.projet !== project.nom || aConfirm.cle !== key) return;
  aConfirm = { ...aConfirm, compte: account ?? null };
  show();
}

// Ce que coûte un geste confirmé, sous son bouton : ce qu'il fait, son prix en clair, les cooks
// en vol et ce qu'ils ont dépensé, d'où c'est tiré — puis un bouton par « oui », chacun avec ce
// qu'il engage, et le « non ». Un « oui » fait partir son geste, dans le second ; « non » referme.
// Rien n'y est calculé : tout est dit par le process principal (confirmation.ts, power-up.ts) — ou,
// pour une demande au second, par la ligne de la bande qui la porte. `partir` : ce que fait un « oui »,
// quand ce n'est pas un geste du socle.
/** @param {Project} project @param {NonNullable<typeof aConfirm>} ouverte @param {(id: string) => void} [leave] */
function setConfirmation(project, { rendu: rendered, compte: account }, leave) {
  const close = () => {
    aConfirm = undefined;
    show();
  };
  if (rendered === undefined || "refus" in rendered) {
    const wait = document.createElement("section");
    wait.className = "confirmation";
    if (rendered === undefined) wait.append(lineEmpty(document, "what it costs: reading…"));
    else wait.append(lineError(document, rendered.refus, "", { classe: "refus" }), button("close", close, "discret"));
    return wait;
  }
  // Chiffré (« allumer »), le prix est la phrase des nombres — ce qu'il va juger — et ce que le geste
  // engage passe au survol (ticket 906). Sinon, il se dit en une ligne ; le reste, et d'où c'est tiré, au survol.
  let sentence;
  let help;
  if (rendered.chiffrer === true && POWER_UP !== undefined) {
    sentence = account === undefined ? POWER_UP.enCours : account === null ? POWER_UP.parti : "sans" in account ? "the count could not be read" : account.dit;
    const readOne = account === undefined || account === null ? "" : `according to ${gesture(project, POWER_UP.commande)}, run for you on opening — read at ${hourOf(account.a)}`;
    const reason = account === undefined || account === null || !("sans" in account) ? "" : [account.sans, account.obtenu].filter((text) => text !== "").join("\n");
    help = [...rendered.prix, readOne, reason].filter((text) => text !== "").join("\n");
  } else {
    const [price = "", ...suite] = rendered.prix;
    const source = rendered.lu === undefined ? [] : [`according to ${gesture(project, "facts")}, read at ${hourOf(rendered.lu)}`];
    sentence = price;
    help = [...suite, ...source].join("\n");
  }
  // Chiffrée, la confirmation n'écrit que sa phrase de prix : ce que chaque réponse engage passe au
  // survol de son bouton, pas à côté de lui (ticket 906).
  return confirmationOfAction(
    document,
    {
      titre: `⚠️ ${rendered.titre}`,
      phrase: sentence,
      aide: help,
      non: rendered.renoncer,
      aCote: rendered.chiffrer !== true,
      choix: rendered.choix.map(({ id, libelle: wording, dit: said }) => ({
        libelle: wording,
        dit: said,
        partir: () => {
          aConfirm = undefined;
          if (leave === undefined) void writeAction(id, true);
          else leave(id);
        },
      })),
    },
    { non: close },
  );
}

// Un geste part dans le second, à droite : sa sortie s'y lit, sa note dit ce qui est parti, et le
// centre ne change pas. Le second n'est pas libre : rien n'y est écrit, et la raison se lit sous
// son titre — occupé, la commande n'est pas partie. `oui` : le « oui » d'une confirmation — un geste
// confirmé ne part qu'avec lui.
/** @param {string} id @param {true} [yes] */
async function writeAction(id, yes) {
  const project = current;
  if (project === undefined) return;
  notWritten = notWrittenSecond = "";
  actionRate = undefined;
  /** @param {string} reason */
  const rate = (reason) => {
    notWrittenSecond = reason;
    actionRate = { texte: reason, rejouer: () => void writeAction(id, yes) };
  };
  try {
    const rendered = await brigade.geste(project.nom, id, yes);
    if (rendered === undefined) return show();
    // Le chef a pu changer d'espace entre-temps : le second de ce projet le garde.
    if ("refus" in rendered) rate(rendered.refus);
    else {
      keep(project.nom, rendered);
      if (rendered.nonParti === true) rate(rendered.note);
    }
  } catch (error) {
    rate(`nothing sent: ${error instanceof Error ? error.message : String(error)}`);
  }
  show();
}

// Un geste confirmé qui n'a rien envoyé ne se perd pas dans la petite note du second : le centre le dit en une
// phrase, le détail au survol, et un bouton rejoue le même geste.
/** @param {{ texte: string, rejouer: () => void }} rate */
function setActionRate({ texte: text, rejouer: replay }) {
  const head = (text.split(/ — |: |\n|`/)[0] ?? text).trim();
  const sentence = document.createElement("span");
  sentence.textContent = `nothing was sent to the second: ${head}`;
  sentence.title = text;
  const still = button(RETRY, replay);
  still.dataset.reessayer = "";
  return [sentence, still];
}

// La page cliquée s'ouvre par-dessus le rail ; recliquée, elle se referme, et le rail revient tel qu'il était.
/** @param {string} id */
function activer(id) {
  notWritten = "";
  if (current === undefined) return show();
  if (leaves.get(current.nom) === id) leaves.delete(current.nom);
  else leaves.set(current.nom, id);
  show();
}

// À droite, l'onglet d'un shell le montre à la place du second ; celui du second le rend. Ni l'un
// ni l'autre ne se ferme : caché, un terminal garde ce qu'il avait reçu. Celui montré prend le clavier.
/** @param {number | undefined} id */
function showARight(id) {
  if (current === undefined) return show();
  if (id === undefined) aRight.delete(current.nom);
  else aRight.set(current.nom, id);
  aFocus = id ?? secondOfCurrent()?.terminal.id;
  show();
}

// Rail ou Stations (ticket 1184) : l'onglet choisi est montré, et retenu pour ce projet. Une page ouverte par-dessus se
// referme, la fiche aussi ; le second, à droite, ne bouge pas.
/** @param {string} id */
function chooseTab(id) {
  if (current === undefined) return;
  retain(current.nom, id);
  if (id === STATIONS) recordedAReread = true;
  if (id === AGENTS) agentsOfProject.lire(current.nom);
  // Know-how relit ses entrées à chaque ouverture (ticket 4241).
  if (id === KNOW_HOW) rereadTheKnowHow(current.nom, restTheKnowHow(current.nom));
  leaves.delete(current.nom);
  notWritten = "";
  if (openOne !== undefined) closeCard();
  show();
}

// L'onglet Know-how se repose quand ses entrées arrivent ou qu'un geste a répondu, s'il est encore celui du projet montré.
/** @param {string} name */
const restTheKnowHow = (name) => () => {
  if (current?.nom === name && tabOf(current) === KNOW_HOW) setRail(current);
};

// Settings s'ouvre par-dessus le rail. Recliqué, il se referme.
/** @param {string} id */
function activerHeading(id) {
  const heading = HEADINGS.find((candidate) => candidate.id === id);
  if (heading === undefined) return;
  notWritten = "";
  if (current === undefined) return show();
  if (headingOf(leaves.get(current.nom))?.id === id) leaves.delete(current.nom);
  else leaves.set(current.nom, heading.defaut);
  show();
}

// Seul l'onglet de contenu affiché est lu sur la box : en changer, passer à un
// terminal ou quitter l'espace arrête sa lecture. Rien ne reste de l'onglet d'avant.
// La page des coûts de l'app tient lieu d'onglet, l'espace fermé : elle lit la box de chaque projet.
function readTheTab() {
  const relays = TABS.find(({ id }) => id === readEntry());
  const page = current === undefined && !adds ? pageOfTheApp : undefined;
  const wanted = page !== undefined ? JSON.stringify(["", page]) : current === undefined || relays === undefined ? "" : JSON.stringify([current.nom, relays.id]);
  if (wanted === tracking) return;
  tracking = wanted;
  if (current !== undefined && relays !== undefined && !settingsShown()) wait(current, readTab, tabReading);
  tabRequest = page ?? relays?.id;
  brigade.onglet(current?.nom, tabRequest, ++requestTab);
}

/** @param {Terminal} terminal */
function receive(terminal) {
  vue(terminal.id).terminal = terminal;
  // Un second qui ne part pas, ou repart : la mise en place le dit (ticket 3166).
  if (terminal.genre === "second" && current?.nom === terminal.projet) setTheProjectAPrepare();
}

// « + shell » demande où ouvrir : ce poste, la box, ou une station du projet. Là où il n'y a que ce
// poste, rien n'est à choisir : le shell s'y ouvre. Recliqué, le choix se referme.
async function openShell() {
  const project = current;
  if (project === undefined) return;
  if (choiceOfMachine?.projet === project.nom) {
    choiceOfMachine = undefined;
    return show();
  }
  const machines = await brigade.machines(project.nom);
  if (machines.length === 1 && machines[0] !== undefined) return openOn(project.nom, machines[0].id);
  choiceOfMachine = { projet: project.nom, machines };
  show();
}

// Le shell s'ouvre sur la machine choisie, dans une session qui lui survivra.
/** @param {string} project @param {string} machine */
async function openOn(project, machine) {
  choiceOfMachine = undefined;
  notWrittenSecond = "";
  const rendered = await brigade.shell(project, machine);
  if ("refus" in rendered) notWrittenSecond = rendered.refus;
  // Le chef a pu changer d'espace pendant que le shell s'ouvrait : il attend dans le sien.
  else keep(project, rendered);
  show();
}

// Fermer le shell montré : son onglet s'en va, et sa session avec — ou la note dit pourquoi elle reste.
closeShell.addEventListener("click", async () => {
  const shows = showsARight()?.terminal;
  if (shows === undefined || shows.genre !== "shell") return;
  notWrittenSecond = "";
  const rendered = await brigade.fermerShell(shows.id);
  if ("refus" in rendered) notWrittenSecond = rendered.refus;
  show();
});

// Échap referme le choix de la machine, sans rien ouvrir.
listMachines.addEventListener("keydown", (event) => {
  if (event.key !== "Escape") return;
  choiceOfMachine = undefined;
  show();
});

/** @param {string} balise @param {string} text */
function block(balise, text) {
  const created = document.createElement(balise);
  created.textContent = text;
  return created;
}

// Ce qui se recopie tel quel — un numéro de ticket, un identifiant de run, un port : en monospace,
// et c'est une information, pas un style. Rien d'autre ne l'est que ce que la box a rendu.
/** @param {string} balise @param {string} text */
function exact(balise, text) {
  const created = block(balise, text);
  created.className = "mono";
  return created;
}

// Ce que l'app dit elle-même, sur plusieurs lignes : ses mots, dans la police de l'interface et
// sans cadre — le cadre et le monospace d'un `pre` restent à ce que la box a rendu.
/** @param {string} text */
function propos(text) {
  const created = block("pre", text);
  created.className = "propos";
  return created;
}

// Le geste que l'app nomme quand une box jointe ne lui répond pas comme elle
// l'attend. Elle ne sait pas pourquoi : ce qu'elle a obtenu est affiché au-dessus.
// Ce qui se dit, au survol, d'une lecture de GitHub qui n'a pas rendu la file sur le téléphone.
const AT_PHONE = "GitHub was reached, and did not give this project's queue as the app expects. This phone tries again every 30 s.";
const ACTION = [
  "The station was reached, and this command did not answer there as the app expects: from here, this project can no longer be controlled.",
  "What the app got is above; it knows no more.",
  "",
  "The step that brings a runtime up to date, on its station:",
  "  sudo git -C <brigade clone> pull",
  "  sudo systemctl restart brigade@<project>",
  "(docs/runtime/exploitation.md, “Piloter”, line “Mettre à jour”)",
].join("\n");

// Ce que l'app dit quand le geste de la box a refusé le projet : le nom qu'elle
// lui a donné, et d'où il vient. Le refus lui-même est au-dessus, mot pour mot.
/** @param {string} name */
const unknown = (name) =>
  [
    "The station was reached, and its step does not know this project: what it said about it is above.",
    `The app gave it “${name}” — the “nom” of the project in ${configuration.chemin}. The station must serve it under this name.`,
    "If it was uninstalled from this station, this is expected: it can no longer be controlled there. “Remove this project”, in its space's panel, removes it from the app.",
  ].join("\n");

// Ce que l'app dit quand le geste a refusé celui qui le lance. Elle nomme où
// est écrit le geste qui donne ce droit, et ne le rejoue pas : il se joue sur la box.
const WITHOUT_RIGHT = [
  "The station was reached, and its step refused your account: what it said about it is above.",
  "This is neither a failure nor a runtime to update: it is a right this account lacks.",
  "",
  "It is given on the station, by someone who has `sudo` there — the app does not do it for you:",
  "(docs/installer.md, “Ajouter un humain”)",
].join("\n");

// Ce que l'app dit quand le code de la box est celui d'une commande absente.
// Elle ne sait pas laquelle : c'est la box qui la nomme, au-dessus.
/** @param {Project} project */
const commandMissing = (project) => [
  "The station was reached, and a command is missing there: what it said about it is above. The app does not know which.",
  "If it names `brigade`, the step is not installed there; if it names `sudo`, the step lacks it to run under the service account.",
  "",
  "Both are installed on the station, when preparing it:",
  "(docs/installer.md, section 3, “Préparer”)",
  "",
  `The app plays this step for you: there is nothing to type on your workstation.`,
].join("\n");

// Ce que l'app dit quand le geste a refusé le `node` de la box (code 70).
const NODE_INAPTE = [
  "The station was reached, and its step refused to start the runtime: the station's `node` does not suit it. What it said about it is above.",
  "",
  "It is not the runtime that needs updating: the step's sentence says the remedy, and it is applied on the station:",
  "(docs/installer.md, section 3, “Préparer”)",
].join("\n");

// Ce que l'app dit quand `status` a répondu sans le bord qu'elle sait prendre.
// Elle ne sait pas si quelque chose attend : elle ne dit donc pas que rien n'attend.
/** @param {Project} project */
const withoutEdge = (project) => [
  `Nothing could be set apart: the output of ${gesture(project, "status")} lacks the block the app can take — a single line starting with \`attend\`, a single \`fin attend\` line.`,
  "This is not “nothing awaits you”: what awaits you, if anything, is in the output below, in full.",
].join("\n");

// Ce qui attend le chef, en tête et à part : le bloc de `status`, tel qu'il l'a
// écrit — c'est lui qui dit quand rien n'attend. Sans bloc, l'app dit qu'elle n'a rien pris.
/** @param {Project} project @param {string | undefined} awaiting @param {boolean} [home] */
function aside(project, awaiting, home = false) {
  const created = document.createElement("section");
  created.className = "attend";
  created.dataset.pris = String(awaiting !== undefined);
  if (home) created.append(block("h3", "what awaits you"), awaiting === undefined ? lineError(document, "what awaits you could not be set apart", withoutEdge(project)) : block("pre", awaiting));
  else created.append(block("h3", `what awaits you — the \`attend\` block of ${gesture(project, "status")}`), awaiting === undefined ? propos(withoutEdge(project)) : block("pre", awaiting));
  return created;
}

// Une lecture en échec se dit en une ligne, dans les mots de l'app ; ce que la station a
// répondu, et ce que l'app en dit de plus (le code de sortie choisit le renvoi, le texte n'est jamais
// traduit), se lisent au survol. Rien de technique n'est écrit à plat.
/** @param {Project} project @param {import("../box.ts").Failure & { projet: string }} receivedOne @param {string} morePilotable ce qui se dit d'une box jointe dont le code ne dit aucun cas */
function obtainedInOneLine(project, receivedOne, morePilotable) {
  const [line, suite] =
    receivedOne.cas === "projet-inconnu"
      ? ["the station does not know this project", unknown(receivedOne.projet)]
      : receivedOne.cas === "sans-droit"
        ? ["your account lacks the right to this action on the station", WITHOUT_RIGHT]
        : receivedOne.cas === "commande-manque"
          ? ["a command is missing on the station", commandMissing(project)]
          : receivedOne.cas === "node-inapte"
            ? ["the station's node does not suit the runtime", NODE_INAPTE]
            : receivedOne.atteinte
              ? ["the station answered, but not as the app expects", morePilotable]
              : ["the station did not answer", undefined];
  const saidOne = lineError(document, line, suite === undefined ? receivedOne.erreur : `${receivedOne.erreur}\n\n${suite}`);
  // Ce que la station a dit, sans la commande lancée : la panne du signalement, en quelques mots.
  const said = receivedOne.erreur.split("\n").filter((one) => one.trim() !== "" && !one.startsWith("$ ")).join(" ");
  saidOne.append(...report.poser({ projet: project.nom, reference: { ligne: line }, panne: said === "" ? `${project.nom}: ${line}` : `${project.nom}: ${line} — ${said}` }));
  return [saidOne];
}

// Ce qu'une lecture donne à voir, dans le panneau de l'espace, à côté du terminal et dans
// un onglet de contenu : un des sept états, dit en toutes lettres, et dessous ce
// que l'app a obtenu. Celle d'un onglet n'a rien de mis à part : ce n'est pas `status`.
/**
 * @param {Shown | Reading} receivedOne @param {HTMLElement} head @param {HTMLElement} body
 */
function render(receivedOne, head, body) {
  // Le projet a pu quitter le fichier depuis la demande : il n'y a plus rien à lui écrire.
  const project = projectOf(receivedOne.projet);
  if (project === undefined) return;
  const hour = hourOf(receivedOne.a);
  if ("sorties" in receivedOne) {
    const putting = "attend" in receivedOne;
    head.dataset.etat = "pilotable";
    head.textContent = `${putting ? "controllable — " : ""}read at ${hour}`;
    // Ce que la box a dit n'est pas montré : l'état se lit dans la phrase de la tête ; seul le bloc `attend`, mis à part, reste.
    body.replaceChildren(...(putting ? [aside(project, receivedOne.attend, true)] : []));
  } else if (receivedOne.cas === "projet-inconnu") {
    head.dataset.etat = "inconnu";
    head.textContent = `REACHED, BUT UNKNOWN TO THE STATION — tried at ${hour}, the next follows on its own`;
  } else if (receivedOne.cas === "sans-droit") {
    head.dataset.etat = "sans-droit";
    head.textContent = `REACHED, BUT WITHOUT THE RIGHT TO THE ACTION — tried at ${hour}, the next follows on its own`;
  } else if (receivedOne.cas === "commande-manque") {
    head.dataset.etat = "commande-manque";
    head.textContent = `REACHED, BUT A COMMAND IS MISSING ON THE STATION — tried at ${hour}, the next follows on its own`;
  } else if (receivedOne.cas === "node-inapte") {
    head.dataset.etat = "node-inapte";
    head.textContent = `REACHED, BUT THE STATION'S NODE DOES NOT SUIT THE RUNTIME — tried at ${hour}, the next follows on its own`;
  } else if (receivedOne.atteinte) {
    head.dataset.etat = "plus-pilotable";
    head.textContent = `REACHED, BUT NO LONGER CONTROLLABLE — tried at ${hour}, the next follows on its own`;
  } else {
    head.dataset.etat = "pas-joint";
    head.textContent = `NOT REACHED — tried at ${hour}, the next follows on its own`;
  }
  // Chaque état de pilotage a son ton, et sa forme : en niveaux de gris, ils ne se confondent pas.
  const your = TONES_OF_STEERING[head.dataset.etat ?? ""];
  delete head.dataset.ton;
  if (your !== undefined) {
    head.dataset.ton = your;
    head.prepend(brandOfPill(document, your));
  }
  if ("erreur" in receivedOne) body.replaceChildren(...obtainedInOneLine(project, receivedOne, ACTION));
}

// Ce qu'une vérification a donné. En tête, son verdict en une phrase ; dessous, une ligne par
// manque — qui agit, et pour le chef le bouton qui fait le geste ou la commande exacte, à copier ;
// les lignes « à savoir » à part, plus discrètes. Sans verdict, le même cas et le même renvoi que sous `status`.
/**
 * @param {Project} project @param {Guide["verification"]} verification
 * @param {(text: string, gesture: () => Promise<unknown>) => HTMLButtonElement} action
 * @param {boolean} [withTitle] faux : la phrase est déjà dite au-dessus (une alerte plantée la porte en titre)
 * @returns {HTMLElement[]}
 */
function setVerdict(project, verification, action, withTitle = true) {
  if (verification === undefined) return [];
  const head = block("p", verification.titre);
  head.className = "verdict";
  head.dataset.verdict = verification.etat;
  if (verification.etat === "en-cours") return [head];
  if (verification.etat === "sans-verdict") {
    head.textContent = `${verification.titre} — verified at ${hourOf(verification.a)}`;
    return [head, ...obtainedInOneLine(project, { ...verification.echec, projet: project.nom }, ACTION)];
  }
  const setOne = document.createElement("div");
  setOne.className = "verification";
  if (withTitle) setOne.append(head);
  if (verification.etat === "illisible") {
    setOne.append(...verification.suite.map((line) => block("p", line)));
    return [setOne];
  }
  if (verification.manques.length > 0) {
    const gaps = document.createElement("ul");
    gaps.className = "manques";
    gaps.append(...verification.manques.map((lack) => setMissing(project, lack, action)));
    setOne.append(gaps);
  }
  if (verification.panne !== null) setOne.append(block("p", verification.panne));
  if (verification.aSavoir.length > 0) {
    const aKnowledge = document.createElement("div");
    aKnowledge.className = "a-savoir";
    aKnowledge.append(block("strong", "Good to know — nothing waits on these"));
    for (const line of verification.aSavoir) aKnowledge.append(line.geste === null ? block("p", line.texte) : saysAndHelp("p", line.texte, line.geste));
    setOne.append(aKnowledge);
  }
  return [setOne];
}

// Un manque : qui agit, ce qui manque en mots simples, et ce que le chef a pour le lever — un
// bouton quand l'app fait le geste, sinon la commande exacte, au survol. Ce que brigade
// lève seule n'a rien de tout cela.
/**
 * @param {Project} project @param {import("../service.ts").LineOfMissing} lack
 * @param {(text: string, gesture: () => Promise<unknown>) => HTMLButtonElement} action
 */
function setMissing(project, lack, action) {
  const line = document.createElement("li");
  line.dataset.acteur = lack.acteur;
  line.append(block("strong", `${lack.qui}:`), " ", lack.texte);
  const { geste: gesture } = lack;
  if (gesture === null) return line;
  if ("action" in gesture) {
    const id = gesture.action;
    if (id === "init") line.append(action(gesture.libelle, () => primeService(project)));
    else if (id === "protection") line.append(action(gesture.libelle, () => brigade.proteger(project.nom)));
    // Les stations et les décisions se choisissent sur la page du projet : la ligne n'a pas de bouton.
    return line;
  }
  // Ni commande ni phrase de mode d'emploi à plat : elles se lisent au survol.
  line.append(hover(document, "commande" in gesture ? gesture.commande : gesture.dit));
  return line;
}

/** @param {Project} project */
async function readService(project) {
  holdDeclared(await brigade.service(project.nom));
}

// Les stations déclarées qu'un guide porte sont retenues pour son projet ; affiché, son bloc se repose.
/** @param {import("../service.ts").Guide | undefined} guide */
function holdDeclared(guide) {
  const readEntries = guide?.controle?.stations;
  if (guide === undefined || readEntries === undefined) return;
  declaredEntries.set(guide.projet, readEntries);
  if (current?.nom === guide.projet) restTheStations(current);
}

// Les stations déclarées se lisent dans « Details » de la carte de chacune, sur l'onglet Stations : il se repose.
/** @param {Project} project */
function restTheStations(project) {
  if (current?.nom === project.nom) restTheTabStations();
}

// Les gestes des réglages d'une station déclarée, dans « Details » de sa carte (ticket 2488) : un plafond ou des capacités
// changés partent aussitôt ; la case des tickets ordinaires de ce poste s'écrit comme dans Settings.
/** @param {Project} project @returns {import("./project/stations/StationSettings.js").Actions} */
function actionsOfSettings(project) {
  return {
    appliquer: (name, key, wanted) => void changeTheStation(project, name, key, wanted),
    ordinaires: (taken) => void setTheOrdinaryHere(project, taken),
  };
}
// Le changement part — la rangée `cle` dit qu'il est en route —, puis elle dit ce qu'il a rendu ; refusé, la saisie revient
// à la déclaration en vigueur. La déclaration relue arrive par `surGuide`, et le bloc s'y repose.
/** @param {Project} project @param {string} name @param {string} key @param {import("../service.ts").StationWanted} wanted */
async function changeTheStation(project, name, key, wanted) {
  const input = inputsOfStations.get(project.nom)?.get(name);
  if (input === undefined || input.envoi) return;
  input.envoi = true;
  input.ou = key;
  input.rendu = undefined;
  restTheTabStations();
  /** @type {import("../service.ts").StationChanged} */
  let rendered;
  try {
    rendered = await brigade.changerUneStation(project.nom, name, wanted);
  } catch (error) {
    rendered = { refus: "Nothing was changed: the app did not answer", detail: error instanceof Error ? error.message : String(error) };
  }
  input.envoi = false;
  input.rendu = rendered;
  if ("refus" in rendered) comeBack(input, declaredEntries.get(project.nom)?.declarees.find((readEntry) => readEntry.nom === name));
  if (current?.nom === project.nom) restTheTabStations();
}
// Les projets dont la case des tickets ordinaires de ce poste est en route, sur « Station settings ».
/** @type {Set<string>} */
const ordinaryInProgress = new Set();
// La case des tickets ordinaires de ce poste : la même écriture que Settings, la limite de cooks gardée telle qu'elle est.
/** @param {Project} project @param {boolean} taken */
async function setTheOrdinaryHere(project, taken) {
  const readOne = ordinarySeen.get(project.nom);
  if (readOne === undefined || !readOne.reglable || ordinaryInProgress.has(project.nom)) return;
  ordinaryInProgress.add(project.nom);
  restTheTabStations();
  /** @type {string | undefined} */
  let refusal;
  try {
    refusal = await brigade.reglerOrdinaires(project.nom, taken, readOne.limite);
  } catch (error) {
    refusal = `nothing was written: ${error instanceof Error ? error.message : String(error)}`;
  } finally {
    ordinaryInProgress.delete(project.nom);
  }
  ordinaryRefused = { projet: project.nom, refus: refusal ?? "" };
  ordinaryPose = "";
  // Relue, l'option se repose à la valeur en vigueur — celle d'avant, quand le changement est refusé.
  if (current?.nom === project.nom) await setOrdinary(project);
}

// « Cook it on a station that has it » (ticket 1511) ouvre, sur Stations, « Details » de la carte de la station de ce poste :
// la capacité qui manque y est offerte, décochée, à côté de celles qu'elle déclare — et ce que cet ordinateur sait déclarer,
// lu comme pour « + station » (ticket 1307). La cocher la déclare : chaque case s'applique dès qu'elle change (ticket 2920).
/** @type {{ projet: string, nom: string } | undefined} */
let capacityOffered;
/** @param {Project} project @param {string} name @param {string} [called] */
async function offerTheCapacity(project, name, called) {
  const readEntries = declaredEntries.get(project.nom);
  const station = readEntries?.declarees.find((readEntry) => readEntry.nom === name);
  if (readEntries === undefined || station === undefined) return;
  const inputs = inputsOfStations.get(project.nom) ?? new Map();
  inputsOfStations.set(project.nom, inputs);
  const input = inputOf(inputs, station, readEntries);
  input.choix = capacityChoice(station, readEntries, [], called);
  capacityOffered = { projet: project.nom, nom: name };
  restTheTabStations();
  const defaults = await defaultsOfThisComputer(project.nom);
  if ("refus" in defaults || inputs.get(name) !== input) return;
  input.choix = capacityChoice(station, readEntries, defaults.capacites, called);
  if (current?.nom === project.nom) restTheTabStations();
}

// Un geste de l'installation a rendu un terminal — le second, pour la session d'init ; un
// shell, pour le démarrage — ou la raison pour laquelle rien n'est fait. Le terminal est
// montré, à droite : c'est sa note qui dit ce qui a été lancé, ou écrit. La raison se lit là
// où il se serait montré : à droite, sous les onglets des terminaux.
/** @param {Project} project @param {Terminal | { refus: string }} rendered */
function followAction(project, rendered) {
  notWritten = notWrittenSecond = "";
  actionRate = undefined;
  if (!("refus" in rendered)) keep(project.nom, rendered);
  else notWrittenSecond = rendered.refus;
  if (current?.nom === project.nom) show();
}

/** @param {Project} project */
async function primeService(project) {
  followAction(project, await brigade.amorcer(project.nom));
}

// Une ligne de Settings (ticket 1700) : la rangée de réglage de l'app (components/setting, ticket 2920) — son nom, sa
// valeur en vigueur, son contrôle, qui s'applique dès qu'il change ; puis, sous elle, ce que le contrôle a ouvert ou rendu
// (une confirmation, un refus). `niveau` : sa clé, et la marque de son niveau (levels.js), posée à côté de son nom.
/** @param {string} name @param {(Node | string)[]} value @param {HTMLElement[]} control @param {HTMLElement[]} [below] @param {{ cle: string, niveau: HTMLElement }} [level] */
function rowOfSetting(name, value, control, below = [], level) {
  return rowOfTheFamily(document, { nom: name, valeur: value, controle: control, dessous: below, ...level });
}

// Un refus, sous la ligne qu'il concerne.
/** @param {string} text @returns {HTMLElement[]} */
function refusalOfSetting(text) {
  if (text === "") return [];
  return [lineError(document, text, "", { classe: "dit refus" })];
}

// Le groupe de Settings : son titre est le mot du niveau (levels.js), son survol dit où ses réglages sont gardés. Sans
// réglage, il le dit en une ligne.
for (const [level, help] of /** @type {const} */ ([
  ["project", "the project's settings — those in its repository change by a pull request, held for you; its kitchen is set on the station that serves it"],
])) {
  const title = element(`niveau-${level}`);
  title.dataset.niveau = level;
  title.replaceChildren(LEVELS_SAID[level].libelle, hover(document, help));
}
function setTheGroups() {
  emptyProject.hidden = !settingsOfProject.hidden || !stopKitchen.hidden;
  emptyProject.textContent = emptyProject.hidden ? "" : "nothing to set: no station reads this project";
}
// Le projet dans ton app (ticket 1700) : une ligne du groupe du projet — il est dans la barre, et « Remove from the app »
// l'en retire ; rien ne part vers sa station, ce que le survol du bouton dit. Le clic demande d'abord un « yes » : un
// projet ne se retire pas d'un clic perdu. Refusé, la raison se lit sous la ligne.
/** @param {Project} project @param {Removal | undefined} pose */
function setRemoval(project, pose) {
  // Le chef a pu changer d'espace pendant que le process principal répondait.
  if (current?.nom !== project.nom) return;
  removal.hidden = pose === undefined;
  if (pose === undefined) return removal.replaceChildren();
  if (removalOfTheApp !== project.nom) removalOfTheApp = "";
  if (notRemoved.projet !== project.nom) notRemoved = { projet: "", refus: "" };
  const { libelle: wording, lignes: lines } = pose.retirer;
  const request = button(`${wording}…`, () => {
    removalOfTheApp = project.nom;
    setRemoval(project, pose);
  }, "danger");
  request.title = lines.join("\n");
  const control =
    removalOfTheApp === project.nom
      ? [button(YES(`remove “${project.nom}” from the app`), () => void removeOfTheApp(project), "danger"), button(CANCEL, () => ((removalOfTheApp = ""), setRemoval(project, pose)), "discret")]
      : [request];
  removal.replaceChildren(rowOfSetting("Remove this project from the app's sidebar", [], control, refusalOfSetting(notRemoved.refus)));
}

// L'accent de l'espace affiché : celui de son projet, à la place de celui de la peau — posé sur la
// racine, il vaut pour tout ce que la peau dit choisi ou au clavier. Ailleurs, la peau reprend le sien.
function tint() {
  const accent = adds ? undefined : current?.couleurs?.accent;
  if (accent === undefined) document.documentElement.style.removeProperty("--accent");
  else document.documentElement.style.setProperty("--accent", accent);
}

// Les couleurs du projet, dans le groupe du projet de Settings : une ligne par rôle — la couleur qu'il porte, puis une
// pastille par couleur de la palette, celle qu'il porte pressée, et le sélecteur d'une couleur libre. Une couleur libre
// se montre aussi, pressée, au bout de la palette : la palette est ce que l'app propose, pas ce qu'elle exige. Trop
// proche d'une couleur d'état ou de celle d'un autre projet, elle reste, et une ligne sous la sienne dit laquelle
// (colors.ts, `proches`).
/** @param {Project} project */
function setColors(project) {
  if (colorRefused.projet !== project.nom) colorRefused = { projet: "", refus: "" };
  colors.hidden = false;
  /** @param {"onglet" | "accent"} role @param {string} wording */
  const row = (role, wording) => {
    const scope = project.couleurs?.[role];
    const named = PALETTE.find(({ valeur: value }) => value === scope)?.nom;
    const pills = PALETTE.map(({ nom: name, valeur: value }) => {
      const created = clickable("", () => void colorIn(project, role, name));
      created.className = "teinte";
      created.style.setProperty("--teinte", value);
      created.title = created.ariaLabel = `${wording}: ${name}`;
      created.ariaPressed = String(value === scope);
      return created;
    });
    if (scope !== undefined && named === undefined) {
      const holds = clickable("", () => {});
      holds.className = "teinte";
      holds.style.setProperty("--teinte", scope);
      holds.title = holds.ariaLabel = `${wording}: ${scope}, your own color`;
      holds.ariaPressed = "true";
      holds.disabled = true;
      pills.push(holds);
    }
    // Le sélecteur du système : la couleur part dès qu'elle est choisie.
    const free = document.createElement("input");
    free.type = "color";
    free.value = scope ?? PALETTE[0]?.valeur ?? "";
    free.title = free.ariaLabel = `${wording}: another color…`;
    free.addEventListener("change", () => void colorIn(project, role, free.value));
    const other = document.createElement("label");
    other.className = "libre";
    other.append(free, "other…");
    const palette = document.createElement("span");
    palette.className = "rangee";
    palette.append(...pills, other);
    const near = project.proches?.[role];
    return rowOfSetting(wording, [block("span", scope === undefined ? NOT_STILL("color") : (named ?? scope))], [palette], near === undefined ? [] : refusalOfSetting(`${wording}: ${near}`), { cle: "couleurs", niveau: levelOf(document, "couleurs") });
  };
  colors.replaceChildren(row("onglet", "tab, in the bar"), row("accent", "accent, in the space"), ...refusalOfSetting(colorRefused.refus));
}

// Le sigle du projet, dans le groupe du projet de Settings (ticket 1983) : celui que sa case écrit — tiré de son nom, ou
// le tien —, et le champ où l'écrire. Écrit, il part dès que le champ change ; vidé, ou par « back to its name », la
// case reprend celui que l'app tire de son nom. Refusé, la raison se lit sous la ligne.
/** @param {Project} project */
function setAcronym(project) {
  if (acronymRefuses.projet !== project.nom) acronymRefuses = { projet: "", refus: "" };
  acronym.hidden = false;
  const field = document.createElement("input");
  field.className = "mono";
  field.value = project.sigle ?? "";
  field.placeholder = project.etiquette;
  field.autocomplete = "off";
  field.spellcheck = false;
  field.title = field.ariaLabel = "your label for its tile: 3 characters at most — empty, the app derives one from its name";
  field.addEventListener("change", () => void abbreviateProject(project, field.value.trim() === "" ? null : field.value));
  const control = project.sigle === undefined ? [field] : [field, button("back to its name", () => void abbreviateProject(project, null))];
  const isWorth = block("span", project.etiquette);
  isWorth.className = "mono";
  acronym.replaceChildren(rowOfSetting("Label in the bar", [isWorth, ` · ${project.sigle === undefined ? "from its name" : "yours"}`], control, refusalOfSetting(acronymRefuses.refus), { cle: "sigle", niveau: levelOf(document, "sigle") }));
}

// Un sigle écrit : le process principal l'écrit dans le fichier des projets, et il revient par `surConfiguration` — la
// case le prend alors. `null` : le sigle écrit est retiré. Refusé, la raison se lit dessous.
/** @param {Project} project @param {string | null} wanted */
async function abbreviateProject(project, wanted) {
  const refusal = await brigade.changerSigle(project.nom, wanted);
  acronymRefuses = { projet: project.nom, refus: refusal ?? "" };
  if (current?.nom === project.nom) setAcronym(current);
}

// L'état de la cuisine dans la barre des menus du Mac, la zone de notification de Windows (ticket 3269) : une ligne de
// toi, la même dans les Settings de chaque projet — elle vaut pour toute l'app. Un interrupteur la pose ou la retire ; le
// process principal l'écrit dans le fichier des projets, et elle revient par `surConfiguration`. Le téléphone n'en a pas.
function setMenuBar() {
  if (phone !== undefined || brigade.changerBarreDeMenus === undefined) {
    menuBar.hidden = true;
    return menuBar.replaceChildren();
  }
  menuBar.hidden = false;
  const lit = configuration.barreDeMenus !== false;
  const or = WORKSTATION.mac ? "menu bar" : "notification area";
  const flip = switchOfTheApp(document, { texte: lit ? "on" : "off", allume: lit, libelle: `Show the kitchen's state in the ${or}` }, (wantedOne) => void adjustMenuBar(wantedOne));
  const help = `how many cooks are working and how many questions wait for you — "3 cooking · 1 for you" — in the ${or}; a click lists the questions, and opens the app on the one you pick. For the whole app, not this project only`;
  menuBar.replaceChildren(rowOfSetting(WORKSTATION.mac ? "Menu bar" : "Notification area", [block("span", lit ? "shown" : "hidden"), hover(document, help)], [flip], refusalOfSetting(menuBarRefused || (lit ? iconOfBackgroundRefused : "")), { cle: "barre-de-menus", niveau: levelOf(document, "barre-de-menus") }));
}
async function readTheIconOfBackground() {
  const refusal = (await brigade.iconeDeFond?.()) ?? "";
  if (refusal === iconOfBackgroundRefused) return;
  iconOfBackgroundRefused = refusal;
  setMenuBar();
}
/** @param {boolean} wantedOne */
async function adjustMenuBar(wantedOne) {
  const refusal = await brigade.changerBarreDeMenus?.(wantedOne);
  menuBarRefused = refusal ?? "";
  setMenuBar();
}

// Une couleur choisie : le process principal l'écrit dans le fichier des projets, et elle revient
// par `surConfiguration` — la barre et l'espace la prennent alors. Refusée, la raison se lit dessous.
/** @param {Project} project @param {"onglet" | "accent"} role @param {string} color une teinte de la palette par son nom, ou une couleur libre `#rrggbb` */
async function colorIn(project, role, color) {
  const refusal = await brigade.colorer(project.nom, role, color);
  colorRefused = { projet: project.nom, refus: refusal ?? "" };
  if (current?.nom === project.nom) setColors(current);
}

// Les réglages du projet, sous Paramètres (ticket 1309) : lus là où sa cuisine tourne, à l'ouverture du projet. Un
// projet qui ne cuit nulle part n'a pas de runtime pour les lire : la section ne se pose pas.
/** @param {Project} project */
async function readTheSettings(project) {
  if (!itselfLit(project)) {
    settingsRead.delete(project.nom);
    return setTheSettingsOfProject(project);
  }
  /** @type {import("../settings-of-project.ts").ReadOfSettings | undefined} */
  let receivedOne;
  try {
    receivedOne = await brigade.reglagesDuProjet(project.nom);
  } catch (error) {
    receivedOne = { sans: NOT_REACHED("settings"), detail: error instanceof Error ? error.message : String(error) };
  }
  // Un pont qui ne porte pas la lecture — un téléphone — ne rend rien : la section ne se pose pas.
  if (receivedOne === undefined) settingsRead.delete(project.nom);
  else settingsRead.set(project.nom, receivedOne);
  if (current?.nom !== project.nom) return;
  setTheSettingsOfProject(project);
}

// L'état d'un réglage du projet, et ce que ses gestes en font.
/** @param {Project} project @param {import("../settings-of-project.ts").Key} key */
function actionsOfSetting(project, key) {
  const states = statesOfSettings.get(project.nom) ?? new Map();
  statesOfSettings.set(project.nom, states);
  return {
    etat: states.get(key),
    /** @param {string | { modele: string, effort: string }} chosen */
    choisir: (chosen) => void states.set(key, { ...states.get(key), choisi: chosen }),
    /** @param {import("../settings-of-project.ts").ChoiceOfSetting} choice @param {string} said */
    proposer: (choice, said) => void proposeOneSetting(project, choice, said),
    /** @param {string} url */
    ouvrir: (url) => void brigade.ouvrirLaProposition(url),
  };
}

/** @param {Project} project */
function setTheSettingsOfProject(project) {
  const states = statesOfSettings.get(project.nom) ?? new Map();
  statesOfSettings.set(project.nom, states);
  const options = {
    lecture: settingsRead.get(project.nom),
    etats: states,
    choisir: (/** @type {import("../settings-of-project.ts").Key} */ key, /** @type {string | { modele: string, effort: string }} */ chosen) => actionsOfSetting(project, key).choisir(chosen),
    proposer: (/** @type {import("../settings-of-project.ts").ChoiceOfSetting} */ choice, /** @type {string} */ said) => void proposeOneSetting(project, choice, said),
    ouvrir: (/** @type {string} */ url) => void brigade.ouvrirLaProposition(url),
  };
  // Les rangées de l'artboard d'abord ; celles qu'il ne dessine pas suivent, sous le sigle et la couleur.
  for (const [container, group] of /** @type {const} */ ([[settingsOfProject, "dessines"], [settingsExtra, "en-plus"]])) {
    const pose = setTheSettings(document, { ...options, groupe: group });
    container.hidden = pose === null;
    container.replaceChildren(...(pose === null ? [] : [pose]));
  }
}

// Un réglage du projet changé : le changement part par le process principal (settings-of-project.ts), qui attend que le
// runtime du projet ait ouvert la PR. Tant qu'il n'a pas répondu, la rangée dit qu'il s'y met. Ouverte, la PR se dit sous
// la rangée ; refusé, le refus — et le champ revient à la valeur en vigueur, qui ne change pas tant que la PR n'est pas
// mergée.
/** @param {Project} project @param {import("../settings-of-project.ts").ChoiceOfSetting} choice @param {string} said */
async function proposeOneSetting(project, choice, said) {
  const states = statesOfSettings.get(project.nom) ?? new Map();
  statesOfSettings.set(project.nom, states);
  if (states.get(choice.cle)?.enCours === true) return;
  states.set(choice.cle, { ...states.get(choice.cle), enCours: true, dit: undefined });
  const rest = () => {
    if (current?.nom !== project.nom) return;
    setTheSettingsOfProject(project);
  };
  rest();
  /** @type {import("../settings-of-project.ts").RenderedOfSetting} */
  let rendered;
  try {
    rendered = (await brigade.proposerUnReglage(project.nom, choice)) ?? { refus: "nothing was proposed: nothing was sent", detail: WITHOUT_BRIDGE };
  } catch (error) {
    rendered = { refus: "nothing was proposed: nothing was sent", detail: error instanceof Error ? error.message : String(error) };
  }
  states.set(choice.cle, { dit: "pr" in rendered ? { ...rendered, valeur: said } : rendered });
  rest();
}

// Les tickets ordinaires de cet ordinateur, sous cette machine dans Settings (ticket 1700) : deux lignes — les prendre
// ou non, et combien de cooks à la fois —, ce que ça implique au survol, et, quand la station dit son bac à sable
// indisponible, pourquoi ce poste n'en prend aucun, sous la première. Le process principal décide du bloc
// (ordinary.ts) : hors d'un Mac, il n'est pas réglable, et rien ne se pose.
let ordinaryRefused = { projet: "", refus: "" };
// Ce qui est posé : une lecture qui n'a rien changé ne le repose pas — le chef peut être en train d'écrire la limite.
let ordinaryPose = "";
/** @param {Project} project */
async function setOrdinary(project) {
  const received = await brigade.ordinaires(project.nom);
  // L'onglet Stations dit l'option sur la station de ce poste (ticket 2488), et le bac à sable de la station locale le
  // même (ticket 2489).
  ordinarySeen.set(project.nom, received);
  const locale = stationLocaleRead.projet === project.nom && JSON.stringify(stationLocaleRead.ordinaires) !== JSON.stringify(received ?? null);
  if (locale) stationLocaleRead.ordinaires = received ?? null;
  // Le chef a pu ouvrir un autre projet pendant la lecture.
  if (current?.nom !== project.nom) return;
  if (locale) restTheStationLocale(stationLocaleRead);
  else restTheTabStations();
  // Hors d'un Mac, ils ne se règlent pas : il n'y a rien à poser — le groupe dit qu'il n'a rien à régler.
  if (received === undefined || received.reglable === false) {
    ordinary.hidden = true;
    ordinaryPose = "";
    ordinary.replaceChildren();
    return setTheGroups();
  }
  if (ordinaryRefused.projet !== project.nom) ordinaryRefused = { projet: "", refus: "" };
  const pose = JSON.stringify([project.nom, received, ordinaryRefused.refus]);
  if (pose === ordinaryPose) return;
  ordinaryPose = pose;
  ordinary.ariaLabel = `Ordinary tickets on ${WORKSTATION.nom}`;
  ordinary.hidden = false;
  const limit = document.createElement("input");
  limit.type = "number";
  limit.min = "1";
  limit.step = "1";
  limit.value = received.limite === null ? "" : String(received.limite);
  limit.ariaLabel = `Cooks ${WORKSTATION.nom} runs at once`;
  const set = async (/** @type {boolean} */ taking) => {
    const wantedOne = limit.value.trim() === "" ? null : Number(limit.value);
    const refusal = await brigade.reglerOrdinaires(project.nom, taking, wantedOne);
    ordinaryRefused = { projet: project.nom, refus: refusal ?? "" };
    ordinaryPose = "";
    if (current?.nom === project.nom) void setOrdinary(project);
  };
  const option = switchOfTheApp(
    document,
    { texte: received.actif ? "on" : "off", allume: received.actif, libelle: `Take the ordinary tickets on ${WORKSTATION.nom}` },
    (taking) => void set(taking),
  );
  limit.addEventListener("change", () => void set(option.ariaChecked === "true"));
  // Ce que l'option implique est au survol de sa valeur ; un bac à sable indisponible, sous sa ligne.
  // Leur niveau, celui de la table (levels.js) : le groupe le dit, l'étiquette reste sur la ligne.
  const take = rowOfSetting("ordinary tickets", [block("span", received.actif ? "taken" : "not taken"), hover(document, received.explication)], [option], [...refusalOfSetting(received.indisponible ?? ""), ...refusalOfSetting(ordinaryRefused.refus)], { cle: "ordinaires", niveau: levelOf(document, "ordinaires") });
  const howMany = rowOfSetting("cooks at once", [block("span", received.limite === null ? "no limit" : String(received.limite))], [limit], [], { cle: "ordinaires", niveau: levelOf(document, "ordinaires") });
  ordinary.replaceChildren(take, howMany);
  setTheGroups();
}

/** @param {Project} project */
async function readRemoval(project) {
  setRemoval(project, await brigade.retrait(project.nom));
}

// Ce que l'app dit d'un projet qu'elle vient de retirer de sa liste : il n'a plus d'espace
// où le dire, c'est donc dit par-dessus l'écran, jusqu'à ce que le chef l'ait lu.
/** @param {import("../removal.ts").Opinion} said */
function setOpinion(said) {
  opinion.replaceChildren(block("strong", said.titre), ...said.lignes.map((line) => block("p", line)), button("Got it", () => (opinion.hidden = true)));
  opinion.hidden = false;
}

// Le « yes » : le projet quitte l'app, et rien ne part vers sa station. Retiré, il a déjà quitté la barre par
// `surConfiguration` ; refusé, la raison se lit sous sa ligne.
/** @param {Project} project */
async function removeOfTheApp(project) {
  const rendered = await brigade.retirerDeLApp(project.nom);
  removalOfTheApp = "";
  if ("avis" in rendered) return setOpinion(rendered.avis);
  notRemoved = { projet: project.nom, refus: rendered.refus };
  await readRemoval(project);
}

// Le ton de chaque état de pilotage : pilotable, vert ; joint sans l'être plus — plus pilotable,
// inconnu de la box, sans le droit, une commande ou le bon node qui manque —, jaune ; pas joint,
// rouge. Ce sont les mots que `rendre` pose déjà : rien n'est déduit de plus.
/** @type {Record<string, string>} */
const TONES_OF_STEERING = { pilotable: "vert", "plus-pilotable": "jaune", inconnu: "jaune", "sans-droit": "jaune", "commande-manque": "jaune", "node-inapte": "jaune", "pas-joint": "rouge" };

// Un mot d'état et sa pastille. La couleur est celle que le mot a dans la liste
// fermée, et sa forme celle de son ton ; un mot qui n'y est pas s'affiche tel quel,
// pastille vide. Le mot reste dit par le texte voisin — et ici par le titre.
/** @param {string} word @param {string | undefined} your */
function pill(word, your) {
  const created = brandOfPill(document, your);
  created.title = word;
  return created;
}

// La pastille d'un projet dans la barre : son état, lu. Sans faits, elle ne
// prend aucune couleur — elle dit, au survol, ce que l'app a obtenu à la place.
/** @param {string} name */
function markPill(name) {
  const setOne = pills.get(name);
  if (setOne === undefined) return;
  const held = heldOnes.get(name);
  delete setOne.dataset.ton;
  delete setOne.dataset.forme;
  setOne.dataset.lu = held === undefined ? "en-cours" : "tableau" in held ? "oui" : "non";
  if (held !== undefined && "tableau" in held && held.tableau.ton !== undefined) {
    setOne.dataset.ton = held.tableau.ton;
    const shape = shapeOf(held.tableau.ton);
    if (shape !== undefined) setOne.dataset.forme = shape;
  }
  // La box ne répond pas : un mot, le même que la bande (alerts.ts) — ce que le dernier rail disait n'est plus lu.
  const silentOne = signals.get(name)?.etat === "injoignable";
  if (silentOne) {
    delete setOne.dataset.ton;
    delete setOne.dataset.forme;
    setOne.dataset.lu = "non";
  }
  const outsideLine = outsideLines.get(name);
  const said = silentOne
    ? "unreachable"
    : outsideLine !== undefined
      ? `offline since ${hourShort(outsideLine)}${held !== undefined && "tableau" in held ? ` — ${held.tableau.mot ?? held.tableau.etat} when last read` : ""}`
      : held === undefined
        ? "first read in progress…"
        : "tableau" in held
          ? (held.tableau.mot ?? held.tableau.etat)
          : `no facts read — ${held.titre}`;
  setOne.textContent = silentOne || (held !== undefined && !("tableau" in held)) ? "!" : "";
  const entry = /** @type {HTMLElement} */ (setOne.parentElement);
  entry.title = `${name} — ${said}`;
  entry.ariaLabel = entry.title;
}

// Le signal d'un projet sur sa case : l'urgence — toute sa cuisine attend le chef —, une alerte, ou
// « non vérifié » — jamais rien de plus sain que ce que la bande a dit. L'urgence n'est pas une
// alerte de plus : elle a son signe et sa marque. Le projet affiché n'en porte pas : sa bande est sous ses yeux.
// Cliquer le signal ouvre l'espace du projet : sa bande y est en tête, chaque alerte avec son geste
// et son prix, la plus grave d'abord (alerts.ts) — rien à chercher, un clic de plus lance le geste.
/** @param {string} name */
function markSignal(name) {
  const entry = pills.get(name)?.parentElement;
  if (entry === null || entry === undefined) return;
  const signal = current?.nom === name ? undefined : signals.get(name);
  const pose = reported.get(name);
  if (signal === undefined) {
    pose?.remove();
    reported.delete(name);
    return;
  }
  const brand = pose ?? document.createElement("span");
  brand.className = "signal";
  brand.dataset.etat = signal.etat;
  brand.textContent = signal.etat === "urgence" ? "!!" : signal.etat === "alerte" ? "!" : signal.etat === "injoignable" ? "×" : "?";
  brand.title =
    signal.etat === "injoignable"
      ? `${name}: unreachable — ${signal.dit}. Click to open ${name}: its last reading is kept, with the gesture to try again`
      : signal.etat === "urgence"
          ? `${name}: ${signal.dit} — urgent: the whole kitchen is waiting for you, nothing cooks until you act. Click to open ${name}, with what it waits for and since when`
        : signal.etat === "alerte"
          ? `${name}: ${signal.dit} — alert: something needs doing. Click to open ${name}, with the alert, its action and its price`
          : `${name}: ${signal.dit} — not verified: the app could not read this state, it is not a failure. Click to open ${name}, with what could not be read`;
  brand.ariaLabel = brand.title;
  if (pose === undefined) {
    brand.addEventListener("click", (event) => {
      event.stopPropagation();
      const project = configuration.projets.find((candidate) => candidate.nom === name);
      if (project !== undefined) void open(project);
    });
    entry.append(brand);
    reported.set(name, brand);
  }
}

// Le signe d'un cook coincé — sans progrès depuis la moitié de son bail —, tel que `status` l'écrit en tête du bail de
// son ticket (slip.ts) : « STUCK: no progress since 31 min ». Le reste du bail est dans la fiche.
/** @param {import("../facts.ts").Card} carte */
function stuckSays({ dit: said }) {
  const lease = said.find(({ libelle: wording }) => wording === "lease")?.valeur;
  return lease !== undefined && /^(?:STUCK: |COINC[EÉ] : )/.test(lease) ? lease.replace(/, (?:lease|bail) .*$/, "") : undefined;
}

const WITHOUT_COOK = "Taken, no cook running";

// Une carte du rail : son numéro, son état, son titre, puis une phrase en mots simples qui dit ce
// qui se passe et, au plus, une ligne de signal (line-card.ts) ; un petit repère quand la file ne
// dit pas tout. Ce que la file dit du ticket en plus est dans sa fiche (`poserDetailsDeFiche`). Dans
// T'attend, la phrase est ce qu'on attend du chef, et son geste — une demande au second — est sur la
// fiche. Dans Livré, la phrase porte l'heure et le résumé ; ses captures restent sur la carte.
// Tout est déjà rangé par le process principal (facts.ts, slip.ts) : la vue pose. Le
// numéro s'ouvre sur l'issue : l'adresse reste au process principal, la vue nomme le ticket.
/** @param {Project} project @param {import("../facts.ts").Card} cardItem @param {import("./components/pill/pill.js").State} [stateOfColumn] l'état de sa colonne : un même état se dit partout par la même pastille, quel que soit le mot de la file @param {boolean} [withStation] la station s'étiquette (Taken et Pass d'un projet à plusieurs stations ; jamais sur Cooks, où son bloc la nomme) @param {boolean} [outsideColumn] une carte d'aucune des six colonnes : son mot est dit tel quel, sans l'état d'une colonne @param {boolean} [cooked] un agent y travaille en ce moment, d'une lecture qui le dit encore vrai : la poêle (ticket 2984) */
function renderSlip(project, cardItem, stateOfColumn, withStation = false, outsideColumn = false, cooked = false) {
  const { ticket, etat: state, mot: wordOfState, ton: your, titre: title, ouvrable: openable, attendu: expected, attend: awaiting, pr } = cardItem;
  // Le bon et sa tête (components/slip) ; sur une carte qui attend le chef, la carte d'attente (components/card-wait), qui
  // ajoute à la tête la pastille « awaiting you » : elle le dit en mots, pour qui ne lit pas la couleur de la colonne. Le
  // mot de la pastille est celui de la table de slip.ts, posé par le process principal.
  const number = openable ? clickable(`#${ticket}`, () => void openIssue(project, ticket)) : block("span", `#${ticket}`);
  number.className = "ticket mono";
  number.title = openable
    ? `open issue #${ticket} in the browser`
    : state === undefined
      ? `this ticket is not on the rail that ${gesture(project, "facts")} returns: the app does not have its address`
      : "the address the station returned for this ticket is not https: the app does not open it";
  const pose = { numero: number, hors: outsideColumn, ...(state === undefined ? {} : { mot: wordOfState ?? state, ...(outsideColumn ? {} : { etat: stateOfColumn ?? stateOfYour(your) }) }) };
  // Une carte qui attend un autre humain (« Awaiting others ») garde la carte d'attente, sans dire qu'elle t'attend (ticket 3071).
  // Parked pour le chef, elle l'attend (tickets 4238, 4261) ; une relance passée ne la lui rend pas.
  const slip = expected || isRed(cardItem) ? cardWait(document, { ...pose, attendu: cardItem.qui === undefined }) : slipOfTheFamily(document, pose);
  slip.dataset.ticket = String(ticket);
  // Un clic sur la carte, quelle que soit sa colonne, ouvre sa fiche par-dessus le rail. Ce qui s'y
  // clique déjà — son numéro, sa PR, ses remarques — garde son geste ; un texte
  // qu'on y sélectionne pour le recopier n'ouvre rien. Au clavier, Entrée ou Espace sur la carte.
  slip.tabIndex = 0;
  slip.addEventListener("click", (event) => {
    const target = /** @type {Element | null | undefined} */ (event.target);
    if (target?.closest?.("button, a, summary, input, textarea, select, form") || String(globalThis.getSelection?.() ?? "") !== "") return;
    openCard(project, cardItem, slip);
  });
  slip.addEventListener("keydown", (event) => {
    if ((event.target ?? slip) !== slip || (event.key !== "Enter" && event.key !== " ")) return;
    event.preventDefault();
    openCard(project, cardItem, slip);
  });
  const head = headOfSlip(slip);
  // Dans Taken et Pass : depuis quand la carte y est ; bien plus longtemps que d'ordinaire, elle tranche (ticket 1811).
  if (cardItem.age !== undefined) {
    head.append(setAge(document, cardItem.age));
    if (cardItem.age.longue) slip.dataset.traine = "";
    // Plus d'un essai depuis la première prise : un point par essai, à côté de l'âge (ticket 1895).
    if (cardItem.essais !== undefined) head.append(setTrials(document, cardItem.essais));
  }
  // Prise plus d'une fois : le rang de son essai en clair, « 3rd try », à côté de ses points (ticket 3923).
  if (cardItem.essai !== undefined) head.append(setRankOfTrial(document, cardItem.essai));
  // Tuée deux fois par le même garde-fou : la carte le dit, sous sa tête, tant que la box le dit (ticket 3650).
  if (cardItem.garde !== undefined) head.after(setGuardRepeated(document, cardItem.garde));
  // Un agent y travaille en ce moment : la poêle grésille au bout de sa tête (ticket 2984).
  if (cooked && cardItem.sansCook !== true) head.append(pan(document));
  // Une carte que plus aucun cook ne prendra dit en haut pourquoi, en mots simples (ticket 3147) ; ce que la station en a écrit
  // est derrière « details ». Ses trois gestes sont au pied de la carte.
  if (cardItem.refus === undefined) refusalOfCards.delete(`${project.nom}#${ticket}`);
  else {
    slip.dataset.refus = "";
    const { phrase: sentence, details } = lineOfRefusal(document, cardItem.ligne ?? "", cardItem.refus.brut);
    head.after(...(details === undefined ? [sentence] : [sentence, details]));
  }
  // Un ticket au label `sensitive` (ticket 3224) : sa marque, la première de ses étiquettes.
  const labels = cardItem.sensible === true ? markSensitive(document, setLabels(document, cardItem, withStation)) : setLabels(document, cardItem, withStation);
  if (labels !== null) slip.append(labels);
  // Sur le rail, en attente : sa priorité, sous son numéro
  if (cardItem.prio !== undefined) {
    const prio = block("span", cardItem.prio);
    prio.className = "prio mono";
    slip.append(prio);
  }
  // Sur le rail, en attente d'autres tickets : « after #N », sous sa priorité (carte-attente/)
  const after = brandAfter(document, cardItem.apres);
  if (after !== null) slip.append(after);
  const slipKey = `${project.nom}#${ticket}`;
  // Un ticket que la box ne nomme pas : son titre est lu sur l'issue, une fois. Ce qui n'est pas lu n'est pas écrit.
  if (title === undefined && openable && !titles.has(slipKey)) void readTitle(project, ticket);
  const named = title ?? /** @type {{ titre?: string } | undefined} */ (titles.get(slipKey))?.titre;
  if (named !== undefined) slip.append(block("strong", named));
  // Une question du manager — avant de découper une épique, ou qui parque le ticket pour le chef (`chef-todo`, facts.ts,
  // `question`) : la question qu'on me pose, en une ou deux lignes, et qui l'a posée. Répondue, la carte n'est plus ici mais dans WAITING : une lecture qui la disait
  // répondue est relue, la carte revenue — le manager a posé une autre question.
  const queries = expected && cardItem.question === true;
  if (queries && openable && (!questions.has(slipKey) || staleOne(questions.get(slipKey)))) void readQuestion(project, ticket);
  const readBySlip = queries ? questions.get(slipKey)?.lue : undefined;
  const setThe = readBySlip !== undefined && "question" in readBySlip ? readBySlip.question : undefined;
  if (setThe !== undefined) {
    const resume = block("p", setThe.resume);
    resume.className = "question-courte";
    // Qui l'a posée, et quand, est derrière « details » (ticket 3086) : à première vue, la question seule.
    slip.append(resume, detailsOfCard(document, `asked by ${setThe.auteur}, ${dateHour(setThe.a)}`));
  }
  // Deux lignes au plus : ce qui se passe, et ce qui demande l'attention. Le reste est dans la fiche.
  // Les captures d'un ticket d'interface livré restent sur sa carte : elles se lisent sans un clic. Celles
  // d'une carte de TODO se posent sous sa question.
  if (cardItem.captures !== undefined && cardItem.todo?.captures === undefined) slip.append(...setCaptures(project, ticket, cardItem.captures));
  // Une carte de TODO qui dit ce qui se passe (card-todo.js, son résumé) le dit en tête de sa carte : la phrase
  // du bon ne le redit pas. Répondue — envoyée, ou jouée —, elle ne demande plus de répondre : la phrase se tait aussi.
  const seenOfTodo = expected && cardItem.todo !== undefined ? seenOfTheCard(cardItem.todo, stateOfTheCard(project, ticket, cardItem.todo)).vu : undefined;
  const todoAnswered = seenOfTodo === "attente" || seenOfTodo === "jouee";
  // Le rail d'un projet sur GitHub seul ne donne pas d'activité à la carte (ticket 4076) : tant que son cook travaille, la carte dit
  // ce que sa fiche dit (« writing app/src/slip.ts · 2 min ago »), jamais « no activity yet ».
  const published = activitiesPublished.get(project.nom);
  const cookAtWork = cardItem.repere === true ? cookOfTicket(published, ticket) : undefined;
  const inProgress = cookAtWork === undefined || cookAtWork.finiLe !== null || cookAtWork.maintenant === null || published === undefined || "sans" in published ? undefined : cookAtWork.maintenant;
  const lineOfCard = inProgress === undefined || published === undefined || "sans" in published ? cardItem.ligne : `${actionOfCook(inProgress)} · ${durationOfCook(Date.parse(published.lu) - Date.parse(inProgress.depuis))} ago`;
  if (lineOfCard !== undefined && cardItem.refus === undefined && !(expected && cardItem.todo?.resume !== undefined) && !todoAnswered) {
    const links = cardItem.miseDeCote?.liens ?? cardItem.liens;
    const sentence = links === undefined ? block("p", lineOfCard) : lineWithItsNumbers(project, lineOfCard, links);
    sentence.className = "ligne-carte";
    slip.append(sentence);
  }
  // Une carte parked le dit, dans la colonne où elle attend : qui elle attend, jusqu'à quand (ticket 4238).
  if (cardItem.parque !== undefined) {
    slip.dataset.parque = "";
    slip.append(lineParked(document, cardItem.parque));
  }
  // Une carte qui porte une livraison dit sa PR : son numéro en lien, ses lignes ajoutées et retirées, son âge (ticket 4051).
  if (cardItem.livraisonLue !== undefined) slip.append(setTheDelivery(project, ticket, cardItem.livraisonLue));
  // Prise, sans aucun cook qui la cuise ni attente vivante : la carte le dit (ticket 3884).
  if (cardItem.sansCook === true) {
    const without = block("p", WITHOUT_COOK);
    without.className = "signal";
    without.dataset.sansCook = "";
    slip.append(without);
  }
  // Un cook coincé le dit sur sa carte, faute d'un autre signal (ticket 1456) : sur Cooks, ce qui est coincé et depuis
  // quand se lit en tête, sans ouvrir la fiche.
  const reports = cardItem.signal ?? stuckSays(cardItem);
  if (reports !== undefined) {
    const signal = block("p", reports);
    signal.className = "signal";
    slip.append(signal);
  }
  // En cuisine : un mot au cook, d'une ligne, sans ouvrir sa session (ticket 4048, mot-au-cook/).
  slip.append(...setTheWordAtCook(document, project.nom, cardItem));
  // Une carte de TODO entrée par la porte du runtime : sa question, ses captures, un bouton par choix et
  // un champ pour répondre dans tes mots — tranchée sur la carte même, sans ouvrir sa fiche.
  if (expected && cardItem.todo !== undefined) {
    const question = cardItem.todo.question;
    slip.append(...setTheCardOfTodo(project, ticket, cardItem.todo).map((setOne) => holdInMain(project, ticket, question, slip, setOne)));
  }
  // Une carte du chef lue de GitHub (projet GitHub seul, ticket 2221) : sa question se pose comme toute carte de TODO, juste
  // au-dessus, et se répond sur la carte (ticket 2434). Celle d'une issue sans commentaire marqué n'a rien à quoi répondre :
  // son texte le dit, sous la phrase de sa sorte.
  if (expected && cardItem.chef !== undefined && cardItem.todo === undefined) {
    const ofChef = cardOfAnswer(document, { sorte: cardItem.chef.sorte, source: "github" });
    ofChef.append(detailsOfCard(document, cardItem.chef.texte));
    slip.append(ofChef);
  }
  // Toute autre carte qui t'attend — ni carte de TODO, ni carte mise de côté, qui a la sienne — finit par « ask the second »
  // comme les autres (ticket 3363) : un geste du chef que la carte ne rend pas en carte de TODO se passe au second d'un clic.
  if (expected && cardItem.todo === undefined && cardItem.refus === undefined) {
    const second = requestsAtSecond.get(slipKey);
    slip.append(rowOfSecond(document, ticket, second, () => void askAtSecond(project, ticket, () => brigade.passerAuSecond(project.nom, ticket, null))));
  }
  // La file ne dit pas tout : un repère discret, le détail est dans la fiche.
  if (cardItem.repere === true) {
    const marker = block("small", "…");
    marker.className = "repere";
    marker.title = "some details are not given: the sheet says which";
    slip.append(marker);
  }
  // Livré : la PR mergée s'ouvre d'un clic. Son adresse reste au process principal, comme celle de l'issue.
  if (pr === true) {
    const opens = button("open the merged PR", () => void openPr(project, ticket));
    opens.className = "pr";
    opens.title = `open #${ticket}'s merged PR in the browser`;
    slip.append(opens);
  }
  // Servi, sa PR mergée : « undo » l'annule d'un clic (undo/, ticket 3274) — jamais d'un projet en lecture seule.
  if (pr === true && readOnlyOf(project) === undefined) slip.append(...setCancellation(document, ticket, cancellations.get(slipKey) ?? CANCELLATION_AT_REST, () => void cancelTheServed(project, ticket)));
  if (pr === false) slip.append(block("small", "merged PR: the address the station returned is not https, the app does not open it"));
  if (cardItem.refus !== undefined && readOnlyOf(project) === undefined) slip.append(setTheActionsOfRefusal(project, ticket));
  // En pass ou livrée : « try it » quand le projet dit comment il s'essaie (trial.ts) — sa phrase, sinon.
  if (cardItem.essayable === true) {
    slip.append(
      ...setTheTrial(
        document,
        trialsOfProjects.get(project.nom),
        ticket,
        { essayer: () => void brigade.essayer(project.nom, ticket), arreter: () => void brigade.arreterEssai(project.nom, ticket) },
      ),
    );
  }
  slip.append(...setActionsOfWait(project, cardItem), ...reportTheCard(project, cardItem));
  return slip;
}

// La ligne d'un ticket mis de côté (ticket 2075) : chacun de ses `#N` que la lecture porte s'ouvre d'un clic, sur son issue
// ou sa PR — l'adresse reste au process principal, comme celle du ticket.
/** @param {Project} project @param {string} line @param {number[]} links */
function lineWithItsNumbers(project, line, links) {
  const sentence = document.createElement("p");
  for (const piece of line.split(/(#\d+)/)) {
    const number = /^#\d+$/.test(piece) ? Number(piece.slice(1)) : undefined;
    if (number === undefined || !links.includes(number)) {
      if (piece !== "") sentence.append(piece);
      continue;
    }
    const opens = clickable(piece, () => void openIssue(project, number));
    opens.className = "lien-de-ligne mono";
    opens.title = `open #${number} on GitHub, in the browser`;
    sentence.append(opens);
  }
  return sentence;
}

/**
 * La PR d'une carte en pass ou servie : « PR 71 », lien qui l'ouvre, puis `+135 −21` au vert et au rouge de la palette, puis son âge.
 * Ce que GitHub n'a pas donné n'est pas écrit.
 * @param {Project} project @param {number} ticket @param {import("../facts.ts").DeliveryRead} delivery
 */
function setTheDelivery(project, ticket, delivery) {
  const line = document.createElement("p");
  line.className = "livraison-carte mono";
  const opens = /** @type {HTMLAnchorElement} */ (document.createElement("a"));
  opens.href = delivery.url;
  opens.target = "_blank";
  opens.rel = "noopener";
  opens.textContent = `PR ${delivery.numero}`;
  opens.addEventListener("click", (click) => {
    click.stopPropagation();
    if (brigade.ouvrirLien === undefined) return;
    click.preventDefault();
    void Promise.resolve(brigade.ouvrirLien(project.nom, ticket, delivery.url)).then((opened) => {
      if (opened === false) window.open(delivery.url, "_blank", "noopener");
    });
  });
  line.append(opens);
  if (delivery.lignes !== undefined) {
    const added = block("span", `+${delivery.lignes.ajoutees}`);
    added.className = "lignes-ajoutees";
    const removed = block("span", `\u2212${delivery.lignes.retirees}`);
    removed.className = "lignes-retirees";
    line.append(" ", added, " ", removed);
  }
  if (delivery.age !== undefined) {
    const age = block("span", delivery.age);
    age.className = "age-de-la-pr";
    line.append(" ", age);
  }
  return line;
}

// Les trois gestes d'une carte mise de côté (ticket 3147) : « Relaunch » et « Close as already done » partent sur l'issue
// (actions-refusal.ts) et la carte est relue ; « Ask the second » passe la carte au second, comme toute carte.
/** @param {Project} project @param {number} ticket */
function setTheActionsOfRefusal(project, ticket) {
  const key = `${project.nom}#${ticket}`;
  return rowOfRefusal(
    document,
    ticket,
    refusalOfCards.get(key),
    {
      jouer: (id) => void playTheRefusal(project, ticket, id),
      demander: () => void askAtSecond(project, ticket, () => brigade.passerAuSecond(project.nom, ticket, null)),
    },
    requestsAtSecond.get(key),
  );
}

/** @param {Project} project @param {number} ticket @param {"relancer" | "clore"} id */
async function playTheRefusal(project, ticket, id) {
  const key = `${project.nom}#${ticket}`;
  if (refusalOfCards.get(key) !== undefined && "envoi" in /** @type {object} */ (refusalOfCards.get(key))) return;
  refusalOfCards.set(key, { envoi: id });
  setRail(project);
  /** @type {{ envoi: "relancer" | "clore" } | { refus: string } | undefined} */
  let said;
  try {
    const rendered = await brigade.refus(project.nom, id, ticket);
    if ("fait" in rendered) readTheFacts();
    else said = { refus: "refus" in rendered ? rendered.refus : "nothing was changed" };
  } catch (error) {
    said = { refus: `nothing was changed: ${error instanceof Error ? error.message : String(error)}` };
  }
  if (said === undefined) refusalOfCards.delete(key);
  else refusalOfCards.set(key, said);
  setRail(project);
}

// Une carte en panne porte « report to brigade » (ticket 1977) : mise de côté (86), ou remontée parce que la pass n'a
// pas pu la juger — une raison de brigade, pas du code livré. Une livraison rouge, elle, est l'affaire du projet.
/** @param {Project} project @param {import("../facts.ts").Card} cardItem */
function reportTheCard(project, cardItem) {
  const { ticket, etat: state, decision } = cardItem;
  const notJudged = decision?.quoi === "remontee" && decision.motif === "unjudged";
  if (state !== "86" && !notJudged) return [];
  const said = [notJudged ? "the pass could not judge it" : "set aside", cardItem.ligne ?? "", cardItem.signal ?? ""].filter((piece) => piece !== "").join(" — ");
  return report.poser({ projet: project.nom, reference: { ticket }, panne: `${project.nom}, ticket ${ticket}: ${said}` });
}

// Les gestes de WAITING d'une carte (facts.ts, `gestes`), sur la carte et sur sa fiche (vue/wait/) : sur une carte de
// TODO, « waiting for… », qui ouvre son formulaire — ce qu'elle attend, dans les mots du chef ; de qui ; le jour de la
// relance, proposé à sept jours ; validé, le geste part, et la carte passe dans WAITING à la lecture qui le voit. Sur une
// carte de WAITING, « resume » et « it arrived, back to the kitchen » : chacun part au clic. Ce qui part se décide dans
// le process principal (wait.ts, vue/wait/wait-github.ts), et « it arrived » dit dessous ce qu'il en est advenu.
/** @param {Project} project @param {import("../facts.ts").Card} cardItem */
function setActionsOfWait(project, cardItem) {
  // En lecture seule (ticket 3163), rien ne met une carte en WAITING ni ne l'en sort.
  if (readOnlyOf(project) !== undefined) return [];
  const { ticket, gestes: actions } = cardItem;
  const key = `${project.nom}#${ticket}`;
  // Une carte sortie de WAITING n'a plus à dire ce qu'est devenu son « it arrived ».
  if (!actions?.includes("attente-arrivee")) arrivalsOfCards.delete(key);
  const itsOwn = ACTIONS_OF_WAIT.filter(({ id }) => actions?.includes(/** @type {never} */ (id)));
  // Le rail et la fiche ouverte de ce ticket montrent le même état.
  const redraw = () => {
    setRail(project);
    if (cardOf(project, ticket)) renderCard();
  };
  return setTheActionsOfWait(
    document,
    { ticket, cle: key, siens: itsOwn, ouvert: formsOfWait.get(key), arrivee: arrivalsOfCards.get(key) },
    {
      cliquer: (id) => {
        if (id === "attente-arrivee") return void arrive(project, ticket);
        if (id !== "attente-poser") return void writeWait(project, id, ticket);
        formsOfWait.set(key, { quoi: "", qui: "", relance: relaunchProposed(new Date()) });
        redraw();
      },
      valider: () => {
        const opened = formsOfWait.get(key);
        if (opened !== undefined) void writeWait(project, "attente-poser", ticket, { quoi: opened.quoi, qui: opened.qui, relance: opened.relance });
      },
      renoncer: () => {
        formsOfWait.delete(key);
        redraw();
      },
    },
  );
}

// « It arrived, back to the kitchen » déparque le ticket sur son issue (actions-github.ts, `deparquer`), jamais par une
// commande de la box : la carte dit qu'il est en route, puis qu'il est fait — l'issue au survol — et le rail est relu ;
// refusé, rien n'est parti, et la carte dit pourquoi en une ligne, le détail au survol.
/** @param {Project} project @param {number} ticket */
async function arrive(project, ticket) {
  const key = `${project.nom}#${ticket}`;
  const before = arrivalsOfCards.get(key);
  if (before !== undefined && "envoi" in before) return;
  notWritten = notWrittenSecond = "";
  arrivalsOfCards.set(key, { envoi: true });
  setRail(project);
  if (cardOf(project, ticket)) renderCard();
  /** @type {{ fait: string, detail: string } | { refus: string, detail: string }} */
  let saidOne;
  try {
    const rendered = await brigade.attente(project.nom, "attente-arrivee", ticket);
    saidOne =
      rendered !== undefined && rendered !== null && "fait" in rendered
        ? { fait: rendered.fait, detail: rendered.detail ?? "" }
        : rendered !== undefined && rendered !== null && "refus" in rendered
          ? { refus: rendered.refus, detail: ("detail" in rendered ? rendered.detail : undefined) ?? "" }
          : { refus: WITHOUT_SEND, detail: WITHOUT_BRIDGE };
  } catch (error) {
    saidOne = { refus: WITHOUT_SEND, detail: error instanceof Error ? error.message : String(error) };
  }
  arrivalsOfCards.set(key, saidOne);
  if ("fait" in saidOne) readTheFacts();
  setRail(project);
  if (cardOf(project, ticket)) renderCard();
}

// Park et unpark depuis le TODO du chef (parked/, ticket 4281) : un seul geste pour tout projet, par le geste d'attente du
// pont, qui l'écrit sur l'issue ; parti, la cuisine est relue.
const parkByTheBridge = parkGesture((project, id, ticket, input) => brigade.attente(project, id, ticket, input), { lire: () => readTheFacts() });

// Un geste de WAITING s'écrit sur l'issue (vue/wait/wait-github.ts), jamais par une commande de la box (ticket 4262).
// Parti, le formulaire se referme ; refusé, il reste, et dit pourquoi.
/** @param {Project} project @param {string} id @param {number} ticket @param {{ quoi: string, qui: string, relance: string }} [input] */
async function writeWait(project, id, ticket, input) {
  const key = `${project.nom}#${ticket}`;
  notWritten = notWrittenSecond = "";
  actionRate = undefined;
  /** @type {string | undefined} */
  let refusal;
  /** @type {{ fait: string, detail: string } | undefined} */
  let done;
  try {
    const rendered = await brigade.attente(project.nom, id, ticket, input);
    if (rendered !== undefined && "refus" in rendered) refusal = rendered.refus;
    // Écrit sur GitHub (vue/wait/wait-github.ts) : la lecture suivante montre la carte dans sa colonne.
    else if (rendered !== undefined && "fait" in rendered) {
      done = { fait: rendered.fait, detail: rendered.detail ?? "" };
      readTheFacts();
    }
  } catch (error) {
    refusal = `nothing sent: ${error instanceof Error ? error.message : String(error)}`;
  }
  const opened = formsOfWait.get(key);
  if (input !== undefined && opened !== undefined && refusal !== undefined) opened.refus = refusal;
  else if (input !== undefined) formsOfWait.delete(key);
  if (refusal !== undefined && input === undefined) notWrittenSecond = refusal;
  // « resume » : la carte dit dessous ce qu'il en est, comme pour « it arrived ».
  if (input === undefined && (refusal !== undefined || done !== undefined)) arrivalsOfCards.set(key, done ?? { refus: refusal ?? "", detail: "" });
  setRail(project);
  show();
  if (cardOf(project, ticket)) renderCard();
}

// Ce qui a été livré, sur une carte de Livré : le résumé de la relecture en entier, dans ses mots
// — rien n'est coupé ni reformulé —, puis ses constats sous leur nombre, qu'un clic déplie : le
// fichier que chacun nomme, et son texte tel que le reviewer l'a écrit. Sans relecture, ce que
// l'app n'écrit rien : une relecture pas donnée n'est pas un texte de remplissage sur la carte.
/** @param {Project} project @param {number} ticket @param {import("../facts.ts").Delivery} delivery */
function renderDelivery(project, ticket, delivery) {
  if ("sans" in delivery) return [];
  const resume = block("p", delivery.resume);
  resume.className = "livraison";
  resume.title = `ce que la relecture dit de ce qui a été livré pour #${ticket}, mot pour mot`;
  if (delivery.constats.length === 0) {
    const no = block("small", delivery.remarques);
    no.className = "remarques";
    return [resume, no];
  }
  const key = `${project.nom}#${ticket}`;
  const remarks = document.createElement("details");
  remarks.className = "remarques";
  remarks.open = remarksUnfolded.has(key);
  remarks.addEventListener("toggle", () => void (remarks.open ? remarksUnfolded.add(key) : remarksUnfolded.delete(key)));
  const list = document.createElement("ol");
  list.append(
    ...delivery.constats.map(({ gravite, fichier: file, constat: finding }) => {
      const pose = document.createElement("li");
      if (gravite !== "remarque") pose.append(block("strong", gravite));
      if (file !== null) pose.append(exact("code", file));
      pose.append(block("span", finding));
      return pose;
    }),
  );
  remarks.append(block("summary", delivery.remarques), list);
  return [resume, remarks];
}

// Les captures d'un ticket d'interface, sur sa carte (captures.ts) : chaque écran avant et après, côte à
// côte, chacun sous sa légende — lues dès que la carte se pose, sans un clic. Une capture que la
// livraison ne porte pas le dit à sa place ; une livraison qui ne les porte pas toutes le dit en tête, en
// une ligne, où les poser au survol. Un clic sur une image ouvre la fiche, comme le reste de la carte.
/** @param {Project} project @param {number} ticket @param {import("../captures.ts").CapturesOfCard} captures */
function setCaptures(project, ticket, { ecrans: screens, incomplete }) {
  const poses = [];
  if (incomplete !== undefined) {
    const line = block("p", incomplete.ligne);
    line.className = "captures-manquantes";
    line.title = incomplete.detail;
    poses.push(line);
  }
  for (const { ecran: screen, avant: before, apres: after } of screens) {
    const pair = document.createElement("div");
    pair.className = "captures";
    pair.append(...[before, after].map((capture) => setCapture(project, ticket, screen, capture)));
    poses.push(pair);
  }
  return poses;
}

/** @param {Project} project @param {number} ticket @param {string} screen @param {import("../captures.ts").Capture} capture */
function setCapture(project, ticket, screen, capture) {
  const figure = document.createElement("figure");
  figure.dataset.moment = capture.moment;
  const title = document.createElement("figcaption");
  title.textContent = capture.legende;
  figure.append(setImage(project, ticket, screen, capture), title);
  return figure;
}

// L'image d'une capture, lue une fois par le process principal — ou sa place, qui dit qu'elle manque, se lit ou ne se lit pas.
/** @param {Project} project @param {number} ticket @param {string} screen @param {import("../captures.ts").Capture} capture */
function setImage(project, ticket, screen, { moment, legende: legend, livree: delivered, version }) {
  const key = `${project.nom}#${ticket}:${screen}:${moment}@${version}`;
  if (delivered && !capturesRead.has(key)) void readCapture(project, ticket, screen, moment, key);
  const readEntry = delivered ? capturesRead.get(key) : undefined;
  if (readEntry !== undefined && "image" in readEntry) {
    const image = /** @type {HTMLImageElement} */ (document.createElement("img"));
    image.src = readEntry.image;
    image.alt = legend;
    image.draggable = false;
    return image;
  }
  const place = block("span", !delivered ? "missing" : readEntry === undefined ? "loading…" : "not available");
  place.className = "place";
  if (readEntry === undefined || !("sans" in readEntry)) return place;
  // Une capture qui ne se lit pas dit pourquoi en une ligne, et donne le fichier à ouvrir sur GitHub — jamais un « not available » seul.
  place.title = readEntry.sans;
  const lines = readEntry.sans.split("\n").map((line) => line.trim()).filter((line) => line !== "");
  const reason = (lines.find((line) => !line.startsWith("$ ") && !line.startsWith("→")) ?? lines[0] ?? "").slice(0, 140);
  place.textContent = `not available — ${reason}`;
  const link = readEntry.lien;
  if (link !== undefined) {
    const opens = /** @type {HTMLAnchorElement} */ (document.createElement("a"));
    opens.href = link;
    opens.target = "_blank";
    opens.rel = "noopener";
    opens.textContent = "open the file on GitHub";
    // Un clic ne remonte pas à la carte, qui s'ouvrirait en grand : il ouvre le fichier, par le process principal quand il y en a un.
    opens.addEventListener("click", (click) => {
      click.stopPropagation();
      if (brigade.ouvrirLien === undefined) return;
      click.preventDefault();
      // Refusé par le process principal, le lien s'ouvre par la navigation de la page plutôt que de rester mort.
      void Promise.resolve(brigade.ouvrirLien(project.nom, ticket, link)).then((opened) => {
        if (opened === false) window.open(link, "_blank", "noopener");
      });
    });
    place.append(" ", opens);
  }
  return place;
}

/** @param {Project} project @param {number} ticket @param {string} screen @param {"avant" | "apres"} moment @param {string} key */
async function readCapture(project, ticket, screen, moment, key) {
  capturesRead.set(key, undefined);
  try {
    capturesRead.set(key, (await brigade.lireCapture(project.nom, ticket, screen, moment)) ?? { sans: "the app has nothing to read" });
  } catch (error) {
    capturesRead.set(key, { sans: error instanceof Error ? error.message : String(error) });
  }
  if (current?.nom === project.nom && !rail.hidden && heldOnes.has(project.nom)) setRail(current);
  // Une carte ouverte depuis la liste du téléphone pose ses captures aussi (ticket 3185), et son détail en grand (ticket 3212).
  if (vueOfCards.vu === "carte" && vueOfCards.carte.projet === project.nom && vueOfCards.carte.ticket === ticket) setTheCardsOfChef();
  if (detailOpen?.projet === project.nom && detailOpen.ticket === ticket) setTheDetail();
}

// La fiche d'un ticket, par-dessus le rail : pour l'instant son en-tête — son numéro, son titre
// entier, sa priorité, son issue et sa PR —, chaque ligne telle que la box l'a donnée ou, en
// italique, pourquoi elle ne l'a pas (card.ts) : rien n'est deviné, rien n'est laissé vide. Les
// adresses restent au process principal : un lien nomme le projet et le ticket, comme le numéro
// d'une carte. Sur la fiche d'un ticket qui t'attend, la demande au second, en un clic. Le rail
// reste dessous, tel quel — rien de lui ne se clique au travers — ; la fermer, par son bouton ou
// Échap, le rend où il était, défilé où il l'était.
/** @param {Project} project @param {import("../facts.ts").Card} cardItem @param {HTMLElement} back */
function openCard(project, cardItem, back) {
  // Ce que l'issue pose se relit à chaque ouverture : on a pu y répondre, ou le manager reposer.
  questions.delete(`${project.nom}#${cardItem.ticket}`);
  stories.delete(`${project.nom}#${cardItem.ticket}`);
  situations.delete(`${project.nom}#${cardItem.ticket}`);
  cardsActions.delete(`${project.nom}#${cardItem.ticket}`);
  cardRefusals.delete(`${project.nom}#${cardItem.ticket}`);
  issuesOfCards.delete(`${project.nom}#${cardItem.ticket}`);
  cardConfirmations.delete(`${project.nom}#${cardItem.ticket}`);
  discussions.delete(`${project.nom}#${cardItem.ticket}`);
  sendsOfComment.delete(`${project.nom}#${cardItem.ticket}`);
  requestsAtSecond.delete(`${project.nom}#${cardItem.ticket}`);
  void readStory(project, cardItem);
  openOne = { projet: project, carte: cardItem, retour: back };
  void readDiscussion(project, cardItem.ticket);
  void readActions(project, cardItem);
  renderCard();
  card.focus();
}

function closeCard() {
  const back = openOne?.retour;
  openOne = undefined;
  renderCard();
  if (back !== undefined && rail.contains(back)) back.focus();
}

// Une nouvelle lecture redessine le rail : la fiche ouverte prend ce qu'elle dit de son ticket — la
// même carte, celle de la même colonne s'il en a deux. Un ticket que la lecture ne porte plus garde
// sa fiche telle qu'elle était ; une fiche qui n'a pas changé n'est pas reposée, et garde le clavier.
/** @param {import("../facts.ts").Card[]} cards @param {Map<import("../facts.ts").Card, HTMLElement>} setEntries */
function followCard(cards, setEntries) {
  if (openOne === undefined) return;
  const { carte: before } = openOne;
  const itsOwn = cards.filter(({ ticket }) => ticket === before.ticket);
  const fresh = itsOwn.find(({ attendu: expected, livraison: delivery }) => expected === before.attendu && (delivery === undefined) === (before.livraison === undefined)) ?? itsOwn[0];
  if (fresh === undefined) return;
  openOne.retour = setEntries.get(fresh) ?? openOne.retour;
  openOne.carte = fresh;
  /** @param {import("../facts.ts").Card} setOne */
  const said = (setOne) => JSON.stringify([setOne.fiche, setOne.attend.length > 0, /** @type {{ tests?: unknown }} */ (setOne).tests]);
  // Ce qui décide de ses gestes a changé — un geste vient d'agir, ou la cuisine l'a pris : ils sont relus.
  /** @param {import("../facts.ts").Card} setOne */
  const decide = (setOne) => JSON.stringify([setOne.etat, setOne.ouvrable, setOne.attendu, setOne.decision, setOne.pr]);
  if (decide(fresh) !== decide(before)) void readActions(openOne.projet, fresh);
  if (said(fresh) !== said(before)) renderCard();
}

// Ce que la file dit du ticket, et que la carte ne porte plus : qui le tient, depuis quand, son bail,
// ce qu'il brûle, ce qui le bloque. Ce qu'elle ne dit pas n'est pas écrit, et la ligne brute de
// `status` n'est nulle part sur la fiche. Pour un
// ticket livré, ce qui a été livré.
/** @param {Project} project @param {import("../facts.ts").Card} cardItem */
function renderCardDetails(project, cardItem) {
  const { ticket, livraison: delivery, dit: said, moteur: engine } = cardItem;
  const pose = [];
  // Rien n'est dit deux fois : « right now » est dans sa section, et la station où il cuit s'ajoute à qui le tient.
  const cooked = said.find(({ libelle: wording }) => wording === "cooks on");
  const saidOnes = said
    .filter(({ libelle: wording }) => wording !== "right now" && wording !== "cooks on")
    .map((done) => (done.libelle === "taken by" && cooked !== undefined ? { ...done, valeur: `${done.valeur} · ${cooked.valeur}` } : done));
  if (saidOnes.length > 0) {
    const carried = document.createElement("ul");
    carried.className = "porte";
    carried.append(
      ...saidOnes.map(({ libelle: wording, valeur: value, exact: recopie }) => {
        const done = document.createElement("li");
        done.append(block("span", wording), recopie ? exact("strong", value) : block("strong", value));
        return done;
      }),
    );
    pose.push(carried);
  }
  if (delivery !== undefined) pose.push(setEngine(document, engine ?? WITHOUT_ENGINE), ...renderDelivery(project, ticket, delivery));
  if (pose.length === 0) return [];
  const details = document.createElement("section");
  details.className = "details";
  details.ariaLabel = `what the queue says about #${ticket}`;
  details.append(...pose);
  return [details];
}

const issuesOpen = new Set();

function renderCard() {
  card.hidden = openOne === undefined;
  rail.inert = !content.hidden || !card.hidden;
  if (openOne === undefined) return card.replaceChildren();
  const { projet: project, carte: cardItem } = openOne;
  const { ticket, attend: awaiting } = cardItem;
  const { titre: title, priorite: priority, issue, pr, attendu: expected, tete: deliveryHead } = cardItem.fiche;
  const close = button("close", closeCard, "discret");
  close.className = "fermer";
  close.title = "close the sheet (Esc): the rail is back as you left it";
  const head = document.createElement("header");
  head.append(exact("span", `#${ticket}`), close);
  /** @param {import("../card.ts").Line} line */
  const saidOne = (line) => {
    if ("sans" in line) {
      return lineEmpty(document, line.sans, { classe: "sans", balise: "dd" });
    }
    return line.exact === true ? exact("dd", line.valeur) : block("dd", line.valeur);
  };
  /** @param {string} wording @param {HTMLElement} value */
  const rank = (wording, value) => {
    const pose = document.createElement("div");
    pose.append(block("dt", wording), value);
    return pose;
  };
  const lines = document.createElement("dl");
  // La priorité se lit et se change dans la barre des gestes, quand elle y est : une seule fois.
  const proposes = cardsActions.get(`${project.nom}#${ticket}`);
  const changeable = Array.isArray(proposes) && proposes.some(({ id }) => id === "priorite");
  lines.append(
    ...(changeable ? [] : [rank("priority", saidOne(priority))]),
    // L'issue et la PR qui s'ouvrent sont des gestes, posés plus bas avec leur prix ; ici, seulement
    // ce qui ne s'ouvre pas, et pourquoi. Une PR que la box ne donne pas (ticket pas servi) n'a pas de
    // ligne : ce qui n'existe pas encore n'est pas affiché.
    ...(issue === true ? [] : [rank("issue", saidOne(issue))]),
    ...(pr === undefined || pr === true ? [] : [rank("PR", saidOne(pr))]),
  );
  // Le titre que la box ne donne pas est celui que l'issue porte, lu par le poste ; à défaut, aucune ligne.
  const readOne = /** @type {{ titre?: string } | undefined} */ (titles.get(`${project.nom}#${ticket}`));
  const named = "valeur" in title ? block("h3", title.valeur) : readOne?.titre === undefined ? undefined : block("h3", readOne.titre);
  card.ariaLabel = `the sheet of #${ticket}`;
  // Le popup : un panneau de lecture, posé sur un voile qui laisse voir le rail, atténué.
  const panel = document.createElement("div");
  panel.className = "panneau";
  // Ce qu'on attend de toi, en tête, en une phrase : jamais la ligne de la file.
  // Une livraison qui attend son merge : deux lignes — ce qu'elle fait, pourquoi elle attend —, puis
  // ses juges, un fichier par ligne avec ses lignes ajoutées et retirées.
  const judges = document.createElement("ul");
  judges.className = "juges";
  for (const { fichier: file, ajoutees: added, retirees: removed } of deliveryHead?.juges ?? []) {
    const line = document.createElement("li");
    line.append(exact("code", file), ` +${added} −${removed}`);
    judges.append(line);
  }
  const wait =
    deliveryHead !== undefined
      ? [
          ...(deliveryHead.fait === undefined ? [] : [Object.assign(block("p", deliveryHead.fait), { className: "fait" })]),
          Object.assign(block("p", deliveryHead.pourquoi), { className: "attendu" }),
          ...((deliveryHead.juges.length > 0) ? [judges] : []),
        ]
      : expected === undefined
        ? []
        : [Object.assign(block("p", expected), { className: "attendu" })];
  // Son cook, tel que sa station le publie (ticket 1846) : ce qu'il fait, ses derniers gestes, sa fin et sa PR. Posé, il
  // dit ce qu'il fait en ce moment : l'histoire ne le redit pas.
  const cook = setTheActivityOfCook(document, { publiees: activitiesPublished.get(project.nom), ticket, pastille: pill, ouvrirPr: () => void openPrOfCook(project, ticket) });
  // Dans l'ordre où le chef lit : ce qu'est le ticket, où il en est, ce qu'on attend de lui, ce qu'il peut
  // faire, l'issue (repliée) — puis seulement ce que la cuisine en dit.
  // Les gestes de WAITING de sa carte, sur la fiche aussi (vue/wait/) : « waiting for… » sur une carte de TODO, « resume » et
  // « it arrived » sur une carte de WAITING.
  panel.append(head, ...wait, ...(named === undefined ? [] : [named]), ...(lines.children.length > 0 ? [lines] : []), ...setActionsOfWait(project, cardItem), ...renderCardDetails(project, cardItem), ...setTestsOfCard(document, /** @type {{ tests?: unknown }} */ (cardItem).tests));
  const suite = [...(cook === null ? [] : [cook]), ...setStory(project, ticket, cardItem, cook !== null)];
  card.replaceChildren(panel);
  // Un ticket qui t'attend : la question que son issue pose, s'il en pose une — lue à l'ouverture.
  // Répondue, sa carte attend le manager dans WAITING : la fiche la garde, et ce qui y a été répondu.
  // Puis, pour tout ticket, ses gestes — la demande au second en est. Rien n'est envoyé sans un clic.
  if (awaiting.length > 0 || cardItem.repondue !== undefined) {
    const key = `${project.nom}#${ticket}`;
    if (!questions.has(key)) void readQuestion(project, ticket);
    const question = setQuestion(project, ticket, questions.get(key) ?? {});
    if (question !== undefined) panel.append(question);
  }
  panel.append(renderCardActions(project, cardItem), ...diagramOfCard(project, ticket), folded(project, ticket), ...suite);
}

// Le diagramme que le corps de l'issue porte, au-dessus d'elle, dépliée ou non ; rien tant qu'elle n'est pas lue.
/** @param {Project} project @param {number} ticket */
function diagramOfCard(project, ticket) {
  const readEntry = discussions.get(`${project.nom}#${ticket}`);
  const body = readEntry === undefined || "sans" in readEntry ? undefined : readEntry.messages.find((message) => message.corps === true)?.source;
  return diagramHeld(document, diagrams, `${project.nom}#${ticket}`, body, renderCard, renderWithMermaid(document));
}

// L'issue et sa discussion, repliées d'un clic sous les gestes ; ouvertes, elles le restent quand la fiche est reposée.
/** @param {Project} project @param {number} ticket */
function folded(project, ticket) {
  const key = `${project.nom}#${ticket}`;
  const fold = document.createElement("details");
  fold.className = "issue-repliee";
  fold.open = issuesOpen.has(key);
  fold.addEventListener("toggle", () => void (fold.open ? issuesOpen.add(key) : issuesOpen.delete(key)));
  fold.append(block("summary", "the issue and its discussion"), setDiscussion(project, ticket));
  return fold;
}

// Les gestes de la fiche : ceux qu'il est possible de faire sur ce ticket à cet instant, et seulement
// ceux-là — ce qu'on attend de toi d'abord, le recommandé en tête, puis la table du chef, selon son
// état, et ce qui est branché (card-actions.ts) —, un bouton chacun. Un prix nul n'est dit nulle part ;
// un prix se lit au survol du bouton, et un clic sur un geste qui coûte demande d'abord de le
// confirmer, prix dit en une ligne. Ce que fait un clic se lit à droite, dans le second ; ce qui ne
// part pas se dit sous la liste. Le rail et la fiche suivent la lecture suivante de la box.
/** @param {Project} project @param {import("../facts.ts").Card} cardItem */
function renderCardActions(project, cardItem) {
  const readEntry = cardItem.fiche.priorite;
  const priorityCurrent = "valeur" in readEntry ? /^prio:([0-9])$/.exec(readEntry.valeur)?.[1] : undefined;
  const { ticket } = cardItem;
  const key = `${project.nom}#${ticket}`;
  const section = document.createElement("section");
  section.className = "gestes-fiche";
  section.ariaLabel = `what you can do on #${ticket}`;
  const proposes = cardsActions.get(key);
  if (proposes === undefined) {
    section.append(block("p", READ_OF("what can be done")));
    return section;
  }
  if ("sans" in proposes) {
    section.append(lineError(document, NOT_REACHED("actions"), proposes.sans));
    return section;
  }
  const issue = issuesOfCards.get(key);
  const list = document.createElement("ul");
  // En lecture seule (ticket 3163), la fiche ne garde que ce qui ouvre ou demande au second : rien qui écrive sur l'issue.
  const only = readOnlyOf(project) !== undefined;
  for (const suggests of only ? proposes.filter(({ id }) => ACTIONS_OF_CARD_WITHOUT_WRITING.has(id)) : proposes) {
    const line = document.createElement("li");
    line.dataset.geste = suggests.id;
    line.append(...renderCardAction(project, ticket, suggests, issue !== undefined && "envoi" in issue, priorityCurrent));
    list.append(line);
  }
  section.append(list);
  const queued = proposes.find(({ id }) => id === cardConfirmations.get(key));
  if (queued !== undefined) {
    const giveUp = () => {
      cardConfirmations.delete(key);
      if (cardOf(project, ticket)) renderCard();
    };
    const confirm = () => {
      cardConfirmations.delete(key);
      void playCardAction(project, ticket, queued.id);
    };
    section.append(confirmationOfAction(document, { titre: `${queued.libelle} — #${ticket}?`, prix: queued.prix, oui: YES(queued.libelle), non: CANCEL }, { oui: confirm, non: giveUp }));
  }
  const refusal = cardRefusals.get(key);
  if (refusal !== undefined) {
    section.append(lineError(document, refusal.dit, refusal.detail, { classe: "refus" }));
  }
  // Ce qui est parti : en route, fait — ce que la station a répondu au survol —, ou écrit dans le second.
  if (issue !== undefined) {
    const said = block("p", "envoi" in issue ? `${issue.envoi}: sent, waiting for the answer…` : "fait" in issue ? issue.fait : "sent to the second: its answer is in the Second tab");
    said.className = "dit";
    said.ariaLive = "polite";
    if ("fait" in issue && issue.detail !== "") said.title = issue.detail;
    section.append(said);
  }
  return section;
}

// Les gestes de la fiche qui n'écrivent rien sur GitHub (card-actions.ts) : ouvrir l'issue, la PR, la page, ou demander au
// second. Ce sont les seuls d'un projet en lecture seule (ticket 3163).
const ACTIONS_OF_CARD_WITHOUT_WRITING = new Set(["issue", "pr", "second", "navigateur"]);

// Ce qu'un geste de la fiche pose : son bouton — recommandé s'il l'est, son prix au survol — et,
// pour la priorité, de quoi la choisir avant. `occupe` : un geste de la fiche attend sa réponse — aucun ne part.
/** @param {Project} project @param {number} ticket @param {import("../card-actions.ts").Proposes} suggests @param {boolean} busy @param {string} [currentOne] la priorité du ticket, `1` à `9` @returns {HTMLElement[]} */
function renderCardAction(project, ticket, suggests, busy, currentOne) {
  const { id, libelle: wording, prix: price, recommande: recommended, valeurs: values } = suggests;
  const key = `${project.nom}#${ticket}`;
  /** @param {() => void} gesture @param {string} [help] */
  const action = (gesture, help) => {
    const pose = buttonAction(document, wording, gesture, { recommande: recommended === true, prix: price });
    if (help !== undefined) pose.children[0].title = help;
    if (busy) pose.children[0].disabled = true;
    return pose;
  };
  switch (id) {
    case "issue":
      return [action(() => void openIssue(project, ticket), `open issue #${ticket} in the browser`)];
    case "pr":
      return [action(() => void openPr(project, ticket), `open #${ticket}'s merged PR in the browser`)];
    case "second": {
      const request = action(() => void ask(ticket), `write into the second a request about #${ticket} — nothing is sent: you press Enter`);
      const target = request.children[0];
      target.className = recommended === true ? "recommande demander" : "demander";
      target.dataset.geste = "demande";
      return [request];
    }
    default: {
      // Un geste qui coûte se confirme d'abord : le clic pose la confirmation, prix dit, sous les gestes.
      const play = () => {
        if (price === null) return void playCardAction(project, ticket, id);
        cardConfirmations.set(key, id);
        cardRefusals.delete(key);
        issuesOfCards.delete(key);
        if (cardOf(project, ticket)) renderCard();
      };
      if (values === undefined) return [action(play)];
      // La priorité se change d'un geste : choisir une valeur la joue, sans second bouton.
      const choice = /** @type {HTMLSelectElement} */ (document.createElement("select"));
      choice.ariaLabel = wording;
      choice.className = "priorite";
      choice.title = `${wording} — choosing a value changes the \`prio:\` label of issue #${ticket}`;
      choice.append(...values.map((value) => new Option(`priority ${value}`, value)));
      choice.value = currentOne ?? "none";
      choice.disabled = busy;
      choice.addEventListener("change", () => void playCardAction(project, ticket, id, choice.value));
      return [choice];
    }
  }
}

// Les gestes de la fiche de cette carte, demandés au process principal. Une réponse qui n'est plus
// celle de la carte ouverte — la lecture l'a changée entre-temps — ne se pose pas.
/** @param {Project} project @param {import("../facts.ts").Card} cardItem */
async function readActions(project, cardItem) {
  const { ticket, etat: state, ouvrable: openable, attendu: expected, decision, pr } = cardItem;
  /** @type {import("../card-actions.ts").Proposes[] | { sans: string }} */
  let readOnes;
  try {
    readOnes = (await brigade.gestesDeFiche({ ticket, ...(state === undefined ? {} : { etat: state }), ouvrable: openable, attendu: expected, ...(decision === undefined ? {} : { decision }), ...(pr === undefined ? {} : { pr }) })) ?? [];
  } catch (error) {
    readOnes = { sans: `what can be done was not read: ${error instanceof Error ? error.message : String(error)}` };
  }
  if (!cardOf(project, ticket) || openOne?.carte !== cardItem) return;
  cardsActions.set(`${project.nom}#${ticket}`, readOnes);
  renderCard();
}

// Un geste de la fiche que la vue ne joue pas : une action de box, qui part dans le second. Le
// second se montre à droite ; ce qui n'est pas parti se dit sur la fiche, sous ses gestes.
// Changer la priorité ne passe pas par la box : le process principal change le label `prio:` de
// l'issue sur GitHub (priority.ts) — fait, la fiche le dit et le rail redessiné montre la nouvelle
// priorité ; en échec, rien n'a changé, la ligne le dit et son détail est au survol.
// Sur le téléphone (ticket 1164), il n'y a pas de second où l'écrire : le pont joue l'action sur la station et rend ce
// qu'elle a fait, comme le bouton d'une station sur Cooks — dit sur la fiche, et la box relue tout de suite : la carte
// quitte la file à la lecture qui suit. Tant que la réponse n'est pas là, les gestes de la fiche attendent ; refusé,
// rien n'a changé, et la file non plus.
/** @param {Project} project @param {number} ticket @param {string} id @param {string} [value] */
async function playCardAction(project, ticket, id, value) {
  const key = `${project.nom}#${ticket}`;
  const before = issuesOfCards.get(key);
  if (before !== undefined && "envoi" in before) return;
  notWritten = notWrittenSecond = "";
  actionRate = undefined;
  cardRefusals.delete(key);
  const proposes = cardsActions.get(key);
  issuesOfCards.set(key, { envoi: (Array.isArray(proposes) ? proposes.find((suggests) => suggests.id === id)?.libelle : undefined) ?? id });
  if (cardOf(project, ticket)) renderCard();
  try {
    const rendered = await brigade.gesteDeFiche(project.nom, id, ticket, value);
    issuesOfCards.delete(key);
    // Un pont qui ne porte pas l'action ne rend rien : rien n'est parti, et la fiche le dit.
    if (rendered === undefined || rendered === null) cardRefusals.set(key, { dit: WITHOUT_SEND, detail: WITHOUT_BRIDGE });
    else if ("refus" in rendered) cardRefusals.set(key, { dit: rendered.refus, detail: rendered.detail ?? "" });
    else if ("fait" in rendered) {
      issuesOfCards.set(key, { fait: rendered.fait, detail: rendered.detail ?? "" });
      if (id === "priorite") prioritiesChosen.delete(key);
      readTheFacts();
    } else {
      keep(project.nom, rendered);
      if (narrow()) issuesOfCards.set(key, { second: true });
      if (id === "priorite") prioritiesChosen.delete(key);
    }
  } catch (error) {
    issuesOfCards.delete(key);
    cardRefusals.set(key, { dit: WITHOUT_SEND, detail: error instanceof Error ? error.message : String(error) });
  }
  if (cardOf(project, ticket)) renderCard();
  show();
}
// Ce que la fiche dit de la vie du ticket : ce que son cook fait en ce moment ou ce qui le bloque,
// puis son histoire — chaque étape avec son heure, la relecture en vert ou rouge avec son résumé —
// et son coût. Rien n'est posé qui n'a pas eu lieu ; ce que la box ne communique pas est écrit.
/** @param {Project} project @param {number} ticket @param {import("../facts.ts").Card} cardItem @param {boolean} [cookPose] la section de son cook est posée au-dessus : elle dit déjà ce qu'il fait */
function setStory(project, ticket, cardItem, cookPose = false) {
  /** @type {HTMLElement[]} */
  const setEntries = [];
  const saidOne = situations.get(`${project.nom}#${ticket}`);
  if (saidOne !== undefined && !(cookPose && saidOne.libelle !== "blocked")) {
    const section = document.createElement("section");
    section.className = "situation";
    section.append(block("h4", saidOne.libelle === "blocked" ? "what blocks it" : saidOne.libelle === "question" ? "what it asks you" : "right now"), ...saidOne.lignes.map((line) => block("p", line)));
    setEntries.push(section);
  }
  const story = stories.get(`${project.nom}#${ticket}`);
  const section = document.createElement("section");
  section.className = "histoire";
  section.append(block("h4", "history"));
  if (story === undefined) section.append(block("p", READ_OF("the history")));
  // Une lecture qui manque se dit en une ligne ; ce que la station a répondu, au survol.
  else if ("sans" in story) section.append(lineError(document, NOT_REACHED("history"), story.sans));
  else {
    const list = document.createElement("ol");
    for (const { libelle: wording, at, ton: your, detail } of story.etapes) {
      const line = document.createElement("li");
      if (your !== undefined) line.dataset.ton = your;
      line.append(block("span", wording), exact("time", at));
      if (detail !== undefined) line.append(block("p", detail));
      list.append(line);
    }
    const cost = document.createElement("dl");
    /** @param {string} wording @param {string} value */
    const rankCost = (wording, value) => {
      const pose = document.createElement("div");
      const dd = value === "not communicated" ? lineEmpty(document, value, { classe: "sans", balise: "dd" }) : block("dd", value);
      pose.append(block("dt", wording), dd);
      return pose;
    };
    cost.append(rankCost("tokens", story.cout.tokens), rankCost("duration", story.cout.duree), rankCost("attempts", story.cout.essais));
    const { tokens, duree: duration, essais: trials } = story.cout;
    const knownOne = [tokens, duration, trials].some((value) => value !== "not communicated");
    section.append(list);
    // Un coût que la box ne communique pas n'est pas écrit : ni titre, ni trois lignes vides.
    if (knownOne) section.append(block("h4", "cost"), cost);
    if (knownOne && story.cout.minimum) {
      section.append(lineEmpty(document, "at least: a cook has not declared what it spent", { classe: "sans" }));
    }
  }
  setEntries.push(section);
  // Une rétro que la box ne rend pas n'est pas écrite : une section en échec n'apprend rien au chef.
  if (story !== undefined && !("sans" in story) && !("sans" in story.retro)) setEntries.push(setRetro(ticket, story.retro));
  return setEntries;
}

// La rétro du ticket servi : les leçons qu'elle a laissées au projet — chacune sa pastille
// « provisional », son sens au survol comme dans ce que les cooks ont appris, son id et son texte —, puis ce
// que son cook a écrit, tel que la box l'a rendu. Sans rétro, une phrase le dit, jamais une section vide.
/** @param {number} ticket @param {import("../story.ts").RetroSaid} retro */
function setRetro(ticket, retro) {
  const section = document.createElement("section");
  section.className = "retro";
  section.ariaLabel = `the retro of #${ticket}`;
  section.append(block("h4", "retro"));
  /** @param {string} text */
  const without = (text) => Object.assign(block("p", text), { className: "sans" });
  if ("aucune" in retro) {
    section.append(without(retro.aucune));
    return section;
  }
  // Une lecture qui manque se dit en une ligne ; pourquoi, au survol.
  if ("sans" in retro) {
    section.append(lineError(document, NOT_REACHED("retro"), retro.sans));
    return section;
  }
  if (retro.texte === null && retro.lecons.length === 0) {
    section.append(without("served, but its cook wrote no retro"));
    return section;
  }
  if (retro.lecons.length === 0) section.append(without("no lesson kept from it"));
  else {
    const list = document.createElement("ul");
    for (const { id, texte: text, reconfirmee } of retro.lecons) {
      const line = document.createElement("li");
      // La pastille est le déclencheur de son survol, comme dans ce que les cooks ont appris.
      const pill = block("span", TEMPORARY);
      pill.className = "statut";
      pill.tabIndex = 0;
      const said = block("span", text);
      said.className = "texte";
      const named = block("code", id);
      named.className = "id mono";
      line.append(hover(document, SAYS_TEMPORARY, pill), named, said);
      if (reconfirmee) {
        const resumption = block("span", "reconfirmed");
        resumption.className = "reprise";
        resumption.title = "the retro reconfirms a lesson the project already had";
        line.append(resumption);
      }
      list.append(line);
    }
    section.append(list);
  }
  if (retro.texte !== null) section.append(block("pre", retro.texte));
  return section;
}

// L'histoire de ce ticket, lue sur sa box par le process principal. Une lecture partie avant une autre ne la remplace pas.
/** @param {Project} project @param {import("../facts.ts").Card} cardItem */
async function readStory(project, cardItem) {
  const { ticket } = cardItem;
  const key = `${project.nom}#${ticket}`;
  /** @type {import("../story.ts").Story} */
  let readEntry;
  try {
    // La carte du chef lue de GitHub (ticket 2434) : la fiche dit sa question.
    const question = cardItem.attendu && cardItem.chef !== undefined ? cardItem.todo?.question : undefined;
    situations.set(key, await brigade.situation({ ...(cardItem.etat === undefined ? {} : { etat: cardItem.etat }), attend: cardItem.attend, dit: cardItem.dit, ...(question == null ? {} : { question }) }));
    readEntry = (await brigade.lireHistoire(project.nom, ticket)) ?? { sans: "no station for this project: the app has nothing to read" };
  } catch (error) {
    readEntry = { sans: `not read: ${error instanceof Error ? error.message : String(error)}` };
  }
  if (!cardOf(project, ticket)) return;
  stories.set(key, readEntry);
  renderCard();
}
// L'issue du ticket et sa discussion, sous ses gestes : le corps, puis chaque commentaire dans
// l'ordre, chacun avec son auteur et sa date, le markdown rendu (markdown.ts) — jamais en HTML :
// chaque texte est posé par `textContent`. Dessous, le champ du commentaire : rien ne part sans un
// clic sur son bouton, inactif tant que le champ est vide ; ce qui n'est pas parti se lit dessous,
// et le texte reste dans le champ.
/** @param {Project} project @param {number} ticket */
function setDiscussion(project, ticket) {
  const key = `${project.nom}#${ticket}`;
  const section = document.createElement("section");
  section.className = "discussion";
  section.ariaLabel = `issue #${ticket} and its discussion`;
  const readEntry = discussions.get(key);
  if (readEntry === undefined) {
    section.append(block("p", READ_OF(`issue #${ticket}`)));
    return section;
  }
  if ("sans" in readEntry) {
    section.append(lineError(document, NOT_REACHED("discussion"), readEntry.sans));
    return section;
  }
  /** @param {string} url */
  const open = (url) => void brigade.ouvrirLien(project.nom, ticket, url);
  const thread = document.createElement("ol");
  for (const { auteur: author, at, blocs: blocks, corps: body } of readEntry.messages) {
    const message = document.createElement("li");
    if (body === true) message.className = "corps";
    const head = document.createElement("header");
    head.append(block("strong", author), block("span", body === true ? " opened the issue" : " commented"), exact("time", at));
    const rendered = document.createElement("div");
    rendered.className = "rendu";
    if (blocks.length === 0) {
      rendered.append(lineEmpty(document, body === true ? "no description" : "nothing visible — only markers GitHub does not show", { classe: "sans" }));
    } else rendered.append(...setBlocks(blocks, open));
    message.append(head, rendered);
    thread.append(message);
  }
  section.append(thread);
  if (!readEntry.ouverte) {
    section.append(lineEmpty(document, "the issue is closed — a comment still posts on it", { classe: "sans" }));
  }
  section.append(...setComment(project, ticket));
  return section;
}

// Le champ du commentaire, son bouton et son prix, et ce qu'il est advenu du dernier envoi.
/** @param {Project} project @param {number} ticket @returns {HTMLElement[]} */
function setComment(project, ticket) {
  // En lecture seule (ticket 3163), aucun commentaire ne se poste d'ici.
  if (readOnlyOf(project) !== undefined) return [];
  const key = `${project.nom}#${ticket}`;
  const state = sendsOfComment.get(key);
  const sending = state !== undefined && "envoi" in state;
  const input = /** @type {HTMLTextAreaElement} */ (document.createElement("textarea"));
  input.value = comments.get(key) ?? "";
  input.rows = 3;
  input.ariaLabel = `a comment on issue #${ticket}`;
  input.placeholder = "add context to the issue — markdown, as on GitHub";
  input.disabled = sending;
  const post = button("post this comment", () => void sendComment(project, ticket));
  post.dataset.geste = "commentaire";
  post.title = `post what you wrote on issue #${ticket}, as a comment, under the station's GitHub account — public on GitHub, read by the manager and the next cook; nothing is spent`;
  post.disabled = sending || input.value.trim() === "";
  input.addEventListener("input", () => {
    comments.set(key, input.value);
    post.disabled = input.value.trim() === "";
  });
  // Le même champ, sans le poster : la demande part au second avec ce qu'il y a dedans — vide, elle
  // nomme l'issue seule. Au clic seulement ; rien n'est envoyé, le second l'attend sans Entrée.
  const requested = requestsAtSecond.get(key);
  const inRoute = requested !== undefined && "envoi" in requested;
  const ask = button("ask the second", () => void askAtSecond(project, ticket));
  ask.dataset.geste = "demande-second";
  ask.title = `write into the second a request naming issue #${ticket} and what is in the field — nothing is sent: you press Enter`;
  ask.disabled = inRoute;
  const field = document.createElement("div");
  field.className = "commentaire";
  field.append(input, post, ask);
  /** @type {HTMLElement[]} */
  const poses = [field];
  if (inRoute) poses.push(block("p", "asking the second…"));
  else if (requested !== undefined && "parti" in requested) {
    const said = block("p", requested.parti);
    said.className = "postee";
    poses.push(said);
  } else if (requested !== undefined && "refus" in requested) {
    poses.push(lineError(document, requested.refus, "", { classe: "refus" }));
  }
  if (sending) poses.push(block("p", "posting your comment on the issue…"));
  else if (state !== undefined && state.rendu.poste) {
    const workstation = block("p", `comment posted on #${ticket} — ${state.rendu.prix}`);
    workstation.className = "postee";
    poses.push(workstation);
  } else if (state !== undefined && !state.rendu.poste) {
    poses.push(lineError(document, state.rendu.refus, "", { classe: "refus" }));
  }
  return poses;
}

// Le commentaire part, au clic : le champ et son bouton attendent la réponse. Posté, le champ se
// vide et la discussion est relue — il y apparaît. Pas parti, le texte reste, et la raison se lit
// sous le champ ; un envoi dont rien ne dit s'il est arrivé fait aussi relire la discussion.
/** @param {Project} project @param {number} ticket */
async function sendComment(project, ticket) {
  const key = `${project.nom}#${ticket}`;
  const text = comments.get(key) ?? "";
  const before = sendsOfComment.get(key);
  if (text.trim() === "" || (before !== undefined && "envoi" in before)) return;
  sendsOfComment.set(key, { envoi: true });
  if (cardOf(project, ticket)) renderCard();
  /** @type {import("../discussion.ts").Commented} */
  let rendered;
  try {
    rendered = await brigade.commenter(project.nom, ticket, text);
  } catch (error) {
    rendered = { poste: false, refus: `nothing was posted: ${error instanceof Error ? error.message : String(error)}` };
  }
  sendsOfComment.set(key, { rendu: rendered });
  // Un texte changé pendant l'envoi n'est pas celui qui est parti : il reste.
  if (rendered.poste && comments.get(key) === text) comments.delete(key);
  if (cardOf(project, ticket)) renderCard();
  if (rendered.poste) await readDiscussion(project, ticket);
}

// « ask the second », au clic : le process principal écrit la demande dans le second, sans Entrée. Le champ n'est pas
// vidé. Injoignable, rien n'est écrit, et la fiche dit pourquoi — la carte de TODO aussi. `ecrire` : ce qui part — de la
// fiche par défaut, avec son champ ; d'une carte de TODO, la carte passée au second (ticket 3133, handover-second.ts).
/** @param {Project} project @param {number} ticket @param {() => Promise<Terminal | { refus: string }>} [write] */
async function askAtSecond(project, ticket, write = () => brigade.demanderAuSecond(project.nom, ticket, comments.get(`${project.nom}#${ticket}`) ?? "")) {
  const key = `${project.nom}#${ticket}`;
  const before = requestsAtSecond.get(key);
  if (before !== undefined && "envoi" in before) return;
  releaseTheCardOf(project.nom, ticket);
  const rest = () => {
    if (cardOf(project, ticket)) renderCard();
    if (current?.nom === project.nom) setRail(project);
  };
  requestsAtSecond.set(key, { envoi: true });
  rest();
  /** @type {{ envoi: true } | { parti: string } | { refus: string }} */
  let said;
  try {
    const rendered = await write();
    if ("refus" in rendered) said = { refus: rendered.refus };
    else {
      keep(project.nom, rendered);
      // Le second dit lui-même si la demande y est : non lancé, ou commande refusée, rien n'est écrit.
      said = rendered.demandeEcrite === true ? { parti: `request about #${ticket} written in the second, without Enter — it is waiting for your Enter` } : { refus: `nothing was written: ${rendered.note}` };
    }
  } catch (error) {
    said = { refus: `nothing was written: ${error instanceof Error ? error.message : String(error)}` };
  }
  requestsAtSecond.set(key, said);
  rest();
  show();
}

// L'issue de ce ticket et sa discussion, lues sur sa box par le process principal. Une lecture partie
// avant une autre ne la remplace pas.
/** @param {Project} project @param {number} ticket */
async function readDiscussion(project, ticket) {
  const key = `${project.nom}#${ticket}`;
  /** @type {import("../discussion.ts").Discussion} */
  let readEntry;
  try {
    readEntry = (await brigade.lireDiscussion(project.nom, ticket)) ?? { sans: "no station for this project: the app has nothing to read" };
  } catch (error) {
    readEntry = { sans: `not read: ${error instanceof Error ? error.message : String(error)}` };
  }
  if (!cardOf(project, ticket)) return;
  discussions.set(key, readEntry);
  renderCard();
}

// Le markdown rendu, bloc par bloc : chaque bloc sa balise, chaque texte par `textContent`.
/** @param {import("../markdown.ts").Block[]} blocks @param {(url: string) => void} open @returns {HTMLElement[]} */
function setBlocks(blocks, open) {
  return blocks.map((pose) => {
    if ("titre" in pose) return withIt(`h${Math.min(Math.max(pose.titre, 1), 6)}`, setWords(pose.contenu, open));
    if ("paragraphe" in pose) return withIt("p", setWords(pose.paragraphe, open));
    if ("code" in pose) {
      const pre = document.createElement("pre");
      const code = block("code", pose.code);
      if (pose.langue !== undefined) code.dataset.langue = pose.langue;
      pre.append(code);
      return pre;
    }
    if ("citation" in pose) return withIt("blockquote", setBlocks(pose.citation, open));
    if ("liste" in pose) {
      const list = pose.debut === undefined ? document.createElement("ul") : Object.assign(document.createElement("ol"), { start: pose.debut });
      for (const element of pose.liste) {
        const line = document.createElement("li");
        // Une case de liste de tâches se lit, elle ne se coche pas d'ici.
        if (element.coche !== undefined) line.append(element.coche ? "☑ " : "☐ ");
        line.append(...setBlocks(element.blocs, open));
        list.append(line);
      }
      return list;
    }
    if ("trait" in pose) return document.createElement("hr");
    if ("tableau" in pose) {
      const board = document.createElement("table");
      /** @param {string} balise @param {import("../markdown.ts").Word[][]} rank */
      const line = (balise, rank) => {
        const tr = document.createElement("tr");
        tr.append(...rank.map((cell) => withIt(balise, setWords(cell, open))));
        return tr;
      };
      board.append(withIt("thead", [line("th", pose.tableau.tete)]), withIt("tbody", pose.tableau.lignes.map((rank) => line("td", rank))));
      return board;
    }
    const collapsed = document.createElement("details");
    collapsed.append(withIt("summary", setWords(pose.replie.resume, open)), ...setBlocks(pose.replie.blocs, open));
    return collapsed;
  });
}

// Les mots d'une ligne rendue. Un lien ne navigue pas dans l'app : un clic demande au process
// principal de l'ouvrir dans le navigateur — l'adresse se lit au survol.
/** @param {import("../markdown.ts").Word[]} words @param {(url: string) => void} open @returns {(HTMLElement | string)[]} */
function setWords(words, open) {
  return words.map((word) => {
    if ("texte" in word) return word.texte;
    if ("code" in word) return block("code", word.code);
    if ("gras" in word) return withIt("strong", setWords(word.gras, open));
    if ("italique" in word) return withIt("em", setWords(word.italique, open));
    if ("barre" in word) return withIt("del", setWords(word.barre, open));
    if ("saut" in word) return document.createElement("br");
    const link = withIt("a", setWords(word.contenu, open));
    link.title = `open ${word.lien} in your browser`;
    link.tabIndex = 0;
    link.addEventListener("click", (event) => {
      event.preventDefault();
      open(word.lien);
    });
    link.addEventListener("keydown", (event) => {
      if (event.key === "Enter") open(word.lien);
    });
    return link;
  });
}

// Un élément et ce qu'il contient.
/** @param {string} balise @param {(HTMLElement | string)[]} content */
function withIt(balise, content) {
  const created = document.createElement(balise);
  created.append(...content);
  return created;
}

// La fiche ouverte est-elle celle de ce ticket : ce qui revient pour lui ne se pose que là.
/** @param {Project} project @param {number} ticket */
const cardOf = (project, ticket) => openOne?.projet.nom === project.nom && openOne.carte.ticket === ticket;

// La question de ce ticket, lue sur son issue par le process principal (question.ts) : la vue
// nomme le projet et le ticket. Une lecture partie avant une autre ne la remplace pas.
/** @param {Project} project @param {number} ticket */
async function readQuestion(project, ticket) {
  const key = `${project.nom}#${ticket}`;
  const inRoute = {};
  questions.set(key, inRoute);
  /** @type {import("../question.ts").Read} */
  let readEntry;
  try {
    // Rien : le bloc `attend` ne nomme plus ce ticket — il n'y a rien à lui demander.
    readEntry = (await brigade.lireQuestion(project.nom, ticket)) ?? { a: new Date().toISOString(), aucune: true };
  } catch (error) {
    readEntry = { a: new Date().toISOString(), sans: error instanceof Error ? error.message : String(error) };
  }
  if (questions.get(key) !== inRoute) return;
  questions.set(key, { lue: readEntry, quand: Date.now() });
  if (cardOf(project, ticket)) renderCard();
  // La carte du ticket dit la question en deux lignes : le rail est redessiné de ce qui vient d'être lu —
  // sauf sous une fiche ouverte, dont le rail reste tel qu'il était : la prochaine lecture le met à jour.
  if (!cardOf(project, ticket) && current?.nom === project.nom && !rail.hidden && heldOnes.has(project.nom)) setRail(current);
}

// Le titre de ce ticket, lu sur son issue par le process principal. À son arrivée le rail est redessiné.
/** @param {Project} project @param {number} ticket */
async function readTitle(project, ticket) {
  const key = `${project.nom}#${ticket}`;
  titles.set(key, undefined);
  try {
    titles.set(key, (await brigade.lireTitre(project.nom, ticket)) ?? { sans: "no address" });
  } catch (error) {
    titles.set(key, { sans: error instanceof Error ? error.message : String(error) });
  }
  if (current?.nom === project.nom && !rail.hidden && heldOnes.has(project.nom)) setRail(current);
}

// La réponse du chef — un choix par sa lettre, ou sa phrase — part sur l'issue : c'est le process
// principal qui la relit et l'écrit (question.ts). Une seule à la fois ; ce qu'il en advient se pose
// sur la fiche, et une question qui a changé entre-temps revient à sa place.
/** @param {Project} project @param {number} ticket @param {{ question: string, vu: string, choix: string } | { question: string, vu: string, texte: string }} answer */
async function answerQuestion(project, ticket, answer) {
  const key = `${project.nom}#${ticket}`;
  const before = questions.get(key);
  if (before?.envoi === true) return;
  questions.set(key, { ...(before?.lue === undefined ? {} : { lue: before.lue }), envoi: true });
  if (cardOf(project, ticket)) renderCard();
  /** @type {import("../question.ts").Rendered} */
  let renderedOne;
  try {
    renderedOne = await brigade.repondreQuestion(project.nom, ticket, answer);
  } catch (error) {
    renderedOne = { poste: false, refus: `nothing was posted: ${error instanceof Error ? error.message : String(error)}` };
  }
  const readEntry = (!renderedOne.poste ? renderedOne.lue : undefined) ?? before?.lue;
  questions.set(key, { ...(readEntry === undefined ? {} : { lue: readEntry }), rendue: renderedOne, quand: Date.now() });
  if (renderedOne.poste) drafts.delete(key);
  if (cardOf(project, ticket)) renderCard();
}

// Sur la fiche d'un ticket qui t'attend, la question que son issue pose : le commentaire du
// manager, mot pour mot — rien n'est reformulé —, ce qui a été écrit dessous depuis, puis la
// réponse : un bouton par choix qu'elle propose, un champ pour une phrase. Un clic sur un choix,
// et il part ; la phrase part par son bouton — Entrée ne l'envoie pas. Rien n'est choisi d'avance.
// Aucune question sur l'issue : rien n'est posé, l'entrée garde son geste.
/** @param {Project} project @param {number} ticket @param {{ lue?: import("../question.ts").Read, envoi?: boolean, rendue?: import("../question.ts").Rendered, quand?: number }} etat */
function setQuestion(project, ticket, { lue: readEntry, envoi: sending, rendue: renderedOne }) {
  if (readEntry !== undefined && "aucune" in readEntry) return undefined;
  const section = document.createElement("section");
  section.className = "question";
  if (readEntry === undefined) {
    section.append(block("small", READ_OF(`issue #${ticket}, for the question it asks`)));
    return section;
  }
  if ("sans" in readEntry) {
    section.append(lineError(document, NOT_REACHED("question"), readEntry.sans));
    return section;
  }
  const { question } = readEntry;
  section.ariaLabel = `the question issue #${ticket} asks`;
  const text = block("blockquote", question.texte);
  text.title = "the manager's comment on the issue, word for word — only its hidden brigade markers are left out";
  section.append(block("h4", "The question, as written on the issue"), text, block("small", `posted by ${question.auteur}, ${dateHour(question.a)} — issue read at ${hourOf(readEntry.a)}`));
  if (question.depuis.length > 0) {
    const since = document.createElement("ul");
    since.className = "depuis";
    since.append(
      ...question.depuis.map(({ auteur: author, a, corps: body }) => {
        const written = document.createElement("li");
        written.append(block("small", `${author}, ${dateHour(a)}`), block("p", body));
        return written;
      }),
    );
    section.append(block("small", `written on the issue since — the manager reads it at its next tick:`), since);
  }
  if (renderedOne?.poste === true) {
    const posted = block("p", `answer posted on #${ticket}, in your name: “${renderedOne.corps}” — the manager reads it at its next tick; until then the card waits for it in the Manager column.`);
    posted.className = "postee";
    section.append(posted);
    return section;
  }
  // Répondue sur l'issue — ailleurs, ou avant : la fiche le dit, et la carte n'est plus dans TODO.
  if (question.repondue !== undefined) {
    const answeredOne = block("p", `answered on the issue by ${question.repondue.auteur}, ${dateHour(question.repondue.a)} — the manager reads it at its next tick; until then the card waits for it in the Manager column.`);
    answeredOne.className = "repondue";
    section.append(answeredOne);
  }
  // En lecture seule (ticket 3163), la question se lit, et ne se répond pas d'ici.
  if (readOnlyOf(project) !== undefined) return section;
  // Ce que le chef a vu sous la question : rien ne part si quelque chose y a été écrit depuis.
  const seenOne = question.depuis.at(-1)?.url ?? "";
  const key = `${project.nom}#${ticket}`;
  const answer = document.createElement("div");
  answer.className = "reponse";
  for (const { lettre: letter, texte: said } of question.choix) {
    const choice = button(`${letter}) ${said}`, () => void answerQuestion(project, ticket, { question: question.url, vu: seenOne, choix: letter }));
    choice.className = "choix";
    choice.dataset.geste = "reponse";
    choice.title = `post “${letter}) ${said}” on issue #${ticket} as your answer — one click, and it is posted`;
    choice.disabled = sending === true;
    answer.append(choice);
  }
  const input = /** @type {HTMLTextAreaElement} */ (document.createElement("textarea"));
  input.value = drafts.get(key) ?? "";
  input.rows = 2;
  input.placeholder = question.choix.length > 0 ? "or answer in a sentence" : "your answer, in a sentence";
  input.disabled = sending === true;
  const post = button("post this answer", () => void answerQuestion(project, ticket, { question: question.url, vu: seenOne, texte: input.value }));
  post.dataset.geste = "reponse";
  post.title = `post what you wrote on issue #${ticket}, in your name`;
  post.disabled = sending === true || input.value.trim() === "";
  input.addEventListener("input", () => {
    drafts.set(key, input.value);
    post.disabled = input.value.trim() === "";
  });
  const sentence = document.createElement("div");
  sentence.className = "phrase";
  sentence.append(input, post);
  section.append(answer, sentence);
  if (sending === true) section.append(block("small", "posting your answer on the issue…"));
  if (renderedOne?.poste === false) {
    section.append(lineError(document, renderedOne.refus, "", { classe: "refus" }));
  }
  return section;
}

// Un clic à côté du popup, sur le voile, la ferme aussi.
card.addEventListener("click", (event) => {
  if (event.target === card) closeCard();
});

// Échap ferme la fiche : elle a le clavier dès qu'elle s'ouvre.
card.addEventListener("keydown", (event) => {
  if (event.key !== "Escape") return;
  event.stopPropagation();
  closeCard();
});

// Le haut du rail ne dit rien d'une lecture récente. Passé ce délai sans lecture neuve — la box est
// relue toutes les trente secondes —, une mention discrète dit depuis quand.
const READ_OLD_MS = 120_000;
/** @param {number | string} a */
function freshness(a) {
  const age = Date.now() - new Date(a).getTime();
  if (!(age > READ_OLD_MS)) return [];
  const minutes = Math.floor(age / 60_000);
  const said = block("p", `up to date ${minutes} min ago — the station has not answered since`);
  said.className = "fraicheur";
  return [said];
}
// L'âge du rail montré (ticket 2054), au survol de la ligne d'état et du bandeau, jamais une ligne de plus : l'heure où la box a lu
// l'état qu'elle a publié — pas celle où l'app a lu GitHub, qui est toujours récente. Périmé, le signe de fraîcheur le dit à part.
/** @param {string} publishedThe @param {string} readOne */
function ageOfRail(publishedThe, readOne) {
  const minutes = Math.floor(Math.max(0, Date.parse(readOne) - Date.parse(publishedThe)) / 60_000);
  const age = minutes < 1 ? "less than a minute" : minutes < 60 ? `${minutes} min` : `${Math.floor(minutes / 60)} h ${String(minutes % 60).padStart(2, "0")}`;
  return `rail as GitHub said it ${age} ago, at ${hourShort(publishedThe)} — the box publishes its rail on GitHub, and the app reads it every 30 seconds: this is the age of what the box published, not of the app's reading`;
}
// Le rail gardé d'une lecture ratée en ligne (ticket 2151), à la place de son âge : périmé, l'heure de la lecture montrée et
// son âge en clair (ticket 3008, rail-read-stale.js). Les détails de la dernière lecture ratée ne s'y écrivent que si
// le panneau est à l'écran.
/** @param {{ depuis: string, raison: string }} perime @param {number | string} readOne */
function signStale({ raison: reason }, readOne) {
  const saidOne = tellTheRead({ reading: true, readAt: readOne, stale: true, refusal: { kind: "other" } }, { maintenant: Date.now(), pourquoi: reason, panneauVisible: panelAFicher() });
  return setTheRead(document, saidOne);
}
// Le signe de l'app hors ligne (ticket 1818), à la place de toute erreur.
/** @param {string} since */
function signOutsideLine(since) {
  const sign = block("p", `offline since ${hourShort(since)}`);
  sign.className = "hors-ligne";
  sign.title = `GitHub cannot be reached from ${THIS_COMPUTER}: what is shown is the last state the app read. It is read again on its own when the network comes back.`;
  return sign;
}
// Le réseau revient : la lecture n'attend pas son tour.
window.addEventListener?.("online", () => {
  if (outsideLines.size > 0) readTheFacts();
});

// La box d'un projet ne répond pas (alerts.ts, `injoignable`) : depuis quand, d'après la première
// lecture ratée de la série. Le rail garde alors sa dernière lecture — il n'est plus remplacé par
// « non joint ».
/** @type {Map<string, string>} */
const silentOnes = new Map();
// Les tickets `fire` que GitHub a rendus pour un projet muet, et ceux dont la lecture est en route.
/** @type {Map<string, import("../fire.ts").Fire>} */
const fires = new Map();
/** @type {Set<string>} */
const firesInRoute = new Set();
const FIRE_OLD_MS = 60_000;
/** @param {Project} project */
function loadFire(project) {
  const fire = fires.get(project.nom);
  if (firesInRoute.has(project.nom) || (fire !== undefined && Date.now() - new Date(fire.a).getTime() < FIRE_OLD_MS)) return;
  firesInRoute.add(project.nom);
  void brigade.lireFeu(project.nom).then((readOne) => {
    firesInRoute.delete(project.nom);
    // Sans réponse, la lecture est dite faite quand même : sinon le rail, redessiné, la relancerait aussitôt, sans fin.
    fires.set(project.nom, readOne ?? { a: new Date().toISOString(), sans: "the app has no answer for this project" });
    if (current?.nom === project.nom && silentOnes.has(project.nom) && !rail.hidden) setRail(current);
  });
}
// La liste des tickets `fire` lus sur GitHub, d'un projet muet : repliée, sous ce qu'elle est. Dépliée, des
// lignes comme celles du reste de la page — un numéro qui ouvre l'issue, son titre, sa priorité.
// Ce que le chef a déplié le reste d'un redessin à l'autre.
/** @type {Set<string>} */
const firesUnfolded = new Set();
/** @param {Project} project */
function setSilent(project) {
  loadFire(project);
  const fire = fires.get(project.nom);
  const list = document.createElement("details");
  list.className = "feu";
  list.open = firesUnfolded.has(project.nom);
  list.addEventListener("toggle", () => {
    if (list.open) firesUnfolded.add(project.nom);
    else firesUnfolded.delete(project.nom);
  });
  const numberSays = fire === undefined || "sans" in fire ? "" : `, ${fire.tickets.length}`;
  list.append(block("summary", fire === undefined ? "the tickets in the kitchen according to GitHub — reading…" : `the tickets in the kitchen according to GitHub${numberSays}`));
  if (fire === undefined) return [list];
  if ("sans" in fire) list.append(block("p", "GitHub did not answer either:"), block("pre", fire.sans));
  else if (fire.tickets.length === 0) list.append(block("p", "no open ticket labelled `fire`"));
  else {
    const lines = document.createElement("ol");
    lines.append(
      ...fire.tickets.map(({ ticket, titre: title, prio }) => {
        const line = document.createElement("li");
        const open = clickable("", () => void openIssue(project, ticket));
        open.title = `open #${ticket} on GitHub`;
        open.append(exact("span", `#${ticket}`), block("span", title));
        line.append(open, ...(prio === undefined ? [] : [block("small", prio)]));
        return line;
      }),
    );
    list.append(lines);
  }
  return [list];
}

// Le rail vieillit sans qu'aucune lecture n'arrive : sa mention se repose d'elle-même.
/** @type {Map<string, number>} */
const waitsOfRail = new Map();
setInterval(() => {
  if (current !== undefined && (heldOnes.has(current.nom) || waitsOfRail.has(current.nom)) && !rail.hidden) setRail(current);
}, 15_000);
// La cuisine du projet, dans le groupe du projet de Settings (ticket 1700) : en marche ou à l'arrêt, et le seul geste
// qui la fait changer — « stop the kitchen », le bouton de danger de la famille (ticket 2916), ou « resume the kitchen ».
// Chacun dit d'abord ce qu'il coûte : rien ne part avant son « oui ».
/** @param {Project} project @param {boolean} stopped */
function setStop(project, stopped) {
  // En lecture seule (ticket 3163), la cuisine ne s'arrête ni ne reprend d'ici.
  const gesture = readOnlyOf(project) !== undefined ? undefined : KITCHEN_ACTIONS.find(({ id }) => id === (stopped ? "reprendre" : "stop"));
  stopKitchen.hidden = gesture === undefined;
  sectionKitchen.hidden = gesture === undefined;
  if (gesture === undefined) {
    stopKitchen.replaceChildren();
    return setTheGroups();
  }
  const [declencheur, ...below] = setAction(project, { ...gesture, ou: "parametres" });
  if (declencheur !== undefined && !stopped) {
    declencheur.dataset.arret = "";
    kindOfButton(declencheur, "danger");
  }
  stopKitchen.replaceChildren(rowOfSetting("Kitchen", [block("span", stopped ? "stopped" : "running")], declencheur === undefined ? [] : [declencheur], below));
  setTheGroups();
}

// Le petit mot à côté de l'onglet Stations (ticket 3523) : la station du projet et son état — cooking, stopped, paused. Rien tant
// que ce qui le dirait n'est pas lu, ou qu'aucune station ne cuit le projet. Il remplace la barre « Cooks on » de Rail.
/** @param {Project} project @returns {{ dit: string, survol: string } | undefined} */
function labelOfStation(project) {
  const { haut: top, servantes: servingOnes } = topOfProject(project, Date.now());
  const namesOf = servingOnes.map(({ nom: name }) => name).join(", ");
  const here = servingOnes.some((servingOne) => servingOne.ici);
  const hover = here ? `${namesOf} cooks this project: its kitchen stops when you close the app` : `${namesOf} cooks this project`;
  if (top.etat === "cuit") return { dit: `${top.stations.join(", ")} · cooking`, survol: hover };
  if (top.etat === "hors-ligne") return { dit: `${top.station} · ${top.dit.startsWith("stopped") ? "stopped" : "offline"}`, survol: top.dit };
  if (top.etat === "eteint") return { dit: `${namesOf === "" ? "project" : namesOf} · paused`, survol: top.dit };
  if (top.etat === "deplacement") return { dit: `moving to ${top.vers}`, survol: top.attend };
  return undefined;
}
// L'étiquette que l'onglet porte, par projet : une lecture qui la change repose les onglets.
/** @type {Map<string, string | undefined>} */
const labelsOfStation = new Map();
/** @param {Project} project */
function restTheLabelOfStation(project) {
  const said = labelOfStation(project)?.dit;
  if (labelsOfStation.get(project.nom) === said && labelsOfStation.has(project.nom)) return;
  labelsOfStation.set(project.nom, said);
  if (current?.nom === project.nom) show();
}
// Rien sur le rail : sa colonne dit ce qui est avant lui — elle ne laisse pas croire le projet fini.
/** @param {Project} project */
function railEmpty(project) {
  // Des gestes retenus pour l'OK du chef (ticket 4273) : c'est eux que le rail vide attend.
  return sentenceOfRailEmpty({ rail: 0, retenus: heldOf(heldOfProjects.get(project.nom)) }) ?? upstreams.get(project.nom)?.vide ?? `${NOT_STILL("ticket on the rail")} What is before it is being read…`;
}

// La tête du rail, la cuisine oisive avec des cartes dessus (ticket 1863) : une panne, en rouge, au-dessus de tout le
// reste — depuis combien de temps, et combien de cartes, d'une ligne ; les tickets et ce qu'en faire au survol. Elle
// part dès que `facts` ne la porte plus.
/** @param {Project} project @param {import("../facts.ts").Board} tableau @returns {HTMLElement[]} */
function outageOfRail(project, { panne: outage }) {
  if (outage === undefined) return [];
  const line = document.createElement("p");
  line.className = "panne-du-rail";
  line.role = "alert";
  line.title = outage.survol;
  const brand = block("span", "FAULT");
  brand.className = "marque";
  line.append(brand, block("strong", outage.dit), ...report.poser({ projet: project.nom, reference: { ligne: "cook." }, panne: `${project.nom}: ${outage.dit}` }));
  return [line];
}

// Le bouton qui allume le projet, des mots de la ligne de la bande qui le dit éteint (alerts.ts, `BOUTONS_DE_GESTE`).
const TURN_ON_THE_PROJECT = "switch the project on";
// Où l'allumer, au survol de ce qui dit le projet éteint hors de Rail (ticket 3454).
const OR_TURN_ON = "turn it on with its switch, at the top of the space, or with “switch the project on” at the head of the rail";

// La tête du rail, le projet éteint (tickets 906, 1406) : marquée à l'arrêt, d'une ligne courte — rien de
// neuf n'est pris, découpé ni mergé. Les cooks en cours finissent. À côté, le bouton qui l'allume (ticket 3454) :
// le geste de l'interrupteur, `switch on`, dont la confirmation s'ouvre sous la ligne — en lecture seule, aucun.
// Allumé, pas encore lu ou pas lu, rien : l'interrupteur, en tête de l'espace, dit ce qu'il en est.
/** @param {Project} project @returns {HTMLElement[]} */
function headOfRail(project) {
  const readOne = statesOfManager.get(project.nom);
  if (readOne === undefined || "sans" in readOne || readOne.allume) return [];
  const head = document.createElement("p");
  head.className = "arret-manager";
  head.append(pill("off", "gris"), block("strong", readOne.dit ?? "project off"));
  head.title = readOne.releve;
  if (readOnlyOf(project) !== undefined) return [head];
  const [turnOn, ...confirmation] = setAction(project, { id: "projet-allumer", libelle: TURN_ON_THE_PROJECT, ou: "tete-du-rail" });
  if (turnOn !== undefined) head.append(turnOn);
  return [head, ...confirmation];
}

// Ce que dit la page d'un projet qui cuit sur cet ordinateur quand la station de cet ordinateur ne tourne pas.
const STATION_STOPPED = `${THIS_COMPUTER}'s station is not running`;

// La ligne d'alerte de Rail (ticket 1185), d'après les derniers faits du projet — rien tant que sa box ne répond pas : ce
// qu'ils en disaient n'est plus lu — et ce que la station du projet publie de l'accès à son dépôt et de son refus
// (projets/demande.ts) ; elle ouvre Stations, qui le détaille.
/** @param {Project} project */
function setCooking(project) {
  const held = heldOnes.get(project.nom);
  const stations = held !== undefined && "tableau" in held && !silentOnes.has(project.nom) ? held.tableau.stations : undefined;
  const seenOne = projectsSeen?.projets.find(({ nom: name }) => name === project.nom);
  const alert = lineOfAlert(document, {
    refusee: stations?.lignes.some(({ etat: state }) => state === "refused") ?? false,
    acces: seenOne?.acces ?? seenOne?.worktree?.acces ?? null,
    clone: seenOne?.clone ?? null,
    refus: seenOne?.refus ?? null,
    ouvrir: () => chooseTab(STATIONS),
  });
  const refusal = linesOfRefusal(document, stations?.lignes ?? [], () => chooseTab(STATIONS));
  alertOfKitchen.hidden = alert === null && refusal.length === 0;
  alertOfKitchen.replaceChildren(...(alert === null ? [] : [alert]), ...refusal);
}

// L'onglet Stations (ticket 3195, stations-tab/) : un seul composant — la ligne du haut, une carte par station qui sert le
// projet, le choix de station. Ce qu'il montre se tire de ce que l'app lit déjà : la cuisson du projet (ses faits), les
// stations appairées et ce que leurs suivis disent du projet (son déménagement), les stations du compte, et la liste de la
// station de cet ordinateur (ticket 3402). Ses gestes sont ceux que l'app a déjà : « Choose who cooks it » et « Add a
// station » sont l'ajout d'une station (project/stations/AddStation.js) ; « Move to another station », le déménagement de
// sa cuisine (`demenager`) ; « Stop cooking here », la liste de cet ordinateur, la sélection d'une station du compte, ou le
// retrait d'une station que le projet déclare (project/stations/StopStation.js) ; le bloc des projets servis, caché avec
// ce qui était sous « This machine » (ticket 2494), la lit sans la changer. Les stations du compte se relisent à chaque
// ouverture de l'onglet. Sur un écran étroit, l'onglet se lit sans rien régler (ticket 1186).
let recordedAReread = true;
// Par projet : les stations dont « Details » est déplié — la lecture suivante le garde déplié.
/** @type {Map<string, Set<string>>} */
const detailsOpen = new Map();
// La station dont « Stop cooking here » attend son « yes », ou s'écrit — une à la fois.
/** @type {{ projet: string, id: string, enCours: boolean } | undefined} */
let stopRequest;
// Ce que le dernier arrêt a rendu, sous la ligne du haut — refusé, sa raison, son détail au survol.
let stopSaysFor = { projet: "", texte: "", refus: false, detail: "" };
// Le déménagement que le chef vient de demander, par projet, tant que les stations n'en publient rien : la ligne du haut le
// suit dès le clic.
/** @type {Map<string, { de: string, vers: string, depuis: number }>} */
const displacementsRequests = new Map();
// L'onglet se repose quand un déménagement en route passe sa minute : il dit alors ce qui le bloque.
/** @type {ReturnType<typeof setTimeout> | undefined} */
let minuteOfDisplacement;

// L'onglet n'a que son composant (ticket 3195) : toutes les stations du compte et « + station » sont sur l'accueil. Les
// stations du compte se relisent à chaque ouverture de l'onglet : elles disent celles qui servent le projet.
/** @param {Project} project */
function setTabStations(project) {
  if (recordedAReread) {
    recordedAReread = false;
    void readTheRecorded();
  }
  rail.replaceChildren(tabOfStations(project));
}

// Ce que `servantesDe` lit d'un projet : sa cuisson, les stations appairées, celles qu'il déclare, et sa station de ce
// poste. L'onglet Stations du projet et la page de chaque station le lisent ici, d'une même façon : un projet n'est sur la
// page d'une station que si l'onglet l'y montre. `lues` : sa cuisson, ses stations sur GitHub, ou celles qu'il déclare —
// l'une suffit pour dire qui le cuit.
/** @param {Project} project @param {number} now */
function readOfServing(project, now) {
  const held = heldOnes.get(project.nom);
  const cooking = held !== undefined && "tableau" in held && !silentOnes.has(project.nom) ? held.tableau.stations : undefined;
  const stations = stationsViews?.stations ?? [];
  const locale = projectsSeen?.locale ?? null;
  const readEntries = cooking !== undefined || (stationsViews !== undefined && projectsSeen !== undefined) || declaredEntries.has(project.nom);
  const theDeclared = declaredEntries.get(project.nom)?.declarees ?? [];
  const readThe = held === undefined ? Number.NaN : Date.parse(held.a);
  // Ce que la liste de la station de cet ordinateur dit du projet (tickets 3399, 3402) : elle fait foi pour sa carte.
  const hereServes = servedByThisComputer(project);
  const base = {
    projet: project.nom,
    lignes: cooking?.lignes ?? [],
    stations,
    declarees: theDeclared.map(({ nom: name, distante: remote }) => ({ nom: name, distante: remote })),
    locale,
    ici: project.ici === true,
    maintenant: now,
    ...(Number.isNaN(readThe) ? {} : { lu: readThe }),
    ...(hereServes === undefined ? {} : { iciSert: hereServes, hote: WORKSTATION.nom }),
    ...(project.redemarre === undefined ? {} : { redemarre: project.redemarre }),
  };
  return { base, lues: readEntries, locale, tenu: held, cuisson: cooking };
}

// Ce que l'onglet Stations dit du projet — qui le cuit, le déménagement suivi, la ligne du haut — d'après ce que l'app a lu :
// l'onglet le pose, et l'étiquette qui le suit (`etiquetteDeStation`) en tire son état.
/** @param {Project} project @param {number} now */
function topOfProject(project, now) {
  const seenOfProject = projectsSeen?.projets.find(({ nom: name }) => name === project.nom);
  const { base, lues: readEntries, locale, tenu: held, cuisson: cooking } = readOfServing(project, now);
  const stations = base.stations;
  const without = servingOf(base);
  const displacement = displacementTracking({ publie: seenOfProject?.demenagement, demande: displacementsRequests.get(project.nom), servantes: without, stations });
  if (displacement === null) displacementsRequests.delete(project.nom);
  const servingOnes = displacement === null ? without : servingOf({ ...base, vers: displacement.vers });
  // Les tickets `fire` qui attendent : le compteur « rail » de son tableau, lu ; sinon, la ligne n'en dit rien.
  const fire = held !== undefined && "tableau" in held ? held.tableau.compteurs.find(({ libelle: wording }) => wording === "rail")?.nombre : undefined;
  // Le projet éteint (ticket 3454) : rien n'y cuit, quoi que disent ses stations — la ligne du haut le dit à leur place.
  const manager = statesOfManager.get(project.nom);
  const off = manager !== undefined && !("sans" in manager) && !manager.allume ? { dit: manager.dit ?? "project off", releve: manager.releve } : undefined;
  const top = topOf({ servantes: servingOnes, deplacement: displacement, maintenant: now, ...(fire === undefined ? {} : { fire }), ...(off === undefined ? {} : { eteint: off }) });
  return { vuDuProjet: seenOfProject, lues: readEntries, locale, tenu: held, cuisson: cooking, stations, servantes: servingOnes, deplacement: displacement, haut: top };
}

/** @param {Project} project */
function tabOfStations(project) {
  const now = Date.now();
  const { vuDuProjet: seenOfProject, lues: readEntries, locale, tenu: held, cuisson: cooking, stations, servantes: servingOnes, deplacement: displacement, haut: top } = topOfProject(project, now);
  clearTimeout(minuteOfDisplacement);
  if (top.etat === "deplacement" && top.bloque === null) minuteOfDisplacement = setTimeout(restTheTabStations, top.depuis + ONE_MINUTE_MS - now);

  // Le déménagement de sa cuisine : offert, vers quelles stations, ou pourquoi pas (`deplacementDe`, plus bas).
  const or = orCooked(project, kitchenOf(project).stations);
  const inProgress = seenOfProject?.demenagement ?? null;
  const movable = displacementOf(project, or, inProgress, stationsViews !== undefined && projectsSeen !== undefined);
  const moveChoice = choiceOfDisplacement(movable.destinations, { locale, ordinateur: isOneComputer });
  // « Choose who cooks it » : l'étape d'ajout d'une station — cet ordinateur d'abord, puis les stations du compte.
  const { ajout: addition } = additionOfStationOf(project);
  const stateOfTheAddition = additionOfStation.etatDe(project.nom);
  const reading = narrow();
  const itsOwnHere = theStationLocale();
  const broughtBack = top.etat === "hors-ligne" ? BRING_BACK(top.station, top.sorte !== "box") : top.etat === "eteint" ? `${top.releve}\n${OR_TURN_ON}` : "";
  const toHereByDisplacement = movable.offert && moveChoice.some(({ cle: key }) => key === locale);
  const toHere = !reading && top.etat === "hors-ligne" && !top.ici && (toHereByDisplacement || addition?.donnees.iciOffert === true);
  // Personne ne le cuit : cet ordinateur le sert d'un clic, par sa liste — celle de Settings (ticket 3399).
  const cookHere = !reading && top.etat === "personne" && addition?.donnees.iciOffert === true;

  /** @type {import("./stations-tab/stations-tab.js").SeenOfTheTab["choix"]} */
  let choice;
  if (!reading && move?.projet === project.nom && or !== undefined) {
    choice = { titre: OR_DISPLACE(project.nom, or.ici && or.nom === "" ? WORKSTATION.nom : or.nom), choix: moveChoice, deplacement: true, ...(move.vers === undefined ? {} : { enCours: move.vers }) };
  } else if (!reading && addition !== undefined && stateOfTheAddition.ouvert) {
    const offered = choiceOfStation({ ici: addition.donnees.iciOffert, hote: itsOwnHere?.nom ?? "", stations: addition.donnees.stations, maintenant: now });
    choice = { titre: servingOnes.length > 0 ? WHO_OF_OTHER(project.nom) : WHO_COOKED_TAB(project.nom), choix: offered, deplacement: false, ...(stateOfTheAddition.enCours === undefined ? {} : { enCours: stateOfTheAddition.enCours }), ...(stateOfTheAddition.refus === undefined ? {} : { refus: stateOfTheAddition.refus }) };
  }

  // Ce que le dernier geste a rendu : l'arrêt d'une station, le déménagement, l'ajout — refusé, sa raison.
  const refusalByIt = inProgress !== null && inProgress.etape === "refusee" ? `${project.nom} stays on ${inProgress.de}: ${inProgress.vers} refused to take it over — ${inProgress.dit}` : "";
  const saidOnes = [
    ...(stopSaysFor.projet === project.nom && stopSaysFor.texte !== "" ? [stopSaysFor] : []),
    // Un déménagement parti se lit sur la ligne du haut ; refusé, sa raison se dit ici.
    ...(moveSaysFor.projet === project.nom && moveSaysFor.refus ? [{ texte: moveSaysFor.dit, refus: true, detail: moveSaysFor.detail }] : refusalByIt === "" ? [] : [{ texte: refusalByIt, refus: true, detail: "" }]),
    ...(addition !== undefined && !stateOfTheAddition.ouvert && stateOfTheAddition.fait !== undefined ? [{ texte: DONE_SAYS(stateOfTheAddition, project.nom), refus: false, detail: "" }] : []),
    // La ligne que `status` écrit en tête quand la base rouge est en réparation : elle dit pourquoi rien ne cuit.
    ...(held !== undefined && "tableau" in held && held.tableau.rienNeCuit !== undefined ? [{ texte: held.tableau.rienNeCuit, refus: false, detail: "" }] : []),
  ];

  const openOnes = detailsOpen.get(project.nom) ?? new Set();
  detailsOpen.set(project.nom, openOnes);
  /** @type {Map<string, any[]>} */
  const details = new Map();
  for (const station of reading ? [] : servingOnes) {
    const { lignes: lines, declaree: declaredOne } = detailsOfTheStation(project, station, cooking?.lignes);
    details.set(keyOf(station), lines);
    // La station où « Cook it on a station that has it » offre une capacité : son « Details » s'ouvre.
    if (capacityOffered?.projet === project.nom && declaredOne?.nom === capacityOffered.nom) {
      openOnes.add(keyOf(station));
      capacityOffered = undefined;
    }
  }

  const pose = setTheTabOfStations(
    document,
    {
      projet: project.nom,
      poste: WORKSTATION.nom,
      lues: readEntries,
      haut: top,
      ramener: broughtBack,
      versIci: toHere,
      cuireIci: cookHere,
      servantes: servingOnes,
      enCuisson: cooking !== undefined && !outsideLines.has(project.nom) && !stale.has(project.nom) && held !== undefined && "tableau" in held && !held.tableau.arretee,
      ...(choice === undefined ? {} : { choix: choice }),
      ...(saidOnes.length === 0 ? {} : { dit: saidOnes[0] }),
      deplacable: { offert: !reading && movable.offert, pourquoi: reading ? "" : movable.pourquoiPas },
      ...(stopRequest?.projet === project.nom ? { arret: { id: stopRequest.id, enCours: stopRequest.enCours } } : {}),
      details,
      ouverts: openOnes,
      lecture: reading,
      quiCuit: addition !== undefined,
      ...(held !== undefined && "tableau" in held && held.tableau.quotaGithub !== undefined ? { quota: held.tableau.quotaGithub } : {}),
      ...(standbyVue === undefined ? {} : { veille: standbyVue }),
      ...(stationLocaleRead.projet === project.nom && stationLocaleRead.moteur !== undefined ? { moteurIci: stationLocaleRead.moteur } : {}),
      serveur: serverOf(project.nom, addition !== undefined),
    },
    {
      choisirQuiCuit: () => addition?.gestes.ouvrir(),
      deplacer: () => openTheChoiceOfMachine(),
      versIci: () => {
        if (toHereByDisplacement && locale !== null && or !== undefined) {
          move = { projet: project.nom, part: false };
          return void relocate(project, locale, { nomme: itsOwnHere?.nom ?? WORKSTATION.nom, depuis: or.nom, garder: false });
        }
        if (addition === undefined) return;
        addition.gestes.ouvrir();
        addition.gestes.servirIci();
      },
      cuireIci: () => {
        if (addition === undefined) return;
        addition.gestes.ouvrir();
        addition.gestes.servirIci();
      },
      choisir: (oneOf) => {
        if (move?.projet === project.nom && or !== undefined) {
          const station = movable.destinations.find(({ id }) => id === oneOf.cle);
          return void relocate(project, oneOf.cle, { nomme: station?.nom ?? oneOf.nom, depuis: or.ici && or.nom === "" ? WORKSTATION.nom : or.nom, garder: oneOf.cle === or.id });
        }
        if (addition === undefined) return;
        if (oneOf.cle === HERE) return addition.gestes.servirIci();
        const station = addition.donnees.stations.find(({ id }) => id === oneOf.cle);
        if (station !== undefined) addition.gestes.confier(station);
      },
      annuler: () => {
        if (move?.projet === project.nom) {
          closeMove();
          return restTheTabStations();
        }
        addition?.gestes.annuler();
      },
      arreter: (key) => {
        stopRequest = { projet: project.nom, id: key, enCours: false };
        stopSaysFor = { projet: "", texte: "", refus: false, detail: "" };
        restTheTabStations();
      },
      confirmerArret: (key) => void stopTheStation(project, servingOnes.find((station) => keyOf(station) === key)),
      renoncerArret: () => {
        stopRequest = undefined;
        restTheTabStations();
      },
      basculer: (key, opened) => void (opened ? openOnes.add(key) : openOnes.delete(key)),
      // Le serveur arrivé reçoit le projet par le geste de « Choose who cooks it » : l'étape s'ouvre, et le confie.
      serveur: actionsOfServer(project.nom, (station) => {
        if (addition === undefined) return;
        addition.gestes.ouvrir();
        addition.gestes.confier(station);
      }),
    },
  );
  return pose;
}

// « Stop cooking here » : la station ne prend plus les tickets du projet, par le geste que l'app a pour elle
// (project/stations/StopStation.js) — cet ordinateur, par sa liste, et sa sélection si elle le porte ; une station du compte,
// par sa sélection ; une station que le projet déclare, par son retrait (ticket 2914). Aucun de ces gestes : rien ne part,
// la ligne dit pourquoi. Ce que le geste rend est relu : un projet encore servi le dit, le bouton reste.
/** @param {Project} project @param {import("./stations-tab/state.js").Serving | undefined} station */
async function stopTheStation(project, station) {
  if (station === undefined || stopRequest?.projet !== project.nom || stopRequest.enCours) return;
  const repository = project.depot ?? projectsSeen?.projets.find(({ nom: name }) => name === project.nom)?.depot ?? "";
  const readEntries = recordedAbsent ? undefined : stateOfRecorded.stations;
  const recordedOne = readEntries?.state === "listed" ? readEntries.stations.find(({ id }) => id === station.id) : undefined;
  const theDeclared = declaredEntries.get(project.nom)?.declarees ?? [];
  const readEntry = servedOnes.etat?.lecture;
  const servedHere = readEntry !== undefined && "depots" in readEntry ? readEntry.depots : undefined;
  const declaredOne = theDeclared.find(({ nom: name }) => name === station.nom || name === nameOfTaking(station.nom));
  const gesture = actionOfStop(
    {
      projet: project.nom,
      depot: repository,
      station: { nom: station.nom, ici: station.ici },
      ...(servedHere === undefined ? {} : { liste: servedHere }),
      ...(recordedOne === undefined ? {} : { selection: { id: recordedOne.id, depots: recordedOne.selection ?? [] } }),
      ...(declaredOne === undefined ? {} : { declaree: { nom: declaredOne.nom, seule: theDeclared.length <= 1 } }),
    },
    {
      retirerIci: async (oneOf) => (await brigade.servirUnProjet?.(oneOf, false)) ?? { refus: NOT_REACHED(`${THIS_COMPUTER}'s station`) },
      choisir: async (id, repositories) => (await brigade.choisirLesProjets?.(id, repositories)) ?? { refus: "the app gave no answer" },
      retirerDeclaree: (name) => brigade.changerUneStation(project.nom, name, { retiree: true }),
    },
  );
  if (gesture === undefined || "seule" in gesture) {
    stopRequest = undefined;
    // La seule station que le projet déclare ne se retire pas (stations-declared.js) : sans elle, aucun cook ne part.
    stopSaysFor = { projet: project.nom, texte: gesture === undefined ? WITHOUT_ACTION(station.nom) : `nothing was changed: ${ONLY}`, refus: true, detail: "" };
    return restTheTabStations();
  }
  stopRequest.enCours = true;
  restTheTabStations();
  const said = await haltStation(gesture);
  stopRequest = undefined;
  stopSaysFor = { projet: project.nom, ...said };
  void servedOnes.lire();
  void readTheRecorded();
  if (current?.nom === project.nom) restTheTabStations();
}

// « Details » d'une station : ses réglages et ses lectures, chacun avec son contrôle. Ceux de cet ordinateur — ses dossiers,
// son bac à sable, sa connexion à Claude (project/stations/LocalStation.js) — ; sa connexion à Claude, pour une autre ; et,
// quand le projet la déclare, combien de cooks elle fait tourner à la fois, ce qu'elle fournit et si elle prend les tickets
// ordinaires (project/stations/StationSettings.js).
/**
 * @param {Project} project @param {import("./stations-tab/state.js").Serving} station @param {readonly import("../cooking.ts").LineOfStation[] | undefined} lines
 * @returns {{ lignes: any[], declaree: import("../service.ts").StationDeclared | undefined }}
 */
function detailsOfTheStation(project, station, lines) {
  const readEntry = (stationsViews?.stations ?? []).find(({ id }) => id === station.id);
  const readEntries = declaredEntries.get(project.nom);
  // Sa déclaration : celle qui porte son nom, ou son nom de prise — une seule carte par station déclarée.
  const declaredOne = readEntries?.declarees.find((one) => one.nom === station.nom || one.nom === station.prise || one.nom === nameOfTaking(station.nom));
  const here = station.ici ? linesOfThisComputer(project) : readEntry === undefined ? [] : [connectionAtTheStation(document, readEntry)];
  // Le plafond du projet sur elle, comme sa box le dit (ticket 1292), et ce qui la sature.
  const caps = homeSeen?.plafonds?.[project.nom];
  const cap = caps?.[station.prise ?? station.nom] ?? caps?.[station.nom] ?? caps?.[nameOfTaking(station.nom)];
  return {
    lignes: [...here, ...(cap === undefined ? [] : capRead(document, cap, { declaree: declaredOne !== undefined })), ...(declaredOne === undefined || readEntries === undefined ? [] : [settingsOfTheStationDeclared(project, declaredOne, readEntries, lines)])],
    declaree: declaredOne,
  };
}

// Les réglages d'une station que le projet déclare (ticket 2488) : ce que le chef y saisit est gardé, par projet puis par
// station ; l'option des tickets ordinaires de ce poste, telle que sa dernière lecture l'a rendue (`poserOrdinaires`).
/** @type {Map<string, Map<string, import("./project/stations/StationSettings.js").Input>>} */
const inputsOfStations = new Map();
/** @type {Map<string, import("../ordinary.ts").Block | undefined>} */
const ordinarySeen = new Map();
/**
 * @param {Project} project @param {import("../service.ts").StationDeclared} declaredOne @param {import("../service.ts").StationsRead} readEntries
 * @param {readonly import("../cooking.ts").LineOfStation[] | undefined} lines
 */
function settingsOfTheStationDeclared(project, declaredOne, readEntries, lines) {
  const inputs = inputsOfStations.get(project.nom) ?? new Map();
  inputsOfStations.set(project.nom, inputs);
  const ordinary = ordinarySeen.get(project.nom);
  // Ce que le dernier changement des tickets ordinaires de ce poste a rendu, sous leur rangée : en route, ou refusé.
  const ordinarySays = ordinaryInProgress.has(project.nom) ? ORDINARY_IN_PROGRESS : ordinaryRefused.projet === project.nom && ordinaryRefused.refus !== "" ? { refus: ordinaryRefused.refus } : undefined;
  // Ses cases : celles qu'elle déclare, celles des autres stations, et ce que cet ordinateur sait déclarer (ticket 1307).
  const input = inputOf(inputs, declaredOne, readEntries);
  for (const offered of capacityChoice(declaredOne, readEntries, catalogOf(project))) if (!input.choix.some(({ capacite: capacity }) => capacity === offered.capacite)) input.choix.push(offered);
  return settingsOfTheStation(document, declaredOne, input, {
    ici: project.ici === true,
    ...(ordinary === undefined ? {} : { ordinaires: ordinary }),
    ...(ordinarySays === undefined ? {} : { ordinairesDit: ordinarySays }),
    ...(lines === undefined ? {} : { lignes: lines }),
    gestes: actionsOfSettings(project),
  });
}

// Ce que cet ordinateur sait déclarer — le catalogue de « + station » (ticket 1307) —, lu une fois par projet : les cases
// des capacités de chaque station déclarée l'offrent. Illisible, elles n'offrent que ce que les stations déclarent.
/** @type {Map<string, readonly import("../projects/projects.ts").CapacityOfTheMachine[]>} */
const cataloguesRead = new Map();
/** @param {Project} project */
function catalogOf(project) {
  const readOne = cataloguesRead.get(project.nom);
  if (readOne !== undefined) return readOne;
  cataloguesRead.set(project.nom, []);
  void defaultsOfThisComputer(project.nom).then((defaults) => {
    if ("refus" in defaults || defaults.capacites.length === 0) return;
    cataloguesRead.set(project.nom, defaults.capacites);
    if (current?.nom === project.nom) restTheTabStations();
  });
  return [];
}

// La station de cet ordinateur (ticket 2489, project/stations/LocalStation.js) : ses dossiers, son bac à sable, sa
// connexion à Claude. Lus à l'ouverture de l'onglet, puis toutes les trente secondes tant qu'il se repose ; ses gestes sont
// ceux que l'app avait déjà — le réglage des tickets ordinaires de Settings, le login de la panne de connexion. Ses lignes
// restent posées tant que ce qu'elles montrent ne change pas — le chef peut être en train d'écrire combien de cooks à la
// fois : une relecture ne le lui ôte pas.
const REVIEW_OF_THE_STATION_LOCALE_MS = 30_000;
/** @typedef {Omit<import("./project/stations/LocalStation.js").StateOfTheStationLocale, "poste" | "projet" | "station"> & { projet: string, a: number, moteur?: string }} ReadOfTheStationLocale */
/** @type {ReadOfTheStationLocale} */
let stationLocaleRead = { projet: "", a: 0 };
/** @type {any[] | undefined} */
let linesOfTheStationLocaleSet;
let linesOfTheStationLocalePose = "";
// La station de cet ordinateur, telle que GitHub la publie : nulle sur un appareil qui n'en a pas — un téléphone, un poste
// de travail —, indéfinie tant qu'elle n'est pas lue.
function theStationLocale() {
  if (phoneSeen !== undefined) return null;
  if (projectsSeen === undefined) return undefined;
  const locale = projectsSeen.locale ?? null;
  return locale === null ? null : (stationsViews?.stations ?? []).find(({ id }) => id === locale);
}
/** @param {unknown} error */
const rateSays = (error) => (error instanceof Error ? error.message : String(error));
/** @param {ReadOfTheStationLocale} readOne */
function restTheStationLocale(readOne) {
  if (stationLocaleRead === readOne && current?.nom === readOne.projet && tabOf(current) === STATIONS) setRail(current);
}
/** @param {Project} project */
function readTheStationLocale(project) {
  const name = project.nom;
  /** @type {ReadOfTheStationLocale} */
  const readOne = { projet: name, a: Date.now(), ...(stationLocaleRead.projet === name ? { refusOrdinaires: stationLocaleRead.refusOrdinaires, reglageDit: stationLocaleRead.reglageDit, connexionDite: stationLocaleRead.connexionDite } : {}) };
  stationLocaleRead = readOne;
  void Promise.resolve(brigade.dossiersDeLaStation?.(name) ?? { refus: "its folders could not be read", detail: "this app does not read them" }).then(
    (rendered) => (readOne.dossiers = rendered),
    (error) => (readOne.dossiers = { refus: "its folders could not be read", detail: rateSays(error) }),
  ).then(() => restTheStationLocale(readOne));
  // Le moteur choisi dans ses réglages (moteur/, ticket 3746) — l'abonnement, sans choix gardé : sa carte le dit. Illisible,
  // la carte n'en dit rien ; la page de la station dit pourquoi.
  void Promise.resolve(brigade.lireReglagesDeLaStation?.()).then(
    (readOnes) => {
      if (readOnes !== undefined && !("refus" in readOnes)) readOne.moteur = readOnes.engine ?? ENGINE_BY_DEFAULT;
    },
    () => undefined,
  ).then(() => restTheStationLocale(readOne));
  void readTheOrdinaryLocal(readOne);
}
// Le bac à sable, tel que Settings le lit (ordinary.ts) : rien, le projet ne cuit pas sur cet ordinateur. La ligne des
// tickets ordinaires d'une station déclarée, sur le même onglet (ticket 2488), suit la même lecture.
/** @param {ReadOfTheStationLocale} readOne */
async function readTheOrdinaryLocal(readOne) {
  try {
    const received = await brigade.ordinaires(readOne.projet);
    readOne.ordinaires = received ?? null;
    ordinarySeen.set(readOne.projet, received);
  } catch (error) {
    readOne.ordinaires = null;
    readOne.refusOrdinaires = `the sandbox could not be read: ${rateSays(error)}`;
  }
  restTheStationLocale(readOne);
}
/** @param {Project} project @returns {any[]} */
function linesOfThisComputer(project) {
  if (stationLocaleRead.projet !== project.nom || Date.now() - stationLocaleRead.a > REVIEW_OF_THE_STATION_LOCALE_MS) readTheStationLocale(project);
  const readOne = stationLocaleRead;
  const station = theStationLocale();
  /** @type {import("./project/stations/LocalStation.js").StateOfTheStationLocale} */
  const state = {
    poste: WORKSTATION.nom,
    projet: project.nom,
    station: station == null ? station : { id: station.id, nom: station.nom, max: station.max, pannes: station.pannes },
    ...(readOne.dossiers === undefined ? {} : { dossiers: readOne.dossiers }),
    ...(readOne.ordinaires === undefined ? {} : { ordinaires: readOne.ordinaires }),
    ...(readOne.refusOrdinaires === undefined ? {} : { refusOrdinaires: readOne.refusOrdinaires }),
    ...(readOne.reglageDit === undefined ? {} : { reglageDit: readOne.reglageDit }),
    ...(readOne.connexionDite === undefined ? {} : { connexionDite: readOne.connexionDite }),
  };
  const pose = JSON.stringify(state);
  if (linesOfTheStationLocaleSet !== undefined && pose === linesOfTheStationLocalePose) return linesOfTheStationLocaleSet;
  linesOfTheStationLocalePose = pose;
  // Des lignes reposées à l'identique gardent leurs gestes : chacun prend la lecture en cours au moment du clic.
  const created = linesOfTheStationLocale(document, state, {
    // Le même appel que la ligne des tickets ordinaires de Settings, dès qu'un contrôle change : la rangée dit qu'il est en
    // route, puis son refus se lit sous elle ; le bac à sable se relit, ses contrôles à la valeur en vigueur.
    regler: async (active, limit, or) => {
      const before = stationLocaleRead;
      if (before.reglageDit !== undefined && "enCours" in before.reglageDit.dit) return;
      before.reglageDit = { ou: or, dit: ORDINARY_IN_PROGRESS };
      restTheStationLocale(before);
      /** @type {string | undefined} */
      let refusal;
      try {
        refusal = await brigade.reglerOrdinaires(project.nom, active, limit);
      } catch (error) {
        refusal = `nothing was written: ${rateSays(error)}`;
      }
      const inProgress = stationLocaleRead;
      delete before.reglageDit;
      if (refusal === undefined || refusal === "") delete inProgress.reglageDit;
      else inProgress.reglageDit = { ou: or, dit: { refus: refusal } };
      // Settings se repose sur la valeur écrite à sa prochaine ouverture.
      ordinaryPose = "";
      await readTheOrdinaryLocal(inProgress);
    },
    seConnecter: async (key) => {
      if (station == null) return;
      /** @type {string} */
      let saidOne;
      try {
        const rendered = await brigade.panne(station.id, key);
        ifClaudeMissing(rendered);
        saidOne = "refus" in rendered ? rendered.refus : rendered.fait;
      } catch (error) {
        saidOne = `nothing was done: ${rateSays(error)}`;
      }
      const inProgress = stationLocaleRead;
      inProgress.connexionDite = saidOne;
      restTheStationLocale(inProgress);
    },
  });
  linesOfTheStationLocaleSet = created;
  return created;
}

// Le plan de la cuisine en cinq colonnes — Backlog, le rail en tête, Manager, Cooks, Pass, Served (ticket 4238, cuisine/) —, ce
// qui est parked pour le chef rouge dans la colonne de son étape et dans son TODO (tickets 3458, 4238, 4261), une carte
// parked dans la colonne où elle attend, tel que le process principal l'a rangé (facts.ts) : la vue pose, colonne par
// colonne, au centre de l'espace, partagé entre ses deux onglets (ticket 1184). Rail : ce qui t'attend
// — la file, ce qui est en amont —, puis toutes les colonnes, Cooks et Pass compris, sans rien
// d'exécution sur leurs cartes. Cooks : la carte du projet et ses cooks en cours, et la lecture de `station`. Un projet sans box n'en a
// pas : rien n'est lu de lui. Sans faits, il dit pourquoi il n'est pas dessiné : la carte du panneau
// dit ce qui a été obtenu.
/** @param {Project} project */
function setRail(project) {
  // Le chef répond sur une carte de TODO (ticket 2151) : rien du rail ne bouge sous ses mains.
  if (keepTheCardInMain(project)) return;
  // Le haut du rail se replie en quittant le projet, ou son rail pour Stations : rien n'y reste déplié d'une visite à l'autre (tickets 3523, 4354).
  if ((railPoseOf !== undefined && railPoseOf !== project.nom) || tabOf(project) !== RAIL) for (const name of new Set([project.nom, railPoseOf ?? project.nom])) unfoldsOfTop.delete(name);
  setTheRail(project);
  restTheLabelOfStation(project);
}
// Le refus du dernier « Start this computer's station », par projet (ticket 3637) : sa raison se dit à côté du bouton.
/** @type {Map<string, string>} */
const startupsHere = new Map();
/** @param {Project} project */
async function startTheStationHere(project) {
  startupsHere.delete(project.nom);
  const rendered = await Promise.resolve(brigade.demarrerLaStationIci?.(project.nom)).catch((/** @type {unknown} */ error) => ({ refus: error instanceof Error ? error.message : String(error) }));
  if (rendered !== undefined && typeof rendered.refus === "string") startupsHere.set(project.nom, rendered.refus);
  if (current?.nom === project.nom) setTheRail(project);
}
/** @param {Project} project */
function setTheRail(project) {
  const held = heldOnes.get(project.nom);
  rail.hidden = false;
  const tab = tabOf(project);
  rail.dataset.onglet = [STATIONS, AGENTS].includes(tab) ? tab : RAIL;
  rail.ariaLabel = tab === STATIONS ? "The stations" : tab === AGENTS ? "The agents" : tab === KNOW_HOW ? "The know-how" : "The rail";
  // Settings ouvert par-dessus : sa section des plafonds et du closer suit la lecture, comme elle le faisait sur l'onglet
  // (ticket 3014) ; un champ en cours de frappe n'est pas reposé.
  restTheHealth(project, true);
  // Stations : la liste de ses stations (ticket 2487), et « Add a station » ; les réglages de
  // chacune (ticket 2488) ; la station de cet ordinateur (ticket 2489).
  if (tab === STATIONS) {
    setCooking(project);
    const resumption = resumptionOfKeyboard();
    setTabStations(project);
    return renderTheKeyboard(resumption);
  }
  // Agents (ticket 4224) : l'onglet tenu par agents/, relu pour un autre projet ; posé une fois, il garde le champ où le chef écrit.
  if (tab === AGENTS) {
    agentsOfProject.montrer(project.nom);
    if (rail.children[0] !== agentsOfProject.element) rail.replaceChildren(agentsOfProject.element);
    return;
  }
  // Know-how : les entrées du savoir-faire du projet, chacune réécrite ou retirée sur place (ticket 4241, savoir-faire/).
  if (tab === KNOW_HOW) {
    setCooking(project);
    const resumption = resumptionOfKeyboard();
    rail.replaceChildren(setTheKnowHow(document, project.nom, restTheKnowHow(project.nom)));
    return renderTheKeyboard(resumption);
  }
  const outsideLine = outsideLines.get(project.nom);
  const outdated = stale.get(project.nom);
  delete rail.dataset.horsLigne;
  markRead(project);
  stopKitchen.hidden = true;
  sectionKitchen.hidden = true;
  // Plus de rail, plus de fiche par-dessus.
  if (rail.hidden && openOne !== undefined) closeCard();
  if (rail.hidden) return rail.replaceChildren();
  // Aucune station connue ne sert le projet : la page ne reste pas vide — elle dit pourquoi (ticket 1405). Sur Rail, son
  // rail se lit quand même, sur GitHub (ses issues, labels et PR, ticket 2061) : lu, c'est le même rail que celui d'un projet servi ici, TODO en
  // tête avec ses cartes et leurs gestes (ticket 2076). Tant qu'il ne l'est pas, le rail que sa station publie dit
  // pourquoi (ticket 1435) — GitHub à connecter, aucune station du compte —, sans colonnes à lui. Hors ligne, le signe
  // seul, comme pour tout rail (ticket 1818).
  const ofBoard = (held !== undefined && "tableau" in held) || outsideLine !== undefined;
  if (!itselfLit(project) && project.sansStation !== true && !ofBoard) {
    const published = railsPublished.get(project.nom);
    // Pourquoi le tableau ne s'est pas lu, dans la phrase de sa lecture (board/read.ts).
    const notRead = held === undefined ? undefined : "erreur" in held ? held.erreur : "titre" in held ? held.titre : undefined;
    if (published !== undefined && !published.sansReponse) return rail.replaceChildren(...setRailPublished(document, { ...published, connexion: first.connexion, ...(notRead === undefined ? {} : { nonLu: notRead }) }, actionsOfRailPublished(project)));
    return rail.replaceChildren(block("h3", NO_STATION));
  }
  // Sur Rail, en tête, la ligne qui dit ce qui y demande un geste (ticket 1185).
  // Le bon posé pour chaque carte, celles des stations comprises (ticket 1270) : celui de la fiche ouverte y reprend
  // le clavier.
  /** @type {Map<import("../facts.ts").Card, HTMLElement>} */
  const setEntries = new Map();
  setCooking(project);
  /** @param {(HTMLElement | string)[]} poses */
  const set = (...poses) => rail.replaceChildren(...(alertOfKitchen.hidden ? [] : [alertOfKitchen]), ...poses);
  // Cuisine d'un projet servi ici, station arrêtée : rien n'est lu, la page dit pourquoi en une ligne — sur l'un et
  // l'autre onglet.
  if (project.sansStation === true) return rail.replaceChildren(block("h3", STATION_STOPPED));
  const silent = silentOnes.get(project.nom);
  // Hors ligne sans rien de lu avant : le signe seul, sans erreur ni rail vide (ticket 1818).
  if (outsideLine !== undefined && (held === undefined || !("tableau" in held))) return set(signOutsideLine(outsideLine));
  // Ce que dit le rail qui n'est pas lu : la carte du projet le dit déjà, sur Cooks.
  if (held === undefined && silent === undefined) {
    // Une minute sans rien lu : la page le dit, elle n'attend pas toujours (ticket 2055).
    const exhausted = waitExhausted(waitsOfRail, project.nom, Date.now());
    return set(block("h3", exhausted ? RAIL_NOT_READ : `the rail: first read of ${gesture(project, "facts")} in progress…`));
  }
  waitsOfRail.delete(project.nom);
  // La box ne répond pas : rien de ce que dit le rail n'est lu à neuf. Il garde sa dernière lecture,
  // marquée, et les tickets `fire` que GitHub dit encore passent au-dessus (fire.ts).
  // Le téléphone ne lit pas GitHub : rien n'y passe au-dessus.
  const atPhone = phoneSeen !== undefined;
  const brand = silent === undefined || atPhone ? [] : setSilent(project);
  if (held === undefined || !("tableau" in held)) {
    // Le téléphone n'a pas de panneau à droite : ce qui a été obtenu se dit sous le titre, en une ligne, son détail au survol.
    if (atPhone && held !== undefined && "erreur" in held) return set(block("h3", `the rail is not drawn — tried at ${hourOf(held.a)}`), ...obtainedInOneLine(project, held, AT_PHONE));
    // Sans rien lu : une ligne d'erreur, sans renvoi ; ce que l'app a obtenu s'y ajoute si le panneau est à l'écran.
    const without = held === undefined ? [] : setTheRead(document, tellTheRead({ reading: null, readAt: null, stale: false, refusal: { kind: "other" } }, { maintenant: Date.now(), essaiA: held.a, titre: held.titre, pourquoi: reasonOfTheFailure(held), panneauVisible: panelAFicher() }));
    return set(...brand, ...without);
  }
  const { hors: outside } = held.tableau.rail;
  forgetTheValidated(project, held.tableau.rail.colonnes);
  const readEntries = withoutTheValidated(held.tableau.rail.colonnes, validatedOf(project.nom));
  forgetTheAnswersStale(project, readEntries);
  // La box ne répond pas : ce que ses colonnes contenaient n'est plus lu. Elles le disent, au lieu de montrer des « 0 ».
  const allEntries = silent === undefined ? readEntries : readEntries.map((column) => ({ ...column, compte: "?", cartes: [], autres: undefined, vide: "not known while the station is unreachable" }));
  // Le kanban est entier sur Rail, Taken et Pass compris. TODO n'en est pas une colonne : ses cartes sont rouges en tête
  // de la colonne de leur étape, et l'entrée « TODO (N) » les filtre (ticket 3458).
  const range = tidyTheRail(allEntries);
  const { colonnes: columns, autres: ofOthers } = range;
  // Toutes les cartes lues, quel que soit l'onglet : la fiche ouverte et ce qui est en amont les suivent.
  const theCards = [...allEntries.flatMap(({ cartes: itsOwn, autres: ofOthers }) => [...itsOwn, ...(ofOthers ?? [])]), ...outside];
  // Ce sur quoi un agent travaille porte la poêle (ticket 2984) — jamais d'une lecture dont l'app ne sait plus si elle dit
  // vrai (hors ligne, périmée, la box muette), ni la cuisine arrêtée, ni sur une carte qui attend le chef.
  const inCooking = new Set(outsideLine === undefined && outdated === undefined && silent === undefined && !held.tableau.arretee ? (held.tableau.auTravail ?? []) : []);
  /** @param {import("../facts.ts").Card[]} cards @param {import("./components/pill/pill.js").State} [state] l'état de la colonne, que ses cartes disent ; aucun dans T'attend, où la carte garde l'état de son mot @param {boolean} [withStation] @param {boolean} [outsideColumn] */
  const slips = (cards, state, withStation = false, outsideColumn = false) => {
    const list = document.createElement("ol");
    list.append(
      ...cards.map((cardItem) => {
        // Une carte rouge garde la pastille de son propre état, comme dans TODO : la colonne dit son étape (ticket 3458).
        const slip = renderSlip(project, cardItem, isRed(cardItem) ? undefined : state, withStation, outsideColumn, !cardItem.attendu && inCooking.has(cardItem.ticket));
        setEntries.set(cardItem, slip);
        return slip;
      }),
    );
    return list;
  };
  // Le plan de la cuisine (cuisine/, ticket 4238) : backlog — le rail en tête, les prêts à part —, manager, cooks, pass, servi.
  // Chaque carte dans la colonne de son étape ; une carte parked reste dans celle où elle attend. Aucune colonne Waiting.
  // Le rail du backlog est le haut du backlog que la lecture porte (ticket 4223) : les mêmes tickets, dans le même ordre.
  const plan = planOfTheKitchen(columns, held.tableau.hautDuBacklog?.issues.map(({ number }) => number));
  // Ce qu'attendre un tiers veut dire (WAITING, ticket 3308) s'explique sous le titre de la première colonne où une carte est parked.
  const columnParked = plan.find(({ cartes: cards }) => cards.some(({ parque: parked }) => parked !== undefined))?.nom;
  const grid = document.createElement("div");
  grid.className = "colonnes";
  grid.append(
    ...plan.map(({ nom: name, ton: your, compte: account, cartes: cards, vide: empty, defile: scrolls, pretes: readyEntries, pasPretes: notReady }) => {
      const column = document.createElement("section");
      column.className = "colonne";
      column.dataset.ton = your;
      // La visite (ticket 3165) désigne une colonne par son nom, et une carte par son ticket.
      column.dataset.colonne = name;
      // Servi s'allonge tout le jour : ses cartes défilent dans leur hauteur, les autres colonnes restent en vue.
      if (scrolls) column.dataset.defile = "";
      // Une carte rouge y attend le chef (ticket 3458).
      const red = cards.some(isRed);
      if (red) column.dataset.attend = "";
      // Ce qui attend le chef, ou bouge : sa colonne est en vue à l'ouverture du rail (ticket 1556).
      if (cards.length > 0 && (COLUMNS_ACTIVE.has(name) || red)) column.dataset.actif = "";
      const head = document.createElement("h4");
      head.append(pillOfState(document, stateOfYour(your), name), block("span", account));
      column.append(head);
      // Pass, et la première colonne où une carte est parked : l'explication de leur mot, sous leur titre (ticket 3308).
      const wordOfTheColumn = WORD_OF_THE_COLUMN[name] ?? (name === columnParked ? "WAITING" : undefined);
      if (wordOfTheColumn !== undefined && silent === undefined) column.append(...explanationOfRail(project.nom, wordOfTheColumn));
      // Le backlog : le rail en tête, ce qui est prêt à cuire ; dessous, le reste, s'il y en a.
      if (readyEntries !== undefined) {
        const ofRail = document.createElement("div");
        ofRail.className = "du-rail";
        ofRail.append(block("h5", OF_RAIL), readyEntries.length > 0 ? slips(readyEntries, stateOfYour(your)) : block("p", silent === undefined && held.tableau.rail.aucunTicket === true ? railEmpty(project) : silent === undefined ? NOTHING_OF_READY : empty));
        column.append(ofRail);
        if (notReady !== undefined && notReady.length > 0) {
          const remains = document.createElement("div");
          remains.className = "pas-prets";
          remains.append(block("h5", NOT_READY), slips(notReady, stateOfYour(your)));
          column.append(remains);
        }
      } else if (cards.length > 0) column.append(slips(cards, stateOfYour(your), name === COOKS || name === COLUMN_PASS));
      else column.append(block("p", empty));
      return column;
    }),
  );
  // Un projet de la nouvelle cuisine (ticket 4482) : son kanban, tiré des labels seuls (kitchen-board/), prend la place du plan.
  // Le TODO du chef reste la ligne au-dessus des colonnes.
  if (held.tableau.kitchenBoard !== undefined) {
    const kanban = kitchenBoardGrid(document, held.tableau.kitchenBoard, { openIssue: (ticket) => void openIssue(project, ticket), openPr: (ticket) => void openPr(project, ticket) });
    grid.className = kanban.className;
    grid.replaceChildren(...kanban.children);
  }
  // Le TODO du chef (tickets 4238, 4261, 4354) : une ligne, « 2 wait for you », dont un clic montre exactement les tickets
  // parked pour lui, une entrée chacun — ce qui lui est demandé, ses boutons, et un clic sur son numéro ouvre sa carte. Posé
  // sous les colonnes, il se montre au-dessus d'elles.
  // Un projet en lecture seule (ticket 3163) : ses cartes se lisent, aucun bouton ne les tranche d'ici.
  const todo = setTheTodo(document, {
    cartes: whatAwaitingYou(plan),
    ouvrir: (cardItem) => openCard(project, cardItem, setEntries.get(cardItem) ?? rail),
    ...(readOnlyOf(project) === undefined ? { gestes: { etat: (ticket, todo) => stateOfTheCard(project, ticket, todo), attente: ACTIONS_OF_WAIT, jouer: (ticket, kind, answer) => ACTIONS_OF_TODO[kind](project, ticket, answer) } } : {}),
    // Sous chaque entrée, son contrôle de park, derrière « park or unpark… » (parked/, ticket 4281) : ce qui y est ouvert
    // et tapé se garde d'un rendu à l'autre.
    opened: parkOpen.get(project.nom) ?? parkOpen.set(project.nom, new Set()).get(project.nom),
    deplie: { get ouvert() { return unfoldsOf(project.nom).has("todo"); }, set ouvert(yes) { void (yes ? unfoldsOf(project.nom).add("todo") : unfoldsOf(project.nom).delete("todo")); } },
    control: ({ ticket, step }) => parkControl(document, { project: project.nom, ticket, step, gesture: parkByTheBridge, form: parkInputs.get(`${project.nom}#${ticket}`) ?? parkInputs.set(`${project.nom}#${ticket}`, {}).get(`${project.nom}#${ticket}`) }),
  });
  // À côté du TODO, hors des colonnes : le projet pas préparé pour Brigade (ticket 2628), qui n'est pas un ticket ; les
  // réponses que le chef tapait sur une carte partie entre-temps, résolues (ticket 2151) ; puis ce qui attend un autre humain
  // du projet, replié (ticket 2985).
  // Les gestes qu'un agent retient pour ton OK (ticket 4273) viennent en premier : chacun sa carte et son bouton Approve.
  const aSide = [setTheHeld(document, heldOfProjects.get(project.nom), (id) => approveTheActionHeld(project, id)), opinionOfRepository(project, "todo")].flatMap((opinion) => opinion ?? []);
  const resolved = silent === undefined ? setTheCardsResolved(project, held.tableau.rail) : [];
  if (resolved.length > 0) {
    const list = document.createElement("ol");
    list.append(...resolved);
    aSide.push(list);
  }
  const fromOtherPeople = setTheOthers(document, { autres: ofOthers, bons: slips, deplie: othersUnfolded.has(project.nom), deplier: (opened) => void (opened ? othersUnfolded.add(project.nom) : othersUnfolded.delete(project.nom)) });
  if (fromOtherPeople !== undefined) aSide.push(fromOtherPeople);
  const outsideTodo = document.createElement("div");
  outsideTodo.className = "a-cote-du-todo";
  outsideTodo.append(...aSide);
  const underTheColumns = [...(todo === undefined ? [] : [todo]), ...(aSide.length === 0 ? [] : [outsideTodo])];
  // Rien d'autre n'est lu à neuf : ni ce qui est avant le rail.
  if (silent !== undefined) return set(...brand, grid, ...underTheColumns);
  // La cuisine, en marche ou à l'arrêt, est une ligne de Settings (ticket 1700).
  setStop(project, held.tableau.arretee);
  // La fiche ouverte suit la lecture : elle dit ce que la dernière dit de son ticket.
  // Celle d'une issue avant le rail suit aussi ce qu'en dit la dernière lecture.
  const before = upstreams.get(project.nom);
  if (openOne !== undefined) followCard([...theCards, ...(before !== undefined && "groupes" in before ? before.groupes.flatMap(({ issues }) => issues.map(({ carte: cardItem }) => cardItem)) : [])], setEntries);
  // Un formulaire « waiting for… » dont le ticket n'est plus dans TODO se referme : il n'a plus de carte où se poser.
  for (const key of formsOfWait.keys()) {
    const [name, number] = key.split("#");
    if (name === project.nom && !allEntries.some(({ cartes: itsOwn }) => itsOwn.some(({ ticket, gestes: actions }) => String(ticket) === number && actions?.includes("attente-poser")))) formsOfWait.delete(key);
  }
  const resumption = resumptionOfKeyboard();
  const oldOne = rows.get(project.nom);
  const scrolls = oldOne === undefined ? undefined : { gauche: oldOne.scrollLeft, haut: oldOne.scrollTop };
  const sameRail = railPoseOf === project.nom;
  const topOfRail = rail.scrollTop;
  railPoseOf = project.nom;
  // Hors ligne, le rail lu en dernier est atténué, et le signe dit depuis quand à la place de son âge (ticket 1818).
  if (outsideLine !== undefined) rail.dataset.horsLigne = "";
  // Au-dessus des colonnes, au plus deux lignes (ticket 3523) : le bandeau Backlog et, si quelque chose retient la cuisine, une
  // ligne d'état — la première cause de cette liste, jamais deux : ce qui retient la cuisine d'abord, puis une lecture hors ligne
  // ou périmée, puis l'attente de la file. Sa fraîcheur, quand elle est bonne, est au survol de la ligne et du bandeau.
  // « Start this computer's station » n'est offert que pour un projet qui cuit sur cet ordinateur : la station arrêtée est la sienne.
  const startup = startupsHere.get(project.nom);
  const actionsOfRail = readOnlyOf(project) === undefined ? { ouvrirStations: () => chooseTab(STATIONS), ...(project.ici === true && brigade.demarrerLaStationIci !== undefined ? { demarrerIci: () => void startTheStationHere(project), ...(startup === undefined ? {} : { demarrageRefuse: startup }) } : {}) } : null;
  const seenUpstream = upstreams.get(project.nom);
  const alerts = seenUpstream !== undefined && "groupes" in seenUpstream ? seenUpstream.alertes : undefined;
  const retainedEntries = heldKnown({ misDeCote: seenUpstream !== undefined && "groupes" in seenUpstream ? (seenUpstream.groupes.find(({ etat: state }) => state === "mise-de-cote")?.issues.map(({ ticket }) => ticket) ?? []) : [], arretee: held.tableau.arretee });
  // Pendant la pause de quota GitHub du compte (ticket 3482), le rail dit seulement qu'il l'attend : ni le rail bloqué, ni
  // l'attente de la file — sauf une panne que la pause n'explique pas, qui garde sa ligne et son geste.
  const saysOfRail = whatTheRailSays(held.tableau, Date.now(), project.redemarre !== undefined);
  const wait = saysOfRail.railBloque === undefined ? saysOfRail.attenteDuRail : undefined;
  // Les alertes du haut du rail (ticket 3823) : vraies et actionnables, jugées par le runtime. Une station qui redémarre pour
  // une mise à jour n'est pas une panne (ticket 3637). Elles disent seules les pannes des stations : la phrase de l'attente
  // qui porte un geste ne se montre plus, elle ne sait ni l'en-tête ni le dernier cook.
  const alertsOfRail = (held.tableau.alertesDuRail ?? []).filter(({ sorte: kind, cause }) => project.redemarre === undefined || (kind !== "aucun-cook" && cause !== "aucun-cook"));
  // La bande du haut (cuisine/, tickets 4238, 4354) remplace les bandeaux FAULT : les cartes du supervisor et du closer, et dessous au
  // plus un message — la première cause de la liste qui offre un geste au chef ; une qui n'en offre aucun n'est pas montrée. La
  // lecture hors ligne ou périmée, l'attente de la file et la pause du quota, qui passent seules, offrent de relire ; la ligne
  // d'une issue que la cuisine a ouverte sur elle-même, d'ouvrir cette issue. Une alerte du rail sans bouton du runtime offre
  // d'ouvrir son ticket, ou les checks du dépôt.
  /** @param {HTMLElement[]} lines @param {string} wording @param {() => void} gesture */
  const withItsAction = (lines, wording, gesture) => {
    const [first] = lines;
    if (first !== undefined && !aOneAction(lines)) first.append(button(wording, gesture));
    return lines;
  };
  const reread = () => readTheFacts();
  const [issueOfTheKitchen] = [...(alerts ?? [])].sort((a, b) => a.ticket - b.ticket);
  /** @param {HTMLElement[]} lines */
  const rereadable = (lines) => {
    if (lines.length === 0 || aOneAction(lines)) return lines;
    const frame = document.createElement("div");
    frame.className = "relisible";
    frame.append(...lines, button("read again", () => readTheFacts()));
    return [frame];
  };
  const status =
    [
      issueOfTheKitchen === undefined ? [] : withItsAction(lineOfAlerts(document, alerts), `open #${issueOfTheKitchen.ticket}`, () => void openIssue(project, issueOfTheKitchen.ticket)),
      lineOfRailBlocked(document, saysOfRail.railBloque, actionsOfRail),
      withItsAction(lineOfProjectInPause(document, saysOfRail.enPause), "read again", reread),
      outageOfRail(project, held.tableau),
      headOfRail(project),
      // Une alerte qui demande un geste au chef passe avant le signe d'une lecture vieille (ticket 4238).
      messageOfAlerts(document, alertsOfRail, (alert) => lineOfAlertsOfRail(document, [alert], actionsOfRail), { ouvrirTicket: (ticket) => void openIssue(project, ticket), ouvrirLesChecks: () => void openTheChecks(project) }),
      rereadable(outsideLine !== undefined ? [signOutsideLine(outsideLine)] : outdated !== undefined ? signStale(outdated, held.a) : freshness(held.a)),
      // Pourquoi la file ne part pas (ticket 3433) : jamais « no reason is found » devant une raison que la vue connaît.
      withItsAction(lineOfTheWait(document, wait === undefined || wait.geste !== null ? undefined : sentenceOfTheWait(wait, retainedEntries), actionsOfRail), "read again", reread),
    ].find((lines) => lines.length > 0 && aOneAction(lines)) ?? [];
  // La bande du haut (ticket 4354) : les cartes du supervisor et du closer sur une ligne, et au bout, sur 24 h, la part des
  // tickets mergés en 10 min ou moins de leur prise et leur médiane, la ligne de `status` (ticket 4299).
  const delayOfTaking = projectsSeen?.projets.find(({ nom: name }) => name === project.nom)?.delaiDePrise;
  const bandOfTop = setTheBandOfTop(document, { roles: held.tableau.rolesCuisine, montre: (name) => teamOfProject.agent(project.nom, name) !== undefined, alerte: issueOfTheKitchen?.ticket, maintenant: Date.now(), deplies: unfoldsOf(project.nom), ...(delayOfTaking === undefined ? {} : { delai: delayOfTaking }) });
  bannerOfStop.maj(held.tableau.arretCuisine);
  const age = held.publieLe === undefined ? undefined : ageOfRail(held.publieLe, held.a);
  // Sans ligne d'état ni bandeau, la rangée des colonnes la porte : l'âge n'est jamais perdu, jamais une ligne de plus.
  for (const carrier of age === undefined ? [] : [status[0], grid]) if (carrier !== undefined && !carrier.title) carrier.title = age;
  // Les explications de Rail, de Cook et de TODO, qui étaient au-dessus des colonnes, sont dessous : une fois vues, elles partent.
  // Le journal du jour, au-dessus des colonnes, et la carte du digest de la veille en tête, au premier matin (ticket 4274).
  const { journal: log, digest } = held.tableau;
  const ofMorning = digest !== undefined && cardOfMorning.aMontrer(project.nom, dayOf(new Date())) ? [setTheCardOfDigest(document, digest)] : [];
  set(...ofMorning, bandOfTop, ...status, ...(log === undefined ? [] : [setTheLog(document, log)]), grid, ...underTheColumns, ...explanationOfRail(project.nom, "rail"), ...explanationOfRail(project.nom, "cook"), ...explanationOfRail(project.nom, "TODO"), ...(outside.length === 0 ? [] : [block("h3", "outside the columns — their state is none of the six, and nothing says they await you"), slips(outside, undefined, false, true)]));
  // La cuisine arrêtée (ticket 3924) : en tête du rail, au-dessus de la ligne d'état — aucune autre ligne ne la tait.
  if (held.tableau.arretCuisine) rail.prepend(hostOfTheStop);
  renderTheKeyboard(resumption);
  placeTheRow(project, grid, scrolls);
  if (sameRail) rail.scrollTop = topOfRail;
}

// La rangée des colonnes, une fois posée : la lecture qui suit garde le défilement du chef ; à l'ouverture du rail, la
// première colonne où quelque chose attend ou bouge est à gauche de la vue, sans qu'il défile (ticket 1556).
/** @param {Project} project @param {HTMLElement} grid @param {{ gauche: number, haut: number } | undefined} scrolls */
function placeTheRow(project, grid, scrolls) {
  rows.set(project.nom, grid);
  if (rowsPlaced.has(project.nom) && scrolls !== undefined) {
    grid.scrollLeft = scrolls.gauche;
    grid.scrollTop = scrolls.haut;
    return;
  }
  const active = /** @type {HTMLElement | undefined} */ ([...grid.children].find((column) => /** @type {HTMLElement} */ (column).dataset.actif !== undefined));
  if (active === undefined || active.getBoundingClientRect === undefined) return;
  rowsPlaced.add(project.nom);
  grid.scrollLeft = Math.max(0, active.getBoundingClientRect().left - grid.getBoundingClientRect().left + grid.scrollLeft - 16);
}

// Le champ où le chef tapait garde le clavier, et son curseur : le rail redessiné le lui rend — celui d'une carte, d'un
// formulaire, ou d'une ligne du tableau de la cuisine.
function resumptionOfKeyboard() {
  const tape = /** @type {HTMLInputElement | null | undefined} */ (document.activeElement);
  // Le champ du détail en grand (ticket 3348) porte la même clé que celui de sa carte, cachée dessous : le rail ne peut pas
  // le rendre, il prendrait le clavier à la carte au lieu de le laisser au détail — poserLeDetail garde le sien.
  if (tape !== null && tape !== undefined && detailOfValidation.contains(tape)) return undefined;
  return tape?.dataset?.cle === undefined ? undefined : { cle: tape.dataset.cle, champ: tape.dataset.champ, debut: tape.selectionStart, fin: tape.selectionEnd };
}
/** @param {ReturnType<typeof resumptionOfKeyboard>} resumption */
function renderTheKeyboard(resumption) {
  if (resumption === undefined) return;
  const resumed = /** @type {HTMLInputElement[]} */ ([...rail.querySelectorAll("input, textarea")]).find(({ dataset }) => dataset.cle === resumption.cle && dataset.champ === resumption.champ);
  resumed?.focus();
  if (resumed !== undefined && resumption.debut !== null && resumption.fin !== null) resumed.setSelectionRange?.(resumption.debut, resumption.fin);
}

// Une carte de TODO à laquelle le chef vient de répondre reste dans sa colonne : elle dit sa réponse envoyée, en
// attente de la cuisine (card-todo.js). Une réponse que les faits lus ne portent plus — la carte a quitté TODO, ou
// pose une autre question — est oubliée, et son brouillon avec.
/** @param {Project} project @param {import("../facts.ts").Column[]} columns */
function forgetTheAnswersStale(project, columns) {
  const scopes = cardsScopes(project, columns);
  for (const key of answersAtCards.keys()) if (key.startsWith(`${project.nom}#`) && !scopes.has(key)) answersAtCards.delete(key);
  // Un brouillon vide part avec sa carte ; un autre reste, sur une carte résolue (ticket 2151).
  for (const [key, text] of draftsOfCards) {
    if (!key.startsWith(`${project.nom}#`) || scopes.has(key) || text.trim() !== "") continue;
    draftsOfCards.delete(key);
    questionsOfDrafts.delete(key);
  }
  for (const [key, { question }] of answersAtCards) if (key.startsWith(`${project.nom}#`) && scopes.get(key) !== question) answersAtCards.delete(key);
}

// Une carte validée ou renvoyée d'ici que la lecture ne porte plus est oubliée : elle a quitté TODO pour de bon.
/** @param {Project} project @param {import("../facts.ts").Column[]} columns */
function forgetTheValidated(project, columns) {
  const done = validated.get(project.nom);
  if (done === undefined) return;
  const scopes = new Set(columns.flatMap(({ cartes: cards, autres: others }) => [...cards, ...(others ?? [])]).map(({ ticket }) => ticket));
  for (const ticket of done) {
    if (scopes.has(ticket)) continue;
    done.delete(ticket);
    validations.delete(`${project.nom}#${ticket}`);
    reviews.delete(`${project.nom}#${ticket}`);
  }
}

// Les cartes de TODO que des colonnes portent, par projet et ticket, et la question de chacune.
/** @param {Project} project @param {import("../facts.ts").Column[]} columns @returns {Map<string, string | null>} */
const cardsScopes = (project, columns) => new Map(columns.flatMap(({ cartes: cards, autres: others }) => [...cards, ...(others ?? [])]).flatMap(({ ticket, todo }) => (todo === undefined ? [] : [[`${project.nom}#${ticket}`, todo.question]])));

// Ce qu'une lecture dit d'une carte de TODO où le chef a tapé (ticket 2151) : rien, si elle est encore dans TODO avec la
// même question — n'importe laquelle, `question` indéfinie ; sinon, en une ligne, ce qu'elle est devenue — son texte, lui,
// reste.
/** @param {import("../facts.ts").Rail} readOne @param {number} ticket @param {string | null | undefined} question @returns {string | undefined} */
function resolvedBetweenTime(readOne, ticket, question) {
  const column = readOne.colonnes.find(({ cartes: cards, autres: others }) => [...cards, ...(others ?? [])].some((cardItem) => cardItem.ticket === ticket));
  const itsOwnOne = [...(column?.cartes ?? []), ...(column?.autres ?? [])].find((cardItem) => cardItem.ticket === ticket);
  if (column?.nom === COLUMN_WHO_AWAITING_YOU && itsOwnOne?.todo !== undefined) return question === undefined || itsOwnOne.todo.question === question ? undefined : `its question changed meanwhile — ${TEXT_GUARD}`;
  const become =
    column === undefined
      ? readOne.hors.some((cardItem) => cardItem.ticket === ticket)
        ? "is now outside the columns"
        : "has left the rail"
      : column.nom === COLUMN_WHO_AWAITING_YOU
        ? "no longer takes an answer on its card"
        : `is now in ${itsOwnOne === undefined ? column.nom : columnOfPlan(column.nom, itsOwnOne)}`;
  return `resolved meanwhile: #${ticket} ${become} — ${TEXT_GUARD}`;
}
const TEXT_GUARD = "your text is kept here, nothing was sent";

// La ligne d'une carte tenue que la lecture ne porte plus, à côté du champ du chef — retirée quand elle la porte de nouveau.
/** @param {HTMLElement} cardItem @param {string | undefined} said */
function tellTheCardResolved(cardItem, said) {
  const before = [...cardItem.children].find(({ className }) => className === "resolue-entre-temps");
  if (said === undefined) return before?.remove();
  if (before !== undefined) return void (before.textContent = said);
  const line = block("p", said);
  line.className = "resolue-entre-temps";
  const sentence = [...cardItem.children].find(({ className }) => className === "phrase");
  if (sentence === undefined) cardItem.append(line);
  else sentence.after(line);
}

// Le rail d'un projet dont le chef tient une carte de TODO (ticket 2151) ne se redessine pas : la lecture est tenue, et la
// carte dit seulement si elle ne la porte plus. Une lecture ratée n'en dit rien. Faux : rien n'est tenu dans ce rail.
/** @param {Project} project */
function keepTheCardInMain(project) {
  const inMain = cardInMain;
  if (inMain === undefined || inMain.projet !== project.nom || !rail.contains(inMain.bon)) return false;
  rail.hidden = false;
  inMain.gele = true;
  const held = heldOnes.get(project.nom);
  if (held !== undefined && "tableau" in held && !silentOnes.has(project.nom)) tellTheCardResolved(inMain.carte, resolvedBetweenTime(held.tableau.rail, inMain.ticket, inMain.question));
  return true;
}

// Une carte de TODO posée se tient tant que le clavier y est : son champ, ses choix, ses boutons (ticket 2151).
// `question` : celle de la carte — indéfinie pour une carte résolue, qui n'en attend plus aucune.
/** @param {Project} project @param {number} ticket @param {string | null | undefined} question @param {HTMLElement} slip @param {HTMLElement} cardItem */
function holdInMain(project, ticket, question, slip, cardItem) {
  cardItem.addEventListener("focusin", () => {
    if (cardInMain?.carte !== cardItem) cardInMain = { projet: project.nom, ticket, question, bon: slip, carte: cardItem, gele: false };
  });
  cardItem.addEventListener("focusout", (event) => {
    const to = /** @type {HTMLElement | null | undefined} */ (event.relatedTarget);
    if (to != null && cardItem.contains(to)) return;
    // Le clavier part ailleurs dans le rail : la lecture tenue attend la suivante, pour ne pas reposer l'élément que le
    // chef vient de toucher.
    releaseTheCard(cardItem, to == null || !rail.contains(to));
  });
  return cardItem;
}

// Le clavier quitte la carte tenue : ce qui est arrivé entre-temps se pose, si `redessiner`. Un geste de la carte la
// lâche sans redessiner : il redessine lui-même.
/** @param {HTMLElement} cardItem @param {boolean} redraw */
function releaseTheCard(cardItem, redraw) {
  if (cardInMain?.carte !== cardItem) return;
  const { projet: project, gele: frozen } = cardInMain;
  cardInMain = undefined;
  if (redraw && frozen && current?.nom === project && !rail.hidden) setRail(current);
}
/** @param {string} project @param {number} ticket */
function releaseTheCardOf(project, ticket) {
  if (cardInMain?.projet === project && cardInMain.ticket === ticket) releaseTheCard(cardInMain.carte, false);
}

// Les cartes de TODO parties entre-temps dont le chef a gardé un texte (ticket 2151), en bas de TODO : son numéro, ce que
// la carte demandait, ce qu'elle est devenue, et son texte — à recopier, ou à écarter.
/** @param {Project} project @param {import("../facts.ts").Rail} readOne */
function setTheCardsResolved(project, readOne) {
  const scopes = cardsScopes(project, readOne.colonnes);
  return [...draftsOfCards].flatMap(([key, text]) => {
    if (!key.startsWith(`${project.nom}#`) || scopes.has(key) || text.trim() === "") return [];
    const ticket = Number(key.slice(project.nom.length + 1));
    const number = block("span", `#${ticket}`);
    number.className = "ticket mono";
    const slip = cardWait(document, { numero: number });
    slip.dataset.resolue = "";
    const cardItem = cardOfAnswer(document, { resolue: true });
    cardItem.ariaLabel = `your answer to #${ticket}, kept after its card left TODO`;
    const asked = questionsOfDrafts.get(key);
    if (asked != null) {
      const question = block("p", asked);
      question.className = "question-carte";
      cardItem.append(question);
    }
    const sentence = document.createElement("div");
    sentence.className = "phrase";
    const input = document.createElement("textarea");
    input.value = text;
    input.rows = 2;
    input.ariaLabel = `your text for #${ticket}`;
    input.dataset.cle = key;
    input.dataset.champ = FIELD_OF_CARD;
    input.addEventListener("input", () => void draftsOfCards.set(key, input.value));
    const setAside = button("dismiss", () => {
      draftsOfCards.delete(key);
      questionsOfDrafts.delete(key);
      releaseTheCard(cardItem, false);
      if (current?.nom === project.nom) setRail(project);
    }, "discret");
    setAside.title = "forget this text: nothing was sent, and nothing will be";
    sentence.append(input, setAside);
    cardItem.append(sentence);
    tellTheCardResolved(cardItem, resolvedBetweenTime(readOne, ticket, undefined));
    slip.append(holdInMain(project, ticket, undefined, slip, cardItem));
    return [slip];
  });
}

// Le geste en route d'ici sur la carte de TODO d'un ticket, pour la question qu'elle montre — au repos sinon.
/** @param {Project} project @param {number} ticket @param {import("../card-todo.ts").CardOfTodo} todo */
function stateOfTheCard(project, ticket, todo) {
  const heldOne = answersAtCards.get(`${project.nom}#${ticket}`);
  return heldOne !== undefined && heldOne.question === todo.question ? heldOne.etat : CARD_AT_REST;
}

// La carte de TODO d'un ticket, dans l'état de sa réponse (card-todo.js) : ses captures posées comme
// celles d'une livraison, lues sans un clic. « Ask the second » y passe la carte au second : son numéro, sa question, ce
// que son issue dit (ticket 3133).
/** @param {Project} project @param {number} ticket @param {import("../card-todo.ts").CardOfTodo} todo */
function setTheCardOfTodo(project, ticket, todo) {
  const key = `${project.nom}#${ticket}`;
  if (isOneValidation(todo)) return setTheValidation(project, ticket, todo, false);
  if (isOneReview(todo)) return setTheReview(project, ticket, todo, false);
  const state = stateOfTheCard(project, ticket, todo);
  const second = requestsAtSecond.get(key);
  return setCardOfTodo(
    document,
    ticket,
    todo,
    state,
    { captures: todo.captures === undefined ? [] : setCaptures(project, ticket, todo.captures), brouillon: draftsOfCards.get(key) ?? "", cle: key, ...(second === undefined ? {} : { second }), ...(readOnlyOf(project) === undefined ? {} : { lectureSeule: true }) },
    {
      repondre: (answer) => void answerAtTheCard(project, ticket, answer),
      ecrire: (text) => {
        draftsOfCards.set(key, text);
        questionsOfDrafts.set(key, todo.question ?? todo.resume ?? null);
      },
      demander: () => void askAtSecond(project, ticket, () => brigade.passerAuSecond(project.nom, ticket, todo.question)),
      copier: (text) => navigator.clipboard?.writeText(text),
      ouvrir: () => void openIssue(project, ticket),
    },
  );
}

// La carte « Validate its screen » d'un ticket (validation-design/, ticket 3185) : ses captures posées comme celles de toute
// carte, lues sans un clic ; « Validate » et « Send back to the kitchen » jouent la commande du runtime par le process
// principal — sur le téléphone, ils s'écrivent sur GitHub (actions-github-phone.ts). `grand` : à la largeur d'un téléphone, sur la carte ouverte depuis la liste.
/** @param {Project} project @param {number} ticket @param {import("../card-todo.ts").CardOfTodo} todo @param {boolean} grand */
function setTheValidation(project, ticket, todo, grand) {
  const key = `${project.nom}#${ticket}`;
  const second = requestsAtSecond.get(key);
  return setCardOfValidation(
    document,
    ticket,
    todo,
    validations.get(key) ?? VALIDATION_AT_REST,
    { captures: todo.captures === undefined ? [] : setCaptures(project, ticket, todo.captures), commentaire: commentsOfValidation.get(key) ?? "", cle: key, grand, ...(second === undefined ? {} : { second }), ...(readOnlyOf(project) === undefined ? {} : { lectureSeule: true }) },
    {
      valider: () => void validateTheCard(project, ticket, { geste: "valider" }),
      renvoyer: (comment) => void validateTheCard(project, ticket, { geste: "renvoyer", commentaire: comment }),
      ecrire: (text) => void commentsOfValidation.set(key, text),
      ouvrirPr: () => void brigade.ouvrirPr(project.nom, ticket),
      ouvrir: () => openTheDetail(project.nom, ticket),
      // Dans TODO, comme toute carte, « ask the second » (ticket 3133) ; la carte ouverte du téléphone n'en a pas.
      ...(grand ? {} : { demander: () => void askAtSecond(project, ticket, () => brigade.passerAuSecond(project.nom, ticket, todo.question)) }),
    },
  );
}

// La carte « review before merge » d'un ticket sensible (carte-sensible/, ticket 3224) : « PR of #<ticket> » l'ouvre d'un
// clic ; « Merge » et « Send back » jouent la commande `sensitive` du runtime par le process principal. `grand` : à la
// largeur d'un téléphone, sur la carte ouverte depuis la liste.
/** @param {Project} project @param {number} ticket @param {import("../card-todo.ts").CardOfTodo} todo @param {boolean} grand */
function setTheReview(project, ticket, todo, grand) {
  const key = `${project.nom}#${ticket}`;
  const second = requestsAtSecond.get(key);
  return setCardSensitive(
    document,
    ticket,
    todo,
    reviews.get(key) ?? REVIEW_AT_REST,
    { note: notesOfReview.get(key) ?? "", cle: key, grand, ...(second === undefined ? {} : { second }), ...(readOnlyOf(project) === undefined ? {} : { lectureSeule: true }) },
    {
      merger: () => void answerAtTheReview(project, ticket, { geste: "merger" }),
      renvoyer: (note) => void answerAtTheReview(project, ticket, { geste: "renvoyer", note }),
      ecrire: (text) => void notesOfReview.set(key, text),
      ouvrirPr: () => void brigade.ouvrirPr(project.nom, ticket),
      ...(grand ? {} : { demander: () => void askAtSecond(project, ticket, () => brigade.passerAuSecond(project.nom, ticket, todo.question)) }),
    },
  );
}

// Une réponse du chef sur une carte « review before merge », une seule à la fois : faite, la carte quitte TODO et les faits
// sont relus ; refusée, elle garde ses gestes et sa note, et dit pourquoi.
/** @param {Project} project @param {number} ticket @param {import("./card-sensitive/card-sensitive-github.ts").ActionSensitive} gesture */
async function answerAtTheReview(project, ticket, gesture) {
  const key = `${project.nom}#${ticket}`;
  if (reviews.get(key)?.etape === "envoi" || reviews.get(key)?.etape === "fait") return;
  releaseTheCardOf(project.nom, ticket);
  /** @param {import("./card-sensitive/card-sensitive.js").State} state */
  const set = (state) => {
    reviews.set(key, state);
    if (current?.nom === project.nom) setRail(project);
    setTheCardsOfChef();
  };
  set({ etape: "envoi", geste: gesture.geste });
  /** @type {import("./card-sensitive/card-sensitive-github.ts").RenderedSensitive | undefined} */
  let rendered;
  try {
    rendered = brigade.gesteSensible === undefined ? { refus: REVIEW_WITHOUT_BRIDGE, detail: "" } : await brigade.gesteSensible(project.nom, ticket, gesture);
  } catch (error) {
    rendered = { refus: "nothing was done: the app could not play the gesture", detail: error instanceof Error ? error.message : String(error) };
  }
  const renderedOne = afterTheReview(rendered);
  if (renderedOne.etape !== "fait") return set(renderedOne);
  // Fait : la carte garde un court moment la confirmation de ce qui a été fait (ticket 3386), puis quitte TODO.
  set({ ...renderedOne, geste: gesture.geste });
  await new Promise((finished) => setTimeout(finished, CONFIRMATION_REVIEW_MS));
  notesOfReview.delete(key);
  validated.set(project.nom, validatedOf(project.nom).add(ticket));
  if (vueOfCards.vu === "carte" && vueOfCards.carte.projet === project.nom && vueOfCards.carte.ticket === ticket) vueOfCards = { vu: "liste" };
  set(renderedOne);
  readTheFacts();
}

// « undo » sur la carte d'un ticket servi (undo/, ticket 3274), un seul à la fois : fait, la carte garde la ligne de ce qui
// s'est passé et les faits sont relus — rouvert, le ticket quitte Served ; refusé, le bouton revient et la carte dit pourquoi.
/** @param {Project} project @param {number} ticket */
async function cancelTheServed(project, ticket) {
  const key = `${project.nom}#${ticket}`;
  if (cancellations.get(key)?.etape === "envoi" || cancellations.get(key)?.etape === "fait") return;
  /** @param {import("./undo/undo.js").State} state */
  const set = (state) => {
    cancellations.set(key, state);
    if (current?.nom === project.nom) setRail(project);
  };
  set({ etape: "envoi" });
  /** @type {import("./undo/undo-github.ts").RenderedOfCancellation | undefined} */
  let rendered;
  try {
    rendered = brigade.annulerServi === undefined ? { refus: CANCELLATION_WITHOUT_BRIDGE, detail: "" } : await brigade.annulerServi(project.nom, ticket);
  } catch (error) {
    rendered = { refus: "nothing was undone: the app could not play the gesture", detail: error instanceof Error ? error.message : String(error) };
  }
  const renderedOne = afterTheCancellation(rendered);
  set(renderedOne);
  if (renderedOne.etape === "fait") readTheFacts();
}

// Un geste du chef sur une carte « Validate its screen », un seul à la fois : fait, la carte quitte TODO et les faits sont
// relus ; refusé, elle garde ses gestes et son commentaire, et dit pourquoi.
/** @param {Project} project @param {number} ticket @param {import("./validation-design/validation-design-github.ts").ActionOfValidation} gesture */
async function validateTheCard(project, ticket, gesture) {
  const key = `${project.nom}#${ticket}`;
  if (validations.get(key)?.etape === "envoi" || validations.get(key)?.etape === "fait") return;
  releaseTheCardOf(project.nom, ticket);
  /** @param {import("./validation-design/validation-design.js").State} state */
  const set = (state) => {
    validations.set(key, state);
    if (current?.nom === project.nom) setRail(project);
    setTheCardsOfChef();
    // Fait depuis son détail, la carte a quitté TODO : son détail se ferme (`poserLeDetail` ne la trouve plus).
    if (detailOpen?.projet === project.nom && detailOpen.ticket === ticket) setTheDetail();
  };
  set({ etape: "envoi", geste: gesture.geste });
  /** @type {import("./validation-design/validation-design-github.ts").RenderedOfValidation | undefined} */
  let rendered;
  try {
    rendered = await brigade.gesteDeValidation(project.nom, ticket, gesture);
  } catch (error) {
    rendered = { refus: "nothing was done: the app could not play the gesture", detail: error instanceof Error ? error.message : String(error) };
  }
  const renderedOne = afterTheValidation(rendered);
  if (renderedOne.etape !== "fait") return set(renderedOne);
  // Fait : la carte, ou son détail, garde un court moment la confirmation de ce qui a été fait (ticket 3386), puis quitte TODO.
  set({ ...renderedOne, geste: gesture.geste });
  await new Promise((finished) => setTimeout(finished, CONFIRMATION_VALIDATION_MS));
  commentsOfValidation.delete(key);
  validated.set(project.nom, validatedOf(project.nom).add(ticket));
  if (vueOfCards.vu === "carte" && vueOfCards.carte.projet === project.nom && vueOfCards.carte.ticket === ticket) vueOfCards = { vu: "liste" };
  set(renderedOne);
  readTheFacts();
}

// La carte « Validate its screen » d'un ticket, telle que la dernière lecture de son projet la porte — partie de TODO
// (validée ou renvoyée d'ici, ou plus lue), rien.
/** @param {string} name @param {number} ticket */
function theValidation(name, ticket) {
  const project = configuration.projets.find((oneOf) => oneOf.nom === name);
  const held = heldOnes.get(name);
  if (project === undefined || held === undefined || !("tableau" in held) || validatedOf(name).has(ticket)) return undefined;
  const todo = held.tableau.rail.colonnes
    .flatMap(({ cartes: cards }) => cards)
    .find((cardItem) => cardItem.ticket === ticket && isOneValidation(cardItem.todo))?.todo;
  return todo === undefined ? undefined : { projet: project, todo };
}

// Les cartes « Validate its screen » qui attendent le chef, dans l'ordre de sa liste (`lesCartesDuChef`) : celle qui suit
// la carte ouverte — la première, après la dernière —, autre qu'elle.
/** @param {string} name @param {number} ticket */
function validationNext(name, ticket) {
  const pendingOnes = theCardsOfChef().filter(({ todo }) => isOneValidation(todo));
  const here = pendingOnes.findIndex((cardItem) => cardItem.projet === name && cardItem.ticket === ticket);
  return [...pendingOnes.slice(here + 1), ...pendingOnes.slice(0, Math.max(here, 0))].find((cardItem) => cardItem.projet !== name || cardItem.ticket !== ticket);
}

/** @param {string} project @param {number} ticket */
function openTheDetail(project, ticket) {
  releaseTheCardOf(project, ticket);
  detailOpen = { projet: project, ticket, affichage: displayNew() };
  setTheDetail();
  detailOfValidation.focus();
}

function closeTheDetail() {
  const closes = detailOpen;
  detailOpen = undefined;
  setTheDetail();
  // Le commentaire tapé dans le détail est celui de la carte : elle le reprend.
  if (closes === undefined) return;
  const project = configuration.projets.find((oneOf) => oneOf.nom === closes.projet);
  if (project !== undefined && current?.nom === project.nom && !rail.hidden && heldOnes.has(project.nom)) setRail(project);
  setTheCardsOfChef();
}

// Le détail ouvert, posé dans son état ; sa carte partie de TODO, il se ferme. Le clavier qui était dans son champ y reste.
function setTheDetail() {
  const readEntry = detailOpen === undefined ? undefined : theValidation(detailOpen.projet, detailOpen.ticket);
  if (detailOpen === undefined || readEntry === undefined) {
    detailOpen = undefined;
    detailOfValidation.hidden = true;
    return detailOfValidation.replaceChildren();
  }
  const { ticket, affichage: display } = detailOpen;
  const { projet: project, todo } = readEntry;
  const key = `${project.nom}#${ticket}`;
  const renderTheField = keepTheKeyboard(document.activeElement, detailOfValidation);
  const next = validationNext(project.nom, ticket);
  const screens = todo.captures?.ecrans ?? [];
  detailOfValidation.hidden = false;
  detailOfValidation.replaceChildren(
    setDetailOfValidation(
      document,
      ticket,
      todo,
      validations.get(key) ?? VALIDATION_AT_REST,
      display,
      {
        images: (screen, moment) => {
          const capture = screens.find((oneOf) => oneOf.ecran === screen)?.[moment];
          return capture === undefined ? block("span", "missing") : setImage(project, ticket, screen, capture);
        },
        commentaire: commentsOfValidation.get(key) ?? "",
        cle: key,
        grand: narrow(),
        ...(next === undefined ? {} : { suivante: next.ticket }),
        ...(readOnlyOf(project) === undefined ? {} : { lectureSeule: true }),
      },
      {
        fermer: closeTheDetail,
        reposer: setTheDetail,
        suivante: () => {
          if (next !== undefined) openTheDetail(next.projet, next.ticket);
        },
        valider: () => void validateTheCard(project, ticket, { geste: "valider" }),
        renvoyer: (comment) => void validateTheCard(project, ticket, { geste: "renvoyer", commentaire: comment }),
        ecrire: (text) => void commentsOfValidation.set(key, text),
        ouvrirPr: () => void brigade.ouvrirPr(project.nom, ticket),
      },
    ),
  );
  renderTheField();
}

// Échap ferme le détail — ou, une capture ouverte seule, rend l'avant et l'après.
// Les flèches gauche et droite passent d'un écran du ticket à l'autre, sauf dans le champ du commentaire (ticket 3350).
detailOfValidation.addEventListener("keydown", (event) => {
  if (detailOpen === undefined || (event.key !== "ArrowLeft" && event.key !== "ArrowRight")) return;
  if (["TEXTAREA", "INPUT"].includes(/** @type {any} */ (event.target)?.tagName)) return;
  const readEntry = theValidation(detailOpen.projet, detailOpen.ticket);
  if (readEntry !== undefined && changeOf(detailOpen.affichage, readEntry.todo.captures?.ecrans.length ?? 0, event.key === "ArrowLeft" ? -1 : 1)) {
    event.preventDefault();
    setTheDetail();
  }
});
detailOfValidation.addEventListener("keydown", (event) => {
  if (event.key !== "Escape" || detailOpen === undefined) return;
  event.stopPropagation();
  if (detailOpen.affichage.seule === undefined) return closeTheDetail();
  delete detailOpen.affichage.seule;
  setTheDetail();
});

// Les cartes qui attendent le chef, à la largeur d'un téléphone (cartes-du-chef/, ticket 2915) : celles de la colonne
// « Awaiting you » de chaque projet lu, avec leur question — une carte déjà répondue n'y est plus. La vue montrée est la
// liste, une carte ouverte (le brouillon et ce qui a refusé sa réponse sont ceux de la carte), ou l'envoi qu'on vient de faire.
/** @typedef {import("./cards-of-chef/cards-of-chef.js").Card} CardOfChef */
/** @type {{ vu: "liste" } | { vu: "carte", carte: CardOfChef } | { vu: "envoyee", projet: string, ticket: number }} */
let vueOfCards = { vu: "liste" };
/** @returns {CardOfChef[]} */
function theCardsOfChef() {
  return configuration.projets.flatMap((project) => {
    const held = heldOnes.get(project.nom);
    // Une carte d'un projet en lecture seule ne se répond pas d'ici (ticket 3163) : elle n'est pas de cette liste.
    if (held === undefined || !("tableau" in held) || held.tableau.lectureSeule !== undefined) return [];
    const column = held.tableau.rail.colonnes.find(({ nom: name }) => name === COLUMN_WHO_AWAITING_YOU);
    return (column?.cartes ?? []).flatMap((cardItem) => {
      const { todo } = cardItem;
      if (!cardItem.attendu || todo === undefined || (todo.question === null && todo.choix.length === 0)) return [];
      // Validée ou renvoyée d'ici (ticket 3185) : elle a quitté la liste.
      if (isOneValidation(todo) || isOneReview(todo)) return validatedOf(project.nom).has(cardItem.ticket) ? [] : [{ projet: project.nom, ticket: cardItem.ticket, age: cardItem.age?.court ?? "", todo }];
      const state = stateOfTheCard(project, cardItem.ticket, todo);
      const seenOne = seenOfTheCard(todo, state).vu;
      return state.etape === "postee" || seenOne === "attente" || seenOne === "jouee" ? [] : [{ projet: project.nom, ticket: cardItem.ticket, age: cardItem.age?.court ?? "", todo }];
    });
  });
}
// Les lignes du disjoncteur ouvert, en tête de la liste (ticket 3371) : une par projet dont la dernière bande le dit ouvert, avec
// ce que la station en écrit — écrit sous la ligne, un téléphone n'ayant pas de survol (todo-breaker-line.js).
function theLinesOfBreaker() {
  return configuration.projets.filter((project) => itselfLit(project)).flatMap((project) => {
    const alert = alertOfBreaker(project.nom);
    if (alert === undefined) return [];
    const said = configuration.projets.length > 1 ? `${project.nom}: ${alert.dit}` : alert.dit;
    return [setLineOfBreaker(document, { marque: pill(alert.dit, alert.ton), dit: said, ...(alert.releve === undefined ? {} : { pourquoi: alert.releve }) })];
  });
}
function setTheCardsOfChef() {
  if (cardsOfChef.hidden) return;
  const cards = theCardsOfChef();
  const back = () => {
    vueOfCards = { vu: "liste" };
    setTheCardsOfChef();
  };
  // Répondue d'ici, la carte ouverte est postée : l'écran dit l'envoi.
  if (vueOfCards.vu === "carte") {
    const { projet: project, ticket } = vueOfCards.carte;
    if (answersAtCards.get(`${project}#${ticket}`)?.etat.etape === "postee") vueOfCards = { vu: "envoyee", projet: project, ticket };
  }
  const vue = vueOfCards;
  if (vue.vu === "envoyee") {
    const remains = cards.filter(({ projet: project }) => project === vue.projet).length;
    return cardsOfChef.replaceChildren(...setTheSend(document, { ticket: vue.ticket, projet: vue.projet, reste: remains, total: cards.length, retour: back }));
  }
  if (vue.vu === "carte") {
    const { projet: name, ticket } = vue.carte;
    const key = `${name}#${ticket}`;
    // La carte telle que la dernière lecture la dit ; partie du rail, elle ne s'ouvre plus : retour à la liste.
    const readEntry = cards.find((oneOf) => oneOf.projet === name && oneOf.ticket === ticket);
    const project = configuration.projets.find((oneOf) => oneOf.nom === name);
    if (readEntry === undefined || project === undefined) return back();
    // La carte « Validate its screen » (ticket 3185) : la même que dans TODO, ses boutons en 44 px.
    if (isOneValidation(readEntry.todo)) {
      const renderTheField = keepTheKeyboard(document.activeElement, cardsOfChef);
      cardsOfChef.replaceChildren(...setTheCardAside(document, { carte: readEntry, total: cards.length, retour: back }, setTheValidation(project, ticket, readEntry.todo, true)));
      renderTheField();
      return;
    }
    // La carte « review before merge » (ticket 3224) : la même que dans TODO, ses boutons en 44 px.
    if (isOneReview(readEntry.todo)) {
      const renderTheField = keepTheKeyboard(document.activeElement, cardsOfChef);
      cardsOfChef.replaceChildren(...setTheCardAside(document, { carte: readEntry, total: cards.length, retour: back }, setTheReview(project, ticket, readEntry.todo, true)));
      renderTheField();
      return;
    }
    const state = stateOfTheCard(project, ticket, readEntry.todo);
    const refusal = state.etape === "refus" ? { dit: state.dit, detail: state.detail } : undefined;
    const renderTheField = keepTheKeyboard(document.activeElement, cardsOfChef);
    const setOne = setTheCardOfChef(document, {
      carte: readEntry,
      total: cards.length,
      brouillon: draftsOfCards.get(key) ?? "",
      enRoute: state.etape === "envoi",
      ...(refusal === undefined ? {} : { refus: refusal }),
      retour: back,
      ecrire: (text) => {
        draftsOfCards.set(key, text);
        questionsOfDrafts.set(key, readEntry.todo.question ?? readEntry.todo.resume ?? null);
      },
      repondre: (answer) => void answerAtTheCard(project, ticket, answer),
    });
    cardsOfChef.replaceChildren(...setOne);
    renderTheField();
    return;
  }
  const cook = homeSeen === undefined ? undefined : homeSeen.projets.filter((line) => stateOfTheLine(line) === "cooking").length;
  const opinion = phoneSeen?.github === undefined ? [] : setTheListGitHub(document, phoneSeen, configuration.projets.length, () => void forgetThePhone());
  cardsOfChef.replaceChildren(
    ...setTheListOfCards(document, {
      cartes: cards,
      avis: opinion,
      tete: theLinesOfBreaker(),
      ...(cook === undefined ? {} : { ailleurs: ELSEWHERE(cook) }),
      ouvrir: (cardItem) => {
        vueOfCards = { vu: "carte", carte: cardItem };
        setTheCardsOfChef();
      },
    }),
  );
}

// Chaque geste d'une entrée du TODO (cuisine/, `gestesDuTodo`, ticket 4261), joué comme sur sa carte : la réponse d'un
// choix, la validation d'un écran, le merge d'une revue, la reprise d'une carte de WAITING ou son « it arrived ».
/** @type {Record<import("./kitchen/kitchen.js").KindOfAction, (project: Project, ticket: number, answer?: import("../card-todo.ts").Answer) => void>} */
const ACTIONS_OF_TODO = {
  repondre: (project, ticket, answer) => void answerAtTheCard(project, ticket, /** @type {import("../card-todo.ts").Answer} */ (answer)),
  valider: (project, ticket) => void validateTheCard(project, ticket, { geste: "valider" }),
  merger: (project, ticket) => void answerAtTheReview(project, ticket, { geste: "merger" }),
  "attente-reprendre": (project, ticket) => void writeWait(project, "attente-reprendre", ticket),
  "attente-arrivee": (project, ticket) => void arrive(project, ticket),
};

// La réponse du chef à une carte de TODO part par le process principal (card-todo.ts) — une seule à la
// fois. Postée, la carte dit qu'elle attend la cuisine, et le tableau est relu tout de suite ; refusée, elle
// garde ses gestes, et dit pourquoi.
/** @param {Project} project @param {number} ticket @param {import("../card-todo.ts").Answer} answer */
async function answerAtTheCard(project, ticket, answer) {
  const key = `${project.nom}#${ticket}`;
  if (answersAtCards.get(key)?.etat.etape === "envoi") return;
  // Répondre est le geste qui finit la saisie : la carte n'est plus tenue, elle dit où en est sa réponse.
  releaseTheCardOf(project.nom, ticket);
  /** @param {import("./card-todo.js").State} state */
  const set = (state) => {
    answersAtCards.set(key, { question: answer.question, etat: state });
    if (current?.nom === project.nom) setRail(project);
    setTheCardsOfChef();
  };
  set({ etape: "envoi", reponse: answer });
  /** @type {import("../card-todo.ts").Rendered | undefined} */
  let rendered;
  try {
    rendered = await brigade.repondreCarte(project.nom, ticket, answer);
  } catch (error) {
    rendered = { refus: "nothing was sent: the app could not ask the station", detail: error instanceof Error ? error.message : String(error) };
  }
  const suite = afterTheCard(answer, rendered);
  if (suite.etape === "postee") draftsOfCards.delete(key);
  set(suite);
  if (suite.etape === "postee") readTheFacts();
}

// Le projet pas préparé pour Brigade (ticket 2628, épique 2584) : `checkRepoSetup` le lit une fois, à la première pose ;
// `runRepoSetup` le prépare, le même geste que l'ajout d'un projet. Préparé, l'avis s'en va sans recharger.
/** @param {Project} project @param {"page" | "todo"} place */
function opinionOfRepository(project, place) {
  // Un dépôt où le compte ne peut pas écrire ne se prépare pas d'ici (ticket 3163) : la ligne de lecture seule le dit.
  if (!itselfLit(project) || project.depot === undefined || readOnlyOf(project) !== undefined) return undefined;
  const state = repositories.get(project.nom);
  if (state === undefined) {
    repositories.set(project.nom, REPOSITORY_UNKNOWN);
    void readTheRepository(project);
    return undefined;
  }
  // Le projet n'est pas prêt et sa page le dit, une question à la fois (ticket 3166) : l'avis n'y ajoute pas un second geste.
  if (journeyOpen(project.nom)) return undefined;
  const prepare = () => void prepareTheRepository(project);
  return place === "page" ? setOpinionOfRepository(document, "page", state, prepare) : setOpinionOfTodo(document, state, prepare);
}

/** @param {Project} project @param {import("./page-project/repository-not-prepare.js").State} state */
function setTheRepository(project, state) {
  repositories.set(project.nom, state);
  requestsOfStation.preparation(project.nom, state.etape);
  if (current?.nom !== project.nom) return;
  setTheProjectAPrepare();
  setAlerts(project);
  setRail(project);
}

// Rend la phrase d'une lecture qui n'a pas abouti — la page d'un projet pas prêt la dit (ticket 3166) —, rien si elle a abouti.
/** @param {Project} project @returns {Promise<string | undefined>} */
async function readTheRepository(project) {
  const read = /** @type {any} */ (brigade).checkRepoSetup;
  if (typeof read !== "function" || project.depot === undefined) return NOT_REACHED("the setup check");
  try {
    setTheRepository(project, afterTheReadOfRepository(await read(project.depot)));
    return undefined;
  } catch (error) {
    // Une lecture qui échoue ne dit rien de plus sur l'avis : le projet est tenu pour préparé, la prochaine ouverture relit.
    repositories.delete(project.nom);
    return sentenceOfRefusal(error);
  }
}

/** @param {Project} project */
async function prepareTheRepository(project) {
  const state = repositories.get(project.nom);
  const prepare = /** @type {any} */ (brigade).runRepoSetup;
  if (state === undefined || (state.etape !== "manque" && state.etape !== "refus") || typeof prepare !== "function" || project.depot === undefined) return;
  const { verif: check } = state;
  setTheRepository(project, { etape: "en-route", verif: check });
  try {
    setTheRepository(project, afterTheReadOfRepository(await prepare(project.depot)));
  } catch (error) {
    setTheRepository(project, { etape: "refus", verif: check, dit: sentenceOfRefusal(error) });
  }
}

// La page des coûts de l'app (ticket 1022). En tête (cost/head.js), les tokens lancés sur 5 h, 24 h et 7 jours,
// tous projets confondus, et la part de chacun — chaque projet qui a une box, et qu'elle sert encore ;
// un clic sur son nom l'ouvre. Puis les tokens perdus (cost/lost.js) — leur liste repliée à
// l'ouverture, un clic sur le chiffre la déploie —, les tickets les plus chers (cost/expensive.js) — un clic
// sur un ticket, perdu ou cher, ouvre son projet et sa fiche —, et la courbe des derniers jours, une
// série par projet (cost/curve.js).
let lostOpen = false;
function toggleLost() {
  lostOpen = !lostOpen;
  setCost();
}
/** @param {{ nom: string, couleurs?: { onglet?: string, accent?: string } }} projet */
const projectOfCost = ({ nom: name, couleurs: colors }) => ({ nom: name, teinte: colors?.onglet ?? colors?.accent });
// Les chiffres d'autonomie de tous les projets ensemble (autonomy/figures.js, ticket 3222), à côté de leur coût : ceux
// que la page des coûts montre, lus de GitHub.
/** @type {ReturnType<typeof holdTheFiguresOfAutonomy> | undefined} */
let autonomyOfAll;
const openTicketOfAutonomy = (/** @type {string} */ url) => void brigade.ouvrirTicketDAutonomie(url);
function setCost() {
  if (pageOfTheApp !== COSTS) return bodyOfCosts.replaceChildren();
  const projects = configuration.projets.filter((project) => itselfLit(project)).map(projectOfCost);
  autonomyOfAll ??= holdTheFiguresOfAutonomy(document, {
    tous: true,
    lire: (days) => brigade.lireAutonomie(configuration.projets.filter((project) => itselfLit(project)).map(({ nom: name }) => name), days),
    ouvrir: openTicketOfAutonomy,
  });
  bodyOfCosts.replaceChildren(
    setHead(document, projects, costsRead, openSinceTheCosts),
    autonomyOfAll.poser(),
    setLost(document, projects, costsRead, titleOnTheRail, lostOpen, toggleLost, openTicketSinceTheCosts),
    setExpensive(document, projects, costsRead, titleOnTheRail, openTicketSinceTheCosts, configuration.quotaMax, undefined, (name, ticket) => cardOnTheRail(name, ticket)?.moteur),
    setCurve(document, projects, costsRead),
  );
}
// Un projet cliqué sur la page des coûts : son espace s'ouvre.
/** @param {string} name */
function openSinceTheCosts(name) {
  const project = projectOf(name);
  if (project !== undefined) void open(project);
}
// Un ticket cliqué sur la page des coûts : son projet s'ouvre, puis sa fiche, par-dessus le rail. La
// fiche refermée rend le clavier au rail : le bouton cliqué n'est plus à l'écran.
/** @param {string} name @param {number} ticket */
async function openTicketSinceTheCosts(name, ticket) {
  const project = projectOf(name);
  if (project === undefined) return;
  await open(project);
  // Le chef a pu cliquer ailleurs pendant que l'espace s'ouvrait.
  if (current !== project) return;
  openCostCard(name, ticket, rail);
}

// La carte d'un ticket sur le rail d'un projet, si son rail est lu et qu'il y est.
/** @param {string} name @param {number} ticket */
function cardOnTheRail(name, ticket) {
  const held = heldOnes.get(name);
  if (held === undefined || !("tableau" in held)) return undefined;
  const { colonnes: columns, hors: outside } = held.tableau.rail;
  return [...columns.flatMap(({ cartes: cards, autres: others }) => [...cards, ...(others ?? [])]), ...outside].find((cardItem) => cardItem.ticket === ticket);
}

/** @param {string} name @param {number} ticket */
const titleOnTheRail = (name, ticket) => cardOnTheRail(name, ticket)?.titre;

// Un clic sur un ticket d'une cause d'échec, ou sur un des tickets perdus ou les plus chers du projet,
// dans la fiabilité de Cooks — ou sur la page des coûts de l'app, une fois son projet ouvert —, ou sur celui que la
// cuisine a ouvert seule pour ramener ses gates sous leur budget, en tête de la file, ouvre sa fiche,
// par-dessus l'onglet. Un ticket que le rail ne porte pas s'ouvre avec ce qu'en dit la dernière lecture de
// ce qui est en amont — son titre, son issue —, à défaut avec ce que l'on en sait : son numéro.
/** @param {string} name @param {number} ticket @param {HTMLElement} back */
function openCostCard(name, ticket, back) {
  const project = configuration.projets.find((candidate) => candidate.nom === name);
  if (project === undefined) return;
  const without = { sans: "not communicated — the rail of this project is not read" };
  const upstream = upstreams.get(name);
  const inUpstream = upstream === undefined || !("groupes" in upstream) ? undefined : upstream.groupes.flatMap(({ issues }) => issues).find((issue) => issue.ticket === ticket);
  const cardItem =
    cardOnTheRail(name, ticket) ??
    inUpstream?.carte ??
    { ticket, ouvrable: false, attendu: false, attend: [], dit: [], fiche: { titre: without, priorite: without, issue: without } };
  openCard(project, cardItem, back);
}

/** @param {Project} project @param {number} ticket */
async function openIssue(project, ticket) {
  notWritten = (await brigade.ouvrirIssue(project.nom, ticket)) ? "" : `issue #${ticket} was not opened: it is no longer in the latest facts read, its address is not https, or the workstation could not open it`;
  show();
}

// Les checks du dépôt d'un projet, d'une alerte du rail qui en nomme un sans autre geste (ticket 4238) : l'adresse reste au
// process principal, comme celle d'une issue.
/** @param {Project} project */
async function openTheChecks(project) {
  notWritten = (await brigade.ouvrirLesChecks(project.nom)) ? "" : "the repository's checks were not opened: the latest facts read give no issue address to find the repository from, or the workstation could not open it";
  show();
}

// La PR du cook d'un ticket, depuis sa fiche (ticket 1846) : son adresse reste au process principal, comme celle de l'issue.
/** @param {Project} project @param {number} ticket */
async function openPrOfCook(project, ticket) {
  notWritten = (await brigade.ouvrirPrDuCook(project.nom, ticket)) ? "" : `the PR of #${ticket}'s cook was not opened: the latest reading of GitHub no longer gives it, its address is not https, or the workstation could not open it`;
  show();
}

/** @param {Project} project @param {number} ticket */
async function openPr(project, ticket) {
  notWritten = (await brigade.ouvrirPr(project.nom, ticket)) ? "" : `the PR of #${ticket} was not opened: it is no longer among the served tickets of the latest facts read, its address is not https, or the workstation could not open it`;
  show();
}

// L'interrupteur de l'espace, en tête, à droite des onglets (tickets 906, 1406) : une glissière et son
// mot — « project on », « project off » —, lisible sans rien lire d'autre, et un clic le bascule. Ce qui
// en a été lu, mot pour mot, est au survol, avec ce que le clic fait. Pas encore lu, ou pas lu : il ne
// dit ni l'un ni l'autre, et ne bascule rien — ce n'est pas « éteint ». Sa confirmation, quand le clic
// en ouvre une, se pose dessous.
/**
 * @param {string} name @param {boolean | undefined} lit indéfini : pas lu
 * @param {{ pourquoi: string, eteindre: string, allumer: string, clic: () => void, confirmation?: HTMLElement }} pose
 * @returns {HTMLElement[]}
 */
function toggle(name, lit, { pourquoi: why, eteindre: turnOff, allumer: turnOn, clic: click, confirmation }) {
  const flip = switchOfTheApp(
    document,
    {
      texte: `${name} ${lit === undefined ? "…" : lit ? "on" : "off"}`,
      allume: lit,
      libelle: `the ${name}: ${lit === undefined ? "not read" : lit ? "on" : "off"}`,
      titre: `${why}${lit === undefined ? "" : `\n${lit ? turnOff : turnOn}`}`,
    },
    click,
  );
  return [flip, ...(confirmation === undefined ? [] : [confirmation])];
}

// L'interrupteur de l'espace du projet, un seul pour tout le projet (ticket 1406) : allumé, les tickets lancés
// sont pris, le manager juge et découpe, une livraison verte est mergée ; éteint, rien de neuf ne l'est.
// Éteindre part au clic, dans le second ; allumer ouvre sa confirmation, qui dit en une phrase ce que
// le manager va juger. Sa ligne `manager` — le manager le suit, et c'est elle qui le dit —, mot pour
// mot, est au survol.
function setSwitch() {
  const project = current;
  // En lecture seule (ticket 3163), le projet ne s'allume ni ne s'éteint d'ici.
  const cache = project === undefined || !itselfLit(project) || readOnlyOf(project) !== undefined;
  switchProject.hidden = cache;
  if (project === undefined || cache) return switchProject.replaceChildren();
  const key = JSON.stringify(["projet-allumer", "", "interrupteur"]);
  const openOne = aConfirm?.projet === project.nom && aConfirm.cle === key ? aConfirm : undefined;
  const confirmation = openOne === undefined ? undefined : setConfirmation(project, openOne);

  const state = statesOfManager.get(project.nom);
  const readOne = state !== undefined && !("sans" in state) ? state : undefined;
  switchProject.replaceChildren(
    ...toggle("project", readOne?.allume, {
      pourquoi: state === undefined ? "the project switch: first read in progress" : "sans" in state ? `the project switch is not read: ${state.sans}` : state.releve,
      eteindre: "click to switch it off — nothing new is taken, split or merged: it goes straight into the second",
      allumer: "click to switch it on: says first what the manager will judge — nothing goes before your “yes”",
      clic: () => (readOne?.allume ? void writeAction("projet-eteindre") : void openConfirmation(project, key, "projet-allumer")),
      ...(confirmation === undefined ? {} : { confirmation }),
    }),
  );
}

// Le code de l'app, et les clones de brigade parmi les projets, sous cette machine dans Settings (ticket 1700) : une
// ligne chacun — son état en une phrase, l'heure de sa lecture et ce que le process principal en dit au survol
// (delay.ts) —, et son seul geste quand il en a un. L'app en retard, ou à relancer : un bouton la met à jour et la
// relance, sans terminal (catch-up.ts). Le clone d'un projet en retard : la commande qui le met à jour est un bouton,
// elle s'écrit dans un shell, et rien ne l'envoie. La case du logo de la barre le dit aussi, quel que soit l'écran.
function setCode() {
  const entry = document.getElementById("entree-tous");
  if (entry !== null) {
    entry.classList.toggle("perime", codeSeen?.alerte !== undefined);
    entry.title = codeSeen?.alerte === undefined ? "All projects" : `All projects — ${codeSeen.alerte}`;
    entry.ariaLabel = entry.title;
  }
  if (codeSeen === undefined) {
    code.hidden = false;
    code.replaceChildren(rowOfSetting("this app", [block("span", "first read of how far its code is behind origin in progress…")], []));
    return setTheGroups();
  }
  const hour = hourOf(codeSeen.a);
  code.replaceChildren(
    ...codeSeen.clones.map(({ id, etat: state, tete: head, lignes: lines, commande: command, bouton: gesture }, rank) => {
      const said = block("span", head);
      said.dataset.etat = state;
      const help = [`${state === "pas-lu" ? "tried at" : "read at"} ${hour}, re-read when you come back to the window`, ...lines].join("\n");
      /** @type {HTMLElement[]} */
      const control = [];
      if (gesture !== undefined) {
        const created = button(inPassage ? "updating — the app relaunches itself…" : gesture, () => void pass(), "recommande");
        created.disabled = inPassage;
        control.push(created);
      } else if (command !== undefined) control.push(buttonOfCommand(command, () => void putADay(id)));
      // Ce qui n'a pas été écrit, ou pas fait, se lit sous la première ligne, jusqu'à la prochaine demande.
      return rowOfSetting(rank === 0 ? "this app" : "a brigade clone", [said, hover(document, help)], control, rank === 0 ? refusalOfSetting(notUpdated) : []);
    }),
  );
  // L'app installée n'a pas de clone (locations.ts) : sans rien à dire, la ligne n'est pas posée.
  code.hidden = code.childElementCount === 0;
  setTheGroups();
}

// L'app passe à la nouvelle version : elle se met à jour, puis se ferme et repart d'elle-même —
// rien ne revient. Ce qui revient, c'est pourquoi elle reste sur son code : lu sous les clones.
async function pass() {
  notUpdated = "";
  inPassage = true;
  setCode();
  try {
    const rendered = await brigade.passer();
    if (rendered !== undefined) notUpdated = rendered.refus;
  } catch (error) {
    notUpdated = `this app was not updated: ${error instanceof Error ? error.message : String(error)}`;
  }
  inPassage = false;
  setCode();
}

// Une ligne de l'accueil : sa pastille, son nom, ce qui s'y passe — et, au survol, ce qu'elle tait.
// Toute la ligne est un bouton : un clic n'importe où l'ouvre. Elle ne porte aucun autre geste.
/** @param {string} name @param {{ ton: string, dit: string, survol: string, raison?: { phrase: string, survol: string } }} ligne @param {() => void} openThe */
function lineOfHome(name, { ton: your, dit: said, survol: hover, raison: reason }, openThe) {
  const created = document.createElement("button");
  created.type = "button";
  created.className = "ligne";
  created.title = hover;
  created.ariaLabel = `${name} — ${said}${reason === undefined ? "" : ` — ${reason.phrase}`}`;
  const called = block("strong", name);
  called.className = "mono";
  const suite = block("span", "›");
  suite.className = "ouvrir";
  suite.ariaHidden = "true";
  const why = block("span", reason?.phrase ?? "");
  why.className = "pourquoi";
  why.title = reason?.survol ?? "";
  created.append(pill(said, your), called, block("span", said), ...(reason === undefined ? [] : [why]), suite);
  created.addEventListener("click", openThe);
  return created;
}

// La ligne d'une station sur l'accueil : un clic l'ouvre ; à côté, le bouton de ce qui l'empêche de cuire.
// Une station aussi enregistrée sous le compte GitHub du chef (ticket 1778) : ce qui lui est choisi se fond dans sa ligne
// (stations-of-account.js, `ligneFondue`) ; ses cases à cocher sont sur la page de la station.
/** @param {import("../home.ts").LineOfStation} presence @param {import("../stations-of-account.ts").StationRecorded} [recordedOne] */
function lineOfStationOfTheHome(presence, recordedOne) {
  const vue = stationsViews?.stations.find(({ id }) => id === presence.id);
  const station = lineFade(presence, vue?.projets ?? [], recordedOne);
  const line = lineOfHome(station.nom, station, () => openStation(station.id));
  const actions = [];
  // Une station qui ne cuit pas encore : le bouton de sa raison, un geste que l'app fait (stations/reason.ts).
  if (station.raison !== undefined) {
    const { geste: gesture, libelle: wording } = station.raison.bouton;
    const remedy = /** @type {HTMLButtonElement} */ (button(wording, undefined));
    remedy.className = "remede-de-station";
    remedy.ariaLabel = `${wording} — ${station.nom}`;
    remedy.addEventListener("click", () => {
      if (gesture === "ouvrir-la-page") openStation(station.id);
      else if (gesture === "ajouter-un-projet") openAddition();
      else {
        remedy.disabled = true;
        void brigade.panne(station.id, "relire-la-station").finally(() => (remedy.disabled = false));
      }
    });
    actions.push(remedy);
  }
  if (actions.length === 0) return line;
  const rank = document.createElement("div");
  rank.className = "ligne-et-geste";
  const aSide = document.createElement("span");
  aSide.className = "gestes-de-la-ligne";
  aSide.append(...actions);
  rank.append(line, aSide);
  return rank;
}

// Le N de « TODO (N) » d'un projet dont le rail est lu, que l'accueil montre aussi (ticket 3458) : le même compte, des mêmes
// cartes. Rien tant que ce qui attend le chef n'est pas lu — la box muette, la liste pas lue : l'accueil garde alors ce que
// le process principal en dit (home.ts).
/** @param {string} name @returns {number | undefined} */
function accountOfTodo(name) {
  const held = heldOnes.get(name);
  if (held === undefined || !("tableau" in held) || silentOnes.has(name)) return undefined;
  const { compte: account } = tidyTheRail(withoutTheValidated(held.tableau.rail.colonnes, validatedOf(name)));
  return account === "?" ? undefined : Number(account);
}
// Le compte que l'accueil montre de chaque projet, à sa dernière pose : une lecture qui le change le repose.
/** @type {Map<string, number | undefined>} */
const todosOfTheHome = new Map();

// L'accueil : les projets dans l'ordre du fichier, puis les stations, puis la santé — tels que le
// process principal les a dits (home.ts). Un projet qu'il ne dit pas encore attend sa première lecture.
function setHome() {
  const lines = new Map((homeSeen?.projets ?? []).map((line) => [line.nom, line]));
  // Une ligne par projet (home/projects/) : son état parmi les quatre, ses stations, et toute la ligne l'ouvre.
  const actionsOfBlock = { ouvrir: (/** @type {string} */ name) => {
      const project = configuration.projets.find((oneOf) => oneOf.nom === name);
      if (project !== undefined) void open(project);
    }, ajouter: openAddition, pastille: pill };
  const ofProjects = linesOfProjects(
    document,
    configuration.projets.map((project) => {
      /** @type {import("../home.ts").LineOfProject} */
      const expected = { nom: project.nom, ton: "gris", dit: "first read in progress…", survol: "" };
      const line = lines.get(project.nom) ?? expected;
      const stations = (stationsViews?.stations ?? []).filter(({ projets: projects }) => projects.includes(project.nom)).map(({ nom: name }) => name);
      // Ce qui attend le chef : le compte de « TODO (N) » quand son rail est lu, sinon celui du process principal.
      const todo = accountOfTodo(project.nom);
      todosOfTheHome.set(project.nom, todo);
      const awaiting = todo ?? line.attend;
      return { nom: project.nom, etat: stateOfTheLine(line), stations, maintenant: nowOfTheLine(line), ...(awaiting === undefined ? {} : { attend: awaiting }), survol: `${line.dit}${line.survol === "" ? "" : ` — ${line.survol}`}` };
    }),
    actionsOfBlock,
  );
  // Sur le téléphone, les projets sont ceux qu'il lit sur GitHub, connecté (connection-github.js) : la section dit ce
  // qui manque à leur liste.
  projectsOfTheHome.replaceChildren(
    ...(phoneSeen?.github !== undefined
      ? [...setTheListGitHub(document, phoneSeen, ofProjects.length, () => void forgetThePhone()), ...ofProjects]
      : ofProjects.length === 0
        ? (phoneSeen === undefined
          ? [block("p", `${NOT_STILL("project")} “+” in the bar adds one.`)]
          : [block("p", `${NOT_STILL("project on this phone")} A project is added from a computer.`)])
        : ofProjects),
  );
  // « Add a project » est à droite du titre du bloc (Home.dc.html) ; un téléphone n'ajoute pas de projet.
  setAddition(blockOfProjects, phoneSeen === undefined ? buttonOfAddition(document, actionsOfBlock, ofProjects.length === 0) : undefined);
  setTheCardsOfChef();
  setTheRecapOfTheHome();
}

// Le récapitulatif de chaque projet qui se lit (ticket 3581, recap/) : ce que sa cuisine a fait depuis que le chef a regardé,
// lu une fois par ouverture de l'app par la commande `recap` de son runtime (recap/recap-box.ts), et ce qui attend le chef
// dans TODO — les cartes que TODO montre à cet instant. Dès que l'accueil le montre, rien ne le couvrant, le runtime en est
// averti, une fois par projet : son marqueur avance jusqu'à l'instant que ce récapitulatif couvrait, et la prochaine
// ouverture ne redit que ce qui est plus neuf. Un marquage refusé se retente à la pose suivante. Un pont qui ne le porte
// pas (le téléphone), ou qui ne rend rien pour un projet, n'en montre aucun : sans projet à montrer, le bloc n'est pas posé.
function setTheRecapOfTheHome() {
  if (brigade.lireLeRecap === undefined) return recapOfTheHome.replaceChildren();
  const projects = configuration.projets.filter((project) => itselfLit(project));
  for (const { nom: name } of projects) {
    if (recapsRead.has(name) || recapsInRead.has(name)) continue;
    recapsInRead.add(name);
    void Promise.resolve()
      .then(() => brigade.lireLeRecap?.(name))
      .then(
        (readEntry) => (readEntry !== null && typeof readEntry === "object" ? readEntry : null),
        (/** @type {unknown} */ error) => ({ sans: NOT_REACHED("recap"), detail: error instanceof Error ? error.message : String(error) }),
      )
      .then((readEntry) => {
        recapsInRead.delete(name);
        recapsRead.set(name, readEntry);
        setTheRecapOfTheHome();
      });
  }
  const entries = projects.flatMap(({ nom: name }) => {
    const reading = recapsRead.get(name);
    if (reading === null) return [];
    const held = heldOnes.get(name);
    const todo = held === undefined || !("tableau" in held) || silentOnes.has(name) ? undefined : whatAwaitingInTodo(withoutTheValidated(held.tableau.rail.colonnes, validatedOf(name)));
    return [{ projet: name, lecture: reading, todo }];
  });
  recapOfTheHome.replaceChildren(...(entries.length === 0 ? [] : [setTheRecap(document, entries, { ouvrir: (url) => void brigade.ouvrirLaPRDuRecap?.(url) })]));
  // Sa place : sous les premières lignes de l'accueil, au-dessus des projets — quand l'accueil est là.
  if (entries.length === 0) recapOfTheHome.remove();
  else if (recapOfTheHome.parentElement !== all && blockOfThePromise.parentElement === all) blockOfThePromise.after(recapOfTheHome);
  // Montré : l'accueil est à l'écran avec lui — ni caché, ni couvert par « since you were away » ou une page.
  if (all.hidden || recapOfTheHome.parentElement !== all || !sectionAbsence.hidden) return;
  for (const { projet: project, lecture: reading } of entries) {
    if (reading === undefined || !("recap" in reading) || recapsMarks.has(project)) continue;
    recapsMarks.add(project);
    void Promise.resolve()
      .then(() => brigade.marquerLeRecap?.(project, reading.recap.until))
      .then(
        (rendered) => {
          if (rendered === undefined || rendered === null || !("seenUntil" in rendered)) recapsMarks.delete(project);
        },
        () => void recapsMarks.delete(project),
      );
  }
}

// La page d'une station : en tête, son nom, sa pastille et son état en une phrase — « online · 2 cooks
// running », « offline for 12 min » (home.ts) ; sa machine et sa version ne se lisent
// qu'au survol de l'icône d'aide, jamais dans la page. Dessous, ses pannes, chacune avec son bouton ;
// puis les projets qu'elle sert, à lire.
function setPageOfStation() {
  const station = stationsViews?.stations.find(({ id }) => id === stationOpen);
  const line = homeSeen?.stations?.find(({ id }) => id === stationOpen);
  const recordedOne = recordedOpen();
  if (station === undefined && recordedOne !== undefined) {
    // Une machine seulement enregistrée sous le compte du chef : ni pannes, ni plafond, ni retrait — que son état et ses projets.
    const title = block("h2", recordedOne.name);
    title.className = "mono";
    const sentence = stateSays(recordedOne);
    const sentenceSaid = block("span", sentence);
    sentenceSaid.className = "phrase";
    inHeadOfStation.replaceChildren(title, pill(sentence, yourOf(recordedOne)), sentenceSaid, hover(document, detailsOf(recordedOne)));
    setTheSectionsOfStation({ id: recordedOne.id, nom: recordedOne.name });
    outagesOfStation.replaceChildren();
    capOfStation.replaceChildren();
    versionOfStation.replaceChildren();
    removalOfStation.replaceChildren();
  } else if (station === undefined) {
    inHeadOfStation.replaceChildren(block("p", stationsViews === undefined ? READ_OF("your stations on GitHub") : "this station is no longer paired with this app"));
    setTheSectionsOfStation(undefined);
    outagesOfStation.replaceChildren();
    capOfStation.replaceChildren();
    versionOfStation.replaceChildren();
    removalOfStation.replaceChildren();
  } else {
    const title = block("h2", station.nom);
    title.className = "mono";
    const sentence = line?.phrase ?? station.dit;
    const stateSays = block("span", sentence);
    stateSays.className = "phrase";
    // Illisible, ce qui se lit au survol est pourquoi.
    const details = station.etat === "illisible" ? station.ligne : (line?.survol ?? station.machine);
    // Hors ligne, la panne dessous le dit déjà, avec son bouton : l'en-tête ne le redit pas.
    const alreadySays = station.pannes.some(({ sujet: subject }) => subject === "injoignable");
    inHeadOfStation.replaceChildren(title, pill(sentence, line?.ton), ...(alreadySays ? [] : [stateSays]), ...(details === "" ? [] : [hover(document, details)]), ...(line?.note === undefined ? [] : [block("p", line.note)]), setTheCalls(document, line?.appels));
    setCap(line);
    versionOfStation.replaceChildren(...(station.versionDit ? [block("span", station.versionDit)] : []));
    outagesOfStation.replaceChildren(...station.pannes.map((outage) => setOutage(station, outage)));
    setTheSectionsOfStation({ id: station.id, nom: station.nom });
    setRemovedTheStation(station);
  }
  setProjects();
}

// Ce que les sections de la page posées disent : la station, son nom, et la station de ce poste. Elles ne se reposent
// que lorsque l'un d'eux change — une relecture de l'accueil ne les redessine pas — ; la dernière demandée l'emporte.
let sectionsOfStationSet = "";
/** @param {{ id: string, nom: string } | undefined} station */
function setTheSectionsOfStation(station) {
  if (station === undefined) {
    sectionsOfStationSet = "";
    return sectionsOfStation.replaceChildren();
  }
  const locale = projectsSeen?.locale ?? null;
  const vue = stationsViews?.stations.find(({ id }) => id === station.id);
  const max = vue?.max ?? null;
  const setEntries = JSON.stringify([station.id, station.nom, locale, max, vue?.maxDepuis ?? null]);
  if (setEntries === sectionsOfStationSet) return;
  sectionsOfStationSet = setEntries;
  const rests = () => {
    sectionsOfStationSet = "";
    setTheSectionsOfStation(station);
  };
  // Le compte GitHub ne se lit que pour la station de cet ordinateur : c'est son `gh`.
  const account = station.id === locale ? (brigade.compteGitHub?.() ?? Promise.resolve(undefined)).catch(() => undefined) : Promise.resolve(undefined);
  const connections = {
    claude: max === null ? null : { etat: max, depuis: vue?.maxDepuis ?? null },
    gestes: {
      changerGitHub: async () => {
        const start = (await brigade.seConnecterAGitHub?.()) ?? { refus: "GitHub sign-in could not be started: the app gave no answer." };
        // Un refus se dit sous la rangée, en ligne d'erreur (sections/connexions.js).
        if ("refus" in start) return { refus: start.refus };
        rests();
      },
      renouveler: async () => {
        const outage = vue?.pannes.find(({ sujet: subject }) => subject === "connexion-max");
        if (outage === undefined) return "Claude Code is signed in: there is nothing to renew yet.";
        const rendered = await brigade.panne(station.id, outage.cle);
        ifClaudeMissing(rendered);
        return "refus" in rendered ? { refus: rendered.refus } : rendered.fait;
      },
    },
  };
  const settings = brigade.lireReglagesDeLaStation === undefined ? undefined : { lire: async () => (await brigade.lireReglagesDeLaStation?.()) ?? { refus: NOT_REACHED("folders and sandbox") }, ecrire: async (/** @type {any} */ c) => (await brigade.ecrireReglagesDeLaStation?.(c)) ?? { refus: "nothing was changed" } };
  void account.then((github) => setTheShellOfStation(document, { station, locale, reglages: settings, connexions: { ...connections, github } })).then((page) => {
    if (sectionsOfStationSet === setEntries) sectionsOfStation.replaceChildren(page);
  });
}

// L'enregistrement de la station dont la page est ouverte : celui de la machine que la ligne de la liste a fondue avec sa
// présence, ou, seulement enregistrée, celui qui porte cet id (stations-of-account.js, `uneLigneParMachine`).
function recordedOpen() {
  const readEntries = recordedAbsent ? undefined : stateOfRecorded.stations;
  if (readEntries?.state !== "listed") return undefined;
  const line = oneLineByMachine(homeSeen?.stations ?? [], readEntries.stations).find((one) => ("appairee" in one ? one.appairee.id : one.enregistree.id) === stationOpen);
  return line?.enregistree;
}

// Le plafond de cooks de la station, comme sa box le dit — `3 at most — 8 cores`, ou `5 at most — set by you,
// replaces 3 (8 cores)`. Il se lit seulement : une station prend autant de tickets qu'elle déclare de places, et sa déclaration
// se change sur sa machine. Une station dont aucun projet lu ne dit le plafond n'a rien de tout cela.
/** @param {import("../home.ts").LineOfStation | undefined} line */
function setCap(line) {
  if (line?.plafond === undefined) return capOfStation.replaceChildren();
  const { plafond: cap } = line;
  const lines = [];
  const said = block("p", `Cooks at once: ${cap.dit}`);
  said.className = "plafond";
  said.append(levelOf(document, "cooks"));
  lines.push(said);
  capOfStation.replaceChildren(...lines);
}

// Sur la page d'une station, les projets qu'elle sert : ceux dont l'onglet Stations la montre parmi les stations qui le
// servent (station/page/StationProjects.js), chacun un lien vers cet onglet. Elle se lit seulement ; ce qu'elle sert se
// change depuis l'onglet du projet. Tant que les stations ne sont pas lues, le vide n'est pas sûr : la page le dit.
function setProjects() {
  const station = stationsViews?.stations.find(({ id }) => id === stationOpen);
  const recordedOne = recordedOpen();
  const openOne = station !== undefined ? { id: station.id, nom: station.nom } : recordedOne === undefined ? undefined : { id: recordedOne.id, nom: recordedOne.name };
  if (openOne === undefined) return projectsOfTheStation.replaceChildren();
  const now = Date.now();
  const projects = projectsServedBy(
    openOne,
    configuration.projets.map(({ nom: name }) => name),
    (name) => {
      const project = projectOf(name);
      return project === undefined ? [] : servingOf(readOfServing(project, now).base);
    },
  );
  const readable = stationsViews !== undefined && station?.etat !== "illisible";
  projectsOfTheStation.replaceChildren(
    setTheProjectsOfTheStation(document, { projets: projects, lisible: readable }, {
      ouvrir: (name) => {
        const project = projectOf(name);
        if (project === undefined) return;
        retain(name, STATIONS);
        void open(project);
      },
    }),
  );
}

// La station dont « remove the station » demande confirmation, par son gist.
/** @type {string | undefined} */
let removalOfStationRequest;
// Ce que le retrait a refusé, en une ligne ; son détail est au survol.
let removalOfStationRefuses = "";

// « Remove the station », en bas de sa page : un clic ouvre la confirmation, qui dit ce que ça change
// en une ligne ; « cancel » la referme et laisse la station en place, « remove » la retire de l'app
// et ramène à l'accueil. Rien de la station n'est touché : un code neuf l'appaire de nouveau.
/** @param {import("../stations/stations.ts").StationVue} station */
function setRemovedTheStation(station) {
  if (removalOfStationRequest !== station.id) {
    const remove = /** @type {HTMLButtonElement} */ (buttonOfTheFamily(document, "remove the station", undefined, { sorte: "danger" }));
    remove.addEventListener("click", () => {
      removalOfStationRequest = station.id;
      removalOfStationRefuses = "";
      setRemovedTheStation(station);
    });
    return removalOfStation.replaceChildren(remove, ...(removalOfStationRefuses === "" ? [] : [block("p", removalOfStationRefuses)]));
  }
  removalOfStation.replaceChildren(
    confirmationOfAction(
      document,
      { titre: `Remove ${station.nom} from this app?`, prix: `${station.nom} leaves the home and is no longer read; it keeps running, and pairs again with a new code`, oui: "remove", non: CANCEL },
      {
        non: () => {
          removalOfStationRequest = undefined;
          setRemovedTheStation(station);
        },
        oui: () => void removeTheStation(station),
      },
    ),
  );
}

/** @param {import("../stations/stations.ts").StationVue} station */
async function removeTheStation(station) {
  removalOfStationRequest = undefined;
  let rendered;
  try {
    rendered = await brigade.retirerLaStation(station.id);
  } catch (error) {
    rendered = { refus: `${station.nom} was not removed: ${error instanceof Error ? error.message : String(error)}` };
  }
  if ("refus" in rendered) {
    removalOfStationRefuses = rendered.refus;
    return setPageOfStation();
  }
  removalOfStationRefuses = "";
  openAll();
}

// Ce qu'une station dit du projet qu'on lui a confié, en quelques mots, et le ton de sa pastille. Une station
// ajoutée est verte quand elle sert le projet, grise sinon.
/** @param {import("../projects/projects.ts").StationOfProject["etat"]} state */
function kitchenState(state) {
  if (state === "servi") return { dit: "served", ton: "vert" };
  if (state === "a-autoriser") return { dit: "waiting for your authorization on GitHub", ton: "jaune" };
  if (state === "en-preparation") return { dit: "being prepared", ton: "gris" };
  if (state === "refuse") return { dit: "refused", ton: "rouge" };
  return { dit: "not read yet", ton: "gris" };
}

// Une station déclarée par le projet qui n'en sert pas le dépôt : ce n'est pas qu'elle est hors ligne.
const NOT_SERVES_NOT = "does not serve this project";

// Les stations qui font la cuisine d'un projet de l'app : celles qui le servent — qu'il leur ait été
// confié d'ici ou non, elles le publient (stations/document.ts) —, puis celles à qui l'app l'a demandé
// et qui ne le servent pas encore. `demande` : l'app en a déjà demandé la cuisine — une station de plus
// en reprend le plafond et le calibrage ; `tenue` : une station en porte déjà le suivi.
/** @param {Project} project */
function kitchenOf(project) {
  // La box du projet ne répond pas : celles qui le servent sont dites injoignables, pas servies.
  const silentOne = silentOnes.has(project.nom);
  const request = projectsSeen?.projets.find(({ nom: name }) => name === project.nom);
  const servedCards = (stationsViews?.stations ?? []).filter(({ projets: projects }) => projects.includes(project.nom));
  const stations = [
    ...servedCards.map(({ id, nom: name }) => ({ id, nom: name, ...(silentOne ? { dit: "unreachable", ton: "rouge" } : kitchenState("servi")), pourquoi: "", geste: "", survol: silentOne ? `${name} does not answer: the app knows nothing of the kitchen right now` : `${name} serves it`, autoriser: /** @type {string[]} */ ([]), bloquee: false })),
    ...(request?.stations ?? [])
      .filter(({ id }) => !servedCards.some((served) => served.id === id))
      .map((station) => {
        // Une station ajoutée ne sert le projet que lorsqu'elle l'a lu ; avant, la ligne dit où elle en est.
        const readEntry = (stationsViews?.stations ?? []).find(({ id }) => id === station.id);
        // Déclarée par le projet, mais la station en sert d'autres et pas celui-ci : elle n'y cuit pas, et ce n'est pas qu'elle est hors ligne.
        const notServed = station.etat === "attendu" && readEntry !== undefined && readEntry.projets.length > 0 && !readEntry.projets.includes(project.nom);
        const without = notServed ? { pourquoi: NOT_SERVES_NOT, geste: "tick it in its projects" } : station.etat === "attendu" ? { pourquoi: "not received by the station", geste: `open Brigade on ${station.nom}'s computer: it reads what this app asked within a minute; if it stays so, remove it from its page and add it again` } : station.etat === "a-autoriser" ? { pourquoi: "waiting for your authorization on GitHub", geste: "authorize the app on GitHub with the button beside it" } : undefined;
        return { id: station.id, nom: station.nom, ...kitchenState(station.etat), pourquoi: without?.pourquoi ?? "", geste: without?.geste ?? "", survol: station.dit, autoriser: station.autoriser, bloquee: notServed };
      }),
  ];
  return { stations, demande: request !== undefined, tenue: servedCards.length > 0 || request?.suiviPar !== undefined };
}

// « Add a station » (ticket 2487) : offert sur un écran large — l'écran étroit ne règle rien —, pour un projet dont l'app
// connaît le dépôt. Cet ordinateur est proposé si sa station ne sert pas déjà le dépôt ; puis les stations du compte à qui
// il n'est pas choisi. Ouvrir relit l'une et l'autre lecture, et l'étape se repose avec elles.
/** @param {Project} project */
function additionOfStationOf(project) {
  const repository = project.depot ?? projectsSeen?.projets.find(({ nom: name }) => name === project.nom)?.depot ?? "";
  // Ni en lecture seule (ticket 3163) : une station ajoutée ne pourrait rien écrire dans le dépôt.
  if (narrow() || repository === "" || readOnlyOf(project) !== undefined) return {};
  const reading = servedOnes.etat?.lecture;
  const servedHere = reading !== undefined && "depots" in reading ? reading.depots : undefined;
  const readEntries = recordedAbsent ? undefined : stateOfRecorded.stations;
  return {
    ajout: {
      donnees: {
        projet: project.nom,
        ici: WORKSTATION.nom,
        iciOffert: servedHere !== undefined && !servedHere.some((served) => served.toLowerCase() === repository.toLowerCase()),
        stations: readEntries?.state === "listed" ? stationsAPropose(readEntries.stations, repository, projectsSeen?.locale) : [],
      },
      etat: additionOfStation.etatDe(project.nom),
      gestes: {
        ouvrir: () => {
          additionOfStation.ouvrir(project.nom);
          void Promise.all([servedOnes.lire(), readTheRecorded()]).then(restTheTabStations);
        },
        annuler: () => additionOfStation.annuler(project.nom),
        servirIci: () => additionOfStation.servirIci(project.nom, repository, WORKSTATION.nom),
        /** @param {import("../stations-of-account.ts").StationRecorded} station */
        confier: (station) => additionOfStation.confier(project.nom, repository, station),
      },
    },
  };
}

// Ce que les stations du compte ont fait du dépôt du projet, choisi pour elles alors qu'une autre le servait déjà (ticket
// 1790, stations-of-account.js).
/** @param {Project} project */
function additionsOfProject(project) {
  const repository = project.depot ?? projectsSeen?.projets.find(({ nom: name }) => name === project.nom)?.depot ?? "";
  return additionsOfRecorded(recordedAbsent ? undefined : stateOfRecorded.stations, { nom: project.nom, depot: repository });
}

// Où cuit un projet de l'app : la station que ses stations disent le servir (projects.ts, `cuitSur`) —
// pas celle que la demande nomme : un déménagement refusé le laisse cuire là où il cuisait —, à
// défaut celle qui porte son suivi ; ou la station de cet ordinateur, qui le sert sans l'app (ticket 1122) — pas quand sa
// liste de projets servis, lue, ne le porte pas : elle le fait tourner sans le cuire (ticket 3399). `ici` : c'est cet
// ordinateur. Aucune : on ne sait pas encore où il cuit.
/** @param {Project} project @param {ReturnType<typeof kitchenOf>["stations"]} stations @returns {{ id: string | null, nom: string, ici: boolean } | undefined} */
function orCooked(project, stations) {
  const locale = projectsSeen?.locale ?? null;
  const said = projectsSeen?.projets.find(({ nom: name }) => name === project.nom)?.cuitSur;
  if (said !== undefined && said !== null) return { ...said, ici: said.ici || (said.id !== null && said.id === locale) };
  const trackingBy = projectsSeen?.projets.find(({ nom: name }) => name === project.nom)?.suiviPar;
  const itsOwnOne = stations.find(({ id }) => id === trackingBy?.id) ?? stations.find(({ bloquee: blocked }) => !blocked);
  if (itsOwnOne !== undefined) return { id: itsOwnOne.id, nom: itsOwnOne.nom, ici: itsOwnOne.id === locale || project.ici === true };
  if (project.ici === true && servedByThisComputer(project) !== false) return { id: null, nom: "", ici: true };
  return undefined;
}

// Le nom d'une station tel que la page d'un projet le dit : « this Mac » (« this PC » sous Windows) pour celle de cet ordinateur.
/** @param {string} name */
function nameSays(name) {
  return name;
}

// Un déménagement en route, après la station où il cuit encore : vers où, et où il en est au survol.
/** @param {import("../projects/projects.ts").MoveInProgress} inProgress */
function inMovement(inProgress) {
  const step = inProgress.etape === "demandee" ? "asked: it cooks here until the other is ready" : inProgress.etape === "acceptee" ? "accepted: its kitchen is closing here" : "handed over: it opens there in a moment";
  const said = block("span", ` · moving to ${nameSays(inProgress.vers)}…`);
  said.className = "en-mouvement";
  said.title = [`moving ${step}`, inProgress.dit].filter((line) => line !== "").join("\n");
  return said;
}

// Si la cuisine d'un projet peut déménager — et vers quelles stations —, ou pourquoi pas, en une phrase : un projet que l'app
// a confié à une station, qui cuit sur l'une d'elles, sans déménagement accepté en route, et une autre station où aller.
/**
 * @param {Project} project @param {ReturnType<typeof orCooked>} or
 * @param {import("../projects/projects.ts").MoveInProgress | null} inProgress @param {boolean} readEntries
 */
function displacementOf(project, or, inProgress, readEntries) {
  const entrusted = projectsSeen?.projets.some(({ nom: name, suiviPar: trackingBy }) => name === project.nom && trackingBy !== undefined) ?? false;
  const frozen = inProgress !== null && (inProgress.etape === "acceptee" || inProgress.etape === "remise");
  const resumed = inProgress !== null && !frozen;
  const paired = (stationsViews?.stations ?? []).filter(({ etat: state, cuisine: kitchen }) => state !== "illisible" && kitchen !== false);
  const destinations = paired.filter(({ id }) => id !== or?.id || resumed);
  const whyNot = !readEntries
    ? "your stations are still being read on GitHub"
    : !entrusted
      ? `${project.nom} was not added to a station from this app: the app does not move its kitchen`
      : or === undefined || or.id === null
        ? "the app does not know yet which station it cooks on"
        : frozen
          ? "a move is already under way: it finishes first"
          : destinations.length === 0
            ? "no other station of yours can take it: pair another one first"
            : "";
  return { offert: whyNot === "", pourquoiPas: whyNot, destinations, fige: frozen, repris: resumed };
}

// Le geste qui déménage la cuisine du projet affiché, et ce qu'il a rendu. Il n'est offert que pour un
// projet que l'app a confié à une station, et qui cuit sur l'une d'elles : c'est de là qu'il part. Un
// déménagement accepté va à son terme : rien d'autre ne se demande avant. Demandé ou refusé, il se
// reprend : la machine où il cuit encore est offerte, pour l'y garder.
/**
 * @param {Project} project @param {ReturnType<typeof orCooked>} or
 * @param {import("../projects/projects.ts").MoveInProgress | null} inProgress @param {boolean} readEntries
 */
function setTheMove(project, or, inProgress, readEntries) {
  if (move !== undefined && move.projet !== project.nom) closeMove();
  const { offert, destinations } = displacementOf(project, or, inProgress, readEntries);
  openTheMove.hidden = !offert || move !== undefined || trust !== undefined;
  if (!offert) closeMove();

  // Ce que le dernier déménagement a rendu ; à défaut, un refus de la station visée.
  const ofIt = moveSaysFor.projet === project.nom && moveSaysFor.dit !== "";
  const refusalByIt = inProgress !== null && inProgress.etape === "refusee" ? `${project.nom} stays on ${nameSays(inProgress.de)}: ${nameSays(inProgress.vers)} refused to take it over — ${inProgress.dit}` : "";
  const said = ofIt ? moveSaysFor.dit : refusalByIt;
  const refusal = ofIt ? moveSaysFor.refus : refusalByIt !== "";
  moveSays.classList.toggle("refus", refusal);
  moveSays.replaceChildren(...(said === "" ? [] : [block("span", said)]), ...(ofIt && moveSaysFor.detail !== "" ? [hover(document, moveSaysFor.detail)] : []));
  moveSays.hidden = said === "";

  if (move === undefined || or === undefined) return;
  const since = or.ici && or.nom === "" ? WORKSTATION.nom : or.nom;
  const recommended = projectsSeen?.recommandee ?? null;
  const aims = move;
  // Chaque machine est un bouton ; celle que l'app recommande — toujours allumée — se distingue. Ce que
  // la choisir implique est au survol.
  const machines = destinations.map((station) => {
    const keep = station.id === or.id;
    const named = station.nom;
    const button = /** @type {HTMLButtonElement} */ (buttonOfTheFamily(document, keep ? `keep it on ${named}` : named, undefined, { sorte: !keep && station.id === recommended ? "recommande" : "secondaire" }));
    button.disabled = aims.part;
    button.dataset.vers = station.id;
    button.title = [projectsSeen?.machines[station.id]?.implique ?? "", station.etat === "en-ligne" ? "" : station.dit].filter((line) => line !== "").join(" · ");
    button.addEventListener("click", () => void relocate(project, station.id, { nomme: named, depuis: since, garder: keep }));
    return button;
  });
  const title = block("p", `Move ${project.nom}'s kitchen from ${since} to:`);
  title.className = "titre";
  const theMachines = document.createElement("div");
  theMachines.className = "machines-du-demenagement";
  theMachines.append(...machines);
  const price = block("p", "Its cooks in flight stop and their tickets go back to the rail; its whole journal follows it.");
  price.className = "prix";
  const cancel = /** @type {HTMLButtonElement} */ (button(CANCEL, undefined, "discret"));
  cancel.disabled = aims.part;
  cancel.addEventListener("click", () => {
    closeMove();
    setStationsOfProject();
  });
  theMachines.append(cancel);
  choiceOfMove.replaceChildren(title, theMachines, price);
  choiceOfMove.hidden = false;
}
function openTheChoiceOfMachine() {
  if (current === undefined) return;
  move = { projet: current.nom, part: false };
  moveSaysFor = { projet: "", dit: "", refus: false, detail: "" };
  setStationsOfProject();
  restTheTabStations();
}
openTheMove.addEventListener("click", openTheChoiceOfMachine);
// « Continue without sandbox » : le chef décide pour la station du projet. Ce que le runtime a répondu se dit sous
// la ligne ; l'avertissement, lui, s'en va quand la station publie l'état suivant.
// Les projets dont le chef a décidé de continuer sans bac à sable : le parcours le montre sans attendre la station.
/** @type {Set<string>} */
const decisionsTaken = new Set();
/** @param {string} name */
async function continueWithoutSandbox(name) {
  moveSaysFor = { projet: name, dit: "telling the station to continue without a sandbox…", refus: false, detail: "" };
  setStationsOfProject();
  try {
    const rendered = await brigade.continuerSansBacASable(name);
    if ("fait" in rendered) decisionsTaken.add(name);
    moveSaysFor = "fait" in rendered ? { projet: name, dit: rendered.fait, refus: false, detail: "" } : { projet: name, dit: rendered.refus, refus: true, detail: rendered.detail ?? "" };
  } catch (error) {
    moveSaysFor = { projet: name, dit: "the choice could not be recorded: nothing was changed", refus: true, detail: error instanceof Error ? error.message : String(error) };
  }
  setStationsOfProject();
}
function closeMove() {
  move = undefined;
  choiceOfMove.hidden = true;
  choiceOfMove.replaceChildren();
}
// Déménager : l'opération du runtime part, par le process principal. Ce qu'elle rend se dit sous la
// ligne ; la ligne, elle, ne dit que ce que les stations publient — où il cuit vraiment.
/** @param {Project} project @param {string} to @param {{ nomme: string, depuis: string, garder: boolean }} dits */
async function relocate(project, to, { nomme: named, depuis: since, garder: keep }) {
  if (move === undefined || move.projet !== project.nom) return;
  const aims = move;
  aims.part = true;
  aims.vers = to;
  moveSaysFor = { projet: project.nom, dit: `asking your stations to move ${project.nom}'s kitchen…`, refus: false, detail: "" };
  setStationsOfProject();
  restTheTabStations();
  try {
    const rendered = await brigade.demenagerLaCuisine(project.nom, to);
    // Parti, l'onglet Stations le suit dès maintenant, sur sa ligne du haut (ticket 3195) ; repris, il n'y a plus rien à suivre.
    if (!("refus" in rendered)) {
      if (keep) displacementsRequests.delete(project.nom);
      else displacementsRequests.set(project.nom, { de: since, vers: named, depuis: Date.now() });
    }
    moveSaysFor =
      "refus" in rendered
        ? { projet: project.nom, dit: `${project.nom} stays on ${since}: ${rendered.refus}`, refus: true, detail: rendered.detail ?? "" }
        : keep
          ? { projet: project.nom, dit: `${project.nom} keeps cooking on ${named}: the move is called off`, refus: false, detail: "" }
          : { projet: project.nom, dit: `${project.nom}'s kitchen moves to ${named}: ${since} hands it over as soon as ${named} is ready — until then it cooks on ${since}`, refus: false, detail: "" };
  } catch (error) {
    moveSaysFor = { projet: project.nom, dit: `${project.nom} stays on ${since}: nothing was sent`, refus: true, detail: error instanceof Error ? error.message : String(error) };
  }
  if (move === aims) closeMove();
  if (current?.nom === project.nom) setStationsOfProject();
  restTheTabStations();
}

// Les stations que GitHub dit servir le projet (`facts.stations`, ticket 3472) — arrêtées, hors ligne ou en ligne, avec ou sans ticket en file : la ligne
// des stations les nomme, que le rail ait une panne à dire ou non. Aucune : le projet n'a jamais été servi, ou la station qui le servait a été retirée.
// La ligne de cet ordinateur, quand sa liste ne porte pas le projet, n'en est pas : sa cuisine tourne ici sans le cuire (ticket 3399), la règle de
// `servantesDe` qui en ôte sa carte dans l'onglet Stations.
/** @param {Project} project @returns {string[]} */
function stationsOfGithubOfProject(project) {
  const held = heldOnes.get(project.nom);
  if (held === undefined || !("tableau" in held) || silentOnes.has(project.nom)) return [];
  const servingOnes = new Set(servingOf(readOfServing(project, Date.now()).base).map(({ prise: taking }) => taking));
  return held.tableau.stations?.lignes.map(({ station }) => station).filter((station) => servingOnes.has(station)) ?? [];
}

// La ligne des stations du projet affiché, en tête de son espace — et, s'il est ouvert, le choix de
// celles à qui le confier. Aucune lecture des stations n'est encore arrivée : le vide ne se dit pas.
function setStationsOfProject() {
  const project = current;
  // Le parcours prêt, montré puis quitté : il ne se remontre pas à la visite suivante.
  if (readyShows !== undefined && readyShows !== project?.nom) {
    journeyRanges.add(readyShows);
    readyShows = undefined;
  }
  stationsOfProject.hidden = project === undefined;
  teamOfProject.montrer(project?.nom);
  if (project === undefined) {
    setTheChoice(undefined);
    setTheBlockages(undefined);
    setTheDelay(undefined);
    return;
  }
  if (trust !== undefined && trust.projet !== project.nom) closeTrust();
  const { stations, demande: request, tenue: heldOne } = kitchenOf(project);
  const readEntries = stationsViews !== undefined && projectsSeen !== undefined;
  const or = orCooked(project, stations);
  const named = stations.length === 0 && or === undefined ? stationsOfGithubOfProject(project) : [];
  const inProgress = projectsSeen?.projets.find(({ nom: name }) => name === project.nom)?.demenagement ?? null;
  // Qui cuit le projet n'est plus une ligne de Rail (ticket 3523) : c'est l'étiquette de l'onglet Stations. Ne reste ici que le
  // déménagement en route — et, pour un projet que personne ne cuit, la phrase qui le dit, avec le geste qui le confie à une station.
  if (stations.length > 0 || or !== undefined || named.length > 0) lineOfStationsOfProject.replaceChildren(...(inProgress !== null && inProgress.etape !== "refusee" ? [inMovement(inProgress)] : []));
  else lineOfStationsOfProject.textContent = readEntries ? `No station cooks ${project.nom} yet.` : READ_OF("your stations on GitHub");
  setTheMove(project, or, inProgress, readEntries);
  // Une station du compte qui refuse de l'avoir (ticket 1790) : son nom et sa phrase, une ligne chacune.
  const { refusees: refused } = additionsOfProject(project);
  stationRefused.replaceChildren(
    ...refused.map(({ station, phrase: sentence }) => lineError(document, `${station.name} was not added: ${sentence}`, "", { classe: "ajout-refuse" })),
  );
  stationRefused.hidden = refused.length === 0;
  setTheChoice(project);
  setTheBlockages(project);
  setTheDelay(project);
  openTheTrust.textContent = stations.length === 0 && named.length === 0 && !itselfLit(project) && project.sansStation !== true ? "choose its machine" : "+ station";
  // « + station » n'est plus sur Rail : une station s'ajoute depuis l'onglet Stations (ticket 3523).
  openTheTrust.hidden = trust !== undefined || move !== undefined || !readEntries || openTheTrust.textContent === "+ station";
  const seenOne = projectsSeen?.projets.find(({ nom: name }) => name === project.nom);
  const onboarding = seenOne?.onboarding ?? null;
  const retained = setRepositoryHeld(document, { acces: seenOne?.acces ?? null, clone: seenOne?.clone ?? null, refus: seenOne?.refus ?? null, worktree: seenOne?.worktree ?? null, maintenant: Date.now(), copier: (command) => void navigator.clipboard.writeText(command), ouvrir: (url) => void brigade.autoriserSurGitHub(url) });
  repositoryHeld.hidden = retained === null;
  repositoryHeld.replaceChildren(...(retained === null ? [] : [retained]));
  // La station dit ce qui la retient : la phrase qui promet de se préparer « within a minute » ne se dit plus.
  const announcementHeld = onboarding === null && retained === null && Date.now() - trustSaidFor.a < 60_000;
  trustSaid.textContent = trustSaidFor.projet === project.nom && announcementHeld ? trustSaidFor.dit : "";
  setTheJourney(project.nom, onboarding);
  // Les stations sont de l'onglet Stations (ticket 1184). Sur Rail, elles restent en vue tant qu'elles sont ce qui
  // t'attend : le projet ne cuit nulle part, son parcours est à suivre, un choix de machine est ouvert, ou
  // sa cuisine est retenue — un worktree qui ne se prépare pas (ticket 1119). L'accès au dépôt refusé et le refus de
  // la station, eux, sont dits sur Rail par la ligne d'alerte, qui ouvre Stations : une seule ligne (ticket 1185).
  const saysByTheAlert = (seenOne?.acces ?? seenOne?.worktree?.acces ?? seenOne?.refus ?? null) !== null;
  // Sur un écran étroit, elles ne sont ni sur Stations — ce sont des réglages : en ajouter, déménager, le bac à sable —, ni
  // sur la conversation (ticket 1186). Sur Rail, comme sur un écran large.
  const rows = narrow() && tabOf(project) !== RAIL;
  // Sur Stations, l'onglet dit lui-même qui cuit le projet et comment le changer (ticket 3195, stations-tab/) : la ligne des
  // stations, ses gestes et ce qu'ils ont rendu n'y sont pas — seul ce qui retient sa cuisine, son parcours et le choix
  // de sa machine restent en tête.
  const onStations = tabOf(project) === STATIONS;
  lineOfStationsOfProject.hidden = onStations || lineOfStationsOfProject.childElementCount === 0;
  if (onStations) for (const pose of [stationRefused, moveSays, choiceOfMove, openTheMove, openTheTrust]) pose.hidden = true;
  // « move the kitchen » n'est plus sur Rail (ticket 3523) : le déménagement se demande dans l'onglet Stations.
  openTheMove.hidden = true;
  stationsOfProject.hidden =
    rows ||
    (itselfLit(project) && journeyOfProject.hidden && (repositoryHeld.hidden || saysByTheAlert) && stationRefused.hidden && trust === undefined && move?.projet !== project.nom) ||
    (onStations && journeyOfProject.hidden && repositoryHeld.hidden && trust === undefined && trustSaid.textContent === "") ||
    // Sur Rail, rien au-dessus des colonnes qu'un bouton (ticket 3523) : « move the kitchen » est dans l'onglet Stations, qui le dit.
    (journeyOfProject.hidden && (repositoryHeld.hidden || saysByTheAlert) && stationRefused.hidden && trust === undefined && move?.projet !== project.nom && moveSays.hidden && lineOfStationsOfProject.hidden && openTheTrust.hidden && trustSaid.textContent === "");
  if (trust === undefined) return;
  setTheTrust(trust, project, { exclues: stations.map(({ id }) => id), demande: request, tenue: heldOne });
}

// Le temps de l'ajout du projet affiché à son premier ticket servi (ticket 1401) : il court tant qu'aucun n'est servi,
// se repose de lui-même, et se fige à la lecture qui dit le premier servi.
/** @param {Project | undefined} project */
function setTheDelay(project) {
  const seenOne = project === undefined ? undefined : projectsSeen?.projets.find(({ nom: name }) => name === project.nom);
  const pose = setDelay(document, { delai: seenOne?.delai, maintenant: Date.now() });
  delayOfProject.hidden = pose === null;
  delayOfProject.replaceChildren(...(pose === null ? [] : [pose]));
  setTheOfferOfPhone(project);
}

// L'offre du téléphone, sur la page du premier projet servi seulement — ni sur le téléphone, ni rangée, ni quand un
// téléphone est déjà connecté : la trace n'est lue qu'une fois le reste tenu.
/** @param {Project | undefined} project */
function setTheOfferOfPhone(project) {
  const shownOne = project !== undefined && phoneSeen === undefined && firstProjectServed(projectsSeen?.projets ?? []) === project.nom && offer.montrable();
  offerOfPhone.hidden = !shownOne;
  offerOfPhone.replaceChildren(...(shownOne ? [setTheOffer(document, offer.etat, offer)] : []));
}
setInterval(() => {
  if (current !== undefined && !delayOfProject.hidden) setTheDelay(current);
}, 30_000);

// Le bandeau de santé (ticket 2490, 2921), une section de Settings depuis le ticket 3014 (Rail n'a plus que la bande des
// chiffres, ticket 3013) : les plafonds de durée et le closer. Les plafonds du dépôt se lisent sur GitHub par le process
// principal (caps-duration.ts) — à l'ouverture de Settings, puis au plus une fois la minute tant qu'il reste ouvert, et
// après chaque changement. Un champ en cours de frappe n'est pas reposé.
/** @type {Map<string, import("../caps-duration.ts").ReadOfCaps>} */
const capsRead = new Map();
/** @type {Map<string, number>} */
const capsReadThe = new Map();
const capsInRead = new Set();
/** @type {Map<string, Map<string, import("./project/banner-health/DurationCaps.js").State>>} */
const statesOfCaps = new Map();
/** @type {Set<string>} */
const othersCapsOpen = new Set();
// Le closer du bandeau de santé (ticket 2491), plus bas : sa lecture, ses états.
/** @type {Map<string, import("../closer-health.ts").ReadOfCloser>} */
const closerOfHealthRead = new Map();
/** @type {Map<string, number>} */
const closerOfHealthReadThe = new Map();
const closerInRead = new Set();
/** @type {Map<string, Map<string, import("./project/banner-health/DurationCaps.js").State>>} */
const statesOfCloser = new Map();
/** @type {Map<string, import("./project/banner-health/Closer.js").StateOfVerifications>} */
const verificationsOfCloser = new Map();
/** @type {Set<string>} */
const candidatesOpen = new Set();
// Les chiffres d'autonomie de chaque projet (autonomy/figures.js, ticket 3222), dans sa section, lus de GitHub.
/** @type {Map<string, ReturnType<typeof holdTheFiguresOfAutonomy>>} */
const autonomyOfProjects = new Map();
// Le savoir-faire du projet (know-how/, ticket 4239), dans la même section : lu sur GitHub par le process principal.
/** @type {Map<string, ReturnType<typeof holdTheKnowledge>>} */
const knowledgeOfProjects = new Map();
/** @param {Project} project */
function knowledgeOfProject(project) {
  const held = knowledgeOfProjects.get(project.nom) ?? holdTheKnowledge(document, { lire: () => brigade.savoirDuProjet(project.nom), changer: (change) => brigade.changerLeSavoir(project.nom, change), ouvrir: (url) => void brigade.ouvrirLaProposition(url), reposer: (keep) => restTheHealth(project, keep) });
  knowledgeOfProjects.set(project.nom, held);
  return held;
}
/** @param {Project} project */
function autonomyOfProject(project) {
  const heldOne = autonomyOfProjects.get(project.nom) ?? holdTheFiguresOfAutonomy(document, { lire: (days) => brigade.lireAutonomie([project.nom], days), ouvrir: openTicketOfAutonomy });
  autonomyOfProjects.set(project.nom, heldOne);
  return heldOne;
}
// `garder` : une relecture ne repose pas un champ où le chef est en train d'écrire ; ce que ses gestes rendent, si.
// Les post-mortems de panne du projet (ticket 4023), d'après les derniers faits de sa box — rien de lu tant qu'elle ne les donne pas.
/** @param {Project} project */
function postMortemsOf(project) {
  const held = /** @type {{ tableau?: { postMortems?: import("../projects/post-mortems.ts").VueOfPostMortems } } | undefined} */ (heldOnes.get(project.nom));
  return silentOnes.has(project.nom) ? undefined : held?.tableau?.postMortems;
}
/** @param {Project} project @param {boolean} [keep] */
function setTheBannerOfHealth(project, keep = true) {
  const tape = /** @type {HTMLElement | null} */ (document.activeElement);
  if (keep && (tape?.tagName === "INPUT" || tape?.tagName === "SELECT") && tape.closest?.('[data-bloc="plafonds-duree"], [data-bloc="closer"], [data-bloc="know-how"]') && bannerHealth.contains(tape)) return;
  const seenOne = projectsSeen?.projets.find(({ nom: name }) => name === project.nom);
  const states = statesOfCaps.get(project.nom) ?? new Map();
  statesOfCaps.set(project.nom, states);
  const reading = capsRead.get(project.nom);
  // Sous le titre de sa section de Settings, ce qui se règle ou s'ouvre : les plafonds de durée, le closer, et les lignes
  // de tous les projets ; avant les chiffres d'autonomie, le temps de chaque phase de la pass que la station publie (ticket 3512).
  bannerHealth.replaceChildren(
    setBlockCapsDuration(document, {
      ...(reading === undefined ? {} : { lecture: reading }),
      ...(seenOne?.temps === undefined ? {} : { lostTimeMaxMin: seenOne.temps.lostTimeMaxMin }),
      etats: states,
      autresOuverts: othersCapsOpen.has(project.nom),
      basculerAutres: (opened) => void (opened ? othersCapsOpen.add(project.nom) : othersCapsOpen.delete(project.nom)),
      choisir: (key, chosen) => void states.set(key, { ...states.get(key), choisi: chosen }),
      changer: (key, input) => void changeOneCap(project, key, input),
      ouvrir: (url) => void brigade.ouvrirLaProposition(url),
    }),
    setTheCloserOfHealth(project),
    knowledgeOfProject(project).poser(),
    setBlockTimeOfThePass(document, seenOne?.temps),
    autonomyOfProject(project).poser(),
    setBlockPostMortems(document, postMortemsOf(project)),
    ofAllTheProjects,
  );
  if (Date.now() - (capsReadThe.get(project.nom) ?? 0) > 60_000) void readTheCapsDuration(project);
  if (Date.now() - (closerOfHealthReadThe.get(project.nom) ?? 0) > 60_000) void readTheCloserOfHealth(project);
}
/** @param {Project} project @param {boolean} [keep] */
function restTheHealth(project, keep = false) {
  if (current?.nom === project.nom && settingsShown()) setTheBannerOfHealth(project, keep);
}
/** @param {Project} project */
async function readTheCapsDuration(project) {
  if (capsInRead.has(project.nom)) return;
  capsInRead.add(project.nom);
  capsReadThe.set(project.nom, Date.now());
  /** @type {import("../caps-duration.ts").ReadOfCaps} */
  let readEntry;
  try {
    readEntry = (await brigade.plafondsDuree?.(project.nom)) ?? { sans: NOT_REACHED("duration caps"), detail: WITHOUT_BRIDGE };
  } catch (error) {
    readEntry = { sans: NOT_REACHED("duration caps"), detail: error instanceof Error ? error.message : String(error) };
  } finally {
    capsInRead.delete(project.nom);
  }
  capsRead.set(project.nom, readEntry);
  restTheHealth(project, true);
}
// Un champ changé : le process principal propose le plafond par une pull request sur le dépôt (ticket 2920). Tant qu'il
// n'a pas répondu, la rangée dit qu'il s'y met ; ouverte, la PR se dit sous le champ, qui revient à la valeur en vigueur
// — elle ne change qu'une fois la PR mergée ; déjà là, la rangée le dit ; refusé, le refus se dit sous le champ, son
// détail au survol, et ce qui a été tapé reste.
/** @param {Project} project @param {string} key @param {string} input */
async function changeOneCap(project, key, input) {
  const states = statesOfCaps.get(project.nom) ?? new Map();
  statesOfCaps.set(project.nom, states);
  if (states.get(key)?.enCours === true) return;
  states.set(key, { ...states.get(key), enCours: true, dit: undefined });
  restTheHealth(project);
  /** @type {import("../caps-duration.ts").RenderedOfCap} */
  let rendered;
  try {
    rendered = (await brigade.changerPlafondDuree?.(project.nom, key, input)) ?? { refus: "nothing was changed: nothing was sent", detail: WITHOUT_BRIDGE };
  } catch (error) {
    rendered = { refus: "nothing was changed: nothing was sent", detail: error instanceof Error ? error.message : String(error) };
  }
  if ("pr" in rendered) states.set(key, { dit: { pr: rendered.pr, numero: rendered.numero, valeur: rendered.valeur } });
  else if ("fait" in rendered) states.set(key, { dit: { fait: rendered.fait } });
  else states.set(key, { ...states.get(key), enCours: false, dit: rendered });
  restTheHealth(project);
}

// Le closer du bandeau de santé (ticket 2491) : ses passes, ce qu'il vérifie en premier et en plus, ses réglages — lus sur GitHub
// par le process principal (closer-health.ts), à l'ouverture de Settings puis au plus une fois la minute, comme les
// plafonds. Un réglage changé se propose par une pull request (ticket 2920), qui se dit sous sa rangée — la valeur en
// vigueur ne change qu'au merge ; une vérification ajoutée ou retirée s'écrit dans le dépôt, et la liste écrite est reprise.
/** @param {Project} project */
function setTheCloserOfHealth(project) {
  const states = statesOfCloser.get(project.nom) ?? new Map();
  statesOfCloser.set(project.nom, states);
  const verifications = verificationsOfCloser.get(project.nom) ?? {};
  verificationsOfCloser.set(project.nom, verifications);
  const reading = closerOfHealthRead.get(project.nom);
  return setBlockCloser(document, {
    ...(reading === undefined ? {} : { lecture: reading }),
    etats: states,
    verifications,
    valeurs: PROJECT_CALIBRATION,
    candidatsOuverts: candidatesOpen.has(project.nom),
    basculerCandidats: (opened) => void (opened ? candidatesOpen.add(project.nom) : candidatesOpen.delete(project.nom)),
    ouvrir: (url) => void brigade.ouvrirBilan(project.nom, url),
    ouvrirLaPr: (url) => void brigade.ouvrirLaProposition(url),
    choisir: (key, chosen) => void states.set(key, { ...states.get(key), choisi: chosen }),
    changer: (key, input) => void changeOneSettingOfCloser(project, key, input),
    taper: (input) => void (verifications.saisie = input),
    changerVerification: (gesture, input) => void changeOneVerificationOfCloser(project, gesture, input),
  });
}
/** @param {Project} project */
async function readTheCloserOfHealth(project) {
  if (closerInRead.has(project.nom)) return;
  closerInRead.add(project.nom);
  closerOfHealthReadThe.set(project.nom, Date.now());
  /** @type {import("../closer-health.ts").ReadOfCloser} */
  let readEntry;
  try {
    const without = { sans: NOT_REACHED("the closer"), detail: WITHOUT_BRIDGE };
    readEntry = (await brigade.closerDeSante?.(project.nom)) ?? { reglages: without, verifications: without, passes: without };
  } catch (error) {
    const without = { sans: NOT_REACHED("the closer"), detail: error instanceof Error ? error.message : String(error) };
    readEntry = { reglages: without, verifications: without, passes: without };
  } finally {
    closerInRead.delete(project.nom);
  }
  closerOfHealthRead.set(project.nom, readEntry);
  restTheHealth(project, true);
}
/** @param {Project} project @param {string} key @param {string | { model: string, effort: string }} input */
async function changeOneSettingOfCloser(project, key, input) {
  const states = statesOfCloser.get(project.nom) ?? new Map();
  statesOfCloser.set(project.nom, states);
  if (states.get(key)?.enCours === true) return;
  states.set(key, { ...states.get(key), enCours: true, dit: undefined });
  restTheHealth(project);
  /** @type {import("../closer-health.ts").RenderedOfSetting} */
  let rendered;
  try {
    rendered = (await brigade.changerReglageDuCloser?.(project.nom, key, input)) ?? { refus: "nothing was changed: nothing was sent", detail: WITHOUT_BRIDGE };
  } catch (error) {
    rendered = { refus: "nothing was changed: nothing was sent", detail: error instanceof Error ? error.message : String(error) };
  }
  // Comme un plafond : la PR ouverte se dit, la valeur en vigueur reste jusqu'au merge.
  if ("pr" in rendered) states.set(key, { dit: { pr: rendered.pr, numero: rendered.numero, valeur: rendered.valeur } });
  else if ("fait" in rendered) states.set(key, { dit: { fait: rendered.fait } });
  else states.set(key, { ...states.get(key), enCours: false, dit: rendered });
  restTheHealth(project);
}
/** @param {Project} project @param {"ajouter" | "retirer"} gesture @param {string} input */
async function changeOneVerificationOfCloser(project, gesture, input) {
  const state = verificationsOfCloser.get(project.nom) ?? {};
  if (state.enCours !== undefined) return;
  verificationsOfCloser.set(project.nom, { ...state, enCours: gesture === "ajouter" ? "ajouter" : `retirer:${input}`, dit: undefined });
  restTheHealth(project);
  /** @type {import("../closer-health.ts").RenderedOfVerifications} */
  let rendered;
  try {
    rendered = (await brigade.changerVerificationDuCloser?.(project.nom, gesture, input)) ?? { refus: "nothing was changed: nothing was sent", detail: WITHOUT_BRIDGE };
  } catch (error) {
    rendered = { refus: "nothing was changed: nothing was sent", detail: error instanceof Error ? error.message : String(error) };
  }
  // Proposée par une PR (ticket 2920) : la liste en vigueur ne change qu'au merge, la PR se dit sous le champ. Ajoutée, le
  // champ se vide ; retirée, ce qui y était tapé reste.
  const guard = gesture === "ajouter" ? {} : { saisie: state.saisie };
  if ("pr" in rendered) verificationsOfCloser.set(project.nom, { ...guard, dit: { pr: rendered.pr, numero: rendered.numero, geste: rendered.geste, verification: rendered.verification } });
  else if ("fait" in rendered) verificationsOfCloser.set(project.nom, { ...guard, dit: { fait: rendered.fait } });
  else verificationsOfCloser.set(project.nom, { ...state, enCours: undefined, dit: rendered });
  if (!("refus" in rendered)) {
    const readEntry = closerOfHealthRead.get(project.nom);
    if (readEntry !== undefined) closerOfHealthRead.set(project.nom, { ...readEntry, verifications: { liste: rendered.liste } });
  }
  restTheHealth(project);
}

// Les blocages du projet affiché (ticket 1399). Les gestes que l'app sait faire pour en lever un, par l'identifiant
// d'action que la station publie : « choose-station » ouvre le choix de la machine, comme le parcours (ticket 1113) —
// quand le déménagement est offert, qu'une autre station peut le reprendre ; sinon, la ligne dit pourquoi il n'y a pas
// de bouton. Posés après le déménagement, qui le décide. Un lien ne s'ouvre que par le process principal, qui ne
// connaît que les pages que les stations publient.
/** @param {Project | undefined} project */
function setTheBlockages(project) {
  const movable = project !== undefined && (!openTheMove.hidden || move?.projet === project.nom);
  const seenOne = project === undefined ? undefined : projectsSeen?.projets.find(({ nom: name }) => name === project.nom);
  // Un besoin qui a sa carte n'a pas, en plus, sa ligne (ticket 1400).
  const blockages = withoutTheChoice(seenOne?.blocages ?? [], seenOne?.choix ?? [], seenOne?.choisis, choiceHeld.get(seenOne?.nom ?? "")?.retenus);
  const name = project?.nom ?? "";
  const unfoldedOnes = blockagesUnfolded.get(name) ?? new Set();
  for (const id of unfoldedOnes) if (!blockages.some((blockage) => blockage.id === id)) unfoldedOnes.delete(id);
  const pose = setBlockages(document, {
    projet: name,
    blocages: blockages,
    gestes: { "choose-station": movable ? { libelle: "choose another station", faire: openTheChoiceOfMachine } : { sans: "no other station can take it right now" } },
    ouvrir: (url) => void brigade.autoriserSurGitHub(url),
    deplies: unfoldedOnes,
    deplier: (id, opened) => {
      if (opened) unfoldedOnes.add(id);
      else unfoldedOnes.delete(id);
      blockagesUnfolded.set(name, unfoldedOnes);
    },
  });
  blockagesOfProject.hidden = pose === null;
  blockagesOfProject.replaceChildren(...(pose === null ? [] : [pose]));
}

// Les choix que le projet affiché attend (ticket 1400) : une carte par besoin. Un clic écrit l'issue
// dans sa demande (projects/projects.ts, `choisir`) ; écrite, la carte part, sans attendre que la station la relise.
// Ce que la vue retient s'oublie dès que la station ne publie plus le choix en attente.
/** @param {Project | undefined} project */
function setTheChoice(project) {
  const seenOne = project === undefined ? undefined : projectsSeen?.projets.find(({ nom: name }) => name === project.nom);
  const choice = seenOne?.choix ?? [];
  const name = project?.nom ?? "";
  const heldOnes = choiceHeld.get(name) ?? { enCours: new Set(), retenus: new Set(), refus: new Map() };
  for (const id of heldOnes.retenus) if (!choice.some((oneOf) => oneOf.id === id && oneOf.status === "pending")) heldOnes.retenus.delete(id);
  for (const id of heldOnes.refus.keys()) if (!choice.some((oneOf) => oneOf.id === id)) heldOnes.refus.delete(id);
  choiceHeld.set(name, heldOnes);
  const pose = setChoice(document, { projet: name, choix: choice, choisis: seenOne?.choisis, retenus: heldOnes.retenus, enCours: heldOnes.enCours, refus: heldOnes.refus, choisir: (id, issue) => void (issue === "cook-elsewhere" ? openTheStationWhoTHE(name, id, choice) : chooseOneIssue(name, id, issue)) });
  choiceOfProject.hidden = pose === null;
  choiceOfProject.replaceChildren(...(pose === null ? [] : [pose]));
}

// « Cook it on a station that has it » (ticket 1511) n'écrit rien : il ouvre, sur Stations, les réglages d'une station de ce
// poste avec la capacité qui manque offerte. Le chef l'enregistre, ou non ; la station relit ses capacités.
// Aucune station lue, une ligne sous la carte le dit.
/** @param {string} name @param {string} id @param {readonly import("../projects/request.ts").Choice[]} choice */
function openTheStationWhoTHE(name, id, choice) {
  const project = current?.nom === name ? current : undefined;
  const readEntries = declaredEntries.get(name);
  const station = project === undefined || readEntries === undefined ? undefined : stationAOpen(readEntries, { ici: project.ici === true });
  const heldOnes = choiceHeld.get(name);
  if (project === undefined || station === undefined) {
    heldOnes?.refus.set(id, { refus: `${NOT_STILL("station of the project read")} The next check of the installation reads them.` });
    return setStationsOfProject();
  }
  heldOnes?.refus.delete(id);
  const need = choice.find((oneOf) => oneOf.id === id)?.need;
  chooseTab(STATIONS);
  void offerTheCapacity(project, station.nom, need === undefined ? undefined : capacityOfNeed(need));
}

/** @param {string} name @param {string} id @param {string} issue */
async function chooseOneIssue(name, id, issue) {
  const heldOnes = choiceHeld.get(name) ?? { enCours: new Set(), retenus: new Set(), refus: new Map() };
  choiceHeld.set(name, heldOnes);
  if (heldOnes.enCours.has(id)) return;
  heldOnes.enCours.add(id);
  heldOnes.refus.delete(id);
  setStationsOfProject();
  /** @type {{ fait: string } | { refus: string, detail?: string }} */
  let rendered;
  try {
    rendered = await brigade.choisirUneIssue(name, id, issue);
  } catch (error) {
    rendered = { refus: "the choice could not be recorded", detail: error instanceof Error ? error.message : String(error) };
  }
  heldOnes.enCours.delete(id);
  if (rendered !== undefined && "fait" in rendered) heldOnes.retenus.add(id);
  else heldOnes.refus.set(id, rendered ?? { refus: "the choice could not be recorded" });
  setStationsOfProject();
}

// Le parcours du projet affiché, sous la ligne de ses stations (ticket 1111) : ses quatre étapes tant
// qu'il se prépare ; prêt, la phrase qui invite à poser le premier ticket, jusqu'à ce que le chef
// l'écarte ou quitte la page. Chaque page qu'il ouvre est une de celles que la station a publiées.
/** @param {string} name @param {import("../projects/request.ts").Onboarding | null} onboarding */
function setTheJourney(name, onboarding) {
  if (onboarding?.decisionAttendue !== true) decisionsTaken.delete(name);
  else if (decisionsTaken.has(name)) onboarding = afterTheDecision(onboarding);
  const range = onboarding !== null && onboarding.termine && journeyRanges.has(name);
  const pose = range
    ? null
    : journeyOfOnboarding(document, {
        projet: name,
        onboarding,
        maintenant: Date.now(),
        ouvrir: (url) => void brigade.autoriserSurGitHub(url),
        continuerSansBac: () => void continueWithoutSandbox(name),
        autreStation: openTheChoiceOfMachine,
        ecarter: () => {
          journeyRanges.add(name);
          readyShows = undefined;
          setStationsOfProject();
        },
      });
  if (pose !== null && onboarding?.termine === true) readyShows = name;
  journeyOfProject.hidden = pose === null;
  journeyOfProject.replaceChildren(...(pose === null ? [] : [pose]));
}

// Le choix ouvert, posé de nouveau à chaque relecture des stations et des projets : ce que le chef a
// coché ou changé reste, ce qu'il n'a pas touché suit ce qui est proposé. Un projet dont une station a déjà
// la cuisine ne prend que des stations de plus ; une station de plus reprend ce que l'app a déjà demandé, ni
// cooks ni calibrage à redire.
/**
 * @param {NonNullable<typeof trust>} aims @param {Project} project
 * @param {{ exclues: readonly string[], demande: boolean, tenue: boolean }} deja
 */
function setTheTrust(aims, project, { exclues, demande: request, tenue: heldOne }) {
  const locale = projectsSeen?.locale ?? null;
  const paired = thisComputerOfFirst(
    (stationsViews?.stations ?? []).filter(({ id, cuisine: kitchen }) => kitchen !== false && !exclues.includes(id)),
    locale,
  );
  const machines = projectsSeen?.machines ?? {};
  const recommended = projectsSeen?.recommandee ?? undefined;
  const first = !heldOne;
  // Une machine à la fois, proposée d'office tant que le chef n'a rien touché : une station qui peut cuire maintenant —
  // la recommandée, sinon cet ordinateur, sinon la première en ligne (choix-station/). Aucune en ligne : aucune.
  if (!aims.touchee || !paired.some(({ id }) => aims.choisies.has(id))) {
    const proposed = proposedOfOffice(paired, { recommandee: first ? recommended : null, locale });
    aims.choisies = new Set(proposed === undefined ? [] : [proposed]);
  }
  const nameOf = (/** @type {string} */ id) => {
    const station = paired.find((one) => one.id === id);
    return station === undefined ? "" : nameSaid(station, locale);
  };

  titleOfTrust.textContent = first ? `Choose the machine that cooks ${project.nom}.` : `Add a station to ${project.nom}'s kitchen.`;
  meaningOfTrust.textContent = first
    ? "Every station cooks, takes, reviews and merges. Everything below is set to what is recommended: change what you like, or start as it is."
    : "Every station cooks, takes, reviews and merges.";
  // Un projet ajouté depuis l'app connaît son dépôt et sa branche ; un projet écrit à la main les choisit ici.
  const knownOne = project.depot !== undefined && project.base !== undefined;
  // Une station de plus ne les demande jamais (ticket 1307) : la première les sert, ou le clone du projet les dit.
  fieldOfRepository.hidden = !first || knownOne;
  fieldOfTheBase.hidden = !first || knownOne;

  legendOfStationsChosen.textContent = "Machine";
  meaningOfStationsChosen.textContent = "";
  meaningOfStationsChosen.hidden = true;
  choiceOfStationsChosen.replaceChildren(
    ...(paired.length === 0
      ? [block("p", first ? "no station to cook it: pair one first, with “+ station” under All stations, on the home" : "no other paired machine: pair one from the home, with “+ station”")]
      : paired.map((station) => {
          const suggests = machines[station.id];
          return oneMachine(
            document,
            {
              station,
              nom: first ? "station-choisie" : "station-ajoutee",
              ici: station.id === locale,
              choisie: aims.choisies.has(station.id),
              recommandee: first && station.id === recommended && station.etat === "en-ligne",
              implique: suggests?.implique ?? "",
              ordinateur: suggests?.toujoursAllumee === false,
              aria: first ? `${station.nom} cooks it` : `${station.nom} is the station to add`,
            },
            () => {
              aims.touchee = true;
              aims.choisies = new Set([station.id]);
              setStationsOfProject();
            },
          );
        })),
  );
  stationsChosenOfTrust.hidden = false;

  // Les cooks à la fois : ceux de la machine choisie, tirés de ses cœurs à elle — ceux de cet ordinateur tels que le
  // runtime les calcule, sinon ses cœurs publiés. Une station de plus dit aussi son dossier et ses capacités.
  const decide = first && !request;
  const chosenOne = [...aims.choisies][0];
  const withoutMachine = chosenOne === undefined;
  const here = chosenOne !== undefined && chosenOne === locale;
  const defaults = aims.defauts !== undefined && "cooks" in aims.defauts ? aims.defauts : undefined;
  fieldOfCooks.hidden = first ? !decide || withoutMachine : withoutMachine;
  const proposed = here && defaults !== undefined ? defaults : machines[chosenOne ?? ""];
  if (!aims.cooksTouches) cooksOfTrust.value = proposed === undefined ? "" : String(proposed.cooks);
  cooksSaid.textContent = aims.cooksTouches || proposed === undefined ? "" : `recommended — ${proposed.cooksDit}`;
  fieldOfFolder.hidden = first || withoutMachine;
  capacitiesOfTrust.hidden = first || withoutMachine;
  if (!first && chosenOne !== undefined) setTheMachineAdded(aims, chosenOne, nameOf(chosenOne), here, defaults);

  const name = chosenOne === undefined ? "" : nameOf(chosenOne);
  validateTrust.textContent = first ? (name === "" ? "Start the kitchen" : `Start the kitchen on ${name}`) : ADD_ONE_PROJECT;
  actionsOfTrust.hidden = paired.length === 0;
}

// Ce qui est à la machine d'une station de plus (ticket 1307) : le dossier des espaces de travail de ses cooks, et ses
// capacités, une case chacune. Cet ordinateur les dit tels que le runtime les y lit, les cases détectées cochées ;
// une autre machine ne se sonde pas d'ici : son dossier est le sien, et ses cases partent vides. Ce que le chef a
// coché ou décoché reste, par machine, d'une relecture à l'autre.
/**
 * @param {NonNullable<typeof trust>} aims @param {string} id @param {string} name @param {boolean} here
 * @param {Extract<import("../projects/projects.ts").DefaultsOfTheMachine, { cooks: number }> | undefined} defaults
 */
function setTheMachineAdded(aims, id, name, here, defaults) {
  folderOfTrust.value = here ? (defaults?.espaceDeTravail ?? "") : "";
  folderOfTrust.placeholder = here ? "" : `chosen on ${name}`;
  folderSays.textContent = here ? `where ${THIS_COMPUTER}'s station puts its cooks' workspaces` : `${name}'s station chooses it on that machine`;
  legendOfCapacities.textContent = `What ${here ? THIS_COMPUTER : name} can do`;
  const catalog = defaults?.capacites ?? [];
  let ticked = aims.capacites.get(id);
  if (ticked === undefined) {
    ticked = new Set(here ? catalog.filter(({ detectee }) => detectee).map(({ capacite: capacity }) => capacity) : []);
    aims.capacites.set(id, ticked);
  }
  const heldEntries = ticked;
  const refusal = aims.defauts !== undefined && "refus" in aims.defauts ? aims.defauts : { refus: `${THIS_COMPUTER} could not be read`, detail: "" };
  capacitiesChoice.replaceChildren(
    ...(catalog.length === 0
      ? [lineError(document, refusal.refus, refusal.detail ?? "")]
      : catalog.map(({ capacite: capacity, nom: saidOne, detectee }) =>
          caseATick(document, { nom: saidOne, dit: !here ? `not detectable from ${THIS_COMPUTER}` : detectee ? "detected" : `not found on ${THIS_COMPUTER}`, cochee: heldEntries.has(capacity) }, (tickedOne) => {
            if (tickedOne) heldEntries.add(capacity);
            else heldEntries.delete(capacity);
          }),
        )),
  );
}

// Ouvrir le choix : l'heure en est gardée, comme pour le parcours — c'est d'elle que se mesure le temps
// jusqu'au projet servi. Un projet écrit à la main choisit son dépôt parmi ceux du chef, lus sur GitHub.
// Pour une station de plus, ce que cet ordinateur propose est lu avant que le formulaire se montre : chaque champ y
// paraît d'emblée, rempli (ticket 1307).
openTheTrust.addEventListener("click", () => void openTrust());
async function openTrust() {
  const project = current;
  if (project === undefined || openTheTrust.disabled) return;
  /** @type {NonNullable<typeof trust>} */
  const aims = { projet: project.nom, ouvertLe: new Date().toISOString(), depots: [], choisies: new Set(), touchee: false, cooksTouches: false, capacites: new Map() };
  if (kitchenOf(project).tenue) {
    openTheTrust.disabled = true;
    aims.defauts = await defaultsOfThisComputer(project.nom);
    openTheTrust.disabled = false;
    if (current?.nom !== project.nom) return;
  }
  trust = aims;
  formOfTrust.hidden = false;
  trustSaidFor = { projet: "", dit: "", a: 0 };
  trustRefused.replaceChildren();
  baseOfTrust.value = project.base ?? "";
  setStationsOfProject();
  if ((project.depot !== undefined && project.base !== undefined) || aims.defauts !== undefined) return;
  await readTheRepositories(aims, project);
}
/** @param {string} name @returns {Promise<import("../projects/projects.ts").DefaultsOfTheMachine>} */
async function defaultsOfThisComputer(name) {
  try {
    return (await brigade.defautsDeStation(name)) ?? { refus: `${THIS_COMPUTER} could not be read` };
  } catch (error) {
    return { refus: `${THIS_COMPUTER} could not be read`, detail: error instanceof Error ? error.message : String(error) };
  }
}
// Le dépôt à choisir : ceux du chef, lus sur GitHub, avec celui que le projet connaît déjà d'avance.
/** @param {NonNullable<typeof trust>} aims @param {Project} project */
async function readTheRepositories(aims, project) {
  repositoryOfTrust.replaceChildren(new Option(READ_OF("your repositories on GitHub"), ""));
  const readOnes = await brigade.depotsDuChef();
  if (trust !== aims) return;
  if ("refus" in readOnes) {
    repositoryOfTrust.replaceChildren(new Option("— repository —", ""), ...(project.depot === undefined ? [] : [new Option(project.depot, project.depot)]));
    if (project.depot !== undefined) repositoryOfTrust.value = project.depot;
    trustRefused.replaceChildren(lineError(document, readOnes.refus, "", { classe: "" }));
    return;
  }
  aims.depots = readOnes.depots;
  propose(repositoryOfTrust, readOnes.depots.map(({ depot: repository }) => repository), "— repository —");
  if (project.depot !== undefined) {
    if (!readOnes.depots.some(({ depot: repository }) => repository === project.depot)) repositoryOfTrust.append(new Option(project.depot, project.depot));
    repositoryOfTrust.value = project.depot;
  }
}
// Le dépôt choisi propose sa branche par défaut comme branche d'intégration.
repositoryOfTrust.addEventListener("change", () => {
  const chosen = trust?.depots.find(({ depot: repository }) => repository === repositoryOfTrust.value);
  if (chosen !== undefined) baseOfTrust.value = chosen.base;
});
// Une valeur changée par le chef est la sienne : elle ne suit plus ce qui est proposé, et sa
// provenance ne se dit plus.
cooksOfTrust.addEventListener("input", () => {
  if (trust === undefined) return;
  trust.cooksTouches = true;
  cooksSaid.textContent = "";
});
cancelTrust.addEventListener("click", () => {
  closeTrust();
  setStationsOfProject();
});
function closeTrust() {
  trust = undefined;
  formOfTrust.hidden = true;
}
// Lancer : la demande part au process principal, qui l'écrit dans le gist de chaque station choisie
// — ou chaque champ qui manque se lit sous le choix, et rien n'est écrit.
formOfTrust.addEventListener("submit", (event) => {
  event.preventDefault();
  void entrust();
});
async function entrust() {
  const project = current;
  const aims = trust;
  if (project === undefined || aims === undefined || aims.projet !== project.nom) return;
  const chosen = [...aims.choisies];
  const readEntries = chosen.map((id) => (stationsViews?.stations ?? []).find((station) => station.id === id));
  const names = chosen.map((id, rank) => readEntries[rank]?.nom ?? id);
  // Hors ligne, la station choisie prend le projet à son retour (ticket 3187) : la page le dit en clair.
  const absent = readEntries.find((station) => station?.etat === "hors-ligne");
  validateTrust.disabled = true;
  trustRefused.replaceChildren(block("p", "writing the request on your stations' gists…"));
  try {
    const rendered = await brigade.confierAUneStation({
      nom: project.nom,
      depot: !fieldOfRepository.hidden ? repositoryOfTrust.value : (project.depot ?? ""),
      base: !fieldOfTheBase.hidden ? baseOfTrust.value : (project.base ?? ""),
      stations: chosen,
      cooks: fieldOfCooks.hidden && kitchenOf(project).tenue ? "" : cooksOfTrust.value,
      ...(capacitiesOfTrust.hidden ? {} : { capacites: [...(aims.capacites.get(chosen[0] ?? "") ?? [])] }),
      // Le calibrage que l'app recommande (ticket 3187) : il se change dans les réglages du projet, pas ici.
      manager: projectsSeen?.calibrage?.manager ?? { modele: "", effort: "" },
      reviewer: projectsSeen?.calibrage?.reviewer ?? { modele: "", effort: "" },
      ouvertLe: aims.ouvertLe,
    });
    if ("signales" in rendered) trustRefused.replaceChildren(...Object.values(rendered.signales).map((reason) => lineError(document, reason ?? "", "", { classe: "" })));
    else if ("refus" in rendered) trustRefused.replaceChildren(lineError(document, rendered.refus, "", { classe: "" }));
    else {
      if (trust === aims) closeTrust();
      trustRefused.replaceChildren();
      trustSaidFor = {
        projet: project.nom,
        dit:
          absent !== undefined
            ? AT_RETURN(absent.nom, rendered.ajoute)
            : `${rendered.ajoute} is asked of ${names.join(", ")}: ${names.length > 1 ? "each" : "it"} prepares it within a minute — if GitHub asks you to authorize brigade, its button appears on this line`,
        a: Date.now(),
      };
      if (current?.nom === project.nom) setStationsOfProject();
      // Les blocs de Cooks viennent des faits de la box : relus tout de suite, la station neuve y paraît sans attendre.
      readTheFacts();
    }
  } catch (error) {
    trustRefused.replaceChildren(lineError(document, "nothing was sent", error instanceof Error ? error.message : String(error), { classe: "" }));
  }
  validateTrust.disabled = false;
}

// Ce que le bouton d'une panne a rendu, par `<gist> <clé>` : redit à chaque relecture, tant que la
// panne est sur la ligne de sa station.
/** @type {Map<string, string>} */
const outagesSaid = new Map();

// Une panne, sous la ligne de sa station : ce qui ne va pas, en une ligne, et son bouton — relire,
// écarter, se connecter (outages/outages.ts). Jamais une commande à taper.
/** @param {import("../stations/stations.ts").StationVue} station @param {import("../outages/outages.ts").Outage} outage */
function setOutage({ id, nom: name, projets: projects }, outage) {
  const pose = document.createElement("p");
  pose.className = "panne";
  pose.dataset.sujet = outage.sujet;
  const button = buttonOfTheFamily(document, outage.bouton.libelle, () => void playOutage(id, outage.cle, button));
  // L'explication, et ce que le bouton a rendu, ne se lisent qu'au survol.
  const said = outagesSaid.get(`${id} ${outage.cle}`);
  pose.append(block("span", outage.ligne), button, hover(document, said === undefined ? outage.survol : `${outage.survol}. ${said}`));
  // La station est en panne : « report to brigade » à la suite (ticket 1977), le journal lu dans un projet qu'elle sert.
  pose.append(...report.poser({ ...(projects[0] === undefined ? {} : { projet: projects[0] }), reference: { station: name }, panne: `station ${name}: ${outage.ligne}` }));
  return pose;
}
/** @param {string} id @param {string} key @param {HTMLButtonElement} button */
async function playOutage(id, key, button) {
  button.disabled = true;
  let said;
  try {
    const rendered = await brigade.panne(id, key);
    ifClaudeMissing(rendered);
    said = "refus" in rendered ? rendered.refus : rendered.fait;
  } catch (error) {
    said = `nothing was done: ${error instanceof Error ? error.message : String(error)}`;
  }
  outagesSaid.set(`${id} ${key}`, said);
  setPageOfStation();
}

// « + station » ouvre le champ du code, sous la liste des stations ; « cancel » le referme, vide.
openThePairing.addEventListener("click", () => {
  formOfPairing.hidden = false;
  openThePairing.hidden = true;
  codeTape.focus();
});
giveUpPairing.addEventListener("click", () => closeThePairing());
function closeThePairing() {
  formOfPairing.hidden = true;
  openThePairing.hidden = false;
  codeTape.value = "";
  pairingSays.textContent = "";
  pairingSays.title = "";
}
// Le code tapé part au process principal, qui cherche sur GitHub la station qui le montre : elle
// est appairée, le champ se referme, et la liste la montre — rien d'autre ne le dit. Ou le refus se lit
// sous le champ, en une ligne ; ce que GitHub en a dit, au survol.
formOfPairing.addEventListener("submit", (event) => {
  event.preventDefault();
  void pair();
});
async function pair() {
  pairing.disabled = true;
  pairingSays.textContent = "looking for the station that shows this code, on GitHub…";
  pairingSays.title = "";
  try {
    const rendered = await brigade.appairer(codeTape.value);
    if ("refus" in rendered) {
      pairingSays.textContent = rendered.refus;
      pairingSays.title = rendered.detail ?? "";
    } else closeThePairing();
  } catch (error) {
    pairingSays.textContent = "nothing was paired: the app could not ask GitHub";
    pairingSays.title = error instanceof Error ? error.message : String(error);
  }
  pairing.disabled = false;
}

// La mise à jour d'un clone n'est pas lancée : sa commande s'écrit dans un shell, dans
// l'espace d'un projet, que l'on montre — c'est sa note qui dit ce qui a été écrit, et que
// rien n'est parti. Sans projet qui s'ouvre, la raison se lit sous les clones.
/** @param {string} clone */
async function putADay(clone) {
  notUpdated = "";
  try {
    const rendered = await brigade.ecrireMiseAJour(clone);
    if (rendered !== undefined && "refus" in rendered) notUpdated = rendered.refus;
    else if (rendered !== undefined) {
      keep(rendered.projet, rendered);
      const project = projectOf(rendered.projet);
      if (project !== undefined) return void open(project);
    }
  } catch (error) {
    notUpdated = `nothing written: ${error instanceof Error ? error.message : String(error)}`;
  }
  setCode();
}

// La bande d'alertes du projet affiché, en tête de l'espace : une ligne par chose à faire — ce
// qui ne va pas, ce que la box en a écrit, mot pour mot, puis le geste et son prix. Le geste y est
// collé, sous sa forme : un geste du socle, direct ou confirmé — sa confirmation s'ouvre sous la
// ligne ; une demande au second, quand il faut lire, juger ou agir hors de l'app ; l'onglet qui lit
// l'état que la file ne dit pas. Une ligne « non vérifié » dit un état que la box ne dit pas. L'urgence,
// toujours la première, porte sa marque en tête : ce n'est pas une ligne comme les autres. Vide,
// la bande est cachée : elle ne prend aucune place. Un projet sans box n'en a pas — rien n'en est
// lu, et l'espace le dit.
/** @param {Project} project */
function setAlerts(project) {
  // La ligne dont le geste est celui de l'interrupteur de l'espace n'est pas posée : l'interrupteur la
  // dit, et c'est lui qui la lève — le projet éteint (tickets 906, 1406). Non vérifiée, elle se pose :
  // l'interrupteur ne sait pas, la ligne dit pourquoi.
  const alerts = !itselfLit(project) ? [] : (bands.get(project.nom) ?? []).filter(({ appel: call }) => !(call !== undefined && "geste" in call && call.geste === "projet-allumer"));
  actionOfTheEmergency = undefined;
  const opinion = opinionOfRepository(project, "page");
  // En lecture seule, sa ligne vient en tête du projet (ticket 3163) : elle dit pourquoi aucun geste n'est offert.
  const repository = readOnlyOf(project);
  const only = repository === undefined ? [] : [lineReadOnly(document, repository, (page) => void brigade.ouvrirLectureSeule?.(project.nom, page))];
  band.hidden = alerts.length === 0 && opinion === undefined && only.length === 0;
  band.replaceChildren(...only, ...(opinion === undefined ? [] : [opinion]), ...alerts.map((alert) => setAlert(project, alert)));
}

// L'endroit d'une ligne de la bande : son sujet, et ce qu'elle dit — l'urgence par son seul sujet,
// sa phrase change à chaque lecture (« at a standstill for 5 h 00 »). Ce qui y est ouvert — sa
// confirmation, son détail — ne se referme pas sous les yeux du chef.
/** @param {Alert} alerte */
const placeOfTheAlert = ({ sujet: subject, dit: said }) => (subject === "urgence" ? "alerte:urgence" : `alerte:${subject}:${said}`);

// Une ligne de la bande (ticket 907) : une seule ligne — ce qui ne va pas — et un seul contrôle, le
// geste qui le lève. Son prix n'est pas posé à côté : le clic ouvre la confirmation, qui le dit. Ce
// que la ligne sait de plus — pourquoi, ce que la box en écrit mot pour mot, le verdict d'une
// vérification — est replié derrière « detail », dessous.
/** @param {Project} project @param {Alert} alert */
function setAlert(project, alert) {
  const { sujet: subject, verifie: checks, ton: your, dit: said, pourquoi: why, releve: reading, verification } = alert;
  const line = document.createElement("div");
  line.className = "alerte";
  line.dataset.sujet = subject;
  line.dataset.ton = your;
  if (!checks) line.dataset.verifie = "non";
  if (subject === "urgence" && emergencyChosen === project.nom) line.dataset.choisie = "oui";
  const place = placeOfTheAlert(alert);
  const head = document.createElement("p");
  head.className = "ligne";
  const brand = subject === "urgence" ? block("span", "URGENT") : undefined;
  if (brand !== undefined) brand.className = "urgent";
  head.append(pill(said, your), ...(brand === undefined ? [] : [brand]), block("strong", said));

  // Le détail : ce que la ligne sait de plus, à plat une fois déplié — le pourquoi, et le brut de la box,
  // entier. Pas le geste : le seul geste montré est le contrôle de la ligne, un bouton — jamais une
  // commande à recopier (règles de la langue visuelle, ticket 830).
  const key = `${project.nom}\u0000${place}`;
  const unfolded = detailsUnfolded.has(key);
  /** @type {HTMLElement[]} */
  const detail = [
    ...(why === undefined || why.trim() === "" ? [] : [block("p", why)]),
    ...(reading === undefined || reading.trim() === "" ? [] : [exact("pre", reading)]),
    ...(verification === undefined ? [] : setVerdict(project, verification, (text, gesture) => button(text, () => void gesture()), verification.titre !== said)),
  ];
  if (detail.length > 0) {
    const unfold = button("detail", () => {
      if (detailsUnfolded.has(key)) detailsUnfolded.delete(key);
      else detailsUnfolded.add(key);
      setAlerts(project);
    }, "discret");
    unfold.className = "detail";
    unfold.ariaExpanded = String(unfolded);
    unfold.title = unfolded ? "fold the detail" : "what the station says, as is — and why";
    head.append(unfold);
  }
  const [control, ...openOne] = setControl(project, alert, place);
  if (control !== undefined) head.append(control);
  line.append(head);
  // Ce que le chef peut y faire, en clair sous la ligne : pas replié derrière « detail ».
  if (alert.consignes !== undefined && alert.consignes.length > 0) {
    const instructions = document.createElement("ul");
    instructions.className = "consignes";
    instructions.append(...alert.consignes.map((instruction) => block("li", instruction)));
    line.append(instructions);
  }
  if (unfolded && detail.length > 0) {
    const unfoldedOnes = document.createElement("div");
    unfoldedOnes.className = "detail";
    unfoldedOnes.append(...detail);
    line.append(unfoldedOnes);
  }
  // Une confirmation ouverte passe dessous, sur toute la largeur.
  line.append(...openOne);
  return line;
}

// Le contrôle d'une ligne de la bande, et sa confirmation quand elle est ouverte. Un geste du socle :
// direct, il part au clic ; confirmé, le clic ouvre sa confirmation, qui dit son prix (confirmation.ts).
// Une demande au second dont le geste coûte : le clic ouvre une confirmation qui dit ce que coûtera le
// lever — un « oui » écrit la demande dans le second, sans l'envoyer. Sans prix, elle s'écrit au clic.
// Un onglet : il s'ouvre. Sans appel, la ligne n'a pas de contrôle : rien à faire depuis l'app.
/** @param {Project} project @param {Alert} alert @param {string} place @returns {HTMLElement[]} */
function setControl(project, alert, place) {
  const { sujet: subject, geste: lifted, bouton: wording, appel: call, prix: price } = alert;
  if (call === undefined) return [];
  // En lecture seule (ticket 3163), pas de geste du socle : rien qui change le projet.
  if (readOnlyOf(project) !== undefined && "geste" in call) return [];
  const word = wording ?? lifted;
  /** @type {HTMLElement[]} */
  let pose;
  // L'endroit d'un geste du socle est la ligne par son sujet : la confirmation d'un même geste s'ouvre sous la ligne cliquée.
  if ("geste" in call) pose = setAction(project, { id: call.geste, libelle: word, ou: `alerte:${subject}` });
  else if ("demande" in call) {
    // Un prix « none… » est un prix nul : pas de confirmation, la demande s'écrit au clic.
    const cost = /^none\b/i.test(price.trim()) ? "" : priceSays(price);
    const key = JSON.stringify(["demande", "", place]);
    const openOne = aConfirm?.projet === project.nom && aConfirm.cle === key ? aConfirm : undefined;
    const request = button(cost === "" ? word : `${word}…`, () => {
      if (cost === "") return void askAlert(alert);
      notWritten = notWrittenSecond = "";
      actionRate = undefined;
      aConfirm = openOne === undefined ? { projet: project.nom, cle: key, rendu: confirmationOfRequest(cost) } : undefined;
      show();
    });
    request.dataset.geste = "demande";
    request.ariaExpanded = cost === "" ? null : String(openOne !== undefined);
    request.title = cost === "" ? "writes into the second a request about this line — nothing is sent: you press Enter" : "says first what lifting it costs — then writes the request into the second, without sending it";
    pose = openOne === undefined ? [request] : [request, setConfirmation(project, openOne, () => void askAlert(alert))];
  } else if ("relire" in call) {
    // Réessayer maintenant : la box est relue tout de suite, au lieu d'attendre le tour des trente secondes.
    pose = [button(word, () => readTheFacts())];
  } else {
    const { onglet: tab } = call;
    pose = [button(word, () => (leaves.get(project.nom) === tab ? undefined : activer(tab)))];
  }
  const [first] = pose;
  if (subject === "urgence" && first !== undefined) actionOfTheEmergency = first;
  return pose;
}

// La confirmation d'une demande au second : ce que coûtera le lever, en une ligne — le prix que la
// ligne de la bande en dit —, et ce que fait le « oui » : il écrit la demande, rien ne part.
/** @param {string} price @returns {Confirmation} */
const confirmationOfRequest = (price) => ({
  titre: "ask the second to lift it",
  prix: [price, "the second reads, explains, and acts only with you"],
  choix: [{ id: "demande", libelle: YES("write the request"), dit: "written into the second, not sent: your Enter sends it" }],
  renoncer: "no, write nothing",
});

// La bannière d'arrêt : la cuisine est à l'arrêt quand la box le dit, d'un mot.
// Son geste la reprend : confirmé, il dit d'abord ce qu'il relance.
/** @param {Project} project */
function setStopFlag(project) {
  const held = heldOnes.get(project.nom);
  const bannerElement = BANNER;
  stop.hidden = bannerElement === undefined || held === undefined || !("tableau" in held) || !held.tableau.arretee;
  if (stop.hidden || bannerElement === undefined) return stop.replaceChildren();
  const [title, ...suite] = bannerElement.texte;
  const relaunch = KITCHEN_ACTIONS.find(({ id }) => id === bannerElement.bouton);
  const gesture = document.createElement("div");
  gesture.className = "gestes";
  if (relaunch !== undefined && readOnlyOf(project) === undefined) gesture.append(...setAction(project, { ...relaunch, ou: "arret" }));
  stop.replaceChildren(block("strong", title), ...suite.map((line) => block("p", line)), gesture);
}

// Tout ce qui se dessine du projet affiché, d'après ses derniers faits. Le rail en est : il est
// au centre de l'espace, quel que soit l'onglet affiché.
function draw() {
  band.hidden = true;
  stop.hidden = true;
  rail.hidden = true;
  setSwitch();
  setStationsOfProject();
  // Settings d'un projet en lecture seule (ticket 3163) : rien de ce qui se propose à son dépôt n'y est posé (vue.css).
  if (current !== undefined && readOnlyOf(current) !== undefined) state.dataset.lectureSeule = "";
  else delete state.dataset.lectureSeule;
  if (current === undefined) return;
  setAlerts(current);
  setStopFlag(current);
  setRail(current);
}

// Rien ne reste de ce qui était affiché — ni d'un autre projet, ni de celui-ci :
// jusqu'à la première lecture, il n'y a rien à lire.
/** @param {Project} project @param {HTMLElement} head @param {HTMLElement} body */
function wait(project, head, body) {
  if (project.sansStation === true) {
    // Station arrêtée : rien n'est lu. La ligne est celle du rail (poserRail), qui cède la place au
    // rail, à la file et aux cartes dès que la station tourne (la configuration est reposée).
    head.dataset.etat = "sans-station";
    head.textContent = "";
    body.replaceChildren();
  } else if (!itselfLit(project)) {
    head.dataset.etat = "sans-station";
    head.textContent = "no read";
    body.replaceChildren(
      lineError(
        document,
        `“${project.nom}” does not say where its station is: nothing is read`,
        `Its station is not named in ${configuration.chemin}. The app re-reads this file as soon as it changes.`,
      ),
    );
  } else {
    head.dataset.etat = "en-cours";
    head.textContent = "first read in progress…";
    body.replaceChildren();
  }
}

// L'écran affiché — un projet, une station, une page de l'app, l'ajout, ou l'accueil —, retenu le temps de la session de
// la fenêtre (ticket 3159) : rechargée (Cmd+R), la vue s'y rouvre ; l'app relancée, elle s'ouvre sur l'accueil, comme avant.
const KEY_OF_THE_SCREEN = "brigade.ecran";
function holdTheScreen() {
  const screen = current !== undefined ? { projet: current.nom } : adds ? { ajout: true } : stationOpen !== undefined ? { station: stationOpen } : pageOfTheApp !== undefined ? { page: pageOfTheApp } : {};
  try {
    window.sessionStorage?.setItem(KEY_OF_THE_SCREEN, JSON.stringify(screen));
  } catch {
    // Sans stockage, un rechargement rouvre l'accueil.
  }
}
// Avant le premier affichage : l'écran retenu, s'il existe encore. Illisible, ou son projet retiré du fichier : l'accueil.
function resumeTheScreen() {
  /** @type {{ projet?: unknown, ajout?: unknown, station?: unknown, page?: unknown }} */
  let readOne = {};
  try {
    readOne = JSON.parse(window.sessionStorage?.getItem(KEY_OF_THE_SCREEN) ?? "{}") ?? {};
  } catch {
    return;
  }
  const project = configuration.projets.find(({ nom: name }) => name === readOne.projet);
  if (project !== undefined) current = project;
  else if (readOne.ajout === true) adds = true;
  else if (typeof readOne.station === "string") stationOpen = readOne.station;
  else if (readOne.page === COSTS || readOne.page === RESUMES) pageOfTheApp = readOne.page;
}

// La fenêtre s'est rechargée (ticket 3159) : les terminaux ouverts avant sont restés au process principal, chacun dans son
// projet. Chacun retrouve son onglet et ce qu'il avait écrit — rien n'est relancé, ce qu'il écrit ensuite arrive à la
// suite. Ouverte au lancement de l'app, il n'y en a aucun. Une lecture qui échoue n'empêche pas la vue de s'ouvrir :
// chaque terminal revient alors à l'ouverture de son projet (`espace`), sans ce qu'il avait écrit.
async function findAgainTheTerminals() {
  /** @type {import("../terminals.ts").Open[]} */
  let openOnes = [];
  try {
    openOnes = (await brigade.terminauxOuverts?.()) ?? [];
  } catch {
    openOnes = [];
  }
  for (const { terminal, ecrit: written } of openOnes) {
    receive(terminal);
    if (written !== "") vue(terminal.id).xterm.write(written);
  }
  terminalsFoundAgain = true;
}

// L'entrée de la barre qui est affichée : celle du projet courant, la première —
// « Tous les projets » — ou la dernière, l'ajout. Un fichier refusé n'a ni l'une ni l'autre :
// sa raison prend la place du terminal.
function mark() {
  holdTheScreen();
  const refuses = configuration.refus !== undefined;
  const shownEntry = adds ? [...bar.children].findIndex(({ id }) => id === "entree-ajout") : current === undefined ? 0 : configuration.projets.indexOf(current) + 1;
  [...bar.children].forEach((entry, rank) => (entry.ariaCurrent = String(rank === shownEntry)));
  // La fiche d'un projet ne reste pas ouverte quand le chef en quitte l'espace.
  if (openOne !== undefined && openOne.projet.nom !== current?.nom) closeCard();
  // L'espace affiché ne porte pas de signal : il le reprend en le quittant.
  for (const project of configuration.projets) markSignal(project.nom);
  all.hidden = refuses || adds || current !== undefined;
  // À la largeur d'un téléphone, l'accueil est la liste des cartes qui attendent le chef (ticket 2915) : elle prend la place
  // de « Tous les projets », sauf sous une page de l'app, une station ou le premier lancement, qui la couvrent comme lui.
  const underOnePage = stationOpen !== undefined || pageOfTheApp !== undefined || (screenOfFirst !== undefined && screenOfFirst.parentElement === all);
  const onTheCards = narrow() && !all.hidden && !underOnePage;
  cardsOfChef.hidden = !onTheCards;
  if (onTheCards) {
    all.hidden = true;
    setTheCardsOfChef();
  }
  addition.hidden = !adds;
  tint();
  principal.hidden = !refuses && current === undefined;
  columnSecond.hidden = current === undefined;
  readTheTab();
  setTheProjectAPrepare();
  setTheRequestOfStationHere();
  setTheStoryOfFirstTicket();
}

// Tous les projets, dans l'ordre du fichier, puis la station de cet ordinateur (ticket 2638), puis toutes les stations et
// « + station », relues à chaque ouverture (ticket 3195) : l'écran se regarde, et un clic ouvre ce qu'il montre. Ce qui s'y voit se traite dans l'espace du projet, ou sur la page de la station.
function openAll() {
  // Sans projet (ticket 4082), « Tous les projets » est l'écran d'accueil du premier lancement : la marque du logo, et
  // chaque retour des pages de l'app, y ramènent le novice en un clic.
  if (withFirst()) return openFirst();
  current = undefined;
  adds = false;
  stationOpen = undefined;
  pageOfTheApp = undefined;
  mark();
  setCode();
  setHome();
  setCost();
  setBlockStation();
  setStationsOfTheHome();
  all.replaceChildren(blockOfThePromise, ...(recapOfTheHome.childElementCount > 0 ? [recapOfTheHome] : []), blockOfProjects, blockOfTheStation.racine, stationsOfTheHome);
  brigade.tous(++request);
  void readTheRecorded();
}

// La liste des stations de l'accueil (ticket 1778) : une ligne par machine, dans l'ordre des noms. Une machine appairée
// se dit par sa présence, telle que le process principal l'a dite (home.ts) — en ligne ou non, ce qu'elle fait, les
// projets qu'elle sert —, et, enregistrée aussi sous le compte GitHub du chef, les projets qui lui y sont choisis s'y
// fondent ; une machine seulement enregistrée se dit par son enregistrement (stations-of-account.js). Jamais deux lignes
// pour une même machine : ses deux lectures ne peuvent plus se contredire.
function setStationsOfTheHome() {
  const stations = homeSeen?.stations;
  const readEntries = recordedAbsent ? undefined : stateOfRecorded.stations;
  const lines = oneLineByMachine(stations ?? [], readEntries?.state === "listed" ? readEntries.stations : []);
  // Sans station dans la liste : sa lecture en route, ou, quand le compte n'en a aucune non plus, rien — dessous, la
  // lecture du compte dit comment en installer une. Les appairées pas encore lues, la liste n'est pas dite vide.
  const inRoute = stations === undefined || (!recordedAbsent && readEntries === undefined);
  const withoutNo = readEntries?.state === "listed" && readEntries.unreadable.length === 0;
  listOfStations.replaceChildren(
    ...(lines.length > 0
      ? lines.map((line) => ("appairee" in line ? lineOfStationOfTheHome(line.appairee, line.enregistree) : lineOfTheRecorded(document, line.enregistree, actionsOfRecorded)))
      : inRoute
        ? [block("p", "your stations: first read on GitHub in progress…")]
        : withoutNo
          ? []
          : [block("p", `${NOT_STILL("station")} Install one, then pair it here with “+ station”.`)]),
  );
  setTheVersions();
  const below = recordedAbsent ? [] : readOfAccount(document, stateOfRecorded, actionsOfRecorded, stations !== undefined && lines.length === 0);
  blockOfRecorded.hidden = below.length === 0;
  blockOfRecorded.replaceChildren(...below);
}

// Le bloc de la station de l'accueil (ticket 2640) : celle de cet ordinateur — installée quand les stations du chef la
// nomment, ou que son statut se lit —, et les autres du chef. Rien n'est dit tant que les stations ne sont pas lues.
function setBlockStation() {
  const locale = projectsSeen?.locale ?? null;
  const allEntries = stationsViews?.stations ?? [];
  const saidOne = (/** @type {import("../stations/stations.ts").StationVue} */ { id, nom: name, ligne: line }) => ({ id, nom: name, phrase: line });
  const here = locale === null ? undefined : allEntries.find(({ id }) => id === locale);
  if (stationsViews === undefined && statusRead(statusOfTheStationSeen) === undefined) return blockOfTheStation.lire(undefined);
  // Sans id local, la page de sa station ne s'ouvrirait nulle part : elle n'est pas dite installée.
  if (locale === null || (here === undefined && statusRead(statusOfTheStationSeen) === undefined)) return blockOfTheStation.lire({ station: null });
  const readOne = statusRead(statusOfTheStationSeen) !== undefined;
  const version = readOne ? caseOfHere(WORKSTATION.nom, statusOfTheStationSeen).phrase : undefined;
  const sentence = readOne ? `version ${statusRead(statusOfTheStationSeen)?.stationVersion}` : "installed";
  const theOne = here === undefined ? { id: locale, nom: WORKSTATION.nom, phrase: sentence } : saidOne(here);
  blockOfTheStation.lire({ station: version === undefined ? theOne : { ...theOne, version }, autres: allEntries.filter(({ id }) => id !== locale).map(saidOne) });
}
// Le statut de la station de cet ordinateur (`statutDeLaStation`, le contrat du ticket 2189) : la version qui tourne ici, la
// dernière publiée, et si elle est en retard. Tant que le pont ne le lit pas, la case de ce poste dit sa version inconnue.
/** @type {unknown} */
let statusOfTheStationSeen;
/** @type {import("./standby-machine/standby-machine.js").Standby | undefined} */
let standbyVue;
function setTheVersions() {
  if (phoneSeen !== undefined) return versionsOfStations.replaceChildren();
  const cases = casesOfVersions({ stations: stationsViews?.stations, locale: projectsSeen?.locale ?? null, poste: WORKSTATION.nom, statut: statusOfTheStationSeen });
  versionsOfStations.replaceChildren(setVersionsOfStations(document, cases));
}

// Les stations du compte, lues par le process principal (stations-of-account.ts du runtime). Une relecture garde ce qui
// est posé jusqu'à sa réponse : le bloc ne clignote pas. Seule la dernière demandée est posée.
async function readTheRecorded() {
  const requested = ++readOfRecorded;
  /** @type {import("../stations-of-account.ts").StationsOfAccount | undefined} */
  let readOne;
  try {
    readOne = await brigade.stationsDuCompte?.();
  } catch (error) {
    readOne = { state: "unavailable", cause: "github", reason: "Your stations could not be read: the app failed while reading them.", detail: error instanceof Error ? error.message : String(error) };
  }
  if (requested !== readOfRecorded) return;
  recordedAbsent = readOne === undefined;
  if (readOne !== undefined) stateOfRecorded.stations = readOne;
  followTheExpected();
  setStationsOfTheHome();
  // La page d'un projet dit les stations du compte qui refusent de l'avoir (ticket 1790).
  if (current !== undefined) {
    setStationsOfProject();
    setCooking(current);
  }
}

// Un dépôt que le chef vient de cocher pour une station : elle le lit dans les 30 s, et dit ce qu'elle en fait — elle le
// sert, ou refuse (ticket 1790). Jusqu'à ce qu'elle l'ait dit, les stations
// du compte se relisent toutes les `ATTENTE_D_UN_AJOUT_MS`, au plus `RELECTURES_D_UN_AJOUT` fois : sa réponse se lit sous la
// case au moment de l'ajout, sans que le chef ait à relire.
const WAIT_OF_A_ADDITION_MS = 15_000;
const REVIEWS_OF_A_ADDITION = 8;
let reviewsOfAAddition = 0;
/** @type {ReturnType<typeof setTimeout> | undefined} */
let reviewOfAAddition;
function followTheExpected() {
  clearTimeout(reviewOfAAddition);
  const expected = stateOfRecorded.attendus;
  if (expected === undefined) return;
  const readEntries = stateOfRecorded.stations;
  const station = readEntries?.state === "listed" ? readEntries.stations.find(({ id }) => id === expected.id) : undefined;
  const remaining = expected.depots.filter((repository) => (station?.selection ?? []).includes(repository) && issueOfTheAddition(station, repository) === undefined);
  if (remaining.length === 0 || reviewsOfAAddition >= REVIEWS_OF_A_ADDITION) {
    delete stateOfRecorded.attendus;
    return;
  }
  stateOfRecorded.attendus = { id: expected.id, depots: remaining };
  reviewOfAAddition = setTimeout(() => {
    reviewsOfAAddition += 1;
    void readTheRecorded();
  }, WAIT_OF_A_ADDITION_MS);
}

// Une case cochée ou décochée : la sélection entière de la station s'écrit dans son gist. Ses cases attendent la
// réponse ; écrite, la ligne de la station dit ce qu'elle sert — sinon, pourquoi rien n'a changé.
/** @param {string} id @param {string[]} repositories @returns {Promise<import("../stations-of-account.ts").Choice>} */
async function chooseForOneRecorded(id, repositories) {
  stateOfRecorded.envoi = id;
  delete stateOfRecorded.refus;
  setStationsOfTheHome();
  /** @type {import("../stations-of-account.ts").Choice} */
  let rendered;
  try {
    rendered = (await brigade.choisirLesProjets?.(id, repositories)) ?? { refus: "not saved: the app gave no answer" };
  } catch (error) {
    rendered = { refus: "not saved: the app failed while saving", detail: error instanceof Error ? error.message : String(error) };
  }
  delete stateOfRecorded.envoi;
  const readEntries = stateOfRecorded.stations;
  if ("refus" in rendered) stateOfRecorded.refus = { id, ...rendered };
  else if (readEntries?.state === "listed") {
    const { selection } = rendered;
    const before = readEntries.stations.find((station) => station.id === id)?.selection ?? [];
    stateOfRecorded.stations = { ...readEntries, stations: readEntries.stations.map((station) => (station.id === id ? { ...station, selection } : station)) };
    // Les dépôts cochés à l'instant : la station va dire ce qu'elle en fait.
    const ticks = selection.filter((repository) => !before.includes(repository));
    if (ticks.length > 0) {
      stateOfRecorded.attendus = { id, depots: [...new Set([...(stateOfRecorded.attendus?.id === id ? stateOfRecorded.attendus.depots : []), ...ticks])] };
      reviewsOfAAddition = 0;
      followTheExpected();
    }
  }
  setStationsOfTheHome();
  return rendered;
}

// Le premier lancement, sur un ordinateur neuf (ticket 1434, first-launch.js) : tant que le fichier n'a aucun
// projet, l'app s'ouvre sur les stations du chef et leurs projets, lus par le runtime, à la place de l'accueil —
// « T » reste l'entrée affichée, et y ramène ; « + » mène à l'écran « Add a project ». Un projet s'ouvre d'un clic :
// sa copie se fait, chaque étape se dit sous sa station, puis il entre dans le fichier, et son espace s'ouvre. Une
// connexion à GitHub qui manque se fait d'un bouton ; faite, les stations sont relues — et une ouverture qu'elle
// retenait repart d'elle-même.
/** @type {import("./first-launch.js").StateOfFirst} */
const first = { poste: WORKSTATION.nom, saisie: { projet: "" } };
/** @type {any} */
let screenOfFirst;
let readOfFirst = 0;
// Le projet ouvert, que le fichier n'a peut-être pas encore rendu : son espace s'ouvre dès qu'il y est.
/** @type {string | undefined} */
let firstAOpen;
// Le compte GitHub de cet ordinateur (journey-project/account.js, ticket 2475), que disent le premier lancement et l'écran
// « Add a project » : lu une fois à l'ouverture de l'un ou l'autre, et relu au bout d'une connexion — ou d'un changement de
// compte, qui en est une. Chaque lecture repose les deux.
const accountOfJourney = holdTheAccount({ pont: brigade, rendre: () => setTheFirst() });
/** @returns {import("./journey-project/account.js").StateOfAccount} */
const stateOfJourney = () => ({ ...accountOfJourney.etat, ...(first.connexion === undefined ? {} : { connexion: first.connexion }) });
// Les outils que l'app ne livre pas (ticket 4059, outils-requis/) : la connexion à GitHub et le clone d'un projet
// demandent Git et le GitHub CLI, le login Max demande Claude Code. Un pas qui en manque cède la place à l'écran de
// l'outil manquant — sur le premier lancement, à la place du compte ; ailleurs, dans l'avis —, et reprend où il était
// une fois l'outil là : l'ouverture d'un projet repart, la connexion retrouve son bouton.
/** @type {(() => void) | undefined} */
let resumeAfterTheTools;
const toolsOfJourney = holdTheTools({
  pont: brigade,
  outils: ["git", "gh"],
  rendre: () => setTheToolsHere(),
  quandPret: () => {
    const resume = resumeAfterTheTools;
    resumeAfterTheTools = undefined;
    resume?.();
  },
});
const toolsOfLogin = holdTheTools({ pont: brigade, outils: ["claude"], rendre: () => setTheToolsHere() });
/** @param {ReturnType<typeof holdTheTools>} heldOnes */
const actionsOfTools = (heldOnes) => ({ ouvrir: (/** @type {string} */ url) => void brigade.ouvrirLaPage?.(url), verifier: () => void heldOnes.verifier(true) });
let opinionOfTools = false;
function setTheToolsHere() {
  const onTheFirst = screenOfFirst !== undefined && screenOfFirst.parentElement === all && !all.hidden;
  if (onTheFirst) setTheFirst();
  const heldOnes = [...(onTheFirst ? [] : [toolsOfJourney]), toolsOfLogin].find(({ etat: state }) => state.manque !== undefined);
  if (heldOnes === undefined) {
    if (opinionOfTools) opinion.hidden = true;
    opinionOfTools = false;
    return;
  }
  opinionOfTools = true;
  opinion.replaceChildren(...setTheTools(document, heldOnes.etat, actionsOfTools(heldOnes)), button("close", () => {
      opinion.hidden = true;
      opinionOfTools = false;
    }, "discret"));
  opinion.hidden = false;
}
/** @param {import("../outages/actions.ts").RenderedOfOutage} rendered */
function ifClaudeMissing(rendered) {
  if ("outilManquant" in rendered) void toolsOfLogin.verifier();
}
/** @type {import("./first-launch.js").ActionsOfFirst} */
const actionsOfFirst = {
  ouvrir: (station, project, repository, base) => void openOfAStation(station, project, repository, base),
  seConnecter: () => void itselfConnectAGitHub(),
  ...(brigade.seConnecterAClaude === undefined ? {} : { seConnecterAClaude: () => void itselfConnectAClaude() }),
  changerDeCompte: () => void itselfConnectAGitHub(),
  relireLeCompte: () => void accountOfJourney.lire(),
  relire: () => void rereadTheFirst(),
  ouvrirLaPage: (url) => void brigade.ouvrirLaPage?.(url),
  ajouterUnProjet: () => openAddition(),
  visiter: () => beginTheVisit(),
  outils: actionsOfTools(toolsOfJourney),
};
// Le desktop porte le premier lancement ; un pont qui ne le porte pas s'ouvre sur l'écran « Add a project ».
const withFirst = () => configuration.projets.length === 0 && phone === undefined && brigade.stationsDuChef !== undefined;
function openFirst() {
  current = undefined;
  adds = false;
  stationOpen = undefined;
  pageOfTheApp = undefined;
  mark();
  screenOfFirst = setFirstLaunch(document, { ...first, ...stateOfJourney(), poste: WORKSTATION.nom, outils: toolsOfJourney.etat }, actionsOfFirst);
  all.replaceChildren(screenOfFirst);
  accountOfJourney.lireUneFois();
  if (!toolsOfJourney.etat.lu && toolsOfJourney.etat.enCours === undefined) void toolsOfJourney.verifier();
  if (first.stations === undefined && readOfFirst === 0) void rereadTheFirst();
}

// Reposé à chaque changement — tant qu'il est l'écran montré : un autre l'a remplacé, rien n'y est reposé.
function setTheFirst() {
  // La connexion lancée depuis le rail publié s'y dit aussi (rail-published.js, ticket 1435) — et depuis les stations du compte.
  if (current !== undefined && railsPublished.has(current.nom) && !rail.hidden) setRail(current);
  if (first.connexion === undefined) delete stateOfRecorded.connexion;
  else stateOfRecorded.connexion = first.connexion;
  setStationsOfTheHome();
  // L'écran « Add a project » dit aussi le compte, la connexion en route et le dépôt qui s'ouvre.
  if (adds) setTheAddition();
  if (screenOfFirst === undefined || screenOfFirst.parentElement !== all || all.hidden) return;
  screenOfFirst = setFirstLaunch(document, { ...first, ...stateOfJourney(), poste: WORKSTATION.nom, outils: toolsOfJourney.etat }, actionsOfFirst);
  all.replaceChildren(screenOfFirst);
}

// L'écran « since you were away » : par projet qui se lit, ce que ses résumés disent de l'absence et ce qui attend le chef
// (`lesCartesDuChef`, la liste que l'app tient déjà pour ce qui attend le chef). Reposé seulement quand ce qu'il dit change.
// Son bouton le ferme, et mène à ce qui attend le chef : sa page, ou — à la largeur d'un téléphone — la liste des cartes ; sans
// rien qui attende, à l'accueil.
function setTheAbsence() {
  if (absenceSince === undefined || absenceClosed) return;
  const projects = configuration.projets.filter((project) => itselfLit(project));
  const cards = theCardsOfChef();
  const entries = projects.map(({ nom: name }) => ({
    projet: name,
    lecture: resumesOfTheAbsence.get(name),
    attentes: cards.filter(({ projet: project }) => project === name).map(({ ticket, todo }) => {
      const title = todo.resume ?? todo.question ?? undefined;
      return title === undefined ? { ticket } : { ticket, titre: title };
    }),
  }));
  const signature = JSON.stringify(entries);
  if (signature === absenceSet && !sectionAbsence.hidden) return;
  absenceSet = signature;
  for (const { nom: name } of projects) {
    if (resumesOfTheAbsence.has(name) || readsOfTheAbsence.has(name)) continue;
    readsOfTheAbsence.add(name);
    void Promise.resolve()
      .then(() => brigade.lireLesResumesHebdomadaires(name))
      .then(
        (readEntry) => readEntry,
        (/** @type {unknown} */ error) => ({ projet: name, jour: { sans: NOT_REACHED("weekly summaries") }, resumes: { sans: NOT_REACHED("weekly summaries"), detail: error instanceof Error ? error.message : String(error) } }),
      )
      .then((readEntry) => {
        resumesOfTheAbsence.set(name, readEntry);
        setTheAbsence();
      });
  }
  sectionAbsence.replaceChildren(
    setAbsence(
      document,
      { depuis: absenceSince, projets: entries },
      {
        fermer: (awaiting) => {
          absenceClosed = true;
          sectionAbsence.hidden = true;
          sectionAbsence.replaceChildren();
          const first = awaiting ? cards[0] : undefined;
          const opened = first === undefined ? undefined : projectOf(first.projet);
          if (opened !== undefined && !narrow()) void open(opened);
          else openAll();
          show();
        },
      },
    ),
  );
  sectionAbsence.hidden = false;
}

// L'écran de la visite, par-dessus tout, et la bulle de son étape ; la visite pas commencée ou quittée, rien. L'étape
// désigne ce que l'écran de la cuisine visitée montre à l'instant.
function setTheVisit() {
  const inProgress = visit.etat;
  if (inProgress === undefined) {
    markTheTarget(undefined);
    sectionVisit.hidden = true;
    frameUnderTheVisit.inert = false;
    return sectionVisit.replaceChildren();
  }
  const screen = setTheKitchenVisited(document, kitchenVisited, { quitter: () => visit.quitter(), relire: () => void readTheKitchenVisited() });
  const steps = stepsOfTheVisit(kitchenVisited !== undefined && "tableau" in kitchenVisited ? kitchenVisited.tableau.rail.colonnes : undefined);
  const step = steps[inProgress.rang] ?? steps[0];
  sectionVisit.replaceChildren(
    screen.racine,
    setVisit(document, { etapes: steps, rang: inProgress.rang }, {
      suivante: () => visit.suivante(steps.length),
      // Le seul appel à agir de la dernière étape : l'ajout d'un projet, le même que « add my project ».
      ajouter: () => {
        visit.quitter();
        openAddition();
      },
    }),
  );
  sectionVisit.hidden = false;
  frameUnderTheVisit.inert = true;
  markTheTarget(step === undefined ? undefined : findTheTarget({ rail: screen.rail, second: screen.second }, step.cible));
}

// La visite, choisie sur l'écran d'accueil ou rejouée depuis la barre : de sa première étape, sur la cuisine relue.
function beginTheVisit() {
  visit.commencer();
  void readTheKitchenVisited();
}

// La cuisine de Brigade, lue sur GitHub par le process principal en lectures seules (visit.ts) : aucun clone, aucun
// projet ajouté. Ce qui ne se lit pas — un pont qui ne répond pas, ou qui lève — se dit sur l'écran, avec « read again ».
// Seule la dernière lecture demandée se pose.
async function readTheKitchenVisited() {
  const request = ++readOfTheVisit;
  kitchenVisited = undefined;
  setTheVisit();
  /** @type {import("../visit.ts").KitchenVisited} */
  const readEntry = await Promise.resolve(brigade.lireLaCuisineVisitee?.(REPOSITORY_OF_THE_VISIT)).then(
    (renderedOne) => renderedOne ?? { sans: "Brigade's kitchen could not be read: the app gave no answer." },
    (/** @type {unknown} */ error) => ({ sans: error instanceof Error ? error.message : String(error) }),
  );
  if (request !== readOfTheVisit) return;
  kitchenVisited = readEntry;
  setTheVisit();
}

// La page d'un projet pas encore prêt (ticket 3166, parcours-premier-projet/). La lecture d'un projet qu'« Add a project »
// vient d'ouvrir décide : en lecture seule (ticket 3163), rien ne s'ouvre ; une lecture ratée ne décide rien, la suivante
// décidera. Le parcours ouvert, chaque lecture relit la mise en place tant que le projet ne l'a pas — la PR de mise en
// place mergée, la suivante le dit prêt (ticket 3170).
/** @param {string} name */
function followTheJourney(name) {
  const held = heldOnes.get(name);
  const readOne = held !== undefined && "tableau" in held;
  const project = projectOf(name);
  if (project === undefined || !readOne) return;
  const repository = aGuide.get(name);
  if (repository !== undefined) {
    aGuide.delete(name);
    if (readOnlyOf(project) !== undefined) return;
    journeyOfProjects.commencer(name, repository, alreadyCooked(project, repository));
    // Le premier projet du chef : le fichier n'en a pas d'autre que benomite/brigade, que l'app ajoutait d'elle-même avant
    // la visite en lecture seule (ticket 4087).
    storyOfFirstTicket.projetAjoute(name, configuration.projets.some((other) => other.nom !== name && other.depot !== REPOSITORY_OF_THE_VISIT));
    if (held !== undefined && "tableau" in held) storyOfFirstTicket.observer(name, held.tableau.etapesDesTickets);
    departuresOfProjects.commencer(name);
    void readTheDeparture(name);
    // Les stations du compte se proposent à « qui le cuit » : relues, la question se repose.
    void readTheRecorded().then(() => setTheProjectAPrepare());
    void readPreparation(project);
    if (current?.nom === name) restThePage(project);
    return;
  }
  const journey = journeyOfProjects.de(name);
  if (journey === undefined || journey.pret !== undefined) return;
  const step = repositories.get(name)?.etape;
  if ((journey.station === "ajoutee" || journey.station === "inutile") && step !== "prepare" && step !== "en-route") void readPreparation(project);
  if (current?.nom === name) setTheProjectAPrepare();
}

// Les issues ouvertes du projet et ce que le second en propose, lus par l'app (departure-of-project.ts) : le départ le montre, ou
// s'efface quand il n'y a rien à proposer. Une lecture qui échoue se dit sur l'écran, jamais un écran vide.
/** @param {string} name */
async function readTheDeparture(name) {
  try {
    departuresOfProjects.recu(name, await brigade.departDuProjet(name));
  } catch (error) {
    departuresOfProjects.recu(name, { sans: "the app could not ask the second for its proposals", detail: error instanceof Error ? error.message : String(error) });
  }
}

// Le bouton unique : les lignes restantes, avec les priorités montrées à l'écran, sur le rail.
/** @param {string} name */
async function putTheDepartureOnTheRail(name) {
  const putting = departuresOfProjects.commencerLaMise(name);
  if (putting === undefined) return;
  try {
    const rendered = await brigade.mettreSurLeRail(name, putting.lignes.map(({ ticket, priorite: priority }) => ({ ticket, priorite: priority })));
    if ("fait" in rendered) departuresOfProjects.mise(name, rendered.fait, rendered.refus);
    else departuresOfProjects.miseRatee(name, rendered.refus, rendered.detail ?? "");
  } catch (error) {
    departuresOfProjects.miseRatee(name, "nothing was put on the rail: GitHub could not be reached", error instanceof Error ? error.message : String(error));
  }
}

// La question est posée sur ce projet : sa page n'a qu'elle.
/** @param {string} name */
function journeyOpen(name) {
  const journey = journeyOfProjects.de(name);
  return journey !== undefined && journey.pret === undefined;
}

// Une station cuit déjà le projet — elle le sert, l'app le lui a demandé, ou c'est celle de cet ordinateur : « qui le
// cuit » n'est pas posée.
/** @param {Project} project @param {string} repository */
function alreadyCooked(project, repository) {
  const { stations } = kitchenOf(project);
  const reading = servedOnes.etat?.lecture;
  const here = reading !== undefined && "depots" in reading && reading.depots.some((served) => served.toLowerCase() === repository.toLowerCase());
  return here || stations.length > 0 || orCooked(project, stations) !== undefined;
}

/** @param {Project} project */
async function readPreparation(project) {
  if (preparationsInRead.has(project.nom)) return;
  preparationsInRead.add(project.nom);
  try {
    const failure = await readTheRepository(project);
    journeyOfProjects.illisible(project.nom, failure);
  } finally {
    preparationsInRead.delete(project.nom);
  }
}

// Une station sert le projet : celle de cet ordinateur l'a dans sa liste (projets-servis/), une station dit le servir
// (stations/stations.ts), ses stations disent où il cuit (`cuitSur`), ou sa cuisine tourne ici. Une station à qui il est
// seulement demandé ne le sert pas encore.
/** @param {Project} project @param {string} repository @param {readonly string[]} servedHere */
function servedByOneStation(project, repository, servedHere) {
  const key = repository.toLowerCase();
  const said = projectsSeen?.projets.find(({ nom: name }) => name === project.nom)?.cuitSur;
  return (
    servedHere.some((served) => served.toLowerCase() === key) ||
    (stationsViews?.stations ?? []).some(({ projets: projects }) => projects.includes(project.nom)) ||
    (said !== undefined && said !== null) ||
    project.ici === true
  );
}

// La question du ticket 3400, au-dessus du rail du projet affiché. Sa mise en place vient de passer : elle se juge dès que
// la liste de cet ordinateur et les stations sont lues — jamais sur une lecture manquante, ni pendant que le parcours
// pose sa propre question « qui le cuit ».
function setTheRequestOfStationHere() {
  const project = current;
  const close = () => {
    sectionOfTheRequest.hidden = true;
    sectionOfTheRequest.replaceChildren();
  };
  if (project === undefined || readOnlyOf(project) !== undefined) return close();
  const name = project.nom;
  const repository = project.depot ?? projectsSeen?.projets.find((candidate) => candidate.nom === name)?.depot;
  const state = requestsOfStation.de(name);
  if (state === undefined || repository === undefined) return close();
  const reading = servedOnes.etat?.lecture;
  const servedHere = reading !== undefined && "depots" in reading ? reading.depots : undefined;
  if (state.etape === "a-juger") {
    const journey = journeyOfProjects.de(name);
    const questionOfJourney = journey !== undefined && journey.pret === undefined && journey.station !== "ajoutee" && journey.station !== "inutile";
    if (servedHere === undefined || stationsViews === undefined || questionOfJourney) return close();
    const served = servedByOneStation(project, repository, servedHere);
    // Posée : les stations du compte se proposent après cet ordinateur — relues, la question se repose.
    if (!served) void readTheRecorded().then(() => setTheRequestOfStationHere());
    return requestsOfStation.juger(name, served);
  }
  const readEntries = recordedAbsent ? undefined : stateOfRecorded.stations;
  const choice = choiceOfStation({
    ici: servedHere !== undefined,
    hote: WORKSTATION.nom === THIS_COMPUTER ? "" : WORKSTATION.nom,
    stations: readEntries?.state === "listed" ? stationsAPropose(readEntries.stations, repository, projectsSeen?.locale) : [],
    maintenant: Date.now(),
  });
  sectionOfTheRequest.replaceChildren(
    setTheRequestOfStation(
      document,
      { depot: repository, etat: state, choix: choice },
      {
        // Cet ordinateur : le geste de la case de Settings (`servirUnProjet`) ; une station du compte : sa sélection.
        choisir: async (oneOf) => {
          if (requestsOfStation.de(name)?.etape === "enCours") return;
          requestsOfStation.choisir(name, oneOf.cle);
          const pairedOne = readEntries?.state === "listed" ? readEntries.stations.find(({ id }) => id === oneOf.cle) : undefined;
          const rendered = await addTheStation(oneOf.nom, () =>
            oneOf.cle === HERE ? serveHereTheRepository(repository)
            : pairedOne === undefined ? Promise.resolve({ refus: `${oneOf.nom} is no longer one of your stations` })
            : chooseForOneRecorded(pairedOne.id, [...(pairedOne.selection ?? []), repository]),
          );
          requestsOfStation.choisi(name, rendered, { nom: oneOf.nom, ici: oneOf.cle === HERE, absente: oneOf.horsLigne });
        },
        ecarter: () => requestsOfStation.ecarter(name),
        fermer: () => requestsOfStation.fermer(name),
      },
    ),
  );
  sectionOfTheRequest.hidden = false;
}

// La question posée ou levée : l'avis d'un projet pas préparé (ticket 2628) et le rail se reposent.
/** @param {Project} project */
function restThePage(project) {
  if (current?.nom !== project.nom) return;
  setAlerts(project);
  setRail(project);
}

// Ce que la vue sait du second du projet : il ne part pas, et ce que le titre de son terminal dit.
/** @param {string} name @returns {import("./journey-first-project/journey-first-project.js").Second} */
function secondOfJourney(name) {
  const second = [...views.values()].find(({ terminal }) => terminal.projet === name && terminal.genre === "second")?.terminal;
  const title = workOfSecond(titlesOfSeconds.get(name));
  return {
    ...(second?.empeche === undefined ? {} : { empeche: true }),
    ...(title === undefined ? {} : { titre: title }),
  };
}

// La page du projet affiché, s'il n'est pas prêt (ticket 3166) : la question à la place du rail — `main` le porte (`data-parcours`), et
// sa feuille de style y cache le reste ; prêt, la ligne du premier ticket au-dessus du rail ; sinon, rien.
function setTheProjectAPrepare() {
  const project = current;
  const journey = project === undefined ? undefined : journeyOfProjects.de(project.nom);
  const close = () => {
    sectionOfJourney.hidden = true;
    sectionOfJourney.replaceChildren();
    delete principal.dataset.parcours;
  };
  if (project === undefined || journey === undefined) return close();
  const name = project.nom;
  // L'accès en écriture perdu en route : la page s'ouvre en lecture seule (ticket 3163), sans rien de tout cela.
  if (readOnlyOf(project) !== undefined) {
    journeyOfProjects.fermer(name);
    return restThePage(project);
  }
  // Prêt : au-dessus du rail, le second demande au chef ce qu'il veut changer d'abord (ticket 3306). Le champ tapé garde le
  // clavier quand la page se repose.
  if (journey.pret !== undefined) {
    delete principal.dataset.parcours;
    firstTickets.commencer(name);
    const state = firstTickets.de(name);
    if (state === undefined) return close();
    const renderTheField = keepTheKeyboard(document.activeElement, sectionOfJourney);
    sectionOfJourney.replaceChildren(
      setFirstTicket(document, { depot: journey.depot, etat: state, ...(journey.absente === undefined ? {} : { absente: journey.absente }) }, {
        ecrire: (text) => firstTickets.ecrire(name, text),
        envoyer: () => void firstTickets.envoyer(name),
        oui: () => void firstTickets.oui(name),
        changer: () => void firstTickets.changer(name),
        fermer: () => {
          firstTickets.oublier(name);
          journeyOfProjects.fermer(name);
        },
      }),
    );
    sectionOfJourney.hidden = false;
    renderTheField();
    return;
  }
  const departure = departuresOfProjects.de(name);
  if (departure !== undefined) {
    principal.dataset.parcours = "depart";
    sectionOfJourney.replaceChildren(
      setTheDeparture(
        document,
        { depot: journey.depot, etat: departure },
        {
          changer: (ticket, priority) => departuresOfProjects.changer(name, ticket, priority),
          lacher: (ticket) => departuresOfProjects.lacher(name, ticket),
          mettre: () => void putTheDepartureOnTheRail(name),
          passer: () => departuresOfProjects.passer(name),
          relire: () => {
            departuresOfProjects.relire(name);
            void readTheDeparture(name);
          },
        },
      ),
    );
    sectionOfJourney.hidden = false;
    return;
  }
  if (journey.station === "a-faire" && alreadyCooked(project, journey.depot)) return journeyOfProjects.station(name, "inutile");
  const preparation = repositories.get(name);
  const held = heldOnes.get(name);
  const cardItem = held !== undefined && "tableau" in held ? cardOfSetup(held.tableau.rail.colonnes) : undefined;
  const readOne = { station: journey.station, ...(preparation === undefined ? {} : { preparation }) };
  const seenOne = seenOfJourney({ ...readOne, ...(journey.illisible === undefined ? {} : { illisible: journey.illisible }), carte: cardItem !== undefined, second: secondOfJourney(name) });
  if (seenOne.etape === "pret") {
    journeyOfProjects.pret(name);
    return restThePage(project);
  }
  if (seenOne.etape === "setup" && seenOne.attente !== "lecture") journeyOfProjects.setupMontre(name);
  const reading = servedOnes.etat?.lecture;
  const readEntries = recordedAbsent ? undefined : stateOfRecorded.stations;
  const choice = choiceOfStation({
    // Cet ordinateur est offert tant que sa lecture ne dit pas qu'il n'a pas de station.
    ici: reading === undefined || "depots" in reading,
    hote: WORKSTATION.nom === THIS_COMPUTER ? "" : WORKSTATION.nom,
    stations: readEntries?.state === "listed" ? stationsAPropose(readEntries.stations, journey.depot, projectsSeen?.locale) : [],
    maintenant: Date.now(),
  });
  // Un clic, et la page passe à la suite : cet ordinateur sert le dépôt par le geste de « Add a station »
  // (`servirUnProjet`) ; une station du compte le reçoit dans sa sélection (`choisirLesProjets`).
  /** @param {import("./stations-tab/choice.js").Choice} oneOf */
  const choose = async (oneOf) => {
    const before = journeyOfProjects.de(name)?.station;
    if (before === undefined || (typeof before === "object" && "enCours" in before)) return;
    journeyOfProjects.station(name, { enCours: oneOf.cle });
    const pairedOne = readEntries?.state === "listed" ? readEntries.stations.find(({ id }) => id === oneOf.cle) : undefined;
    const station = await addTheStation(oneOf.nom, () =>
      oneOf.cle === HERE || pairedOne === undefined ? serveHereTheRepository(journey.depot) : chooseForOneRecorded(pairedOne.id, [...(pairedOne.selection ?? []), journey.depot]),
    );
    journeyOfProjects.station(name, station, oneOf.horsLigne ? oneOf.nom : undefined);
    const step = repositories.get(name)?.etape;
    if (station === "ajoutee" && step !== "prepare" && step !== "en-route") void readPreparation(project);
  };
  principal.dataset.parcours = seenOne.etape;
  sectionOfJourney.replaceChildren(
    setJourneyFirstProject(
      document,
      {
        depot: journey.depot,
        vu: seenOne,
        progression: progression(seenOne, readOne),
        station: journey.station,
        choix: choice,
        ...(journey.illisible === undefined ? {} : { illisible: journey.illisible }),
        ...(preparation?.etape === "refus" ? { refus: preparation.dit } : {}),
        ...(journey.absente === undefined ? {} : { absente: journey.absente }),
        serveur: serverOf(name, true),
      },
      {
        choisir: choose,
        // Le serveur arrivé est un choix comme les autres : la même station du compte, par le même geste.
        serveur: actionsOfServer(name, (station) => void choose({ cle: station.id, nom: station.name, horsLigne: !station.available, recommande: station.available })),
        relire: () => void readPreparation(project),
        preparer: () => void prepareTheRepository(project),
        ouvrirLaCarte: () => {
          if (cardItem !== undefined) openCard(project, cardItem, sectionOfJourney);
        },
      },
    ),
  );
  sectionOfJourney.hidden = false;
}

// Le récit du premier ticket, sur la page du projet qui l'a (ticket 3302) : rien ailleurs, ni en lecture seule. Ses liens
// ouvrent la PR du ticket — celle de son cook tant qu'il est sur le rail, puis celle qui l'a servi.
function setTheStoryOfFirstTicket() {
  const project = current;
  const story = project === undefined || readOnlyOf(project) !== undefined ? undefined : storyOfFirstTicket.de(project.nom);
  if (project === undefined || story === undefined) {
    sectionOfStory.hidden = true;
    sectionOfStory.replaceChildren();
    return;
  }
  const { nom: name } = project;
  const { ticket } = story;
  sectionOfStory.replaceChildren(
    setStoryOfFirstTicket(document, story, {
      ouvrir: () => void brigade.ouvrirPrDuCook(name, ticket).then((openOne) => openOne || brigade.ouvrirPr(name, ticket)),
      ranger: () => storyOfFirstTicket.ranger(),
    }),
  );
  sectionOfStory.hidden = false;
}

async function rereadTheFirst() {
  const requested = ++readOfFirst;
  delete first.stations;
  setTheFirst();
  /** @type {import("../first-launch.ts").StationsOfChef} */
  let readOne;
  try {
    readOne = (await brigade.stationsDuChef?.()) ?? { state: "unavailable", cause: "github", reason: "Your stations could not be read: the app gave no answer." };
  } catch (error) {
    const detail = error instanceof Error ? error.message : String(error);
    readOne = { state: "unavailable", cause: "github", reason: "Your stations could not be read: the app failed while reading them.", detail };
  }
  if (requested !== readOfFirst) return;
  first.stations = readOne;
  setTheFirst();
}

// `base` : la branche par défaut que GitHub a donnée du dépôt (l'écran « Add a project ») — à défaut, celle que l'origine
// de sa copie désigne.
/** @param {string} station @param {string} project @param {string} repository @param {string} [base] */
async function openOfAStation(station, project, repository, base) {
  // Le clone demande Git et le GitHub CLI : l'un manque, son écran le dit, et l'ouverture repart une fois installé.
  if (!(await toolsOfJourney.verifier())) {
    resumeAfterTheTools = () => void openOfAStation(station, project, repository, base);
    return;
  }
  first.ouverture = { station, projet: project, depot: repository, ...(base === undefined ? {} : { base }) };
  setTheFirst();
  /** @type {import("../first-launch.ts").Opening} */
  let issue;
  try {
    issue = (await brigade.ouvrirDUneStation?.(project, repository, ...(base === undefined ? [] : [base]))) ?? { state: "failed", project: project, repository: repository, cause: "unknown", reason: `${project} could not be opened: the app gave no answer.` };
  } catch (error) {
    const detail = error instanceof Error ? error.message : String(error);
    issue = { state: "failed", project: project, repository: repository, cause: "unknown", reason: `${project} could not be opened: the app failed while opening it.`, detail };
  }
  // Ratée, ou retenue tant que Claude Code n'est pas connecté sur cet ordinateur (ticket 4057) : rien n'a démarré.
  if (issue.state !== "open") {
    first.ouverture = { station, projet: project, depot: repository, ...(base === undefined ? {} : { base }), echec: issue };
    return setTheFirst();
  }
  delete first.ouverture;
  // Cloné à l'instant : où, en une ligne — la page du projet s'ouvre dessous.
  if ("cloned" in issue && issue.cloned) setOpinion({ titre: CLONE_IN(issue.folder), lignes: [] });
  // Ajouté, il est déjà arrivé par `surConfiguration` — sinon, son espace s'ouvre dès qu'il y arrive.
  const opened = projectOf(issue.project);
  if (opened !== undefined) return void open(opened);
  firstAOpen = issue.project;
  setTheFirst();
}

// Le login de Claude Code qu'une ouverture retenue demande (ticket 4057) : celui de la panne « Max connection lost ». Ce qu'il
// rend se dit sous le projet ; sa fin arrive par `surLoginClaude`, et l'ouverture repart.
async function itselfConnectAClaude() {
  /** @type {import("../outages/actions.ts").RenderedOfOutage} */
  let rendered;
  try {
    rendered = (await brigade.seConnecterAClaude?.()) ?? { refus: "the login was not launched: the app gave no answer" };
  } catch (error) {
    rendered = { refus: `the login was not launched: the app failed while launching it (${error instanceof Error ? error.message : String(error)})` };
  }
  ifClaudeMissing(rendered);
  if (first.ouverture?.echec?.state !== "login") return;
  first.ouverture.login = rendered;
  setTheFirst();
}

async function itselfConnectAGitHub() {
  // Une connexion qui ne peut pas partir — sans `gh` — ne tourne pas : l'écran de l'outil manquant la remplace, et le
  // bouton revient tel quel une fois l'outil installé.
  if (!(await toolsOfJourney.verifier())) {
    resumeAfterTheTools = undefined;
    return;
  }
  first.connexion = { enRoute: true };
  setTheFirst();
  /** @type {import("../connection-github.ts").StartOfConnection} */
  let start;
  try {
    start = (await brigade.seConnecterAGitHub?.()) ?? { refus: "GitHub sign-in could not be started: the app gave no answer." };
  } catch (error) {
    start = { refus: "GitHub sign-in could not be started: the app failed while starting it.", detail: error instanceof Error ? error.message : String(error) };
  }
  if ("connecte" in start) return connectedAGitHub();
  first.connexion = start;
  setTheFirst();
}

// Connecté : le compte et les stations sont relus, et une ouverture que la connexion retenait repart.
function connectedAGitHub() {
  delete first.connexion;
  accountOfJourney.apresLaConnexion();
  // Et son rail sur GitHub : connecté, il se lit peut-être (ticket 2076).
  if (current !== undefined && railsPublished.has(current.nom)) rereadTheRailPublished(current);
  const retainedOne = first.ouverture?.echec?.cause === "sign-in-required" ? first.ouverture : undefined;
  void rereadTheFirst();
  if (!recordedAbsent) void readTheRecorded();
  // Les dépôts de l'écran « Add a project » se lisent du compte qui vient de se connecter.
  if (adds) void readTheRepositoriesOfTheAddition();
  if (retainedOne !== undefined) void openOfAStation(retainedOne.station, retainedOne.projet, retainedOne.depot, retainedOne.base);
}

brigade.surOuverture?.((repository, step) => {
  const { ouverture: opening } = first;
  if (opening === undefined || opening.depot !== repository || opening.echec !== undefined) return;
  opening.etape = step;
  setTheFirst();
});
// Le login de Claude Code fini : l'ouverture qu'il retenait repart — connecté, la cuisine démarre ; sinon, « log in » revient.
brigade.surLoginClaude?.(() => {
  const retainedOne = first.ouverture?.echec?.state === "login" ? first.ouverture : undefined;
  if (retainedOne !== undefined) void openOfAStation(retainedOne.station, retainedOne.projet, retainedOne.depot, retainedOne.base);
});
// Sur le téléphone, la connexion à GitHub est celle de son premier écran (connection-github.js) : elle n'est pas d'ici.
brigade.surConnexionGitHub?.((end) => {
  if (phoneSeen !== undefined) return;
  if ("connecte" in end) return connectedAGitHub();
  first.connexion = end;
  // Une connexion qui n'a pas abouti — un changement de compte abandonné : le compte est relu, tel qu'il est resté.
  accountOfJourney.apresLaConnexion();
});

// La page des coûts de tous les projets, à la place de l'accueil : « T » reste l'entrée affichée, et un
// geste y ramène. Seule sa lecture part — `station` sur la box de chaque projet — tant qu'elle est affichée.
function openCosts() {
  current = undefined;
  adds = false;
  stationOpen = undefined;
  pageOfTheApp = COSTS;
  mark();
  setCost();
  all.replaceChildren(pageOfCosts);
  returnOfCosts.focus();
}
openTheCosts.addEventListener("click", () => openCosts());
returnOfCosts.addEventListener("click", () => openAll());
// La page des résumés hebdomadaires de tous les projets, de même : chaque projet qui se lit, lu à l'ouverture.
function openResumes() {
  current = undefined;
  adds = false;
  stationOpen = undefined;
  pageOfTheApp = RESUMES;
  mark();
  resumesOfAll.poser(configuration.projets.filter((project) => itselfLit(project)).map(({ nom: name }) => name));
  all.replaceChildren(pageOfResumes);
  returnOfResumes.focus();
}
openTheResumes.addEventListener("click", () => openResumes());
returnOfResumes.addEventListener("click", () => openAll());

// La page d'une station, à la place de l'accueil : « T » reste l'entrée affichée, et un geste y ramène.
/** @param {string} id */
function openStation(id) {
  current = undefined;
  adds = false;
  stationOpen = id;
  pageOfTheApp = undefined;
  removalOfStationRequest = undefined;
  removalOfStationRefuses = "";
  sectionsOfStationSet = "";
  sectionsOfStation.replaceChildren();
  mark();
  setPageOfStation();
  all.replaceChildren(pageOfStation);
  returnALHome.focus();
}
returnALHome.addEventListener("click", () => openAll());

// Les choix d'une liste, précédés de celui qui n'en est pas un : rien n'est choisi d'avance.
/** @param {HTMLSelectElement} list @param {readonly string[]} choice @param {string} no */
function propose(list, choice, no) {
  const guard = list.value;
  const empty = new Option(no, "");
  list.replaceChildren(empty, ...choice.map((value) => new Option(value, value)));
  list.value = choice.includes(guard) ? guard : "";
}

// L'écran « Add a project » (ticket 3181, journey-project/addition.js) : il ne fait que choisir le dépôt. Ses dépôts se
// relisent à chaque ouverture — les derniers poussés d'abord —, la recherche et le collage restent d'un passage à l'autre.
// Un dépôt choisi s'ouvre comme un projet du premier lancement : sa copie reprise ou clonée, il entre dans la colonne de
// gauche, et sa page s'ouvre (`ouvrirDUneStation`).
/** @type {import("./journey-project/addition.js").StateOfTheAddition} */
const stateOfTheAddition = { saisie: { recherche: "", colle: "" } };
let readOfRepositoriesOfTheAddition = 0;
/** @type {import("./journey-project/addition.js").ActionsOfTheAddition} */
const actionsOfTheAddition = {
  ...actionsOfFirst,
  choisir: (chosen) => chooseTheRepository(chosen),
  coller: (text) => void pasteOneRepository(text),
  relire: () => void readTheRepositoriesOfTheAddition(),
};

function openAddition() {
  // Reposé sur lui-même — le fichier des projets a changé pendant qu'il est montré —, il ne relit pas les dépôts.
  const alreadyThe = adds;
  current = undefined;
  adds = true;
  stationOpen = undefined;
  pageOfTheApp = undefined;
  delete stateOfTheAddition.refus;
  // Une ouverture ratée, laissée là, ne reste pas sur un nouvel ajout ; celle qui court, si.
  if (first.ouverture?.echec !== undefined) delete first.ouverture;
  mark();
  setTheAddition();
  // Le téléphone n'ajoute aucun projet : il ne lit ni compte ni dépôts.
  if (phone !== undefined) return;
  accountOfJourney.lireUneFois();
  if (!alreadyThe) void readTheRepositoriesOfTheAddition();
}

function setTheAddition() {
  addition.replaceChildren(setTheScreenOfAddition(document, { ...stateOfTheAddition, ...stateOfJourney(), ...(phone === undefined ? {} : { telephone: true }), ...(first.ouverture === undefined ? {} : { ouverture: first.ouverture }) }, actionsOfTheAddition));
}

// Les dépôts du compte, lus sur GitHub : la dernière lecture demandée l'emporte ; ratée, l'écran le dit et offre de relire.
async function readTheRepositoriesOfTheAddition() {
  const requested = ++readOfRepositoriesOfTheAddition;
  delete stateOfTheAddition.depots;
  if (adds) setTheAddition();
  /** @type {NonNullable<import("./journey-project/addition.js").StateOfTheAddition["depots"]>} */
  let readOnes;
  try {
    readOnes = (await brigade.depotsDuChef()) ?? { refus: "the app gave no answer" };
  } catch (error) {
    readOnes = { refus: error instanceof Error ? error.message : String(error) };
  }
  if (requested !== readOfRepositoriesOfTheAddition) return;
  stateOfTheAddition.depots = readOnes;
  if (adds) setTheAddition();
}

// Un dépôt choisi : le projet porte son nom, en minuscules, comme au premier lancement, et sa branche d'intégration est
// celle que GitHub donne.
/** @param {{ depot: string, base: string }} chosen */
function chooseTheRepository(chosen) {
  delete stateOfTheAddition.refus;
  const readOne = readTheProject("", chosen.depot);
  if ("refus" in readOne) {
    stateOfTheAddition.refus = readOne.refus;
    return setTheAddition();
  }
  // Le projet ouvert, sa page dit ce qui reste à faire avant qu'il soit prêt (ticket 3166) — quand sa première lecture
  // dit que le compte peut écrire dans son dépôt. Une ouverture ratée n'a rien à guider.
  aGuide.set(readOne.nom, readOne.depot);
  void openOfAStation("", readOne.nom, readOne.depot, chosen.base).then(() => {
    // Retenue tant que Claude Code n'est pas connecté (ticket 4057) : elle repart à la fin du login, son projet reste à guider.
    if (first.ouverture?.echec?.state === "login") return;
    if (first.ouverture?.echec !== undefined && first.ouverture.projet === readOne.nom) aGuide.delete(readOne.nom);
    // Le projet était déjà lu — dans le fichier avant d'être choisi : sa lecture tenue décide sans attendre la suivante.
    else followTheJourney(readOne.nom);
  });
}

// Un dépôt collé — lien GitHub ou `owner/name`, public et pas au chef compris — : lu sur GitHub, puis ouvert ; ce qui
// n'en est pas un, ou que GitHub ne rend pas, se dit sous le champ.
/** @param {string} text */
async function pasteOneRepository(text) {
  const name = repositoryPastesBy(text);
  delete stateOfTheAddition.refus;
  if (name === null) {
    stateOfTheAddition.refus = NOT_ONE_REPOSITORY;
    return setTheAddition();
  }
  /** @type {{ depot: string, base: string } | { refus: string }} */
  let resolved;
  try {
    resolved = (await brigade.lireUnDepot(name)) ?? { refus: `${name} could not be read on GitHub: the app gave no answer.` };
  } catch (error) {
    resolved = { refus: `${name} could not be read on GitHub: ${error instanceof Error ? error.message : String(error)}.` };
  }
  if ("refus" in resolved) {
    stateOfTheAddition.refus = resolved.refus;
    return setTheAddition();
  }
  stateOfTheAddition.saisie.colle = "";
  chooseTheRepository(resolved);
}

// Le rail qu'une station publie sur GitHub pour un projet qu'aucune station connue ne sert ici (ticket 1435,
// rail-published.js), lu par le runtime à l'ouverture de l'espace, et relu d'un bouton — ou après une connexion à GitHub :
// il dit pourquoi le tableau de la cuisine ne se lit pas encore (ticket 2076). Ce qui en est tenu est en tête du fichier
// (`railsPublies`).

/** @param {Project} project */
async function readTheRailPublished(project) {
  const requested = (readsPublished.get(project.nom) ?? 0) + 1;
  readsPublished.set(project.nom, requested);
  railsPublished.set(project.nom, {});
  if (current?.nom === project.nom) setRail(project);
  /** @type {import("./rail-published.js").StateOfRailPublished & { sansReponse?: true }} */
  let readOne;
  try {
    const rendered = await brigade.railDuProjet?.(project.nom);
    readOne = rendered === undefined ? { sansReponse: true } : { lu: rendered };
  } catch (error) {
    const detail = error instanceof Error ? error.message : String(error);
    readOne = { lu: { state: "unavailable", project: project.nom, cause: "unreadable", reason: `The rail of ${project.nom} could not be read: the app failed while reading it.`, detail } };
  }
  if (readsPublished.get(project.nom) !== requested) return;
  railsPublished.set(project.nom, readOne);
  if (current?.nom === project.nom && !rail.hidden) setRail(project);
}

// « read again » : le tableau de la cuisine se relit avec lui, c'est lui qui pose le rail (ticket 2076).
/** @param {Project} project */
function rereadTheRailPublished(project) {
  readTheFacts();
  void readTheRailPublished(project);
}

/** @param {Project} project @returns {import("./rail-published.js").ActionsOfRailPublished} */
function actionsOfRailPublished(project) {
  return {
    relire: () => rereadTheRailPublished(project),
    seConnecter: () => void itselfConnectAGitHub(),
    ouvrirLaPage: (url) => void brigade.ouvrirLaPage?.(url),
  };
}

/** @param {Project} project */
async function open(project) {
  current = project;
  teamOfProject.lire(project.nom);
  recordedAReread = true;
  stationOpen = undefined;
  pageOfTheApp = undefined;
  if (emergencyChosen !== project.nom) emergencyChosen = "";
  notWritten = notWrittenSecond = "";
  actionRate = undefined;
  // Une confirmation ouverte sur un autre projet ne reste pas ouverte : rien n'en part.
  if (aConfirm?.projet !== project.nom) aConfirm = undefined;
  adds = false;
  // Comme le panneau : l'onglet de contenu laissé là est relu tout de suite.
  tracking = undefined;
  mark();
  // Dès maintenant : la carte et la bannière du projet quitté ne restent pas sur celui-ci
  // pendant que son espace s'ouvre.
  draw();
  // Les stations que sa box déclare viennent avec la lecture de son installation (service.ts).
  void readService(project);
  // Ni sa ligne de retrait : elle nomme son projet.
  removal.hidden = true;
  void readRemoval(project);
  setAcronym(project);
  setColors(project);
  setMenuBar();
  void setOrdinary(project);
  void identitiesGithub.lire();
  void servedOnes.lire();
  setTheSettingsOfProject(project);
  void readTheSettings(project);
  void mountTheHumans(document, element("humains-du-projet"), { projet: project.nom, service: serviceOfBridge(brigade, project.nom), ouvrir: (url) => void brigade.ouvrirLaProposition(url) });
  void mountTheRecurring(document, element("recurrents-du-projet"), { projet: project.nom, service: serviceOfRecurring(brigade, project.nom) });
  void mountTheCardProject(document, element("fiche-du-projet"), { projet: project.nom, pont: brigade });
  setTheExplanationsOfChef(project.nom);
  void explanations.lire(project.nom);
  void mountTheStations(document, element("stations-contributrices"), { projet: project.nom, service: serviceOfStations(brigade, project.nom) });
  brigade.regarder(project.nom, ++request);
  if (!itselfLit(project) && project.sansStation !== true) void readTheRailPublished(project);
  // Un projet qui ne s'ouvre pas n'a pas de second : sa colonne dit pourquoi.
  if (project.refus !== undefined) return show();
  // Le pont du téléphone n'ouvre aucun terminal : il ne rend rien (ticket 1165).
  const terminals = (await brigade.espace(project.nom)) ?? [];
  terminals.forEach(receive);
  // Le chef a pu cliquer ailleurs pendant que l'espace s'ouvrait. Sinon, le terminal montré à
  // droite prend le clavier : le second, ou le shell où le chef l'avait laissé.
  if (current !== project) return;
  aFocus = aRight.get(project.nom) ?? terminals.find(({ genre: kind }) => kind === "second")?.id;
  show();
}

// Un terminal fermé : sa vue s'en va, et ce qu'il écrit encore n'est plus montré.
/** @param {number} id */
function forget(id) {
  const closedOne = views.get(id);
  closedOne?.xterm.dispose();
  closedOne?.cadre.remove();
  views.delete(id);
  closed.add(id);
}

// Une sortie peut précéder l'annonce de son terminal : sa vue est alors créée ici. Celle qui arrive avant que la vue ait
// retrouvé les terminaux ouverts (ticket 3159) est déjà dans ce qu'ils avaient écrit : écrite aussi, elle le serait deux fois.
let terminalsFoundAgain = false;
brigade.surSortie((id, data) => {
  if (terminalsFoundAgain && !closed.has(id)) vue(id).xterm.write(data);
});
brigade.surEtat((terminal) => {
  if (terminal.genre === "shell" && terminal.arrete) {
    // Un shell qui sort ferme son onglet ; s'il était montré, le second reprend sa place à droite.
    forget(terminal.id);
    if (aRight.get(terminal.projet) === terminal.id) aRight.delete(terminal.projet);
  } else {
    receive(terminal);
  }
  show();
});
// Ce que fait chaque cook d'un projet, à chaque lecture de son tableau (ticket 1846) : la fiche ouverte sur l'un de ses
// tickets suit son cook — reposée seulement si ce qu'elle en dit a changé.
brigade.surActivites((published) => {
  const before = activitiesPublished.get(published.projet);
  activitiesPublished.set(published.projet, published);
  // Les cartes de Taken et de Pass disent ce que fait leur cook quand le rail ne le dit pas (ticket 4076) : elles suivent sa lecture.
  if (current?.nom === published.projet && JSON.stringify(before) !== JSON.stringify(published)) draw();
  if (openOne === undefined || openOne.projet.nom !== published.projet) return;
  const { ticket } = openOne.carte;
  /** @param {import("./activity-of-cook.js").Published | undefined} readEntries */
  const said = (readEntries) => {
    if (readEntries === undefined || "sans" in readEntries) return JSON.stringify(readEntries);
    const cook = cookOfTicket(readEntries, ticket);
    return JSON.stringify(cook === undefined ? null : [readEntries.lu, cook]);
  };
  if (said(before) !== said(published)) renderCard();
});
// Les faits d'un projet : ils remplacent ceux d'avant, partout où ils se dessinent —
// sa pastille dans la barre, et son espace s'il est affiché — sa ligne de l'accueil vient par `surAccueil`.
// La bande d'alertes d'un projet : posée tout de suite si c'est celui qui est affiché.
brigade.surAlertes(({ projet: project, alertes: alerts, signal, manager: stateOfManager }) => {
  const breakerBefore = JSON.stringify(alertOfBreaker(project));
  bands.set(project, alerts);
  const breaker = alertOfBreaker(project);
  signals.set(project, signal);
  markSignal(project);
  // La pastille dit la même chose que la bande, en un mot.
  markPill(project);
  // Le disjoncteur a changé : sa ligne à côté de l'entrée TODO aussi.
  if (JSON.stringify(breaker) !== breakerBefore) setTheCardsOfChef();
  const flip = JSON.stringify(statesOfManager.get(project)) !== JSON.stringify(stateOfManager);
  statesOfManager.set(project, stateOfManager);
  if (current?.nom !== project) return;
  setAlerts(current);
  // L'interrupteur a basculé : il le dit aussitôt, et la tête du rail aussi. Le disjoncteur a changé : sa ligne de TODO aussi.
  if (flip || JSON.stringify(breaker) !== breakerBefore) {
    setSwitch();
    setRail(current);
  }
});
// Le chef a cliqué la notification de l'urgence d'un projet : la fenêtre est déjà devant. Le projet
// s'ouvre — s'il ne l'est pas déjà —, la fiche d'un ticket ouverte par-dessus se referme, et la ligne
// d'urgence, en tête de la bande, est marquée choisie : son geste prend le clavier, prêt à trancher.
brigade.surUrgence(async (name) => {
  const project = configuration.projets.find((candidate) => candidate.nom === name);
  if (project === undefined) return;
  emergencyChosen = name;
  if (current?.nom !== name) await open(project);
  // Le chef a pu cliquer ailleurs pendant que l'espace s'ouvrait.
  if (current?.nom !== name) return;
  if (openOne !== undefined) closeCard();
  setAlerts(current);
  actionOfTheEmergency?.focus();
});
// L'installation d'un projet a été relue : les stations que sa box déclare se reposent, si c'est le projet affiché.
brigade.surGuide(holdDeclared);
// Ce qui n'est pas encore sur le rail d'un projet : le sien se repose, s'il est affiché.
brigade.surAmont((seenOne) => {
  upstreams.set(seenOne.projet, seenOne);
  if (current?.nom === seenOne.projet && !rail.hidden && heldOnes.has(seenOne.projet)) setRail(current);
});
// Un essai a changé, ou la déclaration du projet : elle est relue (trial.ts).
brigade.surEssais?.((name) => {
  const project = configuration.projets.find((candidate) => candidate.nom === name);
  if (project !== undefined) void readTheTrials(project);
});
// La pause de quota GitHub du compte (ticket 3482) : une ligne calme en tête de l'app, dite une fois pour tout le compte,
// d'après ce que les projets lus en portent. Son compte à rebours bouge chaque seconde ; à la reprise, elle tombe d'elle-même
// et le projet affiché se redessine sans sa ligne de pause.
const bannerOfThePause = holdThePause(element("pause-quota"), document, { maintenant: () => Date.now(), auRetour: () => (current === undefined ? undefined : draw()) });
setInterval(() => bannerOfThePause.battre(), 1000);
const followThePause = () => bannerOfThePause.suivre(pauseOfProjects([...heldOnes.values()].map((held) => ("tableau" in held ? held.tableau.pauseQuota : undefined)), Date.now()));
brigade.surFaits((receivedOne) => {
  if (receivedOne.demande !== factsRequest) return;
  inRead.delete(receivedOne.projet);
  // Une box pas jointe n'efface pas le rail : la dernière lecture reste, marquée (poserRail).
  const silentOne = !("tableau" in receivedOne) && "atteinte" in receivedOne && !receivedOne.atteinte;
  if (silentOne) silentOnes.set(receivedOne.projet, silentOnes.get(receivedOne.projet) ?? receivedOne.a);
  else silentOnes.delete(receivedOne.projet);
  // Hors ligne, de même : le dernier rail lu reste, et aucun échec ne prend sa place (ticket 1818).
  const outsideLine = !("tableau" in receivedOne) && "horsLigne" in receivedOne && receivedOne.horsLigne === true;
  if (outsideLine) outsideLines.set(receivedOne.projet, outsideLines.get(receivedOne.projet) ?? receivedOne.a);
  else outsideLines.delete(receivedOne.projet);
  const keptOne = heldOnes.get(receivedOne.projet);
  // Une lecture ratée en ligne — GitHub qui limite les appels, refuse, ne répond pas à temps, une box qui redémarre et
  // publie un tableau illisible — ne vide aucune colonne (ticket 2151) : le dernier rail lu reste, et une ligne dit depuis
  // quand il est périmé, la raison au survol. Sans rail lu avant, elle se dit comme avant.
  const missed = !("tableau" in receivedOne) && !silentOne && !outsideLine;
  if ("tableau" in receivedOne) stale.delete(receivedOne.projet);
  else if (missed && keptOne !== undefined && "tableau" in keptOne) stale.set(receivedOne.projet, { depuis: stale.get(receivedOne.projet)?.depuis ?? receivedOne.a, raison: reasonOfTheFailure(receivedOne) });
  if (outsideLine && (keptOne === undefined || !("tableau" in keptOne))) heldOnes.delete(receivedOne.projet);
  else if (!((silentOne || outsideLine || missed) && keptOne !== undefined && "tableau" in keptOne)) heldOnes.set(receivedOne.projet, receivedOne);
  markPill(receivedOne.projet);
  followThePause();
  followTheJourney(receivedOne.projet);
  // Le premier ticket du premier projet suit chaque lecture de son rail (ticket 3302).
  if ("tableau" in receivedOne) storyOfFirstTicket.observer(receivedOne.projet, receivedOne.tableau.etapesDesTickets);
  setTheCardsOfChef();
  // L'accueil affiché dit ce qui attend le chef du même compte que « TODO (N) » : une lecture qui le change le repose.
  if (current === undefined && !adds && stationOpen === undefined && todosOfTheHome.has(receivedOne.projet) && todosOfTheHome.get(receivedOne.projet) !== accountOfTodo(receivedOne.projet)) setHome();
  // Son récapitulatif liste ce qui attend dans TODO tel que TODO le montre : chaque lecture le repose (ticket 3581).
  else if (current === undefined) setTheRecapOfTheHome();
  // Le détail ouvert d'une carte que cette lecture ne porte plus se ferme ; sinon, il n'est pas reposé : le chef y zoome, ou y tape.
  if (detailOpen?.projet === receivedOne.projet && theValidation(detailOpen.projet, detailOpen.ticket) === undefined) setTheDetail();
  if (current?.nom === receivedOne.projet) {
    teamOfProject.lire(current.nom);
    void readTheTrials(current);
    void readTheHeld(current);
    draw();
    setTheStoryOfFirstTicket();
    void setOrdinary(current);
    setStationsOfProject();
  }
});
// Ce que l'onglet de contenu affiché a rendu : une lecture ratée s'y lit comme
// dans le panneau, et n'en retire rien.
brigade.surContenu((receivedOne) => {
  if (receivedOne.demande !== requestTab) return;
  // La page des coûts lit `station` sur la box de chaque projet : chacune entre dans ses chiffres.
  if (tabRequest === COSTS) {
    costsRead.set(receivedOne.projet, receivedOne);
    return setCost();
  }
  if (receivedOne.projet !== current?.nom || current.sansStation === true) return;
  // Settings ne lit rien.
  if (!settingsShown()) render(receivedOne, readTab, tabReading);
});
// Les clones relus : leur état remplace celui d'avant, dans Settings et sur la case « T ».
brigade.surCode((seenOne) => {
  codeSeen = seenOne;
  setCode();
});
// La mise à jour de l'app : son état remplace celui d'avant ; la ligne de tête le suit.
brigade.surMiseAJour((seenOne) => {
  updateVue = seenOne;
  bannerOfVersion.suivre(seenOne);
});
// Une version plus haute publiée pour ce poste (update/opinion.ts) : une ligne en tête de l'app, la version qui tourne
// et la dernière, et où en est la mise à jour de l'app installée (mise-a-jour/etat.ts) — jusqu'à ce que l'app tourne sur
// la dernière. Rien ne l'écarte.
const bannerOfVersion = holdBanner(element("nouvelle-version"), document, { telecharger: (url) => brigade.telechargerVersion(url), installer: () => brigade.installerMiseAJour() });
brigade.surAvisDeVersion((opinion) => bannerOfVersion.recevoir(opinion));
void Promise.resolve(brigade.avisDeVersion()).then((opinion) => bannerOfVersion.recevoir(opinion), () => undefined);
// Le statut de la station de cet ordinateur : lu au lancement, puis à chaque fois que le pont le relit. Une lecture qui
// échoue le laisse inconnu — la case le dit, sans erreur.
brigade.surStatutDeLaStation?.((status) => {
  statusOfTheStationSeen = status;
  setTheVersions();
  setBlockStation();
});
void Promise.resolve(brigade.statutDeLaStation?.()).then(
  (status) => {
    statusOfTheStationSeen = status;
    setTheVersions();
    setBlockStation();
  },
  () => undefined,
);
// La veille de la station de cet ordinateur (ticket 3642) : lue au lancement, puis à chaque changement ; la carte de la
// station suit. Une lecture qui échoue la laisse inconnue : la carte n'en dit rien.
brigade.surVeilleMachine?.((standby) => {
  standbyVue = standby;
  restTheTabStations();
});
void Promise.resolve(brigade.veilleMachine?.()).then(
  (standby) => {
    standbyVue = standby;
    restTheTabStations();
  },
  () => undefined,
);
// Les stations relues : ce que la page d'une station en montre suit — leurs lignes de l'accueil viennent par `surAccueil`.
brigade.surStations((seenOne) => {
  stationsViews = seenOne;
  setTheRequestOfStationHere();
  setTheVersions();
  setBlockStation();
  if (stationOpen !== undefined) setPageOfStation();
  setStationsOfProject();
  if (current !== undefined) setCooking(current);
  // L'onglet Stations dit qui cuit le projet, et l'état de chaque station, d'après ce qu'elles publient (ticket 3195).
  if (current !== undefined && tabOf(current) === STATIONS) setRail(current);
});
// L'accueil redit : ses lignes remplacent celles d'avant, s'il est affiché — et l'en-tête de la page d'une station.
brigade.surAccueil((seenOne) => {
  homeSeen = seenOne;
  setStationsOfTheHome();
  if (current !== undefined) setCooking(current);
  // Le plafond de chaque station, sur l'onglet Stations (ticket 1292), suit cette lecture.
  if (current !== undefined && tabOf(current) === STATIONS) setRail(current);
  if (current !== undefined || adds) return;
  if (stationOpen === undefined) setHome();
  else setPageOfStation();
});
// Les projets des stations relus : leurs blocs remplacent ceux d'avant ; le parcours ouvert garde ses choix.
brigade.surProjetsDesStations((seenOne) => {
  projectsSeen = seenOne;
  setBlockStation();
  setProjects();
  setStationsOfProject();
  // La station de ce poste se connaît par cette lecture : la page d'une station ouverte sait si elle est la sienne.
  if (stationOpen !== undefined && current === undefined && !adds) setPageOfStation();
  // L'accès au dépôt et le refus de la station : la ligne d'alerte de Rail les dit (ticket 1185). Apparue ou partie,
  // le rail se repose : elle n'y est que quand elle dit quelque chose.
  if (current !== undefined) {
    const before = alertOfKitchen.hidden;
    setCooking(current);
    restTheLabelOfStation(current);
    if (before !== alertOfKitchen.hidden) setRail(current);
    // Où cuit le projet, son déménagement, la station de cet ordinateur se lisent par cette lecture : l'onglet Stations les
    // montre (tickets 2489, 3195).
    else if (tabOf(current) === STATIONS) setRail(current);
  }
});
// La colonne des terminaux change de taille avec la fenêtre : le terminal montré suit.
new ResizeObserver(() => {
  if (!thread.hidden) showsARight()?.ajuste.fit();
}).observe(thread);

// Ranger les projets : une case de la barre se glisse, et se lâche ailleurs dans la barre — elle
// prend la place de la dernière case survolée, et les autres se décalent. Pendant qu'elle glisse,
// elle s'efface à demi, et un trait dit où elle atterrira : avant la case survolée si elle monte,
// après si elle descend — rien sur la sienne. Lâchée, c'est ce trait qui vaut. Le glisser est
// celui du navigateur : il ne part qu'au-delà de son seuil, et après lui aucun clic n'arrive — une
// case lâchée sur elle-même s'ouvre donc, comme sous un clic. Seule une case de la barre se range
// ainsi : ce qu'elle porte a son propre type, qu'aucun fichier glissé d'ailleurs n'a. Le nouvel
// ordre est celui du fichier des projets (config.ts) : il revient par `surConfiguration`.
const SLIDES = "application/x-brigade-projet";
// La case glissée, et la place où elle atterrira — aucune tant que le trait n'est pas posé.
/** @type {{ nom: string, rang: number | undefined } | undefined} */
let slides;
/** @param {DragEvent} event */
const slidesHere = (event) => slides !== undefined && event.dataTransfer?.types.includes(SLIDES) === true;

/** @param {HTMLElement} entry @param {Project} project */
function renderTidyable(entry, project) {
  entry.draggable = true;
  entry.addEventListener("dragstart", (event) => {
    slides = { nom: project.nom, rang: undefined };
    event.dataTransfer?.setData(SLIDES, project.nom);
    if (event.dataTransfer) event.dataTransfer.effectAllowed = "move";
    entry.classList.toggle("glissee", true);
  });
  entry.addEventListener("dragover", (event) => {
    if (slides === undefined || !slidesHere(event)) return;
    const of = configuration.projets.findIndex(({ nom: name }) => name === slides?.nom);
    const to = configuration.projets.indexOf(project);
    slides.rang = of === to ? undefined : to;
    markRepository(slides.rang === undefined ? undefined : entry, of > to ? "avant" : "apres");
  });
  // Lâchée sur elle-même : le clic que le glisser a pris.
  entry.addEventListener("drop", (event) => {
    if (!slidesHere(event) || slides?.nom !== project.nom || slides.rang !== undefined) return;
    event.preventDefault();
    event.stopPropagation();
    finishSlides();
    void open(project);
  });
  entry.addEventListener("dragend", finishSlides);
}

// Le trait qui dit où la case glissée atterrira : sur une seule case à la fois — aucune, quand
// elle survole la sienne ou qu'elle a quitté la barre.
/** @param {HTMLElement | undefined} entry @param {"avant" | "apres"} or */
function markRepository(entry, or) {
  for (const other of bar.children) {
    other.classList.toggle("depot-avant", other === entry && or === "avant");
    other.classList.toggle("depot-apres", other === entry && or === "apres");
  }
}

function finishSlides() {
  slides = undefined;
  markRepository(undefined, "avant");
  for (const entry of bar.children) entry.classList.toggle("glissee", false);
}

// Toute la barre reçoit la case — entre deux cases aussi : c'est le trait posé qui vaut.
bar.addEventListener("dragover", (event) => {
  if (!slidesHere(event) || event.dataTransfer === null) return;
  event.preventDefault();
  event.dataTransfer.dropEffect = "move";
});
bar.addEventListener("drop", (event) => {
  if (slides === undefined || !slidesHere(event)) return;
  event.preventDefault();
  const { nom: name, rang: rank } = slides;
  finishSlides();
  if (rank !== undefined) void tidy(name, rank);
});
// Hors de la barre, le trait s'efface : lâchée là, la case reprend sa place.
bar.addEventListener("dragleave", (event) => {
  if (slides === undefined || bar.contains(/** @type {Node | null} */ (event.relatedTarget))) return;
  slides.rang = undefined;
  markRepository(undefined, "avant");
});

// Le projet rangé : le process principal l'écrit dans le fichier des projets, et le nouvel ordre
// revient par `surConfiguration`. Refusé, la barre garde l'ordre du fichier, et la raison se lit
// par-dessus l'écran.
/** @param {string} name @param {number} rank */
async function tidy(name, rank) {
  const refusal = await brigade.ranger(name, rank);
  if (refusal !== undefined) setOpinion({ titre: `“${name}” was not moved in the bar`, lignes: [refusal] });
}

// Ce que le fichier des projets donne à voir : la barre, puis l'écran d'avant
// s'il existe encore — sinon « Tous les projets », ou l'ajout tant qu'il n'y a aucun projet.
function display() {
  review.hidden = configuration.nonRelu === undefined;
  // Relu sans faute, rien à dire : la ligne cachée ne garde pas « → undefined » (ticket 4309).
  review.textContent = configuration.nonRelu === undefined ? "" : [
    `${configuration.chemin} changed, and could not be re-read:`,
    `  → ${configuration.nonRelu}`,
    "Your projects are the ones from before, and nothing is closed. The app re-reads it as soon as it changes.",
  ].join("\n");
  // La barre est reposée : les faits d'avant répondaient à une autre liste, ils sont relus.
  // Un rail déjà lu ne se vide jamais (ticket 3337) : sa dernière lecture reste à l'écran pendant la relecture, seuls les
  // projets qui ont quitté la liste perdent la leur. Sans lecture avant, « first read in progress » ne vaut qu'une fois.
  for (const name of [...heldOnes.keys()]) if (!configuration.projets.some((project) => project.nom === name)) heldOnes.delete(name);
  silentOnes.clear();
  pills.clear();
  reported.clear();
  bar.replaceChildren(
    ...configuration.projets.map((project) => {
      const entry = icon("", project.nom, () => void open(project));
      // Son sigle, en grand, sur une ligne (acronym.ts) : le survol de la case dit son nom en entier.
      const label = document.createElement("span");
      label.className = "sigle-de-case";
      label.textContent = project.etiquette;
      entry.append(label);
      renderTidyable(entry, project);
      entry.classList.toggle("refuse", project.refus !== undefined);
      // Sa couleur d'onglet : la case la porte, qu'elle soit choisie ou non.
      const tab = project.couleurs?.onglet;
      entry.classList.toggle("teinte", tab !== undefined);
      if (tab !== undefined) entry.style.setProperty("--teinte", tab);
      // Un projet qui ne se lit nulle part n'a pas de pastille : rien n'est lu de lui.
      if (itselfLit(project)) {
        const setOne = brandOfPill(document, undefined, { coin: true });
        entry.append(setOne);
        pills.set(project.nom, setOne);
        markPill(project.nom);
        markSignal(project.nom);
      }
      return entry;
    }),
  );
  readTheFacts(false);
  if (configuration.refus !== undefined) {
    // Ce fichier-là ne se répare pas d'ici : l'app n'écrit pas dans ce qu'elle n'a pas compris.
    current = undefined;
    adds = false;
    mark();
    message.textContent = [
      "The app could not read your projects file, and does not touch it.",
      "",
      configuration.chemin,
      `  → ${configuration.refus}`,
      "",
      "Its shape — nothing in it is to be copied as is, each value between < > is to be replaced:",
      "",
      example,
      "",
      "The app re-reads this file as soon as it changes: fix it, and it follows.",
    ].join("\n");
    return show();
  }
  const entry = icon("", "All projects", openAll);
  entry.id = "entree-tous";
  entry.append(logoOfBrigade());
  const foot = icon("+", ADD_ONE_PROJECT, openAddition);
  foot.id = "entree-ajout";
  bar.prepend(entry);
  bar.append(foot);
  // Rejouer la visite (ticket 4087), sous « + » : elle repart de sa première étape, en lecture seule et sans clone. Le
  // téléphone n'a pas de visite.
  if (phone === undefined) {
    const tour = icon("?", REPLAY, beginTheVisit);
    tour.id = "entree-visite";
    bar.append(tour);
  }
  // La case du logo est neuve : ce que la dernière lecture des clones en dit y est reposé.
  setCode();

  const same = configuration.projets.find((project) => project.nom === current?.nom);
  // Le projet ouvert du premier lancement, arrivé dans le fichier après sa réponse.
  const expected = firstAOpen === undefined ? undefined : projectOf(firstAOpen);
  if (expected !== undefined) firstAOpen = undefined;
  if (expected !== undefined) void open(expected);
  else if (same !== undefined) void open(same);
  else if (stationOpen !== undefined && !adds) openStation(stationOpen);
  else if (pageOfTheApp === COSTS && !adds) openCosts();
  else if (pageOfTheApp === RESUMES && !adds) openResumes();
  // Sur un ordinateur neuf, sans projet : ses stations et leurs projets (first-launch.js). Sur le téléphone,
  // aucun projet ne s'ajoute d'un dossier : sans projet, l'app reste sur « Tous les projets ».
  else if (adds || (configuration.projets.length === 0 && phone === undefined && !withFirst())) openAddition();
  else if (withFirst()) openFirst();
  // L'app s'ouvre sur « Tous les projets », en tête de la barre.
  else openAll();
  show();
}

const startup = await brigade.demarrage();
WORKSTATION = startup.poste ?? WORKSTATION;
const example = startup.exemple;
PALETTE = startup.palette;
TABS = startup.onglets;
HEADINGS = startup.rubriques;
POWER_UP = startup.gestes.allumage;
KITCHEN_ACTIONS = startup.gestes.cuisine;
CONFIRMED = startup.gestes.confirmes;
ACTIONS_OF_WAIT = startup.gestes.attente ?? [];
DIRECT = startup.gestes.directs;
BANNER = startup.banniere;
// Une lecture arrivée pendant le démarrage est plus récente que celle qu'il rend.
codeSeen ??= startup.code;
stationsViews ??= startup.stations;
projectsSeen ??= startup.projetsDesStations;
homeSeen ??= startup.accueil;
updateVue ??= startup.miseAJour;
bannerOfVersion.suivre(updateVue);
PROJECT_CALIBRATION = startup.calibrage;
let configuration = startup.configuration;
if (brigade.iconeDeFond !== undefined) {
  void readTheIconOfBackground();
  setInterval(() => void readTheIconOfBackground(), 60_000);
}
// Le téléphone (l'app Android) : ce que le pont en garde — rien sur le desktop. Pas encore connecté à GitHub (le ticket
// 2500), l'app s'ouvre sur l'écran qui l'y connecte, et le reste de l'app est caché derrière ; connecté, elle passe à
// « Tous les projets », où une ligne dit sous quel compte (connection-github.js).
const phone = startup.telephone;
phoneSeen = phone;
brigade.surTelephone?.((seenOne) => {
  phoneSeen = seenOne;
  if (current === undefined && !adds && stationOpen === undefined) setHome();
});
// Le chef touche la notification d'une carte de TODO (le ticket 2747) : le projet s'ouvre, puis la fiche de la carte.
brigade.surOuvrirCarte?.((name, ticket) => void openTicketSinceTheCosts(name, ticket));
// GitHub refuse la connexion de ce téléphone : elle est effacée, et l'app se rouvre sur la connexion à GitHub.
async function forgetThePhone() {
  await brigade.oublierLeTelephone?.();
  location.reload();
}
const connectionOfPhone = element("connexion-github");
const frameOfTheApp = element("cadre");
if (phone !== undefined && phone.github === undefined) {
  frameOfTheApp.hidden = true;
  connectionOfPhone.hidden = false;
  holdConnectionGitHub(connectionOfPhone, document, {
    pont: brigade,
    apres: (account) => {
      phoneSeen = { github: { compte: account } };
      connectionOfPhone.className = "fait";
      connectionOfPhone.replaceChildren(setConnected(document, account));
      frameOfTheApp.hidden = false;
      openAll();
      show();
    },
  });
} else if (phone !== undefined && phone.github !== undefined) {
  connectionOfPhone.hidden = false;
  connectionOfPhone.className = "fait";
  connectionOfPhone.replaceChildren(setConnected(document, phone.github.compte));
}
// Sur un Mac neuf, avant l'avis de macOS (ticket 4081) : l'écran qui annonce que Brigade tourne en arrière-plan, l'app
// cachée derrière jusqu'à son bouton.
await holdOpinionOfBackground(element("avis-de-fond"), frameOfTheApp, document, brigade);
// Le terminal mesure ses cases à l'ouverture : sa police, embarquée, est chargée avant qu'aucun
// ne s'ouvre. Si elle ne se charge pas, l'app s'ouvre quand même, sur la police de repli.
await Promise.all(["13px", "bold 13px"].map((body) => document.fonts.load(`${body} ${token("--police-mono")}`))).catch(() => undefined);
await findAgainTheTerminals();
resumeTheScreen();
display();
// Posée une fois la première liste rendue : ce qui change ensuite la remplace.
brigade.surConfiguration((receivedOne, gone) => {
  // Un projet qui a quitté la liste, ou changé de dossier, a perdu ses terminaux.
  for (const id of gone) {
    forget(id);
    for (const [project, shell] of aRight) if (shell === id) aRight.delete(project);
  }
  configuration = receivedOne;
  // Un projet ajouté ou retiré a sa ligne parmi les projets servis, ou ne l'a plus.
  if (servedOnes.etat !== undefined) setTheProjectsServedHere();
  display();
});
