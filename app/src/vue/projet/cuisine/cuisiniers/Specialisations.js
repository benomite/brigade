// @ts-check
// Les spécialisations des cooks, sur Kitchen > Cooks (ticket 2492, épique 2484) : chacune avec son modèle, son effort et
// les capacités qu'une station doit avoir pour la lancer, lues dans le dépôt du projet (`agents/cook-<nom>.md`,
// specialisations.ts). Sans modèle ni effort, la ligne dit que le ticket en décide. Dessous, « Add a specialization »
// ouvre sur place ce qu'il faut en dire — son nom, ce qu'elle cuisine, son modèle, son effort, ses capacités — ; « add »,
// le process principal crée son fichier sur la branche d'intégration, et elle entre dans la liste. Un refus tient en une
// ligne sous le formulaire, son détail au survol. Ce module ne touche pas `document` : il reçoit de quoi créer un élément.

import { boutonAction, lectureIndisponible, survol } from "../../../briques.js";

/** @typedef {import("../../../briques.js").Fabrique} Fabrique */
/** @typedef {import("../../../../specialisations.ts").SpecialisationLue} Specialisation */
/** @typedef {import("../../../../specialisations.ts").LectureDesSpecialisations} Lecture */
/** @typedef {import("../../../../specialisations.ts").DemandeDeSpecialisation} Demande */
// L'état de l'ajout entre deux poses : ouvert ou non, ce que le chef a rempli, l'écriture en cours, ce qu'elle a rendu.
/** @typedef {{ ouvert: boolean, saisie: Demande, enCours?: boolean, refus?: { refus: string, detail?: string }, fait?: string }} Etat */
/** @typedef {{ ouvrir: () => void, saisir: (champ: keyof Demande, valeur: string) => void, ajouter: () => void, annuler: () => void }} Gestes */

export const TITRE = "Specializations";
export const AIDE =
  "A specialization is a cook for one kind of ticket: the model and the effort it runs with, and the capabilities a station needs to run it. Each one is a file of the project's repository, agents/cook-<name>.md, on its integration branch. Without a model or an effort, the ticket's calibration decides.";
export const AJOUTER = "Add a specialization";
export const ATTENDU = "Name the new cook and say what it cooks; its model, effort and capabilities are optional.";
export const AUCUNE = "no specialization yet: every ticket goes to the general cook";
export const PAR_TICKET = "per ticket";
export const PAR_TICKET_POURQUOI = "not set: the ticket's calibration decides";
export const SANS_CAPACITE = "none";
export const BOUTON = { libelle: "add", enCours: "adding…", survol: "creates agents/cook-<name>.md on the project's integration branch, on GitHub" };
export const ANNULER = "cancel";
export const MODELES = ["opus", "sonnet", "haiku"];
export const EFFORTS = ["low", "medium", "high", "xhigh", "max"];
// Les champs du formulaire, dans l'ordre : leur nom, ce qu'ils montrent vides.
export const CHAMPS = /** @type {const} */ ([
  { champ: "nom", nom: "Name", exemple: "security" },
  { champ: "description", nom: "What it cooks", exemple: "Auth, secrets and permissions." },
  { champ: "modele", nom: "Model", choix: MODELES },
  { champ: "effort", nom: "Effort", choix: EFFORTS },
  { champ: "capacites", nom: "Capabilities", exemple: "code, navigateur-headless" },
]);

/** @returns {Demande} */
export const saisieVide = () => ({ nom: "", description: "", modele: "", effort: "", capacites: "" });
/** @returns {Etat} */
export const etatFerme = () => ({ ouvert: false, saisie: saisieVide() });

/** @param {Fabrique} doc @param {string} balise @param {string} [texte] */
function cree(doc, balise, texte) {
  const pose = doc.createElement(balise);
  if (texte !== undefined) pose.textContent = texte;
  return pose;
}

