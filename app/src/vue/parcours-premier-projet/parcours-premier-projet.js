// @ts-check
// Le parcours guidé du premier projet à soi (ticket 3166, épique 3164). Quand le chef ajoute un premier projet où son
// compte GitHub peut écrire, son espace s'ouvre sur ce parcours au lieu de la carte nue de l'ajout :
//   1. la station — cet ordinateur cuira les tickets du projet ; d'autres stations (un serveur, un autre ordinateur)
//      s'ajoutent plus tard. Un seul bouton l'ajoute, par le geste que l'app a déjà (`servirUnProjet`, etape-station.js) ;
//   2. la mise en place du projet pour Brigade, seulement s'il ne l'est pas encore (la lecture de ticket 2628,
//      `checkRepoSetup`) : ce que fait le second, et ce qu'on attend du chef ;
//   3. prêt — le récap du parcours d'ajout (etape-recap.js).
// Le parcours ne laisse jamais un écran où rien ne bouge sans dire ce qui est attendu, et de qui : le second qui lit le
// dépôt, le chef qui lui répond, le chef qui merge la PR de mise en place.
// Un projet où le compte ne peut pas écrire (ticket 3163) ne l'ouvre pas ; celui que la visite ajoute (benomite/brigade,
// visite/) ne compte pas comme un projet à soi.
// Ce module ne touche pas `document` : il reçoit de quoi créer un élément (briques.js), et rend des éléments.

import { boutonAction, survol } from "../briques.js";
import { ligneErreur } from "../composants/ligne-erreur/ligne-erreur.js";
import { gestes } from "../parcours-projet/connexion.js";
import { poserEtapeRecap, TITRE as TITRE_PRET } from "../parcours-projet/etape-recap.js";
import { CUIT_PAR, ICI_DIT, INJOIGNABLE, TITRE as TITRE_STATION } from "../parcours-projet/etape-station.js";
import { poserLesEtapes } from "../parcours-projet/parcours.js";
import { refusDit } from "../projets-servis/projets-servis.js";
import { DEPOT_DE_LA_VISITE } from "../visite/visite.js";
import { PREPARER } from "../page-projet/depot-non-prepare.js";
import { CET_ORDINATEUR, ENREGISTREMENT, LECTURE_DE, REESSAYER } from "../lexique.js";

/** @typedef {import("../briques.js").Fabrique} Fabrique */
/** @typedef {import("../page-projet/depot-non-prepare.js").Etat} Preparation */
/** @typedef {import("../projets-servis/projets-servis.js").LectureDesProjetsServis} LectureDesProjetsServis */
// La station : à ajouter, en route, ajoutée — ou refusée, sa ligne et son détail.
/** @typedef {"a-faire" | "en-cours" | "ajoutee" | { ligne: string, detail: string }} Station */
// Ce que la vue sait du second du projet : il ne part pas (`empeche`), il propose des choix au chef (`propose`), et ce
// que le titre de son terminal dit — au travail, ou au repos à son invite (`travailDuSecond`).
/** @typedef {{ empeche?: boolean, propose?: boolean, titre?: "travail" | "repos" }} Second */
// De qui l'attente est : du chef, du second, ou de l'app.
/** @typedef {"toi" | "second" | "app"} Qui */
/**
 * Où en est la mise en place, et qui on attend :
 *   lecture     l'app lit si le projet est prêt pour Brigade
 *   illisible   cette lecture a échoué : le chef relance
 *   demarrage   le second démarre
 *   lit         le second lit le dépôt et prépare la mise en place
 *   repondre    le second attend la réponse du chef
 *   merger      la PR de mise en place attend le merge du chef — sa carte est dans Awaiting you
 *   en-route    l'app met le projet en place (« Set up for Brigade », ticket 2628)
 *   refus       cette mise en place a échoué : le chef relance
 *   empeche     le second ne part pas : sa colonne dit pourquoi
 * @typedef {"lecture" | "illisible" | "demarrage" | "lit" | "repondre" | "merger" | "en-route" | "refus" | "empeche"} Attente
 */
// `setup`, à l'étape de la station : la lecture dit déjà le projet pas prêt — la mise en place s'annonce, à venir.
/** @typedef {{ etape: "station", station: Station, setup: boolean } | { etape: "setup", attente: Attente, qui: Qui } | { etape: "pret" }} Vu */
/**
 * @typedef {{
 *   ajouterCetOrdinateur: () => void,
 *   relire: () => void,
 *   preparer: () => void,
 *   ouvrirLaCarte: () => void,
 *   fermer: () => void,
 * }} GestesDuParcours
 */

