// @ts-check
// La visite d'une vraie cuisine (ticket 4087, épique 4086 ; née visite guidée du premier lancement, ticket 3165). Offerte, jamais
// imposée : l'écran d'accueil la propose à côté de « add my project » (accueil/choix/choix.js), et l'entrée « ? » de la barre
// la rejoue. Elle montre la cuisine de Brigade elle-même, benomite/brigade, en lecture seule : son rail lu sur GitHub par
// des lectures seules (visite.ts, côté process principal) — rien n'est cloné, aucun projet n'est ajouté, rien n'est écrit
// dans ~/Brigade. La lecture seule tient à la visite, pas aux droits du compte : même un compte qui peut écrire dans
// benomite/brigade n'y voit aucun geste sur un ticket. Par-dessus, la bulle de la visite guidée : six étapes, dans
// l'ordre — le rail et ses colonnes, une carte en cuisson, la pass qui juge une livraison, un ticket servi, TODO et ce
// qu'une carte demande, le second. Chaque étape désigne un élément de l'écran (`trouverLaCible`, `marquerLaCible`) et dit
// en une ou deux phrases ce que le nouveau venu voit, avec le mot de Brigade (docs/glossary.md). Quand le moment n'a rien
// à montrer — aucun cook en cours, rien en pass —, l'étape le dit et montre le dernier exemple à la place : le dernier
// ticket servi, la dernière livraison jugée. « leave the visit », en tête, ramène à l'écran d'accueil à toute étape ; la
// dernière finit sur un seul geste : « add my project ».
// Ce module ne touche pas `document` : il reçoit de quoi créer un élément (briques.js), et rend des éléments.

import { boutonAction } from "../briques.js";
import { bouton } from "../composants/bouton/bouton.js";
import { ligneErreur } from "../composants/ligne-erreur/ligne-erreur.js";
import { gestes } from "../parcours-projet/connexion.js";
import { LECTURE_DE } from "../lexique.js";
import { LISTE_DU_CHEF, colonneDe } from "../todo/todo.js";
import { AJOUTER_LE_MIEN } from "../accueil/choix/choix.js";

/** @typedef {import("../briques.js").Fabrique} Fabrique */
/** @typedef {import("../../faits.ts").Colonne} Colonne */
/** @typedef {Pick<Colonne, "nom" | "cartes" | "autres">} ColonneLue */
// Ce que l'étape désigne : une colonne du rail, une carte de cette colonne, le rail entier, l'entrée « TODO (N) », ou le second.
/** @typedef {{ colonne?: string, ticket?: number, todo?: true, second?: true }} Cible */
// `mot` : le mot de Brigade pour ce qui est montré, en titre. `exemple` : le moment n'a rien à montrer, l'étape montre
// le dernier exemple à la place.
/** @typedef {{ cle: string, mot: string, texte: string, cible: Cible, exemple?: true }} Etape */
/** @typedef {{ rang: number }} VisiteEnCours */
/** @typedef {{ suivante: () => void, ajouter: () => void }} GestesDeLaVisite */
// Ce que le process principal a lu de la cuisine visitée (visite.ts) : son tableau, ou pourquoi il ne s'est pas lu.
/** @typedef {import("../../visite.ts").CuisineVisitee} CuisineVisitee */
/** @typedef {{ quitter: () => void, relire: () => void }} GestesDeLaCuisine */

// La cuisine visitée : celle de Brigade, cuisinée chaque jour en public. Le process principal (visite.ts) ne lit qu'elle.
export const DEPOT_DE_LA_VISITE = "benomite/brigade";

// Les colonnes du rail, telles que faits.ts les nomme.
const TAKEN = "Taken";
const PASS = "Pass";
const SERVED = "Served";

export const TITRE_DE_LA_VISITE = "Tour of a real kitchen";
/** @param {number} rang @param {number} total */
export const RANG = (rang, total) => `${TITRE_DE_LA_VISITE} · ${rang} of ${total}`;
export const SUIVANTE = "next";
const QUITTER = "leave the visit";
export const QUITTER_SURVOL = "Back to the welcome screen. Nothing was added or cloned.";
export const AJOUTER_LE_SIEN = AJOUTER_LE_MIEN;
export const REJOUER = "Replay the visit";
export const TITRE_DE_LA_CUISINE = "Brigade's own kitchen";
const LECTURE_SEULE = "Read-only: you watch the kitchen cook, nothing here acts on its tickets.";
const SECOND_DE_LA_VISITE = "Your second opens with your own project.";
const CUISINE_ILLISIBLE = "Brigade's kitchen cannot be read right now.";
const RELIRE = "read again";
export const LECTURE_DU_RAIL = LECTURE_DE("the rail");

