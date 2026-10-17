// @ts-check
// La vue : elle montre, elle ne tient rien. Les pty vivent dans le process
// principal ; ici, un xterm par terminal, gardé tant que l'app est ouverte —
// changer d'espace ou d'onglet ne fait que cacher l'un et montrer l'autre.
// Au centre de l'espace, le rail : c'est la vue principale, en six colonnes. Chaque carte y
// tient en deux lignes — une phrase qui dit ce qui se passe, un signal s'il faut l'attention — ;
// ce que la file dit du ticket en plus (qui le tient, depuis quand, son bail) est dans sa fiche. En haut, les onglets de pages — Rail, Cooks,
// Manager, Grants, Log : chacune la sortie d'une commande, lue tant qu'elle est affichée — ; une
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
// confirmation.ts, demande.ts) : la vue nomme un geste, jamais une commande. Restent deux boutons,
// dans leur onglet, qui écrivent dans le second une commande à compléter — une durée, un nombre —
// sans l'envoyer (boutons.ts). La vue n'y lit rien —
// elle ne sait pas ce qu'est un ticket. Ce qui attend le chef lui arrive déjà
// mis à part (attend.ts) : elle le pose en tête, quel que soit l'onglet.
// Dans l'onglet Manager, l'état du manager se pose au-dessus du texte — allumé ou éteint,
// depuis quand et par qui, ses dernières décisions, ce qu'il a écarté et pourquoi —, déjà lu
// par le process principal (manager.ts). À côté, ses deux gestes : éteindre, direct ; allumer,
// confirmé — sa confirmation dit l'avertissement de la doc et deux nombres, les issues ouvertes et
// celles qui portent `blocked-on-human`, demandés à la box dès qu'elle s'ouvre (allumage.ts).
// Dans l'onglet Grants, de même, l'état des grants : lequel est actif, son échéance — la durée
// restante en tête, l'heure ensuite —, ses derniers usages, et ce qu'aucun grant n'autorise,
// déjà lus par le process principal (grants.ts). À côté de chaque grant, ses deux gestes,
// accorder et révoquer, confirmés : chacun dit ce que le grant change avant de partir.
// La barre est faite d'icônes : « Tous les projets » en tête — l'accueil, la vue d'ensemble de
// brigade : une ligne par projet, une par station, et la ligne de santé, dites par le process
// principal (accueil.ts) ; on n'y agit pas, un clic sur une ligne ouvre sa page —, un monogramme par projet, et
// en pied le « + » : l'écran d'ajout, où un projet s'installe sur sa box et se déclare
// dans l'app d'un seul geste. Ce qui manque à un champ, ce qui part vers la box et ce
// qu'elle en a rendu se décident dans le process principal (installation.ts) : la vue
// recueille, signale le champ qu'on lui nomme, et pose ce qu'on lui rend.
// Après l'ajout, l'installation guidée — toutes ses étapes, celle qui attend le chef, ce
// qu'il aura à faire lui-même annoncé d'emblée, un bouton ou une réponse par geste — se
// suit dans l'espace du projet, en tête de Paramètres : ce qui s'y dit, ce qui s'y refuse
// et ce qui part vers la box se décident de même hors d'ici (service.ts).
// Dessous, « Retirer ce projet » : deux gestes, chacun sous son libellé — le retirer de
// l'app, qui n'envoie rien à sa box ; le désinstaller de sa box, qui montre d'abord le
// plan qu'elle rend, et ne part qu'une fois son nom écrit. Là encore la vue pose : ce qui
// se refuse, ce qui part et ce qui s'en dit se décident dans retrait.ts.
// Et, sur la carte de chaque ticket dont `status` montre un serveur, l'écran à regarder — la phrase
// du cook, et la mention quand l'écran est déduit plutôt que déclaré — puis sa page : un geste
// direct, qui ouvre l'écran dans le navigateur du poste, posé seulement s'il y a une page à voir —
// ou ce qui se lit à sa place. Une app qui ne s'ouvre pas dans un navigateur n'a pas de geste : sa
// carte dit comment voir l'écran. Sous l'état, ce qui
// empêche les pages d'être servies. La vue ne montre aucune page et ne recueille aucun avis ;
// quel port, quelle adresse, et pourquoi pas, se décident dans page.ts.
// En tête de l'espace, la bande d'alertes : est-ce que ça peut tourner ? La cuisine, le grant —
// une alerte par chose à faire, et
// une ligne « non vérifié » pour chaque état que la box ne dit pas. Vide, elle ne prend aucune
// place. Ce qui s'y dit et ce que son bouton appelle se décident dans alertes.ts : la vue pose.
// Chaque alerte tient en une ligne — ce qui ne va pas — et un contrôle — son geste (ticket 907) :
// confirmé — reprendre —, ou une demande au second quand il faut lire, juger ou agir sur la box ;
// une ligne « non vérifié » mène à l'onglet qui lit l'état. Le prix n'est jamais posé à côté : le
// clic ouvre la confirmation, qui le dit. Ce que la box en écrit est derrière « detail ». Le manager
// et le grant `merge` n'y font pas de ligne : ce sont des interrupteurs, en tête de l'espace, à
// droite des onglets — allumé ou éteint, un clic le bascule —, et, le manager éteint, la tête du
// rail est marquée à l'arrêt (tickets 906, 907).
// Arrêter la cuisine est sur le rail, qu'il arrête ; vérifier l'installation, en tête de l'espace,
// à côté du nom du projet.
// En tête de Paramètres, et au survol de « T », le code de l'app lui-même : à jour, ou en retard sur
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
import { boutonAction, confirmationDeGeste, lectureIndisponible, prixDit, survol } from "./briques.js";
import { poserChers } from "./cost/chers.js";
import { poserCourbe } from "./cost/courbe.js";
import { poserTete } from "./cost/tete.js";

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
/** @typedef {import("../page.ts").Pages} Pages */
/** @typedef {import("../manager.ts").Vu} VuDuManager */
/** @typedef {import("../grants.ts").Vu} VuDesGrants */
// Ce que `onglets.ts` nomme : le journal, et l'onglet Paramètres, qui n'a pas de commande à lui.
const JOURNAL = "log";
const PARAMETRES = "parametres";
// Et la lecture que l'onglet Cost ouvre : `station`, sur la box de chaque projet.
const COUT = "cooks";
/** @typedef {import("../allumage.ts").Compte} Compte */
/** @typedef {import("../confirmation.ts").Confirmation} Confirmation */
/** @typedef {import("../service.ts").Guide} Guide */
/** @typedef {import("../retrait.ts").Retrait} Retrait */
/** @typedef {import("../retard.ts").Vu} VuDuCode */

const brigade = window.brigade;

// Le geste de poste d'un projet, tel que les boutons l'écrivent (boutons.ts) :
// `ssh <hote> brigade <nom> <commande>`, avec son hôte et son nom — ce qui
// s'affiche se recopie. Le renderer ne charge pas boutons.ts : les deux citations
// y sont reprises, au mot près. Un projet sans box n'a pas d'hôte : le geste
// générique reste, c'est ce que son panneau dit qu'il manque.
/** @param {string} texte */
const mot = (texte) => (/^[A-Za-z0-9@._:-]+$/.test(texte) ? texte : `'${texte.replaceAll("'", `'\\''`)}'`);
/** @param {string} nom */
const cite = (nom) => (/^[a-z0-9-]+$/.test(nom) ? nom : `'${nom.replaceAll("'", `'\\''`)}'`);
/** @param {Projet} projet @param {string} commande */
const geste = (projet, commande) => `ssh ${projet.box === undefined ? "<hote>" : mot(projet.box.hote)} brigade ${mot(cite(projet.nom))} ${commande}`;
// Le geste que faits.ts écrit, n'ayant pas le projet : la vue le pose sur le sien.
/** @param {Projet} projet @param {string} texte */
const surMesure = (projet, texte) => texte.replaceAll("ssh <hote> brigade <nom> ", `${geste(projet, "")}`);
/** @param {string} nom */
const projetDe = (nom) => configuration.projets.find((projet) => projet.nom === nom);

/** @template {HTMLElement} T @param {string} id @returns {T} */
const element = (id) => /** @type {T} */ (document.getElementById(id));
const barre = element("projets");
const tous = element("tous");
const principal = /** @type {HTMLElement} */ (document.querySelector("main"));
const bande = element("alertes");
const arret = element("arret");
const espace = element("espace");
const onglets = element("onglets");
const contenu = element("contenu");
const rail = element("rail");
const fiche = element("fiche");
const manager = element("manager");
const grants = element("grants");
const cout = element("cout");
const luOnglet = element("lu-onglet");
const lectureOnglet = element("lecture-onglet");
const gestesOnglet = element("gestes-onglet");
const gestesProjet = element("gestes-projet");
const interrupteurManager = element("interrupteur-manager");
const interrupteurMerge = element("interrupteur-merge");
const provenance = /** @type {HTMLDetailsElement} */ (element("provenance"));
const provenanceLignes = element("provenance-lignes");
const arreterCuisine = element("arreter-cuisine");
const pages = element("pages");
const note = element("note");
const ongletsTerminaux = element("terminaux");
const fermerShell = element("fermer-shell");
const listeMachines = element("machines");
const colonneSecond = element("second");
const noteSecond = element("note-second");
const fil = element("fil");
const bandeau = element("bandeau");
const message = element("message");
const etat = element("etat");
const parametresOnglets = element("parametres-onglets");
const journal = element("journal");
const service = /** @type {HTMLDetailsElement} */ (element("service"));
const serviceTitre = element("service-titre");
const serviceTete = element("service-tete");
const verificationEtat = element("verification-etat");
const serviceEtapes = element("service-etapes");
const retrait = /** @type {HTMLDetailsElement} */ (element("retrait"));
const retraitTitre = element("retrait-titre");
const retraitGestes = element("retrait-gestes");
const couleurs = element("couleurs");
const ordinaires = element("ordinaires");
const avis = element("avis");
const carte = element("carte");
const lu = element("lu");
const lecture = element("lecture");
const ajout = element("ajout");
const formulaire = /** @type {HTMLFormElement} */ (element("formulaire"));
const ou = element("ou");
const choisi = element("choisi");
const nom = /** @type {HTMLInputElement} */ (element("nom"));
const depot = /** @type {HTMLInputElement} */ (element("depot"));
const hote = /** @type {HTMLSelectElement} */ (element("hote"));
const box = /** @type {HTMLInputElement} */ (element("box"));
const sauvegardes = /** @type {HTMLInputElement} */ (element("sauvegardes"));
const envoi = /** @type {HTMLButtonElement} */ (element("installer"));
const issueAjout = element("issue-ajout");
// Les quatre listes du calibrage, par le nom de leur champ.
const CALIBRAGE = /** @type {const} */ (["manager-modele", "manager-effort", "reviewer-modele", "reviewer-effort"]);
/** @param {typeof CALIBRAGE[number]} champ */
const calibre = (champ) => /** @type {HTMLSelectElement} */ (element(champ));
const relecture = element("relecture");
// Dans Paramètres, le retard du code de l'app, et des clones de brigade — la case « T » le dit aussi, au survol.
const code = document.createElement("section");
code.id = "code";
code.ariaLive = "polite";
etat.prepend(code);
// L'accueil, « Tous les projets » : la vue d'ensemble de brigade (accueil.ts). Une liste des projets,
// une des stations — une ligne chacun, un clic ouvre sa page —, et en bas la ligne de santé. On n'y
// agit pas : seul « + station » y ouvre le champ où le chef tape le code qu'une station neuve affiche.
const projetsDeLAccueil = document.createElement("section");
projetsDeLAccueil.id = "accueil-projets";
projetsDeLAccueil.className = "liste";
projetsDeLAccueil.ariaLabel = "Projects";
const stationsDeLAccueil = document.createElement("section");
stationsDeLAccueil.id = "accueil-stations";
stationsDeLAccueil.className = "liste";
stationsDeLAccueil.ariaLabel = "Stations";
const listeDesStations = document.createElement("div");
listeDesStations.ariaLive = "polite";
// « + station », sous la liste : le champ du code s'ouvre dessous, et nulle part ailleurs. Il est posé
// une fois : une relecture ne vide pas ce que le chef tape.
const ouvrirLAppairage = /** @type {HTMLButtonElement} */ (bloc("button", "+ station"));
ouvrirLAppairage.type = "button";
ouvrirLAppairage.className = "ajout-de-station";
const formulaireDAppairage = document.createElement("form");
formulaireDAppairage.hidden = true;
const codeTape = document.createElement("input");
codeTape.placeholder = "the code a new station shows, like 7KQ2-M9XD";
codeTape.ariaLabel = "pairing code";
codeTape.autocomplete = "off";
codeTape.spellcheck = false;
const appairage = document.createElement("button");
appairage.type = "submit";
appairage.textContent = "pair";
const renoncerAppairage = /** @type {HTMLButtonElement} */ (bloc("button", "cancel"));
renoncerAppairage.type = "button";
const appairageDit = document.createElement("p");
appairageDit.ariaLive = "polite";
formulaireDAppairage.append(codeTape, appairage, renoncerAppairage, appairageDit);
stationsDeLAccueil.append(listeDesStations, ouvrirLAppairage, formulaireDAppairage);
const santeDeLAccueil = document.createElement("p");
santeDeLAccueil.id = "sante";
santeDeLAccueil.ariaLive = "polite";
// La page d'une station, ouverte d'un clic sur sa ligne : son état, ses pannes et leur bouton, tous
// les projets qu'elle porte, et le parcours « add a project » — le dépôt, ses stations, sa
// principale — le serveur proposé d'office —, ses décisions, et valider. Rien ne s'y tape au terminal.
const pageDeStation = document.createElement("section");
pageDeStation.id = "station";
pageDeStation.className = "carte";
const enTeteDeStation = document.createElement("header");
const pannesDeStation = document.createElement("div");
pannesDeStation.ariaLive = "polite";
const listeDesProjets = document.createElement("div");
listeDesProjets.ariaLive = "polite";
const ouvrirLeParcours = /** @type {HTMLButtonElement} */ (bloc("button", "+ add a project"));
ouvrirLeParcours.className = "ajout-de-projet";
const formulaireDAjout = document.createElement("form");
formulaireDAjout.hidden = true;
const depotChoisi = /** @type {HTMLSelectElement} */ (document.createElement("select"));
depotChoisi.ariaLabel = "repository";
const baseChoisie = document.createElement("input");
baseChoisie.ariaLabel = "integration branch";
baseChoisie.placeholder = "integration branch";
baseChoisie.spellcheck = false;
const choixDesStations = document.createElement("div");
const avertissementDeLaPrincipale = document.createElement("p");
avertissementDeLaPrincipale.ariaLive = "polite";
const cooksChoisis = document.createElement("input");
cooksChoisis.type = "number";
cooksChoisis.ariaLabel = "cooks at once";
cooksChoisis.placeholder = "cooks at once, on its main station";
/** @type {Record<"manager-modele" | "manager-effort" | "reviewer-modele" | "reviewer-effort", HTMLSelectElement>} */
const calibrageDuProjet = {
  "manager-modele": /** @type {HTMLSelectElement} */ (document.createElement("select")),
  "manager-effort": /** @type {HTMLSelectElement} */ (document.createElement("select")),
  "reviewer-modele": /** @type {HTMLSelectElement} */ (document.createElement("select")),
  "reviewer-effort": /** @type {HTMLSelectElement} */ (document.createElement("select")),
};
for (const [champ, liste] of Object.entries(calibrageDuProjet)) liste.ariaLabel = champ.replace("-modele", " model").replace("-effort", " effort");
const validerAjout = /** @type {HTMLButtonElement} */ (bloc("button", "add"));
validerAjout.type = "submit";
const annulerAjout = /** @type {HTMLButtonElement} */ (bloc("button", "cancel"));
annulerAjout.type = "button";
const ajoutRefuse = document.createElement("div");
ajoutRefuse.ariaLive = "polite";
const ajoutDit = document.createElement("p");
ajoutDit.ariaLive = "polite";
formulaireDAjout.append(
  depotChoisi,
  baseChoisie,
  choixDesStations,
  avertissementDeLaPrincipale,
  cooksChoisis,
  ...Object.values(calibrageDuProjet),
  validerAjout,
  annulerAjout,
  ajoutRefuse,
);
const retourALAccueil = /** @type {HTMLButtonElement} */ (bloc("button", "‹ All projects"));
retourALAccueil.type = "button";
retourALAccueil.className = "retour";
// La ligne de mise à jour, sous l'en-tête ; et, au bas de la page, « remove the station » et sa confirmation.
const versionDeStation = document.createElement("p");
versionDeStation.className = "version-de-station";
const retraitDeStation = document.createElement("div");
retraitDeStation.className = "retrait-de-station";
pageDeStation.append(retourALAccueil, enTeteDeStation, versionDeStation, pannesDeStation, bloc("h3", "Projects"), listeDesProjets, ouvrirLeParcours, formulaireDAjout, ajoutDit, retraitDeStation);

/** @type {Map<number, { terminal: Terminal, xterm: Xterm, ajuste: FitAddon, cadre: HTMLDivElement }>} */
const vues = new Map();
// La page où chaque projet a été laissé : on y revient. Aucune : le rail a le centre.
/** @type {Map<string, string>} */
const laisse = new Map();
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
let ajoute = false;
// Le dossier choisi pour le projet à ajouter, et le dépôt que l'app y a lu.
let dossier = "";
let depotLu = "";
// La dernière demande de lecture : une par écran affiché, et seules ses lectures s'affichent.
let demande = 0;
// L'onglet de contenu dont la commande est lue, et sa demande. Indéfini : à relire.
/** @type {string | undefined} */
let suivi = "";
let demandeOnglet = 0;
// L'onglet que cette demande lit. Celle de Cost lit la box de chaque projet.
/** @type {string | undefined} */
let ongletDemande;
// Le dernier `station` lu de chaque projet pour l'onglet Cost — ou ce qui a été obtenu à sa place.
/** @type {Map<string, Lecture>} */
const coutsLus = new Map();
// Les onglets de contenu, dits par le process principal au démarrage (onglets.ts).
/** @type {readonly import("../onglets.ts").Onglet[]} */
let ONGLETS = [];
// Les couleurs qu'un projet peut prendre, dites de même (couleurs.ts) : un nom, une valeur.
/** @type {readonly { nom: string, valeur: string }[]} */
let PALETTE = [];
// Les deux onglets de l'écran principal et les lectures qu'ils rangent, dits de même.
/** @type {readonly import("../onglets.ts").Rubrique[]} */
let RUBRIQUES = [];
// L'onglet qui range ce qui est affiché : une lecture, ou Paramètres lui-même. Le journal n'en a pas.
/** @param {number | string | undefined} id */
const rubriqueDe = (id) => RUBRIQUES.find(({ lectures }) => lectures.includes(/** @type {string} */ (id)));
// Les boutons d'action, dits de même (boutons.ts) : la vue les pose, elle ne sait pas ce qu'ils écrivent.
/** @type {readonly import("../boutons.ts").Bouton[]} */
let BOUTONS = [];
// Les deux gestes du manager, dits de même (manager.ts) : la vue les nomme, elle ne sait pas ce qu'ils écrivent.
/** @type {readonly { id: string, libelle: string }[]} */
let GESTES_DU_MANAGER = [];
// Ce qu'engage l'allumage du manager, dit de même (allumage.ts) : la lecture qui le chiffre, et ce qui se pose avant elle.
/** @type {typeof import("../allumage.ts").ALLUMAGE | undefined} */
let ALLUMAGE;
// La confirmation ouverte : celle d'un geste, pour un projet, à un endroit — la même ne s'ouvre
// qu'une fois, sous le bouton cliqué. `rendu` : ce qu'elle dit, ou pourquoi le geste ne s'offre
// pas — absent, la demande est en route. `compte` : ce que la box a compté pour « allumer » —
// absent, en cours ; nul, pas demandé. Indéfinie : aucune n'est ouverte, et rien ne part.
/** @type {{ projet: string, cle: string, rendu?: Confirmation | { refus: string }, compte?: Compte | null } | undefined} */
let aConfirmer;
// Ce que la dernière lecture de l'onglet Manager donne à poser. Indéfini : pas encore lu depuis
// que l'onglet est affiché — rien ne reste de ce qui s'y lisait avant.
/** @type {VuDuManager | undefined} */
let managerVu;
// Les trois gestes de la cuisine et de l'installation, dits de même (cuisine.ts) : leurs libellés.
// Arrêter se pose sur le rail ; reprendre, sur ce qui dit la cuisine à l'arrêt ; vérifier l'installation, en tête de l'espace.
/** @type {readonly { id: string, libelle: string }[]} */
let GESTES_DE_LA_CUISINE = [];
// Les deux gestes d'un grant, dits de même (grants.ts), et les grants que la doc nomme (gestes.ts) :
// sans état lu, c'est pour ceux-là que les gestes restent offerts.
/** @type {readonly { id: string, libelle: string }[]} */
let GESTES_DES_GRANTS = [];
/** @type {readonly string[]} */
let GRANTS_NOMMES = [];
// Les trois gestes de WAITING, dits de même (attente.ts) : « waiting for… » sur une carte de TODO,
// « resume » et « it arrived » sur une carte de WAITING. La vue les nomme, elle ne sait pas ce qu'ils écrivent.
/** @type {readonly { id: string, libelle: string }[]} */
let GESTES_D_ATTENTE = [];
// Le formulaire « waiting for… » ouvert sur une carte, par projet et ticket : ce que le chef y a
// rempli, et pourquoi rien n'est parti quand c'est le cas. Le rail se redessine à chaque lecture :
// le formulaire y revient tel que le chef l'a laissé. Absent : la carte porte son bouton.
/** @type {Map<string, { quoi: string, qui: string, relance: string, refus?: string }>} */
const formulairesDAttente = new Map();
// Les gestes directs, et les confirmés, dits de même (gestes.ts) : le clic d'un direct fait partir
// sa commande dans le second — ou dit pourquoi elle ne part pas ; celui d'un confirmé ouvre sa
// confirmation, et rien ne part avant son « oui ». La vue ne le décide pas.
/** @type {readonly string[]} */
let DIRECTS = [];
/** @type {readonly string[]} */
let CONFIRMES = [];
// Ce que la dernière lecture de l'onglet Grants donne à poser. Indéfini : pas encore lu depuis
// que l'onglet est affiché — rien ne reste de ce qui s'y lisait avant, ni la durée qui restait.
/** @type {VuDesGrants | undefined} */
let grantsVus;
// Pourquoi le dernier bouton cliqué n'a rien fait : dit sous les onglets de pages, jusqu'au prochain geste —
// ou, quand c'est le second qui n'a rien reçu, à droite, sous les onglets des terminaux.
let nonEcrit = "";
let nonEcritSecond = "";
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
// La station dont la page est ouverte, par son gist. Aucune : c'est l'accueil — ou un projet.
/** @type {string | undefined} */
let stationOuverte;
// Ce que `faits` a rendu en dernier pour chaque projet, et la demande à laquelle il répond :
// une par barre posée. Sans entrée, le projet n'a pas encore été lu.
/** @type {Map<string, Dessinable>} */
const tenus = new Map();
let demandeFaits = 0;
// La dernière bande d'alertes de chaque projet, telle que le process principal l'a dite (alertes.ts).
/** @type {Map<string, Alerte[]>} */
const bandes = new Map();
// Ce que chaque bande dit de son projet sur sa case de la barre (alertes.ts, `signalDe`), et les
// signaux posés : un seul par case.
/** @type {Map<string, {etat: string, dit: string} | undefined>} */
const signaux = new Map();
// L'état du manager de chaque projet, tel que sa dernière bande l'a dit (alertes.ts, `EtatDuManager`) :
// son interrupteur, en tête de l'espace, et la tête du rail le disent. Sans entrée, il n'est pas encore lu.
/** @type {Map<string, import("../alertes.ts").EtatDuManager | undefined>} */
const etatsDuManager = new Map();
// L'état du grant `merge` de chaque projet, tel que sa dernière bande l'a dit (alertes.ts, `EtatDuGrant`) :
// son interrupteur le dit, à côté de celui du manager (ticket 907). Sans entrée, il n'est pas encore lu.
/** @type {Map<string, import("../alertes.ts").EtatDuGrant | undefined>} */
const etatsDuMerge = new Map();
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
// Les pages servies de chaque projet, telles que sa dernière lecture de `status` les rend (page.ts) :
// chacune se pose sur la carte de son ticket.
/** @type {Map<string, Pages>} */
const pagesServies = new Map();
// Les cartes de Livré dont le chef a déplié les remarques, par projet et ticket : le rail se
// redessine à chaque lecture, et ce qu'il lit ne se replie pas sous ses yeux.
/** @type {Set<string>} */
const remarquesDepliees = new Set();
// Les vérifications dont le chef a déplié le détail — un projet et l'heure de la vérification :
// l'écran reposé ne le replie pas sous ses yeux. Une vérification neuve s'ouvre repliée.
/** @type {Set<string>} */
const verificationsDepliees = new Set();
// Ce qui n'est pas encore sur le rail, par projet, tel que le process principal l'a rangé (amont.ts) :
// la dernière lecture de `manager upstream` du projet affiché.
/** @type {Map<string, import("../amont.ts").Vu>} */
const amonts = new Map();
// Les projets dont le chef a déplié la liste de ce qui est à venir : une lecture neuve ne la replie pas.
/** @type {Set<string>} */
const amontsDeplies = new Set();
// La fiche ouverte par-dessus le rail : son projet, la carte cliquée — telle que la dernière lecture
// la donne —, et son bon, qui reprend le clavier quand elle se ferme. Aucune : le rail est seul.
/** @type {{ projet: Projet, carte: import("../faits.ts").Carte, retour: HTMLElement } | undefined} */
let ouverte;
// La question que pose chaque ticket de T'attend dont la fiche a été ouverte, telle que son issue
// l'écrit (question.ts), par projet et ticket : relue à chaque ouverture. `lue` : absente, la lecture
// est en route. `envoi` : une réponse part — rien d'autre ne part avant qu'elle soit revenue.
// `rendue` : ce qu'il est advenu de la dernière.
/** @type {Map<string, { lue?: import("../question.ts").Lue, envoi?: boolean, rendue?: import("../question.ts").Rendue }>} */
const questions = new Map();
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
// Ce qu'il en est de la dernière demande au second faite depuis le champ de contexte, par
// `<projet>#<ticket>` : en route, partie (la note du terminal), ou ce qui l'a empêchée.
/** @type {Map<string, { envoi: true } | { parti: string } | { refus: string }>} */
const demandesAuSecond = new Map();
// Ce que la fiche dit de la vie du ticket vivant (histoire.ts, `situation`), par `<projet>#<ticket>`.
/** @type {Map<string, import("../histoire.ts").Situation>} */
const situations = new Map();
// Les gestes de la fiche de chaque ticket ouvert, à cet instant (gestes-fiche.ts), par
// `<projet>#<ticket>` : relus à chaque ouverture, et quand la lecture change ce qui les décide.
// Absents de la table, la lecture est en route ; `{ sans }`, ils n'ont pas pu être lus.
/** @type {Map<string, import("../gestes-fiche.ts").Propose[] | { sans: string }>} */
const gestesDeFiches = new Map();
// Ce qu'il est advenu du dernier geste de la fiche qui n'est pas parti, par `<projet>#<ticket>`.
/** @type {Map<string, string>} */
const refusDeFiches = new Map();
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
// Le projet dont l'installation est posée dans le panneau : la reposer ne la replie ni ne la déplie.
let misEnService = "";
// Si elle l'était, dépliée d'elle-même : une installation qui le devient s'ouvre, une fois.
let serviceDeplie = false;
// Celui dont les deux gestes de retrait sont posés : les reposer ne les replie pas, et ne
// perd ni le nom que le chef est en train d'écrire pour confirmer, ni pourquoi il n'a pas été retiré de l'app.
let retraitPose = "";
// Pourquoi la dernière couleur choisie n'a pas été écrite, et pour quel projet — rien, si elle l'a été.
let couleurRefusee = { projet: "", refus: "" };
let confirmation = "";
// Le plan sous lequel ce nom a été écrit, par l'instant où la box l'a rendu : un nom écrit
// devant un plan ne confirme pas le suivant.
let planConfirme = "";
let nonRetire = "";
// Ce que la dernière lecture des clones donne à poser (retard.ts). Indéfini : pas encore lus.
/** @type {VuDuCode | undefined} */
let codeVu;
// Pourquoi la dernière mise à jour demandée n'a pas été écrite, ou pas faite : dit sous les clones, jusqu'à la prochaine.
let nonMisAJour = "";
// L'app se met à jour : son bouton attend qu'elle se relance.
let enPassage = false;
// Ce que la dernière lecture des stations donne à poser (stations/stations.ts). Indéfini : pas encore lues.
/** @type {import("../stations/stations.ts").VuDesStations | undefined} */
let stationsVues;
// Les projets des stations (projets/projets.ts). Indéfini : pas encore lus.
/** @type {import("../projets/projets.ts").VuDesProjets | undefined} */
let projetsVus;
// Le parcours « Add a project », tant qu'il est ouvert : quand il l'a été, les dépôts lus, les
// stations cochées et la principale — une relecture des stations ne les perd pas.
/** @type {{ ouvertLe: string, depots: import("../projets/github.ts").DepotDuChef[], choisies: Set<string>, principale: string, touchee: boolean } | undefined} */
let parcours;
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
    xterm.onData((donnees) => brigade.ecrire(id, donnees));
    // Shift+Entrée : xterm l'envoie comme Entrée (`\r`) et le shell comme `claude` l'exécutent ou
    // l'envoient. Un retour à la ligne, lui, ne part pas : `ESC` + `\r` pour `claude` (son Alt+Entrée),
    // un saut de ligne cité (`^V` `^J`) pour le shell.
    xterm.attachCustomKeyEventHandler((touche) => {
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
    /** @type {Terminal} */
    const terminal = { id, projet: "", genre: "shell", titre: "", note: "", arrete: false };
    tenue = { terminal, xterm, ajuste, cadre };
    vues.set(id, tenue);
  }
  return tenue;
}

const duCourant = () => [...vues.values()].filter(({ terminal }) => terminal.projet === courant?.nom);
const actif = () => (courant === undefined ? undefined : laisse.get(courant.nom));
const secondDuCourant = () => duCourant().find(({ terminal }) => terminal.genre === "second");
// Le terminal montré à droite : le shell que le chef y a laissé, sinon le second.
const montreADroite = () => {
  const shell = courant === undefined ? undefined : aDroite.get(courant.nom);
  return (shell === undefined ? undefined : vues.get(shell)) ?? secondDuCourant();
};

function montrer() {
  const visible = actif();
  const relaye = ONGLETS.find(({ id }) => id === visible);
  const droite = montreADroite();
  // Le second et les shells, à droite : chaque cadre y est posé une fois, et y reste. Un seul est
  // montré — celui que le chef a choisi ; caché, aucun ne perd ce qu'il avait reçu.
  for (const { terminal, cadre } of vues.values()) cadre.hidden = terminal.id !== droite?.terminal.id;

  const ouvrable = courant !== undefined && courant.refus === undefined;
  const terminaux = duCourant().map(({ terminal }) => terminal);
  // En haut, les deux onglets de pages, Coût et Paramètres. Les terminaux n'en sont pas : ils sont à droite.
  espace.textContent = courant?.nom ?? "";
  onglets.replaceChildren(
    ...(courant === undefined
      ? []
      : RUBRIQUES.map(({ titre, id }) => {
          const cree = bouton(titre, () => activerRubrique(id));
          cree.role = "tab";
          cree.ariaSelected = String(rubriqueDe(visible)?.id === id);
          return cree;
        })),
  );
  // À droite, au même niveau : le second, ses shells, et de quoi en ouvrir un. Le second a toujours son onglet.
  const second = secondDuCourant()?.terminal;
  /** @param {string} titre @param {number | undefined} id */
  const terminal = (titre, id) => {
    const cree = bouton(titre, () => montrerADroite(id));
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
          ...(ouvrable ? [bouton("+ shell", ouvrirShell)] : []),
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
      : [bloc("span", "open a shell on"), ...choix.machines.map(({ id, titre }) => bouton(titre, () => void ouvrirSur(choix.projet, id))), bouton("cancel", () => void ((choixDeMachine = undefined), montrer()))]),
  );

  // L'explication d'un onglet relayé n'est pas écrite à plat : une icône d'aide la porte.
  const explication =
    relaye === undefined || courant === undefined || courant.desinstalle !== undefined
      ? ""
      : `${relaye.id === "manager" ? "the manager state, then " : relaye.id === "grants" ? "the grants state, then " : ""}the output of \`${geste(courant, relaye.commande)}\`, as the box returns it${relaye.precision === undefined ? "" : ` (${relaye.precision})`} — re-read on its own every thirty seconds, while this tab is shown`;
  note.replaceChildren(
    ...(nonEcrit !== "" ? [nonEcrit] : relaye !== undefined && courant?.desinstalle !== undefined ? ["nothing is read for this tab: this project is uninstalled from its box"] : explication === "" ? [] : [survol(document, explication)]),
  );
  note.hidden = note.childElementCount === 0 && note.textContent === "";
  const parametres = rubriqueDe(visible)?.id === PARAMETRES;
  // Une page se pose par-dessus le rail : il reste dessous, tel quel, et rien de lui ne se clique au travers.
  contenu.hidden = relaye === undefined && visible !== PARAMETRES;
  rail.inert = !contenu.hidden || !fiche.hidden;
  // Paramètres pose d'abord l'état du projet, puis, au choix, la lecture du manager, des grants, du rail.
  etat.hidden = courant === undefined || visible !== PARAMETRES;
  luOnglet.hidden = relaye === undefined;
  parametresOnglets.hidden = !parametres;
  if (parametres) {
    parametresOnglets.replaceChildren(
      ...[[PARAMETRES, "General"], ...ONGLETS.filter(({ id }) => rubriqueDe(id)?.id === PARAMETRES).map(({ id, titre }) => [id, titre])].map(([id, titre]) => {
        const cree = bouton(/** @type {string} */ (titre), () => void (laisse.set(/** @type {Projet} */ (courant).nom, /** @type {string} */ (id)), nonEcrit = "", montrer()));
        cree.ariaPressed = String(id === visible);
        return cree;
      }),
    );
  }
  // Le journal : un geste, pas un onglet. Le recliquer le referme.
  journal.hidden = courant === undefined || courant.box === undefined;
  journal.ariaPressed = String(visible === JOURNAL);
  // Au centre, seul un fichier des projets illisible a sa raison à la place de l'espace.
  message.hidden = courant !== undefined;
  poserSecond(ouvrable, droite?.terminal);
  poserCout();
  poserGestes(gestesOnglet, relaye?.id);
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
  colonneSecond.hidden = courant === undefined;
  noteSecond.textContent =
    courant !== undefined && courant.refus !== undefined
      ? `“${courant.nom}” does not open: ${courant.refus} — it has no second`
      : nonEcritSecond !== ""
        ? nonEcritSecond
        : (montre?.note ?? (ouvrable ? "the second is opening…" : ""));
  fil.hidden = !ouvrable;
}

