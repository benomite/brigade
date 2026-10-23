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
import type { Vu } from "../manager.ts";
import type { Onglet, Rubrique } from "../onglets.ts";
import type { Bloc } from "../ordinaires.ts";
import type { Pages } from "../page.ts";
import type { RenduDePanne } from "../pannes/gestes.ts";
import type { EtatDeMiseAJour } from "../mise-a-jour/etat.ts";
import type { UpdateOffer } from "../mise-a-jour/android.ts";
import type { Lue as QuestionLue, Rendue as ReponseRendue } from "../question.ts";
import type { Vu as VuDuCode } from "../retard.ts";
import type { Avis, Retrait } from "../retrait.ts";
import type { Guide } from "../service.ts";
import type { DepotDuChef } from "../projets/github.ts";
import type { Ajout, Choisi, DefautsDeLaMachine, Demenagement, EFFORTS, MODELES, Retrait as RetraitDUneStation, VuDesProjets } from "../projets/projets.ts";
import type { IssueDuRemede } from "../projets/remede.ts";
import type { Appairage, RetraitDeStation, VuDesStations } from "../stations/stations.ts";
import type { Terminal } from "../terminaux.ts";
import type { DebutDeConnexion, FinDeConnexion } from "../connexion-github.ts";
import type { Ouverture, Progres, StationsDuChef } from "../premier-lancement.ts";

