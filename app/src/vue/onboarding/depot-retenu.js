// @ts-check
// Ce qui retient la cuisine d'un projet que sa principale devrait déjà servir (ticket 1119, épique
// 1115), sous la ligne de ses stations : l'accès au dépôt refusé (ticket 1117) — une phrase, la raison puis
// le geste du chef —, ou un worktree que sa cuisine ne parvient pas à préparer (ticket 1118) — la raison et
// l'heure du prochain essai. Chacun remplace la phrase rassurante « prepares it within a minute » : le
// terminal de lancement n'est plus le seul endroit où le lire. Tout est lu par le process principal
// (projets/demande.ts) ; le runtime efface l'état dès que le geste est fait, et la page, relue, revient
// à son message. Ce module ne touche pas `document` : il reçoit de quoi créer un élément (briques.js).

import { phrase, prochainEssaiDit } from "./parcours.js";

/** @typedef {import("../briques.js").Fabrique} Fabrique */
/** @typedef {import("../../projets/demande.ts").AccesBloque} Acces */
/** @typedef {import("../../projets/demande.ts").EchecDuWorktree} Echec */

// Le détail de git, que la raison de l'accès porte entre parenthèses à sa fin : au survol, pas à l'écran.
const DETAIL_DE_GIT = /\s*\(git: ([^)]*)\)\.?$/;

/** @param {Fabrique} doc @param {string} balise @param {string} [texte] */
function cree(doc, balise, texte) {
  const pose = doc.createElement(balise);
  if (texte !== undefined) pose.textContent = texte;
  return pose;
}

// Une phrase : la raison, puis le geste. Le geste dit sa commande entre accents graves, posée en code.
/** @param {Fabrique} doc @param {Acces} acces */
function accesDit(doc, acces) {
  const detail = DETAIL_DE_GIT.exec(acces.raison)?.[1];
  const raison = acces.raison.replace(DETAIL_DE_GIT, "").replace(/\.?$/, ".");
  const dit = phrase(doc, "p", `${raison} ${acces.geste}`);
  if (detail !== undefined) dit.title = `git: ${detail}`;
  return dit;
}

// Le bloc à poser sous la ligne des stations, ou null : rien ne retient la cuisine. L'accès refusé
// prime sur l'échec du worktree — c'est lui que le geste lève — mais l'heure du prochain essai se dit
// avec, quand le worktree en a une.
/** @param {Fabrique} doc @param {{ acces?: Acces | null, worktree?: Echec | null, maintenant: number }} retenu */
export function poserDepotRetenu(doc, { acces, worktree, maintenant }) {
  const bloque = acces ?? worktree?.acces ?? null;
  if (bloque === null && (worktree === null || worktree === undefined)) return null;
  const pose = cree(doc, "div");
  pose.className = "depot-retenu";
  pose.role = "alert";
  if (bloque !== null) {
    pose.append(accesDit(doc, bloque));
    if (worktree !== null && worktree !== undefined) pose.append(cree(doc, "p", prochainEssaiDit(worktree.prochainEssai, maintenant)));
  } else if (worktree !== null && worktree !== undefined) {
    const raison = cree(doc, "p", `The worktree of #${worktree.ticket} could not be prepared: ${worktree.raison}`);
    raison.title = worktree.raison;
    pose.append(raison, cree(doc, "p", prochainEssaiDit(worktree.prochainEssai, maintenant)));
  }
  return pose;
}
