// @ts-check
// La note « sur place » de la page d'une station (ticket 2646, épique 2497) : sur la page d'une autre station, ce qui ne
// se règle que sur la machine elle-même n'offre aucun geste — une note le dit à la place. `gesteOuNote` est ce que les
// sections posent à côté d'un réglage : le geste quand la page est celle de cet ordinateur, ou quand le réglage se change
// à distance ; la note sinon. Ce module ne touche pas `document` : il reçoit de quoi créer un élément.

import { boutonAction } from "../../briques.js";
import { CET_ORDINATEUR } from "../../lexique.js";

/** @typedef {import("../../briques.js").Fabrique} Fabrique */

export const NOTE_SUR_PLACE = "only on this station";
export const SURVOL_DE_LA_NOTE = `This setting can only be changed on that machine itself, not from ${CET_ORDINATEUR}.`;

/** @param {Fabrique} doc */
export function noteSurPlace(doc) {
  const note = doc.createElement("span");
  note.className = "note-sur-place";
  note.textContent = NOTE_SUR_PLACE;
  note.title = SURVOL_DE_LA_NOTE;
  return note;
}

// Le bouton d'un réglage, ou sa note. `aDistance` : le réglage se change depuis une autre station que la sienne ; sinon il
// ne se change que sur la machine. Sans geste à offrir (`geste` absent), rien — sauf la note d'un réglage de la machine
// vu d'ailleurs, qui dit pourquoi il ne se règle pas d'ici.
/**
 * @param {Fabrique} doc
 * @param {{ lectureSeule: boolean }} contexte
 * @param {{ libelle: string, geste?: () => void, aDistance?: boolean, recommande?: boolean }} reglage
 */
export function gesteOuNote(doc, { lectureSeule }, { libelle, geste, aDistance = false, recommande = false }) {
  if (lectureSeule && !aDistance) return noteSurPlace(doc);
  if (geste === undefined) return undefined;
  return boutonAction(doc, libelle, geste, { recommande });
}
