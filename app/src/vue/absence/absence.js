// @ts-check
// L'écran « since you were away » (ticket 3305, sur le résumé hebdomadaire du ticket 3251 et l'autonomie du ticket 3213) :
// le chef qui revient après plus de trois jours voit d'emblée ce qui s'est passé. Par projet : ce que la cuisine a servi
// pendant l'absence — les lignes des résumés hebdomadaires, avec les mots que le runtime leur a donnés
// (runtime/src/resume-hebdomadaire/resume.ts, `pourUnProductOwner`) —, ce qui attend le chef, et, quand les résumés de
// l'absence portent les chiffres d'autonomie, ces chiffres ; sinon le bloc n'existe pas. Un seul bouton ferme l'écran.
//
// La date de la dernière ouverture est tenue dans le stockage de la vue (`localStorage`), comme la trace de la visite
// guidée. Ce module ne touche pas `document` : il reçoit de quoi créer un élément (briques.js).

import { bouton } from "../composants/bouton/bouton.js";
import { ligneVide } from "../composants/ligne-vide/ligne-vide.js";
import { CET_ORDINATEUR, LECTURE_DE } from "../lexique.js";
import { ATTENTE, AUTONOMIE, chiffresDeLAutonomie, semaineDite } from "../resume-hebdomadaire/resume-hebdomadaire.js";

/** @typedef {import("../briques.js").Fabrique} Fabrique */
/** @typedef {import("../resume-hebdomadaire/resume-cuisine.ts").ResumesDuProjet} Lecture */
/** @typedef {import("../resume-hebdomadaire/resume-cuisine.ts").ResumeHebdomadaire} Resume */
/** @typedef {{ ticket: number, titre?: string }} Attente */
/** @typedef {{ projet: string, lecture: Lecture | undefined, attentes: Attente[] }} DuProjet */
/** @typedef {{ getItem(cle: string): string | null, setItem(cle: string, valeur: string): void }} Stockage */

// La trace, dans le stockage de la vue, de la dernière ouverture de l'app.
export const CLE_DE_LA_DERNIERE_OUVERTURE = "brigade.derniere-ouverture";
// Plus de trois jours (72 heures) : à trois jours pile, l'écran ne vient pas.
export const SEUIL_MS = 3 * 24 * 3600 * 1000;
const JOUR_MS = 24 * 3600 * 1000;

export const TITRE = "Since you were away";
export const SERVI = "Served while you were away";
export const RIEN_SERVI = "Nothing was served while you were away.";
export const RIEN_N_ATTEND = "Nothing is waiting for you.";
export const VOIR_CE_QUI_ATTEND = "See what is waiting for you";
export const FERMER = "Close";
/** @param {number} depuis */
export const ABSENCE_DEPUIS = (depuis) => `Last opened ${new Date(depuis).toISOString().slice(0, 10)}.`;
/** @param {number} nombre */
export const ATTENTE_DE = (nombre) => `${ATTENTE} (${nombre})`;
export const AUCUN_PROJET = `No project is read on ${CET_ORDINATEUR}.`;

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
    if (Number.isFinite(lue) && ici - lue > SEUIL_MS) depuis = lue;
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
 * @param {Lecture | undefined} lecture @param {number} depuis
 * @returns {Resume[]}
 */
export function resumesDeLAbsence(lecture, depuis) {
  if (lecture === undefined || !("resumes" in lecture) || "sans" in lecture.resumes) return [];
  return lecture.resumes.resumes.filter(({ weekEnd }) => Date.parse(weekEnd) + JOUR_MS > depuis);
}

/**
 * L'écran. `gestes.fermer(attend)` : `attend` dit si quelque chose attend le chef — le bouton le mène alors à ce qui l'attend.
 * @param {Fabrique} doc
 * @param {{ depuis: number, projets: DuProjet[] }} entrees
 * @param {{ fermer: (attend: boolean) => void }} gestes
 */
export function poserAbsence(doc, { depuis, projets }, gestes) {
  const racine = doc.createElement("article");
  racine.className = "absence";
  const titre = doc.createElement("h2");
  titre.textContent = TITRE;
  const dit = doc.createElement("p");
  dit.className = "attendu";
  dit.textContent = ABSENCE_DEPUIS(depuis);
  racine.append(titre, dit);
  if (projets.length === 0) racine.append(ligneVide(doc, AUCUN_PROJET));
  for (const projet of projets) racine.append(duProjet(doc, depuis, projet));
  const attend = projets.some(({ attentes }) => attentes.length > 0);
  const geste = bouton(doc, attend ? VOIR_CE_QUI_ATTEND : FERMER, () => gestes.fermer(attend), { sorte: "recommande" });
  geste.className += " fermer-l-absence";
  racine.append(geste);
  return racine;
}

/** @param {Fabrique} doc @param {string} texte */
const intertitre = (doc, texte) => {
  const h4 = doc.createElement("h4");
  h4.textContent = texte;
  return h4;
};

/** @param {Fabrique} doc @param {string[]} lignes @param {string} classe */
const liste = (doc, lignes, classe) => {
  const ul = doc.createElement("ul");
  ul.className = classe;
  for (const ligne of lignes) {
    const li = doc.createElement("li");
    li.textContent = ligne;
    ul.append(li);
  }
  return ul;
};

/** @param {Fabrique} doc @param {number} depuis @param {DuProjet} projet */
function duProjet(doc, depuis, { projet, lecture, attentes }) {
  const section = doc.createElement("section");
  section.className = "absence-du-projet";
  section.ariaLabel = projet;
  section.dataset.projet = projet;
  const nom = doc.createElement("h3");
  nom.textContent = projet;
  section.append(nom, intertitre(doc, SERVI));
  const resumes = resumesDeLAbsence(lecture, depuis);
  if (lecture === undefined) section.append(ligneVide(doc, LECTURE_DE("what was served")));
  else {
    // Les lignes viennent telles que le résumé les écrit : aucun mot n'est refait ici.
    const lignes = resumes.flatMap(({ themes }) => themes.flatMap(({ lines }) => lines.map(({ text, ticketNumber }) => `${text} (#${ticketNumber})`)));
    section.append(lignes.length === 0 ? ligneVide(doc, RIEN_SERVI) : liste(doc, lignes, "servis"));
  }
  const avecAutonomie = resumes.filter(({ autonomy }) => autonomy !== undefined);
  if (avecAutonomie.length > 0) {
    section.append(intertitre(doc, AUTONOMIE));
    for (const resume of avecAutonomie) {
      const semaine = doc.createElement("p");
      semaine.className = "semaine";
      semaine.textContent = semaineDite(resume);
      section.append(semaine, chiffresDeLAutonomie(doc, /** @type {NonNullable<Resume["autonomy"]>} */ (resume.autonomy)));
    }
  }
  section.append(intertitre(doc, ATTENTE_DE(attentes.length)));
  section.append(attentes.length === 0 ? ligneVide(doc, RIEN_N_ATTEND) : liste(doc, attentes.map(({ ticket, titre }) => (titre === undefined ? `#${ticket}` : `#${ticket} ${titre}`)), "attentes"));
  return section;
}
