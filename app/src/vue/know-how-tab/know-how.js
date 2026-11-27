// @ts-check
// Le savoir-faire du projet (ticket 4241, épique 4140) : l'onglet Know-how du menu du projet, entre Stations et Settings.
// Il liste les entrées que les cooks du projet reçoivent, chacune avec le ticket d'où elle est née. Le chef en réécrit une
// sur place — « edit » ouvre son texte dans un champ, « save » l'enregistre, « cancel » le laisse — ou en retire une —
// « remove », puis « Yes, remove ». Sans entrée, l'onglet le dit. Une lecture ou un geste qui échoue se dit en une ligne,
// le détail au survol, et le texte en cours reste dans son champ.
// Chaque ouverture de l'onglet relit les entrées (`relireLeSavoirFaire`) ; ce que le chef a ouvert, tapé ou envoyé est
// gardé ici, par projet, et chaque rendu le reprend : la vue repose l'onglet à chaque lecture de la cuisine.
// Ce module ne touche pas `document` : il reçoit de quoi créer un élément, la vue lui donne le sien et les tests un faux.

import { buttonAction } from "../bricks.js";
import { lineError } from "../components/line-error/line-error.js";
import { CANCEL, RECORDING, READ_OF, YES, NOT_STILL, RETRY } from "../lexicon.js";
import { source } from "./source.js";

/** @typedef {import("../bricks.js").Fabrique} Fabrique */
/** @typedef {import("./source.js").Entry} Entry */
/** @typedef {typeof IN_PROGRESS | { entrees: Entry[] } | { raison: string, detail: string }} Reading */
/**
 * `edition` : l'entrée ouverte dans son champ, et ce qui y est tapé ; `aRetirer` : l'entrée dont le retrait attend sa
 * confirmation ; `enRoute` : l'entrée dont un geste est parti ; `refus` : le dernier geste refusé, sous son entrée.
 * @typedef {{ lecture: Reading, edition?: { id: string, texte: string }, aRetirer?: string, enRoute?: string, refus?: { id: string, raison: string, detail: string } }} State
 */

export const TITLE = "Know-how";
const HELP = "What the project's cooks have learned, each entry with the ticket it came from. Each cook receives the latest entries when it starts.";
const FIELD = "savoir-faire";
// La lecture partie, pas encore revenue.
const IN_PROGRESS = "en-cours";

/** @type {Map<string, State>} */
const states = new Map();

/** @param {unknown} error */
const reasonOf = (error) => ({ raison: error instanceof Error ? error.message : String(error), detail: String(/** @type {{ detail?: unknown }} */ (error)?.detail ?? "") });

/**
 * Relit les entrées du projet, et oublie ce qui était ouvert : `reposer` est appelé quand elles sont là.
 * @param {string} project @param {() => void} rest
 */
export function rereadTheKnowHow(project, rest) {
  /** @type {State} */
  const state = { lecture: IN_PROGRESS };
  states.set(project, state);
  void source.lire(project).then(
    (entries) => ({ entrees: entries }),
    (error) => reasonOf(error),
  ).then((reading) => {
    // Une lecture plus récente est partie : celle-ci ne dit plus rien.
    if (states.get(project) !== state) return;
    state.lecture = reading;
    rest();
  });
}

/**
 * Un geste sur une entrée : parti, puis `appliquer` s'il passe, ou son refus sous l'entrée.
 * @param {string} project @param {State} state @param {string} id @param {() => Promise<void>} action @param {(entries: Entry[]) => Entry[]} apply @param {() => void} rest
 */
async function play(project, state, id, action, apply, rest) {
  state.enRoute = id;
  delete state.refus;
  rest();
  try {
    await action();
  } catch (error) {
    if (states.get(project) !== state) return;
    delete state.enRoute;
    state.refus = { id, ...reasonOf(error) };
    return rest();
  }
  if (states.get(project) !== state) return;
  delete state.enRoute;
  delete state.edition;
  delete state.aRetirer;
  // Un geste ne part que d'une entrée lue : la lecture de cet état a ses entrées.
  state.lecture = { entrees: apply(/** @type {{ entrees: Entry[] }} */ (state.lecture).entrees) };
  rest();
}

/** @param {Fabrique} doc @param {string} balise @param {string} classe @param {string} text */
function text(doc, balise, classe, text) {
  const created = doc.createElement(balise);
  created.className = classe;
  created.textContent = text;
  return created;
}

