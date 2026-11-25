// @ts-check
// Par où le savoir-faire du projet passe (ticket 4241) : un seul petit module, par lequel la vue lit les entrées
// `{ id, text, ticket }` (le ticket d'où chacune est née), en réécrit une ou en retire une. Le process principal lance la
// commande du runtime `know-how` là où la cuisine du projet tourne (savoir-faire-box.ts, par les gestes du pont). Chaque
// méthode rend ce qu'elle a fait, ou lève une `Error` dont le message est la ligne à dire et `detail` ce que la box a
// répondu : un pont qui ne porte pas ces gestes (le téléphone), un refus, une réponse qui n'arrive pas.
// La vue appelle les méthodes par l'objet `source`, à chaque usage : la vraie source s'y branche, un test y pose un faux.

import { NON_ATTEINT } from "../lexique.js";

/** @typedef {{ id: string, text: string, ticket: number }} Entree */

const SANS_LE_GESTE = "the know-how cannot be read here: this app does not carry it";

/** @param {string} ligne @param {string} [detail] */
const echec = (ligne, detail) => Object.assign(new Error(ligne), { detail: detail ?? "" });

/**
 * Le geste du pont, joué : sa réponse, sans le refus — levé, comme ce qui n'arrive pas.
 * @template {object} R @param {(() => Promise<R | { refus: string, detail?: string }>) | undefined} geste @returns {Promise<R>}
 */
async function jouer(geste) {
  if (geste === undefined) throw echec(SANS_LE_GESTE);
  let rendu;
  try {
    rendu = await geste();
  } catch (erreur) {
    throw echec(NON_ATTEINT("the kitchen"), String(erreur));
  }
  if ("refus" in rendu) throw echec(rendu.refus, rendu.detail);
  return rendu;
}

export const source = {
  /** @param {string} projet @returns {Promise<Entree[]>} */
  lire: async (projet) => {
    const lire = window.brigade.lireLeSavoirFaire;
    return (await jouer(lire && (() => lire(projet)))).entries;
  },
  /** @param {string} id @param {string} texte @param {string} projet @returns {Promise<void>} */
  modifier: async (id, texte, projet) => {
    const modifier = window.brigade.modifierLeSavoirFaire;
    await jouer(modifier && (() => modifier(projet, id, texte)));
  },
  /** @param {string} id @param {string} projet @returns {Promise<void>} */
  retirer: async (id, projet) => {
    const retirer = window.brigade.retirerDuSavoirFaire;
    await jouer(retirer && (() => retirer(projet, id)));
  },
};
