// @ts-check
// Les réglages de chaque station, sur l'onglet Stations (ticket 2488, épique 2484), dans « Details » de sa carte
// (stations-tab/, ticket 3195) : pour chaque station que le projet déclare, trois lignes — combien de cooks elle fait tourner à la fois, ce qu'elle fournit, et si elle prend les tickets
// ordinaires —, chacune la rangée de réglage de l'app (composants/reglage, ticket 2920), avec
// son niveau (niveaux.js). Chaque contrôle s'applique dès qu'il change : il n'y a pas de « Save ». Tant que le
// changement est en route, la rangée le dit dessous et ses contrôles attendent ; refusé, le refus s'y lit et le contrôle
// revient à la valeur en vigueur. Rien n'est stocké ici : chaque réglage reprend le stockage qui existe déjà — sur la
// station, jamais dans le dépôt : aucun n'ouvre de PR.
//   - Le plafond et les capacités sont la déclaration des stations du projet, que sa station principale tient
//     (service.ts, `changerUneStation`, comme « edit » sur Cooks, ticket 1510) : un changement envoie la déclaration
//     entière de la station, cette seule valeur changée.
//   - Les tickets ordinaires de la station qui tourne sur ce poste sont l'option de ce poste (ordinaires.ts, la même que
//     Settings) : la case s'écrit aussitôt. Ailleurs, la valeur est ce que `facts` dit de la station, et le survol dit
//     pourquoi elle ne se change pas d'ici.
//   - Retirer une station n'est pas ici : c'est « Stop cooking here », sur sa carte, et nulle part ailleurs.
// Ce que le chef saisit est gardé dans `saisies`, à la vue : un bloc reposé le redonne tel quel. Une saisie dont la
// station a changé de déclaration depuis repart de la déclaration lue. Ce module ne touche pas `document` : il reçoit de
// quoi créer un élément (briques.js), et rend un élément.

import { survol } from "../../briques.js";
import { interrupteur } from "../../composants/interrupteur/interrupteur.js";
import { niveauDe } from "../../niveaux.js";
import { APPLIQUE, champDuPlafond, choixDeCapacites, controleDesCapacites, ditDe, ouTourne, plafondDit } from "../../stations-declarees.js";
import { ditDuReglage, rangeeDeReglage } from "../../composants/reglage/reglage.js";

/** @typedef {import("../../briques.js").Fabrique} Fabrique */
/** @typedef {import("../../../service.ts").StationsLues} StationsLues */
/** @typedef {import("../../../service.ts").StationDeclaree} StationDeclaree */
/** @typedef {import("../../../ordinaires.ts").Bloc} Ordinaires */
/** @typedef {import("../../stations-declarees.js").Edition} Edition */
/** @typedef {import("../../stations-declarees.js").Voulu} Voulu */
/** @typedef {import("../../composants/reglage/reglage.js").Dit} Dit */
// Ce que le chef a saisi pour une station : le formulaire de « edit » (stations-declarees.js), et la déclaration d'où il
// est parti (`lue`).
/** @typedef {Edition & { lue: string }} Saisie */
/**
 * Les gestes, que la vue envoie au process principal avant de reposer le bloc : un changement du plafond ou des capacités
 * (`appliquer` : la rangée `cle` d'où il part, et la déclaration entière voulue), et l'interrupteur des tickets ordinaires
 * de ce poste.
 * @typedef {{ appliquer(nom: string, cle: string, voulu: Voulu): void, ordinaires(pris: boolean): void }} Gestes
 */

