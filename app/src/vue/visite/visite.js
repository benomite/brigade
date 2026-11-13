// @ts-check
// La visite guidée du premier lancement (ticket 3165, épique 3162). Sur un ordinateur neuf, le compte GitHub lu, l'app
// ajoute d'elle-même benomite/brigade — la cuisine de démonstration, cuisinée chaque jour en public — et ouvre la visite
// sur ses vrais écrans : six étapes, dans l'ordre — le rail et ses colonnes, une carte en cuisson, la pass qui juge une
// livraison, un ticket servi, TODO et ce qu'une carte demande, le second. Chaque étape désigne un élément vivant
// de l'écran (`trouverLaCible`, `marquerLaCible`) et dit en une ou deux phrases ce que le nouveau venu voit, avec le mot
// de Brigade (docs/glossary.md). Quand le moment n'a rien à montrer — aucun cook en cours, rien en pass —, l'étape le dit
// et montre le dernier exemple à la place : le dernier ticket servi, la dernière livraison jugée.
// La visite se montre une fois, au premier lancement ; elle se passe à chaque étape, se rejoue depuis la barre, et finit
// sur un seul geste : « add your own project ».
// Ce module ne touche pas `document` : il reçoit de quoi créer un élément (briques.js), et rend des éléments.

import { boutonAction } from "../briques.js";
import { gestes } from "../parcours-projet/connexion.js";
import { LECTURE_DE } from "../lexique.js";
import { LISTE_DU_CHEF, colonneDe } from "../todo/todo.js";

/** @typedef {import("../briques.js").Fabrique} Fabrique */
/** @typedef {import("../../faits.ts").Colonne} Colonne */
/** @typedef {Pick<Colonne, "nom" | "cartes" | "autres">} ColonneLue */
// Ce que l'étape désigne : une colonne du rail, une carte de cette colonne, le rail entier, l'entrée « TODO (N) », ou le second.
/** @typedef {{ colonne?: string, ticket?: number, todo?: true, second?: true }} Cible */
// `mot` : le mot de Brigade pour ce qui est montré, en titre. `exemple` : le moment n'a rien à montrer, l'étape montre
// le dernier exemple à la place.
/** @typedef {{ cle: string, mot: string, texte: string, cible: Cible, exemple?: true }} Etape */
/** @typedef {{ projet: string, rang: number }} VisiteEnCours */
/** @typedef {{ suivante: () => void, passer: () => void, ajouter: () => void }} GestesDeLaVisite */

// La cuisine de démonstration, et le nom que le fichier des projets lui donne.
export const DEPOT_DE_LA_VISITE = "benomite/brigade";
export const PROJET_DE_LA_VISITE = "brigade";
// La trace, dans le stockage de la vue, que la visite a été montrée : présente, l'app n'ajoute plus rien et ne la montre
// plus d'elle-même.
export const CLE_DE_LA_VISITE = "brigade.visite";

// Les colonnes du rail, telles que faits.ts les nomme.
const TAKEN = "Taken";
const PASS = "Pass";
const SERVED = "Served";

export const TITRE_DE_LA_VISITE = "Tour of a real kitchen";
/** @param {number} rang @param {number} total */
export const RANG = (rang, total) => `${TITRE_DE_LA_VISITE} · ${rang} of ${total}`;
export const SUIVANTE = "next";
export const PASSER = "skip the tour";
export const AJOUTER_LE_SIEN = "add your own project";
export const REJOUER = "Replay the tour";
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
// dernière, le seul appel à agir, « add your own project » —, et, à chaque étape, de quoi passer la visite.
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
    gestes(doc, [derniere ? boutonAction(doc, AJOUTER_LE_SIEN, geste.ajouter, { recommande: true }) : boutonAction(doc, SUIVANTE, geste.suivante, { recommande: true }), boutonAction(doc, PASSER, geste.passer, { sorte: "discret" })]),
  );
  return racine;
}

// La visite tenue pour la vue : celle en cours — son projet, son étape —, et la trace qu'elle a été montrée, dans le
// stockage de la vue (`localStorage`, qui survit à la fermeture de l'app). `aDecouvrir` : aucune trace, c'est le premier
// lancement. Un stockage absent ou illisible n'est pas un premier lancement : l'app n'ajouterait le projet, et ne
// montrerait la visite, à chaque lancement. Commencée, la visite laisse sa trace : passée, finie ou interrompue, elle ne
// revient pas d'elle-même. Une trace qui ne s'écrit pas n'arrête pas la visite : au lancement suivant, le projet ajouté
// est dans le fichier, et le premier lancement n'est plus.
/** @param {{ stockage: { getItem(cle: string): string | null, setItem(cle: string, valeur: string): void } | undefined, rendre: () => void, maintenant?: () => string }} options */
export function tenirLaVisite({ stockage, rendre, maintenant = () => new Date().toISOString() }) {
  /** @type {VisiteEnCours | undefined} */
  let enCours;
  return {
    get etat() {
      return enCours;
    },
    aDecouvrir() {
      if (stockage === undefined) return false;
      try {
        return stockage.getItem(CLE_DE_LA_VISITE) === null;
      } catch {
        return false;
      }
    },
    /** @param {string} projet */
    commencer(projet) {
      try {
        stockage?.setItem(CLE_DE_LA_VISITE, JSON.stringify({ montree: maintenant() }));
      } catch {
        // Voir plus haut : le fichier des projets tient le projet ajouté, le lancement suivant n'est plus le premier.
      }
      enCours = { projet, rang: 0 };
      rendre();
    },
    /** @param {number} total */
    suivante(total) {
      if (enCours === undefined) return;
      enCours = { ...enCours, rang: Math.min(enCours.rang + 1, total - 1) };
      rendre();
    },
    fermer() {
      enCours = undefined;
      rendre();
    },
  };
}
