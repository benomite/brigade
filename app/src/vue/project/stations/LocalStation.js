// @ts-check
// La station locale (ticket 2489, épique 2484) : sur l'onglet Stations, dans « Details » de la carte de cet ordinateur
// (stations-tab/, ticket 3195). Ce que la station de cet ordinateur a de plus que les autres, et elle seule : ses dossiers —
// le clone du projet et les worktrees de ses cooks —, son bac à sable — les tickets ordinaires qu'elle y prend, et combien
// de cooks à la fois — et sa connexion à Claude. Une autre station n'en montre que sa connexion à Claude, telle qu'elle la
// publie, sans geste d'ici (`connexionALaStation`).
// Chaque réglage est la rangée de réglage de l'app (components/setting, ticket 2920) : son nom et l'étiquette de son niveau
// (levels.js), sa valeur — ce qu'elle implique au survol —, son seul contrôle, et dessous ce que le contrôle a rendu.
// Un contrôle s'applique dès qu'il change — il n'y a pas de « Save » — : tant que le changement est en route, sa rangée
// le dit et les contrôles du bac à sable attendent ; refusé, le refus se lit sous elle, et le contrôle, relu, revient à
// la valeur en vigueur. Tous vivent sur cette machine, aucun dans le dépôt : aucun n'ouvre de PR. Les gestes sont ceux que
// l'app avait déjà : le bac à sable se règle comme sous « this machine » dans Settings, la connexion se refait par le
// login de la panne de la station. Les autres stations n'ont rien de tout cela. Les téléphones appairés n'y sont plus
// (ticket 2500) : le téléphone se connecte à GitHub, aucune station ne l'appaire.
//
// Ce module ne touche ni `document` ni le pont : la vue lui donne une fabrique (bricks.js), l'état lu et les gestes.

import { hover } from "../../bricks.js";
import { toggleSwitch } from "../../components/switch/switch.js";
import { lineError } from "../../components/line-error/line-error.js";
import { saysOfSetting, rowOfSetting } from "../../components/setting/setting.js";
import { levelOf } from "../../levels.js";
import { button } from "../../components/button/button.js";
import { READING, NOT_REACHED, THIS_COMPUTER } from "../../lexicon.js";

/** @typedef {import("../../bricks.js").Fabrique} Fabrique */
/** @typedef {import("../../../ordinary.ts").Block} BlockOfOrdinary */
/** @typedef {import("../../../projects/projects.ts").FoldersOfTheStation} Folders */
/** @typedef {Pick<import("../../../stations/stations.ts").StationVue, "id" | "nom" | "max" | "pannes">} Station */
/** @typedef {import("../../components/setting/setting.js").Says} Says */
/** La rangée du bac à sable qu'un changement touche : les tickets ordinaires, ou combien de cooks à la fois. @typedef {"option" | "limite"} Sandbox */
/**
 * Ce que le bloc montre. `poste` : le nom que l'écran donne à cet ordinateur (« this Mac »). `station` : la station de
 * cet ordinateur telle que GitHub la publie — indéfinie tant qu'elle n'est pas lue, nulle quand cet appareil n'en a pas
 * (un téléphone) : le bloc le dit alors en une ligne. `dossiers`, `ordinaires` : leur dernière lecture —
 * indéfinie, elle est en route ; `ordinaires` nul : le projet ne cuit pas sur cet ordinateur. `refusOrdinaires` : pourquoi
 * le bac à sable ne s'est pas lu. `reglageDit` : ce que le dernier changement du bac à sable a rendu, sous la rangée
 * qu'il touche — en route, ou refusé. `connexionDite` : ce que le dernier login a rendu.
 * @typedef {{
 *   poste: string,
 *   projet: string,
 *   station?: Station | null,
 *   dossiers?: Folders,
 *   ordinaires?: BlockOfOrdinary | null,
 *   refusOrdinaires?: string,
 *   reglageDit?: { ou: Sandbox, dit: Says },
 *   connexionDite?: string,
 * }} StateOfTheStationLocale
 */
/**
 * `regler` : le bac à sable — prendre les tickets ordinaires, combien de cooks à la fois (`null` : pas de limite) —, le
 * même appel que Settings ; `ou` : la rangée qui a changé. `seConnecter` : le login de la panne de connexion, par sa clé.
 * @typedef {{ regler(active: boolean, limit: number | null, or: Sandbox): void, seConnecter(key: string): void }} ActionsOfTheStationLocale
 */

