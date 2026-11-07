// @ts-check
// La bande du haut de l'onglet Rail (ticket 2486, épique 2484) : sur une seule ligne mince, le temps d'un ticket, les
// cooks en cours et le backlog — à la place de leurs blocs séparés. Le temps d'un ticket est la médiane et le p75, puis
// le temps perdu contre son seuil (ticket 2670), tels que la mesure les résume (resume.js), son détail au survol ; les cooks en cours se comptent, leurs tickets au survol ; le
// backlog est la barre empilée qui déplie sa colonne, avec l'histogramme des 24 heures (avant-le-rail.js, cadence.js),
// que la vue pose et passe tels quels. Sous la bande, le rail prend toute la hauteur.
// Ce module ne touche pas `document` : il reçoit de quoi créer un élément (briques.js), et rend un élément.

import { survol } from "../../briques.js";
import { depasse, enMinutes, estDepasse, lireLeResume, SANS_MESURE, SANS_MESURE_DETAIL, surCombien } from "../../temps-ticket/resume.js";

/** @typedef {import("../../briques.js").Fabrique} Fabrique */
/** @typedef {import("../../temps-ticket/temps-ticket.js").TempsDuProjet} TempsDuProjet */
/** @typedef {{ nombre: number, tickets: string[] }} CooksEnCours */

/**
 * @param {Fabrique} doc
 * @param {string} balise
 * @param {string} classe
 * @param {string} [texte]
 */
function noeud(doc, balise, classe, texte) {
  const n = doc.createElement(balise);
  n.className = classe;
  if (texte !== undefined) n.textContent = texte;
  return n;
}

// Une part de la bande : son titre, à voix basse, puis ce qu'elle dit. Son détail, s'il en a un, est au survol de la part
// entière, qui prend le clavier pour le dire. Chaque classe est écrite en clair : la peau ne vise que celles-là (peau.test.ts).
/** @param {Fabrique} doc @param {any} pose @param {string} titre @param {any[]} dit @param {string} [detail] */
function part(doc, pose, titre, dit, detail) {
  pose.append(noeud(doc, "span", "bande-titre", titre), ...dit);
  if (detail === undefined) return pose;
  pose.tabIndex = 0;
  return survol(doc, detail, pose);
}

// Le temps d'un ticket : la médiane et le p75, sans plafond (la taille d'un ticket varie), puis le temps perdu médian
// contre son seuil (« lost 3 min vs 2 min max »), tels que la mesure les résume (temps-ticket/resume.js, jamais
// recalculés) ; le temps perdu en rouge quand il passe le seuil, avec « lost time over the max ». La perte la plus
// lourde et la phase la plus longue sont au survol. Jamais un blanc ni un zéro : sans mesure, la part le dit (« no measure yet »).
/** @param {Fabrique} doc @param {TempsDuProjet | undefined} temps */
export function tempsDeLaBande(doc, temps) {
  const lu = lireLeResume(temps);
  const pose = noeud(doc, "span", "bande-part bande-temps");
  if (lu === null) {
    pose.dataset.temps = "vide";
    return part(doc, pose, "Ticket time", [noeud(doc, "span", "bande-doux", SANS_MESURE)], SANS_MESURE_DETAIL);
  }
  const trop = depasse(lu);
  const chiffre = (/** @type {string} */ legende, /** @type {number} */ minutes, /** @type {boolean} */ passe) => {
    const c = noeud(doc, "span", "bande-chiffre");
    if (passe) c.dataset.depasse = "oui";
    c.append(noeud(doc, "span", "bande-doux", legende), noeud(doc, "strong", "bande-valeur", enMinutes(minutes)));
    return c;
  };
  const dit = [
    chiffre("median", lu.medianMin, false),
    noeud(doc, "span", "bande-doux", "/"),
    chiffre("p75", lu.p75Min, false),
    noeud(doc, "span", "bande-doux", "·"),
    chiffre("lost", lu.perduMedianMin, trop.perdu),
    noeud(doc, "span", "bande-doux", `vs ${enMinutes(lu.lostTimeMaxMin)} max`),
  ];
  if (estDepasse(lu)) dit.push(noeud(doc, "span", "bande-depasse", "lost time over the max"));
  pose.dataset.temps = estDepasse(lu) ? "depasse" : "normal";
  const detail = [
    `Median and p75 of ${surCombien(lu)}, from filing to merge.`,
    `Lost time (waiting for a claim, failed cooks, send-backs): median ${enMinutes(lu.perduMedianMin)}, against the max of ${enMinutes(lu.lostTimeMaxMin)}.`,
    lu.perteLaPlusLourde === null ? "" : `Heaviest loss: ${lu.perteLaPlusLourde.nom}, median ${enMinutes(lu.perteLaPlusLourde.medianMin)}.`,
    lu.phaseLaPlusLongue === null ? "" : `Slowest phase: ${lu.phaseLaPlusLongue.nom}, median ${enMinutes(lu.phaseLaPlusLongue.medianMin)}.`,
  ]
    .filter((phrase) => phrase !== "")
    .join(" ");
  return part(doc, pose, "Ticket time", dit, detail);
}

// Les cooks en cours : leur nombre ; leurs tickets au survol, quand la lecture les nomme.
/** @param {Fabrique} doc @param {CooksEnCours} cooks */
export function cooksDeLaBande(doc, { nombre, tickets }) {
  const valeur = nombre === 0 ? noeud(doc, "span", "bande-doux", "none running") : noeud(doc, "strong", "bande-valeur", String(nombre));
  const dit = nombre === 0 ? [valeur] : [valeur, noeud(doc, "span", "bande-doux", "running")];
  const detail = nombre === 0 ? undefined : tickets.length > 0 ? tickets.join(" · ") : nombre === 1 ? "one cook, on the ticket in Taken" : "one cook per ticket in Taken";
  return part(doc, noeud(doc, "span", "bande-part bande-cooks"), "Cooks", dit, detail);
}

// La bande entière. `cooks` et `backlog` n'y sont que quand le rail est lu : sans lecture, la bande ne dit que le temps
// d'un ticket. `apres` : ce qui se pose au bout de la ligne — l'âge du rail montré.
/**
 * @param {Fabrique} doc
 * @param {{ temps: TempsDuProjet | undefined, cooks?: CooksEnCours, backlog?: any, apres?: any[] }} lu
 */
export function poserBandeRail(doc, { temps, cooks, backlog, apres = [] }) {
  const bande = noeud(doc, "div", "bande-rail");
  bande.role = "group";
  bande.ariaLabel = "Ticket time, cooks running and backlog";
  bande.append(tempsDeLaBande(doc, temps));
  if (cooks !== undefined) bande.append(cooksDeLaBande(doc, cooks));
  if (backlog !== undefined) bande.append(backlog);
  bande.append(...apres);
  return bande;
}
