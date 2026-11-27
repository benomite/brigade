// @ts-check
// La tête de la page des coûts de l'app (ticket 1022) : trois chiffres — les tokens que brigade a lancés sur 5 h, 24 h et
// 7 jours, tous projets confondus —, et sous chacun la part de chaque projet. Rien n'y est
// expliqué : un chiffre, un libellé court, et une ligne qui renvoie le quota du compte Max à
// `/usage`, que brigade ne connaît pas. Chaque chiffre vient du bloc `consommé` de `station`, lu sur
// la box de chaque projet (runtime/src/montrer-station.ts) ; une fenêtre que la box ne donne pas
// — aujourd'hui, 7 jours — s'affiche « not communicated » à la place du chiffre, comme partout dans l'app.
// Ce module ne touche pas `document` : il reçoit de quoi créer un élément (bricks.js), et rend
// des éléments. Les autres blocs de la page viennent à côté de lui, dans ce dossier (curve.js).

/** @typedef {import("../bricks.js").Fabrique} Fabrique */
/** @typedef {{ sorties: { commande: string, texte: string }[] } | { erreur: string }} Reading */
/** @typedef {{ nom: string, teinte?: string }} ProjectOfCost */
// `undefined` : la box n'a pas encore été lue ; `null` : elle a été lue, et ne l'a pas communiqué.
/** @typedef {number | null | undefined} Tokens */
/** @typedef {{ projet: ProjectOfCost, tokens: Tokens, part: number | undefined }} Part */
/** @typedef {{ dit: string, total: Tokens, partiel: boolean, parts: Part[] }} Figure */

import { button } from "../components/button/button.js";
import { lineEmpty } from "../components/line-empty/line-empty.js";
import { READING } from "../lexicon.js";

export const NOT_COMMUNICATED = "not communicated";
export { READING };
export const QUOTA = "Max account quota";
export const USAGE = "/usage";

// Les trois fenêtres, en heures, et ce que l'écran en dit.
export const WINDOWS = [
  { heures: 5, dit: "5 h" },
  { heures: 24, dit: "24 h" },
  { heures: 7 * 24, dit: "7 d" },
];

// Ce que la box écrit de chaque fenêtre, sous `consommé` : « 5 h : 6 lancements · … · 1 284 530 tokens »,
// « 24 h : rien ». Une fenêtre en jours (« 7 j : … ») se compte en heures. Le reste du bloc — « en
// cours », la note sur `/usage` — n'est pas une fenêtre.
// L'anglais l'écrit « 5 h: nothing », « 2 d: … » : `station` parle les deux langues, selon la version de la box.
const WINDOW = /^(\d+) (h|j|d) ?: (.*)$/;
const TOKENS = /(\d[\d\s  .,]*?)\s*tokens?\s*$/;

// Les lignes du bloc `consommé` de `station`, sans leur titre ni leur retrait. Le bloc commence à
// la ligne qui porte ce titre, et se poursuit sur les lignes en retrait. La courbe (curve.js) y
// lit ses jours.
/** @param {string} text @returns {string[]} */
export function consumedLines(text) {
  const lines = text.split("\n");
  const start = lines.findIndex((line) => /^(consommé|consumed)(\s|$)/.test(line));
  if (start === -1) return [];
  /** @type {string[]} */
  const readEntries = [];
  for (let i = start; i < lines.length; i++) {
    const line = /** @type {string} */ (lines[i]);
    if (i > start && !/^\s/.test(line)) break;
    readEntries.push((i === start ? line.replace(/^(consommé|consumed)/, "") : line).trim());
  }
  return readEntries;
}

// Les tokens d'une consommation telle que la box l'écrit : « rien » vaut zéro ; sans « tokens », rien n'est lu.
/** @param {string} said @returns {number | undefined} */
export function tokensRead(said) {
  if (said === "rien" || said === "nothing") return 0;
  const tokens = TOKENS.exec(said);
  return tokens === null ? undefined : Number(/** @type {string} */ (tokens[1]).replace(/\D/g, ""));
}

// Les tokens de chaque fenêtre que `station` communique, par nombre d'heures.
/** @param {string} text @returns {Map<number, number>} */
export function windowsOf(text) {
  /** @type {Map<number, number>} */
  const readEntries = new Map();
  for (const value of consumedLines(text)) {
    const window = WINDOW.exec(value);
    if (window === null) continue;
    const hours = Number(window[1]) * (window[2] === "h" ? 1 : 24);
    const tokens = tokensRead(/** @type {string} */ (window[3]).trim());
    if (tokens !== undefined) readEntries.set(hours, tokens);
  }
  return readEntries;
}

// Les tokens d'une fenêtre pour un projet : non lus, non communiqués, ou le nombre que `station` a rendu.
/** @param {Reading | undefined} reading @param {number} hours @returns {Tokens} */
function tokensOf(reading, hours) {
  if (reading === undefined) return undefined;
  if (!("sorties" in reading)) return null;
  const station = reading.sorties.find(({ commande: command }) => command === "station");
  return station === undefined ? null : (windowsOf(station.texte).get(hours) ?? null);
}

