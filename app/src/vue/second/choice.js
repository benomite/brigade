// @ts-check
// Les choix du second, sous son terminal (ticket 1520, épique 1518) : quand le second demande au chef de choisir, il
// publie ses choix par son canal (runtime/src/second-propositions/) — l'app ne lit pas le terminal —, et l'onglet du
// second les montre sous le terminal, un bouton par choix, son libellé d'une ligne. Un clic envoie le choix au second
// comme si le chef l'avait tapé ; répondre en tapant dans le terminal marche aussi. Dans les deux cas, les boutons
// partent, et l'app signale la réponse au canal, qui efface la proposition. Une proposition nouvelle remplace la
// précédente ; le second passé à autre chose, il n'y a plus rien à montrer. Sans proposition, rien sous le terminal.
// Un geste que le second nomme se montre au même endroit, par second/action.js (ticket 1521) : ce que la vue en tient —
// la confirmation ouverte, le geste lancé — est ici, avec les choix.
// Ce module ne touche pas `document` : il reçoit de quoi créer un élément (bricks.js), et rend des éléments.

import { hover } from "../bricks.js";
import { button as buttonOfTheFamily } from "../components/button/button.js";

/** @typedef {import("../bricks.js").Fabrique} Fabrique */
/** @typedef {import("../../second/proposals.ts").Proposition} Proposal */
/** @typedef {Extract<Proposal, { kind: "choices" }>} Choice */
/** @typedef {Extract<Proposal, { kind: "gesture" }>} Action */

export const EXPECTED = "The second asks you to choose";
export const HELP = "a click answers as if you had typed the choice in the terminal — you can also type your own answer there";

// Une frappe dans le terminal du second qui envoie une réponse : elle porte une Entrée. Un collage — entre les
// marques que xterm pose autour — n'envoie rien : `claude` le garde dans son champ.
/** @param {string} data */
export function answerTyped(data) {
  return data.includes("\r") && !data.startsWith("\x1b[200~");
}

