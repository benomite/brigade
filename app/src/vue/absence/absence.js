// @ts-check
// L'écran « since you were away » (ticket 3305, sur le résumé hebdomadaire du ticket 3251 et l'autonomie du ticket 3213) :
// le chef qui revient après plus de trois jours voit d'emblée ce qui s'est passé. Par projet : ce que la cuisine a servi
// pendant l'absence — les lignes des résumés hebdomadaires, avec les mots que le runtime leur a donnés
// (runtime/src/resume-hebdomadaire/resume.ts, `pourUnProductOwner`) —, ce qui attend le chef, et, quand les résumés de
// l'absence portent les chiffres d'autonomie, ces chiffres ; sinon le bloc n'existe pas. Un seul bouton ferme l'écran.
//
// La date de la dernière ouverture est tenue dans le stockage de la vue (`localStorage`), comme la trace de la visite
// guidée. Ce module ne touche pas `document` : il reçoit de quoi créer un élément (bricks.js).

import { button } from "../components/button/button.js";
import { lineEmpty } from "../components/line-empty/line-empty.js";
import { THIS_COMPUTER, READ_OF } from "../lexicon.js";
import { WAIT, AUTONOMY, figuresOfTheAutonomy, weekSaid } from "../resume-weekly/resume-weekly.js";

/** @typedef {import("../bricks.js").Fabrique} Fabrique */
/** @typedef {import("../resume-weekly/resume-kitchen.ts").ResumesOfProject} Reading */
/** @typedef {import("../resume-weekly/resume-kitchen.ts").ResumeWeekly} Resume */
/** @typedef {{ ticket: number, titre?: string }} Wait */
/** @typedef {{ projet: string, lecture: Reading | undefined, attentes: Wait[] }} OfProject */
/** @typedef {{ getItem(key: string): string | null, setItem(key: string, value: string): void }} Storage */

// La trace, dans le stockage de la vue, de la dernière ouverture de l'app.
export const KEY_OF_THE_LAST_OPENING = "brigade.derniere-ouverture";
// Plus de trois jours (72 heures) : à trois jours pile, l'écran ne vient pas.
export const THRESHOLD_MS = 3 * 24 * 3600 * 1000;
const DAY_MS = 24 * 3600 * 1000;

export const TITLE = "Since you were away";
export const SERVED = "Served while you were away";
export const NOTHING_SERVED = "Nothing was served while you were away.";
export const NOTHING_N_AWAITING = "Nothing is waiting for you.";
export const SEE_WHAT_AWAITING = "See what is waiting for you";
export const CLOSE = "Close";
/** @param {number} since */
export const ABSENCE_SINCE = (since) => `Last opened ${new Date(since).toISOString().slice(0, 10)}.`;
/** @param {number} count */
export const WAIT_OF = (count) => `${WAIT} (${count})`;
export const NO_PROJECT = `No project is read on ${THIS_COMPUTER}.`;

/**
 * Ce que l'ouverture décide : la date de la dernière ouverture (ms), quand l'écran doit venir — l'absence est de plus de
 * trois jours —, sinon rien. Puis la date d'aujourd'hui est écrite, dans tous les cas, une fois la décision prise. Pas de
 * trace, ou une trace qui ne se lit pas : premier lancement, pas d'écran. Un stockage absent ou qui refuse de lire ne
 * montre rien : l'app ne saurait pas de quand date l'absence.
 * @param {{ stockage: Storage | undefined, maintenant?: () => number }} options
 * @returns {number | undefined}
 */
export function absenceALAperture({ stockage: storage, maintenant: now = Date.now }) {
  if (storage === undefined) return undefined;
  const here = now();
  /** @type {number | undefined} */
  let since;
  try {
    const trace = storage.getItem(KEY_OF_THE_LAST_OPENING);
    const readEntry = trace === null ? Number.NaN : Date.parse(trace);
    if (Number.isFinite(readEntry) && here - readEntry > THRESHOLD_MS) since = readEntry;
  } catch {
    since = undefined;
  }
  try {
    storage.setItem(KEY_OF_THE_LAST_OPENING, new Date(here).toISOString());
  } catch {
    // La trace ne s'écrit pas : l'app s'ouvre quand même.
  }
  return since;
}

