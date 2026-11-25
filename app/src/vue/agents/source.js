// @ts-check
// D'où viennent les agents de l'onglet Agents (ticket 4117) : un seul petit module, par lequel la vue lit tous les
// agents du projet et règle l'un de leurs réglages, à chaud. Le process principal les lit là où la cuisine du projet
// tourne, par les commandes du runtime qui existent (agents-box.ts, par les gestes `lireLesAgentsDuProjet` et
// `reglerUnAgent` du pont) : la vue n'en lit rien d'autre.
// La vue appelle chaque méthode par l'objet `source`, à chaque usage : la vraie source s'y branche, un test y pose un faux.
// Une lecture qui ne rend rien (un pont qui ne porte pas le geste : le téléphone) ne pose aucun agent ; une lecture ou un
// réglage qui échoue rejette, avec la phrase du process principal, son détail au survol.

/**
 * Un réglage d'un agent. `options` : ce que le chef choisit, un bouton chacun ; sans elles, ou avec `editable: false`, le
 * réglage ne se change pas d'ici et `livesIn` dit où il vit. `changedAt` et `changedBy` : quand et par qui il a été changé
 * pour la dernière fois, quand le runtime le sait.
 * @typedef {{ key: string, label: string, value: string, options?: string[], editable: boolean, livesIn?: string, from?: string, changedAt?: string, changedBy?: string }} Reglage
 */
/**
 * Un chiffre : ce qu'il compte, sa valeur, et ce qu'il veut dire — aucun chiffre ne se montre sans son sens.
 * @typedef {{ label: string, value: string, meaning: string }} Chiffre
 */
/**
 * Un agent, tel que le process principal le rend : à quoi il sert en une phrase, son état et sa prochaine passe, ses
 * chiffres des sept derniers jours, ceux de ce qu'il voit en ce moment, ses réglages et ses derniers gestes. Un geste du
 * fil dit sa ligne, sa raison et son issue ; une raison ou une issue que le runtime ne tient pas est vide, et la vue ne
 * l'invente pas.
 * @typedef {{
 *   agent: string,
 *   role: string,
 *   state: string,
 *   nextRun: { text: string, at: string | null },
 *   week: Chiffre[],
 *   now?: Chiffre[],
 *   settings: Reglage[],
 *   gestures: { at: string, line: string, reason: string, outcome: string }[],
 * }} Agent
 */

const SANS_LE_GESTE = "the app does not take this gesture on this device";

export const source = {
  // Les agents du projet ; null quand cet appareil ne les lit pas.
  /** @param {string} projet @returns {Promise<unknown[] | null>} */
  lire: async (projet) => {
    if (window.brigade.lireLesAgentsDuProjet === undefined) return null;
    const lus = await window.brigade.lireLesAgentsDuProjet(projet);
    if (Array.isArray(lus)) return lus;
    throw Object.assign(new Error(lus?.sans ?? "its reading gave no answer"), { detail: lus?.detail });
  },
  // Change un réglage d'un agent, à chaud ; rejette avec la raison quand il ne change pas.
  /** @param {string} agent @param {string} cle @param {string} valeur @param {string} projet @returns {Promise<void>} */
  regler: async (agent, cle, valeur, projet) => {
    if (window.brigade.reglerUnAgent === undefined) throw new Error(SANS_LE_GESTE);
    const rendu = await window.brigade.reglerUnAgent(projet, agent, cle, valeur);
    if (rendu.ok !== true) throw Object.assign(new Error(rendu.reason), { detail: rendu.detail });
  },
};
