// La livraison d'un projet avant et après qu'une leçon ou un profil est entré : de quoi
// voir si apprendre paie. Des fonctions sans effet, qui ne lisent rien — les parcours
// leur viennent de `parcours-des-tickets.ts`. Les deux chiffres se mesurent comme dans le
// relevé des renvois (`renvois.ts`) : seuls comptent les tickets mergés, et le premier
// coup est un merge sur un seul essai.
import type { Parcours } from "../renvois.ts";

// Les tickets d'un côté de la date. `retenus` : les mergés, sur lesquels portent les
// deux chiffres ; `premiers` : ceux d'entre eux livrés du premier coup ; `premierCoup` :
// leur part, entre 0 et 1 ; `essaisMoyens` : leur nombre moyen d'essais.
export type Livraison = { retenus: number; premiers: number; premierCoup: number; essaisMoyens: number };

// Avant et après la date d'entrée. Un côté sans ticket mergé est `null` : absent, ni 0
// ni NaN.
export type AvantApres = { avant: Livraison | null; apres: Livraison | null };

function livraison(essais: number[]): Livraison | null {
  if (essais.length === 0) return null;
  const premiers = essais.filter((n) => n === 1).length;
  return { retenus: essais.length, premiers, premierCoup: premiers / essais.length, essaisMoyens: essais.reduce((somme, n) => somme + n, 0) / essais.length };
}

// `entree` : « AAAA-MM-JJ ». Un ticket pris avant ce jour est d'avant ; pris ce jour ou
// après, d'après — la leçon n'a pu servir qu'un cook lancé une fois entrée.
export function avantApres(parcours: readonly Parcours[], entree: string): AvantApres {
  const avant: number[] = [];
  const apres: number[] = [];
  for (const un of parcours) {
    if (un.end?.kind !== "merged") continue;
    (un.takenAt.slice(0, 10) < entree ? avant : apres).push(un.attempts.length);
  }
  return { avant: livraison(avant), apres: livraison(apres) };
}
