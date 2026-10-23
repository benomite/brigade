// @ts-check
// Les décisions du chef sur les lignes de la file du tableau de la cuisine (« Kitchen board », ticket 1590, épique
// 1580) : chaque ligne qui en attend une porte ses boutons — merger la PR, la renvoyer en cuisine, retirer le ticket du
// rail, répondre à sa carte —, postés en commentaire sur l'issue du tableau par le pont (app/src/tableau-gestes/), sans
// `ssh` ni tailnet. Après le clic, la ligne dit où en est le geste : en route, `pending` tant que la box ne l'a pas lu,
// puis `taken into account` ou `refused` et la ligne qu'elle a répondue — lue dans le bloc du tableau (`gestes`), par
// l'id du commentaire posté. Un post qui échoue se dit en une phrase sur la ligne, le détail au survol, et ses boutons
// restent. Un geste qui coûte se confirme d'abord, son prix en une ligne ; un choix de carte est la réponse même, comme
// sur la carte du rail (carte-todo.js).
// Ce module ne touche pas `document` : il reçoit de quoi créer un élément (briques.js), ce que la vue tient de chaque
// ligne, et rend des éléments.

import { boutonAction, confirmationDeGeste, survol } from "./briques.js";
import { poserCarteDeTodo, REPOS as CARTE_AU_REPOS } from "./carte-todo.js";

/** @typedef {import("./briques.js").Fabrique} Fabrique */
/** @typedef {import("../tableau-gestes/gestes.ts").DecisionDuChef} DecisionDuChef */
/** @typedef {import("../tableau-gestes/gestes.ts").EtatDuGeste} EtatDuGeste */
/** @typedef {import("../tableau-gestes/gestes.ts").CommentairePoste} CommentairePoste */
/** @typedef {import("../../../runtime/src/tableau/rendu/bloc.ts").LigneDeLaFile} LigneDeLaFile */
/** @typedef {import("../../../runtime/src/tableau/rendu/bloc.ts").GesteDuTableau} GesteDuTableau */
/** @typedef {"merge" | "send-back" | "set-aside"} GesteConfirme */

// Ce que la vue tient d'un geste envoyé, par ticket : en route, posté (le commentaire), ou rien n'est parti (pourquoi,
// en une phrase).
/**
 * @typedef {{ decision: DecisionDuChef, etape: "envoi" }
 *   | { decision: DecisionDuChef, etape: "poste", commentaire: CommentairePoste }
 *   | { decision: DecisionDuChef, etape: "echec", raison: string }} Suivi
 */
// Ce que la vue tient d'une ligne : le geste suivi, la confirmation ouverte, et ce que le chef a tapé — la raison d'un
// renvoi, la réponse à une carte —, que le rail redessiné lui rend.
/** @typedef {{ suivi?: Suivi, propose?: GesteConfirme, raison?: string, reponse?: string }} LigneTenue */
// Ce que les boutons demandent à la vue.
/**
 * @typedef {{
 *   decider: (decision: DecisionDuChef) => void,
 *   proposer: (ticket: number, geste: GesteConfirme | undefined) => void,
 *   ecrire: (ticket: number, champ: "raison" | "reponse", texte: string) => void,
 *   oublier: (ticket: number) => void,
 * }} DecisionsDuTableau
 */
// Où en est le geste d'une ligne, à l'écran.
/**
 * @typedef {{ etape: "repos" }
 *   | { etape: "envoi", decision: DecisionDuChef }
 *   | { etape: "echec", decision: DecisionDuChef, dit: string, detail: string }
 *   | { etape: "pending", decision: DecisionDuChef }
 *   | { etape: "taken", decision: DecisionDuChef, reponse: string }
 *   | { etape: "refused", decision: DecisionDuChef, reponse: string }} VuDuGeste
 */