// Les trois chiffres : chaque fenêtre, la somme des projets, et la part de chacun. Une somme à
// laquelle un projet manque est partielle — elle est au moins ce qu'elle dit — et ne donne pas de
// part : un pourcentage d'un total inconnu ne dit rien.
/** @param {ProjectOfCost[]} projects @param {Map<string, Reading>} readings @returns {Figure[]} */
export function figures(projects, readings) {
  return WINDOWS.map(({ heures: hours, dit: said }) => {
    const readOnes = projects.map((project) => ({ projet: project, tokens: tokensOf(readings.get(project.nom), hours) }));
    const knownOnes = readOnes.flatMap(({ tokens }) => (typeof tokens === "number" ? [tokens] : []));
    const sum = knownOnes.reduce((total, tokens) => total + tokens, 0);
    const partial = knownOnes.length > 0 && knownOnes.length < readOnes.length;
    /** @type {Tokens} */
    const total = knownOnes.length > 0 ? sum : readOnes.some(({ tokens }) => tokens === undefined) ? undefined : null;
    const parts = readOnes.map(({ projet: project, tokens }) => ({ projet: project, tokens, part: !partial && typeof tokens === "number" && sum > 0 ? Math.round((tokens / sum) * 100) : undefined }));
    return { dit: said, total, partiel: partial, parts };
  });
}

const count = (/** @type {number} */ value) => value.toLocaleString("en-US");
/** @param {Tokens} tokens */
const tokensSaid = (tokens) => (tokens === undefined ? READING : tokens === null ? NOT_COMMUNICATED : count(tokens));

// Chaque classe est posée en clair, `className = "…"` : la peau ne vise que des classes que la vue
// pose, et son test les lit ainsi (skin.test.ts).
/** @param {Fabrique} doc @param {string} balise @param {string} [text] */
function created(doc, balise, text) {
  const pose = doc.createElement(balise);
  if (text !== undefined) pose.textContent = text;
  return pose;
}

// Un nombre de tokens, ou ce qui en tient lieu — moins appuyé.
/** @param {Fabrique} doc @param {Tokens} tokens */
function tokensPoses(doc, tokens) {
  if (typeof tokens !== "number") return lineEmpty(doc, tokensSaid(tokens), { classe: "tokens sans", balise: "span" });
  const pose = created(doc, "span", tokensSaid(tokens));
  pose.className = "tokens";
  return pose;
}

// Un chiffre de tête : sa fenêtre, la somme — « ≥ » si un projet y manque —, puis une ligne par
// projet : sa pastille, son nom, ses tokens, sa part. Avec `ouvrir`, le nom est un bouton qui ouvre le projet.
/** @param {Fabrique} doc @param {Figure} chiffre @param {((project: string) => void) | undefined} open */
function setFigure(doc, { dit: said, total, partiel: partial, parts }, open) {
  const block = created(doc, "div");
  block.className = "chiffre";
  const valueSaid = `${partial ? "≥ " : ""}${tokensSaid(total)}`;
  const value = typeof total === "number" ? created(doc, "p", valueSaid) : lineEmpty(doc, valueSaid, { classe: "total sans" });
  if (typeof total === "number") value.className = "total";
  const list = created(doc, "ul");
  list.className = "parts";
  for (const { projet: project, tokens, part } of parts) {
    const tint = created(doc, "span");
    tint.className = "teinte";
    if (project.teinte !== undefined) tint.style.setProperty("--teinte", project.teinte);
    const name = open === undefined ? created(doc, "span", project.nom) : button(doc, project.nom, () => open(project.nom), { sorte: "discret" });
    name.className = "projet";
    if (open !== undefined) name.title = `open ${project.nom}`;
    const percentage = created(doc, "span", part === undefined ? "" : `${part} %`);
    percentage.className = "part";
    const line = created(doc, "li");
    line.append(tint, name, tokensPoses(doc, tokens), percentage);
    list.append(line);
  }
  block.append(created(doc, "h3", said), value, list);
  return block;
}

// La tête entière : son libellé, les trois chiffres côte à côte, et la ligne du quota. `ouvrir`, s'il
// est donné, ouvre le projet dont le nom est cliqué.
/** @param {Fabrique} doc @param {ProjectOfCost[]} projects @param {Map<string, Reading>} readings @param {(project: string) => void} [open] */
export function setHead(doc, projects, readings, open) {
  const head = created(doc, "div");
  head.className = "tete-cout";
  const row = created(doc, "div");
  row.className = "chiffres";
  row.append(...figures(projects, readings).map((figure) => setFigure(doc, figure, open)));
  const usage = created(doc, "span", USAGE);
  usage.className = "mono";
  const quota = created(doc, "p", `${QUOTA}: `);
  quota.className = "quota";
  quota.append(usage);
  head.append(created(doc, "h2", "tokens · all projects"), row, quota);
  return head;
}
