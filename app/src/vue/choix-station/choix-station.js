// @ts-check
// Choisir la station d'un projet (ticket 3187, épique 3182) : ce que le formulaire « Choose the machine that cooks
// <projet> » (vue.js, `poserLaConfiance`) et la question « Who cooks it » (parcours-premier-projet/) disent des machines
// à choisir, en un seul endroit.
//   - L'ordre : cet ordinateur d'abord, nommé « this computer », son nom d'hôte ensuite.
//   - Ce qui est proposé : une station qui peut cuire maintenant. Une station hors ligne n'est jamais cochée d'office ni
//     marquée « recommended » ; aucune en ligne, rien ne l'est.
//   - Une station hors ligne dit, sur une ligne à elle, depuis quand, et le geste qui la ramène sur sa machine. La choisir
//     réussit quand même : elle prend le projet à son retour.
// Ce module ne touche pas `document` : il reçoit de quoi créer un élément (briques.js), et rend des éléments.

import { CET_ORDINATEUR } from "../lexique.js";
import { dureeEnClair } from "../projet/delai.js";

/** @typedef {import("../briques.js").Fabrique} Fabrique */
/** @typedef {import("../../stations/stations.ts").StationVue} StationVue */

export const RECOMMANDEE = "recommended";

// Le geste qui ramène une station, sur sa machine : un ordinateur (Mac, PC) relance la sienne à l'ouverture de sa
// session ou de l'app ; un serveur, au démarrage de la machine, par son service (docs/installation-station.md).
/** @param {string} nom @param {boolean} ordinateur */
export const RAMENER = (nom, ordinateur) =>
  ordinateur ? `open Brigade on ${nom}, or log in there: its station starts with your session` : `switch ${nom} on, or start its brigade-station service there: it starts with the machine`;

// La ligne d'une station hors ligne : depuis quand (« offline for 22 min », tel que sa lecture le dit), puis son geste.
/** @param {string} depuis @param {string} nom @param {boolean} ordinateur */
export const HORS_LIGNE_DEPUIS = (depuis, nom, ordinateur) => `${depuis.charAt(0).toUpperCase()}${depuis.slice(1)}: ${RAMENER(nom, ordinateur)}`;

// Une station du compte hors ligne : depuis que le process principal l'a dite telle (stations-du-compte.ts,
// `offlineSince`), sinon depuis le dernier signe de vie de son enregistrement.
/** @param {{ name: string, platform: string, lastSeen: string, offlineSince?: string }} station @param {number} maintenant */
export function horsLigneDuCompte({ name, platform, lastSeen, offlineSince }, maintenant) {
  return HORS_LIGNE_DEPUIS(`offline for ${dureeEnClair(maintenant - Date.parse(offlineSince ?? lastSeen))}`, name, platform === "macos" || platform === "windows");
}

// Choisie hors ligne : ce que la page en dit, en clair.
/** @param {string} nom @param {string} projet */
export const AU_RETOUR = (nom, projet) => `${nom} is offline: it takes ${projet} when it comes back.`;

// Les machines dans l'ordre où le choix les montre : celle de cet ordinateur (`locale`) d'abord.
/** @template {{ id: string }} S @param {readonly S[]} stations @param {string | null | undefined} locale @returns {S[]} */
export function cetOrdinateurDAbord(stations, locale) {
  return [...stations.filter(({ id }) => id === locale), ...stations.filter(({ id }) => id !== locale)];
}

// La machine cochée d'office : la recommandée (`stationRecommandee`, projets.ts — un serveur en ligne), sinon cet
// ordinateur s'il est en ligne, sinon la première en ligne. Aucune en ligne : aucune.
/** @param {readonly Pick<StationVue, "id" | "etat">[]} stations @param {{ recommandee?: string | null, locale?: string | null }} lu */
export function proposeeDOffice(stations, { recommandee, locale }) {
  const enLigne = stations.filter(({ etat }) => etat === "en-ligne");
  return (enLigne.find(({ id }) => id === recommandee) ?? enLigne.find(({ id }) => id === locale) ?? enLigne[0])?.id;
}

// Le nom d'une machine tel que le choix le dit : « this computer » pour celle de cet ordinateur.
/** @param {{ id: string, nom: string }} station @param {string | null | undefined} locale */
export const nomDite = ({ id, nom }, locale) => (id === locale ? CET_ORDINATEUR : nom);

/** @param {Fabrique} doc @param {string} balise @param {string} [texte] */
function cree(doc, balise, texte) {
  const pose = doc.createElement(balise);
  if (texte !== undefined) pose.textContent = texte;
  return pose;
}

// Une machine à choisir : un libellé qui la porte entière — son bouton, son nom (« this computer », puis son nom d'hôte),
// sa marque si elle est recommandée —, dessous ce que la choisir implique, et, hors ligne, depuis quand et comment la
// ramener, sur sa propre ligne. Un clic n'importe où la choisit. `nom` : le nom de l'entrée du formulaire, une seule
// machine à la fois.
/**
 * @param {Fabrique} doc
 * @param {{ station: StationVue, nom: string, ici: boolean, choisie: boolean, recommandee: boolean, implique: string, ordinateur: boolean, aria: string }} machine
 * @param {() => void} choisir
 */
export function uneMachine(doc, { station, nom, ici, choisie, recommandee, implique, ordinateur, aria }, choisir) {
  const pose = cree(doc, "label");
  pose.className = "machine";
  pose.dataset.choisie = String(choisie);
  pose.dataset.etat = station.etat;
  const choix = /** @type {HTMLInputElement} */ (cree(doc, "input"));
  choix.type = "radio";
  choix.name = nom;
  choix.checked = choisie;
  choix.ariaLabel = aria;
  choix.addEventListener("change", () => {
    if (choix.checked) choisir();
  });
  const nomme = cree(doc, "span");
  nomme.className = "nom-de-machine";
  const appele = cree(doc, "strong", ici ? CET_ORDINATEUR : station.nom);
  if (!ici) appele.className = "mono";
  nomme.append(appele);
  if (ici) {
    const hote = cree(doc, "span", station.nom);
    hote.className = "hote mono";
    nomme.append(hote);
  }
  if (recommandee) {
    const marque = cree(doc, "span", RECOMMANDEE);
    marque.className = "pilule";
    nomme.append(marque);
  }
  const dit = [implique, ...(station.etat === "illisible" ? [station.dit] : []), ...(station.machine === "" ? [] : [station.machine])].filter((morceau) => morceau !== "").join(" · ");
  pose.append(choix, nomme, cree(doc, "small", dit));
  if (station.etat === "hors-ligne") {
    const absente = cree(doc, "small", HORS_LIGNE_DEPUIS(station.dit, station.nom, ordinateur));
    absente.className = "hors-ligne";
    pose.append(absente);
  }
  return pose;
}
