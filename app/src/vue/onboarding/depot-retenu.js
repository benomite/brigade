// @ts-check
// Ce qui retient la cuisine d'un projet que sa principale devrait déjà servir (ticket 1119, épique
// 1115), sous la ligne de ses stations : l'accès au dépôt refusé (ticket 1117) — une phrase, la raison puis
// le geste du chef —, ou un worktree que sa cuisine ne parvient pas à préparer (ticket 1118) — la raison et
// l'heure du prochain essai — ou, sans accès refusé, le refus de la station (ticket 1178) : pourquoi, et ce que le chef fait. Chacun remplace la phrase rassurante « prepares it within a minute » : le
// terminal de lancement n'est plus le seul endroit où le lire. Tout est lu par le process principal
// (projets/demande.ts) ; le runtime efface l'état dès que le geste est fait, et la page, relue, revient
// à son message. Ce module ne touche pas `document` : il reçoit de quoi créer un élément (briques.js).

import { boutonAction } from "../briques.js";
import { phrase, prochainEssaiDit } from "./parcours.js";

/** @typedef {import("../briques.js").Fabrique} Fabrique */
/** @typedef {import("../../projets/demande.ts").AccesBloque} Acces */
/** @typedef {import("../../projets/demande.ts").EchecDuWorktree} Echec */
/** @typedef {import("../../projets/demande.ts").Refus} Refus */

// Le détail de git, que la raison de l'accès porte entre parenthèses à sa fin : au survol, pas à l'écran.
const DETAIL_DE_GIT = /\s*\(git: ([^)]*)\)\.?$/;

/** @param {Fabrique} doc @param {string} balise @param {string} [texte] */
function cree(doc, balise, texte) {
  const pose = doc.createElement(balise);
  if (texte !== undefined) pose.textContent = texte;
  return pose;
}

export const COPIER = "copy the command";
export const COPIEE = "copied";

// La commande du geste : ce que le geste dit entre accents graves — sinon, tout le geste.
/** @param {Acces} acces */
export const commandeDe = (acces) => /`([^`]+)`/.exec(acces.geste)?.[1] ?? acces.geste;

// Une phrase : la raison, puis le geste. Le geste dit sa commande entre accents graves, posée en code.
// Le geste se fait sur la machine de la station, que l'app ne pilote pas : son bouton copie la commande.
/** @param {Fabrique} doc @param {Acces} acces @param {(commande: string) => void} copier */
function accesDit(doc, acces, copier) {
  const detail = DETAIL_DE_GIT.exec(acces.raison)?.[1];
  const raison = acces.raison.replace(DETAIL_DE_GIT, "").replace(/\.?$/, ".");
  const dit = phrase(doc, "p", `${raison} ${acces.geste}`);
  if (detail !== undefined) dit.title = `git: ${detail}`;
  const geste = boutonAction(doc, COPIER, () => {
    copier(commandeDe(acces));
    const bouton = geste.children[0];
    if (bouton !== undefined) bouton.textContent = COPIEE;
  }, { recommande: true });
  const pose = cree(doc, "div");
  pose.append(dit, geste);
  return pose;
}

// Le refus de la station (ticket 1178), tel qu'elle le publie : la phrase qui dit pourquoi, puis ce que
// le chef fait. Jamais le texte brut du fichier `en-service`, ni un chemin : le code n'est qu'au survol.
// Le geste attendu est un bouton (règle 830) : là où l'app sait le faire — retirer le projet, le ramener sur
// cette station —, il le fait ; sinon le geste est de la machine de la station, que l'app ne pilote pas, et le
// bouton copie l'action. Le runtime ne publie que du texte : le geste se choisit ici, d'après le code.
export const RETIRER = "remove the project";
export const CONFIRMER_RETRAIT = "confirm: remove it from its stations";
export const RAMENER = "move the kitchen back";
export const COPIER_L_ACTION = "copy the action";
const RETIRABLES = ["configuration-invalid", "clone-missing"];

/** @param {Fabrique} doc @param {Refus} refus @param {{ retirer: () => Promise<string>, ramener: () => void, copier: (texte: string) => void }} gestes */
function refusDit(doc, refus, { retirer, ramener, copier }) {
  const pose = cree(doc, "div");
  const pourquoi = cree(doc, "p", refus.message);
  pourquoi.title = refus.code;
  const action = cree(doc, "p", refus.action);
  action.className = "refus-action";
  const dit = cree(doc, "p");
  dit.hidden = true;
  /** @type {any} */
  let geste;
  if (RETIRABLES.includes(refus.code)) {
    let demande = false;
    geste = boutonAction(doc, RETIRER, async () => {
      const bouton = geste.children[0];
      if (!demande) {
        demande = true;
        if (bouton !== undefined) bouton.textContent = CONFIRMER_RETRAIT;
        return;
      }
      demande = false;
      if (bouton !== undefined) bouton.textContent = RETIRER;
      dit.textContent = await retirer();
      dit.hidden = false;
    }, { recommande: true });
  } else if (refus.code === "handed-over-elsewhere") {
    geste = boutonAction(doc, RAMENER, ramener, { recommande: true });
  } else {
    geste = boutonAction(doc, COPIER_L_ACTION, () => {
      copier(refus.action);
      const bouton = geste.children[0];
      if (bouton !== undefined) bouton.textContent = COPIEE;
    }, { recommande: true });
  }
  pose.append(pourquoi, action, geste, dit);
  return pose;
}

// Le bloc à poser sous la ligne des stations, ou null : rien ne retient la cuisine. L'accès refusé
// prime sur l'échec du worktree — c'est lui que le geste lève — mais l'heure du prochain essai se dit
// avec, quand le worktree en a une.
/** @param {Fabrique} doc @param {{ acces?: Acces | null, refus?: Refus | null, worktree?: Echec | null, maintenant: number, copier: (commande: string) => void, retirer?: () => Promise<string>, ramener?: () => void }} retenu */
export function poserDepotRetenu(doc, { acces, refus, worktree, maintenant, copier, retirer = async () => "", ramener = () => {} }) {
  const bloque = acces ?? worktree?.acces ?? null;
  const refuse = bloque === null && refus !== null && refus !== undefined ? refus : null;
  if (bloque === null && refuse === null && (worktree === null || worktree === undefined)) return null;
  const pose = cree(doc, "div");
  pose.className = "depot-retenu";
  pose.role = "alert";
  if (bloque !== null) {
    pose.append(accesDit(doc, bloque, copier));
    if (worktree !== null && worktree !== undefined) pose.append(cree(doc, "p", prochainEssaiDit(worktree.prochainEssai, maintenant)));
  } else if (refuse !== null) {
    pose.append(refusDit(doc, refuse, { retirer, ramener, copier }));
  } else if (worktree !== null && worktree !== undefined) {
    const raison = cree(doc, "p", `The worktree of #${worktree.ticket} could not be prepared: ${worktree.raison}`);
    raison.title = worktree.raison;
    pose.append(raison, cree(doc, "p", prochainEssaiDit(worktree.prochainEssai, maintenant)));
  }
  return pose;
}
