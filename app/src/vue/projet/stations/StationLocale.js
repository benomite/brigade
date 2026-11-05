// @ts-check
// La station locale (ticket 2489, épique 2484) : le bloc « Local station » de l'onglet Stations. Ce que la station de cet
// ordinateur a de plus que les autres, et elle seule : ses dossiers — le clone du projet et les worktrees de ses cooks —,
// son bac à sable — les tickets ordinaires qu'elle y prend, et combien de cooks à la fois —, sa connexion à Claude et
// les téléphones qui lui sont appairés. Chaque réglage est une ligne, la même que dans Settings : son nom et l'étiquette
// de son niveau (niveaux.js), sa valeur — ce qu'elle implique au survol —, son seul contrôle, et dessous ce que le
// contrôle a rendu. Les gestes sont ceux que l'app avait déjà : le bac à sable se règle comme sous « this machine » dans
// Settings, la connexion se refait par le login de la panne de la station, et « pair a phone » ouvre l'écran qui appaire
// un téléphone et révoque les autres (telephones-de-station.js). Les autres stations n'ont rien de tout cela.
//
// Ce module ne touche ni `document` ni le pont : la vue lui donne une fabrique (briques.js), l'état lu et les gestes.

import { lectureIndisponible, survol } from "../../briques.js";
import { niveauDe } from "../../niveaux.js";

/** @typedef {import("../../briques.js").Fabrique} Fabrique */
/** @typedef {import("../../../ordinaires.ts").Bloc} BlocDesOrdinaires */
/** @typedef {import("../../../telephones-de-station.ts").RenduDeLaListe} ListeDesTelephones */
/** @typedef {import("../../../projets/projets.ts").DossiersDeLaStation} Dossiers */
/** @typedef {Pick<import("../../../stations/stations.ts").StationVue, "id" | "nom" | "max" | "pannes">} Station */
/**
 * Ce que le bloc montre. `poste` : le nom que l'écran donne à cet ordinateur (« this Mac »). `station` : la station de
 * cet ordinateur telle que GitHub la publie — indéfinie tant qu'elle n'est pas lue, nulle quand cet appareil n'en a pas
 * (un téléphone) : le bloc le dit alors en une ligne. `dossiers`, `ordinaires`, `telephones` : leur dernière lecture —
 * indéfinie, elle est en route ; `ordinaires` nul : le projet ne cuit pas sur cet ordinateur. `refusOrdinaires` : pourquoi
 * le dernier réglage n'a pas été écrit. `connexionDite` : ce que le dernier login a rendu.
 * @typedef {{
 *   poste: string,
 *   projet: string,
 *   station?: Station | null,
 *   dossiers?: Dossiers,
 *   ordinaires?: BlocDesOrdinaires | null,
 *   refusOrdinaires?: string,
 *   telephones?: ListeDesTelephones,
 *   connexionDite?: string,
 * }} EtatDeLaStationLocale
 */
/**
 * `regler` : le bac à sable — prendre les tickets ordinaires, combien de cooks à la fois (`null` : pas de limite) —, le
 * même appel que Settings. `seConnecter` : le login de la panne de connexion, par sa clé. `appairer` : ouvre l'écran
 * « Pair a phone » de cette station.
 * @typedef {{ regler(actif: boolean, limite: number | null): void, seConnecter(cle: string): void, appairer(): void }} GestesDeLaStationLocale
 */

export const TITRE = "Local station";

export const SANS_STATION = (/** @type {string} */ poste) => `${poste} runs no station: nothing of it to set here`;
export const LECTURE = "reading…";
export const CLONE = (/** @type {string} */ projet) => `where this computer's station keeps ${projet}'s clone. The station chooses it: it is read here, it does not change`;
export const WORKTREES = (/** @type {string} */ projet) => `where this computer's station puts the worktrees of ${projet}'s cooks — each cook writes only in its own. The station chooses it: it is read here, it does not change`;
export const NE_CUIT_PAS = (/** @type {string} */ projet, /** @type {string} */ poste) => `${projet} does not cook on ${poste}`;
export const CONNEXION = {
  connectee: { dit: "connected", survol: "this station's Claude Code is signed in to your Max account: its cooks can run" },
  perdue: { dit: "lost", survol: "nothing cooks on this station until you log in again" },
  inconnue: { dit: "unknown", survol: "this station could not tell whether its Claude Code is signed in" },
};
export const CONNEXION_TUE = "not said";
export const CONNEXION_TUE_SURVOL = "this station has not published its Claude connection — it is offline, or its version does not say it";
export const AUCUN_TELEPHONE = "no phone paired yet";
export const APPAIRER = "pair a phone";

