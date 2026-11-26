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

import { buttonAction, survol } from "../briques.js";
import { lineError } from "../composants/line-error/line-error.js";
import { lineEmpty } from "../composants/line-empty/line-empty.js";
import { NON_ATTEINT, PAS_ENCORE } from "../lexique.js";

/** @typedef {import("../briques.js").Fabrique} Fabrique */
/** @typedef {import("./recurring-box.ts").Recurrent} Recurrent */
/** @typedef {import("./recurring-box.ts").Rythme} Rythme */
/** @typedef {import("./recurring-box.ts").EcritureDUnRecurrent} Rendu */
// `list` rend `undefined` quand le pont ne porte pas les tickets récurrents (un téléphone) : la section ne se pose pas ;
// `{ sans }` quand ils ne se lisent pas : la section le dit en une ligne.
/** @typedef {{ list(): Promise<Recurrent[] | { sans: string, detail?: string } | undefined>, pause(id: string): Promise<Rendu>, resume(id: string): Promise<Rendu>, remove(id: string): Promise<Rendu> }} Service */
// Une rangée : le ticket récurrent, le geste en route, et le refus du dernier.
/** @typedef {{ recurrent: Recurrent, enCours?: boolean, refus?: { ligne: string, detail: string } }} Rangee */
/** @typedef {{ lecture: "en-cours" } | { lecture: "sans" } | { lecture: "refus", ligne: string, detail: string } | { lecture: "lue", rangees: Rangee[] }} State */

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
/** @param {number} day */
export function rang(day) {
  const dizaine = day % 100;
  if (dizaine >= 11 && dizaine <= 13) return `${day}th`;
  return `${day}${{ 1: "st", 2: "nd", 3: "rd" }[day % 10] ?? "th"}`;
}

// Le rythme en mots : « every day », « every week on Monday », « every month on the 15th ».
/** @param {Rythme} rythme */
export function rythmeEnMots(rythme) {
  if (rythme.kind === "weekly") return `every week on ${JOURS[rythme.weekday - 1] ?? "?"}`;
  if (rythme.kind === "monthly") return `every month on the ${rang(rythme.dayOfMonth)}`;
  return "every day";
}

