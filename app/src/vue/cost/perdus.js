// @ts-check
// Les tokens perdus de l'onglet Cost, sous les trois chiffres de tête (tete.js) : ceux des essais
// rouges et des cooks interrompus, en un seul chiffre, sans phrase d'explication. Un clic sur le
// chiffre déploie la liste derrière — un cook par ligne : son ticket, son titre, ses tokens, sa
// cause — ; un second clic, ou le bouton de fermeture, la replie. Les cooks viennent du bloc
// « derniers cooks » de `station`, lu sur la box de chaque projet : « … #30  r-91c0  sonnet / medium  échoué  31 tours · 412 806 tokens · 9,2 min ».
// Un cook perdu est un cook fini dont la fin n'est pas « fini » : « échoué » et « refusé par le modèle »
// sont des essais rouges, toute autre fin (garde-fou, « stop », quota, connexion, runtime arrêté)
// est un cook interrompu. Ses tokens sont ceux qu'il a déclarés ; un cook qui n'en déclare pas rend le
// total « ≥ ». Une box qui ne liste pas ses cooks ne communique rien : le chiffre dit « not communicated »,
// la liste n'est pas proposée, et rien n'est inventé.
// Ce module ne touche pas `document` : il reçoit de quoi créer un élément (briques.js), et rend des éléments.

import { LECTURE, NON_COMMUNIQUE, tokensLus } from "./tete.js";

/** @typedef {import("../briques.js").Fabrique} Fabrique */
/** @typedef {import("./tete.js").Lecture} Lecture */
/** @typedef {import("./tete.js").ProjetDuCout} ProjetDuCout */
/** @typedef {"red attempt" | "interrupted"} Cause */
/** @typedef {{ ticket: number, run: string, tokens: number | null, cause: Cause }} CookPerdu */
/** @typedef {CookPerdu & { projet: ProjetDuCout }} Perdu */
/** @typedef {{ total: number | null | undefined, minimum: boolean, partiel: boolean, lignes: Perdu[] }} Perdus */

export const TITRE = "lost tokens";
export const ROUGE = "red attempt";
export const INTERROMPU = "interrupted";
export const FERMER = "close";

// Les fins que `station` écrit pour un essai rouge ; toute autre fin que « fini » est une interruption.
const FINS_ROUGES = ["échoué", "refusé par le modèle"];
const CHAMPS = / {2,}/;

// Les cooks perdus que `station` liste sous « derniers cooks » : `null` quand le bloc n'y est pas
// (la box ne communique rien), une liste — vide, s'il n'y en a aucun — quand il y est. Le bloc
// s'arrête à la première ligne qui n'est plus en retrait.
/** @param {string} texte @returns {CookPerdu[] | null} */
export function perdusDe(texte) {
  const lignes = texte.split("\n");
  const debut = lignes.findIndex((ligne) => ligne.startsWith("derniers cooks"));
  if (debut === -1) return null;
  /** @type {CookPerdu[]} */
  const perdus = [];
  for (const ligne of lignes.slice(debut + 1)) {
    if (!/^\s/.test(ligne)) break;
    // date, #ticket, run, calibrage, fin, puis (tours · tokens · durée) et la PR, quand le cook les a.
    const [, ticket, run, , fin, consomme] = ligne.trim().split(CHAMPS);
    const numero = /^#(\d+)$/.exec(ticket ?? "");
    if (numero === null || fin === undefined || fin === "fini") continue;
    const dit = consomme === undefined ? undefined : /^\d+ tours? · (.*) tokens? · /.exec(consomme)?.[1];
    perdus.push({
      ticket: Number(numero[1]),
      run: run ?? "",
      tokens: dit === undefined ? null : (tokensLus(`${dit} tokens`) ?? null),
      cause: FINS_ROUGES.includes(fin) ? ROUGE : INTERROMPU,
    });
  }
  return perdus;
}

