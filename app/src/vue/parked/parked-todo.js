// @ts-check
// Le TODO du chef fait des tickets parked qui l'attendent (ticket 4281, épique 4129 ; spec 2026-11-24-simplified-process,
// règle 16) : exactement les enregistrements dont « who » est le chef, et aucun autre. Chaque item dit qui, pour quoi et
// jusqu'à quand, et porte ses boutons : un clic répond — l'action de réponse, une fois, avec le ticket et la réponse
// choisie —, et l'item quitte le TODO. Rien à taper ni à recopier. C'est le TODO que le rail pose (kitchen.js,
// `poserLeTodo`, ticket 4261), qui lui donne les boutons de chaque carte.
// `choices` : les mêmes pour chaque item, ou ceux de son ticket — le recommandé, plein. `open` : son numéro ouvre sa carte,
// d'un clic (`openTitle` au survol). En lecture seule (`readOnly`, la raison), l'item se lit sans bouton.
// Au clavier (ticket 4646) : un item qui a le focus se répond — `1` à `5` ses choix, Entrée le recommandé, Échap le replie
// sur une ligne (« later »), qu'Entrée rouvre. Répondu, à la souris ou au clavier, un item se replie sur une ligne qui dit la
// réponse envoyée, et le focus passe au suivant. `answered` et `later` gardent ces lignes d'un rendu à l'autre ; `data-cle`
// sur l'item laisse la vue lui rendre le clavier quand le rail est redessiné.
// Ce module ne touche pas `document` : il reçoit de quoi créer un élément, la vue lui donne le sien et les tests un faux.

import { button } from "../components/button/button.js";
import { waitingFor } from "./records.js";

/** @typedef {import("../bricks.js").Fabrique} Fabrique */
/** @typedef {import("./records.js").ParkedRecord} ParkedRecord */
/** @typedef {{ texte: string, recommande?: boolean, ouvre?: boolean }} Choice */
/**
 * @typedef {{ records: readonly ParkedRecord[], chef: string, choices: readonly string[] | ((record: ParkedRecord) => readonly Choice[]),
 *   answer: (ticket: number, choice: string) => unknown, readOnly?: string, open?: (ticket: number) => void,
 *   openTitle?: (ticket: number) => string,
 *   answered?: Map<number, string>, later?: Set<number> }} Options
 */

const NO_WHAT = "for what: not given";
const NO_UNTIL = "no date set";
/** @param {number} n */
const headOf = (n) => `TODO (${n})`;
export const LATER = "later";
export const ANSWERED = "answered";
// La clé d'un item, que la vue reconnaît pour lui rendre le clavier (vue.js, `renderTheKeyboard`).
export const KEY_OF_ENTRY = "entree-du-todo";
// Les touches qui choisissent : `1` le premier choix, jusqu'à `5`.
const CHOICE_KEYS = ["1", "2", "3", "4", "5"];
// Une frappe dans un champ est du texte, jamais un choix.
const TYPING = ["INPUT", "TEXTAREA", "SELECT"];

// Qui il attend et jusqu'à quand, sur une ligne ; et pour quoi, quand rien ne le dit au-dessus.
/** @param {Fabrique} doc @param {ParkedRecord} record */
function whoAndWhen(doc, { who, what, until }) {
  const line = doc.createElement("span");
  line.className = "qui-jusqua";
  line.textContent = [`waits for ${who}`, ...(what === null ? [NO_WHAT] : []), until === null ? NO_UNTIL : `until ${until}`].join(" · ");
  return line;
}

