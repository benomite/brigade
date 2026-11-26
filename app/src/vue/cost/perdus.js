// @ts-check
// Les tokens perdus de la page des coûts (ticket 1022), sous les trois chiffres de tête (tete.js) : ceux des essais
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
// Ce module ne touche pas `document` : il reçoit de quoi créer un élément (briques.js), et rend des éléments.

import { FERMER_LA_LISTE, OUVRIR_LA_LISTE, poserAlert, thresholdsDesProjects } from "./thresholds.js";
import { READ, NON_COMMUNIQUE, tokensLus } from "./tete.js";
import { button } from "../composants/button/button.js";
import { lineEmpty } from "../composants/line-empty/line-empty.js";

/** @typedef {import("../briques.js").Fabrique} Fabrique */
/** @typedef {import("./tete.js").Read} Read */
/** @typedef {import("./tete.js").ProjectDuCost} ProjectDuCost */
/** @typedef {"red attempt" | "interrupted"} Cause */
/** @typedef {{ ticket: number, run: string, tokens: number | null, cause: Cause }} CookPerdu */
/** @typedef {CookPerdu & { projet: ProjectDuCost }} Perdu */
/** @typedef {{ total: number | null | undefined, minimum: boolean, partiel: boolean, lignes: Perdu[] }} Perdus */

export const TITRE = "lost tokens";
export const RED = "red attempt";
export const INTERROMPU = "interrupted";
export const FERMER = "close";

// Les fins que `station` écrit pour un essai rouge ; toute autre fin que « fini » est une interruption.
const FINS_ROUGES = ["échoué", "refusé par le modèle", "failed", "refused by the model"];
const CHAMPS = / {2,}/;

// Les cooks perdus que `station` liste sous « derniers cooks » : `null` quand le bloc n'y est pas
// (la box ne communique rien), une liste — vide, s'il n'y en a aucun — quand il y est. Le bloc
// s'arrête à la première ligne qui n'est plus en retrait.
/** @param {string} texte @returns {CookPerdu[] | null} */
export function perdusDe(texte) {
  const lines = texte.split("\n");
  const debut = lines.findIndex((line) => /^(derniers|latest) cooks/.test(line));
  if (debut === -1) return null;
  /** @type {CookPerdu[]} */
  const perdus = [];
  for (const line of lines.slice(debut + 1)) {
    if (!/^\s/.test(line)) break;
    // date, #ticket, run, calibrage, fin, puis (tours · tokens · durée) et la PR, quand le cook les a.
    const [, ticket, run, , fin, consumed] = line.trim().split(CHAMPS);
    const numero = /^#(\d+)$/.exec(ticket ?? "");
    if (numero === null || fin === undefined || fin === "fini" || fin === "done") continue;
    const dit = consumed === undefined ? undefined : /^\d+ (?:tours?|turns?) · (.*) tokens? · /.exec(consumed)?.[1];
    perdus.push({
      ticket: Number(numero[1]),
      run: run ?? "",
      tokens: dit === undefined ? null : (tokensLus(`${dit} tokens`) ?? null),
      cause: FINS_ROUGES.includes(fin) ? RED : INTERROMPU,
    });
  }
  return perdus;
}

// Le total perdu de tous les projets : la somme des tokens de leurs cooks perdus. Une box qui ne
// communique pas ses cooks n'ajoute rien et rend la somme partielle (« ≥ ») ; si aucune ne les
// communique, le total est `null` — ou `undefined` tant qu'une box n'est pas lue. Un cook perdu qui
// ne déclare pas ses tokens rend la somme minimale.
/** @param {ProjectDuCost[]} projects @param {Map<string, Read>} lectures @returns {Perdus} */
export function perdus(projects, lectures) {
  /** @type {Perdu[]} */
  const lines = [];
  let communiques = 0;
  let nonLus = 0;
  for (const project of projects) {
    const read = lectures.get(project.nom);
    if (read === undefined) {
      nonLus++;
      continue;
    }
    const station = "sorties" in read ? read.sorties.find(({ commande: command }) => command === "station") : undefined;
    const lus = station === undefined ? null : perdusDe(station.texte);
    if (lus === null) continue;
    communiques++;
    lines.push(...lus.map((cook) => ({ ...cook, projet: project })));
  }
  const total = communiques > 0 ? lines.reduce((somme, { tokens }) => somme + (tokens ?? 0), 0) : nonLus > 0 ? undefined : null;
  return {
    total,
    minimum: lines.some(({ tokens }) => tokens === null),
    partiel: communiques > 0 && communiques < projects.length,
    lignes: lines.sort((a, b) => (b.tokens ?? -1) - (a.tokens ?? -1) || b.ticket - a.ticket),
  };
}

const nombre = (/** @type {number} */ valeur) => valeur.toLocaleString("en-US");

// Chaque classe est posée en clair, `className = "…"` : la peau ne vise que des classes que la vue
// pose, et son test les lit ainsi (peau.test.ts).
/** @param {Fabrique} doc @param {string} balise @param {string} [texte] */
function cree(doc, balise, texte) {
  const pose = doc.createElement(balise);
  if (texte !== undefined) pose.textContent = texte;
  return pose;
}

