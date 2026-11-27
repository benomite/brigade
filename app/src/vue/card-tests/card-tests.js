// @ts-check
// Sur la fiche d'un ticket : pour chaque critère d'acceptation, son test et le chemin qui l'a vérifié — rouge sur main, vert
// sur la branche, N mutations survécues (ticket 3728). Ce que la fiche lit est un enregistrement par critère, produit
// ailleurs (l'étape du rail, le contrôle du ticket 3465, le contrôle de mutations de la pass) : ce module ne fait que le lire et
// le poser. Une étape que l'enregistrement ne donne pas, ou donne mal formée, est « pending » — jamais « done ».
// Ce module ne touche pas `document` : il reçoit de quoi créer un élément, la vue lui donne le sien et les tests un faux.

import { brand } from "../components/pill/pill.js";
import { NOT_REACHED } from "../lexicon.js";

/** @typedef {import("../bricks.js").Fabrique} Fabrique */
/** @typedef {"done" | "failed" | "pending"} State */
/** @typedef {{ criterion?: string, testPath?: string, redOnMain?: boolean, greenOnBranch?: boolean, mutationsCaught?: number, mutationsTotal?: number, survivingLines?: string[] }} Recording */
/** @typedef {{ criteria?: Recording[], sendBack?: string }} TestsOfCard */
/** @typedef {{ etat: State, dit: string }} Step */

// Le ton de chaque état, et son mot au survol : la forme du marqueur le dit aussi, la couleur ne porte jamais seule.
/** @type {Record<State, string>} */
const TONES = { done: "vert", failed: "rouge", pending: "gris" };

const text = (/** @type {unknown} */ value) => (typeof value === "string" && value.trim() !== "" ? value : undefined);
const whole = (/** @type {unknown} */ value) => (typeof value === "number" && Number.isInteger(value) && value >= 0 ? value : undefined);

// Les trois étapes d'un critère, dans l'ordre. Un booléen absent est pending ; faux est failed. Les mutations ne se lisent
// que si le total et les attrapées se tiennent (0 ≤ attrapées ≤ total, total > 0) : sinon pending.
/** @param {Recording} recording @returns {Step[]} */
function stepsOf(recording) {
  const { redOnMain, greenOnBranch } = recording;
  /** @param {unknown} value @param {string} name @returns {Step} */
  const boolean = (value, name) => ({ etat: value === true ? "done" : value === false ? "failed" : "pending", dit: name });
  const total = whole(recording.mutationsTotal);
  const caught = whole(recording.mutationsCaught);
  if (total === undefined || caught === undefined || total === 0 || caught > total) {
    return [boolean(redOnMain, "red on main"), boolean(greenOnBranch, "green on the branch"), { etat: "pending", dit: "survived ? mutations" }];
  }
  const survived = total - caught;
  return [boolean(redOnMain, "red on main"), boolean(greenOnBranch, "green on the branch"), { etat: survived === 0 ? "done" : "failed", dit: `survived ${survived} of ${total} mutations` }];
}

/** @param {Fabrique} doc @param {Recording} recording */
function lineOfCriterion(doc, recording) {
  const line = doc.createElement("li");
  line.className = "critere-teste";
  const sentence = doc.createElement("p");
  sentence.className = "critere-dit";
  const criterion = text(recording.criterion);
  sentence.textContent = criterion ?? "criterion not given";
  if (criterion === undefined) sentence.className += " sans";
  const path = doc.createElement("code");
  path.className = "critere-test";
  const test = text(recording.testPath);
  path.textContent = test ?? "no test given";
  if (test === undefined) path.className += " sans";
  const steps = doc.createElement("ol");
  steps.className = "critere-etapes";
  const stepsOfCriterion = stepsOf(recording);
  for (const { etat: state, dit: said } of stepsOfCriterion) {
    const step = doc.createElement("li");
    step.dataset.etat = state;
    step.title = state;
    const word = doc.createElement("span");
    word.textContent = said;
    step.append(brand(doc, TONES[state]), word);
    steps.append(step);
  }
  line.append(sentence, path, steps);
  // Une mutation qui a survécu : sa ligne de code, dite telle quelle.
  const lines = Array.isArray(recording.survivingLines) ? recording.survivingLines.filter((vue) => text(vue) !== undefined) : [];
  if (stepsOfCriterion[2]?.etat === "failed") {
    const surviving = doc.createElement("ul");
    surviving.className = "critere-survivantes";
    for (const vue of lines.length > 0 ? lines : ["no surviving line given"]) {
      const survivor = doc.createElement("li");
      const code = doc.createElement("code");
      code.textContent = vue;
      if (lines.length === 0) code.className = "sans";
      survivor.append(code);
      surviving.append(survivor);
    }
    line.append(surviving);
  }
  return line;
}

// La section de la fiche : le renvoi de la pass s'il y en a un, puis une ligne par critère. Rien quand la fiche ne porte
// aucun enregistrement ; une liste de critères illisible se dit en une ligne, jamais en critères inventés.
/** @param {Fabrique} doc @param {unknown} tests @returns {any[]} */
export function setTestsOfCard(doc, tests) {
  if (tests === undefined || tests === null) return [];
  const { criteria, sendBack } = /** @type {TestsOfCard} */ (typeof tests === "object" ? tests : {});
  const section = doc.createElement("section");
  section.className = "tests-de-fiche";
  section.ariaLabel = "the test and the path of each acceptance criterion";
  const lastSendBack = text(sendBack);
  if (lastSendBack !== undefined) {
    const sentence = doc.createElement("p");
    sentence.className = "renvoi";
    sentence.textContent = `Sent back: ${lastSendBack}`;
    section.append(sentence);
  }
  if (!Array.isArray(criteria)) {
    const sentence = doc.createElement("p");
    sentence.className = "sans";
    sentence.textContent = NOT_REACHED("the criteria and their tests");
    section.append(sentence);
    return [section];
  }
  const list = doc.createElement("ol");
  list.className = "criteres-testes";
  for (const recording of criteria) list.append(lineOfCriterion(doc, typeof recording === "object" && recording !== null ? recording : {}));
  section.append(list);
  return [section];
}
