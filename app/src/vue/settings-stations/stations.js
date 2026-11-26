// @ts-check
// Les stations contributrices du projet sous Settings (ticket 2936, épique 2927) : celles qui ont pris un ticket sans avoir
// l'écriture sur le dépôt, une rangée chacune — son nom, son compte et, refusée, « refused ». Le chef en refuse une par
// « Refuse » : elle ne prend plus aucun ticket ; « Accept again » lui rend le rail. Le geste part tout de suite, sans
// « Save » ; refusé par le service, le refus se dit en une ligne sur la rangée, et la rangée reste ce qu'elle était.
//
// Le service a ce contrat : `list()` rend les stations ; `refuse(station)` et `accept(station)` rendent `{ ok: true }` ou
// un refus d'une ligne. Ce module ne touche pas `document` : il reçoit de quoi créer un élément (briques.js), et le
// conteneur où se poser.

import { buttonAction, survol } from "../briques.js";
import { lineError } from "../composants/line-error/line-error.js";
import { lineEmpty } from "../composants/line-empty/line-empty.js";
import { rangeeDeSetting } from "../composants/setting/setting.js";
import { NON_ATTEINT, PAS_ENCORE } from "../lexique.js";

/** @typedef {import("../briques.js").Fabrique} Fabrique */
/** @typedef {{ station: string, login: string | null, refused: boolean }} Station */
/** @typedef {{ ok: true } | { refus: string, detail?: string }} Rendu */
// `list` rend `undefined` quand le pont ne porte pas les stations (un téléphone) : le bloc ne se pose pas ; `{ sans }` quand
// elles ne se lisent pas : le bloc le dit en une ligne.
/** @typedef {{ list(): Promise<Station[] | { sans: string, detail?: string } | undefined>, refuse(station: string): Promise<Rendu>, accept(station: string): Promise<Rendu> }} Service */
/** @typedef {Station & { enCours?: boolean, refus?: { ligne: string, detail: string } }} Rangee */
/** @typedef {{ lecture: "en-cours" } | { lecture: "sans" } | { lecture: "refus", ligne: string, detail: string } | { lecture: "lue", rangees: Rangee[] }} State */

export const TITRE = "contributor stations";
export const MOTS = {
  aide: "Stations run by people without write access to this repository. They claim a ticket with a comment, cook it in their fork and deliver a pull request. A refused station claims no ticket until you accept it again.",
  vide: PAS_ENCORE("contributor station has taken a ticket"),
  refuser: "Refuse",
  reaccepter: "Accept again",
  refusee: "refused",
  indisponible: NON_ATTEINT("contributor stations"),
  rienEnvoye: "nothing was changed: no answer from the service",
};

/** @param {Fabrique} doc @param {string} balise @param {string} [texte] */
function cree(doc, balise, texte) {
  const pose = doc.createElement(balise);
  if (texte !== undefined) pose.textContent = texte;
  return pose;
}

// Une rangée de réglage (composants/setting, ticket 2920) : le nom de la station, son compte et « refused » si elle l'est,
// et le bouton du geste contraire, qui part tout de suite ; dessous, le refus du dernier geste, en une ligne.
/**
 * @param {Fabrique} doc
 * @param {{ rangee: Rangee, gestes: { changer: (rangee: Rangee) => void } }} options
 */
export function poserUneStation(doc, { rangee, gestes: actions }) {
  const account = cree(doc, "span", rangee.login === null ? "" : `@${rangee.login}`);
  account.className = "compte";
  const state = cree(doc, "strong", rangee.refused ? MOTS.refusee : "");
  state.className = "etat";
  const action = buttonAction(doc, rangee.refused ? MOTS.reaccepter : MOTS.refuser, () => actions.changer(rangee));
  action.className = "action changer";
  /** @type {any} */
  const button = action.children[0];
  if (button !== undefined) {
    button.disabled = rangee.enCours === true;
    button.ariaLabel = `${rangee.refused ? "accept again" : "refuse"} ${rangee.station}`;
  }
  const racine = rangeeDeSetting(doc, {
    nom: rangee.station,
    classe: rangee.refused ? "station-contributrice refusee" : "station-contributrice",
    valeur: [account, state],
    controle: [action],
    dessous: rangee.refus === undefined ? [] : [lineError(doc, rangee.refus.ligne, rangee.refus.detail, { classe: "refus", alerte: true })],
  });
  racine.dataset.station = rangee.station;
  if (racine.children[0] !== undefined) racine.children[0].className = "nom mono";
  return racine;
}

// Le bloc : son titre et son aide au survol, puis une rangée par station — ou la ligne vide. Null tant que rien n'est à poser.
/**
 * @param {Fabrique} doc
 * @param {{ etat: State, gestes: { changer: (rangee: Rangee) => void } }} options
 */
