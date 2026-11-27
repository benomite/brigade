// @ts-check
// Les réglages de chaque station, sur l'onglet Stations (ticket 2488, épique 2484), dans « Details » de sa carte
// (stations-tab/, ticket 3195) : pour chaque station que le projet déclare, trois lignes — combien de cooks elle fait tourner à la fois, ce qu'elle fournit, et si elle prend les tickets
// ordinaires —, chacune la rangée de réglage de l'app (components/setting, ticket 2920), avec
// son niveau (levels.js). Chaque contrôle s'applique dès qu'il change : il n'y a pas de « Save ». Tant que le
// changement est en route, la rangée le dit dessous et ses contrôles attendent ; refusé, le refus s'y lit et le contrôle
// revient à la valeur en vigueur. Rien n'est stocké ici : chaque réglage reprend le stockage qui existe déjà — sur la
// station, jamais dans le dépôt : aucun n'ouvre de PR.
//   - Le plafond et les capacités sont la déclaration des stations du projet, que sa station principale tient
//     (service.ts, `changerUneStation`, comme « edit » sur Cooks, ticket 1510) : un changement envoie la déclaration
//     entière de la station, cette seule valeur changée.
//   - Les tickets ordinaires de la station qui tourne sur ce poste sont l'option de ce poste (ordinary.ts, la même que
//     Settings) : la case s'écrit aussitôt. Ailleurs, la valeur est ce que `facts` dit de la station, et le survol dit
//     pourquoi elle ne se change pas d'ici.
//   - Retirer une station n'est pas ici : c'est « Stop cooking here », sur sa carte, et nulle part ailleurs.
// Ce que le chef saisit est gardé dans `saisies`, à la vue : un bloc reposé le redonne tel quel. Une saisie dont la
// station a changé de déclaration depuis repart de la déclaration lue. Ce module ne touche pas `document` : il reçoit de
// quoi créer un élément (bricks.js), et rend un élément.

import { hover } from "../../bricks.js";
import { toggleSwitch } from "../../components/switch/switch.js";
import { levelOf } from "../../levels.js";
import { APPLIES, fieldOfCap, capacityChoice, controlOfCapacities, saysOf, orRuns, capSays } from "../../stations-declared.js";
import { saysOfSetting, rowOfSetting } from "../../components/setting/setting.js";

/** @typedef {import("../../bricks.js").Fabrique} Fabrique */
/** @typedef {import("../../../service.ts").StationsRead} StationsRead */
/** @typedef {import("../../../service.ts").StationDeclared} StationDeclared */
/** @typedef {import("../../../ordinary.ts").Block} Ordinary */
/** @typedef {import("../../stations-declared.js").Edition} Edition */
/** @typedef {import("../../stations-declared.js").Wanted} Wanted */
/** @typedef {import("../../components/setting/setting.js").Says} Says */
// Ce que le chef a saisi pour une station : le formulaire de « edit » (stations-declared.js), et la déclaration d'où il
// est parti (`lue`).
/** @typedef {Edition & { lue: string }} Input */
/**
 * Les gestes, que la vue envoie au process principal avant de reposer le bloc : un changement du plafond ou des capacités
 * (`appliquer` : la rangée `cle` d'où il part, et la déclaration entière voulue), et l'interrupteur des tickets ordinaires
 * de ce poste.
 * @typedef {{ appliquer(name: string, key: string, wanted: Wanted): void, ordinaires(taken: boolean): void }} Actions
 */

// Les noms des quatre réglages, et leur clé dans la table des niveaux.
export const SETTINGS = /** @type {const} */ ([
  { cle: "cooks", nom: "cooks at once" },
  { cle: "capacites", nom: "what it provides" },
  { cle: "ordinaires", nom: "ordinary tickets" },
]);
// Ce que dit la rangée des tickets ordinaires de ce poste tant que leur changement est en route.
export const ORDINARY_IN_PROGRESS = { enCours: APPLIES };
// Pourquoi les tickets ordinaires d'une station ne se changent pas d'ici, au survol.
export const ORDINARY_OF_THE_BOX = "a station on the box takes every ticket it can cook, ordinary ones included";
export const ORDINARY_OF_ELSEWHERE = "chosen when this station was added to the project: only its own computer changes it";
export const ORDINARY_NOT_SAID = "its main station does not say it yet";

/** @param {Fabrique} doc @param {string} balise @param {string} [text] */
function created(doc, balise, text) {
  const pose = doc.createElement(balise);
  if (text !== undefined) pose.textContent = text;
  return pose;
}

// La déclaration d'une station, telle qu'une saisie s'en souvient.
const keyOf = (/** @type {StationDeclared} */ station) => JSON.stringify([station.cooks, station.fournit]);

// La saisie d'une station : celle que le chef a commencée, tant que la déclaration est celle d'où elle est partie — ou
// un changement est en route. Sinon, une neuve, d'après la déclaration ; ce que le dernier changement a rendu y reste dit,
// sous sa rangée.
/** @param {Map<string, Input>} inputs @param {StationDeclared} station @param {StationsRead} stations @returns {Input} */
export function inputOf(inputs, station, stations) {
  const heldOne = inputs.get(station.nom);
  if (heldOne !== undefined && (heldOne.lue === keyOf(station) || heldOne.envoi)) return heldOne;
  /** @type {Input} */
  const freshOne = { nom: station.nom, cooks: String(station.cooks), fournit: [...station.fournit], choix: capacityChoice(station, stations, []), envoi: false, lue: keyOf(station) };
  if (heldOne?.rendu !== undefined && "fait" in heldOne.rendu) {
    freshOne.rendu = heldOne.rendu;
    if (heldOne.ou !== undefined) freshOne.ou = heldOne.ou;
  }
  inputs.set(station.nom, freshOne);
  return freshOne;
}

