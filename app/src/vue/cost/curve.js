// @ts-check
// La courbe de la page des coûts de l'app (ticket 1022), sous les trois chiffres de tête (head.js) : les tokens que brigade a
// lancés chaque jour, sur les derniers jours, une série par projet. Un titre court, une légende qui
// nomme chaque projet, et rien d'autre : la valeur d'un jour se lit au survol de sa colonne.
// Chaque série vient du bloc `consommé` de `station`, lu sur la box du projet : une ligne par jour,
// « 2026-10-16 : 19 lancements · … · 4 912 044 tokens », ou « 2026-10-16 : rien ». Une box qui
// n'écrit pas ces lignes — aujourd'hui, aucune : le runtime ne compte que 5 h et 24 h — ne
// communique pas sa série, et la courbe ne se dessine pas vide : sa zone dit « not communicated ».
// Ce module ne touche pas `document` : il reçoit de quoi créer un élément, HTML ou SVG, et rend des éléments.

import { READING, consumedLines, NOT_COMMUNICATED, tokensRead } from "./head.js";
import { lineEmpty } from "../components/line-empty/line-empty.js";

/** @typedef {import("./head.js").Reading} Reading */
/** @typedef {import("./head.js").ProjectOfCost} ProjectOfCost */
/** @typedef {{ createElement(balise: string): any, createElementNS(namespace: string, balise: string): any }} Fabrique */
// `points` : un nombre par jour de `jours`, `null` pour un jour que la série ne dit pas. La série
// entière est `undefined` quand la box n'a pas encore été lue, `null` quand elle ne l'a pas communiquée.
/** @typedef {{ projet: ProjectOfCost, points: (number | null)[] | null | undefined }} Serie */
/** @typedef {{ jours: string[], series: Serie[] }} Curve */

export const TITLE = "tokens per day";
// Les derniers jours que la courbe montre, au plus.
export const DAYS = 14;

const SVG = "http://www.w3.org/2000/svg";
// Le tracé se dessine dans ce repère, puis s'étire à la largeur de la page : ses traits gardent
// leur épaisseur (`vector-effect`), et ses textes sont posés hors du SVG, pour ne pas s'étirer.
const WIDTH = 1000;
const HEIGHT = 100;

const DAY = /^(\d{4}-\d{2}-\d{2}) ?: (.*)$/;

// Les tokens de chaque jour que `station` communique, par date (AAAA-MM-JJ).
/** @param {string} text @returns {Map<string, number>} */
export function daysOf(text) {
  /** @type {Map<string, number>} */
  const readOnes = new Map();
  for (const value of consumedLines(text)) {
    const day = DAY.exec(value);
    if (day === null) continue;
    const tokens = tokensRead(/** @type {string} */ (day[2]).trim());
    if (tokens !== undefined) readOnes.set(/** @type {string} */ (day[1]), tokens);
  }
  return readOnes;
}

// Les jours d'un projet : non lus, non communiqués, ou ce que `station` a rendu.
/** @param {Reading | undefined} reading @returns {Map<string, number> | null | undefined} */
function daysOfProject(reading) {
  if (reading === undefined) return undefined;
  if (!("sorties" in reading)) return null;
  const station = reading.sorties.find(({ commande: command }) => command === "station");
  const days = station === undefined ? new Map() : daysOf(station.texte);
  return days.size === 0 ? null : days;
}

// Les séries par projet, alignées sur les mêmes jours : les derniers que l'une des boxes dit, au
// plus `JOURS`, du plus ancien au plus récent. Un jour qu'une série ne dit pas y reste un trou,
// jamais un zéro : « rien » est un zéro, que la box écrit.
/** @param {ProjectOfCost[]} projects @param {Map<string, Reading>} readings @returns {Curve} */
export function series(projects, readings) {
  const readOnes = projects.map((project) => ({ projet: project, jours: daysOfProject(readings.get(project.nom)) }));
  const days = [...new Set(readOnes.flatMap(({ jours: days }) => (days ? [...days.keys()] : [])))].sort().slice(-DAYS);
  return {
    jours: days,
    series: readOnes.map(({ projet: project, jours: saidOnes }) => ({ projet: project, points: saidOnes ? days.map((day) => saidOnes.get(day) ?? null) : saidOnes })),
  };
}

const count = (/** @type {number} */ value) => value.toLocaleString("en-US");
const brief = (/** @type {number} */ value) => value.toLocaleString("en-US", { notation: "compact", maximumFractionDigits: 1 });
// « Oct 16 » : le jour tel que la box l'a daté, sans fuseau.
const daySays = (/** @type {string} */ day) => new Date(`${day}T00:00:00Z`).toLocaleDateString("en-US", { month: "short", day: "numeric", timeZone: "UTC" });

// Chaque classe est posée en clair, `className = "…"` : la peau ne vise que des classes que la vue
// pose, et son test les lit ainsi (skin.test.ts). Les éléments du SVG n'en portent pas : la peau
// les vise par leur balise.
/** @param {Fabrique} doc @param {string} balise @param {string} [text] */
function created(doc, balise, text) {
  const pose = doc.createElement(balise);
  if (text !== undefined) pose.textContent = text;
  return pose;
}
/** @param {Fabrique} doc @param {string} balise @param {Record<string, string>} attributs */
function trace(doc, balise, attributs) {
  const pose = doc.createElementNS(SVG, balise);
  for (const [name, value] of Object.entries(attributs)) pose.setAttribute(name, value);
  return pose;
}

