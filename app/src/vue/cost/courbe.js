// @ts-check
// La courbe de la page des coûts de l'app (ticket 1022), sous les trois chiffres de tête (tete.js) : les tokens que brigade a
// lancés chaque jour, sur les derniers jours, une série par projet. Un titre court, une légende qui
// nomme chaque projet, et rien d'autre : la valeur d'un jour se lit au survol de sa colonne.
// Chaque série vient du bloc `consommé` de `station`, lu sur la box du projet : une ligne par jour,
// « 2026-10-16 : 19 lancements · … · 4 912 044 tokens », ou « 2026-10-16 : rien ». Une box qui
// n'écrit pas ces lignes — aujourd'hui, aucune : le runtime ne compte que 5 h et 24 h — ne
// communique pas sa série, et la courbe ne se dessine pas vide : sa zone dit « not communicated ».
// Ce module ne touche pas `document` : il reçoit de quoi créer un élément, HTML ou SVG, et rend des éléments.

import { LECTURE, lignesDuConsomme, NON_COMMUNIQUE, tokensLus } from "./tete.js";

/** @typedef {import("./tete.js").Lecture} Lecture */
/** @typedef {import("./tete.js").ProjetDuCout} ProjetDuCout */
/** @typedef {{ createElement(balise: string): any, createElementNS(espace: string, balise: string): any }} Fabrique */
// `points` : un nombre par jour de `jours`, `null` pour un jour que la série ne dit pas. La série
// entière est `undefined` quand la box n'a pas encore été lue, `null` quand elle ne l'a pas communiquée.
/** @typedef {{ projet: ProjetDuCout, points: (number | null)[] | null | undefined }} Serie */
/** @typedef {{ jours: string[], series: Serie[] }} Courbe */

export const TITRE = "tokens per day";
// Les derniers jours que la courbe montre, au plus.
export const JOURS = 14;

const SVG = "http://www.w3.org/2000/svg";
// Le tracé se dessine dans ce repère, puis s'étire à la largeur de la page : ses traits gardent
// leur épaisseur (`vector-effect`), et ses textes sont posés hors du SVG, pour ne pas s'étirer.
const LARGEUR = 1000;
const HAUTEUR = 100;

const JOUR = /^(\d{4}-\d{2}-\d{2}) ?: (.*)$/;

// Les tokens de chaque jour que `station` communique, par date (AAAA-MM-JJ).
/** @param {string} texte @returns {Map<string, number>} */
export function joursDe(texte) {
  /** @type {Map<string, number>} */
  const lus = new Map();
  for (const valeur of lignesDuConsomme(texte)) {
    const jour = JOUR.exec(valeur);
    if (jour === null) continue;
    const tokens = tokensLus(/** @type {string} */ (jour[2]).trim());
    if (tokens !== undefined) lus.set(/** @type {string} */ (jour[1]), tokens);
  }
  return lus;
}

// Les jours d'un projet : non lus, non communiqués, ou ce que `station` a rendu.
/** @param {Lecture | undefined} lecture @returns {Map<string, number> | null | undefined} */
function joursDuProjet(lecture) {
  if (lecture === undefined) return undefined;
  if (!("sorties" in lecture)) return null;
  const station = lecture.sorties.find(({ commande }) => commande === "station");
  const jours = station === undefined ? new Map() : joursDe(station.texte);
  return jours.size === 0 ? null : jours;
}

// Les séries par projet, alignées sur les mêmes jours : les derniers que l'une des boxes dit, au
// plus `JOURS`, du plus ancien au plus récent. Un jour qu'une série ne dit pas y reste un trou,
// jamais un zéro : « rien » est un zéro, que la box écrit.
/** @param {ProjetDuCout[]} projets @param {Map<string, Lecture>} lectures @returns {Courbe} */
export function series(projets, lectures) {
  const lus = projets.map((projet) => ({ projet, jours: joursDuProjet(lectures.get(projet.nom)) }));
  const jours = [...new Set(lus.flatMap(({ jours }) => (jours ? [...jours.keys()] : [])))].sort().slice(-JOURS);
  return {
    jours,
    series: lus.map(({ projet, jours: dits }) => ({ projet, points: dits ? jours.map((jour) => dits.get(jour) ?? null) : dits })),
  };
}

const nombre = (/** @type {number} */ valeur) => valeur.toLocaleString("en-US");
const bref = (/** @type {number} */ valeur) => valeur.toLocaleString("en-US", { notation: "compact", maximumFractionDigits: 1 });
// « Oct 16 » : le jour tel que la box l'a daté, sans fuseau.
const jourDit = (/** @type {string} */ jour) => new Date(`${jour}T00:00:00Z`).toLocaleDateString("en-US", { month: "short", day: "numeric", timeZone: "UTC" });

// Chaque classe est posée en clair, `className = "…"` : la peau ne vise que des classes que la vue
// pose, et son test les lit ainsi (peau.test.ts). Les éléments du SVG n'en portent pas : la peau
// les vise par leur balise.
/** @param {Fabrique} doc @param {string} balise @param {string} [texte] */
function cree(doc, balise, texte) {
  const pose = doc.createElement(balise);
  if (texte !== undefined) pose.textContent = texte;
  return pose;
}
/** @param {Fabrique} doc @param {string} balise @param {Record<string, string>} attributs */
function trace(doc, balise, attributs) {
  const pose = doc.createElementNS(SVG, balise);
  for (const [nom, valeur] of Object.entries(attributs)) pose.setAttribute(nom, valeur);
  return pose;
}

