// @ts-check
// La section « Connections » de la page d'une station (ticket 2643, épique 2497) : le compte GitHub que le `gh` de la
// machine tient, et la connexion de Claude (le compte Max) — son état, depuis quand elle tient, et de quoi la renouveler.
// Chaque réglage est une rangée de réglage (composants/reglage) avec la marque de son niveau (« this machine ») : il vit sur
// la machine, jamais dans le dépôt, donc aucune PR. Sur la page d'une autre station, les deux se montrent
// sans geste : une ligne dit que le changement se fait sur cette machine. Ce que la section lit — le compte, la connexion
// publiée — et les gestes qu'elle offre lui sont remis par la coque (`contexte.connexions`) : ce module ne touche ni
// `document` ni le pont, il reçoit de quoi créer un élément.

import { boutonAction, survol } from "../../../briques.js";
import { rangeeDeReglage } from "../../../composants/reglage/reglage.js";
import { appliquer } from "../appliquer.js";
import { LECTURE, NON_ATTEINT } from "../../../lexique.js";

/** @typedef {import("../../../briques.js").Fabrique} Fabrique */
/** @typedef {import("../StationPage.js").Contexte} Contexte */
/** @typedef {import("../../../../connexion-github.ts").CompteGitHub} CompteGitHub */
/** @typedef {{ etat: "connectee" | "perdue" | "inconnue", depuis: string | null }} ConnexionClaude */
/** @typedef {import("../appliquer.js").Rendu} Rendu */
/**
 * Ce que la section lit : `github` le compte du `gh` de cette machine (absent : pas encore lu), `claude` la connexion que la
 * station publie (nulle : elle n'en dit rien). `gestes` : changer de compte, renouveler la connexion — des promesses qui
 * rendent la ligne que le geste a dite, son refus (`{ refus, detail }`), ou rien.
 * @typedef {{ github?: CompteGitHub, claude: ConnexionClaude | null, gestes?: { changerGitHub?(): Promise<Rendu>, renouveler?(): Promise<Rendu> } }} Connexions
 */

export { LECTURE };
export const GITHUB = "GitHub account";
export const CLAUDE = "Claude connection";
export const CHANGER = "change account";
export const RENOUVELER = "renew";
export const PAS_PUBLIE = "not published";
export const PAS_PUBLIE_SURVOL = "a station does not publish its GitHub account: it is read on that machine only";
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
export const AILLEURS = (/** @type {string} */ nom) => `Changed on ${nom} itself: open this page from that machine.`;

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

// Une rangée de réglage (composants/reglage, ticket 2920) : son nom et sa marque de niveau, sa valeur, son geste (absent en
// lecture seule) ; dessous, ce que le geste a rendu. Le geste s'applique au clic, son bouton désactivé et « applying… »
// le temps qu'il court ; un geste qui échoue se dit en une ligne d'erreur, son message au survol.
/** @param {Fabrique} doc @param {{ cle: string, nom: string, niveau: any, valeur: any[], geste?: { libelle: string, faire(): Promise<Rendu> } }} rangee */
function rangee(doc, { cle, nom, niveau, valeur, geste }) {
  const racine = rangeeDeReglage(doc, { nom, cle, niveau, valeur });
  if (geste !== undefined) {
    const action = boutonAction(doc, geste.libelle, () => {
      void appliquer(doc, racine, [action.children[0]], () => geste.faire().catch((erreur) => ({ refus: RIEN_FAIT, detail: erreur instanceof Error ? erreur.message : String(erreur) })));
    });
    racine.children[2].append(action);
  }
  return racine;
}

/** @param {Fabrique} doc @param {Contexte} contexte @param {Connexions} lues */
function github(doc, contexte, lues) {
  const compte = lues.github;
  /** @type {any[]} */
  let valeur;
  if (compte === undefined) valeur = [avec(doc, "span", contexte.lectureSeule ? PAS_PUBLIE : LECTURE), ...(contexte.lectureSeule ? [survol(doc, PAS_PUBLIE_SURVOL)] : [])];
  else if ("login" in compte) valeur = [avec(doc, "span", compte.login, "mono")];
  else if ("nonConnecte" in compte) valeur = [avec(doc, "span", NON_CONNECTE_GITHUB)];
  else valeur = [avec(doc, "span", ILLISIBLE_GITHUB), ...(compte.detail ? [survol(doc, compte.detail)] : [survol(doc, compte.refus)])];
  const changer = lues.gestes?.changerGitHub;
  return rangee(doc, {
    cle: "github",
    nom: GITHUB,
    niveau: contexte.niveau("github"),
    valeur,
    geste: contexte.lectureSeule || changer === undefined ? undefined : { libelle: CHANGER, faire: changer },
  });
}

/** @param {Fabrique} doc @param {Contexte} contexte @param {Connexions} lues */
function claude(doc, contexte, lues) {
  const connexion = lues.claude;
  const vu = connexion === null ? { dit: CLAUDE_TUE, survol: CLAUDE_TUE_SURVOL } : CLAUDE_DIT[connexion.etat];
  const etat = avec(doc, "span", vu.dit);
  if (connexion !== null) etat.dataset.etat = connexion.etat;
  const depuis = connexion?.etat === "connectee" ? depuisDit(connexion.depuis) : "";
  const renouveler = lues.gestes?.renouveler;
  return rangee(doc, {
    cle: "claude",
    nom: CLAUDE,
    niveau: contexte.niveau("claude"),
    valeur: [etat, ...(depuis === "" ? [] : [avec(doc, "span", depuis, "depuis")]), survol(doc, vu.survol)],
    geste: contexte.lectureSeule || renouveler === undefined ? undefined : { libelle: RENOUVELER, faire: renouveler },
  });
}

// La section : les deux rangées ; sur une autre station, la ligne qui dit où le changement se fait.
/** @param {Fabrique} doc @param {Contexte} contexte */
export function poserSection(doc, contexte) {
  /** @type {Connexions} */
  const lues = contexte.connexions ?? { claude: null };
  const racine = doc.createElement("div");
  racine.className = "connexions";
  racine.append(github(doc, contexte, lues), claude(doc, contexte, lues));
  if (contexte.lectureSeule) {
    const ailleurs = avec(doc, "p", AILLEURS(contexte.station.nom));
    ailleurs.className = "ailleurs";
    racine.append(ailleurs);
  }
  return racine;
}