const abscissa = (/** @type {number} */ i, /** @type {number} */ n) => (n === 1 ? WIDTH / 2 : (i / (n - 1)) * WIDTH);
const ordinate = (/** @type {number} */ value, /** @type {number} */ top) => HEIGHT - (value / top) * HEIGHT;

// Le tracé : la ligne du haut et celle du zéro, puis chaque série — ses tronçons, d'un trou à
// l'autre, et un point par jour dit —, enfin une colonne par jour, qui dit au survol ce que chaque
// projet a lancé ce jour-là.
/** @param {Fabrique} doc @param {Curve} courbe @param {number} top */
function setTrace(doc, { jours: days, series: readEntries }, top) {
  const svg = trace(doc, "svg", { viewBox: `0 0 ${WIDTH} ${HEIGHT}`, preserveAspectRatio: "none", "aria-hidden": "true" });
  for (const y of [0, HEIGHT]) svg.append(trace(doc, "line", { x1: "0", x2: String(WIDTH), y1: String(y), y2: String(y), "vector-effect": "non-scaling-stroke" }));
  for (const { projet: project, points } of readEntries) {
    if (!points) continue;
    /** @type {string[][]} */
    const segments = [[]];
    /** @type {string[]} */
    const saidOnes = [];
    points.forEach((value, i) => {
      if (value === null) return void segments.push([]);
      const point = `${abscissa(i, points.length)} ${ordinate(value, top)}`;
      /** @type {string[]} */ (segments.at(-1)).push(point);
      saidOnes.push(`M${point}h0`);
    });
    const line = trace(doc, "path", { d: segments.filter((troncon) => troncon.length > 1).map((troncon) => `M${troncon.join("L")}`).join(""), "vector-effect": "non-scaling-stroke" });
    const marks = trace(doc, "path", { d: saidOnes.join(""), "vector-effect": "non-scaling-stroke", "data-points": "" });
    for (const pose of [line, marks]) if (project.teinte !== undefined) pose.style.setProperty("--teinte", project.teinte);
    svg.append(line, marks);
  }
  const not = WIDTH / days.length;
  days.forEach((day, i) => {
    const column = trace(doc, "rect", { x: String(Math.max(0, abscissa(i, days.length) - not / 2)), y: "0", width: String(not), height: String(HEIGHT) });
    const saidOfDay = readEntries.flatMap(({ projet: project, points }) => (points ? [`${project.nom} ${points[i] === null ? NOT_COMMUNICATED : count(/** @type {number} */ (points[i]))}`] : []));
    const hover = doc.createElementNS(SVG, "title");
    hover.textContent = `${daySays(day)} — ${saidOfDay.join(" · ")}`;
    column.append(hover);
    svg.append(column);
  });
  return svg;
}

// La légende : la pastille et le nom de chaque projet, et pour celui dont la série manque, ce qu'il en est.
/** @param {Fabrique} doc @param {Serie[]} readEntries */
function setLegend(doc, readEntries) {
  const legend = created(doc, "ul");
  legend.className = "legende";
  for (const { projet: project, points } of readEntries) {
    const tint = created(doc, "span");
    tint.className = "teinte";
    if (project.teinte !== undefined) tint.style.setProperty("--teinte", project.teinte);
    const name = created(doc, "span", project.nom);
    name.className = "projet";
    const line = created(doc, "li");
    line.append(tint, name);
    if (!points) {
      const lack = lineEmpty(doc, points === undefined ? READING : NOT_COMMUNICATED, { classe: "sans", balise: "span" });
      line.append(lack);
    }
    legend.append(line);
  }
  return legend;
}

// La courbe entière : son titre, puis le tracé et sa légende — ou, tant qu'aucune box ne donne sa
// série, ce qu'il en est à la place du tracé.
/** @param {Fabrique} doc @param {ProjectOfCost[]} projects @param {Map<string, Reading>} readings */
export function setCurve(doc, projects, readings) {
  const curve = series(projects, readings);
  const block = created(doc, "div");
  block.className = "courbe-cout";
  block.append(created(doc, "h2", TITLE));
  const drawn = curve.series.filter(({ points }) => points);
  if (drawn.length === 0) {
    const lack = lineEmpty(doc, curve.series.some(({ points }) => points === undefined) ? READING : NOT_COMMUNICATED, { classe: "sans" });
    block.append(lack);
    return block;
  }
  const top = Math.max(1, ...drawn.flatMap(({ points }) => (points ?? []).flatMap((value) => (value === null ? [] : [value]))));
  const frame = created(doc, "div");
  frame.className = "trace";
  const moreTop = created(doc, "span", brief(top));
  moreTop.className = "haut";
  frame.append(moreTop, setTrace(doc, curve, top));
  // Chaque jour sous son point : sa place est celle du point, en pourcentage de la largeur.
  const days = created(doc, "div");
  days.className = "jours";
  curve.jours.forEach((day, i) => {
    const said = created(doc, "span", daySays(day));
    said.style.setProperty("left", `${(abscissa(i, curve.jours.length) / WIDTH) * 100}%`);
    days.append(said);
  });
  block.append(frame, days, setLegend(doc, curve.series));
  return block;
}
