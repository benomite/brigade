// Ce que le process principal offre à la vue (preload.cjs).
import type { Bande } from "../alertes.ts";
import type { ALLUMAGE, Compte } from "../allumage.ts";
import type { Montree } from "../attend.ts";
import type { Affichee } from "../barre.ts";
import type { Bouton } from "../boutons.ts";
import type { Lecture } from "../box.ts";
import type { Declare } from "../config.ts";
import type { GESTES_DE_LA_CUISINE } from "../cuisine.ts";
import type { BANNIERE, Dessinable } from "../faits.ts";
import type { Confirmation } from "../confirmation.ts";
import type { CONFIRMES, DIRECTS, GRANTS } from "../gestes.ts";
import type { GESTES_DES_GRANTS, Vu as VuDesGrants } from "../grants.ts";
import type { EFFORTS, Issue, MODELES, Saisie } from "../installation.ts";
import type { GESTES_DU_MANAGER, Vu } from "../manager.ts";
import type { Onglet, Rubrique } from "../onglets.ts";
import type { Pages } from "../page.ts";
import type { PropositionCalibrage, Racine } from "../proposition.ts";
import type { Vu as VuDuCode } from "../retard.ts";
import type { Avis, Retrait } from "../retrait.ts";
import type { Parcours } from "../service.ts";
import type { Terminal } from "../terminaux.ts";