export { READING };
export const CLONE = (/** @type {string} */ project) => `where ${THIS_COMPUTER}'s station keeps ${project}'s clone. The station chooses it: it is read here, it does not change`;
export const WORKTREES = (/** @type {string} */ project) => `where ${THIS_COMPUTER}'s station puts the worktrees of ${project}'s cooks — each cook writes only in its own. The station chooses it: it is read here, it does not change`;
export const NOT_COOKED_NOT = (/** @type {string} */ project, /** @type {string} */ workstation) => `${project} does not cook on ${workstation}`;
export const CONNECTION = {
  connectee: { dit: "connected", survol: "this station's Claude Code is signed in to your Max account: its cooks can run" },
  perdue: { dit: "lost", survol: "nothing cooks on this station until you log in again" },
  inconnue: { dit: "unknown", survol: "this station could not tell whether its Claude Code is signed in" },
};
export const CONNECTION_KILLS = "not said";
export const CONNECTION_KILLS_HOVER = "this station has not published its Claude connection — it is offline, or its version does not say it";

/** @param {Fabrique} doc @param {string} balise @param {string} text @param {string} [classe] */
function withIt(doc, balise, text, classe) {
  const pose = doc.createElement(balise);
  pose.textContent = text;
  if (classe !== undefined) pose.className = classe;
  return pose;
}

// Une rangée de réglage (components/setting) : `cle`, la clé de sa table de niveaux, que l'étiquette dit déjà — la vue et
// les tests retrouvent la rangée par elle. `dessous` : ce qu'elle a rendu.
/** @param {Fabrique} doc @param {{ nom: string, cle: string, valeur: any[], controle?: any[], dessous?: any[] }} ligne */
function row(doc, { nom: name, cle: key, valeur: value, controle: control = [], dessous: below = [] }) {
  return rowOfSetting(doc, { nom: name, cle: key, niveau: levelOf(doc, key), valeur: value, controle: control, dessous: below });
}

// Les deux dossiers : un chemin chacun, ce qu'il est au survol. Ils ne se changent pas.
/** @param {Fabrique} doc @param {StateOfTheStationLocale} etat */
function folders(doc, { projet: project, dossiers: readOnes }) {
  if (readOnes === undefined) return [row(doc, { nom: "folders", cle: "dossier", valeur: [withIt(doc, "span", READING)] })];
  if ("refus" in readOnes) return [row(doc, { nom: "folders", cle: "dossier", valeur: [lineError(doc, NOT_REACHED("folders"), [readOnes.refus, readOnes.detail ?? ""].filter(Boolean).join(" — "))] })];
  return [
    row(doc, { nom: "clone folder", cle: "dossier", valeur: [withIt(doc, "span", readOnes.clone, "mono"), hover(doc, CLONE(project))] }),
    row(doc, { nom: "worktrees folder", cle: "dossier", valeur: [withIt(doc, "span", readOnes.worktrees, "mono"), hover(doc, WORKTREES(project))] }),
  ];
}

