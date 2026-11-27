// @ts-check
// Le bandeau de la cuisine arrêtée, en tête du rail d'un projet (ticket 3924) : des tickets en file, aucune carte prise ni
// en pass. Il dit que la cuisine est arrêtée, depuis quand — à l'heure UTC, comme les alertes du rail — et la cause que le
// runtime a nommée (runtime/src/arret-cuisine/arret-cuisine.ts) : un ticket gelé qui tient une zone de fichiers, main
// rouge, ou une cause inconnue, dite telle quelle — jamais un rail muet. Monté une fois sur son hôte, il suit chaque
// lecture du rail (`maj`) : il part dès qu'une carte est prise ou en pass, ou que la file est vide, sans rechargement.
// Ce module ne touche pas `document` : il reçoit une fabrique et l'hôte où se poser.
// Sur le rail, il offre toujours un geste au chef (ticket 4238) : ouvrir le ticket gelé, les checks de main rouge, ou relire
// l'état quand la cause est inconnue.

import { button } from "../components/button/button.js";
import { isOneStatusOfOutage, mountTheBanner as mountTheBannerOfOutage } from "../banner-outage/banner-outage.js";

/** @typedef {import("../bricks.js").Fabrique} Fabrique */
/** @typedef {import("../../../../runtime/src/arret-cuisine/arret-cuisine.ts").ArretDeLaCuisine} StopOfTheKitchen */

const BRAND_STOP = "STOPPED";

/** @param {string} iso @returns {string | null} */
const hourUtc = (iso) => (Number.isNaN(Date.parse(iso)) ? null : `${new Date(iso).toISOString().slice(11, 16)} UTC`);

// Sans `statut` (un arrêt posé sans la lecture du rail), la cause se dit d'après son sorte.
/** @param {StopOfTheKitchen["cause"]} cause @returns {string} */
function causeSaid(cause) {
  if (cause.kind === "frozen-zone") return `frozen ticket #${cause.ticket} holds the file zone ${cause.zone}`;
  if (cause.kind === "zone-held") return `zone held by PR ${cause.pr}`;
  if (cause.kind === "main-red") return "main is red";
  return "the cause is unknown";
}

// La phrase du bandeau : l'arrêt, depuis quand quand l'heure se lit, et sa cause — le `statut` que le runtime a dit (statutDeLaCuisine).
/** @param {StopOfTheKitchen} stop @returns {string} */
function sentenceOfTheStop(stop) {
  const hour = hourUtc(stop.since);
  return `The kitchen is stopped${hour === null ? "" : ` since ${hour}`}: ${stop.statut ?? causeSaid(stop.cause)}.`;
}

/** @typedef {{ ouvrirTicket(ticket: number): void, ouvrirLesChecks(): void, relire(): void, reparer?(id: string): void }} ActionsOfTheStop */

// Le geste de l'arrêt, selon sa cause.
/** @param {Fabrique} doc @param {StopOfTheKitchen["cause"]} cause @param {ActionsOfTheStop} actions */
function actionOfTheStop(doc, cause, actions) {
  if (cause.kind === "frozen-zone") return button(doc, `open #${cause.ticket}`, () => actions.ouvrirTicket(cause.ticket), { sorte: "recommande" });
  if (cause.kind === "main-red") return button(doc, "open the checks", () => actions.ouvrirLesChecks(), { sorte: "recommande" });
  return button(doc, "read again", () => actions.relire(), { sorte: "recommande" });
}

/** @param {Fabrique} doc @param {{ replaceChildren(...noeuds: any[]): void }} host @param {ActionsOfTheStop} [actions] @returns {{ maj(stop: StopOfTheKitchen | import("../banner-outage/banner-outage.js").StatusOfOutage | null | undefined): void }} */
export function mountTheBanner(doc, host, actions) {
  const outage = mountTheBannerOfOutage(doc, host, (id) => actions?.reparer?.(id));
  return {
    maj(stop) {
      if (stop === null || stop === undefined) return host.replaceChildren();
      // Un statut `{ state, cause, action }` (ticket 4216) se rend dans vue/banner-outage/.
      if (isOneStatusOfOutage(stop)) return outage.maj(stop);
      const line = doc.createElement("p");
      line.className = "panne-du-rail bandeau-arret";
      line.role = "alert";
      line.dataset.cause = stop.cause.kind;
      line.title = `No card is taken or in pass while tickets are queued${Number.isNaN(Date.parse(stop.since)) ? "" : ` — since ${stop.since.slice(0, 16).replace("T", " ")} UTC`}.`;
      const brand = doc.createElement("span");
      brand.className = "marque";
      brand.textContent = BRAND_STOP;
      const sentence = doc.createElement("strong");
      sentence.textContent = sentenceOfTheStop(stop);
      line.append(brand, sentence, ...(actions === undefined ? [] : [actionOfTheStop(doc, stop.cause, actions)]));
      host.replaceChildren(line);
    },
  };
}
