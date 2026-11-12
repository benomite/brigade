// @ts-check
// Un projet dont la mise en place vient de passer, et qu'aucune station ne sert (ticket 3400, épique 3396) : sa page
// demande aussitôt qui le sert. Sans cela, ses tickets `fire` attendent sur le rail sans que rien ne le dise.
//   - Quand : la vue a lu le projet pas préparé pour Brigade (`checkRepoSetup`, ticket 2628), puis préparé — la PR de
//     mise en place mergée (ticket 3170), ou « Set up for Brigade » fait d'ici. Une lecture prête d'emblée ne demande
//     rien : rien n'a été mis en place sous les yeux du chef.
//   - Pas si une station le sert déjà : rien n'est forcé. Tant que ce qui sert le projet n'est pas lu, rien n'est décidé.
//   - Le choix est celui de « qui le cuit » (stations-tab/choix.js, ticket 3195) : cet ordinateur en tête, par le geste
//     de Settings « projects this Mac serves » (`servirUnProjet`, projets-servis/) ; puis les stations du compte.
//   - « not now » range la question : elle ne revient pas tant que l'app tourne.
// Ce module ne touche pas `document` : il reçoit de quoi créer un élément (briques.js), et rend des éléments.

import { boutonAction } from "../briques.js";
import { AU_RETOUR } from "../choix-station/choix-station.js";
import { poserLesChoix } from "../stations-tab/choix.js";

/** @typedef {import("../briques.js").Fabrique} Fabrique */
/** @typedef {import("../stations-tab/choix.js").Choix} Choix */
// Où en est la question d'un projet.
//   a-juger    sa mise en place vient de passer : reste à lire si une station le sert
//   question   aucune ne le sert : la page demande laquelle
//   enCours    le choix s'écrit (`cle` : la machine choisie)
//   refus      il n'a pas été écrit : une ligne, son détail au survol — les boutons sont rendus
//   servi      la machine choisie le sert (`nom`, `ici`, `absente` : choisie hors ligne)
/**
 * @typedef {{ etape: "a-juger" }
 *   | { etape: "question" }
 *   | { etape: "enCours", cle: string }
 *   | { etape: "refus", ligne: string, detail: string }
 *   | { etape: "servi", nom: string, ici: boolean, absente: boolean }} Etat
 */
/** @typedef {{ choisir(choix: Choix): void, ecarter(): void, fermer(): void }} Gestes */

export const QUESTION = (/** @type {string} */ depot) => `Which station serves ${depot}?`;
export const PERSONNE = (/** @type {string} */ depot) => `${depot} is set up for Brigade, but no station serves it: its fire tickets wait on the rail until one does.`;
export const PLUS_TARD = "not now";
export const FERMER = "close";
// Cet ordinateur choisi : sa station relit la liste à son tour suivant, dans les deux minutes (projets-servis/, `AIDE`).
export const SERVI_ICI = (/** @type {string} */ depot) => `This computer serves ${depot}: its station takes its fire tickets at its next turn, within two minutes.`;
export const SERVI_PAR = (/** @type {string} */ nom, /** @type {string} */ depot) => `${depot} is chosen for ${nom}: it serves it once it has read the choice.`;

const PAS_PRET = new Set(["manque", "en-route", "refus"]);

