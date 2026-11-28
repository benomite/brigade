// @ts-check
// Ce que les stations d'un projet font tourner, et la ligne d'alerte de Rail (ticket 1185).
//   - Les cooks en cours d'une station, une ligne chacun — et, avant eux, ce qu'elle fait tourner à côté (ticket 1971) : la
//     pass qui juge une livraison, le manager qui juge ou découpe une issue, le triage, le closer qui nettoie le projet —,
//     sur la carte de chaque station de l'onglet Stations (stations-tab/, ticket 3195).
//   - Dans « Details » de la carte d'une station, le plafond du projet sur elle comme sa box le dit (ticket 1292), et en une
//     phrase ce qui la sature quand elle l'est.
//   - Sur l'onglet Rail, la ligne qui dit ce qui, du côté des cooks, demande un geste au chef — une station saturée, un
//     projet refusé, l'accès au dépôt bloqué — avec de quoi ouvrir l'onglet Stations. Une seule ligne, quel que soit le
//     nombre de causes ; aucune quand rien ne le demande.
// Ce module ne touche pas `document` : il reçoit de quoi créer un élément (bricks.js).

import { button } from "./components/button/button.js";

/** @typedef {import("./bricks.js").Fabrique} Fabrique */
/** @typedef {import("../projects/request.ts").AccessBlocked} Access */
/** @typedef {import("../projects/request.ts").Refusal} Refusal */
/** @typedef {import("../projects/request.ts").FailureOfClone} Clone */

export const OPEN_COOKS = "open Cooks";

/** @param {Fabrique} doc @param {string} balise @param {string} [text] */
function created(doc, balise, text) {
  const pose = doc.createElement(balise);
  if (text !== undefined) pose.textContent = text;
  return pose;
}



// Le détail de git, que la raison d'un accès bloqué porte entre parenthèses à sa fin : au survol (repository-held.js).
const DETAIL_OF_GIT = /\s*\(git: ([^)]*)\)\.?$/;

// La ligne d'alerte de l'onglet Rail, ou null : rien, du côté des cooks, ne demande un geste au chef.
// `refusee` : l'une d'elles y dit déjà un refus ;
// `acces`, `refus` : ce que la station du projet publie de l'accès au dépôt et de son refus (projets/demande.ts).
// Plusieurs causes tiennent sur la même ligne, la plus urgente d'abord : l'accès, que seul le chef lève.
// `clone` : le clone du dépôt en échec (ticket 1390) — sa cause dit plus que le refus qui l'accompagne, et le remplace.
/**
 * @param {Fabrique} doc
 * @param {{ refusee: boolean, acces: Access | null, clone?: Clone | null, refus: Refusal | null, ouvrir: () => void }} options
 */
export function lineOfAlert(doc, { refusee: refused, acces: access, clone = null, refus: refusal, ouvrir: open }) {
  const causes = [
    ...(access === null ? [] : [access.raison.replace(DETAIL_OF_GIT, "").replace(/\.$/, "")]),
    ...(access !== null || clone === null ? [] : [clone.raison.replace(/\.$/, "")]),
    ...(refusal === null || refused || clone !== null ? [] : [refusal.message.replace(/\.$/, "")]),
  ];
  if (causes.length === 0) return null;
  const pose = created(doc, "p");
  pose.className = "alerte-de-cuisine";
  pose.role = "alert";
  const said = created(doc, "span", `${causes.join(" · ")}.`);
  const link = button(doc, OPEN_COOKS, open);
  link.className = "lien";
  pose.append(said, link);
  return pose;
}
