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
// Le parcours l'inscrit à la suite par `etapeDeLaStation`, à la forme de ses autres étapes (parcours.js, ticket 2475) :
// faite quand une machine a reçu le projet.
// Tout est écrit par le process principal : ce module reçoit `servirIci` et `choisir`, ne touche pas `document` — il
// reçoit de quoi créer un élément (briques.js) — et rend des éléments.

import { boutonAction, survol } from "../briques.js";
import { ligneErreur } from "../composants/ligne-erreur/ligne-erreur.js";
import { refusDit } from "../projets-servis/projets-servis.js";
import { uneLigneParMachine } from "../stations-du-compte.js";

/** @typedef {import("../briques.js").Fabrique} Fabrique */
/** @typedef {import("../projets-servis/projets-servis.js").LectureDesProjetsServis} LectureDesProjetsServis */
/** @typedef {import("../../stations-du-compte.ts").Choix} Choix */
/** Une station appairée, telle que la lecture du compte la rend. @typedef {import("../../stations-du-compte.ts").StationEnregistree} Station */

export const TITRE = "The station that cooks it";
export const ATTENDU = "Who cooks this project?";
export const AUTRES = "or one of your stations:";
export const ICI_DIT = "stops when you close the app on this computer";
export const EN_LIGNE = "online";
export const HORS_LIGNE = "offline";
export const HORS_LIGNE_DIT = "It cooks the project once it is back online.";
export const EN_COURS = "saving…";
export const ILLISIBLES = "your stations could not be read";
export const LECTURE = "Reading your stations…";
export const INJOIGNABLE = (/** @type {string} */ nom) => `${nom} could not be given the project.`;
export const EN_ATTENTE = "Once the project is added, pick here who cooks it.";
export const CUIT_PAR = (/** @type {string} */ nom, /** @type {string} */ depot) => `${nom} cooks ${depot}.`;

// La sélection d'une station une fois le dépôt confié : la sienne, le dépôt ajouté à la fin — s'il n'y est pas déjà, sans
// égard à la casse, comme GitHub.
/** @param {readonly string[] | null} selection @param {string} depot */
export function selectionAvec(selection, depot) {
  const tenue = selection ?? [];
  if (tenue.some((une) => une.toLowerCase() === depot.toLowerCase())) return [...tenue];
  return [...tenue, depot];
}

// Les stations proposées après cet ordinateur : une par machine, dans l'ordre des noms (`uneLigneParMachine`), sans
// cet ordinateur lui-même — sa station (`locale`, l'id que GitHub publie pour elle) est enregistrée sous le compte comme
// les autres, et il est déjà proposé en tête ; un vieil enregistrement de la même machine, sous son nom, non plus.
/** @param {readonly Station[]} stations @param {string} [locale] @returns {Station[]} */
export function stationsProposees(stations, locale) {
  const ici = stations.find(({ id }) => id === locale)?.name.toLowerCase();
  return uneLigneParMachine([], stations).flatMap((ligne) =>
    "enregistree" in ligne && ligne.enregistree !== undefined && ligne.enregistree.id !== locale && ligne.enregistree.name.toLowerCase() !== ici ? [ligne.enregistree] : [],
  );
}

/** @param {Fabrique} doc @param {string} balise @param {string} [texte] */
function cree(doc, balise, texte) {
  const pose = doc.createElement(balise);
  if (texte !== undefined) pose.textContent = texte;
  return pose;
}

