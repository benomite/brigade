// Le plafond de cooks d'une station, tel que `status` le dit — la page de la
// station le montre mot pour mot. Rien n'est recalculé ici : ni
// les cœurs, ni le seuil de mémoire, la box les a dits.
//
//   cooks      2 running — box: 3 at most — 8 cores, mac/claude: 5 at most — set by you, replaces 3 (8 cores)
//
// L'app ne le règle pas (#2061) : le chef le règle à chaud par `station cooks <N>`, que la station relit à chaque tour
// (#3446) ; sans réglage, elle prend autant de tickets que sa déclaration, bornée par ses cœurs.

// `dit` : le plafond comme la box l'écrit — `3 at most — 8 cores`, `no limit — declared`,
// `5 at most — set by you, replaces 3 (8 cores)`. `parLeChef` : il a été réglé, et `remplace` dit ce qu'il remplace.
export type CapSeen = { dit: string; nombre: number | null; parLeChef: boolean; remplace?: string };

const CAP = /^(no limit|\d+ at most) — (?:set by you, replaces (.+?) \(.+\)|.+)$/;
// Le bout de la ligne `cooks` qui compte les cooks coincés, et celui qui compte ceux qui tournent.
const STUCK = / — \d+ STUCK: .*$/;
const IN_PROGRESS = /^(?:none running|\d+ running)(?: — |$)/;
// Entre deux stations : une virgule suivie d'un nom et de deux-points — celle de `set by you, replaces 3` n'en est pas une.
const BETWEEN_STATIONS = /, (?=[^\s,:]+: )/;

export function capsOf(status: string): Map<string, CapSeen> {
  const caps = new Map<string, CapSeen>();
  // Pas dans les lignes de tête : `cooks` vient après la première ligne vide de `status`.
  const value = /^cooks +(\S.*)$/m.exec(status)?.[1];
  if (value === undefined) return caps;
  for (const piece of value.replace(STUCK, "").replace(IN_PROGRESS, "").split(BETWEEN_STATIONS)) {
    const cut = piece.indexOf(": ");
    if (cut === -1) continue;
    const said = piece.slice(cut + 2);
    const [, count, remplace] = CAP.exec(said) ?? [];
    if (count === undefined) continue;
    caps.set(piece.slice(0, cut), {
      dit: said,
      nombre: count === "no limit" ? null : Number.parseInt(count, 10),
      parLeChef: said.includes(" — set by you, replaces "),
      ...(remplace === undefined ? {} : { remplace }),
    });
  }
  return caps;
}
