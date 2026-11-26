// Le pont entre la vue et le process principal : rien que ces quatre-vingts gestes. La
// vue n'a ni Node ni accès aux fichiers.
const { contextBridge, ipcRenderer } = require("electron");

// Le constat d'un dépôt, ou son refus (`{ refus }`) changé en rejet : sa phrase en est le message, sans le préfixe
// qu'Electron met à une erreur levée de l'autre côté.
/**
 * @param {import("./vue/addition-project/installation-du-repository.js").StateDuRepository | { refus: string }} rendu
 * @returns {Promise<import("./vue/addition-project/installation-du-repository.js").StateDuRepository>}
 */
const constatOuRejet = (rendu) => ("refus" in rendu ? Promise.reject(new Error(String(rendu.refus))) : Promise.resolve(rendu));

/** @type {import("./vue/pont.d.ts").Pont} */
const pont = {
  demarrage: () => ipcRenderer.invoke("demarrage"),
  colorer: (project, role, couleur) => ipcRenderer.invoke("colorer", project, role, couleur),
  changerSigle: (project, sigle) => ipcRenderer.invoke("changerSigle", project, sigle),
  iconeDeFond: () => ipcRenderer.invoke("iconeDeFond"),
  changerBarreDeMenus: (actif) => ipcRenderer.invoke("changerBarreDeMenus", actif),
  ordinaires: (project) => ipcRenderer.invoke("ordinaires", project),
  reglerOrdinaires: (project, actif, limit) => ipcRenderer.invoke("reglerOrdinaires", project, actif, limit),
  ranger: (project, rang) => ipcRenderer.invoke("ranger", project, rang),
  service: (project) => ipcRenderer.invoke("service", project),
  deplierService: (project) => ipcRenderer.invoke("deplierService", project),
  amorcer: (project) => ipcRenderer.invoke("amorcer", project),
  direMerge: (project, merge) => ipcRenderer.invoke("direMerge", project, merge),
  verifier: (project) => ipcRenderer.invoke("verifier", project),
  declarerStations: (project, choice) => ipcRenderer.invoke("declarerStations", project, choice),
  changerUneStation: (project, station, voulu) => ipcRenderer.invoke("changerUneStation", project, station, voulu),
  proteger: (project) => ipcRenderer.invoke("proteger", project),
  repondre: (project, valeurs) => ipcRenderer.invoke("repondre", project, valeurs),
  passerDecisions: (project) => ipcRenderer.invoke("passerDecisions", project),
  demarrer: (project) => ipcRenderer.invoke("demarrer", project),
  retrait: (project) => ipcRenderer.invoke("retrait", project),
  retirerDeLApp: (project) => ipcRenderer.invoke("retirerDeLApp", project),
  direJournal: (project, coche) => ipcRenderer.invoke("direJournal", project, coche),
  planifier: (project) => ipcRenderer.invoke("planifier", project),
  desinstaller: (project, confirmation) => ipcRenderer.invoke("desinstaller", project, confirmation),
  espace: (project) => ipcRenderer.invoke("espace", project),
  terminauxOuverts: () => ipcRenderer.invoke("terminauxOuverts"),
  machines: (project) => ipcRenderer.invoke("machines", project),
  shell: (project, machine) => ipcRenderer.invoke("shell", project, machine),
  fermerShell: (id) => ipcRenderer.invoke("fermerShell", id),
  demander: (project, ticket) => ipcRenderer.invoke("demander", project, ticket),
  demanderAlerte: (project, sujet, dit) => ipcRenderer.invoke("demanderAlerte", project, sujet, dit),
  lireQuestion: (project, ticket) => ipcRenderer.invoke("lireQuestion", project, ticket),
  situation: (card) => ipcRenderer.invoke("situation", card),
  gestesDeFiche: (card) => ipcRenderer.invoke("gestesDeFiche", card),
  departDuProjet: (project) => ipcRenderer.invoke("departDuProjet", project),
  mettreSurLeRail: (project, lines) => ipcRenderer.invoke("mettreSurLeRail", project, lines),
  redigerLePremierTicket: (project, request) => ipcRenderer.invoke("redigerLePremierTicket", project, request),
  creerLePremierTicket: (project, brouillon) => ipcRenderer.invoke("creerLePremierTicket", project, brouillon),
  gesteDeFiche: (project, id, ticket, valeur) => ipcRenderer.invoke("gesteDeFiche", project, id, ticket, valeur),
  lireHistoire: (project, ticket) => ipcRenderer.invoke("lireHistoire", project, ticket),
  lireAutonomie: (projects, jours) => ipcRenderer.invoke("lireAutonomie", projects, jours),
  ouvrirTicketDAutonomie: (url) => ipcRenderer.invoke("ouvrirTicketDAutonomie", url),
  lireDiscussion: (project, ticket) => ipcRenderer.invoke("lireDiscussion", project, ticket),
  commenter: (project, ticket, texte) => ipcRenderer.invoke("commenter", project, ticket, texte),
  demanderAuSecond: (project, ticket, context) => ipcRenderer.invoke("demanderAuSecond", project, ticket, context),
  passerAuSecond: (project, ticket, question) => ipcRenderer.invoke("passerAuSecond", project, ticket, question),
  ouvrirLien: (project, ticket, url) => ipcRenderer.invoke("ouvrirLien", project, ticket, url),
  lireTitre: (project, ticket) => ipcRenderer.invoke("lireTitre", project, ticket),
  lireCapture: (project, ticket, screen, moment) => ipcRenderer.invoke("lireCapture", project, ticket, screen, moment),
  lireFeu: (project) => ipcRenderer.invoke("lireFeu", project),
  relireBox: (request) => ipcRenderer.send("relireBox", request),
  repondreQuestion: (project, ticket, answer) => ipcRenderer.invoke("repondreQuestion", project, ticket, answer),
  geste: (project, id, oui) => ipcRenderer.invoke("geste", project, id, oui),
  confirmer: (project, id) => ipcRenderer.invoke("confirmer", project, id),
  // Essayer une livraison (trial.ts, #3215) : l'état des essais d'un projet, « try it », « stop » ; `surEssais` dit qu'il a changé.
  essais: (project) => ipcRenderer.invoke("essais", project),
  essayer: (project, ticket) => ipcRenderer.invoke("essayer", project, ticket),
  arreterEssai: (project, ticket) => ipcRenderer.invoke("arreterEssai", project, ticket),
  refus: (project, id, ticket) => ipcRenderer.invoke("refus", project, id, ticket),
  attente: (project, id, ticket, saisie) => ipcRenderer.invoke("attente", project, id, ticket, saisie),
  ecrireMiseAJour: (clone) => ipcRenderer.invoke("mettreAJour", clone),
  passer: () => ipcRenderer.invoke("passer"),
  // La mise à jour de l'app installée (update/state.ts) : `miseAJour` rend son état
  // (`EtatDeMiseAJour` : inactive, verification, a-jour, disponible, telechargement, prete,
  // installation, erreur), `verifierMiseAJour` relit le flux des versions publiées et rend l'état
  // qui en sort, `installerMiseAJour` installe la nouvelle version et relance l'app — rien n'est
  // rendu, elle se ferme — ou rend `{ refus }`. Chaque changement d'état arrive par `surMiseAJour`.
  miseAJour: () => ipcRenderer.invoke("miseAJour"),
  verifierMiseAJour: () => ipcRenderer.invoke("verifierMiseAJour"),
  installerMiseAJour: () => ipcRenderer.invoke("installerMiseAJour"),
  // La ligne d'une version plus haute (tickets 1528 et 2431, update/opinion.ts) : le dernier avis — la dernière version,
  // celle qui tourne, le lien direct du paquet de ce poste, le premier lancement — ou rien ; chaque vérification suivante
  // par `surAvisDeVersion`. `telechargerVersion` ouvre ce lien dans le navigateur. Rien ne l'écarte.
  avisDeVersion: () => ipcRenderer.invoke("avisDeVersion"),
  surAvisDeVersion: (recevoir) => void ipcRenderer.on("avisDeVersion", (_, opinion) => recevoir(opinion)),
  telechargerVersion: (url) => ipcRenderer.invoke("telechargerVersion", url),
  appairer: (code) => ipcRenderer.invoke("appairer", code),
  depotsDuChef: () => ipcRenderer.invoke("depotsDuChef"),
  lireUnDepot: (repository) => ipcRenderer.invoke("lireUnDepot", repository),
  // Le dépôt choisi dans « Add a project » est-il prêt pour brigade, puis sa préparation (#2627) : le constat
  // `{ ready, missingBindings, missingLabels }`, ou un rejet dont le message est la phrase du refus.
  checkRepoSetup: (repo) => ipcRenderer.invoke("checkRepoSetup", repo).then(constatOuRejet),
  runRepoSetup: (repo) => ipcRenderer.invoke("runRepoSetup", repo).then(constatOuRejet),
  ajouterAUneStation: (saisie) => ipcRenderer.invoke("ajouterAUneStation", saisie),
  confierAUneStation: (saisie) => ipcRenderer.invoke("confierAUneStation", saisie),
  defautsDeStation: (name) => ipcRenderer.invoke("defautsDeStation", name),
  dossiersDeLaStation: (name) => ipcRenderer.invoke("dossiersDeLaStation", name),
  lireReglagesDeLaStation: () => ipcRenderer.invoke("reglagesDeLaStation:lire"),
  ecrireReglagesDeLaStation: (changement) => ipcRenderer.invoke("reglagesDeLaStation:ecrire", changement),
  retirerDUneStation: (name) => ipcRenderer.invoke("retirerDUneStation", name),
  continuerSansBacASable: (name) => ipcRenderer.invoke("continuerSansBacASable", name),
  leverLeRefus: (name, refusal, remede) => ipcRenderer.invoke("leverLeRefus", name, refusal, remede),
  choisirUneIssue: (name, choice, issue) => ipcRenderer.invoke("choisirUneIssue", name, choice, issue),
  signaler: (request) => ipcRenderer.invoke("signaler", request),
  demenagerLaCuisine: (name, vers) => ipcRenderer.invoke("demenagerLaCuisine", name, vers),
  autoriserSurGitHub: (url) => ipcRenderer.invoke("autoriserSurGitHub", url),
  panne: (id, cle) => ipcRenderer.invoke("panne", id, cle),
  reglagesDuProjet: (project) => ipcRenderer.invoke("reglagesDuProjet", project),
  proposerUnReglage: (project, choice) => ipcRenderer.invoke("proposerUnReglage", project, choice),
  // Les humains du projet, sous Settings (ticket 2930) : lus, et chaque changement écrit par une PR (humans-du-project.ts).
  listerLesHumains: (project) => ipcRenderer.invoke("listerLesHumains", project),
  enregistrerUnHumain: (project, human) => ipcRenderer.invoke("enregistrerUnHumain", project, human),
  retirerUnHumain: (project, login) => ipcRenderer.invoke("retirerUnHumain", project, login),
  // Les gestes retenus pour l'OK du chef (held/, ticket 4273) : lus, et approuvés un par un.
  lireLesAgents: (project) => ipcRenderer.invoke("lireLesAgents", project),
  gestesRetenus: (project) => ipcRenderer.invoke("gestesRetenus", project),
  approuverGeste: (project, id) => ipcRenderer.invoke("approuverGeste", project, id),
  // Les tickets récurrents du projet, sous Settings (ticket 3231) : lus, et chacun suspendu, repris ou retiré (recurring-box.ts).
  listerLesRecurrents: (project) => ipcRenderer.invoke("listerLesRecurrents", project),
  changerUnRecurrent: (project, action, id) => ipcRenderer.invoke("changerUnRecurrent", project, action, id),
  // La fiche du projet, sous Settings (ticket 4240) : lue et écrite dans le dossier du projet (card-project/card-project-dossier.ts).
  lireUnFichierDuProjet: (project, chemin) => ipcRenderer.invoke("lireUnFichierDuProjet", project, chemin),
  ecrireUnFichierDuProjet: (project, chemin, texte) => ipcRenderer.invoke("ecrireUnFichierDuProjet", project, chemin, texte),
  // Les explications des mots de la cuisine (ticket 3308) : ce que le chef en a vu, gardé par le runtime du projet (explanations/explanations-box.ts).
  lireLesExplications: (project) => ipcRenderer.invoke("lireLesExplications", project),
  marquerUneExplication: (project, word) => ipcRenderer.invoke("marquerUneExplication", project, word),
  remontrerLesExplications: (project) => ipcRenderer.invoke("remontrerLesExplications", project),
  envoyerUnMot: (project, entree) => ipcRenderer.invoke("envoyerUnMot", project, entree), // le mot au cook (ticket 4048, mot-au-cook/)
  // Le savoir-faire du projet, sous Know-how (ticket 4241) : lu, et chaque entrée réécrite ou retirée (know-how-tab/know-how-box.ts).
  lireLeSavoirFaire: (project) => ipcRenderer.invoke("lireLeSavoirFaire", project),
  modifierLeSavoirFaire: (project, id, texte) => ipcRenderer.invoke("modifierLeSavoirFaire", project, id, texte),
  retirerDuSavoirFaire: (project, id) => ipcRenderer.invoke("retirerDuSavoirFaire", project, id),
  // Le récapitulatif de chaque projet, sur l'accueil (ticket 3581) : lu, dit montré, et la PR d'un ticket servi ouverte (recap/recap-box.ts).
  lireLeRecap: (project) => ipcRenderer.invoke("lireLeRecap", project),
  marquerLeRecap: (project, until) => ipcRenderer.invoke("marquerLeRecap", project, until),
  ouvrirLaPRDuRecap: (url) => ipcRenderer.invoke("ouvrirLaPRDuRecap", url),
  // Les stations contributrices du projet, sous Settings (ticket 2936) : lues, refusées ou réacceptées (stations-contributrices.ts).
  listerLesStationsContributrices: (project) => ipcRenderer.invoke("listerLesStationsContributrices", project),
  refuserUneStationContributrice: (project, station) => ipcRenderer.invoke("refuserUneStationContributrice", project, station),
  accepterUneStationContributrice: (project, station) => ipcRenderer.invoke("accepterUneStationContributrice", project, station),
  // Les plafonds de durée du projet, sur Kitchen > Health (ticket 2490) : lus et écrits dans son dépôt, sur GitHub.
  plafondsDuree: (project) => ipcRenderer.invoke("plafondsDuree", project),
  changerPlafondDuree: (project, cle, saisie) => ipcRenderer.invoke("changerPlafondDuree", project, cle, saisie),
  // Le closer du projet, sur Kitchen > Health (ticket 2491) : ses passes, ses vérifications en plus et ses réglages, sur GitHub.
  closerDeSante: (project) => ipcRenderer.invoke("closerDeSante", project),
  changerReglageDuCloser: (project, cle, saisie) => ipcRenderer.invoke("changerReglageDuCloser", project, cle, saisie),
  changerVerificationDuCloser: (project, action, saisie) => ipcRenderer.invoke("changerVerificationDuCloser", project, action, saisie),
  savoirDuProjet: (project) => ipcRenderer.invoke("savoirDuProjet", project),
  changerLeSavoir: (project, changement) => ipcRenderer.invoke("changerLeSavoir", project, changement),
  ouvrirLaProposition: (url) => ipcRenderer.invoke("ouvrirLaProposition", url),
  lireLesResumesHebdomadaires: (project) => ipcRenderer.invoke("lireLesResumesHebdomadaires", project),
  changerLeJourDuResume: (project, day) => ipcRenderer.invoke("changerLeJourDuResume", project, day),
  publierLeResumeHebdomadaire: (project, weekStart, tag) => ipcRenderer.invoke("publierLeResumeHebdomadaire", project, weekStart, tag),
  ouvrirTicketDuResume: (url) => ipcRenderer.invoke("ouvrirTicketDuResume", url),
  retirerLaStation: (id) => ipcRenderer.invoke("retirerLaStation", id),
  // Les GitHub Apps de la station de cet ordinateur (ticket 2317) : ce qu'elle en a, et en ranger une — jamais la clé en retour.
  appsDeLaStation: () => ipcRenderer.invoke("appsDeLaStation"),
  rangerUneApp: (role, id, cle) => ipcRenderer.invoke("rangerUneApp", role, id, cle),
  // Les projets que la station de cet ordinateur sert (ticket 2359) : sa liste, et un projet ajouté ou retiré.
  projetsServis: () => ipcRenderer.invoke("projetsServis"),
  servirUnProjet: (repository, served) => ipcRenderer.invoke("servirUnProjet", repository, served),
  // Le premier lancement, sur un ordinateur neuf (ticket 1434) : les stations du chef et leurs projets, lus par le
  // runtime ; un projet ouvert d'un clic — chaque étape de sa copie arrive par `surOuverture` — ; la connexion à
  // GitHub, dont la fin arrive par `surConnexionGitHub` ; une page qu'un échec a nommée.
  stationsDuChef: () => ipcRenderer.invoke("stationsDuChef"),
  ouvrirDUneStation: (name, repository, base) => ipcRenderer.invoke("ouvrirDUneStation", name, repository, base),
  seConnecterAClaude: () => ipcRenderer.invoke("seConnecterAClaude"),
  seConnecterAGitHub: () => ipcRenderer.invoke("seConnecterAGitHub"),
  outilsManquants: (tools) => ipcRenderer.invoke("outilsManquants", tools),
  // Installe la station de cet ordinateur, depuis le bloc de l'accueil (ticket 2640).
  installerLaStation: () => ipcRenderer.invoke("installerLaStation"),
  // Démarre la station de cet ordinateur, depuis l'alerte d'un projet dont elle est arrêtée (ticket 3637).
  demarrerLaStationIci: (project) => ipcRenderer.invoke("demarrerLaStationIci", project),
  // Le compte GitHub de cet ordinateur, que dit l'étape du compte du parcours d'ajout (ticket 2475).
  compteGitHub: () => ipcRenderer.invoke("compteGitHub"),
  ouvrirLaPage: (url) => ipcRenderer.invoke("ouvrirLaPage", url),
  // Le lien de l'app Android que l'offre du téléphone montre (ticket 3303) : son `apkUrl`, ou la page des versions.
  lienDeLApk: () => ipcRenderer.invoke("lienDeLApk"),
  // Un téléphone déjà connecté au compte GitHub du poste (ticket 3303) : la trace qu'il pose dans un gist.
  telephoneConnecte: () => ipcRenderer.invoke("telephoneConnecte"),
  // La cuisine que la visite montre (ticket 4087) : son rail, lu sur GitHub en lectures seules, sans clone.
  lireLaCuisineVisitee: (repository) => ipcRenderer.invoke("lireLaCuisineVisitee", repository),
  // Les stations enregistrées sous le compte GitHub du chef (ticket 1706), et les projets que chacune sert, écrits dans
  // son gist.
  stationsDuCompte: () => ipcRenderer.invoke("stationsDuCompte"),
  choisirLesProjets: (id, depots) => ipcRenderer.invoke("choisirLesProjets", id, depots),
  // Le rail d'un projet sans box ni station ici, tel que sa station le publie sur GitHub (ticket 1435).
  railDuProjet: (name) => ipcRenderer.invoke("railDuProjet", name),
  compter: (project) => ipcRenderer.invoke("compter", project),
  repondreCarte: (project, ticket, answer) => ipcRenderer.invoke("repondreCarte", project, ticket, answer),
  gesteDeValidation: (project, ticket, action) => ipcRenderer.invoke("gesteDeValidation", project, ticket, action),
  gesteSensible: (project, ticket, action) => ipcRenderer.invoke("gesteSensible", project, ticket, action),
  annulerServi: (project, ticket) => ipcRenderer.invoke("annulerServi", project, ticket),
  ouvrirBilan: (project, url) => ipcRenderer.invoke("ouvrirBilan", project, url),
  ouvrirLectureSeule: (project, page) => ipcRenderer.invoke("ouvrirLectureSeule", project, page),
  regarder: (project, request) => ipcRenderer.send("regarder", project, request),
  tous: (request) => ipcRenderer.send("tous", request),
  onglet: (project, id, request) => ipcRenderer.send("onglet", project, id, request),
  faits: (request) => ipcRenderer.send("faits", request),
  ouvrirIssue: (project, ticket) => ipcRenderer.invoke("ouvrirIssue", project, ticket),
  ouvrirLesChecks: (project) => ipcRenderer.invoke("ouvrirLesChecks", project),
  ouvrirPr: (project, ticket) => ipcRenderer.invoke("ouvrirPr", project, ticket),
  ouvrirPrDuCook: (project, ticket) => ipcRenderer.invoke("ouvrirPrDuCook", project, ticket),
  ecrire: (id, donnees) => ipcRenderer.send("ecrire", id, donnees),
  propositionsDuSecond: () => ipcRenderer.invoke("propositionsDuSecond"),
  repondreAuSecond: (project, answer) => ipcRenderer.invoke("repondreAuSecond", project, answer),
  surProposition: (recevoir) => void ipcRenderer.on("proposition", (_, project, proposition) => recevoir(project, proposition)),
  redimensionner: (id, colonnes, lines) => ipcRenderer.send("redimensionner", id, colonnes, lines),
  surSortie: (recevoir) => void ipcRenderer.on("sortie", (_, id, donnees) => recevoir(id, donnees)),
  surEtat: (recevoir) => void ipcRenderer.on("etat", (_, terminal) => recevoir(terminal)),
  surActivites: (recevoir) => void ipcRenderer.on("activites", (_, publiees) => recevoir(publiees)),
  surContenu: (recevoir) => void ipcRenderer.on("contenu", (_, read, manager) => recevoir(read, manager)),
  surEssais: (recevoir) => void ipcRenderer.on("essais", (_, project) => recevoir(project)),
  surFaits: (recevoir) => void ipcRenderer.on("faits", (_, recue) => recevoir(recue)),
  surGuide: (recevoir) => void ipcRenderer.on("guide", (_, guide) => recevoir(guide)),
  surAlertes: (recevoir) => void ipcRenderer.on("alertes", (_, bande) => recevoir(bande)),
  surUrgence: (recevoir) => void ipcRenderer.on("urgence", (_, project) => recevoir(project)),
  // Une question cliquée dans le menu de la barre des menus (bar-de-menus.ts) : sa carte s'ouvre.
  surOuvrirCarte: (recevoir) => void ipcRenderer.on("ouvrirCarte", (_, project, ticket) => recevoir(project, ticket)),
  // L'écran du premier lancement avant l'avis de macOS (ticket 4081, vue/first-launch/) : attendu dès l'ouverture de
  // la vue, ou plus tard par `surAvisDeFond` ; son bouton rend la main à l'inscription de la station.
  avisDeFond: () => ipcRenderer.invoke("avisDeFond"),
  surAvisDeFond: (recevoir) => void ipcRenderer.on("avisDeFond", () => recevoir()),
  continuerLePremierLancement: () => ipcRenderer.invoke("continuerLePremierLancement"),
  surAmont: (recevoir) => void ipcRenderer.on("amont", (_, vu) => recevoir(vu)),
  surCode: (recevoir) => void ipcRenderer.on("code", (_, vu) => recevoir(vu)),
  surMiseAJour: (recevoir) => void ipcRenderer.on("miseAJour", (_, state) => recevoir(state)),
  surStations: (recevoir) => void ipcRenderer.on("stations", (_, vu) => recevoir(vu)),
  // La veille de la station de cet ordinateur (ticket 3642) : la dernière lue, puis chaque changement.
  veilleMachine: () => ipcRenderer.invoke("veilleMachine"),
  surVeilleMachine: (recevoir) => void ipcRenderer.on("veilleMachine", (_, standby) => recevoir(standby)),
  surProjetsDesStations: (recevoir) => void ipcRenderer.on("projetsDesStations", (_, vu) => recevoir(vu)),
  surAccueil: (recevoir) => void ipcRenderer.on("accueil", (_, vu) => recevoir(vu)),
  surOuverture: (recevoir) => void ipcRenderer.on("ouverture", (_, repository, step) => recevoir(repository, step)),
  surConnexionGitHub: (recevoir) => void ipcRenderer.on("connexionGitHub", (_, fin) => recevoir(fin)),
  surLoginClaude: (recevoir) => void ipcRenderer.on("loginClaude", () => recevoir()),
  surConfiguration: (recevoir) => void ipcRenderer.on("configuration", (_, configuration, fermes) => recevoir(configuration, fermes)),
};
contextBridge.exposeInMainWorld("brigade", pont);
