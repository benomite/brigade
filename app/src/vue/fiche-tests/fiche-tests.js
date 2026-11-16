// @ts-check
// Sur la fiche d'un ticket : pour chaque critère d'acceptation, son test et le chemin qui l'a vérifié — rouge sur main, vert
// sur la branche, N mutations survécues (ticket 3728). Ce que la fiche lit est un enregistrement par critère, produit
// ailleurs (l'étape du rail, le contrôle du ticket 3465, le contrôle de mutations de la pass) : ce module ne fait que le lire et
// le poser. Une étape que l'enregistrement ne donne pas, ou donne mal formée, est « pending » — jamais « done ».
// Ce module ne touche pas `document` : il reçoit de quoi créer un élément, la vue lui donne le sien et les tests un faux.

import { marque } from "../composants/pastille/pastille.js";

/** @typedef {import("../briques.js").Fabrique} Fabrique */
/** @typedef {"done" | "failed" | "pending"} Etat */
/** @typedef {{ criterion?: string, testPath?: string, redOnMain?: boolean, greenOnBranch?: boolean, mutationsCaught?: number, mutationsTotal?: number, survivingLines?: string[] }} Enregistrement */
/** @typedef {{ criteria?: Enregistrement[], sendBack?: string }} TestsDeFiche */
/** @typedef {{ etat: Etat, dit: string }} Etape */

// Le ton de chaque état, et son mot au survol : la forme du marqueur le dit aussi, la couleur ne porte jamais seule.
/** @type {Record<Etat, string>} */
const TONS = { done: "vert", failed: "rouge", pending: "gris" };

const texte = (/** @type {unknown} */ valeur) => (typeof valeur === "string" && valeur.trim() !== "" ? valeur : undefined);
const entier = (/** @type {unknown} */ valeur) => (typeof valeur === "number" && Number.isInteger(valeur) && valeur >= 0 ? valeur : undefined);

// Les trois étapes d'un critère, dans l'ordre. Un booléen absent est pending ; faux est failed. Les mutations ne se lisent
// que si le total et les attrapées se tiennent (0 ≤ attrapées ≤ total, total > 0) : sinon pending.
/** @param {Enregistrement} enregistrement @returns {Etape[]} */
export function etapesDe(enregistrement) {
  const { redOnMain, greenOnBranch } = enregistrement;
  /** @param {unknown} valeur @param {string} nom @returns {Etape} */
  const booleen = (valeur, nom) => ({ etat: valeur === true ? "done" : valeur === false ? "failed" : "pending", dit: nom });
  const total = entier(enregistrement.mutationsTotal);
  const attrapees = entier(enregistrement.mutationsCaught);
  if (total === undefined || attrapees === undefined || total === 0 || attrapees > total) {
    return [booleen(redOnMain, "red on main"), booleen(greenOnBranch, "green on the branch"), { etat: "pending", dit: "survived ? mutations" }];
  }
  const survecues = total - attrapees;
  return [booleen(redOnMain, "red on main"), booleen(greenOnBranch, "green on the branch"), { etat: survecues === 0 ? "done" : "failed", dit: `survived ${survecues} of ${total} mutations` }];
}

/** @param {Fabrique} doc @param {Enregistrement} enregistrement */
function ligneDeCritere(doc, enregistrement) {
  const ligne = doc.createElement("li");
  ligne.className = "critere-teste";
  const phrase = doc.createElement("p");
  phrase.className = "critere-dit";
  const critere = texte(enregistrement.criterion);
  phrase.textContent = critere ?? "criterion not given";
  if (critere === undefined) phrase.className += " sans";
  const chemin = doc.createElement("code");
  chemin.className = "critere-test";
  const test = texte(enregistrement.testPath);
  chemin.textContent = test ?? "no test given";
  if (test === undefined) chemin.className += " sans";
  const etapes = doc.createElement("ol");
  etapes.className = "critere-etapes";
  const etapesDuCritere = etapesDe(enregistrement);
  for (const { etat, dit } of etapesDuCritere) {
    const etape = doc.createElement("li");
    etape.dataset.etat = etat;
    etape.title = etat;
    const mot = doc.createElement("span");
    mot.textContent = dit;
    etape.append(marque(doc, TONS[etat]), mot);
    etapes.append(etape);
  }
  ligne.append(phrase, chemin, etapes);
  // Une mutation qui a survécu : sa ligne de code, dite telle quelle.
  const lignes = Array.isArray(enregistrement.survivingLines) ? enregistrement.survivingLines.filter((vue) => texte(vue) !== undefined) : [];
  if (etapesDuCritere[2]?.etat === "failed") {
    const survivantes = doc.createElement("ul");
    survivantes.className = "critere-survivantes";
    for (const vue of lignes.length > 0 ? lignes : ["no surviving line given"]) {
      const survivante = doc.createElement("li");
      const code = doc.createElement("code");
      code.textContent = vue;
      if (lignes.length === 0) code.className = "sans";
      survivante.append(code);
      survivantes.append(survivante);
    }
    ligne.append(survivantes);
  }
  return ligne;
}

// La section de la fiche : le renvoi de la pass s'il y en a un, puis une ligne par critère. Rien quand la fiche ne porte
// aucun enregistrement ; une liste de critères illisible se dit en une ligne, jamais en critères inventés.
/** @param {Fabrique} doc @param {unknown} tests @returns {any[]} */
export function poserTestsDeFiche(doc, tests) {
  if (tests === undefined || tests === null) return [];
  const { criteria, sendBack } = /** @type {TestsDeFiche} */ (typeof tests === "object" ? tests : {});
  const section = doc.createElement("section");
  section.className = "tests-de-fiche";
  section.ariaLabel = "the test and the path of each acceptance criterion";
  const renvoi = texte(sendBack);
  if (renvoi !== undefined) {
    const phrase = doc.createElement("p");
    phrase.className = "renvoi";
    phrase.textContent = `Sent back: ${renvoi}`;
    section.append(phrase);
  }
  if (!Array.isArray(criteria)) {
    const phrase = doc.createElement("p");
    phrase.className = "sans";
    phrase.textContent = "the criteria and their tests are unavailable";
    section.append(phrase);
    return [section];
  }
  const liste = doc.createElement("ol");
  liste.className = "criteres-testes";
  for (const enregistrement of criteria) liste.append(ligneDeCritere(doc, typeof enregistrement === "object" && enregistrement !== null ? enregistrement : {}));
  section.append(liste);
  return [section];
}
