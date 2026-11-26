// @ts-check
// La station locale (ticket 2489, épique 2484) : sur l'onglet Stations, dans « Details » de la carte de cet ordinateur
// (stations-tab/, ticket 3195). Ce que la station de cet ordinateur a de plus que les autres, et elle seule : ses dossiers —
// le clone du projet et les worktrees de ses cooks —, son bac à sable — les tickets ordinaires qu'elle y prend, et combien
// de cooks à la fois — et sa connexion à Claude. Une autre station n'en montre que sa connexion à Claude, telle qu'elle la
// publie, sans geste d'ici (`connexionALaStation`).
// Chaque réglage est la rangée de réglage de l'app (composants/setting, ticket 2920) : son nom et l'étiquette de son niveau
// (niveaux.js), sa valeur — ce qu'elle implique au survol —, son seul contrôle, et dessous ce que le contrôle a rendu.
// Un contrôle s'applique dès qu'il change — il n'y a pas de « Save » — : tant que le changement est en route, sa rangée
// le dit et les contrôles du bac à sable attendent ; refusé, le refus se lit sous elle, et le contrôle, relu, revient à
// la valeur en vigueur. Tous vivent sur cette machine, aucun dans le dépôt : aucun n'ouvre de PR. Les gestes sont ceux que
// l'app avait déjà : le bac à sable se règle comme sous « this machine » dans Settings, la connexion se refait par le
// login de la panne de la station. Les autres stations n'ont rien de tout cela. Les téléphones appairés n'y sont plus
// (ticket 2500) : le téléphone se connecte à GitHub, aucune station ne l'appaire.
//
// Ce module ne touche ni `document` ni le pont : la vue lui donne une fabrique (briques.js), l'état lu et les gestes.

import { survol } from "../../briques.js";
import { toggle } from "../../composants/switch/switch.js";
import { lineError } from "../../composants/line-error/line-error.js";
import { ditDuSetting, rangeeDeSetting } from "../../composants/setting/setting.js";
import { niveauDe } from "../../niveaux.js";
import { button } from "../../composants/button/button.js";
import { READ, NON_ATTEINT, CET_ORDINATEUR } from "../../lexique.js";

/** @typedef {import("../../briques.js").Fabrique} Fabrique */
/** @typedef {import("../../../ordinaires.ts").Bloc} BlocDesOrdinaires */
/** @typedef {import("../../../projects/projects.ts").DossiersDeLaStation} Dossiers */
/** @typedef {Pick<import("../../../stations/stations.ts").StationVue, "id" | "nom" | "max" | "pannes">} Station */
/** @typedef {import("../../composants/setting/setting.js").Dit} Dit */
/** La rangée du bac à sable qu'un changement touche : les tickets ordinaires, ou combien de cooks à la fois. @typedef {"option" | "limite"} Bac */
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
 *   dossiers?: Dossiers,
 *   ordinaires?: BlocDesOrdinaires | null,
 *   refusOrdinaires?: string,
 *   reglageDit?: { ou: Bac, dit: Dit },
 *   connexionDite?: string,
 * }} StateDeLaStationLocale
 */
/**
 * `regler` : le bac à sable — prendre les tickets ordinaires, combien de cooks à la fois (`null` : pas de limite) —, le
 * même appel que Settings ; `ou` : la rangée qui a changé. `seConnecter` : le login de la panne de connexion, par sa clé.
 * @typedef {{ regler(actif: boolean, limit: number | null, ou: Bac): void, seConnecter(cle: string): void }} ActionsDeLaStationLocale
 */

