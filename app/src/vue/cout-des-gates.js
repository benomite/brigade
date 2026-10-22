// @ts-check
// Ce que coûtent les gates du projet face à son budget (ticket 1318, épique 1313). Deux poses :
// - en tête de la file : le dernier passage face au budget d'un passage, en durée et en processeur — « 215 s / 100 s » —,
//   marqué « over budget » quand le runtime le juge ainsi, et la ligne qui dit que la cuisine a ouvert un ticket seule
//   pour les y ramener, son numéro ouvrant sa fiche ;
// - sur l'onglet Cooks : les passages des dernières 24 h — leur nombre, leur temps et leur processeur au total —, à
//   côté du budget d'un passage. Sans passage, « 0 » et « 0 s », jamais un blanc.
// Un budget que le chef n'a pas posé est celui par défaut, et le dit. Tout vient de `facts` (faits.ts) : la vue
// écrit des secondes en mots, elle ne juge rien — le dépassement est celui que le runtime donne.
// Ce module ne touche pas `document` : il reçoit de quoi créer un élément (briques.js), et rend des éléments.

import { survol } from "./briques.js";

/** @typedef {import("./briques.js").Fabrique} Fabrique */
/** @typedef {import("../faits.ts").CoutDesGates} CoutDesGates */

export const TITRE_FILE = "gates, latest run against budget";
export const TITRE_JOUR = "gates, last 24 h";
export const HORS_BUDGET = "over budget";
export const DEFAUT = "(default)";
const AIDE_FILE =
  "What the project's latest gates run cost, in wall-clock time and in CPU, against the budget of one run. A budget you have not set is the default. When a run goes over, the kitchen opens a ticket on its own to bring the gates back under it — one at a time.";
const AIDE_JOUR = "Every gates run of the project in the last 24 hours, by a cook or by the pass: how many, and their time and CPU added up. The budget is that of one run.";

// Chaque classe est posée en clair, `className = "…"` : la peau ne vise que des classes que la vue
// pose, et son test les lit ainsi (peau.test.ts).
/** @param {Fabrique} doc @param {string} balise @param {string} [texte] */
function cree(doc, balise, texte) {
  const pose = doc.createElement(balise);
  if (texte !== undefined) pose.textContent = texte;
  return pose;
}

// Un passage et son budget se disent en secondes, pour se lire l'un contre l'autre : « 990 s / 400 s ».
/** @param {number} valeur */
export const secondes = (valeur) => `${Math.round(valeur)} s`;

// Un total en mots : en secondes jusqu'à dix minutes — « 215 s » —, puis en minutes, puis en heures.
/** @param {number} valeur */
export function duree(valeur) {
  if (valeur < 600) return secondes(valeur);
  const minutes = Math.round(valeur / 60);
  if (minutes < 60) return `${minutes} min`;
  return `${Math.floor(minutes / 60)} h ${String(minutes % 60).padStart(2, "0")} min`;
}

// Un budget, et s'il est le défaut.
/** @param {Fabrique} doc @param {number} valeur @param {boolean} parLeChef */
function budget(doc, valeur, parLeChef) {
  const pose = cree(doc, "span", parLeChef ? secondes(valeur) : `${secondes(valeur)} ${DEFAUT}`);
  pose.className = "budget-des-gates";
  pose.title = parLeChef ? "the budget you set for one run" : "the default budget of one run — you have not set one";
  return pose;
}

// Une mesure du dernier passage face à son budget : « time 215 s / 100 s ».
/** @param {Fabrique} doc @param {{ libelle: string, valeur: string, titre: string, budget: any }} mesure */
function mesure(doc, { libelle, valeur, titre, budget: sien }) {
  const pose = cree(doc, "span");
  pose.className = "mesure-des-gates";
  const chiffre = cree(doc, "strong", valeur);
  chiffre.className = "chiffre";
  chiffre.title = titre;
  pose.append(cree(doc, "span", libelle), chiffre, cree(doc, "span", "/"), sien);
  return pose;
}

