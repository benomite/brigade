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

import { buttonAction, survol } from "../briques.js";
import { lineError } from "../composants/line-error/line-error.js";
import { REESSAYER } from "../lexique.js";

/** @typedef {import("../briques.js").Fabrique} Fabrique */
/**
 * Ce que la vérification et la préparation rendent : prêt, ou ce qui manque — une liste de noms, ou un oui.
 * @typedef {{ ready: boolean, missingBindings?: readonly string[] | boolean, missingLabels?: readonly string[] | boolean }} StateDuRepository
 */

export const VERIFICATION = (/** @type {string} */ repository) => `Checking that ${repository} is set up for brigade…`;
export const PRET = (/** @type {string} */ repository) => `${repository} is set up for brigade.`;
export const PREPARE = (/** @type {string} */ repository) => `${repository} is now set up for brigade.`;
export const PREPARER = "set it up";
export const EN_COURS = (/** @type {string} */ repository) => `Setting up ${repository} for brigade…`;
export const FAILURE = (/** @type {string} */ repository) => `${repository} could not be set up.`;
export const ILLISIBLE = (/** @type {string} */ repository) => `${repository} could not be checked.`;
export { REESSAYER };

// Ce qui manque, dit d'un mot : ses bindings, ses labels — ou rien. Une liste vide ne manque pas.
/** @param {readonly string[] | boolean | undefined} manque */
function manque(manque) {
  return Array.isArray(manque) ? manque.length > 0 : manque === true;
}

// La phrase d'un dépôt pas prêt : exactement ce qui lui manque.
/** @param {string} repository @param {StateDuRepository} state */
export function manqueDit(repository, state) {
  const bindings = manque(state.missingBindings);
  const labels = manque(state.missingLabels);
  const quoi = bindings && labels ? "its bindings and labels are missing" : bindings ? "its bindings are missing" : labels ? "its labels are missing" : "it is not set up";
  return `${repository} is not set up for brigade: ${quoi}.`;
}

// Le détail au survol : les noms qui manquent, quand la vérification les donne.
/** @param {StateDuRepository} state */
function detailDuManque(state) {
  return [
    ["bindings", state.missingBindings],
    ["labels", state.missingLabels],
  ]
    .flatMap(([quoi, noms]) => (Array.isArray(noms) && noms.length > 0 ? [`missing ${quoi}: ${noms.join(", ")}`] : []))
    .join(" — ");
}

/** @param {unknown} error */
function raison(error) {
  return error instanceof Error ? error.message : String(error ?? "");
}

// Le bloc. `verifier(depot)` et `installer(depot)` : le contrat du runtime ; `continuer()` : le dépôt est prêt, le
// parcours reprend où il allait. Le bloc tient son état dans `data-etat` : verification, pret, a-installer, en-cours,
// echec.
/**
 * @param {Fabrique} doc
 * @param {{ depot: string, verifier: (repository: string) => Promise<StateDuRepository>, installer: (repository: string) => Promise<StateDuRepository>, continuer: () => void }} donnees
 */
export function poserInstallationDuRepository(doc, { depot: repository, verifier, installer, continuer }) {
  const racine = doc.createElement("div");
  racine.className = "installation-du-depot";
  racine.role = "status";
  racine.ariaLive = "polite";

  /** @param {string} state @param {string} phrase @param {{ detail?: string, bouton?: { libelle: string, geste: () => void } }} [suite] */
  const show = (state, phrase, { detail = "", bouton: button } = {}) => {
    racine.dataset.etat = state;
    /** @type {any} */
    let dit;
    if (state === "echec") dit = lineError(doc, phrase, detail, { classe: "dit" });
    else {
      dit = doc.createElement("p");
      dit.className = "dit";
      const texte = doc.createElement("span");
      texte.textContent = phrase;
      dit.append(texte);
      if (detail.trim() !== "") dit.append(survol(doc, detail));
    }
    racine.replaceChildren(dit);
    if (button !== undefined) racine.append(buttonAction(doc, button.libelle, button.geste, { recommande: true }));
  };

  /** @param {StateDuRepository} state @param {string} phrase */
  const conclure = (state, phrase) => {
    if (state.ready) {
      show("pret", phrase);
      continuer();
    } else show("a-installer", manqueDit(repository, state), { detail: detailDuManque(state), bouton: { libelle: PREPARER, geste: () => void preparer() } });
  };

  const verifierLeRepository = async () => {
    show("verification", VERIFICATION(repository));
    try {
      conclure(await verifier(repository), PRET(repository));
    } catch (error) {
      show("echec", ILLISIBLE(repository), { detail: raison(error), bouton: { libelle: REESSAYER, geste: () => void verifierLeRepository() } });
    }
  };

  let enCours = false;
  const preparer = async () => {
    if (enCours) return;
    enCours = true;
    show("en-cours", EN_COURS(repository));
    try {
      conclure(await installer(repository), PREPARE(repository));
    } catch (error) {
      show("echec", FAILURE(repository), { detail: raison(error), bouton: { libelle: REESSAYER, geste: () => void preparer() } });
    } finally {
      enCours = false;
    }
  };

  void verifierLeRepository();
  return racine;
}
