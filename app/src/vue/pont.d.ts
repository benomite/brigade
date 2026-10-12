// Ce que le process principal offre à la vue (preload.cjs).
import type { Montree } from "../attend.ts";
import type { Configuration, Declare } from "../config.ts";
import type { Terminal } from "../terminaux.ts";

export type Pont = {
  demarrage(): Promise<{ configuration: Configuration; exemple: string }>;
  // Le dossier que le chef a choisi — rien, s'il a renoncé.
  choisirDossier(): Promise<string | undefined>;
  // Rend la raison, si le projet n'a pas été ajouté. Ajouté, il arrive par `surConfiguration`.
  ajouter(projet: Declare): Promise<string | undefined>;
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
  surLecture(recevoir: (lecture: Montree) => void): void;
  // Le fichier des projets a changé. `fermes` : les terminaux des projets qui ont quitté la liste.
  surConfiguration(recevoir: (configuration: Configuration, fermes: number[]) => void): void;
};

declare global {
  interface Window {
    brigade: Pont;
  }
}
