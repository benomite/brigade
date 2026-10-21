// @ts-check
// Sur la file, en tête (ticket 1283, épique 1277) : ce que le triage a fait chaque jour — les cartes qu'il a
// tranchées seul, et celles qu'il a laissées entrer dans TODO —, le jour le plus récent d'abord, pour comparer
// un jour au suivant d'un coup d'œil. Un jour sans issue dit « 0 » et « 0 », jamais un blanc.
// Tout est lu par le process principal (triage.ts) : la vue pose.
// Ce module ne touche pas `document` : il reçoit de quoi créer un élément (briques.js), et rend un élément.

import { survol } from "./briques.js";

/** @typedef {import("./briques.js").Fabrique} Fabrique */
/** @typedef {import("../triage.ts").JourDeTriage} JourDeTriage */

export const TITRE = "triage, day by day";
export const SEUL = "decided alone";
export const VERS_TODO = "sent to TODO";
const AIDE = "per day (UTC): the cards the triage settled itself, one of its five actions done, and the cards it let into TODO for you. A card the gate sends back to it counts for neither.";

// Chaque classe est posée en clair, `className = "…"` : la peau ne vise que des classes que la vue
// pose, et son test les lit ainsi (peau.test.ts).
/** @param {Fabrique} doc @param {string} balise @param {string} [texte] */
function cree(doc, balise, texte) {
  const pose = doc.createElement(balise);
  if (texte !== undefined) pose.textContent = texte;
  return pose;
}

// Un compte : son libellé, et son nombre.
/** @param {Fabrique} doc @param {string} libelle @param {number} nombre */
function compte(doc, libelle, nombre) {
  const pose = cree(doc, "span");
  pose.className = "compte-triage";
  const chiffre = cree(doc, "strong", String(nombre));
  chiffre.className = "chiffre";
  pose.append(chiffre, cree(doc, "span", libelle));
  return pose;
}

// Les jours du triage, une ligne chacun. Rien n'est posé sans jours.
/** @param {Fabrique} doc @param {JourDeTriage[] | undefined} jours */
export function poserTriage(doc, jours) {
  if (jours === undefined || jours.length === 0) return [];
  const section = cree(doc, "section");
  section.className = "triage";
  section.ariaLabel = TITRE;
  const tete = cree(doc, "h4", TITRE);
  tete.append(survol(doc, AIDE));
  const liste = cree(doc, "ol");
  for (const { jour, date, decidedAlone, sentToTodo } of jours) {
    const ligne = cree(doc, "li");
    ligne.dataset.jour = date;
    const nom = cree(doc, "span", jour);
    nom.className = "jour-triage";
    nom.title = date;
    ligne.append(nom, compte(doc, SEUL, decidedAlone), compte(doc, VERS_TODO, sentToTodo));
    liste.append(ligne);
  }
  section.append(tete, liste);
  return [section];
}
