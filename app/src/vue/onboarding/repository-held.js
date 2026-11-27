// @ts-check
// Ce qui retient la cuisine d'un projet que sa principale devrait déjà servir (ticket 1119, épique
// 1115), sous la ligne de ses stations : l'accès au dépôt refusé (ticket 1117) — une phrase, la raison puis
// le geste du chef —, ou un worktree que sa cuisine ne parvient pas à préparer (ticket 1118) — la raison et
// l'heure du prochain essai — ou, sans accès refusé, le refus de la station (ticket 1178) : pourquoi, ce que le
// chef fait, et le bouton de son remède (ticket 1205). Chacun remplace la phrase rassurante « prepares it within a minute » : le
// terminal de lancement n'est plus le seul endroit où le lire. Tout est lu par le process principal
// (projets/demande.ts) ; le runtime efface l'état dès que le geste est fait, et la page, relue, revient
// à son message. Ce module ne touche pas `document` : il reçoit de quoi créer un élément (bricks.js).

import { buttonAction } from "../bricks.js";
import { confirmationOfAction } from "../components/confirmation/confirmation.js";
import { lineError } from "../components/line-error/line-error.js";
import { lineEmpty } from "../components/line-empty/line-empty.js";
import { sentence, nextTrialSays } from "./journey.js";
import { YES as YES_WITH, CANCEL } from "../lexicon.js";

/** @typedef {import("../bricks.js").Fabrique} Fabrique */
/** @typedef {import("../../projects/request.ts").AccessBlocked} Access */
/** @typedef {import("../../projects/request.ts").FailureOfWorktree} Failure */
/** @typedef {import("../../projects/request.ts").Refusal} Refusal */
/** @typedef {import("../../projects/request.ts").FailureOfClone} Clone */

// Le détail de git, que la raison de l'accès porte entre parenthèses à sa fin : au survol, pas à l'écran.
const DETAIL_OF_GIT = /\s*\(git: ([^)]*)\)\.?$/;

/** @param {Fabrique} doc @param {string} balise @param {string} [text] */
function created(doc, balise, text) {
  const pose = doc.createElement(balise);
  if (text !== undefined) pose.textContent = text;
  return pose;
}

export const COPY = "copy the command";
export const COPIED = "copied";

// La commande du geste : ce que le geste dit entre accents graves — sinon, tout le geste.
/** @param {Access} access */
export const commandOf = (access) => /`([^`]+)`/.exec(access.geste)?.[1] ?? access.geste;

// Une phrase : la raison, puis le geste. Le geste dit sa commande entre accents graves, posée en code.
// Le geste se fait sur la machine de la station, que l'app ne pilote pas : son bouton copie la commande.
/** @param {Fabrique} doc @param {Access} access @param {(command: string) => void} copy */
function accessSays(doc, access, copy) {
  const detail = DETAIL_OF_GIT.exec(access.raison)?.[1];
  const reason = access.raison.replace(DETAIL_OF_GIT, "").replace(/\.?$/, ".");
  const said = sentence(doc, "p", `${reason} ${access.geste}`);
  if (detail !== undefined) said.title = `git: ${detail}`;
  const gesture = buttonAction(doc, COPY, () => {
    copy(commandOf(access));
    const button = gesture.children[0];
    if (button !== undefined) button.textContent = COPIED;
  }, { recommande: true });
  const pose = created(doc, "div");
  pose.append(said, gesture);
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
export const YES = YES_WITH("do it");
export const NOT = CANCEL;

// Où en est le remède du refus affiché, tel que la vue le tient d'une relecture à l'autre :
// - `confirmer` : son bouton est cliqué, la confirmation est ouverte ;
// - `en-cours` : la demande est partie vers `station`, qui le joue ;
// - `dit` : la station a répondu que le refus tient — ou rien n'est parti : la phrase, et son détail au survol.
/** @typedef {{ etape: "confirmer" } | { etape: "en-cours", station: string } | { etape: "dit", dit: string, detail?: string }} StateOfRemedy */
/** @typedef {{ etat?: StateOfRemedy, ouvrir: () => void, lancer: () => void, renoncer: () => void }} ActionsOfRemedy */

/** @param {Fabrique} doc @param {Refusal} refusal @param {ActionsOfRemedy} gestes */
function refusalSays(doc, refusal, { etat: state, ouvrir: open, lancer: launch, renoncer: giveUp }) {
  const pose = created(doc, "div");
  const why = lineError(doc, refusal.message, refusal.code);
  const action = created(doc, "p", refusal.action);
  action.className = "refus-action";
  pose.append(why, action);
  const remedy = refusal.remedy;
  if (remedy === undefined) {
    // Sans remède, la consigne écrite reste, et la raison de l'absence de bouton la suit.
    if (refusal.noRemedy !== undefined) {
      pose.append(lineEmpty(doc, refusal.noRemedy, { classe: "sans-remede" }));
    }
    return pose;
  }
  if (state?.etape === "confirmer") {
    pose.append(confirmationOfAction(doc, { titre: remedy.description, oui: YES, non: NOT }, { oui: launch, non: giveUp }));
    return pose;
  }
  const gesture = buttonAction(doc, remedy.description, remedy.destructive ? open : launch, { recommande: true });
  pose.append(gesture);
  if (state?.etape === "en-cours") {
    const button = gesture.children[0];
    if (button !== undefined) button.disabled = true;
    const wait = created(doc, "p", `asking ${state.station} to do it — it reads the app's requests every 30 s…`);
    wait.className = "remede-en-cours";
    pose.append(wait);
  } else if (state?.etape === "dit") {
    const said = created(doc, "p", state.dit);
    said.className = "remede-dit";
    if (state.detail !== undefined && state.detail !== "") said.title = state.detail;
    pose.append(said);
  }
  return pose;
}

