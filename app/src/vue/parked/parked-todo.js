// @ts-check
// Le TODO du chef fait des tickets parked qui l'attendent (ticket 4281, épique 4129 ; spec 2026-11-24-simplified-process,
// règle 16) : exactement les enregistrements dont « who » est le chef, et aucun autre. Chaque item dit qui, pour quoi et
// jusqu'à quand, et porte ses boutons : un clic répond — l'action de réponse, une fois, avec le ticket et la réponse
// choisie —, et l'item quitte le TODO. Rien à taper ni à recopier. C'est le TODO que le rail pose (kitchen.js,
// `poserLeTodo`, ticket 4261), qui lui donne les boutons de chaque carte.
// `choices` : les mêmes pour chaque item, ou ceux de son ticket — le recommandé, plein. `open` : son numéro ouvre sa carte,
// d'un clic (`openTitle` au survol). `control` : le contrôle de park d'un item (park-control.js), derrière « park or
// unpark… » ; `opened` garde les items dont il est ouvert d'un rendu à l'autre. En lecture seule (`readOnly`, la raison),
// l'item se lit sans bouton.
// Ce module ne touche pas `document` : il reçoit de quoi créer un élément, la vue lui donne le sien et les tests un faux.

import { button } from "../components/button/button.js";
import { waitingFor } from "./records.js";

/** @typedef {import("../bricks.js").Fabrique} Fabrique */
/** @typedef {import("./records.js").ParkedRecord} ParkedRecord */
/** @typedef {{ texte: string, recommande?: boolean, ouvre?: boolean }} Choice */
/**
 * @typedef {{ records: readonly ParkedRecord[], chef: string, choices: readonly string[] | ((record: ParkedRecord) => readonly Choice[]),
 *   answer: (ticket: number, choice: string) => unknown, readOnly?: string, open?: (ticket: number) => void,
 *   openTitle?: (ticket: number) => string, control?: (record: ParkedRecord) => any, opened?: Set<number> }} Options
 */

const OPEN_PARK = "park or unpark…";
const NO_WHAT = "for what: not given";
const NO_UNTIL = "no date set";
/** @param {number} n */
const headOf = (n) => `TODO (${n})`;

// Qui il attend et jusqu'à quand, sur une ligne ; et pour quoi, quand rien ne le dit au-dessus.
/** @param {Fabrique} doc @param {ParkedRecord} record */
function whoAndWhen(doc, { who, what, until }) {
  const line = doc.createElement("span");
  line.className = "qui-jusqua";
  line.textContent = [`waits for ${who}`, ...(what === null ? [NO_WHAT] : []), until === null ? NO_UNTIL : `until ${until}`].join(" · ");
  return line;
}

/** @param {Fabrique} doc @param {Options} options */
export function parkedTodo(doc, { records, chef, choices, answer, readOnly, open, openTitle = (ticket) => `open #${ticket}'s card`, control, opened = new Set() }) {
  const itsOwn = waitingFor(records, chef);
  const frame = doc.createElement("div");
  frame.className = "todo-du-rail";
  frame.ariaLabel = "What awaits you";
  const head = doc.createElement("p");
  head.className = "tete-du-todo";
  let remaining = itsOwn.length;
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
      if (open === undefined) item.append(Object.assign(doc.createElement("strong"), { textContent: name }));
      else item.append(Object.assign(button(doc, name, () => open(ticket), { sorte: "discret" }), { title: openTitle(ticket) }));
      if (record.what !== null) item.append(Object.assign(doc.createElement("p"), { className: "demande-du-todo", textContent: record.what }));
      item.append(whoAndWhen(doc, record));
      if (readOnly !== undefined) return item;
      /** @type {readonly Choice[]} */
      const theChoice = typeof choices === "function" ? choices(record) : choices.map((text) => ({ texte: text }));
      let answered = false;
      const buttons = theChoice.map(({ texte: text, recommande: recommended, ouvre: opens }) =>
        button(
          doc,
          text,
          () => {
            // Un bouton qui ouvre la carte (la réponse s'y écrit) ne quitte pas le TODO : la carte, une fois répondue, le fera.
            if (opens === true && open !== undefined) return open(ticket);
            if (answered) return;
            answered = true;
            item.remove();
            remaining -= 1;
            head.textContent = headOf(remaining);
            answer(ticket, text);
          },
          { sorte: recommended === true ? "recommande" : "secondaire" },
        ),
      );
      /** @type {any} */
      let pose = control !== undefined && opened.has(ticket) ? control(record) : undefined;
      if (control !== undefined) {
        const openIt = button(
          doc,
          OPEN_PARK,
          () => {
            if (opened.delete(ticket)) {
              pose?.remove();
              pose = undefined;
              return;
            }
            opened.add(ticket);
            pose = control(record);
            item.append(pose);
          },
          { sorte: "discret" },
        );
        openIt.dataset.action = "open-park";
        buttons.push(openIt);
      }
      if (buttons.length > 0) {
        const answers = doc.createElement("div");
        answers.className = "reponses-du-todo";
        answers.append(...buttons);
        item.append(answers);
      }
      if (pose !== undefined) item.append(pose);
      return item;
    }),
  );
  frame.append(head, list);
  return frame;
}
