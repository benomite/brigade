// @ts-check
// Les tickets récurrents du projet sous Settings (ticket 3231, épique 3216) : ceux que sa cuisine tient (`recurring`,
// runtime/src/recurrents/, ticket 3230), une rangée chacun — son titre, son rythme en mots (« every week on Monday ») et la
// date de sa prochaine occurrence ; suspendu, il le dit (« paused ») et ne montre aucune date. Chaque rangée a deux gestes,
// d'un clic chacun, sans confirmation : « pause » ou « resume », et « remove ». La rangée change sur ce que le runtime
// rend ; refusé, le refus se dit en une ligne sur la rangée, et elle reste ce qu'elle était.
//
// Le service a ce contrat : `list()` rend les tickets récurrents ; `pause(id)` et `resume(id)` rendent le ticket changé ;
// `remove(id)` rend `{ retire: true }` ; chaque geste peut rendre un refus d'une ligne. Ce module ne touche pas
// `document` : il reçoit de quoi créer un élément (briques.js), et le conteneur où se poser.

import { boutonAction, survol } from "../briques.js";
import { ligneErreur } from "../composants/ligne-erreur/ligne-erreur.js";
import { ligneVide } from "../composants/ligne-vide/ligne-vide.js";
import { NON_ATTEINT, PAS_ENCORE } from "../lexique.js";

/** @typedef {import("../briques.js").Fabrique} Fabrique */
/** @typedef {import("./recurrents-box.ts").Recurrent} Recurrent */
/** @typedef {import("./recurrents-box.ts").Rythme} Rythme */
/** @typedef {import("./recurrents-box.ts").EcritureDUnRecurrent} Rendu */
// `list` rend `undefined` quand le pont ne porte pas les tickets récurrents (un téléphone) : la section ne se pose pas ;
// `{ sans }` quand ils ne se lisent pas : la section le dit en une ligne.
/** @typedef {{ list(): Promise<Recurrent[] | { sans: string, detail?: string } | undefined>, pause(id: string): Promise<Rendu>, resume(id: string): Promise<Rendu>, remove(id: string): Promise<Rendu> }} Service */
// Une rangée : le ticket récurrent, le geste en route, et le refus du dernier.
/** @typedef {{ recurrent: Recurrent, enCours?: boolean, refus?: { ligne: string, detail: string } }} Rangee */
/** @typedef {{ lecture: "en-cours" } | { lecture: "sans" } | { lecture: "refus", ligne: string, detail: string } | { lecture: "lue", rangees: Rangee[] }} Etat */

export const TITRE = "recurring tickets";
export const MOTS = {
  aide: "Tickets that come back on a rhythm: on its next date, each one becomes an issue and lands on the rail like any ticket. A paused one creates nothing.",
  vide: PAS_ENCORE("recurring tickets"),
  indisponible: NON_ATTEINT("recurring tickets"),
  pause: "pause",
  resume: "resume",
  retirer: "remove",
  suspendu: "paused",
  prochaine: "next",
  rienEnvoye: "nothing was changed: no answer from the service",
};

const JOURS = ["Monday", "Tuesday", "Wednesday", "Thursday", "Friday", "Saturday", "Sunday"];

// Le rang d'un jour du mois en anglais : 1st, 2nd, 3rd, 4th… 11th, 12th, 13th… 21st, 22nd, 23rd… 31st.
/** @param {number} jour */
export function rang(jour) {
  const dizaine = jour % 100;
  if (dizaine >= 11 && dizaine <= 13) return `${jour}th`;
  return `${jour}${{ 1: "st", 2: "nd", 3: "rd" }[jour % 10] ?? "th"}`;
}

// Le rythme en mots : « every day », « every week on Monday », « every month on the 15th ».
/** @param {Rythme} rythme */
export function rythmeEnMots(rythme) {
  if (rythme.kind === "weekly") return `every week on ${JOURS[rythme.weekday - 1] ?? "?"}`;
  if (rythme.kind === "monthly") return `every month on the ${rang(rythme.dayOfMonth)}`;
  return "every day";
}

// La date d'une occurrence, un jour UTC `YYYY-MM-DD` : « Mon, Oct 19 » — l'année en plus quand ce n'est pas celle d'aujourd'hui.
/** @param {string} jour @param {number} [maintenant] */
export function dateEnMots(jour, maintenant = Date.now()) {
  const date = new Date(`${jour}T00:00:00Z`);
  if (Number.isNaN(date.getTime())) return jour;
  const autreAnnee = date.getUTCFullYear() !== new Date(maintenant).getUTCFullYear();
  return date.toLocaleDateString("en-US", { weekday: "short", month: "short", day: "numeric", ...(autreAnnee ? { year: "numeric" } : {}), timeZone: "UTC" });
}

