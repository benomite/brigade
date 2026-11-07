// @ts-check
// Les temps des derniers tickets d'un projet, sur sa page (ticket 2346, épique 2336) : la médiane et le plus lent des
// 10 derniers tickets mesurés, avec le partage en cinq phases (cuisson avec ses tests, attente de la passe, revue, CI,
// merge), et leur temps perdu contre le seuil du projet (ticket 2670). Les enregistrements sont ceux de
// `.claude/brigade/temps-tickets.json` (secondes entières) ; le temps perdu d'un ticket est son `perdu` (l'attente avant
// la prise, les cuissons ratées, les renvois — 0 sur un enregistrement plus ancien qui ne le porte pas) ; le seuil est
// `lostTimeMaxMin` de `.claude/brigade/projet.json` (2 minutes par défaut), sur la médiane du temps perdu. Le temps total
// d'un ticket n'a pas de plafond : sa taille varie. Ce module ne touche pas `document` : il reçoit de quoi créer un
// élément (briques.js) et rend le bloc.

import { survol } from "../briques.js";

/** @typedef {import("../briques.js").Fabrique} Fabrique */
/** @typedef {{ ticket: number, claimedAt: string, mergedAt: string, cuisson: number, cuissonTests: number, attentePasse: number, revue: number, ci: number, merge: number }} Enregistrement */
/** @typedef {{ enregistrements: unknown[] | undefined, lostTimeMaxMin?: number | undefined, resume?: unknown, chiffres?: unknown }} TempsDuProjet */

export const PERDU_MAX_PAR_DEFAUT_MIN = 2;
export const NOMBRE_DE_TICKETS = 10;

// Les cinq phases montrées : chacune est la médiane de cette phase seule (leur somme peut donc différer de la médiane du total) ; la cuisson compte ses tests, qui se disent au survol.
/** @type {{ cle: "cuisson" | "attentePasse" | "revue" | "ci" | "merge", libelle: string }[]} */
export const PHASES = [
  { cle: "cuisson", libelle: "Cooking" },
  { cle: "attentePasse", libelle: "Waiting for the pass" },
  { cle: "revue", libelle: "Review" },
  { cle: "ci", libelle: "CI" },
  { cle: "merge", libelle: "Merge" },
];

/** @param {Enregistrement} e */
const cuisson = (e) => e.cuisson + e.cuissonTests;
/** @param {Enregistrement} e */
export const total = (e) => cuisson(e) + e.attentePasse + e.revue + e.ci + e.merge;

/** @param {unknown} x */
const positif = (x) => (typeof x === "number" && Number.isFinite(x) && x > 0 ? x : 0);
// Le temps perdu d'un ticket, en secondes : l'attente avant la prise, les cuissons ratées et les renvois. Un
// enregistrement sans `perdu` (plus ancien que la mesure) compte zéro.
/** @param {Enregistrement} e */
export const perdu = (e) => {
  const p = /** @type {Record<string, unknown> | null | undefined} */ (/** @type {Record<string, unknown>} */ (e).perdu);
  return typeof p === "object" && p !== null ? positif(p.attente) + positif(p.ratees) + positif(p.renvois) : 0;
};

// Le seuil du temps perdu du projet, en minutes : `lostTimeMaxMin`, ou 2 s'il est absent ou absurde.
/** @param {{ lostTimeMaxMin?: number | undefined }} temps */
export const seuilPerdu = (temps) => (typeof temps.lostTimeMaxMin === "number" && Number.isFinite(temps.lostTimeMaxMin) && temps.lostTimeMaxMin > 0 ? temps.lostTimeMaxMin : PERDU_MAX_PAR_DEFAUT_MIN);

/** @param {number[]} valeurs */
export function mediane(valeurs) {
  const triees = [...valeurs].sort((a, b) => a - b);
  const milieu = triees.length >> 1;
  return triees.length % 2 === 1 ? (triees[milieu] ?? 0) : ((triees[milieu - 1] ?? 0) + (triees[milieu] ?? 0)) / 2;
}

// Une durée en secondes, en clair : « 45 s », « 12 min », « 1 h 5 min ».
/** @param {number} secondes */
export function dureeEnClair(secondes) {
  const s = Math.round(Math.max(0, secondes));
  if (s < 60) return `${s} s`;
  const minutes = Math.round(s / 60);
  if (minutes < 60) return `${minutes} min`;
  const [h, m] = [Math.floor(minutes / 60), minutes % 60];
  return m === 0 ? `${h} h` : `${h} h ${m} min`;
}

/** @param {unknown} x @returns {x is Enregistrement} */
const lisible = (x) => {
  if (typeof x !== "object" || x === null) return false;
  const e = /** @type {Record<string, unknown>} */ (x);
  return (
    typeof e.ticket === "number" &&
    typeof e.mergedAt === "string" &&
    !Number.isNaN(Date.parse(e.mergedAt)) &&
    ["cuisson", "cuissonTests", "attentePasse", "revue", "ci", "merge"].every((p) => typeof e[p] === "number" && Number.isFinite(e[p]))
  );
};

