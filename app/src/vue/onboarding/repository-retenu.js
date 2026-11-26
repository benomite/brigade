// @ts-check
// Ce qui retient la cuisine d'un projet que sa principale devrait déjà servir (ticket 1119, épique
// 1115), sous la ligne de ses stations : l'accès au dépôt refusé (ticket 1117) — une phrase, la raison puis
// le geste du chef —, ou un worktree que sa cuisine ne parvient pas à préparer (ticket 1118) — la raison et
// l'heure du prochain essai — ou, sans accès refusé, le refus de la station (ticket 1178) : pourquoi, ce que le
// chef fait, et le bouton de son remède (ticket 1205). Chacun remplace la phrase rassurante « prepares it within a minute » : le
// terminal de lancement n'est plus le seul endroit où le lire. Tout est lu par le process principal
// (projets/demande.ts) ; le runtime efface l'état dès que le geste est fait, et la page, relue, revient
// à son message. Ce module ne touche pas `document` : il reçoit de quoi créer un élément (briques.js).

import { buttonAction } from "../briques.js";
import { confirmationDeAction } from "../composants/confirmation/confirmation.js";
import { lineError } from "../composants/line-error/line-error.js";
import { lineEmpty } from "../composants/line-empty/line-empty.js";
import { phrase, prochainTrialDit } from "./journey.js";
import { OUI as OUI_AVEC, ANNULER } from "../lexique.js";

/** @typedef {import("../briques.js").Fabrique} Fabrique */
/** @typedef {import("../../projects/request.ts").AccesBlocked} Acces */
/** @typedef {import("../../projects/request.ts").FailureDuWorktree} Failure */
/** @typedef {import("../../projects/request.ts").Refusal} Refusal */
/** @typedef {import("../../projects/request.ts").FailureDuClone} Clone */

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
export const commandDe = (acces) => /`([^`]+)`/.exec(acces.geste)?.[1] ?? acces.geste;

// Une phrase : la raison, puis le geste. Le geste dit sa commande entre accents graves, posée en code.
// Le geste se fait sur la machine de la station, que l'app ne pilote pas : son bouton copie la commande.
/** @param {Fabrique} doc @param {Acces} acces @param {(command: string) => void} copier */
function accesDit(doc, acces, copier) {
  const detail = DETAIL_DE_GIT.exec(acces.raison)?.[1];
  const raison = acces.raison.replace(DETAIL_DE_GIT, "").replace(/\.?$/, ".");
  const dit = phrase(doc, "p", `${raison} ${acces.geste}`);
  if (detail !== undefined) dit.title = `git: ${detail}`;
  const gesture = buttonAction(doc, COPIER, () => {
    copier(commandDe(acces));
    const button = gesture.children[0];
    if (button !== undefined) button.textContent = COPIEE;
  }, { recommande: true });
  const pose = cree(doc, "div");
  pose.append(dit, gesture);
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
export const OUI = OUI_AVEC("do it");
export const NON = ANNULER;

// Où en est le remède du refus affiché, tel que la vue le tient d'une relecture à l'autre :
// - `confirmer` : son bouton est cliqué, la confirmation est ouverte ;
// - `en-cours` : la demande est partie vers `station`, qui le joue ;
// - `dit` : la station a répondu que le refus tient — ou rien n'est parti : la phrase, et son détail au survol.
/** @typedef {{ etape: "confirmer" } | { etape: "en-cours", station: string } | { etape: "dit", dit: string, detail?: string }} StateDuRemede */
/** @typedef {{ etat?: StateDuRemede, ouvrir: () => void, lancer: () => void, renoncer: () => void }} ActionsDuRemede */

/** @param {Fabrique} doc @param {Refusal} refusal @param {ActionsDuRemede} gestes */
function refusalDit(doc, refusal, { etat: state, ouvrir, lancer, renoncer }) {
  const pose = cree(doc, "div");
  const pourquoi = lineError(doc, refusal.message, refusal.code);
  const action = cree(doc, "p", refusal.action);
  action.className = "refus-action";
  pose.append(pourquoi, action);
  const remede = refusal.remedy;
  if (remede === undefined) {
    // Sans remède, la consigne écrite reste, et la raison de l'absence de bouton la suit.
    if (refusal.noRemedy !== undefined) {
      pose.append(lineEmpty(doc, refusal.noRemedy, { classe: "sans-remede" }));
    }
    return pose;
  }
  if (state?.etape === "confirmer") {
    pose.append(confirmationDeAction(doc, { titre: remede.description, oui: OUI, non: NON }, { oui: lancer, non: renoncer }));
    return pose;
  }
  const gesture = buttonAction(doc, remede.description, remede.destructive ? ouvrir : lancer, { recommande: true });
  pose.append(gesture);
  if (state?.etape === "en-cours") {
    const button = gesture.children[0];
    if (button !== undefined) button.disabled = true;
    const wait = cree(doc, "p", `asking ${state.station} to do it — it reads the app's requests every 30 s…`);
    wait.className = "remede-en-cours";
    pose.append(wait);
  } else if (state?.etape === "dit") {
    const dit = cree(doc, "p", state.dit);
    dit.className = "remede-dit";
    if (state.detail !== undefined && state.detail !== "") dit.title = state.detail;
    pose.append(dit);
  }
  return pose;
}