// Une valeur du dépôt, ou ce que le ticket décide à sa place, dit pareil pour le modèle et l'effort.
/** @param {Fabrique} doc @param {string | null} valeur */
function calibrage(doc, valeur) {
  const cellule = cree(doc, "td");
  if (valeur === null) {
    const dite = cree(doc, "span", PAR_TICKET);
    dite.className = "par-ticket";
    dite.title = PAR_TICKET_POURQUOI;
    cellule.append(dite);
  } else {
    const dite = cree(doc, "span", valeur);
    dite.className = "mono";
    cellule.append(dite);
  }
  return cellule;
}

// La ligne d'une spécialisation : son nom et ce qu'elle cuisine, son modèle, son effort, ses capacités.
/** @param {Fabrique} doc @param {Specialisation} specialisation */
export function poserUneSpecialisation(doc, { nom, fichier, description, modele, effort, capacites }) {
  const rangee = cree(doc, "tr");
  rangee.dataset.specialisation = nom;
  const qui = cree(doc, "td");
  qui.className = "qui";
  const appele = cree(doc, "strong", nom);
  appele.className = "mono";
  appele.title = fichier;
  qui.append(appele);
  if (description !== "") {
    const cuisine = cree(doc, "small", description);
    cuisine.className = "description";
    qui.append(cuisine);
  }
  const peut = cree(doc, "td");
  peut.className = "capacites";
  if (capacites.length === 0) {
    const aucune = cree(doc, "span", SANS_CAPACITE);
    aucune.className = "aucune";
    peut.append(aucune);
  }
  for (const capacite of capacites) {
    const dite = cree(doc, "code", capacite);
    dite.className = "capacite";
    peut.append(dite);
  }
  rangee.append(qui, calibrage(doc, modele), calibrage(doc, effort), peut);
  return rangee;
}

// La liste : une ligne par spécialisation, sous l'en-tête de ses colonnes ; sans aucune, une phrase.
/** @param {Fabrique} doc @param {Specialisation[]} specialisations */
function poserLaListe(doc, specialisations) {
  if (specialisations.length === 0) {
    const aucune = cree(doc, "p", AUCUNE);
    aucune.className = "specialisations-aucune";
    return aucune;
  }
  const table = cree(doc, "table");
  table.className = "liste-des-specialisations";
  const tete = cree(doc, "tr");
  for (const colonne of ["Cook", "Model", "Effort", "Capabilities"]) tete.append(cree(doc, "th", colonne));
  const entete = cree(doc, "thead");
  entete.append(tete);
  const corps = cree(doc, "tbody");
  corps.append(...specialisations.map((specialisation) => poserUneSpecialisation(doc, specialisation)));
  table.append(entete, corps);
  return table;
}

// Un champ du formulaire, son nom au-dessus : un texte, ou un choix dont le premier est « per ticket ». `saisir` garde ce
// que le chef tape — sans reposer la page : il est en train d'écrire.
/** @param {Fabrique} doc @param {(typeof CHAMPS)[number]} quoi @param {Etat} etat @param {Gestes} gestes */
function poserUnChamp(doc, quoi, etat, gestes) {
  const libelle = cree(doc, "label");
  libelle.className = "champ";
  libelle.append(cree(doc, "span", quoi.nom));
  /** @type {any} */
  let saisie;
  if ("choix" in quoi) {
    saisie = cree(doc, "select");
    for (const [valeur, dit] of [["", PAR_TICKET], ...quoi.choix.map((choix) => [choix, choix])]) {
      const option = cree(doc, "option", dit);
      option.value = valeur;
      saisie.append(option);
    }
  } else {
    saisie = cree(doc, "input");
    saisie.type = "text";
    saisie.spellcheck = false;
    saisie.placeholder = quoi.exemple;
  }
  saisie.name = quoi.champ;
  saisie.dataset.champ = quoi.champ;
  saisie.ariaLabel = quoi.nom;
  saisie.value = etat.saisie[quoi.champ];
  saisie.disabled = etat.enCours === true;
  const garder = () => gestes.saisir(quoi.champ, String(saisie.value ?? ""));
  saisie.addEventListener("input", garder);
  saisie.addEventListener("change", garder);
  saisie.addEventListener("keydown", (/** @type {{ key?: string }} */ evenement) => {
    if (evenement.key === "Enter" && etat.enCours !== true) gestes.ajouter();
  });
  libelle.append(saisie);
  return libelle;
}

