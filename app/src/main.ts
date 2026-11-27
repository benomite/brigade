// L'app : une fenêtre, et le process qui tient les terminaux, la veille des
// box et le suivi du fichier des projets.
import { appendFile, readFile } from "node:fs/promises";
import { homedir, hostname, userInfo } from "node:os";
import { dirname, join } from "node:path";
import { pathToFileURL } from "node:url";
import { menuOfTheApp } from "./help-community.ts";
import { app, BrowserWindow, dialog, ipcMain, Menu, nativeImage, Notification, protocol, shell, type MenuItemConstructorOptions } from "electron";
import { setTheIconOfDock } from "./icon-of-dock.ts";
import { holdMenuBar, type Entry } from "./menu-bar.ts";
import { createTheIcon, ICON_OF_THE_BAR } from "./tray/icon.ts";
import { lineOfBackground } from "./tray/line.ts";
import { stateOfTheStation } from "./tray-background/tray-background.ts";
import { run, keepTheIcon, stationOfBackgroundInstalled } from "./tray-background/system.ts";
import { holdHome, type Home } from "./home.ts";
import { holdBands } from "./alerts.ts";
import { dropTheVue } from "./second/vue-of-project.ts";
import { readFire } from "./fire.ts";
import { COMMAND as COMMAND_UPSTREAM, holdUpstream } from "./upstream.ts";
import { putAside } from "./awaiting.ts";
import { forTheBar } from "./bar.ts";
import { launchThe, openStandby, type Read } from "./box.ts";
import { situationOf } from "./story.ts";
import { LinksRead } from "./links-read.ts";
import { comment, askAtSecond, noteOfTheQuestion } from "./discussion.ts";
import { noteOfTheHandover, passAtSecond } from "./handover-second.ts";
import { discussionOfGitHub, storyOfGitHub } from "./card-github.ts";
import { pathConfiguration, EXAMPLE, type Project } from "./config.ts";
import { holdTheTrials } from "./trial.ts";
import { COMMAND_OF_LOG, openTheReport, versionAimed } from "./vue/report/opening.ts";
import { readTheSettings, proposeTheSetting } from "./settings-of-project.ts";
import { writeTheHumans, readTheHumans } from "./humans-of-project.ts";
import { readTheAgents } from "./team-of-the-box.ts";
import { holdLastLooks, sinceYouLastLooked } from "./since-last-looked.ts";
import { writeInTheProject, readInTheProject } from "./vue/card-project/card-project-folder.ts";
import { writeTheStations, readTheStations } from "./stations-contributors.ts";
import { choice, whole, PALETTE } from "./colors.ts";
import { blockOfOrdinary } from "./ordinary.ts";
import { ACTIONS_OF_WAIT } from "./wait.ts";
import { BANNER, COMMAND, holdFacts, type Drawable } from "./facts.ts";
import { holdTheColumns } from "./columns-emptied.ts";
import { clientGitHub, byFetch } from "./board/client.ts";
import { withWhatAwaitingTheChef } from "./board/wait-of-chef.ts";
import { playTheWait } from "./vue/wait/wait-github.ts";
import { readConditional, type MemoryOfReads } from "./board/rail-github.ts";
import { shareOfCardsAssigned, holdTheLogin } from "./vue/cards-assigned/cards-assigned.ts";
import { tokenOfGh } from "./board/token-gh.ts";
import { keptReadsInFile } from "./board/kept-reads.ts";
import { readingUnderBudget, holdTheBudgetGitHub } from "./budget-github.ts";
import { holdTheQuotaGitHub, withTheQuota } from "./quota-github.ts";
import { ticketOfTheBiggest } from "./spenders-of-token.ts";
import { REPOSITORY_OF_THE_VISIT } from "./visit.ts";
import { FRESHNESS_MAX_OF_A_READ_MS } from "./vue/served/freshness.ts";
import { activitiesPublished, readTheBoardOfRepository, type ReadOfBoardOfRepository } from "./board/read.ts";
import { readTheKitchenVisited } from "./visit.ts";
import { pageOfFacts } from "./read-only.ts";
import { openStandbyOfBoard, holdReadsOfBoard } from "./board/rail.ts";
import { playTheRefusal } from "./actions-refusal.ts";
import { commentTheIssue, removeTheLabel, WITHOUT_DONE, onGithub } from "./actions-github.ts";
import { requestOf, requestOfTheAlert, requestOnTheTicket, noteOfTheRequest } from "./request.ts";
import { actionsOfCard } from "./card-actions.ts";
import { launchTheTriage, putOnTheRail, proposeTheDeparture } from "./departure-of-project.ts";
import { create as createTheFirstTicket, draft as draftTheFirstTicket } from "./first-ticket.ts";
import { changeThePriority, clientOfThePriority, sendByFetch, holdPrioritiesWritten } from "./priority.ts";
import { changeTheCap, readTheCaps } from "./caps-duration.ts";
import { changeTheSetting, changeTheVerifications, readTheCloser } from "./closer-health.ts";
import { changeTheKnowledge, readTheKnowledgeOfProject } from "./vue/know-how/know-how-github.ts";
import { answerOnGithub } from "./board-actions/answer-github.ts";
import { validateOnGithub } from "./vue/validation-design/validation-design-github.ts";
import { readTheAutonomyOfRepository, holdTheAutonomy } from "./vue/autonomy/autonomy-github.ts";
import { repositoryOfTheOrigin, readClone } from "./addition.ts";
import { readTheAccountGitHub, holdConnectionGitHub, signInToGitHub } from "./connection-github.ts";
import { pathOf, locationsOf, readPathOfShell } from "./locations.ts";
import { searchOneUpdate, workstationOf, type Opinion as OpinionOfVersion } from "./update/opinion.ts";
import { holdUpdate } from "./update/state.ts";
import { apkLink, RELEASES_URL } from "./update/android.ts";
import { fluxOf, formatOf } from "./update/flux.ts";
import { installerOfWorkstation } from "./update/installation.ts";
import { see as seeManager } from "./manager.ts";
import { machineChosen, machinesOf } from "./machines.ts";
import { commandsOf, TABS, projectsRead, HEADINGS } from "./tabs.ts";
import { playOutage } from "./outages/actions.ts";
import { gistLocal, holdLogin } from "./outages/login.ts";
import { moverOfRuntime } from "./projects/move.ts";
import { repositoriesOfChef, readOneRepository } from "./projects/github.ts";
import { writeSettingsOfTheStation, readSettingsOfTheStation as readTheSettingsOfStation, type Change } from "./settings-of-the-station.ts";
import { EFFORTS, MODELS, servedElsewhere, holdProjects, type FoldersOfTheStation, type SeenOfProjects } from "./projects/projects.ts";
import { memoryInFile, holdNotifications } from "./notification.ts";
import { holdKitchensHere } from "./workstation/kitchen-here.ts";
import { isOneMac, nameOfWorkstation, persistentOn, shellOfWorkstation } from "./platform.ts";
import { roleOf } from "./workstation/role.ts";
import { whatProvidesThisComputer } from "./stations/provides.ts";
import { holdTheStationOfBackground } from "./station-background/attached.ts";
import { HOST, launchTheBackground } from "./station-background/background.ts";
import { registerTheStationOfBackground } from "./station-background/registration.ts";
import { openPty } from "./pty.ts";
import { claudeOf, connectionOfTheSession, openOfAStation } from "./first-launch.ts";
import { openTheLocalCopy, sessionOfClaude } from "./local-copy.ts";
import { probesOfTheRuntime, serveHere } from "./serve-here.ts";
import { opinionOfMacOS, passTheFirstLaunch, holdTheOpinionOfBackground } from "./first-launch/index.ts";
import { readQuestion, reply as answerQuestion, titleOf, type Read as QuestionRead } from "./question.ts";
import { readCapture } from "./captures.ts";
import { relaunchOf, holdPassage } from "./catch-up.ts";
import { holdAnswered } from "./answered.ts";
import { APP, holdDelays } from "./delay.ts";
import { openTurns } from "./input.ts";
import { holdRemovals } from "./removal.ts";
import { FOLDER as FOLDER_OF_SETUP, setTheSetup } from "./setup/setup.ts";
import { installerTheStation } from "./workstation/installer.ts";
import { memoriesInFile } from "./memories.ts";
import { githubOfStations } from "./stations/github.ts";
import { holdStations, type SeenOfStations } from "./stations/stations.ts";
import { versionsInFile } from "./stations/versions.ts";
import { followConfiguration } from "./tracking.ts";
import { gistOfPreferences } from "./settings-personal/gist.ts";
import { settingsPersonal } from "./settings-personal/settings-personal.ts";
import { holdPreferences } from "./settings-personal/sync.ts";
import { openTerminals } from "./terminals.ts";

// Où sont le runtime de la station, son `node` et le clone de l'app : dans le dépôt, ou dans le
// paquet de l'app installée (locations.ts). Installée, l'app prend le PATH du shell de
// connexion du chef avant de rien lancer : ouverte depuis le Finder, elle n'a que celui du système.
const locations = locationsOf({ ressources: process.resourcesPath, src: import.meta.dirname, env: process.env });
// Ce qui dépend de la plateforme de ce poste — son nom à l'écran, son shell, ses sessions — vient
// d'un seul module (platform.ts) : le reste de l'app est le même code sur un Mac et sous Windows.
const platform = process.platform;
const shellHere = shellOfWorkstation(platform, process.env);
const path = pathOf({ emplacements: locations, env: process.env, maison: homedir(), plateforme: platform, duShell: () => (platform === "win32" ? undefined : readPathOfShell(shellHere.commande, 10_000)) });
if (path !== undefined) process.env.PATH = path;

// Ce qu'est l'app sur cette machine (workstation/role.ts) : une station sur un ordinateur, le runtime
// à côté d'elle dans son clone, ou dans son paquet une fois installée ; un poste sur un
// téléphone — il pilote, rien n'y cuit, ni sa station ni celles que ses projets lui confient.
const role = roleOf({ plateforme: platform, runtime: locations.runtime, env: process.env });
// Le répertoire de la station de cet ordinateur : `station/`, à côté du fichier des projets.
const rootOfTheStation = process.env.BRIGADE_STATION_DIR || join(dirname(pathConfiguration()), "station");
// L'icône de la barre des menus ne se pose qu'une fois l'app prête : avant, Electron n'en crée pas
// (`poserLaBarreDeMenus`, plus bas). Déclaré ici : ce qui suit la redit dès qu'il change.
let barReady = false;
// Où cuit chaque projet (workstation/kitchen-here.ts) : un projet que la station de cet ordinateur sert
// se lit ici, par son geste ; les autres sont lus du tableau de leur cuisine sur GitHub.
// C'est relu à chaque lecture : une cuisine qui change de place est lue à la nouvelle dès la
// suivante, et la vue le sait aussitôt.
const kitchens = holdKitchensHere({
  locale: role.role === "station" ? { node: locations.node, runtime: locations.runtime, racine: rootOfTheStation, env: process.env } : undefined,
  surChangement: () => {
    tell("configuration", shownEntry(), []);
    tellTheHome(home.relire());
    setTheMenuBar();
  },
});
// Un projet dont quelque chose se lit : une station le sert, sur cet ordinateur ou ailleurs.
const readable = ({ nom: name }: Project) => kitchens.ici(name) || servedElsewhere(lastSeenOfProjects, name);

let window: BrowserWindow | undefined;
const tell = (channel: string, ...facts: unknown[]) => {
  if (window !== undefined && !window.isDestroyed()) window.webContents.send(channel, ...facts);
};

// L'app installée se tient à jour sur les versions publiées (mise-a-jour/) : elle regarde au
// lancement puis tous les quarts d'heure (#2431), télécharge la nouvelle, et l'installe au geste du
// chef ou à son lancement suivant. Lancée depuis le dépôt, elle ne regarde rien : son clone la met à jour.
// Ce qu'elle télécharge vit à côté du fichier des projets, sous `mise-a-jour/`. Le même chemin sur
// un Mac et sous Windows : seuls l'installeur publié qu'elle lit et ce qui le joue sont du poste.
// Vrai quand l'app se ferme pour s'installer : la station et ses cooks ne s'arrêtent pas avec elle (update-background/survival.ts, #3632).
let quitForUpdate = false;
const folderOfUpdate = join(dirname(pathConfiguration()), "mise-a-jour");
const installer = installerOfWorkstation({ plateforme: platform, ressources: process.resourcesPath, executable: process.execPath, pid: process.pid, dossier: folderOfUpdate });
// Un quart d'heure, et non plus six heures (#2431) : une version publiée le matin se voit dans la matinée. Les deux
// vérifications ensemble lisent l'API de GitHub au plus trois fois par quart d'heure, loin de ses 60 lectures par heure.
const CADENCE_OF_VERSIONS_MS = 15 * 60 * 1000;
const update = holdUpdate({
  version: app.getVersion(),
  cadenceMs: CADENCE_OF_VERSIONS_MS,
  inactive: locations.facon === "installee" ? undefined : "launched from the repository, it updates through its clone",
  flux: fluxOf(process.env.BRIGADE_APP_MISE_A_JOUR_SOURCE, formatOf(platform)),
  dossier: folderOfUpdate,
  installable: installer.installable,
  installer: installer.installer,
  quitter: () => {
    quitForUpdate = true;
    app.quit();
  },
  surEtat: (state) => tell("miseAJour", state),
});
// Une version téléchargée lors d'une session précédente s'installe avant que rien ne démarre : sa
// station n'est pas lancée, sa fenêtre ne s'ouvre pas — l'app se ferme, l'installeur la rouvre sur
// la nouvelle version.
const installedAtLaunch = update.auLancement();
// La ligne d'une version plus haute (#1528, #2431, update/opinion.ts) : sur l'app installée d'un Mac ou d'un PC, la
// plus haute version publiée au-dessus de celle qui tourne, avec le lien direct de son paquet — relue au lancement, puis
// tous les quarts d'heure. Rien ne l'écarte, et une lecture qui ne trouve rien (GitHub muet) ne la retire pas : la
// version qui tourne ne change pas tant que l'app tourne, une version plus haute connue le reste. Lancée depuis le
// dépôt, l'app ne regarde rien : son clone la met à jour.
const workstationOfTheOpinion = locations.facon === "installee" ? workstationOf(platform) : undefined;
let opinionOfVersion: Promise<OpinionOfVersion | undefined> = Promise.resolve(undefined);
const checkTheVersion = () => {
  if (workstationOfTheOpinion === undefined) return;
  const previous = opinionOfVersion;
  opinionOfVersion = searchOneUpdate({ version: app.getVersion(), poste: workstationOfTheOpinion }).then(async (opinion) => opinion ?? (await previous));
  void opinionOfVersion.then((opinion) => tell("avisDeVersion", opinion));
};
let verificationsOfVersion: ReturnType<typeof setInterval> | undefined;

