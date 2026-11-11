// @ts-check
// Donner le projet à une station depuis son onglet Stations (ticket 2487, épique 2484), sans passer par l'accueil : le
// choix « Choose who cooks it » de l'onglet (stations-tab/, ticket 3195). Cet ordinateur y est le premier choix ; puis les
// stations appairées du compte à qui le projet n'est pas encore choisi. Chaque choix est un geste que l'app fait déjà : cet
// ordinateur sert le projet comme la case de Settings le fait (`servirUnProjet`, projets-servis/) ; une station appairée
// le reçoit dans sa sélection comme la case de sa page sur l'accueil (`choisirLesProjets`, stations-du-compte.js).
//
// `tenirLAjoutDeStation` garde l'état du choix et ses gestes ; l'onglet le dessine (stations-tab/choix.js). Ce module ne
// touche pas `document`.

import { AU_RETOUR } from "../../choix-station/choix-station.js";

/** Une station appairée, telle que la lecture du compte la rend. @typedef {import("../../../stations-du-compte.ts").StationEnregistree} Station */
/** @typedef {import("../../../stations-du-compte.ts").Choix} Choix */
/** @typedef {import("../../projets-servis/projets-servis.js").LectureDesProjetsServis} LectureDesProjetsServis */
// L'état du parcours, pour un projet. `ouvert` : l'étape est posée. `enCours` : le choix qui s'écrit — `ICI`, ou l'id
// de la station appairée —, les boutons attendent. `refus` : pourquoi le dernier choix n'a rien écrit. `fait` : le nom
// de la machine qui vient de recevoir le projet ; `absente` : elle était hors ligne, elle le prend à son retour (ticket 3187).
/** @typedef {{ ouvert: boolean, enCours?: string, refus?: { ligne: string, detail: string }, fait?: string, absente?: true }} EtatDeLAjout */
// Ce que l'étape propose. `ici` : le nom que l'écran donne à cet ordinateur ; `iciOffert` : sa station peut recevoir le
// projet — elle existe, et ne le sert pas déjà. `stations` : les stations appairées à proposer (`stationsAProposer`).
/** @typedef {{ projet: string, ici: string, iciOffert: boolean, stations: readonly Station[] }} DonneesDeLEtape */
/** @typedef {{ servirIci: () => void, confier: (station: Station) => void, annuler: () => void }} GestesDeLEtape */

// La clé du choix de cet ordinateur : celle du choix de station (stations-tab/choix.js).
export const ICI = "ici";
export const FAIT = (/** @type {string} */ nom, /** @type {string} */ projet) => `${nom} was given ${projet}: it gets its card here once it takes it.`;
// Ce que la ligne dit du choix écrit : la station hors ligne le prend à son retour (choix-station/).
/** @param {EtatDeLAjout} etat @param {string} projet */
export const FAIT_DIT = ({ fait = "", absente }, projet) => (absente ? AU_RETOUR(fait, projet) : FAIT(fait, projet));

// Les stations appairées à proposer : celles à qui le projet n'est pas encore choisi — le dépôt sans égard à la casse,
// comme GitHub —, hors celle de cet ordinateur (`locale`), que l'étape propose à part, en tête.
/** @param {readonly Station[]} stations @param {string} depot @param {string | null | undefined} locale @returns {Station[]} */
export function stationsAProposer(stations, depot, locale) {
  const cible = depot.toLowerCase();
  return stations.filter(({ id, selection }) => id !== locale && !(selection ?? []).some((choisi) => choisi.toLowerCase() === cible));
}

// L'état du parcours et ses gestes. `servirIci(depot)` : la station de cet ordinateur sert le dépôt. `choisir(id, depots)`
// : la sélection entière d'une station appairée s'écrit. `rendre` : l'état a changé, l'onglet se redessine. Un seul
// projet à la fois : en ouvrir un autre referme le précédent.
/**
 * @param {{
 *   servirIci: (depot: string) => Promise<LectureDesProjetsServis>,
 *   choisir: (id: string, depots: string[]) => Promise<Choix>,
 *   rendre: () => void,
 * }} options
 */
export function tenirLAjoutDeStation({ servirIci, choisir, rendre }) {
  let projet = "";
  /** @type {EtatDeLAjout} */
  let etat = { ouvert: false };

  /** @param {string} pour @param {EtatDeLAjout} neuf */
  const poser = (pour, neuf) => {
    projet = pour;
    etat = neuf;
    rendre();
  };
  // Un choix à la fois : tant qu'il s'écrit, les autres attendent. Écrit, l'étape se referme et dit qui a reçu le projet.
  /** @param {string} pour @param {string} cle @param {string} nom @param {() => Promise<{ refus: string, detail?: string } | object>} ecrire @param {boolean} [absente] */
  const choix = (pour, cle, nom, ecrire, absente = false) => {
    if (projet !== pour || !etat.ouvert || etat.enCours !== undefined) return;
    poser(pour, { ouvert: true, enCours: cle });
    void ecrire()
      .catch((erreur) => ({ refus: "the app failed while saving", detail: erreur instanceof Error ? erreur.message : String(erreur) }))
      .then((rendu) => {
        if (projet !== pour) return;
        if ("refus" in rendu) {
          const [ligne = rendu.refus, ...suite] = rendu.refus.replace(/^brigade: /, "").split(" — ");
          return poser(pour, { ouvert: true, refus: { ligne: `nothing was written: ${ligne.replace(/^not saved: /, "")}`, detail: [...suite, ...("detail" in rendu && rendu.detail !== undefined ? [rendu.detail] : [])].join(" — ") } });
        }
        poser(pour, { ouvert: false, fait: nom, ...(absente ? { absente: /** @type {const} */ (true) } : {}) });
      });
  };

  return {
    /** @param {string} pour @returns {EtatDeLAjout} */
    etatDe: (pour) => (pour === projet ? etat : { ouvert: false }),
    /** @param {string} pour */
    ouvrir: (pour) => poser(pour, { ouvert: true }),
    /** @param {string} pour */
    annuler: (pour) => {
      if (pour === projet && etat.enCours === undefined) poser(pour, { ouvert: false });
    },
    /** @param {string} pour @param {string} depot @param {string} ici */
    servirIci: (pour, depot, ici) => choix(pour, ICI, ici, () => servirIci(depot)),
    /** @param {string} pour @param {string} depot @param {Station} station */
    confier: (pour, depot, station) => choix(pour, station.id, station.name, () => choisir(station.id, [...(station.selection ?? []), depot]), !station.available),
  };
}