export const MERGER = "merge the PR";
export const RENVOYER = "send back to the kitchen";
export const RETIRER = "remove from the rail";
export const ANNULER = "cancel";
export const EFFACER = "clear";
export const ENVOI = "sending…";
export const EN_ATTENTE = "pending";
export const PRIS = "taken into account";
export const REFUSE = "refused";
export const RAISON = "why, in a few words — optional";
// Le champ de la raison d'un renvoi, tel que la vue le reconnaît pour lui rendre le clavier (celui de la carte est
// `CHAMP_DE_CARTE`, carte-todo.js).
export const CHAMP_DE_RENVOI = "raison-renvoi";
export const SANS_PONT = "Nothing was posted: this app cannot post on the Kitchen board.";
// Ce que fait chaque geste, dit avant son prix — sous la box et son compte GitHub : c'est elle qui le joue
// (docs/tableau-gestes.md).
export const PRIX = {
  merge: "the PR is merged into the integration branch under the box's GitHub account, and the pass serves the ticket — a merge is not undone from the app",
  "send-back": "a cook takes the delivery again and spends what a cook spends; your reason, if you give one, becomes a candidate lesson of the project",
  "set-aside": "the ticket leaves the rail and is not cooked; its issue stays open and loses its `fire` label — put it back to bring the ticket back on the rail. Nothing is lost, nothing is spent",
};
// Le prix d'une réponse à une carte, selon la suite de son choix (runtime/src/reponse-carte.ts) — celui de la carte du rail.
const ECRITE = "your answer is written on the issue in your name";
/** @type {Record<string, string>} */
const PRIX_DE_SUITE = {
  merge: `${ECRITE}, and the green delivery is merged into the integration branch under the box's GitHub account — a merge is not undone from the app`,
  resume: `${ECRITE}, and the kitchen takes the ticket up again with it — a cook may be launched on the project's quota`,
};
const PRIX_DU_TEXTE = /** @type {string} */ (PRIX_DE_SUITE.resume);

/** @type {Record<GesteConfirme, string>} */
const LIBELLES = { merge: MERGER, "send-back": RENVOYER, "set-aside": RETIRER };
/** @type {Record<GesteConfirme, (ticket: number) => { titre: string, oui: string }>} */
const CONFIRMATIONS = {
  merge: (ticket) => ({ titre: `Merge the PR of #${ticket}?`, oui: "yes, merge it" }),
  "send-back": (ticket) => ({ titre: `Send the delivery of #${ticket} back to the kitchen?`, oui: "yes, send it back" }),
  "set-aside": (ticket) => ({ titre: `Remove #${ticket} from the rail?`, oui: "yes, remove it" }),
};

/** @param {Fabrique} doc @param {string} balise @param {string} [texte] */
function cree(doc, balise, texte) {
  const pose = doc.createElement(balise);
  if (texte !== undefined) pose.textContent = texte;
  return pose;
}

// Les gestes confirmés qu'une ligne offre, le recommandé d'abord quand elle en a un : une livraison qui attend le chef
// (`merge`, `remontee` avec sa PR) se merge, se renvoie en cuisine ou se retire — merger d'abord quand elle est verte,
// la renvoyer d'abord quand la pass l'a remontée ; tout autre ticket se retire du rail ; une ligne sans ticket (le
// disjoncteur, une station) n'en a aucun.
/** @param {LigneDeLaFile} ligne @returns {{ gestes: GesteConfirme[], recommande: GesteConfirme | undefined }} */
export function gestesDeLaLigne(ligne) {
  if (ligne.ticket === null) return { gestes: [], recommande: undefined };
  const pr = ligne.decision?.pr ?? null;
  if (ligne.quoi === "merge" && pr !== null) return { gestes: ["merge", "send-back", "set-aside"], recommande: "merge" };
  if (ligne.quoi === "remontee" && pr !== null) return { gestes: ["send-back", "merge", "set-aside"], recommande: "send-back" };
  return { gestes: ["set-aside"], recommande: undefined };
}

// Ce que la vue tient après la réponse du pont : posté, ou pourquoi rien n'est parti. Un pont qui ne poste pas rend rien.
/** @param {DecisionDuChef} decision @param {EtatDuGeste | undefined} rendu @returns {Suivi} */
export function apresEnvoi(decision, rendu) {
  if (rendu === undefined || rendu === null || typeof rendu !== "object") return { decision, etape: "echec", raison: SANS_PONT };
  if (rendu.etat === "failed") return { decision, etape: "echec", raison: rendu.raison };
  return { decision, etape: "poste", commentaire: rendu.commentaire };
}

