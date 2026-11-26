// @ts-check
// Les enregistrements parked (ticket 4281, épique 4129 ; spec 2026-11-24-simplified-process, règle 13) : ce que le TODO du
// chef lit de chaque ticket, et rien d'autre. Un enregistrement : le ticket, qui il attend — une personne, ou le chef —,
// pour quoi, jusqu'à quand — une date ou un fait —, et l'étape où le ticket en était. Ils se lisent ici dans les cartes
// que facts.ts rend (ticket 4238, `parque`) ; ce qui attend le chef, c'est le plan de la cuisine qui le dit (ticket 4261,
// `ceQuiTAttend`) : la vue n'en tire pas d'autre chemin.
// Ce module ne touche pas `document`.

/** @typedef {import("../../facts.ts").Card} Card */
// `title` : le titre du ticket, quand sa carte le dit.
/** @typedef {{ ticket: number, who: string, what: string | null, until: string | null, step: string | null, title?: string }} ParkedRecord */

// Qui un ticket parked pour le chef attend.
export const CHEF = "the chef";

// Une échéance de la box, un instant ISO, se dit par son jour ; un fait se dit tel quel.
const INSTANT = /^(\d{4}-\d{2}-\d{2})T/;
/** @param {string | null | undefined} jusqua */
const dayDe = (jusqua) => (jusqua === null || jusqua === undefined ? null : (INSTANT.exec(jusqua)?.[1] ?? jusqua));

// Les enregistrements des cartes qui attendent le chef — celles de son TODO : pour quoi, ce que sa carte en dit, ou rien
// de connu ; jusqu'à quand, son jour, ou aucun — jamais un mot inventé.
/** @param {readonly Card[]} cards @returns {ParkedRecord[]} */
export const chefRecords = (cards) =>
  cards.map(({ ticket, parque, etape: step, titre }) => ({ ticket, who: CHEF, what: parque?.quoi ?? null, until: dayDe(parque?.jusqua), step: step ?? null, ...(titre === undefined ? {} : { title: titre }) }));

// Ce qui attend le chef : les enregistrements dont « who » est lui, et aucun autre.
/** @param {readonly ParkedRecord[]} records @param {string} chef */
export const waitingFor = (records, chef) => records.filter(({ who }) => who === chef);
