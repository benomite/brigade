// @ts-check
// Les cinq tickets les plus chers de la page des coûts (ticket 1022), sous les trois chiffres de tête (tete.js) : pour
// chacun son numéro, son titre, ce qu'il a coûté en tokens et en essais, et un clic qui ouvre sa fiche
// (le ticket 621). Les coûts viennent du bloc « derniers cooks » de `station`, lu sur la box de chaque projet :
// une ligne par cook fini, « … #30  r-91c0  sonnet / medium  fini  31 tours · 412 806 tokens · 9,2 min ».
// Un ticket coûte la somme de ses cooks lus, en autant d'essais ; la box n'en montre que les derniers,
// la somme est donc ce qu'elle en dit — un cook qui ne déclare pas ses tokens la rend « ≥ », et un
// ticket dont aucun cook n'en déclare s'affiche « not communicated ». Son titre est celui du rail,
// quand le rail du projet est lu ; sinon « not communicated » aussi.
// Sur la page d'un projet, à côté de sa fiabilité (ticket 1022), le même bloc ne parle que de lui : la vue ne
// lui passe que ce projet et sa propre lecture de `station`.
// Ce module ne touche pas `document` : il reçoit de quoi créer un élément (briques.js), et rend des éléments.

import { poserAlerte, seuilsDesProjets } from "./seuils.js";
import { LECTURE, NON_COMMUNIQUE, tokensLus } from "./tete.js";
import { ligneVide } from "../composants/ligne-vide/ligne-vide.js";
import { debutDeSemaine, INDISPONIBLE, partDite, pondere, quotaLu } from "./part.js";

/** @typedef {import("../briques.js").Fabrique} Fabrique */
/** @typedef {import("./tete.js").Lecture} Lecture */
/** @typedef {import("./tete.js").ProjetDuCout} ProjetDuCout */
/** @typedef {import("./part.js").Quota} Quota */
/** @typedef {{ projet: ProjetDuCout, ticket: number, tokens: number | null, minimum: boolean, essais: number, ponderes: number | null }} Cher */
/** @typedef {{ ticket: number, tokens: number | null, modele: string | null, fin: number | null }} Cook */

export const TITRE = "most expensive tickets";
// Au plus ce nombre de tickets.
export const COMBIEN = 5;

const COOK = /#(\d+)\s(.*)$/;
const TOKENS = /(\d[\d\s  .,]*?)\s*tokens?(?:\s|$)/;
const NOMBRE = /^\d+$/;
const DATE = /^\s*(\d{4}-\d\d-\d\dT\S+)/;
// « r-91c0  sonnet / medium  fini » : le modèle précède « / effort ».
const MODELE = /^\s*\S+\s+(\S+)\s+\/\s/;

// Les cooks que `station` liste sous « derniers cooks » : leur ticket, leurs tokens — nuls si le cook n'en
// déclare pas —, leur modèle (« sonnet / medium » : `sonnet`) et leur fin (ms, nulle si la ligne n'en dit pas une
// lisible). Le bloc s'arrête à la première ligne qui n'est plus en retrait.
/** @param {string} texte @returns {Cook[]} */
export function cooksDetailles(texte) {
  const lignes = texte.split("\n");
  const debut = lignes.findIndex((ligne) => /^(derniers|latest) cooks/.test(ligne));
  if (debut === -1) return [];
  /** @type {Cook[]} */
  const lus = [];
  for (const ligne of lignes.slice(debut + 1)) {
    if (!/^\s/.test(ligne)) break;
    const cook = COOK.exec(ligne);
    if (cook === null || !NOMBRE.test(/** @type {string} */ (cook[1])) ) continue;
    const reste = /** @type {string} */ (cook[2]);
    const dit = TOKENS.exec(reste);
    const quand = Date.parse(DATE.exec(ligne)?.[1] ?? "");
    lus.push({
      ticket: Number(cook[1]),
      tokens: dit === null ? null : (tokensLus(`${dit[1]} tokens`) ?? null),
      modele: MODELE.exec(reste)?.[1] ?? null,
      fin: Number.isNaN(quand) ? null : quand,
    });
  }
  return lus;
}