export function poserLesStations(doc, { etat: state, gestes: actions }) {
  if (state.lecture === "sans" || state.lecture === "en-cours") return null;
  const section = cree(doc, "section");
  section.className = "stations-contributrices";
  section.ariaLabel = "The project's contributor stations";
  const tete = rangeeDeSetting(doc, { nom: TITRE, classe: "tete" });
  tete.children[0]?.append(survol(doc, MOTS.aide));
  section.append(tete);
  if (state.lecture === "refus") {
    section.append(lineError(doc, state.ligne, state.detail));
    return section;
  }
  if (state.rangees.length === 0) {
    section.append(lineEmpty(doc, MOTS.vide, { classe: "aucune" }));
    return section;
  }
  section.append(...state.rangees.map((rangee) => poserUneStation(doc, { rangee, gestes: actions })));
  return section;
}

/** @param {unknown} error */
const message = (error) => (error instanceof Error ? error.message : String(error));

// Ce qu'une écriture a rendu, lu : `ok`, ou un refus — toute autre réponse est un refus, jamais un succès deviné.
/** @param {unknown} rendu @returns {{ ok: true } | { refus: string, detail: string }} */
export function renduLu(rendu) {
  if (typeof rendu === "object" && rendu !== null) {
    const { ok, refus: refusal, detail } = /** @type {Record<string, unknown>} */ (rendu);
    if (ok === true) return { ok: true };
    // Le refus tient en une ligne : sa première, le reste au survol.
    if (typeof refusal === "string" && refusal.trim() !== "") {
      const [line = "", ...reste] = refusal.trim().split("\n");
      return { refus: line.trim(), detail: [...reste, typeof detail === "string" ? detail : ""].join("\n").trim() };
    }
  }
  return { refus: MOTS.rienEnvoye, detail: rendu === undefined ? "" : JSON.stringify(rendu) };
}

// L'état des stations de chaque projet, d'une ouverture à l'autre, tenu par le conteneur de la page.
/** @type {WeakMap<object, Map<string, State>>} */
const statesDesConteneurs = new WeakMap();

// Monte le bloc dans son conteneur, pour un projet : lit les stations, les pose, et répond au geste. Le conteneur retient le
// projet qu'il montre : une réponse qui arrive pour un autre, quitté depuis, ne s'y pose pas.
/**
 * @param {Fabrique} doc
 * @param {any} conteneur
 * @param {{ projet: string, service: Service }} options
 */
export async function monterLesStations(doc, conteneur, { projet: project, service }) {
  conteneur.dataset.projet = project;
  /** @type {Map<string, State>} */
  const states = statesDesConteneurs.get(conteneur) ?? new Map();
  statesDesConteneurs.set(conteneur, states);
  const poser = () => {
    if (conteneur.dataset.projet !== project) return;
    const pose = poserLesStations(doc, { etat: states.get(project) ?? { lecture: "en-cours" }, gestes: actions });
    conteneur.hidden = pose === null;
    conteneur.replaceChildren(...(pose === null ? [] : [pose]));
  };

  /** @param {Rangee} rangee */
  async function changer(rangee) {
    if (rangee.enCours === true) return;
    rangee.enCours = true;
    rangee.refus = undefined;
    poser();
    /** @type {unknown} */
    let recu;
    try {
      recu = await (rangee.refused ? service.accept(rangee.station) : service.refuse(rangee.station));
    } catch (error) {
      recu = { refus: MOTS.rienEnvoye, detail: message(error) };
    }
    const lu = renduLu(recu);
    rangee.enCours = false;
    if ("ok" in lu) rangee.refused = !rangee.refused;
    else rangee.refus = { ligne: lu.refus, detail: lu.detail };
    poser();
  }

  const actions = { changer: (/** @type {Rangee} */ rangee) => void changer(rangee) };

  poser();
  /** @type {State} */
  let lu;
  try {
    const stations = await service.list();
    if (stations === undefined) lu = { lecture: "sans" };
    else if (!Array.isArray(stations)) lu = { lecture: "refus", ligne: typeof stations?.sans === "string" ? stations.sans : MOTS.indisponible, detail: stations?.detail ?? JSON.stringify(stations) };
    else lu = { lecture: "lue", rangees: stations.map(({ station, login, refused }) => ({ station, login, refused })) };
  } catch (error) {
    lu = { lecture: "refus", ligne: MOTS.indisponible, detail: message(error) };
  }
  states.set(project, lu);
  poser();
}

// Le service tel que le pont le porte : chaque méthode, si le pont l'a ; sans elle, la lecture ne rend rien — le bloc ne se
// pose pas — et un geste le dit en refus.
/**
 * @param {Partial<Pick<import("../pont.d.ts").Pont, "listerLesStationsContributrices" | "refuserUneStationContributrice" | "accepterUneStationContributrice">>} pont
 * @param {string} project
 * @returns {Service}
 */
export function serviceDuPont(pont, project) {
  return {
    list: async () => (typeof pont.listerLesStationsContributrices === "function" ? pont.listerLesStationsContributrices(project) : undefined),
    refuse: async (station) => (typeof pont.refuserUneStationContributrice === "function" ? pont.refuserUneStationContributrice(project, station) : { refus: MOTS.rienEnvoye }),
    accept: async (station) => (typeof pont.accepterUneStationContributrice === "function" ? pont.accepterUneStationContributrice(project, station) : { refus: MOTS.rienEnvoye }),
  };
}
