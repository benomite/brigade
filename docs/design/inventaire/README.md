# Screen inventory

The screen states of `scripts/capture-ecran/ecrans/` (#2899, epic #2898).

## Dead states

These 77 states were deleted from `scripts/capture-ecran/ecrans/` by #2899: no code path of the app could reach them any more.

### Unreachable since a feature was deleted

PR #2459 (#2061) removed the app's reading of the Kitchen board, the issue in which a station published the runtime's `facts` and `status`; the app has since built them from GitHub, and they carry only the rail, the served tickets, the cooks, the stations' signs of life and what awaits the chef.

| State | Deleted feature that made it unreachable | PR (issue) |
|---|---|---|
| `bande-alertes` | the Kitchen board's `status` header lines (Max connection, red base, lapsed grant, held kitchen) and the manager reading | #2459 (#2061) |
| `bande-alertes-ouverte` | same as `bande-alertes` | #2459 (#2061) |
| `cooks-activite` | `activiteCuisine` in the Kitchen board's `facts` | #2459 (#2061) |
| `cooks-apprentissage` | `apprentissage` (lessons and profiles) in the Kitchen board's `facts` | #2459 (#2061) |
| `cooks-cahier` | `apprentissage` lessons in the Kitchen board's `facts` | #2459 (#2061) |
| `cooks-deux-stations` | station states published in the Kitchen board's `facts` (remote, stopped by the chef) | #2459 (#2061) |
| `cooks-stations` | station states published in the Kitchen board's `facts` (stopped, saturated, refused) | #2459 (#2061) |
| `cooks-stations-declarees` | the Kitchen board's station list, which alone drew the declared stations under « Its stations » | #2459 (#2061) |
| `cooks-toutes-les-stations` | same as `cooks-stations-declarees` | #2459 (#2061) |
| `cooks-station-atteinte` | same as `cooks-stations-declarees` | #2459 (#2061) |
| `cooks-station-pas-atteinte` | same as `cooks-stations-declarees` | #2459 (#2061) |
| `cooks-station-edition` | same as `cooks-stations-declarees` (the « edit » button on a station line of that block) | #2459 (#2061) |
| `cooks-station-retrait` | same as `cooks-station-edition` | #2459 (#2061) |
| `cooks-gates` | `coutDesGates` in the Kitchen board's `facts` | #2459 (#2061) |
| `cooks-gates-sans-passage` | same as `cooks-gates` | #2459 (#2061) |
| `cooks-gates-triage` | `coutDesGates` and `triage` (per day) in the Kitchen board's `facts` | #2459 (#2061) |
| `cooks-page` | activity, gates, roles, lessons and calibration ceiling in the Kitchen board's `facts`, and its `STUCK` status line | #2459 (#2061) |
| `cooks-page-vide` | same as `cooks-page` | #2459 (#2061) |
| `cooks-page-roles-ouverts` | same as `cooks-page` | #2459 (#2061) |
| `cooks-roles` | `rolesCuisine` in the Kitchen board's `facts` | #2459 (#2061) |
| `espace-projet-cuisine-oisive` | `cuisineOisive` in the Kitchen board's `facts` | #2459 (#2061) |
| `espace-projet-limite-github` | `github` (the account's rate limit) in the Kitchen board's `facts` | #2459 (#2061) |
| `file-gates` | `coutDesGates` in the Kitchen board's `facts` | #2459 (#2061) |
| `file-gates-sous-budget` | same as `file-gates` | #2459 (#2061) |
| `file-triage` | `triage` in the Kitchen board's `facts` | #2459 (#2061) |
| `manager-allume` | the manager reading that set the project switch on or off | #2459 (#2061) |
| `manager-eteint` | same as `manager-allume` | #2459 (#2061) |
| `manager-allumer` | the manager reading, and the manager switch the state clicks, replaced by one project switch | #2459 (#2061), #1440 (#1406) |
| `rail-activite` | the rail cards' `activite.faitEn` in the Kitchen board's `facts` | #2459 (#2061) |
| `rail-cadence` | `cadence` in the Kitchen board's `facts` | #2459 (#2061) |
| `rail-cadence-survol` | same as `rail-cadence` | #2459 (#2061) |
| `rail-essais` | each rail ticket's `essais` in the Kitchen board's `facts` | #2459 (#2061) |
| `rail-sans-station` | each rail ticket's `requiert` (capabilities no station provides) in the Kitchen board's `facts` | #2459 (#2061) |
| `rail-sans-station-donner` | same as `rail-sans-station` | #2459 (#2061) |
| `rail-sans-station-humain` | same as `rail-sans-station` | #2459 (#2061) |
| `rien-ne-cuit` | the `nothing cooks` line of the Kitchen board's `status` | #2459 (#2061) |
| `station-appels` | `appelsGithub` in the Kitchen board's `facts` | #2459 (#2061) |
| `station-plafond` | the station's cook cap line (`… at most`) of the Kitchen board's `status` | #2459 (#2061) |
| `station-plafond-chef` | same as `station-plafond` | #2459 (#2061) |
| `station-retenue` | the cook cap and `MACHINE SATURATED` lines of the Kitchen board's `status` | #2459 (#2061) |
| `todo-carte-envoyee` | the chef's answers to TODO cards posted on the Kitchen board (`envois`) | #2459 (#2061) |
| `todo-carte-pas-jouee` | same as `todo-carte-envoyee` | #2459 (#2061) |
| `todo-carte-repondue` | same as `todo-carte-envoyee` | #2459 (#2061) |
| `todo-disjoncteur` | the `breaker OPEN` kitchen line of the Kitchen board's `status` | #2459 (#2061) |
| `todo-disjoncteur-reprise` | same as `todo-disjoncteur` | #2459 (#2061) |
| `todo-disjoncteur-echec` | same as `todo-disjoncteur` | #2459 (#2061) |
| `worktree-en-echec` | the `worktree-failed` events of the old cook path, which nothing writes any more | #2459 (#2061) |
| `todo-cartes` | TODO cards read from the Kitchen board's `facts` (`attend[].carte`, with before/after captures): TODO is now read from GitHub | #2470 (#2460) |
| `todo-cartes-forme` | same as `todo-cartes` (cards without a question) | #2470 (#2460) |
| `todo-tache-humaine` | the human task of a TODO card (`attend[].tache`) in the Kitchen board's `facts`: TODO is now read from GitHub | #2470 (#2460) |
| `fiche-retro` | a ticket's history and retro read from the box: the sheet now reads its history from GitHub, the retro said not communicated | #1742 (#1735) |
| `fiche-sans-retro` | same as `fiche-retro` | #1742 (#1735) |
| `reglages-apps-github` | the « This machine » block of Settings, moved to a hidden container that nothing shows | #2526 (#2494) |
| `reglages-apps-github-enregistree` | same as `reglages-apps-github` | #2526 (#2494) |
| `reglages-apps-github-erreur` | same as `reglages-apps-github` | #2526 (#2494) |
| `reglages-projets-servis` | same as `reglages-apps-github` | #2526 (#2494) |
| `reglages-projets-servis-vide` | same as `reglages-apps-github` | #2526 (#2494) |
| `reglages-code` | same as `reglages-apps-github` | #2526 (#2494) |
| `reglages-code-installee` | same as `reglages-apps-github` | #2526 (#2494) |
| `reglages-ordinaires` | same as `reglages-apps-github` | #2526 (#2494) |
| `reglages-ordinaires-pc` | same as `reglages-apps-github` | #2526 (#2494) |
| `reglages-ordinaires-sans-bac` | same as `reglages-apps-github`, and the station sandbox state of the Kitchen board's `facts` | #2526 (#2494), #2459 (#2061) |
| `stations-avec-telephone` | a phone paired as a station (the pairing module and the « pair a phone » screen) | #2528 (#2500), #2717 (#2708) |
| `demenager-choix-telephone` | same as `stations-avec-telephone` | #2528 (#2500), #2717 (#2708) |
| `telephone-file-merge` | the `merge` switch, replaced by one project switch | #1440 (#1406) |

### Unreachable since they were added

No feature was deleted for these: the view was built, but no app code ever sent it its data. The PR is the one that added the state.

| State | What was never wired | PR that added it (issue) |
|---|---|---|
| `cooks-cloud` | cloud stations: no bridge (`preload.cjs`, the Android bridge) ever offered `stationsCloud` | #2262 (#2232) |
| `cooks-cloud-approbation` | same as `cooks-cloud` | #2262 (#2232) |
| `cooks-cloud-sans-plafond` | same as `cooks-cloud` | #2262 (#2232) |
| `cooks-cloud-seconde` | same as `cooks-cloud` | #2262 (#2232) |
| `offre-apk` | the Android update offer: nothing ever sends `surOffreApk` (the desktop bridge stubs it, the Android bridge never runs the check) | #1246 (#1170) |
| `telephone-nouvelle-version` | the new-version line on the phone: the Android bridge never answers `avisDeVersion` | #1651 (#1528) |
| `projet-lenteur` | the project's slowest part: `ProjetVu` never carries `lenteur` | #2402 (#2351) |
| `projet-sante-sans-question-0` | Health's blocked-without-question count: the project view never carries `blockedWithoutQuestion` | #2561 (#2557) |
| `projet-sante-sans-question-3` | same as `projet-sante-sans-question-0` | #2561 (#2557) |
| `stations-version-a-jour` | this computer's station status: neither bridge offers `statutDeLaStation` | #2239 (#2191) |
| `stations-version-en-retard` | same as `stations-version-a-jour` | #2239 (#2191) |
| `cout-par-jour` | tokens per day on Cost: the runtime writes only its 5 h and 24 h lines | #919 (#909) |
