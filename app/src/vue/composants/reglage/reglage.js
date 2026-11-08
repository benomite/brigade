// @ts-check
// La rangée de réglage de l'app (ticket 2920, maquette `Components.dc.html` de docs/maquettes/app/) : chaque réglage de
// chaque écran — Settings, l'onglet Stations, le bandeau de santé, la page d'une station — passe par ici. Une rangée dit
// son nom et la marque de son niveau (niveaux.js), sa valeur en vigueur, son contrôle, puis, dessous, ce que le dernier
// changement a rendu. Il n'y a pas de « Save » : un contrôle s'applique dès qu'il change (`change` d'un champ, d'une
// liste, d'une case). Un réglage gardé dans le dépôt du projet (niveau « project ») ouvre une pull request quand il
// change, et sa rangée le dit en une ligne, sous son contrôle. Sa peau est dans `reglage.css`, à côté, qui ne nomme aucun
// écran : un écran ne pose que sa place.
// Ce module ne touche pas `document` : il reçoit de quoi créer un élément, la vue lui donne le sien et les tests un faux.

import { boutonAction } from "../../briques.js";
import { ligneErreur } from "../ligne-erreur/ligne-erreur.js";

/** @typedef {{ createElement(balise: string): any }} Fabrique */
/**
 * Ce que le dernier changement a rendu : la PR ouverte — la valeur qu'elle propose —, ce qui est fait, un changement en
 * route, ou le refus et son détail.
 * @typedef {{ pr: string, numero: number, valeur?: string } | { fait: string } | { enCours: string } | { refus: string, detail?: string }} Dit
 */

// La ligne d'une rangée gardée dans le dépôt : changer la valeur ouvre une PR, qui vaut une fois mergée.
export const PAR_PR = "kept in the repository: a change opens a pull request — it applies once merged";
// Ce qu'une rangée gardée dans le dépôt dit de la PR qu'elle a ouverte.
export const PROPOSE = "proposed in";

/**
 * Une rangée. `niveau` : la marque de son niveau (niveauDe) — « project » la dit gardée dans le dépôt, sauf `depot`
 * explicite. `valeur` : ce qui est en vigueur. `controle` : ce qui la change, et s'applique dès qu'il change. `dessous` :
 * ce que le contrôle a ouvert ou rendu (une confirmation, `ditDuReglage`).
 * @param {Fabrique} doc
 * @param {{ nom: string, cle?: string, niveau?: any, valeur?: (any | string)[], controle?: any[], depot?: boolean, dessous?: any[] }} reglage
 */
export function rangeeDeReglage(doc, { nom, cle, niveau, valeur = [], controle = [], depot, dessous = [] }) {
  const rangee = doc.createElement("div");
  rangee.className = "reglage";
  if (cle !== undefined) rangee.dataset.cle = cle;
  const nomme = doc.createElement("span");
  nomme.className = "nom";
  nomme.textContent = nom;
  if (niveau !== undefined) nomme.append(niveau);
  const vaut = doc.createElement("p");
  vaut.className = "valeur";
  vaut.append(...valeur);
  const champ = doc.createElement("div");
  champ.className = "champ";
  champ.append(...controle);
  rangee.append(nomme, vaut, champ);
  if (depot ?? niveau?.dataset?.niveau === "project") {
    rangee.dataset.depot = "";
    const ligne = doc.createElement("p");
    ligne.className = "par-pr";
    ligne.textContent = PAR_PR;
    rangee.append(ligne);
  }
  rangee.append(...dessous);
  return rangee;
}

// Ce que le dernier changement d'une rangée a rendu, sous elle — rien quand il n'a rien rendu. La PR ouverte se dit avec
// le bouton qui l'ouvre ; un refus est la ligne d'erreur (composants/ligne-erreur), son détail au survol.
/** @param {Fabrique} doc @param {Dit | undefined} dit @param {{ ouvrir?: (url: string) => void }} [gestes] @returns {any[]} */
export function ditDuReglage(doc, dit, { ouvrir } = {}) {
  if (dit === undefined) return [];
  if ("refus" in dit) return dit.refus === "" ? [] : [ligneErreur(doc, dit.refus, dit.detail ?? "", { classe: "dit refus" })];
  const ligne = doc.createElement("p");
  if ("enCours" in dit) {
    ligne.className = "dit en-cours";
    ligne.textContent = dit.enCours;
    return [ligne];
  }
  if ("fait" in dit) {
    ligne.className = "dit fait";
    ligne.textContent = dit.fait;
    return [ligne];
  }
  ligne.className = "dit propose";
  const texte = doc.createElement("span");
  texte.textContent = dit.valeur === undefined || dit.valeur === "" ? PROPOSE : `${dit.valeur} ${PROPOSE}`;
  const lien = boutonAction(doc, `pull request #${dit.numero}`, () => ouvrir?.(dit.pr), { sorte: "discret" });
  lien.className = "action ouvrir-la-pr";
  if (lien.children[0] !== undefined) lien.children[0].title = dit.pr;
  ligne.append(texte, lien);
  return [ligne];
}