// Le formulaire ouvert : ce qu'on attend du chef en tête, les champs, « add » — recommandé — et « cancel », puis le refus.
/** @param {Fabrique} doc @param {Etat} etat @param {Gestes} gestes */
export function poserLAjout(doc, etat, gestes) {
  const ajout = cree(doc, "form");
  ajout.className = "ajout-de-specialisation";
  ajout.addEventListener("submit", (/** @type {{ preventDefault(): void }} */ evenement) => {
    evenement.preventDefault();
    if (etat.enCours !== true) gestes.ajouter();
  });
  const attendu = cree(doc, "p", ATTENDU);
  attendu.className = "attendu";
  const champs = cree(doc, "div");
  champs.className = "champs";
  champs.append(...CHAMPS.map((quoi) => poserUnChamp(doc, quoi, etat, gestes)));
  const occupe = etat.enCours === true;
  const ajouter = boutonAction(doc, occupe ? BOUTON.enCours : BOUTON.libelle, () => {
    if (!occupe) gestes.ajouter();
  }, { recommande: true });
  ajouter.className = "action ajouter";
  /** @type {any} */
  const clic = ajouter.children?.[0];
  if (clic !== undefined) {
    clic.title = BOUTON.survol;
    clic.disabled = occupe;
  }
  const annuler = boutonAction(doc, ANNULER, gestes.annuler);
  annuler.className = "action annuler";
  const boutons = cree(doc, "p");
  boutons.className = "gestes";
  boutons.append(ajouter, annuler);
  ajout.append(attendu, champs, boutons);
  if (etat.refus !== undefined) {
    const refus = cree(doc, "p");
    refus.className = "refus";
    refus.ariaLive = "polite";
    refus.append(cree(doc, "span", etat.refus.refus));
    if ((etat.refus.detail ?? "").trim() !== "") refus.append(survol(doc, etat.refus.detail ?? ""));
    ajout.append(refus);
  }
  return ajout;
}

// Le bloc. Tant que le dépôt n'est pas lu, une ligne le dit ; une lecture ratée tient en une ligne, son détail au survol.
// Sans `gestes` — un écran étroit, qui ne règle rien —, pas de bouton. `bloc` : l'élément à remplir, quand la vue garde le
// même d'une pose à l'autre ; sinon, un neuf.
/**
 * @param {Fabrique} doc
 * @param {{ lecture?: Lecture, etat?: Etat, gestes?: Gestes }} [donnees]
 * @param {any} [bloc]
 */
export function poserBlocSpecialisations(doc, { lecture, etat = etatFerme(), gestes } = {}, bloc = doc.createElement("section")) {
  bloc.className = "bloc-du-projet";
  bloc.dataset.bloc = "specialisations";
  bloc.ariaLabel = TITRE;
  const titre = doc.createElement("h3");
  titre.textContent = TITRE;
  titre.append(survol(doc, AIDE));
  bloc.replaceChildren(titre);
  if (lecture === undefined) {
    const attente = cree(doc, "p", "reading the specializations of the repository…");
    attente.className = "specialisations-lecture";
    bloc.append(attente);
  } else if ("sans" in lecture) bloc.append(lectureIndisponible(doc, lecture.sans, lecture.detail ?? ""));
  else bloc.append(poserLaListe(doc, lecture.specialisations));
  if (gestes === undefined || (lecture !== undefined && "sans" in lecture)) return bloc;
  if (etat.ouvert) bloc.append(poserLAjout(doc, etat, gestes));
  else {
    const ouvrir = cree(doc, "p");
    ouvrir.className = "ajouter-une-specialisation";
    ouvrir.append(boutonAction(doc, AJOUTER, gestes.ouvrir));
    if (etat.fait !== undefined) {
      const fait = cree(doc, "span", etat.fait);
      fait.className = "dit";
      fait.ariaLive = "polite";
      ouvrir.append(fait);
    }
    bloc.append(ouvrir);
  }
  return bloc;
}
