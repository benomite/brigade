// @ts-check
// Le parcours d'ajout d'un projet (ticket 2475, épique 2473) : un seul écran, ses étapes dans l'ordre, une par
// fichier. Le premier lancement (premier-lancement.js) et l'écran d'ajout (#ajout, vue.js) le montent tous deux :
// même écran, mêmes étapes, mêmes mots — le premier lancement y ajoute sa phrase d'accueil, et rien d'autre.
// En tête, « Add a project » ; puis chaque étape, numérotée, avec son état : faite, courante — la première qui ne
// l'est pas, sous un trait de l'accent —, ou à venir, dites des mots du parcours d'un projet neuf (onboarding/). Seules la faite et la courante se déplient.
// Ce module ne touche pas `document` : il reçoit de quoi créer un élément (briques.js), et rend des éléments.

import { ETATS_D_ETAPE } from "../onboarding/parcours.js";
import { etapeDuCompte } from "./compte.js";

/** @typedef {import("../briques.js").Fabrique} Fabrique */
/**
 * Ce que le parcours tient. `compte` : le compte GitHub de cet ordinateur — absent, sa lecture est en route ;
 * `connexion` : la connexion à GitHub lancée — la même partout dans l'app (connexion.js).
 * @typedef {{ compte?: import("../../connexion-github.ts").CompteGitHub, connexion?: import("./connexion.js").Connexion }} EtatDuParcours
 */
/**
 * Les gestes du parcours. `changerDeCompte` : se connecter d'un autre compte — le compte est relu au bout.
 * @typedef {{
 *   seConnecter: () => void,
 *   changerDeCompte: () => void,
 *   relireLeCompte: () => void,
 *   ouvrirLaPage: (url: string) => void,
 * }} GestesDuParcours
 */
/**
 * Une étape : son nom, son titre, si elle est faite, et ce qu'elle pose sous son titre.
 * @typedef {{
 *   id: string,
 *   titre: string,
 *   faite: (etat: EtatDuParcours) => boolean,
 *   poser: (doc: Fabrique, etat: EtatDuParcours, geste: GestesDuParcours) => any[],
 * }} Etape
 */

// Les étapes du parcours, dans leur ordre. Chacune vit dans son fichier, sous parcours-projet/ ; les suivantes —
// le projet à choisir, la station qui le cuit, le récapitulatif — s'inscrivent ici, à la suite du compte, quand elles
// arrivent (épique 2473). Pour l'heure, le parcours s'arrête au compte.
/** @type {readonly Etape[]} */
export const ETAPES = [etapeDuCompte];

export const TITRE = "Add a project";
export const BIENVENUE = "Welcome to brigade. Add the first project its kitchen will cook.";

/** @param {Fabrique} doc @param {string} balise @param {string} [texte] */
function cree(doc, balise, texte) {
  const pose = doc.createElement(balise);
  if (texte !== undefined) pose.textContent = texte;
  return pose;
}

// L'écran du parcours. `bienvenue` : le premier lancement, qui pose sa phrase d'accueil en tête.
/**
 * @param {Fabrique} doc @param {EtatDuParcours} etat @param {GestesDuParcours} geste
 * @param {{ bienvenue?: boolean, etapes?: readonly Etape[] }} [options]
 */
export function poserParcoursProjet(doc, etat, geste, { bienvenue = false, etapes = ETAPES } = {}) {
  const racine = cree(doc, "section");
  racine.className = "parcours-projet carte";
  racine.ariaLabel = TITRE;
  if (bienvenue) {
    const accueil = cree(doc, "p", BIENVENUE);
    accueil.className = "bienvenue";
    racine.append(accueil);
  }
  const titre = cree(doc, "h2", TITRE);
  titre.className = "attendu";
  const liste = cree(doc, "ol");
  liste.className = "etapes-du-parcours";
  const courante = etapes.findIndex((etape) => !etape.faite(etat));
  etapes.forEach((etape, rang) => {
    const ou = courante === -1 || rang < courante ? "faite" : rang === courante ? "courante" : "a-venir";
    const ligne = cree(doc, "li");
    ligne.className = "etape-du-parcours";
    ligne.classList.toggle("courante", ou === "courante");
    ligne.dataset.etape = etape.id;
    ligne.dataset.etat = ou;
    const tete = cree(doc, "p");
    tete.className = "titre-d-etape";
    const numero = cree(doc, "span", String(rang + 1));
    numero.className = "numero";
    const etatDit = cree(doc, "span", ETATS_D_ETAPE[ou]);
    etatDit.className = "etat";
    tete.append(numero, cree(doc, "strong", etape.titre), etatDit);
    ligne.append(tete);
    if (ou !== "a-venir") {
      const corps = cree(doc, "div");
      corps.className = "corps-d-etape";
      corps.append(...etape.poser(doc, etat, geste));
      ligne.append(corps);
    }
    liste.append(ligne);
  });
  racine.append(titre, liste);
  return racine;
}
