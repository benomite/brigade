# L'état de la cuisine — spec et plan (#18)

**Date** : 2026-10-08
**Statut** : validé le 2026-10-08 — le chef a tranché (a) aux questions 1 et 2, masquage des ticks compris, et accepté la forme de la question 3
**Issue** : #18 « Le chef voit l'état de la cuisine sans ouvrir la base »
**S'appuie sur** : `2026-10-08-runtime-stack.md` (§2 réveil, §3 projections, §6 `brigade status`),
`2026-10-08-runtime-journal.md` (règle d'extension), `2026-10-08-runtime-rail.md` et
`2026-10-08-garde-fous.md`. Ce document ne redécide rien de ce qui y figure.

---

## Ce que #18 livre

Une commande de lecture, pour un projet — c'est-à-dire pour un répertoire d'état. Juste assez pour
piloter le jalon 1 : pas un tableau de bord.

| Critère de l'issue | Ce qui le porte |
|---|---|
| Les tickets par état, les cooks actifs avec leur ticket et leur budget consommé, les derniers événements | `npm --prefix runtime run status` : une photo, lue dans les projections du rail, des garde-fous et des sessions, et dans la table des événements |
| Elle répond tout de suite, même pendant que des cooks tournent | Journal ouvert en lecture seule : en mode WAL un lecteur n'attend jamais l'écrivain, et ne le bloque pas |
| Le chef peut suivre le log en direct, du rail au verdict | `status -- --suivre [<ticket>]` : la photo, puis chaque événement à mesure qu'il s'écrit, vu par `PRAGMA data_version` |
| Tout l'affichage dérive du log | Aucune table d'affichage, aucun fichier lu hors `log.db`. Ce que le journal ne disait pas encore — le tick, la consommation d'un cook en cours — y entre comme **faits** : `runtime.ticked` et `cook.progressed` |

## Ce que la commande montre

L'exemple de sortie et la lecture de chaque bloc sont dans `docs/runtime.md`, « L'état de la cuisine ».

- **Runtime** : en marche (session sans fin au journal), arrêté (`runtime.stopped`) ou jamais
  démarré. La ligne du tick est **toujours** affichée quand une session est ouverte : c'est elle
  qui révèle un runtime figé ou mort sans préavis. La commande montre l'âge et la cadence
  attendue ; elle ne conclut pas — « qui coince » est au jalon 6.
- **Rail** : le décompte par état, puis les tickets dans l'ordre de service. Les durées sont
  relatives à l'heure de la commande ; l'horodatage exact reste dans `run rail`.
- **Cooks** : un par lancement sans fin, avec son ticket et sa consommation face à ses plafonds.
- **Derniers événements** : les 15 derniers, dans l'ordre du journal — le plus récent en bas, là où
  le suivi enchaîne —, au format de `run journal` (le formateur est partagé, pas recopié). Ni les
  ticks ni les relevés des cooks n'y figurent : l'en-tête et la ligne de chaque cook les résument,
  et un par minute noierait le reste.

`--suivre` affiche la photo, puis ajoute une ligne par événement nouveau, dans l'ordre du journal,
jusqu'à Ctrl-C. Avec un numéro de ticket, seuls les événements de ce ticket défilent. Les relevés
des cooks défilent (c'est le signe de vie d'un cook qu'on suit), les ticks non. La veille est celle
du runtime, en plus serré : `PRAGMA data_version` quatre fois par seconde, puis lecture des
événements postérieurs au dernier numéro de séquence lu — rien n'est sauté.

Erreurs, comme les autres commandes : `BRIGADE_STATE_DIR` absent ou argument inconnu → code 2 et
l'usage ; pas de journal, ou journal d'un runtime d'avant ces projections → code 1 et le motif.

## Modules

```
runtime/src/
  evenements/runtime.ts       + runtime.ticked (`intervalMs` : la cadence attendue)
  evenements/garde-fous.ts    + cook.progressed (`run`, `turns`, `tokens`)
  projections/sessions.ts     + table runtime_tick : le dernier tick
  projections/garde-fous.ts   + table cook_progress : le dernier relevé de chaque cook
  journal.ts                  + les N derniers événements, le dernier numéro de séquence
  relire.ts                   masque les ticks sans argument ; `--ticks` les montre
  runtime.ts                  le tick s'écrit au journal avant de réveiller les écouteurs
  superviseur.ts              + mesure() : tours et tokens comptés jusqu'ici
  garde-fous.ts               au tick, une mesure par cook en cours
  ligne-evenement.ts          le formateur d'une ligne d'événement, sorti de relire.ts
  etat.ts                     lit l'état dans les projections, le décrit ligne par ligne (heure injectée), suit le journal
  status.ts                   `npm run status` : arguments, affichage, signaux
```

Les deux tables nouvelles appartiennent aux projections existantes et se recalculent du journal
comme le reste. Des tables plutôt que des colonnes : `CREATE TABLE IF NOT EXISTS` les pose sur un
journal déjà en service, là où une colonne ajoutée ne le serait pas.

## Frontières

- **#15 (station claude)** : `status` n'a pas besoin qu'un vrai cook existe ; les tests passent par
  le lancement gardé et le faux `claude`. Fichiers partagés attendus : `package.json` (une ligne de
  script) et `docs/runtime.md` (une section). #18 touche aussi `superviseur.ts` et `garde-fous.ts`
  — la méthode `mesure()` et le relevé au tick, rien d'autre, sans changer ce que #15 appelle.
- **Hors scope**, comme le dit l'issue : multi-projets, direct d'un cook, accès web, détection de
  « qui coince » et alertes.

## Plan

TDD, un test rouge avant chaque pas.

1. `ligne-evenement.ts` extrait de `relire.ts`, sans changer une sortie.
2. Le tick au journal et dans la projection des sessions (selon question 1).
3. La mesure d'un cook en cours au journal et dans la projection des garde-fous (selon question 2).
4. `etat.ts` : la photo, testée sur des journaux construits à la main.
5. `status.ts` : photo, puis `--suivre`, testés dans un vrai process pendant qu'un autre écrit.
6. `docs/runtime.md` : la commande, sa lecture, deux lignes de recette.

## Questions tranchées — (a), (a), forme acceptée, le 2026-10-08

### 1. D'où vient l'âge du dernier tick ?

Aujourd'hui le tick réveille le runtime mais **n'écrit rien** : le journal ne peut pas dire quand
il a eu lieu.

- **(a) Un fait `runtime.ticked` par tick** — recommandé. Seule option où l'âge dérive vraiment
  du log. Coût : une ligne par minute, soit 1 440 par jour et de l'ordre de 50 Mo par an et par
  projet dans un journal qui ne s'efface pas, rejouées à chaque démarrage. `run journal` sans
  argument les afficherait.
- **(b) Un battement hors journal** : une ligne unique, réécrite à chaque tick, dans `log.db`.
  Aucun volume, mais c'est un état qui ne dérive pas du log — l'exception que l'issue interdit.
- **(c) Un tick journalisé toutes les N minutes** (5 ?) : cinq fois moins de lignes, un runtime
  figé vu cinq fois plus tard.

Sous-question tranchée : `run journal` sans argument masque les ticks ; `--ticks` les montre.

### 2. Que vaut « budget consommé » pour un cook encore en cours ?

Le journal ne connaît tours et tokens qu'à la fin (`cook.exited`). Pendant le cook, seule la
**durée** se déduit (heure − `cook.launched`) ; le compte vit dans la mémoire du superviseur.

- **(a) Un fait `cook.progressed` par cook en cours, à chaque tick** (`run`, `turns`, `tokens`) —
  recommandé. Le chef voit tours et tokens avec une minute de retard au plus, et l'âge du relevé
  est affiché. Coût : une ligne par minute et par cook actif ; touche `superviseur.ts` et
  `garde-fous.ts`, voisins de #15.
- **(b) La durée seule** au jalon 1, face aux trois plafonds ; tours et tokens n'apparaissent qu'à
  la fin. Rien à écrire de plus, mais un cook qui brûle ses tokens ne se voit pas avant son arrêt.
- **(c) Lire `runs/<run>.jsonl`** pour recompter en direct : exact à la seconde, mais c'est
  calculer ailleurs que dans le log — écarté par l'issue.

### 3. Forme de la commande

Retenu : `npm --prefix runtime run status`, et
`… run status -- --suivre [<ticket>]`, dans la lignée de `journal`, `rail` et `garde-fous`. La spec
de stack parle de `brigade status` : un vrai binaire `brigade` qui regrouperait les quatre
commandes serait un autre ticket.