export const TITRE = "Your first project";
export const TITRE_SETUP = "Its setup for Brigade";
export const AJOUTER_ICI = `add ${CET_ORDINATEUR}`;
// « This computer », en tête de phrase.
const CET_ORDINATEUR_EN_TETE = `${CET_ORDINATEUR.charAt(0).toUpperCase()}${CET_ORDINATEUR.slice(1)}`;
/** @param {string} depot */
export const QUI_CUIT = (depot) => `${CET_ORDINATEUR_EN_TETE} will cook the tickets of ${depot}; other stations — a server, another computer — can be added later, from the Stations tab.`;
export const FERMER = "close";
export const OUVRIR_LA_CARTE = "open its card";

/** @param {string} depot */
export const LECTURE = (depot) => `${LECTURE_DE(`whether ${depot} is set up for Brigade`)} Nothing is awaited from you.`;
/** @param {string} depot */
export const ILLISIBLE = (depot) => `Whether ${depot} is set up for Brigade could not be read. Waiting for you to try again.`;
export const DEMARRAGE = "Waiting for the second to start: it reads your repository first, in its column.";
export const LIT = "The second is reading your repository and preparing the setup. Nothing is awaited from you yet.";
export const REPONDRE = "Waiting for you to answer the second, in its column: it asks only what reading your repository could not settle.";
export const MERGER = "Waiting for you to merge the setup pull request: its card is in Awaiting you.";
// Pourquoi c'est au chef de la merger, comme la carte le dit (runtime/src/second-init/pr-de-setup.ts, `RAISON`).
export const POURQUOI_MERGER = "Only you merge it: it sets what will judge every future delivery — the integration branch, the checks, the file zones. Once it is merged, the project shows as ready.";
/** @param {string} depot */
export const EN_ROUTE = (depot) => `The app is setting ${depot} up for Brigade. Nothing is awaited from you.`;
/** @param {string} dit */
export const REFUS = (dit) => `The setup failed: ${dit.replace(/\.$/, "")}. Waiting for you to try again.`;
export const EMPECHE = "The second could not start: its column says why. Waiting for you to set the project up from here instead.";

// Le titre de la carte qui attend le merge de la PR de mise en place, mot pour mot comme le runtime pose son issue
// (runtime/src/second-init/pr-de-setup.ts, `TITRE`, ticket 3169).
export const TITRE_DE_LA_CARTE_DE_SETUP = "Merge the setup pull request";

// Les signes que `claude` met en tête du titre de son terminal, relevés par l'app pour sa saisie (saisie.ts) : « ✳ » au
// repos à son invite, il attend le chef ; un des quatre quarts de cercle, il tourne.
const REPOS = "✳";
const TRAVAIL = ["◐", "◑", "◒", "◓"];

// Ce que le titre du terminal du second dit de lui : au travail, au repos — ou rien qu'on sache lire.
/** @param {string | undefined} titre @returns {"travail" | "repos" | undefined} */
export function travailDuSecond(titre) {
  if (titre === undefined) return undefined;
  if (TRAVAIL.some((glyphe) => titre.startsWith(glyphe))) return "travail";
  if (titre.startsWith(REPOS)) return "repos";
  return undefined;
}

// Le projet ajouté est-il le premier à soi ? Aucun autre projet du fichier ne l'est : ni celui que la visite a ajouté
// (benomite/brigade), ni un projet que sa dernière lecture dit en lecture seule (ticket 3163). Un projet pas encore lu compte.
/** @param {readonly { nom: string, depot?: string }[]} projets @param {string} nom @param {(projet: { nom: string }) => boolean} enLectureSeule */
export function estUnPremierProjet(projets, nom, enLectureSeule) {
  return !projets.some((projet) => projet.nom !== nom && projet.depot?.toLowerCase() !== DEPOT_DE_LA_VISITE && !enLectureSeule(projet));
}

// La carte de la PR de mise en place, où qu'elle soit sur le rail : son ticket, ou rien.
/** @param {readonly { cartes: readonly any[], autres?: readonly any[] }[] | undefined} colonnes @returns {any} */
export function carteDeSetup(colonnes) {
  return (colonnes ?? []).flatMap(({ cartes, autres = [] }) => [...cartes, ...autres]).find((carte) => (carte.titre ?? carte.fiche?.titre) === TITRE_DE_LA_CARTE_DE_SETUP);
}

// Où en est le parcours, d'après ce qui est lu. `preparation` : la lecture de ticket 2628 (absente, pas encore lue) ;
// `illisible` : la dernière a échoué, sa phrase ; `carte` : la PR de mise en place attend son merge.
/**
 * @param {{ station: Station, preparation?: Preparation, illisible?: string, carte?: boolean, second: Second }} lu
 * @returns {Vu}
 */
