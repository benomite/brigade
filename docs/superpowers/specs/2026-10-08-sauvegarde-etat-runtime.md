# L'état du runtime est sauvegardé, et se restaure — spec et plan (#62)

**Date** : 2026-10-08
**Statut** : à valider — cinq questions en fin de document, chacune avec sa recommandation
**Issue** : #62 « L'état du runtime n'est sauvegardé par rien »
**S'appuie sur** : `2026-10-08-brigade-v2-design.md` (principe 5 : les artefacts durables restent
la vérité), `2026-10-08-runtime-stack.md` (§3 le journal et le verrou, §6 le déploiement),
`2026-10-08-runtime-journal.md` (le journal en ajout seul, les projections recalculées)

---

## La voie de déploiement : systemd, confirmé

Le runtime reste une **unité systemd sur l'hôte**, `brigade@<projet>.service`, telle qu'elle est
écrite et recettée. Le motif est propre à brigade, pas à la box :

- Le runtime n'a **rien à isoler de lui-même** : aucune dépendance d'exécution, aucun build, aucun
  port. Un conteneur n'apporterait qu'une couche à maintenir.
- Il a en revanche **besoin de l'hôte** : la connexion Max du compte (`claude` lit ses identifiants
  là où il les a posés), `gh` connecté, `git` qui pousse. Un conteneur les ferait monter un par un.
