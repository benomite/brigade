// @ts-check
// En tête de l'onglet Cooks (ticket 1272) : ce que la cuisine du projet a fait de ses tickets — combien elle en a
// servis, renvoyés à un cook, remontés au chef —, dans la dernière heure et dans le dernier jour. Six nombres, dans
// un tableau de deux lignes : une fenêtre se lit contre l'autre d'un coup d'œil. Sans activité, six « 0 », jamais un
// blanc. Les comptes viennent de `facts` (faits.ts) : la vue les pose, elle n'en calcule aucun.
// Ce module ne touche pas `document` : il reçoit de quoi créer un élément (briques.js), et rend un élément.

import { survol } from "./briques.js";

/** @typedef {import("./briques.js").Fabrique} Fabrique */
/** @typedef {import("../faits.ts").ActiviteCuisine} ActiviteCuisine */
/** @typedef {import("../faits.ts").ComptesDeCuisine} Comptes */

export const TITRE = "tickets, last hour and last day";
// Les trois comptes, dans l'ordre des colonnes : leur libellé, et ce qu'il compte — au survol de la tête.
/** @type {ReadonlyArray<{ cle: keyof Comptes, libelle: string, dit: string }>} */
export const COMPTES = [
  { cle: "served", libelle: "served", dit: "merged, or served without a diff" },
  { cle: "sentBack", libelle: "sent back", dit: "handed back to a cook, by the pass, the manager or you" },
  { cle: "escalated", libelle: "escalated", dit: "taken up to you by the pass: returns exhausted, the manager's choice, or a delivery it could not judge" },
];
// Les deux fenêtres, dans l'ordre des lignes.
/** @type {ReadonlyArray<{ cle: keyof ActiviteCuisine, libelle: string }>} */
export const FENETRES = [
  { cle: "lastHour", libelle: "last hour" },
  { cle: "lastDay", libelle: "last day" },
];
const AIDE = `Counted in tickets: one sent back twice in the hour counts once. ${COMPTES.map(({ libelle, dit }) => `${libelle[0]?.toUpperCase()}${libelle.slice(1)}: ${dit}.`).join(" ")} Only this project's tickets count.`;

// Chaque classe est posée en clair, `className = "…"` : la peau ne vise que des classes que la vue
// pose, et son test les lit ainsi (peau.test.ts).
/** @param {Fabrique} doc @param {string} balise @param {string} [texte] */
function cree(doc, balise, texte) {
  const pose = doc.createElement(balise);
  if (texte !== undefined) pose.textContent = texte;
  return pose;
}

// Les six nombres de la cuisine du projet, ou rien d'un runtime qui ne les donne pas.
/** @param {Fabrique} doc @param {ActiviteCuisine | undefined} activite */
export function poserLActivite(doc, activite) {
  if (activite === undefined) return null;
  const section = cree(doc, "section");
  section.className = "activite-cuisine";
  section.ariaLabel = TITRE;
  const tete = cree(doc, "h4", TITRE);
  tete.append(survol(doc, AIDE));
  const tableau = cree(doc, "table");
  const colonnes = cree(doc, "tr");
  colonnes.append(cree(doc, "td"), ...COMPTES.map(({ libelle }) => {
    const colonne = cree(doc, "th", libelle);
    colonne.scope = "col";
    return colonne;
  }));
  const lignes = FENETRES.map(({ cle, libelle }) => {
    const ligne = cree(doc, "tr");
    ligne.dataset.fenetre = cle;
    const nom = cree(doc, "th", libelle);
    nom.scope = "row";
    ligne.append(nom, ...COMPTES.map((compte) => {
      const chiffre = cree(doc, "td", String(activite[cle][compte.cle]));
      chiffre.className = "chiffre";
      return chiffre;
    }));
    return ligne;
  });
  const entete = cree(doc, "thead");
  entete.append(colonnes);
  const corps = cree(doc, "tbody");
  corps.append(...lignes);
  tableau.append(entete, corps);
  section.append(tete, tableau);
  return section;
}
