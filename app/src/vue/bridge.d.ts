// Ce que le process principal offre à la vue (preload.cjs).
import type { Home } from "../home.ts";
import type { Seen as SeenUpstream } from "../upstream.ts";
import type { Shown } from "../bar.ts";
import type { Reading } from "../box.ts";
import type { PALETTE, Role } from "../colors.ts";
import type { BANNER, Drawable } from "../facts.ts";
import type { Tab, Heading } from "../tabs.ts";
import type { Block } from "../ordinary.ts";
import type { StateOfUpdate } from "../update/state.ts";
import type { Opinion as OpinionOfVersion } from "../update/opinion.ts";
import type { Read as QuestionRead, Rendered as AnswerRendered } from "../question.ts";
import type { Seen as SeenOfCode } from "../delay.ts";
import type { Opinion, Removal } from "../removal.ts";
import type { Request as RequestOfReport, RenderedOfReport } from "./report/opening.ts";
import type { RepositoryOfChef } from "../projects/github.ts";
import type { Addition, Chosen, DefaultsOfTheMachine, Move, EFFORTS, MODELS, Removal as RemovalOfAStation, SeenOfProjects } from "../projects/projects.ts";
import type { Pairing, RemovalOfStation, SeenOfStations } from "../stations/stations.ts";
import type { Open, Terminal } from "../terminals.ts";
import type { AccountGitHub, StartOfConnection, EndOfConnection } from "../connection-github.ts";
import type { Opening, Progress, StationsOfChef } from "../first-launch.ts";
import type { Choice, StationsOfAccount } from "../stations-of-account.ts";