// Chaque second dit ses tours à l'app, par ses crochets, dans un fichier à lui (input.ts) :
// c'est d'après eux qu'un geste direct part, ou dit qu'il ne peut pas.
// Les shells persistants ouverts sont retenus à côté du fichier des projets (memories.ts) :
// rouverte, l'app les rattache à leur session.
const turns = openTurns();
const terminals = openTerminals({
  ouvrirPty: openPty,
  tours: turns.de,
  // Le second part par le `claude` que le PATH donne.
  planDuSecond: (folder, args) => ({ state: "ready", launch: { command: process.env.BRIGADE_CLAUDE_BIN || "claude", args: [...args], verbatim: false, folder: folder, env: {} }, missing: [], tools: [] }),
  souvenirs: memoriesInFile(join(dirname(pathConfiguration()), "shells.json")),
  node: locations.node,
  // La session qui prépare un dépôt : ses instructions, posées à côté du fichier des projets (setup/setup.ts, #4632).
  preparation: () => setTheSetup(join(dirname(pathConfiguration()), FOLDER_OF_SETUP), { node: locations.node, runtime: locations.runtime }),
  // La file que le second lit à son ouverture vient de GitHub seul, par le `gh` du poste (second/file.ts, #2460).
  gh: process.env.BRIGADE_GH_BIN || "gh",
  // La même doublure que le runtime : jamais posée hors des essais.
  claude: process.env.BRIGADE_CLAUDE_BIN || "claude",
  shell: shellHere.commande,
  argsDuShell: shellHere.args,
  persistantIci: persistentOn(platform),
  surSortie: (id, data) => tell("sortie", id, data),
  surEtat: (terminal) => tell("etat", terminal),
});

// La vue du rail d'un projet — ses colonnes, ses cartes, sa file TODO, l'état de sa cuisine, sa bande — se lit des
// issues, des labels et des PR de son dépôt sur GitHub (#1694, #2061, board/read.ts), avec le jeton du `gh` de ce
// poste : ni tailnet, ni box jointe, ni tableau de la cuisine — aucun runtime n'en écrit plus. Les veilles du rail, des
// faits et de l'amont lisent toutes cette même lecture, une à la fois par projet, reprise par chacune tant qu'elle a
// moins d'une minute. Le dépôt d'un projet est son `depot`, ou celui de l'`origin` de son dossier. GitHub se lit
// pour tout projet, quelle que soit la station qui le sert — que l'app la connaisse ou non (#2076) ; un projet qui ne
// se lit pas dit pourquoi.
const callGitHub = clientGitHub({ jeton: tokenOfGh({ gh: process.env.BRIGADE_GH_BIN || "gh", delaiMs: 10_000 }), envoyer: byFetch() });
const repositoryOfProject = async (project: Project) => project.depot ?? (await repositoryOfTheOrigin(process.env.BRIGADE_GIT_BIN || "git", project.dossier)) ?? project.nom;
// Le kanban — chaque issue dans la colonne que ses labels disent (board/kitchen-board.ts) — et TODO — ce qui attend le
// chef, la lecture même que le second relaie à son ouverture (board/wait-of-chef.ts, #2460) : relus à chaque lecture (au
// plus une fois par minute, ou aussitôt après un geste, qui oublie la lecture), par des lectures conditionnelles dont un
// 304 ne coûte rien.
const memoriesOfRail = new Map<string, MemoryOfReads>();
const memoryOfRail = (repository: string): MemoryOfReads => memoriesOfRail.get(repository) ?? memoriesOfRail.set(repository, new Map()).get(repository)!;
// Le compte GitHub de cet ordinateur, pour les cartes de TODO qui l'attendent (#2761, vue/cards-assigned/) : celles
// qui attendent un autre humain se replient sous « Awaiting others » (#2985).
const accountConnected = holdTheLogin(() => readTheAccountGitHub({ gh: process.env.BRIGADE_GH_BIN || "gh", env: process.env }));
// Ces lectures restent loin du budget horaire du jeton du chef (budget-github.ts, #3007) : les relectures d'un rail inchangé sont des 304 que GitHub ne compte pas,
// et toutes s'arrêtent, chaque projet gardant son dernier rail, quand GitHub dit le budget
// presque épuisé ou refuse pour dépassement — jusqu'à l'heure où il se remplit.
const budgetGitHub = holdTheBudgetGitHub();
const callUnderBudget = budgetGitHub.appeler(callGitHub);
// Un ticket pour le plus gros dépensier du jeton, s'il a pris plus que sa part (#4620) : un par pause, sans réessai si GitHub refuse.
let pauseSignalled = 0;
const signalTheBiggest = (report: Parameters<typeof ticketOfTheBiggest>[0], until: number): void => {
  if (until === pauseSignalled) return;
  pauseSignalled = until;
  const ticket = ticketOfTheBiggest(report);
  if (ticket !== null) void clientOfLabels.ecrire("POST", `/repos/${REPOSITORY_OF_THE_VISIT}/issues`, { title: ticket.title, body: ticket.body, labels: ["product"] }).catch(() => undefined);
};
// Le quota du compte, pour la jauge de l'onglet Stations (#4645) : lu par `/rate_limit`, hors du budget — GitHub ne le compte
// pas, et la pause ne le retient pas.
const quotaOfAccount = holdTheQuotaGitHub({ appeler: callGitHub });
const readTheBoard = async (project: Project): Promise<ReadOfBoardOfRepository> => {
  const repository = await repositoryOfProject(project);
  const [readOne, quota] = await Promise.all([readTheBoardUnderBudget(project, repository), quotaOfAccount.lire()]);
  return withTheQuota(readOne, quota);
};
const readTheBoardUnderBudget = (project: Project, repository: string): Promise<ReadOfBoardOfRepository> => {
  return readingUnderBudget({
    signaler: signalTheBiggest,
    budget: budgetGitHub,
    depot: repository,
    dernier: () => boards.dernier(project.nom),
    lire: async () => {
      const readOne = await readTheBoardOfRepository({ depot: repository, appeler: callUnderBudget, memoire: memoryOfRail(repository) });
      const call = readConditional(callUnderBudget, memoryOfRail(repository));
      return withWhatAwaitingTheChef(readOne, call, shareOfCardsAssigned({ appeler: call, depot: repository, login: accountConnected.login }));
    },
  });
};
const boards = holdReadsOfBoard<Project>({ lire: readTheBoard, fraicheurMs: FRESHNESS_MAX_OF_A_READ_MS, garde: keptReadsInFile(join(dirname(pathConfiguration()), "rails-lus.json")) });

// Seul ce qui est affiché est lu — un projet, ou chacun dans « Tous les projets » : toutes
// les cinq secondes, sur GitHub. Ce qui attend le chef en est mis à part ici, avant la vue.
// Les veilles des onglets (Cooks, Settings) et les gestes qui partent sur la box se partagent le
// passage de chaque projet : à eux tous, un projet ne lance qu'une commande à la fois.
const passage = new Map<string, Promise<unknown>>();
const standby = openStandbyOfBoard({
  lire: boards.lire,
  surLecture: (reading) => {
    const shownOne = putAside(reading);
    // Le rail se dessine aussi de ce `status` : son bloc dit en mots ce qui attend le chef, et sa
    // ligne `rail` ce que chaque carte porte du ticket.
    const redraws = facts.attendre(shownOne);
    if (redraws !== undefined) tellTheFacts(redraws);
    // Une question répondue qui attend le manager : son issue est relue de loin en loin.
    rereadAnswered(shownOne.projet);
    // Et la bande d'alertes : la cause d'une cuisine retenue se lit dans ses lignes de tête.
    tellTheBand(bands.status(shownOne));
    // Et l'accueil : ce qui bloque un projet, et depuis quand ses décisions attendent.
    tellTheHome(home.status(shownOne));
  },
});
// L'onglet de contenu affiché — Manager ou Log — a sa propre veille,
// réglée pareil : sa commande est lue pour elle-même, et son échec se lit dans
// l'onglet sans rien retirer à ce que `status` dit à côté. Sur un terminal, elle ne lit rien.
// La page des coûts de l'app (#1022) est lue par elle aussi : elle prend la place d'un onglet, l'espace fermé.
// La lecture de l'onglet Manager part avec ce qui s'y pose au-dessus du texte : l'état du
// manager, lu dans cette sortie (manager.ts).
// `ongletLu` : l'onglet que la veille lit, et sa demande.
let tabRead: { id: unknown; demande: number } | undefined;
const standbyOfTab = openStandby({
  intervalleMs: 30_000,
  delaiMs: 30_000,
  passage,
  cuisine: kitchens.cuisineDe,
  surLecture: (reading) => {
    const readOne = tabRead?.demande === reading.demande ? tabRead.id : undefined;
    tell("contenu", reading, readOne === "manager" ? seeManager(reading) : undefined);
    // La même lecture que celle de la veille du manager, à l'instant : la bande la reprend sans attendre la suivante.
    if (readOne === "manager") tellTheBand(bands.manager(reading));
  },
});
// Ce qui se dessine — la pastille de chaque projet dans la barre, sa carte, son rail,
// sa bannière d'arrêt — a la sienne aussi, et elle lit tous les projets, quel que soit
// l'écran : la barre est toujours affichée. Une box qui ne rend pas `faits` (un runtime
// plus ancien) le dit là où ils se dessinent, et `status` reste lisible à côté.
// Les questions du manager que le chef a répondues (answered.ts) : leur carte quitte TODO pour
// WAITING sans attendre le manager.
const answeredEntries = holdAnswered();
// Les priorités que le chef vient de changer depuis une fiche (priority.ts) : le rail les montre tant que la dernière
// lecture montre encore les anciennes.
const prioritiesWritten = holdPrioritiesWritten();
const facts = holdFacts(
  (project) => answeredEntries.de(project),
  (project) => prioritiesWritten.de(project),
);
// Chaque colonne du rail qui passe de cartes à aucune est dite (columns-emptied.ts, #2151) : sur la sortie d'erreur de
// l'app, et dans `rail-columns.log`, à côté du fichier des projets — la lecture qui l'a fait s'y relit après coup.
const logOfColumns = join(dirname(pathConfiguration()), "rail-columns.log");
const columnsOfRail = holdTheColumns((line) => {
  console.error(line);
  appendFile(logOfColumns, `${new Date().toISOString()} ${line}\n`).catch(() => {});
});
function tellTheFacts(receivedOne: Drawable): void {
  columnsOfRail.voir(receivedOne);
  if ("tableau" in receivedOne) dropTheVue(receivedOne.projet, receivedOne.tableau);
  tell("faits", receivedOne);
}
// L'accueil (home.ts) : une ligne par projet, une par station, et la ligne de santé — redessiné à
// chaque lecture qui le change, de `faits`, de `status` ou des stations sur GitHub.
const home = holdHome({ locale: () => (stationLocale === undefined ? null : gistLocal(rootOfTheStation)), projets: () => projects().map((project) => ({ nom: project.nom, servi: readable(project) })) });
function tellTheHome(seenOne: Home | undefined): void {
  if (seenOne !== undefined) tell("accueil", seenOne);
}
// La bande d'alertes de chaque projet (alerts.ts) : le manager, la cuisine —
// redessinée à chaque lecture qui la change, de `faits`, de `status` ou de `manager`.
const bands = holdBands();
// Une lecture qui ne change rien à la bande ne la redessine pas : même contenu, aucun mouvement (#721).
const lastBands = new Map<string, unknown>();
function tellTheBand(band: { projet: string }): void {
  if (lastBands.get(band.projet) === band) return;
  lastBands.set(band.projet, band);
  tell("alertes", band);
}
// Ramener la fenêtre au premier plan : rend faux quand il n'y en a plus.
function bringBack(): boolean {
  if (window === undefined || window.isDestroyed()) return false;
  if (window.isMinimized()) window.restore();
  window.show();
  window.focus();
  app.focus({ steal: true });
  return true;
}
// L'urgence d'un projet — toute sa cuisine attend le chef — se dit au système, une notification par
// annonce du runtime, la fenêtre devant, derrière ou réduite (notification.ts). Son clic ramène la
// fenêtre au premier plan, et la vue ouvre le projet sur sa ligne d'urgence et son geste. Ce que le
// chef a cliqué est retenu à côté du fichier des projets : rouverte, l'app ne le lui redit pas.
// Chaque notification est tenue jusqu'à la suivante du même projet : lâchée, elle perdrait son clic.
const shown = new Map<string, Notification>();
const emergencies = holdNotifications({
  memoire: memoryInFile(join(dirname(pathConfiguration()), "urgences.json")),
  montrer: ({ projet: project, titre: title, corps: body }, atClick) => {
    if (!Notification.isSupported()) return void console.error(`brigade: ${project} — ${body} (this system shows no notification)`);
    shown.get(project)?.close();
    const notification = new Notification({ title: title, body: body, urgency: "critical" });
    notification.on("click", atClick);
    shown.set(project, notification);
    notification.show();
  },
  ouvrir: (project) => {
    if (bringBack()) tell("urgence", project);
  },
});
// L'état de la cuisine hors de la fenêtre (menu-bar.ts, #3269) : une icône dans la barre des menus du Mac — la ligne
// « 3 cooking · 1 for you » à côté d'elle —, dans la zone de notification de Windows — le nombre de questions peint
// dessus, la ligne au survol. Son menu liste les questions qui attendent ; une question cliquée ramène la fenêtre sur sa
// carte (`ouvrirCarte`, que la vue ouvre comme une notification touchée sur le téléphone). Elle compte sur les derniers
// `faits` lus de chaque projet qui se lit, et se redit à chaque lecture ; le chef la retire dans Settings.
// Quand la station de fond est installée, l'icône est tenue à côté d'elle, l'app fermée comme ouverte (tray-fond/, #3631) :
// l'app ne pose pas la sienne, pour qu'il n'y en ait qu'une.
const iconAtBackground = locations.facon === "installee" && stationOfBackgroundInstalled({ plateforme: platform, maison: homedir(), localAppData: process.env.LOCALAPPDATA });
function entryOfMenu(entry: Entry): MenuItemConstructorOptions {
  switch (entry.genre) {
    case "separateur":
      return { type: "separator" };
    case "texte":
      return { label: entry.libelle, enabled: false };
    case "carte":
      return { label: entry.libelle, click: () => void (bringBack() && tell("ouvrirCarte", entry.projet, entry.ticket)) };
    case "projet":
      return { label: entry.libelle, click: () => void (bringBack() && tell("urgence", entry.projet)) };
    case "app":
      return { label: entry.libelle, click: () => void bringBack() };
  }
}
const menuBar = holdMenuBar({
  // L'icône unique dit l'état de la station avec les comptes, qu'elle soit posée par l'app ou par la station de fond (#4079).
  ligne: (projects) => lineOfBackground(projects, stateOfTheStation(projects)),
  creer: () => {
    const image = nativeImage.createFromPath(ICON_OF_THE_BAR);
    if (image.isEmpty()) throw new Error(`its icon could not be read: ${ICON_OF_THE_BAR}`);
    // Une seule icône dans la barre (#4079) : si celle de la station de fond la tient, cela lève `PlaceTenue`, et l'app la pose à sa lecture suivante.
    const icon = createTheIcon(image, platform);
    return {
      poser: (line, questions) => icon.ligne(image, { infobulle: "brigade", ligne: line, questions }),
      menu: (entries) => icon.menu(entries.map(entryOfMenu)),
      retirer: () => icon.retirer(),
    };
  },
});
// Ce qui empêche l'icône de fond de se montrer, que Settings dit (#3711) : relu toutes les minutes, et l'agent relancé s'il
// est tombé. Vide quand elle tourne, ou que le chef l'a retirée.
let iconOfBackgroundRefused = "";
async function keepTheIconOfBackground(): Promise<void> {
  if (!iconAtBackground || tracking.configuration().barreDeMenus === false) {
    iconOfBackgroundRefused = "";
    return;
  }
  iconOfBackgroundRefused = (await keepTheIcon({ plateforme: platform, maison: homedir(), localAppData: process.env.LOCALAPPDATA, uid: userInfo().uid, binaire: process.execPath, executer: run }).catch((error: unknown) => `the menu bar icon could not be checked: ${error instanceof Error ? error.message : String(error)}`)) ?? "";
}
ipcMain.handle("iconeDeFond", async () => {
  await keepTheIconOfBackground();
  return iconOfBackgroundRefused;
});
function setTheMenuBar(): void {
  if (!barReady) return;
  menuBar.poser(tracking.configuration().barreDeMenus !== false && !iconAtBackground, projects().filter(readable).map(({ nom: name }) => ({ nom: name, faits: facts.dernier(name)?.faits })));
}
const factsWatch = openStandbyOfBoard({
  lire: boards.lire,
  intervalleMs: 30_000,
  surLecture: (reading) => {
    tellTheFacts(facts.recevoir(reading));
    // Ce que GitHub dit de chaque cook du projet (#1846) — sa station, depuis sa prise, sa PR —, sans joindre la box : à
    // la place de son terminal, que l'app ne suit pas, la fiche d'un ticket suit son cook (vue/activity-of-cook.js).
    const board = boards.dernier(reading.projet);
    if (!("erreur" in reading) && board !== undefined) tell("activites", activitiesPublished(reading.projet, board));
    tellTheBand(bands.faits(reading));
    tellTheHome(home.faits(reading));
    // Une annonce d'urgence que le runtime vient de faire se dit au système.
    const readOnes = facts.dernier(reading.projet);
    if (readOnes !== undefined) emergencies.recevoir(reading.projet, readOnes.faits);
    setTheMenuBar();
  },
});

