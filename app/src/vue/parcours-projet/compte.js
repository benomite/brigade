// @ts-check
// Le compte GitHub de cet ordinateur (ticket 2475), tel que son `gh` le tient (`compteGitHub`, connexion-github.ts) —
// jamais tapé. Connecté, le premier lancement le dit, « Connected to GitHub as … », et offre d'en changer ; sans compte,
// il n'y a qu'un bouton, « connect to GitHub » ; illisible, il dit pourquoi en une phrase, son détail au survol, avec la
// page qui le lève et « read again ». L'écran « Add a project » (ajout.js, ticket 3181) n'en pose que la connexion qui
// manque, ou pourquoi il ne se lit pas : connecté, il ne dit pas le compte, qui se change dans les réglages.
// Changer de compte, c'est se connecter d'un autre dans le navigateur, par le même geste que la connexion ; au bout, le
// compte est relu (`tenirLeCompte`, `apresLaConnexion`) : l'écran dit celui que l'ordinateur tient désormais.
// Ce module ne touche pas `document` : il reçoit de quoi créer un élément (briques.js), et rend des éléments.

import { boutonAction } from "../briques.js";
import { phrase } from "../onboarding/parcours.js";
import { boutonDeLaPage, connexionDite, gestes } from "./connexion.js";
import { ligneErreur } from "../composants/ligne-erreur/ligne-erreur.js";
import { LECTURE_DE, CET_ORDINATEUR } from "../lexique.js";

/** @typedef {import("../briques.js").Fabrique} Fabrique */
/** @typedef {import("../../connexion-github.ts").CompteGitHub} CompteGitHub */
/**
 * Ce que le compte dit. `compte` : absent, sa lecture est en route ; `connexion` : la connexion à GitHub lancée — la même
 * partout dans l'app (connexion.js).
 * @typedef {{ compte?: CompteGitHub, connexion?: import("./connexion.js").Connexion }} EtatDuCompte
 */
/**
 * Ses gestes. `changerDeCompte` : se connecter d'un autre compte — le compte est relu au bout.
 * @typedef {{
 *   seConnecter: () => void,
 *   changerDeCompte: () => void,
 *   relireLeCompte: () => void,
 *   ouvrirLaPage: (url: string) => void,
 * }} GestesDuCompte
 */

export const LECTURE_DU_COMPTE = LECTURE_DE(`the GitHub account of ${CET_ORDINATEUR}`);
export const SE_CONNECTER = "connect to GitHub";
export const CHANGER_DE_COMPTE = "switch GitHub account";
export const CHANGER_DE_COMPTE_SURVOL = "sign in with another GitHub account on the page that opens: brigade then reads it again";
export const RELIRE_LE_COMPTE = "read again";
export const SANS_REPONSE = "Your GitHub account could not be read: the app gave no answer.";
/** @param {string} login */
export const connecteEnTantQue = (login) => `Connected to GitHub as ${login}.`;

/** @param {Fabrique} doc @param {string} balise @param {string} [texte] */
function cree(doc, balise, texte) {
  const pose = doc.createElement(balise);
  if (texte !== undefined) pose.textContent = texte;
  return pose;
}

/** @param {Fabrique} doc @param {EtatDuCompte} etat @param {GestesDuCompte} geste @returns {any[]} */
export function poserLeCompte(doc, etat, geste) {
  const { compte, connexion } = etat;
  if (compte === undefined) {
    const dit = cree(doc, "p", LECTURE_DU_COMPTE);
    dit.className = "dit";
    dit.role = "status";
    return [dit];
  }
  if ("login" in compte) {
    const dit = cree(doc, "p");
    dit.className = "compte-connecte";
    const [avant = "", apres = ""] = connecteEnTantQue(compte.login).split(compte.login);
    const login = cree(doc, "strong", compte.login);
    login.className = "mono";
    dit.append(avant, login, apres);
    const [changer, ...suite] = connexionDite(doc, connexion, CHANGER_DE_COMPTE, { seConnecter: geste.changerDeCompte, ouvrirLaPage: geste.ouvrirLaPage }, { recommande: false });
    changer.children[0].children[0].title = CHANGER_DE_COMPTE_SURVOL;
    return [dit, changer, ...suite];
  }
  if ("nonConnecte" in compte) return connexionDite(doc, connexion, SE_CONNECTER, geste);
  const refus = ligneErreur(doc, phrase(doc, "span", compte.refus), compte.detail, { classe: "refus" });
  const lien = compte.lien;
  return [
    refus,
    gestes(doc, [
      ...(lien === undefined ? [] : [boutonAction(doc, boutonDeLaPage(lien), () => geste.ouvrirLaPage(lien), { recommande: true })]),
      boutonAction(doc, RELIRE_LE_COMPTE, geste.relireLeCompte, { recommande: lien === undefined }),
    ]),
  ];
}

// Le compte lu, tenu pour l'écran : une lecture à la fois — la dernière demandée l'emporte —, et `rendre` à chaque
// changement. `lireUneFois` à l'ouverture du premier lancement ou de l'ajout ; `apresLaConnexion` au bout d'une connexion, ou d'un changement
// de compte : l'ordinateur en tient peut-être un autre.
/**
 * @param {{ pont: { compteGitHub?(): Promise<CompteGitHub> }, rendre: () => void }} options
 * @returns {{ etat: { compte?: CompteGitHub }, lire: () => Promise<void>, lireUneFois: () => void, apresLaConnexion: () => void }}
 */
export function tenirLeCompte({ pont, rendre }) {
  /** @type {{ compte?: CompteGitHub }} */
  const etat = {};
  let lecture = 0;
  async function lire() {
    const demandee = ++lecture;
    delete etat.compte;
    rendre();
    /** @type {CompteGitHub} */
    let lu;
    try {
      lu = (await pont.compteGitHub?.()) ?? { refus: SANS_REPONSE };
    } catch (erreur) {
      lu = { refus: SANS_REPONSE, detail: erreur instanceof Error ? erreur.message : String(erreur) };
    }
    if (demandee !== lecture) return;
    etat.compte = lu;
    rendre();
  }
  return {
    etat,
    lire,
    lireUneFois: () => {
      if (lecture === 0) void lire();
    },
    apresLaConnexion: () => void lire(),
  };
}