- Le serveur devient celui de brigade seul (#67) : la cohabitation qui justifiait Docker sur la
  parade-box disparaît avec les services abandonnés.
- Le verrou par projet réclame un disque local ; `StateDirectory=` le donne sans volume à déclarer.

Le conteneur **par projet** du jalon 7 (isolation des cooks) reste ouvert : c'est une autre
question, et rien ici ne la ferme.

La sauvegarde suit la même voie : une seconde unité à gabarit et son timer.

## Ce qui est dans le répertoire d'état, et ce que la sauvegarde en fait

| Contenu | Nature | Sauvegardé ? |
|---|---|---|
| `log.db` (+ `-wal`, `-shm`) | **La vérité** : le journal, et les projections qui en dérivent | **Oui**, par instantané cohérent |
| `lock.db` | Un fichier vide : le verrou est une transaction tenue par le noyau, pas une donnée | **Non**. Il se recrée au démarrage |
| `runs/<run>.jsonl`, `.stderr` | Le flux brut de chaque cook. Rien de ce qui reconstruit l'état n'y vit ; il sert au diagnostic, et au compte-rendu d'une livraison reprise après un crash | Selon la question 3 |
| `depot/` | Le clone réservé à la station | **Non** : il se reclone (`docs/runtime.md` § Installer) |
| `worktrees/<run>` | Le worktree de chaque cook, dépendances comprises | **Non** : ce qui compte est poussé à la récolte |

**Précision sur `lock.db`.** La qualification craignait qu'il nomme le pid et la machine de
l'ancien runtime. Ce n'est pas lui : `lock.db` ne contient rien. Le pid et la machine sont dans le
journal (`runtime.started`), et un journal restauré dont la dernière session n'a pas de fin est
exactement celui d'un runtime mort sans préavis — le démarrage écrit `runtime.interrupted`, puis
repart. Le refus « déjà en cours » (code 2) ne vient que d'un verrou **tenu**, donc jamais d'un
fichier copié. La sauvegarde écarte `lock.db` quand même : il n'a rien à restaurer.

## L'instantané

`VACUUM INTO` depuis une connexion en lecture seule : SQLite écrit une base neuve, complète et
cohérente — l'état d'une transaction de lecture —, sans bloquer l'écrivain (mode WAL) et sans
copier `-wal` ni `-shm`. Vérifié sur Node 26.8 pendant qu'un écrivain tient une transaction
ouverte : l'instantané contient ce qui était validé, `PRAGMA integrity_check` répond `ok`.

`cp` est exclu : une base ouverte en WAL se copie en trois fichiers qui ne se correspondent pas.

## La commande `sauvegarder`

```bash
BRIGADE_STATE_DIR=<état> BRIGADE_BACKUP_DIR=<destination> npm --prefix runtime run sauvegarder
```

Module `runtime/src/sauvegarde.ts` (la logique, testée) et `runtime/src/sauvegarder.ts` (la
commande). Elle tourne pendant que le runtime tourne, ou arrêté.

1. `BRIGADE_BACKUP_DIR` absent → refus, code 2. **Aucun défaut** : une sauvegarde qui choisit seule
   sa destination finit sur le disque qu'elle devait protéger.
2. Destination dans le répertoire d'état → refus, code 2.
3. Instantané dans `<destination>/.en-cours-<horodatage>/log.db`, puis contrôle
   (`PRAGMA integrity_check`, et le dernier `seq`).
4. `runs/` selon la question 3.
5. Un `manifeste.json` : projet, horodatage, dernier `seq`, nombre d'événements, version de Node.
6. Renommage atomique en `<destination>/<horodatage UTC>/`. Une sauvegarde interrompue ne laisse
   qu'un `.en-cours-*`, jamais une sauvegarde qui en a l'air ; le passage suivant le retire.
7. Rotation : les sauvegardes au-delà de la rétention sont supprimées (question 2), **après** la
   réussite de la nouvelle — jamais avant.
8. Une ligne sur la sortie (`sauvegarde 2026-10-08T03-30-00Z — 4 211 événements, jusqu'au n° 4211`),
   code 0. Tout échec : message, code 1, et aucune rotation.

Un répertoire d'état sans `log.db` (runtime jamais démarré) : rien à sauvegarder, code 0, et il le
dit.

## La commande `restaurer`

```bash
BRIGADE_STATE_DIR=<état neuf> npm --prefix runtime run restaurer -- <destination>/<horodatage>
```

- Refuse (code 2) si le répertoire d'état contient déjà un `log.db` : **une restauration n'écrase
  jamais un journal**. Le geste pour repartir d'une sauvegarde sur une machine qui a déjà un état
  est de déplacer l'ancien à la main.
- Contrôle la sauvegarde avant de rien écrire (`integrity_check`, manifeste cohérent avec la base).
- Pose `log.db`, et `runs/` s'il est dans la sauvegarde. Ne pose ni `lock.db`, ni `depot/`, ni
  `worktrees/`.
- Dit ce qu'elle a posé et ce qui reste à faire : recloner le dépôt de la station, démarrer.

Au démarrage qui suit, rien de spécial : le runtime note `runtime.interrupted` si la sauvegarde a
été prise en marche, recalcule ses projections, et les cooks qui tournaient à l'instant de la
sauvegarde sont notés `cook.interrupted`, comme après toute coupure.

## Sans intervention : l'unité et son timer

`runtime/deploy/brigade-sauvegarde@.service` (`Type=oneshot`, même `User=`, même
`BRIGADE_STATE_DIR` que le runtime, `ExecStart=… node src/sauvegarder.ts`) et
`runtime/deploy/brigade-sauvegarde@.timer` (`Persistent=true` : une sauvegarde manquée pendant un
arrêt de la machine est rattrapée au démarrage). `BRIGADE_BACKUP_DIR` se pose dans un drop-in de
l'instance — sans lui, l'unité échoue et `systemctl status` dit pourquoi.

Aucun jeton dans cet environnement non plus : la commande ne lance ni `claude` ni `gh`.

## La preuve : un test de restauration

`runtime/test/sauvegarde.test.ts`, sans réseau ni vrai `claude`, de l'ordre de la seconde :

1. Un vrai runtime (`main.ts`, faux `gh`, faux `claude`) sert un ticket sous grant `merge` dans un
   répertoire d'état A : le journal porte `ticket.served`, `grant.used`, `cook.progressed`.
2. `sauvegarder` est jouée **pendant qu'il tourne**.
3. `restaurer` vers un répertoire B neuf ; un runtime démarre sur B : il **démarre** (pas de code
   2), écrit `runtime.interrupted` puis `runtime.started`.
4. Sur B, `journal`, `grant` et `station` relisent le ticket servi, l'usage du grant et le relevé
   du cook d'avant la sauvegarde.

Et, par cas : instantané pris pendant une transaction d'écriture ouverte ; destination absente ou
dans l'état → refus ; restauration sur un état existant → refus ; sauvegarde interrompue → pas de
sauvegarde à moitié ; rotation qui ne supprime rien quand la nouvelle échoue.

## Ce que la restauration ne rend pas

À écrire tel quel dans `docs/runtime.md` :

- **Ce qui s'est passé depuis la dernière sauvegarde.** Le rail se recale seul sur GitHub au premier
  sondage (issues fermées, labels retirés) ; les usages de grant et les relevés de cette fenêtre
  sont perdus. C'est la cadence qui borne cette perte (question 1).
- **Les worktrees.** Un ticket **en pass** au moment de la sauvegarde retrouve son état au journal,
  mais plus son worktree : la pass ne peut pas le rejuger. Le geste est celui qui existe déjà —
  merger sa PR à la main, ou retirer `fire`. Un travail non commité d'un cook en cours est perdu.
- **La connexion Max, `gh`, la configuration git du compte** : ce ne sont pas des états du runtime.
  Ils se refont à l'installation (`docs/runtime.md` § À vérifier avant d'installer).

