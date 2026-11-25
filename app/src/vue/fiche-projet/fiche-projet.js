// @ts-check
// La fiche du projet sous Settings (ticket 4240, épique 4136) : ce que le projet déclare — les huit articles de la table
// « The project sheet » de docs/superpowers/specs/2026-11-24-simplified-process.md —, lu dans `.brigade/fiche-projet.json`
// de son dossier, et changé ici par le chef. Un article est un texte (une ligne) ou une liste de textes (une ligne
// chacun) : il garde sa forme d'une écriture à l'autre. « Save » écrit le fichier entier, les clés que l'écran ne montre
// pas comprises ; un article que le chef laisse vide alors que le projet en a besoin — the cook's work, stages, served —
// est refusé en le nommant, et rien n'est écrit.
//
// Un projet sans fiche le dit en une ligne, sans rien créer : ses valeurs par défaut sont écrites par le runtime. Une
// fiche qui ne se lit pas — illisible, ou un article qui n'a pas la forme — le dit en une ligne, le détail au survol, et
// n'offre aucun champ : rien ne l'écrase.
//
// Ce module ne touche pas `document` : il reçoit de quoi créer un élément (briques.js), et de quoi lire et écrire un
// fichier du projet, le chemin relatif à son dossier — `lire` rend `null`, ou rejette avec le code `ENOENT`, quand le
// fichier n'y est pas.

import { survol } from "../briques.js";
import { bouton } from "../composants/bouton/bouton.js";
import { ligneErreur } from "../composants/ligne-erreur/ligne-erreur.js";
import { ligneVide } from "../composants/ligne-vide/ligne-vide.js";
import { ENREGISTREMENT, NON_ATTEINT, PAS_ENCORE } from "../lexique.js";

/** @typedef {import("../briques.js").Fabrique} Fabrique */
/** @typedef {{ lire(chemin: string): Promise<string | null>, ecrire(chemin: string, texte: string): Promise<unknown> }} Fichiers */
/** @typedef {Record<string, unknown>} Fiche */
/** @typedef {{ lecture: "absente" } | { lecture: "illisible", detail: string } | { lecture: "lue", fiche: Fiche }} Lecture */

const FICHE = ".brigade/fiche-projet.json";

// Les huit articles, dans l'ordre de la spec, avec ses mots. `requis` : vide, le projet n'a plus de quoi cuire.
const ARTICLES = /** @type {const} */ ([
  { cle: "work", nom: "The cook's work", requis: true, aide: "What a cook makes for this project: code and its tests, an episode, a page." },
  { cle: "stages", nom: "Stages", requis: true, aide: "The steps a ticket goes through, each through the pass. One by default." },
  { cle: "tools", nom: "Tools", requis: false, aide: "What the cooks use to do the work." },
  { cle: "rules", nom: "House rules", requis: false, aide: "The locked pass checks. Only the chef changes them." },
  { cle: "risks", nom: "Risks", requis: false, aide: "The actions that require the chef's opinion." },
  { cle: "served", nom: "Served", requis: true, aide: "What counts as served: where a dish reaches the table." },
  { cle: "recurring", nom: "Recurring", requis: false, aide: "The work that comes back on a rhythm." },
  { cle: "humans", nom: "Humans in the kitchen", requis: false, aide: "The people who take a part of the work." },
]);

const TITRE = "project sheet";
const MOTS = {
  aide: "What this project declares to the kitchen, kept in its repository (.brigade/fiche-projet.json). Each item is one line, or one entry per line for a list.",
  vide: PAS_ENCORE("project sheet"),
  sansFichier: "This project has no .brigade/fiche-projet.json: the kitchen writes it with its defaults.",
  illisible: NON_ATTEINT("project sheet"),
  parLigne: "one per line",
  enregistrer: "Save",
  enCours: ENREGISTREMENT,
  enregistre: "Saved.",
  nonEnregistre: "Project sheet not saved.",
  /** @param {string} nom */
  requis: (nom) => `${nom} cannot be empty: nothing was saved.`,
};

/** @param {Fabrique} doc @param {string} balise @param {string} [texte] */
function cree(doc, balise, texte) {
  const pose = doc.createElement(balise);
  if (texte !== undefined) pose.textContent = texte;
  return pose;
}

/** @param {unknown} erreur */
const message = (erreur) => (erreur instanceof Error ? erreur.message : String(erreur));
/** @param {unknown} valeur */
const estListe = (valeur) => Array.isArray(valeur) && valeur.every((element) => typeof element === "string");

// La fiche lue : absente, illisible — avec pourquoi —, ou ses articles, chacun un texte ou une liste de textes.
/** @param {Fichiers["lire"]} lire @returns {Promise<Lecture>} */
async function lireLaFiche(lire) {
  /** @type {string | null} */
  let texte;
  try {
    texte = await lire(FICHE);
  } catch (erreur) {
    if (/** @type {any} */ (erreur)?.code === "ENOENT") return { lecture: "absente" };
    return { lecture: "illisible", detail: message(erreur) };
  }
  if (texte === null || texte === undefined) return { lecture: "absente" };
  /** @type {unknown} */
  let fiche;
  try {
    fiche = JSON.parse(texte);
  } catch (erreur) {
    return { lecture: "illisible", detail: `${FICHE} is not JSON: ${message(erreur)}` };
  }
  if (typeof fiche !== "object" || fiche === null || Array.isArray(fiche)) return { lecture: "illisible", detail: `${FICHE} is not a JSON object` };
  const objet = /** @type {Fiche} */ (fiche);
  const malFait = ARTICLES.find(({ cle }) => typeof objet[cle] !== "string" && !estListe(objet[cle]));
  if (malFait !== undefined) return { lecture: "illisible", detail: `${malFait.nom} (${malFait.cle}) is not a text or a list of texts in ${FICHE}` };
  return { lecture: "lue", fiche: objet };
}