export function vuDuParcours({ station, preparation, illisible, carte = false, second }) {
  if (station !== "ajoutee") return { etape: "station", station, setup: preparation !== undefined && preparation.etape !== "inconnu" && preparation.etape !== "prepare" };
  if (preparation?.etape === "prepare") return { etape: "pret" };
  /** @param {Attente} attente @param {Qui} qui @returns {Vu} */
  const setup = (attente, qui) => ({ etape: "setup", attente, qui });
  if (preparation === undefined || preparation.etape === "inconnu") return illisible === undefined ? setup("lecture", "app") : setup("illisible", "toi");
  if (carte) return setup("merger", "toi");
  if (preparation.etape === "en-route") return setup("en-route", "app");
  if (preparation.etape === "refus") return setup("refus", "toi");
  if (second.empeche === true) return setup("empeche", "toi");
  if (second.propose === true || second.titre === "repos") return setup("repondre", "toi");
  if (second.titre === "travail") return setup("lit", "second");
  return setup("demarrage", "second");
}

/** @param {Fabrique} doc @param {string} balise @param {string} [texte] */
function cree(doc, balise, texte) {
  const pose = doc.createElement(balise);
  if (texte !== undefined) pose.textContent = texte;
  return pose;
}

// L'étape de la station, tant que cet ordinateur ne l'est pas : la phrase, son bouton — en route, il attend —, et un refus.
/** @param {Fabrique} doc @param {string} depot @param {Station} station @param {string} cuitPar @param {GestesDuParcours} geste */
function corpsDeLaStation(doc, depot, station, cuitPar, geste) {
  if (station === "ajoutee") return [cree(doc, "p", CUIT_PAR(cuitPar, depot))];
  const dit = cree(doc, "p", QUI_CUIT(depot));
  dit.className = "attendu";
  const groupe = boutonAction(doc, AJOUTER_ICI, geste.ajouterCetOrdinateur, { recommande: true });
  const bouton = groupe.children?.[0];
  if (bouton !== undefined) bouton.disabled = station === "en-cours";
  const ligne = cree(doc, "p");
  ligne.className = "gestes";
  ligne.append(groupe, survol(doc, ICI_DIT), ...(station === "en-cours" ? [cree(doc, "span", ENREGISTREMENT)] : []));
  return [dit, ligne, ...(typeof station === "object" ? [ligneErreur(doc, station.ligne, station.detail, { classe: "erreur", alerte: true })] : [])];
}

// L'étape de la mise en place : ce qui est attendu, et de qui — une phrase en tête ; ce qui en dit plus au survol ; le
// bouton, quand le geste est au chef ici même.
/** @param {Fabrique} doc @param {string} depot @param {{ attente: Attente, qui: Qui }} vu @param {{ illisible?: string, refus?: string }} raisons @param {GestesDuParcours} geste */
function corpsDuSetup(doc, depot, { attente, qui }, raisons, geste) {
  /** @type {Record<Attente, string>} */
  const phrases = {
    lecture: LECTURE(depot),
    illisible: ILLISIBLE(depot),
    demarrage: DEMARRAGE,
    lit: LIT,
    repondre: REPONDRE,
    merger: MERGER,
    "en-route": EN_ROUTE(depot),
    refus: REFUS(raisons.refus ?? ""),
    empeche: EMPECHE,
  };
  const dit = cree(doc, "p", phrases[attente]);
  dit.className = "attendu";
  dit.dataset.attente = attente;
  dit.dataset.qui = qui;
  const detail = attente === "illisible" ? (raisons.illisible ?? "") : attente === "merger" ? POURQUOI_MERGER : "";
  if (detail.trim() !== "") dit.append(survol(doc, detail));
  const bouton =
    attente === "illisible" ? boutonAction(doc, REESSAYER, geste.relire, { recommande: true })
    : attente === "refus" ? boutonAction(doc, REESSAYER, geste.preparer, { recommande: true })
    : attente === "merger" ? boutonAction(doc, OUVRIR_LA_CARTE, geste.ouvrirLaCarte, { recommande: true })
    // Le second ne part pas : la mise en place se fait d'ici, par le geste de l'avis d'un projet pas préparé (ticket 2628).
    : attente === "empeche" ? boutonAction(doc, PREPARER, geste.preparer, { recommande: true })
    : undefined;
  return [dit, ...(bouton === undefined ? [] : [gestes(doc, [bouton])])];
}

