// @ts-check
// À quel niveau vit chaque réglage que l'app montre (ticket 1310, épique 1301) : « project » — dans le dépôt du
// projet, il change par une PR —, « this machine » — sur la station, privé, jamais dans git — ou « you » — les
// préférences du chef dans l'app, comme les couleurs d'un projet. Une seule table dit le niveau de chacun ; la vue
// pose l'étiquette par `niveauDe`, qui lève sur un réglage que la table ne connaît pas : un réglage montré sans
// niveau ne se rend pas, et le test le voit. Ce module ne touche pas `document` : il reçoit de quoi créer un élément.

import { LEVELS_SAID, levelSetting } from "./station/page/SettingLevel.js";

// Les mots de chaque niveau, et sa marque, sont ceux de la marque partagée (station/page/SettingLevel.js).
export { LEVELS_SAID };

/** @typedef {import("./bricks.js").Fabrique} Fabrique */
/** @typedef {import("./station/page/SettingLevel.js").Level} Level */

// Chaque réglage montré, et son niveau.
/** @type {Readonly<Record<string, Level>>} */
export const LEVELS = {
  // Cette machine : le dossier de ses espaces de travail et, pour la station de cet ordinateur (ticket 2489), sa connexion
  // à Claude.
  // Toi : les couleurs de chaque projet, le sigle de sa case dans la barre, et l'état de la cuisine dans la barre des
  // menus (ticket 3269). L'app n'a aucune autre préférence d'affichage (ni thème, ni densité, ni taille de police) : quand
  // elle en aura une, sa ligne se posera ici, « you », avec son étiquette.
  dossier: "machine",
  claude: "machine",
  couleurs: "you",
  sigle: "you",
  "barre-de-menus": "you",
};

// L'étiquette d'un réglage, à poser à côté de lui.
/** @param {Fabrique} doc @param {string} key */
export function levelOf(doc, key) {
  const level = LEVELS[key];
  if (level === undefined) throw new Error(`setting "${key}" has no level in levels.js`);
  return levelSetting(doc, level);
}
