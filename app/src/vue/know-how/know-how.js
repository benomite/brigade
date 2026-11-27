// @ts-check
// The project know-how, a section of Settings (ticket 4239, epic 4135): the entries of `.brigade/know-how.md` of the project's
// repository — the lessons its cooks keep for the next ones (agents/cook.md) —, grouped by section, `Conventions`,
// `Pitfalls`, `Tools` first, each with its source ticket. The chef edits the text of an entry or removes it: the change
// is proposed by a pull request on the integration branch (know-how-github.ts), which the pass reviews, and the list
// keeps what is in force until it is merged. A missing file, or one without an entry, says so in one line.
// The section is held by `tenirLeSavoir`: it reads the file when shown — at most once a minute —, keeps what the chef
// types, and is drawn again after each gesture. This module does not touch `document`: it receives what creates an element.

import { hover } from "../bricks.js";
import { button } from "../components/button/button.js";
import { lineError } from "../components/line-error/line-error.js";
import { lineEmpty } from "../components/line-empty/line-empty.js";
import { saysOfSetting } from "../components/setting/setting.js";
import { READ_OF, NOT_REACHED, NOT_STILL } from "../lexicon.js";

/** @typedef {import("../bricks.js").Fabrique} Fabrique */
/** @typedef {import("./know-how-github.ts").ReadOfKnowledge} Reading */
/** @typedef {import("./know-how-github.ts").ChangeOfKnowledge} Change */
/** @typedef {import("./know-how-github.ts").RenderedOfKnowledge} Rendered */
/** @typedef {import("./know-how-github.ts").KnowledgeEntry} Entry */
// What the screen holds of one entry, by its line: the text being typed (an edit open), the change on its way, what the
// last one returned.
/** @typedef {{ edition?: string, enCours?: "edit" | "remove", dit?: { pr: string, numero: number, kind: "edit" | "remove" } | { refus: string, detail?: string } }} State */

const TITLE = "Project know-how";
const HELP =
  "The lessons the cooks keep for the next ones, in .brigade/know-how.md of the project's repository. Editing or removing an entry opens a pull request on its integration branch, which the pass reviews; the list changes once it is merged.";
const EMPTY = `${NOT_STILL("project know-how")} .brigade/know-how.md is missing or has no entry.`;
const NOT_READ = NOT_REACHED("the project know-how");
const EMPTY_DETAIL = "Cooks add an entry, - text (#ticket), under Conventions, Pitfalls or Tools, in the pull request of the ticket that taught it.";
const WITHOUT_TICKET = "no source ticket";
const OUTSIDE_SECTION = "Outside any section";
const IN_PROGRESS = "opening the pull request…";
const EDITION = "Enter proposes the new text, Escape cancels";
// The sections of the file, in its order: the three it is made of, then any other the file has, in its order.
const SECTIONS = ["Conventions", "Pitfalls", "Tools"];

/** @param {Fabrique} doc @param {string} balise @param {string} [text] */
function created(doc, balise, text) {
  const pose = doc.createElement(balise);
  if (text !== undefined) pose.textContent = text;
  return pose;
}

// The entries by section, the file's three sections first.
/** @param {readonly Entry[]} entries @returns {[string, Entry[]][]} */
function bySection(entries) {
  /** @type {Map<string, Entry[]>} */
  const groups = new Map();
  for (const entry of entries) groups.set(entry.section, [...(groups.get(entry.section) ?? []), entry]);
  const rank = (/** @type {string} */ section) => (SECTIONS.includes(section) ? SECTIONS.indexOf(section) : SECTIONS.length);
  return [...groups].sort(([a], [b]) => rank(a) - rank(b));
}

// What names an entry in the states: its line in `.brigade/know-how.md`, or its file and line in a per-ticket file.
/** @param {{ line: number, file?: string }} entry @returns {number | string} */
const keyOf = (entry) => (entry.file === undefined || entry.file === ".brigade/know-how.md" ? entry.line : `${entry.file}:${entry.line}`);
/** @param {Entry} entry */
const fileOf = (entry) => (entry.file === undefined || entry.file === ".brigade/know-how.md" ? {} : { file: entry.file });

