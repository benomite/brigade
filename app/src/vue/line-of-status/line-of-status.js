// @ts-check
// La ligne d'état du rail (ticket 3523) : au-dessus des colonnes, le bandeau Backlog et, quand quelque chose retient la
// cuisine, une seule ligne — jamais deux l'une sur l'autre. Ce module ne touche pas `document` : il reçoit de quoi créer un
// élément (bricks.js), et rend des éléments.
//   - Une issue que la cuisine a ouverte sur elle-même (cuisine oisive : upstream.ts, `alerteDeLaCuisine`)
//     n'est pas un besoin : son contenu est cette ligne.
//   - Une file qui attend sans que le runtime en sache la raison (`normale`, « no reason is found ») ne le dit pas quand la
//     vue en connaît une — un ticket mis de côté, la cuisine arrêtée : elle la nomme (`phraseDeLAttente`).
//   - Sa fraîcheur — l'âge de la lecture — est à son survol ; elle ne se voit que périmée (les signes de vue.js).

/** @typedef {import("../bricks.js").Fabrique} Fabrique */
/** @typedef {import("../../upstream.ts").AlertOfTheKitchen} Alert */
/** @typedef {import("../../../../runtime/src/attente-du-rail/raison.ts").AttenteDuRail} WaitOfRail */

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

/**
 * Ce que la vue sait de ce qui retient la file : les tickets mis de côté, la cuisine arrêtée.
 * @param {{ misDeCote: readonly number[], arretee: boolean }} faits @returns {string[]}
 */
export function heldKnown({ misDeCote: setAside, arretee: stopped }) {
  return [
    ...(stopped ? ["the kitchen is stopped"] : []),
    ...(setAside.length === 0 ? [] : [`${setAside.map((n) => `#${n}`).join(", ")} ${setAside.length === 1 ? "is" : "are"} set aside`]),
  ];
}

/**
 * L'attente de la file, avec sa raison quand la vue en connaît une : la phrase « no reason is found » ne se dit jamais
 * devant une raison connue. Toute autre raison est celle du runtime, que la vue ne réécrit pas.
 * @param {WaitOfRail} wait @param {readonly string[]} retainedEntries
 * @returns {WaitOfRail}
 */
export function sentenceOfTheWait(wait, retainedEntries) {
  if (wait.raison !== "normale" || retainedEntries.length === 0) return wait;
  return { ...wait, phrase: `The queue waits: ${retainedEntries.join("; ")}.` };
}
