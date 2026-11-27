// @ts-check
// La promesse en tête de l'accueil (ticket 3219) : une phrase, ce qu'elle veut dire en une ligne, la gratuité, puis les mots
// de la cuisine — rail, cook, pass, second — chacun expliqué en clair à sa première apparition. Le même texte ouvre le
// README et la page du site : si l'un change, les trois changent. Ce qu'il dit se change ici, sans toucher à l'assemblage
// de l'accueil dans vue.js.
//
// Il ne touche pas `document` : la vue lui donne une fabrique (briques.js).

/** @typedef {import("../../briques.js").Fabrique} Fabrique */

export const PROMESSE = "You decide. The kitchen ships.";
export const SENS = "You write the ticket, a cook takes it, the pass merges it: you are called only for product choices.";
export const GRATUIT = "Open source, free, no Brigade account — just GitHub and your Claude subscription.";
/** @type {readonly (readonly [string, string])[]} */
export const MOTS = [
  ["rail", "the line of your tickets, from queued to served"],
  ["cook", "a Claude session that takes one ticket and opens its pull request"],
  ["pass", "the check that judges a pull request (gates, CI, review) and merges it"],
  ["second", "your product assistant, who helps you write the tickets"],
];

/** @param {Fabrique} doc */
export function poserBlocDeLaPromesse(doc) {
  const racine = doc.createElement("section");
  racine.id = "accueil-promesse";
  racine.className = "bloc-de-l-accueil";
  racine.ariaLabel = PROMESSE;
  const titre = doc.createElement("h1");
  titre.textContent = PROMESSE;
  const sens = doc.createElement("p");
  sens.textContent = SENS;
  const gratuit = doc.createElement("p");
  gratuit.textContent = GRATUIT;
  const mots = doc.createElement("ul");
  for (const [mot, sens] of MOTS) {
    const ligne = doc.createElement("li");
    const gras = doc.createElement("strong");
    gras.textContent = mot;
    ligne.append(gras, ` — ${sens}`);
    mots.append(ligne);
  }
  racine.append(titre, sens, gratuit, mots);
  return racine;
}
