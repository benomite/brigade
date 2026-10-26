// @ts-check
// Les réglages du projet sur sa page (ticket 1309, épique 1301) : sa branche d'intégration, les calibrages par défaut
// de son manager et de son reviewer, son plafond de calibrage, et ceux de son closer (ticket 1685). Chacun dit sa valeur
// en vigueur et d'où elle vient, et a de quoi la changer : un champ — un nom, un nombre, ou un modèle et un effort — et
// « propose ». Ils vivent dans le dépôt du
// projet : le clic ouvre une PR, que la pass retient pour le chef, et rien ne se pose sur la box. La valeur montrée
// reste celle en vigueur — la PR vaut une fois mergée : ce qui est dit à côté du champ, avec de quoi ouvrir la PR.
// Refusé — une valeur qui est à la machine, rien qui change —, le refus se dit à côté du champ, et le champ revient à
// la valeur en vigueur. Ce module ne touche pas `document` : il reçoit de quoi créer un élément (briques.js).

import { boutonAction, lectureIndisponible, survol } from "../briques.js";
import { niveauDe } from "../niveaux.js";

/** @typedef {import("../briques.js").Fabrique} Fabrique */
/** @typedef {import("../../reglages-du-projet.ts").ReglageVu} Vu */
/** @typedef {import("../../reglages-du-projet.ts").LectureDesReglages} Lecture */
/** @typedef {import("../../reglages-du-projet.ts").ChoixDeReglage} Choix */
/** @typedef {import("../../reglages-du-projet.ts").Cle} Cle */
// Ce que le dernier clic a rendu : la PR ouverte et la valeur qu'elle propose, ou le refus et son détail.
/** @typedef {{ propose: string, pr: string, numero: number, valeur: string } | { refus: string, detail?: string }} Dit */
// L'état d'un réglage entre deux poses : ce que le chef a choisi sans l'avoir proposé, le clic en cours, ce qu'il a rendu.
/** @typedef {{ choisi?: string | { modele: string, effort: string }, enCours?: boolean, dit?: Dit }} Etat */

export const TITRE = "Project settings";
export const AIDE =
  "Kept in the project's repository (.claude/brigade/projet.json), for everyone who clones it. A change is proposed as a pull request, held for you: it applies once merged. Nothing is saved on the box.";
export const BOUTON = { libelle: "propose", enCours: "proposing…", survol: "opens a pull request on the project's repository — it applies once merged" };

/** @param {Fabrique} doc @param {string} balise @param {string} [texte] */
function cree(doc, balise, texte) {
  const pose = doc.createElement(balise);
  if (texte !== undefined) pose.textContent = texte;
  return pose;
}

// Une liste déroulante : ses valeurs, celle qui est choisie — une valeur que rien ne dit ouvre sur « — ».
/** @param {Fabrique} doc @param {string} libelle @param {readonly string[]} valeurs @param {string} choisie @param {(valeur: string) => void} changer */
function liste(doc, libelle, valeurs, choisie, changer) {
  const select = cree(doc, "select");
  select.ariaLabel = libelle;
  const options = choisie === "" ? ["", ...valeurs] : valeurs;
  select.append(
    ...options.map((valeur) => {
      const option = cree(doc, "option", valeur === "" ? "—" : valeur);
      option.value = valeur;
      option.selected = valeur === choisie;
      return option;
    }),
  );
  select.value = choisie;
  for (const evenement of ["input", "change"]) select.addEventListener(evenement, () => changer(select.value));
  return select;
}

// Ce que le choix dit, et s'il change quelque chose à la valeur en vigueur.
/** @param {Vu} vu @param {Etat["choisi"]} choisi */
function choixDe(vu, choisi) {
  if ("valeur" in vu) {
    const valeur = typeof choisi === "string" ? choisi : vu.valeur;
    return { dit: valeur.trim(), change: valeur.trim() !== "" && valeur.trim() !== vu.valeur, choix: /** @type {Choix} */ ({ cle: vu.cle, valeur: valeur.trim() }) };
  }
  const { modele, effort } = typeof choisi === "object" ? choisi : { modele: vu.modele, effort: vu.effort };
  return { dit: `${modele} / ${effort}`, change: modele !== "" && effort !== "" && (modele !== vu.modele || effort !== vu.effort), choix: /** @type {Choix} */ ({ cle: vu.cle, modele, effort }) };
}

// Un réglage : son nom, sa valeur en vigueur et d'où elle vient, son champ et « propose », puis ce que le dernier clic
// a rendu. `choisir` garde ce que le chef change dans le champ — sans reposer la page : il est en train d'écrire.
/**
 * @param {Fabrique} doc
 * @param {{ vu: Vu, modeles: readonly string[], efforts: readonly string[], etat: Etat | undefined, choisir: (choisi: string | { modele: string, effort: string }) => void, proposer: (choix: Choix, dit: string) => void, ouvrir: (url: string) => void }} options
 */
