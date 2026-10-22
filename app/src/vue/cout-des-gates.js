// @ts-check
// Ce que coûtent les gates du projet face à son budget (ticket 1318, épique 1313). Deux poses :
// - en tête de la file : le dernier passage de gates de ticket face au budget d'un ticket, en durée et en processeur
//   — « 215 s / 100 s » —, puis, à part, le dernier run complet sur la base face à son budget à lui,
//   marqué « over budget » quand le runtime le juge ainsi, et la ligne qui dit que la cuisine a ouvert un ticket seule
//   pour les y ramener, son numéro ouvrant sa fiche ;
// - sur l'onglet Cooks : les passages de la dernière heure et des dernières 24 h — leur nombre, ce que coûte un passage
//   en moyenne, en durée et en processeur, face au budget d'un passage, et leur temps et leur processeur au total —, et
//   la tendance de l'heure face au jour (ticket 1318, ajout du chef du 21/10). Une moyenne sans passage, « – ». Sans
//   aucun passage de l'heure ni des 24 h, une seule ligne le dit, avec le budget d'un passage — pas un tableau de zéros
//   (ticket 1456).
// Un budget que le chef n'a pas posé est celui par défaut, et le dit. Tout vient de `facts` (faits.ts) : la vue
// écrit des secondes en mots, elle ne juge rien — le dépassement est celui que le runtime donne.
// Ce module ne touche pas `document` : il reçoit de quoi créer un élément (briques.js), et rend des éléments.

import { survol, uneLigne } from "./briques.js";

/** @typedef {import("./briques.js").Fabrique} Fabrique */
/** @typedef {import("../faits.ts").CoutDesGates} CoutDesGates */

export const TITRE_FILE = "gates, latest run against budget";
export const TITRE_BASE = "full run on the base, against its own budget";
export const TITRE_JOUR = "gates, last hour and last 24 h";
export const AUCUN_PASSAGE = "no run in the last 24 h";
export const HORS_BUDGET = "over budget";
export const DEFAUT = "(default)";
const AIDE_FILE =
  "What the project's latest gates run cost, in wall-clock time and in CPU, against the budget of one run. A budget you have not set is the default. When a run goes over, the kitchen opens a ticket on its own to bring the gates back under it — one at a time.";
const AIDE_JOUR =
  "Every gates run of the project in the last hour and in the last 24 hours, by a cook or by the pass: how many, what one run costs on average — to read against the budget of one run —, and their time and CPU added up. The average CPU counts only the runs that said it. The trend sets the last hour's average against the last 24 hours': rising or falling past 10 %, steady within.";
const AIDE_BASE =
  "The latest full run of the gates on the integration base, which plays every test, against its own and larger budget. The budget of a ticket's gates never judges it.";
// La tendance de l'heure face au jour, en mots.
/** @type {Readonly<Record<import("../faits.ts").TendanceDesGates, string>>} */
export const TENDANCES = { up: "↑ rising", down: "↓ falling", steady: "steady" };

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

// La ligne des deux mesures du dernier passage d'un genre, chacune face au budget de ce genre, et son marquage.
/** @param {Fabrique} doc @param {import("../faits.ts").BudgetDesGates} lu @param {import("../faits.ts").PassageDesGates | null} latest @param {boolean} horsBudget */
function ligneDeMesures(doc, lu, latest, horsBudget) {
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
  if (horsBudget) {
    ligne.dataset.horsBudget = "";
    const marque = cree(doc, "span", HORS_BUDGET);
    marque.className = "hors-budget";
    ligne.append(marque);
  }
  return ligne;
}

