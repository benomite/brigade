// La sorte d'une station : ce qu'elle est, et si elle cuisine.
//
// Toute app qui pilote un projet est une station, téléphone compris (décision
// du chef du 20/10, qui revient sur #797). Un ordinateur — un serveur, le poste
// du chef — fait tourner des cooks. Un téléphone n'en fait tourner aucun : il
// paraît dans la liste des stations comme les autres, mais sans cuisine, et
// rien de ce qui choisit la station où cuit un projet ne le retient.
//
// La sorte se dit par deux champs, partout où une station se publie : `sorte`,
// ce qu'elle est, et `cuisine`, ce qu'il en découle — l'app lit le second sans
// connaître les sortes.

export const ORDINATEUR = "ordinateur";
export const TELEPHONE = "telephone";
export const SORTES = [ORDINATEUR, TELEPHONE] as const;
export type Sorte = (typeof SORTES)[number];

export const estUneSorte = (valeur: unknown): valeur is Sorte => SORTES.includes(valeur as Sorte);

// Vrai : la station fait tourner des cooks. Seul le téléphone n'en fait tourner aucun.
export const cuisine = (sorte: Sorte): boolean => sorte !== TELEPHONE;

// Ce qu'un document publié par une station dit qu'elle est. Une station qui
// n'en dit rien est plus ancienne que les sortes : c'est un ordinateur, et il
// cuisine. `cuisine`, quand elle le publie, fait foi — sauf pour un téléphone,
// qui ne cuisine jamais, quoi qu'il publie ; sans lui, une sorte que
// ce runtime ne connaît pas — d'une station plus récente — ne cuisine pas : on
// ne confie pas des cooks à ce qu'on ne sait pas lire.
export function sorteLue(lu: { sorte?: unknown; cuisine?: unknown }): { sorte: Sorte | null; cuisine: boolean } {
  const sorte = lu.sorte === undefined ? ORDINATEUR : estUneSorte(lu.sorte) ? lu.sorte : null;
  if (typeof lu.cuisine === "boolean") return { sorte, cuisine: lu.cuisine && sorte !== TELEPHONE };
  return { sorte, cuisine: sorte !== null && cuisine(sorte) };
}
