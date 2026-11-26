// @ts-check
// Les réglages du projet sur sa page (ticket 1309, épique 1301) : sa branche d'intégration, les calibrages par défaut
// de son manager et de son reviewer, son plafond de calibrage, et ceux de son closer (ticket 1685). Chacun est la rangée
// de réglage de l'app (composants/setting, ticket 2920) : sa valeur en vigueur et d'où elle vient, et de quoi la changer
// — un champ, un nom ou un nombre, ou un modèle et un effort. Ils vivent dans le dépôt du projet : la rangée le dit
// (`PAR_PR`), et un changement ouvre une PR dès qu'il est fait — le `change` du champ, ou d'une des deux listes —, sans
// bouton. La pass retient la PR pour le chef, et rien ne se pose sur la box. La valeur montrée reste celle en vigueur —
// la PR vaut une fois mergée : ce qui est dit sous la rangée, avec de quoi ouvrir la PR. Refusé — une valeur qui est à
// la machine, rien qui change —, le refus se dit sous la rangée, et le champ revient à la valeur en vigueur. Ce module
// ne touche pas `document` : il reçoit de quoi créer un élément (briques.js).

import { survol } from "../briques.js";
import { ditDuSetting, rangeeDeSetting } from "../composants/setting/setting.js";
import { lineError } from "../composants/line-error/line-error.js";
import { niveauDe } from "../niveaux.js";

/** @typedef {import("../briques.js").Fabrique} Fabrique */
/** @typedef {import("../../settings-du-project.ts").SettingVu} Vu */
/** @typedef {import("../../settings-du-project.ts").ReadDesSettings} Read */
/** @typedef {import("../../settings-du-project.ts").ChoiceDeSetting} Choice */
/** @typedef {import("../../settings-du-project.ts").Cle} Cle */
// Ce que le dernier changement a rendu : la PR ouverte et la valeur qu'elle propose, ou le refus et son détail.
/** @typedef {{ propose: string, pr: string, numero: number, valeur: string } | { refus: string, detail?: string }} Dit */
// L'état d'un réglage entre deux poses : ce que le chef écrit sans l'avoir encore changé, la proposition en route, ce
// qu'elle a rendu.
/** @typedef {{ choisi?: string | { modele: string, effort: string }, enCours?: boolean, dit?: Dit }} State */

// Les rangées que l'artboard `Settings.dc.html` dessine, dans son ordre (« Label in the bar » est celle du sigle, posée
// à part) ; les autres réglages, réels eux aussi, suivent plus bas, sous la couleur.
/** @type {readonly Cle[]} */
const DESSINES = ["branche", "manager", "reviewer", "plafond", "closer-tokens"];
export const TITRE = "Project settings";
export const AIDE =
  "Kept in the project's repository (.claude/brigade/projet.json), for everyone who clones it. A change is proposed as a pull request, held for you: it applies once merged. Nothing is saved on the box.";
// Ce que la rangée dit tant que la proposition est en route.
export const EN_COURS = "proposing…";

/** @param {Fabrique} doc @param {string} balise @param {string} [texte] */
function cree(doc, balise, texte) {
  const pose = doc.createElement(balise);
  if (texte !== undefined) pose.textContent = texte;
  return pose;
}

// Une liste déroulante : ses valeurs, celle qui est choisie — une valeur que rien ne dit ouvre sur « — ». `input` garde
// le choix ; `change` le fait.
/** @param {Fabrique} doc @param {string} libelle @param {readonly string[]} valeurs @param {string} choisie @param {(valeur: string) => void} garder @param {(valeur: string) => void} changer */
function liste(doc, libelle, valeurs, choisie, garder, changer) {
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
  select.addEventListener("input", () => garder(select.value));
  select.addEventListener("change", () => changer(select.value));
  return select;
}

// Ce que le choix dit, et s'il change quelque chose à la valeur en vigueur.
/** @param {Vu} vu @param {State["choisi"]} choisi */
function choiceDe(vu, choisi) {
  if ("valeur" in vu) {
    const valeur = typeof choisi === "string" ? choisi : vu.valeur;
    return { dit: valeur.trim(), change: valeur.trim() !== "" && valeur.trim() !== vu.valeur, choix: /** @type {Choice} */ ({ cle: vu.cle, valeur: valeur.trim() }) };
  }
  const { modele, effort } = typeof choisi === "object" ? choisi : { modele: vu.modele, effort: vu.effort };
  return { dit: `${modele} / ${effort}`, change: modele !== "" && effort !== "" && (modele !== vu.modele || effort !== vu.effort), choix: /** @type {Choice} */ ({ cle: vu.cle, modele, effort }) };
}

