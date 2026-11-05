// @ts-check
// L'étape « station » du parcours d'ajout (ticket 2477, épique 2473), après celle du projet : le dépôt est ajouté, le
// parcours demande « Who cooks this project? ». Cet ordinateur d'abord, en un clic, puis les stations déjà appairées sous
// le compte du chef. Un clic confie le projet à la machine choisie, par la logique de station que l'app a déjà — le chef
// n'ouvre jamais la page d'une station :
//   - cet ordinateur : sa station sert le dépôt (`servirUnProjet(depot, true)`, comme la case de Settings, ticket 2359 —
//     projets-servis.js) ;
//   - une autre station : le dépôt rejoint la sélection écrite dans son gist (`choisirLesProjets`, comme une case cochée
//     sur sa page, ticket 1780 — stations-du-compte.js).
// Confié, le parcours passe à la suite. Refusé, une ligne le dit, son détail au survol, et rien ne bouge. Sans station
// appairée, seul cet ordinateur est proposé.
// Tout est écrit par le process principal : ce module reçoit `servirIci` et `choisir`, ne touche pas `document` — il
// reçoit de quoi créer un élément (briques.js) — et rend des éléments.

import { boutonAction, lectureIndisponible, survol } from "../briques.js";
import { refusDit } from "../projets-servis/projets-servis.js";
import { selectionApres, uneLigneParMachine } from "../stations-du-compte.js";

/** @typedef {import("../briques.js").Fabrique} Fabrique */
/** @typedef {import("../projets-servis/projets-servis.js").LectureDesProjetsServis} LectureDesProjetsServis */
/** @typedef {import("../../stations-du-compte.ts").Choix} Choix */
/** Une station appairée, telle que la lecture du compte la rend. @typedef {import("../../stations-du-compte.ts").StationEnregistree} Station */

export const ATTENDU = "Who cooks this project?";
export const AUTRES = "or one of your stations:";
export const ICI_DIT = "stops when you close the app on this computer";
export const EN_LIGNE = "online";
export const HORS_LIGNE = "offline";
export const HORS_LIGNE_DIT = "It cooks the project once it is back online.";
export const EN_COURS = "saving…";
export const ILLISIBLES = "your stations could not be read";
export const INJOIGNABLE = (/** @type {string} */ nom) => `${nom} could not be given the project.`;

// La sélection d'une station une fois le dépôt confié : la sienne, le dépôt ajouté à la fin — s'il n'y est pas déjà, sans
// égard à la casse, comme GitHub.
/** @param {readonly string[] | null} selection @param {string} depot */
export function selectionAvec(selection, depot) {
  const tenue = selection ?? [];
  if (tenue.some((une) => une.toLowerCase() === depot.toLowerCase())) return [...tenue];
  return selectionApres([...tenue, depot], tenue, depot, true);
}

// Les stations proposées après cet ordinateur : une par machine, dans l'ordre des noms (`uneLigneParMachine`), sans
// cet ordinateur lui-même — sa station est enregistrée sous le compte comme les autres, et il est déjà proposé en tête.
/** @param {readonly Station[]} stations @param {string} [nomIci] @returns {Station[]} */
export function stationsProposees(stations, nomIci) {
  const ici = nomIci?.toLowerCase();
  return uneLigneParMachine([], stations).flatMap((ligne) => ("enregistree" in ligne && ligne.enregistree !== undefined && ligne.enregistree.name.toLowerCase() !== ici ? [ligne.enregistree] : []));
}

/** @param {Fabrique} doc @param {string} balise @param {string} [texte] */
function cree(doc, balise, texte) {
  const pose = doc.createElement(balise);
  if (texte !== undefined) pose.textContent = texte;
  return pose;
}