// La ligne que la box a répondue, en texte : son markdown ôté (`**Done** — [merge #12](…) — cost: …`).
/** @param {string} reponse */
export function ligneDeLaBox(reponse) {
  return reponse
    .replace(/\[([^\]]*)\]\([^)]*\)/g, "$1")
    .replace(/\*\*|__|`/g, "")
    .replace(/\s+/g, " ")
    .trim();
}

// Un post qui échoue : une phrase sur la ligne ; ce que GitHub ou le réseau en a dit passe au survol.
const NON_POSTE = /^(The gesture could not be posted on the Kitchen board of \S+?): (.+?)\.?$/s;
/** @param {string} raison @returns {{ dit: string, detail: string }} */
export function echecDe(raison) {
  const lu = NON_POSTE.exec(raison);
  return lu === null ? { dit: raison, detail: "" } : { dit: `${lu[1]}.`, detail: lu[2] ?? "" };
}

// Où en est le geste suivi d'une ligne, d'après la dernière lecture du tableau : la box l'a pris ou refusé quand son bloc
// porte le commentaire posté ; sinon il attend.
/** @param {Suivi | undefined} suivi @param {readonly GesteDuTableau[] | undefined} gestesLus @returns {VuDuGeste} */
export function vuDuGeste(suivi, gestesLus) {
  if (suivi === undefined) return { etape: "repos" };
  const { decision } = suivi;
  if (suivi.etape === "envoi") return { etape: "envoi", decision };
  if (suivi.etape === "echec") return { etape: "echec", decision, ...echecDe(suivi.raison) };
  const lu = (gestesLus ?? []).find(({ commentaire }) => commentaire === suivi.commentaire.id);
  if (lu === undefined) return { etape: "pending", decision };
  return { etape: lu.etat === "pris" ? "taken" : "refused", decision, reponse: ligneDeLaBox(lu.reponse) };
}

// Un geste suivi attend encore la box : la vue relit alors le tableau plus souvent.
/** @param {Suivi | undefined} suivi @param {readonly GesteDuTableau[] | undefined} gestesLus */
export const attendLaBox = (suivi, gestesLus) => vuDuGeste(suivi, gestesLus).etape === "pending";

// Ce que le geste demandait, en deux mots.
/** @param {DecisionDuChef} decision @param {LigneDeLaFile["carte"]} [carte] */
export function ditDe(decision, carte) {
  switch (decision.geste) {
    case "merge":
      return MERGER;
    case "send-back":
      return RENVOYER;
    case "set-aside":
      return RETIRER;
    case "answer":
      return "your answer";
    case "choose": {
      const texte = carte?.choix[decision.choix - 1]?.texte;
      return texte === undefined ? `choice ${decision.choix}` : `“${texte}”`;
    }
  }
}

// La ligne qui dit où en est le geste : ce qu'il demandait, puis son état — et, refusé, la ligne de la box ; pris, elle
// passe au survol (elle dit ce que le geste a coûté). Rien au repos.
/** @param {Fabrique} doc @param {VuDuGeste} vu @param {LigneDeLaFile["carte"]} [carte] */
export function ligneDuGeste(doc, vu, carte) {
  if (vu.etape === "repos") return undefined;
  const pose = cree(doc, "p");
  pose.className = "geste-du-tableau";
  pose.dataset.etat = vu.etape;
  const quoi = cree(doc, "span", `${ditDe(vu.decision, carte)}: `);
  quoi.className = "quoi";
  pose.append(quoi);
  if (vu.etape === "envoi") pose.append(cree(doc, "strong", ENVOI));
  if (vu.etape === "pending") pose.append(cree(doc, "strong", EN_ATTENTE), survol(doc, "posted on the Kitchen board: the box reads it within a minute and answers under it"));
  if (vu.etape === "taken") pose.append(cree(doc, "strong", PRIS), ...(vu.reponse === "" ? [] : [survol(doc, vu.reponse)]));
  if (vu.etape === "refused") pose.append(cree(doc, "strong", REFUSE), cree(doc, "span", vu.reponse === "" ? "" : ` — ${vu.reponse}`));
  if (vu.etape === "echec") pose.append(cree(doc, "span", vu.dit), ...(vu.detail.trim() === "" ? [] : [survol(doc, vu.detail)]));
  return pose;
}

// La carte du tableau, telle que la carte du rail la pose (carte-todo.js) : chaque choix avec son prix.
/** @param {NonNullable<LigneDeLaFile["carte"]>} carte @returns {import("../carte-todo.ts").CarteDeTodo} */
const carteDeTodo = ({ type, question, choix }) => ({
  sorte: type,
  question,
  choix: choix.map(({ texte, suite }) => ({ texte, prix: PRIX_DE_SUITE[suite] ?? PRIX_DU_TEXTE })),
  prixDuTexte: PRIX_DU_TEXTE,
});

// Ce qu'une ligne de la file porte sous ce qu'elle dit : la ligne de son geste, s'il y en a un ; puis, tant qu'aucun
// n'est en attente de la box ou pris, ce qu'elle offre — sa carte, ses boutons, et la confirmation ouverte.
/**
 * @param {Fabrique} doc
 * @param {LigneDeLaFile} ligne
 * @param {LigneTenue} tenue
 * @param {readonly GesteDuTableau[] | undefined} gestesLus
 * @param {DecisionsDuTableau} decisions
 * @returns {any[]}
 */
export function poserLesDecisions(doc, ligne, tenue, gestesLus, decisions) {
  const { ticket, carte } = ligne;
  if (ticket === null) return [];
  const vu = vuDuGeste(tenue.suivi, gestesLus);
  const dit = ligneDuGeste(doc, vu, carte);
  if (vu.etape === "pending" || vu.etape === "taken") return dit === undefined ? [] : [dit];
  const enRoute = vu.etape === "envoi";
  const reponseEnRoute = enRoute && (vu.decision.geste === "answer" || vu.decision.geste === "choose");
  /** @type {any[]} */
  const poses = [];
  if (carte !== null) {
    const etat = reponseEnRoute ? { etape: /** @type {const} */ ("envoi"), reponse: { question: carte.question, texte: "" } } : CARTE_AU_REPOS;
    poses.push(
      ...poserCarteDeTodo(doc, ticket, carteDeTodo(carte), etat, { captures: [], brouillon: tenue.reponse ?? "", cle: `tableau#${ticket}` }, {
        repondre: (reponse) => decisions.decider("choix" in reponse ? { geste: "choose", ticket, choix: reponse.choix } : { geste: "answer", ticket, reponse: reponse.texte }),
        ecrire: (texte) => decisions.ecrire(ticket, "reponse", texte),
      }),
    );
  }
  // La carte dit elle-même qu'une réponse est en route.
  if (dit !== undefined && !reponseEnRoute) poses.push(dit);
  const { gestes, recommande } = gestesDeLaLigne(ligne);
  if (gestes.length === 0) return poses;
  const rangee = cree(doc, "div");
  rangee.className = "decisions";
  for (const geste of gestes) {
    const groupe = boutonAction(doc, LIBELLES[geste], () => decisions.proposer(ticket, tenue.propose === geste ? undefined : geste), { recommande: geste === recommande, prix: PRIX[geste] });
    const bouton = groupe.children?.[0];
    if (bouton !== undefined) bouton.disabled = enRoute;
    rangee.append(groupe);
  }
  poses.push(rangee);
  if (tenue.propose !== undefined && !enRoute) poses.push(confirmation(doc, ticket, tenue.propose, tenue.raison ?? "", decisions));
  return poses;
}

