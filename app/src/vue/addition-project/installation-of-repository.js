// @ts-check
// Le dépôt choisi dans le parcours d'ajout est-il prêt pour brigade (ticket 2627, épique 2584) ? Dès que le chef le
// choisit, le parcours le vérifie (`checkRepoSetup`) et le dit en une phrase :
//   - prêt : la phrase, et le parcours continue comme avant, sans geste de plus ;
//   - pas prêt : ce qui manque — ses bindings, ses labels, ou les deux, leur liste au survol — et un seul bouton qui
//     le prépare (`runRepoSetup`) : le chef ne voit ni ne tape jamais la commande d'init du plugin ;
//   - en cours : une phrase, aucun bouton ;
//   - échoué : une phrase, la raison au survol, et « try again ».
// Préparé, la phrase le dit et le parcours continue, sans quitter l'écran.
// Ce module ne touche pas `document` : il reçoit de quoi créer un élément (bricks.js), et rend un élément.

import { buttonAction, hover } from "../bricks.js";
import { lineError } from "../components/line-error/line-error.js";
import { RETRY } from "../lexicon.js";

/** @typedef {import("../bricks.js").Fabrique} Fabrique */
/**
 * Ce que la vérification et la préparation rendent : prêt, ou ce qui manque — une liste de noms, ou un oui.
 * @typedef {{ ready: boolean, missingBindings?: readonly string[] | boolean, missingLabels?: readonly string[] | boolean }} StateOfRepository
 */

export const VERIFICATION = (/** @type {string} */ repository) => `Checking that ${repository} is set up for brigade…`;
export const READY = (/** @type {string} */ repository) => `${repository} is set up for brigade.`;
export const PREPARE = (/** @type {string} */ repository) => `${repository} is now set up for brigade.`;
export const PREPARE_LABEL = "set it up";
export const IN_PROGRESS = (/** @type {string} */ repository) => `Setting up ${repository} for brigade…`;
export const FAILURE = (/** @type {string} */ repository) => `${repository} could not be set up.`;
export const UNREADABLE = (/** @type {string} */ repository) => `${repository} could not be checked.`;
export { RETRY };

// Ce qui manque, dit d'un mot : ses bindings, ses labels — ou rien. Une liste vide ne manque pas.
/** @param {readonly string[] | boolean | undefined} lack */
function lack(lack) {
  return Array.isArray(lack) ? lack.length > 0 : lack === true;
}

// La phrase d'un dépôt pas prêt : exactement ce qui lui manque.
/** @param {string} repository @param {StateOfRepository} state */
export function missingSays(repository, state) {
  const bindings = lack(state.missingBindings);
  const labels = lack(state.missingLabels);
  const what = bindings && labels ? "its bindings and labels are missing" : bindings ? "its bindings are missing" : labels ? "its labels are missing" : "it is not set up";
  return `${repository} is not set up for brigade: ${what}.`;
}

// Le détail au survol : les noms qui manquent, quand la vérification les donne.
/** @param {StateOfRepository} state */
function detailOfMissing(state) {
  return [
    ["bindings", state.missingBindings],
    ["labels", state.missingLabels],
  ]
    .flatMap(([what, names]) => (Array.isArray(names) && names.length > 0 ? [`missing ${what}: ${names.join(", ")}`] : []))
    .join(" — ");
}

/** @param {unknown} error */
function reason(error) {
  return error instanceof Error ? error.message : String(error ?? "");
}

// Le bloc. `verifier(depot)` et `installer(depot)` : le contrat du runtime ; `continuer()` : le dépôt est prêt, le
// parcours reprend où il allait. Le bloc tient son état dans `data-etat` : verification, pret, a-installer, en-cours,
// echec.
/**
 * @param {Fabrique} doc
 * @param {{ depot: string, verifier: (repository: string) => Promise<StateOfRepository>, installer: (repository: string) => Promise<StateOfRepository>, continuer: () => void }} donnees
 */
export function setInstallationOfRepository(doc, { depot: repository, verifier: check, installer, continuer: proceed }) {
  const root = doc.createElement("div");
  root.className = "installation-du-depot";
  root.role = "status";
  root.ariaLive = "polite";

  /** @param {string} state @param {string} sentence @param {{ detail?: string, bouton?: { libelle: string, geste: () => void } }} [suite] */
  const show = (state, sentence, { detail = "", bouton: button } = {}) => {
    root.dataset.etat = state;
    /** @type {any} */
    let said;
    if (state === "echec") said = lineError(doc, sentence, detail, { classe: "dit" });
    else {
      said = doc.createElement("p");
      said.className = "dit";
      const text = doc.createElement("span");
      text.textContent = sentence;
      said.append(text);
      if (detail.trim() !== "") said.append(hover(doc, detail));
    }
    root.replaceChildren(said);
    if (button !== undefined) root.append(buttonAction(doc, button.libelle, button.geste, { recommande: true }));
  };

  /** @param {StateOfRepository} state @param {string} sentence */
  const conclude = (state, sentence) => {
    if (state.ready) {
      show("pret", sentence);
      proceed();
    } else show("a-installer", missingSays(repository, state), { detail: detailOfMissing(state), bouton: { libelle: PREPARE_LABEL, geste: () => void prepare() } });
  };

  const checkTheRepository = async () => {
    show("verification", VERIFICATION(repository));
    try {
      conclude(await check(repository), READY(repository));
    } catch (error) {
      show("echec", UNREADABLE(repository), { detail: reason(error), bouton: { libelle: RETRY, geste: () => void checkTheRepository() } });
    }
  };

  let inProgress = false;
  const prepare = async () => {
    if (inProgress) return;
    inProgress = true;
    show("en-cours", IN_PROGRESS(repository));
    try {
      conclude(await installer(repository), PREPARE(repository));
    } catch (error) {
      show("echec", FAILURE(repository), { detail: reason(error), bouton: { libelle: RETRY, geste: () => void prepare() } });
    } finally {
      inProgress = false;
    }
  };

  void checkTheRepository();
  return root;
}
