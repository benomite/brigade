// @ts-check
// « Add a server » (ticket 4347) : une station de serveur s'ajoute depuis l'app, sans ouvrir la page d'installation. Offert
// à côté de la liste des stations — l'onglet Stations d'un projet, son choix « Who cooks <projet>? », et la page « who cooks
// it » d'un projet neuf (parcours-premier-projet/). Le panneau dit en une phrase où lancer la ligne d'installation
// (`INSTALLER`, stations-du-compte.js, la même que la page d'installation), la donne à copier, dit qu'un Mac fait la même,
// puis attend le serveur : une station enregistrée sous le compte (`stationsDuCompte`) qui n'y était pas à l'ouverture du
// panneau est la sienne — elle s'y inscrit seule, sans code (runtime/src/enregistrement-station/README.md). « check again »
// relit le compte ; le serveur arrivé, le projet lui est confié par le geste de « Choose who cooks it ».
// Le bouton d'entrée ouvre et ferme le panneau de lui-même, et le dit à la vue (`basculer`), qui le repose ensuite.
// Ce module ne touche pas `document` : il reçoit de quoi créer un élément (briques.js), et rend des éléments.

import { boutonAction } from "../briques.js";
import { bouton } from "../composants/bouton/bouton.js";
import { ligneErreur } from "../composants/ligne-erreur/ligne-erreur.js";
import { COPIEE, COPIER, INSTALLER } from "../stations-du-compte.js";
import { poserLesChoix } from "../stations-tab/choix.js";

/** @typedef {import("../briques.js").Fabrique} Fabrique */
/** @typedef {import("../../stations-du-compte.ts").StationsDuCompte} StationsDuCompte */
/** @typedef {import("../../stations-du-compte.ts").StationEnregistree} StationEnregistree */
// Où en est le serveur attendu : pas encore là, la lecture du compte en échec (sa phrase, son détail au survol), ou arrivé.
/** @typedef {{ etat: "attente" } | { etat: "illisible", raison: string, detail: string } | { etat: "appairee", station: StationEnregistree }} ServeurVu */
// Ce que le panneau montre. `projet` : le projet à lui confier, quand l'écran sait le faire.
/** @typedef {{ ouvert: boolean, vu: ServeurVu, copiee?: boolean, projet?: string }} EtatDuServeur */
/**
 * @typedef {{
 *   basculer?: (ouvert: boolean) => void,
 *   copier?: (commande: string) => void,
 *   verifier?: () => void,
 *   confier?: (station: StationEnregistree) => void,
 * }} GestesDuServeur
 */

export const AJOUTER_UN_SERVEUR = "Add a server";
// La ligne d'installation de Linux et de macOS, celle que la page d'installation publie.
export const COMMANDE = INSTALLER[0]?.commande ?? "";
export const OU_LA_LANCER = "Paste this one line in a terminal on any always-on Linux server (Debian or Ubuntu): it installs the station, then signs the server in to GitHub — use this same account — and to your Claude Max subscription.";
export const SUR_UN_MAC = "On a Mac, it is the same command; the station cooks only while that Mac stays on and connected.";
export const ATTENTE = "Waiting for its first check-in: the server appears here within a minute after the command ends.";
export const VERIFIER = "check again";
export const ILLISIBLE = "your stations could not be read";
/** @param {string} nom */
export const APPAIREE = (nom) => `${nom} checked in: it is one of your stations now.`;
/** @param {string} projet */
export const QUI_LE_CUIT = (projet) => `Choose who cooks ${projet}:`;

