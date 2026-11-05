// @ts-check
// Les réglages de chaque station, sur l'onglet Stations (ticket 2488, épique 2484) : pour chaque station que le projet
// déclare, quatre lignes — combien de cooks elle fait tourner à la fois, ce qu'elle fournit, si elle prend les tickets
// ordinaires, et si elle sert le projet —, chacune avec son niveau (niveaux.js). Rien n'est stocké ici : chaque réglage
// reprend le stockage qui existe déjà.
//   - Le plafond et les capacités sont la déclaration des stations du projet, que sa station principale tient
//     (service.ts, `changerUneStation`, comme « edit » sur Cooks, ticket 1510) : « Save » les envoie ensemble.
//   - Les tickets ordinaires de la station qui tourne sur ce poste sont l'option de ce poste (ordinaires.ts, la même que
//     Settings) : la case s'écrit aussitôt. Ailleurs, la valeur est ce que `facts` dit de la station, et le survol dit
//     pourquoi elle ne se change pas d'ici.
//   - Servir le projet, c'est y être déclarée : décocher demande confirmation, puis retire la station (`retiree`).
// Ce que le chef saisit est gardé dans `saisies`, à la vue : un bloc reposé le redonne tel quel. Une saisie dont la
// station a changé de déclaration depuis repart de la déclaration lue. Ce module ne touche pas `document` : il reçoit de
// quoi créer un élément (briques.js), et rend un élément.

import { boutonAction, caseACocher, confirmationDeGeste, lectureIndisponible, survol } from "../../briques.js";
import { casesDuFormulaire, champDeCapaciteLibre } from "../../capacite-libre/capacite-libre.js";
import { niveauDe } from "../../niveaux.js";
import { choixDeCapacites, motDuLieu, ouTourne, plafondDit, SEULE } from "../../stations-declarees.js";

/** @typedef {import("../../briques.js").Fabrique} Fabrique */
/** @typedef {import("../../../service.ts").StationsLues} StationsLues */
/** @typedef {import("../../../service.ts").StationDeclaree} StationDeclaree */
/** @typedef {import("../../../ordinaires.ts").Bloc} Ordinaires */
/** @typedef {import("../../stations-declarees.js").Edition} Edition */
// Ce que le chef a saisi pour une station : le formulaire de « edit » (stations-declarees.js), et la déclaration d'où il
// est parti (`lue`).
/** @typedef {Edition & { lue: string }} Saisie */
/**
 * Les gestes, que la vue envoie au process principal avant de reposer le bloc : « Save » (le plafond et les capacités
 * saisis), la case des tickets ordinaires de ce poste, la confirmation de « ne plus servir » ouverte ou refermée, et le
 * retrait confirmé.
 * @typedef {{ sauver(nom: string): void, ordinaires(pris: boolean): void, confirmer(nom: string, oui: boolean): void, retirer(nom: string): void }} Gestes
 */

export const TITRE = "Station settings";
export const AIDE = "Each station the project declares: how many cooks it runs at once, what it provides, whether it takes ordinary tickets, and whether it serves this project.";
export const PAS_LUE = "not read yet: the next check of the installation reads them";
export const AUCUNE = "no station declared: no cook leaves for this project";
// Les noms des quatre réglages, et leur clé dans la table des niveaux.
export const REGLAGES = /** @type {const} */ ([
  { cle: "cooks", nom: "cooks at once" },
  { cle: "capacites", nom: "what it provides" },
  { cle: "ordinaires", nom: "ordinary tickets" },
  { cle: "sert", nom: "serves this project" },
]);
export const SAUVER = "Save";
export const ARRETER = "Stop serving";
// Pourquoi les tickets ordinaires d'une station ne se changent pas d'ici, au survol.
export const ORDINAIRES_DE_LA_BOX = "a station on the box takes every ticket it can cook, ordinary ones included";
export const ORDINAIRES_D_AILLEURS = "chosen when this station was added to the project: only its own computer changes it";
export const ORDINAIRES_PAS_DITS = "its main station does not say it yet";

