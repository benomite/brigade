// @ts-check
// Le contrôle de park (ticket 4281, épique 4129 ; spec 2026-11-24-simplified-process, règle 13) : garer un ticket — qui
// il attend (une personne, ou le chef), pour quoi, jusqu'à quand (une date ou un fait) — ou le dégarer. Un formulaire où
// manque l'un des trois ne part pas, et dit lequel à l'écran. Park et unpark appellent le même geste partagé, avec les
// mêmes arguments — le projet, le ticket, l'étape où il en était — quel que soit le projet ; ce que le geste rend se dit
// sous le formulaire. `form` : ce que le chef a tapé, gardé d'un rendu à l'autre.
// Ce module ne touche pas `document` : il reçoit de quoi créer un élément, la vue lui donne le sien et les tests un faux.

import { button } from "../composants/button/button.js";

/** @typedef {import("../briques.js").Fabrique} Fabrique */
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
  const cadre = doc.createElement("div");
  cadre.className = "park-control";
  cadre.ariaLabel = `park or unpark #${ticket}`;
  const champs = FIELDS.map(({ field, label, placeholder }) => {
    const line = doc.createElement("label");
    const name = doc.createElement("span");
    name.textContent = label;
    const saisie = doc.createElement("input");
    saisie.type = "text";
    saisie.dataset.field = field;
    saisie.placeholder = placeholder;
    saisie.value = form[field] ?? "";
    saisie.addEventListener("input", () => void (form[field] = saisie.value));
    line.append(name, saisie);
    return { field, saisie, ligne: line };
  });
  const dit = doc.createElement("p");
  dit.className = "park-reason";
  dit.role = "status";
  let enRoute = false;
  /** @param {string} texte @param {string} [detail] */
  const tell = (texte, detail = "") => {
    dit.textContent = texte;
    dit.title = detail;
  };
  /** @param {Ask} ask */
  const envoyer = async (ask) => {
    if (enRoute) return;
    enRoute = true;
    tell(SENDING);
    try {
      const rendu = await gesture({ project, ticket, step }, ask);
      if (rendu === undefined || rendu === null) tell("");
      else if ("refus" in rendu) tell(rendu.refus, rendu.detail);
      else tell(rendu.fait);
    } catch (error) {
      tell(`nothing sent: ${error instanceof Error ? error.message : String(error)}`);
    }
    enRoute = false;
  };
  const garer = button(
    doc,
    PARK,
    () => {
      const [who = "", what = "", until = ""] = champs.map(({ saisie }) => String(saisie.value).trim());
      const manque = FIELDS.find(({ field }) => ({ who, what, until })[field] === "");
      if (manque !== undefined) return tell(manque.missing);
      void envoyer({ action: "park", who, what, until });
    },
    { sorte: "recommande" },
  );
  garer.dataset.action = "park";
  const degarer = button(doc, UNPARK, () => void envoyer({ action: "unpark" }));
  degarer.dataset.action = "unpark";
  const boutons = doc.createElement("div");
  boutons.className = "park-buttons";
  boutons.append(garer, degarer);
  cadre.append(...champs.map(({ ligne: line }) => line), boutons, dit);
  return cadre;
}