// Le clone du dépôt en échec (ticket 1390), tel que la station le publie : la cause en une phrase — elle
// nomme le compte GitHub de la station —, le geste, un bouton par page de GitHub où le faire, et quand la
// station réessaie. Ce que gh et git ont dit n'est jamais le message : il reste derrière « details ».
export const DETAILS = "details";
export const OPEN_ON_GITHUB = "open it on GitHub";

// L'écart entre deux essais, en mots : la station réessaie à chaque lecture, l'étape passe au vert seule.
/** @param {number} seconds */
export const retrySays = (seconds) => (seconds < 120 ? `${Math.max(1, Math.round(seconds))} s` : `${Math.round(seconds / 60)} min`);

/** @param {Fabrique} doc @param {Clone} clone @param {(url: string) => void} open */
function cloneSays(doc, clone, open) {
  const pose = created(doc, "div");
  const gesture = sentence(doc, "p", clone.ou === "" ? clone.geste : `${clone.geste} ${clone.ou}`);
  gesture.className = "refus-action";
  pose.append(sentence(doc, "p", clone.raison), gesture);
  clone.liens.forEach((url, rank) => pose.append(buttonAction(doc, clone.liens.length === 1 ? OPEN_ON_GITHUB : `open ${url.replace(/^https:\/\/github\.com\//, "")}`, () => open(url), { recommande: rank === 0 })));
  pose.append(created(doc, "p", `Next retry within ${retrySays(clone.reessaieToutesLes)}: this turns green by itself once it is fixed.`));
  if (clone.detail !== "") {
    const details = created(doc, "details");
    const resume = created(doc, "summary", DETAILS);
    details.append(resume, created(doc, "pre", clone.detail));
    pose.append(details);
  }
  return pose;
}

// Le bloc à poser sous la ligne des stations, ou null : rien ne retient la cuisine. L'accès refusé
// prime sur l'échec du worktree — c'est lui que le geste lève — mais l'heure du prochain essai se dit
// avec, quand le worktree en a une. Un clone en échec prime sur le refus qui l'accompagne : il dit la
// cause, le refus ne dit que « pas de copie ».
/** @param {Fabrique} doc @param {{ acces?: Access | null, clone?: Clone | null, refus?: Refusal | null, worktree?: Failure | null, maintenant: number, copier: (command: string) => void, ouvrir?: (url: string) => void, remede?: ActionsOfRemedy }} retenu */
export function setRepositoryHeld(doc, { acces: access, clone, refus: refusal, worktree, maintenant: now, copier: copy, ouvrir: open = () => {}, remede: remedy = { ouvrir: () => {}, lancer: () => {}, renoncer: () => {} } }) {
  const blocked = access ?? worktree?.acces ?? null;
  const withoutCopy = blocked === null && clone !== null && clone !== undefined ? clone : null;
  const refuses = blocked === null && withoutCopy === null && refusal !== null && refusal !== undefined ? refusal : null;
  if (blocked === null && withoutCopy === null && refuses === null && (worktree === null || worktree === undefined)) return null;
  const pose = created(doc, "div");
  pose.className = "depot-retenu";
  pose.role = "alert";
  if (blocked !== null) {
    pose.append(accessSays(doc, blocked, copy));
    if (worktree !== null && worktree !== undefined) pose.append(created(doc, "p", nextTrialSays(worktree.prochainEssai, now)));
  } else if (withoutCopy !== null) {
    pose.append(cloneSays(doc, withoutCopy, open));
  } else if (refuses !== null) {
    pose.append(refusalSays(doc, refuses, remedy));
  } else if (worktree !== null && worktree !== undefined) {
    const reason = created(doc, "p", `The worktree of #${worktree.ticket} could not be prepared: ${worktree.raison}`);
    reason.title = worktree.raison;
    pose.append(reason, created(doc, "p", nextTrialSays(worktree.prochainEssai, now)));
  }
  return pose;
}
