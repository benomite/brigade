// @ts-check
// TODO n'est pas une colonne (ticket 3458) : ce qui attend le chef est une propriété d'un ticket, pas une place sur le rail.
// Une carte qui attend le chef reste dans la colonne de son étape — On the rail, Taken, Pass, Waiting —, avec la peau
// noire et rouge de la carte d'attente, en tête de sa colonne. La colonne dit où est le ticket, la couleur dit qui le
// tient. Le mot TODO reste le nom du filtre « ce qui attend le chef » : l'entrée « TODO (N) » de la vue du projet, où N
// est le nombre de cartes rouges ; un clic ne montre qu'elles, où qu'elles soient, un second clic rend toute la vue.
// Le process principal range ce qui attend le chef dans une liste à part, « Awaiting you » (faits.ts) : la vue n'en fait
// jamais une colonne. Ce qui attend le chef sans être un ticket du rail — la ligne du disjoncteur, le dépôt pas préparé,
// une réponse gardée — se pose à côté de l'entrée, hors des colonnes.
// Ce module ne touche pas `document` : il reçoit de quoi créer un élément, la vue lui donne le sien et les tests un faux.

/** @typedef {import("../../faits.ts").Carte} Carte */
/** @typedef {import("../../faits.ts").Colonne} Colonne */
/** @typedef {{ createElement(balise: string): any }} Fabrique */

// La liste de ce qui attend le chef, telle que le process principal la nomme (faits.ts).
export const LISTE_DU_CHEF = "Awaiting you";
// Le nom du filtre, à l'écran.
export const TODO = "TODO";
// La colonne d'une carte qui attend le chef sans étape connue : un ticket pas encore pris est sur le rail.
const SUR_LE_RAIL = "On the rail";
// Ce que dit une colonne sans carte rouge, le filtre posé.
export const RIEN_ICI = "nothing here awaits you";
// Le survol de l'entrée : ce qu'elle fait.
export const MONTRER = "show only the cards that await you";
export const TOUT_MONTRER = "show the whole rail again";

// Une carte rouge : elle attend le chef — pas un autre humain du projet (« Awaiting others », ticket 2985) —, ou, dans
// WAITING, sa relance est passée et elle lui revient.
/** @param {Carte} carte */
export const estRouge = (carte) => (carte.attendu && carte.qui === undefined) || carte.relancePassee === true;

// La colonne d'une carte qui attend le chef : celle de son étape, si le rail l'a ; sinon On the rail.
/** @param {Carte} carte @param {readonly string[]} noms */
export const colonneDe = (carte, noms) => (carte.etape !== undefined && noms.includes(carte.etape) ? carte.etape : SUR_LE_RAIL);

/**
 * Le rail tel que la vue le pose : ses colonnes sans la liste du chef, chaque carte de celle-ci rouge en tête de la
 * colonne de son étape, les autres rouges (WAITING, relance passée) en tête de la leur. `filtre` : seules les cartes
 * rouges restent, et une colonne vide le dit. `compte` : N de « TODO (N) » — `?` quand la liste n'est pas lue ; `vide` :
 * ce que la liste dit d'elle-même quand elle est vide ou pas lue ; `autres` : ce qui attend un autre humain du projet.
 * @param {readonly Colonne[]} lues @param {boolean} [filtre]
 * @returns {{ colonnes: Colonne[], compte: string, vide: string | undefined, autres: Carte[] | undefined }}
 */
export function rangerLeRail(lues, filtre = false) {
  const liste = lues.find(({ nom }) => nom === LISTE_DU_CHEF);
  const duChef = liste?.cartes ?? [];
  const lesEtapes = lues.filter(({ nom }) => nom !== LISTE_DU_CHEF);
  // Une carte du chef n'est jamais perdue faute de colonne : un rail qui n'aurait pas On the rail la reçoit en tête.
  const sansRail = duChef.length > 0 && !lesEtapes.some(({ nom }) => nom === SUR_LE_RAIL);
  const etapes = sansRail ? [{ nom: SUR_LE_RAIL, ton: "gris", compte: "0", cartes: [], vide: "" }, ...lesEtapes] : lesEtapes;
  const noms = etapes.map(({ nom }) => nom);
  let rouges = duChef.length;
  const colonnes = etapes.map((colonne) => {
    const venues = duChef.filter((carte) => colonneDe(carte, noms) === colonne.nom);
    const siennes = colonne.cartes.filter(estRouge);
    rouges += siennes.length;
    const enTete = [...venues, ...siennes];
    const cartes = filtre ? enTete : [...enTete, ...colonne.cartes.filter((carte) => !estRouge(carte))];
    return { ...colonne, compte: colonne.compte === "?" ? "?" : String(cartes.length), cartes, ...(filtre ? { vide: RIEN_ICI } : {}) };
  });
  return { colonnes, compte: liste?.compte === "?" ? "?" : String(rouges), vide: liste?.vide, autres: liste?.autres };
}

/**
 * L'entrée « TODO (N) », au-dessus des colonnes. Zéro : elle le dit, sans aucun signe d'alerte ; au moins une carte : la
 * pastille rouge de ce qui attend le chef. `filtre` : elle est enfoncée. `?` : la liste n'est pas lue, son survol dit pourquoi.
 * @param {Fabrique} doc @param {{ compte: string, filtre: boolean, vide?: string, basculer: () => void }} options
 */
export function poserLEntree(doc, { compte, filtre, vide, basculer }) {
  const entree = doc.createElement("button");
  entree.type = "button";
  entree.className = "entree-todo";
  entree.textContent = `${TODO} (${compte})`;
  entree.ariaPressed = String(filtre);
  if (compte !== "0" && compte !== "?") entree.dataset.ton = "rouge";
  entree.title = compte === "?" && vide !== undefined ? vide : filtre ? TOUT_MONTRER : MONTRER;
  entree.addEventListener("click", basculer);
  return entree;
}