// Les noms des quatre réglages, et leur clé dans la table des niveaux.
export const REGLAGES = /** @type {const} */ ([
  { cle: "cooks", nom: "cooks at once" },
  { cle: "capacites", nom: "what it provides" },
  { cle: "ordinaires", nom: "ordinary tickets" },
]);
// Ce que dit la rangée des tickets ordinaires de ce poste tant que leur changement est en route.
export const ORDINAIRES_EN_COURS = { enCours: APPLIQUE };
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
// un changement est en route. Sinon, une neuve, d'après la déclaration ; ce que le dernier changement a rendu y reste dit,
// sous sa rangée.
/** @param {Map<string, Saisie>} saisies @param {StationDeclaree} station @param {StationsLues} stations @returns {Saisie} */
export function saisieDe(saisies, station, stations) {
  const tenue = saisies.get(station.nom);
  if (tenue !== undefined && (tenue.lue === cleDe(station) || tenue.envoi)) return tenue;
  /** @type {Saisie} */
  const neuve = { nom: station.nom, cooks: String(station.cooks), fournit: [...station.fournit], choix: choixDeCapacites(station, stations, []), envoi: false, lue: cleDe(station) };
  if (tenue?.rendu !== undefined && "fait" in tenue.rendu) {
    neuve.rendu = tenue.rendu;
    if (tenue.ou !== undefined) neuve.ou = tenue.ou;
  }
  saisies.set(station.nom, neuve);
  return neuve;
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

/** @param {Fabrique} doc @param {string} texte @param {string} [survolDit] @param {boolean} [mono] */
function valeurDite(doc, texte, survolDit, mono = false) {
  const dite = cree(doc, "strong", texte);
  if (mono) dite.className = "mono";
  return survolDit === undefined || survolDit === "" ? [dite] : [dite, survol(doc, survolDit)];
}

// Les trois réglages d'une station, chacun ce que son dernier changement a rendu dessous.
/**
 * @param {Fabrique} doc @param {StationDeclaree} station @param {Saisie} saisie
 * @param {{ ici: boolean, ordinaires?: Ordinaires, ordinairesDit?: Dit, lignes?: readonly { station: string, ordinaires?: boolean }[], gestes: Gestes }} contexte
 */
export function reglagesDeLaStation(doc, station, saisie, contexte) {
  const { gestes } = contexte;
  const section = cree(doc, "section");
  section.className = "station-reglee";
  section.dataset.station = station.nom;
  section.ariaLabel = `${station.nom}'s settings`;
  const appliquer = (/** @type {string} */ cle) => (/** @type {Voulu} */ voulu) => gestes.appliquer(station.nom, cle, voulu);

  // Le plafond : un nombre, appliqué quand il change ; les capacités : les cases de « edit », et une capacité hors
  // d'elles, tapée (ticket 1959) — chacune appliquée dès qu'elle est cochée, décochée ou ajoutée.
  const fournit = station.fournit.length === 0 ? "provides nothing" : station.fournit.join(", ");
  const [{ cle: cleCooks, nom: nomCooks }, { cle: cleCapacites, nom: nomCapacites }, { cle: cleOrdinaires, nom: nomOrdinaires }] = REGLAGES;
  const plafond = rangeeDeReglage(doc, {
    nom: nomCooks,
    cle: cleCooks,
    niveau: niveauDe(doc, cleCooks),
    valeur: valeurDite(doc, plafondDit(station.cooks)),
    controle: [champDuPlafond(doc, station, saisie, `reglage:${station.nom}`, appliquer(cleCooks))],
    dessous: ditDuReglage(doc, ditDe(saisie, cleCooks)),
  });
  const capacites = rangeeDeReglage(doc, {
    nom: nomCapacites,
    cle: cleCapacites,
    niveau: niveauDe(doc, cleCapacites),
    valeur: valeurDite(doc, fournit, undefined, station.fournit.length > 0),
    controle: controleDesCapacites(doc, station, saisie, appliquer(cleCapacites)),
    dessous: ditDuReglage(doc, ditDe(saisie, cleCapacites)),
  });

  // Les tickets ordinaires : la case de ce poste, ou la valeur dite ailleurs, et pourquoi elle ne se change pas d'ici.
  // Ce que son dernier changement a rendu ne vaut que pour la station de ce poste.
  const ordinaires = ordinairesDe(station, contexte);
  const ordinairesDits = ordinaires.pris === null ? "not said" : ordinaires.pris ? "taken" : "not taken";
  const ordinairesDit = ordinaires.reglable ? contexte.ordinairesDit : undefined;
  const enCours = ordinairesDit !== undefined && "enCours" in ordinairesDit;
  const caseOrdinaires = interrupteur(
    doc,
    { texte: ordinaires.pris === null ? "…" : ordinaires.pris ? "on" : "off", allume: ordinaires.pris ?? undefined, libelle: `${station.nom} takes the ordinary tickets`, actif: ordinaires.reglable && !enCours },
    (pris) => gestes.ordinaires(pris),
  );
  const prendre = rangeeDeReglage(doc, { nom: nomOrdinaires, cle: cleOrdinaires, niveau: niveauDe(doc, cleOrdinaires), valeur: valeurDite(doc, ordinairesDits, ordinaires.survol), controle: [caseOrdinaires], dessous: ditDuReglage(doc, ordinairesDit) });
  prendre.dataset.pris = ordinaires.pris === null ? "inconnu" : String(ordinaires.pris);
  if (ordinaires.pris !== true) prendre.dataset.retrait = "";

  section.append(plafond, capacites, prendre);
  return section;
}