// Ce qui est avant le rail (upstream.ts, #1836) : lu sur GitHub pour le projet affiché seulement — son bandeau Backlog se
// pose au-dessus des colonnes de son rail (#3460). Des issues qui ne se lisent pas : la vue n'en dit rien (#1770), jamais
// « rien avant le rail », et aucune box n'est jointe pour lui.
const upstreams = holdUpstream();
const standbyOfTheUpstream = openStandbyOfBoard({
  lire: boards.lire,
  intervalleMs: 60_000,
  surLecture: (reading) => tell("amont", upstreams.recevoir(reading)),
});

// La veille de `status` change de projets : le bloc `attend` de ceux qu'elle ne lit plus est
// lâché, et leur rail redessiné sans lui — il ne serait plus rafraîchi, quand leurs faits le sont.
// `espace` : c'est l'espace d'un projet, et son rail — ce qui est en amont s'y lit aussi.
function look(seenOnes: Parameters<typeof standby.regarder>[0], commands: readonly string[], request: number, space = false): void {
  standby.regarder(seenOnes, commands, request);
  const upstream = space ? seenOnes : [];
  standbyOfTheUpstream.regarder(upstream, [COMMAND_UPSTREAM], request);
  upstreams.veiller(upstream.map(({ nom: name }) => name));
  for (const redraws of facts.veiller(seenOnes.map(({ nom: name }) => name))) tellTheFacts(redraws);
  for (const band of bands.veiller(seenOnes.filter(readable).map(({ nom: name }) => name))) { lastBands.set(band.projet, band); tell("alertes", band); }
  tellTheHome(home.veiller(seenOnes.map(({ nom: name }) => name)));
}

// Retirer un projet de l'app (removal.ts) : n'écrit que le fichier des projets — rien ne part vers sa station.
const removals = holdRemovals({
  chemin: pathConfiguration(),
  retirer: (name) => tracking.retirer(name),
});
// Ce que la veille de `status` lit en ce moment, tel que la vue l'a demandé en dernier :
// rejoué, il se relit avec les projets tels que l'app les montre maintenant.
let see = () => {};

// Les préférences du chef — les couleurs des projets, leur ordre, ce qu'il règle de l'affichage — le
// suivent d'un appareil à l'autre dans un gist secret de son compte, lu et écrit par le `gh` du poste
// (reglages-perso/). Le fichier des projets reste ce que les écrans lisent : chaque accord y pose ce que
// le gist porte, et y prend ce que le chef a changé ici. Le dossier d'un projet et son hôte n'en partent
// jamais. Le gist illisible — GitHub injoignable, un autre compte —, l'app montre le fichier tel qu'il est.
const preferences = holdPreferences({
  // Jamais posé hors des essais, comme pour les gists des stations.
  perso: settingsPersonal({ gist: gistOfPreferences({ gh: process.env.BRIGADE_GH_BIN || "gh", delaiMs: 30_000 }), appJson: pathConfiguration() }),
  fichier: { preferences: () => tracking.preferences(), poserPreferences: (wanted) => tracking.poserPreferences(wanted) },
  surPanne: (reason) => console.error(`brigade: your preferences were not synced with GitHub — ${reason}`),
});

// Le fichier des projets : créé s'il manque, relu dès qu'il change. Un projet
// qui a quitté la liste — ou changé de dossier — perd ses terminaux et sa mise
// en service ; les autres n'en savent rien.
const tracking = followConfiguration({
  chemin: pathConfiguration(),
  surChangement: (configuration, gone) => {
    tell("configuration", shownEntry(), gone.flatMap((name) => terminals.quitter(name)));
    // Un clone de brigade a pu entrer dans la liste, ou en sortir.
    void delays.relire(true);
    // L'accueil a une ligne par projet du fichier, tel qu'il est maintenant.
    tellTheHome(home.relire());
    // La barre des menus aussi — et le chef l'a peut-être allumée ou éteinte.
    setTheMenuBar();
    // Un projet qui vient d'y entrer — ajouté depuis l'app, ou écrit à la main — reçoit ses
    // couleurs : écrites, elles reviennent ici par une relecture, qui n'a plus rien à tirer. Un
    // fichier qui n'a pas pu être relu attend de l'être : l'app n'y écrit rien.
    if (configuration.nonRelu === undefined && !configuration.projets.every(({ couleurs: colors }) => whole(colors))) tint();
    // Ce que le chef vient de changer de ses préférences part dans son gist.
    preferences.signaler();
  },
});
// Les couleurs qui manquent aux projets, tirées et écrites dans le fichier (config.ts). Un fichier
// que l'app ne peut pas écrire garde ses projets sans couleur : la peau leur met la sienne.
function tint(): void {
  const refusal = tracking.colorer();
  if (refusal !== undefined) console.error(`brigade: the project colors could not be written — ${refusal}`);
}
// Les projets tels que l'app les montre, et les lit : ceux du fichier. Un projet qu'une station sert ailleurs que
// sur cet ordinateur est lu du tableau de sa cuisine sur GitHub.
let lastSeenOfProjects: SeenOfProjects | undefined;
const projects = () => tracking.configuration().projets;
const shownEntry = () => forTheBar(tracking.configuration(), readable, kitchens.ici, () => stationLocale?.tourne() === true, () => stationLocale?.redemarrage() ?? null);
// Un projet du fichier, qu'il s'ouvre ou non : sa cuisine se lit, et se vérifie, sans son dossier.
const knownOne = (name: unknown) => projects().find((candidate) => candidate.nom === name);
// Le même, tel que le fichier le déclare.
const declare = (name: unknown) => tracking.configuration().projets.find((candidate) => candidate.nom === name);

// Le code de l'app vient d'un clone, et rien d'autre ne le surveille : son retard sur son
// origine est lu au démarrage, puis à chaque retour à la fenêtre — et celui du clone d'un
// projet, quand ce clone est celui de brigade (delay.ts). Lire n'écrit rien dans un clone :
// un `git` qui n'a rien rendu au bout de trente secondes est arrêté. L'app installée n'a pas
// de clone : rien ne s'en lit.
// Le dossier de l'app, dans son clone.
const folderApp = join(import.meta.dirname, "..");
const delays = holdDelays({
  reglages: { git: "git", delaiMs: 30_000 },
  app: locations.clone,
  projets: projects,
  surLecture: (seenOne) => tell("code", seenOne),
});
// Les projets de ses stations, sous elles : ceux qu'il leur a ajoutés depuis l'app, écrits et relus
// dans le gist de chacune (projects/projects.ts) — relus à chaque lecture des stations.
let servedRead = "";
const projectsOfStations = holdProjects({
  github: githubOfStations({ gh: process.env.BRIGADE_GH_BIN || "gh", delaiMs: 30_000 }),
  stations: () => stations.vu()?.stations,
  depots: repositoriesOfChef({ gh: process.env.BRIGADE_GH_BIN || "gh", delaiMs: 30_000 }),
  // La station de cet ordinateur : c'est elle que la page d'un projet appelle « this computer ».
  locale: () => (role.role === "station" ? gistLocal(rootOfTheStation) : null),
  // Déménager une cuisine, c'est l'opération du runtime, lancée ici avec le répertoire de la station
  // de cet ordinateur (projects/move.ts) : un téléphone, qui n'a pas de runtime, n'en lance aucune.
  ...(role.role === "station" ? { demenager: moverOfRuntime({ node: locations.node, runtime: locations.runtime, racine: rootOfTheStation, env: process.env, delaiMs: 60_000 }) } : {}),
  // Le dépôt et la branche d'un projet, lus par `git` dans son clone sur cet ordinateur (#1306, addition.ts) : une
  // station de plus les en prend quand la première ne les dit pas.
  leClone: async (name) => {
    const folder = projects().find((project) => project.nom === name)?.dossier;
    if (folder === undefined) return null;
    const readOne = await readClone(process.env.BRIGADE_GIT_BIN || "git", folder);
    return { depot: readOne.depot ?? null, base: readOne.base ?? null };
  },
  surLecture: (seenOne) => {
    lastSeenOfProjects = seenOne;
    tell("projetsDesStations", seenOne);
    tellTheHome(home.projetsDesStations(seenOne));
    // Une station vient de dire qu'elle sert un projet de l'app : son rail se lit, et la vue le sait aussitôt.
    const servedOnes = JSON.stringify(seenOne.projets.map(({ nom: name }) => servedElsewhere(seenOne, name)));
    if (servedOnes === servedRead) return;
    servedRead = servedOnes;
    tell("configuration", shownEntry(), []);
    setTheMenuBar();
    see();
  },
});
// Les stations du chef, sur « Tous les projets » : celles qu'il a appairées, lues sur GitHub par
// le `gh` du poste toutes les trente secondes (stations/stations.ts). L'app ne joint aucune
// station : c'est GitHub qui porte ce que chacune dit d'elle.
const stations = holdStations({
  versions: versionsInFile(join(dirname(pathConfiguration()), "versions-vues.json")),
  github: githubOfStations({ gh: process.env.BRIGADE_GH_BIN || "gh", delaiMs: 30_000 }),
  surLecture: (seenOne) => {
    tell("stations", seenOne);
    for (const band of bands.limite(seenOne.limite)) tellTheBand(band);
    tellTheHome(home.stations(seenOne));
    void projectsOfStations.relire();
    void holdWhatProvidesThisComputer(seenOne);
  },
});
// Ce que la station de cet ordinateur fournit (stations/provides.ts, #1757) : `macos` sur un Mac. Son appairage le
// porte : écrit quand l'app l'appaire, et réécrit si une station appairée avant ne le dit pas.
const whatProvidesHere = async () => whatProvidesThisComputer(process.platform, []);
let providesHeld = false;
async function holdWhatProvidesThisComputer(seenOne: SeenOfStations): Promise<void> {
  const here = stationLocale === undefined ? null : gistLocal(rootOfTheStation);
  if (providesHeld || here === null || !seenOne.stations.some(({ id }) => id === here)) return;
  providesHeld = true;
  try {
    if (await stations.tenirCeQuElleFournit(here, await whatProvidesHere())) console.error("brigade: this computer's station now says on GitHub what it provides");
  } catch (error) {
    // Le gist n'a pas pu s'écrire : la lecture suivante réessaie.
    providesHeld = false;
    console.error(`brigade: what this computer's station provides could not be written on GitHub — ${error instanceof Error ? error.message : String(error)}`);
  }
}
// L'écran du premier lancement avant l'avis de macOS (premier-lancement/, #4081) : sur un Mac neuf, inscrire la station à
// l'ouverture de session fait dire à macOS qu'un élément d'arrière-plan s'est ajouté. L'inscription attend que le nouvel
// arrivant ait vu l'écran qui le lui annonce et pressé son bouton ; la marque, à côté du fichier des projets, dit qu'il
// l'a vu, et l'écran ne revient plus.
const opinionOfBackground = holdTheOpinionOfBackground(() => tell("avisDeFond"));
const brandOfTheOpinionOfBackground = join(dirname(pathConfiguration()), "avis-de-fond-vu");
ipcMain.handle("avisDeFond", () => opinionOfBackground.attendu());
ipcMain.handle("continuerLePremierLancement", () => opinionOfBackground.continuer());
const afterTheOpinionOfBackground = <T>(declencher: () => Promise<T>): Promise<T> =>
  passTheFirstLaunch({ avis: opinionOfMacOS({ mac: isOneMac(platform), inscrite: stationOfBackgroundInstalled({ plateforme: platform, maison: homedir(), localAppData: process.env.LOCALAPPDATA }) }), marque: brandOfTheOpinionOfBackground, afficher: opinionOfBackground.afficher, declencher, dire: (line) => console.error(line) });
