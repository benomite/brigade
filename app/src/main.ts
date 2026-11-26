// L'app : une fenêtre, et le process qui tient les terminaux, la veille des
// box et le suivi du fichier des projets.
import { appendFile } from "node:fs/promises";
import { homedir, userInfo } from "node:os";
import { dirname, join } from "node:path";
import { pathToFileURL } from "node:url";
import { menuDeLApp } from "./aide-communaute.ts";
import { app, BrowserWindow, dialog, ipcMain, Menu, nativeImage, Notification, powerMonitor, protocol, shell, type MenuItemConstructorOptions } from "electron";
import { repondreAuxAgents, SCHEMA_DES_AGENTS, SCHEMA_PRIVILEGIE } from "./agents-de-la-box.ts";
import { poserLIconeDuDock } from "./icone-du-dock.ts";
import { holdBarDeMenus, type Entree } from "./bar-de-menus.ts";
import { creerLIcone, ICONE_DE_LA_BAR } from "./tray/icone.ts";
import { lineDuBackground } from "./tray/line.ts";
import { stateDeLaStation } from "./tray-background/tray-background.ts";
import { executer, garderLIcone, stationDeBackgroundInstallee } from "./tray-background/systeme.ts";
import { holdHome, type Home } from "./home.ts";
import { holdBandes } from "./alerts.ts";
import { deposerLaVue } from "./second/vue-du-project.ts";
import { lireFeu } from "./feu.ts";
import { ALLUMAGE, compter } from "./allumage.ts";
import { COMMAND as COMMAND_AMONT, holdAmont } from "./amont.ts";
import { mettreAPart } from "./awaiting.ts";
import { pourLaBar } from "./bar.ts";
import { lancerIci, lancerLa, ouvrirStandby, type Lu } from "./box.ts";
import { demarrerLaStationDuProject } from "./tray-background/read.ts";
import { situationDe } from "./histoire.ts";
import { LiensLus } from "./liens-lus.ts";
import { commenter, demanderAuSecond, noteDeLaQuestion } from "./discussion.ts";
import { noteDeLaPassation, passerAuSecond } from "./passation-second.ts";
import { discussionDeGitHub, histoireDeGitHub } from "./card-github.ts";
import { cheminConfiguration, EXEMPLE, type Project } from "./config.ts";
import { confirmationDe } from "./confirmation.ts";
import { holdLesEssais } from "./trial.ts";
import { COMMAND_DU_LOG, ouvrirLeReport, versionVisee } from "./vue/report/ouverture.ts";
import { lireLesSettings, proposerLeSetting } from "./settings-du-project.ts";
import { ecrireLesHumans, lireLesHumans } from "./humans-du-project.ts";
import { approuverLeAction, lireLesRetenus } from "./held/read.ts";
import { lireLesAgents } from "./team-de-la-box.ts";
import { ecrireUnRecurrent, lireLesRecurring } from "./vue/recurring/recurring-box.ts";
import { ecrireDansLeProject, lireDansLeProject } from "./vue/card-project/card-project-dossier.ts";
import { ecrireLesExplanations, lireLesExplanations } from "./vue/explanations/explanations-box.ts";
import { brancherLeWordAuCook } from "./vue/word-au-cook/word-au-cook-box.ts";
import { brancherLeKnowHow } from "./vue/know-how-tab/know-how-box.ts";
import { lireLeRecap, marquerLeRecap } from "./vue/recap/recap-box.ts";
import { ecrireLesStations, lireLesStations } from "./stations-contributrices.ts";
import { choice, entieres, PALETTE } from "./couleurs.ts";
import { blocDesOrdinaires } from "./ordinaires.ts";
import { ACTIONS_D_WAIT } from "./wait.ts";
import { KITCHEN_ACTIONS } from "./kitchen.ts";
import { BANNIERE, COMMAND, holdFacts, type Dessinable, type RailDuProjectLu } from "./facts.ts";
import { holdLesColonnes } from "./colonnes-videes.ts";
import { clientGitHub, parFetch, posterParFetch } from "./tableau/client.ts";
import { avecCeQuiAwaitingLeChef } from "./tableau/wait-du-chef.ts";
import { jouerLWait } from "./vue/wait/wait-github.ts";
import { readConditionnelle, type MemoireDesLectures } from "./tableau/rail-github.ts";
import { holdLesSignesDeVie } from "./vue/cooks/signes-de-vie.ts";
import { avecLaPresenceLocale, avecLaStationLocale } from "./vue/pause-quota/pause-quota.ts";
import type { SignesDeVie } from "./vue/rail/github.ts";
import { partageDesCardsAssignees, holdLeLogin } from "./vue/cards-assignees/cards-assignees.ts";
import { jetonDeGh } from "./tableau/jeton-gh.ts";
import { readSousBudget, holdLeBudgetGitHub } from "./budget-github.ts";
import { FRAICHEUR_MAX_D_UNE_READ_MS } from "./vue/served/fraicheur.ts";
import { activitiesPubliees, lireLeTableauDuRepository, type ReadDuTableauDuRepository } from "./tableau/read.ts";
import { lireLaKitchenVisitee } from "./visit.ts";
import { pageDesFacts } from "./read-only.ts";
import { ouvrirStandbyDuTableau, holdLecturesDuTableau } from "./tableau/rail.ts";
import { jouerLeRefusal } from "./actions-refusal.ts";
import { commenterLIssue, retirerLeLabel, SANS_FAIT, surGithub } from "./actions-github.ts";
import { requestDe, requestDeLAlert, requestSurLeTicket, noteDeLaRequest } from "./request.ts";
import { CONFIRMES, DIRECTS, ecrireAction } from "./actions.ts";
import { actionsDeCard } from "./card-actions.ts";
import { lancerLeTriage, mettreSurLeRail, proposerLeDepart } from "./depart-du-project.ts";
import { changerLaPriority, clientDeLaPriority, envoyerParFetch, holdPrioritesEcrites } from "./priority.ts";
import { changerLeCap, lireLesCaps } from "./caps-duree.ts";
import { changerLeSetting, changerLesVerifications, lireLeCloser } from "./closer-sante.ts";
import { changerLeSavoir, lireLeSavoirDuProject } from "./vue/know-how/know-how-github.ts";
import { repondreSurGithub } from "./tableau-actions/answer-github.ts";
import { jouerLaValidation } from "./vue/validation-design/validation-design-github.ts";
import { jouerLaRevue } from "./vue/card-sensitive/card-sensitive-github.ts";
import { jouerLAnnulation } from "./vue/undo/undo-github.ts";
import { lireLAutonomyDuRepository, holdLAutonomy } from "./vue/autonomy/autonomy-github.ts";
import { changerLeDay, lireLeDay, lireLesResumes, publierLeResume, type ResumeWeekly, type ResumesDuProject } from "./vue/resume-weekly/resume-kitchen.ts";
import { repositoryDeLOrigine, lireClone } from "./addition.ts";
import { lireLeAccountGitHub, holdConnectionGitHub } from "./connection-github.ts";
import { cheminDe, emplacementsDe, lireCheminDuShell } from "./emplacements.ts";
import { poserLaCommand } from "./command-brigade.ts";
import { chercherUneUpdate, workstationDe, type Opinion as OpinionDeVersion } from "./update/opinion.ts";
import { holdUpdate } from "./update/state.ts";
import { apkLink, RELEASES_URL } from "./update/android.ts";
import { fluxDe, formatDe } from "./update/flux.ts";
import { installeurDuWorkstation } from "./update/installation.ts";
import { voir as voirManager } from "./manager.ts";
import { machineChoisie, machinesDe } from "./machines.ts";
import { commandsDe, ONGLETS, projectsLus, RUBRIQUES } from "./onglets.ts";
import { jouerOutage } from "./outages/actions.ts";
import { gistLocal, holdLogin } from "./outages/login.ts";
import { holdToolsRequired } from "./tools-required.ts";
import { demenageurDuRuntime } from "./projects/demenagement.ts";
import { depotsDuChef, lireUnRepository } from "./projects/github.ts";
import { preparationDuRepository } from "./projects/preparation-du-repository.ts";
import { ecrireSettingsDeLaStation, lireSettingsDeLaStation as lireLesSettingsDeStation, type Changement } from "./settings-de-la-station.ts";
import { EFFORTS, MODELES, servedAilleurs, holdProjects, type DefautsDeLaMachine, type DossiersDeLaStation, type VuDesProjects } from "./projects/projects.ts";
import { memoireDansFichier, holdNotifications } from "./notification.ts";
import { holdKitchensIci } from "./workstation/kitchen-ici.ts";
import { estUnMac, nameDuWorkstation, persistantSur, shellDuWorkstation } from "./plateforme.ts";
import { roleDe } from "./workstation/role.ts";
import { ceQueFournitCetOrdinateur } from "./stations/fournit.ts";
import { holdLaStationDeBackground } from "./station-background/attache.ts";
import { HOTE, lancerLeBackground } from "./station-background/background.ts";
import { inscrireLaStationDeBackground } from "./station-background/inscription.ts";
import { ouvrirPty } from "./pty.ts";
import { claudeDe, connectionDeLaSession, ouvrirDUneStation, type StationsDuChef } from "./first-launch.ts";
import { opinionDeMacOS, passerLeFirstLaunch, holdLOpinionDeBackground } from "./first-launch/index.ts";
import type { PlanDuSecond } from "../../runtime/src/second/lancement.ts";
import { lireQuestion, repondre as repondreQuestion, titreDe, type Lue as QuestionLue } from "./question.ts";
import { lireCapture } from "./captures.ts";
import { relanceDe, holdPassage } from "./rattrapage.ts";
import { holdRepondues } from "./repondues.ts";
import { APP, holdRetards } from "./retard.ts";
import { openTurns } from "./saisie.ts";
import { type Propositions, type AnswerDuChef, holdLesPropositions } from "./second/propositions.ts";
import { holdRetraits } from "./retrait.ts";
import { DOSSIER as DOSSIER_DU_PLUGIN, lancerVraiment, sansPluginApp, holdLePluginApp } from "./plugin-app.ts";
import { holdServices } from "./service.ts";
import { installerLaStation } from "./workstation/installer.ts";
import { souvenirsDansFichier } from "./souvenirs.ts";
import { githubDesStations } from "./stations/github.ts";
import { avecLeurState, avecLeursAjouts, choiceDesProjects, type StationsDuAccount } from "./stations-du-account.ts";
import { holdStations, type VuDesStations } from "./stations/stations.ts";
import { versionsDansFichier } from "./stations/versions.ts";
import { suivreConfiguration } from "./suivi.ts";
import { gistDesPreferences } from "./settings-perso/gist.ts";
import { settingsPerso } from "./settings-perso/settings-perso.ts";
import { holdPreferences } from "./settings-perso/synchro.ts";
import { ouvrirTerminaux } from "./terminaux.ts";
import { suivreLaStandby } from "./vue/standby-machine/suivre.ts";

// Où sont le runtime de la station, son `node` et le clone de l'app : dans le dépôt, ou dans le
// paquet de l'app installée (emplacements.ts). Installée, l'app prend le PATH du shell de
// connexion du chef avant de rien lancer : ouverte depuis le Finder, elle n'a que celui du système.
const emplacements = emplacementsDe({ ressources: process.resourcesPath, src: import.meta.dirname, env: process.env });
// Ce qui dépend de la plateforme de ce poste — son nom à l'écran, son shell, ses sessions — vient
// d'un seul module (plateforme.ts) : le reste de l'app est le même code sur un Mac et sous Windows.
const plateforme = process.platform;
const shellIci = shellDuWorkstation(plateforme, process.env);
const chemin = cheminDe({ emplacements, env: process.env, maison: homedir(), plateforme, duShell: () => (plateforme === "win32" ? undefined : lireCheminDuShell(shellIci.commande, 10_000)) });
if (chemin !== undefined) process.env.PATH = chemin;

// Ce qu'est l'app sur cette machine (workstation/role.ts) : une station sur un ordinateur, le runtime
// à côté d'elle dans son clone, ou dans son paquet une fois installée ; un poste sur un
// téléphone — il pilote, rien n'y cuit, ni sa station ni celles que ses projets lui confient.
const role = roleDe({ plateforme, runtime: emplacements.runtime, env: process.env });
// Le répertoire de la station de cet ordinateur : `station/`, à côté du fichier des projets.
const racineDeLaStation = process.env.BRIGADE_STATION_DIR || join(dirname(cheminConfiguration()), "station");
// L'icône de la barre des menus ne se pose qu'une fois l'app prête : avant, Electron n'en crée pas
// (`poserLaBarreDeMenus`, plus bas). Déclaré ici : ce qui suit la redit dès qu'il change.
let barPrete = false;
// Où cuit chaque projet (workstation/kitchen-ici.ts) : un projet que la station de cet ordinateur sert
// se lit ici, par son geste ; les autres sont lus du tableau de leur cuisine sur GitHub.
// C'est relu à chaque lecture : une cuisine qui change de place est lue à la nouvelle dès la
// suivante, et la vue le sait aussitôt.
const kitchens = holdKitchensIci({
  locale: role.role === "station" ? { node: emplacements.node, runtime: emplacements.runtime, racine: racineDeLaStation, env: process.env } : undefined,
  surChangement: () => {
    tell("configuration", affichee(), []);
    tellLHome(home.relire());
    poserLaBarDeMenus();
  },
});
// Un projet dont quelque chose se lit : une station le sert, sur cet ordinateur ou ailleurs.
const lisible = ({ nom: name }: Project) => kitchens.ici(name) || servedAilleurs(dernierVuDesProjects, name);

let fenetre: BrowserWindow | undefined;
const tell = (canal: string, ...facts: unknown[]) => {
  if (fenetre !== undefined && !fenetre.isDestroyed()) fenetre.webContents.send(canal, ...facts);
};

// L'app installée se tient à jour sur les versions publiées (update/) : elle regarde au
// lancement puis tous les quarts d'heure (#2431), télécharge la nouvelle, et l'installe au geste du
// chef ou à son lancement suivant. Lancée depuis le dépôt, elle ne regarde rien : son clone la met à jour.
// Ce qu'elle télécharge vit à côté du fichier des projets, sous `update/`. Le même chemin sur
// un Mac et sous Windows : seuls l'installeur publié qu'elle lit et ce qui le joue sont du poste.
// Vrai quand l'app se ferme pour s'installer : la station et ses cooks ne s'arrêtent pas avec elle (update-background/survie.ts, #3632).
let quitterPourUpdate = false;
const dossierDeUpdate = join(dirname(cheminConfiguration()), "mise-a-jour");
const installeur = installeurDuWorkstation({ plateforme, ressources: process.resourcesPath, executable: process.execPath, pid: process.pid, dossier: dossierDeUpdate });
// Un quart d'heure, et non plus six heures (#2431) : une version publiée le matin se voit dans la matinée. Les deux
// vérifications ensemble lisent l'API de GitHub au plus trois fois par quart d'heure, loin de ses 60 lectures par heure.
const CADENCE_DES_VERSIONS_MS = 15 * 60 * 1000;
const update = holdUpdate({
  version: app.getVersion(),
  cadenceMs: CADENCE_DES_VERSIONS_MS,
  inactive: emplacements.facon === "installee" ? undefined : "launched from the repository, it updates through its clone",
  flux: fluxDe(process.env.BRIGADE_APP_MISE_A_JOUR_SOURCE, formatDe(plateforme)),
  dossier: dossierDeUpdate,
  installable: installeur.installable,
  installer: installeur.installer,
  quitter: () => {
    quitterPourUpdate = true;
    app.quit();
  },
  surEtat: (state) => tell("miseAJour", state),
});
// Une version téléchargée lors d'une session précédente s'installe avant que rien ne démarre : sa
// station n'est pas lancée, sa fenêtre ne s'ouvre pas — l'app se ferme, l'installeur la rouvre sur
// la nouvelle version.
const installeeAuLaunch = update.auLancement();
// La ligne d'une version plus haute (#1528, #2431, update/opinion.ts) : sur l'app installée d'un Mac ou d'un PC, la
// plus haute version publiée au-dessus de celle qui tourne, avec le lien direct de son paquet — relue au lancement, puis
// tous les quarts d'heure. Rien ne l'écarte, et une lecture qui ne trouve rien (GitHub muet) ne la retire pas : la
// version qui tourne ne change pas tant que l'app tourne, une version plus haute connue le reste. Lancée depuis le
// dépôt, l'app ne regarde rien : son clone la met à jour.
const workstationDeLOpinion = emplacements.facon === "installee" ? workstationDe(plateforme) : undefined;
let opinionDeVersion: Promise<OpinionDeVersion | undefined> = Promise.resolve(undefined);
const verifierLaVersion = () => {
  if (workstationDeLOpinion === undefined) return;
  const precedent = opinionDeVersion;
  opinionDeVersion = chercherUneUpdate({ version: app.getVersion(), poste: workstationDeLOpinion }).then(async (opinion) => opinion ?? (await precedent));
  void opinionDeVersion.then((opinion) => tell("avisDeVersion", opinion));
};
let verificationsDeVersion: ReturnType<typeof setInterval> | undefined;

// Chaque second dit ses tours à l'app, par ses crochets, dans un fichier à lui (saisie.ts) :
// c'est d'après eux qu'un geste direct part, ou dit qu'il ne peut pas.
// Les shells persistants ouverts sont retenus à côté du fichier des projets (souvenirs.ts) :
// rouverte, l'app les rattache à leur session.
const turns = openTurns();
// Le second part comme le runtime le dit (runtime/src/second/lancement.ts, #1433) : le `claude` que le PATH donne, et
// sous Windows ce qui le lance — ou pourquoi il ne part pas, chaque outil qui manque nommé avec ce qui l'obtient
// (#1435). Son plan est chargé une fois, du runtime qui est à côté de l'app (emplacements.ts) ; tant qu'il ne l'est pas,
// `claude` est lancé par son nom, comme avant lui. S'il ne se charge pas, le second le dit.
type Planifier = (dossier: string, args: readonly string[]) => PlanDuSecond;
let planifier: Planifier | undefined;
void Promise.all([
  import(pathToFileURL(join(emplacements.runtime, "src", "second", "launch.ts")).href) as Promise<typeof import("../../runtime/src/second/lancement.ts")>,
  import(pathToFileURL(join(emplacements.runtime, "src", "second", "outils.ts")).href) as Promise<typeof import("../../runtime/src/second/outils.ts")>,
]).then(
  ([{ planDuSecond }, { programmesDe }]) => {
    planifier = (dossier, args) => planDuSecond({ folder: dossier, args, env: process.env, programmes: programmesDe(process.env) });
  },
  (error: unknown) => {
    const pourquoi = String(error instanceof Error ? error.message : error).replace(/[.\s]+$/, "");
    planifier = () => ({ state: "cannot-start", cause: "invalid", reason: `The second cannot start: the app could not load what checks its tools (${pourquoi}).` });
  },
);
const terminaux = ouvrirTerminaux({
  ouvrirPty,
  tours: turns.de,
  planDuSecond: (dossier, args) => planifier?.(dossier, args) ?? { state: "ready", launch: { command: process.env.BRIGADE_CLAUDE_BIN || "claude", args: [...args], verbatim: false, folder: dossier, env: {} }, missing: [], tools: [] },
  souvenirs: souvenirsDansFichier(join(dirname(cheminConfiguration()), "shells.json")),
  node: emplacements.node,
  // La file que le second lit à son ouverture vient de GitHub seul, par le `gh` du poste (second/file.ts, #2460).
  gh: process.env.BRIGADE_GH_BIN || "gh",
  // La même doublure que le runtime : jamais posée hors des essais.
  claude: process.env.BRIGADE_CLAUDE_BIN || "claude",
  shell: shellIci.commande,
  argsDuShell: shellIci.args,
  persistantIci: persistantSur(plateforme),
  surSortie: (id, donnees) => tell("sortie", id, donnees),
  surEtat: (terminal) => tell("etat", terminal),
});