/** @param {Fabrique} doc @param {string} balise @param {string} [texte] */
function cree(doc, balise, texte) {
  const pose = doc.createElement(balise);
  if (texte !== undefined) pose.textContent = texte;
  return pose;
}

// Une rangée : le titre ; son rythme en mots et sa prochaine date — ou « paused » ; « pause » ou « resume », et « remove ».
// Dessous, le refus du dernier geste, en une ligne.
/**
 * @param {Fabrique} doc
 * @param {{ rangee: Rangee, gestes: { basculer: (rangee: Rangee) => void, retirer: (rangee: Rangee) => void } }} options
 */
export function poserUnRecurrent(doc, { rangee, gestes }) {
  const { recurrent } = rangee;
  const racine = cree(doc, "div");
  racine.className = recurrent.paused ? "recurrent suspendu" : "recurrent";
  racine.dataset.id = recurrent.id;

  const titre = cree(doc, "strong", recurrent.title);
  titre.className = "titre";
  titre.title = recurrent.title;

  const quand = cree(doc, "span");
  quand.className = "quand";
  const rythme = cree(doc, "span", rythmeEnMots(recurrent.rhythm));
  rythme.className = "rythme";
  quand.append(rythme);
  if (recurrent.paused) {
    const suspendu = cree(doc, "span", MOTS.suspendu);
    suspendu.className = "etat-suspendu";
    quand.append(suspendu);
  } else {
    const prochaine = cree(doc, "span", `${MOTS.prochaine} ${dateEnMots(recurrent.nextDate)}`);
    prochaine.className = "prochaine";
    prochaine.dataset.date = recurrent.nextDate;
    quand.append(prochaine);
  }

  const occupe = rangee.enCours === true;
  const gesteBascule = boutonAction(doc, recurrent.paused ? MOTS.resume : MOTS.pause, () => gestes.basculer(rangee));
  gesteBascule.className = recurrent.paused ? "action reprendre" : "action suspendre";
  const gesteRetrait = boutonAction(doc, MOTS.retirer, () => gestes.retirer(rangee), { sorte: "danger" });
  gesteRetrait.className = "action retirer";
  for (const [groupe, nom] of /** @type {const} */ ([
    [gesteBascule, `${recurrent.paused ? MOTS.resume : MOTS.pause} ${recurrent.title}`],
    [gesteRetrait, `${MOTS.retirer} ${recurrent.title}`],
  ])) {
    /** @type {any} */
    const bouton = groupe.children[0];
    if (bouton !== undefined) {
      bouton.disabled = occupe;
      bouton.ariaLabel = nom;
    }
  }
  const controle = cree(doc, "span");
  controle.className = "controle";
  controle.append(gesteBascule, gesteRetrait);

  racine.append(titre, quand, controle);
  if (rangee.refus !== undefined) racine.append(ligneErreur(doc, rangee.refus.ligne, rangee.refus.detail));
  return racine;
}

// La section : son titre et son aide au survol ; puis une rangée par ticket récurrent — ou, sans aucun, la ligne vide.
// Null tant que rien n'est à poser.
/**
 * @param {Fabrique} doc
 * @param {{ etat: Etat, gestes: { basculer: (rangee: Rangee) => void, retirer: (rangee: Rangee) => void } }} options
 */
export function poserLesRecurrents(doc, { etat, gestes }) {
  if (etat.lecture === "sans" || etat.lecture === "en-cours") return null;
  const section = cree(doc, "section");
  section.className = "recurrents-du-projet";
  section.ariaLabel = "The project's recurring tickets";
  const tete = cree(doc, "div");
  tete.className = "tete";
  const titre = cree(doc, "span", TITRE);
  titre.className = "nom";
  titre.append(survol(doc, MOTS.aide));
  tete.append(titre);
  section.append(tete);
  if (etat.lecture === "refus") section.append(ligneErreur(doc, etat.ligne, etat.detail));
  else if (etat.rangees.length === 0) section.append(ligneVide(doc, MOTS.vide, { classe: "aucun" }));
  else section.append(...etat.rangees.map((rangee) => poserUnRecurrent(doc, { rangee, gestes })));
  return section;
}

/** @param {unknown} erreur */
const message = (erreur) => (erreur instanceof Error ? erreur.message : String(erreur));

