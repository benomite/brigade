// @ts-check
// Ce que chaque station déclarée fournit, sur l'onglet Stations, sous ses stations (ticket 1509, épique 1506) : une ligne
// par station que la box du projet déclare, dans l'ordre de sa déclaration — son nom, où elle tourne, son plafond de
// cooks et ses capacités. Où elle tourne a trois mots distincts : sur la box (« box station ») ; sur ce poste
// (« this workstation » : la cuisine du projet y tourne) ; sur un autre poste (« remote »). Un projet qui ne déclare aucune station le dit en une ligne, jamais par un blanc ; une déclaration
// pas encore lue aussi.
// Chaque ligne s'édite (ticket 1510) : « edit » ouvre sous elle son formulaire — deux rangées de réglage
// (composants/reglage, ticket 2920) : son plafond, et ses capacités en cases (celles de « + station », ticket 1307),
// cochées comme elle les déclare, avec un champ pour en ajouter une hors de ces cases (ticket 1959, capacite-libre/).
// Chaque contrôle s'applique dès qu'il change : il envoie la déclaration de la station, cette seule valeur changée — il
// n'y a pas de « Save ». Le geste ne change qu'elle (service.ts, `changerUneStation`). La déclaration vit sur sa station
// principale, pas dans le dépôt : aucun changement n'ouvre de PR. « Remove », qui demande confirmation, reste un geste.
// La déclaration vient de `installation stations --json`, que le contrôle de l'installation lit (service.ts) : la vue la
// pose, elle n'en déduit rien d'autre.
// Ce module ne touche pas `document` : il reçoit de quoi créer un élément (briques.js), et rend un élément.

import { boutonAction, caseACocher, survol } from "./briques.js";
import { confirmationDeGeste } from "./composants/confirmation/confirmation.js";
import { ligneErreur } from "./composants/ligne-erreur/ligne-erreur.js";
import { casesDuFormulaire, champDeCapaciteLibre } from "./capacite-libre/capacite-libre.js";
import { bouton as boutonDeLaFamille } from "./composants/bouton/bouton.js";
import { ligneVide } from "./composants/ligne-vide/ligne-vide.js";
import { ditDuReglage, rangeeDeReglage } from "./composants/reglage/reglage.js";
import { niveauDe } from "./niveaux.js";
import { CET_ORDINATEUR } from "./lexique.js";

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
 * @typedef {{ nom: string, cooks: string, fournit: string[], choix: { capacite: string, dite: string }[], confirmer: boolean, envoi: boolean, ou?: string, rendu?: StationChangee }} Edition
 */
/** Ce qu'un changement envoie : la déclaration entière de la station, une seule valeur changée. @typedef {{ cooks: number, fournit: string[] }} Voulu */
/**
 * Ce que la vue donne pour éditer : le formulaire ouvert, ce que le dernier changement a rendu sur une station fermée
 * (son plafond réglé sur sa ligne, stations-de-cuisson.js, ou son retrait), et les gestes — la vue les envoie au
 * process principal, puis repose le bloc. `appliquer` : la rangée `cle` a changé, `voulu` part.
 * @typedef {{ editee?: Edition, dernier?: { nom: string, ou: string, envoi?: boolean, rendu?: StationChangee }, ouvrir(nom: string): void, fermer(): void, appliquer(nom: string, cle: string, voulu: Voulu): void, confirmer(oui: boolean): void, retirer(): void }} Editer
 */

export const TITRE = "what each station provides";
export const AIDE = "The stations the project declares: how many cooks each runs at once, what it provides to the tickets that need it, and where it runs.";
export const AUCUNE = "no station declared: no cook leaves for this project";
export const PAS_LUE = "not read yet: the next check of the installation reads them";
// Les mots du formulaire d'une station.
export const EDITER = "edit";
export const PLAFOND = "Cooks at once";
export const FOURNIT = "What it provides";
export const RETIRER = "Remove";
export const FERMER = "Close";
// Ce qu'une rangée dit tant que son changement est en route.
export const APPLIQUE = "applying…";
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
  if (ou === "ailleurs") return `remote: another workstation plays it and pulls its work from the main station — ${CET_ORDINATEUR} does not`;
  return distante ? "remote: another workstation plays it and pulls its work from the main station" : `the project's kitchen runs on ${CET_ORDINATEUR}: this station runs with it`;
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

// Le formulaire ouvert d'une station, sous sa ligne : ses deux rangées de réglage, puis ses gestes — le fermer, la retirer.
// Ce que le chef saisit est gardé dans `editee` au fil de la frappe : un bloc reposé le redonne tel quel.
/**
 * @param {Fabrique} doc @param {StationDeclaree} station @param {Edition} editee @param {Editer} editer
 * @param {{ seule: boolean, projet?: string }} contexte
 */
