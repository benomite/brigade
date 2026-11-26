// @ts-check
// La section « Connections » de la page d'une station (ticket 2643, épique 2497) : le compte GitHub que le `gh` de la
// machine tient, et la connexion de Claude (le compte Max) — son état, depuis quand elle tient, et de quoi la renouveler.
// Chaque réglage est une rangée de réglage (composants/setting) avec la marque de son niveau (« this machine ») : il vit sur
// la machine, jamais dans le dépôt, donc aucune PR. Sur la page d'une autre station, les deux se montrent
// sans geste : une ligne dit que le changement se fait sur cette machine. Ce que la section lit — le compte, la connexion
// publiée — et les gestes qu'elle offre lui sont remis par la coque (`contexte.connexions`) : ce module ne touche ni
// `document` ni le pont, il reçoit de quoi créer un élément.

import { buttonAction, survol } from "../../../briques.js";
import { rangeeDeSetting } from "../../../composants/setting/setting.js";
import { appliquer } from "../appliquer.js";
import { READ, NON_ATTEINT } from "../../../lexique.js";

/** @typedef {import("../../../briques.js").Fabrique} Fabrique */
/** @typedef {import("../StationPage.js").Context} Context */
/** @typedef {import("../../../../connection-github.ts").AccountGitHub} AccountGitHub */
/** @typedef {{ etat: "connectee" | "perdue" | "inconnue", depuis: string | null }} ConnectionClaude */
/** @typedef {import("../appliquer.js").Rendu} Rendu */
/**
 * Ce que la section lit : `github` le compte du `gh` de cette machine (absent : pas encore lu), `claude` la connexion que la
 * station publie (nulle : elle n'en dit rien). `gestes` : changer de compte, renouveler la connexion — des promesses qui
 * rendent la ligne que le geste a dite, son refus (`{ refus, detail }`), ou rien.
 * @typedef {{ github?: AccountGitHub, claude: ConnectionClaude | null, gestes?: { changerGitHub?(): Promise<Rendu>, renouveler?(): Promise<Rendu> } }} Connections
 */

export { READ };
export const GITHUB = "GitHub account";
export const CLAUDE = "Claude connection";
export const CHANGER = "change account";
export const RENEW = "renew";
export const PAS_PUBLISHED = "not published";
export const PAS_PUBLISHED_SURVOL = "a station does not publish its GitHub account: it is read on that machine only";
export const NON_CONNECTE_GITHUB = "not signed in";
export const ILLISIBLE_GITHUB = NON_ATTEINT("GitHub account");
export const CLAUDE_DIT = {
  connectee: { dit: "connected", survol: "this station's Claude Code is signed in to your Max account: its cooks can run" },
  perdue: { dit: "not connected", survol: "nothing cooks on this station until you log in again" },
  inconnue: { dit: "unknown", survol: "this station could not tell whether its Claude Code is signed in" },
};
export const CLAUDE_TUE = "not said";
export const CLAUDE_TUE_SURVOL = "this station has not published its Claude connection — it is offline, or its version does not say it";
export const RIEN_FAIT = "nothing was done";
export const AILLEURS = (/** @type {string} */ name) => `Changed on ${name} itself: open this page from that machine.`;

/** @param {string | null} depuis */
function depuisDit(depuis) {
  return depuis !== null && !Number.isNaN(Date.parse(depuis)) ? `since ${new Date(depuis).toISOString().slice(0, 10)}` : "";
}

/** @param {Fabrique} doc @param {string} balise @param {string} texte @param {string} [classe] */
function avec(doc, balise, texte, classe) {
  const pose = doc.createElement(balise);
  pose.textContent = texte;
  if (classe !== undefined) pose.className = classe;
  return pose;
}

// Une rangée de réglage (composants/setting, ticket 2920) : son nom et sa marque de niveau, sa valeur, son geste (absent en
// lecture seule) ; dessous, ce que le geste a rendu. Le geste s'applique au clic, son bouton désactivé et « applying… »
// le temps qu'il court ; un geste qui échoue se dit en une ligne d'erreur, son message au survol.
/** @param {Fabrique} doc @param {{ cle: string, nom: string, niveau: any, valeur: any[], geste?: { libelle: string, faire(): Promise<Rendu> } }} rangee */
function rangee(doc, { cle, nom: name, niveau, valeur, geste: gesture }) {
  const racine = rangeeDeSetting(doc, { nom: name, cle, niveau, valeur });
  if (gesture !== undefined) {
    const action = buttonAction(doc, gesture.libelle, () => {
      void appliquer(doc, racine, [action.children[0]], () => gesture.faire().catch((error) => ({ refus: RIEN_FAIT, detail: error instanceof Error ? error.message : String(error) })));
    });
    racine.children[2].append(action);
  }
  return racine;
}

/** @param {Fabrique} doc @param {Context} context @param {Connections} lues */
function github(doc, context, lues) {
  const account = lues.github;
  /** @type {any[]} */
  let valeur;
  if (account === undefined) valeur = [avec(doc, "span", context.lectureSeule ? PAS_PUBLISHED : READ), ...(context.lectureSeule ? [survol(doc, PAS_PUBLISHED_SURVOL)] : [])];
  else if ("login" in account) valeur = [avec(doc, "span", account.login, "mono")];
  else if ("nonConnecte" in account) valeur = [avec(doc, "span", NON_CONNECTE_GITHUB)];
  else valeur = [avec(doc, "span", ILLISIBLE_GITHUB), ...(account.detail ? [survol(doc, account.detail)] : [survol(doc, account.refus)])];
  const changer = lues.gestes?.changerGitHub;
  return rangee(doc, {
    cle: "github",
    nom: GITHUB,
    niveau: context.niveau("github"),
    valeur,
    geste: context.lectureSeule || changer === undefined ? undefined : { libelle: CHANGER, faire: changer },
  });
}

/** @param {Fabrique} doc @param {Context} context @param {Connections} lues */
function claude(doc, context, lues) {
  const connection = lues.claude;
  const vu = connection === null ? { dit: CLAUDE_TUE, survol: CLAUDE_TUE_SURVOL } : CLAUDE_DIT[connection.etat];
  const state = avec(doc, "span", vu.dit);
  if (connection !== null) state.dataset.etat = connection.etat;
  const depuis = connection?.etat === "connectee" ? depuisDit(connection.depuis) : "";
  const renew = lues.gestes?.renouveler;
  return rangee(doc, {
    cle: "claude",
    nom: CLAUDE,
    niveau: context.niveau("claude"),
    valeur: [state, ...(depuis === "" ? [] : [avec(doc, "span", depuis, "depuis")]), survol(doc, vu.survol)],
    geste: context.lectureSeule || renew === undefined ? undefined : { libelle: RENEW, faire: renew },
  });
}

// La section : les deux rangées ; sur une autre station, la ligne qui dit où le changement se fait.
/** @param {Fabrique} doc @param {Context} context */
export function poserSection(doc, context) {
  /** @type {Connections} */
  const lues = context.connexions ?? { claude: null };
  const racine = doc.createElement("div");
  racine.className = "connexions";
  racine.append(github(doc, context, lues), claude(doc, context, lues));
  if (context.lectureSeule) {
    const ailleurs = avec(doc, "p", AILLEURS(context.station.nom));
    ailleurs.className = "ailleurs";
    racine.append(ailleurs);
  }
  return racine;
}
