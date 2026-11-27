// @ts-check
// La fiche du projet sous Settings (ticket 4240, épique 4136) : ce que le projet déclare — les huit articles de la table
// « The project sheet » de docs/superpowers/specs/2026-11-24-simplified-process.md —, lu dans `.brigade/fiche-projet.json`
// de son dossier, et changé ici par le chef. Un article est un texte (une ligne) ou une liste de textes (une ligne
// chacun) : il garde sa forme d'une écriture à l'autre. « Save » écrit le fichier entier, les clés que l'écran ne montre
// pas comprises ; un article que le chef laisse vide alors que le projet en a besoin — the cook's work, stages, served —
// est refusé en le nommant, et rien n'est écrit.
//
// Un projet sans fiche le dit en une ligne, sans rien créer : ses valeurs par défaut sont écrites par le runtime. Une
// fiche qui ne se lit pas — illisible, ou un article qui n'a pas la forme — le dit en une ligne, le détail au survol, et
// n'offre aucun champ : rien ne l'écrase.
//
// Ce module ne touche pas `document` : il reçoit de quoi créer un élément (bricks.js), et de quoi lire et écrire un
// fichier du projet, le chemin relatif à son dossier — `lire` rend `null`, ou rejette avec le code `ENOENT`, quand le
// fichier n'y est pas.

import { hover } from "../bricks.js";
import { button } from "../components/button/button.js";
import { lineError } from "../components/line-error/line-error.js";
import { lineEmpty } from "../components/line-empty/line-empty.js";
import { RECORDING, NOT_REACHED, NOT_STILL } from "../lexicon.js";

/** @typedef {import("../bricks.js").Fabrique} Fabrique */
/** @typedef {{ lire(path: string): Promise<string | null>, ecrire(path: string, text: string): Promise<unknown> }} Files */
/** @typedef {Record<string, unknown>} Card */
/** @typedef {{ lecture: "absente" } | { lecture: "illisible", detail: string } | { lecture: "lue", fiche: Card }} Reading */

const CARD = ".brigade/fiche-projet.json";

// Les huit articles, dans l'ordre de la spec, avec ses mots. `requis` : vide, le projet n'a plus de quoi cuire.
const ARTICLES = /** @type {const} */ ([
  { cle: "work", nom: "The cook's work", requis: true, aide: "What a cook makes for this project: code and its tests, an episode, a page." },
  { cle: "stages", nom: "Stages", requis: true, aide: "The steps a ticket goes through, each through the pass. One by default." },
  { cle: "tools", nom: "Tools", requis: false, aide: "What the cooks use to do the work." },
  { cle: "rules", nom: "House rules", requis: false, aide: "The locked pass checks. Only the chef changes them." },
  { cle: "risks", nom: "Risks", requis: false, aide: "The actions that require the chef's opinion." },
  { cle: "served", nom: "Served", requis: true, aide: "What counts as served: where a dish reaches the table." },
  { cle: "recurring", nom: "Recurring", requis: false, aide: "The work that comes back on a rhythm." },
  { cle: "humans", nom: "Humans in the kitchen", requis: false, aide: "The people who take a part of the work." },
]);

const TITLE = "project sheet";
const WORDS = {
  aide: "What this project declares to the kitchen, kept in its repository (.brigade/fiche-projet.json). Each item is one line, or one entry per line for a list.",
  vide: NOT_STILL("project sheet"),
  sansFichier: "This project has no .brigade/fiche-projet.json: the kitchen writes it with its defaults.",
  illisible: NOT_REACHED("project sheet"),
  parLigne: "one per line",
  enregistrer: "Save",
  enCours: RECORDING,
  enregistre: "Saved.",
  nonEnregistre: "Project sheet not saved.",
  /** @param {string} name */
  requis: (name) => `${name} cannot be empty: nothing was saved.`,
};

/** @param {Fabrique} doc @param {string} balise @param {string} [text] */
function created(doc, balise, text) {
  const pose = doc.createElement(balise);
  if (text !== undefined) pose.textContent = text;
  return pose;
}

/** @param {unknown} error */
const message = (error) => (error instanceof Error ? error.message : String(error));
/** @param {unknown} value */
const isList = (value) => Array.isArray(value) && value.every((element) => typeof element === "string");

// La fiche lue : absente, illisible — avec pourquoi —, ou ses articles, chacun un texte ou une liste de textes.
/** @param {Files["lire"]} read @returns {Promise<Reading>} */
async function readTheCard(read) {
  /** @type {string | null} */
  let text;
  try {
    text = await read(CARD);
  } catch (error) {
    if (/** @type {any} */ (error)?.code === "ENOENT") return { lecture: "absente" };
    return { lecture: "illisible", detail: message(error) };
  }
  if (text === null || text === undefined) return { lecture: "absente" };
  /** @type {unknown} */
  let card;
  try {
    card = JSON.parse(text);
  } catch (error) {
    return { lecture: "illisible", detail: `${CARD} is not JSON: ${message(error)}` };
  }
  if (typeof card !== "object" || card === null || Array.isArray(card)) return { lecture: "illisible", detail: `${CARD} is not a JSON object` };
  const object = /** @type {Card} */ (card);
  const badlyDone = ARTICLES.find(({ cle: key }) => typeof object[key] !== "string" && !isList(object[key]));
  if (badlyDone !== undefined) return { lecture: "illisible", detail: `${badlyDone.nom} (${badlyDone.cle}) is not a text or a list of texts in ${CARD}` };
  return { lecture: "lue", fiche: object };
}

