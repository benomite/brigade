// @ts-check
// Les cinq tickets les plus chers de la page des coûts (ticket 1022), sous les trois chiffres de tête (head.js) : pour
// chacun son numéro, son titre, ce qu'il a coûté en tokens et en essais, et un clic qui ouvre sa fiche
// (le ticket 621). Les coûts viennent du bloc « derniers cooks » de `station`, lu sur la box de chaque projet :
// une ligne par cook fini, « … #30  r-91c0  sonnet / medium  fini  31 tours · 412 806 tokens · 9,2 min ».
// Un ticket coûte la somme de ses cooks lus, en autant d'essais ; la box n'en montre que les derniers,
// la somme est donc ce qu'elle en dit — un cook qui ne déclare pas ses tokens la rend « ≥ », et un
// ticket dont aucun cook n'en déclare s'affiche « not communicated ». Son titre est celui du rail,
// quand le rail du projet est lu ; sinon « not communicated » aussi.
// Sur la page d'un projet, à côté de sa fiabilité (ticket 1022), le même bloc ne parle que de lui : la vue ne
// lui passe que ce projet et sa propre lecture de `station`.
// Ce module ne touche pas `document` : il reçoit de quoi créer un élément (bricks.js), et rend des éléments.

import { setAlert, thresholdsOfProjects } from "./thresholds.js";
import { READING, NOT_COMMUNICATED, tokensRead } from "./head.js";
import { setPrice } from "../delivery-engine/display.js";
import { lineEmpty } from "../components/line-empty/line-empty.js";
import { startOfWeek, UNAVAILABLE, partSaid, weightedOne, quotaRead } from "./part.js";

/** @typedef {import("../bricks.js").Fabrique} Fabrique */
/** @typedef {import("./head.js").Reading} Reading */
/** @typedef {import("./head.js").ProjectOfCost} ProjectOfCost */
/** @typedef {import("./part.js").Quota} Quota */
/** @typedef {{ projet: ProjectOfCost, ticket: number, tokens: number | null, minimum: boolean, essais: number, ponderes: number | null }} Cher */
/** @typedef {{ ticket: number, tokens: number | null, modele: string | null, fin: number | null }} Cook */

export const TITLE = "most expensive tickets";
// Au plus ce nombre de tickets.
export const HOW_MANY = 5;

const COOK = /#(\d+)\s(.*)$/;
const TOKENS = /(\d[\d\s  .,]*?)\s*tokens?(?:\s|$)/;
const NUMBER = /^\d+$/;
const DATE = /^\s*(\d{4}-\d\d-\d\dT\S+)/;
// « r-91c0  sonnet / medium  fini » : le modèle précède « / effort ».
const MODEL = /^\s*\S+\s+(\S+)\s+\/\s/;

// Les cooks que `station` liste sous « derniers cooks » : leur ticket, leurs tokens — nuls si le cook n'en
// déclare pas —, leur modèle (« sonnet / medium » : `sonnet`) et leur fin (ms, nulle si la ligne n'en dit pas une
// lisible). Le bloc s'arrête à la première ligne qui n'est plus en retrait.
/** @param {string} text @returns {Cook[]} */
export function cooksDetailed(text) {
  const lines = text.split("\n");
  const start = lines.findIndex((line) => /^(derniers|latest) cooks/.test(line));
  if (start === -1) return [];
  /** @type {Cook[]} */
  const readOnes = [];
  for (const line of lines.slice(start + 1)) {
    if (!/^\s/.test(line)) break;
    const cook = COOK.exec(line);
    if (cook === null || !NUMBER.test(/** @type {string} */ (cook[1])) ) continue;
    const remains = /** @type {string} */ (cook[2]);
    const said = TOKENS.exec(remains);
    const when = Date.parse(DATE.exec(line)?.[1] ?? "");
    readOnes.push({
      ticket: Number(cook[1]),
      tokens: said === null ? null : (tokensRead(`${said[1]} tokens`) ?? null),
      modele: MODEL.exec(remains)?.[1] ?? null,
      fin: Number.isNaN(when) ? null : when,
    });
  }
  return readOnes;
}

/** @param {string} text @returns {{ ticket: number, tokens: number | null }[]} */
export function cooksOf(text) {
  return cooksDetailed(text).map(({ ticket, tokens }) => ({ ticket, tokens }));
}

