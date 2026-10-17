// @ts-check
// Les cinq tickets les plus chers de l'onglet Cost, sous les trois chiffres de tête (tete.js) : pour
// chacun son numéro, son titre, ce qu'il a coûté en tokens et en essais, et un clic qui ouvre sa fiche
// (le ticket 621). Les coûts viennent du bloc « derniers cooks » de `station`, lu sur la box de chaque projet :
// une ligne par cook fini, « … #30  r-91c0  sonnet / medium  fini  31 tours · 412 806 tokens · 9,2 min ».
// Un ticket coûte la somme de ses cooks lus, en autant d'essais ; la box n'en montre que les derniers,
// la somme est donc ce qu'elle en dit — un cook qui ne déclare pas ses tokens la rend « ≥ », et un
// ticket dont aucun cook n'en déclare s'affiche « not communicated ». Son titre est celui du rail,
// quand le rail du projet est lu ; sinon « not communicated » aussi.
// Ce module ne touche pas `document` : il reçoit de quoi créer un élément (briques.js), et rend des éléments.

import { GESTE_TICKET, poserAlerte, seuilsDesProjets } from "./seuils.js";
import { LECTURE, NON_COMMUNIQUE, tokensLus } from "./tete.js";

/** @typedef {import("../briques.js").Fabrique} Fabrique */
/** @typedef {import("./tete.js").Lecture} Lecture */
/** @typedef {import("./tete.js").ProjetDuCout} ProjetDuCout */
/** @typedef {{ projet: ProjetDuCout, ticket: number, tokens: number | null, minimum: boolean, essais: number }} Cher */

export const TITRE = "most expensive tickets";
// Au plus ce nombre de tickets.
export const COMBIEN = 5;

const COOK = /#(\d+)\s(.*)$/;
const TOKENS = /(\d[\d\s  .,]*?)\s*tokens?(?:\s|$)/;
const NOMBRE = /^\d+$/;

// Les cooks que `station` liste sous « derniers cooks » : leur ticket, et leurs tokens — nuls si le
// cook n'en déclare pas. Le bloc s'arrête à la première ligne qui n'est plus en retrait.
/** @param {string} texte @returns {{ ticket: number, tokens: number | null }[]} */
export function cooksDe(texte) {
  const lignes = texte.split("\n");
  const debut = lignes.findIndex((ligne) => ligne.startsWith("derniers cooks"));
  if (debut === -1) return [];
  /** @type {{ ticket: number, tokens: number | null }[]} */
  const lus = [];
  for (const ligne of lignes.slice(debut + 1)) {
    if (!/^\s/.test(ligne)) break;
    const cook = COOK.exec(ligne);
    if (cook === null || !NOMBRE.test(/** @type {string} */ (cook[1])) ) continue;
    const dit = TOKENS.exec(/** @type {string} */ (cook[2]));
    lus.push({ ticket: Number(cook[1]), tokens: dit === null ? null : (tokensLus(`${dit[1]} tokens`) ?? null) });
  }
  return lus;
}

// Les tickets les plus chers de tous les projets : du plus cher au moins cher, ceux dont la box ne
// dit aucun coût après les autres, à égalité le numéro le plus récent d'abord. Au plus `COMBIEN`.
/** @param {ProjetDuCout[]} projets @param {Map<string, Lecture>} lectures @returns {Cher[]} */
export function plusChers(projets, lectures) {
  /** @type {Cher[]} */
  const tous = [];
  for (const projet of projets) {
    const lecture = lectures.get(projet.nom);
    if (lecture === undefined || !("sorties" in lecture)) continue;
    const station = lecture.sorties.find(({ commande }) => commande === "station");
    if (station === undefined) continue;
    /** @type {Map<number, Cher>} */
    const parTicket = new Map();
    for (const { ticket, tokens } of cooksDe(station.texte)) {
      const avant = parTicket.get(ticket) ?? { projet, ticket, tokens: null, minimum: false, essais: 0 };
      parTicket.set(ticket, {
        ...avant,
        tokens: tokens === null ? avant.tokens : (avant.tokens ?? 0) + tokens,
        minimum: avant.minimum || tokens === null,
        essais: avant.essais + 1,
      });
    }
    tous.push(...parTicket.values());
  }
  return tous.sort((a, b) => (b.tokens ?? -1) - (a.tokens ?? -1) || b.ticket - a.ticket).slice(0, COMBIEN);
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

// Le bloc entier : son libellé, et une ligne par ticket — un bouton qui ouvre la fiche. `titres` dit le
// titre d'un ticket sur le rail de son projet, s'il y est ; `ouvrir` ouvre sa fiche.
/** @param {Fabrique} doc @param {ProjetDuCout[]} projets @param {Map<string, Lecture>} lectures
 *  @param {(projet: string, ticket: number) => string | undefined} titres
 *  @param {(projet: string, ticket: number, bouton: any) => void} ouvrir */
export function poserChers(doc, projets, lectures, titres, ouvrir) {
  const bloc = cree(doc, "div");
  bloc.className = "chers-cout";
  const liste = cree(doc, "ol");
  liste.className = "chers";
  const chers = plusChers(projets, lectures);
  if (chers.length === 0) {
    const vide = cree(doc, "p", projets.some(({ nom }) => !lectures.has(nom)) ? LECTURE : NON_COMMUNIQUE);
    vide.className = "sans";
    bloc.append(cree(doc, "h2", TITRE), vide);
    return bloc;
  }
  // Le ticket le plus cher, mis en évidence au-dessus du seuil de son projet (seuils.js).
  const [premier] = chers;
  const seuil = seuilsDesProjets(projets, lectures).get(premier?.projet.nom ?? "")?.ticket ?? null;
  const depasse = premier !== undefined && premier.tokens !== null && seuil !== null && premier.tokens > seuil ? { projet: premier.projet.nom, seuil } : undefined;
  for (const { projet, ticket, tokens, minimum, essais } of chers) {
    const teinte = cree(doc, "span");
    teinte.className = "teinte";
    if (projet.teinte !== undefined) teinte.style.setProperty("--teinte", projet.teinte);
    const numero = cree(doc, "span", `#${ticket}`);
    numero.className = "numero mono";
    const titre = titres(projet.nom, ticket);
    const dit = cree(doc, "span", titre === undefined || titre === "" ? NON_COMMUNIQUE : titre);
    dit.className = titre === undefined || titre === "" ? "titre sans" : "titre";
    const cout = cree(doc, "span", tokens === null ? NON_COMMUNIQUE : `${minimum ? "≥ " : ""}${nombre(tokens)}`);
    cout.className = tokens === null ? "tokens sans" : "tokens";
    const essai = cree(doc, "span", `${essais} ${essais === 1 ? "attempt" : "attempts"}`);
    essai.className = "essais";
    const ligne = cree(doc, "button");
    ligne.className = "ticket-cher";
    if (depasse !== undefined && ticket === premier?.ticket && projet === premier.projet) ligne.className = "ticket-cher depasse";
    ligne.title = `open the sheet of #${ticket} · ${projet.nom}`;
    ligne.append(teinte, numero, dit, cout, essai);
    ligne.addEventListener("click", () => ouvrir(projet.nom, ticket, ligne));
    const item = cree(doc, "li");
    item.append(ligne);
    liste.append(item);
  }
  bloc.append(cree(doc, "h2", TITRE), liste);
  const alerte = poserAlerte(doc, depasse, seuil !== null, GESTE_TICKET);
  if (alerte !== null) bloc.append(alerte);
  return bloc;
}
