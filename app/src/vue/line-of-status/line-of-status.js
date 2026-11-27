// @ts-check
// La ligne d'état du rail (ticket 3523) : au-dessus des colonnes, le bandeau Backlog et, quand quelque chose retient la
// cuisine, une seule ligne — jamais deux l'une sur l'autre. Ce module ne touche pas `document` : il reçoit de quoi créer un
// élément (bricks.js), et rend des éléments.
//   - Une issue que la cuisine a ouverte sur elle-même (cuisine oisive : upstream.ts, `alerteDeLaCuisine`)
//     n'est pas un besoin : son contenu est cette ligne.
//   - Sa fraîcheur — l'âge de la lecture — est à son survol ; elle ne se voit que périmée (les signes de vue.js).

/** @typedef {import("../bricks.js").Fabrique} Fabrique */
/** @typedef {import("../../upstream.ts").AlertOfTheKitchen} Alert */

/**
 * La ligne de la cuisine oisive, d'après les issues qu'elle a ouvertes sur elle-même : la première, au nom de
 * son contenu.
 * @param {Fabrique} doc @param {readonly Alert[] | undefined} alerts @returns {HTMLElement[]}
 */
export function lineOfAlerts(doc, alerts) {
  const [alert] = [...(alerts ?? [])].sort((a, b) => a.ticket - b.ticket);
  if (alert === undefined) return [];
  const line = doc.createElement("p");
  line.className = "statut-du-rail";
  line.dataset.genre = alert.genre;
  const sentence = doc.createElement("strong");
  sentence.textContent = alert.dit;
  line.append(sentence);
  line.title = `${alert.titre} — filed by the kitchen on issue #${alert.ticket}`;
  return [line];
}