export function poserUnReglage(doc, { vu, modeles, efforts, etat, choisir, proposer, ouvrir }) {
  const rangee = cree(doc, "div");
  rangee.className = "reglage";
  rangee.dataset.cle = vu.cle;
  const nom = cree(doc, "span", vu.nom);
  nom.className = "nom";
  nom.append(niveauDe(doc, vu.cle));
  const valeur = cree(doc, "p");
  valeur.className = "valeur";
  const dite = cree(doc, "strong", vu.dit ?? "not set");
  dite.className = "mono";
  const source = cree(doc, "small", vu.source);
  source.className = "source";
  valeur.append(dite, source);

  const occupe = etat?.enCours === true;
  let choisi = etat?.choisi;
  const champ = cree(doc, "p");
  champ.className = "champ";
  const bouton = boutonAction(doc, occupe ? BOUTON.enCours : BOUTON.libelle, () => {
    const { change, choix, dit } = choixDe(vu, choisi);
    if (change) proposer(choix, dit);
  });
  bouton.className = "action proposer-le-reglage";
  /** @type {any} */
  const clic = bouton.children[0];
  const suivre = () => {
    if (clic !== undefined) clic.disabled = occupe || !choixDe(vu, choisi).change;
  };
  /** @param {string | { modele: string, effort: string }} neuf */
  const changer = (neuf) => {
    choisi = neuf;
    choisir(neuf);
    suivre();
  };
  if (clic !== undefined) clic.title = BOUTON.survol;
  if ("valeur" in vu) {
    const saisie = cree(doc, "input");
    saisie.type = "text";
    // Un nombre du closer s'écrit en chiffres ; le runtime juge s'il est admis.
    if (vu.cle !== "branche") saisie.inputMode = "numeric";
    saisie.ariaLabel = vu.nom;
    saisie.spellcheck = false;
    saisie.value = typeof choisi === "string" ? choisi : vu.valeur;
    saisie.disabled = occupe;
    saisie.addEventListener("input", () => changer(saisie.value));
    champ.append(saisie);
  } else {
    const courant = typeof choisi === "object" ? choisi : { modele: vu.modele, effort: vu.effort };
    const modele = liste(doc, `${vu.nom}: model`, modeles, courant.modele, (pris) => changer({ ...(typeof choisi === "object" ? choisi : courant), modele: pris }));
    const effort = liste(doc, `${vu.nom}: effort`, efforts, courant.effort, (pris) => changer({ ...(typeof choisi === "object" ? choisi : courant), effort: pris }));
    modele.disabled = occupe;
    effort.disabled = occupe;
    champ.append(modele, cree(doc, "span", " / "), effort);
  }
  champ.append(bouton);
  suivre();
  rangee.append(nom, valeur, champ);

  // Ce que le dernier clic a rendu, à côté du champ.
  const dit = etat?.dit;
  if (dit !== undefined) {
    const rendu = cree(doc, "p");
    if ("refus" in dit) {
      rendu.className = "dit refus";
      rendu.append(cree(doc, "span", dit.refus));
      if ((dit.detail ?? "").trim() !== "") rendu.append(survol(doc, dit.detail ?? ""));
    } else {
      rendu.className = "dit propose";
      const lien = boutonAction(doc, `pull request #${dit.numero}`, () => ouvrir(dit.pr));
      lien.className = "action ouvrir-la-pr";
      if (lien.children[0] !== undefined) lien.children[0].title = dit.pr;
      rendu.append(cree(doc, "span", `${dit.valeur} ${dit.propose}`), lien);
    }
    rangee.append(rendu);
  }
  return rangee;
}

// La section des réglages, ou null tant que rien n'est lu. Une lecture ratée tient en une ligne, son détail au survol.
/**
 * @param {Fabrique} doc
 * @param {{ lecture: Lecture | undefined, etats: ReadonlyMap<Cle, Etat>, choisir: (cle: Cle, choisi: string | { modele: string, effort: string }) => void, proposer: (choix: Choix, dit: string) => void, ouvrir: (url: string) => void }} options
 */
export function poserLesReglages(doc, { lecture, etats, choisir, proposer, ouvrir }) {
  if (lecture === undefined) return null;
  const section = cree(doc, "section");
  section.className = "reglages-du-projet";
  section.ariaLabel = TITRE;
  const titre = cree(doc, "h3", TITRE);
  titre.append(survol(doc, AIDE));
  section.append(titre);
  if ("sans" in lecture) {
    section.append(lectureIndisponible(doc, lecture.sans, lecture.detail ?? ""));
    return section;
  }
  const { reglages, modeles, efforts } = lecture.vus;
  section.append(
    ...reglages.map((vu) => poserUnReglage(doc, { vu, modeles, efforts, etat: etats.get(vu.cle), choisir: (choisi) => choisir(vu.cle, choisi), proposer, ouvrir })),
  );
  return section;
}
