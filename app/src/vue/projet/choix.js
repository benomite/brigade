// @ts-check
// Ce qui manque à la station pour les tests d'un projet, sur sa page (ticket 1400, épique 1393) : une carte par
// besoin que sa principale publie en attente (ticket 1398, `choix` du suivi) — ce qui manque en une phrase,
// pourquoi dessous, et ses issues, chacune un bouton avec ce qui en suit sous lui : le cuire sur une station qui
// l'a, le fournir sur celle-ci, adapter les tests. Deux besoins, deux cartes. Un clic retient l'issue ; la carte
// part dès qu'elle est écrite. Aucun choix en attente, aucune carte. La carte dit ce que le blocage du besoin
// disait (même clé, `need:<besoin>`) : la ligne du blocage ne se répète pas dessous. Ce module ne connaît aucun
// besoin ni aucune issue : il montre ceux que la station publie. Il ne touche pas `document` (briques.js).

import { survol } from "../briques.js";

/** @typedef {import("../briques.js").Fabrique} Fabrique */
/** @typedef {import("../../projets/demande.ts").Choix} Choix */
/** @typedef {import("../../projets/demande.ts").Blocage} Blocage */
// Pourquoi une issue n'a pas été retenue, en une ligne, et ce que GitHub a dit au survol.
/** @typedef {{ refus: string, detail?: string }} Refus */

export const EN_COURS = "recording your choice…";

/** @param {Fabrique} doc @param {string} balise @param {string} [texte] */
function cree(doc, balise, texte) {
  const pose = doc.createElement(balise);
  if (texte !== undefined) pose.textContent = texte;
  return pose;
}

// Les choix qui attendent le chef : ceux que la station publie en attente, moins ceux dont l'app a déjà écrit une
// issue que la station offre — elle ne l'a pas encore lue — et ceux que la vue vient de retenir.
/** @param {readonly Choix[]} choix @param {Readonly<Record<string, string>>} [choisis] @param {ReadonlySet<string>} [retenus] */
export function choixEnAttente(choix, choisis = {}, retenus = new Set()) {
  return choix.filter(({ id, status, options }) => status === "pending" && !retenus.has(id) && !options.some((option) => option.id === choisis[id]));
}

// Les blocages que la page montre en lignes : ceux qu'aucun choix ne dit déjà — un besoin a sa carte tant qu'il
// attend, et une fois tranché, son blocage se lève à la lecture suivante de la station.
/** @param {readonly Blocage[]} blocages @param {readonly Choix[]} choix @param {Readonly<Record<string, string>>} [choisis] @param {ReadonlySet<string>} [retenus] */
export function sansLesChoix(blocages, choix, choisis = {}, retenus = new Set()) {
  const dits = new Set([...choix.map(({ id }) => id), ...Object.keys(choisis), ...retenus]);
  return blocages.filter(({ id }) => !dits.has(id));
}

/**
 * @param {Fabrique} doc @param {Choix} choix
 * @param {{ choisir: (choix: string, issue: string) => void, enCours: ReadonlySet<string>, refus: ReadonlyMap<string, Refus> }} faire
 */
function carte(doc, choix, { choisir, enCours, refus }) {
  const pose = cree(doc, "section");
  pose.className = "choix";
  pose.dataset.choix = choix.id;
  const message = cree(doc, "h4", choix.message);
  message.className = "message";
  const cause = cree(doc, "p", choix.cause);
  cause.className = "cause";
  const issues = cree(doc, "ul");
  issues.className = "issues";
  const occupe = enCours.has(choix.id);
  issues.append(
    ...choix.options.map((option) => {
      const issue = cree(doc, "li");
      issue.className = "issue";
      issue.dataset.issue = option.id;
      const bouton = cree(doc, "button", option.label);
      bouton.type = "button";
      bouton.disabled = occupe;
      bouton.addEventListener("click", () => choisir(choix.id, option.id));
      const suite = cree(doc, "p", option.consequence);
      suite.className = "consequence";
      issue.append(bouton, suite);
      return issue;
    }),
  );
  pose.append(message, cause, issues);
  if (occupe) {
    const ligne = cree(doc, "p", EN_COURS);
    ligne.className = "etat-du-choix";
    pose.append(ligne);
  } else {
    const rate = refus.get(choix.id);
    if (rate !== undefined) {
      const ligne = cree(doc, "p");
      ligne.className = "refus-du-choix";
      ligne.append(cree(doc, "span", rate.refus));
      if (rate.detail !== undefined && rate.detail.trim() !== "") ligne.append(survol(doc, rate.detail));
      pose.append(ligne);
    }
  }
  return pose;
}

// Le titre de la section : ce qu'on attend du chef, en une phrase.
/** @param {string} projet @param {number} combien */
export const titreDesChoix = (projet, combien) => (combien === 1 ? `One choice waits for you on ${projet}` : `${combien} choices wait for you on ${projet}`);

// La section à poser sur la page du projet — sa phrase, puis une carte par choix qui attend le chef —, ou null : aucun.
/**
 * @param {Fabrique} doc
 * @param {{ projet: string, choix: readonly Choix[], choisis?: Readonly<Record<string, string>>, retenus?: ReadonlySet<string>, choisir?: (choix: string, issue: string) => void, enCours?: ReadonlySet<string>, refus?: ReadonlyMap<string, Refus> }} lu
 */
export function poserChoix(doc, { projet, choix, choisis = {}, retenus = new Set(), choisir = () => {}, enCours = new Set(), refus = new Map() }) {
  const attendus = choixEnAttente(choix, choisis, retenus);
  if (attendus.length === 0) return null;
  const pose = cree(doc, "div");
  pose.className = "choix-a-faire";
  pose.append(cree(doc, "h3", titreDesChoix(projet, attendus.length)), ...attendus.map((un) => carte(doc, un, { choisir, enCours, refus })));
  return pose;
}
