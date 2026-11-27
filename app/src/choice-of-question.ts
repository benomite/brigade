// Les choix qu'une question du manager propose en lettres (`a)`, `(b)`…), lus de son texte : le module est pur, la lecture de
// GitHub (tableau/) comme la réponse par `gh` (question.ts) s'en servent.

// Un choix que la question propose : sa lettre, telle qu'écrite, et ce qui la suit.
export type Choice = { lettre: string; texte: string };

// Un choix en tête de ligne : une puce ou rien, du gras ou rien, puis `a)`, `(a)`, `a.`, `a :` ou
// `a —`, et son texte.
const IN_HEAD = /^[ \t]*(?:[-*+][ \t]+)?(\*\*|__)?(?:\(([a-z])\)|([a-z])(?:\)|\.|[ \t]*:|[ \t]+[—–-]))\1?[ \t]+(\S.*)$/i;
// Un choix dans la phrase : `(a)`, ou `a)` après un blanc.
const IN_THE_SENTENCE = /(?<![\p{L}\p{N}])\(([a-z])\)|(?<=^|[\s«"'“])([a-z])\)(?=\s)/giu;

// Ce qui reste d'un choix une fois ses bords nettoyés : sans gras autour, sans la ponctuation ni
// le « ou » qui le lient au suivant.
function clean(text: string): string {
  let own = text.trim();
  for (let before = ""; before !== own; ) {
    before = own;
    own = own
      .replace(/^(?:\*\*|__)\s*|\s*(?:\*\*|__)$/g, "")
      .replace(/\s*[,;:]$/, "")
      .replace(/\s+(?:ou|or|et|and)$/i, "")
      .trim();
  }
  return own;
}

// La première suite de lettres qui se suivent à partir de `a` — `a`, `b`, `c`… —, deux au moins,
// toutes de la même casse. Une lettre seule n'est pas un choix.
function suite<T extends { lettre: string }>(readOnes: readonly T[]): T[] {
  for (let start = 0; start < readOnes.length; start++) {
    const first = readOnes[start]?.lettre ?? "";
    if (first !== "a" && first !== "A") continue;
    const taken = [readOnes[start] as T];
    for (let i = start + 1; i < readOnes.length; i++) {
      const expected = String.fromCharCode(first.charCodeAt(0) + taken.length);
      if (readOnes[i]?.lettre !== expected) break;
      taken.push(readOnes[i] as T);
    }
    if (taken.length >= 2) return taken;
  }
  return [];
}

// Les choix que la question propose, dans son ordre : en tête de ligne d'abord — une liste —,
// sinon dans la phrase. Le texte d'un choix est celui de la question, nettoyé de ses bords ; en
// fin de phrase, il s'arrête à son point d'interrogation, à son point ou à la fin de sa ligne.
// Aucun : la question n'en propose pas, ou pas sous une forme que l'app sait lire — elle se
// répond alors par une phrase.
export function choiceOf(text: string): Choice[] {
  const lines = text.split("\n").flatMap((line) => {
    const [, , between, only, suiteOfLine] = IN_HEAD.exec(line) ?? [];
    const letter = between ?? only;
    return letter === undefined || suiteOfLine === undefined ? [] : [{ lettre: letter, texte: clean(suiteOfLine) }];
  });
  const inList = suite(lines).filter(({ texte: said }) => said !== "");
  if (inList.length >= 2) return inList;

  const marks = [...text.matchAll(IN_THE_SENTENCE)].map((finds) => ({ lettre: finds[1] ?? finds[2] ?? "", debut: finds.index, fin: finds.index + finds[0].length }));
  const taken = suite(marks);
  const choice = taken.map(({ lettre: letter, fin: end }, i) => {
    const next = taken[i + 1];
    const raw = next === undefined ? (/^[^\n?]*?(?=\?|\.(?:\s|$)|\n|$)/.exec(text.slice(end))?.[0] ?? "") : text.slice(end, next.debut);
    return { lettre: letter, texte: clean(raw.replaceAll("\n", " ")) };
  });
  return choice.length >= 2 && choice.every(({ texte: said }) => said !== "") ? choice : [];
}

// Ce que le chef poste : la lettre et le texte du choix, tels que la question les écrit ; ou sa phrase, telle qu'il l'a écrite.
export const bodyOfChoice = ({ lettre: letter, texte: text }: Choice) => `${letter}) ${text}`;
