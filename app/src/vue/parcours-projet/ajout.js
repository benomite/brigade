// @ts-check
// L'écran « Add a project » (ticket 3181) : il ne fait que choisir le dépôt. La liste des dépôts du compte GitHub de cet
// ordinateur — les siens et ceux de ses organisations, les plus récemment poussés d'abord (`depotsDuChef`, projets/github.ts) —,
// un champ qui la filtre, et de quoi coller le lien ou le `owner/name` d'un dépôt public qui n'est pas à lui. Rien n'est
// tapé pour les siens : un clic sur l'un l'ouvre — sa copie reprise ou clonée par le runtime, le projet ajouté à la colonne
// de gauche (premier-lancement.ts) —, et la vue passe à sa page. Ni dossier, ni branche : celle d'intégration est la
// branche par défaut que GitHub donne du dépôt. Rien ne se dit en erreur avant un geste : sans compte connecté, l'écran
// n'a que le bouton de la connexion ; un collage qui n'est pas un dépôt se dit après lui.
// Ce module ne touche pas `document` : il reçoit de quoi créer un élément (briques.js), et rend des éléments.

import { boutonAction } from "../briques.js";
import { ligneErreur } from "../composants/ligne-erreur/ligne-erreur.js";
import { AJOUTER_UN_PROJET, LECTURE_DE, NON_ATTEINT } from "../lexique.js";
import { phrase } from "../onboarding/parcours.js";
import { ouvertureDite } from "../premier-lancement.js";
import { poserLeCompte } from "./compte.js";
import { gestes } from "./connexion.js";
import { filtrer } from "./etape-projet.js";

/** @typedef {import("../briques.js").Fabrique} Fabrique */
/** @typedef {{ depot: string, base: string }} Depot */
/**
 * Ce que l'écran tient. `compte` : le compte GitHub de cet ordinateur — absent, sa lecture est en route ; `connexion` :
 * la connexion à GitHub lancée. `depots` : ceux du compte — absents, leur lecture est en route ; `{ refus }`, elle a
 * échoué. `saisie` : la recherche et le collage, gardés d'un affichage à l'autre. `refus` : ce qu'un collage a rendu.
 * `ouverture` : le dépôt choisi, que la copie ouvre — l'étape où elle en est, puis, ratée, ce que le runtime en dit.
 * `telephone` : l'app Android, qui n'ajoute aucun projet — elle lit ceux d'un ordinateur sur GitHub.
 * @typedef {{
 *   telephone?: boolean,
 *   compte?: import("../../connexion-github.ts").CompteGitHub,
 *   connexion?: import("./connexion.js").Connexion,
 *   depots?: { depots: readonly Depot[] } | { refus: string },
 *   saisie: { recherche: string, colle: string },
 *   refus?: string,
 *   ouverture?: import("../premier-lancement.js").EtatDuPremier["ouverture"],
 * }} EtatDeLAjout
 */
/**
 * Les gestes de l'écran. `choisir` : ouvrir ce dépôt ; `coller` : lire ce qui a été collé, puis l'ouvrir ; `relire` :
 * relire les dépôts ; `ouvrir` : rouvrir le dépôt dont l'ouverture a raté. Puis ceux de la connexion à GitHub.
 * @typedef {{
 *   choisir: (depot: Depot) => void,
 *   coller: (texte: string) => void,
 *   relire: () => void,
 *   ouvrir: (station: string, projet: string, depot: string, base?: string) => void,
 *   seConnecter: () => void,
 *   changerDeCompte: () => void,
 *   relireLeCompte: () => void,
 *   ouvrirLaPage: (url: string) => void,
 * }} GestesDeLAjout
 */

export const TITRE = AJOUTER_UN_PROJET;
export const ATTENDU = "Pick the repository of your project.";
export const SANS_COMPTE = "Connect to GitHub to pick one of your repositories.";
export const LECTURE = LECTURE_DE("your repositories on GitHub");
export const ILLISIBLES = NON_ATTEINT("your repositories");
export const RELIRE = "read again";
export const RECHERCHE = "search your repositories";
export const AUCUN = "No repository matches.";
export const COLLER = "or paste a public repository: its GitHub link, or owner/name";
export const AJOUTER = "add";
export const DEPUIS_UN_ORDINATEUR = "A project is added from a computer, and this phone reads it from GitHub.";
// La ligne qui dit où le dépôt choisi vient d'être cloné : dans le dossier que l'app gère (runtime/src/projets/copie-locale.ts),
// `~/Brigade/<name>` — le dossier du compte écrit `~`, sous macOS, Linux ou Windows.
const MAISON = /^(?:\/home|\/Users)\/[^/]+(?=\/|$)|^[A-Za-z]:\\Users\\[^\\]+(?=\\|$)/i;
/** @param {string} dossier */
export const CLONE_DANS = (dossier) => `Cloned into ${dossier.replace(MAISON, "~")}`;

