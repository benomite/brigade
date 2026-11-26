// @ts-check
// Le premier écran d'un projet qu'« Add a project » vient d'ouvrir, quand il a des issues ouvertes (ticket 3268) : « Brigade
// read your N open issues — here are the ones to cook first ». Les lignes sont celles que le second propose (depart-du-projet.ts,
// son triage) : l'issue, une priorité, une raison en une ligne. Le chef change la priorité d'une ligne, en lâche une, puis un
// seul bouton met les lignes restantes sur le rail, avec les priorités montrées. Un projet sans issue ouverte n'a pas cet écran :
// il va droit à la question suivante du parcours.
// Ce module ne touche pas `document` : il reçoit de quoi créer un élément (briques.js), et rend des éléments.

import { boutonAction, survol } from "../briques.js";
import { ligneErreur } from "../composants/ligne-erreur/ligne-erreur.js";
import { gestes } from "../parcours-projet/connexion.js";
import { REESSAYER } from "../lexique.js";

/** @typedef {import("../briques.js").Fabrique} Fabrique */
/** @typedef {{ ticket: number, titre: string, priorite: number, raison: string }} Ligne */
// Où en est le départ : le second lit les issues (`lecture`) ; ses propositions (`propose`) ; ce qui n'a pas pu se lire
// (`sans`) ; la mise sur le rail en cours (`mise`) ; une mise dont des lignes ont été refusées (`refus`, ces lignes restent).
/** @typedef {{ phase: "lecture" } | { phase: "propose", ouvertes: number, lignes: Ligne[] } | { phase: "sans", sans: string, detail?: string } | { phase: "mise", ouvertes: number, lignes: Ligne[] } | { phase: "refus", ouvertes: number, lignes: Ligne[], refus: { ticket: number, refus: string, detail: string }[] }} Etat */

// Les priorités que le second donne, `prio:1` à `prio:3`.
export const PRIORITES = [1, 2, 3];
/** @param {number} ouvertes */
export const TITRE = (ouvertes) => `Brigade read your ${ouvertes} open issue${ouvertes === 1 ? "" : "s"} — here are the ones to cook first`;
export const LECTURE = "Brigade is reading your open issues. Nothing is awaited from you.";
export const METTRE = "put them on the rail";
export const PASSER = "not now";
export const CONTINUER = "continue";
export const LACHER = "drop";
export const RIEN_A_METTRE = "Every line was dropped: nothing will be put on the rail.";
export const MISE_EN_COURS = "Putting them on the rail…";
/** @param {string} sans */
export const SANS = (sans) => `${sans.replace(/\.$/, "")}. Waiting for you to try again, or to go on without.`;

/** @param {Fabrique} doc @param {string} balise @param {string} [texte] */
function cree(doc, balise, texte) {
  const pose = doc.createElement(balise);
  if (texte !== undefined) pose.textContent = texte;
  return pose;
}

/** @param {Fabrique} doc @param {Ligne} ligne @param {boolean} figee @param {{ changer: (ticket: number, priorite: number) => void, lacher: (ticket: number) => void }} geste */
function uneLigne(doc, ligne, figee, geste) {
  const item = cree(doc, "li");
  item.className = "ligne-de-depart";
  item.dataset.ticket = String(ligne.ticket);
  const titre = cree(doc, "span", `#${ligne.ticket} ${ligne.titre}`);
  titre.className = "titre";
  const choix = cree(doc, "select");
  choix.ariaLabel = `Priority of #${ligne.ticket}`;
  choix.append(
    ...PRIORITES.map((priorite) => {
      const option = cree(doc, "option", `prio:${priorite}`);
      option.value = String(priorite);
      option.selected = priorite === ligne.priorite;
      return option;
    }),
  );
  choix.value = String(ligne.priorite);
  choix.disabled = figee;
  choix.addEventListener("change", () => geste.changer(ligne.ticket, Number(choix.value)));
  const raison = cree(doc, "span", ligne.raison);
  raison.className = "raison";
  item.append(titre, choix, raison);
  if (!figee) item.append(boutonAction(doc, LACHER, () => geste.lacher(ligne.ticket), { sorte: "discret" }));
  return item;
}

// L'écran : le titre, les lignes, le bouton. `refus` : les lignes que la dernière mise a refusées, une phrase chacune.
/**
 * @param {Fabrique} doc
 * @param {{ depot: string, etat: Etat }} donnees
 * @param {{ changer: (ticket: number, priorite: number) => void, lacher: (ticket: number) => void, mettre: () => void, passer: () => void, relire: () => void }} geste
 */
