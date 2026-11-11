// @ts-check
// Ce que la page d'un projet montre tant qu'il n'est pas prêt (ticket 3166, épique 3164). « Add a project » choisit un
// dépôt, crée le projet et ouvre sa page (ticket 3181) : là, à la place du rail, une question à la fois, sous une ligne qui
// dit où l'on en est (« 1 of 2: who cooks it ») — rien d'autre ne lui dispute la page :
//   1. qui le cuit — le choix recommandé d'abord : une station du compte en ligne, sinon cet ordinateur. Un clic, et la
//      page passe à la suite. Une station qui le cuit déjà : la question n'est pas posée ;
//   2. sa mise en place pour Brigade, seulement s'il ne l'est pas (la lecture de ticket 2628, `checkRepoSetup`) : le second
//      la fait dans sa colonne, à droite, et la page dit à chaque instant ce qui est attendu et de qui — le second qui lit
//      le dépôt, le chef qui lui répond, la PR de mise en place qui attend son merge —, avec le bouton du geste quand il y en a un.
// Prêt : le rail reprend la page, et une seule ligne propose d'écrire le premier ticket avec le second.
// Un projet où le compte ne peut pas écrire (ticket 3163) n'ouvre rien de tout cela.
// Ce module ne touche pas `document` : il reçoit de quoi créer un élément (briques.js), et rend des éléments.

import { boutonAction, survol } from "../briques.js";
import { ligneErreur } from "../composants/ligne-erreur/ligne-erreur.js";
import { gestes } from "../parcours-projet/connexion.js";
import { refusDit } from "../projets-servis/projets-servis.js";
import { PREPARER } from "../page-projet/depot-non-prepare.js";
import { CET_ORDINATEUR, ENREGISTREMENT, LECTURE_DE, REESSAYER } from "../lexique.js";

/** @typedef {import("../briques.js").Fabrique} Fabrique */
/** @typedef {import("../page-projet/depot-non-prepare.js").Etat} Preparation */
/** Une station appairée du compte, telle que sa lecture la rend. @typedef {import("../../stations-du-compte.ts").StationEnregistree} StationDuCompte */
// La question « qui le cuit » : à poser ; pas à poser, une station le cuit déjà (`inutile`) ; le choix qui s'écrit
// (`enCours`, la clé du choix) ; répondue (`ajoutee`) ; ou refusée, sa ligne et son détail.
/** @typedef {"a-faire" | "inutile" | "ajoutee" | { enCours: string } | { ligne: string, detail: string }} Station */
// Un choix de station : `cle` — `ICI`, ou l'id de la station appairée —, son nom, et si elle est hors ligne.
/** @typedef {{ cle: string, nom: string, horsLigne: boolean }} Choix */
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
/** @typedef {{ etape: "station" } | { etape: "setup", attente: Attente, qui: Qui } | { etape: "pret" }} Vu */
/**
 * @typedef {{
 *   choisir: (choix: Choix) => void,
 *   relire: () => void,
 *   preparer: () => void,
 *   ouvrirLaCarte: () => void,
 * }} GestesDuParcours
 */

export const ICI = "ici";
export const QUESTION_STATION = "who cooks it";
export const QUESTION_SETUP = "its setup for Brigade";
/** @param {number} rang @param {number | undefined} total @param {string} question */
export const PROGRESSION = (rang, total, question) => (total === undefined ? `${question.charAt(0).toUpperCase()}${question.slice(1)}` : `${rang} of ${total}: ${question}`);
/** @param {string} depot */
export const QUI_CUIT = (depot) => `Who cooks ${depot}?`;
/** @param {string} depot */
export const MISE_EN_PLACE = (depot) => `${depot} is being set up for Brigade`;
// La phrase du choix recommandé : cet ordinateur — mot pour mot celle du ticket —, ou une station du compte en ligne.
export const ICI_DIT = "This computer cooks the project's tickets while it is on; you can add a server or another computer later.";
/** @param {string} nom */
export const STATION_DIT = (nom) => `${nom} is online: it cooks the project's tickets; you can add a server or another computer later.`;
export const HORS_LIGNE = "offline: it takes the project once it is back";
export const AUCUN_CHOIX = `No station can take it: ${CET_ORDINATEUR} has no station, and none of yours is paired.`;
/** @param {string} nom */
export const INJOIGNABLE = (nom) => `${nom} could not be given the project.`;

