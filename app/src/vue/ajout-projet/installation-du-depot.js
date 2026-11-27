// @ts-check
// Le dépôt choisi dans le parcours d'ajout est-il prêt pour brigade (ticket 2627, épique 2584) ? Dès que le chef le
// choisit, le parcours le vérifie (`checkRepoSetup`) et le dit en une phrase :
//   - prêt : la phrase, et le parcours continue comme avant, sans geste de plus ;
//   - pas prêt : ce qui manque — ses bindings, ses labels, ou les deux, leur liste au survol — et un seul bouton qui
//     le prépare (`runRepoSetup`) : le chef ne voit ni ne tape jamais la commande d'init du plugin ;
//   - en cours : une phrase, aucun bouton ;
//   - échoué : une phrase, la raison au survol, et « try again ».
// Préparé, la phrase le dit et le parcours continue, sans quitter l'écran.
// Ce module ne touche pas `document` : il reçoit de quoi créer un élément (briques.js), et rend un élément.

import { boutonAction, survol } from "../briques.js";
import { ligneErreur } from "../composants/ligne-erreur/ligne-erreur.js";
import { REESSAYER } from "../lexique.js";

/** @typedef {import("../briques.js").Fabrique} Fabrique */
/**
 * Ce que la vérification et la préparation rendent : prêt, ou ce qui manque — une liste de noms, ou un oui.
 * @typedef {{ ready: boolean, missingBindings?: readonly string[] | boolean, missingLabels?: readonly string[] | boolean }} EtatDuDepot
 */

export const VERIFICATION = (/** @type {string} */ depot) => `Checking that ${depot} is set up for brigade…`;
export const PRET = (/** @type {string} */ depot) => `${depot} is set up for brigade.`;
export const PREPARE = (/** @type {string} */ depot) => `${depot} is now set up for brigade.`;
export const PREPARER = "set it up";
export const EN_COURS = (/** @type {string} */ depot) => `Setting up ${depot} for brigade…`;
export const ECHEC = (/** @type {string} */ depot) => `${depot} could not be set up.`;
export const ILLISIBLE = (/** @type {string} */ depot) => `${depot} could not be checked.`;
export { REESSAYER };

// Ce qui manque, dit d'un mot : ses bindings, ses labels — ou rien. Une liste vide ne manque pas.
/** @param {readonly string[] | boolean | undefined} manque */
function manque(manque) {
  return Array.isArray(manque) ? manque.length > 0 : manque === true;
}

// La phrase d'un dépôt pas prêt : exactement ce qui lui manque.
/** @param {string} depot @param {EtatDuDepot} etat */
export function manqueDit(depot, etat) {
  const bindings = manque(etat.missingBindings);
  const labels = manque(etat.missingLabels);
  const quoi = bindings && labels ? "its bindings and labels are missing" : bindings ? "its bindings are missing" : labels ? "its labels are missing" : "it is not set up";
  return `${depot} is not set up for brigade: ${quoi}.`;
}

// Le détail au survol : les noms qui manquent, quand la vérification les donne.
/** @param {EtatDuDepot} etat */
function detailDuManque(etat) {
  return [
    ["bindings", etat.missingBindings],
    ["labels", etat.missingLabels],
  ]
    .flatMap(([quoi, noms]) => (Array.isArray(noms) && noms.length > 0 ? [`missing ${quoi}: ${noms.join(", ")}`] : []))
    .join(" — ");
}

/** @param {unknown} erreur */
function raison(erreur) {
  return erreur instanceof Error ? erreur.message : String(erreur ?? "");
}

// Le bloc. `verifier(depot)` et `installer(depot)` : le contrat du runtime ; `continuer()` : le dépôt est prêt, le
// parcours reprend où il allait. Le bloc tient son état dans `data-etat` : verification, pret, a-installer, en-cours,
// echec.
/**
 * @param {Fabrique} doc
 * @param {{ depot: string, verifier: (depot: string) => Promise<EtatDuDepot>, installer: (depot: string) => Promise<EtatDuDepot>, continuer: () => void }} donnees
 */
export function poserInstallationDuDepot(doc, { depot, verifier, installer, continuer }) {
  const racine = doc.createElement("div");
  racine.className = "installation-du-depot";
  racine.role = "status";
  racine.ariaLive = "polite";

  /** @param {string} etat @param {string} phrase @param {{ detail?: string, bouton?: { libelle: string, geste: () => void } }} [suite] */
  const montrer = (etat, phrase, { detail = "", bouton } = {}) => {
    racine.dataset.etat = etat;
    /** @type {any} */
    let dit;
    if (etat === "echec") dit = ligneErreur(doc, phrase, detail, { classe: "dit" });
    else {
      dit = doc.createElement("p");
      dit.className = "dit";
      const texte = doc.createElement("span");
      texte.textContent = phrase;
      dit.append(texte);
      if (detail.trim() !== "") dit.append(survol(doc, detail));
    }
    racine.replaceChildren(dit);
    if (bouton !== undefined) racine.append(boutonAction(doc, bouton.libelle, bouton.geste, { recommande: true }));
  };

  /** @param {EtatDuDepot} etat @param {string} phrase */
  const conclure = (etat, phrase) => {
    if (etat.ready) {
      montrer("pret", phrase);
      continuer();
    } else montrer("a-installer", manqueDit(depot, etat), { detail: detailDuManque(etat), bouton: { libelle: PREPARER, geste: () => void preparer() } });
  };

  const verifierLeDepot = async () => {
    montrer("verification", VERIFICATION(depot));
    try {
      conclure(await verifier(depot), PRET(depot));
    } catch (erreur) {
      montrer("echec", ILLISIBLE(depot), { detail: raison(erreur), bouton: { libelle: REESSAYER, geste: () => void verifierLeDepot() } });
    }
  };

  let enCours = false;
  const preparer = async () => {
    if (enCours) return;
    enCours = true;
    montrer("en-cours", EN_COURS(depot));
    try {
      conclure(await installer(depot), PREPARE(depot));
    } catch (erreur) {
      montrer("echec", ECHEC(depot), { detail: raison(erreur), bouton: { libelle: REESSAYER, geste: () => void preparer() } });
    } finally {
      enCours = false;
    }
  };

  void verifierLeDepot();
  return racine;
}
