# scripts/capture-ecran — voir un écran de l'app sans l'ouvrir

Rend un écran de l'app dans un navigateur sans tête et l'écrit dans un PNG. La vue est celle du
dépôt (`app/src/vue/`, telle quelle) ; ce qu'elle affiche vient de **données figées**. Ni `claude`,
ni box, ni `gh`, ni réseau : un cook la lance dans son worktree, avant et après sa
modification, et regarde les deux images.

## La ligne

```sh
node scripts/capture-ecran/capture.ts espace-projet /tmp/avant.png
```

Lancée depuis la racine du worktree. Le chemin de sortie est libre (ses dossiers sont créés) et doit
finir par `.png`. Elle dit `/tmp/avant.png — espace-projet, 117397 octets`, et sort en 0.

Avant / après une modification de la vue :

```sh
node scripts/capture-ecran/capture.ts espace-projet /tmp/avant.png
# … la modification …
node scripts/capture-ecran/capture.ts espace-projet /tmp/apres.png
cmp /tmp/avant.png /tmp/apres.png && echo "rien n'a changé à l'écran"
```

Un écran inchangé donne **le même PNG à l'octet près**, d'une fois à l'autre et lancé de front
avec d'autres captures. Un PNG différent, c'est que l'écran a changé.

Les autres gestes :

