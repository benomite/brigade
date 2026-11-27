// @ts-check
// La version de la station de cet ordinateur, à côté de celle de la box (ticket 2191, épique 2182) : sur l'accueil,
// sous la liste des stations, une ligne « Station version » et, côte à côte, une case par station — la box d'abord,
// puis cet ordinateur —, chacune dite de la même façon : son nom, `version X`, et où elle en est.
// - La box : sa version, telle que son gist la publie, et « up to date » quand sa ligne de mise à jour le dit
//   (stations.ts, `ligneDeVersion`) — rien de plus quand elle est hors ligne ou que sa mise à jour a échoué.
// - Cet ordinateur : le statut de sa station (`stationVersion`, `latestStationVersion`, `behind`, le contrat du
//   runtime, ticket 2189). En retard, la case le dit en jaune et nomme la dernière version ; à jour, en vert.
// - Rien de lu, ou un statut illisible : « version unknown », en gris, et pourquoi au survol — jamais une erreur,
//   jamais une case vide.
// Ce module ne touche pas `document` : il reçoit de quoi créer un élément (bricks.js), et rend un élément.

import { hover } from "../bricks.js";
import { NOT_STILL } from "../lexicon.js";

/** @typedef {import("../bricks.js").Fabrique} Fabrique */
// Le statut de la station de cet ordinateur, tel que le runtime l'expose (ticket 2189).
/** @typedef {{ stationVersion: string, latestStationVersion?: string | null, behind: boolean }} StatusOfTheStation */
// Une station d'ailleurs, telle que l'app la lit sur GitHub (stations/stations.ts, `StationVue`) : ce qu'il en faut ici.
/** @typedef {{ id: string, nom: string, version: string, versionDit?: string, cuisine?: false, etat: string }} StationRead */
/** @typedef {{ nom: string, phrase: string, ton: "vert" | "jaune" | "gris", survol?: string, ici: boolean }} Case */

export const TITLE = "Station version";
export const A_DAY = "up to date";
export const UNKNOWN = "version unknown";
export const UNKNOWN_HERE = "This computer's station has not said its version yet: it shows here as soon as the station publishes it.";
export const UNKNOWN_BOX = `${NOT_STILL("box read on GitHub")} Its version shows here with your stations.`;
export const BOX = "box";

// Une version, dite partout de la même façon.
/** @param {string} version */
const versionSaid = (version) => `version ${version}`;

// La forme d'un ton, celle de toute pastille de la vue (vue.js, `FORMES`) : la couleur ne porte jamais seule l'information.
/** @type {Record<Case["ton"], string>} */
const SHAPES = { vert: "disque", jaune: "losange", gris: "anneau" };

// Le statut lu, s'il tient le contrat ; sinon rien — il se dit inconnu.
/** @param {unknown} status @returns {StatusOfTheStation | undefined} */
export function statusRead(status) {
  if (typeof status !== "object" || status === null) return undefined;
  const { stationVersion, latestStationVersion, behind } = /** @type {Record<string, unknown>} */ (status);
  if (typeof stationVersion !== "string" || stationVersion.trim() === "" || typeof behind !== "boolean") return undefined;
  const last = typeof latestStationVersion === "string" && latestStationVersion.trim() !== "" ? latestStationVersion.trim() : null;
  return { stationVersion: stationVersion.trim(), latestStationVersion: last, behind };
}

// La case de cet ordinateur : en retard, à jour, ou inconnue. `nom` : ce poste, tel que l'app le nomme (« this Mac »).
/** @param {string} name @param {unknown} status @returns {Case} */
export function caseOfHere(name, status) {
  const readOne = statusRead(status);
  if (readOne === undefined) return { nom: name, phrase: UNKNOWN, ton: "gris", survol: UNKNOWN_HERE, ici: true };
  if (!readOne.behind) return { nom: name, phrase: `${versionSaid(readOne.stationVersion)} · ${A_DAY}`, ton: "vert", ici: true };
  const delay = readOne.latestStationVersion === null ? "behind" : `behind — ${readOne.latestStationVersion} is out`;
  return { nom: name, phrase: `${versionSaid(readOne.stationVersion)} · ${delay}`, ton: "jaune", ici: true };
}

// La case d'une box : sa version, et « up to date » quand sa ligne de mise à jour le dit.
/** @param {StationRead} station @returns {Case} */
export function caseOfTheBox(station) {
  if (station.version === "") return { nom: station.nom, phrase: UNKNOWN, ton: "gris", survol: UNKNOWN_BOX, ici: false };
  const aDay = (station.versionDit ?? "").startsWith(A_DAY);
  return { nom: station.nom, phrase: aDay ? `${versionSaid(station.version)} · ${A_DAY}` : versionSaid(station.version), ton: aDay ? "vert" : "gris", ici: false };
}

// Les box : les stations lues qui cuisent, sauf celle de cet ordinateur (`locale`) et celles qui ne se lisent pas.
/** @param {readonly StationRead[]} stations @param {string | null} locale @returns {StationRead[]} */
export const boxesOf = (stations, locale) => stations.filter(({ id, cuisine: kitchen, etat: state }) => id !== locale && kitchen !== false && state !== "illisible");

// Les cases, la box d'abord, puis cet ordinateur. Sans box lue, une case « box » la dit inconnue : les deux versions
// sont toujours côte à côte.
/** @param {{ stations: readonly StationRead[] | undefined, locale: string | null, poste: string, statut: unknown }} lu @returns {Case[]} */
export function casesOfVersions({ stations, locale, poste: workstation, statut: status }) {
  const boxes = boxesOf(stations ?? [], locale).map(caseOfTheBox);
  return [...(boxes.length === 0 ? [{ nom: BOX, phrase: UNKNOWN, ton: /** @type {const} */ ("gris"), survol: UNKNOWN_BOX, ici: false }] : boxes), caseOfHere(workstation, status)];
}

// Le bloc : son titre, puis ses cases côte à côte.
/** @param {Fabrique} doc @param {Case[]} cases */
export function setVersionsOfStations(doc, cases) {
  const root = doc.createElement("div");
  root.className = "versions-des-stations";
  root.ariaLabel = TITLE;
  const title = doc.createElement("span");
  title.className = "titre";
  title.textContent = TITLE;
  root.append(title, ...cases.map((one) => setOneCase(doc, one)));
  return root;
}

/** @param {Fabrique} doc @param {Case} one */
function setOneCase(doc, one) {
  const root = doc.createElement("span");
  root.className = "version-d-une-station";
  root.dataset.ton = one.ton;
  if (one.ici) root.dataset.ici = "oui";
  const pill = doc.createElement("span");
  pill.className = "pastille";
  pill.dataset.ton = one.ton;
  pill.dataset.forme = SHAPES[one.ton];
  pill.title = one.phrase;
  const name = doc.createElement("strong");
  // Le nom d'une station est un mot de la machine ; ce poste se dit en mots (« this Mac »), comme partout dans l'app.
  if (!one.ici) name.className = "mono";
  name.textContent = one.nom;
  const sentence = doc.createElement("span");
  sentence.className = "phrase";
  sentence.textContent = one.phrase;
  root.append(pill, name, sentence, ...(one.survol === undefined ? [] : [hover(doc, one.survol)]));
  return root;
}
