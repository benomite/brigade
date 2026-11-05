// @ts-check
// En tête du rail, à côté de l'histogramme des 24 heures (ticket 1836) : ce qui est avant le rail. Une petite barre
// empilée, une part par état — pas lue, refusée incomplète, épique, prête sans `fire`, mise de côté —, chacune de sa
// couleur et d'une longueur à la mesure de son compte. Le titre « Backlog » et le total sont à côté de la barre, dans la
// bande mince du haut du rail (tickets 2367, 2486) ; le survol dit chaque compte en mots. Un clic déplie la colonne
// Backlog, à gauche de « On the rail » ; un autre la replie. Tout est calculé par amont.ts : la vue pose.
// Ce module ne touche pas `document` : il reçoit de quoi créer un élément (briques.js), et rend un élément.

import { survol } from "./briques.js";

/** @typedef {import("./briques.js").Fabrique} Fabrique */
/** @typedef {import("../amont.ts").Vu} Vu */

// Chaque classe est posée en clair, `className = "…"` : la peau ne vise que des classes que la vue
// pose, et son test les lit ainsi (peau.test.ts).
/** @param {Fabrique} doc @param {string} balise */
const cree = (doc, balise) => doc.createElement(balise);

// La barre, ou rien tant que ce qui est avant le rail n'est pas lu, ou qu'un tableau frais ne le porte pas (ticket 1770).
// Une lecture ratée pose la barre vide, sans part : son survol dit pourquoi, et la colonne dépliée aussi — jamais
// « rien avant le rail ». `deplie` : la colonne Backlog est dépliée ; `basculer`, le clic qui la déplie ou la replie.
/** @param {Fabrique} doc @param {Vu | undefined} vu @param {{ deplie: boolean, basculer: () => void }} geste */
export function poserBarre(doc, vu, { deplie, basculer }) {
  if (vu === undefined || "nonPublie" in vu) return null;
  const barre = cree(doc, "button");
  barre.type = "button";
  barre.className = "avant-le-rail";
  barre.ariaExpanded = String(deplie);
  barre.addEventListener("click", basculer);
  const titre = cree(doc, "span");
  titre.className = "titre";
  titre.textContent = "Backlog";
  const piste = cree(doc, "span");
  piste.className = "piste";
  barre.append(titre, piste);
  if ("sans" in vu) {
    barre.dataset.sans = "";
    return survol(doc, vu.sans, barre);
  }
  if (vu.compte === 0) barre.dataset.vide = "";
  for (const { etat, issues } of vu.groupes) {
    const part = cree(doc, "span");
    part.className = "part";
    part.dataset.etat = etat;
    // Sa longueur : sa part du total — la barre a toujours la même largeur.
    part.style.setProperty("flex-grow", String(issues.length));
    piste.append(part);
  }
  // Le total en clair, « 12 issues » : la bande reste d'une ligne, chaque compte est au survol (ticket 2486).
  const comptes = cree(doc, "span");
  comptes.className = "comptes";
  comptes.textContent = vu.groupes.length === 0 ? "nothing before the rail" : vu.compte === 1 ? "1 issue" : `${vu.compte} issues`;
  barre.append(comptes);
  return survol(doc, vu.survol, barre);
}
