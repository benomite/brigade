// @ts-check
// Pourquoi le rail d'un projet qu'aucune station connue ne sert ici ne se dessine pas encore (ticket 1435, épique 1427 ;
// ticket 2076). Le rail d'un projet est un seul : celui de son tableau de cuisine sur GitHub, TODO en tête (vue.js,
// `poserRail`), lu quelle que soit la station qui le sert. Tant qu'il ne l'est pas, le rail que sa station publie (ticket
// 1432) dit pourquoi, sans colonnes à lui : toujours une phrase en tête. Une connexion à GitHub qui manque est un bouton,
// le geste que le runtime nomme ; une lecture qui échoue dit sa raison en une phrase, son détail au survol, et le bouton
// de la page qui la lève quand le runtime en nomme une. Un rail publié dont le tableau ne se lit pas dit la raison du
// tableau, et quand ce rail a été publié, au survol.
// Ce module ne touche pas `document` : il reçoit de quoi créer un élément (briques.js), et rend des éléments.

import { boutonAction } from "./briques.js";
import { boutonDeLaPage, connexionDite, gestes, phraseEtDetail, RELIRE } from "./premier-lancement.js";

/** @typedef {import("./briques.js").Fabrique} Fabrique */
/** @typedef {import("../faits.ts").RailDuProjetLu} RailDuProjetLu */

// Ce que la vue tient de l'onglet. `lu` : absent, sa lecture est en route. `connexion` : la connexion à GitHub
// lancée, comme au premier lancement. `nonLu` : pourquoi le tableau de la cuisine ne s'est pas lu, quand il a été lu.
/**
 * @typedef {{
 *   lu?: RailDuProjetLu,
 *   connexion?: import("./premier-lancement.js").EtatDuPremier["connexion"],
 *   nonLu?: string,
 * }} EtatDuRailPublie
 */
/**
 * @typedef {{
 *   relire: () => void,
 *   seConnecter: () => void,
 *   ouvrirLaPage: (url: string) => void,
 * }} GestesDuRailPublie
 */

export const LECTURE_PUBLIEE = "Reading the rail…";
// Le rail publié se lit, son tableau pas encore : sa première lecture est en route.
/** @param {string} projet */
export const TABLEAU_EN_LECTURE = (projet) => `Reading the Kitchen board of ${projet}…`;
// Le rail publié se lit, son tableau non : la raison du tableau, telle que sa lecture l'a dite.
/** @param {string} raison */
export const TABLEAU_NON_LU = (raison) => `The rail is not drawn: ${raison}`;

// L'onglet entier, d'après ce que la vue tient : la phrase de tête, puis les gestes qui lèvent l'échec.
/** @param {Fabrique} doc @param {EtatDuRailPublie} etat @param {GestesDuRailPublie} geste @returns {any[]} */
export function poserRailPublie(doc, etat, geste) {
  const { lu } = etat;
  /** @param {string} texte @param {string} [detail] */
  const enTete = (texte, detail) => {
    const tete = phraseEtDetail(doc, "h3", texte, detail);
    tete.className = "attendu";
    return tete;
  };
  const relire = () => gestes(doc, [boutonAction(doc, RELIRE, geste.relire)]);
  if (lu === undefined) return [enTete(LECTURE_PUBLIEE)];
  if (lu.state === "sign-in-required") return [enTete(lu.reason), ...connexionDite(doc, etat.connexion, lu.action.label, geste)];
  if (lu.state === "unavailable") {
    const lien = lu.link;
    return [
      enTete(lu.reason, lu.detail),
      ...(lu.action === undefined ? [] : connexionDite(doc, etat.connexion, lu.action.label, geste)),
      gestes(doc, [
        ...(lien === undefined ? [] : [boutonAction(doc, boutonDeLaPage(lien), () => geste.ouvrirLaPage(lien), { recommande: lu.action === undefined })]),
        boutonAction(doc, RELIRE, geste.relire, { recommande: lien === undefined && lu.action === undefined }),
      ]),
    ];
  }
  // Quand il a été publié pour la dernière fois, au survol — sans dire quelle station : le rail est celui du projet.
  const quand = new Date(lu.publishedAt).toISOString().slice(0, 16).replace("T", " ");
  const provenance = `last published at ${quand} UTC${lu.repository === null ? "" : `, for ${lu.repository}`}`;
  if (etat.nonLu === undefined) return [enTete(TABLEAU_EN_LECTURE(lu.project), provenance)];
  return [enTete(TABLEAU_NON_LU(etat.nonLu), provenance), relire()];
}
