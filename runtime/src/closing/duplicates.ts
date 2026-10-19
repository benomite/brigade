// Les doublons que la fermeture repère : des lignes de code identiques de
// suite, à deux endroits. Du texte comparé à du texte — ni l'indentation, ni
// les lignes vides, ni les commentaires, ni les lignes de pure ponctuation ne
// comptent. Elle repère, elle ne juge pas : deux passages identiques ne sont
// pas toujours à réunir.
import type { Texte } from "./reading.ts";

// En dessous, deux passages identiques ne sont pas un doublon.
export const LIGNES_MIN = 8;
// Ce qui se compare : du code, pas de la doc ni des données.
export const CODE = /\.(ts|tsx|mts|cts|js|jsx|mjs|cjs|py|rb|go|rs|java|kt|swift|c|h|cc|cpp|hpp|cs|php|sh|bash|sql|css|scss|html|vue|svelte)$/;

// `debut`, `fin` : ses lignes dans le fichier, à partir de 1.
export type Passage = { chemin: string; debut: number; fin: number };
// `lignes` : celles de code que ses deux passages ont en commun.
export type Doublon = { lignes: number; passages: [Passage, Passage] };

const COMMENTAIRE = /^(\/\/|\/\*|\*( |\/|$)|#( |!|$)|-- |<!--)/;
// Une ligne qui compte : du code, pas un commentaire ni de la ponctuation.
const estCode = (nette: string) => /[\p{L}\p{N}]/u.test(nette) && !COMMENTAIRE.test(nette);

// Les lignes de code d'un passage, telles qu'elles se comparent : deux
// passages qui ont le même extrait sont le même doublon, où qu'ils soient
// rendus dans leurs fichiers.
export function extrait(texte: string, { debut, fin }: Pick<Passage, "debut" | "fin">): string {
  return texte
    .split("\n")
    .slice(debut - 1, fin)
    .map((brute) => brute.trim())
    .filter(estCode)
    .join("\n");
}
// Une ligne de code : son numéro dans le fichier, et celui de son texte parmi
// tous les textes rencontrés.
type Ligne = { numero: number; texte: number };
type Fichier = { chemin: string; lignes: Ligne[]; pris: Set<number> };

// Les doublons, les plus longs d'abord. Un passage copié trois fois en fait
// deux : chaque copie est donnée une fois, contre la première.
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
      pris: new Set<number>(),
    }));

  // Où commence chaque suite de `min` lignes.
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
      // Déjà donné comme la copie d'un passage vu plus tôt.
      if (fichier.pris.has(rang)) continue;
      // Dans un même fichier, deux passages ne se recouvrent pas.
      const separes = (autre: { fichier: Fichier; rang: number }, longueur: number) => autre.fichier !== fichier || Math.abs(autre.rang - rang) >= longueur;
      const autre = suites.get(suite(fichier, rang))?.find((lieu) => separes(lieu, min));
      if (autre === undefined) continue;
      let longueur = min;
      while (separes(autre, longueur + 1) && fichier.lignes[rang + longueur] !== undefined && fichier.lignes[rang + longueur]?.texte === autre.fichier.lignes[autre.rang + longueur]?.texte) longueur++;
      for (let pas = 0; pas < longueur; pas++) {
        fichier.pris.add(rang + pas);
        autre.fichier.pris.add(autre.rang + pas);
      }
      doublons.push({ lignes: longueur, passages: [passage(fichier, rang, longueur), passage(autre.fichier, autre.rang, longueur)] });
      rang += longueur - 1;
    }
  }
  return doublons.sort((a, b) => b.lignes - a.lignes || a.passages[0].chemin.localeCompare(b.passages[0].chemin) || a.passages[0].debut - b.passages[0].debut);
}
