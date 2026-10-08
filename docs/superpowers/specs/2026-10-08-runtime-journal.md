# Runtime et journal — spec et plan (#13)

**Date** : 2026-10-08
**Statut** : validé le 2026-10-08 — le chef a tranché (a) et (a) aux deux questions de fin de document
**Issue** : #13 « Le runtime tourne sur la box et tient son journal »
**S'appuie sur** : `2026-10-08-runtime-stack.md` (§1, §2, §3, §6), qui a déjà tranché la stack.
Ce document ne redécide rien de ce qui y figure ; il dit ce que #13 pose, et où.

---

## Ce que #13 livre

Le socle sur lequel #14, #16 et #18 s'appuient : un process qui démarre, tient un verrou, écrit
dans un journal en ajout seul et s'arrête proprement. **Aucun rail, aucun cook, aucun appel à
`claude`** — donc aucun quota consommé, par construction : le code de #13 ne lance aucun
sous-processus.

| Critère de l'issue | Ce qui le porte |
|---|---|
| Démarrer, arrêter, redémarrer sans perdre l'état | `log.db` durable (WAL, `synchronous = FULL`) ; projections recalculables ; réconciliation au démarrage |
| Chaque événement porte horodatage, projet, ticket, type, auteur | Colonnes `NOT NULL` de la table `events` (sauf `ticket`, nul pour un événement qui ne concerne aucun ticket) |
| Relire le journal complet d'un ticket, dans l'ordre | Lecture par ticket, triée par numéro de séquence — surface pour le chef : **question 1** |
| Deux runtimes sur un projet : le second refuse et dit pourquoi | `lock.db`, transaction d'écriture tenue toute la vie du process |
| Aucun quota consommé | Aucun sous-processus, aucun réseau dans ce chemin |

## Modules

Un module par responsabilité, pour que #14, #16 et #18 avancent en parallèle sans se disputer
un fichier.

```
runtime/
  package.json          scripts test / typecheck / start, engines Node 26, zéro dépendance d'exécution
  package-lock.json     deux dépendances de dev : typescript, @types/node
  tsconfig.json         tsc --noEmit, syntaxe effaçable uniquement
  src/
    base.ts             SEUL module qui importe node:sqlite — ouverture, pragmas, schéma, transactions
    evenements.ts       l'union discriminée des événements, assemblée depuis evenements/
    evenements/
      runtime.ts        les événements que #13 produit
    journal.ts          ajouter un événement, lire (par ticket, depuis un curseur)
    projections.ts      registre des projections ; les effacer et rejouer le log
    projections/
      sessions.ts       la projection que #13 porte : les vies successives du runtime
    verrou.ts           lock.db
    runtime.ts          démarrer / arrêter : verrou, réconciliation, boucle de réveil
    main.ts             point d'entrée de `npm start` : environnement, signaux, code de sortie
  test/                 node --test, un répertoire temporaire par test
  deploy/
    brigade@.service    unité systemd à gabarit
docs/runtime.md         doc vivante : lancer en local, déployer sur la box, recette du chef
```

**Règle d'extension** (ce que les tickets suivants font, et rien d'autre) : un domaine ajoute
`evenements/<domaine>.ts` et `projections/<domaine>.ts`, puis **une ligne** dans `evenements.ts`
et dans le registre de `projections.ts`. L'union reste exhaustive : un type oublié dans une
projection est une erreur de `tsc`.

## Le journal

Table `events`, `STRICT`, en ajout seul (déclencheurs qui refusent `UPDATE` et `DELETE`) :

| Colonne | Sens |
|---|---|
| `seq` | numéro de séquence, clé primaire croissante — **l'ordre de vérité** |
| `at` | horodatage ISO 8601 UTC, posé par le runtime à l'écriture |
| `project` | le projet |
| `ticket` | numéro du ticket, ou `NULL` |
| `type` | type d'événement (`runtime.started`…) |
| `author` | qui l'a écrit : `runtime`, `chef`, plus tard `station:<nom>`, `cook:<run>` |
| `payload` | charge utile JSON |
| `dedup_key` | clé d'unicité facultative (`UNIQUE`) — pour les producteurs externes (#14 : identifiant GitHub). Un doublon est refusé sans erreur |

Les noms de colonnes et de types d'événements sont en anglais, comme le vocabulaire de la spec
V2 (rail, ticket, pass, cook) ; le code et ses commentaires restent en français.