| Geste | Commande |
|---|---|
| Lister les écrans | `node scripts/capture-ecran/capture.ts --liste` |
| Une capture à 2x (pixels de l'écran, `--densite 1` par défaut) | `… capture.ts tous-les-projets /tmp/x.png --densite 2` |
| Une autre taille de fenêtre | `… capture.ts tous-les-projets /tmp/x.png --largeur 1280 --hauteur 800` |
| Tests | `npm --prefix scripts/capture-ecran test` |
| Contrôle de types | `npm --prefix scripts/capture-ecran run typecheck` |

Une capture qui accroche n'écrit rien, sort en 1 et dit pourquoi : la vue a levé une exception, elle
a demandé un fichier absent ou le réseau, un clic d'étape ne trouve pas son élément, le navigateur
s'est arrêté, ou deux minutes ont passé. Un écran inconnu, ou un mauvais argument, sort en 2.

## L'installer, une fois par worktree

```sh
npm ci --prefix scripts/capture-ecran
```

Il pose ses dépendances de dev, dont **le navigateur sans tête** : `@sparticuz/chromium`, un Chromium
pour Linux x64 publié sur le registre npm avec les bibliothèques qu'il demande (nss, nspr…) — une
box nue n'en a aucune, et seul le registre npm est ouvert depuis la station. Le paquet pèse 67 Mo,
compressé ; la première capture le décompresse (environ 210 Mo) dans
`scripts/capture-ecran/node_modules/.cache/capture-ecran/`, et les suivantes le reprennent.

La vue charge xterm depuis `app/node_modules` : les dépendances de l'app doivent être posées
(`npm ci --ignore-scripts --prefix app`, que le setup de worktree fait déjà).

**Sur un Mac**, le paquet ne livre pas de navigateur : `BRIGADE_CAPTURE_CHROME` en désigne un, par
exemple `BRIGADE_CAPTURE_CHROME="/Applications/Google Chrome.app/Contents/MacOS/Google Chrome"`. La
capture est alors reproductible sur ce Mac, mais ses pixels ne sont pas ceux de la box : on ne
compare que deux captures du même navigateur.

## Les écrans capturables

| Écran | Ce qu'il montre |
|---|---|
| `tous-les-projets` | « Tous les projets », à l'ouverture de l'app : la barre, l'état du code et des stations, une carte par projet — deux projets sur une box, `parade` au travail, `cantine` calme |
| `tous-les-projets-installee` | Le même, l'app installée depuis le .dmg (#1011) : sans clone de l'app à lire |
| `tous-les-projets-mise-a-jour` | Le même, quand une version plus haute est publiée (#1014) : la version qui tourne, et le message avec « Install now » et « Later » |
| `nouvelle-version-mac`, `nouvelle-version-windows` | Le même, l'app installée sur un Mac puis sous Windows, quand une version plus haute est publiée (#1528, #2431) : la ligne en tête — « Brigade 1.4.0 is running — 1.5.0 is out — Download », le lien direct du .dmg ou du .exe, le premier lancement d'une app non signée au survol du lien ; pas de croix |
| `mise-a-jour-<état>-mac`, `mise-a-jour-<état>-pc` | Le même, l'app installée sur un Mac puis sur un PC sous Windows (#1156), sa mise à jour dans chacun des états `verification`, `disponible`, `telechargement`, `prete` et `erreur` : les deux postes donnent le même PNG à l'octet près (`ecrans/mise-a-jour-par-etat.ts`) |
| `station-hors-ligne`, `station-mise-a-jour`, `station-connexion-max` | La page d'une station en panne, ouverte d'un clic sur sa ligne : la panne en une ligne, son bouton, son explication au survol — une station par panne |
| `station-appels-absents` | La page d'une station en ligne d'un runtime qui ne publie pas ses appels GitHub de la dernière heure (#1418) : un tiret neutre |
| `espace-projet` | L'espace de `parade`, ouvert par sa case de la barre : le rail en colonnes (un ticket dans chacune, une décision qui t'attend, deux livrés), son second à droite |
| `espace-projet-gestes` | Le même (#1695), la fiche de #12 ouverte dans la colonne Awaiting you : sa livraison verte attend un merge à la main, la décision est connue — la fiche offre « merge the PR » en premier, puis l'issue, le second et la priorité |
| `fiche-priorite`, `fiche-priorite-echec` | L'espace de `parade`, la fiche de #22 (`prio:2`, dans la file) ouverte, `1` choisi et « change the priority » cliqué (#1739) : l'app a changé le label `prio:` de l'issue sur GitHub, sans la box — la fiche le dit et montre `prio:1` ; puis GitHub refuse, la fiche garde `prio:2` et dit pourquoi en une ligne, la réponse de GitHub au survol |
| `todo-github-seul` | L'espace de `parade`, projet GitHub seul (ticket 2221) : `facts` porte quatre cartes du chef lues de GitHub (`attend[].chef`) — une par issue au label `chef-todo`, la phrase de sa sorte (`blocked`, `merge-by-hand`, `product-question`, `abandoned`) et le texte du commentaire du runtime ; le numéro de chaque carte ouvre son issue |
| `todo-cartes-assignees` | L'espace de `parade` vu par alice, qui n'est pas le chef (ticket 2761) : son TODO ne porte que les deux cartes `chef-todo` qui lui sont assignées sur GitHub (#41, #47), passées par la règle de `app/src/vue/cartes-assignees/` — ni celle de bob, ni celle du chef —, chacune avec les gestes du chef |
| `espace-projet-ici` | L'espace de `parade` quand sa cuisine tourne sur ce Mac (#1122) : son rail, sa file et ses cartes comme pour une box |
| `espace-projet-station-arretee` | L'espace de `parade`, cuisant sur ce Mac, la station de ce Mac arrêtée (#1124) : une seule ligne, `this computer's station is not running`, à la place du rail |
| `demenager-choix` | L'espace de `parade`, qui cuit sur sa box (#1095) : `Cooks on box`, « move the kitchen » cliqué — le choix de la machine où l'emmener (ce Mac) et son prix en une ligne |
| `demenager-sur-ce-mac` | Le même, `parade` cuisant sur ce Mac : `Cooks on this Mac`, sa cuisine qui s'arrête avec l'app, et le choix ouvert — la box, recommandée, pour l'y ramener |
| `demenager-refuse` | Le même, sur la box, le déménagement vers ce Mac refusé par le runtime (pas de bac à sable) : la raison en une phrase sous la ligne, qui dit toujours `Cooks on box` |
| `barre-des-projets` | « Tous les projets » avec les cinq projets du chef — brigade, mirrorscreen, mirrorlab, escale, calculus-workspace (#1983) : chaque case écrit le sigle de son projet, en grand, sur une ligne — `MS` et `ML` pour les deux qui commencent pareil |
| `barre-sigle-reglage`, `barre-sigle-ecrit` | Les réglages de `mirrorlab`, parmi les cinq projets du chef (#1983) : sous toi, la ligne de son sigle — tiré de son nom, et le champ pour écrire le sien —, puis le même avec `LAB` écrit par le chef : la case l'écrit, la ligne le dit « yours », avec « back to its name ». En 1440 × 1040 |
| `couleurs` | La palette entière (#1106) : un projet par teinte dans la barre, chacun la portant en onglet et en accent, et les couleurs de `parade` sous Settings — ses deux rangées de pastilles, « other… » pour une couleur libre, et son accent dans l'espace. En 1440 × 1040, pour que la barre tienne entière |
| `couleurs-libre` | Les mêmes réglages, l'onglet de `parade` choisi libre près du vert d'état et son accent près de l'onglet de `cantine` (#1106) : gardés, pressés au bout de leur rangée, et une ligne sous chacun dit de quoi il est proche |
| `ajout` | « Add a project », ouvert par le `+` de la barre : le parcours d'ajout, son étape du compte connectée (#2475) et celle de la station, qui attend le projet (#2477), puis le formulaire d'ajout par un dossier |
| `ajout-station`, `ajout-station-sans-station` | Le même, un projet ajouté par son dossier (#2477) : le parcours reste à l'écran et demande « Who cooks this project? » — ce Mac d'abord, recommandé, puis atelier (hors ligne) et parade-box, les stations appairées ; puis, sans station appairée, ce Mac seul |
| `fiche` | La fiche de #14, ouverte par sa carte dans la colonne Taken du rail de `parade` : ce que son cook fait, son histoire et son coût, ses gestes et leur prix, l'issue et sa discussion |
| `demenager-sur-ce-pc` | `demenager-sur-ce-mac` sur un PC sous Windows (#1154) : `Cooks on this PC`, et le choix ouvert pour ramener la cuisine sur la box |
| `shell-ce-mac`, `shell-ce-pc` | L'espace de `parade`, un shell de ce poste montré à droite (#1154) : sur un Mac, persistant dans sa session, sous « this Mac · chef » — puis sur un PC sous Windows, le `bash` de Git, sous « this PC · chef », qui finit avec son terminal |
| `cout` | L'onglet Cost de `parade` (#908) : les tokens lancés sur 5 h, 24 h et 7 j, tous projets confondus, la part de `parade` et de `cantine` sous chacun, 7 j « not communicated », la ligne du quota, et dessous la courbe par jour « not communicated » (#909) : la box ne donne pas ses jours |
| `ratios` | La page des ratios de tous les projets (#1682), ouverte depuis la ligne « Closer » de l'accueil : `closing --json` lu sur cinq box — `brigade` dont le rapport baisse, `parade` où il tient, `cantine` où il monte, `atelier` trop jeune (« not enough data »), et `espace`, sans closer, qui n'a pas de ligne |
| `closer-derive` | La même partie, la dérive ayant franchi son seuil (#993) : la phrase qui propose un nettoyage et « Review the cleanup… », qui mène à la confirmation sans rien demander |
| `file-ou-cuit` | La file de `parade` quand la box sature : dans Taken, #14 cuit sur la box et #15 sur le Mac — « cooks on » sous « taken by » |
| `onglet-stations`, `onglet-stations-ajout` | L'onglet Stations de `parade` (#2487) : la liste de ses stations, celle de Cooks — la box cuit #14, le Mac arrêté y finit #15 —, et « Add a station » dessous ; puis le bouton cliqué : l'étape s'ouvre dans l'onglet, ce Mac d'abord, recommandé, puis atelier — parade-box, à qui parade est déjà choisi, n'y est pas —, et `cancel` |
| `ajout-projet-depot-pret`, `ajout-projet-depot-a-preparer`, `ajout-projet-depot-preparation`, `ajout-projet-depot-echec`, `ajout-projet-depot-illisible` | La page de nas, « + add a project » cliqué, `benomite/parade` choisi (#2627) : le dépôt vérifié prêt pour brigade — la phrase, et le parcours continue ; puis pas prêt — ce qui manque, ses bindings et ses labels, et « set it up » ; puis « set it up » cliqué, la préparation en cours ; puis la préparation refusée — une phrase, sa raison au survol, et « try again » ; enfin la vérification elle-même refusée — une phrase, sa raison au survol, et « try again » |
| `cooks-stations-declarees-vide` | L'onglet Stations de `parade` (#1509), sa box ne déclarant aucune station : la ligne qui le dit |
| `cooks-station-appelee` | L'onglet Stations de `parade` à qui manque un navigateur, « Cook it on a station that has it » cliqué sur sa carte (#1511) : le formulaire de pc/claude, la station de ce poste, avec `navigateur-headless` déjà coché |
| `rail-backlog`, `rail-backlog-deplie` | Le rail de `parade` (#1836) : à côté de l'histogramme des 24 heures, la barre empilée de ce qui est avant le rail — douze issues, une part par état (pas lue, refusée incomplète, épique, prête sans `fire`, mise de côté), sans un mot ; puis la barre cliquée : ses comptes dans sa bulle, et la colonne Backlog dépliée à gauche de « On the rail », ses cartes groupées par état |
| `stations-reglages` | L'onglet Stations de `parade` (#2488), qui cuit sur ce Mac : pour chacune de ses trois stations — `mac/claude` sur ce poste, `pc/claude` et `studio/claude` ailleurs —, son plafond de cooks, ses capacités en cases, ses tickets ordinaires et si elle sert le projet, chacun avec son niveau ; « Save » grisé tant que rien n'a changé |
| `rail-file` | La file de `parade`, quatre tickets sur le rail dans l'ordre où le runtime les sert, chacun avec sa priorité, #21 en tête qui dit pourquoi il ne part pas (#1347) |
| `demo-second`, `demo-rail-file`, `demo-cook-rail`, `demo-cook-stations`, `demo-cook-reprise`, `demo-pass-fiche` | La démo (#2875), sur un seul projet, `parade`, et un seul ticket, #21 « L'export du journal » (`ecrans/demo-commun.ts` porte ses étapes) : le second qui le propose ; sur le rail, en attente ; pris par le cook de la box ; l'onglet Stations où la box le cuit ; repris par le cook une fois la réponse du chef jouée ; sa fiche, servi |
| `demo-telephone-carte`, `demo-telephone-envoyee` | La même démo à la largeur d'un téléphone (412 × 915), la rangée des colonnes amenée sur la carte de #21 par l'étape `defiler` : sa question de produit, un bouton par choix ; puis le premier choix touché — le geste `repondreCarte` rend le commentaire posté, la carte dit `sent, waiting for the kitchen` |
| `projet-refuse`, `projet-refuse-confirmer`, `projet-refuse-tient`, `projet-refuse-sans-remede` | L'espace de `parade`, que sa box refuse de servir (#1178, #1205) : le refus, sa consigne et le bouton de son remède — puis le bouton cliqué et sa confirmation, le remède joué et la phrase qui dit pourquoi le refus tient, et un refus sans remède avec la phrase qui dit pourquoi il n'y a pas de bouton |
| `rail-publie`, `rail-publie-lecture`, `rail-publie-connexion`, `rail-publie-indisponible` | L'espace de `parade` ouvert sur un PC neuf, sans box ni station ici (#1435) : Rail montre le rail que parade-box publie sur GitHub, en cinq colonnes — puis sa lecture en route, ce PC sans compte GitHub (« Sign in to GitHub »), et sans `gh` (« get the GitHub CLI », « read again ») |
| `rail-github-seul`, `cooks-github-seul` | « parade » passé sur GitHub seul (#2220) : son rail tiré de GitHub par l'app (`app/src/vue/rail/github.ts`) — #21 et #22 sur le rail, #14 et #16 pris, #30 en pass (PR #41), #40 en WAITING —, puis son onglet Stations, box/claude et mac/claude d'après leurs commentaires de prise, chaque cook la carte de son ticket ; le tableau figé de l'ancien chemin est dans `github-seul-commun.ts` |
| `cooks-github-stations` | L'onglet Stations de « parade » sur GitHub seul, ses stations dans leurs trois états (#2358), d'après leurs prises et le signe de vie de leur gist : box/claude cuit #14 et #30, macbook-pro/claude est atteint et attend (`idle`), pc-du-salon/claude n'est pas atteint et dit son dernier signe de vie — la même ligne pour la box et les ordinateurs, ni principale ni bouton |
| `second-outils-manquants`, `second-sans-gh`, `second-sans-dossier` | Le même espace, son second tel que le runtime le planifie (#1435) : sans `claude`, `git` ni `gh`, il ne part pas — chaque outil nommé, le bouton de sa page (« how to get … »), comment l'obtenir au survol, « try again » —, puis parti sans `gh`, ce qui manque au-dessus du terminal, puis son dossier absent, la raison en une phrase |
| `second-choix` | Le même espace, son second qui demande de choisir (#1520) : sous le terminal, ce qu'on attend du chef, puis un bouton par choix publié par son canal (`runtime/src/second-propositions/`) — sa valeur et son libellé d'une ligne —, comment répondre au survol |
| `second-geste`, `second-geste-confirmation` | Le même espace, son second qui nomme un geste (#1521) : sous le terminal, ce qu'on attend du chef, puis un bouton qui porte la commande exacte publiée par son canal, longue et entière — puis le bouton cliqué, la confirmation qui redit la commande entière, « run it » et « cancel » |
| `projet-choix`, `projet-choix-retenu` | L'espace de `parade`, à qui manquent un Postgres et Docker pour ses tests (#1400) : « 2 choices wait for you on parade », une carte par besoin, ses trois issues et ce qui suit de chacune — puis « Provide it on box » cliqué sur la carte du Postgres : elle part, celle de Docker reste |
| `projet-blocages`, `projet-blocages-details` | L'espace de `parade`, que trois blocages retiennent (#1399) : « 3 things block parade », chacun sa phrase et sa cause, le lien qui nomme la page de GitHub, le bouton « choose another station », le détail replié — puis le même, le détail du premier déplié |
| `telephone-lancement` | Le premier écran de l'app Android installée neuve (#2500), en 412 × 915 : « Sign in to GitHub », ce qu'on attend du chef et « sign in with GitHub » — ni code d'appairage, ni QR, ni adresse de station |
| `telephone-connexion-code`, `telephone-connexion-refus` | Le même, « sign in with GitHub » cliqué : le code à taper sur la page de GitHub et « open the GitHub page again » ; puis GitHub injoignable, une ligne sous le bouton, le détail au survol, l'écran qui reste |
| `telephone-connecte` | L'app Android relancée, le téléphone connecté à GitHub (#2500) : « Tous les projets », « Signed in to GitHub as benomite. » en tête |
| `telephone-file` | La file de `parade` sur le téléphone connecté à GitHub (#1163), en 412 × 915 : Rail — Awaiting you en tête, puis On the rail, WAITING et Served, empilées |
| `premier-lancement`, `premier-lancement-clonage`, `premier-lancement-echec` | L'app ouverte pour la première fois sur un PC, sans projet (#1434) : en tête le parcours d'ajout et sa phrase d'accueil, le compte du PC connecté (#2475) ; les stations du chef, son Mac et parade-box, et les projets que chacune porte, un bouton chacun — puis parade cliqué, sa copie en route dite sous sa station ; puis son clone refusé, la raison du runtime, « open the page on GitHub » et « try again » |
| `premier-lancement-connexion`, `premier-lancement-code`, `premier-lancement-indisponible` | Le même écran quand le PC n'est connecté à aucun compte GitHub : l'étape du compte et « connect to GitHub » (#2475) ; puis le bouton cliqué, le code à taper sur la page ouverte ; puis sans `gh` sur le PC, la raison, « get the GitHub CLI » et « read again » |
| `stations-du-compte`, `stations-du-compte-ouverte`, `stations-du-compte-indisponible`, `stations-du-compte-vide` | « Tous les projets », dans la liste des stations, celles enregistrées sous le compte GitHub du chef (#1706, #1778), écrites par le lecteur du runtime (`stationDuGist`) : parade-box en ligne, le Mac arrêté, chacune avec ce qu'elle sert ; puis parade-box cliquée, les dépôts du chef en cases, ceux qu'elle sert cochés ; le Mac cliqué, la ligne qui le dit hors ligne et ses cases à cocher ; enfin aucune station, la phrase et la commande d'installation de chaque système, « copy » chacune. La capture « avant » est `tous-les-projets` |
| `stations-une-liste`, `stations-une-liste-ouverte`, `stations-une-liste-choisir`, `stations-une-liste-vide` | « Tous les projets », les stations du chef telles qu'il les a vues (#1778) : parade-box et macbook-air-de-benoit appairées et enregistrées sous le compte — leurs deux lectures se contredisaient —, nas seulement enregistrée ; puis nas cliquée, ses cases à cocher ; puis les projets du Mac ouverts (avant : sa ligne dans la liste du compte ; après : « choose projects ») ; enfin aucune station, ni appairée ni enregistrée. Avant #1778, la section les listait deux fois ; après, une ligne par machine |
| `stations-version-inconnue` | « Tous les projets », sous la liste des stations, la version de la station de ce Mac à côté de celle de parade-box (#2191), sans statut lu : `version unknown` et pourquoi au survol |
| `stations-station-locale`, `stations-station-locale-perdue` | L'onglet Stations de `parade`, qui cuit sur ce Mac (#2489) : sous la liste et les réglages des stations, le bloc de la station de ce Mac — son clone et ses worktrees, son bac à sable (`sandbox · ordinary tickets`, `cooks at once`), sa connexion à Claude —, chaque ligne avec son niveau `this machine` (plus de téléphones appairés depuis #2500) ; puis sa connexion perdue et « log in », son bac à sable indisponible et pourquoi. La capture « avant » est le même écran avant #2489, le bloc réduit à son titre |
| `station-projets-du-chef`, `station-projets-recherche` | La page de nas, seulement enregistrée, quand le compte du chef atteint 36 dépôts (#1780) : ses cases ne montrent que les projets du chef — ceux de l'app et ceux que parade-box sert —, et le champ qui cherche les autres ; puis « chat » tapé : les deux dépôts qui le contiennent, un bouton « add » chacun. Avant #1780, les 36 avaient chacun leur case |

Tous en 1440 × 900, sauf ceux du téléphone, `couleurs` et ceux du sigle sous Settings. `--liste` donne la liste à jour.

## Ce qui est figé

- **Les données** : ce que la box rend (`facts`, `status`, `station`), mot pour mot, dans
  `ecrans/cuisine-figee.ts`. Ce que la vue en reçoit est **calculé par les modules de l'app**
  (`faits.ts`, `attend.ts`, `alertes.ts`, `barre.ts`…) dans le même ordre que `main.ts`
  (`cuisine()`, dans `ecrans/commun.ts`) : un changement de ces modules se voit dans la capture.
- **L'heure** : `2026-10-13T10:04:12Z` (`MAINTENANT`), pour la vue (`Date.now()`, `new Date()`) comme
  pour les modules ; le fuseau est UTC, la langue `en-US`.
- **Le rendu** : la taille de la fenêtre, une densité de pixels de 1, le profil de couleur sRGB, les
  polices de l'app (embarquées dans `app/src/vue/polices/`) et, pour un caractère qu'elles n'ont pas,
  les polices de repli du paquet — jamais celles de la machine.

## Comment c'est fait

- `capture.ts` — la commande. Elle lance le navigateur, lui sert la page, rejoue les étapes de
  l'écran, attend que la page soit posée, et prend la capture.
- `navigateur.ts` — le Chromium du paquet, décompressé une fois, piloté par le protocole DevTools
  sur un tube (`--remote-debugging-pipe`) : aucun port n'est ouvert.
- `pont.js` — le faux pont, posé dans la page avant la vue. Il prend la place de `preload.cjs` :
  chaque geste invoqué rend sa réponse figée (rien, s'il n'en a pas), chaque lecture demandée
  (`faits`, `tous`, `regarder`, `onglet`) reçoit les envois figés du process principal, et rien ne
  part nulle part. Il arrête l'horloge, et dit quand la page est posée : rien en route vers elle,
  ses polices chargées, et aucun changement du document pendant cinq images de suite.
- **Hors ligne par construction** : la page est servie sous `http://app.brigade.invalid/` — un nom
  qui ne se résout jamais —, chaque requête est interceptée et servie depuis `app/` sur le disque ;
  toute autre est refusée, et la capture échoue en la nommant. Le navigateur n'a ni proxy ni
  résolution de nom (`--no-proxy-server`, `--host-resolver-rules=MAP * ~NOTFOUND`).

Les tests le montrent : deux captures vers deux chemins donnent deux PNG identiques à l'octet, avec
des doublures de `claude` et `gh` en tête du PATH qui ne sont jamais lancées ; chaque écran se
rend sans accroc ; et, là où `unshare -rn` coupe le réseau sans être root, la capture sans aucun
réseau est la même. **Les gates ne jouent pas ces tests** (elles jouent ceux du runtime et de l'app) :
`npm --prefix scripts/capture-ecran test` se lance à la main.

## Ajouter un écran

Un écran est un fichier `ecrans/<nom>.ts` qui exporte `ecran` (le type `Ecran` de
`ecrans/commun.ts`) ; son nom de fichier est son nom en ligne de commande. Les autres fichiers de
`ecrans/` (`commun.ts`, `cuisine-figee.ts`) n'exportent pas `ecran` : ils ne sont pas des écrans.

```ts
// ecrans/<nom>.ts — le plus court : « Tous les projets » à une autre taille.
import { configuration, cuisine, demarrage, type Ecran, MAINTENANT } from "./commun.ts";
import { PROJETS, RENDUS } from "./cuisine-figee.ts";

export const ecran: Ecran = {
  dit: "« Tous les projets » sur un petit écran",   // ce que `--liste` en dit
  largeur: 1024,
  hauteur: 700,
  // Les clics, du démarrage de l'app à l'écran — ici aucun.
  etapes: [],
  donnees: () => ({
    maintenant: MAINTENANT,
    reponses: { demarrage: demarrage(configuration(PROJETS)) },
    envois: cuisine(RENDUS),
  }),
};
```

`fiche.ts` est l'exemple complet : deux clics (la case de `parade`, puis la carte
`#rail .colonne:nth-child(2) li.bon`), et chaque réponse dont la fiche a besoin — `situation`,
`gestesDeFiche`, `lireHistoire`, `lireDiscussion` — calculée par le module de l'app qui la calcule
dans `main.ts`, à partir de ce que la box rendrait (`pass 14 --json`, `pass 14 issue`). `carteDe`
(dans `commun.ts`) donne la carte d'un ticket telle que la vue la reçoit.

- **`reponses`** : la réponse de chaque geste invoqué que l'écran fait jouer, par son nom dans le
  pont (`pont.d.ts`) — `demarrage` toujours. Une réponse est la même quels que soient les arguments.
  Prends-la, autant que possible, à la fonction de l'app qui la calcule (comme `ajout.ts` prend
  `proposerCalibrage` à `proposition.ts`) : elle suivra le code. Une réponse `{ __enAttente: true }` ne vient jamais : l'écran
  montre ce que la vue pose en l'attendant (`ajout-projet-depot-preparation`). Une réponse `{ __rejet: "…" }` rejette avec ce
  message : l'écran montre ce que la vue pose d'un échec (`ajout-projet-depot-echec`).
- **`envois`** : ce que le process principal pousse à la vue. `cuisine(RENDUS)` les rend pour la
  cuisine figée ; ajoutes-y un envoi (`{ sur: "surSortie", args: [id, texte] }` écrit dans un
  terminal, voir `espace-projet.ts`). `demande` sur un envoi : son premier argument reçoit le numéro
  de la dernière demande de cette lecture, que la vue compare au sien.
- **D'autres données de box** : un autre état du rail, une box qui ne répond pas… s'écrivent comme
  la box les rendrait, dans `cuisine-figee.ts` ou à côté, et passent par `cuisine()`.
- **`etapes`** : après chacune, la page se pose avant la suivante. Une étape est un clic
  (`{ cliquer: <sélecteur> }`), un texte tapé dans un champ (`{ saisir: <sélecteur>, texte }` : sa
  valeur posée, et l'`input` que la frappe déclencherait — `cooks-plafond-reglage`), ou un glisser
  (`{ glisser: <sélecteur>, sur: <sélecteur> }` : `dragstart` sur l'un, `dragover` sur l'autre, la capture
  le montre en vol ; `lacher: true` le lâche là, `drop` puis `dragend`), ou un appui long au doigt
  (`{ soulever: <sélecteur>, vers: <sélecteur> }` : `touchstart`, l'appui attendu, puis `touchmove` au centre de l'autre — la carte
  est soulevée ; `lacher: true` lève le doigt là, `touchend`). Un sélecteur qui
  ne désigne pas exactement un élément arrête la capture en le disant.

Puis : `--liste` le montre, une capture le rend, et `npm --prefix scripts/capture-ecran test` le
rend avec les autres — le test vérifie que **chaque** écran de `ecrans/` se rend sans accroc.

## Ce qu'elle ne fait pas

- Elle ne lance pas `main.ts` : ce qu'il câble (l'ordre des envois, ce qu'il passe à quel module)
  est repris dans `cuisine()`. Si `main.ts` change ce qu'il envoie à la vue, `cuisine()` est à suivre.
- Les terminaux ne font tourner ni `claude` ni shell : ils affichent ce qu'un envoi `surSortie` y écrit.
- Ce qui ne se voit qu'au survol n'a pas d'étape.
