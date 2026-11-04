// @ts-check
// Le budget d'appels GitHub de chaque projet (ticket 2197, épique 2184) : ce que `status` dit, dans l'app. Par projet,
// les lectures utilisées face au budget de lectures, puis, sur une autre ligne, les écritures face au budget d'écritures.
// Un projet au-delà de son budget est marqué « over budget » et nomme les catégories qui ont consommé les appels ; un
// projet dans son budget ne montre aucune alerte. Tout vient de l'instantané du registre des appels (runtime). Ce module
// ne touche pas `document` : il reçoit de quoi créer un élément (briques.js).

import { survol } from "./briques.js";

/** @typedef {import("./briques.js").Fabrique} Fabrique */
/** @typedef {{ total: number, byCategory: Record<string, number> }} Compte */
/** @typedef {{ reads: Compte, writes: Compte, budget: { reads: number, writes: number }, overBudget: boolean }} BudgetDuProjet */
/** @typedef {{ windowStart?: string, projects: Record<string, BudgetDuProjet>, perTicket?: unknown }} InstantaneDesAppels */

export const TITRE = "GitHub call budget, last hour";
export const HORS_BUDGET = "over budget";
const AIDE = "GitHub reads and writes used in the last hour, per project, against the hourly budget.";

/** @param {Fabrique} doc @param {string} balise @param {string} [texte] */
function cree(doc, balise, texte) {
  const element = doc.createElement(balise);
  if (texte !== undefined) element.textContent = texte;
  return element;
}

// Les catégories, la plus gourmande d'abord : « issues 25, board 10 ». Celles à zéro ne sont pas dites.
/** @param {Record<string, number>} parCategorie */
function categories(parCategorie) {
  return Object.entries(parCategorie)
    .filter(([, appels]) => appels > 0)
    .sort((a, b) => b[1] - a[1])
    .map(([nom, appels]) => `${nom} ${appels}`)
    .join(", ");
}

// Une ligne : « reads 120 / 100 », et, au-delà du budget, ses catégories.
/** @param {Fabrique} doc @param {string} libelle @param {Compte} compte @param {number} budget */
function ligne(doc, libelle, compte, budget) {
  const racine = cree(doc, "p");
  racine.className = `appels-${libelle}`;
  racine.dataset.genre = libelle;
  racine.append(cree(doc, "span", libelle), " ", cree(doc, "span", `${compte.total} / ${budget}`));
  const auDela = compte.total > budget;
  if (auDela) racine.dataset.horsBudget = "";
  const dit = categories(compte.byCategory);
  if (auDela && dit !== "") {
    const par = cree(doc, "span", ` — used by ${dit}`);
    par.className = "categories-des-appels";
    racine.append(par);
  }
  return racine;
}

// La vue : un bloc par projet. `instantane` absent : une ligne neutre, jamais une erreur.
/** @param {Fabrique} doc @param {InstantaneDesAppels | undefined} instantane */
export function poserLeBudgetDAppels(doc, instantane) {
  const section = cree(doc, "section");
  section.className = "budget-des-appels";
  section.ariaLabel = TITRE;
  const tete = cree(doc, "h4", TITRE);
  tete.append(survol(doc, AIDE));
  section.append(tete);
  const projets = instantane === undefined ? [] : Object.entries(instantane.projects);
  if (projets.length === 0) {
    section.dataset.appels = "absents";
    section.append(cree(doc, "p", "no call counted yet"));
    return section;
  }
  section.dataset.appels = "lus";
  for (const [nom, projet] of projets) {
    const bloc = cree(doc, "div");
    bloc.className = "budget-du-projet";
    bloc.dataset.projet = nom;
    const titre = cree(doc, "strong", nom);
    bloc.append(titre);
    if (projet.overBudget) {
      bloc.dataset.horsBudget = "";
      section.dataset.horsBudget = "";
      const marque = cree(doc, "span", HORS_BUDGET);
      marque.className = "hors-budget";
      bloc.append(" ", marque);
    }
    bloc.append(ligne(doc, "reads", projet.reads, projet.budget.reads), ligne(doc, "writes", projet.writes, projet.budget.writes));
    section.append(bloc);
  }
  return section;
}