export { READ };
export const CLONE = (/** @type {string} */ project) => `where ${CET_ORDINATEUR}'s station keeps ${project}'s clone. The station chooses it: it is read here, it does not change`;
export const WORKTREES = (/** @type {string} */ project) => `where ${CET_ORDINATEUR}'s station puts the worktrees of ${project}'s cooks — each cook writes only in its own. The station chooses it: it is read here, it does not change`;
export const NE_CUIT_PAS = (/** @type {string} */ project, /** @type {string} */ workstation) => `${project} does not cook on ${workstation}`;
export const CONNECTION = {
  connectee: { dit: "connected", survol: "this station's Claude Code is signed in to your Max account: its cooks can run" },
  perdue: { dit: "lost", survol: "nothing cooks on this station until you log in again" },
  inconnue: { dit: "unknown", survol: "this station could not tell whether its Claude Code is signed in" },
};
export const CONNECTION_TUE = "not said";
export const CONNECTION_TUE_SURVOL = "this station has not published its Claude connection — it is offline, or its version does not say it";

/** @param {Fabrique} doc @param {string} balise @param {string} texte @param {string} [classe] */
function avec(doc, balise, texte, classe) {
  const pose = doc.createElement(balise);
  pose.textContent = texte;
  if (classe !== undefined) pose.className = classe;
  return pose;
}

// Une rangée de réglage (composants/setting) : `cle`, la clé de sa table de niveaux, que l'étiquette dit déjà — la vue et
// les tests retrouvent la rangée par elle. `dessous` : ce qu'elle a rendu.
/** @param {Fabrique} doc @param {{ nom: string, cle: string, valeur: any[], controle?: any[], dessous?: any[] }} ligne */
function rangee(doc, { nom: name, cle, valeur, controle = [], dessous = [] }) {
  return rangeeDeSetting(doc, { nom: name, cle, niveau: niveauDe(doc, cle), valeur, controle, dessous });
}

// Les deux dossiers : un chemin chacun, ce qu'il est au survol. Ils ne se changent pas.
/** @param {Fabrique} doc @param {StateDeLaStationLocale} etat */
function dossiers(doc, { projet: project, dossiers: lus }) {
  if (lus === undefined) return [rangee(doc, { nom: "folders", cle: "dossier", valeur: [avec(doc, "span", READ)] })];
  if ("refus" in lus) return [rangee(doc, { nom: "folders", cle: "dossier", valeur: [lineError(doc, NON_ATTEINT("folders"), [lus.refus, lus.detail ?? ""].filter(Boolean).join(" — "))] })];
  return [
    rangee(doc, { nom: "clone folder", cle: "dossier", valeur: [avec(doc, "span", lus.clone, "mono"), survol(doc, CLONE(project))] }),
    rangee(doc, { nom: "worktrees folder", cle: "dossier", valeur: [avec(doc, "span", lus.worktrees, "mono"), survol(doc, WORKTREES(project))] }),
  ];
}