// Les tickets les plus chers de tous les projets : du plus cher au moins cher, ceux dont la box ne
// dit aucun coût après les autres, à égalité le numéro le plus récent d'abord. Au plus `COMBIEN`.
/** @param {ProjectOfCost[]} projects @param {Map<string, Reading>} readings @param {Quota} [quota] @returns {Cher[]} */
export function moreExpensive(projects, readings, quota = quotaRead(undefined)) {
  /** @type {Cher[]} */
  const all = [];
  for (const project of projects) {
    const reading = readings.get(project.nom);
    if (reading === undefined || !("sorties" in reading)) continue;
    const station = reading.sorties.find(({ commande: command }) => command === "station");
    if (station === undefined) continue;
    /** @type {Map<number, Cher>} */
    const parTicket = new Map();
    for (const { ticket, tokens, modele: model } of cooksDetailed(station.texte)) {
      const before = parTicket.get(ticket) ?? { projet: project, ticket, tokens: null, minimum: false, essais: 0, ponderes: null };
      parTicket.set(ticket, {
        ...before,
        tokens: tokens === null ? before.tokens : (before.tokens ?? 0) + tokens,
        ponderes: tokens === null ? before.ponderes : (before.ponderes ?? 0) + weightedOne(quota, model, tokens),
        minimum: before.minimum || tokens === null,
        essais: before.essais + 1,
      });
    }
    all.push(...parTicket.values());
  }
  return all.sort((a, b) => (b.tokens ?? -1) - (a.tokens ?? -1) || b.ticket - a.ticket).slice(0, HOW_MANY);
}

