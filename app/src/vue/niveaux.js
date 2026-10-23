// @ts-check
// À quel niveau vit chaque réglage que l'app montre (ticket 1310, épique 1301) : « project » — dans le dépôt du
// projet, il change par une PR —, « this machine » — sur la station, privé, jamais dans git — ou « you » — les
// préférences du chef dans l'app, comme les couleurs d'un projet. Une seule table dit le niveau de chacun ; la vue
// pose l'étiquette par `niveauDe`, qui lève sur un réglage que la table ne connaît pas : un réglage montré sans
// niveau ne se rend pas, et le test le voit. Ce module ne touche pas `document` : il reçoit de quoi créer un élément.

/** @typedef {import("./briques.js").Fabrique} Fabrique */
/** @typedef {"project" | "machine" | "you"} Niveau */

/** @type {Readonly<Record<Niveau, { libelle: string, survol: string }>>} */
export const NIVEAUX_DITS = {
  project: { libelle: "project", survol: "kept in the project's repository — shared with everyone who clones it, and changed by a pull request" },
  machine: { libelle: "this machine", survol: "kept on this machine's station — private, never written to the repository" },
  you: { libelle: "you", survol: "your preference in the app — it follows you, not the project" },
};

// Chaque réglage montré, et son niveau.
/** @type {Readonly<Record<string, Niveau>>} */
export const NIVEAUX = {
  // Le projet : son dépôt, sa branche d'intégration, les calibrages par défaut de son manager et de son reviewer, son plafond.
  depot: "project",
  branche: "project",
  manager: "project",
  reviewer: "project",
  plafond: "project",
  calibrage: "project",
  // Cette machine : ses cooks, le dossier de ses espaces de travail, ce qu'elle sait faire, ses tickets ordinaires.
  cooks: "machine",
  dossier: "machine",
  capacites: "machine",
  ordinaires: "machine",
  // Toi : les couleurs de chaque projet, et les préférences d'affichage.
  couleurs: "you",
  affichage: "you",
};

// L'étiquette d'un réglage, à poser à côté de lui.
/** @param {Fabrique} doc @param {string} cle */
export function niveauDe(doc, cle) {
  const niveau = NIVEAUX[cle];
  if (niveau === undefined) throw new Error(`setting "${cle}" has no level in niveaux.js`);
  const pose = doc.createElement("span");
  pose.className = "niveau";
  pose.dataset.niveau = niveau;
  pose.textContent = NIVEAUX_DITS[niveau].libelle;
  pose.title = NIVEAUX_DITS[niveau].survol;
  return pose;
}