// Le bac à sable : les tickets ordinaires qu'il fait prendre à cette station, et combien de cooks à la fois — les deux
// lignes de Settings, mêmes valeurs, mêmes contrôles, même appel. Hors d'un Mac il n'y en a pas : la ligne le dit, et
// pourquoi au survol. Un projet qui ne cuit pas ici n'a rien dans ce bac à sable.
/** @param {Fabrique} doc @param {StateOfTheStationLocale} etat @param {ActionsOfTheStationLocale} actions */
function sandbox(doc, { poste: workstation, projet: project, ordinaires: ordinary, refusOrdinaires: refusalOrdinary = "", reglageDit: settingSays }, actions) {
  if (ordinary === undefined) return [row(doc, { nom: "sandbox", cle: "ordinaires", valeur: [withIt(doc, "span", READING)] })];
  if (ordinary === null) return [row(doc, { nom: "sandbox", cle: "ordinaires", valeur: [withIt(doc, "span", NOT_COOKED_NOT(project, workstation))] })];
  if (!ordinary.reglable) return [row(doc, { nom: "sandbox", cle: "ordinaires", valeur: [withIt(doc, "span", `none on ${workstation}`), hover(doc, ordinary.explication)] })];
  const limit = doc.createElement("input");
  limit.type = "number";
  limit.min = "1";
  limit.step = "1";
  limit.value = ordinary.limite === null ? "" : String(ordinary.limite);
  limit.ariaLabel = `Cooks ${workstation} runs at once`;
  // L'onglet se repose sous les doigts du chef : le champ se retrouve par sa clé, le clavier lui est rendu.
  limit.dataset.cle = `limite:${project}`;
  limit.dataset.champ = "cooks";
  // Un changement en route : les deux contrôles attendent sa réponse.
  const inProgress = settingSays !== undefined && "enCours" in settingSays.dit;
  limit.disabled = inProgress;
  const set = (/** @type {Sandbox} */ or, /** @type {boolean} */ taking) => actions.regler(taking, String(limit.value).trim() === "" ? null : Number(limit.value), or);
  const option = toggleSwitch(
    doc,
    { texte: ordinary.actif ? "on" : "off", allume: ordinary.actif, libelle: `Take the ordinary tickets on ${workstation}`, actif: !inProgress },
    (taking) => set("option", taking),
  );
  limit.addEventListener("change", () => set("limite", option.ariaChecked === "true"));
  const said = (/** @type {Sandbox} */ or) => saysOfSetting(doc, settingSays?.ou === or ? settingSays.dit : undefined);
  return [
    row(doc, {
      nom: "sandbox · ordinary tickets",
      cle: "ordinaires",
      valeur: [withIt(doc, "span", ordinary.actif ? "taken" : "not taken"), hover(doc, ordinary.explication)],
      controle: [option],
      dessous: [...saysOfSetting(doc, { refus: ordinary.indisponible ?? "" }), ...saysOfSetting(doc, { refus: refusalOrdinary }), ...said("option")],
    }),
    row(doc, { nom: "cooks at once", cle: "ordinaires", valeur: [withIt(doc, "span", ordinary.limite === null ? "no limit" : String(ordinary.limite))], controle: [limit], dessous: said("limite") }),
  ];
}

// La connexion à Claude, telle que la station la publie : perdue, le bouton de sa panne la refait (le login de Claude
// Code sur cet ordinateur) ; ce qu'il a rendu se lit dessous.
/** @param {Fabrique} doc @param {Station | undefined} station @param {string} saidOne @param {ActionsOfTheStationLocale} actions */
function connection(doc, station, saidOne, actions) {
  const max = station?.max ?? null;
  const seenOne = max === null ? { dit: station === undefined ? READING : CONNECTION_KILLS, survol: CONNECTION_KILLS_HOVER } : CONNECTION[max];
  const value = withIt(doc, "span", seenOne.dit);
  if (max !== null) value.dataset.etat = max;
  const outage = station?.pannes.find(({ sujet: subject }) => subject === "connexion-max");
  const control = [];
  if (outage !== undefined) {
    control.push(button(doc, outage.bouton.libelle, () => actions.seConnecter(outage.cle), { sorte: "recommande" }));
  }
  return row(doc, { nom: "Claude connection", cle: "claude", valeur: [value, ...(station === undefined ? [] : [hover(doc, seenOne.survol)])], controle: control, dessous: saidOne === "" ? [] : [withIt(doc, "p", saidOne, "dit")] });
}

// Les lignes de cet ordinateur : ses dossiers, son bac à sable, sa connexion à Claude — chacune une rangée de réglage.
/** @param {Fabrique} doc @param {StateOfTheStationLocale} state @param {ActionsOfTheStationLocale} [actions] @returns {any[]} */
export function linesOfTheStationLocale(doc, state, actions = { regler: () => {}, seConnecter: () => {} }) {
  const station = state.station === null ? undefined : state.station;
  return [...folders(doc, state), ...sandbox(doc, state, actions), connection(doc, station, state.connexionDite ?? "", actions)];
}

// La connexion à Claude d'une autre station, telle qu'elle la publie : elle se refait sur sa machine, pas d'ici.
/** @param {Fabrique} doc @param {Station} station */
export function connectionAtTheStation(doc, station) {
  return connection(doc, { ...station, pannes: [] }, "", { regler: () => {}, seConnecter: () => {} });
}
