// @ts-check
// Le bandeau de la cuisine arrêtée, en tête du rail d'un projet (ticket 3924) : des tickets en file, aucune carte prise ni
// en pass. Il dit que la cuisine est arrêtée, depuis quand — à l'heure UTC, comme les alertes du rail — et la cause que le
// runtime a nommée (runtime/src/arret-cuisine/arret-cuisine.ts) : un ticket gelé qui tient une zone de fichiers, main
// rouge, ou une cause inconnue, dite telle quelle — jamais un rail muet. Monté une fois sur son hôte, il suit chaque
// lecture du rail (`maj`) : il part dès qu'une carte est prise ou en pass, ou que la file est vide, sans rechargement.
// Ce module ne touche pas `document` : il reçoit une fabrique et l'hôte où se poser.

/** @typedef {import("../briques.js").Fabrique} Fabrique */
/** @typedef {import("../../../../runtime/src/arret-cuisine/arret-cuisine.ts").ArretDeLaCuisine} ArretDeLaCuisine */

const MARQUE_ARRET = "STOPPED";

/** @param {string} iso @returns {string | null} */
const heureUtc = (iso) => (Number.isNaN(Date.parse(iso)) ? null : `${new Date(iso).toISOString().slice(11, 16)} UTC`);

/** @param {ArretDeLaCuisine["cause"]} cause @returns {string} */
function causeDite(cause) {
  if (cause.kind === "frozen-zone") return `frozen ticket #${cause.ticket} holds the file zone ${cause.zone}`;
  if (cause.kind === "main-red") return "main is red";
  return "the cause is unknown";
}

// La phrase du bandeau : l'arrêt, depuis quand quand l'heure se lit, et sa cause.
/** @param {ArretDeLaCuisine} arret @returns {string} */
function phraseDeLArret(arret) {
  const heure = heureUtc(arret.since);
  return `The kitchen is stopped${heure === null ? "" : ` since ${heure}`}: ${causeDite(arret.cause)}.`;
}

/** @param {Fabrique} doc @param {{ replaceChildren(...noeuds: any[]): void }} hote @returns {{ maj(arret: ArretDeLaCuisine | null | undefined): void }} */
export function monterLeBandeau(doc, hote) {
  return {
    maj(arret) {
      if (arret === null || arret === undefined) return hote.replaceChildren();
      const ligne = doc.createElement("p");
      ligne.className = "panne-du-rail bandeau-arret";
      ligne.role = "alert";
      ligne.dataset.cause = arret.cause.kind;
      ligne.title = `No card is taken or in pass while tickets are queued${Number.isNaN(Date.parse(arret.since)) ? "" : ` — since ${arret.since.slice(0, 16).replace("T", " ")} UTC`}.`;
      const marque = doc.createElement("span");
      marque.className = "marque";
      marque.textContent = MARQUE_ARRET;
      const phrase = doc.createElement("strong");
      phrase.textContent = phraseDeLArret(arret);
      ligne.append(marque, phrase);
      hote.replaceChildren(ligne);
    },
  };
}
