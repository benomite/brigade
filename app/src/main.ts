// L'app : une fenêtre, et le process qui tient les terminaux, la veille des
// box et le suivi du fichier des projets.
import { homedir } from "node:os";
import { dirname, join } from "node:path";
import { pathToFileURL } from "node:url";
import { app, BrowserWindow, dialog, ipcMain, Notification, powerMonitor, shell } from "electron";
import { tenirAccueil, type Accueil } from "./accueil.ts";
import { tenirBandes } from "./alertes.ts";
import { lireFeu } from "./feu.ts";
import { ALLUMAGE, compter } from "./allumage.ts";
import { COMMANDE as COMMANDE_AMONT, tenirAmont } from "./amont.ts";
import { mettreAPart } from "./attend.ts";
import { reglerLePlafond } from "./plafond.ts";
import { cibleDeLaStation, DELAI_S, etatDuCode, revoquerUnTelephone, telephonesAppaires, tirerUnCode } from "./telephones-de-station.ts";
import { pourLaBarre } from "./barre.ts";
import { BOUTONS, ecritPar, ecritPourLeCloser, REGLER_LE_CLOSER } from "./boutons.ts";
import { lancerGeste, lancerLa, ouvrirVeille, type Lu, type Servi } from "./box.ts";
import { agirSurLeCloser } from "./closer-lancement.ts";
import { reponseLue } from "./carte-todo.ts";
import { situationDe } from "./histoire.ts";
import { commenter, demanderAuSecond } from "./discussion.ts";
import { discussionDeGitHub, histoireDeGitHub } from "./fiche-github.ts";
import { cheminConfiguration, EXEMPLE, type Projet } from "./config.ts";
import { confirmationDe } from "./confirmation.ts";
import { cuireSurLaStation } from "./cuisson.ts";
import { reglerLePlafond as reglerLePlafondDeCalibrage } from "./plafond-de-calibrage.ts";
import { lireLesReglages, proposerLeReglage } from "./reglages-du-projet.ts";
import { choix, entieres, PALETTE } from "./couleurs.ts";
import { blocDesOrdinaires } from "./ordinaires.ts";
import { ecrireAttente, GESTES_D_ATTENTE } from "./attente.ts";
import { GESTES_DE_LA_CUISINE } from "./cuisine.ts";
import { BANNIERE, COMMANDE, rangerLeRailPublie, tenirFaits, type RailDuProjetLu } from "./faits.ts";
import { clientGitHub, parFetch } from "./tableau/client.ts";
import { jetonDeGh } from "./tableau/jeton-gh.ts";
import { lireLeTableauDuDepot } from "./tableau/lecture.ts";
import { ouvrirVeilleDuTableau, tenirLecturesDuTableau } from "./tableau/rail.ts";
import { arriveeDeCarte, gesteDeFiche as gesteDeFicheAuTableau, reponseALaFile, reponseDeCarte as reponseDeCarteAuTableau } from "./tableau-gestes/rail.ts";
import { clientDesGestesGitHub, posterParFetch } from "./tableau-gestes/github.ts";
import { demandeDe, demandeDeLAlerte, demandeSurLeTicket, noteDeLaDemande } from "./demande.ts";
import { CONFIRMES, DIRECTS, ecrireGeste, GRANTS } from "./gestes.ts";
import { gestesDeCarte, jouerGesteDeFiche } from "./gestes-fiche.ts";
import { changerLaPriorite, clientDeLaPriorite, envoyerParFetch, tenirPrioritesEcrites } from "./priorite.ts";
import { voir as voirFiabilite } from "./fiabilite.ts";
import { GESTES_DES_GRANTS, voir as voirGrants } from "./grants.ts";
import { ajouterALApp, depotDeLOrigine, lireClone } from "./ajout.ts";
import { tenirConnexionGitHub } from "./connexion-github.ts";
import { cheminDe, emplacementsDe, lireCheminDuShell } from "./emplacements.ts";
import { chercherUneMiseAJour, posteDe, refuser as refuserLaVersion, type Avis as AvisDeVersion } from "./mise-a-jour/avis.ts";
import { tenirMiseAJour } from "./mise-a-jour/etat.ts";
import { fluxDe, formatDe } from "./mise-a-jour/flux.ts";
import { installeurDuPoste } from "./mise-a-jour/installation.ts";
import { COMMANDE as COMMANDE_MANAGER, voir as voirManager } from "./manager.ts";
import { machineChoisie, machinesDe } from "./machines.ts";
import { commandesDe, CUISINE, ONGLETS, projetsLus, RUBRIQUES } from "./onglets.ts";
import { ouvrirTransfert, tenirPages } from "./page.ts";
import { jouerPanne } from "./pannes/gestes.ts";
import { gistLocal, tenirLogin } from "./pannes/login.ts";
import { demenageurDuRuntime } from "./projets/demenagement.ts";
import { depotsDuChef } from "./projets/github.ts";
import { EFFORTS, hoteDeLaStation, MODELES, tenirProjets, type DefautsDeLaMachine, type VuDesProjets } from "./projets/projets.ts";
import { memoireDansFichier, tenirNotifications } from "./notification.ts";
import { tenirCuisinesIci } from "./poste/cuisine-ici.ts";
import { estUnMac, nomDuPoste, persistantSur, shellDuPoste } from "./plateforme.ts";
import { cuisinesIci, roleDe } from "./poste/role.ts";
import { ceQueFournitCetOrdinateur } from "./stations/fournit.ts";
import { tenirStationLocale } from "./poste/station.ts";
import { ouvrirPty } from "./pty.ts";
import { ouvrirDUneStation, type StationsDuChef } from "./premier-lancement.ts";
import type { PlanDuSecond } from "../../runtime/src/second/lancement.ts";
import { LABEL_RETENUE, lever, lireQuestion, repondre as repondreQuestion, titreDe, type Lue as QuestionLue } from "./question.ts";
import { lireCapture } from "./captures.ts";
import { relanceDe, tenirPassage } from "./rattrapage.ts";
import { tenirRepondues } from "./repondues.ts";
import { APP, tenirRetards } from "./retard.ts";
import { ouvrirTours } from "./saisie.ts";
import { type Propositions, type ReponseDuChef, tenirLesPropositions } from "./second/propositions.ts";
import { DELAIS, lancerRetrait, tenirRetraits } from "./retrait.ts";
import { ouvrirRunner } from "./runner.ts";
import { tenirServices } from "./service.ts";
import { souvenirsDansFichier } from "./souvenirs.ts";
import { githubDesStations } from "./stations/github.ts";
import { choixDesProjets, type StationsDuCompte } from "./stations-du-compte.ts";
import { tenirStations, type VuDesStations } from "./stations/stations.ts";
import { versionsDansFichier } from "./stations/versions.ts";
import { suivreConfiguration } from "./suivi.ts";
import { gistDesPreferences } from "./reglages-perso/gist.ts";
import { reglagesPerso } from "./reglages-perso/reglages-perso.ts";
import { tenirPreferences } from "./reglages-perso/synchro.ts";
import { ouvrirTerminaux } from "./terminaux.ts";

// Où sont le runtime de la station, son `node` et le clone de l'app : dans le dépôt, ou dans le
// paquet de l'app installée (emplacements.ts). Installée, l'app prend le PATH du shell de
// connexion du chef avant de rien lancer : ouverte depuis le Finder, elle n'a que celui du système.
const emplacements = emplacementsDe({ ressources: process.resourcesPath, src: import.meta.dirname, env: process.env });
// Ce qui dépend de la plateforme de ce poste — son nom à l'écran, son shell, ses sessions — vient
// d'un seul module (plateforme.ts) : le reste de l'app est le même code sur un Mac et sous Windows.
const plateforme = process.platform;
const shellIci = shellDuPoste(plateforme, process.env);
const chemin = cheminDe({ emplacements, env: process.env, maison: homedir(), plateforme, duShell: () => (plateforme === "win32" ? undefined : lireCheminDuShell(shellIci.commande, 10_000)) });
if (chemin !== undefined) process.env.PATH = chemin;

// Ce qu'est l'app sur cette machine (poste/role.ts) : une station sur un ordinateur, le runtime
// à côté d'elle dans son clone, ou dans son paquet une fois installée ; un poste sur un
// téléphone — il pilote, rien n'y cuit, ni sa station ni celles que ses projets lui confient.
const role = roleDe({ plateforme, runtime: emplacements.runtime, env: process.env });
// Le répertoire de la station de cet ordinateur : `station/`, à côté du fichier des projets.
const racineDeLaStation = process.env.BRIGADE_STATION_DIR || join(dirname(cheminConfiguration()), "station");
// Où cuit chaque projet (poste/cuisine-ici.ts) : un projet que la station de cet ordinateur sert
// se lit ici, par son geste, sans `ssh` — même s'il déclare un `hote` ; les autres, sur leur box.
// C'est relu à chaque lecture : une cuisine qui change de place est lue à la nouvelle dès la
// suivante, et la vue le sait aussitôt.
const cuisines = tenirCuisinesIci({
  locale: role.role === "station" ? { node: emplacements.node, runtime: emplacements.runtime, racine: racineDeLaStation, env: process.env } : undefined,
  surChangement: () => {
    dire("configuration", affichee(), []);
    direLAccueil(accueil.relire());
  },
});
// Un projet dont quelque chose se lit — sa box, ou cet ordinateur —, et qui n'est pas désinstallé.
const lisible = ({ nom, box, desinstalle }: Projet) => desinstalle === undefined && (box !== undefined || cuisines.ici(nom));

let fenetre: BrowserWindow | undefined;
const dire = (canal: string, ...faits: unknown[]) => {
  if (fenetre !== undefined && !fenetre.isDestroyed()) fenetre.webContents.send(canal, ...faits);
};

// L'app installée se tient à jour sur les versions publiées (mise-a-jour/) : elle regarde au
// lancement puis toutes les six heures, télécharge la nouvelle, et l'installe au geste du chef ou
// à son lancement suivant. Lancée depuis le dépôt, elle ne regarde rien : son clone la met à jour.
// Ce qu'elle télécharge vit à côté du fichier des projets, sous `mise-a-jour/`. Le même chemin sur
// un Mac et sous Windows : seuls l'installeur publié qu'elle lit et ce qui le joue sont du poste.
const dossierDeMiseAJour = join(dirname(cheminConfiguration()), "mise-a-jour");
const installeur = installeurDuPoste({ plateforme, ressources: process.resourcesPath, executable: process.execPath, pid: process.pid, dossier: dossierDeMiseAJour });
const miseAJour = tenirMiseAJour({
  version: app.getVersion(),
  inactive: emplacements.facon === "installee" ? undefined : "launched from the repository, it updates through its clone",
  flux: fluxDe(process.env.BRIGADE_APP_MISE_A_JOUR_SOURCE, formatDe(plateforme)),
  dossier: dossierDeMiseAJour,
  installable: installeur.installable,
  installer: installeur.installer,
  quitter: () => app.quit(),
  surEtat: (etat) => dire("miseAJour", etat),
});
// Une version téléchargée lors d'une session précédente s'installe avant que rien ne démarre : sa
// station n'est pas lancée, sa fenêtre ne s'ouvre pas — l'app se ferme, l'installeur la rouvre sur
// la nouvelle version.
const installeeAuLancement = miseAJour.auLancement();
// Le bandeau d'une version plus haute (#1528, mise-a-jour/avis.ts) : sur l'app installée d'un Mac ou d'un PC, la plus
// haute version publiée au-dessus de celle qui tourne, avec le lien direct de son paquet — relue au lancement, puis
// toutes les six heures. La version que le chef écarte est gardée à côté du fichier des projets, hors du dossier que la
// mise à jour vide. Lancée depuis le dépôt, l'app ne regarde rien : son clone la met à jour.
const posteDeLAvis = emplacements.facon === "installee" ? posteDe(plateforme) : undefined;
const versionEcartee = join(dirname(cheminConfiguration()), "version-ecartee.json");
let avisDeVersion: Promise<AvisDeVersion | undefined> = Promise.resolve(undefined);
const verifierLaVersion = () => {
  if (posteDeLAvis === undefined) return;
  avisDeVersion = chercherUneMiseAJour({ version: app.getVersion(), poste: posteDeLAvis, fichier: versionEcartee });
  void avisDeVersion.then((avis) => dire("avisDeVersion", avis));
};
let verificationsDeVersion: ReturnType<typeof setInterval> | undefined;