// Les tickets ordinaires d'une station : pris ou non (`null` : rien ne le dit), s'ils se règlent d'ici, et ce que le survol
// en dit. La station qui tourne sur ce poste a l'option de ce poste ; une autre de la box les prend tous ; une distante, ce
// que `facts` dit d'elle.
/**
 * @param {StationDeclared} station
 * @param {{ ici: boolean, ordinaires?: Ordinary, lignes?: readonly { station: string, ordinaires?: boolean }[] }} contexte
 * @returns {{ pris: boolean | null, reglable: boolean, survol: string }}
 */
export function ordinaryOf(station, { ici: here, ordinaires: ordinary, lignes: lines }) {
  if (orRuns(station, { ici: here }) === "poste" && ordinary !== undefined) return { pris: ordinary.actif, reglable: ordinary.reglable, survol: ordinary.indisponible ?? ordinary.explication };
  if (!station.distante) return { pris: true, reglable: false, survol: ORDINARY_OF_THE_BOX };
  const said = lines?.find((line) => line.station === station.nom)?.ordinaires;
  return said === undefined ? { pris: null, reglable: false, survol: ORDINARY_NOT_SAID } : { pris: said, reglable: false, survol: ORDINARY_OF_ELSEWHERE };
}

/** @param {Fabrique} doc @param {string} text @param {string} [hoverSays] @param {boolean} [mono] */
function valueSaid(doc, text, hoverSays, mono = false) {
  const saidOne = created(doc, "strong", text);
  if (mono) saidOne.className = "mono";
  return hoverSays === undefined || hoverSays === "" ? [saidOne] : [saidOne, hover(doc, hoverSays)];
}

// Les trois réglages d'une station, chacun ce que son dernier changement a rendu dessous.
/**
 * @param {Fabrique} doc @param {StationDeclared} station @param {Input} input
 * @param {{ ici: boolean, ordinaires?: Ordinary, ordinairesDit?: Says, lignes?: readonly { station: string, ordinaires?: boolean }[], gestes: Actions }} context
 */
export function settingsOfTheStation(doc, station, input, context) {
  const { gestes: actions } = context;
  const section = created(doc, "section");
  section.className = "station-reglee";
  section.dataset.station = station.nom;
  section.ariaLabel = `${station.nom}'s settings`;
  const apply = (/** @type {string} */ key) => (/** @type {Wanted} */ wanted) => actions.appliquer(station.nom, key, wanted);

  // Le plafond : un nombre, appliqué quand il change ; les capacités : les cases de « edit », et une capacité hors
  // d'elles, tapée (ticket 1959) — chacune appliquée dès qu'elle est cochée, décochée ou ajoutée.
  const provides = station.fournit.length === 0 ? "provides nothing" : station.fournit.join(", ");
  const [{ cle: keyCooks, nom: nameCooks }, { cle: keyCapacities, nom: nameCapacities }, { cle: keyOrdinary, nom: nameOrdinary }] = SETTINGS;
  const cap = rowOfSetting(doc, {
    nom: nameCooks,
    cle: keyCooks,
    niveau: levelOf(doc, keyCooks),
    valeur: valueSaid(doc, capSays(station.cooks)),
    controle: [fieldOfCap(doc, station, input, `reglage:${station.nom}`, apply(keyCooks))],
    dessous: saysOfSetting(doc, saysOf(input, keyCooks)),
  });
  const capacities = rowOfSetting(doc, {
    nom: nameCapacities,
    cle: keyCapacities,
    niveau: levelOf(doc, keyCapacities),
    valeur: valueSaid(doc, provides, undefined, station.fournit.length > 0),
    controle: controlOfCapacities(doc, station, input, apply(keyCapacities)),
    dessous: saysOfSetting(doc, saysOf(input, keyCapacities)),
  });

  // Les tickets ordinaires : la case de ce poste, ou la valeur dite ailleurs, et pourquoi elle ne se change pas d'ici.
  // Ce que son dernier changement a rendu ne vaut que pour la station de ce poste.
  const ordinary = ordinaryOf(station, context);
  const ordinarySaid = ordinary.pris === null ? "not said" : ordinary.pris ? "taken" : "not taken";
  const ordinarySays = ordinary.reglable ? context.ordinairesDit : undefined;
  const inProgress = ordinarySays !== undefined && "enCours" in ordinarySays;
  const caseOrdinary = toggleSwitch(
    doc,
    { texte: ordinary.pris === null ? "…" : ordinary.pris ? "on" : "off", allume: ordinary.pris ?? undefined, libelle: `${station.nom} takes the ordinary tickets`, actif: ordinary.reglable && !inProgress },
    (taken) => actions.ordinaires(taken),
  );
  const take = rowOfSetting(doc, { nom: nameOrdinary, cle: keyOrdinary, niveau: levelOf(doc, keyOrdinary), valeur: valueSaid(doc, ordinarySaid, ordinary.survol), controle: [caseOrdinary], dessous: saysOfSetting(doc, ordinarySays) });
  take.dataset.pris = ordinary.pris === null ? "inconnu" : String(ordinary.pris);
  if (ordinary.pris !== true) take.dataset.retrait = "";

  section.append(cap, capacities, take);
  return section;
}