export type Pont = {
  // `poste` : le nom que l'écran donne à cet ordinateur (« this Mac », « this PC »), et s'il est un Mac — les raccourcis du terminal en dépendent.
  demarrage(): Promise<{ poste?: { nom: string; mac: boolean }; configuration: Affichee; palette: typeof PALETTE; exemple: string; onglets: readonly Onglet[]; rubriques: readonly Rubrique[]; boutons: readonly Bouton[]; gestes: { allumage: typeof ALLUMAGE; cuisine: typeof GESTES_DE_LA_CUISINE; grants: { gestes: typeof GESTES_DES_GRANTS; nommes: typeof GRANTS }; directs: typeof DIRECTS; confirmes: typeof CONFIRMES; attente?: typeof GESTES_D_ATTENTE }; banniere: typeof BANNIERE; calibrage: { modeles: typeof MODELES; efforts: typeof EFFORTS }; code: VuDuCode | undefined; stations?: VuDesStations; projetsDesStations?: VuDesProjets; accueil?: Accueil; miseAJour?: EtatDeMiseAJour; telephone?: Telephone }>;
  // Le dossier que le chef a choisi — rien, s'il a renoncé.
  choisirDossier(): Promise<string | undefined>;
  // Le dépôt GitHub et la branche d'intégration du dossier choisi, lus dans son clone — ou pourquoi ils restent à écrire.
  lireClone(dossier: string): Promise<Lu | undefined>;
  // L'ajout : le projet est écrit dans le fichier des projets, avec son dépôt et sa branche — ou ce
  // qui l'a empêché, champ par champ ou d'un bloc. Rien ne part vers aucune machine. Ajouté, il arrive par `surConfiguration`.
  ajouter(saisie: Saisie): Promise<Issue>;
  // Change la couleur d'onglet ou d'accent d'un projet, par le nom d'une couleur de la palette ou
  // une couleur libre `#rrggbb` (couleurs.ts). Rend la raison, si elle ne l'a pas été. Écrite, elle
  // arrive par `surConfiguration`.
  colorer(projet: string, role: Role, couleur: string): Promise<string | undefined>;
  // Le bloc « tickets ordinaires » de cet ordinateur pour un projet (ordinaires.ts) — rien, quand l'option n'existe pas ici.
  ordinaires(projet: string): Promise<Bloc | undefined>;
  // Règle l'option et la limite de cooks de cet ordinateur (`null` : aucune). Rend la raison, si rien n'a été écrit.
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
  // Un geste de la fiche que la vue ne joue pas : une action de box, qui part dans le second. Là où il n'y a pas de
  // second où l'écrire — le téléphone (ticket 1164) —, le pont joue l'action sur la station et rend ce qu'elle a fait,
  // comme `cuireSurLaStation` : `fait`, une phrase, et ce que la station a répondu en `detail`.
  gesteDeFiche(projet: string, id: string, ticket: number, valeur?: string): Promise<Terminal | { refus: string; detail?: string } | { fait: string; detail?: string }>;
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
  // La mise à jour de l'app installée (mise-a-jour/etat.ts) — l'état et ses deux gestes. L'état :
  // `inactive` (lancée depuis le dépôt, elle ne regarde rien), `verification`, `a-jour`,
  // `disponible` (avec la `nouvelle` version), `telechargement` (`recus` sur `taille` octets),
  // `prete` (téléchargée et vérifiée : elle s'installe au lancement suivant si rien n'est dit),
  // `installation`, `erreur` (sa `raison` en une ligne — un flux injoignable ne retient jamais l'app).
  // Le dernier d'avant le démarrage de la vue est dans `demarrage`, chaque changement par `surMiseAJour`.
  miseAJour(): Promise<EtatDeMiseAJour>;
  // Relit le flux des versions publiées, et rend l'état qui en sort ; une version plus haute part
  // aussitôt en téléchargement. Rien n'est relu pendant un téléchargement, ni une fois prête.
  verifierMiseAJour(): Promise<EtatDeMiseAJour>;
  // « Installer maintenant » : télécharge la nouvelle version si ce n'est pas fait, l'installe et
  // relance l'app sur elle — rien n'est rendu, elle se ferme —, ou dit pourquoi elle reste sur sa version.
  installerMiseAJour(): Promise<{ refus: string } | undefined>;
  // L'app Android seule (le ticket 1170) : l'offre d'une version plus haute, que la vérification du
  // lancement (mise-a-jour/android.ts) rend — `surOffreApk` la reçoit, sans jamais rien recevoir quand il n'y en
  // a pas —, et « Update », qui remet l'`apkUrl` à l'installation. Sur le desktop, qui se met à jour par
  // `miseAJour`, le pont ne rend aucune offre : `surOffreApk` n'y reçoit jamais rien.
  installerApk(apkUrl: string): Promise<unknown> | void;
  surOffreApk(recevoir: (offre: UpdateOffer) => void): void;
  // L'app Android seule (le ticket 1161) : le téléphone s'appaire au guichet d'une station qui tourne
  // (runtime/src/telephone/guichet.ts) avec le code qu'elle montre — `POST /pairing`. Appairé, le pont
  // garde son jeton, que la vue ne voit jamais, et `telephone` le dit au lancement suivant. Refusé ou
  // injoignable, rien n'est gardé. Sur le desktop, qui n'a rien à appairer ainsi, `demarrage` ne rend
  // aucun `telephone` : la vue ne pose pas l'écran, et ces deux gestes n'y font rien.
  appairerLeTelephone(demande: DemandeDuTelephone): Promise<ReponseDuGuichet>;
  // Le QR que la station montre, lu par l'appareil photo du téléphone : son texte, tel quel.
  scannerLeQr(): Promise<LectureDuQr>;
  // L'app Android seule (le ticket 1414) : la liste des projets de la station appairée vient d'être lue à son guichet, ou
  // ne l'a pas été — `liste` dit laquelle. Les projets eux-mêmes arrivent par `surConfiguration`.
  surTelephone?(recevoir: (telephone: Telephone) => void): void;
  // L'appairage oublié — la station ne connaît plus ce téléphone : le pont efface son jeton, et la vue revient à
  // l'écran qui le relie à ses projets.
  oublierLeTelephone?(): Promise<void>;
  // L'app Android seule (le ticket 1165) : la conversation avec le second d'un projet, là où il n'y a pas de terminal
  // où la lire. C'est celle du second du desktop — ce que le chef y a écrit, d'ici ou de son ordinateur, et ce que le
  // second a répondu, du plus ancien au plus récent —, ou pourquoi elle ne se lit pas. Le desktop ne les porte pas :
  // son second est un terminal. Un pont qui ne les porte pas encore rend `undefined`, et la vue le dit.
  conversation?(projet: string): Promise<Conversation | RefusDeConversation | undefined>;
  // Un message du chef au second du projet, tel qu'il l'a tapé : il part dans cette même conversation, comme s'il était
  // tapé dans le terminal du second sur le desktop. Rend la conversation qui le porte, ou pourquoi rien n'est parti.
  envoyerAuSecond?(projet: string, texte: string): Promise<Conversation | RefusDeConversation | undefined>;
  // La conversation d'un projet a bougé : le second répond, ou le chef a écrit du desktop.
  surConversation?(recevoir: (projet: string, conversation: Conversation) => void): void;
  // Un lien d'un message du second, ouvert dans le navigateur du téléphone.
  ouvrirLienDuSecond?(projet: string, url: string): Promise<boolean>;
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
  confierAUneStation(saisie: { nom: string; depot: string; base: string; stations: string[]; principale: string; cooks: string; capacites?: string[]; manager: { modele: string; effort: string }; reviewer: { modele: string; effort: string }; ouvertLe: string }): Promise<Ajout>;
  // Ce que le formulaire d'ajout d'une station montre d'emblée pour cet ordinateur (ticket 1307) : ses cooks, le dossier
  // des espaces de travail de sa station, ses capacités détectées — ou pourquoi il n'a pas pu être lu.
  defautsDeStation(nom: string): Promise<DefautsDeLaMachine>;
  // Retire le projet de la demande de chacune de ses stations : elles le retirent de leur configuration.
  retirerDUneStation(nom: string): Promise<RetraitDUneStation>;
  // Déménage la cuisine d'un projet vers une station appairée — son gist (projets/demenagement.ts).
  demenagerLaCuisine(nom: string, vers: string): Promise<Demenagement>;
  // « Continue without sandbox », devant une station sans bac à sable (ticket 1113) : le chef décide pour la
  // station du projet, et la retenue du rail se lève (runtime/src/onboarding/attente.ts). Rend ce qui est fait, ou pourquoi rien.
  continuerSansBacASable(nom: string): Promise<{ fait: string } | { refus: string; detail?: string }>;
  // Le bouton du refus de la station (ticket 1205) : la principale du projet joue le remède que ce refus offre
  // — son code, l'identifiant du remède —, puis dit s'il est levé, s'il tient et pourquoi, ou que rien n'est fait.
  leverLeRefus(nom: string, refus: string, remede: string): Promise<IssueDuRemede>;
  // Une issue de la carte d'un besoin qui manque à la principale du projet (ticket 1400) : le choix — sa clé —, l'issue
  // retenue. Elle s'écrit dans la demande de la principale, qui la pose à son journal. Rend ce qui est fait, ou pourquoi rien.
  choisirUneIssue(nom: string, choix: string, issue: string): Promise<Choisi>;
  // Ouvre dans le navigateur une page où autoriser brigade sur GitHub — une de celles qu'une station a publiées —,
  // ou une page que le parcours d'un projet neuf montre (ticket 1111) : son geste, son ticket de préparation, sa PR.
  autoriserSurGitHub(url: string): Promise<boolean>;
  // Le bouton d'une panne, sur la ligne d'une station (pannes/gestes.ts) : relire GitHub, écarter la
  // ligne, lancer le login. Rend ce qu'il a fait, ou pourquoi rien, en une ligne.
  panne(id: string, cle: string): Promise<RenduDePanne>;
  // Le bouton d'une station du projet, sur l'onglet Cooks (ticket 1185) : arrête ou relance la cuisine du projet sur
  // cette station (cuisson.ts). Rend ce qui est fait, ou pourquoi rien — ce que le runtime a dit, en `detail`.
  cuireSurLaStation(projet: string, station: string, geste: import("../cuisson.ts").GesteDeCuisson): Promise<import("../cuisson.ts").RenduDeCuisson>;
  // Une carte de « On the rail » glissée et lâchée à côté d'une autre (ticket 1347) : `rail move` la place juste avant ou
  // juste après elle, et lui donne sa priorité (deplacement.ts). Rend ce qui est fait, ou pourquoi rien n'a bougé, en une
  // phrase — ce que la station a répondu, en `detail`. Absent du téléphone : la carte ne s'y glisse pas.
  deplacer?(projet: string, ticket: number, voisin: number, cote: import("../deplacement.ts").Cote): Promise<import("../deplacement.ts").RenduDuDeplacement>;
  // Le plafond de cooks d'une station, réglé depuis sa page : un nombre (0 : sans limite) ou « auto » (le plafond de
  // ses cœurs revient). Part sur la box de chaque projet qui nomme la station — ou du seul `projet`, depuis sa ligne de station (ticket 1292) (plafond.ts) ; le plafond neuf arrive par `surAccueil`.
  reglerLePlafond(station: string, valeur: string, projet?: string): Promise<{ fait: string } | { refus: string; detail?: string }>;
  // Le plafond de calibrage du projet, réglé depuis son onglet Cooks (ticket 1284) : un modèle et un effort, ou « defaut »
  // — le retour au défaut. Part là où sa cuisine tourne (plafond-de-calibrage.ts) ; le plafond neuf arrive par la relecture.
  reglerLePlafondDeCalibrage(projet: string, choix: import("../plafond-de-calibrage.ts").ChoixDuPlafond): Promise<import("../plafond-de-calibrage.ts").RenduDuPlafond>;
  // Les réglages du projet sur sa page (ticket 1309) : lus là où sa cuisine tourne (`setting`), et changés par une PR sur
  // son dépôt — rien ne se pose sur la box (reglages-du-projet.ts). La PR rendue s'ouvre par `ouvrirLaProposition`.
  reglagesDuProjet(projet: string): Promise<import("../reglages-du-projet.ts").LectureDesReglages>;
  proposerUnReglage(projet: string, choix: import("../reglages-du-projet.ts").ChoixDeReglage): Promise<import("../reglages-du-projet.ts").RenduDuReglage>;
  ouvrirLaProposition(url: string): Promise<boolean>;
  // « Retirer la station », confirmé : son appairage est ôté de son gist (stations/stations.ts) ; la station n'est plus lue.
  retirerLaStation(id: string): Promise<RetraitDeStation>;
  // Le premier lancement, sur un ordinateur neuf (ticket 1434, premier-lancement.ts) : les stations que le chef a
  // appairées et leurs projets, tels que le runtime les lit sur GitHub — listées, une connexion à GitHub qui manque,
  // ou pourquoi elles ne se lisent pas. Le téléphone ne les porte pas.
  stationsDuChef?(): Promise<StationsDuChef>;
  // Ouvre un projet qu'une station porte, sans dossier à choisir : sa copie reprise ou clonée par le runtime, puis
  // le projet ajouté au fichier des projets — il arrive par `surConfiguration` —, ou pourquoi il ne l'est pas.
  ouvrirDUneStation?(nom: string, depot: string): Promise<Ouverture>;
  // Lance la connexion à GitHub que le runtime nomme : rend le code à taper et sa page, déjà ouverte — ou pourquoi
  // rien n'est parti. Sa fin arrive par `surConnexionGitHub`.
  seConnecterAGitHub?(): Promise<DebutDeConnexion>;
  // Ouvre une page qu'un échec du runtime a nommée (installer `gh`, demander l'accès), ou celle qui dit comment obtenir
  // un outil qui manque au second (ticket 1435) ; rend faux pour toute autre.
  ouvrirLaPage?(url: string): Promise<boolean>;
  // Le rail d'un projet que ni une box ni la station de cet ordinateur ne servent (ticket 1435) : celui que sa station
  // publie sur GitHub, rangé dans les colonnes du rail — ou pourquoi il ne se lit pas, en une phrase.
  railDuProjet?(nom: string): Promise<import("../faits.ts").RailDuProjetLu>;
  // Ce qu'engage l'allumage du manager, chiffré (allumage.ts) : les issues ouvertes du projet, et
  // celles qui portent `blocked-on-human` — `manager backlog`, lancée une fois sur sa box. Demandé
  // quand la confirmation d'« allumer » s'ouvre : son « oui » n'attend pas cette lecture. Rien, pour un projet sans box.
  compter(projet: string): Promise<Compte | undefined>;
  // Un geste de la partie closer (closer-lancement.ts), lancé une fois sur la box du projet : l'aperçu
  // d'un nettoyage, sa demande — qui ne part qu'avec `oui` à `true`, que la vue ne passe qu'au « oui »
  // du chef, devant ce qu'il coûte —, ou son annulation. Rend ce que le runtime a répondu, ou pourquoi
  // rien ne l'a été. Rien, pour un projet sans box.
  closer(projet: string, action: Action, oui?: true): Promise<RenduDuCloser | undefined>;
  // Le « yes » ou le « no » du chef sur une correction proposée des consignes du projet
  // (correction.ts), lancé une fois sur sa box : `correction yes|no <proposition>`. La vue nomme le
  // projet et le numéro de la proposition, que les derniers faits lus doivent porter. Rend la réponse
  // écrite — la carte quitte la file —, ou pourquoi rien ne l'a été. Rien, pour un projet sans box.
  corriger(projet: string, proposition: number, reponse: import("../correction.ts").Reponse): Promise<import("../correction.ts").Rendu | undefined>;
  // La réponse du chef à la carte de TODO d'un ticket (carte-todo.ts) : un choix par son rang, ou son texte. Rien pour un projet sans box.
  repondreCarte(projet: string, ticket: number, reponse: import("../carte-todo.ts").Reponse): Promise<import("../carte-todo.ts").Rendu | undefined>;
  // Le « yes » ou le « no » du chef sur un profil de cook proposé (profil.ts), par le même chemin :
  // `profile yes|no <proposition>` sur sa box. Le « yes » y écrit la définition du profil dans le dépôt
  // du projet. Rend la réponse écrite — la carte quitte la file —, ou pourquoi rien ne l'a été.
  trancherLeProfil(projet: string, proposition: number, reponse: import("../correction.ts").Reponse): Promise<import("../correction.ts").Rendu | undefined>;
  ouvrirBilan(projet: string, url: string): Promise<boolean>;
  // La ligne d'une leçon promue dans le carnet du projet, sur GitHub, ouverte dans le navigateur du poste
  // (apprentissage.ts) : la vue nomme le projet et la leçon, l'adresse est celle que ses derniers faits lus
  // portent. Rien n'est créé — ni branche, ni PR. Rend si elle a été ouverte.
  ouvrirLecon(projet: string, id: string): Promise<boolean>;
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
  // L'état de la mise à jour de l'app installée, à chaque changement (voir `miseAJour`) : un
  // téléchargement le dit à chaque pour-cent gagné.
  surMiseAJour(recevoir: (etat: EtatDeMiseAJour) => void): void;
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
  // Une étape de la copie d'un projet qu'une station porte, pendant son ouverture : la phrase du runtime, et son pourcentage.
  surOuverture?(recevoir: (depot: string, etape: Progres) => void): void;
  // La connexion à GitHub finie : connecté, ou pourquoi pas.
  surConnexionGitHub?(recevoir: (fin: FinDeConnexion) => void): void;
};

