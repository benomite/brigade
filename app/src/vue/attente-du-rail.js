// @ts-check
// Le rail d'un projet qui n'a encore rien rendu n'attend pas sans fin (ticket 2055) : au bout d'une minute, la page dit en
// une ligne qu'elle n'a rien lu, plutôt que « first read … in progress » pour toujours. Ce module ne touche ni `document`
// ni l'horloge : il reçoit l'instant.

export const ATTENTE_MAX_MS = 60_000;

export const RAIL_NON_LU = "the rail is not read: nothing came back in a minute — check that GitHub is reachable and that a station serves this project";

/**
 * @param {Map<string, number>} depuis le premier instant d'attente de chaque projet
 * @param {string} nom
 * @param {number} maintenant
 * @returns {boolean} vrai quand l'attente dépasse la minute
 */
export function attenteEpuisee(depuis, nom, maintenant) {
  const debut = depuis.get(nom) ?? maintenant;
  depuis.set(nom, debut);
  return maintenant - debut >= ATTENTE_MAX_MS;
}
