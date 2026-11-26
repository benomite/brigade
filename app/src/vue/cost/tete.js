// @ts-check
// La tête de la page des coûts de l'app (ticket 1022) : trois chiffres — les tokens que brigade a lancés sur 5 h, 24 h et
// 7 jours, tous projets confondus —, et sous chacun la part de chaque projet. Rien n'y est
// expliqué : un chiffre, un libellé court, et une ligne qui renvoie le quota du compte Max à
// `/usage`, que brigade ne connaît pas. Chaque chiffre vient du bloc `consommé` de `station`, lu sur
// la box de chaque projet (runtime/src/montrer-station.ts) ; une fenêtre que la box ne donne pas
// — aujourd'hui, 7 jours — s'affiche « not communicated » à la place du chiffre, comme partout dans l'app.
// Ce module ne touche pas `document` : il reçoit de quoi créer un élément (briques.js), et rend
// des éléments. Les autres blocs de la page viennent à côté de lui, dans ce dossier (courbe.js).

/** @typedef {import("../briques.js").Fabrique} Fabrique */
/** @typedef {{ sorties: { commande: string, texte: string }[] } | { erreur: string }} Read */
/** @typedef {{ nom: string, teinte?: string }} ProjectDuCost */
// `undefined` : la box n'a pas encore été lue ; `null` : elle a été lue, et ne l'a pas communiqué.
/** @typedef {number | null | undefined} Tokens */
/** @typedef {{ projet: ProjectDuCost, tokens: Tokens, part: number | undefined }} Part */
/** @typedef {{ dit: string, total: Tokens, partiel: boolean, parts: Part[] }} Chiffre */

import { button } from "../composants/button/button.js";
import { lineEmpty } from "../composants/line-empty/line-empty.js";
import { READ } from "../lexique.js";

export const NON_COMMUNIQUE = "not communicated";
export { READ };
export const QUOTA = "Max account quota";
export const USAGE = "/usage";

// Les trois fenêtres, en heures, et ce que l'écran en dit.
export const FENETRES = [
  { heures: 5, dit: "5 h" },
  { heures: 24, dit: "24 h" },
  { heures: 7 * 24, dit: "7 d" },
];

// Ce que la box écrit de chaque fenêtre, sous `consommé` : « 5 h : 6 lancements · … · 1 284 530 tokens »,
// « 24 h : rien ». Une fenêtre en jours (« 7 j : … ») se compte en heures. Le reste du bloc — « en
// cours », la note sur `/usage` — n'est pas une fenêtre.
// L'anglais l'écrit « 5 h: nothing », « 2 d: … » : `station` parle les deux langues, selon la version de la box.
const FENETRE = /^(\d+) (h|j|d) ?: (.*)$/;
const TOKENS = /(\d[\d\s  .,]*?)\s*tokens?\s*$/;

// Les lignes du bloc `consommé` de `station`, sans leur titre ni leur retrait. Le bloc commence à
// la ligne qui porte ce titre, et se poursuit sur les lignes en retrait. La courbe (courbe.js) y
// lit ses jours.
/** @param {string} texte @returns {string[]} */
export function consumedLines(texte) {
  const lines = texte.split("\n");
  const debut = lines.findIndex((line) => /^(consommé|consumed)(\s|$)/.test(line));
  if (debut === -1) return [];
  /** @type {string[]} */
  const lues = [];
  for (let i = debut; i < lines.length; i++) {
    const line = /** @type {string} */ (lines[i]);
    if (i > debut && !/^\s/.test(line)) break;
    lues.push((i === debut ? line.replace(/^(consommé|consumed)/, "") : line).trim());
  }
  return lues;
}

// Les tokens d'une consommation telle que la box l'écrit : « rien » vaut zéro ; sans « tokens », rien n'est lu.
/** @param {string} dit @returns {number | undefined} */
export function tokensLus(dit) {
  if (dit === "rien" || dit === "nothing") return 0;
  const tokens = TOKENS.exec(dit);
  return tokens === null ? undefined : Number(/** @type {string} */ (tokens[1]).replace(/\D/g, ""));
}

// Les tokens de chaque fenêtre que `station` communique, par nombre d'heures.
/** @param {string} texte @returns {Map<number, number>} */
export function fenetresDe(texte) {
  /** @type {Map<number, number>} */
  const lues = new Map();
  for (const valeur of consumedLines(texte)) {
    const fenetre = FENETRE.exec(valeur);
    if (fenetre === null) continue;
    const heures = Number(fenetre[1]) * (fenetre[2] === "h" ? 1 : 24);
    const tokens = tokensLus(/** @type {string} */ (fenetre[3]).trim());
    if (tokens !== undefined) lues.set(heures, tokens);
  }
  return lues;
}

// Les tokens d'une fenêtre pour un projet : non lus, non communiqués, ou le nombre que `station` a rendu.
/** @param {Read | undefined} read @param {number} heures @returns {Tokens} */
function tokensDe(read, heures) {
  if (read === undefined) return undefined;
  if (!("sorties" in read)) return null;
  const station = read.sorties.find(({ commande: command }) => command === "station");
  return station === undefined ? null : (fenetresDe(station.texte).get(heures) ?? null);
}