// L'étape. `depot` : le dépôt que l'étape d'avant vient d'ajouter. `ici` : le nom que l'app donne à cet ordinateur
// (« this Mac », « this PC ») ; `nomIci`, celui de sa station, qui ne se propose pas deux fois. `stations` : celles du
// compte, ou `{ refus }` — la lecture a échoué, cet ordinateur reste proposé. `servirIci(depot)` : la station de cet
// ordinateur le sert ; absent, cet appareil n'a pas de station (un téléphone). `choisir(id, depots)` écrit la sélection
// d'une station. `suivante()` : le parcours passe à l'étape d'après.
/**
 * @param {Fabrique} doc
 * @param {{
 *   depot: string,
 *   ici: string,
 *   nomIci?: string,
 *   stations: readonly Station[] | { refus: string },
 *   servirIci?: (depot: string) => Promise<LectureDesProjetsServis>,
 *   choisir: (id: string, depots: string[]) => Promise<Choix>,
 *   suivante: () => void,
 * }} donnees
 */
export function poserEtapeStation(doc, { depot, ici, nomIci, stations, servirIci, choisir, suivante }) {
  const racine = cree(doc, "section");
  racine.className = "etape-station";
  racine.ariaLabel = "Pick the station";
  const attendu = cree(doc, "p", ATTENDU);
  attendu.className = "attendu";

  const etat = cree(doc, "p");
  etat.className = "etat";
  const erreur = cree(doc, "p");
  erreur.className = "erreur";
  erreur.role = "alert";
  // Un refus : sa ligne, son détail au survol. Rien : la place est vide.
  const dire = (/** @type {string} */ ligne, /** @type {string} */ detail = "") => {
    erreur.replaceChildren(...(ligne === "" ? [] : [cree(doc, "span", ligne)]), ...(detail.trim() === "" ? [] : [survol(doc, detail)]));
  };

  // Un clic à la fois : la machine choisie reçoit le projet, puis la suite ; refusé, la ligne, et rien ne bouge.
  let enCours = false;
  const confier = async (/** @type {string} */ nom, /** @type {() => Promise<{ ligne: string, detail: string } | void>} */ geste) => {
    if (enCours) return;
    enCours = true;
    etat.textContent = EN_COURS;
    dire("");
    try {
      const refus = await geste();
      if (refus !== undefined) dire(refus.ligne, refus.detail);
      else suivante();
    } catch {
      dire(INJOIGNABLE(nom));
    } finally {
      enCours = false;
      etat.textContent = "";
    }
  };

  racine.append(attendu);

  if (servirIci !== undefined) {
    const premier = cree(doc, "div");
    premier.className = "ici";
    premier.dataset.station = "ici";
    const servir = async () => {
      const lu = await servirIci(depot);
      if ("refus" in lu) return refusDit(lu.refus);
    };
    premier.append(boutonAction(doc, ici, () => void confier(ici, servir), { recommande: true }), survol(doc, ICI_DIT));
    racine.append(premier);
  }

  if (!Array.isArray(stations)) racine.append(lectureIndisponible(doc, ILLISIBLES, /** @type {{ refus: string }} */ (stations).refus));
  else {
    const proposees = stationsProposees(/** @type {readonly Station[]} */ (stations), nomIci);
    if (proposees.length > 0) {
      const autres = cree(doc, "p", AUTRES);
      autres.className = "autres";
      const liste = cree(doc, "ul");
      liste.className = "stations";
      liste.append(
        ...proposees.map((station) => {
          const ligne = cree(doc, "li");
          ligne.className = "station";
          ligne.dataset.station = station.name;
          const ecrire = async () => {
            const choix = await choisir(station.id, selectionAvec(station.selection, depot));
            if ("refus" in choix) return { ligne: choix.refus, detail: choix.detail ?? "" };
          };
          const dit = cree(doc, "span", station.available ? EN_LIGNE : HORS_LIGNE);
          dit.className = station.available ? "en-ligne" : "hors-ligne";
          ligne.append(boutonAction(doc, station.name, () => void confier(station.name, ecrire), {}), dit);
          if (!station.available) ligne.append(survol(doc, HORS_LIGNE_DIT));
          return ligne;
        }),
      );
      racine.append(autres, liste);
    }
  }

  racine.append(etat, erreur);
  return racine;
}
