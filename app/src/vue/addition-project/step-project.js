// @ts-check
// L'étape « projet » du parcours d'ajout (ticket 2476, épique 2473) : le chef choisit le dépôt à
// ajouter parmi ceux de son compte et de ses organisations — `gh api /user/repos` les rend tous —,
// filtrés par un champ de recherche, ou colle une URL GitHub ou `owner/repo` : n'importe quel dépôt,
// y compris public et qui n'est pas à lui. Choisi ou résolu, le dépôt est ajouté et le parcours passe
// à la suite. Ce qui n'est pas un dépôt se dit en une phrase, et rien n'est ajouté.
// Tout est lu par le process principal : ce module reçoit `resoudre` et `ajouter`, ne touche pas
// `document` — il reçoit de quoi créer un élément (bricks.js) — et rend des éléments.


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


