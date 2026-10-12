// Ce que le process principal offre à la vue (preload.cjs).
import type { Montree } from "../attend.ts";
import type { Affichee } from "../barre.ts";
import type { Bouton } from "../boutons.ts";
import type { Lecture } from "../box.ts";
import type { Declare } from "../config.ts";
import type { Onglet } from "../onglets.ts";
import type { Terminal } from "../terminaux.ts";

export type Pont = {
  demarrage(): Promise<{ configuration: Affichee; exemple: string; onglets: readonly Onglet[]; boutons: readonly Bouton[] }>;
  // Le dossier que le chef a choisi — rien, s'il a renoncé.
  choisirDossier(): Promise<string | undefined>;
  // Rend la raison, si le projet n'a pas été ajouté. Ajouté, il arrive par `surConfiguration`.
  ajouter(projet: Declare): Promise<string | undefined>;
  espace(projet: string): Promise<Terminal[]>;
  shell(projet: string): Promise<Terminal>;
  // Un bouton d'action : sa commande est écrite dans le second du projet, sans être envoyée.
  // Rend le second, dont la note dit ce qui a été écrit — ou pourquoi rien ne l'a été, sans
  // toucher au second. Rien, pour un projet sans box.
  inscrire(projet: string, bouton: string): Promise<Terminal | { refus: string } | undefined>;
  // Le projet dont l'espace est affiché : sa box est lue, elle seule — `status`, pour le panneau.
  // `demande` revient sur chaque lecture qui y répond.
  regarder(projet: string, demande: number): void;
  // La kitchen est affichée : toutes les box sont lues, chacune pour elle-même.
  kitchen(demande: number): void;
  // L'onglet de contenu affiché : sa commande est lue, elle seule. Sans onglet
  // — un terminal, la kitchen — plus rien n'est lu pour lui.
  onglet(projet: string | undefined, id: string | undefined, demande: number): void;
  ecrire(id: number, donnees: string): void;
  redimensionner(id: number, colonnes: number, lignes: number): void;
  surSortie(recevoir: (id: number, donnees: string) => void): void;
  surEtat(recevoir: (terminal: Terminal) => void): void;
  surLecture(recevoir: (lecture: Montree) => void): void;
  // Ce que la commande de l'onglet affiché a rendu, mot pour mot.
  surContenu(recevoir: (lecture: Lecture) => void): void;
  // Le fichier des projets a changé. `fermes` : les terminaux des projets qui ont quitté la liste.
  surConfiguration(recevoir: (configuration: Affichee, fermes: number[]) => void): void;
};

declare global {
  interface Window {
    brigade: Pont;
  }
}
