// @ts-check
// Ajouter une station au projet depuis son onglet Stations (ticket 2487, épique 2484), sans passer par l'accueil : l'étape
// « Who cooks this project? ». Cet ordinateur y est le premier choix, recommandé, en un clic ; puis les stations appairées
// du compte à qui le projet n'est pas encore choisi, une par bouton. Chaque choix est un geste que l'app fait déjà : cet
// ordinateur sert le projet comme la case de Settings le fait (`servirUnProjet`, projets-servis/) ; une station appairée
// le reçoit dans sa sélection comme la case de sa page sur l'accueil (`choisirLesProjets`, stations-du-compte.js).
// L'étape « station » du parcours d'ajout d'un projet (épique 2473) n'est pas encore livrée : c'est celle-ci, et ce
// parcours la reprendra telle quelle — `poserEtapeStation` ne connaît ni l'onglet ni le bloc qui la pose.
//
// `tenirLAjoutDeStation` garde l'état du parcours et ses gestes ; `poserEtapeStation` le dessine. Ni l'un ni l'autre ne
// touche `document` : la vue leur donne une fabrique (briques.js) et les gestes du pont.

import { boutonAction, survol } from "../../briques.js";
import { ligneErreur } from "../../composants/ligne-erreur/ligne-erreur.js";
import { ligneVide } from "../../composants/ligne-vide/ligne-vide.js";
import { ENREGISTREMENT, ANNULER } from "../../lexique.js";

/** @typedef {import("../../briques.js").Fabrique} Fabrique */
/** Une station appairée, telle que la lecture du compte la rend. @typedef {import("../../../stations-du-compte.ts").StationEnregistree} Station */
/** @typedef {import("../../../stations-du-compte.ts").Choix} Choix */
/** @typedef {import("../../projets-servis/projets-servis.js").LectureDesProjetsServis} LectureDesProjetsServis */
// L'état du parcours, pour un projet. `ouvert` : l'étape est posée. `enCours` : le choix qui s'écrit — `ICI`, ou l'id
// de la station appairée —, les boutons attendent. `refus` : pourquoi le dernier choix n'a rien écrit. `fait` : le nom
// de la machine qui vient de recevoir le projet.
/** @typedef {{ ouvert: boolean, enCours?: string, refus?: { ligne: string, detail: string }, fait?: string }} EtatDeLAjout */
// Ce que l'étape propose. `ici` : le nom que l'écran donne à cet ordinateur ; `iciOffert` : sa station peut recevoir le
// projet — elle existe, et ne le sert pas déjà. `stations` : les stations appairées à proposer (`stationsAProposer`).
/** @typedef {{ projet: string, ici: string, iciOffert: boolean, stations: readonly Station[] }} DonneesDeLEtape */
/** @typedef {{ servirIci: () => void, confier: (station: Station) => void, annuler: () => void }} GestesDeLEtape */

export const ICI = "ici";
export const TITRE = (/** @type {string} */ projet) => `Who cooks ${projet}? Give it to a station.`;
export const ICI_AIDE = (/** @type {string} */ ici, /** @type {string} */ projet) => `${ici}'s station clones ${projet} here, straight from GitHub, and takes its tickets — at its next turn, within two minutes.`;
export const APPAIREE_AIDE = (/** @type {string} */ nom, /** @type {string} */ projet) => `${projet} is added to the projects ${nom} serves; it reads the change within a minute.`;
export const HORS_LIGNE = "offline: it takes the project once it is back";
export const AUCUNE = (/** @type {string} */ projet) => `No other station to offer: every station of yours already has ${projet}.`;
export const ENVOI = ENREGISTREMENT;
export { ANNULER };
export const FAIT = (/** @type {string} */ nom, /** @type {string} */ projet) => `${nom} was given ${projet}: it shows in this list once it takes it.`;

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
  /** @param {string} pour @param {string} cle @param {string} nom @param {() => Promise<{ refus: string, detail?: string } | object>} ecrire */
  const choix = (pour, cle, nom, ecrire) => {
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
        poser(pour, { ouvert: false, fait: nom });
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
    confier: (pour, depot, station) => choix(pour, station.id, station.name, () => choisir(station.id, [...(station.selection ?? []), depot])),
  };
}

// L'étape : en tête, ce qu'on attend du chef ; cet ordinateur d'abord, recommandé ; puis les stations appairées — une
// hors ligne le dit ; aucun choix, une ligne le dit. Un choix qui s'écrit grise les boutons ; un refus se dit en une ligne,
// sa suite au survol. `cancel` referme sans rien écrire.
/** @param {Fabrique} doc @param {DonneesDeLEtape} donnees @param {EtatDeLAjout} etat @param {GestesDeLEtape} gestes */
export function poserEtapeStation(doc, { projet, ici, iciOffert, stations }, etat, gestes) {
  const racine = doc.createElement("section");
  racine.className = "etape-station";
  racine.ariaLabel = "Add a station";
  const attendu = doc.createElement("p");
  attendu.className = "attendu";
  attendu.textContent = TITRE(projet);
  racine.append(attendu);

  const choix = doc.createElement("ul");
  choix.className = "choix-de-station";
  /** @param {string} cle @param {string} libelle @param {() => void} geste @param {string} aide @param {{ recommande?: boolean, dit?: string }} [options] */
  const unChoix = (cle, libelle, geste, aide, { recommande = false, dit } = {}) => {
    const ligne = doc.createElement("li");
    ligne.dataset.choix = cle;
    const action = boutonAction(doc, libelle, geste, { recommande });
    action.children[0].disabled = etat.enCours !== undefined;
    ligne.append(action, survol(doc, aide));
    if (etat.enCours === cle) ligne.append(Object.assign(doc.createElement("span"), { className: "dit", textContent: ENVOI }));
    else if (dit !== undefined) ligne.append(Object.assign(doc.createElement("span"), { className: "dit", textContent: dit }));
    choix.append(ligne);
  };
  if (iciOffert) unChoix(ICI, ici, gestes.servirIci, ICI_AIDE(ici, projet), { recommande: true });
  for (const station of stations) unChoix(station.id, station.name, () => gestes.confier(station), APPAIREE_AIDE(station.name, projet), station.available ? {} : { dit: HORS_LIGNE });
  if (choix.children.length > 0) racine.append(choix);
  else racine.append(ligneVide(doc, AUCUNE(projet), { classe: "aucune" }));

  if (etat.refus !== undefined) {
    racine.append(ligneErreur(doc, etat.refus.ligne, etat.refus.detail, { classe: "refus" }));
  }
  const pied = doc.createElement("p");
  pied.className = "gestes";
  const annuler = boutonAction(doc, ANNULER, gestes.annuler);
  annuler.children[0].disabled = etat.enCours !== undefined;
  pied.append(annuler);
  racine.append(pied);
  return racine;
}
