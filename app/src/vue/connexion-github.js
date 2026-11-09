// @ts-check
// La connexion du téléphone à GitHub (le ticket 2500, épique 2498) : le premier écran de l'app Android sur une
// installation neuve. Le téléphone lit les projets du chef sur GitHub, sous son compte, sans station : il n'y a ni code
// d'appairage à taper, ni QR à scanner, ni adresse de station. Ce qu'on attend du chef, en tête, en une phrase ; dessous,
// un bouton, « sign in with GitHub ». Le pont du téléphone (app/android/web/pont.js) mène le login avec GitHub : la vue
// montre le code à taper sur la page de GitHub qu'il a ouverte, comme le premier lancement du desktop le montre — la même
// brique, `connexionDite` (premier-lancement.js). Connecté, l'app passe à ses projets ; refusé sur GitHub, le code
// expiré ou GitHub injoignable, une ligne le dit sous le bouton, le détail au survol, et le chef recommence d'un clic.
// Ce module ne touche pas `document` et ne joint rien : il reçoit de quoi créer un élément (briques.js) et le pont, et
// rend la carte qu'il tient.

import { boutonAction, survol } from "./briques.js";
import { ligneErreur } from "./composants/ligne-erreur/ligne-erreur.js";
import { connexionDite } from "./premier-lancement.js";
import { PAS_ENCORE } from "./lexique.js";

/** @typedef {import("./briques.js").Fabrique} Fabrique */
/** @typedef {import("../connexion-github.ts").DebutDeConnexion} DebutDeConnexion */
/** @typedef {import("../connexion-github.ts").FinDeConnexion} FinDeConnexion */
/** @typedef {{ seConnecterAGitHub?(): Promise<DebutDeConnexion>, surConnexionGitHub?(recevoir: (fin: FinDeConnexion) => void): void, ouvrirLaPage?(url: string): Promise<boolean> }} PontDeConnexion */

export const TITRE = "Sign in to GitHub";
export const ATTENDU = "Sign in with your GitHub account to see your projects.";
export const AIDE =
  "Brigade reads your projects, their tickets and their stations on GitHub, under your own account: no station is involved. GitHub shows a one-time code here; type it on the GitHub page that opens. This phone then keeps its GitHub access in its vault — uninstalling the app forgets it.";
export const SE_CONNECTER = "sign in with GitHub";
export const PAS_DE_CONNEXION = "The GitHub sign-in could not be started on this phone.";

// L'écran, tenu : la carte est posée une fois, et seul ce qui suit l'attendu change — le bouton, puis le code à taper,
// ou la ligne qui dit pourquoi le chef n'est pas connecté. `apres` : connecté, ce que la vue fait ensuite — passer aux
// projets —, avec le compte GitHub, nul quand GitHub ne l'a pas dit.
/** @param {HTMLElement} lieu @param {Fabrique} doc @param {{ pont: PontDeConnexion, apres: (compte: string | null) => void }} options */
export function tenirConnexionGitHub(lieu, doc, { pont, apres }) {
  const carte = doc.createElement("section");
  carte.className = "connexion-github";
  const titre = doc.createElement("h2");
  titre.textContent = TITRE;
  titre.append(survol(doc, AIDE));
  const attendu = doc.createElement("p");
  attendu.className = "attendu";
  attendu.textContent = ATTENDU;
  const suite = doc.createElement("div");
  suite.className = "suite-de-connexion";
  suite.ariaLive = "polite";
  carte.append(titre, attendu, suite);
  lieu.replaceChildren(carte);

  /** @type {{ enRoute: true } | DebutDeConnexion | FinDeConnexion | undefined} */
  let connexion;
  const attend = () => connexion !== undefined && ("enRoute" in connexion || "code" in connexion);
  const poser = () =>
    suite.replaceChildren(
      ...connexionDite(doc, connexion, SE_CONNECTER, {
        seConnecter: () => void seConnecter(),
        ouvrirLaPage: (url) => void pont.ouvrirLaPage?.(url),
      }),
    );
  /** @param {FinDeConnexion} fin */
  const finir = (fin) => {
    if ("connecte" in fin) {
      connexion = undefined;
      return apres(fin.compte ?? null);
    }
    connexion = fin;
    poser();
  };

  async function seConnecter() {
    if (attend()) return;
    connexion = { enRoute: true };
    poser();
    /** @type {DebutDeConnexion} */
    let debut;
    try {
      debut = (await pont.seConnecterAGitHub?.()) ?? { refus: PAS_DE_CONNEXION };
    } catch (erreur) {
      debut = { refus: PAS_DE_CONNEXION, detail: erreur instanceof Error ? erreur.message : String(erreur) };
    }
    if (!("code" in debut)) return finir(debut);
    connexion = debut;
    poser();
  }
  // La fin n'est attendue que d'un login parti : une autre, venue d'ailleurs, est laissée.
  pont.surConnexionGitHub?.((fin) => {
    if (attend()) finir(fin);
  });
  poser();
  return { carte };
}

// Connecté : une ligne, en tête des projets, qui dit sous quel compte GitHub — ce que cela fait, au survol.
/** @param {Fabrique} doc @param {string | null} compte */
export function poserConnecte(doc, compte) {
  const ligne = doc.createElement("p");
  ligne.className = "connecte";
  if (compte === null) ligne.append("This phone is signed in to GitHub.");
  else {
    const nom = doc.createElement("code");
    nom.className = "mono";
    nom.textContent = compte;
    ligne.append("Signed in to GitHub as ", nom, ".");
  }
  ligne.append(survol(doc, "This phone reads your projects on GitHub under this account."));
  return ligne;
}

// Connecté, « All projects » liste les projets lus sur GitHub (le ticket 2501). Au-dessus de leurs lignes, la section dit
// en une phrase ce qui manque à la liste — rien quand elle vient d'être lue et en porte : sa première lecture en cours,
// un compte dont aucune station ne sert de projet, ou ce qui l'empêche ; les projets déjà connus restent dessous. Une
// connexion que GitHub refuse le dit, avec le geste qui la refait. `reconnecter` : ce geste.
/** @param {Fabrique} doc @param {{ liste?: import("./pont.d.ts").ListeDuTelephone }} telephone @param {number} projets @param {() => void} reconnecter @returns {HTMLElement[]} */
export function poserLaListeGitHub(doc, { liste }, projets, reconnecter) {
  /** @param {string} texte */
  const phrase = (texte) => {
    const ligne = doc.createElement("p");
    ligne.textContent = texte;
    return ligne;
  };
  if (liste === undefined) return projets > 0 ? [] : [phrase("Your projects on GitHub: first read in progress…")];
  if (liste.lue) return projets > 0 ? [] : [phrase(`${PAS_ENCORE("project served by your stations")} A project is added from a computer.`)];
  if (liste.reason === "oublie") {
    const ligne = ligneErreur(doc, "GitHub no longer accepts this phone's sign-in.", `${liste.said} — the access was revoked on GitHub, or it expired.`);
    ligne.dataset.etat = "oublie";
    ligne.append(boutonAction(doc, "sign in again", reconnecter, { recommande: true }));
    return [ligne];
  }
  const ligne = ligneErreur(doc, liste.reason === "injoignable" ? "This phone cannot reach GitHub." : "GitHub did not give your projects.", `${liste.said}. This phone tries again every 30 s.`);
  ligne.dataset.etat = "injoignable";
  return [ligne];
}
