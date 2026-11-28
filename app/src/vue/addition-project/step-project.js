// @ts-check
// L'étape « projet » du parcours d'ajout (ticket 2476, épique 2473) : le chef choisit le dépôt à
// ajouter parmi ceux de son compte et de ses organisations — `gh api /user/repos` les rend tous —,
// filtrés par un champ de recherche, ou colle une URL GitHub ou `owner/repo` : n'importe quel dépôt,
// y compris public et qui n'est pas à lui. Choisi ou résolu, le dépôt est ajouté et le parcours passe
// à la suite. Ce qui n'est pas un dépôt se dit en une phrase, et rien n'est ajouté.
// Tout est lu par le process principal : ce module reçoit `resoudre` et `ajouter`, ne touche pas
// `document` — il reçoit de quoi créer un élément (bricks.js) — et rend des éléments.

import { setInstallationOfRepository } from "../addition-project/installation-of-repository.js";
import { buttonAction } from "../bricks.js";
import { lineError } from "../components/line-error/line-error.js";
import { NOT_REACHED } from "../lexicon.js";

/** @typedef {import("../bricks.js").Fabrique} Fabrique */
/** @typedef {{ depot: string, base: string }} Repository */
/** @typedef {{ depot: string, base: string } | { refus: string }} Resolved */

export const EXPECTED = "Pick the repository of the project you add, or paste any repository.";
export const SEARCH = "search your repositories";
export const PASTE = "paste a GitHub URL or owner/repo";
export const ADD = "add";
export const NO = "No repository matches.";
export const NOT_ONE_REPOSITORY = "That is not a GitHub repository: paste a URL like https://github.com/owner/repo, or owner/repo.";

const NAME = "[A-Za-z0-9](?:[A-Za-z0-9-]*[A-Za-z0-9])?";
const REPOSITORY = "[A-Za-z0-9._-]+";
const SHAPE = new RegExp(`^(${NAME})/(${REPOSITORY})$`);
const SUFFIX_GIT = /\.git$/;