// Le bac à sable : les tickets ordinaires qu'il fait prendre à cette station, et combien de cooks à la fois — les deux
// lignes de Settings, mêmes valeurs, mêmes contrôles, même appel. Hors d'un Mac il n'y en a pas : la ligne le dit, et
// pourquoi au survol. Un projet qui ne cuit pas ici n'a rien dans ce bac à sable.
/** @param {Fabrique} doc @param {StateDeLaStationLocale} etat @param {ActionsDeLaStationLocale} actions */
function sandbox(doc, { poste: workstation, projet: project, ordinaires, refusOrdinaires: refusalOrdinaires = "", reglageDit: settingDit }, actions) {
  if (ordinaires === undefined) return [rangee(doc, { nom: "sandbox", cle: "ordinaires", valeur: [avec(doc, "span", READ)] })];
  if (ordinaires === null) return [rangee(doc, { nom: "sandbox", cle: "ordinaires", valeur: [avec(doc, "span", NE_CUIT_PAS(project, workstation))] })];
  if (!ordinaires.reglable) return [rangee(doc, { nom: "sandbox", cle: "ordinaires", valeur: [avec(doc, "span", `none on ${workstation}`), survol(doc, ordinaires.explication)] })];
  const limit = doc.createElement("input");
  limit.type = "number";
  limit.min = "1";
  limit.step = "1";
  limit.value = ordinaires.limite === null ? "" : String(ordinaires.limite);
  limit.ariaLabel = `Cooks ${workstation} runs at once`;
  // L'onglet se repose sous les doigts du chef : le champ se retrouve par sa clé, le clavier lui est rendu.
  limit.dataset.cle = `limite:${project}`;
  limit.dataset.champ = "cooks";
  // Un changement en route : les deux contrôles attendent sa réponse.
  const enCours = settingDit !== undefined && "enCours" in settingDit.dit;
  limit.disabled = enCours;
  const regler = (/** @type {Bac} */ ou, /** @type {boolean} */ taking) => actions.regler(taking, String(limit.value).trim() === "" ? null : Number(limit.value), ou);
  const option = toggle(
    doc,
    { texte: ordinaires.actif ? "on" : "off", allume: ordinaires.actif, libelle: `Take the ordinary tickets on ${workstation}`, actif: !enCours },
    (taking) => regler("option", taking),
  );
  limit.addEventListener("change", () => regler("limite", option.ariaChecked === "true"));
  const dit = (/** @type {Bac} */ ou) => ditDuSetting(doc, settingDit?.ou === ou ? settingDit.dit : undefined);
  return [
    rangee(doc, {
      nom: "sandbox · ordinary tickets",
      cle: "ordinaires",
      valeur: [avec(doc, "span", ordinaires.actif ? "taken" : "not taken"), survol(doc, ordinaires.explication)],
      controle: [option],
      dessous: [...ditDuSetting(doc, { refus: ordinaires.indisponible ?? "" }), ...ditDuSetting(doc, { refus: refusalOrdinaires }), ...dit("option")],
    }),
    rangee(doc, { nom: "cooks at once", cle: "ordinaires", valeur: [avec(doc, "span", ordinaires.limite === null ? "no limit" : String(ordinaires.limite))], controle: [limit], dessous: dit("limite") }),
  ];
}

// La connexion à Claude, telle que la station la publie : perdue, le bouton de sa panne la refait (le login de Claude
// Code sur cet ordinateur) ; ce qu'il a rendu se lit dessous.
/** @param {Fabrique} doc @param {Station | undefined} station @param {string} dite @param {ActionsDeLaStationLocale} actions */
function connection(doc, station, dite, actions) {
  const max = station?.max ?? null;
  const vu = max === null ? { dit: station === undefined ? READ : CONNECTION_TUE, survol: CONNECTION_TUE_SURVOL } : CONNECTION[max];
  const valeur = avec(doc, "span", vu.dit);
  if (max !== null) valeur.dataset.etat = max;
  const outage = station?.pannes.find(({ sujet }) => sujet === "connexion-max");
  const controle = [];
  if (outage !== undefined) {
    controle.push(button(doc, outage.bouton.libelle, () => actions.seConnecter(outage.cle), { sorte: "recommande" }));
  }
  return rangee(doc, { nom: "Claude connection", cle: "claude", valeur: [valeur, ...(station === undefined ? [] : [survol(doc, vu.survol)])], controle, dessous: dite === "" ? [] : [avec(doc, "p", dite, "dit")] });
}

// Les lignes de cet ordinateur : ses dossiers, son bac à sable, sa connexion à Claude — chacune une rangée de réglage.
/** @param {Fabrique} doc @param {StateDeLaStationLocale} state @param {ActionsDeLaStationLocale} [actions] @returns {any[]} */
export function linesDeLaStationLocale(doc, state, actions = { regler: () => {}, seConnecter: () => {} }) {
  const station = state.station === null ? undefined : state.station;
  return [...dossiers(doc, state), ...sandbox(doc, state, actions), connection(doc, station, state.connexionDite ?? "", actions)];
}

// La connexion à Claude d'une autre station, telle qu'elle la publie : elle se refait sur sa machine, pas d'ici.
/** @param {Fabrique} doc @param {Station} station */
export function connectionALaStation(doc, station) {
  return connection(doc, { ...station, pannes: [] }, "", { regler: () => {}, seConnecter: () => {} });
}