/**
 * Une entrée : son texte — ou son champ, ouverte —, le ticket d'où elle vient, ses gestes, et le refus du dernier.
 * @param {Fabrique} doc @param {string} project @param {State} state @param {Entry} entry @param {() => void} rest
 */
function setTheEntry(doc, project, state, entry, rest) {
  const { id } = entry;
  const line = doc.createElement("li");
  line.className = "entree";
  const inRoute = state.enRoute === id;
  const edition = state.edition?.id === id ? state.edition : undefined;
  /** @type {any[]} */
  const actionRow = [];
  if (edition !== undefined) {
    const field = doc.createElement("textarea");
    field.className = "texte";
    field.ariaLabel = `the text of the entry from #${entry.ticket}`;
    field.dataset.cle = `${project}#${id}`;
    field.dataset.champ = FIELD;
    // Le texte d'avant, en valeur par défaut ; ce qui est tapé, en valeur.
    field.textContent = entry.text;
    field.value = edition.texte;
    field.readOnly = inRoute;
    field.addEventListener("input", () => (edition.texte = field.value));
    line.append(field);
    // Le texte tel que le runtime l'écrit : sur une ligne (runtime/src/savoir-faire/savoir-faire.ts).
    const record = () => {
      const tape = field.value;
      const written = tape.replace(/\s+/g, " ").trim();
      void play(project, state, id, () => source.modifier(id, tape, project), (entries) => entries.map((one) => (one.id === id ? { ...one, text: written } : one)), rest);
    };
    actionRow.push(
      buttonAction(doc, inRoute ? RECORDING : "save", record, { recommande: true }),
      buttonAction(doc, CANCEL, () => {
        delete state.edition;
        delete state.refus;
        rest();
      }),
    );
  } else {
    line.append(text(doc, "p", "texte", entry.text));
    if (state.aRetirer === id) {
      line.append(text(doc, "p", "confirmation", "Remove this entry? No cook will receive it any more."));
      const remove = () => source.retirer(id, project);
      actionRow.push(
        buttonAction(doc, YES("remove"), () => void play(project, state, id, remove, (entries) => entries.filter((one) => one.id !== id), rest), { sorte: "danger" }),
        buttonAction(doc, CANCEL, () => {
          delete state.aRetirer;
          rest();
        }),
      );
    } else {
      actionRow.push(
        buttonAction(doc, "edit", () => {
          state.edition = { id, texte: entry.text };
          delete state.aRetirer;
          delete state.refus;
          rest();
        }),
        buttonAction(doc, "remove", () => {
          state.aRetirer = id;
          delete state.edition;
          delete state.refus;
          rest();
        }),
      );
    }
  }
  line.append(text(doc, "span", "ticket", `from #${entry.ticket}`));
  const actions = doc.createElement("div");
  actions.className = "gestes";
  for (const action of actionRow) action.children[0].disabled = inRoute;
  actions.append(...actionRow);
  line.append(actions);
  if (state.refus?.id === id) line.append(lineError(doc, state.refus.raison, state.refus.detail, { classe: "refus", alerte: true }));
  return line;
}

/**
 * L'onglet Know-how du projet. Jamais lu pour ce projet : la lecture part, et l'onglet le dit en l'attendant.
 * @param {Fabrique} doc @param {string} project @param {() => void} rest
 */
export function setTheKnowHow(doc, project, rest) {
  if (!states.has(project)) rereadTheKnowHow(project, rest);
  const state = /** @type {State} */ (states.get(project));
  const section = doc.createElement("section");
  section.className = "savoir-faire";
  section.ariaLabel = TITLE;
  section.append(text(doc, "h2", "titre", TITLE), text(doc, "p", "aide", HELP));
  const { lecture: reading } = state;
  if (reading === IN_PROGRESS) section.append(text(doc, "p", "lecture", READ_OF("the know-how")));
  else if ("raison" in reading) section.append(lineError(doc, reading.raison, reading.detail), buttonAction(doc, RETRY, () => rereadTheKnowHow(project, rest)));
  else if (reading.entrees.length === 0) section.append(text(doc, "p", "aucune", `${NOT_STILL("know-how")} The project has no entry.`));
  else {
    const list = doc.createElement("ul");
    list.className = "entrees";
    list.append(...reading.entrees.map((entry) => setTheEntry(doc, project, state, entry, rest)));
    section.append(list);
  }
  return section;
}
