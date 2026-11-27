// @ts-check
// Le rail d'un projet qui n'a encore rien rendu n'attend pas sans fin (ticket 2055) : au bout d'une minute, la page dit en
// une ligne qu'elle n'a rien lu, plutôt que « first read … in progress » pour toujours. Ce module ne touche ni `document`
// ni l'horloge : il reçoit l'instant.

export const WAIT_MAX_MS = 60_000;

export const RAIL_NOT_READ = "the rail is not read: nothing came back in a minute — check that GitHub is reachable and that a station serves this project";

/**
 * @param {Map<string, number>} since le premier instant d'attente de chaque projet
 * @param {string} name
 * @param {number} now
 * @returns {boolean} vrai quand l'attente dépasse la minute
 */
export function waitExhausted(since, name, now) {
  const start = since.get(name) ?? now;
  since.set(name, start);
  return now - start >= WAIT_MAX_MS;
}
