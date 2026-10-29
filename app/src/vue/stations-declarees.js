// @ts-check
// Ce que chaque station déclarée fournit, sur l'onglet Cooks, sous ses stations (ticket 1509, épique 1506) : une ligne
// par station que la box du projet déclare, dans l'ordre de sa déclaration — son nom, où elle tourne, son plafond de
// cooks et ses capacités. Où elle tourne a trois mots distincts : sur la box (« box station ») ; sur ce poste
// (« this workstation » : la cuisine du projet y tourne) ; sur un autre poste (« remote »). Un projet qui ne déclare aucune station le dit en une ligne, jamais par un blanc ; une déclaration
// pas encore lue aussi.
// Chaque ligne s'édite (ticket 1510) : « edit » ouvre sous elle son formulaire — son plafond, ses capacités en cases
// (celles de « + station », ticket 1307), cochées comme elle les déclare —, avec
// « Save » et « Remove », qui demande confirmation. Le geste ne change qu'elle (service.ts, `changerUneStation`).
// La déclaration vient de `installation stations --json`, que le contrôle de l'installation lit (service.ts) : la vue la
// pose, elle n'en déduit rien d'autre.
// Ce module ne touche pas `document` : il reçoit de quoi créer un élément (briques.js), et rend un élément.

import { boutonAction, caseACocher, confirmationDeGeste, lectureIndisponible, survol } from "./briques.js";

/** @typedef {import("./briques.js").Fabrique} Fabrique */
/** @typedef {import("../service.ts").StationsLues} StationsLues */
/** @typedef {import("../service.ts").StationDeclaree} StationDeclaree */
/** @typedef {"box" | "poste" | "ailleurs"} Ou */
/** @typedef {import("../projets/projets.ts").CapaciteDeLaMachine} CapaciteDeLaMachine */
/** @typedef {import("../service.ts").StationChangee} StationChangee */
/**
 * Le formulaire ouvert d'une station : ce que le chef y a saisi — `cooks` tel qu'il est tapé, `fournit` dans l'ordre
 * des cases cochées —, les cases qu'il offre (`choix`), la confirmation du retrait ouverte ou non, un envoi en
 * route, et ce que le dernier envoi a rendu.
 * @typedef {{ nom: string, cooks: string, fournit: string[], choix: { capacite: string, dite: string }[], confirmer: boolean, envoi: boolean, rendu?: StationChangee }} Edition
 */
/**
 * Ce que la vue donne pour éditer : le formulaire ouvert, ce que le dernier geste a rendu sur une station fermée, et
 * les gestes — la vue les envoie au process principal, puis repose le bloc.
 * @typedef {{ editee?: Edition, dernier?: { nom: string, fait: string }, ouvrir(nom: string): void, fermer(): void, sauver(): void, confirmer(oui: boolean): void, retirer(): void }} Editer
 */

export const TITRE = "what each station provides";
export const AIDE = "The stations the project declares: how many cooks each runs at once, what it provides to the tickets that need it, and where it runs.";
export const AUCUNE = "no station declared: no cook leaves for this project";
export const PAS_LUE = "not read yet: the next check of the installation reads them";
// Les mots du formulaire d'une station.
export const EDITER = "edit";
export const PLAFOND = "Cooks at once";
export const FOURNIT = "What it provides";
export const SAUVER = "Save";
export const RETIRER = "Remove";
export const SEULE = "the project's only station: without one, no cook leaves — declare another before removing it";

// Les trois mots d'une station, selon où elle tourne, et ce qu'ils veulent dire, au survol.
/** @type {Readonly<Record<Ou, string>>} */
export const OU = { box: "box station", poste: "this workstation", ailleurs: "remote" };

const s = (/** @type {number} */ combien) => (combien > 1 ? "s" : "");
// Le plafond d'une station, dans les mots du formulaire qui le déclare (« cooks at once »).
export const plafondDit = (/** @type {number} */ cooks) => `${cooks} cook${s(cooks)} at once`;