/** @param {string} depot */
export const LECTURE = (depot) => `${LECTURE_DE(`whether ${depot} is set up for Brigade`)} Nothing is awaited from you.`;
/** @param {string} depot */
export const ILLISIBLE = (depot) => `Whether ${depot} is set up for Brigade could not be read. Waiting for you to try again.`;
export const DEMARRAGE = "The second is starting, in its column on the right: it reads your repository first. Nothing is awaited from you yet.";
export const LIT = "The second is reading your repository, in its column on the right. Nothing is awaited from you yet.";
export const REPONDRE = "The second is waiting for your answer, in its column on the right.";
export const MERGER = "The setup pull request is waiting for your merge: its card is in Awaiting you.";
// Pourquoi c'est au chef de la merger, comme la carte le dit (runtime/src/second-init/pr-de-setup.ts, `RAISON`).
export const POURQUOI_MERGER = "Only you merge it: it sets what will judge every future delivery — the integration branch, the checks, the file zones. Once it is merged, the project shows as ready.";
export const OUVRIR_LA_CARTE = "open its card";
/** @param {string} depot */
export const EN_ROUTE = (depot) => `The app is setting ${depot} up for Brigade. Nothing is awaited from you.`;
/** @param {string} dit */
export const REFUS = (dit) => `The setup failed: ${dit.replace(/\.$/, "")}. Waiting for you to try again.`;
export const EMPECHE = "The second could not start: its column says why. Waiting for you to set the project up from here instead.";

// Prêt : la ligne au-dessus du rail, et ce que son bouton écrit dans le second — sans Entrée, le chef la donne.
/** @param {string} depot */
export const PRET = (depot) => `${depot} is ready.`;
export const ECRIRE_LE_PREMIER = "write its first ticket with the second";
export const DEMANDE_DU_PREMIER = "Let's write the first ticket of this project together.";
export const ECRIT = "Written in the second, without Enter — it is waiting for your Enter.";
export const SECOND_ABSENT = "Nothing was written: the second is not running — its column says why.";
export const FERMER = "close";

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

// La carte de la PR de mise en place, où qu'elle soit sur le rail : son ticket, ou rien.
/** @param {readonly { cartes: readonly any[], autres?: readonly any[] }[] | undefined} colonnes @returns {any} */
export function carteDeSetup(colonnes) {
  return (colonnes ?? []).flatMap(({ cartes, autres = [] }) => [...cartes, ...autres]).find((carte) => (carte.titre ?? carte.fiche?.titre) === TITRE_DE_LA_CARTE_DE_SETUP);
}

// Les choix de « qui le cuit », le recommandé en tête : la première station du compte en ligne, sinon cet ordinateur —
// s'il a une station (`ici`) —, sinon la première qui reste. `stations` : celles du compte à qui le dépôt n'est pas encore
// choisi, hors celle de cet ordinateur (`stationsAProposer`, projet/stations/AjoutStation.js).
/** @param {{ ici: boolean, stations: readonly StationDuCompte[] }} offerts @returns {Choix[]} */
export function choixDeStation({ ici, stations }) {
  /** @type {Choix[]} */
  const appairees = stations.map(({ id, name, available }) => ({ cle: id, nom: name, horsLigne: !available }));
  const enLigne = appairees.findIndex(({ horsLigne }) => !horsLigne);
  const cetOrdinateur = ici ? [{ cle: ICI, nom: CET_ORDINATEUR, horsLigne: false }] : [];
  if (enLigne === -1) return [...cetOrdinateur, ...appairees];
  return [/** @type {Choix} */ (appairees[enLigne]), ...cetOrdinateur, ...appairees.filter((_, rang) => rang !== enLigne)];
}

// Où en est le parcours, d'après ce qui est lu. `preparation` : la lecture de ticket 2628 (absente, pas encore lue) ;
// `illisible` : la dernière a échoué, sa phrase ; `carte` : la PR de mise en place attend son merge.
/**
 * @param {{ station: Station, preparation?: Preparation, illisible?: string, carte?: boolean, second: Second }} lu
 * @returns {Vu}
 */
