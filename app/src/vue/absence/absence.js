// @ts-check
// L'écran « since you were away » (ticket 3305, sur le résumé hebdomadaire du ticket 3251 et l'autonomie du ticket 3213) :
// le chef qui revient après plus de trois jours voit d'emblée ce qui s'est passé. Par projet : ce que la cuisine a servi
// pendant l'absence — les lignes des résumés hebdomadaires, avec les mots que le runtime leur a donnés
// (runtime/src/resume-hebdomadaire/resume.ts, `pourUnProductOwner`) —, ce qui attend le chef, et, quand les résumés de
// l'absence portent les chiffres d'autonomie, ces chiffres ; sinon le bloc n'existe pas. Un seul bouton ferme l'écran.
//
// La date de la dernière ouverture est tenue dans le stockage de la vue (`localStorage`), comme la trace de la visite
// guidée. Ce module ne touche pas `document` : il reçoit de quoi créer un élément (briques.js).

import { button } from "../composants/button/button.js";
import { lineEmpty } from "../composants/line-empty/line-empty.js";
import { CET_ORDINATEUR, READ_DE } from "../lexique.js";
import { WAIT, AUTONOMY, figuresDeLAutonomy, semaineDite } from "../resume-weekly/resume-weekly.js";

/** @typedef {import("../briques.js").Fabrique} Fabrique */
/** @typedef {import("../resume-weekly/resume-kitchen.ts").ResumesDuProject} Read */
/** @typedef {import("../resume-weekly/resume-kitchen.ts").ResumeWeekly} Resume */
/** @typedef {{ ticket: number, titre?: string }} Wait */
/** @typedef {{ projet: string, lecture: Read | undefined, attentes: Wait[] }} DuProject */
/** @typedef {{ getItem(cle: string): string | null, setItem(cle: string, valeur: string): void }} Stockage */

// La trace, dans le stockage de la vue, de la dernière ouverture de l'app.
export const CLE_DE_LA_DERNIERE_OUVERTURE = "brigade.derniere-ouverture";
// Plus de trois jours (72 heures) : à trois jours pile, l'écran ne vient pas.
export const THRESHOLD_MS = 3 * 24 * 3600 * 1000;
const DAY_MS = 24 * 3600 * 1000;

export const TITRE = "Since you were away";
export const SERVED = "Served while you were away";
export const RIEN_SERVED = "Nothing was served while you were away.";
export const RIEN_N_AWAITING = "Nothing is waiting for you.";
export const VOIR_CE_QUI_AWAITING = "See what is waiting for you";
export const FERMER = "Close";
/** @param {number} depuis */
export const ABSENCE_DEPUIS = (depuis) => `Last opened ${new Date(depuis).toISOString().slice(0, 10)}.`;
/** @param {number} nombre */
export const WAIT_DE = (nombre) => `${WAIT} (${nombre})`;
export const AUCUN_PROJECT = `No project is read on ${CET_ORDINATEUR}.`;

/**
 * Ce que l'ouverture décide : la date de la dernière ouverture (ms), quand l'écran doit venir — l'absence est de plus de
 * trois jours —, sinon rien. Puis la date d'aujourd'hui est écrite, dans tous les cas, une fois la décision prise. Pas de
 * trace, ou une trace qui ne se lit pas : premier lancement, pas d'écran. Un stockage absent ou qui refuse de lire ne
 * montre rien : l'app ne saurait pas de quand date l'absence.
 * @param {{ stockage: Stockage | undefined, maintenant?: () => number }} options
 * @returns {number | undefined}
 */
export function absenceALAperture({ stockage, maintenant = Date.now }) {
  if (stockage === undefined) return undefined;
  const ici = maintenant();
  /** @type {number | undefined} */
  let depuis;
  try {
    const trace = stockage.getItem(CLE_DE_LA_DERNIERE_OUVERTURE);
    const lue = trace === null ? Number.NaN : Date.parse(trace);
    if (Number.isFinite(lue) && ici - lue > THRESHOLD_MS) depuis = lue;
  } catch {
    depuis = undefined;
  }
  try {
    stockage.setItem(CLE_DE_LA_DERNIERE_OUVERTURE, new Date(ici).toISOString());
  } catch {
    // La trace ne s'écrit pas : l'app s'ouvre quand même.
  }
  return depuis;
}

