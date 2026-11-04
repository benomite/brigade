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
// Ce module ne touche pas `document` : il reçoit de quoi créer un élément (briques.js), et rend un élément.

import { survol } from "../briques.js";

/** @typedef {import("../briques.js").Fabrique} Fabrique */
// Le statut de la station de cet ordinateur, tel que le runtime l'expose (ticket 2189).
/** @typedef {{ stationVersion: string, latestStationVersion?: string | null, behind: boolean }} StatutDeLaStation */
// Une station d'ailleurs, telle que l'app la lit sur GitHub (stations/stations.ts, `StationVue`) : ce qu'il en faut ici.
/** @typedef {{ id: string, nom: string, version: string, versionDit?: string, cuisine?: false, etat: string }} StationLue */
/** @typedef {{ nom: string, phrase: string, ton: "vert" | "jaune" | "gris", survol?: string, ici: boolean }} Case */

export const TITRE = "Station version";
export const A_JOUR = "up to date";
export const INCONNUE = "version unknown";
export const INCONNUE_ICI = "This computer's station has not said its version yet: it shows here as soon as the station publishes it.";
export const INCONNUE_BOX = "No box has been read on GitHub yet: its version shows here with your stations.";
export const BOX = "box";

// Une version, dite partout de la même façon.
/** @param {string} version */
const versionDite = (version) => `version ${version}`;

// La forme d'un ton, celle de toute pastille de la vue (vue.js, `FORMES`) : la couleur ne porte jamais seule l'information.
/** @type {Record<Case["ton"], string>} */
const FORMES = { vert: "disque", jaune: "losange", gris: "anneau" };

// Le statut lu, s'il tient le contrat ; sinon rien — il se dit inconnu.
/** @param {unknown} statut @returns {StatutDeLaStation | undefined} */
export function statutLu(statut) {
  if (typeof statut !== "object" || statut === null) return undefined;
  const { stationVersion, latestStationVersion, behind } = /** @type {Record<string, unknown>} */ (statut);
  if (typeof stationVersion !== "string" || stationVersion.trim() === "" || typeof behind !== "boolean") return undefined;
  const derniere = typeof latestStationVersion === "string" && latestStationVersion.trim() !== "" ? latestStationVersion.trim() : null;
  return { stationVersion: stationVersion.trim(), latestStationVersion: derniere, behind };
}

// La case de cet ordinateur : en retard, à jour, ou inconnue. `nom` : ce poste, tel que l'app le nomme (« this Mac »).
/** @param {string} nom @param {unknown} statut @returns {Case} */
export function caseDIci(nom, statut) {
  const lu = statutLu(statut);
  if (lu === undefined) return { nom, phrase: INCONNUE, ton: "gris", survol: INCONNUE_ICI, ici: true };
  if (!lu.behind) return { nom, phrase: `${versionDite(lu.stationVersion)} · ${A_JOUR}`, ton: "vert", ici: true };
  const retard = lu.latestStationVersion === null ? "behind" : `behind — ${lu.latestStationVersion} is out`;
  return { nom, phrase: `${versionDite(lu.stationVersion)} · ${retard}`, ton: "jaune", ici: true };
}

// La case d'une box : sa version, et « up to date » quand sa ligne de mise à jour le dit.
/** @param {StationLue} station @returns {Case} */
export function caseDeLaBox(station) {
  if (station.version === "") return { nom: station.nom, phrase: INCONNUE, ton: "gris", survol: INCONNUE_BOX, ici: false };
  const aJour = (station.versionDit ?? "").startsWith(A_JOUR);
  return { nom: station.nom, phrase: aJour ? `${versionDite(station.version)} · ${A_JOUR}` : versionDite(station.version), ton: aJour ? "vert" : "gris", ici: false };
}

// Les box : les stations lues qui cuisent, sauf celle de cet ordinateur (`locale`) et celles qui ne se lisent pas.
/** @param {readonly StationLue[]} stations @param {string | null} locale @returns {StationLue[]} */
export const boxesDe = (stations, locale) => stations.filter(({ id, cuisine, etat }) => id !== locale && cuisine !== false && etat !== "illisible");

// Les cases, la box d'abord, puis cet ordinateur. Sans box lue, une case « box » la dit inconnue : les deux versions
// sont toujours côte à côte.
/** @param {{ stations: readonly StationLue[] | undefined, locale: string | null, poste: string, statut: unknown }} lu @returns {Case[]} */
export function casesDesVersions({ stations, locale, poste, statut }) {
  const boxes = boxesDe(stations ?? [], locale).map(caseDeLaBox);
  return [...(boxes.length === 0 ? [{ nom: BOX, phrase: INCONNUE, ton: /** @type {const} */ ("gris"), survol: INCONNUE_BOX, ici: false }] : boxes), caseDIci(poste, statut)];
}

// Le bloc : son titre, puis ses cases côte à côte.
/** @param {Fabrique} doc @param {Case[]} cases */
export function poserVersionsDesStations(doc, cases) {
  const racine = doc.createElement("div");
  racine.className = "versions-des-stations";
  racine.ariaLabel = TITRE;
  const titre = doc.createElement("span");
  titre.className = "titre";
  titre.textContent = TITRE;
  racine.append(titre, ...cases.map((une) => poserUneCase(doc, une)));
  return racine;
}

/** @param {Fabrique} doc @param {Case} une */
function poserUneCase(doc, une) {
  const racine = doc.createElement("span");
  racine.className = "version-d-une-station";
  racine.dataset.ton = une.ton;
  if (une.ici) racine.dataset.ici = "oui";
  const pastille = doc.createElement("span");
  pastille.className = "pastille";
  pastille.dataset.ton = une.ton;
  pastille.dataset.forme = FORMES[une.ton];
  pastille.title = une.phrase;
  const nom = doc.createElement("strong");
  // Le nom d'une station est un mot de la machine ; ce poste se dit en mots (« this Mac »), comme partout dans l'app.
  if (!une.ici) nom.className = "mono";
  nom.textContent = une.nom;
  const phrase = doc.createElement("span");
  phrase.className = "phrase";
  phrase.textContent = une.phrase;
  racine.append(pastille, nom, phrase, ...(une.survol === undefined ? [] : [survol(doc, une.survol)]));
  return racine;
}