// La vue du rail d'un projet — ses colonnes, ses cartes, sa file TODO, l'état de sa cuisine, sa bande — se lit des
// issues, des labels et des PR de son dépôt sur GitHub (#1694, #2061, tableau/read.ts), avec le jeton du `gh` de ce
// poste : ni tailnet, ni box jointe, ni tableau de la cuisine — aucun runtime n'en écrit plus. Les veilles du rail, des
// faits et de l'amont lisent toutes cette même lecture, une à la fois par projet, reprise par chacune tant qu'elle a
// moins d'une minute. Le dépôt d'un projet est son `depot`, ou celui de l'`origin` de son dossier. GitHub se lit
// pour tout projet, quelle que soit la station qui le sert — que l'app la connaisse ou non (#2076) ; un projet qui ne
// se lit pas dit pourquoi.
const appelerGitHub = clientGitHub({ jeton: jetonDeGh({ gh: process.env.BRIGADE_GH_BIN || "gh", delaiMs: 10_000 }), envoyer: parFetch() });
const repositoryDuProject = async (project: Project) => project.depot ?? (await repositoryDeLOrigine(process.env.BRIGADE_GIT_BIN || "git", project.dossier)) ?? project.nom;
// Le rail — ses tickets au label `fire`, leur état tiré de leurs labels, de leur PR et de la base, la station qui les
// tient (vue/rail/github.ts) —, TODO — ce qui attend le chef, la lecture même que le second relaie à son ouverture
// (tableau/wait-du-chef.ts, #2460) — et ce qui est avant le rail : relus à chaque lecture (au plus une fois par
// minute, ou aussitôt après un geste, qui oublie la lecture), par des lectures conditionnelles dont un 304 ne coûte rien.
const memoiresDuRail = new Map<string, MemoireDesLectures>();
const memoireDuRail = (repository: string): MemoireDesLectures => memoiresDuRail.get(repository) ?? memoiresDuRail.set(repository, new Map()).get(repository)!;
// Ses stations, sur l'onglet Stations, se disent de leurs prises et du signe de vie que chacune réécrit dans son gist
// (#2358, vue/cooks/signes-de-vie.ts) : relu au pas où les stations l'écrivent, deux minutes, par la lecture des stations
// du compte que la vue fait déjà.
const signesDeVie = holdLesSignesDeVie({
  lire: async () => {
    const { lireLesStationsDuCompte: lireLesStationsDuAccount } = await duRuntime<typeof import("../../runtime/src/enregistrement-station/stations-du-compte.ts")>("enregistrement-station", "stations-du-account.ts");
    return lireLesStationsDuAccount({ gh: ghIci, env: process.env });
  },
});
// La station de cet ordinateur, que l'app voit tourner, n'est pas tue, même quand le quota GitHub du compte l'empêche
// d'écrire son signe de vie (ticket 3482, vue/pause-quota/) : son gist, nul quand elle ne tourne pas ici. Pendant que sa mise
// à jour la redémarre (#3637), elle n'est pas tue non plus : son process est entre deux versions, son signe de vie en retard.
const gistQuiTourneIci = (): string | null => (stationLocale?.tourne() === true || stationLocale?.redemarrage() != null ? gistLocal(racineDeLaStation) : null);
const signesVus = async (): Promise<SignesDeVie> => {
  const signes = await signesDeVie.signes();
  return "lus" in signes ? { lus: avecLaStationLocale(signes.lus, gistQuiTourneIci(), Date.now()) } : signes;
};
// Le compte GitHub de cet ordinateur, pour les cartes de TODO qui l'attendent (#2761, vue/cards-assignees/) : celles
// qui attendent un autre humain se replient sous « Awaiting others » (#2985).
const accountConnecte = holdLeLogin(async () => {
  const { echecDeGh: failureDeGh } = await duRuntime<typeof import("../../runtime/src/appairage/stations-du-chef.ts")>("appairage", "stations-du-chef.ts");
  return lireLeAccountGitHub({ gh: process.env.BRIGADE_GH_BIN || "gh", env: process.env, echecDeGh: failureDeGh });
});
// Ces lectures restent loin du budget horaire du jeton du chef (budget-github.ts, #3007) : les relectures d'un rail inchangé sont des 304 que GitHub ne compte pas,
// et toutes s'arrêtent, chaque projet gardant son dernier rail, quand GitHub dit le budget
// presque épuisé ou refuse pour dépassement — jusqu'à l'heure où il se remplit.
const budgetGitHub = holdLeBudgetGitHub();
const appelerSousBudget = budgetGitHub.appeler(appelerGitHub);
const lireLeTableau = async (project: Project): Promise<ReadDuTableauDuRepository> => {
  const repository = await repositoryDuProject(project);
  return readSousBudget({
    budget: budgetGitHub,
    depot: repository,
    dernier: () => tableaux.dernier(project.nom),
    lire: async () => {
      const lu = await lireLeTableauDuRepository({ depot: repository, appeler: appelerSousBudget, memoire: memoireDuRail(repository), signes: signesVus });
      const appeler = readConditionnelle(appelerSousBudget, memoireDuRail(repository));
      return avecCeQuiAwaitingLeChef(lu, appeler, partageDesCardsAssignees({ appeler, depot: repository, login: accountConnecte.login }));
    },
  });
};
const tableaux = holdLecturesDuTableau<Project>({ lire: lireLeTableau, fraicheurMs: FRAICHEUR_MAX_D_UNE_READ_MS });

// Seul ce qui est affiché est lu — un projet, ou chacun dans « Tous les projets » : toutes
// les cinq secondes, sur GitHub. Ce qui attend le chef en est mis à part ici, avant la vue.
// Les veilles des onglets (Cooks, Settings) et les gestes qui partent sur la box se partagent le
// passage de chaque projet : à eux tous, un projet ne lance qu'une commande à la fois.
const passage = new Map<string, Promise<unknown>>();
const standby = ouvrirStandbyDuTableau({
  lire: tableaux.lire,
  surLecture: (read) => {
    const montree = mettreAPart(read);
    // Le rail se dessine aussi de ce `status` : son bloc dit en mots ce qui attend le chef, et sa
    // ligne `rail` ce que chaque carte porte du ticket.
    const redessine = facts.attendre(montree);
    if (redessine !== undefined) tellLesFacts(redessine);
    // Une question répondue qui attend le manager : son issue est relue de loin en loin.
    relireRepondues(montree.projet);
    // Et la bande d'alertes : la cause d'une cuisine retenue se lit dans ses lignes de tête.
    tellLaBande(bandes.status(montree));
    // Et l'accueil : ce qui bloque un projet, et depuis quand ses décisions attendent.
    tellLHome(home.status(montree));
  },
});
// L'onglet de contenu affiché — Manager ou Log — a sa propre veille,
// réglée pareil : sa commande est lue pour elle-même, et son échec se lit dans
// l'onglet sans rien retirer à ce que `status` dit à côté. Sur un terminal, elle ne lit rien.
// La page des coûts de l'app (#1022) est lue par elle aussi : elle prend la place d'un onglet, l'espace fermé.
// La lecture de l'onglet Manager part avec ce qui s'y pose au-dessus du texte : l'état du
// manager, lu dans cette sortie (manager.ts).
// `ongletLu` : l'onglet que la veille lit, et sa demande.
let ongletLu: { id: unknown; demande: number } | undefined;
const standbyDOnglet = ouvrirStandby({
  intervalleMs: 30_000,
  delaiMs: 30_000,
  passage,
  cuisine: kitchens.cuisineDe,
  surLecture: (read) => {
    const lu = ongletLu?.demande === read.demande ? ongletLu.id : undefined;
    tell("contenu", read, lu === "manager" ? voirManager(read) : undefined);
    // La même lecture que celle de la veille du manager, à l'instant : la bande la reprend sans attendre la suivante.
    if (lu === "manager") tellLaBande(bandes.manager(read));
  },
});
// Ce qui se dessine — la pastille de chaque projet dans la barre, sa carte, son rail,
// sa bannière d'arrêt — a la sienne aussi, et elle lit tous les projets, quel que soit
// l'écran : la barre est toujours affichée. Une box qui ne rend pas `faits` (un runtime
// plus ancien) le dit là où ils se dessinent, et `status` reste lisible à côté.
// Les questions du manager que le chef a répondues (repondues.ts) : leur carte quitte TODO pour
// WAITING sans attendre le manager.
const repondues = holdRepondues();
// Les priorités que le chef vient de changer depuis une fiche (priority.ts) : le rail les montre tant que la dernière
// lecture montre encore les anciennes.
const prioritesEcrites = holdPrioritesEcrites();
const facts = holdFacts(
  (project) => repondues.de(project),
  (project) => prioritesEcrites.de(project),
);
// Chaque colonne du rail qui passe de cartes à aucune est dite (colonnes-videes.ts, #2151) : sur la sortie d'erreur de
// l'app, et dans `rail-columns.log`, à côté du fichier des projets — la lecture qui l'a fait s'y relit après coup.
const logDesColonnes = join(dirname(cheminConfiguration()), "rail-columns.log");
const colonnesDuRail = holdLesColonnes((line) => {
  console.error(line);
  appendFile(logDesColonnes, `${new Date().toISOString()} ${line}\n`).catch(() => {});
});
function tellLesFacts(recue: Dessinable): void {
  colonnesDuRail.voir(recue);
  if ("tableau" in recue) deposerLaVue(recue.projet, recue.tableau);
  tell("faits", recue);
}
// L'accueil (home.ts) : une ligne par projet, une par station, et la ligne de santé — redessiné à
// chaque lecture qui le change, de `faits`, de `status` ou des stations sur GitHub.
const home = holdHome({ locale: () => (stationLocale === undefined ? null : gistLocal(racineDeLaStation)), projets: () => projects().map((project) => ({ nom: project.nom, servi: lisible(project) })) });
function tellLHome(vu: Home | undefined): void {
  if (vu !== undefined) tell("accueil", vu);
}
// La bande d'alertes de chaque projet (alerts.ts) : le manager, la cuisine —
// redessinée à chaque lecture qui la change, de `faits`, de `status` ou de `manager`.
const bandes = holdBandes();
// Une lecture qui ne change rien à la bande ne la redessine pas : même contenu, aucun mouvement (#721).
const dernieresBandes = new Map<string, unknown>();
function tellLaBande(bande: { projet: string }): void {
  if (dernieresBandes.get(bande.projet) === bande) return;
  dernieresBandes.set(bande.projet, bande);
  tell("alertes", bande);
}
// Ramener la fenêtre au premier plan : rend faux quand il n'y en a plus.
function ramener(): boolean {
  if (fenetre === undefined || fenetre.isDestroyed()) return false;
  if (fenetre.isMinimized()) fenetre.restore();
  fenetre.show();
  fenetre.focus();
  app.focus({ steal: true });
  return true;
}
// L'urgence d'un projet — toute sa cuisine attend le chef — se dit au système, une notification par
// annonce du runtime, la fenêtre devant, derrière ou réduite (notification.ts). Son clic ramène la
// fenêtre au premier plan, et la vue ouvre le projet sur sa ligne d'urgence et son geste. Ce que le
// chef a cliqué est retenu à côté du fichier des projets : rouverte, l'app ne le lui redit pas.
// Chaque notification est tenue jusqu'à la suivante du même projet : lâchée, elle perdrait son clic.
const montrees = new Map<string, Notification>();
const urgences = holdNotifications({
  memoire: memoireDansFichier(join(dirname(cheminConfiguration()), "urgences.json")),
  montrer: ({ projet: project, titre, corps }, auClic) => {
    if (!Notification.isSupported()) return void console.error(`brigade: ${project} — ${corps} (this system shows no notification)`);
    montrees.get(project)?.close();
    const notification = new Notification({ title: titre, body: corps, urgency: "critical" });
    notification.on("click", auClic);
    montrees.set(project, notification);
    notification.show();
  },
  ouvrir: (project) => {
    if (ramener()) tell("urgence", project);
  },
});
// L'état de la cuisine hors de la fenêtre (bar-de-menus.ts, #3269) : une icône dans la barre des menus du Mac — la ligne
// « 3 cooking · 1 for you » à côté d'elle —, dans la zone de notification de Windows — le nombre de questions peint
// dessus, la ligne au survol. Son menu liste les questions qui attendent ; une question cliquée ramène la fenêtre sur sa
// carte (`ouvrirCarte`, que la vue ouvre comme une notification touchée sur le téléphone). Elle compte sur les derniers
// `faits` lus de chaque projet qui se lit, et se redit à chaque lecture ; le chef la retire dans Settings.
// Quand la station de fond est installée, l'icône est tenue à côté d'elle, l'app fermée comme ouverte (tray-background/, #3631) :
// l'app ne pose pas la sienne, pour qu'il n'y en ait qu'une.
const iconeAuBackground = emplacements.facon === "installee" && stationDeBackgroundInstallee({ plateforme, maison: homedir(), localAppData: process.env.LOCALAPPDATA });
function entreeDuMenu(entree: Entree): MenuItemConstructorOptions {
  switch (entree.genre) {
    case "separateur":
      return { type: "separator" };
    case "texte":
      return { label: entree.libelle, enabled: false };
    case "carte":
      return { label: entree.libelle, click: () => void (ramener() && tell("ouvrirCarte", entree.projet, entree.ticket)) };
    case "projet":
      return { label: entree.libelle, click: () => void (ramener() && tell("urgence", entree.projet)) };
    case "app":
      return { label: entree.libelle, click: () => void ramener() };
  }
}
const barDeMenus = holdBarDeMenus({
  // L'icône unique dit l'état de la station avec les comptes, qu'elle soit posée par l'app ou par la station de fond (#4079).
  ligne: (projects) => lineDuBackground(projects, stateDeLaStation(projects)),
  creer: () => {
    const image = nativeImage.createFromPath(ICONE_DE_LA_BAR);
    if (image.isEmpty()) throw new Error(`its icon could not be read: ${ICONE_DE_LA_BAR}`);
    // Une seule icône dans la barre (#4079) : si celle de la station de fond la tient, cela lève `PlaceTenue`, et l'app la pose à sa lecture suivante.
    const icone = creerLIcone(image, plateforme);
    return {
      poser: (line, questions) => icone.ligne(image, { infobulle: "brigade", ligne: line, questions }),
      menu: (entrees) => icone.menu(entrees.map(entreeDuMenu)),
      retirer: () => icone.retirer(),
    };
  },
});
// Ce qui empêche l'icône de fond de se montrer, que Settings dit (#3711) : relu toutes les minutes, et l'agent relancé s'il
// est tombé. Vide quand elle tourne, ou que le chef l'a retirée.
let iconeDeBackgroundRefusee = "";
async function garderLIconeDeBackground(): Promise<void> {
  if (!iconeAuBackground || suivi.configuration().barreDeMenus === false) {
    iconeDeBackgroundRefusee = "";
    return;
  }
  iconeDeBackgroundRefusee = (await garderLIcone({ plateforme, maison: homedir(), localAppData: process.env.LOCALAPPDATA, uid: userInfo().uid, binaire: process.execPath, executer }).catch((error: unknown) => `the menu bar icon could not be checked: ${error instanceof Error ? error.message : String(error)}`)) ?? "";
}
ipcMain.handle("iconeDeFond", async () => {
  await garderLIconeDeBackground();
  return iconeDeBackgroundRefusee;
});
function poserLaBarDeMenus(): void {
  if (!barPrete) return;
  barDeMenus.poser(suivi.configuration().barreDeMenus !== false && !iconeAuBackground, projects().filter(lisible).map(({ nom: name }) => ({ nom: name, faits: facts.dernier(name)?.faits })));
}
const factsWatch = ouvrirStandbyDuTableau({
  lire: tableaux.lire,
  intervalleMs: 30_000,
  surLecture: (read) => {
    tellLesFacts(facts.recevoir(read));
    // Ce que GitHub dit de chaque cook du projet (#1846) — sa station, depuis sa prise, sa PR —, sans joindre la box : à
    // la place de son terminal, que l'app ne suit pas, la fiche d'un ticket suit son cook (vue/activity-du-cook.js).
    const tableau = tableaux.dernier(read.projet);
    if (!("erreur" in read) && tableau !== undefined) tell("activites", activitiesPubliees(read.projet, tableau));
    tellLaBande(bandes.faits(read));
    tellLHome(home.faits(read));
    // Une annonce d'urgence que le runtime vient de faire se dit au système.
    const lus = facts.dernier(read.projet);
    if (lus !== undefined) urgences.recevoir(read.projet, lus.faits);
    poserLaBarDeMenus();
  },
});

// Ce qui est avant le rail (amont.ts, #1836) : lu sur GitHub pour le projet affiché seulement — son bandeau Backlog se
// pose au-dessus des colonnes de son rail (#3460). Des issues qui ne se lisent pas : la vue n'en dit rien (#1770), jamais
// « rien avant le rail », et aucune box n'est jointe pour lui.
const amonts = holdAmont();
const standbyDeLAmont = ouvrirStandbyDuTableau({
  lire: tableaux.lire,
  intervalleMs: 60_000,
  surLecture: (read) => tell("amont", amonts.recevoir(read)),
});

// La veille de `status` change de projets : le bloc `attend` de ceux qu'elle ne lit plus est
// lâché, et leur rail redessiné sans lui — il ne serait plus rafraîchi, quand leurs faits le sont.
// `espace` : c'est l'espace d'un projet, et son rail — ce qui est en amont s'y lit aussi.
function regarder(vus: Parameters<typeof standby.regarder>[0], commands: readonly string[], request: number, space = false): void {
  standby.regarder(vus, commands, request);
  const amont = space ? vus : [];
  standbyDeLAmont.regarder(amont, [COMMAND_AMONT], request);
  amonts.veiller(amont.map(({ nom: name }) => name));
  for (const redessine of facts.veiller(vus.map(({ nom: name }) => name))) tellLesFacts(redessine);
  for (const bande of bandes.veiller(vus.filter(lisible).map(({ nom: name }) => name))) { dernieresBandes.set(bande.projet, bande); tell("alertes", bande); }
  tellLHome(home.veiller(vus.map(({ nom: name }) => name)));
}

