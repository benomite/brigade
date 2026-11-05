// @ts-check
// La liste des stations du projet, dans son onglet Stations (ticket 2487, épique 2484). La liste est celle d'aujourd'hui,
// telle quelle : la vue la pose par `liste()` — le bloc des stations de stations-de-cuisson.js (`poserLesStations`), le
// même élément, les mêmes lignes ; ce module ne la redessine pas. Dessous, `Add a station` ouvre le parcours d'ajout
// (AjoutStation.js) sur place, sans quitter le projet ; la station choisie a reçu le projet, le parcours se referme, la
// vue relit les stations (`relire()`) et la liste se pose de nouveau : la station ajoutée y est.
// Sans `liste`, le bloc n'a que son titre ; sans `ajout` — un appareil qui n'ajoute pas de station, un dépôt inconnu —,
// pas de bouton.
// Ce module ne touche pas `document` : il reçoit de quoi créer un élément (briques.js) et rend des éléments.

import { boutonAction } from "../../briques.js";
import { poserAjoutStation } from "./AjoutStation.js";

/** @typedef {import("../../briques.js").Fabrique} Fabrique */
/** @typedef {Parameters<typeof poserAjoutStation>[1]} DonneesDeLAjout */

export const TITRE = "Stations";
export const AJOUTER = "Add a station";
export const AJOUTEE = (/** @type {string} */ nom) => `${nom} was given the project.`;

// Le bloc. `liste()` : la liste d'aujourd'hui, posée à chaque fois que le bloc se repose. `ajout` : ce que le parcours
// reçoit, moins `fini` et `annuler`, que ce bloc tient, plus `relire()`, qui relit les stations du projet.
/**
 * @param {Fabrique} doc
 * @param {{
 *   liste?: () => any,
 *   ajout?: Omit<DonneesDeLAjout, "fini" | "annuler"> & { relire: () => Promise<void> },
 * }} [donnees]
 */
export function poserBlocListeStations(doc, { liste, ajout } = {}) {
  const bloc = doc.createElement("section");
  bloc.className = "bloc-du-projet";
  bloc.dataset.bloc = "liste-stations";
  bloc.ariaLabel = TITRE;
  const titre = doc.createElement("h3");
  titre.textContent = TITRE;
  const lesStations = doc.createElement("div");
  lesStations.className = "liste-des-stations";
  const ouvrir = doc.createElement("p");
  ouvrir.className = "ajouter-une-station";
  const parcours = doc.createElement("div");
  parcours.className = "parcours-ajout-station";
  const dit = doc.createElement("p");
  dit.className = "dit";
  dit.ariaLive = "polite";
  bloc.append(titre, lesStations, ouvrir, parcours, dit);

  const poserLaListe = () => lesStations.replaceChildren(...(liste === undefined ? [] : [liste()]));
  poserLaListe();
  if (ajout === undefined) return bloc;

  const { relire, ...pourLeParcours } = ajout;
  const fermer = () => {
    parcours.replaceChildren();
    ouvrir.hidden = false;
  };
  // La machine a reçu le projet : le parcours se referme, la ligne le dit, et la liste relue se pose de nouveau.
  const fini = async (/** @type {string} */ nom) => {
    fermer();
    dit.textContent = AJOUTEE(nom);
    try {
      await relire();
    } finally {
      poserLaListe();
    }
  };
  ouvrir.append(
    boutonAction(doc, AJOUTER, () => {
      ouvrir.hidden = true;
      dit.textContent = "";
      parcours.replaceChildren(poserAjoutStation(doc, { ...pourLeParcours, fini: (nom) => void fini(nom), annuler: fermer }));
    }),
  );
  return bloc;
}