// Chaque classe est posée en clair, `className = "…"` : la peau ne vise que des classes que la vue
// pose, et son test les lit ainsi (peau.test.ts).
/** @param {Fabrique} doc @param {string} balise @param {string} [texte] */
function cree(doc, balise, texte) {
  const pose = doc.createElement(balise);
  if (texte !== undefined) pose.textContent = texte;
  return pose;
}

// Où tourne une station. Une station de la box, pour un projet dont la cuisine tourne sur ce poste, tourne ici.
/** @param {StationDeclaree} station @param {{ ici: boolean }} projet @returns {Ou} */
export function ouTourne(station, { ici }) {
  if (!station.distante) return ici ? "poste" : "box";
  return "ailleurs";
}

/** @param {Ou} ou @param {boolean} distante */
function survolDe(ou, distante) {
  if (ou === "box") return "it runs on the project's main station";
  if (ou === "ailleurs") return "remote: another workstation plays it and pulls its work from the main station — this computer does not";
  return distante ? "remote: another workstation plays it and pulls its work from the main station" : "the project's kitchen runs on this computer: this station runs with it";
}

// Les cases du formulaire : celles que la station déclare, dans son ordre, puis ce que les autres stations du projet
// fournissent, et ce que cet ordinateur sait déclarer (le catalogue de « + station », avec son nom en clair).
// `enPlus` : une capacité que le chef vient d'appeler (« cook it on a station that has it »), offerte même si rien d'autre ne la nomme.
/** @param {StationDeclaree} station @param {StationsLues} stations @param {readonly CapaciteDeLaMachine[]} catalogue @param {string} [enPlus] */
export function choixDeCapacites(station, stations, catalogue, enPlus) {
  const dites = new Map(catalogue.map(({ capacite, nom }) => [capacite, nom]));
  const toutes = [...station.fournit, ...(enPlus === undefined ? [] : [enPlus]), ...stations.declarees.flatMap(({ fournit }) => fournit), ...stations.proposees.flatMap(({ fournit }) => fournit), ...catalogue.map(({ capacite }) => capacite)];
  return [...new Set(toutes)].map((capacite) => ({ capacite, dite: dites.get(capacite) ?? "" }));
}

// La capacité qu'un besoin que la station n'a pas appelle, telle qu'on la déclare : la première que le runtime lui donne
// (runtime/src/installation/besoins/catalogue.ts, `fourni.capacites`) ; un besoin qu'il ne dit pas ici est sa propre capacité.
/** @type {Readonly<Record<string, string>>} */
export const CAPACITE_DU_BESOIN = { browser: "navigateur-headless" };
/** @param {string} besoin */
export const capaciteDuBesoin = (besoin) => CAPACITE_DU_BESOIN[besoin] ?? besoin;

// La station que « cook it on a station that has it » ouvre : celle qui tourne sur ce poste — la première —, à défaut la
// première que le projet déclare.
/** @param {StationsLues} stations @param {{ ici: boolean }} projet */
export function stationAOuvrir(stations, projet) {
  return stations.declarees.find((station) => ouTourne(station, projet) === "poste") ?? stations.declarees[0];
}

// Le formulaire ouvert d'une station, sous sa ligne : son plafond, ses capacités, et ses gestes.
// Ce que le chef saisit est gardé dans `editee` au fil de la frappe : un bloc reposé le redonne tel quel.
/**
 * @param {Fabrique} doc @param {StationDeclaree} station @param {Edition} editee @param {Editer} editer
 * @param {{ seule: boolean, projet?: string }} contexte
 */