// L'installation guidée d'un projet (service.ts) : ses étapes, lues et faites par les
// commandes `installation` du runtime de sa box, lancées une à une par le passage du projet
// comme les veilles — par la station de cet ordinateur, quand c'est elle qui fait
// tourner sa cuisine. Chacune a deux minutes : la vérification joint l'origine du dépôt et
// GitHub, la protection aussi. Sa session s'ouvre dans le second, son démarrage s'écrit dans
// un shell. Chaque installation qui change est poussée à la vue — et à la bande d'alertes du
// projet : installé, ce que son contrôle dit qu'il a perdu y entre (alerts.ts), jamais l'écran
// d'installation. Le contrôle d'un projet installé ne se refait pas plus d'une fois par minute.
const services = holdServices({
  delaiMs: 120_000,
  lancer: (lu, command) => {
    const rendu = (passage.get(lu.nom) ?? Promise.resolve()).then(() => lancerLa({ delaiMs: 120_000 }, lu, command));
    passage.set(lu.nom, rendu);
    return rendu;
  },
  cuisine: kitchens.cuisineDe,
  session: terminaux.session,
  shell: terminaux.shell,
  surGuide: (guide) => {
    tell("guide", guide);
    tell("alertes", bandes.controle(guide.projet, guide.controle));
  },
  controleMs: 60_000,
});
// Ce qu'un projet installé a perdu — une station, un geste de box — se relit pour chacun,
// quel que soit l'écran : sa pastille dans la barre le dit aussi. Toutes les cinq minutes, et
// dès que la barre est posée ; un contrôle en route ne se double pas.
const CONTROLE_MS = 5 * 60_000;
const controlerTout = () => {
  for (const project of projects()) if (kitchens.cuisineDe(project) !== undefined) void services.controler(project);
};
const controles = setInterval(controlerTout, CONTROLE_MS);

// Le plugin de l'app (plugin-app.ts, #2160) : `/brigade:dev` et `/brigade:ask` dans chaque projet qu'elle ouvre, en
// scope local de son dossier, à la version qu'elle porte — posé dès le lancement, et pour chaque projet qui entre dans
// le fichier ; retiré du dossier d'un projet retiré de l'app. Un essai lancé avec un `claude` de remplacement
// (`BRIGADE_CLAUDE_BIN`) ne le pose nulle part : ce remplaçant est une session, pas le gestionnaire de plugins.
const pluginApp = process.env.BRIGADE_CLAUDE_BIN
  ? sansPluginApp((line) => console.error(line))
  : holdLePluginApp({
      lancer: lancerVraiment(process.env),
      claude: "claude",
      marketplace: join(dirname(cheminConfiguration()), DOSSIER_DU_PLUGIN),
      commandes: emplacements.commandes,
      versionDeLApp: app.getVersion(),
      lieux: { node: emplacements.node, runtime: emplacements.runtime },
      dire: (line) => console.error(line),
    });
// Retirer un projet de l'app (retrait.ts) : n'écrit que le fichier des projets — rien ne part vers sa station —, et
// désinstalle le plugin de l'app de son dossier.
const retraits = holdRetraits({
  chemin: cheminConfiguration(),
  retirer: (name) => suivi.retirer(name),
  desinstaller: (project) => void pluginApp.retirer(project),
});
// Ce que le second de chaque projet propose au chef (second/propositions.ts, #1520) : le canal du runtime
// (runtime/src/second-propositions/canal.ts, #1519), chargé une fois de celui qui est à côté de l'app. Tant qu'il ne
// l'est pas, aucun second n'a de proposition ; s'il ne se charge pas, le terminal reste tel quel, sans boutons dessous.
let propositionsDuSecond: Propositions | undefined;
// Ce que la veille de `status` lit en ce moment, tel que la vue l'a demandé en dernier :
// rejoué, il se relit avec les projets tels que l'app les montre maintenant.
let voir = () => {};

// Les préférences du chef — les couleurs des projets, leur ordre, ce qu'il règle de l'affichage — le
// suivent d'un appareil à l'autre dans un gist secret de son compte, lu et écrit par le `gh` du poste
// (settings-perso/). Le fichier des projets reste ce que les écrans lisent : chaque accord y pose ce que
// le gist porte, et y prend ce que le chef a changé ici. Le dossier d'un projet et son hôte n'en partent
// jamais. Le gist illisible — GitHub injoignable, un autre compte —, l'app montre le fichier tel qu'il est.
const preferences = holdPreferences({
  // Jamais posé hors des essais, comme pour les gists des stations.
  perso: settingsPerso({ gist: gistDesPreferences({ gh: process.env.BRIGADE_GH_BIN || "gh", delaiMs: 30_000 }), appJson: cheminConfiguration() }),
  fichier: { preferences: () => suivi.preferences(), poserPreferences: (voulues) => suivi.poserPreferences(voulues) },
  surPanne: (raison) => console.error(`brigade: your preferences were not synced with GitHub — ${raison}`),
});

// Le fichier des projets : créé s'il manque, relu dès qu'il change. Un projet
// qui a quitté la liste — ou changé de dossier — perd ses terminaux et sa mise
// en service ; les autres n'en savent rien.
const suivi = suivreConfiguration({
  chemin: cheminConfiguration(),
  surChangement: (configuration, partis) => {
    partis.forEach(services.oublier);
    tell("configuration", affichee(), partis.flatMap((name) => terminaux.quitter(name)));
    // Un clone de brigade a pu entrer dans la liste, ou en sortir.
    void retards.relire(true);
    // L'accueil a une ligne par projet du fichier, tel qu'il est maintenant.
    tellLHome(home.relire());
    // La barre des menus aussi — et le chef l'a peut-être allumée ou éteinte.
    poserLaBarDeMenus();
    // Le second de chaque projet qui s'ouvre est suivi dans son dossier tel qu'il est maintenant.
    propositionsDuSecond?.suivre(projects());
    // Un projet qui vient d'y entrer reçoit le plugin de l'app.
    void pluginApp.suivre(projects());
    // Un projet qui vient d'y entrer — ajouté depuis l'app, ou écrit à la main — reçoit ses
    // couleurs : écrites, elles reviennent ici par une relecture, qui n'a plus rien à tirer. Un
    // fichier qui n'a pas pu être relu attend de l'être : l'app n'y écrit rien.
    if (configuration.nonRelu === undefined && !configuration.projets.every(({ couleurs }) => entieres(couleurs))) colorer();
    // Ce que le chef vient de changer de ses préférences part dans son gist.
    preferences.signaler();
  },
});
// Les couleurs qui manquent aux projets, tirées et écrites dans le fichier (config.ts). Un fichier
// que l'app ne peut pas écrire garde ses projets sans couleur : la peau leur met la sienne.
function colorer(): void {
  const refusal = suivi.colorer();
  if (refusal !== undefined) console.error(`brigade: the project colors could not be written — ${refusal}`);
}
// Les projets tels que l'app les montre, et les lit : ceux du fichier. Un projet qu'une station sert ailleurs que
// sur cet ordinateur est lu du tableau de sa cuisine sur GitHub.
let dernierVuDesProjects: VuDesProjects | undefined;
const projects = () => suivi.configuration().projets;
const affichee = () => pourLaBar(suivi.configuration(), lisible, kitchens.ici, () => stationLocale?.tourne() === true, () => stationLocale?.redemarrage() ?? null);
// Un projet du fichier, qu'il s'ouvre ou non : sa cuisine se lit, et se vérifie, sans son dossier.
const connu = (name: unknown) => projects().find((candidat) => candidat.nom === name);
// Le même, tel que le fichier le déclare.
const declare = (name: unknown) => suivi.configuration().projets.find((candidat) => candidat.nom === name);
// Les projets du fichier reçoivent le plugin de l'app, à la version qu'elle porte : une app mise à jour le met à jour.
void pluginApp.suivre(projects());

// Le code de l'app vient d'un clone, et rien d'autre ne le surveille : son retard sur son
// origine est lu au démarrage, puis à chaque retour à la fenêtre — et celui du clone d'un
// projet, quand ce clone est celui de brigade (retard.ts). Lire n'écrit rien dans un clone :
// un `git` qui n'a rien rendu au bout de trente secondes est arrêté. L'app installée n'a pas
// de clone : rien ne s'en lit.
// Le dossier de l'app, dans son clone.
const dossierApp = join(import.meta.dirname, "..");
const retards = holdRetards({
  reglages: { git: "git", delaiMs: 30_000 },
  app: emplacements.clone,
  projets: projects,
  surLecture: (vu) => tell("code", vu),
});
// Les projets de ses stations, sous elles : ceux qu'il leur a ajoutés depuis l'app, écrits et relus
// dans le gist de chacune (projects/projects.ts) — relus à chaque lecture des stations.
let servedLus = "";
const projectsDesStations = holdProjects({
  github: githubDesStations({ gh: process.env.BRIGADE_GH_BIN || "gh", delaiMs: 30_000 }),
  stations: () => stations.vu()?.stations,
  depots: depotsDuChef({ gh: process.env.BRIGADE_GH_BIN || "gh", delaiMs: 30_000 }),
  // La station de cet ordinateur : c'est elle que la page d'un projet appelle « this computer ».
  locale: () => (role.role === "station" ? gistLocal(racineDeLaStation) : null),
  // Déménager une cuisine, c'est l'opération du runtime, lancée ici avec le répertoire de la station
  // de cet ordinateur (projects/demenagement.ts) : un téléphone, qui n'a pas de runtime, n'en lance aucune.
  ...(role.role === "station"
    ? {
        accepterSansBac: async (project: string, station: string) => {
          const { accepterSansBacASable: accepterSansSandbox } = (await import(pathToFileURL(join(emplacements.runtime, "src", "onboarding", "wait.ts")).href)) as typeof import("../../runtime/src/onboarding/attente.ts");
          accepterSansSandbox({ repertoireEtat: join(racineDeLaStation, "etat", project), station });
        },
      }
    : {}),
  // Lever le refus d'un projet : la demande part par le gist de sa principale, quelle qu'elle soit — c'est
  // l'opération du runtime qui l'écrit et attend la réponse (projects/remede.ts). Le runtime est à côté de
  // l'app, du dépôt comme du paquet (emplacements.ts).
  demanderLeRemede: async (request) => {
    const { demanderLeRemede } = (await import(pathToFileURL(join(emplacements.runtime, "src", "remedes", "distant.ts")).href)) as typeof import("../../runtime/src/remedes/distant.ts");
    return demanderLeRemede(request);
  },
  ...(role.role === "station" ? { demenager: demenageurDuRuntime({ node: emplacements.node, runtime: emplacements.runtime, racine: racineDeLaStation, env: process.env, delaiMs: 60_000 }) } : {}),
  // Le dépôt et la branche d'un projet, lus dans son clone sur cet ordinateur par l'opération du runtime (#1306) :
  // une station de plus les en prend quand la première ne les dit pas.
  leClone: async (name) => {
    const dossier = projects().find((project) => project.nom === name)?.dossier;
    if (dossier === undefined) return null;
    const { projetDuClone: projectDuClone } = (await import(pathToFileURL(join(emplacements.runtime, "src", "projets", "ajout-de-station.ts")).href)) as typeof import("../../runtime/src/projets/ajout-de-station.ts");
    const lu = await projectDuClone(dossier);
    return { depot: lu.depot, base: lu.base };
  },
  surLecture: (vu) => {
    dernierVuDesProjects = vu;
    tell("projetsDesStations", vu);
    tellLHome(home.projetsDesStations(vu));
    // Une station vient de dire qu'elle sert un projet de l'app : son rail se lit, et la vue le sait aussitôt.
    const servedOnes = JSON.stringify(vu.projets.map(({ nom: name }) => servedAilleurs(vu, name)));
    if (servedOnes === servedLus) return;
    servedLus = servedOnes;
    tell("configuration", affichee(), []);
    poserLaBarDeMenus();
    voir();
  },
});
// Les stations du chef, sur « Tous les projets » : celles qu'il a appairées, lues sur GitHub par
// le `gh` du poste toutes les trente secondes (stations/stations.ts). L'app ne joint aucune
// station : c'est GitHub qui porte ce que chacune dit d'elle.
const stations = holdStations({
  versions: versionsDansFichier(join(dirname(cheminConfiguration()), "versions-vues.json")),
  github: githubDesStations({ gh: process.env.BRIGADE_GH_BIN || "gh", delaiMs: 30_000 }),
  surLecture: (vu) => {
    tell("stations", vu);
    for (const bande of bandes.limite(vu.limite)) tellLaBande(bande);
    tellLHome(home.stations(vu));
    void projectsDesStations.relire();
    void holdCeQueFournitCetOrdinateur(vu);
  },
});
// Ce que la station de cet ordinateur fournit (stations/fournit.ts, #1757) : `macos` sur un Mac, et ce que
// le runtime détecte sur la machine — regardé une fois par lancement, sans rien y lancer. Son appairage le
// porte : écrit quand l'app l'appaire, et réécrit si une station appairée avant ne le dit pas.
let fournitIci: Promise<string[]> | undefined;
const ceQueFournitIci = () =>
  (fournitIci ??= (async () => {
    try {
      const { capacitesDeLaMachine: capacitiesDeLaMachine } = (await import(pathToFileURL(join(emplacements.runtime, "src", "projets", "ajout-de-station.ts")).href)) as typeof import("../../runtime/src/projets/ajout-de-station.ts");
      const { sondeDeLaMachine } = (await import(pathToFileURL(join(emplacements.runtime, "src", "installation", "besoins", "fourni.ts")).href)) as typeof import("../../runtime/src/installation/besoins/fourni.ts");
      return ceQueFournitCetOrdinateur(process.platform, capacitiesDeLaMachine(sondeDeLaMachine(process.env)));
    } catch (error) {
      console.error(`brigade: what this computer provides beyond its system could not be read — ${error instanceof Error ? error.message : String(error)}`);
      return ceQueFournitCetOrdinateur(process.platform, []);
    }
  })());
let fournitTenu = false;
async function holdCeQueFournitCetOrdinateur(vu: VuDesStations): Promise<void> {
  const ici = stationLocale === undefined ? null : gistLocal(racineDeLaStation);
  if (fournitTenu || ici === null || !vu.stations.some(({ id }) => id === ici)) return;
  fournitTenu = true;
  try {
    if (await stations.tenirCeQuElleFournit(ici, await ceQueFournitIci())) console.error("brigade: this computer's station now says on GitHub what it provides");
  } catch (error) {
    // Le gist n'a pas pu s'écrire : la lecture suivante réessaie.
    fournitTenu = false;
    console.error(`brigade: what this computer's station provides could not be written on GitHub — ${error instanceof Error ? error.message : String(error)}`);
  }
}
// L'écran du premier lancement avant l'avis de macOS (first-launch/, #4081) : sur un Mac neuf, inscrire la station à
// l'ouverture de session fait dire à macOS qu'un élément d'arrière-plan s'est ajouté. L'inscription attend que le nouvel
// arrivant ait vu l'écran qui le lui annonce et pressé son bouton ; la marque, à côté du fichier des projets, dit qu'il
// l'a vu, et l'écran ne revient plus.
const opinionDeBackground = holdLOpinionDeBackground(() => tell("avisDeFond"));
const marqueDeLOpinionDeBackground = join(dirname(cheminConfiguration()), "avis-de-fond-vu");
ipcMain.handle("avisDeFond", () => opinionDeBackground.attendu());
ipcMain.handle("continuerLePremierLancement", () => opinionDeBackground.continuer());
const apresLOpinionDeBackground = <T>(declencher: () => Promise<T>): Promise<T> =>
  passerLeFirstLaunch({ avis: opinionDeMacOS({ mac: estUnMac(plateforme), inscrite: stationDeBackgroundInstallee({ plateforme, maison: homedir(), localAppData: process.env.LOCALAPPDATA }) }), marque: marqueDeLOpinionDeBackground, afficher: opinionDeBackground.afficher, declencher, dire: (line) => console.error(line) });
// Sur un ordinateur, l'app est une station (`role`) : la station de la machine — la même que celle d'un serveur —, sous
// `station/` à côté du fichier des projets, tourne en fond, sans dépendre de l'app (station-background/, #3630). L'app
// installée l'inscrit à l'ouverture de session ; ouverte, elle la rejoint si elle tourne, la lance sinon, et l'appaire
// seule, par le geste du champ de la home. Ce que la station dit va à son journal (`station/fond.log`).
const stationLocale =
  role.role === "station" && !installeeAuLaunch
    ? holdLaStationDeBackground({
        racine: racineDeLaStation,
        inscrire: async () =>
          emplacements.facon === "installee"
            ? apresLOpinionDeBackground(() => inscrireLaStationDeBackground({ plateforme, maison: homedir(), localAppData: process.env.LOCALAPPDATA, uid: userInfo().uid, executer, node: emplacements.node, hote: HOTE, racine: racineDeLaStation, embarque: role.principal, chemin: process.env.PATH, binaire: process.execPath }))
            : { par: "aucune" },
        // Le `node` de `npm start`, ou celui du paquet de l'app installée : Electron n'en est pas un.
        lancer: () => lancerLeBackground({ node: emplacements.node, embarque: role.principal, racine: racineDeLaStation, env: process.env }),
        dire: (line) => console.error(line),
        appairer: async (code) => stations.appairer(code, await ceQueFournitIci()),
        // Lancée ou arrêtée : la page d'un projet qui cuit ici le dit, ou cesse de le dire.
        surChangement: () => tell("configuration", affichee(), []),
      })
    : undefined;
// Les pannes d'une station, sur sa ligne de la home : chacune a son bouton (outages/actions.ts). Le
// login ne part que pour la station de cet ordinateur, par le `claude` officiel (outages/login.ts).
// Sa fin part aussi à la vue : une ouverture de projet qu'il retenait, au premier lancement, repart (#4057).
const claudeIci = claudeDe(process.env);
const loginIci = holdLogin({
  claude: claudeIci,
  env: process.env,
  dire: (line) => console.error(line),
  apres: () => {
    void stations.relire();
    tell("loginClaude");
  },
});
const actionsDesOutages = { stations, stationLocale: () => (stationLocale === undefined ? null : gistLocal(racineDeLaStation)), login: loginIci };
if (role.role === "poste") console.error(`brigade: this app is a workstation, not a station — ${role.pourquoi}: it pilots, nothing cooks here`);
// Son propre code, l'app le met à jour au clic sur la ligne qui dit son retard : son clone
// avance, puis elle se relance — par `npm start` quand c'est par là qu'elle est partie, pour
// que son lancement pose ce que la nouvelle version demande (rattrapage.ts). Se fermer arrête
// les terminaux, comme quitter.
const passer = holdPassage({
  reglages: { git: "git", delaiMs: 60_000 },
  app: dossierApp,
  relancer: () => {
    app.relaunch(relanceDe(process.env, dossierApp));
    app.quit();
  },
});

