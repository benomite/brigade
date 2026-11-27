// @ts-check
// Le bandeau de la cuisine arrêtée, en tête du rail d'un projet (ticket 3924) : des tickets en file, aucune carte prise ni
// en pass. Il dit que la cuisine est arrêtée, depuis quand — à l'heure UTC, comme les alertes du rail — et la cause que le
// runtime a nommée (runtime/src/arret-cuisine/arret-cuisine.ts) : un ticket gelé qui tient une zone de fichiers, main
// rouge, ou une cause inconnue, dite telle quelle — jamais un rail muet. Monté une fois sur son hôte, il suit chaque
// lecture du rail (`maj`) : il part dès qu'une carte est prise ou en pass, ou que la file est vide, sans rechargement.
// Ce module ne touche pas `document` : il reçoit une fabrique et l'hôte où se poser.
// Sur le rail, il offre toujours un geste au chef (ticket 4238) : ouvrir le ticket gelé, les checks de main rouge, ou relire
// l'état quand la cause est inconnue.

import { bouton } from "../composants/bouton/bouton.js";
import { estUnStatutDePanne, monterLeBandeau as monterLeBandeauDePanne } from "../bandeau-panne/bandeau-panne.js";

/** @typedef {import("../briques.js").Fabrique} Fabrique */
/** @typedef {import("../../../../runtime/src/arret-cuisine/arret-cuisine.ts").ArretDeLaCuisine} ArretDeLaCuisine */

const MARQUE_ARRET = "STOPPED";

/** @param {string} iso @returns {string | null} */
const heureUtc = (iso) => (Number.isNaN(Date.parse(iso)) ? null : `${new Date(iso).toISOString().slice(11, 16)} UTC`);

// Sans `statut` (un arrêt posé sans la lecture du rail), la cause se dit d'après son sorte.
/** @param {ArretDeLaCuisine["cause"]} cause @returns {string} */
function causeDite(cause) {
  if (cause.kind === "frozen-zone") return `frozen ticket #${cause.ticket} holds the file zone ${cause.zone}`;
  if (cause.kind === "zone-held") return `zone held by PR ${cause.pr}`;
  if (cause.kind === "main-red") return "main is red";
  return "the cause is unknown";
}

// La phrase du bandeau : l'arrêt, depuis quand quand l'heure se lit, et sa cause — le `statut` que le runtime a dit (statutDeLaCuisine).
/** @param {ArretDeLaCuisine} arret @returns {string} */
function phraseDeLArret(arret) {
  const heure = heureUtc(arret.since);
  return `The kitchen is stopped${heure === null ? "" : ` since ${heure}`}: ${arret.statut ?? causeDite(arret.cause)}.`;
}

/** @typedef {{ ouvrirTicket(ticket: number): void, ouvrirLesChecks(): void, relire(): void, reparer?(id: string): void }} GestesDeLArret */

// Le geste de l'arrêt, selon sa cause.
/** @param {Fabrique} doc @param {ArretDeLaCuisine["cause"]} cause @param {GestesDeLArret} gestes */
function gesteDeLArret(doc, cause, gestes) {
  if (cause.kind === "frozen-zone") return bouton(doc, `open #${cause.ticket}`, () => gestes.ouvrirTicket(cause.ticket), { sorte: "recommande" });
  if (cause.kind === "main-red") return bouton(doc, "open the checks", () => gestes.ouvrirLesChecks(), { sorte: "recommande" });
  return bouton(doc, "read again", () => gestes.relire(), { sorte: "recommande" });
}

/** @param {Fabrique} doc @param {{ replaceChildren(...noeuds: any[]): void }} hote @param {GestesDeLArret} [gestes] @returns {{ maj(arret: ArretDeLaCuisine | import("../bandeau-panne/bandeau-panne.js").StatutDePanne | null | undefined): void }} */
export function monterLeBandeau(doc, hote, gestes) {
  const panne = monterLeBandeauDePanne(doc, hote, (id) => gestes?.reparer?.(id));
  return {
    maj(arret) {
      if (arret === null || arret === undefined) return hote.replaceChildren();
      // Un statut `{ state, cause, action }` (ticket 4216) se rend dans vue/bandeau-panne/.
      if (estUnStatutDePanne(arret)) return panne.maj(arret);
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
      ligne.append(marque, phrase, ...(gestes === undefined ? [] : [gesteDeLArret(doc, arret.cause, gestes)]));
      hote.replaceChildren(ligne);
    },
  };
}
