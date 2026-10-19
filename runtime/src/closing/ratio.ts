// The drift the closing measures: what the latest merges added, relative to
// what they removed. Nothing removes anything until this ratio comes back down.

// The windows, in merges: the last twenty, fifty and hundred.
export const FENETRES = [20, 50, 100];

// `merges`: those the window found — fewer than it asks for when the branch
// does not have that many.
export type Fenetre = { fenetre: number; merges: number; ajoute: number; retire: number };

// `merges`: the most recent first.
export function mesurerRatio(merges: Array<{ ajoute: number; retire: number }>, fenetres = FENETRES): Fenetre[] {
  return fenetres.map((fenetre) => {
    const siens = merges.slice(0, fenetre);
    const somme = (lire: (merge: { ajoute: number; retire: number }) => number) => siens.reduce((total, merge) => total + lire(merge), 0);
    return { fenetre, merges: siens.length, ajoute: somme(({ ajoute }) => ajoute), retire: somme(({ retire }) => retire) };
  });
}

// The ratio as it reads: `24.3:1`.
export function direRatio({ ajoute, retire }: { ajoute: number; retire: number }): string {
  return retire === 0 ? "nothing removed" : `${(ajoute / retire).toLocaleString("en-US", { maximumFractionDigits: 1 })}:1`;
}
