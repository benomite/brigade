// @ts-check
// Ajouter une station au projet depuis son onglet Stations (ticket 2487, épique 2484), sans passer par l'accueil. Le
// parcours n'a pas d'étape à lui : il pose celle du parcours d'ajout d'un projet (« Who cooks this project? », ticket 2477,
// épique 2473 — `poserEtapeStation` de parcours-projet/etape-station.js), que la vue lui passe en `etape`. Cet
// ordinateur y est donc proposé d'abord, en un clic, puis les stations appairées du compte, et le projet leur est confié
// par les mêmes gestes (`servirIci`, `choisir`).
// Ce que ce module ajoute à l'étape : la phrase de tête, qui dit le projet ; les stations qui le cuisent déjà ne se
// proposent pas une seconde fois — cet ordinateur compris ; et `cancel`, qui referme le parcours sans rien écrire.
// Ce module ne touche pas `document` : il reçoit de quoi créer un élément (briques.js) et rend des éléments.

import { boutonAction } from "../../briques.js";

/** @typedef {import("../../briques.js").Fabrique} Fabrique */
/** Une station appairée, telle que la lecture du compte la rend. @typedef {import("../../../stations-du-compte.ts").StationEnregistree} Station */
/** @typedef {import("../../../stations-du-compte.ts").Choix} Choix */
/** @typedef {import("../../projets-servis/projets-servis.js").LectureDesProjetsServis} LectureDesProjetsServis */
/**
 * L'étape « station » du parcours d'ajout d'un projet, telle que `poserEtapeStation` la reçoit.
 * @typedef {{
 *   depot: string,
 *   ici: string,
 *   nomIci?: string,
 *   stations?: readonly Station[] | { refus: string },
 *   servirIci?: (depot: string) => Promise<LectureDesProjetsServis>,
 *   choisir: (id: string, depots: string[]) => Promise<Choix>,
 *   suivante: (nom: string) => void,
 * }} DonneesDeLEtape
 * @typedef {(doc: Fabrique, donnees: DonneesDeLEtape) => any} Etape
 */

export const TITRE = (/** @type {string} */ projet) => `Add a station to ${projet}'s kitchen.`;
export const ANNULER = "cancel";
export const TOUTES_Y_SONT = "Every station of yours already cooks it.";

// Les stations du compte qui ne cuisent pas encore le projet : `servantes`, les noms de celles qui le font — sans égard
// à la casse, comme le nom qu'en donne la principale.
/** @param {readonly Station[]} stations @param {readonly string[]} servantes @returns {Station[]} */
export function stationsAProposer(stations, servantes) {
  const deja = new Set(servantes.map((nom) => nom.toLowerCase()));
  return stations.filter(({ name }) => !deja.has(name.toLowerCase()));
}

// Le parcours. `projet` : son nom ; `depot` : son dépôt, que la station choisie recevra. `ici`, `nomIci`, `stations`,
// `servirIci` et `choisir` : ce que l'étape reçoit (etape-station.js). `servantes` : les noms des stations qui cuisent
// déjà le projet ; cet ordinateur parmi elles, il ne se propose pas. `fini(nom)` : la machine `nom` a reçu le projet.
// `annuler()` : le chef referme le parcours.
/**
 * @param {Fabrique} doc
 * @param {{
 *   projet: string,
 *   depot: string,
 *   ici: string,
 *   nomIci?: string,
 *   stations?: readonly Station[] | { refus: string },
 *   servantes: readonly string[],
 *   servirIci?: (depot: string) => Promise<LectureDesProjetsServis>,
 *   choisir: (id: string, depots: string[]) => Promise<Choix>,
 *   etape: Etape,
 *   fini: (nom: string) => void,
 *   annuler: () => void,
 * }} donnees
 */
export function poserAjoutStation(doc, { projet, depot, ici, nomIci, stations, servantes, servirIci, choisir, etape, fini, annuler }) {
  const racine = doc.createElement("section");
  racine.className = "ajout-station";
  racine.ariaLabel = "Add a station";
  const attendu = doc.createElement("p");
  attendu.className = "attendu";
  attendu.textContent = TITRE(projet);
  racine.append(attendu);

  const deja = new Set(servantes.map((nom) => nom.toLowerCase()));
  const iciCuitDeja = nomIci !== undefined && deja.has(nomIci.toLowerCase());
  const proposees = stations === undefined || !Array.isArray(stations) ? stations : stationsAProposer(/** @type {readonly Station[]} */ (stations), servantes);
  const servirDIci = iciCuitDeja ? undefined : servirIci;
  if (servirDIci === undefined && Array.isArray(proposees) && proposees.length === 0) {
    const toutes = doc.createElement("p");
    toutes.className = "toutes";
    toutes.textContent = TOUTES_Y_SONT;
    racine.append(toutes);
  } else {
    racine.append(
      etape(doc, {
        depot,
        ici,
        ...(nomIci === undefined ? {} : { nomIci }),
        ...(proposees === undefined ? {} : { stations: proposees }),
        ...(servirDIci === undefined ? {} : { servirIci: servirDIci }),
        choisir,
        suivante: fini,
      }),
    );
  }
  const gestes = doc.createElement("p");
  gestes.className = "gestes";
  gestes.append(boutonAction(doc, ANNULER, annuler));
  racine.append(gestes);
  return racine;
}