// Le clone du dépôt en échec (ticket 1390), tel que la station le publie : la cause en une phrase — elle
// nomme le compte GitHub de la station —, le geste, un bouton par page de GitHub où le faire, et quand la
// station réessaie. Ce que gh et git ont dit n'est jamais le message : il reste derrière « details ».
export const DETAILS = "details";
export const OUVRIR_SUR_GITHUB = "open it on GitHub";

// L'écart entre deux essais, en mots : la station réessaie à chaque lecture, l'étape passe au vert seule.
/** @param {number} secondes */
export const reessaiDit = (secondes) => (secondes < 120 ? `${Math.max(1, Math.round(secondes))} s` : `${Math.round(secondes / 60)} min`);

/** @param {Fabrique} doc @param {Clone} clone @param {(url: string) => void} ouvrir */
function cloneDit(doc, clone, ouvrir) {
  const pose = cree(doc, "div");
  const gesture = phrase(doc, "p", clone.ou === "" ? clone.geste : `${clone.geste} ${clone.ou}`);
  gesture.className = "refus-action";
  pose.append(phrase(doc, "p", clone.raison), gesture);
  clone.liens.forEach((url, rang) => pose.append(buttonAction(doc, clone.liens.length === 1 ? OUVRIR_SUR_GITHUB : `open ${url.replace(/^https:\/\/github\.com\//, "")}`, () => ouvrir(url), { recommande: rang === 0 })));
  pose.append(cree(doc, "p", `Next retry within ${reessaiDit(clone.reessaieToutesLes)}: this turns green by itself once it is fixed.`));
  if (clone.detail !== "") {
    const details = cree(doc, "details");
    const resume = cree(doc, "summary", DETAILS);
    details.append(resume, cree(doc, "pre", clone.detail));
    pose.append(details);
  }
  return pose;
}

// Le bloc à poser sous la ligne des stations, ou null : rien ne retient la cuisine. L'accès refusé
// prime sur l'échec du worktree — c'est lui que le geste lève — mais l'heure du prochain essai se dit
// avec, quand le worktree en a une. Un clone en échec prime sur le refus qui l'accompagne : il dit la
// cause, le refus ne dit que « pas de copie ».
/** @param {Fabrique} doc @param {{ acces?: Acces | null, clone?: Clone | null, refus?: Refusal | null, worktree?: Failure | null, maintenant: number, copier: (command: string) => void, ouvrir?: (url: string) => void, remede?: ActionsDuRemede }} retenu */
export function poserRepositoryRetenu(doc, { acces, clone, refus: refusal, worktree, maintenant, copier, ouvrir = () => {}, remede = { ouvrir: () => {}, lancer: () => {}, renoncer: () => {} } }) {
  const blocked = acces ?? worktree?.acces ?? null;
  const sansCopie = blocked === null && clone !== null && clone !== undefined ? clone : null;
  const refuse = blocked === null && sansCopie === null && refusal !== null && refusal !== undefined ? refusal : null;
  if (blocked === null && sansCopie === null && refuse === null && (worktree === null || worktree === undefined)) return null;
  const pose = cree(doc, "div");
  pose.className = "depot-retenu";
  pose.role = "alert";
  if (blocked !== null) {
    pose.append(accesDit(doc, blocked, copier));
    if (worktree !== null && worktree !== undefined) pose.append(cree(doc, "p", prochainTrialDit(worktree.prochainEssai, maintenant)));
  } else if (sansCopie !== null) {
    pose.append(cloneDit(doc, sansCopie, ouvrir));
  } else if (refuse !== null) {
    pose.append(refusalDit(doc, refuse, remede));
  } else if (worktree !== null && worktree !== undefined) {
    const raison = cree(doc, "p", `The worktree of #${worktree.ticket} could not be prepared: ${worktree.raison}`);
    raison.title = worktree.raison;
    pose.append(raison, cree(doc, "p", prochainTrialDit(worktree.prochainEssai, maintenant)));
  }
  return pose;
}
