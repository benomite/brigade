// Ce que le process principal offre à la vue (preload.cjs).
import type { Home } from "../home.ts";
import type { Bande } from "../alerts.ts";
import type { ALLUMAGE, Account } from "../allumage.ts";
import type { Vu as VuAmont } from "../amont.ts";
import type { Affichee } from "../bar.ts";
import type { Read } from "../box.ts";
import type { PALETTE, Role } from "../couleurs.ts";
import type { KITCHEN_ACTIONS } from "../kitchen.ts";
import type { BANNIERE, Dessinable } from "../facts.ts";
import type { Confirmation } from "../confirmation.ts";
import type { CONFIRMES, DIRECTS } from "../actions.ts";
import type { ACTIONS_D_WAIT, Saisie as SaisieDWait } from "../wait.ts";
import type { Vu } from "../manager.ts";
import type { Onglet, Rubrique } from "../onglets.ts";
import type { Bloc } from "../ordinaires.ts";
import type { RenduDeOutage } from "../outages/actions.ts";
import type { StateDeUpdate } from "../update/state.ts";
import type { Opinion as OpinionDeVersion } from "../update/opinion.ts";
import type { Lue as QuestionLue, Rendue as AnswerRendue } from "../question.ts";
import type { Vu as VuDuCode } from "../retard.ts";
import type { Opinion, Retrait } from "../retrait.ts";
import type { Guide, StationChangee, StationVoulue } from "../service.ts";
import type { Request as RequestDeReport, RenduDuReport } from "./report/ouverture.ts";
import type { RepositoryDuChef } from "../projects/github.ts";
import type { Addition, Choisi, DefautsDeLaMachine, Demenagement, EFFORTS, MODELES, Retrait as RetraitDUneStation, VuDesProjects } from "../projects/projects.ts";
import type { IssueDuRemede } from "../projects/remede.ts";
import type { Appairage, RetraitDeStation, VuDesStations } from "../stations/stations.ts";
import type { Ouvert, Terminal } from "../terminaux.ts";
import type { AccountGitHub, DebutDeConnection, FinDeConnection } from "../connection-github.ts";
import type { Ouverture, Progres, StationsDuChef } from "../first-launch.ts";
import type { Choice, StationsDuAccount } from "../stations-du-account.ts";