// Ce que le chef a collé : `owner/repo`, ou une URL de GitHub (https, avec ou sans `www.`, un
// suffixe `.git`, une page du dépôt derrière). Le nom du dépôt, ou rien : ce n'est pas un dépôt.
/** @param {string} text @returns {string | null} */
export function repositoryPastesBy(text) {
  let raw = text.trim();
  const url = /^(?:https?:\/\/)?(?:www\.)?github\.com\/(.*)$/i.exec(raw);
  if (url !== null) raw = (url[1] ?? "").split(/[?#]/)[0]?.split("/").slice(0, 2).join("/") ?? "";
  raw = raw.replace(SUFFIX_GIT, "");
  const shape = SHAPE.exec(raw);
  if (shape === null || shape[2] === "." || shape[2] === "..") return null;
  return `${shape[1]}/${shape[2]}`;
}

// Les dépôts dont le nom contient la recherche, sans égard à la casse ; vide, tous.
/** @param {readonly Repository[]} repositories @param {string} search */
export function filter(repositories, search) {
  const wanted = search.trim().toLowerCase();
  return wanted === "" ? [...repositories] : repositories.filter(({ depot: repository }) => repository.toLowerCase().includes(wanted));
}

/** @param {Fabrique} doc @param {string} balise @param {string} [text] */
function created(doc, balise, text) {
  const pose = doc.createElement(balise);
  if (text !== undefined) pose.textContent = text;
  return pose;
}

// L'étape. `depots` : ceux du compte et de ses organisations, ou `{ refus }` — la lecture a échoué, le
// collage reste possible. `resoudre(depot)` lit un dépôt par son nom. `ajouter(depot)` l'ajoute, et
// rend `{ refus }` s'il ne l'est pas. `suivante()` : le parcours passe à l'étape d'après. `verifier(depot)` et
// `installer(depot)` : le contrat du runtime (`checkRepoSetup`, `runRepoSetup`).
/**
 * @param {Fabrique} doc
 * @param {{
 *   depots: readonly Repository[] | { refus: string },
 *   resoudre: (repository: string) => Promise<Resolved>,
 *   ajouter: (repository: Repository) => Promise<{ refus: string } | void>,
 *   suivante: () => void,
 *   verifier: (repository: string) => Promise<import("../addition-project/installation-of-repository.js").StateOfRepository>,
 *   installer: (repository: string) => Promise<import("../addition-project/installation-of-repository.js").StateOfRepository>,
 * }} donnees
 */
export function setStepProject(doc, { depots: repositories, resoudre: resolve, ajouter: add, suivante: next, verifier: check, installer }) {
  const root = created(doc, "section");
  root.className = "etape-projet";
  root.ariaLabel = "Pick the project";
  const expected = created(doc, "p", EXPECTED);
  expected.className = "attendu";

  const error = lineError(doc, "", "", { classe: "erreur", alerte: true });
  const tell = (/** @type {string} */ line) => {
    error.replaceChildren(...(line === "" ? [] : [created(doc, "span", line)]));
  };

  // Ce que la vérification du dépôt choisi dit, sous l'attendu : prêt, ce qui lui manque, sa préparation.
  const installation = created(doc, "div");
  installation.className = "installation";

  // Un dépôt choisi ou résolu : vérifié, puis ajouté et la suite — prêt d'emblée, sans geste de plus ; pas prêt, le
  // bloc de la vérification attend le chef. Un autre dépôt choisi pendant une vérification prend sa place ; pendant
  // une préparation ou un ajout, il attend : la phrase le dit.
  /** @type {Repository | undefined} */
  let chosen;
  /** @type {HTMLElement | undefined} */
  let block;
  let inProgress = false;
  const busy = () => {
    if (inProgress && chosen !== undefined) return `${chosen.depot} is being added.`;
    if (chosen !== undefined && block?.dataset.etat === "en-cours") return `${chosen.depot} is being set up.`;
    return undefined;
  };
  const adopt = (/** @type {Repository} */ repository) => {
    const wait = busy();
    if (wait !== undefined) return tell(wait);
    chosen = repository;
    tell("");
    block = setInstallationOfRepository(doc, {
      depot: repository.depot,
      verifier: check,
      installer,
      continuer: () => {
        if (chosen === repository) void addTheRepository(repository);
      },
    });
    installation.replaceChildren(block);
  };

  // Le dépôt ajouté, puis la suite ; refusé, la phrase, et rien ne bouge.
  const addTheRepository = async (/** @type {Repository} */ repository) => {
    inProgress = true;
    tell("");
    try {
      const refusal = await add(repository);
      if (refusal !== undefined) tell(refusal.refus);
      else {
        tell("");
        next();
      }
    } catch {
      tell(`${repository.depot} could not be added.`);
    } finally {
      inProgress = false;
    }
  };

  const search = created(doc, "input");
  search.type = "search";
  search.className = "recherche";
  search.ariaLabel = SEARCH;
  search.placeholder = SEARCH;
  const list = created(doc, "ul");
  list.className = "depots";
  const setList = () => {
    if (!Array.isArray(repositories)) return;
    const seenOnes = filter(repositories, search.value ?? "");
    list.replaceChildren(
      ...(seenOnes.length === 0
        ? [Object.assign(created(doc, "li", NO), { className: "aucun" })]
        : seenOnes.map(({ depot: repository, base }) => {
            const line = created(doc, "li");
            line.className = "depot";
            line.dataset.depot = repository;
            line.append(buttonAction(doc, repository, () => void adopt({ depot: repository, base }), {}));
            return line;
          })),
    );
  };
  search.addEventListener("input", setList);
  if ("refus" in repositories) root.append(expected, lineError(doc, NOT_REACHED("repositories"), repositories.refus));
  else {
    setList();
    root.append(expected, search, list);
  }

  const pastes = created(doc, "input");
  pastes.type = "text";
  pastes.className = "colle";
  pastes.ariaLabel = PASTE;
  pastes.placeholder = PASTE;
  const resolveThePaste = async () => {
    const name = repositoryPastesBy(pastes.value ?? "");
    if (name === null) return tell(NOT_ONE_REPOSITORY);
    try {
      const resolved = await resolve(name);
      if ("refus" in resolved) return tell(resolved.refus);
      await adopt(resolved);
    } catch {
      tell(`${name} could not be read on GitHub.`);
    }
  };
  pastes.addEventListener("keydown", (/** @type {{ key: string }} */ event) => {
    if (event.key === "Enter") void resolveThePaste();
  });
  const paste = created(doc, "div");
  paste.className = "coller";
  paste.append(pastes, buttonAction(doc, ADD, () => void resolveThePaste(), { recommande: true }));
  root.append(paste, installation, error);
  return root;
}