// Sur un ordinateur, l'app est une station (`role`) : la station de la machine — la même que celle d'un serveur —, sous
// `station/` à côté du fichier des projets, tourne en fond, sans dépendre de l'app (station-fond/, #3630). L'app
// installée l'inscrit à l'ouverture de session ; ouverte, elle la rejoint si elle tourne, la lance sinon, et l'appaire
// seule, par le geste du champ de la home. Ce que la station dit va à son journal (`station/fond.log`).
const stationLocale =
  role.role === "station" && !installedAtLaunch
    ? holdTheStationOfBackground({
        racine: rootOfTheStation,
        inscrire: async () =>
          locations.facon === "installee"
            ? afterTheOpinionOfBackground(() => registerTheStationOfBackground({ plateforme: platform, maison: homedir(), localAppData: process.env.LOCALAPPDATA, uid: userInfo().uid, executer: run, node: locations.node, hote: HOST, racine: rootOfTheStation, embarque: role.principal, chemin: process.env.PATH, binaire: process.execPath }))
            : { par: "aucune" },
        // Le `node` de `npm start`, ou celui du paquet de l'app installée : Electron n'en est pas un.
        lancer: () => launchTheBackground({ node: locations.node, embarque: role.principal, racine: rootOfTheStation, env: process.env }),
        dire: (line) => console.error(line),
        appairer: async (code) => stations.appairer(code, await whatProvidesHere()),
        // Lancée ou arrêtée : la page d'un projet qui cuit ici le dit, ou cesse de le dire.
        surChangement: () => tell("configuration", shownEntry(), []),
      })
    : undefined;
// Les pannes d'une station, sur sa ligne de la home : chacune a son bouton (outages/actions.ts). Le
// login ne part que pour la station de cet ordinateur, par le `claude` officiel (outages/login.ts).
// Sa fin part aussi à la vue : une ouverture de projet qu'il retenait, au premier lancement, repart (#4057).
const claudeHere = claudeOf(process.env);
const loginHere = holdLogin({
  claude: claudeHere,
  env: process.env,
  dire: (line) => console.error(line),
  apres: () => {
    void stations.relire();
    tell("loginClaude");
  },
});
const actionsOfOutages = { stations, stationLocale: () => (stationLocale === undefined ? null : gistLocal(rootOfTheStation)), login: loginHere };
if (role.role === "poste") console.error(`brigade: this app is a workstation, not a station — ${role.pourquoi}: it pilots, nothing cooks here`);
// Son propre code, l'app le met à jour au clic sur la ligne qui dit son retard : son clone
// avance, puis elle se relance — par `npm start` quand c'est par là qu'elle est partie, pour
// que son lancement pose ce que la nouvelle version demande (catch-up.ts). Se fermer arrête
// les terminaux, comme quitter.
const pass = holdPassage({
  reglages: { git: "git", delaiMs: 60_000 },
  app: folderApp,
  relancer: () => {
    app.relaunch(relaunchOf(process.env, folderApp));
    app.quit();
  },
});

// La vue nomme un projet ; seul un projet du fichier, et qui s'ouvre, a un espace.
function project(name: unknown): Project {
  const finds = projects().find((candidate) => candidate.nom === name);
  if (finds === undefined || finds.refus !== undefined) throw new Error(`project without a space: ${String(name)}`);
  return finds;
}