/** @param {Fabrique} doc @param {string} balise @param {string} texte @param {string} [classe] */
function avec(doc, balise, texte, classe) {
  const pose = doc.createElement(balise);
  pose.textContent = texte;
  if (classe !== undefined) pose.className = classe;
  return pose;
}

// Une ligne de réglage : son nom et son niveau, sa valeur, son contrôle, et dessous ce qu'il a rendu. `cle` : la clé de
// sa table de niveaux, que l'étiquette (`niveau`) dit déjà — la vue et les tests retrouvent la ligne par elle.
// `dessous` : un refus se lit en jaune, ce qu'un geste a fait, discret.
/** @param {Fabrique} doc @param {{ nom: string, cle: string, niveau: any, valeur: any[], controle?: any[], dessous?: { texte: string, refus?: boolean }[] }} ligne */
function rangee(doc, { nom, cle, niveau, valeur, controle = [], dessous = [] }) {
  const pose = doc.createElement("div");
  pose.className = "reglage";
  pose.dataset.cle = cle;
  const nomme = avec(doc, "span", nom, "nom");
  nomme.append(niveau);
  const vaut = doc.createElement("p");
  vaut.className = "valeur";
  vaut.append(...valeur);
  const champ = doc.createElement("p");
  champ.className = "champ";
  champ.append(...controle);
  pose.append(nomme, vaut, champ, ...dessous.filter(({ texte }) => texte !== "").map(({ texte, refus = false }) => avec(doc, "p", texte, refus ? "dit refus" : "dit")));
  return pose;
}

// Les deux dossiers : un chemin chacun, ce qu'il est au survol. Ils ne se changent pas.
/** @param {Fabrique} doc @param {EtatDeLaStationLocale} etat */
function dossiers(doc, { projet, dossiers: lus }) {
  if (lus === undefined) return [rangee(doc, { nom: "folders", cle: "dossier", niveau: niveauDe(doc, "dossier"), valeur: [avec(doc, "span", LECTURE)] })];
  if ("refus" in lus) return [rangee(doc, { nom: "folders", cle: "dossier", niveau: niveauDe(doc, "dossier"), valeur: [lectureIndisponible(doc, "folders unavailable", [lus.refus, lus.detail ?? ""].filter(Boolean).join(" — "))] })];
  return [
    rangee(doc, { nom: "clone folder", cle: "dossier", niveau: niveauDe(doc, "dossier"), valeur: [avec(doc, "span", lus.clone, "mono"), survol(doc, CLONE(projet))] }),
    rangee(doc, { nom: "worktrees folder", cle: "dossier", niveau: niveauDe(doc, "dossier"), valeur: [avec(doc, "span", lus.worktrees, "mono"), survol(doc, WORKTREES(projet))] }),
  ];
}

