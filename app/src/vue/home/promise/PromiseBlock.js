// @ts-check
// La promesse en tête de l'accueil (ticket 3219) : une phrase, ce qu'elle veut dire en une ligne, la gratuité, puis les mots
// de la cuisine — rail, cook, pass, second — chacun expliqué en clair à sa première apparition. Le même texte ouvre le
// README et la page du site : si l'un change, les trois changent. Ce qu'il dit se change ici, sans toucher à l'assemblage
// de l'accueil dans vue.js.
//
// Il ne touche pas `document` : la vue lui donne une fabrique (bricks.js).

/** @typedef {import("../../bricks.js").Fabrique} Fabrique */

export const PROMISE = "You decide. The kitchen ships.";
export const MEANING = "You write the ticket, a cook takes it, the pass merges it: you are called only for product choices.";
export const FREE = "Open source, free, no Brigade account — just GitHub and your Claude subscription.";
/** @type {readonly (readonly [string, string])[]} */
export const WORDS = [
  ["rail", "the line of your tickets, from queued to served"],
  ["cook", "a Claude session that takes one ticket and opens its pull request"],
  ["pass", "the check that judges a pull request (gates, CI, review) and merges it"],
  ["second", "your product assistant, who helps you write the tickets"],
];

/** @param {Fabrique} doc */
export function setBlockOfThePromise(doc) {
  const root = doc.createElement("section");
  root.id = "accueil-promesse";
  root.className = "bloc-de-l-accueil";
  root.ariaLabel = PROMISE;
  const title = doc.createElement("h1");
  title.textContent = PROMISE;
  const meaning = doc.createElement("p");
  meaning.textContent = MEANING;
  const free = doc.createElement("p");
  free.textContent = FREE;
  const words = doc.createElement("ul");
  for (const [word, meaning] of WORDS) {
    const line = doc.createElement("li");
    const gras = doc.createElement("strong");
    gras.textContent = word;
    line.append(gras, ` — ${meaning}`);
    words.append(line);
  }
  root.append(title, meaning, free, words);
  return root;
}