// Le serveur attendu, d'après la lecture du compte : `connues`, les stations qu'il avait à l'ouverture du panneau — sans
// elles, aucune n'est dite neuve. Rien encore lu : il attend.
/** @param {ReadonlySet<string> | undefined} connues @param {StationsDuCompte | undefined} lues @returns {ServeurVu} */
export function serveurVu(connues, lues) {
  if (lues === undefined) return { etat: "attente" };
  if (lues.state !== "listed") return { etat: "illisible", raison: lues.reason, detail: "detail" in lues ? (lues.detail ?? "") : "" };
  const neuve = connues === undefined ? undefined : lues.stations.find(({ id }) => !connues.has(id));
  return neuve === undefined ? { etat: "attente" } : { etat: "appairee", station: neuve };
}

/** @param {Fabrique} doc @param {string} balise @param {string} [texte] */
function cree(doc, balise, texte) {
  const pose = doc.createElement(balise);
  if (texte !== undefined) pose.textContent = texte;
  return pose;
}

// Le panneau : la phrase, la ligne et son bouton qui la copie, le mot pour un Mac, puis où en est le serveur.
/** @param {Fabrique} doc @param {EtatDuServeur} etat @param {GestesDuServeur} gestes */
function panneau(doc, { vu, copiee, projet }, gestes) {
  const racine = cree(doc, "section");
  racine.className = "ajout-de-serveur";
  racine.ariaLabel = AJOUTER_UN_SERVEUR;
  const ou = cree(doc, "p", OU_LA_LANCER);
  ou.className = "ou";
  const ligne = cree(doc, "p");
  ligne.className = "commande";
  const code = cree(doc, "code", COMMANDE);
  code.className = "mono";
  const copier = boutonAction(doc, copiee === true ? COPIEE : COPIER, () => gestes.copier?.(COMMANDE));
  ligne.append(code, copier);
  const mac = cree(doc, "p", SUR_UN_MAC);
  mac.className = "mac";
  racine.append(ou, ligne, mac);
  if (vu.etat === "appairee") {
    const arrivee = cree(doc, "p", APPAIREE(vu.station.name));
    arrivee.className = "arrivee";
    racine.append(arrivee);
    const confier = gestes.confier;
    if (projet !== undefined && confier !== undefined) {
      const question = cree(doc, "p", QUI_LE_CUIT(projet));
      question.className = "qui-le-cuit";
      const un = { cle: vu.station.id, nom: vu.station.name, horsLigne: !vu.station.available, recommande: vu.station.available };
      racine.append(question, ...poserLesChoix(doc, { choix: [un] }, () => confier(vu.station)));
    }
    return racine;
  }
  if (vu.etat === "illisible") racine.append(ligneErreur(doc, `${ILLISIBLE}: ${vu.raison}`, vu.detail, { classe: "erreur" }));
  else {
    const attente = cree(doc, "p", ATTENTE);
    attente.className = "attente";
    attente.ariaLive = "polite";
    racine.append(attente);
  }
  const pied = cree(doc, "p");
  pied.className = "gestes";
  pied.append(boutonAction(doc, VERIFIER, () => gestes.verifier?.()));
  racine.append(pied);
  return racine;
}

// Le bouton « Add a server », puis son panneau quand il est ouvert. Un clic l'ouvre ou le ferme de lui-même — fermé, le
// panneau se pose au premier clic —, et le dit à la vue, qui le repose ensuite.
/** @param {Fabrique} doc @param {EtatDuServeur} etat @param {GestesDuServeur} gestes */
export function poserAjoutDeServeur(doc, etat, gestes) {
  /** @type {any} */
  let pose = etat.ouvert ? panneau(doc, etat, gestes) : undefined;
  const entree = bouton(doc, AJOUTER_UN_SERVEUR, () => {
    if (pose === undefined) {
      pose = panneau(doc, { ...etat, ouvert: true }, gestes);
      pose.hidden = true;
      entree.after(pose);
    }
    pose.hidden = !pose.hidden;
    entree.ariaExpanded = String(!pose.hidden);
    gestes.basculer?.(!pose.hidden);
  });
  entree.className = "ajouter-un-serveur";
  entree.ariaExpanded = String(etat.ouvert);
  return pose === undefined ? [entree] : [entree, pose];
}