// La synthèse des 10 derniers tickets (par `mergedAt`), ou null sans ticket mesuré. Les entrées illisibles sont écartées.
/** @param {TempsDuProjet} temps */
export function synthese(temps) {
  const max = seuilPerdu(temps);
  const recents = (temps.enregistrements ?? []).filter(lisible).sort((a, b) => Date.parse(b.mergedAt) - Date.parse(a.mergedAt)).slice(0, NOMBRE_DE_TICKETS);
  const premier = recents[0];
  if (premier === undefined) return null;
  let lent = premier;
  for (const e of recents) if (total(e) > total(lent)) lent = e;
  // La phase la plus longue du ticket le plus lent (la cuisson compte ses tests) ; à égalité, la première dans l'ordre du ticket.
  const phaseLente = PHASES.reduce((a, b) => ((b.cle === "cuisson" ? cuisson(lent) : lent[b.cle]) > (a.cle === "cuisson" ? cuisson(lent) : lent[a.cle]) ? b : a));
  const perduMedian = mediane(recents.map(perdu));
  return {
    max,
    nombre: recents.length,
    mediane: mediane(recents.map(total)),
    perdu: perduMedian,
    depasse: perduMedian > max * 60,
    plusLent: { ticket: lent.ticket, total: total(lent), phase: phaseLente.libelle },
    phases: PHASES.map(({ cle, libelle }) => ({ cle, libelle, duree: mediane(recents.map((e) => (cle === "cuisson" ? cuisson(e) : e[cle]))) })),
    testsMedians: mediane(recents.map((e) => e.cuissonTests)),
  };
}

/**
 * @param {Fabrique} doc
 * @param {string} balise
 * @param {string} classe
 * @param {string} [texte]
 */
function noeud(doc, balise, classe, texte) {
  const n = doc.createElement(balise);
  n.className = classe;
  if (texte !== undefined) n.textContent = texte;
  return n;
}

// Le bloc à poser sur la page du projet : toujours un bloc, jamais un blanc ni un zéro. Trois états — `data-temps` :
// « normal », « depasse » (la médiane du temps perdu passe le seuil du projet) et « vide » (aucun ticket mesuré). `temps` indéfini : la station
// du projet ne publie pas encore ses temps — « vide » aussi, mais qui le dit, pour ne pas affirmer qu'aucun ticket n'est mesuré.
/**
 * @param {Fabrique} doc
 * @param {TempsDuProjet | undefined} temps
 */
export function poserTempsTicket(doc, temps) {
  const lu = synthese(temps ?? { enregistrements: [] });
  const bloc = noeud(doc, "div", "temps-ticket");
  const tete = noeud(doc, "p", "temps-tete");
  tete.append(noeud(doc, "span", "temps-titre", "Ticket times"));
  bloc.append(tete);
  if (temps === undefined) {
    bloc.dataset.temps = "vide";
    bloc.dataset.publie = "non";
    const vide = noeud(doc, "p", "temps-vide", "Ticket times not available yet");
    vide.append(survol(doc, "The project's station does not publish its ticket times yet: this is not a count of zero tickets"));
    bloc.append(vide);
    return bloc;
  }
  if (lu === null) {
    bloc.dataset.temps = "vide";
    const vide = noeud(doc, "p", "temps-vide", "No ticket measured yet");
    vide.append(survol(doc, `The times appear once a ticket is merged: the median and the slowest of the last ${NOMBRE_DE_TICKETS} measured tickets`));
    bloc.append(vide);
    return bloc;
  }
  bloc.dataset.temps = lu.depasse ? "depasse" : "normal";
  const mediane_ = noeud(doc, "p", "temps-mediane");
  mediane_.append(noeud(doc, "span", "temps-valeur", dureeEnClair(lu.mediane)), noeud(doc, "span", "temps-legende", lu.nombre === 1 ? "median of the only measured ticket" : `median of the last ${lu.nombre} tickets`));
  const maxDit = noeud(doc, "span", "temps-max", `lost ${dureeEnClair(lu.perdu)} vs ${lu.max} min max`);
  tete.append(maxDit);
  if (lu.depasse) {
    const alerte = noeud(doc, "span", "temps-depasse", `Lost time over the max of ${lu.max} min`);
    alerte.dataset.depasse = "oui";
    mediane_.append(alerte);
  }
  const lent = noeud(doc, "p", "temps-lent", `Slowest: #${lu.plusLent.ticket} — ${dureeEnClair(lu.plusLent.total)}`);
  bloc.append(mediane_, lent);

  const somme = lu.phases.reduce((s, p) => s + p.duree, 0);
  const barre = noeud(doc, "div", "temps-barre");
  const liste = noeud(doc, "ul", "temps-phases");
  for (const p of lu.phases) {
    const part = noeud(doc, "span", "temps-part");
    part.dataset.phase = p.cle;
    part.style.flexGrow = String(somme === 0 ? 1 : p.duree);
    barre.append(part);
    const ligne = noeud(doc, "li", "temps-phase");
    ligne.dataset.phase = p.cle;
    ligne.append(noeud(doc, "span", "temps-nom", p.libelle), noeud(doc, "span", "temps-duree", dureeEnClair(p.duree)));
    if (p.cle === "cuisson") ligne.append(survol(doc, `cooking and its tests; the tests alone: ${dureeEnClair(lu.testsMedians)} (median)`));
    liste.append(ligne);
  }
  bloc.append(barre, liste);
  return bloc;
}
