// @ts-check
// Les enregistrements parked (ticket 4281, épique 4129 ; spec 2026-11-24-simplified-process, règle 13) : ce que le TODO du
// chef et le contrôle de park lisent, et rien d'autre. Un enregistrement : le ticket, qui il attend — une personne, ou le
// chef —, pour quoi, jusqu'à quand — une date ou un fait —, et l'étape où le ticket en était. Ils se lisent ici dans les
// cartes que faits.ts rend (ticket 4238, `parque`) : la vue n'en tire pas d'autre chemin.
// Ce module ne touche pas `document`.

/** @typedef {import("../../faits.ts").Carte} Carte */
// `title` : le titre du ticket, quand sa carte le dit ; `note` : pourquoi la réponse du chef n'est pas partie.
/** @typedef {{ ticket: number, who: string, what: string | null, until: string | null, step: string | null, title?: string, note?: string }} ParkedRecord */
/** @typedef {{ envoi: true } | { fait: string, detail: string } | { refus: string, detail: string }} Arrivee */

// Qui un ticket parked pour le chef attend.
export const CHEF = "chef";

// Une échéance de la box, un instant ISO, se dit par son jour ; un fait se dit tel quel.
const INSTANT = /^(\d{4}-\d{2}-\d{2})T/;
/** @param {string | null} jusqua */
const jourDe = (jusqua) => (jusqua === null ? null : (INSTANT.exec(jusqua)?.[1] ?? jusqua));

// Pour quoi le ticket attend : ce que sa carte en dit (« waiting for »), ou rien de connu — jamais un mot inventé.
/** @param {Carte} carte */
const quoiDe = (carte) => carte.dit.find(({ libelle }) => libelle === "waiting for")?.valeur ?? null;

/**
 * Les enregistrements parked d'un projet, lus dans ses cartes. `arrivees` : ce que « back to the kitchen » est devenu pour
 * chaque ticket (`<projet>#<ticket>`) — parti ou en route, il ne l'attend plus ; refusé, il l'attend encore, et son
 * enregistrement dit pourquoi.
 * @param {readonly Carte[]} cartes @param {string} projet @param {ReadonlyMap<string, Arrivee>} [arrivees]
 * @returns {ParkedRecord[]}
 */
export function parkedRecords(cartes, projet, arrivees = new Map()) {
  return cartes.flatMap((carte) => {
    const { parque, ticket } = carte;
    if (parque === undefined) return [];
    const arrivee = arrivees.get(`${projet}#${ticket}`);
    if (arrivee !== undefined && !("refus" in arrivee)) return [];
    /** @type {ParkedRecord} */
    const record = { ticket, who: parque.chef === true ? CHEF : parque.qui, what: quoiDe(carte), until: jourDe(parque.jusqua), step: carte.etape ?? null, ...(carte.titre === undefined ? {} : { title: carte.titre }) };
    return [arrivee === undefined ? record : { ...record, note: arrivee.refus }];
  });
}

// Ce qui attend le chef : les enregistrements dont « who » est lui, et aucun autre.
/** @param {readonly ParkedRecord[]} records @param {string} chef */
export const waitingFor = (records, chef) => records.filter(({ who }) => who === chef);

// Les cartes du TODO qui ne sont pas parked pour le chef : celles-là, le TODO les montre avec leurs boutons (parked-todo.js).
/** @param {readonly Carte[]} cartes */
export const notParkedForChef = (cartes) => cartes.filter(({ parque }) => parque?.chef !== true);

// La carte d'un ticket, pour ouvrir sa fiche depuis son item.
/** @param {readonly Carte[]} cartes @param {number} ticket */
export const cardOf = (cartes, ticket) => cartes.find((carte) => carte.ticket === ticket);