function formulaireDe(doc, station, editee, editer, { seule, projet }) {
  const forme = cree(doc, "div");
  forme.className = "edition";
  forme.ariaLabel = `edit ${station.nom}`;
  const cooks = cree(doc, "input");
  cooks.type = "number";
  cooks.min = "1";
  cooks.max = "99";
  cooks.value = editee.cooks;
  cooks.ariaLabel = `how many cooks ${station.nom} runs at once`;
  // Le rail redessiné rend le clavier au champ où le chef tapait (vue.js, `reprise`).
  cooks.dataset.cle = `station:${station.nom}`;
  cooks.dataset.champ = "cooks";
  cooks.addEventListener("input", () => void (editee.cooks = cooks.value));
  const plafond = cree(doc, "label");
  plafond.className = "champ";
  plafond.append(cree(doc, "span", PLAFOND), cooks);
  const cases = cree(doc, "div");
  cases.className = "capacites";
  cases.append(
    ...editee.choix.map(({ capacite, dite }) =>
      caseACocher(doc, { nom: capacite, dit: dite, cochee: editee.fournit.includes(capacite), mono: true }, (cochee) => {
        editee.fournit = cochee ? [...editee.fournit.filter((tenue) => tenue !== capacite), capacite] : editee.fournit.filter((tenue) => tenue !== capacite);
      }),
    ),
  );
  const capacites = cree(doc, "fieldset");
  capacites.className = "capacites-de-station";
  capacites.append(cree(doc, "legend", FOURNIT), cases);
  forme.append(plafond, capacites);
  const gestes = cree(doc, "div");
  gestes.className = "gestes";
  const sauver = boutonAction(doc, editee.envoi ? "saving…" : SAUVER, () => editer.sauver(), { recommande: true });
  const annuler = boutonAction(doc, "Cancel", () => editer.fermer());
  const retirer = boutonAction(doc, RETIRER, () => editer.confirmer(true));
  retirer.className = "action retrait";
  // Un envoi en route : rien ne repart avant qu'il ait répondu.
  for (const groupe of [sauver, annuler, retirer]) groupe.firstChild.disabled = editee.envoi;
  if (seule) {
    retirer.firstChild.disabled = true;
    retirer.append(survol(doc, `Not removable: ${SEULE}.`));
  }
  gestes.append(sauver, annuler, retirer);
  forme.append(gestes);
  if (editee.confirmer) {
    forme.append(
      confirmationDeGeste(
        doc,
        { titre: `Remove ${station.nom}${projet === undefined ? "" : ` from ${projet}`}? The other stations stay as they are.`, prix: "its cooks take no new ticket — a ticket that needs what only it provides waits", oui: RETIRER, non: "Keep it" },
        { oui: () => editer.retirer(), non: () => editer.confirmer(false) },
      ),
    );
  }
  const rendu = editee.rendu;
  if (rendu !== undefined) forme.append("refus" in rendu ? lectureIndisponible(doc, rendu.refus, rendu.detail ?? "") : uneLigneFaite(doc, rendu.fait));
  return forme;
}

/** @param {Fabrique} doc @param {string} fait */
function uneLigneFaite(doc, fait) {
  const pose = cree(doc, "p", fait);
  pose.className = "fait";
  return pose;
}

// Une station : son nom et où elle tourne, son plafond, ses capacités — et, à éditer, son bouton et son formulaire.
/**
 * @param {Fabrique} doc @param {StationDeclaree} station
 * @param {{ ici: boolean, projet?: string, seule?: boolean, editer?: Editer }} projet
 */
function ligneDe(doc, station, projet) {
  const ligne = cree(doc, "li");
  ligne.className = "station-declaree";
  ligne.dataset.station = station.nom;
  const ou = ouTourne(station, projet);
  ligne.dataset.ou = ou;
  const nom = cree(doc, "strong", station.nom);
  nom.className = "mono";
  const qui = cree(doc, "span");
  qui.className = "qui";
  qui.append(nom, motDuLieu(doc, station, projet));
  const plafond = cree(doc, "span", plafondDit(station.cooks));
  plafond.className = "plafond";
  ligne.append(qui, plafond, ...ceQuElleFournit(doc, station, projet));
  return ligne;
}

