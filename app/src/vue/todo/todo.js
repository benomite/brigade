// @ts-check
// TODO n'est pas une colonne (ticket 3458) : ce qui attend le chef est une propriété d'un ticket, pas une place sur le rail.
// Une carte qui attend le chef reste dans la colonne de son étape — celle que facts.ts lui donne, puis celle du plan de la
// cuisine (cuisine/, ticket 4238) —, avec la peau
// noire et rouge de la carte d'attente, en tête de sa colonne. La colonne dit où est le ticket, la couleur dit qui le
// tient. Il n'y a plus de filtre (ticket 3523) : les cartes rouges viennent d'abord dans leur colonne, et N, le nombre de
// cartes rouges, est le compte de l'accueil et de l'onglet du projet.
// Le process principal range ce qui attend le chef dans une liste à part, « Awaiting you » (facts.ts) : la vue n'en fait
// jamais une colonne. Ce qui attend le chef sans être un ticket du rail — le dépôt pas préparé, une réponse gardée — se
// pose sous les colonnes.
// Ce module ne touche pas `document` : il reçoit de quoi créer un élément, la vue lui donne le sien et les tests un faux.

/** @typedef {import("../../facts.ts").Card} Card */
/** @typedef {import("../../facts.ts").Column} Column */
/** @typedef {{ createElement(balise: string): any }} Fabrique */

// La liste de ce qui attend le chef, telle que le process principal la nomme (facts.ts).
export const LIST_OF_CHEF = "Awaiting you";
// La colonne d'une carte qui attend le chef sans étape connue : un ticket pas encore pris est sur le rail.
const ON_THE_RAIL = "On the rail";

// Une carte rouge : elle est parked, et c'est le chef qu'elle attend (tickets 4238, 4261) — rien d'autre. Ce qu'attend un
// autre humain du projet (« Awaiting others », ticket 2985), un tiers, ou une date, même passée, ne l'attend pas.
/** @param {Card} card */
export const isRed = (card) => card.parque?.chef === true;

// La colonne d'une carte qui attend le chef : celle de son étape, si le rail l'a ; sinon On the rail.
/** @param {Card} card @param {readonly string[]} names */
export const columnOf = (card, names) => (card.etape !== undefined && names.includes(card.etape) ? card.etape : ON_THE_RAIL);

/**
 * Le rail tel que la vue le pose : ses colonnes sans la liste du chef, chaque carte de celle-ci rouge en tête de la
 * colonne de son étape, les autres rouges (parked pour le chef, ticket 4261) en tête de la leur. `compte` : le nombre de cartes qui
 * attendent le chef — `?` quand la liste n'est pas lue ; `autres` : ce qui attend un autre humain du projet.
 * @param {readonly Column[]} readEntries
 * @returns {{ colonnes: Column[], compte: string, autres: Card[] | undefined }}
 */
export function tidyTheRail(readEntries) {
  const list = readEntries.find(({ nom: name }) => name === LIST_OF_CHEF);
  const ofChef = list?.cartes ?? [];
  const theSteps = readEntries.filter(({ nom: name }) => name !== LIST_OF_CHEF);
  // Une carte du chef n'est jamais perdue faute de colonne : un rail qui n'aurait pas On the rail la reçoit en tête.
  const withoutRail = ofChef.length > 0 && !theSteps.some(({ nom: name }) => name === ON_THE_RAIL);
  const steps = withoutRail ? [{ nom: ON_THE_RAIL, ton: "gris", compte: "0", cartes: [], vide: "" }, ...theSteps] : theSteps;
  const names = steps.map(({ nom: name }) => name);
  let red = ofChef.length;
  const columns = steps.map((column) => {
    const come = ofChef.filter((card) => columnOf(card, names) === column.nom);
    const itsOwn = column.cartes.filter(isRed);
    red += itsOwn.length;
    const inHead = [...come, ...itsOwn];
    const cards = [...inHead, ...column.cartes.filter((card) => !isRed(card))];
    return { ...column, compte: column.compte === "?" ? "?" : String(cards.length), cartes: cards };
  });
  return { colonnes: columns, compte: list?.compte === "?" ? "?" : String(red), autres: list?.autres };
}