// La vue nomme un projet ; seul un projet du fichier, et qui s'ouvre, a un espace.
function project(name: unknown): Project {
  const trouve = projects().find((candidat) => candidat.nom === name);
  if (trouve === undefined || trouve.refus !== undefined) throw new Error(`project without a space: ${String(name)}`);
  return trouve;
}

ipcMain.handle("demarrage", () => ({ poste: { nom: nameDuWorkstation(), mac: estUnMac(plateforme) }, configuration: affichee(), palette: PALETTE, exemple: EXEMPLE, onglets: ONGLETS, rubriques: RUBRIQUES, gestes: { allumage: ALLUMAGE, cuisine: KITCHEN_ACTIONS, directs: DIRECTS, confirmes: CONFIRMES, attente: ACTIONS_D_WAIT }, banniere: BANNIERE, calibrage: { modeles: MODELES, efforts: EFFORTS }, code: retards.vu(), stations: stations.vu(), projetsDesStations: projectsDesStations.vu(), accueil: home.vu(), miseAJour: update.vu() }));
// Les couleurs d'un projet : la vue nomme le projet, le rôle — onglet ou accent — et une couleur
// de la palette, par son nom, ou une couleur libre `#rrggbb` (couleurs.ts). Écrite, elle arrive par
// `surConfiguration`, avec ce qu'elle a de trop proche. Rend la raison, si elle ne l'a pas été.
ipcMain.handle("colorer", (_, name: unknown, role: unknown, couleur: unknown) => {
  const vise = declare(name);
  if (vise === undefined) return parti(name).refus;
  const voulue = choice(role, couleur);
  return "refus" in voulue ? voulue.refus : suivi.changerCouleur(vise.nom, voulue.role, voulue.valeur);
});
// L'état de la cuisine dans la barre des menus (bar-de-menus.ts) : allumé ou éteint, écrit dans le fichier des projets —
// il revient par `surConfiguration`, et l'icône se pose ou se retire. Rend la raison, si rien n'a été écrit.
ipcMain.handle("changerBarreDeMenus", (_, actif: unknown) => suivi.changerBarreDeMenus(actif));
// Le sigle d'un projet, celui de sa case dans la barre (sigle.ts) : la vue nomme le projet et le sigle que le
// chef a écrit — `null`, il le rend à celui que l'app tire de son nom. Écrit, il arrive par `surConfiguration`.
// Rend la raison, s'il ne l'a pas été.
ipcMain.handle("changerSigle", (_, name: unknown, sigle: unknown) => {
  const vise = declare(name);
  return vise === undefined ? parti(name).refus : suivi.changerSigle(vise.nom, sigle);
});
// Les tickets ordinaires de cet ordinateur (ordinaires.ts) : le bloc que la vue pose pour un projet —
// rien, quand le projet ne cuit pas sur ce poste ; hors d'un Mac, pourquoi il n'en prend pas —, et le réglage, que la vue nomme et que le fichier écrit.
// Écrit, il arrive par `surConfiguration`. Le réglage rend la raison, s'il ne l'a pas été.
ipcMain.handle("ordinaires", (_, name: unknown) => {
  const vise = declare(name);
  return vise === undefined ? undefined : blocDesOrdinaires(vise, plateforme, facts.stations(vise.nom), kitchens.ici(vise.nom));
});
ipcMain.handle("reglerOrdinaires", (_, name: unknown, actif: unknown, limit: unknown) => {
  const vise = declare(name);
  return vise === undefined ? parti(name).refus : suivi.changerOrdinaires(vise.nom, actif, limit);
});
// L'ordre des projets : la vue nomme le projet glissé dans la barre et la place où il a été lâché.
// C'est l'ordre du fichier qui change (config.ts) : rangé, il arrive par `surConfiguration` — la
// barre et « Tous les projets » le prennent alors. Rend la raison, s'il ne l'a pas été.
ipcMain.handle("ranger", (_, name: unknown, rang: unknown) => {
  const vise = declare(name);
  if (vise === undefined) return parti(name).refus;
  return typeof rang === "number" ? suivi.ranger(vise.nom, rang) : `nothing was done: “${String(rang)}” is not a place in the bar`;
});
// L'installation guidée : la vue nomme le projet et le geste, ce qu'il en advient se décide
// dans service.ts — les étapes lues sur la box, la session `/brigade:init` dans le second,
// chaque étape faite par la commande du runtime qui la fait, et le démarrage, écrit dans un
// shell et refusé tant que la box n'a pas terminé l'installation. Ce qui change arrive par `surGuide`.
const parti = (name: unknown) => ({ refus: `nothing was done: “${String(name)}” is no longer in the projects file` });
ipcMain.handle("service", (_, name: unknown) => {
  const vise = connu(name);
  return vise === undefined ? undefined : services.guide(vise);
});
ipcMain.handle("deplierService", (_, name: unknown) => {
  const vise = connu(name);
  return vise === undefined ? undefined : services.deplier(vise);
});
ipcMain.handle("amorcer", (_, name: unknown) => {
  const vise = connu(name);
  return vise === undefined ? parti(name) : services.amorcer(vise);
});
ipcMain.handle("direMerge", (_, name: unknown, merge: unknown) => {
  const vise = connu(name);
  return vise === undefined ? parti(name) : services.direMerge(vise, merge === true);
});
ipcMain.handle("verifier", (_, name: unknown) => {
  const vise = connu(name);
  return vise === undefined ? parti(name) : services.verifier(vise);
});
ipcMain.handle("declarerStations", (_, name: unknown, choice: unknown) => {
  const vise = connu(name);
  return vise === undefined ? parti(name) : services.declarerStations(vise, choice);
});
// Une station déclarée, changée seule depuis l'onglet Stations (#1510) : son plafond, ses capacités, ce poste qui la joue,
// ou son retrait (service.ts, `changerUneStation`).
ipcMain.handle("changerUneStation", (_, name: unknown, station: unknown, voulu: unknown) => {
  const vise = connu(name);
  return vise === undefined ? parti(name) : services.changerUneStation(vise, station, voulu);
});
ipcMain.handle("proteger", (_, name: unknown) => {
  const vise = connu(name);
  return vise === undefined ? parti(name) : services.proteger(vise);
});
ipcMain.handle("repondre", (_, name: unknown, valeurs: unknown) => {
  const vise = connu(name);
  return vise === undefined ? parti(name) : services.repondre(vise, valeurs);
});
ipcMain.handle("passerDecisions", (_, name: unknown) => {
  const vise = connu(name);
  return vise === undefined ? parti(name) : services.passerDecisions(vise);
});
ipcMain.handle("demarrer", (_, name: unknown) => {
  const vise = connu(name);
  return vise === undefined ? parti(name) : services.demarrer(vise);
});
// Retirer un projet : la vue nomme le projet, ce qu'il en advient se décide dans retrait.ts. « Retirer de l'app »
// n'écrit que le fichier des projets — rien ne part vers sa station.
ipcMain.handle("retrait", (_, name: unknown) => {
  const vise = declare(name);
  return vise === undefined ? undefined : retraits.etat(vise);
});
ipcMain.handle("retirerDeLApp", (_, name: unknown) => {
  const vise = declare(name);
  return vise === undefined ? parti(name) : retraits.retirerDeLApp(vise);
});
ipcMain.handle("espace", (_, name: unknown) => terminaux.espace(project(name)));
// La vue s'est rechargée (Cmd+R, #3159) : les pty sont restés ici, elle retrouve chacun, avec ce qu'il avait écrit.
ipcMain.handle("terminauxOuverts", () => terminaux.ouverts());
// « + shell » : les machines où ouvrir un shell (machines.ts) — ce poste. La vue n'en reçoit que l'identifiant et le titre.
const machinesDuProject = (vise: Project) => machinesDe();
ipcMain.handle("machines", (_, name: unknown) => machinesDuProject(project(name)).map(({ id, titre }) => ({ id, titre })));
// La vue rend la machine choisie, par son identifiant : le shell s'y ouvre dans une session neuve,
// que l'app retient. Une machine qui n'est plus proposée n'ouvre rien.
ipcMain.handle("shell", (_, name: unknown, machine: unknown) => {
  const vise = project(name);
  const choisie = machineChoisie(machinesDuProject(vise), machine);
  return choisie === undefined ? { refus: `nothing was opened: “${String(machine)}” is not among the machines this project offers any more` } : terminaux.ouvrir(vise, choisie.cible);
});
// Fermer un shell pour de bon : il quitte l'espace, et sa session est détruite sur sa machine.
ipcMain.handle("fermerShell", (_, id: unknown) => (typeof id === "number" ? terminaux.fermerShell(id) : { refus: "nothing was closed: no shell is named" }));
// Une carte de T'attend : une demande en prose est écrite dans le second, qui est affiché, et rien
// ne l'envoie. La vue nomme le projet et le ticket ; la phrase se compose ici (request.ts) de ce que
// le bloc `attend` en dit — jamais d'un texte venu de la vue. Rien pour un ticket que le bloc ne nomme pas.
// Depuis la fiche d'un ticket qui ne t'attend pas (#639), la phrase se compose de ce que les
// derniers faits en donnent — son mot d'état, son titre —, ou, d'une issue à venir, de son seul
// numéro. Rien pour un ticket qu'aucune lecture ne porte.
ipcMain.handle("demander", (_, name: unknown, ticket: unknown) => {
  const vise = project(name);
  if (typeof ticket !== "number") return undefined;
  const dit = facts.attendu(vise.nom, ticket);
  const donne = dit === undefined ? (facts.ticket(vise.nom, ticket) ?? (amonts.adresse(vise.nom, ticket) === undefined ? undefined : {})) : undefined;
  if (dit === undefined && donne === undefined) return undefined;
  const ecrit = dit !== undefined ? requestDe(vise.nom, ticket, dit.lignes, dit.titre) : requestSurLeTicket(vise.nom, ticket, donne?.etat, donne?.titre);
  return "refus" in ecrit ? ecrit : terminaux.inscrire(vise, ecrit.demande, noteDeLaRequest);
});
// Les gestes de la fiche d'un ticket, à cet instant (card-actions.ts) : d'après la carte cliquée,
// ceux qui tranchent ce qu'on attend du chef, puis ceux que la table du chef permet pour son état,
// dont l'action est branchée, chacun avec son prix.
ipcMain.handle("gestesDeFiche", (_, card: unknown) => actionsDeCard(card));
// Un geste de la fiche que la vue ne joue pas elle-même. Changer la priorité remplace le label `prio:`
// de l'issue sur GitHub (priority.ts, #1739), par le jeton du `gh` de ce poste — ni box : fait, le rail
// montre aussitôt la nouvelle priorité, jusqu'à ce que sa lecture la montre. Retirer le ticket du rail et
// renvoyer en cuisine un ticket revenu de WAITING retirent de son issue `fire` ou `waiting`, par le même
// jeton (actions-github.ts, #2061) ; le rail, relu de GitHub, le montre. Merger la livraison se fait sur sa
// PR, sur GitHub : rien ne part de l'app. La vue nomme le geste, le ticket et la valeur ; ce qui part se compose ici,
// jamais dans la vue.
ipcMain.handle("gesteDeFiche", async (_, name: unknown, id: unknown, ticket: unknown, valeur: unknown) => {
  const vise = connu(name);
  if (vise === undefined) return parti(name);
  if (id === "priorite") {
    if (facts.ticket(vise.nom, ticket)?.etat === undefined) return { refus: `nothing was changed: #${String(ticket)} is not on the latest rail read — read it again`, detail: "" };
    const rendu = await changerLaPriority({ depot: await repositoryDuProject(vise), ticket, valeur, client: clientDesLabels });
    if (!("fait" in rendu)) return rendu;
    prioritesEcrites.ecrite(vise.nom, ticket as number, rendu.niveau, rendu.avant);
    redessinerRail(vise.nom);
    return { fait: rendu.fait, detail: rendu.detail };
  }
  if (!surGithub(id)) return { refus: `nothing was done: “${String(id)}” is not a gesture the app plays here`, detail: "" };
  const rendu = await retirerLeLabel(tableaux.dernier(vise.nom), id, ticket, clientDesLabels);
  if ("fait" in rendu) tableaux.oublier();
  return rendu;
});
// Le départ d'un projet qu'« Add a project » vient d'ouvrir (ticket 3268, depart-du-project.ts) : ses issues ouvertes lues sur
// GitHub, triées par le second (son triage, `claude -p`), puis les lignes que le chef garde mises sur le rail — `product`,
// `prio:<n>` et `fire` —, par le jeton du `gh` de ce poste.
ipcMain.handle("departDuProjet", async (_, name: unknown) => {
  const vise = connu(name);
  if (vise === undefined) return { sans: `${String(name)} is no longer in the projects file` };
  return proposerLeDepart({ depot: await repositoryDuProject(vise), dossier: vise.dossier, lire: appelerGitHub, claude: process.env.BRIGADE_CLAUDE_BIN || "claude" });
});
ipcMain.handle("mettreSurLeRail", async (_, name: unknown, lines: unknown) => {
  const vise = connu(name);
  if (vise === undefined) return parti(name);
  return mettreSurLeRail({ depot: await repositoryDuProject(vise), lignes: lines, client: clientDesLabels });
});
// Le premier ticket d'un projet prêt (ticket 3306, runtime/src/premier-ticket/) : le second l'écrit d'après la réponse du chef,
// par `claude -p` lancé comme son triage (`lancerLeTriage`) — rien n'est créé ; sur le « oui » du chef seul, l'issue est créée
// avec ses labels, `fire` compris, par le `gh` de ce poste.
const firstTicket = () => duRuntime<typeof import("../../runtime/src/premier-ticket/premier-ticket.ts")>("premier-ticket", "premier-ticket.ts");
ipcMain.handle("redigerLePremierTicket", async (_, name: unknown, request: unknown) => {
  const vise = connu(name);
  if (vise === undefined) return { refus: `${String(name)} is no longer in the projects file`, detail: "" };
  return (await firstTicket()).rediger({ depot: await repositoryDuProject(vise), dossier: vise.dossier, demande: request, claude: process.env.BRIGADE_CLAUDE_BIN || "claude", lancer: lancerLeTriage });
});
ipcMain.handle("creerLePremierTicket", async (_, name: unknown, brouillon: unknown) => {
  const vise = connu(name);
  if (vise === undefined) return { refus: `nothing was created: ${String(name)} is no longer in the projects file`, detail: "" };
  const { clientGh } = await duRuntime<typeof import("../../runtime/src/proteger-branche.ts")>("proteger-branche.ts");
  return (await firstTicket()).creer(clientGh(ghIci, process.env), await repositoryDuProject(vise), brouillon);
});
// Un geste d'une carte que la station a mise de côté (ticket 3147) : « Relaunch » retire `served-elsewhere` de l'issue,
// « Close as already done » la ferme comme terminée — chacun par l'accès GitHub de l'app (actions-refusal.ts). « Ask the second »
// passe par `passerAuSecond`, plus haut.
ipcMain.handle("refus", async (_, name: unknown, id: unknown, ticket: unknown) => {
  const vise = connu(name);
  if (vise === undefined) return parti(name);
  const rendu = await jouerLeRefusal(tableaux.dernier(vise.nom), id, ticket, clientDesLabels);
  if ("fait" in rendu) tableaux.oublier();
  return rendu;
});
// La question qu'une carte de T'attend pose, telle qu'elle est écrite sur son issue (question.ts) :
// l'issue est lue par le `gh` du poste — celui du chef —, à l'ouverture de sa fiche. La vue nomme le
// projet et le ticket ; l'adresse est celle que la box a rendue (facts.ts). Rien pour un ticket que
// le bloc `attend` ne nomme pas : seule une entrée qui t'attend se lit ainsi.
const settingsGh = () => ({ gh: process.env.BRIGADE_GH_BIN || "gh", delaiMs: 30_000 });
// Ce que chaque lecture de l'issue dit de sa question est retenu (repondues.ts) : répondue, sa carte
// quitte TODO ; plus répondue — une autre question —, elle y revient. Le rail est redessiné aussitôt.
function retenirLue(project: string, ticket: unknown, lue: QuestionLue): QuestionLue {
  if (repondues.lue(project, ticket, lue)) redessinerRail(project);
  return lue;
}
function redessinerRail(project: string): void {
  const redessine = facts.redessiner(project);
  if (redessine !== undefined) tellLesFacts(redessine);
}
// Une carte répondue attend le manager tant que la file la nomme : son issue est relue au plus toutes
// les deux minutes — c'est là que se voit une autre question. Ce que la file ne nomme plus est lâché.
function relireRepondues(project: string): void {
  for (const ticket of repondues.garder(project, facts.nommes(project))) {
    const adresse = facts.adresse(project, ticket);
    if (adresse !== undefined) void lireQuestion(settingsGh(), adresse).then((lue) => retenirLue(project, ticket, lue));
  }
}
ipcMain.handle("lireQuestion", (_, name: unknown, ticket: unknown) => {
  const vise = connu(name);
  if (vise === undefined || facts.attendu(vise.nom, ticket) === undefined) return undefined;
  const adresse = facts.adresse(vise.nom, ticket);
  return adresse === undefined ? { a: new Date().toISOString(), sans: "the station gave no https address for this issue: the app has nothing to read" } : lireQuestion(settingsGh(), adresse).then((lue) => retenirLue(vise.nom, ticket, lue));
});
// L'histoire d'un ticket, sur sa fiche : lue de GitHub par le `gh` du poste (card-github.ts), jamais de la
// box — le coût et la rétro que seul son journal porte sont dits non communiqués. La vue nomme le projet et le ticket.
ipcMain.handle("situation", (_, card: unknown) => situationDe(card));
ipcMain.handle("lireHistoire", async (_, name: unknown, ticket: unknown) => {
  const vise = connu(name);
  return vise === undefined ? undefined : histoireDeGitHub(settingsGh(), await repositoryDuProject(vise), ticket);
});
// L'issue d'un ticket et sa discussion, sur la fiche de toute carte : lues de GitHub par le `gh` du poste
// (card-github.ts), le markdown rendu. Les adresses qu'elle montre sont gardées ici : un clic de la vue n'ouvre
// que l'une d'elles, jamais une adresse qu'elle aurait composée.
// Le commentaire du chef part sur l'issue du ticket, au clic, par le jeton du `gh` de ce poste (actions-github.ts) : la
// vue nomme le projet, le ticket et le texte ; le geste se compose ici (discussion.ts).
const liensLus = new LiensLus();
ipcMain.handle("lireDiscussion", async (_, name: unknown, ticket: unknown) => {
  const vise = connu(name);
  if (vise === undefined) return undefined;
  const lue = await discussionDeGitHub(settingsGh(), await repositoryDuProject(vise), ticket);
  if (!("sans" in lue)) liensLus.discussion(`${vise.nom}#${String(ticket)}`, lue.liens);
  return lue;
});
// Les chiffres d'autonomie d'un projet, ou de tous ceux que la vue nomme (vue/autonomy/autonomy-github.ts, #3222) : lus
// de GitHub par le jeton du `gh` de ce poste, sous le même budget et les mêmes lectures conditionnelles que le rail, chaque
// dépôt gardé dix minutes, ses issues déjà lues gardées au-delà (#3379). Un clic de la vue n'ouvre que l'adresse d'un ticket qu'une de ces lectures a rendue.
const autonomy = holdLAutonomy({
  lire: (repository, lues) => lireLAutonomyDuRepository({ depot: repository, appeler: readConditionnelle(appelerSousBudget, memoireDuRail(repository)), maintenant: new Date(), lues }),
  fraicheurMs: 10 * 60_000,
});
const liensDAutonomy = new Set<string>();
ipcMain.handle("lireAutonomie", async (_, noms: unknown, jours: unknown) => {
  const vises = (Array.isArray(noms) ? noms : []).flatMap((name) => connu(name) ?? []);
  const lue = await autonomy.chiffres(await Promise.all(vises.map(async (project) => ({ nom: project.nom, depot: await repositoryDuProject(project) }))), Number(jours));
  if ("chiffres" in lue) for (const { url } of lue.chiffres.avecHumain) liensDAutonomy.add(url);
  return lue;
});
ipcMain.handle("ouvrirTicketDAutonomie", (_, url: unknown) => {
  if (typeof url !== "string" || !liensDAutonomy.has(url)) return false;
  return shell.openExternal(url).then(
    () => true,
    () => false,
  );
});
ipcMain.handle("commenter", (_, name: unknown, ticket: unknown, texte: unknown) => {
  const vise = connu(name);
  if (vise === undefined) return { poste: false, refus: `nothing was posted: “${String(name)}” is no longer in the projects file` };
  return commenter(async (numero, comment) => commenterLIssue(await repositoryDuProject(vise), numero, comment, clientDesLabels), vise, ticket, texte);
});
// « ask the second », au clic : `/brigade:ask <ticket> ` est écrit dans le second du projet, sans Entrée — le chef tape
// sa question à la suite (discussion.ts). Rien ne part sur le tableau ni sur la box, quelle que soit la station du
// projet. Le contexte que la vue passe encore n'est pas lu.
ipcMain.handle("demanderAuSecond", (_, name: unknown, ticket: unknown) => {
  const vise = connu(name);
  return vise === undefined ? { refus: parti(name).refus } : demanderAuSecond((command) => terminaux.inscrire(vise, command, noteDeLaQuestion), vise, ticket);
});
// « ask the second », sur une carte de TODO (ticket 3133) : la carte passée au second — son numéro, sa question, ce que
// son issue dit, lue de GitHub par le poste —, écrite dans le second du projet sans Entrée (passation-second.ts).
ipcMain.handle("passerAuSecond", (_, name: unknown, ticket: unknown, question: unknown) => {
  const vise = connu(name);
  if (vise === undefined) return { refus: parti(name).refus };
  const lire = async (numero: number) => discussionDeGitHub(settingsGh(), await repositoryDuProject(vise), numero);
  return passerAuSecond((message) => terminaux.inscrire(vise, message, noteDeLaPassation), lire, vise, ticket, question);
});
// Essayer une livraison depuis sa carte (trial.ts, #3215) : son worktree vit sous le dossier de l'app, jamais dans la copie
// de travail du projet. Chaque changement d'un essai est redit à la vue, qui relit.
const essais = holdLesEssais({
  dossierDonnees: dirname(cheminConfiguration()),
  ouvrir: (url) => void shell.openExternal(url).catch(() => undefined),
  surChangement: (project) => tell("essais", project),
});
ipcMain.handle("essais", (_, name: unknown) => {
  const vise = connu(name);
  return vise === undefined ? undefined : essais.vu(vise.dossier, vise.nom);
});
ipcMain.handle("essayer", async (_, name: unknown, ticket: unknown) => {
  const vise = connu(name);
  if (vise !== undefined && typeof ticket === "number" && Number.isInteger(ticket)) await essais.essayer(vise.dossier, vise.nom, ticket);
});
ipcMain.handle("arreterEssai", async (_, name: unknown, ticket: unknown) => {
  const vise = connu(name);
  if (vise !== undefined && typeof ticket === "number") await essais.arreter(vise.nom, ticket);
});
app.on("before-quit", () => void essais.toutArreter());
ipcMain.handle("ouvrirLien", (_, name: unknown, ticket: unknown, url: unknown) => {
  if (typeof url !== "string" || !liensLus.connait(`${String(name)}#${String(ticket)}`, url) || !/^https?:$/.test(URL.parse(url)?.protocol ?? "")) return false;
  return shell.openExternal(url).then(
    () => true,
    () => false,
  );
});
// Une capture d'un ticket d'interface, sur sa carte (captures.ts) : lue par le `gh` du poste à
// l'adresse que la box a rendue dans `facts`, et rendue à la vue en `data:`. La vue nomme le
// projet, le ticket, l'écran et le moment ; l'adresse ne quitte pas le process principal.
ipcMain.handle("lireCapture", (_, name: unknown, ticket: unknown, screen: unknown, moment: unknown) => {
  const vise = connu(name);
  if (vise === undefined) return undefined;
  const adresse = facts.capture(vise.nom, ticket, screen, moment);
  if (adresse === undefined) return { sans: "the station gave no address for this screenshot: the app has nothing to read" };
  return lireCapture(settingsGh(), adresse).then((lue) => {
    // Le lien d'une capture qui ne se lit pas : la vue ne l'ouvre que par `ouvrirLien`, qui ne connaît que ce qu'une lecture a rendu.
    if ("sans" in lue && lue.lien !== undefined) {
      liensLus.capture(`${vise.nom}#${String(ticket)}`, lue.lien);
    }
    return lue;
  });
});
// Le titre d'une issue que la box ne donne pas (hors rail) : lu par le `gh` du poste, à l'adresse que
// la box a rendue pour ce ticket — jamais une adresse venue de la vue.
ipcMain.handle("lireTitre", (_, name: unknown, ticket: unknown) => {
  const vise = connu(name);
  if (vise === undefined) return undefined;
  const adresse = facts.adresse(vise.nom, ticket);
  return adresse === undefined ? { sans: "the station gave no https address for this issue: the app has nothing to read" } : titreDe(settingsGh(), adresse);
});
// La réponse du chef à cette question : un choix, par sa lettre, ou sa phrase. Elle part sur
// l'issue, en commentaire, par le même `gh` — à son nom. L'issue est relue avant : rien ne part sur
// une question qui n'est plus celle qu'il a lue, ni pour un ticket que la file ne nomme plus.
// Partie, la carte quitte TODO aussitôt (repondues.ts) : elle attend le manager dans WAITING.
ipcMain.handle("repondreQuestion", async (_, name: unknown, ticket: unknown, answer: unknown) => {
  const vise = connu(name);
  if (vise === undefined) return { poste: false, refus: parti(name).refus };
  if (facts.attendu(vise.nom, ticket) === undefined) return { poste: false, refus: `nothing was posted: the \`attend\` block no longer names #${String(ticket)}` };
  const adresse = facts.adresse(vise.nom, ticket);
  if (adresse === undefined) return { poste: false, refus: "nothing was posted: the station gave no https address for this issue" };
  const rendue = await repondreQuestion(settingsGh(), adresse, answer);
  const question = (answer as { question?: unknown } | null)?.question;
  if (rendue.poste && typeof question === "string") {
    if (repondues.postee(vise.nom, ticket, question)) redessinerRail(vise.nom);
  } else if (!rendue.poste && rendue.lue !== undefined) retenirLue(vise.nom, ticket, rendue.lue);
  return rendue;
});
// Une ligne de la bande d'alertes dont le geste demande de lire, de juger ou d'agir hors de
// l'app : une demande en prose est écrite dans le second, et rien ne l'envoie. La vue nomme la
// ligne, par son sujet et ce qu'elle dit ; la phrase se compose ici (request.ts) de ce que la
// bande en dit maintenant — jamais d'un texte venu de la vue. Rien pour une ligne qu'elle ne dit plus.
ipcMain.handle("demanderAlerte", (_, name: unknown, sujet: unknown, dit: unknown) => {
  const vise = project(name);
  const alert = bandes.alerte(vise.nom, sujet, dit);
  if (alert?.appel === undefined || !("demande" in alert.appel)) return undefined;
  const ecrit = requestDeLAlert(vise.nom, alert);
  return "refus" in ecrit ? ecrit : terminaux.inscrire(vise, ecrit.demande, noteDeLaRequest);
});
// Un geste : sa commande part dans le second du projet, qui est rendu — sa note dit ce qui est
// parti, ou le refus dit pourquoi rien ne l'est, quand le second n'est pas dit libre. La vue nomme
// le geste ; ce qui part se décide dans gestes.ts. Rien, pour un projet sans box. Un geste confirmé ne part qu'avec le « oui » du chef, que la
// vue ne passe qu'une fois sa confirmation montrée : sans lui, rien n'est écrit.
ipcMain.handle("geste", (_, name: unknown, id: unknown, oui: unknown) => {
  const vise = connu(name);
  return vise === undefined ? parti(name) : ecrireAction(terminaux, id, vise, oui, kitchens.cuisineDe(vise));
});
// Un geste de WAITING, sur une carte du rail ou sa fiche : il s'écrit sur l'issue, jamais par une commande de la box —
// parqué ou déparqué comme le second le fait (vue/wait/wait-github.ts, #3075, #4262). La vue nomme le geste et le
// ticket, et donne ce que le chef a rempli.
ipcMain.handle("attente", async (_, name: unknown, id: unknown, ticket: unknown, saisie: unknown) => {
  const vise = connu(name);
  if (vise === undefined) return parti(name);
  const aujourdhui = new Date();
  const rendu = await jouerLWait({ id, ticket, saisie, aujourdhui, lu: () => tableaux.dernier(vise.nom), client: clientDesLabels });
  if ("fait" in rendu) tableaux.oublier();
  return rendu;
});
// Ce qu'un geste confirmé coûte, dit avant son « oui » (confirmation.ts) : tiré des derniers faits
// lus du projet — les cooks en cours, le rail. Rien ne part, rien
// n'est lu de plus. Rien, pour un geste qui ne se confirme pas.
ipcMain.handle("confirmer", (_, name: unknown, id: unknown) => {
  const vise = connu(name);
  if (vise === undefined) return parti(name);
  return confirmationDe(id, vise, facts.dernier(vise.nom) ?? { sans: "`facts` has not been read yet for this project, or its last read did not return the expected shape" }, kitchens.cuisineDe(vise));
});
// Le code qu'une station affiche, tapé par le chef : la station qui le publie sur GitHub est
// appairée — ou le refus dit en une ligne pourquoi rien ne l'est (stations/stations.ts).
ipcMain.handle("appairer", (_, code: unknown) => stations.appairer(code));
// « Add a project » : les dépôts du chef, lus par le `gh` du poste, entre lesquels il choisit.
ipcMain.handle("depotsDuChef", () => projectsDesStations.depots());
// Un dépôt quelconque, lu par son nom — public et pas au chef compris : sa branche par défaut, ou le refus.
const lireLeRepository = lireUnRepository({ gh: process.env.BRIGADE_GH_BIN || "gh", delaiMs: 30_000 });
ipcMain.handle("lireUnDepot", (_, repository: unknown) => lireLeRepository(repository));
// Le parcours validé : la demande s'écrit dans le gist de chaque station choisie — ou chaque champ
// qui manque est signalé, et rien n'est écrit (projects/projects.ts).
ipcMain.handle("ajouterAUneStation", (_, saisie: unknown) => projectsDesStations.ajouter(saisie));
// La page d'un projet de l'app confie sa cuisine à une première station, ou à une de plus : c'est le
// seul geste qui l'installe sur une station (projects/projects.ts, `confier`).
ipcMain.handle("confierAUneStation", (_, saisie: unknown) => projectsDesStations.confier(saisie));
// Ce que le formulaire d'ajout d'une station montre d'emblée pour cet ordinateur (#1307) : l'opération du runtime
// (#1306) le calcule sur cette machine — ses cœurs, le répertoire de sa station, ce qu'elle a —, sans rien y lancer.
ipcMain.handle("defautsDeStation", async (_, name: unknown): Promise<DefautsDeLaMachine> => {
  const dossier = projects().find((project) => project.nom === name)?.dossier;
  if (dossier === undefined) return { refus: "this computer could not be read", detail: `${String(name)} is not in this app's projects file` };
  try {
    const { defautsDeStation } = (await import(pathToFileURL(join(emplacements.runtime, "src", "projets", "ajout-de-station.ts")).href)) as typeof import("../../runtime/src/projets/ajout-de-station.ts");
    const { cooks, cooksDit, espaceDeTravail: spaceDeTravail, capacites: capacities } = await defautsDeStation({ dossier, racine: racineDeLaStation, env: process.env });
    return { cooks, cooksDit, espaceDeTravail: spaceDeTravail, capacites: capacities };
  } catch (error) {
    return { refus: "this computer could not be read", detail: error instanceof Error ? error.message : String(error) };
  }
});
// Les dossiers de la station de cet ordinateur pour un projet (#2489) : où elle garde son clone, où elle pose les
// worktrees de ses cooks — l'opération du runtime les calcule (`lieuxDuProjet`), sans rien y lancer. Elle les choisit
// elle-même : ils se lisent, ils ne se changent pas. Un téléphone n'a pas de station.
ipcMain.handle("dossiersDeLaStation", async (_, name: unknown): Promise<DossiersDeLaStation> => {
  if (role.role !== "station") return { refus: "this device runs no station" };
  if (typeof name !== "string" || name === "") return { refus: "its folders could not be read", detail: `${String(name)} is not a project name` };
  try {
    const { lieuxDuProjet: lieuxDuProject } = (await import(pathToFileURL(join(emplacements.runtime, "src", "station", "configuration.ts")).href)) as typeof import("../../runtime/src/station/configuration.ts");
    const { clone, worktrees } = lieuxDuProject(racineDeLaStation, name, process.env.HOME);
    return { clone, worktrees };
  } catch (error) {
    return { refus: "its folders could not be read", detail: error instanceof Error ? error.message : String(error) };
  }
});
// Les dossiers et la porte réseau de la station de cet ordinateur, changés depuis sa page (#2644) : lus et écrits dans un
// fichier de cette machine (settings-de-la-station.ts). Un téléphone n'a pas de station.
const fichierDesSettingsDeLaStation = join(dirname(cheminConfiguration()), "station-reglages.json");
// Le bac à sable est « off » dès qu'un projet cuisiné ici a reçu « continuer sans » (suivi publié par la principale).
const sansSandbox = () => (projectsDesStations.vu()?.projets ?? []).some((project) => project.onboarding?.sansBacASable === true && project.suiviPar?.id === projectsDesStations.vu()?.locale);
ipcMain.handle("reglagesDeLaStation:lire", async () => {
  if (role.role !== "station") return { refus: "this device runs no station" };
  try {
    const { lieuxDuProjet: lieuxDuProject, worktreesDeLaStation } = (await import(pathToFileURL(join(emplacements.runtime, "src", "station", "configuration.ts")).href)) as typeof import("../../runtime/src/station/configuration.ts");
    return lireLesSettingsDeStation(fichierDesSettingsDeLaStation, { clone: dirname(lieuxDuProject(racineDeLaStation, "x", process.env.HOME).clone), worktrees: worktreesDeLaStation(racineDeLaStation, process.env.HOME) }, sansSandbox());
  } catch (error) {
    return { refus: "its folders could not be read", detail: error instanceof Error ? error.message : String(error) };
  }
});
ipcMain.handle("reglagesDeLaStation:ecrire", (_, changement: unknown) =>
  role.role !== "station" ? { refus: "this device runs no station" } : ecrireSettingsDeLaStation(fichierDesSettingsDeLaStation, typeof changement === "object" && changement !== null ? (changement as Changement) : {}),
);
// Retiré, le projet quitte la demande de chacune de ses stations : elles le retirent de leur configuration.
ipcMain.handle("retirerDUneStation", (_, name: unknown) => projectsDesStations.retirer(name));
// La page d'un projet déménage sa cuisine, d'un geste, vers une autre station appairée — cet
// ordinateur, sa box, une autre : l'opération du runtime l'écrit, ou dit en une phrase pourquoi non.
// « Continue without sandbox » (#1113) : la décision du chef se note par la fonction du runtime, dans l'état
// du projet sur la station de cet ordinateur.
ipcMain.handle("continuerSansBacASable", (_, name: unknown) => projectsDesStations.continuerSansBac(name));
// Le bouton du refus d'un projet (#1205) : sa principale joue le remède que le refus offre, puis dit s'il
// tient (projects/projects.ts, `remedier`).
ipcMain.handle("leverLeRefus", (_, name: unknown, refusal: unknown, remede: unknown) => projectsDesStations.remedier(name, refusal, remede));
// Une issue d'un choix, sur la carte d'un besoin qui manque (#1400) : elle s'écrit dans la demande de la principale,
// qui la pose à son journal (projects/projects.ts, `choisir`).
ipcMain.handle("choisirUneIssue", (_, name: unknown, choice: unknown, issue: unknown) => projectsDesStations.choisir(name, choice, issue));
ipcMain.handle("demenagerLaCuisine", (_, name: unknown, vers: unknown) => projectsDesStations.demenager(name, vers));
// La page GitHub où autoriser brigade sur un dépôt : seulement une de celles qu'une station a publiées.
ipcMain.handle("autoriserSurGitHub", (_, url: unknown) => {
  if (typeof url !== "string" || !projectsDesStations.pages().includes(url)) return false;
  return shell.openExternal(url).then(
    () => true,
    () => false,
  );
});
// « Retirer la station » : son appairage quitte son gist, elle disparaît de l'accueil.
ipcMain.handle("retirerLaStation", (_, id: unknown) => stations.retirer(id));
// Le premier lancement, sur un ordinateur neuf (first-launch.ts, #1434) : les stations du chef et leurs
// projets, lus par l'opération du runtime (#1428) ; un projet ouvert d'un clic, sa copie reprise ou clonée par
// celle du runtime (#1429) — chaque étape part à la vue —, puis ajouté au fichier des projets ; la connexion à
// GitHub, par le geste que le runtime nomme (connection-github.ts). Le runtime est à côté de l'app, du dépôt comme
// du paquet (emplacements.ts).
const ghIci = process.env.BRIGADE_GH_BIN || "gh";
const duRuntime = <M>(...chemin: string[]) => import(pathToFileURL(join(emplacements.runtime, "src", ...chemin)).href) as Promise<M>;
// La veille de la station de cet ordinateur (#3642) : garde-t-elle ce Mac éveillé, dit à la vue quand cela change.
const standbyMachine =
  role.role === "station"
    ? suivreLaStandby({
        lire: async () => (await duRuntime<typeof import("../../runtime/src/veille-machine/contrat.ts")>("veille-machine", "contract.ts")).lireVeille(racineDeLaStation, process.platform),
        dire: (standby) => tell("veilleMachine", standby),
        avertir: (line) => console.error(line),
      })
    : undefined;