/** @param {Fabrique} doc @param {string} balise @param {string} [texte] */
function cree(doc, balise, texte) {
  const pose = doc.createElement(balise);
  if (texte !== undefined) pose.textContent = texte;
  return pose;
}

// L'écran, d'après ce que la vue tient.
/** @param {Fabrique} doc @param {EtatDeLAjout} etat @param {GestesDeLAjout} geste */
export function poserLEcranDAjout(doc, etat, geste) {
  const racine = cree(doc, "section");
  racine.className = "ajout-d-un-projet carte";
  racine.ariaLabel = TITRE;
  const titre = cree(doc, "h2", TITRE);
  racine.append(titre);
  const { compte, depots, saisie, ouverture } = etat;
  if (etat.telephone === true) {
    racine.append(cree(doc, "p", DEPUIS_UN_ORDINATEUR));
    return racine;
  }
  // Le compte d'abord : sa lecture en route, la connexion qui manque, ou pourquoi il ne se lit pas.
  if (compte === undefined || !("login" in compte)) {
    if (compte !== undefined && "nonConnecte" in compte) racine.append(cree(doc, "p", SANS_COMPTE));
    racine.append(...poserLeCompte(doc, etat, geste));
    return racine;
  }
  const enCours = ouverture !== undefined && ouverture.echec === undefined;
  const attendu = cree(doc, "p", ATTENDU);
  attendu.className = "attendu";
  racine.append(attendu);

  if (depots === undefined) {
    const dit = cree(doc, "p", LECTURE);
    dit.className = "dit";
    dit.role = "status";
    racine.append(dit);
  } else if ("refus" in depots) {
    racine.append(ligneErreur(doc, ILLISIBLES, depots.refus, { classe: "refus" }), gestes(doc, [boutonAction(doc, RELIRE, geste.relire)]));
  } else {
    const recherche = cree(doc, "input");
    recherche.type = "search";
    recherche.className = "recherche";
    recherche.ariaLabel = RECHERCHE;
    recherche.placeholder = RECHERCHE;
    recherche.value = saisie.recherche;
    const liste = cree(doc, "ul");
    liste.className = "depots";
    const poserListe = () => {
      const vus = filtrer(depots.depots, saisie.recherche);
      liste.replaceChildren(
        ...(vus.length === 0
          ? [Object.assign(cree(doc, "li", AUCUN), { className: "aucun" })]
          : vus.map((depot) => {
              const ligne = cree(doc, "li");
              ligne.className = "depot";
              ligne.dataset.depot = depot.depot;
              const choix = boutonAction(doc, depot.depot, () => geste.choisir(depot));
              choix.children[0].disabled = enCours;
              if (ouverture?.depot === depot.depot) choix.children[0].ariaPressed = "true";
              ligne.append(choix);
              return ligne;
            })),
      );
    };
    recherche.addEventListener("input", () => {
      saisie.recherche = recherche.value ?? "";
      poserListe();
    });
    poserListe();
    racine.append(recherche, liste);
  }

  // Un dépôt public qui n'est pas au chef : son lien ou son nom, collé.
  const colle = cree(doc, "input");
  colle.type = "text";
  colle.className = "colle";
  colle.ariaLabel = COLLER;
  colle.placeholder = COLLER;
  colle.value = saisie.colle;
  colle.autocomplete = "off";
  colle.spellcheck = false;
  colle.addEventListener("input", () => void (saisie.colle = colle.value ?? ""));
  const coller = () => {
    if (!enCours) geste.coller(saisie.colle);
  };
  colle.addEventListener("keydown", (/** @type {{ key: string }} */ evenement) => {
    if (evenement.key === "Enter") coller();
  });
  const ajouter = boutonAction(doc, AJOUTER, coller);
  ajouter.children[0].disabled = enCours;
  const ligneDuCollage = cree(doc, "p");
  ligneDuCollage.className = "coller";
  ligneDuCollage.append(colle, ajouter);
  racine.append(ligneDuCollage);
  if (etat.refus !== undefined) racine.append(ligneErreur(doc, phrase(doc, "span", etat.refus), undefined, { classe: "refus", alerte: true }));
  if (ouverture !== undefined && ouverture.station === "") racine.append(...ouvertureDite(doc, ouverture, etat.connexion === undefined ? {} : { connexion: etat.connexion }, geste));
  return racine;
}
