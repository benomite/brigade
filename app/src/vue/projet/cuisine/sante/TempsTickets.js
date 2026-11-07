// @ts-check
// Le temps des tickets, en détail, sur Kitchen > Health (ticket 2490, épique 2484) : la durée d'un ticket — de sa prise
// à son merge — et celle de sa pass — l'attente de la pass et sa revue —, en médiane, ticket par ticket, et dans le
// temps. Les mesures sont celles que la principale publie sous `temps` du projet vu (`.claude/brigade/temps-tickets.json`
// de son clone, en secondes entières), le plafond est `tempsMaxTicketMin` (15 minutes par défaut) : les mêmes que la
// carte des temps de Cooks (temps-ticket.js), dont ce bloc reprend les mots et les calculs. Ce module ne touche pas
// `document` : il reçoit de quoi créer un élément (briques.js) et rend le bloc.

import { survol } from "../../../briques.js";
import { depasse, enMinutes, estDepasse, lireLeResume, SANS_MESURE, SANS_MESURE_DETAIL, surCombien } from "../../../temps-ticket/resume.js";
import { dureeEnClair, MAX_PAR_DEFAUT_MIN, mediane, total } from "../../../temps-ticket/temps-ticket.js";

/** @typedef {import("../../../briques.js").Fabrique} Fabrique */
/** @typedef {import("../../../temps-ticket/temps-ticket.js").Enregistrement} Enregistrement */
/** @typedef {import("../../../temps-ticket/temps-ticket.js").TempsDuProjet} TempsDuProjet */

export const TITRE = "Ticket time";
export const AIDE = "From the station's measures: a ticket's time runs from its claim to its merge; its pass is the wait for the pass and the review.";
// Combien de tickets la courbe montre, et combien la liste, les plus récents.
export const DANS_LE_TEMPS = 30;
export const PAR_TICKET = 10;

/** @param {Enregistrement} e */
export const passe = (e) => e.attentePasse + e.revue;

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

// Ce que le bloc montre : les tickets mesurés du plus ancien au plus récent (les `DANS_LE_TEMPS` derniers, par
// `mergedAt`), les médianes du ticket et de sa pass sur les `PAR_TICKET` derniers, et le plafond. Null sans ticket mesuré.
/** @param {TempsDuProjet} temps */
export function lireLesTemps(temps) {
  const max = Number.isFinite(temps.tempsMaxTicketMin) && (temps.tempsMaxTicketMin ?? 0) > 0 ? /** @type {number} */ (temps.tempsMaxTicketMin) : MAX_PAR_DEFAUT_MIN;
  const ranges = (temps.enregistrements ?? []).filter(lisible).sort((a, b) => Date.parse(a.mergedAt) - Date.parse(b.mergedAt) || a.ticket - b.ticket);
  if (ranges.length === 0) return null;
  const recents = ranges.slice(-PAR_TICKET);
  return {
    max,
    dansLeTemps: ranges.slice(-DANS_LE_TEMPS).map((e) => ({ ticket: e.ticket, le: e.mergedAt, total: total(e), passe: passe(e) })),
    parTicket: recents.map((e) => ({ ticket: e.ticket, le: e.mergedAt, total: total(e), passe: passe(e) })).reverse(),
    nombre: recents.length,
    mediane: mediane(recents.map(total)),
    medianePasse: mediane(recents.map(passe)),
  };
}

/** @param {string} iso */
const jour = (iso) => new Date(iso).toLocaleDateString("en-US", { month: "short", day: "numeric", timeZone: "UTC" });

/** @param {Fabrique} doc @param {string} balise @param {string} classe @param {string} [texte] */
function noeud(doc, balise, classe, texte) {
  const n = doc.createElement(balise);
  n.className = classe;
  if (texte !== undefined) n.textContent = texte;
  return n;
}

// Un chiffre en tête : sa valeur, ce qu'elle est. `depasse` : il passe le plafond.
/** @param {Fabrique} doc @param {string} valeur @param {string} legende @param {boolean} [depasse] */
function chiffre(doc, valeur, legende, depasse = false) {
  const pose = noeud(doc, "p", "temps-chiffre");
  if (depasse) pose.dataset.depasse = "oui";
  pose.append(noeud(doc, "strong", "temps-valeur", valeur), noeud(doc, "span", "temps-legende", legende));
  return pose;
}

