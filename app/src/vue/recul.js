// @ts-check
// Sous la fiabilité des cooks, sur l'onglet Cooks (ticket 1001, épique 994 ; déplacée de Reliability par le ticket 1699) : ce que chaque correction
// acceptée des consignes du projet a fait de sa cause. Une carte par correction : la cause, ce qu'en dit
// le runtime — elle recule, ou non —, et côte à côte la part des tickets qu'elle a fait rater avant le
// merge de la correction, et après. Un ticket atteint ouvre sa fiche, comme ceux des causes.
// Tant qu'il n'y a rien à comparer — la correction pas encore mergée, ou aucun ticket fini depuis —, la
// carte le dit en toutes lettres, jamais par un chiffre. Sans correction acceptée, rien n'est posé.
// Tout est lu par le process principal (recul.ts) : la vue pose.
// Ce module ne touche pas `document` : il reçoit de quoi créer un élément (briques.js), et rend des éléments.

import { survol } from "./briques.js";

/** @typedef {import("./briques.js").Fabrique} Fabrique */
/** @typedef {import("../recul.ts").Recul} Recul */
/** @typedef {import("../recul.ts").Cote} Cote */

export const TITRE = "corrected causes: before and after the merge";
export const AVANT = "before the merge";
export const APRES = "after the merge";
export const RECULE = "recedes";
export const NE_RECULE_PAS = "does not recede";
export const PAS_ENCORE_MERGEE = "not merged yet";
export const NON_MERGEE = "not merged";
export const RIEN_A_COMPARER = "nothing to compare yet";
export const PAS_ENCORE = "not yet";

// Ce que chaque côté regarde, au survol de son nom : la règle du runtime (runtime/src/correctif/recul.ts).
const REGARDE_AVANT = "the share of tickets this cause made fail, among the last tickets finished before the merge — 20 at most";
const REGARDE_APRES = "the same share among the first tickets taken after the merge, once finished — 20 at most; a ticket taken before the merge and finished after it counts on neither side";

const s = (/** @type {number} */ combien) => (combien > 1 ? "s" : "");
const jour = (/** @type {string} */ instant) => (Number.isNaN(Date.parse(instant)) ? instant : new Date(instant).toLocaleDateString("en-US"));

// Chaque classe est posée en clair, `className = "…"` : la peau ne vise que des classes que la vue
// pose, et son test les lit ainsi (peau.test.ts).
/** @param {Fabrique} doc @param {string} balise @param {string} [texte] */
function cree(doc, balise, texte) {
  const pose = doc.createElement(balise);
  if (texte !== undefined) pose.textContent = texte;
  return pose;
}

// Un côté du merge : son nom (la règle au survol), sa part, sur combien de tickets, et ses derniers
// tickets atteints. `cote` nul : rien à y lire encore, et `vide` le dit à la place du chiffre.
/** @param {Fabrique} doc @param {string} nom @param {string} regle @param {Cote | null} cote @param {string} vide @param {(ticket: number, bouton: any) => void} ouvrir */
function unCote(doc, nom, regle, cote, vide, ouvrir) {
  const pose = cree(doc, "div");
  pose.className = "cote";
  const tete = cree(doc, "h4", nom);
  tete.append(survol(doc, regle));
  if (cote === null) {
    pose.className = "cote attente";
    const total = cree(doc, "p", PAS_ENCORE);
    total.className = "total";
    const dit = cree(doc, "p", vide);
    dit.className = "sur";
    pose.append(tete, total, dit);
    return pose;
  }
  const total = cree(doc, "p", `${cote.pourcent}%`);
  total.className = "total";
  const sur = cree(doc, "p", `${cote.atteints} of ${cote.tickets} ticket${s(cote.tickets)} failed because of it`);
  sur.className = "sur";
  pose.append(tete, total, sur);
  if (cote.derniers.length > 0) {
    const derniers = cree(doc, "span");
    derniers.className = "tickets";
    for (const ticket of cote.derniers) {
      const bouton = cree(doc, "button", `#${ticket}`);
      bouton.className = "mono";
      bouton.title = `open the sheet of #${ticket}`;
      bouton.addEventListener("click", () => ouvrir(ticket, bouton));
      derniers.append(bouton);
    }
    pose.append(derniers);
  }
  return pose;
}

