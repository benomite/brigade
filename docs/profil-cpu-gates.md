# Profil CPU des gates

Les gates (`.claude/brigade/gates.sh`) se règlent au temps **processeur**, pas à l'horloge : l'horloge dépend de la charge de la box (plusieurs passages en même temps), le processeur presque pas. Cette page dit comment le mesurer, et garde la mesure de départ à laquelle comparer les tickets de réduction.

## Les scripts

Dans `scripts/mesure-cpu-gates/`. Aucun ne juge : ils impriment.

- `gates.sh [<worktree>]` — joue les gates en entier et imprime sur stdout une ligne `cpu_s=… utilisateur_s=… systeme_s=… horloge_s=… code=…`. Le code est celui des gates (un rouge est mesuré aussi). Les gates s'impriment sur stderr, lignes `MESURE` comprises. Les gates arrêtent la suite au bout de 300 s d'horloge : sur une box chargée, relève `BRIGADE_GATES_DELAI_TESTS` (par exemple `1200`), sinon la mesure est celle d'une suite coupée.
- `profil-par-fichier.sh [<worktree>] [runtime|app|tout]` — joue chaque fichier `test/**/*.test.ts` seul, l'un après l'autre, avec les options de `npm test` de sa zone. Imprime un TSV trié du plus coûteux au moins coûteux (`cpu_s utilisateur_s systeme_s horloge_s code fichier`) et, sur stderr, le total par zone. Les sorties des tests restent dans `<worktree>/.brigade-state/profil-cpu/`. Compte une trentaine de minutes sur une box chargée.
- `mesure.py` — l'outil des deux autres : lance une commande et lit `getrusage(RUSAGE_CHILDREN)`, c'est-à-dire le processeur de la commande et de tout ce qu'elle a lancé et attendu.

La mesure se lance **en arrière-plan**, sortie dans `.brigade-state/`, jamais en même temps qu'une autre.

## Mesure de départ

Prise sur la parade-box (8 cœurs), sur `v2` à `c3d5de2`, charge du poste de 19 à 28 pendant la mesure — d'autres cooks tournaient. Le processeur se compare d'une mesure à l'autre ; l'horloge, non.

| Mesure | Valeur |
|---|---|
| Gates complètes (`gates.sh`), vert | **999 s** de processeur (820 utilisateur + 178 système), 337 s d'horloge, 5095 tests |
| Somme des fichiers de tests joués seuls | 810 s de processeur : runtime 589 s (174 fichiers), app 221 s (140 fichiers) |

Les ~190 s restants entre les deux sont ce que le profil par fichier ne compte pas : les deux contrôles de types (`tsc`), `npm`, et les gates elles-mêmes. Une suite jouée par morceaux paie aussi son démarrage Node par fichier.

**Où va le processeur.** Dix fichiers font 315 s (39 % de la somme), vingt font 428 s (53 %), trente font 482 s (60 %) ; 65 fichiers sur 314 dépassent 2 s. Le reste est une longue traîne. Un fichier rouge au profil : `runtime/test/desinstallateur.test.ts` (code 1, 11 s) — il a échoué joué seul, pendant ce profil (cause non cherchée), et la suite des gates, elle, est restée verte.

Les vingt premiers fichiers (`cpu_s` = utilisateur + système) :

| cpu_s | horloge_s | fichier |
|---:|---:|---|
| 48.6 | 60.6 | `runtime/test/pass.test.ts` |
| 45.2 | 17.8 | `runtime/test/station.test.ts` |
| 35.2 | 17.8 | `runtime/test/main.test.ts` |
| 29.2 | 32.4 | `app/test/runner.test.ts` |
| 29.0 | 60.1 | `runtime/test/mise-a-jour/machine.test.ts` |
| 27.9 | 14.6 | `runtime/test/geste.test.ts` |
| 26.7 | 29.0 | `runtime/test/reaction.test.ts` |
| 25.7 | 43.2 | `runtime/test/installation.test.ts` |
| 24.8 | 20.9 | `runtime/test/exploitation-en-anglais.test.ts` |
| 22.4 | 7.2 | `app/test/projets/projets.test.ts` |
| 21.2 | 36.8 | `runtime/test/fusion.test.ts` |
| 13.8 | 9.2 | `runtime/test/station/main.test.ts` |
| 11.3 | 4.5 | `app/test/stations/stations.test.ts` |
| 11.2 | 16.5 | `runtime/test/servir.test.ts` |
| 11.0 | 11.2 | `runtime/test/desinstallateur.test.ts` |
| 9.6 | 14.8 | `runtime/test/paquet/paquet.test.ts` |
| 9.4 | 5.8 | `runtime/test/secrets-en-cuisine.test.ts` |
| 9.1 | 8.0 | `runtime/test/reprise-de-session.test.ts` |
| 8.7 | 16.6 | `runtime/test/manager.test.ts` |
| 8.3 | 6.7 | `runtime/test/station-decisions.test.ts` |

Le profil complet (314 lignes) se rejoue avec `profil-par-fichier.sh`.

## Lire une comparaison

- Compare `cpu_s` des gates, pas `horloge_s` ni `gates_s`.
- Rejoue la mesure de départ sur la même box avant de conclure : le processeur varie de quelques pour cent d'un passage à l'autre.
- Réduire l'horloge sans réduire le processeur (jouer les deux zones en même temps, par exemple) ne baisse pas le coût : sur une box où tourne plusieurs passages, il le rend seulement plus brusque.
