// @ts-check
// Sur une carte du rail, deux sortes d'étiquettes (ticket 2039) : la station qui la sert — sur Taken et Pass, quand le
// projet en compte plusieurs —, et une par capacité que son ticket demande (`requiert`), sur toutes les colonnes. Le nom
// court de la station est ce qui précède le « / » ; le nom entier est au survol. Ce module ne touche pas `document` :
// il reçoit de quoi créer un élément (bricks.js), et rend un élément, ou rien.

/** @typedef {import("./bricks.js").Fabrique} Fabrique */

/**
 * @param {Fabrique} doc
 * @param {{ station?: string, requiert?: readonly string[] }} card
 * @param {boolean} withStation la station s'étiquette : colonne Taken ou Pass d'un projet à plusieurs stations
 */
export function setLabels(doc, card, withStation) {
  const { station, requiert = [] } = card;
  const labels = [];
  if (withStation && station !== undefined) {
    const pose = doc.createElement("span");
    pose.className = "etiquette etiquette-station mono";
    pose.textContent = station.split("/")[0] ?? station;
    pose.title = station;
    labels.push(pose);
  }
  for (const capacity of requiert) {
    const pose = doc.createElement("span");
    pose.className = "etiquette etiquette-capacite mono";
    pose.textContent = capacity;
    pose.title = `this ticket requires ${capacity}`;
    labels.push(pose);
  }
  if (labels.length === 0) return null;
  const line = doc.createElement("span");
  line.className = "etiquettes";
  line.append(...labels);
  return line;
}