// Le bloc à poser sur Health : toujours un bloc, jamais un blanc ni un zéro. Trois états — `data-temps` : « normal »,
// « depasse » (la médiane ou le p75 du résumé de la mesure passe le plafond) et « vide » (la mesure n'a rien publié :
// « no measure yet », qui n'est pas un compte de zéro). En tête, les mêmes chiffres que la bande du rail, lus du
// résumé sans les recalculer (resume.js), et la phase la plus longue avec sa médiane ; dessous, la courbe et la liste
// des tickets, quand les enregistrements sont là.
/** @param {Fabrique} doc @param {TempsDuProjet} [temps] */
export function poserBlocTempsTickets(doc, temps) {
  const bloc = doc.createElement("section");
  bloc.className = "bloc-du-projet";
  bloc.dataset.bloc = "temps-tickets";
  bloc.ariaLabel = TITRE;
  const titre = doc.createElement("h3");
  titre.textContent = TITRE;
  titre.append(survol(doc, AIDE));
  bloc.append(titre);
  const resume = lireLeResume(temps);
  if (resume === null) {
    bloc.dataset.temps = "vide";
    const vide = noeud(doc, "p", "temps-vide", SANS_MESURE);
    vide.append(survol(doc, SANS_MESURE_DETAIL));
    bloc.append(vide);
  } else {
    const trop = depasse(resume);
    bloc.dataset.temps = estDepasse(resume) ? "depasse" : "normal";
    const sur = surCombien(resume);
    const chiffres = noeud(doc, "div", "temps-chiffres");
    chiffres.append(chiffre(doc, enMinutes(resume.medianMin), `median of ${sur}`, trop.mediane), chiffre(doc, enMinutes(resume.p75Min), `p75 of ${sur}`, trop.p75), chiffre(doc, enMinutes(resume.maxMin), "max of a ticket"));
    bloc.append(chiffres);
    if (estDepasse(resume)) bloc.append(noeud(doc, "p", "temps-depasse", `Over the max of ${enMinutes(resume.maxMin)}`));
    if (resume.phaseLaPlusLongue !== null) bloc.append(noeud(doc, "p", "temps-phase-lente", `Slowest phase: ${resume.phaseLaPlusLongue.nom}, median ${enMinutes(resume.phaseLaPlusLongue.medianMin)}`));
  }
  const lu = temps === undefined ? null : lireLesTemps(temps);
  if (lu === null) return bloc;

  // Dans le temps : une colonne par ticket, du plus ancien au plus récent, sa pass en bas ; le plafond en trait.
  const echelle = Math.max(lu.max * 60, ...lu.dansLeTemps.map((t) => t.total), 1);
  const courbe = noeud(doc, "div", "temps-courbe");
  courbe.role = "img";
  // Sa largeur suit le nombre de tickets : une colonne lisible, jamais plus large que la liste dessous.
  courbe.style.maxWidth = `${Math.min(640, Math.max(240, lu.dansLeTemps.length * 40))}px`;
  courbe.ariaLabel = `Time of the last ${lu.dansLeTemps.length} tickets, oldest first`;
  const colonnes = noeud(doc, "div", "temps-colonnes");
  for (const t of lu.dansLeTemps) {
    const colonne = noeud(doc, "span", "temps-colonne");
    colonne.title = `#${t.ticket} · ${jour(t.le)} · ${dureeEnClair(t.total)}, pass ${dureeEnClair(t.passe)}`;
    if (t.total > lu.max * 60) colonne.dataset.depasse = "oui";
    const reste = noeud(doc, "span", "temps-ticket-part");
    reste.style.height = `${(100 * Math.max(0, t.total - t.passe)) / echelle}%`;
    const pass = noeud(doc, "span", "temps-pass-part");
    pass.style.height = `${(100 * t.passe) / echelle}%`;
    colonne.append(reste, pass);
    colonnes.append(colonne);
  }
  const plafond = noeud(doc, "span", "temps-plafond");
  plafond.style.bottom = `${(100 * lu.max * 60) / echelle}%`;
  colonnes.append(plafond);
  const premier = lu.dansLeTemps[0];
  const dernier = lu.dansLeTemps.at(-1);
  const axe = noeud(doc, "p", "temps-axe");
  axe.append(noeud(doc, "span", "", premier === undefined ? "" : jour(premier.le)), noeud(doc, "span", "", dernier === undefined ? "" : jour(dernier.le)));
  const legende = noeud(doc, "p", "temps-cles");
  legende.append(noeud(doc, "span", "temps-cle ticket", "ticket"), noeud(doc, "span", "temps-cle pass", "pass"), noeud(doc, "span", "temps-cle max", `max ${lu.max} min`));
  courbe.append(colonnes, axe, legende);
  bloc.append(courbe);

  // Ticket par ticket, le plus récent d'abord.
  const table = noeud(doc, "table", "temps-par-ticket");
  const tete = noeud(doc, "tr", "");
  for (const nom of ["Ticket", "Merged", "Time", "Pass"]) tete.append(noeud(doc, "th", "", nom));
  const thead = noeud(doc, "thead", "");
  thead.append(tete);
  const corps = noeud(doc, "tbody", "");
  for (const t of lu.parTicket) {
    const ligne = noeud(doc, "tr", "");
    ligne.dataset.ticket = String(t.ticket);
    if (t.total > lu.max * 60) ligne.dataset.depasse = "oui";
    ligne.append(noeud(doc, "td", "mono", `#${t.ticket}`), noeud(doc, "td", "", jour(t.le)), noeud(doc, "td", "temps-total", dureeEnClair(t.total)), noeud(doc, "td", "", dureeEnClair(t.passe)));
    corps.append(ligne);
  }
  table.append(thead, corps);
  bloc.append(table);
  return bloc;
}
