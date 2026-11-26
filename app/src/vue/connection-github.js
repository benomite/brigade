// @ts-check
// La connexion du téléphone à GitHub (le ticket 2500, épique 2498) : le premier écran de l'app Android sur une
// installation neuve. Le téléphone lit les projets du chef sur GitHub, sous son compte, sans station : il n'y a ni code
// d'appairage à taper, ni QR à scanner, ni adresse de station. Ce qu'on attend du chef, en tête, en une phrase ; dessous,
// un bouton, « sign in with GitHub ». Le pont du téléphone (app/android/web/pont.js) mène le login avec GitHub : la vue
// montre le code à taper sur la page de GitHub qu'il a ouverte, comme le premier lancement du desktop le montre — la même
// brique, `connexionDite` (first-launch.js). Connecté, l'app passe à ses projets ; refusé sur GitHub, le code
// expiré ou GitHub injoignable, une ligne le dit sous le bouton, le détail au survol, et le chef recommence d'un clic.
// Un pont qui sait lire les outils de sa machine (`outilsManquants`, ticket 4059) les vérifie à l'ouverture et avant
// chaque connexion : un outil qui manque prend la place du bouton — l'écran de l'outil manquant (tools-required/) —, et
// le bouton revient, sans connexion relancée, quand il est installé.
// Ce module ne touche pas `document` et ne joint rien : il reçoit de quoi créer un élément (briques.js) et le pont, et
// rend la carte qu'il tient.

import { buttonAction, survol } from "./briques.js";
import { lineError } from "./composants/line-error/line-error.js";
import { connectionDite } from "./first-launch.js";
import { PAS_ENCORE } from "./lexique.js";
import { poserLesTools, holdLesTools } from "./tools-required/tools-required.js";

/** @typedef {import("./briques.js").Fabrique} Fabrique */
/** @typedef {import("../connection-github.ts").DebutDeConnection} DebutDeConnection */
/** @typedef {import("../connection-github.ts").FinDeConnection} FinDeConnection */
/** @typedef {{ seConnecterAGitHub?(): Promise<DebutDeConnection>, surConnexionGitHub?(recevoir: (fin: FinDeConnection) => void): void, ouvrirLaPage?(url: string): Promise<boolean> } & import("./tools-required/tools-required.js").PontDesTools} PontDeConnection */

export const TITRE = "Sign in to GitHub";
export const ATTENDU = "Sign in with your GitHub account to see your projects.";
export const AIDE =
  "Brigade reads your projects, their tickets and their stations on GitHub, under your own account: no station is involved. GitHub shows a one-time code here; type it on the GitHub page that opens. This phone then keeps its GitHub access in its vault — uninstalling the app forgets it.";
export const SE_CONNECTER = "sign in with GitHub";
export const PAS_DE_CONNECTION = "The GitHub sign-in could not be started on this phone.";

