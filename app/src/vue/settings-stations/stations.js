// @ts-check
// Les stations contributrices du projet sous Settings (ticket 2936, épique 2927) : celles qui ont pris un ticket sans avoir
// l'écriture sur le dépôt, une rangée chacune — son nom, son compte et, refusée, « refused ». Le chef en refuse une par
// « Refuse » : elle ne prend plus aucun ticket ; « Accept again » lui rend le rail. Le geste part tout de suite, sans
// « Save » ; refusé par le service, le refus se dit en une ligne sur la rangée, et la rangée reste ce qu'elle était.
//
// Le service a ce contrat : `list()` rend les stations ; `refuse(station)` et `accept(station)` rendent `{ ok: true }` ou
// un refus d'une ligne. Ce module ne touche pas `document` : il reçoit de quoi créer un élément (bricks.js), et le
// conteneur où se poser.

import { buttonAction, hover } from "../bricks.js";
import { lineError } from "../components/line-error/line-error.js";
import { lineEmpty } from "../components/line-empty/line-empty.js";
import { rowOfSetting } from "../components/setting/setting.js";
import { NOT_REACHED, NOT_STILL } from "../lexicon.js";

/** @typedef {import("../bricks.js").Fabrique} Fabrique */
/** @typedef {{ station: string, login: string | null, refused: boolean }} Station */
/** @typedef {{ ok: true } | { refus: string, detail?: string }} Rendered */
// `list` rend `undefined` quand le pont ne porte pas les stations (un téléphone) : le bloc ne se pose pas ; `{ sans }` quand
// elles ne se lisent pas : le bloc le dit en une ligne.
/** @typedef {{ list(): Promise<Station[] | { sans: string, detail?: string } | undefined>, refuse(station: string): Promise<Rendered>, accept(station: string): Promise<Rendered> }} Service */
/** @typedef {Station & { enCours?: boolean, refus?: { ligne: string, detail: string } }} Row */
/** @typedef {{ lecture: "en-cours" } | { lecture: "sans" } | { lecture: "refus", ligne: string, detail: string } | { lecture: "lue", rangees: Row[] }} State */

export const TITLE = "contributor stations";
export const WORDS = {
  aide: "Stations run by people without write access to this repository. They claim a ticket with a comment, cook it in their fork and deliver a pull request. A refused station claims no ticket until you accept it again.",
  vide: NOT_STILL("contributor station has taken a ticket"),
  refuser: "Refuse",
  reaccepter: "Accept again",
  refusee: "refused",
  indisponible: NOT_REACHED("contributor stations"),
  rienEnvoye: "nothing was changed: no answer from the service",
};

/** @param {Fabrique} doc @param {string} balise @param {string} [text] */
function created(doc, balise, text) {
  const pose = doc.createElement(balise);
  if (text !== undefined) pose.textContent = text;
  return pose;
}

// Une rangée de réglage (components/setting, ticket 2920) : le nom de la station, son compte et « refused » si elle l'est,
// et le bouton du geste contraire, qui part tout de suite ; dessous, le refus du dernier geste, en une ligne.
/**
 * @param {Fabrique} doc
 * @param {{ rangee: Row, gestes: { changer: (row: Row) => void } }} options
 */
export function setOneStation(doc, { rangee: row, gestes: actions }) {
  const account = created(doc, "span", row.login === null ? "" : `@${row.login}`);
  account.className = "compte";
  const state = created(doc, "strong", row.refused ? WORDS.refusee : "");
  state.className = "etat";
  const action = buttonAction(doc, row.refused ? WORDS.reaccepter : WORDS.refuser, () => actions.changer(row));
  action.className = "action changer";
  /** @type {any} */
  const button = action.children[0];
  if (button !== undefined) {
    button.disabled = row.enCours === true;
    button.ariaLabel = `${row.refused ? "accept again" : "refuse"} ${row.station}`;
  }
  const root = rowOfSetting(doc, {
    nom: row.station,
    classe: row.refused ? "station-contributrice refusee" : "station-contributrice",
    valeur: [account, state],
    controle: [action],
    dessous: row.refus === undefined ? [] : [lineError(doc, row.refus.ligne, row.refus.detail, { classe: "refus", alerte: true })],
  });
  root.dataset.station = row.station;
  if (root.children[0] !== undefined) root.children[0].className = "nom mono";
  return root;
}

// Le bloc : son titre et son aide au survol, puis une rangée par station — ou la ligne vide. Null tant que rien n'est à poser.
/**
 * @param {Fabrique} doc
 * @param {{ etat: State, gestes: { changer: (row: Row) => void } }} options
 */
