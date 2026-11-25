// @ts-check
// Le rail, haut du backlog (ticket 4223, épique 4131), sur la page du projet : au-dessus des colonnes, sous le bandeau Backlog,
// les issues calibrées et prêtes que la cuisine servira d'abord, dans l'ordre priorité puis âge — l'écran que rail.ts
// (`htmlDuRail`) compose dans le process principal, à la lecture des faits, tel quel : il montre les issues des faits, ni plus ni dans un autre ordre.
// Il se lit seulement : une issue y vient d'être calibrée et prête, sans geste du chef, et ce bloc n'en offre aucun.
// Ce module ne touche pas `document` : il reçoit de quoi créer un élément, et rend un élément.

/** @typedef {{ issues: { number: number, title: string, url: string }[], html: string }} HautDuBacklog */

export const TITRE = "On the rail — the top of the backlog";
const AIDE = "the calibrated and ready issues a cook takes next, by priority then age: an issue comes here on its own";

/**
 * Le bloc du rail — ou null tant que la lecture n'en porte pas.
 * @param {{ createElement: (nom: string) => HTMLElement }} doc @param {HautDuBacklog | undefined} haut
 * @returns {HTMLElement | null}
 */
export function poserLeHautDuBacklog(doc, haut) {
  if (haut === undefined) return null;
  const bloc = doc.createElement("section");
  bloc.className = "rail-du-backlog";
  bloc.ariaLabel = TITRE;
  const titre = doc.createElement("h3");
  titre.className = "rail-du-backlog-titre";
  titre.textContent = `${TITRE} (${haut.issues.length})`;
  titre.title = AIDE;
  const liste = doc.createElement("div");
  liste.className = "rail-du-backlog-liste";
  // Composé par rail.ts à la lecture des faits, des issues lues : seul leur texte échappé y est, en spans et en lignes.
  liste.innerHTML = haut.html;
  bloc.append(titre, liste);
  return bloc;
}