/** @param {Fabrique} doc @param {string} balise @param {string} [texte] */
function cree(doc, balise, texte) {
  const pose = doc.createElement(balise);
  if (texte !== undefined) pose.textContent = texte;
  return pose;
}

// La déclaration d'une station, telle qu'une saisie s'en souvient.
const cleDe = (/** @type {StationDeclaree} */ station) => JSON.stringify([station.cooks, station.fournit]);

// La saisie d'une station : celle que le chef a commencée, tant que la déclaration est celle d'où elle est partie — ou
// un envoi est en route. Sinon, une neuve, d'après la déclaration ; ce que le dernier « Save » a rendu y reste dit.
/** @param {Map<string, Saisie>} saisies @param {StationDeclaree} station @param {StationsLues} stations @returns {Saisie} */
export function saisieDe(saisies, station, stations) {
  const tenue = saisies.get(station.nom);
  if (tenue !== undefined && (tenue.lue === cleDe(station) || tenue.envoi)) return tenue;
  /** @type {Saisie} */
  const neuve = { nom: station.nom, cooks: String(station.cooks), fournit: [...station.fournit], choix: choixDeCapacites(station, stations, []), confirmer: false, envoi: false, lue: cleDe(station) };
  if (tenue?.rendu !== undefined && "fait" in tenue.rendu) neuve.rendu = tenue.rendu;
  saisies.set(station.nom, neuve);
  return neuve;
}

// La saisie change-t-elle la déclaration ?
/** @param {StationDeclaree} station @param {Saisie} saisie */
export function change(station, saisie) {
  const memes = saisie.fournit.length === station.fournit.length && saisie.fournit.every((capacite) => station.fournit.includes(capacite));
  return saisie.cooks.trim() !== String(station.cooks) || !memes;
}

// Les tickets ordinaires d'une station : pris ou non (`null` : rien ne le dit), s'ils se règlent d'ici, et ce que le survol
// en dit. La station qui tourne sur ce poste a l'option de ce poste ; une autre de la box les prend tous ; une distante, ce
// que `facts` dit d'elle.
/**
 * @param {StationDeclaree} station
 * @param {{ ici: boolean, ordinaires?: Ordinaires, lignes?: readonly { station: string, ordinaires?: boolean }[] }} contexte
 * @returns {{ pris: boolean | null, reglable: boolean, survol: string }}
 */
export function ordinairesDe(station, { ici, ordinaires, lignes }) {
  if (ouTourne(station, { ici }) === "poste" && ordinaires !== undefined) return { pris: ordinaires.actif, reglable: ordinaires.reglable, survol: ordinaires.indisponible ?? ordinaires.explication };
  if (!station.distante) return { pris: true, reglable: false, survol: ORDINAIRES_DE_LA_BOX };
  const dit = lignes?.find((ligne) => ligne.station === station.nom)?.ordinaires;
  return dit === undefined ? { pris: null, reglable: false, survol: ORDINAIRES_PAS_DITS } : { pris: dit, reglable: false, survol: ORDINAIRES_D_AILLEURS };
}

// Une ligne de réglage — la même que dans Settings : son nom et l'étiquette de son niveau, sa valeur, son contrôle.
/** @param {Fabrique} doc @param {{ cle: string, nom: string }} reglage @param {HTMLElement} niveau @param {(Node | string)[]} valeur @param {Node[]} controle */
function ligne(doc, { cle, nom }, niveau, valeur, controle) {
  const rangee = cree(doc, "div");
  rangee.className = "reglage";
  rangee.dataset.cle = cle;
  const nomme = cree(doc, "span", nom);
  nomme.className = "nom";
  nomme.append(niveau);
  const vaut = cree(doc, "p");
  vaut.className = "valeur";
  vaut.append(...valeur);
  const champ = cree(doc, "div");
  champ.className = "champ";
  champ.append(...controle);
  rangee.append(nomme, vaut, champ);
  return rangee;
}

/** @param {Fabrique} doc @param {string} texte @param {string} [survolDit] @param {boolean} [mono] */
function valeurDite(doc, texte, survolDit, mono = false) {
  const dite = cree(doc, "strong", texte);
  if (mono) dite.className = "mono";
  return survolDit === undefined || survolDit === "" ? [dite] : [dite, survol(doc, survolDit)];
}

