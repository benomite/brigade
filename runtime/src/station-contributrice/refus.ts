// Les stations contributrices que le chef refuse (#2936, épique #2927) : la
// liste que le projet tient, en un fichier de son répertoire d'état, et que la
// prise (`reclamation.ts`) consulte avant d'écrire quoi que ce soit. Une station
// refusée ne prend aucun ticket ; la réaccepter lui rend le rail.
//
// - Seul le rôle `chef` change la liste : un autre rôle est refusé par
//   `RefusInterdit`, et le fichier n'est pas touché.
// - Un fichier absent est une liste vide ; un fichier qui ne se lit pas est une
//   erreur, jamais une liste vide qu'on écraserait au prochain geste.
import { existsSync, mkdirSync, readFileSync } from "node:fs";
import { dirname, join } from "node:path";
import { ecrireAtomique } from "../relais.ts";

export const FICHIER_DES_REFUS = "stations-refusees.json";
export const ROLE_DU_CHEF = "chef";

export const fichierDesRefus = (repertoireEtat: string) => join(repertoireEtat, FICHIER_DES_REFUS);

// Ce que lève un changement demandé par qui n'a pas le rôle `chef`.
export class RefusInterdit extends Error {
  constructor(roles: readonly string[]) {
    super(`only the chef may refuse or accept a contributor station (role${roles.length === 1 ? "" : "s"}: ${roles.length === 0 ? "none" : roles.join(", ")})`);
    this.name = "RefusInterdit";
  }
}

// Les stations refusées, dans l'ordre où elles l'ont été.
export function lireLesRefus(fichier: string): string[] {
  if (!existsSync(fichier)) return [];
  let lu: unknown;
  try {
    lu = JSON.parse(readFileSync(fichier, "utf8"));
  } catch (erreur) {
    throw new Error(`the list of refused stations (${fichier}) cannot be read: ${(erreur instanceof Error ? erreur.message : String(erreur)).split("\n")[0]}`);
  }
  const refusees = typeof lu === "object" && lu !== null && !Array.isArray(lu) ? (lu as { refused?: unknown }).refused : undefined;
  if (!Array.isArray(refusees) || !refusees.every((station) => typeof station === "string")) throw new Error(`the list of refused stations (${fichier}) is not {"refused":[<station>…]}`);
  return refusees;
}

export type Acteur = { roles: readonly string[] };

export type Refus = {
  liste(): string[];
  refuse(station: string): boolean;
  refuser(acteur: Acteur, station: string): boolean;
  reaccepter(acteur: Acteur, station: string): boolean;
};

export function ouvrirLesRefus(fichier: string): Refus {
  const ecrire = (stations: string[]) => {
    mkdirSync(dirname(fichier), { recursive: true });
    ecrireAtomique(fichier, JSON.stringify({ refused: stations }));
  };
  const exiger = (acteur: Acteur) => {
    if (!acteur.roles.includes(ROLE_DU_CHEF)) throw new RefusInterdit(acteur.roles);
  };
  return {
    liste: () => lireLesRefus(fichier),
    refuse: (station) => lireLesRefus(fichier).includes(station),
    // Rend vrai si la liste a changé.
    refuser(acteur, station) {
      exiger(acteur);
      const refusees = lireLesRefus(fichier);
      if (refusees.includes(station)) return false;
      ecrire([...refusees, station]);
      return true;
    },
    reaccepter(acteur, station) {
      exiger(acteur);
      const refusees = lireLesRefus(fichier);
      if (!refusees.includes(station)) return false;
      ecrire(refusees.filter((autre) => autre !== station));
      return true;
    },
  };
}
