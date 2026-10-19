// Ce que le process principal offre à la vue (preload.cjs).
import type { Accueil } from "../accueil.ts";
import type { Bande } from "../alertes.ts";
import type { ALLUMAGE, Compte } from "../allumage.ts";
import type { Vu as VuAmont } from "../amont.ts";
import type { Montree } from "../attend.ts";
import type { Affichee } from "../barre.ts";
import type { Bouton } from "../boutons.ts";
import type { Lecture } from "../box.ts";
import type { PALETTE, Role } from "../couleurs.ts";
import type { GESTES_DE_LA_CUISINE } from "../cuisine.ts";
import type { BANNIERE, Dessinable } from "../faits.ts";
import type { Vu as VuDeLaFiabilite } from "../fiabilite.ts";
import type { Action, Rendu as RenduDuCloser } from "../closer-lancement.ts";
import type { Confirmation } from "../confirmation.ts";
import type { CONFIRMES, DIRECTS, GRANTS } from "../gestes.ts";
import type { GESTES_D_ATTENTE, Saisie as SaisieDAttente } from "../attente.ts";
import type { GESTES_DES_GRANTS, Vu as VuDesGrants } from "../grants.ts";
import type { Issue, Lu, Saisie } from "../ajout.ts";
import type { GESTES_DU_MANAGER, Vu } from "../manager.ts";
import type { Onglet, Rubrique } from "../onglets.ts";
import type { Bloc } from "../ordinaires.ts";
import type { Pages } from "../page.ts";
import type { RenduDePanne } from "../pannes/gestes.ts";
import type { Lue as QuestionLue, Rendue as ReponseRendue } from "../question.ts";
import type { Vu as VuDuCode } from "../retard.ts";
import type { Avis, Retrait } from "../retrait.ts";
import type { Guide } from "../service.ts";
import type { DepotDuChef } from "../projets/github.ts";
import type { Ajout, EFFORTS, MODELES, Retrait as RetraitDUneStation, VuDesProjets } from "../projets/projets.ts";
import type { Appairage, RetraitDeStation, VuDesStations } from "../stations/stations.ts";
import type { Terminal } from "../terminaux.ts";