/**
 * Les résumés d'un projet dont la semaine touche l'absence : celle dont le dernier jour (`weekEnd`, compris) est à
 * l'instant `depuis` ou après.
 * @param {Read | undefined} read @param {number} depuis
 * @returns {Resume[]}
 */
export function resumesDeLAbsence(read, depuis) {
  if (read === undefined || !("resumes" in read) || "sans" in read.resumes) return [];
  return read.resumes.resumes.filter(({ weekEnd }) => Date.parse(weekEnd) + DAY_MS > depuis);
}

/**
 * L'écran. `gestes.fermer(attend)` : `attend` dit si quelque chose attend le chef — le bouton le mène alors à ce qui l'attend.
 * @param {Fabrique} doc
 * @param {{ depuis: number, projets: DuProject[] }} entrees
 * @param {{ fermer: (awaiting: boolean) => void }} actions
 */
export function poserAbsence(doc, { depuis, projets: projects }, actions) {
  const racine = doc.createElement("article");
  racine.className = "absence";
  const titre = doc.createElement("h2");
  titre.textContent = TITRE;
  const dit = doc.createElement("p");
  dit.className = "attendu";
  dit.textContent = ABSENCE_DEPUIS(depuis);
  racine.append(titre, dit);
  if (projects.length === 0) racine.append(lineEmpty(doc, AUCUN_PROJECT));
  for (const project of projects) racine.append(duProject(doc, depuis, project));
  const awaiting = projects.some(({ attentes }) => attentes.length > 0);
  const action = button(doc, awaiting ? VOIR_CE_QUI_AWAITING : FERMER, () => actions.fermer(awaiting), { sorte: "recommande" });
  action.className += " fermer-l-absence";
  racine.append(action);
  return racine;
}

/** @param {Fabrique} doc @param {string} texte */
const intertitre = (doc, texte) => {
  const h4 = doc.createElement("h4");
  h4.textContent = texte;
  return h4;
};

/** @param {Fabrique} doc @param {string[]} lines @param {string} classe */
const liste = (doc, lines, classe) => {
  const ul = doc.createElement("ul");
  ul.className = classe;
  for (const line of lines) {
    const li = doc.createElement("li");
    li.textContent = line;
    ul.append(li);
  }
  return ul;
};

/** @param {Fabrique} doc @param {number} depuis @param {DuProject} projet */
function duProject(doc, depuis, { projet: project, lecture: read, attentes }) {
  const section = doc.createElement("section");
  section.className = "absence-du-projet";
  section.ariaLabel = project;
  section.dataset.projet = project;
  const name = doc.createElement("h3");
  name.textContent = project;
  section.append(name, intertitre(doc, SERVED));
  const resumes = resumesDeLAbsence(read, depuis);
  if (read === undefined) section.append(lineEmpty(doc, READ_DE("what was served")));
  else {
    // Les lignes viennent telles que le résumé les écrit : aucun mot n'est refait ici.
    const lines = resumes.flatMap(({ themes }) => themes.flatMap(({ lines }) => lines.map(({ text, ticketNumber }) => `${text} (#${ticketNumber})`)));
    section.append(lines.length === 0 ? lineEmpty(doc, RIEN_SERVED) : liste(doc, lines, "servis"));
  }
  const avecAutonomy = resumes.filter(({ autonomy }) => autonomy !== undefined);
  if (avecAutonomy.length > 0) {
    section.append(intertitre(doc, AUTONOMY));
    for (const resume of avecAutonomy) {
      const semaine = doc.createElement("p");
      semaine.className = "semaine";
      semaine.textContent = semaineDite(resume);
      section.append(semaine, figuresDeLAutonomy(doc, /** @type {NonNullable<Resume["autonomy"]>} */ (resume.autonomy)));
    }
  }
  section.append(intertitre(doc, WAIT_DE(attentes.length)));
  section.append(attentes.length === 0 ? lineEmpty(doc, RIEN_N_AWAITING) : liste(doc, attentes.map(({ ticket, titre }) => (titre === undefined ? `#${ticket}` : `#${ticket} ${titre}`)), "attentes"));
  return section;
}
