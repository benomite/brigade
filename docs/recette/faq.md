# FAQ — La recette

## Qu'est-ce que la recette ?

La **recette** est le processus d'orchestration qui exécute les tickets d'un projet brigade. C'est un système entièrement automatisé, piloté par un runtime Node.js (brigade V2), qui gère des **cooks** — des agents Claude qui implémentent les tickets dans des **worktrees isolés**. Contrairement au protocole manuel des versions antérieures, la recette V2 ne s'arrête jamais pour attendre des instructions : elle tourne en boucle, servit un ticket à la fois, juge ce qui a été livré, intègre automatiquement les PR vertes, et enchaîne sans intervention.

La recette porte trois responsabilités : **tenir le journal** (une liste d'ajout seul de tous les événements), **gérer le rail** (la file des tickets ouverts), et **automatiser les trois étapes** que les anciennes versions demandaient à la main — spawn d'un cook, jugement des gates à la livraison, et merge si tout est vert.

## Comment fonctionne le cycle de vie d'un ticket ?

Un ticket passe par quatre états visibles :

1. **En attente** — le ticket porte le label `fire`, il est sur le rail, en attente d'être pris. La station (le process qui distribue le travail) prend le plus prioritaire dès qu'elle peut servir.

2. **Pris** — la station l'a confié à une instance de `claude` (`cook`), qui crée un worktree isolé (numéro + slug du ticket) et implémente. Le ticket reste pris tant que le cook progresse observable — soit une écriture dans le worktree, soit du temps qui passe sans dépasser le bail (30 min par défaut).

3. **En pass** — le cook a poussé sa PR et signalé `prêt`. La **pass** (le reviewer automatisé) rejoue les gates du projet sur la branche du cook, puis les gates de merge. Vert → merge + push + close. Rouge → findings renvoyés.

4. **Servi** — mergé. La pass ferme l'issue GitHub, elle quitte le rail au sondage suivant.

Un ticket peut aussi être **BLOQUÉ** s'il attend un autre ticket qui a échoué, ou **86** si la station peut't le servir (quota épuisé, problème de setup).

## Qu'est-ce que le journal, le rail, et comment regarder l'état ?

- **Le journal** (`$BRIGADE_STATE_DIR/log.db`) est une liste d'ajout seul de tous les événements du projet : ticket pris, cook progressed, gates jouées, merge effectué, runtime réveillé. Pas d'effacement, pas de modification — tout ce qui s'est passé est là.

- **Le rail** est la file de travail du projet. Elle porte les issues GitHub qui ont le label `fire`. Enlever le label = reprendre un ticket (il sortira du rail). Poser le label = le ticket entre au sondage suivant.

- **Relire le journal** (pendant que le runtime tourne) :
  ```bash
  npm --prefix runtime run journal -- 13       # tout ce qui est arrivé au ticket #13
  npm --prefix runtime run journal             # tout le journal, sans les battements
  npm --prefix runtime run journal -- --ticks  # tout le journal, avec les battements
  ```

- **Voir le rail et les cooks en cours** :
  ```bash
  npm --prefix runtime run rail         # l'ordre de service
  npm --prefix runtime run status       # quel cook tourne, depuis quand, sur quoi
  ```

Le runtime se réveille toutes les 60 secondes (un tick) : il relève le progès observable des cooks, sonde GitHub pour détecter les PR fermées ou les tickets relabelisés, rejoue les gates et éventuellement merge, et spawne le ticket prêt suivant. C'est ce rythme qui maintient le système en mouvement.
