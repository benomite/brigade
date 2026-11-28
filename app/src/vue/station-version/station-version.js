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


/** @typedef {import("../bricks.js").Fabrique} Fabrique */
// Le statut de la station de cet ordinateur, tel que le runtime l'expose (ticket 2189).
/** @typedef {{ stationVersion: string, latestStationVersion?: string | null, behind: boolean }} StatusOfTheStation */
// Une station d'ailleurs, telle que l'app la lit sur GitHub (stations/stations.ts, `StationVue`) : ce qu'il en faut ici.
/** @typedef {{ id: string, nom: string, version: string, versionDit?: string, cuisine?: false, etat: string }} StationRead */
/** @typedef {{ nom: string, phrase: string, ton: "vert" | "jaune" | "gris", survol?: string, ici: boolean }} Case */

export const TITLE = "Station version";
export const UNKNOWN = "version unknown";
export const BOX = "box";



// Le statut lu, s'il tient le contrat ; sinon rien — il se dit inconnu.
/** @param {unknown} status @returns {StatusOfTheStation | undefined} */
export function statusRead(status) {
  if (typeof status !== "object" || status === null) return undefined;
  const { stationVersion, latestStationVersion, behind } = /** @type {Record<string, unknown>} */ (status);
  if (typeof stationVersion !== "string" || stationVersion.trim() === "" || typeof behind !== "boolean") return undefined;
  const last = typeof latestStationVersion === "string" && latestStationVersion.trim() !== "" ? latestStationVersion.trim() : null;
  return { stationVersion: stationVersion.trim(), latestStationVersion: last, behind };
}