ipcMain.handle("veilleMachine", () => standbyMachine?.relire());
void duRuntime<typeof import("../../runtime/src/second-propositions/canal.ts")>("second-propositions", "canal.ts").then(
  (canal) => {
    propositionsDuSecond = holdLesPropositions({ canal, surProposition: (project, proposition) => tell("proposition", project, proposition) });
    propositionsDuSecond.suivre(projects());
  },
  (error: unknown) => console.error(`brigade: the second's proposals cannot be followed — ${error instanceof Error ? error.message : String(error)}`),
);
// Les GitHub Apps de la station de cet ordinateur, depuis Settings (#2317, vue/identities-github.js) : ce qu'elle a
// de chaque rôle, et en ranger une, par ce que le runtime en fait (identites-stations.ts : `appsRangees`, `rangerApp`)
// dans le répertoire de la station. La clé ne fait que passer : rien ne la garde ici, et rien ne la rend à la vue — ni
// la lecture, ni un refus. Un téléphone n'a pas de station : rien.
const appsDuRuntime = () => duRuntime<typeof import("../../runtime/src/identites-stations.ts")>("identites-stations.ts");
const codeDe = (error: unknown) => (error as NodeJS.ErrnoException | undefined)?.code ?? "error";
ipcMain.handle("appsDeLaStation", async () => {
  if (role.role !== "station") return undefined;
  try {
    const { appsRangees } = await appsDuRuntime();
    return { apps: appsRangees(racineDeLaStation) };
  } catch (error) {
    return { refus: `this station's Apps directory cannot be read (${codeDe(error)})` };
  }
});
ipcMain.handle("rangerUneApp", async (_, roleDeLApp: unknown, id: unknown, cle: unknown) => {
  if (role.role !== "station") return { refus: "this device has no station — it keeps no App" };
  if (typeof roleDeLApp !== "string" || typeof id !== "string" || typeof cle !== "string") return { refus: "the app sent an App this station cannot read" };
  const { AppRefusee, rangerApp } = await appsDuRuntime();
  try {
    const rangee = rangerApp({ station: racineDeLaStation, role: roleDeLApp, id, cle, env: process.env });
    return { rangee: { role: rangee.role, id: rangee.id } };
  } catch (error) {
    // Le refus du runtime ne cite jamais la clé ; une écriture qui échoue, son seul code.
    return { refus: error instanceof AppRefusee ? error.message : `the ${roleDeLApp} App could not be stored (${codeDe(error)})` };
  }
});
// Les projets que la station de cet ordinateur sert (#2359) : sa seule liste, sa configuration (#3402), lue et écrite par
// ce que le runtime en fait (station-ordinateur/projets-servis.ts) — lue par son bloc (vue/projects-served/), écrite par
// l'onglet Stations d'un projet (vue/project/stations/). Ses cuisines la relisent dans les deux secondes. Un téléphone
// n'a pas de station : rien.
const projectsServedDuRuntime = () => duRuntime<typeof import("../../runtime/src/station-ordinateur/projets-servis.ts")>("station-ordinateur", "projets-servis.ts");
ipcMain.handle("projetsServis", async () => {
  if (role.role !== "station") return undefined;
  try {
    const { lireProjetsServis: lireProjectsServed } = await projectsServedDuRuntime();
    return { depots: lireProjectsServed(racineDeLaStation) };
  } catch (error) {
    return { refus: error instanceof Error ? error.message : `this station's served projects cannot be read (${codeDe(error)})` };
  }
});
ipcMain.handle("servirUnProjet", async (_, repository: unknown, served: unknown) => {
  if (role.role !== "station") return { refus: "this device has no station — it serves no project" };
  if (typeof repository !== "string" || typeof served !== "boolean") return { refus: "the app sent a project this station cannot read" };
  try {
    const { ajouterProjetServi: ajouterProjectServed, retirerProjetServi: retirerProjectServed } = await projectsServedDuRuntime();
    return { depots: served ? ajouterProjectServed(racineDeLaStation, repository) : retirerProjectServed(racineDeLaStation, repository) };
  } catch (error) {
    return { refus: error instanceof Error ? error.message : `the served projects could not be written (${codeDe(error)})` };
  }
});
// Les pages qu'un échec du runtime a nommées — installer `gh`, `git`, demander l'accès à un dépôt : seules
// celles-là s'ouvrent depuis l'écran.
const pagesDuFirst = new Set<string>();
const retenirLaPage = <T extends { link?: string }>(rendu: T): T => {
  if (rendu.link !== undefined) pagesDuFirst.add(rendu.link);
  return rendu;
};
ipcMain.handle("stationsDuChef", async (): Promise<StationsDuChef> => {
  const { lireLesStationsDuChef } = await duRuntime<typeof import("../../runtime/src/appairage/stations-du-chef.ts")>("appairage", "stations-du-chef.ts");
  const lu = await lireLesStationsDuChef({ gh: ghIci, env: process.env });
  return lu.state === "unavailable" ? retenirLaPage(lu) : lu;
});
// Les stations enregistrées sous le compte GitHub du chef (#1706), lues par l'opération du runtime (#1705), avec ce que
// chacune a fait des dépôts choisis pour elle — rejoint la cuisine d'une autre, ou refusé (#1790) ; les projets que le
// chef choisit pour l'une, écrits dans son gist, au fichier que le contrat du runtime nomme (stations-du-account.ts).
ipcMain.handle("stationsDuCompte", async (): Promise<StationsDuAccount> => {
  const { lireLesStationsDuCompte: lireLesStationsDuAccount } = await duRuntime<typeof import("../../runtime/src/enregistrement-station/stations-du-compte.ts")>("enregistrement-station", "stations-du-account.ts");
  const lu = await lireLesStationsDuAccount({ gh: ghIci, env: process.env });
  signesDeVie.poser(lu);
  if (lu.state === "unavailable") return retenirLaPage(lu);
  const github = githubDesStations({ gh: ghIci, delaiMs: 30_000 });
  // L'état de chacune est celui de son dernier signe de vie, son enregistrement ou sa présence appairée (#3187).
  // Celle de cet ordinateur, que l'app voit tourner, est en ligne (ticket 3482).
  const presences = avecLaPresenceLocale(stations.vu()?.stations ?? [], lu.state === "listed" ? lu.stations : [], gistQuiTourneIci());
  return avecLeursAjouts(avecLeurState(lu, presences, Date.now()), (id) => github.lire(id));
});
const choisirLesProjects = choiceDesProjects({
  ecrire: (id, fichiers) => githubDesStations({ gh: ghIci, delaiMs: 30_000 }).ecrire(id, fichiers),
  contrat: () => duRuntime<typeof import("../../runtime/src/enregistrement-station/contrat.ts")>("enregistrement-station", "contract.ts"),
});
ipcMain.handle("choisirLesProjets", (_, id: unknown, depots: unknown) => choisirLesProjects(id, depots));
const ouvrirUnProjectDUneStation = ouvrirDUneStation({
  ouvrirLaCopie: async (options) => {
    const { ouvrirLaCopieLocale } = await duRuntime<typeof import("../../runtime/src/projets/copie-locale.ts")>("projets", "copie-locale.ts");
    return ouvrirLaCopieLocale({ ...options, gh: ghIci, git: process.env.BRIGADE_GIT_BIN || "git", env: process.env });
  },
  lireLaBase: async (dossier) => (await lireClone(process.env.BRIGADE_GIT_BIN || "git", dossier)).base,
  configuration: () => suivi.configuration(),
  ajouter: (project) => suivi.ajouter(project),
  progres: (repository, step) => tell("ouverture", repository, step),
  // Avant que la cuisine démarre (#4057) : ce que `claude auth status` dit de cet ordinateur, sans appel au modèle.
  connexionClaude: async () => {
    const { sessionClaude } = await duRuntime<typeof import("../../runtime/src/claude.ts")>("claude.ts");
    return connectionDeLaSession(await sessionClaude(claudeIci, process.env));
  },
});
// Le dépôt choisi dans « Add a project » (#2627) : est-il prêt pour brigade — ses bindings, ses labels —, et le
// geste qui l'y prépare, par le contrat du runtime (#2626) joué sur sa copie locale (projects/preparation-du-repository.ts).
const preparation = preparationDuRepository({
  ouvrirLaCopie: async (repository) => {
    const { ouvrirLaCopieLocale } = await duRuntime<typeof import("../../runtime/src/projets/copie-locale.ts")>("projets", "copie-locale.ts");
    return ouvrirLaCopieLocale({ repository, gh: ghIci, git: process.env.BRIGADE_GIT_BIN || "git", env: process.env });
  },
  lireLaBase: async (dossier) => (await lireClone(process.env.BRIGADE_GIT_BIN || "git", dossier)).base,
  contrat: () => duRuntime<typeof import("../../runtime/src/depot-prepare/preparation.ts")>("depot-prepare", "preparation.ts"),
});
ipcMain.handle("checkRepoSetup", (_, repository: unknown) => preparation.verifier(repository));
ipcMain.handle("runRepoSetup", (_, repository: unknown) => preparation.installer(repository));
ipcMain.handle("ouvrirDUneStation", async (_, name: unknown, repository: unknown, base: unknown) => {
  const ouverture = await ouvrirUnProjectDUneStation(name, repository, base);
  return ouverture.state === "failed" && "link" in ouverture ? retenirLaPage(ouverture) : ouverture;
});
const connectionGitHub = holdConnectionGitHub({
  commande: async () => {
    const { connexionGitHub: connectionGitHub } = await duRuntime<typeof import("../../runtime/src/appairage/stations-du-chef.ts")>("appairage", "stations-du-chef.ts");
    return connectionGitHub(ghIci).command;
  },
  env: process.env,
  ouvrir: (adresse) => shell.openExternal(adresse),
  apres: (fin) => {
    accountConnecte.oublier();
    tell("connexionGitHub", fin);
  },
});
// Le compte GitHub que le `gh` de cet ordinateur tient, pour le premier lancement et « Add a project » (#2475, #3181,
// connection-github.ts) — relu par la vue au bout d'une connexion, et donc d'un changement de compte.
ipcMain.handle("compteGitHub", async () => {
  const { echecDeGh: failureDeGh } = await duRuntime<typeof import("../../runtime/src/appairage/stations-du-chef.ts")>("appairage", "stations-du-chef.ts");
  const lu = await lireLeAccountGitHub({ gh: ghIci, env: process.env, echecDeGh: failureDeGh });
  if ("lien" in lu && lu.lien !== undefined) pagesDuFirst.add(lu.lien);
  return lu;
});
// Le bloc de la station de l'accueil (ticket 2640) : installer celle de cet ordinateur (workstation/installer.ts).
ipcMain.handle("installerLaStation", () => installerLaStation(stationLocale, () => stations.relire()));
// « Start this computer's station », sur l'alerte d'un projet dont la station est arrêtée (#3637) : le geste `demarrage` de
// l'icône de fond (tray-background/read.ts), pour ce projet — `station start <station>` sur la station de cet ordinateur.
ipcMain.handle("demarrerLaStationIci", async (_, name: unknown) => {
  const vise = connu(name);
  if (vise === undefined) return parti(name);
  if (role.role !== "station") return { refus: "this computer is a workstation, not a station: there is no station here to start" };
  const locale = { node: emplacements.node, runtime: emplacements.runtime, racine: racineDeLaStation, env: process.env };
  const rendu = await demarrerLaStationDuProject({ nom: vise.nom, faits: facts.dernier(vise.nom)?.faits }, (project, command) => lancerIci(locale, project, command, 30_000), 30_000);
  void stations.relire();
  return rendu;
});
// Les outils que l'app ne livre pas (#4059, tools-required.ts) : la connexion à GitHub, le clone et le login Max les
// demandent d'abord ; un outil qui manque a son écran, qui renvoie à sa page d'installation (l'app n'installe rien, #4266).
const toolsRequired = holdToolsRequired({
  charger: async () => {
    const [required, machine, tools] = await Promise.all([
      duRuntime<typeof import("../../runtime/src/outils-requis/outils-requis.ts")>("outils-requis", "tools-required.ts"),
      duRuntime<typeof import("../../runtime/src/outils-requis/machine.ts")>("outils-requis", "machine.ts"),
      duRuntime<typeof import("../../runtime/src/second/outils.ts")>("second", "outils.ts"),
    ]);
    return { ...required, ...machine, programmesDe: tools.programmesDe };
  },
  env: process.env,
  autoriserLaPage: (lien) => pagesDuFirst.add(lien),
});
ipcMain.handle("outilsManquants", (_, tools: unknown) => toolsRequired.manquants(tools));
// Le « log in » d'une ouverture que Claude Code retient (#4057) : le login de cette machine, celui de la panne de sa station.
ipcMain.handle("seConnecterAClaude", () => loginIci());
// La page où taper le code se rouvre depuis l'écran.
ipcMain.handle("seConnecterAGitHub", async () => {
  const debut = await connectionGitHub();
  if ("page" in debut) pagesDuFirst.add(debut.page);
  return debut;
});
// Et celles qui disent comment obtenir un outil qui manque au second (#1435), depuis sa colonne.
ipcMain.handle("ouvrirLaPage", (_, url: unknown) => {
  if (typeof url !== "string" || !(pagesDuFirst.has(url) || terminaux.pagesDesOutils().has(url))) return false;
  return shell.openExternal(url).then(
    () => true,
    () => false,
  );
});
// Le lien de l'app Android que l'offre du téléphone montre (#3303, update/android.ts) : l'`apkUrl` de la dernière
// version publiée, ou la page des versions s'il ne se lit pas — et lui seul, ensuite, s'ouvre par `ouvrirLaPage`.
ipcMain.handle("lienDeLApk", async () => {
  const lien = await apkLink();
  pagesDuFirst.add(lien);
  return lien;
});
// Un téléphone déjà connecté au compte GitHub de cet ordinateur (#3303, phone-connecte.ts) : la trace que l'app
// Android pose dans un gist, lue par le `gh` du poste. `illisible` quand la liste ne se lit pas : l'offre ne se montre pas.
ipcMain.handle("telephoneConnecte", async (): Promise<{ connecte: boolean } | { illisible: string }> => {
  try {
    return { connecte: (await githubDesStations({ gh: ghIci, delaiMs: 30_000 }).telephone?.()) === true };
  } catch (error) {
    return { illisible: error instanceof Error ? error.message : String(error) };
  }
});
// La cuisine que la visite montre (#4087, visit.ts) : benomite/brigade, son rail et ce qui y attend un humain, lus sur
// GitHub par la lecture même du rail d'un projet — des lectures seules, sous le budget du jeton du chef. Rien n'est cloné
// ni ajouté au fichier des projets.
ipcMain.handle("lireLaCuisineVisitee", (_, repository: unknown) =>
  lireLaKitchenVisitee(repository, async (vise) => {
    const lu = await lireLeTableauDuRepository({ depot: vise, appeler: appelerSousBudget, memoire: memoireDuRail(vise) });
    return avecCeQuiAwaitingLeChef(lu, readConditionnelle(appelerSousBudget, memoireDuRail(vise)));
  }),
);
// Le rail qu'une station publie dans son gist pour un projet qu'aucune station connue ne sert ici (#1435), lu par
// l'opération du runtime (#1432) : la vue ne le dessine plus (#2076) — le rail est celui que l'app lit sur GitHub, pour
// tout projet. Tant qu'il ne se lit pas, il dit pourquoi en une phrase : GitHub à connecter, aucune
// station du compte qui serve le projet, ou la page qui lève l'échec, ouverte depuis l'écran.
ipcMain.handle("railDuProjet", async (_, name: unknown): Promise<RailDuProjectLu> => {
  const vise = declare(name);
  if (vise === undefined) return { state: "unavailable", project: String(name), cause: "unreadable", reason: `The rail of ${String(name)} is not read: it is no longer in the projects file.` };
  const { lireLeRailDuProjet: lireLeRailDuProject } = await duRuntime<typeof import("../../runtime/src/appairage/rail-du-projet.ts")>("appairage", "rail-du-projet.ts");
  const lu = await lireLeRailDuProject({ gh: ghIci, env: process.env, project: vise.depot ?? vise.nom });
  if (lu.state === "unavailable") return retenirLaPage(lu);
  return lu;
});
// Les labels d'une issue, lus et changés depuis une fiche (priority.ts, actions-github.ts), et le commentaire du chef,
// avec le jeton du `gh` de ce poste.
const clientDesLabels = clientDeLaPriority({ jeton: jetonDeGh({ gh: ghIci, delaiMs: 10_000 }), appeler: appelerGitHub, envoyer: envoyerParFetch() });
// Les plafonds de durée du projet, sur Kitchen > Health (#2490, caps-duree.ts) : lus dans `.claude/brigade/projet.json`
// de son dépôt, sur sa branche d'intégration, et changés par une pull request vers elle (#2920), par le jeton du `gh` de
// ce poste — ni box. L'adresse de la PR rendue s'ouvre depuis l'écran (`ouvrirLaProposition`).
const branchDuProject = (project: Project) => project.base ?? projectsDesStations.vu()?.projets.find(({ nom: name }) => name === project.nom)?.base ?? null;
ipcMain.handle("plafondsDuree", async (_, name: unknown) => {
  const vise = connu(name);
  if (vise === undefined) return { sans: `${String(name)} is no longer in the projects file` };
  return lireLesCaps({ depot: await repositoryDuProject(vise), branche: branchDuProject(vise), client: clientDesLabels });
});
ipcMain.handle("changerPlafondDuree", async (_, name: unknown, cle: unknown, saisie: unknown) => {
  const vise = connu(name);
  if (vise === undefined) return parti(name);
  const rendu = await changerLeCap({ depot: await repositoryDuProject(vise), branche: branchDuProject(vise), cle, saisie, client: clientDesLabels });
  if ("pr" in rendu) propositionsDeSetting.add(rendu.pr);
  return rendu;
});
// Le closer du projet, sur Kitchen > Health (#2491, closer-sante.ts) : ses passes et leurs PR, ses vérifications en plus
// (`.claude/brigade/closer-checks.md`) et ses réglages (`closer.*` de `projet.json`), lus sur sa branche d'intégration
// par le jeton du `gh` de ce poste — ni box. Un réglage changé, une vérification ajoutée ou retirée, s'y proposent par
// une pull request (#2920), dont l'adresse s'ouvre depuis l'écran.
ipcMain.handle("closerDeSante", async (_, name: unknown) => {
  const vise = connu(name);
  if (vise === undefined) {
    const sans = { sans: `${String(name)} is no longer in the projects file` };
    return { reglages: sans, verifications: sans, passes: sans };
  }
  return lireLeCloser({ depot: await repositoryDuProject(vise), branche: branchDuProject(vise), client: clientDesLabels });
});
ipcMain.handle("changerReglageDuCloser", async (_, name: unknown, cle: unknown, saisie: unknown) => {
  const vise = connu(name);
  if (vise === undefined) return parti(name);
  const rendu = await changerLeSetting({ depot: await repositoryDuProject(vise), branche: branchDuProject(vise), cle, saisie, client: clientDesLabels });
  if ("pr" in rendu) propositionsDeSetting.add(rendu.pr);
  return rendu;
});
ipcMain.handle("changerVerificationDuCloser", async (_, name: unknown, action: unknown, saisie: unknown) => {
  const vise = connu(name);
  if (vise === undefined) return parti(name);
  const rendu = await changerLesVerifications({ depot: await repositoryDuProject(vise), branche: branchDuProject(vise), geste: action, saisie, client: clientDesLabels });
  if ("pr" in rendu) propositionsDeSetting.add(rendu.pr);
  return rendu;
});
// Le savoir-faire du projet, sous Settings (#4239, vue/know-how/) : `.brigade/know-how.md` lu sur sa branche
// d'intégration, et une entrée changée ou retirée proposée par une pull request vers elle, comme un plafond.
const savoirDe = (name: unknown) => ({ nom: name, projet: connu(name), depotDe: repositoryDuProject, brancheDe: branchDuProject, client: clientDesLabels });
ipcMain.handle("savoirDuProjet", (_, name: unknown) => lireLeSavoirDuProject(savoirDe(name)));
ipcMain.handle("changerLeSavoir", async (_, name: unknown, changement: unknown) => {
  const rendu = await changerLeSavoir({ ...savoirDe(name), changement });
  if ("pr" in rendu) propositionsDeSetting.add(rendu.pr);
  return rendu;
});
// Le bouton d'une panne, sur la ligne d'une station : rend ce qu'il a fait, ou pourquoi rien.
ipcMain.handle("panne", (_, id: unknown, cle: unknown) => jouerOutage(actionsDesOutages, id, cle));
// « report to brigade », sous chaque panne que l'app montre (ticket 1977, vue/report/) : le journal du projet est lu
// là où sa cuisine tourne — hors de son passage, qu'une lecture longue ne le retienne pas —, et l'issue préremplie
// s'ouvre dans le navigateur du poste. Rien n'est envoyé à GitHub d'ici : le chef l'envoie lui-même.
ipcMain.handle("signaler", (_, request: unknown) =>
  ouvrirLeReport(request, {
    appVersion: app.getVersion(),
    runtimeVersion: async (lue) => {
      const locale = await duRuntime<typeof import("../../runtime/src/mise-a-jour/en-service.ts")>("mise-a-jour", "en-service.ts").then(
        ({ versionDuRuntime }) => versionDuRuntime(),
        () => "unknown",
      );
      return versionVisee(lue, stations.vu()?.stations ?? [], locale === "inconnue" ? "unknown" : locale);
    },
    journal: async (name) => {
      const { lu } = kitchenDuProject(name);
      if (lu === undefined) throw new Error("no kitchen runs this project on this computer");
      const rendu = await lancerLa({ delaiMs: 15_000 }, lu, COMMAND_DU_LOG);
      if (rendu.erreur !== null) throw rendu.erreur;
      return rendu.sortie;
    },
    ouvrir: (url) => shell.openExternal(url),
  }),
);
// Une commande du runtime, lancée là où la cuisine d'un projet tourne, par son passage comme les veilles.
const lancerSurLaKitchen = (lu: Lu, command: string) => {
  const rendu = (passage.get(lu.nom) ?? Promise.resolve()).then(() => lancerLa({ delaiMs: 30_000 }, lu, command));
  passage.set(lu.nom, rendu);
  return rendu;
};
// Les réglages du projet, sur sa page (#1309) : lus par `setting` là où sa cuisine tourne, et changés par une PR sur
// son dépôt — rien ne se pose sur la box (settings-du-project.ts). La proposition attend que le runtime du projet ait
// ouvert la PR — il l'attend lui-même deux minutes au plus — : elle ne passe pas par le passage du projet, que ses
// lectures ne restent pas derrière elle. Seule l'adresse d'une PR qu'elle a rendue s'ouvre depuis l'écran.
const propositionsDeSetting = new Set<string>();
const kitchenDuProject = (name: unknown) => {
  const vise = connu(name);
  const kitchen = vise === undefined ? undefined : kitchens.cuisineDe(vise);
  return { vise, lu: vise === undefined || kitchen === undefined ? undefined : { nom: vise.nom, cuisine: kitchen } };
};
ipcMain.handle("reglagesDuProjet", (_, name: unknown) => {
  const { vise, lu } = kitchenDuProject(name);
  return vise === undefined ? { sans: `${String(name)} is no longer in the projects file` } : lireLesSettings(vise.nom, lu, lancerSurLaKitchen);
});
ipcMain.handle("proposerUnReglage", async (_, name: unknown, choice: unknown) => {
  const { vise, lu } = kitchenDuProject(name);
  if (vise === undefined) return parti(name);
  const rendu = await proposerLeSetting(vise.nom, lu, choice, (lu, command) => lancerLa({ delaiMs: 150_000 }, lu, command));
  if ("pr" in rendu) propositionsDeSetting.add(rendu.pr);
  return rendu;
});
// Les humains du projet, sous Settings (#2930) : lus par `humans` là où sa cuisine tourne, et chaque changement — ajouté,
// changé ou retiré — écrit par une PR, que le runtime attend comme celle d'un réglage (humans-du-project.ts).
// Les gestes qu'un agent retient pour l'OK du chef (held/, ticket 4273) : lus par `manager` là où la cuisine du projet tourne,
// et approuvés un par un par `manager approve <id>` — sans ssh, sans commande tapée.
// L'équipe du projet que lit la vue (tickets 4029 et 4327) : les enregistrements que `facts` publie, lus là où sa cuisine tourne.
ipcMain.handle("lireLesAgents", (_, name: unknown) => lireLesAgents(kitchenDuProject(name).lu, lancerSurLaKitchen));
ipcMain.handle("gestesRetenus", (_, name: unknown) => lireLesRetenus(kitchenDuProject(name).lu, lancerSurLaKitchen));
// L'API des agents que lit l'onglet Agents (ticket 4224) : la vue la demande par `fetch` sur `brigade-agents:`, et chaque
// demande est une commande `agents` ou `agent-settings` lancée là où la cuisine du projet nommé tourne (agents-de-la-box.ts).
protocol.registerSchemesAsPrivileged([SCHEMA_PRIVILEGIE]);
const servirLesAgents = () =>
  protocol.handle(SCHEMA_DES_AGENTS, async (requete) => {
    const { statut: status, corps } = await repondreAuxAgents({ methode: requete.method, url: requete.url, corps: await requete.text() }, kitchenDuProject, lancerSurLaKitchen);
    return new Response(JSON.stringify(corps), { status: status, headers: { "content-type": "application/json" } });
  });