// La confirmation d'un geste qui coûte : ce qu'il fait, son prix en une ligne, et — pour un renvoi — le champ de sa
// raison, facultative.
/** @param {Fabrique} doc @param {number} ticket @param {GesteConfirme} geste @param {string} raison @param {DecisionsDuTableau} decisions */
function confirmation(doc, ticket, geste, raison, decisions) {
  const { titre, oui } = CONFIRMATIONS[geste](ticket);
  /** @type {any} */
  let champ;
  const decision = () => {
    if (geste !== "send-back") return { geste, ticket };
    const dite = String(champ?.value ?? raison).trim();
    return dite === "" ? { geste, ticket } : { geste, ticket, raison: dite };
  };
  const pose = confirmationDeGeste(doc, { titre, prix: PRIX[geste], oui, non: ANNULER }, { oui: () => decisions.decider(/** @type {DecisionDuChef} */ (decision())), non: () => decisions.proposer(ticket, undefined) });
  if (geste === "send-back") {
    champ = cree(doc, "textarea");
    champ.value = raison;
    champ.rows = 2;
    champ.placeholder = RAISON;
    champ.ariaLabel = `why the delivery of #${ticket} goes back to the kitchen — optional`;
    champ.dataset.cle = `tableau#${ticket}`;
    champ.dataset.champ = CHAMP_DE_RENVOI;
    champ.addEventListener("input", () => decisions.ecrire(ticket, "raison", champ.value));
    const textes = [...pose.children].filter((enfant) => enfant.className === "titre" || enfant.className === "prix");
    textes.at(-1)?.after(champ);
  }
  pose.dataset.geste = geste;
  return pose;
}

// Les gestes suivis dont la ligne a quitté la file — la box les a pris, le plus souvent : chacun se dit encore, avec
// son ticket, jusqu'à ce que le chef l'efface.
/**
 * @param {Fabrique} doc
 * @param {readonly { ticket: number, suivi: Suivi }[]} partis
 * @param {readonly GesteDuTableau[] | undefined} gestesLus
 * @param {DecisionsDuTableau} decisions
 */
export function poserLesGestesPartis(doc, partis, gestesLus, decisions) {
  if (partis.length === 0) return [];
  const liste = cree(doc, "ol");
  liste.className = "gestes-partis";
  for (const { ticket, suivi } of partis) {
    const bon = cree(doc, "li");
    bon.className = "bon";
    const tete = cree(doc, "div");
    const nom = cree(doc, "span", `#${ticket}`);
    nom.className = "ticket mono";
    const efface = cree(doc, "button", EFFACER);
    efface.type = "button";
    efface.className = "pr";
    efface.title = `forget this gesture: #${ticket} is no longer in the queue`;
    efface.addEventListener("click", () => decisions.oublier(ticket));
    tete.append(nom, cree(doc, "small", "no longer in the queue"));
    const dit = ligneDuGeste(doc, vuDuGeste(suivi, gestesLus));
    bon.append(tete, ...(dit === undefined ? [] : [dit]), efface);
    liste.append(bon);
  }
  return [liste];
}
