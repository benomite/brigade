// @ts-check
// Pourquoi le rail d'un projet qu'aucune station connue ne sert ici ne se dessine pas encore (ticket 1435, épique 1427 ;
// ticket 2076). Le rail d'un projet est un seul : celui que ses issues, labels et PR disent sur GitHub (ticket 2061), TODO en tête (vue.js,
// `poserRail`), lu quelle que soit la station qui le sert. Tant qu'il ne l'est pas, le rail que sa station publie (ticket
// 1432) dit pourquoi, sans colonnes à lui : toujours une phrase en tête. Une connexion à GitHub qui manque est un bouton,
// le geste que le runtime nomme ; une lecture qui échoue dit sa raison en une phrase, son détail au survol, et le bouton
// de la page qui la lève quand le runtime en nomme une. Un rail publié dont le tableau ne se lit pas dit la raison du
// tableau, et quand ce rail a été publié, au survol.
// Ce module ne touche pas `document` : il reçoit de quoi créer un élément (bricks.js), et rend des éléments.

import { buttonAction } from "./bricks.js";
import { buttonOfThePage, connectionSaid, actions, sentenceAndDetail, REREAD } from "./first-launch.js";
import { READ_OF } from "./lexicon.js";

/** @typedef {import("./bricks.js").Fabrique} Fabrique */
/** @typedef {import("../facts.ts").RailOfProjectRead} RailOfProjectRead */

// Ce que la vue tient de l'onglet. `lu` : absent, sa lecture est en route. `connexion` : la connexion à GitHub
// lancée, comme au premier lancement. `nonLu` : pourquoi le tableau de la cuisine ne s'est pas lu, quand il a été lu.
/**
 * @typedef {{
 *   lu?: RailOfProjectRead,
 *   connexion?: import("./first-launch.js").StateOfFirst["connexion"],
 *   nonLu?: string,
 * }} StateOfRailPublished
 */
/**
 * @typedef {{
 *   relire: () => void,
 *   seConnecter: () => void,
 *   ouvrirLaPage: (url: string) => void,
 * }} ActionsOfRailPublished
 */

export const READ_PUBLISHED = READ_OF("the rail");
// Le rail publié se lit, son tableau pas encore : sa première lecture est en route.
/** @param {string} project */
export const BOARD_IN_READ = (project) => READ_OF(`${project} on GitHub`);
// Le rail publié se lit, son tableau non : la raison du tableau, telle que sa lecture l'a dite.
/** @param {string} reason */
export const BOARD_NOT_READ = (reason) => `The rail is not drawn: ${reason}`;

// L'onglet entier, d'après ce que la vue tient : la phrase de tête, puis les gestes qui lèvent l'échec.
/** @param {Fabrique} doc @param {StateOfRailPublished} state @param {ActionsOfRailPublished} action @returns {any[]} */
export function setRailPublished(doc, state, action) {
  const { lu: readOne } = state;
  /** @param {string} text @param {string} [detail] */
  const inHead = (text, detail) => {
    const head = sentenceAndDetail(doc, "h3", text, detail);
    head.className = "attendu";
    return head;
  };
  const reread = () => actions(doc, [buttonAction(doc, REREAD, action.relire)]);
  if (readOne === undefined) return [inHead(READ_PUBLISHED)];
  if (readOne.state === "sign-in-required") return [inHead(readOne.reason), ...connectionSaid(doc, state.connexion, readOne.action.label, action)];
  if (readOne.state === "unavailable") {
    const link = readOne.link;
    return [
      inHead(readOne.reason, readOne.detail),
      ...(readOne.action === undefined ? [] : connectionSaid(doc, state.connexion, readOne.action.label, action)),
      actions(doc, [
        ...(link === undefined ? [] : [buttonAction(doc, buttonOfThePage(link), () => action.ouvrirLaPage(link), { recommande: readOne.action === undefined })]),
        buttonAction(doc, REREAD, action.relire, { recommande: link === undefined && readOne.action === undefined }),
      ]),
    ];
  }
  // Quand il a été publié pour la dernière fois, au survol — sans dire quelle station : le rail est celui du projet.
  const when = new Date(readOne.publishedAt).toISOString().slice(0, 16).replace("T", " ");
  const origin = `last published at ${when} UTC${readOne.repository === null ? "" : `, for ${readOne.repository}`}`;
  if (state.nonLu === undefined) return [inHead(BOARD_IN_READ(readOne.project), origin)];
  return [inHead(BOARD_NOT_READ(state.nonLu), origin), reread()];
}