// Le coût de la semaine en cours, tous projets : les tokens pondérés des cooks finis depuis le début de la semaine
// du réglage, jusqu'à `maintenant`. Les cooks sont ceux que la box liste (dix par projet) : la somme est ce qu'elle
// en dit, et `minimum` dit qu'un cook de la semaine n'a ni tokens ni date lisibles.
/** @param {ProjectOfCost[]} projects @param {Map<string, Reading>} readings @param {Quota} quota @param {Date} now @returns {{ ponderes: number, minimum: boolean }} */
export function costOfTheWeek(projects, readings, quota, now) {
  const start = startOfWeek(quota, now);
  let weighted = 0;
  let minimum = false;
  for (const project of projects) {
    const reading = readings.get(project.nom);
    if (reading === undefined || !("sorties" in reading)) continue;
    const station = reading.sorties.find(({ commande: command }) => command === "station");
    if (station === undefined) continue;
    for (const { tokens, modele: model, fin: end } of cooksDetailed(station.texte)) {
      if (end === null) minimum = true;
      else if (end < start || end > now.getTime()) continue;
      else if (tokens === null) minimum = true;
      else weighted += weightedOne(quota, model, tokens);
    }
  }
  return { ponderes: weighted, minimum };
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

// Le bloc entier : son libellé, et une ligne par ticket — un bouton qui ouvre la fiche. `titres` dit le
// titre d'un ticket sur le rail de son projet, s'il y est ; `ouvrir` ouvre sa fiche.
// `quotaBrut` : le réglage `quotaMax` du fichier (part.js) ; `maintenant`, l'heure de la page. La ligne de la semaine, ou
// à sa place la seule ligne « No share », vient sous la liste.
/** @param {Fabrique} doc @param {ProjectOfCost[]} projects @param {Map<string, Reading>} readings
 *  @param {(project: string, ticket: number) => string | undefined} titles
 *  @param {(project: string, ticket: number, button: any) => void} open
 *  @param {unknown} [quotaRaw] @param {Date} [now]
 *  @param {(project: string, ticket: number) => import("../delivery-engine/display.js").EngineOfDelivery | undefined} [engines] le moteur d'une livraison, et son prix s'il en a un */
export function setExpensive(doc, projects, readings, titles, open, quotaRaw, now = new Date(), engines = () => undefined) {
  const quota = quotaRead(quotaRaw);
  const block = created(doc, "div");
  block.className = "chers-cout";
  const list = created(doc, "ol");
  // Avec un quota lisible, chaque ligne a une colonne de plus : sa part.
  list.className = "chers";
  const expensive = moreExpensive(projects, readings, quota);
  const price = new Map(expensive.map(({ projet: project, ticket }) => [`${project.nom}#${ticket}`, setPrice(doc, engines(project.nom, ticket))]));
  const withPrice = [...price.values()].some(({ textContent }) => textContent !== "");
  list.className = "chers";
  if (partSaid(quota, 0) !== null) list.className = "chers avec-part";
  if (withPrice) list.className = "chers avec-prix";
  if (withPrice && partSaid(quota, 0) !== null) list.className = "chers avec-part avec-prix";
  // La semaine se dit même sans ticket cher à lister ; sans quota, la ligne unique remplace toute part.
  const week = costOfTheWeek(projects, readings, quota, now);
  const partOfTheWeek = partSaid(quota, week.ponderes);
  const lineOfTheWeek = created(doc, "p", partOfTheWeek === null ? UNAVAILABLE : `this week, all projects: ${week.minimum ? "≥ " : ""}${partOfTheWeek} of the weekly quota`);
  if (partOfTheWeek === null) lineOfTheWeek.className = "part-indisponible";
  else lineOfTheWeek.className = "part-semaine";
  if (expensive.length === 0) {
    const empty = lineEmpty(doc, projects.some(({ nom: name }) => !readings.has(name)) ? READING : NOT_COMMUNICATED, { classe: "sans" });
    // Tant qu'un projet n'est pas lu, la semaine n'est pas dite : « 0.0% » dirait ce qu'on n'a pas lu.
    if (partOfTheWeek === null || !projects.some(({ nom: name }) => !readings.has(name))) block.append(created(doc, "h2", TITLE), empty, lineOfTheWeek);
    else block.append(created(doc, "h2", TITLE), empty);
    return block;
  }
  // Le ticket le plus cher, mis en évidence au-dessus du seuil de son projet (thresholds.js).
  const [first] = expensive;
  const threshold = thresholdsOfProjects(projects, readings).get(first?.projet.nom ?? "")?.ticket ?? null;
  const exceeds = first !== undefined && first.tokens !== null && threshold !== null && first.tokens > threshold ? { projet: first.projet.nom, seuil: threshold } : undefined;
  for (const { projet: project, ticket, tokens, minimum, essais: trials, ponderes: weighted } of expensive) {
    const tint = created(doc, "span");
    tint.className = "teinte";
    if (project.teinte !== undefined) tint.style.setProperty("--teinte", project.teinte);
    const number = created(doc, "span", `#${ticket}`);
    number.className = "numero mono";
    const title = titles(project.nom, ticket);
    const withoutTitle = title === undefined || title === "";
    const said = withoutTitle ? lineEmpty(doc, NOT_COMMUNICATED, { classe: "titre sans", balise: "span" }) : created(doc, "span", title);
    if (!withoutTitle) said.className = "titre";
    const cost = tokens === null ? lineEmpty(doc, NOT_COMMUNICATED, { classe: "tokens sans", balise: "span" }) : created(doc, "span", `${minimum ? "≥ " : ""}${count(tokens)}`);
    if (tokens !== null) cost.className = "tokens";
    const saidOne = weighted === null ? null : partSaid(quota, weighted);
    const part = saidOne === null ? undefined : created(doc, "span", `${minimum ? "≥ " : ""}${saidOne}`);
    if (part !== undefined) part.className = "part";
    const trial = created(doc, "span", `${trials} ${trials === 1 ? "attempt" : "attempts"}`);
    trial.className = "essais";
    const line = created(doc, "button");
    line.className = "ticket-cher";
    if (exceeds !== undefined && ticket === first?.ticket && project === first.projet) line.className = "ticket-cher depasse";
    line.title = `open the sheet of #${ticket} · ${project.nom}`;
    line.append(tint, number, said, cost, ...(part === undefined ? [] : [part]), ...(withPrice ? [/** @type {any} */ (price.get(`${project.nom}#${ticket}`))] : []), trial);
    line.addEventListener("click", () => open(project.nom, ticket, line));
    const item = created(doc, "li");
    item.append(line);
    list.append(item);
  }
  block.append(created(doc, "h2", TITLE), list, lineOfTheWeek);
  const alert = exceeds === undefined || first === undefined
    ? setAlert(doc, exceeds, threshold !== null, "", () => {})
    : setAlert(doc, exceeds, true, `open the sheet of #${first.ticket}`, (button) => open(first.projet.nom, first.ticket, button));
  if (alert !== null) block.append(alert);
  return block;
}