// Ce qu'un geste a rendu, lu : le ticket changé, son retrait, ou un refus — toute autre réponse est un refus, jamais un
// changement deviné.
/** @param {unknown} rendu @returns {{ recurrent: Recurrent } | { retire: true } | { refus: string, detail: string }} */
export function renduLu(rendu) {
  if (typeof rendu === "object" && rendu !== null) {
    const { recurrent, retire, refus, detail } = /** @type {Record<string, any>} */ (rendu);
    if (retire === true) return { retire: true };
    if (typeof recurrent === "object" && recurrent !== null && typeof recurrent.id === "string" && typeof recurrent.paused === "boolean") return { recurrent };
    if (typeof refus === "string" && refus.trim() !== "") {
      const [ligne = "", ...reste] = refus.trim().split("\n");
      return { refus: ligne.trim(), detail: [...reste, typeof detail === "string" ? detail : ""].join("\n").trim() };
    }
  }
  return { refus: MOTS.rienEnvoye, detail: rendu === undefined ? "" : JSON.stringify(rendu) };
}

// Monte la section dans son conteneur, pour un projet : lit les tickets récurrents, les pose, et répond aux gestes. Le
// conteneur retient le projet qu'il montre : une réponse qui arrive pour un autre, quitté depuis, ne s'y pose pas.
/**
 * @param {Fabrique} doc
 * @param {any} conteneur
 * @param {{ projet: string, service: Service }} options
 */
export async function monterLesRecurrents(doc, conteneur, { projet, service }) {
  conteneur.dataset.projet = projet;
  /** @type {Etat} */
  let etat = { lecture: "en-cours" };
  const poser = () => {
    if (conteneur.dataset.projet !== projet) return;
    const pose = poserLesRecurrents(doc, { etat, gestes });
    conteneur.hidden = pose === null;
    conteneur.replaceChildren(...(pose === null ? [] : [pose]));
  };

  /** @param {Rangee} rangee @param {() => Promise<Rendu>} jouer */
  async function jouer(rangee, jouer) {
    if (rangee.enCours === true) return;
    rangee.enCours = true;
    rangee.refus = undefined;
    poser();
    /** @type {unknown} */
    let recu;
    try {
      recu = await jouer();
    } catch (erreur) {
      recu = { refus: MOTS.rienEnvoye, detail: message(erreur) };
    }
    const lu = renduLu(recu);
    rangee.enCours = false;
    if ("retire" in lu) {
      if (etat.lecture === "lue") etat = { lecture: "lue", rangees: etat.rangees.filter((autre) => autre !== rangee) };
    } else if ("recurrent" in lu) rangee.recurrent = lu.recurrent;
    else rangee.refus = { ligne: lu.refus, detail: lu.detail };
    poser();
  }

  const gestes = {
    /** @param {Rangee} rangee */
    basculer: (rangee) => void jouer(rangee, () => (rangee.recurrent.paused ? service.resume(rangee.recurrent.id) : service.pause(rangee.recurrent.id))),
    /** @param {Rangee} rangee */
    retirer: (rangee) => void jouer(rangee, () => service.remove(rangee.recurrent.id)),
  };

  poser();
  try {
    const recurrents = await service.list();
    if (recurrents === undefined) etat = { lecture: "sans" };
    else if (!Array.isArray(recurrents)) etat = { lecture: "refus", ligne: typeof recurrents?.sans === "string" ? recurrents.sans : MOTS.indisponible, detail: recurrents?.detail ?? JSON.stringify(recurrents) };
    else etat = { lecture: "lue", rangees: recurrents.map((recurrent) => ({ recurrent })) };
  } catch (erreur) {
    etat = { lecture: "refus", ligne: MOTS.indisponible, detail: message(erreur) };
  }
  poser();
}

// Le service tel que le pont le porte : chaque méthode, si le pont l'a ; sans elle, la lecture ne rend rien — la section
// ne se pose pas — et un geste le dit en refus.
/**
 * @param {Partial<Pick<import("../pont.d.ts").Pont, "listerLesRecurrents" | "changerUnRecurrent">>} pont
 * @param {string} projet
 * @returns {Service}
 */
export function serviceDesRecurrents(pont, projet) {
  /** @param {"pause" | "resume" | "remove"} geste @returns {(id: string) => Promise<Rendu>} */
  const changer = (geste) => async (id) => (typeof pont.changerUnRecurrent === "function" ? pont.changerUnRecurrent(projet, geste, id) : { refus: MOTS.rienEnvoye });
  return {
    list: async () => (typeof pont.listerLesRecurrents === "function" ? pont.listerLesRecurrents(projet) : undefined),
    pause: changer("pause"),
    resume: changer("resume"),
    remove: changer("remove"),
  };
}
