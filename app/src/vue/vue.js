// @ts-check
// La vue : elle montre, elle ne tient rien. Les pty vivent dans le process
// principal ; ici, un xterm par terminal, gardé tant que l'app est ouverte —
// changer d'espace ou d'onglet ne fait que cacher l'un et montrer l'autre.
// Au centre de l'espace, le rail : c'est la vue centrale, en six colonnes. Chaque carte y
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
// faits, et que le process principal a déjà mis en forme (faits.ts) : la vue
// pose un mot, un nombre, une couleur nommée, elle n'en calcule aucun. Sur ce qui se lit, les
// gestes du chef, chacun collé à l'état qu'il change, sous l'une de trois formes :
//   - direct : sa commande part dans le second au clic, s'il est libre, et sa sortie s'y lit ;
//   - confirmé : le clic ouvre, sous le bouton, une confirmation qui dit son prix — ce qu'il
//     interrompt, les cooks en vol et leurs tokens —, et rien ne part avant le « oui » du chef
//     (confirmation.ts) ; « non » la referme, sans rien faire partir ;
//   - avec jugement : une demande en prose s'écrit dans le second, et rien ne l'envoie — c'est
//     l'Entrée du chef qui la fait partir, jamais un clic.
// Ce qui part, et ce qu'une confirmation dit, se décident dans le process principal (gestes.ts,
// confirmation.ts, demande.ts) : la vue nomme un geste, jamais une commande. Reste un bouton, sur la
// partie closer, qui écrit dans le second le réglage du closer sans l'envoyer (boutons.ts). La vue n'y lit rien —
// elle ne sait pas ce qu'est un ticket. Ce qui attend le chef lui arrive déjà
// mis à part (attend.ts) : elle le pose en tête, quel que soit l'onglet.
// Settings (tickets 1700, 2494) ne tient que les réglages du projet, dans un seul groupe, une
// ligne par réglage : son nom, sa valeur en vigueur, un seul contrôle.
// La barre est faite d'icônes : « Tous les projets » en tête — l'accueil, la vue d'ensemble de
// brigade : une ligne par projet, une par station, et la ligne de santé, dites par le process
// principal (accueil.ts) ; on n'y agit pas, un clic sur une ligne ouvre sa page, et « Cost » celle
// des coûts de tous les projets (ticket 1022) —, le nom de chaque projet, et
// en pied le « + » : l'écran d'ajout, où un projet s'installe sur sa box et se déclare
// dans l'app d'un seul geste. Ce qui manque à un champ, ce qui part vers la box et ce
// qu'elle en a rendu se décident dans le process principal (installation.ts) : la vue
// recueille, signale le champ qu'on lui nomme, et pose ce qu'on lui rend.
// L'installation guidée et la vérification de l'installation ne sont plus dans la vue (ticket 1700) : l'app n'a besoin
// que d'une connexion GitHub. Le retrait du projet est une ligne de Settings, dans le groupe du projet : le retirer de l'app, qui
// n'envoie rien à sa station, après un « yes » — ce qui se refuse et ce qui s'en dit se décident dans retrait.ts.
// La page d'un worktree servi n'est plus nulle part dans l'app (ticket 1846) : le chef suit ce que fait le cook, sur la
// fiche de son ticket (activite-du-cook.js), et sa PR, et essaie l'app construite une fois mergée.
// En tête de l'espace, la bande d'alertes : est-ce que ça peut tourner ? La cuisine —
// une alerte par chose à faire, et
// une ligne « non vérifié » pour chaque état que la box ne dit pas. Vide, elle ne prend aucune
// place. Ce qui s'y dit et ce que son bouton appelle se décident dans alertes.ts : la vue pose.
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
// La peau, enfin : la vue n'écrit ni couleur ni police — elles sont dans jetons.css, et le terminal
// y lit les siennes. Elle dit seulement ce qu'un texte est : ce qui se recopie tel quel (`exact`),
// ce que l'app dit elle-même (`propos`), et — tout le reste d'un `pre` — ce que la box a rendu,
// posé mot pour mot.
import { FitAddon } from "@xterm/addon-fit";
import { Terminal as Xterm } from "@xterm/xterm";
// Les briques communes (briques.js) : une même chose se dit partout de la même façon — le prix
// d'un geste dans son survol, une lecture qui manque en une ligne, une confirmation qui dit son prix.
import { tenirBandeau } from "./mise-a-jour/bandeau.js";
import { poserConnecte, poserLaListeGitHub, tenirConnexionGitHub } from "./connexion-github.js";
import { poserLesIdentites, tenirLesIdentites } from "./identites-github.js";
import { poserLesProjetsServis, tenirLesProjetsServis } from "./projets-servis/projets-servis.js";
import { poserEtapeProjet } from "./parcours-projet/etape-projet.js";
import { boutonAction, caseACocher, prixDit, survol } from "./briques.js";
import { confirmationDeGeste } from "./composants/confirmation/confirmation.js";
import { ligneErreur } from "./composants/ligne-erreur/ligne-erreur.js";
import { poserLesGestesDAttente, relanceProposee } from "./attente/attente.js";
import { rangeeDeReglage as rangeeDeLaFamille } from "./composants/reglage/reglage.js";
import { bouton as boutonDeLaFamille, sorteDuBouton } from "./composants/bouton/bouton.js";
import { bon as bonDeLaFamille, teteDuBon } from "./composants/bon/bon.js";
import { poele } from "./composants/poele/poele.js";
import { carteAttente, carteDeReponse } from "./composants/carte-attente/carte-attente.js";
import { etatDuTon, formeDe, marque as marqueDePastille, pastille as pastilleDEtat } from "./composants/pastille/pastille.js";
import { poserChers } from "./cost/chers.js";
import { poserCourbe } from "./cost/courbe.js";
import { poserPerdus } from "./cost/perdus.js";
import { poserTete } from "./cost/tete.js";
import { tenirLesChiffresDAutonomie } from "./autonomie/chiffres.js";
import { capaciteDuBesoin, choixDeCapacites, revenir, SEULE, stationAOuvrir } from "./stations-declarees.js";
import { DIT_PROVISOIRE, PROVISOIRE } from "./apprentissage.js";
import { ACCUEIL as RATIOS_DE_L_ACCUEIL, poserTendances, TITRE as TITRE_DES_RATIOS } from "./closer/tendance/tendance.js";
import { absenceALAperture, poserAbsence } from "./absence/absence.js";
import { ACCUEIL as RESUMES_DE_L_ACCUEIL, tenirLesResumesHebdomadaires, TITRE as TITRE_DES_RESUMES } from "./resume-hebdomadaire/resume-hebdomadaire.js";
import { garderLeClavier } from "./garder-le-clavier.js";
import { AILLEURS, poserLaCarte as poserLaCarteDuChef, poserLaCarteAPart, poserLaListe as poserLaListeDesCartes, poserLEnvoi } from "./cartes-du-chef/cartes-du-chef.js";
import { affichageNeuf, changerD, poserDetailDeValidation } from "./validation-design/detail-de-validation.js";
import { apresRendu as apresLaValidation, CONFIRMATION_MS as CONFIRMATION_VALIDATION_MS, estUneValidation, poserCarteDeValidation, REPOS as VALIDATION_AU_REPOS, sansLesValidees } from "./validation-design/validation-design.js";
import { ligneDuRailBloque } from "./rail-bloque/ligne-du-rail-bloque.js";
import { apresRendu as apresLaRevue, CONFIRMATION_MS as CONFIRMATION_REVUE_MS, estUneRevue, marquerSensible, poserCarteSensible, REPOS as REVUE_AU_REPOS, SANS_PONT as REVUE_SANS_PONT } from "./carte-sensible/carte-sensible.js";
import { apresRendu as apresLaCarte, CHAMP_DE_CARTE, detailsDeCarte, poserCarteDeTodo, REPOS as CARTE_AU_REPOS, vuDeLaCarte } from "./carte-todo.js";
import { rangeeDuSecond } from "./todo-carte/demander-au-second.js";
import { apresLaLecture as apresLaLectureDuDepot, INCONNU as DEPOT_INCONNU, phraseDuRefus, poserAvisDeDepot } from "./page-projet/depot-non-prepare.js";
import { poserAvisDuTodo } from "./todo/avis-todo.js";
import { poserLesAutres } from "./todo/autres.js";
import { apresRendu as apresLaReprise, poserLigneDuDisjoncteur, poserReprise, REPOS as REPRISE_AU_REPOS } from "./todo-breaker-line.js";
import { poserDepotRetenu } from "./onboarding/depot-retenu.js";
import { poserBlocages } from "./projet/blocages.js";
import { lignesDeRefus } from "./projet/rail/refus-de-station.js";
import { poserDelai } from "./projet/delai.js";
import { poserLOffre, premierProjetServi, tenirLOffre } from "./offre-telephone/offre-telephone.js";
import { poserBandeRail } from "./projet/rail/bande-rail.js";
import { poserChoix, sansLesChoix } from "./projet/choix.js";
import { poserLesReglages } from "./projet/reglages.js";
import { monterLesHumains, serviceDuPont } from "./settings-humans/humains.js";
import { monterLesRecurrents, serviceDesRecurrents } from "./recurrents/recurrents.js";
import { monterLesStations, serviceDuPont as serviceDesStations } from "./reglages-stations/stations.js";
import { niveauDe, NIVEAUX_DITS } from "./niveaux.js";
import { poserPageDeStation as poserLaCoqueDeStation } from "./station/page/StationPage.js";
import { ligneDAlerte, plafondLu } from "./stations-de-cuisson.js";
import { deplacementSuivi, estUnOrdinateur, hautDe, nomDePrise, servantesDe, UNE_MINUTE_MS } from "./stations-tab/etat.js";
import { choixDuDeplacement } from "./stations-tab/choix.js";
import { cleDe, OU_DEPLACER, poserLOngletDesStations, QUI_CUIT as QUI_CUIT_ONGLET, QUI_D_AUTRE } from "./stations-tab/stations-tab.js";
import { poserLesAppels } from "./appels-de-la-station.js";
import { cookDuTicket, poserLActiviteDuCook } from "./activite-du-cook.js";
import { poserAge, poserEssais } from "./cadence.js";
import { poserEtiquettes } from "./etiquettes-de-bon.js";
import { poserLEssai } from "./essai/essai.js";
import { ligneDuRefus, rangeeDuRefus } from "./refus/refus.js";
import { apresLaDecision, phrase, poserParcours as parcoursDOnboarding } from "./onboarding/parcours.js";
import { lireLeProjet, poserPremierLancement } from "./premier-lancement.js";
import { poserLeProjetDEssai, tenirLeProjetDEssai } from "./essai/projet-d-essai.js";
import { tenirLeCompte } from "./parcours-projet/compte.js";
import { DEPOT_DE_LA_VISITE, PROJET_DE_LA_VISITE, REJOUER, etapesDeLaVisite, marqueurDeCible, poserVisite, tenirLaVisite, trouverLaCible } from "./visite/visite.js";
import { CLONE_DANS, poserLEcranDAjout } from "./parcours-projet/ajout.js";
import { AU_RETOUR, cetOrdinateurDAbord, nomDite, proposeeDOffice, RAMENER, uneMachine } from "./choix-station/choix-station.js";
import { poserLeDepart, tenirLesDeparts } from "./parcours-premier-projet/depart.js";
import { ajouterLaStation, carteDeSetup, choixDeStation, ICI, poserParcoursPremierProjet, progression, tenirLesParcours, travailDuSecond, vuDuParcours } from "./parcours-premier-projet/parcours-premier-projet.js";
import { poserLaDemandeDeStation, tenirLesDemandesDeStation } from "./installation-projet/installation-projet.js";
import { poserPremierTicket, tenirLesPremiersTickets } from "./premier-ticket/premier-ticket.js";
import { poserRecitDuPremierTicket, tenirLeRecitDuPremierTicket } from "./recit-premier-ticket/recit-premier-ticket.js";
import { depotCollePar, PAS_UN_DEPOT } from "./parcours-projet/etape-projet.js";
import { boutonDAjout, etatDeLaLigne, lignesDeProjets } from "./accueil/projets/projets.js";
import { ajoutsDuProjet as ajoutsDesEnregistrees, detailsDe, etatDit, issueDeLAjout, lectureDuCompte, ligneDeLEnregistree, ligneFondue, projetsDe as casesDeLEnregistree, tonDe, uneLigneParMachine } from "./stations-du-compte.js";
import { poserRailPublie } from "./rail-publie.js";
import { direLaLecture, poserLaLecture } from "./rail-lecture-perimee.js";
import { poserOutilsDuSecond } from "./outils-du-second.js";
import { poserChoixDuSecond, reponseTapee, tenirLesChoix } from "./second/choix.js";
import { AUCUNE_STATION } from "./cooks/sans-station.js";
import { attenteEpuisee, RAIL_NON_LU } from "./attente-du-rail.js";
import { MENU, STATIONS } from "./projet/menu/menu.js";
import { interrupteur as interrupteurDeLApp } from "./composants/interrupteur/interrupteur.js";
import { FAIT_DIT, stationsAProposer, tenirLAjoutDeStation } from "./projet/stations/AjoutStation.js";
import { arreter, gesteDArret, SANS_GESTE } from "./projet/stations/ArretStation.js";
import { ORDINAIRES_EN_COURS, reglagesDeLaStation, saisieDe } from "./projet/stations/ReglagesStation.js";
import { connexionALaStation, lignesDeLaStationLocale } from "./projet/stations/StationLocale.js";
import { monterLePanneau } from "./projet/panneau-second/panneau-second.js";
import { poserAjout, poserBlocDesProjets } from "./accueil/projets/BlocDesProjets.js";
import { poserBlocDeLaPromesse } from "./accueil/promesse/BlocDeLaPromesse.js";
import { tenirBlocDeLaStation } from "./accueil/station/BlocDeLaStation.js";
import { poserBlocPlafondsDuree } from "./projet/bandeau-sante/PlafondsDuree.js";
import { poserBlocCloser } from "./projet/bandeau-sante/Closer.js";
import { poserGesteDuSecond } from "./second/geste.js";
import { tenirLeSignalement } from "./signalement/geste.js";
import { casesDesVersions, caseDIci, poserVersionsDesStations, statutLu } from "./station-version/station-version.js";
import { ligneVide } from "./composants/ligne-vide/ligne-vide.js";
import { ligneLectureSeule } from "./lecture-seule/lecture-seule.js";
import { MOT_DE_LA_COLONNE, poserExplication, poserLaRangeeDesExplications, serviceDesExplications, tenirLesExplications } from "./explications/explications.js";
import { CET_ORDINATEUR, ANNULER, OUI, REESSAYER, AJOUTER_UN_PROJET, PAS_ENCORE, LECTURE_DE, NON_ATTEINT } from "./lexique.js";

// Le format des heures, comme src/format.ts : la vue est un module du navigateur, sans bundler,
// et ne peut pas importer du TypeScript — la locale est la même, anglaise.
const heureDe = (/** @type {number | string | Date} */ instant) => new Date(instant).toLocaleTimeString("en-US");
const dateHeure = (/** @type {number | string | Date} */ instant) => new Date(instant).toLocaleString("en-US");

/** @typedef {import("../terminaux.ts").Terminal} Terminal */
/** @typedef {import("../barre.ts").Affichee} Configuration */
/** @typedef {Configuration["projets"][number]} Projet */
/** @typedef {import("../attend.ts").Montree} Montree */
/** @typedef {import("../box.ts").Lecture} Lecture */
/** @typedef {import("../faits.ts").Dessinable} Dessinable */
/** @typedef {import("../alertes.ts").Alerte} Alerte */
// Ce que `onglets.ts` nomme : l'onglet Paramètres, qui n'a pas de commande à lui.
const PARAMETRES = "parametres";
// Et la lecture de la page des coûts de l'app (ticket 1022) : `station`, sur la box de chaque projet (onglets.ts, `COUTS`).
const COUTS = "couts";
// Et celle de la page des ratios de l'app (ticket 1682) : `closing --json`, sur la box de chaque projet (onglets.ts, `RATIOS`).
const RATIOS = "ratios";
// Et celle des résumés hebdomadaires (ticket 3263) : lue par le process principal, sans onglet.
const RESUMES = "resumes";
// Les onglets de la page d'un projet (ticket 1184), Rail et Stations.
const RAIL = "rail";
// Le menu du projet (ticket 2485, 2921) : Rail · Stations · Settings (projet/menu/menu.js).
// Sur un écran étroit — le téléphone (ticket 1186) —, trois colonnes ne tiennent pas : la conversation avec le second
// est un troisième onglet, à la place du panneau de droite.
const CONVERSATION = "second";
const CONVERSATION_ONGLET = { id: CONVERSATION, titre: "Second" };
const ECRAN_ETROIT = "(max-width: 720px)";
const ecranEtroit = window.matchMedia?.(ECRAN_ETROIT);
const etroit = () => ecranEtroit?.matches === true;
// Le panneau du second est à l'écran : ni écran étroit, ni téléphone, ni colonne cachée ou repliée (ticket 3008). Ce qu'il porte ne se montre que s'il l'est.
const panneauAFicher = () => !etroit() && telephoneVu === undefined && !colonneSecond.hidden && !colonneSecond.hasAttribute("data-replie");
// La fenêtre passe d'une largeur à l'autre — un téléphone qu'on tourne, une fenêtre qu'on rétrécit : la page se repose.
ecranEtroit?.addEventListener?.("change", () => {
  marquer();
  montrer();
});
// La colonne de ce qui attend le chef : sur un écran étroit, les colonnes de Rail s'empilent, et elle passe en tête (ticket 1163).
const COLONNE_QUI_T_ATTEND = "Awaiting you";
const SUR_LE_RAIL = "On the rail";
// Les colonnes où quelque chose attend le chef ou bouge : Awaiting you, Taken, Pass. Les autres — On the rail, Waiting, Served — se
// lisent en défilant, si elles sont hors de vue (ticket 1556).
const COLONNES_ACTIVES = new Set([COLONNE_QUI_T_ATTEND, "Taken", "Pass"]);
// Les projets dont la rangée des colonnes a déjà été placée à l'ouverture : ensuite, la lecture suivante garde le défilement du chef.
const rangeesPlacees = new Set();
// Le projet et l'onglet que le rail montrait à sa dernière pose : redessiné pour le même, il garde le défilement de la
// page — un clic sur une carte (« Give it to a station ») ne la ramène pas en haut (ticket 2133).
let railPoseDe = "";
// La dernière rangée posée de chaque projet : c'est d'elle que la lecture suivante reprend le défilement.
/** @type {Map<string, HTMLElement>} */
const rangees = new Map();
/** @typedef {import("../allumage.ts").Compte} Compte */
/** @typedef {import("../confirmation.ts").Confirmation} Confirmation */
/** @typedef {import("../service.ts").Guide} Guide */
/** @typedef {import("../retrait.ts").Retrait} Retrait */
/** @typedef {import("../retard.ts").Vu} VuDuCode */

const brigade = window.brigade;

// Le geste d'un projet, tel que la vue le nomme : par son nom d'étape entre guillemets, « status » —
// jamais par la commande qui le lance, qui ne s'affiche pas (le chef le joue par son bouton).
/** @param {Projet} _projet @param {string} commande */
const geste = (_projet, commande) => `the station's “${commande.split(" ").filter((m, i, tous) => !tous.slice(0, i + 1).some((t) => /^[-<]/.test(t))).join(" ")}” step`;
// Ce qui se lit d'un projet : une station le sert (`servi`) — ou cet ordinateur, quand c'est sa station
// qui fait tourner sa cuisine (`ici`, poste/cuisine-ici.ts).
// Tant que la station de cet ordinateur ne tourne pas (`sansStation`), rien n'en est lu : la page
// ne dit que cela, en une ligne (attendre).
/** @param {Projet} projet */
const seLit = (projet) => (projet.servi === true || projet.ici === true) && projet.sansStation !== true;
/** @param {string} nom */
const projetDe = (nom) => configuration.projets.find((projet) => projet.nom === nom);

/** @template {HTMLElement} T @param {string} id @returns {T} */
const element = (id) => /** @type {T} */ (document.getElementById(id));
const barre = element("projets");
const tous = element("tous");
const cartesDuChef = element("cartes-du-chef");
const principal = /** @type {HTMLElement} */ (document.querySelector("main"));
const bande = element("alertes");
const arret = element("arret");
const espace = element("espace");
const ongletsDuProjet = element("onglets-du-projet");
const contenu = element("contenu");
const centre = element("centre");
const rail = element("rail");
const fiche = element("fiche");
const detailDeValidation = element("detail-de-validation");
const luOnglet = element("lu-onglet");
const lectureOnglet = element("lecture-onglet");
const interrupteurProjet = element("interrupteur-projet");
const arreterCuisine = element("arreter-cuisine");
const sectionCuisine = element("reglages-cuisine");
const note = element("note");
const ongletsTerminaux = element("terminaux");
const fermerShell = element("fermer-shell");
const listeMachines = element("machines");
const colonneSecond = element("second");
const noteSecond = element("note-second");
const explicationSecond = element("explication-second");
const explicationsDuChef = element("explications-du-chef");
const outilsDuSecond = element("outils-du-second");
const choixDuSecond = element("choix-du-second");
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
// La visite guidée du premier lancement (ticket 3165, visite/) : sa bulle par-dessus l'écran, l'étape où elle en est, et
// la trace, dans le stockage de la vue, qu'elle a été montrée.
const sectionVisite = element("visite");
const visite = tenirLaVisite({ stockage: stockageDeLaVue(), rendre: () => poserLaVisite() });
const marquerLaCible = marqueurDeCible();
// L'écran « since you were away » (ticket 3305, absence/) : décidé une fois, à l'ouverture — la date de la dernière ouverture
// est alors réécrite —, et montré avant tout autre écran. Vaut la date de l'ancienne ouverture quand l'écran vient.
const absenceDepuis = absenceALAperture({ stockage: window.localStorage ?? undefined });
const sectionAbsence = element("absence");
/** @type {Map<string, import("./resume-hebdomadaire/resume-cuisine.ts").ResumesDuProjet>} */
const resumesDeLAbsence = new Map();
/** @type {Set<string>} */
const lecturesDeLAbsence = new Set();
let absenceFermee = false;
let absencePosee = "";
// Le projet que le premier lancement ajoute pour la visite : son espace s'ouvre sur elle dès qu'il est dans le fichier.
/** @type {string | undefined} */
let visiteAOuvrir;
// Ce que le second de chaque projet propose, tel que son canal le dit (ticket 1520) : ses choix, sous son terminal — ou
// le geste qu'il nomme (ticket 1521).
const propositionsDuSecond = tenirLesChoix();
// Ce que la page d'un projet montre tant qu'il n'est pas prêt (ticket 3166, parcours-premier-projet/) : à la place du rail,
// une question à la fois — qui le cuit, puis sa mise en place s'il le faut. Le parcours de chaque projet qu'« Add a
// project » a ouvert ; ceux qui attendent leur première lecture — elle seule dit si le compte GitHub peut écrire dans
// leur dépôt ; les lectures de leur mise en place en route ; et le dernier titre que `claude` a donné au terminal du
// second de chaque projet : au travail, ou au repos à son invite.
const sectionDuParcours = element("parcours-premier-projet");
const parcoursDesProjets = tenirLesParcours({ rendre: (nom) => void (courant?.nom === nom && poserLeProjetAPreparer()) });
// Le récit du premier ticket du premier projet du chef (ticket 3302, recit-premier-ticket/) : au-dessus du rail, une ligne à
// chaque vraie étape que les lectures du rail montrent, gardée dans le stockage de la vue jusqu'à ce que le chef la range.
const sectionDuRecit = element("recit-premier-ticket");
const recitDuPremierTicket = tenirLeRecitDuPremierTicket({ stockage: window.localStorage ?? undefined, rendre: () => poserLeRecitDuPremierTicket() });
// Le départ d'un projet qui arrive avec des issues ouvertes (ticket 3268, parcours-premier-projet/depart.js) : l'écran des
// propositions du second, avant les questions du parcours.
const departsDesProjets = tenirLesDeparts({ rendre: (nom) => void (courant?.nom === nom && poserLeProjetAPreparer()) });
// Le premier ticket d'un projet prêt (ticket 3306, premier-ticket/) : la question du second, son brouillon, le « oui » du chef.
const premiersTickets = tenirLesPremiersTickets({
  rendre: (nom) => void (courant?.nom === nom && poserLeProjetAPreparer()),
  rediger: (nom, demande) => brigade.redigerLePremierTicket(nom, demande),
  creer: (nom, brouillon) => brigade.creerLePremierTicket(nom, brouillon),
});
// Un projet dont la mise en place vient de passer, qu'aucune station ne sert (ticket 3400, installation-projet/) : sa page
// demande aussitôt laquelle le sert, cet ordinateur en tête. Rangée par « not now », la question ne revient pas.
const sectionDeLaDemande = element("installation-projet");
const demandesDeStation = tenirLesDemandesDeStation({ rendre: (nom) => void (courant?.nom === nom && poserLaDemandeDeStationIci()) });
/** @type {Map<string, string>} */
const aGuider = new Map();
/** @type {Set<string>} */
const preparationsEnLecture = new Set();
/** @type {Map<string, string>} */
const titresDesSeconds = new Map();
const fil = element("fil");
const bandeau = element("bandeau");
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
const etat = element("etat");
// Settings (ticket 1700, 2494) : un seul groupe, le projet. Ce qui était à cette machine n'y est plus : ses lignes sont
// toujours posées, dans un conteneur caché, jusqu'à ce que Stations les reprenne.
const groupeMachine = element("reglages-machine");
const videProjet = element("vide-project");
const retrait = element("retrait");
const couleurs = element("couleurs");
const sigle = element("sigle");
const barreDeMenus = element("barre-de-menus");
const ordinaires = element("ordinaires");
// Les GitHub Apps de la station de cet ordinateur, une ligne par rôle (ticket 2317, identites-github.js) : relues à
// l'ouverture de chaque projet ; un appareil sans station (le téléphone) n'en pose aucune.
const appsGithub = element("apps-github");
const identitesGithub = tenirLesIdentites({ pont: brigade, rendre: () => poserLesAppsGithub() });
function poserLesAppsGithub() {
  const etat = identitesGithub.etat;
  appsGithub.hidden = etat === undefined;
  appsGithub.replaceChildren(...(etat === undefined ? [] : [poserLesIdentites(document, etat, identitesGithub.gestes)]));
  poserLesGroupes();
}
// Les projets que la station de cet ordinateur sert (ticket 2359, projets-servis/), lus sans rien régler : une ligne par
// projet de l'app, et, la liste vide, la ligne qui dit que cet ordinateur n'en sert aucun. Ils se changent sur l'onglet
// Stations de chaque projet (ticket 3402). Relus à l'ouverture de chaque projet ; un appareil sans station (le téléphone)
// n'en pose aucun.
const projetsServis = element("projets-servis");
const servis = tenirLesProjetsServis({
  pont: brigade,
  rendre: () => {
    poserLesProjetsServisIci();
    // L'onglet Stations la lit aussi : la carte de cet ordinateur suit la liste (ticket 3402).
    reposerLOngletStations();
  },
});
function poserLesProjetsServisIci() {
  const etat = servis.etat;
  projetsServis.hidden = etat === undefined;
  projetsServis.replaceChildren(...(etat === undefined ? [] : [poserLesProjetsServis(document, { etat, projets: configuration.projets, ici: POSTE.nom })]));
  poserLesGroupes();
  poserLaDemandeDeStationIci();
}
// La station de cet ordinateur sert-elle le dépôt du projet, d'après sa liste ? Liste non lue, ou dépôt inconnu : on ne
// sait pas (`undefined`).
/** @param {Projet} projet @returns {boolean | undefined} */
function serviParCetOrdinateur(projet) {
  const depot = (projet.depot ?? projetsVus?.projets.find(({ nom }) => nom === projet.nom)?.depot ?? "").toLowerCase();
  const lecture = servis.etat?.lecture;
  if (depot === "" || lecture === undefined || !("depots" in lecture)) return undefined;
  return lecture.depots.some((servi) => servi.toLowerCase() === depot);
}
// « Add a station », dans l'onglet Stations (ticket 2487, projet/stations/AjoutStation.js) : cet ordinateur d'abord, par sa
// liste — puis elle se relit ; une station appairée, par le geste de sa page sur l'accueil. Le parcours change : l'onglet
// se repose, s'il est montré.
const ajoutDeStation = tenirLAjoutDeStation({
  servirIci: (depot) => servirIciLeDepot(depot),
  choisir: (id, depots) => choisirPourUneEnregistree(id, depots),
  rendre: () => reposerLOngletStations(),
});
// La station de cet ordinateur sert un dépôt : il entre dans sa liste — puis la liste se relit. « Add a station » le fait.
/** @param {string} depot @returns {Promise<import("./projets-servis/projets-servis.js").LectureDesProjetsServis>} */
async function servirIciLeDepot(depot) {
  const rendu = (await brigade.servirUnProjet?.(depot, true)) ?? { refus: NON_ATTEINT(`${CET_ORDINATEUR}'s station`) };
  void servis.lire();
  return rendu;
}
function reposerLOngletStations() {
  if (courant !== undefined && ongletDe(courant) === STATIONS) poserRail(courant);
}
const reglagesDuProjet = element("reglages-du-projet");
const reglagesEnPlus = element("reglages-du-projet-en-plus");
const avis = element("avis");
// Les stations que la box de chaque projet déclare, telles que le dernier contrôle de son installation les a lues
// (service.ts, `controle.stations`) : gardées d'un guide à l'autre, jusqu'à la lecture suivante.
/** @type {Map<string, import("../service.ts").StationsLues>} */
const declarees = new Map();
// « report to brigade », sous chaque panne que l'app montre (ticket 1977) : une issue préremplie, ouverte dans le navigateur.
// Sur le téléphone, rien ne l'ouvrirait : le bouton n'y est pas.
const signalement = tenirLeSignalement({ doc: document, pont: brigade, actif: () => telephoneVu === undefined });
const alerteDeCuisine = document.createElement("div");
alerteDeCuisine.id = "alerte-de-cuisine";
const ajout = element("ajout");
const relecture = element("relecture");
// Posé dans le conteneur caché de ce qui était sous cette machine : le code de l'app, et des clones de brigade — la case « T » le dit aussi, au survol.
const code = document.createElement("div");
code.id = "code";
code.ariaLive = "polite";
groupeMachine.append(code);
// L'accueil, « Tous les projets » : la vue d'ensemble de brigade (accueil.ts). Trois blocs (tickets 2638, 3195) : la liste
// des projets — une ligne chacun, un clic ouvre son espace —, la station de cet ordinateur, et toutes les stations.
const projetsDeLAccueil = document.createElement("section");
projetsDeLAccueil.id = "accueil-projets";
projetsDeLAccueil.className = "liste";
projetsDeLAccueil.ariaLabel = "Projects";
// Toutes les stations — une ligne par machine, un clic ouvre sa page —, et « + station » : elles valent pour le compte, pas
// pour un projet. Sous l'onglet Stations de chaque projet depuis le ticket 2638, elles reviennent sur l'accueil, un bloc à
// elles sous la station de cet ordinateur (ticket 3195) : l'onglet ne montre que les stations qui servent le projet.
const TOUTES_LES_STATIONS = "All stations";
const stationsDeLAccueil = document.createElement("section");
stationsDeLAccueil.id = "toutes-les-stations";
stationsDeLAccueil.className = "bloc-de-l-accueil";
stationsDeLAccueil.ariaLabel = TOUTES_LES_STATIONS;
stationsDeLAccueil.dataset.bloc = "toutes-les-stations";
// Ses lignes dans une carte, comme celles des projets au-dessus.
const listeDesStations = document.createElement("div");
listeDesStations.className = "liste";
listeDesStations.ariaLive = "polite";
// « + station », sous la liste : le champ du code s'ouvre dessous, et nulle part ailleurs. Il est posé
// une fois : une relecture ne vide pas ce que le chef tape.
const ouvrirLAppairage = /** @type {HTMLButtonElement} */ (bouton("+ station", undefined));
ouvrirLAppairage.className = "ajout-de-station";
const formulaireDAppairage = document.createElement("form");
formulaireDAppairage.hidden = true;
const codeTape = document.createElement("input");
codeTape.placeholder = "the code a new station shows, like 7KQ2-M9XD";
codeTape.ariaLabel = "pairing code";
codeTape.autocomplete = "off";
codeTape.spellcheck = false;
const appairage = boutonDeLaFamille(document, "pair", undefined, { sorte: "recommande", type: "submit" });
const renoncerAppairage = /** @type {HTMLButtonElement} */ (bouton(ANNULER, undefined, "discret"));
const appairageDit = document.createElement("p");
appairageDit.ariaLive = "polite";
formulaireDAppairage.append(codeTape, appairage, renoncerAppairage, appairageDit);
// Les stations enregistrées sous le compte GitHub du chef (ticket 1706, stations-du-compte.js) : dans la liste des
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
stationsDeLAccueil.append(bloc("h2", TOUTES_LES_STATIONS), listeDesStations, versionsDesStations, blocDesEnregistrees, ouvrirLAppairage, formulaireDAppairage);
/** @type {import("./stations-du-compte.js").EtatDuCompte} */
const etatDesEnregistrees = {};
let enregistreesAbsentes = true;
let lectureDesEnregistrees = 0;
let lectureDesDepotsEnregistrees = 0;
/** @type {import("./stations-du-compte.js").GestesDuCompte} */
const gestesDesEnregistrees = {
  ouvrirLaStation: (id) => ouvrirStation(id),
  // Une case décochée reste un projet du chef jusqu'à la fin de la session : sa case ne disparaît pas sous le clic.
  choisir: (id, depots) => {
    const lues = etatDesEnregistrees.stations;
    const avant = lues?.state === "listed" ? (lues.stations.find((station) => station.id === id)?.selection ?? []) : [];
    etatDesEnregistrees.ajoutes = [...new Set([...(etatDesEnregistrees.ajoutes ?? []), ...avant])];
    void choisirPourUneEnregistree(id, depots);
  },
  // Ce que le chef tape : retenu, que la page redessinée le lui rende ; ce qu'il trouve se pose à sa place.
  chercher: (id, texte) => void (etatDesEnregistrees.recherche = { id, texte }),
  // Un dépôt trouvé : il s'ajoute aux projets du chef, le champ se vide, et la sélection de la station s'écrit.
  ajouter: (id, depot, depots) => {
    etatDesEnregistrees.ajoutes = [...new Set([...(etatDesEnregistrees.ajoutes ?? []), depot])];
    delete etatDesEnregistrees.recherche;
    void choisirPourUneEnregistree(id, depots);
  },
  relire: () => {
    void lireLesEnregistrees();
    if (etatDesEnregistrees.depots !== undefined && "refus" in etatDesEnregistrees.depots) void lireLesDepotsDesEnregistrees();
  },
  seConnecter: () => void seConnecterAGitHub(),
  ouvrirLaPage: (url) => void brigade.ouvrirLaPage?.(url),
  copier: (commande) => {
    void navigator.clipboard?.writeText(commande)?.catch(() => {});
    etatDesEnregistrees.copiee = commande;
    poserStationsDeLAccueil();
  },
};
// La page d'une station, ouverte d'un clic sur sa ligne : son état, ses pannes et leur bouton, tous
// les projets qu'elle porte, et le parcours « add a project » — le dépôt, ses stations
// — le serveur proposé d'office —, ses décisions, et valider. Rien ne s'y tape au terminal.
const pageDeStation = document.createElement("section");
pageDeStation.id = "station";
pageDeStation.className = "carte";
const enTeteDeStation = document.createElement("header");
const pannesDeStation = document.createElement("div");
pannesDeStation.ariaLive = "polite";
const projetsChoisisDeStation = document.createElement("div");
projetsChoisisDeStation.ariaLive = "polite";
const titreDesProjets = bloc("h3", "Projects");
const listeDesProjets = document.createElement("div");
listeDesProjets.ariaLive = "polite";
const ouvrirLeParcours = /** @type {HTMLButtonElement} */ (bouton(`+ ${AJOUTER_UN_PROJET.toLowerCase()}`, undefined));
ouvrirLeParcours.className = "ajout-de-projet";
const formulaireDAjout = document.createElement("form");
formulaireDAjout.hidden = true;
const depotChoisi = /** @type {HTMLSelectElement} */ (document.createElement("select"));
depotChoisi.ariaLabel = "repository";
// Le choix du dépôt se fait à l'étape « projet » (ticket 2476) ; la liste ne garde que le dépôt retenu, que le formulaire envoie.
depotChoisi.hidden = true;
const etapeDuProjet = document.createElement("div");
const baseChoisie = document.createElement("input");
baseChoisie.ariaLabel = "integration branch";
baseChoisie.placeholder = "integration branch";
baseChoisie.spellcheck = false;
const choixDesStations = document.createElement("div");
const avertissementDesStations = document.createElement("p");
avertissementDesStations.ariaLive = "polite";
const cooksChoisis = document.createElement("input");
cooksChoisis.type = "number";
cooksChoisis.ariaLabel = "cooks at once";
cooksChoisis.placeholder = "cooks at once, on each station";
/** @type {Record<"manager-modele" | "manager-effort" | "reviewer-modele" | "reviewer-effort", HTMLSelectElement>} */
const calibrageDuProjet = {
  "manager-modele": /** @type {HTMLSelectElement} */ (document.createElement("select")),
  "manager-effort": /** @type {HTMLSelectElement} */ (document.createElement("select")),
  "reviewer-modele": /** @type {HTMLSelectElement} */ (document.createElement("select")),
  "reviewer-effort": /** @type {HTMLSelectElement} */ (document.createElement("select")),
};
for (const [champ, liste] of Object.entries(calibrageDuProjet)) liste.ariaLabel = champ.replace("-modele", " model").replace("-effort", " effort");
const validerAjout = /** @type {HTMLButtonElement} */ (boutonDeLaFamille(document, "add", undefined, { sorte: "recommande", type: "submit" }));
const annulerAjout = /** @type {HTMLButtonElement} */ (bouton(ANNULER, undefined, "discret"));
const ajoutRefuse = document.createElement("div");
ajoutRefuse.ariaLive = "polite";
const ajoutDit = document.createElement("p");
ajoutDit.ariaLive = "polite";
formulaireDAjout.append(
  etapeDuProjet,
  depotChoisi,
  baseChoisie,
  choixDesStations,
  avertissementDesStations,
  cooksChoisis,
  ...Object.values(calibrageDuProjet),
  validerAjout,
  annulerAjout,
  ajoutRefuse,
);
const retourALAccueil = /** @type {HTMLButtonElement} */ (bouton("‹ All projects", undefined, "discret"));
retourALAccueil.className = "retour";
// Le plafond de cooks, sous l'en-tête : ce que `status` en dit, et ce qui retient la station.
const plafondDeStation = document.createElement("div");
plafondDeStation.className = "plafond-de-station";
plafondDeStation.ariaLive = "polite";
// La ligne de mise à jour, sous l'en-tête ; et, au bas de la page, « remove the station » et sa confirmation.
const versionDeStation = document.createElement("p");
versionDeStation.className = "version-de-station";
const retraitDeStation = document.createElement("div");
retraitDeStation.className = "retrait-de-station";
// Ses sections, sous ses pannes (ticket 2641, épique 2497) : identité, connexions, dossiers et bac à sable, capacités,
// cooks — posées par la coque de station/page/StationPage.js.
const sectionsDeStation = document.createElement("div");
sectionsDeStation.className = "sections-de-station";
pageDeStation.append(retourALAccueil, enTeteDeStation, plafondDeStation, versionDeStation, pannesDeStation, sectionsDeStation, titreDesProjets, listeDesProjets, ouvrirLeParcours, formulaireDAjout, ajoutDit, retraitDeStation, projetsChoisisDeStation);
// Le coût de tous les projets (ticket 1022) : il vaut pour l'ensemble, il vit donc au niveau de l'app, pas dans
// un projet. Une ligne « Cost » l'ouvre, en bas du bandeau de santé de chaque projet (sur l'accueil jusqu'au ticket 2638). Sa page : les tokens
// lancés sur 5 h, 24 h et 7 jours par projet, les tokens perdus, les tickets les plus chers, la courbe, et
// le renvoi vers `/usage` (cost/). Un clic sur un projet l'ouvre ; sur un ticket, ouvre sa fiche dans son projet.
const coutsDeLAccueil = document.createElement("section");
coutsDeLAccueil.id = "couts-de-tous";
coutsDeLAccueil.ariaLabel = "Cost";
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
coutsDeLAccueil.append(ouvrirLesCouts);
const pageDesCouts = document.createElement("section");
pageDesCouts.id = "cout";
pageDesCouts.ariaLabel = "Cost of all projects";
const retourDesCouts = /** @type {HTMLButtonElement} */ (bouton("‹ All projects", undefined, "discret"));
retourDesCouts.className = "retour";
const corpsDesCouts = document.createElement("div");
corpsDesCouts.ariaLive = "polite";
pageDesCouts.append(retourDesCouts, corpsDesCouts);
// Le rapport ajouté / retiré de tous les projets (ticket 1682), de même : en bas du bandeau de santé, une ligne
// « Closer » ouvre sa page — un projet par ligne qui a un closer réglé, son rapport et sa tendance
// (closer/tendance/). Un clic sur un projet l'ouvre.
const ratiosDeLAccueil = document.createElement("section");
ratiosDeLAccueil.id = "ratios-de-tous";
ratiosDeLAccueil.ariaLabel = "Closer";
const ouvrirLesRatios = /** @type {HTMLButtonElement} */ (bloc("button", ""));
ouvrirLesRatios.type = "button";
ouvrirLesRatios.className = "ligne";
ouvrirLesRatios.ariaLabel = "the added / removed ratio of all projects";
{
  const suite = bloc("span", "›");
  suite.className = "ouvrir";
  suite.ariaHidden = "true";
  ouvrirLesRatios.append(bloc("strong", "Closer"), bloc("span", RATIOS_DE_L_ACCUEIL), suite);
}
ratiosDeLAccueil.append(ouvrirLesRatios);
// Les résumés hebdomadaires de la cuisine de chaque projet (ticket 3263), de même : une ligne « Weekly summary » ouvre leur
// page (resume-hebdomadaire/), lue et publiée par le process principal.
const resumesDeLAccueil = document.createElement("section");
resumesDeLAccueil.id = "resumes-de-tous";
resumesDeLAccueil.ariaLabel = TITRE_DES_RESUMES;
const ouvrirLesResumes = /** @type {HTMLButtonElement} */ (bloc("button", ""));
ouvrirLesResumes.type = "button";
ouvrirLesResumes.className = "ligne";
ouvrirLesResumes.ariaLabel = "the weekly summaries of all projects";
{
  const suite = bloc("span", "›");
  suite.className = "ouvrir";
  suite.ariaHidden = "true";
  ouvrirLesResumes.append(bloc("strong", TITRE_DES_RESUMES), bloc("span", RESUMES_DE_L_ACCUEIL), suite);
}
resumesDeLAccueil.append(ouvrirLesResumes);
// Les lignes de tous les projets, dans le bandeau de santé de chacun (ticket 2638) : elles valent pour l'ensemble.
const TOUS_LES_PROJETS = "All projects";
const deTousLesProjets = document.createElement("section");
deTousLesProjets.id = "de-tous-les-projets";
deTousLesProjets.className = "bloc-du-projet";
deTousLesProjets.ariaLabel = TOUS_LES_PROJETS;
deTousLesProjets.dataset.bloc = "de-tous-les-projets";
deTousLesProjets.append(bloc("h3", TOUS_LES_PROJETS), coutsDeLAccueil, ratiosDeLAccueil, resumesDeLAccueil);
// L'accueil a les projets et la station de cet ordinateur (ticket 2638, épique 2497) — chacun son composant, sous
// accueil/ —, puis toutes les stations (ticket 3195). La version de l'app et la ligne de santé l'ont quitté sans aller ailleurs : la ligne d'une
// version plus haute, en tête de l'app (mise-a-jour/bandeau.js), dit la version qui tourne et l'installe.
const blocDeLaPromesse = poserBlocDeLaPromesse(document);
const blocDesProjets = poserBlocDesProjets(document, projetsDeLAccueil);
// Les premiers réglages de la station qu'on vient d'installer : se connecter à GitHub (le geste que l'app a déjà), puis
// choisir les projets qu'elle sert, sur sa page.
const blocDeLaStation = tenirBlocDeLaStation(document, {
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
const pageDesRatios = document.createElement("section");
pageDesRatios.id = "ratios";
pageDesRatios.ariaLabel = TITRE_DES_RATIOS;
const retourDesRatios = /** @type {HTMLButtonElement} */ (bouton("‹ All projects", undefined, "discret"));
retourDesRatios.className = "retour";
const corpsDesRatios = document.createElement("div");
corpsDesRatios.ariaLive = "polite";
pageDesRatios.append(retourDesRatios, corpsDesRatios);
const pageDesResumes = document.createElement("section");
pageDesResumes.id = "resumes";
pageDesResumes.ariaLabel = TITRE_DES_RESUMES;
const retourDesResumes = /** @type {HTMLButtonElement} */ (bouton("‹ All projects", undefined, "discret"));
retourDesResumes.className = "retour";
const resumesDeTous = tenirLesResumesHebdomadaires(document, {
  lire: (nom) => brigade.lireLesResumesHebdomadaires(nom),
  changerJour: (nom, jour) => brigade.changerLeJourDuResume(nom, jour),
  publier: (nom, resume, tag) => brigade.publierLeResumeHebdomadaire(nom, resume.weekStart, tag),
  ouvrir: (url) => void brigade.ouvrirTicketDuResume(url),
  ouvrirProposition: (url) => void brigade.ouvrirLaProposition(url),
});
pageDesResumes.append(retourDesResumes, resumesDeTous.element);

// La cuisine d'un projet de l'app (ticket 983), en tête de son espace : les stations qui la font, en une
// ligne — chacune avec ce qu'elle en dit, un clic ouvre sa page —, et « + station » pour en ajouter
// une. Tant qu'aucune ne la fait, une phrase le dit, et « choose its machine » ouvre le choix
// parmi les stations appairées : c'est le seul geste qui installe un projet sur une station.
const stationsDuProjet = element("stations-du-projet");
// Ce qui bloque le projet affiché (ticket 1399), sous ses stations, tel que le suivi le publie : une ligne par
// blocage (projet/blocages.js). Les détails que le chef a dépliés, par projet et blocage : une relecture ne les replie pas.
const delaiDuProjet = element("delai-du-projet");
// L'offre du téléphone (ticket 3303, offre-telephone/) : sous le délai du premier projet du chef, une fois son premier
// ticket servi, si aucun téléphone n'est déjà connecté au compte GitHub ; acceptée, le lien de l'app Android ; déclinée
// ou suivie, gardée rangée dans le stockage de la vue.
const offreDuTelephone = element("offre-telephone");
const offre = tenirLOffre({
  stockage: stockageDeLaVue(),
  lire: async () => brigade.lienDeLApk?.(),
  connecte: async () => brigade.telephoneConnecte?.(),
  ouvrir: (lien) => void brigade.ouvrirLaPage?.(lien),
  rendre: () => poserLOffreDuTelephone(courant),
});
const bandeauSante = element("bandeau-sante");
const blocagesDuProjet = element("blocages-du-projet");
/** @type {Map<string, Set<string>>} */
const blocagesDeplies = new Map();
// Les projets dont le chef a déplié « Awaiting others » au pied de TODO (ticket 2985) : la lecture suivante la garde dépliée.
/** @type {Set<string>} */
const autresDeplies = new Set();
// Ce qui manque au projet pour ses tests (ticket 1400), au-dessus de ses blocages : une carte par besoin
// (projet/choix.js). Par projet : les choix dont l'issue part (`enCours`), celles qui sont écrites et que la station
// n'a pas encore relues (`retenus`), et pourquoi une issue n'a pas été retenue (`refus`).
const choixDuProjet = element("choix-du-projet");
/** @type {Map<string, { enCours: Set<string>, retenus: Set<string>, refus: Map<string, { refus: string, detail?: string }> }>} */
const choixRetenus = new Map();
const ligneDesStationsDuProjet = document.createElement("p");
ligneDesStationsDuProjet.ariaLive = "polite";
const ouvrirLaConfiance = /** @type {HTMLButtonElement} */ (bouton("", undefined));
ouvrirLaConfiance.className = "ajout-de-station";
// Le choix lui-même, une carte (ticket 1107). En tête, une phrase dit ce que le chef fait, et une autre
// ce que fait la machine qu'il choisit. Puis les machines, une à choisir, chacune avec ce qu'elle implique — cet
// ordinateur d'abord, une station en ligne proposée d'office (choix-station/, ticket 3187) —, et les cooks à la fois de
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
const depotDeConfiance = /** @type {HTMLSelectElement} */ (document.createElement("select"));
depotDeConfiance.ariaLabel = "repository";
const baseDeConfiance = document.createElement("input");
baseDeConfiance.ariaLabel = "integration branch";
baseDeConfiance.spellcheck = false;
const champDuDepot = champDeConfiance("Its GitHub repository", depotDeConfiance, undefined, niveauDe(document, "depot"));
const champDeLaBase = champDeConfiance("Its integration branch", baseDeConfiance, bloc("small", "The branch the kitchen delivers to."), niveauDe(document, "branche"));
const stationsChoisiesDeConfiance = document.createElement("fieldset");
const legendeDesStationsChoisies = document.createElement("legend");
const sensDesStationsChoisies = document.createElement("p");
sensDesStationsChoisies.className = "aide";
const choixDesStationsChoisies = document.createElement("div");
choixDesStationsChoisies.className = "machines";
stationsChoisiesDeConfiance.append(legendeDesStationsChoisies, sensDesStationsChoisies, choixDesStationsChoisies);
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
const capacitesDeConfiance = document.createElement("fieldset");
const legendeDesCapacites = document.createElement("legend");
const choixDesCapacites = document.createElement("div");
choixDesCapacites.className = "capacites";
capacitesDeConfiance.append(legendeDesCapacites, niveauDe(document, "capacites"), choixDesCapacites);
const confianceRefusee = document.createElement("div");
confianceRefusee.ariaLive = "polite";
const validerConfiance = /** @type {HTMLButtonElement} */ (boutonDeLaFamille(document, "", undefined, { sorte: "recommande", type: "submit" }));
const annulerConfiance = /** @type {HTMLButtonElement} */ (bouton(ANNULER, undefined, "discret"));
const gestesDeConfiance = document.createElement("div");
gestesDeConfiance.className = "lancer";
gestesDeConfiance.append(validerConfiance, annulerConfiance);
formulaireDeConfiance.append(titreDeConfiance, sensDeConfiance, champDuDepot, champDeLaBase, stationsChoisiesDeConfiance, champDesCooks, champDuDossier, capacitesDeConfiance, confianceRefusee, gestesDeConfiance);
const confianceDite = document.createElement("p");
confianceDite.ariaLive = "polite";
// Déménager sa cuisine (ticket 1095), d'un seul geste : « move the kitchen » ouvre, sous la ligne, le
// choix de la machine où l'emmener — cet ordinateur, sa box, une autre —, et ce que ça coûte, en une
// ligne. Un clic sur une machine la déménage, sans retrait ni rajout. Refusé, la raison se dit en une
// phrase sous la ligne, et la ligne ne change pas : il cuit toujours là où il cuisait.
const ouvrirLeDemenagement = /** @type {HTMLButtonElement} */ (bouton("move the kitchen", undefined));
ouvrirLeDemenagement.className = "ajout-de-station";
ouvrirLeDemenagement.dataset.geste = "demenager";
const choixDuDemenagement = document.createElement("section");
choixDuDemenagement.className = "demenagement";
choixDuDemenagement.ariaLabel = "Move the kitchen";
choixDuDemenagement.hidden = true;
const demenagementDit = document.createElement("p");
demenagementDit.className = "demenagement-dit";
demenagementDit.ariaLive = "polite";
// Une station du compte à qui le chef a choisi le projet alors qu'une autre le servait déjà, et qui ne peut pas en
// rejoindre la cuisine (ticket 1790) : sa phrase, sous la ligne — la ligne ne la compte pas parmi ses stations.
const stationRefusee = document.createElement("div");
stationRefusee.ariaLive = "polite";
stationRefusee.hidden = true;
// Le parcours d'un projet neuf (ticket 1111) : de sa station choisie à son premier ticket, en quatre
// étapes, telles que le suivi les publie — à la place du vide sous la ligne (onboarding/parcours.js).
const parcoursDuProjet = document.createElement("div");
parcoursDuProjet.className = "parcours-du-projet";
parcoursDuProjet.ariaLive = "polite";
// Ce qui retient la cuisine du projet (ticket 1119) : l'accès au dépôt refusé, avec son geste, ou un worktree
// impossible à préparer, avec sa raison et l'heure du prochain essai — à la place de « prepares it within a minute ».
const depotRetenu = document.createElement("div");
depotRetenu.hidden = true;
stationsDuProjet.append(ligneDesStationsDuProjet, ouvrirLeDemenagement, ouvrirLaConfiance, choixDuDemenagement, formulaireDeConfiance, demenagementDit, stationRefusee, depotRetenu, confianceDite, parcoursDuProjet);

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
    for (const [nom, id] of Object.entries(lus ?? {})) if (id === RAIL || id === STATIONS || id === CONVERSATION) ongletsRetenus.set(nom, id);
  } catch {
    // Illisible : chaque projet s'ouvre sur Rail, et le prochain choix le réécrit.
  }
  return ongletsRetenus;
}
// La conversation n'est un onglet que sur un écran étroit : retenue, elle s'ouvre sur Rail sur un écran large.
/** @param {Projet} projet */
const ongletDe = (projet) => {
  const retenu = retenus().get(projet.nom) ?? RAIL;
  return retenu === CONVERSATION && !etroit() ? RAIL : retenu;
};
/** @param {string} nom @param {string} id */
function retenir(nom, id) {
  retenus().set(nom, id);
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
let choixDeMachine;
// Les shells fermés : ce qu'ils écrivent encore en mourant n'a plus d'onglet.
/** @type {Set<number>} */
const fermes = new Set();
// Aucun : c'est « Tous les projets » qui est affiché — ou l'écran d'ajout.
/** @type {Projet | undefined} */
let courant;

// Les explications des mots de la cuisine (ticket 3308, explications/) : la première fois que le chef rencontre rail, pass,
// cook, second, TODO ou WAITING, une ligne l'explique à côté du mot. Ce qu'il en a vu est gardé par le runtime du projet,
// pour lui, sur tous ses appareils ; lu à chaque ouverture du projet. Ce qui change à l'écran se repose.
const explications = tenirLesExplications({ service: serviceDesExplications(brigade), rendre: (projet) => rendreLesExplications(projet) });
/** @param {string} projet */
function rendreLesExplications(projet) {
  if (courant?.nom !== projet) return;
  poserRail(courant);
  poserLExplicationDuSecond();
  poserLesExplicationsDuChef(projet);
}
// Sous l'onglet du second, l'explication du mot « second », quand sa colonne est à l'écran, dépliée.
function poserLExplicationDuSecond() {
  const explique = courant !== undefined && courant.refus === undefined && !colonneSecond.hidden && !colonneSecond.hasAttribute("data-replie") && telephoneVu === undefined ? explicationDe(courant.nom, "second") : [];
  explicationSecond.hidden = explique.length === 0;
  explicationSecond.replaceChildren(...explique);
}
// L'explication d'un mot à l'écran, si elle s'y montre : marquée vue à ce moment-là.
/** @param {string} projet @param {import("./explications/explications-box.ts").MotExplique} mot @returns {HTMLElement[]} */
function explicationDe(projet, mot) {
  return explications.aMontrer(projet, mot) ? [poserExplication(document, mot, () => explications.ecarter(projet, mot))] : [];
}
// Celle d'un mot du rail, seulement quand le rail est à l'écran : posé sous Settings ou une page, il n'est pas rencontré.
/** @param {string} projet @param {import("./explications/explications-box.ts").MotExplique} mot @returns {HTMLElement[]} */
function explicationDuRail(projet, mot) {
  const visible = actif();
  return visible === PARAMETRES || ONGLETS.some(({ id }) => id === visible) ? [] : explicationDe(projet, mot);
}
// Sa rangée de Settings, qui les remontre toutes ; cachée tant que le registre n'est pas lu, et sur un pont qui ne le porte pas.
/** @param {string} projet */
function poserLesExplicationsDuChef(projet) {
  const etat = explications.etat(projet);
  explicationsDuChef.hidden = etat === undefined || (etat.vus === null && etat.sans === undefined);
  explicationsDuChef.replaceChildren(...(explicationsDuChef.hidden ? [] : [poserLaRangeeDesExplications(document, { etat, remontrer: () => void explications.effacer(projet) })]));
}
let ajoute = false;
// La dernière demande de lecture : une par écran affiché, et seules ses lectures s'affichent.
let demande = 0;
// L'onglet de contenu dont la commande est lue, et sa demande. Indéfini : à relire.
/** @type {string | undefined} */
let suivi = "";
let demandeOnglet = 0;
// L'onglet que cette demande lit. Celle de la page des coûts lit la box de chaque projet.
/** @type {string | undefined} */
let ongletDemande;
// Le dernier `station` lu de chaque projet pour la page des coûts — ou ce qui a été obtenu à sa place.
/** @type {Map<string, Lecture>} */
const coutsLus = new Map();
// Le dernier `closing --json` lu de chaque projet pour la page des ratios — ou ce qui a été obtenu à sa place.
/** @type {Map<string, Lecture>} */
const ratiosLus = new Map();
// Le rail que sa station publie, par projet sans box ni station ici (ticket 1435, `lireLeRailPublie`), et le rang de sa
// dernière lecture. `sansReponse` : un pont qui ne le lit pas, et l'onglet garde sa phrase d'avant (ticket 1405).
/** @type {Map<string, import("./rail-publie.js").EtatDuRailPublie & { sansReponse?: true }>} */
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
/** @type {{ projet: string, cle: string, rendu?: Confirmation | { refus: string }, compte?: Compte | null } | undefined} */
let aConfirmer;
// Les gestes de la cuisine, dits de même (cuisine.ts) : leurs libellés. Arrêter et reprendre sont la ligne de la
// cuisine, dans Settings ; reprendre est aussi sur ce qui dit la cuisine à l'arrêt.
/** @type {readonly { id: string, libelle: string }[]} */
let GESTES_DE_LA_CUISINE = [];
// Les trois gestes de WAITING, dits de même (attente.ts) : « waiting for… » sur une carte de TODO,
// « resume » et « it arrived » sur une carte de WAITING. La vue les nomme, elle ne sait pas ce qu'ils écrivent.
/** @type {readonly { id: string, libelle: string }[]} */
let GESTES_D_ATTENTE = [];
// Le formulaire « waiting for… » ouvert sur une carte, par projet et ticket : ce que le chef y a
// rempli, et pourquoi rien n'est parti quand c'est le cas. Le rail se redessine à chaque lecture :
// le formulaire y revient tel que le chef l'a laissé. Absent : la carte porte son bouton.
/** @type {Map<string, { quoi: string, qui: string, relance: string, refus?: string }>} */
const formulairesDAttente = new Map();
// Ce qu'il est advenu de « it arrived, back to the kitchen » sur une carte de WAITING, par projet et ticket :
// en route, posté sur le tableau de la cuisine — son commentaire au survol —, ou pourquoi rien ne l'est. La carte le
// dit sous ses gestes tant qu'elle est dans WAITING.
/** @type {Map<string, { envoi: true } | { fait: string, detail: string } | { refus: string, detail: string }>} */
const arriveesDeCartes = new Map();
// Les gestes directs, et les confirmés, dits de même (gestes.ts) : le clic d'un direct fait partir
// sa commande dans le second — ou dit pourquoi elle ne part pas ; celui d'un confirmé ouvre sa
// confirmation, et rien ne part avant son « oui ». La vue ne le décide pas.
/** @type {readonly string[]} */
let DIRECTS = [];
/** @type {readonly string[]} */
let CONFIRMES = [];
// La réponse du chef en route sur une carte de TODO (carte-todo.js), par projet et ticket
// (`<projet>#<numéro>`), avec la question à laquelle elle répond. Absente : la carte dit ce que le tableau
// de la cuisine montre de sa dernière réponse. Postée, la carte reste, envoyée et en attente de la cuisine,
// tant que les faits lus portent cette question — nulle sur une carte à un seul geste ; la lecture qui ne la
// porte plus l'oublie. Ce n'est qu'un relais : ce que la carte dit après un redémarrage vient du tableau (ticket 1841).
/** @type {Map<string, { question: string | null, etat: import("./carte-todo.js").Etat }>} */
const reponsesAuxCartes = new Map();
// Les cartes « Validate its screen » (validation-design/, ticket 3185) : le geste en route d'ici, et le commentaire tapé,
// par `<projet>#<numéro>` ; et, par projet, les numéros des cartes que le chef a validées ou renvoyées — elles quittent TODO
// tout de suite, et sont oubliées dès qu'une lecture ne les porte plus.
/** @type {Map<string, import("./validation-design/validation-design.js").Etat>} */
const validations = new Map();
/** @type {Map<string, string>} */
const commentairesDeValidation = new Map();
// Les cartes « review before merge » (carte-sensible/, ticket 3224) : la même chose — le geste en route et la note tapée ;
// mergées ou renvoyées d'ici, elles quittent TODO avec les validées (`validees`).
/** @type {Map<string, import("./carte-sensible/carte-sensible.js").Etat>} */
const revues = new Map();
/** @type {Map<string, string>} */
const notesDeRevue = new Map();
/** @type {Map<string, Set<number>>} */
const validees = new Map();
/** @param {string} projet */
const valideesDe = (projet) => validees.get(projet) ?? new Set();
// Le détail en grand d'une carte « Validate its screen » (validation-design/detail-de-validation.js, ticket 3212), ouvert
// d'un clic sur la carte : son projet, son ticket, et ce qu'il montre — côte à côte ou l'une sur l'autre, la capture
// ouverte seule, le zoom de chaque écran —, gardé d'une pose à l'autre.
/** @type {{ projet: string, ticket: number, affichage: import("./validation-design/detail-de-validation.js").Affichage } | undefined} */
let detailOuvert;
// Ce que le chef a tapé dans le champ d'une carte de TODO, par projet et ticket : un rail redessiné le lui rend. Une carte
// partie de TODO ne l'emporte pas (ticket 2151) : un brouillon non vide y reste, sur une carte résolue, jusqu'à ce que le
// chef l'écarte — avec ce que sa carte demandait (`questionsDesBrouillons`).
/** @type {Map<string, string>} */
const brouillonsDeCartes = new Map();
/** @type {Map<string, string | null>} */
const questionsDesBrouillons = new Map();
// La carte de TODO où le chef répond (ticket 2151) : tant que le clavier est dans sa carte — son champ, ses choix —, aucune
// lecture ne redessine le rail du projet. La carte n'est ni retirée, ni reposée, ni déplacée, et ce qu'il tape reste sous
// ses doigts. Ce qui arrive entre-temps est tenu (`gele`) et posé quand le clavier quitte la carte ; une carte que la
// lecture ne porte plus le dit à côté de son texte. `bon` : la carte posée ; `carte` : sa partie de TODO.
/** @type {{ projet: string, ticket: number, question: string | null | undefined, bon: HTMLElement, carte: HTMLElement, gele: boolean } | undefined} */
let carteEnMain;
// Pourquoi le dernier bouton cliqué n'a rien fait : dit sous les onglets de pages, jusqu'au prochain geste —
// ou, quand c'est le second qui n'a rien reçu, à droite, sous les onglets des terminaux.
let nonEcrit = "";
let nonEcritSecond = "";
// Un geste confirmé ou direct qui n'a rien envoyé au second : la phrase qui le dit au centre, et de quoi le rejouer
// avec le « oui » déjà donné.
/** @type {{ texte: string, rejouer: () => void } | undefined} */
let gesteRate;
// Le terminal qui prend le clavier au prochain affichage : celui qu'un geste du chef vient de
// montrer ou d'écrire. Sans geste, personne ne le prend — le second ne perd pas sa frappe.
/** @type {number | undefined} */
let aFocaliser;
// La bannière d'arrêt, dite de même (faits.ts) : ce qu'elle dit, et le bouton qui écrit la relance.
/** @type {typeof import("../faits.ts").BANNIERE | undefined} */
let BANNIERE;
// Le calibrage que la station accepte, pour le parcours « Add a project » : donné au démarrage.
/** @type {{ modeles: readonly string[], efforts: readonly string[] }} */
let CALIBRAGE_DU_PROJET = { modeles: [], efforts: [] };
// Ce que l'accueil dit en dernier (accueil.ts) : une ligne par projet, une par station, la santé. Indéfini : pas encore reçu.
/** @type {import("../accueil.ts").Accueil | undefined} */
let accueilVu;
// Le téléphone appairé (l'app Android) : sa station, et ce que la dernière lecture de la liste de ses projets en a dit
// (le ticket 1414), relu par `surTelephone`. Indéfini sur le desktop.
/** @type {import("./pont.d.ts").Telephone | undefined} */
let telephoneVu;
// La station dont la page est ouverte, par son gist. Aucune : c'est l'accueil — ou un projet.
/** @type {string | undefined} */
let stationOuverte;
// La page de l'app ouverte à la place de l'accueil : celle des coûts de tous les projets (ticket 1022), celle de
// leurs ratios ajouté / retiré (ticket 1682), ou celle de leurs résumés hebdomadaires (ticket 3263). Aucune : l'accueil — ou un projet, une station.
/** @type {typeof COUTS | typeof RATIOS | typeof RESUMES | undefined} */
let pageDeLApp;
// Ce que `faits` a rendu en dernier pour chaque projet, et la demande à laquelle il répond :
// une par barre posée. Sans entrée, le projet n'a pas encore été lu.
/** @type {Map<string, Dessinable>} */
const tenus = new Map();
// Le dépôt d'un projet où le compte GitHub de cet ordinateur ne peut pas écrire (ticket 3163), d'après sa dernière
// lecture : le projet s'ouvre en lecture seule — tout s'y voit, aucun geste n'y est offert, une ligne en tête le dit.
// L'accès gagné, la lecture suivante ne le porte plus et la vue redevient ordinaire, sans rouvrir le projet.
/** @param {{ nom: string }} projet @returns {string | undefined} */
function lectureSeuleDe(projet) {
  const tenu = tenus.get(projet.nom);
  return tenu !== undefined && "tableau" in tenu ? tenu.tableau.lectureSeule?.depot : undefined;
}
// L'app n'a pas joint GitHub (tableau/lecture.ts, `horsLigne`, ticket 1818) : depuis quand, d'après la première lecture ratée
// de la série. Ce n'est pas une panne : le rail garde sa dernière lecture, atténué, et un seul signe le dit. Il part à la
// première lecture qui joint GitHub.
/** @type {Map<string, string>} */
const horsLignes = new Map();
// Le dernier rail lu, gardé quand les lectures qui l'ont suivi ont raté en ligne (ticket 2151) : depuis quand, d'après la
// première de la série, et la raison de la dernière. Il part à la première lecture qui dessine le rail.
/** @type {Map<string, { depuis: string, raison: string }>} */
const perimes = new Map();
// Ce qu'une lecture ratée dit d'elle-même, en une ligne.
/** @param {Dessinable} recue */
function raisonDeLEchec(recue) {
  if ("tableau" in recue) return "";
  const dit = "informe" in recue ? recue.informe : recue.erreur;
  return dit.trim().split("\n")[0] ?? "";
}
const heureCourte = (/** @type {number | string} */ instant) => new Date(instant).toLocaleTimeString("en-US", { hour: "numeric", minute: "2-digit" });
let demandeFaits = 0;
// Les projets dont une lecture des faits est partie de la vue — la première, ou une relecture — et n'a pas encore de
// réponse : le haut de leur rail bat doucement, sans phrase, jusqu'à ce que `surFaits` la rende (ticket 1818).
/** @type {Set<string>} */
const enLecture = new Set();
// Une lecture des faits demandée au process principal — `relire` : celle de la box, tout de suite ; sinon la première,
// pour une barre posée. Tous les projets sont relus : chacun est en lecture jusqu'à sa réponse.
function lireLesFaits(relire = true) {
  for (const { nom } of configuration.projets) enLecture.add(nom);
  if (relire) brigade.relireBox(demandeFaits);
  else brigade.faits(++demandeFaits);
  if (courant !== undefined && !rail.hidden) marquerLecture(courant);
}
// Le haut du rail du projet affiché bat tant que sa lecture est en cours : rien d'autre n'est reposé.
/** @param {Projet} projet */
function marquerLecture(projet) {
  if (enLecture.has(projet.nom) && seLit(projet) && projet.sansStation !== true) rail.dataset.lecture = "";
  else delete rail.dataset.lecture;
}
// Les réglages de chaque projet (ticket 1309) : leur dernière lecture, et l'état de chacun — ce que le chef écrit sans
// l'avoir changé, la proposition qui attend sa réponse, ce que la dernière a rendu. Le plafond, sur Cooks, est le même réglage.
/** @type {Map<string, import("../reglages-du-projet.ts").LectureDesReglages>} */
const reglagesLus = new Map();
/** @type {Map<string, Map<import("../reglages-du-projet.ts").Cle, import("./projet/reglages.js").Etat>>} */
const etatsDesReglages = new Map();
// La dernière bande d'alertes de chaque projet, telle que le process principal l'a dite (alertes.ts).
/** @type {Map<string, Alerte[]>} */
const bandes = new Map();
// La ligne du disjoncteur ouvert d'un projet, dans sa dernière bande : celle dont le bouton est « Resume » (ticket 2140).
/** @param {string} nom */
const alerteDuDisjoncteur = (nom) => (bandes.get(nom) ?? []).find(({ appel }) => appel !== undefined && "reprise" in appel);
// « Resume » en route d'ici, par projet (todo-breaker-line.js) : en cours, demandé, ou refusé. Il tient tant que la bande
// dit le disjoncteur ouvert, et part avec elle.
/** @type {Map<string, import("./page-projet/depot-non-prepare.js").Etat>} */
const depots = new Map();
/** @type {Map<string, import("./todo-breaker-line.js").Etat>} */
const reprises = new Map();
// Les projets dont le dernier rail posé porte la ligne du disjoncteur en tête de TODO : la bande ne la redit pas.
/** @type {Set<string>} */
const disjoncteursEnTodo = new Set();
// Ce que chaque bande dit de son projet sur sa case de la barre (alertes.ts, `signalDe`), et les
// signaux posés : un seul par case.
/** @type {Map<string, {etat: string, dit: string} | undefined>} */
const signaux = new Map();
// L'état de l'interrupteur de chaque projet — le manager le suit, et sa ligne le dit —, tel que sa
// dernière bande l'a dit (alertes.ts, `EtatDuManager`) : l'interrupteur, en tête de l'espace, et la
// tête du rail le disent. Sans entrée, il n'est pas encore lu.
/** @type {Map<string, import("../alertes.ts").EtatDuManager | undefined>} */
const etatsDuManager = new Map();
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
let gesteDeLUrgence;
// Dans la barre, la pastille de chaque projet qui a une box.
/** @type {Map<string, HTMLElement>} */
const pastilles = new Map();
// Ce que fait chaque cook de chaque projet, tel que la dernière lecture de son tableau le publie (activite-du-cook.js) :
// la fiche d'un ticket en pose son cook.
/** @type {Map<string, import("./activite-du-cook.js").Publiees>} */
const activitesPubliees = new Map();
// Les cartes de Livré dont le chef a déplié les remarques, par projet et ticket : le rail se
// redessine à chaque lecture, et ce qu'il lit ne se replie pas sous ses yeux.
/** @type {Set<string>} */
const remarquesDepliees = new Set();
// Ce qui est avant le rail, par projet, tel que le process principal l'a rangé (amont.ts) : la dernière lecture que le
// tableau de la cuisine en donne, pour le projet affiché.
/** @type {Map<string, import("../amont.ts").Vu>} */
const amonts = new Map();
// Les temps que la bande de chaque projet a posés : publiés autrement, elle se repose sans attendre la lecture du rail.
/** @type {Map<string, string>} */
const tempsDesBandes = new Map();
// Les projets dont le chef a déplié la colonne Backlog : une lecture neuve ne la replie pas.
/** @type {Set<string>} */
const amontsDeplies = new Set();
// Le backlog de la bande, tel que la dernière tête du rail l'a posé : redessiné, il garde le clavier.
/** @type {HTMLElement | undefined} */
let backlogDuRail;
// La fiche ouverte par-dessus le rail : son projet, la carte cliquée — telle que la dernière lecture
// la donne —, et son bon, qui reprend le clavier quand elle se ferme. Aucune : le rail est seul.
/** @type {{ projet: Projet, carte: import("../faits.ts").Carte, retour: HTMLElement } | undefined} */
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
/** @param {{ lue?: import("../question.ts").Lue, envoi?: boolean, rendue?: import("../question.ts").Rendue, quand?: number } | undefined} etat */
function perimee(etat) {
  if (etat === undefined || etat.envoi === true || etat.quand === undefined) return false;
  const repondue = etat.rendue?.poste === true || (etat.lue !== undefined && "question" in etat.lue && etat.lue.question.repondue !== undefined);
  return repondue && Date.now() - etat.quand > RELIRE_QUESTION_MS;
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
// Le commentaire que le chef écrit sur l'issue, par `<projet>#<ticket>` : une fiche reposée, ou
// un envoi qui échoue, ne le perd pas. Il ne s'efface qu'une fois posté.
/** @type {Map<string, string>} */
const commentaires = new Map();
// Ce qu'il en est du dernier commentaire envoyé, par `<projet>#<ticket>` : en route, ou ce qui en est advenu.
/** @type {Map<string, { envoi: true } | { rendu: import("../discussion.ts").Commente }>} */
const envoisDeCommentaire = new Map();
// Ce qu'il en est de la dernière demande au second faite depuis le champ de contexte de la fiche, ou
// depuis la carte de TODO (carte-todo.js), par `<projet>#<ticket>` : en route, partie (la note du
// terminal), ou ce qui l'a empêchée. La fiche et la carte la disent toutes deux.
/** @type {Map<string, { envoi: true } | { parti: string } | { refus: string }>} */
const demandesAuSecond = new Map();
// Le geste en route (`envoi`) ou refusé (`refus`) d'une carte mise de côté (ticket 3147), par `projet#ticket`.
/** @type {Map<string, { envoi: "relancer" | "clore" } | { refus: string }>} */
const refusDeCartes = new Map();
// Ce que le process principal a lu des essais de chaque projet (essai.ts, ticket 3215) : sa déclaration `.brigade/try.json` et ses essais par ticket.
/** @type {Map<string, import("../essai.ts").VuDesEssais>} */
const essaisDeProjets = new Map();
/** @param {Projet} projet */
async function lireLesEssais(projet) {
  const vu = await brigade.essais?.(projet.nom);
  if (vu === undefined) return;
  essaisDeProjets.set(projet.nom, vu);
  if (courant?.nom === projet.nom && !rail.hidden && tenus.has(projet.nom)) poserRail(projet);
}
// Ce que la fiche dit de la vie du ticket vivant (histoire.ts, `situation`), par `<projet>#<ticket>`.
/** @type {Map<string, import("../histoire.ts").Situation>} */
const situations = new Map();
// Les gestes de la fiche de chaque ticket ouvert, à cet instant (gestes-fiche.ts), par
// `<projet>#<ticket>` : relus à chaque ouverture, et quand la lecture change ce qui les décide.
// Absents de la table, la lecture est en route ; `{ sans }`, ils n'ont pas pu être lus.
/** @type {Map<string, import("../gestes-fiche.ts").Propose[] | { sans: string }>} */
const gestesDeFiches = new Map();
// Ce qu'il est advenu du dernier geste de la fiche qui n'est pas parti, par `<projet>#<ticket>` : en une ligne, et ce
// que la station ou le pont en a dit, au survol.
/** @type {Map<string, { dit: string, detail: string }>} */
const refusDeFiches = new Map();
// Ce qu'il est advenu du dernier geste de la fiche qui est parti, par `<projet>#<ticket>` (ticket 1164) : en route —
// ses boutons attendent la réponse, et rien ne part deux fois —, fait par la station, sans terminal où le lire — ce
// que le pont du téléphone rend —, ou écrit dans le second, que l'écran étroit ne montre pas à côté de la fiche.
/** @type {Map<string, { envoi: string } | { fait: string, detail: string } | { second: true }>} */
const issuesDeFiches = new Map();
// Un geste qui n'est pas parti — le pont a levé, ou ne porte pas l'action (le téléphone, tant que son pont ne la
// prend pas) : une ligne, et pourquoi au survol.
const SANS_ENVOI = "nothing was sent — nothing was changed";
const SANS_PONT = "this app does not carry this action to the station yet";
// Le geste de la fiche qui coûte et que le chef a cliqué, en attente de sa confirmation, par
// `<projet>#<ticket>` : rien ne part avant son « oui ».
/** @type {Map<string, import("../gestes-fiche.ts").IdDeFiche>} */
const confirmationsDeFiches = new Map();
// La priorité que le chef a choisie, pas encore envoyée, par `<projet>#<ticket>` : une fiche
// reposée ne la perd pas.
/** @type {Map<string, string>} */
const prioritesChoisies = new Map();
// Le label qui retient un ticket (question.ts, `LABEL_RETENUE`) : ce que la ligne du bloc `attend` nomme.
const LABEL_RETENUE = "blocked-on-human";
// Ce que le chef a fait d'une retenue `blocked-on-human`, par `<projet>#<ticket>` : en cours, ou ce qui en est advenu.
/** @type {Map<string, { envoi: true } | { leve: import("../question.ts").Leve } | { confirme: true }>} */
const levees = new Map();
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
let barreDeMenusRefusee = "";
// Ce que la dernière lecture des clones donne à poser (retard.ts). Indéfini : pas encore lus.
/** @type {VuDuCode | undefined} */
let codeVu;
// Pourquoi la dernière mise à jour demandée n'a pas été écrite, ou pas faite : dit sous les clones, jusqu'à la prochaine.
let nonMisAJour = "";
// L'app se met à jour : son bouton attend qu'elle se relance.
let enPassage = false;
// La mise à jour de l'app installée, telle que la dernière lecture la dit (mise-a-jour/etat.ts). Indéfini : pas encore reçue.
/** @type {import("../mise-a-jour/etat.ts").EtatDeMiseAJour | undefined} */
let miseAJourVue;
// Ce que la dernière lecture des stations donne à poser (stations/stations.ts). Indéfini : pas encore lues.
/** @type {import("../stations/stations.ts").VuDesStations | undefined} */
let stationsVues;
// Les projets des stations (projets/projets.ts). Indéfini : pas encore lus.
/** @type {import("../projets/projets.ts").VuDesProjets | undefined} */
let projetsVus;
// Le parcours « Add a project », tant qu'il est ouvert : quand il l'a été, les dépôts lus, les
// stations cochées — une relecture des stations ne les perd pas.
/** @type {{ ouvertLe: string, depots: import("../projets/github.ts").DepotDuChef[], choisies: Set<string>, touchee: boolean } | undefined} */
let parcours;
// Le choix des stations auxquelles confier la cuisine du projet affiché, tant qu'il est ouvert : le
// même que le parcours, pour ce projet-là — une relecture des stations ne perd pas ce qui est coché.
// `choisies` : la seule machine choisie (ticket 3187) ;
// `cooksTouches` : le chef a changé la valeur proposée — elle ne suit plus la machine ni les projets relus.
// `defauts` : ce que cet ordinateur propose pour une station de plus (ticket 1307), lu à l'ouverture ;
// `capacites` : par machine, les capacités cochées — celles qu'on y détecte, tant que le chef n'y a pas touché.
/** @type {{ projet: string, ouvertLe: string, depots: import("../projets/github.ts").DepotDuChef[], choisies: Set<string>, touchee: boolean, cooksTouches: boolean, defauts?: import("../projets/projets.ts").DefautsDeLaMachine, capacites: Map<string, Set<string>> } | undefined} */
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
const parcoursRanges = new Set();
// Le déménagement dont le choix est ouvert — pour quel projet —, s'il part, et vers quelle station (son gist).
/** @type {{ projet: string, part: boolean, vers?: string } | undefined} */
let demenagement;
// Ce que le dernier déménagement a rendu, et pour quel projet : dit sous la ligne de ses stations —
// refusé, sa raison, et son détail au survol.
let demenagementDitPour = { projet: "", dit: "", refus: false, detail: "" };
// Le projet dont le retrait attend un second clic.
/** @type {string | undefined} */
let retraitDemande;

// La peau du terminal vient des jetons, comme le reste (jetons.css) : ni couleur ni police ne s'écrit ici.
/** @param {string} nom */
const jeton = (nom) => getComputedStyle(document.documentElement).getPropertyValue(nom).trim();

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
let POSTE = { nom: CET_ORDINATEUR, mac: true };

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
      if (terminal.genre === "second" && reponseTapee(donnees)) repondueAuClavier(terminal.projet);
    });
    // Shift+Entrée : xterm l'envoie comme Entrée (`\r`) et le shell comme `claude` l'exécutent ou
    // l'envoient. Un retour à la ligne, lui, ne part pas : `ESC` + `\r` pour `claude` (son Alt+Entrée),
    // un saut de ligne cité (`^V` `^J`) pour le shell.
    xterm.attachCustomKeyEventHandler((touche) => {
      // Copier : la sélection va au presse-papiers. Coller : la touche est laissée au navigateur, qui
      // colle dans le terminal comme le menu le ferait.
      const geste = pressePapiers(touche, { mac: POSTE.mac, selection: xterm.hasSelection() });
      if (geste === "copier" && touche.type === "keydown" && xterm.hasSelection()) void navigator.clipboard?.writeText(xterm.getSelection());
      if (geste !== undefined) return false;
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
      if (courant?.nom === terminal.projet) poserLeProjetAPreparer();
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
const reglagesMontres = () => courant !== undefined && actif() === PARAMETRES;
// L'onglet de la conversation est montré (écran étroit) : le second prend la place du centre. Une page ouverte
// par-dessus — Settings, le journal — le couvre, comme elle couvre Rail.
const conversationMontree = () => courant !== undefined && actif() === undefined && ongletDe(courant) === CONVERSATION;
const secondDuCourant = () => duCourant().find(({ terminal }) => terminal.genre === "second");
// Le terminal montré à droite : le shell que le chef y a laissé, sinon le second.
const montreADroite = () => {
  const shell = courant === undefined ? undefined : aDroite.get(courant.nom);
  return (shell === undefined ? undefined : vues.get(shell)) ?? secondDuCourant();
};

function montrer() {
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
  espace.textContent = courant?.nom ?? "";
  // Rail, Stations et Settings, à côté du nom (ticket 1184, 2921) : celui qui est montré est marqué — aucun quand une page le couvre.
  const ouvert = courant;
  ongletsDuProjet.hidden = ouvert === undefined;
  ongletsDuProjet.replaceChildren(
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
          ...(etroit() && telephoneVu === undefined
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
    const cree = cliquable(titre, () => montrerADroite(id));
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
  bandeau.hidden = dit === undefined;
  bandeau.textContent = dit ?? "";
  const teinte = courant?.couleurs?.onglet ?? courant?.couleurs?.accent;
  if (teinte === undefined) bandeau.style.removeProperty("background");
  else bandeau.style.setProperty("background", teinte);
  fermerShell.hidden = droite === undefined || droite.terminal.genre !== "shell";
  fermerShell.textContent = fermerShell.hidden ? "" : `close ${droite?.terminal.titre}`;
  const choix = ouvrable && choixDeMachine?.projet === courant?.nom ? choixDeMachine : undefined;
  listeMachines.hidden = choix === undefined;
  listeMachines.replaceChildren(
    ...(choix === undefined
      ? []
      : [bloc("span", "open a shell on"), ...choix.machines.map(({ id, titre }) => bouton(titre, () => void ouvrirSur(choix.projet, id))), bouton(ANNULER, () => void ((choixDeMachine = undefined), montrer()), "discret")]),
  );

  // L'explication d'un onglet relayé n'est pas écrite à plat : une icône d'aide la porte.
  // Settings n'en a pas : il n'a que des réglages.
  const suivie = reglagesMontres() ? undefined : ONGLETS.find(({ id }) => id === lue());
  const explication =
    suivie === undefined || courant === undefined
      ? ""
      : `the output of ${geste(courant, suivie.commande)}, as the station returns it${suivie.precision === undefined ? "" : ` (${suivie.precision})`} — re-read on its own every thirty seconds, while this tab is shown`;
  note.replaceChildren(
    ...(gesteRate !== undefined
      ? poserGesteRate(gesteRate)
      : nonEcrit !== "" ? [nonEcrit] : explication === "" ? [] : [survol(document, explication)]),
  );
  note.hidden = (note.childElementCount === 0 && note.textContent === "") || conversationMontree();
  // Une page se pose par-dessus le rail : il reste dessous, tel quel, et rien de lui ne se clique au travers.
  contenu.hidden = relaye === undefined && visible !== PARAMETRES;
  rail.inert = !contenu.hidden || !fiche.hidden;
  // Settings est une seule page, sans sous-pages (ticket 1700) : son seul groupe, celui du projet, et rien d'autre.
  etat.hidden = courant === undefined || visible !== PARAMETRES;
  // Les plafonds, le closer et les lignes de tous les projets, leur section de Settings (ticket 3014) : posés tant qu'il
  // est ouvert, vidés sinon.
  if (courant !== undefined && reglagesMontres()) poserLeBandeauDeSante(courant);
  else bandeauSante.replaceChildren();
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
  teteDuSecond.hidden = telephoneVu !== undefined;
  // Sous son onglet, l'explication du mot « second » (ticket 3308).
  poserLExplicationDuSecond();
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
  else if (montre?.aReprendre === true && note === montre.note) noteSecond.replaceChildren(note, " ", bouton("resume", () => brigade.ecrire(montre.id, "")));
  else noteSecond.textContent = note;
  // Un second qui ne part pas n'a pas de terminal à montrer : à sa place, pourquoi, et ce qui lui manque (ticket 1435).
  fil.hidden = !ouvrable || telephoneVu !== undefined || montre?.empeche !== undefined;
  // Le second ne part pas, ou part sans tous ses outils (ticket 1435) : sous sa note, chaque outil qui manque, et ce
  // qui l'obtient — et, s'il ne part pas, de quoi réessayer. Sur un projet qui ne s'ouvre pas, il n'y a pas de second.
  const dit = !ouvrable || telephoneVu !== undefined ? undefined : (montre?.empeche ?? montre?.manque);
  outilsDuSecond.hidden = dit === undefined;
  outilsDuSecond.replaceChildren(
    ...(dit === undefined || montre === undefined
      ? []
      : [
          poserOutilsDuSecond(document, dit, {
            bloque: montre.empeche !== undefined,
            // Comme une touche dans un second arrêté : il est relancé, et ses outils revérifiés (terminaux.ts).
            reessayer: () => brigade.ecrire(montre.id, ""),
            ouvrirLaPage: (url) => void brigade.ouvrirLaPage?.(url),
          }),
        ]),
  );
  poserSousLeSecond(ouvrable && telephoneVu === undefined ? montre : undefined);
}

// Sous le terminal du second, ses choix quand il demande de choisir (ticket 1520), ou le geste qu'il nomme (ticket
// 1521) : seulement quand c'est lui qui est montré, qu'il tourne, et que son canal en porte qui n'ont pas eu de
// réponse. Sinon, rien sous le terminal.
/** @param {Terminal | undefined} montre */
function poserSousLeSecond(montre) {
  const second = montre?.genre === "second" && !montre.arrete && montre.empeche === undefined ? montre : undefined;
  const proposition = second === undefined ? undefined : propositionsDuSecond.aMontrer(second.projet);
  const geste = second === undefined ? undefined : propositionsDuSecond.geste(second.projet);
  choixDuSecond.hidden = proposition === undefined && geste === undefined;
  choixDuSecond.replaceChildren(
    ...(second === undefined
      ? []
      : proposition !== undefined
        ? [poserChoixDuSecond(document, proposition, { choisir: (valeur) => choisirAuSecond(second, valeur) })]
        : geste !== undefined
          ? [
              poserGesteDuSecond(document, geste, {
                ouverte: propositionsDuSecond.confirmationOuverte(second.projet),
                basculer: () => confirmerLeGeste(second, !propositionsDuSecond.confirmationOuverte(second.projet)),
                annuler: () => confirmerLeGeste(second, false),
                lancer: () => lancerLeGeste(second, geste.id),
              }),
            ]
          : []),
  );
}

// Le bouton du geste ouvre sa confirmation, recliqué la referme ; « cancel » la referme. Rien n'est écrit dans le
// terminal du second.
/** @param {Terminal} second @param {boolean} ouverte */
function confirmerLeGeste(second, ouverte) {
  propositionsDuSecond.confirmer(second.projet, ouverte);
  montrer();
}

// Le « run it » du chef — le seul chemin qui lance un geste : sa commande part dans le terminal du second, telle que
// publiée, puis Entrée, comme si le chef l'avait tapée ; le bouton part, et le canal apprend que le chef l'a fait. Si
// le second a publié autre chose depuis, ou est passé à autre chose, rien ne part. Le terminal reprend le clavier.
/** @param {Terminal} second @param {string} id */
function lancerLeGeste(second, id) {
  const geste = propositionsDuSecond.lancer(second.projet, id);
  if (geste === undefined) return;
  brigade.ecrire(second.id, geste.command);
  brigade.ecrire(second.id, "\r");
  void brigade.repondreAuSecond?.(second.projet, { id: geste.id, by: "click" });
  aFocaliser = second.id;
  montrer();
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
  montrer();
}

// Le chef a répondu en tapant dans le terminal du second : ses choix, ou le geste nommé, partent, et le canal l'apprend.
/** @param {string} projet */
function repondueAuClavier(projet) {
  const repondue = propositionsDuSecond.repondreAuClavier(projet);
  if (repondue === undefined) return;
  void brigade.repondreAuSecond?.(projet, { id: repondue.id, by: "text" });
  montrer();
}

// Un terminal qu'un geste a rendu se montre à droite, et prend le clavier : un shell, à côté du
// second ; le second, si un shell le cachait. Le centre ne change pas : rien n'y est masqué ni remplacé.
/** @param {string} projet @param {Terminal} terminal */
function garder(projet, terminal) {
  recevoir(terminal);
  if (terminal.genre === "second") aDroite.delete(projet);
  else aDroite.set(projet, terminal.id);
  if (projet === courant?.nom) aFocaliser = terminal.id;
}

// Une ligne courte, et son explication au survol : ce qui s'écrivait en mode d'emploi.
/** @param {string} balise @param {string} ligne @param {string} aide */
function ditEtAide(balise, ligne, aide) {
  const cree = bloc(balise, ligne);
  cree.append(survol(document, aide));
  return cree;
}

// Un bouton de geste : celui de la famille unique (composants/bouton, ticket 2916) — secondaire, sauf sorte dite.
/** @param {string} texte @param {(() => void) | undefined} geste @param {import("./composants/bouton/bouton.js").Sorte} [sorte] */
function bouton(texte, geste, sorte = "secondaire") {
  return boutonDeLaFamille(document, texte, geste, { sorte });
}

// Ce qui se clique sans être un geste, et n'a pas la forme d'un bouton : un onglet, une case de la barre, une pastille
// de couleur, un interrupteur, un numéro qui ouvre son issue. Chacun a la sienne ; aucun n'est un bouton de la famille.
/** @param {string} texte @param {() => void} geste */
function cliquable(texte, geste) {
  const cree = document.createElement("button");
  cree.textContent = texte;
  cree.addEventListener("click", geste);
  return cree;
}

// Un bouton qui porte sa commande : elle se lit telle qu'elle sera écrite, au caractère près.
/** @param {string} texte @param {() => void} geste */
function boutonDeCommande(texte, geste) {
  const cree = bouton(texte, geste);
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
    for (const [nom, valeur] of Object.entries(attributs)) forme.setAttribute(nom, valeur);
    svg.append(forme);
  }
  return svg;
}

// Une entrée de la barre : deux caractères, et ce qu'ils désignent dit en entier
// au survol et à qui ne voit pas l'écran.
/** @param {string} signe @param {string} nom @param {() => void} geste */
function icone(signe, nom, geste) {
  const cree = cliquable(signe, geste);
  cree.title = nom;
  cree.ariaLabel = nom;
  return cree;
}

// Une carte de T'attend n'agit pas non plus : elle écrit une demande en prose dans le second, à
// droite, et rien ne l'envoie — c'est le second qui lit l'issue, explique et répond (demande.ts).
// Le rail reste où il est, et la page ouverte par-dessus aussi.
/** @param {number} ticket */
async function demander(ticket) {
  const projet = courant;
  if (projet === undefined) return;
  nonEcrit = nonEcritSecond = "";
  gesteRate = undefined;
  if (projet.refus !== undefined) return montrer();
  try {
    const rendu = await brigade.demander(projet.nom, ticket);
    if (rendu === undefined) nonEcritSecond = `nothing written: the last reading of the station no longer names #${ticket}`;
    else if ("refus" in rendu) nonEcritSecond = rendu.refus;
    else garder(projet.nom, rendu);
  } catch (erreur) {
    nonEcritSecond = `nothing written: ${erreur instanceof Error ? erreur.message : String(erreur)}`;
  }
  montrer();
}

// Une ligne de la bande d'alertes dont le geste demande du jugement : une demande en prose
// s'écrit dans le second, à droite, et rien ne l'envoie — le second lit, explique, et c'est ton
// Entrée qui la fait partir (demande.ts). La vue nomme la ligne ; la phrase vient de ce que la
// bande en dit, dans le process principal. Le centre ne change pas.
/** @param {Alerte} alerte */
async function demanderAlerte({ sujet, dit }) {
  const projet = courant;
  if (projet === undefined) return;
  nonEcrit = nonEcritSecond = "";
  gesteRate = undefined;
  if (projet.refus !== undefined) return montrer();
  try {
    const rendu = await brigade.demanderAlerte(projet.nom, sujet, dit);
    if (rendu === undefined) nonEcritSecond = `nothing written: the band no longer says “${dit}”`;
    else if ("refus" in rendu) nonEcritSecond = rendu.refus;
    else garder(projet.nom, rendu);
  } catch (erreur) {
    nonEcritSecond = `nothing written: ${erreur instanceof Error ? erreur.message : String(erreur)}`;
  }
  montrer();
}

// Un geste du socle, collé à l'état qu'il change : son bouton, et — confirmé et ouvert — sa
// confirmation, dessous. Direct, il part au clic. Confirmé, le clic ouvre ce qu'il coûte, et rien
// ne part ; recliqué, la confirmation se referme. `ou` : l'endroit où il est posé — la même
// confirmation ne s'ouvre que sous le bouton cliqué.
/** @param {Projet} projet @param {{ id: string, libelle: string, ou: string }} geste */
function poserGeste(projet, { id, libelle, ou }) {
  if (!CONFIRMES.includes(id)) {
    const direct = bouton(libelle, () => void ecrireGeste(id));
    direct.dataset.geste = "direct";
    direct.title = "goes straight into the second, if it is free — its output is read there";
    return [direct];
  }
  const cle = JSON.stringify([id, "", ou]);
  const ouverte = aConfirmer?.projet === projet.nom && aConfirmer.cle === cle ? aConfirmer : undefined;
  const confirme = bouton(`${libelle}…`, () => void ouvrirConfirmation(projet, cle, id));
  confirme.dataset.geste = "confirme";
  confirme.ariaExpanded = String(ouverte !== undefined);
  confirme.title = "says what it costs first: nothing goes before your “yes”";
  return ouverte === undefined ? [confirme] : [confirme, poserConfirmation(projet, ouverte)];
}

// Le clic d'un geste confirmé : sa confirmation s'ouvre — ce qu'elle dit vient du process
// principal (confirmation.ts) —, et celle qui était ouverte se referme. Rien ne part. Recliqué,
// il la referme. « Allumer » se chiffre aussi : `manager backlog` est demandée à la box, et ses
// nombres rejoignent la confirmation quand elle répond — le « oui » ne les attend pas.
/** @param {Projet} projet @param {string} cle @param {string} id */
async function ouvrirConfirmation(projet, cle, id) {
  nonEcrit = nonEcritSecond = "";
  gesteRate = undefined;
  if (aConfirmer?.projet === projet.nom && aConfirmer.cle === cle) {
    aConfirmer = undefined;
    return montrer();
  }
  const ouverte = { projet: projet.nom, cle };
  aConfirmer = ouverte;
  montrer();
  /** @type {Confirmation | { refus: string } | undefined} */
  let rendu;
  try {
    rendu = await brigade.confirmer(projet.nom, id);
  } catch (erreur) {
    rendu = { refus: `nothing offered: ${erreur instanceof Error ? erreur.message : String(erreur)}` };
  }
  // Refermée, ou une autre ouverte entre-temps : ce qu'elle dit n'a plus où se poser.
  if (aConfirmer !== ouverte) return;
  aConfirmer = { ...ouverte, rendu: rendu ?? { refus: "nothing offered: this action is not confirmed" } };
  montrer();
  if (rendu === undefined || "refus" in rendu || rendu.chiffrer !== true) return;
  const compte = await brigade.compter(projet.nom).catch(() => undefined);
  if (aConfirmer?.projet !== projet.nom || aConfirmer.cle !== cle) return;
  aConfirmer = { ...aConfirmer, compte: compte ?? null };
  montrer();
}

// Ce que coûte un geste confirmé, sous son bouton : ce qu'il fait, son prix en clair, les cooks
// en vol et ce qu'ils ont dépensé, d'où c'est tiré — puis un bouton par « oui », chacun avec ce
// qu'il engage, et le « non ». Un « oui » fait partir son geste, dans le second ; « non » referme.
// Rien n'y est calculé : tout est dit par le process principal (confirmation.ts, allumage.ts) — ou,
// pour une demande au second, par la ligne de la bande qui la porte. `partir` : ce que fait un « oui »,
// quand ce n'est pas un geste du socle.
/** @param {Projet} projet @param {NonNullable<typeof aConfirmer>} ouverte @param {(id: string) => void} [partir] */
function poserConfirmation(projet, { rendu, compte }, partir) {
  const fermer = () => {
    aConfirmer = undefined;
    montrer();
  };
  if (rendu === undefined || "refus" in rendu) {
    const attente = document.createElement("section");
    attente.className = "confirmation";
    if (rendu === undefined) attente.append(ligneVide(document, "what it costs: reading…"));
    else attente.append(ligneErreur(document, rendu.refus, "", { classe: "refus" }), bouton("close", fermer, "discret"));
    return attente;
  }
  // Chiffré (« allumer »), le prix est la phrase des nombres — ce qu'il va juger — et ce que le geste
  // engage passe au survol (ticket 906). Sinon, il se dit en une ligne ; le reste, et d'où c'est tiré, au survol.
  let phrase;
  let aide;
  if (rendu.chiffrer === true && ALLUMAGE !== undefined) {
    phrase = compte === undefined ? ALLUMAGE.enCours : compte === null ? ALLUMAGE.parti : "sans" in compte ? "the count could not be read" : compte.dit;
    const lu = compte === undefined || compte === null ? "" : `according to ${geste(projet, ALLUMAGE.commande)}, run for you on opening — read at ${heureDe(compte.a)}`;
    const raison = compte === undefined || compte === null || !("sans" in compte) ? "" : [compte.sans, compte.obtenu].filter((texte) => texte !== "").join("\n");
    aide = [...rendu.prix, lu, raison].filter((texte) => texte !== "").join("\n");
  } else {
    const [prix = "", ...suite] = rendu.prix;
    const source = rendu.lu === undefined ? [] : [`according to ${geste(projet, "facts")}, read at ${heureDe(rendu.lu)}`];
    phrase = prix;
    aide = [...suite, ...source].join("\n");
  }
  // Chiffrée, la confirmation n'écrit que sa phrase de prix : ce que chaque réponse engage passe au
  // survol de son bouton, pas à côté de lui (ticket 906).
  return confirmationDeGeste(
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
          if (partir === undefined) void ecrireGeste(id, true);
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
async function ecrireGeste(id, oui) {
  const projet = courant;
  if (projet === undefined) return;
  nonEcrit = nonEcritSecond = "";
  gesteRate = undefined;
  /** @param {string} raison */
  const rate = (raison) => {
    nonEcritSecond = raison;
    gesteRate = { texte: raison, rejouer: () => void ecrireGeste(id, oui) };
  };
  try {
    const rendu = await brigade.geste(projet.nom, id, oui);
    if (rendu === undefined) return montrer();
    // Le chef a pu changer d'espace entre-temps : le second de ce projet le garde.
    if ("refus" in rendu) rate(rendu.refus);
    else {
      garder(projet.nom, rendu);
      if (rendu.nonParti === true) rate(rendu.note);
    }
  } catch (erreur) {
    rate(`nothing sent: ${erreur instanceof Error ? erreur.message : String(erreur)}`);
  }
  montrer();
}

// Un geste confirmé qui n'a rien envoyé ne se perd pas dans la petite note du second : le centre le dit en une
// phrase, le détail au survol, et un bouton rejoue le même geste.
/** @param {{ texte: string, rejouer: () => void }} rate */
function poserGesteRate({ texte, rejouer }) {
  const tete = (texte.split(/ — |: |\n|`/)[0] ?? texte).trim();
  const phrase = document.createElement("span");
  phrase.textContent = `nothing was sent to the second: ${tete}`;
  phrase.title = texte;
  const encore = bouton(REESSAYER, rejouer);
  encore.dataset.reessayer = "";
  return [phrase, encore];
}

// La page cliquée s'ouvre par-dessus le rail ; recliquée, elle se referme, et le rail revient tel qu'il était.
/** @param {string} id */
function activer(id) {
  nonEcrit = "";
  if (courant === undefined) return montrer();
  if (laisse.get(courant.nom) === id) laisse.delete(courant.nom);
  else laisse.set(courant.nom, id);
  montrer();
}

// À droite, l'onglet d'un shell le montre à la place du second ; celui du second le rend. Ni l'un
// ni l'autre ne se ferme : caché, un terminal garde ce qu'il avait reçu. Celui montré prend le clavier.
/** @param {number | undefined} id */
function montrerADroite(id) {
  if (courant === undefined) return montrer();
  if (id === undefined) aDroite.delete(courant.nom);
  else aDroite.set(courant.nom, id);
  aFocaliser = id ?? secondDuCourant()?.terminal.id;
  montrer();
}

// Rail ou Stations (ticket 1184) : l'onglet choisi est montré, et retenu pour ce projet. Une page ouverte par-dessus se
// referme, la fiche aussi ; le second, à droite, ne bouge pas.
/** @param {string} id */
function choisirOnglet(id) {
  if (courant === undefined) return;
  retenir(courant.nom, id);
  if (id === STATIONS) enregistreesARelire = true;
  laisse.delete(courant.nom);
  nonEcrit = "";
  if (ouverte !== undefined) fermerFiche();
  montrer();
}

// Settings s'ouvre par-dessus le rail. Recliqué, il se referme.
/** @param {string} id */
function activerRubrique(id) {
  const rubrique = RUBRIQUES.find((candidate) => candidate.id === id);
  if (rubrique === undefined) return;
  nonEcrit = "";
  if (courant === undefined) return montrer();
  if (rubriqueDe(laisse.get(courant.nom))?.id === id) laisse.delete(courant.nom);
  else laisse.set(courant.nom, rubrique.defaut);
  montrer();
}

// Seul l'onglet de contenu affiché est lu sur la box : en changer, passer à un
// terminal ou quitter l'espace arrête sa lecture. Rien ne reste de l'onglet d'avant.
// La page des coûts de l'app, ou celle des ratios, tient lieu d'onglet, l'espace fermé : elle lit la box de chaque projet.
function lireOnglet() {
  const relaye = ONGLETS.find(({ id }) => id === lue());
  const page = courant === undefined && !ajoute ? pageDeLApp : undefined;
  const voulu = page !== undefined ? JSON.stringify(["", page]) : courant === undefined || relaye === undefined ? "" : JSON.stringify([courant.nom, relaye.id]);
  if (voulu === suivi) return;
  suivi = voulu;
  if (courant !== undefined && relaye !== undefined && !reglagesMontres()) attendre(courant, luOnglet, lectureOnglet);
  ongletDemande = page ?? relaye?.id;
  brigade.onglet(courant?.nom, ongletDemande, ++demandeOnglet);
}

/** @param {Terminal} terminal */
function recevoir(terminal) {
  vue(terminal.id).terminal = terminal;
  // Un second qui ne part pas, ou repart : la mise en place le dit (ticket 3166).
  if (terminal.genre === "second" && courant?.nom === terminal.projet) poserLeProjetAPreparer();
}

// « + shell » demande où ouvrir : ce poste, la box, ou une station du projet. Là où il n'y a que ce
// poste, rien n'est à choisir : le shell s'y ouvre. Recliqué, le choix se referme.
async function ouvrirShell() {
  const projet = courant;
  if (projet === undefined) return;
  if (choixDeMachine?.projet === projet.nom) {
    choixDeMachine = undefined;
    return montrer();
  }
  const machines = await brigade.machines(projet.nom);
  if (machines.length === 1 && machines[0] !== undefined) return ouvrirSur(projet.nom, machines[0].id);
  choixDeMachine = { projet: projet.nom, machines };
  montrer();
}

// Le shell s'ouvre sur la machine choisie, dans une session qui lui survivra.
/** @param {string} projet @param {string} machine */
async function ouvrirSur(projet, machine) {
  choixDeMachine = undefined;
  nonEcritSecond = "";
  const rendu = await brigade.shell(projet, machine);
  if ("refus" in rendu) nonEcritSecond = rendu.refus;
  // Le chef a pu changer d'espace pendant que le shell s'ouvrait : il attend dans le sien.
  else garder(projet, rendu);
  montrer();
}

// Fermer le shell montré : son onglet s'en va, et sa session avec — ou la note dit pourquoi elle reste.
fermerShell.addEventListener("click", async () => {
  const montre = montreADroite()?.terminal;
  if (montre === undefined || montre.genre !== "shell") return;
  nonEcritSecond = "";
  const rendu = await brigade.fermerShell(montre.id);
  if ("refus" in rendu) nonEcritSecond = rendu.refus;
  montrer();
});

// Échap referme le choix de la machine, sans rien ouvrir.
listeMachines.addEventListener("keydown", (evenement) => {
  if (evenement.key !== "Escape") return;
  choixDeMachine = undefined;
  montrer();
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
const AU_TELEPHONE = "GitHub was reached, and did not give this project's queue as the app expects. This phone tries again every 30 s.";
const GESTE = [
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
/** @param {string} nom */
const inconnu = (nom) =>
  [
    "The station was reached, and its step does not know this project: what it said about it is above.",
    `The app gave it “${nom}” — the “nom” of the project in ${configuration.chemin}. The station must serve it under this name.`,
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
/** @param {Projet} projet */
const commandeManque = (projet) => [
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
/** @param {Projet} projet */
const sansBord = (projet) => [
  `Nothing could be set apart: the output of ${geste(projet, "status")} lacks the block the app can take — a single line starting with \`attend\`, a single \`fin attend\` line.`,
  "This is not “nothing awaits you”: what awaits you, if anything, is in the output below, in full.",
].join("\n");

// Ce qui attend le chef, en tête et à part : le bloc de `status`, tel qu'il l'a
// écrit — c'est lui qui dit quand rien n'attend. Sans bloc, l'app dit qu'elle n'a rien pris.
/** @param {Projet} projet @param {string | undefined} attend @param {boolean} [accueil] */
function aPart(projet, attend, accueil = false) {
  const cree = document.createElement("section");
  cree.className = "attend";
  cree.dataset.pris = String(attend !== undefined);
  if (accueil) cree.append(bloc("h3", "what awaits you"), attend === undefined ? ligneErreur(document, "what awaits you could not be set apart", sansBord(projet)) : bloc("pre", attend));
  else cree.append(bloc("h3", `what awaits you — the \`attend\` block of ${geste(projet, "status")}`), attend === undefined ? propos(sansBord(projet)) : bloc("pre", attend));
  return cree;
}

// Une lecture en échec se dit en une ligne, dans les mots de l'app ; ce que la station a
// répondu, et ce que l'app en dit de plus (le code de sortie choisit le renvoi, le texte n'est jamais
// traduit), se lisent au survol. Rien de technique n'est écrit à plat.
/** @param {Projet} projet @param {import("../box.ts").Echec & { projet: string }} recue @param {string} plusPilotable ce qui se dit d'une box jointe dont le code ne dit aucun cas */
function obtenuEnUneLigne(projet, recue, plusPilotable) {
  const [ligne, suite] =
    recue.cas === "projet-inconnu"
      ? ["the station does not know this project", inconnu(recue.projet)]
      : recue.cas === "sans-droit"
        ? ["your account lacks the right to this action on the station", SANS_DROIT]
        : recue.cas === "commande-manque"
          ? ["a command is missing on the station", commandeManque(projet)]
          : recue.cas === "node-inapte"
            ? ["the station's node does not suit the runtime", NODE_INAPTE]
            : recue.atteinte
              ? ["the station answered, but not as the app expects", plusPilotable]
              : ["the station did not answer", undefined];
  const dite = ligneErreur(document, ligne, suite === undefined ? recue.erreur : `${recue.erreur}\n\n${suite}`);
  // Ce que la station a dit, sans la commande lancée : la panne du signalement, en quelques mots.
  const dit = recue.erreur.split("\n").filter((une) => une.trim() !== "" && !une.startsWith("$ ")).join(" ");
  dite.append(...signalement.poser({ projet: projet.nom, reference: { ligne }, panne: dit === "" ? `${projet.nom}: ${ligne}` : `${projet.nom}: ${ligne} — ${dit}` }));
  return [dite];
}

// Ce qu'une lecture donne à voir, dans le panneau de l'espace, à côté du terminal et dans
// un onglet de contenu : un des sept états, dit en toutes lettres, et dessous ce
// que l'app a obtenu. Celle d'un onglet n'a rien de mis à part : ce n'est pas `status`.
/**
 * @param {Montree | Lecture} recue @param {HTMLElement} tete @param {HTMLElement} corps
 */
function rendre(recue, tete, corps) {
  // Le projet a pu quitter le fichier depuis la demande : il n'y a plus rien à lui écrire.
  const projet = projetDe(recue.projet);
  if (projet === undefined) return;
  const heure = heureDe(recue.a);
  if ("sorties" in recue) {
    const mise = "attend" in recue;
    tete.dataset.etat = "pilotable";
    tete.textContent = `${mise ? "controllable — " : ""}read at ${heure}`;
    // Ce que la box a dit n'est pas montré : l'état se lit dans la phrase de la tête ; seul le bloc `attend`, mis à part, reste.
    corps.replaceChildren(...(mise ? [aPart(projet, recue.attend, true)] : []));
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
    tete.prepend(marqueDePastille(document, ton));
  }
  if ("erreur" in recue) corps.replaceChildren(...obtenuEnUneLigne(projet, recue, GESTE));
}

// Ce qu'une vérification a donné. En tête, son verdict en une phrase ; dessous, une ligne par
// manque — qui agit, et pour le chef le bouton qui fait le geste ou la commande exacte, à copier ;
// les lignes « à savoir » à part, plus discrètes. Sans verdict, le même cas et le même renvoi que sous `status`.
/**
 * @param {Projet} projet @param {Guide["verification"]} verification
 * @param {(texte: string, geste: () => Promise<unknown>) => HTMLButtonElement} action
 * @param {boolean} [avecTitre] faux : la phrase est déjà dite au-dessus (une alerte plantée la porte en titre)
 * @returns {HTMLElement[]}
 */
function poserVerdict(projet, verification, action, avecTitre = true) {
  if (verification === undefined) return [];
  const tete = bloc("p", verification.titre);
  tete.className = "verdict";
  tete.dataset.verdict = verification.etat;
  if (verification.etat === "en-cours") return [tete];
  if (verification.etat === "sans-verdict") {
    tete.textContent = `${verification.titre} — verified at ${heureDe(verification.a)}`;
    return [tete, ...obtenuEnUneLigne(projet, { ...verification.echec, projet: projet.nom }, GESTE)];
  }
  const posee = document.createElement("div");
  posee.className = "verification";
  if (avecTitre) posee.append(tete);
  if (verification.etat === "illisible") {
    posee.append(...verification.suite.map((ligne) => bloc("p", ligne)));
    return [posee];
  }
  if (verification.manques.length > 0) {
    const manques = document.createElement("ul");
    manques.className = "manques";
    manques.append(...verification.manques.map((manque) => poserManque(projet, manque, action)));
    posee.append(manques);
  }
  if (verification.panne !== null) posee.append(bloc("p", verification.panne));
  if (verification.aSavoir.length > 0) {
    const aSavoir = document.createElement("div");
    aSavoir.className = "a-savoir";
    aSavoir.append(bloc("strong", "Good to know — nothing waits on these"));
    for (const ligne of verification.aSavoir) aSavoir.append(ligne.geste === null ? bloc("p", ligne.texte) : ditEtAide("p", ligne.texte, ligne.geste));
    posee.append(aSavoir);
  }
  return [posee];
}

// Un manque : qui agit, ce qui manque en mots simples, et ce que le chef a pour le lever — un
// bouton quand l'app fait le geste, sinon la commande exacte, au survol. Ce que brigade
// lève seule n'a rien de tout cela.
/**
 * @param {Projet} projet @param {import("../service.ts").LigneDeManque} manque
 * @param {(texte: string, geste: () => Promise<unknown>) => HTMLButtonElement} action
 */
function poserManque(projet, manque, action) {
  const ligne = document.createElement("li");
  ligne.dataset.acteur = manque.acteur;
  ligne.append(bloc("strong", `${manque.qui}:`), " ", manque.texte);
  const { geste } = manque;
  if (geste === null) return ligne;
  if ("action" in geste) {
    const id = geste.action;
    if (id === "init") ligne.append(action(geste.libelle, () => amorcerService(projet)));
    else if (id === "protection") ligne.append(action(geste.libelle, () => brigade.proteger(projet.nom)));
    // Les stations et les décisions se choisissent sur la page du projet : la ligne n'a pas de bouton.
    return ligne;
  }
  // Ni commande ni phrase de mode d'emploi à plat : elles se lisent au survol.
  ligne.append(survol(document, "commande" in geste ? geste.commande : geste.dit));
  return ligne;
}

/** @param {Projet} projet */
async function lireService(projet) {
  retenirDeclarees(await brigade.service(projet.nom));
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
/** @param {Projet} projet */
function reposerLesStations(projet) {
  if (courant?.nom === projet.nom) reposerLOngletStations();
}

// Les gestes des réglages d'une station déclarée, dans « Details » de sa carte (ticket 2488) : un plafond ou des capacités
// changés partent aussitôt ; la case des tickets ordinaires de ce poste s'écrit comme dans Settings.
/** @param {Projet} projet @returns {import("./projet/stations/ReglagesStation.js").Gestes} */
function gestesDesReglages(projet) {
  return {
    appliquer: (nom, cle, voulu) => void changerLaStation(projet, nom, cle, voulu),
    ordinaires: (pris) => void reglerLesOrdinairesIci(projet, pris),
  };
}
// Le changement part — la rangée `cle` dit qu'il est en route —, puis elle dit ce qu'il a rendu ; refusé, la saisie revient
// à la déclaration en vigueur. La déclaration relue arrive par `surGuide`, et le bloc s'y repose.
/** @param {Projet} projet @param {string} nom @param {string} cle @param {import("../service.ts").StationVoulue} voulu */
async function changerLaStation(projet, nom, cle, voulu) {
  const saisie = saisiesDesStations.get(projet.nom)?.get(nom);
  if (saisie === undefined || saisie.envoi) return;
  saisie.envoi = true;
  saisie.ou = cle;
  saisie.rendu = undefined;
  reposerLOngletStations();
  /** @type {import("../service.ts").StationChangee} */
  let rendu;
  try {
    rendu = await brigade.changerUneStation(projet.nom, nom, voulu);
  } catch (erreur) {
    rendu = { refus: "Nothing was changed: the app did not answer", detail: erreur instanceof Error ? erreur.message : String(erreur) };
  }
  saisie.envoi = false;
  saisie.rendu = rendu;
  if ("refus" in rendu) revenir(saisie, declarees.get(projet.nom)?.declarees.find((lue) => lue.nom === nom));
  if (courant?.nom === projet.nom) reposerLOngletStations();
}
// Les projets dont la case des tickets ordinaires de ce poste est en route, sur « Station settings ».
/** @type {Set<string>} */
const ordinairesEnCours = new Set();
// La case des tickets ordinaires de ce poste : la même écriture que Settings, la limite de cooks gardée telle qu'elle est.
/** @param {Projet} projet @param {boolean} pris */
async function reglerLesOrdinairesIci(projet, pris) {
  const lu = ordinairesVus.get(projet.nom);
  if (lu === undefined || !lu.reglable || ordinairesEnCours.has(projet.nom)) return;
  ordinairesEnCours.add(projet.nom);
  reposerLOngletStations();
  /** @type {string | undefined} */
  let refus;
  try {
    refus = await brigade.reglerOrdinaires(projet.nom, pris, lu.limite);
  } catch (erreur) {
    refus = `nothing was written: ${erreur instanceof Error ? erreur.message : String(erreur)}`;
  } finally {
    ordinairesEnCours.delete(projet.nom);
  }
  ordinairesRefuses = { projet: projet.nom, refus: refus ?? "" };
  ordinairesPose = "";
  // Relue, l'option se repose à la valeur en vigueur — celle d'avant, quand le changement est refusé.
  if (courant?.nom === projet.nom) await poserOrdinaires(projet);
}

// « Cook it on a station that has it » (ticket 1511) ouvre, sur Stations, « Details » de la carte de la station de ce poste :
// la capacité qui manque y est offerte, décochée, à côté de celles qu'elle déclare — et ce que cet ordinateur sait déclarer,
// lu comme pour « + station » (ticket 1307). La cocher la déclare : chaque case s'applique dès qu'elle change (ticket 2920).
/** @type {{ projet: string, nom: string } | undefined} */
let capaciteOfferte;
/** @param {Projet} projet @param {string} nom @param {string} [appelee] */
async function offrirLaCapacite(projet, nom, appelee) {
  const lues = declarees.get(projet.nom);
  const station = lues?.declarees.find((lue) => lue.nom === nom);
  if (lues === undefined || station === undefined) return;
  const saisies = saisiesDesStations.get(projet.nom) ?? new Map();
  saisiesDesStations.set(projet.nom, saisies);
  const saisie = saisieDe(saisies, station, lues);
  saisie.choix = choixDeCapacites(station, lues, [], appelee);
  capaciteOfferte = { projet: projet.nom, nom };
  reposerLOngletStations();
  const defauts = await defautsDeCetOrdinateur(projet.nom);
  if ("refus" in defauts || saisies.get(nom) !== saisie) return;
  saisie.choix = choixDeCapacites(station, lues, defauts.capacites, appelee);
  if (courant?.nom === projet.nom) reposerLOngletStations();
}

// Un geste de l'installation a rendu un terminal — le second, pour la session d'init ; un
// shell, pour le démarrage — ou la raison pour laquelle rien n'est fait. Le terminal est
// montré, à droite : c'est sa note qui dit ce qui a été lancé, ou écrit. La raison se lit là
// où il se serait montré : à droite, sous les onglets des terminaux.
/** @param {Projet} projet @param {Terminal | { refus: string }} rendu */
function suivreGeste(projet, rendu) {
  nonEcrit = nonEcritSecond = "";
  gesteRate = undefined;
  if (!("refus" in rendu)) garder(projet.nom, rendu);
  else nonEcritSecond = rendu.refus;
  if (courant?.nom === projet.nom) montrer();
}

/** @param {Projet} projet */
async function amorcerService(projet) {
  suivreGeste(projet, await brigade.amorcer(projet.nom));
}

// Une ligne de Settings (ticket 1700) : la rangée de réglage de l'app (composants/reglage, ticket 2920) — son nom, sa
// valeur en vigueur, son contrôle, qui s'applique dès qu'il change ; puis, sous elle, ce que le contrôle a ouvert ou rendu
// (une confirmation, un refus). `niveau` : sa clé, et la marque de son niveau (niveaux.js), posée à côté de son nom.
/** @param {string} nom @param {(Node | string)[]} valeur @param {HTMLElement[]} controle @param {HTMLElement[]} [dessous] @param {{ cle: string, niveau: HTMLElement }} [niveau] */
function rangeeDeReglage(nom, valeur, controle, dessous = [], niveau) {
  return rangeeDeLaFamille(document, { nom, valeur, controle, dessous, ...niveau });
}

// Un refus, sous la ligne qu'il concerne.
/** @param {string} texte @returns {HTMLElement[]} */
function refusDeReglage(texte) {
  if (texte === "") return [];
  return [ligneErreur(document, texte, "", { classe: "dit refus" })];
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
  videProjet.hidden = !reglagesDuProjet.hidden || !arreterCuisine.hidden;
  videProjet.textContent = videProjet.hidden ? "" : "nothing to set: no station reads this project";
}
// Le projet dans ton app (ticket 1700) : une ligne du groupe du projet — il est dans la barre, et « Remove from the app »
// l'en retire ; rien ne part vers sa station, ce que le survol du bouton dit. Le clic demande d'abord un « yes » : un
// projet ne se retire pas d'un clic perdu. Refusé, la raison se lit sous la ligne.
/** @param {Projet} projet @param {Retrait | undefined} pose */
function poserRetrait(projet, pose) {
  // Le chef a pu changer d'espace pendant que le process principal répondait.
  if (courant?.nom !== projet.nom) return;
  retrait.hidden = pose === undefined;
  if (pose === undefined) return retrait.replaceChildren();
  if (retraitDeLApp !== projet.nom) retraitDeLApp = "";
  if (nonRetire.projet !== projet.nom) nonRetire = { projet: "", refus: "" };
  const { libelle, lignes } = pose.retirer;
  const demande = bouton(`${libelle}…`, () => {
    retraitDeLApp = projet.nom;
    poserRetrait(projet, pose);
  }, "danger");
  demande.title = lignes.join("\n");
  const controle =
    retraitDeLApp === projet.nom
      ? [bouton(OUI(`remove “${projet.nom}” from the app`), () => void retirerDeLApp(projet), "danger"), bouton(ANNULER, () => ((retraitDeLApp = ""), poserRetrait(projet, pose)), "discret")]
      : [demande];
  retrait.replaceChildren(rangeeDeReglage("Remove this project from the app's sidebar", [], controle, refusDeReglage(nonRetire.refus)));
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
/** @param {Projet} projet */
function poserCouleurs(projet) {
  if (couleurRefusee.projet !== projet.nom) couleurRefusee = { projet: "", refus: "" };
  couleurs.hidden = false;
  /** @param {"onglet" | "accent"} role @param {string} libelle */
  const rangee = (role, libelle) => {
    const portee = projet.couleurs?.[role];
    const nommee = PALETTE.find(({ valeur }) => valeur === portee)?.nom;
    const pastilles = PALETTE.map(({ nom, valeur }) => {
      const cree = cliquable("", () => void colorer(projet, role, nom));
      cree.className = "teinte";
      cree.style.setProperty("--teinte", valeur);
      cree.title = cree.ariaLabel = `${libelle}: ${nom}`;
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
    const libre = document.createElement("input");
    libre.type = "color";
    libre.value = portee ?? PALETTE[0]?.valeur ?? "";
    libre.title = libre.ariaLabel = `${libelle}: another color…`;
    libre.addEventListener("change", () => void colorer(projet, role, libre.value));
    const autre = document.createElement("label");
    autre.className = "libre";
    autre.append(libre, "other…");
    const palette = document.createElement("span");
    palette.className = "rangee";
    palette.append(...pastilles, autre);
    const proche = projet.proches?.[role];
    return rangeeDeReglage(libelle, [bloc("span", portee === undefined ? PAS_ENCORE("color") : (nommee ?? portee))], [palette], proche === undefined ? [] : refusDeReglage(`${libelle}: ${proche}`), { cle: "couleurs", niveau: niveauDe(document, "couleurs") });
  };
  couleurs.replaceChildren(rangee("onglet", "tab, in the bar"), rangee("accent", "accent, in the space"), ...refusDeReglage(couleurRefusee.refus));
}

// Le sigle du projet, dans le groupe du projet de Settings (ticket 1983) : celui que sa case écrit — tiré de son nom, ou
// le tien —, et le champ où l'écrire. Écrit, il part dès que le champ change ; vidé, ou par « back to its name », la
// case reprend celui que l'app tire de son nom. Refusé, la raison se lit sous la ligne.
/** @param {Projet} projet */
function poserSigle(projet) {
  if (sigleRefuse.projet !== projet.nom) sigleRefuse = { projet: "", refus: "" };
  sigle.hidden = false;
  const champ = document.createElement("input");
  champ.className = "mono";
  champ.value = projet.sigle ?? "";
  champ.placeholder = projet.etiquette;
  champ.autocomplete = "off";
  champ.spellcheck = false;
  champ.title = champ.ariaLabel = "your label for its tile: 3 characters at most — empty, the app derives one from its name";
  champ.addEventListener("change", () => void siglerProjet(projet, champ.value.trim() === "" ? null : champ.value));
  const controle = projet.sigle === undefined ? [champ] : [champ, bouton("back to its name", () => void siglerProjet(projet, null))];
  const vaut = bloc("span", projet.etiquette);
  vaut.className = "mono";
  sigle.replaceChildren(rangeeDeReglage("Label in the bar", [vaut, ` · ${projet.sigle === undefined ? "from its name" : "yours"}`], controle, refusDeReglage(sigleRefuse.refus), { cle: "sigle", niveau: niveauDe(document, "sigle") }));
}

// Un sigle écrit : le process principal l'écrit dans le fichier des projets, et il revient par `surConfiguration` — la
// case le prend alors. `null` : le sigle écrit est retiré. Refusé, la raison se lit dessous.
/** @param {Projet} projet @param {string | null} voulu */
async function siglerProjet(projet, voulu) {
  const refus = await brigade.changerSigle(projet.nom, voulu);
  sigleRefuse = { projet: projet.nom, refus: refus ?? "" };
  if (courant?.nom === projet.nom) poserSigle(courant);
}

// L'état de la cuisine dans la barre des menus du Mac, la zone de notification de Windows (ticket 3269) : une ligne de
// toi, la même dans les Settings de chaque projet — elle vaut pour toute l'app. Un interrupteur la pose ou la retire ; le
// process principal l'écrit dans le fichier des projets, et elle revient par `surConfiguration`. Le téléphone n'en a pas.
function poserBarreDeMenus() {
  if (telephone !== undefined || brigade.changerBarreDeMenus === undefined) {
    barreDeMenus.hidden = true;
    return barreDeMenus.replaceChildren();
  }
  barreDeMenus.hidden = false;
  const allumee = configuration.barreDeMenus !== false;
  const ou = POSTE.mac ? "menu bar" : "notification area";
  const bascule = interrupteurDeLApp(document, { texte: allumee ? "on" : "off", allume: allumee, libelle: `Show the kitchen's state in the ${ou}` }, (voulue) => void reglerBarreDeMenus(voulue));
  const aide = `how many cooks are working and how many questions wait for you — "3 cooking · 1 for you" — in the ${ou}; a click lists the questions, and opens the app on the one you pick. For the whole app, not this project only`;
  barreDeMenus.replaceChildren(rangeeDeReglage(POSTE.mac ? "Menu bar" : "Notification area", [bloc("span", allumee ? "shown" : "hidden"), survol(document, aide)], [bascule], refusDeReglage(barreDeMenusRefusee), { cle: "barre-de-menus", niveau: niveauDe(document, "barre-de-menus") }));
}
/** @param {boolean} voulue */
async function reglerBarreDeMenus(voulue) {
  const refus = await brigade.changerBarreDeMenus?.(voulue);
  barreDeMenusRefusee = refus ?? "";
  poserBarreDeMenus();
}

// Une couleur choisie : le process principal l'écrit dans le fichier des projets, et elle revient
// par `surConfiguration` — la barre et l'espace la prennent alors. Refusée, la raison se lit dessous.
/** @param {Projet} projet @param {"onglet" | "accent"} role @param {string} couleur une teinte de la palette par son nom, ou une couleur libre `#rrggbb` */
async function colorer(projet, role, couleur) {
  const refus = await brigade.colorer(projet.nom, role, couleur);
  couleurRefusee = { projet: projet.nom, refus: refus ?? "" };
  if (courant?.nom === projet.nom) poserCouleurs(courant);
}

// Les réglages du projet, sous Paramètres (ticket 1309) : lus là où sa cuisine tourne, à l'ouverture du projet. Un
// projet qui ne cuit nulle part n'a pas de runtime pour les lire : la section ne se pose pas.
/** @param {Projet} projet */
async function lireLesReglages(projet) {
  if (!seLit(projet)) {
    reglagesLus.delete(projet.nom);
    return poserLesReglagesDuProjet(projet);
  }
  /** @type {import("../reglages-du-projet.ts").LectureDesReglages | undefined} */
  let recue;
  try {
    recue = await brigade.reglagesDuProjet(projet.nom);
  } catch (erreur) {
    recue = { sans: NON_ATTEINT("settings"), detail: erreur instanceof Error ? erreur.message : String(erreur) };
  }
  // Un pont qui ne porte pas la lecture — un téléphone — ne rend rien : la section ne se pose pas.
  if (recue === undefined) reglagesLus.delete(projet.nom);
  else reglagesLus.set(projet.nom, recue);
  if (courant?.nom !== projet.nom) return;
  poserLesReglagesDuProjet(projet);
}

// L'état d'un réglage du projet, et ce que ses gestes en font.
/** @param {Projet} projet @param {import("../reglages-du-projet.ts").Cle} cle */
function gestesDuReglage(projet, cle) {
  const etats = etatsDesReglages.get(projet.nom) ?? new Map();
  etatsDesReglages.set(projet.nom, etats);
  return {
    etat: etats.get(cle),
    /** @param {string | { modele: string, effort: string }} choisi */
    choisir: (choisi) => void etats.set(cle, { ...etats.get(cle), choisi }),
    /** @param {import("../reglages-du-projet.ts").ChoixDeReglage} choix @param {string} dit */
    proposer: (choix, dit) => void proposerUnReglage(projet, choix, dit),
    /** @param {string} url */
    ouvrir: (url) => void brigade.ouvrirLaProposition(url),
  };
}

/** @param {Projet} projet */
function poserLesReglagesDuProjet(projet) {
  const etats = etatsDesReglages.get(projet.nom) ?? new Map();
  etatsDesReglages.set(projet.nom, etats);
  const options = {
    lecture: reglagesLus.get(projet.nom),
    etats,
    choisir: (/** @type {import("../reglages-du-projet.ts").Cle} */ cle, /** @type {string | { modele: string, effort: string }} */ choisi) => gestesDuReglage(projet, cle).choisir(choisi),
    proposer: (/** @type {import("../reglages-du-projet.ts").ChoixDeReglage} */ choix, /** @type {string} */ dit) => void proposerUnReglage(projet, choix, dit),
    ouvrir: (/** @type {string} */ url) => void brigade.ouvrirLaProposition(url),
  };
  // Les rangées de l'artboard d'abord ; celles qu'il ne dessine pas suivent, sous le sigle et la couleur.
  for (const [conteneur, groupe] of /** @type {const} */ ([[reglagesDuProjet, "dessines"], [reglagesEnPlus, "en-plus"]])) {
    const pose = poserLesReglages(document, { ...options, groupe });
    conteneur.hidden = pose === null;
    conteneur.replaceChildren(...(pose === null ? [] : [pose]));
  }
}

// Un réglage du projet changé : le changement part par le process principal (reglages-du-projet.ts), qui attend que le
// runtime du projet ait ouvert la PR. Tant qu'il n'a pas répondu, la rangée dit qu'il s'y met. Ouverte, la PR se dit sous
// la rangée ; refusé, le refus — et le champ revient à la valeur en vigueur, qui ne change pas tant que la PR n'est pas
// mergée.
/** @param {Projet} projet @param {import("../reglages-du-projet.ts").ChoixDeReglage} choix @param {string} dit */
async function proposerUnReglage(projet, choix, dit) {
  const etats = etatsDesReglages.get(projet.nom) ?? new Map();
  etatsDesReglages.set(projet.nom, etats);
  if (etats.get(choix.cle)?.enCours === true) return;
  etats.set(choix.cle, { ...etats.get(choix.cle), enCours: true, dit: undefined });
  const reposer = () => {
    if (courant?.nom !== projet.nom) return;
    poserLesReglagesDuProjet(projet);
  };
  reposer();
  /** @type {import("../reglages-du-projet.ts").RenduDuReglage} */
  let rendu;
  try {
    rendu = (await brigade.proposerUnReglage(projet.nom, choix)) ?? { refus: "nothing was proposed: nothing was sent", detail: SANS_PONT };
  } catch (erreur) {
    rendu = { refus: "nothing was proposed: nothing was sent", detail: erreur instanceof Error ? erreur.message : String(erreur) };
  }
  etats.set(choix.cle, { dit: "pr" in rendu ? { ...rendu, valeur: dit } : rendu });
  reposer();
}

// Les tickets ordinaires de cet ordinateur, sous cette machine dans Settings (ticket 1700) : deux lignes — les prendre
// ou non, et combien de cooks à la fois —, ce que ça implique au survol, et, quand la station dit son bac à sable
// indisponible, pourquoi ce poste n'en prend aucun, sous la première. Le process principal décide du bloc
// (ordinaires.ts) : hors d'un Mac, il n'est pas réglable, et rien ne se pose.
let ordinairesRefuses = { projet: "", refus: "" };
// Ce qui est posé : une lecture qui n'a rien changé ne le repose pas — le chef peut être en train d'écrire la limite.
let ordinairesPose = "";
/** @param {Projet} projet */
async function poserOrdinaires(projet) {
  const recu = await brigade.ordinaires(projet.nom);
  // L'onglet Stations dit l'option sur la station de ce poste (ticket 2488), et le bac à sable de la station locale le
  // même (ticket 2489).
  ordinairesVus.set(projet.nom, recu);
  const locale = stationLocaleLue.projet === projet.nom && JSON.stringify(stationLocaleLue.ordinaires) !== JSON.stringify(recu ?? null);
  if (locale) stationLocaleLue.ordinaires = recu ?? null;
  // Le chef a pu ouvrir un autre projet pendant la lecture.
  if (courant?.nom !== projet.nom) return;
  if (locale) reposerLaStationLocale(stationLocaleLue);
  else reposerLOngletStations();
  // Hors d'un Mac, ils ne se règlent pas : il n'y a rien à poser — le groupe dit qu'il n'a rien à régler.
  if (recu === undefined || recu.reglable === false) {
    ordinaires.hidden = true;
    ordinairesPose = "";
    ordinaires.replaceChildren();
    return poserLesGroupes();
  }
  if (ordinairesRefuses.projet !== projet.nom) ordinairesRefuses = { projet: "", refus: "" };
  const pose = JSON.stringify([projet.nom, recu, ordinairesRefuses.refus]);
  if (pose === ordinairesPose) return;
  ordinairesPose = pose;
  ordinaires.ariaLabel = `Ordinary tickets on ${POSTE.nom}`;
  ordinaires.hidden = false;
  const limite = document.createElement("input");
  limite.type = "number";
  limite.min = "1";
  limite.step = "1";
  limite.value = recu.limite === null ? "" : String(recu.limite);
  limite.ariaLabel = `Cooks ${POSTE.nom} runs at once`;
  const regler = async (/** @type {boolean} */ prise) => {
    const voulue = limite.value.trim() === "" ? null : Number(limite.value);
    const refus = await brigade.reglerOrdinaires(projet.nom, prise, voulue);
    ordinairesRefuses = { projet: projet.nom, refus: refus ?? "" };
    ordinairesPose = "";
    if (courant?.nom === projet.nom) void poserOrdinaires(projet);
  };
  const option = interrupteurDeLApp(
    document,
    { texte: recu.actif ? "on" : "off", allume: recu.actif, libelle: `Take the ordinary tickets on ${POSTE.nom}` },
    (prise) => void regler(prise),
  );
  limite.addEventListener("change", () => void regler(option.ariaChecked === "true"));
  // Ce que l'option implique est au survol de sa valeur ; un bac à sable indisponible, sous sa ligne.
  // Leur niveau, celui de la table (niveaux.js) : le groupe le dit, l'étiquette reste sur la ligne.
  const prendre = rangeeDeReglage("ordinary tickets", [bloc("span", recu.actif ? "taken" : "not taken"), survol(document, recu.explication)], [option], [...refusDeReglage(recu.indisponible ?? ""), ...refusDeReglage(ordinairesRefuses.refus)], { cle: "ordinaires", niveau: niveauDe(document, "ordinaires") });
  const combien = rangeeDeReglage("cooks at once", [bloc("span", recu.limite === null ? "no limit" : String(recu.limite))], [limite], [], { cle: "ordinaires", niveau: niveauDe(document, "ordinaires") });
  ordinaires.replaceChildren(prendre, combien);
  poserLesGroupes();
}

/** @param {Projet} projet */
async function lireRetrait(projet) {
  poserRetrait(projet, await brigade.retrait(projet.nom));
}

// Ce que l'app dit d'un projet qu'elle vient de retirer de sa liste : il n'a plus d'espace
// où le dire, c'est donc dit par-dessus l'écran, jusqu'à ce que le chef l'ait lu.
/** @param {import("../retrait.ts").Avis} dit */
function poserAvis(dit) {
  avis.replaceChildren(bloc("strong", dit.titre), ...dit.lignes.map((ligne) => bloc("p", ligne)), bouton("Got it", () => (avis.hidden = true)));
  avis.hidden = false;
}

// Le « yes » : le projet quitte l'app, et rien ne part vers sa station. Retiré, il a déjà quitté la barre par
// `surConfiguration` ; refusé, la raison se lit sous sa ligne.
/** @param {Projet} projet */
async function retirerDeLApp(projet) {
  const rendu = await brigade.retirerDeLApp(projet.nom);
  retraitDeLApp = "";
  if ("avis" in rendu) return poserAvis(rendu.avis);
  nonRetire = { projet: projet.nom, refus: rendu.refus };
  await lireRetrait(projet);
}

// Le ton de chaque état de pilotage : pilotable, vert ; joint sans l'être plus — plus pilotable,
// inconnu de la box, sans le droit, une commande ou le bon node qui manque —, jaune ; pas joint,
// rouge. Ce sont les mots que `rendre` pose déjà : rien n'est déduit de plus.
/** @type {Record<string, string>} */
const TONS_DE_PILOTAGE = { pilotable: "vert", "plus-pilotable": "jaune", inconnu: "jaune", "sans-droit": "jaune", "commande-manque": "jaune", "node-inapte": "jaune", "pas-joint": "rouge" };

// Un mot d'état et sa pastille. La couleur est celle que le mot a dans la liste
// fermée, et sa forme celle de son ton ; un mot qui n'y est pas s'affiche tel quel,
// pastille vide. Le mot reste dit par le texte voisin — et ici par le titre.
/** @param {string} mot @param {string | undefined} ton */
function pastille(mot, ton) {
  const cree = marqueDePastille(document, ton);
  cree.title = mot;
  return cree;
}

// La pastille d'un projet dans la barre : son état, lu. Sans faits, elle ne
// prend aucune couleur — elle dit, au survol, ce que l'app a obtenu à la place.
/** @param {string} nom */
function marquerPastille(nom) {
  const posee = pastilles.get(nom);
  if (posee === undefined) return;
  const tenu = tenus.get(nom);
  delete posee.dataset.ton;
  delete posee.dataset.forme;
  posee.dataset.lu = tenu === undefined ? "en-cours" : "tableau" in tenu ? "oui" : "non";
  if (tenu !== undefined && "tableau" in tenu && tenu.tableau.ton !== undefined) {
    posee.dataset.ton = tenu.tableau.ton;
    const forme = formeDe(tenu.tableau.ton);
    if (forme !== undefined) posee.dataset.forme = forme;
  }
  // La box ne répond pas : un mot, le même que la bande (alertes.ts) — ce que le dernier rail disait n'est plus lu.
  const muette = signaux.get(nom)?.etat === "injoignable";
  if (muette) {
    delete posee.dataset.ton;
    delete posee.dataset.forme;
    posee.dataset.lu = "non";
  }
  const horsLigne = horsLignes.get(nom);
  const dit = muette
    ? "unreachable"
    : horsLigne !== undefined
      ? `offline since ${heureCourte(horsLigne)}${tenu !== undefined && "tableau" in tenu ? ` — ${tenu.tableau.mot ?? tenu.tableau.etat} when last read` : ""}`
      : tenu === undefined
        ? "first read in progress…"
        : "tableau" in tenu
          ? (tenu.tableau.mot ?? tenu.tableau.etat)
          : `no facts read — ${tenu.titre}`;
  posee.textContent = muette || (tenu !== undefined && !("tableau" in tenu)) ? "!" : "";
  const entree = /** @type {HTMLElement} */ (posee.parentElement);
  entree.title = `${nom} — ${dit}`;
  entree.ariaLabel = entree.title;
}

// Le signal d'un projet sur sa case : l'urgence — toute sa cuisine attend le chef —, une alerte, ou
// « non vérifié » — jamais rien de plus sain que ce que la bande a dit. L'urgence n'est pas une
// alerte de plus : elle a son signe et sa marque. Le projet affiché n'en porte pas : sa bande est sous ses yeux.
// Cliquer le signal ouvre l'espace du projet : sa bande y est en tête, chaque alerte avec son geste
// et son prix, la plus grave d'abord (alertes.ts) — rien à chercher, un clic de plus lance le geste.
/** @param {string} nom */
function marquerSignal(nom) {
  const entree = pastilles.get(nom)?.parentElement;
  if (entree === null || entree === undefined) return;
  const signal = courant?.nom === nom ? undefined : signaux.get(nom);
  const pose = signalees.get(nom);
  if (signal === undefined) {
    pose?.remove();
    signalees.delete(nom);
    return;
  }
  const marque = pose ?? document.createElement("span");
  marque.className = "signal";
  marque.dataset.etat = signal.etat;
  marque.textContent = signal.etat === "urgence" ? "!!" : signal.etat === "alerte" ? "!" : signal.etat === "injoignable" ? "×" : "?";
  marque.title =
    signal.etat === "injoignable"
      ? `${nom}: unreachable — ${signal.dit}. Click to open ${nom}: its last reading is kept, with the gesture to try again`
      : signal.etat === "urgence"
          ? `${nom}: ${signal.dit} — urgent: the whole kitchen is waiting for you, nothing cooks until you act. Click to open ${nom}, with what it waits for and since when`
        : signal.etat === "alerte"
          ? `${nom}: ${signal.dit} — alert: something needs doing. Click to open ${nom}, with the alert, its action and its price`
          : `${nom}: ${signal.dit} — not verified: the app could not read this state, it is not a failure. Click to open ${nom}, with what could not be read`;
  marque.ariaLabel = marque.title;
  if (pose === undefined) {
    marque.addEventListener("click", (evenement) => {
      evenement.stopPropagation();
      const projet = configuration.projets.find((candidat) => candidat.nom === nom);
      if (projet !== undefined) void ouvrir(projet);
    });
    entree.append(marque);
    signalees.set(nom, marque);
  }
}

// Le signe d'un cook coincé — sans progrès depuis la moitié de son bail —, tel que `status` l'écrit en tête du bail de
// son ticket (bon.ts) : « STUCK: no progress since 31 min ». Le reste du bail est dans la fiche.
/** @param {import("../faits.ts").Carte} carte */
function coinceDit({ dit }) {
  const bail = dit.find(({ libelle }) => libelle === "lease")?.valeur;
  return bail !== undefined && /^(?:STUCK: |COINC[EÉ] : )/.test(bail) ? bail.replace(/, (?:lease|bail) .*$/, "") : undefined;
}

// Une carte du rail : son numéro, son état, son titre, puis une phrase en mots simples qui dit ce
// qui se passe et, au plus, une ligne de signal (ligne-carte.ts) ; un petit repère quand la file ne
// dit pas tout. Ce que la file dit du ticket en plus est dans sa fiche (`poserDetailsDeFiche`). Dans
// T'attend, la phrase est ce qu'on attend du chef, et son geste — une demande au second — est sur la
// fiche. Dans Livré, la phrase porte l'heure et le résumé ; ses captures restent sur la carte.
// Tout est déjà rangé par le process principal (faits.ts, bon.ts) : la vue pose. Le
// numéro s'ouvre sur l'issue : l'adresse reste au process principal, la vue nomme le ticket.
/** @param {Projet} projet @param {import("../faits.ts").Carte} carte @param {import("./composants/pastille/pastille.js").Etat} [etatDeColonne] l'état de sa colonne : un même état se dit partout par la même pastille, quel que soit le mot de la file @param {boolean} [avecStation] la station s'étiquette (Taken et Pass d'un projet à plusieurs stations ; jamais sur Cooks, où son bloc la nomme) @param {boolean} [horsColonne] une carte d'aucune des six colonnes : son mot est dit tel quel, sans l'état d'une colonne @param {boolean} [cuit] un agent y travaille en ce moment, d'une lecture qui le dit encore vrai : la poêle (ticket 2984) */
function poserBon(projet, carte, etatDeColonne, avecStation = false, horsColonne = false, cuit = false) {
  const { ticket, etat, mot: motDEtat, ton, titre, ouvrable, attendu, attend, pr } = carte;
  // Le bon et sa tête (composants/bon) ; sur une carte qui attend le chef, la carte d'attente (composants/carte-attente), qui
  // ajoute à la tête la pastille « awaiting you » : elle le dit en mots, pour qui ne lit pas la couleur de la colonne. Le
  // mot de la pastille est celui de la table de bon.ts, posé par le process principal.
  const numero = ouvrable ? cliquable(`#${ticket}`, () => void ouvrirIssue(projet, ticket)) : bloc("span", `#${ticket}`);
  numero.className = "ticket mono";
  numero.title = ouvrable
    ? `open issue #${ticket} in the browser`
    : etat === undefined
      ? `this ticket is not on the rail that ${geste(projet, "facts")} returns: the app does not have its address`
      : "the address the station returned for this ticket is not https: the app does not open it";
  const pose = { numero, hors: horsColonne, ...(etat === undefined ? {} : { mot: motDEtat ?? etat, ...(horsColonne ? {} : { etat: etatDeColonne ?? etatDuTon(ton) }) }) };
  // Une carte qui attend un autre humain (« Awaiting others ») garde la carte d'attente, sans dire qu'elle t'attend (ticket 3071).
  const bon = attendu ? carteAttente(document, { ...pose, attendu: carte.qui === undefined }) : bonDeLaFamille(document, pose);
  bon.dataset.ticket = String(ticket);
  // Un clic sur la carte, quelle que soit sa colonne, ouvre sa fiche par-dessus le rail. Ce qui s'y
  // clique déjà — son numéro, sa PR, ses remarques — garde son geste ; un texte
  // qu'on y sélectionne pour le recopier n'ouvre rien. Au clavier, Entrée ou Espace sur la carte.
  bon.tabIndex = 0;
  bon.addEventListener("click", (evenement) => {
    const cible = /** @type {Element | null | undefined} */ (evenement.target);
    if (cible?.closest?.("button, a, summary, input, textarea, select, form") || String(globalThis.getSelection?.() ?? "") !== "") return;
    ouvrirFiche(projet, carte, bon);
  });
  bon.addEventListener("keydown", (evenement) => {
    if ((evenement.target ?? bon) !== bon || (evenement.key !== "Enter" && evenement.key !== " ")) return;
    evenement.preventDefault();
    ouvrirFiche(projet, carte, bon);
  });
  const tete = teteDuBon(bon);
  // Dans Taken et Pass : depuis quand la carte y est ; bien plus longtemps que d'ordinaire, elle tranche (ticket 1811).
  if (carte.age !== undefined) {
    tete.append(poserAge(document, carte.age));
    if (carte.age.longue) bon.dataset.traine = "";
    // Plus d'un essai depuis la première prise : un point par essai, à côté de l'âge (ticket 1895).
    if (carte.essais !== undefined) tete.append(poserEssais(document, carte.essais));
  }
  // Un agent y travaille en ce moment : la poêle grésille au bout de sa tête (ticket 2984).
  if (cuit) tete.append(poele(document));
  // Une carte que plus aucun cook ne prendra dit en haut pourquoi, en mots simples (ticket 3147) ; ce que la station en a écrit
  // est derrière « details ». Ses trois gestes sont au pied de la carte.
  if (carte.refus === undefined) refusDeCartes.delete(`${projet.nom}#${ticket}`);
  else {
    bon.dataset.refus = "";
    const { phrase, details } = ligneDuRefus(document, carte.ligne ?? "", carte.refus.brut);
    tete.after(...(details === undefined ? [phrase] : [phrase, details]));
  }
  // Un ticket au label `sensitive` (ticket 3224) : sa marque, la première de ses étiquettes.
  const etiquettes = carte.sensible === true ? marquerSensible(document, poserEtiquettes(document, carte, avecStation)) : poserEtiquettes(document, carte, avecStation);
  if (etiquettes !== null) bon.append(etiquettes);
  // Sur le rail, en attente : sa priorité, sous son numéro
  if (carte.prio !== undefined) {
    const prio = bloc("span", carte.prio);
    prio.className = "prio mono";
    bon.append(prio);
  }
  const cleDuBon = `${projet.nom}#${ticket}`;
  // Un ticket que la box ne nomme pas : son titre est lu sur l'issue, une fois. Ce qui n'est pas lu n'est pas écrit.
  if (titre === undefined && ouvrable && !titres.has(cleDuBon)) void lireTitre(projet, ticket);
  const nomme = titre ?? /** @type {{ titre?: string } | undefined} */ (titres.get(cleDuBon))?.titre;
  if (nomme !== undefined) bon.append(bloc("strong", nomme));
  // Une question du manager — avant de découper une épique, ou qui retient le ticket par
  // `blocked-on-human` (faits.ts, `question`) : la question qu'on me pose, en une ou deux lignes, et
  // qui l'a posée. Répondue, la carte n'est plus ici mais dans WAITING : une lecture qui la disait
  // répondue est relue, la carte revenue — le manager a posé une autre question.
  const interroge = attendu && carte.question === true;
  if (interroge && ouvrable && (!questions.has(cleDuBon) || perimee(questions.get(cleDuBon)))) void lireQuestion(projet, ticket);
  const lueDuBon = interroge ? questions.get(cleDuBon)?.lue : undefined;
  const poseeLa = lueDuBon !== undefined && "question" in lueDuBon ? lueDuBon.question : undefined;
  if (poseeLa !== undefined) {
    const resume = bloc("p", poseeLa.resume);
    resume.className = "question-courte";
    // Qui l'a posée, et quand, est derrière « details » (ticket 3086) : à première vue, la question seule.
    bon.append(resume, detailsDeCarte(document, `asked by ${poseeLa.auteur}, ${dateHeure(poseeLa.a)}`));
  }
  // Deux lignes au plus : ce qui se passe, et ce qui demande l'attention. Le reste est dans la fiche.
  // Les captures d'un ticket d'interface livré restent sur sa carte : elles se lisent sans un clic. Celles
  // d'une carte de TODO se posent sous sa question.
  if (carte.captures !== undefined && carte.todo?.captures === undefined) bon.append(...poserCaptures(projet, ticket, carte.captures));
  // Une carte de TODO qui dit ce qui se passe (carte-todo.js, son résumé) le dit en tête de sa carte : la phrase
  // du bon ne le redit pas. Répondue — envoyée, ou jouée —, elle ne demande plus de répondre : la phrase se tait aussi.
  const vuDeTodo = attendu && carte.todo !== undefined ? vuDeLaCarte(carte.todo, etatDeLaCarte(projet, ticket, carte.todo)).vu : undefined;
  const todoRepondue = vuDeTodo === "attente" || vuDeTodo === "jouee";
  if (carte.ligne !== undefined && carte.refus === undefined && !(attendu && carte.todo?.resume !== undefined) && !todoRepondue) {
    const liens = carte.miseDeCote?.liens ?? carte.liens;
    const phrase = liens === undefined ? bloc("p", carte.ligne) : ligneAvecSesNumeros(projet, carte.ligne, liens);
    phrase.className = "ligne-carte";
    bon.append(phrase);
  }
  // Un cook coincé le dit sur sa carte, faute d'un autre signal (ticket 1456) : sur Cooks, ce qui est coincé et depuis
  // quand se lit en tête, sans ouvrir la fiche.
  const signale = carte.signal ?? coinceDit(carte);
  if (signale !== undefined) {
    const signal = bloc("p", signale);
    signal.className = "signal";
    bon.append(signal);
  }
  // Une carte de TODO entrée par la porte du runtime : sa question, ses captures, un bouton par choix et
  // un champ pour répondre dans tes mots — tranchée sur la carte même, sans ouvrir sa fiche.
  if (attendu && carte.todo !== undefined) {
    const question = carte.todo.question;
    bon.append(...poserLaCarteDeTodo(projet, ticket, carte.todo).map((posee) => tenirEnMain(projet, ticket, question, bon, posee)));
  }
  // Une carte du chef lue de GitHub (projet GitHub seul, ticket 2221) : sa question se pose comme toute carte de TODO, juste
  // au-dessus, et se répond sur la carte (ticket 2434). Celle d'une issue sans commentaire marqué n'a rien à quoi répondre :
  // son texte le dit, sous la phrase de sa sorte.
  if (attendu && carte.chef !== undefined && carte.todo === undefined) {
    const duChef = carteDeReponse(document, { sorte: carte.chef.sorte, source: "github" });
    duChef.append(detailsDeCarte(document, carte.chef.texte));
    bon.append(duChef);
  }
  // Toute autre carte qui t'attend — ni carte de TODO, ni carte mise de côté, qui a la sienne — finit par « ask the second »
  // comme les autres (ticket 3363) : un geste du chef que la carte ne rend pas en carte de TODO se passe au second d'un clic.
  if (attendu && carte.todo === undefined && carte.refus === undefined) {
    const second = demandesAuSecond.get(cleDuBon);
    bon.append(rangeeDuSecond(document, ticket, second, () => void demanderAuSecond(projet, ticket, () => brigade.passerAuSecond(projet.nom, ticket, null))));
  }
  // La file ne dit pas tout : un repère discret, le détail est dans la fiche.
  if (carte.repere === true) {
    const repere = bloc("small", "…");
    repere.className = "repere";
    repere.title = "some details are not given: the sheet says which";
    bon.append(repere);
  }
  // Livré : la PR mergée s'ouvre d'un clic. Son adresse reste au process principal, comme celle de l'issue.
  if (pr === true) {
    const ouvre = bouton("open the merged PR", () => void ouvrirPr(projet, ticket));
    ouvre.className = "pr";
    ouvre.title = `open #${ticket}'s merged PR in the browser`;
    bon.append(ouvre);
  }
  if (pr === false) bon.append(bloc("small", "merged PR: the address the station returned is not https, the app does not open it"));
  if (carte.refus !== undefined && lectureSeuleDe(projet) === undefined) bon.append(poserLesGestesDuRefus(projet, ticket));
  // En pass ou livrée : « try it » quand le projet dit comment il s'essaie (essai.ts) — sa phrase, sinon.
  if (carte.essayable === true) {
    bon.append(
      ...poserLEssai(
        document,
        essaisDeProjets.get(projet.nom),
        ticket,
        { essayer: () => void brigade.essayer(projet.nom, ticket), arreter: () => void brigade.arreterEssai(projet.nom, ticket) },
      ),
    );
  }
  bon.append(...poserGestesDAttente(projet, carte), ...signalerLaCarte(projet, carte));
  return bon;
}

// La ligne d'un ticket mis de côté (ticket 2075) : chacun de ses `#N` que la lecture porte s'ouvre d'un clic, sur son issue
// ou sa PR — l'adresse reste au process principal, comme celle du ticket.
/** @param {Projet} projet @param {string} ligne @param {number[]} liens */
function ligneAvecSesNumeros(projet, ligne, liens) {
  const phrase = document.createElement("p");
  for (const morceau of ligne.split(/(#\d+)/)) {
    const numero = /^#\d+$/.test(morceau) ? Number(morceau.slice(1)) : undefined;
    if (numero === undefined || !liens.includes(numero)) {
      if (morceau !== "") phrase.append(morceau);
      continue;
    }
    const ouvre = cliquable(morceau, () => void ouvrirIssue(projet, numero));
    ouvre.className = "lien-de-ligne mono";
    ouvre.title = `open #${numero} on GitHub, in the browser`;
    phrase.append(ouvre);
  }
  return phrase;
}

// Les trois gestes d'une carte mise de côté (ticket 3147) : « Relaunch » et « Close as already done » partent sur l'issue
// (gestes-refus.ts) et la carte est relue ; « Ask the second » passe la carte au second, comme toute carte.
/** @param {Projet} projet @param {number} ticket */
function poserLesGestesDuRefus(projet, ticket) {
  const cle = `${projet.nom}#${ticket}`;
  return rangeeDuRefus(
    document,
    ticket,
    refusDeCartes.get(cle),
    {
      jouer: (id) => void jouerLeRefus(projet, ticket, id),
      demander: () => void demanderAuSecond(projet, ticket, () => brigade.passerAuSecond(projet.nom, ticket, null)),
    },
    demandesAuSecond.get(cle),
  );
}

/** @param {Projet} projet @param {number} ticket @param {"relancer" | "clore"} id */
async function jouerLeRefus(projet, ticket, id) {
  const cle = `${projet.nom}#${ticket}`;
  if (refusDeCartes.get(cle) !== undefined && "envoi" in /** @type {object} */ (refusDeCartes.get(cle))) return;
  refusDeCartes.set(cle, { envoi: id });
  poserRail(projet);
  /** @type {{ envoi: "relancer" | "clore" } | { refus: string } | undefined} */
  let dit;
  try {
    const rendu = await brigade.refus(projet.nom, id, ticket);
    if ("fait" in rendu) lireLesFaits();
    else dit = { refus: "refus" in rendu ? rendu.refus : "nothing was changed" };
  } catch (erreur) {
    dit = { refus: `nothing was changed: ${erreur instanceof Error ? erreur.message : String(erreur)}` };
  }
  if (dit === undefined) refusDeCartes.delete(cle);
  else refusDeCartes.set(cle, dit);
  poserRail(projet);
}

// Une carte en panne porte « report to brigade » (ticket 1977) : mise de côté (86), ou remontée parce que la pass n'a
// pas pu la juger — une raison de brigade, pas du code livré. Une livraison rouge, elle, est l'affaire du projet.
/** @param {Projet} projet @param {import("../faits.ts").Carte} carte */
function signalerLaCarte(projet, carte) {
  const { ticket, etat, decision } = carte;
  const nonJugee = decision?.quoi === "remontee" && decision.motif === "unjudged";
  if (etat !== "86" && !nonJugee) return [];
  const dit = [nonJugee ? "the pass could not judge it" : "set aside", carte.ligne ?? "", carte.signal ?? ""].filter((morceau) => morceau !== "").join(" — ");
  return signalement.poser({ projet: projet.nom, reference: { ticket }, panne: `${projet.nom}, ticket ${ticket}: ${dit}` });
}

// Les gestes de WAITING d'une carte (faits.ts, `gestes`), sur la carte et sur sa fiche (vue/attente/) : sur une carte de
// TODO, « waiting for… », qui ouvre son formulaire — ce qu'elle attend, dans les mots du chef ; de qui ; le jour de la
// relance, proposé à sept jours ; validé, le geste part, et la carte passe dans WAITING à la lecture qui le voit. Sur une
// carte de WAITING, « resume » et « it arrived, back to the kitchen » : chacun part au clic. Ce qui part se décide dans
// le process principal (attente.ts, vue/attente/attente-github.ts), et « it arrived » dit dessous ce qu'il en est advenu.
/** @param {Projet} projet @param {import("../faits.ts").Carte} carte */
function poserGestesDAttente(projet, carte) {
  // En lecture seule (ticket 3163), rien ne met une carte en WAITING ni ne l'en sort.
  if (lectureSeuleDe(projet) !== undefined) return [];
  const { ticket, gestes } = carte;
  const cle = `${projet.nom}#${ticket}`;
  // Une carte sortie de WAITING n'a plus à dire ce qu'est devenu son « it arrived ».
  if (!gestes?.includes("attente-arrivee")) arriveesDeCartes.delete(cle);
  const siens = GESTES_D_ATTENTE.filter(({ id }) => gestes?.includes(/** @type {never} */ (id)));
  // Le rail et la fiche ouverte de ce ticket montrent le même état.
  const redessiner = () => {
    poserRail(projet);
    if (ficheDe(projet, ticket)) poserFiche();
  };
  return poserLesGestesDAttente(
    document,
    { ticket, cle, siens, ouvert: formulairesDAttente.get(cle), arrivee: arriveesDeCartes.get(cle) },
    {
      cliquer: (id) => {
        if (id === "attente-arrivee") return void arriver(projet, ticket);
        if (id !== "attente-poser") return void ecrireAttente(projet, id, ticket);
        formulairesDAttente.set(cle, { quoi: "", qui: "", relance: relanceProposee(new Date()) });
        redessiner();
      },
      valider: () => {
        const ouvert = formulairesDAttente.get(cle);
        if (ouvert !== undefined) void ecrireAttente(projet, "attente-poser", ticket, { quoi: ouvert.quoi, qui: ouvert.qui, relance: ouvert.relance });
      },
      renoncer: () => {
        formulairesDAttente.delete(cle);
        redessiner();
      },
    },
  );
}

// « It arrived, back to the kitchen » part sur le tableau de la cuisine, pas dans le second : la carte dit qu'il
// est en route, puis qu'il est posté — son commentaire au survol — et la box est relue ; refusé, rien n'est parti, et la
// carte dit pourquoi en une ligne, le détail au survol. Elle reste dans WAITING jusqu'à ce que la box l'ait joué.
/** @param {Projet} projet @param {number} ticket */
async function arriver(projet, ticket) {
  const cle = `${projet.nom}#${ticket}`;
  const avant = arriveesDeCartes.get(cle);
  if (avant !== undefined && "envoi" in avant) return;
  nonEcrit = nonEcritSecond = "";
  arriveesDeCartes.set(cle, { envoi: true });
  poserRail(projet);
  if (ficheDe(projet, ticket)) poserFiche();
  /** @type {{ fait: string, detail: string } | { refus: string, detail: string }} */
  let dite;
  try {
    const rendu = await brigade.attente(projet.nom, "attente-arrivee", ticket);
    dite =
      rendu !== undefined && rendu !== null && "fait" in rendu
        ? { fait: rendu.fait, detail: rendu.detail ?? "" }
        : rendu !== undefined && rendu !== null && "refus" in rendu
          ? { refus: rendu.refus, detail: ("detail" in rendu ? rendu.detail : undefined) ?? "" }
          : { refus: SANS_ENVOI, detail: SANS_PONT };
  } catch (erreur) {
    dite = { refus: SANS_ENVOI, detail: erreur instanceof Error ? erreur.message : String(erreur) };
  }
  arriveesDeCartes.set(cle, dite);
  if ("fait" in dite) lireLesFaits();
  poserRail(projet);
  if (ficheDe(projet, ticket)) poserFiche();
}

// Un geste de WAITING part dans le second, comme un geste du socle : sa sortie s'y lit, sa note dit
// ce qui est parti. Parti, le formulaire se referme ; refusé, il reste, et dit pourquoi.
/** @param {Projet} projet @param {string} id @param {number} ticket @param {{ quoi: string, qui: string, relance: string }} [saisie] */
async function ecrireAttente(projet, id, ticket, saisie) {
  const cle = `${projet.nom}#${ticket}`;
  nonEcrit = nonEcritSecond = "";
  gesteRate = undefined;
  /** @type {string | undefined} */
  let refus;
  /** @type {{ fait: string, detail: string } | undefined} */
  let fait;
  try {
    const rendu = await brigade.attente(projet.nom, id, ticket, saisie);
    if (rendu !== undefined && "refus" in rendu) refus = rendu.refus;
    // Écrit sur GitHub (vue/attente/attente-github.ts) : la lecture suivante montre la carte dans sa colonne.
    else if (rendu !== undefined && "fait" in rendu) {
      fait = { fait: rendu.fait, detail: rendu.detail ?? "" };
      lireLesFaits();
    } else if (rendu !== undefined) garder(projet.nom, rendu);
  } catch (erreur) {
    refus = `nothing sent: ${erreur instanceof Error ? erreur.message : String(erreur)}`;
  }
  const ouvert = formulairesDAttente.get(cle);
  if (saisie !== undefined && ouvert !== undefined && refus !== undefined) ouvert.refus = refus;
  else if (saisie !== undefined) formulairesDAttente.delete(cle);
  if (refus !== undefined && saisie === undefined) nonEcritSecond = refus;
  // « resume » qui n'est pas parti dans le second : la carte dit dessous ce qu'il en est, comme pour « it arrived ».
  if (saisie === undefined && (refus !== undefined || fait !== undefined)) arriveesDeCartes.set(cle, fait ?? { refus: refus ?? "", detail: "" });
  poserRail(projet);
  montrer();
  if (ficheDe(projet, ticket)) poserFiche();
}

// Ce qui a été livré, sur une carte de Livré : le résumé de la relecture en entier, dans ses mots
// — rien n'est coupé ni reformulé —, puis ses constats sous leur nombre, qu'un clic déplie : le
// fichier que chacun nomme, et son texte tel que le reviewer l'a écrit. Sans relecture, ce que
// l'app n'écrit rien : une relecture pas donnée n'est pas un texte de remplissage sur la carte.
/** @param {Projet} projet @param {number} ticket @param {import("../faits.ts").Livraison} livraison */
function poserLivraison(projet, ticket, livraison) {
  if ("sans" in livraison) return [];
  const resume = bloc("p", livraison.resume);
  resume.className = "livraison";
  resume.title = `ce que la relecture dit de ce qui a été livré pour #${ticket}, mot pour mot`;
  if (livraison.constats.length === 0) {
    const aucune = bloc("small", livraison.remarques);
    aucune.className = "remarques";
    return [resume, aucune];
  }
  const cle = `${projet.nom}#${ticket}`;
  const remarques = document.createElement("details");
  remarques.className = "remarques";
  remarques.open = remarquesDepliees.has(cle);
  remarques.addEventListener("toggle", () => void (remarques.open ? remarquesDepliees.add(cle) : remarquesDepliees.delete(cle)));
  const liste = document.createElement("ol");
  liste.append(
    ...livraison.constats.map(({ gravite, fichier, constat }) => {
      const pose = document.createElement("li");
      if (gravite !== "remarque") pose.append(bloc("strong", gravite));
      if (fichier !== null) pose.append(exact("code", fichier));
      pose.append(bloc("span", constat));
      return pose;
    }),
  );
  remarques.append(bloc("summary", livraison.remarques), liste);
  return [resume, remarques];
}

// Les captures d'un ticket d'interface, sur sa carte (captures.ts) : chaque écran avant et après, côte à
// côte, chacun sous sa légende — lues dès que la carte se pose, sans un clic. Une capture que la
// livraison ne porte pas le dit à sa place ; une livraison qui ne les porte pas toutes le dit en tête, en
// une ligne, où les poser au survol. Un clic sur une image ouvre la fiche, comme le reste de la carte.
/** @param {Projet} projet @param {number} ticket @param {import("../captures.ts").CapturesDeCarte} captures */
function poserCaptures(projet, ticket, { ecrans, incomplete }) {
  const poses = [];
  if (incomplete !== undefined) {
    const ligne = bloc("p", incomplete.ligne);
    ligne.className = "captures-manquantes";
    ligne.title = incomplete.detail;
    poses.push(ligne);
  }
  for (const { ecran, avant, apres } of ecrans) {
    const paire = document.createElement("div");
    paire.className = "captures";
    paire.append(...[avant, apres].map((capture) => poserCapture(projet, ticket, ecran, capture)));
    poses.push(paire);
  }
  return poses;
}

/** @param {Projet} projet @param {number} ticket @param {string} ecran @param {import("../captures.ts").Capture} capture */
function poserCapture(projet, ticket, ecran, capture) {
  const figure = document.createElement("figure");
  figure.dataset.moment = capture.moment;
  const titre = document.createElement("figcaption");
  titre.textContent = capture.legende;
  figure.append(poserImage(projet, ticket, ecran, capture), titre);
  return figure;
}

// L'image d'une capture, lue une fois par le process principal — ou sa place, qui dit qu'elle manque, se lit ou ne se lit pas.
/** @param {Projet} projet @param {number} ticket @param {string} ecran @param {import("../captures.ts").Capture} capture */
function poserImage(projet, ticket, ecran, { moment, legende, livree, version }) {
  const cle = `${projet.nom}#${ticket}:${ecran}:${moment}@${version}`;
  if (livree && !capturesLues.has(cle)) void lireCapture(projet, ticket, ecran, moment, cle);
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
  const lignes = lue.sans.split("\n").map((ligne) => ligne.trim()).filter((ligne) => ligne !== "");
  const raison = (lignes.find((ligne) => !ligne.startsWith("$ ") && !ligne.startsWith("→")) ?? lignes[0] ?? "").slice(0, 140);
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
      void Promise.resolve(brigade.ouvrirLien(projet.nom, ticket, lien)).then((ouvert) => {
        if (ouvert === false) window.open(lien, "_blank", "noopener");
      });
    });
    place.append(" ", ouvre);
  }
  return place;
}

/** @param {Projet} projet @param {number} ticket @param {string} ecran @param {"avant" | "apres"} moment @param {string} cle */
async function lireCapture(projet, ticket, ecran, moment, cle) {
  capturesLues.set(cle, undefined);
  try {
    capturesLues.set(cle, (await brigade.lireCapture(projet.nom, ticket, ecran, moment)) ?? { sans: "the app has nothing to read" });
  } catch (erreur) {
    capturesLues.set(cle, { sans: erreur instanceof Error ? erreur.message : String(erreur) });
  }
  if (courant?.nom === projet.nom && !rail.hidden && tenus.has(projet.nom)) poserRail(courant);
  // Une carte ouverte depuis la liste du téléphone pose ses captures aussi (ticket 3185), et son détail en grand (ticket 3212).
  if (vueDesCartes.vu === "carte" && vueDesCartes.carte.projet === projet.nom && vueDesCartes.carte.ticket === ticket) poserLesCartesDuChef();
  if (detailOuvert?.projet === projet.nom && detailOuvert.ticket === ticket) poserLeDetail();
}

// La fiche d'un ticket, par-dessus le rail : pour l'instant son en-tête — son numéro, son titre
// entier, sa priorité, son issue et sa PR —, chaque ligne telle que la box l'a donnée ou, en
// italique, pourquoi elle ne l'a pas (fiche.ts) : rien n'est deviné, rien n'est laissé vide. Les
// adresses restent au process principal : un lien nomme le projet et le ticket, comme le numéro
// d'une carte. Sur la fiche d'un ticket qui t'attend, la demande au second, en un clic. Le rail
// reste dessous, tel quel — rien de lui ne se clique au travers — ; la fermer, par son bouton ou
// Échap, le rend où il était, défilé où il l'était.
/** @param {Projet} projet @param {import("../faits.ts").Carte} carte @param {HTMLElement} retour */
function ouvrirFiche(projet, carte, retour) {
  // Ce que l'issue pose se relit à chaque ouverture : on a pu y répondre, ou le manager reposer.
  questions.delete(`${projet.nom}#${carte.ticket}`);
  histoires.delete(`${projet.nom}#${carte.ticket}`);
  situations.delete(`${projet.nom}#${carte.ticket}`);
  gestesDeFiches.delete(`${projet.nom}#${carte.ticket}`);
  refusDeFiches.delete(`${projet.nom}#${carte.ticket}`);
  issuesDeFiches.delete(`${projet.nom}#${carte.ticket}`);
  confirmationsDeFiches.delete(`${projet.nom}#${carte.ticket}`);
  discussions.delete(`${projet.nom}#${carte.ticket}`);
  envoisDeCommentaire.delete(`${projet.nom}#${carte.ticket}`);
  demandesAuSecond.delete(`${projet.nom}#${carte.ticket}`);
  void lireHistoire(projet, carte);
  ouverte = { projet, carte, retour };
  void lireDiscussion(projet, carte.ticket);
  void lireGestes(projet, carte);
  poserFiche();
  fiche.focus();
}

function fermerFiche() {
  const retour = ouverte?.retour;
  ouverte = undefined;
  poserFiche();
  if (retour !== undefined && rail.contains(retour)) retour.focus();
}

// Une nouvelle lecture redessine le rail : la fiche ouverte prend ce qu'elle dit de son ticket — la
// même carte, celle de la même colonne s'il en a deux. Un ticket que la lecture ne porte plus garde
// sa fiche telle qu'elle était ; une fiche qui n'a pas changé n'est pas reposée, et garde le clavier.
/** @param {import("../faits.ts").Carte[]} cartes @param {Map<import("../faits.ts").Carte, HTMLElement>} posees */
function suivreFiche(cartes, posees) {
  if (ouverte === undefined) return;
  const { carte: avant } = ouverte;
  const siennes = cartes.filter(({ ticket }) => ticket === avant.ticket);
  const fraiche = siennes.find(({ attendu, livraison }) => attendu === avant.attendu && (livraison === undefined) === (avant.livraison === undefined)) ?? siennes[0];
  if (fraiche === undefined) return;
  ouverte.retour = posees.get(fraiche) ?? ouverte.retour;
  ouverte.carte = fraiche;
  /** @param {import("../faits.ts").Carte} posee */
  const dit = (posee) => JSON.stringify([posee.fiche, posee.attend.length > 0]);
  // Ce qui décide de ses gestes a changé — un geste vient d'agir, ou la cuisine l'a pris : ils sont relus.
  /** @param {import("../faits.ts").Carte} posee */
  const decide = (posee) => JSON.stringify([posee.etat, posee.ouvrable, posee.attendu, posee.decision, posee.pr]);
  if (decide(fraiche) !== decide(avant)) void lireGestes(ouverte.projet, fraiche);
  if (dit(fraiche) !== dit(avant)) poserFiche();
}

// Ce que la file dit du ticket, et que la carte ne porte plus : qui le tient, depuis quand, son bail,
// ce qu'il brûle, ce qui le bloque. Ce qu'elle ne dit pas n'est pas écrit, et la ligne brute de
// `status` n'est nulle part sur la fiche. Pour un
// ticket livré, ce qui a été livré.
/** @param {Projet} projet @param {import("../faits.ts").Carte} carte */
function poserDetailsDeFiche(projet, carte) {
  const { ticket, livraison, dit } = carte;
  const pose = [];
  // Rien n'est dit deux fois : « right now » est dans sa section, et la station où il cuit s'ajoute à qui le tient.
  const cuit = dit.find(({ libelle }) => libelle === "cooks on");
  const dits = dit
    .filter(({ libelle }) => libelle !== "right now" && libelle !== "cooks on")
    .map((fait) => (fait.libelle === "taken by" && cuit !== undefined ? { ...fait, valeur: `${fait.valeur} · ${cuit.valeur}` } : fait));
  if (dits.length > 0) {
    const porte = document.createElement("ul");
    porte.className = "porte";
    porte.append(
      ...dits.map(({ libelle, valeur, exact: recopie }) => {
        const fait = document.createElement("li");
        fait.append(bloc("span", libelle), recopie ? exact("strong", valeur) : bloc("strong", valeur));
        return fait;
      }),
    );
    pose.push(porte);
  }
  if (livraison !== undefined) pose.push(...poserLivraison(projet, ticket, livraison));
  if (pose.length === 0) return [];
  const details = document.createElement("section");
  details.className = "details";
  details.ariaLabel = `what the queue says about #${ticket}`;
  details.append(...pose);
  return [details];
}

const issuesOuvertes = new Set();

function poserFiche() {
  fiche.hidden = ouverte === undefined;
  rail.inert = !contenu.hidden || !fiche.hidden;
  if (ouverte === undefined) return fiche.replaceChildren();
  const { projet, carte } = ouverte;
  const { ticket, attend } = carte;
  const { titre, priorite, issue, pr, attendu, tete: teteDeLivraison } = carte.fiche;
  const fermer = bouton("close", fermerFiche, "discret");
  fermer.className = "fermer";
  fermer.title = "close the sheet (Esc): the rail is back as you left it";
  const tete = document.createElement("header");
  tete.append(exact("span", `#${ticket}`), fermer);
  /** @param {import("../fiche.ts").Ligne} ligne */
  const dite = (ligne) => {
    if ("sans" in ligne) {
      return ligneVide(document, ligne.sans, { classe: "sans", balise: "dd" });
    }
    return ligne.exact === true ? exact("dd", ligne.valeur) : bloc("dd", ligne.valeur);
  };
  /** @param {string} libelle @param {HTMLElement} valeur */
  const rang = (libelle, valeur) => {
    const pose = document.createElement("div");
    pose.append(bloc("dt", libelle), valeur);
    return pose;
  };
  const lignes = document.createElement("dl");
  // La priorité se lit et se change dans la barre des gestes, quand elle y est : une seule fois.
  const proposes = gestesDeFiches.get(`${projet.nom}#${ticket}`);
  const changeable = Array.isArray(proposes) && proposes.some(({ id }) => id === "priorite");
  lignes.append(
    ...(changeable ? [] : [rang("priority", dite(priorite))]),
    // L'issue et la PR qui s'ouvrent sont des gestes, posés plus bas avec leur prix ; ici, seulement
    // ce qui ne s'ouvre pas, et pourquoi. Une PR que la box ne donne pas (ticket pas servi) n'a pas de
    // ligne : ce qui n'existe pas encore n'est pas affiché.
    ...(issue === true ? [] : [rang("issue", dite(issue))]),
    ...(pr === undefined || pr === true ? [] : [rang("PR", dite(pr))]),
  );
  // Le titre que la box ne donne pas est celui que l'issue porte, lu par le poste ; à défaut, aucune ligne.
  const lu = /** @type {{ titre?: string } | undefined} */ (titres.get(`${projet.nom}#${ticket}`));
  const nomme = "valeur" in titre ? bloc("h3", titre.valeur) : lu?.titre === undefined ? undefined : bloc("h3", lu.titre);
  fiche.ariaLabel = `the sheet of #${ticket}`;
  // Le popup : un panneau de lecture, posé sur un voile qui laisse voir le rail, atténué.
  const panneau = document.createElement("div");
  panneau.className = "panneau";
  // Ce qu'on attend de toi, en tête, en une phrase : jamais la ligne de la file.
  // Une livraison qui attend son merge : deux lignes — ce qu'elle fait, pourquoi elle attend —, puis
  // ses juges, un fichier par ligne avec ses lignes ajoutées et retirées.
  const juges = document.createElement("ul");
  juges.className = "juges";
  for (const { fichier, ajoutees, retirees } of teteDeLivraison?.juges ?? []) {
    const ligne = document.createElement("li");
    ligne.append(exact("code", fichier), ` +${ajoutees} −${retirees}`);
    juges.append(ligne);
  }
  const attente =
    teteDeLivraison !== undefined
      ? [
          ...(teteDeLivraison.fait === undefined ? [] : [Object.assign(bloc("p", teteDeLivraison.fait), { className: "fait" })]),
          Object.assign(bloc("p", teteDeLivraison.pourquoi), { className: "attendu" }),
          ...((teteDeLivraison.juges.length > 0) ? [juges] : []),
        ]
      : attendu === undefined
        ? []
        : [Object.assign(bloc("p", attendu), { className: "attendu" })];
  // Son cook, tel que sa station le publie (ticket 1846) : ce qu'il fait, ses derniers gestes, sa fin et sa PR. Posé, il
  // dit ce qu'il fait en ce moment : l'histoire ne le redit pas.
  const cook = poserLActiviteDuCook(document, { publiees: activitesPubliees.get(projet.nom), ticket, pastille, ouvrirPr: () => void ouvrirPrDuCook(projet, ticket) });
  // Dans l'ordre où le chef lit : ce qu'est le ticket, où il en est, ce qu'on attend de lui, ce qu'il peut
  // faire, l'issue (repliée) — puis seulement ce que la cuisine en dit.
  // Les gestes de WAITING de sa carte, sur la fiche aussi (vue/attente/) : « waiting for… » sur une carte de TODO, « resume » et
  // « it arrived » sur une carte de WAITING.
  panneau.append(tete, ...attente, ...(nomme === undefined ? [] : [nomme]), ...(lignes.children.length > 0 ? [lignes] : []), ...poserGestesDAttente(projet, carte), ...poserDetailsDeFiche(projet, carte));
  const suite = [...(cook === null ? [] : [cook]), ...poserHistoire(projet, ticket, carte, cook !== null)];
  fiche.replaceChildren(panneau);
  // Un ticket qui t'attend : la question que son issue pose, s'il en pose une — lue à l'ouverture.
  // Répondue, sa carte attend le manager dans WAITING : la fiche la garde, et ce qui y a été répondu.
  // Retenu par `blocked-on-human` : lever la retenue d'un clic, sans commande à recopier. Puis,
  // pour tout ticket, ses gestes — la demande au second en est. Rien n'est envoyé sans un clic.
  if (attend.length > 0 || carte.repondue !== undefined) {
    const cle = `${projet.nom}#${ticket}`;
    if (!questions.has(cle)) void lireQuestion(projet, ticket);
    const question = poserQuestion(projet, ticket, questions.get(cle) ?? {});
    if (question !== undefined) panneau.append(question);
    if (attend.some((entree) => entree.includes(LABEL_RETENUE)) && lectureSeuleDe(projet) === undefined) {
      const gestes = document.createElement("div");
      gestes.className = "gestes";
      gestes.append(...poserLevees(projet, ticket));
      panneau.append(gestes);
    }
  }
  panneau.append(poserGestesDeFiche(projet, carte), repliee(projet, ticket), ...suite);
}

// L'issue et sa discussion, repliées d'un clic sous les gestes ; ouvertes, elles le restent quand la fiche est reposée.
/** @param {Projet} projet @param {number} ticket */
function repliee(projet, ticket) {
  const cle = `${projet.nom}#${ticket}`;
  const pli = document.createElement("details");
  pli.className = "issue-repliee";
  pli.open = issuesOuvertes.has(cle);
  pli.addEventListener("toggle", () => void (pli.open ? issuesOuvertes.add(cle) : issuesOuvertes.delete(cle)));
  pli.append(bloc("summary", "the issue and its discussion"), poserDiscussion(projet, ticket));
  return pli;
}

// Les gestes de la fiche : ceux qu'il est possible de faire sur ce ticket à cet instant, et seulement
// ceux-là — ce qu'on attend de toi d'abord, le recommandé en tête, puis la table du chef, selon son
// état, et ce qui est branché (gestes-fiche.ts) —, un bouton chacun. Un prix nul n'est dit nulle part ;
// un prix se lit au survol du bouton, et un clic sur un geste qui coûte demande d'abord de le
// confirmer, prix dit en une ligne. Ce que fait un clic se lit à droite, dans le second ; ce qui ne
// part pas se dit sous la liste. Le rail et la fiche suivent la lecture suivante de la box.
/** @param {Projet} projet @param {import("../faits.ts").Carte} carte */
function poserGestesDeFiche(projet, carte) {
  const lue = carte.fiche.priorite;
  const prioriteCourante = "valeur" in lue ? /^prio:([0-9])$/.exec(lue.valeur)?.[1] : undefined;
  const { ticket } = carte;
  const cle = `${projet.nom}#${ticket}`;
  const section = document.createElement("section");
  section.className = "gestes-fiche";
  section.ariaLabel = `what you can do on #${ticket}`;
  const proposes = gestesDeFiches.get(cle);
  if (proposes === undefined) {
    section.append(bloc("p", LECTURE_DE("what can be done")));
    return section;
  }
  if ("sans" in proposes) {
    section.append(ligneErreur(document, NON_ATTEINT("actions"), proposes.sans));
    return section;
  }
  const issue = issuesDeFiches.get(cle);
  const liste = document.createElement("ul");
  // En lecture seule (ticket 3163), la fiche ne garde que ce qui ouvre ou demande au second : rien qui écrive sur l'issue.
  const seule = lectureSeuleDe(projet) !== undefined;
  for (const propose of seule ? proposes.filter(({ id }) => GESTES_DE_FICHE_SANS_ECRITURE.has(id)) : proposes) {
    const ligne = document.createElement("li");
    ligne.dataset.geste = propose.id;
    ligne.append(...poserGesteDeFiche(projet, ticket, propose, issue !== undefined && "envoi" in issue, prioriteCourante));
    liste.append(ligne);
  }
  section.append(liste);
  const enAttente = proposes.find(({ id }) => id === confirmationsDeFiches.get(cle));
  if (enAttente !== undefined) {
    const renoncer = () => {
      confirmationsDeFiches.delete(cle);
      if (ficheDe(projet, ticket)) poserFiche();
    };
    const confirmer = () => {
      confirmationsDeFiches.delete(cle);
      void jouerGesteDeFiche(projet, ticket, enAttente.id);
    };
    section.append(confirmationDeGeste(document, { titre: `${enAttente.libelle} — #${ticket}?`, prix: enAttente.prix, oui: OUI(enAttente.libelle), non: ANNULER }, { oui: confirmer, non: renoncer }));
  }
  const refus = refusDeFiches.get(cle);
  if (refus !== undefined) {
    section.append(ligneErreur(document, refus.dit, refus.detail, { classe: "refus" }));
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

// Les gestes de la fiche qui n'écrivent rien sur GitHub (gestes-fiche.ts) : ouvrir l'issue, la PR, la page, ou demander au
// second. Ce sont les seuls d'un projet en lecture seule (ticket 3163).
const GESTES_DE_FICHE_SANS_ECRITURE = new Set(["issue", "pr", "second", "navigateur"]);

// Ce qu'un geste de la fiche pose : son bouton — recommandé s'il l'est, son prix au survol — et,
// pour la priorité, de quoi la choisir avant. `occupe` : un geste de la fiche attend sa réponse — aucun ne part.
/** @param {Projet} projet @param {number} ticket @param {import("../gestes-fiche.ts").Propose} propose @param {boolean} occupe @param {string} [courante] la priorité du ticket, `1` à `9` @returns {HTMLElement[]} */
function poserGesteDeFiche(projet, ticket, propose, occupe, courante) {
  const { id, libelle, prix, recommande, valeurs } = propose;
  const cle = `${projet.nom}#${ticket}`;
  /** @param {() => void} geste @param {string} [aide] */
  const action = (geste, aide) => {
    const pose = boutonAction(document, libelle, geste, { recommande: recommande === true, prix });
    if (aide !== undefined) pose.children[0].title = aide;
    if (occupe) pose.children[0].disabled = true;
    return pose;
  };
  switch (id) {
    case "issue":
      return [action(() => void ouvrirIssue(projet, ticket), `open issue #${ticket} in the browser`)];
    case "pr":
      return [action(() => void ouvrirPr(projet, ticket), `open #${ticket}'s merged PR in the browser`)];
    case "second": {
      const demande = action(() => void demander(ticket), `write into the second a request about #${ticket} — nothing is sent: you press Enter`);
      const cible = demande.children[0];
      cible.className = recommande === true ? "recommande demander" : "demander";
      cible.dataset.geste = "demande";
      return [demande];
    }
    default: {
      // Un geste qui coûte se confirme d'abord : le clic pose la confirmation, prix dit, sous les gestes.
      const jouer = () => {
        if (prix === null) return void jouerGesteDeFiche(projet, ticket, id);
        confirmationsDeFiches.set(cle, id);
        refusDeFiches.delete(cle);
        issuesDeFiches.delete(cle);
        if (ficheDe(projet, ticket)) poserFiche();
      };
      if (valeurs === undefined) return [action(jouer)];
      // La priorité se change d'un geste : choisir une valeur la joue, sans second bouton.
      const choix = /** @type {HTMLSelectElement} */ (document.createElement("select"));
      choix.ariaLabel = libelle;
      choix.className = "priorite";
      choix.title = `${libelle} — choosing a value changes the \`prio:\` label of issue #${ticket}`;
      choix.append(...valeurs.map((valeur) => new Option(`priority ${valeur}`, valeur)));
      choix.value = courante ?? "none";
      choix.disabled = occupe;
      choix.addEventListener("change", () => void jouerGesteDeFiche(projet, ticket, id, choix.value));
      return [choix];
    }
  }
}

// Les gestes de la fiche de cette carte, demandés au process principal. Une réponse qui n'est plus
// celle de la carte ouverte — la lecture l'a changée entre-temps — ne se pose pas.
/** @param {Projet} projet @param {import("../faits.ts").Carte} carte */
async function lireGestes(projet, carte) {
  const { ticket, etat, ouvrable, attendu, decision, pr } = carte;
  /** @type {import("../gestes-fiche.ts").Propose[] | { sans: string }} */
  let lus;
  try {
    lus = (await brigade.gestesDeFiche({ ticket, ...(etat === undefined ? {} : { etat }), ouvrable, attendu, ...(decision === undefined ? {} : { decision }), ...(pr === undefined ? {} : { pr }) })) ?? [];
  } catch (erreur) {
    lus = { sans: `what can be done was not read: ${erreur instanceof Error ? erreur.message : String(erreur)}` };
  }
  if (!ficheDe(projet, ticket) || ouverte?.carte !== carte) return;
  gestesDeFiches.set(`${projet.nom}#${ticket}`, lus);
  poserFiche();
}

// Un geste de la fiche que la vue ne joue pas : une action de box, qui part dans le second. Le
// second se montre à droite ; ce qui n'est pas parti se dit sur la fiche, sous ses gestes.
// Changer la priorité ne passe pas par la box : le process principal change le label `prio:` de
// l'issue sur GitHub (priorite.ts) — fait, la fiche le dit et le rail redessiné montre la nouvelle
// priorité ; en échec, rien n'a changé, la ligne le dit et son détail est au survol.
// Sur le téléphone (ticket 1164), il n'y a pas de second où l'écrire : le pont joue l'action sur la station et rend ce
// qu'elle a fait, comme le bouton d'une station sur Cooks — dit sur la fiche, et la box relue tout de suite : la carte
// quitte la file à la lecture qui suit. Tant que la réponse n'est pas là, les gestes de la fiche attendent ; refusé,
// rien n'a changé, et la file non plus.
/** @param {Projet} projet @param {number} ticket @param {string} id @param {string} [valeur] */
async function jouerGesteDeFiche(projet, ticket, id, valeur) {
  const cle = `${projet.nom}#${ticket}`;
  const avant = issuesDeFiches.get(cle);
  if (avant !== undefined && "envoi" in avant) return;
  nonEcrit = nonEcritSecond = "";
  gesteRate = undefined;
  refusDeFiches.delete(cle);
  const proposes = gestesDeFiches.get(cle);
  issuesDeFiches.set(cle, { envoi: (Array.isArray(proposes) ? proposes.find((propose) => propose.id === id)?.libelle : undefined) ?? id });
  if (ficheDe(projet, ticket)) poserFiche();
  try {
    const rendu = await brigade.gesteDeFiche(projet.nom, id, ticket, valeur);
    issuesDeFiches.delete(cle);
    // Un pont qui ne porte pas l'action ne rend rien : rien n'est parti, et la fiche le dit.
    if (rendu === undefined || rendu === null) refusDeFiches.set(cle, { dit: SANS_ENVOI, detail: SANS_PONT });
    else if ("refus" in rendu) refusDeFiches.set(cle, { dit: rendu.refus, detail: rendu.detail ?? "" });
    else if ("fait" in rendu) {
      issuesDeFiches.set(cle, { fait: rendu.fait, detail: rendu.detail ?? "" });
      if (id === "priorite") prioritesChoisies.delete(cle);
      lireLesFaits();
    } else {
      garder(projet.nom, rendu);
      if (etroit()) issuesDeFiches.set(cle, { second: true });
      if (id === "priorite") prioritesChoisies.delete(cle);
    }
  } catch (erreur) {
    issuesDeFiches.delete(cle);
    refusDeFiches.set(cle, { dit: SANS_ENVOI, detail: erreur instanceof Error ? erreur.message : String(erreur) });
  }
  if (ficheDe(projet, ticket)) poserFiche();
  montrer();
}
// Ce que la fiche dit de la vie du ticket : ce que son cook fait en ce moment ou ce qui le bloque,
// puis son histoire — chaque étape avec son heure, la relecture en vert ou rouge avec son résumé —
// et son coût. Rien n'est posé qui n'a pas eu lieu ; ce que la box ne communique pas est écrit.
/** @param {Projet} projet @param {number} ticket @param {import("../faits.ts").Carte} carte @param {boolean} [cookPose] la section de son cook est posée au-dessus : elle dit déjà ce qu'il fait */
function poserHistoire(projet, ticket, carte, cookPose = false) {
  /** @type {HTMLElement[]} */
  const posees = [];
  const dite = situations.get(`${projet.nom}#${ticket}`);
  if (dite !== undefined && !(cookPose && dite.libelle !== "blocked")) {
    const section = document.createElement("section");
    section.className = "situation";
    section.append(bloc("h4", dite.libelle === "blocked" ? "what blocks it" : dite.libelle === "question" ? "what it asks you" : "right now"), ...dite.lignes.map((ligne) => bloc("p", ligne)));
    posees.push(section);
  }
  const histoire = histoires.get(`${projet.nom}#${ticket}`);
  const section = document.createElement("section");
  section.className = "histoire";
  section.append(bloc("h4", "history"));
  if (histoire === undefined) section.append(bloc("p", LECTURE_DE("the history")));
  // Une lecture qui manque se dit en une ligne ; ce que la station a répondu, au survol.
  else if ("sans" in histoire) section.append(ligneErreur(document, NON_ATTEINT("history"), histoire.sans));
  else {
    const liste = document.createElement("ol");
    for (const { libelle, at, ton, detail } of histoire.etapes) {
      const ligne = document.createElement("li");
      if (ton !== undefined) ligne.dataset.ton = ton;
      ligne.append(bloc("span", libelle), exact("time", at));
      if (detail !== undefined) ligne.append(bloc("p", detail));
      liste.append(ligne);
    }
    const cout = document.createElement("dl");
    /** @param {string} libelle @param {string} valeur */
    const rangCout = (libelle, valeur) => {
      const pose = document.createElement("div");
      const dd = valeur === "not communicated" ? ligneVide(document, valeur, { classe: "sans", balise: "dd" }) : bloc("dd", valeur);
      pose.append(bloc("dt", libelle), dd);
      return pose;
    };
    cout.append(rangCout("tokens", histoire.cout.tokens), rangCout("duration", histoire.cout.duree), rangCout("attempts", histoire.cout.essais));
    const { tokens, duree, essais } = histoire.cout;
    const connu = [tokens, duree, essais].some((valeur) => valeur !== "not communicated");
    section.append(liste);
    // Un coût que la box ne communique pas n'est pas écrit : ni titre, ni trois lignes vides.
    if (connu) section.append(bloc("h4", "cost"), cout);
    if (connu && histoire.cout.minimum) {
      section.append(ligneVide(document, "at least: a cook has not declared what it spent", { classe: "sans" }));
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
    section.append(ligneErreur(document, NON_ATTEINT("retro"), retro.sans));
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
      const ligne = document.createElement("li");
      // La pastille est le déclencheur de son survol, comme dans ce que les cooks ont appris.
      const pastille = bloc("span", PROVISOIRE);
      pastille.className = "statut";
      pastille.tabIndex = 0;
      const dit = bloc("span", texte);
      dit.className = "texte";
      const nomme = bloc("code", id);
      nomme.className = "id mono";
      ligne.append(survol(document, DIT_PROVISOIRE, pastille), nomme, dit);
      if (reconfirmee) {
        const reprise = bloc("span", "reconfirmed");
        reprise.className = "reprise";
        reprise.title = "the retro reconfirms a lesson the project already had";
        ligne.append(reprise);
      }
      liste.append(ligne);
    }
    section.append(liste);
  }
  if (retro.texte !== null) section.append(bloc("pre", retro.texte));
  return section;
}

// L'histoire de ce ticket, lue sur sa box par le process principal. Une lecture partie avant une autre ne la remplace pas.
/** @param {Projet} projet @param {import("../faits.ts").Carte} carte */
async function lireHistoire(projet, carte) {
  const { ticket } = carte;
  const cle = `${projet.nom}#${ticket}`;
  /** @type {import("../histoire.ts").Histoire} */
  let lue;
  try {
    // La carte du chef lue de GitHub (ticket 2434) : la fiche dit sa question.
    const question = carte.attendu && carte.chef !== undefined ? carte.todo?.question : undefined;
    situations.set(cle, await brigade.situation({ ...(carte.etat === undefined ? {} : { etat: carte.etat }), attend: carte.attend, dit: carte.dit, ...(question == null ? {} : { question }) }));
    lue = (await brigade.lireHistoire(projet.nom, ticket)) ?? { sans: "no station for this project: the app has nothing to read" };
  } catch (erreur) {
    lue = { sans: `not read: ${erreur instanceof Error ? erreur.message : String(erreur)}` };
  }
  if (!ficheDe(projet, ticket)) return;
  histoires.set(cle, lue);
  poserFiche();
}
// L'issue du ticket et sa discussion, sous ses gestes : le corps, puis chaque commentaire dans
// l'ordre, chacun avec son auteur et sa date, le markdown rendu (markdown.ts) — jamais en HTML :
// chaque texte est posé par `textContent`. Dessous, le champ du commentaire : rien ne part sans un
// clic sur son bouton, inactif tant que le champ est vide ; ce qui n'est pas parti se lit dessous,
// et le texte reste dans le champ.
/** @param {Projet} projet @param {number} ticket */
function poserDiscussion(projet, ticket) {
  const cle = `${projet.nom}#${ticket}`;
  const section = document.createElement("section");
  section.className = "discussion";
  section.ariaLabel = `issue #${ticket} and its discussion`;
  const lue = discussions.get(cle);
  if (lue === undefined) {
    section.append(bloc("p", LECTURE_DE(`issue #${ticket}`)));
    return section;
  }
  if ("sans" in lue) {
    section.append(ligneErreur(document, NON_ATTEINT("discussion"), lue.sans));
    return section;
  }
  /** @param {string} url */
  const ouvrir = (url) => void brigade.ouvrirLien(projet.nom, ticket, url);
  const fil = document.createElement("ol");
  for (const { auteur, at, blocs, corps } of lue.messages) {
    const message = document.createElement("li");
    if (corps === true) message.className = "corps";
    const tete = document.createElement("header");
    tete.append(bloc("strong", auteur), bloc("span", corps === true ? " opened the issue" : " commented"), exact("time", at));
    const rendu = document.createElement("div");
    rendu.className = "rendu";
    if (blocs.length === 0) {
      rendu.append(ligneVide(document, corps === true ? "no description" : "nothing visible — only markers GitHub does not show", { classe: "sans" }));
    } else rendu.append(...poserBlocs(blocs, ouvrir));
    message.append(tete, rendu);
    fil.append(message);
  }
  section.append(fil);
  if (!lue.ouverte) {
    section.append(ligneVide(document, "the issue is closed — a comment still posts on it", { classe: "sans" }));
  }
  section.append(...poserCommentaire(projet, ticket));
  return section;
}

// Le champ du commentaire, son bouton et son prix, et ce qu'il est advenu du dernier envoi.
/** @param {Projet} projet @param {number} ticket @returns {HTMLElement[]} */
function poserCommentaire(projet, ticket) {
  // En lecture seule (ticket 3163), aucun commentaire ne se poste d'ici.
  if (lectureSeuleDe(projet) !== undefined) return [];
  const cle = `${projet.nom}#${ticket}`;
  const etat = envoisDeCommentaire.get(cle);
  const envoi = etat !== undefined && "envoi" in etat;
  const saisie = /** @type {HTMLTextAreaElement} */ (document.createElement("textarea"));
  saisie.value = commentaires.get(cle) ?? "";
  saisie.rows = 3;
  saisie.ariaLabel = `a comment on issue #${ticket}`;
  saisie.placeholder = "add context to the issue — markdown, as on GitHub";
  saisie.disabled = envoi;
  const poster = bouton("post this comment", () => void envoyerCommentaire(projet, ticket));
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
  const demander = bouton("ask the second", () => void demanderAuSecond(projet, ticket));
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
    poses.push(ligneErreur(document, demandee.refus, "", { classe: "refus" }));
  }
  if (envoi) poses.push(bloc("p", "posting your comment on the issue…"));
  else if (etat !== undefined && etat.rendu.poste) {
    const poste = bloc("p", `comment posted on #${ticket} — ${etat.rendu.prix}`);
    poste.className = "postee";
    poses.push(poste);
  } else if (etat !== undefined && !etat.rendu.poste) {
    poses.push(ligneErreur(document, etat.rendu.refus, "", { classe: "refus" }));
  }
  return poses;
}

// Le commentaire part, au clic : le champ et son bouton attendent la réponse. Posté, le champ se
// vide et la discussion est relue — il y apparaît. Pas parti, le texte reste, et la raison se lit
// sous le champ ; un envoi dont rien ne dit s'il est arrivé fait aussi relire la discussion.
/** @param {Projet} projet @param {number} ticket */
async function envoyerCommentaire(projet, ticket) {
  const cle = `${projet.nom}#${ticket}`;
  const texte = commentaires.get(cle) ?? "";
  const avant = envoisDeCommentaire.get(cle);
  if (texte.trim() === "" || (avant !== undefined && "envoi" in avant)) return;
  envoisDeCommentaire.set(cle, { envoi: true });
  if (ficheDe(projet, ticket)) poserFiche();
  /** @type {import("../discussion.ts").Commente} */
  let rendu;
  try {
    rendu = await brigade.commenter(projet.nom, ticket, texte);
  } catch (erreur) {
    rendu = { poste: false, refus: `nothing was posted: ${erreur instanceof Error ? erreur.message : String(erreur)}` };
  }
  envoisDeCommentaire.set(cle, { rendu });
  // Un texte changé pendant l'envoi n'est pas celui qui est parti : il reste.
  if (rendu.poste && commentaires.get(cle) === texte) commentaires.delete(cle);
  if (ficheDe(projet, ticket)) poserFiche();
  if (rendu.poste) await lireDiscussion(projet, ticket);
}

// « ask the second », au clic : le process principal écrit la demande dans le second, sans Entrée. Le champ n'est pas
// vidé. Injoignable, rien n'est écrit, et la fiche dit pourquoi — la carte de TODO aussi. `ecrire` : ce qui part — de la
// fiche par défaut, avec son champ ; d'une carte de TODO, la carte passée au second (ticket 3133, passation-second.ts).
/** @param {Projet} projet @param {number} ticket @param {() => Promise<Terminal | { refus: string }>} [ecrire] */
async function demanderAuSecond(projet, ticket, ecrire = () => brigade.demanderAuSecond(projet.nom, ticket, commentaires.get(`${projet.nom}#${ticket}`) ?? "")) {
  const cle = `${projet.nom}#${ticket}`;
  const avant = demandesAuSecond.get(cle);
  if (avant !== undefined && "envoi" in avant) return;
  lacherLaCarteDe(projet.nom, ticket);
  const reposer = () => {
    if (ficheDe(projet, ticket)) poserFiche();
    if (courant?.nom === projet.nom) poserRail(projet);
  };
  demandesAuSecond.set(cle, { envoi: true });
  reposer();
  /** @type {{ envoi: true } | { parti: string } | { refus: string }} */
  let dit;
  try {
    const rendu = await ecrire();
    if ("refus" in rendu) dit = { refus: rendu.refus };
    else {
      garder(projet.nom, rendu);
      // Le second dit lui-même si la demande y est : non lancé, ou commande refusée, rien n'est écrit.
      dit = rendu.demandeEcrite === true ? { parti: `request about #${ticket} written in the second, without Enter — it is waiting for your Enter` } : { refus: `nothing was written: ${rendu.note}` };
    }
  } catch (erreur) {
    dit = { refus: `nothing was written: ${erreur instanceof Error ? erreur.message : String(erreur)}` };
  }
  demandesAuSecond.set(cle, dit);
  reposer();
  montrer();
}

// L'issue de ce ticket et sa discussion, lues sur sa box par le process principal. Une lecture partie
// avant une autre ne la remplace pas.
/** @param {Projet} projet @param {number} ticket */
async function lireDiscussion(projet, ticket) {
  const cle = `${projet.nom}#${ticket}`;
  /** @type {import("../discussion.ts").Discussion} */
  let lue;
  try {
    lue = (await brigade.lireDiscussion(projet.nom, ticket)) ?? { sans: "no station for this project: the app has nothing to read" };
  } catch (erreur) {
    lue = { sans: `not read: ${erreur instanceof Error ? erreur.message : String(erreur)}` };
  }
  if (!ficheDe(projet, ticket)) return;
  discussions.set(cle, lue);
  poserFiche();
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
        const ligne = document.createElement("li");
        // Une case de liste de tâches se lit, elle ne se coche pas d'ici.
        if (element.coche !== undefined) ligne.append(element.coche ? "☑ " : "☐ ");
        ligne.append(...poserBlocs(element.blocs, ouvrir));
        liste.append(ligne);
      }
      return liste;
    }
    if ("trait" in pose) return document.createElement("hr");
    if ("tableau" in pose) {
      const tableau = document.createElement("table");
      /** @param {string} balise @param {import("../markdown.ts").Mot[][]} rang */
      const ligne = (balise, rang) => {
        const tr = document.createElement("tr");
        tr.append(...rang.map((cellule) => avec(balise, poserMots(cellule, ouvrir))));
        return tr;
      };
      tableau.append(avec("thead", [ligne("th", pose.tableau.tete)]), avec("tbody", pose.tableau.lignes.map((rang) => ligne("td", rang))));
      return tableau;
    }
    const replie = document.createElement("details");
    replie.append(avec("summary", poserMots(pose.replie.resume, ouvrir)), ...poserBlocs(pose.replie.blocs, ouvrir));
    return replie;
  });
}

// Les mots d'une ligne rendue. Un lien ne navigue pas dans l'app : un clic demande au process
// principal de l'ouvrir dans le navigateur — l'adresse se lit au survol.
/** @param {import("../markdown.ts").Mot[]} mots @param {(url: string) => void} ouvrir @returns {(HTMLElement | string)[]} */
function poserMots(mots, ouvrir) {
  return mots.map((mot) => {
    if ("texte" in mot) return mot.texte;
    if ("code" in mot) return bloc("code", mot.code);
    if ("gras" in mot) return avec("strong", poserMots(mot.gras, ouvrir));
    if ("italique" in mot) return avec("em", poserMots(mot.italique, ouvrir));
    if ("barre" in mot) return avec("del", poserMots(mot.barre, ouvrir));
    if ("saut" in mot) return document.createElement("br");
    const lien = avec("a", poserMots(mot.contenu, ouvrir));
    lien.title = `open ${mot.lien} in your browser`;
    lien.tabIndex = 0;
    lien.addEventListener("click", (evenement) => {
      evenement.preventDefault();
      ouvrir(mot.lien);
    });
    lien.addEventListener("keydown", (evenement) => {
      if (evenement.key === "Enter") ouvrir(mot.lien);
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
/** @param {Projet} projet @param {number} ticket */
const ficheDe = (projet, ticket) => ouverte?.projet.nom === projet.nom && ouverte.carte.ticket === ticket;

// Les deux gestes qui lèvent une retenue `blocked-on-human` : retirer le label — le manager juge
// l'issue à son prochain tour —, ou la fermer, ce qui coûte : le chef le confirme, prix dit en une
// ligne. Ce qui en advient est dit à la place des boutons.
const PRIX_DE_FERMETURE = "the issue is closed on GitHub, in your name: the ticket leaves your queue and is not cooked — reopen it to bring it back";
/** @param {Projet} projet @param {number} ticket */
function poserLevees(projet, ticket) {
  const cle = `${projet.nom}#${ticket}`;
  const etat = levees.get(cle);
  if (etat !== undefined && "envoi" in etat) return [bloc("p", "working on it…")];
  if (etat !== undefined && "leve" in etat && etat.leve.fait) return [bloc("p", `${etat.leve.dit} — the card leaves your queue at the next read`)];
  /** @param {"label" | "fermer"} geste */
  const lancer = async (geste) => {
    levees.set(cle, { envoi: true });
    if (ficheDe(projet, ticket)) poserFiche();
    /** @type {import("../question.ts").Leve} */
    let leve;
    try {
      leve = await brigade.leverRetenue(projet.nom, ticket, geste);
    } catch (erreur) {
      leve = { fait: false, refus: `nothing was done: ${erreur instanceof Error ? erreur.message : String(erreur)}` };
    }
    levees.set(cle, { leve });
    if (ficheDe(projet, ticket)) poserFiche();
  };
  const retirer = boutonAction(document, "remove the label", () => void lancer("label"), { recommande: true });
  retirer.children[0].title = `remove \`${LABEL_RETENUE}\` from #${ticket}: nothing right away — the manager judges it again at its next tick, and may send it to the kitchen`;
  retirer.children[0].dataset.geste = "levee";
  const fermer = boutonAction(
    document,
    "close the issue",
    () => {
      levees.set(cle, { confirme: true });
      if (ficheDe(projet, ticket)) poserFiche();
    },
    { prix: PRIX_DE_FERMETURE },
  );
  fermer.children[0].dataset.geste = "levee";
  const refus = etat !== undefined && "leve" in etat && !etat.leve.fait ? [bloc("p", etat.leve.refus)] : [];
  if (etat === undefined || !("confirme" in etat)) return [retirer, fermer, ...refus];
  const renoncer = () => {
    levees.delete(cle);
    if (ficheDe(projet, ticket)) poserFiche();
  };
  return [retirer, fermer, confirmationDeGeste(document, { titre: `close issue #${ticket} on GitHub?`, prix: PRIX_DE_FERMETURE, oui: OUI("close the issue"), non: ANNULER }, { oui: () => void lancer("fermer"), non: renoncer })];
}

// La question de ce ticket, lue sur son issue par le process principal (question.ts) : la vue
// nomme le projet et le ticket. Une lecture partie avant une autre ne la remplace pas.
/** @param {Projet} projet @param {number} ticket */
async function lireQuestion(projet, ticket) {
  const cle = `${projet.nom}#${ticket}`;
  const enRoute = {};
  questions.set(cle, enRoute);
  /** @type {import("../question.ts").Lue} */
  let lue;
  try {
    // Rien : le bloc `attend` ne nomme plus ce ticket — il n'y a rien à lui demander.
    lue = (await brigade.lireQuestion(projet.nom, ticket)) ?? { a: new Date().toISOString(), aucune: true };
  } catch (erreur) {
    lue = { a: new Date().toISOString(), sans: erreur instanceof Error ? erreur.message : String(erreur) };
  }
  if (questions.get(cle) !== enRoute) return;
  questions.set(cle, { lue, quand: Date.now() });
  if (ficheDe(projet, ticket)) poserFiche();
  // La carte du ticket dit la question en deux lignes : le rail est redessiné de ce qui vient d'être lu —
  // sauf sous une fiche ouverte, dont le rail reste tel qu'il était : la prochaine lecture le met à jour.
  if (!ficheDe(projet, ticket) && courant?.nom === projet.nom && !rail.hidden && tenus.has(projet.nom)) poserRail(courant);
}

// Le titre de ce ticket, lu sur son issue par le process principal. À son arrivée le rail est redessiné.
/** @param {Projet} projet @param {number} ticket */
async function lireTitre(projet, ticket) {
  const cle = `${projet.nom}#${ticket}`;
  titres.set(cle, undefined);
  try {
    titres.set(cle, (await brigade.lireTitre(projet.nom, ticket)) ?? { sans: "no address" });
  } catch (erreur) {
    titres.set(cle, { sans: erreur instanceof Error ? erreur.message : String(erreur) });
  }
  if (courant?.nom === projet.nom && !rail.hidden && tenus.has(projet.nom)) poserRail(courant);
}

// La réponse du chef — un choix par sa lettre, ou sa phrase — part sur l'issue : c'est le process
// principal qui la relit et l'écrit (question.ts). Une seule à la fois ; ce qu'il en advient se pose
// sur la fiche, et une question qui a changé entre-temps revient à sa place.
/** @param {Projet} projet @param {number} ticket @param {{ question: string, vu: string, choix: string } | { question: string, vu: string, texte: string }} reponse */
async function repondreQuestion(projet, ticket, reponse) {
  const cle = `${projet.nom}#${ticket}`;
  const avant = questions.get(cle);
  if (avant?.envoi === true) return;
  questions.set(cle, { ...(avant?.lue === undefined ? {} : { lue: avant.lue }), envoi: true });
  if (ficheDe(projet, ticket)) poserFiche();
  /** @type {import("../question.ts").Rendue} */
  let rendue;
  try {
    rendue = await brigade.repondreQuestion(projet.nom, ticket, reponse);
  } catch (erreur) {
    rendue = { poste: false, refus: `nothing was posted: ${erreur instanceof Error ? erreur.message : String(erreur)}` };
  }
  const lue = (!rendue.poste ? rendue.lue : undefined) ?? avant?.lue;
  questions.set(cle, { ...(lue === undefined ? {} : { lue }), rendue, quand: Date.now() });
  if (rendue.poste) brouillons.delete(cle);
  if (ficheDe(projet, ticket)) poserFiche();
}

// Sur la fiche d'un ticket qui t'attend, la question que son issue pose : le commentaire du
// manager, mot pour mot — rien n'est reformulé —, ce qui a été écrit dessous depuis, puis la
// réponse : un bouton par choix qu'elle propose, un champ pour une phrase. Un clic sur un choix,
// et il part ; la phrase part par son bouton — Entrée ne l'envoie pas. Rien n'est choisi d'avance.
// Aucune question sur l'issue : rien n'est posé, l'entrée garde son geste.
/** @param {Projet} projet @param {number} ticket @param {{ lue?: import("../question.ts").Lue, envoi?: boolean, rendue?: import("../question.ts").Rendue, quand?: number }} etat */
function poserQuestion(projet, ticket, { lue, envoi, rendue }) {
  if (lue !== undefined && "aucune" in lue) return undefined;
  const section = document.createElement("section");
  section.className = "question";
  if (lue === undefined) {
    section.append(bloc("small", LECTURE_DE(`issue #${ticket}, for the question it asks`)));
    return section;
  }
  if ("sans" in lue) {
    section.append(ligneErreur(document, NON_ATTEINT("question"), lue.sans));
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
    const postee = bloc("p", `answer posted on #${ticket}, in your name: “${rendue.corps}” — the manager reads it at its next tick; until then the card waits for it in WAITING.`);
    postee.className = "postee";
    section.append(postee);
    return section;
  }
  // Répondue sur l'issue — ailleurs, ou avant : la fiche le dit, et la carte n'est plus dans TODO.
  if (question.repondue !== undefined) {
    const repondue = bloc("p", `answered on the issue by ${question.repondue.auteur}, ${dateHeure(question.repondue.a)} — the manager reads it at its next tick; until then the card waits for it in WAITING.`);
    repondue.className = "repondue";
    section.append(repondue);
  }
  // En lecture seule (ticket 3163), la question se lit, et ne se répond pas d'ici.
  if (lectureSeuleDe(projet) !== undefined) return section;
  // Ce que le chef a vu sous la question : rien ne part si quelque chose y a été écrit depuis.
  const vu = question.depuis.at(-1)?.url ?? "";
  const cle = `${projet.nom}#${ticket}`;
  const reponse = document.createElement("div");
  reponse.className = "reponse";
  for (const { lettre, texte: dit } of question.choix) {
    const choix = bouton(`${lettre}) ${dit}`, () => void repondreQuestion(projet, ticket, { question: question.url, vu, choix: lettre }));
    choix.className = "choix";
    choix.dataset.geste = "reponse";
    choix.title = `post “${lettre}) ${dit}” on issue #${ticket} as your answer — one click, and it is posted`;
    choix.disabled = envoi === true;
    reponse.append(choix);
  }
  const saisie = /** @type {HTMLTextAreaElement} */ (document.createElement("textarea"));
  saisie.value = brouillons.get(cle) ?? "";
  saisie.rows = 2;
  saisie.placeholder = question.choix.length > 0 ? "or answer in a sentence" : "your answer, in a sentence";
  saisie.disabled = envoi === true;
  const poster = bouton("post this answer", () => void repondreQuestion(projet, ticket, { question: question.url, vu, texte: saisie.value }));
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
  section.append(reponse, phrase);
  if (envoi === true) section.append(bloc("small", "posting your answer on the issue…"));
  if (rendue?.poste === false) {
    section.append(ligneErreur(document, rendue.refus, "", { classe: "refus" }));
  }
  return section;
}

// Un clic à côté du popup, sur le voile, la ferme aussi.
fiche.addEventListener("click", (evenement) => {
  if (evenement.target === fiche) fermerFiche();
});

// Échap ferme la fiche : elle a le clavier dès qu'elle s'ouvre.
fiche.addEventListener("keydown", (evenement) => {
  if (evenement.key !== "Escape") return;
  evenement.stopPropagation();
  fermerFiche();
});

// Le haut du rail ne dit rien d'une lecture récente. Passé ce délai sans lecture neuve — la box est
// relue toutes les trente secondes —, une mention discrète dit depuis quand.
const LECTURE_VIEILLE_MS = 120_000;
/** @param {number | string} a */
function fraicheur(a) {
  const age = Date.now() - new Date(a).getTime();
  if (!(age > LECTURE_VIEILLE_MS)) return [];
  const minutes = Math.floor(age / 60_000);
  const dit = bloc("p", `up to date ${minutes} min ago — the station has not answered since`);
  dit.className = "fraicheur";
  return [dit];
}
// L'âge du rail montré, toujours dit en clair (ticket 2054) : l'heure où la box a lu l'état qu'elle a publié — pas celle
// où l'app a lu GitHub, qui est toujours récente. Un rail que la box n'a pas republié depuis longtemps se voit ainsi.
/** @param {string} publieLe @param {string} lu */
function ageDuRail(publieLe, lu) {
  const minutes = Math.floor(Math.max(0, Date.parse(lu) - Date.parse(publieLe)) / 60_000);
  const age = minutes < 1 ? "less than a minute" : minutes < 60 ? `${minutes} min` : `${Math.floor(minutes / 60)} h ${String(minutes % 60).padStart(2, "0")}`;
  const dit = bloc("p", `rail as GitHub said it ${age} ago, at ${heureCourte(publieLe)}`);
  dit.className = "age-du-rail";
  dit.title = "The box publishes its rail on GitHub, and the app reads it every 30 seconds: this is the age of what the box published, not of the app's reading.";
  return dit;
}
// Le rail gardé d'une lecture ratée en ligne (ticket 2151), à la place de son âge : périmé, l'heure de la lecture montrée et
// son âge en clair (ticket 3008, rail-lecture-perimee.js). Les détails de la dernière lecture ratée ne s'y écrivent que si
// le panneau est à l'écran.
/** @param {{ depuis: string, raison: string }} perime @param {number | string} lu */
function signePerime({ raison }, lu) {
  const dite = direLaLecture({ reading: true, readAt: lu, stale: true, refusal: { kind: "other" } }, { maintenant: Date.now(), pourquoi: raison, panneauVisible: panneauAFicher() });
  return poserLaLecture(document, dite);
}
// Le signe de l'app hors ligne (ticket 1818), à la place de toute erreur.
/** @param {string} depuis */
function signeHorsLigne(depuis) {
  const signe = bloc("p", `offline since ${heureCourte(depuis)}`);
  signe.className = "hors-ligne";
  signe.title = `GitHub cannot be reached from ${CET_ORDINATEUR}: what is shown is the last state the app read. It is read again on its own when the network comes back.`;
  return signe;
}
// Le réseau revient : la lecture n'attend pas son tour.
window.addEventListener?.("online", () => {
  if (horsLignes.size > 0) lireLesFaits();
});

// La box d'un projet ne répond pas (alertes.ts, `injoignable`) : depuis quand, d'après la première
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
/** @param {Projet} projet */
function chargerFeu(projet) {
  const feu = feux.get(projet.nom);
  if (feuxEnRoute.has(projet.nom) || (feu !== undefined && Date.now() - new Date(feu.a).getTime() < FEU_VIEUX_MS)) return;
  feuxEnRoute.add(projet.nom);
  void brigade.lireFeu(projet.nom).then((lu) => {
    feuxEnRoute.delete(projet.nom);
    // Sans réponse, la lecture est dite faite quand même : sinon le rail, redessiné, la relancerait aussitôt, sans fin.
    feux.set(projet.nom, lu ?? { a: new Date().toISOString(), sans: "the app has no answer for this project" });
    if (courant?.nom === projet.nom && muets.has(projet.nom) && !rail.hidden) poserRail(courant);
  });
}
// La liste des tickets `fire` lus sur GitHub, d'un projet muet : repliée, sous ce qu'elle est. Dépliée, des
// lignes comme celles du reste de la page — un numéro qui ouvre l'issue, son titre, sa priorité.
// Ce que le chef a déplié le reste d'un redessin à l'autre.
/** @type {Set<string>} */
const feuxDeplies = new Set();
/** @param {Projet} projet */
function poserMuet(projet) {
  chargerFeu(projet);
  const feu = feux.get(projet.nom);
  const liste = document.createElement("details");
  liste.className = "feu";
  liste.open = feuxDeplies.has(projet.nom);
  liste.addEventListener("toggle", () => {
    if (liste.open) feuxDeplies.add(projet.nom);
    else feuxDeplies.delete(projet.nom);
  });
  const nombreDit = feu === undefined || "sans" in feu ? "" : `, ${feu.tickets.length}`;
  liste.append(bloc("summary", feu === undefined ? "the tickets in the kitchen according to GitHub — reading…" : `the tickets in the kitchen according to GitHub${nombreDit}`));
  if (feu === undefined) return [liste];
  if ("sans" in feu) liste.append(bloc("p", "GitHub did not answer either:"), bloc("pre", feu.sans));
  else if (feu.tickets.length === 0) liste.append(bloc("p", "no open ticket labelled `fire`"));
  else {
    const lignes = document.createElement("ol");
    lignes.append(
      ...feu.tickets.map(({ ticket, titre, prio }) => {
        const ligne = document.createElement("li");
        const ouvrir = cliquable("", () => void ouvrirIssue(projet, ticket));
        ouvrir.title = `open #${ticket} on GitHub`;
        ouvrir.append(exact("span", `#${ticket}`), bloc("span", titre));
        ligne.append(ouvrir, ...(prio === undefined ? [] : [bloc("small", prio)]));
        return ligne;
      }),
    );
    liste.append(lignes);
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
/** @param {Projet} projet @param {boolean} arretee */
function poserArreter(projet, arretee) {
  // En lecture seule (ticket 3163), la cuisine ne s'arrête ni ne reprend d'ici.
  const geste = lectureSeuleDe(projet) !== undefined ? undefined : GESTES_DE_LA_CUISINE.find(({ id }) => id === (arretee ? "reprendre" : "stop"));
  arreterCuisine.hidden = geste === undefined;
  sectionCuisine.hidden = geste === undefined;
  if (geste === undefined) {
    arreterCuisine.replaceChildren();
    return poserLesGroupes();
  }
  const [declencheur, ...dessous] = poserGeste(projet, { ...geste, ou: "parametres" });
  if (declencheur !== undefined && !arretee) {
    declencheur.dataset.arret = "";
    sorteDuBouton(declencheur, "danger");
  }
  arreterCuisine.replaceChildren(rangeeDeReglage("Kitchen", [bloc("span", arretee ? "stopped" : "running")], declencheur === undefined ? [] : [declencheur], dessous));
  poserLesGroupes();
}

// Dans la bande du haut du rail, ce qui est avant lui (amont.ts, tickets 1836, 3013) : son nombre d'issues, les comptes
// au survol ; un clic déplie la colonne Backlog, un autre la replie. Quand aucun ticket n'est sur le rail, la phrase qui
// dit ce qui est avant lui est celle de la colonne On the rail (ticket 2486). Tout est déjà dit par le process principal :
// la vue pose.
/** @param {Projet} projet */
function backlogDe(projet) {
  return {
    vu: amonts.get(projet.nom),
    deplie: amontsDeplies.has(projet.nom),
    basculer: () => {
      const deplier = !amontsDeplies.has(projet.nom);
      if (deplier) amontsDeplies.add(projet.nom);
      else amontsDeplies.delete(projet.nom);
      poserRail(projet);
      // Redessiné, le backlog garde le clavier — et sa bulle reste ouverte, comme au toucher.
      backlogDuRail?.focus?.();
      // Dépliée, la colonne est à gauche de « On the rail » : la rangée revient à son début pour la montrer.
      const rangee = rangees.get(projet.nom);
      if (deplier && rangee !== undefined) rangee.scrollLeft = 0;
    },
  };
}
/** @param {Projet} projet */
const tempsVuDe = (projet) => JSON.stringify(projetsVus?.projets.find(({ nom }) => nom === projet.nom)?.temps ?? null);
// Rien sur le rail : sa colonne dit ce qui est avant lui — elle ne laisse pas croire le projet fini.
/** @param {Projet} projet */
function railVide(projet) {
  return amonts.get(projet.nom)?.vide ?? `${PAS_ENCORE("ticket on the rail")} What is before it is being read…`;
}

// La bande du haut de l'onglet Rail (tickets 2486, 3013) : une seule ligne de chiffres — le temps d'un ticket, le premier
// coup, les cooks en cours, le dernier merge, le backlog —, chacun posé seulement s'il a une valeur
// (projet/rail/bande-rail.js) ; l'âge du rail montré au bout. Sans tableau lu, ni cooks ni backlog. Les cooks en cours :
// ceux que les faits nomment, sinon un par ticket de Taken — ce que GitHub dit.
/** @param {Projet} projet @param {import("../faits.ts").Tableau} [tableau] @param {HTMLElement[]} [apres] */
function bandeDuRail(projet, tableau, apres = []) {
  const vu = projetsVus?.projets.find(({ nom }) => nom === projet.nom);
  tempsDesBandes.set(projet.nom, tempsVuDe(projet));
  const maintenant = new Date().toISOString();
  if (tableau === undefined) return poserBandeRail(document, { temps: vu?.temps, maintenant, apres });
  const { enCours } = tableau.cooks;
  const pris = tableau.compteurs.find(({ libelle }) => libelle === "taken")?.nombre ?? 0;
  const cooks = enCours.length > 0 ? { nombre: enCours.length, tickets: enCours.map(({ ticket, titre, station }) => `#${ticket} ${titre} — ${station}`) } : { nombre: pris, tickets: [] };
  const bande = poserBandeRail(document, { temps: vu?.temps, maintenant, cooks, backlog: backlogDe(projet), apres });
  // Le bouton du backlog, sous l'enveloppe de son survol : c'est lui qui reprend le clavier.
  const poses = /** @type {HTMLElement[]} */ ([...bande.children]).map((pose) => /** @type {HTMLElement | undefined} */ (pose.className === "survol" ? pose.children[0] : pose));
  backlogDuRail = poses.find((pose) => pose?.className === "bande-part bande-backlog");
  return bande;
}

// La tête du rail, la cuisine oisive avec des cartes dessus (ticket 1863) : une panne, en rouge, au-dessus de tout le
// reste — depuis combien de temps, et combien de cartes, d'une ligne ; les tickets et ce qu'en faire au survol. Elle
// part dès que `facts` ne la porte plus.
/** @param {Projet} projet @param {import("../faits.ts").Tableau} tableau @returns {HTMLElement[]} */
function panneDuRail(projet, { panne }) {
  if (panne === undefined) return [];
  const ligne = document.createElement("p");
  ligne.className = "panne-du-rail";
  ligne.role = "alert";
  ligne.title = panne.survol;
  const marque = bloc("span", "FAULT");
  marque.className = "marque";
  ligne.append(marque, bloc("strong", panne.dit), ...signalement.poser({ projet: projet.nom, reference: { ligne: "cook." }, panne: `${projet.nom}: ${panne.dit}` }));
  return [ligne];
}

// La tête du rail, le projet éteint (tickets 906, 1406) : marquée à l'arrêt, d'une ligne courte — rien de
// neuf n'est pris, découpé ni mergé. Les cooks en cours finissent. Allumé, pas encore lu ou pas lu,
// rien : l'interrupteur, en tête de l'espace, dit ce qu'il en est.
/** @param {Projet} projet @returns {HTMLElement[]} */
function teteDuRail(projet) {
  const lu = etatsDuManager.get(projet.nom);
  if (lu === undefined || "sans" in lu || lu.allume) return [];
  const tete = document.createElement("p");
  tete.className = "arret-manager";
  tete.append(pastille("off", "gris"), bloc("strong", lu.dit ?? "project off"));
  tete.title = `${lu.releve}\nturn it on with its switch, at the top of the space`;
  return [tete];
}

// La colonne Backlog, dépliée par la barre, à gauche de « On the rail » : les cartes du rail, groupées par état dans
// l'ordre de la barre, chacune triée par `prio:` — son numéro ouvre son issue, sa ligne dit ce qui la retient, un clic
// ouvre sa fiche. Une lecture ratée y dit pourquoi, jamais « rien ».
/** @param {Projet} projet @param {(cartes: import("../faits.ts").Carte[], etat?: import("./composants/pastille/pastille.js").Etat) => HTMLElement} bons */
function colonneBacklog(projet, bons) {
  const vu = amonts.get(projet.nom);
  if (vu === undefined || "nonPublie" in vu || !amontsDeplies.has(projet.nom)) return [];
  const colonne = document.createElement("section");
  colonne.className = "colonne backlog";
  colonne.ariaLabel = "Backlog: the open issues before the rail";
  colonne.dataset.ton = "gris";
  const tete = document.createElement("h4");
  const replier = bouton("fold", () => {
    amontsDeplies.delete(projet.nom);
    poserRail(projet);
  }, "discret");
  replier.className = "replier";
  replier.title = "fold the Backlog column";
  const compte = bloc("span", "compte" in vu ? String(vu.compte) : "?");
  compte.className = "compte";
  tete.append(pastilleDEtat(document, "queued", "Backlog"), compte, replier);
  colonne.append(tete);
  if ("sans" in vu) {
    colonne.append(ligneVide(document, vu.sans, { classe: "sans" }));
    return [colonne];
  }
  if (vu.groupes.length === 0) colonne.append(bloc("p", "nothing before the rail: every open issue of the repository is on it"));
  for (const { etat, nom, issues } of vu.groupes) {
    const groupe = document.createElement("section");
    groupe.className = "groupe";
    groupe.dataset.etat = etat;
    const titre = document.createElement("h5");
    titre.append(bloc("span", nom), bloc("span", String(issues.length)));
    groupe.append(titre, bons(issues.map(({ carte }) => carte), "queued"));
    colonne.append(groupe);
  }
  return [colonne];
}

// Ce que dit la page d'un projet qui cuit sur cet ordinateur quand la station de cet ordinateur ne tourne pas.
const STATION_ARRETEE = `${CET_ORDINATEUR}'s station is not running`;

// La ligne d'alerte de Rail (ticket 1185), d'après les derniers faits du projet — rien tant que sa box ne répond pas : ce
// qu'ils en disaient n'est plus lu — et ce que la station du projet publie de l'accès à son dépôt et de son refus
// (projets/demande.ts) ; elle ouvre Stations, qui le détaille.
/** @param {Projet} projet */
function poserCuisson(projet) {
  const tenu = tenus.get(projet.nom);
  const stations = tenu !== undefined && "tableau" in tenu && !muets.has(projet.nom) ? tenu.tableau.stations : undefined;
  const vu = projetsVus?.projets.find(({ nom }) => nom === projet.nom);
  const alerte = ligneDAlerte(document, {
    alerte: stations?.alerte ?? null,
    refusee: stations?.lignes.some(({ etat }) => etat === "refused") ?? false,
    acces: vu?.acces ?? vu?.worktree?.acces ?? null,
    clone: vu?.clone ?? null,
    refus: vu?.refus ?? null,
    ouvrir: () => choisirOnglet(STATIONS),
  });
  const refus = lignesDeRefus(document, stations?.lignes ?? []);
  alerteDeCuisine.hidden = alerte === null && refus.length === 0;
  alerteDeCuisine.replaceChildren(...(alerte === null ? [] : [alerte]), ...refus);
}

// L'onglet Stations (ticket 3195, stations-tab/) : un seul composant — la ligne du haut, une carte par station qui sert le
// projet, le choix de station. Ce qu'il montre se tire de ce que l'app lit déjà : la cuisson du projet (ses faits), les
// stations appairées et ce que leurs suivis disent du projet (son déménagement), les stations du compte, et la liste de la
// station de cet ordinateur (ticket 3402). Ses gestes sont ceux que l'app a déjà : « Choose who cooks it » et « Add a
// station » sont l'ajout d'une station (projet/stations/AjoutStation.js) ; « Move to another station », le déménagement de
// sa cuisine (`demenager`) ; « Stop cooking here », la liste de cet ordinateur, la sélection d'une station du compte, ou le
// retrait d'une station que le projet déclare (projet/stations/ArretStation.js) ; le bloc des projets servis, caché avec
// ce qui était sous « This machine » (ticket 2494), la lit sans la changer. Les stations du compte se relisent à chaque
// ouverture de l'onglet. Sur un écran étroit, l'onglet se lit sans rien régler (ticket 1186).
let enregistreesARelire = true;
// Par projet : les stations dont « Details » est déplié — la lecture suivante le garde déplié.
/** @type {Map<string, Set<string>>} */
const detailsOuverts = new Map();
// La station dont « Stop cooking here » attend son « yes », ou s'écrit — une à la fois.
/** @type {{ projet: string, id: string, enCours: boolean } | undefined} */
let arretDemande;
// Ce que le dernier arrêt a rendu, sous la ligne du haut — refusé, sa raison, son détail au survol.
let arretDitPour = { projet: "", texte: "", refus: false, detail: "" };
// Le déménagement que le chef vient de demander, par projet, tant que les stations n'en publient rien : la ligne du haut le
// suit dès le clic.
/** @type {Map<string, { de: string, vers: string, depuis: number }>} */
const deplacementsDemandes = new Map();
// L'onglet se repose quand un déménagement en route passe sa minute : il dit alors ce qui le bloque.
/** @type {ReturnType<typeof setTimeout> | undefined} */
let minuteDuDeplacement;

// L'onglet n'a que son composant (ticket 3195) : toutes les stations du compte et « + station » sont sur l'accueil. Les
// stations du compte se relisent à chaque ouverture de l'onglet : elles disent celles qui servent le projet.
/** @param {Projet} projet */
function poserOngletStations(projet) {
  if (enregistreesARelire) {
    enregistreesARelire = false;
    void lireLesEnregistrees();
  }
  rail.replaceChildren(ongletDesStations(projet));
}

/** @param {Projet} projet */
function ongletDesStations(projet) {
  const maintenant = Date.now();
  const tenu = tenus.get(projet.nom);
  const cuisson = tenu !== undefined && "tableau" in tenu && !muets.has(projet.nom) ? tenu.tableau.stations : undefined;
  const stations = stationsVues?.stations ?? [];
  const locale = projetsVus?.locale ?? null;
  const vuDuProjet = projetsVus?.projets.find(({ nom }) => nom === projet.nom);
  // Lues : sa cuisson, ses stations sur GitHub, ou celles qu'il déclare — l'une suffit pour dire qui le cuit.
  const lues = cuisson !== undefined || (stationsVues !== undefined && projetsVus !== undefined) || declarees.has(projet.nom);
  const lesDeclarees = declarees.get(projet.nom)?.declarees ?? [];
  const luLe = tenu === undefined ? Number.NaN : Date.parse(tenu.a);
  // Ce que la liste de la station de cet ordinateur dit du projet (tickets 3399, 3402) : elle fait foi pour sa carte.
  const iciSert = serviParCetOrdinateur(projet);
  const base = {
    projet: projet.nom,
    lignes: cuisson?.lignes ?? [],
    stations,
    declarees: lesDeclarees.map(({ nom, distante }) => ({ nom, distante })),
    locale,
    ici: projet.ici === true,
    maintenant,
    ...(Number.isNaN(luLe) ? {} : { lu: luLe }),
    ...(iciSert === undefined ? {} : { iciSert, hote: POSTE.nom }),
  };
  const sans = servantesDe(base);
  const deplacement = deplacementSuivi({ publie: vuDuProjet?.demenagement, demande: deplacementsDemandes.get(projet.nom), servantes: sans, stations });
  if (deplacement === null) deplacementsDemandes.delete(projet.nom);
  const servantes = deplacement === null ? sans : servantesDe({ ...base, vers: deplacement.vers });
  // Les tickets `fire` qui attendent : le compteur « rail » de son tableau, lu ; sinon, la ligne n'en dit rien.
  const fire = tenu !== undefined && "tableau" in tenu ? tenu.tableau.compteurs.find(({ libelle }) => libelle === "rail")?.nombre : undefined;
  const haut = hautDe({ servantes, deplacement, maintenant, ...(fire === undefined ? {} : { fire }) });
  clearTimeout(minuteDuDeplacement);
  if (haut.etat === "deplacement" && haut.bloque === null) minuteDuDeplacement = setTimeout(reposerLOngletStations, haut.depuis + UNE_MINUTE_MS - maintenant);

  // Le déménagement de sa cuisine : offert, vers quelles stations, ou pourquoi pas (`deplacementDe`, plus bas).
  const ou = ouCuit(projet, cuisineDe(projet).stations);
  const enCours = vuDuProjet?.demenagement ?? null;
  const deplacable = deplacementDe(projet, ou, enCours, stationsVues !== undefined && projetsVus !== undefined);
  const choixDuMove = choixDuDeplacement(deplacable.destinations, { locale, ordinateur: estUnOrdinateur });
  // « Choose who cooks it » : l'étape d'ajout d'une station — cet ordinateur d'abord, puis les stations du compte.
  const { ajout } = ajoutDeStationDe(projet);
  const etatDeLAjout = ajoutDeStation.etatDe(projet.nom);
  const lecture = etroit();
  const sienneIci = laStationLocale();
  const ramenee = haut.etat === "hors-ligne" ? RAMENER(haut.station, haut.sorte !== "box") : "";
  const versIciParDeplacement = deplacable.offert && choixDuMove.some(({ cle }) => cle === locale);
  const versIci = !lecture && haut.etat === "hors-ligne" && !haut.ici && (versIciParDeplacement || ajout?.donnees.iciOffert === true);
  // Personne ne le cuit : cet ordinateur le sert d'un clic, par sa liste — celle de Settings (ticket 3399).
  const cuireIci = !lecture && haut.etat === "personne" && ajout?.donnees.iciOffert === true;

  /** @type {import("./stations-tab/stations-tab.js").VuDeLOnglet["choix"]} */
  let choix;
  if (!lecture && demenagement?.projet === projet.nom && ou !== undefined) {
    choix = { titre: OU_DEPLACER(projet.nom, ou.ici && ou.nom === "" ? POSTE.nom : ou.nom), choix: choixDuMove, deplacement: true, ...(demenagement.vers === undefined ? {} : { enCours: demenagement.vers }) };
  } else if (!lecture && ajout !== undefined && etatDeLAjout.ouvert) {
    const offerts = choixDeStation({ ici: ajout.donnees.iciOffert, hote: sienneIci?.nom ?? "", stations: ajout.donnees.stations, maintenant });
    choix = { titre: servantes.length > 0 ? QUI_D_AUTRE(projet.nom) : QUI_CUIT_ONGLET(projet.nom), choix: offerts, deplacement: false, ...(etatDeLAjout.enCours === undefined ? {} : { enCours: etatDeLAjout.enCours }), ...(etatDeLAjout.refus === undefined ? {} : { refus: etatDeLAjout.refus }) };
  }

  // Ce que le dernier geste a rendu : l'arrêt d'une station, le déménagement, l'ajout — refusé, sa raison.
  const refusParElle = enCours !== null && enCours.etape === "refusee" ? `${projet.nom} stays on ${enCours.de}: ${enCours.vers} refused to take it over — ${enCours.dit}` : "";
  const dits = [
    ...(arretDitPour.projet === projet.nom && arretDitPour.texte !== "" ? [arretDitPour] : []),
    // Un déménagement parti se lit sur la ligne du haut ; refusé, sa raison se dit ici.
    ...(demenagementDitPour.projet === projet.nom && demenagementDitPour.refus ? [{ texte: demenagementDitPour.dit, refus: true, detail: demenagementDitPour.detail }] : refusParElle === "" ? [] : [{ texte: refusParElle, refus: true, detail: "" }]),
    ...(ajout !== undefined && !etatDeLAjout.ouvert && etatDeLAjout.fait !== undefined ? [{ texte: FAIT_DIT(etatDeLAjout, projet.nom), refus: false, detail: "" }] : []),
    // La ligne que `status` écrit en tête quand la base rouge est en réparation : elle dit pourquoi rien ne cuit.
    ...(tenu !== undefined && "tableau" in tenu && tenu.tableau.rienNeCuit !== undefined ? [{ texte: tenu.tableau.rienNeCuit, refus: false, detail: "" }] : []),
  ];

  const ouverts = detailsOuverts.get(projet.nom) ?? new Set();
  detailsOuverts.set(projet.nom, ouverts);
  /** @type {Map<string, any[]>} */
  const details = new Map();
  for (const station of lecture ? [] : servantes) {
    const { lignes, declaree } = detailsDeLaStation(projet, station, cuisson?.lignes);
    details.set(cleDe(station), lignes);
    // La station où « Cook it on a station that has it » offre une capacité : son « Details » s'ouvre.
    if (capaciteOfferte?.projet === projet.nom && declaree?.nom === capaciteOfferte.nom) {
      ouverts.add(cleDe(station));
      capaciteOfferte = undefined;
    }
  }

  const pose = poserLOngletDesStations(
    document,
    {
      projet: projet.nom,
      poste: POSTE.nom,
      lues,
      haut,
      ramener: ramenee,
      versIci,
      cuireIci,
      servantes,
      enCuisson: cuisson !== undefined && !horsLignes.has(projet.nom) && !perimes.has(projet.nom) && tenu !== undefined && "tableau" in tenu && !tenu.tableau.arretee,
      ...(choix === undefined ? {} : { choix }),
      ...(dits.length === 0 ? {} : { dit: dits[0] }),
      deplacable: { offert: !lecture && deplacable.offert, pourquoi: lecture ? "" : deplacable.pourquoiPas },
      ...(arretDemande?.projet === projet.nom ? { arret: { id: arretDemande.id, enCours: arretDemande.enCours } } : {}),
      details,
      ouverts,
      lecture,
      quiCuit: ajout !== undefined,
    },
    {
      choisirQuiCuit: () => ajout?.gestes.ouvrir(),
      deplacer: () => ouvrirLeChoixDeMachine(),
      versIci: () => {
        if (versIciParDeplacement && locale !== null && ou !== undefined) {
          demenagement = { projet: projet.nom, part: false };
          return void demenager(projet, locale, { nomme: sienneIci?.nom ?? POSTE.nom, depuis: ou.nom, garder: false });
        }
        if (ajout === undefined) return;
        ajout.gestes.ouvrir();
        ajout.gestes.servirIci();
      },
      cuireIci: () => {
        if (ajout === undefined) return;
        ajout.gestes.ouvrir();
        ajout.gestes.servirIci();
      },
      choisir: (un) => {
        if (demenagement?.projet === projet.nom && ou !== undefined) {
          const station = deplacable.destinations.find(({ id }) => id === un.cle);
          return void demenager(projet, un.cle, { nomme: station?.nom ?? un.nom, depuis: ou.ici && ou.nom === "" ? POSTE.nom : ou.nom, garder: un.cle === ou.id });
        }
        if (ajout === undefined) return;
        if (un.cle === ICI) return ajout.gestes.servirIci();
        const station = ajout.donnees.stations.find(({ id }) => id === un.cle);
        if (station !== undefined) ajout.gestes.confier(station);
      },
      annuler: () => {
        if (demenagement?.projet === projet.nom) {
          fermerDemenagement();
          return reposerLOngletStations();
        }
        ajout?.gestes.annuler();
      },
      arreter: (cle) => {
        arretDemande = { projet: projet.nom, id: cle, enCours: false };
        arretDitPour = { projet: "", texte: "", refus: false, detail: "" };
        reposerLOngletStations();
      },
      confirmerArret: (cle) => void arreterLaStation(projet, servantes.find((station) => cleDe(station) === cle)),
      renoncerArret: () => {
        arretDemande = undefined;
        reposerLOngletStations();
      },
      basculer: (cle, ouvert) => void (ouvert ? ouverts.add(cle) : ouverts.delete(cle)),
    },
  );
  return pose;
}

// « Stop cooking here » : la station ne prend plus les tickets du projet, par le geste que l'app a pour elle
// (projet/stations/ArretStation.js) — cet ordinateur, par sa liste, et sa sélection si elle le porte ; une station du compte,
// par sa sélection ; une station que le projet déclare, par son retrait (ticket 2914). Aucun de ces gestes : rien ne part,
// la ligne dit pourquoi. Ce que le geste rend est relu : un projet encore servi le dit, le bouton reste.
/** @param {Projet} projet @param {import("./stations-tab/etat.js").Servante | undefined} station */
async function arreterLaStation(projet, station) {
  if (station === undefined || arretDemande?.projet !== projet.nom || arretDemande.enCours) return;
  const depot = projet.depot ?? projetsVus?.projets.find(({ nom }) => nom === projet.nom)?.depot ?? "";
  const lues = enregistreesAbsentes ? undefined : etatDesEnregistrees.stations;
  const enregistree = lues?.state === "listed" ? lues.stations.find(({ id }) => id === station.id) : undefined;
  const lesDeclarees = declarees.get(projet.nom)?.declarees ?? [];
  const lue = servis.etat?.lecture;
  const servisIci = lue !== undefined && "depots" in lue ? lue.depots : undefined;
  const declaree = lesDeclarees.find(({ nom }) => nom === station.nom || nom === nomDePrise(station.nom));
  const geste = gesteDArret(
    {
      projet: projet.nom,
      depot,
      station: { nom: station.nom, ici: station.ici },
      ...(servisIci === undefined ? {} : { liste: servisIci }),
      ...(enregistree === undefined ? {} : { selection: { id: enregistree.id, depots: enregistree.selection ?? [] } }),
      ...(declaree === undefined ? {} : { declaree: { nom: declaree.nom, seule: lesDeclarees.length <= 1 } }),
    },
    {
      retirerIci: async (un) => (await brigade.servirUnProjet?.(un, false)) ?? { refus: NON_ATTEINT(`${CET_ORDINATEUR}'s station`) },
      choisir: async (id, depots) => (await brigade.choisirLesProjets?.(id, depots)) ?? { refus: "the app gave no answer" },
      retirerDeclaree: (nom) => brigade.changerUneStation(projet.nom, nom, { retiree: true }),
    },
  );
  if (geste === undefined || "seule" in geste) {
    arretDemande = undefined;
    // La seule station que le projet déclare ne se retire pas (stations-declarees.js) : sans elle, aucun cook ne part.
    arretDitPour = { projet: projet.nom, texte: geste === undefined ? SANS_GESTE(station.nom) : `nothing was changed: ${SEULE}`, refus: true, detail: "" };
    return reposerLOngletStations();
  }
  arretDemande.enCours = true;
  reposerLOngletStations();
  const dit = await arreter(geste);
  arretDemande = undefined;
  arretDitPour = { projet: projet.nom, ...dit };
  void servis.lire();
  void lireLesEnregistrees();
  if (courant?.nom === projet.nom) reposerLOngletStations();
}

// « Details » d'une station : ses réglages et ses lectures, chacun avec son contrôle. Ceux de cet ordinateur — ses dossiers,
// son bac à sable, sa connexion à Claude (projet/stations/StationLocale.js) — ; sa connexion à Claude, pour une autre ; et,
// quand le projet la déclare, combien de cooks elle fait tourner à la fois, ce qu'elle fournit et si elle prend les tickets
// ordinaires (projet/stations/ReglagesStation.js).
/**
 * @param {Projet} projet @param {import("./stations-tab/etat.js").Servante} station @param {readonly import("../cuisson.ts").LigneDeStation[] | undefined} lignes
 * @returns {{ lignes: any[], declaree: import("../service.ts").StationDeclaree | undefined }}
 */
function detailsDeLaStation(projet, station, lignes) {
  const lue = (stationsVues?.stations ?? []).find(({ id }) => id === station.id);
  const lues = declarees.get(projet.nom);
  // Sa déclaration : celle qui porte son nom, ou son nom de prise — une seule carte par station déclarée.
  const declaree = lues?.declarees.find((une) => une.nom === station.nom || une.nom === station.prise || une.nom === nomDePrise(station.nom));
  const ici = station.ici ? lignesDeCetOrdinateur(projet) : lue === undefined ? [] : [connexionALaStation(document, lue)];
  // Le plafond du projet sur elle, comme sa box le dit (ticket 1292), et ce qui la sature.
  const plafonds = accueilVu?.plafonds?.[projet.nom];
  const cap = plafonds?.[station.prise ?? station.nom] ?? plafonds?.[station.nom] ?? plafonds?.[nomDePrise(station.nom)];
  return {
    lignes: [...ici, ...(cap === undefined ? [] : plafondLu(document, cap, { declaree: declaree !== undefined })), ...(declaree === undefined || lues === undefined ? [] : [reglagesDeLaStationDeclaree(projet, declaree, lues, lignes)])],
    declaree,
  };
}

// Les réglages d'une station que le projet déclare (ticket 2488) : ce que le chef y saisit est gardé, par projet puis par
// station ; l'option des tickets ordinaires de ce poste, telle que sa dernière lecture l'a rendue (`poserOrdinaires`).
/** @type {Map<string, Map<string, import("./projet/stations/ReglagesStation.js").Saisie>>} */
const saisiesDesStations = new Map();
/** @type {Map<string, import("../ordinaires.ts").Bloc | undefined>} */
const ordinairesVus = new Map();
/**
 * @param {Projet} projet @param {import("../service.ts").StationDeclaree} declaree @param {import("../service.ts").StationsLues} lues
 * @param {readonly import("../cuisson.ts").LigneDeStation[] | undefined} lignes
 */
function reglagesDeLaStationDeclaree(projet, declaree, lues, lignes) {
  const saisies = saisiesDesStations.get(projet.nom) ?? new Map();
  saisiesDesStations.set(projet.nom, saisies);
  const ordinaires = ordinairesVus.get(projet.nom);
  // Ce que le dernier changement des tickets ordinaires de ce poste a rendu, sous leur rangée : en route, ou refusé.
  const ordinairesDit = ordinairesEnCours.has(projet.nom) ? ORDINAIRES_EN_COURS : ordinairesRefuses.projet === projet.nom && ordinairesRefuses.refus !== "" ? { refus: ordinairesRefuses.refus } : undefined;
  // Ses cases : celles qu'elle déclare, celles des autres stations, et ce que cet ordinateur sait déclarer (ticket 1307).
  const saisie = saisieDe(saisies, declaree, lues);
  for (const offerte of choixDeCapacites(declaree, lues, catalogueDe(projet))) if (!saisie.choix.some(({ capacite }) => capacite === offerte.capacite)) saisie.choix.push(offerte);
  return reglagesDeLaStation(document, declaree, saisie, {
    ici: projet.ici === true,
    ...(ordinaires === undefined ? {} : { ordinaires }),
    ...(ordinairesDit === undefined ? {} : { ordinairesDit }),
    ...(lignes === undefined ? {} : { lignes }),
    gestes: gestesDesReglages(projet),
  });
}

// Ce que cet ordinateur sait déclarer — le catalogue de « + station » (ticket 1307) —, lu une fois par projet : les cases
// des capacités de chaque station déclarée l'offrent. Illisible, elles n'offrent que ce que les stations déclarent.
/** @type {Map<string, readonly import("../projets/projets.ts").CapaciteDeLaMachine[]>} */
const cataloguesLus = new Map();
/** @param {Projet} projet */
function catalogueDe(projet) {
  const lu = cataloguesLus.get(projet.nom);
  if (lu !== undefined) return lu;
  cataloguesLus.set(projet.nom, []);
  void defautsDeCetOrdinateur(projet.nom).then((defauts) => {
    if ("refus" in defauts || defauts.capacites.length === 0) return;
    cataloguesLus.set(projet.nom, defauts.capacites);
    if (courant?.nom === projet.nom) reposerLOngletStations();
  });
  return [];
}

// La station de cet ordinateur (ticket 2489, projet/stations/StationLocale.js) : ses dossiers, son bac à sable, sa
// connexion à Claude. Lus à l'ouverture de l'onglet, puis toutes les trente secondes tant qu'il se repose ; ses gestes sont
// ceux que l'app avait déjà — le réglage des tickets ordinaires de Settings, le login de la panne de connexion. Ses lignes
// restent posées tant que ce qu'elles montrent ne change pas — le chef peut être en train d'écrire combien de cooks à la
// fois : une relecture ne le lui ôte pas.
const RELECTURE_DE_LA_STATION_LOCALE_MS = 30_000;
/** @typedef {Omit<import("./projet/stations/StationLocale.js").EtatDeLaStationLocale, "poste" | "projet" | "station"> & { projet: string, a: number }} LuDeLaStationLocale */
/** @type {LuDeLaStationLocale} */
let stationLocaleLue = { projet: "", a: 0 };
/** @type {any[] | undefined} */
let lignesDeLaStationLocalePosees;
let lignesDeLaStationLocalePose = "";
// La station de cet ordinateur, telle que GitHub la publie : nulle sur un appareil qui n'en a pas — un téléphone, un poste
// de travail —, indéfinie tant qu'elle n'est pas lue.
function laStationLocale() {
  if (telephoneVu !== undefined) return null;
  if (projetsVus === undefined) return undefined;
  const locale = projetsVus.locale ?? null;
  return locale === null ? null : (stationsVues?.stations ?? []).find(({ id }) => id === locale);
}
/** @param {unknown} erreur */
const rateDit = (erreur) => (erreur instanceof Error ? erreur.message : String(erreur));
/** @param {LuDeLaStationLocale} lu */
function reposerLaStationLocale(lu) {
  if (stationLocaleLue === lu && courant?.nom === lu.projet && ongletDe(courant) === STATIONS) poserRail(courant);
}
/** @param {Projet} projet */
function lireLaStationLocale(projet) {
  const nom = projet.nom;
  /** @type {LuDeLaStationLocale} */
  const lu = { projet: nom, a: Date.now(), ...(stationLocaleLue.projet === nom ? { refusOrdinaires: stationLocaleLue.refusOrdinaires, reglageDit: stationLocaleLue.reglageDit, connexionDite: stationLocaleLue.connexionDite } : {}) };
  stationLocaleLue = lu;
  void Promise.resolve(brigade.dossiersDeLaStation?.(nom) ?? { refus: "its folders could not be read", detail: "this app does not read them" }).then(
    (rendu) => (lu.dossiers = rendu),
    (erreur) => (lu.dossiers = { refus: "its folders could not be read", detail: rateDit(erreur) }),
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
  } catch (erreur) {
    lu.ordinaires = null;
    lu.refusOrdinaires = `the sandbox could not be read: ${rateDit(erreur)}`;
  }
  reposerLaStationLocale(lu);
}
/** @param {Projet} projet @returns {any[]} */
function lignesDeCetOrdinateur(projet) {
  if (stationLocaleLue.projet !== projet.nom || Date.now() - stationLocaleLue.a > RELECTURE_DE_LA_STATION_LOCALE_MS) lireLaStationLocale(projet);
  const lu = stationLocaleLue;
  const station = laStationLocale();
  /** @type {import("./projet/stations/StationLocale.js").EtatDeLaStationLocale} */
  const etat = {
    poste: POSTE.nom,
    projet: projet.nom,
    station: station == null ? station : { id: station.id, nom: station.nom, max: station.max, pannes: station.pannes },
    ...(lu.dossiers === undefined ? {} : { dossiers: lu.dossiers }),
    ...(lu.ordinaires === undefined ? {} : { ordinaires: lu.ordinaires }),
    ...(lu.refusOrdinaires === undefined ? {} : { refusOrdinaires: lu.refusOrdinaires }),
    ...(lu.reglageDit === undefined ? {} : { reglageDit: lu.reglageDit }),
    ...(lu.connexionDite === undefined ? {} : { connexionDite: lu.connexionDite }),
  };
  const pose = JSON.stringify(etat);
  if (lignesDeLaStationLocalePosees !== undefined && pose === lignesDeLaStationLocalePose) return lignesDeLaStationLocalePosees;
  lignesDeLaStationLocalePose = pose;
  // Des lignes reposées à l'identique gardent leurs gestes : chacun prend la lecture en cours au moment du clic.
  const creees = lignesDeLaStationLocale(document, etat, {
    // Le même appel que la ligne des tickets ordinaires de Settings, dès qu'un contrôle change : la rangée dit qu'il est en
    // route, puis son refus se lit sous elle ; le bac à sable se relit, ses contrôles à la valeur en vigueur.
    regler: async (actif, limite, ou) => {
      const avant = stationLocaleLue;
      if (avant.reglageDit !== undefined && "enCours" in avant.reglageDit.dit) return;
      avant.reglageDit = { ou, dit: ORDINAIRES_EN_COURS };
      reposerLaStationLocale(avant);
      /** @type {string | undefined} */
      let refus;
      try {
        refus = await brigade.reglerOrdinaires(projet.nom, actif, limite);
      } catch (erreur) {
        refus = `nothing was written: ${rateDit(erreur)}`;
      }
      const enCours = stationLocaleLue;
      delete avant.reglageDit;
      if (refus === undefined || refus === "") delete enCours.reglageDit;
      else enCours.reglageDit = { ou, dit: { refus } };
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
        dite = "refus" in rendu ? rendu.refus : rendu.fait;
      } catch (erreur) {
        dite = `nothing was done: ${rateDit(erreur)}`;
      }
      const enCours = stationLocaleLue;
      enCours.connexionDite = dite;
      reposerLaStationLocale(enCours);
    },
  });
  lignesDeLaStationLocalePosees = creees;
  return creees;
}

// Le rail en six colonnes — On the rail, Taken, Pass, Awaiting you, Waiting, Served (ticket 2093, titres du ticket 2922) —,
// tel que le process principal l'a rangé (faits.ts) : la vue pose, colonne par
// colonne, au centre de l'espace, partagé entre ses deux onglets (ticket 1184). Rail : ce qui t'attend
// — la file, ce qui est en amont —, puis toutes les colonnes, Taken et Pass compris, sans rien
// d'exécution sur leurs cartes. Cooks : la carte du projet et ses cooks en cours, et la lecture de `station`. Un projet sans box n'en a
// pas : rien n'est lu de lui. Sans faits, il dit pourquoi il n'est pas dessiné : la carte du panneau
// dit ce qui a été obtenu.
/** @param {Projet} projet */
function poserRail(projet) {
  // Le chef répond sur une carte de TODO (ticket 2151) : rien du rail ne bouge sous ses mains — ni la ligne du disjoncteur.
  if (garderLaCarteEnMain(projet)) return;
  // La ligne du disjoncteur passe de la bande à TODO, ou l'inverse : la bande se repose, elle ne la dit qu'une fois.
  const avant = disjoncteursEnTodo.delete(projet.nom);
  poserLeRail(projet);
  // La visite désigne un élément du rail qui vient d'être reposé.
  poserLaVisite();
  if (disjoncteursEnTodo.has(projet.nom) !== avant && courant?.nom === projet.nom) poserAlertes(projet);
}
/** @param {Projet} projet */
function poserLeRail(projet) {
  const tenu = tenus.get(projet.nom);
  rail.hidden = false;
  const onglet = ongletDe(projet);
  rail.dataset.onglet = onglet === STATIONS ? onglet : RAIL;
  rail.ariaLabel = onglet === STATIONS ? "The stations" : "The rail";
  // Settings ouvert par-dessus : sa section des plafonds et du closer suit la lecture, comme elle le faisait sur l'onglet
  // (ticket 3014) ; un champ en cours de frappe n'est pas reposé.
  reposerLaSante(projet, true);
  // Stations : la liste de ses stations (ticket 2487), et « Add a station » ; les réglages de
  // chacune (ticket 2488) ; la station de cet ordinateur (ticket 2489).
  if (onglet === STATIONS) {
    poserCuisson(projet);
    const reprise = repriseDuClavier();
    poserOngletStations(projet);
    return rendreLeClavier(reprise);
  }
  const horsLigne = horsLignes.get(projet.nom);
  const perime = perimes.get(projet.nom);
  delete rail.dataset.horsLigne;
  marquerLecture(projet);
  arreterCuisine.hidden = true;
  sectionCuisine.hidden = true;
  // Plus de rail, plus de fiche par-dessus.
  if (rail.hidden && ouverte !== undefined) fermerFiche();
  if (rail.hidden) return rail.replaceChildren();
  // Aucune station connue ne sert le projet : la page ne reste pas vide — elle dit pourquoi (ticket 1405). Sur Rail, son
  // rail se lit quand même, sur GitHub (ses issues, labels et PR, ticket 2061) : lu, c'est le même rail que celui d'un projet servi ici, TODO en
  // tête avec ses cartes et leurs gestes (ticket 2076). Tant qu'il ne l'est pas, le rail que sa station publie dit
  // pourquoi (ticket 1435) — GitHub à connecter, aucune station du compte —, sans colonnes à lui. Hors ligne, le signe
  // seul, comme pour tout rail (ticket 1818).
  const duTableau = (tenu !== undefined && "tableau" in tenu) || horsLigne !== undefined;
  if (!seLit(projet) && projet.sansStation !== true && !duTableau) {
    const publie = railsPublies.get(projet.nom);
    // Pourquoi le tableau ne s'est pas lu, dans la phrase de sa lecture (tableau/lecture.ts).
    const nonLu = tenu === undefined ? undefined : "erreur" in tenu ? tenu.erreur : "titre" in tenu ? tenu.titre : undefined;
    if (publie !== undefined && !publie.sansReponse) return rail.replaceChildren(...poserRailPublie(document, { ...publie, connexion: premier.connexion, ...(nonLu === undefined ? {} : { nonLu }) }, gestesDuRailPublie(projet)));
    return rail.replaceChildren(bloc("h3", AUCUNE_STATION));
  }
  // Sur Rail, en tête, la ligne qui dit ce qui y demande un geste (ticket 1185).
  // Le bon posé pour chaque carte, celles des stations comprises (ticket 1270) : celui de la fiche ouverte y reprend
  // le clavier.
  /** @type {Map<import("../faits.ts").Carte, HTMLElement>} */
  const posees = new Map();
  poserCuisson(projet);
  /** @param {(HTMLElement | string)[]} poses */
  const poser = (...poses) => rail.replaceChildren(...(alerteDeCuisine.hidden ? [] : [alerteDeCuisine]), ...poses);
  // Cuisine d'un projet servi ici, station arrêtée : rien n'est lu, la page dit pourquoi en une ligne — sur l'un et
  // l'autre onglet.
  if (projet.sansStation === true) return rail.replaceChildren(bloc("h3", STATION_ARRETEE));
  const muet = muets.get(projet.nom);
  // Hors ligne sans rien de lu avant : le signe seul, sans erreur ni rail vide (ticket 1818).
  if (horsLigne !== undefined && (tenu === undefined || !("tableau" in tenu))) return poser(signeHorsLigne(horsLigne));
  // Ce que dit le rail qui n'est pas lu : la carte du projet le dit déjà, sur Cooks.
  if (tenu === undefined && muet === undefined) {
    // Une minute sans rien lu : la page le dit, elle n'attend pas toujours (ticket 2055).
    const epuisee = attenteEpuisee(attentesDuRail, projet.nom, Date.now());
    return poser(bloc("h3", epuisee ? RAIL_NON_LU : `the rail: first read of ${geste(projet, "facts")} in progress…`));
  }
  attentesDuRail.delete(projet.nom);
  // La box ne répond pas : rien de ce que dit le rail n'est lu à neuf. Il garde sa dernière lecture,
  // marquée, et les tickets `fire` que GitHub dit encore passent au-dessus (feu.ts).
  // Le téléphone ne lit pas GitHub : rien n'y passe au-dessus.
  const auTelephone = telephoneVu !== undefined;
  const marque = muet === undefined || auTelephone ? [] : poserMuet(projet);
  if (tenu === undefined || !("tableau" in tenu)) {
    // Le téléphone n'a pas de panneau à droite : ce qui a été obtenu se dit sous le titre, en une ligne, son détail au survol.
    if (auTelephone && tenu !== undefined && "erreur" in tenu) return poser(bloc("h3", `the rail is not drawn — tried at ${heureDe(tenu.a)}`), ...obtenuEnUneLigne(projet, tenu, AU_TELEPHONE));
    // Sans rien lu : une ligne d'erreur, sans renvoi ; ce que l'app a obtenu s'y ajoute si le panneau est à l'écran.
    const sans = tenu === undefined ? [] : poserLaLecture(document, direLaLecture({ reading: null, readAt: null, stale: false, refusal: { kind: "other" } }, { maintenant: Date.now(), essaiA: tenu.a, titre: tenu.titre, pourquoi: raisonDeLEchec(tenu), panneauVisible: panneauAFicher() }));
    return poser(...marque, ...sans);
  }
  const { hors } = tenu.tableau.rail;
  oublierLesValidees(projet, tenu.tableau.rail.colonnes);
  const lues = sansLesValidees(tenu.tableau.rail.colonnes, valideesDe(projet.nom));
  oublierLesReponsesPerimees(projet, lues);
  // La box ne répond pas : ce que ses colonnes contenaient n'est plus lu. Elles le disent, au lieu de montrer des « 0 ».
  const toutes = muet === undefined ? lues : lues.map((colonne) => ({ ...colonne, compte: "?", cartes: [], autres: undefined, vide: "not known while the station is unreachable" }));
  // Le kanban est entier sur Rail, Taken et Pass compris.
  const colonnes = toutes;
  // Toutes les cartes lues, quel que soit l'onglet : la fiche ouverte et ce qui est en amont les suivent.
  const lesCartes = [...toutes.flatMap(({ cartes: siennes, autres: dAutrui }) => [...siennes, ...(dAutrui ?? [])]), ...hors];
  // Ce sur quoi un agent travaille porte la poêle (ticket 2984) — jamais d'une lecture dont l'app ne sait plus si elle dit
  // vrai (hors ligne, périmée, la box muette), ni la cuisine arrêtée, ni sur une carte qui attend le chef.
  const enCuisson = new Set(horsLigne === undefined && perime === undefined && muet === undefined && !tenu.tableau.arretee ? (tenu.tableau.auTravail ?? []) : []);
  /** @param {import("../faits.ts").Carte[]} cartes @param {import("./composants/pastille/pastille.js").Etat} [etat] l'état de la colonne, que ses cartes disent ; aucun dans T'attend, où la carte garde l'état de son mot @param {boolean} [avecStation] @param {boolean} [horsColonne] */
  const bons = (cartes, etat, avecStation = false, horsColonne = false) => {
    const liste = document.createElement("ol");
    liste.append(
      ...cartes.map((carte) => {
        const bon = poserBon(projet, carte, etat, avecStation, horsColonne, !carte.attendu && enCuisson.has(carte.ticket));
        posees.set(carte, bon);
        return bon;
      }),
    );
    return liste;
  };
  // Le disjoncteur ouvert : sa ligne en tête de TODO, et son seul bouton « Resume » (ticket 2140) — pas quand la box ne
  // répond pas : ce que TODO contenait n'est plus lu.
  const disjoncteur = muet === undefined ? alerteDuDisjoncteur(projet.nom) : undefined;
  const grille = document.createElement("div");
  grille.className = "colonnes";
  grille.append(
    ...colonnes.map(({ nom, ton, compte, cartes, vide, defile, autres }) => {
      const colonne = document.createElement("section");
      colonne.className = "colonne";
      colonne.dataset.ton = ton;
      // La visite (ticket 3165) désigne une colonne par son nom, et une carte par son ticket.
      colonne.dataset.colonne = nom;
      // Livré s'allonge tout le jour : ses cartes défilent dans leur hauteur, les autres colonnes restent en vue.
      if (defile) colonne.dataset.defile = "";
      if (nom === COLONNE_QUI_T_ATTEND) colonne.dataset.attend = "";
      // Ce qui attend le chef, ou bouge : sa colonne est en vue à l'ouverture du rail (ticket 1556).
      if (cartes.length > 0 && COLONNES_ACTIVES.has(nom)) colonne.dataset.actif = "";
      const tete = document.createElement("h4");
      tete.append(pastilleDEtat(document, etatDuTon(ton), nom), bloc("span", compte));
      colonne.append(tete);
      // Pass, Awaiting you — le TODO — et Waiting — WAITING — : l'explication de leur mot, sous leur titre (ticket 3308).
      const motDeLaColonne = MOT_DE_LA_COLONNE[nom];
      if (motDeLaColonne !== undefined && muet === undefined) colonne.append(...explicationDuRail(projet.nom, motDeLaColonne));
      const avecDisjoncteur = nom === COLONNE_QUI_T_ATTEND && disjoncteur !== undefined;
      if (avecDisjoncteur) {
        disjoncteursEnTodo.add(projet.nom);
        colonne.dataset.actif = "";
        colonne.append(poserLigneDuDisjoncteur(document, { marque: pastille(disjoncteur.dit, disjoncteur.ton), dit: disjoncteur.dit, ...(disjoncteur.releve === undefined ? {} : { releve: disjoncteur.releve }) }, reprises.get(projet.nom) ?? REPRISE_AU_REPOS, lectureSeuleDe(projet) === undefined ? () => void reprendreLeDisjoncteur(projet) : undefined));
      }
      // Le projet pas préparé pour Brigade le dit en tête de TODO, avec le même bouton que sa page (ticket 2628).
      const avisDeDepot = nom === COLONNE_QUI_T_ATTEND ? avisDuDepot(projet, "todo") : undefined;
      if (avisDeDepot !== undefined) colonne.append(avisDeDepot);
      // Les réponses que le chef tapait sur une carte partie de TODO entre-temps restent dans TODO, résolues (ticket 2151).
      const resolues = nom === COLONNE_QUI_T_ATTEND && muet === undefined ? poserLesCartesResolues(projet, tenu.tableau.rail) : [];
      // Sous la ligne du disjoncteur, une colonne sans carte ne dit pas que rien ne t'attend.
      if (cartes.length > 0 || resolues.length > 0) {
        const liste = bons(cartes, nom === COLONNE_QUI_T_ATTEND ? undefined : etatDuTon(ton), tenu.tableau.rail.plusieursStations === true && (nom === "Taken" || nom === "Pass"));
        liste.append(...resolues);
        colonne.append(liste);
      } else if (!avecDisjoncteur) colonne.append(bloc("p", nom === SUR_LE_RAIL && muet === undefined && tenu.tableau.rail.aucunTicket === true ? railVide(projet) : vide));
      // Ce qui attend un autre humain du projet ferme TODO, replié sous son nombre (ticket 2985).
      const deAutrui = nom === COLONNE_QUI_T_ATTEND ? poserLesAutres(document, { autres, bons, deplie: autresDeplies.has(projet.nom), deplier: (ouvert) => void (ouvert ? autresDeplies.add(projet.nom) : autresDeplies.delete(projet.nom)) }) : undefined;
      if (deAutrui !== undefined) colonne.append(deAutrui);
      return colonne;
    }),
  );
  // Rien d'autre n'est lu à neuf : ni ce qui est avant le rail.
  if (muet !== undefined) return poser(...marque, bandeDuRail(projet), grille);
  // Dépliée par la barre, la colonne Backlog vient à gauche de « On the rail », en tête de la rangée (ticket 2093).
  const backlog = colonneBacklog(projet, bons);
  const avantLeRail = grille.children[colonnes.findIndex(({ nom }) => nom === SUR_LE_RAIL) - 1];
  if (avantLeRail === undefined) grille.prepend(...backlog);
  else avantLeRail.after(...backlog);
  // La cuisine, en marche ou à l'arrêt, est une ligne de Settings (ticket 1700).
  poserArreter(projet, tenu.tableau.arretee);
  // La fiche ouverte suit la lecture : elle dit ce que la dernière dit de son ticket.
  // Celle d'une issue avant le rail suit aussi ce qu'en dit la dernière lecture.
  const avant = amonts.get(projet.nom);
  if (ouverte !== undefined) suivreFiche([...lesCartes, ...(avant !== undefined && "groupes" in avant ? avant.groupes.flatMap(({ issues }) => issues.map(({ carte }) => carte)) : [])], posees);
  // Un formulaire « waiting for… » dont le ticket n'est plus dans TODO se referme : il n'a plus de carte où se poser.
  for (const cle of formulairesDAttente.keys()) {
    const [nom, numero] = cle.split("#");
    if (nom === projet.nom && !toutes.some(({ cartes: siennes }) => siennes.some(({ ticket, gestes }) => String(ticket) === numero && gestes?.includes("attente-poser")))) formulairesDAttente.delete(cle);
  }
  const reprise = repriseDuClavier();
  const ancienne = rangees.get(projet.nom);
  const defile = ancienne === undefined ? undefined : { gauche: ancienne.scrollLeft, haut: ancienne.scrollTop };
  const memeRail = railPoseDe === projet.nom;
  const hautDuRail = rail.scrollTop;
  railPoseDe = projet.nom;
  // Hors ligne, le rail lu en dernier est atténué, et le signe dit depuis quand à la place de son âge (ticket 1818).
  if (horsLigne !== undefined) rail.dataset.horsLigne = "";
  // Sur Rail, les signes d'abord — une lecture vieille, la panne, le projet éteint —, puis la bande du haut, qui porte
  // l'âge du rail à son bout (ticket 2486).
  poser(
    ...(horsLigne !== undefined ? [signeHorsLigne(horsLigne)] : perime !== undefined ? signePerime(perime, tenu.a) : fraicheur(tenu.a)),
    ...ligneDuRailBloque(document, tenu.tableau.railBloque, lectureSeuleDe(projet) === undefined ? { ouvrirStations: () => choisirOnglet(STATIONS) } : null),
    ...panneDuRail(projet, tenu.tableau),
    ...teteDuRail(projet),
    // Sous l'onglet Rail, l'explication du rail ; sous la bande et ses cooks en cours, celle du cook (ticket 3308).
    ...explicationDuRail(projet.nom, "rail"),
    bandeDuRail(projet, tenu.tableau, tenu.publieLe === undefined ? [] : [ageDuRail(tenu.publieLe, tenu.a)]),
    ...explicationDuRail(projet.nom, "cook"),
    grille,
    ...(hors.length === 0 ? [] : [bloc("h3", "outside the columns — their state is none of the six, and nothing says they await you"), bons(hors, undefined, false, true)]),
  );
  rendreLeClavier(reprise);
  placerLaRangee(projet, grille, defile);
  if (memeRail) rail.scrollTop = hautDuRail;
}

// La rangée des colonnes, une fois posée : la lecture qui suit garde le défilement du chef ; à l'ouverture du rail, la
// première colonne où quelque chose attend ou bouge est à gauche de la vue, sans qu'il défile (ticket 1556).
/** @param {Projet} projet @param {HTMLElement} grille @param {{ gauche: number, haut: number } | undefined} defile */
function placerLaRangee(projet, grille, defile) {
  rangees.set(projet.nom, grille);
  if (rangeesPlacees.has(projet.nom) && defile !== undefined) {
    grille.scrollLeft = defile.gauche;
    grille.scrollTop = defile.haut;
    return;
  }
  const active = /** @type {HTMLElement | undefined} */ ([...grille.children].find((colonne) => /** @type {HTMLElement} */ (colonne).dataset.actif !== undefined));
  if (active === undefined || active.getBoundingClientRect === undefined) return;
  rangeesPlacees.add(projet.nom);
  grille.scrollLeft = Math.max(0, active.getBoundingClientRect().left - grille.getBoundingClientRect().left + grille.scrollLeft - 16);
}

// Le champ où le chef tapait garde le clavier, et son curseur : le rail redessiné le lui rend — celui d'une carte, d'un
// formulaire, ou d'une ligne du tableau de la cuisine.
function repriseDuClavier() {
  const tape = /** @type {HTMLInputElement | null | undefined} */ (document.activeElement);
  // Le champ du détail en grand (ticket 3348) porte la même clé que celui de sa carte, cachée dessous : le rail ne peut pas
  // le rendre, il prendrait le clavier à la carte au lieu de le laisser au détail — poserLeDetail garde le sien.
  if (tape !== null && tape !== undefined && detailDeValidation.contains(tape)) return undefined;
  return tape?.dataset?.cle === undefined ? undefined : { cle: tape.dataset.cle, champ: tape.dataset.champ, debut: tape.selectionStart, fin: tape.selectionEnd };
}
/** @param {ReturnType<typeof repriseDuClavier>} reprise */
function rendreLeClavier(reprise) {
  if (reprise === undefined) return;
  const repris = /** @type {HTMLInputElement[]} */ ([...rail.querySelectorAll("input, textarea")]).find(({ dataset }) => dataset.cle === reprise.cle && dataset.champ === reprise.champ);
  repris?.focus();
  if (repris !== undefined && reprise.debut !== null && reprise.fin !== null) repris.setSelectionRange?.(reprise.debut, reprise.fin);
}

// Une carte de TODO à laquelle le chef vient de répondre reste dans sa colonne : elle dit sa réponse envoyée, en
// attente de la cuisine (carte-todo.js). Une réponse que les faits lus ne portent plus — la carte a quitté TODO, ou
// pose une autre question — est oubliée, et son brouillon avec.
/** @param {Projet} projet @param {import("../faits.ts").Colonne[]} colonnes */
function oublierLesReponsesPerimees(projet, colonnes) {
  const portees = cartesPortees(projet, colonnes);
  for (const cle of reponsesAuxCartes.keys()) if (cle.startsWith(`${projet.nom}#`) && !portees.has(cle)) reponsesAuxCartes.delete(cle);
  // Un brouillon vide part avec sa carte ; un autre reste, sur une carte résolue (ticket 2151).
  for (const [cle, texte] of brouillonsDeCartes) {
    if (!cle.startsWith(`${projet.nom}#`) || portees.has(cle) || texte.trim() !== "") continue;
    brouillonsDeCartes.delete(cle);
    questionsDesBrouillons.delete(cle);
  }
  for (const [cle, { question }] of reponsesAuxCartes) if (cle.startsWith(`${projet.nom}#`) && portees.get(cle) !== question) reponsesAuxCartes.delete(cle);
}

// Une carte validée ou renvoyée d'ici que la lecture ne porte plus est oubliée : elle a quitté TODO pour de bon.
/** @param {Projet} projet @param {import("../faits.ts").Colonne[]} colonnes */
function oublierLesValidees(projet, colonnes) {
  const faites = validees.get(projet.nom);
  if (faites === undefined) return;
  const portees = new Set(colonnes.flatMap(({ cartes, autres }) => [...cartes, ...(autres ?? [])]).map(({ ticket }) => ticket));
  for (const ticket of faites) {
    if (portees.has(ticket)) continue;
    faites.delete(ticket);
    validations.delete(`${projet.nom}#${ticket}`);
    revues.delete(`${projet.nom}#${ticket}`);
  }
}

// Les cartes de TODO que des colonnes portent, par projet et ticket, et la question de chacune.
/** @param {Projet} projet @param {import("../faits.ts").Colonne[]} colonnes @returns {Map<string, string | null>} */
const cartesPortees = (projet, colonnes) => new Map(colonnes.flatMap(({ cartes, autres }) => [...cartes, ...(autres ?? [])]).flatMap(({ ticket, todo }) => (todo === undefined ? [] : [[`${projet.nom}#${ticket}`, todo.question]])));

// Ce qu'une lecture dit d'une carte de TODO où le chef a tapé (ticket 2151) : rien, si elle est encore dans TODO avec la
// même question — n'importe laquelle, `question` indéfinie ; sinon, en une ligne, ce qu'elle est devenue — son texte, lui,
// reste.
/** @param {import("../faits.ts").Rail} lu @param {number} ticket @param {string | null | undefined} question @returns {string | undefined} */
function resolueEntreTemps(lu, ticket, question) {
  const colonne = lu.colonnes.find(({ cartes, autres }) => [...cartes, ...(autres ?? [])].some((carte) => carte.ticket === ticket));
  const sienne = [...(colonne?.cartes ?? []), ...(colonne?.autres ?? [])].find((carte) => carte.ticket === ticket);
  if (colonne?.nom === COLONNE_QUI_T_ATTEND && sienne?.todo !== undefined) return question === undefined || sienne.todo.question === question ? undefined : `its question changed meanwhile — ${TEXTE_GARDE}`;
  const devenue =
    colonne === undefined
      ? lu.hors.some((carte) => carte.ticket === ticket)
        ? "is now outside the columns"
        : "has left the rail"
      : colonne.nom === COLONNE_QUI_T_ATTEND
        ? "no longer takes an answer on its card"
        : `is now in ${colonne.nom}`;
  return `resolved meanwhile: #${ticket} ${devenue} — ${TEXTE_GARDE}`;
}
const TEXTE_GARDE = "your text is kept here, nothing was sent";

// La ligne d'une carte tenue que la lecture ne porte plus, à côté du champ du chef — retirée quand elle la porte de nouveau.
/** @param {HTMLElement} carte @param {string | undefined} dit */
function direLaCarteResolue(carte, dit) {
  const avant = [...carte.children].find(({ className }) => className === "resolue-entre-temps");
  if (dit === undefined) return avant?.remove();
  if (avant !== undefined) return void (avant.textContent = dit);
  const ligne = bloc("p", dit);
  ligne.className = "resolue-entre-temps";
  const phrase = [...carte.children].find(({ className }) => className === "phrase");
  if (phrase === undefined) carte.append(ligne);
  else phrase.after(ligne);
}

// Le rail d'un projet dont le chef tient une carte de TODO (ticket 2151) ne se redessine pas : la lecture est tenue, et la
// carte dit seulement si elle ne la porte plus. Une lecture ratée n'en dit rien. Faux : rien n'est tenu dans ce rail.
/** @param {Projet} projet */
function garderLaCarteEnMain(projet) {
  const enMain = carteEnMain;
  if (enMain === undefined || enMain.projet !== projet.nom || !rail.contains(enMain.bon)) return false;
  rail.hidden = false;
  enMain.gele = true;
  const tenu = tenus.get(projet.nom);
  if (tenu !== undefined && "tableau" in tenu && !muets.has(projet.nom)) direLaCarteResolue(enMain.carte, resolueEntreTemps(tenu.tableau.rail, enMain.ticket, enMain.question));
  return true;
}

// Une carte de TODO posée se tient tant que le clavier y est : son champ, ses choix, ses boutons (ticket 2151).
// `question` : celle de la carte — indéfinie pour une carte résolue, qui n'en attend plus aucune.
/** @param {Projet} projet @param {number} ticket @param {string | null | undefined} question @param {HTMLElement} bon @param {HTMLElement} carte */
function tenirEnMain(projet, ticket, question, bon, carte) {
  carte.addEventListener("focusin", () => {
    if (carteEnMain?.carte !== carte) carteEnMain = { projet: projet.nom, ticket, question, bon, carte, gele: false };
  });
  carte.addEventListener("focusout", (evenement) => {
    const vers = /** @type {HTMLElement | null | undefined} */ (evenement.relatedTarget);
    if (vers != null && carte.contains(vers)) return;
    // Le clavier part ailleurs dans le rail : la lecture tenue attend la suivante, pour ne pas reposer l'élément que le
    // chef vient de toucher.
    lacherLaCarte(carte, vers == null || !rail.contains(vers));
  });
  return carte;
}

// Le clavier quitte la carte tenue : ce qui est arrivé entre-temps se pose, si `redessiner`. Un geste de la carte la
// lâche sans redessiner : il redessine lui-même.
/** @param {HTMLElement} carte @param {boolean} redessiner */
function lacherLaCarte(carte, redessiner) {
  if (carteEnMain?.carte !== carte) return;
  const { projet, gele } = carteEnMain;
  carteEnMain = undefined;
  if (redessiner && gele && courant?.nom === projet && !rail.hidden) poserRail(courant);
}
/** @param {string} projet @param {number} ticket */
function lacherLaCarteDe(projet, ticket) {
  if (carteEnMain?.projet === projet && carteEnMain.ticket === ticket) lacherLaCarte(carteEnMain.carte, false);
}

// Les cartes de TODO parties entre-temps dont le chef a gardé un texte (ticket 2151), en bas de TODO : son numéro, ce que
// la carte demandait, ce qu'elle est devenue, et son texte — à recopier, ou à écarter.
/** @param {Projet} projet @param {import("../faits.ts").Rail} lu */
function poserLesCartesResolues(projet, lu) {
  const portees = cartesPortees(projet, lu.colonnes);
  return [...brouillonsDeCartes].flatMap(([cle, texte]) => {
    if (!cle.startsWith(`${projet.nom}#`) || portees.has(cle) || texte.trim() === "") return [];
    const ticket = Number(cle.slice(projet.nom.length + 1));
    const numero = bloc("span", `#${ticket}`);
    numero.className = "ticket mono";
    const bon = carteAttente(document, { numero });
    bon.dataset.resolue = "";
    const carte = carteDeReponse(document, { resolue: true });
    carte.ariaLabel = `your answer to #${ticket}, kept after its card left TODO`;
    const demandait = questionsDesBrouillons.get(cle);
    if (demandait != null) {
      const question = bloc("p", demandait);
      question.className = "question-carte";
      carte.append(question);
    }
    const phrase = document.createElement("div");
    phrase.className = "phrase";
    const saisie = document.createElement("textarea");
    saisie.value = texte;
    saisie.rows = 2;
    saisie.ariaLabel = `your text for #${ticket}`;
    saisie.dataset.cle = cle;
    saisie.dataset.champ = CHAMP_DE_CARTE;
    saisie.addEventListener("input", () => void brouillonsDeCartes.set(cle, saisie.value));
    const ecarter = bouton("dismiss", () => {
      brouillonsDeCartes.delete(cle);
      questionsDesBrouillons.delete(cle);
      lacherLaCarte(carte, false);
      if (courant?.nom === projet.nom) poserRail(projet);
    }, "discret");
    ecarter.title = "forget this text: nothing was sent, and nothing will be";
    phrase.append(saisie, ecarter);
    carte.append(phrase);
    direLaCarteResolue(carte, resolueEntreTemps(lu, ticket, undefined));
    bon.append(tenirEnMain(projet, ticket, undefined, bon, carte));
    return [bon];
  });
}

// Le geste en route d'ici sur la carte de TODO d'un ticket, pour la question qu'elle montre — au repos sinon.
/** @param {Projet} projet @param {number} ticket @param {import("../carte-todo.ts").CarteDeTodo} todo */
function etatDeLaCarte(projet, ticket, todo) {
  const tenue = reponsesAuxCartes.get(`${projet.nom}#${ticket}`);
  return tenue !== undefined && tenue.question === todo.question ? tenue.etat : CARTE_AU_REPOS;
}

// La carte de TODO d'un ticket, dans l'état de sa réponse (carte-todo.js) : ses captures posées comme
// celles d'une livraison, lues sans un clic. « Ask the second » y passe la carte au second : son numéro, sa question, ce
// que son issue dit (ticket 3133).
/** @param {Projet} projet @param {number} ticket @param {import("../carte-todo.ts").CarteDeTodo} todo */
function poserLaCarteDeTodo(projet, ticket, todo) {
  const cle = `${projet.nom}#${ticket}`;
  if (estUneValidation(todo)) return poserLaValidation(projet, ticket, todo, false);
  if (estUneRevue(todo)) return poserLaRevue(projet, ticket, todo, false);
  const etat = etatDeLaCarte(projet, ticket, todo);
  const second = demandesAuSecond.get(cle);
  return poserCarteDeTodo(
    document,
    ticket,
    todo,
    etat,
    { captures: todo.captures === undefined ? [] : poserCaptures(projet, ticket, todo.captures), brouillon: brouillonsDeCartes.get(cle) ?? "", cle, ...(second === undefined ? {} : { second }), ...(lectureSeuleDe(projet) === undefined ? {} : { lectureSeule: true }) },
    {
      repondre: (reponse) => void repondreALaCarte(projet, ticket, reponse),
      ecrire: (texte) => {
        brouillonsDeCartes.set(cle, texte);
        questionsDesBrouillons.set(cle, todo.question ?? todo.resume ?? null);
      },
      demander: () => void demanderAuSecond(projet, ticket, () => brigade.passerAuSecond(projet.nom, ticket, todo.question)),
      copier: (texte) => navigator.clipboard?.writeText(texte),
    },
  );
}

// La carte « Validate its screen » d'un ticket (validation-design/, ticket 3185) : ses captures posées comme celles de toute
// carte, lues sans un clic ; « Validate » et « Send back to the kitchen » jouent la commande du runtime par le process
// principal — sur le téléphone, ils s'écrivent sur GitHub (gestes-github-telephone.ts). `grand` : à la largeur d'un téléphone, sur la carte ouverte depuis la liste.
/** @param {Projet} projet @param {number} ticket @param {import("../carte-todo.ts").CarteDeTodo} todo @param {boolean} grand */
function poserLaValidation(projet, ticket, todo, grand) {
  const cle = `${projet.nom}#${ticket}`;
  const second = demandesAuSecond.get(cle);
  return poserCarteDeValidation(
    document,
    ticket,
    todo,
    validations.get(cle) ?? VALIDATION_AU_REPOS,
    { captures: todo.captures === undefined ? [] : poserCaptures(projet, ticket, todo.captures), commentaire: commentairesDeValidation.get(cle) ?? "", cle, grand, ...(second === undefined ? {} : { second }), ...(lectureSeuleDe(projet) === undefined ? {} : { lectureSeule: true }) },
    {
      valider: () => void validerLaCarte(projet, ticket, { geste: "valider" }),
      renvoyer: (commentaire) => void validerLaCarte(projet, ticket, { geste: "renvoyer", commentaire }),
      ecrire: (texte) => void commentairesDeValidation.set(cle, texte),
      ouvrirPr: () => void brigade.ouvrirPr(projet.nom, ticket),
      ouvrir: () => ouvrirLeDetail(projet.nom, ticket),
      // Dans TODO, comme toute carte, « ask the second » (ticket 3133) ; la carte ouverte du téléphone n'en a pas.
      ...(grand ? {} : { demander: () => void demanderAuSecond(projet, ticket, () => brigade.passerAuSecond(projet.nom, ticket, todo.question)) }),
    },
  );
}

// La carte « review before merge » d'un ticket sensible (carte-sensible/, ticket 3224) : « Pull request #N » l'ouvre d'un
// clic ; « Merge » et « Send back » jouent la commande `sensitive` du runtime par le process principal. `grand` : à la
// largeur d'un téléphone, sur la carte ouverte depuis la liste.
/** @param {Projet} projet @param {number} ticket @param {import("../carte-todo.ts").CarteDeTodo} todo @param {boolean} grand */
function poserLaRevue(projet, ticket, todo, grand) {
  const cle = `${projet.nom}#${ticket}`;
  const second = demandesAuSecond.get(cle);
  return poserCarteSensible(
    document,
    ticket,
    todo,
    revues.get(cle) ?? REVUE_AU_REPOS,
    { note: notesDeRevue.get(cle) ?? "", cle, grand, ...(second === undefined ? {} : { second }), ...(lectureSeuleDe(projet) === undefined ? {} : { lectureSeule: true }) },
    {
      merger: () => void repondreALaRevue(projet, ticket, { geste: "merger" }),
      renvoyer: (note) => void repondreALaRevue(projet, ticket, { geste: "renvoyer", note }),
      ecrire: (texte) => void notesDeRevue.set(cle, texte),
      ouvrirPr: () => void brigade.ouvrirPr(projet.nom, ticket),
      ...(grand ? {} : { demander: () => void demanderAuSecond(projet, ticket, () => brigade.passerAuSecond(projet.nom, ticket, todo.question)) }),
    },
  );
}

// Une réponse du chef sur une carte « review before merge », une seule à la fois : faite, la carte quitte TODO et les faits
// sont relus ; refusée, elle garde ses gestes et sa note, et dit pourquoi.
/** @param {Projet} projet @param {number} ticket @param {import("./carte-sensible/carte-sensible-github.ts").GesteSensible} geste */
async function repondreALaRevue(projet, ticket, geste) {
  const cle = `${projet.nom}#${ticket}`;
  if (revues.get(cle)?.etape === "envoi" || revues.get(cle)?.etape === "fait") return;
  lacherLaCarteDe(projet.nom, ticket);
  /** @param {import("./carte-sensible/carte-sensible.js").Etat} etat */
  const poser = (etat) => {
    revues.set(cle, etat);
    if (courant?.nom === projet.nom) poserRail(projet);
    poserLesCartesDuChef();
  };
  poser({ etape: "envoi", geste: geste.geste });
  /** @type {import("./carte-sensible/carte-sensible-github.ts").RenduSensible | undefined} */
  let rendu;
  try {
    rendu = brigade.gesteSensible === undefined ? { refus: REVUE_SANS_PONT, detail: "" } : await brigade.gesteSensible(projet.nom, ticket, geste);
  } catch (erreur) {
    rendu = { refus: "nothing was done: the app could not play the gesture", detail: erreur instanceof Error ? erreur.message : String(erreur) };
  }
  const rendue = apresLaRevue(rendu);
  if (rendue.etape !== "fait") return poser(rendue);
  // Fait : la carte garde un court moment la confirmation de ce qui a été fait (ticket 3386), puis quitte TODO.
  poser({ ...rendue, geste: geste.geste });
  await new Promise((fini) => setTimeout(fini, CONFIRMATION_REVUE_MS));
  notesDeRevue.delete(cle);
  validees.set(projet.nom, valideesDe(projet.nom).add(ticket));
  if (vueDesCartes.vu === "carte" && vueDesCartes.carte.projet === projet.nom && vueDesCartes.carte.ticket === ticket) vueDesCartes = { vu: "liste" };
  poser(rendue);
  lireLesFaits();
}

// Un geste du chef sur une carte « Validate its screen », un seul à la fois : fait, la carte quitte TODO et les faits sont
// relus ; refusé, elle garde ses gestes et son commentaire, et dit pourquoi.
/** @param {Projet} projet @param {number} ticket @param {import("./validation-design/validation-design-github.ts").GesteDeValidation} geste */
async function validerLaCarte(projet, ticket, geste) {
  const cle = `${projet.nom}#${ticket}`;
  if (validations.get(cle)?.etape === "envoi" || validations.get(cle)?.etape === "fait") return;
  lacherLaCarteDe(projet.nom, ticket);
  /** @param {import("./validation-design/validation-design.js").Etat} etat */
  const poser = (etat) => {
    validations.set(cle, etat);
    if (courant?.nom === projet.nom) poserRail(projet);
    poserLesCartesDuChef();
    // Fait depuis son détail, la carte a quitté TODO : son détail se ferme (`poserLeDetail` ne la trouve plus).
    if (detailOuvert?.projet === projet.nom && detailOuvert.ticket === ticket) poserLeDetail();
  };
  poser({ etape: "envoi", geste: geste.geste });
  /** @type {import("./validation-design/validation-design-github.ts").RenduDeValidation | undefined} */
  let rendu;
  try {
    rendu = await brigade.gesteDeValidation(projet.nom, ticket, geste);
  } catch (erreur) {
    rendu = { refus: "nothing was done: the app could not play the gesture", detail: erreur instanceof Error ? erreur.message : String(erreur) };
  }
  const rendue = apresLaValidation(rendu);
  if (rendue.etape !== "fait") return poser(rendue);
  // Fait : la carte, ou son détail, garde un court moment la confirmation de ce qui a été fait (ticket 3386), puis quitte TODO.
  poser({ ...rendue, geste: geste.geste });
  await new Promise((fini) => setTimeout(fini, CONFIRMATION_VALIDATION_MS));
  commentairesDeValidation.delete(cle);
  validees.set(projet.nom, valideesDe(projet.nom).add(ticket));
  if (vueDesCartes.vu === "carte" && vueDesCartes.carte.projet === projet.nom && vueDesCartes.carte.ticket === ticket) vueDesCartes = { vu: "liste" };
  poser(rendue);
  lireLesFaits();
}

// La carte « Validate its screen » d'un ticket, telle que la dernière lecture de son projet la porte — partie de TODO
// (validée ou renvoyée d'ici, ou plus lue), rien.
/** @param {string} nom @param {number} ticket */
function laValidation(nom, ticket) {
  const projet = configuration.projets.find((un) => un.nom === nom);
  const tenu = tenus.get(nom);
  if (projet === undefined || tenu === undefined || !("tableau" in tenu) || valideesDe(nom).has(ticket)) return undefined;
  const todo = tenu.tableau.rail.colonnes
    .flatMap(({ cartes }) => cartes)
    .find((carte) => carte.ticket === ticket && estUneValidation(carte.todo))?.todo;
  return todo === undefined ? undefined : { projet, todo };
}

// Les cartes « Validate its screen » qui attendent le chef, dans l'ordre de sa liste (`lesCartesDuChef`) : celle qui suit
// la carte ouverte — la première, après la dernière —, autre qu'elle.
/** @param {string} nom @param {number} ticket */
function validationSuivante(nom, ticket) {
  const attendent = lesCartesDuChef().filter(({ todo }) => estUneValidation(todo));
  const ici = attendent.findIndex((carte) => carte.projet === nom && carte.ticket === ticket);
  return [...attendent.slice(ici + 1), ...attendent.slice(0, Math.max(ici, 0))].find((carte) => carte.projet !== nom || carte.ticket !== ticket);
}

/** @param {string} projet @param {number} ticket */
function ouvrirLeDetail(projet, ticket) {
  lacherLaCarteDe(projet, ticket);
  detailOuvert = { projet, ticket, affichage: affichageNeuf() };
  poserLeDetail();
  detailDeValidation.focus();
}

function fermerLeDetail() {
  const ferme = detailOuvert;
  detailOuvert = undefined;
  poserLeDetail();
  // Le commentaire tapé dans le détail est celui de la carte : elle le reprend.
  if (ferme === undefined) return;
  const projet = configuration.projets.find((un) => un.nom === ferme.projet);
  if (projet !== undefined && courant?.nom === projet.nom && !rail.hidden && tenus.has(projet.nom)) poserRail(projet);
  poserLesCartesDuChef();
}

// Le détail ouvert, posé dans son état ; sa carte partie de TODO, il se ferme. Le clavier qui était dans son champ y reste.
function poserLeDetail() {
  const lue = detailOuvert === undefined ? undefined : laValidation(detailOuvert.projet, detailOuvert.ticket);
  if (detailOuvert === undefined || lue === undefined) {
    detailOuvert = undefined;
    detailDeValidation.hidden = true;
    return detailDeValidation.replaceChildren();
  }
  const { ticket, affichage } = detailOuvert;
  const { projet, todo } = lue;
  const cle = `${projet.nom}#${ticket}`;
  const rendreLeChamp = garderLeClavier(document.activeElement, detailDeValidation);
  const suivante = validationSuivante(projet.nom, ticket);
  const ecrans = todo.captures?.ecrans ?? [];
  detailDeValidation.hidden = false;
  detailDeValidation.replaceChildren(
    poserDetailDeValidation(
      document,
      ticket,
      todo,
      validations.get(cle) ?? VALIDATION_AU_REPOS,
      affichage,
      {
        images: (ecran, moment) => {
          const capture = ecrans.find((un) => un.ecran === ecran)?.[moment];
          return capture === undefined ? bloc("span", "missing") : poserImage(projet, ticket, ecran, capture);
        },
        commentaire: commentairesDeValidation.get(cle) ?? "",
        cle,
        grand: etroit(),
        ...(suivante === undefined ? {} : { suivante: suivante.ticket }),
        ...(lectureSeuleDe(projet) === undefined ? {} : { lectureSeule: true }),
      },
      {
        fermer: fermerLeDetail,
        reposer: poserLeDetail,
        suivante: () => {
          if (suivante !== undefined) ouvrirLeDetail(suivante.projet, suivante.ticket);
        },
        valider: () => void validerLaCarte(projet, ticket, { geste: "valider" }),
        renvoyer: (commentaire) => void validerLaCarte(projet, ticket, { geste: "renvoyer", commentaire }),
        ecrire: (texte) => void commentairesDeValidation.set(cle, texte),
        ouvrirPr: () => void brigade.ouvrirPr(projet.nom, ticket),
      },
    ),
  );
  rendreLeChamp();
}

// Échap ferme le détail — ou, une capture ouverte seule, rend l'avant et l'après.
// Les flèches gauche et droite passent d'un écran du ticket à l'autre, sauf dans le champ du commentaire (ticket 3350).
detailDeValidation.addEventListener("keydown", (evenement) => {
  if (detailOuvert === undefined || (evenement.key !== "ArrowLeft" && evenement.key !== "ArrowRight")) return;
  if (["TEXTAREA", "INPUT"].includes(/** @type {any} */ (evenement.target)?.tagName)) return;
  const lue = laValidation(detailOuvert.projet, detailOuvert.ticket);
  if (lue !== undefined && changerD(detailOuvert.affichage, lue.todo.captures?.ecrans.length ?? 0, evenement.key === "ArrowLeft" ? -1 : 1)) {
    evenement.preventDefault();
    poserLeDetail();
  }
});
detailDeValidation.addEventListener("keydown", (evenement) => {
  if (evenement.key !== "Escape" || detailOuvert === undefined) return;
  evenement.stopPropagation();
  if (detailOuvert.affichage.seule === undefined) return fermerLeDetail();
  delete detailOuvert.affichage.seule;
  poserLeDetail();
});

// Les cartes qui attendent le chef, à la largeur d'un téléphone (cartes-du-chef/, ticket 2915) : celles de la colonne
// « Awaiting you » de chaque projet lu, avec leur question — une carte déjà répondue n'y est plus. La vue montrée est la
// liste, une carte ouverte (le brouillon et ce qui a refusé sa réponse sont ceux de la carte), ou l'envoi qu'on vient de faire.
/** @typedef {import("./cartes-du-chef/cartes-du-chef.js").Carte} CarteDuChef */
/** @type {{ vu: "liste" } | { vu: "carte", carte: CarteDuChef } | { vu: "envoyee", projet: string, ticket: number }} */
let vueDesCartes = { vu: "liste" };
/** @returns {CarteDuChef[]} */
function lesCartesDuChef() {
  return configuration.projets.flatMap((projet) => {
    const tenu = tenus.get(projet.nom);
    // Une carte d'un projet en lecture seule ne se répond pas d'ici (ticket 3163) : elle n'est pas de cette liste.
    if (tenu === undefined || !("tableau" in tenu) || tenu.tableau.lectureSeule !== undefined) return [];
    const colonne = tenu.tableau.rail.colonnes.find(({ nom }) => nom === COLONNE_QUI_T_ATTEND);
    return (colonne?.cartes ?? []).flatMap((carte) => {
      const { todo } = carte;
      if (!carte.attendu || todo === undefined || (todo.question === null && todo.choix.length === 0)) return [];
      // Validée ou renvoyée d'ici (ticket 3185) : elle a quitté la liste.
      if (estUneValidation(todo) || estUneRevue(todo)) return valideesDe(projet.nom).has(carte.ticket) ? [] : [{ projet: projet.nom, ticket: carte.ticket, age: carte.age?.court ?? "", todo }];
      const etat = etatDeLaCarte(projet, carte.ticket, todo);
      const vu = vuDeLaCarte(todo, etat).vu;
      return etat.etape === "postee" || vu === "attente" || vu === "jouee" ? [] : [{ projet: projet.nom, ticket: carte.ticket, age: carte.age?.court ?? "", todo }];
    });
  });
}
// Les lignes du disjoncteur ouvert, en tête de la liste (ticket 3371) : une par projet dont la dernière bande le dit ouvert, avec
// ce que la station en écrit — écrit sous la ligne, un téléphone n'ayant pas de survol — et son « Resume » — le même que celui de TODO sur le desktop (todo-breaker-line.js). Un projet en
// lecture seule n'a que la ligne.
function lesLignesDuDisjoncteur() {
  return configuration.projets.filter((projet) => seLit(projet)).flatMap((projet) => {
    const alerte = alerteDuDisjoncteur(projet.nom);
    if (alerte === undefined) return [];
    const dit = configuration.projets.length > 1 ? `${projet.nom}: ${alerte.dit}` : alerte.dit;
    return [poserLigneDuDisjoncteur(document, { marque: pastille(alerte.dit, alerte.ton), dit, ...(alerte.releve === undefined ? {} : { pourquoi: alerte.releve }) }, reprises.get(projet.nom) ?? REPRISE_AU_REPOS, lectureSeuleDe(projet) === undefined ? () => void reprendreLeDisjoncteur(projet) : undefined)];
  });
}
function poserLesCartesDuChef() {
  if (cartesDuChef.hidden) return;
  const cartes = lesCartesDuChef();
  const retour = () => {
    vueDesCartes = { vu: "liste" };
    poserLesCartesDuChef();
  };
  // Répondue d'ici, la carte ouverte est postée : l'écran dit l'envoi.
  if (vueDesCartes.vu === "carte") {
    const { projet, ticket } = vueDesCartes.carte;
    if (reponsesAuxCartes.get(`${projet}#${ticket}`)?.etat.etape === "postee") vueDesCartes = { vu: "envoyee", projet, ticket };
  }
  const vue = vueDesCartes;
  if (vue.vu === "envoyee") {
    const reste = cartes.filter(({ projet }) => projet === vue.projet).length;
    return cartesDuChef.replaceChildren(...poserLEnvoi(document, { ticket: vue.ticket, projet: vue.projet, reste, total: cartes.length, retour }));
  }
  if (vue.vu === "carte") {
    const { projet: nom, ticket } = vue.carte;
    const cle = `${nom}#${ticket}`;
    // La carte telle que la dernière lecture la dit ; partie du rail, elle ne s'ouvre plus : retour à la liste.
    const lue = cartes.find((un) => un.projet === nom && un.ticket === ticket);
    const projet = configuration.projets.find((un) => un.nom === nom);
    if (lue === undefined || projet === undefined) return retour();
    // La carte « Validate its screen » (ticket 3185) : la même que dans TODO, ses boutons en 44 px.
    if (estUneValidation(lue.todo)) {
      const rendreLeChamp = garderLeClavier(document.activeElement, cartesDuChef);
      cartesDuChef.replaceChildren(...poserLaCarteAPart(document, { carte: lue, total: cartes.length, retour }, poserLaValidation(projet, ticket, lue.todo, true)));
      rendreLeChamp();
      return;
    }
    // La carte « review before merge » (ticket 3224) : la même que dans TODO, ses boutons en 44 px.
    if (estUneRevue(lue.todo)) {
      const rendreLeChamp = garderLeClavier(document.activeElement, cartesDuChef);
      cartesDuChef.replaceChildren(...poserLaCarteAPart(document, { carte: lue, total: cartes.length, retour }, poserLaRevue(projet, ticket, lue.todo, true)));
      rendreLeChamp();
      return;
    }
    const etat = etatDeLaCarte(projet, ticket, lue.todo);
    const refus = etat.etape === "refus" ? { dit: etat.dit, detail: etat.detail } : undefined;
    const rendreLeChamp = garderLeClavier(document.activeElement, cartesDuChef);
    const posee = poserLaCarteDuChef(document, {
      carte: lue,
      total: cartes.length,
      brouillon: brouillonsDeCartes.get(cle) ?? "",
      enRoute: etat.etape === "envoi",
      ...(refus === undefined ? {} : { refus }),
      retour,
      ecrire: (texte) => {
        brouillonsDeCartes.set(cle, texte);
        questionsDesBrouillons.set(cle, lue.todo.question ?? lue.todo.resume ?? null);
      },
      repondre: (reponse) => void repondreALaCarte(projet, ticket, reponse),
    });
    cartesDuChef.replaceChildren(...posee);
    rendreLeChamp();
    return;
  }
  const cuisent = accueilVu === undefined ? undefined : accueilVu.projets.filter((ligne) => etatDeLaLigne(ligne) === "cooking").length;
  const avis = telephoneVu?.github === undefined ? [] : poserLaListeGitHub(document, telephoneVu, configuration.projets.length, () => void oublierLeTelephone());
  cartesDuChef.replaceChildren(
    ...poserLaListeDesCartes(document, {
      cartes,
      avis,
      tete: lesLignesDuDisjoncteur(),
      ...(cuisent === undefined ? {} : { ailleurs: AILLEURS(cuisent) }),
      ouvrir: (carte) => {
        vueDesCartes = { vu: "carte", carte };
        poserLesCartesDuChef();
      },
    }),
  );
}

// La réponse du chef à une carte de TODO part par le process principal (carte-todo.ts) — une seule à la
// fois. Postée, la carte dit qu'elle attend la cuisine, et le tableau est relu tout de suite ; refusée, elle
// garde ses gestes, et dit pourquoi.
/** @param {Projet} projet @param {number} ticket @param {import("../carte-todo.ts").Reponse} reponse */
async function repondreALaCarte(projet, ticket, reponse) {
  const cle = `${projet.nom}#${ticket}`;
  if (reponsesAuxCartes.get(cle)?.etat.etape === "envoi") return;
  // Répondre est le geste qui finit la saisie : la carte n'est plus tenue, elle dit où en est sa réponse.
  lacherLaCarteDe(projet.nom, ticket);
  /** @param {import("./carte-todo.js").Etat} etat */
  const poser = (etat) => {
    reponsesAuxCartes.set(cle, { question: reponse.question, etat });
    if (courant?.nom === projet.nom) poserRail(projet);
    poserLesCartesDuChef();
  };
  poser({ etape: "envoi", reponse });
  /** @type {import("../carte-todo.ts").Rendu | undefined} */
  let rendu;
  try {
    rendu = await brigade.repondreCarte(projet.nom, ticket, reponse);
  } catch (erreur) {
    rendu = { refus: "nothing was sent: the app could not ask the station", detail: erreur instanceof Error ? erreur.message : String(erreur) };
  }
  const suite = apresLaCarte(reponse, rendu);
  if (suite.etape === "postee") brouillonsDeCartes.delete(cle);
  poser(suite);
  if (suite.etape === "postee") lireLesFaits();
}

// Le projet pas préparé pour Brigade (ticket 2628, épique 2584) : `checkRepoSetup` le lit une fois, à la première pose ;
// `runRepoSetup` le prépare, le même geste que l'ajout d'un projet. Préparé, l'avis s'en va sans recharger.
/** @param {Projet} projet @param {"page" | "todo"} lieu */
function avisDuDepot(projet, lieu) {
  // Un dépôt où le compte ne peut pas écrire ne se prépare pas d'ici (ticket 3163) : la ligne de lecture seule le dit.
  if (!seLit(projet) || projet.depot === undefined || lectureSeuleDe(projet) !== undefined) return undefined;
  const etat = depots.get(projet.nom);
  if (etat === undefined) {
    depots.set(projet.nom, DEPOT_INCONNU);
    void lireLeDepot(projet);
    return undefined;
  }
  // Le projet n'est pas prêt et sa page le dit, une question à la fois (ticket 3166) : l'avis n'y ajoute pas un second geste.
  if (parcoursOuvert(projet.nom)) return undefined;
  const preparer = () => void preparerLeDepot(projet);
  return lieu === "page" ? poserAvisDeDepot(document, "page", etat, preparer) : poserAvisDuTodo(document, etat, preparer);
}

/** @param {Projet} projet @param {import("./page-projet/depot-non-prepare.js").Etat} etat */
function poserLeDepot(projet, etat) {
  depots.set(projet.nom, etat);
  demandesDeStation.preparation(projet.nom, etat.etape);
  if (courant?.nom !== projet.nom) return;
  poserLeProjetAPreparer();
  poserAlertes(projet);
  poserRail(projet);
}

// Rend la phrase d'une lecture qui n'a pas abouti — la page d'un projet pas prêt la dit (ticket 3166) —, rien si elle a abouti.
/** @param {Projet} projet @returns {Promise<string | undefined>} */
async function lireLeDepot(projet) {
  const lire = /** @type {any} */ (brigade).checkRepoSetup;
  if (typeof lire !== "function" || projet.depot === undefined) return NON_ATTEINT("the setup check");
  try {
    poserLeDepot(projet, apresLaLectureDuDepot(await lire(projet.depot)));
    return undefined;
  } catch (erreur) {
    // Une lecture qui échoue ne dit rien de plus sur l'avis : le projet est tenu pour préparé, la prochaine ouverture relit.
    depots.delete(projet.nom);
    return phraseDuRefus(erreur);
  }
}

/** @param {Projet} projet */
async function preparerLeDepot(projet) {
  const etat = depots.get(projet.nom);
  const preparer = /** @type {any} */ (brigade).runRepoSetup;
  if (etat === undefined || (etat.etape !== "manque" && etat.etape !== "refus") || typeof preparer !== "function" || projet.depot === undefined) return;
  const { verif } = etat;
  poserLeDepot(projet, { etape: "en-route", verif });
  try {
    poserLeDepot(projet, apresLaLectureDuDepot(await preparer(projet.depot)));
  } catch (erreur) {
    poserLeDepot(projet, { etape: "refus", verif, dit: phraseDuRefus(erreur) });
  }
}

// « Resume », sur la ligne du disjoncteur (ticket 2140) : le process principal poste `/resume` sur l'issue du disjoncteur, sur
// GitHub — une seule demande à la fois. La ligne dit ce qui part, puis ce qui a été demandé, ou pourquoi rien.
/** @param {Projet} projet */
async function reprendreLeDisjoncteur(projet) {
  const etape = reprises.get(projet.nom)?.etape;
  if (etape === "envoi" || etape === "demandee") return;
  /** @param {import("./todo-breaker-line.js").Etat} etat */
  const poser = (etat) => {
    reprises.set(projet.nom, etat);
    poserLesCartesDuChef();
    if (courant?.nom !== projet.nom) return;
    poserAlertes(projet);
    poserRail(projet);
  };
  poser({ etape: "envoi" });
  /** @type {import("../github/breaker-resume.ts").RenduDeLaReprise | undefined} */
  let rendu;
  try {
    rendu = await brigade.reprendreLeDisjoncteur(projet.nom);
  } catch (erreur) {
    rendu = { refus: `resume not requested: ${NON_ATTEINT("GitHub")}`, detail: erreur instanceof Error ? erreur.message : String(erreur) };
  }
  poser(apresLaReprise(rendu));
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
  poserCout();
}
/** @param {{ nom: string, couleurs?: { onglet?: string, accent?: string } }} projet */
const projetDuCout = ({ nom, couleurs }) => ({ nom, teinte: couleurs?.onglet ?? couleurs?.accent });
// Les chiffres d'autonomie de tous les projets ensemble (autonomie/chiffres.js, ticket 3222), à côté de leur coût : ceux
// que la page des coûts montre, lus de GitHub.
/** @type {ReturnType<typeof tenirLesChiffresDAutonomie> | undefined} */
let autonomieDeTous;
const ouvrirTicketDAutonomie = (/** @type {string} */ url) => void brigade.ouvrirTicketDAutonomie(url);
function poserCout() {
  if (pageDeLApp !== COUTS) return corpsDesCouts.replaceChildren();
  const projets = configuration.projets.filter((projet) => seLit(projet)).map(projetDuCout);
  autonomieDeTous ??= tenirLesChiffresDAutonomie(document, {
    tous: true,
    lire: (jours) => brigade.lireAutonomie(configuration.projets.filter((projet) => seLit(projet)).map(({ nom }) => nom), jours),
    ouvrir: ouvrirTicketDAutonomie,
  });
  corpsDesCouts.replaceChildren(
    poserTete(document, projets, coutsLus, ouvrirDepuisLesCouts),
    autonomieDeTous.poser(),
    poserPerdus(document, projets, coutsLus, titreSurLeRail, perdusOuverts, basculerPerdus, ouvrirTicketDepuisLesCouts),
    poserChers(document, projets, coutsLus, titreSurLeRail, ouvrirTicketDepuisLesCouts, configuration.quotaMax),
    poserCourbe(document, projets, coutsLus),
  );
}
// Un projet cliqué sur la page des coûts, ou sur celle des ratios : son espace s'ouvre.
/** @param {string} nom */
function ouvrirDepuisLesCouts(nom) {
  const projet = projetDe(nom);
  if (projet !== undefined) void ouvrir(projet);
}
// La page des ratios de l'app (ticket 1682, closer/tendance/tendance.js) : chaque projet que la page des coûts lit
// aussi, et que sa lecture de `closing --json` dit réglé, avec son rapport ajouté / retiré et sa tendance.
function poserRatios() {
  if (pageDeLApp !== RATIOS) return corpsDesRatios.replaceChildren();
  const projets = configuration.projets.filter((projet) => seLit(projet)).map(projetDuCout);
  corpsDesRatios.replaceChildren(poserTendances(document, projets, ratiosLus, ouvrirDepuisLesCouts));
}
// Un ticket cliqué sur la page des coûts : son projet s'ouvre, puis sa fiche, par-dessus le rail. La
// fiche refermée rend le clavier au rail : le bouton cliqué n'est plus à l'écran.
/** @param {string} nom @param {number} ticket */
async function ouvrirTicketDepuisLesCouts(nom, ticket) {
  const projet = projetDe(nom);
  if (projet === undefined) return;
  await ouvrir(projet);
  // Le chef a pu cliquer ailleurs pendant que l'espace s'ouvrait.
  if (courant !== projet) return;
  ouvrirFicheDeCout(nom, ticket, rail);
}

// La carte d'un ticket sur le rail d'un projet, si son rail est lu et qu'il y est.
/** @param {string} nom @param {number} ticket */
function carteSurLeRail(nom, ticket) {
  const tenu = tenus.get(nom);
  if (tenu === undefined || !("tableau" in tenu)) return undefined;
  const { colonnes, hors } = tenu.tableau.rail;
  return [...colonnes.flatMap(({ cartes, autres }) => [...cartes, ...(autres ?? [])]), ...hors].find((carte) => carte.ticket === ticket);
}

/** @param {string} nom @param {number} ticket */
const titreSurLeRail = (nom, ticket) => carteSurLeRail(nom, ticket)?.titre;

// Un clic sur un ticket d'une cause d'échec, ou sur un des tickets perdus ou les plus chers du projet,
// dans la fiabilité de Cooks — ou sur la page des coûts de l'app, une fois son projet ouvert —, ou sur celui que la
// cuisine a ouvert seule pour ramener ses gates sous leur budget, en tête de la file, ouvre sa fiche,
// par-dessus l'onglet. Un ticket que le rail ne porte pas s'ouvre avec ce qu'en dit la dernière lecture de
// ce qui est en amont — son titre, son issue —, à défaut avec ce que l'on en sait : son numéro.
/** @param {string} nom @param {number} ticket @param {HTMLElement} retour */
function ouvrirFicheDeCout(nom, ticket, retour) {
  const projet = configuration.projets.find((candidat) => candidat.nom === nom);
  if (projet === undefined) return;
  const sans = { sans: "not communicated — the rail of this project is not read" };
  const amont = amonts.get(nom);
  const enAmont = amont === undefined || !("groupes" in amont) ? undefined : amont.groupes.flatMap(({ issues }) => issues).find((issue) => issue.ticket === ticket);
  const carte =
    carteSurLeRail(nom, ticket) ??
    enAmont?.carte ??
    { ticket, ouvrable: false, attendu: false, attend: [], dit: [], fiche: { titre: sans, priorite: sans, issue: sans } };
  ouvrirFiche(projet, carte, retour);
}

/** @param {Projet} projet @param {number} ticket */
async function ouvrirIssue(projet, ticket) {
  nonEcrit = (await brigade.ouvrirIssue(projet.nom, ticket)) ? "" : `issue #${ticket} was not opened: it is no longer in the latest facts read, its address is not https, or the workstation could not open it`;
  montrer();
}

// La PR du cook d'un ticket, depuis sa fiche (ticket 1846) : son adresse reste au process principal, comme celle de l'issue.
/** @param {Projet} projet @param {number} ticket */
async function ouvrirPrDuCook(projet, ticket) {
  nonEcrit = (await brigade.ouvrirPrDuCook(projet.nom, ticket)) ? "" : `the PR of #${ticket}'s cook was not opened: the latest reading of GitHub no longer gives it, its address is not https, or the workstation could not open it`;
  montrer();
}

/** @param {Projet} projet @param {number} ticket */
async function ouvrirPr(projet, ticket) {
  nonEcrit = (await brigade.ouvrirPr(projet.nom, ticket)) ? "" : `the PR of #${ticket} was not opened: it is no longer among the served tickets of the latest facts read, its address is not https, or the workstation could not open it`;
  montrer();
}

// L'interrupteur de l'espace, en tête, à droite des onglets (tickets 906, 1406) : une glissière et son
// mot — « project on », « project off » —, lisible sans rien lire d'autre, et un clic le bascule. Ce qui
// en a été lu, mot pour mot, est au survol, avec ce que le clic fait. Pas encore lu, ou pas lu : il ne
// dit ni l'un ni l'autre, et ne bascule rien — ce n'est pas « éteint ». Sa confirmation, quand le clic
// en ouvre une, se pose dessous.
/**
 * @param {string} nom @param {boolean | undefined} allume indéfini : pas lu
 * @param {{ pourquoi: string, eteindre: string, allumer: string, clic: () => void, confirmation?: HTMLElement }} pose
 * @returns {HTMLElement[]}
 */
function interrupteur(nom, allume, { pourquoi, eteindre, allumer, clic, confirmation }) {
  const bascule = interrupteurDeLApp(
    document,
    {
      texte: `${nom} ${allume === undefined ? "…" : allume ? "on" : "off"}`,
      allume,
      libelle: `the ${nom}: ${allume === undefined ? "not read" : allume ? "on" : "off"}`,
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
function poserInterrupteur() {
  const projet = courant;
  // En lecture seule (ticket 3163), le projet ne s'allume ni ne s'éteint d'ici.
  const cache = projet === undefined || !seLit(projet) || lectureSeuleDe(projet) !== undefined;
  interrupteurProjet.hidden = cache;
  if (projet === undefined || cache) return interrupteurProjet.replaceChildren();
  const cle = JSON.stringify(["projet-allumer", "", "interrupteur"]);
  const ouverte = aConfirmer?.projet === projet.nom && aConfirmer.cle === cle ? aConfirmer : undefined;
  const confirmation = ouverte === undefined ? undefined : poserConfirmation(projet, ouverte);

  const etat = etatsDuManager.get(projet.nom);
  const lu = etat !== undefined && !("sans" in etat) ? etat : undefined;
  interrupteurProjet.replaceChildren(
    ...interrupteur("project", lu?.allume, {
      pourquoi: etat === undefined ? "the project switch: first read in progress" : "sans" in etat ? `the project switch is not read: ${etat.sans}` : etat.releve,
      eteindre: "click to switch it off — nothing new is taken, split or merged: it goes straight into the second",
      allumer: "click to switch it on: says first what the manager will judge — nothing goes before your “yes”",
      clic: () => (lu?.allume ? void ecrireGeste("projet-eteindre") : void ouvrirConfirmation(projet, cle, "projet-allumer")),
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
    code.replaceChildren(rangeeDeReglage("this app", [bloc("span", "first read of how far its code is behind origin in progress…")], []));
    return poserLesGroupes();
  }
  const heure = heureDe(codeVu.a);
  code.replaceChildren(
    ...codeVu.clones.map(({ id, etat, tete, lignes, commande, bouton: geste }, rang) => {
      const dit = bloc("span", tete);
      dit.dataset.etat = etat;
      const aide = [`${etat === "pas-lu" ? "tried at" : "read at"} ${heure}, re-read when you come back to the window`, ...lignes].join("\n");
      /** @type {HTMLElement[]} */
      const controle = [];
      if (geste !== undefined) {
        const cree = bouton(enPassage ? "updating — the app relaunches itself…" : geste, () => void passer(), "recommande");
        cree.disabled = enPassage;
        controle.push(cree);
      } else if (commande !== undefined) controle.push(boutonDeCommande(commande, () => void mettreAJour(id)));
      // Ce qui n'a pas été écrit, ou pas fait, se lit sous la première ligne, jusqu'à la prochaine demande.
      return rangeeDeReglage(rang === 0 ? "this app" : "a brigade clone", [dit, survol(document, aide)], controle, rang === 0 ? refusDeReglage(nonMisAJour) : []);
    }),
  );
  // L'app installée n'a pas de clone (emplacements.ts) : sans rien à dire, la ligne n'est pas posée.
  code.hidden = code.childElementCount === 0;
  poserLesGroupes();
}

// L'app passe à la nouvelle version : elle se met à jour, puis se ferme et repart d'elle-même —
// rien ne revient. Ce qui revient, c'est pourquoi elle reste sur son code : lu sous les clones.
async function passer() {
  nonMisAJour = "";
  enPassage = true;
  poserCode();
  try {
    const rendu = await brigade.passer();
    if (rendu !== undefined) nonMisAJour = rendu.refus;
  } catch (erreur) {
    nonMisAJour = `this app was not updated: ${erreur instanceof Error ? erreur.message : String(erreur)}`;
  }
  enPassage = false;
  poserCode();
}

// Une ligne de l'accueil : sa pastille, son nom, ce qui s'y passe — et, au survol, ce qu'elle tait.
// Toute la ligne est un bouton : un clic n'importe où l'ouvre. Elle ne porte aucun autre geste.
/** @param {string} nom @param {{ ton: string, dit: string, survol: string, raison?: { phrase: string, survol: string } }} ligne @param {() => void} ouvrirLa */
function ligneDAccueil(nom, { ton, dit, survol, raison }, ouvrirLa) {
  const cree = document.createElement("button");
  cree.type = "button";
  cree.className = "ligne";
  cree.title = survol;
  cree.ariaLabel = `${nom} — ${dit}${raison === undefined ? "" : ` — ${raison.phrase}`}`;
  const appele = bloc("strong", nom);
  appele.className = "mono";
  const suite = bloc("span", "›");
  suite.className = "ouvrir";
  suite.ariaHidden = "true";
  const pourquoi = bloc("span", raison?.phrase ?? "");
  pourquoi.className = "pourquoi";
  pourquoi.title = raison?.survol ?? "";
  cree.append(pastille(dit, ton), appele, bloc("span", dit), ...(raison === undefined ? [] : [pourquoi]), suite);
  cree.addEventListener("click", ouvrirLa);
  return cree;
}

// La ligne d'une station sur l'accueil : un clic l'ouvre ; à côté, le bouton de ce qui l'empêche de cuire.
// Une station aussi enregistrée sous le compte GitHub du chef (ticket 1778) : ce qui lui est choisi se fond dans sa ligne
// (stations-du-compte.js, `ligneFondue`) ; ses cases à cocher sont sur la page de la station.
/** @param {import("../accueil.ts").LigneDeStation} presence @param {import("../stations-du-compte.ts").StationEnregistree} [enregistree] */
function ligneDeStationDeLAccueil(presence, enregistree) {
  const vue = stationsVues?.stations.find(({ id }) => id === presence.id);
  const station = ligneFondue(presence, vue?.projets ?? [], enregistree);
  const ligne = ligneDAccueil(station.nom, station, () => ouvrirStation(station.id));
  const gestes = [];
  // Une station qui ne cuit pas encore : le bouton de sa raison, un geste que l'app fait (stations/raison.ts).
  if (station.raison !== undefined) {
    const { geste, libelle } = station.raison.bouton;
    const remede = /** @type {HTMLButtonElement} */ (bouton(libelle, undefined));
    remede.className = "remede-de-station";
    remede.ariaLabel = `${libelle} — ${station.nom}`;
    remede.addEventListener("click", () => {
      if (geste === "ouvrir-la-page") ouvrirStation(station.id);
      else if (geste === "ajouter-un-projet") ouvrirAjout();
      else {
        remede.disabled = true;
        void brigade.panne(station.id, "relire-la-station").finally(() => (remede.disabled = false));
      }
    });
    gestes.push(remede);
  }
  if (gestes.length === 0) return ligne;
  const rang = document.createElement("div");
  rang.className = "ligne-et-geste";
  const aCote = document.createElement("span");
  aCote.className = "gestes-de-la-ligne";
  aCote.append(...gestes);
  rang.append(ligne, aCote);
  return rang;
}

// L'accueil : les projets dans l'ordre du fichier, puis les stations, puis la santé — tels que le
// process principal les a dits (accueil.ts). Un projet qu'il ne dit pas encore attend sa première lecture.
function poserAccueil() {
  const lignes = new Map((accueilVu?.projets ?? []).map((ligne) => [ligne.nom, ligne]));
  // Une ligne par projet (accueil/projets/) : son état parmi les quatre, ses stations, et toute la ligne l'ouvre.
  const gestesDuBloc = { ouvrir: (/** @type {string} */ nom) => {
      const projet = configuration.projets.find((un) => un.nom === nom);
      if (projet !== undefined) void ouvrir(projet);
    }, ajouter: ouvrirAjout, pastille };
  const desProjets = lignesDeProjets(
    document,
    configuration.projets.map((projet) => {
      /** @type {import("../accueil.ts").LigneDeProjet} */
      const attendue = { nom: projet.nom, ton: "gris", dit: "first read in progress…", survol: "" };
      const ligne = lignes.get(projet.nom) ?? attendue;
      const stations = (stationsVues?.stations ?? []).filter(({ projets }) => projets.includes(projet.nom)).map(({ nom }) => nom);
      return { nom: projet.nom, etat: etatDeLaLigne(ligne), stations, maintenant: ligne.dit, ...(ligne.attend === undefined ? {} : { attend: ligne.attend }), survol: `${ligne.dit}${ligne.survol === "" ? "" : ` — ${ligne.survol}`}` };
    }),
    gestesDuBloc,
  );
  // Sur le téléphone, les projets sont ceux qu'il lit sur GitHub, connecté (connexion-github.js) : la section dit ce
  // qui manque à leur liste.
  projetsDeLAccueil.replaceChildren(
    ...(telephoneVu?.github !== undefined
      ? [...poserLaListeGitHub(document, telephoneVu, desProjets.length, () => void oublierLeTelephone()), ...desProjets]
      : desProjets.length === 0
        ? (telephoneVu === undefined
          ? [bloc("p", `${PAS_ENCORE("project")} “+” in the bar adds one.`)]
          : [bloc("p", `${PAS_ENCORE("project on this phone")} A project is added from a computer.`)])
        : desProjets),
  );
  // « Add a project » est à droite du titre du bloc (Home.dc.html) ; un téléphone n'ajoute pas de projet.
  poserAjout(blocDesProjets, telephoneVu === undefined ? boutonDAjout(document, gestesDuBloc, desProjets.length === 0) : undefined);
  poserLesCartesDuChef();
}

// La page d'une station : en tête, son nom, sa pastille et son état en une phrase — « online · 2 cooks
// running », « offline for 12 min », « saturated » (accueil.ts) ; sa machine et sa version ne se lisent
// qu'au survol de l'icône d'aide, jamais dans la page. Dessous, ses pannes, chacune avec son bouton ;
// puis tous les projets qu'elle porte.
function poserPageDeStation() {
  const station = stationsVues?.stations.find(({ id }) => id === stationOuverte);
  const ligne = accueilVu?.stations?.find(({ id }) => id === stationOuverte);
  const enregistree = enregistreeOuverte();
  if (enregistree !== undefined && etatDesEnregistrees.depots === undefined && lectureDesDepotsEnregistrees === 0) void lireLesDepotsDesEnregistrees();
  if (station === undefined && enregistree !== undefined) {
    // Une machine seulement enregistrée sous le compte du chef : ni pannes, ni plafond, ni retrait — que son état et ses projets.
    const titre = bloc("h2", enregistree.name);
    titre.className = "mono";
    const phrase = etatDit(enregistree);
    const phraseDite = bloc("span", phrase);
    phraseDite.className = "phrase";
    enTeteDeStation.replaceChildren(titre, pastille(phrase, tonDe(enregistree)), phraseDite, survol(document, detailsDe(enregistree)));
    poserLesSectionsDeStation({ id: enregistree.id, nom: enregistree.name });
    pannesDeStation.replaceChildren();
    plafondDeStation.replaceChildren();
    versionDeStation.replaceChildren();
    retraitDeStation.replaceChildren();
  } else if (station === undefined) {
    enTeteDeStation.replaceChildren(bloc("p", stationsVues === undefined ? LECTURE_DE("your stations on GitHub") : "this station is no longer paired with this app"));
    poserLesSectionsDeStation(undefined);
    pannesDeStation.replaceChildren();
    plafondDeStation.replaceChildren();
    versionDeStation.replaceChildren();
    retraitDeStation.replaceChildren();
  } else {
    const titre = bloc("h2", station.nom);
    titre.className = "mono";
    const phrase = ligne?.phrase ?? station.dit;
    const etatDit = bloc("span", phrase);
    etatDit.className = "phrase";
    // Illisible, ce qui se lit au survol est pourquoi.
    const details = station.etat === "illisible" ? station.ligne : (ligne?.survol ?? station.machine);
    // Hors ligne, la panne dessous le dit déjà, avec son bouton : l'en-tête ne le redit pas.
    const dejaDit = station.pannes.some(({ sujet }) => sujet === "injoignable");
    enTeteDeStation.replaceChildren(titre, pastille(phrase, ligne?.ton), ...(dejaDit ? [] : [etatDit]), ...(details === "" ? [] : [survol(document, details)]), ...(ligne?.note === undefined ? [] : [bloc("p", ligne.note)]), poserLesAppels(document, ligne?.appels));
    poserPlafond(ligne);
    versionDeStation.replaceChildren(...(station.versionDit ? [bloc("span", station.versionDit)] : []));
    pannesDeStation.replaceChildren(...station.pannes.map((panne) => poserPanne(station, panne)));
    poserLesSectionsDeStation({ id: station.id, nom: station.nom });
    poserRetireLaStation(station);
  }
  // Une machine seulement enregistrée n'a ni projet de l'app, ni parcours d'ajout : ses projets sont ses cases.
  const seulementEnregistree = station === undefined && enregistree !== undefined;
  titreDesProjets.hidden = seulementEnregistree;
  if (seulementEnregistree) ouvrirLeParcours.hidden = true;
  else if (parcours === undefined) ouvrirLeParcours.hidden = false;
  poserLesProjetsChoisis();
  poserProjets();
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
  const locale = projetsVus?.locale ?? null;
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
  const compte = station.id === locale ? (brigade.compteGitHub?.() ?? Promise.resolve(undefined)).catch(() => undefined) : Promise.resolve(undefined);
  const connexions = {
    claude: max === null ? null : { etat: max, depuis: vue?.maxDepuis ?? null },
    gestes: {
      changerGitHub: async () => {
        const debut = (await brigade.seConnecterAGitHub?.()) ?? { refus: "GitHub sign-in could not be started: the app gave no answer." };
        // Un refus se dit sous la rangée, en ligne d'erreur (sections/connexions.js).
        if ("refus" in debut) return { refus: debut.refus };
        repose();
      },
      renouveler: async () => {
        const panne = vue?.pannes.find(({ sujet }) => sujet === "connexion-max");
        if (panne === undefined) return "Claude Code is signed in: there is nothing to renew yet.";
        const rendu = await brigade.panne(station.id, panne.cle);
        return "refus" in rendu ? { refus: rendu.refus } : rendu.fait;
      },
    },
  };
  const reglages = brigade.lireReglagesDeLaStation === undefined ? undefined : { lire: async () => (await brigade.lireReglagesDeLaStation?.()) ?? { refus: NON_ATTEINT("folders and sandbox") }, ecrire: async (/** @type {any} */ c) => (await brigade.ecrireReglagesDeLaStation?.(c)) ?? { refus: "nothing was changed" } };
  void compte.then((github) => poserLaCoqueDeStation(document, { station, locale, reglages, connexions: { ...connexions, github } })).then((page) => {
    if (sectionsDeStationPosees === posees) sectionsDeStation.replaceChildren(page);
  });
}

// L'enregistrement de la station dont la page est ouverte : celui de la machine que la ligne de la liste a fondue avec sa
// présence, ou, seulement enregistrée, celui qui porte cet id (stations-du-compte.js, `uneLigneParMachine`).
function enregistreeOuverte() {
  const lues = enregistreesAbsentes ? undefined : etatDesEnregistrees.stations;
  if (lues?.state !== "listed") return undefined;
  const ligne = uneLigneParMachine(accueilVu?.stations ?? [], lues.stations).find((une) => ("appairee" in une ? une.appairee.id : une.enregistree.id) === stationOuverte);
  return ligne?.enregistree;
}

// Sur la page de la station enregistrée : les projets du chef à cocher, ce qu'elle sert — ce que sa ligne n'ouvre plus en
// place —, et la recherche parmi ses autres dépôts (ticket 1780). Les projets du chef sont ceux que la brigade connaît :
// ceux de l'app, ceux que les stations appairées servent ou portent ; les stations du compte y ajoutent ce qui leur est
// choisi (stations-du-compte.js). Le champ où le chef tapait garde le clavier, et son curseur, quand la page se redessine.
function poserLesProjetsChoisis() {
  const enregistree = enregistreeOuverte();
  if (etatDesEnregistrees.recherche !== undefined && etatDesEnregistrees.recherche.id !== stationOuverte) delete etatDesEnregistrees.recherche;
  etatDesEnregistrees.connus = [
    ...configuration.projets.map(({ nom, depot }) => depot ?? nom),
    ...(projetsVus?.projets ?? []).map(({ nom, depot }) => (depot === "" ? nom : depot)),
    ...(stationsVues?.stations ?? []).flatMap(({ projets }) => projets ?? []),
  ];
  const tape = /** @type {HTMLInputElement | null | undefined} */ (document.activeElement);
  const reprise = tape?.dataset?.recherche === undefined ? undefined : { debut: tape.selectionStart, fin: tape.selectionEnd };
  projetsChoisisDeStation.replaceChildren(...(enregistree === undefined ? [] : [casesDeLEnregistree(document, enregistree, etatDesEnregistrees, gestesDesEnregistrees)]));
  if (reprise === undefined) return;
  const champ = /** @type {HTMLInputElement | null} */ (projetsChoisisDeStation.querySelector?.("input[type=search]") ?? null);
  champ?.focus();
  if (champ !== null && reprise.debut !== null && reprise.fin !== null) champ.setSelectionRange?.(reprise.debut, reprise.fin);
}

// Le plafond de cooks de la station, comme sa box le dit — `3 at most — 8 cores`, ou `5 at most — set by you,
// replaces 3 (8 cores)` — ; quand elle retient des tickets, ce qui la retient, avec ce que chaque ressource a et ce
// qu'il lui faut. Il se lit seulement : une station prend autant de tickets qu'elle déclare de places, et sa déclaration
// se change sur sa machine. Une station dont aucun projet lu ne dit le plafond n'a rien de tout cela.
/** @param {import("../accueil.ts").LigneDeStation | undefined} ligne */
function poserPlafond(ligne) {
  if (ligne?.plafond === undefined) return plafondDeStation.replaceChildren();
  const { plafond, retenue } = ligne;
  const lignes = [];
  const dit = bloc("p", `Cooks at once: ${plafond.dit}`);
  dit.className = "plafond";
  dit.append(niveauDe(document, "cooks"));
  lignes.push(dit);
  if (retenue !== undefined) {
    const retient = bloc("p", `Holding tickets — ${retenue.ressources}: ${retenue.detail}`);
    retient.className = "retenue";
    retient.append(survol(document, `no ticket is taken for ${retenue.depuis}, as long as it lasts; the running cooks carry on`));
    lignes.push(retient);
  }
  plafondDeStation.replaceChildren(...lignes);
}

// La station dont « remove the station » demande confirmation, par son gist.
/** @type {string | undefined} */
let retraitDeStationDemande;
// Ce que le retrait a refusé, en une ligne ; son détail est au survol.
let retraitDeStationRefuse = "";

// « Remove the station », en bas de sa page : un clic ouvre la confirmation, qui dit ce que ça change
// en une ligne ; « cancel » la referme et laisse la station en place, « remove » la retire de l'app
// et ramène à l'accueil. Rien de la station n'est touché : un code neuf l'appaire de nouveau.
/** @param {import("../stations/stations.ts").StationVue} station */
function poserRetireLaStation(station) {
  if (retraitDeStationDemande !== station.id) {
    const retirer = /** @type {HTMLButtonElement} */ (boutonDeLaFamille(document, "remove the station", undefined, { sorte: "danger" }));
    retirer.addEventListener("click", () => {
      retraitDeStationDemande = station.id;
      retraitDeStationRefuse = "";
      poserRetireLaStation(station);
    });
    return retraitDeStation.replaceChildren(retirer, ...(retraitDeStationRefuse === "" ? [] : [bloc("p", retraitDeStationRefuse)]));
  }
  retraitDeStation.replaceChildren(
    confirmationDeGeste(
      document,
      { titre: `Remove ${station.nom} from this app?`, prix: `${station.nom} leaves the home and is no longer read; it keeps running, and pairs again with a new code`, oui: "remove", non: ANNULER },
      {
        non: () => {
          retraitDeStationDemande = undefined;
          poserRetireLaStation(station);
        },
        oui: () => void retirerLaStation(station),
      },
    ),
  );
}

/** @param {import("../stations/stations.ts").StationVue} station */
async function retirerLaStation(station) {
  retraitDeStationDemande = undefined;
  let rendu;
  try {
    rendu = await brigade.retirerLaStation(station.id);
  } catch (erreur) {
    rendu = { refus: `${station.nom} was not removed: ${erreur instanceof Error ? erreur.message : String(erreur)}` };
  }
  if ("refus" in rendu) {
    retraitDeStationRefuse = rendu.refus;
    return poserPageDeStation();
  }
  retraitDeStationRefuse = "";
  ouvrirTous();
}

// Sur la page d'une station, tous les projets qu'elle porte, une ligne chacun : ceux que sa
// configuration sert — qu'ils viennent de l'app ou d'une ligne écrite à la main, la station les publie
// tous (stations/document.ts) —, puis ceux que l'app lui demande et qu'elle ne sert pas encore. Une
// station qui sert un projet le dit ; une autre dit pourquoi elle ne le sert pas. Toute la ligne s'ouvre d'un clic.
// Sous un projet ajouté depuis l'app, ce qu'il attend du chef — autoriser sur GitHub — et le geste
// qui le retire, en deux clics. Le vide ne se dit que s'il n'y a vraiment rien.
function poserProjets() {
  const station = stationsVues?.stations.find(({ id }) => id === stationOuverte);
  if (station === undefined) return listeDesProjets.replaceChildren();
  const demandes = (projetsVus?.projets ?? []).flatMap((projet) => {
    const ici = projet.stations.find(({ id }) => id === stationOuverte);
    return ici === undefined ? [] : [{ projet, ici }];
  });
  const noms = [...new Set([...station.projets, ...demandes.map(({ projet }) => projet.nom)])].sort((a, b) => a.localeCompare(b));
  const lignes = noms.map((nom) => {
    const demande = demandes.find(({ projet }) => projet.nom === nom);
    const servi = station.projets.includes(nom);
    const ligne = ligneDeProjetDeStation(nom, servi, demande);
    if (demande === undefined) return ligne;
    const pose = document.createElement("div");
    pose.className = "projet-de-station";
    const gestes = document.createElement("p");
    for (const url of demande.ici.autoriser) {
      gestes.append(bouton(`authorize on GitHub: ${url.replace(/^https:\/\/github\.com\/apps\/([^/]+).*$/, "$1")}`, () => void brigade.autoriserSurGitHub(url)));
    }
    gestes.append(bouton(retraitDemande === nom ? `remove ${nom} from its stations? click again` : "remove", () => void retirerProjet(nom), "danger"));
    pose.append(ligne, gestes);
    return pose;
  });
  // Tant que ce que l'app lui demande n'est pas lu, le vide n'est pas sûr : il ne se dit pas.
  const vide = station.etat === "illisible" ? "its projects cannot be read: neither can the station" : projetsVus === undefined ? LECTURE_DE("GitHub") : PAS_ENCORE("project on this station");
  listeDesProjets.replaceChildren(
    ...(lignes.length === 0 ? [bloc("p", vide)] : lignes),
    ...(projetsVus?.sans === undefined ? [] : [ligneErreur(document, "GitHub could not be read: the projects added from this app are the ones from before", projetsVus.sans)]),
  );
}

// Un projet sur la page d'une station : sa pastille, son nom, et ce qu'elle en dit. Un clic l'ouvre :
// son espace s'il est dans le fichier des projets de l'app ; sinon « Add a project », où il s'y
// déclare. Le détail — son dépôt, ce que la station en a dit — est au survol.
/** @param {string} nom @param {boolean} servi @param {{ projet: import("../projets/projets.ts").ProjetVu, ici: import("../projets/projets.ts").StationDuProjet } | undefined} demande */
function ligneDeProjetDeStation(nom, servi, demande) {
  const etat = servi ? "servi" : (demande?.ici.etat ?? "attendu");
  const ton = etat === "servi" ? "vert" : etat === "a-autoriser" ? "jaune" : etat === "refuse" ? "rouge" : "gris";
  const dit =
    etat === "servi"
      ? "served"
      : etat === "a-autoriser"
        ? "waiting for your authorization on GitHub"
        : etat === "en-preparation"
          ? "being prepared"
          : etat === "refuse"
            ? "refused"
            : "not read yet";
  const declare = projetDe(nom);
  const survolDit = [
    demande === undefined ? "installed on this station outside the app" : `${demande.projet.depot} · ${demande.projet.base}`,
    ...(demande === undefined || demande.ici.dit === "" ? [] : [demande.ici.dit]),
    ...(demande === undefined || demande.projet.servi === null ? [] : [demande.projet.servi]),
    declare === undefined ? `not in this app's projects yet: a click opens “${AJOUTER_UN_PROJET}”` : "",
  ].filter((ligne) => ligne !== "");
  const cree = document.createElement("button");
  cree.type = "button";
  cree.className = "ligne";
  cree.dataset.projet = nom;
  cree.title = survolDit.join("\n");
  cree.ariaLabel = `${nom} — ${dit}`;
  const appele = bloc("strong", nom);
  appele.className = "mono";
  const suite = bloc("span", "›");
  suite.className = "ouvrir";
  suite.ariaHidden = "true";
  cree.append(pastille(dit, ton), appele, bloc("span", dit), suite);
  cree.addEventListener("click", () => (declare === undefined ? ouvrirAjout() : void ouvrir(declare)));
  return cree;
}

// Retirer, en deux clics : le premier demande, le second retire le projet de la demande de chacune
// de ses stations — elles le retirent de leur configuration.
/** @param {string} nom */
async function retirerProjet(nom) {
  if (retraitDemande !== nom) {
    retraitDemande = nom;
    return poserProjets();
  }
  retraitDemande = undefined;
  ajoutDit.textContent = `removing ${nom} from its stations…`;
  poserProjets();
  const rendu = await brigade.retirerDUneStation(nom);
  ajoutDit.textContent = "refus" in rendu ? rendu.refus : `${rendu.retire} is removed: each of its stations takes it out of its configuration within a minute`;
}

// Les stations du parcours : une case par station appairée. Celle que l'app
// recommande — un serveur — est proposée d'office ; choisir un ordinateur se dit tout de suite.
function poserChoixDesStations() {
  if (parcours === undefined) return;
  poserLesStations(parcours, choixDesStations, avertissementDesStations, { exclues: [], relancer: poserChoixDesStations });
}

// Une case par station appairée — sauf celles qui portent déjà le projet. Sans case cochée, celle que l'app
// recommande est proposée d'office, tant que le chef n'a rien touché.
/**
 * @param {{ choisies: Set<string>, touchee: boolean }} vise
 * @param {HTMLElement} ou @param {HTMLElement} averti
 * @param {{ exclues: readonly string[], relancer: () => void }} options
 */
function poserLesStations(vise, ou, averti, { exclues, relancer }) {
  const appairees = (stationsVues?.stations ?? []).filter(({ id, cuisine }) => cuisine !== false && !exclues.includes(id));
  const recommandee = projetsVus?.recommandee;
  if (!vise.touchee && vise.choisies.size === 0 && recommandee && appairees.some(({ id }) => id === recommandee)) vise.choisies.add(recommandee);
  ou.replaceChildren(
    ...(appairees.length === 0
      ? [bloc("p", exclues.length === 0 ? "no station to serve it: pair one first, with “+ station” under All stations, on the home" : "no other paired station: pair one first, with “+ station” under All stations, on the home")]
      : appairees.map((station) => {
          const ligne = document.createElement("p");
          ligne.dataset.etat = station.etat;
          const choisie = document.createElement("input");
          choisie.type = "checkbox";
          choisie.ariaLabel = `serve it on ${station.nom}`;
          choisie.checked = vise.choisies.has(station.id);
          choisie.addEventListener("change", () => {
            vise.touchee = true;
            if (choisie.checked) vise.choisies.add(station.id);
            else vise.choisies.delete(station.id);
            relancer();
          });
          ligne.append(choisie, bloc("span", ` ${station.nom}${station.machine === "" ? "" : ` — ${station.machine}`}`));
          return ligne;
        })),
  );
  // Seul un ordinateur, choisi sans serveur, arrête la cuisine quand le chef ferme l'app : c'est ce que l'avertissement dit.
  const choisies = [...vise.choisies];
  averti.textContent = choisies.length > 0 && choisies.every((id) => projetsVus?.avertissements[id] !== undefined) ? (projetsVus?.avertissements[choisies[0] ?? ""] ?? "") : "";
  averti.dataset.etat = averti.textContent === "" ? "" : "hors-ligne";
}

// Ouvrir le parcours : l'heure en est gardée — c'est d'elle que se mesure le temps jusqu'au projet
// servi —, et les dépôts du chef se lisent sur GitHub.
ouvrirLeParcours.addEventListener("click", () => void ouvrirParcours());
async function ouvrirParcours() {
  parcours = { ouvertLe: new Date().toISOString(), depots: [], choisies: new Set(), touchee: false };
  formulaireDAjout.hidden = false;
  ouvrirLeParcours.hidden = true;
  ajoutDit.textContent = "";
  ajoutRefuse.replaceChildren();
  baseChoisie.value = "";
  cooksChoisis.value = "";
  for (const [champ, liste] of Object.entries(calibrageDuProjet)) proposer(liste, champ.endsWith("modele") ? CALIBRAGE_DU_PROJET.modeles : CALIBRAGE_DU_PROJET.efforts, champ.endsWith("modele") ? `— ${champ.split("-")[0]} model —` : `— ${champ.split("-")[0]} effort —`);
  depotChoisi.replaceChildren(new Option("— repository —", ""));
  etapeDuProjet.replaceChildren(bloc("p", LECTURE_DE("your repositories on GitHub")));
  poserChoixDesStations();
  const vise = parcours;
  const lus = await brigade.depotsDuChef();
  if (parcours !== vise) return;
  if (!("refus" in lus)) vise.depots = lus.depots;
  etapeDuProjet.replaceChildren(
    poserEtapeProjet(document, {
      depots: "refus" in lus ? lus : lus.depots,
      resoudre: (depot) => brigade.lireUnDepot(depot),
      ajouter: async (choisi) => {
        depotChoisi.replaceChildren(new Option(choisi.depot, choisi.depot));
        depotChoisi.value = choisi.depot;
        baseChoisie.value = choisi.base;
        const refus = await ajouterProjet();
        return refus === undefined ? undefined : { refus };
      },
      suivante: () => {},
      // Le dépôt choisi est vérifié, et préparé d'un bouton s'il ne l'est pas (ticket 2627).
      verifier: (depot) => brigade.checkRepoSetup(depot),
      installer: (depot) => brigade.runRepoSetup(depot),
    }),
  );
}
// Le dépôt choisi propose sa branche par défaut comme branche d'intégration.
depotChoisi.addEventListener("change", () => {
  const choisi = parcours?.depots.find(({ depot }) => depot === depotChoisi.value);
  if (choisi !== undefined) baseChoisie.value = choisi.base;
});
annulerAjout.addEventListener("click", () => fermerParcours());
function fermerParcours() {
  parcours = undefined;
  formulaireDAjout.hidden = true;
  ouvrirLeParcours.hidden = false;
}
// Valider : la demande part au process principal, qui l'écrit dans le gist de chaque station
// choisie — ou chaque champ qui manque se lit sous le formulaire, et rien n'est écrit.
formulaireDAjout.addEventListener("submit", (evenement) => {
  evenement.preventDefault();
  void ajouterProjet();
});
/** @returns {Promise<string | undefined>} ce qui a refusé l'ajout, ou rien s'il est fait */
async function ajouterProjet() {
  if (parcours === undefined) return "no project is being added.";
  /** @type {string | undefined} */
  let refuse;
  validerAjout.disabled = true;
  ajoutRefuse.replaceChildren(bloc("p", "writing the request on your stations' gists…"));
  try {
    const rendu = await brigade.ajouterAUneStation({
      depot: depotChoisi.value,
      base: baseChoisie.value,
      stations: [...parcours.choisies],
      cooks: cooksChoisis.value,
      manager: { modele: calibrageDuProjet["manager-modele"].value, effort: calibrageDuProjet["manager-effort"].value },
      reviewer: { modele: calibrageDuProjet["reviewer-modele"].value, effort: calibrageDuProjet["reviewer-effort"].value },
      ouvertLe: parcours.ouvertLe,
    });
    if ("signales" in rendu) {
      ajoutRefuse.replaceChildren(...Object.values(rendu.signales).map((raison) => ligneErreur(document, raison ?? "", "", { classe: "" })));
      refuse = Object.values(rendu.signales).join(" ");
    } else if ("refus" in rendu) {
      ajoutRefuse.replaceChildren(bloc("p", rendu.refus));
      refuse = rendu.refus;
    }
    else {
      fermerParcours();
      ajoutRefuse.replaceChildren();
      ajoutDit.textContent = `${rendu.ajoute} is asked of its stations: each station prepares it and adds it within a minute — if GitHub asks you to authorize brigade, its button is below the project`;
    }
  } catch (erreur) {
    refuse = `nothing was added: ${erreur instanceof Error ? erreur.message : String(erreur)}`;
    ajoutRefuse.replaceChildren(bloc("p", refuse));
  }
  validerAjout.disabled = false;
  return refuse;
}

// Ce qu'une station dit du projet qu'on lui a confié, en quelques mots, et le ton de sa pastille. Une station
// ajoutée est verte quand elle sert le projet, grise sinon.
/** @param {import("../projets/projets.ts").StationDuProjet["etat"]} etat */
function etatDeLaCuisine(etat) {
  if (etat === "servi") return { dit: "served", ton: "vert" };
  if (etat === "a-autoriser") return { dit: "waiting for your authorization on GitHub", ton: "jaune" };
  if (etat === "en-preparation") return { dit: "being prepared", ton: "gris" };
  if (etat === "refuse") return { dit: "refused", ton: "rouge" };
  return { dit: "not read yet", ton: "gris" };
}

// Une station déclarée par le projet qui n'en sert pas le dépôt : ce n'est pas qu'elle est hors ligne.
const NE_SERT_PAS = "does not serve this project";

// Les stations qui font la cuisine d'un projet de l'app : celles qui le servent — qu'il leur ait été
// confié d'ici ou non, elles le publient (stations/document.ts) —, puis celles à qui l'app l'a demandé
// et qui ne le servent pas encore. `demande` : l'app en a déjà demandé la cuisine — une station de plus
// en reprend le plafond et le calibrage ; `tenue` : une station en porte déjà le suivi.
/** @param {Projet} projet */
function cuisineDe(projet) {
  // La box du projet ne répond pas : celles qui le servent sont dites injoignables, pas servies.
  const muette = muets.has(projet.nom);
  const demande = projetsVus?.projets.find(({ nom }) => nom === projet.nom);
  const servies = (stationsVues?.stations ?? []).filter(({ projets }) => projets.includes(projet.nom));
  const stations = [
    ...servies.map(({ id, nom }) => ({ id, nom, ...(muette ? { dit: "unreachable", ton: "rouge" } : etatDeLaCuisine("servi")), pourquoi: "", geste: "", survol: muette ? `${nom} does not answer: the app knows nothing of the kitchen right now` : `${nom} serves it`, autoriser: /** @type {string[]} */ ([]), bloquee: false })),
    ...(demande?.stations ?? [])
      .filter(({ id }) => !servies.some((servie) => servie.id === id))
      .map((station) => {
        // Une station ajoutée ne sert le projet que lorsqu'elle l'a lu ; avant, la ligne dit où elle en est.
        const lue = (stationsVues?.stations ?? []).find(({ id }) => id === station.id);
        // Déclarée par le projet, mais la station en sert d'autres et pas celui-ci : elle n'y cuit pas, et ce n'est pas qu'elle est hors ligne.
        const nonServie = station.etat === "attendu" && lue !== undefined && lue.projets.length > 0 && !lue.projets.includes(projet.nom);
        const sans = nonServie ? { pourquoi: NE_SERT_PAS, geste: "tick it in its projects" } : station.etat === "attendu" ? { pourquoi: "not received by the station", geste: `open Brigade on ${station.nom}'s computer: it reads what this app asked within a minute; if it stays so, remove it from its page and add it again` } : station.etat === "a-autoriser" ? { pourquoi: "waiting for your authorization on GitHub", geste: "authorize the app on GitHub with the button beside it" } : undefined;
        return { id: station.id, nom: station.nom, ...etatDeLaCuisine(station.etat), pourquoi: sans?.pourquoi ?? "", geste: sans?.geste ?? "", survol: station.dit, autoriser: station.autoriser, bloquee: nonServie };
      }),
  ];
  return { stations, demande: demande !== undefined, tenue: servies.length > 0 || demande?.suiviPar !== undefined };
}

// « Add a station » (ticket 2487) : offert sur un écran large — l'écran étroit ne règle rien —, pour un projet dont l'app
// connaît le dépôt. Cet ordinateur est proposé si sa station ne sert pas déjà le dépôt ; puis les stations du compte à qui
// il n'est pas choisi. Ouvrir relit l'une et l'autre lecture, et l'étape se repose avec elles.
/** @param {Projet} projet */
function ajoutDeStationDe(projet) {
  const depot = projet.depot ?? projetsVus?.projets.find(({ nom }) => nom === projet.nom)?.depot ?? "";
  // Ni en lecture seule (ticket 3163) : une station ajoutée ne pourrait rien écrire dans le dépôt.
  if (etroit() || depot === "" || lectureSeuleDe(projet) !== undefined) return {};
  const lecture = servis.etat?.lecture;
  const servisIci = lecture !== undefined && "depots" in lecture ? lecture.depots : undefined;
  const lues = enregistreesAbsentes ? undefined : etatDesEnregistrees.stations;
  return {
    ajout: {
      donnees: {
        projet: projet.nom,
        ici: POSTE.nom,
        iciOffert: servisIci !== undefined && !servisIci.some((servi) => servi.toLowerCase() === depot.toLowerCase()),
        stations: lues?.state === "listed" ? stationsAProposer(lues.stations, depot, projetsVus?.locale) : [],
      },
      etat: ajoutDeStation.etatDe(projet.nom),
      gestes: {
        ouvrir: () => {
          ajoutDeStation.ouvrir(projet.nom);
          void Promise.all([servis.lire(), lireLesEnregistrees()]).then(reposerLOngletStations);
        },
        annuler: () => ajoutDeStation.annuler(projet.nom),
        servirIci: () => ajoutDeStation.servirIci(projet.nom, depot, POSTE.nom),
        /** @param {import("../stations-du-compte.ts").StationEnregistree} station */
        confier: (station) => ajoutDeStation.confier(projet.nom, depot, station),
      },
    },
  };
}

// Ce que les stations du compte ont fait du dépôt du projet, choisi pour elles alors qu'une autre le servait déjà (ticket
// 1790, stations-du-compte.js).
/** @param {Projet} projet */
function ajoutsDuProjet(projet) {
  const depot = projet.depot ?? projetsVus?.projets.find(({ nom }) => nom === projet.nom)?.depot ?? "";
  return ajoutsDesEnregistrees(enregistreesAbsentes ? undefined : etatDesEnregistrees.stations, { nom: projet.nom, depot });
}

// Où cuit un projet de l'app : la station que ses stations disent le servir (projets.ts, `cuitSur`) —
// pas celle que la demande nomme : un déménagement refusé le laisse cuire là où il cuisait —, à
// défaut celle qui porte son suivi ; ou la station de cet ordinateur, qui le sert sans l'app (ticket 1122) — pas quand sa
// liste de projets servis, lue, ne le porte pas : elle le fait tourner sans le cuire (ticket 3399). `ici` : c'est cet
// ordinateur. Aucune : on ne sait pas encore où il cuit.
/** @param {Projet} projet @param {ReturnType<typeof cuisineDe>["stations"]} stations @returns {{ id: string | null, nom: string, ici: boolean } | undefined} */
function ouCuit(projet, stations) {
  const locale = projetsVus?.locale ?? null;
  const dit = projetsVus?.projets.find(({ nom }) => nom === projet.nom)?.cuitSur;
  if (dit !== undefined && dit !== null) return { ...dit, ici: dit.ici || (dit.id !== null && dit.id === locale) };
  const suiviPar = projetsVus?.projets.find(({ nom }) => nom === projet.nom)?.suiviPar;
  const sienne = stations.find(({ id }) => id === suiviPar?.id) ?? stations.find(({ bloquee }) => !bloquee);
  if (sienne !== undefined) return { id: sienne.id, nom: sienne.nom, ici: sienne.id === locale || projet.ici === true };
  if (projet.ici === true && serviParCetOrdinateur(projet) !== false) return { id: null, nom: "", ici: true };
  return undefined;
}

// Le nom d'une station tel que la page d'un projet le dit : « this Mac » (« this PC » sous Windows) pour celle de cet ordinateur.
/** @param {string} nom */
function nomDit(nom) {
  return nom;
}

// Une station du projet, sur sa ligne : sa pastille et son nom — « this Mac » pour cet ordinateur —,
// ce qu'elle en dit au survol ; un clic ouvre sa page. `renfort` : nommée après celle où il cuit.
/** @param {ReturnType<typeof cuisineDe>["stations"][number]} station @param {boolean} ici @param {Projet} [projet] le projet dont c'est la ligne : une station rouge y porte « report to brigade » */
function stationNommee(station, ici, projet) {
  // Une station a un seul nom, le sien, sur tous les écrans ; celle de cet ordinateur le dit en plus.
  const locale = projetsVus?.locale ?? null;
  const sienne = (stationsVues?.stations ?? []).find(({ id }) => id === locale);
  const ceMac = ici || (station.id !== "" && station.id === locale);
  const nom = station.nom !== "" ? station.nom : ceMac ? (sienne?.nom ?? POSTE.nom) : "";
  const dit = ceMac && nom !== CET_ORDINATEUR ? `${nom} (${CET_ORDINATEUR})` : nom;
  // Son nom ouvre sa page : un bouton discret de la famille.
  const nomme = bouton("", undefined, "discret");
  nomme.className = "station-du-projet";
  nomme.title = [ceMac && nom !== "" && nom !== CET_ORDINATEUR ? `${nom}, ${CET_ORDINATEUR}'s station` : "", station.dit, station.survol].filter((ligne) => ligne !== "").join("\n");
  const appele = bloc("strong", dit);
  appele.className = "mono";
  nomme.ariaLabel = `${dit} — ${station.dit}`;
  nomme.append(pastille(station.dit, station.ton), appele);

  if (station.id !== "") nomme.addEventListener("click", () => ouvrirStation(station.id));
  else nomme.disabled = true;
  const autoriser = station.autoriser.map((url) => {
    return bouton(`authorize on GitHub: ${url.replace(/^https:\/\/github\.com\/apps\/([^/]+).*$/, "$1")}`, () => void brigade.autoriserSurGitHub(url));
  });
  const pose = document.createElement("span");
  pose.className = "station-et-gestes";
  // Une station ajoutée mais pas atteinte : deux mots, ce que le chef fait ailleurs au survol, et le geste de l'app.
  const pourquoi = bloc("span", station.pourquoi);
  pourquoi.className = "pourquoi";
  pourquoi.title = station.geste;
  const relire = /** @type {HTMLButtonElement} */ (bouton("check again", undefined));
  relire.className = "relire-la-station";
  relire.title = "reads GitHub again, to see whether the station has spoken";
  relire.addEventListener("click", () => {
    relire.disabled = true;
    void brigade.panne(station.id, "relire-la-station").finally(() => (relire.disabled = false));
  });
  pose.append(nomme, ...(station.pourquoi === "" ? [] : station.pourquoi === NE_SERT_PAS ? [pourquoi] : [pourquoi, relire]), ...autoriser);
  // Rouge — refusée, injoignable — : « report to brigade » à la suite (ticket 1977).
  if (station.ton === "rouge" && projet !== undefined) pose.append(...signalement.poser({ projet: projet.nom, reference: { station: station.nom }, panne: `station ${station.nom}, cooking ${projet.nom}: ${[station.dit, station.survol].filter((morceau) => morceau !== "").join(" — ")}` }));
  return pose;
}

// Un projet qui cuit sur cet ordinateur s'arrête avec l'app : ça se dit à côté de « this Mac ».
function sArrete() {
  const dit = bloc("span", " · its kitchen stops when you close the app");
  dit.className = "s-arrete";
  return dit;
}

// Un déménagement en route, après la station où il cuit encore : vers où, et où il en est au survol.
/** @param {import("../projets/projets.ts").DemenagementEnCours} enCours */
function enMouvement(enCours) {
  const etape = enCours.etape === "demandee" ? "asked: it cooks here until the other is ready" : enCours.etape === "acceptee" ? "accepted: its kitchen is closing here" : "handed over: it opens there in a moment";
  const dit = bloc("span", ` · moving to ${nomDit(enCours.vers)}…`);
  dit.className = "en-mouvement";
  dit.title = [`moving ${etape}`, enCours.dit].filter((ligne) => ligne !== "").join("\n");
  return dit;
}

// Si la cuisine d'un projet peut déménager — et vers quelles stations —, ou pourquoi pas, en une phrase : un projet que l'app
// a confié à une station, qui cuit sur l'une d'elles, sans déménagement accepté en route, et une autre station où aller.
/**
 * @param {Projet} projet @param {ReturnType<typeof ouCuit>} ou
 * @param {import("../projets/projets.ts").DemenagementEnCours | null} enCours @param {boolean} lues
 */
function deplacementDe(projet, ou, enCours, lues) {
  const confie = projetsVus?.projets.some(({ nom, suiviPar }) => nom === projet.nom && suiviPar !== undefined) ?? false;
  const fige = enCours !== null && (enCours.etape === "acceptee" || enCours.etape === "remise");
  const repris = enCours !== null && !fige;
  const appairees = (stationsVues?.stations ?? []).filter(({ etat, cuisine }) => etat !== "illisible" && cuisine !== false);
  const destinations = appairees.filter(({ id }) => id !== ou?.id || repris);
  const pourquoiPas = !lues
    ? "your stations are still being read on GitHub"
    : !confie
      ? `${projet.nom} was not added to a station from this app: the app does not move its kitchen`
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
 * @param {Projet} projet @param {ReturnType<typeof ouCuit>} ou
 * @param {import("../projets/projets.ts").DemenagementEnCours | null} enCours @param {boolean} lues
 */
function poserLeDemenagement(projet, ou, enCours, lues) {
  if (demenagement !== undefined && demenagement.projet !== projet.nom) fermerDemenagement();
  const { offert, destinations } = deplacementDe(projet, ou, enCours, lues);
  ouvrirLeDemenagement.hidden = !offert || demenagement !== undefined || confiance !== undefined;
  if (!offert) fermerDemenagement();

  // Ce que le dernier déménagement a rendu ; à défaut, un refus de la station visée.
  const deLui = demenagementDitPour.projet === projet.nom && demenagementDitPour.dit !== "";
  const refusParElle = enCours !== null && enCours.etape === "refusee" ? `${projet.nom} stays on ${nomDit(enCours.de)}: ${nomDit(enCours.vers)} refused to take it over — ${enCours.dit}` : "";
  const dit = deLui ? demenagementDitPour.dit : refusParElle;
  const refus = deLui ? demenagementDitPour.refus : refusParElle !== "";
  demenagementDit.classList.toggle("refus", refus);
  demenagementDit.replaceChildren(...(dit === "" ? [] : [bloc("span", dit)]), ...(deLui && demenagementDitPour.detail !== "" ? [survol(document, demenagementDitPour.detail)] : []));
  demenagementDit.hidden = dit === "";

  if (demenagement === undefined || ou === undefined) return;
  const depuis = ou.ici && ou.nom === "" ? POSTE.nom : ou.nom;
  const recommandee = projetsVus?.recommandee ?? null;
  const vise = demenagement;
  // Chaque machine est un bouton ; celle que l'app recommande — toujours allumée — se distingue. Ce que
  // la choisir implique est au survol.
  const machines = destinations.map((station) => {
    const garder = station.id === ou.id;
    const nomme = station.nom;
    const bouton = /** @type {HTMLButtonElement} */ (boutonDeLaFamille(document, garder ? `keep it on ${nomme}` : nomme, undefined, { sorte: !garder && station.id === recommandee ? "recommande" : "secondaire" }));
    bouton.disabled = vise.part;
    bouton.dataset.vers = station.id;
    bouton.title = [projetsVus?.machines[station.id]?.implique ?? "", station.etat === "en-ligne" ? "" : station.dit].filter((ligne) => ligne !== "").join(" · ");
    bouton.addEventListener("click", () => void demenager(projet, station.id, { nomme, depuis, garder }));
    return bouton;
  });
  const titre = bloc("p", `Move ${projet.nom}'s kitchen from ${depuis} to:`);
  titre.className = "titre";
  const lesMachines = document.createElement("div");
  lesMachines.className = "machines-du-demenagement";
  lesMachines.append(...machines);
  const prix = bloc("p", "Its cooks in flight stop and their tickets go back to the rail; its whole journal follows it.");
  prix.className = "prix";
  const annuler = /** @type {HTMLButtonElement} */ (bouton(ANNULER, undefined, "discret"));
  annuler.disabled = vise.part;
  annuler.addEventListener("click", () => {
    fermerDemenagement();
    poserStationsDuProjet();
  });
  lesMachines.append(annuler);
  choixDuDemenagement.replaceChildren(titre, lesMachines, prix);
  choixDuDemenagement.hidden = false;
}
function ouvrirLeChoixDeMachine() {
  if (courant === undefined) return;
  demenagement = { projet: courant.nom, part: false };
  demenagementDitPour = { projet: "", dit: "", refus: false, detail: "" };
  poserStationsDuProjet();
  reposerLOngletStations();
}
ouvrirLeDemenagement.addEventListener("click", ouvrirLeChoixDeMachine);
// « Continue without sandbox » : le chef décide pour la station du projet. Ce que le runtime a répondu se dit sous
// la ligne ; l'avertissement, lui, s'en va quand la station publie l'état suivant.
// Les projets dont le chef a décidé de continuer sans bac à sable : le parcours le montre sans attendre la station.
/** @type {Set<string>} */
const decisionsPrises = new Set();
/** @param {string} nom */
async function continuerSansBac(nom) {
  demenagementDitPour = { projet: nom, dit: "telling the station to continue without a sandbox…", refus: false, detail: "" };
  poserStationsDuProjet();
  try {
    const rendu = await brigade.continuerSansBacASable(nom);
    if ("fait" in rendu) decisionsPrises.add(nom);
    demenagementDitPour = "fait" in rendu ? { projet: nom, dit: rendu.fait, refus: false, detail: "" } : { projet: nom, dit: rendu.refus, refus: true, detail: rendu.detail ?? "" };
  } catch (erreur) {
    demenagementDitPour = { projet: nom, dit: "the choice could not be recorded: nothing was changed", refus: true, detail: erreur instanceof Error ? erreur.message : String(erreur) };
  }
  poserStationsDuProjet();
}
// Le bouton du refus de la station (ticket 1205) : la station qui porte le suivi du projet joue le remède que le refus publie. Ce
// qu'il en est se tient ici, par projet, d'une relecture à l'autre : la confirmation ouverte, la demande en route,
// ce que la station a répondu. Levé, le refus quitte la page sans attendre : la relecture suivante dit ce qu'il en
// est vraiment. Tenu, la phrase reste tant que la station publie un refus.
/** @type {Map<string, import("./onboarding/depot-retenu.js").EtatDuRemede | { etape: "leve" }>} */
const remedesDesRefus = new Map();
// Ce que la page dit d'un remède qui n'est pas parti, ou dont on ne sait rien : la phrase, sans ce que GitHub a
// répondu — qui suit le tiret, au survol.
/** @param {string} erreur */
function erreurDuRemede(erreur) {
  const [tete = "", ...reste] = erreur.split(" — ");
  return { dit: `${tete.charAt(0).toUpperCase()}${tete.slice(1).replace(/\.?$/, ".")}`, detail: reste.join(" — ") };
}
/** @param {string} nom */
async function leverLeRefus(nom) {
  const vu = projetsVus?.projets.find((projet) => projet.nom === nom);
  const refus = vu?.refus ?? null;
  const etat = remedesDesRefus.get(nom);
  if (refus === null || refus.remedy === undefined || etat?.etape === "en-cours") return;
  const station = vu?.suiviPar?.nom ?? "its station";
  remedesDesRefus.set(nom, { etape: "en-cours", station });
  poserStationsDuProjet();
  /** @type {import("../projets/remede.ts").IssueDuRemede} */
  let issue;
  try {
    issue = await brigade.leverLeRefus(nom, refus.code, refus.remedy.id);
  } catch (erreur) {
    issue = { outcome: "error", error: erreur instanceof Error ? erreur.message : String(erreur) };
  }
  remedesDesRefus.set(
    nom,
    issue.outcome === "lifted"
      ? { etape: "leve" }
      : issue.outcome === "holds"
        ? { etape: "dit", dit: issue.reason }
        : { etape: "dit", ...erreurDuRemede(issue.error) },
  );
  if (courant?.nom === nom) poserStationsDuProjet();
}
function fermerDemenagement() {
  demenagement = undefined;
  choixDuDemenagement.hidden = true;
  choixDuDemenagement.replaceChildren();
}
// Déménager : l'opération du runtime part, par le process principal. Ce qu'elle rend se dit sous la
// ligne ; la ligne, elle, ne dit que ce que les stations publient — où il cuit vraiment.
/** @param {Projet} projet @param {string} vers @param {{ nomme: string, depuis: string, garder: boolean }} dits */
async function demenager(projet, vers, { nomme, depuis, garder }) {
  if (demenagement === undefined || demenagement.projet !== projet.nom) return;
  const vise = demenagement;
  vise.part = true;
  vise.vers = vers;
  demenagementDitPour = { projet: projet.nom, dit: `asking your stations to move ${projet.nom}'s kitchen…`, refus: false, detail: "" };
  poserStationsDuProjet();
  reposerLOngletStations();
  try {
    const rendu = await brigade.demenagerLaCuisine(projet.nom, vers);
    // Parti, l'onglet Stations le suit dès maintenant, sur sa ligne du haut (ticket 3195) ; repris, il n'y a plus rien à suivre.
    if (!("refus" in rendu)) {
      if (garder) deplacementsDemandes.delete(projet.nom);
      else deplacementsDemandes.set(projet.nom, { de: depuis, vers: nomme, depuis: Date.now() });
    }
    demenagementDitPour =
      "refus" in rendu
        ? { projet: projet.nom, dit: `${projet.nom} stays on ${depuis}: ${rendu.refus}`, refus: true, detail: rendu.detail ?? "" }
        : garder
          ? { projet: projet.nom, dit: `${projet.nom} keeps cooking on ${nomme}: the move is called off`, refus: false, detail: "" }
          : { projet: projet.nom, dit: `${projet.nom}'s kitchen moves to ${nomme}: ${depuis} hands it over as soon as ${nomme} is ready — until then it cooks on ${depuis}`, refus: false, detail: "" };
  } catch (erreur) {
    demenagementDitPour = { projet: projet.nom, dit: `${projet.nom} stays on ${depuis}: nothing was sent`, refus: true, detail: erreur instanceof Error ? erreur.message : String(erreur) };
  }
  if (demenagement === vise) fermerDemenagement();
  if (courant?.nom === projet.nom) poserStationsDuProjet();
  reposerLOngletStations();
}

// La ligne des stations du projet affiché, en tête de son espace — et, s'il est ouvert, le choix de
// celles à qui le confier. Aucune lecture des stations n'est encore arrivée : le vide ne se dit pas.
function poserStationsDuProjet() {
  const projet = courant;
  // Le parcours prêt, montré puis quitté : il ne se remontre pas à la visite suivante.
  if (pretMontre !== undefined && pretMontre !== projet?.nom) {
    parcoursRanges.add(pretMontre);
    pretMontre = undefined;
  }
  stationsDuProjet.hidden = projet === undefined;
  if (projet === undefined) {
    poserLesChoix(undefined);
    poserLesBlocages(undefined);
    poserLeDelai(undefined);
    return;
  }
  if (confiance !== undefined && confiance.projet !== projet.nom) fermerConfiance();
  const { stations, demande, tenue } = cuisineDe(projet);
  const lues = stationsVues !== undefined && projetsVus !== undefined;
  const ou = ouCuit(projet, stations);
  const enCours = projetsVus?.projets.find(({ nom }) => nom === projet.nom)?.demenagement ?? null;
  if (stations.length > 0 || ou !== undefined) {
    // Où il cuit, d'abord — « this Mac » pour la station de cet ordinateur —, puis les autres.
    const sienne = stations.find(({ id }) => id === ou?.id);
    const autres = stations.filter((station) => station !== sienne && !(enCours !== null && enCours.etape !== "refusee" && station.nom === enCours.vers));
    const tete = ou === undefined ? [] : [stationNommee(sienne ?? { id: ou.id ?? "", nom: ou.nom, dit: "served", ton: "vert", survol: "", pourquoi: "", geste: "", autoriser: [], bloquee: false }, ou.ici, projet)];
    ligneDesStationsDuProjet.replaceChildren(
      bloc("span", ou === undefined ? "Cooked by " : "Cooks on "),
      ...tete,
      ...(ou?.ici === true ? [sArrete()] : []),
      ...(enCours !== null && enCours.etape !== "refusee" ? [enMouvement(enCours)] : []),
      ...autres.flatMap((station, i) => {
        return [...(i === 0 && tete.length === 0 ? [] : [bloc("span", " · ")]), stationNommee(station, false, projet)];
      }),
    );
  } else {
    ligneDesStationsDuProjet.textContent = lues ? `No station cooks ${projet.nom} yet.` : LECTURE_DE("your stations on GitHub");
  }
  poserLeDemenagement(projet, ou, enCours, lues);
  // Une station du compte qui refuse de l'avoir (ticket 1790) : son nom et sa phrase, une ligne chacune.
  const { refusees } = ajoutsDuProjet(projet);
  stationRefusee.replaceChildren(
    ...refusees.map(({ station, phrase }) => ligneErreur(document, `${station.name} was not added: ${phrase}`, "", { classe: "ajout-refuse" })),
  );
  stationRefusee.hidden = refusees.length === 0;
  poserLesChoix(projet);
  poserLesBlocages(projet);
  poserLeDelai(projet);
  ouvrirLaConfiance.textContent = stations.length === 0 && !seLit(projet) && projet.sansStation !== true ? "choose its machine" : "+ station";
  ouvrirLaConfiance.hidden = confiance !== undefined || demenagement !== undefined || !lues;
  const vu = projetsVus?.projets.find(({ nom }) => nom === projet.nom);
  const onboarding = vu?.onboarding ?? null;
  const remede = remedesDesRefus.get(projet.nom);
  const refus = remede?.etape === "leve" ? null : (vu?.refus ?? null);
  const retenu = poserDepotRetenu(document, { acces: vu?.acces ?? null, clone: vu?.clone ?? null, refus, worktree: vu?.worktree ?? null, maintenant: Date.now(), copier: (commande) => void navigator.clipboard.writeText(commande), ouvrir: (url) => void brigade.autoriserSurGitHub(url), remede: {
    ...(remede === undefined || remede.etape === "leve" ? {} : { etat: remede }),
    ouvrir: () => {
      remedesDesRefus.set(projet.nom, { etape: "confirmer" });
      poserStationsDuProjet();
    },
    lancer: () => void leverLeRefus(projet.nom),
    renoncer: () => {
      remedesDesRefus.delete(projet.nom);
      poserStationsDuProjet();
    },
  } });
  depotRetenu.hidden = retenu === null;
  depotRetenu.replaceChildren(...(retenu === null ? [] : [retenu]));
  // La station dit ce qui la retient : la phrase qui promet de se préparer « within a minute » ne se dit plus.
  const annonceTenue = onboarding === null && retenu === null && Date.now() - confianceDitePour.a < 60_000;
  confianceDite.textContent = confianceDitePour.projet === projet.nom && annonceTenue ? confianceDitePour.dit : "";
  poserLeParcours(projet.nom, onboarding);
  // Les stations sont de l'onglet Stations (ticket 1184). Sur Rail, elles restent en vue tant qu'elles sont ce qui
  // t'attend : le projet ne cuit nulle part, son parcours est à suivre, un choix de machine est ouvert, ou
  // sa cuisine est retenue — un worktree qui ne se prépare pas (ticket 1119). L'accès au dépôt refusé et le refus de
  // la station, eux, sont dits sur Rail par la ligne d'alerte, qui ouvre Stations : une seule ligne (ticket 1185).
  const ditParLAlerte = (vu?.acces ?? vu?.worktree?.acces ?? vu?.refus ?? null) !== null;
  // Sur un écran étroit, elles ne sont ni sur Stations — ce sont des réglages : en ajouter, déménager, le bac à sable —, ni
  // sur la conversation (ticket 1186). Sur Rail, comme sur un écran large.
  const rangees = etroit() && ongletDe(projet) !== RAIL;
  // Sur Stations, l'onglet dit lui-même qui cuit le projet et comment le changer (ticket 3195, stations-tab/) : la ligne des
  // stations, ses gestes et ce qu'ils ont rendu n'y sont pas — seul ce qui retient sa cuisine, son parcours et le choix
  // de sa machine restent en tête.
  const surStations = ongletDe(projet) === STATIONS;
  ligneDesStationsDuProjet.hidden = surStations;
  if (surStations) for (const pose of [stationRefusee, demenagementDit, choixDuDemenagement, ouvrirLeDemenagement, ouvrirLaConfiance]) pose.hidden = true;
  stationsDuProjet.hidden =
    rangees ||
    (seLit(projet) && parcoursDuProjet.hidden && (depotRetenu.hidden || ditParLAlerte) && stationRefusee.hidden && confiance === undefined && demenagement?.projet !== projet.nom) ||
    (surStations && parcoursDuProjet.hidden && depotRetenu.hidden && confiance === undefined && confianceDite.textContent === "");
  if (confiance === undefined) return;
  poserLaConfiance(confiance, projet, { exclues: stations.map(({ id }) => id), demande, tenue });
}

// Le temps de l'ajout du projet affiché à son premier ticket servi (ticket 1401) : il court tant qu'aucun n'est servi,
// se repose de lui-même, et se fige à la lecture qui dit le premier servi.
/** @param {Projet | undefined} projet */
function poserLeDelai(projet) {
  const vu = projet === undefined ? undefined : projetsVus?.projets.find(({ nom }) => nom === projet.nom);
  const pose = poserDelai(document, { delai: vu?.delai, maintenant: Date.now() });
  delaiDuProjet.hidden = pose === null;
  delaiDuProjet.replaceChildren(...(pose === null ? [] : [pose]));
  poserLOffreDuTelephone(projet);
}

// L'offre du téléphone, sur la page du premier projet servi seulement — ni sur le téléphone, ni rangée, ni quand un
// téléphone est déjà connecté : la trace n'est lue qu'une fois le reste tenu.
/** @param {Projet | undefined} projet */
function poserLOffreDuTelephone(projet) {
  const montree = projet !== undefined && telephoneVu === undefined && premierProjetServi(projetsVus?.projets ?? []) === projet.nom && offre.montrable();
  offreDuTelephone.hidden = !montree;
  offreDuTelephone.replaceChildren(...(montree ? [poserLOffre(document, offre.etat, offre)] : []));
}
setInterval(() => {
  if (courant !== undefined && !delaiDuProjet.hidden) poserLeDelai(courant);
}, 30_000);

// Le bandeau de santé (ticket 2490, 2921), une section de Settings depuis le ticket 3014 (Rail n'a plus que la bande des
// chiffres, ticket 3013) : les plafonds de durée et le closer. Les plafonds du dépôt se lisent sur GitHub par le process
// principal (plafonds-duree.ts) — à l'ouverture de Settings, puis au plus une fois la minute tant qu'il reste ouvert, et
// après chaque changement. Un champ en cours de frappe n'est pas reposé.
/** @type {Map<string, import("../plafonds-duree.ts").LectureDesPlafonds>} */
const plafondsLus = new Map();
/** @type {Map<string, number>} */
const plafondsLusLe = new Map();
const plafondsEnLecture = new Set();
/** @type {Map<string, Map<string, import("./projet/bandeau-sante/PlafondsDuree.js").Etat>>} */
const etatsDesPlafonds = new Map();
/** @type {Set<string>} */
const autresPlafondsOuverts = new Set();
// Le closer du bandeau de santé (ticket 2491), plus bas : sa lecture, ses états.
/** @type {Map<string, import("../closer-sante.ts").LectureDuCloser>} */
const closerDeSanteLu = new Map();
/** @type {Map<string, number>} */
const closerDeSanteLuLe = new Map();
const closerEnLecture = new Set();
/** @type {Map<string, Map<string, import("./projet/bandeau-sante/PlafondsDuree.js").Etat>>} */
const etatsDuCloser = new Map();
/** @type {Map<string, import("./projet/bandeau-sante/Closer.js").EtatDesVerifications>} */
const verificationsDuCloser = new Map();
/** @type {Set<string>} */
const candidatsOuverts = new Set();
// Les chiffres d'autonomie de chaque projet (autonomie/chiffres.js, ticket 3222), dans sa section, lus de GitHub.
/** @type {Map<string, ReturnType<typeof tenirLesChiffresDAutonomie>>} */
const autonomieDesProjets = new Map();
/** @param {Projet} projet */
function autonomieDuProjet(projet) {
  const tenue = autonomieDesProjets.get(projet.nom) ?? tenirLesChiffresDAutonomie(document, { lire: (jours) => brigade.lireAutonomie([projet.nom], jours), ouvrir: ouvrirTicketDAutonomie });
  autonomieDesProjets.set(projet.nom, tenue);
  return tenue;
}
// `garder` : une relecture ne repose pas un champ où le chef est en train d'écrire ; ce que ses gestes rendent, si.
/** @param {Projet} projet @param {boolean} [garder] */
function poserLeBandeauDeSante(projet, garder = true) {
  const tape = /** @type {HTMLElement | null} */ (document.activeElement);
  if (garder && (tape?.tagName === "INPUT" || tape?.tagName === "SELECT") && tape.closest?.('[data-bloc="plafonds-duree"], [data-bloc="closer"]') && bandeauSante.contains(tape)) return;
  const vu = projetsVus?.projets.find(({ nom }) => nom === projet.nom);
  const etats = etatsDesPlafonds.get(projet.nom) ?? new Map();
  etatsDesPlafonds.set(projet.nom, etats);
  const lecture = plafondsLus.get(projet.nom);
  // Sous le titre de sa section de Settings, ce qui se règle ou s'ouvre : les plafonds de durée, le closer, et les lignes
  // de tous les projets. Les chiffres de la cuisine sont dans la bande du rail (ticket 3013).
  bandeauSante.replaceChildren(
    poserBlocPlafondsDuree(document, {
      ...(lecture === undefined ? {} : { lecture }),
      ...(vu?.temps === undefined ? {} : { lostTimeMaxMin: vu.temps.lostTimeMaxMin }),
      etats,
      autresOuverts: autresPlafondsOuverts.has(projet.nom),
      basculerAutres: (ouvert) => void (ouvert ? autresPlafondsOuverts.add(projet.nom) : autresPlafondsOuverts.delete(projet.nom)),
      choisir: (cle, choisi) => void etats.set(cle, { ...etats.get(cle), choisi }),
      changer: (cle, saisie) => void changerUnPlafond(projet, cle, saisie),
      ouvrir: (url) => void brigade.ouvrirLaProposition(url),
    }),
    poserLeCloserDeSante(projet),
    autonomieDuProjet(projet).poser(),
    deTousLesProjets,
  );
  if (Date.now() - (plafondsLusLe.get(projet.nom) ?? 0) > 60_000) void lireLesPlafondsDuree(projet);
  if (Date.now() - (closerDeSanteLuLe.get(projet.nom) ?? 0) > 60_000) void lireLeCloserDeSante(projet);
}
/** @param {Projet} projet @param {boolean} [garder] */
function reposerLaSante(projet, garder = false) {
  if (courant?.nom === projet.nom && reglagesMontres()) poserLeBandeauDeSante(projet, garder);
}
/** @param {Projet} projet */
async function lireLesPlafondsDuree(projet) {
  if (plafondsEnLecture.has(projet.nom)) return;
  plafondsEnLecture.add(projet.nom);
  plafondsLusLe.set(projet.nom, Date.now());
  /** @type {import("../plafonds-duree.ts").LectureDesPlafonds} */
  let lue;
  try {
    lue = (await brigade.plafondsDuree?.(projet.nom)) ?? { sans: NON_ATTEINT("duration caps"), detail: SANS_PONT };
  } catch (erreur) {
    lue = { sans: NON_ATTEINT("duration caps"), detail: erreur instanceof Error ? erreur.message : String(erreur) };
  } finally {
    plafondsEnLecture.delete(projet.nom);
  }
  plafondsLus.set(projet.nom, lue);
  reposerLaSante(projet, true);
}
// Un champ changé : le process principal propose le plafond par une pull request sur le dépôt (ticket 2920). Tant qu'il
// n'a pas répondu, la rangée dit qu'il s'y met ; ouverte, la PR se dit sous le champ, qui revient à la valeur en vigueur
// — elle ne change qu'une fois la PR mergée ; déjà là, la rangée le dit ; refusé, le refus se dit sous le champ, son
// détail au survol, et ce qui a été tapé reste.
/** @param {Projet} projet @param {string} cle @param {string} saisie */
async function changerUnPlafond(projet, cle, saisie) {
  const etats = etatsDesPlafonds.get(projet.nom) ?? new Map();
  etatsDesPlafonds.set(projet.nom, etats);
  if (etats.get(cle)?.enCours === true) return;
  etats.set(cle, { ...etats.get(cle), enCours: true, dit: undefined });
  reposerLaSante(projet);
  /** @type {import("../plafonds-duree.ts").RenduDuPlafond} */
  let rendu;
  try {
    rendu = (await brigade.changerPlafondDuree?.(projet.nom, cle, saisie)) ?? { refus: "nothing was changed: nothing was sent", detail: SANS_PONT };
  } catch (erreur) {
    rendu = { refus: "nothing was changed: nothing was sent", detail: erreur instanceof Error ? erreur.message : String(erreur) };
  }
  if ("pr" in rendu) etats.set(cle, { dit: { pr: rendu.pr, numero: rendu.numero, valeur: rendu.valeur } });
  else if ("fait" in rendu) etats.set(cle, { dit: { fait: rendu.fait } });
  else etats.set(cle, { ...etats.get(cle), enCours: false, dit: rendu });
  reposerLaSante(projet);
}

// Le closer du bandeau de santé (ticket 2491) : ses passes, ce qu'il vérifie en premier et en plus, ses réglages — lus sur GitHub
// par le process principal (closer-sante.ts), à l'ouverture de Settings puis au plus une fois la minute, comme les
// plafonds. Un réglage changé se propose par une pull request (ticket 2920), qui se dit sous sa rangée — la valeur en
// vigueur ne change qu'au merge ; une vérification ajoutée ou retirée s'écrit dans le dépôt, et la liste écrite est reprise.
/** @param {Projet} projet */
function poserLeCloserDeSante(projet) {
  const etats = etatsDuCloser.get(projet.nom) ?? new Map();
  etatsDuCloser.set(projet.nom, etats);
  const verifications = verificationsDuCloser.get(projet.nom) ?? {};
  verificationsDuCloser.set(projet.nom, verifications);
  const lecture = closerDeSanteLu.get(projet.nom);
  return poserBlocCloser(document, {
    ...(lecture === undefined ? {} : { lecture }),
    etats,
    verifications,
    valeurs: CALIBRAGE_DU_PROJET,
    candidatsOuverts: candidatsOuverts.has(projet.nom),
    basculerCandidats: (ouvert) => void (ouvert ? candidatsOuverts.add(projet.nom) : candidatsOuverts.delete(projet.nom)),
    ouvrir: (url) => void brigade.ouvrirBilan(projet.nom, url),
    ouvrirLaPr: (url) => void brigade.ouvrirLaProposition(url),
    choisir: (cle, choisi) => void etats.set(cle, { ...etats.get(cle), choisi }),
    changer: (cle, saisie) => void changerUnReglageDuCloser(projet, cle, saisie),
    taper: (saisie) => void (verifications.saisie = saisie),
    changerVerification: (geste, saisie) => void changerUneVerificationDuCloser(projet, geste, saisie),
  });
}
/** @param {Projet} projet */
async function lireLeCloserDeSante(projet) {
  if (closerEnLecture.has(projet.nom)) return;
  closerEnLecture.add(projet.nom);
  closerDeSanteLuLe.set(projet.nom, Date.now());
  /** @type {import("../closer-sante.ts").LectureDuCloser} */
  let lue;
  try {
    const sans = { sans: NON_ATTEINT("the closer"), detail: SANS_PONT };
    lue = (await brigade.closerDeSante?.(projet.nom)) ?? { reglages: sans, verifications: sans, passes: sans };
  } catch (erreur) {
    const sans = { sans: NON_ATTEINT("the closer"), detail: erreur instanceof Error ? erreur.message : String(erreur) };
    lue = { reglages: sans, verifications: sans, passes: sans };
  } finally {
    closerEnLecture.delete(projet.nom);
  }
  closerDeSanteLu.set(projet.nom, lue);
  reposerLaSante(projet, true);
}
/** @param {Projet} projet @param {string} cle @param {string | { model: string, effort: string }} saisie */
async function changerUnReglageDuCloser(projet, cle, saisie) {
  const etats = etatsDuCloser.get(projet.nom) ?? new Map();
  etatsDuCloser.set(projet.nom, etats);
  if (etats.get(cle)?.enCours === true) return;
  etats.set(cle, { ...etats.get(cle), enCours: true, dit: undefined });
  reposerLaSante(projet);
  /** @type {import("../closer-sante.ts").RenduDuReglage} */
  let rendu;
  try {
    rendu = (await brigade.changerReglageDuCloser?.(projet.nom, cle, saisie)) ?? { refus: "nothing was changed: nothing was sent", detail: SANS_PONT };
  } catch (erreur) {
    rendu = { refus: "nothing was changed: nothing was sent", detail: erreur instanceof Error ? erreur.message : String(erreur) };
  }
  // Comme un plafond : la PR ouverte se dit, la valeur en vigueur reste jusqu'au merge.
  if ("pr" in rendu) etats.set(cle, { dit: { pr: rendu.pr, numero: rendu.numero, valeur: rendu.valeur } });
  else if ("fait" in rendu) etats.set(cle, { dit: { fait: rendu.fait } });
  else etats.set(cle, { ...etats.get(cle), enCours: false, dit: rendu });
  reposerLaSante(projet);
}
/** @param {Projet} projet @param {"ajouter" | "retirer"} geste @param {string} saisie */
async function changerUneVerificationDuCloser(projet, geste, saisie) {
  const etat = verificationsDuCloser.get(projet.nom) ?? {};
  if (etat.enCours !== undefined) return;
  verificationsDuCloser.set(projet.nom, { ...etat, enCours: geste === "ajouter" ? "ajouter" : `retirer:${saisie}`, dit: undefined });
  reposerLaSante(projet);
  /** @type {import("../closer-sante.ts").RenduDesVerifications} */
  let rendu;
  try {
    rendu = (await brigade.changerVerificationDuCloser?.(projet.nom, geste, saisie)) ?? { refus: "nothing was changed: nothing was sent", detail: SANS_PONT };
  } catch (erreur) {
    rendu = { refus: "nothing was changed: nothing was sent", detail: erreur instanceof Error ? erreur.message : String(erreur) };
  }
  // Proposée par une PR (ticket 2920) : la liste en vigueur ne change qu'au merge, la PR se dit sous le champ. Ajoutée, le
  // champ se vide ; retirée, ce qui y était tapé reste.
  const garde = geste === "ajouter" ? {} : { saisie: etat.saisie };
  if ("pr" in rendu) verificationsDuCloser.set(projet.nom, { ...garde, dit: { pr: rendu.pr, numero: rendu.numero, geste: rendu.geste, verification: rendu.verification } });
  else if ("fait" in rendu) verificationsDuCloser.set(projet.nom, { ...garde, dit: { fait: rendu.fait } });
  else verificationsDuCloser.set(projet.nom, { ...etat, enCours: undefined, dit: rendu });
  if (!("refus" in rendu)) {
    const lue = closerDeSanteLu.get(projet.nom);
    if (lue !== undefined) closerDeSanteLu.set(projet.nom, { ...lue, verifications: { liste: rendu.liste } });
  }
  reposerLaSante(projet);
}

// Les blocages du projet affiché (ticket 1399). Les gestes que l'app sait faire pour en lever un, par l'identifiant
// d'action que la station publie : « choose-station » ouvre le choix de la machine, comme le parcours (ticket 1113) —
// quand le déménagement est offert, qu'une autre station peut le reprendre ; sinon, la ligne dit pourquoi il n'y a pas
// de bouton. Posés après le déménagement, qui le décide. Un lien ne s'ouvre que par le process principal, qui ne
// connaît que les pages que les stations publient.
/** @param {Projet | undefined} projet */
function poserLesBlocages(projet) {
  const deplacable = projet !== undefined && (!ouvrirLeDemenagement.hidden || demenagement?.projet === projet.nom);
  const vu = projet === undefined ? undefined : projetsVus?.projets.find(({ nom }) => nom === projet.nom);
  // Un besoin qui a sa carte n'a pas, en plus, sa ligne (ticket 1400).
  const blocages = sansLesChoix(vu?.blocages ?? [], vu?.choix ?? [], vu?.choisis, choixRetenus.get(vu?.nom ?? "")?.retenus);
  const nom = projet?.nom ?? "";
  const deplies = blocagesDeplies.get(nom) ?? new Set();
  for (const id of deplies) if (!blocages.some((blocage) => blocage.id === id)) deplies.delete(id);
  const pose = poserBlocages(document, {
    projet: nom,
    blocages,
    gestes: { "choose-station": deplacable ? { libelle: "choose another station", faire: ouvrirLeChoixDeMachine } : { sans: "no other station can take it right now" } },
    ouvrir: (url) => void brigade.autoriserSurGitHub(url),
    deplies,
    deplier: (id, ouvert) => {
      if (ouvert) deplies.add(id);
      else deplies.delete(id);
      blocagesDeplies.set(nom, deplies);
    },
  });
  blocagesDuProjet.hidden = pose === null;
  blocagesDuProjet.replaceChildren(...(pose === null ? [] : [pose]));
}

// Les choix que le projet affiché attend (ticket 1400) : une carte par besoin. Un clic écrit l'issue
// dans sa demande (projets/projets.ts, `choisir`) ; écrite, la carte part, sans attendre que la station la relise.
// Ce que la vue retient s'oublie dès que la station ne publie plus le choix en attente.
/** @param {Projet | undefined} projet */
function poserLesChoix(projet) {
  const vu = projet === undefined ? undefined : projetsVus?.projets.find(({ nom }) => nom === projet.nom);
  const choix = vu?.choix ?? [];
  const nom = projet?.nom ?? "";
  const tenus = choixRetenus.get(nom) ?? { enCours: new Set(), retenus: new Set(), refus: new Map() };
  for (const id of tenus.retenus) if (!choix.some((un) => un.id === id && un.status === "pending")) tenus.retenus.delete(id);
  for (const id of tenus.refus.keys()) if (!choix.some((un) => un.id === id)) tenus.refus.delete(id);
  choixRetenus.set(nom, tenus);
  const pose = poserChoix(document, { projet: nom, choix, choisis: vu?.choisis, retenus: tenus.retenus, enCours: tenus.enCours, refus: tenus.refus, choisir: (id, issue) => void (issue === "cook-elsewhere" ? ouvrirLaStationQuiLA(nom, id, choix) : choisirUneIssue(nom, id, issue)) });
  choixDuProjet.hidden = pose === null;
  choixDuProjet.replaceChildren(...(pose === null ? [] : [pose]));
}

// « Cook it on a station that has it » (ticket 1511) n'écrit rien : il ouvre, sur Stations, les réglages d'une station de ce
// poste avec la capacité qui manque offerte. Le chef l'enregistre, ou non ; la station relit ses capacités.
// Aucune station lue, une ligne sous la carte le dit.
/** @param {string} nom @param {string} id @param {readonly import("../projets/demande.ts").Choix[]} choix */
function ouvrirLaStationQuiLA(nom, id, choix) {
  const projet = courant?.nom === nom ? courant : undefined;
  const lues = declarees.get(nom);
  const station = projet === undefined || lues === undefined ? undefined : stationAOuvrir(lues, { ici: projet.ici === true });
  const tenus = choixRetenus.get(nom);
  if (projet === undefined || station === undefined) {
    tenus?.refus.set(id, { refus: `${PAS_ENCORE("station of the project read")} The next check of the installation reads them.` });
    return poserStationsDuProjet();
  }
  tenus?.refus.delete(id);
  const besoin = choix.find((un) => un.id === id)?.need;
  choisirOnglet(STATIONS);
  void offrirLaCapacite(projet, station.nom, besoin === undefined ? undefined : capaciteDuBesoin(besoin));
}

/** @param {string} nom @param {string} id @param {string} issue */
async function choisirUneIssue(nom, id, issue) {
  const tenus = choixRetenus.get(nom) ?? { enCours: new Set(), retenus: new Set(), refus: new Map() };
  choixRetenus.set(nom, tenus);
  if (tenus.enCours.has(id)) return;
  tenus.enCours.add(id);
  tenus.refus.delete(id);
  poserStationsDuProjet();
  /** @type {{ fait: string } | { refus: string, detail?: string }} */
  let rendu;
  try {
    rendu = await brigade.choisirUneIssue(nom, id, issue);
  } catch (erreur) {
    rendu = { refus: "the choice could not be recorded", detail: erreur instanceof Error ? erreur.message : String(erreur) };
  }
  tenus.enCours.delete(id);
  if (rendu !== undefined && "fait" in rendu) tenus.retenus.add(id);
  else tenus.refus.set(id, rendu ?? { refus: "the choice could not be recorded" });
  poserStationsDuProjet();
}

// Le parcours du projet affiché, sous la ligne de ses stations (ticket 1111) : ses quatre étapes tant
// qu'il se prépare ; prêt, la phrase qui invite à poser le premier ticket, jusqu'à ce que le chef
// l'écarte ou quitte la page. Chaque page qu'il ouvre est une de celles que la station a publiées.
/** @param {string} nom @param {import("../projets/demande.ts").Onboarding | null} onboarding */
function poserLeParcours(nom, onboarding) {
  if (onboarding?.decisionAttendue !== true) decisionsPrises.delete(nom);
  else if (decisionsPrises.has(nom)) onboarding = apresLaDecision(onboarding);
  const range = onboarding !== null && onboarding.termine && parcoursRanges.has(nom);
  const pose = range
    ? null
    : parcoursDOnboarding(document, {
        projet: nom,
        onboarding,
        maintenant: Date.now(),
        ouvrir: (url) => void brigade.autoriserSurGitHub(url),
        continuerSansBac: () => void continuerSansBac(nom),
        autreStation: ouvrirLeChoixDeMachine,
        ecarter: () => {
          parcoursRanges.add(nom);
          pretMontre = undefined;
          poserStationsDuProjet();
        },
      });
  if (pose !== null && onboarding?.termine === true) pretMontre = nom;
  parcoursDuProjet.hidden = pose === null;
  parcoursDuProjet.replaceChildren(...(pose === null ? [] : [pose]));
}

// Le choix ouvert, posé de nouveau à chaque relecture des stations et des projets : ce que le chef a
// coché ou changé reste, ce qu'il n'a pas touché suit ce qui est proposé. Un projet dont une station a déjà
// la cuisine ne prend que des stations de plus ; une station de plus reprend ce que l'app a déjà demandé, ni
// cooks ni calibrage à redire.
/**
 * @param {NonNullable<typeof confiance>} vise @param {Projet} projet
 * @param {{ exclues: readonly string[], demande: boolean, tenue: boolean }} deja
 */
function poserLaConfiance(vise, projet, { exclues, demande, tenue }) {
  const locale = projetsVus?.locale ?? null;
  const appairees = cetOrdinateurDAbord(
    (stationsVues?.stations ?? []).filter(({ id, cuisine }) => cuisine !== false && !exclues.includes(id)),
    locale,
  );
  const machines = projetsVus?.machines ?? {};
  const recommandee = projetsVus?.recommandee ?? undefined;
  const premiere = !tenue;
  // Une machine à la fois, proposée d'office tant que le chef n'a rien touché : une station qui peut cuire maintenant —
  // la recommandée, sinon cet ordinateur, sinon la première en ligne (choix-station/). Aucune en ligne : aucune.
  if (!vise.touchee || !appairees.some(({ id }) => vise.choisies.has(id))) {
    const proposee = proposeeDOffice(appairees, { recommandee: premiere ? recommandee : null, locale });
    vise.choisies = new Set(proposee === undefined ? [] : [proposee]);
  }
  const nomDe = (/** @type {string} */ id) => {
    const station = appairees.find((une) => une.id === id);
    return station === undefined ? "" : nomDite(station, locale);
  };

  titreDeConfiance.textContent = premiere ? `Choose the machine that cooks ${projet.nom}.` : `Add a station to ${projet.nom}'s kitchen.`;
  sensDeConfiance.textContent = premiere
    ? "Every station cooks, takes, reviews and merges. Everything below is set to what is recommended: change what you like, or start as it is."
    : "Every station cooks, takes, reviews and merges.";
  // Un projet ajouté depuis l'app connaît son dépôt et sa branche ; un projet écrit à la main les choisit ici.
  const connu = projet.depot !== undefined && projet.base !== undefined;
  // Une station de plus ne les demande jamais (ticket 1307) : la première les sert, ou le clone du projet les dit.
  champDuDepot.hidden = !premiere || connu;
  champDeLaBase.hidden = !premiere || connu;

  legendeDesStationsChoisies.textContent = "Machine";
  sensDesStationsChoisies.textContent = "";
  sensDesStationsChoisies.hidden = true;
  choixDesStationsChoisies.replaceChildren(
    ...(appairees.length === 0
      ? [bloc("p", premiere ? "no station to cook it: pair one first, with “+ station” under All stations, on the home" : "no other paired machine: pair one from the home, with “+ station”")]
      : appairees.map((station) => {
          const propose = machines[station.id];
          return uneMachine(
            document,
            {
              station,
              nom: premiere ? "station-choisie" : "station-ajoutee",
              ici: station.id === locale,
              choisie: vise.choisies.has(station.id),
              recommandee: premiere && station.id === recommandee && station.etat === "en-ligne",
              implique: propose?.implique ?? "",
              ordinateur: propose?.toujoursAllumee === false,
              aria: premiere ? `${station.nom} cooks it` : `${station.nom} is the station to add`,
            },
            () => {
              vise.touchee = true;
              vise.choisies = new Set([station.id]);
              poserStationsDuProjet();
            },
          );
        })),
  );
  stationsChoisiesDeConfiance.hidden = false;

  // Les cooks à la fois : ceux de la machine choisie, tirés de ses cœurs à elle — ceux de cet ordinateur tels que le
  // runtime les calcule, sinon ses cœurs publiés. Une station de plus dit aussi son dossier et ses capacités.
  const decide = premiere && !demande;
  const choisie = [...vise.choisies][0];
  const sansMachine = choisie === undefined;
  const ici = choisie !== undefined && choisie === locale;
  const defauts = vise.defauts !== undefined && "cooks" in vise.defauts ? vise.defauts : undefined;
  champDesCooks.hidden = premiere ? !decide || sansMachine : sansMachine;
  const proposee = ici && defauts !== undefined ? defauts : machines[choisie ?? ""];
  if (!vise.cooksTouches) cooksDeConfiance.value = proposee === undefined ? "" : String(proposee.cooks);
  cooksDits.textContent = vise.cooksTouches || proposee === undefined ? "" : `recommended — ${proposee.cooksDit}`;
  champDuDossier.hidden = premiere || sansMachine;
  capacitesDeConfiance.hidden = premiere || sansMachine;
  if (!premiere && choisie !== undefined) poserLaMachineAjoutee(vise, choisie, nomDe(choisie), ici, defauts);

  const nom = choisie === undefined ? "" : nomDe(choisie);
  validerConfiance.textContent = premiere ? (nom === "" ? "Start the kitchen" : `Start the kitchen on ${nom}`) : AJOUTER_UN_PROJET;
  gestesDeConfiance.hidden = appairees.length === 0;
}

// Ce qui est à la machine d'une station de plus (ticket 1307) : le dossier des espaces de travail de ses cooks, et ses
// capacités, une case chacune. Cet ordinateur les dit tels que le runtime les y lit, les cases détectées cochées ;
// une autre machine ne se sonde pas d'ici : son dossier est le sien, et ses cases partent vides. Ce que le chef a
// coché ou décoché reste, par machine, d'une relecture à l'autre.
/**
 * @param {NonNullable<typeof confiance>} vise @param {string} id @param {string} nom @param {boolean} ici
 * @param {Extract<import("../projets/projets.ts").DefautsDeLaMachine, { cooks: number }> | undefined} defauts
 */
function poserLaMachineAjoutee(vise, id, nom, ici, defauts) {
  dossierDeConfiance.value = ici ? (defauts?.espaceDeTravail ?? "") : "";
  dossierDeConfiance.placeholder = ici ? "" : `chosen on ${nom}`;
  dossierDit.textContent = ici ? `where ${CET_ORDINATEUR}'s station puts its cooks' workspaces` : `${nom}'s station chooses it on that machine`;
  legendeDesCapacites.textContent = `What ${ici ? CET_ORDINATEUR : nom} can do`;
  const catalogue = defauts?.capacites ?? [];
  let cochees = vise.capacites.get(id);
  if (cochees === undefined) {
    cochees = new Set(ici ? catalogue.filter(({ detectee }) => detectee).map(({ capacite }) => capacite) : []);
    vise.capacites.set(id, cochees);
  }
  const tenues = cochees;
  const refus = vise.defauts !== undefined && "refus" in vise.defauts ? vise.defauts : { refus: `${CET_ORDINATEUR} could not be read`, detail: "" };
  choixDesCapacites.replaceChildren(
    ...(catalogue.length === 0
      ? [ligneErreur(document, refus.refus, refus.detail ?? "")]
      : catalogue.map(({ capacite, nom: dite, detectee }) =>
          caseACocher(document, { nom: dite, dit: !ici ? `not detectable from ${CET_ORDINATEUR}` : detectee ? "detected" : `not found on ${CET_ORDINATEUR}`, cochee: tenues.has(capacite) }, (cochee) => {
            if (cochee) tenues.add(capacite);
            else tenues.delete(capacite);
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
  const projet = courant;
  if (projet === undefined || ouvrirLaConfiance.disabled) return;
  /** @type {NonNullable<typeof confiance>} */
  const vise = { projet: projet.nom, ouvertLe: new Date().toISOString(), depots: [], choisies: new Set(), touchee: false, cooksTouches: false, capacites: new Map() };
  if (cuisineDe(projet).tenue) {
    ouvrirLaConfiance.disabled = true;
    vise.defauts = await defautsDeCetOrdinateur(projet.nom);
    ouvrirLaConfiance.disabled = false;
    if (courant?.nom !== projet.nom) return;
  }
  confiance = vise;
  formulaireDeConfiance.hidden = false;
  confianceDitePour = { projet: "", dit: "", a: 0 };
  confianceRefusee.replaceChildren();
  baseDeConfiance.value = projet.base ?? "";
  poserStationsDuProjet();
  if ((projet.depot !== undefined && projet.base !== undefined) || vise.defauts !== undefined) return;
  await lireLesDepots(vise, projet);
}
/** @param {string} nom @returns {Promise<import("../projets/projets.ts").DefautsDeLaMachine>} */
async function defautsDeCetOrdinateur(nom) {
  try {
    return (await brigade.defautsDeStation(nom)) ?? { refus: `${CET_ORDINATEUR} could not be read` };
  } catch (erreur) {
    return { refus: `${CET_ORDINATEUR} could not be read`, detail: erreur instanceof Error ? erreur.message : String(erreur) };
  }
}
// Le dépôt à choisir : ceux du chef, lus sur GitHub, avec celui que le projet connaît déjà d'avance.
/** @param {NonNullable<typeof confiance>} vise @param {Projet} projet */
async function lireLesDepots(vise, projet) {
  depotDeConfiance.replaceChildren(new Option(LECTURE_DE("your repositories on GitHub"), ""));
  const lus = await brigade.depotsDuChef();
  if (confiance !== vise) return;
  if ("refus" in lus) {
    depotDeConfiance.replaceChildren(new Option("— repository —", ""), ...(projet.depot === undefined ? [] : [new Option(projet.depot, projet.depot)]));
    if (projet.depot !== undefined) depotDeConfiance.value = projet.depot;
    confianceRefusee.replaceChildren(ligneErreur(document, lus.refus, "", { classe: "" }));
    return;
  }
  vise.depots = lus.depots;
  proposer(depotDeConfiance, lus.depots.map(({ depot }) => depot), "— repository —");
  if (projet.depot !== undefined) {
    if (!lus.depots.some(({ depot }) => depot === projet.depot)) depotDeConfiance.append(new Option(projet.depot, projet.depot));
    depotDeConfiance.value = projet.depot;
  }
}
// Le dépôt choisi propose sa branche par défaut comme branche d'intégration.
depotDeConfiance.addEventListener("change", () => {
  const choisi = confiance?.depots.find(({ depot }) => depot === depotDeConfiance.value);
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
  poserStationsDuProjet();
});
function fermerConfiance() {
  confiance = undefined;
  formulaireDeConfiance.hidden = true;
}
// Lancer : la demande part au process principal, qui l'écrit dans le gist de chaque station choisie
// — ou chaque champ qui manque se lit sous le choix, et rien n'est écrit.
formulaireDeConfiance.addEventListener("submit", (evenement) => {
  evenement.preventDefault();
  void confier();
});
async function confier() {
  const projet = courant;
  const vise = confiance;
  if (projet === undefined || vise === undefined || vise.projet !== projet.nom) return;
  const choisies = [...vise.choisies];
  const lues = choisies.map((id) => (stationsVues?.stations ?? []).find((station) => station.id === id));
  const noms = choisies.map((id, rang) => lues[rang]?.nom ?? id);
  // Hors ligne, la station choisie prend le projet à son retour (ticket 3187) : la page le dit en clair.
  const absente = lues.find((station) => station?.etat === "hors-ligne");
  validerConfiance.disabled = true;
  confianceRefusee.replaceChildren(bloc("p", "writing the request on your stations' gists…"));
  try {
    const rendu = await brigade.confierAUneStation({
      nom: projet.nom,
      depot: !champDuDepot.hidden ? depotDeConfiance.value : (projet.depot ?? ""),
      base: !champDeLaBase.hidden ? baseDeConfiance.value : (projet.base ?? ""),
      stations: choisies,
      cooks: champDesCooks.hidden && cuisineDe(projet).tenue ? "" : cooksDeConfiance.value,
      ...(capacitesDeConfiance.hidden ? {} : { capacites: [...(vise.capacites.get(choisies[0] ?? "") ?? [])] }),
      // Le calibrage que l'app recommande (ticket 3187) : il se change dans les réglages du projet, pas ici.
      manager: projetsVus?.calibrage?.manager ?? { modele: "", effort: "" },
      reviewer: projetsVus?.calibrage?.reviewer ?? { modele: "", effort: "" },
      ouvertLe: vise.ouvertLe,
    });
    if ("signales" in rendu) confianceRefusee.replaceChildren(...Object.values(rendu.signales).map((raison) => ligneErreur(document, raison ?? "", "", { classe: "" })));
    else if ("refus" in rendu) confianceRefusee.replaceChildren(ligneErreur(document, rendu.refus, "", { classe: "" }));
    else {
      if (confiance === vise) fermerConfiance();
      confianceRefusee.replaceChildren();
      confianceDitePour = {
        projet: projet.nom,
        dit:
          absente !== undefined
            ? AU_RETOUR(absente.nom, rendu.ajoute)
            : `${rendu.ajoute} is asked of ${noms.join(", ")}: ${noms.length > 1 ? "each" : "it"} prepares it within a minute — if GitHub asks you to authorize brigade, its button appears on this line`,
        a: Date.now(),
      };
      if (courant?.nom === projet.nom) poserStationsDuProjet();
      // Les blocs de Cooks viennent des faits de la box : relus tout de suite, la station neuve y paraît sans attendre.
      lireLesFaits();
    }
  } catch (erreur) {
    confianceRefusee.replaceChildren(ligneErreur(document, "nothing was sent", erreur instanceof Error ? erreur.message : String(erreur), { classe: "" }));
  }
  validerConfiance.disabled = false;
}

// Ce que le bouton d'une panne a rendu, par `<gist> <clé>` : redit à chaque relecture, tant que la
// panne est sur la ligne de sa station.
/** @type {Map<string, string>} */
const pannesDites = new Map();

// Une panne, sous la ligne de sa station : ce qui ne va pas, en une ligne, et son bouton — relire,
// écarter, se connecter (pannes/pannes.ts). Jamais une commande à taper.
/** @param {import("../stations/stations.ts").StationVue} station @param {import("../pannes/pannes.ts").Panne} panne */
function poserPanne({ id, nom, projets }, panne) {
  const pose = document.createElement("p");
  pose.className = "panne";
  pose.dataset.sujet = panne.sujet;
  const bouton = boutonDeLaFamille(document, panne.bouton.libelle, () => void jouerPanne(id, panne.cle, bouton));
  // L'explication, et ce que le bouton a rendu, ne se lisent qu'au survol.
  const dit = pannesDites.get(`${id} ${panne.cle}`);
  pose.append(bloc("span", panne.ligne), bouton, survol(document, dit === undefined ? panne.survol : `${panne.survol}. ${dit}`));
  // La station est en panne : « report to brigade » à la suite (ticket 1977), le journal lu dans un projet qu'elle sert.
  pose.append(...signalement.poser({ ...(projets[0] === undefined ? {} : { projet: projets[0] }), reference: { station: nom }, panne: `station ${nom}: ${panne.ligne}` }));
  return pose;
}
/** @param {string} id @param {string} cle @param {HTMLButtonElement} bouton */
async function jouerPanne(id, cle, bouton) {
  bouton.disabled = true;
  let dit;
  try {
    const rendu = await brigade.panne(id, cle);
    dit = "refus" in rendu ? rendu.refus : rendu.fait;
  } catch (erreur) {
    dit = `nothing was done: ${erreur instanceof Error ? erreur.message : String(erreur)}`;
  }
  pannesDites.set(`${id} ${cle}`, dit);
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
formulaireDAppairage.addEventListener("submit", (evenement) => {
  evenement.preventDefault();
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
  } catch (erreur) {
    appairageDit.textContent = "nothing was paired: the app could not ask GitHub";
    appairageDit.title = erreur instanceof Error ? erreur.message : String(erreur);
  }
  appairage.disabled = false;
}

// La mise à jour d'un clone n'est pas lancée : sa commande s'écrit dans un shell, dans
// l'espace d'un projet, que l'on montre — c'est sa note qui dit ce qui a été écrit, et que
// rien n'est parti. Sans projet qui s'ouvre, la raison se lit sous les clones.
/** @param {string} clone */
async function mettreAJour(clone) {
  nonMisAJour = "";
  try {
    const rendu = await brigade.ecrireMiseAJour(clone);
    if (rendu !== undefined && "refus" in rendu) nonMisAJour = rendu.refus;
    else if (rendu !== undefined) {
      garder(rendu.projet, rendu);
      const projet = projetDe(rendu.projet);
      if (projet !== undefined) return void ouvrir(projet);
    }
  } catch (erreur) {
    nonMisAJour = `nothing written: ${erreur instanceof Error ? erreur.message : String(erreur)}`;
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
/** @param {Projet} projet */
function poserAlertes(projet) {
  // La ligne dont le geste est celui de l'interrupteur de l'espace n'est pas posée : l'interrupteur la
  // dit, et c'est lui qui la lève — le projet éteint (tickets 906, 1406). Non vérifiée, elle se pose :
  // l'interrupteur ne sait pas, la ligne dit pourquoi.
  // La ligne du disjoncteur non plus quand TODO la porte, sur Rail : elle y a son bouton (ticket 2140).
  const alertes = !seLit(projet) ? [] : (bandes.get(projet.nom) ?? []).filter(({ appel }) => !(appel !== undefined && (("geste" in appel && appel.geste === "projet-allumer") || ("reprise" in appel && disjoncteursEnTodo.has(projet.nom)))));
  gesteDeLUrgence = undefined;
  const avis = avisDuDepot(projet, "page");
  // En lecture seule, sa ligne vient en tête du projet (ticket 3163) : elle dit pourquoi aucun geste n'est offert.
  const depot = lectureSeuleDe(projet);
  const seule = depot === undefined ? [] : [ligneLectureSeule(document, depot, (page) => void brigade.ouvrirLectureSeule?.(projet.nom, page))];
  bande.hidden = alertes.length === 0 && avis === undefined && seule.length === 0;
  bande.replaceChildren(...seule, ...(avis === undefined ? [] : [avis]), ...alertes.map((alerte) => poserAlerte(projet, alerte)));
}

// L'endroit d'une ligne de la bande : son sujet, et ce qu'elle dit — l'urgence par son seul sujet,
// sa phrase change à chaque lecture (« at a standstill for 5 h 00 »). Ce qui y est ouvert — sa
// confirmation, son détail — ne se referme pas sous les yeux du chef.
/** @param {Alerte} alerte */
const endroitDeLAlerte = ({ sujet, dit }) => (sujet === "urgence" ? "alerte:urgence" : `alerte:${sujet}:${dit}`);

// Une ligne de la bande (ticket 907) : une seule ligne — ce qui ne va pas — et un seul contrôle, le
// geste qui le lève. Son prix n'est pas posé à côté : le clic ouvre la confirmation, qui le dit. Ce
// que la ligne sait de plus — pourquoi, ce que la box en écrit mot pour mot, le verdict d'une
// vérification — est replié derrière « detail », dessous.
/** @param {Projet} projet @param {Alerte} alerte */
function poserAlerte(projet, alerte) {
  const { sujet, verifie, ton, dit, pourquoi, releve, verification } = alerte;
  const ligne = document.createElement("div");
  ligne.className = "alerte";
  ligne.dataset.sujet = sujet;
  ligne.dataset.ton = ton;
  if (!verifie) ligne.dataset.verifie = "non";
  if (sujet === "urgence" && urgenceChoisie === projet.nom) ligne.dataset.choisie = "oui";
  const endroit = endroitDeLAlerte(alerte);
  const tete = document.createElement("p");
  tete.className = "ligne";
  const marque = sujet === "urgence" ? bloc("span", "URGENT") : undefined;
  if (marque !== undefined) marque.className = "urgent";
  tete.append(pastille(dit, ton), ...(marque === undefined ? [] : [marque]), bloc("strong", dit));

  // Le détail : ce que la ligne sait de plus, à plat une fois déplié — le pourquoi, et le brut de la box,
  // entier. Pas le geste : le seul geste montré est le contrôle de la ligne, un bouton — jamais une
  // commande à recopier (règles de la langue visuelle, ticket 830).
  const cle = `${projet.nom}\u0000${endroit}`;
  const deplie = detailsDeplies.has(cle);
  /** @type {HTMLElement[]} */
  const detail = [
    ...(pourquoi === undefined || pourquoi.trim() === "" ? [] : [bloc("p", pourquoi)]),
    ...(releve === undefined || releve.trim() === "" ? [] : [exact("pre", releve)]),
    ...(verification === undefined ? [] : poserVerdict(projet, verification, (texte, geste) => bouton(texte, () => void geste()), verification.titre !== dit)),
  ];
  if (detail.length > 0) {
    const deplier = bouton("detail", () => {
      if (detailsDeplies.has(cle)) detailsDeplies.delete(cle);
      else detailsDeplies.add(cle);
      poserAlertes(projet);
    }, "discret");
    deplier.className = "detail";
    deplier.ariaExpanded = String(deplie);
    deplier.title = deplie ? "fold the detail" : "what the station says, as is — and why";
    tete.append(deplier);
  }
  const [controle, ...ouverte] = poserControle(projet, alerte, endroit);
  if (controle !== undefined) tete.append(controle);
  ligne.append(tete);
  // Ce que le chef peut y faire, en clair sous la ligne : pas replié derrière « detail ».
  if (alerte.consignes !== undefined && alerte.consignes.length > 0) {
    const consignes = document.createElement("ul");
    consignes.className = "consignes";
    consignes.append(...alerte.consignes.map((consigne) => bloc("li", consigne)));
    ligne.append(consignes);
  }
  if (deplie && detail.length > 0) {
    const deplies = document.createElement("div");
    deplies.className = "detail";
    deplies.append(...detail);
    ligne.append(deplies);
  }
  // Une confirmation ouverte passe dessous, sur toute la largeur.
  ligne.append(...ouverte);
  return ligne;
}

// Le contrôle d'une ligne de la bande, et sa confirmation quand elle est ouverte. Un geste du socle :
// direct, il part au clic ; confirmé, le clic ouvre sa confirmation, qui dit son prix (confirmation.ts).
// Une demande au second dont le geste coûte : le clic ouvre une confirmation qui dit ce que coûtera le
// lever — un « oui » écrit la demande dans le second, sans l'envoyer. Sans prix, elle s'écrit au clic.
// Un onglet : il s'ouvre. Sans appel, la ligne n'a pas de contrôle : rien à faire depuis l'app.
/** @param {Projet} projet @param {Alerte} alerte @param {string} endroit @returns {HTMLElement[]} */
function poserControle(projet, alerte, endroit) {
  const { sujet, geste: leve, bouton: libelle, appel, prix } = alerte;
  if (appel === undefined) return [];
  // En lecture seule (ticket 3163), ni geste du socle ni reprise du disjoncteur : rien qui change le projet.
  if (lectureSeuleDe(projet) !== undefined && ("geste" in appel || "reprise" in appel)) return [];
  const mot = libelle ?? leve;
  /** @type {HTMLElement[]} */
  let pose;
  // L'endroit d'un geste du socle est la ligne par son sujet : la confirmation d'un même geste s'ouvre sous la ligne cliquée.
  if ("geste" in appel) pose = poserGeste(projet, { id: appel.geste, libelle: mot, ou: `alerte:${sujet}` });
  else if ("demande" in appel) {
    // Un prix « none… » est un prix nul : pas de confirmation, la demande s'écrit au clic.
    const cout = /^none\b/i.test(prix.trim()) ? "" : prixDit(prix);
    const cle = JSON.stringify(["demande", "", endroit]);
    const ouverte = aConfirmer?.projet === projet.nom && aConfirmer.cle === cle ? aConfirmer : undefined;
    const demande = bouton(cout === "" ? mot : `${mot}…`, () => {
      if (cout === "") return void demanderAlerte(alerte);
      nonEcrit = nonEcritSecond = "";
      gesteRate = undefined;
      aConfirmer = ouverte === undefined ? { projet: projet.nom, cle, rendu: confirmationDeDemande(cout) } : undefined;
      montrer();
    });
    demande.dataset.geste = "demande";
    demande.ariaExpanded = cout === "" ? null : String(ouverte !== undefined);
    demande.title = cout === "" ? "writes into the second a request about this line — nothing is sent: you press Enter" : "says first what lifting it costs — then writes the request into the second, without sending it";
    pose = ouverte === undefined ? [demande] : [demande, poserConfirmation(projet, ouverte, () => void demanderAlerte(alerte))];
  } else if ("relire" in appel) {
    // Réessayer maintenant : la box est relue tout de suite, au lieu d'attendre le tour des trente secondes.
    pose = [bouton(mot, () => lireLesFaits())];
  } else if ("reprise" in appel) {
    // Le disjoncteur, hors de Rail : le même « Resume » que sa ligne de TODO, dans le même état (todo-breaker-line.js).
    pose = poserReprise(document, reprises.get(projet.nom) ?? REPRISE_AU_REPOS, () => void reprendreLeDisjoncteur(projet));
  } else {
    const { onglet } = appel;
    pose = [bouton(mot, () => (laisse.get(projet.nom) === onglet ? undefined : activer(onglet)))];
  }
  const [premier] = pose;
  if (sujet === "urgence" && premier !== undefined) gesteDeLUrgence = premier;
  return pose;
}

// La confirmation d'une demande au second : ce que coûtera le lever, en une ligne — le prix que la
// ligne de la bande en dit —, et ce que fait le « oui » : il écrit la demande, rien ne part.
/** @param {string} prix @returns {Confirmation} */
const confirmationDeDemande = (prix) => ({
  titre: "ask the second to lift it",
  prix: [prix, "the second reads, explains, and acts only with you"],
  choix: [{ id: "demande", libelle: OUI("write the request"), dit: "written into the second, not sent: your Enter sends it" }],
  renoncer: "no, write nothing",
});

// La bannière d'arrêt : la cuisine est à l'arrêt quand la box le dit, d'un mot.
// Son geste la reprend : confirmé, il dit d'abord ce qu'il relance.
/** @param {Projet} projet */
function poserArret(projet) {
  const tenu = tenus.get(projet.nom);
  const banniere = BANNIERE;
  arret.hidden = banniere === undefined || tenu === undefined || !("tableau" in tenu) || !tenu.tableau.arretee;
  if (arret.hidden || banniere === undefined) return arret.replaceChildren();
  const [titre, ...suite] = banniere.texte;
  const relance = GESTES_DE_LA_CUISINE.find(({ id }) => id === banniere.bouton);
  const geste = document.createElement("div");
  geste.className = "gestes";
  if (relance !== undefined && lectureSeuleDe(projet) === undefined) geste.append(...poserGeste(projet, { ...relance, ou: "arret" }));
  arret.replaceChildren(bloc("strong", titre), ...suite.map((ligne) => bloc("p", ligne)), geste);
}

// Tout ce qui se dessine du projet affiché, d'après ses derniers faits. Le rail en est : il est
// au centre de l'espace, quel que soit l'onglet affiché.
function dessiner() {
  bande.hidden = true;
  arret.hidden = true;
  rail.hidden = true;
  poserInterrupteur();
  poserStationsDuProjet();
  // Settings d'un projet en lecture seule (ticket 3163) : rien de ce qui se propose à son dépôt n'y est posé (vue.css).
  if (courant !== undefined && lectureSeuleDe(courant) !== undefined) etat.dataset.lectureSeule = "";
  else delete etat.dataset.lectureSeule;
  if (courant === undefined) return;
  poserAlertes(courant);
  poserArret(courant);
  poserRail(courant);
}

// Rien ne reste de ce qui était affiché — ni d'un autre projet, ni de celui-ci :
// jusqu'à la première lecture, il n'y a rien à lire.
/** @param {Projet} projet @param {HTMLElement} tete @param {HTMLElement} corps */
function attendre(projet, tete, corps) {
  if (projet.sansStation === true) {
    // Station arrêtée : rien n'est lu. La ligne est celle du rail (poserRail), qui cède la place au
    // rail, à la file et aux cartes dès que la station tourne (la configuration est reposée).
    tete.dataset.etat = "sans-station";
    tete.textContent = "";
    corps.replaceChildren();
  } else if (!seLit(projet)) {
    tete.dataset.etat = "sans-station";
    tete.textContent = "no read";
    corps.replaceChildren(
      ligneErreur(
        document,
        `“${projet.nom}” does not say where its station is: nothing is read`,
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
const CLE_DE_L_ECRAN = "brigade.ecran";
function retenirLEcran() {
  const ecran = courant !== undefined ? { projet: courant.nom } : ajoute ? { ajout: true } : stationOuverte !== undefined ? { station: stationOuverte } : pageDeLApp !== undefined ? { page: pageDeLApp } : {};
  try {
    window.sessionStorage?.setItem(CLE_DE_L_ECRAN, JSON.stringify(ecran));
  } catch {
    // Sans stockage, un rechargement rouvre l'accueil.
  }
}
// Avant le premier affichage : l'écran retenu, s'il existe encore. Illisible, ou son projet retiré du fichier : l'accueil.
function reprendreLEcran() {
  /** @type {{ projet?: unknown, ajout?: unknown, station?: unknown, page?: unknown }} */
  let lu = {};
  try {
    lu = JSON.parse(window.sessionStorage?.getItem(CLE_DE_L_ECRAN) ?? "{}") ?? {};
  } catch {
    return;
  }
  const projet = configuration.projets.find(({ nom }) => nom === lu.projet);
  if (projet !== undefined) courant = projet;
  else if (lu.ajout === true) ajoute = true;
  else if (typeof lu.station === "string") stationOuverte = lu.station;
  else if (lu.page === COUTS || lu.page === RATIOS || lu.page === RESUMES) pageDeLApp = lu.page;
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
  retenirLEcran();
  const refuse = configuration.refus !== undefined;
  const affichee = ajoute ? [...barre.children].findIndex(({ id }) => id === "entree-ajout") : courant === undefined ? 0 : configuration.projets.indexOf(courant) + 1;
  [...barre.children].forEach((entree, rang) => (entree.ariaCurrent = String(rang === affichee)));
  // La fiche d'un projet ne reste pas ouverte quand le chef en quitte l'espace.
  if (ouverte !== undefined && ouverte.projet.nom !== courant?.nom) fermerFiche();
  // L'espace affiché ne porte pas de signal : il le reprend en le quittant.
  for (const projet of configuration.projets) marquerSignal(projet.nom);
  tous.hidden = refuse || ajoute || courant !== undefined;
  // À la largeur d'un téléphone, l'accueil est la liste des cartes qui attendent le chef (ticket 2915) : elle prend la place
  // de « Tous les projets », sauf sous une page de l'app, une station ou le premier lancement, qui la couvrent comme lui.
  const sousUnePage = stationOuverte !== undefined || pageDeLApp !== undefined || (ecranDuPremier !== undefined && ecranDuPremier.parentElement === tous);
  const surLesCartes = etroit() && !tous.hidden && !sousUnePage;
  cartesDuChef.hidden = !surLesCartes;
  if (surLesCartes) {
    tous.hidden = true;
    poserLesCartesDuChef();
  }
  ajout.hidden = !ajoute;
  teindre();
  principal.hidden = !refuse && courant === undefined;
  colonneSecond.hidden = courant === undefined;
  lireOnglet();
  poserLaVisite();
  poserLeProjetAPreparer();
  poserLaDemandeDeStationIci();
  poserLeRecitDuPremierTicket();
}

// Tous les projets, dans l'ordre du fichier, puis la station de cet ordinateur (ticket 2638), puis toutes les stations et
// « + station », relues à chaque ouverture (ticket 3195) : l'écran se regarde, et un clic ouvre ce qu'il montre. Ce qui s'y voit se traite dans l'espace du projet, ou sur la page de la station.
function ouvrirTous() {
  courant = undefined;
  ajoute = false;
  stationOuverte = undefined;
  pageDeLApp = undefined;
  marquer();
  poserCode();
  poserAccueil();
  poserCout();
  poserRatios();
  poserBlocStation();
  poserStationsDeLAccueil();
  tous.replaceChildren(blocDeLaPromesse, blocDesProjets, blocDeLaStation.racine, stationsDeLAccueil);
  brigade.tous(++demande);
  void lireLesEnregistrees();
}

// La liste des stations de l'accueil (ticket 1778) : une ligne par machine, dans l'ordre des noms. Une machine appairée
// se dit par sa présence, telle que le process principal l'a dite (accueil.ts) — en ligne ou non, ce qu'elle fait, les
// projets qu'elle sert —, et, enregistrée aussi sous le compte GitHub du chef, les projets qui lui y sont choisis s'y
// fondent ; une machine seulement enregistrée se dit par son enregistrement (stations-du-compte.js). Jamais deux lignes
// pour une même machine : ses deux lectures ne peuvent plus se contredire.
function poserStationsDeLAccueil() {
  const stations = accueilVu?.stations;
  const lues = enregistreesAbsentes ? undefined : etatDesEnregistrees.stations;
  const lignes = uneLigneParMachine(stations ?? [], lues?.state === "listed" ? lues.stations : []);
  // Sans station dans la liste : sa lecture en route, ou, quand le compte n'en a aucune non plus, rien — dessous, la
  // lecture du compte dit comment en installer une. Les appairées pas encore lues, la liste n'est pas dite vide.
  const enRoute = stations === undefined || (!enregistreesAbsentes && lues === undefined);
  const sansAucune = lues?.state === "listed" && lues.unreadable.length === 0;
  listeDesStations.replaceChildren(
    ...(lignes.length > 0
      ? lignes.map((ligne) => ("appairee" in ligne ? ligneDeStationDeLAccueil(ligne.appairee, ligne.enregistree) : ligneDeLEnregistree(document, ligne.enregistree, gestesDesEnregistrees)))
      : enRoute
        ? [bloc("p", "your stations: first read on GitHub in progress…")]
        : sansAucune
          ? []
          : [bloc("p", `${PAS_ENCORE("station")} Install one, then pair it here with “+ station”.`)]),
  );
  poserLesVersions();
  const dessous = enregistreesAbsentes ? [] : lectureDuCompte(document, etatDesEnregistrees, gestesDesEnregistrees, stations !== undefined && lignes.length === 0);
  blocDesEnregistrees.hidden = dessous.length === 0;
  blocDesEnregistrees.replaceChildren(...dessous);
  if (stationOuverte !== undefined) poserLesProjetsChoisis();
}

// Le bloc de la station de l'accueil (ticket 2640) : celle de cet ordinateur — installée quand les stations du chef la
// nomment, ou que son statut se lit —, et les autres du chef. Rien n'est dit tant que les stations ne sont pas lues.
function poserBlocStation() {
  const locale = projetsVus?.locale ?? null;
  const toutes = stationsVues?.stations ?? [];
  const dite = (/** @type {import("../stations/stations.ts").StationVue} */ { id, nom, ligne }) => ({ id, nom, phrase: ligne });
  const ici = locale === null ? undefined : toutes.find(({ id }) => id === locale);
  if (stationsVues === undefined && statutLu(statutDeLaStationVu) === undefined) return blocDeLaStation.lire(undefined);
  // Sans id local, la page de sa station ne s'ouvrirait nulle part : elle n'est pas dite installée.
  if (locale === null || (ici === undefined && statutLu(statutDeLaStationVu) === undefined)) return blocDeLaStation.lire({ station: null });
  const lu = statutLu(statutDeLaStationVu) !== undefined;
  const version = lu ? caseDIci(POSTE.nom, statutDeLaStationVu).phrase : undefined;
  const phrase = lu ? `version ${statutLu(statutDeLaStationVu)?.stationVersion}` : "installed";
  const celle = ici === undefined ? { id: locale, nom: POSTE.nom, phrase } : dite(ici);
  blocDeLaStation.lire({ station: version === undefined ? celle : { ...celle, version }, autres: toutes.filter(({ id }) => id !== locale).map(dite) });
}
// Le statut de la station de cet ordinateur (`statutDeLaStation`, le contrat du ticket 2189) : la version qui tourne ici, la
// dernière publiée, et si elle est en retard. Tant que le pont ne le lit pas, la case de ce poste dit sa version inconnue.
/** @type {unknown} */
let statutDeLaStationVu;
function poserLesVersions() {
  if (telephoneVu !== undefined) return versionsDesStations.replaceChildren();
  const cases = casesDesVersions({ stations: stationsVues?.stations, locale: projetsVus?.locale ?? null, poste: POSTE.nom, statut: statutDeLaStationVu });
  versionsDesStations.replaceChildren(poserVersionsDesStations(document, cases));
}

// Les stations du compte, lues par le process principal (stations-du-compte.ts du runtime). Une relecture garde ce qui
// est posé jusqu'à sa réponse : le bloc ne clignote pas. Seule la dernière demandée est posée.
async function lireLesEnregistrees() {
  const demandee = ++lectureDesEnregistrees;
  /** @type {import("../stations-du-compte.ts").StationsDuCompte | undefined} */
  let lu;
  try {
    lu = await brigade.stationsDuCompte?.();
  } catch (erreur) {
    lu = { state: "unavailable", cause: "github", reason: "Your stations could not be read: the app failed while reading them.", detail: erreur instanceof Error ? erreur.message : String(erreur) };
  }
  if (demandee !== lectureDesEnregistrees) return;
  enregistreesAbsentes = lu === undefined;
  if (lu !== undefined) etatDesEnregistrees.stations = lu;
  suivreLesAttendus();
  poserStationsDeLAccueil();
  // La page d'un projet dit les stations du compte qui refusent de l'avoir (ticket 1790).
  if (courant !== undefined) {
    poserStationsDuProjet();
    poserCuisson(courant);
  }
}

// Un dépôt que le chef vient de cocher pour une station : elle le lit dans les 30 s, et dit ce qu'elle en fait — elle le
// sert, ou refuse (ticket 1790). Jusqu'à ce qu'elle l'ait dit, les stations
// du compte se relisent toutes les `ATTENTE_D_UN_AJOUT_MS`, au plus `RELECTURES_D_UN_AJOUT` fois : sa réponse se lit sous la
// case au moment de l'ajout, sans que le chef ait à relire.
const ATTENTE_D_UN_AJOUT_MS = 15_000;
const RELECTURES_D_UN_AJOUT = 8;
let relecturesDUnAjout = 0;
/** @type {ReturnType<typeof setTimeout> | undefined} */
let relectureDUnAjout;
function suivreLesAttendus() {
  clearTimeout(relectureDUnAjout);
  const attendus = etatDesEnregistrees.attendus;
  if (attendus === undefined) return;
  const lues = etatDesEnregistrees.stations;
  const station = lues?.state === "listed" ? lues.stations.find(({ id }) => id === attendus.id) : undefined;
  const restants = attendus.depots.filter((depot) => (station?.selection ?? []).includes(depot) && issueDeLAjout(station, depot) === undefined);
  if (restants.length === 0 || relecturesDUnAjout >= RELECTURES_D_UN_AJOUT) {
    delete etatDesEnregistrees.attendus;
    return;
  }
  etatDesEnregistrees.attendus = { id: attendus.id, depots: restants };
  relectureDUnAjout = setTimeout(() => {
    relecturesDUnAjout += 1;
    void lireLesEnregistrees();
  }, ATTENTE_D_UN_AJOUT_MS);
}

// Les dépôts du chef, entre lesquels il choisit ce qu'une station sert : lus à l'ouverture d'une première station.
async function lireLesDepotsDesEnregistrees() {
  const demandee = ++lectureDesDepotsEnregistrees;
  delete etatDesEnregistrees.depots;
  poserStationsDeLAccueil();
  /** @type {{ depots: import("../projets/github.ts").DepotDuChef[] } | { refus: string }} */
  let lus;
  try {
    lus = (await brigade.depotsDuChef()) ?? { refus: "the app gave no answer" };
  } catch (erreur) {
    lus = { refus: erreur instanceof Error ? erreur.message : String(erreur) };
  }
  if (demandee !== lectureDesDepotsEnregistrees) return;
  etatDesEnregistrees.depots = lus;
  poserStationsDeLAccueil();
}

// Une case cochée ou décochée : la sélection entière de la station s'écrit dans son gist. Ses cases attendent la
// réponse ; écrite, la ligne de la station dit ce qu'elle sert — sinon, pourquoi rien n'a changé.
/** @param {string} id @param {string[]} depots @returns {Promise<import("../stations-du-compte.ts").Choix>} */
async function choisirPourUneEnregistree(id, depots) {
  etatDesEnregistrees.envoi = id;
  delete etatDesEnregistrees.refus;
  poserStationsDeLAccueil();
  /** @type {import("../stations-du-compte.ts").Choix} */
  let rendu;
  try {
    rendu = (await brigade.choisirLesProjets?.(id, depots)) ?? { refus: "not saved: the app gave no answer" };
  } catch (erreur) {
    rendu = { refus: "not saved: the app failed while saving", detail: erreur instanceof Error ? erreur.message : String(erreur) };
  }
  delete etatDesEnregistrees.envoi;
  const lues = etatDesEnregistrees.stations;
  if ("refus" in rendu) etatDesEnregistrees.refus = { id, ...rendu };
  else if (lues?.state === "listed") {
    const { selection } = rendu;
    const avant = lues.stations.find((station) => station.id === id)?.selection ?? [];
    etatDesEnregistrees.stations = { ...lues, stations: lues.stations.map((station) => (station.id === id ? { ...station, selection } : station)) };
    // Les dépôts cochés à l'instant : la station va dire ce qu'elle en fait.
    const coches = selection.filter((depot) => !avant.includes(depot));
    if (coches.length > 0) {
      etatDesEnregistrees.attendus = { id, depots: [...new Set([...(etatDesEnregistrees.attendus?.id === id ? etatDesEnregistrees.attendus.depots : []), ...coches])] };
      relecturesDUnAjout = 0;
      suivreLesAttendus();
    }
  }
  poserStationsDeLAccueil();
  return rendu;
}

// Le premier lancement, sur un ordinateur neuf (ticket 1434, premier-lancement.js) : tant que le fichier n'a aucun
// projet, l'app s'ouvre sur les stations du chef et leurs projets, lus par le runtime, à la place de l'accueil —
// « T » reste l'entrée affichée, et y ramène ; « + » mène à l'écran « Add a project ». Un projet s'ouvre d'un clic :
// sa copie se fait, chaque étape se dit sous sa station, puis il entre dans le fichier, et son espace s'ouvre. Une
// connexion à GitHub qui manque se fait d'un bouton ; faite, les stations sont relues — et une ouverture qu'elle
// retenait repart d'elle-même.
/** @type {import("./premier-lancement.js").EtatDuPremier} */
const premier = { poste: POSTE.nom, saisie: { projet: "" } };
/** @type {any} */
let ecranDuPremier;
let lectureDuPremier = 0;
// Le projet ouvert, que le fichier n'a peut-être pas encore rendu : son espace s'ouvre dès qu'il y est.
/** @type {string | undefined} */
let premierAOuvrir;
// Le compte GitHub de cet ordinateur (parcours-projet/compte.js, ticket 2475), que disent le premier lancement et l'écran
// « Add a project » : lu une fois à l'ouverture de l'un ou l'autre, et relu au bout d'une connexion — ou d'un changement de
// compte, qui en est une. Chaque lecture repose les deux.
const compteDuParcours = tenirLeCompte({ pont: brigade, rendre: () => poserLePremier() });
/** @returns {import("./parcours-projet/compte.js").EtatDuCompte} */
const etatDuParcours = () => ({ ...compteDuParcours.etat, ...(premier.connexion === undefined ? {} : { connexion: premier.connexion }) });
/** @type {import("./premier-lancement.js").GestesDuPremier} */
const gestesDuPremier = {
  ouvrir: (station, projet, depot, base) => void ouvrirDUneStation(station, projet, depot, base),
  seConnecter: () => void seConnecterAGitHub(),
  changerDeCompte: () => void seConnecterAGitHub(),
  relireLeCompte: () => void compteDuParcours.lire(),
  relire: () => void relireLePremier(),
  ouvrirLaPage: (url) => void brigade.ouvrirLaPage?.(url),
  ajouterUnProjet: () => ouvrirAjout(),
};
// Le desktop porte le premier lancement ; un pont qui ne le porte pas s'ouvre sur l'écran « Add a project ».
const avecPremier = () => configuration.projets.length === 0 && telephone === undefined && brigade.stationsDuChef !== undefined;
// Le projet d'essai (ticket 3227, essai/projet-d-essai.js) : « try on a sample project » sur le premier lancement le crée et
// le mène jusqu'au rail par les gestes de l'app — sa mise en place, la station de cet ordinateur, l'ouverture de son
// espace. Son encart, par-dessus tout écran, dit où il en est ; GitHub est relu chaque minute tant que son ticket attend
// son merge.
const sectionEssai = element("projet-d-essai");
const essai = tenirLeProjetDEssai({ pont: brigade, rendre: () => poserLEncartDEssai(), ouvrir: (projet, depot, base) => ouvrirDUneStation("", projet, depot, base) });
premier.essai = essai.etat;
gestesDuPremier.essayer = () => void essai.essayer();
function poserLEncartDEssai() {
  const poses = poserLeProjetDEssai(document, essai.etat, { essayer: () => void essai.essayer(), supprimer: () => void essai.supprimer(), ouvrirLaPage: (/** @type {string} */ url) => void brigade.ouvrirLaPage?.(url) });
  sectionEssai.replaceChildren(...poses);
  sectionEssai.hidden = poses.length === 0;
  poserLePremier();
}
brigade.surPermissionDeSuppression?.((fin) => void essai.apresLaPermission(fin));
void essai.lire();
setInterval(() => {
  if (essai.aSuivre()) void essai.lire();
}, 60_000);

function ouvrirPremier() {
  courant = undefined;
  ajoute = false;
  stationOuverte = undefined;
  pageDeLApp = undefined;
  marquer();
  ecranDuPremier = poserPremierLancement(document, { ...premier, ...etatDuParcours(), poste: POSTE.nom }, gestesDuPremier);
  tous.replaceChildren(ecranDuPremier);
  compteDuParcours.lireUneFois();
  if (premier.stations === undefined && lectureDuPremier === 0) void relireLePremier();
}

// Reposé à chaque changement — tant qu'il est l'écran montré : un autre l'a remplacé, rien n'y est reposé.
function poserLePremier() {
  // La connexion lancée depuis le rail publié s'y dit aussi (rail-publie.js, ticket 1435) — et depuis les stations du compte.
  if (courant !== undefined && railsPublies.has(courant.nom) && !rail.hidden) poserRail(courant);
  if (premier.connexion === undefined) delete etatDesEnregistrees.connexion;
  else etatDesEnregistrees.connexion = premier.connexion;
  poserStationsDeLAccueil();
  // L'écran « Add a project » dit aussi le compte, la connexion en route et le dépôt qui s'ouvre.
  if (ajoute) poserLAjout();
  if (ecranDuPremier === undefined || ecranDuPremier.parentElement !== tous || tous.hidden) return;
  ecranDuPremier = poserPremierLancement(document, { ...premier, ...etatDuParcours(), poste: POSTE.nom }, gestesDuPremier);
  tous.replaceChildren(ecranDuPremier);
  ajouterLaCuisineDeLaVisite();
}

// Le premier lancement, le compte GitHub lu (ticket 3165) : sans rien taper, benomite/brigade s'ajoute — par l'ouverture
// que le premier écran fait d'un clic, sa copie dite sous la tête, son échec avec « Try again » — puis son espace s'ouvre
// sur la visite. Une seule fois : la visite montrée laisse sa trace, et l'app ne l'ajoute plus.
function ajouterLaCuisineDeLaVisite() {
  const compte = compteDuParcours.etat.compte;
  // Un projet d'essai en route : c'est lui qui s'ouvre.
  if (!avecPremier() || compte === undefined || !("login" in compte) || premier.ouverture !== undefined || visiteAOuvrir !== undefined || essai.etat.etape !== undefined || !visite.aDecouvrir()) return;
  visiteAOuvrir = PROJET_DE_LA_VISITE;
  void ouvrirDUneStation("", PROJET_DE_LA_VISITE, DEPOT_DE_LA_VISITE);
}

// L'écran « since you were away » : par projet qui se lit, ce que ses résumés disent de l'absence et ce qui attend le chef
// (`lesCartesDuChef`, la liste que l'app tient déjà pour ce qui attend le chef). Reposé seulement quand ce qu'il dit change.
// Son bouton le ferme, et mène à ce qui attend le chef : sa page, ou — à la largeur d'un téléphone — la liste des cartes ; sans
// rien qui attende, à l'accueil.
function poserLAbsence() {
  if (absenceDepuis === undefined || absenceFermee) return;
  const projets = configuration.projets.filter((projet) => seLit(projet));
  const cartes = lesCartesDuChef();
  const entrees = projets.map(({ nom }) => ({
    projet: nom,
    lecture: resumesDeLAbsence.get(nom),
    attentes: cartes.filter(({ projet }) => projet === nom).map(({ ticket, todo }) => {
      const titre = todo.resume ?? todo.question ?? undefined;
      return titre === undefined ? { ticket } : { ticket, titre };
    }),
  }));
  const signature = JSON.stringify(entrees);
  if (signature === absencePosee && !sectionAbsence.hidden) return;
  absencePosee = signature;
  for (const { nom } of projets) {
    if (resumesDeLAbsence.has(nom) || lecturesDeLAbsence.has(nom)) continue;
    lecturesDeLAbsence.add(nom);
    void Promise.resolve()
      .then(() => brigade.lireLesResumesHebdomadaires(nom))
      .then(
        (lue) => lue,
        (/** @type {unknown} */ erreur) => ({ projet: nom, jour: { sans: NON_ATTEINT("weekly summaries") }, resumes: { sans: NON_ATTEINT("weekly summaries"), detail: erreur instanceof Error ? erreur.message : String(erreur) } }),
      )
      .then((lue) => {
        resumesDeLAbsence.set(nom, lue);
        poserLAbsence();
      });
  }
  sectionAbsence.replaceChildren(
    poserAbsence(
      document,
      { depuis: absenceDepuis, projets: entrees },
      {
        fermer: (attend) => {
          absenceFermee = true;
          sectionAbsence.hidden = true;
          sectionAbsence.replaceChildren();
          const premier = attend ? cartes[0] : undefined;
          const ouvert = premier === undefined ? undefined : projetDe(premier.projet);
          if (ouvert !== undefined && !etroit()) void ouvrir(ouvert);
          else ouvrirTous();
          montrer();
        },
      },
    ),
  );
  sectionAbsence.hidden = false;
}

// La bulle de l'étape, sur l'espace du projet visité ; ailleurs, rien. L'étape désigne ce que le rail montre à l'instant.
function poserLaVisite() {
  const enCours = visite.etat;
  if (enCours === undefined || courant?.nom !== enCours.projet) {
    marquerLaCible(undefined);
    sectionVisite.hidden = true;
    return sectionVisite.replaceChildren();
  }
  const tenu = tenus.get(enCours.projet);
  const etapes = etapesDeLaVisite(tenu !== undefined && "tableau" in tenu ? tenu.tableau.rail.colonnes : undefined);
  const etape = etapes[enCours.rang] ?? etapes[0];
  marquerLaCible(etape === undefined ? undefined : trouverLaCible({ rail, second: colonneSecond }, etape.cible));
  sectionVisite.replaceChildren(
    poserVisite(document, { etapes, rang: enCours.rang }, {
      suivante: () => visite.suivante(etapes.length),
      passer: () => visite.fermer(),
      // Le seul appel à agir de la dernière étape : l'ajout d'un projet, le même que « + ».
      ajouter: () => {
        visite.fermer();
        ouvrirAjout();
      },
    }),
  );
  sectionVisite.hidden = false;
}

// Rejouée : sur benomite/brigade s'il est dans le fichier, sinon sur le projet ouvert, sinon sur le premier — sur Rail.
function rejouerLaVisite() {
  const projet = configuration.projets.find(({ depot }) => depot === DEPOT_DE_LA_VISITE) ?? courant ?? configuration.projets[0];
  if (projet === undefined) return;
  visite.commencer(projet.nom);
  if (courant?.nom === projet.nom) return choisirOnglet(RAIL);
  retenir(projet.nom, RAIL);
  void ouvrir(projet);
}

// La page d'un projet pas encore prêt (ticket 3166, parcours-premier-projet/). La lecture d'un projet qu'« Add a project »
// vient d'ouvrir décide : en lecture seule (ticket 3163), rien ne s'ouvre ; une lecture ratée ne décide rien, la suivante
// décidera. Le parcours ouvert, chaque lecture relit la mise en place tant que le projet ne l'a pas — la PR de mise en
// place mergée, la suivante le dit prêt (ticket 3170).
/** @param {string} nom */
function suivreLeParcours(nom) {
  const tenu = tenus.get(nom);
  const lu = tenu !== undefined && "tableau" in tenu;
  const projet = projetDe(nom);
  if (projet === undefined || !lu) return;
  const depot = aGuider.get(nom);
  if (depot !== undefined) {
    aGuider.delete(nom);
    if (lectureSeuleDe(projet) !== undefined) return;
    parcoursDesProjets.commencer(nom, depot, dejaCuit(projet, depot));
    // Le premier projet du chef : le fichier n'en a pas d'autre que la cuisine de démonstration de la visite.
    recitDuPremierTicket.projetAjoute(nom, configuration.projets.some((autre) => autre.nom !== nom && autre.depot !== DEPOT_DE_LA_VISITE));
    if (tenu !== undefined && "tableau" in tenu) recitDuPremierTicket.observer(nom, tenu.tableau.etapesDesTickets);
    departsDesProjets.commencer(nom);
    void lireLeDepart(nom);
    // Les stations du compte se proposent à « qui le cuit » : relues, la question se repose.
    void lireLesEnregistrees().then(() => poserLeProjetAPreparer());
    void lirePreparation(projet);
    if (courant?.nom === nom) reposerLaPage(projet);
    return;
  }
  const parcours = parcoursDesProjets.de(nom);
  if (parcours === undefined || parcours.pret !== undefined) return;
  const etape = depots.get(nom)?.etape;
  if ((parcours.station === "ajoutee" || parcours.station === "inutile") && etape !== "prepare" && etape !== "en-route") void lirePreparation(projet);
  if (courant?.nom === nom) poserLeProjetAPreparer();
}

// Les issues ouvertes du projet et ce que le second en propose, lus par l'app (depart-du-projet.ts) : le départ le montre, ou
// s'efface quand il n'y a rien à proposer. Une lecture qui échoue se dit sur l'écran, jamais un écran vide.
/** @param {string} nom */
async function lireLeDepart(nom) {
  try {
    departsDesProjets.recu(nom, await brigade.departDuProjet(nom));
  } catch (erreur) {
    departsDesProjets.recu(nom, { sans: "the app could not ask the second for its proposals", detail: erreur instanceof Error ? erreur.message : String(erreur) });
  }
}

// Le bouton unique : les lignes restantes, avec les priorités montrées à l'écran, sur le rail.
/** @param {string} nom */
async function mettreLeDepartSurLeRail(nom) {
  const mise = departsDesProjets.commencerLaMise(nom);
  if (mise === undefined) return;
  try {
    const rendu = await brigade.mettreSurLeRail(nom, mise.lignes.map(({ ticket, priorite }) => ({ ticket, priorite })));
    if ("fait" in rendu) departsDesProjets.mise(nom, rendu.fait, rendu.refus);
    else departsDesProjets.miseRatee(nom, rendu.refus, rendu.detail ?? "");
  } catch (erreur) {
    departsDesProjets.miseRatee(nom, "nothing was put on the rail: GitHub could not be reached", erreur instanceof Error ? erreur.message : String(erreur));
  }
}

// La question est posée sur ce projet : sa page n'a qu'elle.
/** @param {string} nom */
function parcoursOuvert(nom) {
  const parcours = parcoursDesProjets.de(nom);
  return parcours !== undefined && parcours.pret === undefined;
}

// Une station cuit déjà le projet — elle le sert, l'app le lui a demandé, ou c'est celle de cet ordinateur : « qui le
// cuit » n'est pas posée.
/** @param {Projet} projet @param {string} depot */
function dejaCuit(projet, depot) {
  const { stations } = cuisineDe(projet);
  const lecture = servis.etat?.lecture;
  const ici = lecture !== undefined && "depots" in lecture && lecture.depots.some((servi) => servi.toLowerCase() === depot.toLowerCase());
  return ici || stations.length > 0 || ouCuit(projet, stations) !== undefined;
}

/** @param {Projet} projet */
async function lirePreparation(projet) {
  if (preparationsEnLecture.has(projet.nom)) return;
  preparationsEnLecture.add(projet.nom);
  try {
    const echec = await lireLeDepot(projet);
    parcoursDesProjets.illisible(projet.nom, echec);
  } finally {
    preparationsEnLecture.delete(projet.nom);
  }
}

// Une station sert le projet : celle de cet ordinateur l'a dans sa liste (projets-servis/), une station dit le servir
// (stations/stations.ts), ses stations disent où il cuit (`cuitSur`), ou sa cuisine tourne ici. Une station à qui il est
// seulement demandé ne le sert pas encore.
/** @param {Projet} projet @param {string} depot @param {readonly string[]} servisIci */
function serviParUneStation(projet, depot, servisIci) {
  const cle = depot.toLowerCase();
  const dit = projetsVus?.projets.find(({ nom }) => nom === projet.nom)?.cuitSur;
  return (
    servisIci.some((servi) => servi.toLowerCase() === cle) ||
    (stationsVues?.stations ?? []).some(({ projets }) => projets.includes(projet.nom)) ||
    (dit !== undefined && dit !== null) ||
    projet.ici === true
  );
}

// La question du ticket 3400, au-dessus du rail du projet affiché. Sa mise en place vient de passer : elle se juge dès que
// la liste de cet ordinateur et les stations sont lues — jamais sur une lecture manquante, ni pendant que le parcours
// pose sa propre question « qui le cuit ».
function poserLaDemandeDeStationIci() {
  const projet = courant;
  const fermer = () => {
    sectionDeLaDemande.hidden = true;
    sectionDeLaDemande.replaceChildren();
  };
  if (projet === undefined || lectureSeuleDe(projet) !== undefined) return fermer();
  const nom = projet.nom;
  const depot = projet.depot ?? projetsVus?.projets.find((candidat) => candidat.nom === nom)?.depot;
  const etat = demandesDeStation.de(nom);
  if (etat === undefined || depot === undefined) return fermer();
  const lecture = servis.etat?.lecture;
  const servisIci = lecture !== undefined && "depots" in lecture ? lecture.depots : undefined;
  if (etat.etape === "a-juger") {
    const parcours = parcoursDesProjets.de(nom);
    const questionDuParcours = parcours !== undefined && parcours.pret === undefined && parcours.station !== "ajoutee" && parcours.station !== "inutile";
    if (servisIci === undefined || stationsVues === undefined || questionDuParcours) return fermer();
    const servi = serviParUneStation(projet, depot, servisIci);
    // Posée : les stations du compte se proposent après cet ordinateur — relues, la question se repose.
    if (!servi) void lireLesEnregistrees().then(() => poserLaDemandeDeStationIci());
    return demandesDeStation.juger(nom, servi);
  }
  const lues = enregistreesAbsentes ? undefined : etatDesEnregistrees.stations;
  const choix = choixDeStation({
    ici: servisIci !== undefined,
    hote: POSTE.nom === CET_ORDINATEUR ? "" : POSTE.nom,
    stations: lues?.state === "listed" ? stationsAProposer(lues.stations, depot, projetsVus?.locale) : [],
    maintenant: Date.now(),
  });
  sectionDeLaDemande.replaceChildren(
    poserLaDemandeDeStation(
      document,
      { depot, etat, choix },
      {
        // Cet ordinateur : le geste de la case de Settings (`servirUnProjet`) ; une station du compte : sa sélection.
        choisir: async (un) => {
          if (demandesDeStation.de(nom)?.etape === "enCours") return;
          demandesDeStation.choisir(nom, un.cle);
          const appairee = lues?.state === "listed" ? lues.stations.find(({ id }) => id === un.cle) : undefined;
          const rendu = await ajouterLaStation(un.nom, () =>
            un.cle === ICI ? servirIciLeDepot(depot)
            : appairee === undefined ? Promise.resolve({ refus: `${un.nom} is no longer one of your stations` })
            : choisirPourUneEnregistree(appairee.id, [...(appairee.selection ?? []), depot]),
          );
          demandesDeStation.choisi(nom, rendu, { nom: un.nom, ici: un.cle === ICI, absente: un.horsLigne });
        },
        ecarter: () => demandesDeStation.ecarter(nom),
        fermer: () => demandesDeStation.fermer(nom),
      },
    ),
  );
  sectionDeLaDemande.hidden = false;
}

// La question posée ou levée : l'avis d'un projet pas préparé (ticket 2628) et le rail se reposent.
/** @param {Projet} projet */
function reposerLaPage(projet) {
  if (courant?.nom !== projet.nom) return;
  poserAlertes(projet);
  poserRail(projet);
}

// Ce que la vue sait du second du projet : il ne part pas, il propose au chef, et ce que le titre de son terminal dit.
/** @param {string} nom @returns {import("./parcours-premier-projet/parcours-premier-projet.js").Second} */
function secondDuParcours(nom) {
  const second = [...vues.values()].find(({ terminal }) => terminal.projet === nom && terminal.genre === "second")?.terminal;
  const titre = travailDuSecond(titresDesSeconds.get(nom));
  return {
    ...(second?.empeche === undefined ? {} : { empeche: true }),
    ...(propositionsDuSecond.aMontrer(nom) === undefined && propositionsDuSecond.geste(nom) === undefined ? {} : { propose: true }),
    ...(titre === undefined ? {} : { titre }),
  };
}

// La page du projet affiché, s'il n'est pas prêt (ticket 3166) : la question à la place du rail — `main` le porte (`data-parcours`), et
// sa feuille de style y cache le reste ; prêt, la ligne du premier ticket au-dessus du rail ; sinon, rien.
function poserLeProjetAPreparer() {
  const projet = courant;
  const parcours = projet === undefined ? undefined : parcoursDesProjets.de(projet.nom);
  const fermer = () => {
    sectionDuParcours.hidden = true;
    sectionDuParcours.replaceChildren();
    delete principal.dataset.parcours;
  };
  if (projet === undefined || parcours === undefined) return fermer();
  const nom = projet.nom;
  // L'accès en écriture perdu en route : la page s'ouvre en lecture seule (ticket 3163), sans rien de tout cela.
  if (lectureSeuleDe(projet) !== undefined) {
    parcoursDesProjets.fermer(nom);
    return reposerLaPage(projet);
  }
  // Prêt : au-dessus du rail, le second demande au chef ce qu'il veut changer d'abord (ticket 3306). Le champ tapé garde le
  // clavier quand la page se repose.
  if (parcours.pret !== undefined) {
    delete principal.dataset.parcours;
    premiersTickets.commencer(nom);
    const etat = premiersTickets.de(nom);
    if (etat === undefined) return fermer();
    const rendreLeChamp = garderLeClavier(document.activeElement, sectionDuParcours);
    sectionDuParcours.replaceChildren(
      poserPremierTicket(document, { depot: parcours.depot, etat, ...(parcours.absente === undefined ? {} : { absente: parcours.absente }) }, {
        ecrire: (texte) => premiersTickets.ecrire(nom, texte),
        envoyer: () => void premiersTickets.envoyer(nom),
        oui: () => void premiersTickets.oui(nom),
        changer: () => void premiersTickets.changer(nom),
        fermer: () => {
          premiersTickets.oublier(nom);
          parcoursDesProjets.fermer(nom);
        },
      }),
    );
    sectionDuParcours.hidden = false;
    rendreLeChamp();
    return;
  }
  const depart = departsDesProjets.de(nom);
  if (depart !== undefined) {
    principal.dataset.parcours = "depart";
    sectionDuParcours.replaceChildren(
      poserLeDepart(
        document,
        { depot: parcours.depot, etat: depart },
        {
          changer: (ticket, priorite) => departsDesProjets.changer(nom, ticket, priorite),
          lacher: (ticket) => departsDesProjets.lacher(nom, ticket),
          mettre: () => void mettreLeDepartSurLeRail(nom),
          passer: () => departsDesProjets.passer(nom),
          relire: () => {
            departsDesProjets.relire(nom);
            void lireLeDepart(nom);
          },
        },
      ),
    );
    sectionDuParcours.hidden = false;
    return;
  }
  if (parcours.station === "a-faire" && dejaCuit(projet, parcours.depot)) return parcoursDesProjets.station(nom, "inutile");
  const preparation = depots.get(nom);
  const tenu = tenus.get(nom);
  const carte = tenu !== undefined && "tableau" in tenu ? carteDeSetup(tenu.tableau.rail.colonnes) : undefined;
  const lu = { station: parcours.station, ...(preparation === undefined ? {} : { preparation }) };
  const vu = vuDuParcours({ ...lu, ...(parcours.illisible === undefined ? {} : { illisible: parcours.illisible }), carte: carte !== undefined, second: secondDuParcours(nom) });
  if (vu.etape === "pret") {
    parcoursDesProjets.pret(nom);
    return reposerLaPage(projet);
  }
  if (vu.etape === "setup" && vu.attente !== "lecture") parcoursDesProjets.setupMontre(nom);
  const lecture = servis.etat?.lecture;
  const lues = enregistreesAbsentes ? undefined : etatDesEnregistrees.stations;
  const choix = choixDeStation({
    // Cet ordinateur est offert tant que sa lecture ne dit pas qu'il n'a pas de station.
    ici: lecture === undefined || "depots" in lecture,
    hote: POSTE.nom === CET_ORDINATEUR ? "" : POSTE.nom,
    stations: lues?.state === "listed" ? stationsAProposer(lues.stations, parcours.depot, projetsVus?.locale) : [],
    maintenant: Date.now(),
  });
  principal.dataset.parcours = vu.etape;
  sectionDuParcours.replaceChildren(
    poserParcoursPremierProjet(
      document,
      {
        depot: parcours.depot,
        vu,
        progression: progression(vu, lu),
        station: parcours.station,
        choix,
        ...(parcours.illisible === undefined ? {} : { illisible: parcours.illisible }),
        ...(preparation?.etape === "refus" ? { refus: preparation.dit } : {}),
        ...(parcours.absente === undefined ? {} : { absente: parcours.absente }),
      },
      {
        // Un clic, et la page passe à la suite : cet ordinateur sert le dépôt par le geste de « Add a station »
        // (`servirUnProjet`) ; une station du compte le reçoit dans sa sélection (`choisirLesProjets`).
        choisir: async (un) => {
          const avant = parcoursDesProjets.de(nom)?.station;
          if (avant === undefined || (typeof avant === "object" && "enCours" in avant)) return;
          parcoursDesProjets.station(nom, { enCours: un.cle });
          const appairee = lues?.state === "listed" ? lues.stations.find(({ id }) => id === un.cle) : undefined;
          const station = await ajouterLaStation(un.nom, () =>
            un.cle === ICI || appairee === undefined ? servirIciLeDepot(parcours.depot) : choisirPourUneEnregistree(appairee.id, [...(appairee.selection ?? []), parcours.depot]),
          );
          parcoursDesProjets.station(nom, station, un.horsLigne ? un.nom : undefined);
          const etape = depots.get(nom)?.etape;
          if (station === "ajoutee" && etape !== "prepare" && etape !== "en-route") void lirePreparation(projet);
        },
        relire: () => void lirePreparation(projet),
        preparer: () => void preparerLeDepot(projet),
        ouvrirLaCarte: () => {
          if (carte !== undefined) ouvrirFiche(projet, carte, sectionDuParcours);
        },
      },
    ),
  );
  sectionDuParcours.hidden = false;
}

// Le récit du premier ticket, sur la page du projet qui l'a (ticket 3302) : rien ailleurs, ni en lecture seule. Ses liens
// ouvrent la PR du ticket — celle de son cook tant qu'il est sur le rail, puis celle qui l'a servi.
function poserLeRecitDuPremierTicket() {
  const projet = courant;
  const recit = projet === undefined || lectureSeuleDe(projet) !== undefined ? undefined : recitDuPremierTicket.de(projet.nom);
  if (projet === undefined || recit === undefined) {
    sectionDuRecit.hidden = true;
    sectionDuRecit.replaceChildren();
    return;
  }
  const { nom } = projet;
  const { ticket } = recit;
  sectionDuRecit.replaceChildren(
    poserRecitDuPremierTicket(document, recit, {
      ouvrir: () => void brigade.ouvrirPrDuCook(nom, ticket).then((ouverte) => ouverte || brigade.ouvrirPr(nom, ticket)),
      ranger: () => recitDuPremierTicket.ranger(),
    }),
  );
  sectionDuRecit.hidden = false;
}

async function relireLePremier() {
  const demandee = ++lectureDuPremier;
  delete premier.stations;
  poserLePremier();
  /** @type {import("../premier-lancement.ts").StationsDuChef} */
  let lu;
  try {
    lu = (await brigade.stationsDuChef?.()) ?? { state: "unavailable", cause: "github", reason: "Your stations could not be read: the app gave no answer." };
  } catch (erreur) {
    const detail = erreur instanceof Error ? erreur.message : String(erreur);
    lu = { state: "unavailable", cause: "github", reason: "Your stations could not be read: the app failed while reading them.", detail };
  }
  if (demandee !== lectureDuPremier) return;
  premier.stations = lu;
  poserLePremier();
}

// `base` : la branche par défaut que GitHub a donnée du dépôt (l'écran « Add a project ») — à défaut, celle que l'origine
// de sa copie désigne.
/** @param {string} station @param {string} projet @param {string} depot @param {string} [base] */
async function ouvrirDUneStation(station, projet, depot, base) {
  premier.ouverture = { station, projet, depot, ...(base === undefined ? {} : { base }) };
  poserLePremier();
  /** @type {import("../premier-lancement.ts").Ouverture} */
  let issue;
  try {
    issue = (await brigade.ouvrirDUneStation?.(projet, depot, ...(base === undefined ? [] : [base]))) ?? { state: "failed", project: projet, repository: depot, cause: "unknown", reason: `${projet} could not be opened: the app gave no answer.` };
  } catch (erreur) {
    const detail = erreur instanceof Error ? erreur.message : String(erreur);
    issue = { state: "failed", project: projet, repository: depot, cause: "unknown", reason: `${projet} could not be opened: the app failed while opening it.`, detail };
  }
  if (issue.state === "failed") {
    premier.ouverture = { station, projet, depot, ...(base === undefined ? {} : { base }), echec: issue };
    return poserLePremier();
  }
  delete premier.ouverture;
  // Cloné à l'instant : où, en une ligne — la page du projet s'ouvre dessous.
  if ("cloned" in issue && issue.cloned) poserAvis({ titre: CLONE_DANS(issue.folder), lignes: [] });
  // Ajouté, il est déjà arrivé par `surConfiguration` — sinon, son espace s'ouvre dès qu'il y arrive.
  const ouvert = projetDe(issue.project);
  if (ouvert !== undefined) return void ouvrir(ouvert);
  premierAOuvrir = issue.project;
  poserLePremier();
}

async function seConnecterAGitHub() {
  premier.connexion = { enRoute: true };
  poserLePremier();
  /** @type {import("../connexion-github.ts").DebutDeConnexion} */
  let debut;
  try {
    debut = (await brigade.seConnecterAGitHub?.()) ?? { refus: "GitHub sign-in could not be started: the app gave no answer." };
  } catch (erreur) {
    debut = { refus: "GitHub sign-in could not be started: the app failed while starting it.", detail: erreur instanceof Error ? erreur.message : String(erreur) };
  }
  if ("connecte" in debut) return connecteAGitHub();
  premier.connexion = debut;
  poserLePremier();
}

// Connecté : le compte et les stations sont relus, et une ouverture que la connexion retenait repart.
function connecteAGitHub() {
  delete premier.connexion;
  compteDuParcours.apresLaConnexion();
  // Et son rail sur GitHub : connecté, il se lit peut-être (ticket 2076).
  if (courant !== undefined && railsPublies.has(courant.nom)) relireLeRailPublie(courant);
  const retenue = premier.ouverture?.echec?.cause === "sign-in-required" ? premier.ouverture : undefined;
  void relireLePremier();
  if (!enregistreesAbsentes) void lireLesEnregistrees();
  // Les dépôts de l'écran « Add a project » se lisent du compte qui vient de se connecter.
  if (ajoute) void lireLesDepotsDeLAjout();
  if (retenue !== undefined) void ouvrirDUneStation(retenue.station, retenue.projet, retenue.depot, retenue.base);
}

brigade.surOuverture?.((depot, etape) => {
  const { ouverture } = premier;
  if (ouverture === undefined || ouverture.depot !== depot || ouverture.echec !== undefined) return;
  ouverture.etape = etape;
  poserLePremier();
});
// Sur le téléphone, la connexion à GitHub est celle de son premier écran (connexion-github.js) : elle n'est pas d'ici.
brigade.surConnexionGitHub?.((fin) => {
  if (telephoneVu !== undefined) return;
  if ("connecte" in fin) return connecteAGitHub();
  premier.connexion = fin;
  // Une connexion qui n'a pas abouti — un changement de compte abandonné : le compte est relu, tel qu'il est resté.
  compteDuParcours.apresLaConnexion();
});

// La page des coûts de tous les projets, à la place de l'accueil : « T » reste l'entrée affichée, et un
// geste y ramène. Seule sa lecture part — `station` sur la box de chaque projet — tant qu'elle est affichée.
function ouvrirCouts() {
  courant = undefined;
  ajoute = false;
  stationOuverte = undefined;
  pageDeLApp = COUTS;
  marquer();
  poserCout();
  tous.replaceChildren(pageDesCouts);
  retourDesCouts.focus();
}
ouvrirLesCouts.addEventListener("click", () => ouvrirCouts());
retourDesCouts.addEventListener("click", () => ouvrirTous());
// La page des ratios de tous les projets, de même : seule sa lecture part — `closing --json` sur la box de chaque
// projet — tant qu'elle est affichée.
function ouvrirRatios() {
  courant = undefined;
  ajoute = false;
  stationOuverte = undefined;
  pageDeLApp = RATIOS;
  marquer();
  poserRatios();
  tous.replaceChildren(pageDesRatios);
  retourDesRatios.focus();
}
ouvrirLesRatios.addEventListener("click", () => ouvrirRatios());
retourDesRatios.addEventListener("click", () => ouvrirTous());
// La page des résumés hebdomadaires de tous les projets, de même : chaque projet qui se lit, lu à l'ouverture.
function ouvrirResumes() {
  courant = undefined;
  ajoute = false;
  stationOuverte = undefined;
  pageDeLApp = RESUMES;
  marquer();
  resumesDeTous.poser(configuration.projets.filter((projet) => seLit(projet)).map(({ nom }) => nom));
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
  retraitDeStationDemande = undefined;
  retraitDeStationRefuse = "";
  sectionsDeStationPosees = "";
  sectionsDeStation.replaceChildren();
  marquer();
  if (parcours !== undefined) fermerParcours();
  ajoutDit.textContent = "";
  poserPageDeStation();
  poserChoixDesStations();
  tous.replaceChildren(pageDeStation);
  retourALAccueil.focus();
}
retourALAccueil.addEventListener("click", () => ouvrirTous());

// Les choix d'une liste, précédés de celui qui n'en est pas un : rien n'est choisi d'avance.
/** @param {HTMLSelectElement} liste @param {readonly string[]} choix @param {string} aucun */
function proposer(liste, choix, aucun) {
  const garde = liste.value;
  const vide = new Option(aucun, "");
  liste.replaceChildren(vide, ...choix.map((valeur) => new Option(valeur, valeur)));
  liste.value = choix.includes(garde) ? garde : "";
}

// L'écran « Add a project » (ticket 3181, parcours-projet/ajout.js) : il ne fait que choisir le dépôt. Ses dépôts se
// relisent à chaque ouverture — les derniers poussés d'abord —, la recherche et le collage restent d'un passage à l'autre.
// Un dépôt choisi s'ouvre comme un projet du premier lancement : sa copie reprise ou clonée, il entre dans la colonne de
// gauche, et sa page s'ouvre (`ouvrirDUneStation`).
/** @type {import("./parcours-projet/ajout.js").EtatDeLAjout} */
const etatDeLAjout = { saisie: { recherche: "", colle: "" } };
let lectureDesDepotsDeLAjout = 0;
/** @type {import("./parcours-projet/ajout.js").GestesDeLAjout} */
const gestesDeLAjout = {
  ...gestesDuPremier,
  choisir: (choisi) => choisirLeDepot(choisi),
  coller: (texte) => void collerUnDepot(texte),
  relire: () => void lireLesDepotsDeLAjout(),
};

function ouvrirAjout() {
  // Reposé sur lui-même — le fichier des projets a changé pendant qu'il est montré —, il ne relit pas les dépôts.
  const dejaLa = ajoute;
  courant = undefined;
  ajoute = true;
  stationOuverte = undefined;
  pageDeLApp = undefined;
  delete etatDeLAjout.refus;
  // Une ouverture ratée, laissée là, ne reste pas sur un nouvel ajout ; celle qui court, si.
  if (premier.ouverture?.echec !== undefined) delete premier.ouverture;
  marquer();
  poserLAjout();
  // Le téléphone n'ajoute aucun projet : il ne lit ni compte ni dépôts.
  if (telephone !== undefined) return;
  compteDuParcours.lireUneFois();
  if (!dejaLa) void lireLesDepotsDeLAjout();
}

function poserLAjout() {
  ajout.replaceChildren(poserLEcranDAjout(document, { ...etatDeLAjout, ...etatDuParcours(), ...(telephone === undefined ? {} : { telephone: true }), ...(premier.ouverture === undefined ? {} : { ouverture: premier.ouverture }) }, gestesDeLAjout));
}

// Les dépôts du compte, lus sur GitHub : la dernière lecture demandée l'emporte ; ratée, l'écran le dit et offre de relire.
async function lireLesDepotsDeLAjout() {
  const demandee = ++lectureDesDepotsDeLAjout;
  delete etatDeLAjout.depots;
  if (ajoute) poserLAjout();
  /** @type {NonNullable<import("./parcours-projet/ajout.js").EtatDeLAjout["depots"]>} */
  let lus;
  try {
    lus = (await brigade.depotsDuChef()) ?? { refus: "the app gave no answer" };
  } catch (erreur) {
    lus = { refus: erreur instanceof Error ? erreur.message : String(erreur) };
  }
  if (demandee !== lectureDesDepotsDeLAjout) return;
  etatDeLAjout.depots = lus;
  if (ajoute) poserLAjout();
}

// Un dépôt choisi : le projet porte son nom, en minuscules, comme au premier lancement, et sa branche d'intégration est
// celle que GitHub donne.
/** @param {{ depot: string, base: string }} choisi */
function choisirLeDepot(choisi) {
  delete etatDeLAjout.refus;
  const lu = lireLeProjet("", choisi.depot);
  if ("refus" in lu) {
    etatDeLAjout.refus = lu.refus;
    return poserLAjout();
  }
  // Le projet ouvert, sa page dit ce qui reste à faire avant qu'il soit prêt (ticket 3166) — quand sa première lecture
  // dit que le compte peut écrire dans son dépôt. Une ouverture ratée n'a rien à guider.
  aGuider.set(lu.nom, lu.depot);
  void ouvrirDUneStation("", lu.nom, lu.depot, choisi.base).then(() => {
    if (premier.ouverture?.echec !== undefined && premier.ouverture.projet === lu.nom) aGuider.delete(lu.nom);
    // Le projet était déjà lu — dans le fichier avant d'être choisi : sa lecture tenue décide sans attendre la suivante.
    else suivreLeParcours(lu.nom);
  });
}

// Un dépôt collé — lien GitHub ou `owner/name`, public et pas au chef compris — : lu sur GitHub, puis ouvert ; ce qui
// n'en est pas un, ou que GitHub ne rend pas, se dit sous le champ.
/** @param {string} texte */
async function collerUnDepot(texte) {
  const nom = depotCollePar(texte);
  delete etatDeLAjout.refus;
  if (nom === null) {
    etatDeLAjout.refus = PAS_UN_DEPOT;
    return poserLAjout();
  }
  /** @type {{ depot: string, base: string } | { refus: string }} */
  let resolu;
  try {
    resolu = (await brigade.lireUnDepot(nom)) ?? { refus: `${nom} could not be read on GitHub: the app gave no answer.` };
  } catch (erreur) {
    resolu = { refus: `${nom} could not be read on GitHub: ${erreur instanceof Error ? erreur.message : String(erreur)}.` };
  }
  if ("refus" in resolu) {
    etatDeLAjout.refus = resolu.refus;
    return poserLAjout();
  }
  etatDeLAjout.saisie.colle = "";
  choisirLeDepot(resolu);
}

// Le rail qu'une station publie sur GitHub pour un projet qu'aucune station connue ne sert ici (ticket 1435,
// rail-publie.js), lu par le runtime à l'ouverture de l'espace, et relu d'un bouton — ou après une connexion à GitHub :
// il dit pourquoi le tableau de la cuisine ne se lit pas encore (ticket 2076). Ce qui en est tenu est en tête du fichier
// (`railsPublies`).

/** @param {Projet} projet */
async function lireLeRailPublie(projet) {
  const demandee = (lecturesPubliees.get(projet.nom) ?? 0) + 1;
  lecturesPubliees.set(projet.nom, demandee);
  railsPublies.set(projet.nom, {});
  if (courant?.nom === projet.nom) poserRail(projet);
  /** @type {import("./rail-publie.js").EtatDuRailPublie & { sansReponse?: true }} */
  let lu;
  try {
    const rendu = await brigade.railDuProjet?.(projet.nom);
    lu = rendu === undefined ? { sansReponse: true } : { lu: rendu };
  } catch (erreur) {
    const detail = erreur instanceof Error ? erreur.message : String(erreur);
    lu = { lu: { state: "unavailable", project: projet.nom, cause: "unreadable", reason: `The rail of ${projet.nom} could not be read: the app failed while reading it.`, detail } };
  }
  if (lecturesPubliees.get(projet.nom) !== demandee) return;
  railsPublies.set(projet.nom, lu);
  if (courant?.nom === projet.nom && !rail.hidden) poserRail(projet);
}

// « read again » : le tableau de la cuisine se relit avec lui, c'est lui qui pose le rail (ticket 2076).
/** @param {Projet} projet */
function relireLeRailPublie(projet) {
  lireLesFaits();
  void lireLeRailPublie(projet);
}

/** @param {Projet} projet @returns {import("./rail-publie.js").GestesDuRailPublie} */
function gestesDuRailPublie(projet) {
  return {
    relire: () => relireLeRailPublie(projet),
    seConnecter: () => void seConnecterAGitHub(),
    ouvrirLaPage: (url) => void brigade.ouvrirLaPage?.(url),
  };
}

/** @param {Projet} projet */
async function ouvrir(projet) {
  courant = projet;
  // Le projet que le premier lancement a ajouté pour la visite (ticket 3165) : son espace s'ouvre sur elle.
  if (visiteAOuvrir === projet.nom) {
    visiteAOuvrir = undefined;
    visite.commencer(projet.nom);
  }
  enregistreesARelire = true;
  stationOuverte = undefined;
  pageDeLApp = undefined;
  if (urgenceChoisie !== projet.nom) urgenceChoisie = "";
  nonEcrit = nonEcritSecond = "";
  gesteRate = undefined;
  // Une confirmation ouverte sur un autre projet ne reste pas ouverte : rien n'en part.
  if (aConfirmer?.projet !== projet.nom) aConfirmer = undefined;
  ajoute = false;
  // Comme le panneau : l'onglet de contenu laissé là est relu tout de suite.
  suivi = undefined;
  marquer();
  // Dès maintenant : la carte et la bannière du projet quitté ne restent pas sur celui-ci
  // pendant que son espace s'ouvre.
  dessiner();
  // Les stations que sa box déclare viennent avec la lecture de son installation (service.ts).
  void lireService(projet);
  // Ni sa ligne de retrait : elle nomme son projet.
  retrait.hidden = true;
  void lireRetrait(projet);
  poserSigle(projet);
  poserCouleurs(projet);
  poserBarreDeMenus();
  void poserOrdinaires(projet);
  void identitesGithub.lire();
  void servis.lire();
  poserLesReglagesDuProjet(projet);
  void lireLesReglages(projet);
  void monterLesHumains(document, element("humains-du-projet"), { projet: projet.nom, service: serviceDuPont(brigade, projet.nom), ouvrir: (url) => void brigade.ouvrirLaProposition(url) });
  void monterLesRecurrents(document, element("recurrents-du-projet"), { projet: projet.nom, service: serviceDesRecurrents(brigade, projet.nom) });
  poserLesExplicationsDuChef(projet.nom);
  void explications.lire(projet.nom);
  void monterLesStations(document, element("stations-contributrices"), { projet: projet.nom, service: serviceDesStations(brigade, projet.nom) });
  brigade.regarder(projet.nom, ++demande);
  if (!seLit(projet) && projet.sansStation !== true) void lireLeRailPublie(projet);
  // Un projet qui ne s'ouvre pas n'a pas de second : sa colonne dit pourquoi.
  if (projet.refus !== undefined) return montrer();
  // Le pont du téléphone n'ouvre aucun terminal : il ne rend rien (ticket 1165).
  const terminaux = (await brigade.espace(projet.nom)) ?? [];
  terminaux.forEach(recevoir);
  // Le chef a pu cliquer ailleurs pendant que l'espace s'ouvrait. Sinon, le terminal montré à
  // droite prend le clavier : le second, ou le shell où le chef l'avait laissé.
  if (courant !== projet) return;
  aFocaliser = aDroite.get(projet.nom) ?? terminaux.find(({ genre }) => genre === "second")?.id;
  montrer();
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
brigade.surProposition?.((projet, proposition) => {
  propositionsDuSecond.recevoir(projet, proposition);
  if (projet === courant?.nom) montrer();
  if (projet === courant?.nom) poserLeProjetAPreparer();
});
brigade.surEtat((terminal) => {
  if (terminal.genre === "shell" && terminal.arrete) {
    // Un shell qui sort ferme son onglet ; s'il était montré, le second reprend sa place à droite.
    oublier(terminal.id);
    if (aDroite.get(terminal.projet) === terminal.id) aDroite.delete(terminal.projet);
  } else {
    recevoir(terminal);
  }
  montrer();
});
// Ce que fait chaque cook d'un projet, à chaque lecture de son tableau (ticket 1846) : la fiche ouverte sur l'un de ses
// tickets suit son cook — reposée seulement si ce qu'elle en dit a changé.
brigade.surActivites((publiees) => {
  const avant = activitesPubliees.get(publiees.projet);
  activitesPubliees.set(publiees.projet, publiees);
  if (ouverte === undefined || ouverte.projet.nom !== publiees.projet) return;
  const { ticket } = ouverte.carte;
  /** @param {import("./activite-du-cook.js").Publiees | undefined} lues */
  const dit = (lues) => {
    if (lues === undefined || "sans" in lues) return JSON.stringify(lues);
    const cook = cookDuTicket(lues, ticket);
    return JSON.stringify(cook === undefined ? null : [lues.lu, cook]);
  };
  if (dit(avant) !== dit(publiees)) poserFiche();
});
// Les faits d'un projet : ils remplacent ceux d'avant, partout où ils se dessinent —
// sa pastille dans la barre, et son espace s'il est affiché — sa ligne de l'accueil vient par `surAccueil`.
// La bande d'alertes d'un projet : posée tout de suite si c'est celui qui est affiché.
brigade.surAlertes(({ projet, alertes, signal, manager: etatDuManager }) => {
  const disjoncteurAvant = JSON.stringify(alerteDuDisjoncteur(projet));
  bandes.set(projet, alertes);
  const disjoncteur = alerteDuDisjoncteur(projet);
  // Le disjoncteur refermé : « Resume » demandé, ou refusé, n'a plus rien à dire.
  if (disjoncteur === undefined) reprises.delete(projet);
  signaux.set(projet, signal);
  marquerSignal(projet);
  // La pastille dit la même chose que la bande, en un mot.
  marquerPastille(projet);
  // Le disjoncteur a changé : sa ligne en tête de « Awaiting you » aussi.
  if (JSON.stringify(disjoncteur) !== disjoncteurAvant) poserLesCartesDuChef();
  const bascule = JSON.stringify(etatsDuManager.get(projet)) !== JSON.stringify(etatDuManager);
  etatsDuManager.set(projet, etatDuManager);
  if (courant?.nom !== projet) return;
  poserAlertes(courant);
  // L'interrupteur a basculé : il le dit aussitôt, et la tête du rail aussi. Le disjoncteur a changé : sa ligne de TODO aussi.
  if (bascule || JSON.stringify(disjoncteur) !== disjoncteurAvant) {
    poserInterrupteur();
    poserRail(courant);
  }
});
// Le chef a cliqué la notification de l'urgence d'un projet : la fenêtre est déjà devant. Le projet
// s'ouvre — s'il ne l'est pas déjà —, la fiche d'un ticket ouverte par-dessus se referme, et la ligne
// d'urgence, en tête de la bande, est marquée choisie : son geste prend le clavier, prêt à trancher.
brigade.surUrgence(async (nom) => {
  const projet = configuration.projets.find((candidat) => candidat.nom === nom);
  if (projet === undefined) return;
  urgenceChoisie = nom;
  if (courant?.nom !== nom) await ouvrir(projet);
  // Le chef a pu cliquer ailleurs pendant que l'espace s'ouvrait.
  if (courant?.nom !== nom) return;
  if (ouverte !== undefined) fermerFiche();
  poserAlertes(courant);
  gesteDeLUrgence?.focus();
});
// L'installation d'un projet a été relue : les stations que sa box déclare se reposent, si c'est le projet affiché.
brigade.surGuide(retenirDeclarees);
// Ce qui n'est pas encore sur le rail d'un projet : le sien se repose, s'il est affiché.
brigade.surAmont((vu) => {
  amonts.set(vu.projet, vu);
  if (courant?.nom === vu.projet && !rail.hidden && tenus.has(vu.projet)) poserRail(courant);
});
// Un essai a changé, ou la déclaration du projet : elle est relue (essai.ts).
brigade.surEssais?.((nom) => {
  const projet = configuration.projets.find((candidat) => candidat.nom === nom);
  if (projet !== undefined) void lireLesEssais(projet);
});
brigade.surFaits((recue) => {
  if (recue.demande !== demandeFaits) return;
  enLecture.delete(recue.projet);
  // Une box pas jointe n'efface pas le rail : la dernière lecture reste, marquée (poserRail).
  const muette = !("tableau" in recue) && "atteinte" in recue && !recue.atteinte;
  if (muette) muets.set(recue.projet, muets.get(recue.projet) ?? recue.a);
  else muets.delete(recue.projet);
  // Hors ligne, de même : le dernier rail lu reste, et aucun échec ne prend sa place (ticket 1818).
  const horsLigne = !("tableau" in recue) && "horsLigne" in recue && recue.horsLigne === true;
  if (horsLigne) horsLignes.set(recue.projet, horsLignes.get(recue.projet) ?? recue.a);
  else horsLignes.delete(recue.projet);
  const gardee = tenus.get(recue.projet);
  // Une lecture ratée en ligne — GitHub qui limite les appels, refuse, ne répond pas à temps, une box qui redémarre et
  // publie un tableau illisible — ne vide aucune colonne (ticket 2151) : le dernier rail lu reste, et une ligne dit depuis
  // quand il est périmé, la raison au survol. Sans rail lu avant, elle se dit comme avant.
  const ratee = !("tableau" in recue) && !muette && !horsLigne;
  if ("tableau" in recue) perimes.delete(recue.projet);
  else if (ratee && gardee !== undefined && "tableau" in gardee) perimes.set(recue.projet, { depuis: perimes.get(recue.projet)?.depuis ?? recue.a, raison: raisonDeLEchec(recue) });
  if (horsLigne && (gardee === undefined || !("tableau" in gardee))) tenus.delete(recue.projet);
  else if (!((muette || horsLigne || ratee) && gardee !== undefined && "tableau" in gardee)) tenus.set(recue.projet, recue);
  marquerPastille(recue.projet);
  suivreLeParcours(recue.projet);
  // Le premier ticket du premier projet suit chaque lecture de son rail (ticket 3302).
  if ("tableau" in recue) recitDuPremierTicket.observer(recue.projet, recue.tableau.etapesDesTickets);
  poserLesCartesDuChef();
  // Le détail ouvert d'une carte que cette lecture ne porte plus se ferme ; sinon, il n'est pas reposé : le chef y zoome, ou y tape.
  if (detailOuvert?.projet === recue.projet && laValidation(detailOuvert.projet, detailOuvert.ticket) === undefined) poserLeDetail();
  if (courant?.nom === recue.projet) {
    void lireLesEssais(courant);
    dessiner();
    poserLeRecitDuPremierTicket();
    void poserOrdinaires(courant);
  }
});
// Ce que l'onglet de contenu affiché a rendu : une lecture ratée s'y lit comme
// dans le panneau, et n'en retire rien.
brigade.surContenu((recue) => {
  if (recue.demande !== demandeOnglet) return;
  // La page des coûts lit `station` sur la box de chaque projet : chacune entre dans ses chiffres.
  if (ongletDemande === COUTS) {
    coutsLus.set(recue.projet, recue);
    return poserCout();
  }
  // Celle des ratios lit `closing --json` sur la box de chaque projet : chacune y pose sa ligne, ou n'en a pas.
  if (ongletDemande === RATIOS) {
    ratiosLus.set(recue.projet, recue);
    return poserRatios();
  }
  if (recue.projet !== courant?.nom || courant.sansStation === true) return;
  // Settings ne lit rien.
  if (!reglagesMontres()) rendre(recue, luOnglet, lectureOnglet);
});
// Les clones relus : leur état remplace celui d'avant, dans Settings et sur la case « T ».
brigade.surCode((vu) => {
  codeVu = vu;
  poserCode();
});
// La mise à jour de l'app : son état remplace celui d'avant ; la ligne de tête le suit.
brigade.surMiseAJour((vu) => {
  miseAJourVue = vu;
  bandeauDeVersion.suivre(vu);
});
// Une version plus haute publiée pour ce poste (mise-a-jour/avis.ts) : une ligne en tête de l'app, la version qui tourne
// et la dernière, et où en est la mise à jour de l'app installée (mise-a-jour/etat.ts) — jusqu'à ce que l'app tourne sur
// la dernière. Rien ne l'écarte.
const bandeauDeVersion = tenirBandeau(element("nouvelle-version"), document, { telecharger: (url) => brigade.telechargerVersion(url), installer: () => brigade.installerMiseAJour() });
brigade.surAvisDeVersion((avis) => bandeauDeVersion.recevoir(avis));
void Promise.resolve(brigade.avisDeVersion()).then((avis) => bandeauDeVersion.recevoir(avis), () => undefined);
// Le statut de la station de cet ordinateur : lu au lancement, puis à chaque fois que le pont le relit. Une lecture qui
// échoue le laisse inconnu — la case le dit, sans erreur.
brigade.surStatutDeLaStation?.((statut) => {
  statutDeLaStationVu = statut;
  poserLesVersions();
  poserBlocStation();
});
void Promise.resolve(brigade.statutDeLaStation?.()).then(
  (statut) => {
    statutDeLaStationVu = statut;
    poserLesVersions();
    poserBlocStation();
  },
  () => undefined,
);
// Les stations relues : ce que la page d'une station en montre suit — leurs lignes de l'accueil viennent par `surAccueil`.
brigade.surStations((vu) => {
  stationsVues = vu;
  poserLaDemandeDeStationIci();
  poserLesVersions();
  poserBlocStation();
  if (stationOuverte !== undefined) poserPageDeStation();
  poserChoixDesStations();
  poserStationsDuProjet();
  if (courant !== undefined) poserCuisson(courant);
  // L'onglet Stations dit qui cuit le projet, et l'état de chaque station, d'après ce qu'elles publient (ticket 3195).
  if (courant !== undefined && ongletDe(courant) === STATIONS) poserRail(courant);
});
// L'accueil redit : ses lignes remplacent celles d'avant, s'il est affiché — et l'en-tête de la page d'une station.
brigade.surAccueil((vu) => {
  accueilVu = vu;
  poserStationsDeLAccueil();
  if (courant !== undefined) poserCuisson(courant);
  // Le plafond de chaque station, sur l'onglet Stations (ticket 1292), suit cette lecture.
  if (courant !== undefined && ongletDe(courant) === STATIONS) poserRail(courant);
  if (courant !== undefined || ajoute) return;
  if (stationOuverte === undefined) poserAccueil();
  else poserPageDeStation();
});
// Les projets des stations relus : leurs blocs remplacent ceux d'avant ; le parcours ouvert garde ses choix.
brigade.surProjetsDesStations((vu) => {
  projetsVus = vu;
  poserBlocStation();
  // Le refus levé se relit : s'il est encore publié, il revient. Une phrase sur un refus qui n'est plus publié s'en va.
  for (const [nom, etat] of remedesDesRefus) {
    const refus = vu.projets.find((projet) => projet.nom === nom)?.refus ?? null;
    if (etat.etape === "leve" || (etat.etape === "dit" && refus === null)) remedesDesRefus.delete(nom);
  }
  poserProjets();
  poserChoixDesStations();
  poserStationsDuProjet();
  // La station de ce poste se connaît par cette lecture : la page d'une station ouverte sait si elle est la sienne.
  if (stationOuverte !== undefined && courant === undefined && !ajoute) poserPageDeStation();
  // L'accès au dépôt et le refus de la station : la ligne d'alerte de Rail les dit (ticket 1185). Apparue ou partie,
  // le rail se repose : elle n'y est que quand elle dit quelque chose.
  if (courant !== undefined) {
    const avant = alerteDeCuisine.hidden;
    poserCuisson(courant);
    // La bande du haut du rail suit les temps des tickets que la station publie (ticket 2486).
    const bande = tempsDesBandes.get(courant.nom);
    if (avant !== alerteDeCuisine.hidden || (bande !== undefined && bande !== tempsVuDe(courant))) poserRail(courant);
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
/** @param {DragEvent} evenement */
const glisseIci = (evenement) => glisse !== undefined && evenement.dataTransfer?.types.includes(GLISSE) === true;

/** @param {HTMLElement} entree @param {Projet} projet */
function rendreRangeable(entree, projet) {
  entree.draggable = true;
  entree.addEventListener("dragstart", (evenement) => {
    glisse = { nom: projet.nom, rang: undefined };
    evenement.dataTransfer?.setData(GLISSE, projet.nom);
    if (evenement.dataTransfer) evenement.dataTransfer.effectAllowed = "move";
    entree.classList.toggle("glissee", true);
  });
  entree.addEventListener("dragover", (evenement) => {
    if (glisse === undefined || !glisseIci(evenement)) return;
    const de = configuration.projets.findIndex(({ nom }) => nom === glisse?.nom);
    const vers = configuration.projets.indexOf(projet);
    glisse.rang = de === vers ? undefined : vers;
    marquerDepot(glisse.rang === undefined ? undefined : entree, de > vers ? "avant" : "apres");
  });
  // Lâchée sur elle-même : le clic que le glisser a pris.
  entree.addEventListener("drop", (evenement) => {
    if (!glisseIci(evenement) || glisse?.nom !== projet.nom || glisse.rang !== undefined) return;
    evenement.preventDefault();
    evenement.stopPropagation();
    finirGlisse();
    void ouvrir(projet);
  });
  entree.addEventListener("dragend", finirGlisse);
}

// Le trait qui dit où la case glissée atterrira : sur une seule case à la fois — aucune, quand
// elle survole la sienne ou qu'elle a quitté la barre.
/** @param {HTMLElement | undefined} entree @param {"avant" | "apres"} ou */
function marquerDepot(entree, ou) {
  for (const autre of barre.children) {
    autre.classList.toggle("depot-avant", autre === entree && ou === "avant");
    autre.classList.toggle("depot-apres", autre === entree && ou === "apres");
  }
}

function finirGlisse() {
  glisse = undefined;
  marquerDepot(undefined, "avant");
  for (const entree of barre.children) entree.classList.toggle("glissee", false);
}

// Toute la barre reçoit la case — entre deux cases aussi : c'est le trait posé qui vaut.
barre.addEventListener("dragover", (evenement) => {
  if (!glisseIci(evenement) || evenement.dataTransfer === null) return;
  evenement.preventDefault();
  evenement.dataTransfer.dropEffect = "move";
});
barre.addEventListener("drop", (evenement) => {
  if (glisse === undefined || !glisseIci(evenement)) return;
  evenement.preventDefault();
  const { nom, rang } = glisse;
  finirGlisse();
  if (rang !== undefined) void ranger(nom, rang);
});
// Hors de la barre, le trait s'efface : lâchée là, la case reprend sa place.
barre.addEventListener("dragleave", (evenement) => {
  if (glisse === undefined || barre.contains(/** @type {Node | null} */ (evenement.relatedTarget))) return;
  glisse.rang = undefined;
  marquerDepot(undefined, "avant");
});

// Le projet rangé : le process principal l'écrit dans le fichier des projets, et le nouvel ordre
// revient par `surConfiguration`. Refusé, la barre garde l'ordre du fichier, et la raison se lit
// par-dessus l'écran.
/** @param {string} nom @param {number} rang */
async function ranger(nom, rang) {
  const refus = await brigade.ranger(nom, rang);
  if (refus !== undefined) poserAvis({ titre: `“${nom}” was not moved in the bar`, lignes: [refus] });
}

// Ce que le fichier des projets donne à voir : la barre, puis l'écran d'avant
// s'il existe encore — sinon « Tous les projets », ou l'ajout tant qu'il n'y a aucun projet.
function afficher() {
  relecture.hidden = configuration.nonRelu === undefined;
  relecture.textContent = [
    `${configuration.chemin} changed, and could not be re-read:`,
    `  → ${configuration.nonRelu}`,
    "Your projects are the ones from before, and nothing is closed. The app re-reads it as soon as it changes.",
  ].join("\n");
  // La barre est reposée : les faits d'avant répondaient à une autre liste, ils sont relus.
  // Un rail déjà lu ne se vide jamais (ticket 3337) : sa dernière lecture reste à l'écran pendant la relecture, seuls les
  // projets qui ont quitté la liste perdent la leur. Sans lecture avant, « first read in progress » ne vaut qu'une fois.
  for (const nom of [...tenus.keys()]) if (!configuration.projets.some((projet) => projet.nom === nom)) tenus.delete(nom);
  muets.clear();
  pastilles.clear();
  signalees.clear();
  barre.replaceChildren(
    ...configuration.projets.map((projet) => {
      const entree = icone("", projet.nom, () => void ouvrir(projet));
      // Son sigle, en grand, sur une ligne (sigle.ts) : le survol de la case dit son nom en entier.
      const etiquette = document.createElement("span");
      etiquette.className = "sigle-de-case";
      etiquette.textContent = projet.etiquette;
      entree.append(etiquette);
      rendreRangeable(entree, projet);
      entree.classList.toggle("refuse", projet.refus !== undefined);
      // Sa couleur d'onglet : la case la porte, qu'elle soit choisie ou non.
      const onglet = projet.couleurs?.onglet;
      entree.classList.toggle("teinte", onglet !== undefined);
      if (onglet !== undefined) entree.style.setProperty("--teinte", onglet);
      // Un projet qui ne se lit nulle part n'a pas de pastille : rien n'est lu de lui.
      if (seLit(projet)) {
        const posee = marqueDePastille(document, undefined, { coin: true });
        entree.append(posee);
        pastilles.set(projet.nom, posee);
        marquerPastille(projet.nom);
        marquerSignal(projet.nom);
      }
      return entree;
    }),
  );
  lireLesFaits(false);
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
    return montrer();
  }
  const entree = icone("", "All projects", ouvrirTous);
  entree.id = "entree-tous";
  entree.append(logoDeBrigade());
  const pied = icone("+", AJOUTER_UN_PROJET, ouvrirAjout);
  pied.id = "entree-ajout";
  barre.prepend(entree);
  barre.append(pied);
  // Rejouer la visite (ticket 3165), sous « + » : finie ou passée, elle repart de sa première étape. Le téléphone n'a pas
  // de visite ; sans projet, elle n'a rien à montrer.
  if (telephone === undefined && configuration.projets.length > 0) {
    const tour = icone("?", REJOUER, rejouerLaVisite);
    tour.id = "entree-visite";
    barre.append(tour);
  }
  // La case du logo est neuve : ce que la dernière lecture des clones en dit y est reposé.
  poserCode();

  const meme = configuration.projets.find((projet) => projet.nom === courant?.nom);
  // Le projet ouvert du premier lancement, arrivé dans le fichier après sa réponse.
  const attendu = premierAOuvrir === undefined ? undefined : projetDe(premierAOuvrir);
  if (attendu !== undefined) premierAOuvrir = undefined;
  if (attendu !== undefined) void ouvrir(attendu);
  else if (meme !== undefined) void ouvrir(meme);
  else if (stationOuverte !== undefined && !ajoute) ouvrirStation(stationOuverte);
  else if (pageDeLApp === COUTS && !ajoute) ouvrirCouts();
  else if (pageDeLApp === RATIOS && !ajoute) ouvrirRatios();
  else if (pageDeLApp === RESUMES && !ajoute) ouvrirResumes();
  // Sur un ordinateur neuf, sans projet : ses stations et leurs projets (premier-lancement.js). Sur le téléphone,
  // aucun projet ne s'ajoute d'un dossier : sans projet, l'app reste sur « Tous les projets ».
  else if (ajoute || (configuration.projets.length === 0 && telephone === undefined && !avecPremier())) ouvrirAjout();
  else if (avecPremier()) ouvrirPremier();
  // L'app s'ouvre sur « Tous les projets », en tête de la barre.
  else ouvrirTous();
  montrer();
}

const demarrage = await brigade.demarrage();
// Ce que les seconds proposaient déjà quand la vue s'est ouverte ; ce qui est arrivé depuis, par `surProposition`, est plus récent.
propositionsDuSecond.recevoirToutes((await brigade.propositionsDuSecond?.()) ?? {});
POSTE = demarrage.poste ?? POSTE;
const exemple = demarrage.exemple;
PALETTE = demarrage.palette;
ONGLETS = demarrage.onglets;
RUBRIQUES = demarrage.rubriques;
ALLUMAGE = demarrage.gestes.allumage;
GESTES_DE_LA_CUISINE = demarrage.gestes.cuisine;
CONFIRMES = demarrage.gestes.confirmes;
GESTES_D_ATTENTE = demarrage.gestes.attente ?? [];
DIRECTS = demarrage.gestes.directs;
BANNIERE = demarrage.banniere;
// Une lecture arrivée pendant le démarrage est plus récente que celle qu'il rend.
codeVu ??= demarrage.code;
stationsVues ??= demarrage.stations;
projetsVus ??= demarrage.projetsDesStations;
accueilVu ??= demarrage.accueil;
miseAJourVue ??= demarrage.miseAJour;
bandeauDeVersion.suivre(miseAJourVue);
CALIBRAGE_DU_PROJET = demarrage.calibrage;
let configuration = demarrage.configuration;
// Le téléphone (l'app Android) : ce que le pont en garde — rien sur le desktop. Pas encore connecté à GitHub (le ticket
// 2500), l'app s'ouvre sur l'écran qui l'y connecte, et le reste de l'app est caché derrière ; connecté, elle passe à
// « Tous les projets », où une ligne dit sous quel compte (connexion-github.js).
const telephone = demarrage.telephone;
telephoneVu = telephone;
brigade.surTelephone?.((vu) => {
  telephoneVu = vu;
  if (courant === undefined && !ajoute && stationOuverte === undefined) poserAccueil();
});
// Le chef touche la notification d'une carte de TODO (le ticket 2747) : le projet s'ouvre, puis la fiche de la carte.
brigade.surOuvrirCarte?.((nom, ticket) => void ouvrirTicketDepuisLesCouts(nom, ticket));
// GitHub refuse la connexion de ce téléphone : elle est effacée, et l'app se rouvre sur la connexion à GitHub.
async function oublierLeTelephone() {
  await brigade.oublierLeTelephone?.();
  location.reload();
}
const connexionDuTelephone = element("connexion-github");
const cadreDeLApp = element("cadre");
if (telephone !== undefined && telephone.github === undefined) {
  cadreDeLApp.hidden = true;
  connexionDuTelephone.hidden = false;
  tenirConnexionGitHub(connexionDuTelephone, document, {
    pont: brigade,
    apres: (compte) => {
      telephoneVu = { github: { compte } };
      connexionDuTelephone.className = "fait";
      connexionDuTelephone.replaceChildren(poserConnecte(document, compte));
      cadreDeLApp.hidden = false;
      ouvrirTous();
      montrer();
    },
  });
} else if (telephone !== undefined && telephone.github !== undefined) {
  connexionDuTelephone.hidden = false;
  connexionDuTelephone.className = "fait";
  connexionDuTelephone.replaceChildren(poserConnecte(document, telephone.github.compte));
}
// Le terminal mesure ses cases à l'ouverture : sa police, embarquée, est chargée avant qu'aucun
// ne s'ouvre. Si elle ne se charge pas, l'app s'ouvre quand même, sur la police de repli.
await Promise.all(["13px", "bold 13px"].map((corps) => document.fonts.load(`${corps} ${jeton("--police-mono")}`))).catch(() => undefined);
await retrouverLesTerminaux();
reprendreLEcran();
afficher();
// Posée une fois la première liste rendue : ce qui change ensuite la remplace.
brigade.surConfiguration((recue, partis) => {
  // Un projet qui a quitté la liste, ou changé de dossier, a perdu ses terminaux.
  for (const id of partis) {
    oublier(id);
    for (const [projet, shell] of aDroite) if (shell === id) aDroite.delete(projet);
  }
  configuration = recue;
  // Un projet ajouté ou retiré a sa ligne parmi les projets servis, ou ne l'a plus.
  if (servis.etat !== undefined) poserLesProjetsServisIci();
  afficher();
});
