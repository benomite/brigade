// @ts-check
// Au premier lancement, tant que l'app n'a aucun projet (ticket 3734) : la façon habituelle d'ajouter un projet — « open
// this project », ou « Add a project » —, et à côté d'elle « try on a demo project » (demo/demo.js), quand le pont sait
// créer la démo. Ce module ne touche pas `document`.

import { gestes } from "../parcours-projet/connexion.js";
import { boutonDuProjetDEssai } from "../demo/demo.js";

/** @typedef {import("../briques.js").Fabrique} Fabrique */

// Le bouton habituel, puis celui de la démo : une rangée de gestes.
/** @param {Fabrique} doc @param {any} usuel @param {import("../demo/demo.js").EtatDeLEssai | undefined} demo @param {(() => void) | undefined} essayer */
export function ajoutOuDemo(doc, usuel, demo, essayer) {
  return gestes(doc, [usuel, ...(essayer === undefined ? [] : [boutonDuProjetDEssai(doc, demo ?? {}, { essayer })])]);
}
