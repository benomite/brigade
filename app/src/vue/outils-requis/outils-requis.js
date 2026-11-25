// @ts-check
// L'écran de l'outil manquant (ticket 4059, épique 4054) : l'app a besoin de trois outils qu'elle ne livre pas — le
// GitHub CLI (`gh`) pour la connexion à GitHub, Git (`git`) pour le clone, Claude Code (`claude`) pour les cooks, le
// second et le login Max. Un pas qui en demande un le vérifie d'abord (`outilsManquants`, outils-requis.ts) ; s'il
// manque, ce pas cède la place à cet écran, au même endroit : le produit nommé — le binaire au détail —, pourquoi
// l'app en a besoin en une phrase, un lien vers sa page d'installation officielle, et « I installed it », qui relit.
// L'app n'installe rien (ticket 4266) : installer est l'affaire du chef. L'outil trouvé, le pas revient tel qu'il était —
// rien n'est relancé à la place du chef. Un outil toujours absent se dit en une ligne, et l'offre reste.
// Ce module ne touche pas `document` : il reçoit de quoi créer un élément (briques.js), et rend des éléments.

import { boutonAction } from "../briques.js";
import { phrase } from "../onboarding/parcours.js";
import { gestes } from "../parcours-projet/connexion.js";
import { ligneErreur } from "../composants/ligne-erreur/ligne-erreur.js";
import { CET_ORDINATEUR } from "../lexique.js";

/** @typedef {import("../briques.js").Fabrique} Fabrique */
/** @typedef {"gh" | "git" | "claude"} OutilRequis */
/** @typedef {{ outil: OutilRequis, installation: import("../../outils-requis.ts").OutilManquant["installation"] }} Manque */
/** @typedef {{ outilsManquants?(outils?: OutilRequis[]): Promise<Manque[]> }} PontDesOutils */
/**
 * Ce que l'écran tient. `lu` : une vérification a rendu — avant, rien n'est sûr. `manque` : l'outil à installer, le
 * premier de ceux qui manquent. `enCours` : la vérification en route. `dit` : l'outil encore absent après « I installed
 * it ». `illisible` : la vérification n'a pas répondu.
 * @typedef {{
 *   lu: boolean,
 *   manque?: Manque,
 *   enCours?: "verification",
 *   dit?: { absent: true },
 *   illisible?: { refus: string, detail?: string },
 * }} EtatDesOutils
 */

/** @type {Record<OutilRequis, string>} */
export const NOMS = { gh: "the GitHub CLI", git: "Git", claude: "Claude Code" };
/** @type {Record<OutilRequis, string>} */
export const POURQUOI = {
  gh: "brigade needs the GitHub CLI (`gh`) to sign you in to GitHub and read your projects there.",
  git: `brigade needs Git (\`git\`) to clone your projects onto ${CET_ORDINATEUR}.`,
  claude: "brigade needs Claude Code (`claude`) to cook: the cooks and the second run on it, with your Max account.",
};
/** @param {OutilRequis} outil */
const Nom = (outil) => NOMS[outil].replace(/^the /, "The ");
/** @param {OutilRequis} outil */
export const MANQUE = (outil) => `${Nom(outil)} is not installed on ${CET_ORDINATEUR}.`;
/** @param {OutilRequis} outil */
export const LA_PAGE = (outil) => `how to install ${NOMS[outil]}`;
export const DEJA_INSTALLE = "I installed it";
export const VERIFICATION = `Checking the tools of ${CET_ORDINATEUR}…`;
/** @param {OutilRequis} outil */
export const TOUJOURS_ABSENT = (outil) => `${Nom(outil)} is still missing on ${CET_ORDINATEUR}: install it, then click “${DEJA_INSTALLE}”.`;
export const ILLISIBLE = `The app could not check which tools ${CET_ORDINATEUR} has.`;

const message = (/** @type {unknown} */ erreur) => (erreur instanceof Error ? erreur.message : String(erreur));

// Les outils d'un pas, tenus : `verifier` les relit — vrai quand aucun ne manque, ou que le pont ne sait pas les lire.
// `rendre` à chaque changement.
// `outils` : ceux que ce pas demande ; absents, les trois. `quandPret` : l'outil qui manquait est là — le pas qu'il
// retenait reprend.
/**
 * @param {{ pont: PontDesOutils, rendre: () => void, outils?: OutilRequis[], quandPret?: () => void }} options
 * @returns {{ etat: EtatDesOutils, verifier: (apresUnGeste?: boolean) => Promise<boolean> }}
 */
