// @ts-check
// Les stations contributrices du projet sous Settings (ticket 2936, épique 2927) : celles qui ont pris un ticket sans avoir
// l'écriture sur le dépôt, une rangée chacune — son nom, son compte et, refusée, « refused ». Le chef en refuse une par
// « Refuse » : elle ne prend plus aucun ticket ; « Accept again » lui rend le rail. Le geste part tout de suite, sans
// « Save » ; refusé par le service, le refus se dit en une ligne sur la rangée, et la rangée reste ce qu'elle était.
//
// Le service a ce contrat : `list()` rend les stations ; `refuse(station)` et `accept(station)` rendent `{ ok: true }` ou
// un refus d'une ligne. Ce module ne touche pas `document` : il reçoit de quoi créer un élément (briques.js), et le
// conteneur où se poser.

import { boutonAction, lectureIndisponible, survol } from "../briques.js";

/** @typedef {import("../briques.js").Fabrique} Fabrique */
/** @typedef {{ station: string, login: string | null, refused: boolean }} Station */
/** @typedef {{ ok: true } | { refus: string, detail?: string }} Rendu */
// `list` rend `undefined` quand le pont ne porte pas les stations (un téléphone) : le bloc ne se pose pas ; `{ sans }` quand
// elles ne se lisent pas : le bloc le dit en une ligne.
/** @typedef {{ list(): Promise<Station[] | { sans: string, detail?: string } | undefined>, refuse(station: string): Promise<Rendu>, accept(station: string): Promise<Rendu> }} Service */
/** @typedef {Station & { enCours?: boolean, refus?: { ligne: string, detail: string } }} Rangee */
/** @typedef {{ lecture: "en-cours" } | { lecture: "sans" } | { lecture: "refus", ligne: string, detail: string } | { lecture: "lue", rangees: Rangee[] }} Etat */

export const TITRE = "contributor stations";
export const MOTS = {
  aide: "Stations run by people without write access to this repository. They claim a ticket with a comment, cook it in their fork and deliver a pull request. A refused station claims no ticket until you accept it again.",
  vide: "No contributor station has taken a ticket yet.",
  refuser: "Refuse",
  reaccepter: "Accept again",
  refusee: "refused",
  indisponible: "contributor stations unavailable",
  rienEnvoye: "nothing was changed: no answer from the service",
};

/** @param {Fabrique} doc @param {string} balise @param {string} [texte] */
function cree(doc, balise, texte) {
  const pose = doc.createElement(balise);
  if (texte !== undefined) pose.textContent = texte;
  return pose;
}

// Une rangée : le nom de la station, son compte, « refused » si elle l'est, et le bouton du geste contraire ; dessous, le
// refus du dernier geste, en une ligne.
/**
 * @param {Fabrique} doc
 * @param {{ rangee: Rangee, gestes: { changer: (rangee: Rangee) => void } }} options
 */
export function poserUneStation(doc, { rangee, gestes }) {
  const racine = cree(doc, "div");
  racine.className = rangee.refused ? "station-contributrice refusee" : "station-contributrice";
  racine.dataset.station = rangee.station;
  const nom = cree(doc, "strong", rangee.station);
  nom.className = "nom mono";
  const compte = cree(doc, "span", rangee.login === null ? "" : `@${rangee.login}`);
  compte.className = "compte";
  const etat = cree(doc, "span", rangee.refused ? MOTS.refusee : "");
  etat.className = "etat";
  const geste = boutonAction(doc, rangee.refused ? MOTS.reaccepter : MOTS.refuser, () => gestes.changer(rangee));
  geste.className = "action changer";
  /** @type {any} */
  const bouton = geste.children[0];
  if (bouton !== undefined) {
    bouton.disabled = rangee.enCours === true;
    bouton.ariaLabel = `${rangee.refused ? "accept again" : "refuse"} ${rangee.station}`;
  }
  racine.append(nom, compte, etat, geste);
  if (rangee.refus !== undefined) {
    const refus = cree(doc, "p");
    refus.className = "refus";
    refus.role = "alert";
    refus.append(cree(doc, "span", rangee.refus.ligne));
    if (rangee.refus.detail.trim() !== "") refus.append(survol(doc, rangee.refus.detail));
    racine.append(refus);
  }
  return racine;
}

// Le bloc : son titre et son aide au survol, puis une rangée par station — ou la ligne vide. Null tant que rien n'est à poser.
/**
 * @param {Fabrique} doc
 * @param {{ etat: Etat, gestes: { changer: (rangee: Rangee) => void } }} options
 */
export function poserLesStations(doc, { etat, gestes }) {
  if (etat.lecture === "sans" || etat.lecture === "en-cours") return null;
  const section = cree(doc, "section");
  section.className = "stations-contributrices";
  section.ariaLabel = "The project's contributor stations";
  const tete = cree(doc, "div");
  tete.className = "tete";
  const titre = cree(doc, "span", TITRE);
  titre.className = "nom";
  titre.append(survol(doc, MOTS.aide));
  tete.append(titre);
  section.append(tete);
  if (etat.lecture === "refus") {
    section.append(lectureIndisponible(doc, etat.ligne, etat.detail));
    return section;
  }
  if (etat.rangees.length === 0) {
    section.append(cree(doc, "p", MOTS.vide));
    /** @type {any} */
    const vide = section.children.at(-1);
    if (vide !== undefined) vide.className = "aucune";
    return section;
  }
  section.append(...etat.rangees.map((rangee) => poserUneStation(doc, { rangee, gestes })));
  return section;
}