/** @param {Fabrique} doc @param {Options} options */
export function parkedTodo(doc, { records, chef, choices, answer, readOnly, open, openTitle = (ticket) => `open #${ticket}'s card`, answered = new Map(), later = new Set() }) {
  const itsOwn = waitingFor(records, chef);
  const frame = doc.createElement("div");
  frame.className = "todo-du-rail";
  frame.ariaLabel = "What awaits you";
  const head = doc.createElement("p");
  head.className = "tete-du-todo";
  let remaining = itsOwn.filter(({ ticket }) => !answered.has(ticket)).length;
  head.textContent = headOf(remaining);
  const list = doc.createElement("ol");
  list.className = "entrees-du-todo";
  list.append(
    ...itsOwn.map((record) => {
      const { ticket } = record;
      const item = doc.createElement("li");
      item.className = "entree-du-todo";
      item.dataset.ticket = String(ticket);
      const name = `#${ticket}${record.title === undefined ? "" : ` ${record.title}`}`;
      // Sa ligne repliée : ce qui a été répondu, ou « later ».
      const folded = doc.createElement("span");
      folded.className = "pli-du-todo";
      /** @param {string} text */
      const foldTo = (text) => {
        folded.textContent = `${name} · ${text}`;
        for (const child of item.children) child.hidden = child !== folded;
        if (folded.parentElement !== item) item.append(folded);
        item.dataset.plie = "";
      };
      const said = answered.get(ticket);
      if (said !== undefined) {
        foldTo(`${ANSWERED}: “${said}”`);
        return item;
      }
      if (open === undefined) item.append(Object.assign(doc.createElement("strong"), { textContent: name }));
      else item.append(Object.assign(button(doc, name, () => open(ticket), { sorte: "discret" }), { title: openTitle(ticket) }));
      if (record.what !== null) item.append(Object.assign(doc.createElement("p"), { className: "demande-du-todo", textContent: record.what }));
      item.append(whoAndWhen(doc, record));
      if (readOnly !== undefined) return item;
      /** @type {readonly Choice[]} */
      const theChoice = typeof choices === "function" ? choices(record) : choices.map((text) => ({ texte: text }));
      // Le prochain item qui attend encore une réponse, après celui-ci, sinon avant : il prend le focus.
      const next = () => {
        /** @type {any[]} */
        const all = [...list.children];
        const others = all.filter((other) => other.tabIndex === 0 && !("plie" in other.dataset));
        return others.find((other) => all.indexOf(other) > all.indexOf(item)) ?? others.find((other) => other !== item);
      };
      /** @param {Choice} choice */
      const choose = ({ texte: text, ouvre: opens }) => {
        // Un bouton qui ouvre la carte (la réponse s'y écrit) ne quitte pas le TODO : la carte, une fois répondue, le fera.
        if (opens === true && open !== undefined) return open(ticket);
        if (answered.has(ticket)) return;
        answered.set(ticket, text);
        later.delete(ticket);
        remaining -= 1;
        head.textContent = headOf(remaining);
        foldTo(`${ANSWERED}: “${text}”`);
        item.tabIndex = -1;
        // Le focus d'abord : la réponse redessine le rail, qui rend le clavier à l'item qui l'a.
        next()?.focus();
        answer(ticket, text);
      };
      const buttons = theChoice.map((choice) => button(doc, choice.texte, () => choose(choice), { sorte: choice.recommande === true ? "recommande" : "secondaire" }));
      if (buttons.length > 0) {
        const answers = doc.createElement("div");
        answers.className = "reponses-du-todo";
        answers.append(...buttons);
        item.append(answers);
      }
      item.tabIndex = 0;
      item.dataset.cle = `${KEY_OF_ENTRY}#${ticket}`;
      item.dataset.champ = KEY_OF_ENTRY;
      const unfold = () => {
        later.delete(ticket);
        delete item.dataset.plie;
        folded.remove();
        for (const child of item.children) child.hidden = false;
      };
      folded.title = "Enter opens it again";
      folded.addEventListener("click", unfold);
      if (later.has(ticket)) foldTo(LATER);
      item.addEventListener("keydown", (/** @type {KeyboardEvent} */ event) => {
        if (event.ctrlKey || event.metaKey || event.altKey || TYPING.includes(/** @type {any} */ (event.target)?.tagName)) return;
        const folds = "plie" in item.dataset;
        if (event.key === "Escape" && !folds) {
          later.add(ticket);
          foldTo(LATER);
        } else if (event.key === "Enter" && event.target === item) {
          if (folds) unfold();
          else {
            const recommended = theChoice.find(({ recommande }) => recommande === true);
            if (recommended === undefined) return;
            choose(recommended);
          }
        } else if (!folds && CHOICE_KEYS.includes(event.key) && theChoice[Number(event.key) - 1] !== undefined) choose(/** @type {Choice} */ (theChoice[Number(event.key) - 1]));
        else return;
        event.preventDefault();
        event.stopPropagation();
      });
      return item;
    }),
  );
  frame.append(head, list);
  return frame;
}
