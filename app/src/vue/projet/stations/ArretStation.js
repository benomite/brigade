// @ts-check
// « Stop cooking here » sur l'onglet Stations d'un projet (ticket 3402) : la station ne sert plus le projet, par le geste
// que l'app a pour elle, puis ce qui en résulte, en une ligne — le projet retiré, ou pourquoi rien n'a changé. Jamais un
// bouton qui s'en va sans rien changer : ce que le geste rend est relu, et un projet encore servi le dit.
//
// Cet ordinateur : sa station n'a qu'une liste, sa configuration (runtime/src/station-ordinateur/projets-servis.ts), que
// le process principal écrit (`retirerIci`). Si la sélection que l'app tient pour elle sur GitHub le porte aussi, il en
// est d'abord retiré (`choisir`) : sans quoi la station réécrirait sa ligne à sa lecture suivante. Une station du compte :
// sa sélection. Une station que le projet déclare : son retrait, sauf la seule (stations-declarees.js). Aucun : rien ne
// part, la ligne dit pourquoi.
//
// Ce module ne touche ni `document` ni le pont : la vue lui donne ce qu'elle a lu et les gestes.

/** @typedef {{ refus: string, detail?: string }} Refus */
/** @typedef {{ depots: string[] } | Refus} ListeEcrite */
/** Ce que la ligne sous le haut de l'onglet dit du geste. @typedef {{ texte: string, refus: boolean, detail: string }} Dit */
/**
 * `station` : la carte cliquée — son nom, et si c'est cet ordinateur. `liste` : la liste de la station de cet ordinateur,
 * telle que lue — indéfinie si elle ne l'est pas. `selection` : la sélection que l'app tient sur GitHub pour cette station,
 * si elle en a une (pour cet ordinateur, celle de sa station du compte). `declaree` : la station que le projet déclare sous
 * ce nom, et s'il en déclare d'autres.
 * @typedef {{
 *   projet: string,
 *   depot: string,
 *   station: { nom: string, ici: boolean },
 *   liste?: readonly string[],
 *   selection?: { id: string, depots: readonly string[] },
 *   declaree?: { nom: string, seule: boolean },
 * }} ArretDemande
 */
/**
 * @typedef {{
 *   retirerIci(depot: string): Promise<ListeEcrite>,
 *   choisir(id: string, depots: string[]): Promise<{ selection: string[] } | Refus>,
 *   retirerDeclaree(nom: string): Promise<object | Refus>,
 * }} GestesDeLArret
 */

export const SANS_GESTE = (/** @type {string} */ station) => `nothing was changed: the app has no gesture that stops ${station} from here`;
export const ENCORE_SERVI = (/** @type {string} */ station, /** @type {string} */ projet) => `nothing was changed: ${station} still has ${projet} in the projects it serves`;
export const RETIRE = (/** @type {string} */ station, /** @type {string} */ projet) => `${station} no longer takes ${projet}'s tickets`;
export const ECHEC = "the app failed while saving";

const pareil = (/** @type {string} */ a, /** @type {string} */ b) => a.toLowerCase() === b.toLowerCase();

/** @param {Refus} rendu @returns {Dit} */
const refusDit = (rendu) => ({ texte: `nothing was changed: ${String(rendu.refus).replace(/^not saved: /, "").replace(/^brigade: /, "")}`, refus: true, detail: rendu.detail ?? "" });

// Le geste qui arrête la station, ou `undefined` : l'app n'en a aucun pour elle. `seule` : la seule station déclarée.
/** @param {ArretDemande} demande @param {GestesDeLArret} gestes @returns {{ ecrire: () => Promise<Dit> } | { seule: true } | undefined} */
export function gesteDArret({ projet, depot, station, liste, selection, declaree }, gestes) {
  const choisie = selection !== undefined && selection.depots.some((choisi) => pareil(choisi, depot)) ? selection : undefined;
  // Retiré de la sélection : rendu tel quel, ou ce qui l'a refusé.
  const deLaSelection = async () => {
    if (choisie === undefined) return undefined;
    const rendu = await gestes.choisir(
      choisie.id,
      choisie.depots.filter((choisi) => !pareil(choisi, depot)),
    );
    return "refus" in rendu ? refusDit(rendu) : undefined;
  };
  // Cet ordinateur, quand sa liste ou sa sélection le porte. Sinon, il le sert par une déclaration du projet ; ou, sa liste
  // pas encore lue, sa réponse dira ce qu'il en est (`parSaListe`, plus bas).
  const parSaListe = station.ici && (liste?.some((servi) => pareil(servi, depot)) === true || choisie !== undefined || (liste === undefined && declaree === undefined));
  if (parSaListe) {
    return {
      ecrire: async () => {
        const refus = await deLaSelection();
        if (refus !== undefined) return refus;
        const rendu = await gestes.retirerIci(depot);
        if ("refus" in rendu) return refusDit(rendu);
        // Relue, la liste dit ce que la station sert : un projet qui y reste n'est pas arrêté.
        if (rendu.depots.some((servi) => pareil(servi, depot))) return { texte: ENCORE_SERVI(station.nom, projet), refus: true, detail: "" };
        return { texte: RETIRE(station.nom, projet), refus: false, detail: "" };
      },
    };
  }
  if (choisie !== undefined) {
    return {
      ecrire: async () => (await deLaSelection()) ?? { texte: RETIRE(station.nom, projet), refus: false, detail: "" },
    };
  }
  if (declaree !== undefined && !declaree.seule) {
    return {
      ecrire: async () => {
        const rendu = await gestes.retirerDeclaree(declaree.nom);
        return "refus" in rendu ? refusDit(/** @type {Refus} */ (rendu)) : { texte: RETIRE(station.nom, projet), refus: false, detail: "" };
      },
    };
  }
  return declaree !== undefined ? { seule: true } : undefined;
}

// Joue le geste, et rend ce que la ligne en dit : un geste qui lève dit que l'app a échoué, son détail au survol.
/** @param {{ ecrire: () => Promise<Dit> }} geste @returns {Promise<Dit>} */
export async function arreter(geste) {
  try {
    return await geste.ecrire();
  } catch (erreur) {
    return { texte: `nothing was changed: ${ECHEC}`, refus: true, detail: erreur instanceof Error ? erreur.message : String(erreur) };
  }
}