export function setTheStations(doc, { etat: state, gestes: actions }) {
  if (state.lecture === "sans" || state.lecture === "en-cours") return null;
  const section = created(doc, "section");
  section.className = "stations-contributrices";
  section.ariaLabel = "The project's contributor stations";
  const head = rowOfSetting(doc, { nom: TITLE, classe: "tete" });
  head.children[0]?.append(hover(doc, WORDS.aide));
  section.append(head);
  if (state.lecture === "refus") {
    section.append(lineError(doc, state.ligne, state.detail));
    return section;
  }
  if (state.rangees.length === 0) {
    section.append(lineEmpty(doc, WORDS.vide, { classe: "aucune" }));
    return section;
  }
  section.append(...state.rangees.map((row) => setOneStation(doc, { rangee: row, gestes: actions })));
  return section;
}

/** @param {unknown} error */
const message = (error) => (error instanceof Error ? error.message : String(error));

// Ce qu'une écriture a rendu, lu : `ok`, ou un refus — toute autre réponse est un refus, jamais un succès deviné.
/** @param {unknown} rendered @returns {{ ok: true } | { refus: string, detail: string }} */
export function renderedRead(rendered) {
  if (typeof rendered === "object" && rendered !== null) {
    const { ok, refus: refusal, detail } = /** @type {Record<string, unknown>} */ (rendered);
    if (ok === true) return { ok: true };
    // Le refus tient en une ligne : sa première, le reste au survol.
    if (typeof refusal === "string" && refusal.trim() !== "") {
      const [line = "", ...remains] = refusal.trim().split("\n");
      return { refus: line.trim(), detail: [...remains, typeof detail === "string" ? detail : ""].join("\n").trim() };
    }
  }
  return { refus: WORDS.rienEnvoye, detail: rendered === undefined ? "" : JSON.stringify(rendered) };
}

// L'état des stations de chaque projet, d'une ouverture à l'autre, tenu par le conteneur de la page.
/** @type {WeakMap<object, Map<string, State>>} */
const statesOfContainers = new WeakMap();

// Monte le bloc dans son conteneur, pour un projet : lit les stations, les pose, et répond au geste. Le conteneur retient le
// projet qu'il montre : une réponse qui arrive pour un autre, quitté depuis, ne s'y pose pas.
/**
 * @param {Fabrique} doc
 * @param {any} container
 * @param {{ projet: string, service: Service }} options
 */
export async function mountTheStations(doc, container, { projet: project, service }) {
  container.dataset.projet = project;
  /** @type {Map<string, State>} */
  const states = statesOfContainers.get(container) ?? new Map();
  statesOfContainers.set(container, states);
  const set = () => {
    if (container.dataset.projet !== project) return;
    const pose = setTheStations(doc, { etat: states.get(project) ?? { lecture: "en-cours" }, gestes: actions });
    container.hidden = pose === null;
    container.replaceChildren(...(pose === null ? [] : [pose]));
  };

  /** @param {Row} row */
  async function change(row) {
    if (row.enCours === true) return;
    row.enCours = true;
    row.refus = undefined;
    set();
    /** @type {unknown} */
    let received;
    try {
      received = await (row.refused ? service.accept(row.station) : service.refuse(row.station));
    } catch (error) {
      received = { refus: WORDS.rienEnvoye, detail: message(error) };
    }
    const readOne = renderedRead(received);
    row.enCours = false;
    if ("ok" in readOne) row.refused = !row.refused;
    else row.refus = { ligne: readOne.refus, detail: readOne.detail };
    set();
  }

  const actions = { changer: (/** @type {Row} */ row) => void change(row) };

  set();
  /** @type {State} */
  let readOne;
  try {
    const stations = await service.list();
    if (stations === undefined) readOne = { lecture: "sans" };
    else if (!Array.isArray(stations)) readOne = { lecture: "refus", ligne: typeof stations?.sans === "string" ? stations.sans : WORDS.indisponible, detail: stations?.detail ?? JSON.stringify(stations) };
    else readOne = { lecture: "lue", rangees: stations.map(({ station, login, refused }) => ({ station, login, refused })) };
  } catch (error) {
    readOne = { lecture: "refus", ligne: WORDS.indisponible, detail: message(error) };
  }
  states.set(project, readOne);
  set();
}

// Le service tel que le pont le porte : chaque méthode, si le pont l'a ; sans elle, la lecture ne rend rien — le bloc ne se
// pose pas — et un geste le dit en refus.
/**
 * @param {Partial<Pick<import("../bridge.d.ts").Bridge, "listerLesStationsContributrices" | "refuserUneStationContributrice" | "accepterUneStationContributrice">>} bridge
 * @param {string} project
 * @returns {Service}
 */
export function serviceOfBridge(bridge, project) {
  return {
    list: async () => (typeof bridge.listerLesStationsContributrices === "function" ? bridge.listerLesStationsContributrices(project) : undefined),
    refuse: async (station) => (typeof bridge.refuserUneStationContributrice === "function" ? bridge.refuserUneStationContributrice(project, station) : { refus: WORDS.rienEnvoye }),
    accept: async (station) => (typeof bridge.accepterUneStationContributrice === "function" ? bridge.accepterUneStationContributrice(project, station) : { refus: WORDS.rienEnvoye }),
  };
}