function formulaireDe(doc, station, editee, editer, { seule, projet }) {
  const forme = cree(doc, "div");
  forme.className = "edition";
  forme.ariaLabel = `edit ${station.nom}`;
  const appliquer = (/** @type {string} */ cle) => (/** @type {Voulu} */ voulu) => editer.appliquer(station.nom, cle, voulu);
  const plafond = rangeeDeReglage(doc, {
    nom: PLAFOND,
    cle: "cooks",
    niveau: niveauDe(doc, "cooks"),
    valeur: [cree(doc, "strong", plafondDit(station.cooks))],
    controle: [champDuPlafond(doc, station, editee, `station:${station.nom}`, appliquer("cooks"))],
    dessous: ditDuReglage(doc, ditDe(editee, "cooks")),
  });
  const fournit = cree(doc, "strong", station.fournit.length === 0 ? "provides nothing" : station.fournit.join(", "));
  if (station.fournit.length > 0) fournit.className = "mono";
  const capacites = rangeeDeReglage(doc, {
    nom: FOURNIT,
    cle: "capacites",
    niveau: niveauDe(doc, "capacites"),
    valeur: [fournit],
    controle: controleDesCapacites(doc, station, editee, appliquer("capacites")),
    dessous: ditDuReglage(doc, ditDe(editee, "capacites")),
  });
  forme.append(plafond, capacites);
  const gestes = cree(doc, "div");
  gestes.className = "gestes";
  const fermer = boutonAction(doc, FERMER, () => editer.fermer());
  const retirer = boutonAction(doc, RETIRER, () => editer.confirmer(true));
  retirer.className = "action retrait";
  // Un changement en route : rien ne repart avant qu'il ait répondu.
  retirer.firstChild.disabled = editee.envoi;
  if (seule) {
    retirer.firstChild.disabled = true;
    retirer.append(survol(doc, `Not removable: ${SEULE}.`));
  }
  gestes.append(fermer, retirer);
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
  // Ce que le retrait a rendu, sous ses gestes : il n'est la valeur d'aucune rangée.
  const retrait = ditDe(editee, "retrait");
  if (retrait !== undefined && !("enCours" in retrait)) forme.append("refus" in retrait ? ligneErreur(doc, retrait.refus, retrait.detail ?? "") : uneLigneFaite(doc, retrait.fait));
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
// le dernier geste y a rendu. Le bloc de ses stations sur Stations (stations-de-cuisson.js, ticket 1786) le pose dans la ligne de chacune.
/**
 * @param {Fabrique} doc @param {StationDeclaree} station
 * @param {{ ici: boolean, projet?: string, seule?: boolean, editer?: Editer }} projet
 */
export function ceQuElleFournit(doc, station, projet) {
  const capacites = cree(doc, "ul");
  capacites.ariaLabel = `what ${station.nom} provides`;
  if (station.fournit.length === 0) {
    capacites.className = "capacites vide";
    capacites.append(ligneVide(doc, "provides nothing", { balise: "li", classe: "" }));
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
  const bouton = boutonDeLaFamille(doc, EDITER, undefined);
  bouton.className = "editer";
  bouton.ariaLabel = `edit ${station.nom}`;
  bouton.ariaExpanded = ouverte === undefined ? "false" : "true";
  bouton.addEventListener("click", () => (ouverte === undefined ? editer.ouvrir(station.nom) : editer.fermer()));
  if (ouverte !== undefined) return [capacites, bouton, formulaireDe(doc, station, ouverte, editer, { seule: projet.seule === true, ...(projet.projet === undefined ? {} : { projet: projet.projet }) })];
  // Le formulaire refermé : ce que son retrait a rendu reste dit sous sa ligne.
  const retrait = editer.dernier?.nom === station.nom ? ditDe(editer.dernier, "retrait") : undefined;
  if (retrait !== undefined && "fait" in retrait) return [capacites, bouton, uneLigneFaite(doc, retrait.fait)];
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
    const vide = ligneVide(doc, stations === undefined ? PAS_LUE : AUCUNE);
    section.append(vide);
    return section;
  }
  const projet = { ici, ...(nom === undefined ? {} : { projet: nom }), seule: stations.declarees.length === 1, ...(editer === undefined ? {} : { editer }) };
  const liste = cree(doc, "ol");
  liste.append(...stations.declarees.map((station) => ligneDe(doc, station, projet)));
  section.append(liste);
  return section;
}
