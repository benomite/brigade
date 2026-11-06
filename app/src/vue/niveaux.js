// @ts-check
// À quel niveau vit chaque réglage que l'app montre (ticket 1310, épique 1301) : « project » — dans le dépôt du
// projet, il change par une PR —, « this machine » — sur la station, privé, jamais dans git — ou « you » — les
// préférences du chef dans l'app, comme les couleurs d'un projet. Une seule table dit le niveau de chacun ; la vue
// pose l'étiquette par `niveauDe`, qui lève sur un réglage que la table ne connaît pas : un réglage montré sans
// niveau ne se rend pas, et le test le voit. Ce module ne touche pas `document` : il reçoit de quoi créer un élément.

import { NIVEAUX_DITS, niveauReglage } from "./station/page/NiveauReglage.js";

// Les mots de chaque niveau, et sa marque, sont ceux de la marque partagée (station/page/NiveauReglage.js).
export { NIVEAUX_DITS };

/** @typedef {import("./briques.js").Fabrique} Fabrique */
/** @typedef {import("./station/page/NiveauReglage.js").Niveau} Niveau */

// Chaque réglage montré, et son niveau.
/** @type {Readonly<Record<string, Niveau>>} */
export const NIVEAUX = {
  // Le projet : son dépôt, sa branche d'intégration, les calibrages par défaut de son manager et de son reviewer, son plafond,
  // et les réglages de son closer (ticket 1685).
  depot: "project",
  branche: "project",
  manager: "project",
  reviewer: "project",
  plafond: "project",
  calibrage: "project",
  closer: "project",
  "closer-cooks": "project",
  "closer-tokens": "project",
  "closer-lines": "project",
  // Cette machine : ses cooks, le dossier de ses espaces de travail, ce qu'elle sait faire, ses tickets ordinaires — et,
  // sur l'onglet Stations (ticket 2488), si une station sert le projet : la déclaration que sa station principale tient ;
  // pour la station de cet ordinateur (ticket 2489), sa connexion à Claude.
  cooks: "machine",
  dossier: "machine",
  capacites: "machine",
  ordinaires: "machine",
  porte: "machine",
  sert: "machine",
  claude: "machine",
  // La page d'une station (ticket 2642) : son nom, sa machine, ses cœurs, sa version et sa mise à jour.
  "station-nom": "machine",
  "station-machine": "machine",
  "station-coeurs": "machine",
  "station-version": "machine",
  "station-mise-a-jour": "machine",
  // Ce que la station donne à chaque projet qu'elle sert (ticket 2645) : sa part de cooks.
  "station-part-de-cooks": "machine",
  // Toi : les couleurs de chaque projet, et le sigle de sa case dans la barre. L'app n'a aucune autre préférence
  // d'affichage (ni thème, ni densité, ni taille de police) : quand elle en aura une, sa ligne se posera ici, « you »,
  // avec son étiquette.
  couleurs: "you",
  sigle: "you",
};

// L'étiquette d'un réglage, à poser à côté de lui.
/** @param {Fabrique} doc @param {string} cle */
export function niveauDe(doc, cle) {
  const niveau = NIVEAUX[cle];
  if (niveau === undefined) throw new Error(`setting "${cle}" has no level in niveaux.js`);
  return niveauReglage(doc, niveau);
}
