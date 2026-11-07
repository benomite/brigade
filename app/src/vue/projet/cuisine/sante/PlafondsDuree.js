// @ts-check
// Les plafonds de durée, sur Kitchen > Health (ticket 2490, épique 2484) : au-delà, la cuisine signale la dérive. Le
// seuil du temps perdu par ticket (ticket 2670, `lostTimeMaxMin`), tel que la station le publie, puis les seuils `drift.*` que le dépôt du projet
// déclare (`.claude/brigade/projet.json`) — les durées en tête, les autres repliés derrière une ligne. Chaque seuil dit sa
// valeur et d'où elle vient, et se change ici, et nulle part ailleurs dans la page du projet : un champ et « save ». Le
// process principal l'écrit dans le dépôt, sur sa branche d'intégration (plafonds-duree.ts) ; la station l'applique à
// son rapatriement suivant. Vide, le seuil se retire du dépôt. Le seuil du temps perdu ne s'écrit pas encore d'ici :
// sa ligne le dit, la raison au survol. Ce module ne touche pas `document` : il reçoit de quoi créer un élément.

import { boutonAction, lectureIndisponible, replie, survol } from "../../../briques.js";

/** @typedef {import("../../../briques.js").Fabrique} Fabrique */
/** @typedef {import("../../../../plafonds-duree.ts").PlafondLu} Plafond */
/** @typedef {import("../../../../plafonds-duree.ts").LectureDesPlafonds} Lecture */
// L'état d'un plafond entre deux poses : ce que le chef a tapé sans l'avoir enregistré, l'écriture en cours, ce qu'elle a rendu.
/** @typedef {{ choisi?: string, enCours?: boolean, dit?: { fait: string } | { refus: string, detail?: string } }} Etat */

export const TITRE = "Duration caps";
export const AIDE =
  "Above a cap, the kitchen flags the drift. Kept in the project's repository (.claude/brigade/projet.json): saved here, on its integration branch, the station applies it at its next fetch. Empty, the cap is removed from the repository.";
export const BOUTON = { libelle: "save", enCours: "saving…", survol: "writes .claude/brigade/projet.json on the project's integration branch, on GitHub" };
export const PERDU_MAX = { nom: "Lost time per ticket", source: "median of recent tickets, published by the station", fige: "not editable here yet" };
export const PERDU_MAX_POURQUOI =
  "The station caps the median lost time of recent tickets (waiting for a claim, failed cooks, send-backs) with lostTimeMaxMin, read from its own clone of projet.json, outside the drift thresholds this block writes: it cannot be saved from the app yet. A ticket's total time has no cap, its size varies.";
export const AUTRES = "Other drift thresholds";

/** @param {Fabrique} doc @param {string} balise @param {string} [texte] */
function cree(doc, balise, texte) {
  const pose = doc.createElement(balise);
  if (texte !== undefined) pose.textContent = texte;
  return pose;
}

/** @param {number} valeur @param {string} unite */
const avecUnite = (valeur, unite) => `${valeur.toLocaleString("en-US")} ${unite}`;

// Ce que le champ propose, et s'il change la valeur du dépôt : vide, c'est retirer une valeur posée.
/** @param {Plafond} plafond @param {string | undefined} choisi */
export function changeLaValeur(plafond, choisi) {
  if (choisi === undefined) return false;
  const tape = choisi.trim();
  if (tape === "") return plafond.valeur !== null;
  return Number(tape) !== plafond.valeur;
}

// La ligne d'un plafond : son nom, sa valeur et d'où elle vient, son champ et « save », puis ce que le dernier clic a
// rendu. `choisir` garde ce que le chef tape — sans reposer la page : il est en train d'écrire.
/**
 * @param {Fabrique} doc
 * @param {{ plafond: Plafond, etat: Etat | undefined, choisir: (choisi: string) => void, changer: (saisie: string) => void }} options
 */
