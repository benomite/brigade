// @ts-check
// D'où l'onglet Agents tient ses données (ticket 4224, épique 4117) : l'API des agents du runtime, telle que ses deux tickets
// la servent (ticket 4220 : `GET /api/agents`, `GET /api/agents/:id/gestures` ; ticket 4222 : `GET` et `PUT
// /api/agents/:id/settings`).
// La vue n'appelle que `source.demander`, par l'objet, à chaque usage : le process principal la passe par le pont
// (`apiDesAgents`, pont.d.ts), un test y pose un faux de l'API. La demande est écrite comme la route : « GET /api/agents »,
// « PUT /api/agents/closer/settings » et son corps `{ key, value }`. La réponse est `{ statut, corps }`, comme le runtime la
// rend. Tant que le pont ne porte pas `apiDesAgents`, la demande rend null : l'onglet dit que les agents ne sont pas lus,
// il n'invente rien.

/** @typedef {{ statut: number, corps: unknown }} Reponse */

export const source = {
  /**
   * @param {string} demande la méthode et le chemin, « GET /api/agents »
   * @param {string} projet
   * @param {{ key: string, value: unknown }} [corps] le corps d'un PUT
   * @returns {Promise<Reponse | null>}
   */
  demander: async (demande, projet, corps) => {
    const rendue = await window.brigade.apiDesAgents?.(demande, projet, corps);
    return rendue ?? null;
  },
};