// En tête de la file : le dernier passage face au budget, et le ticket que la cuisine a ouvert. Rien d'un runtime qui
// ne le donne pas. `ouvrir` ouvre la fiche du ticket, son bouton en retour.
/** @param {Fabrique} doc @param {CoutDesGates | undefined} cout @param {(ticket: number, retour: any) => void} ouvrir */
export function poserLesGatesDeLaFile(doc, cout, ouvrir) {
  if (cout === undefined) return [];
  const { budget: lu, latest, overBudget, ticket } = cout;
  const section = cree(doc, "section");
  section.className = "gates-de-la-file";
  section.ariaLabel = TITRE_FILE;
  if (overBudget) section.dataset.horsBudget = "";
  const tete = cree(doc, "h4", TITRE_FILE);
  tete.append(survol(doc, AIDE_FILE));
  const ligne = cree(doc, "p");
  ligne.className = "mesures-des-gates";
  const processeur = latest === null ? "–" : latest.cpuSeconds === null ? "not measured" : secondes(latest.cpuSeconds);
  ligne.append(
    mesure(doc, { libelle: "time", valeur: latest === null ? "–" : secondes(latest.durationSeconds), titre: latest === null ? "no gates run yet" : `${latest.durationSeconds} s`, budget: budget(doc, lu.durationSeconds, lu.parLeChef.durationSeconds) }),
    mesure(doc, {
      libelle: "CPU",
      valeur: processeur,
      titre: latest === null ? "no gates run yet" : latest.cpuSeconds === null ? "the run was cut before its end: its CPU was lost with it" : `${latest.cpuSeconds} s`,
      budget: budget(doc, lu.cpuSeconds, lu.parLeChef.cpuSeconds),
    }),
  );
  if (latest === null) {
    const aucun = cree(doc, "span", "no run yet");
    aucun.className = "sans-passage";
    ligne.append(aucun);
  }
  if (overBudget) {
    const marque = cree(doc, "span", HORS_BUDGET);
    marque.className = "hors-budget";
    ligne.append(marque);
  }
  section.append(tete, ligne);
  if (ticket !== null) {
    const dit = cree(doc, "p");
    dit.className = "ticket-du-budget";
    const lien = cree(doc, "button", `#${ticket.number}`);
    lien.type = "button";
    lien.className = "lien mono";
    lien.title = `open the sheet of #${ticket.number}`;
    lien.addEventListener("click", () => ouvrir(ticket.number, lien));
    dit.append(cree(doc, "span", "the kitchen opened"), lien, cree(doc, "span", "on its own to bring the gates back under budget"));
    section.append(dit);
  }
  return [section];
}

// Les colonnes de la section des 24 h, dans l'ordre.
export const COLONNES = ["runs", "total time", "total CPU"];

// Sur l'onglet Cooks : les passages des dernières 24 h, à côté du budget d'un passage. Rien d'un runtime qui ne les
// donne pas.
/** @param {Fabrique} doc @param {CoutDesGates | undefined} cout */
export function poserLeJourDesGates(doc, cout) {
  if (cout === undefined) return null;
  const { budget: lu, lastDay } = cout;
  const section = cree(doc, "section");
  section.className = "jour-des-gates";
  section.ariaLabel = TITRE_JOUR;
  const tete = cree(doc, "h4", TITRE_JOUR);
  tete.append(survol(doc, AIDE_JOUR));
  const tableau = cree(doc, "table");
  const colonnes = cree(doc, "tr");
  colonnes.append(cree(doc, "td"), ...COLONNES.map((libelle) => {
    const colonne = cree(doc, "th", libelle);
    colonne.scope = "col";
    return colonne;
  }));
  /** @param {string} libelle @param {string} cle @param {any[]} cellules */
  const rangee = (libelle, cle, cellules) => {
    const ligne = cree(doc, "tr");
    ligne.dataset.ligne = cle;
    const nom = cree(doc, "th", libelle);
    nom.scope = "row";
    ligne.append(nom, ...cellules);
    return ligne;
  };
  /** @param {string} texte @param {string} [titre] */
  const chiffre = (texte, titre) => {
    const cellule = cree(doc, "td", texte);
    cellule.className = "chiffre";
    if (titre !== undefined) cellule.title = titre;
    return cellule;
  };
  /** @param {number} valeur @param {boolean} parLeChef */
  const sien = (valeur, parLeChef) => {
    const cellule = cree(doc, "td");
    cellule.append(budget(doc, valeur, parLeChef));
    return cellule;
  };
  const entete = cree(doc, "thead");
  entete.append(colonnes);
  const corps = cree(doc, "tbody");
  corps.append(
    rangee("all runs", "lastDay", [chiffre(String(lastDay.runs)), chiffre(duree(lastDay.durationSeconds), `${lastDay.durationSeconds} s`), chiffre(duree(lastDay.cpuSeconds), `${lastDay.cpuSeconds} s`)]),
    rangee("budget, one run", "budget", [cree(doc, "td"), sien(lu.durationSeconds, lu.parLeChef.durationSeconds), sien(lu.cpuSeconds, lu.parLeChef.cpuSeconds)]),
  );
  tableau.append(entete, corps);
  section.append(tete, tableau);
  return section;
}
