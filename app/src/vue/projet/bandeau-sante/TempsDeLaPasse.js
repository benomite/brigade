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
// de quoi créer un élément (briques.js).

import { survol } from "../../briques.js";
import { PAS_ENCORE } from "../../lexique.js";
import { dureeEnClair } from "../../temps-ticket/temps-ticket.js";

/** @typedef {import("../../briques.js").Fabrique} Fabrique */
/** @typedef {{ cle: string, nom: string, livraisons: number, medianeS: number | null, p75S: number | null, totalS: number }} PartDeLaPasse */
/** @typedef {{ jours: number, livraisons: number, parts: PartDeLaPasse[], phaseLaPlusLourde: { nom: string, totalS: number } | null, partLaPlusLourde: { nom: string, partPct: number }, relancees: number | null, renvoyees: number, passesRenvoyeesS: number }} Passe */

const TITRE = "Pass time";
const AIDE =
  "Each delivery merged in the last 7 days, each of its passes counted, sent back or not: waiting for the pass (from the cook's delivery to the pass taking it), gates, review, CI and merge, as the station records them. The CI is split, from GitHub, into waiting for runners and running. How each stage is measured: docs/runtime/pass.md.";
const SANS_MESURE = `${PAS_ENCORE("measure")} No delivery merged in the last 7 days has its pass measured.`;

/** @param {unknown} x @returns {x is number} */
const nombre = (x) => typeof x === "number" && Number.isFinite(x) && x >= 0;
/** @param {unknown} x */
const nombreOuNul = (x) => x === null || nombre(x);

// Le temps de la pass publié sous `temps.passe`, ou null s'il est absent, illisible ou sans livraison mesurée : le bloc dit
// alors qu'il n'a pas de mesure.
/** @param {{ passe?: unknown } | undefined} temps @returns {Passe | null} */
function lireLaPasse(temps) {
  const p = /** @type {Record<string, any> | null | undefined} */ (temps?.passe);
  if (typeof p !== "object" || p === null || !nombre(p.jours) || !nombre(p.livraisons) || p.livraisons < 1 || !Array.isArray(p.parts)) return null;
  const lourde = p.partLaPlusLourde;
  if (typeof lourde?.nom !== "string" || !nombre(lourde.partPct)) return null;
  if (!nombreOuNul(p.relancees) || !nombre(p.renvoyees) || !nombre(p.passesRenvoyeesS)) return null;
  /** @type {PartDeLaPasse[]} */
  const parts = [];
  for (const part of p.parts) {
    if (typeof part?.cle !== "string" || typeof part.nom !== "string" || !nombre(part.livraisons) || !nombreOuNul(part.medianeS) || !nombreOuNul(part.p75S) || !nombre(part.totalS)) continue;
    parts.push({ cle: part.cle, nom: part.nom, livraisons: part.livraisons, medianeS: part.medianeS, p75S: part.p75S, totalS: part.totalS });
  }
  const phase = p.phaseLaPlusLourde;
  return {
    jours: p.jours,
    livraisons: p.livraisons,
    parts,
    phaseLaPlusLourde: typeof phase?.nom === "string" && nombre(phase.totalS) ? { nom: phase.nom, totalS: phase.totalS } : null,
    partLaPlusLourde: { nom: lourde.nom, partPct: lourde.partPct },
    relancees: p.relancees,
    renvoyees: p.renvoyees,
    passesRenvoyeesS: p.passesRenvoyeesS,
  };
}

/** @param {string} nom */
const capitale = (nom) => `${nom[0]?.toUpperCase() ?? ""}${nom.slice(1)}`;

// Ce que dit une part : sa médiane et son p75 ; « No measure yet. » sans livraison qui la mesure, jamais 0 à sa place ;
// « none » quand elle n'a duré sur aucune.
/** @param {PartDeLaPasse} part */
function valeurDeLaPart(part) {
  if (part.livraisons === 0 || part.medianeS === null || part.p75S === null) return PAS_ENCORE("measure");
  if (part.totalS === 0) return "none";
  return `median ${dureeEnClair(part.medianeS)} · p75 ${dureeEnClair(part.p75S)}`;
}

/** @param {Fabrique} doc @param {string} balise @param {string} classe @param {string} texte */
function noeud(doc, balise, classe, texte) {
  const pose = doc.createElement(balise);
  pose.className = classe;
  pose.textContent = texte;
  return pose;
}

// Le bloc : la part qui pèse le plus, en tête ; puis une rangée par phase et par part de la CI ; puis la phase la plus
// lourde en tout, les runs relancés et les renvois. Sans mesure, une ligne le dit.
/** @param {Fabrique} doc @param {{ passe?: unknown } | undefined} temps */
export function poserBlocTempsDeLaPasse(doc, temps) {
  const bloc = doc.createElement("section");
  bloc.className = "bloc-du-projet temps-de-la-passe";
  bloc.dataset.bloc = "temps-de-la-passe";
  bloc.ariaLabel = TITRE;
  const titre = doc.createElement("h3");
  titre.textContent = TITRE;
  titre.append(survol(doc, AIDE));
  bloc.append(titre);
  const p = lireLaPasse(temps);
  if (p === null) {
    bloc.append(noeud(doc, "p", "sans-mesure", SANS_MESURE));
    return bloc;
  }
  const tete = noeud(doc, "p", "plus-lourde", "");
  tete.append(noeud(doc, "strong", "", `${p.partLaPlusLourde.nom}: ${p.partLaPlusLourde.partPct}% of pass time`), noeud(doc, "span", "periode", ` · last ${p.jours} days, ${p.livraisons === 1 ? "one delivery" : `${p.livraisons} deliveries`}, each of their passes counted`));
  const liste = doc.createElement("ul");
  liste.className = "parts";
  for (const part of p.parts) {
    const rangee = doc.createElement("li");
    rangee.dataset.cle = part.cle;
    rangee.append(noeud(doc, "span", "nom", capitale(part.nom)), noeud(doc, "span", "valeur", valeurDeLaPart(part)));
    liste.append(rangee);
  }
  const notes = [
    p.phaseLaPlusLourde === null ? null : `Heaviest stage in total: ${p.phaseLaPlusLourde.nom}, ${dureeEnClair(p.phaseLaPlusLourde.totalS)}.`,
    p.relancees === null ? "CI runs restarted because the branch moved: no measure yet." : `CI runs restarted because the branch moved: ${p.relancees}.`,
    p.renvoyees === 0 ? "No delivery sent back." : `Sent back: ${p.renvoyees === 1 ? "one delivery" : `${p.renvoyees} deliveries`}, ${dureeEnClair(p.passesRenvoyeesS)} in the passes sent back.`,
  ].flatMap((phrase) => (phrase === null ? [] : [noeud(doc, "p", "note", phrase)]));
  bloc.append(tete, liste, ...notes);
  return bloc;
}
