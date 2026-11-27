// @ts-check
// Ce qu'un réglage de la page d'une station fait quand son contrôle change (ticket 2920) : il s'applique tout de suite, par
// le geste que la section lui donne — il n'y a pas de « Save ». Le temps que le changement court, ses contrôles sont
// désactivés et la rangée dit « applying… » ; puis, sous elle, ce qu'il a rendu (ditDuReglage, components/setting) : le
// refus et son détail, ce qui est fait, ou rien. Chaque section de `sections/` passe par ici, pour qu'un réglage de la
// page s'applique partout de la même façon. Ce module ne touche pas `document` : il reçoit de quoi créer un élément.

import { saysOfSetting } from "../../components/setting/setting.js";

/** @typedef {import("../../bricks.js").Fabrique} Fabrique */
/** @typedef {import("../../components/setting/setting.js").Says} Says */
/** @typedef {{ refus: string, detail?: string } | { fait: string } | string | void | undefined} Rendered */

export const IN_PROGRESS = "applying…";
export const NOTHING_N_A_CHANGE = "nothing was changed";

// Pose sous une rangée ce que son dernier changement a rendu, à la place de ce qu'il avait dit.
/** @param {Fabrique} doc @param {any} row @param {Says | undefined} said */
export function tell(doc, row, said) {
  for (const old of [...row.children]) if (String(old.className).split(" ").includes("dit")) old.remove();
  row.append(...saysOfSetting(doc, said));
}

// Ce qu'un geste a rendu, dit comme une rangée le dit : une phrase est ce qui est fait ; ce qui n'est ni une phrase, ni
// un refus, ni un « fait » ne dit rien.
/** @param {Rendered} rendered @returns {Says | undefined} */
export function saysOf(rendered) {
  if (typeof rendered === "string") return rendered === "" ? undefined : { fait: rendered };
  if (typeof rendered !== "object" || rendered === null) return undefined;
  if ("refus" in rendered && typeof rendered.refus === "string") return rendered.detail === undefined ? { refus: rendered.refus } : { refus: rendered.refus, detail: rendered.detail };
  if ("fait" in rendered && typeof rendered.fait === "string") return { fait: rendered.fait };
  return undefined;
}

// Applique un changement : `controles` désactivés et « applying… » sous la rangée le temps qu'il court, puis ce qu'il a
// rendu. Un geste qui lève est un refus, son message au survol. Rend ce qui a été dit.
/** @param {Fabrique} doc @param {any} row @param {any[]} checks @param {() => Rendered | Promise<Rendered>} action */
export async function apply(doc, row, checks, action) {
  for (const control of checks) control.disabled = true;
  tell(doc, row, { enCours: IN_PROGRESS });
  /** @type {Says | undefined} */
  let said;
  try {
    said = saysOf(await action());
  } catch (error) {
    said = { refus: NOTHING_N_A_CHANGE, detail: error instanceof Error ? error.message : String(error) };
  }
  for (const control of checks) control.disabled = false;
  tell(doc, row, said);
  return said;
}
