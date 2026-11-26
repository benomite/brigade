// @ts-check
// Par où le savoir-faire du projet passe (ticket 4241) : un seul petit module, par lequel la vue lit les entrées
// `{ id, text, ticket }` (le ticket d'où chacune est née), en réécrit une ou en retire une. Le process principal lance la
// commande du runtime `know-how` là où la cuisine du projet tourne (know-how-box.ts, par les gestes du pont). Chaque
// méthode rend ce qu'elle a fait, ou lève une `Error` dont le message est la ligne à dire et `detail` ce que la box a
// répondu : un pont qui ne porte pas ces gestes (le téléphone), un refus, une réponse qui n'arrive pas.
// La vue appelle les méthodes par l'objet `source`, à chaque usage : la vraie source s'y branche, un test y pose un faux.

import { NON_ATTEINT } from "../lexique.js";

/** @typedef {{ id: string, text: string, ticket: number }} Entree */

const SANS_LE_ACTION = "the know-how cannot be read here: this app does not carry it";

/** @param {string} line @param {string} [detail] */
const failure = (line, detail) => Object.assign(new Error(line), { detail: detail ?? "" });

/**
 * Le geste du pont, joué : sa réponse, sans le refus — levé, comme ce qui n'arrive pas.
 * @template {object} R @param {(() => Promise<R | { refus: string, detail?: string }>) | undefined} action @returns {Promise<R>}
 */
async function jouer(action) {
  if (action === undefined) throw failure(SANS_LE_ACTION);
  let rendu;
  try {
    rendu = await action();
  } catch (error) {
    throw failure(NON_ATTEINT("the kitchen"), String(error));
  }
  if ("refus" in rendu) throw failure(rendu.refus, rendu.detail);
  return rendu;
}

export const source = {
  /** @param {string} project @returns {Promise<Entree[]>} */
  lire: async (project) => {
    const lire = window.brigade.lireLeSavoirFaire;
    return (await jouer(lire && (() => lire(project)))).entries;
  },
  /** @param {string} id @param {string} texte @param {string} project @returns {Promise<void>} */
  modifier: async (id, texte, project) => {
    const modifier = window.brigade.modifierLeSavoirFaire;
    await jouer(modifier && (() => modifier(project, id, texte)));
  },
  /** @param {string} id @param {string} project @returns {Promise<void>} */
  retirer: async (id, project) => {
    const retirer = window.brigade.retirerDuSavoirFaire;
    await jouer(retirer && (() => retirer(project, id)));
  },
};
