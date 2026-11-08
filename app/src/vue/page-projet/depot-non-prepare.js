// @ts-check
// L'avis d'un projet qui n'est pas préparé pour Brigade (ticket 2628, épique 2584) : sur sa page et dans son TODO, une
// phrase — ce qui manque — et un seul bouton, le geste de l'ajout d'un projet (`runRepoSetup`). Un projet préparé n'a
// rien de nouveau : aucun avis. `/brigade:init` n'est jamais montré.
//
// Pendant la préparation, le bouton attend et l'avis dit qu'elle est en route ; ratée, il dit en une phrase pourquoi
// et « Retry » est rendu. Réussie, l'avis s'en va sans recharger : la vue le retire à la lecture qui suit.
//
// Ce module ne touche pas `document` : il reçoit de quoi créer un élément (briques.js) et ce que le clic appelle, et
// rend des éléments. La vue tient l'état, projet par projet.

import { boutonAction, survol } from "./../briques.js";
import { ligneErreur } from "../composants/ligne-erreur/ligne-erreur.js";

/** @typedef {import("./../briques.js").Fabrique} Fabrique */
/** @typedef {{ ready: boolean, missingBindings: string[], missingLabels: string[] }} Preparation */

// Où l'avis est posé : la page du projet, ou son TODO.
/** @typedef {"page" | "todo"} Lieu */

// L'état d'un projet, vu d'ici.
//   inconnu     la préparation n'a pas encore été lue : rien n'est dit
//   prepare     rien ne manque : rien n'est dit
//   manque      il manque quelque chose (`verif`) : le bouton attend le chef
//   en-route    la préparation est en route : le bouton attend
//   refus       elle a raté (`dit`, une phrase) : le bouton est rendu pour réessayer
/**
 * @typedef {{ etape: "inconnu" }
 *   | { etape: "prepare" }
 *   | { etape: "manque", verif: Preparation }
 *   | { etape: "en-route", verif: Preparation }
 *   | { etape: "refus", verif: Preparation, dit: string }} Etat
 */

/** @type {Etat} */
export const INCONNU = { etape: "inconnu" };

export const PREPARER = "Set up for Brigade";
export const REESSAYER = "Retry";
export const EN_ROUTE = "setting the project up…";
export const TITRE = "this project is not set up for Brigade";

/** @param {number} n @param {string} mot */
const compte = (n, mot) => `${n} ${mot}${n === 1 ? "" : "s"}`;

// L'état qui suit la lecture de la préparation.
/** @param {Preparation} verif @returns {Etat} */
export function apresLaLecture(verif) {
  return verif.ready ? { etape: "prepare" } : { etape: "manque", verif };
}

// La phrase de ce qui manque ; les noms sont au survol (`detailDuManque`).
/** @param {Preparation} verif */
export function phraseDuManque({ missingBindings, missingLabels }) {
  const parts = [
    ...(missingBindings.length > 0 ? [compte(missingBindings.length, "binding")] : []),
    ...(missingLabels.length > 0 ? [compte(missingLabels.length, "label")] : []),
  ];
  return `Not set up for Brigade: ${parts.length === 0 ? "its setup is incomplete" : `${parts.join(" and ")} missing`}.`;
}

/** @param {Preparation} verif */
export const detailDuManque = ({ missingBindings, missingLabels }) =>
  [...(missingBindings.length > 0 ? [`bindings: ${missingBindings.join(", ")}`] : []), ...(missingLabels.length > 0 ? [`labels: ${missingLabels.join(", ")}`] : [])].join(" — ");

// La phrase d'un refus : une seule, jamais le détail brut d'une erreur.
/** @param {unknown} erreur */
export function phraseDuRefus(erreur) {
  const brut = (erreur instanceof Error ? erreur.message : typeof erreur === "string" ? erreur : "").trim();
  const phrase = brut.split(/\r?\n/)[0] ?? "";
  return phrase === "" ? "The setup failed." : phrase;
}

/** @param {Fabrique} doc @param {string} balise @param {string} [texte] */
function cree(doc, balise, texte) {
  const pose = doc.createElement(balise);
  if (texte !== undefined) pose.textContent = texte;
  return pose;
}

// L'avis dans son état, ou rien : un projet préparé, ou pas encore lu, ne montre rien.
/** @param {Fabrique} doc @param {Lieu} lieu @param {Etat} etat @param {() => void} preparer @returns {any | undefined} */
export function poserAvisDeDepot(doc, lieu, etat, preparer) {
  if (etat.etape === "inconnu" || etat.etape === "prepare") return undefined;
  const racine = cree(doc, "div");
  racine.className = "avis-depot";
  racine.ariaLabel = TITRE;
  racine.dataset.lieu = lieu;
  racine.dataset.etape = etat.etape;
  const tete = cree(doc, "p");
  tete.className = "dit";
  tete.append(cree(doc, "strong", phraseDuManque(etat.verif)));
  const detail = detailDuManque(etat.verif);
  if (detail !== "") tete.append(survol(doc, detail));
  const controle = cree(doc, "div");
  controle.className = "controle";
  const groupe = boutonAction(doc, etat.etape === "refus" ? REESSAYER : PREPARER, preparer, { recommande: true });
  const bouton = groupe.children?.[0];
  if (bouton !== undefined) {
    bouton.dataset.geste = "preparer-le-depot";
    bouton.disabled = etat.etape === "en-route";
  }
  controle.append(groupe);
  if (etat.etape === "en-route") {
    const part = cree(doc, "span", EN_ROUTE);
    part.className = "en-route";
    controle.append(part);
  }
  if (etat.etape === "refus") {
    controle.append(ligneErreur(doc, etat.dit, "", { classe: "refus", balise: "span", alerte: true }));
  }
  racine.append(tete, controle);
  return racine;
}
