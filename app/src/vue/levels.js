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
  // Le projet : son dépôt et sa branche d'intégration.
  depot: "project",
  branche: "project",
  // Cette machine : ses cooks, le dossier de ses espaces de travail, ce qu'elle sait faire, ses tickets ordinaires — et,
  // pour la station de cet ordinateur (ticket 2489), sa connexion à Claude.
  cooks: "machine",
  dossier: "machine",
  capacites: "machine",
  ordinaires: "machine",
  porte: "machine",
  claude: "machine",
  // La page d'une station (ticket 2642) : son nom, sa machine, ses cœurs, sa version et sa mise à jour.
  "station-nom": "machine",
  "station-machine": "machine",
  "station-coeurs": "machine",
  "station-version": "machine",
  "station-mise-a-jour": "machine",
  // Ce que la station donne à chaque projet qu'elle sert (ticket 2645) : sa part de cooks.
  "station-part-de-cooks": "machine",
  github: "machine",
  // Le moteur de ses cooks, son secours et sa clé d'API (ticket 3746, moteur/).
  moteur: "machine",
  // Toi : les couleurs de chaque projet, le sigle de sa case dans la barre, et l'état de la cuisine dans la barre des
  // menus (ticket 3269). L'app n'a aucune autre préférence d'affichage (ni thème, ni densité, ni taille de police) : quand
  // elle en aura une, sa ligne se posera ici, « you », avec son étiquette.
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
