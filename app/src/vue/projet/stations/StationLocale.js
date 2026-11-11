// @ts-check
// La station locale (ticket 2489, épique 2484) : sur l'onglet Stations, dans « Details » de la carte de cet ordinateur
// (stations-tab/, ticket 3195). Ce que la station de cet ordinateur a de plus que les autres, et elle seule : ses dossiers —
// le clone du projet et les worktrees de ses cooks —, son bac à sable — les tickets ordinaires qu'elle y prend, et combien
// de cooks à la fois — et sa connexion à Claude. Une autre station n'en montre que sa connexion à Claude, telle qu'elle la
// publie, sans geste d'ici (`connexionALaStation`).
// Chaque réglage est la rangée de réglage de l'app (composants/reglage, ticket 2920) : son nom et l'étiquette de son niveau
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
import { interrupteur } from "../../composants/interrupteur/interrupteur.js";
import { ligneErreur } from "../../composants/ligne-erreur/ligne-erreur.js";
import { ditDuReglage, rangeeDeReglage } from "../../composants/reglage/reglage.js";
import { niveauDe } from "../../niveaux.js";
import { bouton } from "../../composants/bouton/bouton.js";
import { LECTURE, NON_ATTEINT, CET_ORDINATEUR } from "../../lexique.js";

/** @typedef {import("../../briques.js").Fabrique} Fabrique */
/** @typedef {import("../../../ordinaires.ts").Bloc} BlocDesOrdinaires */
/** @typedef {import("../../../projets/projets.ts").DossiersDeLaStation} Dossiers */
/** @typedef {Pick<import("../../../stations/stations.ts").StationVue, "id" | "nom" | "max" | "pannes">} Station */
/** @typedef {import("../../composants/reglage/reglage.js").Dit} Dit */
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
 * }} EtatDeLaStationLocale
 */
/**
 * `regler` : le bac à sable — prendre les tickets ordinaires, combien de cooks à la fois (`null` : pas de limite) —, le
 * même appel que Settings ; `ou` : la rangée qui a changé. `seConnecter` : le login de la panne de connexion, par sa clé.
 * @typedef {{ regler(actif: boolean, limite: number | null, ou: Bac): void, seConnecter(cle: string): void }} GestesDeLaStationLocale
 */

export { LECTURE };
export const CLONE = (/** @type {string} */ projet) => `where ${CET_ORDINATEUR}'s station keeps ${projet}'s clone. The station chooses it: it is read here, it does not change`;
export const WORKTREES = (/** @type {string} */ projet) => `where ${CET_ORDINATEUR}'s station puts the worktrees of ${projet}'s cooks — each cook writes only in its own. The station chooses it: it is read here, it does not change`;
export const NE_CUIT_PAS = (/** @type {string} */ projet, /** @type {string} */ poste) => `${projet} does not cook on ${poste}`;
export const CONNEXION = {
  connectee: { dit: "connected", survol: "this station's Claude Code is signed in to your Max account: its cooks can run" },
  perdue: { dit: "lost", survol: "nothing cooks on this station until you log in again" },
  inconnue: { dit: "unknown", survol: "this station could not tell whether its Claude Code is signed in" },
};
export const CONNEXION_TUE = "not said";
export const CONNEXION_TUE_SURVOL = "this station has not published its Claude connection — it is offline, or its version does not say it";

/** @param {Fabrique} doc @param {string} balise @param {string} texte @param {string} [classe] */
function avec(doc, balise, texte, classe) {
  const pose = doc.createElement(balise);
  pose.textContent = texte;
  if (classe !== undefined) pose.className = classe;
  return pose;
}

// Une rangée de réglage (composants/reglage) : `cle`, la clé de sa table de niveaux, que l'étiquette dit déjà — la vue et
// les tests retrouvent la rangée par elle. `dessous` : ce qu'elle a rendu.
/** @param {Fabrique} doc @param {{ nom: string, cle: string, valeur: any[], controle?: any[], dessous?: any[] }} ligne */
function rangee(doc, { nom, cle, valeur, controle = [], dessous = [] }) {
  return rangeeDeReglage(doc, { nom, cle, niveau: niveauDe(doc, cle), valeur, controle, dessous });
}

// Les deux dossiers : un chemin chacun, ce qu'il est au survol. Ils ne se changent pas.
/** @param {Fabrique} doc @param {EtatDeLaStationLocale} etat */
function dossiers(doc, { projet, dossiers: lus }) {
  if (lus === undefined) return [rangee(doc, { nom: "folders", cle: "dossier", valeur: [avec(doc, "span", LECTURE)] })];
  if ("refus" in lus) return [rangee(doc, { nom: "folders", cle: "dossier", valeur: [ligneErreur(doc, NON_ATTEINT("folders"), [lus.refus, lus.detail ?? ""].filter(Boolean).join(" — "))] })];
  return [
    rangee(doc, { nom: "clone folder", cle: "dossier", valeur: [avec(doc, "span", lus.clone, "mono"), survol(doc, CLONE(projet))] }),
    rangee(doc, { nom: "worktrees folder", cle: "dossier", valeur: [avec(doc, "span", lus.worktrees, "mono"), survol(doc, WORKTREES(projet))] }),
  ];
}

