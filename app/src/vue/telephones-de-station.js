// @ts-check
// « Pair a phone », sur la ligne d'une station de l'accueil (ticket 1598, épique 1595) : l'écran qui appaire un téléphone à
// cette station, sans terminal. Il montre un code neuf, son QR — dessiné ici (qr.js), rien ne part le dessiner
// ailleurs — et le temps qu'il vaut encore, qui décompte ; un code expiré ou qui a servi se dit, et « new code » en
// montre un neuf, d'un clic. Dessous, les téléphones déjà appairés à la station, chacun avec « revoke », confirmé :
// révoqué, il quitte la liste. Une station injoignable, ou qui refuse, se dit en une ligne à la place du code — jamais
// un code vide —, ce qu'il faut vérifier au survol.
//
// Tout passe par le process principal (telephones-de-station.ts), qui lance la commande de la station : l'écran
// n'en montre aucune, ni `ssh`, ni `sudo`, pas même au survol.
//
// `tenirLesTelephones` garde l'état de l'écran et ses gestes ; `poserLesTelephones` le dessine. Ni l'un ni l'autre ne touche
// `document` ni l'horloge : la vue leur donne une fabrique (briques.js), l'heure, et bat la seconde (`battre`).

import { boutonAction, confirmationDeGeste, lectureIndisponible, survol } from "./briques.js";
import { imageDuQr } from "./qr.js";

/** @typedef {import("./briques.js").Fabrique} Fabrique */
/** @typedef {import("../telephones-de-station.ts").CodeTire} CodeTire */
/** @typedef {import("../telephones-de-station.ts").EtatDuCode} EtatDuCode */
/** @typedef {import("../telephones-de-station.ts").TelephoneAppaire} TelephoneAppaire */
/** @typedef {import("../telephones-de-station.ts").Refus} Refus */
/**
 * Ce que l'écran demande au process principal, par la station (son gist).
 * @typedef {{
 *   tirerUnCodeDeTelephone(station: string): Promise<import("../telephones-de-station.ts").RenduDuCode>,
 *   etatDuCodeDeTelephone(station: string, code: string): Promise<import("../telephones-de-station.ts").RenduDeLEtat>,
 *   telephonesDeLaStation(station: string): Promise<import("../telephones-de-station.ts").RenduDeLaListe>,
 *   revoquerUnTelephone(station: string, nom: string): Promise<import("../telephones-de-station.ts").RenduDeLaRevocation>,
 * }} PontDesTelephones
 */
/**
 * L'état de l'écran. `code` : le dernier tiré, son état, et le téléphone qu'il a appairé ; `tirage` : un code est en
 * route ; `refusDuCode` : pourquoi aucun code n'est là. `liste` : les téléphones appairés, ou pourquoi ils ne se
 * lisent pas — absente, la lecture est en route. `aRevoquer` : la confirmation ouverte ; `revocation` : la révocation
 * en route ; `revoque` : le dernier révoqué ; `refusDeRevocation` : pourquoi le dernier ne l'a pas été.
 * @typedef {{
 *   station: { id: string, nom: string },
 *   code?: { tire: CodeTire, etat: EtatDuCode, telephone: string | null },
 *   tirage: boolean,
 *   refusDuCode?: Refus,
 *   liste?: { telephones: TelephoneAppaire[] } | Refus,
 *   aRevoquer?: string,
 *   revocation?: string,
 *   revoque?: string,
 *   refusDeRevocation?: Refus,
 * }} EtatDeLAppairage
 */
/** @typedef {{ nouveauCode(): void, revoquer(nom: string): void, confirmer(oui: boolean): void }} GestesDeLAppairage */

// Les mots de l'écran.
export const BOUTON = "pair a phone";
export const TITRE = (/** @type {string} */ station) => `Pair a phone with ${station}`;
export const ATTENDU = "Scan this QR with the Brigade app on your phone, or type its code there.";
export const AIDE =
  "A code is good for fifteen minutes, for one phone, once. On the phone, open the Brigade app: “scan the QR” fills everything in; to type it instead, give the phone this station's address too. Once paired, the phone reads your projects from any network the station is reachable on.";
