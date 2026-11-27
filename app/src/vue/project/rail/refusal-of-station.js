// @ts-check
// Les refus des stations, sur l'onglet Rail (ticket 3198, épique 3196) : pour chaque station qui refuse le projet, une seule
// ligne — son nom, sa raison et le geste qui la lève, tels que la station les écrit (lus par
// cooking.ts : `dit` est la raison, `survol` le geste). Aucune station qui refuse : aucune ligne ; la ligne part quand la
// station ne refuse plus, puisqu'elle suit la lecture. Ce module ne touche pas `document` : il reçoit de quoi créer un élément.

// Sur le rail, chaque ligne offre son geste au chef (ticket 4238) : `ouvrir`, l'onglet Stations où le refus se lève.

import { button } from "../../components/button/button.js";
import { OPEN_COOKS } from "../../stations-of-cooking.js";

/** @typedef {import("../../bricks.js").Fabrique} Fabrique */
/** @typedef {Pick<import("../../../cooking.ts").LineOfStation, "station" | "etat" | "dit" | "survol">} LineOfRefusal */

// La ligne d'une station qui refuse : « box/claude refuses the project: <raison> <geste> ».
/** @param {LineOfRefusal} ligne */
export const sentenceOfRefusal = ({ station, dit: said, survol: hover }) => `${station} refuses the project: ${said} ${hover}`;

// Une ligne par station qui refuse, dans l'ordre des stations ; rien quand aucune ne refuse.
/** @param {Fabrique} doc @param {readonly LineOfRefusal[]} lines @param {() => void} [open] */
export function linesOfRefusal(doc, lines, open) {
  return lines
    .filter(({ etat: state }) => state === "refused")
    .map((line) => {
      const pose = doc.createElement("p");
      pose.className = "refus-de-station";
      pose.role = "alert";
      pose.textContent = sentenceOfRefusal(line);
      if (open !== undefined) pose.append(button(doc, OPEN_COOKS, open));
      return pose;
    });
}