// Le bac à sable : les tickets ordinaires qu'il fait prendre à cette station, et combien de cooks à la fois — les deux
// lignes de Settings, mêmes valeurs, mêmes contrôles, même appel. Hors d'un Mac il n'y en a pas : la ligne le dit, et
// pourquoi au survol. Un projet qui ne cuit pas ici n'a rien dans ce bac à sable.
/** @param {Fabrique} doc @param {EtatDeLaStationLocale} etat @param {GestesDeLaStationLocale} gestes */
function bacASable(doc, { poste, projet, ordinaires, refusOrdinaires = "", reglageDit }, gestes) {
  if (ordinaires === undefined) return [rangee(doc, { nom: "sandbox", cle: "ordinaires", valeur: [avec(doc, "span", LECTURE)] })];
  if (ordinaires === null) return [rangee(doc, { nom: "sandbox", cle: "ordinaires", valeur: [avec(doc, "span", NE_CUIT_PAS(projet, poste))] })];
  if (!ordinaires.reglable) return [rangee(doc, { nom: "sandbox", cle: "ordinaires", valeur: [avec(doc, "span", `none on ${poste}`), survol(doc, ordinaires.explication)] })];
  const limite = doc.createElement("input");
  limite.type = "number";
  limite.min = "1";
  limite.step = "1";
  limite.value = ordinaires.limite === null ? "" : String(ordinaires.limite);
  limite.ariaLabel = `Cooks ${poste} runs at once`;
  // L'onglet se repose sous les doigts du chef : le champ se retrouve par sa clé, le clavier lui est rendu.
  limite.dataset.cle = `limite:${projet}`;
  limite.dataset.champ = "cooks";
  // Un changement en route : les deux contrôles attendent sa réponse.
  const enCours = reglageDit !== undefined && "enCours" in reglageDit.dit;
  limite.disabled = enCours;
  const regler = (/** @type {Bac} */ ou, /** @type {boolean} */ prise) => gestes.regler(prise, String(limite.value).trim() === "" ? null : Number(limite.value), ou);
  const option = interrupteur(
    doc,
    { texte: ordinaires.actif ? "on" : "off", allume: ordinaires.actif, libelle: `Take the ordinary tickets on ${poste}`, actif: !enCours },
    (prise) => regler("option", prise),
  );
  limite.addEventListener("change", () => regler("limite", option.ariaChecked === "true"));
  const dit = (/** @type {Bac} */ ou) => ditDuReglage(doc, reglageDit?.ou === ou ? reglageDit.dit : undefined);
  return [
    rangee(doc, {
      nom: "sandbox · ordinary tickets",
      cle: "ordinaires",
      valeur: [avec(doc, "span", ordinaires.actif ? "taken" : "not taken"), survol(doc, ordinaires.explication)],
      controle: [option],
      dessous: [...ditDuReglage(doc, { refus: ordinaires.indisponible ?? "" }), ...ditDuReglage(doc, { refus: refusOrdinaires }), ...dit("option")],
    }),
    rangee(doc, { nom: "cooks at once", cle: "ordinaires", valeur: [avec(doc, "span", ordinaires.limite === null ? "no limit" : String(ordinaires.limite))], controle: [limite], dessous: dit("limite") }),
  ];
}

// La connexion à Claude, telle que la station la publie : perdue, le bouton de sa panne la refait (le login de Claude
// Code sur cet ordinateur) ; ce qu'il a rendu se lit dessous.
/** @param {Fabrique} doc @param {Station | undefined} station @param {string} dite @param {GestesDeLaStationLocale} gestes */
function connexion(doc, station, dite, gestes) {
  const max = station?.max ?? null;
  const vu = max === null ? { dit: station === undefined ? LECTURE : CONNEXION_TUE, survol: CONNEXION_TUE_SURVOL } : CONNEXION[max];
  const valeur = avec(doc, "span", vu.dit);
  if (max !== null) valeur.dataset.etat = max;
  const panne = station?.pannes.find(({ sujet }) => sujet === "connexion-max");
  const controle = [];
  if (panne !== undefined) {
    controle.push(bouton(doc, panne.bouton.libelle, () => gestes.seConnecter(panne.cle), { sorte: "recommande" }));
  }
  return rangee(doc, { nom: "Claude connection", cle: "claude", valeur: [valeur, ...(station === undefined ? [] : [survol(doc, vu.survol)])], controle, dessous: dite === "" ? [] : [avec(doc, "p", dite, "dit")] });
}

// Les lignes de cet ordinateur : ses dossiers, son bac à sable, sa connexion à Claude — chacune une rangée de réglage.
/** @param {Fabrique} doc @param {EtatDeLaStationLocale} etat @param {GestesDeLaStationLocale} [gestes] @returns {any[]} */
export function lignesDeLaStationLocale(doc, etat, gestes = { regler: () => {}, seConnecter: () => {} }) {
  const station = etat.station === null ? undefined : etat.station;
  return [...dossiers(doc, etat), ...bacASable(doc, etat, gestes), connexion(doc, station, etat.connexionDite ?? "", gestes)];
}

// La connexion à Claude d'une autre station, telle qu'elle la publie : elle se refait sur sa machine, pas d'ici.
/** @param {Fabrique} doc @param {Station} station */
export function connexionALaStation(doc, station) {
  return connexion(doc, { ...station, pannes: [] }, "", { regler: () => {}, seConnecter: () => {} });
}
