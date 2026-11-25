// @ts-check
// Les refus des stations, sur l'onglet Rail (ticket 3198, épique 3196) : pour chaque station qui refuse le projet, une seule
// ligne — son nom, sa raison et le geste qui la lève, tels que la station les écrit (runtime/src/projets/refus.ts, lus par
// cuisson.ts : `dit` est la raison, `survol` le geste). Aucune station qui refuse : aucune ligne ; la ligne part quand la
// station ne refuse plus, puisqu'elle suit la lecture. Ce module ne touche pas `document` : il reçoit de quoi créer un élément.

// Sur le rail, chaque ligne offre son geste au chef (ticket 4238) : `ouvrir`, l'onglet Stations où le refus se lève.

import { bouton } from "../../composants/bouton/bouton.js";
import { OUVRIR_COOKS } from "../../stations-de-cuisson.js";

/** @typedef {import("../../briques.js").Fabrique} Fabrique */
/** @typedef {Pick<import("../../../cuisson.ts").LigneDeStation, "station" | "etat" | "dit" | "survol">} LigneDeRefus */

// La ligne d'une station qui refuse : « box/claude refuses the project: <raison> <geste> ».
/** @param {LigneDeRefus} ligne */
export const phraseDuRefus = ({ station, dit, survol }) => `${station} refuses the project: ${dit} ${survol}`;

// Une ligne par station qui refuse, dans l'ordre des stations ; rien quand aucune ne refuse.
/** @param {Fabrique} doc @param {readonly LigneDeRefus[]} lignes @param {() => void} [ouvrir] */
export function lignesDeRefus(doc, lignes, ouvrir) {
  return lignes
    .filter(({ etat }) => etat === "refused")
    .map((ligne) => {
      const pose = doc.createElement("p");
      pose.className = "refus-de-station";
      pose.role = "alert";
      pose.textContent = phraseDuRefus(ligne);
      if (ouvrir !== undefined) pose.append(bouton(doc, OUVRIR_COOKS, ouvrir));
      return pose;
    });
}
