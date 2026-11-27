// @ts-check
// Les tokens perdus de la page des coûts (ticket 1022), sous les trois chiffres de tête (head.js) : ceux des essais
// rouges et des cooks interrompus, en un seul chiffre, sans phrase d'explication. Un clic sur le
// chiffre déploie la liste derrière — un cook par ligne : son ticket, son titre, ses tokens, sa
// cause — ; un second clic, ou le bouton de fermeture, la replie. Les cooks viennent du bloc
// « derniers cooks » de `station`, lu sur la box de chaque projet : « … #30  r-91c0  sonnet / medium  échoué  31 tours · 412 806 tokens · 9,2 min ».
// Un cook perdu est un cook fini dont la fin n'est pas « fini » : « échoué » et « refusé par le modèle »
// sont des essais rouges, toute autre fin (garde-fou, « stop », quota, connexion, runtime arrêté)
// est un cook interrompu. Ses tokens sont ceux qu'il a déclarés ; un cook qui n'en déclare pas rend le
// total « ≥ ». Une box qui ne liste pas ses cooks ne communique rien : le chiffre dit « not communicated »,
// la liste n'est pas proposée, et rien n'est inventé.
// Sur la page d'un projet, à côté de sa fiabilité (ticket 1022), le même bloc ne parle que de lui : la vue ne
// lui passe que ce projet et sa propre lecture de `station`.
// Ce module ne touche pas `document` : il reçoit de quoi créer un élément (bricks.js), et rend des éléments.

import { CLOSE_THE_LIST, OPEN_THE_LIST, setAlert, thresholdsOfProjects } from "./thresholds.js";
import { READING, NOT_COMMUNICATED, tokensRead } from "./head.js";
import { button } from "../components/button/button.js";
import { lineEmpty } from "../components/line-empty/line-empty.js";

/** @typedef {import("../bricks.js").Fabrique} Fabrique */
/** @typedef {import("./head.js").Reading} Reading */
/** @typedef {import("./head.js").ProjectOfCost} ProjectOfCost */
/** @typedef {"red attempt" | "interrupted"} Cause */
/** @typedef {{ ticket: number, run: string, tokens: number | null, cause: Cause }} CookLost */
/** @typedef {CookLost & { projet: ProjectOfCost }} Lost */
/** @typedef {{ total: number | null | undefined, minimum: boolean, partiel: boolean, lignes: Lost[] }} LostOnes */

export const TITLE = "lost tokens";
export const RED = "red attempt";
export const INTERRUPTED = "interrupted";
export const CLOSE = "close";

// Les fins que `station` écrit pour un essai rouge ; toute autre fin que « fini » est une interruption.
const ENDS_RED = ["échoué", "refusé par le modèle", "failed", "refused by the model"];
const FIELDS = / {2,}/;

// Les cooks perdus que `station` liste sous « derniers cooks » : `null` quand le bloc n'y est pas
// (la box ne communique rien), une liste — vide, s'il n'y en a aucun — quand il y est. Le bloc
// s'arrête à la première ligne qui n'est plus en retrait.
/** @param {string} text @returns {CookLost[] | null} */
export function lostOf(text) {
  const lines = text.split("\n");
  const start = lines.findIndex((line) => /^(derniers|latest) cooks/.test(line));
  if (start === -1) return null;
  /** @type {CookLost[]} */
  const lost = [];
  for (const line of lines.slice(start + 1)) {
    if (!/^\s/.test(line)) break;
    // date, #ticket, run, calibrage, fin, puis (tours · tokens · durée) et la PR, quand le cook les a.
    const [, ticket, run, , end, consumed] = line.trim().split(FIELDS);
    const number = /^#(\d+)$/.exec(ticket ?? "");
    if (number === null || end === undefined || end === "fini" || end === "done") continue;
    const said = consumed === undefined ? undefined : /^\d+ (?:tours?|turns?) · (.*) tokens? · /.exec(consumed)?.[1];
    lost.push({
      ticket: Number(number[1]),
      run: run ?? "",
      tokens: said === undefined ? null : (tokensRead(`${said} tokens`) ?? null),
      cause: ENDS_RED.includes(end) ? RED : INTERRUPTED,
    });
  }
  return lost;
}

// Le total perdu de tous les projets : la somme des tokens de leurs cooks perdus. Une box qui ne
// communique pas ses cooks n'ajoute rien et rend la somme partielle (« ≥ ») ; si aucune ne les
// communique, le total est `null` — ou `undefined` tant qu'une box n'est pas lue. Un cook perdu qui
// ne déclare pas ses tokens rend la somme minimale.
/** @param {ProjectOfCost[]} projects @param {Map<string, Reading>} readings @returns {LostOnes} */
export function lost(projects, readings) {
  /** @type {Lost[]} */
  const lines = [];
  let communicated = 0;
  let notRead = 0;
  for (const project of projects) {
    const reading = readings.get(project.nom);
    if (reading === undefined) {
      notRead++;
      continue;
    }
    const station = "sorties" in reading ? reading.sorties.find(({ commande: command }) => command === "station") : undefined;
    const readOnes = station === undefined ? null : lostOf(station.texte);
    if (readOnes === null) continue;
    communicated++;
    lines.push(...readOnes.map((cook) => ({ ...cook, projet: project })));
  }
  const total = communicated > 0 ? lines.reduce((sum, { tokens }) => sum + (tokens ?? 0), 0) : notRead > 0 ? undefined : null;
  return {
    total,
    minimum: lines.some(({ tokens }) => tokens === null),
    partiel: communicated > 0 && communicated < projects.length,
    lignes: lines.sort((a, b) => (b.tokens ?? -1) - (a.tokens ?? -1) || b.ticket - a.ticket),
  };
}

