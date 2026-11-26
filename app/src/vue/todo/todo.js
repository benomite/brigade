// @ts-check
// TODO n'est pas une colonne (ticket 3458) : ce qui attend le chef est une propriété d'un ticket, pas une place sur le rail.
// Une carte qui attend le chef reste dans la colonne de son étape — celle que facts.ts lui donne, puis celle du plan de la
// cuisine (kitchen/, ticket 4238) —, avec la peau
// noire et rouge de la carte d'attente, en tête de sa colonne. La colonne dit où est le ticket, la couleur dit qui le
// tient. Il n'y a plus de filtre (ticket 3523) : les cartes rouges viennent d'abord dans leur colonne, et N, le nombre de
// cartes rouges, est le compte de l'accueil et de l'onglet du projet.
// Le process principal range ce qui attend le chef dans une liste à part, « Awaiting you » (facts.ts) : la vue n'en fait
// jamais une colonne. Ce qui attend le chef sans être un ticket du rail — le dépôt pas préparé, une réponse gardée — se
// pose sous les colonnes.
// Ce module ne touche pas `document` : il reçoit de quoi créer un élément, la vue lui donne le sien et les tests un faux.

/** @typedef {import("../../facts.ts").Card} Card */
/** @typedef {import("../../facts.ts").Colonne} Colonne */
/** @typedef {{ createElement(balise: string): any }} Fabrique */

// La liste de ce qui attend le chef, telle que le process principal la nomme (facts.ts).
export const LISTE_DU_CHEF = "Awaiting you";
// La colonne d'une carte qui attend le chef sans étape connue : un ticket pas encore pris est sur le rail.
const SUR_LE_RAIL = "On the rail";

// Une carte rouge : elle est parked, et c'est le chef qu'elle attend (tickets 4238, 4261) — rien d'autre. Ce qu'attend un
// autre humain du projet (« Awaiting others », ticket 2985), un tiers, ou une date, même passée, ne l'attend pas.
/** @param {Card} card */
export const estRed = (card) => card.parque?.chef === true;

// La colonne d'une carte qui attend le chef : celle de son étape, si le rail l'a ; sinon On the rail.
/** @param {Card} card @param {readonly string[]} noms */
export const colonneDe = (card, noms) => (card.etape !== undefined && noms.includes(card.etape) ? card.etape : SUR_LE_RAIL);

/**
 * Le rail tel que la vue le pose : ses colonnes sans la liste du chef, chaque carte de celle-ci rouge en tête de la
 * colonne de son étape, les autres rouges (parked pour le chef, ticket 4261) en tête de la leur. `compte` : le nombre de cartes qui
 * attendent le chef — `?` quand la liste n'est pas lue ; `autres` : ce qui attend un autre humain du projet.
 * @param {readonly Colonne[]} lues
 * @returns {{ colonnes: Colonne[], compte: string, autres: Card[] | undefined }}
 */
export function rangerLeRail(lues) {
  const liste = lues.find(({ nom: name }) => name === LISTE_DU_CHEF);
  const duChef = liste?.cartes ?? [];
  const lesSteps = lues.filter(({ nom: name }) => name !== LISTE_DU_CHEF);
  // Une carte du chef n'est jamais perdue faute de colonne : un rail qui n'aurait pas On the rail la reçoit en tête.
  const sansRail = duChef.length > 0 && !lesSteps.some(({ nom: name }) => name === SUR_LE_RAIL);
  const steps = sansRail ? [{ nom: SUR_LE_RAIL, ton: "gris", compte: "0", cartes: [], vide: "" }, ...lesSteps] : lesSteps;
  const noms = steps.map(({ nom: name }) => name);
  let rouges = duChef.length;
  const colonnes = steps.map((colonne) => {
    const venues = duChef.filter((card) => colonneDe(card, noms) === colonne.nom);
    const siennes = colonne.cartes.filter(estRed);
    rouges += siennes.length;
    const enTete = [...venues, ...siennes];
    const cards = [...enTete, ...colonne.cartes.filter((card) => !estRed(card))];
    return { ...colonne, compte: colonne.compte === "?" ? "?" : String(cards.length), cartes: cards };
  });
  return { colonnes, compte: liste?.compte === "?" ? "?" : String(rouges), autres: liste?.autres };
}
