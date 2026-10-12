// Ce que le process principal offre à la vue (preload.cjs).
import type { Montree } from "../attend.ts";
import type { Affichee } from "../barre.ts";
import type { Bouton } from "../boutons.ts";
import type { Lecture } from "../box.ts";
import type { Declare } from "../config.ts";
import type { BANNIERE, Dessinable } from "../faits.ts";
import type { EFFORTS, Issue, MODELES, Saisie } from "../installation.ts";
import type { Onglet } from "../onglets.ts";
import type { Parcours } from "../service.ts";
import type { Terminal } from "../terminaux.ts";

export type Pont = {
  demarrage(): Promise<{ configuration: Affichee; exemple: string; onglets: readonly Onglet[]; boutons: readonly Bouton[]; banniere: typeof BANNIERE; calibrage: { modeles: typeof MODELES; efforts: typeof EFFORTS } }>;
  // Le dossier que le chef a choisi — rien, s'il a renoncé.
  choisirDossier(): Promise<string | undefined>;
  // Le dépôt GitHub du dossier choisi, lu dans son origine — ou pourquoi il reste à écrire.
  lireDepot(dossier: string): Promise<{ depot: string } | { raison: string } | undefined>;
  // Déclare une box, par son nom. Rend la raison, si elle ne l'a pas été. Déclarée, elle arrive par `surConfiguration`.
  declarerBox(hote: string): Promise<string | undefined>;
  // L'ajout : le projet est installé sur sa box, puis déclaré dans l'app — ou ce qui l'a
  // empêché, champ par champ ou d'un bloc. Ajouté, il arrive par `surConfiguration`.
  installer(saisie: Saisie): Promise<Issue>;
  // Un projet que la box sert déjà, déclaré dans l'app tel qu'il y est : rien ne part vers elle.
  // Rend la raison, s'il ne l'a pas été.
  ajouter(projet: Declare): Promise<string | undefined>;
  // Pourquoi la box refuserait ce nom — rien, si elle l'accepte ou s'il est vide.
  formeDuNom(nom: string): Promise<string | undefined>;
  // La mise en service d'un projet, prête à poser — rien, pour un projet sans box ou qui a quitté le fichier.
  service(projet: string): Promise<Parcours | undefined>;
  // Ouvre dans le second du projet la session qui amorce son dépôt (`/brigade:init`) : rend le
  // second, dont la note dit ce qui a été lancé — ou pourquoi rien ne l'a été.
  amorcer(projet: string): Promise<Terminal | { refus: string }>;
  // Le chef dit le résultat de l'init mergé sur la branche d'intégration, ou s'en dédit.
  direMerge(projet: string, merge: boolean): Promise<Parcours | undefined>;
  // Lance `installation` sur la box du projet, et rend la mise en service telle qu'elle en sort.
  // Rien ne part tant que l'init n'est pas dit mergé.
  verifier(projet: string): Promise<Parcours | undefined>;
  // Écrit le démarrage du projet dans un shell de son espace, sans l'envoyer : rend ce shell —
  // ou pourquoi rien n'est écrit, tant qu'`installation` ne dit pas le projet prêt.
  demarrer(projet: string): Promise<Terminal | { refus: string }>;
  espace(projet: string): Promise<Terminal[]>;
  shell(projet: string): Promise<Terminal>;
  // Un bouton d'action : sa commande est écrite dans le second du projet, sans être envoyée.
  // Rend le second, dont la note dit ce qui a été écrit — ou pourquoi rien ne l'a été, sans
  // toucher au second. Rien, pour un projet sans box.
  inscrire(projet: string, bouton: string): Promise<Terminal | { refus: string } | undefined>;
  // Le projet dont l'espace est affiché : sa box est lue, elle seule — `status`, pour le panneau.
  // `demande` revient sur chaque lecture qui y répond.
  regarder(projet: string, demande: number): void;
  // « Tous les projets » est affiché : toutes les box sont lues, chacune pour elle-même.
  tous(demande: number): void;
  // L'onglet de contenu affiché : sa commande est lue, elle seule. Sans onglet
  // — un terminal, « Tous les projets » — plus rien n'est lu pour lui.
  onglet(projet: string | undefined, id: string | undefined, demande: number): void;
  // La barre est posée : `faits` est lu sur la box de chaque projet, quel que soit l'écran.
  faits(demande: number): void;
  // Un ticket du rail, ouvert sur son issue dans le navigateur. Faux : l'adresse que la box
  // a rendue pour lui n'est pas en https, il n'est plus dans les derniers faits lus, ou le
  // poste n'a pas pu l'ouvrir.
  ouvrirIssue(projet: string, ticket: number): Promise<boolean>;
  ecrire(id: number, donnees: string): void;
  redimensionner(id: number, colonnes: number, lignes: number): void;
  surSortie(recevoir: (id: number, donnees: string) => void): void;
  surEtat(recevoir: (terminal: Terminal) => void): void;
  surLecture(recevoir: (lecture: Montree) => void): void;
  // Ce que la commande de l'onglet affiché a rendu, mot pour mot.
  surContenu(recevoir: (lecture: Lecture) => void): void;
  // Ce que `faits` a rendu pour un projet : de quoi dessiner, ou ce qui a été obtenu à la place.
  surFaits(recevoir: (recue: Dessinable) => void): void;
  // Le fichier des projets a changé. `fermes` : les terminaux des projets qui ont quitté la liste.
  surConfiguration(recevoir: (configuration: Affichee, fermes: number[]) => void): void;
};

declare global {
  interface Window {
    brigade: Pont;
  }
}
