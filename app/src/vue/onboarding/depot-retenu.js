// @ts-check
// Ce qui retient la cuisine d'un projet que sa principale devrait déjà servir (ticket 1119, épique
// 1115), sous la ligne de ses stations : l'accès au dépôt refusé (ticket 1117) — une phrase, la raison puis
// le geste du chef —, ou un worktree que sa cuisine ne parvient pas à préparer (ticket 1118) — la raison et
// l'heure du prochain essai — ou, sans accès refusé, le refus de la station (ticket 1178) : pourquoi, ce que le
// chef fait, et le bouton de son remède (ticket 1205). Chacun remplace la phrase rassurante « prepares it within a minute » : le
// terminal de lancement n'est plus le seul endroit où le lire. Tout est lu par le process principal
// (projets/demande.ts) ; le runtime efface l'état dès que le geste est fait, et la page, relue, revient
// à son message. Ce module ne touche pas `document` : il reçoit de quoi créer un élément (briques.js).

import { boutonAction, confirmationDeGeste } from "../briques.js";
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
// Le geste se lit dans le refus seul (ticket 1205) : la station publie le remède qui le lève — ce qu'il fera,
// en une phrase, écrit sur le bouton avant tout clic, et s'il retire ou efface quelque chose —, ou pourquoi il
// n'y a pas de bouton. Ce module ne connaît aucun code de refus : un refus que la station ajoute demain montre
// son bouton sans rien changer ici. Un remède qui retire ou efface demande d'abord confirmation, avec la même
// phrase ; les autres partent au clic. Pendant que la station le joue, le bouton attend ; ensuite, levé, le
// refus quitte la page — ou elle dit en une phrase pourquoi il tient.
export const OUI = "yes, do it";
export const NON = "cancel";

// Où en est le remède du refus affiché, tel que la vue le tient d'une relecture à l'autre :
// - `confirmer` : son bouton est cliqué, la confirmation est ouverte ;
// - `en-cours` : la demande est partie vers `station`, qui le joue ;
// - `dit` : la station a répondu que le refus tient — ou rien n'est parti : la phrase, et son détail au survol.
/** @typedef {{ etape: "confirmer" } | { etape: "en-cours", station: string } | { etape: "dit", dit: string, detail?: string }} EtatDuRemede */
/** @typedef {{ etat?: EtatDuRemede, ouvrir: () => void, lancer: () => void, renoncer: () => void }} GestesDuRemede */

/** @param {Fabrique} doc @param {Refus} refus @param {GestesDuRemede} gestes */
function refusDit(doc, refus, { etat, ouvrir, lancer, renoncer }) {
  const pose = cree(doc, "div");
  const pourquoi = cree(doc, "p", refus.message);
  pourquoi.title = refus.code;
  const action = cree(doc, "p", refus.action);
  action.className = "refus-action";
  pose.append(pourquoi, action);
  const remede = refus.remedy;
  if (remede === undefined) {
    // Sans remède, la consigne écrite reste, et la raison de l'absence de bouton la suit.
    if (refus.noRemedy !== undefined) {
      const sans = cree(doc, "p", refus.noRemedy);
      sans.className = "sans-remede";
      pose.append(sans);
    }
    return pose;
  }
  if (etat?.etape === "confirmer") {
    pose.append(confirmationDeGeste(doc, { titre: remede.description, oui: OUI, non: NON }, { oui: lancer, non: renoncer }));
    return pose;
  }
  const geste = boutonAction(doc, remede.description, remede.destructive ? ouvrir : lancer, { recommande: true });
  pose.append(geste);
  if (etat?.etape === "en-cours") {
    const bouton = geste.children[0];
    if (bouton !== undefined) bouton.disabled = true;
    const attente = cree(doc, "p", `asking ${etat.station} to do it — it reads the app's requests every 30 s…`);
    attente.className = "remede-en-cours";
    pose.append(attente);
  } else if (etat?.etape === "dit") {
    const dit = cree(doc, "p", etat.dit);
    dit.className = "remede-dit";
    if (etat.detail !== undefined && etat.detail !== "") dit.title = etat.detail;
    pose.append(dit);
  }
  return pose;
}

// Le bloc à poser sous la ligne des stations, ou null : rien ne retient la cuisine. L'accès refusé
// prime sur l'échec du worktree — c'est lui que le geste lève — mais l'heure du prochain essai se dit
// avec, quand le worktree en a une.
/** @param {Fabrique} doc @param {{ acces?: Acces | null, refus?: Refus | null, worktree?: Echec | null, maintenant: number, copier: (commande: string) => void, remede?: GestesDuRemede }} retenu */
export function poserDepotRetenu(doc, { acces, refus, worktree, maintenant, copier, remede = { ouvrir: () => {}, lancer: () => {}, renoncer: () => {} } }) {
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
    pose.append(refusDit(doc, refuse, remede));
  } else if (worktree !== null && worktree !== undefined) {
    const raison = cree(doc, "p", `The worktree of #${worktree.ticket} could not be prepared: ${worktree.raison}`);
    raison.title = worktree.raison;
    pose.append(raison, cree(doc, "p", prochainEssaiDit(worktree.prochainEssai, maintenant)));
  }
  return pose;
}
