// @ts-check
// Par où le mot au cook part (ticket 4048) : un seul petit module, par lequel la vue appelle la commande du runtime
// `send-word` avec `{ticket, text}`. Le process principal la lance là où la cuisine du projet tourne (word-au-cook-box.ts,
// par le geste `envoyerUnMot` du pont). La réponse est toujours `{ok: true}` ou `{ok: false, reason}` en une ligne : un pont
// qui ne porte pas le geste (le téléphone), ou qui rejette, le dit en une ligne.
// La vue appelle la méthode par l'objet `source`, à chaque usage : la vraie source s'y branche, un test y pose un faux.

import { NON_ATTEINT } from "../lexique.js";

/** @typedef {{ ok: true } | { ok: false, reason: string, detail?: string }} Answer */

const SANS_LE_ACTION = "nothing was sent: this app cannot pass a word to a cook";
const SANS_ANSWER = `${NON_ATTEINT("the kitchen")} The word was not sent.`;

export const source = {
  /** @param {{ ticket: number, text: string }} entree @param {string} project @returns {Promise<Answer>} */
  envoyer: async (entree, project) => {
    if (window.brigade.envoyerUnMot === undefined) return { ok: false, reason: SANS_LE_ACTION };
    try {
      return await window.brigade.envoyerUnMot(project, entree);
    } catch (error) {
      return { ok: false, reason: SANS_ANSWER, detail: String(error) };
    }
  },
};
