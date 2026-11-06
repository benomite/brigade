// @ts-check
// Le bloc « Projects » de l'accueil (ticket 2639, épique 2497) : une ligne par projet, qui dit d'un coup d'œil où il en
// est — il cuit, il attend le chef, il est retenu, il est au repos — et les stations qui le cuisinent ; tout un clic
// l'ouvre. Sous la liste, « Add a project » lance le parcours d'ajout unique (parcours-projet/, épique 2473) : ce
// bloc ne le refait pas, il appelle son point d'entrée (`ajouter`). Une liste vide se dit en une ligne, et le bouton
// reste ; un projet sans station le dit.
//
// Ce module ne touche pas `document` : la vue lui donne une fabrique (briques.js), les tests un faux.

import { boutonAction } from "../../briques.js";

/** @typedef {import("../../briques.js").Fabrique} Fabrique */
/** @typedef {"cooking" | "waiting" | "held" | "idle"} EtatDeProjet */
/** @typedef {{ nom: string, etat: EtatDeProjet, stations: string[], survol?: string }} ProjetDuBloc */
/** @typedef {{ ouvrir(nom: string): void, ajouter(): void, pastille?(dit: string, ton: string): any }} GestesDuBloc */

// Les quatre états, dans les mots de l'app, avec le ton de leur pastille (vue.css) : le chef attendu est jaune, un
// projet retenu rouge, celui qui cuit vert, celui au repos gris.
/** @type {Record<EtatDeProjet, { dit: string, ton: string }>} */
export const ETATS = {
  cooking: { dit: "cooking", ton: "vert" },
  waiting: { dit: "waiting for the chef", ton: "jaune" },
  held: { dit: "held", ton: "rouge" },
  idle: { dit: "idle", ton: "gris" },
};
// L'état d'un projet, d'après la ligne que l'accueil en dit (accueil.ts) : rouge, il est retenu ; jaune, il attend le chef ;
// vert, il cuit s'il a des cooks ou des tickets à la pass, sinon il est au repos ; gris, rien n'y est lu — au repos.
/** @param {{ ton: string, dit: string }} ligne @returns {EtatDeProjet} */
export function etatDeLaLigne({ ton, dit }) {
  if (ton === "rouge") return "held";
  if (ton === "jaune") return "waiting";
  return ton === "vert" && !/^nothing cooking/.test(dit) && /cooking|at work|at the pass/.test(dit) ? "cooking" : "idle";
}
export const AUCUN_PROJET = "no project yet";
export const SANS_STATION = "no station";
export const AJOUTER = "Add a project";

// Une ligne : la pastille, le nom, l'état, les stations — et la flèche. Un seul bouton, donc un seul clic.
/** @param {Fabrique} doc @param {ProjetDuBloc} projet @param {GestesDuBloc} gestes */
function ligne(doc, projet, gestes) {
  const { dit, ton } = ETATS[projet.etat];
  const stations = projet.stations.length === 0 ? SANS_STATION : projet.stations.join(", ");
  const racine = doc.createElement("button");
  racine.type = "button";
  racine.className = "ligne";
  racine.ariaLabel = `${projet.nom} — ${dit} — ${stations}`;
  if (projet.survol !== undefined) racine.title = projet.survol;
  const pastille = gestes.pastille?.(dit, ton) ?? doc.createElement("span");
  if (gestes.pastille === undefined) {
    pastille.className = "pastille";
    pastille.dataset.ton = ton;
    pastille.title = dit;
  }
  const nom = doc.createElement("strong");
  nom.className = "mono";
  nom.textContent = projet.nom;
  const etat = doc.createElement("span");
  etat.className = "etat";
  etat.textContent = dit;
  const ou = doc.createElement("span");
  ou.className = "stations";
  ou.textContent = stations;
  const suite = doc.createElement("span");
  suite.className = "ouvrir";
  suite.ariaHidden = "true";
  suite.textContent = "›";
  racine.append(pastille, nom, etat, ou, suite);
  racine.addEventListener("click", () => gestes.ouvrir(projet.nom));
  return racine;
}

// Les lignes seules, pour l'accueil qui pose le bouton d'ajout lui-même.
/** @param {Fabrique} doc @param {ProjetDuBloc[]} projets @param {GestesDuBloc} gestes */
export const lignesDeProjets = (doc, projets, gestes) => projets.map((projet) => ligne(doc, projet, gestes));

// Le bouton d'ajout : il lance le parcours d'ajout unique (épique 2473).
/** @param {Fabrique} doc @param {GestesDuBloc} gestes @param {boolean} aucun */
export const boutonDAjout = (doc, gestes, aucun) => boutonAction(doc, AJOUTER, () => gestes.ajouter(), { recommande: aucun });

// Le bloc entier : la liste (ou sa ligne vide) puis le bouton d'ajout.
/** @param {Fabrique} doc @param {ProjetDuBloc[]} projets @param {GestesDuBloc} gestes */
export function poserLesProjets(doc, projets, gestes) {
  const racine = doc.createElement("section");
  racine.className = "liste";
  racine.ariaLabel = "Projects";
  if (projets.length === 0) {
    const vide = doc.createElement("p");
    vide.textContent = AUCUN_PROJET;
    racine.append(vide);
  } else racine.append(...lignesDeProjets(doc, projets, gestes));
  racine.append(boutonDAjout(doc, gestes, projets.length === 0));
  return racine;
}
