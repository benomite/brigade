// Le sigle d'un projet : ce que sa case écrit dans la barre (ticket 1983) — trois signes au plus, en
// grand, sur une ligne, jamais coupé. Son nom entier est au survol de la case, et en tête de son espace.
//
// Il se tire du nom, et de ceux des autres projets de l'app : deux projets n'ont jamais le même. Un nom
// fait de plusieurs mots donne ses initiales (`brigade-site` → `BS`) ; un mot seul, sa première lettre
// et celle où il se sépare des noms qui commencent comme lui (`mirrorscreen`, `mirrorlab` → `MS`, `ML`),
// sa deuxième sinon (`brigade` → `BR`). Le chef peut écrire le sien dans le fichier des projets
// (`sigle`, config.ts) : il passe avant tout sigle tiré, qui l'évite.

export const ACRONYM_MAX = 3;

const signs = (text: string): string[] => [...new Intl.Segmenter(undefined, { granularity: "grapheme" }).segment(text)].map(({ segment }) => segment);

// Pourquoi ce sigle écrit n'en est pas un — rien, s'il en est un.
export function refusalOfAcronym(readOne: unknown): string | undefined {
  if (typeof readOne !== "string") return `“sigle” must be a string — the short label of its tile, ${ACRONYM_MAX} characters at most`;
  const written = readOne.trim();
  if (written === "") return "“sigle” is empty — remove it, and the app derives one from the name";
  if (/[\s\p{Cc}]/u.test(written)) return `“sigle” holds a space: ${ACRONYM_MAX} characters at most, on one line`;
  const length = signs(written).length;
  if (length > ACRONYM_MAX) return `“sigle” is ${length} characters long: ${ACRONYM_MAX} at most`;
  return undefined;
}

// Un signe en capitale — sauf celui dont la capitale en ferait deux (`ß`).
const top = (sign: string): string => {
  const capital = sign.toUpperCase();
  return [...capital].length === 1 ? capital : sign;
};

// Les mots d'un nom : ce que séparent ses tirets, ses blancs, sa ponctuation, et le passage d'une
// minuscule à une capitale (`mirrorLab`).
function words(name: string): string[] {
  return name
    .replace(/(\p{Ll})(\p{Lu})/gu, "$1 $2")
    .split(/[^\p{L}\p{N}]+/u)
    .filter((word) => word !== "")
    .map((word) => word.toLowerCase());
}

const prefixCommon = (a: readonly string[], b: readonly string[]): number => {
  let n = 0;
  while (n < a.length && n < b.length && a[n] === b[n]) n++;
  return n;
};

type Read = { nom: string; lettres: string[]; initiales: string[] };

// Les sigles d'un nom, du préféré au dernier recours — sans doublon. `separe` : la place de la lettre où
// ce nom se sépare de ceux qui commencent comme lui.
function candidates({ lettres: letters, initiales }: Read, separate: number): string[] {
  const seenOnes = new Set<string>();
  const renderedOnes: string[] = [];
  const keep = (...taken: (string | undefined)[]) => {
    if (taken.some((sign) => sign === undefined)) return;
    const acronym = (taken as string[]).map(top).join("");
    if (acronym === "" || [...acronym].length > ACRONYM_MAX || seenOnes.has(acronym)) return;
    seenOnes.add(acronym);
    renderedOnes.push(acronym);
  };
  const [first] = letters;
  if (first === undefined) return renderedOnes;
  // Le préféré : les initiales de plusieurs mots ; d'un mot seul, sa première lettre et celle où il se sépare.
  if (initiales.length >= 2) keep(...initiales.slice(0, ACRONYM_MAX));
  if (letters.length === 1) keep(first);
  // Puis la première lettre et une autre, de celle où le nom se sépare à la fin, puis celles d'avant.
  const places = [...Array(letters.length).keys()].slice(1);
  const order = [...places.filter((place) => place >= separate), ...places.filter((place) => place < separate)];
  for (const place of order) keep(first, letters[place]);
  // Puis trois lettres : la première, et deux autres dans l'ordre du nom.
  for (const [rank, place] of order.entries()) for (const next of order.slice(rank + 1)) keep(first, ...[place, next].sort((a, b) => a - b).map((p) => letters[p]));
  return renderedOnes;
}

