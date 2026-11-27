// @ts-check
// Le contrôle de park (ticket 4281, épique 4129 ; spec 2026-11-24-simplified-process, règle 13) : garer un ticket — qui
// il attend (une personne, ou le chef), pour quoi, jusqu'à quand (une date ou un fait) — ou le dégarer. Un formulaire où
// manque l'un des trois ne part pas, et dit lequel à l'écran. Park et unpark appellent le même geste partagé, avec les
// mêmes arguments — le projet, le ticket, l'étape où il en était — quel que soit le projet ; ce que le geste rend se dit
// sous le formulaire. `form` : ce que le chef a tapé, gardé d'un rendu à l'autre.
// Ce module ne touche pas `document` : il reçoit de quoi créer un élément, la vue lui donne le sien et les tests un faux.

import { button } from "../components/button/button.js";

/** @typedef {import("../bricks.js").Fabrique} Fabrique */
/** @typedef {{ project: string, ticket: number, step: string | null }} Target */
/** @typedef {{ action: "park", who: string, what: string, until: string } | { action: "unpark" }} Ask */
/** @typedef {{ fait: string } | { refus: string, detail?: string } | undefined | void} Rendered */
/** @typedef {(target: Target, ask: Ask) => Rendered | Promise<Rendered>} Gesture */
/** @typedef {{ who?: string, what?: string, until?: string }} Form */

// Les trois champs, dans l'ordre du formulaire : leur libellé, ce qu'ils attendent, et ce qui est dit quand il manque.
const FIELDS = /** @type {const} */ ([
  { field: "who", label: "who", placeholder: "a person, or the chef", missing: "nothing parked: say who it waits for — a person, or the chef" },
  { field: "what", label: "for what", placeholder: "what it waits for", missing: "nothing parked: say for what it waits" },
  { field: "until", label: "until", placeholder: "a date (YYYY-MM-DD) or a fact", missing: "nothing parked: say until when — a date or a fact" },
]);
const PARK = "park";
const UNPARK = "unpark";
const SENDING = "sending…";

/** @param {Fabrique} doc @param {{ project: string, ticket: number, step: string | null, gesture: Gesture, form?: Form }} options */
export function parkControl(doc, { project, ticket, step, gesture, form = {} }) {
  const frame = doc.createElement("div");
  frame.className = "park-control";
  frame.ariaLabel = `park or unpark #${ticket}`;
  const fields = FIELDS.map(({ field, label, placeholder }) => {
    const line = doc.createElement("label");
    const name = doc.createElement("span");
    name.textContent = label;
    const input = doc.createElement("input");
    input.type = "text";
    input.dataset.field = field;
    input.placeholder = placeholder;
    input.value = form[field] ?? "";
    input.addEventListener("input", () => void (form[field] = input.value));
    line.append(name, input);
    return { field, saisie: input, ligne: line };
  });
  const said = doc.createElement("p");
  said.className = "park-reason";
  said.role = "status";
  let inRoute = false;
  /** @param {string} text @param {string} [detail] */
  const tell = (text, detail = "") => {
    said.textContent = text;
    said.title = detail;
  };
  /** @param {Ask} ask */
  const send = async (ask) => {
    if (inRoute) return;
    inRoute = true;
    tell(SENDING);
    try {
      const rendered = await gesture({ project, ticket, step }, ask);
      if (rendered === undefined || rendered === null) tell("");
      else if ("refus" in rendered) tell(rendered.refus, rendered.detail);
      else tell(rendered.fait);
    } catch (error) {
      tell(`nothing sent: ${error instanceof Error ? error.message : String(error)}`);
    }
    inRoute = false;
  };
  const park = button(
    doc,
    PARK,
    () => {
      const [who = "", what = "", until = ""] = fields.map(({ saisie: input }) => String(input.value).trim());
      const lack = FIELDS.find(({ field }) => ({ who, what, until })[field] === "");
      if (lack !== undefined) return tell(lack.missing);
      void send({ action: "park", who, what, until });
    },
    { sorte: "recommande" },
  );
  park.dataset.action = "park";
  const degarer = button(doc, UNPARK, () => void send({ action: "unpark" }));
  degarer.dataset.action = "unpark";
  const buttons = doc.createElement("div");
  buttons.className = "park-buttons";
  buttons.append(park, degarer);
  frame.append(...fields.map(({ ligne: line }) => line), buttons, said);
  return frame;
}