// Une case seule, pour un oui ou non : désactivée, ce qui l'empêche est au survol de sa valeur.
/** @param {Fabrique} doc @param {string} libelle @param {boolean} cochee @param {boolean} active @param {(cochee: boolean) => void} changer */
function caseOuiNon(doc, libelle, cochee, active, changer) {
  const coche = /** @type {HTMLInputElement} */ (cree(doc, "input"));
  coche.type = "checkbox";
  coche.checked = cochee;
  coche.disabled = !active;
  coche.ariaLabel = libelle;
  coche.addEventListener("change", () => changer(coche.checked === true));
  return coche;
}

// Les quatre réglages d'une station, puis ce que son dernier geste a rendu.
/**
 * @param {Fabrique} doc @param {StationDeclaree} station @param {Saisie} saisie
 * @param {{ projet: string, ici: boolean, seule: boolean, ordinaires?: Ordinaires, lignes?: readonly { station: string, ordinaires?: boolean }[], gestes: Gestes }} contexte
 */
function stationReglee(doc, station, saisie, contexte) {
  const { projet, ici, seule, gestes } = contexte;
  const section = cree(doc, "section");
  section.className = "station-reglee";
  section.dataset.station = station.nom;
  section.ariaLabel = `${station.nom}'s settings`;
  const tete = cree(doc, "h4");
  const nom = cree(doc, "strong", station.nom);
  nom.className = "mono";
  tete.append(nom, motDuLieu(doc, station, { ici }));
  section.append(tete);

  const sauver = boutonAction(doc, saisie.envoi ? "saving…" : SAUVER, () => gestes.sauver(station.nom), { recommande: true });
  sauver.className = "action sauver";
  const clic = /** @type {HTMLButtonElement} */ (sauver.firstChild);
  const suivre = () => void (clic.disabled = saisie.envoi || !change(station, saisie));

  // Le plafond : un nombre, gardé à la frappe.
  const cooks = /** @type {HTMLInputElement} */ (cree(doc, "input"));
  cooks.type = "number";
  cooks.min = "1";
  cooks.max = "99";
  cooks.value = saisie.cooks;
  cooks.disabled = saisie.envoi;
  cooks.ariaLabel = `how many cooks ${station.nom} runs at once`;
  // Le bloc reposé rend le clavier au champ où le chef tapait (vue.js, `reprise`).
  cooks.dataset.cle = `reglage:${station.nom}`;
  cooks.dataset.champ = "cooks";
  cooks.addEventListener("input", () => {
    saisie.cooks = cooks.value;
    suivre();
  });

  // Les capacités : les cases de « edit », et une capacité hors d'elles, tapée (ticket 1959).
  const cases = cree(doc, "div");
  cases.className = "capacites";
  const uneCase = (/** @type {{ capacite: string, dite: string }} */ { capacite, dite }) => {
    const pose = caseACocher(doc, { nom: capacite, dit: dite, cochee: saisie.fournit.includes(capacite), mono: true }, (cochee) => {
      saisie.fournit = cochee ? [...saisie.fournit.filter((tenue) => tenue !== capacite), capacite] : saisie.fournit.filter((tenue) => tenue !== capacite);
      suivre();
    });
    const coche = /** @type {HTMLInputElement | undefined} */ (pose.firstChild ?? undefined);
    if (coche !== undefined) coche.disabled = saisie.envoi;
    return pose;
  };
  cases.append(...casesDuFormulaire(saisie).map(uneCase));
  const libre = champDeCapaciteLibre(doc, saisie, station.nom, (choix) => {
    cases.append(uneCase(choix));
    suivre();
  });

  const fournit = station.fournit.length === 0 ? "provides nothing" : station.fournit.join(", ");
  const plafond = ligne(doc, REGLAGES[0], niveauDe(doc, "cooks"), valeurDite(doc, plafondDit(station.cooks)), [cooks]);
  const capacites = ligne(doc, REGLAGES[1], niveauDe(doc, "capacites"), valeurDite(doc, fournit, undefined, station.fournit.length > 0), [cases, libre]);

  // Les tickets ordinaires : la case de ce poste, ou la valeur dite ailleurs, et pourquoi elle ne se change pas d'ici.
  const ordinaires = ordinairesDe(station, contexte);
  const ordinairesDits = ordinaires.pris === null ? "not said" : ordinaires.pris ? "taken" : "not taken";
  const caseOrdinaires = caseOuiNon(doc, `${station.nom} takes the ordinary tickets`, ordinaires.pris === true, ordinaires.reglable, (pris) => gestes.ordinaires(pris));
  const prendre = ligne(doc, REGLAGES[2], niveauDe(doc, "ordinaires"), valeurDite(doc, ordinairesDits, ordinaires.survol), [caseOrdinaires]);
  prendre.dataset.pris = ordinaires.pris === null ? "inconnu" : String(ordinaires.pris);

  // Servir le projet : être déclarée. Décocher demande confirmation ; la seule station ne se retire pas.
  const caseSert = caseOuiNon(doc, `${station.nom} serves ${projet}`, !saisie.confirmer, !seule && !saisie.envoi, (cochee) => gestes.confirmer(station.nom, !cochee));
  const sert = ligne(doc, REGLAGES[3], niveauDe(doc, "sert"), valeurDite(doc, "serves it", seule ? `Not removable: ${SEULE}.` : undefined), [caseSert]);
  if (saisie.confirmer) {
    sert.append(
      confirmationDeGeste(
        doc,
        { titre: `Stop serving ${projet} on ${station.nom}? The other stations stay as they are.`, prix: "its cooks take no new ticket — a ticket that needs what only it provides waits", oui: ARRETER, non: "Keep it" },
        { oui: () => gestes.retirer(station.nom), non: () => gestes.confirmer(station.nom, false) },
      ),
    );
  }

  const pied = cree(doc, "div");
  pied.className = "gestes";
  pied.append(sauver);
  suivre();
  section.append(plafond, capacites, pied, prendre, sert);
  const rendu = saisie.rendu;
  if (rendu !== undefined) {
    if ("refus" in rendu) section.append(lectureIndisponible(doc, rendu.refus, rendu.detail ?? ""));
    else {
      const fait = cree(doc, "p", rendu.fait);
      fait.className = "fait";
      section.append(fait);
    }
  }
  return section;
}