// En tête de la file : le dernier passage face au budget, et le ticket que la cuisine a ouvert. Rien d'un runtime qui
// ne le donne pas. `ouvrir` ouvre la fiche du ticket, son bouton en retour.
/** @param {Fabrique} doc @param {CoutDesGates | undefined} cout @param {(ticket: number, retour: any) => void} ouvrir */
export function poserLesGatesDeLaFile(doc, cout, ouvrir) {
  if (cout === undefined) return [];
  const { budget: lu, latest, overBudget, ticket, base } = cout;
  const section = cree(doc, "section");
  section.className = "gates-de-la-file";
  section.ariaLabel = TITRE_FILE;
  if (overBudget || base?.overBudget === true) section.dataset.horsBudget = "";
  const tete = cree(doc, "h4", TITRE_FILE);
  tete.append(survol(doc, AIDE_FILE));
  section.append(tete, ligneDeMesures(doc, lu, latest, overBudget));
  if (base !== undefined) {
    const teteDeLaBase = cree(doc, "h4", TITRE_BASE);
    teteDeLaBase.append(survol(doc, AIDE_BASE));
    const deLaBase = ligneDeMesures(doc, base.budget, base.latest, base.overBudget);
    deLaBase.dataset.genre = "base";
    section.append(teteDeLaBase, deLaBase);
  }
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

// Les colonnes de la section, dans l'ordre : le nombre de passages, ce que coûte un passage en moyenne — en face du
// budget d'un passage —, puis le total.
export const COLONNES = ["runs", "average time", "average CPU", "total time", "total CPU"];

// Sur l'onglet Cooks : la dernière heure et les dernières 24 h, sous le budget d'un passage. Rien d'un runtime qui ne
// les donne pas ; d'un runtime qui ne donne que le jour, sa ligne seule, sans moyenne.
/** @param {Fabrique} doc @param {CoutDesGates | undefined} cout */
export function poserLeJourDesGates(doc, cout) {
  if (cout === undefined) return null;
  const { budget: lu, lastDay, lastHour, averages, trend } = cout;
  const section = cree(doc, "section");
  section.className = "jour-des-gates";
  section.ariaLabel = TITRE_JOUR;
  if (lastDay.runs === 0 && (lastHour?.runs ?? 0) === 0) {
    const dit = (/** @type {number} */ valeur, /** @type {boolean} */ parLeChef) => (parLeChef ? secondes(valeur) : `${secondes(valeur)} ${DEFAUT}`);
    const ligne = uneLigne(doc, TITRE_JOUR, `${AUCUN_PASSAGE} · budget of one run: time ${dit(lu.durationSeconds, lu.parLeChef.durationSeconds)}, CPU ${dit(lu.cpuSeconds, lu.parLeChef.cpuSeconds)}`);
    ligne.append(survol(doc, AIDE_JOUR));
    section.append(ligne);
    return section;
  }
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
  // Une moyenne : « – » sans passage, ou d'un runtime qui ne la donne pas ; sur la ligne de l'heure, sa tendance.
  /** @param {number | null | undefined} valeur @param {import("../faits.ts").TendanceDesGates | null} [sens] */
  const moyenne = (valeur, sens) => {
    if (valeur === undefined) return chiffre("–", "this station's runtime does not give it yet");
    if (valeur === null) return chiffre("–", "no run");
    const cellule = chiffre(secondes(valeur), `${valeur} s`);
    if (sens !== undefined && sens !== null) {
      const dit = cree(doc, "span", TENDANCES[sens]);
      dit.className = "tendance-des-gates";
      dit.dataset.sens = sens;
      dit.title = "the last hour's average against the last 24 hours'";
      cellule.append(dit);
    }
    return cellule;
  };
  /** @param {import("../faits.ts").FenetreDesGates} fenetre */
  const totaux = (fenetre) => [chiffre(String(fenetre.runs))];
  /** @param {import("../faits.ts").FenetreDesGates} fenetre */
  const sommes = (fenetre) => [chiffre(duree(fenetre.durationSeconds), `${fenetre.durationSeconds} s`), chiffre(duree(fenetre.cpuSeconds), `${fenetre.cpuSeconds} s`)];
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
    ...(lastHour === undefined ? [] : [rangee("last hour", "lastHour", [...totaux(lastHour), moyenne(averages?.lastHour.durationSeconds, trend?.durationSeconds), moyenne(averages?.lastHour.cpuSeconds, trend?.cpuSeconds), ...sommes(lastHour)])]),
    rangee("last 24 h", "lastDay", [...totaux(lastDay), moyenne(averages?.lastDay.durationSeconds), moyenne(averages?.lastDay.cpuSeconds), ...sommes(lastDay)]),
    rangee("budget, one run", "budget", [cree(doc, "td"), sien(lu.durationSeconds, lu.parLeChef.durationSeconds), sien(lu.cpuSeconds, lu.parLeChef.cpuSeconds), cree(doc, "td"), cree(doc, "td")]),
  );
  tableau.append(entete, corps);
  section.append(tete, tableau);
  return section;
}