ipcMain.handle("demarrage", () => ({ poste: { nom: nameOfWorkstation(), mac: isOneMac(platform) }, configuration: shownEntry(), palette: PALETTE, exemple: EXAMPLE, onglets: TABS, rubriques: HEADINGS, gestes: { attente: ACTIONS_OF_WAIT }, banniere: BANNER, calibrage: { modeles: MODELS, efforts: EFFORTS }, code: delays.vu(), stations: stations.vu(), projetsDesStations: projectsOfStations.vu(), accueil: home.vu(), miseAJour: update.vu() }));
// Les couleurs d'un projet : la vue nomme le projet, le rôle — onglet ou accent — et une couleur
// de la palette, par son nom, ou une couleur libre `#rrggbb` (colors.ts). Écrite, elle arrive par
// `surConfiguration`, avec ce qu'elle a de trop proche. Rend la raison, si elle ne l'a pas été.
ipcMain.handle("colorer", (_, name: unknown, role: unknown, color: unknown) => {
  const aims = declare(name);
  if (aims === undefined) return gone(name).refus;
  const wantedOne = choice(role, color);
  return "refus" in wantedOne ? wantedOne.refus : tracking.changerCouleur(aims.nom, wantedOne.role, wantedOne.valeur);
});
// L'état de la cuisine dans la barre des menus (menu-bar.ts) : allumé ou éteint, écrit dans le fichier des projets —
// il revient par `surConfiguration`, et l'icône se pose ou se retire. Rend la raison, si rien n'a été écrit.
ipcMain.handle("changerBarreDeMenus", (_, active: unknown) => tracking.changerBarreDeMenus(active));
// Le sigle d'un projet, celui de sa case dans la barre (acronym.ts) : la vue nomme le projet et le sigle que le
// chef a écrit — `null`, il le rend à celui que l'app tire de son nom. Écrit, il arrive par `surConfiguration`.
// Rend la raison, s'il ne l'a pas été.
ipcMain.handle("changerSigle", (_, name: unknown, acronym: unknown) => {
  const aims = declare(name);
  return aims === undefined ? gone(name).refus : tracking.changerSigle(aims.nom, acronym);
});
// Les tickets ordinaires de cet ordinateur (ordinary.ts) : le bloc que la vue pose pour un projet —
// rien, quand le projet ne cuit pas sur ce poste ; hors d'un Mac, pourquoi il n'en prend pas —, et le réglage, que la vue nomme et que le fichier écrit.
// Écrit, il arrive par `surConfiguration`. Le réglage rend la raison, s'il ne l'a pas été.
ipcMain.handle("ordinaires", (_, name: unknown) => {
  const aims = declare(name);
  return aims === undefined ? undefined : blockOfOrdinary(aims, platform, facts.stations(aims.nom), kitchens.ici(aims.nom));
});
ipcMain.handle("reglerOrdinaires", (_, name: unknown, active: unknown, limit: unknown) => {
  const aims = declare(name);
  return aims === undefined ? gone(name).refus : tracking.changerOrdinaires(aims.nom, active, limit);
});
// L'ordre des projets : la vue nomme le projet glissé dans la barre et la place où il a été lâché.
// C'est l'ordre du fichier qui change (config.ts) : rangé, il arrive par `surConfiguration` — la
// barre et « Tous les projets » le prennent alors. Rend la raison, s'il ne l'a pas été.
ipcMain.handle("ranger", (_, name: unknown, rank: unknown) => {
  const aims = declare(name);
  if (aims === undefined) return gone(name).refus;
  return typeof rank === "number" ? tracking.ranger(aims.nom, rank) : `nothing was done: “${String(rank)}” is not a place in the bar`;
});
const gone = (name: unknown) => ({ refus: `nothing was done: “${String(name)}” is no longer in the projects file` });
// Retirer un projet : la vue nomme le projet, ce qu'il en advient se décide dans retrait.ts. « Retirer de l'app »
// n'écrit que le fichier des projets — rien ne part vers sa station.
ipcMain.handle("retrait", (_, name: unknown) => {
  const aims = declare(name);
  return aims === undefined ? undefined : removals.etat(aims);
});
ipcMain.handle("retirerDeLApp", (_, name: unknown) => {
  const aims = declare(name);
  return aims === undefined ? gone(name) : removals.retirerDeLApp(aims);
});
ipcMain.handle("espace", (_, name: unknown) => terminals.espace(project(name)));
// La vue s'est rechargée (Cmd+R, #3159) : les pty sont restés ici, elle retrouve chacun, avec ce qu'il avait écrit.
ipcMain.handle("terminauxOuverts", () => terminals.ouverts());
// « + shell » : les machines où ouvrir un shell (machines.ts) — ce poste. La vue n'en reçoit que l'identifiant et le titre.
const machinesOfProject = (aims: Project) => machinesOf();
ipcMain.handle("machines", (_, name: unknown) => machinesOfProject(project(name)).map(({ id, titre: title }) => ({ id, titre: title })));
// La vue rend la machine choisie, par son identifiant : le shell s'y ouvre dans une session neuve,
// que l'app retient. Une machine qui n'est plus proposée n'ouvre rien.
ipcMain.handle("shell", (_, name: unknown, machine: unknown) => {
  const aims = project(name);
  const chosenOne = machineChosen(machinesOfProject(aims), machine);
  return chosenOne === undefined ? { refus: `nothing was opened: “${String(machine)}” is not among the machines this project offers any more` } : terminals.ouvrir(aims, chosenOne.cible);
});
// Fermer un shell pour de bon : il quitte l'espace, et sa session est détruite sur sa machine.
ipcMain.handle("fermerShell", (_, id: unknown) => (typeof id === "number" ? terminals.fermerShell(id) : { refus: "nothing was closed: no shell is named" }));
// Une carte de T'attend : une demande en prose est écrite dans le second, qui est affiché, et rien
// ne l'envoie. La vue nomme le projet et le ticket ; la phrase se compose ici (request.ts) de ce que
// le bloc `attend` en dit — jamais d'un texte venu de la vue. Rien pour un ticket que le bloc ne nomme pas.
// Depuis la fiche d'un ticket qui ne t'attend pas (#639), la phrase se compose de ce que les
// derniers faits en donnent — son mot d'état, son titre —, ou, d'une issue à venir, de son seul
// numéro. Rien pour un ticket qu'aucune lecture ne porte.
ipcMain.handle("demander", (_, name: unknown, ticket: unknown) => {
  const aims = project(name);
  if (typeof ticket !== "number") return undefined;
  const said = facts.attendu(aims.nom, ticket);
  const gives = said === undefined ? (facts.ticket(aims.nom, ticket) ?? (upstreams.adresse(aims.nom, ticket) === undefined ? undefined : {})) : undefined;
  if (said === undefined && gives === undefined) return undefined;
  const written = said !== undefined ? requestOf(aims.nom, ticket, said.lignes, said.titre) : requestOnTheTicket(aims.nom, ticket, gives?.etat, gives?.titre);
  return "refus" in written ? written : terminals.inscrire(aims, written.demande, noteOfTheRequest);
});
// Les gestes de la fiche d'un ticket, à cet instant (card-actions.ts) : d'après la carte cliquée,
// ceux qui tranchent ce qu'on attend du chef, puis ceux que la table du chef permet pour son état,
// dont l'action est branchée, chacun avec son prix.
ipcMain.handle("gestesDeFiche", (_, card: unknown) => actionsOfCard(card));
// Un geste de la fiche que la vue ne joue pas elle-même. Changer la priorité remplace le label `prio:`
// de l'issue sur GitHub (priority.ts, #1739), par le jeton du `gh` de ce poste — ni box : fait, le rail
// montre aussitôt la nouvelle priorité, jusqu'à ce que sa lecture la montre. Retirer le ticket du rail et
// renvoyer en cuisine un ticket revenu de WAITING retirent de son issue `fire` ou `waiting`, par le même
// jeton (actions-github.ts, #2061) ; le rail, relu de GitHub, le montre. Merger la livraison se fait sur sa
// PR, sur GitHub : rien ne part de l'app. La vue nomme le geste, le ticket et la valeur ; ce qui part se compose ici,
// jamais dans la vue.
ipcMain.handle("gesteDeFiche", async (_, name: unknown, id: unknown, ticket: unknown, value: unknown) => {
  const aims = knownOne(name);
  if (aims === undefined) return gone(name);
  if (id === "priorite") {
    if (facts.ticket(aims.nom, ticket)?.etat === undefined) return { refus: `nothing was changed: #${String(ticket)} is not on the latest rail read — read it again`, detail: "" };
    const rendered = await changeThePriority({ depot: await repositoryOfProject(aims), ticket, valeur: value, client: clientOfLabels });
    if (!("fait" in rendered)) return rendered;
    prioritiesWritten.ecrite(aims.nom, ticket as number, rendered.niveau, rendered.avant);
    redrawRail(aims.nom);
    return { fait: rendered.fait, detail: rendered.detail };
  }
  if (!onGithub(id)) return { refus: `nothing was done: “${String(id)}” is not a gesture the app plays here`, detail: "" };
  const rendered = await removeTheLabel(boards.dernier(aims.nom), id, ticket, clientOfLabels);
  if ("fait" in rendered) boards.oublier();
  return rendered;
});
// Le départ d'un projet qu'« Add a project » vient d'ouvrir (ticket 3268, departure-of-project.ts) : ses issues ouvertes lues sur
// GitHub, triées par le second (son triage, `claude -p`), puis les lignes que le chef garde mises sur le rail — `product`,
// `prio:<n>` et `fire` —, par le jeton du `gh` de ce poste.
ipcMain.handle("departDuProjet", async (_, name: unknown) => {
  const aims = knownOne(name);
  if (aims === undefined) return { sans: `${String(name)} is no longer in the projects file` };
  return proposeTheDeparture({ depot: await repositoryOfProject(aims), dossier: aims.dossier, lire: callGitHub, claude: process.env.BRIGADE_CLAUDE_BIN || "claude" });
});
ipcMain.handle("mettreSurLeRail", async (_, name: unknown, lines: unknown) => {
  const aims = knownOne(name);
  if (aims === undefined) return gone(name);
  return putOnTheRail({ depot: await repositoryOfProject(aims), lignes: lines, client: clientOfLabels });
});
// Le premier ticket d'un projet prêt (ticket 3306, first-ticket.ts) : le second l'écrit d'après la réponse du chef, par
// `claude -p` lancé comme son triage (`lancerLeTriage`) — rien n'est créé ; sur le « oui » du chef seul, l'issue est créée
// avec ses labels, `fire` compris, par le jeton du `gh` de ce poste.
ipcMain.handle("redigerLePremierTicket", async (_, name: unknown, request: unknown) => {
  const aims = knownOne(name);
  if (aims === undefined) return { refus: `${String(name)} is no longer in the projects file`, detail: "" };
  return draftTheFirstTicket({ depot: await repositoryOfProject(aims), dossier: aims.dossier, demande: request, claude: process.env.BRIGADE_CLAUDE_BIN || "claude", lancer: launchTheTriage });
});
ipcMain.handle("creerLePremierTicket", async (_, name: unknown, draft: unknown) => {
  const aims = knownOne(name);
  if (aims === undefined) return { refus: `nothing was created: ${String(name)} is no longer in the projects file`, detail: "" };
  return createTheFirstTicket(clientOfLabels, await repositoryOfProject(aims), draft);
});
// Un geste d'une carte que la station a mise de côté (ticket 3147) : « Relaunch » retire `served-elsewhere` de l'issue,
// « Close as already done » la ferme comme terminée — chacun par l'accès GitHub de l'app (actions-refusal.ts). « Ask the second »
// passe par `passerAuSecond`, plus haut.
ipcMain.handle("refus", async (_, name: unknown, id: unknown, ticket: unknown) => {
  const aims = knownOne(name);
  if (aims === undefined) return gone(name);
  const rendered = await playTheRefusal(boards.dernier(aims.nom), id, ticket, clientOfLabels);
  if ("fait" in rendered) boards.oublier();
  return rendered;
});
// La question qu'une carte de T'attend pose, telle qu'elle est écrite sur son issue (question.ts) :
// l'issue est lue par le `gh` du poste — celui du chef —, à l'ouverture de sa fiche. La vue nomme le
// projet et le ticket ; l'adresse est celle que la box a rendue (facts.ts). Rien pour un ticket que
// le bloc `attend` ne nomme pas : seule une entrée qui t'attend se lit ainsi.
const settingsGh = () => ({ gh: process.env.BRIGADE_GH_BIN || "gh", delaiMs: 30_000 });
// Ce que chaque lecture de l'issue dit de sa question est retenu (answered.ts) : répondue, sa carte
// quitte TODO ; plus répondue — une autre question —, elle y revient. Le rail est redessiné aussitôt.
function holdRead(project: string, ticket: unknown, readEntry: QuestionRead): QuestionRead {
  if (answeredEntries.lue(project, ticket, readEntry)) redrawRail(project);
  return readEntry;
}
function redrawRail(project: string): void {
  const redraws = facts.redessiner(project);
  if (redraws !== undefined) tellTheFacts(redraws);
}
// Une carte répondue attend le manager tant que la file la nomme : son issue est relue au plus toutes
// les deux minutes — c'est là que se voit une autre question. Ce que la file ne nomme plus est lâché.
function rereadAnswered(project: string): void {
  for (const ticket of answeredEntries.garder(project, facts.nommes(project))) {
    const address = facts.adresse(project, ticket);
    if (address !== undefined) void readQuestion(settingsGh(), address).then((readEntry) => holdRead(project, ticket, readEntry));
  }
}
ipcMain.handle("lireQuestion", (_, name: unknown, ticket: unknown) => {
  const aims = knownOne(name);
  if (aims === undefined || facts.attendu(aims.nom, ticket) === undefined) return undefined;
  const address = facts.adresse(aims.nom, ticket);
  return address === undefined ? { a: new Date().toISOString(), sans: "the station gave no https address for this issue: the app has nothing to read" } : readQuestion(settingsGh(), address).then((readEntry) => holdRead(aims.nom, ticket, readEntry));
});
// L'histoire d'un ticket, sur sa fiche : lue de GitHub par le `gh` du poste (card-github.ts), jamais de la
// box — le coût et la rétro que seul son journal porte sont dits non communiqués. La vue nomme le projet et le ticket.
ipcMain.handle("situation", (_, card: unknown) => situationOf(card));
ipcMain.handle("lireHistoire", async (_, name: unknown, ticket: unknown) => {
  const aims = knownOne(name);
  return aims === undefined ? undefined : storyOfGitHub(settingsGh(), await repositoryOfProject(aims), ticket);
});
// L'issue d'un ticket et sa discussion, sur la fiche de toute carte : lues de GitHub par le `gh` du poste
// (card-github.ts), le markdown rendu. Les adresses qu'elle montre sont gardées ici : un clic de la vue n'ouvre
// que l'une d'elles, jamais une adresse qu'elle aurait composée.
// Le commentaire du chef part sur l'issue du ticket, au clic, par le jeton du `gh` de ce poste (actions-github.ts) : la
// vue nomme le projet, le ticket et le texte ; le geste se compose ici (discussion.ts).
const linksRead = new LinksRead();
ipcMain.handle("lireDiscussion", async (_, name: unknown, ticket: unknown) => {
  const aims = knownOne(name);
  if (aims === undefined) return undefined;
  const readEntry = await discussionOfGitHub(settingsGh(), await repositoryOfProject(aims), ticket);
  if (!("sans" in readEntry)) linksRead.discussion(`${aims.nom}#${String(ticket)}`, readEntry.liens);
  return readEntry;
});
// Les chiffres d'autonomie d'un projet, ou de tous ceux que la vue nomme (vue/autonomy/autonomy-github.ts, #3222) : lus
// de GitHub par le jeton du `gh` de ce poste, sous le même budget et les mêmes lectures conditionnelles que le rail, chaque
// dépôt gardé dix minutes, ses issues déjà lues gardées au-delà (#3379). Un clic de la vue n'ouvre que l'adresse d'un ticket qu'une de ces lectures a rendue.
const autonomy = holdTheAutonomy({
  lire: (repository, readEntries) => readTheAutonomyOfRepository({ depot: repository, appeler: readConditional(callUnderBudget, memoryOfRail(repository)), maintenant: new Date(), lues: readEntries }),
  fraicheurMs: 10 * 60_000,
});
const linksOfAutonomy = new Set<string>();
ipcMain.handle("lireAutonomie", async (_, names: unknown, days: unknown) => {
  const aimed = (Array.isArray(names) ? names : []).flatMap((name) => knownOne(name) ?? []);
  const readEntry = await autonomy.chiffres(await Promise.all(aimed.map(async (project) => ({ nom: project.nom, depot: await repositoryOfProject(project) }))), Number(days));
  if ("chiffres" in readEntry) for (const { url } of readEntry.chiffres.avecHumain) linksOfAutonomy.add(url);
  return readEntry;
});
ipcMain.handle("ouvrirTicketDAutonomie", (_, url: unknown) => {
  if (typeof url !== "string" || !linksOfAutonomy.has(url)) return false;
  return shell.openExternal(url).then(
    () => true,
    () => false,
  );
});
ipcMain.handle("commenter", (_, name: unknown, ticket: unknown, text: unknown) => {
  const aims = knownOne(name);
  if (aims === undefined) return { poste: false, refus: `nothing was posted: “${String(name)}” is no longer in the projects file` };
  return comment(async (number, comment) => commentTheIssue(await repositoryOfProject(aims), number, comment, clientOfLabels), aims, ticket, text);
});
// « ask the second », au clic : `/brigade:ask <ticket> ` est écrit dans le second du projet, sans Entrée — le chef tape
// sa question à la suite (discussion.ts). Rien ne part sur le tableau ni sur la box, quelle que soit la station du
// projet. Le contexte que la vue passe encore n'est pas lu.
ipcMain.handle("demanderAuSecond", (_, name: unknown, ticket: unknown) => {
  const aims = knownOne(name);
  return aims === undefined ? { refus: gone(name).refus } : askAtSecond((command) => terminals.inscrire(aims, command, noteOfTheQuestion), aims, ticket);
});
// « ask the second », sur une carte de TODO (ticket 3133) : la carte passée au second — son numéro, sa question, ce que
// son issue dit, lue de GitHub par le poste —, écrite dans le second du projet sans Entrée (handover-second.ts).
ipcMain.handle("passerAuSecond", (_, name: unknown, ticket: unknown, question: unknown) => {
  const aims = knownOne(name);
  if (aims === undefined) return { refus: gone(name).refus };
  const read = async (number: number) => discussionOfGitHub(settingsGh(), await repositoryOfProject(aims), number);
  return passAtSecond((message) => terminals.inscrire(aims, message, noteOfTheHandover), read, aims, ticket, question);
});
// Essayer une livraison depuis sa carte (trial.ts, #3215) : son worktree vit sous le dossier de l'app, jamais dans la copie
// de travail du projet. Chaque changement d'un essai est redit à la vue, qui relit.
const trials = holdTheTrials({
  dossierDonnees: dirname(pathConfiguration()),
  ouvrir: (url) => void shell.openExternal(url).catch(() => undefined),
  surChangement: (project) => tell("essais", project),
});
ipcMain.handle("essais", (_, name: unknown) => {
  const aims = knownOne(name);
  return aims === undefined ? undefined : trials.vu(aims.dossier, aims.nom);
});
ipcMain.handle("essayer", async (_, name: unknown, ticket: unknown) => {
  const aims = knownOne(name);
  if (aims !== undefined && typeof ticket === "number" && Number.isInteger(ticket)) await trials.essayer(aims.dossier, aims.nom, ticket);
});
ipcMain.handle("arreterEssai", async (_, name: unknown, ticket: unknown) => {
  const aims = knownOne(name);
  if (aims !== undefined && typeof ticket === "number") await trials.arreter(aims.nom, ticket);
});
app.on("before-quit", () => void trials.toutArreter());
ipcMain.handle("ouvrirLien", (_, name: unknown, ticket: unknown, url: unknown) => {
  if (typeof url !== "string" || !linksRead.connait(`${String(name)}#${String(ticket)}`, url) || !/^https?:$/.test(URL.parse(url)?.protocol ?? "")) return false;
  return shell.openExternal(url).then(
    () => true,
    () => false,
  );
});
// Une capture d'un ticket d'interface, sur sa carte (captures.ts) : lue par le `gh` du poste à
// l'adresse que la box a rendue dans `facts`, et rendue à la vue en `data:`. La vue nomme le
// projet, le ticket, l'écran et le moment ; l'adresse ne quitte pas le process principal.
ipcMain.handle("lireCapture", (_, name: unknown, ticket: unknown, screen: unknown, moment: unknown) => {
  const aims = knownOne(name);
  if (aims === undefined) return undefined;
  const address = facts.capture(aims.nom, ticket, screen, moment);
  if (address === undefined) return { sans: "the station gave no address for this screenshot: the app has nothing to read" };
  return readCapture(settingsGh(), address).then((readEntry) => {
    // Le lien d'une capture qui ne se lit pas : la vue ne l'ouvre que par `ouvrirLien`, qui ne connaît que ce qu'une lecture a rendu.
    if ("sans" in readEntry && readEntry.lien !== undefined) {
      linksRead.capture(`${aims.nom}#${String(ticket)}`, readEntry.lien);
    }
    return readEntry;
  });
});
// Le titre d'une issue que la box ne donne pas (hors rail) : lu par le `gh` du poste, à l'adresse que
// la box a rendue pour ce ticket — jamais une adresse venue de la vue.
ipcMain.handle("lireTitre", (_, name: unknown, ticket: unknown) => {
  const aims = knownOne(name);
  if (aims === undefined) return undefined;
  const address = facts.adresse(aims.nom, ticket);
  return address === undefined ? { sans: "the station gave no https address for this issue: the app has nothing to read" } : titleOf(settingsGh(), address);
});
// La réponse du chef à cette question : un choix, par sa lettre, ou sa phrase. Elle part sur
// l'issue, en commentaire, par le même `gh` — à son nom. L'issue est relue avant : rien ne part sur
// une question qui n'est plus celle qu'il a lue, ni pour un ticket que la file ne nomme plus.
// Partie, la carte quitte TODO aussitôt (answered.ts) : elle attend le manager dans WAITING.
ipcMain.handle("repondreQuestion", async (_, name: unknown, ticket: unknown, answer: unknown) => {
  const aims = knownOne(name);
  if (aims === undefined) return { poste: false, refus: gone(name).refus };
  if (facts.attendu(aims.nom, ticket) === undefined) return { poste: false, refus: `nothing was posted: the \`attend\` block no longer names #${String(ticket)}` };
  const address = facts.adresse(aims.nom, ticket);
  if (address === undefined) return { poste: false, refus: "nothing was posted: the station gave no https address for this issue" };
  const renderedOne = await answerQuestion(settingsGh(), address, answer);
  const question = (answer as { question?: unknown } | null)?.question;
  if (renderedOne.poste && typeof question === "string") {
    if (answeredEntries.postee(aims.nom, ticket, question)) redrawRail(aims.nom);
  } else if (!renderedOne.poste && renderedOne.lue !== undefined) holdRead(aims.nom, ticket, renderedOne.lue);
  return renderedOne;
});
// Une ligne de la bande d'alertes dont le geste demande de lire, de juger ou d'agir hors de
// l'app : une demande en prose est écrite dans le second, et rien ne l'envoie. La vue nomme la
// ligne, par son sujet et ce qu'elle dit ; la phrase se compose ici (request.ts) de ce que la
// bande en dit maintenant — jamais d'un texte venu de la vue. Rien pour une ligne qu'elle ne dit plus.
ipcMain.handle("demanderAlerte", (_, name: unknown, subject: unknown, said: unknown) => {
  const aims = project(name);
  const alert = bands.alerte(aims.nom, subject, said);
  if (alert?.appel === undefined || !("demande" in alert.appel)) return undefined;
  const written = requestOfTheAlert(aims.nom, alert);
  return "refus" in written ? written : terminals.inscrire(aims, written.demande, noteOfTheRequest);
});
// Un geste de WAITING, sur une carte du rail ou sa fiche : il s'écrit sur l'issue, jamais par une commande de la box —
// parqué ou déparqué comme le second le fait (vue/wait/wait-github.ts, #3075, #4262). La vue nomme le geste et le
// ticket, et donne ce que le chef a rempli.
ipcMain.handle("attente", async (_, name: unknown, id: unknown, ticket: unknown, input: unknown) => {
  const aims = knownOne(name);
  if (aims === undefined) return gone(name);
  const today = new Date();
  const rendered = await playTheWait({ id, ticket, saisie: input, aujourdhui: today, lu: () => boards.dernier(aims.nom), client: clientOfLabels });
  if ("fait" in rendered) boards.oublier();
  return rendered;
});
// Le code qu'une station affiche, tapé par le chef : la station qui le publie sur GitHub est
// appairée — ou le refus dit en une ligne pourquoi rien ne l'est (stations/stations.ts).
ipcMain.handle("appairer", (_, code: unknown) => stations.appairer(code));
// « Add a project » : les dépôts du chef, lus par le `gh` du poste, entre lesquels il choisit.
ipcMain.handle("depotsDuChef", () => projectsOfStations.depots());
// Un dépôt quelconque, lu par son nom — public et pas au chef compris : sa branche par défaut, ou le refus.
const readTheRepository = readOneRepository({ gh: process.env.BRIGADE_GH_BIN || "gh", delaiMs: 30_000 });
ipcMain.handle("lireUnDepot", (_, repository: unknown) => readTheRepository(repository));
// Le parcours validé : la demande s'écrit dans le gist de chaque station choisie — ou chaque champ
// qui manque est signalé, et rien n'est écrit (projects/projects.ts).
ipcMain.handle("ajouterAUneStation", (_, input: unknown) => projectsOfStations.ajouter(input));
// La page d'un projet de l'app confie sa cuisine à une première station, ou à une de plus : c'est le
// seul geste qui l'installe sur une station (projects/projects.ts, `confier`).
ipcMain.handle("confierAUneStation", (_, input: unknown) => projectsOfStations.confier(input));
// Les dossiers de la cuisine de cet ordinateur pour un projet (#2489) : où elle garde son clone — celui que sa ligne du
// fichier des projets de la cuisine nomme, ou celui qu'elle prend sans lui (runtime/src/kitchen/projects.ts) —, et où elle
// pose les worktrees de ses cooks (runtime/src/kitchen/main.ts). Ils se lisent, ils ne se changent pas. Un téléphone n'a
// pas de station.
ipcMain.handle("dossiersDeLaStation", async (_, name: unknown): Promise<FoldersOfTheStation> => {
  if (role.role !== "station") return { refus: "this device runs no station" };
  if (typeof name !== "string" || name === "") return { refus: "its folders could not be read", detail: `${String(name)} is not a project name` };
  try {
    const { projectsOfTheKitchen } = await ofRuntime<typeof import("../../runtime/src/kitchen/projects.ts")>("kitchen", "projects.ts");
    const served = projectsOfTheKitchen(rootOfTheStation).find((project) => project.name === name);
    return { clone: served?.clone ?? join(rootOfTheStation, name, "depot"), worktrees: join(rootOfTheStation, "kitchen", name, "worktrees") };
  } catch (error) {
    return { refus: "its folders could not be read", detail: error instanceof Error ? error.message : String(error) };
  }
});
// Les dossiers et la porte réseau de la station de cet ordinateur, changés depuis sa page (#2644) : lus et écrits dans un
// fichier de cette machine (settings-of-the-station.ts). Un téléphone n'a pas de station.
const fileOfSettingsOfTheStation = join(dirname(pathConfiguration()), "station-reglages.json");
// Le bac à sable est « off » dès qu'un projet cuisiné ici a reçu « continuer sans » (suivi publié par la principale).
const withoutSandbox = () => (projectsOfStations.vu()?.projets ?? []).some((project) => project.onboarding?.sansBacASable === true && project.suiviPar?.id === projectsOfStations.vu()?.locale);
// Les clones de la cuisine sont sous le répertoire de la station, ses worktrees sous `kitchen/` (runtime/src/kitchen/).
ipcMain.handle("reglagesDeLaStation:lire", () => (role.role !== "station" ? { refus: "this device runs no station" } : readTheSettingsOfStation(fileOfSettingsOfTheStation, { clone: rootOfTheStation, worktrees: join(rootOfTheStation, "kitchen") }, withoutSandbox())));
ipcMain.handle("reglagesDeLaStation:ecrire", (_, change: unknown) =>
  role.role !== "station" ? { refus: "this device runs no station" } : writeSettingsOfTheStation(fileOfSettingsOfTheStation, typeof change === "object" && change !== null ? (change as Change) : {}),
);
// Retiré, le projet quitte la demande de chacune de ses stations : elles le retirent de leur configuration.
ipcMain.handle("retirerDUneStation", (_, name: unknown) => projectsOfStations.retirer(name));
// La page d'un projet déménage sa cuisine, d'un geste, vers une autre station appairée — cet
// ordinateur, sa box, une autre : l'opération du runtime l'écrit, ou dit en une phrase pourquoi non.
// « Continue without sandbox » (#1113) : la décision du chef se note par la fonction du runtime, dans l'état
// du projet sur la station de cet ordinateur.
ipcMain.handle("continuerSansBacASable", (_, name: unknown) => projectsOfStations.continuerSansBac(name));
// Une issue d'un choix, sur la carte d'un besoin qui manque (#1400) : elle s'écrit dans la demande de la principale,
// qui la pose à son journal (projects/projects.ts, `choisir`).
ipcMain.handle("choisirUneIssue", (_, name: unknown, choice: unknown, issue: unknown) => projectsOfStations.choisir(name, choice, issue));
ipcMain.handle("demenagerLaCuisine", (_, name: unknown, to: unknown) => projectsOfStations.demenager(name, to));
// La page GitHub où autoriser brigade sur un dépôt : seulement une de celles qu'une station a publiées.
ipcMain.handle("autoriserSurGitHub", (_, url: unknown) => {
  if (typeof url !== "string" || !projectsOfStations.pages().includes(url)) return false;
  return shell.openExternal(url).then(
    () => true,
    () => false,
  );
});
// « Retirer la station » : son appairage quitte son gist, elle disparaît de l'accueil.
ipcMain.handle("retirerLaStation", (_, id: unknown) => stations.retirer(id));
// La connexion à GitHub, par le geste du `gh` de ce poste (connection-github.ts). Le runtime est à côté de l'app, du
// dépôt comme du paquet (locations.ts) : seule la cuisine s'y lit (runtime/src/kitchen/).
const ghHere = process.env.BRIGADE_GH_BIN || "gh";
const ofRuntime = <M>(...path: string[]) => import(pathToFileURL(join(locations.runtime, "src", ...path)).href) as Promise<M>;
// Les pages qu'un échec a nommées — installer `gh`, la version Android : seules celles-là s'ouvrent depuis l'écran.
const pagesOfFirst = new Set<string>();
const connectionGitHub = holdConnectionGitHub({
  commande: async () => signInToGitHub(ghHere),
  env: process.env,
  ouvrir: (address) => shell.openExternal(address),
  apres: (end) => {
    accountConnected.oublier();
    tell("connexionGitHub", end);
  },
});
// Le compte GitHub que le `gh` de cet ordinateur tient, pour « Add a project » (#2475, #3181, connection-github.ts) —
// relu par la vue au bout d'une connexion, et donc d'un changement de compte.
ipcMain.handle("compteGitHub", async () => {
  const readOne = await readTheAccountGitHub({ gh: ghHere, env: process.env });
  if ("lien" in readOne && readOne.lien !== undefined) pagesOfFirst.add(readOne.lien);
  return readOne;
});
const holdThePage = <T extends { link?: string }>(rendered: T): T => {
  if (rendered.link !== undefined) pagesOfFirst.add(rendered.link);
  return rendered;
};
// Un projet ouvert d'un clic, depuis « Add a project » (first-launch.ts, #1434) : sa copie reprise ou clonée par le `gh`
// de ce poste (local-copy.ts, #1429) — chaque étape part à la vue —, puis ajouté au fichier des projets, une fois Claude
// Code connecté sur cet ordinateur (#4057).
const openOneProjectOfAStation = openOfAStation({
  ouvrirLaCopie: (options) => openTheLocalCopy({ ...options, gh: ghHere, git: process.env.BRIGADE_GIT_BIN || "git", env: process.env }),
  lireLaBase: async (folder) => (await readClone(process.env.BRIGADE_GIT_BIN || "git", folder)).base,
  configuration: () => tracking.configuration(),
  ajouter: (project) => tracking.ajouter(project),
  progres: (repository, step) => tell("ouverture", repository, step),
  connexionClaude: async () => connectionOfTheSession(await sessionOfClaude(claudeHere, process.env)),
});
ipcMain.handle("ouvrirDUneStation", async (_, name: unknown, repository: unknown, base: unknown) => {
  const opening = await openOneProjectOfAStation(name, repository, base);
  return opening.state === "failed" && "link" in opening ? holdThePage(opening) : opening;
});
// Les projets que la cuisine de cet ordinateur sert (#2359) : les dépôts de son fichier des projets
// (runtime/src/kitchen/projects.ts). Ils s'y écrivent sur la station, avec leur clone : l'app ne l'écrit pas.
ipcMain.handle("projetsServis", async () => {
  if (role.role !== "station") return undefined;
  const { projectsOfTheKitchen } = await ofRuntime<typeof import("../../runtime/src/kitchen/projects.ts")>("kitchen", "projects.ts");
  return { depots: projectsOfTheKitchen(rootOfTheStation).map(({ repo }) => repo) };
});
// Ce que seule l'ancienne station tenait — les stations que le chef appairait ou enregistrait sous son compte, ses GitHub
// Apps, ses projets servis écrits par l'app, ce que la machine fournit, le rail publié dans un gist, les propositions du
// second, la préparation d'un dépôt pour elle, les commandes `sensitive` et `undo` — ne se lit ni ne s'écrit plus : la
// cuisine (runtime/src/kitchen/) n'en a rien, et un dépôt n'a rien à préparer pour elle. Les écrans qui les demandent
// encore reçoivent ce qu'ils disent quand il n'y a rien ; ils partent avec leurs tickets (#4503, #4505).
const NOT_PAIRED = "Stations are no longer paired nor registered on GitHub: a station's kitchen serves the projects of its kitchen/projects file.";
const NOT_DONE = { refus: "nothing was done: stations are no longer paired", detail: NOT_PAIRED };
ipcMain.handle("stationsDuChef", () => ({ state: "listed", stations: [], unreadable: [], reason: NOT_PAIRED }));
ipcMain.handle("stationsDuCompte", () => ({ state: "listed", stations: [], unreadable: [], reason: NOT_PAIRED }));
ipcMain.handle("choisirLesProjets", () => NOT_DONE);
// « This computer » sur un projet (#4568) : sa ligne entre dans le fichier des projets de la cuisine de cet ordinateur
// (serve-here.ts), que la station relit seule. Le retirer ne se fait pas d'ici.
ipcMain.handle("servirUnProjet", async (_, repository: unknown, served: unknown) => {
  if (role.role !== "station") return { refus: "this device has no kitchen to serve a project" };
  if (served !== true) return { refus: "a project is given back to the box from its own Stations tab, not from this computer's list" };
  const repo = typeof repository === "string" ? repository.trim() : "";
  const known = projects().find((project) => project.depot?.toLowerCase() === repo.toLowerCase());
  const probes = await probesOfTheRuntime(locations.runtime, claudeHere);
  const git = process.env.BRIGADE_GIT_BIN || "git";
  return serveHere({
    stationDir: rootOfTheStation,
    repository: repo,
    project: known === undefined ? undefined : { nom: known.nom, dossier: known.dossier, ...(known.base === undefined ? {} : { base: known.base }) },
    probes,
    openCopy: ({ root, ...options }) => openTheLocalCopy({ ...options, gh: ghHere, git, env: { ...process.env, BRIGADE_PROJECTS_DIR: root } }),
    readBase: async (folder) => (await readClone(git, folder)).base ?? undefined,
  });
});
ipcMain.handle("appsDeLaStation", () => undefined);
ipcMain.handle("rangerUneApp", () => ({ refus: "this computer's kitchen keeps no GitHub App" }));
ipcMain.handle("defautsDeStation", () => ({ refus: "this computer could not be read", detail: NOT_PAIRED }));
ipcMain.handle("outilsManquants", () => []);
ipcMain.handle("railDuProjet", (_, name: unknown) => ({ state: "unavailable", project: String(name), cause: "unreadable", reason: `The rail of ${String(name)} is read on GitHub, not from a station's gist.` }));
const NOT_PLAYED = { refus: "nothing was done: this gesture was a command of the old runtime, which no kitchen runs — do it on GitHub", detail: "" };
ipcMain.handle("gesteSensible", () => NOT_PLAYED);
ipcMain.handle("annulerServi", () => NOT_PLAYED);
const READY = { ready: true, missingBindings: false, missingLabels: [] };
ipcMain.handle("checkRepoSetup", () => READY);
ipcMain.handle("runRepoSetup", () => READY);
// Le bloc de la station de l'accueil (ticket 2640) : installer celle de cet ordinateur (workstation/installer.ts).
ipcMain.handle("installerLaStation", () => installerTheStation(stationLocale, () => stations.relire()));
// Le « log in » d'une ouverture que Claude Code retient (#4057) : le login de cette machine, celui de la panne de sa station.
ipcMain.handle("seConnecterAClaude", () => loginHere());
// La page où taper le code se rouvre depuis l'écran.
ipcMain.handle("seConnecterAGitHub", async () => {
  const start = await connectionGitHub();
  if ("page" in start) pagesOfFirst.add(start.page);
  return start;
});
// Et celles qui disent comment obtenir un outil qui manque au second (#1435), depuis sa colonne.
ipcMain.handle("ouvrirLaPage", (_, url: unknown) => {
  if (typeof url !== "string" || !(pagesOfFirst.has(url) || terminals.pagesDesOutils().has(url))) return false;
  return shell.openExternal(url).then(
    () => true,
    () => false,
  );
});
// Le lien de l'app Android que l'offre du téléphone montre (#3303, update/android.ts) : l'`apkUrl` de la dernière
// version publiée, ou la page des versions s'il ne se lit pas — et lui seul, ensuite, s'ouvre par `ouvrirLaPage`.
ipcMain.handle("lienDeLApk", async () => {
  const link = await apkLink();
  pagesOfFirst.add(link);
  return link;
});
// Un téléphone déjà connecté au compte GitHub de cet ordinateur (#3303, phone-connected.ts) : la trace que l'app
// Android pose dans un gist, lue par le `gh` du poste. `illisible` quand la liste ne se lit pas : l'offre ne se montre pas.
ipcMain.handle("telephoneConnecte", async (): Promise<{ connecte: boolean } | { illisible: string }> => {
  try {
    return { connecte: (await githubOfStations({ gh: ghHere, delaiMs: 30_000 }).telephone?.()) === true };
  } catch (error) {
    return { illisible: error instanceof Error ? error.message : String(error) };
  }
});
// La cuisine que la visite montre (#4087, visit.ts) : benomite/brigade, son rail et ce qui y attend un humain, lus sur
// GitHub par la lecture même du rail d'un projet — des lectures seules, sous le budget du jeton du chef. Rien n'est cloné
// ni ajouté au fichier des projets.
ipcMain.handle("lireLaCuisineVisitee", (_, repository: unknown) =>
  readTheKitchenVisited(repository, async (aims) => {
    const readOne = await readTheBoardOfRepository({ depot: aims, appeler: callUnderBudget, memoire: memoryOfRail(aims) });
    return withWhatAwaitingTheChef(readOne, readConditional(callUnderBudget, memoryOfRail(aims)));
  }),
);
// Les labels d'une issue, lus et changés depuis une fiche (priority.ts, actions-github.ts), et le commentaire du chef,
// avec le jeton du `gh` de ce poste.
const clientOfLabels = clientOfThePriority({ jeton: tokenOfGh({ gh: ghHere, delaiMs: 10_000 }), appeler: callGitHub, envoyer: sendByFetch() });
// Les plafonds de durée du projet, sur Kitchen > Health (#2490, caps-duration.ts) : lus dans `.claude/brigade/projet.json`
// de son dépôt, sur sa branche d'intégration, et changés par une pull request vers elle (#2920), par le jeton du `gh` de
// ce poste — ni box. L'adresse de la PR rendue s'ouvre depuis l'écran (`ouvrirLaProposition`).
const branchOfProject = (project: Project) => project.base ?? projectsOfStations.vu()?.projets.find(({ nom: name }) => name === project.nom)?.base ?? null;
ipcMain.handle("plafondsDuree", async (_, name: unknown) => {
  const aims = knownOne(name);
  if (aims === undefined) return { sans: `${String(name)} is no longer in the projects file` };
  return readTheCaps({ depot: await repositoryOfProject(aims), branche: branchOfProject(aims), client: clientOfLabels });
});
ipcMain.handle("changerPlafondDuree", async (_, name: unknown, key: unknown, input: unknown) => {
  const aims = knownOne(name);
  if (aims === undefined) return gone(name);
  const rendered = await changeTheCap({ depot: await repositoryOfProject(aims), branche: branchOfProject(aims), cle: key, saisie: input, client: clientOfLabels });
  if ("pr" in rendered) proposalsOfSetting.add(rendered.pr);
  return rendered;
});
// Le closer du projet, sur Kitchen > Health (#2491, closer-health.ts) : ses passes et leurs PR, ses vérifications en plus
// (`.claude/brigade/closer-checks.md`) et ses réglages (`closer.*` de `projet.json`), lus sur sa branche d'intégration
// par le jeton du `gh` de ce poste — ni box. Un réglage changé, une vérification ajoutée ou retirée, s'y proposent par
// une pull request (#2920), dont l'adresse s'ouvre depuis l'écran.
ipcMain.handle("closerDeSante", async (_, name: unknown) => {
  const aims = knownOne(name);
  if (aims === undefined) {
    const without = { sans: `${String(name)} is no longer in the projects file` };
    return { reglages: without, verifications: without, passes: without };
  }
  return readTheCloser({ depot: await repositoryOfProject(aims), branche: branchOfProject(aims), client: clientOfLabels });
});
ipcMain.handle("changerReglageDuCloser", async (_, name: unknown, key: unknown, input: unknown) => {
  const aims = knownOne(name);
  if (aims === undefined) return gone(name);
  const rendered = await changeTheSetting({ depot: await repositoryOfProject(aims), branche: branchOfProject(aims), cle: key, saisie: input, client: clientOfLabels });
  if ("pr" in rendered) proposalsOfSetting.add(rendered.pr);
  return rendered;
});
ipcMain.handle("changerVerificationDuCloser", async (_, name: unknown, action: unknown, input: unknown) => {
  const aims = knownOne(name);
  if (aims === undefined) return gone(name);
  const rendered = await changeTheVerifications({ depot: await repositoryOfProject(aims), branche: branchOfProject(aims), geste: action, saisie: input, client: clientOfLabels });
  if ("pr" in rendered) proposalsOfSetting.add(rendered.pr);
  return rendered;
});
// Le savoir-faire du projet, sous Settings (#4239, vue/know-how/) : `.brigade/know-how.md` lu sur sa branche
// d'intégration, et une entrée changée ou retirée proposée par une pull request vers elle, comme un plafond.
const knowledgeOf = (name: unknown) => ({ nom: name, projet: knownOne(name), depotDe: repositoryOfProject, brancheDe: branchOfProject, client: clientOfLabels });
ipcMain.handle("savoirDuProjet", (_, name: unknown) => readTheKnowledgeOfProject(knowledgeOf(name)));
ipcMain.handle("changerLeSavoir", async (_, name: unknown, change: unknown) => {
  const rendered = await changeTheKnowledge({ ...knowledgeOf(name), changement: change });
  if ("pr" in rendered) proposalsOfSetting.add(rendered.pr);
  return rendered;
});
// Le bouton d'une panne, sur la ligne d'une station : rend ce qu'il a fait, ou pourquoi rien.
ipcMain.handle("panne", (_, id: unknown, key: unknown) => playOutage(actionsOfOutages, id, key));
// « report to brigade », sous chaque panne que l'app montre (ticket 1977, vue/report/) : le journal du projet est lu
// là où sa cuisine tourne — hors de son passage, qu'une lecture longue ne le retienne pas —, et l'issue préremplie
// s'ouvre dans le navigateur du poste. Rien n'est envoyé à GitHub d'ici : le chef l'envoie lui-même.
ipcMain.handle("signaler", (_, request: unknown) =>
  openTheReport(request, {
    appVersion: app.getVersion(),
    // La version du runtime à côté de l'app : celle de son `package.json`.
    runtimeVersion: async (readEntry) => {
      const version = await readFile(join(locations.runtime, "package.json"), "utf8")
        .then((text) => (JSON.parse(text) as { version?: unknown }).version)
        .catch(() => undefined);
      return versionAimed(readEntry, stations.vu()?.stations ?? [], typeof version === "string" && version !== "" ? version : "unknown");
    },
    journal: async (name) => {
      const { lu: readOne } = kitchenOfProject(name);
      if (readOne === undefined) throw new Error("no kitchen runs this project on this computer");
      const rendered = await launchThe({ delaiMs: 15_000 }, readOne, COMMAND_OF_LOG);
      if (rendered.erreur !== null) throw rendered.erreur;
      return rendered.sortie;
    },
    ouvrir: (url) => shell.openExternal(url),
  }),
);
// Une commande du runtime, lancée là où la cuisine d'un projet tourne, par son passage comme les veilles.
const launchOnTheKitchen = (readOne: Read, command: string) => {
  const rendered = (passage.get(readOne.nom) ?? Promise.resolve()).then(() => launchThe({ delaiMs: 30_000 }, readOne, command));
  passage.set(readOne.nom, rendered);
  return rendered;
};
// Les réglages du projet, sur sa page (#1309) : lus par `setting` là où sa cuisine tourne, et changés par une PR sur
// son dépôt — rien ne se pose sur la box (settings-of-project.ts). La proposition attend que le runtime du projet ait
// ouvert la PR — il l'attend lui-même deux minutes au plus — : elle ne passe pas par le passage du projet, que ses
// lectures ne restent pas derrière elle. Seule l'adresse d'une PR qu'elle a rendue s'ouvre depuis l'écran.
const proposalsOfSetting = new Set<string>();
const kitchenOfProject = (name: unknown) => {
  const aims = knownOne(name);
  const kitchen = aims === undefined ? undefined : kitchens.cuisineDe(aims);
  return { vise: aims, lu: aims === undefined || kitchen === undefined ? undefined : { nom: aims.nom, cuisine: kitchen } };
};
ipcMain.handle("reglagesDuProjet", (_, name: unknown) => {
  const { vise: aims, lu: readOne } = kitchenOfProject(name);
  return aims === undefined ? { sans: `${String(name)} is no longer in the projects file` } : readTheSettings(aims.nom, readOne, launchOnTheKitchen);
});
ipcMain.handle("proposerUnReglage", async (_, name: unknown, choice: unknown) => {
  const { vise: aims, lu: readOne } = kitchenOfProject(name);
  if (aims === undefined) return gone(name);
  const rendered = await proposeTheSetting(aims.nom, readOne, choice, (readOne, command) => launchThe({ delaiMs: 150_000 }, readOne, command));
  if ("pr" in rendered) proposalsOfSetting.add(rendered.pr);
  return rendered;
});
// Les agents au travail que lit l'onglet Agents (ticket 4569) : le kanban de GitHub (`taken`, `in-pass`) et ce que la cuisine
// écrit sur sa station, sans rien demander à l'ancien runtime (team-of-the-box.ts).
ipcMain.handle("agentsAtWork", (_, name: unknown) => {
  const { vise: aims, lu: readOne } = kitchenOfProject(name);
  if (aims === undefined) throw new Error(`${String(name)} is no longer in the projects file`);
  return readTheAgents({ station: hostname(), readOne, launch: launchOnTheKitchen, board: () => boards.lire(aims), now: Date.now });
});
// "Since you last looked" (#4649, since-last-looked.ts): the vue asks it each time the chef opens a project, and this opening
// becomes the last look, kept per project beside the configuration. Read from GitHub alone, through the board's conditional
// memory; the addresses it gives are the ones its entries open (`ouvrirIssue`).
const lastLooks = holdLastLooks(join(dirname(pathConfiguration()), "last-looked.json"));
const addressesLooked = new Map<string, Map<number, string>>();
ipcMain.handle("sinceYouLastLooked", async (_, name: unknown) => {
  const aims = knownOne(name);
  if (aims === undefined) throw new Error(`${String(name)} is no longer in the projects file`);
  const repository = await repositoryOfProject(aims);
  const read = await sinceYouLastLooked({ projet: aims.nom, depot: repository, appeler: readConditional(callUnderBudget, memoryOfRail(repository)), looks: lastLooks });
  if ("groups" in read) addressesLooked.set(aims.nom, new Map(read.groups.flatMap(({ entries }) => entries.map(({ ticket, url }) => [ticket, url] as const))));
  return read;
});
// Les humains du projet, sous Settings (#2930) : lus par `humans` là où sa cuisine tourne, et chaque changement — ajouté,
// changé ou retiré — écrit par une PR, que le runtime attend comme celle d'un réglage (humans-of-project.ts).
ipcMain.handle("listerLesHumains", (_, name: unknown) => {
  const { vise: aims, lu: readOne } = kitchenOfProject(name);
  return aims === undefined ? { sans: `${String(name)} is no longer in the projects file` } : readTheHumans(aims.nom, readOne, launchOnTheKitchen);
});
const writeOneHuman = async (name: unknown, action: { save: unknown } | { remove: unknown }) => {
  const { vise: aims, lu: readOne } = kitchenOfProject(name);
  if (aims === undefined) return gone(name);
  const rendered = await writeTheHumans(aims.nom, readOne, action, (readOne, command) => launchThe({ delaiMs: 150_000 }, readOne, command));
  if ("pr" in rendered) proposalsOfSetting.add(rendered.pr);
  return rendered;
};
ipcMain.handle("enregistrerUnHumain", (_, name: unknown, human: unknown) => writeOneHuman(name, { save: human }));
ipcMain.handle("retirerUnHumain", (_, name: unknown, login: unknown) => writeOneHuman(name, { remove: login }));
// La fiche du projet, sous Settings (#4240) : `.brigade/fiche-projet.json`, lue et écrite dans le dossier du projet sur ce
// poste (vue/card-project/card-project-folder.ts).
ipcMain.handle("lireUnFichierDuProjet", (_, name: unknown, path: unknown) => readInTheProject(knownOne(name), path));
ipcMain.handle("ecrireUnFichierDuProjet", (_, name: unknown, path: unknown, text: unknown) => writeInTheProject(knownOne(name), path, text));
// Les stations contributrices du projet, sous Settings (#2936) : lues par `contributor-stations` là où sa cuisine tourne, et
// refusées ou réacceptées par elle (stations-contributors.ts).
ipcMain.handle("listerLesStationsContributrices", (_, name: unknown) => {
  const { vise: aims, lu: readOne } = kitchenOfProject(name);
  return aims === undefined ? { sans: `${String(name)} is no longer in the projects file` } : readTheStations(aims.nom, readOne, launchOnTheKitchen);
});
const changeOneStation = (name: unknown, action: { refuse: unknown } | { accept: unknown }) => {
  const { vise: aims, lu: readOne } = kitchenOfProject(name);
  return aims === undefined ? gone(name) : writeTheStations(aims.nom, readOne, action, launchOnTheKitchen);
};
ipcMain.handle("refuserUneStationContributrice", (_, name: unknown, station: unknown) => changeOneStation(name, { refuse: station }));
ipcMain.handle("accepterUneStationContributrice", (_, name: unknown, station: unknown) => changeOneStation(name, { accept: station }));
ipcMain.handle("ouvrirLaProposition", (_, url: unknown) => {
  if (typeof url !== "string" || !proposalsOfSetting.has(url)) return false;
  return shell.openExternal(url).then(
    () => true,
    () => false,
  );
});
// Le code de l'app, en retard ou à relancer : le clic la met à jour et la relance — rien n'est
// rendu, elle se ferme — ou dit pourquoi elle reste sur son code (catch-up.ts).
ipcMain.handle("passer", () => {
  const itsOwn = delays.vu()?.clones.find(({ id }) => id === APP);
  if (itsOwn?.bouton === undefined) return { refus: "nothing to do: the last read did not find this app behind its origin" };
  return pass(itsOwn.etat === "a-relancer");
});
// La mise à jour de l'app installée (update/state.ts) : son état, la vérification que la vue
// demande, et « installer maintenant » — l'app se ferme et rien n'est rendu, ou elle dit pourquoi
// elle reste sur sa version. Depuis le dépôt, l'état dit qu'elle ne se met pas à jour par là.
ipcMain.handle("miseAJour", () => update.vu());
ipcMain.handle("verifierMiseAJour", () => update.verifier());
ipcMain.handle("installerMiseAJour", () => update.installerMaintenant());
// La ligne d'une version plus haute : le dernier avis, et son lien ouvert dans le navigateur — celui de l'avis, et lui seul.
ipcMain.handle("avisDeVersion", () => opinionOfVersion);
ipcMain.handle("telechargerVersion", async (_, url: unknown) => {
  if (typeof url !== "string" || (await opinionOfVersion)?.url !== url) return false;
  return shell.openExternal(url).then(
    () => true,
    () => false,
  );
});
// Un clone en retard : sa mise à jour — `git -C <clone> pull` — est écrite dans un shell, et
// rien ne l'envoie. La vue nomme le clone ; ce qui s'écrit, et dans l'espace de quel projet, se
// décide dans delay.ts — ou pourquoi rien ne l'est. Rien, pour un clone qui n'est pas en retard.
// L'espace du projet est ouvert d'abord, comme au clic sur sa case : un shell n'y vit pas sans son second.
ipcMain.handle("mettreAJour", (_, clone: unknown) =>
  delays.ecrire(
    {
      shell: (concerne, written) => {
        terminals.espace(concerne);
        return terminals.shell(concerne, written);
      },
    },
    clone,
  ),
);
// La réponse du chef à une carte de TODO (card-todo.ts) : la carte du chef lue de GitHub (#2434) — sa réponse est postée
// sur son issue et son geste joué par l'app même, par le jeton du `gh` de ce poste (board-actions/answer-github.ts) —, ni
// tableau, ni box. Toute autre carte ne se répond plus de l'app (#2061) : rien ne part, et la phrase dit pourquoi.
ipcMain.handle("repondreCarte", async (_, name: unknown, ticket: unknown, answer: unknown) => {
  const aims = knownOne(name);
  if (aims === undefined) return undefined;
  const chef = facts.chef(aims.nom, ticket);
  if (chef === undefined) return { refus: WITHOUT_DONE.carte, detail: "" };
  const rendered = await answerOnGithub({ depot: await repositoryOfProject(aims), ticket, chef, reponse: answer, client: clientOfLabels });
  if ("repondue" in rendered) boards.oublier();
  return rendered;
});
// Un geste du chef sur la carte « Validate its screen » (vue/validation-design/, ticket 3185) : écrit sur GitHub, comme sur
// le téléphone, par le jeton du `gh` de ce poste — `validate` merge la PR et ferme la carte, `send-back` la renvoie à un cook
// avec le commentaire du chef. La carte est celle que la dernière lecture porte ; faite, la lecture suivante va à GitHub.
ipcMain.handle("gesteDeValidation", async (_, name: unknown, ticket: unknown, action: unknown) => {
  const aims = knownOne(name);
  if (aims === undefined) return undefined;
  const rendered = await validateOnGithub({ depot: await repositoryOfProject(aims), carte: ticket, design: facts.chef(aims.nom, ticket)?.design, geste: action, client: clientOfLabels });
  if ("fait" in rendered) boards.oublier();
  return rendered;
});
// La PR qu'un nettoyage fini a ouverte (bilan du closer, #992) s'ouvre dans le navigateur du poste :
// une adresse https seulement, pour un projet que l'app connaît. Rend si elle a été ouverte.
ipcMain.handle("ouvrirBilan", (_, name: unknown, url: unknown) => {
  if (knownOne(name) === undefined || typeof url !== "string" || !/^https:\/\/[^\s]+$/.test(url)) return false;
  return shell.openExternal(url).then(
    () => true,
    () => false,
  );
});
// Les deux liens de la ligne d'un projet en lecture seule (ticket 3163) : la page n'est ouverte que pour le dépôt que la
// dernière lecture du projet dit en lecture seule (board/read.ts, `lectureSeule`).
ipcMain.handle("ouvrirLectureSeule", (_, name: unknown, page: unknown) => {
  const url = knownOne(name) === undefined ? undefined : pageOfFacts(boards.dernier(name)?.faits, page);
  if (url === undefined) return false;
  return shell.openExternal(url).then(
    () => true,
    () => false,
  );
});
// Un projet refusé n'a pas d'espace, mais sa box se lit quand même.
ipcMain.on("regarder", (_, name: unknown, request: number) => (see = () => look(projects().filter((candidate) => candidate.nom === name), ["status"], request, true))());
// L'onglet de contenu affiché, et lui seul : sa commande, sur la box de son projet.
// Aucun — un terminal, « Tous les projets » — ou un nom qui n'est pas celui d'un onglet : plus rien n'est lu pour lui.
ipcMain.on("onglet", (_, name: unknown, id: unknown, request: number) => {
  const commands = commandsOf(id);
  tabRead = { id, demande: request };
  const readOnes = projectsRead(name, shownEntry().projets);
  standbyOfTab.regarder(commands.length === 0 ? [] : readOnes, commands, request);
});
// « Tous les projets » : le `status` de chacun — ce qui bloque un projet, depuis quand ses décisions
// attendent, une station saturée : ce que l'accueil dit en une ligne et que `faits` ne porte pas.
ipcMain.on("tous", (_, request: number) => (see = () => look(projects(), ["status"], request))());
// La vue a posé sa barre — au démarrage, puis à chaque changement du fichier des projets.
ipcMain.on("faits", (_, request: number) => {
  facts.oublier();
  tellTheHome(home.oublier());
  // Chaque projet qui se lit — sur sa box ou ici — a sa bande dès maintenant : rien n'y est encore vérifié.
  for (const band of bands.ouvrir(projects().filter(readable).map(({ nom: name }) => name))) { lastBands.set(band.projet, band); tell("alertes", band); }
  factsWatch.regarder(projects(), [COMMAND], request);
});
// « réessayer maintenant » (#728) : le tableau est relu tout de suite, sur GitHub — pas la lecture
// d'il y a quelques secondes —, sans effacer ce qui en était tenu.
ipcMain.on("relireBox", (_, request: number) => {
  boards.oublier();
  factsWatch.regarder(projects(), [COMMAND], request);
});
// Les tickets `fire` d'un projet, lus sur GitHub par le `gh` du poste (fire.ts) : ce que la box ne
// disant plus rien, le rail sait encore. Jamais par la box — c'est justement elle qui ne répond pas.
// Les adresses que GitHub a rendues pour ces tickets : un numéro de la liste s'ouvre par elles, la box ne les dit plus.
const adressesOfFire = new Map<string, Map<number, string>>();
ipcMain.handle("lireFeu", async (_, name: unknown) => {
  const aims = knownOne(name);
  if (aims === undefined) return undefined;
  const fire = await readFire({ gh: process.env.BRIGADE_GH_BIN || "gh", delaiMs: 30_000 }, aims.dossier);
  if ("tickets" in fire) adressesOfFire.set(String(name), new Map(fire.tickets.flatMap(({ ticket, url }) => (url === undefined ? [] : [[ticket, url] as const]))));
  return fire;
});
// Un ticket du rail s'ouvre sur son issue, dans le navigateur du poste : la vue nomme le
// projet et le ticket, l'adresse est celle que la box a rendue (facts.ts) — ou, pour une issue
// qui n'est pas encore sur le rail, celle que `manager upstream` a donnée (upstream.ts). Rend si elle a été ouverte.
ipcMain.handle("ouvrirIssue", (_, name: unknown, ticket: unknown) => {
  const address = facts.adresse(name, ticket) ?? upstreams.adresse(name, ticket) ?? (typeof ticket === "number" ? (adressesOfFire.get(String(name))?.get(ticket) ?? addressesLooked.get(String(name))?.get(ticket)) : undefined);
  return address === undefined ? false : shell.openExternal(address).then(
    () => true,
    () => false,
  );
});
// Un ticket de Livré s'ouvre aussi sur sa PR mergée : l'adresse est celle que la box a donnée
// pour lui (facts.ts). Rend si elle a été ouverte.
ipcMain.handle("ouvrirPr", (_, name: unknown, ticket: unknown) => {
  const address = facts.pr(name, ticket);
  return address === undefined ? false : shell.openExternal(address).then(
    () => true,
    () => false,
  );
});
// La PR du cook d'un ticket s'ouvre depuis sa fiche (#1846) : la vue nomme le projet et le ticket, l'adresse est celle
// que la dernière lecture de GitHub donne pour son cook. Rend si elle a été ouverte.
ipcMain.handle("ouvrirPrDuCook", (_, name: unknown, ticket: unknown) => {
  const address = boards.dernier(name)?.activites.find((activity) => activity.ticket === ticket)?.pr?.url;
  return address === undefined || URL.parse(address)?.protocol !== "https:"
    ? false
    : shell.openExternal(address).then(
        () => true,
        () => false,
      );
});
ipcMain.on("ecrire", (_, id: number, data: string) => terminals.ecrire(id, data));
ipcMain.on("redimensionner", (_, id: number, columns: number, lines: number) => terminals.redimensionner(id, columns, lines));
ipcMain.on("scroll", (_, id: number, lines: number) => terminals.scroll(id, lines));

