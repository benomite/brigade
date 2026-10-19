// The duplicates the closing spots: identical lines of code in a row, in two
// places. Text compared to text — neither indentation, nor blank lines, nor
// comments, nor lines of pure punctuation count. It spots, it does not judge:
// two identical passages are not always to be merged.
import type { Texte } from "./reading.ts";

// Below this, two identical passages are not a duplicate.
export const LIGNES_MIN = 8;
// What is compared: code, not docs or data.
export const CODE = /\.(ts|tsx|mts|cts|js|jsx|mjs|cjs|py|rb|go|rs|java|kt|swift|c|h|cc|cpp|hpp|cs|php|sh|bash|sql|css|scss|html|vue|svelte)$/;

// `debut`, `fin`: its lines in the file, counting from 1.
export type Passage = { chemin: string; debut: number; fin: number };
// `lignes`: the lines of code its two passages have in common.
export type Doublon = { lignes: number; passages: [Passage, Passage] };

const COMMENTAIRE = /^(\/\/|\/\*|\*( |\/|$)|#( |!|$)|-- |<!--)/;
// A line that counts: code, not a comment or punctuation.
const estCode = (nette: string) => /[\p{L}\p{N}]/u.test(nette) && !COMMENTAIRE.test(nette);

// The lines of code of a passage, as they are compared: two passages with the
// same excerpt are the same duplicate, wherever they are rendered in their
// files.
export function extrait(texte: string, { debut, fin }: Pick<Passage, "debut" | "fin">): string {
  return texte
    .split("\n")
    .slice(debut - 1, fin)
    .map((brute) => brute.trim())
    .filter(estCode)
    .join("\n");
}
// A line of code: its number in the file, and that of its text among all the
// texts met.
type Ligne = { numero: number; texte: number };
type Fichier = { chemin: string; lignes: Ligne[]; covered: Set<number> };

// The duplicates, the longest first. A passage copied three times makes two:
// each copy is given once, against the first.
export function repererDoublons(textes: Texte[], min = LIGNES_MIN): Doublon[] {
  const connus = new Map<string, number>();
  const numeroter = (texte: string) => connus.get(texte) ?? (connus.set(texte, connus.size), connus.size - 1);
  const fichiers: Fichier[] = textes
    .filter(({ chemin }) => CODE.test(chemin))
    .map(({ chemin, texte }) => ({
      chemin,
      lignes: texte.split("\n").flatMap((brute, rang) => {
        const nette = brute.trim();
        return estCode(nette) ? [{ numero: rang + 1, texte: numeroter(nette) }] : [];
      }),
      covered: new Set<number>(),
    }));

  // Where each run of `min` lines starts.
  const suite = ({ lignes }: Fichier, rang: number) => lignes.slice(rang, rang + min).map(({ texte }) => texte).join(" ");
  const suites = new Map<string, Array<{ fichier: Fichier; rang: number }>>();
  for (const fichier of fichiers) {
    for (let rang = 0; rang + min <= fichier.lignes.length; rang++) {
      const cle = suite(fichier, rang);
      const lieux = suites.get(cle);
      if (lieux) lieux.push({ fichier, rang });
      else suites.set(cle, [{ fichier, rang }]);
    }
  }

  const doublons: Doublon[] = [];
  const passage = ({ chemin, lignes }: Fichier, rang: number, longueur: number): Passage => ({ chemin, debut: lignes[rang]?.numero ?? 0, fin: lignes[rang + longueur - 1]?.numero ?? 0 });
  for (const fichier of fichiers) {
    for (let rang = 0; rang + min <= fichier.lignes.length; rang++) {
      // Already given as the copy of a passage seen earlier.
      if (fichier.covered.has(rang)) continue;
      // Within one file, two passages do not overlap.
      const separes = (autre: { fichier: Fichier; rang: number }, longueur: number) => autre.fichier !== fichier || Math.abs(autre.rang - rang) >= longueur;
      const autre = suites.get(suite(fichier, rang))?.find((lieu) => separes(lieu, min));
      if (autre === undefined) continue;
      let longueur = min;
      while (separes(autre, longueur + 1) && fichier.lignes[rang + longueur] !== undefined && fichier.lignes[rang + longueur]?.texte === autre.fichier.lignes[autre.rang + longueur]?.texte) longueur++;
      for (let pas = 0; pas < longueur; pas++) {
        fichier.covered.add(rang + pas);
        autre.fichier.covered.add(autre.rang + pas);
      }
      doublons.push({ lignes: longueur, passages: [passage(fichier, rang, longueur), passage(autre.fichier, autre.rang, longueur)] });
      rang += longueur - 1;
    }
  }
  return doublons.sort((a, b) => b.lignes - a.lignes || a.passages[0].chemin.localeCompare(b.passages[0].chemin) || a.passages[0].debut - b.passages[0].debut);
}
