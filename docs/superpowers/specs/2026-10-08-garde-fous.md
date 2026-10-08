# Garde-fous — spec et plan (#16)

**Date** : 2026-10-08
**Statut** : brouillon — attend les réponses du chef aux questions de fin de document
**Issue** : #16 « Les garde-fous arrêtent un cook qui part en vrille »
**S'appuie sur** : `2026-10-08-runtime-stack.md` (§2 réveil, §4 arrêt, inactivité, plafonds) et
`2026-10-08-runtime-journal.md` (règle d'extension). Ce document ne redécide rien de ce qui y
figure.

---

## Ce que #16 livre

La supervision mécanique d'un cook, **avant** qu'un vrai cook existe (#15) : le code de #16
surveille un sous-processus quelconque. Les tests le pilotent avec un faux `claude`
(`BRIGADE_CLAUDE_BIN`) ; aucun quota n'est consommé.

| Critère de l'issue | Ce qui le porte |
|---|---|
| Un plafond par ticket (tours, durée, tokens) existe et le chef peut le voir | Les plafonds sont écrits dans le fait de lancement du cook ; surface de lecture : **question 6** |
| Un cook qui dépasse son plafond est arrêté ; le ticket retourne en attente avec la raison au log | Le superviseur compte dans le flux, arrête le groupe de process, journalise l'arrêt et son motif sur le ticket |
| Un cook muet depuis N minutes est détecté et arrêté | Minuterie remise à zéro par chaque ligne du flux |
| Après N échecs d'affilée, le runtime cesse de lancer des cooks et le dit au chef | Disjoncteur : une projection du journal, consultée par le lancement lui-même |
| Une commande « stop » arrête tous les cooks, immédiatement | La CLI écrit le fait dans le journal ; le runtime le voit en ≤ 1 s (veille du journal) |
| Chaque arrêt est journalisé avec son motif | Un fait par arrêt, porté par le ticket : il se relit avec `npm run journal -- <ticket>` |

## Modules

Conformément à la règle d'extension de #13 : un fichier par domaine, une ligne dans
`evenements.ts` et dans `projections.ts`.

```
runtime/src/
  evenements/garde-fous.ts    les faits du domaine
  projections/garde-fous.ts   cooks en cours, disjoncteur, arrêt demandé
  superviseur.ts              lance un sous-processus dans son groupe, lit son flux, compte, arrête
  garde-fous.ts               branche le tout sur le runtime : lancement gardé, écoute du « stop »
  plafonds.ts                 lecture des plafonds dans l'environnement, valeurs par défaut
  garde-fous-cli.ts           `npm run garde-fous` : voir, stop, reprendre (selon la question 6)
runtime/test/
  aides/faux-claude.ts        doublure : muet, bavard sans fin, petit-enfant sourd à SIGTERM
```

## Faits journalisés

| Fait | Auteur | Ticket | Charge utile |
|---|---|---|---|
| `cook.launched` | `runtime` | oui | `run`, `pid`, `limits` (`turns`, `durationMs`, `tokens`, `idleMs`), `stream` (chemin de `runs/<run>.jsonl`) |
| `cook.exited` | `runtime` | oui | `run`, `code`, `signal`, `turns`, `tokens`, `durationMs` — la fin du process, quelle qu'en soit la cause |
| `guard.tripped` | `runtime` | oui | `run`, `reason` (`turns` \| `duration` \| `tokens` \| `idle` \| `stop`), `limit`, `observed` — **le motif de l'arrêt** |
| `cook.interrupted` | `runtime` | oui | `run` — écrit au démarrage pour un lancement sans fin (le cook est mort avec le runtime) |
| `kitchen.stopped` | `chef` | non | — la commande « stop » |
| `kitchen.resumed` | `chef` | non | — la commande « reprendre » |
| `breaker.opened` | `runtime` | non | `failures`, `threshold` |

L'intention et le résultat s'écrivent en deux temps (§2 de la stack) : `cook.launched` avant de
compter quoi que ce soit, `cook.exited` à la mort du process. `guard.tripped` s'écrit **avant**
le signal : si le runtime meurt entre les deux, le motif est déjà au journal.

**Le flux brut** du cook va dans `runs/<run>.jsonl`, pas dans la base (§3 de la stack).

## Le superviseur

- **Lancement** : `spawn` `detached` (le cook est chef de son groupe), entrée fermée, sortie et
  erreurs sur des tubes.
- **Comptage** : chaque ligne du flux est du JSON. Les tours et les tokens se lisent dans les
  messages de l'assistant (`usage`) au fil de l'eau — pas dans le `result` final, qui arrive
  trop tard pour arrêter quoi que ce soit. Une ligne illisible compte comme de l'activité, rien
  de plus.
- **Trois minuteries** : durée totale, inactivité (remise à zéro par ligne), grâce après
  `SIGTERM`.
- **Arrêt** : `SIGTERM` au groupe, puis `SIGKILL` au groupe après le délai de grâce. Le même
  geste pour un plafond, l'inactivité et le « stop ».
- **Tous les délais sont injectables** : les tests tournent en millisecondes.

## Disjoncteur et « stop »

Tous deux sont des **projections du journal** : ils survivent à un redémarrage et se
recalculent par rejeu. Le lancement gardé les consulte dans la transaction qui écrit
`cook.launched` : disjoncteur ouvert ou cuisine arrêtée → refus, sans sous-processus.

- Le compteur d'échecs d'affilée avance et se remet à zéro selon la **question 3**.
- Le « stop » : la CLI écrit `kitchen.stopped` ; la veille du journal réveille le runtime, qui
  arrête chaque cook en cours avec le motif `stop`.

## Frontières avec les tickets voisins

- **#14 (rail)** : #16 ne touche pas à l'état des tickets. « Le ticket retourne en attente » se
  lit, côté rail, sur `cook.exited` / `cook.interrupted` portés par le ticket. Le nom du fait
  que le rail écoute est à accorder avec #14.
- **#15 (station)** : appelle le lancement gardé de #16 au lieu de `spawn`, et interprète les
  trois fins (fini, échoué, 86) à partir de `cook.exited` et du flux. #16 ne juge pas la fin
  d'un cook qu'il n'a pas arrêté lui-même.
- **#18 (état)** : reprendra la surface de lecture dans `brigade status`.
- **Détection de boucle** (citée par la spec V2, absente des critères de l'issue) : couverte au
  jalon 1 par le plafond de tours. Rien de plus fin ici.
- **Budget consommé en direct** : le journal porte la consommation à la fin du cook, pas à
  chaque tour. L'afficher en cours de route appartient à #18.

## Plan

Chaque étape en TDD (`superpowers:test-driven-development`). La suite reste de l'ordre de la
seconde.

1. Faits et projection : cooks en cours, disjoncteur, arrêt demandé — test de rejeu compris
   (le registre y entre de lui-même).
2. Faux `claude` et superviseur : fin normale, flux brut dans `runs/`, compteurs.
3. Plafonds : tours, tokens, durée, inactivité — chacun arrête et journalise son motif.
4. Arrêt forcé : petit-enfant sourd à `SIGTERM` tué avec le groupe.
5. Disjoncteur : N échecs d'affilée → `breaker.opened`, lancement refusé ; persiste au
   redémarrage.
6. « stop » écrit par un autre process → tous les cooks arrêtés en ≤ 1 s ; « reprendre ».
7. Réconciliation au démarrage : lancement sans fin → `cook.interrupted`.
8. Surface du chef (question 6), `docs/runtime.md`.

## Questions pour le chef

**1. Quelles valeurs par défaut, et où se règlent-elles ?**
- **Recommandé** : 100 tours, 60 min, 2 M tokens, inactivité 10 min, disjoncteur à 3 échecs.
  Mêmes plafonds pour tous les tickets au jalon 1, réglables par variables d'environnement de
  l'unité systemd (`BRIGADE_MAX_TURNS`, `BRIGADE_MAX_MINUTES`, `BRIGADE_MAX_TOKENS`,
  `BRIGADE_IDLE_MINUTES`, `BRIGADE_BREAKER_FAILURES`). Un plafond propre à un ticket viendra
  avec le format de ticket.

**2. Que compte le plafond de tokens ?**
- **(a) — recommandé** : entrée + sortie + écriture de cache, **hors lectures de cache**. Les
  lectures de cache gonflent le total d'un ordre de grandeur sans refléter le travail du cook.
- (b) : tout ce que `usage` rapporte, lectures de cache comprises.
- (c) : la sortie seule.

**3. Qu'est-ce qui compte comme un échec pour le disjoncteur ?**
- **(a) — recommandé** : un arrêt par garde-fou (plafond, inactivité) et un cook qui échoue
  (code de sortie non nul). Ne comptent **pas** : le « stop » du chef, le 86, l'interruption par
  redémarrage du runtime. Un cook qui finit bien remet le compteur à zéro.
- (b) : seuls les arrêts par garde-fou comptent.

**4. Comment le disjoncteur se referme-t-il ?**
- **(a) — recommandé** : uniquement par une commande du chef (« reprendre »). Il reste ouvert
  après un redémarrage du runtime.
- (b) : tout seul après un délai.

**5. Après un « stop », le runtime relance-t-il des cooks ?**
- **(a) — recommandé** : non. Le « stop » est un état : rien ne se lance tant que le chef n'a
  pas dit « reprendre » (la même commande que pour le disjoncteur). Il tient après un
  redémarrage.
- (b) : oui. Le « stop » tue les cooks en cours et c'est tout ; le rail en relance aussitôt.

**6. Par où le chef voit-il et commande-t-il, tant que #18 n'est pas livrée ?**
- **(a) — recommandé**, sur le modèle de `npm run journal` de #13 :
  `npm --prefix runtime run garde-fous` montre les plafonds, les cooks en cours, l'état du
  disjoncteur et du « stop », et les derniers arrêts avec leur motif ;
  `… run garde-fous -- stop` et `… run garde-fous -- reprendre` commandent. #18 les reprendra
  dans la CLI `brigade`.
- (b) : #16 ne livre que les faits au journal ; le chef les lit avec `npm run journal` et
  attend #18 pour commander.
