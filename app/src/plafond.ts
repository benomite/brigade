// Le plafond de cooks d'une station et ce qui la retient, tels que `status` les dit — la page de la
// station les montre mot pour mot. Rien n'est recalculé ici : ni
// les cœurs, ni le seuil de mémoire, la box les a dits.
//
//   cooks      2 running — box: 3 at most — 8 cores, mac/claude: 5 at most — set by you, replaces 3 (8 cores)
//   MACHINE SATURATED for 3 min on memory and CPU — load of 18.4 for at most 12 · 812 MB of memory available for
//              at least 3,205 MB (default: 10% of the machine's 32,050 MB): box takes no more tickets as long as it lasts
//
// L'app ne le règle pas (#2061) : une station prend autant de tickets qu'elle déclare de places, et sa déclaration se
// change sur sa machine.

// `dit` : le plafond comme la box l'écrit — `3 at most — 8 cores`, `no limit — declared`,
// `5 at most — set by you, replaces 3 (8 cores)`. `parLeChef` : il a été réglé, et `remplace` dit ce qu'il remplace.
export type PlafondVu = { dit: string; nombre: number | null; parLeChef: boolean; remplace?: string };
// Ce qui retient la station : les ressources en cause, depuis quand, et pour chacune ce qu'elle a et ce qu'il lui faut.
export type RetenueVue = { depuis: string; ressources: string; detail: string };

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

const SATUREE = /^ *MACHINE SATURATED for (.+?) on (.+?) — (.+): (.+?) takes no more tickets as long as it lasts$/gm;

export function retenuesDe(status: string): Map<string, RetenueVue> {
  return new Map([...status.matchAll(SATUREE)].map(([, depuis = "", ressources = "", detail = "", station = ""]) => [station, { depuis, ressources, detail }]));
}
