// Les choix qu'une question du manager propose en lettres (`a)`, `(b)`…), lus de son texte : le module est pur, la lecture de
// GitHub (tableau/) comme la réponse par `gh` (question.ts) s'en servent.

// Un choix que la question propose : sa lettre, telle qu'écrite, et ce qui la suit.
export type Choice = { lettre: string; texte: string };

// Un choix en tête de ligne : une puce ou rien, du gras ou rien, puis `a)`, `(a)`, `a.`, `a :` ou
// `a —`, et son texte.
const EN_TETE = /^[ \t]*(?:[-*+][ \t]+)?(\*\*|__)?(?:\(([a-z])\)|([a-z])(?:\)|\.|[ \t]*:|[ \t]+[—–-]))\1?[ \t]+(\S.*)$/i;
// Un choix dans la phrase : `(a)`, ou `a)` après un blanc.
const DANS_LA_PHRASE = /(?<![\p{L}\p{N}])\(([a-z])\)|(?<=^|[\s«"'“])([a-z])\)(?=\s)/giu;

// Ce qui reste d'un choix une fois ses bords nettoyés : sans gras autour, sans la ponctuation ni
// le « ou » qui le lient au suivant.
function nettoyer(texte: string): string {
  let propre = texte.trim();
  for (let avant = ""; avant !== propre; ) {
    avant = propre;
    propre = propre
      .replace(/^(?:\*\*|__)\s*|\s*(?:\*\*|__)$/g, "")
      .replace(/\s*[,;:]$/, "")
      .replace(/\s+(?:ou|or|et|and)$/i, "")
      .trim();
  }
  return propre;
}

// La première suite de lettres qui se suivent à partir de `a` — `a`, `b`, `c`… —, deux au moins,
// toutes de la même casse. Une lettre seule n'est pas un choix.
function suite<T extends { lettre: string }>(lus: readonly T[]): T[] {
  for (let debut = 0; debut < lus.length; debut++) {
    const first = lus[debut]?.lettre ?? "";
    if (first !== "a" && first !== "A") continue;
    const taken = [lus[debut] as T];
    for (let i = debut + 1; i < lus.length; i++) {
      const attendue = String.fromCharCode(first.charCodeAt(0) + taken.length);
      if (lus[i]?.lettre !== attendue) break;
      taken.push(lus[i] as T);
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
export function choiceDe(texte: string): Choice[] {
  const lines = texte.split("\n").flatMap((line) => {
    const [, , entre, only, suiteDeLine] = EN_TETE.exec(line) ?? [];
    const lettre = entre ?? only;
    return lettre === undefined || suiteDeLine === undefined ? [] : [{ lettre, texte: nettoyer(suiteDeLine) }];
  });
  const enListe = suite(lines).filter(({ texte: dit }) => dit !== "");
  if (enListe.length >= 2) return enListe;

  const marques = [...texte.matchAll(DANS_LA_PHRASE)].map((trouve) => ({ lettre: trouve[1] ?? trouve[2] ?? "", debut: trouve.index, fin: trouve.index + trouve[0].length }));
  const prises = suite(marques);
  const choice = prises.map(({ lettre, fin }, i) => {
    const suivante = prises[i + 1];
    const brut = suivante === undefined ? (/^[^\n?]*?(?=\?|\.(?:\s|$)|\n|$)/.exec(texte.slice(fin))?.[0] ?? "") : texte.slice(fin, suivante.debut);
    return { lettre, texte: nettoyer(brut.replaceAll("\n", " ")) };
  });
  return choice.length >= 2 && choice.every(({ texte: dit }) => dit !== "") ? choice : [];
}

// Ce que le chef poste : la lettre et le texte du choix, tels que la question les écrit ; ou sa phrase, telle qu'il l'a écrite.
export const corpsDuChoice = ({ lettre, texte }: Choice) => `${lettre}) ${texte}`;