export const TIRAGE = "issuing a code…";
export const NOUVEAU = "new code";
export const REESSAYER = "try again";
export const EXPIRE = "This code has expired: nobody can pair with it any more.";
export const UTILISE = (/** @type {string | null} */ telephone) => (telephone === null ? "This code was used: it pairs no other phone." : `This code was used: ${telephone} is now paired.`);
export const SANS_ADRESSE = "This station gives no address a phone can reach: the QR carries only the code, and the phone asks for the address.";
export const APPAIRES = (/** @type {string} */ station) => `Phones paired with ${station}`;
export const LECTURE = "reading the paired phones…";
export const AUCUN = "no phone paired yet";
export const REVOQUER = "revoke";
export const REVOQUE = (/** @type {string} */ nom) => `${nom} is no longer paired: it opens nothing, from any network.`;
export const CONFIRMATION = (/** @type {string} */ nom, /** @type {string} */ station) => ({
  titre: `Revoke ${nom}?`,
  prix: `${nom} can no longer reach ${station}, from any network; pairing it again takes a new code`,
  oui: "revoke",
  non: "cancel",
});

// Un module du QR, à l'écran : quatre pixels, autant pour chacun — un QR d'appairage en fait 180 de côté.
const PIXELS_PAR_MODULE = 4;

// Toutes les combien de secondes l'écran demande à la station où en est un code encore valable : c'est ainsi qu'il voit
// qu'un téléphone vient de s'en servir.
export const SONDAGE_S = 5;

// Le temps qui reste, en minutes et secondes : `14:32`, `0:07`.
/** @param {number} ms */
export function resteDit(ms) {
  const secondes = Math.max(0, Math.ceil(ms / 1000));
  return `${Math.floor(secondes / 60)}:${String(secondes % 60).padStart(2, "0")}`;
}

/** @param {unknown} erreur @returns {Refus} */
const rate = (erreur) => ({ refus: "The app could not ask this station.", detail: erreur instanceof Error ? erreur.message : String(erreur) });

