// @ts-check
// La rangée de réglage de l'app (ticket 2920, maquette `Components.dc.html` de docs/maquettes/app/) : chaque réglage de
// chaque écran — Settings, l'onglet Stations, le bandeau de santé, la page d'une station — passe par ici. Une rangée dit
// son nom et la marque de son niveau (levels.js), sa valeur en vigueur, son contrôle, puis, dessous, ce que le dernier
// changement a rendu. Il n'y a pas de « Save » : un contrôle s'applique dès qu'il change (`change` d'un champ, d'une
// liste, d'une case). Un réglage gardé dans le dépôt du projet (niveau « project ») ouvre une pull request quand il
// change, et sa rangée le dit en une ligne, sous son contrôle. Sa peau est dans `setting.css`, à côté, qui ne nomme aucun
// écran : un écran ne pose que sa place.
// Ce module ne touche pas `document` : il reçoit de quoi créer un élément, la vue lui donne le sien et les tests un faux.

import { buttonAction } from "../../bricks.js";
import { lineError } from "../line-error/line-error.js";

/** @typedef {{ createElement(balise: string): any }} Fabrique */
/**
 * Ce que le dernier changement a rendu : la PR ouverte — la valeur qu'elle propose —, ce qui est fait, un changement en
 * route, ou le refus et son détail.
 * @typedef {{ pr: string, numero: number, valeur?: string } | { fait: string } | { enCours: string } | { refus: string, detail?: string }} Says
 */

// La ligne d'une rangée gardée dans le dépôt : changer la valeur ouvre une PR, qui vaut une fois mergée.
export const PAR_PR = "a change opens a pull request, applied once merged";
// Ce qu'une rangée gardée dans le dépôt dit de la PR qu'elle a ouverte.
export const PROPOSES = "proposed in";

/**
 * Une rangée. `niveau` : la marque de son niveau (niveauDe) — « project » la dit gardée dans le dépôt, sauf `depot`
 * explicite. `valeur` : ce qui est en vigueur. `controle` : ce qui la change, et s'applique dès qu'il change. `dessous` :
 * ce que le contrôle a ouvert ou rendu (une confirmation, `ditDuReglage`). `classe` : le crochet que l'écran et ses tests
 * gardent pour retrouver la rangée (il ne porte aucune règle de rangée).
 * @param {Fabrique} doc
 * @param {{ nom: string, cle?: string, niveau?: any, valeur?: (any | string)[], controle?: any[], depot?: boolean, dessous?: any[], classe?: string }} reglage
 */
export function rowOfSetting(doc, { nom: name, cle: key, niveau: level, valeur: value = [], controle: control = [], depot: repository, dessous: below = [], classe }) {
  const row = doc.createElement("div");
  row.className = classe === undefined || classe === "" ? "reglage" : `reglage ${classe}`;
  if (key !== undefined) row.dataset.cle = key;
  const named = doc.createElement("span");
  named.className = "nom";
  named.textContent = name;
  if (level !== undefined) named.append(level);
  const isWorth = doc.createElement("p");
  isWorth.className = "valeur";
  isWorth.append(...value);
  const field = doc.createElement("div");
  field.className = "champ";
  field.append(...control);
  row.append(named, isWorth, field);
  if (repository ?? level?.dataset?.niveau === "project") {
    row.dataset.depot = "";
    const line = doc.createElement("p");
    line.className = "par-pr";
    line.textContent = PAR_PR;
    row.append(line);
  }
  row.append(...below);
  return row;
}

// Ce que le dernier changement d'une rangée a rendu, sous elle — rien quand il n'a rien rendu. La PR ouverte se dit avec
// le bouton qui l'ouvre ; un refus est la ligne d'erreur (components/line-error), son détail au survol, lue d'office aux
// lecteurs d'écran : c'est l'échec du geste qu'on vient de faire.
/** @param {Fabrique} doc @param {Says | undefined} said @param {{ ouvrir?: (url: string) => void }} [gestes] @returns {any[]} */
export function saysOfSetting(doc, said, { ouvrir: open } = {}) {
  if (said === undefined) return [];
  if ("refus" in said) return said.refus === "" ? [] : [lineError(doc, said.refus, said.detail ?? "", { classe: "dit refus", alerte: true })];
  const line = doc.createElement("p");
  if ("enCours" in said) {
    line.className = "dit en-cours";
    line.textContent = said.enCours;
    return [line];
  }
  if ("fait" in said) {
    line.className = "dit fait";
    line.textContent = said.fait;
    return [line];
  }
  line.className = "dit propose";
  const text = doc.createElement("span");
  text.textContent = said.valeur === undefined || said.valeur === "" ? PROPOSES : `${said.valeur} ${PROPOSES}`;
  const link = buttonAction(doc, `pull request #${said.numero}`, () => open?.(said.pr), { sorte: "discret" });
  link.className = "action ouvrir-la-pr";
  if (link.children[0] !== undefined) link.children[0].title = said.pr;
  line.append(text, link);
  return [line];
}
