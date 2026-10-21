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
