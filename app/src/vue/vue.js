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
// fiche de son ticket (activity-du-cook.js), et sa PR, et essaie l'app construite une fois mergée.
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
// projets (couleurs.ts) : celle de son onglet teint sa case dans la barre, celle de son accent
// remplace l'accent de la peau tant que son espace est affiché. Elles se changent sous Paramètres,
// parmi la palette que le process principal donne ; ce qui s'écrit se décide là-bas. Les couleurs
// d'état — vert, jaune, rouge, bleu, gris — n'en dépendent jamais.
// La peau, enfin : la vue n'écrit ni couleur ni police — elles sont dans tokens.css, et le terminal
// y lit les siennes. Elle dit seulement ce qu'un texte est : ce qui se recopie tel quel (`exact`),
// ce que l'app dit elle-même (`propos`), et — tout le reste d'un `pre` — ce que la box a rendu,
// posé mot pour mot.
import { FitAddon } from "@xterm/addon-fit";
import { Terminal as Xterm } from "@xterm/xterm";
// Les briques communes (briques.js) : une même chose se dit partout de la même façon — le prix
// d'un geste dans son survol, une lecture qui manque en une ligne, une confirmation qui dit son prix.
import { holdBanner } from "./update/banner.js";
import { poserConnecte, poserLaListeGitHub, holdConnectionGitHub } from "./connection-github.js";
import { holdOpinionDeBackground } from "./first-launch/opinion-de-background.js";
import { poserLesIdentities, holdLesIdentities } from "./identities-github.js";
import { poserLesProjectsServed, holdLesProjectsServed } from "./projects-served/projects-served.js";
import { poserLesProjectsDeLaStation, projectsServedPar } from "./station/page/StationProjects.js";
import { poserStepProject } from "./journey-project/step-project.js";
import { buttonAction, caseACocher, prixDit, survol } from "./briques.js";
import { confirmationDeAction } from "./composants/confirmation/confirmation.js";
import { lineError } from "./composants/line-error/line-error.js";
import { poserLesActionsDWait, relanceProposee } from "./wait/wait.js";
import { rangeeDeSetting as rangeeDeLaFamille } from "./composants/setting/setting.js";
import { button as buttonDeLaFamille, sorteDuButton } from "./composants/button/button.js";
import { slip as slipDeLaFamille, teteDuSlip } from "./composants/slip/slip.js";
import { pan } from "./composants/pan/pan.js";
import { cardWait, cardDeAnswer } from "./composants/card-wait/card-wait.js";
import { stateDuTon, formeDe, marque as marqueDePill, pill as pillDState } from "./composants/pill/pill.js";
import { poserChers } from "./cost/chers.js";
import { poserEngine, SANS_ENGINE } from "./delivery-engine/display.js";
import { poserCourbe } from "./cost/courbe.js";
import { poserPerdus } from "./cost/perdus.js";
import { poserTete } from "./cost/tete.js";
import { holdLesFiguresDAutonomy } from "./autonomy/figures.js";
import { holdLTeam } from "./autonomy/team.js";
import { holdLesAgents } from "./agents/agents.js";
import { dayDe, poserLaCardDuDigest, poserLeLog, holdLaCardDuMatin } from "./log/log.js";
import { capacityDuNeed, choiceDeCapacities, revenir, ONLY, stationAOuvrir } from "./stations-declarees.js";
import { DIT_PROVISOIRE, PROVISOIRE } from "./learning.js";
import { absenceALAperture, poserAbsence } from "./absence/absence.js";
import { ceQuiAwaitingDansTodo, poserLeRecap } from "./recap/recap.js";
import { HOME as RESUMES_DE_L_HOME, holdLesResumesHebdomadaires, TITRE as TITRE_DES_RESUMES } from "./resume-weekly/resume-weekly.js";
import { garderLeClavier } from "./garder-le-clavier.js";
import { AILLEURS, poserLaCard as poserLaCardDuChef, poserLaCardAPart, poserLaListe as poserLaListeDesCards, poserLEnvoi } from "./cards-du-chef/cards-du-chef.js";
import { displayNeuf, changerD, poserDetailDeValidation } from "./validation-design/detail-de-validation.js";
import { apresRendu as apresLaValidation, CONFIRMATION_MS as CONFIRMATION_VALIDATION_MS, estUneValidation, poserCardDeValidation, REPOS as VALIDATION_AU_REPOS, sansLesValidees } from "./validation-design/validation-design.js";
import { lineDuRailBlocked } from "./rail-blocked/line-du-rail-blocked.js";
import { lineDeLWait } from "./wait-du-rail/line-de-l-wait.js";
import { lineDesAlertsDuRail } from "./wait-du-rail/line-des-alerts.js";
import { monterLeBanner } from "./banner-stop/banner-stop.js";
import { ceQueLeRailDit, lineDuProjectEnPause, pauseDesProjects, holdLaPause } from "./pause-quota/line-de-la-pause.js";
import { apresRendu as apresLaRevue, CONFIRMATION_MS as CONFIRMATION_REVUE_MS, estUneRevue, marquerSensitive, poserCardSensitive, REPOS as REVUE_AU_REPOS, SANS_PONT as REVUE_SANS_PONT } from "./card-sensitive/card-sensitive.js";
import { parkControl } from "./parked/park-control.js";
import { parkGesture } from "./parked/park-gesture.js";
import { apresRendu as apresLAnnulation, poserAnnulation, REPOS as ANNULATION_AU_REPOS, SANS_PONT as ANNULATION_SANS_PONT } from "./undo/undo.js";
import { apresRendu as apresLaCard, CHAMP_DE_CARD, detailsDeCard, poserCardDeTodo, REPOS as CARD_AU_REPOS, vuDeLaCard } from "./card-todo.js";
import { rangeeDuSecond } from "./todo-card/demander-au-second.js";
import { apresLaRead as apresLaReadDuRepository, INCONNU as REPOSITORY_INCONNU, phraseDuRefusal, poserOpinionDeRepository } from "./page-project/repository-non-prepare.js";
import { poserOpinionDuTodo } from "./todo/opinion-todo.js";
import { poserLesAutres } from "./todo/autres.js";
import { LISTE_DU_CHEF, estRed, rangerLeRail } from "./todo/todo.js";
import { COOKS, DU_RAIL, colonneDuPlan, PAS_PRETS, PASS as COLONNE_PASS, RIEN_DE_PRET, aUnAction, ceQuiAwaitingYou, lineParquee, messageDesAlerts, planDeLaKitchen, poserLaBandeDuHaut, poserLeTodo } from "./kitchen/kitchen.js";
import { lineDesAlerts, phraseDeLWait, retenuesConnues } from "./line-de-status/line-de-status.js";
import { poserLineDuBreaker } from "./todo-breaker-line.js";
import { poserRepositoryRetenu } from "./onboarding/repository-retenu.js";
import { poserBlockages } from "./project/blockages.js";
import { linesDeRefusal } from "./project/rail/refusal-de-station.js";
import { poserDelay } from "./project/delay.js";
import { poserLOffre, firstProjectServed, holdLOffre } from "./offre-phone/offre-phone.js";
import { poserChoice, sansLesChoice } from "./project/choice.js";
import { poserLesSettings } from "./project/settings.js";
import { monterLesHumans, serviceDuPont } from "./settings-humans/humans.js";
import { monterLesRecurring, serviceDesRecurring } from "./recurring/recurring.js";
import { monterLaCardProject } from "./card-project/monter-card-project.js";
import { monterLesStations, serviceDuPont as serviceDesStations } from "./settings-stations/stations.js";
import { niveauDe, NIVEAUX_DITS } from "./niveaux.js";
import { poserPageDeStation as poserLaCoqueDeStation } from "./station/page/StationPage.js";
import { diagramTenu, rendreAvecMermaid } from "./card-diagram/card-diagram.js";
import { lineDAlert, capLu } from "./stations-de-cooking.js";
import { deplacementSuivi, estUnOrdinateur, hautDe, nameDeTaking, servantesDe, UNE_MINUTE_MS } from "./stations-tab/state.js";
import { choiceDuDeplacement } from "./stations-tab/choice.js";
import { cleDe, OU_DEPLACER, poserLOngletDesStations, QUI_CUIT as QUI_CUIT_ONGLET, QUI_D_AUTRE } from "./stations-tab/stations-tab.js";
import { PAR_DEFAUT as ENGINE_PAR_DEFAUT } from "./engine/moteurs.js";
import { poserLesCalls } from "./calls-de-la-station.js";
import { cookDuTicket, duree as dureeDuCook, action as actionDuCook, poserLActivityDuCook } from "./activity-du-cook.js";
import { poserAge, poserEssais } from "./cadence.js";
import { poserRangDTrial } from "./card/trial.js";
import { poserGuardRepetee } from "./card-ticket/card-ticket.js";
import { poserLeWordAuCook } from "./word-au-cook/word-au-cook.js";
import { poserTestsDeCard } from "./card-tests/card-tests.js";
import { poserEtiquettes } from "./etiquettes-de-slip.js";
import { poserLTrial } from "./trial/trial.js";
import { lineDuRefusal, rangeeDuRefusal } from "./refusal/refusal.js";
import { apresLaDecision, phrase, poserJourney as journeyDOnboarding } from "./onboarding/journey.js";
import { lireLeProject, poserFirstLaunch } from "./first-launch.js";
import { holdLeAccount } from "./journey-project/account.js";
import { poserLesTools, holdLesTools } from "./tools-required/tools-required.js";
import { REPOSITORY_DE_LA_VISIT, REPLAY, stepsDeLaVisit, marqueurDeCible, poserLaKitchenVisitee, poserVisit, holdLaVisit, trouverLaCible } from "./visit/visit.js";
import { CLONE_DANS, poserLScreenDAddition } from "./journey-project/addition.js";
import { AU_RETOUR, cetOrdinateurDAbord, nameDite, proposeeDOffice, RAMENER, uneMachine } from "./choice-station/choice-station.js";
import { poserLeDepart, holdLesDeparts } from "./journey-first-project/depart.js";
import { ajouterLaStation, cardDeSetup, choiceDeStation, ICI, poserJourneyFirstProject, progression, holdLesJourney, travailDuSecond, vuDuJourney } from "./journey-first-project/journey-first-project.js";
import { poserLaRequestDeStation, holdLesDemandesDeStation } from "./installation-project/installation-project.js";
import { poserFirstTicket, holdLesPremiersTickets } from "./first-ticket/first-ticket.js";
import { poserStoryDuFirstTicket, holdLeStoryDuFirstTicket } from "./story-first-ticket/story-first-ticket.js";
import { repositoryCollePar, PAS_UN_REPOSITORY } from "./journey-project/step-project.js";
import { buttonDAddition, stateDeLaLine, linesDeProjects, maintenantDeLaLine } from "./home/projects/projects.js";
import { ajoutsDuProject as ajoutsDesEnregistrees, detailsDe, stateDit, issueDeLAddition, readDuAccount, lineDeLEnregistree, lineFondue, tonDe, uneLineParMachine } from "./stations-du-account.js";
import { poserRailPublished } from "./rail-published.js";
import { tellLaRead, poserLaRead } from "./rail-read-perimee.js";
import { poserToolsDuSecond } from "./tools-du-second.js";
import { poserChoiceDuSecond, answerTapee, holdLesChoice } from "./second/choice.js";
import { AUCUNE_STATION } from "./cooks/sans-station.js";
import { marqueApres } from "./card-wait/card-wait.js";
import { waitEpuisee, RAIL_NON_LU } from "./wait-du-rail.js";
import { AGENTS, MENU, KNOW_HOW, STATIONS } from "./project/menu/menu.js";
import { poserLeKnowHow, relireLeKnowHow } from "./know-how-tab/know-how.js";
import { toggle as switchDeLApp } from "./composants/switch/switch.js";
import { FAIT_DIT, stationsAProposer, holdLAdditionDeStation } from "./project/stations/AddStation.js";
import { arreter, actionDStop, SANS_ACTION } from "./project/stations/StopStation.js";
import { ORDINAIRES_EN_COURS, settingsDeLaStation, saisieDe } from "./project/stations/StationSettings.js";
import { connectionALaStation, linesDeLaStationLocale } from "./project/stations/StationLocale.js";
import { monterLePanneau } from "./project/panneau-second/panneau-second.js";
import { poserAddition, poserBlocDesProjects } from "./home/projects/ProjectsBlock.js";
import { poserBlocDeLaPromesse } from "./home/promesse/BlocDeLaPromesse.js";
import { holdBlocDeLaStation } from "./home/station/BlocDeLaStation.js";
import { poserBlocCapsDuree } from "./project/banner-sante/DurationCaps.js";
import { holdLeSavoir } from "./know-how/know-how.js";
import { poserBlocCloser } from "./project/banner-sante/Closer.js";
import { poserBlocTimeDeLaPass } from "./project/banner-sante/PassTime.js";
import { poserBlocPostMortems } from "./project/banner-sante/PostMortems.js";
import { poserActionDuSecond } from "./second/action.js";
import { holdLeReport } from "./report/action.js";
import { casesDesVersions, caseDIci, poserVersionsDesStations, statusLu } from "./station-version/station-version.js";
import { lineEmpty } from "./composants/line-empty/line-empty.js";
import { lineReadOnly } from "./read-only/read-only.js";
import { WORD_DE_LA_COLONNE, poserExplanation, poserLaRangeeDesExplanations, serviceDesExplanations, holdLesExplanations } from "./explanations/explanations.js";
import { CET_ORDINATEUR, ANNULER, OUI, REESSAYER, AJOUTER_UN_PROJECT, PAS_ENCORE, READ_DE, NON_ATTEINT } from "./lexique.js";
import { phraseDuRailEmpty, poserLesRetenus, retenusDe, sansLApprouve } from "./actions-retenus.js";

// Le format des heures, comme src/format.ts : la vue est un module du navigateur, sans bundler,
// et ne peut pas importer du TypeScript — la locale est la même, anglaise.
const heureDe = (/** @type {number | string | Date} */ instant) => new Date(instant).toLocaleTimeString("en-US");
const dateHeure = (/** @type {number | string | Date} */ instant) => new Date(instant).toLocaleString("en-US");

/** @typedef {import("../terminaux.ts").Terminal} Terminal */
/** @typedef {import("../bar.ts").Affichee} Configuration */
/** @typedef {Configuration["projets"][number]} Project */
/** @typedef {import("../awaiting.ts").Montree} Montree */
/** @typedef {import("../box.ts").Read} Read */
/** @typedef {import("../facts.ts").Dessinable} Dessinable */
/** @typedef {import("../alerts.ts").Alert} Alert */
// Ce que `onglets.ts` nomme : l'onglet Paramètres, qui n'a pas de commande à lui.
const PARAMETRES = "parametres";
// Et la lecture de la page des coûts de l'app (ticket 1022) : `station`, sur la box de chaque projet (onglets.ts, `COUTS`).
const COUTS = "couts";
// Et celle des résumés hebdomadaires (ticket 3263) : lue par le process principal, sans onglet.
const RESUMES = "resumes";
// Les onglets de la page d'un projet (ticket 1184), Rail et Stations.
const RAIL = "rail";
// Le menu du projet (ticket 2485, 2921, 4224, 4241) : Rail · Stations · Agents · Know-how · Settings (project/menu/menu.js).
// Sur un écran étroit — le téléphone (ticket 1186) —, trois colonnes ne tiennent pas : la conversation avec le second
// est un troisième onglet, à la place du panneau de droite.
const CONVERSATION = "second";
const CONVERSATION_ONGLET = { id: CONVERSATION, titre: "Second" };
const SCREEN_ETROIT = "(max-width: 720px)";
const screenEtroit = window.matchMedia?.(SCREEN_ETROIT);
const etroit = () => screenEtroit?.matches === true;
// Le panneau du second est à l'écran : ni écran étroit, ni téléphone, ni colonne cachée ou repliée (ticket 3008). Ce qu'il porte ne se montre que s'il l'est.
const panneauAFicher = () => !etroit() && phoneVu === undefined && !colonneSecond.hidden && !colonneSecond.hasAttribute("data-replie");
// La fenêtre passe d'une largeur à l'autre — un téléphone qu'on tourne, une fenêtre qu'on rétrécit : la page se repose.
screenEtroit?.addEventListener?.("change", () => {
  marquer();
  show();
});
// La liste de ce qui attend le chef, que le process principal range à part (facts.ts) : jamais une colonne à l'écran — ses
// cartes sont rouges dans la colonne de leur étape (todo/todo.js, ticket 3458).
const COLONNE_QUI_AWAITING_YOU = LISTE_DU_CHEF;
// Les colonnes où quelque chose bouge : Cooks, Pass — et toute colonne où une carte rouge attend le chef. Les autres se
// lisent en défilant, si elles sont hors de vue (ticket 1556).
const COLONNES_ACTIVES = new Set([COOKS, COLONNE_PASS]);
// Les projets dont la rangée des colonnes a déjà été placée à l'ouverture : ensuite, la lecture suivante garde le défilement du chef.
const rangeesPlacees = new Set();
// Le projet et l'onglet que le rail montrait à sa dernière pose : redessiné pour le même, il garde le défilement de la
// page — un clic sur une carte (« Give it to a station ») ne la ramène pas en haut (ticket 2133).
let railPoseDe = "";
// La dernière rangée posée de chaque projet : c'est d'elle que la lecture suivante reprend le défilement.
/** @type {Map<string, HTMLElement>} */
const rangees = new Map();
/** @typedef {import("../allumage.ts").Account} Account */
/** @typedef {import("../confirmation.ts").Confirmation} Confirmation */
/** @typedef {import("../service.ts").Guide} Guide */
/** @typedef {import("../retrait.ts").Retrait} Retrait */
/** @typedef {import("../retard.ts").Vu} VuDuCode */

const brigade = window.brigade;

// Le geste d'un projet, tel que la vue le nomme : par son nom d'étape entre guillemets, « status » —
// jamais par la commande qui le lance, qui ne s'affiche pas (le chef le joue par son bouton).
/** @param {Project} _project @param {string} command */
const gesture = (_project, command) => `the station's “${command.split(" ").filter((m, i, tous) => !tous.slice(0, i + 1).some((t) => /^[-<]/.test(t))).join(" ")}” step`;
// Ce qui se lit d'un projet : une station le sert (`servi`) — ou cet ordinateur, quand c'est sa station
// qui fait tourner sa cuisine (`ici`, workstation/kitchen-ici.ts).
// Tant que la station de cet ordinateur ne tourne pas (`sansStation`), rien n'en est lu : la page
// ne dit que cela, en une ligne (attendre).
/** @param {Project} project */
const seLit = (project) => (project.servi === true || project.ici === true) && project.sansStation !== true;
/** @param {string} name */
const projectDe = (name) => configuration.projets.find((project) => project.nom === name);

/** @template {HTMLElement} T @param {string} id @returns {T} */
const element = (id) => /** @type {T} */ (document.getElementById(id));
const bar = element("projets");
const tous = element("tous");
const cardsDuChef = element("cartes-du-chef");
const principal = /** @type {HTMLElement} */ (document.querySelector("main"));
const bande = element("alertes");
const stop = element("arret");
const space = element("espace");
const ongletsDuProject = element("onglets-du-projet");
const etiquetteDeLaStation = element("etiquette-de-station");
const contenu = element("contenu");
const centre = element("centre");
const rail = element("rail");
const card = element("fiche");
const detailDeValidation = element("detail-de-validation");
const luOnglet = element("lu-onglet");
const readOnglet = element("lecture-onglet");
const switchProject = element("interrupteur-projet");
const stopKitchen = element("arreter-cuisine");
const sectionKitchen = element("reglages-cuisine");
const note = element("note");
const ongletsTerminaux = element("terminaux");
const fermerShell = element("fermer-shell");
const listeMachines = element("machines");
const colonneSecond = element("second");
const noteSecond = element("note-second");
const explanationSecond = element("explication-second");
const explanationsDuChef = element("explications-du-chef");
const toolsDuSecond = element("outils-du-second");
const choiceDuSecond = element("choix-du-second");
// Le stockage de la vue, ou rien quand son accès est refusé : la lecture de `window.localStorage` lève alors (SecurityError),
// et chacun de ses usagers fait sans lui plutôt que de casser la vue au démarrage.
/** @returns {Storage | undefined} */
function stockageDeLaVue() {
  try {
    return window.localStorage ?? undefined;
  } catch {
    return undefined;
  }
}
// La visite d'une vraie cuisine (ticket 4087, visit/) : son écran par-dessus tout, la cuisine de Brigade en lecture seule,
// l'étape où en est la visite guidée, et ce que la dernière lecture de cette cuisine a rendu — absente, elle est en route.
const sectionVisit = element("visite");
// L'app derrière la visite : inerte tant que la visite est ouverte — aucun de ses gestes sur un ticket ne se focalise, ne
// se lit ni ne se clique sous l'écran de la visite, même quand un projet est ouvert dessous.
const cadreSousLaVisit = element("cadre");
const visit = holdLaVisit({ rendre: () => poserLaVisit() });
/** @type {import("../visit.ts").KitchenVisitee | undefined} */
let kitchenVisitee;
let readDeLaVisit = 0;
const marquerLaCible = marqueurDeCible();
// L'écran « since you were away » (ticket 3305, absence/) : décidé une fois, à l'ouverture — la date de la dernière ouverture
// est alors réécrite —, et montré avant tout autre écran. Vaut la date de l'ancienne ouverture quand l'écran vient.
const absenceDepuis = absenceALAperture({ stockage: window.localStorage ?? undefined });
const sectionAbsence = element("absence");
/** @type {Map<string, import("./resume-weekly/resume-kitchen.ts").ResumesDuProject>} */
const resumesDeLAbsence = new Map();
/** @type {Set<string>} */
const lecturesDeLAbsence = new Set();
let absenceFermee = false;
let absencePosee = "";
// Ce que le second de chaque projet propose, tel que son canal le dit (ticket 1520) : ses choix, sous son terminal — ou
// le geste qu'il nomme (ticket 1521).
const propositionsDuSecond = holdLesChoice();
// Ce que la page d'un projet montre tant qu'il n'est pas prêt (ticket 3166, journey-first-project/) : à la place du rail,
// une question à la fois — qui le cuit, puis sa mise en place s'il le faut. Le parcours de chaque projet qu'« Add a
// project » a ouvert ; ceux qui attendent leur première lecture — elle seule dit si le compte GitHub peut écrire dans
// leur dépôt ; les lectures de leur mise en place en route ; et le dernier titre que `claude` a donné au terminal du
// second de chaque projet : au travail, ou au repos à son invite.
const sectionDuJourney = element("parcours-premier-projet");
const journeyDesProjects = holdLesJourney({ rendre: (name) => void (courant?.nom === name && poserLeProjectAPreparer()) });
// Le récit du premier ticket du premier projet du chef (ticket 3302, story-first-ticket/) : au-dessus du rail, une ligne à
// chaque vraie étape que les lectures du rail montrent, gardée dans le stockage de la vue jusqu'à ce que le chef la range.
const sectionDuStory = element("recit-premier-ticket");
const storyDuFirstTicket = holdLeStoryDuFirstTicket({ stockage: window.localStorage ?? undefined, rendre: () => poserLeStoryDuFirstTicket() });
// Le départ d'un projet qui arrive avec des issues ouvertes (ticket 3268, journey-first-project/depart.js) : l'écran des
// propositions du second, avant les questions du parcours.
const departsDesProjects = holdLesDeparts({ rendre: (name) => void (courant?.nom === name && poserLeProjectAPreparer()) });
// Le premier ticket d'un projet prêt (ticket 3306, first-ticket/) : la question du second, son brouillon, le « oui » du chef.
const premiersTickets = holdLesPremiersTickets({
  rendre: (name) => void (courant?.nom === name && poserLeProjectAPreparer()),
  rediger: (name, request) => brigade.redigerLePremierTicket(name, request),
  creer: (name, brouillon) => brigade.creerLePremierTicket(name, brouillon),
});
// Un projet dont la mise en place vient de passer, qu'aucune station ne sert (ticket 3400, installation-project/) : sa page
// demande aussitôt laquelle le sert, cet ordinateur en tête. Rangée par « not now », la question ne revient pas.
const sectionDeLaRequest = element("installation-projet");
const demandesDeStation = holdLesDemandesDeStation({ rendre: (name) => void (courant?.nom === name && poserLaRequestDeStationIci()) });
/** @type {Map<string, string>} */
const aGuider = new Map();
/** @type {Set<string>} */
const preparationsEnRead = new Set();
/** @type {Map<string, string>} */
const titresDesSeconds = new Map();
const fil = element("fil");
const banner = element("bandeau");
const teteDuSecond = element("tete-du-second");
// Le panneau du second (ticket 2923) : un bouton le replie, son bord gauche se tire ; largeur et état retenus par projet.
// Le rail et lui se partagent la place de l'espace : la largeur du panneau en est bornée.
const panneauDuSecond = monterLePanneau({
  document,
  colonne: colonneSecond,
  tete: teteDuSecond,
  stockage: stockageDeLaVue(),
  disponible: () => {
    const rail = principal.getBoundingClientRect?.().width;
    const panneau = colonneSecond.getBoundingClientRect?.().width;
    return rail === undefined || panneau === undefined ? undefined : rail + panneau;
  },
});
window.addEventListener?.("resize", () => panneauDuSecond.reborner());
const message = element("message");
const state = element("etat");
// Settings (ticket 1700, 2494) : un seul groupe, le projet. Ce qui était à cette machine n'y est plus : ses lignes sont
// toujours posées, dans un conteneur caché, jusqu'à ce que Stations les reprenne.
const groupeMachine = element("reglages-machine");
const emptyProject = element("vide-project");
const retrait = element("retrait");
const couleurs = element("couleurs");
const sigle = element("sigle");
const barDeMenus = element("barre-de-menus");
const ordinaires = element("ordinaires");
// Les GitHub Apps de la station de cet ordinateur, une ligne par rôle (ticket 2317, identities-github.js) : relues à
// l'ouverture de chaque projet ; un appareil sans station (le téléphone) n'en pose aucune.
const appsGithub = element("apps-github");
const identitiesGithub = holdLesIdentities({ pont: brigade, rendre: () => poserLesAppsGithub() });
function poserLesAppsGithub() {
  const state = identitiesGithub.etat;
  appsGithub.hidden = state === undefined;
  appsGithub.replaceChildren(...(state === undefined ? [] : [poserLesIdentities(document, state, identitiesGithub.gestes)]));
  poserLesGroupes();
}
// Les projets que la station de cet ordinateur sert (ticket 2359, projects-served/), lus sans rien régler : une ligne par
// projet de l'app, et, la liste vide, la ligne qui dit que cet ordinateur n'en sert aucun. Ils se changent sur l'onglet
// Stations de chaque projet (ticket 3402). Relus à l'ouverture de chaque projet ; un appareil sans station (le téléphone)
// n'en pose aucun.
const projectsServed = element("projets-servis");
const servedOnes = holdLesProjectsServed({
  pont: brigade,
  rendre: () => {
    poserLesProjectsServedIci();
    // L'onglet Stations la lit aussi : la carte de cet ordinateur suit la liste (ticket 3402).
    reposerLOngletStations();
  },
});
function poserLesProjectsServedIci() {
  const state = servedOnes.etat;
  projectsServed.hidden = state === undefined;
  projectsServed.replaceChildren(...(state === undefined ? [] : [poserLesProjectsServed(document, { etat: state, projets: configuration.projets, ici: WORKSTATION.nom })]));
  poserLesGroupes();
  poserLaRequestDeStationIci();
}
// La station de cet ordinateur sert-elle le dépôt du projet, d'après sa liste ? Liste non lue, ou dépôt inconnu : on ne
// sait pas (`undefined`).
/** @param {Project} project @returns {boolean | undefined} */
function servedParCetOrdinateur(project) {
  const repository = (project.depot ?? projectsVus?.projets.find(({ nom: name }) => name === project.nom)?.depot ?? "").toLowerCase();
  const read = servedOnes.etat?.lecture;
  if (repository === "" || read === undefined || !("depots" in read)) return undefined;
  return read.depots.some((served) => served.toLowerCase() === repository);
}
// « Add a station », dans l'onglet Stations (ticket 2487, project/stations/AddStation.js) : cet ordinateur d'abord, par sa
// liste — puis elle se relit ; une station appairée, par le geste de sa page sur l'accueil. Le parcours change : l'onglet
// se repose, s'il est montré.
const additionDeStation = holdLAdditionDeStation({
  servirIci: (repository) => servirIciLeRepository(repository),
  choisir: (id, depots) => choisirPourUneEnregistree(id, depots),
  rendre: () => reposerLOngletStations(),
});
// La station de cet ordinateur sert un dépôt : il entre dans sa liste — puis la liste se relit. « Add a station » le fait.
/** @param {string} repository @returns {Promise<import("./projects-served/projects-served.js").ReadDesProjectsServed>} */
async function servirIciLeRepository(repository) {
  const rendu = (await brigade.servirUnProjet?.(repository, true)) ?? { refus: NON_ATTEINT(`${CET_ORDINATEUR}'s station`) };
  void servedOnes.lire();
  return rendu;
}
function reposerLOngletStations() {
  if (courant !== undefined && ongletDe(courant) === STATIONS) poserRail(courant);
}
const settingsDuProject = element("reglages-du-projet");
const settingsEnPlus = element("reglages-du-projet-en-plus");
const opinion = element("avis");
// Les stations que la box de chaque projet déclare, telles que le dernier contrôle de son installation les a lues
// (service.ts, `controle.stations`) : gardées d'un guide à l'autre, jusqu'à la lecture suivante.
/** @type {Map<string, import("../service.ts").StationsLues>} */
const declarees = new Map();
// « report to brigade », sous chaque panne que l'app montre (ticket 1977) : une issue préremplie, ouverte dans le navigateur.
// Sur le téléphone, rien ne l'ouvrirait : le bouton n'y est pas.
const report = holdLeReport({ doc: document, pont: brigade, actif: () => phoneVu === undefined });
// Le bandeau de la cuisine arrêtée (ticket 3924), en tête du rail : monté une fois, chaque lecture du rail le pose ou le retire.
const hoteDeLStop = document.createElement("div");
hoteDeLStop.className = "hote-bandeau-arret";
// Son geste vise le projet affiché (ticket 4238).
const bannerDStop = monterLeBanner(document, hoteDeLStop, {
  ouvrirTicket: (ticket) => void (courant === undefined ? undefined : ouvrirIssue(courant, ticket)),
  ouvrirLesChecks: () => void (courant === undefined ? undefined : ouvrirLesChecks(courant)),
  relire: () => lireLesFacts(),
});
const alertDeKitchen = document.createElement("div");
alertDeKitchen.id = "alerte-de-cuisine";
const addition = element("ajout");
const relecture = element("relecture");
// Posé dans le conteneur caché de ce qui était sous cette machine : le code de l'app, et des clones de brigade — la case « T » le dit aussi, au survol.
const code = document.createElement("div");
code.id = "code";
code.ariaLive = "polite";
groupeMachine.append(code);
// L'accueil, « Tous les projets » : la vue d'ensemble de brigade (home.ts). Trois blocs (tickets 2638, 3195) : la liste
// des projets — une ligne chacun, un clic ouvre son espace —, la station de cet ordinateur, et toutes les stations.
const projectsDeLHome = document.createElement("section");
projectsDeLHome.id = "accueil-projets";
projectsDeLHome.className = "liste";
projectsDeLHome.ariaLabel = "Projects";
// Toutes les stations — une ligne par machine, un clic ouvre sa page —, et « + station » : elles valent pour le compte, pas
// pour un projet. Sous l'onglet Stations de chaque projet depuis le ticket 2638, elles reviennent sur l'accueil, un bloc à
// elles sous la station de cet ordinateur (ticket 3195) : l'onglet ne montre que les stations qui servent le projet.
const TOUTES_LES_STATIONS = "All stations";
const stationsDeLHome = document.createElement("section");
stationsDeLHome.id = "toutes-les-stations";
stationsDeLHome.className = "bloc-de-l-accueil";
stationsDeLHome.ariaLabel = TOUTES_LES_STATIONS;
stationsDeLHome.dataset.bloc = "toutes-les-stations";
// Ses lignes dans une carte, comme celles des projets au-dessus.
const listeDesStations = document.createElement("div");
listeDesStations.className = "liste";
listeDesStations.ariaLive = "polite";
// « + station », sous la liste : le champ du code s'ouvre dessous, et nulle part ailleurs. Il est posé
// une fois : une relecture ne vide pas ce que le chef tape.
const ouvrirLAppairage = /** @type {HTMLButtonElement} */ (button("+ station", undefined));
ouvrirLAppairage.className = "ajout-de-station";
const formulaireDAppairage = document.createElement("form");
formulaireDAppairage.hidden = true;
const codeTape = document.createElement("input");
codeTape.placeholder = "the code a new station shows, like 7KQ2-M9XD";
codeTape.ariaLabel = "pairing code";
codeTape.autocomplete = "off";
codeTape.spellcheck = false;
const appairage = buttonDeLaFamille(document, "pair", undefined, { sorte: "recommande", type: "submit" });
const renoncerAppairage = /** @type {HTMLButtonElement} */ (button(ANNULER, undefined, "discret"));
const appairageDit = document.createElement("p");
appairageDit.ariaLive = "polite";
formulaireDAppairage.append(codeTape, appairage, renoncerAppairage, appairageDit);
// Les stations enregistrées sous le compte GitHub du chef (ticket 1706, stations-du-account.js) : dans la liste des
// stations, une ligne pour chaque machine qu'aucune station appairée ne nomme (ticket 1778) — un clic ouvre sa page, où se
// cochent les projets qu'elle sert ; sous la liste, ce que leur lecture a de plus à dire. Lues à chaque ouverture de l'accueil, ou
// à la demande ; rien n'est posé avant la première réponse, ni sur un pont qui ne les lit pas.
const blocDesEnregistrees = document.createElement("section");
blocDesEnregistrees.className = "stations-du-compte";
blocDesEnregistrees.ariaLive = "polite";
blocDesEnregistrees.hidden = true;
// La version de la station de cet ordinateur à côté de celle de la box (ticket 2191, station-version/) : sous la liste,
// côte à côte, et ce poste dit en retard quand une station plus haute est publiée. Rien sur le téléphone, qui n'en a pas.
const versionsDesStations = document.createElement("div");
versionsDesStations.ariaLive = "polite";
stationsDeLHome.append(bloc("h2", TOUTES_LES_STATIONS), listeDesStations, versionsDesStations, blocDesEnregistrees, ouvrirLAppairage, formulaireDAppairage);
/** @type {import("./stations-du-account.js").StateDuAccount} */
const stateDesEnregistrees = {};
let enregistreesAbsentes = true;
let readDesEnregistrees = 0;
/** @type {import("./stations-du-account.js").ActionsDuAccount} */
const actionsDesEnregistrees = {
  ouvrirLaStation: (id) => ouvrirStation(id),
  relire: () => {
    void lireLesEnregistrees();
  },
  seConnecter: () => void seConnecterAGitHub(),
  ouvrirLaPage: (url) => void brigade.ouvrirLaPage?.(url),
  copier: (command) => {
    void navigator.clipboard?.writeText(command)?.catch(() => {});
    stateDesEnregistrees.copiee = command;
    poserStationsDeLHome();
  },
};
// La page d'une station, ouverte d'un clic sur sa ligne : son état, ses pannes et leur bouton, et les projets qu'elle
// sert — une liste qui se lit seulement, chacun menant à l'onglet Stations de son projet. Rien ne s'y tape au terminal.
const pageDeStation = document.createElement("section");
pageDeStation.id = "station";
pageDeStation.className = "carte";
const enTeteDeStation = document.createElement("header");
const outagesDeStation = document.createElement("div");
outagesDeStation.ariaLive = "polite";
const projectsDeLaStation = document.createElement("div");
projectsDeLaStation.ariaLive = "polite";
const retourALHome = /** @type {HTMLButtonElement} */ (button("‹ All projects", undefined, "discret"));
retourALHome.className = "retour";
// Le plafond de cooks, sous l'en-tête : ce que `status` en dit, et ce qui retient la station.
const capDeStation = document.createElement("div");
capDeStation.className = "plafond-de-station";
capDeStation.ariaLive = "polite";
// La ligne de mise à jour, sous l'en-tête ; et, au bas de la page, « remove the station » et sa confirmation.
const versionDeStation = document.createElement("p");
versionDeStation.className = "version-de-station";
const retraitDeStation = document.createElement("div");
retraitDeStation.className = "retrait-de-station";
// Ses sections, sous ses pannes (ticket 2641, épique 2497) : identité, connexions, dossiers et bac à sable, capacités,
// cooks — posées par la coque de station/page/StationPage.js.
const sectionsDeStation = document.createElement("div");
sectionsDeStation.className = "sections-de-station";
pageDeStation.append(retourALHome, enTeteDeStation, capDeStation, versionDeStation, outagesDeStation, sectionsDeStation, projectsDeLaStation, retraitDeStation);
// Le coût de tous les projets (ticket 1022) : il vaut pour l'ensemble, il vit donc au niveau de l'app, pas dans
// un projet. Une ligne « Cost » l'ouvre, en bas du bandeau de santé de chaque projet (sur l'accueil jusqu'au ticket 2638). Sa page : les tokens
// lancés sur 5 h, 24 h et 7 jours par projet, les tokens perdus, les tickets les plus chers, la courbe, et
// le renvoi vers `/usage` (cost/). Un clic sur un projet l'ouvre ; sur un ticket, ouvre sa fiche dans son projet.
const coutsDeLHome = document.createElement("section");
coutsDeLHome.id = "couts-de-tous";
coutsDeLHome.ariaLabel = "Cost";
const ouvrirLesCouts = /** @type {HTMLButtonElement} */ (bloc("button", ""));
ouvrirLesCouts.type = "button";
ouvrirLesCouts.className = "ligne";
ouvrirLesCouts.ariaLabel = "the cost of all projects";
{
  const suite = bloc("span", "›");
  suite.className = "ouvrir";
  suite.ariaHidden = "true";
  ouvrirLesCouts.append(bloc("strong", "Cost"), bloc("span", "tokens over 5 h, 24 h and 7 d · lost tokens · most expensive tickets"), suite);
}
coutsDeLHome.append(ouvrirLesCouts);
const pageDesCouts = document.createElement("section");
pageDesCouts.id = "cout";
pageDesCouts.ariaLabel = "Cost of all projects";
const retourDesCouts = /** @type {HTMLButtonElement} */ (button("‹ All projects", undefined, "discret"));
retourDesCouts.className = "retour";
const corpsDesCouts = document.createElement("div");
corpsDesCouts.ariaLive = "polite";
pageDesCouts.append(retourDesCouts, corpsDesCouts);
// Les résumés hebdomadaires de la cuisine de chaque projet (ticket 3263), de même : une ligne « Weekly summary » ouvre leur
// page (resume-weekly/), lue et publiée par le process principal.
const resumesDeLHome = document.createElement("section");
resumesDeLHome.id = "resumes-de-tous";
resumesDeLHome.ariaLabel = TITRE_DES_RESUMES;
const ouvrirLesResumes = /** @type {HTMLButtonElement} */ (bloc("button", ""));
ouvrirLesResumes.type = "button";
ouvrirLesResumes.className = "ligne";
ouvrirLesResumes.ariaLabel = "the weekly summaries of all projects";
{
  const suite = bloc("span", "›");
  suite.className = "ouvrir";
  suite.ariaHidden = "true";
  ouvrirLesResumes.append(bloc("strong", TITRE_DES_RESUMES), bloc("span", RESUMES_DE_L_HOME), suite);
}
resumesDeLHome.append(ouvrirLesResumes);
// Les lignes de tous les projets, dans le bandeau de santé de chacun (ticket 2638) : elles valent pour l'ensemble.
const TOUS_LES_PROJECTS = "All projects";
const deTousLesProjects = document.createElement("section");
deTousLesProjects.id = "de-tous-les-projets";
deTousLesProjects.className = "bloc-du-projet";
deTousLesProjects.ariaLabel = TOUS_LES_PROJECTS;
deTousLesProjects.dataset.bloc = "de-tous-les-projets";
deTousLesProjects.append(bloc("h3", TOUS_LES_PROJECTS), coutsDeLHome, resumesDeLHome);
// L'accueil a les projets et la station de cet ordinateur (ticket 2638, épique 2497) — chacun son composant, sous
// home/ —, puis toutes les stations (ticket 3195). La version de l'app et la ligne de santé l'ont quitté sans aller ailleurs : la ligne d'une
// version plus haute, en tête de l'app (update/banner.js), dit la version qui tourne et l'installe.
const blocDeLaPromesse = poserBlocDeLaPromesse(document);
const blocDesProjects = poserBlocDesProjects(document, projectsDeLHome);
// Le récapitulatif de chaque projet, en tête de l'accueil (ticket 3581, recap/) : sa place, que `poserLeRecapDeLAccueil` remplit.
const recapDeLHome = document.createElement("div");
recapDeLHome.id = "recap-de-l-accueil";
// Ce qui en est lu à cette ouverture de l'app, par projet ; ce qui se lit encore ; ce que le runtime sait montré.
// `null` : le pont n'a rien rendu — il ne porte pas le récapitulatif, le projet n'en montre aucun.
/** @type {Map<string, import("./recap/recap-box.ts").ReadDuRecap | null>} */
const recapsLus = new Map();
/** @type {Set<string>} */
const recapsEnRead = new Set();
/** @type {Set<string>} */
const recapsMarques = new Set();
// Les premiers réglages de la station qu'on vient d'installer : se connecter à GitHub (le geste que l'app a déjà), puis
// choisir les projets qu'elle sert, sur sa page.
const blocDeLaStation = holdBlocDeLaStation(document, {
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
                const debut = await brigade.seConnecterAGitHub?.();
                return debut !== undefined && "refus" in debut ? debut : undefined;
              },
            },
          }),
    },
    { nom: "Projects", dit: "choose which projects this station serves, on its page — you can do it later" },
  ],
  ouvrir: (id) => ouvrirStation(id),
});
const pageDesResumes = document.createElement("section");
pageDesResumes.id = "resumes";
pageDesResumes.ariaLabel = TITRE_DES_RESUMES;
const retourDesResumes = /** @type {HTMLButtonElement} */ (button("‹ All projects", undefined, "discret"));
retourDesResumes.className = "retour";
const resumesDeTous = holdLesResumesHebdomadaires(document, {
  lire: (name) => brigade.lireLesResumesHebdomadaires(name),
  changerJour: (name, day) => brigade.changerLeJourDuResume(name, day),
  publier: (name, resume, tag) => brigade.publierLeResumeHebdomadaire(name, resume.weekStart, tag),
  ouvrir: (url) => void brigade.ouvrirTicketDuResume(url),
  ouvrirProposition: (url) => void brigade.ouvrirLaProposition(url),
});
pageDesResumes.append(retourDesResumes, resumesDeTous.element);

// La cuisine d'un projet de l'app (ticket 983), en tête de son espace : les stations qui la font, en une
// ligne — chacune avec ce qu'elle en dit, un clic ouvre sa page —, et « + station » pour en ajouter
// une. Tant qu'aucune ne la fait, une phrase le dit, et « choose its machine » ouvre le choix
// parmi les stations appairées : c'est le seul geste qui installe un projet sur une station.
const stationsDuProject = element("stations-du-projet");
// Ce qui bloque le projet affiché (ticket 1399), sous ses stations, tel que le suivi le publie : une ligne par
// blocage (project/blockages.js). Les détails que le chef a dépliés, par projet et blocage : une relecture ne les replie pas.
const delayDuProject = element("delai-du-projet");
// L'équipe du projet affiché (ticket 4029, autonomy/team.js), en tête de sa vue : relue à son ouverture et à chaque
// lecture de son rail, montrée pour lui seul.
// La bande du haut du rail lit son supervisor et son closer : une lecture qui les change la repose (ticket 4238).
// Un clic sur un badge ouvre l'onglet Agents (ticket 4224).
const teamDuProject = holdLTeam(document, element("equipe-du-projet"), (name) => {
  if (courant?.nom === name) poserRail(courant);
}, () => choisirOnglet(AGENTS));
// L'onglet Agents du projet affiché (ticket 4224, agents/) : ses agents lus au runtime à l'ouverture de l'onglet, une carte
// chacun ; les listes du modèle et de l'effort sont celles du calibrage que l'app connaît.
const agentsDuProject = holdLesAgents(document, { valeurs: () => PROJECT_CALIBRATION });
// L'offre du téléphone (ticket 3303, offre-phone/) : sous le délai du premier projet du chef, une fois son premier
// ticket servi, si aucun téléphone n'est déjà connecté au compte GitHub ; acceptée, le lien de l'app Android ; déclinée
// ou suivie, gardée rangée dans le stockage de la vue.
// La carte du digest de la veille (ticket 4274, log/) : en tête du rail à la première ouverture du projet dans le jour.
const cardDuMatin = holdLaCardDuMatin(stockageDeLaVue());
const offreDuPhone = element("offre-telephone");
const offre = holdLOffre({
  stockage: stockageDeLaVue(),
  lire: async () => brigade.lienDeLApk?.(),
  connecte: async () => brigade.telephoneConnecte?.(),
  ouvrir: (lien) => void brigade.ouvrirLaPage?.(lien),
  rendre: () => poserLOffreDuPhone(courant),
});
const bannerSante = element("bandeau-sante");
const blockagesDuProject = element("blocages-du-projet");
/** @type {Map<string, Set<string>>} */
const blockagesDeplies = new Map();
// Les projets dont le chef a déplié « Awaiting others » au pied de TODO (ticket 2985) : la lecture suivante la garde dépliée.
/** @type {Set<string>} */
const autresDeplies = new Set();
// Ce qui manque au projet pour ses tests (ticket 1400), au-dessus de ses blocages : une carte par besoin
// (project/choice.js). Par projet : les choix dont l'issue part (`enCours`), celles qui sont écrites et que la station
// n'a pas encore relues (`retenus`), et pourquoi une issue n'a pas été retenue (`refus`).
const choiceDuProject = element("choix-du-projet");
/** @type {Map<string, { enCours: Set<string>, retenus: Set<string>, refus: Map<string, { refus: string, detail?: string }> }>} */
const choiceRetenus = new Map();
const lineDesStationsDuProject = document.createElement("p");
lineDesStationsDuProject.ariaLive = "polite";
const ouvrirLaConfiance = /** @type {HTMLButtonElement} */ (button("", undefined));
ouvrirLaConfiance.className = "ajout-de-station";
// Le choix lui-même, une carte (ticket 1107). En tête, une phrase dit ce que le chef fait, et une autre
// ce que fait la machine qu'il choisit. Puis les machines, une à choisir, chacune avec ce qu'elle implique — cet
// ordinateur d'abord, une station en ligne proposée d'office (choice-station/, ticket 3187) —, et les cooks à la fois de
// la machine choisie. Le calibrage du manager et du reviewer n'y est pas : il part tel que l'app le recommande, et se
// change dans les réglages du projet. Chaque valeur arrive posée, avec d'où elle vient : le chef peut tout changer, ou
// lancer sans rien toucher.
const formulaireDeConfiance = document.createElement("form");
formulaireDeConfiance.className = "confiance";
formulaireDeConfiance.hidden = true;
const titreDeConfiance = document.createElement("h3");
const sensDeConfiance = document.createElement("p");
sensDeConfiance.className = "aide";
// Un champ : son libellé, en entier au-dessus de lui, et ce qu'il en est dit dessous.
/** @param {string} libelle @param {HTMLElement} saisie @param {HTMLElement | undefined} dit @param {HTMLElement} niveau l'étiquette du réglage (niveaux.js) */
function champDeConfiance(libelle, saisie, dit, niveau) {
  const pose = document.createElement("div");
  pose.className = "champ";
  const nomme = bloc("label", libelle);
  saisie.id = `confiance-${libelle.toLowerCase().replace(/[^a-z]+/g, "-")}`;
  /** @type {HTMLLabelElement} */ (nomme).htmlFor = saisie.id;
  pose.append(nomme, niveau, saisie, ...(dit === undefined ? [] : [dit]));
  return pose;
}
const repositoryDeConfiance = /** @type {HTMLSelectElement} */ (document.createElement("select"));
repositoryDeConfiance.ariaLabel = "repository";
const baseDeConfiance = document.createElement("input");
baseDeConfiance.ariaLabel = "integration branch";
baseDeConfiance.spellcheck = false;
const champDuRepository = champDeConfiance("Its GitHub repository", repositoryDeConfiance, undefined, niveauDe(document, "depot"));
const champDeLaBase = champDeConfiance("Its integration branch", baseDeConfiance, bloc("small", "The branch the kitchen delivers to."), niveauDe(document, "branche"));
const stationsChoisiesDeConfiance = document.createElement("fieldset");
const legendeDesStationsChoisies = document.createElement("legend");
const sensDesStationsChoisies = document.createElement("p");
sensDesStationsChoisies.className = "aide";
const choiceDesStationsChoisies = document.createElement("div");
choiceDesStationsChoisies.className = "machines";
stationsChoisiesDeConfiance.append(legendeDesStationsChoisies, sensDesStationsChoisies, choiceDesStationsChoisies);
const cooksDeConfiance = document.createElement("input");
cooksDeConfiance.type = "number";
cooksDeConfiance.min = "1";
cooksDeConfiance.ariaLabel = "cooks at once";
const cooksDits = document.createElement("small");
cooksDits.className = "propose";
const champDesCooks = champDeConfiance("Cooks at once", cooksDeConfiance, cooksDits, niveauDe(document, "cooks"));
// Une station de plus (ticket 1307) ne dit que ce qui est à sa machine, posé d'emblée : ses cooks, le dossier où sa
// station pose les espaces de travail de ses cooks — qu'elle choisit elle-même : il se lit, il ne se change pas ici —,
// et ce que la machine sait faire, une case par capacité, cochée quand elle y est détectée.
const dossierDeConfiance = document.createElement("input");
dossierDeConfiance.readOnly = true;
dossierDeConfiance.spellcheck = false;
dossierDeConfiance.ariaLabel = "workspace folder";
const dossierDit = document.createElement("small");
const champDuDossier = champDeConfiance("Workspace folder", dossierDeConfiance, dossierDit, niveauDe(document, "dossier"));
const capacitiesDeConfiance = document.createElement("fieldset");
const legendeDesCapacities = document.createElement("legend");
const choiceDesCapacities = document.createElement("div");
choiceDesCapacities.className = "capacites";
capacitiesDeConfiance.append(legendeDesCapacities, niveauDe(document, "capacites"), choiceDesCapacities);
const confianceRefusee = document.createElement("div");
confianceRefusee.ariaLive = "polite";
const validerConfiance = /** @type {HTMLButtonElement} */ (buttonDeLaFamille(document, "", undefined, { sorte: "recommande", type: "submit" }));
const annulerConfiance = /** @type {HTMLButtonElement} */ (button(ANNULER, undefined, "discret"));
const actionsDeConfiance = document.createElement("div");
actionsDeConfiance.className = "lancer";
actionsDeConfiance.append(validerConfiance, annulerConfiance);
formulaireDeConfiance.append(titreDeConfiance, sensDeConfiance, champDuRepository, champDeLaBase, stationsChoisiesDeConfiance, champDesCooks, champDuDossier, capacitiesDeConfiance, confianceRefusee, actionsDeConfiance);
const confianceDite = document.createElement("p");
confianceDite.ariaLive = "polite";
// Déménager sa cuisine (ticket 1095), d'un seul geste : « move the kitchen » ouvre, sous la ligne, le
// choix de la machine où l'emmener — cet ordinateur, sa box, une autre —, et ce que ça coûte, en une
// ligne. Un clic sur une machine la déménage, sans retrait ni rajout. Refusé, la raison se dit en une
// phrase sous la ligne, et la ligne ne change pas : il cuit toujours là où il cuisait.
const ouvrirLeDemenagement = /** @type {HTMLButtonElement} */ (button("move the kitchen", undefined));
ouvrirLeDemenagement.className = "ajout-de-station";
ouvrirLeDemenagement.dataset.geste = "demenager";
// Caché tant qu'aucun projet ouvert ne l'offre : rien ne le montre avant (ticket 4087, la visite n'offre aucun geste).
ouvrirLeDemenagement.hidden = true;
const choiceDuDemenagement = document.createElement("section");
choiceDuDemenagement.className = "demenagement";
choiceDuDemenagement.ariaLabel = "Move the kitchen";
choiceDuDemenagement.hidden = true;
const demenagementDit = document.createElement("p");
demenagementDit.className = "demenagement-dit";
demenagementDit.ariaLive = "polite";
// Une station du compte à qui le chef a choisi le projet alors qu'une autre le servait déjà, et qui ne peut pas en
// rejoindre la cuisine (ticket 1790) : sa phrase, sous la ligne — la ligne ne la compte pas parmi ses stations.
const stationRefusee = document.createElement("div");
stationRefusee.ariaLive = "polite";
stationRefusee.hidden = true;
// Le parcours d'un projet neuf (ticket 1111) : de sa station choisie à son premier ticket, en quatre
// étapes, telles que le suivi les publie — à la place du vide sous la ligne (onboarding/journey.js).
const journeyDuProject = document.createElement("div");
journeyDuProject.className = "parcours-du-projet";
journeyDuProject.ariaLive = "polite";
// Ce qui retient la cuisine du projet (ticket 1119) : l'accès au dépôt refusé, avec son geste, ou un worktree
// impossible à préparer, avec sa raison et l'heure du prochain essai — à la place de « prepares it within a minute ».
const repositoryRetenu = document.createElement("div");
repositoryRetenu.hidden = true;
stationsDuProject.append(lineDesStationsDuProject, ouvrirLeDemenagement, ouvrirLaConfiance, choiceDuDemenagement, formulaireDeConfiance, demenagementDit, stationRefusee, repositoryRetenu, confianceDite, journeyDuProject);

/** @type {Map<number, { terminal: Terminal, xterm: Xterm, ajuste: FitAddon, cadre: HTMLDivElement }>} */
const vues = new Map();
// La page où chaque projet a été laissé : on y revient. Aucune : le rail a le centre.
/** @type {Map<string, string>} */
const laisse = new Map();
// L'onglet que chaque projet montre sous ses pages, Rail ou Stations (ticket 1184) : le dernier que le chef y a ouvert, retenu
// d'une ouverture de l'app à l'autre dans le stockage de la vue. Un projet jamais ouvert s'ouvre sur Rail.
const CLE_DES_ONGLETS = "brigade.onglets-des-projets";
/** @type {Map<string, string> | undefined} */
let ongletsRetenus;
function retenus() {
  if (ongletsRetenus !== undefined) return ongletsRetenus;
  ongletsRetenus = new Map();
  try {
    const lus = JSON.parse(window.localStorage?.getItem(CLE_DES_ONGLETS) ?? "{}");
    for (const [name, id] of Object.entries(lus ?? {})) if ([RAIL, STATIONS, AGENTS, KNOW_HOW, CONVERSATION].includes(id)) ongletsRetenus.set(name, id);
  } catch {
    // Illisible : chaque projet s'ouvre sur Rail, et le prochain choix le réécrit.
  }
  return ongletsRetenus;
}
// La conversation n'est un onglet que sur un écran étroit : retenue, elle s'ouvre sur Rail sur un écran large.
/** @param {Project} project */
const ongletDe = (project) => {
  const retenu = retenus().get(project.nom) ?? RAIL;
  return retenu === CONVERSATION && !etroit() ? RAIL : retenu;
};
/** @param {string} name @param {string} id */
function retenir(name, id) {
  retenus().set(name, id);
  try {
    window.localStorage?.setItem(CLE_DES_ONGLETS, JSON.stringify(Object.fromEntries(retenus())));
  } catch {
    // Sans stockage, l'onglet se retient le temps de la session.
  }
}
// Le shell que chaque projet montre à droite, à la place du second. Aucun : c'est le second.
/** @type {Map<string, number>} */
const aDroite = new Map();
// Les machines que « + shell » propose, tant que le chef n'a pas choisi — pour le projet où il a cliqué.
/** @type {{ projet: string, machines: { id: string, titre: string }[] } | undefined} */
let choiceDeMachine;
// Les shells fermés : ce qu'ils écrivent encore en mourant n'a plus d'onglet.
/** @type {Set<number>} */
const fermes = new Set();
// Aucun : c'est « Tous les projets » qui est affiché — ou l'écran d'ajout.
/** @type {Project | undefined} */
let courant;

// Les explications des mots de la cuisine (ticket 3308, explanations/) : la première fois que le chef rencontre rail, pass,
// cook, second, TODO ou WAITING, une ligne l'explique à côté du mot. Ce qu'il en a vu est gardé par le runtime du projet,
// pour lui, sur tous ses appareils ; lu à chaque ouverture du projet. Ce qui change à l'écran se repose.
const explanations = holdLesExplanations({ service: serviceDesExplanations(brigade), rendre: (project) => rendreLesExplanations(project) });
/** @param {string} project */
function rendreLesExplanations(project) {
  if (courant?.nom !== project) return;
  poserRail(courant);
  poserLExplanationDuSecond();
  poserLesExplanationsDuChef(project);
}
// Sous l'onglet du second, l'explication du mot « second », quand sa colonne est à l'écran, dépliée.
function poserLExplanationDuSecond() {
  const explique = courant !== undefined && courant.refus === undefined && !colonneSecond.hidden && !colonneSecond.hasAttribute("data-replie") && phoneVu === undefined ? explanationDe(courant.nom, "second") : [];
  explanationSecond.hidden = explique.length === 0;
  explanationSecond.replaceChildren(...explique);
}
// L'explication d'un mot à l'écran, si elle s'y montre : marquée vue à ce moment-là.
/** @param {string} project @param {import("./explanations/explanations-box.ts").WordExplique} word @returns {HTMLElement[]} */
function explanationDe(project, word) {
  return explanations.aMontrer(project, word) ? [poserExplanation(document, word, () => explanations.ecarter(project, word))] : [];
}
// Celle d'un mot du rail, seulement quand le rail est à l'écran : posé sous Settings ou une page, il n'est pas rencontré.
/** @param {string} project @param {import("./explanations/explanations-box.ts").WordExplique} word @returns {HTMLElement[]} */
function explanationDuRail(project, word) {
  const visible = actif();
  return visible === PARAMETRES || ONGLETS.some(({ id }) => id === visible) ? [] : explanationDe(project, word);
}
// Sa rangée de Settings, qui les remontre toutes ; cachée tant que le registre n'est pas lu, et sur un pont qui ne le porte pas.
/** @param {string} project */
function poserLesExplanationsDuChef(project) {
  const state = explanations.etat(project);
  explanationsDuChef.hidden = state === undefined || (state.vus === null && state.sans === undefined);
  explanationsDuChef.replaceChildren(...(explanationsDuChef.hidden ? [] : [poserLaRangeeDesExplanations(document, { etat: state, remontrer: () => void explanations.effacer(project) })]));
}
let ajoute = false;
// La dernière demande de lecture : une par écran affiché, et seules ses lectures s'affichent.
let request = 0;
// L'onglet de contenu dont la commande est lue, et sa demande. Indéfini : à relire.
/** @type {string | undefined} */
let suivi = "";
let requestOnglet = 0;
// L'onglet que cette demande lit. Celle de la page des coûts lit la box de chaque projet.
/** @type {string | undefined} */
let ongletRequest;
// Le dernier `station` lu de chaque projet pour la page des coûts — ou ce qui a été obtenu à sa place.
/** @type {Map<string, Read>} */
const coutsLus = new Map();
// Le rail que sa station publie, par projet sans box ni station ici (ticket 1435, `lireLeRailPublie`), et le rang de sa
// dernière lecture. `sansReponse` : un pont qui ne le lit pas, et l'onglet garde sa phrase d'avant (ticket 1405).
/** @type {Map<string, import("./rail-published.js").StateDuRailPublished & { sansReponse?: true }>} */
const railsPublies = new Map();
/** @type {Map<string, number>} */
const lecturesPubliees = new Map();
// Les onglets de contenu, dits par le process principal au démarrage (onglets.ts).
/** @type {readonly import("../onglets.ts").Onglet[]} */
let ONGLETS = [];
// Les couleurs qu'un projet peut prendre, dites de même (couleurs.ts) : un nom, une valeur.
/** @type {readonly { nom: string, valeur: string }[]} */
let PALETTE = [];
// L'onglet de l'écran principal, Paramètres, et les lectures qu'il range, dits de même.
/** @type {readonly import("../onglets.ts").Rubrique[]} */
let RUBRIQUES = [];
// L'onglet qui range ce qui est affiché : une lecture, ou Paramètres lui-même. Le journal n'en a pas.
/** @param {number | string | undefined} id */
const rubriqueDe = (id) => RUBRIQUES.find(({ lectures }) => lectures.includes(/** @type {string} */ (id)));
// Ce qu'engage l'allumage du projet, dit de même (allumage.ts) : la lecture qui le chiffre, et ce qui se pose avant elle.
/** @type {typeof import("../allumage.ts").ALLUMAGE | undefined} */
let ALLUMAGE;
// La confirmation ouverte : celle d'un geste, pour un projet, à un endroit — la même ne s'ouvre
// qu'une fois, sous le bouton cliqué. `rendu` : ce qu'elle dit, ou pourquoi le geste ne s'offre
// pas — absent, la demande est en route. `compte` : ce que la box a compté pour « allumer » —
// absent, en cours ; nul, pas demandé. Indéfinie : aucune n'est ouverte, et rien ne part.
/** @type {{ projet: string, cle: string, rendu?: Confirmation | { refus: string }, compte?: Account | null } | undefined} */
let aConfirmer;
// Les gestes de la cuisine, dits de même (kitchen.ts) : leurs libellés. Arrêter et reprendre sont la ligne de la
// cuisine, dans Settings ; reprendre est aussi sur ce qui dit la cuisine à l'arrêt.
/** @type {readonly { id: string, libelle: string }[]} */
let KITCHEN_ACTIONS = [];
// Les trois gestes de WAITING, dits de même (wait.ts) : « waiting for… » sur une carte de TODO,
// « resume » et « it arrived » sur une carte de WAITING. La vue les nomme, elle ne sait pas ce qu'ils écrivent.
/** @type {readonly { id: string, libelle: string }[]} */
let ACTIONS_D_WAIT = [];
// Le formulaire « waiting for… » ouvert sur une carte, par projet et ticket : ce que le chef y a
// rempli, et pourquoi rien n'est parti quand c'est le cas. Le rail se redessine à chaque lecture :
// le formulaire y revient tel que le chef l'a laissé. Absent : la carte porte son bouton.
/** @type {Map<string, { quoi: string, qui: string, relance: string, refus?: string }>} */
const formulairesDWait = new Map();
// Ce qu'il est advenu de « it arrived, back to the kitchen » sur une carte de WAITING, par projet et ticket :
// en route, posté sur le tableau de la cuisine — son commentaire au survol —, ou pourquoi rien ne l'est. La carte le
// dit sous ses gestes tant qu'elle est dans WAITING.
/** @type {Map<string, { envoi: true } | { fait: string, detail: string } | { refus: string, detail: string }>} */
const arriveesDeCards = new Map();
// Le TODO parked du chef (parked/, ticket 4281) : les items dont le contrôle de park est ouvert, et ce que le chef y a tapé,
// par projet et ticket — gardés d'un rendu à l'autre.
/** @type {Map<string, Set<number>>} */
const parkOuverts = new Map();
// Ce que le chef a déplié en tête du rail (ticket 4354), par projet : le détail d'une carte d'agent, et la liste du TODO
// (« todo ») — gardés d'un rendu à l'autre.
/** @type {Map<string, Set<string>>} */
const deplisDuHaut = new Map();
/** @param {string} project */
const deplisDe = (project) => deplisDuHaut.get(project) ?? deplisDuHaut.set(project, new Set()).get(project) ?? new Set();
/** @type {Map<string, import("./parked/park-control.js").Form>} */
const parkSaisies = new Map();
// Les gestes directs, et les confirmés, dits de même (actions.ts) : le clic d'un direct fait partir
// sa commande dans le second — ou dit pourquoi elle ne part pas ; celui d'un confirmé ouvre sa
// confirmation, et rien ne part avant son « oui ». La vue ne le décide pas.
/** @type {readonly string[]} */
let DIRECTS = [];
/** @type {readonly string[]} */
let CONFIRMES = [];
// La réponse du chef en route sur une carte de TODO (card-todo.js), par projet et ticket
// (`<projet>#<numéro>`), avec la question à laquelle elle répond. Absente : la carte dit ce que le tableau
// de la cuisine montre de sa dernière réponse. Postée, la carte reste, envoyée et en attente de la cuisine,
// tant que les faits lus portent cette question — nulle sur une carte à un seul geste ; la lecture qui ne la
// porte plus l'oublie. Ce n'est qu'un relais : ce que la carte dit après un redémarrage vient du tableau (ticket 1841).
/** @type {Map<string, { question: string | null, etat: import("./card-todo.js").State }>} */
const answersAuxCards = new Map();
// Les cartes « Validate its screen » (validation-design/, ticket 3185) : le geste en route d'ici, et le commentaire tapé,
// par `<projet>#<numéro>` ; et, par projet, les numéros des cartes que le chef a validées ou renvoyées — elles quittent TODO
// tout de suite, et sont oubliées dès qu'une lecture ne les porte plus.
/** @type {Map<string, import("./validation-design/validation-design.js").State>} */
const validations = new Map();
/** @type {Map<string, string>} */
const commentairesDeValidation = new Map();
// Les cartes « review before merge » (card-sensitive/, ticket 3224) : la même chose — le geste en route et la note tapée ;
// mergées ou renvoyées d'ici, elles quittent TODO avec les validées (`validees`).
/** @type {Map<string, import("./card-sensitive/card-sensitive.js").State>} */
const revues = new Map();
/** @type {Map<string, string>} */
const notesDeRevue = new Map();
// « undo » sur la carte d'un ticket servi (undo/, ticket 3274) : le geste en route d'ici, ou ce qu'il en est advenu — la
// ligne reste sur la carte tant qu'elle est dans Served.
/** @type {Map<string, import("./undo/undo.js").State>} */
const annulations = new Map();
/** @type {Map<string, Set<number>>} */
const validees = new Map();
/** @param {string} project */
const valideesDe = (project) => validees.get(project) ?? new Set();
// Le détail en grand d'une carte « Validate its screen » (validation-design/detail-de-validation.js, ticket 3212), ouvert
// d'un clic sur la carte : son projet, son ticket, et ce qu'il montre — côte à côte ou l'une sur l'autre, la capture
// ouverte seule, le zoom de chaque écran —, gardé d'une pose à l'autre.
/** @type {{ projet: string, ticket: number, affichage: import("./validation-design/detail-de-validation.js").Display } | undefined} */
let detailOuvert;
// Ce que le chef a tapé dans le champ d'une carte de TODO, par projet et ticket : un rail redessiné le lui rend. Une carte
// partie de TODO ne l'emporte pas (ticket 2151) : un brouillon non vide y reste, sur une carte résolue, jusqu'à ce que le
// chef l'écarte — avec ce que sa carte demandait (`questionsDesBrouillons`).
/** @type {Map<string, string>} */
const brouillonsDeCards = new Map();
/** @type {Map<string, string | null>} */
const questionsDesBrouillons = new Map();
// La carte de TODO où le chef répond (ticket 2151) : tant que le clavier est dans sa carte — son champ, ses choix —, aucune
// lecture ne redessine le rail du projet. La carte n'est ni retirée, ni reposée, ni déplacée, et ce qu'il tape reste sous
// ses doigts. Ce qui arrive entre-temps est tenu (`gele`) et posé quand le clavier quitte la carte ; une carte que la
// lecture ne porte plus le dit à côté de son texte. `bon` : la carte posée ; `carte` : sa partie de TODO.
/** @type {{ projet: string, ticket: number, question: string | null | undefined, bon: HTMLElement, carte: HTMLElement, gele: boolean } | undefined} */
let cardEnMain;
// Pourquoi le dernier bouton cliqué n'a rien fait : dit sous les onglets de pages, jusqu'au prochain geste —
// ou, quand c'est le second qui n'a rien reçu, à droite, sous les onglets des terminaux.
let nonEcrit = "";
let nonEcritSecond = "";
// Un geste confirmé ou direct qui n'a rien envoyé au second : la phrase qui le dit au centre, et de quoi le rejouer
// avec le « oui » déjà donné.
/** @type {{ texte: string, rejouer: () => void } | undefined} */
let actionRate;
// Le terminal qui prend le clavier au prochain affichage : celui qu'un geste du chef vient de
// montrer ou d'écrire. Sans geste, personne ne le prend — le second ne perd pas sa frappe.
/** @type {number | undefined} */
let aFocaliser;
// La bannière d'arrêt, dite de même (facts.ts) : ce qu'elle dit, et le bouton qui écrit la relance.
/** @type {typeof import("../facts.ts").BANNIERE | undefined} */
let BANNIERE;
// Le calibrage que la station accepte, pour le parcours « Add a project » : donné au démarrage.
/** @type {{ modeles: readonly string[], efforts: readonly string[] }} */
let PROJECT_CALIBRATION = { modeles: [], efforts: [] };
// Ce que l'accueil dit en dernier (home.ts) : une ligne par projet, une par station, la santé. Indéfini : pas encore reçu.
/** @type {import("../home.ts").Home | undefined} */
let homeVu;
// Le téléphone appairé (l'app Android) : sa station, et ce que la dernière lecture de la liste de ses projets en a dit
// (le ticket 1414), relu par `surTelephone`. Indéfini sur le desktop.
/** @type {import("./pont.d.ts").Phone | undefined} */
let phoneVu;
// La station dont la page est ouverte, par son gist. Aucune : c'est l'accueil — ou un projet.
/** @type {string | undefined} */
let stationOuverte;
// La page de l'app ouverte à la place de l'accueil : celle des coûts de tous les projets (ticket 1022), ou celle de
// leurs résumés hebdomadaires (ticket 3263). Aucune : l'accueil — ou un projet, une station.
/** @type {typeof COUTS | typeof RESUMES | undefined} */
let pageDeLApp;
// Ce que `faits` a rendu en dernier pour chaque projet, et la demande à laquelle il répond :
// une par barre posée. Sans entrée, le projet n'a pas encore été lu.
/** @type {Map<string, Dessinable>} */
const tenus = new Map();
// Le dépôt d'un projet où le compte GitHub de cet ordinateur ne peut pas écrire (ticket 3163), d'après sa dernière
// lecture : le projet s'ouvre en lecture seule — tout s'y voit, aucun geste n'y est offert, une ligne en tête le dit.
// L'accès gagné, la lecture suivante ne le porte plus et la vue redevient ordinaire, sans rouvrir le projet.
/** @param {{ nom: string }} project @returns {string | undefined} */
function readOnlyDe(project) {
  const tenu = tenus.get(project.nom);
  return tenu !== undefined && "tableau" in tenu ? tenu.tableau.lectureSeule?.depot : undefined;
}
// L'app n'a pas joint GitHub (tableau/read.ts, `horsLigne`, ticket 1818) : depuis quand, d'après la première lecture ratée
// de la série. Ce n'est pas une panne : le rail garde sa dernière lecture, atténué, et un seul signe le dit. Il part à la
// première lecture qui joint GitHub.
/** @type {Map<string, string>} */
const outsideLines = new Map();
// Le dernier rail lu, gardé quand les lectures qui l'ont suivi ont raté en ligne (ticket 2151) : depuis quand, d'après la
// première de la série, et la raison de la dernière. Il part à la première lecture qui dessine le rail.
/** @type {Map<string, { depuis: string, raison: string }>} */
const perimes = new Map();
// Ce qu'une lecture ratée dit d'elle-même, en une ligne.
/** @param {Dessinable} recue */
function raisonDeLFailure(recue) {
  if ("tableau" in recue) return "";
  const dit = "informe" in recue ? recue.informe : recue.erreur;
  return dit.trim().split("\n")[0] ?? "";
}
const heureCourte = (/** @type {number | string} */ instant) => new Date(instant).toLocaleTimeString("en-US", { hour: "numeric", minute: "2-digit" });
let factsRequest = 0;
// Les projets dont une lecture des faits est partie de la vue — la première, ou une relecture — et n'a pas encore de
// réponse : le haut de leur rail bat doucement, sans phrase, jusqu'à ce que `surFaits` la rende (ticket 1818).
/** @type {Set<string>} */
const enRead = new Set();
// Une lecture des faits demandée au process principal — `relire` : celle de la box, tout de suite ; sinon la première,
// pour une barre posée. Tous les projets sont relus : chacun est en lecture jusqu'à sa réponse.
function lireLesFacts(relire = true) {
  for (const { nom: name } of configuration.projets) enRead.add(name);
  if (relire) brigade.relireBox(factsRequest);
  else brigade.faits(++factsRequest);
  if (courant !== undefined && !rail.hidden) marquerRead(courant);
}
// Le haut du rail du projet affiché bat tant que sa lecture est en cours : rien d'autre n'est reposé.
/** @param {Project} project */
function marquerRead(project) {
  if (enRead.has(project.nom) && seLit(project) && project.sansStation !== true) rail.dataset.lecture = "";
  else delete rail.dataset.lecture;
}
// Les réglages de chaque projet (ticket 1309) : leur dernière lecture, et l'état de chacun — ce que le chef écrit sans
// l'avoir changé, la proposition qui attend sa réponse, ce que la dernière a rendu. Le plafond, sur Cooks, est le même réglage.
/** @type {Map<string, import("../settings-du-project.ts").ReadDesSettings>} */
const settingsLus = new Map();
/** @type {Map<string, Map<import("../settings-du-project.ts").Cle, import("./project/settings.js").State>>} */
const statesDesSettings = new Map();
// La dernière bande d'alertes de chaque projet, telle que le process principal l'a dite (alerts.ts).
/** @type {Map<string, Alert[]>} */
const bandes = new Map();
// La ligne du disjoncteur ouvert d'un projet, dans sa dernière bande : celle que `alerts.ts` marque `disjoncteur` (ticket 2140).
/** @param {string} name */
const alertDuBreaker = (name) => (bandes.get(name) ?? []).find(({ disjoncteur: breaker }) => breaker === true);
/** @type {Map<string, import("./page-project/repository-non-prepare.js").State>} */
const depots = new Map();
// Ce que chaque bande dit de son projet sur sa case de la barre (alerts.ts, `signalDe`), et les
// signaux posés : un seul par case.
/** @type {Map<string, {etat: string, dit: string} | undefined>} */
const signaux = new Map();
// L'état de l'interrupteur de chaque projet — le manager le suit, et sa ligne le dit —, tel que sa
// dernière bande l'a dit (alerts.ts, `EtatDuManager`) : l'interrupteur, en tête de l'espace, et la
// tête du rail le disent. Sans entrée, il n'est pas encore lu.
/** @type {Map<string, import("../alerts.ts").StateDuManager | undefined>} */
const statesDuManager = new Map();
// Les lignes de la bande dont le « detail » est déplié, par projet et par endroit (`endroitDeLAlerte`) :
// une relecture de la bande ne le replie pas sous les yeux du chef.
/** @type {Set<string>} */
const detailsDeplies = new Set();
/** @type {Map<string, HTMLElement>} */
const signalees = new Map();
// Le projet dont le chef a cliqué la notification d'urgence (notification.ts) : sa ligne d'urgence
// reste marquée choisie tant qu'il reste sur lui. `gesteDeLUrgence` : le bouton de cette ligne, tel
// que la bande l'a posé en dernier — c'est lui qui prend le clavier au clic.
let urgenceChoisie = "";
/** @type {HTMLElement | undefined} */
let actionDeLUrgence;
// Dans la barre, la pastille de chaque projet qui a une box.
/** @type {Map<string, HTMLElement>} */
const pastilles = new Map();
// Ce que fait chaque cook de chaque projet, tel que la dernière lecture de son tableau le publie (activity-du-cook.js) :
// la fiche d'un ticket en pose son cook.
/** @type {Map<string, import("./activity-du-cook.js").Publiees>} */
const activitiesPubliees = new Map();
// Les cartes de Livré dont le chef a déplié les remarques, par projet et ticket : le rail se
// redessine à chaque lecture, et ce qu'il lit ne se replie pas sous ses yeux.
/** @type {Set<string>} */
const remarquesDepliees = new Set();
// Ce qui est avant le rail, par projet, tel que le process principal l'a rangé (amont.ts) : la dernière lecture que le
// tableau de la cuisine en donne, pour le projet affiché.
/** @type {Map<string, import("../amont.ts").Vu>} */
const amonts = new Map();
// La fiche ouverte par-dessus le rail : son projet, la carte cliquée — telle que la dernière lecture
// la donne —, et son bon, qui reprend le clavier quand elle se ferme. Aucune : le rail est seul.
/** @type {{ projet: Project, carte: import("../facts.ts").Card, retour: HTMLElement } | undefined} */
let ouverte;
// La question que pose chaque ticket de T'attend dont la fiche a été ouverte, telle que son issue
// l'écrit (question.ts), par projet et ticket : relue à chaque ouverture. `lue` : absente, la lecture
// est en route. `envoi` : une réponse part — rien d'autre ne part avant qu'elle soit revenue.
// `rendue` : ce qu'il est advenu de la dernière. `quand` : l'heure, au poste, où elle a été posée.
/** @type {Map<string, { lue?: import("../question.ts").Lue, envoi?: boolean, rendue?: import("../question.ts").Rendue, quand?: number }>} */
const questions = new Map();
// Une question que la vue sait répondue — postée d'ici, ou répondue sur l'issue — sur une carte que
// le rail remet dans TODO : ce qu'elle en sait date. Relue, mais pas plus d'une fois par minute.
const RELIRE_QUESTION_MS = 60_000;
/** @param {{ lue?: import("../question.ts").Lue, envoi?: boolean, rendue?: import("../question.ts").Rendue, quand?: number } | undefined} state */
function perimee(state) {
  if (state === undefined || state.envoi === true || state.quand === undefined) return false;
  const repondue = state.rendue?.poste === true || (state.lue !== undefined && "question" in state.lue && state.lue.question.repondue !== undefined);
  return repondue && Date.now() - state.quand > RELIRE_QUESTION_MS;
}
// Le titre des tickets que la box ne nomme pas, lu par le process principal (question.ts, `titreDe`),
// par `<projet>#<ticket>` : `{ titre }`, ou `{ sans }` quand l'issue n'a pas pu être lue.
/** @type {Map<string, { titre: string } | { sans: string } | undefined>} */
const titres = new Map();
// Les captures des tickets d'interface, lues par le process principal (captures.ts, `lireCapture`), par
// `<projet>#<ticket>:<écran>:<moment>@<commit>` : `{ image }`, en `data:`, ou `{ sans }` quand elle n'a
// pas pu être lue. Présente sans valeur, la lecture est en route.
/** @type {Map<string, import("../captures.ts").Image | undefined>} */
const capturesLues = new Map();
// L'histoire et le coût de chaque ticket dont la fiche a été ouverte (histoire.ts), par
// `<projet>#<ticket>` : relus à chaque ouverture. Absente de la table, la lecture est en route.
/** @type {Map<string, import("../histoire.ts").Histoire>} */
const histoires = new Map();
// L'issue de chaque ticket dont la fiche a été ouverte et sa discussion (discussion.ts), par
// `<projet>#<ticket>` : relues à chaque ouverture, et après chaque commentaire. Absente de la
// table, la lecture est en route.
/** @type {Map<string, import("../discussion.ts").Discussion>} */
const discussions = new Map();
// Le diagramme du corps de chaque issue lue, par `<projet>#<ticket>` (vue/card-diagram/, ticket 3773) : rendu une fois par corps.
/** @type {Map<string, import("./card-diagram/card-diagram.js").Tenu>} */
const diagrammes = new Map();
// Le commentaire que le chef écrit sur l'issue, par `<projet>#<ticket>` : une fiche reposée, ou
// un envoi qui échoue, ne le perd pas. Il ne s'efface qu'une fois posté.
/** @type {Map<string, string>} */
const commentaires = new Map();
// Ce qu'il en est du dernier commentaire envoyé, par `<projet>#<ticket>` : en route, ou ce qui en est advenu.
/** @type {Map<string, { envoi: true } | { rendu: import("../discussion.ts").Commente }>} */
const envoisDeComment = new Map();
// Ce qu'il en est de la dernière demande au second faite depuis le champ de contexte de la fiche, ou
// depuis la carte de TODO (card-todo.js), par `<projet>#<ticket>` : en route, partie (la note du
// terminal), ou ce qui l'a empêchée. La fiche et la carte la disent toutes deux.
/** @type {Map<string, { envoi: true } | { parti: string } | { refus: string }>} */
const demandesAuSecond = new Map();
// Le geste en route (`envoi`) ou refusé (`refus`) d'une carte mise de côté (ticket 3147), par `projet#ticket`.
/** @type {Map<string, { envoi: "relancer" | "clore" } | { refus: string }>} */
const refusalDeCards = new Map();
// Ce que le process principal a lu des essais de chaque projet (trial.ts, ticket 3215) : sa déclaration `.brigade/try.json` et ses essais par ticket.
/** @type {Map<string, import("../trial.ts").VuDesEssais>} */
const essaisDeProjects = new Map();
/** @param {Project} project */
async function lireLesEssais(project) {
  const vu = await brigade.essais?.(project.nom);
  if (vu === undefined) return;
  essaisDeProjects.set(project.nom, vu);
  if (courant?.nom === project.nom && !rail.hidden && tenus.has(project.nom)) poserRail(project);
}
// Les gestes qu'un agent retient pour l'OK du chef, par projet (held/, ticket 4273) : relus à chaque lecture du rail du
// projet affiché. Absents : pas encore lus, ou pas lisibles d'ici — le projet ne cuit pas sur cet ordinateur.
/** @type {Map<string, import("../held/contract.ts").ReadDesRetenus | undefined>} */
const retenusDesProjects = new Map();
/** @param {Project} project @param {import("../held/contract.ts").ReadDesRetenus | undefined} lus */
function poserLesRetenusLus(project, lus) {
  retenusDesProjects.set(project.nom, lus);
  if (courant?.nom === project.nom && !rail.hidden && tenus.has(project.nom)) poserRail(project);
}
/** @param {Project} project */
async function lireLesRetenus(project) {
  const lus = await brigade.gestesRetenus?.(project.nom);
  if (lus !== undefined) poserLesRetenusLus(project, lus);
}
// L'OK du chef à un geste retenu : fait, sa carte part et ne revient pas avant la lecture suivante ; refusé, sa carte le dit.
/** @param {Project} project @param {string} id */
async function approuverLeActionRetenu(project, id) {
  const rendu = await brigade.approuverGeste?.(project.nom, id);
  if (rendu === undefined || "refus" in rendu) throw new Error(rendu?.refus ?? "nothing was approved: the app did not reach this project's station");
  poserLesRetenusLus(project, sansLApprouve(retenusDesProjects.get(project.nom), id));
}
// Ce que la fiche dit de la vie du ticket vivant (histoire.ts, `situation`), par `<projet>#<ticket>`.
/** @type {Map<string, import("../histoire.ts").Situation>} */
const situations = new Map();
// Les gestes de la fiche de chaque ticket ouvert, à cet instant (card-actions.ts), par
// `<projet>#<ticket>` : relus à chaque ouverture, et quand la lecture change ce qui les décide.
// Absents de la table, la lecture est en route ; `{ sans }`, ils n'ont pas pu être lus.
/** @type {Map<string, import("../card-actions.ts").Propose[] | { sans: string }>} */
const cardsActions = new Map();
// Ce qu'il est advenu du dernier geste de la fiche qui n'est pas parti, par `<projet>#<ticket>` : en une ligne, et ce
// que la station ou le pont en a dit, au survol.
/** @type {Map<string, { dit: string, detail: string }>} */
const cardRefusals = new Map();
// Ce qu'il est advenu du dernier geste de la fiche qui est parti, par `<projet>#<ticket>` (ticket 1164) : en route —
// ses boutons attendent la réponse, et rien ne part deux fois —, fait par la station, sans terminal où le lire — ce
// que le pont du téléphone rend —, ou écrit dans le second, que l'écran étroit ne montre pas à côté de la fiche.
/** @type {Map<string, { envoi: string } | { fait: string, detail: string } | { second: true }>} */
const issuesDeCards = new Map();
// Un geste qui n'est pas parti — le pont a levé, ou ne porte pas l'action (le téléphone, tant que son pont ne la
// prend pas) : une ligne, et pourquoi au survol.
const SANS_ENVOI = "nothing was sent — nothing was changed";
const SANS_PONT = "this app does not carry this action to the station yet";
// Le geste de la fiche qui coûte et que le chef a cliqué, en attente de sa confirmation, par
// `<projet>#<ticket>` : rien ne part avant son « oui ».
/** @type {Map<string, import("../card-actions.ts").CardId>} */
const cardConfirmations = new Map();
// La priorité que le chef a choisie, pas encore envoyée, par `<projet>#<ticket>` : une fiche
// reposée ne la perd pas.
/** @type {Map<string, string>} */
const prioritesChoisies = new Map();
// La phrase que le chef écrit en réponse, par projet et ticket : une fiche reposée ne la perd pas.
/** @type {Map<string, string>} */
const brouillons = new Map();
// « Remove from the app » : le projet dont le retrait attend son « yes », et pourquoi il n'a pas été retiré — chacun
// pour son projet.
let retraitDeLApp = "";
let nonRetire = { projet: "", refus: "" };
// Pourquoi la dernière couleur choisie n'a pas été écrite, et pour quel projet — rien, si elle l'a été.
let couleurRefusee = { projet: "", refus: "" };
// Pourquoi le dernier sigle écrit ne l'a pas été, et pour quel projet — rien, s'il l'a été.
let sigleRefuse = { projet: "", refus: "" };
// Le dernier refus du réglage de la barre des menus, sous sa ligne.
let barDeMenusRefusee = "";
// Ce qui empêche l'icône de fond de se montrer (main.ts, `iconeDeFond`), relu toutes les minutes ; vide, rien ne la gêne.
let iconeDeBackgroundRefusee = "";
// Ce que la dernière lecture des clones donne à poser (retard.ts). Indéfini : pas encore lus.
/** @type {VuDuCode | undefined} */
let codeVu;
// Pourquoi la dernière mise à jour demandée n'a pas été écrite, ou pas faite : dit sous les clones, jusqu'à la prochaine.
let nonMisADay = "";
// L'app se met à jour : son bouton attend qu'elle se relance.
let enPassage = false;
// La mise à jour de l'app installée, telle que la dernière lecture la dit (mise-a-jour/etat.ts). Indéfini : pas encore reçue.
/** @type {import("../update/state.ts").StateDeUpdate | undefined} */
let updateVue;
// Ce que la dernière lecture des stations donne à poser (stations/stations.ts). Indéfini : pas encore lues.
/** @type {import("../stations/stations.ts").VuDesStations | undefined} */
let stationsVues;
// Les projets des stations (projects/projects.ts). Indéfini : pas encore lus.
/** @type {import("../projects/projects.ts").VuDesProjects | undefined} */
let projectsVus;
// Le choix des stations auxquelles confier la cuisine du projet affiché, tant qu'il est ouvert : le
// même que le parcours, pour ce projet-là — une relecture des stations ne perd pas ce qui est coché.
// `choisies` : la seule machine choisie (ticket 3187) ;
// `cooksTouches` : le chef a changé la valeur proposée — elle ne suit plus la machine ni les projets relus.
// `defauts` : ce que cet ordinateur propose pour une station de plus (ticket 1307), lu à l'ouverture ;
// `capacites` : par machine, les capacités cochées — celles qu'on y détecte, tant que le chef n'y a pas touché.
/** @type {{ projet: string, ouvertLe: string, depots: import("../projects/github.ts").RepositoryDuChef[], choisies: Set<string>, touchee: boolean, cooksTouches: boolean, defauts?: import("../projects/projects.ts").DefautsDeLaMachine, capacites: Map<string, Set<string>> } | undefined} */
let confiance;
// Ce que le dernier geste de confiance a rendu, et pour quel projet : dit sous la ligne de ses stations.
// `a` : quand (`Date.now()`). Ce qu'il annonce « within a minute » ne se dit plus passé la minute, ni
// une fois le parcours du projet publié : c'est lui qui dit où il en est (ticket 1111).
let confianceDitePour = { projet: "", dit: "", a: 0 };
// Le parcours prêt d'un projet (ticket 1111) : celui dont la page le montre, et ceux où le chef l'a
// écarté ou déjà vu — il ne revient pas à la visite suivante.
/** @type {string | undefined} */
let pretMontre;
/** @type {Set<string>} */
const journeyRanges = new Set();
// Le déménagement dont le choix est ouvert — pour quel projet —, s'il part, et vers quelle station (son gist).
/** @type {{ projet: string, part: boolean, vers?: string } | undefined} */
let demenagement;
// Ce que le dernier déménagement a rendu, et pour quel projet : dit sous la ligne de ses stations —
// refusé, sa raison, et son détail au survol.
let demenagementDitPour = { projet: "", dit: "", refus: false, detail: "" };
// La peau du terminal vient des jetons, comme le reste (tokens.css) : ni couleur ni police ne s'écrit ici.
/** @param {string} name */
const jeton = (name) => getComputedStyle(document.documentElement).getPropertyValue(name).trim();

/**
 * Les flèches et ⌫ modifiées : xterm les envoie en `CSI 1;<mod>` ou en `DEL` nu, que le shell et
 * `claude` écrivent au lieu d'agir. Elles partent comme les lignes de commande les lisent : mot
 * (`ESC b`/`ESC f`), début et fin de ligne (`^A`/`^E`), effacement d'un mot (`ESC DEL`) ou jusqu'au
 * début de ligne (`^U`). Shift seul n'a pas de sélection à étendre : la flèche part nue.
 * @param {{ key: string; shiftKey: boolean; altKey?: boolean; ctrlKey?: boolean; metaKey?: boolean }} touche
 * @returns {string | undefined} ce qui est écrit, ou rien quand la touche reste à xterm
 */
function deplacer({ key, shiftKey, altKey = false, ctrlKey = false, metaKey = false }) {
  if (key === "Backspace") {
    if (metaKey) return "\x15";
    if (altKey) return "\x1b\x7f";
    return ctrlKey ? "\x17" : undefined;
  }
  const sens = { ArrowLeft: "D", ArrowRight: "C", ArrowUp: "A", ArrowDown: "B" }[key];
  if (sens === undefined || !(shiftKey || altKey || ctrlKey || metaKey)) return undefined;
  if (key === "ArrowLeft" || key === "ArrowRight") {
    const gauche = key === "ArrowLeft";
    if (metaKey) return gauche ? "\x01" : "\x05";
    if (altKey || ctrlKey) return gauche ? "\x1bb" : "\x1bf";
  }
  return `\x1b[${sens}`;
}

// Cet ordinateur, tel que le process principal le dit au démarrage : son nom à l'écran, et s'il est un Mac.
let WORKSTATION = { nom: CET_ORDINATEUR, mac: true };

/**
 * Copier et coller dans un terminal, hors d'un Mac. Sur un Mac, Cmd+C et Cmd+V passent par le menu
 * Édition, et Ctrl+C reste au shell. Ailleurs, Ctrl est la touche des deux : comme le Terminal de
 * Windows, Ctrl+Shift+C copie, Ctrl+C copie quand du texte est sélectionné — sans sélection, il
 * interrompt —, et Ctrl+V comme Ctrl+Shift+V collent.
 * @param {{ key: string; shiftKey: boolean; altKey?: boolean; ctrlKey?: boolean; metaKey?: boolean }} touche
 * @param {{ mac: boolean; selection: boolean }} contexte
 * @returns {"copier" | "coller" | undefined} le geste, ou rien quand la touche reste à xterm
 */
function pressePapiers({ key, shiftKey, altKey = false, ctrlKey = false, metaKey = false }, { mac, selection }) {
  if (mac || !ctrlKey || altKey || metaKey) return undefined;
  const lettre = key.toLowerCase();
  if (lettre === "c" && (shiftKey || selection)) return "copier";
  if (lettre === "v") return "coller";
  return undefined;
}

/** @param {number} id */
function vue(id) {
  let tenue = vues.get(id);
  if (tenue === undefined) {
    const xterm = new Xterm({ fontFamily: jeton("--police-mono"), fontSize: 13, theme: { background: jeton("--terminal"), foreground: jeton("--texte-terminal"), cursor: jeton("--texte") } });
    const ajuste = new FitAddon();
    const cadre = document.createElement("div");
    cadre.hidden = true;
    fil.append(cadre);
    xterm.loadAddon(ajuste);
    xterm.open(cadre);
    xterm.onData((donnees) => {
      brigade.ecrire(id, donnees);
      // Une réponse tapée dans le terminal du second répond aussi à ses choix, ou au geste qu'il nomme : leurs boutons
      // partent (tickets 1520 et 1521).
      const { terminal } = vue(id);
      if (terminal.genre === "second" && answerTapee(donnees)) repondueAuClavier(terminal.projet);
    });
    // Shift+Entrée : xterm l'envoie comme Entrée (`\r`) et le shell comme `claude` l'exécutent ou
    // l'envoient. Un retour à la ligne, lui, ne part pas : `ESC` + `\r` pour `claude` (son Alt+Entrée),
    // un saut de ligne cité (`^V` `^J`) pour le shell.
    xterm.attachCustomKeyEventHandler((touche) => {
      // Copier : la sélection va au presse-papiers. Coller : la touche est laissée au navigateur, qui
      // colle dans le terminal comme le menu le ferait.
      const gesture = pressePapiers(touche, { mac: WORKSTATION.mac, selection: xterm.hasSelection() });
      if (gesture === "copier" && touche.type === "keydown" && xterm.hasSelection()) void navigator.clipboard?.writeText(xterm.getSelection());
      if (gesture !== undefined) return false;
      const deplacement = deplacer(touche);
      if (deplacement !== undefined) {
        if (touche.type === "keydown") brigade.ecrire(id, deplacement);
        return false;
      }
      if (touche.key !== "Enter" || !touche.shiftKey) return true;
      if (touche.type === "keydown") brigade.ecrire(id, vue(id).terminal.genre === "second" ? "\x1b\r" : "\x16\n");
      return false;
    });
    xterm.onResize(({ cols, rows }) => brigade.redimensionner(id, cols, rows));
    // Le titre que `claude` donne au terminal du second dit s'il tourne ou attend le chef : la mise en place le dit (ticket 3166).
    xterm.onTitleChange((titre) => {
      const { terminal } = vue(id);
      if (terminal.genre !== "second") return;
      titresDesSeconds.set(terminal.projet, titre);
      if (courant?.nom === terminal.projet) poserLeProjectAPreparer();
    });
    /** @type {Terminal} */
    const terminal = { id, projet: "", genre: "shell", titre: "", note: "", arrete: false };
    tenue = { terminal, xterm, ajuste, cadre };
    vues.set(id, tenue);
  }
  return tenue;
}

const duCourant = () => [...vues.values()].filter(({ terminal }) => terminal.projet === courant?.nom);
const actif = () => (courant === undefined ? undefined : laisse.get(courant.nom));
// La lecture suivie : celle de la page ouverte par-dessus — Settings ne lit rien ; sans page, aucune.
const lue = () => {
  const ouverte = actif();
  return ouverte === PARAMETRES ? undefined : ouverte;
};
// Settings est ouvert : il ne lit rien, et n'a ni sortie ni heure à poser.
const settingsMontres = () => courant !== undefined && actif() === PARAMETRES;
// L'onglet de la conversation est montré (écran étroit) : le second prend la place du centre. Une page ouverte
// par-dessus — Settings, le journal — le couvre, comme elle couvre Rail.
const conversationMontree = () => courant !== undefined && actif() === undefined && ongletDe(courant) === CONVERSATION;
const secondDuCourant = () => duCourant().find(({ terminal }) => terminal.genre === "second");
// Le terminal montré à droite : le shell que le chef y a laissé, sinon le second.
const montreADroite = () => {
  const shell = courant === undefined ? undefined : aDroite.get(courant.nom);
  return (shell === undefined ? undefined : vues.get(shell)) ?? secondDuCourant();
};

function show() {
  poserLAbsence();
  const visible = actif();
  const relaye = ONGLETS.find(({ id }) => id === visible);
  const droite = montreADroite();
  // Le second et les shells, à droite : chaque cadre y est posé une fois, et y reste. Un seul est
  // montré — celui que le chef a choisi ; caché, aucun ne perd ce qu'il avait reçu.
  for (const { terminal, cadre } of vues.values()) cadre.hidden = terminal.id !== droite?.terminal.id;

  const ouvrable = courant !== undefined && courant.refus === undefined;
  const terminaux = duCourant().map(({ terminal }) => terminal);
  // En haut, l'onglet de pages, Paramètres. Les terminaux n'en sont pas : ils sont à droite.
  space.textContent = courant?.nom ?? "";
  // Rail, Stations, Know-how et Settings, à côté du nom (ticket 1184, 2921, 4241) : celui qui est montré est marqué — aucun quand une page le couvre.
  const ouvert = courant;
  ongletsDuProject.hidden = ouvert === undefined;
  // La station du projet et son état, à côté de l'onglet Stations : c'est là qu'on en ajoute une.
  const station = ouvert === undefined ? undefined : etiquetteDeStation(ouvert);
  etiquetteDeLaStation.hidden = station === undefined;
  etiquetteDeLaStation.textContent = station?.dit ?? "";
  etiquetteDeLaStation.title = station?.survol ?? "";
  ongletsDuProject.replaceChildren(
    ...(ouvert === undefined
      ? []
      : [
          ...MENU.map(({ id, titre }) => {
            const cree = cliquable(titre, () => choisirOnglet(id));
            cree.role = "tab";
            cree.ariaSelected = String(visible === undefined && ongletDe(ouvert) === id);
            return cree;
          }),
          ...RUBRIQUES.map(({ titre, id }) => {
            const cree = cliquable(titre, () => activerRubrique(id));
            cree.role = "tab";
            cree.ariaSelected = String(rubriqueDe(visible)?.id === id);
            return cree;
          }),
          // Sur un écran étroit, la conversation avec le second est un cinquième onglet, après Settings.
          ...(etroit() && phoneVu === undefined
            ? [CONVERSATION_ONGLET].map(({ id, titre }) => {
                const cree = cliquable(titre, () => choisirOnglet(id));
                cree.role = "tab";
                cree.ariaSelected = String(visible === undefined && ongletDe(ouvert) === id);
                return cree;
              })
            : []),
        ]),
  );
  // À droite, au même niveau : le second, ses shells, et de quoi en ouvrir un. Le second a toujours son onglet.
  const second = secondDuCourant()?.terminal;
  /** @param {string} titre @param {number | undefined} id */
  const terminal = (titre, id) => {
    const cree = cliquable(titre, () => showADroite(id));
    cree.role = "tab";
    cree.ariaSelected = String(courant !== undefined && (id === undefined ? droite === undefined || droite.terminal.genre === "second" : id === droite?.terminal.id));
    return cree;
  };
  ongletsTerminaux.replaceChildren(
    ...(courant === undefined
      ? []
      : [
          terminal(second?.titre ?? "Second", undefined),
          ...terminaux.filter(({ genre }) => genre !== "second").map(({ titre, id }) => terminal(titre, id)),
          ...(ouvrable ? [cliquable("+ shell", ouvrirShell)] : []),
        ]),
  );
  // Le shell montré se ferme pour de bon ; le second, jamais.
  // Le bandeau du shell montré : où l'on est, avec quel compte, dans la couleur du projet.
  const dit = droite?.terminal.bandeau;
  banner.hidden = dit === undefined;
  banner.textContent = dit ?? "";
  const teinte = courant?.couleurs?.onglet ?? courant?.couleurs?.accent;
  if (teinte === undefined) banner.style.removeProperty("background");
  else banner.style.setProperty("background", teinte);
  fermerShell.hidden = droite === undefined || droite.terminal.genre !== "shell";
  fermerShell.textContent = fermerShell.hidden ? "" : `close ${droite?.terminal.titre}`;
  const choice = ouvrable && choiceDeMachine?.projet === courant?.nom ? choiceDeMachine : undefined;
  listeMachines.hidden = choice === undefined;
  listeMachines.replaceChildren(
    ...(choice === undefined
      ? []
      : [bloc("span", "open a shell on"), ...choice.machines.map(({ id, titre }) => button(titre, () => void ouvrirSur(choice.projet, id))), button(ANNULER, () => void ((choiceDeMachine = undefined), show()), "discret")]),
  );

  // L'explication d'un onglet relayé n'est pas écrite à plat : une icône d'aide la porte.
  // Settings n'en a pas : il n'a que des réglages.
  const suivie = settingsMontres() ? undefined : ONGLETS.find(({ id }) => id === lue());
  const explanation =
    suivie === undefined || courant === undefined
      ? ""
      : `the output of ${gesture(courant, suivie.commande)}, as the station returns it${suivie.precision === undefined ? "" : ` (${suivie.precision})`} — re-read on its own every thirty seconds, while this tab is shown`;
  note.replaceChildren(
    ...(actionRate !== undefined
      ? poserActionRate(actionRate)
      : nonEcrit !== "" ? [nonEcrit] : explanation === "" ? [] : [survol(document, explanation)]),
  );
  note.hidden = (note.childElementCount === 0 && note.textContent === "") || conversationMontree();
  // Une page se pose par-dessus le rail : il reste dessous, tel quel, et rien de lui ne se clique au travers.
  contenu.hidden = relaye === undefined && visible !== PARAMETRES;
  rail.inert = !contenu.hidden || !card.hidden;
  // Settings est une seule page, sans sous-pages (ticket 1700) : son seul groupe, celui du projet, et rien d'autre.
  state.hidden = courant === undefined || visible !== PARAMETRES;
  // Les plafonds, le closer et les lignes de tous les projets, leur section de Settings (ticket 3014) : posés tant qu'il
  // est ouvert, vidés sinon.
  if (courant !== undefined && settingsMontres()) poserLeBannerDeSante(courant);
  else bannerSante.replaceChildren();
  luOnglet.hidden = relaye === undefined;
  // Au centre, seul un fichier des projets illisible a sa raison à la place de l'espace.
  message.hidden = courant !== undefined;
  poserSecond(ouvrable, droite?.terminal);
  poserLesGroupes();
  dessiner();
  lireOnglet();
  droite?.ajuste.fit();
  const focalise = aFocaliser === undefined ? undefined : vues.get(aFocaliser);
  aFocaliser = undefined;
  if (focalise !== undefined && !focalise.cadre.hidden) focalise.xterm.focus();
}

// La colonne des terminaux : ses onglets, sa note — ce qu'un geste a écrit dans le terminal
// montré, ou pourquoi rien ne l'a été —, et ce terminal. Un projet qui ne s'ouvre pas n'a pas de
// second : la colonne dit pourquoi, à sa place — sa box, elle, se lit au centre et dans le panneau.
/** @param {boolean} ouvrable @param {Terminal | undefined} montre */
function poserSecond(ouvrable, montre) {
  // Sur un écran étroit, la colonne n'est montrée que par son onglet, à la place du centre (ticket 1186) : cachée, elle
  // garde ses terminaux et ce qu'ils avaient reçu.
  const conversation = conversationMontree();
  colonneSecond.hidden = courant === undefined || (etroit() && !conversation);
  // Sur un écran étroit, la colonne est un onglet : ni bord à tirer, ni bouton qui la replie.
  panneauDuSecond.poser(courant?.nom, !etroit());
  centre.hidden = conversation;
  principal.toggleAttribute("data-conversation", conversation);
  // Le téléphone n'a ni terminal ni shell ni second.
  teteDuSecond.hidden = phoneVu !== undefined;
  // Sous son onglet, l'explication du mot « second » (ticket 3308).
  poserLExplanationDuSecond();
  const note =
    courant !== undefined && courant.refus !== undefined
      ? `“${courant.nom}” does not open: ${courant.refus} — it has no second`
      : nonEcritSecond !== ""
        ? nonEcritSecond
        : (montre?.note ?? (ouvrable ? "the second is opening…" : ""));
  // Ce que le runtime dit d'un second qui ne part pas nomme ses outils entre accents graves : posés en code (ticket 1435).
  if (montre?.empeche !== undefined && note === montre.note) noteSecond.replaceChildren(phrase(document, "span", note));
  // Un second que la fenêtre rechargée n'a pas pu rattacher (ticket 3159) : sa ligne, et de quoi le reprendre — comme une
  // touche dans un second arrêté, il est relancé sur son fil (terminaux.ts).
  else if (montre?.aReprendre === true && note === montre.note) noteSecond.replaceChildren(note, " ", button("resume", () => brigade.ecrire(montre.id, "")));
  else noteSecond.textContent = note;
  // Un second qui ne part pas n'a pas de terminal à montrer : à sa place, pourquoi, et ce qui lui manque (ticket 1435).
  fil.hidden = !ouvrable || phoneVu !== undefined || montre?.empeche !== undefined;
  // Le second ne part pas, ou part sans tous ses outils (ticket 1435) : sous sa note, chaque outil qui manque, et ce
  // qui l'obtient — et, s'il ne part pas, de quoi réessayer. Sur un projet qui ne s'ouvre pas, il n'y a pas de second.
  const dit = !ouvrable || phoneVu !== undefined ? undefined : (montre?.empeche ?? montre?.manque);
  toolsDuSecond.hidden = dit === undefined;
  toolsDuSecond.replaceChildren(
    ...(dit === undefined || montre === undefined
      ? []
      : [
          poserToolsDuSecond(document, dit, {
            bloque: montre.empeche !== undefined,
            // Comme une touche dans un second arrêté : il est relancé, et ses outils revérifiés (terminaux.ts).
            reessayer: () => void reessayerLeSecond(montre.id),
            ouvrirLaPage: (url) => void brigade.ouvrirLaPage?.(url),
          }),
        ]),
  );
  poserSousLeSecond(ouvrable && phoneVu === undefined ? montre : undefined);
}

// « Try again » d'un second empêché : les outils relus d'abord (ticket 4059) — la lecture rattache au PATH de l'app un
// outil que son installeur vient de poser hors de lui —, puis le second relancé, qui les revérifie : installé, il part
// sans que l'app redémarre. Une lecture qui échoue ne retient rien : le plan du second dit lui-même ce qui manque.
/** @param {number} id */
async function reessayerLeSecond(id) {
  try {
    await brigade.outilsManquants?.();
  } catch {
    // Rien à dire ici : le second relancé dit ce qui lui manque.
  }
  brigade.ecrire(id, "");
}

// Sous le terminal du second, ses choix quand il demande de choisir (ticket 1520), ou le geste qu'il nomme (ticket
// 1521) : seulement quand c'est lui qui est montré, qu'il tourne, et que son canal en porte qui n'ont pas eu de
// réponse. Sinon, rien sous le terminal.
/** @param {Terminal | undefined} montre */
function poserSousLeSecond(montre) {
  const second = montre?.genre === "second" && !montre.arrete && montre.empeche === undefined ? montre : undefined;
  const proposition = second === undefined ? undefined : propositionsDuSecond.aMontrer(second.projet);
  const gesture = second === undefined ? undefined : propositionsDuSecond.geste(second.projet);
  choiceDuSecond.hidden = proposition === undefined && gesture === undefined;
  choiceDuSecond.replaceChildren(
    ...(second === undefined
      ? []
      : proposition !== undefined
        ? [poserChoiceDuSecond(document, proposition, { choisir: (valeur) => choisirAuSecond(second, valeur) })]
        : gesture !== undefined
          ? [
              poserActionDuSecond(document, gesture, {
                ouverte: propositionsDuSecond.confirmationOuverte(second.projet),
                basculer: () => confirmerLeAction(second, !propositionsDuSecond.confirmationOuverte(second.projet)),
                annuler: () => confirmerLeAction(second, false),
                lancer: () => lancerLeAction(second, gesture.id),
              }),
            ]
          : []),
  );
}

// Le bouton du geste ouvre sa confirmation, recliqué la referme ; « cancel » la referme. Rien n'est écrit dans le
// terminal du second.
/** @param {Terminal} second @param {boolean} ouverte */
function confirmerLeAction(second, ouverte) {
  propositionsDuSecond.confirmer(second.projet, ouverte);
  show();
}

// Le « run it » du chef — le seul chemin qui lance un geste : sa commande part dans le terminal du second, telle que
// publiée, puis Entrée, comme si le chef l'avait tapée ; le bouton part, et le canal apprend que le chef l'a fait. Si
// le second a publié autre chose depuis, ou est passé à autre chose, rien ne part. Le terminal reprend le clavier.
/** @param {Terminal} second @param {string} id */
function lancerLeAction(second, id) {
  const gesture = propositionsDuSecond.lancer(second.projet, id);
  if (gesture === undefined) return;
  brigade.ecrire(second.id, gesture.command);
  brigade.ecrire(second.id, "\r");
  void brigade.repondreAuSecond?.(second.projet, { id: gesture.id, by: "click" });
  aFocaliser = second.id;
  show();
}

// Un clic sur un choix : sa valeur part dans le terminal du second, puis Entrée, comme si le chef l'avait tapée ; les
// boutons partent, et le canal apprend la réponse. Le terminal reprend le clavier.
/** @param {Terminal} second @param {string} valeur */
function choisirAuSecond(second, valeur) {
  const repondue = propositionsDuSecond.repondre(second.projet);
  if (repondue === undefined) return;
  brigade.ecrire(second.id, valeur);
  brigade.ecrire(second.id, "\r");
  void brigade.repondreAuSecond?.(second.projet, { id: repondue.id, by: "click", value: valeur });
  aFocaliser = second.id;
  show();
}

// Le chef a répondu en tapant dans le terminal du second : ses choix, ou le geste nommé, partent, et le canal l'apprend.
/** @param {string} project */
function repondueAuClavier(project) {
  const repondue = propositionsDuSecond.repondreAuClavier(project);
  if (repondue === undefined) return;
  void brigade.repondreAuSecond?.(project, { id: repondue.id, by: "text" });
  show();
}

// Un terminal qu'un geste a rendu se montre à droite, et prend le clavier : un shell, à côté du
// second ; le second, si un shell le cachait. Le centre ne change pas : rien n'y est masqué ni remplacé.
/** @param {string} project @param {Terminal} terminal */
function garder(project, terminal) {
  recevoir(terminal);
  if (terminal.genre === "second") aDroite.delete(project);
  else aDroite.set(project, terminal.id);
  if (project === courant?.nom) aFocaliser = terminal.id;
}

// Une ligne courte, et son explication au survol : ce qui s'écrivait en mode d'emploi.
/** @param {string} balise @param {string} line @param {string} aide */
function ditEtAide(balise, line, aide) {
  const cree = bloc(balise, line);
  cree.append(survol(document, aide));
  return cree;
}

// Un bouton de geste : celui de la famille unique (composants/button, ticket 2916) — secondaire, sauf sorte dite.
/** @param {string} texte @param {(() => void) | undefined} gesture @param {import("./composants/button/button.js").Sorte} [sorte] */
function button(texte, gesture, sorte = "secondaire") {
  return buttonDeLaFamille(document, texte, gesture, { sorte });
}

// Ce qui se clique sans être un geste, et n'a pas la forme d'un bouton : un onglet, une case de la barre, une pastille
// de couleur, un interrupteur, un numéro qui ouvre son issue. Chacun a la sienne ; aucun n'est un bouton de la famille.
/** @param {string} texte @param {() => void} gesture */
function cliquable(texte, gesture) {
  const cree = document.createElement("button");
  cree.textContent = texte;
  cree.addEventListener("click", gesture);
  return cree;
}

// Un bouton qui porte sa commande : elle se lit telle qu'elle sera écrite, au caractère près.
/** @param {string} texte @param {() => void} gesture */
function buttonDeCommand(texte, gesture) {
  const cree = button(texte, gesture);
  cree.className = "mono";
  return cree;
}

// Le logo de brigade (docs/logo/brigade-icone.svg), la queue : la page ne charge aucune image, il est dessiné ici.
function logoDeBrigade() {
  const ns = "http://www.w3.org/2000/svg";
  const svg = document.createElementNS(ns, "svg");
  svg.setAttribute("viewBox", "2 18 60 28");
  svg.setAttribute("aria-hidden", "true");
  for (const [balise, attributs] of /** @type {[string, Record<string, string>][]} */ ([
    ["rect", { x: "2.5", y: "22", width: "14", height: "20", rx: "7", opacity: ".4" }],
    ["rect", { x: "19.5", y: "22", width: "14", height: "20", rx: "7", opacity: ".7" }],
    ["path", { d: "M43.5 22h4a14 10 0 0 1 0 20h-4a7 7 0 0 1-7-7v-6a7 7 0 0 1 7-7z" }],
  ])) {
    const forme = document.createElementNS(ns, balise);
    for (const [name, valeur] of Object.entries(attributs)) forme.setAttribute(name, valeur);
    svg.append(forme);
  }
  return svg;
}

// Une entrée de la barre : deux caractères, et ce qu'ils désignent dit en entier
// au survol et à qui ne voit pas l'écran.
/** @param {string} signe @param {string} name @param {() => void} gesture */
function icone(signe, name, gesture) {
  const cree = cliquable(signe, gesture);
  cree.title = name;
  cree.ariaLabel = name;
  return cree;
}

// Une carte de T'attend n'agit pas non plus : elle écrit une demande en prose dans le second, à
// droite, et rien ne l'envoie — c'est le second qui lit l'issue, explique et répond (request.ts).
// Le rail reste où il est, et la page ouverte par-dessus aussi.
/** @param {number} ticket */
async function demander(ticket) {
  const project = courant;
  if (project === undefined) return;
  nonEcrit = nonEcritSecond = "";
  actionRate = undefined;
  if (project.refus !== undefined) return show();
  try {
    const rendu = await brigade.demander(project.nom, ticket);
    if (rendu === undefined) nonEcritSecond = `nothing written: the last reading of the station no longer names #${ticket}`;
    else if ("refus" in rendu) nonEcritSecond = rendu.refus;
    else garder(project.nom, rendu);
  } catch (error) {
    nonEcritSecond = `nothing written: ${error instanceof Error ? error.message : String(error)}`;
  }
  show();
}

// Une ligne de la bande d'alertes dont le geste demande du jugement : une demande en prose
// s'écrit dans le second, à droite, et rien ne l'envoie — le second lit, explique, et c'est ton
// Entrée qui la fait partir (request.ts). La vue nomme la ligne ; la phrase vient de ce que la
// bande en dit, dans le process principal. Le centre ne change pas.
/** @param {Alert} alerte */
async function demanderAlert({ sujet, dit }) {
  const project = courant;
  if (project === undefined) return;
  nonEcrit = nonEcritSecond = "";
  actionRate = undefined;
  if (project.refus !== undefined) return show();
  try {
    const rendu = await brigade.demanderAlerte(project.nom, sujet, dit);
    if (rendu === undefined) nonEcritSecond = `nothing written: the band no longer says “${dit}”`;
    else if ("refus" in rendu) nonEcritSecond = rendu.refus;
    else garder(project.nom, rendu);
  } catch (error) {
    nonEcritSecond = `nothing written: ${error instanceof Error ? error.message : String(error)}`;
  }
  show();
}

// Un geste du socle, collé à l'état qu'il change : son bouton, et — confirmé et ouvert — sa
// confirmation, dessous. Direct, il part au clic. Confirmé, le clic ouvre ce qu'il coûte, et rien
// ne part ; recliqué, la confirmation se referme. `ou` : l'endroit où il est posé — la même
// confirmation ne s'ouvre que sous le bouton cliqué.
/** @param {Project} project @param {{ id: string, libelle: string, ou: string }} geste */
function poserAction(project, { id, libelle, ou }) {
  if (!CONFIRMES.includes(id)) {
    const direct = button(libelle, () => void ecrireAction(id));
    direct.dataset.geste = "direct";
    direct.title = "goes straight into the second, if it is free — its output is read there";
    return [direct];
  }
  const cle = JSON.stringify([id, "", ou]);
  const ouverte = aConfirmer?.projet === project.nom && aConfirmer.cle === cle ? aConfirmer : undefined;
  const confirme = button(`${libelle}…`, () => void ouvrirConfirmation(project, cle, id));
  confirme.dataset.geste = "confirme";
  confirme.ariaExpanded = String(ouverte !== undefined);
  confirme.title = "says what it costs first: nothing goes before your “yes”";
  return ouverte === undefined ? [confirme] : [confirme, poserConfirmation(project, ouverte)];
}

// Le clic d'un geste confirmé : sa confirmation s'ouvre — ce qu'elle dit vient du process
// principal (confirmation.ts) —, et celle qui était ouverte se referme. Rien ne part. Recliqué,
// il la referme. « Allumer » se chiffre aussi : `manager backlog` est demandée à la box, et ses
// nombres rejoignent la confirmation quand elle répond — le « oui » ne les attend pas.
/** @param {Project} project @param {string} cle @param {string} id */
async function ouvrirConfirmation(project, cle, id) {
  nonEcrit = nonEcritSecond = "";
  actionRate = undefined;
  if (aConfirmer?.projet === project.nom && aConfirmer.cle === cle) {
    aConfirmer = undefined;
    return show();
  }
  const ouverte = { projet: project.nom, cle };
  aConfirmer = ouverte;
  show();
  /** @type {Confirmation | { refus: string } | undefined} */
  let rendu;
  try {
    rendu = await brigade.confirmer(project.nom, id);
  } catch (error) {
    rendu = { refus: `nothing offered: ${error instanceof Error ? error.message : String(error)}` };
  }
  // Refermée, ou une autre ouverte entre-temps : ce qu'elle dit n'a plus où se poser.
  if (aConfirmer !== ouverte) return;
  aConfirmer = { ...ouverte, rendu: rendu ?? { refus: "nothing offered: this action is not confirmed" } };
  show();
  if (rendu === undefined || "refus" in rendu || rendu.chiffrer !== true) return;
  const account = await brigade.compter(project.nom).catch(() => undefined);
  if (aConfirmer?.projet !== project.nom || aConfirmer.cle !== cle) return;
  aConfirmer = { ...aConfirmer, compte: account ?? null };
  show();
}

// Ce que coûte un geste confirmé, sous son bouton : ce qu'il fait, son prix en clair, les cooks
// en vol et ce qu'ils ont dépensé, d'où c'est tiré — puis un bouton par « oui », chacun avec ce
// qu'il engage, et le « non ». Un « oui » fait partir son geste, dans le second ; « non » referme.
// Rien n'y est calculé : tout est dit par le process principal (confirmation.ts, allumage.ts) — ou,
// pour une demande au second, par la ligne de la bande qui la porte. `partir` : ce que fait un « oui »,
// quand ce n'est pas un geste du socle.
/** @param {Project} project @param {NonNullable<typeof aConfirmer>} ouverte @param {(id: string) => void} [partir] */
function poserConfirmation(project, { rendu, compte: account }, partir) {
  const fermer = () => {
    aConfirmer = undefined;
    show();
  };
  if (rendu === undefined || "refus" in rendu) {
    const wait = document.createElement("section");
    wait.className = "confirmation";
    if (rendu === undefined) wait.append(lineEmpty(document, "what it costs: reading…"));
    else wait.append(lineError(document, rendu.refus, "", { classe: "refus" }), button("close", fermer, "discret"));
    return wait;
  }
  // Chiffré (« allumer »), le prix est la phrase des nombres — ce qu'il va juger — et ce que le geste
  // engage passe au survol (ticket 906). Sinon, il se dit en une ligne ; le reste, et d'où c'est tiré, au survol.
  let phrase;
  let aide;
  if (rendu.chiffrer === true && ALLUMAGE !== undefined) {
    phrase = account === undefined ? ALLUMAGE.enCours : account === null ? ALLUMAGE.parti : "sans" in account ? "the count could not be read" : account.dit;
    const lu = account === undefined || account === null ? "" : `according to ${gesture(project, ALLUMAGE.commande)}, run for you on opening — read at ${heureDe(account.a)}`;
    const raison = account === undefined || account === null || !("sans" in account) ? "" : [account.sans, account.obtenu].filter((texte) => texte !== "").join("\n");
    aide = [...rendu.prix, lu, raison].filter((texte) => texte !== "").join("\n");
  } else {
    const [prix = "", ...suite] = rendu.prix;
    const source = rendu.lu === undefined ? [] : [`according to ${gesture(project, "facts")}, read at ${heureDe(rendu.lu)}`];
    phrase = prix;
    aide = [...suite, ...source].join("\n");
  }
  // Chiffrée, la confirmation n'écrit que sa phrase de prix : ce que chaque réponse engage passe au
  // survol de son bouton, pas à côté de lui (ticket 906).
  return confirmationDeAction(
    document,
    {
      titre: `⚠️ ${rendu.titre}`,
      phrase,
      aide,
      non: rendu.renoncer,
      aCote: rendu.chiffrer !== true,
      choix: rendu.choix.map(({ id, libelle, dit }) => ({
        libelle,
        dit,
        partir: () => {
          aConfirmer = undefined;
          if (partir === undefined) void ecrireAction(id, true);
          else partir(id);
        },
      })),
    },
    { non: fermer },
  );
}

// Un geste part dans le second, à droite : sa sortie s'y lit, sa note dit ce qui est parti, et le
// centre ne change pas. Le second n'est pas libre : rien n'y est écrit, et la raison se lit sous
// son titre — occupé, la commande n'est pas partie. `oui` : le « oui » d'une confirmation — un geste
// confirmé ne part qu'avec lui.
/** @param {string} id @param {true} [oui] */
async function ecrireAction(id, oui) {
  const project = courant;
  if (project === undefined) return;
  nonEcrit = nonEcritSecond = "";
  actionRate = undefined;
  /** @param {string} raison */
  const rate = (raison) => {
    nonEcritSecond = raison;
    actionRate = { texte: raison, rejouer: () => void ecrireAction(id, oui) };
  };
  try {
    const rendu = await brigade.geste(project.nom, id, oui);
    if (rendu === undefined) return show();
    // Le chef a pu changer d'espace entre-temps : le second de ce projet le garde.
    if ("refus" in rendu) rate(rendu.refus);
    else {
      garder(project.nom, rendu);
      if (rendu.nonParti === true) rate(rendu.note);
    }
  } catch (error) {
    rate(`nothing sent: ${error instanceof Error ? error.message : String(error)}`);
  }
  show();
}

// Un geste confirmé qui n'a rien envoyé ne se perd pas dans la petite note du second : le centre le dit en une
// phrase, le détail au survol, et un bouton rejoue le même geste.
/** @param {{ texte: string, rejouer: () => void }} rate */
function poserActionRate({ texte, rejouer: replay }) {
  const tete = (texte.split(/ — |: |\n|`/)[0] ?? texte).trim();
  const phrase = document.createElement("span");
  phrase.textContent = `nothing was sent to the second: ${tete}`;
  phrase.title = texte;
  const encore = button(REESSAYER, replay);
  encore.dataset.reessayer = "";
  return [phrase, encore];
}

// La page cliquée s'ouvre par-dessus le rail ; recliquée, elle se referme, et le rail revient tel qu'il était.
/** @param {string} id */
function activer(id) {
  nonEcrit = "";
  if (courant === undefined) return show();
  if (laisse.get(courant.nom) === id) laisse.delete(courant.nom);
  else laisse.set(courant.nom, id);
  show();
}

// À droite, l'onglet d'un shell le montre à la place du second ; celui du second le rend. Ni l'un
// ni l'autre ne se ferme : caché, un terminal garde ce qu'il avait reçu. Celui montré prend le clavier.
/** @param {number | undefined} id */
function showADroite(id) {
  if (courant === undefined) return show();
  if (id === undefined) aDroite.delete(courant.nom);
  else aDroite.set(courant.nom, id);
  aFocaliser = id ?? secondDuCourant()?.terminal.id;
  show();
}

// Rail ou Stations (ticket 1184) : l'onglet choisi est montré, et retenu pour ce projet. Une page ouverte par-dessus se
// referme, la fiche aussi ; le second, à droite, ne bouge pas.
/** @param {string} id */
function choisirOnglet(id) {
  if (courant === undefined) return;
  retenir(courant.nom, id);
  if (id === STATIONS) enregistreesARelire = true;
  if (id === AGENTS) agentsDuProject.lire(courant.nom);
  // Know-how relit ses entrées à chaque ouverture (ticket 4241).
  if (id === KNOW_HOW) relireLeKnowHow(courant.nom, reposerLeKnowHow(courant.nom));
  laisse.delete(courant.nom);
  nonEcrit = "";
  if (ouverte !== undefined) closeCard();
  show();
}

// L'onglet Know-how se repose quand ses entrées arrivent ou qu'un geste a répondu, s'il est encore celui du projet montré.
/** @param {string} name */
const reposerLeKnowHow = (name) => () => {
  if (courant?.nom === name && ongletDe(courant) === KNOW_HOW) poserRail(courant);
};

// Settings s'ouvre par-dessus le rail. Recliqué, il se referme.
/** @param {string} id */
function activerRubrique(id) {
  const rubrique = RUBRIQUES.find((candidate) => candidate.id === id);
  if (rubrique === undefined) return;
  nonEcrit = "";
  if (courant === undefined) return show();
  if (rubriqueDe(laisse.get(courant.nom))?.id === id) laisse.delete(courant.nom);
  else laisse.set(courant.nom, rubrique.defaut);
  show();
}

// Seul l'onglet de contenu affiché est lu sur la box : en changer, passer à un
// terminal ou quitter l'espace arrête sa lecture. Rien ne reste de l'onglet d'avant.
// La page des coûts de l'app tient lieu d'onglet, l'espace fermé : elle lit la box de chaque projet.
function lireOnglet() {
  const relaye = ONGLETS.find(({ id }) => id === lue());
  const page = courant === undefined && !ajoute ? pageDeLApp : undefined;
  const voulu = page !== undefined ? JSON.stringify(["", page]) : courant === undefined || relaye === undefined ? "" : JSON.stringify([courant.nom, relaye.id]);
  if (voulu === suivi) return;
  suivi = voulu;
  if (courant !== undefined && relaye !== undefined && !settingsMontres()) attendre(courant, luOnglet, readOnglet);
  ongletRequest = page ?? relaye?.id;
  brigade.onglet(courant?.nom, ongletRequest, ++requestOnglet);
}

/** @param {Terminal} terminal */
function recevoir(terminal) {
  vue(terminal.id).terminal = terminal;
  // Un second qui ne part pas, ou repart : la mise en place le dit (ticket 3166).
  if (terminal.genre === "second" && courant?.nom === terminal.projet) poserLeProjectAPreparer();
}

// « + shell » demande où ouvrir : ce poste, la box, ou une station du projet. Là où il n'y a que ce
// poste, rien n'est à choisir : le shell s'y ouvre. Recliqué, le choix se referme.
async function ouvrirShell() {
  const project = courant;
  if (project === undefined) return;
  if (choiceDeMachine?.projet === project.nom) {
    choiceDeMachine = undefined;
    return show();
  }
  const machines = await brigade.machines(project.nom);
  if (machines.length === 1 && machines[0] !== undefined) return ouvrirSur(project.nom, machines[0].id);
  choiceDeMachine = { projet: project.nom, machines };
  show();
}

// Le shell s'ouvre sur la machine choisie, dans une session qui lui survivra.
/** @param {string} project @param {string} machine */
async function ouvrirSur(project, machine) {
  choiceDeMachine = undefined;
  nonEcritSecond = "";
  const rendu = await brigade.shell(project, machine);
  if ("refus" in rendu) nonEcritSecond = rendu.refus;
  // Le chef a pu changer d'espace pendant que le shell s'ouvrait : il attend dans le sien.
  else garder(project, rendu);
  show();
}

// Fermer le shell montré : son onglet s'en va, et sa session avec — ou la note dit pourquoi elle reste.
fermerShell.addEventListener("click", async () => {
  const montre = montreADroite()?.terminal;
  if (montre === undefined || montre.genre !== "shell") return;
  nonEcritSecond = "";
  const rendu = await brigade.fermerShell(montre.id);
  if ("refus" in rendu) nonEcritSecond = rendu.refus;
  show();
});

// Échap referme le choix de la machine, sans rien ouvrir.
listeMachines.addEventListener("keydown", (event) => {
  if (event.key !== "Escape") return;
  choiceDeMachine = undefined;
  show();
});

/** @param {string} balise @param {string} texte */
function bloc(balise, texte) {
  const cree = document.createElement(balise);
  cree.textContent = texte;
  return cree;
}

// Ce qui se recopie tel quel — un numéro de ticket, un identifiant de run, un port : en monospace,
// et c'est une information, pas un style. Rien d'autre ne l'est que ce que la box a rendu.
/** @param {string} balise @param {string} texte */
function exact(balise, texte) {
  const cree = bloc(balise, texte);
  cree.className = "mono";
  return cree;
}

// Ce que l'app dit elle-même, sur plusieurs lignes : ses mots, dans la police de l'interface et
// sans cadre — le cadre et le monospace d'un `pre` restent à ce que la box a rendu.
/** @param {string} texte */
function propos(texte) {
  const cree = bloc("pre", texte);
  cree.className = "propos";
  return cree;
}

// Le geste que l'app nomme quand une box jointe ne lui répond pas comme elle
// l'attend. Elle ne sait pas pourquoi : ce qu'elle a obtenu est affiché au-dessus.
// Ce qui se dit, au survol, d'une lecture de GitHub qui n'a pas rendu la file sur le téléphone.
const AU_PHONE = "GitHub was reached, and did not give this project's queue as the app expects. This phone tries again every 30 s.";
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
const inconnu = (name) =>
  [
    "The station was reached, and its step does not know this project: what it said about it is above.",
    `The app gave it “${name}” — the “nom” of the project in ${configuration.chemin}. The station must serve it under this name.`,
    "If it was uninstalled from this station, this is expected: it can no longer be controlled there. “Remove this project”, in its space's panel, removes it from the app.",
  ].join("\n");

// Ce que l'app dit quand le geste a refusé celui qui le lance. Elle nomme où
// est écrit le geste qui donne ce droit, et ne le rejoue pas : il se joue sur la box.
const SANS_DROIT = [
  "The station was reached, and its step refused your account: what it said about it is above.",
  "This is neither a failure nor a runtime to update: it is a right this account lacks.",
  "",
  "It is given on the station, by someone who has `sudo` there — the app does not do it for you:",
  "(docs/installer.md, “Ajouter un humain”)",
].join("\n");

// Ce que l'app dit quand le code de la box est celui d'une commande absente.
// Elle ne sait pas laquelle : c'est la box qui la nomme, au-dessus.
/** @param {Project} project */
const commandManque = (project) => [
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
const sansBord = (project) => [
  `Nothing could be set apart: the output of ${gesture(project, "status")} lacks the block the app can take — a single line starting with \`attend\`, a single \`fin attend\` line.`,
  "This is not “nothing awaits you”: what awaits you, if anything, is in the output below, in full.",
].join("\n");

// Ce qui attend le chef, en tête et à part : le bloc de `status`, tel qu'il l'a
// écrit — c'est lui qui dit quand rien n'attend. Sans bloc, l'app dit qu'elle n'a rien pris.
/** @param {Project} project @param {string | undefined} awaiting @param {boolean} [home] */
function aPart(project, awaiting, home = false) {
  const cree = document.createElement("section");
  cree.className = "attend";
  cree.dataset.pris = String(awaiting !== undefined);
  if (home) cree.append(bloc("h3", "what awaits you"), awaiting === undefined ? lineError(document, "what awaits you could not be set apart", sansBord(project)) : bloc("pre", awaiting));
  else cree.append(bloc("h3", `what awaits you — the \`attend\` block of ${gesture(project, "status")}`), awaiting === undefined ? propos(sansBord(project)) : bloc("pre", awaiting));
  return cree;
}

// Une lecture en échec se dit en une ligne, dans les mots de l'app ; ce que la station a
// répondu, et ce que l'app en dit de plus (le code de sortie choisit le renvoi, le texte n'est jamais
// traduit), se lisent au survol. Rien de technique n'est écrit à plat.
/** @param {Project} project @param {import("../box.ts").Failure & { projet: string }} recue @param {string} plusPilotable ce qui se dit d'une box jointe dont le code ne dit aucun cas */
function obtenuEnUneLine(project, recue, plusPilotable) {
  const [line, suite] =
    recue.cas === "projet-inconnu"
      ? ["the station does not know this project", inconnu(recue.projet)]
      : recue.cas === "sans-droit"
        ? ["your account lacks the right to this action on the station", SANS_DROIT]
        : recue.cas === "commande-manque"
          ? ["a command is missing on the station", commandManque(project)]
          : recue.cas === "node-inapte"
            ? ["the station's node does not suit the runtime", NODE_INAPTE]
            : recue.atteinte
              ? ["the station answered, but not as the app expects", plusPilotable]
              : ["the station did not answer", undefined];
  const dite = lineError(document, line, suite === undefined ? recue.erreur : `${recue.erreur}\n\n${suite}`);
  // Ce que la station a dit, sans la commande lancée : la panne du signalement, en quelques mots.
  const dit = recue.erreur.split("\n").filter((une) => une.trim() !== "" && !une.startsWith("$ ")).join(" ");
  dite.append(...report.poser({ projet: project.nom, reference: { ligne: line }, panne: dit === "" ? `${project.nom}: ${line}` : `${project.nom}: ${line} — ${dit}` }));
  return [dite];
}

// Ce qu'une lecture donne à voir, dans le panneau de l'espace, à côté du terminal et dans
// un onglet de contenu : un des sept états, dit en toutes lettres, et dessous ce
// que l'app a obtenu. Celle d'un onglet n'a rien de mis à part : ce n'est pas `status`.
/**
 * @param {Montree | Read} recue @param {HTMLElement} tete @param {HTMLElement} corps
 */
function rendre(recue, tete, corps) {
  // Le projet a pu quitter le fichier depuis la demande : il n'y a plus rien à lui écrire.
  const project = projectDe(recue.projet);
  if (project === undefined) return;
  const heure = heureDe(recue.a);
  if ("sorties" in recue) {
    const mise = "attend" in recue;
    tete.dataset.etat = "pilotable";
    tete.textContent = `${mise ? "controllable — " : ""}read at ${heure}`;
    // Ce que la box a dit n'est pas montré : l'état se lit dans la phrase de la tête ; seul le bloc `attend`, mis à part, reste.
    corps.replaceChildren(...(mise ? [aPart(project, recue.attend, true)] : []));
  } else if (recue.cas === "projet-inconnu") {
    tete.dataset.etat = "inconnu";
    tete.textContent = `REACHED, BUT UNKNOWN TO THE STATION — tried at ${heure}, the next follows on its own`;
  } else if (recue.cas === "sans-droit") {
    tete.dataset.etat = "sans-droit";
    tete.textContent = `REACHED, BUT WITHOUT THE RIGHT TO THE ACTION — tried at ${heure}, the next follows on its own`;
  } else if (recue.cas === "commande-manque") {
    tete.dataset.etat = "commande-manque";
    tete.textContent = `REACHED, BUT A COMMAND IS MISSING ON THE STATION — tried at ${heure}, the next follows on its own`;
  } else if (recue.cas === "node-inapte") {
    tete.dataset.etat = "node-inapte";
    tete.textContent = `REACHED, BUT THE STATION'S NODE DOES NOT SUIT THE RUNTIME — tried at ${heure}, the next follows on its own`;
  } else if (recue.atteinte) {
    tete.dataset.etat = "plus-pilotable";
    tete.textContent = `REACHED, BUT NO LONGER CONTROLLABLE — tried at ${heure}, the next follows on its own`;
  } else {
    tete.dataset.etat = "pas-joint";
    tete.textContent = `NOT REACHED — tried at ${heure}, the next follows on its own`;
  }
  // Chaque état de pilotage a son ton, et sa forme : en niveaux de gris, ils ne se confondent pas.
  const ton = TONS_DE_PILOTAGE[tete.dataset.etat ?? ""];
  delete tete.dataset.ton;
  if (ton !== undefined) {
    tete.dataset.ton = ton;
    tete.prepend(marqueDePill(document, ton));
  }
  if ("erreur" in recue) corps.replaceChildren(...obtenuEnUneLine(project, recue, ACTION));
}

// Ce qu'une vérification a donné. En tête, son verdict en une phrase ; dessous, une ligne par
// manque — qui agit, et pour le chef le bouton qui fait le geste ou la commande exacte, à copier ;
// les lignes « à savoir » à part, plus discrètes. Sans verdict, le même cas et le même renvoi que sous `status`.
/**
 * @param {Project} project @param {Guide["verification"]} verification
 * @param {(texte: string, gesture: () => Promise<unknown>) => HTMLButtonElement} action
 * @param {boolean} [avecTitre] faux : la phrase est déjà dite au-dessus (une alerte plantée la porte en titre)
 * @returns {HTMLElement[]}
 */
function poserVerdict(project, verification, action, avecTitre = true) {
  if (verification === undefined) return [];
  const tete = bloc("p", verification.titre);
  tete.className = "verdict";
  tete.dataset.verdict = verification.etat;
  if (verification.etat === "en-cours") return [tete];
  if (verification.etat === "sans-verdict") {
    tete.textContent = `${verification.titre} — verified at ${heureDe(verification.a)}`;
    return [tete, ...obtenuEnUneLine(project, { ...verification.echec, projet: project.nom }, ACTION)];
  }
  const posee = document.createElement("div");
  posee.className = "verification";
  if (avecTitre) posee.append(tete);
  if (verification.etat === "illisible") {
    posee.append(...verification.suite.map((line) => bloc("p", line)));
    return [posee];
  }
  if (verification.manques.length > 0) {
    const manques = document.createElement("ul");
    manques.className = "manques";
    manques.append(...verification.manques.map((manque) => poserManque(project, manque, action)));
    posee.append(manques);
  }
  if (verification.panne !== null) posee.append(bloc("p", verification.panne));
  if (verification.aSavoir.length > 0) {
    const aSavoir = document.createElement("div");
    aSavoir.className = "a-savoir";
    aSavoir.append(bloc("strong", "Good to know — nothing waits on these"));
    for (const line of verification.aSavoir) aSavoir.append(line.geste === null ? bloc("p", line.texte) : ditEtAide("p", line.texte, line.geste));
    posee.append(aSavoir);
  }
  return [posee];
}

// Un manque : qui agit, ce qui manque en mots simples, et ce que le chef a pour le lever — un
// bouton quand l'app fait le geste, sinon la commande exacte, au survol. Ce que brigade
// lève seule n'a rien de tout cela.
/**
 * @param {Project} project @param {import("../service.ts").LineDeManque} manque
 * @param {(texte: string, gesture: () => Promise<unknown>) => HTMLButtonElement} action
 */
function poserManque(project, manque, action) {
  const line = document.createElement("li");
  line.dataset.acteur = manque.acteur;
  line.append(bloc("strong", `${manque.qui}:`), " ", manque.texte);
  const { geste: gesture } = manque;
  if (gesture === null) return line;
  if ("action" in gesture) {
    const id = gesture.action;
    if (id === "init") line.append(action(gesture.libelle, () => amorcerService(project)));
    else if (id === "protection") line.append(action(gesture.libelle, () => brigade.proteger(project.nom)));
    // Les stations et les décisions se choisissent sur la page du projet : la ligne n'a pas de bouton.
    return line;
  }
  // Ni commande ni phrase de mode d'emploi à plat : elles se lisent au survol.
  line.append(survol(document, "commande" in gesture ? gesture.commande : gesture.dit));
  return line;
}

/** @param {Project} project */
async function lireService(project) {
  retenirDeclarees(await brigade.service(project.nom));
}

// Les stations déclarées qu'un guide porte sont retenues pour son projet ; affiché, son bloc se repose.
/** @param {import("../service.ts").Guide | undefined} guide */
function retenirDeclarees(guide) {
  const lues = guide?.controle?.stations;
  if (guide === undefined || lues === undefined) return;
  declarees.set(guide.projet, lues);
  if (courant?.nom === guide.projet) reposerLesStations(courant);
}

// Les stations déclarées se lisent dans « Details » de la carte de chacune, sur l'onglet Stations : il se repose.
/** @param {Project} project */
function reposerLesStations(project) {
  if (courant?.nom === project.nom) reposerLOngletStations();
}

// Les gestes des réglages d'une station déclarée, dans « Details » de sa carte (ticket 2488) : un plafond ou des capacités
// changés partent aussitôt ; la case des tickets ordinaires de ce poste s'écrit comme dans Settings.
/** @param {Project} project @returns {import("./project/stations/StationSettings.js").Actions} */
function actionsDesSettings(project) {
  return {
    appliquer: (name, cle, voulu) => void changerLaStation(project, name, cle, voulu),
    ordinaires: (taken) => void reglerLesOrdinairesIci(project, taken),
  };
}
// Le changement part — la rangée `cle` dit qu'il est en route —, puis elle dit ce qu'il a rendu ; refusé, la saisie revient
// à la déclaration en vigueur. La déclaration relue arrive par `surGuide`, et le bloc s'y repose.
/** @param {Project} project @param {string} name @param {string} cle @param {import("../service.ts").StationVoulue} voulu */
async function changerLaStation(project, name, cle, voulu) {
  const saisie = saisiesDesStations.get(project.nom)?.get(name);
  if (saisie === undefined || saisie.envoi) return;
  saisie.envoi = true;
  saisie.ou = cle;
  saisie.rendu = undefined;
  reposerLOngletStations();
  /** @type {import("../service.ts").StationChangee} */
  let rendu;
  try {
    rendu = await brigade.changerUneStation(project.nom, name, voulu);
  } catch (error) {
    rendu = { refus: "Nothing was changed: the app did not answer", detail: error instanceof Error ? error.message : String(error) };
  }
  saisie.envoi = false;
  saisie.rendu = rendu;
  if ("refus" in rendu) revenir(saisie, declarees.get(project.nom)?.declarees.find((lue) => lue.nom === name));
  if (courant?.nom === project.nom) reposerLOngletStations();
}
// Les projets dont la case des tickets ordinaires de ce poste est en route, sur « Station settings ».
/** @type {Set<string>} */
const ordinairesEnCours = new Set();
// La case des tickets ordinaires de ce poste : la même écriture que Settings, la limite de cooks gardée telle qu'elle est.
/** @param {Project} project @param {boolean} taken */
async function reglerLesOrdinairesIci(project, taken) {
  const lu = ordinairesVus.get(project.nom);
  if (lu === undefined || !lu.reglable || ordinairesEnCours.has(project.nom)) return;
  ordinairesEnCours.add(project.nom);
  reposerLOngletStations();
  /** @type {string | undefined} */
  let refusal;
  try {
    refusal = await brigade.reglerOrdinaires(project.nom, taken, lu.limite);
  } catch (error) {
    refusal = `nothing was written: ${error instanceof Error ? error.message : String(error)}`;
  } finally {
    ordinairesEnCours.delete(project.nom);
  }
  ordinairesRefuses = { projet: project.nom, refus: refusal ?? "" };
  ordinairesPose = "";
  // Relue, l'option se repose à la valeur en vigueur — celle d'avant, quand le changement est refusé.
  if (courant?.nom === project.nom) await poserOrdinaires(project);
}

// « Cook it on a station that has it » (ticket 1511) ouvre, sur Stations, « Details » de la carte de la station de ce poste :
// la capacité qui manque y est offerte, décochée, à côté de celles qu'elle déclare — et ce que cet ordinateur sait déclarer,
// lu comme pour « + station » (ticket 1307). La cocher la déclare : chaque case s'applique dès qu'elle change (ticket 2920).
/** @type {{ projet: string, nom: string } | undefined} */
let capacityOfferte;
/** @param {Project} project @param {string} name @param {string} [appelee] */
async function offrirLaCapacity(project, name, appelee) {
  const lues = declarees.get(project.nom);
  const station = lues?.declarees.find((lue) => lue.nom === name);
  if (lues === undefined || station === undefined) return;
  const saisies = saisiesDesStations.get(project.nom) ?? new Map();
  saisiesDesStations.set(project.nom, saisies);
  const saisie = saisieDe(saisies, station, lues);
  saisie.choix = choiceDeCapacities(station, lues, [], appelee);
  capacityOfferte = { projet: project.nom, nom: name };
  reposerLOngletStations();
  const defauts = await defautsDeCetOrdinateur(project.nom);
  if ("refus" in defauts || saisies.get(name) !== saisie) return;
  saisie.choix = choiceDeCapacities(station, lues, defauts.capacites, appelee);
  if (courant?.nom === project.nom) reposerLOngletStations();
}

// Un geste de l'installation a rendu un terminal — le second, pour la session d'init ; un
// shell, pour le démarrage — ou la raison pour laquelle rien n'est fait. Le terminal est
// montré, à droite : c'est sa note qui dit ce qui a été lancé, ou écrit. La raison se lit là
// où il se serait montré : à droite, sous les onglets des terminaux.
/** @param {Project} project @param {Terminal | { refus: string }} rendu */
function suivreAction(project, rendu) {
  nonEcrit = nonEcritSecond = "";
  actionRate = undefined;
  if (!("refus" in rendu)) garder(project.nom, rendu);
  else nonEcritSecond = rendu.refus;
  if (courant?.nom === project.nom) show();
}

/** @param {Project} project */
async function amorcerService(project) {
  suivreAction(project, await brigade.amorcer(project.nom));
}

// Une ligne de Settings (ticket 1700) : la rangée de réglage de l'app (composants/setting, ticket 2920) — son nom, sa
// valeur en vigueur, son contrôle, qui s'applique dès qu'il change ; puis, sous elle, ce que le contrôle a ouvert ou rendu
// (une confirmation, un refus). `niveau` : sa clé, et la marque de son niveau (niveaux.js), posée à côté de son nom.
/** @param {string} name @param {(Node | string)[]} valeur @param {HTMLElement[]} controle @param {HTMLElement[]} [dessous] @param {{ cle: string, niveau: HTMLElement }} [niveau] */
function rangeeDeSetting(name, valeur, controle, dessous = [], niveau) {
  return rangeeDeLaFamille(document, { nom: name, valeur, controle, dessous, ...niveau });
}

// Un refus, sous la ligne qu'il concerne.
/** @param {string} texte @returns {HTMLElement[]} */
function refusalDeSetting(texte) {
  if (texte === "") return [];
  return [lineError(document, texte, "", { classe: "dit refus" })];
}

// Le groupe de Settings : son titre est le mot du niveau (niveaux.js), son survol dit où ses réglages sont gardés. Sans
// réglage, il le dit en une ligne.
for (const [niveau, aide] of /** @type {const} */ ([
  ["project", "the project's settings — those in its repository change by a pull request, held for you; its kitchen is set on the station that serves it"],
])) {
  const titre = element(`niveau-${niveau}`);
  titre.dataset.niveau = niveau;
  titre.replaceChildren(NIVEAUX_DITS[niveau].libelle, survol(document, aide));
}
function poserLesGroupes() {
  emptyProject.hidden = !settingsDuProject.hidden || !stopKitchen.hidden;
  emptyProject.textContent = emptyProject.hidden ? "" : "nothing to set: no station reads this project";
}
// Le projet dans ton app (ticket 1700) : une ligne du groupe du projet — il est dans la barre, et « Remove from the app »
// l'en retire ; rien ne part vers sa station, ce que le survol du bouton dit. Le clic demande d'abord un « yes » : un
// projet ne se retire pas d'un clic perdu. Refusé, la raison se lit sous la ligne.
/** @param {Project} project @param {Retrait | undefined} pose */
function poserRetrait(project, pose) {
  // Le chef a pu changer d'espace pendant que le process principal répondait.
  if (courant?.nom !== project.nom) return;
  retrait.hidden = pose === undefined;
  if (pose === undefined) return retrait.replaceChildren();
  if (retraitDeLApp !== project.nom) retraitDeLApp = "";
  if (nonRetire.projet !== project.nom) nonRetire = { projet: "", refus: "" };
  const { libelle, lignes: lines } = pose.retirer;
  const request = button(`${libelle}…`, () => {
    retraitDeLApp = project.nom;
    poserRetrait(project, pose);
  }, "danger");
  request.title = lines.join("\n");
  const controle =
    retraitDeLApp === project.nom
      ? [button(OUI(`remove “${project.nom}” from the app`), () => void retirerDeLApp(project), "danger"), button(ANNULER, () => ((retraitDeLApp = ""), poserRetrait(project, pose)), "discret")]
      : [request];
  retrait.replaceChildren(rangeeDeSetting("Remove this project from the app's sidebar", [], controle, refusalDeSetting(nonRetire.refus)));
}

// L'accent de l'espace affiché : celui de son projet, à la place de celui de la peau — posé sur la
// racine, il vaut pour tout ce que la peau dit choisi ou au clavier. Ailleurs, la peau reprend le sien.
function teindre() {
  const accent = ajoute ? undefined : courant?.couleurs?.accent;
  if (accent === undefined) document.documentElement.style.removeProperty("--accent");
  else document.documentElement.style.setProperty("--accent", accent);
}

// Les couleurs du projet, dans le groupe du projet de Settings : une ligne par rôle — la couleur qu'il porte, puis une
// pastille par couleur de la palette, celle qu'il porte pressée, et le sélecteur d'une couleur libre. Une couleur libre
// se montre aussi, pressée, au bout de la palette : la palette est ce que l'app propose, pas ce qu'elle exige. Trop
// proche d'une couleur d'état ou de celle d'un autre projet, elle reste, et une ligne sous la sienne dit laquelle
// (couleurs.ts, `proches`).
/** @param {Project} project */
function poserCouleurs(project) {
  if (couleurRefusee.projet !== project.nom) couleurRefusee = { projet: "", refus: "" };
  couleurs.hidden = false;
  /** @param {"onglet" | "accent"} role @param {string} libelle */
  const rangee = (role, libelle) => {
    const portee = project.couleurs?.[role];
    const nommee = PALETTE.find(({ valeur }) => valeur === portee)?.nom;
    const pastilles = PALETTE.map(({ nom: name, valeur }) => {
      const cree = cliquable("", () => void colorer(project, role, name));
      cree.className = "teinte";
      cree.style.setProperty("--teinte", valeur);
      cree.title = cree.ariaLabel = `${libelle}: ${name}`;
      cree.ariaPressed = String(valeur === portee);
      return cree;
    });
    if (portee !== undefined && nommee === undefined) {
      const tienne = cliquable("", () => {});
      tienne.className = "teinte";
      tienne.style.setProperty("--teinte", portee);
      tienne.title = tienne.ariaLabel = `${libelle}: ${portee}, your own color`;
      tienne.ariaPressed = "true";
      tienne.disabled = true;
      pastilles.push(tienne);
    }
    // Le sélecteur du système : la couleur part dès qu'elle est choisie.
    const free = document.createElement("input");
    free.type = "color";
    free.value = portee ?? PALETTE[0]?.valeur ?? "";
    free.title = free.ariaLabel = `${libelle}: another color…`;
    free.addEventListener("change", () => void colorer(project, role, free.value));
    const autre = document.createElement("label");
    autre.className = "libre";
    autre.append(free, "other…");
    const palette = document.createElement("span");
    palette.className = "rangee";
    palette.append(...pastilles, autre);
    const proche = project.proches?.[role];
    return rangeeDeSetting(libelle, [bloc("span", portee === undefined ? PAS_ENCORE("color") : (nommee ?? portee))], [palette], proche === undefined ? [] : refusalDeSetting(`${libelle}: ${proche}`), { cle: "couleurs", niveau: niveauDe(document, "couleurs") });
  };
  couleurs.replaceChildren(rangee("onglet", "tab, in the bar"), rangee("accent", "accent, in the space"), ...refusalDeSetting(couleurRefusee.refus));
}

// Le sigle du projet, dans le groupe du projet de Settings (ticket 1983) : celui que sa case écrit — tiré de son nom, ou
// le tien —, et le champ où l'écrire. Écrit, il part dès que le champ change ; vidé, ou par « back to its name », la
// case reprend celui que l'app tire de son nom. Refusé, la raison se lit sous la ligne.
/** @param {Project} project */
function poserSigle(project) {
  if (sigleRefuse.projet !== project.nom) sigleRefuse = { projet: "", refus: "" };
  sigle.hidden = false;
  const champ = document.createElement("input");
  champ.className = "mono";
  champ.value = project.sigle ?? "";
  champ.placeholder = project.etiquette;
  champ.autocomplete = "off";
  champ.spellcheck = false;
  champ.title = champ.ariaLabel = "your label for its tile: 3 characters at most — empty, the app derives one from its name";
  champ.addEventListener("change", () => void siglerProject(project, champ.value.trim() === "" ? null : champ.value));
  const controle = project.sigle === undefined ? [champ] : [champ, button("back to its name", () => void siglerProject(project, null))];
  const vaut = bloc("span", project.etiquette);
  vaut.className = "mono";
  sigle.replaceChildren(rangeeDeSetting("Label in the bar", [vaut, ` · ${project.sigle === undefined ? "from its name" : "yours"}`], controle, refusalDeSetting(sigleRefuse.refus), { cle: "sigle", niveau: niveauDe(document, "sigle") }));
}

// Un sigle écrit : le process principal l'écrit dans le fichier des projets, et il revient par `surConfiguration` — la
// case le prend alors. `null` : le sigle écrit est retiré. Refusé, la raison se lit dessous.
/** @param {Project} project @param {string | null} voulu */
async function siglerProject(project, voulu) {
  const refusal = await brigade.changerSigle(project.nom, voulu);
  sigleRefuse = { projet: project.nom, refus: refusal ?? "" };
  if (courant?.nom === project.nom) poserSigle(courant);
}

// L'état de la cuisine dans la barre des menus du Mac, la zone de notification de Windows (ticket 3269) : une ligne de
// toi, la même dans les Settings de chaque projet — elle vaut pour toute l'app. Un interrupteur la pose ou la retire ; le
// process principal l'écrit dans le fichier des projets, et elle revient par `surConfiguration`. Le téléphone n'en a pas.
function poserBarDeMenus() {
  if (phone !== undefined || brigade.changerBarreDeMenus === undefined) {
    barDeMenus.hidden = true;
    return barDeMenus.replaceChildren();
  }
  barDeMenus.hidden = false;
  const allumee = configuration.barreDeMenus !== false;
  const ou = WORKSTATION.mac ? "menu bar" : "notification area";
  const bascule = switchDeLApp(document, { texte: allumee ? "on" : "off", allume: allumee, libelle: `Show the kitchen's state in the ${ou}` }, (voulue) => void reglerBarDeMenus(voulue));
  const aide = `how many cooks are working and how many questions wait for you — "3 cooking · 1 for you" — in the ${ou}; a click lists the questions, and opens the app on the one you pick. For the whole app, not this project only`;
  barDeMenus.replaceChildren(rangeeDeSetting(WORKSTATION.mac ? "Menu bar" : "Notification area", [bloc("span", allumee ? "shown" : "hidden"), survol(document, aide)], [bascule], refusalDeSetting(barDeMenusRefusee || (allumee ? iconeDeBackgroundRefusee : "")), { cle: "barre-de-menus", niveau: niveauDe(document, "barre-de-menus") }));
}
async function lireLIconeDeBackground() {
  const refusal = (await brigade.iconeDeFond?.()) ?? "";
  if (refusal === iconeDeBackgroundRefusee) return;
  iconeDeBackgroundRefusee = refusal;
  poserBarDeMenus();
}
/** @param {boolean} voulue */
async function reglerBarDeMenus(voulue) {
  const refusal = await brigade.changerBarreDeMenus?.(voulue);
  barDeMenusRefusee = refusal ?? "";
  poserBarDeMenus();
}

// Une couleur choisie : le process principal l'écrit dans le fichier des projets, et elle revient
// par `surConfiguration` — la barre et l'espace la prennent alors. Refusée, la raison se lit dessous.
/** @param {Project} project @param {"onglet" | "accent"} role @param {string} couleur une teinte de la palette par son nom, ou une couleur libre `#rrggbb` */
async function colorer(project, role, couleur) {
  const refusal = await brigade.colorer(project.nom, role, couleur);
  couleurRefusee = { projet: project.nom, refus: refusal ?? "" };
  if (courant?.nom === project.nom) poserCouleurs(courant);
}

// Les réglages du projet, sous Paramètres (ticket 1309) : lus là où sa cuisine tourne, à l'ouverture du projet. Un
// projet qui ne cuit nulle part n'a pas de runtime pour les lire : la section ne se pose pas.
/** @param {Project} project */
async function lireLesSettings(project) {
  if (!seLit(project)) {
    settingsLus.delete(project.nom);
    return poserLesSettingsDuProject(project);
  }
  /** @type {import("../settings-du-project.ts").ReadDesSettings | undefined} */
  let recue;
  try {
    recue = await brigade.reglagesDuProjet(project.nom);
  } catch (error) {
    recue = { sans: NON_ATTEINT("settings"), detail: error instanceof Error ? error.message : String(error) };
  }
  // Un pont qui ne porte pas la lecture — un téléphone — ne rend rien : la section ne se pose pas.
  if (recue === undefined) settingsLus.delete(project.nom);
  else settingsLus.set(project.nom, recue);
  if (courant?.nom !== project.nom) return;
  poserLesSettingsDuProject(project);
}

// L'état d'un réglage du projet, et ce que ses gestes en font.
/** @param {Project} project @param {import("../settings-du-project.ts").Cle} cle */
function actionsDuSetting(project, cle) {
  const states = statesDesSettings.get(project.nom) ?? new Map();
  statesDesSettings.set(project.nom, states);
  return {
    etat: states.get(cle),
    /** @param {string | { modele: string, effort: string }} choisi */
    choisir: (choisi) => void states.set(cle, { ...states.get(cle), choisi }),
    /** @param {import("../settings-du-project.ts").ChoiceDeSetting} choice @param {string} dit */
    proposer: (choice, dit) => void proposerUnSetting(project, choice, dit),
    /** @param {string} url */
    ouvrir: (url) => void brigade.ouvrirLaProposition(url),
  };
}

/** @param {Project} project */
function poserLesSettingsDuProject(project) {
  const states = statesDesSettings.get(project.nom) ?? new Map();
  statesDesSettings.set(project.nom, states);
  const options = {
    lecture: settingsLus.get(project.nom),
    etats: states,
    choisir: (/** @type {import("../settings-du-project.ts").Cle} */ cle, /** @type {string | { modele: string, effort: string }} */ choisi) => actionsDuSetting(project, cle).choisir(choisi),
    proposer: (/** @type {import("../settings-du-project.ts").ChoiceDeSetting} */ choice, /** @type {string} */ dit) => void proposerUnSetting(project, choice, dit),
    ouvrir: (/** @type {string} */ url) => void brigade.ouvrirLaProposition(url),
  };
  // Les rangées de l'artboard d'abord ; celles qu'il ne dessine pas suivent, sous le sigle et la couleur.
  for (const [conteneur, groupe] of /** @type {const} */ ([[settingsDuProject, "dessines"], [settingsEnPlus, "en-plus"]])) {
    const pose = poserLesSettings(document, { ...options, groupe });
    conteneur.hidden = pose === null;
    conteneur.replaceChildren(...(pose === null ? [] : [pose]));
  }
}

// Un réglage du projet changé : le changement part par le process principal (settings-du-project.ts), qui attend que le
// runtime du projet ait ouvert la PR. Tant qu'il n'a pas répondu, la rangée dit qu'il s'y met. Ouverte, la PR se dit sous
// la rangée ; refusé, le refus — et le champ revient à la valeur en vigueur, qui ne change pas tant que la PR n'est pas
// mergée.
/** @param {Project} project @param {import("../settings-du-project.ts").ChoiceDeSetting} choice @param {string} dit */
async function proposerUnSetting(project, choice, dit) {
  const states = statesDesSettings.get(project.nom) ?? new Map();
  statesDesSettings.set(project.nom, states);
  if (states.get(choice.cle)?.enCours === true) return;
  states.set(choice.cle, { ...states.get(choice.cle), enCours: true, dit: undefined });
  const reposer = () => {
    if (courant?.nom !== project.nom) return;
    poserLesSettingsDuProject(project);
  };
  reposer();
  /** @type {import("../settings-du-project.ts").RenduDuSetting} */
  let rendu;
  try {
    rendu = (await brigade.proposerUnReglage(project.nom, choice)) ?? { refus: "nothing was proposed: nothing was sent", detail: SANS_PONT };
  } catch (error) {
    rendu = { refus: "nothing was proposed: nothing was sent", detail: error instanceof Error ? error.message : String(error) };
  }
  states.set(choice.cle, { dit: "pr" in rendu ? { ...rendu, valeur: dit } : rendu });
  reposer();
}

// Les tickets ordinaires de cet ordinateur, sous cette machine dans Settings (ticket 1700) : deux lignes — les prendre
// ou non, et combien de cooks à la fois —, ce que ça implique au survol, et, quand la station dit son bac à sable
// indisponible, pourquoi ce poste n'en prend aucun, sous la première. Le process principal décide du bloc
// (ordinaires.ts) : hors d'un Mac, il n'est pas réglable, et rien ne se pose.
let ordinairesRefuses = { projet: "", refus: "" };
// Ce qui est posé : une lecture qui n'a rien changé ne le repose pas — le chef peut être en train d'écrire la limite.
let ordinairesPose = "";
/** @param {Project} project */
async function poserOrdinaires(project) {
  const recu = await brigade.ordinaires(project.nom);
  // L'onglet Stations dit l'option sur la station de ce poste (ticket 2488), et le bac à sable de la station locale le
  // même (ticket 2489).
  ordinairesVus.set(project.nom, recu);
  const locale = stationLocaleLue.projet === project.nom && JSON.stringify(stationLocaleLue.ordinaires) !== JSON.stringify(recu ?? null);
  if (locale) stationLocaleLue.ordinaires = recu ?? null;
  // Le chef a pu ouvrir un autre projet pendant la lecture.
  if (courant?.nom !== project.nom) return;
  if (locale) reposerLaStationLocale(stationLocaleLue);
  else reposerLOngletStations();
  // Hors d'un Mac, ils ne se règlent pas : il n'y a rien à poser — le groupe dit qu'il n'a rien à régler.
  if (recu === undefined || recu.reglable === false) {
    ordinaires.hidden = true;
    ordinairesPose = "";
    ordinaires.replaceChildren();
    return poserLesGroupes();
  }
  if (ordinairesRefuses.projet !== project.nom) ordinairesRefuses = { projet: "", refus: "" };
  const pose = JSON.stringify([project.nom, recu, ordinairesRefuses.refus]);
  if (pose === ordinairesPose) return;
  ordinairesPose = pose;
  ordinaires.ariaLabel = `Ordinary tickets on ${WORKSTATION.nom}`;
  ordinaires.hidden = false;
  const limit = document.createElement("input");
  limit.type = "number";
  limit.min = "1";
  limit.step = "1";
  limit.value = recu.limite === null ? "" : String(recu.limite);
  limit.ariaLabel = `Cooks ${WORKSTATION.nom} runs at once`;
  const regler = async (/** @type {boolean} */ taking) => {
    const voulue = limit.value.trim() === "" ? null : Number(limit.value);
    const refusal = await brigade.reglerOrdinaires(project.nom, taking, voulue);
    ordinairesRefuses = { projet: project.nom, refus: refusal ?? "" };
    ordinairesPose = "";
    if (courant?.nom === project.nom) void poserOrdinaires(project);
  };
  const option = switchDeLApp(
    document,
    { texte: recu.actif ? "on" : "off", allume: recu.actif, libelle: `Take the ordinary tickets on ${WORKSTATION.nom}` },
    (taking) => void regler(taking),
  );
  limit.addEventListener("change", () => void regler(option.ariaChecked === "true"));
  // Ce que l'option implique est au survol de sa valeur ; un bac à sable indisponible, sous sa ligne.
  // Leur niveau, celui de la table (niveaux.js) : le groupe le dit, l'étiquette reste sur la ligne.
  const prendre = rangeeDeSetting("ordinary tickets", [bloc("span", recu.actif ? "taken" : "not taken"), survol(document, recu.explication)], [option], [...refusalDeSetting(recu.indisponible ?? ""), ...refusalDeSetting(ordinairesRefuses.refus)], { cle: "ordinaires", niveau: niveauDe(document, "ordinaires") });
  const combien = rangeeDeSetting("cooks at once", [bloc("span", recu.limite === null ? "no limit" : String(recu.limite))], [limit], [], { cle: "ordinaires", niveau: niveauDe(document, "ordinaires") });
  ordinaires.replaceChildren(prendre, combien);
  poserLesGroupes();
}

/** @param {Project} project */
async function lireRetrait(project) {
  poserRetrait(project, await brigade.retrait(project.nom));
}

// Ce que l'app dit d'un projet qu'elle vient de retirer de sa liste : il n'a plus d'espace
// où le dire, c'est donc dit par-dessus l'écran, jusqu'à ce que le chef l'ait lu.
/** @param {import("../retrait.ts").Opinion} dit */
function poserOpinion(dit) {
  opinion.replaceChildren(bloc("strong", dit.titre), ...dit.lignes.map((line) => bloc("p", line)), button("Got it", () => (opinion.hidden = true)));
  opinion.hidden = false;
}

// Le « yes » : le projet quitte l'app, et rien ne part vers sa station. Retiré, il a déjà quitté la barre par
// `surConfiguration` ; refusé, la raison se lit sous sa ligne.
/** @param {Project} project */
async function retirerDeLApp(project) {
  const rendu = await brigade.retirerDeLApp(project.nom);
  retraitDeLApp = "";
  if ("avis" in rendu) return poserOpinion(rendu.avis);
  nonRetire = { projet: project.nom, refus: rendu.refus };
  await lireRetrait(project);
}

// Le ton de chaque état de pilotage : pilotable, vert ; joint sans l'être plus — plus pilotable,
// inconnu de la box, sans le droit, une commande ou le bon node qui manque —, jaune ; pas joint,
// rouge. Ce sont les mots que `rendre` pose déjà : rien n'est déduit de plus.
/** @type {Record<string, string>} */
const TONS_DE_PILOTAGE = { pilotable: "vert", "plus-pilotable": "jaune", inconnu: "jaune", "sans-droit": "jaune", "commande-manque": "jaune", "node-inapte": "jaune", "pas-joint": "rouge" };

// Un mot d'état et sa pastille. La couleur est celle que le mot a dans la liste
// fermée, et sa forme celle de son ton ; un mot qui n'y est pas s'affiche tel quel,
// pastille vide. Le mot reste dit par le texte voisin — et ici par le titre.
/** @param {string} word @param {string | undefined} ton */
function pill(word, ton) {
  const cree = marqueDePill(document, ton);
  cree.title = word;
  return cree;
}

// La pastille d'un projet dans la barre : son état, lu. Sans faits, elle ne
// prend aucune couleur — elle dit, au survol, ce que l'app a obtenu à la place.
/** @param {string} name */
function marquerPill(name) {
  const posee = pastilles.get(name);
  if (posee === undefined) return;
  const tenu = tenus.get(name);
  delete posee.dataset.ton;
  delete posee.dataset.forme;
  posee.dataset.lu = tenu === undefined ? "en-cours" : "tableau" in tenu ? "oui" : "non";
  if (tenu !== undefined && "tableau" in tenu && tenu.tableau.ton !== undefined) {
    posee.dataset.ton = tenu.tableau.ton;
    const forme = formeDe(tenu.tableau.ton);
    if (forme !== undefined) posee.dataset.forme = forme;
  }
  // La box ne répond pas : un mot, le même que la bande (alerts.ts) — ce que le dernier rail disait n'est plus lu.
  const muette = signaux.get(name)?.etat === "injoignable";
  if (muette) {
    delete posee.dataset.ton;
    delete posee.dataset.forme;
    posee.dataset.lu = "non";
  }
  const outsideLine = outsideLines.get(name);
  const dit = muette
    ? "unreachable"
    : outsideLine !== undefined
      ? `offline since ${heureCourte(outsideLine)}${tenu !== undefined && "tableau" in tenu ? ` — ${tenu.tableau.mot ?? tenu.tableau.etat} when last read` : ""}`
      : tenu === undefined
        ? "first read in progress…"
        : "tableau" in tenu
          ? (tenu.tableau.mot ?? tenu.tableau.etat)
          : `no facts read — ${tenu.titre}`;
  posee.textContent = muette || (tenu !== undefined && !("tableau" in tenu)) ? "!" : "";
  const entree = /** @type {HTMLElement} */ (posee.parentElement);
  entree.title = `${name} — ${dit}`;
  entree.ariaLabel = entree.title;
}

// Le signal d'un projet sur sa case : l'urgence — toute sa cuisine attend le chef —, une alerte, ou
// « non vérifié » — jamais rien de plus sain que ce que la bande a dit. L'urgence n'est pas une
// alerte de plus : elle a son signe et sa marque. Le projet affiché n'en porte pas : sa bande est sous ses yeux.
// Cliquer le signal ouvre l'espace du projet : sa bande y est en tête, chaque alerte avec son geste
// et son prix, la plus grave d'abord (alerts.ts) — rien à chercher, un clic de plus lance le geste.
/** @param {string} name */
function marquerSignal(name) {
  const entree = pastilles.get(name)?.parentElement;
  if (entree === null || entree === undefined) return;
  const signal = courant?.nom === name ? undefined : signaux.get(name);
  const pose = signalees.get(name);
  if (signal === undefined) {
    pose?.remove();
    signalees.delete(name);
    return;
  }
  const marque = pose ?? document.createElement("span");
  marque.className = "signal";
  marque.dataset.etat = signal.etat;
  marque.textContent = signal.etat === "urgence" ? "!!" : signal.etat === "alerte" ? "!" : signal.etat === "injoignable" ? "×" : "?";
  marque.title =
    signal.etat === "injoignable"
      ? `${name}: unreachable — ${signal.dit}. Click to open ${name}: its last reading is kept, with the gesture to try again`
      : signal.etat === "urgence"
          ? `${name}: ${signal.dit} — urgent: the whole kitchen is waiting for you, nothing cooks until you act. Click to open ${name}, with what it waits for and since when`
        : signal.etat === "alerte"
          ? `${name}: ${signal.dit} — alert: something needs doing. Click to open ${name}, with the alert, its action and its price`
          : `${name}: ${signal.dit} — not verified: the app could not read this state, it is not a failure. Click to open ${name}, with what could not be read`;
  marque.ariaLabel = marque.title;
  if (pose === undefined) {
    marque.addEventListener("click", (event) => {
      event.stopPropagation();
      const project = configuration.projets.find((candidat) => candidat.nom === name);
      if (project !== undefined) void ouvrir(project);
    });
    entree.append(marque);
    signalees.set(name, marque);
  }
}

// Le signe d'un cook coincé — sans progrès depuis la moitié de son bail —, tel que `status` l'écrit en tête du bail de
// son ticket (slip.ts) : « STUCK: no progress since 31 min ». Le reste du bail est dans la fiche.
/** @param {import("../facts.ts").Card} carte */
function stuckDit({ dit }) {
  const lease = dit.find(({ libelle }) => libelle === "lease")?.valeur;
  return lease !== undefined && /^(?:STUCK: |COINC[EÉ] : )/.test(lease) ? lease.replace(/, (?:lease|bail) .*$/, "") : undefined;
}

const SANS_COOK = "Taken, no cook running";

// Une carte du rail : son numéro, son état, son titre, puis une phrase en mots simples qui dit ce
// qui se passe et, au plus, une ligne de signal (line-card.ts) ; un petit repère quand la file ne
// dit pas tout. Ce que la file dit du ticket en plus est dans sa fiche (`poserDetailsDeFiche`). Dans
// T'attend, la phrase est ce qu'on attend du chef, et son geste — une demande au second — est sur la
// fiche. Dans Livré, la phrase porte l'heure et le résumé ; ses captures restent sur la carte.
// Tout est déjà rangé par le process principal (facts.ts, slip.ts) : la vue pose. Le
// numéro s'ouvre sur l'issue : l'adresse reste au process principal, la vue nomme le ticket.
/** @param {Project} project @param {import("../facts.ts").Card} cardItem @param {import("./composants/pill/pill.js").State} [stateDeColonne] l'état de sa colonne : un même état se dit partout par la même pastille, quel que soit le mot de la file @param {boolean} [avecStation] la station s'étiquette (Taken et Pass d'un projet à plusieurs stations ; jamais sur Cooks, où son bloc la nomme) @param {boolean} [outsideColonne] une carte d'aucune des six colonnes : son mot est dit tel quel, sans l'état d'une colonne @param {boolean} [cuit] un agent y travaille en ce moment, d'une lecture qui le dit encore vrai : la poêle (ticket 2984) */
function renderSlip(project, cardItem, stateDeColonne, avecStation = false, outsideColonne = false, cuit = false) {
  const { ticket, etat: state, mot: wordDState, ton, titre, ouvrable, attendu, attend: awaiting, pr } = cardItem;
  // Le bon et sa tête (composants/slip) ; sur une carte qui attend le chef, la carte d'attente (composants/card-wait), qui
  // ajoute à la tête la pastille « awaiting you » : elle le dit en mots, pour qui ne lit pas la couleur de la colonne. Le
  // mot de la pastille est celui de la table de slip.ts, posé par le process principal.
  const numero = ouvrable ? cliquable(`#${ticket}`, () => void ouvrirIssue(project, ticket)) : bloc("span", `#${ticket}`);
  numero.className = "ticket mono";
  numero.title = ouvrable
    ? `open issue #${ticket} in the browser`
    : state === undefined
      ? `this ticket is not on the rail that ${gesture(project, "facts")} returns: the app does not have its address`
      : "the address the station returned for this ticket is not https: the app does not open it";
  const pose = { numero, hors: outsideColonne, ...(state === undefined ? {} : { mot: wordDState ?? state, ...(outsideColonne ? {} : { etat: stateDeColonne ?? stateDuTon(ton) }) }) };
  // Une carte qui attend un autre humain (« Awaiting others ») garde la carte d'attente, sans dire qu'elle t'attend (ticket 3071).
  // Parked pour le chef, elle l'attend (tickets 4238, 4261) ; une relance passée ne la lui rend pas.
  const slip = attendu || estRed(cardItem) ? cardWait(document, { ...pose, attendu: cardItem.qui === undefined }) : slipDeLaFamille(document, pose);
  slip.dataset.ticket = String(ticket);
  // Un clic sur la carte, quelle que soit sa colonne, ouvre sa fiche par-dessus le rail. Ce qui s'y
  // clique déjà — son numéro, sa PR, ses remarques — garde son geste ; un texte
  // qu'on y sélectionne pour le recopier n'ouvre rien. Au clavier, Entrée ou Espace sur la carte.
  slip.tabIndex = 0;
  slip.addEventListener("click", (event) => {
    const cible = /** @type {Element | null | undefined} */ (event.target);
    if (cible?.closest?.("button, a, summary, input, textarea, select, form") || String(globalThis.getSelection?.() ?? "") !== "") return;
    openCard(project, cardItem, slip);
  });
  slip.addEventListener("keydown", (event) => {
    if ((event.target ?? slip) !== slip || (event.key !== "Enter" && event.key !== " ")) return;
    event.preventDefault();
    openCard(project, cardItem, slip);
  });
  const tete = teteDuSlip(slip);
  // Dans Taken et Pass : depuis quand la carte y est ; bien plus longtemps que d'ordinaire, elle tranche (ticket 1811).
  if (cardItem.age !== undefined) {
    tete.append(poserAge(document, cardItem.age));
    if (cardItem.age.longue) slip.dataset.traine = "";
    // Plus d'un essai depuis la première prise : un point par essai, à côté de l'âge (ticket 1895).
    if (cardItem.essais !== undefined) tete.append(poserEssais(document, cardItem.essais));
  }
  // Prise plus d'une fois : le rang de son essai en clair, « 3rd try », à côté de ses points (ticket 3923).
  if (cardItem.essai !== undefined) tete.append(poserRangDTrial(document, cardItem.essai));
  // Tuée deux fois par le même garde-fou : la carte le dit, sous sa tête, tant que la box le dit (ticket 3650).
  if (cardItem.garde !== undefined) tete.after(poserGuardRepetee(document, cardItem.garde));
  // Un agent y travaille en ce moment : la poêle grésille au bout de sa tête (ticket 2984).
  if (cuit && cardItem.sansCook !== true) tete.append(pan(document));
  // Une carte que plus aucun cook ne prendra dit en haut pourquoi, en mots simples (ticket 3147) ; ce que la station en a écrit
  // est derrière « details ». Ses trois gestes sont au pied de la carte.
  if (cardItem.refus === undefined) refusalDeCards.delete(`${project.nom}#${ticket}`);
  else {
    slip.dataset.refus = "";
    const { phrase, details } = lineDuRefusal(document, cardItem.ligne ?? "", cardItem.refus.brut);
    tete.after(...(details === undefined ? [phrase] : [phrase, details]));
  }
  // Un ticket au label `sensitive` (ticket 3224) : sa marque, la première de ses étiquettes.
  const etiquettes = cardItem.sensible === true ? marquerSensitive(document, poserEtiquettes(document, cardItem, avecStation)) : poserEtiquettes(document, cardItem, avecStation);
  if (etiquettes !== null) slip.append(etiquettes);
  // Sur le rail, en attente : sa priorité, sous son numéro
  if (cardItem.prio !== undefined) {
    const prio = bloc("span", cardItem.prio);
    prio.className = "prio mono";
    slip.append(prio);
  }
  // Sur le rail, en attente d'autres tickets : « after #N », sous sa priorité (card-wait/)
  const apres = marqueApres(document, cardItem.apres);
  if (apres !== null) slip.append(apres);
  const slipKey = `${project.nom}#${ticket}`;
  // Un ticket que la box ne nomme pas : son titre est lu sur l'issue, une fois. Ce qui n'est pas lu n'est pas écrit.
  if (titre === undefined && ouvrable && !titres.has(slipKey)) void lireTitre(project, ticket);
  const nomme = titre ?? /** @type {{ titre?: string } | undefined} */ (titres.get(slipKey))?.titre;
  if (nomme !== undefined) slip.append(bloc("strong", nomme));
  // Une question du manager — avant de découper une épique, ou qui parque le ticket pour le chef (`chef-todo`, facts.ts,
  // `question`) : la question qu'on me pose, en une ou deux lignes, et qui l'a posée. Répondue, la carte n'est plus ici mais dans WAITING : une lecture qui la disait
  // répondue est relue, la carte revenue — le manager a posé une autre question.
  const interroge = attendu && cardItem.question === true;
  if (interroge && ouvrable && (!questions.has(slipKey) || perimee(questions.get(slipKey)))) void lireQuestion(project, ticket);
  const readBySlip = interroge ? questions.get(slipKey)?.lue : undefined;
  const poseeLa = readBySlip !== undefined && "question" in readBySlip ? readBySlip.question : undefined;
  if (poseeLa !== undefined) {
    const resume = bloc("p", poseeLa.resume);
    resume.className = "question-courte";
    // Qui l'a posée, et quand, est derrière « details » (ticket 3086) : à première vue, la question seule.
    slip.append(resume, detailsDeCard(document, `asked by ${poseeLa.auteur}, ${dateHeure(poseeLa.a)}`));
  }
  // Deux lignes au plus : ce qui se passe, et ce qui demande l'attention. Le reste est dans la fiche.
  // Les captures d'un ticket d'interface livré restent sur sa carte : elles se lisent sans un clic. Celles
  // d'une carte de TODO se posent sous sa question.
  if (cardItem.captures !== undefined && cardItem.todo?.captures === undefined) slip.append(...poserCaptures(project, ticket, cardItem.captures));
  // Une carte de TODO qui dit ce qui se passe (card-todo.js, son résumé) le dit en tête de sa carte : la phrase
  // du bon ne le redit pas. Répondue — envoyée, ou jouée —, elle ne demande plus de répondre : la phrase se tait aussi.
  const vuDeTodo = attendu && cardItem.todo !== undefined ? vuDeLaCard(cardItem.todo, stateDeLaCard(project, ticket, cardItem.todo)).vu : undefined;
  const todoRepondue = vuDeTodo === "attente" || vuDeTodo === "jouee";
  // Le rail d'un projet sur GitHub seul ne donne pas d'activité à la carte (ticket 4076) : tant que son cook travaille, la carte dit
  // ce que sa fiche dit (« writing app/src/slip.ts · 2 min ago »), jamais « no activity yet ».
  const publiees = activitiesPubliees.get(project.nom);
  const cookAuTravail = cardItem.repere === true ? cookDuTicket(publiees, ticket) : undefined;
  const enCours = cookAuTravail === undefined || cookAuTravail.finiLe !== null || cookAuTravail.maintenant === null || publiees === undefined || "sans" in publiees ? undefined : cookAuTravail.maintenant;
  const lineDeCard = enCours === undefined || publiees === undefined || "sans" in publiees ? cardItem.ligne : `${actionDuCook(enCours)} · ${dureeDuCook(Date.parse(publiees.lu) - Date.parse(enCours.depuis))} ago`;
  if (lineDeCard !== undefined && cardItem.refus === undefined && !(attendu && cardItem.todo?.resume !== undefined) && !todoRepondue) {
    const liens = cardItem.miseDeCote?.liens ?? cardItem.liens;
    const phrase = liens === undefined ? bloc("p", lineDeCard) : lineAvecSesNumeros(project, lineDeCard, liens);
    phrase.className = "ligne-carte";
    slip.append(phrase);
  }
  // Une carte parked le dit, dans la colonne où elle attend : qui elle attend, jusqu'à quand (ticket 4238).
  if (cardItem.parque !== undefined) {
    slip.dataset.parque = "";
    slip.append(lineParquee(document, cardItem.parque));
  }
  // Une carte qui porte une livraison dit sa PR : son numéro en lien, ses lignes ajoutées et retirées, son âge (ticket 4051).
  if (cardItem.livraisonLue !== undefined) slip.append(poserLaDelivery(project, ticket, cardItem.livraisonLue));
  // Prise, sans aucun cook qui la cuise ni attente vivante : la carte le dit (ticket 3884).
  if (cardItem.sansCook === true) {
    const sans = bloc("p", SANS_COOK);
    sans.className = "signal";
    sans.dataset.sansCook = "";
    slip.append(sans);
  }
  // Un cook coincé le dit sur sa carte, faute d'un autre signal (ticket 1456) : sur Cooks, ce qui est coincé et depuis
  // quand se lit en tête, sans ouvrir la fiche.
  const signale = cardItem.signal ?? stuckDit(cardItem);
  if (signale !== undefined) {
    const signal = bloc("p", signale);
    signal.className = "signal";
    slip.append(signal);
  }
  // En cuisine : un mot au cook, d'une ligne, sans ouvrir sa session (ticket 4048, word-au-cook/).
  slip.append(...poserLeWordAuCook(document, project.nom, cardItem));
  // Une carte de TODO entrée par la porte du runtime : sa question, ses captures, un bouton par choix et
  // un champ pour répondre dans tes mots — tranchée sur la carte même, sans ouvrir sa fiche.
  if (attendu && cardItem.todo !== undefined) {
    const question = cardItem.todo.question;
    slip.append(...poserLaCardDeTodo(project, ticket, cardItem.todo).map((posee) => holdEnMain(project, ticket, question, slip, posee)));
  }
  // Une carte du chef lue de GitHub (projet GitHub seul, ticket 2221) : sa question se pose comme toute carte de TODO, juste
  // au-dessus, et se répond sur la carte (ticket 2434). Celle d'une issue sans commentaire marqué n'a rien à quoi répondre :
  // son texte le dit, sous la phrase de sa sorte.
  if (attendu && cardItem.chef !== undefined && cardItem.todo === undefined) {
    const duChef = cardDeAnswer(document, { sorte: cardItem.chef.sorte, source: "github" });
    duChef.append(detailsDeCard(document, cardItem.chef.texte));
    slip.append(duChef);
  }
  // Toute autre carte qui t'attend — ni carte de TODO, ni carte mise de côté, qui a la sienne — finit par « ask the second »
  // comme les autres (ticket 3363) : un geste du chef que la carte ne rend pas en carte de TODO se passe au second d'un clic.
  if (attendu && cardItem.todo === undefined && cardItem.refus === undefined) {
    const second = demandesAuSecond.get(slipKey);
    slip.append(rangeeDuSecond(document, ticket, second, () => void demanderAuSecond(project, ticket, () => brigade.passerAuSecond(project.nom, ticket, null))));
  }
  // La file ne dit pas tout : un repère discret, le détail est dans la fiche.
  if (cardItem.repere === true) {
    const repere = bloc("small", "…");
    repere.className = "repere";
    repere.title = "some details are not given: the sheet says which";
    slip.append(repere);
  }
  // Livré : la PR mergée s'ouvre d'un clic. Son adresse reste au process principal, comme celle de l'issue.
  if (pr === true) {
    const ouvre = button("open the merged PR", () => void ouvrirPr(project, ticket));
    ouvre.className = "pr";
    ouvre.title = `open #${ticket}'s merged PR in the browser`;
    slip.append(ouvre);
  }
  // Servi, sa PR mergée : « undo » l'annule d'un clic (undo/, ticket 3274) — jamais d'un projet en lecture seule.
  if (pr === true && readOnlyDe(project) === undefined) slip.append(...poserAnnulation(document, ticket, annulations.get(slipKey) ?? ANNULATION_AU_REPOS, () => void annulerLeServed(project, ticket)));
  if (pr === false) slip.append(bloc("small", "merged PR: the address the station returned is not https, the app does not open it"));
  if (cardItem.refus !== undefined && readOnlyDe(project) === undefined) slip.append(poserLesActionsDuRefusal(project, ticket));
  // En pass ou livrée : « try it » quand le projet dit comment il s'essaie (trial.ts) — sa phrase, sinon.
  if (cardItem.essayable === true) {
    slip.append(
      ...poserLTrial(
        document,
        essaisDeProjects.get(project.nom),
        ticket,
        { essayer: () => void brigade.essayer(project.nom, ticket), arreter: () => void brigade.arreterEssai(project.nom, ticket) },
      ),
    );
  }
  slip.append(...poserActionsDWait(project, cardItem), ...signalerLaCard(project, cardItem));
  return slip;
}

// La ligne d'un ticket mis de côté (ticket 2075) : chacun de ses `#N` que la lecture porte s'ouvre d'un clic, sur son issue
// ou sa PR — l'adresse reste au process principal, comme celle du ticket.
/** @param {Project} project @param {string} line @param {number[]} liens */
function lineAvecSesNumeros(project, line, liens) {
  const phrase = document.createElement("p");
  for (const morceau of line.split(/(#\d+)/)) {
    const numero = /^#\d+$/.test(morceau) ? Number(morceau.slice(1)) : undefined;
    if (numero === undefined || !liens.includes(numero)) {
      if (morceau !== "") phrase.append(morceau);
      continue;
    }
    const ouvre = cliquable(morceau, () => void ouvrirIssue(project, numero));
    ouvre.className = "lien-de-ligne mono";
    ouvre.title = `open #${numero} on GitHub, in the browser`;
    phrase.append(ouvre);
  }
  return phrase;
}

/**
 * La PR d'une carte en pass ou servie : « PR 71 », lien qui l'ouvre, puis `+135 −21` au vert et au rouge de la palette, puis son âge.
 * Ce que GitHub n'a pas donné n'est pas écrit.
 * @param {Project} project @param {number} ticket @param {import("../facts.ts").DeliveryLue} delivery
 */
function poserLaDelivery(project, ticket, delivery) {
  const line = document.createElement("p");
  line.className = "livraison-carte mono";
  const ouvre = /** @type {HTMLAnchorElement} */ (document.createElement("a"));
  ouvre.href = delivery.url;
  ouvre.target = "_blank";
  ouvre.rel = "noopener";
  ouvre.textContent = `PR ${delivery.numero}`;
  ouvre.addEventListener("click", (clic) => {
    clic.stopPropagation();
    if (brigade.ouvrirLien === undefined) return;
    clic.preventDefault();
    void Promise.resolve(brigade.ouvrirLien(project.nom, ticket, delivery.url)).then((ouvert) => {
      if (ouvert === false) window.open(delivery.url, "_blank", "noopener");
    });
  });
  line.append(ouvre);
  if (delivery.lignes !== undefined) {
    const ajoutees = bloc("span", `+${delivery.lignes.ajoutees}`);
    ajoutees.className = "lignes-ajoutees";
    const retirees = bloc("span", `\u2212${delivery.lignes.retirees}`);
    retirees.className = "lignes-retirees";
    line.append(" ", ajoutees, " ", retirees);
  }
  if (delivery.age !== undefined) {
    const age = bloc("span", delivery.age);
    age.className = "age-de-la-pr";
    line.append(" ", age);
  }
  return line;
}

// Les trois gestes d'une carte mise de côté (ticket 3147) : « Relaunch » et « Close as already done » partent sur l'issue
// (actions-refusal.ts) et la carte est relue ; « Ask the second » passe la carte au second, comme toute carte.
/** @param {Project} project @param {number} ticket */
function poserLesActionsDuRefusal(project, ticket) {
  const cle = `${project.nom}#${ticket}`;
  return rangeeDuRefusal(
    document,
    ticket,
    refusalDeCards.get(cle),
    {
      jouer: (id) => void jouerLeRefusal(project, ticket, id),
      demander: () => void demanderAuSecond(project, ticket, () => brigade.passerAuSecond(project.nom, ticket, null)),
    },
    demandesAuSecond.get(cle),
  );
}

/** @param {Project} project @param {number} ticket @param {"relancer" | "clore"} id */
async function jouerLeRefusal(project, ticket, id) {
  const cle = `${project.nom}#${ticket}`;
  if (refusalDeCards.get(cle) !== undefined && "envoi" in /** @type {object} */ (refusalDeCards.get(cle))) return;
  refusalDeCards.set(cle, { envoi: id });
  poserRail(project);
  /** @type {{ envoi: "relancer" | "clore" } | { refus: string } | undefined} */
  let dit;
  try {
    const rendu = await brigade.refus(project.nom, id, ticket);
    if ("fait" in rendu) lireLesFacts();
    else dit = { refus: "refus" in rendu ? rendu.refus : "nothing was changed" };
  } catch (error) {
    dit = { refus: `nothing was changed: ${error instanceof Error ? error.message : String(error)}` };
  }
  if (dit === undefined) refusalDeCards.delete(cle);
  else refusalDeCards.set(cle, dit);
  poserRail(project);
}

// Une carte en panne porte « report to brigade » (ticket 1977) : mise de côté (86), ou remontée parce que la pass n'a
// pas pu la juger — une raison de brigade, pas du code livré. Une livraison rouge, elle, est l'affaire du projet.
/** @param {Project} project @param {import("../facts.ts").Card} cardItem */
function signalerLaCard(project, cardItem) {
  const { ticket, etat: state, decision } = cardItem;
  const nonJugee = decision?.quoi === "remontee" && decision.motif === "unjudged";
  if (state !== "86" && !nonJugee) return [];
  const dit = [nonJugee ? "the pass could not judge it" : "set aside", cardItem.ligne ?? "", cardItem.signal ?? ""].filter((morceau) => morceau !== "").join(" — ");
  return report.poser({ projet: project.nom, reference: { ticket }, panne: `${project.nom}, ticket ${ticket}: ${dit}` });
}

// Les gestes de WAITING d'une carte (facts.ts, `gestes`), sur la carte et sur sa fiche (vue/wait/) : sur une carte de
// TODO, « waiting for… », qui ouvre son formulaire — ce qu'elle attend, dans les mots du chef ; de qui ; le jour de la
// relance, proposé à sept jours ; validé, le geste part, et la carte passe dans WAITING à la lecture qui le voit. Sur une
// carte de WAITING, « resume » et « it arrived, back to the kitchen » : chacun part au clic. Ce qui part se décide dans
// le process principal (wait.ts, vue/wait/wait-github.ts), et « it arrived » dit dessous ce qu'il en est advenu.
/** @param {Project} project @param {import("../facts.ts").Card} cardItem */
function poserActionsDWait(project, cardItem) {
  // En lecture seule (ticket 3163), rien ne met une carte en WAITING ni ne l'en sort.
  if (readOnlyDe(project) !== undefined) return [];
  const { ticket, gestes: actions } = cardItem;
  const cle = `${project.nom}#${ticket}`;
  // Une carte sortie de WAITING n'a plus à dire ce qu'est devenu son « it arrived ».
  if (!actions?.includes("attente-arrivee")) arriveesDeCards.delete(cle);
  const siens = ACTIONS_D_WAIT.filter(({ id }) => actions?.includes(/** @type {never} */ (id)));
  // Le rail et la fiche ouverte de ce ticket montrent le même état.
  const redessiner = () => {
    poserRail(project);
    if (cardOf(project, ticket)) renderCard();
  };
  return poserLesActionsDWait(
    document,
    { ticket, cle, siens, ouvert: formulairesDWait.get(cle), arrivee: arriveesDeCards.get(cle) },
    {
      cliquer: (id) => {
        if (id === "attente-arrivee") return void arriver(project, ticket);
        if (id !== "attente-poser") return void ecrireWait(project, id, ticket);
        formulairesDWait.set(cle, { quoi: "", qui: "", relance: relanceProposee(new Date()) });
        redessiner();
      },
      valider: () => {
        const ouvert = formulairesDWait.get(cle);
        if (ouvert !== undefined) void ecrireWait(project, "attente-poser", ticket, { quoi: ouvert.quoi, qui: ouvert.qui, relance: ouvert.relance });
      },
      renoncer: () => {
        formulairesDWait.delete(cle);
        redessiner();
      },
    },
  );
}

// « It arrived, back to the kitchen » déparque le ticket sur son issue (actions-github.ts, `deparquer`), jamais par une
// commande de la box : la carte dit qu'il est en route, puis qu'il est fait — l'issue au survol — et le rail est relu ;
// refusé, rien n'est parti, et la carte dit pourquoi en une ligne, le détail au survol.
/** @param {Project} project @param {number} ticket */
async function arriver(project, ticket) {
  const cle = `${project.nom}#${ticket}`;
  const avant = arriveesDeCards.get(cle);
  if (avant !== undefined && "envoi" in avant) return;
  nonEcrit = nonEcritSecond = "";
  arriveesDeCards.set(cle, { envoi: true });
  poserRail(project);
  if (cardOf(project, ticket)) renderCard();
  /** @type {{ fait: string, detail: string } | { refus: string, detail: string }} */
  let dite;
  try {
    const rendu = await brigade.attente(project.nom, "attente-arrivee", ticket);
    dite =
      rendu !== undefined && rendu !== null && "fait" in rendu
        ? { fait: rendu.fait, detail: rendu.detail ?? "" }
        : rendu !== undefined && rendu !== null && "refus" in rendu
          ? { refus: rendu.refus, detail: ("detail" in rendu ? rendu.detail : undefined) ?? "" }
          : { refus: SANS_ENVOI, detail: SANS_PONT };
  } catch (error) {
    dite = { refus: SANS_ENVOI, detail: error instanceof Error ? error.message : String(error) };
  }
  arriveesDeCards.set(cle, dite);
  if ("fait" in dite) lireLesFacts();
  poserRail(project);
  if (cardOf(project, ticket)) renderCard();
}

// Park et unpark depuis le TODO du chef (parked/, ticket 4281) : un seul geste pour tout projet, par le geste d'attente du
// pont, qui l'écrit sur l'issue ; parti, la cuisine est relue.
const garerParLePont = parkGesture((project, id, ticket, saisie) => brigade.attente(project, id, ticket, saisie), { lire: () => lireLesFacts() });

// Un geste de WAITING s'écrit sur l'issue (vue/wait/wait-github.ts), jamais par une commande de la box (ticket 4262).
// Parti, le formulaire se referme ; refusé, il reste, et dit pourquoi.
/** @param {Project} project @param {string} id @param {number} ticket @param {{ quoi: string, qui: string, relance: string }} [saisie] */
async function ecrireWait(project, id, ticket, saisie) {
  const cle = `${project.nom}#${ticket}`;
  nonEcrit = nonEcritSecond = "";
  actionRate = undefined;
  /** @type {string | undefined} */
  let refusal;
  /** @type {{ fait: string, detail: string } | undefined} */
  let fait;
  try {
    const rendu = await brigade.attente(project.nom, id, ticket, saisie);
    if (rendu !== undefined && "refus" in rendu) refusal = rendu.refus;
    // Écrit sur GitHub (vue/wait/wait-github.ts) : la lecture suivante montre la carte dans sa colonne.
    else if (rendu !== undefined && "fait" in rendu) {
      fait = { fait: rendu.fait, detail: rendu.detail ?? "" };
      lireLesFacts();
    }
  } catch (error) {
    refusal = `nothing sent: ${error instanceof Error ? error.message : String(error)}`;
  }
  const ouvert = formulairesDWait.get(cle);
  if (saisie !== undefined && ouvert !== undefined && refusal !== undefined) ouvert.refus = refusal;
  else if (saisie !== undefined) formulairesDWait.delete(cle);
  if (refusal !== undefined && saisie === undefined) nonEcritSecond = refusal;
  // « resume » : la carte dit dessous ce qu'il en est, comme pour « it arrived ».
  if (saisie === undefined && (refusal !== undefined || fait !== undefined)) arriveesDeCards.set(cle, fait ?? { refus: refusal ?? "", detail: "" });
  poserRail(project);
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
  const resume = bloc("p", delivery.resume);
  resume.className = "livraison";
  resume.title = `ce que la relecture dit de ce qui a été livré pour #${ticket}, mot pour mot`;
  if (delivery.constats.length === 0) {
    const aucune = bloc("small", delivery.remarques);
    aucune.className = "remarques";
    return [resume, aucune];
  }
  const cle = `${project.nom}#${ticket}`;
  const remarques = document.createElement("details");
  remarques.className = "remarques";
  remarques.open = remarquesDepliees.has(cle);
  remarques.addEventListener("toggle", () => void (remarques.open ? remarquesDepliees.add(cle) : remarquesDepliees.delete(cle)));
  const liste = document.createElement("ol");
  liste.append(
    ...delivery.constats.map(({ gravite, fichier, constat }) => {
      const pose = document.createElement("li");
      if (gravite !== "remarque") pose.append(bloc("strong", gravite));
      if (fichier !== null) pose.append(exact("code", fichier));
      pose.append(bloc("span", constat));
      return pose;
    }),
  );
  remarques.append(bloc("summary", delivery.remarques), liste);
  return [resume, remarques];
}

// Les captures d'un ticket d'interface, sur sa carte (captures.ts) : chaque écran avant et après, côte à
// côte, chacun sous sa légende — lues dès que la carte se pose, sans un clic. Une capture que la
// livraison ne porte pas le dit à sa place ; une livraison qui ne les porte pas toutes le dit en tête, en
// une ligne, où les poser au survol. Un clic sur une image ouvre la fiche, comme le reste de la carte.
/** @param {Project} project @param {number} ticket @param {import("../captures.ts").CapturesDeCard} captures */
function poserCaptures(project, ticket, { ecrans: screens, incomplete }) {
  const poses = [];
  if (incomplete !== undefined) {
    const line = bloc("p", incomplete.ligne);
    line.className = "captures-manquantes";
    line.title = incomplete.detail;
    poses.push(line);
  }
  for (const { ecran: screen, avant, apres } of screens) {
    const paire = document.createElement("div");
    paire.className = "captures";
    paire.append(...[avant, apres].map((capture) => poserCapture(project, ticket, screen, capture)));
    poses.push(paire);
  }
  return poses;
}

/** @param {Project} project @param {number} ticket @param {string} screen @param {import("../captures.ts").Capture} capture */
function poserCapture(project, ticket, screen, capture) {
  const figure = document.createElement("figure");
  figure.dataset.moment = capture.moment;
  const titre = document.createElement("figcaption");
  titre.textContent = capture.legende;
  figure.append(poserImage(project, ticket, screen, capture), titre);
  return figure;
}

// L'image d'une capture, lue une fois par le process principal — ou sa place, qui dit qu'elle manque, se lit ou ne se lit pas.
/** @param {Project} project @param {number} ticket @param {string} screen @param {import("../captures.ts").Capture} capture */
function poserImage(project, ticket, screen, { moment, legende, livree, version }) {
  const cle = `${project.nom}#${ticket}:${screen}:${moment}@${version}`;
  if (livree && !capturesLues.has(cle)) void lireCapture(project, ticket, screen, moment, cle);
  const lue = livree ? capturesLues.get(cle) : undefined;
  if (lue !== undefined && "image" in lue) {
    const image = /** @type {HTMLImageElement} */ (document.createElement("img"));
    image.src = lue.image;
    image.alt = legende;
    image.draggable = false;
    return image;
  }
  const place = bloc("span", !livree ? "missing" : lue === undefined ? "loading…" : "not available");
  place.className = "place";
  if (lue === undefined || !("sans" in lue)) return place;
  // Une capture qui ne se lit pas dit pourquoi en une ligne, et donne le fichier à ouvrir sur GitHub — jamais un « not available » seul.
  place.title = lue.sans;
  const lines = lue.sans.split("\n").map((line) => line.trim()).filter((line) => line !== "");
  const raison = (lines.find((line) => !line.startsWith("$ ") && !line.startsWith("→")) ?? lines[0] ?? "").slice(0, 140);
  place.textContent = `not available — ${raison}`;
  const lien = lue.lien;
  if (lien !== undefined) {
    const ouvre = /** @type {HTMLAnchorElement} */ (document.createElement("a"));
    ouvre.href = lien;
    ouvre.target = "_blank";
    ouvre.rel = "noopener";
    ouvre.textContent = "open the file on GitHub";
    // Un clic ne remonte pas à la carte, qui s'ouvrirait en grand : il ouvre le fichier, par le process principal quand il y en a un.
    ouvre.addEventListener("click", (clic) => {
      clic.stopPropagation();
      if (brigade.ouvrirLien === undefined) return;
      clic.preventDefault();
      // Refusé par le process principal, le lien s'ouvre par la navigation de la page plutôt que de rester mort.
      void Promise.resolve(brigade.ouvrirLien(project.nom, ticket, lien)).then((ouvert) => {
        if (ouvert === false) window.open(lien, "_blank", "noopener");
      });
    });
    place.append(" ", ouvre);
  }
  return place;
}

/** @param {Project} project @param {number} ticket @param {string} screen @param {"avant" | "apres"} moment @param {string} cle */
async function lireCapture(project, ticket, screen, moment, cle) {
  capturesLues.set(cle, undefined);
  try {
    capturesLues.set(cle, (await brigade.lireCapture(project.nom, ticket, screen, moment)) ?? { sans: "the app has nothing to read" });
  } catch (error) {
    capturesLues.set(cle, { sans: error instanceof Error ? error.message : String(error) });
  }
  if (courant?.nom === project.nom && !rail.hidden && tenus.has(project.nom)) poserRail(courant);
  // Une carte ouverte depuis la liste du téléphone pose ses captures aussi (ticket 3185), et son détail en grand (ticket 3212).
  if (vueDesCards.vu === "carte" && vueDesCards.carte.projet === project.nom && vueDesCards.carte.ticket === ticket) poserLesCardsDuChef();
  if (detailOuvert?.projet === project.nom && detailOuvert.ticket === ticket) poserLeDetail();
}

// La fiche d'un ticket, par-dessus le rail : pour l'instant son en-tête — son numéro, son titre
// entier, sa priorité, son issue et sa PR —, chaque ligne telle que la box l'a donnée ou, en
// italique, pourquoi elle ne l'a pas (card.ts) : rien n'est deviné, rien n'est laissé vide. Les
// adresses restent au process principal : un lien nomme le projet et le ticket, comme le numéro
// d'une carte. Sur la fiche d'un ticket qui t'attend, la demande au second, en un clic. Le rail
// reste dessous, tel quel — rien de lui ne se clique au travers — ; la fermer, par son bouton ou
// Échap, le rend où il était, défilé où il l'était.
/** @param {Project} project @param {import("../facts.ts").Card} cardItem @param {HTMLElement} retour */
function openCard(project, cardItem, retour) {
  // Ce que l'issue pose se relit à chaque ouverture : on a pu y répondre, ou le manager reposer.
  questions.delete(`${project.nom}#${cardItem.ticket}`);
  histoires.delete(`${project.nom}#${cardItem.ticket}`);
  situations.delete(`${project.nom}#${cardItem.ticket}`);
  cardsActions.delete(`${project.nom}#${cardItem.ticket}`);
  cardRefusals.delete(`${project.nom}#${cardItem.ticket}`);
  issuesDeCards.delete(`${project.nom}#${cardItem.ticket}`);
  cardConfirmations.delete(`${project.nom}#${cardItem.ticket}`);
  discussions.delete(`${project.nom}#${cardItem.ticket}`);
  envoisDeComment.delete(`${project.nom}#${cardItem.ticket}`);
  demandesAuSecond.delete(`${project.nom}#${cardItem.ticket}`);
  void lireHistoire(project, cardItem);
  ouverte = { projet: project, carte: cardItem, retour };
  void lireDiscussion(project, cardItem.ticket);
  void lireActions(project, cardItem);
  renderCard();
  card.focus();
}

function closeCard() {
  const retour = ouverte?.retour;
  ouverte = undefined;
  renderCard();
  if (retour !== undefined && rail.contains(retour)) retour.focus();
}

// Une nouvelle lecture redessine le rail : la fiche ouverte prend ce qu'elle dit de son ticket — la
// même carte, celle de la même colonne s'il en a deux. Un ticket que la lecture ne porte plus garde
// sa fiche telle qu'elle était ; une fiche qui n'a pas changé n'est pas reposée, et garde le clavier.
/** @param {import("../facts.ts").Card[]} cards @param {Map<import("../facts.ts").Card, HTMLElement>} posees */
function followCard(cards, posees) {
  if (ouverte === undefined) return;
  const { carte: avant } = ouverte;
  const siennes = cards.filter(({ ticket }) => ticket === avant.ticket);
  const fraiche = siennes.find(({ attendu, livraison: delivery }) => attendu === avant.attendu && (delivery === undefined) === (avant.livraison === undefined)) ?? siennes[0];
  if (fraiche === undefined) return;
  ouverte.retour = posees.get(fraiche) ?? ouverte.retour;
  ouverte.carte = fraiche;
  /** @param {import("../facts.ts").Card} posee */
  const dit = (posee) => JSON.stringify([posee.fiche, posee.attend.length > 0, /** @type {{ tests?: unknown }} */ (posee).tests]);
  // Ce qui décide de ses gestes a changé — un geste vient d'agir, ou la cuisine l'a pris : ils sont relus.
  /** @param {import("../facts.ts").Card} posee */
  const decide = (posee) => JSON.stringify([posee.etat, posee.ouvrable, posee.attendu, posee.decision, posee.pr]);
  if (decide(fraiche) !== decide(avant)) void lireActions(ouverte.projet, fraiche);
  if (dit(fraiche) !== dit(avant)) renderCard();
}

// Ce que la file dit du ticket, et que la carte ne porte plus : qui le tient, depuis quand, son bail,
// ce qu'il brûle, ce qui le bloque. Ce qu'elle ne dit pas n'est pas écrit, et la ligne brute de
// `status` n'est nulle part sur la fiche. Pour un
// ticket livré, ce qui a été livré.
/** @param {Project} project @param {import("../facts.ts").Card} cardItem */
function renderCardDetails(project, cardItem) {
  const { ticket, livraison: delivery, dit, moteur: engine } = cardItem;
  const pose = [];
  // Rien n'est dit deux fois : « right now » est dans sa section, et la station où il cuit s'ajoute à qui le tient.
  const cuit = dit.find(({ libelle }) => libelle === "cooks on");
  const dits = dit
    .filter(({ libelle }) => libelle !== "right now" && libelle !== "cooks on")
    .map((fait) => (fait.libelle === "taken by" && cuit !== undefined ? { ...fait, valeur: `${fait.valeur} · ${cuit.valeur}` } : fait));
  if (dits.length > 0) {
    const carried = document.createElement("ul");
    carried.className = "porte";
    carried.append(
      ...dits.map(({ libelle, valeur, exact: recopie }) => {
        const fait = document.createElement("li");
        fait.append(bloc("span", libelle), recopie ? exact("strong", valeur) : bloc("strong", valeur));
        return fait;
      }),
    );
    pose.push(carried);
  }
  if (delivery !== undefined) pose.push(poserEngine(document, engine ?? SANS_ENGINE), ...renderDelivery(project, ticket, delivery));
  if (pose.length === 0) return [];
  const details = document.createElement("section");
  details.className = "details";
  details.ariaLabel = `what the queue says about #${ticket}`;
  details.append(...pose);
  return [details];
}

const issuesOuvertes = new Set();

function renderCard() {
  card.hidden = ouverte === undefined;
  rail.inert = !contenu.hidden || !card.hidden;
  if (ouverte === undefined) return card.replaceChildren();
  const { projet: project, carte: cardItem } = ouverte;
  const { ticket, attend: awaiting } = cardItem;
  const { titre, priorite: priority, issue, pr, attendu, tete: deliveryHead } = cardItem.fiche;
  const fermer = button("close", closeCard, "discret");
  fermer.className = "fermer";
  fermer.title = "close the sheet (Esc): the rail is back as you left it";
  const tete = document.createElement("header");
  tete.append(exact("span", `#${ticket}`), fermer);
  /** @param {import("../card.ts").Line} line */
  const dite = (line) => {
    if ("sans" in line) {
      return lineEmpty(document, line.sans, { classe: "sans", balise: "dd" });
    }
    return line.exact === true ? exact("dd", line.valeur) : bloc("dd", line.valeur);
  };
  /** @param {string} libelle @param {HTMLElement} valeur */
  const rang = (libelle, valeur) => {
    const pose = document.createElement("div");
    pose.append(bloc("dt", libelle), valeur);
    return pose;
  };
  const lines = document.createElement("dl");
  // La priorité se lit et se change dans la barre des gestes, quand elle y est : une seule fois.
  const proposes = cardsActions.get(`${project.nom}#${ticket}`);
  const changeable = Array.isArray(proposes) && proposes.some(({ id }) => id === "priorite");
  lines.append(
    ...(changeable ? [] : [rang("priority", dite(priority))]),
    // L'issue et la PR qui s'ouvrent sont des gestes, posés plus bas avec leur prix ; ici, seulement
    // ce qui ne s'ouvre pas, et pourquoi. Une PR que la box ne donne pas (ticket pas servi) n'a pas de
    // ligne : ce qui n'existe pas encore n'est pas affiché.
    ...(issue === true ? [] : [rang("issue", dite(issue))]),
    ...(pr === undefined || pr === true ? [] : [rang("PR", dite(pr))]),
  );
  // Le titre que la box ne donne pas est celui que l'issue porte, lu par le poste ; à défaut, aucune ligne.
  const lu = /** @type {{ titre?: string } | undefined} */ (titres.get(`${project.nom}#${ticket}`));
  const nomme = "valeur" in titre ? bloc("h3", titre.valeur) : lu?.titre === undefined ? undefined : bloc("h3", lu.titre);
  card.ariaLabel = `the sheet of #${ticket}`;
  // Le popup : un panneau de lecture, posé sur un voile qui laisse voir le rail, atténué.
  const panneau = document.createElement("div");
  panneau.className = "panneau";
  // Ce qu'on attend de toi, en tête, en une phrase : jamais la ligne de la file.
  // Une livraison qui attend son merge : deux lignes — ce qu'elle fait, pourquoi elle attend —, puis
  // ses juges, un fichier par ligne avec ses lignes ajoutées et retirées.
  const juges = document.createElement("ul");
  juges.className = "juges";
  for (const { fichier, ajoutees, retirees } of deliveryHead?.juges ?? []) {
    const line = document.createElement("li");
    line.append(exact("code", fichier), ` +${ajoutees} −${retirees}`);
    juges.append(line);
  }
  const wait =
    deliveryHead !== undefined
      ? [
          ...(deliveryHead.fait === undefined ? [] : [Object.assign(bloc("p", deliveryHead.fait), { className: "fait" })]),
          Object.assign(bloc("p", deliveryHead.pourquoi), { className: "attendu" }),
          ...((deliveryHead.juges.length > 0) ? [juges] : []),
        ]
      : attendu === undefined
        ? []
        : [Object.assign(bloc("p", attendu), { className: "attendu" })];
  // Son cook, tel que sa station le publie (ticket 1846) : ce qu'il fait, ses derniers gestes, sa fin et sa PR. Posé, il
  // dit ce qu'il fait en ce moment : l'histoire ne le redit pas.
  const cook = poserLActivityDuCook(document, { publiees: activitiesPubliees.get(project.nom), ticket, pastille: pill, ouvrirPr: () => void ouvrirPrDuCook(project, ticket) });
  // Dans l'ordre où le chef lit : ce qu'est le ticket, où il en est, ce qu'on attend de lui, ce qu'il peut
  // faire, l'issue (repliée) — puis seulement ce que la cuisine en dit.
  // Les gestes de WAITING de sa carte, sur la fiche aussi (vue/wait/) : « waiting for… » sur une carte de TODO, « resume » et
  // « it arrived » sur une carte de WAITING.
  panneau.append(tete, ...wait, ...(nomme === undefined ? [] : [nomme]), ...(lines.children.length > 0 ? [lines] : []), ...poserActionsDWait(project, cardItem), ...renderCardDetails(project, cardItem), ...poserTestsDeCard(document, /** @type {{ tests?: unknown }} */ (cardItem).tests));
  const suite = [...(cook === null ? [] : [cook]), ...poserHistoire(project, ticket, cardItem, cook !== null)];
  card.replaceChildren(panneau);
  // Un ticket qui t'attend : la question que son issue pose, s'il en pose une — lue à l'ouverture.
  // Répondue, sa carte attend le manager dans WAITING : la fiche la garde, et ce qui y a été répondu.
  // Puis, pour tout ticket, ses gestes — la demande au second en est. Rien n'est envoyé sans un clic.
  if (awaiting.length > 0 || cardItem.repondue !== undefined) {
    const cle = `${project.nom}#${ticket}`;
    if (!questions.has(cle)) void lireQuestion(project, ticket);
    const question = poserQuestion(project, ticket, questions.get(cle) ?? {});
    if (question !== undefined) panneau.append(question);
  }
  panneau.append(renderCardActions(project, cardItem), ...diagramDeCard(project, ticket), repliee(project, ticket), ...suite);
}

// Le diagramme que le corps de l'issue porte, au-dessus d'elle, dépliée ou non ; rien tant qu'elle n'est pas lue.
/** @param {Project} project @param {number} ticket */
function diagramDeCard(project, ticket) {
  const lue = discussions.get(`${project.nom}#${ticket}`);
  const corps = lue === undefined || "sans" in lue ? undefined : lue.messages.find((message) => message.corps === true)?.source;
  return diagramTenu(document, diagrammes, `${project.nom}#${ticket}`, corps, renderCard, rendreAvecMermaid(document));
}

// L'issue et sa discussion, repliées d'un clic sous les gestes ; ouvertes, elles le restent quand la fiche est reposée.
/** @param {Project} project @param {number} ticket */
function repliee(project, ticket) {
  const cle = `${project.nom}#${ticket}`;
  const pli = document.createElement("details");
  pli.className = "issue-repliee";
  pli.open = issuesOuvertes.has(cle);
  pli.addEventListener("toggle", () => void (pli.open ? issuesOuvertes.add(cle) : issuesOuvertes.delete(cle)));
  pli.append(bloc("summary", "the issue and its discussion"), poserDiscussion(project, ticket));
  return pli;
}

// Les gestes de la fiche : ceux qu'il est possible de faire sur ce ticket à cet instant, et seulement
// ceux-là — ce qu'on attend de toi d'abord, le recommandé en tête, puis la table du chef, selon son
// état, et ce qui est branché (card-actions.ts) —, un bouton chacun. Un prix nul n'est dit nulle part ;
// un prix se lit au survol du bouton, et un clic sur un geste qui coûte demande d'abord de le
// confirmer, prix dit en une ligne. Ce que fait un clic se lit à droite, dans le second ; ce qui ne
// part pas se dit sous la liste. Le rail et la fiche suivent la lecture suivante de la box.
/** @param {Project} project @param {import("../facts.ts").Card} cardItem */
function renderCardActions(project, cardItem) {
  const lue = cardItem.fiche.priorite;
  const priorityCourante = "valeur" in lue ? /^prio:([0-9])$/.exec(lue.valeur)?.[1] : undefined;
  const { ticket } = cardItem;
  const cle = `${project.nom}#${ticket}`;
  const section = document.createElement("section");
  section.className = "gestes-fiche";
  section.ariaLabel = `what you can do on #${ticket}`;
  const proposes = cardsActions.get(cle);
  if (proposes === undefined) {
    section.append(bloc("p", READ_DE("what can be done")));
    return section;
  }
  if ("sans" in proposes) {
    section.append(lineError(document, NON_ATTEINT("actions"), proposes.sans));
    return section;
  }
  const issue = issuesDeCards.get(cle);
  const liste = document.createElement("ul");
  // En lecture seule (ticket 3163), la fiche ne garde que ce qui ouvre ou demande au second : rien qui écrive sur l'issue.
  const only = readOnlyDe(project) !== undefined;
  for (const propose of only ? proposes.filter(({ id }) => ACTIONS_DE_CARD_SANS_ECRITURE.has(id)) : proposes) {
    const line = document.createElement("li");
    line.dataset.geste = propose.id;
    line.append(...renderCardAction(project, ticket, propose, issue !== undefined && "envoi" in issue, priorityCourante));
    liste.append(line);
  }
  section.append(liste);
  const queued = proposes.find(({ id }) => id === cardConfirmations.get(cle));
  if (queued !== undefined) {
    const renoncer = () => {
      cardConfirmations.delete(cle);
      if (cardOf(project, ticket)) renderCard();
    };
    const confirmer = () => {
      cardConfirmations.delete(cle);
      void playCardAction(project, ticket, queued.id);
    };
    section.append(confirmationDeAction(document, { titre: `${queued.libelle} — #${ticket}?`, prix: queued.prix, oui: OUI(queued.libelle), non: ANNULER }, { oui: confirmer, non: renoncer }));
  }
  const refusal = cardRefusals.get(cle);
  if (refusal !== undefined) {
    section.append(lineError(document, refusal.dit, refusal.detail, { classe: "refus" }));
  }
  // Ce qui est parti : en route, fait — ce que la station a répondu au survol —, ou écrit dans le second.
  if (issue !== undefined) {
    const dit = bloc("p", "envoi" in issue ? `${issue.envoi}: sent, waiting for the answer…` : "fait" in issue ? issue.fait : "sent to the second: its answer is in the Second tab");
    dit.className = "dit";
    dit.ariaLive = "polite";
    if ("fait" in issue && issue.detail !== "") dit.title = issue.detail;
    section.append(dit);
  }
  return section;
}

// Les gestes de la fiche qui n'écrivent rien sur GitHub (card-actions.ts) : ouvrir l'issue, la PR, la page, ou demander au
// second. Ce sont les seuls d'un projet en lecture seule (ticket 3163).
const ACTIONS_DE_CARD_SANS_ECRITURE = new Set(["issue", "pr", "second", "navigateur"]);

// Ce qu'un geste de la fiche pose : son bouton — recommandé s'il l'est, son prix au survol — et,
// pour la priorité, de quoi la choisir avant. `occupe` : un geste de la fiche attend sa réponse — aucun ne part.
/** @param {Project} project @param {number} ticket @param {import("../card-actions.ts").Propose} propose @param {boolean} occupe @param {string} [courante] la priorité du ticket, `1` à `9` @returns {HTMLElement[]} */
function renderCardAction(project, ticket, propose, occupe, courante) {
  const { id, libelle, prix, recommande, valeurs } = propose;
  const cle = `${project.nom}#${ticket}`;
  /** @param {() => void} gesture @param {string} [aide] */
  const action = (gesture, aide) => {
    const pose = buttonAction(document, libelle, gesture, { recommande: recommande === true, prix });
    if (aide !== undefined) pose.children[0].title = aide;
    if (occupe) pose.children[0].disabled = true;
    return pose;
  };
  switch (id) {
    case "issue":
      return [action(() => void ouvrirIssue(project, ticket), `open issue #${ticket} in the browser`)];
    case "pr":
      return [action(() => void ouvrirPr(project, ticket), `open #${ticket}'s merged PR in the browser`)];
    case "second": {
      const request = action(() => void demander(ticket), `write into the second a request about #${ticket} — nothing is sent: you press Enter`);
      const cible = request.children[0];
      cible.className = recommande === true ? "recommande demander" : "demander";
      cible.dataset.geste = "demande";
      return [request];
    }
    default: {
      // Un geste qui coûte se confirme d'abord : le clic pose la confirmation, prix dit, sous les gestes.
      const jouer = () => {
        if (prix === null) return void playCardAction(project, ticket, id);
        cardConfirmations.set(cle, id);
        cardRefusals.delete(cle);
        issuesDeCards.delete(cle);
        if (cardOf(project, ticket)) renderCard();
      };
      if (valeurs === undefined) return [action(jouer)];
      // La priorité se change d'un geste : choisir une valeur la joue, sans second bouton.
      const choice = /** @type {HTMLSelectElement} */ (document.createElement("select"));
      choice.ariaLabel = libelle;
      choice.className = "priorite";
      choice.title = `${libelle} — choosing a value changes the \`prio:\` label of issue #${ticket}`;
      choice.append(...valeurs.map((valeur) => new Option(`priority ${valeur}`, valeur)));
      choice.value = courante ?? "none";
      choice.disabled = occupe;
      choice.addEventListener("change", () => void playCardAction(project, ticket, id, choice.value));
      return [choice];
    }
  }
}

// Les gestes de la fiche de cette carte, demandés au process principal. Une réponse qui n'est plus
// celle de la carte ouverte — la lecture l'a changée entre-temps — ne se pose pas.
/** @param {Project} project @param {import("../facts.ts").Card} cardItem */
async function lireActions(project, cardItem) {
  const { ticket, etat: state, ouvrable, attendu, decision, pr } = cardItem;
  /** @type {import("../card-actions.ts").Propose[] | { sans: string }} */
  let lus;
  try {
    lus = (await brigade.gestesDeFiche({ ticket, ...(state === undefined ? {} : { etat: state }), ouvrable, attendu, ...(decision === undefined ? {} : { decision }), ...(pr === undefined ? {} : { pr }) })) ?? [];
  } catch (error) {
    lus = { sans: `what can be done was not read: ${error instanceof Error ? error.message : String(error)}` };
  }
  if (!cardOf(project, ticket) || ouverte?.carte !== cardItem) return;
  cardsActions.set(`${project.nom}#${ticket}`, lus);
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
/** @param {Project} project @param {number} ticket @param {string} id @param {string} [valeur] */
async function playCardAction(project, ticket, id, valeur) {
  const cle = `${project.nom}#${ticket}`;
  const avant = issuesDeCards.get(cle);
  if (avant !== undefined && "envoi" in avant) return;
  nonEcrit = nonEcritSecond = "";
  actionRate = undefined;
  cardRefusals.delete(cle);
  const proposes = cardsActions.get(cle);
  issuesDeCards.set(cle, { envoi: (Array.isArray(proposes) ? proposes.find((propose) => propose.id === id)?.libelle : undefined) ?? id });
  if (cardOf(project, ticket)) renderCard();
  try {
    const rendu = await brigade.gesteDeFiche(project.nom, id, ticket, valeur);
    issuesDeCards.delete(cle);
    // Un pont qui ne porte pas l'action ne rend rien : rien n'est parti, et la fiche le dit.
    if (rendu === undefined || rendu === null) cardRefusals.set(cle, { dit: SANS_ENVOI, detail: SANS_PONT });
    else if ("refus" in rendu) cardRefusals.set(cle, { dit: rendu.refus, detail: rendu.detail ?? "" });
    else if ("fait" in rendu) {
      issuesDeCards.set(cle, { fait: rendu.fait, detail: rendu.detail ?? "" });
      if (id === "priorite") prioritesChoisies.delete(cle);
      lireLesFacts();
    } else {
      garder(project.nom, rendu);
      if (etroit()) issuesDeCards.set(cle, { second: true });
      if (id === "priorite") prioritesChoisies.delete(cle);
    }
  } catch (error) {
    issuesDeCards.delete(cle);
    cardRefusals.set(cle, { dit: SANS_ENVOI, detail: error instanceof Error ? error.message : String(error) });
  }
  if (cardOf(project, ticket)) renderCard();
  show();
}
// Ce que la fiche dit de la vie du ticket : ce que son cook fait en ce moment ou ce qui le bloque,
// puis son histoire — chaque étape avec son heure, la relecture en vert ou rouge avec son résumé —
// et son coût. Rien n'est posé qui n'a pas eu lieu ; ce que la box ne communique pas est écrit.
/** @param {Project} project @param {number} ticket @param {import("../facts.ts").Card} cardItem @param {boolean} [cookPose] la section de son cook est posée au-dessus : elle dit déjà ce qu'il fait */
function poserHistoire(project, ticket, cardItem, cookPose = false) {
  /** @type {HTMLElement[]} */
  const posees = [];
  const dite = situations.get(`${project.nom}#${ticket}`);
  if (dite !== undefined && !(cookPose && dite.libelle !== "blocked")) {
    const section = document.createElement("section");
    section.className = "situation";
    section.append(bloc("h4", dite.libelle === "blocked" ? "what blocks it" : dite.libelle === "question" ? "what it asks you" : "right now"), ...dite.lignes.map((line) => bloc("p", line)));
    posees.push(section);
  }
  const histoire = histoires.get(`${project.nom}#${ticket}`);
  const section = document.createElement("section");
  section.className = "histoire";
  section.append(bloc("h4", "history"));
  if (histoire === undefined) section.append(bloc("p", READ_DE("the history")));
  // Une lecture qui manque se dit en une ligne ; ce que la station a répondu, au survol.
  else if ("sans" in histoire) section.append(lineError(document, NON_ATTEINT("history"), histoire.sans));
  else {
    const liste = document.createElement("ol");
    for (const { libelle, at, ton, detail } of histoire.etapes) {
      const line = document.createElement("li");
      if (ton !== undefined) line.dataset.ton = ton;
      line.append(bloc("span", libelle), exact("time", at));
      if (detail !== undefined) line.append(bloc("p", detail));
      liste.append(line);
    }
    const cost = document.createElement("dl");
    /** @param {string} libelle @param {string} valeur */
    const rangCost = (libelle, valeur) => {
      const pose = document.createElement("div");
      const dd = valeur === "not communicated" ? lineEmpty(document, valeur, { classe: "sans", balise: "dd" }) : bloc("dd", valeur);
      pose.append(bloc("dt", libelle), dd);
      return pose;
    };
    cost.append(rangCost("tokens", histoire.cout.tokens), rangCost("duration", histoire.cout.duree), rangCost("attempts", histoire.cout.essais));
    const { tokens, duree, essais } = histoire.cout;
    const connu = [tokens, duree, essais].some((valeur) => valeur !== "not communicated");
    section.append(liste);
    // Un coût que la box ne communique pas n'est pas écrit : ni titre, ni trois lignes vides.
    if (connu) section.append(bloc("h4", "cost"), cost);
    if (connu && histoire.cout.minimum) {
      section.append(lineEmpty(document, "at least: a cook has not declared what it spent", { classe: "sans" }));
    }
  }
  posees.push(section);
  // Une rétro que la box ne rend pas n'est pas écrite : une section en échec n'apprend rien au chef.
  if (histoire !== undefined && !("sans" in histoire) && !("sans" in histoire.retro)) posees.push(poserRetro(ticket, histoire.retro));
  return posees;
}

// La rétro du ticket servi : les leçons qu'elle a laissées au projet — chacune sa pastille
// « provisional », son sens au survol comme dans ce que les cooks ont appris, son id et son texte —, puis ce
// que son cook a écrit, tel que la box l'a rendu. Sans rétro, une phrase le dit, jamais une section vide.
/** @param {number} ticket @param {import("../histoire.ts").RetroDite} retro */
function poserRetro(ticket, retro) {
  const section = document.createElement("section");
  section.className = "retro";
  section.ariaLabel = `the retro of #${ticket}`;
  section.append(bloc("h4", "retro"));
  /** @param {string} texte */
  const sans = (texte) => Object.assign(bloc("p", texte), { className: "sans" });
  if ("aucune" in retro) {
    section.append(sans(retro.aucune));
    return section;
  }
  // Une lecture qui manque se dit en une ligne ; pourquoi, au survol.
  if ("sans" in retro) {
    section.append(lineError(document, NON_ATTEINT("retro"), retro.sans));
    return section;
  }
  if (retro.texte === null && retro.lecons.length === 0) {
    section.append(sans("served, but its cook wrote no retro"));
    return section;
  }
  if (retro.lecons.length === 0) section.append(sans("no lesson kept from it"));
  else {
    const liste = document.createElement("ul");
    for (const { id, texte, reconfirmee } of retro.lecons) {
      const line = document.createElement("li");
      // La pastille est le déclencheur de son survol, comme dans ce que les cooks ont appris.
      const pill = bloc("span", PROVISOIRE);
      pill.className = "statut";
      pill.tabIndex = 0;
      const dit = bloc("span", texte);
      dit.className = "texte";
      const nomme = bloc("code", id);
      nomme.className = "id mono";
      line.append(survol(document, DIT_PROVISOIRE, pill), nomme, dit);
      if (reconfirmee) {
        const resumption = bloc("span", "reconfirmed");
        resumption.className = "reprise";
        resumption.title = "the retro reconfirms a lesson the project already had";
        line.append(resumption);
      }
      liste.append(line);
    }
    section.append(liste);
  }
  if (retro.texte !== null) section.append(bloc("pre", retro.texte));
  return section;
}

// L'histoire de ce ticket, lue sur sa box par le process principal. Une lecture partie avant une autre ne la remplace pas.
/** @param {Project} project @param {import("../facts.ts").Card} cardItem */
async function lireHistoire(project, cardItem) {
  const { ticket } = cardItem;
  const cle = `${project.nom}#${ticket}`;
  /** @type {import("../histoire.ts").Histoire} */
  let lue;
  try {
    // La carte du chef lue de GitHub (ticket 2434) : la fiche dit sa question.
    const question = cardItem.attendu && cardItem.chef !== undefined ? cardItem.todo?.question : undefined;
    situations.set(cle, await brigade.situation({ ...(cardItem.etat === undefined ? {} : { etat: cardItem.etat }), attend: cardItem.attend, dit: cardItem.dit, ...(question == null ? {} : { question }) }));
    lue = (await brigade.lireHistoire(project.nom, ticket)) ?? { sans: "no station for this project: the app has nothing to read" };
  } catch (error) {
    lue = { sans: `not read: ${error instanceof Error ? error.message : String(error)}` };
  }
  if (!cardOf(project, ticket)) return;
  histoires.set(cle, lue);
  renderCard();
}
// L'issue du ticket et sa discussion, sous ses gestes : le corps, puis chaque commentaire dans
// l'ordre, chacun avec son auteur et sa date, le markdown rendu (markdown.ts) — jamais en HTML :
// chaque texte est posé par `textContent`. Dessous, le champ du commentaire : rien ne part sans un
// clic sur son bouton, inactif tant que le champ est vide ; ce qui n'est pas parti se lit dessous,
// et le texte reste dans le champ.
/** @param {Project} project @param {number} ticket */
function poserDiscussion(project, ticket) {
  const cle = `${project.nom}#${ticket}`;
  const section = document.createElement("section");
  section.className = "discussion";
  section.ariaLabel = `issue #${ticket} and its discussion`;
  const lue = discussions.get(cle);
  if (lue === undefined) {
    section.append(bloc("p", READ_DE(`issue #${ticket}`)));
    return section;
  }
  if ("sans" in lue) {
    section.append(lineError(document, NON_ATTEINT("discussion"), lue.sans));
    return section;
  }
  /** @param {string} url */
  const ouvrir = (url) => void brigade.ouvrirLien(project.nom, ticket, url);
  const fil = document.createElement("ol");
  for (const { auteur, at, blocs, corps } of lue.messages) {
    const message = document.createElement("li");
    if (corps === true) message.className = "corps";
    const tete = document.createElement("header");
    tete.append(bloc("strong", auteur), bloc("span", corps === true ? " opened the issue" : " commented"), exact("time", at));
    const rendu = document.createElement("div");
    rendu.className = "rendu";
    if (blocs.length === 0) {
      rendu.append(lineEmpty(document, corps === true ? "no description" : "nothing visible — only markers GitHub does not show", { classe: "sans" }));
    } else rendu.append(...poserBlocs(blocs, ouvrir));
    message.append(tete, rendu);
    fil.append(message);
  }
  section.append(fil);
  if (!lue.ouverte) {
    section.append(lineEmpty(document, "the issue is closed — a comment still posts on it", { classe: "sans" }));
  }
  section.append(...poserComment(project, ticket));
  return section;
}

// Le champ du commentaire, son bouton et son prix, et ce qu'il est advenu du dernier envoi.
/** @param {Project} project @param {number} ticket @returns {HTMLElement[]} */
function poserComment(project, ticket) {
  // En lecture seule (ticket 3163), aucun commentaire ne se poste d'ici.
  if (readOnlyDe(project) !== undefined) return [];
  const cle = `${project.nom}#${ticket}`;
  const state = envoisDeComment.get(cle);
  const envoi = state !== undefined && "envoi" in state;
  const saisie = /** @type {HTMLTextAreaElement} */ (document.createElement("textarea"));
  saisie.value = commentaires.get(cle) ?? "";
  saisie.rows = 3;
  saisie.ariaLabel = `a comment on issue #${ticket}`;
  saisie.placeholder = "add context to the issue — markdown, as on GitHub";
  saisie.disabled = envoi;
  const poster = button("post this comment", () => void envoyerComment(project, ticket));
  poster.dataset.geste = "commentaire";
  poster.title = `post what you wrote on issue #${ticket}, as a comment, under the station's GitHub account — public on GitHub, read by the manager and the next cook; nothing is spent`;
  poster.disabled = envoi || saisie.value.trim() === "";
  saisie.addEventListener("input", () => {
    commentaires.set(cle, saisie.value);
    poster.disabled = saisie.value.trim() === "";
  });
  // Le même champ, sans le poster : la demande part au second avec ce qu'il y a dedans — vide, elle
  // nomme l'issue seule. Au clic seulement ; rien n'est envoyé, le second l'attend sans Entrée.
  const demandee = demandesAuSecond.get(cle);
  const enRoute = demandee !== undefined && "envoi" in demandee;
  const demander = button("ask the second", () => void demanderAuSecond(project, ticket));
  demander.dataset.geste = "demande-second";
  demander.title = `write into the second a request naming issue #${ticket} and what is in the field — nothing is sent: you press Enter`;
  demander.disabled = enRoute;
  const champ = document.createElement("div");
  champ.className = "commentaire";
  champ.append(saisie, poster, demander);
  /** @type {HTMLElement[]} */
  const poses = [champ];
  if (enRoute) poses.push(bloc("p", "asking the second…"));
  else if (demandee !== undefined && "parti" in demandee) {
    const dit = bloc("p", demandee.parti);
    dit.className = "postee";
    poses.push(dit);
  } else if (demandee !== undefined && "refus" in demandee) {
    poses.push(lineError(document, demandee.refus, "", { classe: "refus" }));
  }
  if (envoi) poses.push(bloc("p", "posting your comment on the issue…"));
  else if (state !== undefined && state.rendu.poste) {
    const workstation = bloc("p", `comment posted on #${ticket} — ${state.rendu.prix}`);
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
async function envoyerComment(project, ticket) {
  const cle = `${project.nom}#${ticket}`;
  const texte = commentaires.get(cle) ?? "";
  const avant = envoisDeComment.get(cle);
  if (texte.trim() === "" || (avant !== undefined && "envoi" in avant)) return;
  envoisDeComment.set(cle, { envoi: true });
  if (cardOf(project, ticket)) renderCard();
  /** @type {import("../discussion.ts").Commente} */
  let rendu;
  try {
    rendu = await brigade.commenter(project.nom, ticket, texte);
  } catch (error) {
    rendu = { poste: false, refus: `nothing was posted: ${error instanceof Error ? error.message : String(error)}` };
  }
  envoisDeComment.set(cle, { rendu });
  // Un texte changé pendant l'envoi n'est pas celui qui est parti : il reste.
  if (rendu.poste && commentaires.get(cle) === texte) commentaires.delete(cle);
  if (cardOf(project, ticket)) renderCard();
  if (rendu.poste) await lireDiscussion(project, ticket);
}

// « ask the second », au clic : le process principal écrit la demande dans le second, sans Entrée. Le champ n'est pas
// vidé. Injoignable, rien n'est écrit, et la fiche dit pourquoi — la carte de TODO aussi. `ecrire` : ce qui part — de la
// fiche par défaut, avec son champ ; d'une carte de TODO, la carte passée au second (ticket 3133, passation-second.ts).
/** @param {Project} project @param {number} ticket @param {() => Promise<Terminal | { refus: string }>} [ecrire] */
async function demanderAuSecond(project, ticket, ecrire = () => brigade.demanderAuSecond(project.nom, ticket, commentaires.get(`${project.nom}#${ticket}`) ?? "")) {
  const cle = `${project.nom}#${ticket}`;
  const avant = demandesAuSecond.get(cle);
  if (avant !== undefined && "envoi" in avant) return;
  lacherLaCardDe(project.nom, ticket);
  const reposer = () => {
    if (cardOf(project, ticket)) renderCard();
    if (courant?.nom === project.nom) poserRail(project);
  };
  demandesAuSecond.set(cle, { envoi: true });
  reposer();
  /** @type {{ envoi: true } | { parti: string } | { refus: string }} */
  let dit;
  try {
    const rendu = await ecrire();
    if ("refus" in rendu) dit = { refus: rendu.refus };
    else {
      garder(project.nom, rendu);
      // Le second dit lui-même si la demande y est : non lancé, ou commande refusée, rien n'est écrit.
      dit = rendu.demandeEcrite === true ? { parti: `request about #${ticket} written in the second, without Enter — it is waiting for your Enter` } : { refus: `nothing was written: ${rendu.note}` };
    }
  } catch (error) {
    dit = { refus: `nothing was written: ${error instanceof Error ? error.message : String(error)}` };
  }
  demandesAuSecond.set(cle, dit);
  reposer();
  show();
}

// L'issue de ce ticket et sa discussion, lues sur sa box par le process principal. Une lecture partie
// avant une autre ne la remplace pas.
/** @param {Project} project @param {number} ticket */
async function lireDiscussion(project, ticket) {
  const cle = `${project.nom}#${ticket}`;
  /** @type {import("../discussion.ts").Discussion} */
  let lue;
  try {
    lue = (await brigade.lireDiscussion(project.nom, ticket)) ?? { sans: "no station for this project: the app has nothing to read" };
  } catch (error) {
    lue = { sans: `not read: ${error instanceof Error ? error.message : String(error)}` };
  }
  if (!cardOf(project, ticket)) return;
  discussions.set(cle, lue);
  renderCard();
}

// Le markdown rendu, bloc par bloc : chaque bloc sa balise, chaque texte par `textContent`.
/** @param {import("../markdown.ts").Bloc[]} blocs @param {(url: string) => void} ouvrir @returns {HTMLElement[]} */
function poserBlocs(blocs, ouvrir) {
  return blocs.map((pose) => {
    if ("titre" in pose) return avec(`h${Math.min(Math.max(pose.titre, 1), 6)}`, poserMots(pose.contenu, ouvrir));
    if ("paragraphe" in pose) return avec("p", poserMots(pose.paragraphe, ouvrir));
    if ("code" in pose) {
      const pre = document.createElement("pre");
      const code = bloc("code", pose.code);
      if (pose.langue !== undefined) code.dataset.langue = pose.langue;
      pre.append(code);
      return pre;
    }
    if ("citation" in pose) return avec("blockquote", poserBlocs(pose.citation, ouvrir));
    if ("liste" in pose) {
      const liste = pose.debut === undefined ? document.createElement("ul") : Object.assign(document.createElement("ol"), { start: pose.debut });
      for (const element of pose.liste) {
        const line = document.createElement("li");
        // Une case de liste de tâches se lit, elle ne se coche pas d'ici.
        if (element.coche !== undefined) line.append(element.coche ? "☑ " : "☐ ");
        line.append(...poserBlocs(element.blocs, ouvrir));
        liste.append(line);
      }
      return liste;
    }
    if ("trait" in pose) return document.createElement("hr");
    if ("tableau" in pose) {
      const tableau = document.createElement("table");
      /** @param {string} balise @param {import("../markdown.ts").Word[][]} rang */
      const line = (balise, rang) => {
        const tr = document.createElement("tr");
        tr.append(...rang.map((cellule) => avec(balise, poserMots(cellule, ouvrir))));
        return tr;
      };
      tableau.append(avec("thead", [line("th", pose.tableau.tete)]), avec("tbody", pose.tableau.lignes.map((rang) => line("td", rang))));
      return tableau;
    }
    const replie = document.createElement("details");
    replie.append(avec("summary", poserMots(pose.replie.resume, ouvrir)), ...poserBlocs(pose.replie.blocs, ouvrir));
    return replie;
  });
}

// Les mots d'une ligne rendue. Un lien ne navigue pas dans l'app : un clic demande au process
// principal de l'ouvrir dans le navigateur — l'adresse se lit au survol.
/** @param {import("../markdown.ts").Word[]} mots @param {(url: string) => void} ouvrir @returns {(HTMLElement | string)[]} */
function poserMots(mots, ouvrir) {
  return mots.map((word) => {
    if ("texte" in word) return word.texte;
    if ("code" in word) return bloc("code", word.code);
    if ("gras" in word) return avec("strong", poserMots(word.gras, ouvrir));
    if ("italique" in word) return avec("em", poserMots(word.italique, ouvrir));
    if ("barre" in word) return avec("del", poserMots(word.barre, ouvrir));
    if ("saut" in word) return document.createElement("br");
    const lien = avec("a", poserMots(word.contenu, ouvrir));
    lien.title = `open ${word.lien} in your browser`;
    lien.tabIndex = 0;
    lien.addEventListener("click", (event) => {
      event.preventDefault();
      ouvrir(word.lien);
    });
    lien.addEventListener("keydown", (event) => {
      if (event.key === "Enter") ouvrir(word.lien);
    });
    return lien;
  });
}

// Un élément et ce qu'il contient.
/** @param {string} balise @param {(HTMLElement | string)[]} contenu */
function avec(balise, contenu) {
  const cree = document.createElement(balise);
  cree.append(...contenu);
  return cree;
}

// La fiche ouverte est-elle celle de ce ticket : ce qui revient pour lui ne se pose que là.
/** @param {Project} project @param {number} ticket */
const cardOf = (project, ticket) => ouverte?.projet.nom === project.nom && ouverte.carte.ticket === ticket;

// La question de ce ticket, lue sur son issue par le process principal (question.ts) : la vue
// nomme le projet et le ticket. Une lecture partie avant une autre ne la remplace pas.
/** @param {Project} project @param {number} ticket */
async function lireQuestion(project, ticket) {
  const cle = `${project.nom}#${ticket}`;
  const enRoute = {};
  questions.set(cle, enRoute);
  /** @type {import("../question.ts").Lue} */
  let lue;
  try {
    // Rien : le bloc `attend` ne nomme plus ce ticket — il n'y a rien à lui demander.
    lue = (await brigade.lireQuestion(project.nom, ticket)) ?? { a: new Date().toISOString(), aucune: true };
  } catch (error) {
    lue = { a: new Date().toISOString(), sans: error instanceof Error ? error.message : String(error) };
  }
  if (questions.get(cle) !== enRoute) return;
  questions.set(cle, { lue, quand: Date.now() });
  if (cardOf(project, ticket)) renderCard();
  // La carte du ticket dit la question en deux lignes : le rail est redessiné de ce qui vient d'être lu —
  // sauf sous une fiche ouverte, dont le rail reste tel qu'il était : la prochaine lecture le met à jour.
  if (!cardOf(project, ticket) && courant?.nom === project.nom && !rail.hidden && tenus.has(project.nom)) poserRail(courant);
}

// Le titre de ce ticket, lu sur son issue par le process principal. À son arrivée le rail est redessiné.
/** @param {Project} project @param {number} ticket */
async function lireTitre(project, ticket) {
  const cle = `${project.nom}#${ticket}`;
  titres.set(cle, undefined);
  try {
    titres.set(cle, (await brigade.lireTitre(project.nom, ticket)) ?? { sans: "no address" });
  } catch (error) {
    titres.set(cle, { sans: error instanceof Error ? error.message : String(error) });
  }
  if (courant?.nom === project.nom && !rail.hidden && tenus.has(project.nom)) poserRail(courant);
}

// La réponse du chef — un choix par sa lettre, ou sa phrase — part sur l'issue : c'est le process
// principal qui la relit et l'écrit (question.ts). Une seule à la fois ; ce qu'il en advient se pose
// sur la fiche, et une question qui a changé entre-temps revient à sa place.
/** @param {Project} project @param {number} ticket @param {{ question: string, vu: string, choix: string } | { question: string, vu: string, texte: string }} answer */
async function repondreQuestion(project, ticket, answer) {
  const cle = `${project.nom}#${ticket}`;
  const avant = questions.get(cle);
  if (avant?.envoi === true) return;
  questions.set(cle, { ...(avant?.lue === undefined ? {} : { lue: avant.lue }), envoi: true });
  if (cardOf(project, ticket)) renderCard();
  /** @type {import("../question.ts").Rendue} */
  let rendue;
  try {
    rendue = await brigade.repondreQuestion(project.nom, ticket, answer);
  } catch (error) {
    rendue = { poste: false, refus: `nothing was posted: ${error instanceof Error ? error.message : String(error)}` };
  }
  const lue = (!rendue.poste ? rendue.lue : undefined) ?? avant?.lue;
  questions.set(cle, { ...(lue === undefined ? {} : { lue }), rendue, quand: Date.now() });
  if (rendue.poste) brouillons.delete(cle);
  if (cardOf(project, ticket)) renderCard();
}

// Sur la fiche d'un ticket qui t'attend, la question que son issue pose : le commentaire du
// manager, mot pour mot — rien n'est reformulé —, ce qui a été écrit dessous depuis, puis la
// réponse : un bouton par choix qu'elle propose, un champ pour une phrase. Un clic sur un choix,
// et il part ; la phrase part par son bouton — Entrée ne l'envoie pas. Rien n'est choisi d'avance.
// Aucune question sur l'issue : rien n'est posé, l'entrée garde son geste.
/** @param {Project} project @param {number} ticket @param {{ lue?: import("../question.ts").Lue, envoi?: boolean, rendue?: import("../question.ts").Rendue, quand?: number }} etat */
function poserQuestion(project, ticket, { lue, envoi, rendue }) {
  if (lue !== undefined && "aucune" in lue) return undefined;
  const section = document.createElement("section");
  section.className = "question";
  if (lue === undefined) {
    section.append(bloc("small", READ_DE(`issue #${ticket}, for the question it asks`)));
    return section;
  }
  if ("sans" in lue) {
    section.append(lineError(document, NON_ATTEINT("question"), lue.sans));
    return section;
  }
  const { question } = lue;
  section.ariaLabel = `the question issue #${ticket} asks`;
  const texte = bloc("blockquote", question.texte);
  texte.title = "the manager's comment on the issue, word for word — only its hidden brigade markers are left out";
  section.append(bloc("h4", "The question, as written on the issue"), texte, bloc("small", `posted by ${question.auteur}, ${dateHeure(question.a)} — issue read at ${heureDe(lue.a)}`));
  if (question.depuis.length > 0) {
    const depuis = document.createElement("ul");
    depuis.className = "depuis";
    depuis.append(
      ...question.depuis.map(({ auteur, a, corps }) => {
        const ecrit = document.createElement("li");
        ecrit.append(bloc("small", `${auteur}, ${dateHeure(a)}`), bloc("p", corps));
        return ecrit;
      }),
    );
    section.append(bloc("small", `written on the issue since — the manager reads it at its next tick:`), depuis);
  }
  if (rendue?.poste === true) {
    const postee = bloc("p", `answer posted on #${ticket}, in your name: “${rendue.corps}” — the manager reads it at its next tick; until then the card waits for it in the Manager column.`);
    postee.className = "postee";
    section.append(postee);
    return section;
  }
  // Répondue sur l'issue — ailleurs, ou avant : la fiche le dit, et la carte n'est plus dans TODO.
  if (question.repondue !== undefined) {
    const repondue = bloc("p", `answered on the issue by ${question.repondue.auteur}, ${dateHeure(question.repondue.a)} — the manager reads it at its next tick; until then the card waits for it in the Manager column.`);
    repondue.className = "repondue";
    section.append(repondue);
  }
  // En lecture seule (ticket 3163), la question se lit, et ne se répond pas d'ici.
  if (readOnlyDe(project) !== undefined) return section;
  // Ce que le chef a vu sous la question : rien ne part si quelque chose y a été écrit depuis.
  const vu = question.depuis.at(-1)?.url ?? "";
  const cle = `${project.nom}#${ticket}`;
  const answer = document.createElement("div");
  answer.className = "reponse";
  for (const { lettre, texte: dit } of question.choix) {
    const choice = button(`${lettre}) ${dit}`, () => void repondreQuestion(project, ticket, { question: question.url, vu, choix: lettre }));
    choice.className = "choix";
    choice.dataset.geste = "reponse";
    choice.title = `post “${lettre}) ${dit}” on issue #${ticket} as your answer — one click, and it is posted`;
    choice.disabled = envoi === true;
    answer.append(choice);
  }
  const saisie = /** @type {HTMLTextAreaElement} */ (document.createElement("textarea"));
  saisie.value = brouillons.get(cle) ?? "";
  saisie.rows = 2;
  saisie.placeholder = question.choix.length > 0 ? "or answer in a sentence" : "your answer, in a sentence";
  saisie.disabled = envoi === true;
  const poster = button("post this answer", () => void repondreQuestion(project, ticket, { question: question.url, vu, texte: saisie.value }));
  poster.dataset.geste = "reponse";
  poster.title = `post what you wrote on issue #${ticket}, in your name`;
  poster.disabled = envoi === true || saisie.value.trim() === "";
  saisie.addEventListener("input", () => {
    brouillons.set(cle, saisie.value);
    poster.disabled = saisie.value.trim() === "";
  });
  const phrase = document.createElement("div");
  phrase.className = "phrase";
  phrase.append(saisie, poster);
  section.append(answer, phrase);
  if (envoi === true) section.append(bloc("small", "posting your answer on the issue…"));
  if (rendue?.poste === false) {
    section.append(lineError(document, rendue.refus, "", { classe: "refus" }));
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
const READ_VIEILLE_MS = 120_000;
/** @param {number | string} a */
function fraicheur(a) {
  const age = Date.now() - new Date(a).getTime();
  if (!(age > READ_VIEILLE_MS)) return [];
  const minutes = Math.floor(age / 60_000);
  const dit = bloc("p", `up to date ${minutes} min ago — the station has not answered since`);
  dit.className = "fraicheur";
  return [dit];
}
// L'âge du rail montré (ticket 2054), au survol de la ligne d'état et du bandeau, jamais une ligne de plus : l'heure où la box a lu
// l'état qu'elle a publié — pas celle où l'app a lu GitHub, qui est toujours récente. Périmé, le signe de fraîcheur le dit à part.
/** @param {string} publishedLe @param {string} lu */
function ageDuRail(publishedLe, lu) {
  const minutes = Math.floor(Math.max(0, Date.parse(lu) - Date.parse(publishedLe)) / 60_000);
  const age = minutes < 1 ? "less than a minute" : minutes < 60 ? `${minutes} min` : `${Math.floor(minutes / 60)} h ${String(minutes % 60).padStart(2, "0")}`;
  return `rail as GitHub said it ${age} ago, at ${heureCourte(publishedLe)} — the box publishes its rail on GitHub, and the app reads it every 30 seconds: this is the age of what the box published, not of the app's reading`;
}
// Le rail gardé d'une lecture ratée en ligne (ticket 2151), à la place de son âge : périmé, l'heure de la lecture montrée et
// son âge en clair (ticket 3008, rail-read-perimee.js). Les détails de la dernière lecture ratée ne s'y écrivent que si
// le panneau est à l'écran.
/** @param {{ depuis: string, raison: string }} perime @param {number | string} lu */
function signePerime({ raison }, lu) {
  const dite = tellLaRead({ reading: true, readAt: lu, stale: true, refusal: { kind: "other" } }, { maintenant: Date.now(), pourquoi: raison, panneauVisible: panneauAFicher() });
  return poserLaRead(document, dite);
}
// Le signe de l'app hors ligne (ticket 1818), à la place de toute erreur.
/** @param {string} depuis */
function signeOutsideLine(depuis) {
  const signe = bloc("p", `offline since ${heureCourte(depuis)}`);
  signe.className = "hors-ligne";
  signe.title = `GitHub cannot be reached from ${CET_ORDINATEUR}: what is shown is the last state the app read. It is read again on its own when the network comes back.`;
  return signe;
}
// Le réseau revient : la lecture n'attend pas son tour.
window.addEventListener?.("online", () => {
  if (outsideLines.size > 0) lireLesFacts();
});

// La box d'un projet ne répond pas (alerts.ts, `injoignable`) : depuis quand, d'après la première
// lecture ratée de la série. Le rail garde alors sa dernière lecture — il n'est plus remplacé par
// « non joint ».
/** @type {Map<string, string>} */
const muets = new Map();
// Les tickets `fire` que GitHub a rendus pour un projet muet, et ceux dont la lecture est en route.
/** @type {Map<string, import("../feu.ts").Feu>} */
const feux = new Map();
/** @type {Set<string>} */
const feuxEnRoute = new Set();
const FEU_VIEUX_MS = 60_000;
/** @param {Project} project */
function chargerFeu(project) {
  const feu = feux.get(project.nom);
  if (feuxEnRoute.has(project.nom) || (feu !== undefined && Date.now() - new Date(feu.a).getTime() < FEU_VIEUX_MS)) return;
  feuxEnRoute.add(project.nom);
  void brigade.lireFeu(project.nom).then((lu) => {
    feuxEnRoute.delete(project.nom);
    // Sans réponse, la lecture est dite faite quand même : sinon le rail, redessiné, la relancerait aussitôt, sans fin.
    feux.set(project.nom, lu ?? { a: new Date().toISOString(), sans: "the app has no answer for this project" });
    if (courant?.nom === project.nom && muets.has(project.nom) && !rail.hidden) poserRail(courant);
  });
}
// La liste des tickets `fire` lus sur GitHub, d'un projet muet : repliée, sous ce qu'elle est. Dépliée, des
// lignes comme celles du reste de la page — un numéro qui ouvre l'issue, son titre, sa priorité.
// Ce que le chef a déplié le reste d'un redessin à l'autre.
/** @type {Set<string>} */
const feuxDeplies = new Set();
/** @param {Project} project */
function poserMuet(project) {
  chargerFeu(project);
  const feu = feux.get(project.nom);
  const liste = document.createElement("details");
  liste.className = "feu";
  liste.open = feuxDeplies.has(project.nom);
  liste.addEventListener("toggle", () => {
    if (liste.open) feuxDeplies.add(project.nom);
    else feuxDeplies.delete(project.nom);
  });
  const nombreDit = feu === undefined || "sans" in feu ? "" : `, ${feu.tickets.length}`;
  liste.append(bloc("summary", feu === undefined ? "the tickets in the kitchen according to GitHub — reading…" : `the tickets in the kitchen according to GitHub${nombreDit}`));
  if (feu === undefined) return [liste];
  if ("sans" in feu) liste.append(bloc("p", "GitHub did not answer either:"), bloc("pre", feu.sans));
  else if (feu.tickets.length === 0) liste.append(bloc("p", "no open ticket labelled `fire`"));
  else {
    const lines = document.createElement("ol");
    lines.append(
      ...feu.tickets.map(({ ticket, titre, prio }) => {
        const line = document.createElement("li");
        const ouvrir = cliquable("", () => void ouvrirIssue(project, ticket));
        ouvrir.title = `open #${ticket} on GitHub`;
        ouvrir.append(exact("span", `#${ticket}`), bloc("span", titre));
        line.append(ouvrir, ...(prio === undefined ? [] : [bloc("small", prio)]));
        return line;
      }),
    );
    liste.append(lines);
  }
  return [liste];
}

// Le rail vieillit sans qu'aucune lecture n'arrive : sa mention se repose d'elle-même.
/** @type {Map<string, number>} */
const attentesDuRail = new Map();
setInterval(() => {
  if (courant !== undefined && (tenus.has(courant.nom) || attentesDuRail.has(courant.nom)) && !rail.hidden) poserRail(courant);
}, 15_000);
// La cuisine du projet, dans le groupe du projet de Settings (ticket 1700) : en marche ou à l'arrêt, et le seul geste
// qui la fait changer — « stop the kitchen », le bouton de danger de la famille (ticket 2916), ou « resume the kitchen ».
// Chacun dit d'abord ce qu'il coûte : rien ne part avant son « oui ».
/** @param {Project} project @param {boolean} arretee */
function poserArreter(project, arretee) {
  // En lecture seule (ticket 3163), la cuisine ne s'arrête ni ne reprend d'ici.
  const gesture = readOnlyDe(project) !== undefined ? undefined : KITCHEN_ACTIONS.find(({ id }) => id === (arretee ? "reprendre" : "stop"));
  stopKitchen.hidden = gesture === undefined;
  sectionKitchen.hidden = gesture === undefined;
  if (gesture === undefined) {
    stopKitchen.replaceChildren();
    return poserLesGroupes();
  }
  const [declencheur, ...dessous] = poserAction(project, { ...gesture, ou: "parametres" });
  if (declencheur !== undefined && !arretee) {
    declencheur.dataset.arret = "";
    sorteDuButton(declencheur, "danger");
  }
  stopKitchen.replaceChildren(rangeeDeSetting("Kitchen", [bloc("span", arretee ? "stopped" : "running")], declencheur === undefined ? [] : [declencheur], dessous));
  poserLesGroupes();
}

// Le petit mot à côté de l'onglet Stations (ticket 3523) : la station du projet et son état — cooking, stopped, paused. Rien tant
// que ce qui le dirait n'est pas lu, ou qu'aucune station ne cuit le projet. Il remplace la barre « Cooks on » de Rail.
/** @param {Project} project @returns {{ dit: string, survol: string } | undefined} */
function etiquetteDeStation(project) {
  const { haut, servantes } = hautDuProject(project, Date.now());
  const nomsDe = servantes.map(({ nom: name }) => name).join(", ");
  const ici = servantes.some((servante) => servante.ici);
  const survol = ici ? `${nomsDe} cooks this project: its kitchen stops when you close the app` : `${nomsDe} cooks this project`;
  if (haut.etat === "cuit") return { dit: `${haut.stations.join(", ")} · cooking`, survol };
  if (haut.etat === "hors-ligne") return { dit: `${haut.station} · ${haut.dit.startsWith("stopped") ? "stopped" : "offline"}`, survol: haut.dit };
  if (haut.etat === "eteint") return { dit: `${nomsDe === "" ? "project" : nomsDe} · paused`, survol: haut.dit };
  if (haut.etat === "deplacement") return { dit: `moving to ${haut.vers}`, survol: haut.attend };
  return undefined;
}
// L'étiquette que l'onglet porte, par projet : une lecture qui la change repose les onglets.
/** @type {Map<string, string | undefined>} */
const etiquettesDeStation = new Map();
/** @param {Project} project */
function reposerLEtiquetteDeStation(project) {
  const dit = etiquetteDeStation(project)?.dit;
  if (etiquettesDeStation.get(project.nom) === dit && etiquettesDeStation.has(project.nom)) return;
  etiquettesDeStation.set(project.nom, dit);
  if (courant?.nom === project.nom) show();
}
// Rien sur le rail : sa colonne dit ce qui est avant lui — elle ne laisse pas croire le projet fini.
/** @param {Project} project */
function railEmpty(project) {
  // Des gestes retenus pour l'OK du chef (ticket 4273) : c'est eux que le rail vide attend.
  return phraseDuRailEmpty({ rail: 0, retenus: retenusDe(retenusDesProjects.get(project.nom)) }) ?? amonts.get(project.nom)?.vide ?? `${PAS_ENCORE("ticket on the rail")} What is before it is being read…`;
}

// La tête du rail, la cuisine oisive avec des cartes dessus (ticket 1863) : une panne, en rouge, au-dessus de tout le
// reste — depuis combien de temps, et combien de cartes, d'une ligne ; les tickets et ce qu'en faire au survol. Elle
// part dès que `facts` ne la porte plus.
/** @param {Project} project @param {import("../facts.ts").Tableau} tableau @returns {HTMLElement[]} */
function outageDuRail(project, { panne: outage }) {
  if (outage === undefined) return [];
  const line = document.createElement("p");
  line.className = "panne-du-rail";
  line.role = "alert";
  line.title = outage.survol;
  const marque = bloc("span", "FAULT");
  marque.className = "marque";
  line.append(marque, bloc("strong", outage.dit), ...report.poser({ projet: project.nom, reference: { ligne: "cook." }, panne: `${project.nom}: ${outage.dit}` }));
  return [line];
}

// Le bouton qui allume le projet, des mots de la ligne de la bande qui le dit éteint (alerts.ts, `BOUTONS_DE_GESTE`).
const ALLUMER_LE_PROJECT = "switch the project on";
// Où l'allumer, au survol de ce qui dit le projet éteint hors de Rail (ticket 3454).
const OU_ALLUMER = "turn it on with its switch, at the top of the space, or with “switch the project on” at the head of the rail";

// La tête du rail, le projet éteint (tickets 906, 1406) : marquée à l'arrêt, d'une ligne courte — rien de
// neuf n'est pris, découpé ni mergé. Les cooks en cours finissent. À côté, le bouton qui l'allume (ticket 3454) :
// le geste de l'interrupteur, `switch on`, dont la confirmation s'ouvre sous la ligne — en lecture seule, aucun.
// Allumé, pas encore lu ou pas lu, rien : l'interrupteur, en tête de l'espace, dit ce qu'il en est.
/** @param {Project} project @returns {HTMLElement[]} */
function teteDuRail(project) {
  const lu = statesDuManager.get(project.nom);
  if (lu === undefined || "sans" in lu || lu.allume) return [];
  const tete = document.createElement("p");
  tete.className = "arret-manager";
  tete.append(pill("off", "gris"), bloc("strong", lu.dit ?? "project off"));
  tete.title = lu.releve;
  if (readOnlyDe(project) !== undefined) return [tete];
  const [allumer, ...confirmation] = poserAction(project, { id: "projet-allumer", libelle: ALLUMER_LE_PROJECT, ou: "tete-du-rail" });
  if (allumer !== undefined) tete.append(allumer);
  return [tete, ...confirmation];
}

// Ce que dit la page d'un projet qui cuit sur cet ordinateur quand la station de cet ordinateur ne tourne pas.
const STATION_ARRETEE = `${CET_ORDINATEUR}'s station is not running`;

// La ligne d'alerte de Rail (ticket 1185), d'après les derniers faits du projet — rien tant que sa box ne répond pas : ce
// qu'ils en disaient n'est plus lu — et ce que la station du projet publie de l'accès à son dépôt et de son refus
// (projets/demande.ts) ; elle ouvre Stations, qui le détaille.
/** @param {Project} project */
function poserCooking(project) {
  const tenu = tenus.get(project.nom);
  const stations = tenu !== undefined && "tableau" in tenu && !muets.has(project.nom) ? tenu.tableau.stations : undefined;
  const vu = projectsVus?.projets.find(({ nom: name }) => name === project.nom);
  const alert = lineDAlert(document, {
    refusee: stations?.lignes.some(({ etat: state }) => state === "refused") ?? false,
    acces: vu?.acces ?? vu?.worktree?.acces ?? null,
    clone: vu?.clone ?? null,
    refus: vu?.refus ?? null,
    ouvrir: () => choisirOnglet(STATIONS),
  });
  const refusal = linesDeRefusal(document, stations?.lignes ?? [], () => choisirOnglet(STATIONS));
  alertDeKitchen.hidden = alert === null && refusal.length === 0;
  alertDeKitchen.replaceChildren(...(alert === null ? [] : [alert]), ...refusal);
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
let enregistreesARelire = true;
// Par projet : les stations dont « Details » est déplié — la lecture suivante le garde déplié.
/** @type {Map<string, Set<string>>} */
const detailsOuverts = new Map();
// La station dont « Stop cooking here » attend son « yes », ou s'écrit — une à la fois.
/** @type {{ projet: string, id: string, enCours: boolean } | undefined} */
let stopRequest;
// Ce que le dernier arrêt a rendu, sous la ligne du haut — refusé, sa raison, son détail au survol.
let stopDitPour = { projet: "", texte: "", refus: false, detail: "" };
// Le déménagement que le chef vient de demander, par projet, tant que les stations n'en publient rien : la ligne du haut le
// suit dès le clic.
/** @type {Map<string, { de: string, vers: string, depuis: number }>} */
const deplacementsDemandes = new Map();
// L'onglet se repose quand un déménagement en route passe sa minute : il dit alors ce qui le bloque.
/** @type {ReturnType<typeof setTimeout> | undefined} */
let minuteDuDeplacement;

// L'onglet n'a que son composant (ticket 3195) : toutes les stations du compte et « + station » sont sur l'accueil. Les
// stations du compte se relisent à chaque ouverture de l'onglet : elles disent celles qui servent le projet.
/** @param {Project} project */
function poserOngletStations(project) {
  if (enregistreesARelire) {
    enregistreesARelire = false;
    void lireLesEnregistrees();
  }
  rail.replaceChildren(ongletDesStations(project));
}

// Ce que `servantesDe` lit d'un projet : sa cuisson, les stations appairées, celles qu'il déclare, et sa station de ce
// poste. L'onglet Stations du projet et la page de chaque station le lisent ici, d'une même façon : un projet n'est sur la
// page d'une station que si l'onglet l'y montre. `lues` : sa cuisson, ses stations sur GitHub, ou celles qu'il déclare —
// l'une suffit pour dire qui le cuit.
/** @param {Project} project @param {number} maintenant */
function readDesServantes(project, maintenant) {
  const tenu = tenus.get(project.nom);
  const cooking = tenu !== undefined && "tableau" in tenu && !muets.has(project.nom) ? tenu.tableau.stations : undefined;
  const stations = stationsVues?.stations ?? [];
  const locale = projectsVus?.locale ?? null;
  const lues = cooking !== undefined || (stationsVues !== undefined && projectsVus !== undefined) || declarees.has(project.nom);
  const lesDeclarees = declarees.get(project.nom)?.declarees ?? [];
  const luLe = tenu === undefined ? Number.NaN : Date.parse(tenu.a);
  // Ce que la liste de la station de cet ordinateur dit du projet (tickets 3399, 3402) : elle fait foi pour sa carte.
  const iciSert = servedParCetOrdinateur(project);
  const base = {
    projet: project.nom,
    lignes: cooking?.lignes ?? [],
    stations,
    declarees: lesDeclarees.map(({ nom: name, distante: remote }) => ({ nom: name, distante: remote })),
    locale,
    ici: project.ici === true,
    maintenant,
    ...(Number.isNaN(luLe) ? {} : { lu: luLe }),
    ...(iciSert === undefined ? {} : { iciSert, hote: WORKSTATION.nom }),
    ...(project.redemarre === undefined ? {} : { redemarre: project.redemarre }),
  };
  return { base, lues, locale, tenu, cuisson: cooking };
}

// Ce que l'onglet Stations dit du projet — qui le cuit, le déménagement suivi, la ligne du haut — d'après ce que l'app a lu :
// l'onglet le pose, et l'étiquette qui le suit (`etiquetteDeStation`) en tire son état.
/** @param {Project} project @param {number} maintenant */
function hautDuProject(project, maintenant) {
  const vuDuProject = projectsVus?.projets.find(({ nom: name }) => name === project.nom);
  const { base, lues, locale, tenu, cuisson: cooking } = readDesServantes(project, maintenant);
  const stations = base.stations;
  const sans = servantesDe(base);
  const deplacement = deplacementSuivi({ publie: vuDuProject?.demenagement, demande: deplacementsDemandes.get(project.nom), servantes: sans, stations });
  if (deplacement === null) deplacementsDemandes.delete(project.nom);
  const servantes = deplacement === null ? sans : servantesDe({ ...base, vers: deplacement.vers });
  // Les tickets `fire` qui attendent : le compteur « rail » de son tableau, lu ; sinon, la ligne n'en dit rien.
  const fire = tenu !== undefined && "tableau" in tenu ? tenu.tableau.compteurs.find(({ libelle }) => libelle === "rail")?.nombre : undefined;
  // Le projet éteint (ticket 3454) : rien n'y cuit, quoi que disent ses stations — la ligne du haut le dit à leur place.
  const manager = statesDuManager.get(project.nom);
  const eteint = manager !== undefined && !("sans" in manager) && !manager.allume ? { dit: manager.dit ?? "project off", releve: manager.releve } : undefined;
  const haut = hautDe({ servantes, deplacement, maintenant, ...(fire === undefined ? {} : { fire }), ...(eteint === undefined ? {} : { eteint }) });
  return { vuDuProjet: vuDuProject, lues, locale, tenu, cuisson: cooking, stations, servantes, deplacement, haut };
}

/** @param {Project} project */
function ongletDesStations(project) {
  const maintenant = Date.now();
  const { vuDuProjet: vuDuProject, lues, locale, tenu, cuisson: cooking, stations, servantes, deplacement, haut } = hautDuProject(project, maintenant);
  clearTimeout(minuteDuDeplacement);
  if (haut.etat === "deplacement" && haut.bloque === null) minuteDuDeplacement = setTimeout(reposerLOngletStations, haut.depuis + UNE_MINUTE_MS - maintenant);

  // Le déménagement de sa cuisine : offert, vers quelles stations, ou pourquoi pas (`deplacementDe`, plus bas).
  const ou = ouCuit(project, kitchenOf(project).stations);
  const enCours = vuDuProject?.demenagement ?? null;
  const deplacable = deplacementDe(project, ou, enCours, stationsVues !== undefined && projectsVus !== undefined);
  const choiceDuMove = choiceDuDeplacement(deplacable.destinations, { locale, ordinateur: estUnOrdinateur });
  // « Choose who cooks it » : l'étape d'ajout d'une station — cet ordinateur d'abord, puis les stations du compte.
  const { ajout: addition } = additionDeStationDe(project);
  const stateDeLAddition = additionDeStation.etatDe(project.nom);
  const read = etroit();
  const sienneIci = laStationLocale();
  const ramenee = haut.etat === "hors-ligne" ? RAMENER(haut.station, haut.sorte !== "box") : haut.etat === "eteint" ? `${haut.releve}\n${OU_ALLUMER}` : "";
  const versIciParDeplacement = deplacable.offert && choiceDuMove.some(({ cle }) => cle === locale);
  const versIci = !read && haut.etat === "hors-ligne" && !haut.ici && (versIciParDeplacement || addition?.donnees.iciOffert === true);
  // Personne ne le cuit : cet ordinateur le sert d'un clic, par sa liste — celle de Settings (ticket 3399).
  const cuireIci = !read && haut.etat === "personne" && addition?.donnees.iciOffert === true;

  /** @type {import("./stations-tab/stations-tab.js").VuDeLOnglet["choix"]} */
  let choice;
  if (!read && demenagement?.projet === project.nom && ou !== undefined) {
    choice = { titre: OU_DEPLACER(project.nom, ou.ici && ou.nom === "" ? WORKSTATION.nom : ou.nom), choix: choiceDuMove, deplacement: true, ...(demenagement.vers === undefined ? {} : { enCours: demenagement.vers }) };
  } else if (!read && addition !== undefined && stateDeLAddition.ouvert) {
    const offerts = choiceDeStation({ ici: addition.donnees.iciOffert, hote: sienneIci?.nom ?? "", stations: addition.donnees.stations, maintenant });
    choice = { titre: servantes.length > 0 ? QUI_D_AUTRE(project.nom) : QUI_CUIT_ONGLET(project.nom), choix: offerts, deplacement: false, ...(stateDeLAddition.enCours === undefined ? {} : { enCours: stateDeLAddition.enCours }), ...(stateDeLAddition.refus === undefined ? {} : { refus: stateDeLAddition.refus }) };
  }

  // Ce que le dernier geste a rendu : l'arrêt d'une station, le déménagement, l'ajout — refusé, sa raison.
  const refusalParElle = enCours !== null && enCours.etape === "refusee" ? `${project.nom} stays on ${enCours.de}: ${enCours.vers} refused to take it over — ${enCours.dit}` : "";
  const dits = [
    ...(stopDitPour.projet === project.nom && stopDitPour.texte !== "" ? [stopDitPour] : []),
    // Un déménagement parti se lit sur la ligne du haut ; refusé, sa raison se dit ici.
    ...(demenagementDitPour.projet === project.nom && demenagementDitPour.refus ? [{ texte: demenagementDitPour.dit, refus: true, detail: demenagementDitPour.detail }] : refusalParElle === "" ? [] : [{ texte: refusalParElle, refus: true, detail: "" }]),
    ...(addition !== undefined && !stateDeLAddition.ouvert && stateDeLAddition.fait !== undefined ? [{ texte: FAIT_DIT(stateDeLAddition, project.nom), refus: false, detail: "" }] : []),
    // La ligne que `status` écrit en tête quand la base rouge est en réparation : elle dit pourquoi rien ne cuit.
    ...(tenu !== undefined && "tableau" in tenu && tenu.tableau.rienNeCuit !== undefined ? [{ texte: tenu.tableau.rienNeCuit, refus: false, detail: "" }] : []),
  ];

  const ouverts = detailsOuverts.get(project.nom) ?? new Set();
  detailsOuverts.set(project.nom, ouverts);
  /** @type {Map<string, any[]>} */
  const details = new Map();
  for (const station of read ? [] : servantes) {
    const { lignes: lines, declaree } = detailsDeLaStation(project, station, cooking?.lignes);
    details.set(cleDe(station), lines);
    // La station où « Cook it on a station that has it » offre une capacité : son « Details » s'ouvre.
    if (capacityOfferte?.projet === project.nom && declaree?.nom === capacityOfferte.nom) {
      ouverts.add(cleDe(station));
      capacityOfferte = undefined;
    }
  }

  const pose = poserLOngletDesStations(
    document,
    {
      projet: project.nom,
      poste: WORKSTATION.nom,
      lues,
      haut,
      ramener: ramenee,
      versIci,
      cuireIci,
      servantes,
      enCuisson: cooking !== undefined && !outsideLines.has(project.nom) && !perimes.has(project.nom) && tenu !== undefined && "tableau" in tenu && !tenu.tableau.arretee,
      ...(choice === undefined ? {} : { choix: choice }),
      ...(dits.length === 0 ? {} : { dit: dits[0] }),
      deplacable: { offert: !read && deplacable.offert, pourquoi: read ? "" : deplacable.pourquoiPas },
      ...(stopRequest?.projet === project.nom ? { arret: { id: stopRequest.id, enCours: stopRequest.enCours } } : {}),
      details,
      ouverts,
      lecture: read,
      quiCuit: addition !== undefined,
      ...(tenu !== undefined && "tableau" in tenu && tenu.tableau.quotaGithub !== undefined ? { quota: tenu.tableau.quotaGithub } : {}),
      ...(standbyVue === undefined ? {} : { veille: standbyVue }),
      ...(stationLocaleLue.projet === project.nom && stationLocaleLue.moteur !== undefined ? { moteurIci: stationLocaleLue.moteur } : {}),
    },
    {
      choisirQuiCuit: () => addition?.gestes.ouvrir(),
      deplacer: () => ouvrirLeChoiceDeMachine(),
      versIci: () => {
        if (versIciParDeplacement && locale !== null && ou !== undefined) {
          demenagement = { projet: project.nom, part: false };
          return void demenager(project, locale, { nomme: sienneIci?.nom ?? WORKSTATION.nom, depuis: ou.nom, garder: false });
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
      choisir: (un) => {
        if (demenagement?.projet === project.nom && ou !== undefined) {
          const station = deplacable.destinations.find(({ id }) => id === un.cle);
          return void demenager(project, un.cle, { nomme: station?.nom ?? un.nom, depuis: ou.ici && ou.nom === "" ? WORKSTATION.nom : ou.nom, garder: un.cle === ou.id });
        }
        if (addition === undefined) return;
        if (un.cle === ICI) return addition.gestes.servirIci();
        const station = addition.donnees.stations.find(({ id }) => id === un.cle);
        if (station !== undefined) addition.gestes.confier(station);
      },
      annuler: () => {
        if (demenagement?.projet === project.nom) {
          fermerDemenagement();
          return reposerLOngletStations();
        }
        addition?.gestes.annuler();
      },
      arreter: (cle) => {
        stopRequest = { projet: project.nom, id: cle, enCours: false };
        stopDitPour = { projet: "", texte: "", refus: false, detail: "" };
        reposerLOngletStations();
      },
      confirmerArret: (cle) => void arreterLaStation(project, servantes.find((station) => cleDe(station) === cle)),
      renoncerArret: () => {
        stopRequest = undefined;
        reposerLOngletStations();
      },
      basculer: (cle, ouvert) => void (ouvert ? ouverts.add(cle) : ouverts.delete(cle)),
    },
  );
  return pose;
}

// « Stop cooking here » : la station ne prend plus les tickets du projet, par le geste que l'app a pour elle
// (project/stations/StopStation.js) — cet ordinateur, par sa liste, et sa sélection si elle le porte ; une station du compte,
// par sa sélection ; une station que le projet déclare, par son retrait (ticket 2914). Aucun de ces gestes : rien ne part,
// la ligne dit pourquoi. Ce que le geste rend est relu : un projet encore servi le dit, le bouton reste.
/** @param {Project} project @param {import("./stations-tab/state.js").Servante | undefined} station */
async function arreterLaStation(project, station) {
  if (station === undefined || stopRequest?.projet !== project.nom || stopRequest.enCours) return;
  const repository = project.depot ?? projectsVus?.projets.find(({ nom: name }) => name === project.nom)?.depot ?? "";
  const lues = enregistreesAbsentes ? undefined : stateDesEnregistrees.stations;
  const enregistree = lues?.state === "listed" ? lues.stations.find(({ id }) => id === station.id) : undefined;
  const lesDeclarees = declarees.get(project.nom)?.declarees ?? [];
  const lue = servedOnes.etat?.lecture;
  const servedIci = lue !== undefined && "depots" in lue ? lue.depots : undefined;
  const declaree = lesDeclarees.find(({ nom: name }) => name === station.nom || name === nameDeTaking(station.nom));
  const gesture = actionDStop(
    {
      projet: project.nom,
      depot: repository,
      station: { nom: station.nom, ici: station.ici },
      ...(servedIci === undefined ? {} : { liste: servedIci }),
      ...(enregistree === undefined ? {} : { selection: { id: enregistree.id, depots: enregistree.selection ?? [] } }),
      ...(declaree === undefined ? {} : { declaree: { nom: declaree.nom, seule: lesDeclarees.length <= 1 } }),
    },
    {
      retirerIci: async (un) => (await brigade.servirUnProjet?.(un, false)) ?? { refus: NON_ATTEINT(`${CET_ORDINATEUR}'s station`) },
      choisir: async (id, depots) => (await brigade.choisirLesProjets?.(id, depots)) ?? { refus: "the app gave no answer" },
      retirerDeclaree: (name) => brigade.changerUneStation(project.nom, name, { retiree: true }),
    },
  );
  if (gesture === undefined || "seule" in gesture) {
    stopRequest = undefined;
    // La seule station que le projet déclare ne se retire pas (stations-declarees.js) : sans elle, aucun cook ne part.
    stopDitPour = { projet: project.nom, texte: gesture === undefined ? SANS_ACTION(station.nom) : `nothing was changed: ${ONLY}`, refus: true, detail: "" };
    return reposerLOngletStations();
  }
  stopRequest.enCours = true;
  reposerLOngletStations();
  const dit = await arreter(gesture);
  stopRequest = undefined;
  stopDitPour = { projet: project.nom, ...dit };
  void servedOnes.lire();
  void lireLesEnregistrees();
  if (courant?.nom === project.nom) reposerLOngletStations();
}

// « Details » d'une station : ses réglages et ses lectures, chacun avec son contrôle. Ceux de cet ordinateur — ses dossiers,
// son bac à sable, sa connexion à Claude (project/stations/StationLocale.js) — ; sa connexion à Claude, pour une autre ; et,
// quand le projet la déclare, combien de cooks elle fait tourner à la fois, ce qu'elle fournit et si elle prend les tickets
// ordinaires (project/stations/StationSettings.js).
/**
 * @param {Project} project @param {import("./stations-tab/state.js").Servante} station @param {readonly import("../cooking.ts").LineDeStation[] | undefined} lines
 * @returns {{ lignes: any[], declaree: import("../service.ts").StationDeclaree | undefined }}
 */
function detailsDeLaStation(project, station, lines) {
  const lue = (stationsVues?.stations ?? []).find(({ id }) => id === station.id);
  const lues = declarees.get(project.nom);
  // Sa déclaration : celle qui porte son nom, ou son nom de prise — une seule carte par station déclarée.
  const declaree = lues?.declarees.find((une) => une.nom === station.nom || une.nom === station.prise || une.nom === nameDeTaking(station.nom));
  const ici = station.ici ? linesDeCetOrdinateur(project) : lue === undefined ? [] : [connectionALaStation(document, lue)];
  // Le plafond du projet sur elle, comme sa box le dit (ticket 1292), et ce qui la sature.
  const caps = homeVu?.plafonds?.[project.nom];
  const cap = caps?.[station.prise ?? station.nom] ?? caps?.[station.nom] ?? caps?.[nameDeTaking(station.nom)];
  return {
    lignes: [...ici, ...(cap === undefined ? [] : capLu(document, cap, { declaree: declaree !== undefined })), ...(declaree === undefined || lues === undefined ? [] : [settingsDeLaStationDeclaree(project, declaree, lues, lines)])],
    declaree,
  };
}

// Les réglages d'une station que le projet déclare (ticket 2488) : ce que le chef y saisit est gardé, par projet puis par
// station ; l'option des tickets ordinaires de ce poste, telle que sa dernière lecture l'a rendue (`poserOrdinaires`).
/** @type {Map<string, Map<string, import("./project/stations/StationSettings.js").Saisie>>} */
const saisiesDesStations = new Map();
/** @type {Map<string, import("../ordinaires.ts").Bloc | undefined>} */
const ordinairesVus = new Map();
/**
 * @param {Project} project @param {import("../service.ts").StationDeclaree} declaree @param {import("../service.ts").StationsLues} lues
 * @param {readonly import("../cooking.ts").LineDeStation[] | undefined} lines
 */
function settingsDeLaStationDeclaree(project, declaree, lues, lines) {
  const saisies = saisiesDesStations.get(project.nom) ?? new Map();
  saisiesDesStations.set(project.nom, saisies);
  const ordinaires = ordinairesVus.get(project.nom);
  // Ce que le dernier changement des tickets ordinaires de ce poste a rendu, sous leur rangée : en route, ou refusé.
  const ordinairesDit = ordinairesEnCours.has(project.nom) ? ORDINAIRES_EN_COURS : ordinairesRefuses.projet === project.nom && ordinairesRefuses.refus !== "" ? { refus: ordinairesRefuses.refus } : undefined;
  // Ses cases : celles qu'elle déclare, celles des autres stations, et ce que cet ordinateur sait déclarer (ticket 1307).
  const saisie = saisieDe(saisies, declaree, lues);
  for (const offerte of choiceDeCapacities(declaree, lues, catalogueDe(project))) if (!saisie.choix.some(({ capacite: capacity }) => capacity === offerte.capacite)) saisie.choix.push(offerte);
  return settingsDeLaStation(document, declaree, saisie, {
    ici: project.ici === true,
    ...(ordinaires === undefined ? {} : { ordinaires }),
    ...(ordinairesDit === undefined ? {} : { ordinairesDit }),
    ...(lines === undefined ? {} : { lignes: lines }),
    gestes: actionsDesSettings(project),
  });
}

// Ce que cet ordinateur sait déclarer — le catalogue de « + station » (ticket 1307) —, lu une fois par projet : les cases
// des capacités de chaque station déclarée l'offrent. Illisible, elles n'offrent que ce que les stations déclarent.
/** @type {Map<string, readonly import("../projects/projects.ts").CapacityDeLaMachine[]>} */
const cataloguesLus = new Map();
/** @param {Project} project */
function catalogueDe(project) {
  const lu = cataloguesLus.get(project.nom);
  if (lu !== undefined) return lu;
  cataloguesLus.set(project.nom, []);
  void defautsDeCetOrdinateur(project.nom).then((defauts) => {
    if ("refus" in defauts || defauts.capacites.length === 0) return;
    cataloguesLus.set(project.nom, defauts.capacites);
    if (courant?.nom === project.nom) reposerLOngletStations();
  });
  return [];
}

// La station de cet ordinateur (ticket 2489, project/stations/StationLocale.js) : ses dossiers, son bac à sable, sa
// connexion à Claude. Lus à l'ouverture de l'onglet, puis toutes les trente secondes tant qu'il se repose ; ses gestes sont
// ceux que l'app avait déjà — le réglage des tickets ordinaires de Settings, le login de la panne de connexion. Ses lignes
// restent posées tant que ce qu'elles montrent ne change pas — le chef peut être en train d'écrire combien de cooks à la
// fois : une relecture ne le lui ôte pas.
const RELECTURE_DE_LA_STATION_LOCALE_MS = 30_000;
/** @typedef {Omit<import("./project/stations/StationLocale.js").StateDeLaStationLocale, "poste" | "projet" | "station"> & { projet: string, a: number, moteur?: string }} LuDeLaStationLocale */
/** @type {LuDeLaStationLocale} */
let stationLocaleLue = { projet: "", a: 0 };
/** @type {any[] | undefined} */
let linesDeLaStationLocalePosees;
let linesDeLaStationLocalePose = "";
// La station de cet ordinateur, telle que GitHub la publie : nulle sur un appareil qui n'en a pas — un téléphone, un poste
// de travail —, indéfinie tant qu'elle n'est pas lue.
function laStationLocale() {
  if (phoneVu !== undefined) return null;
  if (projectsVus === undefined) return undefined;
  const locale = projectsVus.locale ?? null;
  return locale === null ? null : (stationsVues?.stations ?? []).find(({ id }) => id === locale);
}
/** @param {unknown} error */
const rateDit = (error) => (error instanceof Error ? error.message : String(error));
/** @param {LuDeLaStationLocale} lu */
function reposerLaStationLocale(lu) {
  if (stationLocaleLue === lu && courant?.nom === lu.projet && ongletDe(courant) === STATIONS) poserRail(courant);
}
/** @param {Project} project */
function lireLaStationLocale(project) {
  const name = project.nom;
  /** @type {LuDeLaStationLocale} */
  const lu = { projet: name, a: Date.now(), ...(stationLocaleLue.projet === name ? { refusOrdinaires: stationLocaleLue.refusOrdinaires, reglageDit: stationLocaleLue.reglageDit, connexionDite: stationLocaleLue.connexionDite } : {}) };
  stationLocaleLue = lu;
  void Promise.resolve(brigade.dossiersDeLaStation?.(name) ?? { refus: "its folders could not be read", detail: "this app does not read them" }).then(
    (rendu) => (lu.dossiers = rendu),
    (error) => (lu.dossiers = { refus: "its folders could not be read", detail: rateDit(error) }),
  ).then(() => reposerLaStationLocale(lu));
  // Le moteur choisi dans ses réglages (engine/, ticket 3746) — l'abonnement, sans choix gardé : sa carte le dit. Illisible,
  // la carte n'en dit rien ; la page de la station dit pourquoi.
  void Promise.resolve(brigade.lireReglagesDeLaStation?.()).then(
    (lus) => {
      if (lus !== undefined && !("refus" in lus)) lu.moteur = lus.engine ?? ENGINE_PAR_DEFAUT;
    },
    () => undefined,
  ).then(() => reposerLaStationLocale(lu));
  void lireLesOrdinairesLocaux(lu);
}
// Le bac à sable, tel que Settings le lit (ordinaires.ts) : rien, le projet ne cuit pas sur cet ordinateur. La ligne des
// tickets ordinaires d'une station déclarée, sur le même onglet (ticket 2488), suit la même lecture.
/** @param {LuDeLaStationLocale} lu */
async function lireLesOrdinairesLocaux(lu) {
  try {
    const recu = await brigade.ordinaires(lu.projet);
    lu.ordinaires = recu ?? null;
    ordinairesVus.set(lu.projet, recu);
  } catch (error) {
    lu.ordinaires = null;
    lu.refusOrdinaires = `the sandbox could not be read: ${rateDit(error)}`;
  }
  reposerLaStationLocale(lu);
}
/** @param {Project} project @returns {any[]} */
function linesDeCetOrdinateur(project) {
  if (stationLocaleLue.projet !== project.nom || Date.now() - stationLocaleLue.a > RELECTURE_DE_LA_STATION_LOCALE_MS) lireLaStationLocale(project);
  const lu = stationLocaleLue;
  const station = laStationLocale();
  /** @type {import("./project/stations/StationLocale.js").StateDeLaStationLocale} */
  const state = {
    poste: WORKSTATION.nom,
    projet: project.nom,
    station: station == null ? station : { id: station.id, nom: station.nom, max: station.max, pannes: station.pannes },
    ...(lu.dossiers === undefined ? {} : { dossiers: lu.dossiers }),
    ...(lu.ordinaires === undefined ? {} : { ordinaires: lu.ordinaires }),
    ...(lu.refusOrdinaires === undefined ? {} : { refusOrdinaires: lu.refusOrdinaires }),
    ...(lu.reglageDit === undefined ? {} : { reglageDit: lu.reglageDit }),
    ...(lu.connexionDite === undefined ? {} : { connexionDite: lu.connexionDite }),
  };
  const pose = JSON.stringify(state);
  if (linesDeLaStationLocalePosees !== undefined && pose === linesDeLaStationLocalePose) return linesDeLaStationLocalePosees;
  linesDeLaStationLocalePose = pose;
  // Des lignes reposées à l'identique gardent leurs gestes : chacun prend la lecture en cours au moment du clic.
  const creees = linesDeLaStationLocale(document, state, {
    // Le même appel que la ligne des tickets ordinaires de Settings, dès qu'un contrôle change : la rangée dit qu'il est en
    // route, puis son refus se lit sous elle ; le bac à sable se relit, ses contrôles à la valeur en vigueur.
    regler: async (actif, limit, ou) => {
      const avant = stationLocaleLue;
      if (avant.reglageDit !== undefined && "enCours" in avant.reglageDit.dit) return;
      avant.reglageDit = { ou, dit: ORDINAIRES_EN_COURS };
      reposerLaStationLocale(avant);
      /** @type {string | undefined} */
      let refusal;
      try {
        refusal = await brigade.reglerOrdinaires(project.nom, actif, limit);
      } catch (error) {
        refusal = `nothing was written: ${rateDit(error)}`;
      }
      const enCours = stationLocaleLue;
      delete avant.reglageDit;
      if (refusal === undefined || refusal === "") delete enCours.reglageDit;
      else enCours.reglageDit = { ou, dit: { refus: refusal } };
      // Settings se repose sur la valeur écrite à sa prochaine ouverture.
      ordinairesPose = "";
      await lireLesOrdinairesLocaux(enCours);
    },
    seConnecter: async (cle) => {
      if (station == null) return;
      /** @type {string} */
      let dite;
      try {
        const rendu = await brigade.panne(station.id, cle);
        siClaudeManque(rendu);
        dite = "refus" in rendu ? rendu.refus : rendu.fait;
      } catch (error) {
        dite = `nothing was done: ${rateDit(error)}`;
      }
      const enCours = stationLocaleLue;
      enCours.connexionDite = dite;
      reposerLaStationLocale(enCours);
    },
  });
  linesDeLaStationLocalePosees = creees;
  return creees;
}

// Le plan de la cuisine en cinq colonnes — Backlog, le rail en tête, Manager, Cooks, Pass, Served (ticket 4238, kitchen/) —, ce
// qui est parked pour le chef rouge dans la colonne de son étape et dans son TODO (tickets 3458, 4238, 4261), une carte
// parked dans la colonne où elle attend, tel que le process principal l'a rangé (facts.ts) : la vue pose, colonne par
// colonne, au centre de l'espace, partagé entre ses deux onglets (ticket 1184). Rail : ce qui t'attend
// — la file, ce qui est en amont —, puis toutes les colonnes, Cooks et Pass compris, sans rien
// d'exécution sur leurs cartes. Cooks : la carte du projet et ses cooks en cours, et la lecture de `station`. Un projet sans box n'en a
// pas : rien n'est lu de lui. Sans faits, il dit pourquoi il n'est pas dessiné : la carte du panneau
// dit ce qui a été obtenu.
/** @param {Project} project */
function poserRail(project) {
  // Le chef répond sur une carte de TODO (ticket 2151) : rien du rail ne bouge sous ses mains.
  if (garderLaCardEnMain(project)) return;
  // Le haut du rail se replie en quittant le projet, ou son rail pour Stations : rien n'y reste déplié d'une visite à l'autre (tickets 3523, 4354).
  if ((railPoseDe !== undefined && railPoseDe !== project.nom) || ongletDe(project) !== RAIL) for (const name of new Set([project.nom, railPoseDe ?? project.nom])) deplisDuHaut.delete(name);
  poserLeRail(project);
  reposerLEtiquetteDeStation(project);
}
// Le refus du dernier « Start this computer's station », par projet (ticket 3637) : sa raison se dit à côté du bouton.
/** @type {Map<string, string>} */
const demarragesIci = new Map();
/** @param {Project} project */
async function demarrerLaStationIci(project) {
  demarragesIci.delete(project.nom);
  const rendu = await Promise.resolve(brigade.demarrerLaStationIci?.(project.nom)).catch((/** @type {unknown} */ error) => ({ refus: error instanceof Error ? error.message : String(error) }));
  if (rendu !== undefined && typeof rendu.refus === "string") demarragesIci.set(project.nom, rendu.refus);
  if (courant?.nom === project.nom) poserLeRail(project);
}
/** @param {Project} project */
function poserLeRail(project) {
  const tenu = tenus.get(project.nom);
  rail.hidden = false;
  const onglet = ongletDe(project);
  rail.dataset.onglet = [STATIONS, AGENTS].includes(onglet) ? onglet : RAIL;
  rail.ariaLabel = onglet === STATIONS ? "The stations" : onglet === AGENTS ? "The agents" : onglet === KNOW_HOW ? "The know-how" : "The rail";
  // Settings ouvert par-dessus : sa section des plafonds et du closer suit la lecture, comme elle le faisait sur l'onglet
  // (ticket 3014) ; un champ en cours de frappe n'est pas reposé.
  reposerLaSante(project, true);
  // Stations : la liste de ses stations (ticket 2487), et « Add a station » ; les réglages de
  // chacune (ticket 2488) ; la station de cet ordinateur (ticket 2489).
  if (onglet === STATIONS) {
    poserCooking(project);
    const resumption = resumptionDuClavier();
    poserOngletStations(project);
    return rendreLeClavier(resumption);
  }
  // Agents (ticket 4224) : l'onglet tenu par agents/, relu pour un autre projet ; posé une fois, il garde le champ où le chef écrit.
  if (onglet === AGENTS) {
    agentsDuProject.montrer(project.nom);
    if (rail.children[0] !== agentsDuProject.element) rail.replaceChildren(agentsDuProject.element);
    return;
  }
  // Know-how : les entrées du savoir-faire du projet, chacune réécrite ou retirée sur place (ticket 4241, know-how-tab/).
  if (onglet === KNOW_HOW) {
    poserCooking(project);
    const resumption = resumptionDuClavier();
    rail.replaceChildren(poserLeKnowHow(document, project.nom, reposerLeKnowHow(project.nom)));
    return rendreLeClavier(resumption);
  }
  const outsideLine = outsideLines.get(project.nom);
  const perime = perimes.get(project.nom);
  delete rail.dataset.horsLigne;
  marquerRead(project);
  stopKitchen.hidden = true;
  sectionKitchen.hidden = true;
  // Plus de rail, plus de fiche par-dessus.
  if (rail.hidden && ouverte !== undefined) closeCard();
  if (rail.hidden) return rail.replaceChildren();
  // Aucune station connue ne sert le projet : la page ne reste pas vide — elle dit pourquoi (ticket 1405). Sur Rail, son
  // rail se lit quand même, sur GitHub (ses issues, labels et PR, ticket 2061) : lu, c'est le même rail que celui d'un projet servi ici, TODO en
  // tête avec ses cartes et leurs gestes (ticket 2076). Tant qu'il ne l'est pas, le rail que sa station publie dit
  // pourquoi (ticket 1435) — GitHub à connecter, aucune station du compte —, sans colonnes à lui. Hors ligne, le signe
  // seul, comme pour tout rail (ticket 1818).
  const duTableau = (tenu !== undefined && "tableau" in tenu) || outsideLine !== undefined;
  if (!seLit(project) && project.sansStation !== true && !duTableau) {
    const published = railsPublies.get(project.nom);
    // Pourquoi le tableau ne s'est pas lu, dans la phrase de sa lecture (tableau/read.ts).
    const nonLu = tenu === undefined ? undefined : "erreur" in tenu ? tenu.erreur : "titre" in tenu ? tenu.titre : undefined;
    if (published !== undefined && !published.sansReponse) return rail.replaceChildren(...poserRailPublished(document, { ...published, connexion: first.connexion, ...(nonLu === undefined ? {} : { nonLu }) }, actionsDuRailPublished(project)));
    return rail.replaceChildren(bloc("h3", AUCUNE_STATION));
  }
  // Sur Rail, en tête, la ligne qui dit ce qui y demande un geste (ticket 1185).
  // Le bon posé pour chaque carte, celles des stations comprises (ticket 1270) : celui de la fiche ouverte y reprend
  // le clavier.
  /** @type {Map<import("../facts.ts").Card, HTMLElement>} */
  const posees = new Map();
  poserCooking(project);
  /** @param {(HTMLElement | string)[]} poses */
  const poser = (...poses) => rail.replaceChildren(...(alertDeKitchen.hidden ? [] : [alertDeKitchen]), ...poses);
  // Cuisine d'un projet servi ici, station arrêtée : rien n'est lu, la page dit pourquoi en une ligne — sur l'un et
  // l'autre onglet.
  if (project.sansStation === true) return rail.replaceChildren(bloc("h3", STATION_ARRETEE));
  const muet = muets.get(project.nom);
  // Hors ligne sans rien de lu avant : le signe seul, sans erreur ni rail vide (ticket 1818).
  if (outsideLine !== undefined && (tenu === undefined || !("tableau" in tenu))) return poser(signeOutsideLine(outsideLine));
  // Ce que dit le rail qui n'est pas lu : la carte du projet le dit déjà, sur Cooks.
  if (tenu === undefined && muet === undefined) {
    // Une minute sans rien lu : la page le dit, elle n'attend pas toujours (ticket 2055).
    const epuisee = waitEpuisee(attentesDuRail, project.nom, Date.now());
    return poser(bloc("h3", epuisee ? RAIL_NON_LU : `the rail: first read of ${gesture(project, "facts")} in progress…`));
  }
  attentesDuRail.delete(project.nom);
  // La box ne répond pas : rien de ce que dit le rail n'est lu à neuf. Il garde sa dernière lecture,
  // marquée, et les tickets `fire` que GitHub dit encore passent au-dessus (feu.ts).
  // Le téléphone ne lit pas GitHub : rien n'y passe au-dessus.
  const auPhone = phoneVu !== undefined;
  const marque = muet === undefined || auPhone ? [] : poserMuet(project);
  if (tenu === undefined || !("tableau" in tenu)) {
    // Le téléphone n'a pas de panneau à droite : ce qui a été obtenu se dit sous le titre, en une ligne, son détail au survol.
    if (auPhone && tenu !== undefined && "erreur" in tenu) return poser(bloc("h3", `the rail is not drawn — tried at ${heureDe(tenu.a)}`), ...obtenuEnUneLine(project, tenu, AU_PHONE));
    // Sans rien lu : une ligne d'erreur, sans renvoi ; ce que l'app a obtenu s'y ajoute si le panneau est à l'écran.
    const sans = tenu === undefined ? [] : poserLaRead(document, tellLaRead({ reading: null, readAt: null, stale: false, refusal: { kind: "other" } }, { maintenant: Date.now(), essaiA: tenu.a, titre: tenu.titre, pourquoi: raisonDeLFailure(tenu), panneauVisible: panneauAFicher() }));
    return poser(...marque, ...sans);
  }
  const { hors: outside } = tenu.tableau.rail;
  oublierLesValidees(project, tenu.tableau.rail.colonnes);
  const lues = sansLesValidees(tenu.tableau.rail.colonnes, valideesDe(project.nom));
  oublierLesAnswersPerimees(project, lues);
  // La box ne répond pas : ce que ses colonnes contenaient n'est plus lu. Elles le disent, au lieu de montrer des « 0 ».
  const toutes = muet === undefined ? lues : lues.map((colonne) => ({ ...colonne, compte: "?", cartes: [], autres: undefined, vide: "not known while the station is unreachable" }));
  // Le kanban est entier sur Rail, Taken et Pass compris. TODO n'en est pas une colonne : ses cartes sont rouges en tête
  // de la colonne de leur étape, et l'entrée « TODO (N) » les filtre (ticket 3458).
  const range = rangerLeRail(toutes);
  const { colonnes, autres: dAutrui } = range;
  // Toutes les cartes lues, quel que soit l'onglet : la fiche ouverte et ce qui est en amont les suivent.
  const lesCards = [...toutes.flatMap(({ cartes: siennes, autres: dAutrui }) => [...siennes, ...(dAutrui ?? [])]), ...outside];
  // Ce sur quoi un agent travaille porte la poêle (ticket 2984) — jamais d'une lecture dont l'app ne sait plus si elle dit
  // vrai (hors ligne, périmée, la box muette), ni la cuisine arrêtée, ni sur une carte qui attend le chef.
  const enCooking = new Set(outsideLine === undefined && perime === undefined && muet === undefined && !tenu.tableau.arretee ? (tenu.tableau.auTravail ?? []) : []);
  /** @param {import("../facts.ts").Card[]} cards @param {import("./composants/pill/pill.js").State} [state] l'état de la colonne, que ses cartes disent ; aucun dans T'attend, où la carte garde l'état de son mot @param {boolean} [avecStation] @param {boolean} [outsideColonne] */
  const slips = (cards, state, avecStation = false, outsideColonne = false) => {
    const liste = document.createElement("ol");
    liste.append(
      ...cards.map((cardItem) => {
        // Une carte rouge garde la pastille de son propre état, comme dans TODO : la colonne dit son étape (ticket 3458).
        const slip = renderSlip(project, cardItem, estRed(cardItem) ? undefined : state, avecStation, outsideColonne, !cardItem.attendu && enCooking.has(cardItem.ticket));
        posees.set(cardItem, slip);
        return slip;
      }),
    );
    return liste;
  };
  // Le plan de la cuisine (kitchen/, ticket 4238) : backlog — le rail en tête, les prêts à part —, manager, cooks, pass, servi.
  // Chaque carte dans la colonne de son étape ; une carte parked reste dans celle où elle attend. Aucune colonne Waiting.
  // Le rail du backlog est le haut du backlog que la lecture porte (ticket 4223) : les mêmes tickets, dans le même ordre.
  const plan = planDeLaKitchen(colonnes, tenu.tableau.hautDuBacklog?.issues.map(({ number }) => number));
  // Ce qu'attendre un tiers veut dire (WAITING, ticket 3308) s'explique sous le titre de la première colonne où une carte est parked.
  const colonneParquee = plan.find(({ cartes: cards }) => cards.some(({ parque }) => parque !== undefined))?.nom;
  const grille = document.createElement("div");
  grille.className = "colonnes";
  grille.append(
    ...plan.map(({ nom: name, ton, compte: account, cartes: cards, vide: empty, defile, pretes, pasPretes }) => {
      const colonne = document.createElement("section");
      colonne.className = "colonne";
      colonne.dataset.ton = ton;
      // La visite (ticket 3165) désigne une colonne par son nom, et une carte par son ticket.
      colonne.dataset.colonne = name;
      // Servi s'allonge tout le jour : ses cartes défilent dans leur hauteur, les autres colonnes restent en vue.
      if (defile) colonne.dataset.defile = "";
      // Une carte rouge y attend le chef (ticket 3458).
      const red = cards.some(estRed);
      if (red) colonne.dataset.attend = "";
      // Ce qui attend le chef, ou bouge : sa colonne est en vue à l'ouverture du rail (ticket 1556).
      if (cards.length > 0 && (COLONNES_ACTIVES.has(name) || red)) colonne.dataset.actif = "";
      const tete = document.createElement("h4");
      tete.append(pillDState(document, stateDuTon(ton), name), bloc("span", account));
      colonne.append(tete);
      // Pass, et la première colonne où une carte est parked : l'explication de leur mot, sous leur titre (ticket 3308).
      const wordDeLaColonne = WORD_DE_LA_COLONNE[name] ?? (name === colonneParquee ? "WAITING" : undefined);
      if (wordDeLaColonne !== undefined && muet === undefined) colonne.append(...explanationDuRail(project.nom, wordDeLaColonne));
      // Le backlog : le rail en tête, ce qui est prêt à cuire ; dessous, le reste, s'il y en a.
      if (pretes !== undefined) {
        const duRail = document.createElement("div");
        duRail.className = "du-rail";
        duRail.append(bloc("h5", DU_RAIL), pretes.length > 0 ? slips(pretes, stateDuTon(ton)) : bloc("p", muet === undefined && tenu.tableau.rail.aucunTicket === true ? railEmpty(project) : muet === undefined ? RIEN_DE_PRET : empty));
        colonne.append(duRail);
        if (pasPretes !== undefined && pasPretes.length > 0) {
          const reste = document.createElement("div");
          reste.className = "pas-prets";
          reste.append(bloc("h5", PAS_PRETS), slips(pasPretes, stateDuTon(ton)));
          colonne.append(reste);
        }
      } else if (cards.length > 0) colonne.append(slips(cards, stateDuTon(ton), name === COOKS || name === COLONNE_PASS));
      else colonne.append(bloc("p", empty));
      return colonne;
    }),
  );
  // Le TODO du chef (tickets 4238, 4261, 4354) : une ligne, « 2 wait for you », dont un clic montre exactement les tickets
  // parked pour lui, une entrée chacun — ce qui lui est demandé, ses boutons, et un clic sur son numéro ouvre sa carte. Posé
  // sous les colonnes, il se montre au-dessus d'elles.
  // Un projet en lecture seule (ticket 3163) : ses cartes se lisent, aucun bouton ne les tranche d'ici.
  const todo = poserLeTodo(document, {
    cartes: ceQuiAwaitingYou(plan),
    ouvrir: (cardItem) => openCard(project, cardItem, posees.get(cardItem) ?? rail),
    ...(readOnlyDe(project) === undefined ? { gestes: { etat: (ticket, todo) => stateDeLaCard(project, ticket, todo), attente: ACTIONS_D_WAIT, jouer: (ticket, sorte, answer) => ACTIONS_DU_TODO[sorte](project, ticket, answer) } } : {}),
    // Sous chaque entrée, son contrôle de park, derrière « park or unpark… » (parked/, ticket 4281) : ce qui y est ouvert
    // et tapé se garde d'un rendu à l'autre.
    opened: parkOuverts.get(project.nom) ?? parkOuverts.set(project.nom, new Set()).get(project.nom),
    deplie: { get ouvert() { return deplisDe(project.nom).has("todo"); }, set ouvert(oui) { void (oui ? deplisDe(project.nom).add("todo") : deplisDe(project.nom).delete("todo")); } },
    control: ({ ticket, step }) => parkControl(document, { project: project.nom, ticket, step, gesture: garerParLePont, form: parkSaisies.get(`${project.nom}#${ticket}`) ?? parkSaisies.set(`${project.nom}#${ticket}`, {}).get(`${project.nom}#${ticket}`) }),
  });
  // À côté du TODO, hors des colonnes : le projet pas préparé pour Brigade (ticket 2628), qui n'est pas un ticket ; les
  // réponses que le chef tapait sur une carte partie entre-temps, résolues (ticket 2151) ; puis ce qui attend un autre humain
  // du projet, replié (ticket 2985).
  // Les gestes qu'un agent retient pour ton OK (ticket 4273) viennent en premier : chacun sa carte et son bouton Approve.
  const aSide = [poserLesRetenus(document, retenusDesProjects.get(project.nom), (id) => approuverLeActionRetenu(project, id)), opinionDuRepository(project, "todo")].flatMap((opinion) => opinion ?? []);
  const resolues = muet === undefined ? poserLesCardsResolues(project, tenu.tableau.rail) : [];
  if (resolues.length > 0) {
    const liste = document.createElement("ol");
    liste.append(...resolues);
    aSide.push(liste);
  }
  const deAutrui = poserLesAutres(document, { autres: dAutrui, bons: slips, deplie: autresDeplies.has(project.nom), deplier: (ouvert) => void (ouvert ? autresDeplies.add(project.nom) : autresDeplies.delete(project.nom)) });
  if (deAutrui !== undefined) aSide.push(deAutrui);
  const outsideTodo = document.createElement("div");
  outsideTodo.className = "a-cote-du-todo";
  outsideTodo.append(...aSide);
  const sousLesColonnes = [...(todo === undefined ? [] : [todo]), ...(aSide.length === 0 ? [] : [outsideTodo])];
  // Rien d'autre n'est lu à neuf : ni ce qui est avant le rail.
  if (muet !== undefined) return poser(...marque, grille, ...sousLesColonnes);
  // La cuisine, en marche ou à l'arrêt, est une ligne de Settings (ticket 1700).
  poserArreter(project, tenu.tableau.arretee);
  // La fiche ouverte suit la lecture : elle dit ce que la dernière dit de son ticket.
  // Celle d'une issue avant le rail suit aussi ce qu'en dit la dernière lecture.
  const avant = amonts.get(project.nom);
  if (ouverte !== undefined) followCard([...lesCards, ...(avant !== undefined && "groupes" in avant ? avant.groupes.flatMap(({ issues }) => issues.map(({ carte: cardItem }) => cardItem)) : [])], posees);
  // Un formulaire « waiting for… » dont le ticket n'est plus dans TODO se referme : il n'a plus de carte où se poser.
  for (const cle of formulairesDWait.keys()) {
    const [name, numero] = cle.split("#");
    if (name === project.nom && !toutes.some(({ cartes: siennes }) => siennes.some(({ ticket, gestes: actions }) => String(ticket) === numero && actions?.includes("attente-poser")))) formulairesDWait.delete(cle);
  }
  const resumption = resumptionDuClavier();
  const ancienne = rangees.get(project.nom);
  const defile = ancienne === undefined ? undefined : { gauche: ancienne.scrollLeft, haut: ancienne.scrollTop };
  const memeRail = railPoseDe === project.nom;
  const hautDuRail = rail.scrollTop;
  railPoseDe = project.nom;
  // Hors ligne, le rail lu en dernier est atténué, et le signe dit depuis quand à la place de son âge (ticket 1818).
  if (outsideLine !== undefined) rail.dataset.horsLigne = "";
  // Au-dessus des colonnes, au plus deux lignes (ticket 3523) : le bandeau Backlog et, si quelque chose retient la cuisine, une
  // ligne d'état — la première cause de cette liste, jamais deux : ce qui retient la cuisine d'abord, puis une lecture hors ligne
  // ou périmée, puis l'attente de la file. Sa fraîcheur, quand elle est bonne, est au survol de la ligne et du bandeau.
  // « Start this computer's station » n'est offert que pour un projet qui cuit sur cet ordinateur : la station arrêtée est la sienne.
  const demarrage = demarragesIci.get(project.nom);
  const actionsDuRail = readOnlyDe(project) === undefined ? { ouvrirStations: () => choisirOnglet(STATIONS), ...(project.ici === true && brigade.demarrerLaStationIci !== undefined ? { demarrerIci: () => void demarrerLaStationIci(project), ...(demarrage === undefined ? {} : { demarrageRefuse: demarrage }) } : {}) } : null;
  const vuAmont = amonts.get(project.nom);
  const alerts = vuAmont !== undefined && "groupes" in vuAmont ? vuAmont.alertes : undefined;
  const retenues = retenuesConnues({ misDeCote: vuAmont !== undefined && "groupes" in vuAmont ? (vuAmont.groupes.find(({ etat: state }) => state === "mise-de-cote")?.issues.map(({ ticket }) => ticket) ?? []) : [], arretee: tenu.tableau.arretee });
  // Pendant la pause de quota GitHub du compte (ticket 3482), le rail dit seulement qu'il l'attend : ni le rail bloqué, ni
  // l'attente de la file — sauf une panne que la pause n'explique pas, qui garde sa ligne et son geste.
  const ditDuRail = ceQueLeRailDit(tenu.tableau, Date.now(), project.redemarre !== undefined);
  const wait = ditDuRail.railBloque === undefined ? ditDuRail.attenteDuRail : undefined;
  // Les alertes du haut du rail (ticket 3823) : vraies et actionnables, jugées par le runtime. Une station qui redémarre pour
  // une mise à jour n'est pas une panne (ticket 3637). Elles disent seules les pannes des stations : la phrase de l'attente
  // qui porte un geste ne se montre plus, elle ne sait ni l'en-tête ni le dernier cook.
  const alertsDuRail = (tenu.tableau.alertesDuRail ?? []).filter(({ sorte, cause }) => project.redemarre === undefined || (sorte !== "aucun-cook" && cause !== "aucun-cook"));
  // La bande du haut (kitchen/, tickets 4238, 4354) remplace les bandeaux FAULT : les cartes du supervisor et du closer, et dessous au
  // plus un message — la première cause de la liste qui offre un geste au chef ; une qui n'en offre aucun n'est pas montrée. La
  // lecture hors ligne ou périmée, l'attente de la file et la pause du quota, qui passent seules, offrent de relire ; la ligne
  // d'une issue que la cuisine a ouverte sur elle-même, d'ouvrir cette issue. Une alerte du rail sans bouton du runtime offre
  // d'ouvrir son ticket, ou les checks du dépôt.
  /** @param {HTMLElement[]} lines @param {string} libelle @param {() => void} gesture */
  const avecSonAction = (lines, libelle, gesture) => {
    const [first] = lines;
    if (first !== undefined && !aUnAction(lines)) first.append(button(libelle, gesture));
    return lines;
  };
  const relire = () => lireLesFacts();
  const [issueDeLaKitchen] = [...(alerts ?? [])].sort((a, b) => a.ticket - b.ticket);
  /** @param {HTMLElement[]} lines */
  const relisible = (lines) => {
    if (lines.length === 0 || aUnAction(lines)) return lines;
    const cadre = document.createElement("div");
    cadre.className = "relisible";
    cadre.append(...lines, button("read again", () => lireLesFacts()));
    return [cadre];
  };
  const status =
    [
      issueDeLaKitchen === undefined ? [] : avecSonAction(lineDesAlerts(document, alerts), `open #${issueDeLaKitchen.ticket}`, () => void ouvrirIssue(project, issueDeLaKitchen.ticket)),
      lineDuRailBlocked(document, ditDuRail.railBloque, actionsDuRail),
      avecSonAction(lineDuProjectEnPause(document, ditDuRail.enPause), "read again", relire),
      outageDuRail(project, tenu.tableau),
      teteDuRail(project),
      // Une alerte qui demande un geste au chef passe avant le signe d'une lecture vieille (ticket 4238).
      messageDesAlerts(document, alertsDuRail, (alert) => lineDesAlertsDuRail(document, [alert], actionsDuRail), { ouvrirTicket: (ticket) => void ouvrirIssue(project, ticket), ouvrirLesChecks: () => void ouvrirLesChecks(project) }),
      relisible(outsideLine !== undefined ? [signeOutsideLine(outsideLine)] : perime !== undefined ? signePerime(perime, tenu.a) : fraicheur(tenu.a)),
      // Pourquoi la file ne part pas (ticket 3433) : jamais « no reason is found » devant une raison que la vue connaît.
      avecSonAction(lineDeLWait(document, wait === undefined || wait.geste !== null ? undefined : phraseDeLWait(wait, retenues), actionsDuRail), "read again", relire),
    ].find((lines) => lines.length > 0 && aUnAction(lines)) ?? [];
  // La bande du haut (ticket 4354) : les cartes du supervisor et du closer sur une ligne, et au bout, sur 24 h, la part des
  // tickets mergés en 10 min ou moins de leur prise et leur médiane, la ligne de `status` (ticket 4299).
  const delayDeTaking = projectsVus?.projets.find(({ nom: name }) => name === project.nom)?.delaiDePrise;
  const bandeDuHaut = poserLaBandeDuHaut(document, { roles: tenu.tableau.rolesCuisine, montre: (name) => teamDuProject.agent(project.nom, name) !== undefined, alerte: issueDeLaKitchen?.ticket, maintenant: Date.now(), deplies: deplisDe(project.nom), ...(delayDeTaking === undefined ? {} : { delai: delayDeTaking }) });
  bannerDStop.maj(tenu.tableau.arretCuisine);
  const age = tenu.publieLe === undefined ? undefined : ageDuRail(tenu.publieLe, tenu.a);
  // Sans ligne d'état ni bandeau, la rangée des colonnes la porte : l'âge n'est jamais perdu, jamais une ligne de plus.
  for (const porteur of age === undefined ? [] : [status[0], grille]) if (porteur !== undefined && !porteur.title) porteur.title = age;
  // Les explications de Rail, de Cook et de TODO, qui étaient au-dessus des colonnes, sont dessous : une fois vues, elles partent.
  // Le journal du jour, au-dessus des colonnes, et la carte du digest de la veille en tête, au premier matin (ticket 4274).
  const { journal: log, digest } = tenu.tableau;
  const duMatin = digest !== undefined && cardDuMatin.aMontrer(project.nom, dayDe(new Date())) ? [poserLaCardDuDigest(document, digest)] : [];
  poser(...duMatin, bandeDuHaut, ...status, ...(log === undefined ? [] : [poserLeLog(document, log)]), grille, ...sousLesColonnes, ...explanationDuRail(project.nom, "rail"), ...explanationDuRail(project.nom, "cook"), ...explanationDuRail(project.nom, "TODO"), ...(outside.length === 0 ? [] : [bloc("h3", "outside the columns — their state is none of the six, and nothing says they await you"), slips(outside, undefined, false, true)]));
  // La cuisine arrêtée (ticket 3924) : en tête du rail, au-dessus de la ligne d'état — aucune autre ligne ne la tait.
  if (tenu.tableau.arretCuisine) rail.prepend(hoteDeLStop);
  rendreLeClavier(resumption);
  placerLaRangee(project, grille, defile);
  if (memeRail) rail.scrollTop = hautDuRail;
}

// La rangée des colonnes, une fois posée : la lecture qui suit garde le défilement du chef ; à l'ouverture du rail, la
// première colonne où quelque chose attend ou bouge est à gauche de la vue, sans qu'il défile (ticket 1556).
/** @param {Project} project @param {HTMLElement} grille @param {{ gauche: number, haut: number } | undefined} defile */
function placerLaRangee(project, grille, defile) {
  rangees.set(project.nom, grille);
  if (rangeesPlacees.has(project.nom) && defile !== undefined) {
    grille.scrollLeft = defile.gauche;
    grille.scrollTop = defile.haut;
    return;
  }
  const active = /** @type {HTMLElement | undefined} */ ([...grille.children].find((colonne) => /** @type {HTMLElement} */ (colonne).dataset.actif !== undefined));
  if (active === undefined || active.getBoundingClientRect === undefined) return;
  rangeesPlacees.add(project.nom);
  grille.scrollLeft = Math.max(0, active.getBoundingClientRect().left - grille.getBoundingClientRect().left + grille.scrollLeft - 16);
}

// Le champ où le chef tapait garde le clavier, et son curseur : le rail redessiné le lui rend — celui d'une carte, d'un
// formulaire, ou d'une ligne du tableau de la cuisine.
function resumptionDuClavier() {
  const tape = /** @type {HTMLInputElement | null | undefined} */ (document.activeElement);
  // Le champ du détail en grand (ticket 3348) porte la même clé que celui de sa carte, cachée dessous : le rail ne peut pas
  // le rendre, il prendrait le clavier à la carte au lieu de le laisser au détail — poserLeDetail garde le sien.
  if (tape !== null && tape !== undefined && detailDeValidation.contains(tape)) return undefined;
  return tape?.dataset?.cle === undefined ? undefined : { cle: tape.dataset.cle, champ: tape.dataset.champ, debut: tape.selectionStart, fin: tape.selectionEnd };
}
/** @param {ReturnType<typeof resumptionDuClavier>} resumption */
function rendreLeClavier(resumption) {
  if (resumption === undefined) return;
  const repris = /** @type {HTMLInputElement[]} */ ([...rail.querySelectorAll("input, textarea")]).find(({ dataset }) => dataset.cle === resumption.cle && dataset.champ === resumption.champ);
  repris?.focus();
  if (repris !== undefined && resumption.debut !== null && resumption.fin !== null) repris.setSelectionRange?.(resumption.debut, resumption.fin);
}

// Une carte de TODO à laquelle le chef vient de répondre reste dans sa colonne : elle dit sa réponse envoyée, en
// attente de la cuisine (card-todo.js). Une réponse que les faits lus ne portent plus — la carte a quitté TODO, ou
// pose une autre question — est oubliée, et son brouillon avec.
/** @param {Project} project @param {import("../facts.ts").Colonne[]} colonnes */
function oublierLesAnswersPerimees(project, colonnes) {
  const portees = cardsPortees(project, colonnes);
  for (const cle of answersAuxCards.keys()) if (cle.startsWith(`${project.nom}#`) && !portees.has(cle)) answersAuxCards.delete(cle);
  // Un brouillon vide part avec sa carte ; un autre reste, sur une carte résolue (ticket 2151).
  for (const [cle, texte] of brouillonsDeCards) {
    if (!cle.startsWith(`${project.nom}#`) || portees.has(cle) || texte.trim() !== "") continue;
    brouillonsDeCards.delete(cle);
    questionsDesBrouillons.delete(cle);
  }
  for (const [cle, { question }] of answersAuxCards) if (cle.startsWith(`${project.nom}#`) && portees.get(cle) !== question) answersAuxCards.delete(cle);
}

// Une carte validée ou renvoyée d'ici que la lecture ne porte plus est oubliée : elle a quitté TODO pour de bon.
/** @param {Project} project @param {import("../facts.ts").Colonne[]} colonnes */
function oublierLesValidees(project, colonnes) {
  const faites = validees.get(project.nom);
  if (faites === undefined) return;
  const portees = new Set(colonnes.flatMap(({ cartes: cards, autres }) => [...cards, ...(autres ?? [])]).map(({ ticket }) => ticket));
  for (const ticket of faites) {
    if (portees.has(ticket)) continue;
    faites.delete(ticket);
    validations.delete(`${project.nom}#${ticket}`);
    revues.delete(`${project.nom}#${ticket}`);
  }
}

// Les cartes de TODO que des colonnes portent, par projet et ticket, et la question de chacune.
/** @param {Project} project @param {import("../facts.ts").Colonne[]} colonnes @returns {Map<string, string | null>} */
const cardsPortees = (project, colonnes) => new Map(colonnes.flatMap(({ cartes: cards, autres }) => [...cards, ...(autres ?? [])]).flatMap(({ ticket, todo }) => (todo === undefined ? [] : [[`${project.nom}#${ticket}`, todo.question]])));

// Ce qu'une lecture dit d'une carte de TODO où le chef a tapé (ticket 2151) : rien, si elle est encore dans TODO avec la
// même question — n'importe laquelle, `question` indéfinie ; sinon, en une ligne, ce qu'elle est devenue — son texte, lui,
// reste.
/** @param {import("../facts.ts").Rail} lu @param {number} ticket @param {string | null | undefined} question @returns {string | undefined} */
function resolueEntreTime(lu, ticket, question) {
  const colonne = lu.colonnes.find(({ cartes: cards, autres }) => [...cards, ...(autres ?? [])].some((cardItem) => cardItem.ticket === ticket));
  const sienne = [...(colonne?.cartes ?? []), ...(colonne?.autres ?? [])].find((cardItem) => cardItem.ticket === ticket);
  if (colonne?.nom === COLONNE_QUI_AWAITING_YOU && sienne?.todo !== undefined) return question === undefined || sienne.todo.question === question ? undefined : `its question changed meanwhile — ${TEXTE_GUARD}`;
  const devenue =
    colonne === undefined
      ? lu.hors.some((cardItem) => cardItem.ticket === ticket)
        ? "is now outside the columns"
        : "has left the rail"
      : colonne.nom === COLONNE_QUI_AWAITING_YOU
        ? "no longer takes an answer on its card"
        : `is now in ${sienne === undefined ? colonne.nom : colonneDuPlan(colonne.nom, sienne)}`;
  return `resolved meanwhile: #${ticket} ${devenue} — ${TEXTE_GUARD}`;
}
const TEXTE_GUARD = "your text is kept here, nothing was sent";

// La ligne d'une carte tenue que la lecture ne porte plus, à côté du champ du chef — retirée quand elle la porte de nouveau.
/** @param {HTMLElement} cardItem @param {string | undefined} dit */
function tellLaCardResolue(cardItem, dit) {
  const avant = [...cardItem.children].find(({ className }) => className === "resolue-entre-temps");
  if (dit === undefined) return avant?.remove();
  if (avant !== undefined) return void (avant.textContent = dit);
  const line = bloc("p", dit);
  line.className = "resolue-entre-temps";
  const phrase = [...cardItem.children].find(({ className }) => className === "phrase");
  if (phrase === undefined) cardItem.append(line);
  else phrase.after(line);
}

// Le rail d'un projet dont le chef tient une carte de TODO (ticket 2151) ne se redessine pas : la lecture est tenue, et la
// carte dit seulement si elle ne la porte plus. Une lecture ratée n'en dit rien. Faux : rien n'est tenu dans ce rail.
/** @param {Project} project */
function garderLaCardEnMain(project) {
  const enMain = cardEnMain;
  if (enMain === undefined || enMain.projet !== project.nom || !rail.contains(enMain.bon)) return false;
  rail.hidden = false;
  enMain.gele = true;
  const tenu = tenus.get(project.nom);
  if (tenu !== undefined && "tableau" in tenu && !muets.has(project.nom)) tellLaCardResolue(enMain.carte, resolueEntreTime(tenu.tableau.rail, enMain.ticket, enMain.question));
  return true;
}

// Une carte de TODO posée se tient tant que le clavier y est : son champ, ses choix, ses boutons (ticket 2151).
// `question` : celle de la carte — indéfinie pour une carte résolue, qui n'en attend plus aucune.
/** @param {Project} project @param {number} ticket @param {string | null | undefined} question @param {HTMLElement} slip @param {HTMLElement} cardItem */
function holdEnMain(project, ticket, question, slip, cardItem) {
  cardItem.addEventListener("focusin", () => {
    if (cardEnMain?.carte !== cardItem) cardEnMain = { projet: project.nom, ticket, question, bon: slip, carte: cardItem, gele: false };
  });
  cardItem.addEventListener("focusout", (event) => {
    const vers = /** @type {HTMLElement | null | undefined} */ (event.relatedTarget);
    if (vers != null && cardItem.contains(vers)) return;
    // Le clavier part ailleurs dans le rail : la lecture tenue attend la suivante, pour ne pas reposer l'élément que le
    // chef vient de toucher.
    lacherLaCard(cardItem, vers == null || !rail.contains(vers));
  });
  return cardItem;
}

// Le clavier quitte la carte tenue : ce qui est arrivé entre-temps se pose, si `redessiner`. Un geste de la carte la
// lâche sans redessiner : il redessine lui-même.
/** @param {HTMLElement} cardItem @param {boolean} redessiner */
function lacherLaCard(cardItem, redessiner) {
  if (cardEnMain?.carte !== cardItem) return;
  const { projet: project, gele } = cardEnMain;
  cardEnMain = undefined;
  if (redessiner && gele && courant?.nom === project && !rail.hidden) poserRail(courant);
}
/** @param {string} project @param {number} ticket */
function lacherLaCardDe(project, ticket) {
  if (cardEnMain?.projet === project && cardEnMain.ticket === ticket) lacherLaCard(cardEnMain.carte, false);
}

// Les cartes de TODO parties entre-temps dont le chef a gardé un texte (ticket 2151), en bas de TODO : son numéro, ce que
// la carte demandait, ce qu'elle est devenue, et son texte — à recopier, ou à écarter.
/** @param {Project} project @param {import("../facts.ts").Rail} lu */
function poserLesCardsResolues(project, lu) {
  const portees = cardsPortees(project, lu.colonnes);
  return [...brouillonsDeCards].flatMap(([cle, texte]) => {
    if (!cle.startsWith(`${project.nom}#`) || portees.has(cle) || texte.trim() === "") return [];
    const ticket = Number(cle.slice(project.nom.length + 1));
    const numero = bloc("span", `#${ticket}`);
    numero.className = "ticket mono";
    const slip = cardWait(document, { numero });
    slip.dataset.resolue = "";
    const cardItem = cardDeAnswer(document, { resolue: true });
    cardItem.ariaLabel = `your answer to #${ticket}, kept after its card left TODO`;
    const demandait = questionsDesBrouillons.get(cle);
    if (demandait != null) {
      const question = bloc("p", demandait);
      question.className = "question-carte";
      cardItem.append(question);
    }
    const phrase = document.createElement("div");
    phrase.className = "phrase";
    const saisie = document.createElement("textarea");
    saisie.value = texte;
    saisie.rows = 2;
    saisie.ariaLabel = `your text for #${ticket}`;
    saisie.dataset.cle = cle;
    saisie.dataset.champ = CHAMP_DE_CARD;
    saisie.addEventListener("input", () => void brouillonsDeCards.set(cle, saisie.value));
    const ecarter = button("dismiss", () => {
      brouillonsDeCards.delete(cle);
      questionsDesBrouillons.delete(cle);
      lacherLaCard(cardItem, false);
      if (courant?.nom === project.nom) poserRail(project);
    }, "discret");
    ecarter.title = "forget this text: nothing was sent, and nothing will be";
    phrase.append(saisie, ecarter);
    cardItem.append(phrase);
    tellLaCardResolue(cardItem, resolueEntreTime(lu, ticket, undefined));
    slip.append(holdEnMain(project, ticket, undefined, slip, cardItem));
    return [slip];
  });
}

// Le geste en route d'ici sur la carte de TODO d'un ticket, pour la question qu'elle montre — au repos sinon.
/** @param {Project} project @param {number} ticket @param {import("../card-todo.ts").CardDeTodo} todo */
function stateDeLaCard(project, ticket, todo) {
  const tenue = answersAuxCards.get(`${project.nom}#${ticket}`);
  return tenue !== undefined && tenue.question === todo.question ? tenue.etat : CARD_AU_REPOS;
}

// La carte de TODO d'un ticket, dans l'état de sa réponse (card-todo.js) : ses captures posées comme
// celles d'une livraison, lues sans un clic. « Ask the second » y passe la carte au second : son numéro, sa question, ce
// que son issue dit (ticket 3133).
/** @param {Project} project @param {number} ticket @param {import("../card-todo.ts").CardDeTodo} todo */
function poserLaCardDeTodo(project, ticket, todo) {
  const cle = `${project.nom}#${ticket}`;
  if (estUneValidation(todo)) return poserLaValidation(project, ticket, todo, false);
  if (estUneRevue(todo)) return poserLaRevue(project, ticket, todo, false);
  const state = stateDeLaCard(project, ticket, todo);
  const second = demandesAuSecond.get(cle);
  return poserCardDeTodo(
    document,
    ticket,
    todo,
    state,
    { captures: todo.captures === undefined ? [] : poserCaptures(project, ticket, todo.captures), brouillon: brouillonsDeCards.get(cle) ?? "", cle, ...(second === undefined ? {} : { second }), ...(readOnlyDe(project) === undefined ? {} : { lectureSeule: true }) },
    {
      repondre: (answer) => void repondreALaCard(project, ticket, answer),
      ecrire: (texte) => {
        brouillonsDeCards.set(cle, texte);
        questionsDesBrouillons.set(cle, todo.question ?? todo.resume ?? null);
      },
      demander: () => void demanderAuSecond(project, ticket, () => brigade.passerAuSecond(project.nom, ticket, todo.question)),
      copier: (texte) => navigator.clipboard?.writeText(texte),
    },
  );
}

// La carte « Validate its screen » d'un ticket (validation-design/, ticket 3185) : ses captures posées comme celles de toute
// carte, lues sans un clic ; « Validate » et « Send back to the kitchen » jouent la commande du runtime par le process
// principal — sur le téléphone, ils s'écrivent sur GitHub (actions-github-phone.ts). `grand` : à la largeur d'un téléphone, sur la carte ouverte depuis la liste.
/** @param {Project} project @param {number} ticket @param {import("../card-todo.ts").CardDeTodo} todo @param {boolean} grand */
function poserLaValidation(project, ticket, todo, grand) {
  const cle = `${project.nom}#${ticket}`;
  const second = demandesAuSecond.get(cle);
  return poserCardDeValidation(
    document,
    ticket,
    todo,
    validations.get(cle) ?? VALIDATION_AU_REPOS,
    { captures: todo.captures === undefined ? [] : poserCaptures(project, ticket, todo.captures), commentaire: commentairesDeValidation.get(cle) ?? "", cle, grand, ...(second === undefined ? {} : { second }), ...(readOnlyDe(project) === undefined ? {} : { lectureSeule: true }) },
    {
      valider: () => void validerLaCard(project, ticket, { geste: "valider" }),
      renvoyer: (comment) => void validerLaCard(project, ticket, { geste: "renvoyer", commentaire: comment }),
      ecrire: (texte) => void commentairesDeValidation.set(cle, texte),
      ouvrirPr: () => void brigade.ouvrirPr(project.nom, ticket),
      ouvrir: () => ouvrirLeDetail(project.nom, ticket),
      // Dans TODO, comme toute carte, « ask the second » (ticket 3133) ; la carte ouverte du téléphone n'en a pas.
      ...(grand ? {} : { demander: () => void demanderAuSecond(project, ticket, () => brigade.passerAuSecond(project.nom, ticket, todo.question)) }),
    },
  );
}

// La carte « review before merge » d'un ticket sensible (card-sensitive/, ticket 3224) : « PR of #<ticket> » l'ouvre d'un
// clic ; « Merge » et « Send back » jouent la commande `sensitive` du runtime par le process principal. `grand` : à la
// largeur d'un téléphone, sur la carte ouverte depuis la liste.
/** @param {Project} project @param {number} ticket @param {import("../card-todo.ts").CardDeTodo} todo @param {boolean} grand */
function poserLaRevue(project, ticket, todo, grand) {
  const cle = `${project.nom}#${ticket}`;
  const second = demandesAuSecond.get(cle);
  return poserCardSensitive(
    document,
    ticket,
    todo,
    revues.get(cle) ?? REVUE_AU_REPOS,
    { note: notesDeRevue.get(cle) ?? "", cle, grand, ...(second === undefined ? {} : { second }), ...(readOnlyDe(project) === undefined ? {} : { lectureSeule: true }) },
    {
      merger: () => void repondreALaRevue(project, ticket, { geste: "merger" }),
      renvoyer: (note) => void repondreALaRevue(project, ticket, { geste: "renvoyer", note }),
      ecrire: (texte) => void notesDeRevue.set(cle, texte),
      ouvrirPr: () => void brigade.ouvrirPr(project.nom, ticket),
      ...(grand ? {} : { demander: () => void demanderAuSecond(project, ticket, () => brigade.passerAuSecond(project.nom, ticket, todo.question)) }),
    },
  );
}

// Une réponse du chef sur une carte « review before merge », une seule à la fois : faite, la carte quitte TODO et les faits
// sont relus ; refusée, elle garde ses gestes et sa note, et dit pourquoi.
/** @param {Project} project @param {number} ticket @param {import("./card-sensitive/card-sensitive-github.ts").ActionSensitive} gesture */
async function repondreALaRevue(project, ticket, gesture) {
  const cle = `${project.nom}#${ticket}`;
  if (revues.get(cle)?.etape === "envoi" || revues.get(cle)?.etape === "fait") return;
  lacherLaCardDe(project.nom, ticket);
  /** @param {import("./card-sensitive/card-sensitive.js").State} state */
  const poser = (state) => {
    revues.set(cle, state);
    if (courant?.nom === project.nom) poserRail(project);
    poserLesCardsDuChef();
  };
  poser({ etape: "envoi", geste: gesture.geste });
  /** @type {import("./card-sensitive/card-sensitive-github.ts").RenduSensitive | undefined} */
  let rendu;
  try {
    rendu = brigade.gesteSensible === undefined ? { refus: REVUE_SANS_PONT, detail: "" } : await brigade.gesteSensible(project.nom, ticket, gesture);
  } catch (error) {
    rendu = { refus: "nothing was done: the app could not play the gesture", detail: error instanceof Error ? error.message : String(error) };
  }
  const rendue = apresLaRevue(rendu);
  if (rendue.etape !== "fait") return poser(rendue);
  // Fait : la carte garde un court moment la confirmation de ce qui a été fait (ticket 3386), puis quitte TODO.
  poser({ ...rendue, geste: gesture.geste });
  await new Promise((fini) => setTimeout(fini, CONFIRMATION_REVUE_MS));
  notesDeRevue.delete(cle);
  validees.set(project.nom, valideesDe(project.nom).add(ticket));
  if (vueDesCards.vu === "carte" && vueDesCards.carte.projet === project.nom && vueDesCards.carte.ticket === ticket) vueDesCards = { vu: "liste" };
  poser(rendue);
  lireLesFacts();
}

// « undo » sur la carte d'un ticket servi (undo/, ticket 3274), un seul à la fois : fait, la carte garde la ligne de ce qui
// s'est passé et les faits sont relus — rouvert, le ticket quitte Served ; refusé, le bouton revient et la carte dit pourquoi.
/** @param {Project} project @param {number} ticket */
async function annulerLeServed(project, ticket) {
  const cle = `${project.nom}#${ticket}`;
  if (annulations.get(cle)?.etape === "envoi" || annulations.get(cle)?.etape === "fait") return;
  /** @param {import("./undo/undo.js").State} state */
  const poser = (state) => {
    annulations.set(cle, state);
    if (courant?.nom === project.nom) poserRail(project);
  };
  poser({ etape: "envoi" });
  /** @type {import("./undo/undo-github.ts").RenduDAnnulation | undefined} */
  let rendu;
  try {
    rendu = brigade.annulerServi === undefined ? { refus: ANNULATION_SANS_PONT, detail: "" } : await brigade.annulerServi(project.nom, ticket);
  } catch (error) {
    rendu = { refus: "nothing was undone: the app could not play the gesture", detail: error instanceof Error ? error.message : String(error) };
  }
  const rendue = apresLAnnulation(rendu);
  poser(rendue);
  if (rendue.etape === "fait") lireLesFacts();
}

// Un geste du chef sur une carte « Validate its screen », un seul à la fois : fait, la carte quitte TODO et les faits sont
// relus ; refusé, elle garde ses gestes et son commentaire, et dit pourquoi.
/** @param {Project} project @param {number} ticket @param {import("./validation-design/validation-design-github.ts").ActionDeValidation} gesture */
async function validerLaCard(project, ticket, gesture) {
  const cle = `${project.nom}#${ticket}`;
  if (validations.get(cle)?.etape === "envoi" || validations.get(cle)?.etape === "fait") return;
  lacherLaCardDe(project.nom, ticket);
  /** @param {import("./validation-design/validation-design.js").State} state */
  const poser = (state) => {
    validations.set(cle, state);
    if (courant?.nom === project.nom) poserRail(project);
    poserLesCardsDuChef();
    // Fait depuis son détail, la carte a quitté TODO : son détail se ferme (`poserLeDetail` ne la trouve plus).
    if (detailOuvert?.projet === project.nom && detailOuvert.ticket === ticket) poserLeDetail();
  };
  poser({ etape: "envoi", geste: gesture.geste });
  /** @type {import("./validation-design/validation-design-github.ts").RenduDeValidation | undefined} */
  let rendu;
  try {
    rendu = await brigade.gesteDeValidation(project.nom, ticket, gesture);
  } catch (error) {
    rendu = { refus: "nothing was done: the app could not play the gesture", detail: error instanceof Error ? error.message : String(error) };
  }
  const rendue = apresLaValidation(rendu);
  if (rendue.etape !== "fait") return poser(rendue);
  // Fait : la carte, ou son détail, garde un court moment la confirmation de ce qui a été fait (ticket 3386), puis quitte TODO.
  poser({ ...rendue, geste: gesture.geste });
  await new Promise((fini) => setTimeout(fini, CONFIRMATION_VALIDATION_MS));
  commentairesDeValidation.delete(cle);
  validees.set(project.nom, valideesDe(project.nom).add(ticket));
  if (vueDesCards.vu === "carte" && vueDesCards.carte.projet === project.nom && vueDesCards.carte.ticket === ticket) vueDesCards = { vu: "liste" };
  poser(rendue);
  lireLesFacts();
}

// La carte « Validate its screen » d'un ticket, telle que la dernière lecture de son projet la porte — partie de TODO
// (validée ou renvoyée d'ici, ou plus lue), rien.
/** @param {string} name @param {number} ticket */
function laValidation(name, ticket) {
  const project = configuration.projets.find((un) => un.nom === name);
  const tenu = tenus.get(name);
  if (project === undefined || tenu === undefined || !("tableau" in tenu) || valideesDe(name).has(ticket)) return undefined;
  const todo = tenu.tableau.rail.colonnes
    .flatMap(({ cartes: cards }) => cards)
    .find((cardItem) => cardItem.ticket === ticket && estUneValidation(cardItem.todo))?.todo;
  return todo === undefined ? undefined : { projet: project, todo };
}

// Les cartes « Validate its screen » qui attendent le chef, dans l'ordre de sa liste (`lesCartesDuChef`) : celle qui suit
// la carte ouverte — la première, après la dernière —, autre qu'elle.
/** @param {string} name @param {number} ticket */
function validationSuivante(name, ticket) {
  const attendent = lesCardsDuChef().filter(({ todo }) => estUneValidation(todo));
  const ici = attendent.findIndex((cardItem) => cardItem.projet === name && cardItem.ticket === ticket);
  return [...attendent.slice(ici + 1), ...attendent.slice(0, Math.max(ici, 0))].find((cardItem) => cardItem.projet !== name || cardItem.ticket !== ticket);
}

/** @param {string} project @param {number} ticket */
function ouvrirLeDetail(project, ticket) {
  lacherLaCardDe(project, ticket);
  detailOuvert = { projet: project, ticket, affichage: displayNeuf() };
  poserLeDetail();
  detailDeValidation.focus();
}

function fermerLeDetail() {
  const ferme = detailOuvert;
  detailOuvert = undefined;
  poserLeDetail();
  // Le commentaire tapé dans le détail est celui de la carte : elle le reprend.
  if (ferme === undefined) return;
  const project = configuration.projets.find((un) => un.nom === ferme.projet);
  if (project !== undefined && courant?.nom === project.nom && !rail.hidden && tenus.has(project.nom)) poserRail(project);
  poserLesCardsDuChef();
}

// Le détail ouvert, posé dans son état ; sa carte partie de TODO, il se ferme. Le clavier qui était dans son champ y reste.
function poserLeDetail() {
  const lue = detailOuvert === undefined ? undefined : laValidation(detailOuvert.projet, detailOuvert.ticket);
  if (detailOuvert === undefined || lue === undefined) {
    detailOuvert = undefined;
    detailDeValidation.hidden = true;
    return detailDeValidation.replaceChildren();
  }
  const { ticket, affichage: display } = detailOuvert;
  const { projet: project, todo } = lue;
  const cle = `${project.nom}#${ticket}`;
  const rendreLeChamp = garderLeClavier(document.activeElement, detailDeValidation);
  const suivante = validationSuivante(project.nom, ticket);
  const screens = todo.captures?.ecrans ?? [];
  detailDeValidation.hidden = false;
  detailDeValidation.replaceChildren(
    poserDetailDeValidation(
      document,
      ticket,
      todo,
      validations.get(cle) ?? VALIDATION_AU_REPOS,
      display,
      {
        images: (screen, moment) => {
          const capture = screens.find((un) => un.ecran === screen)?.[moment];
          return capture === undefined ? bloc("span", "missing") : poserImage(project, ticket, screen, capture);
        },
        commentaire: commentairesDeValidation.get(cle) ?? "",
        cle,
        grand: etroit(),
        ...(suivante === undefined ? {} : { suivante: suivante.ticket }),
        ...(readOnlyDe(project) === undefined ? {} : { lectureSeule: true }),
      },
      {
        fermer: fermerLeDetail,
        reposer: poserLeDetail,
        suivante: () => {
          if (suivante !== undefined) ouvrirLeDetail(suivante.projet, suivante.ticket);
        },
        valider: () => void validerLaCard(project, ticket, { geste: "valider" }),
        renvoyer: (comment) => void validerLaCard(project, ticket, { geste: "renvoyer", commentaire: comment }),
        ecrire: (texte) => void commentairesDeValidation.set(cle, texte),
        ouvrirPr: () => void brigade.ouvrirPr(project.nom, ticket),
      },
    ),
  );
  rendreLeChamp();
}

// Échap ferme le détail — ou, une capture ouverte seule, rend l'avant et l'après.
// Les flèches gauche et droite passent d'un écran du ticket à l'autre, sauf dans le champ du commentaire (ticket 3350).
detailDeValidation.addEventListener("keydown", (event) => {
  if (detailOuvert === undefined || (event.key !== "ArrowLeft" && event.key !== "ArrowRight")) return;
  if (["TEXTAREA", "INPUT"].includes(/** @type {any} */ (event.target)?.tagName)) return;
  const lue = laValidation(detailOuvert.projet, detailOuvert.ticket);
  if (lue !== undefined && changerD(detailOuvert.affichage, lue.todo.captures?.ecrans.length ?? 0, event.key === "ArrowLeft" ? -1 : 1)) {
    event.preventDefault();
    poserLeDetail();
  }
});
detailDeValidation.addEventListener("keydown", (event) => {
  if (event.key !== "Escape" || detailOuvert === undefined) return;
  event.stopPropagation();
  if (detailOuvert.affichage.seule === undefined) return fermerLeDetail();
  delete detailOuvert.affichage.seule;
  poserLeDetail();
});

// Les cartes qui attendent le chef, à la largeur d'un téléphone (cards-du-chef/, ticket 2915) : celles de la colonne
// « Awaiting you » de chaque projet lu, avec leur question — une carte déjà répondue n'y est plus. La vue montrée est la
// liste, une carte ouverte (le brouillon et ce qui a refusé sa réponse sont ceux de la carte), ou l'envoi qu'on vient de faire.
/** @typedef {import("./cards-du-chef/cards-du-chef.js").Card} CardDuChef */
/** @type {{ vu: "liste" } | { vu: "carte", carte: CardDuChef } | { vu: "envoyee", projet: string, ticket: number }} */
let vueDesCards = { vu: "liste" };
/** @returns {CardDuChef[]} */
function lesCardsDuChef() {
  return configuration.projets.flatMap((project) => {
    const tenu = tenus.get(project.nom);
    // Une carte d'un projet en lecture seule ne se répond pas d'ici (ticket 3163) : elle n'est pas de cette liste.
    if (tenu === undefined || !("tableau" in tenu) || tenu.tableau.lectureSeule !== undefined) return [];
    const colonne = tenu.tableau.rail.colonnes.find(({ nom: name }) => name === COLONNE_QUI_AWAITING_YOU);
    return (colonne?.cartes ?? []).flatMap((cardItem) => {
      const { todo } = cardItem;
      if (!cardItem.attendu || todo === undefined || (todo.question === null && todo.choix.length === 0)) return [];
      // Validée ou renvoyée d'ici (ticket 3185) : elle a quitté la liste.
      if (estUneValidation(todo) || estUneRevue(todo)) return valideesDe(project.nom).has(cardItem.ticket) ? [] : [{ projet: project.nom, ticket: cardItem.ticket, age: cardItem.age?.court ?? "", todo }];
      const state = stateDeLaCard(project, cardItem.ticket, todo);
      const vu = vuDeLaCard(todo, state).vu;
      return state.etape === "postee" || vu === "attente" || vu === "jouee" ? [] : [{ projet: project.nom, ticket: cardItem.ticket, age: cardItem.age?.court ?? "", todo }];
    });
  });
}
// Les lignes du disjoncteur ouvert, en tête de la liste (ticket 3371) : une par projet dont la dernière bande le dit ouvert, avec
// ce que la station en écrit — écrit sous la ligne, un téléphone n'ayant pas de survol (todo-breaker-line.js).
function lesLinesDuBreaker() {
  return configuration.projets.filter((project) => seLit(project)).flatMap((project) => {
    const alert = alertDuBreaker(project.nom);
    if (alert === undefined) return [];
    const dit = configuration.projets.length > 1 ? `${project.nom}: ${alert.dit}` : alert.dit;
    return [poserLineDuBreaker(document, { marque: pill(alert.dit, alert.ton), dit, ...(alert.releve === undefined ? {} : { pourquoi: alert.releve }) })];
  });
}
function poserLesCardsDuChef() {
  if (cardsDuChef.hidden) return;
  const cards = lesCardsDuChef();
  const retour = () => {
    vueDesCards = { vu: "liste" };
    poserLesCardsDuChef();
  };
  // Répondue d'ici, la carte ouverte est postée : l'écran dit l'envoi.
  if (vueDesCards.vu === "carte") {
    const { projet: project, ticket } = vueDesCards.carte;
    if (answersAuxCards.get(`${project}#${ticket}`)?.etat.etape === "postee") vueDesCards = { vu: "envoyee", projet: project, ticket };
  }
  const vue = vueDesCards;
  if (vue.vu === "envoyee") {
    const reste = cards.filter(({ projet: project }) => project === vue.projet).length;
    return cardsDuChef.replaceChildren(...poserLEnvoi(document, { ticket: vue.ticket, projet: vue.projet, reste, total: cards.length, retour }));
  }
  if (vue.vu === "carte") {
    const { projet: name, ticket } = vue.carte;
    const cle = `${name}#${ticket}`;
    // La carte telle que la dernière lecture la dit ; partie du rail, elle ne s'ouvre plus : retour à la liste.
    const lue = cards.find((un) => un.projet === name && un.ticket === ticket);
    const project = configuration.projets.find((un) => un.nom === name);
    if (lue === undefined || project === undefined) return retour();
    // La carte « Validate its screen » (ticket 3185) : la même que dans TODO, ses boutons en 44 px.
    if (estUneValidation(lue.todo)) {
      const rendreLeChamp = garderLeClavier(document.activeElement, cardsDuChef);
      cardsDuChef.replaceChildren(...poserLaCardAPart(document, { carte: lue, total: cards.length, retour }, poserLaValidation(project, ticket, lue.todo, true)));
      rendreLeChamp();
      return;
    }
    // La carte « review before merge » (ticket 3224) : la même que dans TODO, ses boutons en 44 px.
    if (estUneRevue(lue.todo)) {
      const rendreLeChamp = garderLeClavier(document.activeElement, cardsDuChef);
      cardsDuChef.replaceChildren(...poserLaCardAPart(document, { carte: lue, total: cards.length, retour }, poserLaRevue(project, ticket, lue.todo, true)));
      rendreLeChamp();
      return;
    }
    const state = stateDeLaCard(project, ticket, lue.todo);
    const refusal = state.etape === "refus" ? { dit: state.dit, detail: state.detail } : undefined;
    const rendreLeChamp = garderLeClavier(document.activeElement, cardsDuChef);
    const posee = poserLaCardDuChef(document, {
      carte: lue,
      total: cards.length,
      brouillon: brouillonsDeCards.get(cle) ?? "",
      enRoute: state.etape === "envoi",
      ...(refusal === undefined ? {} : { refus: refusal }),
      retour,
      ecrire: (texte) => {
        brouillonsDeCards.set(cle, texte);
        questionsDesBrouillons.set(cle, lue.todo.question ?? lue.todo.resume ?? null);
      },
      repondre: (answer) => void repondreALaCard(project, ticket, answer),
    });
    cardsDuChef.replaceChildren(...posee);
    rendreLeChamp();
    return;
  }
  const cuisent = homeVu === undefined ? undefined : homeVu.projets.filter((line) => stateDeLaLine(line) === "cooking").length;
  const opinion = phoneVu?.github === undefined ? [] : poserLaListeGitHub(document, phoneVu, configuration.projets.length, () => void oublierLePhone());
  cardsDuChef.replaceChildren(
    ...poserLaListeDesCards(document, {
      cartes: cards,
      avis: opinion,
      tete: lesLinesDuBreaker(),
      ...(cuisent === undefined ? {} : { ailleurs: AILLEURS(cuisent) }),
      ouvrir: (cardItem) => {
        vueDesCards = { vu: "carte", carte: cardItem };
        poserLesCardsDuChef();
      },
    }),
  );
}

// Chaque geste d'une entrée du TODO (kitchen/, `gestesDuTodo`, ticket 4261), joué comme sur sa carte : la réponse d'un
// choix, la validation d'un écran, le merge d'une revue, la reprise d'une carte de WAITING ou son « it arrived ».
/** @type {Record<import("./kitchen/kitchen.js").SorteDeAction, (project: Project, ticket: number, answer?: import("../card-todo.ts").Answer) => void>} */
const ACTIONS_DU_TODO = {
  repondre: (project, ticket, answer) => void repondreALaCard(project, ticket, /** @type {import("../card-todo.ts").Answer} */ (answer)),
  valider: (project, ticket) => void validerLaCard(project, ticket, { geste: "valider" }),
  merger: (project, ticket) => void repondreALaRevue(project, ticket, { geste: "merger" }),
  "attente-reprendre": (project, ticket) => void ecrireWait(project, "attente-reprendre", ticket),
  "attente-arrivee": (project, ticket) => void arriver(project, ticket),
};

// La réponse du chef à une carte de TODO part par le process principal (card-todo.ts) — une seule à la
// fois. Postée, la carte dit qu'elle attend la cuisine, et le tableau est relu tout de suite ; refusée, elle
// garde ses gestes, et dit pourquoi.
/** @param {Project} project @param {number} ticket @param {import("../card-todo.ts").Answer} answer */
async function repondreALaCard(project, ticket, answer) {
  const cle = `${project.nom}#${ticket}`;
  if (answersAuxCards.get(cle)?.etat.etape === "envoi") return;
  // Répondre est le geste qui finit la saisie : la carte n'est plus tenue, elle dit où en est sa réponse.
  lacherLaCardDe(project.nom, ticket);
  /** @param {import("./card-todo.js").State} state */
  const poser = (state) => {
    answersAuxCards.set(cle, { question: answer.question, etat: state });
    if (courant?.nom === project.nom) poserRail(project);
    poserLesCardsDuChef();
  };
  poser({ etape: "envoi", reponse: answer });
  /** @type {import("../card-todo.ts").Rendu | undefined} */
  let rendu;
  try {
    rendu = await brigade.repondreCarte(project.nom, ticket, answer);
  } catch (error) {
    rendu = { refus: "nothing was sent: the app could not ask the station", detail: error instanceof Error ? error.message : String(error) };
  }
  const suite = apresLaCard(answer, rendu);
  if (suite.etape === "postee") brouillonsDeCards.delete(cle);
  poser(suite);
  if (suite.etape === "postee") lireLesFacts();
}

// Le projet pas préparé pour Brigade (ticket 2628, épique 2584) : `checkRepoSetup` le lit une fois, à la première pose ;
// `runRepoSetup` le prépare, le même geste que l'ajout d'un projet. Préparé, l'avis s'en va sans recharger.
/** @param {Project} project @param {"page" | "todo"} lieu */
function opinionDuRepository(project, lieu) {
  // Un dépôt où le compte ne peut pas écrire ne se prépare pas d'ici (ticket 3163) : la ligne de lecture seule le dit.
  if (!seLit(project) || project.depot === undefined || readOnlyDe(project) !== undefined) return undefined;
  const state = depots.get(project.nom);
  if (state === undefined) {
    depots.set(project.nom, REPOSITORY_INCONNU);
    void lireLeRepository(project);
    return undefined;
  }
  // Le projet n'est pas prêt et sa page le dit, une question à la fois (ticket 3166) : l'avis n'y ajoute pas un second geste.
  if (journeyOuvert(project.nom)) return undefined;
  const preparer = () => void preparerLeRepository(project);
  return lieu === "page" ? poserOpinionDeRepository(document, "page", state, preparer) : poserOpinionDuTodo(document, state, preparer);
}

/** @param {Project} project @param {import("./page-project/repository-non-prepare.js").State} state */
function poserLeRepository(project, state) {
  depots.set(project.nom, state);
  demandesDeStation.preparation(project.nom, state.etape);
  if (courant?.nom !== project.nom) return;
  poserLeProjectAPreparer();
  poserAlerts(project);
  poserRail(project);
}

// Rend la phrase d'une lecture qui n'a pas abouti — la page d'un projet pas prêt la dit (ticket 3166) —, rien si elle a abouti.
/** @param {Project} project @returns {Promise<string | undefined>} */
async function lireLeRepository(project) {
  const lire = /** @type {any} */ (brigade).checkRepoSetup;
  if (typeof lire !== "function" || project.depot === undefined) return NON_ATTEINT("the setup check");
  try {
    poserLeRepository(project, apresLaReadDuRepository(await lire(project.depot)));
    return undefined;
  } catch (error) {
    // Une lecture qui échoue ne dit rien de plus sur l'avis : le projet est tenu pour préparé, la prochaine ouverture relit.
    depots.delete(project.nom);
    return phraseDuRefusal(error);
  }
}

/** @param {Project} project */
async function preparerLeRepository(project) {
  const state = depots.get(project.nom);
  const preparer = /** @type {any} */ (brigade).runRepoSetup;
  if (state === undefined || (state.etape !== "manque" && state.etape !== "refus") || typeof preparer !== "function" || project.depot === undefined) return;
  const { verif } = state;
  poserLeRepository(project, { etape: "en-route", verif });
  try {
    poserLeRepository(project, apresLaReadDuRepository(await preparer(project.depot)));
  } catch (error) {
    poserLeRepository(project, { etape: "refus", verif, dit: phraseDuRefusal(error) });
  }
}

// La page des coûts de l'app (ticket 1022). En tête (cost/tete.js), les tokens lancés sur 5 h, 24 h et 7 jours,
// tous projets confondus, et la part de chacun — chaque projet qui a une box, et qu'elle sert encore ;
// un clic sur son nom l'ouvre. Puis les tokens perdus (cost/perdus.js) — leur liste repliée à
// l'ouverture, un clic sur le chiffre la déploie —, les tickets les plus chers (cost/chers.js) — un clic
// sur un ticket, perdu ou cher, ouvre son projet et sa fiche —, et la courbe des derniers jours, une
// série par projet (cost/courbe.js).
let perdusOuverts = false;
function basculerPerdus() {
  perdusOuverts = !perdusOuverts;
  poserCost();
}
/** @param {{ nom: string, couleurs?: { onglet?: string, accent?: string } }} projet */
const projectDuCost = ({ nom: name, couleurs }) => ({ nom: name, teinte: couleurs?.onglet ?? couleurs?.accent });
// Les chiffres d'autonomie de tous les projets ensemble (autonomy/figures.js, ticket 3222), à côté de leur coût : ceux
// que la page des coûts montre, lus de GitHub.
/** @type {ReturnType<typeof holdLesFiguresDAutonomy> | undefined} */
let autonomyDeTous;
const ouvrirTicketDAutonomy = (/** @type {string} */ url) => void brigade.ouvrirTicketDAutonomie(url);
function poserCost() {
  if (pageDeLApp !== COUTS) return corpsDesCouts.replaceChildren();
  const projects = configuration.projets.filter((project) => seLit(project)).map(projectDuCost);
  autonomyDeTous ??= holdLesFiguresDAutonomy(document, {
    tous: true,
    lire: (jours) => brigade.lireAutonomie(configuration.projets.filter((project) => seLit(project)).map(({ nom: name }) => name), jours),
    ouvrir: ouvrirTicketDAutonomy,
  });
  corpsDesCouts.replaceChildren(
    poserTete(document, projects, coutsLus, ouvrirDepuisLesCouts),
    autonomyDeTous.poser(),
    poserPerdus(document, projects, coutsLus, titreSurLeRail, perdusOuverts, basculerPerdus, ouvrirTicketDepuisLesCouts),
    poserChers(document, projects, coutsLus, titreSurLeRail, ouvrirTicketDepuisLesCouts, configuration.quotaMax, undefined, (name, ticket) => cardSurLeRail(name, ticket)?.moteur),
    poserCourbe(document, projects, coutsLus),
  );
}
// Un projet cliqué sur la page des coûts : son espace s'ouvre.
/** @param {string} name */
function ouvrirDepuisLesCouts(name) {
  const project = projectDe(name);
  if (project !== undefined) void ouvrir(project);
}
// Un ticket cliqué sur la page des coûts : son projet s'ouvre, puis sa fiche, par-dessus le rail. La
// fiche refermée rend le clavier au rail : le bouton cliqué n'est plus à l'écran.
/** @param {string} name @param {number} ticket */
async function ouvrirTicketDepuisLesCouts(name, ticket) {
  const project = projectDe(name);
  if (project === undefined) return;
  await ouvrir(project);
  // Le chef a pu cliquer ailleurs pendant que l'espace s'ouvrait.
  if (courant !== project) return;
  openCostCard(name, ticket, rail);
}

// La carte d'un ticket sur le rail d'un projet, si son rail est lu et qu'il y est.
/** @param {string} name @param {number} ticket */
function cardSurLeRail(name, ticket) {
  const tenu = tenus.get(name);
  if (tenu === undefined || !("tableau" in tenu)) return undefined;
  const { colonnes, hors: outside } = tenu.tableau.rail;
  return [...colonnes.flatMap(({ cartes: cards, autres }) => [...cards, ...(autres ?? [])]), ...outside].find((cardItem) => cardItem.ticket === ticket);
}

/** @param {string} name @param {number} ticket */
const titreSurLeRail = (name, ticket) => cardSurLeRail(name, ticket)?.titre;

// Un clic sur un ticket d'une cause d'échec, ou sur un des tickets perdus ou les plus chers du projet,
// dans la fiabilité de Cooks — ou sur la page des coûts de l'app, une fois son projet ouvert —, ou sur celui que la
// cuisine a ouvert seule pour ramener ses gates sous leur budget, en tête de la file, ouvre sa fiche,
// par-dessus l'onglet. Un ticket que le rail ne porte pas s'ouvre avec ce qu'en dit la dernière lecture de
// ce qui est en amont — son titre, son issue —, à défaut avec ce que l'on en sait : son numéro.
/** @param {string} name @param {number} ticket @param {HTMLElement} retour */
function openCostCard(name, ticket, retour) {
  const project = configuration.projets.find((candidat) => candidat.nom === name);
  if (project === undefined) return;
  const sans = { sans: "not communicated — the rail of this project is not read" };
  const amont = amonts.get(name);
  const enAmont = amont === undefined || !("groupes" in amont) ? undefined : amont.groupes.flatMap(({ issues }) => issues).find((issue) => issue.ticket === ticket);
  const cardItem =
    cardSurLeRail(name, ticket) ??
    enAmont?.carte ??
    { ticket, ouvrable: false, attendu: false, attend: [], dit: [], fiche: { titre: sans, priorite: sans, issue: sans } };
  openCard(project, cardItem, retour);
}

/** @param {Project} project @param {number} ticket */
async function ouvrirIssue(project, ticket) {
  nonEcrit = (await brigade.ouvrirIssue(project.nom, ticket)) ? "" : `issue #${ticket} was not opened: it is no longer in the latest facts read, its address is not https, or the workstation could not open it`;
  show();
}

// Les checks du dépôt d'un projet, d'une alerte du rail qui en nomme un sans autre geste (ticket 4238) : l'adresse reste au
// process principal, comme celle d'une issue.
/** @param {Project} project */
async function ouvrirLesChecks(project) {
  nonEcrit = (await brigade.ouvrirLesChecks(project.nom)) ? "" : "the repository's checks were not opened: the latest facts read give no issue address to find the repository from, or the workstation could not open it";
  show();
}

// La PR du cook d'un ticket, depuis sa fiche (ticket 1846) : son adresse reste au process principal, comme celle de l'issue.
/** @param {Project} project @param {number} ticket */
async function ouvrirPrDuCook(project, ticket) {
  nonEcrit = (await brigade.ouvrirPrDuCook(project.nom, ticket)) ? "" : `the PR of #${ticket}'s cook was not opened: the latest reading of GitHub no longer gives it, its address is not https, or the workstation could not open it`;
  show();
}

/** @param {Project} project @param {number} ticket */
async function ouvrirPr(project, ticket) {
  nonEcrit = (await brigade.ouvrirPr(project.nom, ticket)) ? "" : `the PR of #${ticket} was not opened: it is no longer among the served tickets of the latest facts read, its address is not https, or the workstation could not open it`;
  show();
}

// L'interrupteur de l'espace, en tête, à droite des onglets (tickets 906, 1406) : une glissière et son
// mot — « project on », « project off » —, lisible sans rien lire d'autre, et un clic le bascule. Ce qui
// en a été lu, mot pour mot, est au survol, avec ce que le clic fait. Pas encore lu, ou pas lu : il ne
// dit ni l'un ni l'autre, et ne bascule rien — ce n'est pas « éteint ». Sa confirmation, quand le clic
// en ouvre une, se pose dessous.
/**
 * @param {string} name @param {boolean | undefined} allume indéfini : pas lu
 * @param {{ pourquoi: string, eteindre: string, allumer: string, clic: () => void, confirmation?: HTMLElement }} pose
 * @returns {HTMLElement[]}
 */
function toggle(name, allume, { pourquoi, eteindre, allumer, clic, confirmation }) {
  const bascule = switchDeLApp(
    document,
    {
      texte: `${name} ${allume === undefined ? "…" : allume ? "on" : "off"}`,
      allume,
      libelle: `the ${name}: ${allume === undefined ? "not read" : allume ? "on" : "off"}`,
      titre: `${pourquoi}${allume === undefined ? "" : `\n${allume ? eteindre : allumer}`}`,
    },
    clic,
  );
  return [bascule, ...(confirmation === undefined ? [] : [confirmation])];
}

// L'interrupteur de l'espace du projet, un seul pour tout le projet (ticket 1406) : allumé, les tickets lancés
// sont pris, le manager juge et découpe, une livraison verte est mergée ; éteint, rien de neuf ne l'est.
// Éteindre part au clic, dans le second ; allumer ouvre sa confirmation, qui dit en une phrase ce que
// le manager va juger. Sa ligne `manager` — le manager le suit, et c'est elle qui le dit —, mot pour
// mot, est au survol.
function poserSwitch() {
  const project = courant;
  // En lecture seule (ticket 3163), le projet ne s'allume ni ne s'éteint d'ici.
  const cache = project === undefined || !seLit(project) || readOnlyDe(project) !== undefined;
  switchProject.hidden = cache;
  if (project === undefined || cache) return switchProject.replaceChildren();
  const cle = JSON.stringify(["projet-allumer", "", "interrupteur"]);
  const ouverte = aConfirmer?.projet === project.nom && aConfirmer.cle === cle ? aConfirmer : undefined;
  const confirmation = ouverte === undefined ? undefined : poserConfirmation(project, ouverte);

  const state = statesDuManager.get(project.nom);
  const lu = state !== undefined && !("sans" in state) ? state : undefined;
  switchProject.replaceChildren(
    ...toggle("project", lu?.allume, {
      pourquoi: state === undefined ? "the project switch: first read in progress" : "sans" in state ? `the project switch is not read: ${state.sans}` : state.releve,
      eteindre: "click to switch it off — nothing new is taken, split or merged: it goes straight into the second",
      allumer: "click to switch it on: says first what the manager will judge — nothing goes before your “yes”",
      clic: () => (lu?.allume ? void ecrireAction("projet-eteindre") : void ouvrirConfirmation(project, cle, "projet-allumer")),
      ...(confirmation === undefined ? {} : { confirmation }),
    }),
  );
}

// Le code de l'app, et les clones de brigade parmi les projets, sous cette machine dans Settings (ticket 1700) : une
// ligne chacun — son état en une phrase, l'heure de sa lecture et ce que le process principal en dit au survol
// (retard.ts) —, et son seul geste quand il en a un. L'app en retard, ou à relancer : un bouton la met à jour et la
// relance, sans terminal (rattrapage.ts). Le clone d'un projet en retard : la commande qui le met à jour est un bouton,
// elle s'écrit dans un shell, et rien ne l'envoie. La case du logo de la barre le dit aussi, quel que soit l'écran.
function poserCode() {
  const entree = document.getElementById("entree-tous");
  if (entree !== null) {
    entree.classList.toggle("perime", codeVu?.alerte !== undefined);
    entree.title = codeVu?.alerte === undefined ? "All projects" : `All projects — ${codeVu.alerte}`;
    entree.ariaLabel = entree.title;
  }
  if (codeVu === undefined) {
    code.hidden = false;
    code.replaceChildren(rangeeDeSetting("this app", [bloc("span", "first read of how far its code is behind origin in progress…")], []));
    return poserLesGroupes();
  }
  const heure = heureDe(codeVu.a);
  code.replaceChildren(
    ...codeVu.clones.map(({ id, etat: state, tete, lignes: lines, commande: command, bouton: gesture }, rang) => {
      const dit = bloc("span", tete);
      dit.dataset.etat = state;
      const aide = [`${state === "pas-lu" ? "tried at" : "read at"} ${heure}, re-read when you come back to the window`, ...lines].join("\n");
      /** @type {HTMLElement[]} */
      const controle = [];
      if (gesture !== undefined) {
        const cree = button(enPassage ? "updating — the app relaunches itself…" : gesture, () => void passer(), "recommande");
        cree.disabled = enPassage;
        controle.push(cree);
      } else if (command !== undefined) controle.push(buttonDeCommand(command, () => void mettreADay(id)));
      // Ce qui n'a pas été écrit, ou pas fait, se lit sous la première ligne, jusqu'à la prochaine demande.
      return rangeeDeSetting(rang === 0 ? "this app" : "a brigade clone", [dit, survol(document, aide)], controle, rang === 0 ? refusalDeSetting(nonMisADay) : []);
    }),
  );
  // L'app installée n'a pas de clone (emplacements.ts) : sans rien à dire, la ligne n'est pas posée.
  code.hidden = code.childElementCount === 0;
  poserLesGroupes();
}

// L'app passe à la nouvelle version : elle se met à jour, puis se ferme et repart d'elle-même —
// rien ne revient. Ce qui revient, c'est pourquoi elle reste sur son code : lu sous les clones.
async function passer() {
  nonMisADay = "";
  enPassage = true;
  poserCode();
  try {
    const rendu = await brigade.passer();
    if (rendu !== undefined) nonMisADay = rendu.refus;
  } catch (error) {
    nonMisADay = `this app was not updated: ${error instanceof Error ? error.message : String(error)}`;
  }
  enPassage = false;
  poserCode();
}

// Une ligne de l'accueil : sa pastille, son nom, ce qui s'y passe — et, au survol, ce qu'elle tait.
// Toute la ligne est un bouton : un clic n'importe où l'ouvre. Elle ne porte aucun autre geste.
/** @param {string} name @param {{ ton: string, dit: string, survol: string, raison?: { phrase: string, survol: string } }} ligne @param {() => void} ouvrirLa */
function lineDHome(name, { ton, dit, survol, raison }, ouvrirLa) {
  const cree = document.createElement("button");
  cree.type = "button";
  cree.className = "ligne";
  cree.title = survol;
  cree.ariaLabel = `${name} — ${dit}${raison === undefined ? "" : ` — ${raison.phrase}`}`;
  const appele = bloc("strong", name);
  appele.className = "mono";
  const suite = bloc("span", "›");
  suite.className = "ouvrir";
  suite.ariaHidden = "true";
  const pourquoi = bloc("span", raison?.phrase ?? "");
  pourquoi.className = "pourquoi";
  pourquoi.title = raison?.survol ?? "";
  cree.append(pill(dit, ton), appele, bloc("span", dit), ...(raison === undefined ? [] : [pourquoi]), suite);
  cree.addEventListener("click", ouvrirLa);
  return cree;
}

// La ligne d'une station sur l'accueil : un clic l'ouvre ; à côté, le bouton de ce qui l'empêche de cuire.
// Une station aussi enregistrée sous le compte GitHub du chef (ticket 1778) : ce qui lui est choisi se fond dans sa ligne
// (stations-du-account.js, `ligneFondue`) ; ses cases à cocher sont sur la page de la station.
/** @param {import("../home.ts").LineDeStation} presence @param {import("../stations-du-account.ts").StationEnregistree} [enregistree] */
function lineDeStationDeLHome(presence, enregistree) {
  const vue = stationsVues?.stations.find(({ id }) => id === presence.id);
  const station = lineFondue(presence, vue?.projets ?? [], enregistree);
  const line = lineDHome(station.nom, station, () => ouvrirStation(station.id));
  const actions = [];
  // Une station qui ne cuit pas encore : le bouton de sa raison, un geste que l'app fait (stations/raison.ts).
  if (station.raison !== undefined) {
    const { geste: gesture, libelle } = station.raison.bouton;
    const remede = /** @type {HTMLButtonElement} */ (button(libelle, undefined));
    remede.className = "remede-de-station";
    remede.ariaLabel = `${libelle} — ${station.nom}`;
    remede.addEventListener("click", () => {
      if (gesture === "ouvrir-la-page") ouvrirStation(station.id);
      else if (gesture === "ajouter-un-projet") ouvrirAddition();
      else {
        remede.disabled = true;
        void brigade.panne(station.id, "relire-la-station").finally(() => (remede.disabled = false));
      }
    });
    actions.push(remede);
  }
  if (actions.length === 0) return line;
  const rang = document.createElement("div");
  rang.className = "ligne-et-geste";
  const aSide = document.createElement("span");
  aSide.className = "gestes-de-la-ligne";
  aSide.append(...actions);
  rang.append(line, aSide);
  return rang;
}

// Le N de « TODO (N) » d'un projet dont le rail est lu, que l'accueil montre aussi (ticket 3458) : le même compte, des mêmes
// cartes. Rien tant que ce qui attend le chef n'est pas lu — la box muette, la liste pas lue : l'accueil garde alors ce que
// le process principal en dit (home.ts).
/** @param {string} name @returns {number | undefined} */
function accountDuTodo(name) {
  const tenu = tenus.get(name);
  if (tenu === undefined || !("tableau" in tenu) || muets.has(name)) return undefined;
  const { compte: account } = rangerLeRail(sansLesValidees(tenu.tableau.rail.colonnes, valideesDe(name)));
  return account === "?" ? undefined : Number(account);
}
// Le compte que l'accueil montre de chaque projet, à sa dernière pose : une lecture qui le change le repose.
/** @type {Map<string, number | undefined>} */
const todosDeLHome = new Map();

// L'accueil : les projets dans l'ordre du fichier, puis les stations, puis la santé — tels que le
// process principal les a dits (home.ts). Un projet qu'il ne dit pas encore attend sa première lecture.
function poserHome() {
  const lines = new Map((homeVu?.projets ?? []).map((line) => [line.nom, line]));
  // Une ligne par projet (home/projects/) : son état parmi les quatre, ses stations, et toute la ligne l'ouvre.
  const actionsDuBloc = { ouvrir: (/** @type {string} */ name) => {
      const project = configuration.projets.find((un) => un.nom === name);
      if (project !== undefined) void ouvrir(project);
    }, ajouter: ouvrirAddition, pastille: pill };
  const desProjects = linesDeProjects(
    document,
    configuration.projets.map((project) => {
      /** @type {import("../home.ts").LineDeProject} */
      const attendue = { nom: project.nom, ton: "gris", dit: "first read in progress…", survol: "" };
      const line = lines.get(project.nom) ?? attendue;
      const stations = (stationsVues?.stations ?? []).filter(({ projets: projects }) => projects.includes(project.nom)).map(({ nom: name }) => name);
      // Ce qui attend le chef : le compte de « TODO (N) » quand son rail est lu, sinon celui du process principal.
      const todo = accountDuTodo(project.nom);
      todosDeLHome.set(project.nom, todo);
      const awaiting = todo ?? line.attend;
      return { nom: project.nom, etat: stateDeLaLine(line), stations, maintenant: maintenantDeLaLine(line), ...(awaiting === undefined ? {} : { attend: awaiting }), survol: `${line.dit}${line.survol === "" ? "" : ` — ${line.survol}`}` };
    }),
    actionsDuBloc,
  );
  // Sur le téléphone, les projets sont ceux qu'il lit sur GitHub, connecté (connection-github.js) : la section dit ce
  // qui manque à leur liste.
  projectsDeLHome.replaceChildren(
    ...(phoneVu?.github !== undefined
      ? [...poserLaListeGitHub(document, phoneVu, desProjects.length, () => void oublierLePhone()), ...desProjects]
      : desProjects.length === 0
        ? (phoneVu === undefined
          ? [bloc("p", `${PAS_ENCORE("project")} “+” in the bar adds one.`)]
          : [bloc("p", `${PAS_ENCORE("project on this phone")} A project is added from a computer.`)])
        : desProjects),
  );
  // « Add a project » est à droite du titre du bloc (Home.dc.html) ; un téléphone n'ajoute pas de projet.
  poserAddition(blocDesProjects, phoneVu === undefined ? buttonDAddition(document, actionsDuBloc, desProjects.length === 0) : undefined);
  poserLesCardsDuChef();
  poserLeRecapDeLHome();
}

// Le récapitulatif de chaque projet qui se lit (ticket 3581, recap/) : ce que sa cuisine a fait depuis que le chef a regardé,
// lu une fois par ouverture de l'app par la commande `recap` de son runtime (recap/recap-box.ts), et ce qui attend le chef
// dans TODO — les cartes que TODO montre à cet instant. Dès que l'accueil le montre, rien ne le couvrant, le runtime en est
// averti, une fois par projet : son marqueur avance jusqu'à l'instant que ce récapitulatif couvrait, et la prochaine
// ouverture ne redit que ce qui est plus neuf. Un marquage refusé se retente à la pose suivante. Un pont qui ne le porte
// pas (le téléphone), ou qui ne rend rien pour un projet, n'en montre aucun : sans projet à montrer, le bloc n'est pas posé.
function poserLeRecapDeLHome() {
  if (brigade.lireLeRecap === undefined) return recapDeLHome.replaceChildren();
  const projects = configuration.projets.filter((project) => seLit(project));
  for (const { nom: name } of projects) {
    if (recapsLus.has(name) || recapsEnRead.has(name)) continue;
    recapsEnRead.add(name);
    void Promise.resolve()
      .then(() => brigade.lireLeRecap?.(name))
      .then(
        (lue) => (lue !== null && typeof lue === "object" ? lue : null),
        (/** @type {unknown} */ error) => ({ sans: NON_ATTEINT("recap"), detail: error instanceof Error ? error.message : String(error) }),
      )
      .then((lue) => {
        recapsEnRead.delete(name);
        recapsLus.set(name, lue);
        poserLeRecapDeLHome();
      });
  }
  const entrees = projects.flatMap(({ nom: name }) => {
    const read = recapsLus.get(name);
    if (read === null) return [];
    const tenu = tenus.get(name);
    const todo = tenu === undefined || !("tableau" in tenu) || muets.has(name) ? undefined : ceQuiAwaitingDansTodo(sansLesValidees(tenu.tableau.rail.colonnes, valideesDe(name)));
    return [{ projet: name, lecture: read, todo }];
  });
  recapDeLHome.replaceChildren(...(entrees.length === 0 ? [] : [poserLeRecap(document, entrees, { ouvrir: (url) => void brigade.ouvrirLaPRDuRecap?.(url) })]));
  // Sa place : sous les premières lignes de l'accueil, au-dessus des projets — quand l'accueil est là.
  if (entrees.length === 0) recapDeLHome.remove();
  else if (recapDeLHome.parentElement !== tous && blocDeLaPromesse.parentElement === tous) blocDeLaPromesse.after(recapDeLHome);
  // Montré : l'accueil est à l'écran avec lui — ni caché, ni couvert par « since you were away » ou une page.
  if (tous.hidden || recapDeLHome.parentElement !== tous || !sectionAbsence.hidden) return;
  for (const { projet: project, lecture: read } of entrees) {
    if (read === undefined || !("recap" in read) || recapsMarques.has(project)) continue;
    recapsMarques.add(project);
    void Promise.resolve()
      .then(() => brigade.marquerLeRecap?.(project, read.recap.until))
      .then(
        (rendu) => {
          if (rendu === undefined || rendu === null || !("seenUntil" in rendu)) recapsMarques.delete(project);
        },
        () => void recapsMarques.delete(project),
      );
  }
}

// La page d'une station : en tête, son nom, sa pastille et son état en une phrase — « online · 2 cooks
// running », « offline for 12 min » (home.ts) ; sa machine et sa version ne se lisent
// qu'au survol de l'icône d'aide, jamais dans la page. Dessous, ses pannes, chacune avec son bouton ;
// puis les projets qu'elle sert, à lire.
function poserPageDeStation() {
  const station = stationsVues?.stations.find(({ id }) => id === stationOuverte);
  const line = homeVu?.stations?.find(({ id }) => id === stationOuverte);
  const enregistree = enregistreeOuverte();
  if (station === undefined && enregistree !== undefined) {
    // Une machine seulement enregistrée sous le compte du chef : ni pannes, ni plafond, ni retrait — que son état et ses projets.
    const titre = bloc("h2", enregistree.name);
    titre.className = "mono";
    const phrase = stateDit(enregistree);
    const phraseDite = bloc("span", phrase);
    phraseDite.className = "phrase";
    enTeteDeStation.replaceChildren(titre, pill(phrase, tonDe(enregistree)), phraseDite, survol(document, detailsDe(enregistree)));
    poserLesSectionsDeStation({ id: enregistree.id, nom: enregistree.name });
    outagesDeStation.replaceChildren();
    capDeStation.replaceChildren();
    versionDeStation.replaceChildren();
    retraitDeStation.replaceChildren();
  } else if (station === undefined) {
    enTeteDeStation.replaceChildren(bloc("p", stationsVues === undefined ? READ_DE("your stations on GitHub") : "this station is no longer paired with this app"));
    poserLesSectionsDeStation(undefined);
    outagesDeStation.replaceChildren();
    capDeStation.replaceChildren();
    versionDeStation.replaceChildren();
    retraitDeStation.replaceChildren();
  } else {
    const titre = bloc("h2", station.nom);
    titre.className = "mono";
    const phrase = line?.phrase ?? station.dit;
    const stateDit = bloc("span", phrase);
    stateDit.className = "phrase";
    // Illisible, ce qui se lit au survol est pourquoi.
    const details = station.etat === "illisible" ? station.ligne : (line?.survol ?? station.machine);
    // Hors ligne, la panne dessous le dit déjà, avec son bouton : l'en-tête ne le redit pas.
    const dejaDit = station.pannes.some(({ sujet }) => sujet === "injoignable");
    enTeteDeStation.replaceChildren(titre, pill(phrase, line?.ton), ...(dejaDit ? [] : [stateDit]), ...(details === "" ? [] : [survol(document, details)]), ...(line?.note === undefined ? [] : [bloc("p", line.note)]), poserLesCalls(document, line?.appels));
    poserCap(line);
    versionDeStation.replaceChildren(...(station.versionDit ? [bloc("span", station.versionDit)] : []));
    outagesDeStation.replaceChildren(...station.pannes.map((outage) => poserOutage(station, outage)));
    poserLesSectionsDeStation({ id: station.id, nom: station.nom });
    poserRetireLaStation(station);
  }
  poserProjects();
}

// Ce que les sections de la page posées disent : la station, son nom, et la station de ce poste. Elles ne se reposent
// que lorsque l'un d'eux change — une relecture de l'accueil ne les redessine pas — ; la dernière demandée l'emporte.
let sectionsDeStationPosees = "";
/** @param {{ id: string, nom: string } | undefined} station */
function poserLesSectionsDeStation(station) {
  if (station === undefined) {
    sectionsDeStationPosees = "";
    return sectionsDeStation.replaceChildren();
  }
  const locale = projectsVus?.locale ?? null;
  const vue = stationsVues?.stations.find(({ id }) => id === station.id);
  const max = vue?.max ?? null;
  const posees = JSON.stringify([station.id, station.nom, locale, max, vue?.maxDepuis ?? null]);
  if (posees === sectionsDeStationPosees) return;
  sectionsDeStationPosees = posees;
  const repose = () => {
    sectionsDeStationPosees = "";
    poserLesSectionsDeStation(station);
  };
  // Le compte GitHub ne se lit que pour la station de cet ordinateur : c'est son `gh`.
  const account = station.id === locale ? (brigade.compteGitHub?.() ?? Promise.resolve(undefined)).catch(() => undefined) : Promise.resolve(undefined);
  const connections = {
    claude: max === null ? null : { etat: max, depuis: vue?.maxDepuis ?? null },
    gestes: {
      changerGitHub: async () => {
        const debut = (await brigade.seConnecterAGitHub?.()) ?? { refus: "GitHub sign-in could not be started: the app gave no answer." };
        // Un refus se dit sous la rangée, en ligne d'erreur (sections/connexions.js).
        if ("refus" in debut) return { refus: debut.refus };
        repose();
      },
      renouveler: async () => {
        const outage = vue?.pannes.find(({ sujet }) => sujet === "connexion-max");
        if (outage === undefined) return "Claude Code is signed in: there is nothing to renew yet.";
        const rendu = await brigade.panne(station.id, outage.cle);
        siClaudeManque(rendu);
        return "refus" in rendu ? { refus: rendu.refus } : rendu.fait;
      },
    },
  };
  const settings = brigade.lireReglagesDeLaStation === undefined ? undefined : { lire: async () => (await brigade.lireReglagesDeLaStation?.()) ?? { refus: NON_ATTEINT("folders and sandbox") }, ecrire: async (/** @type {any} */ c) => (await brigade.ecrireReglagesDeLaStation?.(c)) ?? { refus: "nothing was changed" } };
  void account.then((github) => poserLaCoqueDeStation(document, { station, locale, reglages: settings, connexions: { ...connections, github } })).then((page) => {
    if (sectionsDeStationPosees === posees) sectionsDeStation.replaceChildren(page);
  });
}

// L'enregistrement de la station dont la page est ouverte : celui de la machine que la ligne de la liste a fondue avec sa
// présence, ou, seulement enregistrée, celui qui porte cet id (stations-du-account.js, `uneLigneParMachine`).
function enregistreeOuverte() {
  const lues = enregistreesAbsentes ? undefined : stateDesEnregistrees.stations;
  if (lues?.state !== "listed") return undefined;
  const line = uneLineParMachine(homeVu?.stations ?? [], lues.stations).find((une) => ("appairee" in une ? une.appairee.id : une.enregistree.id) === stationOuverte);
  return line?.enregistree;
}

// Le plafond de cooks de la station, comme sa box le dit — `3 at most — 8 cores`, ou `5 at most — set by you,
// replaces 3 (8 cores)`. Il se lit seulement : une station prend autant de tickets qu'elle déclare de places, et sa déclaration
// se change sur sa machine. Une station dont aucun projet lu ne dit le plafond n'a rien de tout cela.
/** @param {import("../home.ts").LineDeStation | undefined} line */
function poserCap(line) {
  if (line?.plafond === undefined) return capDeStation.replaceChildren();
  const { plafond: cap } = line;
  const lines = [];
  const dit = bloc("p", `Cooks at once: ${cap.dit}`);
  dit.className = "plafond";
  dit.append(niveauDe(document, "cooks"));
  lines.push(dit);
  capDeStation.replaceChildren(...lines);
}

// Sur la page d'une station, les projets qu'elle sert : ceux dont l'onglet Stations la montre parmi les stations qui le
// servent (station/page/StationProjects.js), chacun un lien vers cet onglet. Elle se lit seulement ; ce qu'elle sert se
// change depuis l'onglet du projet. Tant que les stations ne sont pas lues, le vide n'est pas sûr : la page le dit.
function poserProjects() {
  const station = stationsVues?.stations.find(({ id }) => id === stationOuverte);
  const enregistree = enregistreeOuverte();
  const ouverte = station !== undefined ? { id: station.id, nom: station.nom } : enregistree === undefined ? undefined : { id: enregistree.id, nom: enregistree.name };
  if (ouverte === undefined) return projectsDeLaStation.replaceChildren();
  const maintenant = Date.now();
  const projects = projectsServedPar(
    ouverte,
    configuration.projets.map(({ nom: name }) => name),
    (name) => {
      const project = projectDe(name);
      return project === undefined ? [] : servantesDe(readDesServantes(project, maintenant).base);
    },
  );
  const lisible = stationsVues !== undefined && station?.etat !== "illisible";
  projectsDeLaStation.replaceChildren(
    poserLesProjectsDeLaStation(document, { projets: projects, lisible }, {
      ouvrir: (name) => {
        const project = projectDe(name);
        if (project === undefined) return;
        retenir(name, STATIONS);
        void ouvrir(project);
      },
    }),
  );
}

// La station dont « remove the station » demande confirmation, par son gist.
/** @type {string | undefined} */
let retraitDeStationRequest;
// Ce que le retrait a refusé, en une ligne ; son détail est au survol.
let retraitDeStationRefuse = "";

// « Remove the station », en bas de sa page : un clic ouvre la confirmation, qui dit ce que ça change
// en une ligne ; « cancel » la referme et laisse la station en place, « remove » la retire de l'app
// et ramène à l'accueil. Rien de la station n'est touché : un code neuf l'appaire de nouveau.
/** @param {import("../stations/stations.ts").StationVue} station */
function poserRetireLaStation(station) {
  if (retraitDeStationRequest !== station.id) {
    const retirer = /** @type {HTMLButtonElement} */ (buttonDeLaFamille(document, "remove the station", undefined, { sorte: "danger" }));
    retirer.addEventListener("click", () => {
      retraitDeStationRequest = station.id;
      retraitDeStationRefuse = "";
      poserRetireLaStation(station);
    });
    return retraitDeStation.replaceChildren(retirer, ...(retraitDeStationRefuse === "" ? [] : [bloc("p", retraitDeStationRefuse)]));
  }
  retraitDeStation.replaceChildren(
    confirmationDeAction(
      document,
      { titre: `Remove ${station.nom} from this app?`, prix: `${station.nom} leaves the home and is no longer read; it keeps running, and pairs again with a new code`, oui: "remove", non: ANNULER },
      {
        non: () => {
          retraitDeStationRequest = undefined;
          poserRetireLaStation(station);
        },
        oui: () => void retirerLaStation(station),
      },
    ),
  );
}

/** @param {import("../stations/stations.ts").StationVue} station */
async function retirerLaStation(station) {
  retraitDeStationRequest = undefined;
  let rendu;
  try {
    rendu = await brigade.retirerLaStation(station.id);
  } catch (error) {
    rendu = { refus: `${station.nom} was not removed: ${error instanceof Error ? error.message : String(error)}` };
  }
  if ("refus" in rendu) {
    retraitDeStationRefuse = rendu.refus;
    return poserPageDeStation();
  }
  retraitDeStationRefuse = "";
  ouvrirTous();
}

// Ce qu'une station dit du projet qu'on lui a confié, en quelques mots, et le ton de sa pastille. Une station
// ajoutée est verte quand elle sert le projet, grise sinon.
/** @param {import("../projects/projects.ts").StationDuProject["etat"]} state */
function kitchenState(state) {
  if (state === "servi") return { dit: "served", ton: "vert" };
  if (state === "a-autoriser") return { dit: "waiting for your authorization on GitHub", ton: "jaune" };
  if (state === "en-preparation") return { dit: "being prepared", ton: "gris" };
  if (state === "refuse") return { dit: "refused", ton: "rouge" };
  return { dit: "not read yet", ton: "gris" };
}

// Une station déclarée par le projet qui n'en sert pas le dépôt : ce n'est pas qu'elle est hors ligne.
const NE_SERT_PAS = "does not serve this project";

// Les stations qui font la cuisine d'un projet de l'app : celles qui le servent — qu'il leur ait été
// confié d'ici ou non, elles le publient (stations/document.ts) —, puis celles à qui l'app l'a demandé
// et qui ne le servent pas encore. `demande` : l'app en a déjà demandé la cuisine — une station de plus
// en reprend le plafond et le calibrage ; `tenue` : une station en porte déjà le suivi.
/** @param {Project} project */
function kitchenOf(project) {
  // La box du projet ne répond pas : celles qui le servent sont dites injoignables, pas servies.
  const muette = muets.has(project.nom);
  const request = projectsVus?.projets.find(({ nom: name }) => name === project.nom);
  const servedCards = (stationsVues?.stations ?? []).filter(({ projets: projects }) => projects.includes(project.nom));
  const stations = [
    ...servedCards.map(({ id, nom: name }) => ({ id, nom: name, ...(muette ? { dit: "unreachable", ton: "rouge" } : kitchenState("servi")), pourquoi: "", geste: "", survol: muette ? `${name} does not answer: the app knows nothing of the kitchen right now` : `${name} serves it`, autoriser: /** @type {string[]} */ ([]), bloquee: false })),
    ...(request?.stations ?? [])
      .filter(({ id }) => !servedCards.some((served) => served.id === id))
      .map((station) => {
        // Une station ajoutée ne sert le projet que lorsqu'elle l'a lu ; avant, la ligne dit où elle en est.
        const lue = (stationsVues?.stations ?? []).find(({ id }) => id === station.id);
        // Déclarée par le projet, mais la station en sert d'autres et pas celui-ci : elle n'y cuit pas, et ce n'est pas qu'elle est hors ligne.
        const nonServed = station.etat === "attendu" && lue !== undefined && lue.projets.length > 0 && !lue.projets.includes(project.nom);
        const sans = nonServed ? { pourquoi: NE_SERT_PAS, geste: "tick it in its projects" } : station.etat === "attendu" ? { pourquoi: "not received by the station", geste: `open Brigade on ${station.nom}'s computer: it reads what this app asked within a minute; if it stays so, remove it from its page and add it again` } : station.etat === "a-autoriser" ? { pourquoi: "waiting for your authorization on GitHub", geste: "authorize the app on GitHub with the button beside it" } : undefined;
        return { id: station.id, nom: station.nom, ...kitchenState(station.etat), pourquoi: sans?.pourquoi ?? "", geste: sans?.geste ?? "", survol: station.dit, autoriser: station.autoriser, bloquee: nonServed };
      }),
  ];
  return { stations, demande: request !== undefined, tenue: servedCards.length > 0 || request?.suiviPar !== undefined };
}

// « Add a station » (ticket 2487) : offert sur un écran large — l'écran étroit ne règle rien —, pour un projet dont l'app
// connaît le dépôt. Cet ordinateur est proposé si sa station ne sert pas déjà le dépôt ; puis les stations du compte à qui
// il n'est pas choisi. Ouvrir relit l'une et l'autre lecture, et l'étape se repose avec elles.
/** @param {Project} project */
function additionDeStationDe(project) {
  const repository = project.depot ?? projectsVus?.projets.find(({ nom: name }) => name === project.nom)?.depot ?? "";
  // Ni en lecture seule (ticket 3163) : une station ajoutée ne pourrait rien écrire dans le dépôt.
  if (etroit() || repository === "" || readOnlyDe(project) !== undefined) return {};
  const read = servedOnes.etat?.lecture;
  const servedIci = read !== undefined && "depots" in read ? read.depots : undefined;
  const lues = enregistreesAbsentes ? undefined : stateDesEnregistrees.stations;
  return {
    ajout: {
      donnees: {
        projet: project.nom,
        ici: WORKSTATION.nom,
        iciOffert: servedIci !== undefined && !servedIci.some((served) => served.toLowerCase() === repository.toLowerCase()),
        stations: lues?.state === "listed" ? stationsAProposer(lues.stations, repository, projectsVus?.locale) : [],
      },
      etat: additionDeStation.etatDe(project.nom),
      gestes: {
        ouvrir: () => {
          additionDeStation.ouvrir(project.nom);
          void Promise.all([servedOnes.lire(), lireLesEnregistrees()]).then(reposerLOngletStations);
        },
        annuler: () => additionDeStation.annuler(project.nom),
        servirIci: () => additionDeStation.servirIci(project.nom, repository, WORKSTATION.nom),
        /** @param {import("../stations-du-account.ts").StationEnregistree} station */
        confier: (station) => additionDeStation.confier(project.nom, repository, station),
      },
    },
  };
}

// Ce que les stations du compte ont fait du dépôt du projet, choisi pour elles alors qu'une autre le servait déjà (ticket
// 1790, stations-du-account.js).
/** @param {Project} project */
function ajoutsDuProject(project) {
  const repository = project.depot ?? projectsVus?.projets.find(({ nom: name }) => name === project.nom)?.depot ?? "";
  return ajoutsDesEnregistrees(enregistreesAbsentes ? undefined : stateDesEnregistrees.stations, { nom: project.nom, depot: repository });
}

// Où cuit un projet de l'app : la station que ses stations disent le servir (projects.ts, `cuitSur`) —
// pas celle que la demande nomme : un déménagement refusé le laisse cuire là où il cuisait —, à
// défaut celle qui porte son suivi ; ou la station de cet ordinateur, qui le sert sans l'app (ticket 1122) — pas quand sa
// liste de projets servis, lue, ne le porte pas : elle le fait tourner sans le cuire (ticket 3399). `ici` : c'est cet
// ordinateur. Aucune : on ne sait pas encore où il cuit.
/** @param {Project} project @param {ReturnType<typeof kitchenOf>["stations"]} stations @returns {{ id: string | null, nom: string, ici: boolean } | undefined} */
function ouCuit(project, stations) {
  const locale = projectsVus?.locale ?? null;
  const dit = projectsVus?.projets.find(({ nom: name }) => name === project.nom)?.cuitSur;
  if (dit !== undefined && dit !== null) return { ...dit, ici: dit.ici || (dit.id !== null && dit.id === locale) };
  const suiviPar = projectsVus?.projets.find(({ nom: name }) => name === project.nom)?.suiviPar;
  const sienne = stations.find(({ id }) => id === suiviPar?.id) ?? stations.find(({ bloquee: blocked }) => !blocked);
  if (sienne !== undefined) return { id: sienne.id, nom: sienne.nom, ici: sienne.id === locale || project.ici === true };
  if (project.ici === true && servedParCetOrdinateur(project) !== false) return { id: null, nom: "", ici: true };
  return undefined;
}

// Le nom d'une station tel que la page d'un projet le dit : « this Mac » (« this PC » sous Windows) pour celle de cet ordinateur.
/** @param {string} name */
function nameDit(name) {
  return name;
}

// Un déménagement en route, après la station où il cuit encore : vers où, et où il en est au survol.
/** @param {import("../projects/projects.ts").DemenagementEnCours} enCours */
function enMouvement(enCours) {
  const step = enCours.etape === "demandee" ? "asked: it cooks here until the other is ready" : enCours.etape === "acceptee" ? "accepted: its kitchen is closing here" : "handed over: it opens there in a moment";
  const dit = bloc("span", ` · moving to ${nameDit(enCours.vers)}…`);
  dit.className = "en-mouvement";
  dit.title = [`moving ${step}`, enCours.dit].filter((line) => line !== "").join("\n");
  return dit;
}

// Si la cuisine d'un projet peut déménager — et vers quelles stations —, ou pourquoi pas, en une phrase : un projet que l'app
// a confié à une station, qui cuit sur l'une d'elles, sans déménagement accepté en route, et une autre station où aller.
/**
 * @param {Project} project @param {ReturnType<typeof ouCuit>} ou
 * @param {import("../projects/projects.ts").DemenagementEnCours | null} enCours @param {boolean} lues
 */
function deplacementDe(project, ou, enCours, lues) {
  const confie = projectsVus?.projets.some(({ nom: name, suiviPar }) => name === project.nom && suiviPar !== undefined) ?? false;
  const fige = enCours !== null && (enCours.etape === "acceptee" || enCours.etape === "remise");
  const repris = enCours !== null && !fige;
  const appairees = (stationsVues?.stations ?? []).filter(({ etat: state, cuisine: kitchen }) => state !== "illisible" && kitchen !== false);
  const destinations = appairees.filter(({ id }) => id !== ou?.id || repris);
  const pourquoiPas = !lues
    ? "your stations are still being read on GitHub"
    : !confie
      ? `${project.nom} was not added to a station from this app: the app does not move its kitchen`
      : ou === undefined || ou.id === null
        ? "the app does not know yet which station it cooks on"
        : fige
          ? "a move is already under way: it finishes first"
          : destinations.length === 0
            ? "no other station of yours can take it: pair another one first"
            : "";
  return { offert: pourquoiPas === "", pourquoiPas, destinations, fige, repris };
}

// Le geste qui déménage la cuisine du projet affiché, et ce qu'il a rendu. Il n'est offert que pour un
// projet que l'app a confié à une station, et qui cuit sur l'une d'elles : c'est de là qu'il part. Un
// déménagement accepté va à son terme : rien d'autre ne se demande avant. Demandé ou refusé, il se
// reprend : la machine où il cuit encore est offerte, pour l'y garder.
/**
 * @param {Project} project @param {ReturnType<typeof ouCuit>} ou
 * @param {import("../projects/projects.ts").DemenagementEnCours | null} enCours @param {boolean} lues
 */
function poserLeDemenagement(project, ou, enCours, lues) {
  if (demenagement !== undefined && demenagement.projet !== project.nom) fermerDemenagement();
  const { offert, destinations } = deplacementDe(project, ou, enCours, lues);
  ouvrirLeDemenagement.hidden = !offert || demenagement !== undefined || confiance !== undefined;
  if (!offert) fermerDemenagement();

  // Ce que le dernier déménagement a rendu ; à défaut, un refus de la station visée.
  const deLui = demenagementDitPour.projet === project.nom && demenagementDitPour.dit !== "";
  const refusalParElle = enCours !== null && enCours.etape === "refusee" ? `${project.nom} stays on ${nameDit(enCours.de)}: ${nameDit(enCours.vers)} refused to take it over — ${enCours.dit}` : "";
  const dit = deLui ? demenagementDitPour.dit : refusalParElle;
  const refusal = deLui ? demenagementDitPour.refus : refusalParElle !== "";
  demenagementDit.classList.toggle("refus", refusal);
  demenagementDit.replaceChildren(...(dit === "" ? [] : [bloc("span", dit)]), ...(deLui && demenagementDitPour.detail !== "" ? [survol(document, demenagementDitPour.detail)] : []));
  demenagementDit.hidden = dit === "";

  if (demenagement === undefined || ou === undefined) return;
  const depuis = ou.ici && ou.nom === "" ? WORKSTATION.nom : ou.nom;
  const recommandee = projectsVus?.recommandee ?? null;
  const vise = demenagement;
  // Chaque machine est un bouton ; celle que l'app recommande — toujours allumée — se distingue. Ce que
  // la choisir implique est au survol.
  const machines = destinations.map((station) => {
    const garder = station.id === ou.id;
    const nomme = station.nom;
    const button = /** @type {HTMLButtonElement} */ (buttonDeLaFamille(document, garder ? `keep it on ${nomme}` : nomme, undefined, { sorte: !garder && station.id === recommandee ? "recommande" : "secondaire" }));
    button.disabled = vise.part;
    button.dataset.vers = station.id;
    button.title = [projectsVus?.machines[station.id]?.implique ?? "", station.etat === "en-ligne" ? "" : station.dit].filter((line) => line !== "").join(" · ");
    button.addEventListener("click", () => void demenager(project, station.id, { nomme, depuis, garder }));
    return button;
  });
  const titre = bloc("p", `Move ${project.nom}'s kitchen from ${depuis} to:`);
  titre.className = "titre";
  const lesMachines = document.createElement("div");
  lesMachines.className = "machines-du-demenagement";
  lesMachines.append(...machines);
  const prix = bloc("p", "Its cooks in flight stop and their tickets go back to the rail; its whole journal follows it.");
  prix.className = "prix";
  const annuler = /** @type {HTMLButtonElement} */ (button(ANNULER, undefined, "discret"));
  annuler.disabled = vise.part;
  annuler.addEventListener("click", () => {
    fermerDemenagement();
    poserStationsDuProject();
  });
  lesMachines.append(annuler);
  choiceDuDemenagement.replaceChildren(titre, lesMachines, prix);
  choiceDuDemenagement.hidden = false;
}
function ouvrirLeChoiceDeMachine() {
  if (courant === undefined) return;
  demenagement = { projet: courant.nom, part: false };
  demenagementDitPour = { projet: "", dit: "", refus: false, detail: "" };
  poserStationsDuProject();
  reposerLOngletStations();
}
ouvrirLeDemenagement.addEventListener("click", ouvrirLeChoiceDeMachine);
// « Continue without sandbox » : le chef décide pour la station du projet. Ce que le runtime a répondu se dit sous
// la ligne ; l'avertissement, lui, s'en va quand la station publie l'état suivant.
// Les projets dont le chef a décidé de continuer sans bac à sable : le parcours le montre sans attendre la station.
/** @type {Set<string>} */
const decisionsPrises = new Set();
/** @param {string} name */
async function continuerSansBac(name) {
  demenagementDitPour = { projet: name, dit: "telling the station to continue without a sandbox…", refus: false, detail: "" };
  poserStationsDuProject();
  try {
    const rendu = await brigade.continuerSansBacASable(name);
    if ("fait" in rendu) decisionsPrises.add(name);
    demenagementDitPour = "fait" in rendu ? { projet: name, dit: rendu.fait, refus: false, detail: "" } : { projet: name, dit: rendu.refus, refus: true, detail: rendu.detail ?? "" };
  } catch (error) {
    demenagementDitPour = { projet: name, dit: "the choice could not be recorded: nothing was changed", refus: true, detail: error instanceof Error ? error.message : String(error) };
  }
  poserStationsDuProject();
}
// Le bouton du refus de la station (ticket 1205) : la station qui porte le suivi du projet joue le remède que le refus publie. Ce
// qu'il en est se tient ici, par projet, d'une relecture à l'autre : la confirmation ouverte, la demande en route,
// ce que la station a répondu. Levé, le refus quitte la page sans attendre : la relecture suivante dit ce qu'il en
// est vraiment. Tenu, la phrase reste tant que la station publie un refus.
/** @type {Map<string, import("./onboarding/repository-retenu.js").StateDuRemede | { etape: "leve" }>} */
const remedesDesRefusal = new Map();
// Ce que la page dit d'un remède qui n'est pas parti, ou dont on ne sait rien : la phrase, sans ce que GitHub a
// répondu — qui suit le tiret, au survol.
/** @param {string} error */
function errorDuRemede(error) {
  const [tete = "", ...reste] = error.split(" — ");
  return { dit: `${tete.charAt(0).toUpperCase()}${tete.slice(1).replace(/\.?$/, ".")}`, detail: reste.join(" — ") };
}
/** @param {string} name */
async function leverLeRefusal(name) {
  const vu = projectsVus?.projets.find((project) => project.nom === name);
  const refusal = vu?.refus ?? null;
  const state = remedesDesRefusal.get(name);
  if (refusal === null || refusal.remedy === undefined || state?.etape === "en-cours") return;
  const station = vu?.suiviPar?.nom ?? "its station";
  remedesDesRefusal.set(name, { etape: "en-cours", station });
  poserStationsDuProject();
  /** @type {import("../projects/remede.ts").IssueDuRemede} */
  let issue;
  try {
    issue = await brigade.leverLeRefus(name, refusal.code, refusal.remedy.id);
  } catch (error) {
    issue = { outcome: "error", error: error instanceof Error ? error.message : String(error) };
  }
  remedesDesRefusal.set(
    name,
    issue.outcome === "lifted"
      ? { etape: "leve" }
      : issue.outcome === "holds"
        ? { etape: "dit", dit: issue.reason }
        : { etape: "dit", ...errorDuRemede(issue.error) },
  );
  if (courant?.nom === name) poserStationsDuProject();
}
function fermerDemenagement() {
  demenagement = undefined;
  choiceDuDemenagement.hidden = true;
  choiceDuDemenagement.replaceChildren();
}
// Déménager : l'opération du runtime part, par le process principal. Ce qu'elle rend se dit sous la
// ligne ; la ligne, elle, ne dit que ce que les stations publient — où il cuit vraiment.
/** @param {Project} project @param {string} vers @param {{ nomme: string, depuis: string, garder: boolean }} dits */
async function demenager(project, vers, { nomme, depuis, garder }) {
  if (demenagement === undefined || demenagement.projet !== project.nom) return;
  const vise = demenagement;
  vise.part = true;
  vise.vers = vers;
  demenagementDitPour = { projet: project.nom, dit: `asking your stations to move ${project.nom}'s kitchen…`, refus: false, detail: "" };
  poserStationsDuProject();
  reposerLOngletStations();
  try {
    const rendu = await brigade.demenagerLaCuisine(project.nom, vers);
    // Parti, l'onglet Stations le suit dès maintenant, sur sa ligne du haut (ticket 3195) ; repris, il n'y a plus rien à suivre.
    if (!("refus" in rendu)) {
      if (garder) deplacementsDemandes.delete(project.nom);
      else deplacementsDemandes.set(project.nom, { de: depuis, vers: nomme, depuis: Date.now() });
    }
    demenagementDitPour =
      "refus" in rendu
        ? { projet: project.nom, dit: `${project.nom} stays on ${depuis}: ${rendu.refus}`, refus: true, detail: rendu.detail ?? "" }
        : garder
          ? { projet: project.nom, dit: `${project.nom} keeps cooking on ${nomme}: the move is called off`, refus: false, detail: "" }
          : { projet: project.nom, dit: `${project.nom}'s kitchen moves to ${nomme}: ${depuis} hands it over as soon as ${nomme} is ready — until then it cooks on ${depuis}`, refus: false, detail: "" };
  } catch (error) {
    demenagementDitPour = { projet: project.nom, dit: `${project.nom} stays on ${depuis}: nothing was sent`, refus: true, detail: error instanceof Error ? error.message : String(error) };
  }
  if (demenagement === vise) fermerDemenagement();
  if (courant?.nom === project.nom) poserStationsDuProject();
  reposerLOngletStations();
}

// Les stations que GitHub dit servir le projet (`facts.stations`, ticket 3472) — arrêtées, hors ligne ou en ligne, avec ou sans ticket en file : la ligne
// des stations les nomme, que le rail ait une panne à dire ou non. Aucune : le projet n'a jamais été servi, ou la station qui le servait a été retirée.
// La ligne de cet ordinateur, quand sa liste ne porte pas le projet, n'en est pas : sa cuisine tourne ici sans le cuire (ticket 3399), la règle de
// `servantesDe` qui en ôte sa carte dans l'onglet Stations.
/** @param {Project} project @returns {string[]} */
function stationsDeGithubDuProject(project) {
  const tenu = tenus.get(project.nom);
  if (tenu === undefined || !("tableau" in tenu) || muets.has(project.nom)) return [];
  const servantes = new Set(servantesDe(readDesServantes(project, Date.now()).base).map(({ prise: taking }) => taking));
  return tenu.tableau.stations?.lignes.map(({ station }) => station).filter((station) => servantes.has(station)) ?? [];
}

// La ligne des stations du projet affiché, en tête de son espace — et, s'il est ouvert, le choix de
// celles à qui le confier. Aucune lecture des stations n'est encore arrivée : le vide ne se dit pas.
function poserStationsDuProject() {
  const project = courant;
  // Le parcours prêt, montré puis quitté : il ne se remontre pas à la visite suivante.
  if (pretMontre !== undefined && pretMontre !== project?.nom) {
    journeyRanges.add(pretMontre);
    pretMontre = undefined;
  }
  stationsDuProject.hidden = project === undefined;
  teamDuProject.montrer(project?.nom);
  if (project === undefined) {
    poserLesChoice(undefined);
    poserLesBlockages(undefined);
    poserLeDelay(undefined);
    return;
  }
  if (confiance !== undefined && confiance.projet !== project.nom) fermerConfiance();
  const { stations, demande: request, tenue } = kitchenOf(project);
  const lues = stationsVues !== undefined && projectsVus !== undefined;
  const ou = ouCuit(project, stations);
  const nommees = stations.length === 0 && ou === undefined ? stationsDeGithubDuProject(project) : [];
  const enCours = projectsVus?.projets.find(({ nom: name }) => name === project.nom)?.demenagement ?? null;
  // Qui cuit le projet n'est plus une ligne de Rail (ticket 3523) : c'est l'étiquette de l'onglet Stations. Ne reste ici que le
  // déménagement en route — et, pour un projet que personne ne cuit, la phrase qui le dit, avec le geste qui le confie à une station.
  if (stations.length > 0 || ou !== undefined || nommees.length > 0) lineDesStationsDuProject.replaceChildren(...(enCours !== null && enCours.etape !== "refusee" ? [enMouvement(enCours)] : []));
  else lineDesStationsDuProject.textContent = lues ? `No station cooks ${project.nom} yet.` : READ_DE("your stations on GitHub");
  poserLeDemenagement(project, ou, enCours, lues);
  // Une station du compte qui refuse de l'avoir (ticket 1790) : son nom et sa phrase, une ligne chacune.
  const { refusees } = ajoutsDuProject(project);
  stationRefusee.replaceChildren(
    ...refusees.map(({ station, phrase }) => lineError(document, `${station.name} was not added: ${phrase}`, "", { classe: "ajout-refuse" })),
  );
  stationRefusee.hidden = refusees.length === 0;
  poserLesChoice(project);
  poserLesBlockages(project);
  poserLeDelay(project);
  ouvrirLaConfiance.textContent = stations.length === 0 && nommees.length === 0 && !seLit(project) && project.sansStation !== true ? "choose its machine" : "+ station";
  // « + station » n'est plus sur Rail : une station s'ajoute depuis l'onglet Stations (ticket 3523).
  ouvrirLaConfiance.hidden = confiance !== undefined || demenagement !== undefined || !lues || ouvrirLaConfiance.textContent === "+ station";
  const vu = projectsVus?.projets.find(({ nom: name }) => name === project.nom);
  const onboarding = vu?.onboarding ?? null;
  const remede = remedesDesRefusal.get(project.nom);
  const refusal = remede?.etape === "leve" ? null : (vu?.refus ?? null);
  const retenu = poserRepositoryRetenu(document, { acces: vu?.acces ?? null, clone: vu?.clone ?? null, refus: refusal, worktree: vu?.worktree ?? null, maintenant: Date.now(), copier: (command) => void navigator.clipboard.writeText(command), ouvrir: (url) => void brigade.autoriserSurGitHub(url), remede: {
    ...(remede === undefined || remede.etape === "leve" ? {} : { etat: remede }),
    ouvrir: () => {
      remedesDesRefusal.set(project.nom, { etape: "confirmer" });
      poserStationsDuProject();
    },
    lancer: () => void leverLeRefusal(project.nom),
    renoncer: () => {
      remedesDesRefusal.delete(project.nom);
      poserStationsDuProject();
    },
  } });
  repositoryRetenu.hidden = retenu === null;
  repositoryRetenu.replaceChildren(...(retenu === null ? [] : [retenu]));
  // La station dit ce qui la retient : la phrase qui promet de se préparer « within a minute » ne se dit plus.
  const annonceTenue = onboarding === null && retenu === null && Date.now() - confianceDitePour.a < 60_000;
  confianceDite.textContent = confianceDitePour.projet === project.nom && annonceTenue ? confianceDitePour.dit : "";
  poserLeJourney(project.nom, onboarding);
  // Les stations sont de l'onglet Stations (ticket 1184). Sur Rail, elles restent en vue tant qu'elles sont ce qui
  // t'attend : le projet ne cuit nulle part, son parcours est à suivre, un choix de machine est ouvert, ou
  // sa cuisine est retenue — un worktree qui ne se prépare pas (ticket 1119). L'accès au dépôt refusé et le refus de
  // la station, eux, sont dits sur Rail par la ligne d'alerte, qui ouvre Stations : une seule ligne (ticket 1185).
  const ditParLAlert = (vu?.acces ?? vu?.worktree?.acces ?? vu?.refus ?? null) !== null;
  // Sur un écran étroit, elles ne sont ni sur Stations — ce sont des réglages : en ajouter, déménager, le bac à sable —, ni
  // sur la conversation (ticket 1186). Sur Rail, comme sur un écran large.
  const rangees = etroit() && ongletDe(project) !== RAIL;
  // Sur Stations, l'onglet dit lui-même qui cuit le projet et comment le changer (ticket 3195, stations-tab/) : la ligne des
  // stations, ses gestes et ce qu'ils ont rendu n'y sont pas — seul ce qui retient sa cuisine, son parcours et le choix
  // de sa machine restent en tête.
  const surStations = ongletDe(project) === STATIONS;
  lineDesStationsDuProject.hidden = surStations || lineDesStationsDuProject.childElementCount === 0;
  if (surStations) for (const pose of [stationRefusee, demenagementDit, choiceDuDemenagement, ouvrirLeDemenagement, ouvrirLaConfiance]) pose.hidden = true;
  // « move the kitchen » n'est plus sur Rail (ticket 3523) : le déménagement se demande dans l'onglet Stations.
  ouvrirLeDemenagement.hidden = true;
  stationsDuProject.hidden =
    rangees ||
    (seLit(project) && journeyDuProject.hidden && (repositoryRetenu.hidden || ditParLAlert) && stationRefusee.hidden && confiance === undefined && demenagement?.projet !== project.nom) ||
    (surStations && journeyDuProject.hidden && repositoryRetenu.hidden && confiance === undefined && confianceDite.textContent === "") ||
    // Sur Rail, rien au-dessus des colonnes qu'un bouton (ticket 3523) : « move the kitchen » est dans l'onglet Stations, qui le dit.
    (journeyDuProject.hidden && (repositoryRetenu.hidden || ditParLAlert) && stationRefusee.hidden && confiance === undefined && demenagement?.projet !== project.nom && demenagementDit.hidden && lineDesStationsDuProject.hidden && ouvrirLaConfiance.hidden && confianceDite.textContent === "");
  if (confiance === undefined) return;
  poserLaConfiance(confiance, project, { exclues: stations.map(({ id }) => id), demande: request, tenue });
}

// Le temps de l'ajout du projet affiché à son premier ticket servi (ticket 1401) : il court tant qu'aucun n'est servi,
// se repose de lui-même, et se fige à la lecture qui dit le premier servi.
/** @param {Project | undefined} project */
function poserLeDelay(project) {
  const vu = project === undefined ? undefined : projectsVus?.projets.find(({ nom: name }) => name === project.nom);
  const pose = poserDelay(document, { delai: vu?.delai, maintenant: Date.now() });
  delayDuProject.hidden = pose === null;
  delayDuProject.replaceChildren(...(pose === null ? [] : [pose]));
  poserLOffreDuPhone(project);
}

// L'offre du téléphone, sur la page du premier projet servi seulement — ni sur le téléphone, ni rangée, ni quand un
// téléphone est déjà connecté : la trace n'est lue qu'une fois le reste tenu.
/** @param {Project | undefined} project */
function poserLOffreDuPhone(project) {
  const montree = project !== undefined && phoneVu === undefined && firstProjectServed(projectsVus?.projets ?? []) === project.nom && offre.montrable();
  offreDuPhone.hidden = !montree;
  offreDuPhone.replaceChildren(...(montree ? [poserLOffre(document, offre.etat, offre)] : []));
}
setInterval(() => {
  if (courant !== undefined && !delayDuProject.hidden) poserLeDelay(courant);
}, 30_000);

// Le bandeau de santé (ticket 2490, 2921), une section de Settings depuis le ticket 3014 (Rail n'a plus que la bande des
// chiffres, ticket 3013) : les plafonds de durée et le closer. Les plafonds du dépôt se lisent sur GitHub par le process
// principal (caps-duree.ts) — à l'ouverture de Settings, puis au plus une fois la minute tant qu'il reste ouvert, et
// après chaque changement. Un champ en cours de frappe n'est pas reposé.
/** @type {Map<string, import("../caps-duree.ts").ReadDesCaps>} */
const capsLus = new Map();
/** @type {Map<string, number>} */
const capsLusLe = new Map();
const capsEnRead = new Set();
/** @type {Map<string, Map<string, import("./project/banner-sante/DurationCaps.js").State>>} */
const statesDesCaps = new Map();
/** @type {Set<string>} */
const autresCapsOuverts = new Set();
// Le closer du bandeau de santé (ticket 2491), plus bas : sa lecture, ses états.
/** @type {Map<string, import("../closer-sante.ts").ReadDuCloser>} */
const closerDeSanteLu = new Map();
/** @type {Map<string, number>} */
const closerDeSanteLuLe = new Map();
const closerEnRead = new Set();
/** @type {Map<string, Map<string, import("./project/banner-sante/DurationCaps.js").State>>} */
const statesDuCloser = new Map();
/** @type {Map<string, import("./project/banner-sante/Closer.js").StateDesVerifications>} */
const verificationsDuCloser = new Map();
/** @type {Set<string>} */
const candidatsOuverts = new Set();
// Les chiffres d'autonomie de chaque projet (autonomy/figures.js, ticket 3222), dans sa section, lus de GitHub.
/** @type {Map<string, ReturnType<typeof holdLesFiguresDAutonomy>>} */
const autonomyDesProjects = new Map();
// Le savoir-faire du projet (know-how/, ticket 4239), dans la même section : lu sur GitHub par le process principal.
/** @type {Map<string, ReturnType<typeof holdLeSavoir>>} */
const savoirDesProjects = new Map();
/** @param {Project} project */
function savoirDuProject(project) {
  const tenu = savoirDesProjects.get(project.nom) ?? holdLeSavoir(document, { lire: () => brigade.savoirDuProjet(project.nom), changer: (changement) => brigade.changerLeSavoir(project.nom, changement), ouvrir: (url) => void brigade.ouvrirLaProposition(url), reposer: (garder) => reposerLaSante(project, garder) });
  savoirDesProjects.set(project.nom, tenu);
  return tenu;
}
/** @param {Project} project */
function autonomyDuProject(project) {
  const tenue = autonomyDesProjects.get(project.nom) ?? holdLesFiguresDAutonomy(document, { lire: (jours) => brigade.lireAutonomie([project.nom], jours), ouvrir: ouvrirTicketDAutonomy });
  autonomyDesProjects.set(project.nom, tenue);
  return tenue;
}
// `garder` : une relecture ne repose pas un champ où le chef est en train d'écrire ; ce que ses gestes rendent, si.
// Les post-mortems de panne du projet (ticket 4023), d'après les derniers faits de sa box — rien de lu tant qu'elle ne les donne pas.
/** @param {Project} project */
function postMortemsDe(project) {
  const tenu = /** @type {{ tableau?: { postMortems?: import("../projects/post-mortems.ts").VueDesPostMortems } } | undefined} */ (tenus.get(project.nom));
  return muets.has(project.nom) ? undefined : tenu?.tableau?.postMortems;
}
/** @param {Project} project @param {boolean} [garder] */
function poserLeBannerDeSante(project, garder = true) {
  const tape = /** @type {HTMLElement | null} */ (document.activeElement);
  if (garder && (tape?.tagName === "INPUT" || tape?.tagName === "SELECT") && tape.closest?.('[data-bloc="plafonds-duree"], [data-bloc="closer"], [data-bloc="know-how"]') && bannerSante.contains(tape)) return;
  const vu = projectsVus?.projets.find(({ nom: name }) => name === project.nom);
  const states = statesDesCaps.get(project.nom) ?? new Map();
  statesDesCaps.set(project.nom, states);
  const read = capsLus.get(project.nom);
  // Sous le titre de sa section de Settings, ce qui se règle ou s'ouvre : les plafonds de durée, le closer, et les lignes
  // de tous les projets ; avant les chiffres d'autonomie, le temps de chaque phase de la pass que la station publie (ticket 3512).
  bannerSante.replaceChildren(
    poserBlocCapsDuree(document, {
      ...(read === undefined ? {} : { lecture: read }),
      ...(vu?.temps === undefined ? {} : { lostTimeMaxMin: vu.temps.lostTimeMaxMin }),
      etats: states,
      autresOuverts: autresCapsOuverts.has(project.nom),
      basculerAutres: (ouvert) => void (ouvert ? autresCapsOuverts.add(project.nom) : autresCapsOuverts.delete(project.nom)),
      choisir: (cle, choisi) => void states.set(cle, { ...states.get(cle), choisi }),
      changer: (cle, saisie) => void changerUnCap(project, cle, saisie),
      ouvrir: (url) => void brigade.ouvrirLaProposition(url),
    }),
    poserLeCloserDeSante(project),
    savoirDuProject(project).poser(),
    poserBlocTimeDeLaPass(document, vu?.temps),
    autonomyDuProject(project).poser(),
    poserBlocPostMortems(document, postMortemsDe(project)),
    deTousLesProjects,
  );
  if (Date.now() - (capsLusLe.get(project.nom) ?? 0) > 60_000) void lireLesCapsDuree(project);
  if (Date.now() - (closerDeSanteLuLe.get(project.nom) ?? 0) > 60_000) void lireLeCloserDeSante(project);
}
/** @param {Project} project @param {boolean} [garder] */
function reposerLaSante(project, garder = false) {
  if (courant?.nom === project.nom && settingsMontres()) poserLeBannerDeSante(project, garder);
}
/** @param {Project} project */
async function lireLesCapsDuree(project) {
  if (capsEnRead.has(project.nom)) return;
  capsEnRead.add(project.nom);
  capsLusLe.set(project.nom, Date.now());
  /** @type {import("../caps-duree.ts").ReadDesCaps} */
  let lue;
  try {
    lue = (await brigade.plafondsDuree?.(project.nom)) ?? { sans: NON_ATTEINT("duration caps"), detail: SANS_PONT };
  } catch (error) {
    lue = { sans: NON_ATTEINT("duration caps"), detail: error instanceof Error ? error.message : String(error) };
  } finally {
    capsEnRead.delete(project.nom);
  }
  capsLus.set(project.nom, lue);
  reposerLaSante(project, true);
}
// Un champ changé : le process principal propose le plafond par une pull request sur le dépôt (ticket 2920). Tant qu'il
// n'a pas répondu, la rangée dit qu'il s'y met ; ouverte, la PR se dit sous le champ, qui revient à la valeur en vigueur
// — elle ne change qu'une fois la PR mergée ; déjà là, la rangée le dit ; refusé, le refus se dit sous le champ, son
// détail au survol, et ce qui a été tapé reste.
/** @param {Project} project @param {string} cle @param {string} saisie */
async function changerUnCap(project, cle, saisie) {
  const states = statesDesCaps.get(project.nom) ?? new Map();
  statesDesCaps.set(project.nom, states);
  if (states.get(cle)?.enCours === true) return;
  states.set(cle, { ...states.get(cle), enCours: true, dit: undefined });
  reposerLaSante(project);
  /** @type {import("../caps-duree.ts").RenduDuCap} */
  let rendu;
  try {
    rendu = (await brigade.changerPlafondDuree?.(project.nom, cle, saisie)) ?? { refus: "nothing was changed: nothing was sent", detail: SANS_PONT };
  } catch (error) {
    rendu = { refus: "nothing was changed: nothing was sent", detail: error instanceof Error ? error.message : String(error) };
  }
  if ("pr" in rendu) states.set(cle, { dit: { pr: rendu.pr, numero: rendu.numero, valeur: rendu.valeur } });
  else if ("fait" in rendu) states.set(cle, { dit: { fait: rendu.fait } });
  else states.set(cle, { ...states.get(cle), enCours: false, dit: rendu });
  reposerLaSante(project);
}

// Le closer du bandeau de santé (ticket 2491) : ses passes, ce qu'il vérifie en premier et en plus, ses réglages — lus sur GitHub
// par le process principal (closer-sante.ts), à l'ouverture de Settings puis au plus une fois la minute, comme les
// plafonds. Un réglage changé se propose par une pull request (ticket 2920), qui se dit sous sa rangée — la valeur en
// vigueur ne change qu'au merge ; une vérification ajoutée ou retirée s'écrit dans le dépôt, et la liste écrite est reprise.
/** @param {Project} project */
function poserLeCloserDeSante(project) {
  const states = statesDuCloser.get(project.nom) ?? new Map();
  statesDuCloser.set(project.nom, states);
  const verifications = verificationsDuCloser.get(project.nom) ?? {};
  verificationsDuCloser.set(project.nom, verifications);
  const read = closerDeSanteLu.get(project.nom);
  return poserBlocCloser(document, {
    ...(read === undefined ? {} : { lecture: read }),
    etats: states,
    verifications,
    valeurs: PROJECT_CALIBRATION,
    candidatsOuverts: candidatsOuverts.has(project.nom),
    basculerCandidats: (ouvert) => void (ouvert ? candidatsOuverts.add(project.nom) : candidatsOuverts.delete(project.nom)),
    ouvrir: (url) => void brigade.ouvrirBilan(project.nom, url),
    ouvrirLaPr: (url) => void brigade.ouvrirLaProposition(url),
    choisir: (cle, choisi) => void states.set(cle, { ...states.get(cle), choisi }),
    changer: (cle, saisie) => void changerUnSettingDuCloser(project, cle, saisie),
    taper: (saisie) => void (verifications.saisie = saisie),
    changerVerification: (gesture, saisie) => void changerUneVerificationDuCloser(project, gesture, saisie),
  });
}
/** @param {Project} project */
async function lireLeCloserDeSante(project) {
  if (closerEnRead.has(project.nom)) return;
  closerEnRead.add(project.nom);
  closerDeSanteLuLe.set(project.nom, Date.now());
  /** @type {import("../closer-sante.ts").ReadDuCloser} */
  let lue;
  try {
    const sans = { sans: NON_ATTEINT("the closer"), detail: SANS_PONT };
    lue = (await brigade.closerDeSante?.(project.nom)) ?? { reglages: sans, verifications: sans, passes: sans };
  } catch (error) {
    const sans = { sans: NON_ATTEINT("the closer"), detail: error instanceof Error ? error.message : String(error) };
    lue = { reglages: sans, verifications: sans, passes: sans };
  } finally {
    closerEnRead.delete(project.nom);
  }
  closerDeSanteLu.set(project.nom, lue);
  reposerLaSante(project, true);
}
/** @param {Project} project @param {string} cle @param {string | { model: string, effort: string }} saisie */
async function changerUnSettingDuCloser(project, cle, saisie) {
  const states = statesDuCloser.get(project.nom) ?? new Map();
  statesDuCloser.set(project.nom, states);
  if (states.get(cle)?.enCours === true) return;
  states.set(cle, { ...states.get(cle), enCours: true, dit: undefined });
  reposerLaSante(project);
  /** @type {import("../closer-sante.ts").RenduDuSetting} */
  let rendu;
  try {
    rendu = (await brigade.changerReglageDuCloser?.(project.nom, cle, saisie)) ?? { refus: "nothing was changed: nothing was sent", detail: SANS_PONT };
  } catch (error) {
    rendu = { refus: "nothing was changed: nothing was sent", detail: error instanceof Error ? error.message : String(error) };
  }
  // Comme un plafond : la PR ouverte se dit, la valeur en vigueur reste jusqu'au merge.
  if ("pr" in rendu) states.set(cle, { dit: { pr: rendu.pr, numero: rendu.numero, valeur: rendu.valeur } });
  else if ("fait" in rendu) states.set(cle, { dit: { fait: rendu.fait } });
  else states.set(cle, { ...states.get(cle), enCours: false, dit: rendu });
  reposerLaSante(project);
}
/** @param {Project} project @param {"ajouter" | "retirer"} gesture @param {string} saisie */
async function changerUneVerificationDuCloser(project, gesture, saisie) {
  const state = verificationsDuCloser.get(project.nom) ?? {};
  if (state.enCours !== undefined) return;
  verificationsDuCloser.set(project.nom, { ...state, enCours: gesture === "ajouter" ? "ajouter" : `retirer:${saisie}`, dit: undefined });
  reposerLaSante(project);
  /** @type {import("../closer-sante.ts").RenduDesVerifications} */
  let rendu;
  try {
    rendu = (await brigade.changerVerificationDuCloser?.(project.nom, gesture, saisie)) ?? { refus: "nothing was changed: nothing was sent", detail: SANS_PONT };
  } catch (error) {
    rendu = { refus: "nothing was changed: nothing was sent", detail: error instanceof Error ? error.message : String(error) };
  }
  // Proposée par une PR (ticket 2920) : la liste en vigueur ne change qu'au merge, la PR se dit sous le champ. Ajoutée, le
  // champ se vide ; retirée, ce qui y était tapé reste.
  const guard = gesture === "ajouter" ? {} : { saisie: state.saisie };
  if ("pr" in rendu) verificationsDuCloser.set(project.nom, { ...guard, dit: { pr: rendu.pr, numero: rendu.numero, geste: rendu.geste, verification: rendu.verification } });
  else if ("fait" in rendu) verificationsDuCloser.set(project.nom, { ...guard, dit: { fait: rendu.fait } });
  else verificationsDuCloser.set(project.nom, { ...state, enCours: undefined, dit: rendu });
  if (!("refus" in rendu)) {
    const lue = closerDeSanteLu.get(project.nom);
    if (lue !== undefined) closerDeSanteLu.set(project.nom, { ...lue, verifications: { liste: rendu.liste } });
  }
  reposerLaSante(project);
}

// Les blocages du projet affiché (ticket 1399). Les gestes que l'app sait faire pour en lever un, par l'identifiant
// d'action que la station publie : « choose-station » ouvre le choix de la machine, comme le parcours (ticket 1113) —
// quand le déménagement est offert, qu'une autre station peut le reprendre ; sinon, la ligne dit pourquoi il n'y a pas
// de bouton. Posés après le déménagement, qui le décide. Un lien ne s'ouvre que par le process principal, qui ne
// connaît que les pages que les stations publient.
/** @param {Project | undefined} project */
function poserLesBlockages(project) {
  const deplacable = project !== undefined && (!ouvrirLeDemenagement.hidden || demenagement?.projet === project.nom);
  const vu = project === undefined ? undefined : projectsVus?.projets.find(({ nom: name }) => name === project.nom);
  // Un besoin qui a sa carte n'a pas, en plus, sa ligne (ticket 1400).
  const blockages = sansLesChoice(vu?.blocages ?? [], vu?.choix ?? [], vu?.choisis, choiceRetenus.get(vu?.nom ?? "")?.retenus);
  const name = project?.nom ?? "";
  const deplies = blockagesDeplies.get(name) ?? new Set();
  for (const id of deplies) if (!blockages.some((blockage) => blockage.id === id)) deplies.delete(id);
  const pose = poserBlockages(document, {
    projet: name,
    blocages: blockages,
    gestes: { "choose-station": deplacable ? { libelle: "choose another station", faire: ouvrirLeChoiceDeMachine } : { sans: "no other station can take it right now" } },
    ouvrir: (url) => void brigade.autoriserSurGitHub(url),
    deplies,
    deplier: (id, ouvert) => {
      if (ouvert) deplies.add(id);
      else deplies.delete(id);
      blockagesDeplies.set(name, deplies);
    },
  });
  blockagesDuProject.hidden = pose === null;
  blockagesDuProject.replaceChildren(...(pose === null ? [] : [pose]));
}

// Les choix que le projet affiché attend (ticket 1400) : une carte par besoin. Un clic écrit l'issue
// dans sa demande (projects/projects.ts, `choisir`) ; écrite, la carte part, sans attendre que la station la relise.
// Ce que la vue retient s'oublie dès que la station ne publie plus le choix en attente.
/** @param {Project | undefined} project */
function poserLesChoice(project) {
  const vu = project === undefined ? undefined : projectsVus?.projets.find(({ nom: name }) => name === project.nom);
  const choice = vu?.choix ?? [];
  const name = project?.nom ?? "";
  const tenus = choiceRetenus.get(name) ?? { enCours: new Set(), retenus: new Set(), refus: new Map() };
  for (const id of tenus.retenus) if (!choice.some((un) => un.id === id && un.status === "pending")) tenus.retenus.delete(id);
  for (const id of tenus.refus.keys()) if (!choice.some((un) => un.id === id)) tenus.refus.delete(id);
  choiceRetenus.set(name, tenus);
  const pose = poserChoice(document, { projet: name, choix: choice, choisis: vu?.choisis, retenus: tenus.retenus, enCours: tenus.enCours, refus: tenus.refus, choisir: (id, issue) => void (issue === "cook-elsewhere" ? ouvrirLaStationQuiLA(name, id, choice) : choisirUneIssue(name, id, issue)) });
  choiceDuProject.hidden = pose === null;
  choiceDuProject.replaceChildren(...(pose === null ? [] : [pose]));
}

// « Cook it on a station that has it » (ticket 1511) n'écrit rien : il ouvre, sur Stations, les réglages d'une station de ce
// poste avec la capacité qui manque offerte. Le chef l'enregistre, ou non ; la station relit ses capacités.
// Aucune station lue, une ligne sous la carte le dit.
/** @param {string} name @param {string} id @param {readonly import("../projects/request.ts").Choice[]} choice */
function ouvrirLaStationQuiLA(name, id, choice) {
  const project = courant?.nom === name ? courant : undefined;
  const lues = declarees.get(name);
  const station = project === undefined || lues === undefined ? undefined : stationAOuvrir(lues, { ici: project.ici === true });
  const tenus = choiceRetenus.get(name);
  if (project === undefined || station === undefined) {
    tenus?.refus.set(id, { refus: `${PAS_ENCORE("station of the project read")} The next check of the installation reads them.` });
    return poserStationsDuProject();
  }
  tenus?.refus.delete(id);
  const need = choice.find((un) => un.id === id)?.need;
  choisirOnglet(STATIONS);
  void offrirLaCapacity(project, station.nom, need === undefined ? undefined : capacityDuNeed(need));
}

/** @param {string} name @param {string} id @param {string} issue */
async function choisirUneIssue(name, id, issue) {
  const tenus = choiceRetenus.get(name) ?? { enCours: new Set(), retenus: new Set(), refus: new Map() };
  choiceRetenus.set(name, tenus);
  if (tenus.enCours.has(id)) return;
  tenus.enCours.add(id);
  tenus.refus.delete(id);
  poserStationsDuProject();
  /** @type {{ fait: string } | { refus: string, detail?: string }} */
  let rendu;
  try {
    rendu = await brigade.choisirUneIssue(name, id, issue);
  } catch (error) {
    rendu = { refus: "the choice could not be recorded", detail: error instanceof Error ? error.message : String(error) };
  }
  tenus.enCours.delete(id);
  if (rendu !== undefined && "fait" in rendu) tenus.retenus.add(id);
  else tenus.refus.set(id, rendu ?? { refus: "the choice could not be recorded" });
  poserStationsDuProject();
}

// Le parcours du projet affiché, sous la ligne de ses stations (ticket 1111) : ses quatre étapes tant
// qu'il se prépare ; prêt, la phrase qui invite à poser le premier ticket, jusqu'à ce que le chef
// l'écarte ou quitte la page. Chaque page qu'il ouvre est une de celles que la station a publiées.
/** @param {string} name @param {import("../projects/request.ts").Onboarding | null} onboarding */
function poserLeJourney(name, onboarding) {
  if (onboarding?.decisionAttendue !== true) decisionsPrises.delete(name);
  else if (decisionsPrises.has(name)) onboarding = apresLaDecision(onboarding);
  const range = onboarding !== null && onboarding.termine && journeyRanges.has(name);
  const pose = range
    ? null
    : journeyDOnboarding(document, {
        projet: name,
        onboarding,
        maintenant: Date.now(),
        ouvrir: (url) => void brigade.autoriserSurGitHub(url),
        continuerSansBac: () => void continuerSansBac(name),
        autreStation: ouvrirLeChoiceDeMachine,
        ecarter: () => {
          journeyRanges.add(name);
          pretMontre = undefined;
          poserStationsDuProject();
        },
      });
  if (pose !== null && onboarding?.termine === true) pretMontre = name;
  journeyDuProject.hidden = pose === null;
  journeyDuProject.replaceChildren(...(pose === null ? [] : [pose]));
}

// Le choix ouvert, posé de nouveau à chaque relecture des stations et des projets : ce que le chef a
// coché ou changé reste, ce qu'il n'a pas touché suit ce qui est proposé. Un projet dont une station a déjà
// la cuisine ne prend que des stations de plus ; une station de plus reprend ce que l'app a déjà demandé, ni
// cooks ni calibrage à redire.
/**
 * @param {NonNullable<typeof confiance>} vise @param {Project} project
 * @param {{ exclues: readonly string[], demande: boolean, tenue: boolean }} deja
 */
function poserLaConfiance(vise, project, { exclues, demande: request, tenue }) {
  const locale = projectsVus?.locale ?? null;
  const appairees = cetOrdinateurDAbord(
    (stationsVues?.stations ?? []).filter(({ id, cuisine: kitchen }) => kitchen !== false && !exclues.includes(id)),
    locale,
  );
  const machines = projectsVus?.machines ?? {};
  const recommandee = projectsVus?.recommandee ?? undefined;
  const first = !tenue;
  // Une machine à la fois, proposée d'office tant que le chef n'a rien touché : une station qui peut cuire maintenant —
  // la recommandée, sinon cet ordinateur, sinon la première en ligne (choice-station/). Aucune en ligne : aucune.
  if (!vise.touchee || !appairees.some(({ id }) => vise.choisies.has(id))) {
    const proposee = proposeeDOffice(appairees, { recommandee: first ? recommandee : null, locale });
    vise.choisies = new Set(proposee === undefined ? [] : [proposee]);
  }
  const nameDe = (/** @type {string} */ id) => {
    const station = appairees.find((une) => une.id === id);
    return station === undefined ? "" : nameDite(station, locale);
  };

  titreDeConfiance.textContent = first ? `Choose the machine that cooks ${project.nom}.` : `Add a station to ${project.nom}'s kitchen.`;
  sensDeConfiance.textContent = first
    ? "Every station cooks, takes, reviews and merges. Everything below is set to what is recommended: change what you like, or start as it is."
    : "Every station cooks, takes, reviews and merges.";
  // Un projet ajouté depuis l'app connaît son dépôt et sa branche ; un projet écrit à la main les choisit ici.
  const connu = project.depot !== undefined && project.base !== undefined;
  // Une station de plus ne les demande jamais (ticket 1307) : la première les sert, ou le clone du projet les dit.
  champDuRepository.hidden = !first || connu;
  champDeLaBase.hidden = !first || connu;

  legendeDesStationsChoisies.textContent = "Machine";
  sensDesStationsChoisies.textContent = "";
  sensDesStationsChoisies.hidden = true;
  choiceDesStationsChoisies.replaceChildren(
    ...(appairees.length === 0
      ? [bloc("p", first ? "no station to cook it: pair one first, with “+ station” under All stations, on the home" : "no other paired machine: pair one from the home, with “+ station”")]
      : appairees.map((station) => {
          const propose = machines[station.id];
          return uneMachine(
            document,
            {
              station,
              nom: first ? "station-choisie" : "station-ajoutee",
              ici: station.id === locale,
              choisie: vise.choisies.has(station.id),
              recommandee: first && station.id === recommandee && station.etat === "en-ligne",
              implique: propose?.implique ?? "",
              ordinateur: propose?.toujoursAllumee === false,
              aria: first ? `${station.nom} cooks it` : `${station.nom} is the station to add`,
            },
            () => {
              vise.touchee = true;
              vise.choisies = new Set([station.id]);
              poserStationsDuProject();
            },
          );
        })),
  );
  stationsChoisiesDeConfiance.hidden = false;

  // Les cooks à la fois : ceux de la machine choisie, tirés de ses cœurs à elle — ceux de cet ordinateur tels que le
  // runtime les calcule, sinon ses cœurs publiés. Une station de plus dit aussi son dossier et ses capacités.
  const decide = first && !request;
  const choisie = [...vise.choisies][0];
  const sansMachine = choisie === undefined;
  const ici = choisie !== undefined && choisie === locale;
  const defauts = vise.defauts !== undefined && "cooks" in vise.defauts ? vise.defauts : undefined;
  champDesCooks.hidden = first ? !decide || sansMachine : sansMachine;
  const proposee = ici && defauts !== undefined ? defauts : machines[choisie ?? ""];
  if (!vise.cooksTouches) cooksDeConfiance.value = proposee === undefined ? "" : String(proposee.cooks);
  cooksDits.textContent = vise.cooksTouches || proposee === undefined ? "" : `recommended — ${proposee.cooksDit}`;
  champDuDossier.hidden = first || sansMachine;
  capacitiesDeConfiance.hidden = first || sansMachine;
  if (!first && choisie !== undefined) poserLaMachineAjoutee(vise, choisie, nameDe(choisie), ici, defauts);

  const name = choisie === undefined ? "" : nameDe(choisie);
  validerConfiance.textContent = first ? (name === "" ? "Start the kitchen" : `Start the kitchen on ${name}`) : AJOUTER_UN_PROJECT;
  actionsDeConfiance.hidden = appairees.length === 0;
}

// Ce qui est à la machine d'une station de plus (ticket 1307) : le dossier des espaces de travail de ses cooks, et ses
// capacités, une case chacune. Cet ordinateur les dit tels que le runtime les y lit, les cases détectées cochées ;
// une autre machine ne se sonde pas d'ici : son dossier est le sien, et ses cases partent vides. Ce que le chef a
// coché ou décoché reste, par machine, d'une relecture à l'autre.
/**
 * @param {NonNullable<typeof confiance>} vise @param {string} id @param {string} name @param {boolean} ici
 * @param {Extract<import("../projects/projects.ts").DefautsDeLaMachine, { cooks: number }> | undefined} defauts
 */
function poserLaMachineAjoutee(vise, id, name, ici, defauts) {
  dossierDeConfiance.value = ici ? (defauts?.espaceDeTravail ?? "") : "";
  dossierDeConfiance.placeholder = ici ? "" : `chosen on ${name}`;
  dossierDit.textContent = ici ? `where ${CET_ORDINATEUR}'s station puts its cooks' workspaces` : `${name}'s station chooses it on that machine`;
  legendeDesCapacities.textContent = `What ${ici ? CET_ORDINATEUR : name} can do`;
  const catalogue = defauts?.capacites ?? [];
  let cochees = vise.capacites.get(id);
  if (cochees === undefined) {
    cochees = new Set(ici ? catalogue.filter(({ detectee }) => detectee).map(({ capacite: capacity }) => capacity) : []);
    vise.capacites.set(id, cochees);
  }
  const tenues = cochees;
  const refusal = vise.defauts !== undefined && "refus" in vise.defauts ? vise.defauts : { refus: `${CET_ORDINATEUR} could not be read`, detail: "" };
  choiceDesCapacities.replaceChildren(
    ...(catalogue.length === 0
      ? [lineError(document, refusal.refus, refusal.detail ?? "")]
      : catalogue.map(({ capacite: capacity, nom: dite, detectee }) =>
          caseACocher(document, { nom: dite, dit: !ici ? `not detectable from ${CET_ORDINATEUR}` : detectee ? "detected" : `not found on ${CET_ORDINATEUR}`, cochee: tenues.has(capacity) }, (cochee) => {
            if (cochee) tenues.add(capacity);
            else tenues.delete(capacity);
          }),
        )),
  );
}

// Ouvrir le choix : l'heure en est gardée, comme pour le parcours — c'est d'elle que se mesure le temps
// jusqu'au projet servi. Un projet écrit à la main choisit son dépôt parmi ceux du chef, lus sur GitHub.
// Pour une station de plus, ce que cet ordinateur propose est lu avant que le formulaire se montre : chaque champ y
// paraît d'emblée, rempli (ticket 1307).
ouvrirLaConfiance.addEventListener("click", () => void ouvrirConfiance());
async function ouvrirConfiance() {
  const project = courant;
  if (project === undefined || ouvrirLaConfiance.disabled) return;
  /** @type {NonNullable<typeof confiance>} */
  const vise = { projet: project.nom, ouvertLe: new Date().toISOString(), depots: [], choisies: new Set(), touchee: false, cooksTouches: false, capacites: new Map() };
  if (kitchenOf(project).tenue) {
    ouvrirLaConfiance.disabled = true;
    vise.defauts = await defautsDeCetOrdinateur(project.nom);
    ouvrirLaConfiance.disabled = false;
    if (courant?.nom !== project.nom) return;
  }
  confiance = vise;
  formulaireDeConfiance.hidden = false;
  confianceDitePour = { projet: "", dit: "", a: 0 };
  confianceRefusee.replaceChildren();
  baseDeConfiance.value = project.base ?? "";
  poserStationsDuProject();
  if ((project.depot !== undefined && project.base !== undefined) || vise.defauts !== undefined) return;
  await lireLesDepots(vise, project);
}
/** @param {string} name @returns {Promise<import("../projects/projects.ts").DefautsDeLaMachine>} */
async function defautsDeCetOrdinateur(name) {
  try {
    return (await brigade.defautsDeStation(name)) ?? { refus: `${CET_ORDINATEUR} could not be read` };
  } catch (error) {
    return { refus: `${CET_ORDINATEUR} could not be read`, detail: error instanceof Error ? error.message : String(error) };
  }
}
// Le dépôt à choisir : ceux du chef, lus sur GitHub, avec celui que le projet connaît déjà d'avance.
/** @param {NonNullable<typeof confiance>} vise @param {Project} project */
async function lireLesDepots(vise, project) {
  repositoryDeConfiance.replaceChildren(new Option(READ_DE("your repositories on GitHub"), ""));
  const lus = await brigade.depotsDuChef();
  if (confiance !== vise) return;
  if ("refus" in lus) {
    repositoryDeConfiance.replaceChildren(new Option("— repository —", ""), ...(project.depot === undefined ? [] : [new Option(project.depot, project.depot)]));
    if (project.depot !== undefined) repositoryDeConfiance.value = project.depot;
    confianceRefusee.replaceChildren(lineError(document, lus.refus, "", { classe: "" }));
    return;
  }
  vise.depots = lus.depots;
  proposer(repositoryDeConfiance, lus.depots.map(({ depot: repository }) => repository), "— repository —");
  if (project.depot !== undefined) {
    if (!lus.depots.some(({ depot: repository }) => repository === project.depot)) repositoryDeConfiance.append(new Option(project.depot, project.depot));
    repositoryDeConfiance.value = project.depot;
  }
}
// Le dépôt choisi propose sa branche par défaut comme branche d'intégration.
repositoryDeConfiance.addEventListener("change", () => {
  const choisi = confiance?.depots.find(({ depot: repository }) => repository === repositoryDeConfiance.value);
  if (choisi !== undefined) baseDeConfiance.value = choisi.base;
});
// Une valeur changée par le chef est la sienne : elle ne suit plus ce qui est proposé, et sa
// provenance ne se dit plus.
cooksDeConfiance.addEventListener("input", () => {
  if (confiance === undefined) return;
  confiance.cooksTouches = true;
  cooksDits.textContent = "";
});
annulerConfiance.addEventListener("click", () => {
  fermerConfiance();
  poserStationsDuProject();
});
function fermerConfiance() {
  confiance = undefined;
  formulaireDeConfiance.hidden = true;
}
// Lancer : la demande part au process principal, qui l'écrit dans le gist de chaque station choisie
// — ou chaque champ qui manque se lit sous le choix, et rien n'est écrit.
formulaireDeConfiance.addEventListener("submit", (event) => {
  event.preventDefault();
  void confier();
});
async function confier() {
  const project = courant;
  const vise = confiance;
  if (project === undefined || vise === undefined || vise.projet !== project.nom) return;
  const choisies = [...vise.choisies];
  const lues = choisies.map((id) => (stationsVues?.stations ?? []).find((station) => station.id === id));
  const noms = choisies.map((id, rang) => lues[rang]?.nom ?? id);
  // Hors ligne, la station choisie prend le projet à son retour (ticket 3187) : la page le dit en clair.
  const absente = lues.find((station) => station?.etat === "hors-ligne");
  validerConfiance.disabled = true;
  confianceRefusee.replaceChildren(bloc("p", "writing the request on your stations' gists…"));
  try {
    const rendu = await brigade.confierAUneStation({
      nom: project.nom,
      depot: !champDuRepository.hidden ? repositoryDeConfiance.value : (project.depot ?? ""),
      base: !champDeLaBase.hidden ? baseDeConfiance.value : (project.base ?? ""),
      stations: choisies,
      cooks: champDesCooks.hidden && kitchenOf(project).tenue ? "" : cooksDeConfiance.value,
      ...(capacitiesDeConfiance.hidden ? {} : { capacites: [...(vise.capacites.get(choisies[0] ?? "") ?? [])] }),
      // Le calibrage que l'app recommande (ticket 3187) : il se change dans les réglages du projet, pas ici.
      manager: projectsVus?.calibrage?.manager ?? { modele: "", effort: "" },
      reviewer: projectsVus?.calibrage?.reviewer ?? { modele: "", effort: "" },
      ouvertLe: vise.ouvertLe,
    });
    if ("signales" in rendu) confianceRefusee.replaceChildren(...Object.values(rendu.signales).map((raison) => lineError(document, raison ?? "", "", { classe: "" })));
    else if ("refus" in rendu) confianceRefusee.replaceChildren(lineError(document, rendu.refus, "", { classe: "" }));
    else {
      if (confiance === vise) fermerConfiance();
      confianceRefusee.replaceChildren();
      confianceDitePour = {
        projet: project.nom,
        dit:
          absente !== undefined
            ? AU_RETOUR(absente.nom, rendu.ajoute)
            : `${rendu.ajoute} is asked of ${noms.join(", ")}: ${noms.length > 1 ? "each" : "it"} prepares it within a minute — if GitHub asks you to authorize brigade, its button appears on this line`,
        a: Date.now(),
      };
      if (courant?.nom === project.nom) poserStationsDuProject();
      // Les blocs de Cooks viennent des faits de la box : relus tout de suite, la station neuve y paraît sans attendre.
      lireLesFacts();
    }
  } catch (error) {
    confianceRefusee.replaceChildren(lineError(document, "nothing was sent", error instanceof Error ? error.message : String(error), { classe: "" }));
  }
  validerConfiance.disabled = false;
}

// Ce que le bouton d'une panne a rendu, par `<gist> <clé>` : redit à chaque relecture, tant que la
// panne est sur la ligne de sa station.
/** @type {Map<string, string>} */
const outagesDites = new Map();

// Une panne, sous la ligne de sa station : ce qui ne va pas, en une ligne, et son bouton — relire,
// écarter, se connecter (outages/outages.ts). Jamais une commande à taper.
/** @param {import("../stations/stations.ts").StationVue} station @param {import("../outages/outages.ts").Outage} outage */
function poserOutage({ id, nom: name, projets: projects }, outage) {
  const pose = document.createElement("p");
  pose.className = "panne";
  pose.dataset.sujet = outage.sujet;
  const button = buttonDeLaFamille(document, outage.bouton.libelle, () => void jouerOutage(id, outage.cle, button));
  // L'explication, et ce que le bouton a rendu, ne se lisent qu'au survol.
  const dit = outagesDites.get(`${id} ${outage.cle}`);
  pose.append(bloc("span", outage.ligne), button, survol(document, dit === undefined ? outage.survol : `${outage.survol}. ${dit}`));
  // La station est en panne : « report to brigade » à la suite (ticket 1977), le journal lu dans un projet qu'elle sert.
  pose.append(...report.poser({ ...(projects[0] === undefined ? {} : { projet: projects[0] }), reference: { station: name }, panne: `station ${name}: ${outage.ligne}` }));
  return pose;
}
/** @param {string} id @param {string} cle @param {HTMLButtonElement} button */
async function jouerOutage(id, cle, button) {
  button.disabled = true;
  let dit;
  try {
    const rendu = await brigade.panne(id, cle);
    siClaudeManque(rendu);
    dit = "refus" in rendu ? rendu.refus : rendu.fait;
  } catch (error) {
    dit = `nothing was done: ${error instanceof Error ? error.message : String(error)}`;
  }
  outagesDites.set(`${id} ${cle}`, dit);
  poserPageDeStation();
}

// « + station » ouvre le champ du code, sous la liste des stations ; « cancel » le referme, vide.
ouvrirLAppairage.addEventListener("click", () => {
  formulaireDAppairage.hidden = false;
  ouvrirLAppairage.hidden = true;
  codeTape.focus();
});
renoncerAppairage.addEventListener("click", () => fermerLAppairage());
function fermerLAppairage() {
  formulaireDAppairage.hidden = true;
  ouvrirLAppairage.hidden = false;
  codeTape.value = "";
  appairageDit.textContent = "";
  appairageDit.title = "";
}
// Le code tapé part au process principal, qui cherche sur GitHub la station qui le montre : elle
// est appairée, le champ se referme, et la liste la montre — rien d'autre ne le dit. Ou le refus se lit
// sous le champ, en une ligne ; ce que GitHub en a dit, au survol.
formulaireDAppairage.addEventListener("submit", (event) => {
  event.preventDefault();
  void appairer();
});
async function appairer() {
  appairage.disabled = true;
  appairageDit.textContent = "looking for the station that shows this code, on GitHub…";
  appairageDit.title = "";
  try {
    const rendu = await brigade.appairer(codeTape.value);
    if ("refus" in rendu) {
      appairageDit.textContent = rendu.refus;
      appairageDit.title = rendu.detail ?? "";
    } else fermerLAppairage();
  } catch (error) {
    appairageDit.textContent = "nothing was paired: the app could not ask GitHub";
    appairageDit.title = error instanceof Error ? error.message : String(error);
  }
  appairage.disabled = false;
}

// La mise à jour d'un clone n'est pas lancée : sa commande s'écrit dans un shell, dans
// l'espace d'un projet, que l'on montre — c'est sa note qui dit ce qui a été écrit, et que
// rien n'est parti. Sans projet qui s'ouvre, la raison se lit sous les clones.
/** @param {string} clone */
async function mettreADay(clone) {
  nonMisADay = "";
  try {
    const rendu = await brigade.ecrireMiseAJour(clone);
    if (rendu !== undefined && "refus" in rendu) nonMisADay = rendu.refus;
    else if (rendu !== undefined) {
      garder(rendu.projet, rendu);
      const project = projectDe(rendu.projet);
      if (project !== undefined) return void ouvrir(project);
    }
  } catch (error) {
    nonMisADay = `nothing written: ${error instanceof Error ? error.message : String(error)}`;
  }
  poserCode();
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
function poserAlerts(project) {
  // La ligne dont le geste est celui de l'interrupteur de l'espace n'est pas posée : l'interrupteur la
  // dit, et c'est lui qui la lève — le projet éteint (tickets 906, 1406). Non vérifiée, elle se pose :
  // l'interrupteur ne sait pas, la ligne dit pourquoi.
  const alerts = !seLit(project) ? [] : (bandes.get(project.nom) ?? []).filter(({ appel: call }) => !(call !== undefined && "geste" in call && call.geste === "projet-allumer"));
  actionDeLUrgence = undefined;
  const opinion = opinionDuRepository(project, "page");
  // En lecture seule, sa ligne vient en tête du projet (ticket 3163) : elle dit pourquoi aucun geste n'est offert.
  const repository = readOnlyDe(project);
  const only = repository === undefined ? [] : [lineReadOnly(document, repository, (page) => void brigade.ouvrirLectureSeule?.(project.nom, page))];
  bande.hidden = alerts.length === 0 && opinion === undefined && only.length === 0;
  bande.replaceChildren(...only, ...(opinion === undefined ? [] : [opinion]), ...alerts.map((alert) => poserAlert(project, alert)));
}

// L'endroit d'une ligne de la bande : son sujet, et ce qu'elle dit — l'urgence par son seul sujet,
// sa phrase change à chaque lecture (« at a standstill for 5 h 00 »). Ce qui y est ouvert — sa
// confirmation, son détail — ne se referme pas sous les yeux du chef.
/** @param {Alert} alerte */
const endroitDeLAlert = ({ sujet, dit }) => (sujet === "urgence" ? "alerte:urgence" : `alerte:${sujet}:${dit}`);

// Une ligne de la bande (ticket 907) : une seule ligne — ce qui ne va pas — et un seul contrôle, le
// geste qui le lève. Son prix n'est pas posé à côté : le clic ouvre la confirmation, qui le dit. Ce
// que la ligne sait de plus — pourquoi, ce que la box en écrit mot pour mot, le verdict d'une
// vérification — est replié derrière « detail », dessous.
/** @param {Project} project @param {Alert} alert */
function poserAlert(project, alert) {
  const { sujet, verifie, ton, dit, pourquoi, releve, verification } = alert;
  const line = document.createElement("div");
  line.className = "alerte";
  line.dataset.sujet = sujet;
  line.dataset.ton = ton;
  if (!verifie) line.dataset.verifie = "non";
  if (sujet === "urgence" && urgenceChoisie === project.nom) line.dataset.choisie = "oui";
  const endroit = endroitDeLAlert(alert);
  const tete = document.createElement("p");
  tete.className = "ligne";
  const marque = sujet === "urgence" ? bloc("span", "URGENT") : undefined;
  if (marque !== undefined) marque.className = "urgent";
  tete.append(pill(dit, ton), ...(marque === undefined ? [] : [marque]), bloc("strong", dit));

  // Le détail : ce que la ligne sait de plus, à plat une fois déplié — le pourquoi, et le brut de la box,
  // entier. Pas le geste : le seul geste montré est le contrôle de la ligne, un bouton — jamais une
  // commande à recopier (règles de la langue visuelle, ticket 830).
  const cle = `${project.nom}\u0000${endroit}`;
  const deplie = detailsDeplies.has(cle);
  /** @type {HTMLElement[]} */
  const detail = [
    ...(pourquoi === undefined || pourquoi.trim() === "" ? [] : [bloc("p", pourquoi)]),
    ...(releve === undefined || releve.trim() === "" ? [] : [exact("pre", releve)]),
    ...(verification === undefined ? [] : poserVerdict(project, verification, (texte, gesture) => button(texte, () => void gesture()), verification.titre !== dit)),
  ];
  if (detail.length > 0) {
    const deplier = button("detail", () => {
      if (detailsDeplies.has(cle)) detailsDeplies.delete(cle);
      else detailsDeplies.add(cle);
      poserAlerts(project);
    }, "discret");
    deplier.className = "detail";
    deplier.ariaExpanded = String(deplie);
    deplier.title = deplie ? "fold the detail" : "what the station says, as is — and why";
    tete.append(deplier);
  }
  const [controle, ...ouverte] = poserControle(project, alert, endroit);
  if (controle !== undefined) tete.append(controle);
  line.append(tete);
  // Ce que le chef peut y faire, en clair sous la ligne : pas replié derrière « detail ».
  if (alert.consignes !== undefined && alert.consignes.length > 0) {
    const consignes = document.createElement("ul");
    consignes.className = "consignes";
    consignes.append(...alert.consignes.map((consigne) => bloc("li", consigne)));
    line.append(consignes);
  }
  if (deplie && detail.length > 0) {
    const deplies = document.createElement("div");
    deplies.className = "detail";
    deplies.append(...detail);
    line.append(deplies);
  }
  // Une confirmation ouverte passe dessous, sur toute la largeur.
  line.append(...ouverte);
  return line;
}

// Le contrôle d'une ligne de la bande, et sa confirmation quand elle est ouverte. Un geste du socle :
// direct, il part au clic ; confirmé, le clic ouvre sa confirmation, qui dit son prix (confirmation.ts).
// Une demande au second dont le geste coûte : le clic ouvre une confirmation qui dit ce que coûtera le
// lever — un « oui » écrit la demande dans le second, sans l'envoyer. Sans prix, elle s'écrit au clic.
// Un onglet : il s'ouvre. Sans appel, la ligne n'a pas de contrôle : rien à faire depuis l'app.
/** @param {Project} project @param {Alert} alert @param {string} endroit @returns {HTMLElement[]} */
function poserControle(project, alert, endroit) {
  const { sujet, geste: leve, bouton: libelle, appel: call, prix } = alert;
  if (call === undefined) return [];
  // En lecture seule (ticket 3163), pas de geste du socle : rien qui change le projet.
  if (readOnlyDe(project) !== undefined && "geste" in call) return [];
  const word = libelle ?? leve;
  /** @type {HTMLElement[]} */
  let pose;
  // L'endroit d'un geste du socle est la ligne par son sujet : la confirmation d'un même geste s'ouvre sous la ligne cliquée.
  if ("geste" in call) pose = poserAction(project, { id: call.geste, libelle: word, ou: `alerte:${sujet}` });
  else if ("demande" in call) {
    // Un prix « none… » est un prix nul : pas de confirmation, la demande s'écrit au clic.
    const cost = /^none\b/i.test(prix.trim()) ? "" : prixDit(prix);
    const cle = JSON.stringify(["demande", "", endroit]);
    const ouverte = aConfirmer?.projet === project.nom && aConfirmer.cle === cle ? aConfirmer : undefined;
    const request = button(cost === "" ? word : `${word}…`, () => {
      if (cost === "") return void demanderAlert(alert);
      nonEcrit = nonEcritSecond = "";
      actionRate = undefined;
      aConfirmer = ouverte === undefined ? { projet: project.nom, cle, rendu: confirmationDeRequest(cost) } : undefined;
      show();
    });
    request.dataset.geste = "demande";
    request.ariaExpanded = cost === "" ? null : String(ouverte !== undefined);
    request.title = cost === "" ? "writes into the second a request about this line — nothing is sent: you press Enter" : "says first what lifting it costs — then writes the request into the second, without sending it";
    pose = ouverte === undefined ? [request] : [request, poserConfirmation(project, ouverte, () => void demanderAlert(alert))];
  } else if ("relire" in call) {
    // Réessayer maintenant : la box est relue tout de suite, au lieu d'attendre le tour des trente secondes.
    pose = [button(word, () => lireLesFacts())];
  } else {
    const { onglet } = call;
    pose = [button(word, () => (laisse.get(project.nom) === onglet ? undefined : activer(onglet)))];
  }
  const [first] = pose;
  if (sujet === "urgence" && first !== undefined) actionDeLUrgence = first;
  return pose;
}

// La confirmation d'une demande au second : ce que coûtera le lever, en une ligne — le prix que la
// ligne de la bande en dit —, et ce que fait le « oui » : il écrit la demande, rien ne part.
/** @param {string} prix @returns {Confirmation} */
const confirmationDeRequest = (prix) => ({
  titre: "ask the second to lift it",
  prix: [prix, "the second reads, explains, and acts only with you"],
  choix: [{ id: "demande", libelle: OUI("write the request"), dit: "written into the second, not sent: your Enter sends it" }],
  renoncer: "no, write nothing",
});

// La bannière d'arrêt : la cuisine est à l'arrêt quand la box le dit, d'un mot.
// Son geste la reprend : confirmé, il dit d'abord ce qu'il relance.
/** @param {Project} project */
function poserStop(project) {
  const tenu = tenus.get(project.nom);
  const banniere = BANNIERE;
  stop.hidden = banniere === undefined || tenu === undefined || !("tableau" in tenu) || !tenu.tableau.arretee;
  if (stop.hidden || banniere === undefined) return stop.replaceChildren();
  const [titre, ...suite] = banniere.texte;
  const relance = KITCHEN_ACTIONS.find(({ id }) => id === banniere.bouton);
  const gesture = document.createElement("div");
  gesture.className = "gestes";
  if (relance !== undefined && readOnlyDe(project) === undefined) gesture.append(...poserAction(project, { ...relance, ou: "arret" }));
  stop.replaceChildren(bloc("strong", titre), ...suite.map((line) => bloc("p", line)), gesture);
}

// Tout ce qui se dessine du projet affiché, d'après ses derniers faits. Le rail en est : il est
// au centre de l'espace, quel que soit l'onglet affiché.
function dessiner() {
  bande.hidden = true;
  stop.hidden = true;
  rail.hidden = true;
  poserSwitch();
  poserStationsDuProject();
  // Settings d'un projet en lecture seule (ticket 3163) : rien de ce qui se propose à son dépôt n'y est posé (vue.css).
  if (courant !== undefined && readOnlyDe(courant) !== undefined) state.dataset.lectureSeule = "";
  else delete state.dataset.lectureSeule;
  if (courant === undefined) return;
  poserAlerts(courant);
  poserStop(courant);
  poserRail(courant);
}

// Rien ne reste de ce qui était affiché — ni d'un autre projet, ni de celui-ci :
// jusqu'à la première lecture, il n'y a rien à lire.
/** @param {Project} project @param {HTMLElement} tete @param {HTMLElement} corps */
function attendre(project, tete, corps) {
  if (project.sansStation === true) {
    // Station arrêtée : rien n'est lu. La ligne est celle du rail (poserRail), qui cède la place au
    // rail, à la file et aux cartes dès que la station tourne (la configuration est reposée).
    tete.dataset.etat = "sans-station";
    tete.textContent = "";
    corps.replaceChildren();
  } else if (!seLit(project)) {
    tete.dataset.etat = "sans-station";
    tete.textContent = "no read";
    corps.replaceChildren(
      lineError(
        document,
        `“${project.nom}” does not say where its station is: nothing is read`,
        `Its station is not named in ${configuration.chemin}. The app re-reads this file as soon as it changes.`,
      ),
    );
  } else {
    tete.dataset.etat = "en-cours";
    tete.textContent = "first read in progress…";
    corps.replaceChildren();
  }
}

// L'écran affiché — un projet, une station, une page de l'app, l'ajout, ou l'accueil —, retenu le temps de la session de
// la fenêtre (ticket 3159) : rechargée (Cmd+R), la vue s'y rouvre ; l'app relancée, elle s'ouvre sur l'accueil, comme avant.
const CLE_DE_L_SCREEN = "brigade.ecran";
function retenirLScreen() {
  const screen = courant !== undefined ? { projet: courant.nom } : ajoute ? { ajout: true } : stationOuverte !== undefined ? { station: stationOuverte } : pageDeLApp !== undefined ? { page: pageDeLApp } : {};
  try {
    window.sessionStorage?.setItem(CLE_DE_L_SCREEN, JSON.stringify(screen));
  } catch {
    // Sans stockage, un rechargement rouvre l'accueil.
  }
}
// Avant le premier affichage : l'écran retenu, s'il existe encore. Illisible, ou son projet retiré du fichier : l'accueil.
function reprendreLScreen() {
  /** @type {{ projet?: unknown, ajout?: unknown, station?: unknown, page?: unknown }} */
  let lu = {};
  try {
    lu = JSON.parse(window.sessionStorage?.getItem(CLE_DE_L_SCREEN) ?? "{}") ?? {};
  } catch {
    return;
  }
  const project = configuration.projets.find(({ nom: name }) => name === lu.projet);
  if (project !== undefined) courant = project;
  else if (lu.ajout === true) ajoute = true;
  else if (typeof lu.station === "string") stationOuverte = lu.station;
  else if (lu.page === COUTS || lu.page === RESUMES) pageDeLApp = lu.page;
}

// La fenêtre s'est rechargée (ticket 3159) : les terminaux ouverts avant sont restés au process principal, chacun dans son
// projet. Chacun retrouve son onglet et ce qu'il avait écrit — rien n'est relancé, ce qu'il écrit ensuite arrive à la
// suite. Ouverte au lancement de l'app, il n'y en a aucun. Une lecture qui échoue n'empêche pas la vue de s'ouvrir :
// chaque terminal revient alors à l'ouverture de son projet (`espace`), sans ce qu'il avait écrit.
async function retrouverLesTerminaux() {
  /** @type {import("../terminaux.ts").Ouvert[]} */
  let ouverts = [];
  try {
    ouverts = (await brigade.terminauxOuverts?.()) ?? [];
  } catch {
    ouverts = [];
  }
  for (const { terminal, ecrit } of ouverts) {
    recevoir(terminal);
    if (ecrit !== "") vue(terminal.id).xterm.write(ecrit);
  }
  terminauxRetrouves = true;
}

// L'entrée de la barre qui est affichée : celle du projet courant, la première —
// « Tous les projets » — ou la dernière, l'ajout. Un fichier refusé n'a ni l'une ni l'autre :
// sa raison prend la place du terminal.
function marquer() {
  retenirLScreen();
  const refuse = configuration.refus !== undefined;
  const affichee = ajoute ? [...bar.children].findIndex(({ id }) => id === "entree-ajout") : courant === undefined ? 0 : configuration.projets.indexOf(courant) + 1;
  [...bar.children].forEach((entree, rang) => (entree.ariaCurrent = String(rang === affichee)));
  // La fiche d'un projet ne reste pas ouverte quand le chef en quitte l'espace.
  if (ouverte !== undefined && ouverte.projet.nom !== courant?.nom) closeCard();
  // L'espace affiché ne porte pas de signal : il le reprend en le quittant.
  for (const project of configuration.projets) marquerSignal(project.nom);
  tous.hidden = refuse || ajoute || courant !== undefined;
  // À la largeur d'un téléphone, l'accueil est la liste des cartes qui attendent le chef (ticket 2915) : elle prend la place
  // de « Tous les projets », sauf sous une page de l'app, une station ou le premier lancement, qui la couvrent comme lui.
  const sousUnePage = stationOuverte !== undefined || pageDeLApp !== undefined || (screenDuFirst !== undefined && screenDuFirst.parentElement === tous);
  const surLesCards = etroit() && !tous.hidden && !sousUnePage;
  cardsDuChef.hidden = !surLesCards;
  if (surLesCards) {
    tous.hidden = true;
    poserLesCardsDuChef();
  }
  addition.hidden = !ajoute;
  teindre();
  principal.hidden = !refuse && courant === undefined;
  colonneSecond.hidden = courant === undefined;
  lireOnglet();
  poserLeProjectAPreparer();
  poserLaRequestDeStationIci();
  poserLeStoryDuFirstTicket();
}

// Tous les projets, dans l'ordre du fichier, puis la station de cet ordinateur (ticket 2638), puis toutes les stations et
// « + station », relues à chaque ouverture (ticket 3195) : l'écran se regarde, et un clic ouvre ce qu'il montre. Ce qui s'y voit se traite dans l'espace du projet, ou sur la page de la station.
function ouvrirTous() {
  // Sans projet (ticket 4082), « Tous les projets » est l'écran d'accueil du premier lancement : la marque du logo, et
  // chaque retour des pages de l'app, y ramènent le novice en un clic.
  if (avecFirst()) return ouvrirFirst();
  courant = undefined;
  ajoute = false;
  stationOuverte = undefined;
  pageDeLApp = undefined;
  marquer();
  poserCode();
  poserHome();
  poserCost();
  poserBlocStation();
  poserStationsDeLHome();
  tous.replaceChildren(blocDeLaPromesse, ...(recapDeLHome.childElementCount > 0 ? [recapDeLHome] : []), blocDesProjects, blocDeLaStation.racine, stationsDeLHome);
  brigade.tous(++request);
  void lireLesEnregistrees();
}

// La liste des stations de l'accueil (ticket 1778) : une ligne par machine, dans l'ordre des noms. Une machine appairée
// se dit par sa présence, telle que le process principal l'a dite (home.ts) — en ligne ou non, ce qu'elle fait, les
// projets qu'elle sert —, et, enregistrée aussi sous le compte GitHub du chef, les projets qui lui y sont choisis s'y
// fondent ; une machine seulement enregistrée se dit par son enregistrement (stations-du-account.js). Jamais deux lignes
// pour une même machine : ses deux lectures ne peuvent plus se contredire.
function poserStationsDeLHome() {
  const stations = homeVu?.stations;
  const lues = enregistreesAbsentes ? undefined : stateDesEnregistrees.stations;
  const lines = uneLineParMachine(stations ?? [], lues?.state === "listed" ? lues.stations : []);
  // Sans station dans la liste : sa lecture en route, ou, quand le compte n'en a aucune non plus, rien — dessous, la
  // lecture du compte dit comment en installer une. Les appairées pas encore lues, la liste n'est pas dite vide.
  const enRoute = stations === undefined || (!enregistreesAbsentes && lues === undefined);
  const sansAucune = lues?.state === "listed" && lues.unreadable.length === 0;
  listeDesStations.replaceChildren(
    ...(lines.length > 0
      ? lines.map((line) => ("appairee" in line ? lineDeStationDeLHome(line.appairee, line.enregistree) : lineDeLEnregistree(document, line.enregistree, actionsDesEnregistrees)))
      : enRoute
        ? [bloc("p", "your stations: first read on GitHub in progress…")]
        : sansAucune
          ? []
          : [bloc("p", `${PAS_ENCORE("station")} Install one, then pair it here with “+ station”.`)]),
  );
  poserLesVersions();
  const dessous = enregistreesAbsentes ? [] : readDuAccount(document, stateDesEnregistrees, actionsDesEnregistrees, stations !== undefined && lines.length === 0);
  blocDesEnregistrees.hidden = dessous.length === 0;
  blocDesEnregistrees.replaceChildren(...dessous);
}

// Le bloc de la station de l'accueil (ticket 2640) : celle de cet ordinateur — installée quand les stations du chef la
// nomment, ou que son statut se lit —, et les autres du chef. Rien n'est dit tant que les stations ne sont pas lues.
function poserBlocStation() {
  const locale = projectsVus?.locale ?? null;
  const toutes = stationsVues?.stations ?? [];
  const dite = (/** @type {import("../stations/stations.ts").StationVue} */ { id, nom: name, ligne: line }) => ({ id, nom: name, phrase: line });
  const ici = locale === null ? undefined : toutes.find(({ id }) => id === locale);
  if (stationsVues === undefined && statusLu(statusDeLaStationVu) === undefined) return blocDeLaStation.lire(undefined);
  // Sans id local, la page de sa station ne s'ouvrirait nulle part : elle n'est pas dite installée.
  if (locale === null || (ici === undefined && statusLu(statusDeLaStationVu) === undefined)) return blocDeLaStation.lire({ station: null });
  const lu = statusLu(statusDeLaStationVu) !== undefined;
  const version = lu ? caseDIci(WORKSTATION.nom, statusDeLaStationVu).phrase : undefined;
  const phrase = lu ? `version ${statusLu(statusDeLaStationVu)?.stationVersion}` : "installed";
  const celle = ici === undefined ? { id: locale, nom: WORKSTATION.nom, phrase } : dite(ici);
  blocDeLaStation.lire({ station: version === undefined ? celle : { ...celle, version }, autres: toutes.filter(({ id }) => id !== locale).map(dite) });
}
// Le statut de la station de cet ordinateur (`statutDeLaStation`, le contrat du ticket 2189) : la version qui tourne ici, la
// dernière publiée, et si elle est en retard. Tant que le pont ne le lit pas, la case de ce poste dit sa version inconnue.
/** @type {unknown} */
let statusDeLaStationVu;
/** @type {import("./standby-machine/standby-machine.js").Standby | undefined} */
let standbyVue;
function poserLesVersions() {
  if (phoneVu !== undefined) return versionsDesStations.replaceChildren();
  const cases = casesDesVersions({ stations: stationsVues?.stations, locale: projectsVus?.locale ?? null, poste: WORKSTATION.nom, statut: statusDeLaStationVu });
  versionsDesStations.replaceChildren(poserVersionsDesStations(document, cases));
}

// Les stations du compte, lues par le process principal (stations-du-account.ts du runtime). Une relecture garde ce qui
// est posé jusqu'à sa réponse : le bloc ne clignote pas. Seule la dernière demandée est posée.
async function lireLesEnregistrees() {
  const demandee = ++readDesEnregistrees;
  /** @type {import("../stations-du-account.ts").StationsDuAccount | undefined} */
  let lu;
  try {
    lu = await brigade.stationsDuCompte?.();
  } catch (error) {
    lu = { state: "unavailable", cause: "github", reason: "Your stations could not be read: the app failed while reading them.", detail: error instanceof Error ? error.message : String(error) };
  }
  if (demandee !== readDesEnregistrees) return;
  enregistreesAbsentes = lu === undefined;
  if (lu !== undefined) stateDesEnregistrees.stations = lu;
  suivreLesAttendus();
  poserStationsDeLHome();
  // La page d'un projet dit les stations du compte qui refusent de l'avoir (ticket 1790).
  if (courant !== undefined) {
    poserStationsDuProject();
    poserCooking(courant);
  }
}

// Un dépôt que le chef vient de cocher pour une station : elle le lit dans les 30 s, et dit ce qu'elle en fait — elle le
// sert, ou refuse (ticket 1790). Jusqu'à ce qu'elle l'ait dit, les stations
// du compte se relisent toutes les `ATTENTE_D_UN_AJOUT_MS`, au plus `RELECTURES_D_UN_AJOUT` fois : sa réponse se lit sous la
// case au moment de l'ajout, sans que le chef ait à relire.
const WAIT_D_UN_ADDITION_MS = 15_000;
const RELECTURES_D_UN_ADDITION = 8;
let relecturesDUnAddition = 0;
/** @type {ReturnType<typeof setTimeout> | undefined} */
let relectureDUnAddition;
function suivreLesAttendus() {
  clearTimeout(relectureDUnAddition);
  const attendus = stateDesEnregistrees.attendus;
  if (attendus === undefined) return;
  const lues = stateDesEnregistrees.stations;
  const station = lues?.state === "listed" ? lues.stations.find(({ id }) => id === attendus.id) : undefined;
  const restants = attendus.depots.filter((repository) => (station?.selection ?? []).includes(repository) && issueDeLAddition(station, repository) === undefined);
  if (restants.length === 0 || relecturesDUnAddition >= RELECTURES_D_UN_ADDITION) {
    delete stateDesEnregistrees.attendus;
    return;
  }
  stateDesEnregistrees.attendus = { id: attendus.id, depots: restants };
  relectureDUnAddition = setTimeout(() => {
    relecturesDUnAddition += 1;
    void lireLesEnregistrees();
  }, WAIT_D_UN_ADDITION_MS);
}

// Une case cochée ou décochée : la sélection entière de la station s'écrit dans son gist. Ses cases attendent la
// réponse ; écrite, la ligne de la station dit ce qu'elle sert — sinon, pourquoi rien n'a changé.
/** @param {string} id @param {string[]} depots @returns {Promise<import("../stations-du-account.ts").Choice>} */
async function choisirPourUneEnregistree(id, depots) {
  stateDesEnregistrees.envoi = id;
  delete stateDesEnregistrees.refus;
  poserStationsDeLHome();
  /** @type {import("../stations-du-account.ts").Choice} */
  let rendu;
  try {
    rendu = (await brigade.choisirLesProjets?.(id, depots)) ?? { refus: "not saved: the app gave no answer" };
  } catch (error) {
    rendu = { refus: "not saved: the app failed while saving", detail: error instanceof Error ? error.message : String(error) };
  }
  delete stateDesEnregistrees.envoi;
  const lues = stateDesEnregistrees.stations;
  if ("refus" in rendu) stateDesEnregistrees.refus = { id, ...rendu };
  else if (lues?.state === "listed") {
    const { selection } = rendu;
    const avant = lues.stations.find((station) => station.id === id)?.selection ?? [];
    stateDesEnregistrees.stations = { ...lues, stations: lues.stations.map((station) => (station.id === id ? { ...station, selection } : station)) };
    // Les dépôts cochés à l'instant : la station va dire ce qu'elle en fait.
    const coches = selection.filter((repository) => !avant.includes(repository));
    if (coches.length > 0) {
      stateDesEnregistrees.attendus = { id, depots: [...new Set([...(stateDesEnregistrees.attendus?.id === id ? stateDesEnregistrees.attendus.depots : []), ...coches])] };
      relecturesDUnAddition = 0;
      suivreLesAttendus();
    }
  }
  poserStationsDeLHome();
  return rendu;
}

// Le premier lancement, sur un ordinateur neuf (ticket 1434, first-launch.js) : tant que le fichier n'a aucun
// projet, l'app s'ouvre sur les stations du chef et leurs projets, lus par le runtime, à la place de l'accueil —
// « T » reste l'entrée affichée, et y ramène ; « + » mène à l'écran « Add a project ». Un projet s'ouvre d'un clic :
// sa copie se fait, chaque étape se dit sous sa station, puis il entre dans le fichier, et son espace s'ouvre. Une
// connexion à GitHub qui manque se fait d'un bouton ; faite, les stations sont relues — et une ouverture qu'elle
// retenait repart d'elle-même.
/** @type {import("./first-launch.js").StateDuFirst} */
const first = { poste: WORKSTATION.nom, saisie: { projet: "" } };
/** @type {any} */
let screenDuFirst;
let readDuFirst = 0;
// Le projet ouvert, que le fichier n'a peut-être pas encore rendu : son espace s'ouvre dès qu'il y est.
/** @type {string | undefined} */
let firstAOuvrir;
// Le compte GitHub de cet ordinateur (journey-project/account.js, ticket 2475), que disent le premier lancement et l'écran
// « Add a project » : lu une fois à l'ouverture de l'un ou l'autre, et relu au bout d'une connexion — ou d'un changement de
// compte, qui en est une. Chaque lecture repose les deux.
const accountDuJourney = holdLeAccount({ pont: brigade, rendre: () => poserLeFirst() });
/** @returns {import("./journey-project/account.js").StateDuAccount} */
const stateDuJourney = () => ({ ...accountDuJourney.etat, ...(first.connexion === undefined ? {} : { connexion: first.connexion }) });
// Les outils que l'app ne livre pas (ticket 4059, tools-required/) : la connexion à GitHub et le clone d'un projet
// demandent Git et le GitHub CLI, le login Max demande Claude Code. Un pas qui en manque cède la place à l'écran de
// l'outil manquant — sur le premier lancement, à la place du compte ; ailleurs, dans l'avis —, et reprend où il était
// une fois l'outil là : l'ouverture d'un projet repart, la connexion retrouve son bouton.
/** @type {(() => void) | undefined} */
let reprendreApresLesTools;
const toolsDuJourney = holdLesTools({
  pont: brigade,
  outils: ["git", "gh"],
  rendre: () => poserLesToolsIci(),
  quandPret: () => {
    const reprendre = reprendreApresLesTools;
    reprendreApresLesTools = undefined;
    reprendre?.();
  },
});
const toolsDuLogin = holdLesTools({ pont: brigade, outils: ["claude"], rendre: () => poserLesToolsIci() });
/** @param {ReturnType<typeof holdLesTools>} tenus */
const actionsDesTools = (tenus) => ({ ouvrir: (/** @type {string} */ url) => void brigade.ouvrirLaPage?.(url), verifier: () => void tenus.verifier(true) });
let opinionDesTools = false;
function poserLesToolsIci() {
  const surLeFirst = screenDuFirst !== undefined && screenDuFirst.parentElement === tous && !tous.hidden;
  if (surLeFirst) poserLeFirst();
  const tenus = [...(surLeFirst ? [] : [toolsDuJourney]), toolsDuLogin].find(({ etat: state }) => state.manque !== undefined);
  if (tenus === undefined) {
    if (opinionDesTools) opinion.hidden = true;
    opinionDesTools = false;
    return;
  }
  opinionDesTools = true;
  opinion.replaceChildren(...poserLesTools(document, tenus.etat, actionsDesTools(tenus)), button("close", () => {
      opinion.hidden = true;
      opinionDesTools = false;
    }, "discret"));
  opinion.hidden = false;
}
/** @param {import("../outages/actions.ts").RenduDeOutage} rendu */
function siClaudeManque(rendu) {
  if ("outilManquant" in rendu) void toolsDuLogin.verifier();
}
/** @type {import("./first-launch.js").ActionsDuFirst} */
const actionsDuFirst = {
  ouvrir: (station, project, repository, base) => void ouvrirDUneStation(station, project, repository, base),
  seConnecter: () => void seConnecterAGitHub(),
  ...(brigade.seConnecterAClaude === undefined ? {} : { seConnecterAClaude: () => void seConnecterAClaude() }),
  changerDeCompte: () => void seConnecterAGitHub(),
  relireLeCompte: () => void accountDuJourney.lire(),
  relire: () => void relireLeFirst(),
  ouvrirLaPage: (url) => void brigade.ouvrirLaPage?.(url),
  ajouterUnProjet: () => ouvrirAddition(),
  visiter: () => commencerLaVisit(),
  outils: actionsDesTools(toolsDuJourney),
};
// Le desktop porte le premier lancement ; un pont qui ne le porte pas s'ouvre sur l'écran « Add a project ».
const avecFirst = () => configuration.projets.length === 0 && phone === undefined && brigade.stationsDuChef !== undefined;
function ouvrirFirst() {
  courant = undefined;
  ajoute = false;
  stationOuverte = undefined;
  pageDeLApp = undefined;
  marquer();
  screenDuFirst = poserFirstLaunch(document, { ...first, ...stateDuJourney(), poste: WORKSTATION.nom, outils: toolsDuJourney.etat }, actionsDuFirst);
  tous.replaceChildren(screenDuFirst);
  accountDuJourney.lireUneFois();
  if (!toolsDuJourney.etat.lu && toolsDuJourney.etat.enCours === undefined) void toolsDuJourney.verifier();
  if (first.stations === undefined && readDuFirst === 0) void relireLeFirst();
}

// Reposé à chaque changement — tant qu'il est l'écran montré : un autre l'a remplacé, rien n'y est reposé.
function poserLeFirst() {
  // La connexion lancée depuis le rail publié s'y dit aussi (rail-published.js, ticket 1435) — et depuis les stations du compte.
  if (courant !== undefined && railsPublies.has(courant.nom) && !rail.hidden) poserRail(courant);
  if (first.connexion === undefined) delete stateDesEnregistrees.connexion;
  else stateDesEnregistrees.connexion = first.connexion;
  poserStationsDeLHome();
  // L'écran « Add a project » dit aussi le compte, la connexion en route et le dépôt qui s'ouvre.
  if (ajoute) poserLAddition();
  if (screenDuFirst === undefined || screenDuFirst.parentElement !== tous || tous.hidden) return;
  screenDuFirst = poserFirstLaunch(document, { ...first, ...stateDuJourney(), poste: WORKSTATION.nom, outils: toolsDuJourney.etat }, actionsDuFirst);
  tous.replaceChildren(screenDuFirst);
}

// L'écran « since you were away » : par projet qui se lit, ce que ses résumés disent de l'absence et ce qui attend le chef
// (`lesCartesDuChef`, la liste que l'app tient déjà pour ce qui attend le chef). Reposé seulement quand ce qu'il dit change.
// Son bouton le ferme, et mène à ce qui attend le chef : sa page, ou — à la largeur d'un téléphone — la liste des cartes ; sans
// rien qui attende, à l'accueil.
function poserLAbsence() {
  if (absenceDepuis === undefined || absenceFermee) return;
  const projects = configuration.projets.filter((project) => seLit(project));
  const cards = lesCardsDuChef();
  const entrees = projects.map(({ nom: name }) => ({
    projet: name,
    lecture: resumesDeLAbsence.get(name),
    attentes: cards.filter(({ projet: project }) => project === name).map(({ ticket, todo }) => {
      const titre = todo.resume ?? todo.question ?? undefined;
      return titre === undefined ? { ticket } : { ticket, titre };
    }),
  }));
  const signature = JSON.stringify(entrees);
  if (signature === absencePosee && !sectionAbsence.hidden) return;
  absencePosee = signature;
  for (const { nom: name } of projects) {
    if (resumesDeLAbsence.has(name) || lecturesDeLAbsence.has(name)) continue;
    lecturesDeLAbsence.add(name);
    void Promise.resolve()
      .then(() => brigade.lireLesResumesHebdomadaires(name))
      .then(
        (lue) => lue,
        (/** @type {unknown} */ error) => ({ projet: name, jour: { sans: NON_ATTEINT("weekly summaries") }, resumes: { sans: NON_ATTEINT("weekly summaries"), detail: error instanceof Error ? error.message : String(error) } }),
      )
      .then((lue) => {
        resumesDeLAbsence.set(name, lue);
        poserLAbsence();
      });
  }
  sectionAbsence.replaceChildren(
    poserAbsence(
      document,
      { depuis: absenceDepuis, projets: entrees },
      {
        fermer: (awaiting) => {
          absenceFermee = true;
          sectionAbsence.hidden = true;
          sectionAbsence.replaceChildren();
          const first = awaiting ? cards[0] : undefined;
          const ouvert = first === undefined ? undefined : projectDe(first.projet);
          if (ouvert !== undefined && !etroit()) void ouvrir(ouvert);
          else ouvrirTous();
          show();
        },
      },
    ),
  );
  sectionAbsence.hidden = false;
}

// L'écran de la visite, par-dessus tout, et la bulle de son étape ; la visite pas commencée ou quittée, rien. L'étape
// désigne ce que l'écran de la cuisine visitée montre à l'instant.
function poserLaVisit() {
  const enCours = visit.etat;
  if (enCours === undefined) {
    marquerLaCible(undefined);
    sectionVisit.hidden = true;
    cadreSousLaVisit.inert = false;
    return sectionVisit.replaceChildren();
  }
  const screen = poserLaKitchenVisitee(document, kitchenVisitee, { quitter: () => visit.quitter(), relire: () => void lireLaKitchenVisitee() });
  const steps = stepsDeLaVisit(kitchenVisitee !== undefined && "tableau" in kitchenVisitee ? kitchenVisitee.tableau.rail.colonnes : undefined);
  const step = steps[enCours.rang] ?? steps[0];
  sectionVisit.replaceChildren(
    screen.racine,
    poserVisit(document, { etapes: steps, rang: enCours.rang }, {
      suivante: () => visit.suivante(steps.length),
      // Le seul appel à agir de la dernière étape : l'ajout d'un projet, le même que « add my project ».
      ajouter: () => {
        visit.quitter();
        ouvrirAddition();
      },
    }),
  );
  sectionVisit.hidden = false;
  cadreSousLaVisit.inert = true;
  marquerLaCible(step === undefined ? undefined : trouverLaCible({ rail: screen.rail, second: screen.second }, step.cible));
}

// La visite, choisie sur l'écran d'accueil ou rejouée depuis la barre : de sa première étape, sur la cuisine relue.
function commencerLaVisit() {
  visit.commencer();
  void lireLaKitchenVisitee();
}

// La cuisine de Brigade, lue sur GitHub par le process principal en lectures seules (visit.ts) : aucun clone, aucun
// projet ajouté. Ce qui ne se lit pas — un pont qui ne répond pas, ou qui lève — se dit sur l'écran, avec « read again ».
// Seule la dernière lecture demandée se pose.
async function lireLaKitchenVisitee() {
  const request = ++readDeLaVisit;
  kitchenVisitee = undefined;
  poserLaVisit();
  /** @type {import("../visit.ts").KitchenVisitee} */
  const lue = await Promise.resolve(brigade.lireLaCuisineVisitee?.(REPOSITORY_DE_LA_VISIT)).then(
    (rendue) => rendue ?? { sans: "Brigade's kitchen could not be read: the app gave no answer." },
    (/** @type {unknown} */ error) => ({ sans: error instanceof Error ? error.message : String(error) }),
  );
  if (request !== readDeLaVisit) return;
  kitchenVisitee = lue;
  poserLaVisit();
}

// La page d'un projet pas encore prêt (ticket 3166, journey-first-project/). La lecture d'un projet qu'« Add a project »
// vient d'ouvrir décide : en lecture seule (ticket 3163), rien ne s'ouvre ; une lecture ratée ne décide rien, la suivante
// décidera. Le parcours ouvert, chaque lecture relit la mise en place tant que le projet ne l'a pas — la PR de mise en
// place mergée, la suivante le dit prêt (ticket 3170).
/** @param {string} name */
function suivreLeJourney(name) {
  const tenu = tenus.get(name);
  const lu = tenu !== undefined && "tableau" in tenu;
  const project = projectDe(name);
  if (project === undefined || !lu) return;
  const repository = aGuider.get(name);
  if (repository !== undefined) {
    aGuider.delete(name);
    if (readOnlyDe(project) !== undefined) return;
    journeyDesProjects.commencer(name, repository, dejaCuit(project, repository));
    // Le premier projet du chef : le fichier n'en a pas d'autre que benomite/brigade, que l'app ajoutait d'elle-même avant
    // la visite en lecture seule (ticket 4087).
    storyDuFirstTicket.projetAjoute(name, configuration.projets.some((autre) => autre.nom !== name && autre.depot !== REPOSITORY_DE_LA_VISIT));
    if (tenu !== undefined && "tableau" in tenu) storyDuFirstTicket.observer(name, tenu.tableau.etapesDesTickets);
    departsDesProjects.commencer(name);
    void lireLeDepart(name);
    // Les stations du compte se proposent à « qui le cuit » : relues, la question se repose.
    void lireLesEnregistrees().then(() => poserLeProjectAPreparer());
    void lirePreparation(project);
    if (courant?.nom === name) reposerLaPage(project);
    return;
  }
  const journey = journeyDesProjects.de(name);
  if (journey === undefined || journey.pret !== undefined) return;
  const step = depots.get(name)?.etape;
  if ((journey.station === "ajoutee" || journey.station === "inutile") && step !== "prepare" && step !== "en-route") void lirePreparation(project);
  if (courant?.nom === name) poserLeProjectAPreparer();
}

// Les issues ouvertes du projet et ce que le second en propose, lus par l'app (depart-du-project.ts) : le départ le montre, ou
// s'efface quand il n'y a rien à proposer. Une lecture qui échoue se dit sur l'écran, jamais un écran vide.
/** @param {string} name */
async function lireLeDepart(name) {
  try {
    departsDesProjects.recu(name, await brigade.departDuProjet(name));
  } catch (error) {
    departsDesProjects.recu(name, { sans: "the app could not ask the second for its proposals", detail: error instanceof Error ? error.message : String(error) });
  }
}

// Le bouton unique : les lignes restantes, avec les priorités montrées à l'écran, sur le rail.
/** @param {string} name */
async function mettreLeDepartSurLeRail(name) {
  const mise = departsDesProjects.commencerLaMise(name);
  if (mise === undefined) return;
  try {
    const rendu = await brigade.mettreSurLeRail(name, mise.lignes.map(({ ticket, priorite: priority }) => ({ ticket, priorite: priority })));
    if ("fait" in rendu) departsDesProjects.mise(name, rendu.fait, rendu.refus);
    else departsDesProjects.miseRatee(name, rendu.refus, rendu.detail ?? "");
  } catch (error) {
    departsDesProjects.miseRatee(name, "nothing was put on the rail: GitHub could not be reached", error instanceof Error ? error.message : String(error));
  }
}

// La question est posée sur ce projet : sa page n'a qu'elle.
/** @param {string} name */
function journeyOuvert(name) {
  const journey = journeyDesProjects.de(name);
  return journey !== undefined && journey.pret === undefined;
}

// Une station cuit déjà le projet — elle le sert, l'app le lui a demandé, ou c'est celle de cet ordinateur : « qui le
// cuit » n'est pas posée.
/** @param {Project} project @param {string} repository */
function dejaCuit(project, repository) {
  const { stations } = kitchenOf(project);
  const read = servedOnes.etat?.lecture;
  const ici = read !== undefined && "depots" in read && read.depots.some((served) => served.toLowerCase() === repository.toLowerCase());
  return ici || stations.length > 0 || ouCuit(project, stations) !== undefined;
}

/** @param {Project} project */
async function lirePreparation(project) {
  if (preparationsEnRead.has(project.nom)) return;
  preparationsEnRead.add(project.nom);
  try {
    const failure = await lireLeRepository(project);
    journeyDesProjects.illisible(project.nom, failure);
  } finally {
    preparationsEnRead.delete(project.nom);
  }
}

// Une station sert le projet : celle de cet ordinateur l'a dans sa liste (projects-served/), une station dit le servir
// (stations/stations.ts), ses stations disent où il cuit (`cuitSur`), ou sa cuisine tourne ici. Une station à qui il est
// seulement demandé ne le sert pas encore.
/** @param {Project} project @param {string} repository @param {readonly string[]} servedIci */
function servedParUneStation(project, repository, servedIci) {
  const cle = repository.toLowerCase();
  const dit = projectsVus?.projets.find(({ nom: name }) => name === project.nom)?.cuitSur;
  return (
    servedIci.some((served) => served.toLowerCase() === cle) ||
    (stationsVues?.stations ?? []).some(({ projets: projects }) => projects.includes(project.nom)) ||
    (dit !== undefined && dit !== null) ||
    project.ici === true
  );
}

// La question du ticket 3400, au-dessus du rail du projet affiché. Sa mise en place vient de passer : elle se juge dès que
// la liste de cet ordinateur et les stations sont lues — jamais sur une lecture manquante, ni pendant que le parcours
// pose sa propre question « qui le cuit ».
function poserLaRequestDeStationIci() {
  const project = courant;
  const fermer = () => {
    sectionDeLaRequest.hidden = true;
    sectionDeLaRequest.replaceChildren();
  };
  if (project === undefined || readOnlyDe(project) !== undefined) return fermer();
  const name = project.nom;
  const repository = project.depot ?? projectsVus?.projets.find((candidat) => candidat.nom === name)?.depot;
  const state = demandesDeStation.de(name);
  if (state === undefined || repository === undefined) return fermer();
  const read = servedOnes.etat?.lecture;
  const servedIci = read !== undefined && "depots" in read ? read.depots : undefined;
  if (state.etape === "a-juger") {
    const journey = journeyDesProjects.de(name);
    const questionDuJourney = journey !== undefined && journey.pret === undefined && journey.station !== "ajoutee" && journey.station !== "inutile";
    if (servedIci === undefined || stationsVues === undefined || questionDuJourney) return fermer();
    const served = servedParUneStation(project, repository, servedIci);
    // Posée : les stations du compte se proposent après cet ordinateur — relues, la question se repose.
    if (!served) void lireLesEnregistrees().then(() => poserLaRequestDeStationIci());
    return demandesDeStation.juger(name, served);
  }
  const lues = enregistreesAbsentes ? undefined : stateDesEnregistrees.stations;
  const choice = choiceDeStation({
    ici: servedIci !== undefined,
    hote: WORKSTATION.nom === CET_ORDINATEUR ? "" : WORKSTATION.nom,
    stations: lues?.state === "listed" ? stationsAProposer(lues.stations, repository, projectsVus?.locale) : [],
    maintenant: Date.now(),
  });
  sectionDeLaRequest.replaceChildren(
    poserLaRequestDeStation(
      document,
      { depot: repository, etat: state, choix: choice },
      {
        // Cet ordinateur : le geste de la case de Settings (`servirUnProjet`) ; une station du compte : sa sélection.
        choisir: async (un) => {
          if (demandesDeStation.de(name)?.etape === "enCours") return;
          demandesDeStation.choisir(name, un.cle);
          const appairee = lues?.state === "listed" ? lues.stations.find(({ id }) => id === un.cle) : undefined;
          const rendu = await ajouterLaStation(un.nom, () =>
            un.cle === ICI ? servirIciLeRepository(repository)
            : appairee === undefined ? Promise.resolve({ refus: `${un.nom} is no longer one of your stations` })
            : choisirPourUneEnregistree(appairee.id, [...(appairee.selection ?? []), repository]),
          );
          demandesDeStation.choisi(name, rendu, { nom: un.nom, ici: un.cle === ICI, absente: un.horsLigne });
        },
        ecarter: () => demandesDeStation.ecarter(name),
        fermer: () => demandesDeStation.fermer(name),
      },
    ),
  );
  sectionDeLaRequest.hidden = false;
}

// La question posée ou levée : l'avis d'un projet pas préparé (ticket 2628) et le rail se reposent.
/** @param {Project} project */
function reposerLaPage(project) {
  if (courant?.nom !== project.nom) return;
  poserAlerts(project);
  poserRail(project);
}

// Ce que la vue sait du second du projet : il ne part pas, il propose au chef, et ce que le titre de son terminal dit.
/** @param {string} name @returns {import("./journey-first-project/journey-first-project.js").Second} */
function secondDuJourney(name) {
  const second = [...vues.values()].find(({ terminal }) => terminal.projet === name && terminal.genre === "second")?.terminal;
  const titre = travailDuSecond(titresDesSeconds.get(name));
  return {
    ...(second?.empeche === undefined ? {} : { empeche: true }),
    ...(propositionsDuSecond.aMontrer(name) === undefined && propositionsDuSecond.geste(name) === undefined ? {} : { propose: true }),
    ...(titre === undefined ? {} : { titre }),
  };
}

// La page du projet affiché, s'il n'est pas prêt (ticket 3166) : la question à la place du rail — `main` le porte (`data-parcours`), et
// sa feuille de style y cache le reste ; prêt, la ligne du premier ticket au-dessus du rail ; sinon, rien.
function poserLeProjectAPreparer() {
  const project = courant;
  const journey = project === undefined ? undefined : journeyDesProjects.de(project.nom);
  const fermer = () => {
    sectionDuJourney.hidden = true;
    sectionDuJourney.replaceChildren();
    delete principal.dataset.parcours;
  };
  if (project === undefined || journey === undefined) return fermer();
  const name = project.nom;
  // L'accès en écriture perdu en route : la page s'ouvre en lecture seule (ticket 3163), sans rien de tout cela.
  if (readOnlyDe(project) !== undefined) {
    journeyDesProjects.fermer(name);
    return reposerLaPage(project);
  }
  // Prêt : au-dessus du rail, le second demande au chef ce qu'il veut changer d'abord (ticket 3306). Le champ tapé garde le
  // clavier quand la page se repose.
  if (journey.pret !== undefined) {
    delete principal.dataset.parcours;
    premiersTickets.commencer(name);
    const state = premiersTickets.de(name);
    if (state === undefined) return fermer();
    const rendreLeChamp = garderLeClavier(document.activeElement, sectionDuJourney);
    sectionDuJourney.replaceChildren(
      poserFirstTicket(document, { depot: journey.depot, etat: state, ...(journey.absente === undefined ? {} : { absente: journey.absente }) }, {
        ecrire: (texte) => premiersTickets.ecrire(name, texte),
        envoyer: () => void premiersTickets.envoyer(name),
        oui: () => void premiersTickets.oui(name),
        changer: () => void premiersTickets.changer(name),
        fermer: () => {
          premiersTickets.oublier(name);
          journeyDesProjects.fermer(name);
        },
      }),
    );
    sectionDuJourney.hidden = false;
    rendreLeChamp();
    return;
  }
  const depart = departsDesProjects.de(name);
  if (depart !== undefined) {
    principal.dataset.parcours = "depart";
    sectionDuJourney.replaceChildren(
      poserLeDepart(
        document,
        { depot: journey.depot, etat: depart },
        {
          changer: (ticket, priority) => departsDesProjects.changer(name, ticket, priority),
          lacher: (ticket) => departsDesProjects.lacher(name, ticket),
          mettre: () => void mettreLeDepartSurLeRail(name),
          passer: () => departsDesProjects.passer(name),
          relire: () => {
            departsDesProjects.relire(name);
            void lireLeDepart(name);
          },
        },
      ),
    );
    sectionDuJourney.hidden = false;
    return;
  }
  if (journey.station === "a-faire" && dejaCuit(project, journey.depot)) return journeyDesProjects.station(name, "inutile");
  const preparation = depots.get(name);
  const tenu = tenus.get(name);
  const cardItem = tenu !== undefined && "tableau" in tenu ? cardDeSetup(tenu.tableau.rail.colonnes) : undefined;
  const lu = { station: journey.station, ...(preparation === undefined ? {} : { preparation }) };
  const vu = vuDuJourney({ ...lu, ...(journey.illisible === undefined ? {} : { illisible: journey.illisible }), carte: cardItem !== undefined, second: secondDuJourney(name) });
  if (vu.etape === "pret") {
    journeyDesProjects.pret(name);
    return reposerLaPage(project);
  }
  if (vu.etape === "setup" && vu.attente !== "lecture") journeyDesProjects.setupMontre(name);
  const read = servedOnes.etat?.lecture;
  const lues = enregistreesAbsentes ? undefined : stateDesEnregistrees.stations;
  const choice = choiceDeStation({
    // Cet ordinateur est offert tant que sa lecture ne dit pas qu'il n'a pas de station.
    ici: read === undefined || "depots" in read,
    hote: WORKSTATION.nom === CET_ORDINATEUR ? "" : WORKSTATION.nom,
    stations: lues?.state === "listed" ? stationsAProposer(lues.stations, journey.depot, projectsVus?.locale) : [],
    maintenant: Date.now(),
  });
  principal.dataset.parcours = vu.etape;
  sectionDuJourney.replaceChildren(
    poserJourneyFirstProject(
      document,
      {
        depot: journey.depot,
        vu,
        progression: progression(vu, lu),
        station: journey.station,
        choix: choice,
        ...(journey.illisible === undefined ? {} : { illisible: journey.illisible }),
        ...(preparation?.etape === "refus" ? { refus: preparation.dit } : {}),
        ...(journey.absente === undefined ? {} : { absente: journey.absente }),
      },
      {
        // Un clic, et la page passe à la suite : cet ordinateur sert le dépôt par le geste de « Add a station »
        // (`servirUnProjet`) ; une station du compte le reçoit dans sa sélection (`choisirLesProjets`).
        choisir: async (un) => {
          const avant = journeyDesProjects.de(name)?.station;
          if (avant === undefined || (typeof avant === "object" && "enCours" in avant)) return;
          journeyDesProjects.station(name, { enCours: un.cle });
          const appairee = lues?.state === "listed" ? lues.stations.find(({ id }) => id === un.cle) : undefined;
          const station = await ajouterLaStation(un.nom, () =>
            un.cle === ICI || appairee === undefined ? servirIciLeRepository(journey.depot) : choisirPourUneEnregistree(appairee.id, [...(appairee.selection ?? []), journey.depot]),
          );
          journeyDesProjects.station(name, station, un.horsLigne ? un.nom : undefined);
          const step = depots.get(name)?.etape;
          if (station === "ajoutee" && step !== "prepare" && step !== "en-route") void lirePreparation(project);
        },
        relire: () => void lirePreparation(project),
        preparer: () => void preparerLeRepository(project),
        ouvrirLaCarte: () => {
          if (cardItem !== undefined) openCard(project, cardItem, sectionDuJourney);
        },
      },
    ),
  );
  sectionDuJourney.hidden = false;
}

// Le récit du premier ticket, sur la page du projet qui l'a (ticket 3302) : rien ailleurs, ni en lecture seule. Ses liens
// ouvrent la PR du ticket — celle de son cook tant qu'il est sur le rail, puis celle qui l'a servi.
function poserLeStoryDuFirstTicket() {
  const project = courant;
  const story = project === undefined || readOnlyDe(project) !== undefined ? undefined : storyDuFirstTicket.de(project.nom);
  if (project === undefined || story === undefined) {
    sectionDuStory.hidden = true;
    sectionDuStory.replaceChildren();
    return;
  }
  const { nom: name } = project;
  const { ticket } = story;
  sectionDuStory.replaceChildren(
    poserStoryDuFirstTicket(document, story, {
      ouvrir: () => void brigade.ouvrirPrDuCook(name, ticket).then((ouverte) => ouverte || brigade.ouvrirPr(name, ticket)),
      ranger: () => storyDuFirstTicket.ranger(),
    }),
  );
  sectionDuStory.hidden = false;
}

async function relireLeFirst() {
  const demandee = ++readDuFirst;
  delete first.stations;
  poserLeFirst();
  /** @type {import("../first-launch.ts").StationsDuChef} */
  let lu;
  try {
    lu = (await brigade.stationsDuChef?.()) ?? { state: "unavailable", cause: "github", reason: "Your stations could not be read: the app gave no answer." };
  } catch (error) {
    const detail = error instanceof Error ? error.message : String(error);
    lu = { state: "unavailable", cause: "github", reason: "Your stations could not be read: the app failed while reading them.", detail };
  }
  if (demandee !== readDuFirst) return;
  first.stations = lu;
  poserLeFirst();
}

// `base` : la branche par défaut que GitHub a donnée du dépôt (l'écran « Add a project ») — à défaut, celle que l'origine
// de sa copie désigne.
/** @param {string} station @param {string} project @param {string} repository @param {string} [base] */
async function ouvrirDUneStation(station, project, repository, base) {
  // Le clone demande Git et le GitHub CLI : l'un manque, son écran le dit, et l'ouverture repart une fois installé.
  if (!(await toolsDuJourney.verifier())) {
    reprendreApresLesTools = () => void ouvrirDUneStation(station, project, repository, base);
    return;
  }
  first.ouverture = { station, projet: project, depot: repository, ...(base === undefined ? {} : { base }) };
  poserLeFirst();
  /** @type {import("../first-launch.ts").Ouverture} */
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
    return poserLeFirst();
  }
  delete first.ouverture;
  // Cloné à l'instant : où, en une ligne — la page du projet s'ouvre dessous.
  if ("cloned" in issue && issue.cloned) poserOpinion({ titre: CLONE_DANS(issue.folder), lignes: [] });
  // Ajouté, il est déjà arrivé par `surConfiguration` — sinon, son espace s'ouvre dès qu'il y arrive.
  const ouvert = projectDe(issue.project);
  if (ouvert !== undefined) return void ouvrir(ouvert);
  firstAOuvrir = issue.project;
  poserLeFirst();
}

// Le login de Claude Code qu'une ouverture retenue demande (ticket 4057) : celui de la panne « Max connection lost ». Ce qu'il
// rend se dit sous le projet ; sa fin arrive par `surLoginClaude`, et l'ouverture repart.
async function seConnecterAClaude() {
  /** @type {import("../outages/actions.ts").RenduDeOutage} */
  let rendu;
  try {
    rendu = (await brigade.seConnecterAClaude?.()) ?? { refus: "the login was not launched: the app gave no answer" };
  } catch (error) {
    rendu = { refus: `the login was not launched: the app failed while launching it (${error instanceof Error ? error.message : String(error)})` };
  }
  siClaudeManque(rendu);
  if (first.ouverture?.echec?.state !== "login") return;
  first.ouverture.login = rendu;
  poserLeFirst();
}

async function seConnecterAGitHub() {
  // Une connexion qui ne peut pas partir — sans `gh` — ne tourne pas : l'écran de l'outil manquant la remplace, et le
  // bouton revient tel quel une fois l'outil installé.
  if (!(await toolsDuJourney.verifier())) {
    reprendreApresLesTools = undefined;
    return;
  }
  first.connexion = { enRoute: true };
  poserLeFirst();
  /** @type {import("../connection-github.ts").DebutDeConnection} */
  let debut;
  try {
    debut = (await brigade.seConnecterAGitHub?.()) ?? { refus: "GitHub sign-in could not be started: the app gave no answer." };
  } catch (error) {
    debut = { refus: "GitHub sign-in could not be started: the app failed while starting it.", detail: error instanceof Error ? error.message : String(error) };
  }
  if ("connecte" in debut) return connecteAGitHub();
  first.connexion = debut;
  poserLeFirst();
}

// Connecté : le compte et les stations sont relus, et une ouverture que la connexion retenait repart.
function connecteAGitHub() {
  delete first.connexion;
  accountDuJourney.apresLaConnexion();
  // Et son rail sur GitHub : connecté, il se lit peut-être (ticket 2076).
  if (courant !== undefined && railsPublies.has(courant.nom)) relireLeRailPublished(courant);
  const retenue = first.ouverture?.echec?.cause === "sign-in-required" ? first.ouverture : undefined;
  void relireLeFirst();
  if (!enregistreesAbsentes) void lireLesEnregistrees();
  // Les dépôts de l'écran « Add a project » se lisent du compte qui vient de se connecter.
  if (ajoute) void lireLesDepotsDeLAddition();
  if (retenue !== undefined) void ouvrirDUneStation(retenue.station, retenue.projet, retenue.depot, retenue.base);
}

brigade.surOuverture?.((repository, step) => {
  const { ouverture } = first;
  if (ouverture === undefined || ouverture.depot !== repository || ouverture.echec !== undefined) return;
  ouverture.etape = step;
  poserLeFirst();
});
// Le login de Claude Code fini : l'ouverture qu'il retenait repart — connecté, la cuisine démarre ; sinon, « log in » revient.
brigade.surLoginClaude?.(() => {
  const retenue = first.ouverture?.echec?.state === "login" ? first.ouverture : undefined;
  if (retenue !== undefined) void ouvrirDUneStation(retenue.station, retenue.projet, retenue.depot, retenue.base);
});
// Sur le téléphone, la connexion à GitHub est celle de son premier écran (connection-github.js) : elle n'est pas d'ici.
brigade.surConnexionGitHub?.((fin) => {
  if (phoneVu !== undefined) return;
  if ("connecte" in fin) return connecteAGitHub();
  first.connexion = fin;
  // Une connexion qui n'a pas abouti — un changement de compte abandonné : le compte est relu, tel qu'il est resté.
  accountDuJourney.apresLaConnexion();
});

// La page des coûts de tous les projets, à la place de l'accueil : « T » reste l'entrée affichée, et un
// geste y ramène. Seule sa lecture part — `station` sur la box de chaque projet — tant qu'elle est affichée.
function ouvrirCouts() {
  courant = undefined;
  ajoute = false;
  stationOuverte = undefined;
  pageDeLApp = COUTS;
  marquer();
  poserCost();
  tous.replaceChildren(pageDesCouts);
  retourDesCouts.focus();
}
ouvrirLesCouts.addEventListener("click", () => ouvrirCouts());
retourDesCouts.addEventListener("click", () => ouvrirTous());
// La page des résumés hebdomadaires de tous les projets, de même : chaque projet qui se lit, lu à l'ouverture.
function ouvrirResumes() {
  courant = undefined;
  ajoute = false;
  stationOuverte = undefined;
  pageDeLApp = RESUMES;
  marquer();
  resumesDeTous.poser(configuration.projets.filter((project) => seLit(project)).map(({ nom: name }) => name));
  tous.replaceChildren(pageDesResumes);
  retourDesResumes.focus();
}
ouvrirLesResumes.addEventListener("click", () => ouvrirResumes());
retourDesResumes.addEventListener("click", () => ouvrirTous());

// La page d'une station, à la place de l'accueil : « T » reste l'entrée affichée, et un geste y ramène.
/** @param {string} id */
function ouvrirStation(id) {
  courant = undefined;
  ajoute = false;
  stationOuverte = id;
  pageDeLApp = undefined;
  retraitDeStationRequest = undefined;
  retraitDeStationRefuse = "";
  sectionsDeStationPosees = "";
  sectionsDeStation.replaceChildren();
  marquer();
  poserPageDeStation();
  tous.replaceChildren(pageDeStation);
  retourALHome.focus();
}
retourALHome.addEventListener("click", () => ouvrirTous());

// Les choix d'une liste, précédés de celui qui n'en est pas un : rien n'est choisi d'avance.
/** @param {HTMLSelectElement} liste @param {readonly string[]} choice @param {string} aucun */
function proposer(liste, choice, aucun) {
  const guard = liste.value;
  const empty = new Option(aucun, "");
  liste.replaceChildren(empty, ...choice.map((valeur) => new Option(valeur, valeur)));
  liste.value = choice.includes(guard) ? guard : "";
}

// L'écran « Add a project » (ticket 3181, journey-project/addition.js) : il ne fait que choisir le dépôt. Ses dépôts se
// relisent à chaque ouverture — les derniers poussés d'abord —, la recherche et le collage restent d'un passage à l'autre.
// Un dépôt choisi s'ouvre comme un projet du premier lancement : sa copie reprise ou clonée, il entre dans la colonne de
// gauche, et sa page s'ouvre (`ouvrirDUneStation`).
/** @type {import("./journey-project/addition.js").StateDeLAddition} */
const stateDeLAddition = { saisie: { recherche: "", colle: "" } };
let readDesDepotsDeLAddition = 0;
/** @type {import("./journey-project/addition.js").ActionsDeLAddition} */
const actionsDeLAddition = {
  ...actionsDuFirst,
  choisir: (choisi) => choisirLeRepository(choisi),
  coller: (texte) => void collerUnRepository(texte),
  relire: () => void lireLesDepotsDeLAddition(),
};

function ouvrirAddition() {
  // Reposé sur lui-même — le fichier des projets a changé pendant qu'il est montré —, il ne relit pas les dépôts.
  const dejaLa = ajoute;
  courant = undefined;
  ajoute = true;
  stationOuverte = undefined;
  pageDeLApp = undefined;
  delete stateDeLAddition.refus;
  // Une ouverture ratée, laissée là, ne reste pas sur un nouvel ajout ; celle qui court, si.
  if (first.ouverture?.echec !== undefined) delete first.ouverture;
  marquer();
  poserLAddition();
  // Le téléphone n'ajoute aucun projet : il ne lit ni compte ni dépôts.
  if (phone !== undefined) return;
  accountDuJourney.lireUneFois();
  if (!dejaLa) void lireLesDepotsDeLAddition();
}

function poserLAddition() {
  addition.replaceChildren(poserLScreenDAddition(document, { ...stateDeLAddition, ...stateDuJourney(), ...(phone === undefined ? {} : { telephone: true }), ...(first.ouverture === undefined ? {} : { ouverture: first.ouverture }) }, actionsDeLAddition));
}

// Les dépôts du compte, lus sur GitHub : la dernière lecture demandée l'emporte ; ratée, l'écran le dit et offre de relire.
async function lireLesDepotsDeLAddition() {
  const demandee = ++readDesDepotsDeLAddition;
  delete stateDeLAddition.depots;
  if (ajoute) poserLAddition();
  /** @type {NonNullable<import("./journey-project/addition.js").StateDeLAddition["depots"]>} */
  let lus;
  try {
    lus = (await brigade.depotsDuChef()) ?? { refus: "the app gave no answer" };
  } catch (error) {
    lus = { refus: error instanceof Error ? error.message : String(error) };
  }
  if (demandee !== readDesDepotsDeLAddition) return;
  stateDeLAddition.depots = lus;
  if (ajoute) poserLAddition();
}

// Un dépôt choisi : le projet porte son nom, en minuscules, comme au premier lancement, et sa branche d'intégration est
// celle que GitHub donne.
/** @param {{ depot: string, base: string }} choisi */
function choisirLeRepository(choisi) {
  delete stateDeLAddition.refus;
  const lu = lireLeProject("", choisi.depot);
  if ("refus" in lu) {
    stateDeLAddition.refus = lu.refus;
    return poserLAddition();
  }
  // Le projet ouvert, sa page dit ce qui reste à faire avant qu'il soit prêt (ticket 3166) — quand sa première lecture
  // dit que le compte peut écrire dans son dépôt. Une ouverture ratée n'a rien à guider.
  aGuider.set(lu.nom, lu.depot);
  void ouvrirDUneStation("", lu.nom, lu.depot, choisi.base).then(() => {
    // Retenue tant que Claude Code n'est pas connecté (ticket 4057) : elle repart à la fin du login, son projet reste à guider.
    if (first.ouverture?.echec?.state === "login") return;
    if (first.ouverture?.echec !== undefined && first.ouverture.projet === lu.nom) aGuider.delete(lu.nom);
    // Le projet était déjà lu — dans le fichier avant d'être choisi : sa lecture tenue décide sans attendre la suivante.
    else suivreLeJourney(lu.nom);
  });
}

// Un dépôt collé — lien GitHub ou `owner/name`, public et pas au chef compris — : lu sur GitHub, puis ouvert ; ce qui
// n'en est pas un, ou que GitHub ne rend pas, se dit sous le champ.
/** @param {string} texte */
async function collerUnRepository(texte) {
  const name = repositoryCollePar(texte);
  delete stateDeLAddition.refus;
  if (name === null) {
    stateDeLAddition.refus = PAS_UN_REPOSITORY;
    return poserLAddition();
  }
  /** @type {{ depot: string, base: string } | { refus: string }} */
  let resolu;
  try {
    resolu = (await brigade.lireUnDepot(name)) ?? { refus: `${name} could not be read on GitHub: the app gave no answer.` };
  } catch (error) {
    resolu = { refus: `${name} could not be read on GitHub: ${error instanceof Error ? error.message : String(error)}.` };
  }
  if ("refus" in resolu) {
    stateDeLAddition.refus = resolu.refus;
    return poserLAddition();
  }
  stateDeLAddition.saisie.colle = "";
  choisirLeRepository(resolu);
}

// Le rail qu'une station publie sur GitHub pour un projet qu'aucune station connue ne sert ici (ticket 1435,
// rail-published.js), lu par le runtime à l'ouverture de l'espace, et relu d'un bouton — ou après une connexion à GitHub :
// il dit pourquoi le tableau de la cuisine ne se lit pas encore (ticket 2076). Ce qui en est tenu est en tête du fichier
// (`railsPublies`).

/** @param {Project} project */
async function lireLeRailPublished(project) {
  const demandee = (lecturesPubliees.get(project.nom) ?? 0) + 1;
  lecturesPubliees.set(project.nom, demandee);
  railsPublies.set(project.nom, {});
  if (courant?.nom === project.nom) poserRail(project);
  /** @type {import("./rail-published.js").StateDuRailPublished & { sansReponse?: true }} */
  let lu;
  try {
    const rendu = await brigade.railDuProjet?.(project.nom);
    lu = rendu === undefined ? { sansReponse: true } : { lu: rendu };
  } catch (error) {
    const detail = error instanceof Error ? error.message : String(error);
    lu = { lu: { state: "unavailable", project: project.nom, cause: "unreadable", reason: `The rail of ${project.nom} could not be read: the app failed while reading it.`, detail } };
  }
  if (lecturesPubliees.get(project.nom) !== demandee) return;
  railsPublies.set(project.nom, lu);
  if (courant?.nom === project.nom && !rail.hidden) poserRail(project);
}

// « read again » : le tableau de la cuisine se relit avec lui, c'est lui qui pose le rail (ticket 2076).
/** @param {Project} project */
function relireLeRailPublished(project) {
  lireLesFacts();
  void lireLeRailPublished(project);
}

/** @param {Project} project @returns {import("./rail-published.js").ActionsDuRailPublished} */
function actionsDuRailPublished(project) {
  return {
    relire: () => relireLeRailPublished(project),
    seConnecter: () => void seConnecterAGitHub(),
    ouvrirLaPage: (url) => void brigade.ouvrirLaPage?.(url),
  };
}

/** @param {Project} project */
async function ouvrir(project) {
  courant = project;
  teamDuProject.lire(project.nom);
  enregistreesARelire = true;
  stationOuverte = undefined;
  pageDeLApp = undefined;
  if (urgenceChoisie !== project.nom) urgenceChoisie = "";
  nonEcrit = nonEcritSecond = "";
  actionRate = undefined;
  // Une confirmation ouverte sur un autre projet ne reste pas ouverte : rien n'en part.
  if (aConfirmer?.projet !== project.nom) aConfirmer = undefined;
  ajoute = false;
  // Comme le panneau : l'onglet de contenu laissé là est relu tout de suite.
  suivi = undefined;
  marquer();
  // Dès maintenant : la carte et la bannière du projet quitté ne restent pas sur celui-ci
  // pendant que son espace s'ouvre.
  dessiner();
  // Les stations que sa box déclare viennent avec la lecture de son installation (service.ts).
  void lireService(project);
  // Ni sa ligne de retrait : elle nomme son projet.
  retrait.hidden = true;
  void lireRetrait(project);
  poserSigle(project);
  poserCouleurs(project);
  poserBarDeMenus();
  void poserOrdinaires(project);
  void identitiesGithub.lire();
  void servedOnes.lire();
  poserLesSettingsDuProject(project);
  void lireLesSettings(project);
  void monterLesHumans(document, element("humains-du-projet"), { projet: project.nom, service: serviceDuPont(brigade, project.nom), ouvrir: (url) => void brigade.ouvrirLaProposition(url) });
  void monterLesRecurring(document, element("recurrents-du-projet"), { projet: project.nom, service: serviceDesRecurring(brigade, project.nom) });
  void monterLaCardProject(document, element("fiche-du-projet"), { projet: project.nom, pont: brigade });
  poserLesExplanationsDuChef(project.nom);
  void explanations.lire(project.nom);
  void monterLesStations(document, element("stations-contributrices"), { projet: project.nom, service: serviceDesStations(brigade, project.nom) });
  brigade.regarder(project.nom, ++request);
  if (!seLit(project) && project.sansStation !== true) void lireLeRailPublished(project);
  // Un projet qui ne s'ouvre pas n'a pas de second : sa colonne dit pourquoi.
  if (project.refus !== undefined) return show();
  // Le pont du téléphone n'ouvre aucun terminal : il ne rend rien (ticket 1165).
  const terminaux = (await brigade.espace(project.nom)) ?? [];
  terminaux.forEach(recevoir);
  // Le chef a pu cliquer ailleurs pendant que l'espace s'ouvrait. Sinon, le terminal montré à
  // droite prend le clavier : le second, ou le shell où le chef l'avait laissé.
  if (courant !== project) return;
  aFocaliser = aDroite.get(project.nom) ?? terminaux.find(({ genre }) => genre === "second")?.id;
  show();
}

// Un terminal fermé : sa vue s'en va, et ce qu'il écrit encore n'est plus montré.
/** @param {number} id */
function oublier(id) {
  const fermee = vues.get(id);
  fermee?.xterm.dispose();
  fermee?.cadre.remove();
  vues.delete(id);
  fermes.add(id);
}

// Une sortie peut précéder l'annonce de son terminal : sa vue est alors créée ici. Celle qui arrive avant que la vue ait
// retrouvé les terminaux ouverts (ticket 3159) est déjà dans ce qu'ils avaient écrit : écrite aussi, elle le serait deux fois.
let terminauxRetrouves = false;
brigade.surSortie((id, donnees) => {
  if (terminauxRetrouves && !fermes.has(id)) vue(id).xterm.write(donnees);
});
// Le second publie une proposition, ou passe à autre chose : ce qui est sous son terminal suit (ticket 1520).
brigade.surProposition?.((project, proposition) => {
  propositionsDuSecond.recevoir(project, proposition);
  if (project === courant?.nom) show();
  if (project === courant?.nom) poserLeProjectAPreparer();
});
brigade.surEtat((terminal) => {
  if (terminal.genre === "shell" && terminal.arrete) {
    // Un shell qui sort ferme son onglet ; s'il était montré, le second reprend sa place à droite.
    oublier(terminal.id);
    if (aDroite.get(terminal.projet) === terminal.id) aDroite.delete(terminal.projet);
  } else {
    recevoir(terminal);
  }
  show();
});
// Ce que fait chaque cook d'un projet, à chaque lecture de son tableau (ticket 1846) : la fiche ouverte sur l'un de ses
// tickets suit son cook — reposée seulement si ce qu'elle en dit a changé.
brigade.surActivites((publiees) => {
  const avant = activitiesPubliees.get(publiees.projet);
  activitiesPubliees.set(publiees.projet, publiees);
  // Les cartes de Taken et de Pass disent ce que fait leur cook quand le rail ne le dit pas (ticket 4076) : elles suivent sa lecture.
  if (courant?.nom === publiees.projet && JSON.stringify(avant) !== JSON.stringify(publiees)) dessiner();
  if (ouverte === undefined || ouverte.projet.nom !== publiees.projet) return;
  const { ticket } = ouverte.carte;
  /** @param {import("./activity-du-cook.js").Publiees | undefined} lues */
  const dit = (lues) => {
    if (lues === undefined || "sans" in lues) return JSON.stringify(lues);
    const cook = cookDuTicket(lues, ticket);
    return JSON.stringify(cook === undefined ? null : [lues.lu, cook]);
  };
  if (dit(avant) !== dit(publiees)) renderCard();
});
// Les faits d'un projet : ils remplacent ceux d'avant, partout où ils se dessinent —
// sa pastille dans la barre, et son espace s'il est affiché — sa ligne de l'accueil vient par `surAccueil`.
// La bande d'alertes d'un projet : posée tout de suite si c'est celui qui est affiché.
brigade.surAlertes(({ projet: project, alertes: alerts, signal, manager: stateDuManager }) => {
  const breakerAvant = JSON.stringify(alertDuBreaker(project));
  bandes.set(project, alerts);
  const breaker = alertDuBreaker(project);
  signaux.set(project, signal);
  marquerSignal(project);
  // La pastille dit la même chose que la bande, en un mot.
  marquerPill(project);
  // Le disjoncteur a changé : sa ligne à côté de l'entrée TODO aussi.
  if (JSON.stringify(breaker) !== breakerAvant) poserLesCardsDuChef();
  const bascule = JSON.stringify(statesDuManager.get(project)) !== JSON.stringify(stateDuManager);
  statesDuManager.set(project, stateDuManager);
  if (courant?.nom !== project) return;
  poserAlerts(courant);
  // L'interrupteur a basculé : il le dit aussitôt, et la tête du rail aussi. Le disjoncteur a changé : sa ligne de TODO aussi.
  if (bascule || JSON.stringify(breaker) !== breakerAvant) {
    poserSwitch();
    poserRail(courant);
  }
});
// Le chef a cliqué la notification de l'urgence d'un projet : la fenêtre est déjà devant. Le projet
// s'ouvre — s'il ne l'est pas déjà —, la fiche d'un ticket ouverte par-dessus se referme, et la ligne
// d'urgence, en tête de la bande, est marquée choisie : son geste prend le clavier, prêt à trancher.
brigade.surUrgence(async (name) => {
  const project = configuration.projets.find((candidat) => candidat.nom === name);
  if (project === undefined) return;
  urgenceChoisie = name;
  if (courant?.nom !== name) await ouvrir(project);
  // Le chef a pu cliquer ailleurs pendant que l'espace s'ouvrait.
  if (courant?.nom !== name) return;
  if (ouverte !== undefined) closeCard();
  poserAlerts(courant);
  actionDeLUrgence?.focus();
});
// L'installation d'un projet a été relue : les stations que sa box déclare se reposent, si c'est le projet affiché.
brigade.surGuide(retenirDeclarees);
// Ce qui n'est pas encore sur le rail d'un projet : le sien se repose, s'il est affiché.
brigade.surAmont((vu) => {
  amonts.set(vu.projet, vu);
  if (courant?.nom === vu.projet && !rail.hidden && tenus.has(vu.projet)) poserRail(courant);
});
// Un essai a changé, ou la déclaration du projet : elle est relue (trial.ts).
brigade.surEssais?.((name) => {
  const project = configuration.projets.find((candidat) => candidat.nom === name);
  if (project !== undefined) void lireLesEssais(project);
});
// La pause de quota GitHub du compte (ticket 3482) : une ligne calme en tête de l'app, dite une fois pour tout le compte,
// d'après ce que les projets lus en portent. Son compte à rebours bouge chaque seconde ; à la reprise, elle tombe d'elle-même
// et le projet affiché se redessine sans sa ligne de pause.
const bannerDeLaPause = holdLaPause(element("pause-quota"), document, { maintenant: () => Date.now(), auRetour: () => (courant === undefined ? undefined : dessiner()) });
setInterval(() => bannerDeLaPause.battre(), 1000);
const suivreLaPause = () => bannerDeLaPause.suivre(pauseDesProjects([...tenus.values()].map((tenu) => ("tableau" in tenu ? tenu.tableau.pauseQuota : undefined)), Date.now()));
brigade.surFaits((recue) => {
  if (recue.demande !== factsRequest) return;
  enRead.delete(recue.projet);
  // Une box pas jointe n'efface pas le rail : la dernière lecture reste, marquée (poserRail).
  const muette = !("tableau" in recue) && "atteinte" in recue && !recue.atteinte;
  if (muette) muets.set(recue.projet, muets.get(recue.projet) ?? recue.a);
  else muets.delete(recue.projet);
  // Hors ligne, de même : le dernier rail lu reste, et aucun échec ne prend sa place (ticket 1818).
  const outsideLine = !("tableau" in recue) && "horsLigne" in recue && recue.horsLigne === true;
  if (outsideLine) outsideLines.set(recue.projet, outsideLines.get(recue.projet) ?? recue.a);
  else outsideLines.delete(recue.projet);
  const gardee = tenus.get(recue.projet);
  // Une lecture ratée en ligne — GitHub qui limite les appels, refuse, ne répond pas à temps, une box qui redémarre et
  // publie un tableau illisible — ne vide aucune colonne (ticket 2151) : le dernier rail lu reste, et une ligne dit depuis
  // quand il est périmé, la raison au survol. Sans rail lu avant, elle se dit comme avant.
  const ratee = !("tableau" in recue) && !muette && !outsideLine;
  if ("tableau" in recue) perimes.delete(recue.projet);
  else if (ratee && gardee !== undefined && "tableau" in gardee) perimes.set(recue.projet, { depuis: perimes.get(recue.projet)?.depuis ?? recue.a, raison: raisonDeLFailure(recue) });
  if (outsideLine && (gardee === undefined || !("tableau" in gardee))) tenus.delete(recue.projet);
  else if (!((muette || outsideLine || ratee) && gardee !== undefined && "tableau" in gardee)) tenus.set(recue.projet, recue);
  marquerPill(recue.projet);
  suivreLaPause();
  suivreLeJourney(recue.projet);
  // Le premier ticket du premier projet suit chaque lecture de son rail (ticket 3302).
  if ("tableau" in recue) storyDuFirstTicket.observer(recue.projet, recue.tableau.etapesDesTickets);
  poserLesCardsDuChef();
  // L'accueil affiché dit ce qui attend le chef du même compte que « TODO (N) » : une lecture qui le change le repose.
  if (courant === undefined && !ajoute && stationOuverte === undefined && todosDeLHome.has(recue.projet) && todosDeLHome.get(recue.projet) !== accountDuTodo(recue.projet)) poserHome();
  // Son récapitulatif liste ce qui attend dans TODO tel que TODO le montre : chaque lecture le repose (ticket 3581).
  else if (courant === undefined) poserLeRecapDeLHome();
  // Le détail ouvert d'une carte que cette lecture ne porte plus se ferme ; sinon, il n'est pas reposé : le chef y zoome, ou y tape.
  if (detailOuvert?.projet === recue.projet && laValidation(detailOuvert.projet, detailOuvert.ticket) === undefined) poserLeDetail();
  if (courant?.nom === recue.projet) {
    teamDuProject.lire(courant.nom);
    void lireLesEssais(courant);
    void lireLesRetenus(courant);
    dessiner();
    poserLeStoryDuFirstTicket();
    void poserOrdinaires(courant);
    poserStationsDuProject();
  }
});
// Ce que l'onglet de contenu affiché a rendu : une lecture ratée s'y lit comme
// dans le panneau, et n'en retire rien.
brigade.surContenu((recue) => {
  if (recue.demande !== requestOnglet) return;
  // La page des coûts lit `station` sur la box de chaque projet : chacune entre dans ses chiffres.
  if (ongletRequest === COUTS) {
    coutsLus.set(recue.projet, recue);
    return poserCost();
  }
  if (recue.projet !== courant?.nom || courant.sansStation === true) return;
  // Settings ne lit rien.
  if (!settingsMontres()) rendre(recue, luOnglet, readOnglet);
});
// Les clones relus : leur état remplace celui d'avant, dans Settings et sur la case « T ».
brigade.surCode((vu) => {
  codeVu = vu;
  poserCode();
});
// La mise à jour de l'app : son état remplace celui d'avant ; la ligne de tête le suit.
brigade.surMiseAJour((vu) => {
  updateVue = vu;
  bannerDeVersion.suivre(vu);
});
// Une version plus haute publiée pour ce poste (update/opinion.ts) : une ligne en tête de l'app, la version qui tourne
// et la dernière, et où en est la mise à jour de l'app installée (mise-a-jour/etat.ts) — jusqu'à ce que l'app tourne sur
// la dernière. Rien ne l'écarte.
const bannerDeVersion = holdBanner(element("nouvelle-version"), document, { telecharger: (url) => brigade.telechargerVersion(url), installer: () => brigade.installerMiseAJour() });
brigade.surAvisDeVersion((opinion) => bannerDeVersion.recevoir(opinion));
void Promise.resolve(brigade.avisDeVersion()).then((opinion) => bannerDeVersion.recevoir(opinion), () => undefined);
// Le statut de la station de cet ordinateur : lu au lancement, puis à chaque fois que le pont le relit. Une lecture qui
// échoue le laisse inconnu — la case le dit, sans erreur.
brigade.surStatutDeLaStation?.((status) => {
  statusDeLaStationVu = status;
  poserLesVersions();
  poserBlocStation();
});
void Promise.resolve(brigade.statutDeLaStation?.()).then(
  (status) => {
    statusDeLaStationVu = status;
    poserLesVersions();
    poserBlocStation();
  },
  () => undefined,
);
// La veille de la station de cet ordinateur (ticket 3642) : lue au lancement, puis à chaque changement ; la carte de la
// station suit. Une lecture qui échoue la laisse inconnue : la carte n'en dit rien.
brigade.surVeilleMachine?.((standby) => {
  standbyVue = standby;
  reposerLOngletStations();
});
void Promise.resolve(brigade.veilleMachine?.()).then(
  (standby) => {
    standbyVue = standby;
    reposerLOngletStations();
  },
  () => undefined,
);
// Les stations relues : ce que la page d'une station en montre suit — leurs lignes de l'accueil viennent par `surAccueil`.
brigade.surStations((vu) => {
  stationsVues = vu;
  poserLaRequestDeStationIci();
  poserLesVersions();
  poserBlocStation();
  if (stationOuverte !== undefined) poserPageDeStation();
  poserStationsDuProject();
  if (courant !== undefined) poserCooking(courant);
  // L'onglet Stations dit qui cuit le projet, et l'état de chaque station, d'après ce qu'elles publient (ticket 3195).
  if (courant !== undefined && ongletDe(courant) === STATIONS) poserRail(courant);
});
// L'accueil redit : ses lignes remplacent celles d'avant, s'il est affiché — et l'en-tête de la page d'une station.
brigade.surAccueil((vu) => {
  homeVu = vu;
  poserStationsDeLHome();
  if (courant !== undefined) poserCooking(courant);
  // Le plafond de chaque station, sur l'onglet Stations (ticket 1292), suit cette lecture.
  if (courant !== undefined && ongletDe(courant) === STATIONS) poserRail(courant);
  if (courant !== undefined || ajoute) return;
  if (stationOuverte === undefined) poserHome();
  else poserPageDeStation();
});
// Les projets des stations relus : leurs blocs remplacent ceux d'avant ; le parcours ouvert garde ses choix.
brigade.surProjetsDesStations((vu) => {
  projectsVus = vu;
  poserBlocStation();
  // Le refus levé se relit : s'il est encore publié, il revient. Une phrase sur un refus qui n'est plus publié s'en va.
  for (const [name, state] of remedesDesRefusal) {
    const refusal = vu.projets.find((project) => project.nom === name)?.refus ?? null;
    if (state.etape === "leve" || (state.etape === "dit" && refusal === null)) remedesDesRefusal.delete(name);
  }
  poserProjects();
  poserStationsDuProject();
  // La station de ce poste se connaît par cette lecture : la page d'une station ouverte sait si elle est la sienne.
  if (stationOuverte !== undefined && courant === undefined && !ajoute) poserPageDeStation();
  // L'accès au dépôt et le refus de la station : la ligne d'alerte de Rail les dit (ticket 1185). Apparue ou partie,
  // le rail se repose : elle n'y est que quand elle dit quelque chose.
  if (courant !== undefined) {
    const avant = alertDeKitchen.hidden;
    poserCooking(courant);
    reposerLEtiquetteDeStation(courant);
    if (avant !== alertDeKitchen.hidden) poserRail(courant);
    // Où cuit le projet, son déménagement, la station de cet ordinateur se lisent par cette lecture : l'onglet Stations les
    // montre (tickets 2489, 3195).
    else if (ongletDe(courant) === STATIONS) poserRail(courant);
  }
});
// La colonne des terminaux change de taille avec la fenêtre : le terminal montré suit.
new ResizeObserver(() => {
  if (!fil.hidden) montreADroite()?.ajuste.fit();
}).observe(fil);

// Ranger les projets : une case de la barre se glisse, et se lâche ailleurs dans la barre — elle
// prend la place de la dernière case survolée, et les autres se décalent. Pendant qu'elle glisse,
// elle s'efface à demi, et un trait dit où elle atterrira : avant la case survolée si elle monte,
// après si elle descend — rien sur la sienne. Lâchée, c'est ce trait qui vaut. Le glisser est
// celui du navigateur : il ne part qu'au-delà de son seuil, et après lui aucun clic n'arrive — une
// case lâchée sur elle-même s'ouvre donc, comme sous un clic. Seule une case de la barre se range
// ainsi : ce qu'elle porte a son propre type, qu'aucun fichier glissé d'ailleurs n'a. Le nouvel
// ordre est celui du fichier des projets (config.ts) : il revient par `surConfiguration`.
const GLISSE = "application/x-brigade-projet";
// La case glissée, et la place où elle atterrira — aucune tant que le trait n'est pas posé.
/** @type {{ nom: string, rang: number | undefined } | undefined} */
let glisse;
/** @param {DragEvent} event */
const glisseIci = (event) => glisse !== undefined && event.dataTransfer?.types.includes(GLISSE) === true;

/** @param {HTMLElement} entree @param {Project} project */
function rendreRangeable(entree, project) {
  entree.draggable = true;
  entree.addEventListener("dragstart", (event) => {
    glisse = { nom: project.nom, rang: undefined };
    event.dataTransfer?.setData(GLISSE, project.nom);
    if (event.dataTransfer) event.dataTransfer.effectAllowed = "move";
    entree.classList.toggle("glissee", true);
  });
  entree.addEventListener("dragover", (event) => {
    if (glisse === undefined || !glisseIci(event)) return;
    const de = configuration.projets.findIndex(({ nom: name }) => name === glisse?.nom);
    const vers = configuration.projets.indexOf(project);
    glisse.rang = de === vers ? undefined : vers;
    marquerRepository(glisse.rang === undefined ? undefined : entree, de > vers ? "avant" : "apres");
  });
  // Lâchée sur elle-même : le clic que le glisser a pris.
  entree.addEventListener("drop", (event) => {
    if (!glisseIci(event) || glisse?.nom !== project.nom || glisse.rang !== undefined) return;
    event.preventDefault();
    event.stopPropagation();
    finirGlisse();
    void ouvrir(project);
  });
  entree.addEventListener("dragend", finirGlisse);
}

// Le trait qui dit où la case glissée atterrira : sur une seule case à la fois — aucune, quand
// elle survole la sienne ou qu'elle a quitté la barre.
/** @param {HTMLElement | undefined} entree @param {"avant" | "apres"} ou */
function marquerRepository(entree, ou) {
  for (const autre of bar.children) {
    autre.classList.toggle("depot-avant", autre === entree && ou === "avant");
    autre.classList.toggle("depot-apres", autre === entree && ou === "apres");
  }
}

function finirGlisse() {
  glisse = undefined;
  marquerRepository(undefined, "avant");
  for (const entree of bar.children) entree.classList.toggle("glissee", false);
}

// Toute la barre reçoit la case — entre deux cases aussi : c'est le trait posé qui vaut.
bar.addEventListener("dragover", (event) => {
  if (!glisseIci(event) || event.dataTransfer === null) return;
  event.preventDefault();
  event.dataTransfer.dropEffect = "move";
});
bar.addEventListener("drop", (event) => {
  if (glisse === undefined || !glisseIci(event)) return;
  event.preventDefault();
  const { nom: name, rang } = glisse;
  finirGlisse();
  if (rang !== undefined) void ranger(name, rang);
});
// Hors de la barre, le trait s'efface : lâchée là, la case reprend sa place.
bar.addEventListener("dragleave", (event) => {
  if (glisse === undefined || bar.contains(/** @type {Node | null} */ (event.relatedTarget))) return;
  glisse.rang = undefined;
  marquerRepository(undefined, "avant");
});

// Le projet rangé : le process principal l'écrit dans le fichier des projets, et le nouvel ordre
// revient par `surConfiguration`. Refusé, la barre garde l'ordre du fichier, et la raison se lit
// par-dessus l'écran.
/** @param {string} name @param {number} rang */
async function ranger(name, rang) {
  const refusal = await brigade.ranger(name, rang);
  if (refusal !== undefined) poserOpinion({ titre: `“${name}” was not moved in the bar`, lignes: [refusal] });
}

// Ce que le fichier des projets donne à voir : la barre, puis l'écran d'avant
// s'il existe encore — sinon « Tous les projets », ou l'ajout tant qu'il n'y a aucun projet.
function afficher() {
  relecture.hidden = configuration.nonRelu === undefined;
  // Relu sans faute, rien à dire : la ligne cachée ne garde pas « → undefined » (ticket 4309).
  relecture.textContent = configuration.nonRelu === undefined ? "" : [
    `${configuration.chemin} changed, and could not be re-read:`,
    `  → ${configuration.nonRelu}`,
    "Your projects are the ones from before, and nothing is closed. The app re-reads it as soon as it changes.",
  ].join("\n");
  // La barre est reposée : les faits d'avant répondaient à une autre liste, ils sont relus.
  // Un rail déjà lu ne se vide jamais (ticket 3337) : sa dernière lecture reste à l'écran pendant la relecture, seuls les
  // projets qui ont quitté la liste perdent la leur. Sans lecture avant, « first read in progress » ne vaut qu'une fois.
  for (const name of [...tenus.keys()]) if (!configuration.projets.some((project) => project.nom === name)) tenus.delete(name);
  muets.clear();
  pastilles.clear();
  signalees.clear();
  bar.replaceChildren(
    ...configuration.projets.map((project) => {
      const entree = icone("", project.nom, () => void ouvrir(project));
      // Son sigle, en grand, sur une ligne (sigle.ts) : le survol de la case dit son nom en entier.
      const etiquette = document.createElement("span");
      etiquette.className = "sigle-de-case";
      etiquette.textContent = project.etiquette;
      entree.append(etiquette);
      rendreRangeable(entree, project);
      entree.classList.toggle("refuse", project.refus !== undefined);
      // Sa couleur d'onglet : la case la porte, qu'elle soit choisie ou non.
      const onglet = project.couleurs?.onglet;
      entree.classList.toggle("teinte", onglet !== undefined);
      if (onglet !== undefined) entree.style.setProperty("--teinte", onglet);
      // Un projet qui ne se lit nulle part n'a pas de pastille : rien n'est lu de lui.
      if (seLit(project)) {
        const posee = marqueDePill(document, undefined, { coin: true });
        entree.append(posee);
        pastilles.set(project.nom, posee);
        marquerPill(project.nom);
        marquerSignal(project.nom);
      }
      return entree;
    }),
  );
  lireLesFacts(false);
  if (configuration.refus !== undefined) {
    // Ce fichier-là ne se répare pas d'ici : l'app n'écrit pas dans ce qu'elle n'a pas compris.
    courant = undefined;
    ajoute = false;
    marquer();
    message.textContent = [
      "The app could not read your projects file, and does not touch it.",
      "",
      configuration.chemin,
      `  → ${configuration.refus}`,
      "",
      "Its shape — nothing in it is to be copied as is, each value between < > is to be replaced:",
      "",
      exemple,
      "",
      "The app re-reads this file as soon as it changes: fix it, and it follows.",
    ].join("\n");
    return show();
  }
  const entree = icone("", "All projects", ouvrirTous);
  entree.id = "entree-tous";
  entree.append(logoDeBrigade());
  const pied = icone("+", AJOUTER_UN_PROJECT, ouvrirAddition);
  pied.id = "entree-ajout";
  bar.prepend(entree);
  bar.append(pied);
  // Rejouer la visite (ticket 4087), sous « + » : elle repart de sa première étape, en lecture seule et sans clone. Le
  // téléphone n'a pas de visite.
  if (phone === undefined) {
    const tour = icone("?", REPLAY, commencerLaVisit);
    tour.id = "entree-visite";
    bar.append(tour);
  }
  // La case du logo est neuve : ce que la dernière lecture des clones en dit y est reposé.
  poserCode();

  const meme = configuration.projets.find((project) => project.nom === courant?.nom);
  // Le projet ouvert du premier lancement, arrivé dans le fichier après sa réponse.
  const attendu = firstAOuvrir === undefined ? undefined : projectDe(firstAOuvrir);
  if (attendu !== undefined) firstAOuvrir = undefined;
  if (attendu !== undefined) void ouvrir(attendu);
  else if (meme !== undefined) void ouvrir(meme);
  else if (stationOuverte !== undefined && !ajoute) ouvrirStation(stationOuverte);
  else if (pageDeLApp === COUTS && !ajoute) ouvrirCouts();
  else if (pageDeLApp === RESUMES && !ajoute) ouvrirResumes();
  // Sur un ordinateur neuf, sans projet : ses stations et leurs projets (first-launch.js). Sur le téléphone,
  // aucun projet ne s'ajoute d'un dossier : sans projet, l'app reste sur « Tous les projets ».
  else if (ajoute || (configuration.projets.length === 0 && phone === undefined && !avecFirst())) ouvrirAddition();
  else if (avecFirst()) ouvrirFirst();
  // L'app s'ouvre sur « Tous les projets », en tête de la barre.
  else ouvrirTous();
  show();
}

const demarrage = await brigade.demarrage();
// Ce que les seconds proposaient déjà quand la vue s'est ouverte ; ce qui est arrivé depuis, par `surProposition`, est plus récent.
propositionsDuSecond.recevoirToutes((await brigade.propositionsDuSecond?.()) ?? {});
WORKSTATION = demarrage.poste ?? WORKSTATION;
const exemple = demarrage.exemple;
PALETTE = demarrage.palette;
ONGLETS = demarrage.onglets;
RUBRIQUES = demarrage.rubriques;
ALLUMAGE = demarrage.gestes.allumage;
KITCHEN_ACTIONS = demarrage.gestes.cuisine;
CONFIRMES = demarrage.gestes.confirmes;
ACTIONS_D_WAIT = demarrage.gestes.attente ?? [];
DIRECTS = demarrage.gestes.directs;
BANNIERE = demarrage.banniere;
// Une lecture arrivée pendant le démarrage est plus récente que celle qu'il rend.
codeVu ??= demarrage.code;
stationsVues ??= demarrage.stations;
projectsVus ??= demarrage.projetsDesStations;
homeVu ??= demarrage.accueil;
updateVue ??= demarrage.miseAJour;
bannerDeVersion.suivre(updateVue);
PROJECT_CALIBRATION = demarrage.calibrage;
let configuration = demarrage.configuration;
if (brigade.iconeDeFond !== undefined) {
  void lireLIconeDeBackground();
  setInterval(() => void lireLIconeDeBackground(), 60_000);
}
// Le téléphone (l'app Android) : ce que le pont en garde — rien sur le desktop. Pas encore connecté à GitHub (le ticket
// 2500), l'app s'ouvre sur l'écran qui l'y connecte, et le reste de l'app est caché derrière ; connecté, elle passe à
// « Tous les projets », où une ligne dit sous quel compte (connection-github.js).
const phone = demarrage.telephone;
phoneVu = phone;
brigade.surTelephone?.((vu) => {
  phoneVu = vu;
  if (courant === undefined && !ajoute && stationOuverte === undefined) poserHome();
});
// Le chef touche la notification d'une carte de TODO (le ticket 2747) : le projet s'ouvre, puis la fiche de la carte.
brigade.surOuvrirCarte?.((name, ticket) => void ouvrirTicketDepuisLesCouts(name, ticket));
// GitHub refuse la connexion de ce téléphone : elle est effacée, et l'app se rouvre sur la connexion à GitHub.
async function oublierLePhone() {
  await brigade.oublierLeTelephone?.();
  location.reload();
}
const connectionDuPhone = element("connexion-github");
const cadreDeLApp = element("cadre");
if (phone !== undefined && phone.github === undefined) {
  cadreDeLApp.hidden = true;
  connectionDuPhone.hidden = false;
  holdConnectionGitHub(connectionDuPhone, document, {
    pont: brigade,
    apres: (account) => {
      phoneVu = { github: { compte: account } };
      connectionDuPhone.className = "fait";
      connectionDuPhone.replaceChildren(poserConnecte(document, account));
      cadreDeLApp.hidden = false;
      ouvrirTous();
      show();
    },
  });
} else if (phone !== undefined && phone.github !== undefined) {
  connectionDuPhone.hidden = false;
  connectionDuPhone.className = "fait";
  connectionDuPhone.replaceChildren(poserConnecte(document, phone.github.compte));
}
// Sur un Mac neuf, avant l'avis de macOS (ticket 4081) : l'écran qui annonce que Brigade tourne en arrière-plan, l'app
// cachée derrière jusqu'à son bouton.
await holdOpinionDeBackground(element("avis-de-fond"), cadreDeLApp, document, brigade);
// Le terminal mesure ses cases à l'ouverture : sa police, embarquée, est chargée avant qu'aucun
// ne s'ouvre. Si elle ne se charge pas, l'app s'ouvre quand même, sur la police de repli.
await Promise.all(["13px", "bold 13px"].map((corps) => document.fonts.load(`${corps} ${jeton("--police-mono")}`))).catch(() => undefined);
await retrouverLesTerminaux();
reprendreLScreen();
afficher();
// Posée une fois la première liste rendue : ce qui change ensuite la remplace.
brigade.surConfiguration((recue, partis) => {
  // Un projet qui a quitté la liste, ou changé de dossier, a perdu ses terminaux.
  for (const id of partis) {
    oublier(id);
    for (const [project, shell] of aDroite) if (shell === id) aDroite.delete(project);
  }
  configuration = recue;
  // Un projet ajouté ou retiré a sa ligne parmi les projets servis, ou ne l'a plus.
  if (servedOnes.etat !== undefined) poserLesProjectsServedIci();
  afficher();
});
