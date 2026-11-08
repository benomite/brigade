# États non capturables

25 des 163 états de `scripts/capture-ecran/ecrans/` ne se capturent plus : l'étape de clic du script ne trouve plus son élément dans la vue. Ils n'ont donc pas de PNG ici.
Ni les états ni les scripts ne sont touchés par #2900 (décision du manager) : il faut un ticket à part pour les supprimer ou les réparer.

Constat : `node scripts/capture-ecran/capture.ts <état> /tmp/x.png`, sortie 1 pour chacun.

| État | Erreur |
|---|---|
| `ajout-projet-depot-a-preparer` | étape « cliquer #accueil-stations [data-station="e2d4"] button.ligne, #accueil-stations button.ligne[data-station="e2d4"] » : 0 élément(s) trouvé(s), il en faut un |
| `ajout-projet-depot-echec` | étape « cliquer #accueil-stations [data-station="e2d4"] button.ligne, #accueil-stations button.ligne[data-station="e2d4"] » : 0 élément(s) trouvé(s), il en faut un |
| `ajout-projet-depot-illisible` | étape « cliquer #accueil-stations [data-station="e2d4"] button.ligne, #accueil-stations button.ligne[data-station="e2d4"] » : 0 élément(s) trouvé(s), il en faut un |
| `ajout-projet-depot-preparation` | étape « cliquer #accueil-stations [data-station="e2d4"] button.ligne, #accueil-stations button.ligne[data-station="e2d4"] » : 0 élément(s) trouvé(s), il en faut un |
| `ajout-projet-depot-pret` | étape « cliquer #accueil-stations [data-station="e2d4"] button.ligne, #accueil-stations button.ligne[data-station="e2d4"] » : 0 élément(s) trouvé(s), il en faut un |
| `closer-lancer` | étape « cliquer .closer-lancement button.recommande » : 0 élément(s) trouvé(s), il en faut un |
| `closer-trouvailles` | étape « cliquer .closer-trouvailles .deplier » : 0 élément(s) trouvé(s), il en faut un |
| `cooks-plafond-reglage` | étape « cliquer #plafond-du-projet summary » : 0 élément(s) trouvé(s), il en faut un |
| `cout-perdus` | étape « cliquer .perdus-total » : 0 élément(s) trouvé(s), il en faut un |
| `fiche-priorite-echec` | étape « cliquer #fiche li[data-geste="priorite"] button » : 0 élément(s) trouvé(s), il en faut un |
| `fiche-priorite` | étape « cliquer #fiche li[data-geste="priorite"] button » : 0 élément(s) trouvé(s), il en faut un |
| `ratios` | étape « cliquer button[aria-label="the added / removed ratio of all projects"] » : 0 élément(s) trouvé(s), il en faut un |
| `station-appels-absents` | étape « cliquer #accueil-stations button.ligne » : 0 élément(s) trouvé(s), il en faut un |
| `station-connexion-max` | étape « cliquer #accueil-stations button.ligne » : 0 élément(s) trouvé(s), il en faut un |
| `station-dossiers` | étape « cliquer #accueil-stations button.ligne » : 0 élément(s) trouvé(s), il en faut un |
| `station-en-ligne` | étape « cliquer #accueil-stations button.ligne » : 0 élément(s) trouvé(s), il en faut un |
| `station-hors-ligne` | étape « cliquer #accueil-stations button.ligne » : 0 élément(s) trouvé(s), il en faut un |
| `station-mise-a-jour` | étape « cliquer #accueil-stations button.ligne » : 0 élément(s) trouvé(s), il en faut un |
| `station-projets-du-chef` | étape « cliquer #accueil-stations [data-station="e2d4"] button.ligne, #accueil-stations button.ligne[data-station="e2d4"] » : 0 élément(s) trouvé(s), il en faut un |
| `station-projets-recherche` | étape « cliquer #accueil-stations [data-station="e2d4"] button.ligne, #accueil-stations button.ligne[data-station="e2d4"] » : 0 élément(s) trouvé(s), il en faut un |
| `station-retrait` | étape « cliquer #accueil-stations button.ligne » : 0 élément(s) trouvé(s), il en faut un |
| `stations-du-compte-indisponible` | étape « cliquer #accueil-stations .enregistree[data-station="d4e5f6"] button.ligne, #accueil-stations button.ligne[data-station="d4e5f6"] » : 0 élément(s) trouvé(s), il en faut un |
| `stations-du-compte-ouverte` | étape « cliquer #accueil-stations .enregistree[data-station="a1b2c3"] button.ligne, #accueil-stations button.ligne[data-station="a1b2c3"] » : 0 élément(s) trouvé(s), il en faut un |
| `stations-une-liste-choisir` | étape « cliquer #accueil-stations button.ligne[aria-label^="macbook-air-de-benoit —"] » : 0 élément(s) trouvé(s), il en faut un |
| `stations-une-liste-ouverte` | étape « cliquer #accueil-stations [data-station="e2d4"] button.ligne, #accueil-stations button.ligne[data-station="e2d4"] » : 0 élément(s) trouvé(s), il en faut un |

## Captures retirées : elles ne montrent pas leur état

16 états se capturent (sortie 0) mais le PNG ne montre pas l'état que le script décrit : la vue a changé depuis l'écriture du script, et une étape de clic ou un onglet ne mène plus où elle allait. Ces PNG ont été retirés du dossier et de `index.html`. Comme les 25 ci-dessus, ils demandent un ticket à part pour être réparés ou supprimés : #2900 ne touche ni aux scripts ni aux états.

| État | Ce que le PNG montrait à la place |
|---|---|
| `closer`, `closer-attente`, `closer-derive`, `closer-en-cours`, `closer-finie`, `closer-refusee`, `closer-sans`, `fiabilite` | l'onglet Stations (« Station settings », « Local station »), pas l'onglet Cooks et son closer ; les 8 PNG étaient octet pour octet les mêmes |
| `demenager-refuse` | le Rail seul, sans la raison du refus (même image que `espace-projet`) |
| `espace-projet-ici` | le Rail, même image que `espace-projet` |
| `projet-temps-depasse`, `projet-temps-normal` | le Rail avec « Ticket time no measure yet », pas la médiane au-dessus du plafond ni sous le plafond |
| `stations-une-liste`, `stations-une-liste-vide`, `stations-du-compte`, `stations-du-compte-vide` | « Tous les projets » sans la liste de stations décrite (« no station » dans le tableau des projets) |

Les paires `mac`/`pc` (`demenager-sur-ce-*`, `mise-a-jour-*`, `nouvelle-version-*`) qui donnent un PNG identique sont gardées : la vue de ces états ne diffère pas à l'écran entre les deux postes (relu sur `demenager-sur-ce-mac` et `mise-a-jour-prete-mac`).
