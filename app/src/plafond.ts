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
export type PlafondVu = { dit: string; nombre: number | null; parLeChef: boolean; remplace?: string };

const PLAFOND = /^(no limit|\d+ at most) — (?:set by you, replaces (.+?) \(.+\)|.+)$/;
// Le bout de la ligne `cooks` qui compte les cooks coincés, et celui qui compte ceux qui tournent.
const COINCES = / — \d+ STUCK: .*$/;
const EN_COURS = /^(?:none running|\d+ running)(?: — |$)/;
// Entre deux stations : une virgule suivie d'un nom et de deux-points — celle de `set by you, replaces 3` n'en est pas une.
const ENTRE_STATIONS = /, (?=[^\s,:]+: )/;

export function plafondsDe(status: string): Map<string, PlafondVu> {
  const plafonds = new Map<string, PlafondVu>();
  // Pas dans les lignes de tête : `cooks` vient après la première ligne vide de `status`.
  const valeur = /^cooks +(\S.*)$/m.exec(status)?.[1];
  if (valeur === undefined) return plafonds;
  for (const morceau of valeur.replace(COINCES, "").replace(EN_COURS, "").split(ENTRE_STATIONS)) {
    const coupe = morceau.indexOf(": ");
    if (coupe === -1) continue;
    const dit = morceau.slice(coupe + 2);
    const [, nombre, remplace] = PLAFOND.exec(dit) ?? [];
    if (nombre === undefined) continue;
    plafonds.set(morceau.slice(0, coupe), {
      dit,
      nombre: nombre === "no limit" ? null : Number.parseInt(nombre, 10),
      parLeChef: dit.includes(" — set by you, replaces "),
      ...(remplace === undefined ? {} : { remplace }),
    });
  }
  return plafonds;
}
