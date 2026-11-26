// @ts-check
// L'écran de l'outil manquant (ticket 4059, épique 4054) : l'app a besoin de trois outils qu'elle ne livre pas — le
// GitHub CLI (`gh`) pour la connexion à GitHub, Git (`git`) pour le clone, Claude Code (`claude`) pour les cooks, le
// second et le login Max. Un pas qui en demande un le vérifie d'abord (`outilsManquants`, outils-requis.ts) ; s'il
// manque, ce pas cède la place à cet écran, au même endroit : le produit nommé — le binaire au détail —, pourquoi
// l'app en a besoin en une phrase, un lien vers sa page d'installation officielle, et « I installed it », qui relit.
// Pour `gh` et `claude`, un bouton de plus les installe d'un clic (ticket 4350, install-tools/) quand le pont le sait et
// que la machine s'y prête : idle, installing, done ou failed — failed dit sa raison, et le lien reste. Une machine où
// l'app ne sait pas l'installer le dit, et garde le lien. Git n'a jamais ce bouton (ticket 4266). L'outil trouvé, le pas
// revient tel qu'il était. Claude Code posé, l'écran finit sur « log in », le login de cet ordinateur. Un outil toujours
// absent se dit en une ligne, et l'offre reste.
// Ce module ne touche pas `document` : il reçoit de quoi créer un élément (briques.js), et rend des éléments.

import { boutonAction } from "../briques.js";
import { phrase } from "../onboarding/parcours.js";
import { gestes } from "../parcours-projet/connexion.js";
import { ligneErreur } from "../composants/ligne-erreur/ligne-erreur.js";
import { CET_ORDINATEUR } from "../lexique.js";

/** @typedef {import("../briques.js").Fabrique} Fabrique */
/** @typedef {"gh" | "git" | "claude"} OutilRequis */
/** @typedef {{ outil: OutilRequis, installation?: import("../../outils-requis.ts").OutilManquant["installation"], installable?: boolean }} Manque */
/** @typedef {import("../../install-tools/install-tools.ts").EtatDInstallation} RenduDInstallation */
/** @typedef {{ outilsManquants?(outils?: OutilRequis[]): Promise<Manque[]>, installerOutil?(outil: "gh" | "claude"): Promise<RenduDInstallation> }} PontDesOutils */
/**
 * L'installation d'un clic de l'outil qui manque (ticket 4350). `installable` : l'app sait l'installer sur cette
 * machine. `outil` : celui qu'elle a installé, quand il n'est plus l'outil qui manque.
 * @typedef {{ installable: boolean, phase: RenduDInstallation["phase"], raison?: string, outil?: OutilRequis }} Installation
 */
/**
 * Ce que l'écran tient. `lu` : une vérification a rendu — avant, rien n'est sûr. `manque` : l'outil à installer, le
 * premier de ceux qui manquent. `enCours` : la vérification en route. `dit` : l'outil encore absent après « I installed
 * it ». `illisible` : la vérification n'a pas répondu. `installation` : le bouton qui l'installe, et où il en est —
 * absente, l'écran est celui d'avant.
 * @typedef {{
 *   lu: boolean,
 *   manque?: Manque,
 *   enCours?: "verification",
 *   dit?: { absent: true },
 *   illisible?: { refus: string, detail?: string },
 *   installation?: Installation,
 * }} EtatDesOutils
 */
/** @typedef {{ ouvrir: (url: string) => void, verifier: () => void, installer?: () => void, seConnecterAClaude?: () => void }} GestesDesOutils */

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
/** @param {OutilRequis} outil */
export const INSTALLER = (outil) => `install ${outil}`;
/** @param {OutilRequis} outil */
export const EN_INSTALLATION = (outil) => `Installing ${NOMS[outil]} on ${CET_ORDINATEUR}…`;
/** @param {OutilRequis} outil @param {string} raison */
export const ECHEC = (outil, raison) => `The app could not install ${NOMS[outil]} (${raison}): follow the steps of its page instead.`;
/** @param {OutilRequis} outil */
export const IMPOSSIBLE = (outil) => `The app cannot install ${NOMS[outil]} on ${CET_ORDINATEUR}: follow the steps of its page.`;
export const CLAUDE_INSTALLE = `Claude Code is installed on ${CET_ORDINATEUR}: log in with your Max account.`;
// Le geste qui connecte Claude Code sur cet ordinateur : le mot du bouton de la panne « Max connection lost » (pannes/pannes.ts).
export const SE_CONNECTER_A_CLAUDE = "log in";

const message = (/** @type {unknown} */ erreur) => (erreur instanceof Error ? erreur.message : String(erreur));

// Les outils d'un pas, tenus : `verifier` les relit — vrai quand aucun ne manque, ou que le pont ne sait pas les lire.
// `installer` installe l'outil qui manque, d'un clic, puis relit. `rendre` à chaque changement.
// `outils` : ceux que ce pas demande ; absents, les trois. `quandPret` : l'outil qui manquait est là — le pas qu'il
// retenait reprend.
/**
 * @param {{ pont: PontDesOutils, rendre: () => void, outils?: OutilRequis[], quandPret?: () => void }} options
 * @returns {{ etat: EtatDesOutils, verifier: (apresUnGeste?: boolean) => Promise<boolean>, installer: () => Promise<void> }}
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
    // Un autre outil manque : son bouton repart d'idle. Sans `installable`, le pont n'installe rien — l'écran d'avant.
    if (premier.outil !== avant) {
      if (premier.outil === "git" || premier.installable === undefined || pont.installerOutil === undefined) delete etat.installation;
      else etat.installation = { installable: premier.installable, phase: "idle" };
    }
    etat.manque = premier;
    rendre();
    return false;
  }
  // Le clic du chef, et lui seul : l'outil qui manque s'installe, puis se relit — posé, le pas qu'il retenait reprend.
  async function installer() {
    const outil = etat.manque?.outil;
    const { installation } = etat;
    if (outil === undefined || outil === "git" || installation === undefined || !installation.installable || installation.phase === "installing") return;
    if (pont.installerOutil === undefined) return;
    etat.installation = { installable: true, phase: "installing" };
    rendre();
    /** @type {RenduDInstallation} */
    let rendu;
    try {
      rendu = await pont.installerOutil(outil);
    } catch (erreur) {
      rendu = { phase: "failed", raison: message(erreur) };
    }
    // Un rendu qui ne dit ni done ni failed ne laisse pas l'écran sur installing.
    etat.installation = rendu.phase === "done" ? { installable: true, phase: "done", outil } : { installable: true, phase: "failed", raison: rendu.raison ?? `the install of ${outil} did not end` };
    rendre();
    if (rendu.phase === "done") await verifier(true);
  }
  return { etat, verifier, installer };
}

