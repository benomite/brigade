// @ts-check
// Le plafond de calibrage du projet, sur son onglet Cooks (ticket 1284) : jusqu'où le manager monte le modèle et
// l'effort d'un ticket resté rouge avant de te le passer. La valeur en vigueur, d'où elle vient — le défaut, ou
// toi —, et de quoi la changer d'un geste : un modèle, un effort, « set ceiling ». Posé par toi, « back to the
// default » le retire. Le clic part par le process principal (plafond-de-calibrage.ts) ; tant qu'il n'a pas
// répondu, le bouton dit qu'il s'y met. Ce qu'il a fait se dit en une ligne, ce que le runtime a répondu au survol.
// Sur Cooks, le bloc est replié derrière une ligne (ticket 1456) : `resumeDuPlafond` la dit — la valeur en vigueur, et
// d'où elle vient ; l'ouvrir montre de quoi la changer.
// Ce module ne touche pas `document` : il reçoit de quoi créer un élément (briques.js).

import { boutonAction } from "./briques.js";

/** @typedef {import("./briques.js").Fabrique} Fabrique */
/** @typedef {import("../plafond-de-calibrage.ts").PlafondVu} Vu */
/** @typedef {import("../plafond-de-calibrage.ts").ChoixDuPlafond} Choix */
// Ce que le dernier clic a rendu : la phrase, refusée ou non, et le détail au survol.
/** @typedef {{ dit: string, refus: boolean, detail: string }} Dit */

export const TITRE = "Calibration ceiling";
export const EXPLIQUE = "How far the manager raises the model and the effort of a ticket that stays red, before passing it up to you.";
export const BOUTONS = {
  regler: { libelle: "set ceiling", enCours: "setting…", fait: "the manager reads it at its next reaction — no restart" },
  defaut: { libelle: "back to the default", enCours: "going back…", fait: "your setting is withdrawn: the default holds again" },
};

// La ligne du bloc replié : « opus / high · default ».
/** @param {Vu} vu */
export const resumeDuPlafond = (vu) => `${vu.dit} · ${vu.source}`;

/** @param {Fabrique} doc @param {string} balise @param {string} [texte] */
function cree(doc, balise, texte) {
  const pose = doc.createElement(balise);
  if (texte !== undefined) pose.textContent = texte;
  return pose;
}

// Une liste déroulante : ses valeurs, celle qui est choisie.
/** @param {Fabrique} doc @param {string} nom @param {readonly string[]} valeurs @param {string} choisie @param {(valeur: string) => void} changer */
function liste(doc, nom, valeurs, choisie, changer) {
  const select = cree(doc, "select");
  select.name = nom;
  select.ariaLabel = `ceiling ${nom}`;
  select.append(
    ...valeurs.map((valeur) => {
      const option = cree(doc, "option", valeur);
      option.value = valeur;
      option.selected = valeur === choisie;
      return option;
    }),
  );
  select.value = choisie;
  select.addEventListener("change", () => changer(select.value));
  return select;
}

// La section du plafond, ou null : `facts` ne le donne pas. `choisi` : ce que le chef a choisi dans les listes et
// pas encore envoyé — il reste d'une lecture à l'autre ; sans lui, les listes montrent la valeur en vigueur.
// `enCours` : le geste dont un clic attend sa réponse ; `dit` : ce que le dernier a rendu.
/**
 * @param {Fabrique} doc
 * @param {{ vu: Vu | undefined, choisi: { modele: string, effort: string } | undefined, enCours: "regler" | "defaut" | undefined, dit: Dit | undefined, choisir: (choix: { modele: string, effort: string }) => void, jouer: (choix: Choix) => void }} options
 */
export function poserLePlafond(doc, { vu, choisi, enCours, dit, choisir, jouer }) {
  if (vu === undefined) return null;
  const section = cree(doc, "section");
  section.className = "plafond-de-calibrage";
  section.ariaLabel = TITRE;
  const titre = cree(doc, "h3", TITRE);
  titre.title = EXPLIQUE;
  // La valeur en vigueur, et d'où elle vient.
  const valeur = cree(doc, "p");
  valeur.className = "valeur";
  const dite = cree(doc, "strong", vu.dit);
  dite.className = "mono";
  const source = cree(doc, "small", vu.source);
  source.className = "source";
  valeur.append(dite, source);
  // Le réglage : un modèle, un effort, et le bouton qui les pose ensemble.
  const choix = choisi ?? { modele: vu.modele, effort: vu.effort };
  const reglage = cree(doc, "p");
  reglage.className = "reglage";
  const occupe = enCours !== undefined;
  const modele = liste(doc, "model", vu.modeles, choix.modele, (modele) => choisir({ ...choix, modele }));
  const effort = liste(doc, "effort", vu.efforts, choix.effort, (effort) => choisir({ ...choix, effort }));
  const inchange = choix.modele === vu.modele && choix.effort === vu.effort && vu.source === "set by you";
  const regler = boutonAction(doc, enCours === "regler" ? BOUTONS.regler.enCours : BOUTONS.regler.libelle, () => jouer({ modele: choix.modele, effort: choix.effort }));
  regler.className = "action reglage-du-plafond";
  const clic = regler.children[0];
  if (clic !== undefined) {
    clic.title = BOUTONS.regler.fait;
    clic.disabled = occupe || inchange;
  }
  modele.disabled = occupe;
  effort.disabled = occupe;
  reglage.append(modele, cree(doc, "span", " / "), effort, regler);
  if (vu.parLeChef) {
    const retour = boutonAction(doc, enCours === "defaut" ? BOUTONS.defaut.enCours : BOUTONS.defaut.libelle, () => jouer("defaut"));
    retour.className = "action retour-au-defaut";
    const clicRetour = retour.children[0];
    if (clicRetour !== undefined) {
      clicRetour.title = BOUTONS.defaut.fait;
      clicRetour.disabled = occupe;
    }
    reglage.append(retour);
  }
  section.append(titre, valeur, reglage);
  if (dit !== undefined) {
    const rendu = cree(doc, "p", dit.dit);
    rendu.className = dit.refus ? "dit refus" : "dit";
    if (dit.detail !== "") rendu.title = dit.detail;
    section.append(rendu);
  }
  return section;
}