declare global {
  interface Window {
    brigade: Pont;
  }
}

// L'appairage du téléphone, tel que le pont de l'app Android le garde : aucun, sur une installation neuve.
// Un message de la conversation avec le second (le ticket 1165) : qui l'a écrit — le chef, d'où qu'il l'ait envoyé, ou
// le second —, quand, et son texte, le markdown rendu (markdown.ts), comme une discussion d'issue.
export type MessageDuSecond = { de: "chef" | "second"; a: string; blocs: import("../markdown.ts").Bloc[] };
// `repond` : le second écrit encore sa réponse au dernier message ; `echec` : il a échoué en y répondant (le ticket 1426) — une
// phrase, et ce que la station en a dit, au survol.
export type Conversation = { messages: MessageDuSecond[]; repond?: true; echec?: { refus: string; detail: string } };
// Une phrase, et ce que la station ou le pont en a dit, au survol.
export type RefusDeConversation = { refus: string; detail?: string };
// `liste` : la dernière lecture de la liste des projets au guichet de la station (le ticket 1414) — absente avant la
// première. Lue, ou ce qui l'a empêchée : le motif d'un guichet qui ne se joint pas (`injoignable`, `sans-guichet`,
// `inattendu`, comme pour l'appairage), ou `oublie`, la station qui ne connaît plus le jeton de ce téléphone.
export type ListeDuTelephone = { a: string; lue: true } | { a: string; lue: false; reason: "injoignable" | "sans-guichet" | "inattendu" | "oublie"; said: string };
export type Telephone = { appaire: false } | { appaire: true; station: string; adresse: string; liste?: ListeDuTelephone };
// Ce que le téléphone envoie au guichet : son adresse (`http://<hôte>:<port>`, ou `https://<machine>.ts.net` sur
// le tailnet du chef), le code tapé ou scanné,
// et ce qu'il dit de lui — son nom de station et sa machine.
export type DemandeDuTelephone = { adresse: string; code: string; nom: string; machine: string };
// Ce que le guichet a répondu : appairé, et à quelle station ; ou refusé, avec son motif (`inconnu`,
// `expire`, `utilise`, `nom-pris`, `essais`, `invalide`) et sa phrase. `injoignable` : la demande
// n'est jamais arrivée — `said` dit ce que le réseau en a dit ; `sans-guichet` : l'adresse répond, mais
// rien derrière elle (le 502 de `tailscale serve`) ; `inattendu` : ce qui répond n'est pas un guichet.
export type ReponseDuGuichet = { paired: true; station: string } | { paired: false; reason: string; said: string };
// Le QR lu, renoncé, ou impossible à lire — l'appareil photo refusé, le lecteur absent.
export type LectureDuQr = { lu: string } | { annule: true } | { refus: string };