// Le total perdu de tous les projets : la somme des tokens de leurs cooks perdus. Une box qui ne
// communique pas ses cooks n'ajoute rien et rend la somme partielle (« ≥ ») ; si aucune ne les
// communique, le total est `null` — ou `undefined` tant qu'une box n'est pas lue. Un cook perdu qui
// ne déclare pas ses tokens rend la somme minimale.
/** @param {ProjetDuCout[]} projets @param {Map<string, Lecture>} lectures @returns {Perdus} */
export function perdus(projets, lectures) {
  /** @type {Perdu[]} */
  const lignes = [];
  let communiques = 0;
  let nonLus = 0;
  for (const projet of projets) {
    const lecture = lectures.get(projet.nom);
    if (lecture === undefined) {
      nonLus++;
      continue;
    }
    const station = "sorties" in lecture ? lecture.sorties.find(({ commande }) => commande === "station") : undefined;
    const lus = station === undefined ? null : perdusDe(station.texte);
    if (lus === null) continue;
    communiques++;
    lignes.push(...lus.map((cook) => ({ ...cook, projet })));
  }
  const total = communiques > 0 ? lignes.reduce((somme, { tokens }) => somme + (tokens ?? 0), 0) : nonLus > 0 ? undefined : null;
  return {
    total,
    minimum: lignes.some(({ tokens }) => tokens === null),
    partiel: communiques > 0 && communiques < projets.length,
    lignes: lignes.sort((a, b) => (b.tokens ?? -1) - (a.tokens ?? -1) || b.ticket - a.ticket),
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
// d'un ticket sur le rail de son projet, s'il y est.
/** @param {Fabrique} doc @param {ProjetDuCout[]} projets @param {Map<string, Lecture>} lectures
 *  @param {(projet: string, ticket: number) => string | undefined} titres
 *  @param {boolean} ouvert @param {() => void} bascule */
export function poserPerdus(doc, projets, lectures, titres, ouvert, bascule) {
  const bloc = cree(doc, "div");
  bloc.className = "perdus-cout";
  const { total, minimum, partiel, lignes } = perdus(projets, lectures);
  const dit = total === undefined ? LECTURE : total === null ? NON_COMMUNIQUE : `${partiel || minimum ? "≥ " : ""}${nombre(total)}`;
  const chiffre = lignes.length > 0 ? cree(doc, "button", dit) : cree(doc, "p", dit);
  chiffre.className = "perdus-total";
  if (typeof total !== "number") chiffre.className = "perdus-total sans";
  bloc.append(cree(doc, "h2", TITRE), chiffre);
  if (lignes.length === 0) return bloc;
  chiffre.ariaExpanded = String(ouvert);
  chiffre.addEventListener("click", bascule);
  if (!ouvert) return bloc;
  const liste = cree(doc, "ol");
  liste.className = "perdus";
  for (const { projet, ticket, tokens, cause } of lignes) {
    const teinte = cree(doc, "span");
    teinte.className = "teinte";
    if (projet.teinte !== undefined) teinte.style.setProperty("--teinte", projet.teinte);
    const numero = cree(doc, "span", `#${ticket}`);
    numero.className = "numero mono";
    const titre = titres(projet.nom, ticket);
    const nomme = titre !== undefined && titre !== "";
    const intitule = cree(doc, "span", nomme ? titre : NON_COMMUNIQUE);
    intitule.className = nomme ? "titre" : "titre sans";
    const cout = cree(doc, "span", tokens === null ? NON_COMMUNIQUE : nombre(tokens));
    cout.className = tokens === null ? "tokens sans" : "tokens";
    const pourquoi = cree(doc, "span", cause);
    pourquoi.className = "cause";
    const ligne = cree(doc, "li");
    ligne.append(teinte, numero, intitule, cout, pourquoi);
    liste.append(ligne);
  }
  const fermer = cree(doc, "button", FERMER);
  fermer.className = "perdus-fermer";
  fermer.addEventListener("click", bascule);
  bloc.append(liste, fermer);
  return bloc;
}
