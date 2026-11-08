// @ts-check
// Les réglages de chaque station, sur l'onglet Stations (ticket 2488, épique 2484) : pour chaque station que le projet
// déclare, quatre lignes — combien de cooks elle fait tourner à la fois, ce qu'elle fournit, si elle prend les tickets
// ordinaires, et si elle sert le projet —, chacune la rangée de réglage de l'app (composants/reglage, ticket 2920), avec
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
//   - Servir le projet, c'est y être déclarée : décocher demande confirmation, puis retire la station (`retiree`).
// Ce que le chef saisit est gardé dans `saisies`, à la vue : un bloc reposé le redonne tel quel. Une saisie dont la
// station a changé de déclaration depuis repart de la déclaration lue. Ce module ne touche pas `document` : il reçoit de
// quoi créer un élément (briques.js), et rend un élément.

import { survol } from "../../briques.js";
import { confirmationDeGeste } from "../../composants/confirmation/confirmation.js";
import { niveauDe } from "../../niveaux.js";
import { APPLIQUE, champDuPlafond, choixDeCapacites, controleDesCapacites, ditDe, motDuLieu, ouTourne, plafondDit, SEULE } from "../../stations-declarees.js";
import { ligneVide } from "../../composants/ligne-vide/ligne-vide.js";
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
 * (`appliquer` : la rangée `cle` d'où il part, et la déclaration entière voulue), la case des tickets ordinaires de ce
 * poste, la confirmation de « ne plus servir » ouverte ou refermée, et le retrait confirmé.
 * @typedef {{ appliquer(nom: string, cle: string, voulu: Voulu): void, ordinaires(pris: boolean): void, confirmer(nom: string, oui: boolean): void, retirer(nom: string): void }} Gestes
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
export const ARRETER = "Stop serving";
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
  const neuve = { nom: station.nom, cooks: String(station.cooks), fournit: [...station.fournit], choix: choixDeCapacites(station, stations, []), confirmer: false, envoi: false, lue: cleDe(station) };
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

// Les quatre réglages d'une station, chacun ce que son dernier changement a rendu dessous.
/**
 * @param {Fabrique} doc @param {StationDeclaree} station @param {Saisie} saisie
 * @param {{ projet: string, ici: boolean, seule: boolean, ordinaires?: Ordinaires, ordinairesDit?: Dit, lignes?: readonly { station: string, ordinaires?: boolean }[], gestes: Gestes }} contexte
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
  const appliquer = (/** @type {string} */ cle) => (/** @type {Voulu} */ voulu) => gestes.appliquer(station.nom, cle, voulu);

  // Le plafond : un nombre, appliqué quand il change ; les capacités : les cases de « edit », et une capacité hors
  // d'elles, tapée (ticket 1959) — chacune appliquée dès qu'elle est cochée, décochée ou ajoutée.
  const fournit = station.fournit.length === 0 ? "provides nothing" : station.fournit.join(", ");
  const [{ cle: cleCooks, nom: nomCooks }, { cle: cleCapacites, nom: nomCapacites }, { cle: cleOrdinaires, nom: nomOrdinaires }, { cle: cleSert, nom: nomSert }] = REGLAGES;
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
  const caseOrdinaires = caseOuiNon(doc, `${station.nom} takes the ordinary tickets`, ordinaires.pris === true, ordinaires.reglable && !enCours, (pris) => gestes.ordinaires(pris));
  const prendre = rangeeDeReglage(doc, { nom: nomOrdinaires, cle: cleOrdinaires, niveau: niveauDe(doc, cleOrdinaires), valeur: valeurDite(doc, ordinairesDits, ordinaires.survol), controle: [caseOrdinaires], dessous: ditDuReglage(doc, ordinairesDit) });
  prendre.dataset.pris = ordinaires.pris === null ? "inconnu" : String(ordinaires.pris);

  // Servir le projet : être déclarée. Décocher demande confirmation ; la seule station ne se retire pas.
  const caseSert = caseOuiNon(doc, `${station.nom} serves ${projet}`, !saisie.confirmer, !seule && !saisie.envoi, (cochee) => gestes.confirmer(station.nom, !cochee));
  const confirmation = saisie.confirmer
    ? [
        confirmationDeGeste(
          doc,
          { titre: `Stop serving ${projet} on ${station.nom}? The other stations stay as they are.`, prix: "its cooks take no new ticket — a ticket that needs what only it provides waits", oui: ARRETER, non: "Keep it" },
          { oui: () => gestes.retirer(station.nom), non: () => gestes.confirmer(station.nom, false) },
        ),
      ]
    : [];
  const sert = rangeeDeReglage(doc, { nom: nomSert, cle: cleSert, niveau: niveauDe(doc, "sert"), valeur: valeurDite(doc, "serves it", seule ? `Not removable: ${SEULE}.` : undefined), controle: [caseSert], dessous: [...confirmation, ...ditDuReglage(doc, ditDe(saisie, cleSert))] });

  section.append(plafond, capacites, prendre, sert);
  return section;
}

// Le bloc : son titre, puis les réglages de chaque station déclarée, dans l'ordre de la déclaration — ou la ligne qui dit
// qu'il n'y en a aucune, ou qu'elles ne sont pas encore lues. Sans `reglages`, la coquille et son titre seuls.
/**
 * @param {Fabrique} doc
 * @param {{ stations: StationsLues | undefined, projet: string, ici?: boolean, ordinaires?: Ordinaires, ordinairesDit?: Dit, lignes?: readonly { station: string, ordinaires?: boolean }[], saisies: Map<string, Saisie>, gestes: Gestes }} [reglages]
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
    const vide = ligneVide(doc, stations === undefined ? PAS_LUE : AUCUNE);
    bloc.append(vide);
    return bloc;
  }
  const contexte = {
    projet: reglages.projet,
    ici: reglages.ici === true,
    seule: stations.declarees.length === 1,
    ...(reglages.ordinaires === undefined ? {} : { ordinaires: reglages.ordinaires }),
    ...(reglages.ordinairesDit === undefined ? {} : { ordinairesDit: reglages.ordinairesDit }),
    ...(reglages.lignes === undefined ? {} : { lignes: reglages.lignes }),
    gestes: reglages.gestes,
  };
  bloc.append(...stations.declarees.map((station) => stationReglee(doc, station, saisieDe(saisies, station, stations), contexte)));
  return bloc;
}
