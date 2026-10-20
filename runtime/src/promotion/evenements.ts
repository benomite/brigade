// Les faits de la livraison du carnet (`promotion/livrer.ts`) : ce que les
// décisions sur les leçons font du carnet du dépôt — une branche qui ne porte
// que lui, une PR, remise à la pass comme une livraison.
import type { Lesson } from "../carnet/carnet.ts";
import type { Changement } from "./changement.ts";

// Une leçon que la livraison change dans le carnet : `after`, son entrée une
// fois la PR mergée — null, elle n'y est plus (rétrogradée, redevenue
// provisoire). C'est par elle qu'une leçon promue puis absente du carnet de la
// base se reconnaît retirée par un revert.
export type LeconChangee = { id: string; after: Lesson | null };

// `run` : la livraison, qui nomme sa branche (`branch`) comme celle d'un cook.
// `decisions` : ce qu'elle livre, chacune avec les rétros qui la justifient.
export type LivraisonDuCarnet = { run: string; branch: string; decisions: Changement[]; lessons: LeconChangee[] };
// Livrée : sa PR (`pr`, `number`) et le commit poussé (`sha`).
export type CarnetLivre = LivraisonDuCarnet & { pr: string; number: number; sha: string };
// Non livrée : `reason` dit pourquoi ; `branch` est nulle si elle n'a pas pu
// naître.
export type CarnetNonLivre = { run: string; branch: string | null; reason: string };

export type FaitCarnet =
  // Chaque fois qu'une livraison part : des décisions à livrer, et aucune PR
  // du carnet en cours.
  | { type: "carnet.started"; payload: LivraisonDuCarnet }
  // L'un ou l'autre, une fois par livraison : une PR au plus.
  | { type: "carnet.delivered"; payload: CarnetLivre }
  | { type: "carnet.undelivered"; payload: CarnetNonLivre };