export function vuDuParcours({ station, preparation, illisible, carte = false, second }) {
  if (station !== "ajoutee" && station !== "inutile") return { etape: "station" };
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

// La ligne de progression : le rang de la question montrée, et combien le projet en pose — la station si elle est à
// poser, la mise en place si la lecture la dit à faire. Tant que la mise en place n'est pas lue, le compte n'est pas dit :
// la ligne ne promet ni n'annonce une question qui n'aura peut-être rien à faire.
/** @param {Vu} vu @param {{ station: Station, preparation?: Preparation }} lu @returns {string} */
export function progression(vu, { station, preparation }) {
  const avecStation = station !== "inutile";
  const etape = preparation?.etape;
  const setupConnu = etape !== undefined && etape !== "inconnu";
  const total = setupConnu ? (avecStation ? 1 : 0) + (etape === "prepare" ? 0 : 1) : undefined;
  if (vu.etape === "station") return PROGRESSION(1, total, QUESTION_STATION);
  return PROGRESSION(avecStation ? 2 : 1, total, QUESTION_SETUP);
}

/** @param {Fabrique} doc @param {string} balise @param {string} [texte] */
function cree(doc, balise, texte) {
  const pose = doc.createElement(balise);
  if (texte !== undefined) pose.textContent = texte;
  return pose;
}

// La question « qui le cuit » : la phrase du choix recommandé, puis un bouton par choix — le recommandé en tête,
// distingué ; une station hors ligne le dit à côté. Un choix qui s'écrit grise les boutons ; un refus se dit en une ligne,
// son détail au survol.
/** @param {Fabrique} doc @param {Station} station @param {readonly Choix[]} choix @param {GestesDuParcours} geste */
function corpsDeLaStation(doc, station, choix, geste) {
  const [recommande] = choix;
  if (recommande === undefined) return [cree(doc, "p", AUCUN_CHOIX)];
  const dit = cree(doc, "p", recommande.cle === ICI || recommande.horsLigne ? ICI_DIT : STATION_DIT(recommande.nom));
  dit.className = "phrase";
  const enCours = typeof station === "object" && "enCours" in station ? station.enCours : undefined;
  const liste = cree(doc, "ul");
  liste.className = "choix-de-station";
  liste.append(
    ...choix.map((un, rang) => {
      const ligne = cree(doc, "li");
      ligne.dataset.choix = un.cle;
      const action = boutonAction(doc, un.nom, () => geste.choisir(un), { recommande: rang === 0 });
      const bouton = action.children?.[0];
      if (bouton !== undefined) bouton.disabled = enCours !== undefined;
      ligne.append(action);
      const note = enCours === un.cle ? ENREGISTREMENT : un.horsLigne ? HORS_LIGNE : undefined;
      if (note !== undefined) ligne.append(Object.assign(cree(doc, "span", note), { className: "dit" }));
      return ligne;
    }),
  );
  const refus = typeof station === "object" && "ligne" in station ? [ligneErreur(doc, station.ligne, station.detail, { classe: "erreur", alerte: true })] : [];
  return [dit, liste, ...refus];
}

// La mise en place : ce qui est attendu, et de qui — une phrase ; ce qui en dit plus au survol ; le bouton, quand le
// geste est au chef ici même.
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
  dit.className = "phrase";
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

// La question montrée, à la place du rail : la ligne de progression, la question, puis son corps. `vu` n'est jamais
// « pret » ici : prêt, le rail reprend la page (`poserPret`).
/**
 * @param {Fabrique} doc
 * @param {{ depot: string, vu: Exclude<Vu, { etape: "pret" }>, progression: string, station: Station, choix: readonly Choix[], illisible?: string, refus?: string }} donnees
 * @param {GestesDuParcours} geste
 */
export function poserParcoursPremierProjet(doc, { depot, vu, progression: ligne, station, choix, illisible, refus }, geste) {
  const racine = cree(doc, "section");
  racine.className = "parcours-premier-projet carte";
  racine.ariaLabel = vu.etape === "station" ? QUI_CUIT(depot) : MISE_EN_PLACE(depot);
  racine.dataset.etape = vu.etape;
  const ou = cree(doc, "p", ligne);
  ou.className = "progression";
  const titre = cree(doc, "h2", vu.etape === "station" ? QUI_CUIT(depot) : MISE_EN_PLACE(depot));
  titre.className = "attendu";
  const corps =
    vu.etape === "station" ? corpsDeLaStation(doc, station, choix, geste)
    : corpsDuSetup(doc, depot, vu, { ...(illisible === undefined ? {} : { illisible }), ...(refus === undefined ? {} : { refus }) }, geste);
  racine.append(ou, titre, ...corps);
  return racine;
}

// Prêt : une seule ligne au-dessus du rail — écrire le premier ticket avec le second ; écrit, elle le dit ; une demande
// qui n'a rien écrit dit pourquoi.
/** @param {Fabrique} doc @param {string} depot @param {{ ecrit?: true | string }} etat @param {{ ecrire: () => void, fermer: () => void }} geste */
export function poserPret(doc, depot, { ecrit }, geste) {
  const ligne = cree(doc, "p");
  ligne.className = "pret-du-projet gestes";
  ligne.dataset.etape = "pret";
  const dit = cree(doc, "span", ecrit === true ? ECRIT : PRET(depot));
  dit.className = "phrase";
  ligne.append(dit);
  if (ecrit !== true) ligne.append(boutonAction(doc, ECRIRE_LE_PREMIER, geste.ecrire, { recommande: true }));
  if (typeof ecrit === "string") ligne.append(ligneErreur(doc, ecrit, "", { classe: "erreur" }));
  ligne.append(boutonAction(doc, FERMER, geste.fermer));
  return ligne;
}

// Les parcours tenus pour la vue, un par projet que « Add a project » a ouvert : son dépôt ; où en est « qui le cuit » et
// la station qui l'a reçu ; la phrase d'une lecture de la mise en place qui a échoué ; si la mise en place a demandé
// quelque chose (`setupVu`) ; et, prêt, la ligne qui reste au-dessus du rail (`pret`). Tenus le temps que l'app tourne.
/** @typedef {{ depot: string, station: Station, illisible?: string, setupVu: boolean, pret?: { ecrit?: true | string } }} Parcours */
/** @param {{ rendre: (projet: string) => void }} options */
export function tenirLesParcours({ rendre }) {
  /** @type {Map<string, Parcours>} */
  const tenus = new Map();
  /** @param {string} projet @param {(avant: Parcours) => Parcours} changer */
  const changer = (projet, changer) => {
    const avant = tenus.get(projet);
    if (avant === undefined) return;
    tenus.set(projet, changer(avant));
    rendre(projet);
  };
  return {
    /** @param {string} projet @returns {Parcours | undefined} */
    de: (projet) => tenus.get(projet),
    // `dejaCuit` : une station cuit déjà le projet — « qui le cuit » n'est pas posée.
    /** @param {string} projet @param {string} depot @param {boolean} dejaCuit */
    commencer(projet, depot, dejaCuit) {
      tenus.set(projet, { depot, station: dejaCuit ? "inutile" : "a-faire", setupVu: false });
      rendre(projet);
    },
    /** @param {string} projet @param {Station} station */
    station: (projet, station) => changer(projet, (avant) => ({ ...avant, station })),
    /** @param {string} projet @param {string | undefined} phrase */
    illisible(projet, phrase) {
      if (tenus.get(projet)?.illisible === phrase) return;
      changer(projet, ({ illisible: _, ...reste }) => (phrase === undefined ? reste : { ...reste, illisible: phrase }));
    },
    // La mise en place a attendu quelque chose du chef ou du second : prêt, la ligne du premier ticket le suivra. Rien
    // n'est redessiné — c'est le dessin qui le dit.
    /** @param {string} projet */
    setupMontre(projet) {
      const avant = tenus.get(projet);
      if (avant !== undefined) tenus.set(projet, { ...avant, setupVu: true });
    },
    // Prêt : la question part, le rail reprend la page. La ligne du premier ticket reste, si le chef a répondu à
    // quelque chose ; sinon, le parcours est fini — il n'y avait rien à faire.
    /** @param {string} projet */
    pret(projet) {
      const avant = tenus.get(projet);
      if (avant === undefined || avant.pret !== undefined) return;
      if (avant.station === "ajoutee" || avant.setupVu) tenus.set(projet, { ...avant, pret: {} });
      else tenus.delete(projet);
      rendre(projet);
    },
    /** @param {string} projet @param {true | string} ecrit */
    ecrit: (projet, ecrit) => changer(projet, (avant) => ({ ...avant, pret: { ecrit } })),
    /** @param {string} projet */
    fermer(projet) {
      if (tenus.delete(projet)) rendre(projet);
    },
  };
}

// La station choisie par le geste que l'app a déjà : ce qu'il rend en devient l'état — ajoutée, ou son refus en une ligne.
/** @param {string} nom @param {() => Promise<{ refus: string, detail?: string } | object>} ecrire @returns {Promise<Station>} */
export async function ajouterLaStation(nom, ecrire) {
  try {
    const lu = await ecrire();
    if (!("refus" in lu)) return "ajoutee";
    const dit = refusDit(lu.refus.replace(/^not saved: /, ""));
    return "detail" in lu && lu.detail !== undefined ? { ...dit, detail: [dit.detail, lu.detail].filter((bout) => bout !== "").join(" — ") } : dit;
  } catch (erreur) {
    return { ligne: INJOIGNABLE(nom), detail: erreur instanceof Error ? erreur.message : String(erreur) };
  }
}
