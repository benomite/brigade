// @ts-check
// « Stop cooking here » sur l'onglet Stations d'un projet (ticket 3402) : la station ne sert plus le projet, par le geste
// que l'app a pour elle, puis ce qui en résulte, en une ligne — le projet retiré, ou pourquoi rien n'a changé. Jamais un
// bouton qui s'en va sans rien changer : ce que le geste rend est relu, et un projet encore servi le dit.
//
// Cet ordinateur : sa station n'a qu'une liste, sa configuration, que
// le process principal écrit (`retirerIci`). Si la sélection que l'app tient pour elle sur GitHub le porte aussi, il en
// est d'abord retiré (`choisir`) : sans quoi la station réécrirait sa ligne à sa lecture suivante. Une station du compte :
// sa sélection. Aucun : rien ne part, la ligne dit pourquoi.
//
// Ce module ne touche ni `document` ni le pont : la vue lui donne ce qu'elle a lu et les gestes.

/** @typedef {{ refus: string, detail?: string }} Refusal */
/** @typedef {{ depots: string[] } | Refusal} ListWritten */
/** Ce que la ligne sous le haut de l'onglet dit du geste. @typedef {{ texte: string, refus: boolean, detail: string }} Says */
/**
 * `station` : la carte cliquée — son nom, et si c'est cet ordinateur. `liste` : la liste de la station de cet ordinateur,
 * telle que lue — indéfinie si elle ne l'est pas. `selection` : la sélection que l'app tient sur GitHub pour cette station,
 * si elle en a une (pour cet ordinateur, celle de sa station du compte).
 * @typedef {{
 *   projet: string,
 *   depot: string,
 *   station: { nom: string, ici: boolean },
 *   liste?: readonly string[],
 *   selection?: { id: string, depots: readonly string[] },
 * }} StopRequest
 */
/**
 * @typedef {{
 *   retirerIci(repository: string): Promise<ListWritten>,
 *   choisir(id: string, repositories: string[]): Promise<{ selection: string[] } | Refusal>,
 * }} ActionsOfTheStop
 */

export const WITHOUT_ACTION = (/** @type {string} */ station) => `nothing was changed: the app has no gesture that stops ${station} from here`;
export const STILL_SERVED = (/** @type {string} */ station, /** @type {string} */ project) => `nothing was changed: ${station} still has ${project} in the projects it serves`;
export const REMOVED = (/** @type {string} */ station, /** @type {string} */ project) => `${station} no longer takes ${project}'s tickets`;
export const FAILURE = "the app failed while saving";

const alike = (/** @type {string} */ a, /** @type {string} */ b) => a.toLowerCase() === b.toLowerCase();

/** @param {Refusal} rendered @returns {Says} */
const refusalSays = (rendered) => ({ texte: `nothing was changed: ${String(rendered.refus).replace(/^not saved: /, "").replace(/^brigade: /, "")}`, refus: true, detail: rendered.detail ?? "" });

// Le geste qui arrête la station, ou `undefined` : l'app n'en a aucun pour elle.
/** @param {StopRequest} demande @param {ActionsOfTheStop} actions @returns {{ ecrire: () => Promise<Says> } | undefined} */
export function actionOfStop({ projet: project, depot: repository, station, liste: list, selection }, actions) {
  const chosenOne = selection !== undefined && selection.depots.some((chosen) => alike(chosen, repository)) ? selection : undefined;
  // Retiré de la sélection : rendu tel quel, ou ce qui l'a refusé.
  const ofTheSelection = async () => {
    if (chosenOne === undefined) return undefined;
    const rendered = await actions.choisir(
      chosenOne.id,
      chosenOne.depots.filter((chosen) => !alike(chosen, repository)),
    );
    return "refus" in rendered ? refusalSays(rendered) : undefined;
  };
  // Cet ordinateur, quand sa liste ou sa sélection le porte. Sinon, sa liste pas encore lue, sa réponse dira ce qu'il en est (`parSaListe`, plus bas).
  const byItsList = station.ici && (list?.some((served) => alike(served, repository)) === true || chosenOne !== undefined || list === undefined);
  if (byItsList) {
    return {
      ecrire: async () => {
        const refusal = await ofTheSelection();
        if (refusal !== undefined) return refusal;
        const rendered = await actions.retirerIci(repository);
        if ("refus" in rendered) return refusalSays(rendered);
        // Relue, la liste dit ce que la station sert : un projet qui y reste n'est pas arrêté.
        if (rendered.depots.some((served) => alike(served, repository))) return { texte: STILL_SERVED(station.nom, project), refus: true, detail: "" };
        return { texte: REMOVED(station.nom, project), refus: false, detail: "" };
      },
    };
  }
  if (chosenOne !== undefined) {
    return {
      ecrire: async () => (await ofTheSelection()) ?? { texte: REMOVED(station.nom, project), refus: false, detail: "" },
    };
  }
  return undefined;
}

// Joue le geste, et rend ce que la ligne en dit : un geste qui lève dit que l'app a échoué, son détail au survol.
/** @param {{ ecrire: () => Promise<Says> }} action @returns {Promise<Says>} */
export async function haltStation(action) {
  try {
    return await action.ecrire();
  } catch (error) {
    return { texte: `nothing was changed: ${FAILURE}`, refus: true, detail: error instanceof Error ? error.message : String(error) };
  }
}