// Ce que la vue tient des propositions du second, projet par projet : la dernière reçue, et celles auxquelles le chef a
// répondu — leurs boutons sont partis, même si le canal ne l'a pas encore dit. Pour un geste, la confirmation que le
// chef a ouverte : elle tient à la proposition, pas au projet — une proposition nouvelle n'en a aucune d'ouverte.
export function holdTheChoice() {
  /** @type {Map<string, Proposal>} */
  const heldEntries = new Map();
  /** @type {Set<string>} */
  const answeredEntries = new Set();
  /** @type {Set<string>} */
  const aConfirm = new Set();
  // Ce qui se montre sous le terminal du second de ce projet : la proposition reçue, sans réponse.
  /** @param {string} project */
  const inProgress = (project) => {
    const heldOne = heldEntries.get(project);
    return heldOne !== undefined && !answeredEntries.has(heldOne.id) ? heldOne : undefined;
  };
  return {
    // Tout ce que le canal envoie : une proposition, ou null quand il n'y en a plus.
    /** @param {Readonly<Record<string, Proposal>>} views */
    recevoirToutes(views) {
      for (const [project, proposal] of Object.entries(views)) if (!heldEntries.has(project)) heldEntries.set(project, proposal);
    },
    /** @param {string} project @param {Proposal | null} proposal */
    recevoir(project, proposal) {
      // Une confirmation ouverte ne survit pas à sa proposition : remplacée ou effacée, elle est refermée.
      const before = heldEntries.get(project);
      if (before !== undefined && before.id !== proposal?.id) aConfirm.delete(before.id);
      if (proposal === null) heldEntries.delete(project);
      else heldEntries.set(project, proposal);
    },
    // Les choix à montrer sous le terminal du second de ce projet : une liste de choix, sans réponse.
    /** @param {string} project @returns {Choice | undefined} */
    aMontrer(project) {
      const heldOne = inProgress(project);
      return heldOne?.kind === "choices" ? heldOne : undefined;
    },
    // Le geste à montrer sous le terminal du second de ce projet, sans réponse.
    /** @param {string} project @returns {Action | undefined} */
    geste(project) {
      const heldOne = inProgress(project);
      return heldOne?.kind === "gesture" ? heldOne : undefined;
    },
    // La confirmation du geste de ce projet : ouverte d'un clic sur son bouton, refermée d'un autre ou par « cancel ».
    /** @param {string} project */
    confirmationOuverte(project) {
      const action = this.geste(project);
      return action !== undefined && aConfirm.has(action.id);
    },
    /** @param {string} project @param {boolean} openOne */
    confirmer(project, openOne) {
      const action = this.geste(project);
      if (action === undefined) return;
      if (openOne) aConfirm.add(action.id);
      else aConfirm.delete(action.id);
    },
    // Le « run it » d'une confirmation : rend le geste à lancer, et il ne se montre plus — seulement si c'est encore
    // celui que la confirmation montrait (`id`), toujours en cours, sa confirmation ouverte. Sinon rien : le second
    // est passé à autre chose, ou a publié autre chose, et rien ne part.
    /** @param {string} project @param {string} id @returns {Action | undefined} */
    lancer(project, id) {
      const action = this.geste(project);
      if (action === undefined || action.id !== id || !aConfirm.has(id)) return undefined;
      aConfirm.delete(id);
      answeredEntries.add(id);
      return action;
    },
    // Le chef a répondu aux choix de ce projet : rend ceux auxquels il a répondu, qui ne se montrent plus.
    /** @param {string} project @returns {Choice | undefined} */
    repondre(project) {
      const shown = this.aMontrer(project);
      if (shown !== undefined) answeredEntries.add(shown.id);
      return shown;
    },
    // Le chef a répondu en tapant dans le terminal : rend ce à quoi il a répondu — des choix, ou un geste, qu'il a pu
    // taper lui-même ou refuser —, qui ne se montre plus.
    /** @param {string} project @returns {Proposal | undefined} */
    repondreAuClavier(project) {
      const shownOne = inProgress(project);
      if (shownOne === undefined) return undefined;
      answeredEntries.add(shownOne.id);
      aConfirm.delete(shownOne.id);
      return shownOne;
    },
  };
}

/** @param {Fabrique} doc @param {string} balise @param {string} [text] */
function created(doc, balise, text) {
  const pose = doc.createElement(balise);
  if (text !== undefined) pose.textContent = text;
  return pose;
}

// La zone sous le terminal : ce qu'on attend du chef, en une phrase, puis un bouton par choix — sa valeur, ce qu'un
// clic tape, et son libellé. Rien n'est coupé : un libellé long passe à la ligne.
/** @param {Fabrique} doc @param {Choice} proposal @param {{ choisir: (chosenValue: string) => void }} gestes */
export function setChoiceOfSecond(doc, proposal, { choisir: choose }) {
  const root = created(doc, "section");
  root.className = "choix-du-second";
  root.ariaLabel = EXPECTED;
  root.dataset.proposition = proposal.id;
  const expected = created(doc, "p");
  expected.className = "attendu";
  expected.append(EXPECTED, hover(doc, HELP));
  const list = created(doc, "ul");
  list.append(
    ...proposal.choices.map(({ value, label }) => {
      const choice = created(doc, "li");
      const button = buttonOfTheFamily(doc, "", undefined);
      button.className = "choix";
      button.dataset.valeur = value;
      button.title = `answers ${value}`;
      const chosenValue = created(doc, "span", value);
      chosenValue.className = "valeur mono";
      const wording = created(doc, "span", label);
      wording.className = "libelle";
      button.append(chosenValue, wording);
      button.addEventListener("click", () => choose(value));
      choice.append(button);
      return choice;
    }),
  );
  root.append(expected, list);
  return root;
}