// Le bloc entier : son libellé, le chiffre — un bouton quand une liste est derrière — et, déployée,
// la liste. `ouvert` dit si elle l'est, `bascule` la déploie ou la replie ; `titres` dit le titre
// d'un ticket sur le rail de son projet, s'il y est. Avec `ouvrir`, chaque ligne est un bouton qui
// ouvre la fiche de son ticket.
/** @param {Fabrique} doc @param {ProjectDuCost[]} projects @param {Map<string, Read>} lectures
 *  @param {(project: string, ticket: number) => string | undefined} titres
 *  @param {boolean} ouvert @param {() => void} bascule
 *  @param {(project: string, ticket: number, button: any) => void} [ouvrir] */
export function poserPerdus(doc, projects, lectures, titres, ouvert, bascule, ouvrir) {
  const bloc = cree(doc, "div");
  bloc.className = "perdus-cout";
  const { total, minimum, partiel, lignes: lines } = perdus(projects, lectures);
  const dit = total === undefined ? READ : total === null ? NON_COMMUNIQUE : `${partiel || minimum ? "≥ " : ""}${nombre(total)}`;
  // Avec des lignes, le chiffre est un bouton de la famille, discret, qui déplie la liste : son chiffre est un `span` à lui.
  const sansChiffre = lines.length === 0 && typeof total !== "number";
  const chiffre = lines.length > 0 ? button(doc, "", undefined, { sorte: "discret" }) : sansChiffre ? lineEmpty(doc, dit, { classe: "perdus-total sans" }) : cree(doc, "p", dit);
  if (lines.length > 0) {
    const nombreDit = cree(doc, "span", dit);
    nombreDit.className = "chiffre-perdu";
    chiffre.append(nombreDit);
  }
  if (!sansChiffre) chiffre.className = "perdus-total";
  // Au-dessus du seuil de son projet (thresholds.js), le chiffre est mis en évidence et une ligne dit le geste.
  const thresholds = thresholdsDesProjects(projects, lectures);
  const sommes = new Map(projects.map(({ nom: name }) => [name, 0]));
  for (const { projet: project, tokens } of lines) sommes.set(project.nom, (sommes.get(project.nom) ?? 0) + (tokens ?? 0));
  const connus = projects.filter(({ nom: name }) => thresholds.get(name)?.perdus != null);
  const depassant = connus.find(({ nom: name }) => (sommes.get(name) ?? 0) > /** @type {number} */ (thresholds.get(name)?.perdus));
  const depasse = depassant === undefined ? undefined : { projet: depassant.nom, seuil: /** @type {number} */ (thresholds.get(depassant.nom)?.perdus) };
  if (depasse !== undefined) chiffre.className = "perdus-total depasse";
  bloc.append(cree(doc, "h2", TITRE), chiffre);
  const alert = typeof total === "number" ? poserAlert(doc, depasse, connus.length > 0, ouvert ? FERMER_LA_LISTE : OUVRIR_LA_LISTE, bascule) : null;
  if (alert !== null) bloc.append(alert);
  if (lines.length === 0) return bloc;
  chiffre.ariaExpanded = String(ouvert);
  chiffre.addEventListener("click", bascule);
  if (!ouvert) return bloc;
  const liste = cree(doc, "ol");
  liste.className = "perdus";
  for (const { projet: project, ticket, tokens, cause } of lines) {
    const teinte = cree(doc, "span");
    teinte.className = "teinte";
    if (project.teinte !== undefined) teinte.style.setProperty("--teinte", project.teinte);
    const numero = cree(doc, "span", `#${ticket}`);
    numero.className = "numero mono";
    const titre = titres(project.nom, ticket);
    const nomme = titre !== undefined && titre !== "";
    const intitule = cree(doc, "span", nomme ? titre : NON_COMMUNIQUE);
    intitule.className = nomme ? "titre" : "titre sans";
    const cost = cree(doc, "span", tokens === null ? NON_COMMUNIQUE : nombre(tokens));
    cost.className = tokens === null ? "tokens sans" : "tokens";
    const pourquoi = cree(doc, "span", cause);
    pourquoi.className = "cause";
    const line = cree(doc, "li");
    if (ouvrir === undefined) line.append(teinte, numero, intitule, cost, pourquoi);
    else {
      const action = cree(doc, "button");
      action.className = "ticket-perdu";
      action.title = `open the sheet of #${ticket} · ${project.nom}`;
      action.append(teinte, numero, intitule, cost, pourquoi);
      action.addEventListener("click", () => ouvrir(project.nom, ticket, action));
      line.className = "ouvrable";
      line.append(action);
    }
    liste.append(line);
  }
  const fermer = button(doc, FERMER, bascule, { sorte: "discret" });
  fermer.className = "perdus-fermer";
  bloc.append(liste, fermer);
  return bloc;
}
