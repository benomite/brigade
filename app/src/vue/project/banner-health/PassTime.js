// @ts-check
// Le temps de la pass (ticket 3512), dans la section de Settings du projet, à côté de ses chiffres d'autonomie : sur les 7
// derniers jours, la part qui pèse le plus sur le temps de pass, en une ligne — « CI waiting for runners: 62% of pass
// time » —, puis chaque phase — attente de la pass, gates, revue, CI, merge — et chaque part de la CI — attente des
// runners, course — avec sa médiane et son p75 par livraison, la phase la plus lourde en tout, les runs relancés parce que
// la branche a bougé, et ce que les renvois ont coûté. Le Cooks tab que le ticket nomme a été retiré (ticket 2921), et la
// ligne de chiffres du rail où se lisait le temps d'un ticket aussi (ticket 3523) : les chiffres de la cuisine sont ici.
//
// La vue n'y calcule rien : le résumé est celui que la station publie sous `temps.passe` (runtime/src/temps-ticket/passe.ts),
// lu tel quel. Une mesure qui manque se dit « No measure yet. », jamais zéro. Ce module ne touche pas `document` : il reçoit
// de quoi créer un élément (bricks.js).

import { hover } from "../../bricks.js";
import { NOT_STILL } from "../../lexicon.js";
import { durationEnClear } from "../../time-ticket/time-ticket.js";

/** @typedef {import("../../bricks.js").Fabrique} Fabrique */
/** @typedef {{ cle: string, nom: string, livraisons: number, medianeS: number | null, p75S: number | null, totalS: number }} PartOfThePass */
/** @typedef {{ jours: number, livraisons: number, parts: PartOfThePass[], phaseLaPlusLourde: { nom: string, totalS: number } | null, partLaPlusLourde: { nom: string, partPct: number }, relancees: number | null, renvoyees: number, passesRenvoyeesS: number }} Pass */

const TITLE = "Pass time";
const HELP =
  "Each delivery merged in the last 7 days, each of its passes counted, sent back or not: waiting for the pass (from the cook's delivery to the pass taking it), gates, review, CI and merge, as the station records them. The CI is split, from GitHub, into waiting for runners and running. How each stage is measured: docs/runtime/pass.md.";
const WITHOUT_MEASURE = `${NOT_STILL("measure")} No delivery merged in the last 7 days has its pass measured.`;

/** @param {unknown} x @returns {x is number} */
const count = (x) => typeof x === "number" && Number.isFinite(x) && x >= 0;
/** @param {unknown} x */
const numberOrNone = (x) => x === null || count(x);

// Le temps de la pass publié sous `temps.passe`, ou null s'il est absent, illisible ou sans livraison mesurée : le bloc dit
// alors qu'il n'a pas de mesure.
/** @param {{ passe?: unknown } | undefined} time @returns {Pass | null} */
function readThePass(time) {
  const p = /** @type {Record<string, any> | null | undefined} */ (time?.passe);
  if (typeof p !== "object" || p === null || !count(p.jours) || !count(p.livraisons) || p.livraisons < 1 || !Array.isArray(p.parts)) return null;
  const heavy = p.partLaPlusLourde;
  if (typeof heavy?.nom !== "string" || !count(heavy.partPct)) return null;
  if (!numberOrNone(p.relancees) || !count(p.renvoyees) || !count(p.passesRenvoyeesS)) return null;
  /** @type {PartOfThePass[]} */
  const parts = [];
  for (const part of p.parts) {
    if (typeof part?.cle !== "string" || typeof part.nom !== "string" || !count(part.livraisons) || !numberOrNone(part.medianeS) || !numberOrNone(part.p75S) || !count(part.totalS)) continue;
    parts.push({ cle: part.cle, nom: part.nom, livraisons: part.livraisons, medianeS: part.medianeS, p75S: part.p75S, totalS: part.totalS });
  }
  const phase = p.phaseLaPlusLourde;
  return {
    jours: p.jours,
    livraisons: p.livraisons,
    parts,
    phaseLaPlusLourde: typeof phase?.nom === "string" && count(phase.totalS) ? { nom: phase.nom, totalS: phase.totalS } : null,
    partLaPlusLourde: { nom: heavy.nom, partPct: heavy.partPct },
    relancees: p.relancees,
    renvoyees: p.renvoyees,
    passesRenvoyeesS: p.passesRenvoyeesS,
  };
}

/** @param {string} name */
const capital = (name) => `${name[0]?.toUpperCase() ?? ""}${name.slice(1)}`;

// Ce que dit une part : sa médiane et son p75 ; « No measure yet. » sans livraison qui la mesure, jamais 0 à sa place ;
// « none » quand elle n'a duré sur aucune.
/** @param {PartOfThePass} part */
function valueOfThePart(part) {
  if (part.livraisons === 0 || part.medianeS === null || part.p75S === null) return NOT_STILL("measure");
  if (part.totalS === 0) return "none";
  return `median ${durationEnClear(part.medianeS)} · p75 ${durationEnClear(part.p75S)}`;
}

/** @param {Fabrique} doc @param {string} balise @param {string} classe @param {string} text */
function node(doc, balise, classe, text) {
  const pose = doc.createElement(balise);
  pose.className = classe;
  pose.textContent = text;
  return pose;
}

// Le bloc : la part qui pèse le plus, en tête ; puis une rangée par phase et par part de la CI ; puis la phase la plus
// lourde en tout, les runs relancés et les renvois. Sans mesure, une ligne le dit.
/** @param {Fabrique} doc @param {{ passe?: unknown } | undefined} time */
export function setBlockTimeOfThePass(doc, time) {
  const block = doc.createElement("section");
  block.className = "bloc-du-projet temps-de-la-passe";
  block.dataset.bloc = "temps-de-la-passe";
  block.ariaLabel = TITLE;
  const title = doc.createElement("h3");
  title.textContent = TITLE;
  title.append(hover(doc, HELP));
  block.append(title);
  const p = readThePass(time);
  if (p === null) {
    block.append(node(doc, "p", "sans-mesure", WITHOUT_MEASURE));
    return block;
  }
  const head = node(doc, "p", "plus-lourde", "");
  head.append(node(doc, "strong", "", `${p.partLaPlusLourde.nom}: ${p.partLaPlusLourde.partPct}% of pass time`), node(doc, "span", "periode", ` · last ${p.jours} days, ${p.livraisons === 1 ? "one delivery" : `${p.livraisons} deliveries`}, each of their passes counted`));
  const list = doc.createElement("ul");
  list.className = "parts";
  for (const part of p.parts) {
    const row = doc.createElement("li");
    row.dataset.cle = part.cle;
    row.append(node(doc, "span", "nom", capital(part.nom)), node(doc, "span", "valeur", valueOfThePart(part)));
    list.append(row);
  }
  const notes = [
    p.phaseLaPlusLourde === null ? null : `Heaviest stage in total: ${p.phaseLaPlusLourde.nom}, ${durationEnClear(p.phaseLaPlusLourde.totalS)}.`,
    p.relancees === null ? "CI runs restarted because the branch moved: no measure yet." : `CI runs restarted because the branch moved: ${p.relancees}.`,
    p.renvoyees === 0 ? "No delivery sent back." : `Sent back: ${p.renvoyees === 1 ? "one delivery" : `${p.renvoyees} deliveries`}, ${durationEnClear(p.passesRenvoyeesS)} in the passes sent back.`,
  ].flatMap((sentence) => (sentence === null ? [] : [node(doc, "p", "note", sentence)]));
  block.append(head, list, ...notes);
  return block;
}
