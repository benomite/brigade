// @ts-check
// "Make this computer cook": on a computer that is not a station, a line offers to install one. Its button asks the main
// process to open the install command in a terminal (a Mac) and shows that command, for the chef to paste where no
// terminal opens. Nothing is shown with a station installed, or while the offer is not read. This module does not touch
// `document`.

import { buttonAction } from "../bricks.js";

/** @typedef {import("../bricks.js").Fabrique} Fabrique */
/** @typedef {{ stage: "offered" } | { stage: "shown", command: string } | { stage: "refused", reason: string }} State */

export const OFFER = "Make this computer cook";
export const ACTION = "make this computer cook";
export const PASTE = "Run this in a terminal:";

/**
 * @param {{ read: () => Promise<unknown>, make: () => Promise<unknown>, render: () => void }} options
 */
export function holdMakeCook({ read, make, render }) {
  /** @type {boolean} */
  let offered = false;
  /** @type {State} */
  let state = { stage: "offered" };
  return {
    get state() {
      return state;
    },
    get offered() {
      return offered;
    },
    // Reads whether this computer is offered the install; a read that fails offers nothing.
    async look() {
      let answer;
      try {
        answer = await read();
      } catch {
        answer = undefined;
      }
      offered = typeof answer === "object" && answer !== null && "offered" in answer && answer.offered === true;
      render();
    },
    async make() {
      let answer;
      try {
        answer = await make();
      } catch {
        answer = undefined;
      }
      state =
        typeof answer === "object" && answer !== null && "commande" in answer && typeof answer.commande === "string"
          ? { stage: "shown", command: answer.commande }
          : { stage: "refused", reason: typeof answer === "object" && answer !== null && "refus" in answer ? String(answer.refus) : "The install could not start." };
      render();
    },
  };
}

/** @param {Fabrique} doc @param {State} state @param {{ make: () => void }} action */
export function setMakeCook(doc, state, action) {
  const line = doc.createElement("div");
  line.className = "faire-cuisiner gestes";
  line.dataset.stage = state.stage;
  const said = doc.createElement("span");
  said.className = "phrase";
  said.textContent = OFFER;
  line.append(said);
  if (state.stage === "offered") line.append(buttonAction(doc, ACTION, action.make, { recommande: true }));
  if (state.stage === "shown") {
    const paste = doc.createElement("span");
    paste.className = "lecture";
    paste.textContent = PASTE;
    const command = doc.createElement("code");
    command.className = "commande";
    command.textContent = state.command;
    line.append(paste, command);
  }
  if (state.stage === "refused") {
    const reason = doc.createElement("span");
    reason.className = "lecture";
    reason.textContent = state.reason;
    line.append(reason);
  }
  return line;
}
