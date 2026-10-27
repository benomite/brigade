# scripts/capture-ecran — voir un écran de l'app sans l'ouvrir

Rend un écran de l'app dans un navigateur sans tête et l'écrit dans un PNG. La vue est celle du
dépôt (`app/src/vue/`, telle quelle) ; ce qu'elle affiche vient de **données figées**. Ni `claude`,
ni box, ni `ssh`, ni `gh`, ni réseau : un cook la lance dans son worktree, avant et après sa
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
| `nouvelle-version-mac`, `nouvelle-version-windows` | Le même, l'app installée sur un Mac puis sous Windows, quand une version plus haute est publiée (#1528) : le bandeau en tête — « Version 1.5.0 available — Download », le lien direct du .dmg ou du .exe, la ligne du premier lancement d'une app non signée, et la croix |
| `mise-a-jour-<état>-mac`, `mise-a-jour-<état>-pc` | Le même, l'app installée sur un Mac puis sur un PC sous Windows (#1156), sa mise à jour dans chacun des états `verification`, `disponible`, `telechargement`, `prete` et `erreur` : les deux postes donnent le même PNG à l'octet près (`ecrans/mise-a-jour-par-etat.ts`) |
| `reglages-code`, `reglages-code-installee` | Les réglages de `parade` (Settings, sa rubrique par défaut) : en tête, l'état du code de l'app lancée depuis le dépôt — puis la même page, l'app installée depuis le .dmg (#1011), sans aucune ligne sur son code |
| `station-hors-ligne`, `station-mise-a-jour`, `station-connexion-max` | La page d'une station en panne, ouverte d'un clic sur sa ligne : la panne en une ligne, son bouton, son explication au survol — une station par panne |
| `station-appels`, `station-appels-absents` | La page d'une station en ligne et ses appels GitHub de la dernière heure (#1418) : le total, le projet et la lecture qui en ont fait le plus — puis la même page d'un runtime qui ne les publie pas, avec un tiret neutre |
| `station-plafond`, `station-plafond-chef`, `station-retenue` | La page d'une station en ligne et son plafond de cooks (#1081) : celui que la box dérive de ses cœurs, celui que le chef a réglé et ce qu'il remplace (avec « back to the default »), puis la station saturée et ce qui retient les tickets |
| `espace-projet` | L'espace de `parade`, ouvert par sa case de la barre : le rail en colonnes (un ticket dans chacune, une décision qui t'attend, deux livrés), son second à droite |
| `espace-projet-gestes` | Le même (#1695), la fiche de #12 ouverte dans la colonne TODO : sa livraison verte attend un merge faute de grant, la décision est connue — la fiche offre « merge the PR » en premier, puis l'issue, le second et la priorité |
| `fiche-priorite`, `fiche-priorite-echec` | L'espace de `parade`, la fiche de #22 (`prio:2`, dans la file) ouverte, `1` choisi et « change the priority » cliqué (#1739) : l'app a changé le label `prio:` de l'issue sur GitHub, sans la box — la fiche le dit et montre `prio:1` ; puis GitHub refuse, la fiche garde `prio:2` et dit pourquoi en une ligne, la réponse de GitHub au survol |
| `espace-projet-ici` | L'espace de `parade` quand sa cuisine tourne sur ce Mac, sans `hote` dans le fichier des projets (#1122) : lu ici, sans `ssh`, son rail, sa file et ses cartes comme pour une box |
| `espace-projet-station-arretee` | L'espace de `parade`, cuisant sur ce Mac, la station de ce Mac arrêtée (#1124) : une seule ligne, `this computer's station is not running`, à la place du rail |
| `demenager-choix` | L'espace de `parade`, qui cuit sur sa box (#1095) : `Cooks on box`, « move the kitchen » cliqué — le choix de la machine où l'emmener (ce Mac) et son prix en une ligne |
| `demenager-sur-ce-mac` | Le même, `parade` cuisant sur ce Mac : `Cooks on this Mac`, sa cuisine qui s'arrête avec l'app, et le choix ouvert — la box, recommandée, pour l'y ramener |
| `demenager-refuse` | Le même, sur la box, le déménagement vers ce Mac refusé par le runtime (pas de bac à sable) : la raison en une phrase sous la ligne, qui dit toujours `Cooks on box` |
| `stations-avec-telephone` | « Tous les projets » avec un téléphone appairé (#1162) : sa ligne dit `does not cook` |
| `telephones-de-station`, `telephones-de-station-expire`, `telephones-de-station-injoignable`, `telephones-de-station-revoquer` | « Pair a phone with box », ouvert du bouton « pair a phone » de la ligne de la box (#1598) : un code valable, son QR dessiné par l'app et le temps qui reste ; le code expiré et « new code » ; la box injoignable, une ligne à la place du code ; « revoke » cliqué, sa confirmation et son prix |
| `demenager-choix-telephone` | Le choix du déménagement de `parade`, avec ce téléphone appairé (#1162) : il n'y est pas offert |
| `couleurs` | La palette entière (#1106) : un projet par teinte dans la barre, chacun la portant en onglet et en accent, et les couleurs de `parade` sous Settings — ses deux rangées de pastilles, « other… » pour une couleur libre, et son accent dans l'espace. En 1440 × 1040, pour que la barre tienne entière |
| `couleurs-libre` | Les mêmes réglages, l'onglet de `parade` choisi libre près du vert d'état et son accent près de l'onglet de `cantine` (#1106) : gardés, pressés au bout de leur rangée, et une ligne sous chacun dit de quoi il est proche |
| `ajout` | « Add a project », ouvert par le `+` de la barre : le formulaire, la box déclarée choisie, le calibrage proposé |
| `fiche` | La fiche de #14, ouverte par sa carte dans la colonne Taken du rail de `parade` : ce que son cook fait, son histoire et son coût, ses gestes et leur prix, l'issue et sa discussion |
| `fiche-retro`, `fiche-sans-retro` | La fiche de #9, servi, ouverte par sa carte dans la colonne Served du rail de `parade` (#1038) : sous son histoire et son coût, sa rétro — trois leçons provisoires et ce que son cook a écrit — puis la même fiche quand la box ne lui connaît aucune rétro, et la phrase qui le dit |
| `reglages-ordinaires` | Les réglages de `parade` (Settings) sur un Mac : le bloc « Ordinary tickets on this Mac », l'option posée et la limite de cooks |
| `reglages-ordinaires-sans-bac` | Les mêmes, quand la station dit son bac à sable indisponible : le message et sa raison |
| `reglages-ordinaires-pc` | Les mêmes réglages sur un PC sous Windows (#1154) : le bloc « Ordinary tickets on this PC », sans option ni limite, et la ligne qui dit pourquoi ce poste n'en prend pas |
| `demenager-sur-ce-pc` | `demenager-sur-ce-mac` sur un PC sous Windows (#1154) : `Cooks on this PC`, et le choix ouvert pour ramener la cuisine sur la box |
| `shell-ce-mac`, `shell-ce-pc` | L'espace de `parade`, un shell de ce poste montré à droite (#1154) : sur un Mac, persistant dans sa session, sous « this Mac · chef » — puis sur un PC sous Windows, le `bash` de Git, sous « this PC · chef », qui finit avec son terminal |
| `manager-eteint`, `manager-allume` | L'espace de `parade`, son manager éteint puis allumé (#906) : l'interrupteur en tête de l'espace, et la tête du rail marquée à l'arrêt quand il est éteint |
| `manager-allumer` | Le même, éteint, l'interrupteur cliqué : la confirmation, et sa phrase — ce qu'il va juger, d'après `manager backlog` (23 issues ouvertes, dont 2 `blocked-on-human`) |
| `bande-alertes` | L'espace de `parade`, sa bande d'alertes pleine (#907) : la connexion Max tombée, la base rouge, chacune en une ligne et un contrôle ; le grant `merge` éteint seul, en interrupteur à côté de celui du manager |
| `bande-alertes-ouverte` | La même, le « detail » de la connexion Max déplié et « ask the second… » de la base rouge cliqué : sa confirmation, qui dit ce que coûtera le lever |
| `merge-accorder` | La même, l'interrupteur `merge` cliqué : la confirmation d'accorder, et son prix |
| `cout` | L'onglet Cost de `parade` (#908) : les tokens lancés sur 5 h, 24 h et 7 j, tous projets confondus, la part de `parade` et de `cantine` sous chacun, 7 j « not communicated », la ligne du quota, et dessous la courbe par jour « not communicated » (#909) : la box ne donne pas ses jours |
| `cout-par-jour` | Le même onglet quand la box communique ses jours (#909) — une forme que le runtime n'écrit pas encore : sous les trois chiffres, la courbe des tokens par jour, une ligne par projet, `cantine` avec un trou le 9 |
| `ratios` | La page des ratios de tous les projets (#1682), ouverte depuis la ligne « Closer » de l'accueil : `closing --json` lu sur cinq box — `brigade` dont le rapport baisse, `parade` où il tient, `cantine` où il monte, `atelier` trop jeune (« not enough data »), et `espace`, sans closer, qui n'a pas de ligne |
| `closer`, `closer-trouvailles` | Le closer de `parade` (#990), section de son onglet Cooks sous ses gates (#1699) : les quatre chiffres de la dernière observation du closer, d'après `closing --json`, et dessous « Launch a cleanup… » (#991) — puis la même, la liste de ce qu'il a repéré dépliée |
| `closer-sans` | La même lecture quand aucun closer n'est réglé : le message, le modèle et l'effort à choisir, et le bouton qui règle le closer — inactif tant que les deux ne sont pas choisis |
| `closer-lancer` | Le closer de `parade` sur Cooks, « Launch a cleanup… » cliqué (#991) : la confirmation, d'après l'aperçu de `closing preview --json` — le prix en une ligne, ce que le closer va faire, ce que deviendrait la demande, « yes, launch it » et « no » |
| `closer-attente`, `closer-en-cours`, `closer-refusee`, `closer-finie` | La même partie, la demande de nettoyage dans chacun de ses états (#991) : en attente — trois cooks en vol pour un seuil d'un — avec « Cancel the cleanup » ; en cours, sans bouton ; la dernière refusée, et pourquoi ; la dernière finie — chacune des deux avec le bouton qui relance |
| `closer-derive` | La même partie, la dérive ayant franchi son seuil (#993) : la phrase qui propose un nettoyage et « Review the cleanup… », qui mène à la confirmation sans rien demander |
| `file-ou-cuit` | La file de `parade` quand la box sature : dans Taken, #14 cuit sur la box et #15 sur le Mac — « cooks on » sous « taken by » |
| `cooks-activite` | L'onglet Cooks de `parade` (#1272) : en tête, ses tickets servis, renvoyés et remontés au chef dans la dernière heure et le dernier jour — six nombres —, puis sa carte et ses deux stations |
| `cooks-gates`, `cooks-gates-sans-passage` | L'onglet Cooks de `parade` (#1318) : sous ses tickets, ses gates de la dernière heure et des dernières 24 h — leurs passages, la moyenne d'un passage face au budget par défaut et la tendance de l'heure, leur temps et leur processeur au total ; puis sans passage : 0, « – », 0 s, 0 s |
| `cooks-page`, `cooks-page-vide`, `cooks-page-roles-ouverts` | L'onglet Cooks de `parade` entier, dans l'ordre de sa revue (#1456) : sur un portable 1366×768, ses stations et leurs cooks d'abord (#14 `STUCK`), puis ses tickets et ses gates, et ses blocs repliés fermés ; puis sans rien à dire (tickets, gates et leçons en une ligne chacun) ; puis ses rôles ouverts d'un clic sur leur ligne |
| `file-gates`, `file-gates-sous-budget` | La file de `parade` et ses gates face à leur budget (#1318) : en tête, le dernier passage hors du budget par défaut, marqué « over budget », et la ligne qui dit que la cuisine a ouvert #31 seule, son numéro ouvrant sa fiche — puis sous un budget posé par le chef, sans marque ni ticket |
| `cooks-roles` | L'onglet Cooks de `parade` (#1274) : sous ses stations et son plafond, les rôles de sa cuisine — manager, pass, reviewer, second juge (`no action yet`), triage, closer —, chacun avec ce qu'il fait et sa dernière action datée |
| `cooks-stations-declarees`, `cooks-stations-declarees-vide` | L'onglet Cooks de `parade` (#1509) : ce que chaque station déclarée fournit — son plafond de cooks, ses capacités, et où elle tourne (`box station`, `this workstation` pour mac/claude que ce poste joue, `remote` pour pc/claude) —, dans la ligne de chacune sous « Its stations » depuis #1786 ; puis sa box ne déclarant aucune station, la ligne qui le dit |
| `cooks-toutes-les-stations` | L'onglet Cooks de `parade`, cuisant sur la box (#1786) : toutes ses stations dans « Its stations », chacune une fois — la box, sa principale, marquée, avec « move the kitchen » ; ce Mac ajouté, atteint, qui cuit #15 ; un PC ajouté, pas atteint, jamais annoncé, et pourquoi en une ligne avec « check again » —, et pour chacune ce qu'elle fournit, ses cooks à la fois et « set the cap » |
| `cooks-station-edition`, `cooks-station-retrait` | Le même onglet (#1510), « edit » cliqué sur atelier/claude, dans sa ligne de « Its stations » (#1786) : son formulaire — son plafond, ses capacités en cases, `this workstation plays it`, « Save », « Cancel » et « Remove » ; puis « Remove » cliqué, la confirmation et son prix en une ligne |
| `cooks-station-atteinte`, `cooks-station-pas-atteinte` | L'onglet Cooks de `parade`, cuisant sur la box, ce Mac ajouté à sa cuisine (#1757) : la box le dit atteint, sa pastille verte (« reached » au survol) ; puis pas atteint, sa pastille grise et pourquoi au survol |
| `cooks-station-appelee` | L'onglet Cooks de `parade` à qui manque un navigateur, « Cook it on a station that has it » cliqué sur sa carte (#1511) : le formulaire de pc/claude, la station que ce poste joue, avec `navigateur-headless` déjà coché |
| `correction` | La file de `parade` quand une cause de ratage revient (#999) : au-dessus des colonnes, la carte d'une correction proposée de son `CLAUDE.md` — ce qu'on attend du chef, la cause, ses trois tickets, le diff, son coût, « yes, open it as a PR » et « no » |
| `correction-oui`, `correction-refus` | La même, « yes » cliqué (#1741) : la réponse est postée sur le tableau de la cuisine, sans la box — la carte reste, ses réponses inactives, et une ligne le dit, le commentaire au survol — puis GitHub refuse le commentaire : la carte reste, et une ligne le dit, la réponse de GitHub au survol |
| `profil`, `profil-oui` | La file de `parade` avec un profil de cook proposé pour `app/src/vue` (#1053) : son nom, le domaine, les chiffres et ses six tickets, ce qu'il contiendrait, « yes » et « no » — puis « yes » cliqué (#1741) : posté sur le tableau de la cuisine, la carte le dit comme celle d'une correction |
| `rail-cadence`, `rail-cadence-survol` | Le rail de `parade` (#1811) : sur la ligne de « upcoming », l'histogramme des 24 dernières heures — servis en vert, ratés en rouge, une case vide par heure sans rien — et l'âge des cartes de Taken et de Pass, #14 pris depuis plus de deux fois l'ordinaire qui tranche ; puis la barre de 15:00 touchée, qui dit son heure et ses deux comptes |
| `rail-file` | La file de `parade`, quatre tickets sur le rail dans l'ordre où le runtime les sert, chacun avec sa priorité, #21 en tête qui dit pourquoi il ne part pas (#1347) |
| `todo-cartes` | La file de `parade` avec deux cartes dans TODO (#1281) : #12, une validation de design — sa question, ses captures avant et après sur la carte, un bouton par choix, le champ du texte libre et « send » — et #21, un choix de produit sans écran, sans zone de captures |
| `todo-carte-repondue` | La même, la réponse à #21 jouée par la cuisine (#1841) : le tableau relu porte la réponse `**Done**` de la box sous le geste — la carte dit `played by the kitchen`, la ligne de la box au survol, son bord éteint, ni choix ni champ |
| `todo-carte-pas-jouee` | La même, la réponse à #21 que la cuisine n'a pas jouée (#1841) : le tableau relu porte la réponse `**Not done**` de la box — la carte dit `not played by the kitchen: <raison>` en une ligne, la ligne de la box au survol, et rend ses choix et son champ |
| `todo-carte-envoyee` | La même, l'app redémarrée pendant que la réponse à #21 attend la cuisine (#1841) : rien n'a été cliqué, seul le tableau relu porte le geste sans réponse de la box — la carte le dit envoyé, en attente de la cuisine, jamais sans réponse |
| `todo-cartes-forme` | La même file, trois cartes dans la forme unique de toute carte de TODO (#1767, épique #1764) : en tête ce qui se passe, en deux phrases au plus, puis la question, un bouton par choix, le champ du texte libre et « ask the second » en retrait — et #31, une carte à un seul geste (merger à la main une livraison verte) : son seul bouton, plein, sans question |
| `fiabilite` | La fiabilité des cooks de `parade` (#987), section de son onglet Cooks sous ses tickets (#1699) : trois chiffres, les causes d'échec, et son closer sous ses gates ; aucune correction acceptée de ses consignes, la section n'en dit rien (#1001) |
| `cooks-apprentissage` | La même page quand ses cooks ont appris (#1058) : sous les causes, ses quatre leçons — deux provisoires, deux promues avec « open in the notebook » — et ses deux profils, leur domaine, leur carnet et leurs tickets. Sans `apprentissage` dans `facts`, `fiabilite` montre la phrase qui le dit |
| `projet-refuse`, `projet-refuse-confirmer`, `projet-refuse-tient`, `projet-refuse-sans-remede` | L'onglet Cooks de `parade`, que sa box refuse de servir (#1178, #1205) : le refus, sa consigne et le bouton de son remède — puis le bouton cliqué et sa confirmation, le remède joué et la phrase qui dit pourquoi le refus tient, et un refus sans remède avec la phrase qui dit pourquoi il n'y a pas de bouton |
| `rail-publie`, `rail-publie-lecture`, `rail-publie-connexion`, `rail-publie-indisponible` | L'espace de `parade` ouvert sur un PC neuf, sans box ni station ici (#1435) : Rail montre le rail que parade-box publie sur GitHub, en cinq colonnes — puis sa lecture en route, ce PC sans compte GitHub (« Sign in to GitHub »), et sans `gh` (« get the GitHub CLI », « read again ») |
| `second-outils-manquants`, `second-sans-gh`, `second-sans-dossier` | Le même espace, son second tel que le runtime le planifie (#1435) : sans `claude`, `git` ni `gh`, il ne part pas — chaque outil nommé, le bouton de sa page (« how to get … »), comment l'obtenir au survol, « try again » —, puis parti sans `gh`, ce qui manque au-dessus du terminal, puis son dossier absent, la raison en une phrase |
| `second-choix` | Le même espace, son second qui demande de choisir (#1520) : sous le terminal, ce qu'on attend du chef, puis un bouton par choix publié par son canal (`runtime/src/second-propositions/`) — sa valeur et son libellé d'une ligne —, comment répondre au survol |
| `second-geste`, `second-geste-confirmation` | Le même espace, son second qui nomme un geste (#1521) : sous le terminal, ce qu'on attend du chef, puis un bouton qui porte la commande exacte publiée par son canal, longue et entière — puis le bouton cliqué, la confirmation qui redit la commande entière, « run it » et « cancel » |
| `projet-choix`, `projet-choix-retenu` | L'espace de `parade`, à qui manquent un Postgres et Docker pour ses tests (#1400) : « 2 choices wait for you on parade », une carte par besoin, ses trois issues et ce qui suit de chacune — puis « Provide it on box » cliqué sur la carte du Postgres : elle part, celle de Docker reste |
| `projet-blocages`, `projet-blocages-details` | L'espace de `parade`, que trois blocages retiennent (#1399) : « 3 things block parade », chacun sa phrase et sa cause, le lien qui nomme la page de GitHub, le bouton « choose another station », le détail replié — puis le même, le détail du premier déplié |
| `fiabilite-recul` | La même section quand quatre corrections de ses consignes ont été acceptées (#1001) : sous les causes, chaque cause corrigée avant et après le merge — elle recule, elle ne recule pas, rien à comparer encore, pas encore mergée |
| `telephone-lancement` | Le premier écran de l'app Android installée neuve (#1161), en 412 × 915 : « Link this phone to your projects », l'adresse de la station et son code, « pair » et « scan the QR » |
| `telephone-attente`, `telephone-code-faux`, `telephone-code-expire`, `telephone-injoignable`, `telephone-appaire` | Le même, « scan the QR » cliqué — le QR remplit les deux champs et part au guichet : la station qui n'a pas encore répondu, un code faux, un code expiré, la station injoignable, puis l'appairage réussi — « Tous les projets », la station nommée en tête |
| `telephone-tailnet-injoignable`, `telephone-tailnet-sans-guichet` | Le même, le QR d'une box louée ailleurs, publiée sur le tailnet du chef (#1409) : le téléphone ne joint pas `box.tail1234.ts.net` — Tailscale éteint —, puis la box répond mais pas le guichet derrière elle ; une ligne chacun, le détail au survol |
| `telephone-file`, `telephone-file-cooks`, `telephone-file-merge` | La file de `parade` sur le téléphone appairé (#1163), en 412 × 915 : Rail — TODO en tête, puis On the rail, WAITING et Served, empilées —, Cooks — #14 cuit sur la box, #15 sur le Mac —, puis Rail, l'interrupteur `merge` touché, sa confirmation de toute la largeur |
| `telephone-gestes-merger`, `telephone-gestes-en-route`, `telephone-gestes-merge-fait`, `telephone-gestes-refus` | Les gestes de la file sur le téléphone (#1164), en 412 × 915 : la fiche de #12 — verte, sans le grant — ouverte depuis TODO, « merge the PR » touché et sa confirmation, puis le merge parti et la station pas encore revenue, gestes inactifs ; fait ; refusé par GitHub, la réponse au survol |
| `telephone-gestes-retire` | La fiche de #31, sa PR fermée sans merge, tranchée : « remove from the rail » confirmé, fait (#1164) |
| `telephone-gestes-arreter`, `telephone-gestes-arretee` | Cooks sur le téléphone (#1164) : « stop cooking » touché sur la box, ce que la station en dit ; puis la box arrêtée, « start cooking » |
| `telephone-second`, `telephone-second-tape`, `telephone-second-envoi`, `telephone-second-repond`, `telephone-second-refus` | La conversation de `parade` avec son second sur le téléphone (#1165), en 412 × 915, onglet Second : ce que le chef a demandé et ce que le second a répondu, le champ du message ; un message tapé, « send » actif ; parti, la station pas encore revenue, le champ et « send » inactifs ; arrivé, le second qui répond ; refusé, la ligne et le texte gardé |
| `telephone-projets`, `telephone-projets-file`, `telephone-projets-vide`, `telephone-projets-injoignable`, `telephone-projets-file-injoignable`, `telephone-projets-oublie` | Les projets du téléphone appairé (#1414), en 412 × 915, lus par la lecture de l'app Android (`app/android/web/lecture.ts`) jouée devant un guichet figé : « Tous les projets », une ligne par projet de la station ; la file de `parade`, les cartes du desktop ; une station sans projet, une phrase ; la station injoignable, une phrase et les projets connus dessous, puis la file de `parade` qui le dit en une ligne ; la station qui ne connaît plus ce téléphone, avec « pair again » |
| `telephone-projets-gestes`, `telephone-projets-gestes-merge`, `telephone-projets-gestes-refus`, `telephone-projets-gestes-injoignable` | Les gestes d'une carte sur le téléphone appairé (#1420), en 412 × 915 : la file de `parade` lue comme ci-dessus, la fiche de #12 et les gestes que la lecture du pont propose (« merge the PR », recommandé) ; puis le geste confirmé, joué par cette lecture devant un guichet figé — mergé, la phrase de la station ; le retrait de #31 refusé (409), sa phrase ; la station injoignable, une phrase. Le détail est au survol |
| `telephone-projets-second`, `telephone-projets-second-envoi`, `telephone-projets-second-echec`, `telephone-projets-second-injoignable`, `telephone-projets-second-sans-second` | L'onglet Second de `parade` sur le téléphone appairé (#1426), en 412 × 915, lu par la lecture de l'app Android (`app/android/web/lecture.ts`) devant un guichet figé : la conversation du second du desktop ; un message tapé et parti, le second qui répond ; le second qui a échoué en répondant, une ligne sous la conversation ; la station injoignable, puis la station qui ne tient pas ce second — une phrase chacun, le détail au survol, et « read again » |
| `telephone-second-sans-pont` | Le même onglet avec un pont qui ne porte pas la conversation — celui de l'app Android avant #1426 (#1165) : « conversation unavailable », la raison au survol, et « read again » |
| `premier-lancement`, `premier-lancement-clonage`, `premier-lancement-echec` | L'app ouverte pour la première fois sur un PC, sans projet (#1434) : les stations du chef, son Mac et parade-box, et les projets que chacune porte, un bouton chacun — puis parade cliqué, sa copie en route dite sous sa station ; puis son clone refusé, la raison du runtime, « open the page on GitHub » et « try again » |
| `premier-lancement-connexion`, `premier-lancement-code`, `premier-lancement-indisponible` | Le même écran quand le PC n'est connecté à aucun compte GitHub : la phrase et « Sign in to GitHub » ; puis le bouton cliqué, le code à taper sur la page ouverte ; puis sans `gh` sur le PC, la raison, « get the GitHub CLI » et « read again » |
| `stations-du-compte`, `stations-du-compte-ouverte`, `stations-du-compte-indisponible`, `stations-du-compte-vide` | « Tous les projets », dans la liste des stations, celles enregistrées sous le compte GitHub du chef (#1706, #1778), écrites par le lecteur du runtime (`stationDuGist`) : parade-box en ligne, le Mac arrêté, chacune avec ce qu'elle sert ; puis parade-box cliquée, les dépôts du chef en cases, ceux qu'elle sert cochés ; le Mac cliqué, la ligne qui le dit hors ligne et ses cases à cocher ; enfin aucune station, la phrase et la commande d'installation de chaque système, « copy » chacune. La capture « avant » est `tous-les-projets` |
| `stations-une-liste`, `stations-une-liste-ouverte`, `stations-une-liste-choisir`, `stations-une-liste-vide` | « Tous les projets », les stations du chef telles qu'il les a vues (#1778) : parade-box et macbook-air-de-benoit appairées et enregistrées sous le compte — leurs deux lectures se contredisaient —, nas seulement enregistrée ; puis nas cliquée, ses cases à cocher ; puis les projets du Mac ouverts (avant : sa ligne dans la liste du compte ; après : « choose projects ») ; enfin aucune station, ni appairée ni enregistrée. Avant #1778, la section les listait deux fois ; après, une ligne par machine |
| `station-projets-du-chef`, `station-projets-recherche` | La page de nas, seulement enregistrée, quand le compte du chef atteint 36 dépôts (#1780) : ses cases ne montrent que les projets du chef — ceux de l'app et ceux que parade-box sert —, et le champ qui cherche les autres ; puis « chat » tapé : les deux dépôts qui le contiennent, un bouton « add » chacun. Avant #1780, les 36 avaient chacun leur case |
| `rejoint-station`, `refuse-station`, `rejoint-projet`, `refuse-projet` | Le Mac ajouté depuis l'accueil à « parade », que la box sert déjà (#1790) : sur la page du Mac, sa case dit la cuisine qu'il a rejointe, ou « refused » et la phrase du runtime dessous ; sur l'onglet Cooks de parade, rejoint, il est sous « Its stations » et en tête comme seconde station, la box principale ; refusé, les stations restent la box seule, et la phrase du refus est sous la ligne. Les communs sont dans `rejoindre-commun.ts` |
| `telephone-relance` | L'app Android relancée, le téléphone déjà appairé : « Tous les projets », sans écran d'appairage |
| `telephone-nouvelle-version` | Le même, quand une version plus haute est publiée (#1528), en 412 × 915 : le bandeau en tête et son lien Download vers l'.apk, sans ligne de premier lancement |

Tous en 1440 × 900, sauf ceux du téléphone et `couleurs`. `--liste` donne la liste à jour.

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
des doublures de `claude`, `ssh` et `gh` en tête du PATH qui ne sont jamais lancées ; chaque écran se
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
  montre ce que la vue pose en l'attendant (`telephone-attente`).
- **`envois`** : ce que le process principal pousse à la vue. `cuisine(RENDUS)` les rend pour la
  cuisine figée ; ajoutes-y un envoi (`{ sur: "surSortie", args: [id, texte] }` écrit dans un
  terminal, voir `espace-projet.ts`). `demande` sur un envoi : son premier argument reçoit le numéro
  de la dernière demande de cette lecture, que la vue compare au sien.
- **D'autres données de box** : un autre état du rail, une box qui ne répond pas… s'écrivent comme
  la box les rendrait, dans `cuisine-figee.ts` ou à côté, et passent par `cuisine()`.
- **`etapes`** : après chacune, la page se pose avant la suivante. Une étape est un clic
  (`{ cliquer: <sélecteur> }`), un texte tapé dans un champ (`{ saisir: <sélecteur>, texte }` : sa
  valeur posée, et l'`input` que la frappe déclencherait — `telephone-second-tape`), ou un glisser
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