## Côté parade-box

Aucun changement à y écrire : la voie retenue ne lui demande rien, et la box s'efface (#67). La
sauvegarde de brigade ne dépend ni de `scripts/backup.sh` ni des volumes de la box. Ce qui doit
être dit là-bas — « en voie d'obsolescence, et vers quoi » — est un critère de #67.

## Hors périmètre

- Envoyer la sauvegarde hors de la machine vers un service précis : `BRIGADE_BACKUP_DIR` est un
  chemin ; qu'il soit un disque monté ou qu'un `rsync` le relaie est un choix d'installation.
- Jouer l'installation sur le serveur : recette du chef.
- Borner `runs/` et `worktrees/` **à la source** : ils grossissent sans borne aujourd'hui, c'est
  dit dans `docs/runtime.md` (« Rien n'est nettoyé »), et ce n'est pas la sauvegarde qui le règle.

## Plan

1. `sauvegarde.ts` — instantané, contrôle, manifeste, renommage atomique (TDD).
2. Rotation et ménage des `.en-cours-*`.
3. `runs/` selon la question 3.
4. `restaurer` — refus, contrôle, pose.
5. Les deux commandes, leurs scripts npm, leurs refus.
6. Le test de restauration de bout en bout.
7. Les deux unités systemd ; `docs/runtime.md` : la voie et son motif, « Sauvegarder et
   restaurer », l'installation du timer, deux étapes de recette.

## Questions au chef

1. **Cadence.** *Recommandé : une fois par jour*, à heure fixe (03:30, comme aujourd'hui sur la
   box), réglable par drop-in du timer. La perte maximale est alors d'un jour de journal. Une
   cadence horaire coûte peu (la base est petite) et ramène la perte à une heure — à choisir si un
   jour d'usages de grant perdus te gêne.
2. **Rétention.** *Recommandé : les 14 dernières sauvegardes* (`BRIGADE_BACKUP_KEEP`, défaut 14 —
   les 14 jours de la box). Un instantané est une base entière : la rétention se compte en
   sauvegardes, pas en jours.
3. **`runs/`.** *Recommandé : tout garder, en un seul exemplaire.* Les flux bruts sont copiés dans
   `<destination>/runs/`, hors des instantanés datés, et seuls les fichiers neufs ou qui ont changé
   sont recopiés : un flux ne pèse qu'une fois, quelle que soit la rétention. La sauvegarde ne
   supprime jamais un flux — elle grossit comme la source. Autres voies : ne rien garder de `runs/`
   (le journal suffit à reconstruire l'état, on perd le diagnostic), ou seulement les N derniers
   jours.
4. **Les worktrees ne sont pas sauvegardés.** *Recommandé : confirmer.* Conséquence dite plus haut :
   après une restauration, un ticket en pass se termine à la main.
5. **Faut-il que la sauvegarde se voie dans la cuisine ?** Une sauvegarde qui échoue en silence
   n'en est pas une. *Recommandé : la sauvegarde réussie écrit un fait au journal
   (`backup.completed`, auteur `sauvegarde`) — donc relisible par `journal` — et rien de plus dans
   ce ticket* ; l'afficher dans `status` (« dernière sauvegarde il y a … ») et alerter sur son âge
   feraient un ticket à part. Sans ce fait, la seule trace est `systemctl status
   brigade-sauvegarde@<projet>`.