// Ce que la carte dit de la correction, en un mot, dans son ton : la cause recule en vert, ne recule pas
// en rouge ; ce qui attend reste discret.
/** @param {Fabrique} doc @param {Recul} recul */
function verdict(doc, recul) {
  const dit = cree(doc, "span");
  if (recul.etat === "mesuree" && recul.recule) {
    dit.textContent = RECULE;
    dit.className = "verdict recule";
  } else if (recul.etat === "mesuree") {
    dit.textContent = NE_RECULE_PAS;
    dit.className = "verdict ne-recule-pas";
  } else {
    dit.textContent = recul.etat === "rien-a-comparer" ? RIEN_A_COMPARER : recul.etat === "en-cours" ? PAS_ENCORE_MERGEE : NON_MERGEE;
    dit.className = "verdict";
  }
  return dit;
}

// La correction, sa PR — son numéro en monospace, il se recopie —, et où elle en est.
/** @param {Fabrique} doc @param {Recul} recul */
function quand(doc, recul) {
  const ligne = cree(doc, "p");
  ligne.className = "portee";
  if (recul.pr === null) ligne.append("its correction");
  else {
    const pr = cree(doc, "span", `#${recul.pr}`);
    pr.className = "mono";
    ligne.append("its correction, PR ", pr, ",");
  }
  switch (recul.etat) {
    case "mesuree":
    case "rien-a-comparer":
      ligne.append(` merged on ${jour(recul.mergee)}`);
      break;
    case "en-cours":
      ligne.append(" is not merged yet: before and after are measured once it is");
      break;
    case "non-mergee":
      ligne.append(" will not be merged: nothing is measured");
      break;
  }
  return ligne;
}

// Une correction : sa cause et son verdict en tête, puis avant et après, côte à côte.
/** @param {Fabrique} doc @param {Recul} recul @param {(ticket: number, bouton: any) => void} ouvrir */
function uneCorrection(doc, recul, ouvrir) {
  const item = cree(doc, "li");
  item.className = "recul";
  const tete = cree(doc, "div");
  tete.className = "tete-recul";
  const cause = cree(doc, "span", recul.titre);
  cause.className = "titre";
  tete.append(cause, verdict(doc, recul));
  item.append(tete, quand(doc, recul));
  if (recul.etat === "mesuree" || recul.etat === "rien-a-comparer") {
    const cotes = cree(doc, "div");
    cotes.className = "cotes";
    cotes.append(
      unCote(doc, AVANT, REGARDE_AVANT, recul.avant, "no ticket finished before the merge", ouvrir),
      // Sans « avant », le runtime ne dit pas l'après : il n'aurait rien à quoi se comparer.
      unCote(doc, APRES, REGARDE_APRES, recul.etat === "mesuree" ? recul.apres : null, recul.avant === null ? "nothing before the merge to compare it with" : "no ticket taken after the merge is finished yet", ouvrir),
    );
    item.append(cotes);
  }
  return item;
}

// La section entière, ou rien : sans correction acceptée, la page n'en dit rien.
/** @param {Fabrique} doc @param {Recul[] | undefined} reculs @param {(ticket: number, bouton: any) => void} ouvrir */
export function poserReculs(doc, reculs, ouvrir) {
  if (reculs === undefined || reculs.length === 0) return [];
  const bloc = cree(doc, "div");
  bloc.className = "reculs-fiabilite";
  const liste = cree(doc, "ol");
  liste.className = "reculs";
  liste.append(...reculs.map((recul) => uneCorrection(doc, recul, ouvrir)));
  bloc.append(cree(doc, "h2", TITRE), liste);
  return [bloc];
}