export const MOT_RAIL = "The rail";
export const MOT_COOK = "A cook";
export const MOT_PASS = "The pass";
export const MOT_SERVED = "Served";
export const MOT_TODO = "TODO";
export const MOT_SECOND = "The second";

/** @param {string[]} colonnes */
export const TEXTE_RAIL = (colonnes) => `This is the rail: every ticket the kitchen serves, one column per step — ${colonnes.join(", ")}. A ticket moves from left to right as it is cooked, judged and served.`;
/** @param {number} ticket */
export const COOK_EN_COURS = (ticket) => `#${ticket} is taken: a cook, a claude session in its own worktree, is cooking it right now. When it is done, the cook hands over its delivery as a pull request.`;
/** @param {number} ticket */
export const COOK_EXEMPLE = (ticket) => `No cook is running right now. Here is the last served ticket instead, #${ticket}: a cook took it, cooked it and handed over its delivery.`;
export const COOK_SANS_EXEMPLE = "No cook is running right now, and no ticket was served in the last 24 h to show instead. When a cook takes a ticket, its card sits in Taken while it cooks.";
/** @param {number} ticket */
export const PASS_EN_COURS = (ticket) => `#${ticket} is in the pass: the pass is judging its delivery — gates, CI, an independent review — before it is merged.`;
/** @param {number} ticket */
export const PASS_EXEMPLE = (ticket) => `Nothing is in the pass right now. Here is the last delivery it judged instead, #${ticket}: the pass let it through, and it was merged.`;
export const PASS_SANS_EXEMPLE = "Nothing is in the pass right now, and no delivery was judged in the last 24 h to show instead. A delivery sits in Pass while the pass judges it.";
/** @param {number} ticket */
export const SERVI = (ticket) => `#${ticket} is served: the pass judged its delivery and merged it. Served keeps the tickets of the last 24 h.`;
export const SERVI_SANS_EXEMPLE = "No ticket was served in the last 24 h. A ticket lands in Served once the pass has merged its delivery.";
/** @param {number} ticket */
export const TODO_EN_COURS = (ticket) => `#${ticket} awaits a human: its card turns red in the column of its step, counted by the TODO, and asks one question only a human can answer — a product choice, a design choice or a review. The answer is given on the card, and the kitchen goes on.`;
export const TODO_VIDE = "Nothing awaits a human right now. When the kitchen needs a decision only a human can make, the ticket's card turns red in the column of its step, counted by the TODO, and asks it.";
export const TEXTE_SECOND = "This is the second: your product assistant for this project, a claude session at your side. Ask it what you see on the rail, or to write a ticket with you.";

/** @param {ColonneLue[]} colonnes @param {string} nom */
const cartesDe = (colonnes, nom) => colonnes.find((colonne) => colonne.nom === nom)?.cartes ?? [];