// Le bloc : son titre, puis les réglages de chaque station déclarée, dans l'ordre de la déclaration — ou la ligne qui dit
// qu'il n'y en a aucune, ou qu'elles ne sont pas encore lues. Sans `reglages`, la coquille et son titre seuls.
/**
 * @param {Fabrique} doc
 * @param {{ stations: StationsLues | undefined, projet: string, ici?: boolean, ordinaires?: Ordinaires, lignes?: readonly { station: string, ordinaires?: boolean }[], saisies: Map<string, Saisie>, gestes: Gestes }} [reglages]
 */
export function poserBlocReglagesStation(doc, reglages) {
  const bloc = doc.createElement("section");
  bloc.className = "bloc-du-projet reglages-station";
  bloc.dataset.bloc = "reglages-station";
  bloc.ariaLabel = TITRE;
  const titre = doc.createElement("h3");
  titre.textContent = TITRE;
  bloc.append(titre);
  if (reglages === undefined) return bloc;
  titre.append(survol(doc, AIDE));
  const { stations, saisies } = reglages;
  if (stations === undefined || stations.declarees.length === 0) {
    const vide = cree(doc, "p", stations === undefined ? PAS_LUE : AUCUNE);
    vide.className = "vide";
    bloc.append(vide);
    return bloc;
  }
  const contexte = {
    projet: reglages.projet,
    ici: reglages.ici === true,
    seule: stations.declarees.length === 1,
    ...(reglages.ordinaires === undefined ? {} : { ordinaires: reglages.ordinaires }),
    ...(reglages.lignes === undefined ? {} : { lignes: reglages.lignes }),
    gestes: reglages.gestes,
  };
  bloc.append(...stations.declarees.map((station) => stationReglee(doc, station, saisieDe(saisies, station, stations), contexte)));
  return bloc;
}