export function poserUnPlafond(doc, { plafond, etat, choisir, changer }) {
  const rangee = cree(doc, "div");
  rangee.className = "plafond";
  rangee.dataset.cle = plafond.cle;
  const nom = cree(doc, "span", plafond.nom);
  nom.className = "nom";
  const valeur = cree(doc, "p");
  valeur.className = "valeur";
  const dite = cree(doc, "strong", plafond.valeur === null ? "not set" : avecUnite(plafond.valeur, plafond.unite));
  dite.className = "mono";
  const source = cree(doc, "small", plafond.valeur !== null ? "in the repository" : plafond.defaut === null ? "the station's, if any" : `the station's, or ${avecUnite(plafond.defaut, plafond.unite)}`);
  source.className = "source";
  valeur.append(dite, source);

  const occupe = etat?.enCours === true;
  let choisi = etat?.choisi;
  const champ = cree(doc, "p");
  champ.className = "champ";
  const saisie = cree(doc, "input");
  saisie.type = "text";
  saisie.inputMode = plafond.entier ? "numeric" : "decimal";
  saisie.ariaLabel = `${plafond.nom}, in ${plafond.unite}`;
  saisie.spellcheck = false;
  saisie.placeholder = plafond.defaut === null ? "—" : String(plafond.defaut);
  saisie.value = choisi ?? (plafond.valeur === null ? "" : String(plafond.valeur));
  saisie.disabled = occupe;
  const unite = cree(doc, "span", plafond.unite);
  unite.className = "unite";
  const bouton = boutonAction(doc, occupe ? BOUTON.enCours : BOUTON.libelle, () => {
    if (changeLaValeur(plafond, choisi)) changer(/** @type {string} */ (choisi).trim());
  });
  bouton.className = "action enregistrer-le-plafond";
  /** @type {any} */
  const clic = bouton.children[0];
  const suivre = () => {
    if (clic !== undefined) clic.disabled = occupe || !changeLaValeur(plafond, choisi);
  };
  if (clic !== undefined) clic.title = BOUTON.survol;
  saisie.addEventListener("input", () => {
    choisi = saisie.value;
    choisir(saisie.value);
    suivre();
  });
  saisie.addEventListener("keydown", (/** @type {{ key?: string }} */ evenement) => {
    if (evenement.key === "Enter" && !occupe && changeLaValeur(plafond, choisi)) changer(/** @type {string} */ (choisi).trim());
  });
  champ.append(saisie, unite, bouton);
  suivre();
  rangee.append(nom, valeur, champ);

  const dit = etat?.dit;
  if (dit !== undefined) {
    const rendu = cree(doc, "p");
    if ("refus" in dit) {
      rendu.className = "dit refus";
      rendu.append(cree(doc, "span", dit.refus));
      if ((dit.detail ?? "").trim() !== "") rendu.append(survol(doc, dit.detail ?? ""));
    } else {
      rendu.className = "dit fait";
      rendu.textContent = dit.fait;
    }
    rangee.append(rendu);
  }
  return rangee;
}

// La ligne du seuil du temps perdu par ticket : sa valeur, telle que la station la publie, sans champ.
/** @param {Fabrique} doc @param {number | undefined} lostTimeMaxMin */
function poserLePerduMax(doc, lostTimeMaxMin) {
  const rangee = cree(doc, "div");
  rangee.className = "plafond";
  rangee.dataset.cle = "lostTimeMaxMin";
  const nom = cree(doc, "span", PERDU_MAX.nom);
  nom.className = "nom";
  const valeur = cree(doc, "p");
  valeur.className = "valeur";
  const dite = cree(doc, "strong", lostTimeMaxMin === undefined ? "not known yet" : `${lostTimeMaxMin} min`);
  dite.className = "mono";
  const source = cree(doc, "small", lostTimeMaxMin === undefined ? "the station does not publish it yet" : PERDU_MAX.source);
  source.className = "source";
  valeur.append(dite, source);
  const champ = cree(doc, "p");
  champ.className = "champ fige";
  champ.append(cree(doc, "span", PERDU_MAX.fige), survol(doc, PERDU_MAX_POURQUOI));
  rangee.append(nom, valeur, champ);
  return rangee;
}

// Le bloc : le seuil du temps perdu par ticket, puis les plafonds du dépôt — tant qu'ils ne sont pas lus, une ligne le dit ;
// une lecture ratée tient en une ligne, son détail au survol.
/**
 * @param {Fabrique} doc
 * @param {{ lecture?: Lecture, lostTimeMaxMin?: number, etats?: ReadonlyMap<string, Etat>, autresOuverts?: boolean, basculerAutres?: (ouvert: boolean) => void, choisir?: (cle: string, choisi: string) => void, changer?: (cle: string, saisie: string) => void }} [options]
 */
export function poserBlocPlafondsDuree(doc, { lecture, lostTimeMaxMin, etats = new Map(), autresOuverts = false, basculerAutres, choisir = () => {}, changer = () => {} } = {}) {
  const bloc = doc.createElement("section");
  bloc.className = "bloc-du-projet";
  bloc.dataset.bloc = "plafonds-duree";
  bloc.ariaLabel = TITRE;
  const titre = doc.createElement("h3");
  titre.textContent = TITRE;
  titre.append(survol(doc, AIDE));
  bloc.append(titre, poserLePerduMax(doc, lostTimeMaxMin));
  if (lecture === undefined) {
    const attente = cree(doc, "p", "reading the caps of the repository…");
    attente.className = "plafonds-lecture";
    bloc.append(attente);
    return bloc;
  }
  if ("sans" in lecture) {
    bloc.append(lectureIndisponible(doc, lecture.sans, lecture.detail ?? ""));
    return bloc;
  }
  /** @param {Plafond} plafond */
  const ligne = (plafond) => poserUnPlafond(doc, { plafond, etat: etats.get(plafond.cle), choisir: (choisi) => choisir(plafond.cle, choisi), changer: (saisie) => changer(plafond.cle, saisie) });
  const autres = lecture.plafonds.filter(({ duree }) => !duree);
  const poses = autres.filter(({ valeur }) => valeur !== null).length;
  bloc.append(
    ...lecture.plafonds.filter(({ duree }) => duree).map(ligne),
    replie(doc, { titre: AUTRES, resume: poses === 0 ? "none set in the repository" : `${poses} set in the repository`, ouvert: autresOuverts, ...(basculerAutres === undefined ? {} : { basculer: basculerAutres }) }, autres.map(ligne)),
  );
  return bloc;
}
