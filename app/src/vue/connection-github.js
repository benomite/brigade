// @ts-check
// La connexion du téléphone à GitHub (le ticket 2500, épique 2498) : le premier écran de l'app Android sur une
// installation neuve. Le téléphone lit les projets du chef sur GitHub, sous son compte, sans station : il n'y a ni code
// d'appairage à taper, ni QR à scanner, ni adresse de station. Ce qu'on attend du chef, en tête, en une phrase ; dessous,
// un bouton, « sign in with GitHub ». Le pont du téléphone (app/android/web/pont.js) mène le login avec GitHub : la vue
// montre le code à taper sur la page de GitHub qu'il a ouverte, comme le premier lancement du desktop le montre — la même
// brique, `connexionDite` (addition-project/connection.js). Connecté, l'app passe à ses projets ; refusé sur GitHub, le code
// expiré ou GitHub injoignable, une ligne le dit sous le bouton, le détail au survol, et le chef recommence d'un clic.
// Ce module ne touche pas `document` et ne joint rien : il reçoit de quoi créer un élément (bricks.js) et le pont, et
// rend la carte qu'il tient.

import { buttonAction, hover } from "./bricks.js";
import { lineError } from "./components/line-error/line-error.js";
import { connectionSaid } from "./addition-project/connection.js";
import { NOT_STILL } from "./lexicon.js";

/** @typedef {import("./bricks.js").Fabrique} Fabrique */
/** @typedef {import("../connection-github.ts").StartOfConnection} StartOfConnection */
/** @typedef {import("../connection-github.ts").EndOfConnection} EndOfConnection */
/** @typedef {{ seConnecterAGitHub?(): Promise<StartOfConnection>, surConnexionGitHub?(receive: (end: EndOfConnection) => void): void, ouvrirLaPage?(url: string): Promise<boolean> }} BridgeOfConnection */

export const TITLE = "Sign in to GitHub";
export const EXPECTED = "Sign in with your GitHub account to see your projects.";
export const HELP =
  "Brigade reads your projects, their tickets and their stations on GitHub, under your own account: no station is involved. GitHub shows a one-time code here; type it on the GitHub page that opens. This phone then keeps its GitHub access in its vault — uninstalling the app forgets it.";
export const ITSELF_CONNECT = "sign in with GitHub";
export const NOT_OF_CONNECTION = "The GitHub sign-in could not be started on this phone.";

// L'écran, tenu : la carte est posée une fois, et seul ce qui suit l'attendu change — le bouton, puis le code à taper,
// ou la ligne qui dit pourquoi le chef n'est pas connecté. `apres` : connecté, ce que la vue fait ensuite — passer aux
// projets —, avec le compte GitHub, nul quand GitHub ne l'a pas dit.
/** @param {HTMLElement} place @param {Fabrique} doc @param {{ pont: BridgeOfConnection, apres: (account: string | null) => void }} options */
export function holdConnectionGitHub(place, doc, { pont: bridge, apres: after }) {
  const card = doc.createElement("section");
  card.className = "connexion-github";
  const title = doc.createElement("h2");
  title.textContent = TITLE;
  title.append(hover(doc, HELP));
  const expected = doc.createElement("p");
  expected.className = "attendu";
  expected.textContent = EXPECTED;
  const suite = doc.createElement("div");
  suite.className = "suite-de-connexion";
  suite.ariaLive = "polite";
  card.append(title, expected, suite);
  place.replaceChildren(card);

  /** @type {{ enRoute: true } | StartOfConnection | EndOfConnection | undefined} */
  let connection;
  const awaiting = () => connection !== undefined && ("enRoute" in connection || "code" in connection);
  const set = () => {
    suite.replaceChildren(
      ...connectionSaid(doc, connection, ITSELF_CONNECT, {
        seConnecter: () => void itselfConnect(),
        ouvrirLaPage: (url) => void bridge.ouvrirLaPage?.(url),
      }),
    );
  };
  /** @param {EndOfConnection} end */
  const finish = (end) => {
    if ("connecte" in end) {
      connection = undefined;
      return after(end.compte ?? null);
    }
    connection = end;
    set();
  };

  async function itselfConnect() {
    if (awaiting()) return;
    connection = { enRoute: true };
    set();
    /** @type {StartOfConnection} */
    let start;
    try {
      start = (await bridge.seConnecterAGitHub?.()) ?? { refus: NOT_OF_CONNECTION };
    } catch (error) {
      start = { refus: NOT_OF_CONNECTION, detail: error instanceof Error ? error.message : String(error) };
    }
    if (!("code" in start)) return finish(start);
    connection = start;
    set();
  }
  // La fin n'est attendue que d'un login parti : une autre, venue d'ailleurs, est laissée.
  bridge.surConnexionGitHub?.((end) => {
    if (awaiting()) finish(end);
  });
  set();
  return { carte: card };
}

// Connecté : une ligne, en tête des projets, qui dit sous quel compte GitHub — ce que cela fait, au survol.
/** @param {Fabrique} doc @param {string | null} account */
export function setConnected(doc, account) {
  const line = doc.createElement("p");
  line.className = "connecte";
  if (account === null) line.append("This phone is signed in to GitHub.");
  else {
    const name = doc.createElement("code");
    name.className = "mono";
    name.textContent = account;
    line.append("Signed in to GitHub as ", name, ".");
  }
  line.append(hover(doc, "This phone reads your projects on GitHub under this account."));
  return line;
}

// Connecté, « All projects » liste les projets lus sur GitHub (le ticket 2501). Au-dessus de leurs lignes, la section dit
// en une phrase ce qui manque à la liste — rien quand elle vient d'être lue et en porte : sa première lecture en cours,
// un compte dont aucune station ne sert de projet, ou ce qui l'empêche ; les projets déjà connus restent dessous. Une
// connexion que GitHub refuse le dit, avec le geste qui la refait. `reconnecter` : ce geste.
/** @param {Fabrique} doc @param {{ liste?: import("./bridge.d.ts").ListOfPhone }} telephone @param {number} projects @param {() => void} reconnecter @returns {HTMLElement[]} */
export function setTheListGitHub(doc, { liste: list }, projects, reconnecter) {
  /** @param {string} text */
  const sentence = (text) => {
    const line = doc.createElement("p");
    line.textContent = text;
    return line;
  };
  if (list === undefined) return projects > 0 ? [] : [sentence("Your projects on GitHub: first read in progress…")];
  if (list.lue) return projects > 0 ? [] : [sentence(`${NOT_STILL("project served by your stations")} A project is added from a computer.`)];
  if (list.reason === "oublie") {
    const line = lineError(doc, "GitHub no longer accepts this phone's sign-in.", `${list.said} — the access was revoked on GitHub, or it expired.`);
    line.dataset.etat = "oublie";
    line.append(buttonAction(doc, "sign in again", reconnecter, { recommande: true }));
    return [line];
  }
  const line = lineError(doc, list.reason === "injoignable" ? "This phone cannot reach GitHub." : "GitHub did not give your projects.", `${list.said}. This phone tries again every 30 s.`);
  line.dataset.etat = "injoignable";
  return [line];
}