export type Pont = {
  demarrage(): Promise<{ configuration: Affichee; palette: typeof PALETTE; exemple: string; onglets: readonly Onglet[]; rubriques: readonly Rubrique[]; boutons: readonly Bouton[]; gestes: { manager: typeof GESTES_DU_MANAGER; allumage: typeof ALLUMAGE; cuisine: typeof GESTES_DE_LA_CUISINE; grants: { gestes: typeof GESTES_DES_GRANTS; nommes: typeof GRANTS }; directs: typeof DIRECTS; confirmes: typeof CONFIRMES; attente?: typeof GESTES_D_ATTENTE }; banniere: typeof BANNIERE; calibrage: { modeles: typeof MODELES; efforts: typeof EFFORTS }; code: VuDuCode | undefined; stations?: VuDesStations; projetsDesStations?: VuDesProjets; accueil?: Accueil }>;
  // Le dossier que le chef a choisi — rien, s'il a renoncé.
  choisirDossier(): Promise<string | undefined>;
  // Le dépôt GitHub et la branche d'intégration du dossier choisi, lus dans son clone — ou pourquoi ils restent à écrire.
  lireClone(dossier: string): Promise<Lu | undefined>;
  // L'ajout : le projet est écrit dans le fichier des projets, avec son dépôt et sa branche — ou ce
  // qui l'a empêché, champ par champ ou d'un bloc. Rien ne part vers aucune machine. Ajouté, il arrive par `surConfiguration`.
  ajouter(saisie: Saisie): Promise<Issue>;
  // Change la couleur d'onglet ou d'accent d'un projet, par le nom d'une couleur de la palette
  // (couleurs.ts). Rend la raison, si elle ne l'a pas été. Écrite, elle arrive par `surConfiguration`.
  colorer(projet: string, role: Role, couleur: string): Promise<string | undefined>;
  // Le bloc « tickets ordinaires » du Mac pour un projet (ordinaires.ts) — rien, quand l'option n'existe pas ici.
  ordinaires(projet: string): Promise<Bloc | undefined>;
  // Règle l'option et la limite de cooks du Mac (`null` : aucune). Rend la raison, si rien n'a été écrit.
  reglerOrdinaires(projet: string, actif: boolean, limite: number | null): Promise<string | undefined>;
  // Range un projet à la place `rang` de la barre, comptée depuis zéro parmi les projets : les autres
  // se décalent. Rend la raison, s'il ne l'a pas été. Rangé, le nouvel ordre arrive par `surConfiguration`.
  ranger(projet: string, rang: number): Promise<string | undefined>;
  // L'installation guidée d'un projet (service.ts), relue sur sa box : ses étapes, leur état, la
  // courante et ce qu'elle demande — rien, pour un projet sans box ou qui a quitté le fichier.
  // Ouverte ou en cours, la vérification d'ouverture part une fois. Ce qui change ensuite arrive par `surGuide`.
  service(projet: string): Promise<Guide | undefined>;
  // Le chef déplie l'installation : elle se lit en entier, vérification d'ouverture comprise.
  deplierService(projet: string): Promise<Guide | undefined>;
  // Ouvre dans le second du projet la session qui amorce son dépôt (`/brigade:init`) : rend le
  // second, dont la note dit ce qui a été lancé — ou pourquoi rien ne l'a été.
  amorcer(projet: string): Promise<Terminal | { refus: string }>;
  // Le chef dit le résultat de l'init mergé sur la branche d'intégration, ou s'en dédit : la box le note.
  // Les gestes de l'installation qui suivent rendent la raison s'ils ne sont pas partis ; ce qu'ils
  // ont fait arrive par `surGuide`.
  direMerge(projet: string, merge: boolean): Promise<{ refus: string } | undefined>;
  // Lance `installation` sur la box du projet : tout ce qui manque, d'un coup.
  verifier(projet: string): Promise<{ refus: string } | undefined>;
  // Déclare les stations choisies parmi celles que la box fournit, chacune à son plafond de cooks.
  declarerStations(projet: string, choix: { nom: string; cooks: number }[]): Promise<{ refus: string } | undefined>;
  // Protège la branche d'intégration sur GitHub.
  proteger(projet: string): Promise<{ refus: string } | undefined>;
  // Répond à la décision courante — deux valeurs quand elle se répond avec une autre.
  repondre(projet: string, valeurs: string[]): Promise<{ refus: string } | undefined>;
  // Passe les décisions que le démarrage ne réclame pas : l'étape est notée faite.
  passerDecisions(projet: string): Promise<{ refus: string } | undefined>;
  // La box revérifie tout et termine l'installation si c'est vert ; alors le démarrage du service est
  // écrit dans un shell de l'espace, sans être envoyé : rend ce shell — ou pourquoi rien n'est écrit.
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
  // « + shell » : les machines où un shell persistant peut s'ouvrir — ce poste, la box, les stations.
  machines(projet: string): Promise<{ id: string; titre: string }[]>;
  // Un shell persistant sur la machine choisie, par son identifiant — ou pourquoi rien ne s'est ouvert.
  shell(projet: string, machine: string): Promise<Terminal | { refus: string }>;
  // Ferme un shell pour de bon : sa session est détruite — ou la raison, quand elle n'a pas pu l'être.
  fermerShell(id: number): Promise<{ ferme: true } | { refus: string }>;
  // Un bouton d'action : sa commande est écrite dans le second du projet, sans être envoyée — le
  // chef la complète. Rend le second, dont la note dit ce qui a été écrit — ou pourquoi rien ne
  // l'a été, sans toucher au second. Rien, pour un projet sans box. `valeurs` : celles que le geste
  // attend de la page — le modèle et l'effort du closer, pour « regler-closer » (boutons.ts).
  inscrire(projet: string, bouton: string, valeurs?: readonly string[]): Promise<Terminal | { refus: string } | undefined>;
  // Une carte de T'attend (demande.ts) : une demande en prose est écrite dans le second, sans Entrée,
  // et le second est affiché. La vue nomme le projet et le ticket ; la phrase vient de ce que le bloc
  // `attend` en dit. Rien pour un ticket que le bloc ne nomme pas.
  demander(projet: string, ticket: number): Promise<Terminal | { refus: string } | undefined>;
  // La question qu'une carte de T'attend pose, telle qu'elle est écrite sur son issue (question.ts) :
  // l'issue lue par le `gh` du poste. La vue nomme le projet et le ticket. Rien pour un ticket que
  // le bloc `attend` ne nomme pas.
  lireQuestion(projet: string, ticket: number): Promise<QuestionLue | undefined>;
  // Ce que la fiche dit d'un ticket vivant — ce que son cook fait, ou ce qui le bloque —, d'après
  // la carte cliquée (histoire.ts, `situation`). Rien pour un ticket que la cuisine ne tient pas.
  situation(carte: { etat?: string; attend: string[]; dit: { libelle: string; valeur: string }[] }): Promise<import("../histoire.ts").Situation>;
  // Les gestes de la fiche de cette carte, à cet instant, chacun avec son prix (gestes-fiche.ts) :
  // ceux qui tranchent ce qu'on attend du chef, puis ceux que la table du chef permet pour son
  // état, et dont l'action est branchée.
  gestesDeFiche(carte: { ticket: number; etat?: string; ouvrable: boolean; attendu: boolean; decision?: import("../decision.ts").Decision; pr?: boolean }): Promise<import("../gestes-fiche.ts").Propose[]>;
  // Un geste de la fiche que la vue ne joue pas : une action de box, qui part dans le second.
  gesteDeFiche(projet: string, id: string, ticket: number, valeur?: string): Promise<Terminal | { refus: string }>;
  // L'histoire d'un ticket et son coût, lus par `pass <ticket> --json` sur la box (histoire.ts).
  lireHistoire(projet: string, ticket: number): Promise<import("../histoire.ts").Histoire | undefined>;
  // L'issue d'un ticket et sa discussion (discussion.ts), lues sur la box du projet à l'ouverture de
  // sa fiche : le corps, puis les commentaires dans l'ordre, le markdown rendu — ou pourquoi on n'en
  // lit rien. Rien, pour un projet qui a quitté le fichier.
  lireDiscussion(projet: string, ticket: number): Promise<import("../discussion.ts").Discussion | undefined>;
  // Poste ce texte en commentaire sur l'issue du ticket, par la box du projet : rend s'il l'a été, ou
  // pourquoi il ne l'est pas. Rien ne part d'un texte vide.
  commenter(projet: string, ticket: number, texte: string): Promise<import("../discussion.ts").Commente>;
  demanderAuSecond(projet: string, ticket: number, contexte: string): Promise<Terminal | { refus: string }>;
  // Ouvre dans le navigateur une adresse que la dernière discussion lue de ce ticket montre — et
  // aucune autre. Rend si elle a été ouverte.
  ouvrirLien(projet: string, ticket: number, url: string): Promise<boolean>;
  // Le titre d'une issue que la box ne donne pas, lu par le `gh` du poste à l'adresse que la box a rendue.
  lireTitre(projet: string, ticket: number): Promise<import("../question.ts").Titre | undefined>;
  // Une capture d'un ticket d'interface, par son écran et son moment : l'image, lue par le `gh` du
  // poste à l'adresse que la box a rendue, en `data:` — ou pourquoi elle ne l'est pas.
  lireCapture(projet: string, ticket: number, ecran: string, moment: "avant" | "apres"): Promise<import("../captures.ts").Image | undefined>;
  // Lever la retenue `blocked-on-human` d'un ticket qui t'attend : retirer le label (`label`) ou
  // fermer l'issue (`fermer`), par le `gh` du poste. Rien ne part pour un ticket que le bloc ne dit pas retenu.
  leverRetenue(projet: string, ticket: number, geste: "label" | "fermer"): Promise<import("../question.ts").Leve>;
  // Les tickets `fire` du projet, lus sur GitHub par le `gh` du poste (feu.ts) : ce que le rail sait encore quand la box ne répond pas.
  lireFeu(projet: string): Promise<import("../feu.ts").Feu | undefined>;
  // « réessayer maintenant » : les lectures de la box repartent tout de suite, au lieu d'attendre leur tour.
  relireBox(demande: number): void;
  // La réponse du chef à cette question — un choix par sa lettre, ou sa phrase —, postée sur
  // l'issue par le même `gh`. `question` : l'adresse de la question montrée — rien ne part sur une autre.
  // `vu` : l'adresse du dernier commentaire montré sous elle, vide s'il n'y en avait pas — rien ne part
  // si quelque chose y a été écrit depuis.
  repondreQuestion(projet: string, ticket: number, reponse: { question: string; vu: string; choix: string } | { question: string; vu: string; texte: string }): Promise<ReponseRendue>;
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
  // Un geste de WAITING (attente.ts), sur la carte d'un ticket : sa commande part dans le second du
  // projet, comme un geste du socle. `saisie` : ce que le chef a rempli pour « waiting for… » — ce
  // qu'il attend, de qui, le jour de la relance. Rend le second, ou pourquoi rien n'est parti.
  attente(projet: string, id: string, ticket: number, saisie?: SaisieDAttente): Promise<Terminal | { refus: string } | undefined>;
  // Un clone en retard sur son origine (retard.ts) : sa mise à jour, `git -C <clone> pull`, est
  // écrite dans un shell de l'espace d'un projet, ouvert pour elle, sans être envoyée. Rend ce
  // shell — son projet est celui où il s'est ouvert — ou pourquoi rien n'est écrit. Rien, pour un
  // clone qui n'est pas en retard.
  ecrireMiseAJour(clone: string): Promise<Terminal | { refus: string } | undefined>;
  // Le code de l'app, en retard ou à relancer : elle se met à jour et se relance sur la nouvelle
  // version — rien n'est rendu, elle se ferme —, ou dit pourquoi elle reste sur son code.
  passer(): Promise<{ refus: string } | undefined>;
  // Le code qu'une station affiche, tapé par le chef : rend le nom de la station appairée, ou le
  // refus en une ligne — code mal formé, inconnu, expiré, ou GitHub muet. Rien n'est écrit alors.
  appairer(code: string): Promise<Appairage>;
  // « Add a project » : les dépôts que le `gh` du poste peut lire, chacun avec sa branche par
  // défaut — ou pourquoi ils ne sont pas lus.
  depotsDuChef(): Promise<{ depots: DepotDuChef[] } | { refus: string }>;
  // Le parcours validé : la demande s'écrit dans le gist de chaque station choisie, et rend le nom
  // du projet — ou chaque champ qui manque, avec sa raison, ou le refus de GitHub. Rien n'est écrit alors.
  ajouterAUneStation(saisie: { depot: string; base: string; stations: string[]; principale: string; cooks: string; manager: { modele: string; effort: string }; reviewer: { modele: string; effort: string }; ouvertLe: string }): Promise<Ajout>;
  // Confie la cuisine d'un projet de l'app à une première station, ou à une de plus (ticket 983) : la
  // demande s'écrit dans le gist de chaque station choisie, et rend le nom du projet — ou chaque champ
  // qui manque, ou le refus de GitHub. Rien n'est écrit alors.
  confierAUneStation(saisie: { nom: string; depot: string; base: string; stations: string[]; principale: string; cooks: string; manager: { modele: string; effort: string }; reviewer: { modele: string; effort: string }; ouvertLe: string }): Promise<Ajout>;
  // Retire le projet de la demande de chacune de ses stations : elles le retirent de leur configuration.
  retirerDUneStation(nom: string): Promise<RetraitDUneStation>;
  // Ouvre dans le navigateur une page où autoriser brigade sur GitHub — une de celles qu'une station a publiées.
  autoriserSurGitHub(url: string): Promise<boolean>;
  // Le bouton d'une panne, sur la ligne d'une station (pannes/gestes.ts) : relire GitHub, écarter la
  // ligne, lancer le login. Rend ce qu'il a fait, ou pourquoi rien, en une ligne.
  panne(id: string, cle: string): Promise<RenduDePanne>;
  // « Retirer la station », confirmé : son appairage est ôté de son gist (stations/stations.ts) ; la station n'est plus lue.
  retirerLaStation(id: string): Promise<RetraitDeStation>;
  // Ce qu'engage l'allumage du manager, chiffré (allumage.ts) : les issues ouvertes du projet, et
  // celles qui portent `blocked-on-human` — `manager backlog`, lancée une fois sur sa box. Demandé
  // quand la confirmation d'« allumer » s'ouvre : son « oui » n'attend pas cette lecture. Rien, pour un projet sans box.
  compter(projet: string): Promise<Compte | undefined>;
  // Un geste de la partie closer (closer-lancement.ts), lancé une fois sur la box du projet : l'aperçu
  // d'un nettoyage, sa demande — qui ne part qu'avec `oui` à `true`, que la vue ne passe qu'au « oui »
  // du chef, devant ce qu'il coûte —, ou son annulation. Rend ce que le runtime a répondu, ou pourquoi
  // rien ne l'a été. Rien, pour un projet sans box.
  closer(projet: string, action: Action, oui?: true): Promise<RenduDuCloser | undefined>;
  // Le projet dont l'espace est affiché : sa box est lue, elle seule — `status`, pour le panneau.
  // `demande` revient sur chaque lecture qui y répond.
  regarder(projet: string, demande: number): void;
  // « Tous les projets » est affiché : toutes les box sont lues, chacune pour elle-même.
  tous(demande: number): void;
  // L'onglet de contenu affiché : sa commande est lue, elle seule. Sans onglet
  // — un terminal, « Tous les projets » — plus rien n'est lu pour lui. `couts`, sans projet : la page
  // des coûts de l'app, qui lit `station` sur la box de chaque projet (onglets.ts, `COUTS`).
  onglet(projet: string | undefined, id: string | undefined, demande: number): void;
  // La barre est posée : `faits` est lu sur la box de chaque projet, quel que soit l'écran.
  faits(demande: number): void;
  // Un ticket du rail, ouvert sur son issue dans le navigateur. Faux : l'adresse que la box
  // a rendue pour lui n'est pas en https, il n'est plus dans les derniers faits lus, ou le
  // poste n'a pas pu l'ouvrir.
  ouvrirIssue(projet: string, ticket: number): Promise<boolean>;
  // Un ticket de Livré, ouvert sur sa PR mergée dans le navigateur. Faux : l'adresse que la box
  // a rendue pour elle n'est pas en https, il n'est plus dans les derniers faits lus, ou le poste
  // n'a pas pu l'ouvrir.
  ouvrirPr(projet: string, ticket: number): Promise<boolean>;
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
  // `grants` : dans l'onglet Grants, de même — l'état des grants (grants.ts). `fiabilite` : dans
  // l'onglet Reliability, la fiabilité des cooks, lue dans `station` et `measures` (fiabilite.ts).
  surContenu(recevoir: (lecture: Lecture, manager: Vu | undefined, grants: VuDesGrants | undefined, fiabilite?: VuDeLaFiabilite) => void): void;
  // Ce que `faits` a rendu pour un projet : de quoi dessiner, ou ce qui a été obtenu à la place.
  surFaits(recevoir: (recue: Dessinable) => void): void;
  // La bande d'alertes d'un projet, redessinée à chaque lecture qui la change (alertes.ts) :
  // vide, les quatre états ont été lus et vont bien.
  surAlertes(recevoir: (bande: Bande) => void): void;
  // Le chef a cliqué la notification de l'urgence d'un projet (notification.ts) : la fenêtre est
  // déjà au premier plan, le projet s'ouvre sur sa ligne d'urgence et son geste.
  surUrgence(recevoir: (projet: string) => void): void;
  // Ce qui n'est pas encore sur le rail du projet affiché (amont.ts) : son nombre et sa liste, ou
  // pourquoi rien n'est compté — et ce qui se lit à la place du rail quand il est vide.
  surAmont(recevoir: (vu: VuAmont) => void): void;
  // L'installation d'un projet a changé : une lecture de la box, une action partie ou revenue.
  surGuide(recevoir: (guide: Guide) => void): void;
  // Le retard du code de l'app sur son origine, et celui des clones de brigade parmi les projets,
  // relus : au démarrage, au retour à la fenêtre, quand le fichier des projets change. La
  // dernière lecture d'avant le démarrage de la vue est dans `demarrage`.
  surCode(recevoir: (vu: VuDuCode) => void): void;
  // Les stations appairées, relues sur GitHub toutes les trente secondes, chacune en une ligne. La
  // dernière lecture d'avant le démarrage de la vue est dans `demarrage`.
  surStations(recevoir: (vu: VuDesStations) => void): void;
  // Les projets des stations, relus à chaque lecture des stations : où en est chacun, sur chacune.
  surProjetsDesStations(recevoir: (vu: VuDesProjets) => void): void;
  // L'accueil (accueil.ts), redessiné à chaque lecture qui le change : une ligne par projet, une par
  // station, et la ligne de santé. Le dernier d'avant le démarrage de la vue est dans `demarrage`.
  surAccueil(recevoir: (vu: Accueil) => void): void;
  // Le fichier des projets a changé — ou l'app vient de désinstaller un projet de sa box.
  // `fermes` : les terminaux des projets qui ont quitté la liste.
  surConfiguration(recevoir: (configuration: Affichee, fermes: number[]) => void): void;
};

declare global {
  interface Window {
    brigade: Pont;
  }
}
