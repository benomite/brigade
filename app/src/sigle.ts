// Le sigle d'un projet : ce que sa case écrit dans la barre (ticket 1983) — trois signes au plus, en
// grand, sur une ligne, jamais coupé. Son nom entier est au survol de la case, et en tête de son espace.
//
// Il se tire du nom, et de ceux des autres projets de l'app : deux projets n'ont jamais le même. Un nom
// fait de plusieurs mots donne ses initiales (`brigade-site` → `BS`) ; un mot seul, sa première lettre
// et celle où il se sépare des noms qui commencent comme lui (`mirrorscreen`, `mirrorlab` → `MS`, `ML`),
// sa deuxième sinon (`brigade` → `BR`). Le chef peut écrire le sien dans le fichier des projets
// (`sigle`, config.ts) : il passe avant tout sigle tiré, qui l'évite.

export const SIGLE_MAX = 3;

const signes = (texte: string): string[] => [...new Intl.Segmenter(undefined, { granularity: "grapheme" }).segment(texte)].map(({ segment }) => segment);

// Pourquoi ce sigle écrit n'en est pas un — rien, s'il en est un.
export function refusDuSigle(lu: unknown): string | undefined {
  if (typeof lu !== "string") return `“sigle” must be a string — the short label of its tile, ${SIGLE_MAX} characters at most`;
  const ecrit = lu.trim();
  if (ecrit === "") return "“sigle” is empty — remove it, and the app derives one from the name";
  if (/[\s\p{Cc}]/u.test(ecrit)) return `“sigle” holds a space: ${SIGLE_MAX} characters at most, on one line`;
  const longueur = signes(ecrit).length;
  if (longueur > SIGLE_MAX) return `“sigle” is ${longueur} characters long: ${SIGLE_MAX} at most`;
  return undefined;
}

// Un signe en capitale — sauf celui dont la capitale en ferait deux (`ß`).
const haut = (signe: string): string => {
  const capitale = signe.toUpperCase();
  return [...capitale].length === 1 ? capitale : signe;
};

// Les mots d'un nom : ce que séparent ses tirets, ses blancs, sa ponctuation, et le passage d'une
// minuscule à une capitale (`mirrorLab`).
function mots(nom: string): string[] {
  return nom
    .replace(/(\p{Ll})(\p{Lu})/gu, "$1 $2")
    .split(/[^\p{L}\p{N}]+/u)
    .filter((mot) => mot !== "")
    .map((mot) => mot.toLowerCase());
}

const prefixeCommun = (a: readonly string[], b: readonly string[]): number => {
  let n = 0;
  while (n < a.length && n < b.length && a[n] === b[n]) n++;
  return n;
};

type Lu = { nom: string; lettres: string[]; initiales: string[] };

// Les sigles d'un nom, du préféré au dernier recours — sans doublon. `separe` : la place de la lettre où
// ce nom se sépare de ceux qui commencent comme lui.
function candidats({ lettres, initiales }: Lu, separe: number): string[] {
  const vus = new Set<string>();
  const rendus: string[] = [];
  const garder = (...pris: (string | undefined)[]) => {
    if (pris.some((signe) => signe === undefined)) return;
    const sigle = (pris as string[]).map(haut).join("");
    if (sigle === "" || [...sigle].length > SIGLE_MAX || vus.has(sigle)) return;
    vus.add(sigle);
    rendus.push(sigle);
  };
  const [premiere] = lettres;
  if (premiere === undefined) return rendus;
  // Le préféré : les initiales de plusieurs mots ; d'un mot seul, sa première lettre et celle où il se sépare.
  if (initiales.length >= 2) garder(...initiales.slice(0, SIGLE_MAX));
  if (lettres.length === 1) garder(premiere);
  // Puis la première lettre et une autre, de celle où le nom se sépare à la fin, puis celles d'avant.
  const places = [...Array(lettres.length).keys()].slice(1);
  const ordre = [...places.filter((place) => place >= separe), ...places.filter((place) => place < separe)];
  for (const place of ordre) garder(premiere, lettres[place]);
  // Puis trois lettres : la première, et deux autres dans l'ordre du nom.
  for (const [rang, place] of ordre.entries()) for (const suivante of ordre.slice(rang + 1)) garder(premiere, ...[place, suivante].sort((a, b) => a - b).map((p) => lettres[p]));
  return rendus;
}

