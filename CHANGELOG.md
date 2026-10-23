# Changelog

Brigade V2 is released as tagged versions (`app-v1.0.0` and following). Each new V2 release adds a section here, above the previous one, in the style of [Keep a Changelog](https://keepachangelog.com): the date of its tag and its merged pull requests, as Added / Changed / Fixed. What is merged since the last tag stays under Unreleased. The history of V1 is kept at the bottom, below its own separator.

## [Unreleased]

### Changed

- The second's choices and gesture buttons, played on the Windows path (#1614)

### Fixed

- Declare the report command in the commands table and its walkthrough (#1610)

## [app-v1.0.8] — 2026-10-23

### Added

- The gesture the second names is a confirm-then-run button under its terminal (#1613)
- A gates budget ticket opens at prio:1, and only one still on the rail holds the next; the queue says when none is (#1612)

## [app-v1.0.7] — 2026-10-23

### Added

- Mention the chef once on the Kitchen board when a decision starts waiting (#1606)

### Changed

- Brigade : récolte — ce que le cook avait laissé non commité dans son worktree (#1609)
- A red station update names its cause — the update's and the station's output in the assertion (#1605)

## [app-v1.0.6] — 2026-10-23

### Added

- Send chef decisions from the apps as board comments and track them (#1608)

## [app-v1.0.5] — 2026-10-23

### Added

- Count the board refresh calls under 'board' and show their hourly cost in status (#1604)

### Fixed

- Give each line of the board's queue a button, its page on GitHub (#1607)
- End-to-end cooking test no longer races the worktree cleanup (#1603)

## [app-v1.0.4] — 2026-10-23

### Added

- Read a project's Kitchen board from GitHub in the apps (#1602)
- Publish and refresh a pinned Kitchen board issue in the project's repository (#1601)
- Render the Kitchen board body from the runtime's status data (#1594)

## [app-v1.0.3] — 2026-10-23

### Added

- The autonomy table of a project, as a view component (#1593)
- Route each decision by its autonomy position — applied alone, applied and written for the daily report, or put to the chef as a card with its choices (#1592)

## [app-v1.0.2] — 2026-10-23

### Added

- The second's choices as clickable buttons under its terminal (#1591)
- A structured channel for the second to publish choices and gestures to the app (#1579)

### Fixed

- The autonomy tests close their logs before their directory is removed — Windows refuses to delete an open file (#1578)

## [app-v1.0.1] — 2026-10-23

### Added

- The second's hard limits are refused by a PreToolUse hook: no PR merge, no reading of the chef's secrets (#1576)
- Publish unsigned Mac, Windows and Android packages when no signing secret is set (#1571)
- 'Cook it on a station that has it' opens the station form with the missing capability checked (#1558)
- A palette of 16 project colors, pairwise ΔE2000 ≥ 15 and ≥ 15 from the state colors, and a free color the app warns about when it is near a state color or another project's (#1530)
- The Cooks tab shows what each declared station provides — its cap, its capabilities, and whether it is a box station, this workstation or remote (#1529)
- Read, set, remove and mark remote one station of a project; app.json gains the station this workstation plays (#1524)
- The Second tab launches claude with the second's role as system prompt, from text shipped in the app (#1523)
- The pass escalates a base instability when the same unrelated test is red again after the rerun (#1508)
- The paired phone writes to a project's second and reads its answer in the Second tab (#1494)
- The paired phone lists every project of its station and shows each project's queue (#1491)
- The phone desk reads each project's second conversation and sends it the chef's messages (#1489)
- The Android app pairs with a station through the chef's tailnet, and says in one sentence what it cannot reach (#1488)
- A paired phone merges, removes from the rail and sends back to the kitchen through the phone desk (#1487)
- A paired phone reaches a station's phone desk from any network, through the chef's tailnet (#1484)
- The rail shows running cooks against the cap, and why each waiting ticket does not start (#1481)
- The add-station form asks only about the station, prefilled from the first render (#1478)
- Status gives the queue in service order and why its top ticket does not leave (#1476)
- Station defaults from the machine, and adding a station resolves the repository and branch from the project's clone (#1472)
- The second checks claude, gh, git and ssh, names each missing one with how to get it, and starts on Windows (#1471)
- The Rail tab is the kanban plus one alert line when gates over budget (or the station) hold tickets back (#1470)
- Gates budget and triage day by day on the Cooks tab, with anchors, one-line states and folded triage (#1469)
- Opening a project with no local copy clones it into an app-managed folder, or says why it cannot (#1465)
- Stations play only the tests close to a change; the touched suite runs on GitHub Actions (#1463)
- Sign and notarize the app builds, and report a missing secret in one sentence (#1460)

### Changed

- The app's needs cards show the fourth option the runtime now publishes (#1572)
- Contribution guide and issue templates (#1574)
- The station form on the Cooks tab, and its captures (#1537)
- Document the three settings levels (#1505)
- Two tests stop racing the clock — the red-gates return in pass.test.ts and the hour of ticks on Windows (#1501)
- Brigade : récolte — ce que le cook avait laissé non commité dans son worktree (#1503)
- The phone's gesture test types the bridge's promise as the fake view expects it (#1493)
- The local-kitchen sandbox profile of the cook carries its ticket file's Read rule (#1490)
- Close what the phone-desk tests open before their directories go, for Windows (#1485)
- Brigade : récolte — ce que le cook avait laissé non commité dans son worktree (#1483)
- Two tickets exclude each other only when their zones overlap, by path segment (#1477)
- A pending bridge answer is typed as the answer the view awaits (#1468)
- Cooks tab order, folded and one-line blocks; before/after captures (#1466)
- The killed gates' suite in verrou-des-gates no longer polls forever after its test (#1464)
- Brigade : récolte — ce que le cook avait laissé non commité dans son worktree (#1459)
- Review of each block of the Cooks tab, with question and verdict (#1461)

### Fixed

- The by-hand hook tests use a sh stand-in for ssh and skip on Windows (#1570)
- The setup card stays when its output also says something else is missing — the need choices do not explain the whole failure (#1569)
- The needs probe launches its commands through sans-invite, like every process of runtime/src (#1557)
- The status-bottom fixture carries its escalation's retenues (#1517)
- The sandbox refuses a test or lint command whose outside path is glued to an option (#1500)
- The ordinary-ticket sandbox test expects the refusal instruction the profile now appends; the session-resume tests set each kitchen green on its own return (#1504)
- The hook allows reads and verifications only on paths inside the worktree: no absolute or ~ path, in a word or an =value (#1492)
- The runtime doc cites the `setting` commands in the form the app's tests read (#1480)
- The lifted card keeps its "bon" class and the skin's colour rule, so the app suite is green again (#1486)
- A missing tool of the second is a button, never a command to copy (#1475)
- Close the manual-order tests' log before their directory goes, as Windows requires (#1474)
- The project's runtime answers a setting change with its real pass, repository and GitHub (#1473)
- A merged card that has left the rail is refused as already merged, not as never through the pass (#1467)
- Gates select far fewer tests: no helper product imports, no type imports, exact folder citations (#1462)
- The kitchen opens alone the hosts the setup reaches, through the door's journal, without writing the network list (#1437)

## [app-v1.0.0] — 2026-10-22

### Added

- Publish an app-v<version> release on every merge on v2 that changes the app (#1447)
- The station's repeated GitHub reads go out conditionally, and a 304 costs nothing (#1450)
- The project page shows the time from adding the project to its first served ticket (#1446)
- Script deciding whether a merge changes the app and computing the next app version (#1445)
- What the station lacks for a project, as one card per need on its page (#1443)
- What the station lacks for a project, as one choice per need (#1439)
- A failing project setup raises a blocker, lifted when it passes again (#1431)
- Repair a clone that git sends over ssh, and register the real cause as a blocker (#1430)
- The preparation ticket asks for a setup that needs no hand-copied file nor missing service (#1403)
- A script moves the box's project settings into each repository, one PR per project (#1389)
- The box and the station read the project's settings from its repository (#1386)
- Stop a cook on Windows and every process it started (#1379)
- Les tests lents de bout en bout ne tournent que sur la base (#1375)
- Cooks shows the gates' average run over the last hour and the last 24 h, against the budget, with the trend (#1371)
- Open a ticket on the project when its gates go over their budget, one at a time (#1363)
- The Cooks tab lists the kitchen roles, each with what it does and its latest action (#1360)
- A registry of the tests the chef refused to remove — idempotent, kept in refused-tests.json in the state directory (#1355)
- The lessons and the cook profiles are on the Cooks tab, no longer on Reliability (#1358)
- The Cooks tab shows the project's tickets served, sent back and escalated, for the last hour and the last day (#1356)
- The project settings live in `.claude/brigade/projet.json` — a reader and a writer from a project clone (#1349)
- Two stations on the Cooks tab, each with its own line (#1343)
- Show the daily triage counts, decided alone and sent to TODO, at the head of the rail (#1329)
- Count per day the decisions the triage took alone and the cards it sent to TODO (#1326)
- Only a product choice or a design validation enters TODO, with one question and its choices, and one call settles it (#1325)
- The Cooks tab's station line shows the project's parallel cook cap, sets it, restores the default, and says what saturates (#1298)
- The Cooks tab's "+ station" is covered by a view test, and the box is re-read as soon as the request is written so the new station's block appears without reloading (#1300)
- The Cooks tab shows one block per station, with its state, its start/stop button and the kanban cards of its tickets in progress (#1299)
- The add-station form and the project page say 'station', not 'backup machine', and show every field the app cannot know (#1297)
- A station added to a project reads its repository, integration branch and cook cap from the first station; a value it does not say is named, field by field (#1295)
- The calibration ceiling is a project decision, opus / high by default, set from the Cooks tab (#1293)
- The triage agent and its two evals — decides alone or sends the card to TODO with one question and its choices (#1291)
- The whole kanban is back on Rail, Taken and Pass included; Cooks shows no kanban column (#1276)
- A station on Windows reports itself as a Windows station — platform label factored and asserted for win32, darwin and linux in a test that runs on Windows (#1266)
- A Windows CI job for the runtime test suite — platform skips state their reason, the 169 test files that fail on Windows are listed as pending Windows port (#1264)
- Publish the Windows installer from CI — built on a Windows runner, signed, its signature checked, attached with latest.yml to the app-v release (#1262)
- Talk to a project's second from the phone — the Second tab holds the conversation, as messages, with a field and "send" (#1261)
- The queue's gestures on the phone — a sheet says what the station did, waits for its answer, and says a failure in one line (#1260)
- A project's queue reads on a phone — Rail's columns stacked, TODO first, and nothing scrolls sideways (#1259)
- A paired phone is listed with the other stations, with a 'does not cook' mention, and never offered to run a project's cooks (#1258)
- The Android app opens on a pairing screen (#1257)
- Pair a phone without a terminal — a short-lived single-use code, a phone desk on the station, and a token that opens the stations listing (#1254)
- A Windows installer for the app (#1252)
- A phone is a station that does not cook — listed with `cuisine: false`, never a candidate to run a project's cooks (#1251)
- The Android app shows an update prompt at launch when a newer version is offered — version, notes, Update and Not now (#1246)
- A common-tier lesson expires like a promoted one and the chef retires it with commun-cli retire; neither is proposed again (#1239)
- Each lesson on the project page says where it comes from — retro, pass send-back or chef correction, with its ticket (#1237)
- Le cook design est un profil de la zone app/src/vue, listé comme les autres (#1235)
- The Android build updates in place — release signing from env, rising version code, install permission, file provider, and a check script (#1233)
- Launch-time update check of the Android app against a published release manifest (#1229)
- A project setting, BRIGADE_SENDBACK_PROMOTION_GAP, promotes send-back and correction lessons sooner (default 1, never below one confirmation) (#1227)
- Captures of the sheet with and without a retro, its two screens, and the living doc; the empty state no longer says a served ticket is not served (#1225)
- Un remède pour chaque refus dont le geste est précis — port, ligne à la main, ligne de l'app, clone, claude — et pourquoi il n'y a pas de bouton pour les autres (#1220)
- Chaque refus de la station porte son remède (#1212)
- La cuisine d'un projet se lance et s'arrête station par station, d'ici ou distante (#1210)
- Après un renommage du code mergé, la cuisine reprend seule et porte les livraisons retenues sur le nouvel arbre (#1206)
- Scripts/check-glossary-rename.sh liste les termes du glossaire restés hors du tableau des exceptions, une ligne OK sinon (#1201)
- Le renommage du code joué dans la pause, sur la dernière tête de v2, jugé par les gates et la pass, abandonné passé 55 min, la pause levée seule en disant pourquoi (#1200)
- La pause du renommage du code demande l'accord du chef par une carte de la file, puis retient tout autre merge et tout cook neuf jusqu'à sa fin (#1199)
- Chaque cook lancé sur un ticket reçoit les leçons provisoires de son projet — les plus récentes, au plus un plafond du projet — et son lancement dit lesquelles (#1197)
- Captures avant et après du progrès sur la page Reliability, et l'écran figé qui porte ses chiffres (#1195)
- La station publie dans le suivi de ses projets pourquoi elle en refuse un — statut, code stable, phrase pour le chef, action suggérée (#1196)
- La page Reliability du projet montre ce que les cooks ont appris — leçons, profils, lien vers le carnet, et une phrase quand il n'y a rien (#1194)
- La page d'un projet en deux onglets, Rail et Cooks, le second toujours à droite (#1190)
- Un worktree impossible à préparer est publié au projet, avec sa raison et son prochain essai, et la station repart seule une fois l'accès réparé (#1189)
- Avant de servir un projet, la station vérifie qu'elle peut récupérer son dépôt et y pousser, et publie l'accès bloqué avec son geste (#1187)
- L'enveloppe Android de l'app, son APK en une commande, et sa doc (#1174)
- Le second accueille un projet neuf et dit ce qu'il peut faire (#1149)
- Le carnet des leçons livré par une PR qui passe par la pass, et le retrait d'une leçon par revert (#1148)
- L'état d'onboarding d'un projet neuf — quatre étapes, la courante, le geste attendu, le ticket de préparation — publié dans le suivi de la station (#1146)
- La livraison du premier coup et les essais moyens, avant et après l'entrée de chaque leçon et profil (#1147)
- Promotion, rétrogradation, suppression et retrait des leçons, décidés de leur histoire (#1145)
- Les leçons et les profils d'un projet, lus pour l'app par facts (#1144)
- Une livraison qui touche à ses juges, établie non affaiblie par le second juge, est mergée sous grant ; sinon, une carte gesture (#1143)
- Une livraison qui touche à ses juges passe devant un second juge, indépendant du reviewer et plus fort que lui (#1142)
- La page d'un projet qui cuit sur cet ordinateur dit en une ligne que la station de cet ordinateur ne tourne pas (#1139)
- Un rouge remonté par le manager porte une carte product ou gesture, jamais une autre ; sans choix ni geste, remontée sans carte (#1138)
- Un ticket qui demande une capacité qu'aucune station ne fournit est renvoyé en réécriture avant TODO ; carte gesture seulement si c'est impossible (#1136)
- Status compte les cartes entrées dans TODO sur une période, par type — product, design, gesture ; une carte refusée ne compte nulle part (#1134)
- Le manager tranche seul les questions de découpage qui ne sont pas un choix de produit et le dit sur l'issue ; il ne demande au chef qu'un choix entre des voies (#1135)
- La page d'un projet dit où il cuit — « Cooks on this Mac » ou « Cooks on parade-box » — et déménage sa cuisine d'un geste, refus dit en une phrase (#1133)
- Une carte n'entre dans TODO que typée (#1132)
- Un projet qui cuit sur cet ordinateur se lit ici, sans ssh ni hote — rail, file, cartes, cooks et alertes (#1131)
- La cuisine d'un projet déménage d'une station à une autre (#1130)
- Le second passe seul en WAITING les cartes de TODO qui attendent un tiers nommé, dit en une ligne par carte ce qu'il a déplacé, et se tait quand il doute (#1129)
- Captures avant/après de la page d'une station — plafond par défaut, réglé par le chef, retenue ; le champ du plafond montre son libellé en entier (#1126)
- Le choix de la cuisine d'un projet dit ce que le chef fait, propose la machine toujours allumée, et arrive rempli — `Start the kitchen on <station>` (#1121)
- La garde de la mémoire dérive son seuil de la mémoire totale de la machine, et `status` nomme chaque ressource en cause (#1109)
- Le plafond de cooks d'une station dérive des cœurs de sa machine — `3 at most — 8 cores` —, le chef le règle et le retire par `cooks auto` (#1105)
- Station injoignable, la page du projet le dit une fois, avec quoi faire (#1091)
- La page Reliability montre si la cause corrigée recule — avant et après le merge, côte à côte (#1076)
- Chaque ticket servi a sa rétro, et laisse au plus 3 leçons provisoires à son projet (#1072)
- La version qui tourne est dite sur l'accueil, et une mise à jour disponible s'installe maintenant ou plus tard (#1071)
- Chaque leçon a un id stable, la rétro reconfirme ou propose par id (#1064)
- Un domaine relevé devient un profil proposé, tranché par « oui » ou « non » (#1070)
- Relever les domaines qui méritent un profil de cook sur les 20 derniers tickets servis (#1069)
- Seuils de promotion et d'expiration des leçons, lisibles et réglables par projet (#1067)
- Une correction mergée recule-t-elle sa cause ? la part des tickets ratés pour elle avant le merge, et après (#1068)
- Le carnet des leçons versionné — format, lecture et écriture déterministes (#1063)
- Le « oui » ou le « non » du chef sur une correction proposée — « oui » en fait une PR qui passe par la pass, « non » la retire jusqu'à des échecs neufs (#1060)
- .dmg signé Developer ID, notarisé et agrafé, publié par un workflow sur tag app-v* (#1030)
- Le bilan de la dernière passe finie dans la partie closer — ce qu'elle a retiré et sa PR ouverte, en lien (#1027)
- La correction proposée d'une cause qui revient — un diff des seules consignes du projet, jugé par une garde de portée, avec son coût, et portée par `facts` (#1019)
- `closing --json` — la fermeture lue par l'app : observation, trouvailles, demande, bilan, dérive (#1017)
- L'app voit ce que coûte une passe de fermeture, la demande sur le « oui » du chef, et la retire (#1016)
- Le détecteur des causes qui reviennent — une cause qui fait rater au moins N tickets récents devient une candidate à une correction, posée au journal (#1009)
- La fiabilité des cooks sous Paramètres → Reliability, et « drifting » sur l'accueil (#1002)
- Une station qui ne fait la cuisine d'aucun projet dit « runs no kitchen », pas « no project » (#984)
- La question se lit sur sa carte, et la carte quitte TODO dès que la réponse est partie (#965)
- Les sorties, refus et erreurs de `station` en anglais (#960)
- Les sorties de `guardrails`, `arbiter` et `base` en anglais (#959)
- `manager` écrit en anglais, et l'app lit l'anglais comme l'ancien français (#961)
- La file signale une dérive de la part de tickets livrés du premier coup (#957)
- `measures` mesure les renvois des N derniers tickets servis (#955)
- L'app lit le bas de `status` sous ses deux formes, française et anglaise (#941)
- Les messages de `servir` et de `service` passent en anglais, sans mélange (#938)
- Captures avant/après des écrans qui lisent le haut de `status` (#937)
- Le bloc `attend` de `status` passe en anglais — `awaiting` … `end awaiting`, et ses lignes (#936)
- Le second, l'app et l'eval lisent le bord awaiting … end awaiting autant que attend … fin attend (#935)
- L'onglet Cost liste les cinq tickets les plus chers — numéro, titre, tokens, essais — chacun ouvre sa fiche (#920)
- Sous les trois chiffres de Cost, la courbe des tokens par jour, une ligne par projet (#919)
- L'onglet Cost s'ouvre sur trois chiffres (#918)
- La carte du rail dit en deux lignes ce qui se passe, le détail va dans sa fiche (#916)
- Une épique dont tous les tickets sont servis se ferme d'elle-même, et « upcoming » nomme le ticket qui manque aux autres (#914)
- La fiche d'une livraison qui attend son merge s'explique en deux lignes, et liste les fichiers des juges qu'elle change (#904)
- La file et la bande d'alertes de l'app disent en une ligne « GitHub limite les appels, reprise vers HH:MM » (#902)
- Écrans de capture de la page station en panne, et captures avant/après des trois pannes (#901)
- La page d'une station liste tous ses projets, dont ceux écrits à la main — marque main/secondary, un clic l'ouvre, « + add a project » (#900)
- Mac fermé ou en veille — son ticket revient au rail, ce qu'il a poussé est conservé, et le cook suivant en repart (#899)
- La relecture ne bloque que sur la zone d'écran que le ticket change, le défaut préexistant devient une remarque (#897)
- La file dit pourquoi un ticket dépasse le seuil de dérive en tokens (#896)
- Un renvoi reprend la session du cook précédent au lieu de repartir de zéro (#893)
- La page d'une station dit en tête son état en une phrase (#889)
- Un limiteur d'appels GitHub tient 2 500 appels/heure pour la station et ses projets, et le compte est journalisé (#882)
- Module de bac à sable pour les cooks du Mac — détection et configuration (#881)
- Cost, Verify et Settings — gestes en boutons, explications et commandes au survol, lectures en échec en une ligne (#866)
- Le mode auto du runtime ne prépare plus que le second (#864)
- Le manager reconnaît un ticket d'interface et le désigne pour le cook design (#859)
- Outil de capture d'un écran de l'app, en local, sans claude ni box (#857)
- Fiche d'une carte — l'attendu en tête, gestes en boutons, plus de texte brut ni d'erreur technique (#856)
- Briques d'interface communes — survol explicatif, lecture indisponible, bouton recommandé avec prix, confirmation avec prix (#836)
- La file annonce trente jours à l'avance l'échéance du jeton longue durée, avec le seul geste à faire (#828)
- L'installation guidée fait la connexion Max une fois par `claude setup-token`, et la doc dit comment révoquer (#822)
- Le jeton longue durée est protégé — non écrivable par un cook, masqué dans le journal, les comptes-rendus, GitHub, les gates et la sortie du runtime (#821)
- La station du paquet tient la porte réseau de chaque projet — sa liste seulement, chacun la sienne, reprise à la bascule (#820)
- Le runtime lit le jeton longue durée dans BRIGADE_CLAUDE_TOKEN_FILE et le passe aux `claude` qu'il lance (#819)
- « Vérifier » dans Paramètres et dans les alertes dit le même verdict que l'écran Verify (#810)
- Premier ticket de la cuisine — préparer le dépôt, et le rail l'attend (#808)
- Ajouter un projet depuis l'app, sans terminal, avec sa station principale (#805)
- Mise à jour automatique de la station, gel de version et retour arrière (#806)
- L'app d'un ordinateur est une station ; le téléphone est un poste (#804)
- Connexion Max à l'installation, renouvellement seul, un login si elle se perd (#803)
- Appairage d'une station à l'app par un code, et sa présence sur la home (#802)
- Paquet Debian de la station et guide d'installation en une commande (#801)
- Une seule station par machine, qui sert tous les projets de sa configuration (#800)
- La fiche de toute carte montre l'issue et sa discussion, le markdown rendu, et y poste un commentaire au clic (#784)
- Enrôlement d'un serveur par une commande et un code — la machine entre « en attente », jamais acceptée d'office (#783)
- L'écran « Vérifier » dit son verdict en une phrase, chaque manque avec qui agit, et replie la sortie brute (#782)
- Registre global des stations du chef — une machine qui se présente attend, seule l'acceptation la rend utilisable (#781)
- `pass -- <ticket> ask [<texte>]` compose la demande au second — l'issue (numéro, titre) et le contexte saisi (#780)
- `pass -- <ticket> issue | comment <texte>` expose l'issue d'une carte à l'app (#779)
- « Vérifier » rend un verdict structuré — prêt, pas prêt (manques), ou vérification plantée (#778)
- Le runtime retire un ticket du rail et change sa priorité (#774)
- La fiche montre l'histoire, le coût, l'activité du cook et ce qui bloque (#773)
- L'histoire et le coût d'un ticket se lisent par `pass -- <ticket> --json` (#772)
- La bande d'alertes signale les échecs répétés du renouvellement avant l'échéance de la session (#771)
- La mise en service active le minuteur de renouvellement et vérifie que le service trouve claude (#769)
- « Vérifier » et installation affichent l'état du renouvellement en une ligne (#768)
- La carte montre l'écran à regarder, la phrase du cook, la mention « déduit », et n'offre le bouton que s'il y a une page à voir (#767)
- Un projet servi a son cache où écrire — pnpm, npm, jest marchent sans réglage, le compte reste en lecture seule (#765)
- Pour une app Electron, pas de page — la livraison dit comment voir son écran (#763)
- Machine injoignable — le terminal le dit et se reconnecte seul (#745)
- Un disjoncteur ouvert entre dans la file du chef, avec ses échecs et le geste qui le referme (#744)
- Bandeau en tête de chaque shell — machine, compte, couleur du projet (#741)
- « + shell » demande sur quelle machine ouvrir, et les shells persistants reviennent à la réouverture de l'app (#740)
- La couche des shells persistants — tmux, ou screen à défaut, sur le poste, la box ou une station (#735)
- La fiche d'un ticket s'ouvre en popup par-dessus le rail, fermable par Échap, clic extérieur ou bouton ; plus de ligne PR sans PR (#736)
- Les cooks déclarent l'écran changé et la phrase « à regarder » dans leur PR (#733)
- Une carte revenue de WAITING dit pourquoi — le runtime rend le motif de ticket.resumed dans faits (revenu), l'app l'affiche tel quel (#734)
- Le runtime lit l'écran à regarder d'une livraison — déclaré dans la PR, sinon déduit du diff (#722)
- Je vois ce qui n'est pas encore sur le rail — un nombre à côté du rail, la liste par ce qui arrive aux issues, et un rail vide qui le dit (#724)
- L'app notifie le système de l'urgence, le clic ouvre la décision, la notification attend à la réouverture (#698)
- Le runtime émet l'alerte d'urgence une fois, un rappel espacé de 2 h, et la conserve au journal (#694)
- Une question du manager s'ouvre sur la fiche telle qu'écrite sur l'issue, sans LLM — choix en boutons, champ libre, réponse postée par le gh du chef (#693)
- Un projet installé qui perd une station ou un geste de box le dit en bande et sur sa case, avec son geste (#692)
- Le runtime détecte qu'une attente du chef retient toute la cuisine et l'expose (#691)
- Le second met un ticket en attente sur demande du chef (#690)
- État WAITING d'un ticket (#664)
- Un ticket mis de côté est rangé dans sa colonne avec sa raison en clair (rail[].attente de faits), jamais hors colonne ni en ligne brute (#663)
- Le setup du projet bloqué se dit dans la bande d'alertes et sur la pastille de sa case (#661)
- Un projet bloqué sur son setup entre dans la file du chef — une entrée `setup`, sa cause en clair et son geste, qui sort seule au déblocage (#660)
- Un setup qui échoue deux fois de suite à l'identique bloque le projet, plus le ticket (#659)
- Ligne « rien ne cuit : base rouge depuis <durée>, réparation #N en cours » en tête de status et sur la carte de l'app (#658)
- Base rouge dont la réparation a échoué — une ligne `base` dans le bloc attend, qui en sort au retour au vert (#657)
- Base rouge — rejeu automatique, puis ticket de réparation prioritaire lancé sans geste du chef (#656)
- La mise à jour se fait projet par projet — un projet qui travaille ne retient pas celle d'un autre (#651)
- Cliquer une carte ouvre sa fiche par-dessus le rail, avec l'en-tête du ticket (#650)
- La box se met à jour seule quand v2 avance, garde la version qui démarre, revient sinon, sans réessayer une version ratée (#642)
- « ask the second » demande une réponse courte en quatre éléments — ce qui se passe, la question, sa recommandation, l'offre du détail (#634)
- Le runtime en service reprend les cooks en vol de l'ancienne version (#627)
- Le haut du rail rendu au rail — provenance et « stop the kitchen » rangés dans Paramètres, fraîcheur dite seulement quand la lecture est vieille (#625)
- L'app passe à la nouvelle version d'elle-même — à sa prochaine ouverture, ou tout de suite d'un clic (#624)
- Le format des nombres et des heures est à l'anglaise (en-US), centralisé dans app/src/format.ts (#601)
- L'installation guidée dans l'app — toutes les étapes d'emblée, reprise, un bouton ou une réponse par geste (#597)
- Un projet installé par brigade est prêt pour le mode auto pour les gestes prévus par les rôles (#595)
- Les projets se rangent en glissant leur case dans la barre — un trait dit où elle atterrit, l'ordre est écrit dans le fichier des projets (#594)
- Les décisions restantes se présentent une par une — la courante avec sa question, ses options et l'effet de la réponse, et combien restent (#580)
- L'étape « décisions » se fait depuis l'app — chaque décision posable expliquée, posée au journal sans sudo ni drop-in (#579)
- L'étape « protection » se fait depuis l'app — la branche d'intégration protégée par une action, sans rien recopier (#578)
- L'étape « stations » se fait depuis l'app — proposées, choisies, déclarées au journal, sans sudo ni drop-in (#577)
- Une carte de Livré dit ce qui a été livré — le résumé de la relecture, mot pour mot (#576)
- La carte d'un ticket au travail ou en pass dit ce que la cuisine en fait en ce moment (#573)
- La pastille « ! » / « ? » d'un projet se lit en clair et ouvre son espace, bande d'alertes en tête, la plus grave d'abord (#569)
- Les étapes de l'installation, connues d'avance et reprenables (#568)
- La colonne Livré garde 24 h ce que la cuisine a servi, issue fermée ou non (#559)
- Les rôles listent leurs gestes prévus et expliquent tout refus du mode auto en une phrase (#558)
- Chaque projet a sa couleur d'onglet et sa couleur d'accent, tirées à l'ajout, modifiables (#555)
- Plus de zone du bas — les shells à droite à côté du second, les onglets en haut, leurs pages par-dessus le rail (#541)
- La demande de passe de fermeture attend sa condition au lieu de refuser (#530)
- Le calibrage du closer et ses trois plafonds se posent par le geste du chef (#522)
- L'alerte d'un projet non affiché sur sa case de la barre, et elle mène à « Tous les projets » (#521)
- La bascule dit, avant l'essai, la décision obligatoire que le projet n'a pas, et le geste qui la pose (#517)
- La bande d'alertes — vide quand tout va bien, chaque ligne avec son geste et son prix, et l'inconnu est dit (#516)
- Un processus hors cloison renouvelle la session Max et n'écrit que son fichier d'état (#514)
- Les décisions du chef ont un support hors dépôt et hors drop-in, relu à chaud par le runtime (#513)
- Le second passe à droite, en permanence, et n'est plus un onglet (#512)
- Le test de bout en bout de l'installateur pose aussi le geste de mise en service (#511)
- Le rail devient la vue principale, au centre, et ses cartes portent ce que la file dit (#500)
- Un geste direct part vraiment dans le second, et dit quand il ne peut pas (#499)
- L'app montre la version en attente et offre le geste de mise en service, avec l'avertissement des cooks en vol (#489)
- Un échec de mise en service se lit dans la file, avec la cause (#488)
- Le geste de mise en service côté runtime (#487)
- La file du projet dit qu'une version attend (#486)
- Le geste de mise en service de la box (#485)
- Le bilan d'une passe (#484)
- La fenêtre se réduit sans rien casser (#482)
- Les états se lisent sans lire (#481)
- La langue visuelle de la maquette (#480)
- Un déclencheur franchi se lève et se lit — `run mesures` propose la fermeture, avec le compteur franchi et son seuil, sans lancer aucune passe (#469)
- La fermeture qui observe (#468)
- Côté app, le poste joue les stations que le projet lui confie (#467)
- Côté box, une station déclarée `distante` tire son travail (#462)
- Un ticket demande une capacité (ligne `requiert` de sa fiche) (#461)
- Au geste « allumer », l'app dit ce qu'il engage (#458)
- L'app dit quand son propre code est en retard sur l'origine de son clone (#457)
- Cliquer une carte de T'attend écrit la demande dans le second, qui explique et répond (#454)
- Gestes reprendre / arrêter la cuisine et vérifier l'installation, à côté de l'état que status relaie — écrits dans un shell, sans confirmation (#453)
- L'état des grants se lit dans l'app, par projet — au-dessus du texte de l'onglet Grants, avec ses gestes accorder / révoquer écrits dans un shell (#451)
- L'état du manager se lit dans l'app, par projet — un onglet Manager, et ses gestes allumer / éteindre écrits dans un shell (#450)
- Le relevé liste les tickets payés plusieurs fois et sépare le cher du perdu — tokens utiles et perdus par ticket, d'après la fin de chaque cook (#447)
- Le socle des gestes — sept commandes de « Piloter », écrites dans un shell de l'espace par `ecrit`, jamais envoyées (#445)
- Le relevé dit les tokens d'un ticket — médiane par calibrage et le plus cher de la tranche, à côté des tours (#444)
- Ce qui attend un ticket gelé (#436)
- Depuis l'app, un geste ouvre la page d'un worktree servi dans le navigateur du poste (#435)
- Installation contrôle le réglage du geste d'installation (#433)
- L'écran d'ajout propose le calibrage et la destination des sauvegardes au lieu de les demander, avec leur provenance (#426)
- /brigade:init écrit .claude/brigade/reseau (#424)
- Retirer un projet de l'app et le désinstaller de sa box sont deux gestes (#418)
- Après l'ajout, la mise en service se suit dans l'espace du projet (#415)
- Brigade-installer uninstall (#412)
- Les box se déclarent une fois dans l'app, et ajouter un projet l'installe sur la box choisie — un écran, aucune commande collée, aucun port saisi (#411)
- L'ajout d'un projet dit la forme du nom à la saisie et lit la box avec ce nom — avertissement, jamais refus (#391)
- Le label hors-cuisine dit qu'un ticket ne se sert pas sur cette box — il l'emporte sur fire et sur le grant merge, n'entre pas sur le rail, n'attend personne (#389)
- `faits` donne l'adresse des tickets qui attendent — la box la compose de son dépôt, l'app ouvre l'issue d'un ticket hors rail sans rien composer (#382)
- La carte de projet porte ses cooks en cours — ticket, titre, station, lus dans `faits` ; « aucun cook » se dit, et un runtime d'avant ce champ aussi (#377)
- `faits` donne les cooks en cours — ticket, titre, station —, lus à la projection que `station` montre (#374)
- L'app a sa barre d'icônes et ses onglets de contenu — Rail, Cooks, Grants, Log (#348)
- Un lecteur sans accès à la box le lit comme tel — le droit du geste (68), une commande qui manque (127, 69), et le renvoi sous le message de ssh (#335)
- L'app ne se fait plus dicter de commande — elle lance le geste de la box avec le nom du projet (#330)
- Le délai de la lecture se dit seul — le second ne devine pas si ssh avait joint la box (#310)
- Un ticket pris dit depuis quand il n'a pas progressé (#56)

### Changed

- Close the stuck-card test's log before its directory goes, for Windows (#1453)
- Delivered cards are judged after a runtime restart, rebuilt from the journal (#1452)
- Before/after captures of the station page, with the figures and with the dash (#1449)
- A fake gh and two projects prove the counts reach status and the app's facts (#1448)
- Close the counters and the log before their test directories are removed (#1444)
- The choices' view test from v2 starts the view without the manager's own gestures (#1440)
- Skip on Windows the two setup-in-kitchen tests whose setup passes, saying why (#1404)
- The rail not read says why; the module that reads stations stays free of ssh and hex colors (#1410)
- Read pnpm 10's engine-identity failure as it prints it, and keep the proxy log typed (#1391)
- The failed clone's example names the same station throughout (#1402)
- The decisions test carries the two base budgets (#1387)
- The unheld case no longer touches the judges' folder (#1388)
- La sélection des gates ne suit plus les imports du produit, seulement ceux des tests et de leurs helpers (#1381)
- The Git shells are looked for with the platform's separator, as shellsDeGit builds them (#1382)
- Close the journal before its directory is removed, as Windows needs (#1380)
- Zone-du-86 closes its log before its directory is removed (#1377)
- Node processes of the gates stop loading undici for nothing (#1376)
- The gates play only the tests the change touches, everything on the base (#1374)
- The cook's gates tests skip off POSIX — the launcher, the gates and the fake claude are bash scripts (#1373)
- The gates cost tests close their log before its directory goes, and skip what bash plays off POSIX (#1362)
- The app tests answer their gh stand-in in process and compile the view once (#1361)
- Two tests of the same name in one file make one entry — failed if either failed, durations summed (#1350)
- Before and after captures of the TODO cards, both cards whole on a taller window, and the answered card gone from TODO (#1327)
- Type of the held-ticket tests (#1265)
- Cite the last French titles of etat-et-mesures, exploitation, station and station-distante by their English headings and pages (#1253)
- The gesture placeholders the app's tests read stay French in exploitation and fermeture (#1250)
- The manager's question is read as `QUESTION ASKED`, the name the runtime writes (#1230)
- The app suite runs on Windows — every test red on windows-latest is fixed or skipped there, saying why (#1238)
- Document how to publish an Android release so the update is found (#1236)
- Translate docs/runtime/carnet-lecons.md, identites-et-secrets.md and station.md to English (#1234)
- Quote the runtime's real startup lines and say which messages stay French (#1231)
- The common tier — threshold, the chef's yes/no, what cooks receive (#1232)
- The app tests that read docs/runtime assert on commands and status words, not on the pages' headings or prose (#1226)
- The four refusal screens in the capture tool's table; before #1205 the state of a remedy that holds did not exist, so its before capture is the refusal screen of v2 (#1228)
- Le renvoi et la correction du chef, et la leçon née d'un renvoi (#1223)
- Un « oui » sur un profil proposé avant l'origine écrit ses leçons nées d'une rétro (#1222)
- Un profil au dispatch, et le carnet qu'en reçoit son cook (#1221)
- README.md et CLAUDE.md en anglais, avec la convention de langue (#1209)
- Fin de la traduction en anglais de docs/superpowers (24 specs restants) (#1208)
- Construire l'APK Android et l'essayer sur un émulateur (#1180)
- La cuisine de test de l'app prend la décision du chef ; l'accueil du second remplit la décision (#1152)
- Brigade : récolte — ce que le cook avait laissé non commité dans son worktree (#1141)
- La vérification à la main du bac à sable local éprouve un répertoire sous le compte, pas /tmp, qui n'est qu'un lien sous macOS (#1127)
- Le journal d'un runtime nu porte désormais le seuil de durée des gates par défaut (#1090)
- Captures avant / après des écrans de l'app installée — inchangés, la mise à jour n'y est pas encore affichée (#1066)
- Où télécharger et comment installer l'app du Mac (#1062)
- L'outil de renommage, repris de #1003 — à blanc sur une copie, preuve, chemins en morceaux, propriétés raccourcies (#1065)
- L'outil de capture liste l'écran de la proposition de nettoyage (#1026)
- Reprise — la tête de la branche du cook se lit une fois son commit fait, pas dès que son fichier est posé (#1025)
- La partie closer (#990) sous le seul onglet Settings — Cost vit au niveau de l'app (#1023)
- L'outil de capture liste les cinq écrans du lancement du closer (#1024)
- La suite de l'app passe de 54 s à 21 s, sans retirer un test (#1018)
- Les bilans de grant en anglais dans exploitation, pass-merge, pass et etat-et-mesures (#962)
- Brigade : récolte — ce que le cook avait laissé non commité dans son worktree (#956)
- La liste des écrans de capture nomme cout-perdus (#921)
- Captures avant/après de la file — « cooks on : box » et « cooks on : Mac » (#898)
- La doc du runtime décrit la publication de l'état, le budget d'appels et l'attente de limite (#894)
- Captures avant/après des réglages du projet : le bloc « tickets ordinaires » de la station Mac, avec le message de bac à sable indisponible (#852) (#892)
- Station Mac : réglage « tickets ordinaires », cooks lancés dans le bac à sable, refus sans bac à sable (#851) (#890)
- La relecture juge aussi les captures : une violation des règles de #830 est un constat bloquant (#843) (#888)
- Livraison d'interface : captures avant et après sur la PR et sur la carte (#842) (#887)
- Le garde-fou des écrans (#835) joue le nouvel accueil (#885)
- CLAUDE.md : ne déclarer que le chef, le second et la cuisine (#848) (#886)
- Garde-fou — plus de commande, de mode d'emploi, de code ni de prix à plat dans les écrans (#883)
- Les tests de l'app ne réclament plus ce que la mise en service donnait — ni « burns », ni ligne de version, ni suite d'entrée écrite par le runtime (#809)
- Le faux gh des gists écrit à côté, puis renomme (#807)
- Docs(spec): la station refaite de zéro — une installation par machine, puis des projets, plus jamais de commande (#785)
- La mise en service active le renouvellement, sans geste à la main (#770)
- Le second reste local, sans multiplexeur, et reprend sa conversation à la réouverture (#750)
- La fin d'un test tue le relais avant son cook — tué après, il écrivait sa fin (#762)
- Le témoin de la cloison n'est lu qu'écrit en entier — sous charge, il était lu à moitié (#752)
- Étude — brigade peut-il être une couche sur Hermes Agent ? (#742)
- Des gates coupées par la garde d'horloge sur une machine saturée ne sont pas un rouge (#732)
- Brigade : récolte — ce que le cook avait laissé non commité dans son worktree (#723)
- Docs(spec): les stations sont au chef — une app installée est une station, un projet choisit les siennes (#701)
- Brigade : récolte — ce que le cook avait laissé non commité dans son worktree (#695)
- Le projet bloqué ne reprend qu'un ticket à la fois — station.held aside, un seul ticket sonde, les autres restent retenus jusqu'à la levée (#662)
- La bascule reprend aussi les réglages de fermeture, et n'invente pas un réglage absent du drop-in (#652)
- Installer.md — l'ancienne section du parcours par l'app est retirée, et les stations et décisions ne se posent plus à la main (#599)
- Les tests de allumage suivent la ponctuation anglaise (#593)
- Un app.json écrit avant #534 est lu avec les mêmes réglages — fixture d'avant la PR #574 et son test (#587)
- La section session cite les trois commandes d'installation du timer (#566)
- Glossaire — retenue n'a plus qu'une traduction (held) ; la station se retient (withholding) (#557)
- Le faux élément porte ariaPressed (#519)
- La confirmation dit son prix, la demande d'une alerte ne part jamais sans Entrée (#518)
- L'app comme poste de travail — le rail au centre, le second à droite, des alertes qui se taisent (#490)
- Deux stations, aucune station, plafond par station et déclaration invalide (#456)
- Le franchissement d'un seuil de coût laisse un cook en cours en cours — status le montre avant comme après, aucun arrêt n'est écrit (#449)
- Le test du second sur vrai pty suit la note longue et le rôle invoqué au démarrage (#448)
- Le parcours « regarder une livraison d'interface dans mon navigateur » (#437)
- Illisible puis lisible est jugé sur la dernière relecture du même commit ; trois illisibles remontent sans merge ni cook ; la borne tient après un redémarrage et sous le disjoncteur (#434)
- Le rattrapage d'un worktree servi arrête son serveur d'abord, à l'échelle de la station — port muet, station et status sans serveur (#429)
- Le serveur d'un worktree répond sur son port, deux worktrees ne se coupent pas, et ce qui n'est pas servi le dit (#428)
- Le parcours par projet passe par l'app, le chemin manuel devient le repli (#419)
- Update-partout.sh dit ce qu'il fait, ce qu'il ne fait pas, et ce qui reste à la main après lui (#385)
- L'écran s'appelle « Tous les projets », la cuisine reste l'état d'un projet (#365)
- CLAUDE.md nomme la peau du Designer et ce que l'app lit d'un projet (#359)
- Le PO est le second, et c'est écrit là où le chef le lit (#358)
- La maquette de l'app entre dans le dépôt, avec ce qu'il ne faut pas en construire (#353)
- Le décompte partagé ne porte pas le nom d'une variable de son appelant (#347)
- Le coût d'un redémarrage renvoie à ce que le journal en dit, sans affirmer plus (#340)
- Le commentaire du terminal de `script` au-dessus de ce qu'il décrit (#331)
- Le compte qui joint la box lance la commande envoyée — pas un compte à commande forcée (#326)
- La spec cesse de décrire l'API, le VPN et le MCP qu'on a écartés (#323)
- L'heure et l'état restent les seuls faits que l'app ajoute (#324)
- Le test de la file vide dit ce qu'il prouve désormais (#320)
- Un ssh mort du signal ne dit pas jusqu'où il était allé (#306)
- Le hook d'arrêt part, et le plafond des gates n'est plus un verdict — la durée reste imprimée (#293)
- La consommation affichée dit qu'elle est celle du projet, pas celle du compte — /usage reste la vérité (#289)
- La question de suppression du reviewer, et la commande du rapport ajoutées / retirées (#287)
- La charte est vide, et ce n'est pas un objet de plus (#286)
- La ligne d'exemple de CLAUDE.md porte le plafond du binding (#281)
- Le plafond des gates redescend à 144 s — 115,0 s mesurés au calme, pour 145 à 149 s sur v2 le même matin (#276)
- La coupure avant le redémarrage de l'arbitre se dit, et la mise en forme du client retrouve la sienne (#273)
- Un process posé sur un port ne parie plus sur un port fermé resté libre — le port repris se dit, et un autre est tiré (#272)
- Un port fermé à l'instant peut être redonné sous Linux — la ligne entre au tableau de ce qu'un test ne doit pas tenir pour acquis (#270)
- Merge branch 'v2' into cook/261-33dd9c62 (#264)
- Tech(recette J7): le registre npm est déclaré au réseau de la cloison (#244)
- Renvoi 1 — le hook ne reprend qu'un vert gardé, un rouge est toujours rejoué ; le libellé du réveil se règle sur l'événement (#242)
- Renvoi 1 — la sortie d'un passage se lit au fil de l'eau, l'attente du verrou est bornée, un passage tué ne prête pas de verdict (#238)
- Le setup rend aussi ce qu'il a masqué (#233)
- Le plafond des gates passe à 131 s, sur le relevé de d426f44 (1228 tests) (#226)
- Sous cloison, les transcripts du ~/.claude du projet sont rangés (#217)
- Le clone servi ne range plus ses références, les refus nommés sont bornés (#211)
- Un cook bavard ne court plus contre le plafond de tours des tests de garde-fous (#212)
- Les facteurs mesurés, utilisateur et système, tels que #190 les donne (#206)
- Le plafond passe à 120 s, et dit ce qui est mesuré — il juge juste poste calme (#201)
- L'histoire du rejeu des projections nourrit la retenue du contrôle (#197)
- Ce que la file ne compte pas encore renvoie à #193 (#194)
- Les pertes d'un clone tiennent dans un seul dépôt de test (#188)
- Le plafond vaut 100 s, fixé sur v2 avec #173 et #174 (#192)
- Quatre fichiers de tests lisent le jour de l'horloge au lieu de le répéter en dur (#172)
- La rencontre fait livrer ses cooks avant le verdict de la base, puisqu'une base rouge retient la station (#161)
- Docs(v2): la fermeture, parce que rien dans la V2 ne retire quoi que ce soit (#162)
- Muet est un scénario du shell, pas de faux-claude.ts (#159)
- Faux-claude.ts ne se lance plus seul (#157)
- Les tests de libération du dépôt, resserrés (#151)
- Une seule sonde vivant(), stricte, à côté de mort() (#149)
- Une garde d'horloge tue la suite figée dans du code synchrone, et les gates rougissent (#142)
- La durée des gates a un plafond, en temps processeur, déclaré par projet (#135)
- Les tests ne laissent plus rien dans le répertoire temporaire (#133)
- Deux passages remis à la largeur du fichier (#85)
- Sur le poste de dev, clarifier l'ordre des démarrages avant d'arrêter la cuisine (#64)
- Recette, étape c — clarifier la présence de la ligne init et des plugins builtin (#66)
- Bindings V2, les variables et commandes du runtime, et la durée réelle de la suite (#60)
- La mort du petit-enfant s'attend, elle ne se lit pas à l'instant de la fin (#53)
- Docs(v2): la vivacité et l'avancement sont deux signaux, pas un seul (#44)
- Deux signaux remis ensemble à un process suspendu, et le contrôle de types part avec les tests (#40)
- Docs(v2): le runtime récolte, et le bail ne se renouvelle que sur un progrès (#28)
- Le réveil d'essai n'emprunte plus un fait du rail (#31)
- Bindings, gates et setup de worktree adaptés à la V2 (#29)
- Les rôles ciblent la branche d'intégration des bindings (#27)
- Plugin 0.15.0 — deux agents ajoutés (#26)
- Docs(v2): stack du runtime — TypeScript sur Node 26, log SQLite, systemd (#24)
- Docs(v2): Claude seul en V2, conditions d'usage Max vérifiées (#12)
- Le hook juge le bon arbre, et chaque échec garde ses deux tentatives (#4)
- Huit evals qui gardent les interdits nés des pannes (#9)
- Un teammate n'est pas in-process, il est seulement mortel (#7)

### Fixed

- Deliveries wait their turn and are judged one pass at a time, in delivery order (#1451)
- Name the blockers' ticket without a hash in the view, which the skin reads as a color (#1442)
- Declare agents/manager.md in plugin.json (#1370)
- One script writes the CPU total, the sorted test list and the per-file CPU profile into an output directory (#1359)
- `ensemble` and `alongside` are optional in the runtime's types, for the app that builds them by hand; the second `facts` fixture carries `ensemble` (#1328)
- The triage tests pass on Windows — the journal closes before its directory is removed, and the kitchen test driving the fake claude is skipped there (#1303)
- Droits.ts launches PowerShell through sans-invite.ts, like every runtime/src module (#1275)
- The uninstall plan is titled for what the app shows — its log line — instead of announcing the removal list it no longer reproduces (#1294)
- A failed gesture's message is cleared wherever the center's notes are, so it never follows the chef into another project (#1296)
- Launch the Windows installer through a short PowerShell that starts it in a hidden console, and poll for the app's exit (#1255)
- The skin guard admits only the narrow-page width query, one threshold shared by vue.js and vue.css; no ticket number written like a colour in index.html (#1224)
- Remaining cited titles (#1219)
- Les refus d'essai portent `noRemedy`, comme le runtime de v2 les donne désormais (#1211)
- Sans levier propre à l'app, le bouton du refus lance la vérification de l'installation au lieu de copier l'action (#1198)
- Le geste d'un accès refusé a son bouton, « copy the command », en plus de la commande dite (#1192)
- La station d'un Mac pose le clone et les worktrees de ses projets hors de ~/.config/brigade, pour que ses cooks y travaillent dans le bac à sable (#1193)
- Un ticket redécoupé dont tous les morceaux sont servis compte comme livré pour ceux qui l'attendaient (#1191)
- « continue without sandbox » note la décision du chef par le runtime, et le parcours passe à la préparation (#1181)
- ExecFile du module sans invite garde son promisify.custom ({ stdout, stderr }) (#1179)
- L'app relit `decisionAttendue` de l'onboarding, comme le runtime l'écrit désormais (#1173)
- Une épique retenue n'est pas requalifiée ; les tests du manager distinguent la relecture d'une issue retenue de son jugement (#1140)
- La confirmation d'un geste sait où la cuisine tourne — arrêter, reprendre et les grants se confirment pour un projet servi ici sans « hote » (#1137)
- La commande `profile` du runtime tranche un profil proposé — les boutons de la carte écrivent enfin la réponse (#1077)
- Le total d'un ticket avec rétro se lit comme son coût sans rétro plus celui de la rétro (#1073)
- Un runtime qui ne peut pas encore prendre la réponse se dit en constat, sans demander de mise à jour ailleurs (#1074)
- Les tests des gates de l'app ne font pas la queue derrière le tour de la box (#1061)
- Captures avant / après — et, installée, plus de cadre vide en tête de Settings (#1028)
- Sans closer réglé, la partie le règle par un bouton — le modèle et l'effort choisis ensemble, écrits dans le second (#1021)
- À jour de v2 (#987) — le test de la fiabilité prend MODELES/EFFORTS là où ils vivent, et sa phrase dit « station » (#985)
- Les champs renommés de Demande et du corps de PR de fermeture suivent chez leurs lecteurs (#980)
- Le rail muet ne relance plus la lecture des tickets fire sans fin, et son test dit le cas (#966)
- Les agents écrivent aussi leur texte GitHub en anglais (#964)
- La ligne de cloison d'une station, en anglais dans son test (#963)
- Deux tests hors zone attendent la sortie anglaise de grant (#958)
- Les sorties de `rail`, `pass`, `log` et `waiting` en anglais (#944)
- L'accueil lit la machine saturée que `status` dit en anglais (#943)
- Une sous-épique livrée par ses propres tickets compte comme servie dans le bilan de l'épique parente (#925)
- Les messages et commentaires du code (vue, alertes, déploiement, runtime, app) renvoient à la page de docs/runtime/ et non à l'ancien docs/runtime.md (#923)
- Le geste de la ligne d'alerte de seuil est un bouton — « open the sheet of #N » ouvre la fiche, « open the list » déploie les tokens perdus (#922)
- Le « detail » d'une alerte ne montre plus le geste à recopier — le pourquoi et le brut de la box, rien d'autre (#917)
- La confirmation d'allumer n'écrit plus rien à côté de ses réponses — ce qu'elles engagent passe au survol de leur bouton (#915)
- Le « depuis quand » de la ligne de mise à jour se déduit de la version vue, plus d'un champ que personne ne publie (#903)
- Retire du commit les artefacts d'exécution (bases SQLite, appels) et rend runtime/.ecrit à v2 (#891)
- L'arrêt propre de la station s'écrit tout de suite, hors de l'écart de 60 s (#884)
- La pass n'attend la CI que des workflows qui se déclenchent sur les PR vers la base (#869)
- La connexion Max montre l'interface de claude setup-token, le jeton masqué, et renonce s'il reste muet (#863)
- La carte d'accueil dit une lecture de faits en échec en une ligne (#858)
- La publication suit aussi runtime/deploy/, que le paquet porte (#855)
- Déclarer agents/cook-design.md dans plugin.json[agents] (#844)
- La cuisine de la station ne suit plus le renouvellement sous un jeton, et y écrit la date du jeton (#829)
- « ask the second » ne dit « written » que si la demande est inscrite — la note du second rendu fait foi (#788)
- « ask the second » écrit une note d'une ligne, qui disparaît à l'envoi (#787)
- « retirer du rail » et « changer la priorité » se jouent depuis la fiche (#777)
- « Vérifier » compare les hôtes du setup à .claude/brigade/reseau et nomme l'écart (#776)
- /brigade:init écrit toujours .claude/brigade/reseau, avec les hôtes du setup (URLs comprises) (#775)
- Un échec systemd (Failed with result + Failed to start) ne fait qu'un passage (#766)
- La reprise attend des identifiants réécrits après la chute, pas un verifie frais (#764)
- Une carte de Livré sans relecture n'écrit plus de texte de remplissage (#751)
- Le « non vérifié » se compte par lecture, non par sujet (#749)
- Le retrait du drop-in ne touche que les lignes à une seule affectation (#748)
- Le seuil « deux lectures de suite » se compte par source — une réception de status n'établit pas ce que faits a raté une fois (#726)
- Un cook arrêté par brigade (stop du chef, mise à jour) ne compte jamais comme un échec — la cause figure dans cook.exited (#738)
- Une mise à jour n'envoie plus SIGTERM aux cooks en vol — l'unité ne signale que le runtime (KillMode=process) (#729)
- L'installation guidée n'envoie plus le chef dans Settings — le clic sur un projet ouvre le rail (#720)
- Le TicketRail de test de l'app porte resumedBecause (#696)
- Un projet installé affiche le rail, jamais l'écran d'installation (#689)
- Le geste de mise en service lancé par le runtime se relance hors de son unité (#673)
- L'app et la doc citent les commandes de la box sous leur nom anglais (#665)
- Le test des décisions relues attend aussi la ligne de sortie, écrite après le journal (#655)
- Les tests de l'app lisent le geste rendu tel que le runtime l'écrit, et la doc cite encore --couper, accepté sans effet (#653)
- La bascule recopie une fois les réglages du drop-in au journal avant l'essai — la nouvelle version ne réclame plus de geste que l'ancienne ne connaît pas (#626)
- Les demandes que l'app écrit dans le second redeviennent du français — le dialogue reste français, les libellés restent anglais (#619)
- Option/Cmd/Ctrl/Shift + flèche et + ⌫ déplacent le curseur au lieu d'écrire des caractères, dans le second et les shells (#618)
- Le bail d'un cook d'ici se renouvelle une fois par empreinte nouvelle — le test ne suppose plus qu'il n'y en a qu'une (#617)
- La demande run mise-en-service refuse tout de suite quand le geste est impossible, avant de retenir les cooks (#600)
- « Vérifier » n'est pas vert quand le compte du service ne peut pas lancer le geste de mise en service (#598)
- Le test des règles sudoers vérifie que la règle existe avant de la comparer (typecheck du runtime) (#596)
- Le test de retrait attend le faux ssh de la veille avant d'effacer son répertoire (#585)
- Rebase sur v2 — les chaînes arrivées avec v2 passent en anglais, et les tests qui les citent (#574)
- Le message du manque sudo n'écrit pas « run <commande> » (#572)
- Les gestes que la file et les refus citent s'écrivent `brigade <projet> <commande>`, jamais `run …` (#575)
- L'échéance de la session Max s'annonce même quand le renouvellement tourne (#540)
- L'app lit le manager elle-même, pour chaque projet, sans onglet ouvert (#532)
- La bascule et les tests suivent les décisions de la passe de fermeture (#523)
- Shift+Entrée revient à la ligne dans le second et dans le shell au lieu d'envoyer (#527)
- Le geste « stations » à chaud ne porte plus de « : » — l'app coupe la ligne de `status` au bon endroit (#515)
- La PR d'une passe de fermeture passe par la pass et le merge normaux (#473)
- La consigne de fin de tour du cook impose de commiter avant de s'arrêter et nomme ce qui n'arrive jamais pendant son tour (#414)
- Une échéance de grant se lit durée en tête, instant en UTC écrit en lettres — et --jusqu-a dit ce qu'il a compris avant d'écrire (#388)
- La vue compose le geste de poste avec l'hôte et le nom du projet — ce qu'elle affiche se recopie, plus de <hote> ni <nom> littéraux (#383)
- Installation lit la connexion Max au journal — plus de « prêt » quand la station la dit expirée, la phrase est celle de run station (#381)
- Le bloc `attend` d'un projet est lâché quand son `status` n'est plus lu — T'attend ne se dessine pas d'un bloc que rien ne rafraîchit (#376)
- Désinstaller un projet arrête sa porte et retire ses drop-ins (#373)
- Une interruption reçue pendant l'arrêt du runtime revient au lieu de dire « rien n'a changé » (#372)
- Ce qu'un passage de la bascule accroche est décroché sur tout chemin qui sort avant la confirmation, et l'interruption est gardée dès la première écriture (#367)
- « déjà en service » se constate, une bascule interrompue revient, et la vérification compare les unités au clone (#363)
- Typage du test des onglets (#361)
- Un projet n'ouvre qu'une connexion à la fois, la carte dit le cas du refus, la bannière ne survit pas au changement de projet (#356)
- La note ne promet que ce qui est tenu, un hôte en tiret n'est pas écrit, un bouton qui échoue le dit (#352)
- --derniers refuse un nombre hors entiers sûrs ; la doc distingue ticket et sans ticket (#351)
- Un lien vers le fichier du dépôt n'est pas une copie, et LoadState=masked dit le masquage (#342)
- Le code 70 du geste (node inapte) a son état : l'en-tête dit ce que le code prouve, sans conseil de mise à jour du runtime (#336)
- Un node trop ancien pour la syntaxe du geste sort en 70 avec sa version ; curl dans les paquets, lien de claude rejouable (ln -sfn) ; la recette lit /opt/brigade par sudo (#333)
- L'ajout n'écrit pas dans un fichier non relu ; une création en échec garde sa raison et se retente ; un lien pendant est refusé sans faire tomber l'app (#332)
- Docs/app.md reprend le texte de #316 — seule la puce du second change (#327)
- Le test des gates sorties d'elles-mêmes attend un pid complet avant de le passer à ps (#328)
- Un systemctl en échec arrête le geste (67), et test, typecheck, start sont refusés (66) (#322)
- Des gates sorties d'elles-mêmes sont jugées sur leur code, même si leur plafond tombe avant que leur fin soit traitée (#308)
- Le plafond court du test ne vaut plus pour la base — elle n'a pas de gates, rien n'y court contre l'horloge (#307)
- Un ssh qu'il a fallu arrêter était connecté — sa box est tenue pour atteinte (#304)
- Le test du plafond de durée ne court plus contre l'horloge — plus de borne sur observed (#302)
- « aucune réponse » ne se dit que pour le délai (#300)
- Findings de review — node-pty chargé à l'usage, mesures retirées quand une suite est rouge, vue plus sûre (#298)
- Une CI rouge sur une branche sans la tête de la base renvoie « mets-toi à jour de la base », pas « CI rouge — job … » (#292)
- La tranche de la PR mergée à la main compare six faits à six — ticket.left n'est plus attendu (#291)
- La liste n'entre pas parmi les juges — JUGES nomme des chemins du projet servi, pass.ts reste intact (#288)
- Findings de revue — le bilan sans grant suit la PR arrêtée, dit qui a mergé, et une PR rouverte puis mergée n'est pas un désaccord (#284)
- Findings de revue (#283)
- La fraîcheur du miroir se lit dans la variable, plus au bout d'un tube qu'un grep -q ferme (#279)
- L'essai ne lève jamais — l'arrêt s'écrit ; une livraison lâchée PR fermée reste un refus ; un merge de la pass n'est pas mis au compte du chef (#275)
- Une intention de merge se conclut toujours (#274)
- Le test du répertoire temporaire étranger ne dépend plus de l'uid sous lequel il se lit, et la suite sous bwrap devient le geste d'avant merge (#268)
- La reprise décide contre ce que la station savait de l'origine (#266)
- Aucun rouge de gates.sh n'est muet, le plafond ne se dit que sous un verdict vert et une fois par commit, seule la ligne du plafond reconnu sort des échecs (#260)
- L'issue n'est recommentée que pour un hôte jamais nommé sur ce ticket, pas quand la liste des hôtes refusés varie d'un essai à l'autre (#251)
- Les relectures avant refus de la porte ont un plancher d'une seconde (#252)
- Trois tests du runtime ne dépendent plus du système, de l'espace de pids ni du répertoire du compte (#253)
- Le verdict des gates s'écrit une fois les deux canaux vidés ; la pass et les tests lisent les gates par un seul canal (#243)
- La coupe d'une suite sans fin attend le premier jeton encore possible, pas le dernier début — par tranches ou entier, le masquage rend le même texte (#240)
- Le flux masqué d'un cook garde sa dernière ligne quand le filet ferme les tubes, et n'attend plus sans borne (#236)
- Seul ce que la branche ajoute est lu, un chemin avec un blanc est vu, et les préfixes du patch ne tiennent plus à la config git (#232)
- Un projet retenu par sa propre borne ne réserve rien, personne n'emprunte tant qu'un projet n'a pas reparlé, et une écriture qui lève ne perd pas la demande (#228)
- Une PR fermée ne dit rien de faux d'un ticket rendu au rail, et le mot du manager survit à la fermeture (#224)
- Le verdict attendu porte ses déclarations, la doc se recoupe, les imports sont dans l'ordre (#223)
- Réenveloppée sur un worktree occupé, la cloison laisse au lancement vivant ses points de montage (#222)
- Un clone nommé dans une autre casse que le disque garde ses worktrees (#220)
- Status n'affiche plus la ligne claude après l'arrêt de la cloison, et la doc suit l'ordre d'affichage (#221)
- Une panne de rapatriement qui change de cause est redite, la retenue garde sa date (#219)
- Une PR fermée sans merge est constatée, et la PR qu'ouvre la pass est au journal (#215)
- Le faux gh note l'appel et son jeton d'une seule ligne — le test ne lit plus l'un sans l'autre (#207)
- Une épique qui n'en est plus une sort de la file — la décision suivante sur l'issue prime (#205)
- La garde d'horloge des gates se teste sur un fait, et le plafond de tours ne fait plus course avec le bail (#204)
- Renvoi 1 — un secret commité sur un renvoi ne condamne plus le ticket, et le contrôle avant push lit binaires et merges (#199)
- Renvoi 1 — merge relu après le retour du ticket, jeton du setup écarté des gates, résultat du merge sans attente, droit workflows nommé (#189)
- Un ménage raté ne défait pas un verdict joué — seule la création du worktree fait un contrôle non joué (#186)
- Type des tickets attribués (#184)
- Une balise citée entre backticks ou dans un bloc de code ne délimite rien (#183)
- Une base rouge se rejoue sans commit à la demande du chef, et un contrôle non joué ne la lève plus (#180)
- Un critère de forme écrit vaut un cran au-dessus du premier (#177)
- La pass juge ce que l'origine a reçu ; un cook hors de sa branche a échoué ; une branche restée n'est relue qu'une fois par vie (#170)
- Le scénario des gates d'un essai ne déborde plus sur la livraison jugée juste après (#171)
- Une livraison jugée avant une autre ne dit pas l'état du projet ; seuil comparé sans arrondi ; le hook tait les MESURE (#168)
- Onze fichiers de tests lisent le jour de l'horloge au lieu de le répéter en dur (#165)
- Un merge relu après le retour du ticket n'est pas mis au compte du nouveau cook (#160)
- Pas de verdict pour un ticket parti, gates et relecture en cache ou non ; une livraison orpheline par branche (#155)
- Un ticket revenu sur le rail n'est ni servi d'avance, ni listé comme gardé (#153)
- Un journal à l'ancienne forme s'ouvre, et la retenue est levée à l'arrêt du runtime (#146)
- Trois tests de commandes du chef ne dépendent plus de la date du jour (#148)
- Un vieux merge n'est pas un suspect, une panne de rejeu n'est pas un conflit, et le manager lit la rencontre (#144)
- Un rail plein part par paliers, la machine se lit avant toute autre borne, et un cook encore vivant garde sa place et sa zone (#141)
- Une remise écrite pendant un tour n'est pas perdue, et l'écart dit ce qui manque (#140)
- Un test bloqué ne retient plus la suite, et mort n'accepte que ESRCH (#138)
- Le refus prime sur « done », sa catégorie vient du fil principal, et le commentaire dit ce que le rail a fait (#134)
- Le commentaire de remontée ne parle de PR que si le ticket en a une (#132)
- Le gabarit de dépôt n'est plus partagé par la machine, un test est plafonné à deux minutes, et la convention de durée dit ce qui est mesuré (#124)
- Les chemins de reprise d'une réaction — découpage gardé, montée déjà faite, recalibrage du chef dit tel quel (#88)
- Un ticket rendu par la pass tient sa zone, un chemin non ASCII se lit tel quel, et un ticket rouvert la tient de nouveau (#87)
- La marque et la fiche ne valent que de confiance, une issue devenue épique n'est pas lancée, la question est relue, et un marqueur cité n'en est pas un (#86)
- Une livraison dont le worktree a disparu remonte sous worktree-lost, pas no-gates (#84)
- Un worktree sale n'est jamais un ticket sans diff, et la consigne du reviewer est bornée en octets (#82)
- Un merge constaté vaut service, un ticket servi ne ferme aucun cycle, et une PR ne s'attend pas (#81)
- Les labels se relisent avant d'être posés, un jugement non abouti n'épingle rien, et éteindre retient la pose (#80)
- Une fiche qui se répare sans que l'issue bouge est relue, et s'écrit (#79)
- La restauration refuse un -wal ou un -shm resté dans la cible (#78)
- Aucun jeton exporté par le setup ne parvient au cook, et un ticket parti pendant le setup ne laisse pas de worktree (#59)
- Run rail dit de redémarrer le runtime devant un journal pas encore rejoué (#58)
- Le commentaire de la reprise dit ce qui garantit le retour (#55)
- Un worktree chargé ou mal lu ne fait pas tomber le bail (#54)
- Quatre findings de revue — renommages vus par judge-modified, issue rouverte refermée, renvoi sur worktree recréé, gates jugées à leur sortie (#49)
- Un cook ne charge plus rien du compte ni des réglages du dépôt servi (#46)
- Un répertoire d'état relatif ne déplace plus le worktree du cook ; la suite revient vers deux secondes (#43)
- Status --suivre s'arrête proprement au second signal (#38)
- Un relevé qui échoue ne coûte rien au runtime, un cook d'un runtime arrêté ne passe pas pour vivant (#36)
- Priorité bornée, issue illisible écartée seule, motif vide refusé (#32)
- Refus, rollback et arrêt tiennent quand la base flanche (#30)
- La voie d'intégration s'élargit, et le verdict des gates se lit (#5)
- La roadmap tient son journal en commentaires, plus dans son corps (#2)

## V2 public-interface notes

Changes to the commands of the box (`brigade <project> <command>`) and their options, in detail. Newest first.

### 2026-10-23 — `setting`: the project's settings, read from its repository (#1304, #1309)

New command: `brigade <project> setting` shows the project's settings — the integration branch, the manager's and the reviewer's default calibration (`manager | reviewer <model> <effort> | default`) and the calibration `ceiling` — with the value in force. `setting branch <name>` and the calibration forms do not change the box: they **propose** the change as a pull request on the project's repository, held for the chef, and it applies once merged. These settings come from `.claude/brigade/projet.json` on `origin/<integration branch>`, before what the box holds (the station's configuration line, the chef's decisions); the calibrations and the ceiling are reread at each use, with no restart. A project whose repository has no file keeps the box's values. A station line may now name no branch nor calibration: the cloned repository declares them. No old name.

### 2026-10-23 — `installation stations`: one station read, changed, removed or marked remote (#1507)

Beside `installation stations <declaration>`, which replaces the whole declaration, a single station of a project can be read, have its cook cap and capabilities changed, be removed, or be marked as the one this workstation plays, and the others stay as written, to the character. The app's `app.json` gains the stations a workstation plays for a project (`stations`, which needs `hote`). Refusals are in English.

### 2026-10-22 — one switch for the project: `switch`; `manager on` / `off` and the `merge` grant follow it (#1406)

New command: `brigade <project> switch [on | off]` — one ON/OFF for the whole project, on by default. Off, no station takes a ticket, the manager judges and splits nothing, and a green delivery waits (`project-off`) until the switch is on again; running cooks finish. Switching on enables the `merge` grant. `manager on` and `manager off` are refused: the manager has no switch of its own, it follows the project's. `manager return`, `backlog` and `upstream`, and `grant` with its `--until`, `--for`, `--uses`, stay. A log from before starts on whatever its old switches were (on as soon as one of them was).

### 2026-10-22 — `pass <ticket> --relaunch`: the way out for a stuck delivery (#1425)

New option: `brigade <project> pass <ticket> --relaunch` writes `pass.relaunched` (author: the chef) for a card in pass, delivered and never judged, with no active pass ahead of it; the pass takes the delivery through its queue. A card with an active pass, waiting for its turn, already judged or merged, cooking or off the rail is refused, with why, and nothing is written. `rail send-back` keeps its contract. `status` now lists such cards stuck for more than 15 minutes, with their number, the duration and the gesture (`stuck` block).

### 2026-10-22 — `rail move`: a manual order within a priority (#1345)

New subcommand: `brigade <project> rail move <ticket> --before <other>` or `--after <other>` places a queued ticket next to another queued one. Within a priority, the chef's order wins over age; placed against a ticket of another priority, the ticket takes it (its `prio:<n>` label is replaced, as by `rail priority`). A move that would put a ticket before one it awaits (directly or through a chain), or after one that awaits it, is refused in one sentence naming the awaited ticket, and nothing is touched. The order is kept across restarts; a ticket loses its rank when it changes priority or leaves the rail. `status` and `facts` give the queue in service order, and the top ticket says why it does not leave (`rail[].raison`: zone held, awaited ticket, machine saturated) (#1346).

### 2026-10-20 — `station stop` / `station start`: one station at a time (#1183)

New subcommands: `brigade <project> station stop <station>` and `start <station>` stop and start one station of the project, from here or remote, in the chef's name. A stopped station takes nothing more (withholding `station-stopped`, also for a remote one that claims); its running cooks finish — delivered, or their ticket goes back to the rail. `facts.stations[]` gains `cuisson` (`cooking`, `stopped`, `saturated`, `refused`), `arreteeDepuis`, `refus` and `cooks`, each with its station.

### 2026-10-20 — `profile`: the chef answers a proposed cook profile (#1053)

New command: `brigade <project> profile` lists the proposed profiles awaiting the chef, by number; `profile yes <proposal>` writes the definition under `.claude/brigade/profils/` of the project's repository, `profile no <proposal>` takes the proposal out of the queue. Exit code 0 when the answer is written (or already was), 1 when nothing is written (the reason on the last line), 2 for an unreadable call.

---

## V1 history (tag `v1-final`)

Everything below was written for V1 and stops at the tag `v1-final`; it is kept as it was.

### 2026-10-19 — the output of the operation commands in English (#933)

What `installation` (`labels`, `setup`, `uninstall`, `--json`), `closing` (`write`, `cancel`), `backup`, `restore`, `measures`, `partition` (`probe`), `pull` (`announce`, `claim`, `renew`, `return`), `door`, `hold-arbiter` and `help` write — lines, refusals, errors and usage, plus the errors of the entry point (unknown command, old name redirected) — is English, in the words of `docs/glossary.md`. This closes the criterion of #536: no output of the box keeps a French word. `runtime/test/exploitation-en-anglais.test.ts` plays every command of `COMMANDES` on the example state of the bottom of `status`, with its subcommands and at least one refusal, and fails if a line carries a word of the French column of the glossary; a command added to `COMMANDES` without a path there fails the first test. The keys of the `--json` outputs do not change, nor do the names of the log's events and of the decisions. The old command names and words still answer, saying the new one, until **2027-01-14**.

### 2026-10-18 — the output of the chef's commands in English, all five families (#932)

What `manager` (`on`, `off`, `return`, `backlog`, `upstream`), `grant` (`enable`, `extend`, `revoke`), `station`, `guardrails` (`stop`, `resume`), `base` (`replay`) and `arbiter` (`weight`, `remove`) write — lines, refusals, errors and usage — is English, in the words of `docs/glossary.md`; this closes the epic (#950, #951, #952 and #953, after #931). `runtime/test/sorties-du-chef-en-anglais.test.ts` plays each of them, refusals included, on an example state and checks that no line keeps a word of the French column of the glossary. The same file mounts a log, a unit drop-in and a state file written in French before the epic and checks they are shown and applied without editing: decisions and grants set earlier keep their effect, the old command words (`allumer`, `eteindre`, `rendre`, `activer`, `prolonger`, `revoquer`, `reprendre`, `retirer`, `aide`) still answer, saying the new one, until **2027-01-14**, and a station declaration keeps its words `distante` and `ordinaires`. The names of the decisions, the keys of the JSON of `manager upstream` and `pass --json`, and the event names of the log do not change.

### 2026-10-18 — the output of `station` in English (#953)

What `station` writes — the view (stations, `simultaneous cooks`, `Max connection`, `withholding`, `cooks running`, `latest cooks`, `consumed`, `chef's decisions`), `cooks <N>`, a decision, `remove` and `help` — lines, refusals, errors and usage, is English, in the words of `docs/glossary.md`. That includes the refusals that come from the decisions (`BRIGADE_STATIONS invalid: station no. 1 …`, `… invalid: “x” — expected opus, sonnet or haiku`) and the form of a station declaration (`<machine>/<engine>:<cooks cap>:<capability>+<capability>[:distante[+ordinaires]]`; the words `distante` and `ordinaires` are still the ones you type). The names of the decisions (`seuil-ticket`, `manager-modele`, `closer-retraits`…) do not change, nor do the old words `retirer` and `aide`, which still answer and say the new one. Decisions written to the log before this change keep their effect and are shown as they were set. The app reads `station` in both languages, so a box that has not been updated yet is still read.

### 2026-10-18 — the output of `rail`, `pass`, `log` and `waiting` in English (#931)

What `rail` (with `remove`, `priority`, `merge`), `pass` (with `issue`, `comment`, `ask`), `log` and `waiting` (`set`, `resume`, `arrived`) write — lines, refusals, errors and usage — is English, in the words of `docs/glossary.md`. The typed forms do not change (`--remind 7j` still reads), nor do the keys of `pass --json` and the event names of the log. Free text written to the log by others (a reviewer's finding, a gate's failure, an unreadable card's reason) is shown as it was written. Two shared messages follow: `no log in <dir>` (any command that opens the log) and the `BRIGADE_GITHUB_REPO` / `BRIGADE_LEASE_SECONDS` / `BRIGADE_COMMON_PATHS` configuration errors. `grant`, `base` and the other commands keep their wording until their own tickets.

### 2026-10-16 — session renewal is off on a station with a long-lived token (#818)

When `BRIGADE_CLAUDE_TOKEN_FILE` is set, the runtime no longer follows the Max session renewal (#508): it does not read the renewal state file, writes no `session.observed` / `session.restored`, the station's connection watch draws no loss (`session-refusee`…) from it, and the « session Max près de son échéance » line stays out of the queue. Without a token, nothing changes.

### 2026-10-15 — `manager upstream` (#697)

New subcommand: `brigade <project> manager upstream` lists, as one line of JSON, every open issue of the repository that is not on the rail, and what happens to each — one word of a closed list (`attend`, `en-route`, `sortie`, `servie`, `decoupee`, `epique`, `ecartee`, `non-lue`), with its priority and one line the box says about it. It only reads: GitHub, then the log, read-only. The app counts it next to the rail. The contract is in `docs/runtime.md`, « En amont du rail ». No old name.

### 2026-10-15 — box commands in English (#535)

The commands of the box, their subcommands and their options take the English names fixed in `docs/glossary.md`. `brigade <project> help` (or `--help`) lists them, in English only.

**Transition.** Until **2027-01-14**, every old French name still works: an old command name runs the command under its new name, and an old subcommand or option is replaced by its new one. Each time, one line on standard error names the new name and this date; the exit code is the command's own. **From 2027-01-14, the old names no longer answer**: an old command name is refused as an unknown command, an old subcommand or option as a malformed command (exit code 2).

The lines that `status` writes, and its `attend` … `fin attend` block, are unchanged for now.

### Commands

| Old name | New name | Old name answers until |
|---|---|---|
| `faits` | `facts` | 2027-01-14 |
| `journal` | `log` | 2027-01-14 |
| `attente` | `waiting` | 2027-01-14 |
| `garde-fous` | `guardrails` | 2027-01-14 |
| `mise-en-service` | `deploy` | 2027-01-14 |
| `mesures` | `measures` | 2027-01-14 |
| `fermeture` | `closing` | 2027-01-14 |
| `sauvegarder` | `backup` | 2027-01-14 |
| `restaurer` | `restore` | 2027-01-14 |
| `tirer` | `pull` | 2027-01-14 |
| `cloison` | `partition` | 2027-01-14 |
| `arbitre` | `arbiter` | 2027-01-14 |
| `porte` | `door` | 2027-01-14 |
| `tenir-arbitre` | `hold-arbiter` | 2027-01-14 |

Unchanged: `status`, `rail`, `pass`, `station`, `manager`, `grant`, `base`, `installation`. New: `help`.

### Subcommands and options

| Command | Old | New | Old answers until |
|---|---|---|---|
| `status` | `--suivre` | `--follow` | 2027-01-14 |
| `log` | `--derniers` | `--last` | 2027-01-14 |
| `station` | `retirer` | `remove` | 2027-01-14 |
| `station` | `aide` | `help` | 2027-01-14 |
| `manager` | `allumer` | `on` | 2027-01-14 |
| `manager` | `eteindre` | `off` | 2027-01-14 |
| `manager` | `rendre` | `return` | 2027-01-14 |
| `grant` | `activer` | `enable` | 2027-01-14 |
| `grant` | `prolonger` | `extend` | 2027-01-14 |
| `grant` | `revoquer` | `revoke` | 2027-01-14 |
| `grant` | `--jusqu-a` | `--until` | 2027-01-14 |
| `grant` | `--pour` | `--for` | 2027-01-14 |
| `grant` | `--usages` | `--uses` | 2027-01-14 |
| `grant` | `--sans-echeance` | `--no-expiry` | 2027-01-14 |
| `waiting` | `poser` | `set` | 2027-01-14 |
| `waiting` | `reprendre` | `resume` | 2027-01-14 |
| `waiting` | `arrive` | `arrived` | 2027-01-14 |
| `waiting` | `--quoi` | `--what` | 2027-01-14 |
| `waiting` | `--de` | `--from` | 2027-01-14 |
| `waiting` | `--relance` | `--remind` | 2027-01-14 |
| `guardrails` | `reprendre` | `resume` | 2027-01-14 |
| `base` | `rejouer` | `replay` | 2027-01-14 |
| `deploy` | `--couper` | `--interrupt` | 2027-01-14 |
| `deploy` | `annuler` | `cancel` | 2027-01-14 |
| `deploy` | `voir` | `show` | 2027-01-14 |
| `installation` | `desinstaller` | `uninstall` | 2027-01-14 |
| `installation` | `--confirmer` | `--confirm` | 2027-01-14 |
| `measures` | `--par` | `--by` | 2027-01-14 |
| `closing` | `ecrire` | `write` | 2027-01-14 |
| `closing` | `annuler` | `cancel` | 2027-01-14 |
| `pull` | `annoncer` | `announce` | 2027-01-14 |
| `pull` | `reclamer` | `claim` | 2027-01-14 |
| `pull` | `renouveler` | `renew` | 2027-01-14 |
| `pull` | `rendre` | `return` | 2027-01-14 |
| `pull` | `--preuve` | `--proof` | 2027-01-14 |
| `pull` | `--tours` | `--turns` | 2027-01-14 |
| `pull` | `--jetons` | `--tokens` | 2027-01-14 |
| `pull` | `--fin` | `--end` | 2027-01-14 |
| `pull` | `--raison` | `--reason` | 2027-01-14 |
| `partition` | `eprouver` | `probe` | 2027-01-14 |
| `arbiter` | `poids` | `weight` | 2027-01-14 |
| `arbiter` | `retirer` | `remove` | 2027-01-14 |

`deploy --interrupt` (formerly `--couper`) is accepted and has no effect: a deploy no longer waits for the rail to drain.