// Claude Code tout juste installé (ticket 4350) : l'écran finit sur « log in », même quand plus rien ne manque.
/** @param {EtatDesOutils} etat */
const claudeInstalle = (etat) => etat.installation?.phase === "done" && etat.installation.outil === "claude";
// L'écran a-t-il quelque chose à dire hors du pas : un outil qui manque, ou le « log in » de Claude Code tout juste posé.
/** @param {EtatDesOutils} etat */
export const aMontrer = (etat) => etat.manque !== undefined || claudeInstalle(etat);
// L'avis fermé : une installation finie, dont l'outil ne manque plus, est oubliée — l'avis ne revient pas pour elle.
/** @param {EtatDesOutils} etat */
export function oublierLInstallation(etat) {
  if (etat.manque === undefined) delete etat.installation;
}

/** @param {Fabrique} doc @param {string} balise @param {string} texte */
function cree(doc, balise, texte) {
  const pose = doc.createElement(balise);
  pose.textContent = texte;
  return pose;
}

// L'écran : l'outil qui manque, pourquoi, son bouton d'installation quand il en a un, le lien de sa page
// d'installation, « I installed it » et ce que la dernière vérification a rendu. Sans outil qui
// manque, ce qui se lit encore — la vérification en route, ou pourquoi elle ne se lit pas, ou Claude Code tout juste
// installé et son « log in » —, sinon rien.
/**
 * @param {Fabrique} doc @param {EtatDesOutils} etat
 * @param {GestesDesOutils} geste
 * @returns {any[]}
 */
export function poserLesOutils(doc, etat, geste) {
  const { manque, installation } = etat;
  if (manque === undefined) {
    if (etat.enCours === "verification") {
      const dit = cree(doc, "p", VERIFICATION);
      dit.className = "dit";
      dit.role = "status";
      return [dit];
    }
    if (etat.illisible !== undefined) return [ligneErreur(doc, etat.illisible.refus, etat.illisible.detail, { classe: "refus" })];
    if (claudeInstalle(etat)) {
      const fait = cree(doc, "p", CLAUDE_INSTALLE);
      fait.className = "dit";
      return [fait, gestes(doc, [boutonAction(doc, SE_CONNECTER_A_CLAUDE, () => geste.seConnecterAClaude?.(), { recommande: true })])];
    }
    return [];
  }
  const { outil } = manque;
  const racine = doc.createElement("section");
  racine.className = "ecran-outil-manquant";
  racine.dataset.outil = outil;
  const tete = cree(doc, "h3", MANQUE(outil));
  const pourquoi = phrase(doc, "p", POURQUOI[outil]);
  pourquoi.className = "pourquoi";
  racine.append(tete, pourquoi);
  // Le bouton d'installation : jamais pour Git, ni sans un pont qui installe. La machine ne s'y prête pas : l'écran le
  // dit, et le lien reste le geste.
  const installe = outil === "git" ? undefined : installation;
  if (installe !== undefined && !installe.installable) racine.append(cree(doc, "p", IMPOSSIBLE(outil)));
  const installant = installe?.phase === "installing";
  const occupe = etat.enCours !== undefined || installant;
  const offert = installe !== undefined && installe.installable;
  const bouton = offert ? boutonAction(doc, INSTALLER(outil), () => geste.installer?.(), { recommande: true }) : undefined;
  if (bouton !== undefined) bouton.children[0].disabled = occupe;
  const lien = manque.installation === undefined ? undefined : boutonAction(doc, LA_PAGE(outil), () => geste.ouvrir(manque.installation?.lien ?? ""), { recommande: !offert });
  const relit = boutonAction(doc, DEJA_INSTALLE, geste.verifier);
  relit.children[0].disabled = occupe;
  racine.append(gestes(doc, [...(bouton === undefined ? [] : [bouton]), ...(lien === undefined ? [] : [lien]), relit]));
  const { dit } = etat;
  // Une ligne d'état, une seule : l'installation en route, ou la vérification ; puis ce qui a échoué, sa raison dite.
  const enRoute = installant ? EN_INSTALLATION(outil) : etat.enCours !== undefined ? VERIFICATION : undefined;
  if (enRoute !== undefined) {
    const ligne = cree(doc, "p", enRoute);
    ligne.className = "dit";
    ligne.role = "status";
    racine.append(ligne);
  }
  if (installe?.phase === "failed") racine.append(ligneErreur(doc, ECHEC(outil, installe.raison ?? ""), "", { classe: "refus", alerte: true }));
  if (enRoute === undefined && dit !== undefined) racine.append(ligneErreur(doc, TOUJOURS_ABSENT(outil), "", { classe: "refus", alerte: true }));
  return [racine];
}
