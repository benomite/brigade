// @ts-check
// Donner le projet à une station depuis son onglet Stations (ticket 2487, épique 2484), sans passer par l'accueil : le
// choix « Choose who cooks it » de l'onglet (stations-tab/, ticket 3195). Cet ordinateur y est le premier choix ; puis les
// stations appairées du compte à qui le projet n'est pas encore choisi. Chaque choix est un geste que l'app fait déjà : cet
// ordinateur ajoute le projet à la liste de sa station (`servirUnProjet`, la configuration de la station, ticket 3402) ;
// une station appairée le reçoit dans sa sélection comme la case de sa page sur l'accueil (`choisirLesProjets`,
// stations-of-account.js). « Add a station » l'ouvre aussi quand d'autres le cuisent déjà.
//
// `tenirLAjoutDeStation` garde l'état du choix et ses gestes ; l'onglet le dessine (stations-tab/choice.js). Ce module ne
// touche pas `document`.


/** @typedef {import("../../projects-served/projects-served.js").ReadOfProjectsServed} ReadOfProjectsServed */
// L'état du parcours, pour un projet. `ouvert` : l'étape est posée. `enCours` : le choix qui s'écrit — `ICI`, ou l'id
// de la station appairée —, les boutons attendent. `refus` : pourquoi le dernier choix n'a rien écrit. `fait` : le nom
// de la machine qui vient de recevoir le projet ; `absente` : elle était hors ligne, elle le prend à son retour (ticket 3187) ;
// `ici` : c'est cet ordinateur, dont la liste vient de s'écrire — sa carte est déjà là (ticket 3402).
/** @typedef {{ ouvert: boolean, enCours?: string, refus?: { ligne: string, detail: string }, fait?: string, absente?: true, ici?: true }} StateOfTheAddition */
// Ce que l'étape propose. `ici` : le nom que l'écran donne à cet ordinateur ; `iciOffert` : sa station peut recevoir le
// projet — elle existe, et ne le sert pas déjà. `stations` : les stations appairées à proposer (`stationsAProposer`).
/** @typedef {{ projet: string, ici: string, iciOffert: boolean }} DataOfTheStep */
/** @typedef {{ servirIci: () => void, annuler: () => void }} ActionsOfTheStep */

// La clé du choix de cet ordinateur : celle du choix de station (stations-tab/choice.js).
export const HERE = "ici";
export const DONE_HERE = (/** @type {string} */ name, /** @type {string} */ project) => `${name} now serves ${project}.`;
// La station de cet ordinateur a répondu sans garder le dépôt dans sa liste.
export const NOT_GUARD = (/** @type {string} */ here, /** @type {string} */ repository) => `${here}'s station did not keep ${repository} in the projects it serves`;
// Ce que la ligne dit du choix écrit : la station hors ligne le prend à son retour (choix-station/).
/** @param {StateOfTheAddition} etat @param {string} project */
export const DONE_SAYS = ({ fait: done = "" }, project) => DONE_HERE(done, project);

// L'état du parcours et ses gestes. `servirIci(depot)` : la station de cet ordinateur sert le dépôt. `rendre` : l'état a changé, l'onglet se redessine. Un seul
// projet à la fois : en ouvrir un autre referme le précédent.
/**
 * @param {{
 *   servirIci: (repository: string) => Promise<ReadOfProjectsServed>,
 *   rendre: () => void,
 * }} options
 */
export function holdTheAdditionOfStation({ servirIci: serveHere, rendre: render }) {
  let project = "";
  /** @type {StateOfTheAddition} */
  let state = { ouvert: false };

  /** @param {string} forIt @param {StateOfTheAddition} fresh */
  const set = (forIt, fresh) => {
    project = forIt;
    state = fresh;
    render();
  };
  // Un choix à la fois : tant qu'il s'écrit, les autres attendent. Écrit, l'étape se referme et dit qui a reçu le projet.
  /** @param {string} forIt @param {string} key @param {string} name @param {() => Promise<{ refus: string, detail?: string } | object>} write @param {boolean} [absent] */
  const choice = (forIt, key, name, write, absent = false) => {
    if (project !== forIt || !state.ouvert || state.enCours !== undefined) return;
    set(forIt, { ouvert: true, enCours: key });
    void write()
      .catch((error) => ({ refus: "the app failed while saving", detail: error instanceof Error ? error.message : String(error) }))
      .then((rendered) => {
        if (project !== forIt) return;
        if ("refus" in rendered) {
          const [line = rendered.refus, ...suite] = rendered.refus.replace(/^brigade: /, "").split(" — ");
          return set(forIt, { ouvert: true, refus: { ligne: `nothing was written: ${line.replace(/^not saved: /, "")}`, detail: [...suite, ...("detail" in rendered && rendered.detail !== undefined ? [rendered.detail] : [])].join(" — ") } });
        }
        set(forIt, { ouvert: false, fait: name, ...(absent ? { absente: /** @type {const} */ (true) } : {}), ...(key === HERE ? { ici: /** @type {const} */ (true) } : {}) });
      });
  };

  return {
    /** @param {string} forIt @returns {StateOfTheAddition} */
    etatDe: (forIt) => (forIt === project ? state : { ouvert: false }),
    /** @param {string} forIt */
    ouvrir: (forIt) => set(forIt, { ouvert: true }),
    /** @param {string} forIt */
    annuler: (forIt) => {
      if (forIt === project && state.enCours === undefined) set(forIt, { ouvert: false });
    },
    // Relue, la liste que la station rend dit si elle le sert : sans lui, rien n'est dit fait (ticket 3402).
    /** @param {string} forIt @param {string} repository @param {string} here */
    servirIci: (forIt, repository, here) =>
      choice(forIt, HERE, here, async () => {
        const rendered = await serveHere(repository);
        return "depots" in rendered && !rendered.depots.some((served) => served.toLowerCase() === repository.toLowerCase()) ? { refus: NOT_GUARD(here, repository) } : rendered;
      }),
  };
}
