// @ts-check
// Une capacité hors du catalogue, dans « What it provides » (ticket 1959, épique 1950) : sous les cases du formulaire
// d'une station, un champ et « Add ». Le chef y tape une capacité que ni le catalogue de la machine ni aucune autre
// station n'offre — celle qu'un ticket attend en WAITING. Ajoutée, elle devient une case, cochée, du formulaire, et elle
// s'applique aussitôt, comme une case cochée : la station la déclare avec les autres (stations-declared.js,
// `controleDesCapacites`), et le ticket qui l'attendait revient seul sur le rail.
// Déclarée, elle est offerte aux autres stations comme ce qu'elles fournissent (`choixDeCapacites`).
// Un nom vide, illisible ou déjà dans le formulaire est refusé en une ligne sous le champ : rien n'est ajouté, rien
// n'est envoyé.
// Ce que le chef a tapé et ajouté est gardé avec le formulaire ouvert (`Edition`) : un bloc reposé le redonne tel quel.
// Ce module ne touche pas `document` : il reçoit de quoi créer un élément (bricks.js), et rend un élément.

import { buttonAction, hover } from "../bricks.js";
import { lineError } from "../components/line-error/line-error.js";

/** @typedef {import("../bricks.js").Fabrique} Fabrique */
/** @typedef {import("../stations-declared.js").Edition} Edition */
/** @typedef {{ capacite: string, dite: string }} Choice */

export const ADD = "Add";
export const PROMPT = "a capability not listed";
export const HELP = "A capability no case offers yet — the one a ticket in WAITING awaits: type its name and add it — it is declared at once. The tickets waiting for it go back on the rail.";

// La règle du nom tapé, celle du runtime (runtime/src/capacite-libre/capacite-libre.ts), que la vue ne peut pas
// importer : elle ne lit pas de TypeScript. Le test de la vue les tient identiques
// (app/test/vue/capacity-free/capacity-free.test.ts).
const CAPACITY = /^[\p{L}\p{N}][\p{L}\p{N}_-]*$/u;
const SHAPE = "letters, digits and hyphens (code, navigateur-headless)";

// Le nom tapé, tel qu'il se déclare — vide s'il ne reste rien.
/** @param {string} writtenOne */
export const nameOfCapacityFree = (writtenOne) =>
  writtenOne
    .trim()
    .replace(/^`(.*)`$/s, "$1")
    .trim()
    .replace(/\s+/g, "-")
    .normalize("NFC");

// La capacité à ajouter, ou le refus : vide, illisible, ou déjà parmi `presentes`.
/** @param {string} writtenOne @param {readonly string[]} present @returns {{ capacite: string } | { refus: string }} */
export function capacityFree(writtenOne, present) {
  const name = nameOfCapacityFree(writtenOne);
  if (name === "") return { refus: "Nothing added: type the capability's name first." };
  if (!CAPACITY.test(name)) return { refus: `Nothing added: “${name}” is not a capability name — ${SHAPE}.` };
  if (present.some((presente) => presente.normalize("NFC") === name)) return { refus: `Nothing added: “${name}” is already in the form — tick its box.` };
  return { capacite: name };
}

// Ce que le chef a tapé, le refus de son dernier « Add », et ce qu'il a ajouté — par formulaire ouvert.
/** @type {WeakMap<Edition, { texte: string, refus?: string, ajoutees: Choice[] }>} */
const inputs = new WeakMap();
/** @param {Edition} edition */
function inputOf(edition) {
  const heldOne = inputs.get(edition) ?? { texte: "", ajoutees: [] };
  inputs.set(edition, heldOne);
  return heldOne;
}

// Les cases du formulaire : celles qu'il offre, puis celles que le chef y a ajoutées — une fois chacune, même quand le
// catalogue de cette machine, lu après, en offre une.
/** @param {Edition} edition @returns {Choice[]} */
export function casesOfForm(edition) {
  const offered = new Set(edition.choix.map(({ capacite: capacity }) => capacity));
  return [...edition.choix, ...(inputs.get(edition)?.ajoutees ?? []).filter(({ capacite: capacity }) => !offered.has(capacity))];
}

// Le champ et « Add », sous les cases. `poserLaCase` pose, cochée, la case d'une capacité ajoutée.
/** @param {Fabrique} doc @param {Edition} edition @param {string} station @param {(choice: Choice) => void} setTheCase */
export function fieldOfCapacityFree(doc, edition, station, setTheCase) {
  const input = inputOf(edition);
  const root = doc.createElement("div");
  root.className = "capacite-libre";
  const line = doc.createElement("div");
  line.className = "saisie";
  const field = doc.createElement("input");
  field.type = "text";
  // Un nom de capacité est un mot de la machine, écrit tel qu'il se déclare : comme ses cases.
  field.className = "mono";
  field.value = input.texte;
  field.placeholder = PROMPT;
  field.ariaLabel = `a capability ${station} provides, outside the list`;
  // Le rail redessiné rend le clavier au champ où le chef tapait (vue.js, `reprise`).
  field.dataset.cle = `station:${station}`;
  field.dataset.champ = "capacite-libre";
  field.disabled = edition.envoi;
  field.addEventListener("input", () => void (input.texte = field.value));
  /** @type {HTMLElement | undefined} */
  let refusal;
  const tell = () => {
    refusal?.remove();
    refusal = input.refus === undefined ? undefined : lineError(doc, input.refus, "");
    if (refusal !== undefined) root.append(refusal);
  };
  const add = () => {
    if (edition.envoi) return;
    const rendered = capacityFree(input.texte, casesOfForm(edition).map(({ capacite: capacity }) => capacity));
    if ("refus" in rendered) input.refus = rendered.refus;
    else {
      const choice = { capacite: rendered.capacite, dite: "" };
      input.ajoutees.push(choice);
      input.texte = "";
      input.refus = undefined;
      field.value = "";
      edition.fournit = [...edition.fournit, rendered.capacite];
      setTheCase(choice);
    }
    tell();
  };
  field.addEventListener("keydown", (/** @type {KeyboardEvent} */ event) => {
    if (event.key !== "Enter") return;
    event.preventDefault();
    add();
  });
  const button = buttonAction(doc, ADD, add);
  button.firstChild.disabled = edition.envoi;
  line.append(field, button, hover(doc, HELP));
  root.append(line);
  tell();
  return root;
}