// L'état des questions, projet par projet, le temps que l'app tourne. `rendre` : celle du projet a changé.
/** @param {{ rendre: (projet: string) => void }} options */
export function tenirLesDemandesDeStation({ rendre }) {
  /** @type {Map<string, Etat>} */
  const tenues = new Map();
  // Les projets lus pas préparés, puis ceux dont la question a été rangée : celle-ci ne revient pas.
  /** @type {Set<string>} */
  const pasPrets = new Set();
  /** @type {Set<string>} */
  const ecartes = new Set();
  /** @param {string} projet @param {Etat | undefined} etat */
  const poser = (projet, etat) => {
    if (etat === undefined) tenues.delete(projet);
    else tenues.set(projet, etat);
    rendre(projet);
  };
  return {
    /** @param {string} projet @returns {Etat | undefined} */
    de: (projet) => tenues.get(projet),
    // Ce que la lecture de la mise en place dit du projet (depot-non-prepare.js, `etape`) : pas préparé, il est retenu ;
    // préparé après l'avoir été, la question est à juger.
    /** @param {string} projet @param {string} etape */
    preparation(projet, etape) {
      if (PAS_PRET.has(etape)) pasPrets.add(projet);
      if (etape !== "prepare" || !pasPrets.has(projet)) return;
      pasPrets.delete(projet);
      if (!ecartes.has(projet) && tenues.get(projet) === undefined) poser(projet, { etape: "a-juger" });
    },
    // Ce qui sert le projet est lu : `servi`, une station le sert — rien n'est demandé ; sinon, la question est posée.
    /** @param {string} projet @param {boolean} servi */
    juger(projet, servi) {
      if (tenues.get(projet)?.etape !== "a-juger") return;
      poser(projet, servi ? undefined : { etape: "question" });
    },
    /** @param {string} projet @param {string} cle */
    choisir(projet, cle) {
      const avant = tenues.get(projet)?.etape;
      if (avant === "question" || avant === "refus") poser(projet, { etape: "enCours", cle });
    },
    // Ce que le geste a rendu (`ajouterLaStation`, parcours-premier-projet/) : ajoutée, ou son refus en une ligne.
    /** @param {string} projet @param {"ajoutee" | { ligne: string, detail: string } | string | object} rendu @param {{ nom: string, ici: boolean, absente: boolean }} choisie */
    choisi(projet, rendu, choisie) {
      if (tenues.get(projet)?.etape !== "enCours") return;
      if (rendu === "ajoutee") return poser(projet, { etape: "servi", ...choisie });
      const refus = typeof rendu === "object" && rendu !== null && "ligne" in rendu ? /** @type {{ ligne: string, detail?: string }} */ (rendu) : { ligne: String(rendu), detail: "" };
      poser(projet, { etape: "refus", ligne: refus.ligne, detail: refus.detail ?? "" });
    },
    // « not now » : la question part, et ne revient pas tant que l'app tourne.
    /** @param {string} projet */
    ecarter(projet) {
      ecartes.add(projet);
      poser(projet, undefined);
    },
    // Servi, la confirmation lue : elle part.
    /** @param {string} projet */
    fermer(projet) {
      if (tenues.has(projet)) poser(projet, undefined);
    },
  };
}

/** @param {Fabrique} doc @param {string} balise @param {string} classe @param {string} [texte] */
function cree(doc, balise, classe, texte) {
  const element = doc.createElement(balise);
  if (classe !== "") element.className = classe;
  if (texte !== undefined) element.textContent = texte;
  return element;
}

/** @param {Fabrique} doc @param {any[]} boutons */
function gestes(doc, boutons) {
  const rangee = cree(doc, "div", "gestes");
  rangee.append(...boutons);
  return rangee;
}

// La question, au-dessus du rail : ce qui est attendu, pourquoi en une phrase, un bouton par machine — cet ordinateur en
// tête —, et « not now ». Servi : une phrase, et « close ». `etat` n'est jamais `a-juger` ici : rien ne se pose encore.
/** @param {Fabrique} doc @param {{ depot: string, etat: Exclude<Etat, { etape: "a-juger" }>, choix: readonly Choix[] }} donnees @param {Gestes} geste */
export function poserLaDemandeDeStation(doc, { depot, etat, choix }, geste) {
  const racine = cree(doc, "section", "installation-projet carte");
  racine.ariaLabel = QUESTION(depot);
  racine.dataset.etape = etat.etape;
  if (etat.etape === "servi") {
    const dit = etat.absente ? AU_RETOUR(etat.nom, depot) : etat.ici ? SERVI_ICI(depot) : SERVI_PAR(etat.nom, depot);
    racine.append(cree(doc, "p", "phrase", dit), gestes(doc, [boutonAction(doc, FERMER, geste.fermer)]));
    return racine;
  }
  const enCours = etat.etape === "enCours" ? etat.cle : undefined;
  const refus = etat.etape === "refus" ? { ligne: etat.ligne, detail: etat.detail } : undefined;
  const plusTard = boutonAction(doc, PLUS_TARD, geste.ecarter, { sorte: "discret" });
  const bouton = plusTard.children?.[0];
  if (bouton !== undefined) bouton.disabled = enCours !== undefined;
  // Les machines, puis « not now » sur la même ligne ; un refus, dessous.
  const [liste, ...dessous] = poserLesChoix(doc, { choix, ...(enCours === undefined ? {} : { enCours }), ...(refus === undefined ? {} : { refus }) }, geste.choisir);
  racine.append(cree(doc, "h2", "attendu", QUESTION(depot)), cree(doc, "p", "phrase", PERSONNE(depot)), gestes(doc, [liste, plusTard]), ...dessous);
  return racine;
}