// Les pty appartiennent à l'app, pas à la fenêtre — mais il n'y a qu'une
// fenêtre : la fermer, c'est quitter, et quitter arrête tous les terminaux.
app.on("window-all-closed", () => app.quit());
app.on("will-quit", () => {
  tracking.fermer();
  menuBar.fermer();
  preferences.fermer();
  terminals.fermer();
  turns.fermer();
  standby.fermer();
  standbyOfTab.fermer();
  factsWatch.fermer();
  standbyOfTheUpstream.fermer();
  delays.fermer();
  update.fermer();
  clearInterval(verificationsOfVersion);
  stations.fermer();
  // La station de l'ordinateur ne s'arrête pas avec l'app (#3630) : l'app cesse seulement de la regarder, même pour
  // sa mise à jour. Sauf sous Windows, où l'installeur remplace le `node` que la station de fond joue (#3632) : son hôte
  // est arrêté, la station avec lui (son entrée fermée), et l'app rouverte la relance.
  const hostOfBackground = quitForUpdate && platform === "win32" ? stationLocale?.pid() : undefined;
  stationLocale?.fermer();
  if (hostOfBackground !== undefined) {
    try {
      process.kill(hostOfBackground);
    } catch (error) {
      console.error(`brigade: the background station (pid ${hostOfBackground}) could not be stopped for the app update — ${error instanceof Error ? error.message : String(error)}`);
    }
  }
});
// Revenir à l'app relit le fichier : le chef revient de son éditeur, et la
// veille du fichier n'a pas à être seule à le savoir. Et le retard des clones : il
// revient peut-être d'un `git pull`, ou d'une heure pendant laquelle on a livré.
app.on("browser-window-focus", () => {
  tracking.relire();
  void delays.relire();
  // Et les préférences du chef : il revient peut-être d'un autre appareil, où il les a changées.
  void preferences.tirer();
});

