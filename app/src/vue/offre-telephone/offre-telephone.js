// @ts-check
// L'offre du téléphone, juste après le premier ticket servi (ticket 3303) : sur la page du premier projet du chef — celui
// que sa station a ajouté le plus tôt —, une fois son premier ticket servi, une ligne dit « Brigade can call you on your
// phone when it needs you ». Acceptée, elle montre sur place le lien de l'app Android — l'`apkUrl` de la dernière version
// publiée, lu par le process principal (mise-a-jour/android.ts), ou la page des versions s'il ne se lit pas — et « Sign
// in with the same GitHub account » : depuis le ticket 2500, le téléphone n'a pas de code d'appairage, il se connecte au même
// compte GitHub. Déclinée, ou son lien suivi, elle ne revient plus : le choix est gardé dans le stockage de la vue
// (`localStorage`). Aucune détection d'un téléphone déjà connecté : rien ne le publie (décision du ticket). Ce module
// ne touche pas `document`.

import { boutonAction } from "../briques.js";
import { ligneErreur } from "../composants/ligne-erreur/ligne-erreur.js";
import { REESSAYER } from "../lexique.js";

/** @typedef {import("../briques.js").Fabrique} Fabrique */
/** @typedef {{ nom: string, delai?: import("../../projets/demande.ts").Delai }} ProjetLu */
/** @typedef {{ getItem(cle: string): string | null, setItem(cle: string, valeur: string): void }} Stockage */
/** @typedef {{ etape: "offerte" } | { etape: "lecture" } | { etape: "lien", lien: string } | { etape: "illisible" }} Etat */

export const CLE_DE_L_OFFRE = "brigade.offre-telephone";
export const OFFRE = "Brigade can call you on your phone when it needs you";
export const ACCEPTER = "set up my phone";
export const DECLINER = "no thanks";
export const LECTURE = "Finding the Android app…";
export const TELECHARGER = "download the Android app";
export const MEME_COMPTE = "Sign in with the same GitHub account";
export const ILLISIBLE = "The link to the Android app cannot be read right now.";

// Le premier projet du chef — parmi les projets lus, celui dont l'ajout est le plus ancien —, si son premier ticket est
// servi ; sinon rien. Un projet sans délai publié (ticket 1401) ne compte pas : son ajout ne se sait pas.
/** @param {readonly ProjetLu[]} projets @returns {string | undefined} */
export function premierProjetServi(projets) {
  const dates = projets.flatMap(({ nom, delai }) => (delai === undefined ? [] : [{ nom, delai, ajout: Date.parse(delai.ajouteLe) }])).filter(({ ajout }) => !Number.isNaN(ajout));
  const premier = dates.reduce((/** @type {(typeof dates)[number] | undefined} */ tot, lu) => (tot === undefined || lu.ajout < tot.ajout ? lu : tot), undefined);
  return premier !== undefined && premier.delai.serviLe !== null ? premier.nom : undefined;
}

// L'offre tenue pour la vue. `lire` : le lien de l'app Android, par le pont. `ouvrir` : l'ouvre dans le navigateur.
// Un stockage absent ou illisible ne la montre pas : sans lui, un refus ne se garderait pas, et elle reviendrait à
// chaque lancement. Une trace qui ne s'écrit pas la range quand même jusqu'à la fermeture de l'app.
/** @param {{ stockage: Stockage | undefined, lire: () => Promise<unknown>, ouvrir: (lien: string) => void, rendre: () => void, maintenant?: () => string }} options */
export function tenirLOffre({ stockage, lire, ouvrir, rendre, maintenant = () => new Date().toISOString() }) {
  /** @type {Etat} */
  let etat = { etape: "offerte" };
  let rangeeIci = false;
  /** @param {"declinee" | "suivie"} comment */
  const ranger = (comment) => {
    rangeeIci = true;
    try {
      stockage?.setItem(CLE_DE_L_OFFRE, JSON.stringify({ [comment]: maintenant() }));
    } catch {
      // Voir plus haut : rangée pour ce lancement.
    }
    rendre();
  };
  const accepter = async () => {
    etat = { etape: "lecture" };
    rendre();
    let lu;
    try {
      lu = await lire();
    } catch {
      lu = undefined;
    }
    etat = typeof lu === "string" && /^https:\/\/\S+$/.test(lu) ? { etape: "lien", lien: lu } : { etape: "illisible" };
    rendre();
  };
  return {
    get etat() {
      return etat;
    },
    rangee() {
      if (rangeeIci || stockage === undefined) return true;
      try {
        return stockage.getItem(CLE_DE_L_OFFRE) !== null;
      } catch {
        return true;
      }
    },
    accepter: () => void accepter(),
    decliner: () => ranger("declinee"),
    /** @param {string} lien */
    suivre(lien) {
      ouvrir(lien);
      ranger("suivie");
    },
  };
}

// La ligne de l'offre, à l'état donné.
/** @param {Fabrique} doc @param {Etat} etat @param {{ accepter: () => void, decliner: () => void, suivre: (lien: string) => void }} geste */
export function poserLOffre(doc, etat, geste) {
  const ligne = doc.createElement("div");
  ligne.className = "offre-telephone gestes";
  ligne.dataset.etape = etat.etape;
  const dit = doc.createElement("span");
  dit.className = "phrase";
  dit.textContent = OFFRE;
  ligne.append(dit);
  if (etat.etape === "offerte") ligne.append(boutonAction(doc, ACCEPTER, geste.accepter, { recommande: true }));
  if (etat.etape === "lecture") {
    const lecture = doc.createElement("span");
    lecture.className = "lecture";
    lecture.textContent = LECTURE;
    ligne.append(lecture);
  }
  if (etat.etape === "lien") {
    const lien = doc.createElement("a");
    lien.className = "lien-apk";
    lien.href = etat.lien;
    lien.textContent = TELECHARGER;
    lien.title = etat.lien;
    lien.addEventListener("click", (/** @type {{ preventDefault?: () => void }} */ evenement) => {
      evenement?.preventDefault?.();
      geste.suivre(etat.lien);
    });
    const compte = doc.createElement("span");
    compte.className = "meme-compte";
    compte.textContent = MEME_COMPTE;
    ligne.append(lien, compte);
  }
  if (etat.etape === "illisible") ligne.append(ligneErreur(doc, ILLISIBLE, "", { classe: "erreur", balise: "span" }), boutonAction(doc, REESSAYER, geste.accepter));
  ligne.append(boutonAction(doc, DECLINER, geste.decliner, { sorte: "discret" }));
  return ligne;
}
