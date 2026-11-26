// @ts-check
// Les projets que sert une station, sur sa page (ticket 3403, épique 3401) : une liste qui se lit seulement. Un projet n'y
// est que si l'onglet Stations du projet montre cette station parmi celles qui le servent (stations-tab/etat.js,
// `servantesDe`) : la page et l'onglet lisent la même liste. Chaque projet est un lien vers cet onglet. Ni case, ni champ,
// ni bouton : ce que la station sert se change depuis l'onglet du projet. Ce module ne touche pas `document` : il reçoit de
// quoi créer un élément.

import { ligneVide } from "../../composants/ligne-vide/ligne-vide.js";
import { nomDePrise } from "../../stations-tab/etat.js";

/** @typedef {import("../../briques.js").Fabrique} Fabrique */
/** @typedef {import("../../stations-tab/etat.js").Servante} Servante */
/** @typedef {{ id: string, nom: string }} StationOuverte */

export const TITRE = "Projects it serves";
export const AUCUN = "This station serves no project yet.";
export const ILLISIBLE = "Its projects cannot be read right now.";

// Les projets dont l'onglet Stations montre la station : `servantes` rend, pour un projet, les cartes de son onglet.
// L'ordre est celui des projets de l'app.
/**
 * @param {StationOuverte} station
 * @param {readonly string[]} projets
 * @param {(projet: string) => readonly Servante[]} servantes
 */
export function projetsServisPar(station, projets, servantes) {
  const prise = nomDePrise(station.nom);
  return projets.filter((projet) => servantes(projet).some((servante) => (servante.id !== "" ? servante.id === station.id : servante.nom === station.nom || servante.prise === prise || nomDePrise(servante.nom) === prise)));
}

// La liste : un lien par projet, vers l'onglet Stations du projet ; ou, sans projet, la phrase qui le dit. `lisible` faux :
// la station ne se lit pas, ce n'est pas qu'elle ne sert rien.
/** @param {Fabrique} doc @param {{ projets: readonly string[], lisible: boolean }} quoi @param {{ ouvrir(projet: string): void }} gestes */
export function poserLesProjetsDeLaStation(doc, { projets, lisible }, gestes) {
  const racine = doc.createElement("section");
  racine.className = "projets-servis-par-la-station";
  const titre = doc.createElement("h3");
  titre.textContent = TITRE;
  racine.append(titre);
  if (!lisible) {
    racine.append(ligneVide(doc, ILLISIBLE));
    return racine;
  }
  if (projets.length === 0) {
    racine.append(ligneVide(doc, AUCUN));
    return racine;
  }
  const liste = doc.createElement("ul");
  for (const projet of projets) {
    const item = doc.createElement("li");
    const lien = doc.createElement("a");
    lien.href = "#";
    lien.className = "mono";
    lien.dataset.projet = projet;
    lien.textContent = projet;
    lien.title = `open the Stations tab of ${projet}`;
    lien.addEventListener("click", (/** @type {{ preventDefault(): void }} */ evenement) => {
      evenement.preventDefault();
      gestes.ouvrir(projet);
    });
    item.append(lien);
    liste.append(item);
  }
  racine.append(liste);
  return racine;
}
