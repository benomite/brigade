// Les sujets candidats du rôle produit, rangés par ce qu'ils servent des
// directions actives du chef. Un sujet gagne un point par mot porteur d'une
// direction qu'il contient (« onboarding » pour « focus on onboarding this
// month ») ; les sujets sont rangés par points, du plus au moins servi, et à
// points égaux restent dans l'ordre où on les a donnés. Sans direction active,
// ou sans sujet qui en serve une, l'ordre donné est rendu tel quel.
import type { Direction } from "./directions.ts";

// Un sujet rangé. `score` : ses points, la somme sur les directions qu'il sert ;
// `directions` : les numéros de ces directions, dans l'ordre des directions.
export type SujetRange<T> = { sujet: T; score: number; directions: number[] };

// Les mots qui ne portent pas de sens à eux seuls : ceux de la langue, et ceux
// par lesquels le chef dit qu'il dirige (« focus », « this month ») sans dire
// vers quoi. Anglais d'abord — la langue des issues —, français ensuite.
const VIDES = new Set(
  [
    "the", "and", "for", "with", "that", "this", "these", "those", "from", "into", "onto", "about", "over", "under", "than", "then", "them", "they", "their", "there", "here",
    "are", "was", "were", "been", "being", "have", "has", "had", "will", "would", "should", "could", "can", "may", "might", "must", "shall", "does", "did", "not", "but", "all", "any",
    "our", "your", "its", "who", "what", "when", "where", "which", "why", "how", "each", "every", "some", "such", "only", "also", "just", "very", "too", "more", "less", "most", "least",
    "until", "now", "next", "first", "last", "new", "please", "make", "sure", "get", "let", "put", "keep", "start", "stop",
    "focus", "focused", "priority", "priorities", "prioritize", "direction", "directions", "goal", "goals",
    "day", "days", "week", "weeks", "month", "months", "quarter", "quarters", "year", "years", "today", "tomorrow", "soon",
    "les", "des", "une", "est", "sont", "pour", "dans", "sur", "par", "avec", "sans", "que", "qui", "quoi", "pas", "plus", "moins", "tout", "tous", "toute", "toutes", "mois", "semaine", "jour", "jours", "cette", "ces", "son", "ses", "leur", "leurs",
  ].map((mot) => racine(mot)),
);

// La racine d'un mot : en minuscules, sans accents, sans les terminaisons qui
// ne changent pas ce dont il parle (« onboarding » → « onboard », « issues » → « issue »).
function racine(mot: string): string {
  const nu = mot.normalize("NFD").replace(/\p{M}/gu, "").toLowerCase();
  for (const fin of ["ing", "ed", "s"]) if (nu.endsWith(fin) && nu.length - fin.length >= 4) return nu.slice(0, -fin.length);
  return nu;
}

// Les mots porteurs d'un texte : trois lettres au moins, ni vides, ni dates, ni
// adresses — un lien n'est pas un sujet.
export function motsPorteurs(texte: string): Set<string> {
  const sansLiens = texte.replace(/\bhttps?:\/\/\S+/g, " ").replace(/^[\s>*_-]*until[\s*_]*:.*$/gim, " ");
  const mots = new Set<string>();
  for (const brut of sansLiens.split(/[^\p{L}\p{N}]+/u)) {
    if (brut.length < 3 || /^\p{N}+$/u.test(brut)) continue;
    const mot = racine(brut);
    if (!VIDES.has(mot)) mots.add(mot);
  }
  return mots;
}

const motsDeLaDirection = (direction: Direction) => motsPorteurs([direction.titre, direction.texte, ...direction.commentaires.map(({ texte }) => texte)].join("\n"));

// Range les sujets par ce qu'ils servent des directions. `texte` : ce qui se
// lit d'un sujet — son titre, son contexte.
export function rangerParDirections<T>(sujets: readonly T[], directions: readonly Direction[], texte: (sujet: T) => string): SujetRange<T>[] {
  const porteurs = directions.map((direction) => ({ numero: direction.numero, mots: motsDeLaDirection(direction) }));
  const ranges = sujets.map((sujet, rang) => {
    const mots = motsPorteurs(texte(sujet));
    let score = 0;
    const servies: number[] = [];
    for (const { numero, mots: deLaDirection } of porteurs) {
      let communs = 0;
      for (const mot of deLaDirection) if (mots.has(mot)) communs++;
      if (communs === 0) continue;
      score += communs;
      servies.push(numero);
    }
    return { rang, range: { sujet, score, directions: servies } };
  });
  return ranges.sort((a, b) => b.range.score - a.range.score || a.rang - b.rang).map(({ range }) => range);
}
