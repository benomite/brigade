// @ts-check
// La section « Connections » de la page d'une station (ticket 2643, épique 2497) : le compte GitHub que le `gh` de la
// machine tient, et la connexion de Claude (le compte Max) — son état, depuis quand elle tient, et de quoi la renouveler.
// Chaque réglage est une rangée de réglage (components/setting) avec la marque de son niveau (« this machine ») : il vit sur
// la machine, jamais dans le dépôt, donc aucune PR. Sur la page d'une autre station, les deux se montrent
// sans geste : une ligne dit que le changement se fait sur cette machine. Ce que la section lit — le compte, la connexion
// publiée — et les gestes qu'elle offre lui sont remis par la coque (`contexte.connexions`) : ce module ne touche ni
// `document` ni le pont, il reçoit de quoi créer un élément.

import { buttonAction, hover } from "../../../bricks.js";
import { rowOfSetting } from "../../../components/setting/setting.js";
import { apply } from "../apply.js";
import { READING, NOT_REACHED } from "../../../lexicon.js";

/** @typedef {import("../../../bricks.js").Fabrique} Fabrique */
/** @typedef {import("../StationPage.js").Context} Context */
/** @typedef {import("../../../../connection-github.ts").AccountGitHub} AccountGitHub */
/** @typedef {{ etat: "connectee" | "perdue" | "inconnue", depuis: string | null }} ConnectionClaude */
/** @typedef {import("../apply.js").Rendered} Rendered */
/**
 * Ce que la section lit : `github` le compte du `gh` de cette machine (absent : pas encore lu), `claude` la connexion que la
 * station publie (nulle : elle n'en dit rien). `gestes` : changer de compte, renouveler la connexion — des promesses qui
 * rendent la ligne que le geste a dite, son refus (`{ refus, detail }`), ou rien.
 * @typedef {{ github?: AccountGitHub, claude: ConnectionClaude | null, gestes?: { changerGitHub?(): Promise<Rendered>, renouveler?(): Promise<Rendered> } }} Connections
 */

export { READING };
export const GITHUB = "GitHub account";
export const CLAUDE = "Claude connection";
export const CHANGE = "change account";
export const RENEW = "renew";
export const NOT_PUBLISHED = "not published";
export const NOT_PUBLISHED_HOVER = "a station does not publish its GitHub account: it is read on that machine only";
export const NOT_CONNECTED_GITHUB = "not signed in";
export const UNREADABLE_GITHUB = NOT_REACHED("GitHub account");
export const CLAUDE_SAYS = {
  connectee: { dit: "connected", survol: "this station's Claude Code is signed in to your Max account: its cooks can run" },
  perdue: { dit: "not connected", survol: "nothing cooks on this station until you log in again" },
  inconnue: { dit: "unknown", survol: "this station could not tell whether its Claude Code is signed in" },
};
export const CLAUDE_KILLS = "not said";
export const CLAUDE_KILLS_HOVER = "this station has not published its Claude connection — it is offline, or its version does not say it";
export const NOTHING_DONE = "nothing was done";
export const ELSEWHERE = (/** @type {string} */ name) => `Changed on ${name} itself: open this page from that machine.`;

/** @param {string | null} since */
function sinceSays(since) {
  return since !== null && !Number.isNaN(Date.parse(since)) ? `since ${new Date(since).toISOString().slice(0, 10)}` : "";
}

/** @param {Fabrique} doc @param {string} balise @param {string} text @param {string} [classe] */
function withIt(doc, balise, text, classe) {
  const pose = doc.createElement(balise);
  pose.textContent = text;
  if (classe !== undefined) pose.className = classe;
  return pose;
}

// Une rangée de réglage (components/setting, ticket 2920) : son nom et sa marque de niveau, sa valeur, son geste (absent en
// lecture seule) ; dessous, ce que le geste a rendu. Le geste s'applique au clic, son bouton désactivé et « applying… »
// le temps qu'il court ; un geste qui échoue se dit en une ligne d'erreur, son message au survol.
/** @param {Fabrique} doc @param {{ cle: string, nom: string, niveau: any, valeur: any[], geste?: { libelle: string, faire(): Promise<Rendered> } }} rangee */
function row(doc, { cle: key, nom: name, niveau: level, valeur: value, geste: gesture }) {
  const root = rowOfSetting(doc, { nom: name, cle: key, niveau: level, valeur: value });
  if (gesture !== undefined) {
    const action = buttonAction(doc, gesture.libelle, () => {
      void apply(doc, root, [action.children[0]], () => gesture.faire().catch((error) => ({ refus: NOTHING_DONE, detail: error instanceof Error ? error.message : String(error) })));
    });
    root.children[2].append(action);
  }
  return root;
}

/** @param {Fabrique} doc @param {Context} context @param {Connections} readEntries */
function github(doc, context, readEntries) {
  const account = readEntries.github;
  /** @type {any[]} */
  let value;
  if (account === undefined) value = [withIt(doc, "span", context.lectureSeule ? NOT_PUBLISHED : READING), ...(context.lectureSeule ? [hover(doc, NOT_PUBLISHED_HOVER)] : [])];
  else if ("login" in account) value = [withIt(doc, "span", account.login, "mono")];
  else if ("nonConnecte" in account) value = [withIt(doc, "span", NOT_CONNECTED_GITHUB)];
  else value = [withIt(doc, "span", UNREADABLE_GITHUB), ...(account.detail ? [hover(doc, account.detail)] : [hover(doc, account.refus)])];
  const change = readEntries.gestes?.changerGitHub;
  return row(doc, {
    cle: "github",
    nom: GITHUB,
    niveau: context.niveau("github"),
    valeur: value,
    geste: context.lectureSeule || change === undefined ? undefined : { libelle: CHANGE, faire: change },
  });
}

/** @param {Fabrique} doc @param {Context} context @param {Connections} readEntries */
function claude(doc, context, readEntries) {
  const connection = readEntries.claude;
  const seenOne = connection === null ? { dit: CLAUDE_KILLS, survol: CLAUDE_KILLS_HOVER } : CLAUDE_SAYS[connection.etat];
  const state = withIt(doc, "span", seenOne.dit);
  if (connection !== null) state.dataset.etat = connection.etat;
  const since = connection?.etat === "connectee" ? sinceSays(connection.depuis) : "";
  const renew = readEntries.gestes?.renouveler;
  return row(doc, {
    cle: "claude",
    nom: CLAUDE,
    niveau: context.niveau("claude"),
    valeur: [state, ...(since === "" ? [] : [withIt(doc, "span", since, "depuis")]), hover(doc, seenOne.survol)],
    geste: context.lectureSeule || renew === undefined ? undefined : { libelle: RENEW, faire: renew },
  });
}

// La section : les deux rangées ; sur une autre station, la ligne qui dit où le changement se fait.
/** @param {Fabrique} doc @param {Context} context */
export function setSection(doc, context) {
  /** @type {Connections} */
  const readEntries = context.connexions ?? { claude: null };
  const root = doc.createElement("div");
  root.className = "connexions";
  root.append(github(doc, context, readEntries), claude(doc, context, readEntries));
  if (context.lectureSeule) {
    const elsewhere = withIt(doc, "p", ELSEWHERE(context.station.nom));
    elsewhere.className = "ailleurs";
    root.append(elsewhere);
  }
  return root;
}