// La carte du parcours, posée en tête de l'espace du projet. `setupVu` : l'étape de la mise en place a été montrée —
// elle reste dans la liste, faite, quand le projet devient prêt ; un projet déjà prêt ne la montre jamais. `cuitPar` : la
// station qui a reçu le projet — cet ordinateur, sauf une station choisie sur l'écran d'ajout avant que le parcours ne
// s'ouvre. `illisible`, `refus` : le détail d'une lecture ratée, la phrase d'une mise en place ratée.
/**
 * @param {Fabrique} doc
 * @param {{ depot: string, vu: Vu, setupVu?: boolean, cuitPar?: string, illisible?: string, refus?: string }} donnees
 * @param {GestesDuParcours} geste
 */
export function poserParcoursPremierProjet(doc, { depot, vu, setupVu = false, cuitPar = CET_ORDINATEUR, illisible, refus }, geste) {
  const racine = cree(doc, "section");
  racine.className = "parcours-projet parcours-premier-projet carte";
  racine.ariaLabel = TITRE;
  racine.dataset.etape = vu.etape;
  const titre = cree(doc, "h2", `${TITRE}: ${depot}`);
  titre.className = "attendu";
  const station = vu.etape === "station" ? vu.station : "ajoutee";
  const etapes = [
    { id: "station", titre: TITRE_STATION, faite: station === "ajoutee", poser: () => corpsDeLaStation(doc, depot, station, cuitPar, geste) },
    ...(vu.etape === "setup" || (vu.etape === "station" && vu.setup) || (setupVu && vu.etape === "pret")
      ? [{ id: "setup", titre: TITRE_SETUP, faite: vu.etape === "pret", poser: () => (vu.etape === "setup" ? corpsDuSetup(doc, depot, vu, { ...(illisible === undefined ? {} : { illisible }), ...(refus === undefined ? {} : { refus }) }, geste) : [cree(doc, "p", `${depot} is set up for Brigade.`)]) }]
      : []),
    { id: "pret", titre: TITRE_PRET, faite: false, poser: () => [poserEtapeRecap(doc, { projet: depot, station: cuitPar }), gestes(doc, [boutonAction(doc, FERMER, geste.fermer, { recommande: true })])] },
  ];
  racine.append(titre, poserLesEtapes(doc, etapes));
  return racine;
}

// Le parcours tenu pour la vue : son projet, son dépôt, sa station — et celle qui l'a reçu, quand ce n'est pas cet
// ordinateur —, la phrase d'une lecture de la mise en place qui a échoué, et si l'étape de la mise en place a été
// montrée. Un seul parcours à la fois ; fermé, il ne revient pas.
/** @typedef {{ projet: string, depot: string, station: Station, cuitPar?: string, illisible?: string, setupVu: boolean }} Parcours */
/** @param {{ rendre: () => void }} options */
export function tenirLeParcoursPremierProjet({ rendre }) {
  /** @type {Parcours | undefined} */
  let tenu;
  return {
    get etat() {
      return tenu;
    },
    // `choisie` : une station a déjà reçu le projet, par l'étape « station » de l'écran d'ajout — le parcours part de la suite.
    /** @param {string} projet @param {string} depot @param {string} [choisie] */
    commencer(projet, depot, choisie) {
      tenu = { projet, depot, station: choisie === undefined ? "a-faire" : "ajoutee", ...(choisie === undefined ? {} : { cuitPar: choisie }), setupVu: false };
      rendre();
    },
    /** @param {Station} station */
    station(station) {
      if (tenu === undefined) return;
      tenu = { ...tenu, station };
      rendre();
    },
    /** @param {string | undefined} phrase */
    illisible(phrase) {
      if (tenu === undefined || tenu.illisible === phrase) return;
      const { illisible: _, ...reste } = tenu;
      tenu = phrase === undefined ? reste : { ...reste, illisible: phrase };
      rendre();
    },
    // L'étape de la mise en place est montrée : elle restera dans la liste. Rien n'est redessiné — c'est le dessin qui le dit.
    setupMontre() {
      if (tenu !== undefined) tenu = { ...tenu, setupVu: true };
    },
    fermer() {
      tenu = undefined;
      rendre();
    },
  };
}

// La station ajoutée par le geste de l'app : ce qu'elle rend en devient l'état — ajoutée, ou son refus en une ligne.
/** @param {() => Promise<LectureDesProjetsServis>} servir @returns {Promise<Station>} */
export async function ajouterLaStation(servir) {
  try {
    const lu = await servir();
    return "refus" in lu ? refusDit(lu.refus) : "ajoutee";
  } catch (erreur) {
    return { ligne: INJOIGNABLE(CET_ORDINATEUR), detail: erreur instanceof Error ? erreur.message : String(erreur) };
  }
}