// Chaque second dit ses tours à l'app, par ses crochets, dans un fichier à lui (saisie.ts) :
// c'est d'après eux qu'un geste direct part, ou dit qu'il ne peut pas.
// Les shells persistants ouverts sont retenus à côté du fichier des projets (souvenirs.ts) :
// rouverte, l'app les rattache à leur session.
const tours = ouvrirTours();
// Le second part comme le runtime le dit (runtime/src/second/lancement.ts, #1433) : le `claude` que le PATH donne, et
// sous Windows ce qui le lance — ou pourquoi il ne part pas, chaque outil qui manque nommé avec ce qui l'obtient
// (#1435). Son plan est chargé une fois, du runtime qui est à côté de l'app (emplacements.ts) ; tant qu'il ne l'est pas,
// `claude` est lancé par son nom, comme avant lui. S'il ne se charge pas, le second le dit.
type Planifier = (dossier: string, args: readonly string[]) => PlanDuSecond;
let planifier: Planifier | undefined;
void Promise.all([
  import(pathToFileURL(join(emplacements.runtime, "src", "second", "lancement.ts")).href) as Promise<typeof import("../../runtime/src/second/lancement.ts")>,
  import(pathToFileURL(join(emplacements.runtime, "src", "second", "outils.ts")).href) as Promise<typeof import("../../runtime/src/second/outils.ts")>,
]).then(
  ([{ planDuSecond }, { programmesDe }]) => {
    planifier = (dossier, args) => planDuSecond({ folder: dossier, args, env: process.env, programmes: programmesDe(process.env) });
  },
  (erreur: unknown) => {
    const pourquoi = String(erreur instanceof Error ? erreur.message : erreur).replace(/[.\s]+$/, "");
    planifier = () => ({ state: "cannot-start", cause: "invalid", reason: `The second cannot start: the app could not load what checks its tools (${pourquoi}).` });
  },
);
const terminaux = ouvrirTerminaux({
  ouvrirPty,
  tours: tours.de,
  planDuSecond: (dossier, args) => planifier?.(dossier, args) ?? { state: "ready", launch: { command: process.env.BRIGADE_CLAUDE_BIN || "claude", args: [...args], verbatim: false, folder: dossier, env: {} }, missing: [], tools: [] },
  souvenirs: souvenirsDansFichier(join(dirname(cheminConfiguration()), "shells.json")),
  // Jamais posée hors des essais, comme pour la veille.
  ssh: process.env.BRIGADE_SSH_BIN || "ssh",
  node: emplacements.node,
  // La même doublure que le runtime : jamais posée hors des essais.
  claude: process.env.BRIGADE_CLAUDE_BIN || "claude",
  shell: shellIci.commande,
  argsDuShell: shellIci.args,
  persistantIci: persistantSur(plateforme),
  surSortie: (id, donnees) => dire("sortie", id, donnees),
  surEtat: (terminal) => dire("etat", terminal),
});

// La vue du rail d'un projet — ses colonnes, ses cartes, sa file TODO, l'état de sa cuisine, sa bande — se lit du
// tableau de la cuisine que sa box publie sur GitHub (#1694, tableau/rail.ts), avec le jeton du `gh` de ce poste : ni
// `ssh`, ni tailnet, ni box jointe. Les veilles du rail, des faits, du manager et de l'amont lisent toutes ce même
// tableau, une lecture à la fois par projet, reprise par chacune tant qu'elle a moins de quinze secondes. Le dépôt d'un
// projet est son `depot`, ou celui de l'`origin` de son dossier. Un projet que ni sa box ni cet ordinateur ne servent
// garde son écran (#1435) : son rail n'est pas lu ici.
const appelerGitHub = clientGitHub({ jeton: jetonDeGh({ gh: process.env.BRIGADE_GH_BIN || "gh", delaiMs: 10_000 }), envoyer: parFetch() });
const depotDuProjet = async (projet: Projet) => projet.depot ?? (await depotDeLOrigine(process.env.BRIGADE_GIT_BIN || "git", projet.dossier)) ?? projet.nom;
const tableaux = tenirLecturesDuTableau<Projet>({ lire: async (projet) => lireLeTableauDuDepot({ depot: await depotDuProjet(projet), appeler: appelerGitHub }), fraicheurMs: 15_000 });
const railLisible = (projet: Projet) => cuisines.cuisineDe(projet) !== undefined;

// Seul ce qui est affiché est lu — un projet, ou chacun dans « Tous les projets » : toutes
// les trente secondes, sur le tableau de la cuisine. Ce qui attend le chef en est mis à
// part ici, avant la vue.
// Les veilles des onglets (Cooks, Settings) et les gestes qui partent sur la box se partagent le
// passage de chaque projet : à eux tous, un projet n'ouvre qu'une connexion à la fois — sshd refuse
// au hasard ce qui arrive de front.
const passage = new Map<string, Promise<unknown>>();
const veille = ouvrirVeilleDuTableau({
  lire: tableaux.lire,
  intervalleMs: 30_000,
  lisible: railLisible,
  surLecture: (lecture) => {
    const montree = mettreAPart(lecture);
    // Les serveurs que ce `status` montre : un transfert dont le serveur n'y est plus est fermé.
    dire("lecture", montree, pages.recevoir(montree));
    // Le rail se dessine aussi de ce `status` : son bloc dit en mots ce qui attend le chef, et sa
    // ligne `rail` ce que chaque carte porte du ticket.
    const redessine = faits.attendre(montree);
    if (redessine !== undefined) dire("faits", redessine);
    // Une question répondue qui attend le manager : son issue est relue de loin en loin.
    relireRepondues(montree.projet);
    // Et la bande d'alertes : la cause d'une cuisine retenue, et le grant, se lisent dans ses lignes de tête.
    direLaBande(bandes.status(montree));
    // Et l'accueil : ce qui bloque un projet, et depuis quand ses décisions attendent.
    direLAccueil(accueil.status(montree));
  },
});
// L'onglet de contenu affiché — Rail, Cooks, Manager, Grants ou Log — a sa propre veille,
// réglée pareil : sa commande est lue pour elle-même, et son échec se lit dans
// l'onglet sans rien retirer à ce que `status` dit à côté. Sur un terminal, elle ne lit rien.
// La page des coûts de l'app (#1022) est lue par elle aussi : elle prend la place d'un onglet, l'espace fermé.
// La lecture de l'onglet Manager part avec ce qui s'y pose au-dessus du texte : l'état du
// manager, lu dans cette sortie (manager.ts) ; celle de l'onglet Grants, avec l'état des
// grants (grants.ts) ; celle de l'onglet Cooks, avec la fiabilité des cooks (fiabilite.ts, #1699).
// `ongletLu` : l'onglet que la veille lit, et sa demande.
let ongletLu: { id: unknown; demande: number } | undefined;
const veilleDOnglet = ouvrirVeille({
  ssh: process.env.BRIGADE_SSH_BIN || "ssh",
  intervalleMs: 30_000,
  delaiMs: 30_000,
  connexionS: 10,
  passage,
  cuisine: cuisines.cuisineDe,
  surLecture: (lecture) => {
    const lu = ongletLu?.demande === lecture.demande ? ongletLu.id : undefined;
    dire("contenu", lecture, lu === "manager" ? voirManager(lecture) : undefined, lu === "grants" ? voirGrants(lecture) : undefined, lu === CUISINE ? voirFiabilite(lecture) : undefined);
    // La même lecture que celle de la veille du manager, à l'instant : la bande la reprend sans attendre la suivante.
    if (lu === "manager") direLaBande(bandes.manager(lecture));
  },
});
// Ce qui se dessine — la pastille de chaque projet dans la barre, sa carte, son rail,
// sa bannière d'arrêt — a la sienne aussi, et elle lit tous les projets, quel que soit
// l'écran : la barre est toujours affichée. Une box qui ne rend pas `faits` (un runtime
// plus ancien) le dit là où ils se dessinent, et `status` reste lisible à côté.
// Les questions du manager que le chef a répondues (repondues.ts) : leur carte quitte TODO pour
// WAITING sans attendre le manager.
const repondues = tenirRepondues();
// Les priorités que le chef vient de changer depuis une fiche (priorite.ts) : le rail les montre tant que le tableau
// de la cuisine montre encore les anciennes.
const prioritesEcrites = tenirPrioritesEcrites();
const faits = tenirFaits(
  (projet) => repondues.de(projet),
  (projet) => prioritesEcrites.de(projet),
);
// L'accueil (accueil.ts) : une ligne par projet, une par station, et la ligne de santé — redessiné à
// chaque lecture qui le change, de `faits`, de `status` ou des stations sur GitHub.
const accueil = tenirAccueil({ locale: () => (stationLocale === undefined ? null : gistLocal(racineDeLaStation)), projets: () => projets().map((projet) => ({ nom: projet.nom, box: lisible(projet), desinstalle: projet.desinstalle !== undefined })) });
function direLAccueil(vu: Accueil | undefined): void {
  if (vu !== undefined) dire("accueil", vu);
}
// La bande d'alertes de chaque projet (alertes.ts) : le manager, la cuisine, le grant —
// redessinée à chaque lecture qui la change, de `faits`, de `status` ou de `manager`.
const bandes = tenirBandes();
// Une lecture qui ne change rien à la bande ne la redessine pas : même contenu, aucun mouvement (#721).
const dernieresBandes = new Map<string, unknown>();
function direLaBande(bande: { projet: string }): void {
  if (dernieresBandes.get(bande.projet) === bande) return;
  dernieresBandes.set(bande.projet, bande);
  dire("alertes", bande);
}
// L'urgence d'un projet — toute sa cuisine attend le chef — se dit au système, une notification par
// annonce du runtime, la fenêtre devant, derrière ou réduite (notification.ts). Son clic ramène la
// fenêtre au premier plan, et la vue ouvre le projet sur sa ligne d'urgence et son geste. Ce que le
// chef a cliqué est retenu à côté du fichier des projets : rouverte, l'app ne le lui redit pas.
// Chaque notification est tenue jusqu'à la suivante du même projet : lâchée, elle perdrait son clic.
const montrees = new Map<string, Notification>();
const urgences = tenirNotifications({
  memoire: memoireDansFichier(join(dirname(cheminConfiguration()), "urgences.json")),
  montrer: ({ projet, titre, corps }, auClic) => {
    if (!Notification.isSupported()) return void console.error(`brigade: ${projet} — ${corps} (this system shows no notification)`);
    montrees.get(projet)?.close();
    const notification = new Notification({ title: titre, body: corps, urgency: "critical" });
    notification.on("click", auClic);
    montrees.set(projet, notification);
    notification.show();
  },
  ouvrir: (projet) => {
    if (fenetre === undefined || fenetre.isDestroyed()) return;
    if (fenetre.isMinimized()) fenetre.restore();
    fenetre.show();
    fenetre.focus();
    app.focus({ steal: true });
    dire("urgence", projet);
  },
});
const veilleDesFaits = ouvrirVeilleDuTableau({
  lire: tableaux.lire,
  intervalleMs: 30_000,
  lisible: railLisible,
  surLecture: (lecture) => {
    dire("faits", faits.recevoir(lecture));
    direLaBande(bandes.faits(lecture));
    direLAccueil(accueil.faits(lecture));
    // Une annonce d'urgence que le runtime vient de faire se dit au système.
    const lus = faits.dernier(lecture.projet);
    if (lus !== undefined) urgences.recevoir(lecture.projet, lus.faits);
  },
});

// L'état du manager n'est pas dit par la file (#438) : l'app le lit elle-même, pour chaque projet
// et quel que soit l'écran, au même rythme que `faits` — la ligne de l'interrupteur du projet, que
// le manager suit et que le tableau porte (tableau/rail.ts). Une lecture qui échoue donne
// « non vérifié » avec son motif, jamais « sain ».
const veilleDuManager = ouvrirVeilleDuTableau({
  lire: tableaux.lire,
  intervalleMs: 30_000,
  lisible: railLisible,
  surLecture: (lecture) => {
    direLaBande(bandes.manager(lecture));
    // Ce qui est en amont du rail dit aussi si le manager le lit : sa phrase suit son état.
    const amont = amonts.manager(lecture);
    if (amont !== undefined) dire("amont", amont);
  },
});

// Ce qui n'est pas encore sur le rail (amont.ts) : `manager upstream`, lu pour le projet affiché
// seulement — son nombre se pose à côté de son rail. Le tableau de la cuisine ne le publie pas
// (#1694) : la vue n'en dit rien (#1770), jamais « rien à venir », et aucune box n'est jointe pour lui.
const amonts = tenirAmont();
const veilleDeLAmont = ouvrirVeilleDuTableau({
  lire: tableaux.lire,
  intervalleMs: 60_000,
  lisible: railLisible,
  surLecture: (lecture) => dire("amont", amonts.recevoir(lecture)),
});

// La page d'un worktree servi, dans le navigateur du poste (page.ts) : le port que `status`
// montre est amené ici par un transfert de port de `ssh` — par le passage du projet, le temps
// qu'il s'ouvre, et trente secondes au plus —, puis l'adresse locale est ouverte comme une issue.
const pages = tenirPages({
  transferer: (servi, port, signal) => {
    // Jamais posée hors des essais, comme pour la veille.
    const rendu = (passage.get(servi.nom) ?? Promise.resolve()).then(() => ouvrirTransfert({ ssh: process.env.BRIGADE_SSH_BIN || "ssh", delaiMs: 30_000, connexionS: 10 }, servi, port, signal));
    passage.set(servi.nom, rendu);
    return rendu;
  },
  ouvrir: (url) => shell.openExternal(url),
});

// La veille de `status` change de projets : le bloc `attend` de ceux qu'elle ne lit plus est
// lâché, et leur rail redessiné sans lui — il ne serait plus rafraîchi, quand leurs faits le sont.
// `espace` : c'est l'espace d'un projet, et son rail — ce qui est en amont s'y lit aussi.
function regarder(vus: Parameters<typeof veille.regarder>[0], commandes: readonly string[], demande: number, espace = false): void {
  veille.regarder(vus, commandes, demande);
  const amont = espace ? vus : [];
  veilleDeLAmont.regarder(amont, [COMMANDE_AMONT], demande);
  amonts.veiller(amont.map(({ nom }) => nom));
  for (const redessine of faits.veiller(vus.map(({ nom }) => nom))) dire("faits", redessine);
  for (const bande of bandes.veiller(vus.filter(lisible).map(({ nom }) => nom))) { dernieresBandes.set(bande.projet, bande); dire("alertes", bande); }
  direLAccueil(accueil.veiller(vus.map(({ nom }) => nom)));
}