// L'écran, tenu : la carte est posée une fois, et seul ce qui suit l'attendu change — le bouton, puis le code à taper,
// ou la ligne qui dit pourquoi le chef n'est pas connecté. `apres` : connecté, ce que la vue fait ensuite — passer aux
// projets —, avec le compte GitHub, nul quand GitHub ne l'a pas dit.
/** @param {HTMLElement} lieu @param {Fabrique} doc @param {{ pont: PontDeConnection, apres: (account: string | null) => void }} options */
export function holdConnectionGitHub(lieu, doc, { pont, apres }) {
  const card = doc.createElement("section");
  card.className = "connexion-github";
  const titre = doc.createElement("h2");
  titre.textContent = TITRE;
  titre.append(survol(doc, AIDE));
  const attendu = doc.createElement("p");
  attendu.className = "attendu";
  attendu.textContent = ATTENDU;
  const suite = doc.createElement("div");
  suite.className = "suite-de-connexion";
  suite.ariaLive = "polite";
  card.append(titre, attendu, suite);
  lieu.replaceChildren(card);

  /** @type {{ enRoute: true } | DebutDeConnection | FinDeConnection | undefined} */
  let connection;
  const awaiting = () => connection !== undefined && ("enRoute" in connection || "code" in connection);
  // Les outils d'abord : tant que l'un manque, ou que leur lecture est en route, son écran tient la place du bouton.
  const tools = holdLesTools({ pont, rendre: () => poser() });
  const actionsDesTools = { ouvrir: (/** @type {string} */ url) => void pont.ouvrirLaPage?.(url), verifier: () => void tools.verifier(true) };
  const poser = () => {
    const { etat: state } = tools;
    if (state.manque !== undefined || (state.enCours === "verification" && !state.lu)) return suite.replaceChildren(...poserLesTools(doc, state, actionsDesTools));
    suite.replaceChildren(
      ...poserLesTools(doc, state, actionsDesTools),
      ...connectionDite(doc, connection, SE_CONNECTER, {
        seConnecter: () => void seConnecter(),
        ouvrirLaPage: (url) => void pont.ouvrirLaPage?.(url),
      }),
    );
  };
  /** @param {FinDeConnection} fin */
  const finir = (fin) => {
    if ("connecte" in fin) {
      connection = undefined;
      return apres(fin.compte ?? null);
    }
    connection = fin;
    poser();
  };

  async function seConnecter() {
    if (awaiting()) return;
    // Une connexion qui ne peut pas partir ne tourne pas : l'outil qui manque se dit à sa place.
    if (pont.outilsManquants !== undefined) {
      if (!(await tools.verifier())) return;
      if (awaiting()) return;
    }
    connection = { enRoute: true };
    poser();
    /** @type {DebutDeConnection} */
    let debut;
    try {
      debut = (await pont.seConnecterAGitHub?.()) ?? { refus: PAS_DE_CONNECTION };
    } catch (error) {
      debut = { refus: PAS_DE_CONNECTION, detail: error instanceof Error ? error.message : String(error) };
    }
    if (!("code" in debut)) return finir(debut);
    connection = debut;
    poser();
  }
  // La fin n'est attendue que d'un login parti : une autre, venue d'ailleurs, est laissée.
  pont.surConnexionGitHub?.((fin) => {
    if (awaiting()) finir(fin);
  });
  poser();
  void tools.verifier();
  return { carte: card };
}

// Connecté : une ligne, en tête des projets, qui dit sous quel compte GitHub — ce que cela fait, au survol.
/** @param {Fabrique} doc @param {string | null} account */
export function poserConnecte(doc, account) {
  const line = doc.createElement("p");
  line.className = "connecte";
  if (account === null) line.append("This phone is signed in to GitHub.");
  else {
    const name = doc.createElement("code");
    name.className = "mono";
    name.textContent = account;
    line.append("Signed in to GitHub as ", name, ".");
  }
  line.append(survol(doc, "This phone reads your projects on GitHub under this account."));
  return line;
}

// Connecté, « All projects » liste les projets lus sur GitHub (le ticket 2501). Au-dessus de leurs lignes, la section dit
// en une phrase ce qui manque à la liste — rien quand elle vient d'être lue et en porte : sa première lecture en cours,
// un compte dont aucune station ne sert de projet, ou ce qui l'empêche ; les projets déjà connus restent dessous. Une
// connexion que GitHub refuse le dit, avec le geste qui la refait. `reconnecter` : ce geste.
/** @param {Fabrique} doc @param {{ liste?: import("./pont.d.ts").ListeDuPhone }} telephone @param {number} projects @param {() => void} reconnecter @returns {HTMLElement[]} */
export function poserLaListeGitHub(doc, { liste }, projects, reconnecter) {
  /** @param {string} texte */
  const phrase = (texte) => {
    const line = doc.createElement("p");
    line.textContent = texte;
    return line;
  };
  if (liste === undefined) return projects > 0 ? [] : [phrase("Your projects on GitHub: first read in progress…")];
  if (liste.lue) return projects > 0 ? [] : [phrase(`${PAS_ENCORE("project served by your stations")} A project is added from a computer.`)];
  if (liste.reason === "oublie") {
    const line = lineError(doc, "GitHub no longer accepts this phone's sign-in.", `${liste.said} — the access was revoked on GitHub, or it expired.`);
    line.dataset.etat = "oublie";
    line.append(buttonAction(doc, "sign in again", reconnecter, { recommande: true }));
    return [line];
  }
  const line = lineError(doc, liste.reason === "injoignable" ? "This phone cannot reach GitHub." : "GitHub did not give your projects.", `${liste.said}. This phone tries again every 30 s.`);
  line.dataset.etat = "injoignable";
  return [line];
}
