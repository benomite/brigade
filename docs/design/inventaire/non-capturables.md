# États non capturables

26 des 164 états de `scripts/capture-ecran/ecrans/` ne se capturent plus : l'étape de clic du script ne trouve plus son élément dans la vue. Ils n'ont donc pas de PNG ici.
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
| `merge-accorder` | étape « cliquer #interrupteur-merge .bascule » : 0 élément(s) trouvé(s), il en faut un |
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
