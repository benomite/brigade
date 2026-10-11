// Ce que le process principal offre à la vue (preload.cjs).
import type { Lecture } from "../box.ts";
import type { Configuration } from "../config.ts";
import type { Terminal } from "../terminaux.ts";

export type Pont = {
  demarrage(): Promise<{ configuration: Configuration; exemple: string }>;
  espace(projet: string): Promise<Terminal[]>;
  shell(projet: string): Promise<Terminal>;
  // Le projet dont l'espace est affiché : sa box est lue, elle seule.
  // `demande` revient sur chaque lecture qui y répond.
  regarder(projet: string, demande: number): void;
  // La kitchen est affichée : toutes les box sont lues, chacune pour elle-même.
  kitchen(demande: number): void;
  ecrire(id: number, donnees: string): void;
  redimensionner(id: number, colonnes: number, lignes: number): void;
  surSortie(recevoir: (id: number, donnees: string) => void): void;
  surEtat(recevoir: (terminal: Terminal) => void): void;
  surLecture(recevoir: (lecture: Lecture) => void): void;
};

declare global {
  interface Window {
    brigade: Pont;
  }
}
