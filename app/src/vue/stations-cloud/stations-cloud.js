// @ts-check
// Les stations cloud d'un projet, sur l'onglet Cooks, sous ses stations (ticket 2232, épique 2223) : ce qu'elles coûtent par
// ticket servi, ses trois plafonds — stations à la fois, heures par jour, heures par mois — et « Add a cloud station ».
// Un clic ajoute la station, une fois les deux conditions remplies, dans cet ordre :
//   - un plafond au moins : sans aucun, rien ne part, et la ligne le dit sous le bouton (plafonds.ts du runtime) ;
//   - ce qu'une station reçoit, approuvé une fois : avant la première, le clic ouvre la liste — ce qu'elle reçoit, ce
//     qu'elle ne reçoit jamais — et sa confirmation ; approuvée, la suivante ne la redemande pas. Une liste changée
//     arrive non approuvée, et la redemande (stations-cloud-secrets/ du runtime).
// Le coût par ticket servi se dit en un nombre, ou « not available yet » tant qu'aucun ticket n'est servi.
// Ce que le bloc montre vient du process principal (stations-cloud/stations-cloud.ts) : la vue le pose, ne recompte
// rien, et rend au geste ce que le chef a saisi.
// Ce module ne touche pas `document` : il reçoit de quoi créer un élément (briques.js), et rend un élément.

import { boutonAction, confirmationDeGeste, lectureIndisponible, replie, survol } from "../briques.js";

/** @typedef {import("../briques.js").Fabrique} Fabrique */
/** @typedef {import("../../stations-cloud/stations-cloud.ts").VuDuCloud} VuDuCloud */
/** @typedef {import("../../stations-cloud/stations-cloud.ts").Plafonds} Plafonds */
/** @typedef {import("../../stations-cloud/stations-cloud.ts").CloudAjoute} CloudAjoute */
/** @typedef {import("../../stations-cloud/stations-cloud.ts").Element} Element */
/** @typedef {"aLaFois" | "heuresParJour" | "heuresParMois"} Borne */
/**
 * Ce que le chef a saisi sur le bloc, gardé d'un repos à l'autre : les trois plafonds tels qu'ils sont tapés, la liste
 * à approuver ouverte ou non, un envoi en route, ce que le dernier clic a retenu, et ce que le dernier envoi a rendu.
 * @typedef {{ aLaFois: string, heuresParJour: string, heuresParMois: string, approbation: boolean, envoi: boolean, retenu?: string, rendu?: CloudAjoute }} Saisie
 */
/**
 * Les gestes du bloc : la vue garde la saisie, envoie l'ajout au process principal, puis repose le bloc.
 * @typedef {{ ajouter(): void, approuver(): void, renoncer(): void }} Gestes
 */

export const TITRE = "cloud stations";
export const AIDE = "Stations your cloud host starts when the rail has work no other station takes, and stops when the rail is empty. Your host account pays their hours: brigade bills nothing.";
export const AJOUTER = "Add a cloud station";
export const PRIX = "your cloud host bills each station's hours, within the ceiling you set";
// Les trois plafonds, dans les mots du runtime (« stations at once, hours a day or hours a month »).
/** @type {Readonly<Record<Borne, string>>} */
export const BORNES = { aLaFois: "Stations at once", heuresParJour: "Hours a day", heuresParMois: "Hours a month" };
export const SANS_PLAFOND = "Set a ceiling first — stations at once, hours a day or hours a month: no cloud station starts without one";
export const COUT = "Cost per ticket served";
export const PAS_ENCORE = "not available yet";
export const RECOIT = "What a cloud station receives";
export const JAMAIS = "What it never receives";
export const APPROUVER = "Approve and add";
export const RENONCER = "Cancel";
export const NON_LU = "cloud stations: not read";

const s = (/** @type {number} */ combien) => (combien > 1 ? "s" : "");
const argent = (/** @type {number} */ montant) => `$${montant.toFixed(2)}`;

// Une saisie neuve : les plafonds que le projet tient déjà, tels qu'ils s'écrivent dans leurs champs.
/** @param {VuDuCloud} vu @returns {Saisie} */
export function saisieDe(vu) {
  const champ = (/** @type {number | undefined} */ valeur) => (valeur === undefined ? "" : String(valeur));
  return { aLaFois: champ(vu.plafonds.aLaFois), heuresParJour: champ(vu.plafonds.heuresParJour), heuresParMois: champ(vu.plafonds.heuresParMois), approbation: false, envoi: false };
}