export type Pont = {
  // `poste` : le nom que l'écran donne à cet ordinateur (« this Mac », « this PC »), et s'il est un Mac — les raccourcis du terminal en dépendent.
  demarrage(): Promise<{ poste?: { nom: string; mac: boolean }; configuration: Affichee; palette: typeof PALETTE; exemple: string; onglets: readonly Onglet[]; rubriques: readonly Rubrique[]; gestes: { allumage: typeof ALLUMAGE; cuisine: typeof KITCHEN_ACTIONS; directs: typeof DIRECTS; confirmes: typeof CONFIRMES; attente?: typeof ACTIONS_D_WAIT }; banniere: typeof BANNIERE; calibrage: { modeles: typeof MODELES; efforts: typeof EFFORTS }; code: VuDuCode | undefined; stations?: VuDesStations; projetsDesStations?: VuDesProjects; accueil?: Home; miseAJour?: StateDeUpdate; telephone?: Phone }>;
  // Change la couleur d'onglet ou d'accent d'un projet, par le nom d'une couleur de la palette ou
  // une couleur libre `#rrggbb` (couleurs.ts). Rend la raison, si elle ne l'a pas été. Écrite, elle
  // arrive par `surConfiguration`.
  colorer(project: string, role: Role, couleur: string): Promise<string | undefined>;
  // Change le sigle d'un projet, celui de sa case dans la barre (sigle.ts) — `null` le rend à celui que l'app tire
  // de son nom. Rend la raison, s'il ne l'a pas été. Écrit, il arrive par `surConfiguration`.
  changerSigle(project: string, sigle: string | null): Promise<string | undefined>;
  // Montre ou retire l'état de la cuisine de la barre des menus du Mac, de la zone de notification de Windows
  // (bar-de-menus.ts, ticket 3269). Rend la raison, si rien n'a été écrit. Écrit, il arrive par `surConfiguration`. Pas sur le téléphone.
  changerBarreDeMenus?(actif: boolean): Promise<string | undefined>;
  iconeDeFond?(): Promise<string>;
  // Le bloc « tickets ordinaires » de cet ordinateur pour un projet (ordinaires.ts) — rien, quand l'option n'existe pas ici.
  ordinaires(project: string): Promise<Bloc | undefined>;
  // Règle l'option et la limite de cooks de cet ordinateur (`null` : aucune). Rend la raison, si rien n'a été écrit.
  reglerOrdinaires(project: string, actif: boolean, limit: number | null): Promise<string | undefined>;
  // Range un projet à la place `rang` de la barre, comptée depuis zéro parmi les projets : les autres
  // se décalent. Rend la raison, s'il ne l'a pas été. Rangé, le nouvel ordre arrive par `surConfiguration`.
  ranger(project: string, rang: number): Promise<string | undefined>;
  // L'installation guidée d'un projet (service.ts), relue sur sa box : ses étapes, leur état, la
  // courante et ce qu'elle demande — rien, pour un projet sans box ou qui a quitté le fichier.
  // Ouverte ou en cours, la vérification d'ouverture part une fois. Ce qui change ensuite arrive par `surGuide`.
  service(project: string): Promise<Guide | undefined>;
  // Le chef déplie l'installation : elle se lit en entier, vérification d'ouverture comprise.
  deplierService(project: string): Promise<Guide | undefined>;
  // Ouvre dans le second du projet la session qui amorce son dépôt (`/brigade:init`) : rend le
  // second, dont la note dit ce qui a été lancé — ou pourquoi rien ne l'a été.
  amorcer(project: string): Promise<Terminal | { refus: string }>;
  // Le chef dit le résultat de l'init mergé sur la branche d'intégration, ou s'en dédit : la box le note.
  // Les gestes de l'installation qui suivent rendent la raison s'ils ne sont pas partis ; ce qu'ils
  // ont fait arrive par `surGuide`.
  direMerge(project: string, merge: boolean): Promise<{ refus: string } | undefined>;
  // Lance `installation` sur la box du projet : tout ce qui manque, d'un coup.
  verifier(project: string): Promise<{ refus: string } | undefined>;
  // Déclare les stations choisies parmi celles que la box fournit, chacune à son plafond de cooks.
  declarerStations(project: string, choice: { nom: string; cooks: number }[]): Promise<{ refus: string } | undefined>;
  // Change une station déclarée, seule (ticket 1510) : son plafond et ses capacités, ce poste qui la joue — ou la retire.
  // Ses stations relues arrivent par `surGuide` ; ce qu'il en advient, en une ligne.
  changerUneStation(project: string, station: string, voulu: StationVoulue): Promise<StationChangee | { refus: string }>;
  // Protège la branche d'intégration sur GitHub.
  proteger(project: string): Promise<{ refus: string } | undefined>;
  // Répond à la décision courante — deux valeurs quand elle se répond avec une autre.
  repondre(project: string, valeurs: string[]): Promise<{ refus: string } | undefined>;
  // Passe les décisions que le démarrage ne réclame pas : l'étape est notée faite.
  passerDecisions(project: string): Promise<{ refus: string } | undefined>;
  // La box revérifie tout et termine l'installation si c'est vert ; alors le démarrage du service est
  // écrit dans un shell de l'espace, sans être envoyé : rend ce shell — ou pourquoi rien n'est écrit.
  demarrer(project: string): Promise<Terminal | { refus: string }>;
  // Les deux gestes qui retirent un projet, prêts à poser — rien, pour un projet qui a quitté le fichier.
  retrait(project: string): Promise<Retrait | undefined>;
  // Retire le projet du fichier des projets, et rien d'autre : rien ne part vers sa box. Rend
  // l'avis à montrer — ou pourquoi il n'est pas retiré. Retiré, il part par `surConfiguration`.
  retirerDeLApp(project: string): Promise<{ avis: Opinion } | { refus: string }>;
  // Le chef coche l'option qui supprime le journal avec le projet, ou la décoche : le plan
  // rendu pour l'autre réglage ne vaut plus.
  direJournal(project: string, coche: boolean): Promise<Retrait | undefined>;
  // Demande à la box ce qu'elle retirerait du projet, et rend le retrait tel qu'il en sort.
  // Rien n'est retiré.
  planifier(project: string): Promise<Retrait | undefined>;
  // Désinstalle le projet de sa box — rien ne part tant que la box n'a pas rendu son plan, et
  // tant que `confirmation` n'est pas le nom du projet. Désinstallé, il arrive sans sa box par
  // `surConfiguration`.
  desinstaller(project: string, confirmation: string): Promise<Retrait | undefined>;
  espace(project: string): Promise<Terminal[]>;
  // Tous les terminaux ouverts, de tous les projets, et ce que chacun a écrit (ticket 3159) : une vue rechargée les retrouve,
  // sans rien relancer. Un pont qui n'en tient pas (le téléphone) ne le porte pas.
  terminauxOuverts?(): Promise<Ouvert[]>;
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
  lireQuestion(project: string, ticket: number): Promise<QuestionLue | undefined>;
  // Ce que la fiche dit d'un ticket vivant — ce que son cook fait, ou ce qui le bloque —, d'après
  // la carte cliquée (histoire.ts, `situation`). Rien pour un ticket que la cuisine ne tient pas.
  situation(card: { etat?: string; attend: string[]; dit: { libelle: string; valeur: string }[]; question?: string }): Promise<import("../histoire.ts").Situation>;
  // Les gestes de la fiche de cette carte, à cet instant, chacun avec son prix (card-actions.ts) :
  // ceux qui tranchent ce qu'on attend du chef, puis ceux que la table du chef permet pour son
  // état, et dont l'action est branchée.
  gestesDeFiche(card: { ticket: number; etat?: string; ouvrable: boolean; attendu: boolean; decision?: import("../decision.ts").Decision; pr?: boolean }): Promise<import("../card-actions.ts").Propose[]>;
  // Un geste de la fiche que la vue ne joue pas : une action de box, qui part dans le second. Là où il n'y a pas de
  // second où l'écrire — le téléphone (ticket 1164) —, le pont joue l'action sur la station et rend ce qu'elle a fait,
  // comme `panne` : `fait`, une phrase, et ce que la station a répondu en `detail`.
  gesteDeFiche(project: string, id: string, ticket: number, valeur?: string): Promise<Terminal | { refus: string; detail?: string } | { fait: string; detail?: string }>;
  // Le départ d'un projet qu'« Add a project » vient d'ouvrir (ticket 3268, depart-du-project.ts) : ses issues ouvertes et ce que le
  // second en propose, puis la mise sur le rail des lignes que le chef a gardées, avec leurs priorités.
  departDuProjet(project: string): Promise<import("../depart-du-project.ts").Depart>;
  mettreSurLeRail(project: string, lines: { ticket: number; priorite: number }[]): Promise<import("../depart-du-project.ts").Mise | { refus: string; detail?: string }>;
  // Le premier ticket d'un projet prêt (ticket 3306, runtime/src/premier-ticket/) : le second l'écrit d'après la réponse du chef —
  // ou le réécrit avec ses changements —, et rien n'est créé ; sur le « oui » seul, l'issue est créée avec ses labels, `fire` compris.
  redigerLePremierTicket(project: string, request: import("../../../runtime/src/premier-ticket/premier-ticket.ts").Demande): Promise<import("../../../runtime/src/premier-ticket/premier-ticket.ts").Redaction>;
  creerLePremierTicket(project: string, brouillon: import("../../../runtime/src/premier-ticket/premier-ticket.ts").Brouillon): Promise<import("../../../runtime/src/premier-ticket/premier-ticket.ts").Creation>;
  // L'histoire d'un ticket et son coût, lus par `pass <ticket> --json` sur la box (histoire.ts).
  lireHistoire(project: string, ticket: number): Promise<import("../histoire.ts").Histoire | undefined>;
  // Les chiffres d'autonomie des projets nommés, ensemble, sur les `jours` derniers jours, lus de GitHub
  // (vue/autonomy/autonomy-github.ts) ; puis l'issue d'un ticket qu'ils nomment, ouverte dans le navigateur.
  lireAutonomie(projects: string[], jours: number): Promise<import("./autonomy/autonomy-github.ts").ReadDAutonomy>;
  ouvrirTicketDAutonomie(url: string): Promise<boolean>;
  // L'issue d'un ticket et sa discussion (discussion.ts), lues sur la box du projet à l'ouverture de
  // sa fiche : le corps, puis les commentaires dans l'ordre, le markdown rendu — ou pourquoi on n'en
  // lit rien. Rien, pour un projet qui a quitté le fichier.
  lireDiscussion(project: string, ticket: number): Promise<import("../discussion.ts").Discussion | undefined>;
  // Poste ce texte en commentaire sur l'issue du ticket, par la box du projet : rend s'il l'a été, ou
  // pourquoi il ne l'est pas. Rien ne part d'un texte vide.
  commenter(project: string, ticket: number, texte: string): Promise<import("../discussion.ts").Commente>;
  demanderAuSecond(project: string, ticket: number, context: string): Promise<Terminal | { refus: string }>;
  // Passe une carte de TODO au second (passation-second.ts, ticket 3133) : son numéro, sa question — nulle, « no
  // question found » —, et ce que son issue dit, écrits dans le second du projet sans Entrée.
  passerAuSecond(project: string, ticket: number, question: string | null): Promise<Terminal | { refus: string }>;
  // Ouvre dans le navigateur une adresse que la dernière discussion lue de ce ticket montre — et
  // aucune autre. Rend si elle a été ouverte.
  ouvrirLien(project: string, ticket: number, url: string): Promise<boolean>;
  // Le titre d'une issue que la box ne donne pas, lu par le `gh` du poste à l'adresse que la box a rendue.
  lireTitre(project: string, ticket: number): Promise<import("../question.ts").Titre | undefined>;
  // Une capture d'un ticket d'interface, par son écran et son moment : l'image, lue par le `gh` du
  // poste à l'adresse que la box a rendue, en `data:` — ou pourquoi elle ne l'est pas.
  lireCapture(project: string, ticket: number, screen: string, moment: "avant" | "apres"): Promise<import("../captures.ts").Image | undefined>;
  // Les tickets `fire` du projet, lus sur GitHub par le `gh` du poste (feu.ts) : ce que le rail sait encore quand la box ne répond pas.
  lireFeu(project: string): Promise<import("../feu.ts").Feu | undefined>;
  // « réessayer maintenant » : les lectures de la box repartent tout de suite, au lieu d'attendre leur tour.
  relireBox(request: number): void;
  // La réponse du chef à cette question — un choix par sa lettre, ou sa phrase —, postée sur
  // l'issue par le même `gh`. `question` : l'adresse de la question montrée — rien ne part sur une autre.
  // `vu` : l'adresse du dernier commentaire montré sous elle, vide s'il n'y en avait pas — rien ne part
  // si quelque chose y a été écrit depuis.
  repondreQuestion(project: string, ticket: number, answer: { question: string; vu: string; choix: string } | { question: string; vu: string; texte: string }): Promise<AnswerRendue>;
  // Une ligne de la bande d'alertes dont le geste demande du jugement (alerts.ts, `{ demande: true }`) :
  // une demande en prose est écrite dans le second, sans Entrée. La vue nomme le projet, le sujet
  // de la ligne et ce qu'elle dit ; la phrase vient de ce que la bande en dit. Rien pour une ligne
  // qu'elle ne dit plus.
  demanderAlerte(project: string, sujet: string, dit: string): Promise<Terminal | { refus: string } | undefined>;
  // Un geste du socle (actions.ts) : sa commande part dans le second du projet. Rend le second, dont
  // la note dit ce qui est parti — ou pourquoi rien ne l'est, sans y toucher, quand il n'est pas dit
  // libre (occupé, devant un dialogue, saisie entamée). Rien, pour un projet sans box. Un geste confirmé (`gestes.confirmes`, au
  // démarrage) ne part qu'avec `oui` à `true` — la vue ne le passe qu'au « oui » du chef, devant sa
  // confirmation : sans lui, rien n'est écrit, et le refus le dit.
  geste(project: string, id: string, oui?: true): Promise<Terminal | { refus: string } | undefined>;
  // Ce qu'un geste confirmé coûte, à dire avant son « oui » (confirmation.ts) : tiré des derniers
  // faits lus du projet. Rien ne part. Rien, pour un geste qui ne se confirme pas.
  confirmer(project: string, id: string): Promise<Confirmation | { refus: string } | undefined>;
  // Un geste de WAITING (wait.ts), sur la carte d'un ticket ou sa fiche : sa commande part dans le second du
  // projet, comme un geste du socle, quand sa cuisine tourne sur ce poste — sinon il s'écrit sur l'issue
  // (vue/wait/wait-github.ts, ticket 3075). `saisie` : ce que le chef a rempli pour « waiting for… » — ce
  // qu'il attend, de qui, le jour de la relance. Rend le second, ce qui est écrit (`fait`), ou pourquoi rien n'est parti.
  // « it arrived, back to the kitchen » (`attente-arrivee`) part sur le tableau de la cuisine : il rend
  // ce qui est posté (`fait`, le commentaire au survol), ou pourquoi rien ne l'est.
  // Un geste d'une carte mise de côté (actions-refusal.ts, ticket 3147) : `relancer` retire `served-elsewhere` de l'issue, `clore` la ferme comme terminée.
  // Essayer une livraison depuis sa carte (trial.ts, ticket 3215) : la déclaration du projet et ses essais par ticket (rien : le projet n'est plus connu).
  essais(project: string): Promise<import("../trial.ts").VuDesEssais | undefined>;
  essayer(project: string, ticket: number): Promise<void>;
  arreterEssai(project: string, ticket: number): Promise<void>;
  refus(project: string, id: "relancer" | "clore", ticket: number): Promise<Terminal | { refus: string; detail?: string } | { fait: string; detail?: string }>;
  attente(project: string, id: string, ticket: number, saisie?: SaisieDWait): Promise<Terminal | { refus: string; detail?: string } | { fait: string; detail?: string } | undefined>;
  // Un clone en retard sur son origine (retard.ts) : sa mise à jour, `git -C <clone> pull`, est
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
  miseAJour(): Promise<StateDeUpdate>;
  // Relit le flux des versions publiées, et rend l'état qui en sort ; une version plus haute part
  // aussitôt en téléchargement. Rien n'est relu pendant un téléchargement, ni une fois prête.
  verifierMiseAJour(): Promise<StateDeUpdate>;
  // « Installer maintenant » : télécharge la nouvelle version si ce n'est pas fait, l'installe et
  // relance l'app sur elle — rien n'est rendu, elle se ferme —, ou dit pourquoi elle reste sur sa version.
  installerMiseAJour(): Promise<{ refus: string } | undefined>;
  // La ligne d'une version plus haute (les tickets 1528 et 2431, update/opinion.ts) : la plus haute version publiée
  // au-dessus de celle qui tourne, la version qui tourne, le lien direct du paquet de ce poste et le premier lancement — ou
  // rien, si l'app est à jour ou si ce poste ne se met pas à jour par là (lancée depuis le dépôt). Rien ne l'écarte.
  // `avisDeVersion` rend la dernière vérification, `surAvisDeVersion` reçoit chacune de celles qui suivent.
  // `telechargerVersion` ouvre dans le navigateur le lien de l'avis rendu, et lui seul.
  avisDeVersion(): Promise<OpinionDeVersion | undefined>;
  surAvisDeVersion(recevoir: (opinion: OpinionDeVersion | undefined) => void): void;
  telechargerVersion(url: string): Promise<boolean>;
  // Le statut de la station de cet ordinateur (le ticket 2191, épique 2182 ; le contrat du runtime, ticket 2189) : la version
  // qui tourne ici, la dernière publiée, et si elle est en retard. Absents tant que le pont ne le lit pas : la vue dit
  // alors sa version inconnue (station-version/station-version.js).
  statutDeLaStation?(): Promise<unknown>;
  // Installe la station de cet ordinateur (ticket 2640, home/station/) : rien quand elle est installée, ou pourquoi elle ne
  // l'est pas, en une ligne et son détail. Absent, le bouton de l'accueil dit que cet appareil ne l'installe pas.
  installerLaStation?(): Promise<{ refus: string; detail?: string } | undefined>;
  demarrerLaStationIci?(project: string): Promise<{ refus?: string }>;
  surStatutDeLaStation?(recevoir: (status: unknown) => void): void;
  // L'app Android seule (le ticket 2501) : la liste des projets vient d'être lue sur GitHub, ou ne l'a pas été — `liste`
  // dit laquelle. Les projets eux-mêmes arrivent par `surConfiguration`.
  surTelephone?(recevoir: (phone: Phone) => void): void;
  // Le chef a touché la notification d'une carte de TODO sur le téléphone (le ticket 2747), ou cliqué une question dans le
  // menu de la barre des menus sur un ordinateur (ticket 3269) — sa fiche s'ouvre.
  surOuvrirCarte?(recevoir: (project: string, ticket: number) => void): void;
  // L'écran du premier lancement avant l'avis de macOS (ticket 4081, first-launch/opinion-de-background.js) : le process
  // principal l'attend-il déjà, le demande plus tard, et son bouton pressé. Pas sur le téléphone.
  avisDeFond?(): Promise<boolean>;
  surAvisDeFond?(recevoir: () => void): void;
  continuerLePremierLancement?(): Promise<void>;
  // GitHub refuse la connexion de ce téléphone : le pont efface son jeton, et la vue revient à la connexion à GitHub.
  oublierLeTelephone?(): Promise<void>;
  // Le code qu'une station affiche, tapé par le chef : rend le nom de la station appairée, ou le
  // refus en une ligne — code mal formé, inconnu, expiré, ou GitHub muet. Rien n'est écrit alors.
  appairer(code: string): Promise<Appairage>;
  // « Add a project » : les dépôts que le `gh` du poste peut lire, chacun avec sa branche par
  // défaut — ou pourquoi ils ne sont pas lus.
  depotsDuChef(): Promise<{ depots: RepositoryDuChef[] } | { refus: string }>;
  // Un dépôt quelconque lu par son nom `owner/repo` (public et pas au chef compris) : sa branche par défaut, ou le refus en une phrase.
  lireUnDepot(repository: string): Promise<RepositoryDuChef | { refus: string }>;
  // Le dépôt choisi dans le parcours d'ajout est-il prêt pour brigade — ses bindings, ses labels (ticket 2627, contrat
  // du runtime, ticket 2626, joué sur la copie locale du dépôt) ; puis sa préparation, qui rend la même forme ou rejette avec
  // sa raison en une phrase.
  checkRepoSetup(repo: string): Promise<import("./addition-project/installation-du-repository.js").StateDuRepository>;
  runRepoSetup(repo: string): Promise<import("./addition-project/installation-du-repository.js").StateDuRepository>;
  // Le parcours validé : la demande s'écrit dans le gist de chaque station choisie, et rend le nom
  // du projet — ou chaque champ qui manque, avec sa raison, ou le refus de GitHub. Rien n'est écrit alors.
  ajouterAUneStation(saisie: { depot: string; base: string; stations: string[]; cooks: string; manager: { modele: string; effort: string }; reviewer: { modele: string; effort: string }; ouvertLe: string }): Promise<Addition>;
  // Confie la cuisine d'un projet de l'app à une première station, ou à une de plus (ticket 983) : la
  // demande s'écrit dans le gist de chaque station choisie, et rend le nom du projet — ou chaque champ
  // qui manque, ou le refus de GitHub. Rien n'est écrit alors.
  confierAUneStation(saisie: { nom: string; depot: string; base: string; stations: string[]; cooks: string; capacites?: string[]; manager: { modele: string; effort: string }; reviewer: { modele: string; effort: string }; ouvertLe: string }): Promise<Addition>;
  // Ce que le formulaire d'ajout d'une station montre d'emblée pour cet ordinateur (ticket 1307) : ses cooks, le dossier
  // des espaces de travail de sa station, ses capacités détectées — ou pourquoi il n'a pas pu être lu.
  defautsDeStation(name: string): Promise<DefautsDeLaMachine>;
  // Les dossiers de la station de cet ordinateur pour un projet (ticket 2489) : son clone, les worktrees de ses cooks —
  // ou pourquoi ils ne se lisent pas. Absent d'un pont qui n'en a pas (le téléphone).
  dossiersDeLaStation?(name: string): Promise<import("../projects/projects.ts").DossiersDeLaStation>;
  // Les dossiers et la porte réseau de la station de cet ordinateur (ticket 2644) : lus, et changés depuis sa page.
  lireReglagesDeLaStation?(): Promise<import("../settings-de-la-station.ts").Settings | import("../settings-de-la-station.ts").Refusal>;
  ecrireReglagesDeLaStation?(changement: import("../settings-de-la-station.ts").Changement): Promise<{ fait: string } | import("../settings-de-la-station.ts").Refusal>;
  // Retire le projet de la demande de chacune de ses stations : elles le retirent de leur configuration.
  retirerDUneStation(name: string): Promise<RetraitDUneStation>;
  // Déménage la cuisine d'un projet vers une station appairée — son gist (projects/demenagement.ts).
  demenagerLaCuisine(name: string, vers: string): Promise<Demenagement>;
  // « Continue without sandbox », devant une station sans bac à sable (ticket 1113) : le chef décide pour la
  // station du projet, et la retenue du rail se lève (runtime/src/onboarding/attente.ts). Rend ce qui est fait, ou pourquoi rien.
  continuerSansBacASable(name: string): Promise<{ fait: string } | { refus: string; detail?: string }>;
  // Le bouton du refus de la station (ticket 1205) : la principale du projet joue le remède que ce refus offre
  // — son code, l'identifiant du remède —, puis dit s'il est levé, s'il tient et pourquoi, ou que rien n'est fait.
  leverLeRefus(name: string, refusal: string, remede: string): Promise<IssueDuRemede>;
  // Une issue de la carte d'un besoin qui manque à la principale du projet (ticket 1400) : le choix — sa clé —, l'issue
  // retenue. Elle s'écrit dans la demande de la principale, qui la pose à son journal. Rend ce qui est fait, ou pourquoi rien.
  choisirUneIssue(name: string, choice: string, issue: string): Promise<Choisi>;
  // « report to brigade », sous chaque panne que l'app montre (ticket 1977) : ouvre dans le navigateur une nouvelle issue
  // préremplie sur benomite/brigade — versions, système, la panne, les lignes du journal qui en parlent, masquées
  // (report/ouverture.ts). Rien n'est envoyé : le chef l'envoie lui-même. Rend ouvert, ou pourquoi rien.
  signaler(request: RequestDeReport): Promise<RenduDuReport>;
  // Ouvre dans le navigateur une page où autoriser brigade sur GitHub — une de celles qu'une station a publiées —,
  // ou une page que le parcours d'un projet neuf montre (ticket 1111) : son geste, son ticket de préparation, sa PR.
  autoriserSurGitHub(url: string): Promise<boolean>;
  // Le bouton d'une panne, sur la ligne d'une station (outages/actions.ts) : relire GitHub, écarter la
  // ligne, lancer le login. Rend ce qu'il a fait, ou pourquoi rien, en une ligne.
  panne(id: string, cle: string): Promise<RenduDeOutage>;
  // Les réglages du projet sur sa page (ticket 1309) : lus là où sa cuisine tourne (`setting`), et changés par une PR sur
  // son dépôt — rien ne se pose sur la box (settings-du-project.ts). La PR rendue s'ouvre par `ouvrirLaProposition`.
  reglagesDuProjet(project: string): Promise<import("../settings-du-project.ts").ReadDesSettings>;
  proposerUnReglage(project: string, choice: import("../settings-du-project.ts").ChoiceDeSetting): Promise<import("../settings-du-project.ts").RenduDuSetting>;
  ouvrirLaProposition(url: string): Promise<boolean>;
  // Les résumés hebdomadaires de la cuisine d'un projet et le jour de leur écriture (ticket 3263,
  // resume-weekly/resume-kitchen.ts) ; le jour changé par une PR, qui s'ouvre par `ouvrirLaProposition` ; un
  // résumé publié comme les notes d'une version ; puis l'issue d'un ticket qu'ils nomment, ou la release publiée.
  lireLesResumesHebdomadaires(project: string): Promise<import("./resume-weekly/resume-kitchen.ts").ResumesDuProject>;
  changerLeJourDuResume(project: string, day: string): Promise<import("./resume-weekly/resume-kitchen.ts").RenduDuDay>;
  publierLeResumeHebdomadaire(project: string, weekStart: string, tag: string): Promise<import("./resume-weekly/resume-kitchen.ts").RenduDeLaPublication>;
  ouvrirTicketDuResume(url: string): Promise<boolean>;
  // Les humains du projet, sous Settings (ticket 2930) : ceux que son `projet.json` déclare, et chaque changement — ajouté, changé
  // ou retiré — écrit par une PR, qui rend son lien ou un refus d'une ligne (settings-humans/humans.js, humans-du-project.ts).
  // Optionnels : un pont qui ne les porte pas (le téléphone) ne montre pas la section.
  listerLesHumains?(project: string): Promise<import("../humans-du-project.ts").ReadDesHumans>;
  enregistrerUnHumain?(project: string, human: import("./settings-humans/humans.js").Human): Promise<import("./settings-humans/humans.js").Rendu>;
  retirerUnHumain?(project: string, login: string): Promise<import("./settings-humans/humans.js").Rendu>;
  // Les gestes qu'un agent retient pour l'OK du chef (held/, ticket 4273) : lus par `manager` là où la cuisine du projet
  // tourne — rien pour un projet qui ne cuit pas sur cet ordinateur —, et l'OK donné à l'un par son id.
  // Optionnels : un pont qui ne les porte pas (le téléphone) n'en montre aucun.
  gestesRetenus?(project: string): Promise<import("../held/contract.ts").ReadDesRetenus | undefined>;
  approuverGeste?(project: string, id: string): Promise<import("../held/contract.ts").Approbation>;
  // Les tickets récurrents du projet, sous Settings (ticket 3231) : lus par `recurring` là où sa cuisine tourne, et chacun
  // suspendu, repris ou retiré d'un clic (recurring/recurring.js, recurring/recurring-box.ts). Optionnels : un pont qui
  // ne les porte pas (le téléphone) ne montre pas la section.
  listerLesRecurrents?(project: string): Promise<import("./recurring/recurring-box.ts").ReadDesRecurring>;
  changerUnRecurrent?(project: string, action: import("./recurring/recurring-box.ts").Action, id: string): Promise<import("./recurring/recurring-box.ts").EcritureDUnRecurrent>;
  // La fiche du projet, sous Settings (ticket 4240) : un fichier du projet, le chemin relatif à son dossier — seul
  // `.brigade/fiche-projet.json` (card-project/card-project-dossier.ts). `null` : il n'y est pas. Optionnels : un pont qui
  // ne les porte pas (le téléphone) ne montre pas la section.
  lireUnFichierDuProjet?(project: string, chemin: string): Promise<string | null>;
  ecrireUnFichierDuProjet?(project: string, chemin: string, texte: string): Promise<void>;
  // Les explications des mots de la cuisine (ticket 3308) : les mots dont le chef de cet ordinateur a vu l'explication, gardés
  // par chef là où la cuisine du projet tourne ; un mot vu, et tout remontré depuis Settings (explanations/explanations-box.ts).
  // Optionnels : un pont qui ne les porte pas (le téléphone) ne montre aucune explication.
  lireLesExplications?(project: string): Promise<import("./explanations/explanations-box.ts").ReadDesExplanations>;
  marquerUneExplication?(project: string, word: import("./explanations/explanations-box.ts").WordExplique): Promise<import("./explanations/explanations-box.ts").EcritureDesExplanations>;
  remontrerLesExplications?(project: string): Promise<import("./explanations/explanations-box.ts").EcritureDesExplanations>;
  envoyerUnMot?(project: string, entree: { ticket: number; text: string }): Promise<import("./word-au-cook/source.js").Answer>; // le mot au cook (ticket 4048)
  // Le savoir-faire du projet, sous Know-how (ticket 4241) : ses entrées lues, une réécrite, une retirée, là où sa cuisine
  // tourne (know-how-tab/know-how-box.ts). Optionnels : un pont qui ne les porte pas (le téléphone) le dit sur l'onglet.
  lireLeSavoirFaire?(project: string): Promise<import("./know-how-tab/know-how-box.ts").ReadDuKnowHow>;
  modifierLeSavoirFaire?(project: string, id: string, texte: string): Promise<import("./know-how-tab/know-how-box.ts").EcritureDuKnowHow>;
  retirerDuSavoirFaire?(project: string, id: string): Promise<import("./know-how-tab/know-how-box.ts").EcritureDuKnowHow>;
  // Le récapitulatif de chaque projet, sur l'accueil (ticket 3581) : ce que sa cuisine a fait depuis que le chef a regardé, lu
  // là où elle tourne ; montré, son marqueur avance jusqu'à `until` ; la PR d'un ticket servi s'ouvre (recap/recap-box.ts).
  // Optionnels : un pont qui ne les porte pas (le téléphone) ne montre aucun récapitulatif.
  lireLeRecap?(project: string): Promise<import("./recap/recap-box.ts").ReadDuRecap>;
  marquerLeRecap?(project: string, until: string): Promise<import("./recap/recap-box.ts").MarqueDuRecap>;
  ouvrirLaPRDuRecap?(url: string): Promise<boolean>;
  // Les stations contributrices du projet, sous Settings (ticket 2936) : celles qui ont pris un ticket, le chef refuse ou réaccepte
  // chacune (settings-stations/stations.js, stations-contributrices.ts). Optionnels : un pont qui ne les porte pas ne montre pas le bloc.
  listerLesStationsContributrices?(project: string): Promise<import("../stations-contributrices.ts").ReadDesStations>;
  refuserUneStationContributrice?(project: string, station: string): Promise<import("../stations-contributrices.ts").EcritureDUneStation>;
  accepterUneStationContributrice?(project: string, station: string): Promise<import("../stations-contributrices.ts").EcritureDUneStation>;
  // Les plafonds de durée du projet, sur Kitchen > Health (ticket 2490) : les seuils `drift.*` que son dépôt déclare
  // (`.claude/brigade/projet.json`), lus sur sa branche d'intégration, sur GitHub, et changés par une pull request vers elle
  // (ticket 2920, caps-duree.ts) : la PR rendue s'ouvre par `ouvrirLaProposition`.
  plafondsDuree(project: string): Promise<import("../caps-duree.ts").ReadDesCaps>;
  changerPlafondDuree(project: string, cle: string, saisie: string): Promise<import("../caps-duree.ts").RenduDuCap>;
  // Le closer du projet, sur Kitchen > Health (ticket 2491) : ses passes et ce que chacune a retiré, ce que la dernière lui
  // a remis, ses vérifications en plus (`.claude/brigade/closer-checks.md`) et ses réglages (`closer.*` de
  // `.claude/brigade/projet.json`), lus sur sa branche d'intégration, sur GitHub (closer-sante.ts). Un réglage changé
  // ou une vérification ajoutée ou retirée s'y proposent par une pull request (ticket 2920), qui s'ouvre par `ouvrirLaProposition`.
  closerDeSante(project: string): Promise<import("../closer-sante.ts").ReadDuCloser>;
  changerReglageDuCloser(project: string, cle: string, saisie: string | { model: string; effort: string }): Promise<import("../closer-sante.ts").RenduDuSetting>;
  changerVerificationDuCloser(project: string, action: "ajouter" | "retirer", saisie: string): Promise<import("../closer-sante.ts").RenduDesVerifications>;
  savoirDuProjet(project: string): Promise<import("./know-how/know-how-github.ts").ReadDuSavoir>;
  changerLeSavoir(project: string, changement: import("./know-how/know-how-github.ts").ChangementDuSavoir): Promise<import("./know-how/know-how-github.ts").RenduDuSavoir>;
  // « Retirer la station », confirmé : son appairage est ôté de son gist (stations/stations.ts) ; la station n'est plus lue.
  retirerLaStation(id: string): Promise<RetraitDeStation>;
  // Les GitHub Apps de la station de cet ordinateur (ticket 2317, identities-github.js) : ce qu'elle a de chaque rôle —
  // l'ID de son App, si sa clé est là, jamais la clé —, et en ranger une, la clé passée au runtime qui la range
  // (runtime/src/identites-stations.ts). Absents, ou rien de rendu : cet appareil n'a pas de station.
  appsDeLaStation?(): Promise<import("./identities-github.js").ReadDesApps | undefined>;
  rangerUneApp?(role: import("./identities-github.js").Role, id: string, cle: string): Promise<import("./identities-github.js").RenduDuCleanup>;
  // Les projets que la station de cet ordinateur sert sur GitHub seul (ticket 2359, projects-served/) : la liste qu'elle
  // tient, et un projet ajouté ou retiré — chaque écriture rend la liste écrite. Absents, ou rien de rendu : pas de station.
  projetsServis?(): Promise<import("./projects-served/projects-served.js").ReadDesProjectsServed | undefined>;
  servirUnProjet?(repository: string, served: boolean): Promise<import("./projects-served/projects-served.js").ReadDesProjectsServed>;
  // Le premier lancement, sur un ordinateur neuf (ticket 1434, first-launch.ts) : les stations que le chef a
  // appairées et leurs projets, tels que le runtime les lit sur GitHub — listées, une connexion à GitHub qui manque,
  // ou pourquoi elles ne se lisent pas. Le téléphone ne les porte pas.
  stationsDuChef?(): Promise<StationsDuChef>;
  // Ouvre un projet qu'une station porte, ou un dépôt choisi dans « Add a project », sans dossier à choisir : sa copie
  // reprise ou clonée par le runtime, puis le projet ajouté au fichier des projets — il arrive par `surConfiguration` —,
  // ou pourquoi il ne l'est pas. `base` : la branche par défaut que GitHub a donnée du dépôt, sa branche d'intégration.
  ouvrirDUneStation?(name: string, repository: string, base?: string): Promise<Ouverture>;
  // Lance la connexion à GitHub que le runtime nomme : rend le code à taper et sa page, déjà ouverte — ou pourquoi
  // rien n'est parti. Sa fin arrive par `surConnexionGitHub`. Sur le téléphone (le ticket 2500), le pont la mène
  // lui-même avec GitHub, sans station : le jeton qu'elle rend reste dans son coffre, et la vue ne le voit jamais.
  seConnecterAGitHub?(): Promise<DebutDeConnection>;
  // Le login de Claude Code sur cet ordinateur (ticket 4057, outages/login.ts), quand l'ouverture d'un projet le demande :
  // ce qu'il a fait, ou pourquoi rien. Sa fin arrive par `surLoginClaude`.
  seConnecterAClaude?(): Promise<RenduDeOutage>;
  // Les outils que l'app ne livre pas (ticket 4059, tools-required.ts) : ceux de `outils` — les trois, sans liste — qui
  // manquent à cet ordinateur, chacun avec le lien de sa page d'installation.
  outilsManquants?(tools?: ("gh" | "git" | "claude")[]): Promise<import("../tools-required.ts").ToolManquant[]>;
  // Le compte GitHub que le `gh` de cet ordinateur tient (ticket 2475, connection-github.ts) : son login, aucun, ou
  // pourquoi il ne se lit pas. L'étape du compte du parcours d'ajout le dit, et le relit au bout d'une connexion.
  compteGitHub?(): Promise<AccountGitHub>;
  // Ouvre une page qu'un échec du runtime a nommée (installer `gh`, demander l'accès), ou celle qui dit comment obtenir
  // un outil qui manque au second (ticket 1435) ; rend faux pour toute autre.
  ouvrirLaPage?(url: string): Promise<boolean>;
  // Le lien de l'app Android que l'offre du téléphone montre (ticket 3303, update/android.ts) : l'`apkUrl` de la
  // dernière version publiée, ou la page des versions de brigade s'il ne se lit pas ; `ouvrirLaPage` l'ouvre ensuite.
  lienDeLApk?(): Promise<string>;
  // Un téléphone déjà connecté au compte GitHub de cet ordinateur (ticket 3303, phone-connecte.ts) : la trace que
  // l'app Android pose dans un gist ; `illisible` quand la liste des gists ne se lit pas.
  telephoneConnecte?(): Promise<{ connecte: boolean } | { illisible: string }>;
  // Les agents d'un projet (ticket 4029, autonomy/source.js) : un enregistrement par agent, tel que le runtime le publie ;
  // le niveau d'autonomie d'un agent, réglé ; un geste en attente, approuvé. Le côté runtime vient d'un autre ticket.
  lireLesAgents?(project: string): Promise<unknown[] | undefined>;
  reglerLAutonomie?(project: string, agent: string, niveau: import("./autonomy/source.js").Niveau): Promise<void>;
  approuverLeGeste?(project: string, agent: string, id: string): Promise<void>;
  // La cuisine que la visite montre (ticket 4087, visit.ts) : son rail, lu sur GitHub en lectures seules — rien n'est
  // cloné ni ajouté —, ou pourquoi il ne se lit pas. Seule benomite/brigade se visite.
  lireLaCuisineVisitee?(repository: string): Promise<import("../visit.ts").KitchenVisitee>;
  // Les stations enregistrées sous le compte GitHub du chef (ticket 1706, stations-du-account.ts) : listées — chacune
  // disponible ou non, avec les projets qu'elle sert —, une connexion à GitHub qui manque, ou pourquoi elles ne se
  // lisent pas. Le téléphone ne les porte pas.
  stationsDuCompte?(): Promise<StationsDuAccount>;
  // Écrit, dans le gist d'une station du compte, les projets qu'elle sert : la sélection entière — ou pourquoi elle
  // n'est pas écrite, en une ligne, son détail à part.
  choisirLesProjets?(id: string, depots: string[]): Promise<Choice>;
  // Le rail d'un projet que ni une box ni la station de cet ordinateur ne servent (ticket 1435) : celui que sa station
  // publie sur GitHub, rangé dans les colonnes du rail — ou pourquoi il ne se lit pas, en une phrase.
  railDuProjet?(name: string): Promise<import("../facts.ts").RailDuProjectLu>;
  // Ce qu'engage l'allumage du manager, chiffré (allumage.ts) : les issues ouvertes du projet, et
  // celles qui sont parquées (`parked`) — `manager backlog`, lancée une fois sur sa box. Demandé
  // quand la confirmation d'« allumer » s'ouvre : son « oui » n'attend pas cette lecture. Rien, pour un projet sans box.
  compter(project: string): Promise<Account | undefined>;
  // La réponse du chef à la carte de TODO d'un ticket (card-todo.ts) : un choix par son rang, ou son texte. Rien pour un projet sans box.
  repondreCarte(project: string, ticket: number, answer: import("../card-todo.ts").Answer): Promise<import("../card-todo.ts").Rendu | undefined>;
  // Un geste du chef sur la carte « Validate its screen » d'un ticket (validation-design/, ticket 3185) : valider, ou renvoyer
  // en cuisine avec un commentaire — la commande `design` du runtime, jouée par le process principal ; sur le téléphone, écrit
  // sur GitHub (actions-github-phone.ts). Rien pour un projet inconnu.
  gesteDeValidation(project: string, ticket: number, action: import("./validation-design/validation-design-github.ts").ActionDeValidation): Promise<import("./validation-design/validation-design-github.ts").RenduDeValidation | undefined>;
  // Une réponse du chef sur la carte « review before merge » d'un ticket sensible (card-sensitive/, ticket 3224) : merger, ou
  // renvoyer avec une note — la commande `sensitive` du runtime, jouée par le process principal. Absent du téléphone, qui ne
  // porte pas le runtime. Rien pour un projet inconnu.
  gesteSensible?(project: string, ticket: number, action: import("./card-sensitive/card-sensitive-github.ts").ActionSensitive): Promise<import("./card-sensitive/card-sensitive-github.ts").RenduSensitive | undefined>;
  // « undo » sur la carte d'un ticket servi (undo/, ticket 3274) : la commande `undo` du runtime, jouée par le process
  // principal — une PR revert son merge et passe la pass, le ticket est rouvert ; ou, en conflit, un ticket est déposé pour
  // la cuisine. Absent du téléphone, qui ne porte pas le runtime. Rien pour un projet inconnu.
  annulerServi?(project: string, ticket: number): Promise<import("./undo/undo-github.ts").RenduDAnnulation | undefined>;
  ouvrirBilan(project: string, url: string): Promise<boolean>;
  // Un lien de la ligne d'un projet en lecture seule (ticket 3163, vue/read-only/) : comment obtenir l'écriture sur son
  // dépôt, ou le forker — ouvert pour le seul dépôt que la dernière lecture dit en lecture seule (read-only.ts).
  ouvrirLectureSeule?(project: string, page: import("../read-only.ts").PageDeLaReadOnly): Promise<boolean>;
  // Le projet dont l'espace est affiché : sa box est lue, elle seule — `status`, pour le panneau.
  // `demande` revient sur chaque lecture qui y répond.
  regarder(project: string, request: number): void;
  // « Tous les projets » est affiché : toutes les box sont lues, chacune pour elle-même.
  tous(request: number): void;
  // L'onglet de contenu affiché : sa commande est lue, elle seule. Sans onglet
  // — un terminal, « Tous les projets » — plus rien n'est lu pour lui. `couts`, sans projet : la page
  // des coûts de l'app, qui lit `station` sur la box de chaque projet (onglets.ts, `COUTS`).
  onglet(project: string | undefined, id: string | undefined, request: number): void;
  // La barre est posée : `faits` est lu sur la box de chaque projet, quel que soit l'écran.
  faits(request: number): void;
  // Un ticket du rail, ouvert sur son issue dans le navigateur. Faux : l'adresse que la box
  // a rendue pour lui n'est pas en https, il n'est plus dans les derniers faits lus, ou le
  // poste n'a pas pu l'ouvrir.
  ouvrirIssue(project: string, ticket: number): Promise<boolean>;
  // Les checks du dépôt du projet (GitHub Actions), d'une alerte du rail qui en nomme un (ticket 4238). Rend s'ils ont été ouverts.
  ouvrirLesChecks(project: string): Promise<boolean>;
  // Un ticket de Livré, ouvert sur sa PR mergée dans le navigateur. Faux : l'adresse que la box
  // a rendue pour elle n'est pas en https, il n'est plus dans les derniers faits lus, ou le poste
  // n'a pas pu l'ouvrir.
  ouvrirPr(project: string, ticket: number): Promise<boolean>;
  // La PR du cook d'un ticket, ouverte dans le navigateur (activity-du-cook.js, ticket 1846) : l'adresse est celle que la
  // dernière lecture du tableau de la cuisine publie pour son cook. Faux : elle ne la publie plus, elle n'est pas en https,
  // ou le poste n'a pas pu l'ouvrir.
  ouvrirPrDuCook(project: string, ticket: number): Promise<boolean>;
  ecrire(id: number, donnees: string): void;
  redimensionner(id: number, colonnes: number, lines: number): void;
  // Ce que le second de chaque projet propose au chef, par son canal (second/propositions.ts, ticket 1520) : la proposition en
  // cours de chaque projet qui en a une, puis chaque changement par `surProposition` — null quand il n'y en a plus.
  // `repondreAuSecond` signale que le chef a répondu, d'un clic ou en tapant, et rend ce que le canal en a fait. Un
  // pont qui ne les porte pas (le téléphone) n'a pas de boutons sous le terminal : il n'a pas de terminal.
  propositionsDuSecond?(): Promise<Record<string, import("../second/propositions.ts").Proposition>>;
  repondreAuSecond?(project: string, answer: import("../second/propositions.ts").AnswerDuChef): Promise<unknown>;
  surProposition?(recevoir: (project: string, proposition: import("../second/propositions.ts").Proposition | null) => void): void;
  surSortie(recevoir: (id: number, donnees: string) => void): void;
  surEtat(recevoir: (terminal: Terminal) => void): void;
  // Ce que fait chaque cook d'un projet, à chaque lecture de son tableau de la cuisine (ticket 1846) — ou pourquoi
  // il ne se lit pas : la fiche d'un ticket en pose son cook (activity-du-cook.js).
  surActivites(recevoir: (publiees: import("./activity-du-cook.js").Publiees) => void): void;
  // Ce que la commande de l'onglet affiché a rendu, mot pour mot. `manager` : dans l'onglet
  // Manager, ce qui se pose au-dessus — l'état du manager, lu dans cette sortie (manager.ts).
  surContenu(recevoir: (read: Read, manager: Vu | undefined) => void): void;
  // Ce que `faits` a rendu pour un projet : de quoi dessiner, ou ce qui a été obtenu à la place.
  // Un essai du projet nommé a changé : la vue relit `essais`.
  surEssais(recevoir: (project: string) => void): void;
  surFaits(recevoir: (recue: Dessinable) => void): void;
  // La bande d'alertes d'un projet, redessinée à chaque lecture qui la change (alerts.ts) :
  // vide, les quatre états ont été lus et vont bien.
  surAlertes(recevoir: (bande: Bande) => void): void;
  // Le chef a cliqué la notification de l'urgence d'un projet (notification.ts) : la fenêtre est
  // déjà au premier plan, le projet s'ouvre sur sa ligne d'urgence et son geste.
  surUrgence(recevoir: (project: string) => void): void;
  // Ce qui est avant le rail du projet affiché (amont.ts) : ses issues par état — le bandeau Backlog, ticket 3460 —, ou
  // pourquoi rien n'est compté — et ce qui se lit à la place du rail quand il est vide.
  surAmont(recevoir: (vu: VuAmont) => void): void;
  // L'installation d'un projet a changé : une lecture de la box, une action partie ou revenue.
  surGuide(recevoir: (guide: Guide) => void): void;
  // Le retard du code de l'app sur son origine, et celui des clones de brigade parmi les projets,
  // relus : au démarrage, au retour à la fenêtre, quand le fichier des projets change. La
  // dernière lecture d'avant le démarrage de la vue est dans `demarrage`.
  surCode(recevoir: (vu: VuDuCode) => void): void;
  // L'état de la mise à jour de l'app installée, à chaque changement (voir `miseAJour`) : un
  // téléchargement le dit à chaque pour-cent gagné.
  surMiseAJour(recevoir: (state: StateDeUpdate) => void): void;
  // Les stations appairées, relues sur GitHub toutes les trente secondes, chacune en une ligne. La
  // dernière lecture d'avant le démarrage de la vue est dans `demarrage`.
  surStations(recevoir: (vu: VuDesStations) => void): void;
  // La veille de la station de cet ordinateur (ticket 3642, runtime/src/veille-machine/contrat.ts) : garde-t-elle ce Mac
  // éveillé à l'instant. Absente sur un poste sans station ; chaque changement arrive par `surVeilleMachine`.
  veilleMachine?(): Promise<import("../../../runtime/src/veille-machine/contrat.ts").Veille | undefined>;
  surVeilleMachine?(recevoir: (standby: import("../../../runtime/src/veille-machine/contrat.ts").Veille | undefined) => void): void;
  // Les projets des stations, relus à chaque lecture des stations : où en est chacun, sur chacune.
  surProjetsDesStations(recevoir: (vu: VuDesProjects) => void): void;
  // L'accueil (home.ts), redessiné à chaque lecture qui le change : une ligne par projet, une par
  // station, et la ligne de santé. Le dernier d'avant le démarrage de la vue est dans `demarrage`.
  surAccueil(recevoir: (vu: Home) => void): void;
  // Le fichier des projets a changé — ou l'app vient de désinstaller un projet de sa box.
  // `fermes` : les terminaux des projets qui ont quitté la liste.
  surConfiguration(recevoir: (configuration: Affichee, fermes: number[]) => void): void;
  // Une étape de la copie d'un projet qu'une station porte, pendant son ouverture : la phrase du runtime, et son pourcentage.
  surOuverture?(recevoir: (repository: string, step: Progres) => void): void;
  // La connexion à GitHub finie : connecté, ou pourquoi pas.
  surConnexionGitHub?(recevoir: (fin: FinDeConnection) => void): void;
  // Le login de Claude Code fini, réussi ou non : l'ouverture qu'il retenait se retente.
  surLoginClaude?(recevoir: () => void): void;
};

declare global {
  interface Window {
    brigade: Pont;
  }
}

// `liste` : la dernière lecture de la liste des projets sur GitHub (le ticket 2501), absente avant la première. Lue, ou ce
// qui l'a empêchée : ce qui ne se joint pas (`injoignable`, `inattendu`), ou `oublie`, la session GitHub refusée.
export type ListeDuPhone = { a: string; lue: true } | { a: string; lue: false; reason: "injoignable" | "inattendu" | "oublie"; said: string };
// Le téléphone, tel que le pont de l'app Android le garde : `github`, sa connexion à GitHub (le ticket 2500) — le compte
// sous lequel il lit, nul quand GitHub ne l'a pas dit ; absente tant qu'il n'y est pas connecté, et la vue s'ouvre alors
// sur la connexion.
export type Phone = { github?: { compte: string | null }; liste?: ListeDuPhone };
