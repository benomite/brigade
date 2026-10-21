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
// principal (accueil.ts) ; on n'y agit pas, un clic sur une ligne ouvre sa page, et « Cost » celle
// des coûts de tous les projets (ticket 1022) —, un monogramme par projet, et
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
import { tenirInvite } from "./mise-a-jour/invite.js";
import { poserAppaire, tenirAppairage } from "./telephone/appairage.js";
import { tenirConversation } from "./telephone/conversation.js";
import { boutonAction, confirmationDeGeste, lectureIndisponible, prixDit, survol } from "./briques.js";
import { poserChers } from "./cost/chers.js";
import { poserCourbe } from "./cost/courbe.js";
import { poserPerdus } from "./cost/perdus.js";
import { poserTete } from "./cost/tete.js";
import { poserFiabilite } from "./fiabilite.js";
import { poserReculs } from "./recul.js";
import { DIT_PROVISOIRE, PROVISOIRE, poserApprentissage } from "./apprentissage.js";
import { lireFermeture, poserCloser } from "./closer/section.js";
import { poserBilan } from "./closer/bilan/bilan.js";
import { apresRendu, lireLancement, poserLancement, REPOS } from "./closer/lancement/lancement.js";
import { lireDerive, poserDerive } from "./closer/derive/derive.js";
import { apresRendu as apresLaCorrection, poserCorrections, REPOS as CORRECTION_AU_REPOS } from "./correction/carte.js";
import { poserProfils } from "./profil/carte.js";
import { poserDepotRetenu } from "./onboarding/depot-retenu.js";
import { ligneDAlerte, poserLesStations as stationsDeCuisson } from "./stations-de-cuisson.js";
import { poserLePlafond as plafondDeCalibrage } from "./plafond-de-calibrage.js";
import { apresLaDecision, poserParcours as parcoursDOnboarding } from "./onboarding/parcours.js";

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
/** @typedef {import("../fiabilite.ts").Vu} VuDeLaFiabilite */
// Ce que `onglets.ts` nomme : le journal, et l'onglet Paramètres, qui n'a pas de commande à lui.
const JOURNAL = "log";
const PARAMETRES = "parametres";
// Et la lecture de la page des coûts de l'app (ticket 1022) : `station`, sur la box de chaque projet (onglets.ts, `COUTS`).
const COUTS = "couts";
// Et celle de l'onglet Reliability : la fiabilité des cooks du projet affiché (fiabilite.ts).
const FIABILITE = "fiabilite";
// Et celle de l'onglet Closer : `closing --json`, la partie « closer » du projet affiché (closer/section.js).
const CLOSER = "closer";
// Le geste qui règle le closer, son modèle et son effort ensemble (boutons.ts, `REGLER_LE_CLOSER`).
const REGLER_LE_CLOSER = "regler-closer";
// Les deux onglets de la page d'un projet (ticket 1184), et la lecture que Cooks suit : `station`, celle que `onglets.ts`
// nomme « cooks » — le plafond de cooks, la machine et sa saturation, le quota.
const RAIL = "rail";
const CUISINE = "cooks";
const ONGLETS_DU_PROJET = [
  { id: RAIL, titre: "Rail" },
  { id: CUISINE, titre: "Cooks" },
];
// Sur un écran étroit — le téléphone (ticket 1186) —, trois colonnes ne tiennent pas : la conversation avec le second
// est un troisième onglet, à la place du panneau de droite. Et Cooks y est en lecture seule : les lignes des
// stations, leur état, leurs cooks, et le seul bouton qui lance ou arrête chacune — aucun réglage (stations, plafond,
// bac à sable) : les cooks se règlent là où il y a un ordinateur. Sur un écran large, rien ne change.
const CONVERSATION = "second";
const ONGLETS_DU_PROJET_ETROIT = [...ONGLETS_DU_PROJET, { id: CONVERSATION, titre: "Second" }];
const ECRAN_ETROIT = "(max-width: 720px)";
const ecranEtroit = window.matchMedia?.(ECRAN_ETROIT);
const etroit = () => ecranEtroit?.matches === true;
// La fenêtre passe d'une largeur à l'autre — un téléphone qu'on tourne, une fenêtre qu'on rétrécit : la page se repose.
ecranEtroit?.addEventListener?.("change", () => montrer());
// La colonne de ce qui attend le chef : sur un écran étroit, les colonnes de Rail s'empilent, et elle passe en tête (ticket 1163).
const COLONNE_QUI_T_ATTEND = "TODO";
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
// générique reste, c'est ce que son panneau dit qu'il manque. Un projet qui cuit
// sur cet ordinateur (`ici`) est lu par le geste de sa station, ici, sans `ssh` :
// `brigade <nom> <commande>`, ce que `ssh` aurait lancé sur une box.
/** @param {string} texte */
const mot = (texte) => (/^[A-Za-z0-9@._:-]+$/.test(texte) ? texte : `'${texte.replaceAll("'", `'\\''`)}'`);
/** @param {string} nom */
const cite = (nom) => (/^[a-z0-9-]+$/.test(nom) ? nom : `'${nom.replaceAll("'", `'\\''`)}'`);
/** @param {Projet} projet @param {string} commande */
const geste = (projet, commande) => `${projet.ici === true ? "" : `ssh ${projet.box === undefined ? "<hote>" : mot(projet.box.hote)} `}brigade ${mot(cite(projet.nom))} ${commande}`;
// Ce qui se lit d'un projet : sa box, jointe par `ssh` — ou cet ordinateur, quand c'est sa station
// qui fait tourner sa cuisine (`ici`, poste/cuisine-ici.ts) : il se lit alors sans `ssh` ni `hote`.
// Tant que la station de cet ordinateur ne tourne pas (`sansStation`), rien n'en est lu : la page
// ne dit que cela, en une ligne (attendre).
/** @param {Projet} projet */
const seLit = (projet) => (projet.box !== undefined || projet.ici === true) && projet.sansStation !== true;
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
const ongletsDuProjet = element("onglets-du-projet");
const onglets = element("onglets");
const contenu = element("contenu");
const centre = element("centre");
const rail = element("rail");
const fiche = element("fiche");
const manager = element("manager");
const grants = element("grants");
const fiabilite = element("fiabilite");
const closer = element("closer");
const luOnglet = element("lu-onglet");
const lectureOnglet = element("lecture-onglet");
const gestesOnglet = element("gestes-onglet");
const gestesProjet = element("gestes-projet");
const interrupteurManager = element("interrupteur-manager");
const interrupteurMerge = element("interrupteur-merge");
const provenance = /** @type {HTMLDetailsElement} */ (element("provenance"));
const provenanceLignes = element("provenance-lignes");
const arreterCuisine = element("arreter-cuisine");
// Les serveurs de livraison du projet — ce que `status` en montre — sont sur l'onglet Cooks (ticket 1184), sous ses
// colonnes : poserRail les y pose.
const pages = document.createElement("section");
pages.id = "pages";
pages.ariaLabel = "The pages served";
pages.ariaLive = "polite";
pages.hidden = true;
const note = element("note");
const ongletsTerminaux = element("terminaux");
const fermerShell = element("fermer-shell");
const listeMachines = element("machines");
const colonneSecond = element("second");
const noteSecond = element("note-second");
const fil = element("fil");
const bandeau = element("bandeau");
const teteDuSecond = element("tete-du-second");
const sectionConversation = element("conversation");
// Sur le téléphone (ticket 1165), l'onglet Second n'a pas de terminal : il tient la conversation avec le second, en
// messages (telephone/conversation.js). Posée au démarrage, quand le pont dit que l'app est celle du téléphone ; sur le
// desktop, il n'y en a pas, et le second reste son terminal.
/** @type {ReturnType<typeof tenirConversation> | undefined} */
let conversationDuTelephone;
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
// La carte du projet — son état, ses compteurs, ses cooks en cours et leur station, le dernier événement — est
// sur l'onglet Cooks (ticket 1184) : poserRail l'y pose, en tête.
const carte = document.createElement("section");
carte.id = "carte";
carte.className = "carte";
carte.hidden = true;
// Les stations du projet, sous sa carte (ticket 1185) : une ligne chacune, son état, ses cooks, son bouton qui la
// lance ou l'arrête ; et, en tête de l'onglet Rail, la ligne qui dit ce qui, du côté des cooks, demande un geste —
// avec de quoi ouvrir Cooks. poserCuisson les remplit ; poserRail les pose.
const cuissonDuProjet = document.createElement("div");
cuissonDuProjet.id = "cuisson-du-projet";
cuissonDuProjet.ariaLive = "polite";
// Le plafond de calibrage du projet, sous ses stations, sur Cooks (ticket 1284) : poserPlafond le remplit.
const plafondDuProjet = document.createElement("div");
plafondDuProjet.id = "plafond-du-projet";
plafondDuProjet.ariaLive = "polite";
const alerteDeCuisine = document.createElement("div");
alerteDeCuisine.id = "alerte-de-cuisine";
const lu = element("lu");
const lecture = element("lecture");
const ajout = element("ajout");
const formulaire = /** @type {HTMLFormElement} */ (element("formulaire"));
const ou = element("ou");
const choisi = element("choisi");
const depot = /** @type {HTMLInputElement} */ (element("depot"));
const base = /** @type {HTMLInputElement} */ (element("base"));
const envoi = /** @type {HTMLButtonElement} */ (element("ajouter"));
const issueAjout = element("issue-ajout");
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
// « App », sur l'accueil : la version qui tourne, toujours dite ; et, quand une plus haute est publiée,
// un message avec deux gestes — l'installer maintenant, ou la laisser au lancement suivant.
const appDeLAccueil = document.createElement("section");
appDeLAccueil.id = "accueil-app";
appDeLAccueil.className = "liste";
appDeLAccueil.ariaLabel = "App";
appDeLAccueil.ariaLive = "polite";
const titreDeLApp = bloc("h2", "App");
titreDeLApp.hidden = true;
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
// Le plafond de cooks, sous l'en-tête : ce que `status` en dit, ce qui retient la station, et de quoi le régler.
const plafondDeStation = document.createElement("div");
plafondDeStation.className = "plafond-de-station";
plafondDeStation.ariaLive = "polite";
// Le champ vit d'un rendu à l'autre : une page redessinée par une lecture ne lui reprend pas ce que le chef tape.
const plafondChoisi = /** @type {HTMLInputElement} */ (document.createElement("input"));
plafondChoisi.type = "number";
plafondChoisi.min = "0";
plafondChoisi.step = "1";
plafondChoisi.ariaLabel = "cooks at once, at most";
plafondChoisi.placeholder = "cooks at once";
// La station dont le champ porte une saisie, et ce que le dernier réglage a rendu pour elle.
/** @type {string | undefined} */
let plafondSaisiPour;
/** @type {Map<string, { refus: string, detail?: string }>} */
const plafondsRefuses = new Map();
// La ligne de mise à jour, sous l'en-tête ; et, au bas de la page, « remove the station » et sa confirmation.
const versionDeStation = document.createElement("p");
versionDeStation.className = "version-de-station";
const retraitDeStation = document.createElement("div");
retraitDeStation.className = "retrait-de-station";
pageDeStation.append(retourALAccueil, enTeteDeStation, plafondDeStation, versionDeStation, pannesDeStation, bloc("h3", "Projects"), listeDesProjets, ouvrirLeParcours, formulaireDAjout, ajoutDit, retraitDeStation);
// Le coût de tous les projets (ticket 1022) : il vaut pour l'ensemble, il vit donc au niveau de l'app, pas dans
// un projet. Sur l'accueil, une ligne « Cost » l'ouvre — sans ouvrir aucun projet. Sa page : les tokens
// lancés sur 5 h, 24 h et 7 jours par projet, les tokens perdus, les tickets les plus chers, la courbe, et
// le renvoi vers `/usage` (cost/). Un clic sur un projet l'ouvre ; sur un ticket, ouvre sa fiche dans son projet.
const coutsDeLAccueil = document.createElement("section");
coutsDeLAccueil.id = "accueil-couts";
coutsDeLAccueil.className = "liste";
coutsDeLAccueil.ariaLabel = "Cost";
const ouvrirLesCouts = /** @type {HTMLButtonElement} */ (bloc("button", ""));
ouvrirLesCouts.type = "button";
ouvrirLesCouts.className = "ligne";
ouvrirLesCouts.ariaLabel = "the cost of all projects";
{
  const suite = bloc("span", "›");
  suite.className = "ouvrir";
  suite.ariaHidden = "true";
  ouvrirLesCouts.append(bloc("strong", "all projects"), bloc("span", "tokens over 5 h, 24 h and 7 d · lost tokens · most expensive tickets"), suite);
}
coutsDeLAccueil.append(ouvrirLesCouts);
const pageDesCouts = document.createElement("section");
pageDesCouts.id = "cout";
pageDesCouts.ariaLabel = "Cost of all projects";
const retourDesCouts = /** @type {HTMLButtonElement} */ (bloc("button", "‹ All projects"));
retourDesCouts.type = "button";
retourDesCouts.className = "retour";
const corpsDesCouts = document.createElement("div");
corpsDesCouts.ariaLive = "polite";
pageDesCouts.append(retourDesCouts, corpsDesCouts);

// La cuisine d'un projet de l'app (ticket 983), en tête de son espace : les stations qui la font, en une
// ligne — chacune avec ce qu'elle en dit, un clic ouvre sa page —, et « + station » pour en ajouter
// une. Tant qu'aucune ne la fait, une phrase le dit, et « choose its machine » ouvre le choix
// parmi les stations appairées : c'est le seul geste qui installe un projet sur une station.
const stationsDuProjet = element("stations-du-projet");
const ligneDesStationsDuProjet = document.createElement("p");
ligneDesStationsDuProjet.ariaLive = "polite";
const sensDesStations = bloc("p", "The first station keeps the manager and the pass; all the stations cook.");
sensDesStations.className = "aide";
const ouvrirLaConfiance = /** @type {HTMLButtonElement} */ (bloc("button", ""));
ouvrirLaConfiance.type = "button";
ouvrirLaConfiance.className = "ajout-de-station";
// Le choix lui-même, une carte (ticket 1107). En tête, une phrase dit ce que le chef fait, et une autre
// ce que fait la machine qu'il choisit. Puis la machine principale, d'abord — un choix simple entre les
// machines, chacune avec ce qu'il implique, la toujours allumée proposée d'office —, les renforts
// ensuite, facultatifs, et les cooks à la fois. Le calibrage est replié sous « advanced settings ». Chaque
// valeur arrive posée, avec d'où elle vient : le chef peut tout changer, ou lancer sans rien toucher.
const formulaireDeConfiance = document.createElement("form");
formulaireDeConfiance.className = "confiance";
formulaireDeConfiance.hidden = true;
const titreDeConfiance = document.createElement("h3");
const sensDeConfiance = document.createElement("p");
sensDeConfiance.className = "aide";
// Un champ : son libellé, en entier au-dessus de lui, et ce qu'il en est dit dessous.
/** @param {string} libelle @param {HTMLElement} saisie @param {HTMLElement} [dit] */
function champDeConfiance(libelle, saisie, dit) {
  const pose = document.createElement("div");
  pose.className = "champ";
  const nomme = bloc("label", libelle);
  saisie.id = `confiance-${libelle.toLowerCase().replace(/[^a-z]+/g, "-")}`;
  /** @type {HTMLLabelElement} */ (nomme).htmlFor = saisie.id;
  pose.append(nomme, saisie, ...(dit === undefined ? [] : [dit]));
  return pose;
}
const depotDeConfiance = /** @type {HTMLSelectElement} */ (document.createElement("select"));
depotDeConfiance.ariaLabel = "repository";
const baseDeConfiance = document.createElement("input");
baseDeConfiance.ariaLabel = "integration branch";
baseDeConfiance.spellcheck = false;
const champDuDepot = champDeConfiance("Its GitHub repository", depotDeConfiance);
const champDeLaBase = champDeConfiance("Its integration branch", baseDeConfiance, bloc("small", "The branch the kitchen delivers to."));
const principaleDeConfiance = document.createElement("fieldset");
const choixDeLaPrincipale = document.createElement("div");
choixDeLaPrincipale.className = "machines";
principaleDeConfiance.append(bloc("legend", "Main machine"), choixDeLaPrincipale);
const renfortsDeConfiance = document.createElement("fieldset");
const legendeDesRenforts = document.createElement("legend");
const sensDesRenforts = document.createElement("p");
sensDesRenforts.className = "aide";
const choixDesRenforts = document.createElement("div");
choixDesRenforts.className = "machines";
renfortsDeConfiance.append(legendeDesRenforts, sensDesRenforts, choixDesRenforts);
const cooksDeConfiance = document.createElement("input");
cooksDeConfiance.type = "number";
cooksDeConfiance.min = "1";
cooksDeConfiance.ariaLabel = "cooks at once";
const cooksDits = document.createElement("small");
cooksDits.className = "propose";
const champDesCooks = champDeConfiance("Cooks at once", cooksDeConfiance, cooksDits);
/** @type {Record<"manager-modele" | "manager-effort" | "reviewer-modele" | "reviewer-effort", HTMLSelectElement>} */
const calibrageDeConfiance = {
  "manager-modele": /** @type {HTMLSelectElement} */ (document.createElement("select")),
  "manager-effort": /** @type {HTMLSelectElement} */ (document.createElement("select")),
  "reviewer-modele": /** @type {HTMLSelectElement} */ (document.createElement("select")),
  "reviewer-effort": /** @type {HTMLSelectElement} */ (document.createElement("select")),
};
for (const [champ, liste] of Object.entries(calibrageDeConfiance)) liste.ariaLabel = champ.replace("-modele", " model").replace("-effort", " effort");
// Replié, le calibrage dit quand même ce qui partira : un défaut ne se cache pas (ticket 425).
const reglagesAvances = document.createElement("details");
reglagesAvances.className = "avances";
const resumeDesReglages = document.createElement("summary");
const calibrageDit = document.createElement("small");
calibrageDit.className = "propose";
reglagesAvances.append(
  resumeDesReglages,
  bloc("p", "The model and effort of the manager, which judges the tickets and splits the epics, and of the reviewer, which reviews the deliveries — and so the share of your quota they use."),
  .../** @type {const} */ (["manager", "reviewer"]).map((role) => {
    const ligne = document.createElement("div");
    ligne.className = "calibre";
    ligne.append(bloc("span", role === "manager" ? "Manager" : "Reviewer"), calibrageDeConfiance[`${role}-modele`], calibrageDeConfiance[`${role}-effort`]);
    return ligne;
  }),
  calibrageDit,
);
const confianceRefusee = document.createElement("div");
confianceRefusee.className = "refus";
confianceRefusee.ariaLive = "polite";
const validerConfiance = /** @type {HTMLButtonElement} */ (bloc("button", ""));
validerConfiance.type = "submit";
const annulerConfiance = /** @type {HTMLButtonElement} */ (bloc("button", "cancel"));
annulerConfiance.type = "button";
const gestesDeConfiance = document.createElement("div");
gestesDeConfiance.className = "lancer";
gestesDeConfiance.append(validerConfiance, annulerConfiance);
formulaireDeConfiance.append(titreDeConfiance, sensDeConfiance, champDuDepot, champDeLaBase, principaleDeConfiance, renfortsDeConfiance, champDesCooks, reglagesAvances, confianceRefusee, gestesDeConfiance);
const confianceDite = document.createElement("p");
confianceDite.ariaLive = "polite";
// Déménager sa cuisine (ticket 1095), d'un seul geste : « move the kitchen » ouvre, sous la ligne, le
// choix de la machine où l'emmener — cet ordinateur, sa box, une autre —, et ce que ça coûte, en une
// ligne. Un clic sur une machine la déménage, sans retrait ni rajout. Refusé, la raison se dit en une
// phrase sous la ligne, et la ligne ne change pas : il cuit toujours là où il cuisait.
const ouvrirLeDemenagement = /** @type {HTMLButtonElement} */ (bloc("button", "move the kitchen"));
ouvrirLeDemenagement.type = "button";
ouvrirLeDemenagement.className = "ajout-de-station";
ouvrirLeDemenagement.dataset.geste = "demenager";
const choixDuDemenagement = document.createElement("section");
choixDuDemenagement.className = "demenagement";
choixDuDemenagement.ariaLabel = "Move the kitchen";
choixDuDemenagement.hidden = true;
const demenagementDit = document.createElement("p");
demenagementDit.className = "demenagement-dit";
demenagementDit.ariaLive = "polite";
// Le parcours d'un projet neuf (ticket 1111) : de sa station choisie à son premier ticket, en quatre
// étapes, telles que sa principale les publie — à la place du vide sous la ligne (onboarding/parcours.js).
const parcoursDuProjet = document.createElement("div");
parcoursDuProjet.className = "parcours-du-projet";
parcoursDuProjet.ariaLive = "polite";
// Ce qui retient la cuisine du projet (ticket 1119) : l'accès au dépôt refusé, avec son geste, ou un worktree
// impossible à préparer, avec sa raison et l'heure du prochain essai — à la place de « prepares it within a minute ».
const depotRetenu = document.createElement("div");
depotRetenu.hidden = true;
stationsDuProjet.append(ligneDesStationsDuProjet, sensDesStations, ouvrirLeDemenagement, ouvrirLaConfiance, choixDuDemenagement, formulaireDeConfiance, demenagementDit, depotRetenu, confianceDite, parcoursDuProjet);

// La lecture de `station` sur l'onglet Cooks (ticket 1184), sous ses colonnes : le plafond de cooks, la machine — saturée
// ou non —, le quota, et le bouton qui écrit le réglage du plafond dans le second. Elle était sous Settings → Cooks ;
// elle se lit de même, seule, toutes les trente secondes tant que l'onglet est montré.
const lectureDeLaCuisine = document.createElement("section");
lectureDeLaCuisine.className = "lecture-de-la-cuisine";
lectureDeLaCuisine.ariaLabel = "The station";
const luCuisine = document.createElement("p");
luCuisine.id = "lu-cuisine";
luCuisine.ariaLive = "polite";
const gestesCuisine = document.createElement("p");
gestesCuisine.id = "gestes-cuisine";
gestesCuisine.className = "gestes";
const lectureCuisine = document.createElement("div");
lectureCuisine.id = "lecture-cuisine";
// Ce que `station` a dit y est déplié — le plafond, la machine, le quota s'y lisent sans un clic ; replié par le chef,
// il le reste d'une relecture à l'autre.
let cuisineRepliee = false;
// Ce qu'elle est, en une ligne ; la commande lue et sa cadence, au survol.
const teteDeLaCuisine = document.createElement("h3");
lectureDeLaCuisine.append(teteDeLaCuisine, luCuisine, gestesCuisine, lectureCuisine);

/** @type {Map<number, { terminal: Terminal, xterm: Xterm, ajuste: FitAddon, cadre: HTMLDivElement }>} */
const vues = new Map();
// La page où chaque projet a été laissé : on y revient. Aucune : le rail a le centre.
/** @type {Map<string, string>} */
const laisse = new Map();
// L'onglet que chaque projet montre sous ses pages, Rail ou Cooks (ticket 1184) : le dernier que le chef y a ouvert, retenu
// d'une ouverture de l'app à l'autre dans le stockage de la vue. Un projet jamais ouvert s'ouvre sur Rail.
const CLE_DES_ONGLETS = "brigade.onglets-des-projets";
/** @type {Map<string, string> | undefined} */
let ongletsRetenus;
function retenus() {
  if (ongletsRetenus !== undefined) return ongletsRetenus;
  ongletsRetenus = new Map();
  try {
    const lus = JSON.parse(window.localStorage?.getItem(CLE_DES_ONGLETS) ?? "{}");
    for (const [nom, id] of Object.entries(lus ?? {})) if (id === RAIL || id === CUISINE || id === CONVERSATION) ongletsRetenus.set(nom, id);
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
let ajoute = false;
// Le dossier choisi pour le projet à ajouter.
let dossier = "";
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
// La dernière lecture de Reliability du projet affiché : son `station` dit aussi ce que ce projet a coûté,
// posé sous sa fiabilité (ticket 1022). Indéfinie : pas encore lue depuis que la lecture est affichée.
/** @type {Lecture | undefined} */
let lectureDeLaFiabilite;
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
// Ce que la dernière lecture de l'onglet Reliability donne à poser. Indéfini : pas encore lu depuis
// que l'onglet est affiché.
/** @type {VuDeLaFiabilite | undefined} */
let fiabiliteVue;
// Ce que la dernière lecture de l'onglet Closer a donné, pour son projet. Indéfini : pas encore lu
// depuis que l'onglet est affiché.
/** @type {{ projet: string, lu: import("./closer/section.js").Lu } | undefined} */
let closerLu;
// Les projets dont le chef a déplié la liste de ce que le closer a repéré : une relecture ne la replie pas.
/** @type {Set<string>} */
const trouvaillesDepliees = new Set();
// Le modèle et l'effort que le chef a choisis pour régler le closer d'un projet, pas encore écrits :
// une relecture ne les lui retire pas.
/** @type {Map<string, import("./closer/section.js").Choix>} */
const reglagesDuCloser = new Map();
// Le lancement d'un nettoyage en route, par projet (closer/lancement/lancement.js) : l'aperçu lu, la
// confirmation ouverte, la demande partie et la relecture qui la montrera. Absent : rien n'est en route.
/** @type {Map<string, import("./closer/lancement/lancement.js").Etat>} */
const lancementsDuCloser = new Map();
// La réponse du chef en route sur une correction proposée (correction/carte.js), par projet et
// proposition (`<projet>#<numéro>`). Absente : la carte attend. Elle tient tant que les faits lus portent la
// proposition — tranchée, la carte reste hors de la file jusqu'à la lecture qui ne la porte plus.
/** @type {Map<string, import("./correction/carte.js").Etat>} */
const reponsesAuxCorrections = new Map();
// La réponse du chef en route sur un profil de cook proposé (profil/carte.js), tenue de même.
/** @type {Map<string, import("./correction/carte.js").Etat>} */
const reponsesAuxProfils = new Map();
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
// La station dont la page est ouverte, par son gist. Aucune : c'est l'accueil — ou un projet.
/** @type {string | undefined} */
let stationOuverte;
// La page des coûts de tous les projets est ouverte, à la place de l'accueil (ticket 1022).
let coutsOuverts = false;
// Ce que `faits` a rendu en dernier pour chaque projet, et la demande à laquelle il répond :
// une par barre posée. Sans entrée, le projet n'a pas encore été lu.
/** @type {Map<string, Dessinable>} */
const tenus = new Map();
let demandeFaits = 0;
// Les clics sur le bouton d'une station qui attendent leur réponse, et ce que le dernier de chacune a rendu
// (ticket 1185) — par projet et station.
/** @type {Map<string, import("../cuisson.ts").GesteDeCuisson>} */
const cuissonsEnCours = new Map();
/** @type {Map<string, import("./stations-de-cuisson.js").Dit>} */
const cuissonsDites = new Map();
const cleDeCuisson = (/** @type {string} */ projet, /** @type {string} */ station) => `${projet}\u0000${station}`;
// Le plafond de calibrage de chaque projet (ticket 1284) : ce que le chef a choisi dans ses listes sans l'envoyer,
// le clic qui attend sa réponse, et ce que le dernier a rendu.
/** @type {Map<string, { modele: string, effort: string }>} */
const plafondsChoisis = new Map();
/** @type {Map<string, "regler" | "defaut">} */
const plafondsEnCours = new Map();
/** @type {Map<string, import("./plafond-de-calibrage.js").Dit>} */
const plafondsDits = new Map();
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
// Ce qu'il est advenu du dernier geste de la fiche qui n'est pas parti, par `<projet>#<ticket>` : en une ligne, et ce
// que la station ou le pont en a dit, au survol.
/** @type {Map<string, { dit: string, detail: string }>} */
const refusDeFiches = new Map();
// Ce qu'il est advenu du dernier geste de la fiche qui est parti, par `<projet>#<ticket>` (ticket 1164) : en route —
// ses boutons attendent la réponse, et rien ne part deux fois —, fait par la station, sans terminal où le lire — ce
// que le pont du téléphone rend —, ou écrit dans le second, que l'écran étroit ne montre pas à côté de la fiche.
/** @type {Map<string, { envoi: string } | { fait: string, detail: string } | { second: true }>} */
const issuesDeFiches = new Map();
// Un geste qui n'est pas parti — le pont a levé, ou ne porte pas l'action (le téléphone, tant que le guichet de sa
// station ne la prend pas) : une ligne, et pourquoi au survol.
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
// La mise à jour de l'app installée, telle que la dernière lecture la dit (mise-a-jour/etat.ts). Indéfini : pas encore reçue.
/** @type {import("../mise-a-jour/etat.ts").EtatDeMiseAJour | undefined} */
let miseAJourVue;
// La version dont le chef a dit « later » : son message ne revient pas avant le lancement suivant.
let miseAJourReportee = "";
// « Install now » en cours, ou refusée : ce que l'app en dit sous le message.
let miseAJourInstalle = false;
let miseAJourRefusee = "";
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
// Le choix des stations auxquelles confier la cuisine du projet affiché, tant qu'il est ouvert : le
// même que le parcours, pour ce projet-là — une relecture des stations ne perd pas ce qui est coché.
// `renforts` : les stations cochées en plus de la principale ; `cooksTouches`, `calibrageTouche` : le
// chef a changé la valeur proposée — elle ne suit plus la principale ni les projets relus.
/** @type {{ projet: string, ouvertLe: string, depots: import("../projets/github.ts").DepotDuChef[], renforts: Set<string>, principale: string, touchee: boolean, cooksTouches: boolean, calibrageTouche: boolean, manque: Set<"depot" | "base" | "cooks"> } | undefined} */
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
// Le déménagement dont le choix est ouvert — pour quel projet —, et s'il part.
/** @type {{ projet: string, part: boolean } | undefined} */
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
let POSTE = { nom: "this Mac", mac: true };

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
    xterm.onData((donnees) => brigade.ecrire(id, donnees));
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
    /** @type {Terminal} */
    const terminal = { id, projet: "", genre: "shell", titre: "", note: "", arrete: false };
    tenue = { terminal, xterm, ajuste, cadre };
    vues.set(id, tenue);
  }
  return tenue;
}

const duCourant = () => [...vues.values()].filter(({ terminal }) => terminal.projet === courant?.nom);
const actif = () => (courant === undefined ? undefined : laisse.get(courant.nom));
// La lecture suivie : celle de la page ouverte par-dessus ; sans page, sur l'onglet Cooks, `station` (ticket 1184).
// Sur un écran étroit, Cooks ne la suit pas : le plafond et le quota sont des réglages (ticket 1186).
const lue = () => actif() ?? (courant !== undefined && ongletDe(courant) === CUISINE && !etroit() ? CUISINE : undefined);
// L'onglet Cooks est montré, avec la lecture de `station` : aucune page ne le couvre, et l'écran est large.
const cuisineMontree = () => courant !== undefined && actif() === undefined && ongletDe(courant) === CUISINE && !etroit();
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
  // Rail et Cooks, à côté du nom (ticket 1184) : celui qui est montré est marqué — aucun quand une page le couvre.
  const ouvert = courant;
  ongletsDuProjet.hidden = ouvert === undefined;
  ongletsDuProjet.replaceChildren(
    ...(ouvert === undefined
      ? []
      : (etroit() ? ONGLETS_DU_PROJET_ETROIT : ONGLETS_DU_PROJET).map(({ id, titre }) => {
          const cree = bouton(titre, () => choisirOnglet(id));
          cree.role = "tab";
          cree.ariaSelected = String(visible === undefined && ongletDe(ouvert) === id);
          return cree;
        })),
  );
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

  // L'explication d'un onglet relayé n'est pas écrite à plat : une icône d'aide la porte. Celle de Cooks aussi.
  const suivie = ONGLETS.find(({ id }) => id === lue());
  const explication =
    suivie === undefined || courant === undefined || courant.desinstalle !== undefined
      ? ""
      : suivie.id === FIABILITE
        ? `the reliability of the cooks, as the station measures it: the chef's window and thresholds from \`${geste(courant, "station")}\`, then \`${geste(courant, "measures --last <window> --by 1")}\` — both outputs are below, as the station returns them; re-read on their own every thirty seconds, while this tab is shown`
        : `${suivie.id === "manager" ? "the manager state, then " : suivie.id === "grants" ? "the grants state, then " : ""}the output of \`${geste(courant, suivie.commande)}\`, as the station returns it${suivie.precision === undefined ? "" : ` (${suivie.precision})`} — re-read on its own every thirty seconds, while this tab is shown`;
  // Sur Cooks, elle est en tête de sa lecture, sous les colonnes : la ligne du haut n'a rien à dire.
  const surCuisine = cuisineMontree();
  teteDeLaCuisine.replaceChildren(...(surCuisine ? ["the station: its cap of cooks, its machine, its quota", ...(explication === "" ? [] : [survol(document, explication)])] : []));
  note.replaceChildren(
    ...(gesteRate !== undefined
      ? poserGesteRate(gesteRate)
      : nonEcrit !== "" ? [nonEcrit] : suivie !== undefined && courant?.desinstalle !== undefined ? ["nothing is read for this tab: this project is uninstalled from its station"] : explication === "" || surCuisine ? [] : [survol(document, explication)]),
  );
  note.hidden = (note.childElementCount === 0 && note.textContent === "") || conversationMontree();
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
      // La lecture de `station` n'y est plus : elle est l'onglet Cooks (ticket 1184).
      ...[[PARAMETRES, "General"], ...ONGLETS.filter(({ id }) => id !== CUISINE && rubriqueDe(id)?.id === PARAMETRES).map(({ id, titre }) => [id, titre])].map(([id, titre]) => {
        const cree = bouton(/** @type {string} */ (titre), () => void (laisse.set(/** @type {Projet} */ (courant).nom, /** @type {string} */ (id)), nonEcrit = "", montrer()));
        cree.ariaPressed = String(id === visible);
        return cree;
      }),
    );
  }
  // Le journal : un geste, pas un onglet. Le recliquer le referme.
  journal.hidden = courant === undefined || !seLit(courant);
  journal.ariaPressed = String(visible === JOURNAL);
  // Au centre, seul un fichier des projets illisible a sa raison à la place de l'espace.
  message.hidden = courant !== undefined;
  poserSecond(ouvrable, droite?.terminal);
  poserLaFiabilite();
  poserLeCloser();
  poserGestes(gestesOnglet, relaye?.id);
  poserGestes(gestesCuisine, cuisineMontree() ? CUISINE : undefined);
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
  centre.hidden = conversation;
  principal.toggleAttribute("data-conversation", conversation);
  // Le téléphone n'a ni terminal ni shell : à leur place, la conversation du projet — sauf s'il ne s'ouvre pas, ce que
  // la note dit, comme sur le desktop.
  const enMessages = conversationDuTelephone !== undefined && courant !== undefined && courant.refus === undefined;
  teteDuSecond.hidden = conversationDuTelephone !== undefined;
  sectionConversation.hidden = !enMessages;
  noteSecond.hidden = enMessages;
  if (enMessages && !colonneSecond.hidden) conversationDuTelephone?.montrer(/** @type {Projet} */ (courant).nom);
  noteSecond.textContent =
    courant !== undefined && courant.refus !== undefined
      ? `“${courant.nom}” does not open: ${courant.refus} — it has no second`
      : nonEcritSecond !== ""
        ? nonEcritSecond
        : (montre?.note ?? (ouvrable ? "the second is opening…" : ""));
  fil.hidden = !ouvrable || conversationDuTelephone !== undefined;
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
/** @param {string} id @param {readonly string[]} [valeurs] ce que le geste attend de la page — le réglage du closer */
async function inscrire(id, valeurs) {
  const projet = courant;
  if (projet === undefined) return;
  nonEcrit = nonEcritSecond = "";
  gesteRate = undefined;
  if (projet.refus !== undefined) return montrer();
  try {
    const rendu = await (valeurs === undefined ? brigade.inscrire(projet.nom, id) : brigade.inscrire(projet.nom, id, valeurs));
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
  gesteRate = undefined;
  /** @param {string} raison */
  const rate = (raison) => {
    nonEcritSecond = raison;
    gesteRate = { texte: raison, rejouer: () => void ecrireGeste(id, grant, oui) };
  };
  try {
    const rendu = await brigade.geste(projet.nom, id, grant, oui);
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
  const encore = bouton("try again", rejouer);
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

// Rail ou Cooks (ticket 1184) : l'onglet choisi est montré, et retenu pour ce projet. Une page ouverte par-dessus se
// referme, la fiche aussi ; le second, à droite, ne bouge pas.
/** @param {string} id */
function choisirOnglet(id) {
  if (courant === undefined) return;
  // Sur le téléphone, choisir Second relit la conversation : ce qui est montré reste en attendant.
  if (id === CONVERSATION) conversationDuTelephone?.relire(courant.nom);
  retenir(courant.nom, id);
  laisse.delete(courant.nom);
  nonEcrit = "";
  if (ouverte !== undefined) fermerFiche();
  montrer();
}

// Paramètres ouvre l'état du projet — par-dessus le rail. Recliqué, l'onglet ouvert se referme.
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
// La page des coûts de l'app tient lieu d'onglet, l'espace fermé : elle lit la box de chaque projet.
function lireOnglet() {
  const relaye = ONGLETS.find(({ id }) => id === lue());
  const couts = courant === undefined && coutsOuverts && !ajoute;
  const voulu = couts ? JSON.stringify(["", COUTS]) : courant === undefined || relaye === undefined ? "" : JSON.stringify([courant.nom, relaye.id]);
  if (voulu === suivi) return;
  suivi = voulu;
  // L'état du manager lu avant n'est plus celui de cette lecture : il revient avec elle.
  managerVu = undefined;
  poserManager();
  // Celui des grants non plus.
  grantsVus = undefined;
  poserGrants();
  // Ni la fiabilité, ni ce que le projet a coûté.
  fiabiliteVue = undefined;
  lectureDeLaFiabilite = undefined;
  poserLaFiabilite();
  // Ni le closer.
  closerLu = undefined;
  poserLeCloser();
  if (courant !== undefined && relaye !== undefined) {
    if (actif() === undefined) attendre(courant, luCuisine, lectureCuisine);
    else attendre(courant, luOnglet, lectureOnglet);
  }
  ongletDemande = couts ? COUTS : relaye?.id;
  brigade.onglet(courant?.nom, ongletDemande, ++demandeOnglet);
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
  "The station was reached, and its step refused the account your `ssh` reaches it with: what it said about it is above.",
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
  `On your workstation, \`brigade\` alone does not exist, and need not: the step is typed there like this, as the app writes it — \`${geste(projet, "status")}\`, for example.`,
].join("\n");

// Ce que l'app dit quand le geste a refusé le `node` de la box (code 70).
const NODE_INAPTE = [
  "The station was reached, and its step refused to start the runtime: the station's `node` does not suit it. What it said about it is above.",
  "",
  "It is not the runtime that needs updating: the step's sentence says the remedy, and it is applied on the station:",
  "(docs/installer.md, section 3, “Préparer”)",
].join("\n");

// Ce que l'app dit sous le message de `ssh`, quel qu'il soit : elle ne le lit
// pas, elle nomme où chacune de ses phrases est expliquée.
const SSH_EN_ECHEC = [
  "`ssh` did not open a session on the station, and said why: its message is above. The app does not read it.",
  "What each of its sentences means, and the step that answers it:",
  "(docs/installer.md, section 2, “Joindre”)",
  "",
  "If it says your key was refused (`Permission denied`), the station answers and it is access you lack. It is given on the station:",
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
      ? ["the station does not know this project", inconnu(recue.projet)]
      : recue.cas === "sans-droit"
        ? ["your account lacks the right to this action on the station", SANS_DROIT]
        : recue.cas === "commande-manque"
          ? ["a command is missing on the station", commandeManque(projet)]
          : recue.cas === "node-inapte"
            ? ["the station's node does not suit the runtime", NODE_INAPTE]
            : recue.atteinte
              ? ["the station answered, but not as the app expects", plusPilotable]
              : recue.cas === "ssh-en-echec"
                ? ["the station could not be reached", SSH_EN_ECHEC]
                : ["the station did not answer", undefined];
  return [lectureIndisponible(document, ligne, suite === undefined ? recue.erreur : `${recue.erreur}\n\n${suite}`)];
}

// Ce qu'une lecture donne à voir, dans le panneau de l'espace, à côté du terminal et dans
// un onglet de contenu : un des sept états, dit en toutes lettres, et dessous ce
// que l'app a obtenu. Celle d'un onglet n'a rien de mis à part : ce n'est pas `status`.
/**
 * @param {Montree | Lecture} recue @param {HTMLElement} tete @param {HTMLElement} corps @param {boolean} [accueil] vrai : le détail est replié ou au survol, aucune commande n'est écrite
 * @param {{ ouvert: boolean, basculer: (ouvert: boolean) => void }} [deplie] le détail est déplié tant que le chef ne l'a pas replié — sur Cooks
 */
function rendre(recue, tete, corps, accueil = false, deplie = undefined) {
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
      if (deplie !== undefined) {
        lue.open = deplie.ouvert;
        lue.addEventListener("toggle", () => deplie.basculer(lue.open));
      }
      lue.append(bloc("summary", "what the station said"), ...recue.sorties.flatMap(({ commande, texte }) => [bloc("h3", commande), bloc("pre", texte)]));
      corps.replaceChildren(...(mise ? [aPart(projet, recue.attend, true)] : []), lue);
    } else corps.replaceChildren(...(mise ? [aPart(projet, recue.attend)] : []), ...recue.sorties.flatMap(({ commande, texte }) => [bloc("h3", `${geste(projet, commande)}${commande === "status" ? sans : ""}`), bloc("pre", texte)]));
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
  brut.append(bloc("summary", "what the station said"), bloc("pre", rate.obtenu));
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
    tete.push(ditEtAide("p", "The installation is finished", "the station verified everything, the kitchen is ready to serve, and no installation step is left."));
    if ("commande" in guide.demarrage) tete.push(action("Write the start of the service in a shell", () => demarrerService(projet)));
  }
  if (guide.courante !== null && guide.lecture.etat === "lue") {
    const annonces = document.createElement("div");
    annonces.className = "annonces";
    annonces.append(ditEtAide("strong", "What the app cannot do for you", "said before you meet it"));
    if (guide.annonces.etat === "en-cours") annonces.append(ditEtAide("p", "The station is being verified…", "what it lacks, that only someone with `sudo` there can set up, is announced here as soon as it answers."));
    if (guide.annonces.etat === "pas-lues") annonces.append(refus("The verification did not return its verdict: what the station may lack is not known."));
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
    brut.append(bloc("summary", "what the station said"), bloc("pre", guide.fait.obtenu));
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
  if (etape.id === "verification") return [ditEtAide("p", "Verify again once the station is set up", "“Verify” is at the top of this screen: once what it says is missing on the station is set up, verify again.")];
  if (etape.id === "demarrage") return "refus" in guide.demarrage ? [refus(guide.demarrage.refus)] : [action("Start", () => demarrerService(projet))];
  if (detail === undefined) return [];
  if (detail.etat !== "lu") return poserRate(projet, detail);

  if (detail.id === "stations") {
    const { proposees, absent, declarees } = detail.lu;
    const poses = [];
    if (declarees.length > 0) poses.push(bloc("p", `Declared now: ${declarees.map(({ nom, cooks, fournit }) => `${nom} — ${cooks} cook${cooks > 1 ? "s" : ""} at most, provides ${fournit.join(", ")}`).join(" · ")}`));
    if (absent !== null) poses.push(refus(`Its main station provides no station — ${absent}`));
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
    gesteRate = undefined;
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
  gesteRate = undefined;
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

// Les tickets ordinaires de cet ordinateur, sous Paramètres : l'option, la limite de cooks, une ligne
// qui dit ce que ça implique — et, quand la station dit son bac à sable indisponible, pourquoi ce poste
// ne prend aucun ticket ordinaire. Le process principal décide du bloc (ordinaires.ts) : hors d'un Mac,
// il n'est pas réglable, et seule sa ligne se pose — pourquoi ce poste n'en prend pas.
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
  const titre = `Ordinary tickets on ${POSTE.nom}`;
  ordinaires.ariaLabel = titre;
  ordinaires.hidden = false;
  if (recu.reglable === false) return ordinaires.replaceChildren(bloc("h3", titre), bloc("p", recu.explication));
  const option = document.createElement("input");
  option.type = "checkbox";
  option.checked = recu.actif;
  const limite = document.createElement("input");
  limite.type = "number";
  limite.min = "1";
  limite.step = "1";
  limite.value = recu.limite === null ? "" : String(recu.limite);
  limite.ariaLabel = `Cooks ${POSTE.nom} runs at once`;
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
  ordinaires.replaceChildren(
    bloc("h3", titre),
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
  `What the station returned is above, as is. What \`${geste(projet, "status")}\` says about the project can still be read, below.`,
].join("\n");
// Quand la box, jointe, n'a pas répondu à `faits` sans que son code dise pourquoi :
// un runtime d'avant cette commande est le cas attendu.
const SANS_REPONSE = [
  "The station was reached, and `facts` did not answer there: what it returned is above, as is.",
  "A runtime older than `facts` is the expected case — it is updated on its station (docs/runtime/exploitation.md, “Piloter”, line “Mettre à jour”).",
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
  // La box ne répond pas : un mot, le même que la bande (alertes.ts) — ce que le dernier rail disait n'est plus lu.
  const muette = signaux.get(nom)?.etat === "injoignable";
  if (muette) {
    delete posee.dataset.ton;
    delete posee.dataset.forme;
    posee.dataset.lu = "non";
  }
  const dit = muette ? "unreachable" : tenu === undefined ? "first read in progress…" : "tableau" in tenu ? tenu.tableau.etat : `no facts read — ${tenu.titre}`;
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

// La carte de projet : l'état en un mot, les cinq compteurs comme nombres, les
// cooks en cours — le ticket, son titre, la station de chacun, ou ce qui se lit
// à leur place —, le dernier événement. Sans faits : ce que l'app a obtenu, à leur place.
/** @param {HTMLElement} ou @param {Projet} projet */
function poserCarte(ou, projet) {
  const tenu = tenus.get(projet.nom);
  // Rien n'est lu — ni box, ni cuisine sur cet ordinateur : le panneau le dit déjà.
  ou.hidden = !seLit(projet);
  if (!seLit(projet)) return ou.replaceChildren();
  if (tenu === undefined) return ou.replaceChildren(bloc("p", "facts: first read in progress…"));
  const heure = heureDe(tenu.a);
  if (!("tableau" in tenu)) {
    const titre = bloc("p", `${tenu.titre} — tried at ${heure}, the next follows on its own`);
    titre.className = "sans-faits";
    if ("informe" in tenu) return ou.replaceChildren(titre, lectureIndisponible(document, "the station answered with something the app does not draw", `${tenu.rendu}\n\nThis is not the shape the app draws: ${tenu.informe}.\n${sansForme(projet)}`));
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
/** @param {Projet} projet @param {import("../faits.ts").Carte} carte @param {string | undefined} [tonAttend] le ton de T'attend, quand le bon y est posé @param {boolean} [execution] sa page servie dit son worktree et son port — sur Cooks ; sur Rail, seulement l'écran et son geste (ticket 1184) */
function poserBon(projet, carte, tonAttend, execution = true) {
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
      : "the address the station returned for this ticket is not https: the app does not open it";
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
  if (pr === false) bon.append(bloc("small", "merged PR: the address the station returned is not https, the app does not open it"));
  bon.append(...poserGestesDAttente(projet, carte));
  bon.append(...(pagesServies.get(projet.nom)?.pages ?? []).filter((page) => page.ticket === ticket).map((page) => poserServie(projet, page, false, execution)));
  bon.append(...(pagesServies.get(projet.nom)?.aLancer ?? []).filter((tenue) => tenue.ticket === ticket).map((tenue) => poserALancer(projet, tenue, false, execution)));
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
  gesteRate = undefined;
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
  // Répondue, sa carte attend le manager dans WAITING : la fiche la garde, et ce qui y a été répondu.
  // Retenu par `blocked-on-human` : lever la retenue d'un clic, sans commande à recopier. Puis,
  // pour tout ticket, ses gestes — la demande au second en est. Rien n'est envoyé sans un clic.
  if (attend.length > 0 || carte.repondue !== undefined) {
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
  const issue = issuesDeFiches.get(cle);
  const liste = document.createElement("ul");
  for (const propose of proposes) {
    const ligne = document.createElement("li");
    ligne.dataset.geste = propose.id;
    ligne.append(...poserGesteDeFiche(projet, ticket, propose, issue !== undefined && "envoi" in issue));
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
    const dit = bloc("p", refus.dit);
    dit.className = "refus";
    if (refus.detail !== "") dit.title = refus.detail;
    section.append(dit);
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

// Ce qu'un geste de la fiche pose : son bouton — recommandé s'il l'est, son prix au survol — et,
// pour la priorité, de quoi la choisir avant. `occupe` : un geste de la fiche attend sa réponse — aucun ne part.
/** @param {Projet} projet @param {number} ticket @param {import("../gestes-fiche.ts").Propose} propose @param {boolean} occupe @returns {HTMLElement[]} */
function poserGesteDeFiche(projet, ticket, propose, occupe) {
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
      cible.disabled = occupe || choix.value === "";
      choix.addEventListener("change", () => {
        if (choix.value === "") prioritesChoisies.delete(cle);
        else prioritesChoisies.set(cle, choix.value);
        cible.disabled = occupe || choix.value === "";
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
      brigade.relireBox(demandeFaits);
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
  if (histoire !== undefined && !("sans" in histoire)) posees.push(poserRetro(ticket, histoire.retro));
  return posees;
}

// La rétro du ticket servi : les leçons qu'elle a laissées au projet — chacune sa pastille
// « provisional », son sens au survol comme sur la page Reliability, son id et son texte —, puis ce
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
    section.append(lectureIndisponible(document, "retro unavailable", retro.sans));
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
      // La pastille est le déclencheur de son survol, comme sur la page Reliability.
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
    situations.set(cle, await brigade.situation({ ...(carte.etat === undefined ? {} : { etat: carte.etat }), attend: carte.attend, dit: carte.dit }));
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
  const dit = bloc("p", `up to date ${minutes} min ago — the station has not answered since; the commands and read times are in Settings`);
  dit.className = "fraicheur";
  return [dit];
}
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
        const ouvrir = bouton("", () => void ouvrirIssue(projet, ticket));
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

// Ce que dit la page d'un projet qui cuit sur cet ordinateur quand la station de cet ordinateur ne tourne pas.
const STATION_ARRETEE = "this computer's station is not running";

// Les stations du projet sur Cooks, et la ligne d'alerte de Rail (ticket 1185), d'après ses derniers faits — rien
// tant que sa box ne répond pas : ce qu'ils en disaient n'est plus lu — et, pour l'alerte, ce que la station du
// projet publie de l'accès à son dépôt et de son refus (projets/demande.ts), que le bloc de ses stations détaille.
// Sur un écran large, chaque cook en cours est la carte de son ticket, celle du kanban de Rail, qui ouvre la même
// fiche (ticket 1270) ; `posees` reçoit chacune, que la fiche ouverte suive la carte posée.
/** @param {Projet} projet @param {Map<import("../faits.ts").Carte, HTMLElement>} [posees] */
function poserCuisson(projet, posees = new Map()) {
  const tenu = tenus.get(projet.nom);
  const stations = tenu !== undefined && "tableau" in tenu && !muets.has(projet.nom) ? tenu.tableau.stations : undefined;
  const siens = (/** @type {Map<string, any>} */ ou) => new Map([...ou].flatMap(([cle, valeur]) => (cle.startsWith(cleDeCuisson(projet.nom, "")) ? [[cle.slice(cleDeCuisson(projet.nom, "").length), valeur]] : [])));
  const pose = stationsDeCuisson(document, {
    lignes: stations?.lignes,
    enCours: siens(cuissonsEnCours),
    dits: siens(cuissonsDites),
    jouer: (station, geste) => void cuire(projet.nom, station, geste),
    pastille,
    ...(etroit() || ongletDe(projet) !== CUISINE
      ? {}
      : {
          carte: (/** @type {import("../faits.ts").Cook} */ cook) => {
            const carte = carteDuCook(projet.nom, cook);
            const bon = poserBon(projet, carte, undefined, true);
            posees.set(carte, bon);
            return bon;
          },
        }),
  });
  cuissonDuProjet.replaceChildren(...(pose === null ? [] : [pose]));
  const vu = projetsVus?.projets.find(({ nom }) => nom === projet.nom);
  const alerte = ligneDAlerte(document, {
    alerte: stations?.alerte ?? null,
    refusee: stations?.lignes.some(({ etat }) => etat === "refused") ?? false,
    acces: vu?.acces ?? vu?.worktree?.acces ?? null,
    refus: vu?.refus ?? null,
    ouvrir: () => choisirOnglet(CUISINE),
  });
  alerteDeCuisine.hidden = alerte === null;
  alerteDeCuisine.replaceChildren(...(alerte === null ? [] : [alerte]));
  poserPlafondDeCalibrage(projet);
}

// Le plafond de calibrage du projet sur Cooks (ticket 1284), d'après ses derniers faits — rien tant que sa box ne
// répond pas, ni d'un runtime qui ne le donne pas.
/** @param {Projet} projet */
function poserPlafondDeCalibrage(projet) {
  const tenu = tenus.get(projet.nom);
  const vu = tenu !== undefined && "tableau" in tenu && !muets.has(projet.nom) ? tenu.tableau.plafondDeCalibrage : undefined;
  const pose = plafondDeCalibrage(document, {
    vu,
    choisi: plafondsChoisis.get(projet.nom),
    enCours: plafondsEnCours.get(projet.nom),
    dit: plafondsDits.get(projet.nom),
    choisir: (choix) => {
      plafondsChoisis.set(projet.nom, choix);
      if (courant?.nom === projet.nom) poserPlafondDeCalibrage(courant);
    },
    jouer: (choix) => void reglerPlafondDeCalibrage(projet.nom, choix),
  });
  plafondDuProjet.replaceChildren(...(pose === null ? [] : [pose]));
}

// Le geste du plafond part par le process principal (plafond-de-calibrage.ts). Fait, la box est relue tout de suite :
// la page dit le plafond neuf, et d'où il vient, sans attendre la lecture suivante.
/** @param {string} projet @param {import("../plafond-de-calibrage.ts").ChoixDuPlafond} choix */
async function reglerPlafondDeCalibrage(projet, choix) {
  if (plafondsEnCours.has(projet)) return;
  plafondsEnCours.set(projet, choix === "defaut" ? "defaut" : "regler");
  plafondsDits.delete(projet);
  if (courant?.nom === projet) poserPlafondDeCalibrage(courant);
  /** @type {import("../plafond-de-calibrage.ts").RenduDuPlafond} */
  let rendu;
  try {
    rendu = (await brigade.reglerLePlafondDeCalibrage(projet, choix)) ?? { refus: "the ceiling was not changed: nothing was sent", detail: SANS_PONT };
  } catch (erreur) {
    rendu = { refus: "the ceiling was not changed: nothing was sent", detail: erreur instanceof Error ? erreur.message : String(erreur) };
  }
  plafondsEnCours.delete(projet);
  plafondsDits.set(projet, { dit: "fait" in rendu ? rendu.fait : rendu.refus, refus: !("fait" in rendu), detail: rendu.detail ?? "" });
  if ("fait" in rendu) {
    plafondsChoisis.delete(projet);
    brigade.relireBox(demandeFaits);
  }
  if (courant?.nom === projet) poserPlafondDeCalibrage(courant);
}

// Le bouton d'une station : le geste part par le process principal (cuisson.ts), et le bouton dit qu'il s'y met.
// Fait, la box est relue tout de suite : la ligne prend l'état neuf de la station sans attendre la lecture suivante.
/** @param {string} projet @param {string} station @param {import("../cuisson.ts").GesteDeCuisson} geste */
async function cuire(projet, station, geste) {
  const cle = cleDeCuisson(projet, station);
  if (cuissonsEnCours.has(cle)) return;
  const tenu = tenus.get(projet);
  const etat = (tenu !== undefined && "tableau" in tenu ? tenu.tableau.stations?.lignes.find((ligne) => ligne.station === station)?.etat : undefined) ?? "";
  cuissonsEnCours.set(cle, geste);
  cuissonsDites.delete(cle);
  if (courant?.nom === projet) poserCuisson(courant);
  /** @type {import("../cuisson.ts").RenduDeCuisson} */
  let rendu;
  try {
    rendu = (await brigade.cuireSurLaStation(projet, station, geste)) ?? { refus: `${station}: nothing was sent — nothing was changed`, detail: SANS_PONT };
  } catch (erreur) {
    rendu = { refus: `${station}: nothing was sent — nothing was changed`, detail: erreur instanceof Error ? erreur.message : String(erreur) };
  }
  cuissonsEnCours.delete(cle);
  cuissonsDites.set(cle, { dit: "fait" in rendu ? rendu.fait : rendu.refus, refus: !("fait" in rendu), detail: rendu.detail ?? "", etat });
  if ("fait" in rendu) brigade.relireBox(demandeFaits);
  if (courant?.nom === projet) poserCuisson(courant);
}

// L'onglet Cooks d'un écran étroit (ticket 1186), en lecture seule : les lignes des stations — leur état, leurs cooks —
// et, sur chacune, son seul bouton, qui la lance ou l'arrête. Ni la carte du projet, ni Taken et Pass — leurs fiches ont
// leurs gestes —, ni les serveurs de livraison, ni la lecture de `station` et son plafond. Sans lignes, une phrase dit
// pourquoi.
/** @param {Projet} projet @param {Dessinable | undefined} tenu */
function poserCuisineEtroite(projet, tenu) {
  if (projet.sansStation === true) return rail.replaceChildren(bloc("h3", STATION_ARRETEE));
  if (cuissonDuProjet.childElementCount > 0) return rail.replaceChildren(cuissonDuProjet);
  const pourquoi = muets.has(projet.nom)
    ? "its stations: not known while the station is unreachable"
    : tenu === undefined
      ? "its stations: first read in progress…"
      : "tableau" in tenu
        ? "its stations: this station's runtime does not give them yet — update it to see them here"
        : `its stations are not read: ${tenu.titre}`;
  rail.replaceChildren(bloc("h3", pourquoi));
}

// Le rail en six colonnes — Sur le rail, Au travail, Pass, TODO, WAITING, Livré —,
// tel que le process principal l'a rangé (faits.ts) : la vue pose, colonne par
// colonne, au centre de l'espace, partagé entre ses deux onglets (ticket 1184). Rail : ce qui t'attend
// — la file, ce qui est en amont —, puis toutes les colonnes, Taken et Pass compris, sans rien
// d'exécution sur leurs cartes. Cooks : la carte du projet et ses cooks en cours, les
// pages servies — leur worktree, leur port —, et la lecture de `station`. Un projet sans box n'en a
// pas : rien n'est lu de lui. Sans faits, il dit pourquoi il n'est pas dessiné : la carte du panneau
// dit ce qui a été obtenu.
/** @param {Projet} projet */
function poserRail(projet) {
  const tenu = tenus.get(projet.nom);
  rail.hidden = (!seLit(projet) && projet.sansStation !== true) || projet.desinstalle !== undefined;
  const cuisine = ongletDe(projet) === CUISINE;
  rail.dataset.onglet = cuisine ? CUISINE : RAIL;
  rail.ariaLabel = cuisine ? "The cooks" : "The rail";
  provenance.hidden = arreterCuisine.hidden = true;
  // Plus de rail, plus de fiche par-dessus.
  if (rail.hidden && ouverte !== undefined) fermerFiche();
  if (rail.hidden) return rail.replaceChildren();
  // Sur Cooks, la carte du projet en tête ; en bas, ses serveurs de livraison et la lecture de `station`, quoi qu'il y
  // ait entre eux.
  // Sur Cooks, ses stations sous la carte ; sur Rail, en tête, la ligne qui dit ce qui y demande un geste (ticket 1185).
  // Le bon posé pour chaque carte, celles des stations comprises (ticket 1270) : celui de la fiche ouverte y reprend
  // le clavier.
  /** @type {Map<import("../faits.ts").Carte, HTMLElement>} */
  const posees = new Map();
  poserCuisson(projet, posees);
  if (cuisine && etroit()) return poserCuisineEtroite(projet, tenu);
  /** @param {(HTMLElement | string)[]} poses */
  const poser = (...poses) => rail.replaceChildren(...(cuisine ? [carte, cuissonDuProjet, plafondDuProjet] : alerteDeCuisine.hidden ? [] : [alerteDeCuisine]), ...poses, ...(cuisine ? [pages, lectureDeLaCuisine] : []));
  // Cuisine d'un projet servi ici, station arrêtée : rien n'est lu, la page dit pourquoi en une ligne — sur l'un et
  // l'autre onglet.
  if (projet.sansStation === true) return rail.replaceChildren(bloc("h3", STATION_ARRETEE));
  const muet = muets.get(projet.nom);
  // Ce que dit le rail qui n'est pas lu : la carte du projet le dit déjà, sur Cooks.
  if (tenu === undefined && muet === undefined) return poser(...(cuisine ? [] : [bloc("h3", `the rail: first read of \`${geste(projet, "facts")}\` in progress…`)]));
  // La box ne répond pas : rien de ce que dit le rail n'est lu à neuf. Il garde sa dernière lecture,
  // marquée, et les tickets `fire` que GitHub dit encore passent au-dessus (feu.ts).
  const marque = muet === undefined || cuisine ? [] : poserMuet(projet);
  if (tenu === undefined || !("tableau" in tenu)) {
    const sans = tenu === undefined || cuisine ? "" : `the rail is not drawn: ${tenu.titre} — tried at ${heureDe(tenu.a)}. What the app got is in the panel, on the right`;
    return poser(...marque, ...(sans === "" ? [] : [bloc("h3", sans)]));
  }
  const { colonnes: lues, hors, attendLu, railLu } = tenu.tableau.rail;
  // La box ne répond pas : ce que ses colonnes contenaient n'est plus lu. Elles le disent, au lieu de montrer des « 0 ».
  const toutes = muet === undefined ? lues : lues.map((colonne) => ({ ...colonne, compte: "?", cartes: [], vide: "not known while the station is unreachable" }));
  // Le kanban est entier sur Rail, Taken et Pass compris ; Cooks n'en porte aucune colonne.
  const colonnes = cuisine ? [] : toutes;
  // Toutes les cartes lues, quel que soit l'onglet : la fiche ouverte et ce qui est en amont les suivent.
  const lesCartes = [...toutes.flatMap(({ cartes: siennes }) => siennes), ...hors];
  const heure = heureDe(tenu.a);
  /** @param {import("../faits.ts").Carte[]} cartes @param {string} [ton] */
  const bons = (cartes, ton) => {
    const liste = document.createElement("ol");
    liste.append(
      ...cartes.map((carte) => {
        const bon = poserBon(projet, carte, ton, cuisine);
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
      if (nom === COLONNE_QUI_T_ATTEND) colonne.dataset.attend = "";
      const forme = formeDe(ton);
      if (forme !== undefined) colonne.dataset.forme = forme;
      const tete = document.createElement("h4");
      tete.append(bloc("span", nom), bloc("span", compte));
      colonne.append(tete, cartes.length === 0 ? bloc("p", surMesure(projet, vide)) : bons(cartes, ton));
      return colonne;
    }),
  );
  // Rien d'autre n'est lu à neuf : ni ce qui est en amont, ni les corrections, ni les pages servies.
  if (muet !== undefined) return poser(...marque, grille);
  // D'où vient ce qui se lit n'est pas en tête du rail : cela ne change rien à ce que fait le chef.
  // C'est dans Paramètres, pour le jour d'une panne ; en tête, seule une lecture vieille se dit.
  poserProvenance(projet, heure, attendLu, railLu);
  poserArreter(projet, tenu.tableau.arretee);
  // Les serveurs sont sur Cooks : la page dont le ticket n'y a pas de carte — dans le bloc de sa station — se pose
  // à part, sous les stations, son worktree et son port compris. Sur Rail, sa carte n'en porte que l'écran et le geste.
  const cartes = new Set([...colonnes.flatMap(({ cartes: siennes }) => siennes), ...posees.keys()].map(({ ticket }) => ticket));
  const sansCarte = !cuisine
    ? []
    : [
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
  if (ouverte !== undefined) suivreFiche(lesCartes, posees);
  // Un formulaire « waiting for… » dont le ticket n'est plus dans TODO se referme : il n'a plus de carte où se poser.
  for (const cle of formulairesDAttente.keys()) {
    const [nom, numero] = cle.split("#");
    if (nom === projet.nom && !toutes.some(({ cartes: siennes }) => siennes.some(({ ticket, gestes }) => String(ticket) === numero && gestes?.includes("attente-poser")))) formulairesDAttente.delete(cle);
  }
  // Le champ où le chef tapait garde le clavier : le rail redessiné le lui rend.
  const tape = /** @type {HTMLInputElement | null | undefined} */ (document.activeElement);
  const reprise = tape?.dataset?.cle === undefined ? undefined : { cle: tape.dataset.cle, champ: tape.dataset.champ };
  poser(
    ...fraicheur(tenu.a),
    ...(cuisine
      ? []
      : [
          ...teteDuRail(projet),
          ...poserAmont(projet, tenu.tableau.rail, lesCartes),
          ...poserLesCorrections(projet, tenu.tableau.rail.corrections),
          ...poserLesProfils(projet, tenu.tableau.rail.profils),
        ]),
    grille,
    ...(cuisine || hors.length === 0 ? [] : [bloc("h3", `outside the columns — their state is none of the six, and nothing says they await you: the Rail read, in Settings, relays what \`${geste(projet, "rail")}\` says`), bons(hors)]),
    ...(sansCarte.length === 0 ? [] : [bloc("h3", `served, without a card here — \`${geste(projet, "status")}\` shows their server`), servis(sansCarte)]),
  );
  if (reprise !== undefined) [...rail.querySelectorAll("input")].find(({ dataset }) => dataset.cle === reprise.cle && dataset.champ === reprise.champ)?.focus();
}

// Les corrections proposées des consignes du projet, chacune une carte de la file, au-dessus des
// colonnes : ce qu'on attend du chef y est dit en tête, et ses deux réponses sont des boutons. Le
// « yes » ou le « no » part par le process principal (correction.ts) ; écrit, la carte quitte la
// file, et `facts` est relu tout de suite. Une réponse que les faits lus ne portent plus est oubliée.
/** @param {Projet} projet @param {import("../correction.ts").CarteDeCorrection[] | undefined} corrections */
function poserLesCorrections(projet, corrections) {
  const { etatDe, gestes } = gestesDeLaFile(projet, corrections, reponsesAuxCorrections, (proposition, reponse) => brigade.corriger(projet.nom, proposition, reponse));
  return poserCorrections(document, corrections, etatDe, gestes);
}

// Les profils de cook proposés (ticket 1053), chacun une carte de la file, sous les corrections : le même
// geste, par le même chemin (profil.ts) — le « yes » écrit la définition du profil dans le dépôt du projet.
/** @param {Projet} projet @param {import("../profil.ts").CarteDeProfil[] | undefined} profils */
function poserLesProfils(projet, profils) {
  const { etatDe, gestes } = gestesDeLaFile(projet, profils, reponsesAuxProfils, (proposition, reponse) => brigade.trancherLeProfil(projet.nom, proposition, reponse));
  return poserProfils(document, profils, etatDe, gestes);
}

// Ce qu'une carte de la file que le chef tranche d'un « yes » ou d'un « no » reçoit : l'état de son geste,
// tenu dans `reponses` par projet et proposition, et ce que ses boutons appellent — `trancher`, le geste
// sur la box. Une réponse que les faits lus ne portent plus est oubliée.
/**
 * @param {Projet} projet
 * @param {{ proposition: number }[] | undefined} cartes
 * @param {Map<string, import("./correction/carte.js").Etat>} reponses
 * @param {(proposition: number, reponse: import("../correction.ts").Reponse) => Promise<import("../correction.ts").Rendu | undefined>} trancher
 */
function gestesDeLaFile(projet, cartes, reponses, trancher) {
  const portees = new Set((cartes ?? []).map(({ proposition }) => `${projet.nom}#${proposition}`));
  for (const cle of reponses.keys()) if (cle.startsWith(`${projet.nom}#`) && !portees.has(cle)) reponses.delete(cle);
  /** @param {number} proposition @param {import("./correction/carte.js").Etat} etat */
  const poser = (proposition, etat) => {
    reponses.set(`${projet.nom}#${proposition}`, etat);
    if (courant?.nom === projet.nom) poserRail(projet);
  };
  return {
    etatDe: (/** @type {number} */ proposition) => reponses.get(`${projet.nom}#${proposition}`) ?? CORRECTION_AU_REPOS,
    gestes: {
      ouvrir: (/** @type {number} */ ticket) => void ouvrirIssue(projet, ticket),
      repondre: async (/** @type {number} */ proposition, /** @type {import("../correction.ts").Reponse} */ reponse) => {
        poser(proposition, { etape: "envoi", reponse });
        /** @type {import("../correction.ts").Rendu | undefined} */
        let rendu;
        try {
          rendu = await trancher(proposition, reponse);
        } catch (erreur) {
          rendu = { refus: "nothing was sent: the app could not ask the station", detail: erreur instanceof Error ? erreur.message : String(erreur) };
        }
        const suite = apresLaCorrection(reponse, rendu);
        poser(proposition, suite);
        if (suite.etape === "tranchee") brigade.relireBox(demandeFaits);
      },
    },
  };
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
// Elle se pose sur la carte de son ticket ; `ticket` : sans carte, elle le nomme elle-même. `execution` faux —
// sur l'onglet Rail (ticket 1184) — : ni worktree, ni port, ni état du serveur, seulement le geste et l'écran. Tout
// est déjà décidé dans le process principal (page.ts) : la vue pose.
/** @param {Projet} projet @param {import("../page.ts").Page} page @param {boolean} [ticket] @param {boolean} [execution] */
function poserServie(projet, { ticket: numero, worktree, port, etat, route, sansPage, ecran, raison, enCours, dit }, ticket = false, execution = true) {
  const page = document.createElement("div");
  page.className = "servie";
  const tete = document.createElement("div");
  // Le worktree et son port se recopient : eux seuls sont en monospace, la phrase reste la même.
  const servi = document.createElement("span");
  servi.append(exact("span", worktree), " · port ", exact("span", String(port)), ` · ${etat}`);
  tete.append(...(ticket ? [exact("strong", `#${numero}`)] : []), ...(execution ? [servi] : []));
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
// de son ticket ; `ticket` : sans carte, elle le nomme elle-même. `execution` faux — sur Rail — : sans son worktree.
/** @param {Projet} projet @param {import("../page.ts").ALancer} tenue @param {boolean} [ticket] @param {boolean} [execution] */
function poserALancer(projet, { ticket: numero, worktree, commentLeVoir, ecran }, ticket = false, execution = true) {
  const tenue = document.createElement("div");
  tenue.className = "servie";
  const tete = document.createElement("div");
  const tenu = document.createElement("span");
  tenu.append(exact("span", worktree), " · no page in a browser");
  tete.append(...(ticket ? [exact("strong", `#${numero}`)] : []), ...(execution ? [tenu] : []));
  const comment = document.createElement("p");
  comment.className = "comment";
  comment.append("how to see it: ", commentLeVoir);
  tenue.append(tete, ...poserEcran(ecran), comment);
  return tenue;
}

// Les pages servies du projet affiché, sur l'onglet Cooks : ce que `status` montre de ses serveurs — ou
// ce qui se lit à sa place. Le geste de chaque page n'est pas ici : il est sur la carte de son
// ticket. Tout est déjà décidé dans le process principal (page.ts) : la vue pose.
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
    ...(n === 0 ? [] : [ditEtAide("p", `${n} page${n > 1 ? "s" : ""} served (${servies.pages.map(({ ticket }) => `#${ticket}`).join(", ")})`, "each opens from its ticket's card")]),
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
function poserCout() {
  if (!coutsOuverts) return corpsDesCouts.replaceChildren();
  const projets = configuration.projets.filter((projet) => seLit(projet) && projet.desinstalle === undefined).map(projetDuCout);
  corpsDesCouts.replaceChildren(
    poserTete(document, projets, coutsLus, ouvrirDepuisLesCouts),
    poserPerdus(document, projets, coutsLus, titreSurLeRail, perdusOuverts, basculerPerdus, ouvrirTicketDepuisLesCouts),
    poserChers(document, projets, coutsLus, titreSurLeRail, ouvrirTicketDepuisLesCouts),
    poserCourbe(document, projets, coutsLus),
  );
}
// Un projet cliqué sur la page des coûts : son espace s'ouvre.
/** @param {string} nom */
function ouvrirDepuisLesCouts(nom) {
  const projet = projetDe(nom);
  if (projet !== undefined) void ouvrir(projet);
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
  return [...colonnes.flatMap(({ cartes }) => cartes), ...hors].find((carte) => carte.ticket === ticket);
}

// La carte du ticket d'un cook en cours, sur l'onglet Cooks (ticket 1270) : celle que le kanban de Rail pose — dans
// Taken plutôt que dans TODO, quand il est dans les deux. Un ticket que le rail lu ne porte pas a la carte de ce que
// le cook en dit : son numéro et son titre.
/** @param {string} nom @param {import("../faits.ts").Cook} cook */
function carteDuCook(nom, { ticket, titre }) {
  const tenu = tenus.get(nom);
  const lues = tenu === undefined || !("tableau" in tenu) ? [] : [...tenu.tableau.rail.colonnes.flatMap(({ cartes }) => cartes), ...tenu.tableau.rail.hors].filter((carte) => carte.ticket === ticket);
  const sans = { sans: "not communicated — this ticket is not on the rail the station returned" };
  return lues.find(({ attendu }) => !attendu) ?? lues[0] ?? { ticket, titre, ouvrable: false, attendu: false, attend: [], dit: [], fiche: { titre: sans, priorite: sans, issue: sans } };
}
/** @param {string} nom @param {number} ticket */
const titreSurLeRail = (nom, ticket) => carteSurLeRail(nom, ticket)?.titre;

// Un clic sur un ticket d'une cause d'échec, ou sur un des tickets perdus ou les plus chers du projet,
// dans Reliability — ou sur la page des coûts de l'app, une fois son projet ouvert — ouvre sa fiche,
// par-dessus l'onglet. Un ticket que le rail ne porte pas (ou pas encore lu) s'ouvre avec ce que l'on
// en sait : son numéro.
/** @param {string} nom @param {number} ticket @param {HTMLElement} retour */
function ouvrirFicheDeCout(nom, ticket, retour) {
  const projet = configuration.projets.find((candidat) => candidat.nom === nom);
  if (projet === undefined) return;
  const sans = { sans: "not communicated — the rail of this project is not read" };
  const carte = carteSurLeRail(nom, ticket) ?? { ticket, ouvrable: false, attendu: false, attend: [], dit: [], fiche: { titre: sans, priorite: sans, issue: sans } };
  ouvrirFiche(projet, carte, retour);
}

// La fiabilité des cooks du projet affiché, en tête de l'onglet Reliability (fiabilite.js) : trois chiffres
// face à leurs seuils, puis les causes d'échec qui reviennent le plus. Un ticket d'une cause ouvre sa fiche.
// Dessous, chaque cause qu'une correction acceptée des consignes visait, avant et après son merge (ticket 1001),
// puis ce que les cooks ont appris au projet : ses leçons et ses profils (ticket 1058).
// À côté, ce que ce projet a coûté, et lui seul (ticket 1022) : ses tokens perdus et ses tickets les plus chers,
// lus dans le `station` de sa propre box — celui que cette lecture lance — et jugés face à ses propres
// seuils (cost/seuils.js). Un ticket ouvre sa fiche.
let perdusDuProjetOuverts = false;
function basculerPerdusDuProjet() {
  perdusDuProjetOuverts = !perdusDuProjetOuverts;
  poserLaFiabilite();
}
function poserLaFiabilite() {
  const projet = courant;
  fiabilite.hidden = projet === undefined || !seLit(projet) || actif() !== FIABILITE;
  if (projet === undefined || fiabilite.hidden) return fiabilite.replaceChildren();
  const vu = fiabiliteVue?.projet === projet.nom ? fiabiliteVue : undefined;
  const seul = [projetDuCout(projet)];
  /** @type {Map<string, Lecture>} */
  const lue = new Map(lectureDeLaFiabilite?.projet === projet.nom ? [[projet.nom, lectureDeLaFiabilite]] : []);
  const coute = document.createElement("div");
  coute.className = "cout-du-projet";
  coute.append(
    bloc("h2", "cost of this project"),
    poserPerdus(document, seul, lue, titreSurLeRail, perdusDuProjetOuverts, basculerPerdusDuProjet, ouvrirFicheDeCout),
    poserChers(document, seul, lue, titreSurLeRail, ouvrirFicheDeCout),
  );
  /** @param {number} ticket @param {HTMLElement} retour */
  const ouvrir = (ticket, retour) => ouvrirFicheDeCout(projet.nom, ticket, retour);
  // Les corrections acceptées de ses consignes, et ce qu'elles ont fait de leur cause (recul.js) : lues
  // dans `facts`, pas dans cette lecture — une box pas jointe garde la dernière.
  const tenu = tenus.get(projet.nom);
  const reculs = tenu !== undefined && "tableau" in tenu ? tenu.tableau.reculs : undefined;
  // Ses leçons et ses profils (apprentissage.js), lus dans `facts` de même : une leçon promue ouvre sa ligne
  // du carnet par le process principal, qui en tient l'adresse — rien n'est créé.
  const appris = tenu !== undefined && "tableau" in tenu ? tenu.tableau.apprentissage : undefined;
  const ouvrirLaLigne = (/** @type {string} */ id) => void brigade.ouvrirLecon(projet.nom, id);
  fiabilite.replaceChildren(...poserFiabilite(document, vu, ouvrir), ...poserReculs(document, reculs, ouvrir), ...poserApprentissage(document, appris, { ouvrir, ouvrirLaLigne }), coute);
}

// La partie « closer » du projet affiché, sous Settings → Closer (closer/section.js) : les quatre chiffres
// de sa dernière observation, ce qu'elle a repéré derrière un bouton — ou, sans closer réglé, le geste
// qui en règle un, écrit dans le second comme un bouton d'action. Les places du lancement et du bilan y
// sont posées ; celle du bilan se remplit quand la dernière passe a fini (closer/bilan/bilan.js).
function poserLeCloser() {
  const projet = courant;
  closer.hidden = projet === undefined || !seLit(projet) || actif() !== CLOSER;
  if (projet === undefined || closer.hidden) return closer.replaceChildren();
  const lu = closerLu?.projet === projet.nom ? closerLu.lu : undefined;
  const basculer = () => {
    if (!trouvaillesDepliees.delete(projet.nom)) trouvaillesDepliees.add(projet.nom);
    poserLeCloser();
  };
  closer.replaceChildren(
    ...poserCloser(document, lu, {
      ouvert: trouvaillesDepliees.has(projet.nom),
      basculer,
      valeurs: CALIBRAGE_DU_PROJET,
      regler: (modele, effort) => void inscrire(REGLER_LE_CLOSER, [modele, effort]),
      choix: reglagesDuCloser.get(projet.nom),
      choisir: (choix) => void reglagesDuCloser.set(projet.nom, choix),
      lancement: poserLeLancement(projet.nom, lu),
      bilan: lu === undefined || "erreur" in lu || !lu.fermeture.configured ? [] : poserBilan(document, lu.fermeture.request, (url) => void brigade.ouvrirBilan(projet.nom, url)),
    }),
  );
}

// La place du lancement, dans la partie closer (closer/lancement/lancement.js) : le bouton, la
// confirmation, puis où en est la demande. Chaque geste part sur la box par le process principal
// (closer-lancement.ts) ; le lancement, seulement au « oui » du chef. Revenu, il fait relire l'onglet :
// la lecture suivante est la première à le montrer, et c'est elle qui ramène la place au repos.
/** @param {string} nom @param {import("./closer/section.js").Lu | undefined} lu */
function poserLeLancement(nom, lu) {
  const lue = lu === undefined || "erreur" in lu ? undefined : lireLancement(lu.fermeture);
  if (lue === undefined) return [];
  const poser = (/** @type {import("./closer/lancement/lancement.js").Etat} */ etat) => {
    lancementsDuCloser.set(nom, etat);
    poserLeCloser();
  };
  /** @param {"apercu" | "lancer" | "annuler"} geste */
  const agir = async (geste) => {
    if (geste !== "apercu") poser({ etape: "envoi", geste });
    else poser({ etape: "apercu" });
    /** @type {import("../closer-lancement.ts").Rendu | undefined} */
    let rendu;
    try {
      rendu = await (geste === "lancer" ? brigade.closer(nom, geste, true) : brigade.closer(nom, geste));
    } catch (erreur) {
      rendu = { refus: "nothing was sent: the app could not ask the station", detail: erreur instanceof Error ? erreur.message : String(erreur) };
    }
    const suite = apresRendu(geste, rendu);
    poser(suite);
    if (suite.etape === "relecture" && courant?.nom === nom && ongletDemande === CLOSER) brigade.onglet(nom, CLOSER, ++demandeOnglet);
  };
  const etat = lancementsDuCloser.get(nom) ?? REPOS;
  // La proposition de la dérive franchie ne fait que mener au bouton de lancement : même geste, même confirmation.
  const proposition = poserDerive(document, lireDerive(lu !== undefined && "fermeture" in lu ? lu.fermeture : undefined), lue.demande, etat, () => void agir("apercu"));
  return [
    ...proposition,
    ...poserLancement(document, lue, etat, {
      lancer: () => void agir("apercu"),
      confirmer: () => void agir("lancer"),
      renoncer: () => poser(REPOS),
      annuler: () => void agir("annuler"),
    }),
  ];
}

function poserManager() {
  const projet = courant;
  // Sans box, rien n'est lu et rien ne s'écrit : l'onglet le dit déjà.
  manager.hidden = projet === undefined || !seLit(projet) || actif() !== "manager";
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
  grants.hidden = projet === undefined || !seLit(projet) || actif() !== "grants";
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
// installation — il ne fait que lire, et son verdict se lit dans Paramètres. Un projet qui ne se
// lit nulle part — ni box, ni cuisine sur cet ordinateur — n'a pas de commande à envoyer.
function poserProjet() {
  const projet = courant;
  const geste = GESTES_DE_LA_CUISINE.find(({ id }) => id === "installation");
  gestesProjet.hidden = projet === undefined || !seLit(projet) || geste === undefined;
  if (projet === undefined || gestesProjet.hidden || geste === undefined) return gestesProjet.replaceChildren();
  const verifier = bouton(geste.libelle, () => void brigade.verifier(projet.nom));
  verifier.dataset.geste = "direct";
  verifier.title = "runs the verification on the station — its verdict is read in Settings, in one sentence";
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
  const cache = projet === undefined || !seLit(projet) || projet.desinstalle !== undefined;
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
    code.hidden = false;
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
  // L'app installée n'a pas de clone (emplacements.ts) : sans rien à dire, le bloc ne laisse pas de cadre vide.
  code.hidden = code.childElementCount === 0;
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
  poserApp();
  const sante = accueilVu?.sante ?? { ton: "gris", dit: "Max ?  ·  GitHub ?", survol: "first readings in progress" };
  santeDeLAccueil.dataset.ok = String(sante.ton === "vert");
  santeDeLAccueil.title = sante.survol;
  santeDeLAccueil.replaceChildren(pastille(sante.dit, sante.ton), bloc("span", sante.dit));
}

// La version qui tourne, et le message d'une mise à jour disponible. Rien ne s'y dit d'une mise à jour
// à jour, ni d'une erreur — la raison de celle-ci est au survol de la version. « Later » ne retient
// rien : la version téléchargée s'installe d'elle-même au lancement suivant.
function poserApp() {
  const etat = miseAJourVue;
  titreDeLApp.hidden = etat === undefined;
  if (etat === undefined) return appDeLAccueil.replaceChildren();
  const version = bloc("p", `Brigade ${etat.version}`);
  version.className = "version mono";
  if (etat.etat === "erreur") version.title = etat.raison;
  const lignes = [version];
  const annoncee = etat.etat === "disponible" || etat.etat === "telechargement" || etat.etat === "prete" || etat.etat === "installation";
  if (annoncee && etat.nouvelle !== miseAJourReportee) {
    const phrase =
      etat.etat === "installation" || miseAJourInstalle
        ? `installing ${etat.nouvelle} — the app relaunches itself…`
        : etat.etat === "telechargement"
          ? `version ${etat.nouvelle} is available — downloading it, ${etat.taille > 0 ? Math.floor((100 * etat.recus) / etat.taille) : 0} %`
          : `version ${etat.nouvelle} is available`;
    const message = document.createElement("div");
    message.className = "mise-a-jour";
    message.append(pastille("an update is available", "jaune"), bloc("span", phrase));
    if (etat.etat !== "installation" && !miseAJourInstalle) {
      const nouvelle = etat.nouvelle;
      message.append(
        boutonAction(
          document,
          "Install now",
          () => {
            miseAJourInstalle = true;
            miseAJourRefusee = "";
            poserApp();
            void brigade.installerMiseAJour().then((rendu) => {
              if (rendu === undefined) return;
              miseAJourInstalle = false;
              miseAJourRefusee = rendu.refus;
              poserApp();
            });
          },
          { recommande: true, prix: "closes the app's terminals, then relaunches it on the new version" },
        ),
        boutonAction(document, "Later", () => {
          miseAJourReportee = nouvelle;
          miseAJourRefusee = "";
          poserApp();
        }, { prix: "installed at next launch" }),
      );
    }
    lignes.push(message);
    if (miseAJourRefusee !== "") lignes.push(bloc("p", miseAJourRefusee));
  }
  appDeLAccueil.replaceChildren(...lignes);
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
    enTeteDeStation.replaceChildren(titre, pastille(phrase, ligne?.ton), ...(dejaDit ? [] : [etatDit]), ...(details === "" ? [] : [survol(document, details)]), ...(ligne?.note === undefined ? [] : [bloc("p", ligne.note)]));
    poserPlafond(station.nom, ligne);
    versionDeStation.replaceChildren(...(station.versionDit ? [bloc("span", station.versionDit)] : []));
    pannesDeStation.replaceChildren(...station.pannes.map((panne) => poserPanne(station.id, panne)));
    poserRetireLaStation(station);
  }
  poserProjets();
}

// Le plafond de cooks de la station, comme sa box le dit — `3 at most — 8 cores`, ou `5 at most — set by you,
// replaces 3 (8 cores)` — ; quand elle retient des tickets, ce qui la retient, avec ce que chaque ressource a et ce
// qu'il lui faut ; et le réglage : un nombre, ou « default » pour que le plafond des cœurs revienne. Le plafond
// neuf se lit au rendu suivant, quand la box a répondu. Une station dont aucun projet lu ne dit le plafond n'a rien de tout cela.
/** @param {string} nom @param {import("../accueil.ts").LigneDeStation | undefined} ligne */
function poserPlafond(nom, ligne) {
  if (ligne?.plafond === undefined) return plafondDeStation.replaceChildren();
  if (plafondSaisiPour !== nom) {
    plafondSaisiPour = nom;
    plafondChoisi.value = "";
  }
  const { plafond, retenue } = ligne;
  const lignes = [];
  const dit = bloc("p", `Cooks at once: ${plafond.dit}`);
  dit.className = "plafond";
  lignes.push(dit);
  if (retenue !== undefined) {
    const retient = bloc("p", `Holding tickets — ${retenue.ressources}: ${retenue.detail}`);
    retient.className = "retenue";
    retient.append(survol(document, `no ticket is taken for ${retenue.depuis}, as long as it lasts; the running cooks carry on`));
    lignes.push(retient);
  }
  const regle = document.createElement("p");
  regle.className = "regle-le-plafond";
  const regler = /** @type {HTMLButtonElement[]} */ ([]);
  /** @param {string} libelle @param {() => string} valeur @param {boolean} recommande @param {string} prix */
  const geste = (libelle, valeur, recommande, prix) => {
    const groupe = boutonAction(document, libelle, () => void reglerLePlafond(nom, valeur(), regler), { recommande, prix });
    regler.push(groupe.querySelector("button"));
    return groupe;
  };
  regle.append(
    plafondChoisi,
    geste("set the cap", () => plafondChoisi.value.trim(), true, "no running cook is stopped; the station launches no more while it is above — 0 lifts the limit"),
    ...(plafond.parLeChef ? [geste("back to the default", () => "auto", false, "withdraws your cap: the one derived from the machine's cores returns")] : []),
  );
  lignes.push(regle);
  const refus = plafondsRefuses.get(nom);
  if (refus !== undefined) lignes.push(lectureIndisponible(document, refus.refus, refus.detail ?? ""));
  plafondDeStation.replaceChildren(...lignes);
}

/** @param {string} nom @param {string} valeur @param {HTMLButtonElement[]} boutons */
async function reglerLePlafond(nom, valeur, boutons) {
  for (const bouton of boutons) bouton.disabled = true;
  /** @type {{ fait: string } | { refus: string, detail?: string }} */
  let rendu;
  try {
    rendu = await brigade.reglerLePlafond(nom, valeur);
  } catch (erreur) {
    rendu = { refus: "the cap was not changed", detail: erreur instanceof Error ? erreur.message : String(erreur) };
  }
  if ("refus" in rendu) plafondsRefuses.set(nom, rendu);
  else {
    plafondsRefuses.delete(nom);
    plafondChoisi.value = "";
  }
  poserPageDeStation();
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
  poserLesStations(parcours, choixDesStations, avertissementDeLaPrincipale, { exclues: [], principale: true, groupe: "principale", relancer: poserChoixDesStations });
}

// Une case par station appairée — sauf celles qui portent déjà le projet —, et, quand il n'a pas
// encore la sienne, le choix de sa principale. Sans principale, celle que l'app recommande est
// proposée d'office, tant que le chef n'a rien touché.
/**
 * @param {{ choisies: Set<string>, principale: string, touchee: boolean }} vise
 * @param {HTMLElement} ou @param {HTMLElement} averti
 * @param {{ exclues: readonly string[], principale: boolean, groupe: string, relancer: () => void }} options
 */
function poserLesStations(vise, ou, averti, { exclues, principale: avecPrincipale, groupe, relancer }) {
  const appairees = (stationsVues?.stations ?? []).filter(({ id, cuisine }) => cuisine !== false && !exclues.includes(id));
  const recommandee = projetsVus?.recommandee;
  if (avecPrincipale && !vise.touchee && vise.principale === "" && recommandee && appairees.some(({ id }) => id === recommandee)) {
    vise.principale = recommandee;
    vise.choisies.add(recommandee);
  }
  ou.replaceChildren(
    ...(appairees.length === 0
      ? [bloc("p", exclues.length === 0 ? "no station to serve it: pair one first, with “+ station” on the home" : "no other paired station: pair one first, with “+ station” on the home")]
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
            relancer();
          });
          ligne.append(choisie, bloc("span", ` ${station.nom}${station.machine === "" ? "" : ` — ${station.machine}`}`));
          if (!avecPrincipale) return ligne;
          const principale = document.createElement("input");
          principale.type = "radio";
          principale.name = groupe;
          principale.ariaLabel = `${station.nom} is its main station`;
          principale.checked = vise.principale === station.id;
          principale.addEventListener("change", () => {
            vise.touchee = true;
            vise.principale = station.id;
            vise.choisies.add(station.id);
            relancer();
          });
          ligne.append(bloc("span", " · "), principale, bloc("span", station.id === recommandee ? " main (recommended: always on)" : " main"));
          return ligne;
        })),
  );
  averti.textContent = avecPrincipale ? (projetsVus?.avertissements[vise.principale] ?? "") : "";
  averti.dataset.etat = averti.textContent === "" ? "" : "hors-ligne";
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

// Ce qu'une station dit du projet qu'on lui a confié, en quelques mots, et le ton de sa pastille.
/** @param {import("../projets/projets.ts").StationDuProjet["etat"]} etat */
function etatDeLaCuisine(etat) {
  if (etat === "servi") return { dit: "served", ton: "vert" };
  if (etat === "a-autoriser") return { dit: "waiting for your authorization on GitHub", ton: "jaune" };
  if (etat === "en-preparation") return { dit: "being prepared", ton: "gris" };
  if (etat === "refuse") return { dit: "refused", ton: "rouge" };
  if (etat === "secondaire") return { dit: "secondary", ton: "gris" };
  return { dit: "not read yet", ton: "gris" };
}

// Les stations qui font la cuisine d'un projet de l'app : celles qui le servent — qu'il leur ait été
// confié d'ici ou non, elles le publient (stations/document.ts) —, puis celles à qui l'app l'a demandé
// et qui ne le servent pas encore. `demande` : l'app en a déjà demandé la cuisine — une station de plus
// en reprend le plafond et le calibrage ; `principale` : il a déjà la sienne.
/** @param {Projet} projet */
function cuisineDe(projet) {
  // La box du projet ne répond pas : celles qui le servent sont dites injoignables, pas servies.
  const muette = muets.has(projet.nom);
  const demande = projetsVus?.projets.find(({ nom }) => nom === projet.nom);
  const servies = (stationsVues?.stations ?? []).filter(({ projets }) => projets.includes(projet.nom));
  const stations = [
    ...servies.map(({ id, nom }) => ({ id, nom, principale: true, ...(muette ? { dit: "unreachable", ton: "rouge" } : etatDeLaCuisine("servi")), survol: muette ? `${nom} does not answer: the app knows nothing of the kitchen right now` : `${nom} serves it: it runs its manager and its pass`, autoriser: /** @type {string[]} */ ([]) })),
    ...(demande?.stations ?? [])
      .filter(({ id }) => !servies.some((servie) => servie.id === id))
      .map((station) => ({ id: station.id, nom: station.nom, principale: station.principale, ...etatDeLaCuisine(station.etat), survol: station.dit, autoriser: station.autoriser })),
  ];
  return { stations, demande: demande !== undefined, principale: stations.some(({ principale }) => principale) };
}

// Où cuit un projet de l'app : la station que ses stations disent le servir (projets.ts, `cuitSur`) —
// pas celle que la demande nomme : un déménagement refusé le laisse cuire là où il cuisait —, à
// défaut sa principale ; ou la station de cet ordinateur, qui le sert sans l'app (ticket 1122). `ici` : c'est
// cet ordinateur. Aucune : on ne sait pas encore où il cuit.
/** @param {Projet} projet @param {ReturnType<typeof cuisineDe>["stations"]} stations @returns {{ id: string | null, nom: string, ici: boolean } | undefined} */
function ouCuit(projet, stations) {
  const locale = projetsVus?.locale ?? null;
  const dit = projetsVus?.projets.find(({ nom }) => nom === projet.nom)?.cuitSur;
  if (dit !== undefined && dit !== null) return { ...dit, ici: dit.ici || (dit.id !== null && dit.id === locale) };
  const principale = stations.find((station) => station.principale);
  if (principale !== undefined) return { id: principale.id, nom: principale.nom, ici: principale.id === locale || projet.ici === true };
  if (projet.ici === true) return { id: null, nom: "", ici: true };
  return undefined;
}

// Le nom d'une station tel que la page d'un projet le dit : « this Mac » (« this PC » sous Windows) pour celle de cet ordinateur.
/** @param {string} nom */
function nomDit(nom) {
  const locale = projetsVus?.locale ?? null;
  const sienne = (stationsVues?.stations ?? []).find(({ id }) => id === locale);
  return sienne !== undefined && sienne.nom === nom ? POSTE.nom : nom;
}

// Une station du projet, sur sa ligne : sa pastille et son nom — « this Mac » pour cet ordinateur —,
// ce qu'elle en dit au survol ; un clic ouvre sa page. `renfort` : nommée après celle où il cuit.
/** @param {ReturnType<typeof cuisineDe>["stations"][number]} station @param {boolean} ici @param {string} [rang] */
function stationNommee(station, ici, rang = "") {
  const nomme = document.createElement("button");
  nomme.type = "button";
  nomme.className = "station-du-projet";
  nomme.title = [ici && station.nom !== "" ? `${station.nom}, this computer's station` : "", station.dit, station.survol].filter((ligne) => ligne !== "").join("\n");
  const appele = bloc("strong", ici ? POSTE.nom : station.nom);
  appele.className = ici ? "" : "mono";
  nomme.ariaLabel = `${ici ? POSTE.nom : station.nom} — ${station.principale ? "main" : "secondary"} — ${station.dit}`;
  nomme.append(pastille(station.dit, station.ton), appele, ...(rang !== "" && !station.principale ? [bloc("span", ` (${rang})`)] : []));
  if (station.id !== "") nomme.addEventListener("click", () => ouvrirStation(station.id));
  else nomme.disabled = true;
  const autoriser = station.autoriser.map((url) => {
    const cree = bloc("button", `authorize on GitHub: ${url.replace(/^https:\/\/github\.com\/apps\/([^/]+).*$/, "$1")}`);
    cree.addEventListener("click", () => void brigade.autoriserSurGitHub(url));
    return cree;
  });
  const pose = document.createElement("span");
  pose.className = "station-et-gestes";
  pose.append(nomme, ...autoriser);
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
  const confie = projetsVus?.projets.some(({ nom, stations }) => nom === projet.nom && stations.some(({ principale }) => principale)) ?? false;
  const fige = enCours !== null && (enCours.etape === "acceptee" || enCours.etape === "remise");
  const repris = enCours !== null && !fige;
  const appairees = (stationsVues?.stations ?? []).filter(({ etat, cuisine }) => etat !== "illisible" && cuisine !== false);
  const destinations = appairees.filter(({ id }) => id !== ou?.id || repris);
  const offert = lues && confie && ou !== undefined && ou.id !== null && !fige && destinations.length > 0;
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
  const depuis = ou.ici ? POSTE.nom : ou.nom;
  const recommandee = projetsVus?.recommandee ?? null;
  const vise = demenagement;
  // Chaque machine est un bouton ; celle que l'app recommande — toujours allumée — se distingue. Ce que
  // la choisir implique est au survol.
  const machines = destinations.map((station) => {
    const garder = station.id === ou.id;
    const nomme = station.id === projetsVus?.locale ? POSTE.nom : station.nom;
    const bouton = /** @type {HTMLButtonElement} */ (bloc("button", garder ? `keep it on ${nomme}` : nomme));
    bouton.type = "button";
    bouton.className = !garder && station.id === recommandee ? "recommande" : "";
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
  const annuler = /** @type {HTMLButtonElement} */ (bloc("button", "cancel"));
  annuler.type = "button";
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
// Le bouton du refus de la station (ticket 1205) : la principale du projet joue le remède que le refus publie. Ce
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
  const station = vu?.stations.find(({ principale }) => principale)?.nom ?? "its station";
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
  demenagementDitPour = { projet: projet.nom, dit: `asking your stations to move ${projet.nom}'s kitchen…`, refus: false, detail: "" };
  poserStationsDuProjet();
  try {
    const rendu = await brigade.demenagerLaCuisine(projet.nom, vers);
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
  if (projet === undefined) return;
  if (confiance !== undefined && confiance.projet !== projet.nom) fermerConfiance();
  const { stations, demande, principale } = cuisineDe(projet);
  const lues = stationsVues !== undefined && projetsVus !== undefined;
  const ou = ouCuit(projet, stations);
  const enCours = projetsVus?.projets.find(({ nom }) => nom === projet.nom)?.demenagement ?? null;
  sensDesStations.hidden = false;
  if (stations.length > 0 || ou !== undefined) {
    // Où il cuit, d'abord — « this Mac » pour la station de cet ordinateur —, puis ses renforts.
    const sienne = stations.find(({ id }) => id === ou?.id);
    const autres = stations.filter((station) => station !== sienne && !(enCours !== null && enCours.etape !== "refusee" && station.nom === enCours.vers));
    const tete = ou === undefined ? [] : [stationNommee(sienne ?? { id: ou.id ?? "", nom: ou.nom, principale: true, dit: "served", ton: "vert", survol: "", autoriser: [] }, ou.ici)];
    ligneDesStationsDuProjet.replaceChildren(
      bloc("span", ou === undefined ? "Cooked by " : "Cooks on "),
      ...tete,
      ...(ou?.ici === true ? [sArrete()] : []),
      ...(enCours !== null && enCours.etape !== "refusee" ? [enMouvement(enCours)] : []),
      ...autres.flatMap((station, rang) => [...(rang === 0 && tete.length === 0 ? [] : [bloc("span", " · ")]), stationNommee(station, false, ou === undefined ? "" : `${["second", "third", "fourth", "fifth"][rang] ?? "another"} station`)]),
    );
  } else if (projet.box !== undefined) {
    // Écrit à la main avec « hote » : l'app le lit là, sans qu'aucune station appairée ne le publie.
    const appele = bloc("strong", projet.box.hote);
    appele.className = "mono";
    appele.title = `named by “hote” in ${configuration.chemin}: the app reads it there, and no paired station publishes it`;
    ligneDesStationsDuProjet.replaceChildren(bloc("span", "Cooks on "), appele);
  } else {
    sensDesStations.hidden = stations.length === 0;
    ligneDesStationsDuProjet.textContent = lues ? `No station cooks ${projet.nom} yet.` : "reading your stations on GitHub…";
  }
  poserLeDemenagement(projet, ou, enCours, lues);
  ouvrirLaConfiance.textContent = stations.length === 0 && !seLit(projet) && projet.sansStation !== true ? "choose its machine" : "+ station";
  ouvrirLaConfiance.hidden = confiance !== undefined || demenagement !== undefined || !lues;
  const vu = projetsVus?.projets.find(({ nom }) => nom === projet.nom);
  const onboarding = vu?.onboarding ?? null;
  const remede = remedesDesRefus.get(projet.nom);
  const refus = remede?.etape === "leve" ? null : (vu?.refus ?? null);
  const retenu = poserDepotRetenu(document, { acces: vu?.acces ?? null, refus, worktree: vu?.worktree ?? null, maintenant: Date.now(), copier: (commande) => void navigator.clipboard.writeText(commande), remede: {
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
  // Les stations sont de l'onglet Cooks (ticket 1184). Sur Rail, elles restent en vue tant qu'elles sont ce qui
  // t'attend : le projet ne cuit nulle part, son parcours est à suivre, un choix de machine est ouvert, ou
  // sa cuisine est retenue — un worktree qui ne se prépare pas (ticket 1119). L'accès au dépôt refusé et le refus de
  // la station, eux, sont dits sur Rail par la ligne d'alerte, qui ouvre Cooks : une seule ligne (ticket 1185).
  const ditParLAlerte = (vu?.acces ?? vu?.worktree?.acces ?? vu?.refus ?? null) !== null;
  // Sur un écran étroit, elles ne sont ni sur Cooks — ce sont des réglages : en ajouter, déménager, le bac à sable —, ni
  // sur la conversation (ticket 1186). Sur Rail, comme sur un écran large.
  const rangees = etroit() && ongletDe(projet) !== RAIL;
  stationsDuProjet.hidden =
    rangees ||
    (ongletDe(projet) !== CUISINE && seLit(projet) && parcoursDuProjet.hidden && (depotRetenu.hidden || ditParLAlerte) && confiance === undefined && demenagement?.projet !== projet.nom);
  if (confiance === undefined) return;
  poserLaConfiance(confiance, projet, { exclues: stations.map(({ id }) => id), demande, principale });
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
// coché ou changé reste, ce qu'il n'a pas touché suit ce qui est proposé. Un projet qui a déjà sa
// principale ne prend que des renforts ; une station de plus reprend ce que l'app a déjà demandé, ni
// cooks ni calibrage à redire.
/**
 * @param {NonNullable<typeof confiance>} vise @param {Projet} projet
 * @param {{ exclues: readonly string[], demande: boolean, principale: boolean }} deja
 */
function poserLaConfiance(vise, projet, { exclues, demande, principale: aSaPrincipale }) {
  const appairees = (stationsVues?.stations ?? []).filter(({ id, cuisine }) => cuisine !== false && !exclues.includes(id));
  const machines = projetsVus?.machines ?? {};
  const recommandee = projetsVus?.recommandee ?? undefined;
  const avecPrincipale = !aSaPrincipale;
  // Celle que l'app recommande — toujours allumée — est proposée d'office, et suit la recommandation
  // relue tant que le chef n'a rien touché ; sans serveur, la première machine lisible.
  if (avecPrincipale && !vise.touchee) {
    vise.principale = (appairees.find(({ id }) => id === recommandee) ?? appairees.find(({ etat }) => etat !== "illisible"))?.id ?? "";
  }
  if (!avecPrincipale) vise.principale = "";
  vise.renforts.delete(vise.principale);
  const nomDe = (/** @type {string} */ id) => appairees.find((station) => station.id === id)?.nom ?? "";

  titreDeConfiance.textContent = avecPrincipale ? `Choose the machine that runs ${projet.nom}'s kitchen.` : `Add a station to ${projet.nom}'s kitchen.`;
  sensDeConfiance.textContent = avecPrincipale
    ? "Its main machine runs the manager, which judges and splits the tickets, and the pass, which reviews and merges what is delivered — and it cooks. Everything below is set to what is recommended: change what you like, or start as it is."
    : "The first station keeps the manager and the pass; all the stations cook.";
  // Un projet ajouté depuis l'app connaît son dépôt et sa branche ; un projet écrit à la main les choisit ici.
  const connu = projet.depot !== undefined && projet.base !== undefined;
  // Une station de plus reprend le dépôt, la branche et le plafond de la première : un champ ne se montre
  // que si l'app ne peut pas les savoir — la première station ne les dit pas —, et seul un champ visible se demande.
  champDuDepot.hidden = avecPrincipale ? connu : !vise.manque.has("depot");
  champDeLaBase.hidden = avecPrincipale ? connu : !vise.manque.has("base");

  principaleDeConfiance.hidden = !avecPrincipale;
  choixDeLaPrincipale.replaceChildren(
    ...(appairees.length === 0
      ? [bloc("p", "no station to cook it: pair one first, with “+ station” on the home")]
      : appairees.map((station) =>
          uneMachine(station, "radio", vise.principale === station.id, station.id === recommandee, () => {
            vise.touchee = true;
            vise.principale = station.id;
            poserStationsDuProjet();
          }),
        )),
  );

  const renforcables = appairees.filter(({ id }) => id !== vise.principale);
  legendeDesRenforts.textContent = avecPrincipale ? "Other stations · optional" : "Stations";
  sensDesRenforts.textContent = avecPrincipale ? "All the stations cook the tickets; only the main machine runs the manager and the pass." : "";
  sensDesRenforts.hidden = !avecPrincipale;
  choixDesRenforts.replaceChildren(
    ...(renforcables.length === 0
      ? [bloc("p", "no other paired machine: pair one from the home, with “+ station”")]
      : renforcables.map((station) =>
          uneMachine(station, "checkbox", vise.renforts.has(station.id), false, (coche) => {
            if (coche) vise.renforts.add(station.id);
            else vise.renforts.delete(station.id);
            poserStationsDuProjet();
          }),
        )),
  );
  renfortsDeConfiance.hidden = avecPrincipale && appairees.length === 0;

  // Les cooks à la fois et le calibrage : seulement pour la première station du projet.
  const decide = avecPrincipale && !demande;
  reglagesAvances.hidden = !decide;
  champDesCooks.hidden = avecPrincipale ? !decide : !vise.manque.has("cooks");
  const proposee = machines[avecPrincipale ? vise.principale : (cuisineDe(projet).stations[0]?.id ?? "")];
  if (!vise.cooksTouches) cooksDeConfiance.value = proposee === undefined ? "" : String(proposee.cooks);
  cooksDits.textContent = vise.cooksTouches || proposee === undefined ? "" : `recommended — ${proposee.cooksDit}`;
  const calibrage = projetsVus?.calibrage;
  if (!vise.calibrageTouche && calibrage !== undefined) {
    for (const role of /** @type {const} */ (["manager", "reviewer"])) {
      calibrageDeConfiance[`${role}-modele`].value = calibrage[role].modele;
      calibrageDeConfiance[`${role}-effort`].value = calibrage[role].effort;
    }
  }
  calibrageDit.textContent = vise.calibrageTouche || calibrage === undefined ? "" : `recommended — ${calibrage.dit}`;
  poserResumeDesReglages();

  const noms = [...vise.renforts].map(nomDe).filter((nom) => nom !== "");
  validerConfiance.textContent = avecPrincipale
    ? vise.principale === "" ? "Start the kitchen" : `Start the kitchen on ${nomDe(vise.principale)}`
    : noms.length === 0 ? "Add to the kitchen" : `Add ${noms.join(", ")} to the kitchen`;
  gestesDeConfiance.hidden = appairees.length === 0;
}

// Une machine à choisir : un libellé qui la porte entière — son bouton ou sa case, son nom, sa marque
// si l'app la recommande —, et dessous, ce que la choisir implique. Un clic n'importe où la choisit.
/**
 * @param {import("../stations/stations.ts").StationVue} station @param {"radio" | "checkbox"} type
 * @param {boolean} choisie @param {boolean} recommandee @param {(coche: boolean) => void} changer
 */
function uneMachine(station, type, choisie, recommandee, changer) {
  const pose = document.createElement("label");
  pose.className = "machine";
  pose.dataset.choisie = String(choisie);
  pose.dataset.etat = station.etat;
  const choix = document.createElement("input");
  choix.type = type;
  if (type === "radio") choix.name = "principale-du-projet";
  choix.checked = choisie;
  choix.ariaLabel = type === "radio" ? `${station.nom} is its main machine` : `${station.nom} is a station of it`;
  choix.addEventListener("change", () => changer(choix.checked));
  const nomme = document.createElement("span");
  nomme.className = "nom-de-machine";
  const appele = exact("strong", station.nom);
  nomme.append(appele);
  if (recommandee) {
    const marque = bloc("span", "recommended");
    marque.className = "pilule";
    nomme.append(marque);
  }
  const propose = projetsVus?.machines[station.id];
  const implique = [...(propose === undefined ? [] : [propose.implique]), ...(station.etat === "en-ligne" ? [] : [station.dit]), ...(station.machine === "" ? [] : [station.machine])];
  pose.append(choix, nomme, bloc("small", implique.join(" · ")));
  return pose;
}

// Replié, « advanced settings » dit le calibrage qui partira.
function poserResumeDesReglages() {
  const dit = (/** @type {"manager" | "reviewer"} */ role) => {
    const modele = calibrageDeConfiance[`${role}-modele`].value;
    const effort = calibrageDeConfiance[`${role}-effort`].value;
    return `${role} ${modele === "" || effort === "" ? "not chosen" : `${modele} / ${effort}`}`;
  };
  const tete = bloc("span", "Advanced settings");
  const valeurs = bloc("span", `${dit("manager")} · ${dit("reviewer")}`);
  valeurs.className = "valeurs";
  resumeDesReglages.replaceChildren(tete, valeurs);
}

// Ouvrir le choix : l'heure en est gardée, comme pour le parcours — c'est d'elle que se mesure le temps
// jusqu'au projet servi. Un projet écrit à la main choisit son dépôt parmi ceux du chef, lus sur GitHub.
ouvrirLaConfiance.addEventListener("click", () => void ouvrirConfiance());
async function ouvrirConfiance() {
  const projet = courant;
  if (projet === undefined) return;
  /** @type {NonNullable<typeof confiance>} */
  const vise = { projet: projet.nom, ouvertLe: new Date().toISOString(), depots: [], renforts: new Set(), principale: "", touchee: false, cooksTouches: false, calibrageTouche: false, manque: new Set() };
  confiance = vise;
  formulaireDeConfiance.hidden = false;
  reglagesAvances.open = false;
  confianceDitePour = { projet: "", dit: "", a: 0 };
  confianceRefusee.replaceChildren();
  baseDeConfiance.value = projet.base ?? "";
  for (const [champ, liste] of Object.entries(calibrageDeConfiance)) proposer(liste, champ.endsWith("modele") ? CALIBRAGE_DU_PROJET.modeles : CALIBRAGE_DU_PROJET.efforts, champ.endsWith("modele") ? "— model —" : "— effort —");
  poserStationsDuProjet();
  if (projet.depot !== undefined && projet.base !== undefined) return;
  await lireLesDepots(vise, projet);
}
// Le dépôt à choisir : ceux du chef, lus sur GitHub, avec celui que le projet connaît déjà d'avance.
/** @param {NonNullable<typeof confiance>} vise @param {Projet} projet */
async function lireLesDepots(vise, projet) {
  depotDeConfiance.replaceChildren(new Option("reading your repositories on GitHub…", ""));
  const lus = await brigade.depotsDuChef();
  if (confiance !== vise) return;
  if ("refus" in lus) {
    depotDeConfiance.replaceChildren(new Option("— repository —", ""), ...(projet.depot === undefined ? [] : [new Option(projet.depot, projet.depot)]));
    if (projet.depot !== undefined) depotDeConfiance.value = projet.depot;
    confianceRefusee.replaceChildren(bloc("p", lus.refus));
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
for (const liste of Object.values(calibrageDeConfiance)) {
  liste.addEventListener("change", () => {
    if (confiance === undefined) return;
    confiance.calibrageTouche = true;
    calibrageDit.textContent = "";
    poserResumeDesReglages();
  });
}
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
  const connu = projet.depot !== undefined && projet.base !== undefined;
  const choisies = [...(vise.principale === "" ? [] : [vise.principale]), ...vise.renforts];
  const noms = choisies.map((id) => (stationsVues?.stations ?? []).find((station) => station.id === id)?.nom ?? id);
  validerConfiance.disabled = true;
  confianceRefusee.replaceChildren(bloc("p", "writing the request on your stations' gists…"));
  try {
    const rendu = await brigade.confierAUneStation({
      nom: projet.nom,
      depot: !champDuDepot.hidden ? depotDeConfiance.value : (projet.depot ?? ""),
      base: !champDeLaBase.hidden ? baseDeConfiance.value : (projet.base ?? ""),
      stations: choisies,
      principale: vise.principale,
      cooks: champDesCooks.hidden && cuisineDe(projet).principale ? "" : cooksDeConfiance.value,
      manager: { modele: calibrageDeConfiance["manager-modele"].value, effort: calibrageDeConfiance["manager-effort"].value },
      reviewer: { modele: calibrageDeConfiance["reviewer-modele"].value, effort: calibrageDeConfiance["reviewer-effort"].value },
      ouvertLe: vise.ouvertLe,
    });
    if ("signales" in rendu) {
      confianceRefusee.replaceChildren(...Object.values(rendu.signales).map((raison) => bloc("p", raison ?? "")));
      // Ce que la première station ne dit pas se montre, posé de ce que l'app devine : le chef le lit et le corrige.
      const manque = rendu.manque ?? [];
      if (confiance === vise && manque.length > 0) {
        for (const champ of manque) vise.manque.add(champ);
        if (manque.includes("base") && baseDeConfiance.value === "") baseDeConfiance.value = projet.base ?? "";
        poserStationsDuProjet();
        if (manque.includes("depot") && vise.depots.length === 0) await lireLesDepots(vise, projet);
      }
    }
    else if ("refus" in rendu) confianceRefusee.replaceChildren(bloc("p", rendu.refus));
    else {
      if (confiance === vise) fermerConfiance();
      confianceRefusee.replaceChildren();
      confianceDitePour = {
        projet: projet.nom,
        dit: `${rendu.ajoute} is asked of ${noms.join(", ")}: ${vise.principale === "" ? "each prepares it" : "its main station prepares it"} within a minute — if GitHub asks you to authorize brigade, its button appears on this line`,
        a: Date.now(),
      };
      if (courant?.nom === projet.nom) poserStationsDuProjet();
    }
  } catch (erreur) {
    confianceRefusee.replaceChildren(bloc("p", `nothing was sent: ${erreur instanceof Error ? erreur.message : String(erreur)}`));
  }
  validerConfiance.disabled = false;
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
  const alertes = !seLit(projet) ? [] : (bandes.get(projet.nom) ?? []).filter(({ appel }) => !(appel !== undefined && "geste" in appel && (appel.geste === "manager-allumer" || (appel.geste === "grant-activer" && appel.grant === "merge"))));
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
      gesteRate = undefined;
      aConfirmer = ouverte === undefined ? { projet: projet.nom, cle, rendu: confirmationDeDemande(cout) } : undefined;
      montrer();
    });
    demande.dataset.geste = "demande";
    demande.ariaExpanded = cout === "" ? null : String(ouverte !== undefined);
    demande.title = cout === "" ? "writes into the second a request about this line — nothing is sent: you press Enter" : "says first what lifting it costs — then writes the request into the second, without sending it";
    pose = ouverte === undefined ? [demande] : [demande, poserConfirmation(projet, ouverte, undefined, () => void demanderAlerte(alerte))];
  } else if ("relire" in appel) {
    // Réessayer maintenant : la box est relue tout de suite, au lieu d'attendre le tour des trente secondes.
    pose = [bouton(mot, () => brigade.relireBox(demandeFaits))];
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
  poserStationsDuProjet();
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
  } else if (projet.sansStation === true) {
    // Station arrêtée : rien n'est lu. La ligne est celle du rail (poserRail), qui cède la place au
    // rail, à la file et aux cartes dès que la station tourne (la configuration est reposée).
    tete.dataset.etat = "sans-station";
    tete.textContent = "";
    corps.replaceChildren();
  } else if (!seLit(projet)) {
    tete.dataset.etat = "sans-station";
    tete.textContent = "no read";
    corps.replaceChildren(
      lectureIndisponible(
        document,
        `“${projet.nom}” does not say where its station is: nothing is read`,
        `It lacks “hote”, in ${configuration.chemin}: the name your \`ssh\` reaches your station by. The app re-reads this file as soon as it changes.`,
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
  coutsOuverts = false;
  marquer();
  poserCode();
  poserAccueil();
  poserCout();
  tous.replaceChildren(bloc("h2", "Projects"), projetsDeLAccueil, bloc("h2", "Stations"), stationsDeLAccueil, bloc("h2", "Cost"), coutsDeLAccueil, titreDeLApp, appDeLAccueil, santeDeLAccueil);
  brigade.tous(++demande);
}

// La page des coûts de tous les projets, à la place de l'accueil : « T » reste l'entrée affichée, et un
// geste y ramène. Seule sa lecture part — `station` sur la box de chaque projet — tant qu'elle est affichée.
function ouvrirCouts() {
  courant = undefined;
  ajoute = false;
  stationOuverte = undefined;
  coutsOuverts = true;
  marquer();
  poserCout();
  tous.replaceChildren(pageDesCouts);
  retourDesCouts.focus();
}
ouvrirLesCouts.addEventListener("click", () => ouvrirCouts());
retourDesCouts.addEventListener("click", () => ouvrirTous());

// La page d'une station, à la place de l'accueil : « T » reste l'entrée affichée, et un geste y ramène.
/** @param {string} id */
function ouvrirStation(id) {
  courant = undefined;
  ajoute = false;
  stationOuverte = id;
  coutsOuverts = false;
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

// Ajouter un projet à l'app sans écrire de JSON : son dossier se choisit, son dépôt et sa branche
// en viennent. Aucune station n'y est demandée : sa cuisine se confie depuis sa page, quand le chef
// le décide. Ce qui a été saisi reste, d'un passage à l'autre.
function ouvrirAjout() {
  courant = undefined;
  ajoute = true;
  stationOuverte = undefined;
  coutsOuverts = false;
  marquer();
  ou.textContent = `${configuration.projets.length === 0 ? "No project yet. " : ""}It is written to ${configuration.chemin} — which you can also edit by hand: the app re-reads it as soon as it changes.`;
  choisi.textContent = dossier === "" ? "no folder chosen" : dossier;
}

// Ce que le clone a proposé pour un champ : le chef qui l'a changé garde ce qu'il a écrit.
/** @type {{ depot: string, base: string }} */
const lusDuClone = { depot: "", base: "" };
element("dossier").addEventListener("click", async () => {
  const pris = await brigade.choisirDossier();
  if (pris === undefined) return;
  dossier = pris;
  choisi.textContent = pris;
  signaler("dossier");
  // Son dépôt et sa branche, lus dans son clone — tant que le chef n'en a pas écrit d'autres.
  const lu = await brigade.lireClone(pris);
  if (lu === undefined || dossier !== pris) return;
  for (const [champ, saisi] of /** @type {const} */ ([["depot", depot], ["base", base]])) {
    if (saisi.value !== "" && saisi.value !== lusDuClone[champ]) continue;
    lusDuClone[champ] = lu[champ] ?? "";
    saisi.value = lusDuClone[champ];
    signaler(champ, lu.raisons[champ] ?? "");
  }
});

// Ce qu'il est advenu de l'ajout, sous le formulaire.
/** @param {import("../ajout.ts").Issue | { etat: "en-cours", titre: string }} issue */
function poserIssue(issue) {
  issueAjout.dataset.etat = issue.etat;
  if (issue.etat === "champs") return issueAjout.replaceChildren(bloc("strong", "Nothing was written: what is missing is flagged under its field."));
  if (issue.etat === "ajoute") return issueAjout.replaceChildren();
  issueAjout.replaceChildren(bloc("strong", issue.titre));
}

formulaire.addEventListener("submit", async (soumission) => {
  soumission.preventDefault();
  const saisie = { dossier, depot: depot.value, base: base.value };
  envoi.disabled = true;
  const issue = await brigade.ajouter(saisie).finally(() => (envoi.disabled = false));
  for (const champ of /** @type {const} */ (["dossier", "depot", "base"])) signaler(champ, issue.etat === "champs" ? issue.champs[champ] : "");
  poserIssue(issue);
  if (issue.etat !== "ajoute") return;
  // Ajouté : la liste est déjà arrivée par `surConfiguration`. Sa page s'ouvre : c'est là que sa
  // cuisine se confie à une station — tout de suite, plus tard, ou jamais.
  vider();
  const projet = projetDe(issue.nom);
  if (projet !== undefined) void ouvrir(projet);
});

// L'écran d'ajout, rendu vide : ce qui vient d'être ajouté n'y reste pas.
function vider() {
  formulaire.reset();
  depot.value = base.value = "";
  dossier = "";
  lusDuClone.depot = lusDuClone.base = "";
  choisi.textContent = "no folder chosen";
}

/** @param {Projet} projet */
async function ouvrir(projet) {
  courant = projet;
  stationOuverte = undefined;
  coutsOuverts = false;
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
  if (recue.projet === courant?.nom && courant.sansStation !== true) {
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
  // La pastille dit la même chose que la bande, en un mot.
  marquerPastille(projet);
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
  // Une box pas jointe n'efface pas le rail : la dernière lecture reste, marquée (poserRail).
  const muette = !("tableau" in recue) && "atteinte" in recue && !recue.atteinte;
  if (muette) muets.set(recue.projet, muets.get(recue.projet) ?? recue.a);
  else muets.delete(recue.projet);
  const gardee = tenus.get(recue.projet);
  if (!(muette && gardee !== undefined && "tableau" in gardee)) tenus.set(recue.projet, recue);
  marquerPastille(recue.projet);
  if (courant?.nom === recue.projet) {
    dessiner();
    void poserOrdinaires(courant);
    // Reliability pose aussi ce que `facts` dit des corrections acceptées.
    poserLaFiabilite();
  }
});
// Ce que l'onglet de contenu affiché a rendu : une lecture ratée s'y lit comme
// dans le panneau, et n'en retire rien. Celle de l'onglet Manager vient avec l'état du
// manager, lu dans sa sortie : il remplace celui d'avant, au-dessus du texte. Celle de
// l'onglet Grants, de même, avec l'état des grants ; celle de l'onglet Reliability, avec la fiabilité des cooks ;
// celle de l'onglet Closer, lue ici même dans sa sortie (closer/section.js).
brigade.surContenu((recue, vu, desGrants, laFiabilite) => {
  if (recue.demande !== demandeOnglet) return;
  // La page des coûts lit `station` sur la box de chaque projet : chacune entre dans ses chiffres.
  if (ongletDemande === COUTS) {
    coutsLus.set(recue.projet, recue);
    return poserCout();
  }
  if (recue.projet !== courant?.nom || courant.sansStation === true) return;
  // Reliability : son `station` dit aussi ce que le projet a coûté.
  if (ongletDemande === FIABILITE) lectureDeLaFiabilite = recue;
  // Sans page par-dessus, c'est la lecture de l'onglet Cooks : elle se pose sur lui (ticket 1184).
  if (actif() === undefined) rendre(recue, luCuisine, lectureCuisine, true, { ouvert: !cuisineRepliee, basculer: (ouvert) => void (cuisineRepliee = !ouvert) });
  else rendre(recue, luOnglet, lectureOnglet, true);
  managerVu = vu;
  poserManager();
  grantsVus = desGrants;
  poserGrants();
  fiabiliteVue = laFiabilite;
  poserLaFiabilite();
  if (ongletDemande === CLOSER) {
    closerLu = { projet: recue.projet, lu: lireFermeture(recue) };
    // Le geste revenu se lit désormais dans la lecture : la place revient au repos.
    if (lancementsDuCloser.get(recue.projet)?.etape === "relecture") lancementsDuCloser.delete(recue.projet);
  }
  poserLeCloser();
});
// Les clones relus : leur état remplace celui d'avant, dans Paramètres et sur la case « T ».
brigade.surCode((vu) => {
  codeVu = vu;
  poserCode();
});
// La mise à jour de l'app : son état remplace celui d'avant ; le message de l'accueil le suit.
brigade.surMiseAJour((vu) => {
  miseAJourVue = vu;
  poserApp();
});
// L'offre d'une version plus haute de l'app Android, au lancement : l'invite se pose sur l'espace ; « Not now » la
// ferme jusqu'au lancement suivant, « Update » remet l'adresse de l'APK à l'installation.
const inviteDeMiseAJour = tenirInvite(element("offre-apk"), document, { installer: (apkUrl) => brigade.installerApk(apkUrl) });
brigade.surOffreApk((offre) => inviteDeMiseAJour.offrir(offre));
// Les stations relues : ce que la page d'une station en montre suit — leurs lignes de l'accueil viennent par `surAccueil`.
brigade.surStations((vu) => {
  stationsVues = vu;
  if (stationOuverte !== undefined) poserPageDeStation();
  poserChoixDesStations();
  poserStationsDuProjet();
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
  // Le refus levé se relit : s'il est encore publié, il revient. Une phrase sur un refus qui n'est plus publié s'en va.
  for (const [nom, etat] of remedesDesRefus) {
    const refus = vu.projets.find((projet) => projet.nom === nom)?.refus ?? null;
    if (etat.etape === "leve" || (etat.etape === "dit" && refus === null)) remedesDesRefus.delete(nom);
  }
  poserProjets();
  poserChoixDesStations();
  poserStationsDuProjet();
  // L'accès au dépôt et le refus de la station : la ligne d'alerte de Rail les dit (ticket 1185). Apparue ou partie,
  // le rail se repose : elle n'y est que quand elle dit quelque chose.
  if (courant !== undefined) {
    const avant = alerteDeCuisine.hidden;
    poserCuisson(courant);
    if (avant !== alerteDeCuisine.hidden) poserRail(courant);
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
  tenus.clear();
  muets.clear();
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
      // Un projet qui ne se lit nulle part n'a pas de pastille : rien n'est lu de lui.
      if (seLit(projet)) {
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
  else if (coutsOuverts && !ajoute) ouvrirCouts();
  // Sur le téléphone, aucun projet ne s'ajoute d'un dossier : sans projet, l'app reste sur « Tous les projets ».
  else if (ajoute || (configuration.projets.length === 0 && telephone === undefined)) ouvrirAjout();
  // L'app s'ouvre sur « Tous les projets », en tête de la barre.
  else ouvrirTous();
  montrer();
}

const demarrage = await brigade.demarrage();
POSTE = demarrage.poste ?? POSTE;
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
// Une lecture arrivée pendant le démarrage est plus récente que celle qu'il rend.
codeVu ??= demarrage.code;
stationsVues ??= demarrage.stations;
projetsVus ??= demarrage.projetsDesStations;
accueilVu ??= demarrage.accueil;
miseAJourVue ??= demarrage.miseAJour;
CALIBRAGE_DU_PROJET = demarrage.calibrage;
let configuration = demarrage.configuration;
// Le téléphone (l'app Android, ticket 1161) : son appairage, que le pont garde — rien sur le desktop. Pas encore
// appairé, l'app s'ouvre sur l'écran qui le relie aux projets, et le reste de l'app est caché derrière. Appairé,
// elle passe à « Tous les projets », où une ligne dit à quelle station (telephone/appairage.js).
const telephone = demarrage.telephone;
if (telephone !== undefined) {
  const tenue = tenirConversation(sectionConversation, document, { pont: brigade, rendre: poserBlocs });
  conversationDuTelephone = tenue;
  brigade.surConversation?.((projet, conversation) => tenue.recevoir(projet, conversation));
}
const appairageDuTelephone = element("appairage");
const cadreDeLApp = element("cadre");
if (telephone !== undefined && !telephone.appaire) {
  cadreDeLApp.hidden = true;
  appairageDuTelephone.hidden = false;
  tenirAppairage(appairageDuTelephone, document, {
    pont: brigade,
    userAgent: navigator.userAgent,
    apres: (station) => {
      appairageDuTelephone.className = "fait";
      appairageDuTelephone.replaceChildren(poserAppaire(document, station));
      cadreDeLApp.hidden = false;
      ouvrirTous();
      montrer();
    },
  });
}
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
