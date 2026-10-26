# Profil CPU des gates

Les gates (`.claude/brigade/gates.sh`) se règlent au temps **processeur**, pas à l'horloge : l'horloge dépend de la charge de la box (plusieurs passages en même temps), le processeur presque pas. Cette page dit comment le mesurer, comment comparer deux passages, et garde la mesure de départ.

## Reproduire

Un seul script, en arrière-plan (une quarantaine de minutes), sur un poste aussi calme que possible :

```sh
BRIGADE_GATES_DELAI_TESTS=1200 scripts/mesure-cpu-gates/mesure-cpu-gates.sh .brigade-state/mesure
```

L'argument est le dossier de sortie, facultatif (défaut : `<worktree>/.brigade-state/mesure-cpu-gates/`). `BRIGADE_GATES_DELAI_TESTS=1200` est déjà la valeur par défaut du script : les gates coupent leur suite à 300 s d'horloge, et sur un poste chargé une mesure coupée ne vaut rien. Le script ne modifie ni `gates.sh` ni aucun test. Il :

1. joue `.claude/brigade/gates.sh` une fois et écrit dans `mesure.txt` le CPU total (utilisateur, système, somme, process fils compris), l'horloge, le code des gates, la charge (`uptime`) et `nproc`, relevés avant et après chaque mesure ;
2. joue ensuite chaque fichier de test seul, runtime puis app, avec les options de `npm test` de sa zone et le reporter TAP. Il écrit `profil-cpu.tsv` (`cpu_s user_s sys_s horloge_s code fichier`, trié par `cpu_s` décroissant) et `tests.txt` ;
3. imprime le résumé et les 15 fichiers les plus coûteux.

`tests.txt` a une ligne par test : `fichier<TAB>nom complet` (les suites imbriquées jointes par ` > `), suivi de `<TAB>SKIP` si le test est sauté. Il est trié avec `LC_ALL=C sort`. Les sorties brutes sont dans `sorties/`. Les briques : `mesure.py` (CPU d'une commande via `getrusage(RUSAGE_CHILDREN)`) et `releve-tap.py` (relève les tests d'une sortie TAP).

## Comparer deux passages

Lance le script avant et après le changement, chacun dans son dossier, puis :

```sh
diff avant/tests.txt apres/tests.txt        # vide : exactement les mêmes tests, sautés compris
head -15 avant/profil-cpu.tsv apres/profil-cpu.tsv
cat avant/mesure.txt apres/mesure.txt       # CPU total, charge et nproc
```

`diff` vide veut dire qu'aucun test n'a disparu ni changé de nom, ni été sauté de plus. Compare le CPU (`cpu_s`), pas l'horloge ; rejoue la mesure de départ sur la même box avant de conclure, le CPU varie de quelques pour cent d'un passage à l'autre. Réduire l'horloge sans réduire le CPU (jouer les deux zones en même temps) ne baisse pas le coût.

## Mesure de départ

Prise sur `v2` à `6e165c3`, sur la parade-box, **nproc 8**. D'autres cooks tournaient pendant la mesure : la charge est celle relevée par le script.

| Mesure | Valeur |
|---|---|
| **Gates complètes, vert** | **1022.1 s de CPU** (837.9 utilisateur + 184.3 système), 429.8 s d'horloge |
| Charge avant les gates (1, 5, 15 min) | 20.00, 17.96, 20.85, nproc 8 |
| Charge après les gates (1, 5, 15 min) | 21.34, 18.23, 19.66, nproc 8 |
| Charge avant le profil par fichier | 21.34, 18.23, 19.66, nproc 8 |
| Charge après le profil par fichier | 22.99, 14.08, 16.43, nproc 8 |
| Somme des fichiers joués seuls, runtime | 727.8 s de CPU (247 fichiers) |
| Somme des fichiers joués seuls, app | 175.1 s de CPU (140 fichiers) |
| Tests relevés | 5097 dont 12 sautés |

Les fichiers joués seuls paient chacun leur démarrage de Node et ne comptent ni les contrôles de types ni les gates elles-mêmes : leur somme n'est pas celle des gates.

### Les 15 fichiers les plus coûteux

