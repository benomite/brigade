// @ts-check
// La bande du haut de l'onglet Rail (ticket 2486, épique 2484) : sur une seule ligne mince, le temps d'un ticket, les
// cooks en cours et le backlog — à la place de leurs blocs séparés. Le temps d'un ticket est la médiane des derniers
// tickets mesurés (temps-ticket.js), son détail au survol ; les cooks en cours se comptent, leurs tickets au survol ; le
// backlog est la barre empilée qui déplie sa colonne, avec l'histogramme des 24 heures (avant-le-rail.js, cadence.js),
// que la vue pose et passe tels quels. Sous la bande, le rail prend toute la hauteur.
// Ce module ne touche pas `document` : il reçoit de quoi créer un élément (briques.js), et rend un élément.

import { survol } from "../../briques.js";
import { dureeEnClair, NOMBRE_DE_TICKETS, synthese } from "../../temps-ticket/temps-ticket.js";

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

// Le temps d'un ticket : la médiane en clair et le plafond ; passé le plafond, il le dit en toutes lettres, pas
// seulement par la couleur. Le plus lent et les cinq phases sont au survol. Jamais un blanc ni un zéro : une station qui
// ne publie pas ses temps le dit, comme un projet sans ticket mesuré.
/** @param {Fabrique} doc @param {TempsDuProjet | undefined} temps */
export function tempsDeLaBande(doc, temps) {
  const lu = synthese(temps ?? { enregistrements: [] });
  if (temps === undefined || lu === null) {
    const pose = noeud(doc, "span", "bande-part bande-temps");
    pose.dataset.temps = "vide";
    return part(
      doc,
      pose,
      "Ticket time",
      [noeud(doc, "span", "bande-doux", temps === undefined ? "not available yet" : "no ticket measured yet")],
      temps === undefined
        ? "The project's station does not publish its ticket times yet: this is not a count of zero tickets"
        : `The time appears once a ticket is merged: the median of the last ${NOMBRE_DE_TICKETS} measured tickets, from claim to merge`,
    );
  }
  const valeur = noeud(doc, "strong", "bande-valeur", dureeEnClair(lu.mediane));
  const plafond = lu.depasse ? noeud(doc, "span", "bande-depasse", `over the max of ${lu.max} min`) : noeud(doc, "span", "bande-doux", `median · max ${lu.max} min`);
  const detail = [
    lu.nombre === 1 ? "The only measured ticket, from claim to merge." : `Median of the last ${lu.nombre} tickets, from claim to merge.`,
    `Slowest: #${lu.plusLent.ticket} — ${dureeEnClair(lu.plusLent.total)}.`,
    lu.phases.map(({ cle, libelle, duree }) => `${libelle} ${dureeEnClair(duree)}${cle === "cuisson" ? ` (its tests ${dureeEnClair(lu.testsMedians)})` : ""}`).join(" · "),
  ].join(" ");
  const pose = noeud(doc, "span", "bande-part bande-temps");
  pose.dataset.temps = lu.depasse ? "depasse" : "normal";
  return part(doc, pose, "Ticket time", [valeur, plafond], detail);
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