// Les six étapes, d'après les colonnes que le rail montre en ce moment. Absentes, le rail n'est pas encore lu : les étapes
// qui ont besoin d'un exemple le disent, et se reposent à la lecture suivante.
/** @param {ColonneLue[] | undefined} colonnes @returns {Etape[]} */
export function etapesDeLaVisite(colonnes) {
  const rail = { cle: "rail", mot: MOT_RAIL, cible: {} };
  const second = { cle: "second", mot: MOT_SECOND, texte: TEXTE_SECOND, cible: { second: /** @type {true} */ (true) } };
  if (colonnes === undefined) {
    return [
      { ...rail, texte: LECTURE_DU_RAIL },
      { cle: "cook", mot: MOT_COOK, texte: LECTURE_DU_RAIL, cible: { colonne: TAKEN } },
      { cle: "pass", mot: MOT_PASS, texte: LECTURE_DU_RAIL, cible: { colonne: PASS } },
      { cle: "served", mot: MOT_SERVED, texte: LECTURE_DU_RAIL, cible: { colonne: SERVED } },
      { cle: "todo", mot: MOT_TODO, texte: LECTURE_DU_RAIL, cible: { todo: true } },
      second,
    ];
  }
  // Le dernier servi d'abord : Served tient ses cartes de la plus récente à la plus ancienne (rail/github.ts).
  const [dernierServi] = cartesDe(colonnes, SERVED);
  /** @param {string} colonne @param {(ticket: number) => string} enCours @param {(ticket: number) => string} exemple @param {string} sansExemple */
  const vivante = (colonne, enCours, exemple, sansExemple) => {
    const [carte] = cartesDe(colonnes, colonne);
    if (carte !== undefined) return { texte: enCours(carte.ticket), cible: { colonne, ticket: carte.ticket } };
    if (dernierServi !== undefined) return { texte: exemple(dernierServi.ticket), cible: { colonne: SERVED, ticket: dernierServi.ticket }, exemple: /** @type {true} */ (true) };
    return { texte: sansExemple, cible: { colonne } };
  };
  // TODO n'est pas une colonne (ticket 3458) : l'écran montre les colonnes des étapes, et la liste de ce qui attend le chef
  // en pose les cartes, rouges, dans la colonne de leur étape. Les cartes du chef d'abord, puis celles qui attendent un
  // autre humain du projet (ticket 2985), repliées à côté de l'entrée « TODO (N) ».
  const etapes = colonnes.filter(({ nom }) => nom !== LISTE_DU_CHEF).map(({ nom }) => nom);
  const todo = colonnes.find(({ nom }) => nom === LISTE_DU_CHEF);
  const [rouge] = todo?.cartes ?? [];
  const [dAutrui] = todo?.autres ?? [];
  /** @type {Cible} */
  const cibleTodo = rouge !== undefined ? { colonne: colonneDe(rouge, etapes), ticket: rouge.ticket } : dAutrui !== undefined ? { todo: true, ticket: dAutrui.ticket } : { todo: true };
  const question = rouge ?? dAutrui;
  return [
    { ...rail, texte: TEXTE_RAIL(etapes) },
    { cle: "cook", mot: MOT_COOK, ...vivante(TAKEN, COOK_EN_COURS, COOK_EXEMPLE, COOK_SANS_EXEMPLE) },
    { cle: "pass", mot: MOT_PASS, ...vivante(PASS, PASS_EN_COURS, PASS_EXEMPLE, PASS_SANS_EXEMPLE) },
    { cle: "served", mot: MOT_SERVED, ...(dernierServi === undefined ? { texte: SERVI_SANS_EXEMPLE, cible: { colonne: SERVED } } : { texte: SERVI(dernierServi.ticket), cible: { colonne: SERVED, ticket: dernierServi.ticket } }) },
    { cle: "todo", mot: MOT_TODO, texte: question === undefined ? TODO_VIDE : TODO_EN_COURS(question.ticket), cible: cibleTodo },
    second,
  ];
}

/** @param {any} racine @returns {any[]} */
function descendants(racine) {
  return [...(racine?.children ?? [])].flatMap((enfant) => [enfant, ...descendants(enfant)]);
}

// L'élément vivant que l'étape désigne, dans le rail tel qu'il est posé : la carte (`data-ticket`) dans sa colonne
// (`data-colonne`) ou à côté de l'entrée « TODO (N) », sinon sa colonne ou cette entrée, sinon la rangée des colonnes, sinon
// le rail. Le second, c'est sa colonne.
/** @param {{ rail: any, second: any }} ecran @param {Cible} cible @returns {any} */
export function trouverLaCible({ rail, second }, cible) {
  if (cible.second === true) return second;
  const poses = descendants(rail);
  const rangee = poses.find((pose) => String(pose.className ?? "").split(" ").includes("colonnes")) ?? rail;
  const todo = cible.todo === true ? poses.find((pose) => String(pose.className ?? "").split(" ").includes("todo-du-rail")) : undefined;
  if (cible.colonne === undefined && todo === undefined) return rangee;
  const colonne = todo ?? poses.find((pose) => pose.dataset?.colonne === cible.colonne);
  if (colonne === undefined) return rangee;
  if (cible.ticket === undefined) return colonne;
  return descendants(colonne).find((pose) => pose.dataset?.ticket === String(cible.ticket)) ?? colonne;
}