ipcMain.handle("approuverGeste", (_, name: unknown, id: unknown) => approuverLeAction(String(name), kitchenDuProject(name).lu, id, lancerSurLaKitchen));
ipcMain.handle("listerLesHumains", (_, name: unknown) => {
  const { vise, lu } = kitchenDuProject(name);
  return vise === undefined ? { sans: `${String(name)} is no longer in the projects file` } : lireLesHumans(vise.nom, lu, lancerSurLaKitchen);
});
const ecrireUnHuman = async (name: unknown, action: { save: unknown } | { remove: unknown }) => {
  const { vise, lu } = kitchenDuProject(name);
  if (vise === undefined) return parti(name);
  const rendu = await ecrireLesHumans(vise.nom, lu, action, (lu, command) => lancerLa({ delaiMs: 150_000 }, lu, command));
  if ("pr" in rendu) propositionsDeSetting.add(rendu.pr);
  return rendu;
};
ipcMain.handle("enregistrerUnHumain", (_, name: unknown, human: unknown) => ecrireUnHuman(name, { save: human }));
ipcMain.handle("retirerUnHumain", (_, name: unknown, login: unknown) => ecrireUnHuman(name, { remove: login }));
// Les tickets récurrents du projet, sous Settings (#3231) : lus par `recurring` là où sa cuisine tourne, et chacun suspendu,
// repris ou retiré par elle (vue/recurring/recurring-box.ts).
ipcMain.handle("listerLesRecurrents", (_, name: unknown) => {
  const { vise, lu } = kitchenDuProject(name);
  return vise === undefined ? { sans: `${String(name)} is no longer in the projects file` } : lireLesRecurring(vise.nom, lu, lancerSurLaKitchen);
});
ipcMain.handle("changerUnRecurrent", (_, name: unknown, action: unknown, id: unknown) => {
  const { vise, lu } = kitchenDuProject(name);
  return vise === undefined ? parti(name) : ecrireUnRecurrent(vise.nom, lu, action, id, lancerSurLaKitchen);
});
// La fiche du projet, sous Settings (#4240) : `.brigade/fiche-projet.json`, lue et écrite dans le dossier du projet sur ce
// poste (vue/card-project/card-project-dossier.ts).
ipcMain.handle("lireUnFichierDuProjet", (_, name: unknown, chemin: unknown) => lireDansLeProject(connu(name), chemin));
ipcMain.handle("ecrireUnFichierDuProjet", (_, name: unknown, chemin: unknown, texte: unknown) => ecrireDansLeProject(connu(name), chemin, texte));
brancherLeWordAuCook(ipcMain, kitchenDuProject, lancerSurLaKitchen); // le mot au cook (#4048, vue/word-au-cook/word-au-cook-box.ts)
brancherLeKnowHow(ipcMain, kitchenDuProject, lancerSurLaKitchen); // le savoir-faire du projet, sous Know-how (#4241, vue/know-how-tab/know-how-box.ts)
// Les explications des mots de la cuisine (#3308) : ce que le chef de cet ordinateur — son compte GitHub — en a vu, lu,
// marqué et effacé par `explanations` là où la cuisine du projet tourne, pour valoir sur tous ses appareils
// (vue/explanations/explanations-box.ts).
const accountDesExplanations = () => accountConnecte.login();
ipcMain.handle("lireLesExplications", (_, name: unknown) => {
  const { vise, lu } = kitchenDuProject(name);
  return vise === undefined ? { sans: `${String(name)} is no longer in the projects file` } : lireLesExplanations(vise.nom, lu, accountDesExplanations, lancerSurLaKitchen);
});
ipcMain.handle("marquerUneExplication", (_, name: unknown, word: unknown) => {
  const { vise, lu } = kitchenDuProject(name);
  return vise === undefined ? parti(name) : ecrireLesExplanations(vise.nom, lu, accountDesExplanations, { vu: word }, lancerSurLaKitchen);
});
ipcMain.handle("remontrerLesExplications", (_, name: unknown) => {
  const { vise, lu } = kitchenDuProject(name);
  return vise === undefined ? parti(name) : ecrireLesExplanations(vise.nom, lu, accountDesExplanations, { effacer: true }, lancerSurLaKitchen);
});
// Le récapitulatif de chaque projet, sur l'accueil (#3581, vue/recap/recap-box.ts) : lu par `recap` là où sa cuisine tourne,
// et son marqueur avancé par elle quand la vue l'a montré. Seule l'adresse d'une PR qu'une lecture a rendue s'ouvre.
const liensDesRecaps = new Set<string>();
ipcMain.handle("lireLeRecap", async (_, name: unknown) => {
  const { vise, lu } = kitchenDuProject(name);
  if (vise === undefined) return { sans: `${String(name)} is no longer in the projects file` };
  const lue = await lireLeRecap(vise.nom, lu, await repositoryDuProject(vise), lancerSurLaKitchen);
  if ("recap" in lue) for (const { prUrl } of lue.recap.served) liensDesRecaps.add(prUrl);
  return lue;
});
ipcMain.handle("marquerLeRecap", async (_, name: unknown, until: unknown) => {
  const { vise, lu } = kitchenDuProject(name);
  return vise === undefined ? parti(name) : marquerLeRecap(vise.nom, lu, await repositoryDuProject(vise), until, lancerSurLaKitchen);
});
ipcMain.handle("ouvrirLaPRDuRecap", (_, url: unknown) => {
  if (typeof url !== "string" || !liensDesRecaps.has(url)) return false;
  return shell.openExternal(url).then(
    () => true,
    () => false,
  );
});
// Les stations contributrices du projet, sous Settings (#2936) : lues par `contributor-stations` là où sa cuisine tourne, et
// refusées ou réacceptées par elle (stations-contributrices.ts).
ipcMain.handle("listerLesStationsContributrices", (_, name: unknown) => {
  const { vise, lu } = kitchenDuProject(name);
  return vise === undefined ? { sans: `${String(name)} is no longer in the projects file` } : lireLesStations(vise.nom, lu, lancerSurLaKitchen);
});
const changerUneStation = (name: unknown, action: { refuse: unknown } | { accept: unknown }) => {
  const { vise, lu } = kitchenDuProject(name);
  return vise === undefined ? parti(name) : ecrireLesStations(vise.nom, lu, action, lancerSurLaKitchen);
};
ipcMain.handle("refuserUneStationContributrice", (_, name: unknown, station: unknown) => changerUneStation(name, { refuse: station }));
ipcMain.handle("accepterUneStationContributrice", (_, name: unknown, station: unknown) => changerUneStation(name, { accept: station }));
// Les résumés hebdomadaires de la cuisine d'un projet (#3263, vue/resume-weekly/resume-kitchen.ts) : le jour du
// résumé lu dans `projet.json` sur sa branche d'intégration, et changé par une pull request, par le jeton du `gh` de ce
// poste ; les résumés lus par `report --week` là où sa cuisine tourne, par son passage, et publiés comme les notes d'une
// version par `release-notes`. Seul un résumé que la dernière lecture a rendu se publie, et seule l'adresse d'un ticket
// ou d'une release qu'elles ont rendue s'ouvre depuis l'écran.
const resumesLus = new Map<string, ResumeWeekly[]>();
const liensDesResumes = new Set<string>();
ipcMain.handle("lireLesResumesHebdomadaires", async (_, name: unknown): Promise<ResumesDuProject> => {
  const { vise, lu } = kitchenDuProject(name);
  if (vise === undefined) {
    const sans = { sans: `${String(name)} is no longer in the projects file` };
    return { projet: String(name), jour: sans, resumes: sans };
  }
  const day = await lireLeDay({ depot: await repositoryDuProject(vise), branche: branchDuProject(vise), client: clientDesLabels });
  const resumes = "sans" in day ? { sans: "weekly summaries unavailable: the summary day was not read", detail: day.detail ?? day.sans } : await lireLesResumes({ projet: vise.nom, lu, jour: day.jour, lancer: lancerSurLaKitchen, maintenant: new Date() });
  if ("resumes" in resumes) {
    resumesLus.set(vise.nom, resumes.resumes);
    for (const { themes, waiting } of resumes.resumes) for (const { ticketUrl } of [...themes.flatMap(({ lines }) => lines), ...waiting]) liensDesResumes.add(ticketUrl);
  }
  return { projet: vise.nom, jour: day, resumes };
});
ipcMain.handle("changerLeJourDuResume", async (_, name: unknown, day: unknown) => {
  const vise = connu(name);
  if (vise === undefined) return parti(name);
  const rendu = await changerLeDay({ depot: await repositoryDuProject(vise), branche: branchDuProject(vise), jour: day, client: clientDesLabels });
  if ("pr" in rendu) propositionsDeSetting.add(rendu.pr);
  return rendu;
});
ipcMain.handle("publierLeResumeHebdomadaire", async (_, name: unknown, weekStart: unknown, tag: unknown) => {
  const { vise, lu } = kitchenDuProject(name);
  if (vise === undefined) return parti(name);
  const resume = resumesLus.get(vise.nom)?.find((guard) => guard.weekStart === weekStart);
  if (resume === undefined) return { refus: "nothing was published: this summary is no longer read — open the page again" };
  const rendu = await publierLeResume({ projet: vise.nom, lu, resume, tag, lancer: (lu, command) => lancerLa({ delaiMs: 60_000 }, lu, command) });
  if ("url" in rendu) liensDesResumes.add(rendu.url);
  return rendu;
});
ipcMain.handle("ouvrirTicketDuResume", (_, url: unknown) => {
  if (typeof url !== "string" || !liensDesResumes.has(url)) return false;
  return shell.openExternal(url).then(
    () => true,
    () => false,
  );
});
ipcMain.handle("ouvrirLaProposition", (_, url: unknown) => {
  if (typeof url !== "string" || !propositionsDeSetting.has(url)) return false;
  return shell.openExternal(url).then(
    () => true,
    () => false,
  );
});
// Le code de l'app, en retard ou à relancer : le clic la met à jour et la relance — rien n'est
// rendu, elle se ferme — ou dit pourquoi elle reste sur son code (rattrapage.ts).
ipcMain.handle("passer", () => {
  const sien = retards.vu()?.clones.find(({ id }) => id === APP);
  if (sien?.bouton === undefined) return { refus: "nothing to do: the last read did not find this app behind its origin" };
  return passer(sien.etat === "a-relancer");
});
// La mise à jour de l'app installée (update/state.ts) : son état, la vérification que la vue
// demande, et « installer maintenant » — l'app se ferme et rien n'est rendu, ou elle dit pourquoi
// elle reste sur sa version. Depuis le dépôt, l'état dit qu'elle ne se met pas à jour par là.
ipcMain.handle("miseAJour", () => update.vu());
ipcMain.handle("verifierMiseAJour", () => update.verifier());
ipcMain.handle("installerMiseAJour", () => update.installerMaintenant());
// La ligne d'une version plus haute : le dernier avis, et son lien ouvert dans le navigateur — celui de l'avis, et lui seul.
ipcMain.handle("avisDeVersion", () => opinionDeVersion);
ipcMain.handle("telechargerVersion", async (_, url: unknown) => {
  if (typeof url !== "string" || (await opinionDeVersion)?.url !== url) return false;
  return shell.openExternal(url).then(
    () => true,
    () => false,
  );
});
// Un clone en retard : sa mise à jour — `git -C <clone> pull` — est écrite dans un shell, et
// rien ne l'envoie. La vue nomme le clone ; ce qui s'écrit, et dans l'espace de quel projet, se
// décide dans retard.ts — ou pourquoi rien ne l'est. Rien, pour un clone qui n'est pas en retard.
// L'espace du projet est ouvert d'abord, comme au clic sur sa case : un shell n'y vit pas sans son second.
ipcMain.handle("mettreAJour", (_, clone: unknown) =>
  retards.ecrire(
    {
      shell: (concerne, ecrit) => {
        terminaux.espace(concerne);
        return terminaux.shell(concerne, ecrit);
      },
    },
    clone,
  ),
);
// Ce qu'engage l'allumage du manager, chiffré (allumage.ts) : `manager backlog`, lancée une fois
// sur la station de cet ordinateur, par le passage du projet comme les veilles. La vue le demande quand la confirmation
// d'« allumer » s'ouvre : cette lecture ne retient pas le « oui », et n'écrit rien.
ipcMain.handle("compter", (_, name: unknown) => {
  const { lu } = kitchenDuProject(name);
  if (lu === undefined) return undefined;
  const served = lu;
  const rendu = (passage.get(served.nom) ?? Promise.resolve()).then(() => compter({ delaiMs: 30_000 }, served));
  passage.set(served.nom, rendu);
  return rendu;
});
// La réponse du chef à une carte de TODO (card-todo.ts) : la carte du chef lue de GitHub (#2434) — sa réponse est postée
// sur son issue et son geste joué par l'app même, par le jeton du `gh` de ce poste (tableau-actions/answer-github.ts) —, ni
// tableau, ni box. Toute autre carte ne se répond plus de l'app (#2061) : rien ne part, et la phrase dit pourquoi.
ipcMain.handle("repondreCarte", async (_, name: unknown, ticket: unknown, answer: unknown) => {
  const vise = connu(name);
  if (vise === undefined) return undefined;
  const chef = facts.chef(vise.nom, ticket);
  if (chef === undefined) return { refus: SANS_FAIT.carte, detail: "" };
  const rendu = await repondreSurGithub({ depot: await repositoryDuProject(vise), ticket, chef, reponse: answer, client: clientDesLabels });
  if ("repondue" in rendu) tableaux.oublier();
  return rendu;
});
// Un geste du chef sur la carte « Validate its screen » (vue/validation-design/, ticket 3185) : la commande `design` du runtime
// (runtime/src/validation-design/commande.ts), importée et jouée ici, sous le `gh` de ce poste — `validate` merge la PR et
// ferme la carte, `send-back` la renvoie à un cook avec le commentaire du chef. La carte est celle que la dernière lecture
// porte. Fait, la lecture suivante va à GitHub : la carte fermée quitte TODO.
ipcMain.handle("gesteDeValidation", async (_, name: unknown, ticket: unknown, action: unknown) => {
  const vise = connu(name);
  if (vise === undefined) return undefined;
  const rendu = await jouerLaValidation({
    depot: await repositoryDuProject(vise),
    design: facts.chef(vise.nom, ticket)?.design,
    geste: action,
    // La commande, et la `Sortie` du même runtime : son refus se reconnaît à sa classe, pas à sa forme.
    commande: async () => {
      const [{ principal }, { Sortie }] = await Promise.all([duRuntime<typeof import("../../runtime/src/validation-design/commande.ts")>("validation-design", "commande.ts"), duRuntime<typeof import("../../runtime/src/appel.ts")>("appel.ts")]);
      return { principal, estUneSortie: (error: unknown): error is InstanceType<typeof Sortie> => error instanceof Sortie };
    },
    env: { ...process.env, BRIGADE_GH_BIN: ghIci },
  });
  if ("fait" in rendu) tableaux.oublier();
  return rendu;
});
// Une réponse du chef sur la carte « review before merge » d'un ticket sensible (vue/card-sensitive/, ticket 3224) : la
// commande `sensitive` du runtime (runtime/src/sensible/commande.ts), importée et jouée ici, sous le `gh` de ce poste —
// `merge` merge la PR et ferme la carte, `send-back` renvoie le ticket à un cook avec la note du chef. La carte est celle
// que la dernière lecture porte. Faite, la lecture suivante va à GitHub : la carte fermée quitte TODO.
ipcMain.handle("gesteSensible", async (_, name: unknown, ticket: unknown, action: unknown) => {
  const vise = connu(name);
  if (vise === undefined) return undefined;
  const rendu = await jouerLaRevue({
    depot: await repositoryDuProject(vise),
    revue: facts.chef(vise.nom, ticket)?.sensible,
    geste: action,
    commande: async () => {
      const [{ principal }, { Sortie }] = await Promise.all([duRuntime<typeof import("../../runtime/src/sensible/commande.ts")>("sensible", "commande.ts"), duRuntime<typeof import("../../runtime/src/appel.ts")>("appel.ts")]);
      return { principal, estUneSortie: (error: unknown): error is InstanceType<typeof Sortie> => error instanceof Sortie };
    },
    env: { ...process.env, BRIGADE_GH_BIN: ghIci },
  });
  if ("fait" in rendu) tableaux.oublier();
  return rendu;
});
// « undo » sur la carte d'un ticket servi (vue/undo/, ticket 3274) : la commande `undo` du runtime (runtime/src/undo/
// commande.ts), importée et jouée ici, sous le `gh` de ce poste — une PR revert le merge du ticket et passe la pass, et le
// ticket est rouvert ; en conflit, un ticket est déposé pour la cuisine. Seul un ticket que la dernière lecture porte servi,
// sa PR mergée, s'annule. Fait, la lecture suivante va à GitHub : rouvert, le ticket quitte Served.
ipcMain.handle("annulerServi", async (_, name: unknown, ticket: unknown) => {
  const vise = connu(name);
  if (vise === undefined) return undefined;
  const rendu = await jouerLAnnulation({
    depot: await repositoryDuProject(vise),
    ticket,
    servi: facts.ticket(vise.nom, ticket)?.etat === "servi" && facts.pr(vise.nom, ticket) !== undefined,
    commande: async () => {
      const [{ principal }, { Sortie }] = await Promise.all([duRuntime<typeof import("../../runtime/src/undo/commande.ts")>("undo", "commande.ts"), duRuntime<typeof import("../../runtime/src/appel.ts")>("appel.ts")]);
      return { principal, estUneSortie: (error: unknown): error is InstanceType<typeof Sortie> => error instanceof Sortie };
    },
    env: { ...process.env, BRIGADE_GH_BIN: ghIci },
  });
  if ("fait" in rendu) tableaux.oublier();
  return rendu;
});
// La PR qu'un nettoyage fini a ouverte (bilan du closer, #992) s'ouvre dans le navigateur du poste :
// une adresse https seulement, pour un projet que l'app connaît. Rend si elle a été ouverte.
ipcMain.handle("ouvrirBilan", (_, name: unknown, url: unknown) => {
  if (connu(name) === undefined || typeof url !== "string" || !/^https:\/\/[^\s]+$/.test(url)) return false;
  return shell.openExternal(url).then(
    () => true,
    () => false,
  );
});
// Les deux liens de la ligne d'un projet en lecture seule (ticket 3163) : la page n'est ouverte que pour le dépôt que la
// dernière lecture du projet dit en lecture seule (tableau/read.ts, `lectureSeule`).
ipcMain.handle("ouvrirLectureSeule", (_, name: unknown, page: unknown) => {
  const url = connu(name) === undefined ? undefined : pageDesFacts(tableaux.dernier(name)?.faits, page);
  if (url === undefined) return false;
  return shell.openExternal(url).then(
    () => true,
    () => false,
  );
});
// Un projet refusé n'a pas d'espace, mais sa box se lit quand même.
ipcMain.on("regarder", (_, name: unknown, request: number) => (voir = () => regarder(projects().filter((candidat) => candidat.nom === name), ["status"], request, true))());
// L'onglet de contenu affiché, et lui seul : sa commande, sur la box de son projet.
// Aucun — un terminal, « Tous les projets » — ou un nom qui n'est pas celui d'un onglet : plus rien n'est lu pour lui.
// La page des coûts de l'app (#1022), elle, n'a pas de projet : elle lit `station` sur la box de chaque
// projet qu'elle sert encore — ses chiffres sont tous projets confondus (vue/cost/tete.js).
ipcMain.on("onglet", (_, name: unknown, id: unknown, request: number) => {
  const commands = commandsDe(id);
  ongletLu = { id, demande: request };
  const lus = projectsLus(id, name, affichee().projets);
  standbyDOnglet.regarder(commands.length === 0 ? [] : lus, commands, request);
});
// « Tous les projets » : le `status` de chacun — ce qui bloque un projet, depuis quand ses décisions
// attendent, une station saturée : ce que l'accueil dit en une ligne et que `faits` ne porte pas.
ipcMain.on("tous", (_, request: number) => (voir = () => regarder(projects(), ["status"], request))());
// La vue a posé sa barre — au démarrage, puis à chaque changement du fichier des projets.
ipcMain.on("faits", (_, request: number) => {
  facts.oublier();
  tellLHome(home.oublier());
  // Chaque projet qui se lit — sur sa box ou ici — a sa bande dès maintenant : rien n'y est encore vérifié.
  for (const bande of bandes.ouvrir(projects().filter(lisible).map(({ nom: name }) => name))) { dernieresBandes.set(bande.projet, bande); tell("alertes", bande); }
  factsWatch.regarder(projects(), [COMMAND], request);
  controlerTout();
});
// « réessayer maintenant » (#728) : le tableau est relu tout de suite, sur GitHub — pas la lecture
// d'il y a quelques secondes —, sans effacer ce qui en était tenu.
ipcMain.on("relireBox", (_, request: number) => {
  tableaux.oublier();
  factsWatch.regarder(projects(), [COMMAND], request);
});
// Les tickets `fire` d'un projet, lus sur GitHub par le `gh` du poste (feu.ts) : ce que la box ne
// disant plus rien, le rail sait encore. Jamais par la box — c'est justement elle qui ne répond pas.
// Les adresses que GitHub a rendues pour ces tickets : un numéro de la liste s'ouvre par elles, la box ne les dit plus.
const adressesDeFeu = new Map<string, Map<number, string>>();
ipcMain.handle("lireFeu", async (_, name: unknown) => {
  const vise = connu(name);
  if (vise === undefined) return undefined;
  const feu = await lireFeu({ gh: process.env.BRIGADE_GH_BIN || "gh", delaiMs: 30_000 }, vise.dossier);
  if ("tickets" in feu) adressesDeFeu.set(String(name), new Map(feu.tickets.flatMap(({ ticket, url }) => (url === undefined ? [] : [[ticket, url] as const]))));
  return feu;
});
// Un ticket du rail s'ouvre sur son issue, dans le navigateur du poste : la vue nomme le
// projet et le ticket, l'adresse est celle que la box a rendue (facts.ts) — ou, pour une issue
// qui n'est pas encore sur le rail, celle que `manager upstream` a donnée (amont.ts). Rend si elle a été ouverte.
ipcMain.handle("ouvrirIssue", (_, name: unknown, ticket: unknown) => {
  const adresse = facts.adresse(name, ticket) ?? amonts.adresse(name, ticket) ?? (typeof ticket === "number" ? adressesDeFeu.get(String(name))?.get(ticket) : undefined);
  return adresse === undefined ? false : shell.openExternal(adresse).then(
    () => true,
    () => false,
  );
});
// Les checks du dépôt d'un projet, d'une alerte du rail qui en nomme un (#4238) : la page que la dernière lecture permet de
// trouver (facts.ts). Rend si elle a été ouverte.
ipcMain.handle("ouvrirLesChecks", (_, name: unknown) => facts.ouvrirLesChecks(name, (adresse) => shell.openExternal(adresse)));
// Un ticket de Livré s'ouvre aussi sur sa PR mergée : l'adresse est celle que la box a donnée
// pour lui (facts.ts). Rend si elle a été ouverte.
ipcMain.handle("ouvrirPr", (_, name: unknown, ticket: unknown) => {
  const adresse = facts.pr(name, ticket);
  return adresse === undefined ? false : shell.openExternal(adresse).then(
    () => true,
    () => false,
  );
});
// La PR du cook d'un ticket s'ouvre depuis sa fiche (#1846) : la vue nomme le projet et le ticket, l'adresse est celle
// que la dernière lecture de GitHub donne pour son cook. Rend si elle a été ouverte.
ipcMain.handle("ouvrirPrDuCook", (_, name: unknown, ticket: unknown) => {
  const adresse = tableaux.dernier(name)?.activites.find((activity) => activity.ticket === ticket)?.pr?.url;
  return adresse === undefined || URL.parse(adresse)?.protocol !== "https:"
    ? false
    : shell.openExternal(adresse).then(
        () => true,
        () => false,
      );
});
ipcMain.on("ecrire", (_, id: number, donnees: string) => terminaux.ecrire(id, donnees));
ipcMain.handle("propositionsDuSecond", () => propositionsDuSecond?.vu() ?? {});
// Le chef a répondu au second — d'un clic, dont la vue a déjà tapé le choix dans son terminal, ou en tapant : le canal
// l'efface, s'il porte encore la proposition à laquelle il a répondu.
ipcMain.handle("repondreAuSecond", (_, name: unknown, answer: AnswerDuChef) => {
  const vise = connu(name);
  if (vise === undefined || propositionsDuSecond === undefined) return { state: "refused", reason: "nothing to answer: this project's second is not followed", current: null };
  return propositionsDuSecond.repondre(vise.nom, answer);
});
ipcMain.on("redimensionner", (_, id: number, colonnes: number, lines: number) => terminaux.redimensionner(id, colonnes, lines));

