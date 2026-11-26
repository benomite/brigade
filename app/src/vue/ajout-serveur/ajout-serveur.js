// @ts-check
// « Add a server » (ticket 4347) : ajouter une station de serveur sans quitter l'app. Le panneau dit en une phrase où lancer
// la commande d'installation d'une ligne — celle de docs/installation-station.md, telle quelle, que le script et le paquet
// publient —, la pose dans un cadre avec son bouton « copy », dit qu'un Mac prend la même, puis où en est la station :
// attendue à son premier signe (`Waiting for its first check-in`), puis appairée — une station du compte que l'app ne
// connaissait pas à l'ouverture du panneau. L'app n'apprend rien d'autre au chef : ni une autre commande, ni une page à lire.
// L'appairage est celui que l'app lit déjà (les stations du chef, `stationsDuChef`, ticket 2713) : « check again » le relit.
// Appairée, « Choose who cooks it » donne le projet par le geste que l'app a déjà (stations-tab/, l'ajout d'une station).
// Il est posé sur l'onglet Stations d'un projet et sur la question « Who cooks <owner/repo>? » d'un projet neuf
// (parcours-premier-projet/). Ce module ne touche ni `document` ni le pont : la vue lui donne une fabrique, l'état lu et
// les gestes.

import { bouton } from "../composants/bouton/bouton.js";
import { ligneErreur } from "../composants/ligne-erreur/ligne-erreur.js";
import { LECTURE_DE } from "../lexique.js";
import { CHOISIR } from "../stations-tab/etat.js";
import { COPIE, COPIE_ECHOUEE, COPIER } from "../todo-carte/geste.js";

/** @typedef {import("../briques.js").Fabrique} Fabrique */
/** @typedef {import("../../premier-lancement.ts").StationsDuChef} StationsDuChef */
// Où en est le panneau : il lit les stations du compte (`en-cours`) ; il attend la nouvelle (`attente`) ; la lecture a
// échoué, sa raison et son détail (`illisible`) ; la station est là (`appairee`), son gist et son nom.
/**
 * @typedef {{ lecture: "en-cours" }
 *   | { lecture: "attente" }
 *   | { lecture: "illisible", raison: string, detail: string }
 *   | { lecture: "appairee", id: string, nom: string }} EtatDuServeur
 */
// `relire` : « check again » ; `copier` : met la commande dans le presse-papiers ; `fermer` : referme le panneau ;
// `confier` : appairée, ouvre le choix de qui cuit le projet — absent, le panneau n'offre pas de le confier.
/** @typedef {{ relire(): void, copier(texte: string): Promise<unknown> | undefined, fermer(): void, confier?: () => void }} GestesDuServeur */

export const AJOUTER_UN_SERVEUR = "Add a server";
// La commande d'installation, mot pour mot celle de docs/installation-station.md (« 1. The command »).
export const COMMANDE_DU_SERVEUR = "curl -fsSL https://github.com/benomite/brigade/releases/download/station/installer-station.sh | sh";
export const OU_LA_LANCER =
  "On a Debian server that stays on, paste this one line in a terminal: it installs a station, then asks you once to log in to GitHub and to Claude Max. Its station then shows up here.";
export const SUR_UN_MAC = "On a Mac: the same command, in Terminal. That Mac must stay on and reachable for its station to cook.";
export const LECTURE = LECTURE_DE("your stations on GitHub");
export const EN_ATTENTE = "Waiting for its first check-in.";
export const RELIRE = "check again";
export const FERMER = "Close";
export const SANS_REPONSE = "Your stations could not be read: the app gave no answer.";
/** @param {string} nom */
export const APPAIREE = (nom) => `${nom} checked in: it is paired with your account.`;

// Ce qu'une lecture des stations du chef fait du panneau. `connues` : les gists des stations du compte à l'ouverture du
// panneau — absentes tant qu'aucune lecture n'a abouti : la première qui aboutit les donne, et la station attendue est
// une station qui cuit (pas un téléphone) hors de celles-là. Une lecture qui échoue dit sa raison, et ne change pas
// `connues`. Rien de lu — un pont sans la lecture — se dit comme un échec, jamais comme une attente.
/**
 * @param {ReadonlySet<string> | undefined} connues
 * @param {StationsDuChef | undefined} lu
 * @returns {{ etat: EtatDuServeur, connues: ReadonlySet<string> | undefined }}
 */
export function apresLecture(connues, lu) {
  if (lu === undefined) return { etat: { lecture: "illisible", raison: SANS_REPONSE, detail: "" }, connues };
  if (lu.state === "sign-in-required") return { etat: { lecture: "illisible", raison: lu.reason, detail: "" }, connues };
  if (lu.state === "unavailable") return { etat: { lecture: "illisible", raison: lu.reason, detail: lu.detail ?? "" }, connues };
  if (connues === undefined) return { etat: { lecture: "attente" }, connues: new Set(lu.stations.map(({ id }) => id)) };
  const neuve = lu.stations.find(({ id, cooks }) => cooks && !connues.has(id));
  return { etat: neuve === undefined ? { lecture: "attente" } : { lecture: "appairee", id: neuve.id, nom: neuve.name }, connues };
}

