// @ts-check
// Where the Agents tab's agents come from (ticket 4569): the bridge's `agentsAtWork`, which the main process answers from GitHub
// (the board's `taken` and `in-pass` tickets) and from what the kitchen writes on its station. The view calls it through the
// `source` object at each use: a test puts a fake in its place.

/** @typedef {{ agent: string, ticket: number | null, since: string | null, station: string | null }} AgentAtWork */
/** @typedef {{ agents: AgentAtWork[], stations: { station: string, why: string }[] }} AgentsAtWork */

export const source = {
  /** @param {string} project @returns {Promise<unknown>} */
  lire: async (project) => {
    if (window.brigade.agentsAtWork === undefined) throw new Error("the app does not read the agents here");
    return window.brigade.agentsAtWork(project);
  },
};