// Les pty appartiennent à l'app, pas à la fenêtre — mais il n'y a qu'une
// fenêtre : la fermer, c'est quitter, et quitter arrête tous les terminaux.
app.on("window-all-closed", () => app.quit());
app.on("will-quit", () => {
  suivi.fermer();
  barDeMenus.fermer();
  preferences.fermer();
  terminaux.fermer();
  propositionsDuSecond?.arreter();
  turns.fermer();
  standby.fermer();
  standbyDOnglet.fermer();
  factsWatch.fermer();
  standbyDeLAmont.fermer();
  retards.fermer();
  update.fermer();
  clearInterval(verificationsDeVersion);
  stations.fermer();
  clearInterval(controles);
  // La station de l'ordinateur ne s'arrête pas avec l'app (#3630) : l'app cesse seulement de la regarder, même pour
  // sa mise à jour. Sauf sous Windows, où l'installeur remplace le `node` que la station de fond joue (#3632) : son hôte
  // est arrêté, la station avec lui (son entrée fermée), et l'app rouverte la relance.
  const hoteDuBackground = quitterPourUpdate && plateforme === "win32" ? stationLocale?.pid() : undefined;
  stationLocale?.fermer();
  if (hoteDuBackground !== undefined) {
    try {
      process.kill(hoteDuBackground);
    } catch (error) {
      console.error(`brigade: the background station (pid ${hoteDuBackground}) could not be stopped for the app update — ${error instanceof Error ? error.message : String(error)}`);
    }
  }
});
// Revenir à l'app relit le fichier : le chef revient de son éditeur, et la
// veille du fichier n'a pas à être seule à le savoir. Et le retard des clones : il
// revient peut-être d'un `git pull`, ou d'une heure pendant laquelle on a livré.
app.on("browser-window-focus", () => {
  suivi.relire();
  void retards.relire();
  // Et les préférences du chef : il revient peut-être d'un autre appareil, où il les a changées.
  void preferences.tirer();
});

