// @ts-check
// D'où viennent les agents d'un projet (ticket 4029, épique 4024) : un seul petit module, par lequel la vue lit l'équipe,
// règle le niveau d'autonomie d'un agent et approuve un geste en attente. Le runtime publie un enregistrement par agent
// (manager, supervisor, closer, pass, chaque cook) ; un autre ticket le construit, et le process principal le passera par
// le pont (`lireLesAgents`, `reglerLAutonomie`, `approuverLeGeste`, bridge.d.ts). Tant que le pont ne les porte pas, la
// lecture ne rend rien — la vue ne pose alors aucune équipe —, et un geste rejette en le disant.
// La vue appelle chaque méthode par l'objet `source`, à chaque usage : la vraie source s'y branche, un test y pose un faux.

/** @typedef {"observe" | "propose" | "act"} Level */
/**
 * Un agent, tel que le runtime le publie : son état, son dernier geste et quand, sa prochaine passe dite par le runtime,
 * son fil, son niveau d'autonomie, ses deux compteurs, ses derniers gestes, et ceux qui attendent l'OK du chef.
 * @typedef {{
 *   agent: string,
 *   state: string,
 *   lastGesture: { line: string, at: string },
 *   nextRun: { text: string, at: string },
 *   thread: string,
 *   autonomy: Level,
 *   counters: { fixedBySelf: number, handedToChef: number },
 *   progress?: { toward: "act", done: number, of: number } | null,
 *   pinned?: boolean,
 *   gestures: { at: string, line: string, reason: string, outcome: string }[],
 *   pending: { id: string, line: string }[],
 * }} Agent
 */

const WITHOUT_THE_ACTION = "the app does not take this gesture yet";

export const source = {
  // Les agents du projet : la nouvelle cuisine n'en publie aucun enregistrement (ticket 4569), rien ne se lit.
  /** @param {string} _project @returns {Promise<unknown[] | null>} */
  lire: async (_project) => null,
  /** @param {string} agent @param {Level} level @param {string} project @returns {Promise<void>} */
  regler: async (agent, level, project) => {
    if (window.brigade.reglerLAutonomie === undefined) throw new Error(WITHOUT_THE_ACTION);
    await window.brigade.reglerLAutonomie(project, agent, level);
  },
  /** @param {string} agent @param {string} id @param {string} project @returns {Promise<void>} */
  approuver: async (agent, id, project) => {
    if (window.brigade.approuverLeGeste === undefined) throw new Error(WITHOUT_THE_ACTION);
    await window.brigade.approuverLeGeste(project, agent, id);
  },
};