// L'état de l'écran et ses gestes. `rendre` : l'état a changé, l'écran se redessine. Une réponse qui arrive pour un
// écran déjà fermé, ou rouvert sur une autre station, ne change rien.
/** @param {{ pont: PontDesTelephones, maintenant: () => number, rendre: () => void }} options */
export function tenirLesTelephones({ pont, maintenant, rendre }) {
  /** @type {EtatDeLAppairage | undefined} */
  let etat;
  let tour = 0;
  let battements = 0;
  let sondage = false;

  /** @param {number} sien */
  const actuel = (sien) => etat !== undefined && sien === tour;

  /** @param {number} sien */
  async function tirer(sien) {
    if (etat === undefined) return;
    etat.tirage = true;
    delete etat.refusDuCode;
    rendre();
    const id = etat.station.id;
    const rendu = await pont.tirerUnCodeDeTelephone(id).catch(rate);
    if (!actuel(sien) || etat === undefined) return;
    etat.tirage = false;
    if ("refus" in rendu) {
      delete etat.code;
      etat.refusDuCode = rendu;
    } else etat.code = { tire: rendu.tire, etat: Date.parse(rendu.tire.expireLe) <= maintenant() ? "expire" : "valable", telephone: null };
    battements = 0;
    rendre();
  }

  /** @param {number} sien */
  async function lireLaListe(sien) {
    if (etat === undefined) return;
    const rendu = await pont.telephonesDeLaStation(etat.station.id).catch(rate);
    if (!actuel(sien) || etat === undefined) return;
    etat.liste = rendu;
    rendre();
  }

  /** @param {number} sien */
  async function sonder(sien) {
    if (etat?.code?.etat !== "valable" || sondage) return;
    const { code } = etat.code.tire;
    sondage = true;
    const rendu = await pont.etatDuCodeDeTelephone(etat.station.id, code).catch(rate);
    sondage = false;
    if (!actuel(sien) || etat?.code === undefined || etat.code.tire.code !== code) return;
    // Une station muette un instant ne change rien : le code reste ce qu'il était, la seconde suivante le redit.
    if ("refus" in rendu || rendu.etat === "valable") return;
    etat.code = { ...etat.code, etat: rendu.etat, telephone: rendu.telephone };
    rendre();
    if (rendu.etat === "utilise") void lireLaListe(sien);
  }

  return {
    /** @returns {EtatDeLAppairage | undefined} */
    get etat() {
      return etat;
    },
    // L'écran s'ouvre sur une station : un code neuf est tiré, et ses téléphones sont lus.
    /** @param {{ id: string, nom: string }} station */
    ouvrir(station) {
      const sien = ++tour;
      etat = { station, tirage: false };
      battements = 0;
      void tirer(sien);
      void lireLaListe(sien);
    },
    fermer() {
      tour++;
      etat = undefined;
    },
    // Chaque seconde : le temps qui reste se redit ; passé l'échéance, le code est expiré ; et, toutes les
    // `SONDAGE_S` secondes, la station dit s'il a servi.
    battre() {
      if (etat?.code?.etat !== "valable") return;
      if (Date.parse(etat.code.tire.expireLe) <= maintenant()) {
        etat.code = { ...etat.code, etat: "expire" };
        rendre();
        return;
      }
      rendre();
      if (++battements % SONDAGE_S === 0) void sonder(tour);
    },
    /** @type {GestesDeLAppairage} */
    gestes: {
      // Un code neuf ; et la liste, relue avec lui si elle ne s'était pas lue.
      nouveauCode() {
        if (etat === undefined || etat.tirage) return;
        void tirer(tour);
        if (etat.liste !== undefined && "refus" in etat.liste) {
          delete etat.liste;
          void lireLaListe(tour);
        }
      },
      revoquer(nom) {
        if (etat === undefined) return;
        etat.aRevoquer = nom;
        delete etat.refusDeRevocation;
        delete etat.revoque;
        rendre();
      },
      confirmer(oui) {
        if (etat?.aRevoquer === undefined) return;
        const nom = etat.aRevoquer;
        delete etat.aRevoquer;
        if (!oui) return rendre();
        etat.revocation = nom;
        rendre();
        const sien = tour;
        void pont
          .revoquerUnTelephone(etat.station.id, nom)
          .catch(rate)
          .then((rendu) => {
            if (!actuel(sien) || etat === undefined) return;
            delete etat.revocation;
            if ("refus" in rendu) etat.refusDeRevocation = rendu;
            else {
              etat.revoque = nom;
              // Révoqué, il quitte la liste tout de suite ; la station la redit ensuite.
              if (etat.liste !== undefined && "telephones" in etat.liste) etat.liste = { telephones: etat.liste.telephones.filter((telephone) => telephone.nom !== nom) };
            }
            rendre();
            void lireLaListe(sien);
          });
      },
    },
  };
}

// Chaque classe est posée en clair, `className = "…"` : la peau ne vise que des classes que la vue pose, et son test
// les lit ainsi (peau.test.ts).
/** @param {Fabrique} doc @param {string} balise @param {string} [texte] */
function cree(doc, balise, texte) {
  const element = doc.createElement(balise);
  if (texte !== undefined) element.textContent = texte;
  return element;
}