// La date d'une occurrence, un jour UTC `YYYY-MM-DD` : « Mon, Oct 19 » — l'année en plus quand ce n'est pas celle d'aujourd'hui.
/** @param {string} day @param {number} [maintenant] */
export function dateEnMots(day, maintenant = Date.now()) {
  const date = new Date(`${day}T00:00:00Z`);
  if (Number.isNaN(date.getTime())) return day;
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
export function poserUnRecurrent(doc, { rangee, gestes: actions }) {
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
  const actionBascule = buttonAction(doc, recurrent.paused ? MOTS.resume : MOTS.pause, () => actions.basculer(rangee));
  actionBascule.className = recurrent.paused ? "action reprendre" : "action suspendre";
  const actionRetrait = buttonAction(doc, MOTS.retirer, () => actions.retirer(rangee), { sorte: "danger" });
  actionRetrait.className = "action retirer";
  for (const [groupe, name] of /** @type {const} */ ([
    [actionBascule, `${recurrent.paused ? MOTS.resume : MOTS.pause} ${recurrent.title}`],
    [actionRetrait, `${MOTS.retirer} ${recurrent.title}`],
  ])) {
    /** @type {any} */
    const button = groupe.children[0];
    if (button !== undefined) {
      button.disabled = occupe;
      button.ariaLabel = name;
    }
  }
  const controle = cree(doc, "span");
  controle.className = "controle";
  controle.append(actionBascule, actionRetrait);

  racine.append(titre, quand, controle);
  if (rangee.refus !== undefined) racine.append(lineError(doc, rangee.refus.ligne, rangee.refus.detail));
  return racine;
}

// La section : son titre et son aide au survol ; puis une rangée par ticket récurrent — ou, sans aucun, la ligne vide.
// Null tant que rien n'est à poser.
/**
 * @param {Fabrique} doc
 * @param {{ etat: State, gestes: { basculer: (rangee: Rangee) => void, retirer: (rangee: Rangee) => void } }} options
 */
export function poserLesRecurring(doc, { etat: state, gestes: actions }) {
  if (state.lecture === "sans" || state.lecture === "en-cours") return null;
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
  if (state.lecture === "refus") section.append(lineError(doc, state.ligne, state.detail));
  else if (state.rangees.length === 0) section.append(lineEmpty(doc, MOTS.vide, { classe: "aucun" }));
  else section.append(...state.rangees.map((rangee) => poserUnRecurrent(doc, { rangee, gestes: actions })));
  return section;
}

/** @param {unknown} error */
const message = (error) => (error instanceof Error ? error.message : String(error));

// Ce qu'un geste a rendu, lu : le ticket changé, son retrait, ou un refus — toute autre réponse est un refus, jamais un
// changement deviné.
/** @param {unknown} rendu @returns {{ recurrent: Recurrent } | { retire: true } | { refus: string, detail: string }} */
export function renduLu(rendu) {
  if (typeof rendu === "object" && rendu !== null) {
    const { recurrent, retire, refus: refusal, detail } = /** @type {Record<string, any>} */ (rendu);
    if (retire === true) return { retire: true };
    if (typeof recurrent === "object" && recurrent !== null && typeof recurrent.id === "string" && typeof recurrent.paused === "boolean") return { recurrent };
    if (typeof refusal === "string" && refusal.trim() !== "") {
      const [line = "", ...reste] = refusal.trim().split("\n");
      return { refus: line.trim(), detail: [...reste, typeof detail === "string" ? detail : ""].join("\n").trim() };
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
export async function monterLesRecurring(doc, conteneur, { projet: project, service }) {
  conteneur.dataset.projet = project;
  /** @type {State} */
  let state = { lecture: "en-cours" };
  const poser = () => {
    if (conteneur.dataset.projet !== project) return;
    const pose = poserLesRecurring(doc, { etat: state, gestes: actions });
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
    } catch (error) {
      recu = { refus: MOTS.rienEnvoye, detail: message(error) };
    }
    const lu = renduLu(recu);
    rangee.enCours = false;
    if ("retire" in lu) {
      if (state.lecture === "lue") state = { lecture: "lue", rangees: state.rangees.filter((autre) => autre !== rangee) };
    } else if ("recurrent" in lu) rangee.recurrent = lu.recurrent;
    else rangee.refus = { ligne: lu.refus, detail: lu.detail };
    poser();
  }

  const actions = {
    /** @param {Rangee} rangee */
    basculer: (rangee) => void jouer(rangee, () => (rangee.recurrent.paused ? service.resume(rangee.recurrent.id) : service.pause(rangee.recurrent.id))),
    /** @param {Rangee} rangee */
    retirer: (rangee) => void jouer(rangee, () => service.remove(rangee.recurrent.id)),
  };

  poser();
  try {
    const recurring = await service.list();
    if (recurring === undefined) state = { lecture: "sans" };
    else if (!Array.isArray(recurring)) state = { lecture: "refus", ligne: typeof recurring?.sans === "string" ? recurring.sans : MOTS.indisponible, detail: recurring?.detail ?? JSON.stringify(recurring) };
    else state = { lecture: "lue", rangees: recurring.map((recurrent) => ({ recurrent })) };
  } catch (error) {
    state = { lecture: "refus", ligne: MOTS.indisponible, detail: message(error) };
  }
  poser();
}

// Le service tel que le pont le porte : chaque méthode, si le pont l'a ; sans elle, la lecture ne rend rien — la section
// ne se pose pas — et un geste le dit en refus.
/**
 * @param {Partial<Pick<import("../pont.d.ts").Pont, "listerLesRecurrents" | "changerUnRecurrent">>} pont
 * @param {string} project
 * @returns {Service}
 */
export function serviceDesRecurring(pont, project) {
  /** @param {"pause" | "resume" | "remove"} action @returns {(id: string) => Promise<Rendu>} */
  const changer = (action) => async (id) => (typeof pont.changerUnRecurrent === "function" ? pont.changerUnRecurrent(project, action, id) : { refus: MOTS.rienEnvoye });
  return {
    list: async () => (typeof pont.listerLesRecurrents === "function" ? pont.listerLesRecurrents(project) : undefined),
    pause: changer("pause"),
    resume: changer("resume"),
    remove: changer("remove"),
  };
}
