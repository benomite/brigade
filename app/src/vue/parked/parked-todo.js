// @ts-check
// Le TODO du chef fait des tickets parked qui l'attendent (ticket 4281, épique 4129 ; spec 2026-11-24-simplified-process,
// règle 16) : exactement les enregistrements dont « who » est le chef, et aucun autre. Chaque item dit qui, pour quoi et
// jusqu'à quand, et porte ses boutons : un clic répond — l'action de réponse, une fois, avec le ticket et la réponse
// choisie —, et l'item quitte le TODO. Rien à taper ni à recopier. `open` : son numéro ouvre sa carte, d'un clic. `control` : le contrôle de park d'un item
// (park-control.js), derrière « park or unpark… » ; `opened` garde les items dont il est ouvert d'un rendu à l'autre.
// En lecture seule (`readOnly`, la raison), l'item se lit sans bouton.
// Ce module ne touche pas `document` : il reçoit de quoi créer un élément, la vue lui donne le sien et les tests un faux.

import { bouton } from "../composants/bouton/bouton.js";
import { waitingFor } from "./records.js";

/** @typedef {import("../briques.js").Fabrique} Fabrique */
/** @typedef {import("./records.js").ParkedRecord} ParkedRecord */
/**
 * @typedef {{ records: readonly ParkedRecord[], chef: string, choices: readonly string[], answer: (ticket: number, choice: string) => unknown,
 *   readOnly?: string, control?: (record: ParkedRecord) => any, opened?: Set<number>, open?: (ticket: number) => void }} Options
 */

export const OPEN_PARK = "park or unpark…";
export const NO_WHAT = "not given";
export const NO_UNTIL = "no date set";
/** @param {number} n */
export const headOf = (n) => `Parked for you (${n})`;

// Une ligne de l'item : son libellé, puis sa valeur.
/** @param {Fabrique} doc @param {string} libelle @param {string} valeur @param {string} classe */
function champ(doc, libelle, valeur, classe) {
  const ligne = doc.createElement("span");
  ligne.className = classe;
  const nom = doc.createElement("span");
  nom.className = "libelle";
  nom.textContent = `${libelle} `;
  ligne.append(nom, valeur);
  return ligne;
}

/** @param {Fabrique} doc @param {Options} options */
export function parkedTodo(doc, { records, chef, choices, answer, readOnly, control, opened = new Set(), open }) {
  const siens = waitingFor(records, chef);
  const cadre = doc.createElement("section");
  cadre.className = "parked-todo";
  cadre.ariaLabel = "Parked tickets that wait for you";
  const tete = doc.createElement("p");
  tete.className = "tete-parked";
  const liste = doc.createElement("ol");
  liste.className = "parked-items";
  let restants = siens.length;
  tete.textContent = headOf(restants);
  liste.append(
    ...siens.map((record) => {
      const { ticket } = record;
      const item = doc.createElement("li");
      item.className = "parked-item";
      item.dataset.ticket = String(ticket);
      const nom = `#${ticket}${record.title === undefined ? "" : ` ${record.title}`}`;
      const numero = open === undefined ? doc.createElement("strong") : bouton(doc, nom, () => open(ticket), { sorte: "discret" });
      numero.textContent = nom;
      if (open !== undefined) numero.title = `open #${ticket}'s card`;
      const ligne = doc.createElement("p");
      ligne.className = "parked-ligne";
      ligne.append(numero, champ(doc, "who", record.who, "who"), champ(doc, "for", record.what ?? NO_WHAT, "what"), champ(doc, "until", record.until ?? NO_UNTIL, "until"));
      item.append(ligne);
      if (record.note !== undefined) {
        const note = doc.createElement("p");
        note.className = "parked-note";
        note.textContent = record.note;
        item.append(note);
      }
      if (readOnly !== undefined) return item;
      let repondu = false;
      const boutons = doc.createElement("div");
      boutons.className = "parked-answers";
      boutons.append(
        ...choices.map((choice) =>
          bouton(doc, choice, () => {
            if (repondu) return;
            repondu = true;
            item.remove();
            restants -= 1;
            tete.textContent = headOf(restants);
            answer(ticket, choice);
          }),
        ),
      );
      item.append(boutons);
      if (control === undefined) return item;
      /** @type {any} */
      let pose = opened.has(ticket) ? control(record) : undefined;
      const ouvrir = bouton(
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
      ouvrir.dataset.action = "open-park";
      boutons.append(ouvrir);
      if (pose !== undefined) item.append(pose);
      return item;
    }),
  );
  cadre.append(tete, liste);
  return cadre;
}

// Le TODO parked tel que la vue le pose dans celui du chef : rien quand aucun ticket parked ne l'attend.
/** @param {Fabrique} doc @param {Options} options @returns {any[]} */
export const parkedInTodo = (doc, options) => (waitingFor(options.records, options.chef).length > 0 ? [parkedTodo(doc, options)] : []);