/** @param {string} texte @returns {{ ticket: number, tokens: number | null }[]} */
export function cooksDe(texte) {
  return cooksDetailles(texte).map(({ ticket, tokens }) => ({ ticket, tokens }));
}

// Les tickets les plus chers de tous les projets : du plus cher au moins cher, ceux dont la box ne
// dit aucun coût après les autres, à égalité le numéro le plus récent d'abord. Au plus `COMBIEN`.
/** @param {ProjetDuCout[]} projets @param {Map<string, Lecture>} lectures @param {Quota} [quota] @returns {Cher[]} */
export function plusChers(projets, lectures, quota = quotaLu(undefined)) {
  /** @type {Cher[]} */
  const tous = [];
  for (const projet of projets) {
    const lecture = lectures.get(projet.nom);
    if (lecture === undefined || !("sorties" in lecture)) continue;
    const station = lecture.sorties.find(({ commande }) => commande === "station");
    if (station === undefined) continue;
    /** @type {Map<number, Cher>} */
    const parTicket = new Map();
    for (const { ticket, tokens, modele } of cooksDetailles(station.texte)) {
      const avant = parTicket.get(ticket) ?? { projet, ticket, tokens: null, minimum: false, essais: 0, ponderes: null };
      parTicket.set(ticket, {
        ...avant,
        tokens: tokens === null ? avant.tokens : (avant.tokens ?? 0) + tokens,
        ponderes: tokens === null ? avant.ponderes : (avant.ponderes ?? 0) + pondere(quota, modele, tokens),
        minimum: avant.minimum || tokens === null,
        essais: avant.essais + 1,
      });
    }
    tous.push(...parTicket.values());
  }
  return tous.sort((a, b) => (b.tokens ?? -1) - (a.tokens ?? -1) || b.ticket - a.ticket).slice(0, COMBIEN);
}