export type Pont = {
  demarrage(): Promise<{ configuration: Affichee; exemple: string; onglets: readonly Onglet[]; rubriques: readonly Rubrique[]; boutons: readonly Bouton[]; gestes: { manager: typeof GESTES_DU_MANAGER; allumage: typeof ALLUMAGE; cuisine: typeof GESTES_DE_LA_CUISINE; grants: { gestes: typeof GESTES_DES_GRANTS; nommes: typeof GRANTS }; directs: typeof DIRECTS; confirmes: typeof CONFIRMES }; banniere: typeof BANNIERE; calibrage: { modeles: typeof MODELES; efforts: typeof EFFORTS }; code: VuDuCode | undefined }>;
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
  // Le calibrage que l'écran propose, et d'où il vient (proposition.ts).
  proposerCalibrage(): Promise<PropositionCalibrage>;
  // La racine des sauvegardes lue sur la box — rien, pour un nom qui n'est pas une box déclarée.
  proposerRacine(hote: string): Promise<Racine | undefined>;
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
  // Les deux gestes qui retirent un projet, prêts à poser — rien, pour un projet qui a quitté le fichier.
  retrait(projet: string): Promise<Retrait | undefined>;
  // Retire le projet du fichier des projets, et rien d'autre : rien ne part vers sa box. Rend
  // l'avis à montrer — ou pourquoi il n'est pas retiré. Retiré, il part par `surConfiguration`.
  retirerDeLApp(projet: string): Promise<{ avis: Avis } | { refus: string }>;
  // Le chef coche l'option qui supprime le journal avec le projet, ou la décoche : le plan
  // rendu pour l'autre réglage ne vaut plus.
  direJournal(projet: string, coche: boolean): Promise<Retrait | undefined>;
  // Demande à la box ce qu'elle retirerait du projet, et rend le retrait tel qu'il en sort.
  // Rien n'est retiré.
  planifier(projet: string): Promise<Retrait | undefined>;
  // Désinstalle le projet de sa box — rien ne part tant que la box n'a pas rendu son plan, et
  // tant que `confirmation` n'est pas le nom du projet. Désinstallé, il arrive sans sa box par
  // `surConfiguration`.
  desinstaller(projet: string, confirmation: string): Promise<Retrait | undefined>;
  espace(projet: string): Promise<Terminal[]>;
  shell(projet: string): Promise<Terminal>;
  // Un bouton d'action : sa commande est écrite dans le second du projet, sans être envoyée — le
  // chef la complète. Rend le second, dont la note dit ce qui a été écrit — ou pourquoi rien ne
  // l'a été, sans toucher au second. Rien, pour un projet sans box.
  inscrire(projet: string, bouton: string): Promise<Terminal | { refus: string } | undefined>;
  // Une carte de T'attend (demande.ts) : une demande en prose est écrite dans le second, sans Entrée,
  // et le second est affiché. La vue nomme le projet et le ticket ; la phrase vient de ce que le bloc
  // `attend` en dit. Rien pour un ticket que le bloc ne nomme pas.
  demander(projet: string, ticket: number): Promise<Terminal | { refus: string } | undefined>;
  // Une ligne de la bande d'alertes dont le geste demande du jugement (alertes.ts, `{ demande: true }`) :
  // une demande en prose est écrite dans le second, sans Entrée. La vue nomme le projet, le sujet
  // de la ligne et ce qu'elle dit ; la phrase vient de ce que la bande en dit. Rien pour une ligne
  // qu'elle ne dit plus.
  demanderAlerte(projet: string, sujet: string, dit: string): Promise<Terminal | { refus: string } | undefined>;
  // Un geste du socle (gestes.ts) : sa commande part dans le second du projet. Rend le second, dont
  // la note dit ce qui est parti — ou pourquoi rien ne l'est, sans y toucher, quand il n'est pas dit
  // libre (occupé, devant un dialogue, saisie entamée). Rien, pour un projet sans box. `grant` :
  // celui sur lequel porte un geste de grant, par son nom. Un geste confirmé (`gestes.confirmes`, au
  // démarrage) ne part qu'avec `oui` à `true` — la vue ne le passe qu'au « oui » du chef, devant sa
  // confirmation : sans lui, rien n'est écrit, et le refus le dit.
  geste(projet: string, id: string, grant?: string, oui?: true): Promise<Terminal | { refus: string } | undefined>;
  // Ce qu'un geste confirmé coûte, à dire avant son « oui » (confirmation.ts) : tiré des derniers
  // faits lus du projet. Rien ne part. Rien, pour un geste qui ne se confirme pas.
  confirmer(projet: string, id: string, grant?: string): Promise<Confirmation | { refus: string } | undefined>;
  // Un clone en retard sur son origine (retard.ts) : sa mise à jour, `git -C <clone> pull`, est
  // écrite dans un shell de l'espace d'un projet, ouvert pour elle, sans être envoyée. Rend ce
  // shell — son projet est celui où il s'est ouvert — ou pourquoi rien n'est écrit. Rien, pour un
  // clone qui n'est pas en retard.
  ecrireMiseAJour(clone: string): Promise<Terminal | { refus: string } | undefined>;
  // Ce qu'engage l'allumage du manager, chiffré (allumage.ts) : les issues ouvertes du projet, et
  // celles qui portent `blocked-on-human` — `manager backlog`, lancée une fois sur sa box. Demandé
  // quand la confirmation d'« allumer » s'ouvre : son « oui » n'attend pas cette lecture. Rien, pour un projet sans box.
  compter(projet: string): Promise<Compte | undefined>;
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
  // La page d'un worktree servi, ouverte dans le navigateur du poste : la vue nomme le projet et
  // le worktree, le port est celui que `status` a montré pour lui (page.ts). Rend les pages du
  // projet telles qu'elles en sortent — ce que le geste a donné, ou pourquoi rien n'est parti.
  // Rien, pour un projet sans box ou qui a quitté le fichier.
  ouvrirPage(projet: string, worktree: string): Promise<Pages | undefined>;
  ecrire(id: number, donnees: string): void;
  redimensionner(id: number, colonnes: number, lignes: number): void;
  surSortie(recevoir: (id: number, donnees: string) => void): void;
  surEtat(recevoir: (terminal: Terminal) => void): void;
  // `servies` : les serveurs que le `status` de cette lecture montre, et le geste de chacun (page.ts).
  surLecture(recevoir: (lecture: Montree, servies: Pages) => void): void;
  // Ce que la commande de l'onglet affiché a rendu, mot pour mot. `manager` : dans l'onglet
  // Manager, ce qui se pose au-dessus — l'état du manager, lu dans cette sortie (manager.ts).
  // `grants` : dans l'onglet Grants, de même — l'état des grants (grants.ts).
  surContenu(recevoir: (lecture: Lecture, manager: Vu | undefined, grants: VuDesGrants | undefined) => void): void;
  // Ce que `faits` a rendu pour un projet : de quoi dessiner, ou ce qui a été obtenu à la place.
  surFaits(recevoir: (recue: Dessinable) => void): void;
  // La bande d'alertes d'un projet, redessinée à chaque lecture qui la change (alertes.ts) :
  // vide, les quatre états ont été lus et vont bien.
  surAlertes(recevoir: (bande: Bande) => void): void;
  // Le retard du code de l'app sur son origine, et celui des clones de brigade parmi les projets,
  // relus : au démarrage, au retour à la fenêtre, quand le fichier des projets change. La
  // dernière lecture d'avant le démarrage de la vue est dans `demarrage`.
  surCode(recevoir: (vu: VuDuCode) => void): void;
  // Le fichier des projets a changé — ou l'app vient de désinstaller un projet de sa box.
  // `fermes` : les terminaux des projets qui ont quitté la liste.
  surConfiguration(recevoir: (configuration: Affichee, fermes: number[]) => void): void;
};

declare global {
  interface Window {
    brigade: Pont;
  }
}