export function poserLeDepart(doc, { depot, etat }, geste) {
  const racine = cree(doc, "section");
  racine.className = "parcours-premier-projet depart-du-projet carte";
  racine.dataset.etape = "depart";
  racine.dataset.phase = etat.phase;
  if (etat.phase === "lecture") {
    racine.ariaLabel = `${depot}: its open issues`;
    const dit = cree(doc, "p", LECTURE);
    dit.className = "phrase";
    racine.append(dit);
    return racine;
  }
  if (etat.phase === "sans") {
    racine.ariaLabel = `${depot}: its open issues`;
    const dit = cree(doc, "p", SANS(etat.sans));
    dit.className = "phrase";
    if ((etat.detail ?? "").trim() !== "") dit.append(survol(doc, etat.detail ?? ""));
    racine.append(dit, gestes(doc, [boutonAction(doc, REESSAYER, geste.relire, { recommande: true }), boutonAction(doc, PASSER, geste.passer)]));
    return racine;
  }
  const titre = cree(doc, "h2", TITRE(etat.ouvertes));
  titre.className = "attendu";
  racine.ariaLabel = TITRE(etat.ouvertes);
  const figee = etat.phase === "mise";
  const liste = cree(doc, "ul");
  liste.className = "lignes-de-depart";
  liste.append(...etat.lignes.map((ligne) => uneLigne(doc, ligne, figee, geste)));
  racine.append(titre, liste);
  if (etat.phase === "refus") for (const { refus, detail } of etat.refus) racine.append(ligneErreur(doc, refus, detail, { classe: "erreur" }));
  if (figee) {
    const dit = cree(doc, "p", MISE_EN_COURS);
    dit.className = "phrase";
    racine.append(dit);
  } else if (etat.lignes.length === 0) {
    const dit = cree(doc, "p", RIEN_A_METTRE);
    dit.className = "phrase";
    racine.append(dit, gestes(doc, [boutonAction(doc, CONTINUER, geste.passer, { recommande: true })]));
  } else {
    racine.append(gestes(doc, [boutonAction(doc, METTRE, geste.mettre, { recommande: true }), boutonAction(doc, PASSER, geste.passer)]));
  }
  return racine;
}

// Les départs tenus pour la vue, un par projet que « Add a project » a ouvert : tenus le temps que l'app tourne ; un projet
// sans départ (sans issue ouverte, passé ou mis sur le rail) n'en a pas, et la page va à la question suivante.
/** @param {{ rendre: (projet: string) => void }} options */
export function tenirLesDeparts({ rendre }) {
  /** @type {Map<string, Etat>} */
  const tenus = new Map();
  /** @param {string} projet @param {Etat | undefined} etat */
  const poser = (projet, etat) => {
    if (etat === undefined) tenus.delete(projet);
    else tenus.set(projet, etat);
    rendre(projet);
  };
  return {
    /** @param {string} projet @returns {Etat | undefined} */
    de: (projet) => tenus.get(projet),
    /** @param {string} projet */
    commencer: (projet) => poser(projet, { phase: "lecture" }),
    // Ce que le second a proposé : sans issue ouverte, ou sans rien à proposer, le départ s'efface.
    /** @param {string} projet @param {{ ouvertes: number, lignes: Ligne[] } | { aucune: true } | { sans: string, detail?: string }} depart */
    recu(projet, depart) {
      if (tenus.get(projet)?.phase !== "lecture") return;
      if ("aucune" in depart) return poser(projet, undefined);
      if ("sans" in depart) return poser(projet, { phase: "sans", sans: depart.sans, ...(depart.detail === undefined ? {} : { detail: depart.detail }) });
      poser(projet, depart.lignes.length === 0 ? undefined : { phase: "propose", ouvertes: depart.ouvertes, lignes: depart.lignes });
    },
    /** @param {string} projet @param {number} ticket @param {number} priorite */
    changer(projet, ticket, priorite) {
      const etat = tenus.get(projet);
      if (etat === undefined || (etat.phase !== "propose" && etat.phase !== "refus")) return;
      poser(projet, { ...etat, lignes: etat.lignes.map((ligne) => (ligne.ticket === ticket ? { ...ligne, priorite } : ligne)) });
    },
    /** @param {string} projet @param {number} ticket */
    lacher(projet, ticket) {
      const etat = tenus.get(projet);
      if (etat === undefined || (etat.phase !== "propose" && etat.phase !== "refus")) return;
      const lignes = etat.lignes.filter((ligne) => ligne.ticket !== ticket);
      poser(projet, etat.phase === "refus" ? { ...etat, lignes, refus: etat.refus.filter((un) => un.ticket !== ticket) } : { ...etat, lignes });
    },
    // Les lignes à mettre sur le rail, telles que l'écran les montre ; la mise commence.
    /** @param {string} projet @returns {{ ouvertes: number, lignes: Ligne[] } | undefined} */
    commencerLaMise(projet) {
      const etat = tenus.get(projet);
      if (etat === undefined || (etat.phase !== "propose" && etat.phase !== "refus") || etat.lignes.length === 0) return undefined;
      const { ouvertes, lignes } = etat;
      poser(projet, { phase: "mise", ouvertes, lignes });
      return { ouvertes, lignes };
    },
    // La mise est faite : ce qui est refusé reste à l'écran, avec sa cause ; sinon le départ s'efface.
    /** @param {string} projet @param {number[]} faites @param {{ ticket: number, refus: string, detail: string }[]} refus */
    mise(projet, faites, refus) {
      const etat = tenus.get(projet);
      if (etat === undefined || etat.phase !== "mise") return;
      const restent = etat.lignes.filter(({ ticket }) => !faites.includes(ticket));
      poser(projet, restent.length === 0 && refus.length === 0 ? undefined : { phase: "refus", ouvertes: etat.ouvertes, lignes: restent, refus: refus.length === 0 ? [{ ticket: 0, refus: "some lines were not put on the rail", detail: "" }] : refus });
    },
    // La mise n'a pas pu partir : les lignes reviennent, avec ce qui l'a empêchée.
    /** @param {string} projet @param {string} refus @param {string} detail */
    miseRatee(projet, refus, detail) {
      const etat = tenus.get(projet);
      if (etat === undefined || etat.phase !== "mise") return;
      poser(projet, { phase: "refus", ouvertes: etat.ouvertes, lignes: etat.lignes, refus: [{ ticket: 0, refus, detail }] });
    },
    /** @param {string} projet */
    passer: (projet) => poser(projet, undefined),
    /** @param {string} projet */
    relire: (projet) => poser(projet, { phase: "lecture" }),
  };
}