// Le coût de la semaine en cours, tous projets : les tokens pondérés des cooks finis depuis le début de la semaine
// du réglage, jusqu'à `maintenant`. Les cooks sont ceux que la box liste (dix par projet) : la somme est ce qu'elle
// en dit, et `minimum` dit qu'un cook de la semaine n'a ni tokens ni date lisibles.
/** @param {ProjetDuCout[]} projets @param {Map<string, Lecture>} lectures @param {Quota} quota @param {Date} maintenant @returns {{ ponderes: number, minimum: boolean }} */
export function coutDeLaSemaine(projets, lectures, quota, maintenant) {
  const debut = debutDeSemaine(quota, maintenant);
  let ponderes = 0;
  let minimum = false;
  for (const projet of projets) {
    const lecture = lectures.get(projet.nom);
    if (lecture === undefined || !("sorties" in lecture)) continue;
    const station = lecture.sorties.find(({ commande }) => commande === "station");
    if (station === undefined) continue;
    for (const { tokens, modele, fin } of cooksDetailles(station.texte)) {
      if (fin === null) minimum = true;
      else if (fin < debut || fin > maintenant.getTime()) continue;
      else if (tokens === null) minimum = true;
      else ponderes += pondere(quota, modele, tokens);
    }
  }
  return { ponderes, minimum };
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
// `quotaBrut` : le réglage `quotaMax` du fichier (part.js) ; `maintenant`, l'heure de la page. La ligne de la semaine, ou
// à sa place la seule ligne « No share », vient sous la liste.
/** @param {Fabrique} doc @param {ProjetDuCout[]} projets @param {Map<string, Lecture>} lectures
 *  @param {(projet: string, ticket: number) => string | undefined} titres
 *  @param {(projet: string, ticket: number, bouton: any) => void} ouvrir
 *  @param {unknown} [quotaBrut] @param {Date} [maintenant] */
export function poserChers(doc, projets, lectures, titres, ouvrir, quotaBrut, maintenant = new Date()) {
  const quota = quotaLu(quotaBrut);
  const bloc = cree(doc, "div");
  bloc.className = "chers-cout";
  const liste = cree(doc, "ol");
  // Avec un quota lisible, chaque ligne a une colonne de plus : sa part.
  liste.className = "chers";
  if (partDite(quota, 0) !== null) liste.className = "chers avec-part";
  const chers = plusChers(projets, lectures, quota);
  // La semaine se dit même sans ticket cher à lister ; sans quota, la ligne unique remplace toute part.
  const semaine = coutDeLaSemaine(projets, lectures, quota, maintenant);
  const partDeLaSemaine = partDite(quota, semaine.ponderes);
  const ligneDeLaSemaine = cree(doc, "p", partDeLaSemaine === null ? INDISPONIBLE : `this week, all projects: ${semaine.minimum ? "≥ " : ""}${partDeLaSemaine} of the weekly quota`);
  if (partDeLaSemaine === null) ligneDeLaSemaine.className = "part-indisponible";
  else ligneDeLaSemaine.className = "part-semaine";
  if (chers.length === 0) {
    const vide = ligneVide(doc, projets.some(({ nom }) => !lectures.has(nom)) ? LECTURE : NON_COMMUNIQUE, { classe: "sans" });
    // Tant qu'un projet n'est pas lu, la semaine n'est pas dite : « 0.0% » dirait ce qu'on n'a pas lu.
    if (partDeLaSemaine === null || !projets.some(({ nom }) => !lectures.has(nom))) bloc.append(cree(doc, "h2", TITRE), vide, ligneDeLaSemaine);
    else bloc.append(cree(doc, "h2", TITRE), vide);
    return bloc;
  }
  // Le ticket le plus cher, mis en évidence au-dessus du seuil de son projet (seuils.js).
  const [premier] = chers;
  const seuil = seuilsDesProjets(projets, lectures).get(premier?.projet.nom ?? "")?.ticket ?? null;
  const depasse = premier !== undefined && premier.tokens !== null && seuil !== null && premier.tokens > seuil ? { projet: premier.projet.nom, seuil } : undefined;
  for (const { projet, ticket, tokens, minimum, essais, ponderes } of chers) {
    const teinte = cree(doc, "span");
    teinte.className = "teinte";
    if (projet.teinte !== undefined) teinte.style.setProperty("--teinte", projet.teinte);
    const numero = cree(doc, "span", `#${ticket}`);
    numero.className = "numero mono";
    const titre = titres(projet.nom, ticket);
    const sansTitre = titre === undefined || titre === "";
    const dit = sansTitre ? ligneVide(doc, NON_COMMUNIQUE, { classe: "titre sans", balise: "span" }) : cree(doc, "span", titre);
    if (!sansTitre) dit.className = "titre";
    const cout = tokens === null ? ligneVide(doc, NON_COMMUNIQUE, { classe: "tokens sans", balise: "span" }) : cree(doc, "span", `${minimum ? "≥ " : ""}${nombre(tokens)}`);
    if (tokens !== null) cout.className = "tokens";
    const dite = ponderes === null ? null : partDite(quota, ponderes);
    const part = dite === null ? undefined : cree(doc, "span", `${minimum ? "≥ " : ""}${dite}`);
    if (part !== undefined) part.className = "part";
    const essai = cree(doc, "span", `${essais} ${essais === 1 ? "attempt" : "attempts"}`);
    essai.className = "essais";
    const ligne = cree(doc, "button");
    ligne.className = "ticket-cher";
    if (depasse !== undefined && ticket === premier?.ticket && projet === premier.projet) ligne.className = "ticket-cher depasse";
    ligne.title = `open the sheet of #${ticket} · ${projet.nom}`;
    ligne.append(teinte, numero, dit, cout, ...(part === undefined ? [] : [part]), essai);
    ligne.addEventListener("click", () => ouvrir(projet.nom, ticket, ligne));
    const item = cree(doc, "li");
    item.append(ligne);
    liste.append(item);
  }
  bloc.append(cree(doc, "h2", TITRE), liste, ligneDeLaSemaine);
  const alerte = depasse === undefined || premier === undefined
    ? poserAlerte(doc, depasse, seuil !== null, "", () => {})
    : poserAlerte(doc, depasse, true, `open the sheet of #${premier.ticket}`, (bouton) => ouvrir(premier.projet.nom, premier.ticket, bouton));
  if (alerte !== null) bloc.append(alerte);
  return bloc;
}