// Les plafonds saisis, ou ce qui retient l'ajout : aucun plafond, ou un champ qui n'est pas un nombre. Un champ vide ne
// borne rien ; les stations à la fois se comptent en entiers, les heures peuvent être fractionnaires.
/** @param {Saisie} saisie @returns {{ plafonds: Plafonds } | { retenu: string }} */
export function lireLaSaisie(saisie) {
  /** @type {Plafonds} */
  const plafonds = {};
  for (const borne of /** @type {Borne[]} */ (["aLaFois", "heuresParJour", "heuresParMois"])) {
    const tape = saisie[borne].trim();
    if (tape === "") continue;
    const valeur = Number(tape);
    const entier = borne === "aLaFois";
    if (!Number.isFinite(valeur) || valeur <= 0 || (entier && !Number.isInteger(valeur))) {
      return { retenu: `${BORNES[borne]}: ${entier ? "a whole number of stations" : "a number of hours"}, above zero` };
    }
    plafonds[borne] = valeur;
  }
  if (Object.keys(plafonds).length === 0) return { retenu: SANS_PLAFOND };
  return { plafonds };
}

// Ce qu'un clic sur « Add a cloud station » fait : rien sans plafond — la ligne dit pourquoi —, la liste à approuver
// avant la première station, sinon l'ajout.
/** @param {VuDuCloud} vu @param {Saisie} saisie @returns {{ retenu: string } | { approuver: Plafonds } | { ajouter: Plafonds }} */
export function auClic(vu, saisie) {
  const lue = lireLaSaisie(saisie);
  if ("retenu" in lue) return lue;
  return vu.approuvee ? { ajouter: lue.plafonds } : { approuver: lue.plafonds };
}

// Le coût par ticket servi, en une ligne, et ce qui le fait au survol — ou « not available yet », tant que rien n'est servi.
/** @param {VuDuCloud} vu @returns {{ dit: string, survol: string }} */
export function coutDit({ cout, periode }) {
  if (cout.coutParTicket === "n/a") return { dit: PAS_ENCORE, survol: `no ticket served by a cloud station ${periode}${cout.coutTotal > 0 ? ` — ${argent(cout.coutTotal)} billed` : ""}` };
  return { dit: argent(cout.coutParTicket), survol: `${argent(cout.coutTotal)} billed ${periode}, ${cout.ticketsServis} ticket${s(cout.ticketsServis)} served` };
}

/** @param {Fabrique} doc @param {string} balise @param {string} [texte] */
function cree(doc, balise, texte) {
  const pose = doc.createElement(balise);
  if (texte !== undefined) pose.textContent = texte;
  return pose;
}

// Un plafond : son nom, son champ. Ce que le chef tape est gardé dans la saisie au fil de la frappe.
/** @param {Fabrique} doc @param {string} projet @param {Saisie} saisie @param {Borne} borne */
function champDe(doc, projet, saisie, borne) {
  const champ = cree(doc, "input");
  champ.type = "number";
  champ.min = borne === "aLaFois" ? "1" : "0.5";
  champ.step = borne === "aLaFois" ? "1" : "0.5";
  champ.value = saisie[borne];
  champ.placeholder = "none";
  champ.ariaLabel = `${BORNES[borne]} for ${projet}'s cloud stations`;
  // Le rail redessiné rend le clavier au champ où le chef tapait (vue.js, `reprise`).
  champ.dataset.cle = `cloud:${projet}`;
  champ.dataset.champ = borne;
  champ.disabled = saisie.envoi;
  champ.addEventListener("input", () => void (saisie[borne] = champ.value));
  const pose = cree(doc, "label");
  pose.className = "champ";
  pose.append(cree(doc, "span", BORNES[borne]), champ);
  return pose;
}

// Une liste de ce qu'une station reçoit — ou ne reçoit jamais —, son titre en tête : chaque élément dit en clair, tel que
// le runtime l'écrit.
/** @param {Fabrique} doc @param {string} titre @param {Element[]} lignes */
function listeDe(doc, titre, lignes) {
  const pose = cree(doc, "div");
  const liste = cree(doc, "ul");
  liste.ariaLabel = titre;
  liste.append(...lignes.map((ligne) => cree(doc, "li", ligne.dit)));
  pose.append(cree(doc, "h5", titre), liste);
  return pose;
}

/** @param {Fabrique} doc @param {VuDuCloud} vu */
function lesListes(doc, vu) {
  const recoit = listeDe(doc, RECOIT, vu.recoit.recoit);
  recoit.className = "recoit";
  if (vu.recoit.jamais.length === 0) return [recoit];
  const jamais = listeDe(doc, JAMAIS, vu.recoit.jamais);
  jamais.className = "jamais";
  return [recoit, jamais];
}

