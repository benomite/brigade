// @ts-check
// Les gestes de WAITING (tickets 591 et 3075), sur la carte d'un ticket et sur sa fiche : « waiting for… » sur une carte de TODO,
// qui ouvre son formulaire — ce qu'elle attend, dans les mots du chef ; de qui ; le jour de la relance, proposé à sept
// jours ; puis « resume » et « it arrived, back to the kitchen » sur une carte de WAITING. Ce qui part se décide dans le
// process principal (wait.ts, vue/wait/wait-github.ts) : ce module pose les boutons et le formulaire, et rend
// chaque clic à la vue, qui tient l'état de chaque carte. Il ne touche pas `document` : la vue lui donne le sien, les
// tests un faux.

import { button } from "../components/button/button.js";
import { lineError } from "../components/line-error/line-error.js";
import { CANCEL } from "../lexicon.js";

/** @typedef {import("../bricks.js").Fabrique} Fabrique */
/** @typedef {{ id: string, libelle: string }} Action */
/** @typedef {{ quoi: string, qui: string, relance: string, refus?: string }} Open */
/** @typedef {{ envoi: true } | { fait: string, detail: string } | { refus: string, detail: string }} Arrival */

// Le jour de la relance que le formulaire propose : dans sept jours, au calendrier du poste (vue/wait/input.ts,
// `relanceProposee`) — modifiable.
/** @param {Date} now */
export function relaunchProposed(now) {
  const inside = new Date(now.getFullYear(), now.getMonth(), now.getDate() + 7);
  return `${inside.getFullYear()}-${String(inside.getMonth() + 1).padStart(2, "0")}-${String(inside.getDate()).padStart(2, "0")}`;
}

/** @param {Fabrique} doc @param {string} balise @param {string} text */
const block = (doc, balise, text) => {
  const created = doc.createElement(balise);
  created.textContent = text;
  return created;
};

// Ce que chaque bouton dit au survol.
/** @param {string} id @param {number} ticket */
const hoverOf = (id, ticket) =>
  id === "attente-poser"
    ? `put #${ticket} in WAITING: say what it waits for, from whom, and when to come back to it`
    : id === "attente-reprendre"
      ? `bring #${ticket} back into TODO, now — it stops waiting`
      : `#${ticket} goes back to the kitchen, without going through TODO — \`waiting\` removed from its issue`;

// Les gestes de WAITING d'une carte : une rangée de boutons — ou, le formulaire ouvert, le formulaire. `arrivee` : ce
// qu'il est advenu de son « it arrived », dit sous la rangée. `cle` : `<projet>#<ticket>`, qui nomme ses champs. `cliquer` : un bouton touché, par son geste.
/**
 * @param {Fabrique} doc
 * @param {{ ticket: number, cle: string, siens: readonly Action[], ouvert: Open | undefined, arrivee: Arrival | undefined }} etat
 * @param {{ cliquer: (id: string) => void, valider: () => void, renoncer: () => void }} actions
 * @returns {HTMLElement[]}
 */
export function setTheActionsOfWait(doc, { ticket, cle: key, siens: itsOwn, ouvert: opened, arrivee: arrival }, actions) {
  if (itsOwn.length === 0) return [];
  if (opened !== undefined && itsOwn.some(({ id }) => id === "attente-poser")) return [setTheForm(doc, ticket, key, opened, actions)];
  const row = doc.createElement("p");
  row.className = "gestes attente";
  row.append(
    ...itsOwn.map(({ id, libelle: wording }) => {
      const pose = button(doc, wording, () => actions.cliquer(id));
      pose.dataset.attente = id;
      pose.title = hoverOf(id, ticket);
      if (arrival !== undefined && "envoi" in arrival) pose.disabled = true;
      return pose;
    }),
  );
  if (arrival === undefined) return [row];
  const saidOne = "refus" in arrival ? lineError(doc, arrival.refus, arrival.detail, { classe: "arrivee refus" }) : block(doc, "p", "envoi" in arrival ? "it arrived, back to the kitchen: sent, waiting for the answer…" : arrival.fait);
  if (!("refus" in arrival)) saidOne.className = "arrivee";
  saidOne.ariaLive = "polite";
  if ("fait" in arrival && arrival.detail !== "") saidOne.title = arrival.detail;
  return [row, saidOne];
}

// Le formulaire « waiting for… » : trois champs, que le chef remplit, puis « put in WAITING », qui fait partir le geste —
// ou dit, sous les champs, pourquoi il ne part pas (`ouvert.refus`) ; « Cancel » le referme, et rien ne part.
/** @param {Fabrique} doc @param {number} ticket @param {string} key @param {Open} opened @param {{ valider: () => void, renoncer: () => void }} gestes */
function setTheForm(doc, ticket, key, opened, { valider: validate, renoncer: giveUp }) {
  const form = doc.createElement("form");
  form.className = "attente";
  /** @param {"quoi" | "qui" | "relance"} field @param {string} wording @param {string} [type] */
  const input = (field, wording, type) => {
    const label = doc.createElement("label");
    const entry = doc.createElement("input");
    if (type !== undefined) entry.type = type;
    entry.value = opened[field];
    entry.dataset.champ = field;
    // La vue rend le clavier au champ qu'il tenait quand elle redessine la carte.
    entry.dataset.cle = key;
    entry.addEventListener("input", () => void (opened[field] = entry.value));
    label.append(block(doc, "span", wording), entry);
    return label;
  };
  const set = button(doc, "put in WAITING", undefined, { sorte: "recommande", type: "submit" });
  set.dataset.attente = "attente-poser";
  const row = doc.createElement("p");
  row.className = "gestes";
  row.append(set, button(doc, CANCEL, giveUp, { sorte: "discret" }));
  form.append(
    block(doc, "strong", `#${ticket} waits for a third party`),
    input("quoi", "what it waits for, in your words"),
    input("qui", "from whom"),
    input("relance", "follow-up on", "date"),
    ...(opened.refus === undefined ? [] : [Object.assign(block(doc, "p", opened.refus), { className: "refus" })]),
    row,
  );
  form.addEventListener("submit", (/** @type {Event} */ soumission) => {
    soumission.preventDefault();
    validate();
  });
  return form;
}