// Une phrase longue tient en une ligne : son début, avant toute commande ou
// explication ; le reste — la commande écrite, ce que `ssh` a répondu, le mode d'emploi — se lit au survol.
const LIGNE_MAX = 90;
/** @param {HTMLElement} ou @param {string} texte */
function poserEnUneLigne(ou, texte) {
  const court = texte.length <= LIGNE_MAX && !texte.includes("`") && !texte.includes("\n");
  if (court) return void (ou.textContent = texte);
  const tete = (texte.split(/ — |: |\n|`/)[0] ?? texte).trim();
  const ligne = (tete.length > LIGNE_MAX ? `${tete.slice(0, LIGNE_MAX - 1)}…` : tete) || texte.slice(0, LIGNE_MAX);
  ou.replaceChildren(ligne, survol(document, texte));
}

/** @param {string} texte */
function ligneCourte(texte) {
  const cree = document.createElement("p");
  poserEnUneLigne(cree, texte);
  return cree;
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

/** @param {string} texte @param {() => void} geste */
function bouton(texte, geste) {
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

// Une entrée de la barre : deux caractères, et ce qu'ils désignent dit en entier
// au survol et à qui ne voit pas l'écran.
/** @param {string} signe @param {string} nom @param {() => void} geste */
function icone(signe, nom, geste) {
  const cree = bouton(signe, geste);
  cree.title = nom;
  cree.ariaLabel = nom;
  return cree;
}

// Les boutons de l'onglet de contenu affiché : un geste qui attend sa suite, écrit dans le second.
// Un projet sans box n'en a pas : il n'y a pas de commande à écrire. Le bouton dit le geste en
// mots ; ce qui s'écrit, et que rien ne part, se lit au survol.
/** @param {HTMLElement} ou @param {string | undefined} endroit */
function poserGestes(ou, endroit) {
  const poses = courant?.box === undefined ? [] : BOUTONS.filter((pose) => pose.ou === endroit);
  ou.hidden = poses.length === 0;
  ou.replaceChildren(
    ...poses.map(({ id, libelle }) => {
      const groupe = document.createElement("span");
      groupe.className = "action";
      groupe.append(bouton(`${libelle}…`, () => void inscrire(id)), survol(document, "writes the start of the command into the second, without sending it: you complete it there"));
      return groupe;
    }),
  );
}

// Un bouton n'agit pas : sa commande s'écrit dans le second, à droite, pour que le chef la
// complète — c'est sa note qui dit ce qui a été écrit, et que rien n'est parti ; le centre ne change pas.
// Un projet qui ne s'ouvre pas n'a pas de second : sa colonne dit déjà pourquoi.
/** @param {string} id */
async function inscrire(id) {
  const projet = courant;
  if (projet === undefined) return;
  nonEcrit = nonEcritSecond = "";
  if (projet.refus !== undefined) return montrer();
  try {
    const rendu = await brigade.inscrire(projet.nom, id);
    if (rendu === undefined) return;
    // Le chef a pu changer d'espace entre-temps : le second de ce projet le garde.
    if ("refus" in rendu) nonEcritSecond = rendu.refus;
    else garder(projet.nom, rendu);
  } catch (erreur) {
    // Le projet a pu quitter le fichier entre l'affichage du bouton et le clic.
    nonEcritSecond = `nothing written: ${erreur instanceof Error ? erreur.message : String(erreur)}`;
  }
  montrer();
}

// Une carte de T'attend n'agit pas non plus : elle écrit une demande en prose dans le second, à
// droite, et rien ne l'envoie — c'est le second qui lit l'issue, explique et répond (demande.ts).
// Le rail reste où il est, et la page ouverte par-dessus aussi.
/** @param {number} ticket */
async function demander(ticket) {
  const projet = courant;
  if (projet === undefined) return;
  nonEcrit = nonEcritSecond = "";
  if (projet.refus !== undefined) return montrer();
  try {
    const rendu = await brigade.demander(projet.nom, ticket);
    if (rendu === undefined) nonEcritSecond = `nothing written: the last reading of the box no longer names #${ticket}`;
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
// confirmation ne s'ouvre que sous le bouton cliqué. `grant` : celui sur lequel il porte.
/** @param {Projet} projet @param {{ id: string, libelle: string, ou: string, grant?: string }} geste */
function poserGeste(projet, { id, libelle, ou, grant }) {
  if (!CONFIRMES.includes(id)) {
    const direct = bouton(libelle, () => void ecrireGeste(id, grant));
    direct.dataset.geste = "direct";
    direct.title = "goes straight into the second, if it is free — its output is read there";
    return [direct];
  }
  const cle = JSON.stringify([id, grant ?? "", ou]);
  const ouverte = aConfirmer?.projet === projet.nom && aConfirmer.cle === cle ? aConfirmer : undefined;
  const confirme = bouton(`${libelle}…`, () => void ouvrirConfirmation(projet, cle, id, grant));
  confirme.dataset.geste = "confirme";
  confirme.ariaExpanded = String(ouverte !== undefined);
  confirme.title = "says what it costs first: nothing goes before your “yes”";
  return ouverte === undefined ? [confirme] : [confirme, poserConfirmation(projet, ouverte, grant)];
}

// Le clic d'un geste confirmé : sa confirmation s'ouvre — ce qu'elle dit vient du process
// principal (confirmation.ts) —, et celle qui était ouverte se referme. Rien ne part. Recliqué,
// il la referme. « Allumer » se chiffre aussi : `manager backlog` est demandée à la box, et ses
// nombres rejoignent la confirmation quand elle répond — le « oui » ne les attend pas.
/** @param {Projet} projet @param {string} cle @param {string} id @param {string} [grant] */
async function ouvrirConfirmation(projet, cle, id, grant) {
  nonEcrit = nonEcritSecond = "";
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
    rendu = await brigade.confirmer(projet.nom, id, grant);
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
/** @param {Projet} projet @param {NonNullable<typeof aConfirmer>} ouverte @param {string} [grant] @param {(id: string) => void} [partir] */
function poserConfirmation(projet, { rendu, compte }, grant, partir) {
  const confirmation = document.createElement("div");
  confirmation.className = "confirmation";
  confirmation.role = "group";
  const fermer = () => {
    aConfirmer = undefined;
    montrer();
  };
  if (rendu === undefined) {
    confirmation.append(bloc("p", "what it costs: reading…"));
    return confirmation;
  }
  if ("refus" in rendu) {
    const refus = bloc("p", rendu.refus);
    refus.className = "refus";
    confirmation.append(refus, bouton("close", fermer));
    return confirmation;
  }
  confirmation.ariaLabel = rendu.titre;
  confirmation.append(bloc("strong", `⚠️ ${rendu.titre}`));
  // Chiffré (« allumer »), le prix est la phrase des nombres — ce qu'il va juger — et ce que le geste
  // engage passe au survol (ticket 906). Sinon, il se dit en une ligne ; le reste, et d'où c'est tiré, au survol.
  if (rendu.chiffrer === true && ALLUMAGE !== undefined) {
    const nombres = bloc("p", compte === undefined ? ALLUMAGE.enCours : compte === null ? ALLUMAGE.parti : "sans" in compte ? "the count could not be read" : compte.dit);
    nombres.className = "nombres";
    const lu = compte === undefined || compte === null ? "" : `according to \`${geste(projet, ALLUMAGE.commande)}\`, run for you on opening — read at ${heureDe(compte.a)}`;
    const raison = compte === undefined || compte === null || !("sans" in compte) ? "" : [compte.sans, compte.obtenu].filter((texte) => texte !== "").join("\n");
    const aide = [...rendu.prix, lu, raison].filter((texte) => texte !== "").join("\n");
    if (aide !== "") nombres.append(survol(document, aide));
    confirmation.append(nombres);
  } else {
    const [prix = "", ...suite] = rendu.prix;
    const source = rendu.lu === undefined ? [] : [`according to \`${geste(projet, "facts")}\`, read at ${heureDe(rendu.lu)}`];
    const ligne = bloc("p", prix);
    ligne.className = "prix";
    const detail = [...suite, ...source].join("\n");
    if (detail !== "") ligne.append(survol(document, detail));
    confirmation.append(ligne);
  }
  // Chiffrée, la confirmation n'écrit que sa phrase de prix : ce que chaque réponse engage passe au
  // survol de son bouton, pas à côté de lui (ticket 906).
  const aCote = rendu.chiffrer !== true;
  /** @param {HTMLElement} reponse @param {string} dit */
  const engage = (reponse, dit) => {
    if (aCote) return [reponse, bloc("span", dit)];
    reponse.title = dit;
    return [reponse];
  };
  confirmation.append(
    ...rendu.choix.map(({ id, libelle, dit }) => {
      const choix = document.createElement("p");
      choix.className = "gestes";
      const oui = bouton(libelle, () => {
        aConfirmer = undefined;
        if (partir === undefined) void ecrireGeste(id, grant, true);
        else partir(id);
      });
      oui.dataset.oui = "";
      choix.append(...engage(oui, dit));
      return choix;
    }),
  );
  const non = document.createElement("p");
  non.className = "gestes";
  non.append(...engage(bouton(rendu.renoncer, fermer), "nothing goes"));
  confirmation.append(non);
  return confirmation;
}

// Un geste part dans le second, à droite : sa sortie s'y lit, sa note dit ce qui est parti, et le
// centre ne change pas. Le second n'est pas libre : rien n'y est écrit, et la raison se lit sous
// son titre — occupé, la commande n'est pas partie. `oui` : le « oui » d'une confirmation — un geste
// confirmé ne part qu'avec lui. `grant` : celui sur lequel porte un geste de grant.
/** @param {string} id @param {string} [grant] @param {true} [oui] */
async function ecrireGeste(id, grant, oui) {
  const projet = courant;
  if (projet === undefined) return;
  nonEcrit = nonEcritSecond = "";
  try {
    const rendu = await brigade.geste(projet.nom, id, grant, oui);
    if (rendu === undefined) return montrer();
    // Le chef a pu changer d'espace entre-temps : le second de ce projet le garde.
    if ("refus" in rendu) nonEcritSecond = rendu.refus;
    else garder(projet.nom, rendu);
  } catch (erreur) {
    nonEcritSecond = `nothing sent: ${erreur instanceof Error ? erreur.message : String(erreur)}`;
  }
  montrer();
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

// Coût ouvre sa lecture ; Paramètres, l'état du projet — par-dessus le rail. Recliqué, l'onglet ouvert se referme.
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

journal.addEventListener("click", () => {
  if (courant !== undefined) activer(JOURNAL);
});

// Seul l'onglet de contenu affiché est lu sur la box : en changer, passer à un
// terminal ou quitter l'espace arrête sa lecture. Rien ne reste de l'onglet d'avant.
function lireOnglet() {
  const relaye = ONGLETS.find(({ id }) => id === actif());
  const voulu = courant === undefined || relaye === undefined ? "" : JSON.stringify([courant.nom, relaye.id]);
  if (voulu === suivi) return;
  suivi = voulu;
  // L'état du manager lu avant n'est plus celui de cette lecture : il revient avec elle.
  managerVu = undefined;
  poserManager();
  // Celui des grants non plus.
  grantsVus = undefined;
  poserGrants();
  if (courant !== undefined && relaye !== undefined) attendre(courant, luOnglet, lectureOnglet);
  ongletDemande = relaye?.id;
  brigade.onglet(courant?.nom, relaye?.id, ++demandeOnglet);
}

/** @param {Terminal} terminal */
function recevoir(terminal) {
  vue(terminal.id).terminal = terminal;
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
const GESTE = [
  "The box was reached, and this command did not answer there as the app expects: from here, this project can no longer be controlled.",
  "What the app got is above; it knows no more.",
  "",
  "The step that brings a runtime up to date, on its box:",
  "  sudo git -C <brigade clone> pull",
  "  sudo systemctl restart brigade@<project>",
  "(docs/runtime.md, “Piloter”, line “Mettre à jour”)",
].join("\n");

// Ce que l'app dit quand le geste de la box a refusé le projet : le nom qu'elle
// lui a donné, et d'où il vient. Le refus lui-même est au-dessus, mot pour mot.
/** @param {string} nom */
const inconnu = (nom) =>
  [
    "The box was reached, and its step does not know this project: what it said about it is above.",
    `The app gave it “${nom}” — the “nom” of the project in ${configuration.chemin}. The box must serve it under this name.`,
    "If it was uninstalled from this box, this is expected: it can no longer be controlled there. “Remove this project”, in its space's panel, removes it from the app.",
  ].join("\n");

// Ce que l'app dit quand le geste a refusé celui qui le lance. Elle nomme où
// est écrit le geste qui donne ce droit, et ne le rejoue pas : il se joue sur la box.
const SANS_DROIT = [
  "The box was reached, and its step refused the account your `ssh` reaches it with: what it said about it is above.",
  "This is neither a failure nor a runtime to update: it is a right this account lacks.",
  "",
  "It is given on the box, by someone who has `sudo` there — the app does not do it for you:",
  "(docs/installer.md, “Ajouter un humain”)",
].join("\n");

// Ce que l'app dit quand le code de la box est celui d'une commande absente.
// Elle ne sait pas laquelle : c'est la box qui la nomme, au-dessus.
/** @param {Projet} projet */
const commandeManque = (projet) => [
  "The box was reached, and a command is missing there: what it said about it is above. The app does not know which.",
  "If it names `brigade`, the step is not installed there; if it names `sudo`, the step lacks it to run under the service account.",
  "",
  "Both are installed on the box, when preparing it:",
  "(docs/installer.md, “Préparer la box”)",
  "",
  `On your workstation, \`brigade\` alone does not exist, and need not: the step is typed there like this, as the app writes it — \`${geste(projet, "status")}\`, for example.`,
].join("\n");

// Ce que l'app dit quand le geste a refusé le `node` de la box (code 70).
const NODE_INAPTE = [
  "The box was reached, and its step refused to start the runtime: the box's `node` does not suit it. What it said about it is above.",
  "",
  "It is not the runtime that needs updating: the step's sentence says the remedy, and it is applied on the box:",
  "(docs/installer.md, “Préparer la box”)",
].join("\n");

// Ce que l'app dit sous le message de `ssh`, quel qu'il soit : elle ne le lit
// pas, elle nomme où chacune de ses phrases est expliquée.
const SSH_EN_ECHEC = [
  "`ssh` did not open a session on the box, and said why: its message is above. The app does not read it.",
  "What each of its sentences means, and the step that answers it:",
  "(docs/installer.md, “Joindre la box”)",
  "",
  "If it says your key was refused (`Permission denied`), the box answers and it is access you lack. It is given on the box:",
  "(docs/installer.md, “Ajouter un humain”)",
].join("\n");

// Ce que l'app dit quand `status` a répondu sans le bord qu'elle sait prendre.
// Elle ne sait pas si quelque chose attend : elle ne dit donc pas que rien n'attend.
/** @param {Projet} projet */
const sansBord = (projet) => [
  `Nothing could be set apart: the output of \`${geste(projet, "status")}\` lacks the block the app can take — a single line starting with \`attend\`, a single \`fin attend\` line.`,
  "This is not “nothing awaits you”: what awaits you, if anything, is in the output below, in full.",
].join("\n");

// Ce qui attend le chef, en tête et à part : le bloc de `status`, tel qu'il l'a
// écrit — c'est lui qui dit quand rien n'attend. Sans bloc, l'app dit qu'elle n'a rien pris.
/** @param {Projet} projet @param {string | undefined} attend @param {boolean} [accueil] */
function aPart(projet, attend, accueil = false) {
  const cree = document.createElement("section");
  cree.className = "attend";
  cree.dataset.pris = String(attend !== undefined);
  if (accueil) cree.append(bloc("h3", "what awaits you"), attend === undefined ? lectureIndisponible(document, "what awaits you could not be set apart", sansBord(projet)) : bloc("pre", attend));
  else cree.append(bloc("h3", `what awaits you — the \`attend\` block of \`${geste(projet, "status")}\``), attend === undefined ? propos(sansBord(projet)) : bloc("pre", attend));
  return cree;
}

// Ce que l'app a obtenu d'une lecture en échec, et dessous ce qu'elle en dit :
// le code de sortie choisit le renvoi, le texte n'est jamais traduit. Sans
// message de `ssh` — pas lancé, ou arrêté au délai — il n'y a rien à aller lire.
/** @param {Projet} projet @param {import("../box.ts").Echec & { projet: string }} recue @param {string} plusPilotable ce qui se dit d'une box jointe dont le code ne dit aucun cas */
function obtenu(projet, recue, plusPilotable) {
  const suite =
    recue.cas === "projet-inconnu"
      ? inconnu(recue.projet)
      : recue.cas === "sans-droit"
        ? SANS_DROIT
        : recue.cas === "commande-manque"
          ? commandeManque(projet)
          : recue.cas === "node-inapte"
            ? NODE_INAPTE
            : recue.atteinte
              ? plusPilotable
              : recue.cas === "ssh-en-echec"
                ? SSH_EN_ECHEC
                : undefined;
  return [bloc("pre", recue.erreur), ...(suite === undefined ? [] : [propos(suite)])];
}

// Une lecture en échec se dit en une ligne, dans les mots de l'app ; ce que la box ou `ssh` a
// répondu, et ce que l'app en dit de plus (le code de sortie choisit le renvoi, le texte n'est jamais
// traduit), se lisent au survol. Rien de technique n'est écrit à plat.
/** @param {Projet} projet @param {import("../box.ts").Echec & { projet: string }} recue @param {string} plusPilotable ce qui se dit d'une box jointe dont le code ne dit aucun cas */
function obtenuEnUneLigne(projet, recue, plusPilotable) {
  const [ligne, suite] =
    recue.cas === "projet-inconnu"
      ? ["the box does not know this project", inconnu(recue.projet)]
      : recue.cas === "sans-droit"
        ? ["your account lacks the right to this action on the box", SANS_DROIT]
        : recue.cas === "commande-manque"
          ? ["a command is missing on the box", commandeManque(projet)]
          : recue.cas === "node-inapte"
            ? ["the box's node does not suit the runtime", NODE_INAPTE]
            : recue.atteinte
              ? ["the box answered, but not as the app expects", plusPilotable]
              : recue.cas === "ssh-en-echec"
                ? ["the box could not be reached", SSH_EN_ECHEC]
                : ["the box did not answer", undefined];
  return [lectureIndisponible(document, ligne, suite === undefined ? recue.erreur : `${recue.erreur}\n\n${suite}`)];
}

// Ce qu'une lecture donne à voir, dans le panneau de l'espace, à côté du terminal et dans
// un onglet de contenu : un des sept états, dit en toutes lettres, et dessous ce
// que l'app a obtenu. Celle d'un onglet n'a rien de mis à part : ce n'est pas `status`.
/** @param {Montree | Lecture} recue @param {HTMLElement} tete @param {HTMLElement} corps @param {boolean} [accueil] vrai : le détail est replié ou au survol, aucune commande n'est écrite */
function rendre(recue, tete, corps, accueil = false) {
  // Le projet a pu quitter le fichier depuis la demande : il n'y a plus rien à lui écrire.
  const projet = projetDe(recue.projet);
  if (projet === undefined) return;
  const heure = heureDe(recue.a);
  if ("sorties" in recue) {
    const mise = "attend" in recue;
    tete.dataset.etat = "pilotable";
    tete.textContent = `${mise ? "controllable — " : ""}read at ${heure}`;
    const sans = !mise || recue.attend === undefined ? "" : " — without its `attend` block, set apart above";
    if (accueil) {
      // Ce que la box a dit se lit, replié : le détail n'est pas la première chose que l'écran montre.
      const lue = document.createElement("details");
      lue.append(bloc("summary", "what the box said"), ...recue.sorties.flatMap(({ commande, texte }) => [bloc("h3", commande), bloc("pre", texte)]));
      corps.replaceChildren(...(mise ? [aPart(projet, recue.attend, true)] : []), lue);
    } else corps.replaceChildren(...(mise ? [aPart(projet, recue.attend)] : []), ...recue.sorties.flatMap(({ commande, texte }) => [bloc("h3", `${geste(projet, commande)}${commande === "status" ? sans : ""}`), bloc("pre", texte)]));
  } else if (recue.cas === "projet-inconnu") {
    tete.dataset.etat = "inconnu";
    tete.textContent = `REACHED, BUT UNKNOWN TO THE BOX — tried at ${heure}, the next follows on its own`;
  } else if (recue.cas === "sans-droit") {
    tete.dataset.etat = "sans-droit";
    tete.textContent = `REACHED, BUT WITHOUT THE RIGHT TO THE ACTION — tried at ${heure}, the next follows on its own`;
  } else if (recue.cas === "commande-manque") {
    tete.dataset.etat = "commande-manque";
    tete.textContent = `REACHED, BUT A COMMAND IS MISSING ON THE BOX — tried at ${heure}, the next follows on its own`;
  } else if (recue.cas === "node-inapte") {
    tete.dataset.etat = "node-inapte";
    tete.textContent = `REACHED, BUT THE BOX'S NODE DOES NOT SUIT THE RUNTIME — tried at ${heure}, the next follows on its own`;
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
  delete tete.dataset.forme;
  if (ton !== undefined) {
    tete.dataset.ton = ton;
    const forme = formeDe(ton);
    if (forme !== undefined) tete.dataset.forme = forme;
  }
  if ("erreur" in recue) corps.replaceChildren(...(accueil ? obtenuEnUneLigne : obtenu)(projet, recue, GESTE));
}

// Ce qu'une vérification a donné. En tête, son verdict en une phrase ; dessous, une ligne par
// manque — qui agit, et pour le chef le bouton qui fait le geste ou la commande exacte, à copier ;
// les lignes « à savoir » à part, plus discrètes ; et ce que l'app a obtenu — la sortie brute,
// intacte —, replié sous « detail ». Sans verdict, le même cas et le même renvoi que sous `status`.
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
  const detail = document.createElement("details");
  detail.className = "detail";
  const cle = `${projet.nom} ${verification.a}`;
  detail.open = verificationsDepliees.has(cle);
  detail.addEventListener("toggle", () => void (detail.open ? verificationsDepliees.add(cle) : verificationsDepliees.delete(cle)));
  detail.append(bloc("summary", `detail — verified at ${heureDe(verification.a)}`), exact("pre", verification.detail));
  if (verification.etat === "illisible") {
    posee.append(...verification.suite.map((ligne) => bloc("p", ligne)), detail);
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
  posee.append(detail);
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
    // Les stations et les décisions se choisissent : le bouton mène à leur étape.
    else ligne.append(action(geste.libelle, async () => [...serviceEtapes.children].find((etape) => /** @type {HTMLElement} */ (etape).dataset.id === id)?.scrollIntoView?.({ block: "center" })));
    return ligne;
  }
  // Ni commande ni phrase de mode d'emploi à plat : elles se lisent au survol.
  ligne.append(survol(document, "commande" in geste ? geste.commande : geste.dit));
  return ligne;
}

// Ce que la box a rendu à la place de ce qui était demandé : son titre, ce que l'app a obtenu.
/** @param {Projet} projet @param {import("../service.ts").Rate | { etat: "en-cours"; titre: string }} rate */
function poserRate(projet, rate) {
  const tete = bloc("p", rate.titre);
  tete.className = "verdict";
  tete.dataset.verdict = rate.etat === "en-cours" ? "en-cours" : "sans-verdict";
  if (rate.etat === "en-cours") return [tete];
  if (rate.etat === "echec") return [tete, ...obtenuEnUneLigne(projet, { ...rate.echec, projet: projet.nom }, GESTE)];
  const brut = document.createElement("details");
  brut.append(bloc("summary", "what the box said"), bloc("pre", rate.obtenu));
  return [tete, brut, ...rate.lignes.map((ligne) => bloc("p", ligne))];
}

// Les mots d'un état d'étape, tels que l'écran les montre.
/** @type {Record<import("../service.ts").EtatDEtape, string>} */
const ETATS_D_ETAPE = { todo: "to do", done: "done", waiting: "waiting for you" };

// L'installation du projet affiché, en tête du panneau : d'abord ce que l'app ne fera pas à
// la place du chef, puis toutes les étapes, dans leur ordre — leur état, à quoi chacune sert,
// ce qui se passe si on la saute —, et l'étape courante mise en avant, avec son geste. Un
// bouton qui ne peut pas partir est grisé ; le process principal le refuse de même.
/** @param {Projet} projet @param {Guide | undefined} guide */
function poserService(projet, guide) {
  // Le chef a pu changer d'espace pendant que la box répondait.
  if (courant?.nom !== projet.nom) return;
  service.hidden = guide === undefined || guide.termine;
  // Installé, ce que sa dernière vérification a donné se pose en tête de Paramètres : la même règle que l'écran Verify.
  const verifiee = guide !== undefined && guide.termine && guide.verification !== undefined;
  verificationEtat.hidden = !verifiee;
  verificationEtat.replaceChildren(...(verifiee ? poserVerdict(projet, guide.verification, (texte, geste) => bouton(texte, () => void geste())) : []));
  if (guide === undefined || guide.termine) return serviceEtapes.replaceChildren(), serviceTete.replaceChildren();
  // En cours, ou entamée par le chef, elle s'ouvre d'elle-même ; ensuite, c'est lui qui la replie.
  if (misEnService !== projet.nom || (guide.deplie && !serviceDeplie)) {
    // Elle se déplie, mais n'envoie jamais le chef dans Paramètres : le rail reste l'écran d'un projet.
    service.open = guide.deplie;
  }
  misEnService = projet.nom;
  serviceDeplie = guide.deplie;
  serviceTitre.textContent = guide.titre;
  const occupe = guide.action !== undefined || guide.verification?.etat === "en-cours";

  /** @param {string} texte @param {() => Promise<unknown>} geste */
  const action = (texte, geste) => {
    const cree = bouton(texte, () => void agirService(projet, geste));
    cree.type = "button";
    cree.disabled = occupe;
    return cree;
  };
  /** @param {string} texte */
  const refus = (texte) => {
    const cree = bloc("p", texte);
    cree.className = "refus";
    return cree;
  };

  // En tête : ce que l'app ne fera pas à la place du chef, dit avant qu'il le rencontre ; puis
  // ce que la box a rendu de la dernière action, et de la dernière vérification.
  const tete = [];
  if (guide.lecture.etat !== "lue") tete.push(...poserRate(projet, guide.lecture));
  if (guide.courante === null && guide.lecture.etat === "lue") {
    tete.push(ditEtAide("p", "The installation is finished", "the box verified everything, the kitchen is ready to serve, and no installation step is left."));
    if ("commande" in guide.demarrage) tete.push(action("Write the start of the service in a shell", () => demarrerService(projet)));
  }
  if (guide.courante !== null && guide.lecture.etat === "lue") {
    const annonces = document.createElement("div");
    annonces.className = "annonces";
    annonces.append(ditEtAide("strong", "What the app cannot do for you", "said before you meet it"));
    if (guide.annonces.etat === "en-cours") annonces.append(ditEtAide("p", "The box is being verified…", "what it lacks, that only someone with `sudo` there can set up, is announced here as soon as it answers."));
    if (guide.annonces.etat === "pas-lues") annonces.append(refus("The verification did not return its verdict: what the box may lack is not known."));
    for (const annonce of guide.annonces.liste) {
      const ligne = document.createElement("div");
      ligne.className = "annonce";
      ligne.append(bloc("strong", annonce.titre), annonce.geste === null ? bloc("p", annonce.texte) : ditEtAide("p", annonce.texte, annonce.geste));
      annonces.append(ligne);
    }
    tete.push(annonces);
  }
  if (guide.action !== undefined) tete.push(bloc("p", `running: ${guide.action}`));
  if (guide.fait !== undefined) {
    const fait = bloc("p", `${guide.fait.titre} — at ${heureDe(guide.fait.a)}`);
    fait.className = "verdict";
    fait.dataset.verdict = guide.fait.ok ? "pret" : "incomplete";
    const brut = document.createElement("details");
    brut.append(bloc("summary", "what the box said"), bloc("pre", guide.fait.obtenu));
    tete.push(fait, brut);
  }
  if (guide.lecture.etat === "lue") tete.push(action("Verify", () => brigade.verifier(projet.nom)), ...poserVerdict(projet, guide.verification, action));
  serviceTete.replaceChildren(...tete);

  serviceEtapes.replaceChildren(
    ...guide.etapes.map((etape) => {
      const li = document.createElement("li");
      li.dataset.id = etape.id;
      li.dataset.etat = etape.etat;
      if (etape.courante) li.className = "courante";
      const titre = document.createElement("p");
      const etat = bloc("span", ETATS_D_ETAPE[etape.etat]);
      etat.className = "etat";
      titre.append(bloc("strong", `${etape.rang}. ${etape.titre}`), " ", etat, ...(etape.courante ? [" ", bloc("em", "← now")] : []));
      // À quoi sert l'étape, ce qui arrive si on la saute, ce qui reste au chef : au survol de son titre.
      titre.append(survol(document, [`What it is for: ${etape.sert}`, `If you skip it: ${etape.sauter}`, ...(etape.geste === null ? [] : [`Yours to do: ${etape.geste}`])].join("\n")));
      li.append(titre);
      for (const manque of etape.manques) li.append(manque.geste === null ? refus(`“Verify” says: ${manque.texte}`) : ditEtAide("p", `“Verify” says: ${manque.texte}`, manque.geste));
      // Une étape faite n'a plus de geste — sauf les décisions qui restent, présentées jusqu'à la fin.
      if (!etape.courante && etape.detail === undefined) return li;
      li.append(...etape.lignes.map((ligne) => bloc("p", ligne)), ...gesteDEtape(projet, guide, etape, action, refus));
      return li;
    }),
  );
}

// Le geste de l'étape courante : ses boutons, et ce que la box a dit pour qu'on choisisse.
/**
 * @param {Projet} projet @param {Guide} guide @param {Guide["etapes"][number]} etape
 * @param {(texte: string, geste: () => Promise<unknown>) => HTMLButtonElement} action @param {(texte: string) => HTMLElement} refus
 * @returns {HTMLElement[]}
 */
function gesteDEtape(projet, guide, etape, action, refus) {
  const { detail } = etape;
  if (!etape.courante && etape.id !== "decisions") return [];
  if (etape.id === "init") {
    return [action("Initialize the project in the second", () => amorcerService(projet)), action("The initialization is merged onto the integration branch", () => brigade.direMerge(projet.nom, true))];
  }
  if (etape.id === "verification") return [ditEtAide("p", "Verify again once the box is set up", "“Verify” is at the top of this screen: once what it says is missing on the box is set up, verify again.")];
  if (etape.id === "demarrage") return "refus" in guide.demarrage ? [refus(guide.demarrage.refus)] : [action("Start", () => demarrerService(projet))];
  if (detail === undefined) return [];
  if (detail.etat !== "lu") return poserRate(projet, detail);

  if (detail.id === "stations") {
    const { proposees, absent, declarees } = detail.lu;
    const poses = [];
    if (declarees.length > 0) poses.push(bloc("p", `Declared now: ${declarees.map(({ nom, cooks, fournit }) => `${nom} — ${cooks} cook${cooks > 1 ? "s" : ""} at most, provides ${fournit.join(", ")}`).join(" · ")}`));
    if (absent !== null) poses.push(refus(`The box provides no station — ${absent}`));
    /** @type {{ nom: string; coche: HTMLInputElement; cooks: HTMLInputElement }[]} */
    const choix = [];
    for (const proposee of proposees) {
      const coche = /** @type {HTMLInputElement} */ (document.createElement("input"));
      coche.type = "checkbox";
      coche.checked = true;
      const cooks = /** @type {HTMLInputElement} */ (document.createElement("input"));
      cooks.type = "number";
      cooks.min = "1";
      cooks.placeholder = "cooks at once";
      cooks.value = String(declarees.find(({ nom }) => nom === proposee.nom)?.cooks ?? "");
      const ligne = document.createElement("label");
      ligne.append(coche, exact("span", proposee.nom), ` provides ${proposee.fournit.join(", ")} — `, cooks, " cooks at once", survol(document, "no default: it is your quota"));
      poses.push(ligne);
      choix.push({ nom: proposee.nom, coche, cooks });
    }
    if (proposees.length > 0) {
      poses.push(action("Declare the stations", () => brigade.declarerStations(projet.nom, choix.filter(({ coche }) => coche.checked).map(({ nom, cooks }) => ({ nom, cooks: Number(cooks.value) })))));
    }
    return poses;
  }

  if (detail.id === "protection") {
    const { depot, branche, protection, manque, droits, raison } = detail.lu;
    const poses = [
      bloc(
        "p",
        {
          posée: `\`${branche}\` is protected on ${depot}.`,
          autre: `\`${branche}\` is protected on ${depot}, without: ${manque.join(", ")} — the app does not overwrite a protection you set.`,
          absente: `\`${branche}\` is not protected on ${depot}.`,
          illisible: `\`${branche}\` on ${depot}: ${raison ?? "GitHub did not say"}.`,
        }[protection],
      ),
    ];
    for (const droit of droits) poses.push(refus(`Missing: ${droit.droit}`), bloc("p", `→ ${droit.action}`), bloc("p", `why: ${droit.pourquoi}`));
    if (protection === "absente" || protection === "posée") poses.push(action(protection === "posée" ? "Record the protection" : "Protect the integration branch", () => brigade.proteger(projet.nom)));
    return poses;
  }

  const { courante, enAttente } = detail.lu;
  if (courante === null && !etape.courante) return [];
  if (courante === null) return [bloc("p", "No decision waiting."), ...(detail.passable ? [action("Mark the decisions done", () => brigade.passerDecisions(projet.nom))] : [])];
  const poses = [bloc("p", `${enAttente} decision${enAttente > 1 ? "s" : ""} waiting, this one included${courante.reclamee ? " — the start requires it" : " — the start does not require it"}.`), exact("strong", courante.nom), bloc("p", courante.question)];
  if (courante.recommandee !== null) poses.push(bloc("p", `Recommended: ${courante.recommandee.valeur} — ${courante.recommandee.pourquoi}`));
  poses.push(ditEtAide("p", "If you skip it", courante.sauter));
  /** @param {import("../service.ts").Option[]} options */
  const choisir = (options) => {
    if (options.some(({ valeur }) => valeur.startsWith("<"))) {
      const saisie = /** @type {HTMLInputElement} */ (document.createElement("input"));
      saisie.placeholder = options[0]?.valeur ?? "";
      return { poses: [saisie, ...options.map(({ valeur, effet }) => bloc("p", `${valeur}: ${effet}`))], valeur: () => saisie.value };
    }
    const liste = /** @type {HTMLSelectElement} */ (document.createElement("select"));
    liste.append(new Option("— choose —", ""), ...options.map(({ valeur, effet }) => new Option(`${valeur} — ${effet}`, valeur)));
    return { poses: [liste], valeur: () => liste.value };
  };
  const sienne = choisir(courante.options);
  poses.push(...sienne.poses);
  const avec = courante.avec === null ? undefined : choisir(courante.avec.options);
  if (courante.avec !== null && avec !== undefined) poses.push(exact("strong", courante.avec.nom), bloc("p", courante.avec.question), ...avec.poses);
  poses.push(action("Answer", () => brigade.repondre(projet.nom, [sienne.valeur(), ...(avec === undefined ? [] : [avec.valeur()])])));
  if (detail.passable) poses.push(action("Skip the optional decisions — the start does not require them", () => brigade.passerDecisions(projet.nom)));
  return poses;
}

/** @param {Projet} projet */
async function lireService(projet) {
  poserService(projet, await brigade.service(projet.nom));
}

// Une action de l'installation : ce qu'elle fait arrive par `surGuide`. Refusée, sa raison se
// lit là où le chef a cliqué : à droite, sous les onglets des terminaux.
/** @param {Projet} projet @param {() => Promise<unknown>} geste */
async function agirService(projet, geste) {
  const rendu = await geste();
  if (rendu !== null && typeof rendu === "object" && "refus" in rendu && typeof rendu.refus === "string" && !("id" in rendu)) {
    nonEcrit = nonEcritSecond = "";
    nonEcritSecond = rendu.refus;
    if (courant?.nom === projet.nom) montrer();
  }
}

// Un geste de l'installation a rendu un terminal — le second, pour la session d'init ; un
// shell, pour le démarrage — ou la raison pour laquelle rien n'est fait. Le terminal est
// montré, à droite : c'est sa note qui dit ce qui a été lancé, ou écrit. La raison se lit là
// où il se serait montré : à droite, sous les onglets des terminaux.
/** @param {Projet} projet @param {Terminal | { refus: string }} rendu */
function suivreGeste(projet, rendu) {
  nonEcrit = nonEcritSecond = "";
  if (!("refus" in rendu)) garder(projet.nom, rendu);
  else nonEcritSecond = rendu.refus;
  if (courant?.nom === projet.nom) montrer();
}

/** @param {Projet} projet */
async function amorcerService(projet) {
  suivreGeste(projet, await brigade.amorcer(projet.nom));
}

/** @param {Projet} projet */
async function demarrerService(projet) {
  suivreGeste(projet, await brigade.demarrer(projet.nom));
}

// Ce qu'une demande faite à la box pour désinstaller a donné : son titre, l'heure, ce que
// l'app a obtenu — les phrases de la box, telles quelles — et ce que l'app en dit.
/** @param {import("../retrait.ts").Montre | undefined} montre */
function poserMontre(montre) {
  if (montre === undefined) return [];
  const tete = bloc("p", "a" in montre ? `${montre.titre} — at ${heureDe(montre.a)}` : montre.titre);
  tete.className = "verdict";
  tete.dataset.verdict = montre.etat;
  return [tete, ...("obtenu" in montre ? [bloc("pre", montre.obtenu)] : []), ...("suite" in montre ? montre.suite.map((ligne) => bloc("p", ligne)) : [])];
}

// Retirer le projet affiché, sous la mise en service : deux gestes, chacun dans son bloc
// et sous son libellé. Le premier ne touche qu'à l'app. Le second, sur la box : la case
// du journal, le plan, le nom à écrire, puis le bouton — inactif tant que la box n'a pas
// rendu son plan, et il dit pourquoi.
/** @param {Projet} projet @param {Retrait | undefined} pose */
function poserRetrait(projet, pose) {
  // Le chef a pu changer d'espace pendant que la box répondait.
  if (courant?.nom !== projet.nom) return;
  retrait.hidden = pose === undefined;
  if (pose === undefined) return retraitGestes.replaceChildren();
  // Replié d'office : un projet ne se retire pas d'un clic perdu. Ensuite, c'est le chef qui le déplie.
  if (retraitPose !== projet.nom) {
    retrait.open = false;
    confirmation = "";
    planConfirme = "";
    nonRetire = "";
  }
  retraitPose = projet.nom;
  // Le plan affiché n'est plus celui devant lequel le nom a été écrit — redemandé, ou lâché
  // par la case du journal : ce nom ne vaut plus, il se récrit devant ce que la box dit maintenant.
  const plan = pose.desinstaller.geste?.plan;
  const rendu = plan?.etat === "plan" ? plan.a : "";
  if (rendu !== planConfirme) confirmation = "";
  planConfirme = rendu;
  retraitTitre.textContent = pose.titre;

  /** @param {string} titre @param {(Node | string)[]} contenu */
  const partie = (titre, ...contenu) => {
    const cree = document.createElement("section");
    cree.append(bloc("strong", titre), ...contenu);
    return cree;
  };
  /** @param {string[]} textes */
  const lignes = (textes) => textes.map((texte) => bloc("p", texte));
  /** @param {string | undefined} raison */
  const refus = (raison) => {
    const cree = bloc("p", raison ?? "");
    cree.className = "refus";
    return raison === undefined || raison === "" ? [] : [cree];
  };

  const retirer = bouton(pose.retirer.libelle, () => void retirerDeLApp(projet));
  const box = pose.desinstaller.geste;
  /** @type {(Node | string)[]} */
  let surLaBox = [];
  if (box !== undefined) {
    const coche = document.createElement("input");
    coche.type = "checkbox";
    coche.checked = box.journal.coche;
    coche.disabled = box.journal.refus !== undefined;
    coche.addEventListener("change", async () => poserRetrait(projet, await brigade.direJournal(projet.nom, coche.checked)));
    const option = document.createElement("label");
    option.append(coche, box.journal.libelle);
    const avertissement = lignes(box.journal.avertissement);
    for (const ligne of avertissement) ligne.className = "avertissement";
    const planifier = bouton(box.planifier, () => void planifierRetrait(projet));
    planifier.disabled = box.planifierRefuse !== undefined;
    const saisie = document.createElement("input");
    saisie.autocomplete = "off";
    saisie.spellcheck = false;
    saisie.value = confirmation;
    saisie.disabled = box.desinstallerRefuse !== undefined;
    saisie.addEventListener("input", () => (confirmation = saisie.value));
    const consigne = document.createElement("label");
    consigne.append(box.consigne, saisie);
    const desinstaller = bouton(pose.desinstaller.libelle, () => void desinstallerRetrait(projet));
    desinstaller.className = "sans-retour";
    desinstaller.disabled = box.desinstallerRefuse !== undefined;
    surLaBox = [option, ...avertissement, ...refus(box.journal.refus), planifier, ...refus(box.planifierRefuse), ...poserMontre(box.plan), consigne, desinstaller, ...refus(box.desinstallerRefuse), ...poserMontre(box.issue)];
  }
  retraitGestes.replaceChildren(partie(pose.retirer.libelle, ...lignes(pose.retirer.lignes), retirer, ...refus(nonRetire)), partie(pose.desinstaller.libelle, ...lignes(pose.desinstaller.lignes), ...surLaBox));
}

// L'accent de l'espace affiché : celui de son projet, à la place de celui de la peau — posé sur la
// racine, il vaut pour tout ce que la peau dit choisi ou au clavier. Ailleurs, la peau reprend le sien.
function teindre() {
  const accent = ajoute ? undefined : courant?.couleurs?.accent;
  if (accent === undefined) document.documentElement.style.removeProperty("--accent");
  else document.documentElement.style.setProperty("--accent", accent);
}

// Les couleurs du projet, sous Paramètres : une rangée par rôle, une pastille par couleur de la
// palette — celle qu'il porte est pressée. Une couleur écrite à la main hors de la palette se
// montre aussi, pressée, sans geste : la palette est ce que l'app propose, pas ce qu'elle exige.
/** @param {Projet} projet */
function poserCouleurs(projet) {
  if (couleurRefusee.projet !== projet.nom) couleurRefusee = { projet: "", refus: "" };
  couleurs.hidden = false;
  /** @param {"onglet" | "accent"} role @param {string} libelle */
  const rangee = (role, libelle) => {
    const portee = projet.couleurs?.[role];
    const pastilles = PALETTE.map(({ nom, valeur }) => {
      const cree = bouton("", () => void colorer(projet, role, nom));
      cree.className = "teinte";
      cree.style.setProperty("--teinte", valeur);
      cree.title = cree.ariaLabel = `${libelle}: ${nom}`;
      cree.ariaPressed = String(valeur === portee);
      return cree;
    });
    if (portee !== undefined && !PALETTE.some(({ valeur }) => valeur === portee)) {
      const tienne = bouton("", () => {});
      tienne.className = "teinte";
      tienne.style.setProperty("--teinte", portee);
      tienne.title = tienne.ariaLabel = `${libelle}: ${portee}, written in the projects file`;
      tienne.ariaPressed = "true";
      tienne.disabled = true;
      pastilles.push(tienne);
    }
    const ligne = document.createElement("div");
    ligne.className = "rangee";
    ligne.append(bloc("span", libelle), ...pastilles);
    return ligne;
  };
  const refus = bloc("p", couleurRefusee.refus);
  refus.className = "refus";
  couleurs.replaceChildren(
    bloc("h3", "Colors"),
    rangee("onglet", "Tab, in the bar"),
    rangee("accent", "Accent, in the space"),
    ...(projet.couleurs === undefined ? [ditEtAide("p", "No colors yet", "the app picks them and writes them to the projects file.")] : []),
    ...(couleurRefusee.refus === "" ? [] : [refus]),
  );
}

// Une couleur choisie : le process principal l'écrit dans le fichier des projets, et elle revient
// par `surConfiguration` — la barre et l'espace la prennent alors. Refusée, la raison se lit dessous.
/** @param {Projet} projet @param {"onglet" | "accent"} role @param {string} nom */
async function colorer(projet, role, nom) {
  const refus = await brigade.colorer(projet.nom, role, nom);
  couleurRefusee = { projet: projet.nom, refus: refus ?? "" };
  if (courant?.nom === projet.nom) poserCouleurs(courant);
}

// Les tickets ordinaires du Mac, sous Paramètres : l'option, la limite de cooks, une ligne qui dit
// ce que ça implique — et, quand la station dit son bac à sable indisponible, pourquoi le Mac ne
// prend aucun ticket ordinaire. Le process principal décide si le bloc existe (ordinaires.ts) :
// sur un autre poste qu'un Mac, rien ne se pose.
let ordinairesRefuses = { projet: "", refus: "" };
// Ce qui est posé : une lecture qui n'a rien changé ne le repose pas — le chef peut être en train d'écrire la limite.
let ordinairesPose = "";
/** @param {Projet} projet */
async function poserOrdinaires(projet) {
  const recu = await brigade.ordinaires(projet.nom);
  // Le chef a pu ouvrir un autre projet pendant la lecture.
  if (courant?.nom !== projet.nom) return;
  if (recu === undefined) {
    ordinaires.hidden = true;
    return;
  }
  if (ordinairesRefuses.projet !== projet.nom) ordinairesRefuses = { projet: "", refus: "" };
  const pose = JSON.stringify([projet.nom, recu, ordinairesRefuses.refus]);
  if (pose === ordinairesPose) return;
  ordinairesPose = pose;
  const option = document.createElement("input");
  option.type = "checkbox";
  option.checked = recu.actif;
  const limite = document.createElement("input");
  limite.type = "number";
  limite.min = "1";
  limite.step = "1";
  limite.value = recu.limite === null ? "" : String(recu.limite);
  limite.ariaLabel = "Cooks the Mac runs at once";
  /** @param {string} libelle @param {HTMLElement} champ */
  const etiquette = (libelle, champ) => {
    const cree = document.createElement("label");
    cree.append(champ, libelle);
    return cree;
  };
  const regler = async () => {
    const voulue = limite.value.trim() === "" ? null : Number(limite.value);
    const refus = await brigade.reglerOrdinaires(projet.nom, option.checked, voulue);
    ordinairesRefuses = { projet: projet.nom, refus: refus ?? "" };
    ordinairesPose = "";
    if (courant?.nom === projet.nom) void poserOrdinaires(projet);
  };
  option.addEventListener("change", () => void regler());
  limite.addEventListener("change", () => void regler());
  const refus = bloc("p", ordinairesRefuses.refus);
  refus.className = "refus";
  const indisponible = recu.indisponible === undefined ? [] : [bloc("p", recu.indisponible)];
  for (const dit of indisponible) dit.className = "indisponible";
  ordinaires.hidden = false;
  ordinaires.replaceChildren(
    bloc("h3", "Ordinary tickets on this Mac"),
    etiquette("Take the ordinary tickets too", option),
    etiquette("Cooks at once", limite),
    bloc("p", recu.explication),
    ...indisponible,
    ...(ordinairesRefuses.refus === "" ? [] : [refus]),
  );
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

// Le premier geste : le projet quitte l'app, et rien ne part vers sa box. Retiré, il a déjà
// quitté la barre par `surConfiguration` ; refusé, la raison se lit sous le bouton.
/** @param {Projet} projet */
async function retirerDeLApp(projet) {
  const rendu = await brigade.retirerDeLApp(projet.nom);
  if ("avis" in rendu) {
    // Revenu sous le même nom, ce serait un autre projet : ses gestes se reposeront repliés.
    retraitPose = "";
    return poserAvis(rendu.avis);
  }
  nonRetire = rendu.refus;
  await lireRetrait(projet);
}

// Le plan part, et se dit en cours ; ce que la box rend remplace ce qui était affiché.
/** @param {Projet} projet */
async function planifierRetrait(projet) {
  const planifie = brigade.planifier(projet.nom);
  await lireRetrait(projet);
  poserRetrait(projet, await planifie);
}

// Le second geste : la désinstallation part avec le nom que le chef a écrit — c'est hors
// d'ici qu'il est comparé à celui du projet, et que rien ne part s'il diffère.
/** @param {Projet} projet */
async function desinstallerRetrait(projet) {
  const desinstalle = brigade.desinstaller(projet.nom, confirmation);
  await lireRetrait(projet);
  const pose = await desinstalle;
  // Partie vers la box, la confirmation a servi : une autre désinstallation se confirme de
  // nouveau. Si le chef est passé à un autre projet entre-temps, ce qu'il y écrit est à l'autre.
  if (courant?.nom === projet.nom && pose?.desinstaller.geste?.issue?.etat !== "pas-parti") confirmation = "";
  poserRetrait(projet, pose);
}

// Ce que l'app dit sous ce que la box a rendu à la place des faits.
/** @param {Projet} projet */
const sansForme = (projet) => [
  "The app draws nothing of this project: no color pill, no counters, no rail. A number it has not read is not a zero.",
  `What the box returned is above, as is. What \`${geste(projet, "status")}\` says about the project can still be read, below.`,
].join("\n");
// Quand la box, jointe, n'a pas répondu à `faits` sans que son code dise pourquoi :
// un runtime d'avant cette commande est le cas attendu.
const SANS_REPONSE = [
  "The box was reached, and `facts` did not answer there: what it returned is above, as is.",
  "A runtime older than `facts` is the expected case — it is updated on its box (docs/runtime.md, “Piloter”, line “Mettre à jour”).",
].join("\n");
// Sous toute lecture de `faits` en échec.
/** @param {Projet} projet */
const sansDessin = (projet) => `The app draws nothing of this project: no color pill, no counters, no rail. What \`${geste(projet, "status")}\` got is read below.`;

// La forme d'un ton : la couleur ne porte jamais seule l'information. Un disque plein, un
// losange, un carré, un anneau creux, un triangle — distincts en niveaux de gris. C'est le ton
// que l'app a déjà (faits.ts, grants.ts, manager.ts) qui choisit la forme : rien n'est déduit ici.
/** @type {Record<string, string>} */
const FORMES = { vert: "disque", jaune: "losange", rouge: "carre", bleu: "triangle", gris: "anneau" };
/** @param {string | undefined} ton */
const formeDe = (ton) => (ton === undefined ? undefined : FORMES[ton]);

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
  const cree = document.createElement("span");
  cree.className = "pastille";
  if (ton !== undefined) cree.dataset.ton = ton;
  const forme = formeDe(ton);
  if (forme !== undefined) cree.dataset.forme = forme;
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
  const dit = tenu === undefined ? "first read in progress…" : "tableau" in tenu ? tenu.tableau.etat : `no facts read — ${tenu.titre}`;
  posee.textContent = tenu !== undefined && !("tableau" in tenu) ? "!" : "";
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
  marque.textContent = signal.etat === "urgence" ? "!!" : signal.etat === "alerte" ? "!" : "?";
  marque.title =
    signal.etat === "urgence"
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

// La carte de projet : l'état en un mot, les cinq compteurs comme nombres, les
// cooks en cours — le ticket, son titre, la station de chacun, ou ce qui se lit
// à leur place —, le dernier événement. Sans faits : ce que l'app a obtenu, à leur place.
/** @param {HTMLElement} ou @param {Projet} projet */
function poserCarte(ou, projet) {
  const tenu = tenus.get(projet.nom);
  // Sans box, rien n'est lu : le panneau le dit déjà.
  ou.hidden = projet.box === undefined;
  if (projet.box === undefined) return ou.replaceChildren();
  if (tenu === undefined) return ou.replaceChildren(bloc("p", "facts: first read in progress…"));
  const heure = heureDe(tenu.a);
  if (!("tableau" in tenu)) {
    const titre = bloc("p", `${tenu.titre} — tried at ${heure}, the next follows on its own`);
    titre.className = "sans-faits";
    if ("informe" in tenu) return ou.replaceChildren(titre, lectureIndisponible(document, "the box answered with something the app does not draw", `${tenu.rendu}\n\nThis is not the shape the app draws: ${tenu.informe}.\n${sansForme(projet)}`));
    // Le même cas que sous `status`, avec son renvoi : un refus du geste n'est pas un runtime à mettre à jour.
    return ou.replaceChildren(titre, ...obtenuEnUneLigne(projet, tenu, `${SANS_REPONSE}\n\n${sansDessin(projet)}`));
  }
  const { tableau } = tenu;
  const tete = document.createElement("p");
  tete.className = "etat-projet";
  // Le mot est la pilule : le texte de l'état, avec la pastille de son ton à gauche.
  const pilule = document.createElement("span");
  pilule.className = "pilule";
  if (tableau.ton !== undefined) pilule.dataset.ton = tableau.ton;
  pilule.append(pastille(tableau.etat, tableau.ton), bloc("strong", tableau.etat));
  tete.append(pilule, bloc("small", `read at ${heure} · ${tableau.tick}`));
  const compteurs = document.createElement("dl");
  for (const { libelle, nombre } of tableau.compteurs) {
    const compteur = document.createElement("div");
    compteur.append(bloc("dd", String(nombre)), bloc("dt", libelle));
    compteurs.append(compteur);
  }
  const cooks = document.createElement("ul");
  cooks.className = "cooks";
  cooks.append(
    ...tableau.cooks.enCours.map(({ ticket, titre, station }) => {
      const cook = document.createElement("li");
      const nom = bloc("span", titre);
      nom.title = titre;
      cook.append(exact("strong", `#${ticket}`), nom, exact("small", station));
      return cook;
    }),
  );
  // La ligne que `status` écrit en tête quand la base rouge est en réparation, telle quelle.
  const rienNeCuit = tableau.rienNeCuit === undefined ? [] : [bloc("p", tableau.rienNeCuit)];
  for (const ligne of rienNeCuit) ligne.className = "rien-ne-cuit";
  ou.replaceChildren(tete, ...rienNeCuit, compteurs, tableau.cooks.enCours.length === 0 ? ligneCourte(surMesure(projet, tableau.cooks.vide)) : cooks, bloc("p", `latest event — ${tableau.evenement}`));
}

// Une carte du rail : son numéro, son état, son titre, puis une phrase en mots simples qui dit ce
// qui se passe et, au plus, une ligne de signal (ligne-carte.ts) ; un petit repère quand la file ne
// dit pas tout. Ce que la file dit du ticket en plus est dans sa fiche (`poserDetailsDeFiche`). Dans
// T'attend, la phrase est ce qu'on attend du chef, et son geste — une demande au second — est sur la
// fiche. Dans Livré, la phrase porte l'heure et le résumé ; ses captures restent sur la carte. Et la
// page du ticket, quand `status` en montre une servie, avec son geste direct.
// Tout est déjà rangé par le process principal (faits.ts, bon.ts, page.ts) : la vue pose. Le
// numéro s'ouvre sur l'issue : l'adresse reste au process principal, la vue nomme le ticket.
/** @param {Projet} projet @param {import("../faits.ts").Carte} carte @param {string | undefined} [tonAttend] le ton de T'attend, quand le bon y est posé */
function poserBon(projet, carte, tonAttend) {
  const { ticket, etat, ton, titre, ouvrable, attendu, attend, pr } = carte;
  const bon = document.createElement("li");
  bon.className = "bon";
  // Un clic sur la carte, quelle que soit sa colonne, ouvre sa fiche par-dessus le rail. Ce qui s'y
  // clique déjà — son numéro, sa PR, ses remarques, sa page servie — garde son geste ; un texte
  // qu'on y sélectionne pour le recopier n'ouvre rien. Au clavier, Entrée ou Espace sur la carte.
  bon.tabIndex = 0;
  bon.addEventListener("click", (evenement) => {
    const cible = /** @type {Element | null | undefined} */ (evenement.target);
    if (cible?.closest?.("button, a, summary, input, select, form") || String(globalThis.getSelection?.() ?? "") !== "") return;
    ouvrirFiche(projet, carte, bon);
  });
  bon.addEventListener("keydown", (evenement) => {
    if ((evenement.target ?? bon) !== bon || (evenement.key !== "Enter" && evenement.key !== " ")) return;
    evenement.preventDefault();
    ouvrirFiche(projet, carte, bon);
  });
  const numero = ouvrable ? bouton(`#${ticket}`, () => void ouvrirIssue(projet, ticket)) : bloc("span", `#${ticket}`);
  numero.className = "ticket mono";
  numero.title = ouvrable
    ? `open issue #${ticket} in the browser`
    : etat === undefined
      ? `this ticket is not on the rail that \`${geste(projet, "facts")}\` returns: the app does not have its address`
      : "the address the box returned for this ticket is not https: the app does not open it";
  const tete = document.createElement("div");
  tete.append(numero);
  if (etat !== undefined) {
    // Un mot du runtime que le chef ne lit pas se dit en mots simples : « 86 » est un ticket mis de côté.
    const mot = bloc("span", etat === "86" ? "set aside" : etat);
    mot.className = "etat-ticket";
    if (ton !== undefined) mot.dataset.ton = ton;
    const forme = formeDe(ton);
    if (forme !== undefined) mot.dataset.forme = forme;
    tete.append(mot);
  }
  // Dans T'attend : la pilule le dit en mots, pour qui ne lit pas la couleur de la colonne.
  if (attendu) {
    const pilule = bloc("span", "awaiting you");
    pilule.className = "etat-ticket attendu";
    if (tonAttend !== undefined) pilule.dataset.ton = tonAttend;
    const forme = formeDe(tonAttend);
    if (forme !== undefined) pilule.dataset.forme = forme;
    tete.append(pilule);
  }
  bon.append(tete);
  const cleDuBon = `${projet.nom}#${ticket}`;
  // Un ticket que la box ne nomme pas : son titre est lu sur l'issue, une fois. Ce qui n'est pas lu n'est pas écrit.
  if (titre === undefined && ouvrable && !titres.has(cleDuBon)) void lireTitre(projet, ticket);
  const nomme = titre ?? /** @type {{ titre?: string } | undefined} */ (titres.get(cleDuBon))?.titre;
  if (nomme !== undefined) bon.append(bloc("strong", nomme));
  // Un ticket retenu par `blocked-on-human` : la question qu'on me pose, en une ou deux lignes, et qui l'a posée.
  const retenu = attendu && attend.some((entree) => entree.includes(LABEL_RETENUE));
  if (retenu && ouvrable && !questions.has(cleDuBon)) void lireQuestion(projet, ticket);
  const lueDuBon = retenu ? questions.get(cleDuBon)?.lue : undefined;
  const poseeLa = lueDuBon !== undefined && "question" in lueDuBon ? lueDuBon.question : undefined;
  if (poseeLa !== undefined) {
    const resume = bloc("p", poseeLa.resume);
    resume.className = "question-courte";
    bon.append(resume, bloc("small", `asked by ${poseeLa.auteur}, ${dateHeure(poseeLa.a)}`));
  }
  // Deux lignes au plus : ce qui se passe, et ce qui demande l'attention. Le reste est dans la fiche.
  // Les captures d'un ticket d'interface livré restent sur sa carte : elles se lisent sans un clic.
  if (carte.captures !== undefined) bon.append(...poserCaptures(projet, ticket, carte.captures));
  if (carte.ligne !== undefined) {
    const phrase = bloc("p", carte.ligne);
    phrase.className = "ligne-carte";
    bon.append(phrase);
  }
  if (carte.signal !== undefined) {
    const signal = bloc("p", carte.signal);
    signal.className = "signal";
    bon.append(signal);
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
  if (pr === false) bon.append(bloc("small", "merged PR: the address the box returned is not https, the app does not open it"));
  bon.append(...poserGestesDAttente(projet, carte));
  bon.append(...(pagesServies.get(projet.nom)?.pages ?? []).filter((page) => page.ticket === ticket).map((page) => poserServie(projet, page)));
  bon.append(...(pagesServies.get(projet.nom)?.aLancer ?? []).filter((tenue) => tenue.ticket === ticket).map((tenue) => poserALancer(projet, tenue)));
  return bon;
}

// Le jour de la relance que le formulaire propose : dans sept jours, au calendrier du poste
// (attente.ts, `relanceProposee`) — modifiable.
const relanceProposee = () => {
  const maintenant = new Date();
  const dans = new Date(maintenant.getFullYear(), maintenant.getMonth(), maintenant.getDate() + 7);
  return `${dans.getFullYear()}-${String(dans.getMonth() + 1).padStart(2, "0")}-${String(dans.getDate()).padStart(2, "0")}`;
};

// Les gestes de WAITING d'une carte (faits.ts, `gestes`) : sur une carte de TODO, « waiting for… »,
// qui ouvre son formulaire sur la carte — ce qu'elle attend, dans les mots du chef ; de qui ; le
// jour de la relance, proposé à sept jours ; validé, la commande part dans le second, et la carte
// passe dans WAITING à la lecture qui le voit. Sur une carte de WAITING, « resume » et « it arrived,
// back to the kitchen » : chacun part au clic. Ce qui part se décide dans attente.ts.
/** @param {Projet} projet @param {import("../faits.ts").Carte} carte */
function poserGestesDAttente(projet, carte) {
  const { ticket, gestes } = carte;
  const siens = GESTES_D_ATTENTE.filter(({ id }) => gestes?.includes(/** @type {never} */ (id)));
  if (siens.length === 0) return [];
  const cle = `${projet.nom}#${ticket}`;
  const ouvert = formulairesDAttente.get(cle);
  const poser = siens.find(({ id }) => id === "attente-poser");
  if (poser !== undefined && ouvert !== undefined) return [poserFormulaireDAttente(projet, ticket, cle, ouvert)];
  const rangee = document.createElement("p");
  rangee.className = "gestes attente";
  rangee.append(
    ...siens.map(({ id, libelle }) => {
      const pose = bouton(libelle, () => {
        if (id !== "attente-poser") return void ecrireAttente(projet, id, ticket);
        formulairesDAttente.set(cle, { quoi: "", qui: "", relance: relanceProposee() });
        poserRail(projet);
      });
      pose.dataset.attente = id;
      pose.title =
        id === "attente-poser"
          ? `put #${ticket} in WAITING: say what it waits for, from whom, and when to come back to it`
          : id === "attente-reprendre"
            ? `bring #${ticket} back into TODO, now — it stops waiting`
            : `#${ticket} goes back to the kitchen, without going through TODO`;
      return pose;
    }),
  );
  return [rangee];
}

// Le formulaire « waiting for… » d'une carte de TODO : trois champs, que le chef remplit, puis
// « put in WAITING », qui fait partir la commande — ou dit, sous les champs, pourquoi elle ne part
// pas ; « cancel » le referme, et rien ne part.
/** @param {Projet} projet @param {number} ticket @param {string} cle @param {{ quoi: string, qui: string, relance: string, refus?: string }} ouvert */
function poserFormulaireDAttente(projet, ticket, cle, ouvert) {
  const formulaire = document.createElement("form");
  formulaire.className = "attente";
  /** @param {"quoi" | "qui" | "relance"} champ @param {string} libelle @param {string} [type] */
  const saisie = (champ, libelle, type) => {
    const etiquette = document.createElement("label");
    const entree = /** @type {HTMLInputElement} */ (document.createElement("input"));
    if (type !== undefined) entree.type = type;
    entree.value = ouvert[champ];
    entree.dataset.champ = champ;
    entree.dataset.cle = cle;
    entree.addEventListener("input", () => void (ouvert[champ] = entree.value));
    etiquette.append(bloc("span", libelle), entree);
    return etiquette;
  };
  const valider = bouton("put in WAITING", () => {});
  valider.type = "submit";
  valider.dataset.attente = "attente-poser";
  const renoncer = bouton("cancel", () => {
    formulairesDAttente.delete(cle);
    poserRail(projet);
  });
  renoncer.type = "button";
  const gestes = document.createElement("p");
  gestes.className = "gestes";
  gestes.append(valider, renoncer);
  formulaire.append(
    bloc("strong", `#${ticket} waits for a third party`),
    saisie("quoi", "what it waits for, in your words"),
    saisie("qui", "from whom"),
    saisie("relance", "follow-up on", "date"),
    ...(ouvert.refus === undefined ? [] : [Object.assign(bloc("p", ouvert.refus), { className: "refus" })]),
    gestes,
  );
  formulaire.addEventListener("submit", (soumission) => {
    soumission.preventDefault();
    void ecrireAttente(projet, "attente-poser", ticket, { quoi: ouvert.quoi, qui: ouvert.qui, relance: ouvert.relance });
  });
  return formulaire;
}

// Un geste de WAITING part dans le second, comme un geste du socle : sa sortie s'y lit, sa note dit
// ce qui est parti. Parti, le formulaire se referme ; refusé, il reste, et dit pourquoi.
/** @param {Projet} projet @param {string} id @param {number} ticket @param {{ quoi: string, qui: string, relance: string }} [saisie] */
async function ecrireAttente(projet, id, ticket, saisie) {
  const cle = `${projet.nom}#${ticket}`;
  nonEcrit = nonEcritSecond = "";
  /** @type {string | undefined} */
  let refus;
  try {
    const rendu = await brigade.attente(projet.nom, id, ticket, saisie);
    if (rendu !== undefined && "refus" in rendu) refus = rendu.refus;
    else if (rendu !== undefined) garder(projet.nom, rendu);
  } catch (erreur) {
    refus = `nothing sent: ${erreur instanceof Error ? erreur.message : String(erreur)}`;
  }
  const ouvert = formulairesDAttente.get(cle);
  if (saisie !== undefined && ouvert !== undefined && refus !== undefined) ouvert.refus = refus;
  else if (saisie !== undefined) formulairesDAttente.delete(cle);
  if (refus !== undefined && saisie === undefined) nonEcritSecond = refus;
  montrer();
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
function poserCapture(projet, ticket, ecran, { moment, legende, livree, version }) {
  const figure = document.createElement("figure");
  figure.dataset.moment = moment;
  const cle = `${projet.nom}#${ticket}:${ecran}:${moment}@${version}`;
  if (livree && !capturesLues.has(cle)) void lireCapture(projet, ticket, ecran, moment, cle);
  const lue = livree ? capturesLues.get(cle) : undefined;
  if (lue !== undefined && "image" in lue) {
    const image = /** @type {HTMLImageElement} */ (document.createElement("img"));
    image.src = lue.image;
    image.alt = legende;
    figure.append(image);
  } else {
    const place = bloc("span", !livree ? "missing" : lue === undefined ? "loading…" : "not available");
    place.className = "place";
    if (lue !== undefined && "sans" in lue) place.title = lue.sans;
    figure.append(place);
  }
  const titre = document.createElement("figcaption");
  titre.textContent = legende;
  figure.append(titre);
  return figure;
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
// `status` n'est nulle part sur la fiche : elle se lit tout entière dans Paramètres. Pour un
// ticket livré, ce qui a été livré.
/** @param {Projet} projet @param {import("../faits.ts").Carte} carte */
function poserDetailsDeFiche(projet, carte) {
  const { ticket, livraison, dit } = carte;
  const pose = [];
  if (dit.length > 0) {
    const porte = document.createElement("ul");
    porte.className = "porte";
    porte.append(
      ...dit.map(({ libelle, valeur, exact: recopie }) => {
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

function poserFiche() {
  fiche.hidden = ouverte === undefined;
  rail.inert = !contenu.hidden || !fiche.hidden;
  if (ouverte === undefined) return fiche.replaceChildren();
  const { projet, carte } = ouverte;
  const { ticket, attend } = carte;
  const { titre, priorite, issue, pr, attendu, tete: teteDeLivraison } = carte.fiche;
  const fermer = bouton("close", fermerFiche);
  fermer.className = "fermer";
  fermer.title = "close the sheet (Esc): the rail is back as you left it";
  const tete = document.createElement("header");
  tete.append(exact("span", `#${ticket}`), fermer);
  /** @param {import("../fiche.ts").Ligne} ligne */
  const dite = (ligne) => {
    if ("sans" in ligne) {
      const tue = bloc("dd", ligne.sans);
      tue.className = "sans";
      return tue;
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
  lignes.append(
    rang("priority", dite(priorite)),
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
  panneau.append(tete, ...attente, ...(nomme === undefined ? [] : [nomme]), lignes, ...poserDetailsDeFiche(projet, carte), ...poserHistoire(projet, ticket, carte));
  fiche.replaceChildren(panneau);
  // Un ticket qui t'attend : la question que son issue pose, s'il en pose une — lue à l'ouverture.
  // Retenu par `blocked-on-human` : lever la retenue d'un clic, sans commande à recopier. Puis,
  // pour tout ticket, ses gestes — la demande au second en est. Rien n'est envoyé sans un clic.
  if (attend.length > 0) {
    const cle = `${projet.nom}#${ticket}`;
    if (!questions.has(cle)) void lireQuestion(projet, ticket);
    const question = poserQuestion(projet, ticket, questions.get(cle) ?? {});
    if (question !== undefined) panneau.append(question);
    if (attend.some((entree) => entree.includes(LABEL_RETENUE))) {
      const gestes = document.createElement("div");
      gestes.className = "gestes";
      gestes.append(...poserLevees(projet, ticket));
      panneau.append(gestes);
    }
  }
  panneau.append(poserGestesDeFiche(projet, carte), poserDiscussion(projet, ticket));
}

// Les gestes de la fiche : ceux qu'il est possible de faire sur ce ticket à cet instant, et seulement
// ceux-là — ce qu'on attend de toi d'abord, le recommandé en tête, puis la table du chef, selon son
// état, et ce qui est branché (gestes-fiche.ts) —, un bouton chacun. Un prix nul n'est dit nulle part ;
// un prix se lit au survol du bouton, et un clic sur un geste qui coûte demande d'abord de le
// confirmer, prix dit en une ligne. Ce que fait un clic se lit à droite, dans le second ; ce qui ne
// part pas se dit sous la liste. Le rail et la fiche suivent la lecture suivante de la box.
/** @param {Projet} projet @param {import("../faits.ts").Carte} carte */
function poserGestesDeFiche(projet, carte) {
  const { ticket } = carte;
  const cle = `${projet.nom}#${ticket}`;
  const section = document.createElement("section");
  section.className = "gestes-fiche";
  section.ariaLabel = `what you can do on #${ticket}`;
  section.append(bloc("h4", "what you can do"));
  const proposes = gestesDeFiches.get(cle);
  if (proposes === undefined) {
    section.append(bloc("p", "reading what can be done…"));
    return section;
  }
  if ("sans" in proposes) {
    section.append(lectureIndisponible(document, "actions unavailable", proposes.sans));
    return section;
  }
  const liste = document.createElement("ul");
  for (const propose of proposes) {
    const ligne = document.createElement("li");
    ligne.dataset.geste = propose.id;
    ligne.append(...poserGesteDeFiche(projet, ticket, propose));
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
    section.append(confirmationDeGeste(document, { titre: `${enAttente.libelle} — #${ticket}?`, prix: enAttente.prix, oui: `yes, ${enAttente.libelle}`, non: "cancel" }, { oui: confirmer, non: renoncer }));
  }
  const refus = refusDeFiches.get(cle);
  if (refus !== undefined) {
    const dit = bloc("p", refus);
    dit.className = "refus";
    section.append(dit);
  }
  return section;
}

// Ce qu'un geste de la fiche pose : son bouton — recommandé s'il l'est, son prix au survol — et,
// pour la priorité, de quoi la choisir avant.
/** @param {Projet} projet @param {number} ticket @param {import("../gestes-fiche.ts").Propose} propose @returns {HTMLElement[]} */
function poserGesteDeFiche(projet, ticket, propose) {
  const { id, libelle, prix, recommande, valeurs } = propose;
  const cle = `${projet.nom}#${ticket}`;
  /** @param {() => void} geste @param {string} [aide] */
  const action = (geste, aide) => {
    const pose = boutonAction(document, libelle, geste, { recommande: recommande === true, prix });
    if (aide !== undefined) pose.children[0].title = aide;
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
        if (ficheDe(projet, ticket)) poserFiche();
      };
      if (valeurs === undefined) return [action(jouer)];
      // Une valeur à choisir d'abord : rien n'est choisi d'avance, et rien ne part sans elle.
      const choix = /** @type {HTMLSelectElement} */ (document.createElement("select"));
      choix.ariaLabel = libelle;
      choix.append(new Option("choose…", ""), ...valeurs.map((valeur) => new Option(valeur, valeur)));
      choix.value = prioritesChoisies.get(cle) ?? "";
      const joue = action(() => {
        const valeur = prioritesChoisies.get(cle);
        if (valeur !== undefined) void jouerGesteDeFiche(projet, ticket, id, valeur);
      });
      const cible = joue.children[0];
      cible.disabled = choix.value === "";
      choix.addEventListener("change", () => {
        if (choix.value === "") prioritesChoisies.delete(cle);
        else prioritesChoisies.set(cle, choix.value);
        cible.disabled = choix.value === "";
      });
      return [choix, joue];
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
/** @param {Projet} projet @param {number} ticket @param {string} id @param {string} [valeur] */
async function jouerGesteDeFiche(projet, ticket, id, valeur) {
  const cle = `${projet.nom}#${ticket}`;
  nonEcrit = nonEcritSecond = "";
  refusDeFiches.delete(cle);
  try {
    const rendu = await brigade.gesteDeFiche(projet.nom, id, ticket, valeur);
    if (rendu !== undefined && "refus" in rendu) refusDeFiches.set(cle, rendu.refus);
    else if (rendu !== undefined) {
      garder(projet.nom, rendu);
      if (id === "priorite") prioritesChoisies.delete(cle);
    }
  } catch (erreur) {
    refusDeFiches.set(cle, `nothing sent: ${erreur instanceof Error ? erreur.message : String(erreur)}`);
  }
  if (ficheDe(projet, ticket)) poserFiche();
  montrer();
}
// Ce que la fiche dit de la vie du ticket : ce que son cook fait en ce moment ou ce qui le bloque,
// puis son histoire — chaque étape avec son heure, la relecture en vert ou rouge avec son résumé —
// et son coût. Rien n'est posé qui n'a pas eu lieu ; ce que la box ne communique pas est écrit.
/** @param {Projet} projet @param {number} ticket @param {import("../faits.ts").Carte} carte */
function poserHistoire(projet, ticket, carte) {
  /** @type {HTMLElement[]} */
  const posees = [];
  const dite = situations.get(`${projet.nom}#${ticket}`);
  if (dite !== undefined) {
    const section = document.createElement("section");
    section.className = "situation";
    section.append(bloc("h4", dite.libelle === "blocked" ? "what blocks it" : "right now"), ...dite.lignes.map((ligne) => bloc("p", ligne)));
    posees.push(section);
  }
  const histoire = histoires.get(`${projet.nom}#${ticket}`);
  const section = document.createElement("section");
  section.className = "histoire";
  section.append(bloc("h4", "history"));
  if (histoire === undefined) section.append(bloc("p", "reading the history…"));
  // Une lecture qui manque se dit en une ligne ; ce que la box ou `ssh` a répondu, au survol.
  else if ("sans" in histoire) section.append(lectureIndisponible(document, "history unavailable", histoire.sans));
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
      const dd = bloc("dd", valeur);
      if (valeur === "not communicated") dd.className = "sans";
      pose.append(bloc("dt", libelle), dd);
      return pose;
    };
    cout.append(rangCout("tokens", histoire.cout.tokens), rangCout("duration", histoire.cout.duree), rangCout("attempts", histoire.cout.essais));
    section.append(liste, bloc("h4", "cost"), cout);
    if (histoire.cout.minimum) {
      const note = bloc("p", "at least: a cook has not declared what it spent");
      note.className = "sans";
      section.append(note);
    }
  }
  posees.push(section);
  return posees;
}

// L'histoire de ce ticket, lue sur sa box par le process principal. Une lecture partie avant une autre ne la remplace pas.
/** @param {Projet} projet @param {import("../faits.ts").Carte} carte */
async function lireHistoire(projet, carte) {
  const { ticket } = carte;
  const cle = `${projet.nom}#${ticket}`;
  /** @type {import("../histoire.ts").Histoire} */
  let lue;
  try {
    situations.set(cle, await brigade.situation({ ...(carte.etat === undefined ? {} : { etat: carte.etat }), attend: carte.attend, dit: carte.dit }));
    lue = (await brigade.lireHistoire(projet.nom, ticket)) ?? { sans: "no box for this project: the app has nothing to read" };
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
  section.append(bloc("h4", "the issue and its discussion"));
  const lue = discussions.get(cle);
  if (lue === undefined) {
    section.append(bloc("p", `reading issue #${ticket}…`));
    return section;
  }
  if ("sans" in lue) {
    section.append(lectureIndisponible(document, "discussion unavailable", lue.sans));
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
      const rien = bloc("p", corps === true ? "no description" : "nothing visible — only markers GitHub does not show");
      rien.className = "sans";
      rendu.append(rien);
    } else rendu.append(...poserBlocs(blocs, ouvrir));
    message.append(tete, rendu);
    fil.append(message);
  }
  section.append(fil);
  if (!lue.ouverte) {
    const fermee = bloc("p", "the issue is closed — a comment still posts on it");
    fermee.className = "sans";
    section.append(fermee);
  }
  section.append(...poserCommentaire(projet, ticket));
  return section;
}

// Le champ du commentaire, son bouton et son prix, et ce qu'il est advenu du dernier envoi.
/** @param {Projet} projet @param {number} ticket @returns {HTMLElement[]} */
function poserCommentaire(projet, ticket) {
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
  poster.title = `post what you wrote on issue #${ticket}, as a comment, under the box's GitHub account — public on GitHub, read by the manager and the next cook; nothing is spent`;
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
    const refus = bloc("p", demandee.refus);
    refus.className = "refus";
    poses.push(refus);
  }
  if (envoi) poses.push(bloc("p", "posting your comment on the issue…"));
  else if (etat !== undefined && etat.rendu.poste) {
    const poste = bloc("p", `comment posted on #${ticket} — ${etat.rendu.prix}`);
    poste.className = "postee";
    poses.push(poste);
  } else if (etat !== undefined && !etat.rendu.poste) {
    const refus = bloc("p", etat.rendu.refus);
    refus.className = "refus";
    poses.push(refus);
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
  if (rendu.poste || rendu.peutEtre === true) await lireDiscussion(projet, ticket);
}

// « ask the second », au clic : la box compose la demande avec le contexte du champ, et le process
// principal l'écrit dans le second, sans Entrée. Le champ n'est pas vidé. Injoignable, rien n'est
// écrit, et la fiche dit pourquoi.
/** @param {Projet} projet @param {number} ticket */
async function demanderAuSecond(projet, ticket) {
  const cle = `${projet.nom}#${ticket}`;
  const avant = demandesAuSecond.get(cle);
  if (avant !== undefined && "envoi" in avant) return;
  demandesAuSecond.set(cle, { envoi: true });
  if (ficheDe(projet, ticket)) poserFiche();
  /** @type {{ envoi: true } | { parti: string } | { refus: string }} */
  let dit;
  try {
    const rendu = await brigade.demanderAuSecond(projet.nom, ticket, commentaires.get(cle) ?? "");
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
  if (ficheDe(projet, ticket)) poserFiche();
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
    lue = (await brigade.lireDiscussion(projet.nom, ticket)) ?? { sans: "no box for this project: the app has nothing to read" };
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
  return [retirer, fermer, confirmationDeGeste(document, { titre: `close issue #${ticket} on GitHub?`, prix: PRIX_DE_FERMETURE, oui: "yes, close the issue", non: "cancel" }, { oui: () => void lancer("fermer"), non: renoncer })];
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
  questions.set(cle, { lue });
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
/** @param {Projet} projet @param {number} ticket @param {{ question: string, choix: string } | { question: string, texte: string }} reponse */
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
  questions.set(cle, { ...(lue === undefined ? {} : { lue }), rendue });
  if (rendue.poste) brouillons.delete(cle);
  if (ficheDe(projet, ticket)) poserFiche();
}

// Sur la fiche d'un ticket qui t'attend, la question que son issue pose : le commentaire du
// manager, mot pour mot — rien n'est reformulé —, ce qui a été écrit dessous depuis, puis la
// réponse : un bouton par choix qu'elle propose, un champ pour une phrase. Un clic sur un choix,
// et il part ; la phrase part par son bouton — Entrée ne l'envoie pas. Rien n'est choisi d'avance.
// Aucune question sur l'issue : rien n'est posé, l'entrée garde son geste.
/** @param {Projet} projet @param {number} ticket @param {{ lue?: import("../question.ts").Lue, envoi?: boolean, rendue?: import("../question.ts").Rendue }} etat */
function poserQuestion(projet, ticket, { lue, envoi, rendue }) {
  if (lue !== undefined && "aucune" in lue) return undefined;
  const section = document.createElement("section");
  section.className = "question";
  if (lue === undefined) {
    section.append(bloc("small", `reading issue #${ticket}, for the question it asks…`));
    return section;
  }
  if ("sans" in lue) {
    section.append(lectureIndisponible(document, "question unavailable", lue.sans));
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
    const postee = bloc("p", `answer posted on #${ticket}, in your name: “${rendue.corps}” — the manager reads it at its next tick; the card leaves your queue once it has.`);
    postee.className = "postee";
    section.append(postee);
    return section;
  }
  const cle = `${projet.nom}#${ticket}`;
  const reponse = document.createElement("div");
  reponse.className = "reponse";
  for (const { lettre, texte: dit } of question.choix) {
    const choix = bouton(`${lettre}) ${dit}`, () => void repondreQuestion(projet, ticket, { question: question.url, choix: lettre }));
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
  const poster = bouton("post this answer", () => void repondreQuestion(projet, ticket, { question: question.url, texte: saisie.value }));
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
    const refus = bloc("small", rendue.refus);
    refus.className = "refus";
    section.append(refus);
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
// relue toutes les trente secondes —, une mention discrète dit depuis quand, et où est la provenance.
const LECTURE_VIEILLE_MS = 120_000;
/** @param {number | string} a */
function fraicheur(a) {
  const age = Date.now() - new Date(a).getTime();
  if (!(age > LECTURE_VIEILLE_MS)) return [];
  const minutes = Math.floor(age / 60_000);
  const dit = bloc("p", `up to date ${minutes} min ago — the box has not answered since; the commands and read times are in Settings`);
  dit.className = "fraicheur";
  return [dit];
}
// Le rail vieillit sans qu'aucune lecture n'arrive : sa mention se repose d'elle-même.
setInterval(() => {
  if (courant !== undefined && tenus.has(courant.nom) && !rail.hidden) poserRail(courant);
}, 15_000);

// D'où vient ce qui se lit sur le rail, dans Paramètres : les commandes et l'heure de chaque lecture.
/** @param {Projet} projet @param {string} heure @param {number | string | undefined} attendLu @param {number | string | undefined} railLu */
function poserProvenance(projet, heure, attendLu, railLu) {
  provenance.hidden = false;
  const status = `\`${geste(projet, "status")}\``;
  const lu = attendLu ?? railLu;
  provenanceLignes.replaceChildren(
    bloc("p", `the columns, from \`${geste(projet, "facts")}\` — read at ${heure}, in service order`),
    bloc(
      "p",
      lu === undefined
        ? `${status} was not read: each card carries only what \`facts\` says`
        : `${status}, read at ${heureDe(lu)}: ${attendLu === undefined ? "its `attend` block was not taken" : "its `attend` block says what awaits you"}, ${railLu === undefined ? "its `rail` line was not read — each card carries only what `facts` says" : "its `rail` line what each card carries besides"}`,
    ),
    bloc("p", "a number on a card opens the issue"),
  );
}

// « stop the kitchen » est un geste rare et lourd : il est rangé dans Paramètres, sous sa propre
// forme (un carré plein, rouge), pas sur le chemin de tous les jours. Tant qu'elle est déjà à
// l'arrêt, le geste n'est pas posé : la reprendre est sur la bannière et la bande.
/** @param {Projet} projet @param {boolean} arretee */
function poserArreter(projet, arretee) {
  const arreter = GESTES_DE_LA_CUISINE.find(({ id }) => id === "stop");
  arreterCuisine.hidden = arretee || arreter === undefined;
  if (arreterCuisine.hidden || arreter === undefined) return arreterCuisine.replaceChildren();
  const poses = poserGeste(projet, { ...arreter, ou: "parametres" });
  if (poses[0] !== undefined) poses[0].dataset.arret = "";
  arreterCuisine.replaceChildren(ditEtAide("h3", "stopping the kitchen", "stops the running cooks and holds the rail. It says what it costs before anything goes."), ...poses);
}

// En tête du rail, ce qui n'est pas encore dessus (amont.ts) : un nombre — « 23 upcoming » — qui
// déplie la liste, et, quand aucun ticket n'est sur le rail, ce qui est en amont et ce que le manager
// en fait. Tout est déjà dit par le process principal : la vue pose. Une lecture ratée ne donne
// jamais de nombre : le bouton dit qu'elle n'a pas été lue, et la liste dépliée dit pourquoi.
/** @param {Projet} projet @param {import("../faits.ts").Rail} lu @param {import("../faits.ts").Carte[]} cartes */
function poserAmont(projet, { aucunTicket }, cartes) {
  const vu = amonts.get(projet.nom);
  const commande = geste(projet, "manager upstream");
  const tete = document.createElement("div");
  tete.className = "amont";
  // Le haut du rail reste léger (ticket 623) : la commande lue se dit au survol, pas en tête.
  if (vu === undefined) {
    const lecture = bloc("span", "upcoming: being read…");
    lecture.title = `first read of \`${commande}\` in progress`;
    tete.append(lecture);
  } else {
    const deplie = amontsDeplies.has(projet.nom);
    const nombre = bouton("compte" in vu ? `${vu.compte} upcoming` : "upcoming: not read", () => {
      if (amontsDeplies.has(projet.nom)) amontsDeplies.delete(projet.nom);
      else amontsDeplies.add(projet.nom);
      poserRail(projet);
    });
    nombre.className = "nombre";
    nombre.ariaExpanded = String(deplie);
    nombre.title = "compte" in vu ? `the open issues that are not on the rail, and what happens to each — from \`${commande}\`, read at ${heureDe(vu.a)}` : vu.sans;
    tete.append(nombre);
  }
  // Rien sur le rail : la phrase dit ce qui est en amont — elle ne laisse pas croire le projet fini.
  if (aucunTicket === true) {
    const vide = bloc("p", vu?.vide ?? "nothing on the rail — what is upcoming is being read…");
    vide.className = "vide";
    tete.append(vide);
  }
  if (vu === undefined || !amontsDeplies.has(projet.nom)) return [tete];
  return [tete, listeAmont(projet, vu, cartes)];
}

// La tête du rail, le manager éteint (ticket 906) : marquée à l'arrêt, d'une ligne courte — rien de neuf
// n'entre sur le rail. Ce qui y est déjà continue : seule l'entrée est à l'arrêt. Allumé, pas encore
// lu ou pas lu, rien : l'interrupteur, en tête de l'espace, dit ce qu'il en est.
/** @param {Projet} projet @returns {HTMLElement[]} */
function teteDuRail(projet) {
  const lu = etatsDuManager.get(projet.nom);
  if (lu === undefined || "sans" in lu || lu.allume) return [];
  const tete = document.createElement("p");
  tete.className = "arret-manager";
  tete.append(pastille("off", "gris"), bloc("strong", lu.dit ?? "manager off"));
  tete.title = `${lu.releve}\nturn it on with its switch, at the top of the space`;
  return [tete];
}

// La liste dépliée : chaque issue sous ce qui lui arrive, son numéro, son titre, ce que la box en dit.
// Un clic ouvre sa fiche par-dessus le rail — celle de sa carte, si elle en a une dans TODO.
/** @param {Projet} projet @param {import("../amont.ts").Vu} vu @param {import("../faits.ts").Carte[]} cartes */
function listeAmont(projet, vu, cartes) {
  const liste = document.createElement("section");
  liste.className = "amont-liste";
  liste.ariaLabel = "upcoming: the open issues not on the rail";
  if ("sans" in vu) {
    const dit = bloc("p", vu.sans);
    dit.className = "sans";
    liste.append(dit);
    return liste;
  }
  if (vu.groupes.length === 0) liste.append(bloc("p", "nothing upcoming: every open issue of the repository is on the rail"));
  for (const { etat, nom, issues } of vu.groupes) {
    const groupe = document.createElement("section");
    groupe.dataset.etat = etat;
    const titre = document.createElement("h4");
    titre.append(bloc("span", nom), bloc("span", String(issues.length)));
    const lignes = document.createElement("ol");
    lignes.append(
      ...issues.map((issue) => {
        const ligne = document.createElement("li");
        ligne.className = "bon";
        const carte = cartes.find(({ ticket }) => ticket === issue.ticket) ?? { ticket: issue.ticket, titre: issue.titre, ouvrable: issue.ouvrable, attendu: false, attend: [], dit: [], fiche: issue.fiche };
        const ouvrir = bouton("", () => ouvrirFiche(projet, carte, ouvrir));
        ouvrir.title = `open the sheet of #${issue.ticket}`;
        ouvrir.append(exact("span", `#${issue.ticket}`), bloc("span", issue.titre));
        const dit = bloc("small", issue.dit);
        dit.title = issue.dit;
        ligne.append(ouvrir, dit);
        return ligne;
      }),
    );
    groupe.append(titre, lignes);
    liste.append(groupe);
  }
  return liste;
}

// Le rail en six colonnes — Sur le rail, Au travail, Pass, TODO, WAITING, Livré —,
// tel que le process principal l'a rangé (faits.ts) : la vue pose, colonne par
// colonne. C'est la vue principale de l'espace : il est posé au centre, quel que soit
// l'onglet affiché dessous. Un projet sans box n'en a pas : rien n'est lu de lui. Sans
// faits, il dit pourquoi il n'est pas dessiné : la carte du panneau dit ce qui a été obtenu.
/** @param {Projet} projet */
function poserRail(projet) {
  const tenu = tenus.get(projet.nom);
  rail.hidden = projet.box === undefined || projet.desinstalle !== undefined;
  provenance.hidden = arreterCuisine.hidden = true;
  // Plus de rail, plus de fiche par-dessus.
  if (rail.hidden && ouverte !== undefined) fermerFiche();
  if (rail.hidden) return rail.replaceChildren();
  if (tenu === undefined) return rail.replaceChildren(bloc("h3", `the rail: first read of \`${geste(projet, "facts")}\` in progress…`));
  const heure = heureDe(tenu.a);
  if (!("tableau" in tenu)) return rail.replaceChildren(bloc("h3", `the rail is not drawn: ${tenu.titre} — tried at ${heure}. What the app got is in the panel, on the right`));
  const { colonnes, hors, attendLu, railLu } = tenu.tableau.rail;
  // Le bon posé pour chaque carte : celui de la fiche ouverte y reprend le clavier.
  /** @type {Map<import("../faits.ts").Carte, HTMLElement>} */
  const posees = new Map();
  /** @param {import("../faits.ts").Carte[]} cartes @param {string} [ton] */
  const bons = (cartes, ton) => {
    const liste = document.createElement("ol");
    liste.append(
      ...cartes.map((carte) => {
        const bon = poserBon(projet, carte, ton);
        posees.set(carte, bon);
        return bon;
      }),
    );
    return liste;
  };
  const grille = document.createElement("div");
  grille.className = "colonnes";
  grille.append(
    ...colonnes.map(({ nom, ton, compte, cartes, vide, defile }) => {
      const colonne = document.createElement("section");
      colonne.className = "colonne";
      colonne.dataset.ton = ton;
      // Livré s'allonge tout le jour : ses cartes défilent dans leur hauteur, les autres colonnes restent en vue.
      if (defile) colonne.dataset.defile = "";
      const forme = formeDe(ton);
      if (forme !== undefined) colonne.dataset.forme = forme;
      const tete = document.createElement("h4");
      tete.append(bloc("span", nom), bloc("span", compte));
      colonne.append(tete, cartes.length === 0 ? bloc("p", surMesure(projet, vide)) : bons(cartes, ton));
      return colonne;
    }),
  );
  // D'où vient ce qui se lit n'est pas en tête du rail : cela ne change rien à ce que fait le chef.
  // C'est dans Paramètres, pour le jour d'une panne ; en tête, seule une lecture vieille se dit.
  poserProvenance(projet, heure, attendLu, railLu);
  poserArreter(projet, tenu.tableau.arretee);
  // Une page servie dont le ticket n'a pas de carte se pose à part, sous le rail : son geste n'est pas perdu.
  const cartes = new Set([...colonnes.flatMap(({ cartes: siennes }) => siennes), ...hors].map(({ ticket }) => ticket));
  const sansCarte = [
    ...(pagesServies.get(projet.nom)?.pages ?? []).filter(({ ticket }) => !cartes.has(ticket)).map((page) => () => poserServie(projet, page, true)),
    ...(pagesServies.get(projet.nom)?.aLancer ?? []).filter(({ ticket }) => !cartes.has(ticket)).map((tenue) => () => poserALancer(projet, tenue, true)),
  ];
  /** @param {(() => HTMLElement)[]} poses */
  const servis = (poses) => {
    const liste = document.createElement("ol");
    liste.append(
      ...poses.map((poser) => {
        const bon = document.createElement("li");
        bon.className = "bon";
        bon.append(poser());
        return bon;
      }),
    );
    return liste;
  };
  // La fiche ouverte suit la lecture : elle dit ce que la dernière dit de son ticket.
  if (ouverte !== undefined) suivreFiche([...colonnes.flatMap(({ cartes: siennes }) => siennes), ...hors], posees);
  // Un formulaire « waiting for… » dont le ticket n'est plus dans TODO se referme : il n'a plus de carte où se poser.
  for (const cle of formulairesDAttente.keys()) {
    const [nom, numero] = cle.split("#");
    if (nom === projet.nom && !colonnes.some(({ cartes: siennes }) => siennes.some(({ ticket, gestes }) => String(ticket) === numero && gestes?.includes("attente-poser")))) formulairesDAttente.delete(cle);
  }
  // Le champ où le chef tapait garde le clavier : le rail redessiné le lui rend.
  const tape = /** @type {HTMLInputElement | null | undefined} */ (document.activeElement);
  const reprise = tape?.dataset?.cle === undefined ? undefined : { cle: tape.dataset.cle, champ: tape.dataset.champ };
  rail.replaceChildren(
    ...fraicheur(tenu.a),
    ...teteDuRail(projet),
    ...poserAmont(projet, tenu.tableau.rail, [...colonnes.flatMap(({ cartes: siennes }) => siennes), ...hors]),
    grille,
    ...(hors.length === 0 ? [] : [bloc("h3", `outside the six columns — their state is none of them, and nothing says they await you: the Rail read, in Settings, relays what \`${geste(projet, "rail")}\` says`), bons(hors)]),
    ...(sansCarte.length === 0 ? [] : [bloc("h3", `served, without a card on the rail — \`${geste(projet, "status")}\` shows their server`), servis(sansCarte)]),
  );
  if (reprise !== undefined) [...rail.querySelectorAll("input")].find(({ dataset }) => dataset.cle === reprise.cle && dataset.champ === reprise.champ)?.focus();
}

// L'écran à regarder d'une livraison, tel que `status` le dit : l'écran, la phrase du cook — celle
// qu'on montre —, et, s'il est déduit des fichiers touchés, la mention qui le dit, mot pour mot.
// Jamais une liste de fichiers. Rien sans écran.
/** @param {import("../page.ts").Ecran | null} ecran @returns {HTMLElement[]} */
function poserEcran(ecran) {
  if (ecran === null) return [];
  const nom = document.createElement("p");
  nom.className = "ecran";
  nom.append("screen to look at: ", exact("span", ecran.nom));
  const phrase = ecran.phrase === null ? [] : [bloc("p", ecran.phrase)];
  phrase.forEach((posee) => (posee.className = "phrase"));
  const deduit = ecran.deduit === null ? [] : [bloc("small", ecran.deduit)];
  deduit.forEach((posee) => (posee.className = "deduit"));
  return [nom, ...phrase, ...deduit];
}

// Une page servie : le worktree, son port, l'état de son serveur, l'écran à regarder, et son geste —
// un seul, direct, qui ouvre l'écran dans le navigateur du poste. Sans page à voir, pas de geste :
// ce que `status` écrit à sa place se lit dessous. Un geste qui n'est pas posé dit pourquoi, dessous.
// Elle se pose sur la carte de son ticket ; `ticket` : sans carte, elle le nomme elle-même. Tout est
// déjà décidé dans le process principal (page.ts) : la vue pose.
/** @param {Projet} projet @param {import("../page.ts").Page} page @param {boolean} [ticket] */
function poserServie(projet, { ticket: numero, worktree, port, etat, route, sansPage, ecran, raison, enCours, dit }, ticket = false) {
  const page = document.createElement("div");
  page.className = "servie";
  const tete = document.createElement("div");
  // Le worktree et son port se recopient : eux seuls sont en monospace, la phrase reste la même.
  const servi = document.createElement("span");
  servi.append(exact("span", worktree), " · port ", exact("span", String(port)), ` · ${etat}`);
  tete.append(...(ticket ? [exact("strong", `#${numero}`)] : []), servi);
  if (route !== null) {
    const ouvre = bouton(enCours ? "opening…" : "see it in my browser", () => {
      ouvre.disabled = true;
      ouvre.textContent = "opening…";
      void ouvrirPage(projet, worktree);
    });
    ouvre.disabled = raison !== undefined || enCours;
    ouvre.dataset.geste = "direct";
    tete.append(ouvre);
  }
  page.append(tete, ...poserEcran(ecran));
  if (route === null && sansPage !== undefined) page.append(bloc("p", surMesure(projet, sansPage)));
  if (raison !== undefined) page.append(bloc("p", surMesure(projet, raison)));
  if (dit !== undefined) {
    const rendu = propos(dit.texte);
    rendu.dataset.ouverte = String(dit.ouverte);
    page.append(rendu);
  }
  return page;
}

// Une livraison d'une app qui ne s'ouvre pas dans un navigateur : son worktree, l'écran à regarder,
// et comment le voir, tel que `status` le dit — aucun geste, aucune page. Elle se pose sur la carte
// de son ticket ; `ticket` : sans carte, elle le nomme elle-même.
/** @param {Projet} projet @param {import("../page.ts").ALancer} tenue @param {boolean} [ticket] */
function poserALancer(projet, { ticket: numero, worktree, commentLeVoir, ecran }, ticket = false) {
  const tenue = document.createElement("div");
  tenue.className = "servie";
  const tete = document.createElement("div");
  const tenu = document.createElement("span");
  tenu.append(exact("span", worktree), " · no page in a browser");
  tete.append(...(ticket ? [exact("strong", `#${numero}`)] : []), tenu);
  const comment = document.createElement("p");
  comment.className = "comment";
  comment.append("how to see it: ", commentLeVoir);
  tenue.append(tete, ...poserEcran(ecran), comment);
  return tenue;
}

// Les pages servies du projet affiché, sous l'état : ce que `status` montre de ses serveurs — ou
// ce qui se lit à sa place. Le geste de chaque page n'est pas ici : il est sur la carte de son
// ticket, sur le rail. Tout est déjà décidé dans le process principal (page.ts) : la vue pose.
/** @param {Projet} projet @param {Pages | undefined} servies */
function poserPages(projet, servies) {
  pages.hidden = servies === undefined;
  if (servies === undefined) return pages.replaceChildren();
  /** @param {string} texte */
  const alerte = (texte) => {
    const dite = bloc("p", surMesure(projet, texte));
    dite.className = "refus";
    return dite;
  };
  const n = servies.pages.length;
  pages.replaceChildren(
    ditEtAide("h3", "look at a delivery in your browser", `the servers \`${geste(projet, "status")}\` shows`),
    ...(servies.refus === undefined ? [] : [alerte(servies.refus)]),
    ...(n === 0 ? [] : [ditEtAide("p", `${n} page${n > 1 ? "s" : ""} served (${servies.pages.map(({ ticket }) => `#${ticket}`).join(", ")})`, "each opens from its ticket's card, on the rail")]),
    ...(servies.aLancer.length === 0
      ? []
      : [ditEtAide("p", `${servies.aLancer.length} deliver${servies.aLancer.length > 1 ? "ies" : "y"} of an app that does not open in a browser (${servies.aLancer.map(({ ticket }) => `#${ticket}`).join(", ")})`, "its ticket's card says how to see it")]),
    ...(servies.vide === undefined ? [] : [bloc("p", surMesure(projet, servies.vide))]),
    ...(n > 0 && servies.illisibles.length > 0 ? [bloc("p", "under `serveurs`, what the app could not read — no action:")] : []),
    ...servies.illisibles.map((ligne) => bloc("pre", ligne)),
    ...(n > 0 && servies.empeche.length > 0 ? [bloc("p", "what keeps this project from being served, from the same read:")] : []),
    ...servies.empeche.map((ligne) => bloc("pre", ligne)),
    ...(servies.rappel === undefined ? [] : [bloc("small", servies.rappel)]),
  );
}

// Un instant que la box a écrit, à l'heure de ce poste — tel quel, s'il n'en est pas un.
/** @param {string} instant */
const quand = (instant) => (Number.isNaN(Date.parse(instant)) ? instant : dateHeure(instant));

// Une liste lue dans la sortie d'un onglet, sous son titre : ses lignes, ce qui se lit à leur
// place quand elle n'en a pas, et ce que l'app n'a pas su y lire, tel quel.
/** @template L @param {string} titre @param {import("../manager.ts").Liste<L>} liste @param {(ligne: L) => (Node | string)[]} poser */
function listeLue(titre, { lignes, illisibles, vide }, poser) {
  const posees = document.createElement("ol");
  posees.append(
    ...lignes.map((ligne) => {
      const posee = document.createElement("li");
      posee.append(...poser(ligne));
      return posee;
    }),
  );
  return [
    bloc("h4", titre),
    ...(vide === undefined ? [] : [bloc("p", vide)]),
    ...(lignes.length === 0 ? [] : [posees]),
    ...(illisibles.length === 0 ? [] : [bloc("p", "under this heading, what the app could not read — as is:"), bloc("pre", illisibles.join("\n"))]),
  ];
}
// La tête d'une de ces lignes : l'issue, et l'instant.
/** @param {{ a: string, ticket: number }} ligne */
function teteDIssue({ a, ticket }) {
  const posee = document.createElement("div");
  posee.append(exact("strong", `#${ticket}`), bloc("small", quand(a)));
  return posee;
}

// Ce qu'un usage de grant laisse derrière lui : sa PR et son commit se recopient, son verdict se lit.
/** @param {import("../grants.ts").Usage} usage */
function tracesDUsage({ pr, commit, verdict }) {
  const posees = document.createElement("small");
  posees.append(exact("span", pr), " · ", exact("span", commit), ` · ${verdict}`);
  return posees;
}

// L'état du manager du projet affiché, au-dessus du texte de l'onglet Manager : l'interrupteur
// — allumé ou éteint, depuis quand et par qui —, ses deux gestes, puis ses dernières décisions
// et ce qu'il a écarté, chaque écart avec son motif. Tout est déjà lu par le process principal
// (manager.ts), dans la sortie qui se lit dessous : la vue pose. Sans état lu, elle dit pourquoi
// — jamais « éteint » — et les gestes restent : ils n'attendent rien de la lecture. Éteindre part
// au clic ; allumer ouvre sa confirmation, qui dit ce qu'il engage.
// La tête de l'onglet Cost (cost/tete.js) : les tokens lancés sur 5 h, 24 h et 7 jours, tous
// projets confondus, et la part de chacun — chaque projet qui a une box, et qu'elle sert encore.
// Dessous, la courbe des derniers jours, une série par projet (cost/courbe.js).
function poserCout() {
  cout.hidden = courant === undefined || actif() !== COUT;
  if (cout.hidden) return cout.replaceChildren();
  const projets = configuration.projets
    .filter(({ box, desinstalle }) => box !== undefined && desinstalle === undefined)
    .map(({ nom, couleurs }) => ({ nom, teinte: couleurs?.onglet ?? couleurs?.accent }));
  cout.replaceChildren(poserTete(document, projets, coutsLus), poserChers(document, projets, coutsLus, titreSurLeRail, ouvrirFicheDeCout), poserCourbe(document, projets, coutsLus));
}

// La carte d'un ticket sur le rail d'un projet, si son rail est lu et qu'il y est.
/** @param {string} nom @param {number} ticket */
function carteSurLeRail(nom, ticket) {
  const tenu = tenus.get(nom);
  if (tenu === undefined || !("tableau" in tenu)) return undefined;
  const { colonnes, hors } = tenu.tableau.rail;
  return [...colonnes.flatMap(({ cartes }) => cartes), ...hors].find((carte) => carte.ticket === ticket);
}
/** @param {string} nom @param {number} ticket */
const titreSurLeRail = (nom, ticket) => carteSurLeRail(nom, ticket)?.titre;

// Un clic sur un des tickets les plus chers de Cost ouvre sa fiche, par-dessus l'onglet. Un ticket
// que le rail ne porte pas (ou pas encore lu) s'ouvre avec ce que l'on en sait : son numéro.
/** @param {string} nom @param {number} ticket @param {HTMLElement} retour */
function ouvrirFicheDeCout(nom, ticket, retour) {
  const projet = configuration.projets.find((candidat) => candidat.nom === nom);
  if (projet === undefined) return;
  const sans = { sans: "not communicated — the rail of this project is not read" };
  const carte = carteSurLeRail(nom, ticket) ?? { ticket, ouvrable: false, attendu: false, attend: [], dit: [], fiche: { titre: sans, priorite: sans, issue: sans } };
  ouvrirFiche(projet, carte, retour);
}

function poserManager() {
  const projet = courant;
  // Sans box, rien n'est lu et rien ne s'écrit : l'onglet le dit déjà.
  manager.hidden = projet === undefined || projet.box === undefined || actif() !== "manager";
  if (projet === undefined || manager.hidden) return manager.replaceChildren();
  const vu = managerVu?.projet === projet.nom ? managerVu : undefined;

  const gestes = document.createElement("div");
  gestes.className = "gestes";
  gestes.append(...GESTES_DU_MANAGER.flatMap(({ id, libelle }) => poserGeste(projet, { id, libelle, ou: "manager" })));

  // L'heure n'est dite que d'un état lu : celle d'un essai raté se lit dessous, avec ce qu'il a rendu.
  const titre = bloc("h3", `the manager${vu === undefined || "sans" in vu ? "" : ` — read at ${heureDe(vu.a)}`}`);
  titre.append(survol(document, `from \`${geste(projet, "manager")}\``));
  if (vu === undefined) return manager.replaceChildren(titre, bloc("p", "first read in progress…"), gestes);
  if ("sans" in vu) return manager.replaceChildren(titre, lectureIndisponible(document, "the manager state could not be read", vu.sans), gestes);

  const { mot, ton, depuis, par, dit } = vu.interrupteur;
  const interrupteur = document.createElement("p");
  interrupteur.className = "interrupteur";
  interrupteur.append(pastille(mot, ton), bloc("strong", mot), ...(depuis === undefined || par === undefined ? [] : [bloc("span", `since ${quand(depuis)} · by ${par}`)]));
  manager.replaceChildren(
    titre,
    interrupteur,
    bloc("p", dit),
    gestes,
    ...listeLue("latest decisions — most recent first", vu.decisions, (decision) => [teteDIssue(decision), bloc("p", decision.dit)]),
    ...listeLue("set aside — each with its reason", vu.ecartees, (ecart) => [teteDIssue(ecart), bloc("p", ecart.motif), ...(ecart.rend === undefined ? [] : [bloc("small", ecart.rend)])]),
  );
}

// L'état des grants du projet affiché, au-dessus du texte de l'onglet Grants : un bloc par grant
// — actif ou non, depuis quand et par qui, son échéance, ses deux gestes, ses derniers usages —,
// puis ce qu'aucun grant n'autorise. De l'échéance, la durée restante se pose en tête, l'heure
// ensuite : c'est la box qui l'a comptée, à l'heure de la lecture. Tout est déjà lu par le process
// principal (grants.ts), dans la sortie qui se lit dessous : la vue pose. Sans état lu, elle dit
// pourquoi — jamais « aucun grant actif » — et les gestes restent : ils n'attendent rien de la
// lecture. Chacun ouvre sa confirmation, qui dit ce que le grant change : rien ne part avant son « oui ».
function poserGrants() {
  const projet = courant;
  // Sans box, rien n'est lu et rien ne s'écrit : l'onglet le dit déjà.
  grants.hidden = projet === undefined || projet.box === undefined || actif() !== "grants";
  if (projet === undefined || grants.hidden) return grants.replaceChildren();
  const vu = grantsVus?.projet === projet.nom ? grantsVus : undefined;

  // Les deux gestes d'un grant : chacun le nomme, sur son bouton comme dans ce qu'il écrit.
  /** @param {string} action */
  const gestes = (action) => {
    const poses = document.createElement("div");
    poses.className = "gestes";
    poses.append(...GESTES_DES_GRANTS.flatMap(({ id, libelle }) => poserGeste(projet, { id, libelle: `${libelle} ${action}`, ou: "grants", grant: action })));
    return poses;
  };

  // L'heure n'est dite que d'un état lu : celle d'un essai raté se lit dessous, avec ce qu'il a rendu.
  const titre = bloc("h3", `the grants${vu === undefined || "sans" in vu ? "" : ` — read at ${heureDe(vu.a)}`}`);
  titre.append(survol(document, `from \`${geste(projet, "grant")}\``));
  if (vu === undefined) return grants.replaceChildren(titre, bloc("p", "first read in progress…"), ...GRANTS_NOMMES.map(gestes));
  if ("sans" in vu) return grants.replaceChildren(titre, lectureIndisponible(document, "the grants state could not be read", vu.sans), ...GRANTS_NOMMES.map(gestes));

  /** @param {import("../grants.ts").GrantVu} grant */
  const poser = (grant) => {
    const pose = document.createElement("article");
    const nomme = document.createElement("p");
    nomme.className = "interrupteur";
    if ("sans" in grant) {
      nomme.append(pastille("", undefined), bloc("strong", `grant ${grant.action}`));
      pose.append(nomme, lectureIndisponible(document, "this grant could not be read", grant.sans));
    } else {
      const { mot, ton, depuis, par, bientot, echeance, limites, dit } = grant;
      nomme.append(
        pastille(mot, ton),
        bloc("strong", `grant ${grant.action}`),
        bloc("strong", mot),
        ...(bientot === undefined ? [] : [bloc("em", bientot)]),
        ...(depuis === undefined ? [] : [bloc("span", `since ${quand(depuis)}${par === undefined ? "" : ` · by ${par}`}`)]),
      );
      // Ce qu'il en reste : la durée d'abord, l'heure ensuite, puis ce que la ligne en dit d'autre.
      const reste = document.createElement("p");
      reste.className = "echeance";
      reste.append(...(echeance === undefined ? [] : [bloc("strong", echeance.reste), bloc("span", echeance.jusqua)]), ...limites.map((limite) => bloc("span", limite)));
      pose.append(nomme, ...(reste.childElementCount === 0 ? [] : [reste]), ...(dit === "" ? [] : [bloc("p", dit)]));
    }
    pose.append(
      grant.commandable ? gestes(grant.action) : bloc("small", "no action here for this grant"),
      ...listeLue(`latest uses of the ${grant.action} grant — most recent first`, grant.usages, (usage) => [teteDIssue(usage), bloc("p", `${usage.suite} — on ${usage.base}`), tracesDUsage(usage)]),
    );
    return pose;
  };

  grants.replaceChildren(
    titre,
    ...vu.grants.map(poser),
    ...(vu.illisibles.length === 0 ? [] : [bloc("p", "under `derniers usages`, what the app could not read, or attach to a grant — as is:"), bloc("pre", vu.illisibles.join("\n"))]),
    ...listeLue("what no grant allows — not even if you ask", vu.interdits, (interdit) => [bloc("strong", interdit.action), bloc("p", interdit.dit)]),
    ...(vu.bilan === undefined ? [] : [bloc("h4", "the deliveries stopped for lack of a grant"), bloc("p", vu.bilan)]),
  );
}

// Le geste : le process principal amène le port du worktree sur ce poste et ouvre le
// navigateur. Ce qu'il en advient revient posé — le chef a pu changer d'espace entre-temps.
/** @param {Projet} projet @param {string} worktree */
async function ouvrirPage(projet, worktree) {
  const rendues = await brigade.ouvrirPage(projet.nom, worktree);
  if (rendues !== undefined) servir(projet, rendues);
}

// Les pages d'un projet, telles qu'elles viennent d'être rendues : sous l'état, et sur les cartes
// du rail — si c'est le projet affiché. Rien : celles d'avant ne valent plus.
/** @param {Projet} projet @param {Pages | undefined} rendues */
function servir(projet, rendues) {
  if (rendues === undefined) pagesServies.delete(projet.nom);
  else pagesServies.set(projet.nom, rendues);
  if (courant?.nom !== projet.nom) return;
  poserPages(projet, rendues);
  poserRail(projet);
}

/** @param {Projet} projet @param {number} ticket */
async function ouvrirIssue(projet, ticket) {
  nonEcrit = (await brigade.ouvrirIssue(projet.nom, ticket)) ? "" : `issue #${ticket} was not opened: it is no longer in the latest facts read, its address is not https, or the workstation could not open it`;
  montrer();
}

/** @param {Projet} projet @param {number} ticket */
async function ouvrirPr(projet, ticket) {
  nonEcrit = (await brigade.ouvrirPr(projet.nom, ticket)) ? "" : `the PR of #${ticket} was not opened: it is no longer among the served tickets of the latest facts read, its address is not https, or the workstation could not open it`;
  montrer();
}

// Le geste du projet lui-même, en tête de son espace, à côté de son nom : vérifier son
// installation — il ne fait que lire, et son verdict se lit dans Paramètres. Un projet sans
// box n'a pas de commande à envoyer.
function poserProjet() {
  const projet = courant;
  const geste = GESTES_DE_LA_CUISINE.find(({ id }) => id === "installation");
  gestesProjet.hidden = projet?.box === undefined || geste === undefined;
  if (projet?.box === undefined || geste === undefined) return gestesProjet.replaceChildren();
  const verifier = bouton(geste.libelle, () => void brigade.verifier(projet.nom));
  verifier.dataset.geste = "direct";
  verifier.title = "runs the verification on the box — its verdict is read in Settings, in one sentence";
  gestesProjet.replaceChildren(verifier);
}

// Un interrupteur de l'espace, en tête, à droite des onglets (tickets 906, 907) : une glissière et son
// mot — « manager on », « merge off » —, lisible sans rien lire d'autre, et un clic le bascule. Ce qui
// en a été lu, mot pour mot, est au survol, avec ce que le clic fait. Pas encore lu, ou pas lu : il ne
// dit ni l'un ni l'autre, et ne bascule rien — ce n'est pas « éteint ». `marque` : éteint de lui-même,
// pas par le chef. Sa confirmation, quand le clic en ouvre une, se pose dessous.
/**
 * @param {string} nom @param {boolean | undefined} allume indéfini : pas lu
 * @param {{ pourquoi: string, eteindre: string, allumer: string, marque?: boolean, clic: () => void, confirmation?: HTMLElement }} pose
 * @returns {HTMLElement[]}
 */
function interrupteur(nom, allume, { pourquoi, eteindre, allumer, marque = false, clic, confirmation }) {
  const bascule = bouton("", () => (allume === undefined ? undefined : clic()));
  bascule.role = "switch";
  bascule.className = "bascule";
  bascule.dataset.etat = allume === undefined ? "inconnu" : allume ? "allume" : "eteint";
  if (marque) bascule.dataset.marque = "seul";
  bascule.ariaChecked = allume === undefined ? "mixed" : String(allume);
  bascule.disabled = allume === undefined;
  const glissiere = bloc("span", "");
  glissiere.className = "glissiere";
  bascule.append(glissiere, bloc("span", `${nom} ${allume === undefined ? "…" : allume ? "on" : "off"}`));
  bascule.title = `${pourquoi}${allume === undefined ? "" : `\n${allume ? eteindre : allumer}`}`;
  bascule.ariaLabel = `${nom === "manager" ? "the manager" : `the ${nom} grant`}: ${allume === undefined ? "not read" : allume ? "on" : "off"}`;
  return [bascule, ...(confirmation === undefined ? [] : [confirmation])];
}

// Les interrupteurs de l'espace du projet : le manager (ticket 906) et le grant `merge` (ticket 907).
// Le manager : éteindre part au clic, dans le second ; allumer ouvre sa confirmation, qui dit en une
// phrase ce qu'il va juger ; sa ligne `manager`, mot pour mot, est au survol, le détail dans l'onglet
// Manager. Le grant `merge` : accorder comme révoquer ouvrent leur confirmation, qui dit ce qu'il
// change ; sa ligne de `status`, mot pour mot, est au survol, le détail dans l'onglet Grants. Éteint
// de lui-même — son échéance passée —, il le marque.
function poserInterrupteur() {
  const projet = courant;
  const cache = projet === undefined || projet.box === undefined || projet.desinstalle !== undefined;
  interrupteurManager.hidden = interrupteurMerge.hidden = cache;
  if (projet === undefined || cache) {
    interrupteurManager.replaceChildren();
    interrupteurMerge.replaceChildren();
    return;
  }
  /** @param {string} id @param {string} [grant] */
  const cleDe = (id, grant) => JSON.stringify([id, grant ?? "", "interrupteur"]);
  /** @param {string} id @param {string} [grant] */
  const ouverteSous = (id, grant) => {
    const ouverte = aConfirmer?.projet === projet.nom && aConfirmer.cle === cleDe(id, grant) ? aConfirmer : undefined;
    return ouverte === undefined ? undefined : poserConfirmation(projet, ouverte, grant);
  };

  const manager = etatsDuManager.get(projet.nom);
  const lu = manager !== undefined && !("sans" in manager) ? manager : undefined;
  const confirmationDuManager = ouverteSous("manager-allumer");
  interrupteurManager.replaceChildren(
    ...interrupteur("manager", lu?.allume, {
      pourquoi: manager === undefined ? "the manager state: first read in progress" : "sans" in manager ? `the manager state is not read: ${manager.sans}` : manager.releve,
      eteindre: "click to turn it off: it goes straight into the second",
      allumer: "click to turn it on: says first what it will judge — nothing goes before your “yes”",
      clic: () => (lu?.allume ? void ecrireGeste("manager-eteindre") : void ouvrirConfirmation(projet, cleDe("manager-allumer"), "manager-allumer")),
      ...(confirmationDuManager === undefined ? {} : { confirmation: confirmationDuManager }),
    }),
  );

  const merge = etatsDuMerge.get(projet.nom);
  const grant = merge !== undefined && !("sans" in merge) ? merge : undefined;
  const id = grant?.actif ? "grant-revoquer" : "grant-activer";
  const confirmationDuMerge = ouverteSous(id, "merge");
  const ligne = grant === undefined ? "" : (grant.releve ?? "no `merge` line in `status`: the grant is not active — never given, or revoked");
  interrupteurMerge.replaceChildren(
    ...interrupteur("merge", grant?.actif, {
      pourquoi: merge === undefined ? "the merge grant state: first read in progress" : "sans" in merge ? `the merge grant state is not read: ${merge.sans}` : `${ligne}\nin full: the Grants tab`,
      eteindre: "click to revoke it: says first what it changes — nothing goes before your “yes”",
      allumer: "click to enable it: says first what it changes — nothing goes before your “yes”",
      marque: grant?.seul === true,
      clic: () => void ouvrirConfirmation(projet, cleDe(id, "merge"), id, "merge"),
      ...(confirmationDuMerge === undefined ? {} : { confirmation: confirmationDuMerge }),
    }),
  );
}

// Le code de l'app, et les clones de brigade parmi les projets : l'état de chacun en une
// ligne, avec l'heure de sa lecture ; dessous, ce que le process principal en dit (retard.ts).
// L'app en retard, ou à relancer : un bouton la met à jour et la relance, sans terminal
// (rattrapage.ts). Le clone d'un projet en retard : la commande qui le met à jour est un bouton,
// elle s'écrit dans un shell, et rien ne l'envoie. La case « T » de la barre le dit aussi, quel
// que soit l'écran.
function poserCode() {
  const entree = document.getElementById("entree-tous");
  if (entree !== null) {
    entree.classList.toggle("perime", codeVu?.alerte !== undefined);
    entree.title = codeVu?.alerte === undefined ? "All projects" : `All projects — ${codeVu.alerte}`;
    entree.ariaLabel = entree.title;
  }
  if (codeVu === undefined) {
    const tete = bloc("p", "this app's code: first read of how far it is behind origin in progress…");
    tete.dataset.etat = "en-cours";
    return code.replaceChildren(tete);
  }
  const heure = heureDe(codeVu.a);
  code.replaceChildren(
    ...codeVu.clones.flatMap(({ id, etat, tete, lignes, commande, bouton: geste }) => {
      const pose = bloc("p", `${tete} — ${etat === "pas-lu" ? "tried at" : "read at"} ${heure}, re-read when you come back to the window`);
      pose.dataset.etat = etat;
      const gestes = document.createElement("p");
      gestes.className = "gestes";
      if (geste !== undefined) {
        const cree = bouton(enPassage ? "updating — the app relaunches itself…" : geste, () => void passer());
        cree.disabled = enPassage;
        gestes.append(cree);
      } else if (commande !== undefined) gestes.append(bloc("span", "write into a shell, without sending:"), boutonDeCommande(commande, () => void mettreAJour(id)));
      return [pose, ...(lignes.length === 0 ? [] : [propos(lignes.join("\n"))]), ...(commande === undefined && geste === undefined ? [] : [gestes])];
    }),
    ...(nonMisAJour === "" ? [] : [propos(nonMisAJour)]),
  );
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
/** @param {string} nom @param {{ ton: string, dit: string, survol: string }} ligne @param {() => void} ouvrirLa */
function ligneDAccueil(nom, { ton, dit, survol }, ouvrirLa) {
  const cree = document.createElement("button");
  cree.type = "button";
  cree.className = "ligne";
  cree.title = survol;
  cree.ariaLabel = `${nom} — ${dit}`;
  const appele = bloc("strong", nom);
  appele.className = "mono";
  const suite = bloc("span", "›");
  suite.className = "ouvrir";
  suite.ariaHidden = "true";
  cree.append(pastille(dit, ton), appele, bloc("span", dit), suite);
  cree.addEventListener("click", ouvrirLa);
  return cree;
}

// L'accueil : les projets dans l'ordre du fichier, puis les stations, puis la santé — tels que le
// process principal les a dits (accueil.ts). Un projet qu'il ne dit pas encore attend sa première lecture.
function poserAccueil() {
  const lignes = new Map((accueilVu?.projets ?? []).map((ligne) => [ligne.nom, ligne]));
  projetsDeLAccueil.replaceChildren(
    ...(configuration.projets.length === 0
      ? [bloc("p", "no project yet: “+” in the bar adds one")]
      : configuration.projets.map((projet) => ligneDAccueil(projet.nom, lignes.get(projet.nom) ?? { ton: "gris", dit: "first read in progress…", survol: "" }, () => void ouvrir(projet)))),
  );
  const stations = accueilVu?.stations;
  listeDesStations.replaceChildren(
    ...(stations === undefined
      ? [bloc("p", "your stations: first read on GitHub in progress…")]
      : stations.length === 0
        ? [bloc("p", "no station yet: install one, then pair it here with “+ station”")]
        : stations.map((station) => ligneDAccueil(station.nom, station, () => ouvrirStation(station.id)))),
  );
  const sante = accueilVu?.sante ?? { ton: "gris", dit: "Max ?  ·  GitHub ?", survol: "first readings in progress" };
  santeDeLAccueil.dataset.ok = String(sante.ton === "vert");
  santeDeLAccueil.title = sante.survol;
  santeDeLAccueil.replaceChildren(pastille(sante.dit, sante.ton), bloc("span", sante.dit));
}

// La page d'une station : en tête, son nom, sa pastille et son état en une phrase — « online · 2 cooks
// running », « offline for 12 min », « saturated » (accueil.ts) ; sa machine et sa version ne se lisent
// qu'au survol de l'icône d'aide, jamais dans la page. Dessous, ses pannes, chacune avec son bouton ;
// puis tous les projets qu'elle porte.
function poserPageDeStation() {
  const station = stationsVues?.stations.find(({ id }) => id === stationOuverte);
  const ligne = accueilVu?.stations?.find(({ id }) => id === stationOuverte);
  if (station === undefined) {
    enTeteDeStation.replaceChildren(bloc("p", stationsVues === undefined ? "reading your stations on GitHub…" : "this station is no longer paired with this app"));
    pannesDeStation.replaceChildren();
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
    enTeteDeStation.replaceChildren(titre, pastille(phrase, ligne?.ton), ...(dejaDit ? [] : [etatDit]), ...(details === "" ? [] : [survol(document, details)]));
    versionDeStation.replaceChildren(...(station.versionDit ? [bloc("span", station.versionDit)] : []));
    pannesDeStation.replaceChildren(...station.pannes.map((panne) => poserPanne(station.id, panne)));
    poserRetireLaStation(station);
  }
  poserProjets();
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
    const bouton = /** @type {HTMLButtonElement} */ (bloc("button", "remove the station"));
    bouton.type = "button";
    bouton.addEventListener("click", () => {
      retraitDeStationDemande = station.id;
      retraitDeStationRefuse = "";
      poserRetireLaStation(station);
    });
    return retraitDeStation.replaceChildren(bouton, ...(retraitDeStationRefuse === "" ? [] : [bloc("p", retraitDeStationRefuse)]));
  }
  retraitDeStation.replaceChildren(
    confirmationDeGeste(
      document,
      { titre: `Remove ${station.nom} from this app?`, prix: `${station.nom} leaves the home and is no longer read; it keeps running, and pairs again with a new code`, oui: "remove", non: "cancel" },
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
// station qui sert un projet fait tourner son manager et sa pass : elle en est la principale ;
// celle que l'app a déclarée secondaire ne le sert pas, et le dit. Toute la ligne s'ouvre d'un clic.
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
      const autoriser = bloc("button", `authorize on GitHub: ${url.replace(/^https:\/\/github\.com\/apps\/([^/]+).*$/, "$1")}`);
      autoriser.addEventListener("click", () => void brigade.autoriserSurGitHub(url));
      gestes.append(autoriser);
    }
    const retirer = bloc("button", retraitDemande === nom ? `remove ${nom} from its stations? click again` : "remove");
    retirer.addEventListener("click", () => void retirerProjet(nom));
    gestes.append(retirer);
    pose.append(ligne, gestes);
    return pose;
  });
  // Tant que ce que l'app lui demande n'est pas lu, le vide n'est pas sûr : il ne se dit pas.
  const vide = station.etat === "illisible" ? "its projects cannot be read: neither can the station" : projetsVus === undefined ? "reading GitHub…" : "no project on this station yet";
  listeDesProjets.replaceChildren(
    ...(lignes.length === 0 ? [bloc("p", vide)] : lignes),
    ...(projetsVus?.sans === undefined ? [] : [lectureIndisponible(document, "GitHub could not be read: the projects added from this app are the ones from before", projetsVus.sans)]),
  );
}

// Un projet sur la page d'une station : sa pastille, son nom, sa marque — « main » si la station
// fait tourner son manager et sa pass, « secondary » sinon —, et ce qu'elle en dit. Un clic l'ouvre :
// son espace s'il est dans le fichier des projets de l'app ; sinon « Add a project », où il s'y
// déclare. Le détail — son dépôt, ce que la station en a dit, où est sa principale — est au survol.
/** @param {string} nom @param {boolean} servi @param {{ projet: import("../projets/projets.ts").ProjetVu, ici: import("../projets/projets.ts").StationDuProjet } | undefined} demande */
function ligneDeProjetDeStation(nom, servi, demande) {
  const principale = servi || demande?.ici.principale === true;
  const etat = servi ? "servi" : (demande?.ici.etat ?? "attendu");
  const ailleurs = demande?.projet.stations.find((station) => station.principale && station.id !== stationOuverte)?.nom;
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
            : etat === "secondaire"
              ? ailleurs === undefined
                ? "its manager and its pass run elsewhere"
                : `its manager and its pass run on ${ailleurs}`
              : "not read yet";
  const declare = projetDe(nom);
  const survolDit = [
    demande === undefined ? "installed on this station outside the app" : `${demande.projet.depot} · ${demande.projet.base}`,
    ...(demande === undefined || demande.ici.dit === "" ? [] : [demande.ici.dit]),
    ...(demande === undefined || demande.projet.servi === null ? [] : [demande.projet.servi]),
    declare === undefined ? "not in this app's projects yet: a click opens “Add a project”" : "",
  ].filter((ligne) => ligne !== "");
  const cree = document.createElement("button");
  cree.type = "button";
  cree.className = "ligne";
  cree.dataset.projet = nom;
  cree.title = survolDit.join("\n");
  cree.ariaLabel = `${nom} — ${principale ? "main" : "secondary"} — ${dit}`;
  const appele = bloc("strong", nom);
  appele.className = "mono";
  const marque = bloc("span", principale ? "main" : "secondary");
  marque.className = "pilule";
  marque.classList.toggle("principale", principale);
  marque.title = principale ? "this station is its main station: it runs its manager and its pass" : "not its main station: this station runs neither its manager nor its pass";
  const suite = bloc("span", "›");
  suite.className = "ouvrir";
  suite.ariaHidden = "true";
  cree.append(pastille(dit, ton), appele, marque, bloc("span", dit), suite);
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

// Les stations du parcours : une case par station appairée, et sa principale. Celle que l'app
// recommande — un serveur — est proposée d'office ; choisir un ordinateur se dit tout de suite.
function poserChoixDesStations() {
  if (parcours === undefined) return;
  const appairees = stationsVues?.stations ?? [];
  if (!parcours.touchee && parcours.principale === "" && projetsVus?.recommandee) {
    parcours.principale = projetsVus.recommandee;
    parcours.choisies.add(projetsVus.recommandee);
  }
  const vise = parcours;
  choixDesStations.replaceChildren(
    ...(appairees.length === 0
      ? [bloc("p", "no station to serve it: pair one first, with “+ station” on the home")]
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
            if (!choisie.checked && vise.principale === station.id) vise.principale = "";
            poserChoixDesStations();
          });
          const principale = document.createElement("input");
          principale.type = "radio";
          principale.name = "principale";
          principale.ariaLabel = `${station.nom} is its main station`;
          principale.checked = vise.principale === station.id;
          principale.addEventListener("change", () => {
            vise.touchee = true;
            vise.principale = station.id;
            vise.choisies.add(station.id);
            poserChoixDesStations();
          });
          ligne.append(choisie, bloc("span", ` ${station.nom}${station.machine === "" ? "" : ` — ${station.machine}`} · `), principale, bloc("span", station.id === projetsVus?.recommandee ? " main (recommended: always on)" : " main"));
          return ligne;
        })),
  );
  avertissementDeLaPrincipale.textContent = projetsVus?.avertissements[vise.principale] ?? "";
  avertissementDeLaPrincipale.dataset.etat = avertissementDeLaPrincipale.textContent === "" ? "" : "hors-ligne";
}

// Ouvrir le parcours : l'heure en est gardée — c'est d'elle que se mesure le temps jusqu'au projet
// servi —, et les dépôts du chef se lisent sur GitHub.
ouvrirLeParcours.addEventListener("click", () => void ouvrirParcours());
async function ouvrirParcours() {
  parcours = { ouvertLe: new Date().toISOString(), depots: [], choisies: new Set(), principale: "", touchee: false };
  formulaireDAjout.hidden = false;
  ouvrirLeParcours.hidden = true;
  ajoutDit.textContent = "";
  ajoutRefuse.replaceChildren();
  baseChoisie.value = "";
  cooksChoisis.value = "";
  for (const [champ, liste] of Object.entries(calibrageDuProjet)) proposer(liste, champ.endsWith("modele") ? CALIBRAGE_DU_PROJET.modeles : CALIBRAGE_DU_PROJET.efforts, champ.endsWith("modele") ? `— ${champ.split("-")[0]} model —` : `— ${champ.split("-")[0]} effort —`);
  depotChoisi.replaceChildren(new Option("reading your repositories on GitHub…", ""));
  poserChoixDesStations();
  const vise = parcours;
  const lus = await brigade.depotsDuChef();
  if (parcours !== vise) return;
  if ("refus" in lus) {
    depotChoisi.replaceChildren(new Option("— repository —", ""));
    ajoutRefuse.replaceChildren(bloc("p", lus.refus));
    return;
  }
  vise.depots = lus.depots;
  proposer(depotChoisi, lus.depots.map(({ depot }) => depot), "— repository —");
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
async function ajouterProjet() {
  if (parcours === undefined) return;
  validerAjout.disabled = true;
  ajoutRefuse.replaceChildren(bloc("p", "writing the request on your stations' gists…"));
  try {
    const rendu = await brigade.ajouterAUneStation({
      depot: depotChoisi.value,
      base: baseChoisie.value,
      stations: [...parcours.choisies],
      principale: parcours.principale,
      cooks: cooksChoisis.value,
      manager: { modele: calibrageDuProjet["manager-modele"].value, effort: calibrageDuProjet["manager-effort"].value },
      reviewer: { modele: calibrageDuProjet["reviewer-modele"].value, effort: calibrageDuProjet["reviewer-effort"].value },
      ouvertLe: parcours.ouvertLe,
    });
    if ("signales" in rendu) ajoutRefuse.replaceChildren(...Object.values(rendu.signales).map((raison) => bloc("p", raison ?? "")));
    else if ("refus" in rendu) ajoutRefuse.replaceChildren(bloc("p", rendu.refus));
    else {
      fermerParcours();
      ajoutRefuse.replaceChildren();
      ajoutDit.textContent = `${rendu.ajoute} is asked of its stations: its main station prepares it and adds it within a minute — if GitHub asks you to authorize brigade, its button is below the project`;
    }
  } catch (erreur) {
    ajoutRefuse.replaceChildren(bloc("p", `nothing was added: ${erreur instanceof Error ? erreur.message : String(erreur)}`));
  }
  validerAjout.disabled = false;
}

// Ce que le bouton d'une panne a rendu, par `<gist> <clé>` : redit à chaque relecture, tant que la
// panne est sur la ligne de sa station.
/** @type {Map<string, string>} */
const pannesDites = new Map();

// Une panne, sous la ligne de sa station : ce qui ne va pas, en une ligne, et son bouton — relire,
// écarter, se connecter (pannes/pannes.ts). Jamais une commande à taper.
/** @param {string} id @param {import("../pannes/pannes.ts").Panne} panne */
function poserPanne(id, panne) {
  const pose = document.createElement("p");
  pose.className = "panne";
  pose.dataset.sujet = panne.sujet;
  const bouton = document.createElement("button");
  bouton.type = "button";
  bouton.textContent = panne.bouton.libelle;
  bouton.addEventListener("click", () => void jouerPanne(id, panne.cle, bouton));
  // L'explication, et ce que le bouton a rendu, ne se lisent qu'au survol.
  const dit = pannesDites.get(`${id} ${panne.cle}`);
  pose.append(bloc("span", panne.ligne), bouton, survol(document, dit === undefined ? panne.survol : `${panne.survol}. ${dit}`));
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
  // Une ligne dont le geste est celui d'un interrupteur de l'espace n'est pas posée : l'interrupteur la
  // dit, et c'est lui qui la lève — le manager éteint (ticket 906), le grant `merge` éteint seul (ticket
  // 907). Non vérifiée, elle se pose : l'interrupteur ne sait pas, la ligne dit pourquoi.
  const alertes = projet.box === undefined ? [] : (bandes.get(projet.nom) ?? []).filter(({ appel }) => !(appel !== undefined && "geste" in appel && (appel.geste === "manager-allumer" || (appel.geste === "grant-activer" && appel.grant === "merge"))));
  gesteDeLUrgence = undefined;
  bande.hidden = alertes.length === 0;
  bande.replaceChildren(...alertes.map((alerte) => poserAlerte(projet, alerte)));
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
    });
    deplier.className = "detail";
    deplier.ariaExpanded = String(deplie);
    deplier.title = deplie ? "fold the detail" : "what the box says, as is — and why";
    tete.append(deplier);
  }
  const [controle, ...ouverte] = poserControle(projet, alerte, endroit);
  if (controle !== undefined) tete.append(controle);
  ligne.append(tete);
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
  const mot = libelle ?? leve;
  /** @type {HTMLElement[]} */
  let pose;
  // L'endroit d'un geste du socle est la ligne par son sujet : la confirmation d'un même geste s'ouvre sous la ligne cliquée.
  if ("geste" in appel) pose = poserGeste(projet, { id: appel.geste, libelle: mot, ou: `alerte:${sujet}`, ...(appel.grant === undefined ? {} : { grant: appel.grant }) });
  else if ("demande" in appel) {
    // Un prix « none… » est un prix nul : pas de confirmation, la demande s'écrit au clic.
    const cout = /^none\b/i.test(prix.trim()) ? "" : prixDit(prix);
    const cle = JSON.stringify(["demande", "", endroit]);
    const ouverte = aConfirmer?.projet === projet.nom && aConfirmer.cle === cle ? aConfirmer : undefined;
    const demande = bouton(cout === "" ? mot : `${mot}…`, () => {
      if (cout === "") return void demanderAlerte(alerte);
      nonEcrit = nonEcritSecond = "";
      aConfirmer = ouverte === undefined ? { projet: projet.nom, cle, rendu: confirmationDeDemande(cout) } : undefined;
      montrer();
    });
    demande.dataset.geste = "demande";
    demande.ariaExpanded = cout === "" ? null : String(ouverte !== undefined);
    demande.title = cout === "" ? "writes into the second a request about this line — nothing is sent: you press Enter" : "says first what lifting it costs — then writes the request into the second, without sending it";
    pose = ouverte === undefined ? [demande] : [demande, poserConfirmation(projet, ouverte, undefined, () => void demanderAlerte(alerte))];
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
  choix: [{ id: "demande", libelle: "yes, write the request", dit: "written into the second, not sent: your Enter sends it" }],
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
  if (relance !== undefined) geste.append(...poserGeste(projet, { ...relance, ou: "arret" }));
  arret.replaceChildren(bloc("strong", titre), ...suite.map((ligne) => bloc("p", ligne)), geste);
}

// Tout ce qui se dessine du projet affiché, d'après ses derniers faits. Le rail en est : il est
// au centre de l'espace, quel que soit l'onglet affiché.
function dessiner() {
  bande.hidden = true;
  arret.hidden = true;
  rail.hidden = true;
  poserManager();
  poserGrants();
  poserProjet();
  poserInterrupteur();
  if (courant === undefined) return;
  poserAlertes(courant);
  poserCarte(carte, courant);
  poserArret(courant);
  poserRail(courant);
}

// Rien ne reste de ce qui était affiché — ni d'un autre projet, ni de celui-ci :
// jusqu'à la première lecture, il n'y a rien à lire.
/** @param {Projet} projet @param {HTMLElement} tete @param {HTMLElement} corps */
function attendre(projet, tete, corps) {
  if (projet.desinstalle !== undefined) {
    // L'app l'a désinstallé de sa box : elle n'en lit plus rien, et le dit à la place.
    tete.dataset.etat = "desinstalle";
    tete.textContent = `${projet.desinstalle.titre} — since ${heureDe(projet.desinstalle.a)}`;
    corps.replaceChildren(propos(projet.desinstalle.lignes.join("\n")));
  } else if (projet.box === undefined) {
    tete.dataset.etat = "sans-box";
    tete.textContent = "no read";
    corps.replaceChildren(
      lectureIndisponible(
        document,
        `“${projet.nom}” does not say where its box is: nothing is read`,
        `It lacks “hote”, in ${configuration.chemin}: the name your \`ssh\` reaches your box by. The app re-reads this file as soon as it changes.`,
      ),
    );
  } else {
    tete.dataset.etat = "en-cours";
    tete.textContent = "first read in progress…";
    corps.replaceChildren();
  }
}

// L'entrée de la barre qui est affichée : celle du projet courant, la première —
// « Tous les projets » — ou la dernière, l'ajout. Un fichier refusé n'a ni l'une ni l'autre :
// sa raison prend la place du terminal.
function marquer() {
  const refuse = configuration.refus !== undefined;
  const affichee = ajoute ? barre.children.length - 1 : courant === undefined ? 0 : configuration.projets.indexOf(courant) + 1;
  [...barre.children].forEach((entree, rang) => (entree.ariaCurrent = String(rang === affichee)));
  // La fiche d'un projet ne reste pas ouverte quand le chef en quitte l'espace.
  if (ouverte !== undefined && ouverte.projet.nom !== courant?.nom) fermerFiche();
  // L'espace affiché ne porte pas de signal : il le reprend en le quittant.
  for (const projet of configuration.projets) marquerSignal(projet.nom);
  tous.hidden = refuse || ajoute || courant !== undefined;
  ajout.hidden = !ajoute;
  teindre();
  principal.hidden = !refuse && courant === undefined;
  colonneSecond.hidden = courant === undefined;
  lireOnglet();
}

// Tous les projets, dans l'ordre du fichier, puis les stations : l'écran se regarde, et un clic
// ouvre ce qu'il montre. Ce qui s'y voit se traite dans l'espace du projet, ou sur la page de la station.
function ouvrirTous() {
  courant = undefined;
  ajoute = false;
  stationOuverte = undefined;
  marquer();
  poserCode();
  poserAccueil();
  tous.replaceChildren(bloc("h2", "Projects"), projetsDeLAccueil, bloc("h2", "Stations"), stationsDeLAccueil, santeDeLAccueil);
  brigade.tous(++demande);
}

// La page d'une station, à la place de l'accueil : « T » reste l'entrée affichée, et un geste y ramène.
/** @param {string} id */
function ouvrirStation(id) {
  courant = undefined;
  ajoute = false;
  stationOuverte = id;
  retraitDeStationDemande = undefined;
  retraitDeStationRefuse = "";
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

// Ce qu'un champ a de refusé, dit sous lui — ou rien.
/** @param {string} champ @param {string} [raison] */
function signaler(champ, raison = "") {
  element(`refus-${champ}`).textContent = raison;
  element(champ).ariaInvalid = String(raison !== "");
}

// Ce que l'écran a proposé et que le chef n'a pas touché : le champ, et d'où vient sa valeur.
// Un champ y entre quand l'app y pose une valeur, et en sort dès que le chef y met la main —
// ce qui part vers la box est alors ce qu'il a choisi, plus ce qu'on lui a proposé.
/** @type {Map<string, string>} */
const proposes = new Map();
// La racine des sauvegardes lue sur la box choisie — ou ce qui l'a empêché.
let racine = "";
let racineOrigine = "";
let racineRaison = "";

// Ce que la ligne d'un champ dit de sa valeur : proposée, avec sa provenance, tant que personne n'a choisi.
function direPropose() {
  /** @param {string[]} champs @param {Record<string, string>} nommes */
  const ligne = (champs, nommes) => {
    const restants = champs.filter((champ) => proposes.has(champ));
    for (const champ of champs) element(champ).toggleAttribute("data-propose", proposes.has(champ));
    const [premier] = restants;
    if (premier === undefined) return "";
    const quoi = restants.length === champs.length ? "Suggested, not chosen" : `${restants.map((champ) => nommes[champ]).join(" and ")}: suggested, not chosen`;
    return `${quoi} — ${proposes.get(premier)}. Edit it to choose it; it goes as is otherwise.`;
  };
  const nommes = { "manager-modele": "the model", "manager-effort": "the effort", "reviewer-modele": "the model", "reviewer-effort": "the effort" };
  element("propose-manager").textContent = ligne(["manager-modele", "manager-effort"], nommes);
  element("propose-reviewer").textContent = ligne(["reviewer-modele", "reviewer-effort"], nommes);
  const dite = ligne(["sauvegardes"], {});
  element("propose-sauvegardes").textContent = dite !== "" ? dite : sauvegardes.value === "" ? racineRaison : "";
}

/** @param {string} champ @param {string} valeur @param {string} origine */
function poserPropose(champ, valeur, origine) {
  const cible = /** @type {HTMLInputElement | HTMLSelectElement} */ (element(champ));
  cible.value = valeur;
  // Une valeur que la liste ne connaît pas ne se propose pas.
  if (cible.value !== valeur) return;
  proposes.set(champ, origine);
}

// Le calibrage proposé : celui de tes autres projets, sinon la valeur mesurée. Un champ que
// le chef a choisi n'est pas repris.
async function proposerCalibrage() {
  const { calibrage, origine } = await brigade.proposerCalibrage();
  for (const [role, valeurs] of Object.entries(calibrage)) {
    for (const dimension of /** @type {const} */ (["modele", "effort"])) {
      const champ = /** @type {typeof CALIBRAGE[number]} */ (`${role}-${dimension}`);
      if (calibre(champ).value !== "" && !proposes.has(champ)) continue;
      poserPropose(champ, valeurs[dimension], origine);
    }
  }
  direPropose();
}

// La destination proposée : la racine que la box accepte, puis le nom du projet.
function proposerDestination() {
  if (sauvegardes.value !== "" && !proposes.has("sauvegardes")) return;
  const saisi = nom.value.trim();
  if (racine === "" || saisi === "") {
    if (proposes.delete("sauvegardes")) sauvegardes.value = "";
  } else {
    poserPropose("sauvegardes", `${racine}/${saisi}`, racineOrigine);
  }
  direPropose();
}

// La racine, lue sur la box choisie : une réponse qui arrive après un autre choix est jetée.
async function proposerRacine() {
  const choisie = hote.value;
  racine = "";
  racineRaison = "";
  if (choisie !== "") {
    const lue = await brigade.proposerRacine(choisie);
    if (hote.value !== choisie) return;
    if (lue !== undefined && "racine" in lue) [racine, racineOrigine] = [lue.racine, lue.origine];
    else racineRaison = lue?.raison ?? "";
  }
  proposerDestination();
}

// Ce que le chef touche cesse d'être une proposition.
for (const champ of /** @type {string[]} */ ([...CALIBRAGE, "sauvegardes"])) {
  element(champ).addEventListener("input", () => {
    proposes.delete(champ);
    direPropose();
  });
}
hote.addEventListener("change", () => void proposerRacine());

// Ajouter un projet sans écrire de JSON ni coller de commande : son dossier se choisit,
// son nom et son dépôt en viennent, sa box se prend parmi celles du fichier. Ce qui a
// été saisi reste, d'un passage à l'autre.
function ouvrirAjout() {
  courant = undefined;
  ajoute = true;
  stationOuverte = undefined;
  marquer();
  ou.textContent = `${configuration.projets.length === 0 ? "No project yet. " : ""}It is installed on its box, then written to ${configuration.chemin} — which you can also edit by hand: the app re-reads it as soon as it changes.`;
  choisi.textContent = dossier === "" ? "no folder chosen" : dossier;
  proposer(hote, configuration.boxes, configuration.boxes.length === 0 ? "no box declared — declare one, below" : "— choose —");
  // Une seule box : il n'y a rien à choisir.
  if (hote.value === "" && configuration.boxes.length === 1) hote.value = configuration.boxes[0] ?? "";
  void proposerCalibrage();
  void proposerRacine();
}

element("dossier").addEventListener("click", async () => {
  const pris = await brigade.choisirDossier();
  if (pris === undefined) return;
  dossier = pris;
  choisi.textContent = pris;
  signaler("dossier");
  // Le nom du dossier, tant que le chef n'en a pas tapé un autre.
  if (nom.value === "") {
    nom.value = pris.split("/").filter(Boolean).at(-1) ?? "";
    void direForme();
    proposerDestination();
  }
  // Son dépôt, lu dans son origine — tant que le chef n'en a pas écrit un autre.
  const lu = await brigade.lireDepot(pris);
  if (lu === undefined || dossier !== pris || (depot.value !== "" && depot.value !== depotLu)) return;
  depotLu = "depot" in lu ? lu.depot : "";
  depot.value = depotLu;
  signaler("depot", "raison" in lu ? lu.raison : "");
});
// La forme du nom, dite à la saisie : ce que la box refuserait est refusé ici, avant elle.
async function direForme() {
  const saisi = nom.value;
  const raison = await brigade.formeDuNom(saisi);
  if (nom.value === saisi) signaler("nom", raison);
}
nom.addEventListener("input", () => {
  void direForme();
  proposerDestination();
});
// Une box de plus : son nom s'écrit dans le fichier, et elle se propose aussitôt.
element("declarer").addEventListener("click", async () => {
  const declaree = box.value.trim();
  const refus = await brigade.declarerBox(declaree);
  signaler("box", refus === undefined ? "" : `Not declared — ${refus}`);
  if (refus !== undefined) return;
  box.value = "";
  // La liste est déjà arrivée par `surConfiguration`.
  hote.value = declaree;
  signaler("hote");
  void proposerRacine();
});

// Entrée, dans le nom d'une box, la déclare : elle n'envoie pas l'ajout.
box.addEventListener("keydown", (frappe) => {
  if (frappe.key !== "Enter") return;
  frappe.preventDefault();
  element("declarer").click();
});

// Ce qu'il est advenu de l'ajout, sous le formulaire : ce que la box a rendu, tel quel, puis ce que l'app en dit.
/** @param {import("../installation.ts").Issue | { etat: "en-cours", titre: string }} issue */
function poserIssue(issue) {
  issueAjout.dataset.etat = issue.etat;
  if (issue.etat === "champs") return issueAjout.replaceChildren(bloc("strong", "Nothing was sent to the box: what is missing is flagged under its field."));
  issueAjout.replaceChildren(bloc("strong", issue.titre), ...("obtenu" in issue && issue.obtenu !== undefined ? [bloc("pre", issue.obtenu)] : []), ...("lignes" in issue ? issue.lignes.map((ligne) => bloc("p", ligne)) : []));
}

formulaire.addEventListener("submit", async (soumission) => {
  soumission.preventDefault();
  const saisie = {
    dossier,
    nom: nom.value,
    depot: depot.value,
    hote: hote.value,
    manager: { modele: calibre("manager-modele").value, effort: calibre("manager-effort").value },
    reviewer: { modele: calibre("reviewer-modele").value, effort: calibre("reviewer-effort").value },
    sauvegardes: sauvegardes.value,
  };
  envoi.disabled = true;
  poserIssue({ etat: "en-cours", titre: "Request in progress — if it goes through, the box clones the repository: this can take a few minutes." });
  const issue = await brigade.installer(saisie).finally(() => (envoi.disabled = false));
  for (const champ of /** @type {const} */ (["dossier", "nom", "depot", "hote", ...CALIBRAGE, "sauvegardes"])) signaler(champ, issue.etat === "champs" ? issue.champs[champ] : "");
  poserIssue(issue);
  if (issue.etat === "pas-ajoute" && issue.declarable) {
    // Le projet est sur la box, pas dans l'app : c'est le chef qui demande de l'y déclarer.
    const declarer = bouton("Declare it in the app, as it is on the box", async () => {
      const refus = await brigade.ajouter({ nom: saisie.nom, dossier: saisie.dossier, hote: saisie.hote });
      if (refus !== undefined) return void declarer.after(bloc("p", `Not declared — ${refus}`));
      vider();
      poserIssue({ etat: "en-cours", titre: `“${saisie.nom.trim()}” is declared in the app, as it is on the box “${saisie.hote}”: nothing was written there.` });
    });
    declarer.type = "button";
    issueAjout.append(declarer);
  }
  // Ajouté : la liste est déjà arrivée par `surConfiguration`, et l'écran reste, pour ses ports
  // — et pour ce qui reste à faire du projet.
  if (issue.etat === "ajoute") {
    vider();
    poserSuite(issue.nom);
  }
});

// Sous un ajout réussi : ce qui reste avant que le projet soit servi, et le geste qui ouvre
// son espace, où l'installation guidée l'attend — toutes ses étapes, et la courante.
/** @param {string} nom */
function poserSuite(nom) {
  // Rien, si le projet a déjà quitté le fichier.
  if (projetDe(nom) === undefined) return;
  const lancer = bouton(`Open the space of “${nom}” — its installation goes on there`, () => {
    const projet = projetDe(nom);
    if (projet === undefined) return void lancer.after(bloc("p", `Not opened — “${nom}” is no longer in ${configuration.chemin}`));
    void ouvrir(projet);
  });
  lancer.type = "button";
  issueAjout.append(
    bloc("strong", "It is not served yet: its installation goes on in its space, step by step."),
    bloc("p", "Every step is listed there before the first one — what it is for, what happens if you skip it —, done for you by a button or an answer, except what only you can do, which is announced first. Close the app whenever you like: the box keeps where you are."),
    lancer,
  );
}

// L'écran d'ajout, rendu vide : ce qui vient d'être ajouté n'y reste pas. La box choisie, si.
function vider() {
  const gardee = hote.value;
  formulaire.reset();
  hote.value = gardee;
  dossier = "";
  depotLu = "";
  choisi.textContent = "no folder chosen";
  // Le calibrage du projet qui vient d'être ajouté se propose pour le suivant.
  proposes.clear();
  direPropose();
  void proposerCalibrage();
  void proposerRacine();
}

/** @param {Projet} projet */
async function ouvrir(projet) {
  courant = projet;
  stationOuverte = undefined;
  if (urgenceChoisie !== projet.nom) urgenceChoisie = "";
  nonEcrit = nonEcritSecond = "";
  // Une confirmation ouverte sur un autre projet ne reste pas ouverte : rien n'en part.
  if (aConfirmer?.projet !== projet.nom) aConfirmer = undefined;
  ajoute = false;
  // Comme le panneau : l'onglet de contenu laissé là est relu tout de suite.
  suivi = undefined;
  marquer();
  // Dès maintenant : la carte et la bannière du projet quitté ne restent pas sur celui-ci
  // pendant que son espace s'ouvre.
  dessiner();
  attendre(projet, lu, lecture);
  // Ni ses pages servies : celles de ce projet viennent avec sa première lecture.
  servir(projet, undefined);
  // L'installation du projet quitté ne reste pas non plus : celle-ci arrive.
  if (misEnService !== projet.nom) service.hidden = true;
  void lireService(projet);
  // Ni ses deux gestes de retrait : ils nomment leur projet.
  if (retraitPose !== projet.nom) retrait.hidden = true;
  void lireRetrait(projet);
  poserCouleurs(projet);
  void poserOrdinaires(projet);
  brigade.regarder(projet.nom, ++demande);
  // Un projet qui ne s'ouvre pas n'a pas de second : sa colonne dit pourquoi.
  if (projet.refus !== undefined) return montrer();
  const terminaux = await brigade.espace(projet.nom);
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

// Une sortie peut précéder l'annonce de son terminal : sa vue est alors créée ici.
brigade.surSortie((id, donnees) => {
  if (!fermes.has(id)) vue(id).xterm.write(donnees);
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
// Une lecture remplace tout ce qui était affiché du projet. Ratée, elle n'a pas
// d'état à montrer : ce que `ssh` a rendu prend sa place.
// Dans l'espace du projet, les serveurs que ce `status` montre viennent avec elle, et leur geste.
brigade.surLecture((recue, servies) => {
  // Demandée par un écran quitté depuis, elle était déjà en route : elle n'est pas pour celui-ci.
  if (recue.demande !== demande) return;
  if (recue.projet === courant?.nom) {
    rendre(recue, lu, lecture, true);
    servir(courant, servies);
  }
});
// Les faits d'un projet : ils remplacent ceux d'avant, partout où ils se dessinent —
// sa pastille dans la barre, et son espace s'il est affiché — sa ligne de l'accueil vient par `surAccueil`.
// La bande d'alertes d'un projet : posée tout de suite si c'est celui qui est affiché.
brigade.surAlertes(({ projet, alertes, signal, manager: etatDuManager, merge: etatDuMerge }) => {
  bandes.set(projet, alertes);
  signaux.set(projet, signal);
  marquerSignal(projet);
  const bascule = JSON.stringify(etatsDuManager.get(projet)) !== JSON.stringify(etatDuManager);
  const basculeMerge = JSON.stringify(etatsDuMerge.get(projet)) !== JSON.stringify(etatDuMerge);
  etatsDuManager.set(projet, etatDuManager);
  etatsDuMerge.set(projet, etatDuMerge);
  if (courant?.nom !== projet) return;
  poserAlertes(courant);
  // Un interrupteur a basculé : il le dit aussitôt — et, le manager, la tête du rail aussi.
  if (bascule || basculeMerge) poserInterrupteur();
  if (bascule) poserRail(courant);
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
// L'installation d'un projet a changé — une lecture de sa box, une action partie ou revenue :
// celle du projet affiché se repose.
brigade.surGuide((guide) => {
  if (courant?.nom === guide.projet) poserService(courant, guide);
});
// Le chef déplie l'installation repliée : elle se lit en entier, et ce qui sera à lui s'annonce.
service.addEventListener("toggle", () => {
  if (service.open && courant !== undefined && misEnService === courant.nom && !serviceDeplie) void brigade.deplierService(courant.nom);
});
// Ce qui n'est pas encore sur le rail d'un projet : le sien se repose, s'il est affiché.
brigade.surAmont((vu) => {
  amonts.set(vu.projet, vu);
  if (courant?.nom === vu.projet && !rail.hidden && tenus.has(vu.projet)) poserRail(courant);
});
brigade.surFaits((recue) => {
  if (recue.demande !== demandeFaits) return;
  tenus.set(recue.projet, recue);
  marquerPastille(recue.projet);
  if (courant?.nom === recue.projet) {
    dessiner();
    void poserOrdinaires(courant);
  }
});
// Ce que l'onglet de contenu affiché a rendu : une lecture ratée s'y lit comme
// dans le panneau, et n'en retire rien. Celle de l'onglet Manager vient avec l'état du
// manager, lu dans sa sortie : il remplace celui d'avant, au-dessus du texte. Celle de
// l'onglet Grants, de même, avec l'état des grants.
brigade.surContenu((recue, vu, desGrants) => {
  if (recue.demande !== demandeOnglet) return;
  // Cost lit `station` sur la box de chaque projet : chacune entre dans ses chiffres de tête.
  if (ongletDemande === COUT) {
    coutsLus.set(recue.projet, recue);
    poserCout();
  }
  if (recue.projet !== courant?.nom) return;
  rendre(recue, luOnglet, lectureOnglet, true);
  managerVu = vu;
  poserManager();
  grantsVus = desGrants;
  poserGrants();
});
// Les clones relus : leur état remplace celui d'avant, dans Paramètres et sur la case « T ».
brigade.surCode((vu) => {
  codeVu = vu;
  poserCode();
});
// Les stations relues : ce que la page d'une station en montre suit — leurs lignes de l'accueil viennent par `surAccueil`.
brigade.surStations((vu) => {
  stationsVues = vu;
  if (stationOuverte !== undefined) poserPageDeStation();
  poserChoixDesStations();
});
// L'accueil redit : ses lignes remplacent celles d'avant, s'il est affiché — et l'en-tête de la page d'une station.
brigade.surAccueil((vu) => {
  accueilVu = vu;
  if (courant !== undefined || ajoute) return;
  if (stationOuverte === undefined) poserAccueil();
  else poserPageDeStation();
});
// Les projets des stations relus : leurs blocs remplacent ceux d'avant ; le parcours ouvert garde ses choix.
brigade.surProjetsDesStations((vu) => {
  projetsVus = vu;
  poserProjets();
  poserChoixDesStations();
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
  tenus.clear();
  pastilles.clear();
  signalees.clear();
  barre.replaceChildren(
    ...configuration.projets.map((projet) => {
      const entree = icone(projet.monogramme, projet.nom, () => void ouvrir(projet));
      rendreRangeable(entree, projet);
      entree.classList.toggle("refuse", projet.refus !== undefined);
      // Sa couleur d'onglet : la case la porte, qu'elle soit choisie ou non.
      const onglet = projet.couleurs?.onglet;
      entree.classList.toggle("teinte", onglet !== undefined);
      if (onglet !== undefined) entree.style.setProperty("--teinte", onglet);
      // Désinstallé de sa box par l'app : son entrée le dit, et n'a pas de pastille — rien n'est lu de lui.
      entree.classList.toggle("desinstalle", projet.desinstalle !== undefined);
      if (projet.desinstalle !== undefined) entree.ariaLabel = entree.title = `${projet.nom} — ${projet.desinstalle.titre}`;
      // Un projet sans box n'a pas de pastille : rien n'est lu de lui.
      if (projet.box !== undefined) {
        const posee = document.createElement("span");
        posee.className = "pastille";
        entree.append(posee);
        pastilles.set(projet.nom, posee);
        marquerPastille(projet.nom);
        marquerSignal(projet.nom);
      }
      return entree;
    }),
  );
  brigade.faits(++demandeFaits);
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
  const entree = icone("T", "All projects", ouvrirTous);
  entree.id = "entree-tous";
  const pied = icone("+", "Add a project", ouvrirAjout);
  pied.id = "entree-ajout";
  barre.prepend(entree);
  barre.append(pied);
  // La case « T » est neuve : ce que la dernière lecture des clones en dit y est reposé.
  poserCode();

  const meme = configuration.projets.find((projet) => projet.nom === courant?.nom);
  if (meme !== undefined) void ouvrir(meme);
  else if (stationOuverte !== undefined && !ajoute) ouvrirStation(stationOuverte);
  else if (ajoute || configuration.projets.length === 0) ouvrirAjout();
  // L'app s'ouvre sur « Tous les projets », en tête de la barre.
  else ouvrirTous();
  montrer();
}

const demarrage = await brigade.demarrage();
const exemple = demarrage.exemple;
PALETTE = demarrage.palette;
ONGLETS = demarrage.onglets;
RUBRIQUES = demarrage.rubriques;
BOUTONS = demarrage.boutons;
GESTES_DU_MANAGER = demarrage.gestes.manager;
ALLUMAGE = demarrage.gestes.allumage;
GESTES_DE_LA_CUISINE = demarrage.gestes.cuisine;
CONFIRMES = demarrage.gestes.confirmes;
GESTES_DES_GRANTS = demarrage.gestes.grants.gestes;
GRANTS_NOMMES = demarrage.gestes.grants.nommes;
GESTES_D_ATTENTE = demarrage.gestes.attente ?? [];
DIRECTS = demarrage.gestes.directs;
BANNIERE = demarrage.banniere;
for (const champ of CALIBRAGE) proposer(calibre(champ), champ.endsWith("modele") ? demarrage.calibrage.modeles : demarrage.calibrage.efforts, champ.endsWith("modele") ? "— model —" : "— effort —");
// Une lecture arrivée pendant le démarrage est plus récente que celle qu'il rend.
codeVu ??= demarrage.code;
stationsVues ??= demarrage.stations;
projetsVus ??= demarrage.projetsDesStations;
accueilVu ??= demarrage.accueil;
CALIBRAGE_DU_PROJET = demarrage.calibrage;
let configuration = demarrage.configuration;
// Le terminal mesure ses cases à l'ouverture : sa police, embarquée, est chargée avant qu'aucun
// ne s'ouvre. Si elle ne se charge pas, l'app s'ouvre quand même, sur la police de repli.
await Promise.all(["13px", "bold 13px"].map((corps) => document.fonts.load(`${corps} ${jeton("--police-mono")}`))).catch(() => undefined);
afficher();
// Posée une fois la première liste rendue : ce qui change ensuite la remplace.
brigade.surConfiguration((recue, partis) => {
  // Un projet qui a quitté la liste, ou changé de dossier, a perdu ses terminaux.
  for (const id of partis) {
    oublier(id);
    for (const [projet, shell] of aDroite) if (shell === id) aDroite.delete(projet);
  }
  configuration = recue;
  afficher();
});