// Le code, son QR et ce qu'il vaut encore — ou ce qui en tient lieu : un code en route, expiré, qui a servi, ou
// pourquoi il n'y en a pas.
/** @param {Fabrique} doc @param {EtatDeLAppairage} etat @param {number} maintenant @param {GestesDeLAppairage} gestes */
function poserLeCode(doc, etat, maintenant, gestes) {
  const racine = cree(doc, "div");
  racine.className = "code-de-telephone";
  racine.ariaLive = "polite";
  const nouveau = (/** @type {string} */ libelle) => boutonAction(doc, libelle, () => gestes.nouveauCode(), { recommande: true });
  if (etat.tirage) {
    racine.append(cree(doc, "p", TIRAGE));
    return racine;
  }
  if (etat.refusDuCode !== undefined || etat.code === undefined) {
    const refus = etat.refusDuCode ?? { refus: "No code yet.", detail: "" };
    racine.append(lectureIndisponible(doc, refus.refus, refus.detail), nouveau(REESSAYER));
    return racine;
  }
  const { tire, etat: ou, telephone } = etat.code;
  if (ou !== "valable") {
    const dit = cree(doc, "p", ou === "expire" ? EXPIRE : UTILISE(telephone));
    dit.className = "fin-du-code";
    racine.append(dit, nouveau(NOUVEAU));
    return racine;
  }
  const qr = cree(doc, "img");
  qr.className = "qr";
  const { src, cote } = imageDuQr(tire.qr);
  qr.src = src;
  qr.width = qr.height = cote * PIXELS_PAR_MODULE;
  qr.alt = `QR of the pairing code ${tire.code}`;
  const code = cree(doc, "strong", tire.code);
  code.className = "mono code";
  const reste = cree(doc, "p", `valid for ${resteDit(Date.parse(tire.expireLe) - maintenant)}`);
  reste.className = "reste";
  const lu = cree(doc, "div");
  lu.className = "lu";
  lu.append(code, reste);
  if (tire.adresse === null) lu.append(lectureIndisponible(doc, "no station address in the QR", SANS_ADRESSE));
  else {
    const adresse = cree(doc, "p", "station address ");
    adresse.className = "adresse";
    const ecrite = cree(doc, "span", tire.adresse.replace(/^https:\/\//, ""));
    ecrite.className = "mono";
    adresse.append(ecrite);
    lu.append(adresse);
  }
  racine.append(qr, lu);
  return racine;
}

// Les téléphones appairés : une ligne chacun, son nom, sa machine et « revoke » — confirmé, avec son prix.
/** @param {Fabrique} doc @param {EtatDeLAppairage} etat @param {GestesDeLAppairage} gestes */
function poserLaListe(doc, etat, gestes) {
  const racine = cree(doc, "div");
  racine.className = "telephones-appaires";
  racine.ariaLive = "polite";
  const titre = cree(doc, "h3", APPAIRES(etat.station.nom));
  racine.append(titre);
  if (etat.revoque !== undefined) racine.append(cree(doc, "p", REVOQUE(etat.revoque)));
  if (etat.refusDeRevocation !== undefined) racine.append(lectureIndisponible(doc, etat.refusDeRevocation.refus, etat.refusDeRevocation.detail));
  const { liste } = etat;
  if (liste === undefined) {
    racine.append(cree(doc, "p", LECTURE));
    return racine;
  }
  if ("refus" in liste) {
    racine.append(lectureIndisponible(doc, "paired phones unavailable", `${liste.refus} ${liste.detail}`));
    return racine;
  }
  if (liste.telephones.length === 0) {
    racine.append(cree(doc, "p", AUCUN));
    return racine;
  }
  const lignes = cree(doc, "ul");
  for (const { nom, machine, appaireLe } of liste.telephones) {
    const ligne = cree(doc, "li");
    ligne.className = "telephone-appaire";
    const appele = cree(doc, "strong", nom);
    appele.className = "mono";
    ligne.append(appele);
    if (machine !== "") ligne.append(cree(doc, "span", machine));
    if (appaireLe !== "") ligne.append(survol(doc, `paired on ${appaireLe.slice(0, 10)}`));
    if (etat.revocation === nom) ligne.append(cree(doc, "span", "revoking…"));
    else if (etat.aRevoquer === nom) ligne.append(confirmationDeGeste(doc, CONFIRMATION(nom, etat.station.nom), { oui: () => gestes.confirmer(true), non: () => gestes.confirmer(false) }));
    else ligne.append(boutonAction(doc, REVOQUER, () => gestes.revoquer(nom)));
    lignes.append(ligne);
  }
  racine.append(lignes);
  return racine;
}

// L'écran : son titre et son aide, ce qu'on attend du chef en une phrase, le code, puis les téléphones appairés.
/** @param {Fabrique} doc @param {EtatDeLAppairage} etat @param {number} maintenant @param {GestesDeLAppairage} gestes */
export function poserLesTelephones(doc, etat, maintenant, gestes) {
  const racine = cree(doc, "div");
  racine.className = "appairage-de-telephone";
  const titre = cree(doc, "h2", TITRE(etat.station.nom));
  titre.append(survol(doc, AIDE));
  const attendu = cree(doc, "p", ATTENDU);
  attendu.className = "attendu";
  // Ce qu'on attend du chef tant qu'un code vaut ; sinon, la ligne du code le dit, avec son bouton.
  const vaut = etat.tirage || etat.code?.etat === "valable";
  racine.append(titre, ...(vaut ? [attendu] : []), poserLeCode(doc, etat, maintenant, gestes), poserLaListe(doc, etat, gestes));
  return racine;
}
