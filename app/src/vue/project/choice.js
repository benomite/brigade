// @ts-check
// Ce qui manque à la station pour les tests d'un projet, sur sa page (ticket 1400, épique 1393) : une carte par
// besoin que sa principale publie en attente (ticket 1398, `choix` du suivi) — ce qui manque en une phrase,
// pourquoi dessous, et ses issues, chacune un bouton avec ce qui en suit sous lui : le cuire sur une station qui
// l'a, le fournir sur celle-ci, adapter les tests. Deux besoins, deux cartes. Un clic retient l'issue ; la carte
// part dès qu'elle est écrite. Aucun choix en attente, aucune carte. La carte dit ce que le blocage du besoin
// disait (même clé, `need:<besoin>`) : la ligne du blocage ne se répète pas dessous. Ce module ne connaît aucun
// besoin ni aucune issue : il montre ceux que la station publie. Il ne touche pas `document` (briques.js).

import { survol } from "../briques.js";
import { button as buttonDeLaFamille, sorteDuButton } from "../composants/button/button.js";
import { lineError } from "../composants/line-error/line-error.js";

/** @typedef {import("../briques.js").Fabrique} Fabrique */
/** @typedef {import("../../projects/request.ts").Choice} Choice */
/** @typedef {import("../../projects/request.ts").Blockage} Blockage */
// Pourquoi une issue n'a pas été retenue, en une ligne, et ce que GitHub a dit au survol.
/** @typedef {{ refus: string, detail?: string }} Refusal */

export const RECOMMANDE = "recommended";
export const EN_COURS = "recording your choice…";

/** @param {Fabrique} doc @param {string} balise @param {string} [texte] */
function cree(doc, balise, texte) {
  const pose = doc.createElement(balise);
  if (texte !== undefined) pose.textContent = texte;
  return pose;
}

// Les choix qui attendent le chef : ceux que la station publie en attente, moins ceux dont l'app a déjà écrit une
// issue que la station offre — elle ne l'a pas encore lue — et ceux que la vue vient de retenir.
/** @param {readonly Choice[]} choice @param {Readonly<Record<string, string>>} [choisis] @param {ReadonlySet<string>} [retenus] */
export function choiceQueued(choice, choisis = {}, retenus = new Set()) {
  return choice.filter(({ id, status, options }) => status === "pending" && !retenus.has(id) && !options.some((option) => option.id === choisis[id]));
}

// Les blocages que la page montre en lignes : ceux qu'aucun choix ne dit déjà — un besoin a sa carte tant qu'il
// attend, et une fois tranché, son blocage se lève à la lecture suivante de la station.
/** @param {readonly Blockage[]} blockages @param {readonly Choice[]} choice @param {Readonly<Record<string, string>>} [choisis] @param {ReadonlySet<string>} [retenus] */
export function sansLesChoice(blockages, choice, choisis = {}, retenus = new Set()) {
  const dits = new Set([...choice.map(({ id }) => id), ...Object.keys(choisis), ...retenus]);
  return blockages.filter(({ id }) => !dits.has(id));
}

/**
 * @param {Fabrique} doc @param {Choice} choice
 * @param {{ choisir: (choice: string, issue: string) => void, enCours: ReadonlySet<string>, refus: ReadonlyMap<string, Refusal> }} faire
 */
function card(doc, choice, { choisir, enCours, refus: refusal }) {
  const pose = cree(doc, "section");
  pose.className = "choix";
  pose.dataset.choix = choice.id;
  const message = cree(doc, "h4", choice.message);
  message.className = "message";
  const cause = cree(doc, "p", choice.cause);
  cause.className = "cause";
  const issues = cree(doc, "ul");
  issues.className = "issues";
  const occupe = enCours.has(choice.id);
  issues.append(
    ...choice.options.map((option) => {
      const issue = cree(doc, "li");
      issue.className = "issue";
      issue.dataset.issue = option.id;
      // Une issue tient sur une ligne, coupée, entière au survol : le bouton garde ses 32 px dans une colonne étroite.
      const button = buttonDeLaFamille(doc, option.label, undefined, { coupe: true });
      button.disabled = occupe;
      button.addEventListener("click", () => choisir(choice.id, option.id));
      const suite = cree(doc, "p", option.consequence);
      suite.className = "consequence";
      // L'issue que la station conseille se distingue des autres, et le dit ; sans son drapeau, rien.
      if (option.recommended === true) {
        sorteDuButton(button, "recommande");
        const marque = cree(doc, "span", RECOMMANDE);
        marque.className = "marque-recommande";
        issue.append(button, marque, suite);
      } else issue.append(button, suite);
      return issue;
    }),
  );
  pose.append(message, cause, issues);
  if (occupe) {
    const line = cree(doc, "p", EN_COURS);
    line.className = "etat-du-choix";
    pose.append(line);
  } else {
    const rate = refusal.get(choice.id);
    if (rate !== undefined) {
      pose.append(lineError(doc, rate.refus, rate.detail, { classe: "refus-du-choix" }));
    }
  }
  return pose;
}

// Le titre de la section : ce qu'on attend du chef, en une phrase.
/** @param {string} project @param {number} combien */
export const titreDesChoice = (project, combien) => (combien === 1 ? `One choice waits for you on ${project}` : `${combien} choices wait for you on ${project}`);

// La section à poser sur la page du projet — sa phrase, puis une carte par choix qui attend le chef —, ou null : aucun.
/**
 * @param {Fabrique} doc
 * @param {{ projet: string, choix: readonly Choice[], choisis?: Readonly<Record<string, string>>, retenus?: ReadonlySet<string>, choisir?: (choice: string, issue: string) => void, enCours?: ReadonlySet<string>, refus?: ReadonlyMap<string, Refusal> }} lu
 */
export function poserChoice(doc, { projet: project, choix: choice, choisis = {}, retenus = new Set(), choisir = () => {}, enCours = new Set(), refus: refusal = new Map() }) {
  const attendus = choiceQueued(choice, choisis, retenus);
  if (attendus.length === 0) return null;
  const pose = cree(doc, "div");
  pose.className = "choix-a-faire";
  pose.append(cree(doc, "h3", titreDesChoice(project, attendus.length)), ...attendus.map((un) => card(doc, un, { choisir, enCours, refus: refusal })));
  return pose;
}
