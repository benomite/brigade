// @ts-check
// Ce qu'un réglage de la page d'une station fait quand son contrôle change (ticket 2920) : il s'applique tout de suite, par
// le geste que la section lui donne — il n'y a pas de « Save ». Le temps que le changement court, ses contrôles sont
// désactivés et la rangée dit « applying… » ; puis, sous elle, ce qu'il a rendu (ditDuReglage, composants/reglage) : le
// refus et son détail, ce qui est fait, ou rien. Chaque section de `sections/` passe par ici, pour qu'un réglage de la
// page s'applique partout de la même façon. Ce module ne touche pas `document` : il reçoit de quoi créer un élément.

import { ditDuReglage } from "../../composants/reglage/reglage.js";

/** @typedef {import("../../briques.js").Fabrique} Fabrique */
/** @typedef {import("../../composants/reglage/reglage.js").Dit} Dit */
/** @typedef {{ refus: string, detail?: string } | { fait: string } | string | void | undefined} Rendu */

export const EN_COURS = "applying…";
export const RIEN_N_A_CHANGE = "nothing was changed";

// Pose sous une rangée ce que son dernier changement a rendu, à la place de ce qu'il avait dit.
/** @param {Fabrique} doc @param {any} rangee @param {Dit | undefined} dit */
export function dire(doc, rangee, dit) {
  for (const ancien of [...rangee.children]) if (String(ancien.className).split(" ").includes("dit")) ancien.remove();
  rangee.append(...ditDuReglage(doc, dit));
}

// Ce qu'un geste a rendu, dit comme une rangée le dit : une phrase est ce qui est fait ; ce qui n'est ni une phrase, ni
// un refus, ni un « fait » ne dit rien.
/** @param {Rendu} rendu @returns {Dit | undefined} */
export function ditDe(rendu) {
  if (typeof rendu === "string") return rendu === "" ? undefined : { fait: rendu };
  if (typeof rendu !== "object" || rendu === null) return undefined;
  if ("refus" in rendu && typeof rendu.refus === "string") return rendu.detail === undefined ? { refus: rendu.refus } : { refus: rendu.refus, detail: rendu.detail };
  if ("fait" in rendu && typeof rendu.fait === "string") return { fait: rendu.fait };
  return undefined;
}

// Applique un changement : `controles` désactivés et « applying… » sous la rangée le temps qu'il court, puis ce qu'il a
// rendu. Un geste qui lève est un refus, son message au survol. Rend ce qui a été dit.
/** @param {Fabrique} doc @param {any} rangee @param {any[]} controles @param {() => Rendu | Promise<Rendu>} geste */
export async function appliquer(doc, rangee, controles, geste) {
  for (const controle of controles) controle.disabled = true;
  dire(doc, rangee, { enCours: EN_COURS });
  /** @type {Dit | undefined} */
  let dit;
  try {
    dit = ditDe(await geste());
  } catch (erreur) {
    dit = { refus: RIEN_N_A_CHANGE, detail: erreur instanceof Error ? erreur.message : String(erreur) };
  }
  for (const controle of controles) controle.disabled = false;
  dire(doc, rangee, dit);
  return dit;
}
