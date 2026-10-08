# L'état de la cuisine — spec et plan (#18)

**Date** : 2026-10-08
**Statut** : en attente du chef — trois questions ouvertes en fin de document
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
| Tout l'affichage dérive du log | Aucune table d'affichage, aucun fichier lu hors `log.db`. Ce que le journal ne dit pas encore — le tick, la consommation d'un cook en cours — y entre comme **faits** : questions 1 et 2 |

## Ce que la commande montre

```
projet     brigade
runtime    en marche — pid 4211 sur parade-box, démarré le 2026-10-08T09:58:02.000Z
           dernier tick il y a 12 s (un toutes les 60 s)
cuisine    ouverte · disjoncteur fermé (1 échec d'affilée, ouverture à 3)

rail       1 pris · 1 en pass · 2 en attente · 1 servi · 1 86
  #14  pris        prio:1  par box/claude-opus depuis 4 min   Le rail porte les tickets
  #15  en pass     prio:1  depuis 40 s                        La station claude
  #18  en attente  prio:2  depuis 2 h 10                      La CLI d'état
  …

cooks      1 en cours
  #14  14-3f9a01bc  4 min sur 60 · 12 tours sur 100 · 184 000 tokens sur 2 000 000 (relevé il y a 20 s)

derniers événements
  10:04:11  #14  cook.launched   runtime                    {"run":"14-3f9a01bc",…}
  10:04:10  #14  ticket.taken    station:box/claude-opus    {"station":"box/claude-opus",…}
  …
```

- **Runtime** : en marche (session sans fin au journal), arrêté (`runtime.stopped`) ou jamais
  démarré. La ligne du tick est **toujours** affichée quand une session est ouverte : c'est elle
  qui révèle un runtime figé ou mort sans préavis. La commande montre l'âge et la cadence
  attendue ; elle ne conclut pas — « qui coince » est au jalon 6.
- **Rail** : le décompte par état, puis les tickets dans l'ordre de service. Les durées sont
  relatives à l'heure de la commande ; l'horodatage exact reste dans `run rail`.
- **Cooks** : un par lancement sans fin, avec son ticket et sa consommation face à ses plafonds.
- **Derniers événements** : les 15 derniers, le plus récent en haut, au format de `run journal`
  (le formateur est partagé, pas recopié). Les ticks n'y figurent pas : ils sont déjà dans
  l'en-tête, et un par minute noierait le reste.

`--suivre` affiche la photo, puis ajoute une ligne par événement nouveau, dans l'ordre du journal,
jusqu'à Ctrl-C. Avec un numéro de ticket, seuls les événements de ce ticket défilent. La veille est
celle du runtime : `PRAGMA data_version` chaque seconde, puis lecture des événements postérieurs
au dernier numéro de séquence affiché — rien n'est sauté, rien n'est affiché deux fois.

Erreurs, comme les autres commandes : `BRIGADE_STATE_DIR` absent ou argument inconnu → code 2 et
l'usage ; pas de journal, ou journal d'un runtime d'avant ces projections → code 1 et le motif.

## Modules

```
runtime/src/
  evenements/runtime.ts       + runtime.ticked                         (question 1)
  evenements/garde-fous.ts    + cook.progressed                        (question 2)
  projections/sessions.ts     + dernier tick de la session en cours
  projections/garde-fous.ts   + dernière mesure d'un cook en cours
  runtime.ts                  le tick s'écrit au journal avant de réveiller les écouteurs
  superviseur.ts              + mesure() : tours et tokens comptés jusqu'ici
  garde-fous.ts               au tick, une mesure par cook en cours
  ligne-evenement.ts          le formateur d'une ligne d'événement, sorti de relire.ts
  etat.ts                     compose la photo à partir des projections — fonction pure, horloge injectée
  status.ts                   `npm run status` : arguments, affichage, suivi
```

Aucune table nouvelle hors des colonnes ajoutées aux deux projections existantes, qui se
recalculent du journal comme le reste.

## Frontières

- **#15 (station claude)** : `status` n'a pas besoin qu'un vrai cook existe ; les tests passent par
  le lancement gardé et le faux `claude`. Fichiers partagés attendus : `package.json` (une ligne de
  script) et `docs/runtime.md` (une section). Si la question 2 est tranchée (a), #18 touche aussi
  `superviseur.ts` et `garde-fous.ts` — une méthode et un écouteur de tick, sans changer ce que #15
  appelle.
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

## Questions ouvertes

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

Sous-question si (a) ou (c) : `run journal` sans argument **masque-t-il les ticks** par défaut ?
Recommandé : oui, sinon la recette du chef se lit mal ; `status` les résume déjà.

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

Hypothèse retenue faute d'avis contraire : `npm --prefix runtime run status`, et
`… run status -- --suivre [<ticket>]`, dans la lignée de `journal`, `rail` et `garde-fous`. La spec
de stack parle de `brigade status` : un vrai binaire `brigade` qui regrouperait les quatre
commandes serait un autre ticket.