// Le dernier recours, quand aucune lettre du nom ne fait un sigle libre : sa première, et un nombre ; puis
// tout sigle de lettres et de chiffres, du plus court au plus long.
function* resort(first: string | undefined): Generator<string> {
  if (first !== undefined) for (let n = 2; n < 100; n++) yield `${top(first)}${n}`;
  const alphabet = "ABCDEFGHIJKLMNOPQRSTUVWXYZ0123456789";
  for (const a of alphabet) yield a;
  for (const a of alphabet) for (const b of alphabet) yield `${a}${b}`;
  for (const a of alphabet) for (const b of alphabet) for (const c of alphabet) yield `${a}${b}${c}`;
}

// Le sigle de chaque projet, par son nom : celui que le chef a écrit, sinon un sigle tiré que n'a aucun
// autre projet. L'ordre des projets n'y fait rien — les ranger dans la barre ne change pas leurs sigles.
export function acronyms(projects: readonly { nom: string; sigle?: string }[]): Map<string, string> {
  const renderedOnes = new Map<string, string>();
  // Deux sigles qui ne diffèrent que par la casse se lisent pareil : ils comptent pour un.
  const taken = new Set<string>();
  const take = (name: string, acronym: string) => {
    renderedOnes.set(name, acronym);
    taken.add(acronym.toUpperCase());
  };
  const free = (acronym: string) => !taken.has(acronym.toUpperCase());
  for (const { nom: name, sigle: acronym } of projects) if (acronym !== undefined && refusalOfAcronym(acronym) === undefined) take(name, acronym.trim());

  const all: Read[] = projects
    .map(({ nom: name }) => {
      const split = words(name);
      const letters = split.length === 0 ? signs(name.trim()) : [...split.join("")];
      return { nom: name, lettres: letters, initiales: split.map((word) => [...word][0] ?? "") };
    })
    .sort((a, b) => (a.nom < b.nom ? -1 : a.nom > b.nom ? 1 : 0));
  const readOnes = all.filter(({ nom: name }) => !renderedOnes.has(name));
  // Un mot seul se sépare des autres noms là où ils cessent de lui ressembler — à sa deuxième lettre, s'ils ne lui
  // ressemblent pas. Les noms dont le chef a écrit le sigle comptent aussi : en écrire un ne change pas les autres cases.
  const lists = readOnes.map((readOne) => {
    const separate = Math.max(1, ...all.filter((other) => other.nom !== readOne.nom).map((other) => prefixCommon(readOne.lettres, other.lettres)));
    return candidates(readOne, separate);
  });
  // D'abord, chacun prend son préféré s'il est seul à le vouloir ; puis, dans l'ordre des noms, ceux qui restent prennent le premier libre.
  const preferred = lists.map((list) => list[0]);
  for (const [rank, readOne] of readOnes.entries()) {
    const prefers = preferred[rank];
    if (prefers !== undefined && free(prefers) && preferred.filter((other) => other?.toUpperCase() === prefers.toUpperCase()).length === 1) take(readOne.nom, prefers);
  }
  for (const [rank, readOne] of readOnes.entries()) {
    if (renderedOnes.has(readOne.nom)) continue;
    const finds = (lists[rank] ?? []).find(free);
    if (finds !== undefined) {
      take(readOne.nom, finds);
      continue;
    }
    for (const acronym of resort(readOne.lettres[0])) {
      if (!free(acronym)) continue;
      take(readOne.nom, acronym);
      break;
    }
  }
  return renderedOnes;
}