export function tenirLesOutils({ pont, rendre, outils, quandPret }) {
  /** @type {EtatDesOutils} */
  const etat = { lu: false };
  let lecture = 0;
  // `apresUnGeste` : le chef a dit l'avoir installé — un outil toujours absent se dit.
  async function verifier(apresUnGeste = false) {
    if (pont.outilsManquants === undefined) {
      etat.lu = true;
      return true;
    }
    const demandee = ++lecture;
    const avant = etat.manque?.outil;
    etat.enCours = "verification";
    rendre();
    /** @type {Manque[] | undefined} */
    let manquants;
    try {
      manquants = await pont.outilsManquants(outils);
    } catch (erreur) {
      if (demandee !== lecture) return false;
      delete etat.enCours;
      etat.illisible = { refus: ILLISIBLE, detail: message(erreur) };
      etat.lu = true;
      rendre();
      // Rien ne se lit : le pas reste offert, et c'est lui qui dira ce qui l'empêche.
      return true;
    }
    if (demandee !== lecture) return false;
    delete etat.enCours;
    delete etat.illisible;
    etat.lu = true;
    // Rien de rendu : ce pont ne lit pas les outils de sa machine (le téléphone n'en a pas) — le pas reste offert.
    if (manquants === undefined) {
      rendre();
      return true;
    }
    const premier = manquants[0];
    if (premier === undefined) {
      delete etat.manque;
      delete etat.dit;
      rendre();
      if (avant !== undefined) quandPret?.();
      return true;
    }
    if (apresUnGeste && premier.outil === avant) etat.dit = { absent: true };
    else if (premier.outil !== avant) delete etat.dit;
    etat.manque = premier;
    rendre();
    return false;
  }
  return { etat, verifier };
}

/** @param {Fabrique} doc @param {string} balise @param {string} texte */
function cree(doc, balise, texte) {
  const pose = doc.createElement(balise);
  pose.textContent = texte;
  return pose;
}

// L'écran : l'outil qui manque, pourquoi, le lien de sa page d'installation, « I installed it » et ce que la dernière
// vérification a rendu. Sans outil qui
// manque, ce qui se lit encore — la vérification en route, ou pourquoi elle ne se lit pas —, sinon rien.
/**
 * @param {Fabrique} doc @param {EtatDesOutils} etat
 * @param {{ ouvrir: (url: string) => void, verifier: () => void }} geste
 * @returns {any[]}
 */
export function poserLesOutils(doc, etat, geste) {
  const { manque } = etat;
  if (manque === undefined) {
    if (etat.enCours === "verification") {
      const dit = cree(doc, "p", VERIFICATION);
      dit.className = "dit";
      dit.role = "status";
      return [dit];
    }
    if (etat.illisible !== undefined) return [ligneErreur(doc, etat.illisible.refus, etat.illisible.detail, { classe: "refus" })];
    return [];
  }
  const { outil, installation } = manque;
  const racine = doc.createElement("section");
  racine.className = "ecran-outil-manquant";
  racine.dataset.outil = outil;
  const tete = cree(doc, "h3", MANQUE(outil));
  const pourquoi = phrase(doc, "p", POURQUOI[outil]);
  pourquoi.className = "pourquoi";
  racine.append(tete, pourquoi);
  const occupe = etat.enCours !== undefined;
  const lien = boutonAction(doc, LA_PAGE(outil), () => geste.ouvrir(installation.lien), { recommande: true });
  const relit = boutonAction(doc, DEJA_INSTALLE, geste.verifier);
  relit.children[0].disabled = occupe;
  racine.append(gestes(doc, [lien, relit]));
  const { dit } = etat;
  if (etat.enCours !== undefined) {
    const enRoute = cree(doc, "p", VERIFICATION);
    enRoute.className = "dit";
    enRoute.role = "status";
    racine.append(enRoute);
  } else if (dit !== undefined) racine.append(ligneErreur(doc, TOUJOURS_ABSENT(outil), "", { classe: "refus", alerte: true }));
  return [racine];
}
