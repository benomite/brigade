// @ts-check
// « Awaiting others » à côté de l'entrée « TODO (N) », hors des colonnes (tickets 2985, 3071, 3458) : les cartes qui attendent un autre humain du projet que le compte
// connecté (vue/cards-assignees/), repliées par défaut sous leur nombre, après les siennes. L'assignation sert à prévenir et
// à lire, jamais à empêcher : dépliée, chacune est une carte de TODO — elle s'ouvre, se répond, se tranche, par les mêmes
// gestes —, et dit en plus qui elle attend, leurs logins GitHub. Rien n'attend un autre humain : la section n'est pas posée.
// Le même bloc est sur un écran étroit, la vue étant la même.

export const TITRE = "Awaiting others";

/**
 * @param {import("../briques.js").Fabrique} doc
 * @param {{ autres: readonly import("../../facts.ts").Card[] | undefined, bons: (cards: import("../../facts.ts").Card[]) => HTMLElement, deplie: boolean, deplier: (ouvert: boolean) => void }} options
 * `bons` : la liste de cartes que le rail dessine, pour ses propres cartes ; `deplie` : le chef l'a dépliée, et la lecture suivante
 * la garde dépliée ; `deplier` : il l'ouvre ou la referme.
 * @returns {HTMLElement | undefined}
 */
export function poserLesAutres(doc, { autres, bons: slips, deplie, deplier }) {
  if (autres === undefined || autres.length === 0) return undefined;
  const pli = /** @type {HTMLDetailsElement} */ (doc.createElement("details"));
  pli.className = "replie autres";
  if (deplie) pli.open = true;
  pli.addEventListener("toggle", () => deplier(pli.open === true));
  const tete = doc.createElement("summary");
  tete.textContent = `${TITRE} (${autres.length})`;
  const liste = slips([...autres]);
  [...liste.children].forEach((line, rang) => {
    const awaiting = doc.createElement("p");
    awaiting.className = "qui";
    awaiting.textContent = `awaits ${(autres[rang]?.qui ?? []).join(", ")}`;
    line.children[0]?.after(awaiting);
  });
  pli.append(tete, liste);
  return pli;
}