| cpu_s | horloge_s | fichier |
|---:|---:|---|
| 71.9 | 10.8 | `runtime/test/commandes.test.ts` |
| 46.0 | 19.1 | `runtime/test/station.test.ts` |
| 41.8 | 21.6 | `runtime/test/pass.test.ts` |
| 34.2 | 15.8 | `runtime/test/main.test.ts` |
| 27.6 | 9.2 | `runtime/test/geste.test.ts` |
| 27.2 | 52.4 | `runtime/test/mise-a-jour/machine.test.ts` |
| 26.0 | 11.7 | `app/test/runner.test.ts` |
| 24.3 | 31.6 | `runtime/test/installation.test.ts` |
| 22.4 | 17.2 | `runtime/test/exploitation-en-anglais.test.ts` |
| 20.5 | 4.0 | `app/test/projets/projets.test.ts` |
| 20.4 | 20.2 | `runtime/test/fusion.test.ts` |
| 20.1 | 8.5 | `runtime/test/reaction.test.ts` |
| 16.1 | 7.9 | `runtime/test/desinstallateur.test.ts` |
| 13.9 | 9.3 | `runtime/test/station/main.test.ts` |
| 11.4 | 5.9 | `app/test/stations/stations.test.ts` |

## Mesure après optimisation

Prise sur `v2` à `95a69d6` (après les optimisations #1635 et suivantes), sur la même box (la parade-box, **nproc 8**), avec le même script. Pour comparer à conditions égales, la mesure de départ a été **rejouée** juste après sur `6e165c3` (le script copié dans ce worktree, qui ne l'avait pas encore) : les deux passages se suivent, sur un poste peu chargé.

| Mesure | Départ (`6e165c3`, rejouée) | Après (`95a69d6`) |
|---|---|---|
| **CPU des gates complètes, vert** | **965.0 s** (795.3 utilisateur + 169.7 système) | **834.7 s** (658.1 utilisateur + 176.6 système) |
| Horloge des gates | 186.0 s | 163.4 s |
| Charge avant les gates (1, 5, 15 min) | 2.54, 3.82, 4.75, nproc 8 | 2.06, 4.08, 4.80, nproc 8 |
| Charge après les gates (1, 5, 15 min) | 12.43, 9.11, 6.78, nproc 8 | 11.23, 7.59, 6.06, nproc 8 |
| Somme des fichiers joués seuls, runtime | 610.5 s (248 fichiers) | 531.1 s (314 fichiers) |
| Somme des fichiers joués seuls, app | 148.7 s (141 fichiers) | 115.1 s (185 fichiers) |
| Tests relevés | 5115 dont 12 sautés | 6232 dont 15 sautés |

**Rapport : 834.7 / 965.0 = 0.865** : les gates coûtent 13,5 % de CPU de moins qu'au départ rejoué. Contre la première mesure de départ du tableau ci-dessus (1022.1 s, prise sur une box chargée à 20), le rapport est 834.7 / 1022.1 = 0.817 ; la mesure rejouée à charge faible est la comparaison honnête, et le CPU varie de quelques pour cent d'un passage à l'autre.

**Le CPU après, 834.7 s, n'est pas à environ 500 s ou moins : il en est loin, 334 s au-dessus.** L'objectif de l'épique #1314 n'est pas atteint. Il y a de plus 1117 tests de plus qu'au départ (les tickets fusionnés entre-temps en ont ajouté) : le coût par test a baissé plus que le coût total.

### Les 15 fichiers les plus coûteux, avant et après

Fichiers joués seuls, CPU en secondes (`cpu_s`, horloge entre parenthèses).

| Rang | Avant (`6e165c3`) | Après (`95a69d6`) |
|---:|---|---|
| 1 | 71.6 (11.0) `runtime/test/commandes.test.ts` | 30.6 (7.2) `runtime/test/main.test.ts` |
| 2 | 40.2 (14.0) `runtime/test/station.test.ts` | 23.2 (4.2) `runtime/test/commandes.test.ts` |
| 3 | 34.4 (15.7) `runtime/test/pass.test.ts` | 21.1 (9.8) `runtime/test/station.test.ts` |
| 4 | 31.1 (7.0) `runtime/test/main.test.ts` | 18.7 (10.8) `runtime/test/pass.test.ts` |
| 5 | 25.7 (5.5) `runtime/test/geste.test.ts` | 16.4 (9.0) `runtime/test/installation.test.ts` |
| 6 | 20.6 (8.2) `app/test/runner.test.ts` | 16.1 (6.4) `runtime/test/exploitation-en-anglais.test.ts` |
| 7 | 20.5 (25.5) `runtime/test/mise-a-jour/machine.test.ts` | 16.1 (7.6) `runtime/test/lectures-sous-condition.test.ts` |
| 8 | 20.2 (3.2) `app/test/projets/projets.test.ts` | 15.9 (23.9) `runtime/test/mise-a-jour/machine.test.ts` |
| 9 | 18.9 (8.0) `runtime/test/reaction.test.ts` | 13.6 (9.3) `runtime/test/station/main.test.ts` |
| 10 | 17.6 (9.6) `runtime/test/installation.test.ts` | 12.4 (5.7) `runtime/test/desinstallateur.test.ts` |
| 11 | 16.7 (7.2) `runtime/test/exploitation-en-anglais.test.ts` | 11.6 (4.7) `app/test/runner.test.ts` |
| 12 | 15.2 (7.9) `runtime/test/fusion.test.ts` | 9.4 (4.9) `runtime/test/reaction.test.ts` |
| 13 | 14.3 (6.6) `runtime/test/desinstallateur.test.ts` | 9.2 (2.0) `runtime/test/geste.test.ts` |
| 14 | 12.2 (9.0) `runtime/test/station/main.test.ts` | 9.1 (6.4) `runtime/test/fusion.test.ts` |
| 15 | 9.5 (2.6) `app/test/stations/stations.test.ts` | 7.0 (6.3) `runtime/test/bac-a-sable/configuration.test.ts` |

Les fichiers suivants, après : `runtime/test/paquet/paquet.test.ts` 6.4, `runtime/test/telephone/gestes.test.ts` 5.9, `runtime/test/servir.test.ts` 5.4, `runtime/test/depot.test.ts` 5.1, `runtime/test/bascule/machine.test.ts` 5.1, `runtime/test/closing/run.test.ts` 4.6. Le premier fichier a perdu plus de la moitié (`commandes.test.ts` 71.6 → 23.2), mais le coût est maintenant réparti sur plus de 300 fichiers : les 15 premiers ne pèsent que 230 s sur 646 s de CPU de fichiers joués seuls, et aucun d'eux ne suffit à ramener les gates à 500 s. Les 188 s d'écart entre les gates (834.7 s) et la somme des fichiers joués seuls (646.2 s) sont ce que cette mesure par fichier ne compte pas (contrôles de types, gates elles-mêmes) ; le démarrage de Node, lui, est compté dans chaque fichier.

### Résultat du `diff` des listes triées

`diff avant/tests.txt apres/tests.txt` **n'est pas vide** : 73 lignes retirées (`<`) et 1190 ajoutées (`>`), soit 5115 → 6232 tests relevés. Ce n'est pas un effet des optimisations de test seules : `v2` a reçu entre-temps des fonctionnalités avec leurs tests (111 fichiers de test nouveaux, 389 → 499 fichiers), et des tests ont été renommés ou réécrits avec elles. Un seul fichier a disparu : `app/test/interrupteur-manager.test.ts` (9 lignes retirées). Lignes retirées par fichier, les autres étant des tests renommés ou remplacés dans leur fichier : `app/test/faits.test.ts` 10, `app/test/bande-une-ligne.test.ts` 5, `runtime/test/limite-github.test.ts` 5, `app/test/vue/triage.test.ts` 4, `app/test/gestes.test.ts` 3, `app/test/projets/page-du-projet.test.ts` 3, `app/test/telephone/conversation.test.ts` 3, `runtime/test/rail.test.ts` 3, `app/test/couleurs.test.ts` 2, `app/test/ecrans-restants.test.ts` 2, `app/test/manager.test.ts` 2, `app/test/telephone/file.test.ts` 2, `app/test/terminaux.test.ts` 2, `runtime/test/gele.test.ts` 2, `runtime/test/manager-cli.test.ts` 2, et une ligne chacun pour `app/test/alertes`, `apprentissage`, `confirmation`, `gestes-ici`, `page-etroite`, `projets/projets`, `status-en-anglais`, `telephone/appairage`, `urgence`, `vue/activite-cuisine`, `runtime/test/closing/run`, `main`, `mise-a-jour/publications` et `runtime`. Les deux listes ne sont donc pas identiques : la comparaison de CPU ci-dessus est entre deux ensembles de tests différents, le second plus grand.