// L'élément désigné porte `data-visite` — la feuille l'entoure de l'accent — et vient en vue ; le précédent le perd.
/** @returns {(cible: any) => void} */
export function marqueurDeCible() {
  /** @type {any} */
  let marquee;
  return (cible) => {
    if (marquee !== undefined && marquee !== cible) delete marquee.dataset.visite;
    marquee = cible;
    if (cible === undefined) return;
    cible.dataset.visite = "";
    cible.scrollIntoView?.({ block: "nearest", inline: "nearest" });
  };
}

// La bulle de l'étape : où on en est, le mot de Brigade, ce que le nouveau venu voit ; puis le geste qui avance — à la
// dernière, le seul appel à agir, « add my project ». De quoi quitter la visite est en tête de son écran, à chaque étape.
/** @param {Fabrique} doc @param {{ etapes: Etape[], rang: number }} etat @param {GestesDeLaVisite} geste */
export function poserVisite(doc, { etapes, rang }, geste) {
  const etape = etapes[rang] ?? etapes[0];
  const derniere = rang >= etapes.length - 1;
  const racine = doc.createElement("div");
  racine.className = "visite";
  racine.role = "dialog";
  racine.ariaLabel = TITRE_DE_LA_VISITE;
  racine.dataset.etape = etape?.cle ?? "";
  if (etape?.exemple === true) racine.dataset.exemple = "";
  const ou = doc.createElement("p");
  ou.className = "rang";
  ou.textContent = RANG(rang + 1, etapes.length);
  const mot = doc.createElement("h3");
  mot.textContent = etape?.mot ?? "";
  const dit = doc.createElement("p");
  dit.className = "dit";
  dit.textContent = etape?.texte ?? "";
  racine.append(
    ou,
    mot,
    dit,
    gestes(doc, [derniere ? boutonAction(doc, AJOUTER_LE_SIEN, geste.ajouter, { recommande: true }) : boutonAction(doc, SUIVANTE, geste.suivante, { recommande: true })]),
  );
  return racine;
}

// Une carte de la cuisine visitée : son numéro, son titre, son état — à lire, sans geste. `attente` : elle attend un humain
// de la cuisine, rouge dans la colonne de son étape, comme sur le rail (ticket 3458).
/** @param {Fabrique} doc @param {import("../../faits.ts").Carte} carte @param {boolean} attente */
function carteVisitee(doc, carte, attente) {
  const li = doc.createElement("li");
  li.className = "carte-visitee";
  li.dataset.ticket = String(carte.ticket);
  if (attente) li.dataset.carte = "attente";
  const numero = doc.createElement("span");
  numero.className = "numero-visite mono";
  numero.textContent = `#${carte.ticket}`;
  li.append(numero);
  if (carte.mot !== undefined && carte.mot !== "") {
    const mot = doc.createElement("span");
    mot.className = "mot-visite";
    if (carte.ton !== undefined) mot.dataset.ton = carte.ton;
    mot.textContent = carte.mot;
    li.append(mot);
  }
  const titre = doc.createElement("p");
  titre.className = "titre-visite";
  titre.textContent = carte.titre ?? "";
  li.append(titre);
  return li;
}

// Le rail de la cuisine visitée, tel que l'écran d'un projet le range : une colonne par étape (`data-colonne`), une carte
// par ticket (`data-ticket`). TODO n'est pas une colonne (ticket 3458) : ses cartes viennent en tête de la colonne de leur
// étape.
/** @param {Fabrique} doc @param {ColonneLue[]} colonnes */
function colonnesVisitees(doc, colonnes) {
  const rangee = doc.createElement("div");
  rangee.className = "colonnes";
  const etapes = colonnes.filter(({ nom }) => nom !== LISTE_DU_CHEF);
  const rouges = colonnes.find(({ nom }) => nom === LISTE_DU_CHEF)?.cartes ?? [];
  const noms = etapes.map(({ nom }) => nom);
  for (const colonne of etapes) {
    const section = doc.createElement("section");
    section.className = "colonne";
    section.dataset.colonne = colonne.nom;
    const tete = doc.createElement("h4");
    const nom = doc.createElement("span");
    nom.textContent = colonne.nom;
    const venues = rouges.filter((carte) => colonneDe(carte, noms) === colonne.nom);
    const compte = doc.createElement("span");
    compte.textContent = String(venues.length + colonne.cartes.length);
    tete.append(nom, compte);
    section.append(tete);
    if (venues.length + colonne.cartes.length === 0) {
      const vide = doc.createElement("p");
      vide.textContent = /** @type {{ vide?: string }} */ (colonne).vide ?? "";
      section.append(vide);
    } else {
      const liste = doc.createElement("ol");
      liste.append(...venues.map((carte) => carteVisitee(doc, carte, true)), ...colonne.cartes.map((carte) => carteVisitee(doc, carte, false)));
      section.append(liste);
    }
    rangee.append(section);
  }
  return rangee;
}