// L'installation guidée d'un projet (service.ts) : ses étapes, lues et faites par les
// commandes `installation` du runtime de sa box, lancées une à une par le passage du projet
// comme les veilles — ou par la station de cet ordinateur, sans `ssh`, quand c'est elle qui fait
// tourner sa cuisine. Chacune a deux minutes : la vérification joint l'origine du dépôt et
// GitHub, la protection aussi. Sa session s'ouvre dans le second, son démarrage s'écrit dans
// un shell. Chaque installation qui change est poussée à la vue — et à la bande d'alertes du
// projet : installé, ce que son contrôle dit qu'il a perdu y entre (alertes.ts), jamais l'écran
// d'installation. Le contrôle d'un projet installé ne se refait pas plus d'une fois par minute.
const services = tenirServices({
  delaiMs: 120_000,
  lancer: (lu, commande) => {
    // Jamais posée hors des essais, comme pour la veille.
    const rendu = (passage.get(lu.nom) ?? Promise.resolve()).then(() => lancerLa({ ssh: process.env.BRIGADE_SSH_BIN || "ssh", delaiMs: 120_000, connexionS: 10 }, lu, commande));
    passage.set(lu.nom, rendu);
    return rendu;
  },
  cuisine: cuisines.cuisineDe,
  session: terminaux.session,
  shell: terminaux.shell,
  surGuide: (guide) => {
    dire("guide", guide);
    dire("alertes", bandes.controle(guide.projet, guide.controle));
  },
  controleMs: 60_000,
  // Une station que ce poste joue, ou cesse de jouer (#1510) : l'opération du runtime l'écrit dans le fichier des
  // projets, que l'app relit — son runner la joue alors (runtime/src/une-station.ts).
  jouerIci: async (nom, station, jouer) => {
    const { jouerIci, nePlusJouerIci } = (await import(pathToFileURL(join(emplacements.runtime, "src", "une-station.ts")).href)) as typeof import("../../runtime/src/une-station.ts");
    return (jouer ? jouerIci : nePlusJouerIci)(cheminConfiguration(), nom, station);
  },
});
// Ce qu'un projet installé a perdu — une station, un geste de box — se relit pour chacun,
// quel que soit l'écran : sa pastille dans la barre le dit aussi. Toutes les cinq minutes, et
// dès que la barre est posée ; un contrôle en route ne se double pas.
const CONTROLE_MS = 5 * 60_000;
const controlerTout = () => {
  for (const projet of projets()) if (cuisines.cuisineDe(projet) !== undefined) void services.controler(projet);
};
const controles = setInterval(controlerTout, CONTROLE_MS);

// Le runner : ce poste joue les stations que ses projets lui confient (runner.ts) — celles
// que leur box déclare `distante`. Il s'annonce, réclame, renouvelle et rend par le geste
// `pull` de la box, par le passage du projet comme les veilles ; un `ssh` a quarante-cinq
// secondes, plus que les trente que le geste laisse au runtime pour répondre. Rien n'arrive
// ici : toutes ses connexions partent du poste. Ses cooks tournent dans des worktrees du
// dossier du projet, posés à côté du fichier des projets ; ce qu'il dit de lui s'écrit dans
// le terminal qui a lancé l'app — et la box le montre, sur la ligne `présence` de `station`.
const runner = ouvrirRunner({
  // Jamais posées hors des essais, comme pour la veille.
  ssh: process.env.BRIGADE_SSH_BIN || "ssh",
  claude: process.env.BRIGADE_CLAUDE_BIN || "claude",
  git: "git",
  worktrees: join(dirname(cheminConfiguration()), "stations"),
  env: process.env,
  delaiMs: 45_000,
  connexionS: 10,
  gitMs: 120_000,
  passage,
  surEtat: ({ projet, station, dit }) => console.error(`brigade: station ${station} of “${projet}” — ${dit}`),
});