// L'étape. `depot` : le dépôt que l'étape d'avant vient d'ajouter. `ici` : le nom que l'app donne à cet ordinateur
// (« this Mac », « this PC ») ; `locale`, l'id de sa station, qui ne se propose pas deux fois. `stations` : celles du
// compte, ou `{ refus }` — la lecture a échoué, cet ordinateur reste proposé —, ou rien : la lecture est en route, cet
// ordinateur est déjà proposé. `servirIci(depot)` : la station de cet
// ordinateur le sert ; absent, cet appareil n'a pas de station (un téléphone). `choisir(id, depots)` écrit la sélection
// d'une station. `suivante(nom)` : la machine `nom` a reçu le projet, le parcours passe à l'étape d'après.
/**
 * @param {Fabrique} doc
 * @param {{
 *   depot: string,
 *   ici: string,
 *   locale?: string,
 *   stations?: readonly Station[] | { refus: string },
 *   servirIci?: (depot: string) => Promise<LectureDesProjetsServis>,
 *   choisir: (id: string, depots: string[]) => Promise<Choix>,
 *   suivante: (nom: string) => void,
 * }} donnees
 */
export function poserEtapeStation(doc, { depot, ici, locale, stations, servirIci, choisir, suivante }) {
  const racine = cree(doc, "section");
  racine.className = "etape-station";
  racine.ariaLabel = "Pick the station";
  const attendu = cree(doc, "p", ATTENDU);
  attendu.className = "attendu";

  const etat = cree(doc, "p");
  etat.className = "etat";
  const erreur = ligneErreur(doc, "", "", { classe: "erreur", alerte: true });
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
      else suivante(nom);
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

  if (stations === undefined) {
    const lecture = cree(doc, "p", LECTURE);
    lecture.className = "lecture";
    racine.append(lecture);
  }
  else if (!Array.isArray(stations)) racine.append(ligneErreur(doc, ILLISIBLES, /** @type {{ refus: string }} */ (stations).refus));
  else {
    const proposees = stationsProposees(/** @type {readonly Station[]} */ (stations), locale);
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
          if (station.available) dit.className = "en-ligne";
          else dit.className = "hors-ligne";
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

// L'étape telle que le parcours l'inscrit (parcours.js), à la suite. Elle lit dans l'état du parcours le dépôt ajouté
// (`depot` — absent, aucun projet n'est encore ajouté, une ligne le dit), cet ordinateur (`ici`, `locale`), les
// stations appairées du compte (`appairees`, à la forme de `stations` ci-dessus) et la machine qui a reçu le projet
// (`station` — tenue, l'étape est faite et le dit) ; ses gestes : `servirIci`, `choisir`, et `stationChoisie(nom)`, qui
// tient `station` et passe à la suite. Un parcours monté sans eux n'a pas de dépôt à confier : l'étape y attend.
/**
 * @typedef {{ depot?: string, ici?: string, locale?: string, appairees?: readonly Station[] | { refus: string }, station?: string }} EtatPourLaStation
 * @typedef {{
 *   servirIci?: (depot: string) => Promise<LectureDesProjetsServis>,
 *   choisir?: (id: string, depots: string[]) => Promise<Choix>,
 *   stationChoisie?: (nom: string) => void,
 * }} GestesPourLaStation
 */
export const etapeDeLaStation = {
  id: "station",
  titre: TITRE,
  faite: (/** @type {EtatPourLaStation} */ etat) => etat.station !== undefined,
  /** @param {Fabrique} doc @param {EtatPourLaStation} etat @param {GestesPourLaStation} geste */
  poser: (doc, etat, geste) => {
    const { depot, station } = etat;
    if (depot === undefined || geste.choisir === undefined || geste.stationChoisie === undefined) {
      const attente = cree(doc, "p", EN_ATTENTE);
      attente.className = "dit";
      return [attente];
    }
    if (station !== undefined) {
      const fait = cree(doc, "p", CUIT_PAR(station, depot));
      fait.className = "dit";
      return [fait];
    }
    return [
      poserEtapeStation(doc, {
        depot,
        ici: etat.ici ?? "this computer",
        ...(etat.locale === undefined ? {} : { locale: etat.locale }),
        ...(etat.appairees === undefined ? {} : { stations: etat.appairees }),
        ...(geste.servirIci === undefined ? {} : { servirIci: geste.servirIci }),
        choisir: geste.choisir,
        suivante: geste.stationChoisie,
      }),
    ];
  },
};