// Sous Windows, une notification ne s'affiche que pour une app qui a son identifiant de modèle
// d'application : celui d'Electron lancé depuis le dépôt est son exécutable (la doc d'Electron,
// « Notifications »). Un Mac n'en a pas besoin.
if (plateforme === "win32") app.setAppUserModelId(process.execPath);

// Pas d'`await` au premier niveau : Electron n'annonce « prêt » qu'une fois ce
// module chargé en entier — l'attendre ici, c'est ne jamais démarrer.
void app.whenReady().then(() => {
  // L'installeur attend que l'app soit fermée pour la remplacer.
  if (installeeAuLaunch) return app.quit();
  servirLesAgents();
  // La commande `brigade` du chef (#4072) : posée dans ~/.local/bin à chaque lancement de l'app installée, à sa version.
  poserLaCommand({ plateforme, facon: emplacements.facon, maison: homedir(), version: app.getVersion(), runtime: emplacements.runtime, node: emplacements.node, racine: racineDeLaStation, chemin: process.env.PATH ?? "" });
  // Mac installé : le .app porte son icône. Sous `npm start`, on pose celle de brigade à la main.
  // Windows : l'exécutable garde l'icône d'Electron, la fenêtre reçoit donc toujours la sienne — le
  // `Brigade.ico` posé à côté de l'exécutable une fois installée.
  const icone = join(import.meta.dirname, "..", "packaging", "icones", "Brigade-1024.png");
  const iconeDock = join(import.meta.dirname, "..", "packaging", "icones", "Brigade-dock-1024.png");
  const iconeWindows = app.isPackaged ? join(dirname(process.execPath), "Brigade.ico") : icone;
  // Sur un Mac, le .dmg est empaqueté (son exécutable s'appelle Brigade) : l'icône du Dock est celle de son bundle.
  if (estUnMac(plateforme) && !app.isPackaged) poserLIconeDuDock(iconeDock, (chemin) => app.dock?.setIcon(chemin));
  // L'entrée d'aide : les Discussions du dépôt (#3258).
  Menu.setApplicationMenu(Menu.buildFromTemplate(menuDeLApp((url) => shell.openExternal(url), estUnMac(plateforme))));
  fenetre = new BrowserWindow({
    ...(plateforme === "win32" ? { icon: iconeWindows } : {}),
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
  barPrete = true;
  poserLaBarDeMenus();
  // La première lecture du retard des clones : la vue la reçoit, ou la trouve à son démarrage.
  void retards.relire();
  // La première vérification des versions publiées, puis une tous les quarts d'heure.
  update.demarrer();
  // Et celle de la ligne d'une version plus haute, à la même cadence.
  verifierLaVersion();
  verificationsDeVersion = setInterval(verifierLaVersion, CADENCE_DES_VERSIONS_MS);
  // Les projets déclarés avant que les couleurs existent reçoivent les leurs, une fois.
  colorer();
  // Les préférences du chef : lues dans son gist — qui en prend celles du fichier, s'il n'en a encore
  // aucune —, puis relues chaque minute. Celles du gist l'emportent sur les couleurs tout juste tirées.
  preferences.demarrer();
  return fenetre.loadFile(join(import.meta.dirname, "vue/index.html"));
}).catch((error: unknown) => {
  // Un démarrage qui échoue ne reste pas muet : le chef lit en une phrase que la fenêtre ne s'ouvre pas, et quoi faire (#4071).
  // Le détail, qu'il ne saurait lire, va au journal.
  console.error(`brigade: the window could not be shown — ${error instanceof Error ? (error.stack ?? error.message) : String(error)}`);
  dialog.showErrorBox("brigade could not start", `Brigade could not show its window, so quit it and open it again, and if it still does not show, download it again from ${RELEASES_URL} and reinstall it.`);
  app.quit();
});
