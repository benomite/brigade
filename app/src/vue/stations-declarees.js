// @ts-check
// Ce que chaque station déclarée fournit, sur l'onglet Cooks, sous ses stations (ticket 1509, épique 1506) : une ligne
// par station que la box du projet déclare, dans l'ordre de sa déclaration — son nom, où elle tourne, son plafond de
// cooks et ses capacités. Où elle tourne a trois mots distincts : sur la box (« box station ») ; jouée par ce poste
// (« this workstation » : une station `distante` que le fichier des projets lui confie, `stations`) ; jouée par un autre
// poste (« remote »). Un projet qui ne déclare aucune station le dit en une ligne, jamais par un blanc ; une déclaration
// pas encore lue aussi. Lecture seule : changer une station est l'affaire d'un autre ticket (1510).
// La déclaration vient de `installation stations --json`, que le contrôle de l'installation lit (service.ts) : la vue la
// pose, elle n'en déduit rien d'autre.
// Ce module ne touche pas `document` : il reçoit de quoi créer un élément (briques.js), et rend un élément.

import { survol } from "./briques.js";

/** @typedef {import("./briques.js").Fabrique} Fabrique */
/** @typedef {import("../service.ts").StationsLues} StationsLues */
/** @typedef {import("../service.ts").StationDeclaree} StationDeclaree */
/** @typedef {"box" | "poste" | "ailleurs"} Ou */

export const TITRE = "what each station provides";
export const AIDE = "The stations the project declares: how many cooks each runs at once, what it provides to the tickets that need it, and where it runs.";
export const AUCUNE = "no station declared: no cook leaves for this project";
export const PAS_LUE = "not read yet: the next check of the installation reads them";

// Les trois mots d'une station, selon où elle tourne, et ce qu'ils veulent dire, au survol.
/** @type {Readonly<Record<Ou, string>>} */
export const OU = { box: "box station", poste: "this workstation", ailleurs: "remote" };

const s = (/** @type {number} */ combien) => (combien > 1 ? "s" : "");
// Le plafond d'une station, dans les mots du formulaire qui le déclare (« cooks at once »).
export const plafondDit = (/** @type {number} */ cooks) => `${cooks} cook${s(cooks)} at once`;

// Chaque classe est posée en clair, `className = "…"` : la peau ne vise que des classes que la vue
// pose, et son test les lit ainsi (peau.test.ts).
/** @param {Fabrique} doc @param {string} balise @param {string} [texte] */
function cree(doc, balise, texte) {
  const pose = doc.createElement(balise);
  if (texte !== undefined) pose.textContent = texte;
  return pose;
}

// Où tourne une station. Une station de la box, pour un projet dont la cuisine tourne sur ce poste, tourne ici.
/** @param {StationDeclaree} station @param {{ jouees: readonly string[], ici: boolean }} projet @returns {Ou} */
export function ouTourne(station, { jouees, ici }) {
  if (!station.distante) return ici ? "poste" : "box";
  return jouees.includes(station.nom) ? "poste" : "ailleurs";
}

/** @param {Ou} ou @param {boolean} distante @param {string | undefined} hote */
function survolDe(ou, distante, hote) {
  if (ou === "box") return hote === undefined ? "it runs on the project's main station" : `it runs on the project's main station, ${hote}`;
  if (ou === "ailleurs") return "remote: another workstation plays it and pulls its work from the main station — this computer does not";
  return distante ? "remote: this computer plays it for the project, and pulls its work from the main station" : "the project's kitchen runs on this computer: this station runs with it";
}

// Une station : son nom et où elle tourne, son plafond, ses capacités.
/** @param {Fabrique} doc @param {StationDeclaree} station @param {{ jouees: readonly string[], ici: boolean, hote?: string }} projet */
function ligneDe(doc, station, projet) {
  const ligne = cree(doc, "li");
  ligne.className = "station-declaree";
  ligne.dataset.station = station.nom;
  const ou = ouTourne(station, projet);
  ligne.dataset.ou = ou;
  const nom = cree(doc, "strong", station.nom);
  nom.className = "mono";
  const mot = cree(doc, "span", OU[ou]);
  mot.className = "ou";
  mot.title = survolDe(ou, station.distante, projet.hote);
  const qui = cree(doc, "span");
  qui.className = "qui";
  qui.append(nom, mot);
  const plafond = cree(doc, "span", plafondDit(station.cooks));
  plafond.className = "plafond";
  const capacites = cree(doc, "ul");
  capacites.ariaLabel = `what ${station.nom} provides`;
  if (station.fournit.length === 0) {
    capacites.className = "capacites vide";
    capacites.append(cree(doc, "li", "provides nothing"));
  } else {
    capacites.className = "capacites";
    capacites.append(
      ...station.fournit.map((capacite) => {
        const pose = cree(doc, "li", capacite);
        pose.className = "capacite mono";
        return pose;
      }),
    );
  }
  ligne.append(qui, plafond, capacites);
  return ligne;
}

// Le bloc : son titre, puis une ligne par station déclarée — ou la ligne qui dit qu'il n'y en a aucune, ou qu'elles ne
// sont pas encore lues. `stations` : ce que le dernier contrôle de l'installation a lu, absent tant qu'il n'a rien lu.
// `jouees` : les stations que ce poste joue pour le projet ; `ici` : sa cuisine tourne sur ce poste ; `hote` : sa box.
/**
 * @param {Fabrique} doc
 * @param {{ stations: StationsLues | undefined, jouees?: readonly string[], ici?: boolean, hote?: string }} options
 */
export function poserLesDeclarees(doc, { stations, jouees = [], ici = false, hote }) {
  const section = cree(doc, "section");
  section.className = "stations-declarees";
  section.ariaLabel = TITRE;
  const tete = cree(doc, "h4", TITRE);
  tete.append(survol(doc, AIDE));
  section.append(tete);
  if (stations === undefined || stations.declarees.length === 0) {
    const vide = cree(doc, "p", stations === undefined ? PAS_LUE : AUCUNE);
    vide.className = "vide";
    section.append(vide);
    return section;
  }
  const projet = { jouees, ici, ...(hote === undefined ? {} : { hote }) };
  const liste = cree(doc, "ol");
  liste.append(...stations.declarees.map((station) => ligneDe(doc, station, projet)));
  section.append(liste);
  return section;
}
