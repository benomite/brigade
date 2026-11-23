// @ts-check
// Par où le mot au cook part (ticket 4048) : un seul petit module, par lequel la vue appelle la commande du runtime
// `send-word` avec `{ticket, text}`. Le process principal la lance là où la cuisine du projet tourne (mot-au-cook-box.ts,
// par le geste `envoyerUnMot` du pont). La réponse est toujours `{ok: true}` ou `{ok: false, reason}` en une ligne : un pont
// qui ne porte pas le geste (le téléphone), ou qui rejette, le dit en une ligne.
// La vue appelle la méthode par l'objet `source`, à chaque usage : la vraie source s'y branche, un test y pose un faux.

import { NON_ATTEINT } from "../lexique.js";

/** @typedef {{ ok: true } | { ok: false, reason: string, detail?: string }} Reponse */

export const SANS_LE_GESTE = "nothing was sent: this app cannot pass a word to a cook";
export const SANS_REPONSE = `${NON_ATTEINT("the kitchen")} The word was not sent.`;

export const source = {
  /** @param {{ ticket: number, text: string }} entree @param {string} projet @returns {Promise<Reponse>} */
  envoyer: async (entree, projet) => {
    if (window.brigade.envoyerUnMot === undefined) return { ok: false, reason: SANS_LE_GESTE };
    try {
      return await window.brigade.envoyerUnMot(projet, entree);
    } catch (erreur) {
      return { ok: false, reason: SANS_REPONSE, detail: String(erreur) };
    }
  },
};