const count = (/** @type {number} */ value) => value.toLocaleString("en-US");

// Chaque classe est posée en clair, `className = "…"` : la peau ne vise que des classes que la vue
// pose, et son test les lit ainsi (skin.test.ts).
/** @param {Fabrique} doc @param {string} balise @param {string} [text] */
function created(doc, balise, text) {
  const pose = doc.createElement(balise);
  if (text !== undefined) pose.textContent = text;
  return pose;
}

// Le bloc entier : son libellé, le chiffre — un bouton quand une liste est derrière — et, déployée,
// la liste. `ouvert` dit si elle l'est, `bascule` la déploie ou la replie ; `titres` dit le titre
// d'un ticket sur le rail de son projet, s'il y est. Avec `ouvrir`, chaque ligne est un bouton qui
// ouvre la fiche de son ticket.
/** @param {Fabrique} doc @param {ProjectOfCost[]} projects @param {Map<string, Reading>} readings
 *  @param {(project: string, ticket: number) => string | undefined} titles
 *  @param {boolean} opened @param {() => void} toggle
 *  @param {(project: string, ticket: number, button: any) => void} [open] */
export function setLost(doc, projects, readings, titles, opened, toggle, open) {
  const block = created(doc, "div");
  block.className = "perdus-cout";
  const { total, minimum, partiel: partial, lignes: lines } = lost(projects, readings);
  const said = total === undefined ? READING : total === null ? NOT_COMMUNICATED : `${partial || minimum ? "≥ " : ""}${count(total)}`;
  // Avec des lignes, le chiffre est un bouton de la famille, discret, qui déplie la liste : son chiffre est un `span` à lui.
  const withoutFigure = lines.length === 0 && typeof total !== "number";
  const figure = lines.length > 0 ? button(doc, "", undefined, { sorte: "discret" }) : withoutFigure ? lineEmpty(doc, said, { classe: "perdus-total sans" }) : created(doc, "p", said);
  if (lines.length > 0) {
    const numberSays = created(doc, "span", said);
    numberSays.className = "chiffre-perdu";
    figure.append(numberSays);
  }
  if (!withoutFigure) figure.className = "perdus-total";
  // Au-dessus du seuil de son projet (thresholds.js), le chiffre est mis en évidence et une ligne dit le geste.
  const thresholds = thresholdsOfProjects(projects, readings);
  const sums = new Map(projects.map(({ nom: name }) => [name, 0]));
  for (const { projet: project, tokens } of lines) sums.set(project.nom, (sums.get(project.nom) ?? 0) + (tokens ?? 0));
  const knownOnes = projects.filter(({ nom: name }) => thresholds.get(name)?.perdus != null);
  const exceeding = knownOnes.find(({ nom: name }) => (sums.get(name) ?? 0) > /** @type {number} */ (thresholds.get(name)?.perdus));
  const exceeds = exceeding === undefined ? undefined : { projet: exceeding.nom, seuil: /** @type {number} */ (thresholds.get(exceeding.nom)?.perdus) };
  if (exceeds !== undefined) figure.className = "perdus-total depasse";
  block.append(created(doc, "h2", TITLE), figure);
  const alert = typeof total === "number" ? setAlert(doc, exceeds, knownOnes.length > 0, opened ? CLOSE_THE_LIST : OPEN_THE_LIST, toggle) : null;
  if (alert !== null) block.append(alert);
  if (lines.length === 0) return block;
  figure.ariaExpanded = String(opened);
  figure.addEventListener("click", toggle);
  if (!opened) return block;
  const list = created(doc, "ol");
  list.className = "perdus";
  for (const { projet: project, ticket, tokens, cause } of lines) {
    const tint = created(doc, "span");
    tint.className = "teinte";
    if (project.teinte !== undefined) tint.style.setProperty("--teinte", project.teinte);
    const number = created(doc, "span", `#${ticket}`);
    number.className = "numero mono";
    const title = titles(project.nom, ticket);
    const named = title !== undefined && title !== "";
    const titled = created(doc, "span", named ? title : NOT_COMMUNICATED);
    titled.className = named ? "titre" : "titre sans";
    const cost = created(doc, "span", tokens === null ? NOT_COMMUNICATED : count(tokens));
    cost.className = tokens === null ? "tokens sans" : "tokens";
    const why = created(doc, "span", cause);
    why.className = "cause";
    const line = created(doc, "li");
    if (open === undefined) line.append(tint, number, titled, cost, why);
    else {
      const action = created(doc, "button");
      action.className = "ticket-perdu";
      action.title = `open the sheet of #${ticket} · ${project.nom}`;
      action.append(tint, number, titled, cost, why);
      action.addEventListener("click", () => open(project.nom, ticket, action));
      line.className = "ouvrable";
      line.append(action);
    }
    list.append(line);
  }
  const close = button(doc, CLOSE, toggle, { sorte: "discret" });
  close.className = "perdus-fermer";
  block.append(list, close);
  return block;
}
