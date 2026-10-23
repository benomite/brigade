// @ts-check
// Le rail d'un projet que ni une box ni la station de cet ordinateur ne servent (ticket 1435, épique 1427) — un projet
// ouvert depuis le premier lancement, sur un ordinateur neuf : celui que sa station publie sur GitHub, tel que le
// runtime le lit (ticket 1432), rangé dans les colonnes du rail du Mac (faits.ts). L'onglet n'est jamais vide : en tête,
// toujours une phrase — d'où vient ce rail, ou pourquoi il ne se lit pas. Une connexion à GitHub qui manque est un
// bouton, le geste que le runtime nomme ; une lecture qui échoue dit sa raison en une phrase, son détail au survol, et le
// bouton de la page qui la lève quand le runtime en nomme une. Une carte n'a qu'un geste : son numéro ouvre l'issue.
// Ce module ne touche pas `document` : il reçoit de quoi créer un élément (briques.js), et rend des éléments.

import { boutonAction } from "./briques.js";
import { boutonDeLaPage, connexionDite, gestes, phraseEtDetail, RELIRE } from "./premier-lancement.js";

/** @typedef {import("./briques.js").Fabrique} Fabrique */
/** @typedef {import("../faits.ts").RailDuProjetLu} RailDuProjetLu */
/** @typedef {import("../faits.ts").CarteDuRailPublie} CarteDuRailPublie */

// Ce que la vue tient de l'onglet. `lu` : absent, sa lecture est en route. `connexion` : la connexion à GitHub
// lancée, comme au premier lancement.
/**
 * @typedef {{
 *   lu?: RailDuProjetLu,
 *   connexion?: import("./premier-lancement.js").EtatDuPremier["connexion"],
 * }} EtatDuRailPublie
 */
/**
 * @typedef {{
 *   relire: () => void,
 *   seConnecter: () => void,
 *   ouvrirLaPage: (url: string) => void,
 *   ouvrirIssue: (ticket: number) => void,
 *   forme?: (ton: string | undefined) => string | undefined,
 * }} GestesDuRailPublie
 */

export const LECTURE_PUBLIEE = "Reading the rail its station publishes on GitHub…";
/** @param {string} station */
export const PUBLIE_PAR = (station) => `The rail as ${station} publishes it on GitHub.`;
/** @param {string} station */
export const PUBLIE_HORS_LIGNE = (station) => `${station} is offline: this is the last rail it published on GitHub.`;
export const AUCUN = "none";
export const HORS_DES_COLONNES = "outside the columns — their state is none of the five";
export const SANS_ADRESSE = "the address the station published for this ticket is not https: the app does not open it";

/** @param {Fabrique} doc @param {string} balise @param {string} [texte] */
function cree(doc, balise, texte) {
  const pose = doc.createElement(balise);
  if (texte !== undefined) pose.textContent = texte;
  return pose;
}

// Une carte : son numéro — un bouton qui ouvre l'issue —, son mot d'état dans le ton de sa colonne, son titre.
/** @param {Fabrique} doc @param {CarteDuRailPublie} carte @param {GestesDuRailPublie} geste */
function bonPublie(doc, { ticket, etat, ton, titre, ouvrable }, geste) {
  const bon = cree(doc, "li");
  bon.className = "bon";
  const tete = cree(doc, "div");
  const numero = cree(doc, ouvrable ? "button" : "span", `#${ticket}`);
  numero.className = "ticket mono";
  if (ouvrable) {
    numero.type = "button";
    numero.title = `open issue #${ticket} in the browser`;
    numero.addEventListener("click", () => geste.ouvrirIssue(ticket));
  } else numero.title = SANS_ADRESSE;
  const mot = cree(doc, "span", etat === "86" ? "set aside" : etat);
  mot.className = "etat-ticket";
  if (ton !== undefined) mot.dataset.ton = ton;
  const forme = geste.forme?.(ton);
  if (forme !== undefined) mot.dataset.forme = forme;
  tete.append(numero, mot);
  bon.append(tete);
  if (titre !== "") bon.append(cree(doc, "strong", titre));
  return bon;
}

/** @param {Fabrique} doc @param {readonly CarteDuRailPublie[]} cartes @param {GestesDuRailPublie} geste */
function bons(doc, cartes, geste) {
  const liste = cree(doc, "ol");
  liste.append(...cartes.map((carte) => bonPublie(doc, carte, geste)));
  return liste;
}

// L'onglet entier, d'après ce que la vue tient : la phrase de tête, puis les colonnes, ou les gestes qui lèvent l'échec.
/** @param {Fabrique} doc @param {EtatDuRailPublie} etat @param {GestesDuRailPublie} geste @returns {any[]} */
export function poserRailPublie(doc, etat, geste) {
  const { lu } = etat;
  /** @param {string} texte @param {string} [detail] */
  const enTete = (texte, detail) => {
    const tete = phraseEtDetail(doc, "h3", texte, detail);
    tete.className = "attendu";
    return tete;
  };
  const relire = () => gestes(doc, [boutonAction(doc, RELIRE, geste.relire)]);
  if (lu === undefined) return [enTete(LECTURE_PUBLIEE)];
  if (lu.state === "sign-in-required") return [enTete(lu.reason), ...connexionDite(doc, etat.connexion, lu.action.label, geste)];
  if (lu.state === "unavailable") {
    const lien = lu.link;
    return [
      enTete(lu.reason, lu.detail),
      ...(lu.action === undefined ? [] : connexionDite(doc, etat.connexion, lu.action.label, geste)),
      gestes(doc, [
        ...(lien === undefined ? [] : [boutonAction(doc, boutonDeLaPage(lien), () => geste.ouvrirLaPage(lien), { recommande: lu.action === undefined })]),
        boutonAction(doc, RELIRE, geste.relire, { recommande: lien === undefined && lu.action === undefined }),
      ]),
    ];
  }
  const { station, publishedAt, range } = lu;
  // Quand la station l'a publié, et d'où il vient, au survol : cela ne change rien à ce que fait le chef.
  const provenance = `published by ${station.name} at ${new Date(publishedAt).toISOString().slice(0, 16).replace("T", " ")} UTC${lu.repository === null ? "" : `, for ${lu.repository}`} — this computer does not serve this project: its rail is read on GitHub, and a ticket opens on its issue`;
  if (lu.tickets.length === 0) return [enTete(lu.reason ?? `The rail of ${lu.project}, as ${station.name} publishes it, holds no ticket.`, provenance), relire()];
  const grille = cree(doc, "div");
  // Cinq colonnes, et non les quatre du Rail du Mac : Taken et Pass n'ont pas d'onglet Cooks où se lire ici.
  grille.className = "colonnes publiees";
  grille.append(
    ...range.colonnes.map(({ nom, ton, cartes }) => {
      const colonne = cree(doc, "section");
      colonne.className = "colonne";
      colonne.dataset.ton = ton;
      const forme = geste.forme?.(ton);
      if (forme !== undefined) colonne.dataset.forme = forme;
      const tete = cree(doc, "h4");
      tete.append(cree(doc, "span", nom), cree(doc, "span", String(cartes.length)));
      const vide = cree(doc, "p", AUCUN);
      vide.className = "vide";
      colonne.append(tete, cartes.length === 0 ? vide : bons(doc, cartes, geste));
      return colonne;
    }),
  );
  const tete = enTete(station.online ? PUBLIE_PAR(station.name) : PUBLIE_HORS_LIGNE(station.name), provenance);
  return [tete, grille, ...(range.hors.length === 0 ? [] : [cree(doc, "h3", HORS_DES_COLONNES), bons(doc, range.hors, geste)])];
}
