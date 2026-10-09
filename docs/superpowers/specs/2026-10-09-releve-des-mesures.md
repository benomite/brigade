# Le relevé des mesures — spec (#163)

**Date** : 2026-10-09
**Statut** : **proposé, non validé** — six questions au chef, en fin de document. Pas de plan ni de
code avant sa réponse.
**Issue** : #163 « Voir la dérive avant qu'elle fasse mal : le relevé des mesures »
**S'appuie sur** : `2026-10-08-brigade-v2-design.md` (§La fermeture, principe 5),
`2026-10-08-runtime-status.md` (la commande de lecture dont celle-ci reprend la forme),
`2026-10-08-garde-fous.md` (les mesures d'un cook, les réglages écrits au journal). Ce document ne
redécide rien de ce qui y figure.

---

## Ce que #163 livre

Une commande de lecture, `npm --prefix runtime run mesures`, qui met côte à côte dans le temps ce
que le journal sait de la lourdeur du projet, et une ligne dans `status` quand une mesure a franchi
un seuil déclaré. Elle ne range rien : le closer est hors scope.

| Critère de l'issue | Ce qui le porte |
|---|---|
| Les mesures **dans le temps** | Une ligne par **tranche de merges**, la plus récente en bas, et une ligne de pente (de la première tranche montrée à la dernière) |
| Dérivées du journal ou du dépôt, jamais stockées en double | Tout est lu dans `log.db`. Ce que le journal ne disait pas encore y entre comme **champs de faits existants** (ci-dessous), pas dans une table de relevés écrite à part |
| Lisible sans outil | `run mesures`, en lecture seule, sur le modèle de `run status` |
| Un seuil franchi est signalé sans qu'on le demande | Un bloc `dérive` dans `status`, absent quand il n'y a rien à dire |
| Le temps d'un cook présenté avec prudence | Pas de « temps moyen à livrer » : la **part des gates** dans le temps d'une livraison, et les **tours médians par calibrage** |
| N'estime pas ce qu'il ne sait pas | Seuls les cooks du journal sont comptés ; une mesure absente s'affiche `—`, jamais zéro ; rien sur le compte Max |

## Ce que le journal sait déjà, et ce qui lui manque

| Mesure | Au journal aujourd'hui ? | Ce que #163 ajoute |
|---|---|---|
| tours, tokens, durée d'un cook | oui — `cook.exited` (`turns`, `tokens`, `durationMs`), calibrage dans `cook.launched` | rien |
| merges | oui — `merge.done` | rien |
| temps des gates | **non** — `gates.sh` l'imprime, `Gates` ne garde que verdict, lignes `FAIL` et fin de sortie | `Gates.durationMs` : l'horloge de `jouerGates`, mesurée par le runtime |
| nombre et durée de la suite de tests | **non** — la sortie des tests est jetée quand ils sont verts | `Gates.measures` : ce que les gates **déclarent** (contrat ci-dessous) |
| taille du dépôt, taille du contexte | **non** | `pass.judged.measures` : mesurées par le runtime dans le worktree de la livraison jugée |

Les trois ajouts sont des champs **facultatifs** de faits existants (`pass.judged`, `pass.replayed`,
`base.checked`) : un journal d'avant #163 se relit tel quel, et ses livraisons affichent `—`.

### Le contrat des mesures de gates

Le runtime ne sait pas ce qu'est un test : c'est le projet qui le sait. Les gates peuvent donc
imprimer, sur leur sortie, des lignes

```
MESURE  <nom>=<nombre>
```

que `jouerGates` relève comme il relève déjà les lignes `FAIL`. Deux noms sont connus du relevé :
`tests` (leur nombre) et `tests_s` (la durée de la suite, en secondes). Tout autre nom est gardé au
journal et montré tel quel par `run mesures -- --tout`. Des gates qui n'impriment rien restent
valides : la colonne affiche `—`.

`.claude/brigade/gates.sh` de ce dépôt imprime les deux, tirées du résumé de `node --test`
(`ℹ tests`, `ℹ duration_ms`), ainsi que `gates_cpu_s` — le temps processeur qu'il calcule déjà pour
son plafond.

### La taille du contexte chargé — définition proposée

Le PO l'a laissée « à définir ». Ce qu'un cook charge **à coup sûr** est écrit dans
`docs/runtime.md` (« Ce qu'un cook charge ») : sa consigne, et le `CLAUDE.md` du dépôt qu'elle
l'envoie lire. Le reste — la doc qu'il choisit d'ouvrir — n'est pas connu sans dépouiller son flux.

Deux mesures distinctes, donc, plutôt qu'une estimation :

- **`contexte`** : octets du `CLAUDE.md` à la racine du dépôt servi, plus ceux des fichiers qu'il
  importe par `@chemin`, transitivement. C'est la taxe certaine, payée à chaque cook.
- **`doc`** : octets des fichiers `*.md` suivis par git, `CLAUDE.md` compris. C'est ce qu'un cook
  **peut** être amené à lire, et c'est la mesure du déclencheur « la doc a grossi de X % » de la
  spec. Elle n'est pas présentée comme lue.

En octets, pas en tokens : le runtime ne sait pas compter des tokens sans appeler un modèle.

**`dépôt`** : octets des fichiers suivis par git dans le worktree (`git ls-tree -r -l HEAD`), donc
sans dépendances ni builds.

## Ce que la commande montre

```
relevé     brigade — 62 merges au journal, par tranches de 10 (la dernière en compte 2)
           62 merges depuis la dernière fermeture (aucune au journal) · 62 depuis le dernier regard sécurité (aucun au journal)

merges     jusqu'au     tests   suite    gates   part gates   dépôt     contexte   doc
 1-10      2026-10-08     203   1,1 s     9 s        4 %      1,2 Mo     6,1 ko    212 ko
11-20      2026-10-08     287   1,9 s    11 s        5 %      1,5 Mo     6,1 ko    268 ko
…
61-62      2026-10-09     622   6,2 s    21 s       11 %      2,9 Mo     9,4 ko    511 ko
pente                    ×3,1   ×5,6    ×2,3                  ×2,4       ×1,5      ×2,4

cooks      tours médians par calibrage (cooks de tickets mergés, relectures et jugements exclus)
merges     opus/high    sonnet/low   sonnet/medium
 1-10      31 (4)       12 (5)       —
…
61-62      58 (1)       —            22 (1)

seuils     tests 622 pour un seuil de 500 — FRANCHI
           suite 6,2 s pour un seuil de 10 s
```

- **Une tranche** vaut ce que portait la **dernière** livraison mergée de la tranche (tests, suite,
  dépôt, contexte, doc : des états), et la **médiane** de ses livraisons pour ce qui se répète
  (gates, part gates, tours). Entre parenthèses, le nombre de cooks derrière une médiane : une
  médiane sur un cook n'en est pas une, et le chef doit le voir.
- **Part gates** : durée des gates d'une livraison, rejeux compris, rapportée à cette durée plus
  celle de ses cooks. C'est le remplaçant du « temps à livrer » brut.
- **Calibrage** : `model/effort` du `cook.launched`. C'est la seule taille de ticket que le journal
  porte — le manager calibre selon ce qu'il juge du ticket.
- **Fermeture, regard sécurité** : aucun fait ne les porte encore ; les deux compteurs partent du
  début du journal, et le disent. Ils se recaleront quand le closer écrira le sien.
- `-- --par <n>` règle la taille d'une tranche (10 par défaut) ; `-- --tout` ajoute les mesures de
  gates que le relevé ne connaît pas.

Erreurs, comme `status` : `BRIGADE_STATE_DIR` absent ou argument inconnu → code 2 et l'usage ;
journal absent ou d'avant ces projections → code 1 et le motif.

## Les seuils

Déclarés dans l'environnement du runtime, comme les plafonds des garde-fous, et écrits au journal
quand ils changent (`drift.configured`) : `status` et `mesures` les lisent là, sans variable à
repasser à chaque appel. **Aucun défaut** : un seuil non déclaré ne signale rien.

| Variable | Seuil sur |
|---|---|
| `BRIGADE_DRIFT_TESTS` | le nombre de tests |
| `BRIGADE_DRIFT_TESTS_SECONDS` | la durée de la suite |
| `BRIGADE_DRIFT_GATES_SECONDS` | la durée des gates |
| `BRIGADE_DRIFT_CONTEXT_KB` | la taille du contexte |
| `BRIGADE_DRIFT_REPO_MB` | la taille du dépôt |
| `BRIGADE_DRIFT_MERGES` | les merges depuis la dernière fermeture |
| `BRIGADE_DRIFT_GROWTH_PERCENT` | la croissance de **toute** mesure d'état sur les 10 derniers merges — la pente, pas le point |

Le franchissement n'est pas un fait écrit : il se **déduit**, à la lecture, de la dernière
livraison mergée et des seuils en vigueur. `status` gagne un bloc, absent quand rien n'est franchi :

```
dérive     tests 622 pour un seuil de 500 · contexte +54 % en 10 merges pour un seuil de 30 % — `run mesures`
```

Rien n'alerte hors de `status`, comme pour la sauvegarde.

## Modules

```
runtime/src/
  evenements/pass.ts          Gates + durationMs?, measures? ; pass.judged + measures?
  evenements/derive.ts        drift.configured (les seuils en vigueur)
  gates.ts                    chronomètre le passage, relève les lignes MESURE
  depot.ts                    + poids(worktree) : dépôt, contexte, doc — seul module qui lance git
  pass.ts                     joint les mesures du worktree au verdict
  derive.ts                   lit les seuils de l'environnement, les écrit au journal quand ils changent
  projections/mesures.ts      table delivery_measures : une ligne par livraison jugée, marquée à son merge
  mesures.ts                  tranches, médianes, pentes, seuils franchis — fonctions pures, heure injectée
  montrer-mesures.ts          `npm run mesures` : arguments, affichage
  etat.ts                     + le bloc `dérive`
  main.ts                     branche les seuils
.claude/brigade/gates.sh      imprime MESURE tests, tests_s, gates_cpu_s
docs/runtime.md               + « Le relevé des mesures », le bloc `dérive` de `status`, les variables
```

`runtime/src/station.ts` n'est pas touché (#143).

## Frontières

- **Les gates jouées hors du runtime** — par un dev de la V1, par le hook d'arrêt — n'écrivent pas
  au journal : le relevé ne voit que les livraisons que la pass a jugées. La dérive de ce dépôt-ci
  (203 → 622 tests) s'est produite sous la V1 : le relevé ne l'aurait montrée que servie par le
  runtime.
- **Hors scope**, comme le dit l'issue : le closer, les effets d'une fermeture, la couverture (le
  garde-fou des KPI du closer), la consommation du compte Max (#63).
- **Tests** : sur un journal écrit à la main, sans cuisine ni `git` au-delà de `depot.test.ts` —
  les gates sont à 50 s de processeur sur 75.

## Questions au chef

1. **L'axe du temps.** Proposé : des tranches de **merges** (10 par défaut), parce que c'est le
   projet qui avance, pas l'horloge — une semaine sans service ne doit pas faire une ligne vide.
   Ou préfères-tu des jours ?
2. **La taille du contexte.** Proposé : deux mesures, `contexte` (`CLAUDE.md` et ses imports — la
   taxe certaine) et `doc` (tout le markdown suivi — ce qui peut être lu), en octets. Ou veux-tu
   la doc **réellement lue**, dépouillée du flux de chaque cook (plus juste, nettement plus lourd) ?
3. **Où tombe le signal.** Proposé : un bloc `dérive` dans `status`, rien d'autre — comme la
   sauvegarde trop vieille. Ou faut-il qu'il te parvienne sans que tu regardes (une issue ouverte
   par le runtime, par exemple) ?
4. **Seuils absolus, pente, ou les deux.** Proposé : les deux, sans aucun défaut. Le triplement de
   la suite n'aurait été vu par un plafond que s'il avait été déclaré avant ; la pente
   (`BRIGADE_DRIFT_GROWTH_PERCENT`) l'aurait vu sans rien connaître du projet.
5. **« Ticket de taille comparable ».** Proposé : même calibrage (`model/effort`), seule taille que
   le journal porte. Suffisant ?
6. **Le contrat `MESURE` des gates.** Il étend ce que V1 demande à un `gates.sh` (facultatif, rien
   ne casse sans lui). D'accord pour que ce dépôt l'adopte dans `.claude/brigade/gates.sh` — une
   livraison qui touche ses propres juges ?
