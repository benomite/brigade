// L'ordre de merge des tickets qui touchent au même terrain (#4044). Un ticket B est « après » un ticket A quand B déclare A en
// dépendance (`Depends on #A`), ou quand les livraisons ouvertes de A et de B changent au moins un fichier commun. Le lien fixe
// l'ordre : la dépendance déclarée passe en premier ; entre deux livraisons qui se recouvrent, celle arrivée la première à la
// pass (à égalité d'instant, le plus petit numéro). Ce module ne lit rien : le rail (`lecture.ts`) et la station lui passent
// ce qu'ils ont lu. Un lien ne se pose jamais s'il fermerait un cycle — deux tickets qui s'attendraient ne partiraient plus.
export type Livraison = { ticket: number; fichiers: readonly string[]; enPassLe: string | null };

// Pour chaque ticket retenu, les tickets dont le merge passe avant le sien, par numéro. `declarees` : les dépendances de chaque
// ticket, déjà réduites à celles qui sont encore sur le rail — un aîné fermé ou abandonné n'y est plus, et ne retient plus rien.
// Une livraison dont l'instant d'entrée en pass ne se lit pas (nul) n'est liée à aucune autre par ses fichiers : l'ordre
// n'est jamais inventé.
export function ordreDeMerge(options: { declarees: ReadonlyMap<number, readonly number[]>; livraisons: readonly Livraison[] }): Map<number, number[]> {
  const aines = new Map<number, Set<number>>();
  // `a` passe-t-il, de proche en proche, après `b` ?
  const apres = (a: number, b: number, vus = new Set<number>()): boolean => {
    if (vus.has(a)) return false;
    vus.add(a);
    const siens = aines.get(a) ?? new Set<number>();
    return siens.has(b) || [...siens].some((autre) => apres(autre, b, vus));
  };
  const lier = (aine: number, tardif: number) => {
    if (aine === tardif || apres(aine, tardif)) return;
    aines.set(tardif, (aines.get(tardif) ?? new Set<number>()).add(aine));
  };
  for (const [tardif, dependances] of [...options.declarees].sort(([a], [b]) => a - b)) for (const aine of [...dependances].sort((a, b) => a - b)) lier(aine, tardif);
  const instant = (livraison: Livraison) => Date.parse(livraison.enPassLe ?? "");
  const datees = options.livraisons.filter((livraison) => !Number.isNaN(instant(livraison)));
  const paires: Array<[Livraison, Livraison]> = [];
  for (const [rang, a] of datees.entries()) {
    for (const b of datees.slice(rang + 1)) {
      if (a.fichiers.some((fichier) => b.fichiers.includes(fichier))) paires.push(instant(a) < instant(b) || (instant(a) === instant(b) && a.ticket < b.ticket) ? [a, b] : [b, a]);
    }
  }
  for (const [aine, tardif] of paires.sort((x, y) => instant(x[0]) - instant(y[0]) || x[0].ticket - y[0].ticket || x[1].ticket - y[1].ticket)) lier(aine.ticket, tardif.ticket);
  return new Map([...aines].map(([ticket, siens]) => [ticket, [...siens].sort((a, b) => a - b)]));
}
