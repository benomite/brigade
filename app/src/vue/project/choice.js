// @ts-check
// Ce qui manque à la station pour les tests d'un projet, sur sa page (ticket 1400, épique 1393) : une carte par
// besoin que sa principale publie en attente (ticket 1398, `choix` du suivi) — ce qui manque en une phrase,
// pourquoi dessous, et ses issues, chacune un bouton avec ce qui en suit sous lui : le cuire sur une station qui
// l'a, le fournir sur celle-ci, adapter les tests. Deux besoins, deux cartes. Un clic retient l'issue ; la carte
// part dès qu'elle est écrite. Aucun choix en attente, aucune carte. La carte dit ce que le blocage du besoin
// disait (même clé, `need:<besoin>`) : la ligne du blocage ne se répète pas dessous. Ce module ne connaît aucun
// besoin ni aucune issue : il montre ceux que la station publie. Il ne touche pas `document` (bricks.js).

import { hover } from "../bricks.js";
import { button as buttonOfTheFamily, kindOfButton } from "../components/button/button.js";
import { lineError } from "../components/line-error/line-error.js";

/** @typedef {import("../bricks.js").Fabrique} Fabrique */
/** @typedef {import("../../projects/request.ts").Choice} Choice */
/** @typedef {import("../../projects/request.ts").Blockage} Blockage */
// Pourquoi une issue n'a pas été retenue, en une ligne, et ce que GitHub a dit au survol.
/** @typedef {{ refus: string, detail?: string }} Refusal */

export const RECOMMENDED = "recommended";
export const IN_PROGRESS = "recording your choice…";

/** @param {Fabrique} doc @param {string} balise @param {string} [text] */
function created(doc, balise, text) {
  const pose = doc.createElement(balise);
  if (text !== undefined) pose.textContent = text;
  return pose;
}

// Les choix qui attendent le chef : ceux que la station publie en attente, moins ceux dont l'app a déjà écrit une
// issue que la station offre — elle ne l'a pas encore lue — et ceux que la vue vient de retenir.
/** @param {readonly Choice[]} choice @param {Readonly<Record<string, string>>} [chosen] @param {ReadonlySet<string>} [retainedOnes] */
export function choiceQueued(choice, chosen = {}, retainedOnes = new Set()) {
  return choice.filter(({ id, status, options }) => status === "pending" && !retainedOnes.has(id) && !options.some((option) => option.id === chosen[id]));
}

// Les blocages que la page montre en lignes : ceux qu'aucun choix ne dit déjà — un besoin a sa carte tant qu'il
// attend, et une fois tranché, son blocage se lève à la lecture suivante de la station.
/** @param {readonly Blockage[]} blockages @param {readonly Choice[]} choice @param {Readonly<Record<string, string>>} [chosen] @param {ReadonlySet<string>} [retainedOnes] */
export function withoutTheChoice(blockages, choice, chosen = {}, retainedOnes = new Set()) {
  const saidOnes = new Set([...choice.map(({ id }) => id), ...Object.keys(chosen), ...retainedOnes]);
  return blockages.filter(({ id }) => !saidOnes.has(id));
}

/**
 * @param {Fabrique} doc @param {Choice} choice
 * @param {{ choisir: (choice: string, issue: string) => void, enCours: ReadonlySet<string>, refus: ReadonlyMap<string, Refusal> }} faire
 */
function card(doc, choice, { choisir: choose, enCours: inProgress, refus: refusal }) {
  const pose = created(doc, "section");
  pose.className = "choix";
  pose.dataset.choix = choice.id;
  const message = created(doc, "h4", choice.message);
  message.className = "message";
  const cause = created(doc, "p", choice.cause);
  cause.className = "cause";
  const issues = created(doc, "ul");
  issues.className = "issues";
  const busy = inProgress.has(choice.id);
  issues.append(
    ...choice.options.map((option) => {
      const issue = created(doc, "li");
      issue.className = "issue";
      issue.dataset.issue = option.id;
      // Une issue tient sur une ligne, coupée, entière au survol : le bouton garde ses 32 px dans une colonne étroite.
      const button = buttonOfTheFamily(doc, option.label, undefined, { coupe: true });
      button.disabled = busy;
      button.addEventListener("click", () => choose(choice.id, option.id));
      const suite = created(doc, "p", option.consequence);
      suite.className = "consequence";
      // L'issue que la station conseille se distingue des autres, et le dit ; sans son drapeau, rien.
      if (option.recommended === true) {
        kindOfButton(button, "recommande");
        const brand = created(doc, "span", RECOMMENDED);
        brand.className = "marque-recommande";
        issue.append(button, brand, suite);
      } else issue.append(button, suite);
      return issue;
    }),
  );
  pose.append(message, cause, issues);
  if (busy) {
    const line = created(doc, "p", IN_PROGRESS);
    line.className = "etat-du-choix";
    pose.append(line);
  } else {
    const rate = refusal.get(choice.id);
    if (rate !== undefined) {
      pose.append(lineError(doc, rate.refus, rate.detail, { classe: "refus-du-choix" }));
    }
  }
  return pose;
}

// Le titre de la section : ce qu'on attend du chef, en une phrase.
/** @param {string} project @param {number} howMany */
export const titleOfChoice = (project, howMany) => (howMany === 1 ? `One choice waits for you on ${project}` : `${howMany} choices wait for you on ${project}`);

// La section à poser sur la page du projet — sa phrase, puis une carte par choix qui attend le chef —, ou null : aucun.
/**
 * @param {Fabrique} doc
 * @param {{ projet: string, choix: readonly Choice[], choisis?: Readonly<Record<string, string>>, retenus?: ReadonlySet<string>, choisir?: (choice: string, issue: string) => void, enCours?: ReadonlySet<string>, refus?: ReadonlyMap<string, Refusal> }} lu
 */
export function setChoice(doc, { projet: project, choix: choice, choisis: chosen = {}, retenus: retainedOnes = new Set(), choisir: choose = () => {}, enCours: inProgress = new Set(), refus: refusal = new Map() }) {
  const expected = choiceQueued(choice, chosen, retainedOnes);
  if (expected.length === 0) return null;
  const pose = created(doc, "div");
  pose.className = "choix-a-faire";
  pose.append(created(doc, "h3", titleOfChoice(project, expected.length)), ...expected.map((oneOf) => card(doc, oneOf, { choisir: choose, enCours: inProgress, refus: refusal })));
  return pose;
}
