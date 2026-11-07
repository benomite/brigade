// @ts-check
// La bande du haut de l'onglet Rail (ticket 2486, épique 2484) : sur une seule ligne mince, le temps d'un ticket, les
// cooks en cours et le backlog — à la place de leurs blocs séparés. Le temps d'un ticket est la médiane et le p75, puis
// les quatre chiffres du projet contre leur seuil (tickets 2670, 2672), tels que la station les publie (resume.js), ce qui pèse le plus au survol ; les cooks en cours se comptent, leurs tickets au survol ; le
// backlog est la barre empilée qui déplie sa colonne, avec l'histogramme des 24 heures (avant-le-rail.js, cadence.js),
// que la vue pose et passe tels quels. Sous la bande, le rail prend toute la hauteur.
// Ce module ne touche pas `document` : il reçoit de quoi créer un élément (briques.js), et rend un élément.

import { survol } from "../../briques.js";
import { aUnDepassement, enMinutes, lireLeResume, lireLesChiffres, pesentLePlus, SANS_MESURE, SANS_MESURE_DETAIL, surCombien } from "../../temps-ticket/resume.js";

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

// Le temps d'un ticket : la médiane et le p75, sans plafond (la taille d'un ticket varie), puis les quatre chiffres du
// projet — le temps perdu, la cuisson contre l'estimation, le premier coup, les réparations de la base —, chacun avec sa
// valeur et son seuil tels que la station les publie (temps-ticket/resume.js, jamais recalculés) ; en rouge quand il passe
// son seuil. Ce qui pèse le plus est au survol de chaque chiffre. Jamais un blanc ni un zéro : sans mesure, la part le dit
// (« no measure yet »).
/** @param {Fabrique} doc @param {TempsDuProjet | undefined} temps */
export function tempsDeLaBande(doc, temps) {
  const lu = lireLeResume(temps);
  const chiffres = lireLesChiffres(temps);
  const pose = noeud(doc, "span", "bande-part bande-temps");
  if (lu === null && chiffres === null) {
    pose.dataset.temps = "vide";
    return part(doc, pose, "Ticket time", [noeud(doc, "span", "bande-doux", SANS_MESURE)], SANS_MESURE_DETAIL);
  }
  const dit = [];
  if (lu !== null) {
    const chiffre = (/** @type {string} */ legende, /** @type {number} */ minutes) => {
      const c = noeud(doc, "span", "bande-chiffre");
      c.append(noeud(doc, "span", "bande-doux", legende), noeud(doc, "strong", "bande-valeur", enMinutes(minutes)));
      return c;
    };
    dit.push(chiffre("median", lu.medianMin), noeud(doc, "span", "bande-doux", "/"), chiffre("p75", lu.p75Min));
  }
  for (const c of chiffres ?? []) {
    const un = noeud(doc, "span", "bande-chiffre");
    un.dataset.chiffre = c.cle;
    if (c.depasse) un.dataset.depasse = "oui";
    un.tabIndex = 0;
    un.append(noeud(doc, "span", "bande-doux", c.nom), noeud(doc, "strong", "bande-valeur", c.valeur), noeud(doc, "span", "bande-doux", `/ ${c.seuil}`));
    dit.push(noeud(doc, "span", "bande-doux", "·"), survol(doc, pesentLePlus(c), un));
  }
  pose.dataset.temps = aUnDepassement(chiffres) ? "depasse" : "normal";
  const detail =
    lu === null
      ? undefined
      : [
          `Median and p75 of ${surCombien(lu)}, from filing to merge.`,
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