export type Bridge = {
  // `poste` : le nom que l'écran donne à cet ordinateur (« this Mac », « this PC »), et s'il est un Mac — les raccourcis du terminal en dépendent.
  demarrage(): Promise<{ poste?: { nom: string; mac: boolean }; configuration: Shown; palette: typeof PALETTE; exemple: string; onglets: readonly Tab[]; rubriques: readonly Heading[]; banniere: typeof BANNER; calibrage: { modeles: typeof MODELS; efforts: typeof EFFORTS }; code: SeenOfCode | undefined; stations?: SeenOfStations; projetsDesStations?: SeenOfProjects; accueil?: Home; miseAJour?: StateOfUpdate; telephone?: Phone }>;
  // Change la couleur d'onglet ou d'accent d'un projet, par le nom d'une couleur de la palette ou
  // une couleur libre `#rrggbb` (colors.ts). Rend la raison, si elle ne l'a pas été. Écrite, elle
  // arrive par `surConfiguration`.
  colorer(project: string, role: Role, color: string): Promise<string | undefined>;
  // Change le sigle d'un projet, celui de sa case dans la barre (acronym.ts) — `null` le rend à celui que l'app tire
  // de son nom. Rend la raison, s'il ne l'a pas été. Écrit, il arrive par `surConfiguration`.
  changerSigle(project: string, acronym: string | null): Promise<string | undefined>;
  // Montre ou retire l'état de la cuisine de la barre des menus du Mac, de la zone de notification de Windows
  // (menu-bar.ts, ticket 3269). Rend la raison, si rien n'a été écrit. Écrit, il arrive par `surConfiguration`. Pas sur le téléphone.
  changerBarreDeMenus?(active: boolean): Promise<string | undefined>;
  iconeDeFond?(): Promise<string>;
  // Le bloc « tickets ordinaires » de cet ordinateur pour un projet (ordinary.ts) — rien, quand l'option n'existe pas ici.
  ordinaires(project: string): Promise<Block | undefined>;
  // Règle l'option et la limite de cooks de cet ordinateur (`null` : aucune). Rend la raison, si rien n'a été écrit.
  reglerOrdinaires(project: string, active: boolean, limit: number | null): Promise<string | undefined>;
  // Range un projet à la place `rang` de la barre, comptée depuis zéro parmi les projets : les autres
  // se décalent. Rend la raison, s'il ne l'a pas été. Rangé, le nouvel ordre arrive par `surConfiguration`.
  ranger(project: string, rank: number): Promise<string | undefined>;
  // Les deux gestes qui retirent un projet, prêts à poser — rien, pour un projet qui a quitté le fichier.
  retrait(project: string): Promise<Removal | undefined>;
  // Retire le projet du fichier des projets, et rien d'autre : rien ne part vers sa box. Rend
  // l'avis à montrer — ou pourquoi il n'est pas retiré. Retiré, il part par `surConfiguration`.
  retirerDeLApp(project: string): Promise<{ avis: Opinion } | { refus: string }>;
  espace(project: string): Promise<Terminal[]>;
  // Tous les terminaux ouverts, de tous les projets, et ce que chacun a écrit (ticket 3159) : une vue rechargée les retrouve,
  // sans rien relancer. Un pont qui n'en tient pas (le téléphone) ne le porte pas.
  terminauxOuverts?(): Promise<Open[]>;
  // « + shell » : les machines où un shell persistant peut s'ouvrir — ce poste, la box, les stations.
  machines(project: string): Promise<{ id: string; titre: string }[]>;
  // Un shell persistant sur la machine choisie, par son identifiant — ou pourquoi rien ne s'est ouvert.
  shell(project: string, machine: string): Promise<Terminal | { refus: string }>;
  // Ferme un shell pour de bon : sa session est détruite — ou la raison, quand elle n'a pas pu l'être.
  fermerShell(id: number): Promise<{ ferme: true } | { refus: string }>;
  // Une carte de T'attend (request.ts) : une demande en prose est écrite dans le second, sans Entrée,
  // et le second est affiché. La vue nomme le projet et le ticket ; la phrase vient de ce que le bloc
  // `attend` en dit. Rien pour un ticket que le bloc ne nomme pas.
  demander(project: string, ticket: number): Promise<Terminal | { refus: string } | undefined>;
  // La question qu'une carte de T'attend pose, telle qu'elle est écrite sur son issue (question.ts) :
  // l'issue lue par le `gh` du poste. La vue nomme le projet et le ticket. Rien pour un ticket que
  // le bloc `attend` ne nomme pas.
  lireQuestion(project: string, ticket: number): Promise<QuestionRead | undefined>;
  // Les gestes de la fiche de cette carte, à cet instant, chacun avec son prix (card-actions.ts) :
  // ceux qui tranchent ce qu'on attend du chef, puis ceux que la table du chef permet pour son
  // état, et dont l'action est branchée.
  gestesDeFiche(card: { ticket: number; etat?: string; ouvrable: boolean; attendu: boolean; pr?: boolean }): Promise<import("../card-actions.ts").Proposes[]>;
  demanderAuSecond(project: string, ticket: number): Promise<Terminal | { refus: string }>;
  // Passe une carte de TODO au second (handover-second.ts, ticket 3133) : son numéro, sa question — nulle, « no
  // question found » —, et ce que son issue dit, écrits dans le second du projet sans Entrée.
  passerAuSecond(project: string, ticket: number, question: string | null): Promise<Terminal | { refus: string }>;
  // Ouvre dans le navigateur le lien de la PR d'une carte. Absent, la page l'ouvre elle-même.
  ouvrirLien?(project: string, ticket: number, url: string): Promise<boolean>;
  // Le titre d'une issue que la box ne donne pas, lu par le `gh` du poste à l'adresse que la box a rendue.
  lireTitre(project: string, ticket: number): Promise<import("../question.ts").Title | undefined>;
  // Les tickets `fire` du projet, lus sur GitHub par le `gh` du poste (fire.ts) : ce que le rail sait encore quand la box ne répond pas.
  lireFeu(project: string): Promise<import("../fire.ts").Fire | undefined>;
  // « réessayer maintenant » : les lectures de la box repartent tout de suite, au lieu d'attendre leur tour.
  relireBox(request: number): void;
  // La réponse du chef à cette question — un choix par sa lettre, ou sa phrase —, postée sur
  // l'issue par le même `gh`. `question` : l'adresse de la question montrée — rien ne part sur une autre.
  // `vu` : l'adresse du dernier commentaire montré sous elle, vide s'il n'y en avait pas — rien ne part
  // si quelque chose y a été écrit depuis.
  repondreQuestion(project: string, ticket: number, answer: { question: string; vu: string; choix: string } | { question: string; vu: string; texte: string }): Promise<AnswerRendered>;
  // Un geste d'une carte mise de côté (actions-refusal.ts, ticket 3147) : `relancer` retire `served-elsewhere` de l'issue, `clore` la ferme comme terminée.
  refus(project: string, id: "relancer" | "clore", ticket: number): Promise<Terminal | { refus: string; detail?: string } | { fait: string; detail?: string }>;
  // Un clone en retard sur son origine (delay.ts) : sa mise à jour, `git -C <clone> pull`, est
  // écrite dans un shell de l'espace d'un projet, ouvert pour elle, sans être envoyée. Rend ce
  // shell — son projet est celui où il s'est ouvert — ou pourquoi rien n'est écrit. Rien, pour un
  // clone qui n'est pas en retard.
  ecrireMiseAJour(clone: string): Promise<Terminal | { refus: string } | undefined>;
  // Le code de l'app, en retard ou à relancer : elle se met à jour et se relance sur la nouvelle
  // version — rien n'est rendu, elle se ferme —, ou dit pourquoi elle reste sur son code.
  passer(): Promise<{ refus: string } | undefined>;
  // La mise à jour de l'app installée (mise-a-jour/etat.ts) — l'état et ses deux gestes. L'état :
  // `inactive` (lancée depuis le dépôt, elle ne regarde rien), `verification`, `a-jour`,
  // `disponible` (avec la `nouvelle` version), `telechargement` (`recus` sur `taille` octets),
  // `prete` (téléchargée et vérifiée : elle s'installe au lancement suivant si rien n'est dit),
  // `installation`, `erreur` (sa `raison` en une ligne — un flux injoignable ne retient jamais l'app).
  // Le dernier d'avant le démarrage de la vue est dans `demarrage`, chaque changement par `surMiseAJour`.
  miseAJour(): Promise<StateOfUpdate>;
  // « Installer maintenant » : télécharge la nouvelle version si ce n'est pas fait, l'installe et
  // relance l'app sur elle — rien n'est rendu, elle se ferme —, ou dit pourquoi elle reste sur sa version.
  installerMiseAJour(): Promise<{ refus: string } | undefined>;
  // La ligne d'une version plus haute (les tickets 1528 et 2431, update/opinion.ts) : la plus haute version publiée
  // au-dessus de celle qui tourne, la version qui tourne, le lien direct du paquet de ce poste et le premier lancement — ou
  // rien, si l'app est à jour ou si ce poste ne se met pas à jour par là (lancée depuis le dépôt). Rien ne l'écarte.
  // `avisDeVersion` rend la dernière vérification, `surAvisDeVersion` reçoit chacune de celles qui suivent.
  // `telechargerVersion` ouvre dans le navigateur le lien de l'avis rendu, et lui seul.
  avisDeVersion(): Promise<OpinionOfVersion | undefined>;
  surAvisDeVersion(receive: (opinion: OpinionOfVersion | undefined) => void): void;
  telechargerVersion(url: string): Promise<boolean>;
  // Le statut de la station de cet ordinateur (le ticket 2191, épique 2182 ; le contrat du runtime, ticket 2189) : la version
  // qui tourne ici, la dernière publiée, et si elle est en retard. Absents tant que le pont ne le lit pas : la vue dit
  // alors sa version inconnue (station-version/station-version.js).
  statutDeLaStation?(): Promise<unknown>;
  // Installe la station de cet ordinateur (ticket 2640, home/station/) : rien quand elle est installée, ou pourquoi elle ne
  // l'est pas, en une ligne et son détail. Absent, le bouton de l'accueil dit que cet appareil ne l'installe pas.
  installerLaStation?(): Promise<{ refus: string; detail?: string } | undefined>;
  surStatutDeLaStation?(receive: (status: unknown) => void): void;
  // L'app Android seule (le ticket 2501) : la liste des projets vient d'être lue sur GitHub, ou ne l'a pas été — `liste`
  // dit laquelle. Les projets eux-mêmes arrivent par `surConfiguration`.
  surTelephone?(receive: (phone: Phone) => void): void;
  // Le chef a touché la notification d'une carte de TODO sur le téléphone (le ticket 2747), ou cliqué une question dans le
  // menu de la barre des menus sur un ordinateur (ticket 3269) — sa fiche s'ouvre.
  surOuvrirCarte?(receive: (project: string, ticket: number) => void): void;
  // GitHub refuse la connexion de ce téléphone : le pont efface son jeton, et la vue revient à la connexion à GitHub.
  oublierLeTelephone?(): Promise<void>;
  // Le code qu'une station affiche, tapé par le chef : rend le nom de la station appairée, ou le
  // refus en une ligne — code mal formé, inconnu, expiré, ou GitHub muet. Rien n'est écrit alors.
  appairer(code: string): Promise<Pairing>;
  // « Add a project » : les dépôts que le `gh` du poste peut lire, chacun avec sa branche par
  // défaut — ou pourquoi ils ne sont pas lus.
  depotsDuChef(): Promise<{ depots: RepositoryOfChef[] } | { refus: string }>;
  // Un dépôt quelconque lu par son nom `owner/repo` (public et pas au chef compris) : sa branche par défaut, ou le refus en une phrase.
  lireUnDepot(repository: string): Promise<RepositoryOfChef | { refus: string }>;
  // Le dépôt choisi dans le parcours d'ajout est-il prêt pour brigade — ses bindings, ses labels (ticket 2627, contrat
  // du runtime, ticket 2626, joué sur la copie locale du dépôt) ; puis sa préparation, qui rend la même forme ou rejette avec
  // sa raison en une phrase.
  checkRepoSetup(repo: string): Promise<import("./addition-project/installation-of-repository.js").StateOfRepository>;
  runRepoSetup(repo: string): Promise<import("./addition-project/installation-of-repository.js").StateOfRepository>;
  // Confie la cuisine d'un projet de l'app à une première station, ou à une de plus (ticket 983) : la
  // demande s'écrit dans le gist de chaque station choisie, et rend le nom du projet — ou chaque champ
  // qui manque, ou le refus de GitHub. Rien n'est écrit alors.
  confierAUneStation(input: { nom: string; depot: string; base: string; stations: string[]; cooks: string; capacites?: string[]; manager: { modele: string; effort: string }; reviewer: { modele: string; effort: string }; ouvertLe: string }): Promise<Addition>;
  // Ce que le formulaire d'ajout d'une station montre d'emblée pour cet ordinateur (ticket 1307) : ses cooks, le dossier
  // des espaces de travail de sa station, ses capacités détectées — ou pourquoi il n'a pas pu être lu.
  defautsDeStation(name: string): Promise<DefaultsOfTheMachine>;
  // Les dossiers de la station de cet ordinateur pour un projet (ticket 2489) : son clone, les worktrees de ses cooks —
  // ou pourquoi ils ne se lisent pas. Absent d'un pont qui n'en a pas (le téléphone).
  dossiersDeLaStation?(name: string): Promise<import("../projects/projects.ts").FoldersOfTheStation>;
  // Les dossiers et la porte réseau de la station de cet ordinateur (ticket 2644) : lus, et changés depuis sa page.
  lireReglagesDeLaStation?(): Promise<import("../settings-of-the-station.ts").Settings | import("../settings-of-the-station.ts").Refusal>;
  ecrireReglagesDeLaStation?(change: import("../settings-of-the-station.ts").Change): Promise<{ fait: string } | import("../settings-of-the-station.ts").Refusal>;
  // Déménage la cuisine d'un projet vers une station appairée — son gist (projects/move.ts).
  demenagerLaCuisine(name: string, to: string): Promise<Move>;
  // Une issue de la carte d'un besoin qui manque à la principale du projet (ticket 1400) : le choix — sa clé —, l'issue
  // retenue. Elle s'écrit dans la demande de la principale, qui la pose à son journal. Rend ce qui est fait, ou pourquoi rien.
  choisirUneIssue(name: string, choice: string, issue: string): Promise<Chosen>;
  // « report to brigade », sous chaque panne que l'app montre (ticket 1977) : ouvre dans le navigateur une nouvelle issue
  // préremplie sur benomite/brigade — versions, système, la panne, les lignes du journal qui en parlent, masquées
  // (report/opening.ts). Rien n'est envoyé : le chef l'envoie lui-même. Rend ouvert, ou pourquoi rien.
  signaler(request: RequestOfReport): Promise<RenderedOfReport>;
  // Ouvre dans le navigateur une page où autoriser brigade sur GitHub — une de celles qu'une station a publiées —,
  // ou une page que le parcours d'un projet neuf montre (ticket 1111) : son geste, son ticket de préparation, sa PR.
  autoriserSurGitHub(url: string): Promise<boolean>;
  // « check again » d'une station qui ne cuit pas encore : GitHub est relu tout de suite (stations/stations.ts).
  relireLesStations(): Promise<void>;
  ouvrirLaProposition(url: string): Promise<boolean>;
  // La fiche du projet, sous Settings (ticket 4240) : un fichier du projet, le chemin relatif à son dossier — seul
  // `.brigade/fiche-projet.json` (card-project/card-project-folder.ts). `null` : il n'y est pas. Optionnels : un pont qui
  // ne les porte pas (le téléphone) ne montre pas la section.
  lireUnFichierDuProjet?(project: string, path: string): Promise<string | null>;
  ecrireUnFichierDuProjet?(project: string, path: string, text: string): Promise<void>;
  savoirDuProjet(project: string): Promise<import("./know-how/know-how-github.ts").ReadOfKnowledge>;
  changerLeSavoir(project: string, change: import("./know-how/know-how-github.ts").ChangeOfKnowledge): Promise<import("./know-how/know-how-github.ts").RenderedOfKnowledge>;
  // « Retirer la station », confirmé : son appairage est ôté de son gist (stations/stations.ts) ; la station n'est plus lue.
  retirerLaStation(id: string): Promise<RemovalOfStation>;
  // Les projets que la station de cet ordinateur sert sur GitHub seul (ticket 2359, projets-servis/) : la liste qu'elle
  // tient, et un projet ajouté ou retiré — chaque écriture rend la liste écrite. Absents, ou rien de rendu : pas de station.
  projetsServis?(): Promise<import("./projects-served/projects-served.js").ReadOfProjectsServed | undefined>;
  servirUnProjet?(repository: string, served: boolean): Promise<import("./projects-served/projects-served.js").ReadOfProjectsServed>;
  // Ouvre un projet qu'une station porte, ou un dépôt choisi dans « Add a project », sans dossier à choisir : sa copie
  // reprise ou clonée par le runtime, puis le projet ajouté au fichier des projets — il arrive par `surConfiguration` —,
  // ou pourquoi il ne l'est pas. `base` : la branche par défaut que GitHub a donnée du dépôt, sa branche d'intégration.
  ouvrirDUneStation?(name: string, repository: string, base?: string): Promise<Opening>;
  // Lance la connexion à GitHub par le `gh` de cet ordinateur : rend le code à taper et sa page, déjà ouverte — ou pourquoi
  // rien n'est parti. Sa fin arrive par `surConnexionGitHub`. Sur le téléphone (le ticket 2500), le pont la mène
  // lui-même avec GitHub, sans station : le jeton qu'elle rend reste dans son coffre, et la vue ne le voit jamais.
  seConnecterAGitHub?(): Promise<StartOfConnection>;
  // Le compte GitHub que le `gh` de cet ordinateur tient (ticket 2475, connection-github.ts) : son login, aucun, ou
  // pourquoi il ne se lit pas. L'étape du compte du parcours d'ajout le dit, et le relit au bout d'une connexion.
  compteGitHub?(): Promise<AccountGitHub>;
  // Ouvre une page qu'un échec du runtime a nommée (installer `gh`, demander l'accès), ou celle qui dit comment obtenir
  // un outil qui manque au second (ticket 1435) ; rend faux pour toute autre.
  ouvrirLaPage?(url: string): Promise<boolean>;
  // Les agents au travail d'un projet (ticket 4569, agents/source.js) : lus sur GitHub et sur sa station.
  agentsAtWork?(project: string): Promise<unknown>;
  // Les stations enregistrées sous le compte GitHub du chef (ticket 1706, stations-of-account.ts) : listées — chacune
  // disponible ou non, avec les projets qu'elle sert —, une connexion à GitHub qui manque, ou pourquoi elles ne se
  // lisent pas. Le téléphone ne les porte pas.
  stationsDuCompte?(): Promise<StationsOfAccount>;
  // Écrit, dans le gist d'une station du compte, les projets qu'elle sert : la sélection entière — ou pourquoi elle
  // n'est pas écrite, en une ligne, son détail à part.
  choisirLesProjets?(id: string, repositories: string[]): Promise<Choice>;
  // La réponse du chef à la carte de TODO d'un ticket (card-todo.ts) : un choix par son rang, ou son texte. Rien pour un projet sans box.
  repondreCarte(project: string, ticket: number, answer: import("../card-todo.ts").Answer): Promise<import("../card-todo.ts").Rendered | undefined>;
  // Un lien de la ligne d'un projet en lecture seule (ticket 3163, vue/read-only/) : comment obtenir l'écriture sur son
  // dépôt, ou le forker — ouvert pour le seul dépôt que la dernière lecture dit en lecture seule (read-only.ts).
  ouvrirLectureSeule?(project: string, page: import("../read-only.ts").PageOfTheReadOnly): Promise<boolean>;
  // Le projet dont l'espace est affiché : sa box est lue, elle seule — `status`, pour le panneau.
  // `demande` revient sur chaque lecture qui y répond.
  regarder(project: string, request: number): void;
  // « Tous les projets » est affiché : toutes les box sont lues, chacune pour elle-même.
  tous(request: number): void;
  // L'onglet de contenu affiché : sa commande est lue, elle seule. Sans onglet
  // — un terminal, « Tous les projets » — plus rien n'est lu pour lui. `couts`, sans projet : la page
  // des coûts de l'app, qui lit `station` sur la box de chaque projet (tabs.ts, `COUTS`).
  onglet(project: string | undefined, id: string | undefined, request: number): void;
  // La barre est posée : `faits` est lu sur la box de chaque projet, quel que soit l'écran.
  faits(request: number): void;
  // Un ticket du rail, ouvert sur son issue dans le navigateur. Faux : l'adresse que la box
  // a rendue pour lui n'est pas en https, il n'est plus dans les derniers faits lus, ou le
  // poste n'a pas pu l'ouvrir.
  ouvrirIssue(project: string, ticket: number): Promise<boolean>;
  // Un ticket de Livré, ouvert sur sa PR mergée dans le navigateur. Faux : l'adresse que la box
  // a rendue pour elle n'est pas en https, il n'est plus dans les derniers faits lus, ou le poste
  // n'a pas pu l'ouvrir.
  ouvrirPr(project: string, ticket: number): Promise<boolean>;
  // La PR du cook d'un ticket, ouverte dans le navigateur (activity-of-cook.js, ticket 1846) : l'adresse est celle que la
  // dernière lecture du tableau de la cuisine publie pour son cook. Faux : elle ne la publie plus, elle n'est pas en https,
  // ou le poste n'a pas pu l'ouvrir.
  ouvrirPrDuCook(project: string, ticket: number): Promise<boolean>;
  ecrire(id: number, data: string): void;
  redimensionner(id: number, columns: number, lines: number): void;
  // La molette dans un shell persistant : l'historique de sa session, de `lines` lignes — > 0 remonte, < 0 redescend.
  scroll(id: number, lines: number): void;
  surSortie(receive: (id: number, data: string) => void): void;
  surEtat(receive: (terminal: Terminal) => void): void;
  // Ce que fait chaque cook d'un projet, à chaque lecture de son tableau de la cuisine (ticket 1846) — ou pourquoi
  // il ne se lit pas : la fiche d'un ticket en pose son cook (activity-of-cook.js).
  surActivites(receive: (published: import("./activity-of-cook.js").Published) => void): void;
  // Ce que la commande de l'onglet affiché a rendu, mot pour mot.
  surContenu(receive: (reading: Reading) => void): void;
  // Ce que `faits` a rendu pour un projet : de quoi dessiner, ou ce qui a été obtenu à la place.
  surFaits(receive: (receivedOne: Drawable) => void): void;
  // Le chef a choisi un projet dans le menu de la barre des menus : la fenêtre est déjà au premier plan, le projet s'ouvre.
  surOuvrirProjet(receive: (project: string) => void): void;
  // Ce qui est avant le rail du projet affiché (upstream.ts) : ses issues par état — le bandeau Backlog, ticket 3460 —, ou
  // pourquoi rien n'est compté — et ce qui se lit à la place du rail quand il est vide.
  surAmont(receive: (seenOne: SeenUpstream) => void): void;
  // Le retard du code de l'app sur son origine, et celui des clones de brigade parmi les projets,
  // relus : au démarrage, au retour à la fenêtre, quand le fichier des projets change. La
  // dernière lecture d'avant le démarrage de la vue est dans `demarrage`.
  surCode(receive: (seenOne: SeenOfCode) => void): void;
  // L'état de la mise à jour de l'app installée, à chaque changement (voir `miseAJour`) : un
  // téléchargement le dit à chaque pour-cent gagné.
  surMiseAJour(receive: (state: StateOfUpdate) => void): void;
  // Les stations appairées, relues sur GitHub toutes les trente secondes, chacune en une ligne. La
  // dernière lecture d'avant le démarrage de la vue est dans `demarrage`.
  surStations(receive: (seenOne: SeenOfStations) => void): void;
  // Les projets des stations, relus à chaque lecture des stations : où en est chacun, sur chacune.
  surProjetsDesStations(receive: (seenOne: SeenOfProjects) => void): void;
  // L'accueil (home.ts), redessiné à chaque lecture qui le change : une ligne par projet, une par
  // station, et la ligne de santé. Le dernier d'avant le démarrage de la vue est dans `demarrage`.
  surAccueil(receive: (seenOne: Home) => void): void;
  // Le fichier des projets a changé — ou l'app vient de désinstaller un projet de sa box.
  // `fermes` : les terminaux des projets qui ont quitté la liste.
  surConfiguration(receive: (configuration: Shown, closed: number[]) => void): void;
  // Une étape de la copie d'un projet qu'une station porte, pendant son ouverture : la phrase du runtime, et son pourcentage.
  surOuverture?(receive: (repository: string, step: Progress) => void): void;
  // La connexion à GitHub finie : connecté, ou pourquoi pas.
  surConnexionGitHub?(receive: (end: EndOfConnection) => void): void;
};

declare global {
  interface Window {
    brigade: Bridge;
  }
}

// `liste` : la dernière lecture de la liste des projets sur GitHub (le ticket 2501), absente avant la première. Lue, ou ce
// qui l'a empêchée : ce qui ne se joint pas (`injoignable`, `inattendu`), ou `oublie`, la session GitHub refusée.
export type ListOfPhone = { a: string; lue: true } | { a: string; lue: false; reason: "injoignable" | "inattendu" | "oublie"; said: string };
// Le téléphone, tel que le pont de l'app Android le garde : `github`, sa connexion à GitHub (le ticket 2500) — le compte
// sous lequel il lit, nul quand GitHub ne l'a pas dit ; absente tant qu'il n'y est pas connecté, et la vue s'ouvre alors
// sur la connexion.
export type Phone = { github?: { compte: string | null }; liste?: ListOfPhone };