/** @param {Fabrique} doc @param {string} balise @param {string} [texte] */
function cree(doc, balise, texte) {
  const pose = doc.createElement(balise);
  if (texte !== undefined) pose.textContent = texte;
  return pose;
}

// La commande dans son cadre, et son bouton : « copied » quand le presse-papiers l'a prise, « copy failed » sinon — la
// raison au survol.
/** @param {Fabrique} doc @param {GestesDuServeur["copier"]} copier */
function laCommande(doc, copier) {
  const cadre = cree(doc, "div");
  cadre.className = "commande-du-serveur";
  const code = cree(doc, "pre", COMMANDE_DU_SERVEUR);
  code.className = "mono";
  const copie = bouton(doc, COPIER, undefined);
  copie.addEventListener("click", () => {
    const dit = (/** @type {string} */ texte, /** @type {string} */ detail) => {
      copie.textContent = texte;
      copie.title = detail;
    };
    let promesse;
    try {
      promesse = copier(COMMANDE_DU_SERVEUR);
    } catch (erreur) {
      promesse = Promise.reject(erreur);
    }
    Promise.resolve(promesse ?? Promise.reject(new Error("the clipboard is not available here"))).then(
      () => dit(COPIE, "the command is on your clipboard"),
      (erreur) => dit(COPIE_ECHOUEE, erreur instanceof Error ? erreur.message : String(erreur)),
    );
  });
  cadre.append(code, copie);
  return cadre;
}

// Où en est la station : la lecture, l'attente, l'échec — avec « check again » —, ou appairée — avec « Choose who cooks it ».
/** @param {Fabrique} doc @param {EtatDuServeur} etat @param {GestesDuServeur} gestes */
function ligneDeLEtat(doc, etat, gestes) {
  const ligne = cree(doc, "div");
  ligne.className = "etat-du-serveur";
  ligne.dataset.lecture = etat.lecture;
  ligne.ariaLive = "polite";
  if (etat.lecture === "en-cours") ligne.append(cree(doc, "p", LECTURE));
  else if (etat.lecture === "attente") ligne.append(cree(doc, "p", EN_ATTENTE), bouton(doc, RELIRE, gestes.relire));
  else if (etat.lecture === "illisible") ligne.append(ligneErreur(doc, etat.raison, etat.detail), bouton(doc, RELIRE, gestes.relire));
  else {
    const appairee = cree(doc, "p");
    appairee.append(cree(doc, "strong", etat.nom), APPAIREE(etat.nom).slice(etat.nom.length));
    ligne.append(appairee);
    if (gestes.confier !== undefined) ligne.append(bouton(doc, CHOISIR, gestes.confier, { sorte: "recommande" }));
  }
  return ligne;
}

// Le panneau : son titre, la phrase de où la lancer, la commande, ce qu'en dit un Mac, où en est la station, et « Close ».
/** @param {Fabrique} doc @param {EtatDuServeur} etat @param {GestesDuServeur} gestes */
export function poserAjoutDeServeur(doc, etat, gestes) {
  const racine = cree(doc, "section");
  racine.className = "ajout-serveur";
  racine.ariaLabel = AJOUTER_UN_SERVEUR;
  const titre = cree(doc, "h4", AJOUTER_UN_SERVEUR);
  const ou = cree(doc, "p", OU_LA_LANCER);
  ou.className = "explication";
  const mac = cree(doc, "p", SUR_UN_MAC);
  mac.className = "sur-un-mac";
  const pied = cree(doc, "p");
  pied.className = "gestes";
  pied.append(bouton(doc, FERMER, gestes.fermer, { sorte: "discret" }));
  racine.append(titre, ou, laCommande(doc, gestes.copier), mac, ligneDeLEtat(doc, etat, gestes), pied);
  return racine;
}

// Ce qu'un écran pose à côté de sa liste de stations : le panneau, ouvert (`etat`) ; sinon, le bouton « Add a server ». Un
// clic pose le panneau tout de suite à sa place — sa lecture en cours —, puis le dit à la vue (`ouvrir`), qui le tient
// ouvert d'un affichage à l'autre.
/** @param {Fabrique} doc @param {EtatDuServeur | undefined} etat @param {GestesDuServeur & { ouvrir(): void }} gestes */
export function entreeDuServeur(doc, etat, gestes) {
  if (etat !== undefined) return poserAjoutDeServeur(doc, etat, gestes);
  const entree = bouton(doc, AJOUTER_UN_SERVEUR, () => {
    entree.after(poserAjoutDeServeur(doc, { lecture: "en-cours" }, gestes));
    entree.remove();
    gestes.ouvrir();
  });
  entree.className = "ajouter-un-serveur";
  return entree;
}