// Le dernier recours, quand aucune lettre du nom ne fait un sigle libre : sa première, et un nombre ; puis
// tout sigle de lettres et de chiffres, du plus court au plus long.
function* recours(premiere: string | undefined): Generator<string> {
  if (premiere !== undefined) for (let n = 2; n < 100; n++) yield `${haut(premiere)}${n}`;
  const alphabet = "ABCDEFGHIJKLMNOPQRSTUVWXYZ0123456789";
  for (const a of alphabet) yield a;
  for (const a of alphabet) for (const b of alphabet) yield `${a}${b}`;
  for (const a of alphabet) for (const b of alphabet) for (const c of alphabet) yield `${a}${b}${c}`;
}

// Le sigle de chaque projet, par son nom : celui que le chef a écrit, sinon un sigle tiré que n'a aucun
// autre projet. L'ordre des projets n'y fait rien — les ranger dans la barre ne change pas leurs sigles.
export function sigles(projets: readonly { nom: string; sigle?: string }[]): Map<string, string> {
  const rendus = new Map<string, string>();
  // Deux sigles qui ne diffèrent que par la casse se lisent pareil : ils comptent pour un.
  const pris = new Set<string>();
  const prendre = (nom: string, sigle: string) => {
    rendus.set(nom, sigle);
    pris.add(sigle.toUpperCase());
  };
  const libre = (sigle: string) => !pris.has(sigle.toUpperCase());
  for (const { nom, sigle } of projets) if (sigle !== undefined && refusDuSigle(sigle) === undefined) prendre(nom, sigle.trim());

  const tous: Lu[] = projets
    .map(({ nom }) => {
      const decoupe = mots(nom);
      const lettres = decoupe.length === 0 ? signes(nom.trim()) : [...decoupe.join("")];
      return { nom, lettres, initiales: decoupe.map((mot) => [...mot][0] ?? "") };
    })
    .sort((a, b) => (a.nom < b.nom ? -1 : a.nom > b.nom ? 1 : 0));
  const lus = tous.filter(({ nom }) => !rendus.has(nom));
  // Un mot seul se sépare des autres noms là où ils cessent de lui ressembler — à sa deuxième lettre, s'ils ne lui
  // ressemblent pas. Les noms dont le chef a écrit le sigle comptent aussi : en écrire un ne change pas les autres cases.
  const listes = lus.map((lu) => {
    const separe = Math.max(1, ...tous.filter((autre) => autre.nom !== lu.nom).map((autre) => prefixeCommun(lu.lettres, autre.lettres)));
    return candidats(lu, separe);
  });
  // D'abord, chacun prend son préféré s'il est seul à le vouloir ; puis, dans l'ordre des noms, ceux qui restent prennent le premier libre.
  const preferes = listes.map((liste) => liste[0]);
  for (const [rang, lu] of lus.entries()) {
    const prefere = preferes[rang];
    if (prefere !== undefined && libre(prefere) && preferes.filter((autre) => autre?.toUpperCase() === prefere.toUpperCase()).length === 1) prendre(lu.nom, prefere);
  }
  for (const [rang, lu] of lus.entries()) {
    if (rendus.has(lu.nom)) continue;
    const trouve = (listes[rang] ?? []).find(libre);
    if (trouve !== undefined) {
      prendre(lu.nom, trouve);
      continue;
    }
    for (const sigle of recours(lu.lettres[0])) {
      if (!libre(sigle)) continue;
      prendre(lu.nom, sigle);
      break;
    }
  }
  return rendus;
}