// L'écran de la visite : en tête, la cuisine visitée, la ligne qui la dit en lecture seule et « leave the visit » ; dessous,
// son rail — en lecture, lu, ou pourquoi il ne se lit pas, avec « read again » — et, à côté, la colonne du second, que
// la visite n'ouvre pas. Aucun geste sur un ticket : ni créer, ni déplacer, ni commenter, ni fermer, ni lancer. Rend
// l'écran, et ses deux éléments que les étapes désignent.
/** @param {Fabrique} doc @param {CuisineVisitee | undefined} lue @param {GestesDeLaCuisine} geste */
export function poserLaCuisineVisitee(doc, lue, geste) {
  const racine = doc.createElement("div");
  racine.className = "cuisine-visitee";
  const tete = doc.createElement("header");
  tete.className = "tete-de-la-visite";
  const titre = doc.createElement("h2");
  titre.textContent = TITRE_DE_LA_CUISINE;
  const depot = doc.createElement("span");
  depot.className = "mono";
  depot.textContent = DEPOT_DE_LA_VISITE;
  const seule = doc.createElement("p");
  seule.className = "lecture-seule-de-la-visite";
  seule.textContent = LECTURE_SEULE;
  const quitter = bouton(doc, QUITTER, geste.quitter);
  quitter.title = QUITTER_SURVOL;
  quitter.dataset.geste = "quitter-la-visite";
  tete.append(titre, depot, seule, quitter);
  const rail = doc.createElement("section");
  rail.className = "rail-de-la-visite";
  rail.ariaLabel = "The rail";
  if (lue === undefined) {
    const lecture = doc.createElement("p");
    lecture.className = "lecture";
    lecture.textContent = LECTURE_DU_RAIL;
    rail.append(lecture);
  } else if ("tableau" in lue) {
    rail.append(colonnesVisitees(doc, lue.tableau.rail.colonnes));
  } else {
    rail.append(ligneErreur(doc, CUISINE_ILLISIBLE, lue.sans), gestes(doc, [boutonAction(doc, RELIRE, geste.relire, { recommande: true })]));
  }
  const second = doc.createElement("aside");
  second.className = "second-de-la-visite";
  const mot = doc.createElement("h4");
  mot.textContent = MOT_SECOND;
  const dit = doc.createElement("p");
  dit.textContent = SECOND_DE_LA_VISITE;
  second.append(mot, dit);
  const corps = doc.createElement("div");
  corps.className = "corps-de-la-visite";
  corps.append(rail, second);
  racine.append(tete, corps);
  return { racine, rail, second };
}

// La visite tenue pour la vue : en cours ou non, et son étape. Rien n'en est gardé : elle ne démarre jamais d'elle-même,
// seulement du choix de l'écran d'accueil ou de l'entrée qui la rejoue, et repart alors de sa première étape.
/** @param {{ rendre: () => void }} options */
export function tenirLaVisite({ rendre }) {
  /** @type {VisiteEnCours | undefined} */
  let enCours;
  return {
    get etat() {
      return enCours;
    },
    commencer() {
      enCours = { rang: 0 };
      rendre();
    },
    /** @param {number} total */
    suivante(total) {
      if (enCours === undefined) return;
      enCours = { rang: Math.min(enCours.rang + 1, total - 1) };
      rendre();
    },
    quitter() {
      enCours = undefined;
      rendre();
    },
  };
}
