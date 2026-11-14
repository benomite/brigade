// @ts-check
// La ligne d'état du rail (ticket 3523) : au-dessus des colonnes, le bandeau Backlog et, quand quelque chose retient la
// cuisine, une seule ligne — jamais deux l'une sur l'autre. Ce module ne touche pas `document` : il reçoit de quoi créer un
// élément (briques.js), et rend des éléments.
//   - Une issue que la cuisine a ouverte sur elle-même (disjoncteur ouvert, cuisine oisive : amont.ts, `alerteDeLaCuisine`)
//     n'est pas un besoin : son contenu est cette ligne.
//   - Une file qui attend sans que le runtime en sache la raison (`normale`, « no reason is found ») ne le dit pas quand la
//     vue en connaît une — un ticket mis de côté, la cuisine arrêtée : elle la nomme (`phraseDeLAttente`).
//   - Sa fraîcheur — l'âge de la lecture — est à son survol ; elle ne se voit que périmée (les signes de vue.js).

/** @typedef {import("../briques.js").Fabrique} Fabrique */
/** @typedef {import("../../amont.ts").AlerteDeLaCuisine} Alerte */
/** @typedef {import("../../../../runtime/src/attente-du-rail/raison.ts").AttenteDuRail} AttenteDuRail */

/**
 * La ligne de la cuisine retenue ou oisive, d'après les issues qu'elle a ouvertes sur elle-même : la première, au nom de
 * son contenu. Le geste qui la lève est celui du disjoncteur (« Resume »), que la vue pose à sa place quand il en a un.
 * @param {Fabrique} doc @param {readonly Alerte[] | undefined} alertes @returns {HTMLElement[]}
 */
export function ligneDesAlertes(doc, alertes) {
  const [alerte] = [...(alertes ?? [])].sort((a, b) => (a.genre === b.genre ? a.ticket - b.ticket : a.genre === "disjoncteur" ? -1 : 1));
  if (alerte === undefined) return [];
  const ligne = doc.createElement("p");
  ligne.className = "statut-du-rail";
  ligne.dataset.genre = alerte.genre;
  const phrase = doc.createElement("strong");
  phrase.textContent = alerte.dit;
  ligne.append(phrase);
  ligne.title = `${alerte.titre} — filed by the kitchen on issue #${alerte.ticket}`;
  return [ligne];
}

/**
 * Ce que la vue sait de ce qui retient la file : les tickets mis de côté, la cuisine arrêtée.
 * @param {{ misDeCote: readonly number[], arretee: boolean }} faits @returns {string[]}
 */
export function retenuesConnues({ misDeCote, arretee }) {
  return [
    ...(arretee ? ["the kitchen is stopped"] : []),
    ...(misDeCote.length === 0 ? [] : [`${misDeCote.map((n) => `#${n}`).join(", ")} ${misDeCote.length === 1 ? "is" : "are"} set aside`]),
  ];
}

/**
 * L'attente de la file, avec sa raison quand la vue en connaît une : la phrase « no reason is found » ne se dit jamais
 * devant une raison connue. Toute autre raison est celle du runtime, que la vue ne réécrit pas.
 * @param {AttenteDuRail} attente @param {readonly string[]} retenues
 * @returns {AttenteDuRail}
 */
export function phraseDeLAttente(attente, retenues) {
  if (attente.raison !== "normale" || retenues.length === 0) return attente;
  return { ...attente, phrase: `The queue waits: ${retenues.join("; ")}.` };
}