// L'approbation, avant la première station : la question en tête, les deux listes, puis la confirmation et son prix.
/** @param {Fabrique} doc @param {VuDuCloud} vu @param {Gestes} gestes */
function approbationDe(doc, vu, gestes) {
  const pose = cree(doc, "div");
  pose.className = "approbation";
  pose.ariaLabel = `approve what a cloud station of ${vu.projet} receives`;
  const listes = cree(doc, "div");
  listes.className = "listes";
  listes.append(...lesListes(doc, vu));
  pose.append(
    listes,
    confirmationDeGeste(doc, { titre: `Approve, once for ${vu.projet}, what a cloud station receives? It receives this and nothing else; the next stations do not ask again.`, prix: PRIX, oui: APPROUVER, non: RENONCER }, { oui: () => gestes.approuver(), non: () => gestes.renoncer() }),
  );
  return pose;
}

// La tête du bloc : son titre, son aide, et combien de stations cloud le projet a.
/** @param {Fabrique} doc @param {VuDuCloud} vu */
function teteDe(doc, vu) {
  const tete = cree(doc, "h4", TITRE);
  tete.append(survol(doc, AIDE));
  const combien = cree(doc, "small", vu.ajoutees === 0 ? "none added yet" : `${vu.ajoutees} added`);
  combien.className = "combien";
  tete.append(combien);
  return tete;
}

// Le bloc d'un projet. `vu` : ce que le process principal en a lu — `undefined` tant qu'il n'a rien rendu, ou la ligne
// d'une lecture qui a échoué. `saisie` : ce que le chef y a tapé ; `gestes` : de quoi ajouter.
/**
 * @param {Fabrique} doc
 * @param {{ vu: VuDuCloud | { refus: string, detail?: string }, saisie: Saisie, gestes: Gestes }} options
 */
export function poserLeCloud(doc, { vu, saisie, gestes }) {
  const section = cree(doc, "section");
  section.className = "stations-cloud";
  section.ariaLabel = TITRE;
  if ("refus" in vu) {
    const tete = cree(doc, "h4", TITRE);
    tete.append(survol(doc, AIDE));
    section.append(tete, lectureIndisponible(doc, NON_LU, [vu.refus, vu.detail ?? ""].filter((ligne) => ligne !== "").join(" — ")));
    return section;
  }
  section.append(teteDe(doc, vu));
  // Le coût par ticket servi, en tête : ce que le chef paie pour ce que la cuisine livre.
  const cout = coutDit(vu);
  const ligneDuCout = cree(doc, "p");
  ligneDuCout.className = "cout";
  const nombre = cree(doc, "strong", cout.dit);
  if (cout.dit === PAS_ENCORE) nombre.className = "pas-encore";
  else nombre.className = "montant";
  ligneDuCout.append(cree(doc, "span", COUT), nombre, survol(doc, cout.survol));
  section.append(ligneDuCout);
  // Les trois plafonds, puis le geste.
  const plafonds = cree(doc, "div");
  plafonds.className = "plafonds";
  plafonds.ariaLabel = `ceilings of ${vu.projet}'s cloud stations`;
  plafonds.append(...(/** @type {Borne[]} */ (["aLaFois", "heuresParJour", "heuresParMois"])).map((borne) => champDe(doc, vu.projet, saisie, borne)));
  const ajouter = boutonAction(doc, saisie.envoi ? "adding…" : AJOUTER, () => gestes.ajouter(), { recommande: true, prix: PRIX });
  ajouter.firstChild.disabled = saisie.envoi || saisie.approbation;
  ajouter.firstChild.ariaExpanded = saisie.approbation ? "true" : "false";
  plafonds.append(ajouter);
  section.append(plafonds);
  if (saisie.retenu !== undefined) {
    const retenu = cree(doc, "p", saisie.retenu);
    retenu.className = "retenu";
    retenu.role = "alert";
    section.append(retenu);
  }
  if (saisie.approbation && !vu.approuvee) section.append(approbationDe(doc, vu, gestes));
  else if (vu.approuvee) section.append(replie(doc, { titre: RECOIT, resume: "approved", aide: "Approved once for this project: a changed list asks again." }, lesListes(doc, vu)));
  const rendu = saisie.rendu;
  if (rendu !== undefined) {
    if ("refus" in rendu) section.append(lectureIndisponible(doc, rendu.refus, rendu.detail ?? ""));
    else {
      const fait = cree(doc, "p", rendu.fait);
      fait.className = "fait";
      section.append(fait);
    }
  }
  return section;
}
