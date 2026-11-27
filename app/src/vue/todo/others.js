// @ts-check
// « Awaiting others » à côté de l'entrée « TODO (N) », hors des colonnes (tickets 2985, 3071, 3458) : les cartes qui attendent un autre humain du projet que le compte
// connecté (vue/cards-assigned/), repliées par défaut sous leur nombre, après les siennes. L'assignation sert à prévenir et
// à lire, jamais à empêcher : dépliée, chacune est une carte de TODO — elle s'ouvre, se répond, se tranche, par les mêmes
// gestes —, et dit en plus qui elle attend, leurs logins GitHub. Rien n'attend un autre humain : la section n'est pas posée.
// Le même bloc est sur un écran étroit, la vue étant la même.

export const TITLE = "Awaiting others";

/**
 * @param {import("../bricks.js").Fabrique} doc
 * @param {{ autres: readonly import("../../facts.ts").Card[] | undefined, bons: (cards: import("../../facts.ts").Card[]) => HTMLElement, deplie: boolean, deplier: (opened: boolean) => void }} options
 * `bons` : la liste de cartes que le rail dessine, pour ses propres cartes ; `deplie` : le chef l'a dépliée, et la lecture suivante
 * la garde dépliée ; `deplier` : il l'ouvre ou la referme.
 * @returns {HTMLElement | undefined}
 */
export function setTheOthers(doc, { autres: others, bons: slips, deplie: unfolded, deplier: unfold }) {
  if (others === undefined || others.length === 0) return undefined;
  const fold = /** @type {HTMLDetailsElement} */ (doc.createElement("details"));
  fold.className = "replie autres";
  if (unfolded) fold.open = true;
  fold.addEventListener("toggle", () => unfold(fold.open === true));
  const head = doc.createElement("summary");
  head.textContent = `${TITLE} (${others.length})`;
  const list = slips([...others]);
  [...list.children].forEach((line, rank) => {
    const awaiting = doc.createElement("p");
    awaiting.className = "qui";
    awaiting.textContent = `awaits ${(others[rank]?.qui ?? []).join(", ")}`;
    line.children[0]?.after(awaiting);
  });
  fold.append(head, list);
  return fold;
}
