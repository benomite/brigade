// @ts-check
// La liste des stations du projet, dans son onglet Stations (ticket 2487, épique 2484). La liste est celle d'aujourd'hui,
// telle quelle : la vue lui donne l'élément où elle pose les stations du projet (`poserCuisson`, stations-de-cuisson.js) —
// le même que Cooks, les mêmes lignes, tenu à jour par les mêmes lectures ; ce module ne la redessine pas.
// Dessous, « Add a station » ouvre sur place l'étape « Who cooks this project? » (AjoutStation.js), sans quitter le projet.
// Une machine a reçu le projet : l'étape se referme, une ligne le dit, et la station entre dans la liste quand elle le prend.
// Sans `ajout` — un écran étroit, qui ne règle rien ; un projet dont l'app ne connaît pas le dépôt —, pas de bouton.
// Ce module ne touche pas `document` : il reçoit de quoi créer un élément (briques.js) et rend des éléments.

import { boutonAction } from "../../briques.js";
import { FAIT, poserEtapeStation } from "./AjoutStation.js";

/** @typedef {import("../../briques.js").Fabrique} Fabrique */
/** @typedef {import("./AjoutStation.js").DonneesDeLEtape} DonneesDeLEtape */
/** @typedef {import("./AjoutStation.js").EtatDeLAjout} EtatDeLAjout */
/** @typedef {import("./AjoutStation.js").GestesDeLEtape} GestesDeLEtape */

export const TITRE = "Stations";
export const AJOUTER = "Add a station";

// Le bloc. `liste` : l'élément de la liste d'aujourd'hui. `ajout` : de quoi poser l'étape — ce qu'elle propose, son état,
// ses gestes, et `ouvrir`.
/**
 * @param {Fabrique} doc
 * @param {{ liste?: any, ajout?: { donnees: DonneesDeLEtape, etat: EtatDeLAjout, gestes: GestesDeLEtape & { ouvrir: () => void } } }} [donnees]
 */
export function poserBlocListeStations(doc, { liste, ajout } = {}) {
  const bloc = doc.createElement("section");
  bloc.className = "bloc-du-projet";
  bloc.dataset.bloc = "liste-stations";
  bloc.ariaLabel = TITRE;
  const titre = doc.createElement("h3");
  titre.textContent = TITRE;
  bloc.append(titre);
  if (liste !== undefined) bloc.append(liste);
  if (ajout === undefined) return bloc;

  const { donnees, etat, gestes } = ajout;
  if (etat.ouvert) bloc.append(poserEtapeStation(doc, donnees, etat, gestes));
  else {
    const ouvrir = doc.createElement("p");
    ouvrir.className = "ajouter-une-station";
    ouvrir.append(boutonAction(doc, AJOUTER, gestes.ouvrir));
    if (etat.fait !== undefined) ouvrir.append(Object.assign(doc.createElement("span"), { className: "dit", ariaLive: "polite", textContent: FAIT(etat.fait, donnees.projet) }));
    bloc.append(ouvrir);
  }
  return bloc;
}
