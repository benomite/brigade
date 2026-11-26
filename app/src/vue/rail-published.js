// @ts-check
// Pourquoi le rail d'un projet qu'aucune station connue ne sert ici ne se dessine pas encore (ticket 1435, épique 1427 ;
// ticket 2076). Le rail d'un projet est un seul : celui que ses issues, labels et PR disent sur GitHub (ticket 2061), TODO en tête (vue.js,
// `poserRail`), lu quelle que soit la station qui le sert. Tant qu'il ne l'est pas, le rail que sa station publie (ticket
// 1432) dit pourquoi, sans colonnes à lui : toujours une phrase en tête. Une connexion à GitHub qui manque est un bouton,
// le geste que le runtime nomme ; une lecture qui échoue dit sa raison en une phrase, son détail au survol, et le bouton
// de la page qui la lève quand le runtime en nomme une. Un rail publié dont le tableau ne se lit pas dit la raison du
// tableau, et quand ce rail a été publié, au survol.
// Ce module ne touche pas `document` : il reçoit de quoi créer un élément (briques.js), et rend des éléments.

import { buttonAction } from "./briques.js";
import { buttonDeLaPage, connectionDite, actions, phraseEtDetail, RELIRE } from "./first-launch.js";
import { READ_DE } from "./lexique.js";

/** @typedef {import("./briques.js").Fabrique} Fabrique */
/** @typedef {import("../facts.ts").RailDuProjectLu} RailDuProjectLu */

// Ce que la vue tient de l'onglet. `lu` : absent, sa lecture est en route. `connexion` : la connexion à GitHub
// lancée, comme au premier lancement. `nonLu` : pourquoi le tableau de la cuisine ne s'est pas lu, quand il a été lu.
/**
 * @typedef {{
 *   lu?: RailDuProjectLu,
 *   connexion?: import("./first-launch.js").StateDuFirst["connexion"],
 *   nonLu?: string,
 * }} StateDuRailPublished
 */
/**
 * @typedef {{
 *   relire: () => void,
 *   seConnecter: () => void,
 *   ouvrirLaPage: (url: string) => void,
 * }} ActionsDuRailPublished
 */

export const READ_PUBLIEE = READ_DE("the rail");
// Le rail publié se lit, son tableau pas encore : sa première lecture est en route.
/** @param {string} project */
export const TABLEAU_EN_READ = (project) => READ_DE(`${project} on GitHub`);
// Le rail publié se lit, son tableau non : la raison du tableau, telle que sa lecture l'a dite.
/** @param {string} raison */
export const TABLEAU_NON_LU = (raison) => `The rail is not drawn: ${raison}`;

// L'onglet entier, d'après ce que la vue tient : la phrase de tête, puis les gestes qui lèvent l'échec.
/** @param {Fabrique} doc @param {StateDuRailPublished} state @param {ActionsDuRailPublished} action @returns {any[]} */
export function poserRailPublished(doc, state, action) {
  const { lu } = state;
  /** @param {string} texte @param {string} [detail] */
  const enTete = (texte, detail) => {
    const tete = phraseEtDetail(doc, "h3", texte, detail);
    tete.className = "attendu";
    return tete;
  };
  const relire = () => actions(doc, [buttonAction(doc, RELIRE, action.relire)]);
  if (lu === undefined) return [enTete(READ_PUBLIEE)];
  if (lu.state === "sign-in-required") return [enTete(lu.reason), ...connectionDite(doc, state.connexion, lu.action.label, action)];
  if (lu.state === "unavailable") {
    const lien = lu.link;
    return [
      enTete(lu.reason, lu.detail),
      ...(lu.action === undefined ? [] : connectionDite(doc, state.connexion, lu.action.label, action)),
      actions(doc, [
        ...(lien === undefined ? [] : [buttonAction(doc, buttonDeLaPage(lien), () => action.ouvrirLaPage(lien), { recommande: lu.action === undefined })]),
        buttonAction(doc, RELIRE, action.relire, { recommande: lien === undefined && lu.action === undefined }),
      ]),
    ];
  }
  // Quand il a été publié pour la dernière fois, au survol — sans dire quelle station : le rail est celui du projet.
  const quand = new Date(lu.publishedAt).toISOString().slice(0, 16).replace("T", " ");
  const provenance = `last published at ${quand} UTC${lu.repository === null ? "" : `, for ${lu.repository}`}`;
  if (state.nonLu === undefined) return [enTete(TABLEAU_EN_READ(lu.project), provenance)];
  return [enTete(TABLEAU_NON_LU(state.nonLu), provenance), relire()];
}