// Le bac à sable : les tickets ordinaires qu'il fait prendre à cette station, et combien de cooks à la fois — les deux
// lignes de Settings, mêmes valeurs, mêmes contrôles, même appel. Hors d'un Mac il n'y en a pas : la ligne le dit, et
// pourquoi au survol. Un projet qui ne cuit pas ici n'a rien dans ce bac à sable.
/** @param {Fabrique} doc @param {EtatDeLaStationLocale} etat @param {GestesDeLaStationLocale} gestes */
function bacASable(doc, { poste, projet, ordinaires, refusOrdinaires = "" }, gestes) {
  if (ordinaires === undefined) return [rangee(doc, { nom: "sandbox", cle: "ordinaires", niveau: niveauDe(doc, "ordinaires"), valeur: [avec(doc, "span", LECTURE)] })];
  if (ordinaires === null) return [rangee(doc, { nom: "sandbox", cle: "ordinaires", niveau: niveauDe(doc, "ordinaires"), valeur: [avec(doc, "span", NE_CUIT_PAS(projet, poste))] })];
  if (!ordinaires.reglable) return [rangee(doc, { nom: "sandbox", cle: "ordinaires", niveau: niveauDe(doc, "ordinaires"), valeur: [avec(doc, "span", `none on ${poste}`), survol(doc, ordinaires.explication)] })];
  const option = doc.createElement("input");
  option.type = "checkbox";
  option.checked = ordinaires.actif;
  option.ariaLabel = `Take the ordinary tickets on ${poste}`;
  const limite = doc.createElement("input");
  limite.type = "number";
  limite.min = "1";
  limite.step = "1";
  limite.value = ordinaires.limite === null ? "" : String(ordinaires.limite);
  limite.ariaLabel = `Cooks ${poste} runs at once`;
  const regler = () => gestes.regler(option.checked === true, String(limite.value).trim() === "" ? null : Number(limite.value));
  option.addEventListener("change", regler);
  limite.addEventListener("change", regler);
  return [
    rangee(doc, {
      nom: "sandbox · ordinary tickets",
      cle: "ordinaires",
      niveau: niveauDe(doc, "ordinaires"),
      valeur: [avec(doc, "span", ordinaires.actif ? "taken" : "not taken"), survol(doc, ordinaires.explication)],
      controle: [option],
      dessous: [{ texte: ordinaires.indisponible ?? "", refus: true }, { texte: refusOrdinaires, refus: true }],
    }),
    rangee(doc, { nom: "cooks at once", cle: "ordinaires", niveau: niveauDe(doc, "ordinaires"), valeur: [avec(doc, "span", ordinaires.limite === null ? "no limit" : String(ordinaires.limite))], controle: [limite] }),
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
    const bouton = avec(doc, "button", panne.bouton.libelle, "recommande");
    bouton.type = "button";
    bouton.addEventListener("click", () => gestes.seConnecter(panne.cle));
    controle.push(bouton);
  }
  return rangee(doc, { nom: "Claude connection", cle: "claude", niveau: niveauDe(doc, "claude"), valeur: [valeur, ...(station === undefined ? [] : [survol(doc, vu.survol)])], controle, dessous: [{ texte: dite }] });
}

// Les téléphones appairés à cette station, par leur nom — leur machine et le jour de l'appairage au survol ; « pair a
// phone » ouvre l'écran qui en appaire un autre, et où chacun se révoque.
/** @param {Fabrique} doc @param {Station | undefined} station @param {ListeDesTelephones | undefined} lus @param {GestesDeLaStationLocale} gestes */
function telephones(doc, station, lus, gestes) {
  /** @type {any[]} */
  let valeur;
  if (station === undefined || lus === undefined) valeur = [avec(doc, "span", LECTURE)];
  else if ("refus" in lus) valeur = [lectureIndisponible(doc, "paired phones unavailable", [lus.refus, lus.detail].filter(Boolean).join(" — "))];
  else if (lus.telephones.length === 0) valeur = [avec(doc, "span", AUCUN_TELEPHONE)];
  else valeur = [avec(doc, "span", lus.telephones.map(({ nom }) => nom).join(", ")), survol(doc, lus.telephones.map(({ nom, machine, appaireLe }) => `${nom} — ${machine}, paired on ${appaireLe.slice(0, 10)}`).join("\n"))];
  const controle = [];
  if (station !== undefined) {
    const bouton = avec(doc, "button", APPAIRER);
    bouton.type = "button";
    bouton.addEventListener("click", () => gestes.appairer());
    controle.push(bouton);
  }
  return rangee(doc, { nom: "paired phones", cle: "telephones", niveau: niveauDe(doc, "telephones"), valeur, controle });
}

/** @param {Fabrique} doc @param {EtatDeLaStationLocale} [etat] @param {GestesDeLaStationLocale} [gestes] */
export function poserBlocStationLocale(doc, etat, gestes = { regler: () => {}, seConnecter: () => {}, appairer: () => {} }) {
  const bloc = doc.createElement("section");
  bloc.className = "bloc-du-projet";
  bloc.dataset.bloc = "station-locale";
  bloc.ariaLabel = TITRE;
  const titre = avec(doc, "h3", TITRE);
  bloc.append(titre);
  if (etat === undefined) return bloc;
  if (etat.station === null) {
    bloc.append(avec(doc, "p", SANS_STATION(etat.poste), "vide"));
    return bloc;
  }
  // Son nom, et ce qu'elle est pour le chef : cet ordinateur.
  titre.append(avec(doc, "small", etat.station === undefined ? etat.poste : `${etat.station.nom} · ${etat.poste}`));
  bloc.append(...dossiers(doc, etat), ...bacASable(doc, etat, gestes), connexion(doc, etat.station, etat.connexionDite ?? "", gestes), telephones(doc, etat.station, etat.telephones, gestes));
  return bloc;
}