// Où tourne une station, en un mot — ce qu'il veut dire au survol.
/** @param {Fabrique} doc @param {StationDeclaree} station @param {{ ici: boolean }} projet */
export function motDuLieu(doc, station, projet) {
  const ou = ouTourne(station, projet);
  const mot = cree(doc, "span", OU[ou]);
  mot.className = "ou";
  mot.dataset.ou = ou;
  mot.title = survolDe(ou, station.distante);
  return mot;
}

// Ce qu'une station fournit — ses capacités en liste —, et, à éditer, « edit » et son formulaire ouvert sous elle, ou ce que
// le dernier geste y a rendu. Le bloc de ses stations sur Cooks (stations-de-cuisson.js, ticket 1786) le pose dans la ligne de chacune.
/**
 * @param {Fabrique} doc @param {StationDeclaree} station
 * @param {{ ici: boolean, projet?: string, seule?: boolean, editer?: Editer }} projet
 */
export function ceQuElleFournit(doc, station, projet) {
  const capacites = cree(doc, "ul");
  capacites.ariaLabel = `what ${station.nom} provides`;
  if (station.fournit.length === 0) {
    capacites.className = "capacites vide";
    capacites.append(cree(doc, "li", "provides nothing"));
  } else {
    capacites.className = "capacites";
    capacites.append(
      ...station.fournit.map((capacite) => {
        const pose = cree(doc, "li", capacite);
        pose.className = "capacite mono";
        return pose;
      }),
    );
  }
  const { editer } = projet;
  if (editer === undefined) return [capacites];
  const ouverte = editer.editee?.nom === station.nom ? editer.editee : undefined;
  const bouton = cree(doc, "button", EDITER);
  bouton.type = "button";
  bouton.className = "editer";
  bouton.ariaLabel = `edit ${station.nom}`;
  bouton.ariaExpanded = ouverte === undefined ? "false" : "true";
  bouton.addEventListener("click", () => (ouverte === undefined ? editer.ouvrir(station.nom) : editer.fermer()));
  if (ouverte !== undefined) return [capacites, bouton, formulaireDe(doc, station, ouverte, editer, { seule: projet.seule === true, ...(projet.projet === undefined ? {} : { projet: projet.projet }) })];
  if (editer.dernier?.nom === station.nom) return [capacites, bouton, uneLigneFaite(doc, editer.dernier.fait)];
  return [capacites, bouton];
}

// Le bloc : son titre, puis une ligne par station déclarée — ou la ligne qui dit qu'il n'y en a aucune, ou qu'elles ne
// sont pas encore lues. `stations` : ce que le dernier contrôle de l'installation a lu, absent tant qu'il n'a rien lu.
// `ici` : sa cuisine tourne sur ce poste.
// `projet` : son nom, que la confirmation d'un retrait dit ; `editer` : de quoi éditer chaque ligne — absent, le bloc se lit.
/**
 * @param {Fabrique} doc
 * @param {{ stations: StationsLues | undefined, ici?: boolean, projet?: string, editer?: Editer }} options
 */
export function poserLesDeclarees(doc, { stations, ici = false, projet: nom, editer }) {
  const section = cree(doc, "section");
  section.className = "stations-declarees";
  section.ariaLabel = TITRE;
  const tete = cree(doc, "h4", TITRE);
  tete.append(survol(doc, AIDE));
  section.append(tete);
  if (stations === undefined || stations.declarees.length === 0) {
    const vide = cree(doc, "p", stations === undefined ? PAS_LUE : AUCUNE);
    vide.className = "vide";
    section.append(vide);
    return section;
  }
  const projet = { ici, ...(nom === undefined ? {} : { projet: nom }), seule: stations.declarees.length === 1, ...(editer === undefined ? {} : { editer }) };
  const liste = cree(doc, "ol");
  liste.append(...stations.declarees.map((station) => ligneDe(doc, station, projet)));
  section.append(liste);
  return section;
}
