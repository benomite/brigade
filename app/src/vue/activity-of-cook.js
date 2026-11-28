// @ts-check
// Ce que fait le cook d'un ticket, sur sa fiche (ticket 1846) : à la place de son terminal, que l'app ne suit pas, ce
// que le process principal en lit sur GitHub (board/read.ts, ticket 2061) — sa station, depuis sa prise, ce que la
// cuisine en fait, sa PR. Tant qu'il tourne : sa pilule `cooking`, sa station, depuis quand ; ce qu'il fait en ce
// moment. Ses tours, ses tokens et ses gestes ne sont que dans le journal de sa station : la fiche les montre quand
// ils sont donnés. La fiche se repose à chaque lecture du rail : ce qu'elle montre suit le cook, daté par cette lecture.
// Un ticket sans cook n'a pas de section.
// Ce module ne touche pas `document` : il reçoit de quoi créer un élément (bricks.js), et rend un élément.


/** @typedef {import("./bricks.js").Fabrique} Fabrique */
/** @typedef {import("../board/read.ts").ActivityOfCook} Activity */
/** @typedef {import("../board/read.ts").StepOfCook} Step */
/**
 * Ce que le process principal envoie d'un projet, à chaque lecture de son rail : l'heure de la lecture et l'activité de
 * ses cooks — ou pourquoi elle ne se lit pas.
 * @typedef {{ projet: string, lu: string, activites: readonly Activity[] } | { projet: string, sans: string }} Published
 */

export const TITLE = "its cook";
export const IN_PROGRESS = "cooking";



// Une durée, comme `status` la dit (board/rail.ts, `dureeEn`).
/** @param {number} ms */
export function duration(ms) {
  const seconds = Math.max(0, Math.round(ms / 1000));
  if (seconds < 60) return `${seconds} s`;
  const minutes = Math.floor(seconds / 60);
  if (minutes < 60) return `${minutes} min`;
  const hours = Math.floor(minutes / 60);
  if (hours < 48) return `${hours} h ${String(minutes % 60).padStart(2, "0")}`;
  return `${Math.floor(hours / 24)} d`;
}


/** @param {Step} etape */
export const action = ({ faitEn: doneIn, cible: target }) => (target === null ? doneIn : `${doneIn} ${target}`);