// Les trois chiffres : chaque fenêtre, la somme des projets, et la part de chacun. Une somme à
// laquelle un projet manque est partielle — elle est au moins ce qu'elle dit — et ne donne pas de
// part : un pourcentage d'un total inconnu ne dit rien.
/** @param {ProjectDuCost[]} projects @param {Map<string, Read>} lectures @returns {Chiffre[]} */
export function figures(projects, lectures) {
  return FENETRES.map(({ heures, dit }) => {
    const lus = projects.map((project) => ({ projet: project, tokens: tokensDe(lectures.get(project.nom), heures) }));
    const connus = lus.flatMap(({ tokens }) => (typeof tokens === "number" ? [tokens] : []));
    const somme = connus.reduce((total, tokens) => total + tokens, 0);
    const partiel = connus.length > 0 && connus.length < lus.length;
    /** @type {Tokens} */
    const total = connus.length > 0 ? somme : lus.some(({ tokens }) => tokens === undefined) ? undefined : null;
    const parts = lus.map(({ projet: project, tokens }) => ({ projet: project, tokens, part: !partiel && typeof tokens === "number" && somme > 0 ? Math.round((tokens / somme) * 100) : undefined }));
    return { dit, total, partiel, parts };
  });
}

const nombre = (/** @type {number} */ valeur) => valeur.toLocaleString("en-US");
/** @param {Tokens} tokens */
const tokensDits = (tokens) => (tokens === undefined ? READ : tokens === null ? NON_COMMUNIQUE : nombre(tokens));

// Chaque classe est posée en clair, `className = "…"` : la peau ne vise que des classes que la vue
// pose, et son test les lit ainsi (peau.test.ts).
/** @param {Fabrique} doc @param {string} balise @param {string} [texte] */
function cree(doc, balise, texte) {
  const pose = doc.createElement(balise);
  if (texte !== undefined) pose.textContent = texte;
  return pose;
}

// Un nombre de tokens, ou ce qui en tient lieu — moins appuyé.
/** @param {Fabrique} doc @param {Tokens} tokens */
function tokensPoses(doc, tokens) {
  if (typeof tokens !== "number") return lineEmpty(doc, tokensDits(tokens), { classe: "tokens sans", balise: "span" });
  const pose = cree(doc, "span", tokensDits(tokens));
  pose.className = "tokens";
  return pose;
}

// Un chiffre de tête : sa fenêtre, la somme — « ≥ » si un projet y manque —, puis une ligne par
// projet : sa pastille, son nom, ses tokens, sa part. Avec `ouvrir`, le nom est un bouton qui ouvre le projet.
/** @param {Fabrique} doc @param {Chiffre} chiffre @param {((project: string) => void) | undefined} ouvrir */
function poserChiffre(doc, { dit, total, partiel, parts }, ouvrir) {
  const bloc = cree(doc, "div");
  bloc.className = "chiffre";
  const valeurDite = `${partiel ? "≥ " : ""}${tokensDits(total)}`;
  const valeur = typeof total === "number" ? cree(doc, "p", valeurDite) : lineEmpty(doc, valeurDite, { classe: "total sans" });
  if (typeof total === "number") valeur.className = "total";
  const liste = cree(doc, "ul");
  liste.className = "parts";
  for (const { projet: project, tokens, part } of parts) {
    const teinte = cree(doc, "span");
    teinte.className = "teinte";
    if (project.teinte !== undefined) teinte.style.setProperty("--teinte", project.teinte);
    const name = ouvrir === undefined ? cree(doc, "span", project.nom) : button(doc, project.nom, () => ouvrir(project.nom), { sorte: "discret" });
    name.className = "projet";
    if (ouvrir !== undefined) name.title = `open ${project.nom}`;
    const pourcentage = cree(doc, "span", part === undefined ? "" : `${part} %`);
    pourcentage.className = "part";
    const line = cree(doc, "li");
    line.append(teinte, name, tokensPoses(doc, tokens), pourcentage);
    liste.append(line);
  }
  bloc.append(cree(doc, "h3", dit), valeur, liste);
  return bloc;
}

// La tête entière : son libellé, les trois chiffres côte à côte, et la ligne du quota. `ouvrir`, s'il
// est donné, ouvre le projet dont le nom est cliqué.
/** @param {Fabrique} doc @param {ProjectDuCost[]} projects @param {Map<string, Read>} lectures @param {(project: string) => void} [ouvrir] */
export function poserTete(doc, projects, lectures, ouvrir) {
  const tete = cree(doc, "div");
  tete.className = "tete-cout";
  const rangee = cree(doc, "div");
  rangee.className = "chiffres";
  rangee.append(...figures(projects, lectures).map((chiffre) => poserChiffre(doc, chiffre, ouvrir)));
  const usage = cree(doc, "span", USAGE);
  usage.className = "mono";
  const quota = cree(doc, "p", `${QUOTA}: `);
  quota.className = "quota";
  quota.append(usage);
  tete.append(cree(doc, "h2", "tokens · all projects"), rangee, quota);
  return tete;
}