// Ce qu'un champ dit, rendu à la forme de l'article : une liste, une entrée par ligne non vide ; un texte, sans ses
// blancs autour.
/** @param {unknown} before @param {string} typed */
function valueInput(before, typed) {
  if (Array.isArray(before)) return typed.split("\n").map((line) => line.trim()).filter((line) => line !== "");
  return typed.trim();
}

// Les articles requis laissés vides, par leur nom.
/** @param {Card} card */
function articlesEmpty(card) {
  return ARTICLES.filter(({ cle: key, requis: required }) => required && /** @type {string | string[]} */ (card[key]).length === 0);
}

// Un article : son nom et son aide au survol, puis son champ — une ligne pour un texte, une zone pour une liste, « one
// per line » dessous.
/** @param {Fabrique} doc @param {(typeof ARTICLES)[number]} article @param {unknown} value */
function setOneArticle(doc, article, value) {
  const row = created(doc, "div");
  row.className = "article";
  const name = created(doc, "span", article.nom);
  name.className = "nom";
  name.append(hover(doc, article.aide));
  const list = Array.isArray(value);
  const field = created(doc, list ? "textarea" : "input");
  if (!list) field.type = "text";
  field.className = "champ";
  field.dataset.item = article.cle;
  field.ariaLabel = article.nom;
  field.value = list ? value.join("\n") : String(value);
  const input = created(doc, "span");
  input.className = "saisie";
  input.append(field);
  if (list) {
    field.rows = 3;
    const parLine = created(doc, "small", WORDS.parLigne);
    parLine.className = "par-ligne";
    input.append(parLine);
  }
  row.append(name, input);
  return { rangee: row, champ: field };
}

// L'écran de la fiche : la tête, puis les huit articles et « Save » — ou la ligne vide, ou la ligne d'erreur. Rendu une
// fois la fiche lue.
/** @param {Fabrique} doc @param {Files} fichiers */
export async function openCardProject(doc, { lire: read, ecrire: write }) {
  const root = created(doc, "section");
  root.className = "fiche-du-projet";
  root.ariaLabel = "The project sheet";
  const head = created(doc, "div");
  head.className = "tete";
  const title = created(doc, "span", TITLE);
  title.className = "nom";
  title.append(hover(doc, WORDS.aide));
  head.append(title);
  root.append(head);

  const readEntry = await readTheCard(read);
  if (readEntry.lecture === "absente") {
    root.append(lineEmpty(doc, WORDS.vide, { classe: "aucune", detail: WORDS.sansFichier }));
    return root;
  }
  if (readEntry.lecture === "illisible") {
    root.append(lineError(doc, WORDS.illisible, readEntry.detail));
    return root;
  }

  let card = readEntry.fiche;
  const fields = ARTICLES.map((article) => ({ article, ...setOneArticle(doc, article, card[article.cle]) }));
  const foot = created(doc, "div");
  foot.className = "pied";
  const said = created(doc, "div");
  said.className = "dit";
  said.ariaLive = "polite";
  const record = button(doc, WORDS.enregistrer, () => void save(), { sorte: "recommande" });
  record.dataset.geste = "enregistrer";
  foot.append(record, said);
  root.append(...fields.map(({ rangee: row }) => row), foot);

  async function save() {
    /** @type {Card} */
    const newEntry = { ...card };
    for (const { article, champ: field } of fields) newEntry[article.cle] = valueInput(card[article.cle], field.value);
    const empty = articlesEmpty(newEntry);
    for (const { article, champ: field } of fields) field.ariaInvalid = empty.includes(article) ? "true" : "";
    if (empty.length > 0) {
      said.replaceChildren(...empty.map(({ nom: name }) => lineError(doc, WORDS.requis(name), "", { classe: "refus", alerte: true })));
      return;
    }
    record.disabled = true;
    said.replaceChildren(created(doc, "span", WORDS.enCours));
    try {
      await write(CARD, `${JSON.stringify(newEntry, null, 2)}\n`);
    } catch (error) {
      said.replaceChildren(lineError(doc, WORDS.nonEnregistre, message(error), { classe: "refus", alerte: true }));
      return;
    } finally {
      record.disabled = false;
    }
    card = newEntry;
    for (const { article, champ: field } of fields) field.value = Array.isArray(card[article.cle]) ? /** @type {string[]} */ (card[article.cle]).join("\n") : String(card[article.cle]);
    const done = created(doc, "span", WORDS.enregistre);
    done.className = "enregistre";
    said.replaceChildren(done);
  }

  return root;
}