// Ce qu'un champ dit, rendu à la forme de l'article : une liste, une entrée par ligne non vide ; un texte, sans ses
// blancs autour.
/** @param {unknown} avant @param {string} saisi */
function valeurSaisie(avant, saisi) {
  if (Array.isArray(avant)) return saisi.split("\n").map((ligne) => ligne.trim()).filter((ligne) => ligne !== "");
  return saisi.trim();
}

// Les articles requis laissés vides, par leur nom.
/** @param {Fiche} fiche */
function articlesVides(fiche) {
  return ARTICLES.filter(({ cle, requis }) => requis && /** @type {string | string[]} */ (fiche[cle]).length === 0);
}

// Un article : son nom et son aide au survol, puis son champ — une ligne pour un texte, une zone pour une liste, « one
// per line » dessous.
/** @param {Fabrique} doc @param {(typeof ARTICLES)[number]} article @param {unknown} valeur */
function poserUnArticle(doc, article, valeur) {
  const rangee = cree(doc, "div");
  rangee.className = "article";
  const nom = cree(doc, "span", article.nom);
  nom.className = "nom";
  nom.append(survol(doc, article.aide));
  const liste = Array.isArray(valeur);
  const champ = cree(doc, liste ? "textarea" : "input");
  if (!liste) champ.type = "text";
  champ.className = "champ";
  champ.dataset.item = article.cle;
  champ.ariaLabel = article.nom;
  champ.value = liste ? valeur.join("\n") : String(valeur);
  const saisie = cree(doc, "span");
  saisie.className = "saisie";
  saisie.append(champ);
  if (liste) {
    champ.rows = 3;
    const parLigne = cree(doc, "small", MOTS.parLigne);
    parLigne.className = "par-ligne";
    saisie.append(parLigne);
  }
  rangee.append(nom, saisie);
  return { rangee, champ };
}

// L'écran de la fiche : la tête, puis les huit articles et « Save » — ou la ligne vide, ou la ligne d'erreur. Rendu une
// fois la fiche lue.
/** @param {Fabrique} doc @param {Fichiers} fichiers */
export async function ouvrirFicheProjet(doc, { lire, ecrire }) {
  const racine = cree(doc, "section");
  racine.className = "fiche-du-projet";
  racine.ariaLabel = "The project sheet";
  const tete = cree(doc, "div");
  tete.className = "tete";
  const titre = cree(doc, "span", TITRE);
  titre.className = "nom";
  titre.append(survol(doc, MOTS.aide));
  tete.append(titre);
  racine.append(tete);

  const lue = await lireLaFiche(lire);
  if (lue.lecture === "absente") {
    racine.append(ligneVide(doc, MOTS.vide, { classe: "aucune", detail: MOTS.sansFichier }));
    return racine;
  }
  if (lue.lecture === "illisible") {
    racine.append(ligneErreur(doc, MOTS.illisible, lue.detail));
    return racine;
  }

  let fiche = lue.fiche;
  const champs = ARTICLES.map((article) => ({ article, ...poserUnArticle(doc, article, fiche[article.cle]) }));
  const pied = cree(doc, "div");
  pied.className = "pied";
  const dit = cree(doc, "div");
  dit.className = "dit";
  dit.ariaLive = "polite";
  const enregistrer = bouton(doc, MOTS.enregistrer, () => void sauver(), { sorte: "recommande" });
  enregistrer.dataset.geste = "enregistrer";
  pied.append(enregistrer, dit);
  racine.append(...champs.map(({ rangee }) => rangee), pied);

  async function sauver() {
    /** @type {Fiche} */
    const nouvelle = { ...fiche };
    for (const { article, champ } of champs) nouvelle[article.cle] = valeurSaisie(fiche[article.cle], champ.value);
    const vides = articlesVides(nouvelle);
    for (const { article, champ } of champs) champ.ariaInvalid = vides.includes(article) ? "true" : "";
    if (vides.length > 0) {
      dit.replaceChildren(...vides.map(({ nom }) => ligneErreur(doc, MOTS.requis(nom), "", { classe: "refus", alerte: true })));
      return;
    }
    enregistrer.disabled = true;
    dit.replaceChildren(cree(doc, "span", MOTS.enCours));
    try {
      await ecrire(FICHE, `${JSON.stringify(nouvelle, null, 2)}\n`);
    } catch (erreur) {
      dit.replaceChildren(ligneErreur(doc, MOTS.nonEnregistre, message(erreur), { classe: "refus", alerte: true }));
      return;
    } finally {
      enregistrer.disabled = false;
    }
    fiche = nouvelle;
    for (const { article, champ } of champs) champ.value = Array.isArray(fiche[article.cle]) ? /** @type {string[]} */ (fiche[article.cle]).join("\n") : String(fiche[article.cle]);
    const fait = cree(doc, "span", MOTS.enregistre);
    fait.className = "enregistre";
    dit.replaceChildren(fait);
  }

  return racine;
}