**Événements de #13** : `runtime.started` (pid, hôte, version de Node), `runtime.stopped`
(arrêt demandé : signal reçu), `runtime.interrupted` (écrit au démarrage suivant quand la vie
précédente n'a pas de `stopped` : crash, `kill -9`, coupure).

**Curseurs** : table `cursors` (consommateur → dernier `seq` traité), avancée dans la même
transaction que les événements produits en réaction (§2 de la stack). #13 pose la table et la
primitive ; ses premiers consommateurs arrivent avec #14.

## Projections et rejeu

Une projection = un nom, les tables qu'elle possède, et une fonction `appliquer(événement)`
appelée **dans la transaction qui ajoute l'événement**. `reconstruire()` vide toutes les tables
de projection et rejoue le log depuis `seq = 1`.

Tests que #13 porte :

- **Rejeu** : après une suite d'événements, l'état des projections est photographié ; on
  reconstruit ; l'état est identique. Le test parcourt **le registre**, donc toute projection
  ajoutée par un ticket suivant y entre sans y penser.
- **Redémarrage** : un runtime démarre, écrit, est tué (`kill -9` sur un vrai process enfant) ;
  le suivant retrouve le journal intact, journalise `runtime.interrupted`, et repart.
- **Verrou** : un second runtime sur le même répertoire d'état échoue immédiatement, code de
  sortie non nul, avec un message qui nomme le détenteur (pid, hôte, heure de démarrage, lus
  dans le dernier `runtime.started`).

## Runtime

- **Environnement** : `BRIGADE_STATE_DIR` (obligatoire, jamais de défaut : pas de chemin en
  dur) et `BRIGADE_PROJECT` (obligatoire). Absents → refus de démarrer, message clair.
- **Démarrage** : verrou → ouverture du log → réconciliation (`interrupted` si besoin) →
  `runtime.started` → boucle.
- **Boucle de réveil** : surveillance de `PRAGMA data_version` chaque seconde (ce qu'un autre
  process écrit) et tick à 60 s. Au jalon de #13 personne n'écoute encore : la boucle livre le
  mécanisme d'abonnement que #14 et #16 brancheront. Les intervalles sont injectables, pour que
  les tests ne dorment pas.
- **Arrêt** : `SIGTERM` / `SIGINT` → `runtime.stopped` → fermeture → code 0. systemd envoie
  `SIGTERM` sur `systemctl stop`.
- **Sortie du process** : quelques lignes sur stdout (démarré, arrêté, refus) — c'est journald
  qui les garde sur la box. Rien de ce qui sert à reconstruire l'état n'y passe.

**Laissé à #18** : l'« âge du dernier tick » qui révèle un runtime figé. Le tick n'est pas
journalisé par #13 — 1 440 lignes par jour qui ne racontent rien de la cuisine ; la façon de le
rendre visible appartient au ticket qui l'affiche.

## Déploiement

`runtime/deploy/brigade@.service`, conforme au §6 de la stack : `User=`, `StateDirectory=brigade/%i`,
`Environment=BRIGADE_STATE_DIR=/var/lib/brigade/%i`, `Environment=BRIGADE_PROJECT=%i`,
`Restart=on-failure` avec délai, `WantedBy=multi-user.target`. `docs/runtime.md` donne la
procédure d'installation et la **recette du chef** — le critère « le chef démarre le runtime sur
la box » ne se prouve que là-bas ; la session de dev n'y a pas accès. Les quatre points « à
vérifier » de la stack (Linux + systemd, Node 26, `claude` connecté sous `User=`, `/var/lib`
local) ouvrent cette recette.

## Plan

1. `package.json`, `tsconfig.json`, `package-lock.json` — `npm test` et `typecheck` verts à vide.
2. `base.ts` + `journal.ts` : schéma, ajout seul prouvé (un `UPDATE` et un `DELETE` refusés),
   champs obligatoires, lecture par ticket dans l'ordre, clé d'unicité.
3. `projections.ts` + `projections/sessions.ts` + test de rejeu.
4. `verrou.ts` : second preneur refusé ; verrou repris après `kill -9`.
5. `runtime.ts` + `main.ts` : démarrage, arrêt propre, interruption réconciliée, refus du second
   avec son motif — tests sur de vrais process enfants.
6. Surface de relecture du journal (selon la réponse à la question 1).
7. Unité systemd, `docs/runtime.md`.

Chaque étape en TDD (`superpowers:test-driven-development`). La suite reste de l'ordre de la
seconde.

## Questions tranchées — (a) et (a), par le chef, le 2026-10-08

**1. Par où le chef relit-il le journal d'un ticket, tant que #18 n'est pas livrée ?**
Le critère dit « le chef peut relire le journal complet d'un ticket » ; la qualification met la
CLI d'état hors scope (#18).

- **(a) — recommandé** : #13 livre une commande minimale en lecture seule,
  `npm --prefix runtime run journal -- <ticket>` (une ligne par événement : `seq`, heure, type,
  auteur, charge utile ; sans argument, tout le journal). #18 la reprendra dans `brigade status`
  et y ajoutera états, cooks et suivi en direct. Le critère de #13 est ainsi tenu par #13.
- (b) : #13 ne livre que la fonction de lecture, prouvée par test ; le chef attend #18 pour s'en
  servir, et le critère n'est recetté qu'à ce moment-là.

**2. Qu'est-ce que le nom de projet ?** Il s'écrit dans chaque événement, dans le nom de l'unité
systemd (`brigade@<projet>`) et dans le chemin d'état (`/var/lib/brigade/<projet>`).

- **(a) — recommandé** : un identifiant court choisi par le chef (`brigade`, `thermigo`),
  limité à `[a-z0-9-]`. Le lien vers le dépôt GitHub (`owner/repo`) est une configuration que
  #14 posera quand le rail en aura besoin.
- (b) : `owner/repo` directement — sans ambiguïté, mais la barre oblique doit être échappée
  dans le nom d'unité systemd et dans le chemin d'état.