/** @param {unknown} erreur */
const message = (erreur) => (erreur instanceof Error ? erreur.message : String(erreur));

// Ce qu'une écriture a rendu, lu : `ok`, ou un refus — toute autre réponse est un refus, jamais un succès deviné.
/** @param {unknown} rendu @returns {{ ok: true } | { refus: string, detail: string }} */
export function renduLu(rendu) {
  if (typeof rendu === "object" && rendu !== null) {
    const { ok, refus, detail } = /** @type {Record<string, unknown>} */ (rendu);
    if (ok === true) return { ok: true };
    // Le refus tient en une ligne : sa première, le reste au survol.
    if (typeof refus === "string" && refus.trim() !== "") {
      const [ligne = "", ...reste] = refus.trim().split("\n");
      return { refus: ligne.trim(), detail: [...reste, typeof detail === "string" ? detail : ""].join("\n").trim() };
    }
  }
  return { refus: MOTS.rienEnvoye, detail: rendu === undefined ? "" : JSON.stringify(rendu) };
}

// L'état des stations de chaque projet, d'une ouverture à l'autre, tenu par le conteneur de la page.
/** @type {WeakMap<object, Map<string, Etat>>} */
const etatsDesConteneurs = new WeakMap();

// Monte le bloc dans son conteneur, pour un projet : lit les stations, les pose, et répond au geste. Le conteneur retient le
// projet qu'il montre : une réponse qui arrive pour un autre, quitté depuis, ne s'y pose pas.
/**
 * @param {Fabrique} doc
 * @param {any} conteneur
 * @param {{ projet: string, service: Service }} options
 */
export async function monterLesStations(doc, conteneur, { projet, service }) {
  conteneur.dataset.projet = projet;
  /** @type {Map<string, Etat>} */
  const etats = etatsDesConteneurs.get(conteneur) ?? new Map();
  etatsDesConteneurs.set(conteneur, etats);
  const poser = () => {
    if (conteneur.dataset.projet !== projet) return;
    const pose = poserLesStations(doc, { etat: etats.get(projet) ?? { lecture: "en-cours" }, gestes });
    conteneur.hidden = pose === null;
    conteneur.replaceChildren(...(pose === null ? [] : [pose]));
  };

  /** @param {Rangee} rangee */
  async function changer(rangee) {
    if (rangee.enCours === true) return;
    rangee.enCours = true;
    rangee.refus = undefined;
    poser();
    /** @type {unknown} */
    let recu;
    try {
      recu = await (rangee.refused ? service.accept(rangee.station) : service.refuse(rangee.station));
    } catch (erreur) {
      recu = { refus: MOTS.rienEnvoye, detail: message(erreur) };
    }
    const lu = renduLu(recu);
    rangee.enCours = false;
    if ("ok" in lu) rangee.refused = !rangee.refused;
    else rangee.refus = { ligne: lu.refus, detail: lu.detail };
    poser();
  }

  const gestes = { changer: (/** @type {Rangee} */ rangee) => void changer(rangee) };

  poser();
  /** @type {Etat} */
  let lu;
  try {
    const stations = await service.list();
    if (stations === undefined) lu = { lecture: "sans" };
    else if (!Array.isArray(stations)) lu = { lecture: "refus", ligne: typeof stations?.sans === "string" ? stations.sans : MOTS.indisponible, detail: stations?.detail ?? JSON.stringify(stations) };
    else lu = { lecture: "lue", rangees: stations.map(({ station, login, refused }) => ({ station, login, refused })) };
  } catch (erreur) {
    lu = { lecture: "refus", ligne: MOTS.indisponible, detail: message(erreur) };
  }
  etats.set(projet, lu);
  poser();
}

// Le service tel que le pont le porte : chaque méthode, si le pont l'a ; sans elle, la lecture ne rend rien — le bloc ne se
// pose pas — et un geste le dit en refus.
/**
 * @param {Partial<Pick<import("../pont.d.ts").Pont, "listerLesStationsContributrices" | "refuserUneStationContributrice" | "accepterUneStationContributrice">>} pont
 * @param {string} projet
 * @returns {Service}
 */
export function serviceDuPont(pont, projet) {
  return {
    list: async () => (typeof pont.listerLesStationsContributrices === "function" ? pont.listerLesStationsContributrices(projet) : undefined),
    refuse: async (station) => (typeof pont.refuserUneStationContributrice === "function" ? pont.refuserUneStationContributrice(projet, station) : { refus: MOTS.rienEnvoye }),
    accept: async (station) => (typeof pont.accepterUneStationContributrice === "function" ? pont.accepterUneStationContributrice(projet, station) : { refus: MOTS.rienEnvoye }),
  };
}