// Retirer un projet : de l'app, ou de sa box — deux gestes (retrait.ts). Le premier
// n'écrit que le fichier des projets. Le second lance le geste de désinstallation de la
// box, par le passage du projet comme les veilles : son plan, qui ne retire rien, puis
// l'exécution, refusée tant que le chef n'a pas confirmé en nommant le projet. Désinstallé,
// le projet se montre sans sa box, et sa mise en service ne vaut plus rien.
const retraits = tenirRetraits({
  chemin: cheminConfiguration(),
  retirer: (nom) => suivi.retirer(nom),
  lancer: (servi, demande) => {
    // Jamais posée hors des essais, comme pour la veille.
    const rendu = (passage.get(servi.nom) ?? Promise.resolve()).then(() => lancerRetrait({ ssh: process.env.BRIGADE_SSH_BIN || "ssh", delaiMs: demande.plan ? DELAIS.planMs : DELAIS.executionMs, connexionS: 10 }, servi, demande));
    passage.set(servi.nom, rendu);
    return rendu;
  },
  surDesinstalle: (nom) => {
    services.oublier(nom);
    pages.oublier(nom);
    // La veille de `status` tient encore sa box, quel que soit l'écran : elle est reposée sans lui.
    voir();
    // Et le runner ne joue plus rien pour lui : ses cooks sont arrêtés.
    runner.servir(cuisinesIci(role, projets()));
    dire("configuration", affichee(), []);
  },
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
// (reglages-perso/). Le fichier des projets reste ce que les écrans lisent : chaque accord y pose ce que
// le gist porte, et y prend ce que le chef a changé ici. Le dossier d'un projet et son hôte n'en partent
// jamais. Le gist illisible — GitHub injoignable, un autre compte —, l'app montre le fichier tel qu'il est.
const preferences = tenirPreferences({
  // Jamais posé hors des essais, comme pour les gists des stations.
  perso: reglagesPerso({ gist: gistDesPreferences({ gh: process.env.BRIGADE_GH_BIN || "gh", delaiMs: 30_000 }), appJson: cheminConfiguration() }),
  fichier: { preferences: () => suivi.preferences(), poserPreferences: (voulues) => suivi.poserPreferences(voulues) },
  surPanne: (raison) => console.error(`brigade: your preferences were not synced with GitHub — ${raison}`),
});

// Le fichier des projets : créé s'il manque, relu dès qu'il change. Un projet
// qui a quitté la liste — ou changé de dossier — perd ses terminaux, sa mise
// en service et ses transferts de port ; les autres n'en savent rien. Celui qui a quitté la liste n'a plus
// rien de tenu de son retrait non plus.
const suivi = suivreConfiguration({
  chemin: cheminConfiguration(),
  surChangement: (configuration, partis) => {
    partis.forEach(services.oublier);
    partis.forEach(pages.oublier);
    partis.filter((nom) => !configuration.projets.some((reste) => reste.nom === nom)).forEach(retraits.oublier);
    dire("configuration", affichee(), partis.flatMap((nom) => terminaux.quitter(nom)));
    // Les stations que le poste joue sont celles du fichier tel qu'il est maintenant.
    runner.servir(cuisinesIci(role, projets()));
    // Un clone de brigade a pu entrer dans la liste, ou en sortir.
    void retards.relire(true);
    // L'accueil a une ligne par projet du fichier, tel qu'il est maintenant.
    direLAccueil(accueil.relire());
    // Le second de chaque projet qui s'ouvre est suivi dans son dossier tel qu'il est maintenant.
    propositionsDuSecond?.suivre(projets());
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
  const refus = suivi.colorer();
  if (refus !== undefined) console.error(`brigade: the project colors could not be written — ${refus}`);
}
// Les projets tels que l'app les montre, et les lit : celui qu'elle a désinstallé de sa
// box n'en a plus (retrait.ts) — ni veille, ni bouton, ni mise en service ne l'y cherchent.
// Un projet que le fichier ne dit pas hébergé (ajouté depuis l'app) est lu sur la machine de la station qui le sert.
let dernierVuDesProjets: VuDesProjets | undefined;
const avecSaBox = (projet: Projet): Projet => {
  if (projet.box !== undefined || projet.desinstalle !== undefined) return projet;
  const hote = hoteDeLaStation(dernierVuDesProjets, projet.nom);
  return hote === undefined ? projet : { ...projet, box: { hote } };
};
const projets = () => suivi.configuration().projets.map(avecSaBox).map(retraits.vu);
const affichee = () => pourLaBarre(suivi.configuration(), (projet) => retraits.vu(avecSaBox(projet)), cuisines.ici, () => stationLocale?.tourne() === true);
// Un projet du fichier, qu'il s'ouvre ou non : sa box se lit, et se vérifie, sans son dossier.
const connu = (nom: unknown) => projets().find((candidat) => candidat.nom === nom);
// Le même, tel que le fichier le déclare : c'est avec sa box qu'il se retire, et se désinstalle.
const declare = (nom: unknown) => suivi.configuration().projets.find((candidat) => candidat.nom === nom);

// Le code de l'app vient d'un clone, et rien d'autre ne le surveille : son retard sur son
// origine est lu au démarrage, puis à chaque retour à la fenêtre — et celui du clone d'un
// projet, quand ce clone est celui de brigade (retard.ts). Lire n'écrit rien dans un clone :
// un `git` qui n'a rien rendu au bout de trente secondes est arrêté. L'app installée n'a pas
// de clone : rien ne s'en lit.
// Le dossier de l'app, dans son clone.
const dossierApp = join(import.meta.dirname, "..");
const retards = tenirRetards({
  reglages: { git: "git", delaiMs: 30_000 },
  app: emplacements.clone,
  projets,
  surLecture: (vu) => dire("code", vu),
});
// Les projets de ses stations, sous elles : ceux qu'il leur a ajoutés depuis l'app, écrits et relus
// dans le gist de chacune (projets/projets.ts) — relus à chaque lecture des stations.
let hotesLus = "";
const projetsDesStations = tenirProjets({
  github: githubDesStations({ gh: process.env.BRIGADE_GH_BIN || "gh", delaiMs: 30_000 }),
  stations: () => stations.vu()?.stations,
  depots: depotsDuChef({ gh: process.env.BRIGADE_GH_BIN || "gh", delaiMs: 30_000 }),
  // La station de cet ordinateur : c'est elle que la page d'un projet appelle « this Mac ».
  locale: () => (role.role === "station" ? gistLocal(racineDeLaStation) : null),
  // Déménager une cuisine, c'est l'opération du runtime, lancée ici avec le répertoire de la station
  // de cet ordinateur (projets/demenagement.ts) : un téléphone, qui n'a pas de runtime, n'en lance aucune.
  ...(role.role === "station"
    ? {
        accepterSansBac: async (projet: string, station: string) => {
          const { accepterSansBacASable } = (await import(pathToFileURL(join(emplacements.runtime, "src", "onboarding", "attente.ts")).href)) as typeof import("../../runtime/src/onboarding/attente.ts");
          accepterSansBacASable({ repertoireEtat: join(racineDeLaStation, "etat", projet), station });
        },
      }
    : {}),
  // Lever le refus d'un projet : la demande part par le gist de sa principale, quelle qu'elle soit — c'est
  // l'opération du runtime qui l'écrit et attend la réponse (projets/remede.ts). Le runtime est à côté de
  // l'app, du dépôt comme du paquet (emplacements.ts).
  demanderLeRemede: async (demande) => {
    const { demanderLeRemede } = (await import(pathToFileURL(join(emplacements.runtime, "src", "remedes", "distant.ts")).href)) as typeof import("../../runtime/src/remedes/distant.ts");
    return demanderLeRemede(demande);
  },
  ...(role.role === "station" ? { demenager: demenageurDuRuntime({ node: emplacements.node, runtime: emplacements.runtime, racine: racineDeLaStation, env: process.env, delaiMs: 60_000 }) } : {}),
  // Le dépôt et la branche d'un projet, lus dans son clone sur cet ordinateur par l'opération du runtime (#1306) :
  // une station de plus les en prend quand la première ne les dit pas.
  leClone: async (nom) => {
    const dossier = projets().find((projet) => projet.nom === nom)?.dossier;
    if (dossier === undefined) return null;
    const { projetDuClone } = (await import(pathToFileURL(join(emplacements.runtime, "src", "projets", "ajout-de-station.ts")).href)) as typeof import("../../runtime/src/projets/ajout-de-station.ts");
    const lu = await projetDuClone(dossier);
    return { depot: lu.depot, base: lu.base };
  },
  surLecture: (vu) => {
    dernierVuDesProjets = vu;
    dire("projetsDesStations", vu);
    direLAccueil(accueil.projetsDesStations(vu));
    // Une station vient de dire qu'elle sert un projet de l'app : sa box se lit, et la vue le sait aussitôt.
    const hotes = JSON.stringify(vu.projets.map(({ nom }) => hoteDeLaStation(vu, nom) ?? ""));
    if (hotes === hotesLus) return;
    hotesLus = hotes;
    dire("configuration", affichee(), []);
    voir();
  },
});
// Les stations du chef, sur « Tous les projets » : celles qu'il a appairées, lues sur GitHub par
// le `gh` du poste toutes les trente secondes (stations/stations.ts). L'app ne joint aucune
// station : c'est GitHub qui porte ce que chacune dit d'elle.
const stations = tenirStations({
  versions: versionsDansFichier(join(dirname(cheminConfiguration()), "versions-vues.json")),
  github: githubDesStations({ gh: process.env.BRIGADE_GH_BIN || "gh", delaiMs: 30_000 }),
  surLecture: (vu) => {
    dire("stations", vu);
    for (const bande of bandes.limite(vu.limite)) direLaBande(bande);
    direLAccueil(accueil.stations(vu));
    void projetsDesStations.relire();
    void tenirCeQueFournitCetOrdinateur(vu);
  },
});
// Ce que la station de cet ordinateur fournit (stations/fournit.ts, #1757) : `macos` sur un Mac, et ce que
// le runtime détecte sur la machine — regardé une fois par lancement, sans rien y lancer. Son appairage le
// porte : écrit quand l'app l'appaire, et réécrit si une station appairée avant ne le dit pas.
let fournitIci: Promise<string[]> | undefined;
const ceQueFournitIci = () =>
  (fournitIci ??= (async () => {
    try {
      const { capacitesDeLaMachine } = (await import(pathToFileURL(join(emplacements.runtime, "src", "projets", "ajout-de-station.ts")).href)) as typeof import("../../runtime/src/projets/ajout-de-station.ts");
      const { sondeDeLaMachine } = (await import(pathToFileURL(join(emplacements.runtime, "src", "installation", "besoins", "fourni.ts")).href)) as typeof import("../../runtime/src/installation/besoins/fourni.ts");
      return ceQueFournitCetOrdinateur(process.platform, capacitesDeLaMachine(sondeDeLaMachine(process.env)));
    } catch (erreur) {
      console.error(`brigade: what this computer provides beyond its system could not be read — ${erreur instanceof Error ? erreur.message : String(erreur)}`);
      return ceQueFournitCetOrdinateur(process.platform, []);
    }
  })());
let fournitTenu = false;
async function tenirCeQueFournitCetOrdinateur(vu: VuDesStations): Promise<void> {
  const ici = stationLocale === undefined ? null : gistLocal(racineDeLaStation);
  if (fournitTenu || ici === null || !vu.stations.some(({ id }) => id === ici)) return;
  fournitTenu = true;
  try {
    if (await stations.tenirCeQuElleFournit(ici, await ceQueFournitIci())) console.error("brigade: this computer's station now says on GitHub what it provides");
  } catch (erreur) {
    // Le gist n'a pas pu s'écrire : la lecture suivante réessaie.
    fournitTenu = false;
    console.error(`brigade: what this computer's station provides could not be written on GitHub — ${erreur instanceof Error ? erreur.message : String(erreur)}`);
  }
}
// Sur un ordinateur, l'app est une station (`role`) : elle lance celle de la machine — la même
// que celle d'un serveur —, sous `station/` à côté du fichier des projets, et l'appaire seule,
// par le geste du champ de la home (poste/station.ts). Ce que la station dit s'écrit dans le
// terminal qui a lancé l'app.
const stationLocale =
  role.role === "station" && !installeeAuLancement
    ? tenirStationLocale({
        // Le `node` de `npm start`, ou celui du paquet de l'app installée : Electron n'en est pas un.
        node: emplacements.node,
        principal: role.principal,
        racine: racineDeLaStation,
        env: process.env,
        dire: (ligne) => console.error(ligne),
        appairer: async (code) => stations.appairer(code, await ceQueFournitIci()),
        // Lancée ou arrêtée : la page d'un projet qui cuit ici le dit, ou cesse de le dire.
        surChangement: () => dire("configuration", affichee(), []),
      })
    : undefined;
// Les pannes d'une station, sur sa ligne de la home : chacune a son bouton (pannes/gestes.ts). Le
// login ne part que pour la station de cet ordinateur, par le `claude` officiel (pannes/login.ts).
const loginIci = tenirLogin({ claude: process.env.BRIGADE_CLAUDE_BIN || "claude", env: process.env, dire: (ligne) => console.error(ligne), apres: () => void stations.relire() });
const gestesDesPannes = { stations, stationLocale: () => (stationLocale === undefined ? null : gistLocal(racineDeLaStation)), login: loginIci };
if (role.role === "poste") console.error(`brigade: this app is a workstation, not a station — ${role.pourquoi}: it pilots, nothing cooks here`);
// Son propre code, l'app le met à jour au clic sur la ligne qui dit son retard : son clone
// avance, puis elle se relance — par `npm start` quand c'est par là qu'elle est partie, pour
// que son lancement pose ce que la nouvelle version demande (rattrapage.ts). Se fermer arrête
// les terminaux, comme quitter.
const passer = tenirPassage({
  reglages: { git: "git", delaiMs: 60_000 },
  app: dossierApp,
  relancer: () => {
    app.relaunch(relanceDe(process.env, dossierApp));
    app.quit();
  },
});

// La vue nomme un projet ; seul un projet du fichier, et qui s'ouvre, a un espace.
function projet(nom: unknown): Projet {
  const trouve = projets().find((candidat) => candidat.nom === nom);
  if (trouve === undefined || trouve.refus !== undefined) throw new Error(`project without a space: ${String(nom)}`);
  return trouve;
}

ipcMain.handle("demarrage", () => ({ poste: { nom: nomDuPoste(plateforme), mac: estUnMac(plateforme) }, configuration: affichee(), palette: PALETTE, exemple: EXEMPLE, onglets: ONGLETS, rubriques: RUBRIQUES, boutons: BOUTONS, gestes: { allumage: ALLUMAGE, cuisine: GESTES_DE_LA_CUISINE, grants: { gestes: GESTES_DES_GRANTS, nommes: GRANTS }, directs: DIRECTS, confirmes: CONFIRMES, attente: GESTES_D_ATTENTE }, banniere: BANNIERE, calibrage: { modeles: MODELES, efforts: EFFORTS }, code: retards.vu(), stations: stations.vu(), projetsDesStations: projetsDesStations.vu(), accueil: accueil.vu(), miseAJour: miseAJour.vu() }));
// Ajouter un projet : son dossier se choisit, il ne se tape pas. Le reste se
// décide hors de la vue — elle reçoit ce qu'il en est advenu, et pourquoi.
ipcMain.handle("choisirDossier", async () => {
  if (fenetre === undefined) return undefined;
  const { filePaths } = await dialog.showOpenDialog(fenetre, { title: "The project folder", properties: ["openDirectory", "createDirectory"] });
  return filePaths[0];
});
// Le dépôt GitHub et la branche d'intégration du dossier choisi, lus dans son clone par le `git`
// du poste (ajout.ts) — ou pourquoi ils restent à écrire. Rien ne part ailleurs.
ipcMain.handle("lireClone", (_, dossier: unknown) => (typeof dossier === "string" && dossier !== "" ? lireClone("git", dossier) : undefined));
// L'ajout : les champs, puis le fichier des projets (ajout.ts). Aucune station n'est choisie, aucune
// machine n'est jointe : le projet a son onglet, et sa cuisine se confie depuis sa page.
ipcMain.handle("ajouter", (_, saisie: unknown) => ajouterALApp(saisie, suivi.ajouter));
// Les couleurs d'un projet : la vue nomme le projet, le rôle — onglet ou accent — et une couleur
// de la palette, par son nom, ou une couleur libre `#rrggbb` (couleurs.ts). Écrite, elle arrive par
// `surConfiguration`, avec ce qu'elle a de trop proche. Rend la raison, si elle ne l'a pas été.
ipcMain.handle("colorer", (_, nom: unknown, role: unknown, couleur: unknown) => {
  const vise = declare(nom);
  if (vise === undefined) return parti(nom).refus;
  const voulue = choix(role, couleur);
  return "refus" in voulue ? voulue.refus : suivi.changerCouleur(vise.nom, voulue.role, voulue.valeur);
});
// Les tickets ordinaires de cet ordinateur (ordinaires.ts) : le bloc que la vue pose pour un projet —
// rien, quand ce poste ne joue aucune station du projet ; hors d'un Mac, pourquoi il n'en prend pas —, et le réglage, que la vue nomme et que le fichier écrit.
// Écrit, il arrive par `surConfiguration`. Le réglage rend la raison, s'il ne l'a pas été.
ipcMain.handle("ordinaires", (_, nom: unknown) => {
  const vise = declare(nom);
  return vise === undefined ? undefined : blocDesOrdinaires(vise, plateforme, faits.stations(vise.nom));
});
ipcMain.handle("reglerOrdinaires", (_, nom: unknown, actif: unknown, limite: unknown) => {
  const vise = declare(nom);
  return vise === undefined ? parti(nom).refus : suivi.changerOrdinaires(vise.nom, actif, limite);
});
// L'ordre des projets : la vue nomme le projet glissé dans la barre et la place où il a été lâché.
// C'est l'ordre du fichier qui change (config.ts) : rangé, il arrive par `surConfiguration` — la
// barre et « Tous les projets » le prennent alors. Rend la raison, s'il ne l'a pas été.
ipcMain.handle("ranger", (_, nom: unknown, rang: unknown) => {
  const vise = declare(nom);
  if (vise === undefined) return parti(nom).refus;
  return typeof rang === "number" ? suivi.ranger(vise.nom, rang) : `nothing was done: “${String(rang)}” is not a place in the bar`;
});
// L'installation guidée : la vue nomme le projet et le geste, ce qu'il en advient se décide
// dans service.ts — les étapes lues sur la box, la session `/brigade:init` dans le second,
// chaque étape faite par la commande du runtime qui la fait, et le démarrage, écrit dans un
// shell et refusé tant que la box n'a pas terminé l'installation. Ce qui change arrive par `surGuide`.
const parti = (nom: unknown) => ({ refus: `nothing was done: “${String(nom)}” is no longer in the projects file` });
ipcMain.handle("service", (_, nom: unknown) => {
  const vise = connu(nom);
  return vise === undefined ? undefined : services.guide(vise);
});
ipcMain.handle("deplierService", (_, nom: unknown) => {
  const vise = connu(nom);
  return vise === undefined ? undefined : services.deplier(vise);
});
ipcMain.handle("amorcer", (_, nom: unknown) => {
  const vise = connu(nom);
  return vise === undefined ? parti(nom) : services.amorcer(vise);
});
ipcMain.handle("direMerge", (_, nom: unknown, merge: unknown) => {
  const vise = connu(nom);
  return vise === undefined ? parti(nom) : services.direMerge(vise, merge === true);
});
ipcMain.handle("verifier", (_, nom: unknown) => {
  const vise = connu(nom);
  return vise === undefined ? parti(nom) : services.verifier(vise);
});
ipcMain.handle("declarerStations", (_, nom: unknown, choix: unknown) => {
  const vise = connu(nom);
  return vise === undefined ? parti(nom) : services.declarerStations(vise, choix);
});
// Une station déclarée, changée seule depuis l'onglet Cooks (#1510) : son plafond, ses capacités, ce poste qui la joue,
// ou son retrait (service.ts, `changerUneStation`).
ipcMain.handle("changerUneStation", (_, nom: unknown, station: unknown, voulu: unknown) => {
  const vise = connu(nom);
  return vise === undefined ? parti(nom) : services.changerUneStation(vise, station, voulu);
});
ipcMain.handle("proteger", (_, nom: unknown) => {
  const vise = connu(nom);
  return vise === undefined ? parti(nom) : services.proteger(vise);
});
ipcMain.handle("repondre", (_, nom: unknown, valeurs: unknown) => {
  const vise = connu(nom);
  return vise === undefined ? parti(nom) : services.repondre(vise, valeurs);
});
ipcMain.handle("passerDecisions", (_, nom: unknown) => {
  const vise = connu(nom);
  return vise === undefined ? parti(nom) : services.passerDecisions(vise);
});
ipcMain.handle("demarrer", (_, nom: unknown) => {
  const vise = connu(nom);
  return vise === undefined ? parti(nom) : services.demarrer(vise);
});
// Retirer un projet : la vue nomme le projet et le geste, ce qu'il en advient se décide
// dans retrait.ts. « Retirer de l'app » n'écrit que le fichier des projets — rien ne part
// vers la box. Les trois autres sont le geste de box : la case du journal, décochée
// d'office ; le plan, qui ne retire rien ; la désinstallation, refusée sans plan et sans
// le nom du projet, écrit par le chef.
ipcMain.handle("retrait", (_, nom: unknown) => {
  const vise = declare(nom);
  return vise === undefined ? undefined : retraits.etat(vise);
});
ipcMain.handle("retirerDeLApp", (_, nom: unknown) => {
  const vise = declare(nom);
  return vise === undefined ? parti(nom) : retraits.retirerDeLApp(vise);
});
ipcMain.handle("direJournal", (_, nom: unknown, coche: unknown) => {
  const vise = declare(nom);
  return vise === undefined ? undefined : retraits.direJournal(vise, coche === true);
});
// La box met son temps à répondre, et le fichier a pu changer entre-temps : ce qui est
// rendu à la vue est le retrait du projet tel qu'il est déclaré à la réponse — rien, s'il n'y est plus.
const apres = async (nom: unknown, demande: Promise<unknown>) => {
  await demande;
  const vise = declare(nom);
  return vise === undefined ? undefined : retraits.etat(vise);
};
ipcMain.handle("planifier", (_, nom: unknown) => {
  const vise = declare(nom);
  return vise === undefined ? undefined : apres(nom, retraits.planifier(vise));
});
ipcMain.handle("desinstaller", (_, nom: unknown, confirmation: unknown) => {
  const vise = declare(nom);
  return vise === undefined ? undefined : apres(nom, retraits.desinstaller(vise, confirmation));
});
ipcMain.handle("espace", (_, nom: unknown) => terminaux.espace(projet(nom)));
// « + shell » : les machines où ouvrir un shell persistant (machines.ts) — ce poste, la box, et les
// stations que le dernier contrôle de la box a lues. La vue n'en reçoit que l'identifiant et le titre.
const machinesDuProjet = (vise: Projet) => machinesDe(vise, services.controleDe(vise.nom)?.stations?.declarees);
ipcMain.handle("machines", (_, nom: unknown) => machinesDuProjet(projet(nom)).map(({ id, titre }) => ({ id, titre })));
// La vue rend la machine choisie, par son identifiant : le shell s'y ouvre dans une session neuve,
// que l'app retient. Une machine qui n'est plus proposée n'ouvre rien.
ipcMain.handle("shell", (_, nom: unknown, machine: unknown) => {
  const vise = projet(nom);
  const choisie = machineChoisie(machinesDuProjet(vise), machine);
  return choisie === undefined ? { refus: `nothing was opened: “${String(machine)}” is not among the machines this project offers any more` } : terminaux.ouvrir(vise, choisie.cible);
});
// Fermer un shell pour de bon : il quitte l'espace, et sa session est détruite sur sa machine.
ipcMain.handle("fermerShell", (_, id: unknown) => (typeof id === "number" ? terminaux.fermerShell(id) : { refus: "nothing was closed: no shell is named" }));
// Un bouton : sa commande est écrite dans le second du projet, et rien ne l'envoie — le chef la
// complète. La vue nomme le bouton ; ce qui s'écrit se décide ici (boutons.ts) — ou pourquoi
// rien ne l'est. Rien, pour un projet sans box. Régler le closer s'écrit avec ses deux valeurs, le
// modèle et l'effort que le chef a choisis sur la partie closer de la page.
ipcMain.handle("inscrire", (_, nom: unknown, id: unknown, valeurs: unknown) => {
  const vise = projet(nom);
  const [modele, effort] = Array.isArray(valeurs) ? valeurs : [];
  const ecrit = id === REGLER_LE_CLOSER ? ecritPourLeCloser(vise, modele, effort) : ecritPar(id, vise);
  return ecrit === undefined || "refus" in ecrit ? ecrit : terminaux.inscrire(vise, ecrit.commande);
});
// Une carte de T'attend : une demande en prose est écrite dans le second, qui est affiché, et rien
// ne l'envoie. La vue nomme le projet et le ticket ; la phrase se compose ici (demande.ts) de ce que
// le bloc `attend` en dit — jamais d'un texte venu de la vue. Rien pour un ticket que le bloc ne nomme pas.
// Depuis la fiche d'un ticket qui ne t'attend pas (#639), la phrase se compose de ce que les
// derniers faits en donnent — son mot d'état, son titre —, ou, d'une issue à venir, de son seul
// numéro. Rien pour un ticket qu'aucune lecture ne porte.
ipcMain.handle("demander", (_, nom: unknown, ticket: unknown) => {
  const vise = projet(nom);
  if (typeof ticket !== "number") return undefined;
  const dit = faits.attendu(vise.nom, ticket);
  const donne = dit === undefined ? (faits.ticket(vise.nom, ticket) ?? (amonts.adresse(vise.nom, ticket) === undefined ? undefined : {})) : undefined;
  if (dit === undefined && donne === undefined) return undefined;
  const ecrit = dit !== undefined ? demandeDe(vise.nom, ticket, dit.lignes, dit.titre) : demandeSurLeTicket(vise.nom, ticket, donne?.etat, donne?.titre);
  return "refus" in ecrit ? ecrit : terminaux.inscrire(vise, ecrit.demande, noteDeLaDemande);
});
// Les gestes de la fiche d'un ticket, à cet instant (gestes-fiche.ts) : d'après la carte cliquée,
// ceux qui tranchent ce qu'on attend du chef, puis ceux que la table du chef permet pour son état,
// dont l'action est branchée, chacun avec son prix.
ipcMain.handle("gestesDeFiche", (_, carte: unknown) => gestesDeCarte(carte));
// Un geste de la fiche que la vue ne joue pas elle-même. Changer la priorité remplace le label `prio:`
// de l'issue sur GitHub (priorite.ts, #1739), par le jeton du `gh` de ce poste — ni box, ni tableau :
// fait, le rail montre aussitôt la nouvelle priorité, jusqu'à ce que le tableau la montre. Merger la
// livraison, retirer le ticket du rail et renvoyer en cuisine un ticket revenu de WAITING s'écrivent
// sur le tableau de la cuisine du projet (#1694, #1740, tableau-gestes/rail.ts), en commentaire, par le
// même jeton — ni `ssh` ni second : la box les joue à son tick suivant, et le rail, relu du tableau, le
// montre. Les autres — que la grammaire du tableau ne connaît pas — sont une action de box, qui part
// dans le second comme un geste du socle. La vue
// nomme le geste, le ticket et la valeur ; ce qui part se compose ici, jamais dans la vue.
ipcMain.handle("gesteDeFiche", async (_, nom: unknown, id: unknown, ticket: unknown, valeur: unknown) => {
  const vise = connu(nom);
  if (vise === undefined) return parti(nom);
  if (id === "priorite") {
    if (faits.ticket(vise.nom, ticket)?.etat === undefined) return { refus: `nothing was changed: #${String(ticket)} is not on the latest rail read — read it again`, detail: "" };
    const rendu = await changerLaPriorite({ depot: await depotDuProjet(vise), ticket, valeur, client: clientDesLabels });
    if (!("fait" in rendu)) return rendu;
    prioritesEcrites.ecrite(vise.nom, ticket as number, rendu.niveau, rendu.avant);
    redessinerRail(vise.nom);
    return { fait: rendu.fait, detail: rendu.detail };
  }
  const auTableau = await gesteDeFicheAuTableau(tableaux.dernier(vise.nom), id, ticket, clientDesGestes);
  if ("horsDuTableau" in auTableau) return jouerGesteDeFiche(terminaux, vise, id, ticket, valeur, undefined, cuisines.cuisineDe(vise));
  if ("fait" in auTableau) tableaux.oublier();
  return auTableau;
});
// La question qu'une carte de T'attend pose, telle qu'elle est écrite sur son issue (question.ts) :
// l'issue est lue par le `gh` du poste — celui du chef —, à l'ouverture de sa fiche. La vue nomme le
// projet et le ticket ; l'adresse est celle que la box a rendue (faits.ts). Rien pour un ticket que
// le bloc `attend` ne nomme pas : seule une entrée qui t'attend se lit ainsi.
const reglagesGh = () => ({ gh: process.env.BRIGADE_GH_BIN || "gh", delaiMs: 30_000 });
// Ce que chaque lecture de l'issue dit de sa question est retenu (repondues.ts) : répondue, sa carte
// quitte TODO ; plus répondue — une autre question —, elle y revient. Le rail est redessiné aussitôt.
function retenirLue(projet: string, ticket: unknown, lue: QuestionLue): QuestionLue {
  if (repondues.lue(projet, ticket, lue)) redessinerRail(projet);
  return lue;
}
function redessinerRail(projet: string): void {
  const redessine = faits.redessiner(projet);
  if (redessine !== undefined) dire("faits", redessine);
}
// Une carte répondue attend le manager tant que la file la nomme : son issue est relue au plus toutes
// les deux minutes — c'est là que se voit une autre question. Ce que la file ne nomme plus est lâché.
function relireRepondues(projet: string): void {
  for (const ticket of repondues.garder(projet, faits.nommes(projet))) {
    const adresse = faits.adresse(projet, ticket);
    if (adresse !== undefined) void lireQuestion(reglagesGh(), adresse).then((lue) => retenirLue(projet, ticket, lue));
  }
}
ipcMain.handle("lireQuestion", (_, nom: unknown, ticket: unknown) => {
  const vise = connu(nom);
  if (vise === undefined || faits.attendu(vise.nom, ticket) === undefined) return undefined;
  const adresse = faits.adresse(vise.nom, ticket);
  // Jamais posée hors des essais, comme BRIGADE_SSH_BIN.
  return adresse === undefined ? { a: new Date().toISOString(), sans: "the station gave no https address for this issue: the app has nothing to read" } : lireQuestion(reglagesGh(), adresse).then((lue) => retenirLue(vise.nom, ticket, lue));
});
// L'histoire d'un ticket, sur sa fiche : lue de GitHub par le `gh` du poste (fiche-github.ts), jamais de la
// box — le coût et la rétro que seul son journal porte sont dits non communiqués. La vue nomme le projet et le ticket.
ipcMain.handle("situation", (_, carte: unknown) => situationDe(carte));
ipcMain.handle("lireHistoire", async (_, nom: unknown, ticket: unknown) => {
  const vise = connu(nom);
  return vise === undefined ? undefined : histoireDeGitHub(reglagesGh(), await depotDuProjet(vise), ticket);
});
// L'issue d'un ticket et sa discussion, sur la fiche de toute carte : lues de GitHub par le `gh` du poste
// (fiche-github.ts), le markdown rendu. Les adresses qu'elle montre sont gardées ici : un clic de la vue n'ouvre
// que l'une d'elles, jamais une adresse qu'elle aurait composée.
// Le commentaire du chef part par `pass <ticket> comment <texte>`, au clic : la vue nomme le
// projet, le ticket et le texte ; la commande se compose ici.
const liensLus = new Map<string, readonly string[]>();
// Elles prennent leur tour dans le passage du projet : une connexion à la fois, comme les veilles.
const lancerSurLaBox = (servi: Servi, commande: string) => {
  const rendu = (passage.get(servi.nom) ?? Promise.resolve()).then(() => lancerGeste({ ssh: process.env.BRIGADE_SSH_BIN || "ssh", delaiMs: 30_000, connexionS: 10 }, servi, commande));
  passage.set(servi.nom, rendu);
  return rendu;
};
ipcMain.handle("lireDiscussion", async (_, nom: unknown, ticket: unknown) => {
  const vise = connu(nom);
  if (vise === undefined) return undefined;
  const lue = await discussionDeGitHub(reglagesGh(), await depotDuProjet(vise), ticket);
  if (!("sans" in lue)) liensLus.set(`${vise.nom}#${String(ticket)}`, lue.liens);
  return lue;
});
ipcMain.handle("commenter", (_, nom: unknown, ticket: unknown, texte: unknown) => {
  const vise = connu(nom);
  return vise === undefined ? { poste: false, refus: `nothing was posted: “${String(nom)}” is no longer in the projects file` } : commenter(lancerSurLaBox, vise, ticket, texte, 30_000);
});
// « ask the second », au clic : la box compose la demande — l'issue et le contexte du champ —, et
// l'app l'écrit dans le second sans Entrée (comme `demander`) ; injoignable, rien n'est écrit.
ipcMain.handle("demanderAuSecond", async (_, nom: unknown, ticket: unknown, contexte: unknown) => {
  const vise = connu(nom);
  if (vise === undefined) return { refus: parti(nom).refus };
  const composee = await demanderAuSecond(lancerSurLaBox, vise, ticket, contexte, 30_000);
  return "refus" in composee ? composee : terminaux.inscrire(vise, composee.demande, noteDeLaDemande);
});
ipcMain.handle("ouvrirLien", (_, nom: unknown, ticket: unknown, url: unknown) => {
  if (typeof url !== "string" || !(liensLus.get(`${String(nom)}#${String(ticket)}`) ?? []).includes(url) || !/^https?:$/.test(URL.parse(url)?.protocol ?? "")) return false;
  return shell.openExternal(url).then(
    () => true,
    () => false,
  );
});
// Une capture d'un ticket d'interface, sur sa carte (captures.ts) : lue par le `gh` du poste à
// l'adresse que la box a rendue dans `facts`, et rendue à la vue en `data:`. La vue nomme le
// projet, le ticket, l'écran et le moment ; l'adresse ne quitte pas le process principal.
ipcMain.handle("lireCapture", (_, nom: unknown, ticket: unknown, ecran: unknown, moment: unknown) => {
  const vise = connu(nom);
  if (vise === undefined) return undefined;
  const adresse = faits.capture(vise.nom, ticket, ecran, moment);
  return adresse === undefined ? { sans: "the station gave no address for this screenshot: the app has nothing to read" } : lireCapture(reglagesGh(), adresse);
});
// Le titre d'une issue que la box ne donne pas (hors rail) : lu par le `gh` du poste, à l'adresse que
// la box a rendue pour ce ticket — jamais une adresse venue de la vue.
ipcMain.handle("lireTitre", (_, nom: unknown, ticket: unknown) => {
  const vise = connu(nom);
  if (vise === undefined) return undefined;
  const adresse = faits.adresse(vise.nom, ticket);
  return adresse === undefined ? { sans: "the station gave no https address for this issue: the app has nothing to read" } : titreDe(reglagesGh(), adresse);
});
// Lever la retenue d'un ticket qui t'attend pour `blocked-on-human` : retirer le label, ou fermer
// l'issue — un clic, par le `gh` du poste. Rien pour un ticket que le bloc `attend` ne dit pas retenu.
ipcMain.handle("leverRetenue", (_, nom: unknown, ticket: unknown, geste: unknown) => {
  const vise = connu(nom);
  if (vise === undefined) return { fait: false, refus: parti(nom).refus };
  const dit = faits.attendu(vise.nom, ticket);
  if (dit === undefined || !dit.lignes.some((ligne) => ligne.includes(`\`${LABEL_RETENUE}\``))) return { fait: false, refus: `nothing was done: the \`attend\` block does not say #${String(ticket)} is held by \`${LABEL_RETENUE}\`` };
  const adresse = faits.adresse(vise.nom, ticket);
  return adresse === undefined ? { fait: false, refus: "nothing was done: the station gave no https address for this issue" } : lever(reglagesGh(), adresse, geste);
});
// La réponse du chef à cette question : un choix, par sa lettre, ou sa phrase. Elle part sur
// l'issue, en commentaire, par le même `gh` — à son nom. L'issue est relue avant : rien ne part sur
// une question qui n'est plus celle qu'il a lue, ni pour un ticket que la file ne nomme plus.
// Partie, la carte quitte TODO aussitôt (repondues.ts) : elle attend le manager dans WAITING.
ipcMain.handle("repondreQuestion", async (_, nom: unknown, ticket: unknown, reponse: unknown) => {
  const vise = connu(nom);
  if (vise === undefined) return { poste: false, refus: parti(nom).refus };
  if (faits.attendu(vise.nom, ticket) === undefined) return { poste: false, refus: `nothing was posted: the \`attend\` block no longer names #${String(ticket)}` };
  const adresse = faits.adresse(vise.nom, ticket);
  if (adresse === undefined) return { poste: false, refus: "nothing was posted: the station gave no https address for this issue" };
  const rendue = await repondreQuestion(reglagesGh(), adresse, reponse);
  const question = (reponse as { question?: unknown } | null)?.question;
  if (rendue.poste && typeof question === "string") {
    if (repondues.postee(vise.nom, ticket, question)) redessinerRail(vise.nom);
  } else if (!rendue.poste && rendue.lue !== undefined) retenirLue(vise.nom, ticket, rendue.lue);
  return rendue;
});
// Une ligne de la bande d'alertes dont le geste demande de lire, de juger ou d'agir hors de
// l'app : une demande en prose est écrite dans le second, et rien ne l'envoie. La vue nomme la
// ligne, par son sujet et ce qu'elle dit ; la phrase se compose ici (demande.ts) de ce que la
// bande en dit maintenant — jamais d'un texte venu de la vue. Rien pour une ligne qu'elle ne dit plus.
ipcMain.handle("demanderAlerte", (_, nom: unknown, sujet: unknown, dit: unknown) => {
  const vise = projet(nom);
  const alerte = bandes.alerte(vise.nom, sujet, dit);
  if (alerte?.appel === undefined || !("demande" in alerte.appel)) return undefined;
  const ecrit = demandeDeLAlerte(vise.nom, alerte);
  return "refus" in ecrit ? ecrit : terminaux.inscrire(vise, ecrit.demande, noteDeLaDemande);
});
// Un geste : sa commande part dans le second du projet, qui est rendu — sa note dit ce qui est
// parti, ou le refus dit pourquoi rien ne l'est, quand le second n'est pas dit libre. La vue nomme
// le geste ; ce qui part se décide dans gestes.ts. Rien, pour un projet sans box. Un geste qui
// porte sur un grant le reçoit nommé. Un geste confirmé ne part qu'avec le « oui » du chef, que la
// vue ne passe qu'une fois sa confirmation montrée : sans lui, rien n'est écrit.
ipcMain.handle("geste", (_, nom: unknown, id: unknown, grant: unknown, oui: unknown) => {
  const vise = connu(nom);
  return vise === undefined ? parti(nom) : ecrireGeste(terminaux, id, vise, grant, oui, cuisines.cuisineDe(vise));
});
// Un geste de WAITING, sur une carte du rail : sa commande part dans le second du projet, comme un
// geste du socle. La vue nomme le geste et le ticket, et donne ce que le chef a rempli ; ce qui
// part se décide dans attente.ts. « It arrived, back to the kitchen » n'a pas de commande : il
// s'écrit sur le tableau de la cuisine du projet (#1740, tableau-gestes/rail.ts), comme le geste
// `cuisine` de la fiche — posté, la carte le dit, et la box le joue à son tick suivant.
ipcMain.handle("attente", async (_, nom: unknown, id: unknown, ticket: unknown, saisie: unknown) => {
  const vise = connu(nom);
  if (vise === undefined) return parti(nom);
  if (id !== "attente-arrivee") return ecrireAttente(terminaux, id, vise, ticket, saisie, undefined, cuisines.cuisineDe(vise));
  const rendu = await arriveeDeCarte(tableaux.dernier(vise.nom), ticket, clientDesGestes);
  if ("fait" in rendu) tableaux.oublier();
  return rendu;
});
// Ce qu'un geste confirmé coûte, dit avant son « oui » (confirmation.ts) : tiré des derniers faits
// lus du projet — les cooks en cours, le rail. Rien ne part, rien
// n'est lu de plus. Rien, pour un geste qui ne se confirme pas.
ipcMain.handle("confirmer", (_, nom: unknown, id: unknown, grant: unknown) => {
  const vise = connu(nom);
  if (vise === undefined) return parti(nom);
  return confirmationDe(id, vise, faits.dernier(vise.nom) ?? { sans: "`facts` has not been read yet for this project, or its last read did not return the expected shape" }, grant, cuisines.cuisineDe(vise));
});
// Le code qu'une station affiche, tapé par le chef : la station qui le publie sur GitHub est
// appairée — ou le refus dit en une ligne pourquoi rien ne l'est (stations/stations.ts).
ipcMain.handle("appairer", (_, code: unknown) => stations.appairer(code));
// « Add a project » : les dépôts du chef, lus par le `gh` du poste, entre lesquels il choisit.
ipcMain.handle("depotsDuChef", () => projetsDesStations.depots());
// Le parcours validé : la demande s'écrit dans le gist de chaque station choisie — ou chaque champ
// qui manque est signalé, et rien n'est écrit (projets/projets.ts).
ipcMain.handle("ajouterAUneStation", (_, saisie: unknown) => projetsDesStations.ajouter(saisie));
// La page d'un projet de l'app confie sa cuisine à une première station, ou à une de plus : c'est le
// seul geste qui l'installe sur une station (projets/projets.ts, `confier`).
ipcMain.handle("confierAUneStation", (_, saisie: unknown) => projetsDesStations.confier(saisie));
// Ce que le formulaire d'ajout d'une station montre d'emblée pour cet ordinateur (#1307) : l'opération du runtime
// (#1306) le calcule sur cette machine — ses cœurs, le répertoire de sa station, ce qu'elle a —, sans rien y lancer.
ipcMain.handle("defautsDeStation", async (_, nom: unknown): Promise<DefautsDeLaMachine> => {
  const dossier = projets().find((projet) => projet.nom === nom)?.dossier;
  if (dossier === undefined) return { refus: "this computer could not be read", detail: `${String(nom)} is not in this app's projects file` };
  try {
    const { defautsDeStation } = (await import(pathToFileURL(join(emplacements.runtime, "src", "projets", "ajout-de-station.ts")).href)) as typeof import("../../runtime/src/projets/ajout-de-station.ts");
    const { cooks, cooksDit, espaceDeTravail, capacites } = await defautsDeStation({ dossier, racine: racineDeLaStation, env: process.env });
    return { cooks, cooksDit, espaceDeTravail, capacites };
  } catch (erreur) {
    return { refus: "this computer could not be read", detail: erreur instanceof Error ? erreur.message : String(erreur) };
  }
});
// Retiré, le projet quitte la demande de chacune de ses stations : elles le retirent de leur configuration.
ipcMain.handle("retirerDUneStation", (_, nom: unknown) => projetsDesStations.retirer(nom));
// La page d'un projet déménage sa cuisine, d'un geste, vers une autre station appairée — cet
// ordinateur, sa box, une autre : l'opération du runtime l'écrit, ou dit en une phrase pourquoi non.
// « Continue without sandbox » (#1113) : la décision du chef se note par la fonction du runtime, dans l'état
// du projet sur la station de cet ordinateur.
ipcMain.handle("continuerSansBacASable", (_, nom: unknown) => projetsDesStations.continuerSansBac(nom));
// Le bouton du refus d'un projet (#1205) : sa principale joue le remède que le refus offre, puis dit s'il
// tient (projets/projets.ts, `remedier`).
ipcMain.handle("leverLeRefus", (_, nom: unknown, refus: unknown, remede: unknown) => projetsDesStations.remedier(nom, refus, remede));
// Une issue d'un choix, sur la carte d'un besoin qui manque (#1400) : elle s'écrit dans la demande de la principale,
// qui la pose à son journal (projets/projets.ts, `choisir`).
ipcMain.handle("choisirUneIssue", (_, nom: unknown, choix: unknown, issue: unknown) => projetsDesStations.choisir(nom, choix, issue));
ipcMain.handle("demenagerLaCuisine", (_, nom: unknown, vers: unknown) => projetsDesStations.demenager(nom, vers));
// La page GitHub où autoriser brigade sur un dépôt : seulement une de celles qu'une station a publiées.
ipcMain.handle("autoriserSurGitHub", (_, url: unknown) => {
  if (typeof url !== "string" || !projetsDesStations.pages().includes(url)) return false;
  return shell.openExternal(url).then(
    () => true,
    () => false,
  );
});
// « Retirer la station » : son appairage quitte son gist, elle disparaît de l'accueil.
ipcMain.handle("retirerLaStation", (_, id: unknown) => stations.retirer(id));
// « Pair a phone », sur la ligne d'une station de l'accueil (#1598) : tirer un code et ce que son QR porte, dire où en
// est ce code, lister les téléphones appairés à la station, en révoquer un — `phones …` sur la station, par `ssh` sur sa
// machine ou ici, sans `ssh`, pour celle de cet ordinateur (telephones-de-station.ts). La vue nomme la station par son
// gist ; la commande se compose ici, et ce qui revient à l'écran n'en dit rien.
const cibleDuTelephone = (id: unknown) =>
  cibleDeLaStation(
    stations.vu()?.stations.find((station) => station.id === id),
    { gist: stationLocale === undefined ? null : gistLocal(racineDeLaStation), locale: role.role === "station" ? { node: emplacements.node, runtime: emplacements.runtime, racine: racineDeLaStation, env: process.env } : undefined },
  );
const nomDeLaStation = (id: unknown) => stations.vu()?.stations.find((station) => station.id === id)?.nom ?? "this station";
const lancerLesTelephones = (lu: Lu, commande: string) => lancerLa({ ssh: process.env.BRIGADE_SSH_BIN || "ssh", delaiMs: DELAI_S * 1000, connexionS: 10 }, lu, commande);
ipcMain.handle("tirerUnCodeDeTelephone", (_, id: unknown) => tirerUnCode(lancerLesTelephones, cibleDuTelephone(id), nomDeLaStation(id)));
ipcMain.handle("etatDuCodeDeTelephone", (_, id: unknown, code: unknown) => etatDuCode(lancerLesTelephones, cibleDuTelephone(id), nomDeLaStation(id), code));
ipcMain.handle("telephonesDeLaStation", (_, id: unknown) => telephonesAppaires(lancerLesTelephones, cibleDuTelephone(id), nomDeLaStation(id)));
ipcMain.handle("revoquerUnTelephone", (_, id: unknown, nom: unknown) => revoquerUnTelephone(lancerLesTelephones, cibleDuTelephone(id), nomDeLaStation(id), nom));
// Le premier lancement, sur un ordinateur neuf (premier-lancement.ts, #1434) : les stations du chef et leurs
// projets, lus par l'opération du runtime (#1428) ; un projet ouvert d'un clic, sa copie reprise ou clonée par
// celle du runtime (#1429) — chaque étape part à la vue —, puis ajouté au fichier des projets ; la connexion à
// GitHub, par le geste que le runtime nomme (connexion-github.ts). Le runtime est à côté de l'app, du dépôt comme
// du paquet (emplacements.ts).
const ghIci = process.env.BRIGADE_GH_BIN || "gh";
const duRuntime = <M>(...chemin: string[]) => import(pathToFileURL(join(emplacements.runtime, "src", ...chemin)).href) as Promise<M>;
void duRuntime<typeof import("../../runtime/src/second-propositions/canal.ts")>("second-propositions", "canal.ts").then(
  (canal) => {
    propositionsDuSecond = tenirLesPropositions({ canal, surProposition: (projet, proposition) => dire("proposition", projet, proposition) });
    propositionsDuSecond.suivre(projets());
  },
  (erreur: unknown) => console.error(`brigade: the second's proposals cannot be followed — ${erreur instanceof Error ? erreur.message : String(erreur)}`),
);
// Les pages qu'un échec du runtime a nommées — installer `gh`, `git`, demander l'accès à un dépôt : seules
// celles-là s'ouvrent depuis l'écran.
const pagesDuPremier = new Set<string>();
const retenirLaPage = <T extends { link?: string }>(rendu: T): T => {
  if (rendu.link !== undefined) pagesDuPremier.add(rendu.link);
  return rendu;
};
ipcMain.handle("stationsDuChef", async (): Promise<StationsDuChef> => {
  const { lireLesStationsDuChef } = await duRuntime<typeof import("../../runtime/src/appairage/stations-du-chef.ts")>("appairage", "stations-du-chef.ts");
  const lu = await lireLesStationsDuChef({ gh: ghIci, env: process.env });
  return lu.state === "unavailable" ? retenirLaPage(lu) : lu;
});
// Les stations enregistrées sous le compte GitHub du chef (#1706), lues par l'opération du runtime (#1705) ; les
// projets que le chef choisit pour l'une, écrits dans son gist, au fichier que le contrat du runtime nomme
// (stations-du-compte.ts).
ipcMain.handle("stationsDuCompte", async (): Promise<StationsDuCompte> => {
  const { lireLesStationsDuCompte } = await duRuntime<typeof import("../../runtime/src/enregistrement-station/stations-du-compte.ts")>("enregistrement-station", "stations-du-compte.ts");
  const lu = await lireLesStationsDuCompte({ gh: ghIci, env: process.env });
  return lu.state === "unavailable" ? retenirLaPage(lu) : lu;
});
const choisirLesProjets = choixDesProjets({
  ecrire: (id, fichiers) => githubDesStations({ gh: ghIci, delaiMs: 30_000 }).ecrire(id, fichiers),
  contrat: () => duRuntime<typeof import("../../runtime/src/enregistrement-station/contrat.ts")>("enregistrement-station", "contrat.ts"),
});
ipcMain.handle("choisirLesProjets", (_, id: unknown, depots: unknown) => choisirLesProjets(id, depots));
const ouvrirUnProjetDUneStation = ouvrirDUneStation({
  ouvrirLaCopie: async (options) => {
    const { ouvrirLaCopieLocale } = await duRuntime<typeof import("../../runtime/src/projets/copie-locale.ts")>("projets", "copie-locale.ts");
    return ouvrirLaCopieLocale({ ...options, gh: ghIci, git: process.env.BRIGADE_GIT_BIN || "git", env: process.env });
  },
  lireLaBase: async (dossier) => (await lireClone(process.env.BRIGADE_GIT_BIN || "git", dossier)).base,
  configuration: () => suivi.configuration(),
  ajouter: (projet) => suivi.ajouter(projet),
  progres: (depot, etape) => dire("ouverture", depot, etape),
});
ipcMain.handle("ouvrirDUneStation", async (_, nom: unknown, depot: unknown) => {
  const ouverture = await ouvrirUnProjetDUneStation(nom, depot);
  return ouverture.state === "failed" && "link" in ouverture ? retenirLaPage(ouverture) : ouverture;
});
const connexionGitHub = tenirConnexionGitHub({
  commande: async () => {
    const { connexionGitHub } = await duRuntime<typeof import("../../runtime/src/appairage/stations-du-chef.ts")>("appairage", "stations-du-chef.ts");
    return connexionGitHub(ghIci).command;
  },
  env: process.env,
  ouvrir: (adresse) => shell.openExternal(adresse),
  apres: (fin) => dire("connexionGitHub", fin),
});
// La page où taper le code se rouvre depuis l'écran.
ipcMain.handle("seConnecterAGitHub", async () => {
  const debut = await connexionGitHub();
  if ("page" in debut) pagesDuPremier.add(debut.page);
  return debut;
});
// Et celles qui disent comment obtenir un outil qui manque au second (#1435), depuis sa colonne.
ipcMain.handle("ouvrirLaPage", (_, url: unknown) => {
  if (typeof url !== "string" || !(pagesDuPremier.has(url) || terminaux.pagesDesOutils().has(url))) return false;
  return shell.openExternal(url).then(
    () => true,
    () => false,
  );
});
// Le rail d'un projet que ni une box ni la station de cet ordinateur ne servent (#1435) — un projet ouvert depuis le
// premier lancement : celui que sa station publie sur GitHub, lu par l'opération du runtime (#1432) et rangé dans les
// colonnes du rail (faits.ts) ; ou pourquoi il ne se lit pas, en une phrase. Ses tickets s'ouvrent sur leur issue
// (`ouvrirIssue`), et la page qu'un échec nomme, depuis l'écran.
const adressesPubliees = new Map<string, Map<number, string>>();
ipcMain.handle("railDuProjet", async (_, nom: unknown): Promise<RailDuProjetLu> => {
  const vise = declare(nom);
  if (vise === undefined) return { state: "unavailable", project: String(nom), cause: "unreadable", reason: `The rail of ${String(nom)} is not read: it is no longer in the projects file.` };
  const { lireLeRailDuProjet } = await duRuntime<typeof import("../../runtime/src/appairage/rail-du-projet.ts")>("appairage", "rail-du-projet.ts");
  const lu = await lireLeRailDuProjet({ gh: ghIci, env: process.env, project: vise.depot ?? vise.nom });
  if (lu.state === "unavailable") return retenirLaPage(lu);
  if (lu.state !== "listed") return lu;
  // Seule une adresse https s'ouvre, comme pour le rail d'une box (faits.ts).
  adressesPubliees.set(vise.nom, new Map(lu.tickets.filter(({ url }) => URL.parse(url)?.protocol === "https:").map(({ ticket, url }) => [ticket, url])));
  return { ...lu, range: rangerLeRailPublie(lu.tickets) };
});
const clientDesGestes = clientDesGestesGitHub({ jeton: jetonDeGh({ gh: ghIci, delaiMs: 10_000 }), poster: posterParFetch(), appeler: appelerGitHub });
// Les labels `prio:` d'une issue, lus et changés depuis une fiche (priorite.ts), avec le même jeton.
const clientDesLabels = clientDeLaPriorite({ jeton: jetonDeGh({ gh: ghIci, delaiMs: 10_000 }), appeler: appelerGitHub, envoyer: envoyerParFetch() });
// Le plafond de cooks d'une station, réglé depuis sa page : la vue nomme la station et la valeur — un nombre,
// 0 ou `auto` —, la commande `station cooks <valeur>` part sur la box de chaque projet dont le `status` lu
// nomme cette station (plafond.ts). Réglé, ce `status` est relu aussitôt : la page dit le plafond neuf, et ce qu'il remplace.
// Depuis la ligne de station d'un projet (ticket 1292), `projet` borne le réglage à la box de ce projet.
ipcMain.handle("reglerLePlafond", async (_, station: unknown, valeur: unknown, projet?: unknown) => {
  const cibles = typeof station === "string" ? accueil.projetsDe(station).filter((nom) => projet === undefined || nom === projet).flatMap((nom) => { const vise = connu(nom); return vise?.box === undefined ? [] : [{ nom: vise.nom, box: vise.box }]; }) : [];
  const rendu = await reglerLePlafond(cibles, valeur, lancerSurLaBox);
  if ("fait" in rendu) {
    for (const servi of cibles) {
      const lu = await lancerSurLaBox(servi, "status");
      if (lu.erreur === null) direLAccueil(accueil.status(mettreAPart({ projet: servi.nom, demande: 0, a: new Date().toISOString(), sorties: [{ commande: "status", texte: lu.sortie }] })));
    }
  }
  return rendu;
});
// Le bouton d'une panne, sur la ligne d'une station : rend ce qu'il a fait, ou pourquoi rien.
ipcMain.handle("panne", (_, id: unknown, cle: unknown) => jouerPanne(gestesDesPannes, id, cle));
// Le bouton d'une station sur l'onglet Cooks (#1185) : `station stop|start <station>` part là où la cuisine du projet
// tourne — sa box, ou cet ordinateur —, par le passage du projet comme les veilles. La station doit être l'une de celles
// que ses derniers `facts` donnent (cuisson.ts). La vue relit la box quand il est fait : la ligne dit son état neuf.
// Une commande du runtime, lancée là où la cuisine d'un projet tourne, par son passage comme les veilles.
const lancerSurLaCuisine = (lu: Lu, commande: string) => {
  // Jamais posée hors des essais, comme pour la veille.
  const rendu = (passage.get(lu.nom) ?? Promise.resolve()).then(() => lancerLa({ ssh: process.env.BRIGADE_SSH_BIN || "ssh", delaiMs: 30_000, connexionS: 10 }, lu, commande));
  passage.set(lu.nom, rendu);
  return rendu;
};
ipcMain.handle("cuireSurLaStation", (_, nom: unknown, station: unknown, geste: unknown) => {
  const vise = connu(nom);
  if (vise === undefined) return parti(nom);
  const cuisine = cuisines.cuisineDe(vise);
  return cuireSurLaStation(vise.nom, cuisine === undefined ? undefined : { nom: vise.nom, cuisine }, faits.stations(vise.nom), station, geste, lancerSurLaCuisine);
});
// Le plafond de calibrage du projet, réglé depuis son onglet Cooks (ticket 1284) : `station ceiling-modele|ceiling-effort`,
// ou leur retrait, part là où sa cuisine tourne (plafond-de-calibrage.ts). La vue relit la box quand il est fait.
ipcMain.handle("reglerLePlafondDeCalibrage", (_, nom: unknown, choix: unknown) => {
  const vise = connu(nom);
  if (vise === undefined) return parti(nom);
  const cuisine = cuisines.cuisineDe(vise);
  return reglerLePlafondDeCalibrage(vise.nom, cuisine === undefined ? undefined : { nom: vise.nom, cuisine }, faits.plafondDeCalibrage(vise.nom), choix, lancerSurLaCuisine);
});
// Les réglages du projet, sur sa page (#1309) : lus par `setting` là où sa cuisine tourne, et changés par une PR sur
// son dépôt — rien ne se pose sur la box (reglages-du-projet.ts). La proposition attend que le runtime du projet ait
// ouvert la PR — il l'attend lui-même deux minutes au plus — : elle ne passe pas par le passage du projet, que ses
// lectures ne restent pas derrière elle. Seule l'adresse d'une PR qu'elle a rendue s'ouvre depuis l'écran.
const propositionsDeReglage = new Set<string>();
const cuisineDuProjet = (nom: unknown) => {
  const vise = connu(nom);
  const cuisine = vise === undefined ? undefined : cuisines.cuisineDe(vise);
  return { vise, lu: vise === undefined || cuisine === undefined ? undefined : { nom: vise.nom, cuisine } };
};
ipcMain.handle("reglagesDuProjet", (_, nom: unknown) => {
  const { vise, lu } = cuisineDuProjet(nom);
  return vise === undefined ? { sans: `${String(nom)} is no longer in the projects file` } : lireLesReglages(vise.nom, lu, lancerSurLaCuisine);
});
ipcMain.handle("proposerUnReglage", async (_, nom: unknown, choix: unknown) => {
  const { vise, lu } = cuisineDuProjet(nom);
  if (vise === undefined) return parti(nom);
  const rendu = await proposerLeReglage(vise.nom, lu, choix, (lu, commande) => lancerLa({ ssh: process.env.BRIGADE_SSH_BIN || "ssh", delaiMs: 150_000, connexionS: 10 }, lu, commande));
  if ("pr" in rendu) propositionsDeReglage.add(rendu.pr);
  return rendu;
});
ipcMain.handle("ouvrirLaProposition", (_, url: unknown) => {
  if (typeof url !== "string" || !propositionsDeReglage.has(url)) return false;
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
// La mise à jour de l'app installée (mise-a-jour/etat.ts) : son état, la vérification que la vue
// demande, et « installer maintenant » — l'app se ferme et rien n'est rendu, ou elle dit pourquoi
// elle reste sur sa version. Depuis le dépôt, l'état dit qu'elle ne se met pas à jour par là.
ipcMain.handle("miseAJour", () => miseAJour.vu());
ipcMain.handle("verifierMiseAJour", () => miseAJour.verifier());
ipcMain.handle("installerMiseAJour", () => miseAJour.installerMaintenant());
// Le bandeau d'une version plus haute : le dernier avis, son lien ouvert dans le navigateur — celui de l'avis, et lui
// seul —, et la version que le chef écarte, gardée d'un lancement à l'autre.
ipcMain.handle("avisDeVersion", () => avisDeVersion);
ipcMain.handle("telechargerVersion", async (_, url: unknown) => {
  if (typeof url !== "string" || (await avisDeVersion)?.url !== url) return false;
  return shell.openExternal(url).then(
    () => true,
    () => false,
  );
});
ipcMain.handle("refuserVersion", async (_, version: unknown) => {
  if (typeof version !== "string" || !refuserLaVersion(versionEcartee, version)) return false;
  if ((await avisDeVersion)?.version === version) avisDeVersion = Promise.resolve(undefined);
  return true;
});
// Un clone en retard : sa mise à jour — `git -C <clone> pull` — est écrite dans un shell, et
// rien ne l'envoie. La vue nomme le clone ; ce qui s'écrit, et dans l'espace de quel projet, se
// décide dans retard.ts — ou pourquoi rien ne l'est. Rien, pour un clone qui n'est pas en retard.
// L'espace du projet est ouvert d'abord, comme au clic sur sa case : un shell n'y vit pas sans son second.
ipcMain.handle("mettreAJour", (_, clone: unknown) =>
  retards.ecrire(
    {
      shell: (hote, ecrit) => {
        terminaux.espace(hote);
        return terminaux.shell(hote, ecrit);
      },
    },
    clone,
  ),
);
// Ce qu'engage l'allumage du manager, chiffré (allumage.ts) : `manager backlog`, lancée une fois
// sur la box, par le passage du projet comme les veilles. La vue le demande quand la confirmation
// d'« allumer » s'ouvre : cette lecture ne retient pas le « oui », et n'écrit rien.
ipcMain.handle("compter", (_, nom: unknown) => {
  const vise = connu(nom);
  if (vise?.box === undefined) return undefined;
  const servi = { nom: vise.nom, box: vise.box };
  // Jamais posée hors des essais, comme pour la veille.
  const rendu = (passage.get(servi.nom) ?? Promise.resolve()).then(() => compter({ ssh: process.env.BRIGADE_SSH_BIN || "ssh", delaiMs: 30_000, connexionS: 10 }, servi));
  passage.set(servi.nom, rendu);
  return rendu;
});
// Lancer un nettoyage depuis la partie closer (closer-lancement.ts) : l'aperçu, la demande — au seul
// « oui » du chef, `oui` à `true` —, son annulation, lancés une fois sur la box par le passage du
// projet, comme `manager backlog` : la lecture de l'onglet qui suit le geste le voit.
ipcMain.handle("closer", (_, nom: unknown, action: unknown, oui: unknown) => {
  const vise = connu(nom);
  if (vise?.box === undefined) return undefined;
  const servi = { nom: vise.nom, box: vise.box };
  const rendu = (passage.get(servi.nom) ?? Promise.resolve()).then(() => agirSurLeCloser({ ssh: process.env.BRIGADE_SSH_BIN || "ssh", delaiMs: 30_000, connexionS: 10 }, servi, action, oui));
  passage.set(servi.nom, rendu);
  return rendu;
});
// Le « yes » ou le « no » du chef sur une correction proposée (correction.ts), pour une proposition que la
// dernière lecture du tableau de la cuisine du projet porte : écrit sur ce tableau (#1741,
// tableau-gestes/rail.ts), en commentaire `correction`, par le jeton du `gh` de ce poste — ni `ssh` ni box
// jointe. La box le tranche à son tick suivant ; le tableau relu le montre : tranchée, la proposition n'y
// est plus.
ipcMain.handle("corriger", async (_, nom: unknown, proposition: unknown, reponse: unknown) => {
  const vise = connu(nom);
  if (vise === undefined) return undefined;
  const rendu = await reponseALaFile(tableaux.dernier(vise.nom), "correction", proposition, reponse, clientDesGestes);
  if ("postee" in rendu) tableaux.oublier();
  return rendu;
});
// La réponse du chef à une carte de TODO (carte-todo.ts) : un choix, d'un clic, ou son texte, pour la carte
// que ses derniers faits lus portent — écrite sur le tableau de la cuisine du projet (#1694,
// tableau-gestes/rail.ts), en commentaire `choose` ou `answer`, par le jeton du `gh` de ce poste : ni
// `ssh` ni box jointe. La box la joue à son tick suivant — `rail choose` ou `rail answer` l'écrit sur
// l'issue, sort la carte de TODO et fait avancer le ticket.
ipcMain.handle("repondreCarte", async (_, nom: unknown, ticket: unknown, reponse: unknown) => {
  const vise = connu(nom);
  if (vise === undefined) return undefined;
  const lue = reponseLue(faits.carte(vise.nom, ticket), ticket, reponse);
  if ("refus" in lue) return lue;
  const rendu = await reponseDeCarteAuTableau(tableaux.dernier(vise.nom), lue, clientDesGestes);
  if ("repondue" in rendu) tableaux.oublier();
  return rendu;
});
// Le « yes » ou le « no » du chef sur un profil de cook proposé (profil.ts), par le même chemin : écrit sur
// le tableau de la cuisine du projet, en commentaire `profile`, pour une proposition que sa dernière lecture
// porte — ni `ssh` ni box jointe.
ipcMain.handle("trancherLeProfil", async (_, nom: unknown, proposition: unknown, reponse: unknown) => {
  const vise = connu(nom);
  if (vise === undefined) return undefined;
  const rendu = await reponseALaFile(tableaux.dernier(vise.nom), "profile", proposition, reponse, clientDesGestes);
  if ("postee" in rendu) tableaux.oublier();
  return rendu;
});
// La PR qu'un nettoyage fini a ouverte (bilan du closer, #992) s'ouvre dans le navigateur du poste :
// une adresse https seulement, pour un projet que l'app connaît. Rend si elle a été ouverte.
ipcMain.handle("ouvrirBilan", (_, nom: unknown, url: unknown) => {
  if (connu(nom) === undefined || typeof url !== "string" || !/^https:\/\/[^\s]+$/.test(url)) return false;
  return shell.openExternal(url).then(
    () => true,
    () => false,
  );
});
// La ligne d'une leçon promue dans le carnet du projet (#1058) : l'adresse que ses derniers faits lus
// donnent pour cette leçon, et aucune autre. Elle s'ouvre dans le navigateur, rien n'est créé.
ipcMain.handle("ouvrirLecon", (_, nom: unknown, id: unknown) => {
  const url = faits.lecon(nom, id);
  if (url === undefined) return false;
  return shell.openExternal(url).then(
    () => true,
    () => false,
  );
});
// Un projet refusé n'a pas d'espace, mais sa box se lit quand même.
ipcMain.on("regarder", (_, nom: unknown, demande: number) => (voir = () => regarder(projets().filter((candidat) => candidat.nom === nom), ["status"], demande, true))());
// L'onglet de contenu affiché, et lui seul : sa commande, sur la box de son projet.
// Aucun — un terminal, « Tous les projets » — ou un nom qui n'est pas celui d'un onglet : plus rien n'est lu pour lui.
// Cooks lit `station`, puis `measures` sur la fenêtre que `station` dit et `closing --json` : ses sections
// de fiabilité et de closer (onglets.ts, #1699).
// La page des coûts de l'app (#1022), elle, n'a pas de projet : elle lit `station` sur la box de chaque
// projet qu'elle sert encore — ses chiffres sont tous projets confondus (vue/cost/tete.js). Celle des ratios
// (#1682) lit de même `closing --json` sur la box de chacun (vue/closer/tendance/tendance.js).
ipcMain.on("onglet", (_, nom: unknown, id: unknown, demande: number) => {
  const commandes = commandesDe(id);
  ongletLu = { id, demande };
  const lus = projetsLus(id, nom, affichee().projets);
  veilleDOnglet.regarder(commandes.length === 0 ? [] : lus, commandes, demande);
});
// « Tous les projets » : le `status` de chacun — ce qui bloque un projet, depuis quand ses décisions
// attendent, une station saturée : ce que l'accueil dit en une ligne et que `faits` ne porte pas.
ipcMain.on("tous", (_, demande: number) => (voir = () => regarder(projets(), ["status"], demande))());
// La vue a posé sa barre — au démarrage, puis à chaque changement du fichier des projets.
ipcMain.on("faits", (_, demande: number) => {
  faits.oublier();
  direLAccueil(accueil.oublier());
  // Chaque projet qui se lit — sur sa box ou ici — a sa bande dès maintenant : rien n'y est encore vérifié.
  for (const bande of bandes.ouvrir(projets().filter(lisible).map(({ nom }) => nom))) { dernieresBandes.set(bande.projet, bande); dire("alertes", bande); }
  veilleDesFaits.regarder(projets(), [COMMANDE], demande);
  veilleDuManager.regarder(projets(), [COMMANDE_MANAGER], demande);
  controlerTout();
});
// « réessayer maintenant » (#728) : le tableau est relu tout de suite, sur GitHub — pas la lecture
// d'il y a quelques secondes —, sans effacer ce qui en était tenu.
ipcMain.on("relireBox", (_, demande: number) => {
  tableaux.oublier();
  veilleDesFaits.regarder(projets(), [COMMANDE], demande);
  veilleDuManager.regarder(projets(), [COMMANDE_MANAGER], demande);
});
// Les tickets `fire` d'un projet, lus sur GitHub par le `gh` du poste (feu.ts) : ce que la box ne
// disant plus rien, le rail sait encore. Jamais par la box — c'est justement elle qui ne répond pas.
// Les adresses que GitHub a rendues pour ces tickets : un numéro de la liste s'ouvre par elles, la box ne les dit plus.
const adressesDeFeu = new Map<string, Map<number, string>>();
ipcMain.handle("lireFeu", async (_, nom: unknown) => {
  const vise = connu(nom);
  if (vise === undefined) return undefined;
  // Jamais posée hors des essais, comme BRIGADE_SSH_BIN.
  const feu = await lireFeu({ gh: process.env.BRIGADE_GH_BIN || "gh", delaiMs: 30_000 }, vise.dossier);
  if ("tickets" in feu) adressesDeFeu.set(String(nom), new Map(feu.tickets.flatMap(({ ticket, url }) => (url === undefined ? [] : [[ticket, url] as const]))));
  return feu;
});
// Un ticket du rail s'ouvre sur son issue, dans le navigateur du poste : la vue nomme le
// projet et le ticket, l'adresse est celle que la box a rendue (faits.ts) — ou, pour une issue
// qui n'est pas encore sur le rail, celle que `manager upstream` a donnée (amont.ts). Rend si elle a été ouverte.
ipcMain.handle("ouvrirIssue", (_, nom: unknown, ticket: unknown) => {
  // Un projet sans box ni station ici : l'adresse est celle du rail que sa station publie (#1435).
  const adresse =
    faits.adresse(nom, ticket) ??
    amonts.adresse(nom, ticket) ??
    (typeof ticket === "number" ? (adressesDeFeu.get(String(nom))?.get(ticket) ?? adressesPubliees.get(String(nom))?.get(ticket)) : undefined);
  return adresse === undefined ? false : shell.openExternal(adresse).then(
    () => true,
    () => false,
  );
});
// Un ticket de Livré s'ouvre aussi sur sa PR mergée : l'adresse est celle que la box a donnée
// pour lui (faits.ts). Rend si elle a été ouverte.
ipcMain.handle("ouvrirPr", (_, nom: unknown, ticket: unknown) => {
  const adresse = faits.pr(nom, ticket);
  return adresse === undefined ? false : shell.openExternal(adresse).then(
    () => true,
    () => false,
  );
});
// La page d'un worktree servi s'ouvre dans le navigateur du poste : la vue nomme le projet et le
// worktree, le port est celui que la box a montré (page.ts). Rien, pour un projet sans box.
ipcMain.handle("ouvrirPage", (_, nom: unknown, worktree: unknown) => {
  const vise = connu(nom);
  return vise === undefined ? undefined : pages.ouvrir(vise, worktree);
});
ipcMain.on("ecrire", (_, id: number, donnees: string) => terminaux.ecrire(id, donnees));
ipcMain.handle("propositionsDuSecond", () => propositionsDuSecond?.vu() ?? {});
// Le chef a répondu au second — d'un clic, dont la vue a déjà tapé le choix dans son terminal, ou en tapant : le canal
// l'efface, s'il porte encore la proposition à laquelle il a répondu.
ipcMain.handle("repondreAuSecond", (_, nom: unknown, reponse: ReponseDuChef) => {
  const vise = connu(nom);
  if (vise === undefined || propositionsDuSecond === undefined) return { state: "refused", reason: "nothing to answer: this project's second is not followed", current: null };
  return propositionsDuSecond.repondre(vise.nom, reponse);
});
ipcMain.on("redimensionner", (_, id: number, colonnes: number, lignes: number) => terminaux.redimensionner(id, colonnes, lignes));

// Les pty appartiennent à l'app, pas à la fenêtre — mais il n'y a qu'une
// fenêtre : la fermer, c'est quitter, et quitter arrête tous les terminaux.
app.on("window-all-closed", () => app.quit());
app.on("will-quit", () => {
  suivi.fermer();
  preferences.fermer();
  terminaux.fermer();
  propositionsDuSecond?.arreter();
  tours.fermer();
  veille.fermer();
  veilleDOnglet.fermer();
  veilleDesFaits.fermer();
  veilleDuManager.fermer();
  veilleDeLAmont.fermer();
  pages.fermer();
  retards.fermer();
  miseAJour.fermer();
  clearInterval(verificationsDeVersion);
  stations.fermer();
  clearInterval(controles);
  // Les cooks du poste ne survivent pas à l'app : fermée, sa station est absente.
  void runner.fermer();
  // La station de l'ordinateur s'arrête avec l'app, et écrit sur GitHub l'heure de son arrêt.
  void stationLocale?.arreter();
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
  if (installeeAuLancement) return app.quit();
  // Mac installé : le .app porte son icône. Sous `npm start`, on pose celle de brigade à la main.
  // Windows : l'exécutable garde l'icône d'Electron, la fenêtre reçoit donc toujours la sienne — le
  // `Brigade.ico` posé à côté de l'exécutable une fois installée.
  const icone = join(import.meta.dirname, "..", "packaging", "icones", "Brigade-1024.png");
  const iconeWindows = app.isPackaged ? join(dirname(process.execPath), "Brigade.ico") : icone;
  if (estUnMac(plateforme) && !app.isPackaged) app.dock?.setIcon(icone);
  fenetre = new BrowserWindow({
    ...(plateforme === "win32" ? { icon: iconeWindows } : {}),
    width: 1280,
    height: 800,
    // Le plancher : la moitié de la largeur d'ouverture. En deçà, la peau ne tient plus (vue.css).
    minWidth: 640,
    minHeight: 400,
    title: "brigade",
    // Le fond de la fenêtre avant que la vue ne se peigne : celui de la peau (`--fond`, vue/jetons.css).
    backgroundColor: "#121418",
    webPreferences: { preload: join(import.meta.dirname, "preload.cjs") },
  });
  // La première lecture du retard des clones : la vue la reçoit, ou la trouve à son démarrage.
  void retards.relire();
  // La première vérification des versions publiées, puis une toutes les six heures.
  miseAJour.demarrer();
  // Et celle du bandeau d'une version plus haute, puis une toutes les six heures.
  verifierLaVersion();
  verificationsDeVersion = setInterval(verifierLaVersion, 6 * 60 * 60 * 1000);
  // Les projets déclarés avant que les couleurs existent reçoivent les leurs, une fois.
  colorer();
  // Les préférences du chef : lues dans son gist — qui en prend celles du fichier, s'il n'en a encore
  // aucune —, puis relues chaque minute. Celles du gist l'emportent sur les couleurs tout juste tirées.
  preferences.demarrer();
  // L'app est lancée : ses stations se manifestent.
  runner.servir(cuisinesIci(role, projets()));
  // Le poste se réveille : chaque shell distant se rattache à sa session, sans attendre que `ssh`
  // découvre que sa connexion d'avant le sommeil est morte.
  powerMonitor.on("resume", () => terminaux.reveiller());
  return fenetre.loadFile(join(import.meta.dirname, "vue/index.html"));
});