/**
 * Les résumés d'un projet dont la semaine touche l'absence : celle dont le dernier jour (`weekEnd`, compris) est à
 * l'instant `depuis` ou après.
 * @param {Reading | undefined} reading @param {number} since
 * @returns {Resume[]}
 */
export function resumesOfTheAbsence(reading, since) {
  if (reading === undefined || !("resumes" in reading) || "sans" in reading.resumes) return [];
  return reading.resumes.resumes.filter(({ weekEnd }) => Date.parse(weekEnd) + DAY_MS > since);
}

/**
 * L'écran. `gestes.fermer(attend)` : `attend` dit si quelque chose attend le chef — le bouton le mène alors à ce qui l'attend.
 * @param {Fabrique} doc
 * @param {{ depuis: number, projets: OfProject[] }} entrees
 * @param {{ fermer: (awaiting: boolean) => void }} actions
 */
export function setAbsence(doc, { depuis: since, projets: projects }, actions) {
  const root = doc.createElement("article");
  root.className = "absence";
  const title = doc.createElement("h2");
  title.textContent = TITLE;
  const said = doc.createElement("p");
  said.className = "attendu";
  said.textContent = ABSENCE_SINCE(since);
  root.append(title, said);
  if (projects.length === 0) root.append(lineEmpty(doc, NO_PROJECT));
  for (const project of projects) root.append(ofProject(doc, since, project));
  const awaiting = projects.some(({ attentes: waits }) => waits.length > 0);
  const action = button(doc, awaiting ? SEE_WHAT_AWAITING : CLOSE, () => actions.fermer(awaiting), { sorte: "recommande" });
  action.className += " fermer-l-absence";
  root.append(action);
  return root;
}

/** @param {Fabrique} doc @param {string} text */
const subheading = (doc, text) => {
  const h4 = doc.createElement("h4");
  h4.textContent = text;
  return h4;
};

/** @param {Fabrique} doc @param {string[]} lines @param {string} classe */
const list = (doc, lines, classe) => {
  const ul = doc.createElement("ul");
  ul.className = classe;
  for (const line of lines) {
    const li = doc.createElement("li");
    li.textContent = line;
    ul.append(li);
  }
  return ul;
};

/** @param {Fabrique} doc @param {number} since @param {OfProject} projet */
function ofProject(doc, since, { projet: project, lecture: reading, attentes: waits }) {
  const section = doc.createElement("section");
  section.className = "absence-du-projet";
  section.ariaLabel = project;
  section.dataset.projet = project;
  const name = doc.createElement("h3");
  name.textContent = project;
  section.append(name, subheading(doc, SERVED));
  const resumes = resumesOfTheAbsence(reading, since);
  if (reading === undefined) section.append(lineEmpty(doc, READ_OF("what was served")));
  else {
    // Les lignes viennent telles que le résumé les écrit : aucun mot n'est refait ici.
    const lines = resumes.flatMap(({ themes }) => themes.flatMap(({ lines }) => lines.map(({ text, ticketNumber }) => `${text} (#${ticketNumber})`)));
    section.append(lines.length === 0 ? lineEmpty(doc, NOTHING_SERVED) : list(doc, lines, "servis"));
  }
  const withAutonomy = resumes.filter(({ autonomy }) => autonomy !== undefined);
  if (withAutonomy.length > 0) {
    section.append(subheading(doc, AUTONOMY));
    for (const resume of withAutonomy) {
      const week = doc.createElement("p");
      week.className = "semaine";
      week.textContent = weekSaid(resume);
      section.append(week, figuresOfTheAutonomy(doc, /** @type {NonNullable<Resume["autonomy"]>} */ (resume.autonomy)));
    }
  }
  section.append(subheading(doc, WAIT_OF(waits.length)));
  section.append(waits.length === 0 ? lineEmpty(doc, NOTHING_N_AWAITING) : list(doc, waits.map(({ ticket, titre: title }) => (title === undefined ? `#${ticket}` : `#${ticket} ${title}`)), "attentes"));
  return section;
}
