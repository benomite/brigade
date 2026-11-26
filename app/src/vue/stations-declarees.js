// @ts-check
// Les réglages d'une station que le projet déclare (tickets 1509, 1510, 2488) : son plafond de cooks et ses capacités, chacun
// un contrôle qui s'applique dès qu'il change — il envoie la déclaration de la station, cette seule valeur changée (service.ts,
// `changerUneStation`). Les capacités sont des cases (celles de « + station », ticket 1307), cochées comme elle les déclare,
// avec un champ pour en ajouter une hors de ces cases (ticket 1959, capacite-libre/). La déclaration vit sur sa station
// principale, pas dans le dépôt : aucun changement n'ouvre de PR. Ils se posent dans « Details » de la carte de la station,
// sur l'onglet Stations (projet/stations/ReglagesStation.js, stations-tab/, ticket 3195).
// La déclaration vient de `installation stations --json`, que le contrôle de l'installation lit (service.ts) : la vue la
// pose, elle n'en déduit rien d'autre.
// Ce module ne touche pas `document` : il reçoit de quoi créer un élément (briques.js), et rend des éléments.

import { caseACocher } from "./briques.js";
import { casesDuFormulaire, champDeCapaciteLibre } from "./capacite-libre/capacite-libre.js";

/** @typedef {import("./briques.js").Fabrique} Fabrique */
/** @typedef {import("../service.ts").StationsLues} StationsLues */
/** @typedef {import("../service.ts").StationDeclaree} StationDeclaree */
/** @typedef {"box" | "poste" | "ailleurs"} Ou */
/** @typedef {import("../projets/projets.ts").CapaciteDeLaMachine} CapaciteDeLaMachine */
/** @typedef {import("../service.ts").StationChangee} StationChangee */
/**
 * Le formulaire ouvert d'une station : ce que le chef y a saisi — `cooks` tel qu'il est tapé, `fournit` dans l'ordre
 * des cases cochées —, les cases qu'il offre (`choix`), la confirmation du retrait ouverte ou non, un changement en
 * route, la rangée d'où il est parti (`ou` : « cooks », « capacites », ou « retrait »), et ce qu'il a rendu.
 * @typedef {{ nom: string, cooks: string, fournit: string[], choix: { capacite: string, dite: string }[], envoi: boolean, ou?: string, rendu?: StationChangee }} Edition
 */
/** Ce qu'un changement envoie : la déclaration entière de la station, une seule valeur changée. @typedef {{ cooks: number, fournit: string[] }} Voulu */

// Ce qu'une rangée dit tant que son changement est en route.
export const APPLIQUE = "applying…";
export const SEULE = "the project's only station: without one, no cook leaves — declare another before removing it";

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

// Ce que le dernier changement d'une station a rendu sous la rangée `cle` : rien s'il est parti d'une autre, « applying… »
// tant qu'il est en route, puis ce qui est fait ou le refus — à poser par `ditDuReglage`.
/** @param {{ envoi?: boolean, ou?: string, rendu?: StationChangee }} etat @param {string} cle */
export function ditDe({ envoi, ou, rendu }, cle) {
  if (ou !== cle) return undefined;
  return envoi === true ? { enCours: APPLIQUE } : rendu;
}

// Un changement refusé : la saisie revient à la valeur en vigueur, celle que la station déclare.
/** @param {Edition} edition @param {StationDeclaree | undefined} station */
export function revenir(edition, station) {
  if (station === undefined) return;
  edition.cooks = String(station.cooks);
  edition.fournit = [...station.fournit];
}

// Le plafond d'une station, un nombre : il s'applique à son `change` (le champ quitté, ou Entrée), et la saisie garde la
// frappe d'ici là. `changer` reçoit la déclaration entière, le plafond tapé dedans ; rien ne part s'il n'a pas changé.
/**
 * @param {Fabrique} doc @param {StationDeclaree} station @param {Edition} edition @param {string} cle
 * @param {(voulu: Voulu) => void} changer
 */
export function champDuPlafond(doc, station, edition, cle, changer) {
  const cooks = cree(doc, "input");
  cooks.type = "number";
  cooks.min = "1";
  cooks.max = "99";
  cooks.value = edition.cooks;
  cooks.disabled = edition.envoi;
  cooks.ariaLabel = `how many cooks ${station.nom} runs at once`;
  // Le bloc reposé rend le clavier au champ où le chef tapait (vue.js, `reprise`).
  cooks.dataset.cle = cle;
  cooks.dataset.champ = "cooks";
  cooks.addEventListener("input", () => void (edition.cooks = cooks.value));
  cooks.addEventListener("change", () => {
    edition.cooks = cooks.value;
    if (edition.envoi || edition.cooks.trim() === String(station.cooks)) return;
    changer({ cooks: Number(edition.cooks), fournit: [...edition.fournit] });
  });
  return cooks;
}

// Les capacités d'une station : ses cases, et le champ d'une capacité hors d'elles (ticket 1959). Chaque case cochée ou
// décochée, chaque capacité ajoutée s'applique aussitôt : `changer` reçoit la déclaration entière, ces capacités dedans.
// Un changement en route : rien ne se coche avant qu'il ait répondu.
/**
 * @param {Fabrique} doc @param {StationDeclaree} station @param {Edition} edition
 * @param {(voulu: Voulu) => void} changer
 */
export function controleDesCapacites(doc, station, edition, changer) {
  const partir = () => changer({ cooks: Number(edition.cooks), fournit: [...edition.fournit] });
  const cases = cree(doc, "div");
  cases.className = "capacites";
  const uneCase = (/** @type {{ capacite: string, dite: string }} */ { capacite, dite }) => {
    const pose = caseACocher(doc, { nom: capacite, dit: dite, cochee: edition.fournit.includes(capacite), mono: true }, (cochee) => {
      edition.fournit = cochee ? [...edition.fournit.filter((tenue) => tenue !== capacite), capacite] : edition.fournit.filter((tenue) => tenue !== capacite);
      partir();
    });
    const coche = pose.firstChild;
    if (coche) coche.disabled = edition.envoi;
    return pose;
  };
  cases.append(...casesDuFormulaire(edition).map(uneCase));
  const libre = champDeCapaciteLibre(doc, edition, station.nom, (choix) => {
    cases.append(uneCase(choix));
    partir();
  });
  return [cases, libre];
}
