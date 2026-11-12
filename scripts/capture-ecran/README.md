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
| `todo-trois-cartes`, `todo-six-cartes`, `todo-vingt-et-une-cartes` | L'espace de `parade`, projet GitHub seul (#3327) : `facts` porte trois, six puis vingt et une cartes du chef (`attend[].chef`), des revues de design aux titres et questions inégaux (`ecrans/todo-cartes-nombre.ts`) — à trois, la colonne Awaiting you est celle d'avant, octet pour octet ; à six elle prend deux pistes de la rangée, à vingt et une trois, sans quitter sa place (#3349), et range ses cartes compactes en grille |
| `todo-cartes-assignees` | L'espace de `parade` vu par alice, qui n'est pas le chef (tickets 2761, 2985) : son TODO porte d'abord les deux cartes `chef-todo` qui lui sont assignées sur GitHub (#41, #47), chacune avec les gestes du chef, puis « Awaiting others (2) », replié, pour celle de bob et celle du chef — le partage de `app/src/vue/cartes-assignees/` |
| `validation-design`, `validation-design-telephone` | La carte « Validate its screen » de #61 sur `parade`, projet GitHub seul (ticket 3185) : la livraison design de #58 (PR #60) que la pass retient pour le chef — la question, les captures avant et après, le lien de la PR, « Validate », le champ du commentaire et « Send back to the kitchen » (1440 × 900) ; puis la même carte ouverte depuis la liste du téléphone, la page entière (390 × 1240) |
| `carte-sensible`, `carte-sensible-note` | Le ticket sensible sur `parade`, projet GitHub seul (ticket 3224) : #30, au label `sensitive`, porte la marque « sensitive » dans Pass, les autres cartes non ; dans TODO, la carte « review before merge » #62 qui retient sa PR #41 — la question, le lien de la PR, « Merge », le champ de la note vide et « Send back » éteint (1440 × 900) ; puis la même, la note tapée, « Send back » allumé |
| `attente-github`, `attente-github-dialogue`, `attente-github-fiche`, `attente-github-telephone`, `attente-github-waiting-telephone` | WAITING sur `parade`, projet GitHub seul (#3075) : « waiting for… » sur chaque carte de TODO (#41, #47), et #40 dans WAITING — quoi, de qui, sa relance —, avec « resume » et « it arrived, back to the kitchen » (2200 × 760) ; puis « waiting for… » touché sur #41 : le formulaire, la relance proposée à sept jours (2200 × 1000) ; la fiche de #41, qui porte le même bouton ; enfin la carte de #41 et celle de #40 à la largeur d'un téléphone (412 × 915) |
| `visite`, `visite-cook` | Le même, la visite guidée rejouée par la case **?** de la barre (#3165) : sa première étape, la rangée des colonnes entourée de l'accent ; puis sa deuxième, la carte de #14 qu'un cook cuisine |
| `espace-projet-second-replie` | Le même, son second replié d'un clic sur le chevron de sa tête (#2923) : le rail prend la place, une bande étroite garde le bouton qui le déplie |
| `espace-projet-ici` | L'espace de `parade` quand sa cuisine tourne sur ce Mac (#1122) : son rail, sa file et ses cartes comme pour une box |
| `espace-projet-station-arretee` | L'espace de `parade`, cuisant sur ce Mac, la station de ce Mac arrêtée (#1124) : une seule ligne, `this computer's station is not running`, à la place du rail |
| `demenager-choix` | L'espace de `parade`, qui cuit sur sa box (#1095) : `Cooks on box`, « move the kitchen » cliqué — le choix de la machine où l'emmener (ce Mac) et son prix en une ligne |
| `demenager-sur-ce-mac` | Le même, `parade` cuisant sur ce Mac : `Cooks on this Mac`, sa cuisine qui s'arrête avec l'app, et le choix ouvert — la box, recommandée, pour l'y ramener |
| `demenager-refuse` | Le même, sur la box, le déménagement vers ce Mac refusé par le runtime (pas de bac à sable) : la raison en une phrase sous la ligne, qui dit toujours `Cooks on box` |
| `barre-des-projets` | « Tous les projets » avec les cinq projets du chef — brigade, mirrorscreen, mirrorlab, escale, calculus-workspace (#1983) : chaque case écrit le sigle de son projet, en grand, sur une ligne — `MS` et `ML` pour les deux qui commencent pareil |
| `barre-sigle-reglage`, `barre-sigle-ecrit` | Les réglages de `mirrorlab`, parmi les cinq projets du chef (#1983) : sous toi, la ligne de son sigle — tiré de son nom, et le champ pour écrire le sien —, puis le même avec `LAB` écrit par le chef : la case l'écrit, la ligne le dit « yours », avec « back to its name ». En 1440 × 1040 |
| `couleurs` | La palette entière (#1106) : un projet par teinte dans la barre, chacun la portant en onglet et en accent, et les couleurs de `parade` sous Settings — ses deux rangées de pastilles, « other… » pour une couleur libre, et son accent dans l'espace. En 1440 × 1040, pour que la barre tienne entière |
| `couleurs-libre` | Les mêmes réglages, l'onglet de `parade` choisi libre près du vert d'état et son accent près de l'onglet de `cantine` (#1106) : gardés, pressés au bout de leur rangée, et une ligne sous chacun dit de quoi il est proche |
| `ajout` | « Add a project », ouvert par le `+` de la barre (#3181) : les dépôts du compte GitHub de ce poste, connecté, les derniers poussés d'abord, sous le champ qui les cherche, puis le champ où coller un dépôt public — ni dossier, ni branche, ni étapes |
| `parcours-premier-projet`, `parcours-premier-projet-setup`, `parcours-premier-projet-merge`, `parcours-premier-projet-pret` | La page d'un projet pas encore prêt (#3166) : `chef/cantine` choisi sur « Add a project », qu'aucune station ne cuit et où le compte peut écrire — à la place du rail, « 1 of 2: who cooks it », cet ordinateur recommandé ; puis, ce bouton cliqué, « 2 of 2: its setup for Brigade », le second qui lit le dépôt ; puis la PR de mise en place qui attend le merge, « open its card » ; enfin, `cantine` déjà prêt, la mise en place pas posée — le rail reprend la page, sous la question du second : « chef/cantine is ready. What do you want to change first? », son champ et « send to the second » (#3306) |
| `premier-ticket-brouillon`, `premier-ticket-sur-le-rail` | Le premier ticket de `cantine`, écrit dans l'app (#3306, `ecrans/premier-ticket-commun.ts`) : la réponse du chef envoyée, le brouillon du second — son titre, son corps —, « Yes, put it on the rail », le champ des changements et « ask for changes » ; puis le « oui » cliqué, « #12 is on the rail: the kitchen serves it. » |
| `recit-premier-ticket`, `recit-premier-ticket-servi` | La même page, `cantine` ajouté sur un ordinateur sans autre projet que la cuisine de démonstration, puis les lectures de son rail l'une après l'autre (#3302, `ecrans/recit-premier-ticket-commun.ts`) : au-dessus du rail, « Your first ticket, #5, step by step » et « dismiss », une ligne par étape vue — Taken, Pull request et « open pull request #6 », In pass, Sent back et la raison de la pass, Taken again, In pass ; puis Served, la PR mergée et son lien. La capture « avant » est la même page sans le récit |
| `offre-telephone-lien` | La page de `parade` après son premier ticket servi, l'offre du téléphone acceptée (#3303) : sous la durée figée, le lien de l'app Android et « Sign in with the same GitHub account », puis « no thanks ». Sa capture « avant » est la même page rendue sur `main`, sans le clic : aucune offre |
| `choix-station`, `choix-station-qui-cuit` | Le choix de la station d'un projet quand une station est hors ligne (#3187) : « choose its machine » cliqué sur `parade`, la box hors ligne depuis 22 min, ce Mac en ligne — cet ordinateur en tête, choisi, son nom d'hôte après « this computer », la box ni cochée ni recommandée, sa ligne « Offline for 22 min: … », les cooks de ce Mac, sans « Advanced settings » ; puis « Who cooks chef/cantine? », la box du compte hors ligne depuis 22 min |
| `fiche` | La fiche de #14, ouverte par sa carte dans la colonne Taken du rail de `parade` : ce que son cook fait, son histoire et son coût, ses gestes et leur prix, l'issue et sa discussion |
| `demenager-sur-ce-pc` | `demenager-sur-ce-mac` sur un PC sous Windows (#1154) : `Cooks on this PC`, et le choix ouvert pour ramener la cuisine sur la box |
| `shell-ce-mac`, `shell-ce-pc` | L'espace de `parade`, un shell de ce poste montré à droite (#1154) : sur un Mac, persistant dans sa session, sous « this Mac · chef » — puis sur un PC sous Windows, le `bash` de Git, sous « this PC · chef », qui finit avec son terminal |
| `cout` | L'onglet Cost de `parade` (#908) : les tokens lancés sur 5 h, 24 h et 7 j, tous projets confondus, la part de `parade` et de `cantine` sous chacun, 7 j « not communicated », la ligne du quota, et dessous la courbe par jour « not communicated » (#909) : la box ne donne pas ses jours |
| `resume-hebdo-entree` | Le bandeau de santé de `parade`, amené sur ses lignes de tous les projets (#3263) : « Cost », « Closer » et « Weekly summary » |
| `resume-hebdo`, `resume-hebdo-sans-autonomie`, `resume-hebdo-publier` | La page des résumés hebdomadaires (#3263), ouverte par « Weekly summary » : la semaine du 5 octobre de `parade`, le jour du résumé (lundi, par défaut), ses thèmes, chaque ligne le numéro de son ticket, l'autonomie puis « Waiting for the chef » ; la même sans chiffres d'autonomie ; puis « Publish as release notes » cliqué, le tag demandé |
| `ratios` | La page des ratios de tous les projets (#1682), ouverte depuis la ligne « Closer » de l'accueil : `closing --json` lu sur cinq box — `brigade` dont le rapport baisse, `parade` où il tient, `cantine` où il monte, `atelier` trop jeune (« not enough data »), et `espace`, sans closer, qui n'a pas de ligne |
| `closer-derive` | La même partie, la dérive ayant franchi son seuil (#993) : la phrase qui propose un nettoyage et « Review the cleanup… », qui mène à la confirmation sans rien demander |
| `file-ou-cuit` | La file de `parade` quand la box sature : dans Taken, #14 cuit sur la box et #15 sur le Mac — « cooks on » sous « taken by » |
| `onglet-stations` | L'onglet Stations de `parade` (#2487, refait par #3195) : la ligne du haut — « Cooked by box · online · 1 cook at work » —, puis une carte par station qui le sert : la box cuit #14, le Mac arrêté y finit #15 ; chacune ses deux gestes et « Details » replié |
| `stations-tab-cuit`, `stations-tab-deplacement`, `stations-tab-hors-ligne`, `stations-tab-personne` | L'onglet Stations de `parade` dans chacun des quatre états de sa ligne du haut (#3195, `ecrans/stations-tab-commun.ts`) : cuit par sa box en ligne — « Cooked by parade-box · online · 1 cook at work », en vert, une carte ; sa cuisine en route vers ce Mac depuis trois minutes — « Moving from parade-box to macbook: waiting for … », et ce qui le bloque passée la minute, la carte de ce Mac qui démarre ; sa box hors ligne — rien ne cuit, « Move to this computer » ; aucune station ne le sert — « Nobody cooks this project », « Choose who cooks it ». Leurs captures avant et après sont dans `docs/captures/stations-tab/` |
| `ajout-projet-depot-pret`, `ajout-projet-depot-a-preparer`, `ajout-projet-depot-preparation`, `ajout-projet-depot-echec`, `ajout-projet-depot-illisible` | La page de nas, « + add a project » cliqué, `benomite/parade` choisi (#2627) : le dépôt vérifié prêt pour brigade — la phrase, et le parcours continue ; puis pas prêt — ce qui manque, ses bindings et ses labels, et « set it up » ; puis « set it up » cliqué, la préparation en cours ; puis la préparation refusée — une phrase, sa raison au survol, et « try again » ; enfin la vérification elle-même refusée — une phrase, sa raison au survol, et « try again » |
| `cooks-stations-declarees-vide` | L'onglet Stations de `parade` (#1509, #3195), sa box ne déclarant aucune station : la seule carte est celle de la box qui le sert, sans réglage de déclaration dans son « Details » |
| `cooks-station-appelee` | L'onglet Stations de `parade` à qui manque un navigateur, « Cook it on a station that has it » cliqué sur sa carte (#1511) : « Details » de pc/claude, la station de ce poste, ouvert sur ses rangées de réglage (#2920, #3195), `navigateur-headless` offert, décoché : le cocher le déclare aussitôt |
| `rail-backlog`, `rail-backlog-deplie` | Le rail de `parade` (#1836, #3013) : dans la ligne de chiffres, « Backlog 12 issues » — un nombre, ni barre ni jauge ; puis le backlog cliqué : ses comptes dans sa bulle, et la colonne Backlog dépliée à gauche de « On the rail », ses cartes groupées par état |
| `settings-humains`, `settings-humains-vide`, `settings-humains-refus` | Les réglages de `parade` (#2930) : sous ceux de son projet, ses humains — alice, bob et carol-dupont, chacun ses rôles en vigueur et en cases, et « a change opens a pull request, applied once merged » —, `review` coché pour bob, dont la rangée dit « proposed in pull request #2951 » ; puis aucun humain déclaré, la ligne qui le dit et « add the first human » ; puis `ghost-user` ajouté et refusé, le refus en une ligne sur sa rangée seule. En 1440 × 1240 |
| `recurrents`, `recurrents-vide` | Les réglages de `parade` (#3231), sous ses humains : ses tickets récurrents — une rangée chacun, son titre, son rythme en mots (« every day », « every week on Monday », « every month on the 15th »), « next » et sa prochaine date, « pause » et « remove » ; « Rotate the deploy keys » suspendu dit « paused », sans date, et offre « resume » — ; puis aucun : « No recurring tickets yet. ». En 1440 × 1500 |
| `explications`, `explications-reglages` | Les explications des mots de la cuisine (#3308) : l'espace de `parade` d'un chef qui n'en a vu aucune — sous l'onglet Rail, la bande, les titres de Pass, Awaiting you et Waiting, et l'onglet du second, le mot, sa ligne de `docs/glossary.md` et « got it » — ; puis ses réglages, les six vues : « 6 of 6 seen » et « show all the explanations again », en 1440 × 1600 |
| `stations-reglages` | L'onglet Stations de `parade` (#2488, #3195), qui cuit sur ce Mac : une carte pour chacune de ses stations — `mac/claude` sur ce poste, `pc/claude` et `studio/claude` ailleurs, la box —, et dans « Details », replié, son plafond de cooks, ses capacités en cases et ses tickets ordinaires, chacun une rangée de réglage avec son niveau (#2920) : aucun « Save », chaque contrôle s'applique dès qu'il change |
| `rail-file` | La file de `parade`, quatre tickets sur le rail dans l'ordre où le runtime les sert, chacun avec sa priorité, #21 en tête qui dit pourquoi il ne part pas (#1347) |
| `demo-second`, `demo-rail-file`, `demo-cook-rail`, `demo-cook-stations`, `demo-cook-reprise`, `demo-pass-fiche` | La démo (#2875), sur un seul projet, `parade`, et un seul ticket, #21 « L'export du journal » (`ecrans/demo-commun.ts` porte ses étapes) : le second qui le propose ; sur le rail, en attente ; pris par le cook de la box ; l'onglet Stations où la box le cuit ; repris par le cook une fois la réponse du chef jouée ; sa fiche, servi |
| `demo-telephone-carte`, `demo-telephone-envoyee` | La même démo à la largeur d'un téléphone (412 × 915), la rangée des colonnes amenée sur la carte de #21 par l'étape `defiler` : sa question de produit, un bouton par choix ; puis le premier choix touché — le geste `repondreCarte` rend le commentaire posté, la carte dit `sent, waiting for the kitchen` |
| `projet-refuse`, `projet-refuse-confirmer`, `projet-refuse-tient`, `projet-refuse-sans-remede` | L'espace de `parade`, que sa box refuse de servir (#1178, #1205) : le refus, sa consigne et le bouton de son remède — puis le bouton cliqué et sa confirmation, le remède joué et la phrase qui dit pourquoi le refus tient, et un refus sans remède avec la phrase qui dit pourquoi il n'y a pas de bouton |
| `rail-publie`, `rail-publie-lecture`, `rail-publie-connexion`, `rail-publie-indisponible` | L'espace de `parade` ouvert sur un PC neuf, sans box ni station ici (#1435) : Rail montre le rail que parade-box publie sur GitHub, en cinq colonnes — puis sa lecture en route, ce PC sans compte GitHub (« Sign in to GitHub »), et sans `gh` (« get the GitHub CLI », « read again ») |
| `rail-github-seul`, `cooks-github-seul` | « parade » passé sur GitHub seul (#2220) : son rail tiré de GitHub par l'app (`app/src/vue/rail/github.ts`) — #21 et #22 sur le rail, #14 et #16 pris, #30 en pass (PR #41), #40 en WAITING —, puis son onglet Stations, box/claude et mac/claude d'après leurs commentaires de prise, chaque cook la carte de son ticket ; le tableau figé de l'ancien chemin est dans `github-seul-commun.ts` |
| `cooks-github-stations` | L'onglet Stations de « parade » sur GitHub seul (#2358, #3195), d'après les prises et le signe de vie de ses stations : « Cooked by … · online » en tête ; box/claude cuit #14 et #30, macbook-pro/claude est en ligne et attend (`idle`), pc-du-salon/claude est hors ligne et dit depuis quand — la même carte pour la box et les ordinateurs |
| `second-outils-manquants`, `second-sans-gh`, `second-sans-dossier` | Le même espace, son second tel que le runtime le planifie (#1435) : sans `claude`, `git` ni `gh`, il ne part pas — chaque outil nommé, le bouton de sa page (« how to get … »), comment l'obtenir au survol, « try again » —, puis parti sans `gh`, ce qui manque au-dessus du terminal, puis son dossier absent, la raison en une phrase |
| `second-choix` | Le même espace, son second qui demande de choisir (#1520) : sous le terminal, ce qu'on attend du chef, puis un bouton par choix publié par son canal (`runtime/src/second-propositions/`) — sa valeur et son libellé d'une ligne —, comment répondre au survol |
| `second-geste`, `second-geste-confirmation` | Le même espace, son second qui nomme un geste (#1521) : sous le terminal, ce qu'on attend du chef, puis un bouton qui porte la commande exacte publiée par son canal, longue et entière — puis le bouton cliqué, la confirmation qui redit la commande entière, « run it » et « cancel » |
| `projet-choix`, `projet-choix-retenu` | L'espace de `parade`, à qui manquent un Postgres et Docker pour ses tests (#1400) : « 2 choices wait for you on parade », une carte par besoin, ses trois issues et ce qui suit de chacune — puis « Provide it on box » cliqué sur la carte du Postgres : elle part, celle de Docker reste |
| `projet-blocages`, `projet-blocages-details` | L'espace de `parade`, que trois blocages retiennent (#1399) : « 3 things block parade », chacun sa phrase et sa cause, le lien qui nomme la page de GitHub, le bouton « choose another station », le détail replié — puis le même, le détail du premier déplié |
| `telephone-lancement` | Le premier écran de l'app Android installée neuve (#2500), en 412 × 915 : « Sign in to GitHub », ce qu'on attend du chef et « sign in with GitHub » — ni code d'appairage, ni QR, ni adresse de station |
| `telephone-connexion-code`, `telephone-connexion-refus` | Le même, « sign in with GitHub » cliqué : le code à taper sur la page de GitHub et « open the GitHub page again » ; puis GitHub injoignable, une ligne sous le bouton, le détail au survol, l'écran qui reste |
| `telephone-connecte` | L'app Android relancée, le téléphone connecté à GitHub (#2500) : « Tous les projets », « Signed in to GitHub as benomite. » en tête |
| `cartes-du-chef-liste` | Le téléphone de la maquette (`Phone.dc.html`, 390 × 844, #2915) : la liste des cartes qui attendent le chef — la question de #21 dans `parade` |
| `cartes-du-chef-carte` | La même, la carte de #21 ouverte d'un toucher : sa question, un bouton par choix (le recommandé plein d'accent), le champ de texte libre et « Send » |
| `cartes-du-chef-envoyee` | Le premier choix touché : « Sent to the kitchen. » et le retour à la liste |
| `telephone-file` | La file de `parade` sur le téléphone connecté à GitHub (#1163), en 412 × 915 : Rail — Awaiting you en tête, puis On the rail, WAITING et Served, empilées |
| `premier-lancement`, `premier-lancement-clonage`, `premier-lancement-echec` | L'app ouverte pour la première fois sur un PC, sans projet (#1434) : en tête le parcours d'ajout et sa phrase d'accueil, le compte du PC connecté (#2475) ; les stations du chef, son Mac et parade-box, et les projets que chacune porte, un bouton chacun — puis parade cliqué, sa copie en route dite sous sa station ; puis son clone refusé, la raison du runtime, « open the page on GitHub » et « try again » |
| `premier-lancement-connexion`, `premier-lancement-code`, `premier-lancement-indisponible` | Le même écran quand le PC n'est connecté à aucun compte GitHub : l'étape du compte et « connect to GitHub » (#2475) ; puis le bouton cliqué, le code à taper sur la page ouverte ; puis sans `gh` sur le PC, la raison, « get the GitHub CLI » et « read again » |
| `projet-d-essai`, `projet-d-essai-servi` | Le premier écran du même PC, le projet d'essai créé (#3227, `ecrans/projet-d-essai-commun.ts`) : à côté de « open this project », « try on a sample project » ; en bas à droite, son encart — `benomite/brigade-sample`, qui ouvre sa page, son ticket #1 sur le rail, « open its ticket » et « delete the sample repository » ; puis la PR du ticket mergée, « Your first ticket was served in 8 minutes. » |
| `stations-du-compte`, `stations-du-compte-ouverte`, `stations-du-compte-indisponible`, `stations-du-compte-vide` | « Tous les projets », dans la liste des stations, celles enregistrées sous le compte GitHub du chef (#1706, #1778), écrites par le lecteur du runtime (`stationDuGist`) : parade-box en ligne, le Mac arrêté, chacune avec ce qu'elle sert ; puis parade-box cliquée, les dépôts du chef en cases, ceux qu'elle sert cochés ; le Mac cliqué, la ligne qui le dit hors ligne et ses cases à cocher ; enfin aucune station, la phrase et la commande d'installation de chaque système, « copy » chacune. La capture « avant » est `tous-les-projets` |
| `stations-une-liste`, `stations-une-liste-ouverte`, `stations-une-liste-choisir`, `stations-une-liste-vide` | « Tous les projets », les stations du chef telles qu'il les a vues (#1778) : parade-box et macbook-air-de-benoit appairées et enregistrées sous le compte — leurs deux lectures se contredisaient —, nas seulement enregistrée ; puis nas cliquée, ses cases à cocher ; puis les projets du Mac ouverts (avant : sa ligne dans la liste du compte ; après : « choose projects ») ; enfin aucune station, ni appairée ni enregistrée. Avant #1778, la section les listait deux fois ; après, une ligne par machine |
| `stations-version-inconnue` | « Tous les projets », sous la liste des stations, la version de la station de ce Mac à côté de celle de parade-box (#2191), sans statut lu : `version unknown` et pourquoi au survol |
| `stations-station-locale`, `stations-station-locale-perdue` | L'onglet Stations de `parade`, qui cuit sur ce Mac (#2489, #3195) : la carte de ce Mac, « Details » ouvert d'un clic — son clone et ses worktrees, son bac à sable (`sandbox · ordinary tickets`, `cooks at once`), sa connexion à Claude, chaque ligne avec son niveau `this machine` (plus de téléphones appairés depuis #2500), puis les réglages de sa déclaration ; puis sa connexion perdue et « log in », son bac à sable indisponible et pourquoi |
| `station-projets-du-chef`, `station-projets-recherche` | La page de nas, seulement enregistrée, quand le compte du chef atteint 36 dépôts (#1780) : ses cases ne montrent que les projets du chef — ceux de l'app et ceux que parade-box sert —, et le champ qui cherche les autres ; puis « chat » tapé : les deux dépôts qui le contiennent, un bouton « add » chacun. Avant #1780, les 36 avaient chacun leur case |

Tous en 1440 × 900, sauf ceux du téléphone, `couleurs`, ceux du sigle, ceux des humains et des tickets récurrents sous Settings. `--liste` donne la liste à jour.

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
  valeur posée, et l'`input` que la frappe déclencherait — `cooks-plafond-reglage` ; `valider: true` : le champ
  quitté, son `change` aussi, là où un réglage s'applique — `projet-sante-enregistre`), ou un glisser
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