// Sous Windows, une notification ne s'affiche que pour une app qui a son identifiant de modèle
// d'application : celui d'Electron lancé depuis le dépôt est son exécutable (la doc d'Electron,
// « Notifications »). Un Mac n'en a pas besoin.
if (platform === "win32") app.setAppUserModelId(process.execPath);

// Pas d'`await` au premier niveau : Electron n'annonce « prêt » qu'une fois ce
// module chargé en entier — l'attendre ici, c'est ne jamais démarrer.
void app.whenReady().then(() => {
  // L'installeur attend que l'app soit fermée pour la remplacer.
  if (installedAtLaunch) return app.quit();
  // Mac installé : le .app porte son icône. Sous `npm start`, on pose celle de brigade à la main.
  // Windows : l'exécutable garde l'icône d'Electron, la fenêtre reçoit donc toujours la sienne — le
  // `Brigade.ico` posé à côté de l'exécutable une fois installée.
  const icon = join(import.meta.dirname, "..", "packaging", "icones", "Brigade-1024.png");
  const iconDock = join(import.meta.dirname, "..", "packaging", "icones", "Brigade-dock-1024.png");
  const iconWindows = app.isPackaged ? join(dirname(process.execPath), "Brigade.ico") : icon;
  // Sur un Mac, le .dmg est empaqueté (son exécutable s'appelle Brigade) : l'icône du Dock est celle de son bundle.
  if (isOneMac(platform) && !app.isPackaged) setTheIconOfDock(iconDock, (path) => app.dock?.setIcon(path));
  // L'entrée d'aide : les Discussions du dépôt (#3258).
  Menu.setApplicationMenu(Menu.buildFromTemplate(menuOfTheApp((url) => shell.openExternal(url), isOneMac(platform))));
  window = new BrowserWindow({
    ...(platform === "win32" ? { icon: iconWindows } : {}),
    width: 1280,
    height: 800,
    // Le plancher : la moitié de la largeur d'ouverture. En deçà, la peau ne tient plus (vue.css).
    minWidth: 640,
    minHeight: 400,
    title: "brigade",
    // Le fond de la fenêtre avant que la vue ne se peigne : celui de la peau (`--fond`, vue/tokens.css).
    backgroundColor: "#121418",
    webPreferences: { preload: join(import.meta.dirname, "preload.cjs") },
  });
  // L'icône de la barre des menus, avec ce qui est déjà lu ; chaque lecture de `faits` la redit ensuite.
  barReady = true;
  setTheMenuBar();
  // La première lecture du retard des clones : la vue la reçoit, ou la trouve à son démarrage.
  void delays.relire();
  // La première vérification des versions publiées, puis une tous les quarts d'heure.
  update.demarrer();
  // Et celle de la ligne d'une version plus haute, à la même cadence.
  checkTheVersion();
  verificationsOfVersion = setInterval(checkTheVersion, CADENCE_OF_VERSIONS_MS);
  // Les projets déclarés avant que les couleurs existent reçoivent les leurs, une fois.
  tint();
  // Les préférences du chef : lues dans son gist — qui en prend celles du fichier, s'il n'en a encore
  // aucune —, puis relues chaque minute. Celles du gist l'emportent sur les couleurs tout juste tirées.
  preferences.demarrer();
  return window.loadFile(join(import.meta.dirname, "vue/index.html"));
}).catch((error: unknown) => {
  // Un démarrage qui échoue ne reste pas muet : le chef lit en une phrase que la fenêtre ne s'ouvre pas, et quoi faire (#4071).
  // Le détail, qu'il ne saurait lire, va au journal.
  console.error(`brigade: the window could not be shown — ${error instanceof Error ? (error.stack ?? error.message) : String(error)}`);
  dialog.showErrorBox("brigade could not start", `Brigade could not show its window, so quit it and open it again, and if it still does not show, download it again from ${RELEASES_URL} and reinstall it.`);
  app.quit();
});