// What the last change of an entry says under it: on its way, the pull request opened, or the refusal.
/** @param {Fabrique} doc @param {State | undefined} state @param {(url: string) => void} open */
function saysOfTheEntry(doc, state, open) {
  if (state?.enCours !== undefined) return saysOfSetting(doc, { enCours: IN_PROGRESS });
  const said = state?.dit;
  if (said !== undefined && "pr" in said) return saysOfSetting(doc, { pr: said.pr, numero: said.numero, valeur: said.kind === "edit" ? "the new text" : "the removal" }, { ouvrir: open });
  return saysOfSetting(doc, said);
}

// One entry: its text and its source ticket, then Edit and Remove — or, its edit open, the field holding its text.
/**
 * @param {Fabrique} doc @param {Entry} entry @param {State | undefined} state
 * @param {{ editer: (entry: Entry) => void, taper: (entry: Entry, text: string) => void, annuler: (entry: Entry) => void, changer: (changeEntry: Change) => void, ouvrir: (url: string) => void }} gestes
 */
function setTheEntry(doc, entry, state, { editer: edit, taper: type, annuler: cancel, changer: change, ouvrir: open }) {
  const item = created(doc, "li");
  item.className = "entree-du-savoir";
  item.dataset.ligne = String(entry.line);
  if (entry.file !== undefined) item.dataset.fichier = entry.file;
  const busy = state?.enCours !== undefined;
  const ticket = created(doc, "span", entry.ticket === null ? WITHOUT_TICKET : `#${entry.ticket}`);
  ticket.className = entry.ticket === null ? "ticket sans" : "ticket mono";
  const actions = created(doc, "span");
  actions.className = "gestes";
  if (state?.edition !== undefined) {
    // No Save button (ticket 2920): the field applies on its `change` — Enter, or leaving it — when its text is a new one; the
    // text left as it was, or emptied, closes it; Escape closes it.
    const field = created(doc, "input");
    field.type = "text";
    field.ariaLabel = `new text of the entry${entry.ticket === null ? "" : ` from #${entry.ticket}`}`;
    field.title = EDITION;
    field.spellcheck = false;
    field.value = state.edition;
    field.disabled = busy;
    field.addEventListener("input", () => type(entry, field.value));
    field.addEventListener("change", () => {
      const text = field.value.trim();
      if (text === "" || text === entry.text) cancel(entry);
      else change({ kind: "edit", line: entry.line, ...fileOf(entry), text: text, avant: entry.text });
    });
    field.addEventListener("keydown", (/** @type {KeyboardEvent} */ event) => {
      if (event.key === "Escape") cancel(entry);
    });
    item.append(field, ticket, actions);
  } else {
    const modify = button(doc, "Edit", () => edit(entry), { sorte: "discret" });
    modify.className = "editer";
    modify.disabled = busy;
    const remove = button(
      doc,
      "Remove",
      () => {
        if (!busy) change({ kind: "remove", line: entry.line, ...fileOf(entry), avant: entry.text });
      },
      { sorte: "discret" },
    );
    remove.className = "retirer";
    remove.disabled = busy;
    actions.append(modify, remove);
    item.append(created(doc, "span", entry.text), ticket, actions);
  }
  const below = saysOfTheEntry(doc, state, open);
  if (below.length === 0) return item;
  const under = created(doc, "div");
  under.className = "sous";
  under.append(...below);
  item.append(under);
  return item;
}

// The section: its title, then — while unread, a line; unreadable, the error line; empty, the empty line — the entries by
// section of the file.
/**
 * @param {Fabrique} doc
 * @param {{ lecture?: Reading, etats?: ReadonlyMap<number | string, State>, editer?: (entry: Entry) => void, taper?: (entry: Entry, text: string) => void, annuler?: (entry: Entry) => void, changer?: (changeEntry: Change) => void, ouvrir?: (url: string) => void }} [options]
 */
