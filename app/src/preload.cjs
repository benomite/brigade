// Le pont entre la vue et le process principal : rien que ces gestes. La
// vue n'a ni Node ni accès aux fichiers.
const { contextBridge, ipcRenderer } = require("electron");

// Le constat d'un dépôt, ou son refus (`{ refus }`) changé en rejet : sa phrase en est le message, sans le préfixe
// qu'Electron met à une erreur levée de l'autre côté.
/**
 * @param {import("./vue/addition-project/installation-of-repository.js").StateOfRepository | { refus: string }} rendered
 * @returns {Promise<import("./vue/addition-project/installation-of-repository.js").StateOfRepository>}
 */
const findingOrRejection = (rendered) => ("refus" in rendered ? Promise.reject(new Error(String(rendered.refus))) : Promise.resolve(rendered));

/** @type {import("./vue/bridge.d.ts").Bridge} */
const bridge = {
  demarrage: () => ipcRenderer.invoke("demarrage"),
  colorer: (project, role, color) => ipcRenderer.invoke("colorer", project, role, color),
  changerSigle: (project, acronym) => ipcRenderer.invoke("changerSigle", project, acronym),
  iconeDeFond: () => ipcRenderer.invoke("iconeDeFond"),
  changerBarreDeMenus: (active) => ipcRenderer.invoke("changerBarreDeMenus", active),
  ranger: (project, rank) => ipcRenderer.invoke("ranger", project, rank),
  retrait: (project) => ipcRenderer.invoke("retrait", project),
  retirerDeLApp: (project) => ipcRenderer.invoke("retirerDeLApp", project),
  espace: (project) => ipcRenderer.invoke("espace", project),
  terminauxOuverts: () => ipcRenderer.invoke("terminauxOuverts"),
  machines: (project) => ipcRenderer.invoke("machines", project),
  shell: (project, machine) => ipcRenderer.invoke("shell", project, machine),
  fermerShell: (id) => ipcRenderer.invoke("fermerShell", id),
  demander: (project, ticket) => ipcRenderer.invoke("demander", project, ticket),
  lireQuestion: (project, ticket) => ipcRenderer.invoke("lireQuestion", project, ticket),
  gestesDeFiche: (card) => ipcRenderer.invoke("gestesDeFiche", card),
  demanderAuSecond: (project, ticket) => ipcRenderer.invoke("demanderAuSecond", project, ticket),
  passerAuSecond: (project, ticket, question) => ipcRenderer.invoke("passerAuSecond", project, ticket, question),
  lireTitre: (project, ticket) => ipcRenderer.invoke("lireTitre", project, ticket),
  relireLesStations: () => ipcRenderer.invoke("relireLesStations"),
  relireBox: (request) => ipcRenderer.send("relireBox", request),
  repondreQuestion: (project, ticket, answer) => ipcRenderer.invoke("repondreQuestion", project, ticket, answer),
  // La mise à jour de l'app installée (update/state.ts) : `miseAJour` rend son état
  // (`EtatDeMiseAJour` : inactive, verification, a-jour, disponible, telechargement, prete,
  // installation, erreur), `verifierMiseAJour` relit le flux des versions publiées et rend l'état
  // qui en sort, `installerMiseAJour` installe la nouvelle version et relance l'app — rien n'est
  // rendu, elle se ferme — ou rend `{ refus }`. Chaque changement d'état arrive par `surMiseAJour`.
  miseAJour: () => ipcRenderer.invoke("miseAJour"),
  installerMiseAJour: () => ipcRenderer.invoke("installerMiseAJour"),
  // La ligne d'une version plus haute (tickets 1528 et 2431, update/opinion.ts) : le dernier avis — la dernière version,
  // celle qui tourne, le lien direct du paquet de ce poste, le premier lancement — ou rien ; chaque vérification suivante
  // par `surAvisDeVersion`. `telechargerVersion` ouvre ce lien dans le navigateur. Rien ne l'écarte.
  avisDeVersion: () => ipcRenderer.invoke("avisDeVersion"),
  surAvisDeVersion: (receive) => void ipcRenderer.on("avisDeVersion", (_, opinion) => receive(opinion)),
  telechargerVersion: (url) => ipcRenderer.invoke("telechargerVersion", url),
  appairer: (code) => ipcRenderer.invoke("appairer", code),
  depotsDuChef: () => ipcRenderer.invoke("depotsDuChef"),
  lireUnDepot: (repository) => ipcRenderer.invoke("lireUnDepot", repository),
  // Le dépôt choisi dans « Add a project » est-il prêt pour brigade, puis sa préparation (#2627) : le constat
  // `{ ready, missingBindings, missingLabels }`, ou un rejet dont le message est la phrase du refus.
  checkRepoSetup: (repo) => ipcRenderer.invoke("checkRepoSetup", repo).then(findingOrRejection),
  runRepoSetup: (repo) => ipcRenderer.invoke("runRepoSetup", repo).then(findingOrRejection),
  confierAUneStation: (input) => ipcRenderer.invoke("confierAUneStation", input),
  defautsDeStation: (name) => ipcRenderer.invoke("defautsDeStation", name),
  dossiersDeLaStation: (name) => ipcRenderer.invoke("dossiersDeLaStation", name),
  lireReglagesDeLaStation: () => ipcRenderer.invoke("reglagesDeLaStation:lire"),
  ecrireReglagesDeLaStation: (change) => ipcRenderer.invoke("reglagesDeLaStation:ecrire", change),
  choisirUneIssue: (name, choice, issue) => ipcRenderer.invoke("choisirUneIssue", name, choice, issue),
  demenagerLaCuisine: (name, to) => ipcRenderer.invoke("demenagerLaCuisine", name, to),
  autoriserSurGitHub: (url) => ipcRenderer.invoke("autoriserSurGitHub", url),
  agentsAtWork: (project) => ipcRenderer.invoke("agentsAtWork", project),
  // La fiche du projet, sous Settings (ticket 4240) : lue et écrite dans le dossier du projet (card-project/card-project-folder.ts).
  lireUnFichierDuProjet: (project, path) => ipcRenderer.invoke("lireUnFichierDuProjet", project, path),
  ecrireUnFichierDuProjet: (project, path, text) => ipcRenderer.invoke("ecrireUnFichierDuProjet", project, path, text),
  // Les plafonds de durée du projet, sur Kitchen > Health (ticket 2490) : lus et écrits dans son dépôt, sur GitHub.
  // Le closer du projet, sur Kitchen > Health (ticket 2491) : ses passes, ses vérifications en plus et ses réglages, sur GitHub.
  savoirDuProjet: (project) => ipcRenderer.invoke("savoirDuProjet", project),
  changerLeSavoir: (project, change) => ipcRenderer.invoke("changerLeSavoir", project, change),
  ouvrirLaProposition: (url) => ipcRenderer.invoke("ouvrirLaProposition", url),
  retirerLaStation: (id) => ipcRenderer.invoke("retirerLaStation", id),
  // Les GitHub Apps de la station de cet ordinateur (ticket 2317) : ce qu'elle en a, et en ranger une — jamais la clé en retour.
  // Les projets que la station de cet ordinateur sert (ticket 2359) : sa liste, et un projet ajouté ou retiré.
  projetsServis: () => ipcRenderer.invoke("projetsServis"),
  servirUnProjet: (repository, served) => ipcRenderer.invoke("servirUnProjet", repository, served),
  // Un projet ouvert d'un clic — chaque étape de sa copie arrive par `surOuverture` — ; la connexion à
  // GitHub, dont la fin arrive par `surConnexionGitHub` ; une page qu'un échec a nommée.
  ouvrirDUneStation: (name, repository, base) => ipcRenderer.invoke("ouvrirDUneStation", name, repository, base),
  seConnecterAGitHub: () => ipcRenderer.invoke("seConnecterAGitHub"),
  // Installe la station de cet ordinateur, depuis le bloc de l'accueil (ticket 2640).
  installerLaStation: () => ipcRenderer.invoke("installerLaStation"),
  // Le compte GitHub de cet ordinateur, que dit l'étape du compte du parcours d'ajout (ticket 2475).
  compteGitHub: () => ipcRenderer.invoke("compteGitHub"),
  ouvrirLaPage: (url) => ipcRenderer.invoke("ouvrirLaPage", url),
  // Les stations enregistrées sous le compte GitHub du chef (ticket 1706), et les projets que chacune sert, écrits dans
  // son gist.
  stationsDuCompte: () => ipcRenderer.invoke("stationsDuCompte"),
  choisirLesProjets: (id, repositories) => ipcRenderer.invoke("choisirLesProjets", id, repositories),
  repondreCarte: (project, ticket, answer) => ipcRenderer.invoke("repondreCarte", project, ticket, answer),
  ouvrirLectureSeule: (project, page) => ipcRenderer.invoke("ouvrirLectureSeule", project, page),
  regarder: (project, request) => ipcRenderer.send("regarder", project, request),
  tous: (request) => ipcRenderer.send("tous", request),
  faits: (request) => ipcRenderer.send("faits", request),
  ouvrirIssue: (project, ticket) => ipcRenderer.invoke("ouvrirIssue", project, ticket),
  ouvrirPr: (project, ticket) => ipcRenderer.invoke("ouvrirPr", project, ticket),
  ouvrirPrDuCook: (project, ticket) => ipcRenderer.invoke("ouvrirPrDuCook", project, ticket),
  ecrire: (id, data) => ipcRenderer.send("ecrire", id, data),
  redimensionner: (id, columns, lines) => ipcRenderer.send("redimensionner", id, columns, lines),
  scroll: (id, lines) => ipcRenderer.send("scroll", id, lines),
  surSortie: (receive) => void ipcRenderer.on("sortie", (_, id, data) => receive(id, data)),
  surEtat: (receive) => void ipcRenderer.on("etat", (_, terminal) => receive(terminal)),
  surContenu: (receive) => void ipcRenderer.on("contenu", (_, reading) => receive(reading)),
  surFaits: (receive) => void ipcRenderer.on("faits", (_, receivedOne) => receive(receivedOne)),
  // Une question cliquée dans le menu de la barre des menus (menu-bar.ts) : sa carte s'ouvre.
  surOuvrirProjet: (receive) => void ipcRenderer.on("ouvrirProjet", (_, project) => receive(project)),
  surOuvrirCarte: (receive) => void ipcRenderer.on("ouvrirCarte", (_, project, ticket) => receive(project, ticket)),
  surMiseAJour: (receive) => void ipcRenderer.on("miseAJour", (_, state) => receive(state)),
  surStations: (receive) => void ipcRenderer.on("stations", (_, seenOne) => receive(seenOne)),
  surProjetsDesStations: (receive) => void ipcRenderer.on("projetsDesStations", (_, seenOne) => receive(seenOne)),
  surAccueil: (receive) => void ipcRenderer.on("accueil", (_, seenOne) => receive(seenOne)),
  surOuverture: (receive) => void ipcRenderer.on("ouverture", (_, repository, step) => receive(repository, step)),
  surConnexionGitHub: (receive) => void ipcRenderer.on("connexionGitHub", (_, end) => receive(end)),
  surConfiguration: (receive) => void ipcRenderer.on("configuration", (_, configuration, closed) => receive(configuration, closed)),
};
contextBridge.exposeInMainWorld("brigade", bridge);
