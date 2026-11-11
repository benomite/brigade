// Le pont entre la vue et le process principal : rien que ces quatre-vingts gestes. La
// vue n'a ni Node ni accès aux fichiers.
const { contextBridge, ipcRenderer } = require("electron");

// Le constat d'un dépôt, ou son refus (`{ refus }`) changé en rejet : sa phrase en est le message, sans le préfixe
// qu'Electron met à une erreur levée de l'autre côté.
/**
 * @param {import("./vue/ajout-projet/installation-du-depot.js").EtatDuDepot | { refus: string }} rendu
 * @returns {Promise<import("./vue/ajout-projet/installation-du-depot.js").EtatDuDepot>}
 */
const constatOuRejet = (rendu) => ("refus" in rendu ? Promise.reject(new Error(String(rendu.refus))) : Promise.resolve(rendu));

/** @type {import("./vue/pont.d.ts").Pont} */
const pont = {
  demarrage: () => ipcRenderer.invoke("demarrage"),
  colorer: (projet, role, couleur) => ipcRenderer.invoke("colorer", projet, role, couleur),
  changerSigle: (projet, sigle) => ipcRenderer.invoke("changerSigle", projet, sigle),
  changerBarreDeMenus: (actif) => ipcRenderer.invoke("changerBarreDeMenus", actif),
  ordinaires: (projet) => ipcRenderer.invoke("ordinaires", projet),
  reglerOrdinaires: (projet, actif, limite) => ipcRenderer.invoke("reglerOrdinaires", projet, actif, limite),
  ranger: (projet, rang) => ipcRenderer.invoke("ranger", projet, rang),
  service: (projet) => ipcRenderer.invoke("service", projet),
  deplierService: (projet) => ipcRenderer.invoke("deplierService", projet),
  amorcer: (projet) => ipcRenderer.invoke("amorcer", projet),
  direMerge: (projet, merge) => ipcRenderer.invoke("direMerge", projet, merge),
  verifier: (projet) => ipcRenderer.invoke("verifier", projet),
  declarerStations: (projet, choix) => ipcRenderer.invoke("declarerStations", projet, choix),
  changerUneStation: (projet, station, voulu) => ipcRenderer.invoke("changerUneStation", projet, station, voulu),
  proteger: (projet) => ipcRenderer.invoke("proteger", projet),
  repondre: (projet, valeurs) => ipcRenderer.invoke("repondre", projet, valeurs),
  passerDecisions: (projet) => ipcRenderer.invoke("passerDecisions", projet),
  demarrer: (projet) => ipcRenderer.invoke("demarrer", projet),
  retrait: (projet) => ipcRenderer.invoke("retrait", projet),
  retirerDeLApp: (projet) => ipcRenderer.invoke("retirerDeLApp", projet),
  direJournal: (projet, coche) => ipcRenderer.invoke("direJournal", projet, coche),
  planifier: (projet) => ipcRenderer.invoke("planifier", projet),
  desinstaller: (projet, confirmation) => ipcRenderer.invoke("desinstaller", projet, confirmation),
  espace: (projet) => ipcRenderer.invoke("espace", projet),
  terminauxOuverts: () => ipcRenderer.invoke("terminauxOuverts"),
  machines: (projet) => ipcRenderer.invoke("machines", projet),
  shell: (projet, machine) => ipcRenderer.invoke("shell", projet, machine),
  fermerShell: (id) => ipcRenderer.invoke("fermerShell", id),
  demander: (projet, ticket) => ipcRenderer.invoke("demander", projet, ticket),
  demanderAlerte: (projet, sujet, dit) => ipcRenderer.invoke("demanderAlerte", projet, sujet, dit),
  lireQuestion: (projet, ticket) => ipcRenderer.invoke("lireQuestion", projet, ticket),
  situation: (carte) => ipcRenderer.invoke("situation", carte),
  gestesDeFiche: (carte) => ipcRenderer.invoke("gestesDeFiche", carte),
  gesteDeFiche: (projet, id, ticket, valeur) => ipcRenderer.invoke("gesteDeFiche", projet, id, ticket, valeur),
  lireHistoire: (projet, ticket) => ipcRenderer.invoke("lireHistoire", projet, ticket),
  lireAutonomie: (projets, jours) => ipcRenderer.invoke("lireAutonomie", projets, jours),
  ouvrirTicketDAutonomie: (url) => ipcRenderer.invoke("ouvrirTicketDAutonomie", url),
  lireDiscussion: (projet, ticket) => ipcRenderer.invoke("lireDiscussion", projet, ticket),
  commenter: (projet, ticket, texte) => ipcRenderer.invoke("commenter", projet, ticket, texte),
  demanderAuSecond: (projet, ticket, contexte) => ipcRenderer.invoke("demanderAuSecond", projet, ticket, contexte),
  passerAuSecond: (projet, ticket, question) => ipcRenderer.invoke("passerAuSecond", projet, ticket, question),
  ouvrirLien: (projet, ticket, url) => ipcRenderer.invoke("ouvrirLien", projet, ticket, url),
  lireTitre: (projet, ticket) => ipcRenderer.invoke("lireTitre", projet, ticket),
  lireCapture: (projet, ticket, ecran, moment) => ipcRenderer.invoke("lireCapture", projet, ticket, ecran, moment),
  leverRetenue: (projet, ticket, geste) => ipcRenderer.invoke("leverRetenue", projet, ticket, geste),
  lireFeu: (projet) => ipcRenderer.invoke("lireFeu", projet),
  relireBox: (demande) => ipcRenderer.send("relireBox", demande),
  repondreQuestion: (projet, ticket, reponse) => ipcRenderer.invoke("repondreQuestion", projet, ticket, reponse),
  geste: (projet, id, oui) => ipcRenderer.invoke("geste", projet, id, oui),
  confirmer: (projet, id) => ipcRenderer.invoke("confirmer", projet, id),
  // Essayer une livraison (essai.ts, #3215) : l'état des essais d'un projet, « try it », « stop » ; `surEssais` dit qu'il a changé.
  essais: (projet) => ipcRenderer.invoke("essais", projet),
  essayer: (projet, ticket) => ipcRenderer.invoke("essayer", projet, ticket),
  arreterEssai: (projet, ticket) => ipcRenderer.invoke("arreterEssai", projet, ticket),
  refus: (projet, id, ticket) => ipcRenderer.invoke("refus", projet, id, ticket),
  attente: (projet, id, ticket, saisie) => ipcRenderer.invoke("attente", projet, id, ticket, saisie),
  ecrireMiseAJour: (clone) => ipcRenderer.invoke("mettreAJour", clone),
  passer: () => ipcRenderer.invoke("passer"),
  // La mise à jour de l'app installée (mise-a-jour/etat.ts) : `miseAJour` rend son état
  // (`EtatDeMiseAJour` : inactive, verification, a-jour, disponible, telechargement, prete,
  // installation, erreur), `verifierMiseAJour` relit le flux des versions publiées et rend l'état
  // qui en sort, `installerMiseAJour` installe la nouvelle version et relance l'app — rien n'est
  // rendu, elle se ferme — ou rend `{ refus }`. Chaque changement d'état arrive par `surMiseAJour`.
  miseAJour: () => ipcRenderer.invoke("miseAJour"),
  verifierMiseAJour: () => ipcRenderer.invoke("verifierMiseAJour"),
  installerMiseAJour: () => ipcRenderer.invoke("installerMiseAJour"),
  // La ligne d'une version plus haute (tickets 1528 et 2431, mise-a-jour/avis.ts) : le dernier avis — la dernière version,
  // celle qui tourne, le lien direct du paquet de ce poste, le premier lancement — ou rien ; chaque vérification suivante
  // par `surAvisDeVersion`. `telechargerVersion` ouvre ce lien dans le navigateur. Rien ne l'écarte.
  avisDeVersion: () => ipcRenderer.invoke("avisDeVersion"),
  surAvisDeVersion: (recevoir) => void ipcRenderer.on("avisDeVersion", (_, avis) => recevoir(avis)),
  telechargerVersion: (url) => ipcRenderer.invoke("telechargerVersion", url),
  appairer: (code) => ipcRenderer.invoke("appairer", code),
  depotsDuChef: () => ipcRenderer.invoke("depotsDuChef"),
  lireUnDepot: (depot) => ipcRenderer.invoke("lireUnDepot", depot),
  // Le dépôt choisi dans « Add a project » est-il prêt pour brigade, puis sa préparation (#2627) : le constat
  // `{ ready, missingBindings, missingLabels }`, ou un rejet dont le message est la phrase du refus.
  checkRepoSetup: (repo) => ipcRenderer.invoke("checkRepoSetup", repo).then(constatOuRejet),
  runRepoSetup: (repo) => ipcRenderer.invoke("runRepoSetup", repo).then(constatOuRejet),
  ajouterAUneStation: (saisie) => ipcRenderer.invoke("ajouterAUneStation", saisie),
  confierAUneStation: (saisie) => ipcRenderer.invoke("confierAUneStation", saisie),
  defautsDeStation: (nom) => ipcRenderer.invoke("defautsDeStation", nom),
  dossiersDeLaStation: (nom) => ipcRenderer.invoke("dossiersDeLaStation", nom),
  lireReglagesDeLaStation: () => ipcRenderer.invoke("reglagesDeLaStation:lire"),
  ecrireReglagesDeLaStation: (changement) => ipcRenderer.invoke("reglagesDeLaStation:ecrire", changement),
  retirerDUneStation: (nom) => ipcRenderer.invoke("retirerDUneStation", nom),
  continuerSansBacASable: (nom) => ipcRenderer.invoke("continuerSansBacASable", nom),
  leverLeRefus: (nom, refus, remede) => ipcRenderer.invoke("leverLeRefus", nom, refus, remede),
  choisirUneIssue: (nom, choix, issue) => ipcRenderer.invoke("choisirUneIssue", nom, choix, issue),
  signaler: (demande) => ipcRenderer.invoke("signaler", demande),
  demenagerLaCuisine: (nom, vers) => ipcRenderer.invoke("demenagerLaCuisine", nom, vers),
  autoriserSurGitHub: (url) => ipcRenderer.invoke("autoriserSurGitHub", url),
  panne: (id, cle) => ipcRenderer.invoke("panne", id, cle),
  reglagesDuProjet: (projet) => ipcRenderer.invoke("reglagesDuProjet", projet),
  proposerUnReglage: (projet, choix) => ipcRenderer.invoke("proposerUnReglage", projet, choix),
  // Les humains du projet, sous Settings (ticket 2930) : lus, et chaque changement écrit par une PR (humains-du-projet.ts).
  listerLesHumains: (projet) => ipcRenderer.invoke("listerLesHumains", projet),
  enregistrerUnHumain: (projet, humain) => ipcRenderer.invoke("enregistrerUnHumain", projet, humain),
  retirerUnHumain: (projet, login) => ipcRenderer.invoke("retirerUnHumain", projet, login),
  // Les stations contributrices du projet, sous Settings (ticket 2936) : lues, refusées ou réacceptées (stations-contributrices.ts).
  listerLesStationsContributrices: (projet) => ipcRenderer.invoke("listerLesStationsContributrices", projet),
  refuserUneStationContributrice: (projet, station) => ipcRenderer.invoke("refuserUneStationContributrice", projet, station),
  accepterUneStationContributrice: (projet, station) => ipcRenderer.invoke("accepterUneStationContributrice", projet, station),
  // Les plafonds de durée du projet, sur Kitchen > Health (ticket 2490) : lus et écrits dans son dépôt, sur GitHub.
  plafondsDuree: (projet) => ipcRenderer.invoke("plafondsDuree", projet),
  changerPlafondDuree: (projet, cle, saisie) => ipcRenderer.invoke("changerPlafondDuree", projet, cle, saisie),
  // Le closer du projet, sur Kitchen > Health (ticket 2491) : ses passes, ses vérifications en plus et ses réglages, sur GitHub.
  closerDeSante: (projet) => ipcRenderer.invoke("closerDeSante", projet),
  changerReglageDuCloser: (projet, cle, saisie) => ipcRenderer.invoke("changerReglageDuCloser", projet, cle, saisie),
  changerVerificationDuCloser: (projet, geste, saisie) => ipcRenderer.invoke("changerVerificationDuCloser", projet, geste, saisie),
  ouvrirLaProposition: (url) => ipcRenderer.invoke("ouvrirLaProposition", url),
  retirerLaStation: (id) => ipcRenderer.invoke("retirerLaStation", id),
  // Les GitHub Apps de la station de cet ordinateur (ticket 2317) : ce qu'elle en a, et en ranger une — jamais la clé en retour.
  appsDeLaStation: () => ipcRenderer.invoke("appsDeLaStation"),
  rangerUneApp: (role, id, cle) => ipcRenderer.invoke("rangerUneApp", role, id, cle),
  // Les projets que la station de cet ordinateur sert (ticket 2359) : sa liste, et un projet ajouté ou retiré.
  projetsServis: () => ipcRenderer.invoke("projetsServis"),
  servirUnProjet: (depot, servi) => ipcRenderer.invoke("servirUnProjet", depot, servi),
  // Le premier lancement, sur un ordinateur neuf (ticket 1434) : les stations du chef et leurs projets, lus par le
  // runtime ; un projet ouvert d'un clic — chaque étape de sa copie arrive par `surOuverture` — ; la connexion à
  // GitHub, dont la fin arrive par `surConnexionGitHub` ; une page qu'un échec a nommée.
  stationsDuChef: () => ipcRenderer.invoke("stationsDuChef"),
  ouvrirDUneStation: (nom, depot, base) => ipcRenderer.invoke("ouvrirDUneStation", nom, depot, base),
  seConnecterAGitHub: () => ipcRenderer.invoke("seConnecterAGitHub"),
  // Installe la station de cet ordinateur, depuis le bloc de l'accueil (ticket 2640).
  installerLaStation: () => ipcRenderer.invoke("installerLaStation"),
  // Le compte GitHub de cet ordinateur, que dit l'étape du compte du parcours d'ajout (ticket 2475).
  compteGitHub: () => ipcRenderer.invoke("compteGitHub"),
  ouvrirLaPage: (url) => ipcRenderer.invoke("ouvrirLaPage", url),
  // Le projet d'essai du premier lancement (ticket 3227) : ce qui en est noté et son service, le créer, le supprimer, et
  // la permission de suppression que `gh` fait accorder — sa fin arrive par `surPermissionDeSuppression`.
  projetDEssai: () => ipcRenderer.invoke("projetDEssai"),
  creerLeProjetDEssai: () => ipcRenderer.invoke("creerLeProjetDEssai"),
  supprimerLeProjetDEssai: (depot) => ipcRenderer.invoke("supprimerLeProjetDEssai", depot),
  demanderLaPermissionDeSuppression: () => ipcRenderer.invoke("demanderLaPermissionDeSuppression"),
  // Les stations enregistrées sous le compte GitHub du chef (ticket 1706), et les projets que chacune sert, écrits dans
  // son gist.
  stationsDuCompte: () => ipcRenderer.invoke("stationsDuCompte"),
  choisirLesProjets: (id, depots) => ipcRenderer.invoke("choisirLesProjets", id, depots),
  // Le rail d'un projet sans box ni station ici, tel que sa station le publie sur GitHub (ticket 1435).
  railDuProjet: (nom) => ipcRenderer.invoke("railDuProjet", nom),
  compter: (projet) => ipcRenderer.invoke("compter", projet),
  repondreCarte: (projet, ticket, reponse) => ipcRenderer.invoke("repondreCarte", projet, ticket, reponse),
  gesteDeValidation: (projet, ticket, geste) => ipcRenderer.invoke("gesteDeValidation", projet, ticket, geste),
  gesteSensible: (projet, ticket, geste) => ipcRenderer.invoke("gesteSensible", projet, ticket, geste),
  reprendreLeDisjoncteur: (projet) => ipcRenderer.invoke("reprendreLeDisjoncteur", projet),
  ouvrirBilan: (projet, url) => ipcRenderer.invoke("ouvrirBilan", projet, url),
  ouvrirLectureSeule: (projet, page) => ipcRenderer.invoke("ouvrirLectureSeule", projet, page),
  regarder: (projet, demande) => ipcRenderer.send("regarder", projet, demande),
  tous: (demande) => ipcRenderer.send("tous", demande),
  onglet: (projet, id, demande) => ipcRenderer.send("onglet", projet, id, demande),
  faits: (demande) => ipcRenderer.send("faits", demande),
  ouvrirIssue: (projet, ticket) => ipcRenderer.invoke("ouvrirIssue", projet, ticket),
  ouvrirPr: (projet, ticket) => ipcRenderer.invoke("ouvrirPr", projet, ticket),
  ouvrirPrDuCook: (projet, ticket) => ipcRenderer.invoke("ouvrirPrDuCook", projet, ticket),
  ecrire: (id, donnees) => ipcRenderer.send("ecrire", id, donnees),
  propositionsDuSecond: () => ipcRenderer.invoke("propositionsDuSecond"),
  repondreAuSecond: (projet, reponse) => ipcRenderer.invoke("repondreAuSecond", projet, reponse),
  surProposition: (recevoir) => void ipcRenderer.on("proposition", (_, projet, proposition) => recevoir(projet, proposition)),
  redimensionner: (id, colonnes, lignes) => ipcRenderer.send("redimensionner", id, colonnes, lignes),
  surSortie: (recevoir) => void ipcRenderer.on("sortie", (_, id, donnees) => recevoir(id, donnees)),
  surEtat: (recevoir) => void ipcRenderer.on("etat", (_, terminal) => recevoir(terminal)),
  surActivites: (recevoir) => void ipcRenderer.on("activites", (_, publiees) => recevoir(publiees)),
  surContenu: (recevoir) => void ipcRenderer.on("contenu", (_, lecture, manager) => recevoir(lecture, manager)),
  surEssais: (recevoir) => void ipcRenderer.on("essais", (_, projet) => recevoir(projet)),
  surFaits: (recevoir) => void ipcRenderer.on("faits", (_, recue) => recevoir(recue)),
  surGuide: (recevoir) => void ipcRenderer.on("guide", (_, guide) => recevoir(guide)),
  surAlertes: (recevoir) => void ipcRenderer.on("alertes", (_, bande) => recevoir(bande)),
  surUrgence: (recevoir) => void ipcRenderer.on("urgence", (_, projet) => recevoir(projet)),
  // Une question cliquée dans le menu de la barre des menus (barre-de-menus.ts) : sa carte s'ouvre.
  surOuvrirCarte: (recevoir) => void ipcRenderer.on("ouvrirCarte", (_, projet, ticket) => recevoir(projet, ticket)),
  surAmont: (recevoir) => void ipcRenderer.on("amont", (_, vu) => recevoir(vu)),
  surCode: (recevoir) => void ipcRenderer.on("code", (_, vu) => recevoir(vu)),
  surMiseAJour: (recevoir) => void ipcRenderer.on("miseAJour", (_, etat) => recevoir(etat)),
  surStations: (recevoir) => void ipcRenderer.on("stations", (_, vu) => recevoir(vu)),
  surProjetsDesStations: (recevoir) => void ipcRenderer.on("projetsDesStations", (_, vu) => recevoir(vu)),
  surAccueil: (recevoir) => void ipcRenderer.on("accueil", (_, vu) => recevoir(vu)),
  surOuverture: (recevoir) => void ipcRenderer.on("ouverture", (_, depot, etape) => recevoir(depot, etape)),
  surConnexionGitHub: (recevoir) => void ipcRenderer.on("connexionGitHub", (_, fin) => recevoir(fin)),
  surPermissionDeSuppression: (recevoir) => void ipcRenderer.on("permissionDeSuppression", (_, fin) => recevoir(fin)),
  surConfiguration: (recevoir) => void ipcRenderer.on("configuration", (_, configuration, fermes) => recevoir(configuration, fermes)),
};
contextBridge.exposeInMainWorld("brigade", pont);