function setBlockKnowledge(doc, { lecture: reading, etats: states = new Map(), editer: edit = () => {}, taper: type = () => {}, annuler: cancel = () => {}, changer: change = () => {}, ouvrir: open = () => {} } = {}) {
  const block = created(doc, "section");
  block.className = "bloc-du-projet";
  block.dataset.bloc = "know-how";
  block.ariaLabel = TITLE;
  const title = created(doc, "h3", TITLE);
  title.append(hover(doc, HELP));
  block.append(title);
  if (reading === undefined) {
    block.append(created(doc, "p", READ_OF("the project know-how")));
    return block;
  }
  if ("sans" in reading) {
    block.append(lineError(doc, reading.sans, reading.detail ?? ""));
    return block;
  }
  if (reading.vide) {
    block.append(lineEmpty(doc, EMPTY, { classe: "savoir-vide", detail: EMPTY_DETAIL }));
    return block;
  }
  for (const [section, entries] of bySection(reading.entries)) {
    const part = created(doc, "div");
    part.className = "section-du-savoir";
    part.dataset.section = section;
    const head = created(doc, "h4", section === "" ? OUTSIDE_SECTION : section);
    const account = created(doc, "small", String(entries.length));
    account.className = "compte";
    head.append(account);
    const list = created(doc, "ul");
    list.append(...entries.map((entry) => setTheEntry(doc, entry, states.get(keyOf(entry)), { editer: edit, taper: type, annuler: cancel, changer: change, ouvrir: open })));
    part.append(head, list);
    block.append(part);
  }
  return block;
}

// The section of one project, held between two drawings: its reading, the state of each entry. `lire` and `changer` go
// to the main process (main.ts, `savoirDuProjet`, `changerLeSavoir`); `reposer` draws Settings again — after a reading,
// `garder`: not under a field the chef is typing in.
/**
 * @param {Fabrique} doc
 * @param {{ lire: () => Promise<Reading | undefined>, changer: (changeEntry: Change) => Promise<Rendered | undefined>, ouvrir: (url: string) => void, reposer: (keep?: boolean) => void, maintenant?: () => number }} options
 */
export function holdTheKnowledge(doc, { lire: read, changer: change, ouvrir: open, reposer: rest, maintenant: now = Date.now }) {
  /** @type {Reading | undefined} */
  let reading;
  let readThe = -Infinity;
  let inRead = false;
  /** @type {Map<number | string, State>} */
  const states = new Map();

  const reread = () => {
    if (inRead) return;
    inRead = true;
    readThe = now();
    void Promise.resolve()
      .then(read)
      .then(
        (readEntry) => readEntry ?? { sans: NOT_READ, detail: "the app gave no reading" },
        (/** @type {unknown} */ error) => ({ sans: NOT_READ, detail: error instanceof Error ? error.message : String(error) }),
      )
      .then((readEntry) => {
        inRead = false;
        // A reading moves the lines: what was said of the old ones no longer names them.
        if (JSON.stringify(readEntry) !== JSON.stringify(reading)) for (const [line, state] of states) if (state.enCours === undefined) states.delete(line);
        reading = readEntry;
        rest(true);
      });
  };

  /** @param {Change} changeEntry */
  const propose = async (changeEntry) => {
    if (states.get(keyOf(changeEntry))?.enCours !== undefined) return;
    states.set(keyOf(changeEntry), { ...states.get(keyOf(changeEntry)), enCours: changeEntry.kind, dit: undefined });
    rest();
    /** @type {Rendered} */
    let rendered;
    try {
      rendered = (await change(changeEntry)) ?? { refus: "nothing was proposed: nothing was sent" };
    } catch (error) {
      rendered = { refus: "nothing was proposed: nothing was sent", detail: error instanceof Error ? error.message : String(error) };
    }
    if ("pr" in rendered) states.set(keyOf(changeEntry), { dit: { pr: rendered.pr, numero: rendered.numero, kind: rendered.kind } });
    else states.set(keyOf(changeEntry), { ...states.get(keyOf(changeEntry)), enCours: undefined, dit: rendered });
    rest();
  };

  return {
    poser() {
      if (now() - readThe > 60_000) reread();
      return setBlockKnowledge(doc, {
        ...(reading === undefined ? {} : { lecture: reading }),
        etats: states,
        editer: (entry) => {
          states.set(keyOf(entry), { edition: entry.text });
          rest();
        },
        taper: (entry, text) => void states.set(keyOf(entry), { ...states.get(keyOf(entry)), edition: text }),
        annuler: (entry) => {
          states.delete(keyOf(entry));
          rest();
        },
        changer: (changeEntry) => void propose(changeEntry),
        ouvrir: open,
      });
    },
  };
}