const abscisse = (/** @type {number} */ i, /** @type {number} */ n) => (n === 1 ? LARGEUR / 2 : (i / (n - 1)) * LARGEUR);
const ordonnee = (/** @type {number} */ valeur, /** @type {number} */ haut) => HAUTEUR - (valeur / haut) * HAUTEUR;

// Le tracé : la ligne du haut et celle du zéro, puis chaque série — ses tronçons, d'un trou à
// l'autre, et un point par jour dit —, enfin une colonne par jour, qui dit au survol ce que chaque
// projet a lancé ce jour-là.
/** @param {Fabrique} doc @param {Courbe} courbe @param {number} haut */
function poserTrace(doc, { jours, series: lues }, haut) {
  const svg = trace(doc, "svg", { viewBox: `0 0 ${LARGEUR} ${HAUTEUR}`, preserveAspectRatio: "none", "aria-hidden": "true" });
  for (const y of [0, HAUTEUR]) svg.append(trace(doc, "line", { x1: "0", x2: String(LARGEUR), y1: String(y), y2: String(y), "vector-effect": "non-scaling-stroke" }));
  for (const { projet, points } of lues) {
    if (!points) continue;
    /** @type {string[][]} */
    const troncons = [[]];
    /** @type {string[]} */
    const dits = [];
    points.forEach((valeur, i) => {
      if (valeur === null) return void troncons.push([]);
      const point = `${abscisse(i, points.length)} ${ordonnee(valeur, haut)}`;
      /** @type {string[]} */ (troncons.at(-1)).push(point);
      dits.push(`M${point}h0`);
    });
    const ligne = trace(doc, "path", { d: troncons.filter((troncon) => troncon.length > 1).map((troncon) => `M${troncon.join("L")}`).join(""), "vector-effect": "non-scaling-stroke" });
    const marques = trace(doc, "path", { d: dits.join(""), "vector-effect": "non-scaling-stroke", "data-points": "" });
    for (const pose of [ligne, marques]) if (projet.teinte !== undefined) pose.style.setProperty("--teinte", projet.teinte);
    svg.append(ligne, marques);
  }
  const pas = LARGEUR / jours.length;
  jours.forEach((jour, i) => {
    const colonne = trace(doc, "rect", { x: String(Math.max(0, abscisse(i, jours.length) - pas / 2)), y: "0", width: String(pas), height: String(HAUTEUR) });
    const ditsDuJour = lues.flatMap(({ projet, points }) => (points ? [`${projet.nom} ${points[i] === null ? NON_COMMUNIQUE : nombre(/** @type {number} */ (points[i]))}`] : []));
    const survol = doc.createElementNS(SVG, "title");
    survol.textContent = `${jourDit(jour)} — ${ditsDuJour.join(" · ")}`;
    colonne.append(survol);
    svg.append(colonne);
  });
  return svg;
}

// La légende : la pastille et le nom de chaque projet, et pour celui dont la série manque, ce qu'il en est.
/** @param {Fabrique} doc @param {Serie[]} lues */
function poserLegende(doc, lues) {
  const legende = cree(doc, "ul");
  legende.className = "legende";
  for (const { projet, points } of lues) {
    const teinte = cree(doc, "span");
    teinte.className = "teinte";
    if (projet.teinte !== undefined) teinte.style.setProperty("--teinte", projet.teinte);
    const nom = cree(doc, "span", projet.nom);
    nom.className = "projet";
    const ligne = cree(doc, "li");
    ligne.append(teinte, nom);
    if (!points) {
      const manque = cree(doc, "span", points === undefined ? LECTURE : NON_COMMUNIQUE);
      manque.className = "sans";
      ligne.append(manque);
    }
    legende.append(ligne);
  }
  return legende;
}

// La courbe entière : son titre, puis le tracé et sa légende — ou, tant qu'aucune box ne donne sa
// série, ce qu'il en est à la place du tracé.
/** @param {Fabrique} doc @param {ProjetDuCout[]} projets @param {Map<string, Lecture>} lectures */
export function poserCourbe(doc, projets, lectures) {
  const courbe = series(projets, lectures);
  const bloc = cree(doc, "div");
  bloc.className = "courbe-cout";
  bloc.append(cree(doc, "h2", TITRE));
  const dessinees = courbe.series.filter(({ points }) => points);
  if (dessinees.length === 0) {
    const manque = cree(doc, "p", courbe.series.some(({ points }) => points === undefined) ? LECTURE : NON_COMMUNIQUE);
    manque.className = "sans";
    bloc.append(manque);
    return bloc;
  }
  const haut = Math.max(1, ...dessinees.flatMap(({ points }) => (points ?? []).flatMap((valeur) => (valeur === null ? [] : [valeur]))));
  const cadre = cree(doc, "div");
  cadre.className = "trace";
  const plusHaut = cree(doc, "span", bref(haut));
  plusHaut.className = "haut";
  cadre.append(plusHaut, poserTrace(doc, courbe, haut));
  // Chaque jour sous son point : sa place est celle du point, en pourcentage de la largeur.
  const jours = cree(doc, "div");
  jours.className = "jours";
  courbe.jours.forEach((jour, i) => {
    const dit = cree(doc, "span", jourDit(jour));
    dit.style.setProperty("left", `${(abscisse(i, courbe.jours.length) / LARGEUR) * 100}%`);
    jours.append(dit);
  });
  bloc.append(cadre, jours, poserLegende(doc, courbe.series));
  return bloc;
}
