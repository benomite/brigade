# Screen inventory

The screen states of `scripts/capture-ecran/ecrans/` (#2899, epic #2898).

## Dead states

These 77 states were deleted from `scripts/capture-ecran/ecrans/` by #2899: no code path of the app could reach them any more. The last six rows were added by #2921, with the Kitchen tab.

### Unreachable since a feature was deleted

PR #2459 (#2061) removed the app's reading of the Kitchen board, the issue in which a station published the runtime's `facts` and `status`; the app has since built them from GitHub, and they carry only the rail, the served tickets, the cooks, the stations' signs of life and what awaits the chef.

| State | Deleted feature that made it unreachable | PR (issue) |
|---|---|---|
| `bande-alertes` | the Kitchen board's `status` header lines (Max connection, red base, held kitchen) and the manager reading | #2459 (#2061) |
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
| `closer`, `closer-trouvailles`, `closer-sans`, `closer-lancer`, `closer-attente`, `closer-en-cours`, `closer-refusee`, `closer-finie`, `closer-derive` | the closer section of the Cooks tab: its four figures, the launch of a cleanup, its confirmation, its states and its proposal | #2921 |
| `fiabilite` | the reliability of the cooks, a section of the Cooks tab | #2921 |
| `cooks-specialisations`, `cooks-specialisation-ajout`, `cooks-specialisation-ajoutee` | the specializations block of the Cooks tab | #2921 |
| `cooks-cahier-vide` | the notebook block of the Cooks tab | #2921 |
| `cooks-plafond-reglage` | the calibration ceiling block of the Cooks tab (the same ceiling is a row of Settings) | #2921 |
| `telephone-file-cooks` | the narrow screen's Cooks tab | #2921 |

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

## Inconsistencies

What the app says and draws differently from one screen to another, read from the source of `app/src/vue/` and the PNGs of the contact sheet (#2900, `index.html` in this folder). Facts only: each item says where it is and what it is. Line numbers are those of `app/src/vue/vue.css` and the `.js` files at the time of writing. The PNG named in an item is the capture of the screen state the selector or file belongs to, matched by the state's name and its source in `scripts/capture-ecran/ecrans/`; the PNGs were not compared pixel by pixel with each rule. The PNGs of #2900 were not on the base when this was written: this folder held no PNG and no `index.html`. The capture names in this section come from the state names in `scripts/capture-ecran/ecrans/` and were not checked against files.

### Same thing said with different words

| What is named | The words, and where | Capture |
|---|---|---|
| The computer the app runs on | « this computer » (`identites-github.js`, `projets-servis/projets-servis.js`, `accueil/station/BlocDeLaStation.js`, `parcours-projet/etape-station.js`), « this machine » (`station/page/NiveauReglage.js`, `station/page/sections/capacites-et-cuisiniers.js`), « this Mac » (the same two files and `vue.js`); the same page says « this computer » in `station/page/NoteSurPlace.js` and « that machine » in the same sentence | `stations-reglages.png`, `reglages-mac.png`, `stations-station-locale.png`, `ajout-station.png` |
| Giving up an open action | « Cancel » (`stations-declarees.js`), « cancel » (`second/geste.js`, `vue.js` for the ticket confirmations) (« Cancel the cleanup » went with the closer's launch, #2921) | `second-geste-confirmation.png`, `cooks-github-stations.png` |
| Saving a form | Gone with #2920: no settings screen has a « Save » button any more — each setting is a row of `composants/reglage` that applies as soon as its control changes | `stations-reglages.png`, `onglet-stations.png`, `cooks-specialisations.png` |
| Trying again after a failure | « Retry » (`page-projet/depot-non-prepare.js`), « Try again » (`accueil/station/BlocDeLaStation.js`) | `depot-non-prepare.png`, `stations-station-locale-perdue.png` |
| Adding a project | « Add a project » on the sidebar footer (`vue.js:8816`), on the screen title (`parcours-projet/parcours.js`) and in `accueil/projets/projets.js`; « Add to the app » on the button of the form (`index.html`); « Add to the kitchen » at the end of the same path (`vue.js:7326`) | `ajout-station.png`, `ajout.png`, `barre-des-projets.png` |
| Moving to the new version of the app | « Install now » (`mise-a-jour/bandeau.js`), « Update now » (`station/page/sections/identite.js`) | `mise-a-jour-prete-mac.png`, `nouvelle-version-mac.png` |
| The cleanup run by the closer | « cleanup » (`closer/lancement/lancement.js`, `closer/derive/derive.js`, `closer/bilan/bilan.js`), « closing pass » (`projet/bandeau-sante/Closer.js`), « closer » for the cook that runs it | `closer.png`, `closer-attente.png`, `projet-sante-closer.png` |
| Nothing was read | « unavailable » (`premier-lancement.js`, `rail-publie.js`, `stations-du-compte.js`, `station/page/sections/connexions.js`), « could not reach » (`identites-github.js`, `projets-servis/projets-servis.js`), « not reached » (`stations-de-cuisson.js`), « failed » (`activite-du-cook.js`, `cost/perdus.js`, `onboarding/parcours.js`) | `rail-publie-indisponible.png`, `premier-lancement-indisponible.png`, `cooks-box-hors-fichier.png` |
| « No data yet » lines | Sentence form with a capital and a full stop (`parcours-projet/etape-projet.js`: « No repository matches. », `closer/tendance/tendance.js`: « No project has a closer set. »); sentence form with no stop (`projet/cuisine/cuisiniers/Cahier.js`: « No lesson in the notebook yet »); lower-case fragments (`apprentissage.js`: « no lesson yet », « no profile yet »; `closer/section.js` and `closer/tendance/tendance.js`: « no merge yet »; `temps-ticket/resume.js`: « no measure yet ») | `cooks-cahier-vide.png`, `closer-sans.png`, `projet-temps-vide.png`, `fiabilite.png` |
| A running read | A capitalised sentence ending in « … » (`parcours-projet/compte.js`: « Reading the GitHub account of this computer… »); a lower-case fragment ending in « … » (`accueil/station/BlocDeLaStation.js`: « reading this computer's station… », `closer/lancement/lancement.js`: « reading what a cleanup costs… ») | `premier-lancement-clonage.png`, `stations-station-locale.png`, `closer-attente.png` |
| Answers of a confirmation | « yes, launch it » / « no » (`closer/lancement/lancement.js`); « run it » / « cancel » (`second/geste.js`); « yes, <the gesture's label> » / « cancel » (`vue.js:3722`); « yes, close the issue » / « cancel » (`vue.js:4281`) | `second-geste-confirmation.png`, `closer-attente.png`, `fiche.png` |

### Same role served by different components

#### Buttons

`button` is reset in `vue.css:21` (no background, no border). Each area then restyles its own buttons in its own selector; none of the rules below shares a class with another.

| Area (selector) | Padding | Font size | Border | Fill | Capture |
|---|---|---|---|---|---|
| Blocages and project choice (`#blocages-du-projet .gestes-du-blocage button`, `#choix-du-projet .issue button`, `vue.css:548`, `629`) | 3px 12px | 12px | `--trait-fort` | none | `projet-blocages.png`, `projet-choix.png` |
| Settings rows (`#etat .apps-github .champ .action > button`, `.reglages-du-projet .action > button`, `#rail .plafond-de-calibrage .action > button`) | 3px 12px | 12px | `--trait-fort` | none | `reglages-du-projet.png`, `reglages-pc.png` |
| Duration caps (`[data-bloc="plafonds-duree"] .plafond .action > button`, `vue.css:7217`) | 4px 14px | 12px | `--trait-fort` | none | `projet-sante.png` |
| Project path (`#stations-du-projet .parcours button`, `vue.css:811`) | 3px 10px | inherited | `--trait` | `--bouton` | `parcours-pret.png` |
| Station step and recap (`.etape-station button`, `.etape-recap button`, `vue.css:5082`, `5143`) | 4px 12px | inherited | `--trait` | `--bouton` | `ajout-station.png` |
| Close pass confirmation (`#rail .closer-lancement .confirmation .reponses button`, `vue.css:5873`) | 3px 10px | 12px | `--trait-fort` | `--bouton` | `closer-attente.png` |
| Voucher confirmation (`#rail .bon .confirmation > button`, `vue.css:4145`) | 3px 8px | 12px | `--bon-trait` | none | `rail-file.png` |
| Second's choices and gesture (`.choix-du-second button.choix`, `.geste-du-second button.geste`, `vue.css:6368`, `6406`) | 6px 10px | 12px | `--trait` | `--bouton` | `second-choix.png`, `second-geste.png` |
| Trust form (`.confiance .lancer button`, `vue.css:1060`) | 10px 16px, `min-height` 44px | 14px | `--trait` | `--bouton` | `ajout-station.png` |
| GitHub connection (`#connexion-github .gestes button`, `vue.css:6166`) | 8px 16px | 14px | `--trait` | `--bouton` | `premier-lancement-connexion.png` |
| Form (`#formulaire button`, `vue.css:2085`) | 6px 12px | 13px | not set in this rule | not set in this rule | `premier-lancement.png` |
| Machines list (`#machines > button`, `vue.css:1151`) | 4px 10px | inherited | `--trait`, radius 4px | none | `demenager-choix.png` |

Buttons of the class `recommande` are drawn in two ways: a border in `--accent` with no fill (`vue.css:555`, `636`, `818`, `2308`, `3432`, `5800`), and a fill in `--accent` with `--fond` text (`vue.css:4153`, `4606`, `5053`, `5150`, `5883`, `6175`).

- Border-only: `projet-blocages.png`, `projet-choix.png`, `parcours-pret.png`
- Filled: `fiche.png`, `closer-attente.png`, `premier-lancement-connexion.png`

#### Pills and small markers

| Marker | Where it is defined | Shape | Capture |
|---|---|---|---|
| `.pilule`, `[data-pastille]` — the six ticket states (#2917) | `app/src/vue/composants/pastille/pastille.css` | padding 4px 10px, radius 999px, border `--trait` | `stations-station-locale.png`, `cooks-github-stations.png` |
| `.etiquette` of a voucher | `vue.css:3852` | padding 0 6px, 11px, radius 8px, border `--bon-trait` | `rail-etiquettes.png` |
| `.age` of a voucher | `vue.css:4291` | padding 0 6px, 11px, radius 999px, border `--bon-trait` | `rail-file.png` |
| `.prio` of a voucher | `vue.css:4342` | padding 0 6px, 10px, radius 999px, border `--bon-trait` | `rail-file.png` |
| `.signal` on the project bar | `vue.css:2549` | `min-width` 14px, 10px, radius 7px | `barre-des-projets.png` |
| `.urgent` of the alerts | `vue.css:4956` | radius 3px | `espace-projet.png` |
| `.marque` of the rail breakdown | `vue.css:2938` | radius 3px | `rail-file.png` |
| `.pastille` | `app/src/vue/composants/pastille/pastille.css` | 10px circle (50%), or a square, diamond, ring, pause or triangle form by `data-forme` | `espace-projet-etats-github.png` |

The `data-forme` shapes (losange, carré, pause, triangle) are drawn once, for `.pastille`, in `pastille.css` (#2917): the column titles and the state of a card on the rail are the pill of `pastille.js`, one variant per ticket state (queued, taken, pass, awaiting, waiting, served).

#### Cards

Cards that draw a block on a dark background (`--carte`, `--case`) differ by border and radius:

- Border `--trait` with radius `--rayon-carte`: `#tous .liste`, `#formulaire`, `.confiance` (`vue.css:91`), `.reglages-du-projet` (`6465`), `#connexion-github` (`6130`), `#temps-ticket-du-projet .temps-ticket` (`427`). Captures: `reglages-du-projet.png`, `premier-lancement-connexion.png`, `projet-temps-normal.png`.
- Border `--trait-doux` with radius `--rayon-carte`: `.tete-cout .chiffre` (`1222`), `.courbe-cout` (`1405`), `.chers-cout .ticket-cher` (`5172`), `#rail .causes-fiabilite .causes li` (`5414`), `.apprentissage-fiabilite .lecon` (`5497`), `#rail .closer-trouvailles .trouvailles li` (`5758`), `#rail .stations-de-cuisson .station-de-cuisson` (`3526`). Captures: `cout.png`, `fiabilite.png`, `closer.png`, `cooks-github-stations.png`.
- Radius `--rayon-bouton` instead: `#rail .closer-bilan .retraits li` (`5922`), `.confiance .machine` and `.capacite` (`912`, `995`), `#station .projets-de-la-station .capacite` (`6642`). Captures: `closer-finie.png`, `ajout-station.png`.
- The warm « waiting » background `--attend` with `--rayon-carte` and border `--attend-trait` (`.attend`, `vue.css:2015`); with `--rayon-bouton` and a `--rouge` border (`#rail .panne-du-rail`, `#rail .ligne-disjoncteur`, `vue.css:2914`, `2940`); with `--rayon-bouton` and a `--trait` border (`.avis-depot`, `vue.css:7870`). Captures: `espace-projet.png`, `depot-non-prepare.png`.
- A card with a left border of 4px in `--accent` and no radius (`#fiche .question`, `vue.css:4618`). Capture: `fiche.png`.
- The voucher (`.bon`, `app/src/vue/composants/bon/bon.css`, #2918) on `--bon`, radius `--rayon-bon`; the awaiting card in « Awaiting you » (`.bon[data-carte="attente"]`, `composants/carte-attente/carte-attente.css`) on `--attend`, radius `--rayon-carte`. Captures: `rail-file.png`, `todo-cartes-assignees.png`.

#### Empty states

> Since #2919 the lines below are one component: `app/src/vue/composants/ligne-vide/` draws every empty state (a single line, `data-ligne="vide"`), `composants/ligne-erreur/` every error (a single line, its detail on hover, `data-ligne="erreur"`) and `composants/confirmation/` every inline confirmation. The class names stay in the markup as hooks only; `vue.css` holds no rule for them. The table is the state before.

The rules below each draw a « nothing here » line, under ten different class names (`.vide`, `.sans`, `.aucun`, `.aucune`, `.aucun-cook`, `.sans-geste`, `.sans-faits`, `.rien-ne-cuit`, `.rien-appris`, `.specialisations-aucune`); the list is not exhaustive. What they draw:

| Rule | Style | Capture |
|---|---|---|
| `#rail .stations-declarees .vide` (`vue.css:3272`) | italic, `--discret` | `cooks-stations-declarees-vide.png` |
| `#fiche .sans` (`4451`) | italic, `--discret` | `fiche.png` |
| `.reglages-station > .vide` (`7510`) | italic, `--discret`, margin 6px 16px 0 | `stations-reglages.png` |
| `.bloc-du-projet[data-bloc="station-locale"] > .vide` (`7714`) | `--discret`, margin 6px 0 0 16px | `stations-station-locale.png` |
| `#rail .colonne p.vide` (`6295`) | `--discret` | `rail-file.png` |
| `#etat .groupe > .vide` (`2182`) | `--discret`, margin 0 0 6px | `reglages-pc.png` |
| `#rail .station-de-cuisson .aucun-cook` (`3543`) | 12px, `--discret` | `cooks-github-stations.png` |
| `.courbe-cout .sans` (`1498`) | 12px, `--discret` | `cout.png` |
| `.etape-projet .aucun` (`7824`) | 13px, `--discret` | `ajout-station-sans-station.png` |
| `#rail .causes-fiabilite .sans` (`5399`) | 14px, `--discret` | `fiabilite.png` |
| `.alerte-cout.sans` (`5310`) | `--discret`, left border `--trait-fort` | `cout.png` |
| `#blocages-du-projet .sans-geste` (`538`) | `--texte-doux` | `projet-blocages.png` |
| `#rail .bloc-du-projet .etape-station .aucune` (`7488`) | `--texte-doux` | `ajout-station-sans-station.png` |
| `#etat .projets-servis .aucun` (`2347`) | `--jaune` | `reglages-pc.png` |
| `.carte .sans-faits` (`2608`) | `--jaune`, weight 600 | `projet-temps-vide.png` |
| `#rail > .rien-ne-cuit` (`3109`) | weight 600, margin 0 0 4px | `rail-file.png` |

### Colors, sizes and spacings outside the tokens

`app/src/vue/jetons.css` is the only file that defines tokens. Its header says it holds « les couleurs et les polices de l'app, et rien d'autre », and it defines: seven backgrounds, three strokes, four text colors, `--accent`, `--teinte`, seven state colors, the `--attend*` and `--bon*` colors, `--ombre`, two fonts, and three radii (`--rayon-carte` 10px, `--rayon-bouton` 8px, `--rayon-bon` 4px).

**Colors.** A search of `vue.css`, `autonomie/autonomie.css` and the `.js`/`.ts` files of `app/src/vue/` for hexadecimal, `rgb()` and `hsl()` values outside `jetons.css` finds none. Colors set from code come from `--teinte` and `--accent` (`vue.js:2617`, `2636`, `2644`, `8780`; `cost/courbe.js:115`), which `jetons.css` names as the two values that come from the projects file.

**Radii.** These values of `border-radius` are literals in `vue.css`, not one of the three radius tokens:

| Value | Where (`vue.css`) | Token it departs from | Capture |
|---|---|---|---|
| 12px | `#projets button` (153) | `--rayon-carte` (10px) / `--rayon-bouton` (8px) | `barre-des-projets.png` |
| 8px | `.bon .etiquette` (3858), `#fiche .panneau` (4380) | `--rayon-bouton` (8px: same value, the token is not used) | `rail-etiquettes.png`, `fiche.png` |
| 7px | `#projets .signal` (2558) | `--rayon-bouton` (8px) | `barre-des-projets.png` |
| 4px | `#temps-ticket-du-projet .temps-part` (469), `#machines > button` (1154) | `--rayon-bon` (4px: same value, the token is not used) | `projet-temps-normal.png`, `demenager-choix.png` |
| 3px | `#rail .panne-du-rail .marque` (2938), `#alertes .urgent` (4956) | `--rayon-bon` (4px) | `espace-projet.png` |
| 2px | `#projets button:is(.depot-avant, .depot-apres)::before` (198), `#rail .captures img` and `.place` (3944, 3955) | `--rayon-bon` (4px) | `barre-des-projets.png` |
| 1px | nine shape marks (`vue.css:1965`, `1969`, `2492`, `2496`, `3046`, `3758`, `3762`, `4266`, `4270`) | `--rayon-bon` (4px) | `espace-projet-etats-github.png`, `rail-backlog.png` |
| 999px | the toggle (`vue.css:287`, `297`), `.pilule` (2522), `#rail .bon .age`, `.prio` and `.etat-ticket.attendu` (4298, 4349, 4330) | none of the three | `reglages-pc.png`, `rail-file.png` |

**Font sizes.** `jetons.css` defines the two fonts and no size. `vue.css` and `autonomie/autonomie.css` use these `font-size` values (counts of declarations): 12px (155), 11px (33), 13px (33), 14px (26), 15px (12), 18px (9), 22px (4), 26px (3), 16px (3), 10px (2), and once each 9px, 12.5px, 17px, 20px, `0.92em` and `inherit`. The values outside that run of integers:

| Value | Where (`vue.css`) | Capture |
|---|---|---|
| 9px | `#projets .pastille` (2534) | `barre-des-projets.png` |
| 10px | `#projets .signal` (2554), `#rail .bon > .prio` (4345) | `barre-des-projets.png`, `rail-file.png` |
| 12.5px | `#toutes-les-stations .stations-du-compte .installer code` (6833) | `stations-du-compte-vide.png` |
| 16px | `.tete-cout .total.sans` (1244), `.courbe-cout p.sans` (1504), `#toutes-les-stations .ligne span.ouvrir` (6774) | `cout.png`, `tous-les-projets.png` |
| 17px | `#fiche .rendu h1` (4745) | `fiche.png` |
| 20px | `.tendances .rapport` (1362) | `cout.png` |
| 22px | `#temps-ticket-du-projet .temps-valeur` (453), `.perdus-cout .perdus-total` (5223) | `projet-temps-normal.png`, `cout.png` |
| 26px | `.tete-cout .total` (1237), `#rail .tete-fiabilite .total` (5375), `#rail .tete-closer .total` (5676) | `cout.png`, `fiabilite.png`, `closer.png` |

**Spacings.** `jetons.css` defines no spacing token (no `--espace*` or similar; it holds colors, fonts and radii), so there is no token to name. In `vue.css` and `autonomie/autonomie.css`, `padding` is declared 326 times with 97 distinct values, `gap` 317 times with 32 distinct values and `margin` 273 times with 38 distinct values. The most frequent `gap` values in `vue.css`: 8px (85), 6px (63), 10px (36), 4px (30), 12px (15), `4px 8px` (13), 2px (12). The most frequent `padding` values: `3px 10px` (15), `8px 12px` (11), `3px 12px` (11), `8px 16px` (9), `0 6px` (9), `4px 12px` (7), `10px 14px` (7). The `padding` of the buttons, with the line where each is declared in `vue.css`:

| Button (selector) | `padding` | Line |
|---|---|---|
| `#blocages-du-projet .gestes-du-blocage button` | 3px 12px | 549 |
| `#choix-du-projet .issue button` | 3px 12px | 630 |
| `:is([data-bloc="plafonds-duree"], [data-bloc="closer"]) .plafond .action > button` | 4px 14px | 7218 |
| `#stations-du-projet .parcours button:not(.recommande)` | 3px 10px | 812 |
| `.etape-station button:not(.aide)` | 4px 12px | 5083 |
| `.etape-recap button` | 4px 12px | 5144 |
| `#rail .closer-lancement .confirmation .reponses button` | 3px 10px | 5874 |
| `#rail .bon .confirmation > button` | 3px 8px | 4146 |
| `.choix-du-second button.choix` | 6px 10px | 6373 |
| `.geste-du-second button.geste` | 6px 10px | 6409 |
| `.confiance .lancer button` | 10px 16px, `min-height` 44px | 1062 (`min-height` 1061) |
| `#connexion-github .gestes button` | 8px 16px | 6167 |
| `#formulaire button` | 6px 12px | 2087 |
| `#machines > button` | 4px 10px | 1152 |

Captures: see the table of buttons above.

**Other departures from `jetons.css`.**

- The header of the state colors says « une couleur par mot des listes fermées (faits.ts), jamais sur un autre ». `--jaune` colors the no-data lines of `#etat .projets-servis .aucun` (`vue.css:2347`) and `.carte .sans-faits` (`2608`); `--orange` colors the fourth segment of `#temps-ticket-du-projet .temps-part` (`474`), next to `--bleu`, `--jaune`, `--vert` and `--gris` for the other four (`vue.css:466-475`). Capture: `projet-temps-normal.png`.
- `--orange` and `--accent` both hold `#f2994a` in `jetons.css`.
- `--ton`, a variable of the stylesheet, is declared six times in `vue.css`, not in `jetons.css`.

### Gestures living in different places from one screen to another

| Gesture | Where it lives, screen by screen | Capture |
|---|---|---|
| Removing something | A station: a « Remove » button in the edit form opened under its line, next to « Close », then a confirmation (`stations-declarees.js`). A station on a project: unticking the project, then a confirmation (`projet/stations/ReglagesStation.js`). A project: a row of Settings, « Remove this project from the app's sidebar » (`vue.js:2609`). A cleanup check: a « remove » button on the line in the health strip above the rail (`projet/bandeau-sante/Closer.js:239`). A ticket: « close issue #N on GitHub? » in the fiche (`vue.js:4281`) | `cooks-github-stations.png`, `stations-reglages.png`, `reglages-du-projet.png`, `projet-sante-closer.png`, `fiche.png` |
| Confirming | An inline block under the gesture with a title, one line of price and two answers (`confirmationDeGeste`, `briques.js:94`) for a station removal, the cleanup, the second's command, a ticket gesture, a ticket closing and the repository remedy. No confirmation for an answer to a TODO card (`carte-todo.js`: a click on a choice is the answer) or for the other rows of Settings | `second-geste-confirmation.png`, `closer-attente.png`, `projet-refuse-confirmer.png`, `todo-cartes-assignees.png` |
| Changing a setting | One row on every screen since #2920 (`rangeeDeReglage`, `composants/reglage/reglage.js`): its control applies as soon as it changes, with no « Save »; a setting kept in the project's repository says on its row that a change opens a pull request, and the row then shows the pull request it opened (`ditDuReglage`) | `reglages-pc.png`, `stations-reglages.png`, `projet-sante.png` |
| Switching on or off | The project switch sits at the head of the project space (`.interrupteur-de-tete`, `vue.css:287`) and the same `.bascule` is drawn in settings rows (`composants/reglage/reglage.css`); the kitchen stop is a row of Settings (`#arreter-cuisine`, `vue.css:3057`) | `espace-projet.png`, `reglages-pc.png` |
| Adding | A project: a « + » on the sidebar footer (`vue.js:8816`) and a form (`index.html`). A station: « Add a station » in the stations list (`projet/stations/ListeStations.js`) and in the add-project path (`projet/stations/AjoutStation.js`). A specialization and a cleanup check: a button in the block with its own « cancel » (`Specialisations.js:177`, `Closer.js:267`) | `barre-des-projets.png`, `onglet-stations-ajout.png`, `cooks-specialisation-ajout.png`, `projet-sante-closer-ajout.png` |
| Opening a detail | Folded rows with `<details>`/`summary` (14 lines mention `details` and 10 mention `summary` in the `.js` files, among them the second's gesture `VOIR` and the rail's plafond blocks); a click on the row itself to open the station page (`accueil/station/BlocDeLaStation.js`); a button with `aria-expanded` (`#alertes .ligne > button.detail`, `.geste-du-second button.geste`) | `second-geste.png`, `espace-projet-gestes.png`, `stations-grises.png` |
| Opening the editing of a station | A button in the station line of the Stations tab (the Cooks tab is gone, #2921) opens the form under the line (`stations-declarees.js`); on the Stations tab the settings of each station are already open (`projet/stations/ReglagesStation.js`) | `cooks-github-stations.png`, `stations-reglages.png` |