// Un réglage : la rangée de réglage, son niveau « project » — elle dit qu'un changement ouvre une PR —, sa valeur en
// vigueur et d'où elle vient, son champ, puis ce que le dernier changement a rendu. `choisir` garde ce que le chef écrit
// — sans reposer la page : il est en train d'écrire ; le `change` du champ le propose, s'il change la valeur en vigueur.
/**
 * @param {Fabrique} doc
 * @param {{ vu: Vu, modeles: readonly string[], efforts: readonly string[], etat: State | undefined, choisir: (choisi: string | { modele: string, effort: string }) => void, proposer: (choice: Choice, dit: string) => void, ouvrir: (url: string) => void }} options
 */
export function poserUnSetting(doc, { vu, modeles, efforts, etat: state, choisir, proposer, ouvrir }) {
  const dite = cree(doc, "strong", vu.dit ?? "not set");
  dite.className = "mono";
  const source = cree(doc, "small", vu.source);
  source.className = "source";

  const occupe = state?.enCours === true;
  let choisi = state?.choisi;
  /** @param {string | { modele: string, effort: string }} neuf */
  const garder = (neuf) => {
    choisi = neuf;
    choisir(neuf);
  };
  /** @param {string | { modele: string, effort: string }} neuf */
  const changer = (neuf) => {
    garder(neuf);
    const { change, choix: choice, dit } = choiceDe(vu, choisi);
    if (change) proposer(choice, dit);
  };
  /** @type {any[]} */
  const controle = [];
  if ("valeur" in vu) {
    const saisie = cree(doc, "input");
    saisie.type = "text";
    // Un nombre du closer s'écrit en chiffres ; le runtime juge s'il est admis.
    if (vu.cle !== "branche") saisie.inputMode = "numeric";
    saisie.ariaLabel = vu.nom;
    saisie.spellcheck = false;
    saisie.value = typeof choisi === "string" ? choisi : vu.valeur;
    saisie.disabled = occupe;
    saisie.addEventListener("input", () => garder(saisie.value));
    saisie.addEventListener("change", () => changer(saisie.value));
    controle.push(saisie);
  } else {
    const courant = typeof choisi === "object" ? choisi : { modele: vu.modele, effort: vu.effort };
    const avec = (/** @type {Partial<{ modele: string, effort: string }>} */ taken) => ({ ...(typeof choisi === "object" ? choisi : courant), ...taken });
    const modele = liste(doc, `${vu.nom}: model`, modeles, courant.modele, (taken) => garder(avec({ modele: taken })), (taken) => changer(avec({ modele: taken })));
    const effort = liste(doc, `${vu.nom}: effort`, efforts, courant.effort, (taken) => garder(avec({ effort: taken })), (taken) => changer(avec({ effort: taken })));
    modele.disabled = occupe;
    effort.disabled = occupe;
    controle.push(modele, cree(doc, "span", " / "), effort);
  }

  // Ce que le dernier changement a rendu, sous la rangée : la proposition en route, la PR ouverte, ou le refus.
  const dit = occupe ? { enCours: EN_COURS } : state?.dit;
  return rangeeDeSetting(doc, {
    nom: vu.nom,
    cle: vu.cle,
    niveau: niveauDe(doc, vu.cle),
    valeur: [dite, source],
    controle,
    dessous: ditDuSetting(doc, dit, { ouvrir }),
  });
}

// La section des réglages, ou null tant que rien n'est lu. Une lecture ratée tient en une ligne, son détail au survol.
/**
 * @param {Fabrique} doc
 * @param {{ lecture: Read | undefined, etats: ReadonlyMap<Cle, State>, choisir: (cle: Cle, choisi: string | { modele: string, effort: string }) => void, proposer: (choice: Choice, dit: string) => void, ouvrir: (url: string) => void, groupe?: "dessines" | "en-plus" }} options
 */
export function poserLesSettings(doc, { lecture: read, etats: states, choisir, proposer, ouvrir, groupe = "dessines" }) {
  if (read === undefined) return null;
  const enPlus = groupe === "en-plus";
  if (enPlus && "sans" in read) return null;
  const section = cree(doc, "section");
  section.className = "reglages-du-projet";
  section.ariaLabel = TITRE;
  // Sa tête est une rangée sans contrôle : son titre, où ses réglages sont gardés au survol.
  if (!enPlus) {
    const titre = rangeeDeSetting(doc, { nom: TITRE, classe: "tete" });
    titre.children[0]?.append(survol(doc, AIDE));
    section.append(titre);
  }
  if ("sans" in read) {
    section.append(lineError(doc, read.sans, read.detail ?? ""));
    return section;
  }
  const { modeles, efforts } = read.vus;
  const settings = read.vus.reglages.filter((vu) => DESSINES.includes(vu.cle) !== enPlus);
  // L'ordre de l'artboard, non celui de la lecture.
  if (!enPlus) settings.sort((a, b) => DESSINES.indexOf(a.cle) - DESSINES.indexOf(b.cle));
  section.append(
    ...settings.map((vu) => poserUnSetting(doc, { vu, modeles, efforts, etat: states.get(vu.cle), choisir: (choisi) => choisir(vu.cle, choisi), proposer, ouvrir })),
  );
  return section;
}
