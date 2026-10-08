# brigade V2 — stack du runtime

**Date** : 2026-10-08
**Statut** : décidé (issue #21) — résout, pour le runtime, la question ouverte n°1 de
`2026-10-08-brigade-v2-design.md`
**Portée** : le runtime qui tourne sur la parade-box. La stack de l'**app desktop** n'est pas
tranchée ici ; elle attend le jalon 6.

---

## La décision

| Sujet | Décision |
|---|---|
| **Langage** | TypeScript exécuté **directement par Node 26** (suppression des types native) : pas de build, pas de bundler |
| **Dépendances** | **Zéro dépendance d'exécution** au jalon 1 : `node:sqlite`, `node:test`, `node:child_process`. Deux dépendances de dev seulement (`typescript`, `@types/node`), pour le contrôle de types |
| **File d'événements** | **Pas de broker.** La file, c'est le log : un événement est une ligne ajoutée, un consommateur est un curseur dans le log |
| **Réveil** | Réveil direct en process pour ce que le runtime produit lui-même ; surveillance du log à 1 s pour ce qu'un autre process y écrit ; tick périodique pour GitHub |
| **GitHub** | **Sondage** (`gh api`, requêtes conditionnelles) au jalon 1. Le webhook viendra comme un producteur de plus, sans rien changer aux consommateurs |
| **Stockage du log** | **SQLite confirmé**, un fichier par projet, mode WAL, table d'événements en ajout seul |
| **Verrou par projet** | Une transaction d'écriture tenue sur un fichier SQLite dédié : le noyau la relâche à la mort du process |
| **Pilotage de `claude`** | Sous-processus, **flux JSON sur des tubes, sans pty**, dans son propre groupe de process |
| **Déploiement** | Une unité **systemd** par projet (`brigade@<projet>.service`), code déployé par `git`, état dans un répertoire unique |
| **Poste de dev** | macOS : on y écrit et on y joue les tests. Aucun démon n'y tourne |

## Ce qui a été éprouvé avant d'écrire

Mesuré le 2026-10-08 sur le Mac (Node 26.8.1, `claude` 2.1.285), par de petits scripts jetables —
aucun n'est versionné, la PR ne contient que ce document.

- `node fichier.ts` et `node --test` exécutent du TypeScript sans option ni build ; un test
  SQLite complet passe en 53 ms.
- `node:sqlite` (SQLite 3.53.4 embarqué) : mode WAL, table `STRICT`, déclencheurs qui refusent
  `UPDATE` et `DELETE`, et un second process qui lit pendant qu'une écriture est en cours. Aucun
  avertissement « expérimental ».
- **Verrou** : un process tient `BEGIN IMMEDIATE` sur un fichier ; le second reçoit
  `database is locked` sur-le-champ ; après un `kill -9` du premier, le verrou se reprend sans
  aucun nettoyage.
- **`claude` sur des tubes** : `claude -p … --output-format stream-json --verbose`, entrée
  fermée, sortie lue ligne à ligne — pas besoin de pty. Le flux se termine par un événement
  `result` (`subtype`, `is_error`, `terminal_reason`, `num_turns`, `usage`), code de sortie 0.
- **Le flux porte l'état du quota** : un `rate_limit_event` donne `status`, `rateLimitType`,
  `resetsAt` et le taux d'utilisation des fenêtres de 5 heures et de 7 jours.
- **Arrêt forcé** : un enfant lancé `detached` est chef de son groupe ; `SIGTERM` puis `SIGKILL`
  sur le groupe tue aussi un petit-enfant qui ignore `SIGTERM`.

**Non éprouvé**, faute d'accès à la box depuis cette session : son système, la présence de
systemd, la version de Node qui y est installée. Voir « À vérifier ».

## 1. Langage : TypeScript sur Node 26, sans build

Le runtime fait quatre choses : tenir un journal, superviser des sous-processus longs, lire du
JSON en flux, parler à GitHub. Node fait les quatre avec sa bibliothèque standard, et depuis que
`node:sqlite` et la suppression des types sont intégrés, il les fait **sans une seule dépendance
installée** — ce qui compte ici plus qu'ailleurs : un worktree par cook, des gates rejouées à
chaque arrêt, un conteneur par projet à venir.

Trois raisons de préférer TypeScript à un langage à binaire statique :

1. **Les types d'événements sont le contrat du système.** « Tout se reconstruit du log » repose
   sur des fonctions qui replient la suite d'événements ; une union discriminée, vérifiée
   exhaustivement, fait d'un type d'événement oublié une erreur de compilation plutôt qu'un état
   faux au redémarrage.
2. **Ces types serviront deux fois encore.** L'endpoint MCP du second (jalon 5) et l'interface
   du tableau de bord (jalon 6) manipulent les mêmes événements. Quelle que soit l'enveloppe
   desktop retenue plus tard, son interface sera du web et son terminal sera xterm.js : du
   TypeScript dans tous les cas. Ce constat ne tranche pas l'enveloppe.
3. **Le flux de `claude` est du JSON ligne à ligne** : c'est le terrain natal de Node.

**Règles qui en découlent**

- Syntaxe **effaçable uniquement** (pas d'`enum`, pas de propriétés de paramètre, imports avec
  l'extension `.ts`) : c'est la condition pour que Node exécute les sources telles quelles.
- `tsc --noEmit` sert de contrôle de types dans les gates et ne produit rien. Sa configuration
  est à poser par #13 ; elle n'a pas été éprouvée ici.
- Toute dépendance d'exécution ajoutée plus tard se justifie dans sa PR. Les modules natifs à
  compiler sont à éviter : ils compliquent le conteneur et le setup de worktree.
- Version : **Node 26**, celle du poste de dev, qui passe en LTS fin octobre 2026 selon le
  calendrier de Node. `engines` l'exige, la box l'installe.

## 2. File d'événements et réveil : le log est la file

Un broker (Redis, NATS, RabbitMQ) serait un second démon à exploiter et, surtout, un **second
endroit où vit l'état** — l'inverse exact de « sans état en mémoire ». Le log existe déjà et il
est transactionnel : il suffit.

- **Produire** un événement = ajouter une ligne au log.
- **Consommer** = lire le log à partir d'un **curseur** (le numéro du dernier événement traité),
  lui-même stocké dans la base. Un consommateur avance son curseur **dans la même transaction**
  que les événements qu'il produit en réaction : un crash au milieu ne perd rien et ne rejoue
  rien à moitié.
- **Les effets sur le monde** (lancer un cook, merger) ne sont pas transactionnels. Ils
  s'écrivent en deux temps — l'intention, puis le résultat. Au redémarrage, une intention sans
  résultat est à réconcilier. C'est ce qui rend vrai « ce qui était en cours se retrouve ».

**D'où vient chaque réveil**

| Événement | Producteur | Réveil |
|---|---|---|
| Fin de ticket, signal de cook, épuisement de quota | L'adaptateur moteur, dans le runtime | Immédiat, appel direct en process |
| Commande du chef (`stop`, plus tard les grants) | La CLI `brigade`, autre process, écrit dans le même log | Le runtime surveille `PRAGMA data_version` chaque seconde : latence ≤ 1 s |
| Activité GitHub (ticket posé, CI terminée, PR mergée) | Sondage `gh api` sur le tick, 60 s par défaut | Au tick |
| Tick | Une minuterie du runtime | — |

**GitHub : sondage d'abord, webhook ensuite.** Un webhook exige une entrée HTTP publique sur la
box, avec TLS et vérification de signature : une surface d'attaque que rien d'autre ne demande
au jalon 1. Avec un seul projet et un seul cook, une minute de latence ne coûte rien,
et les requêtes conditionnelles qui répondent « inchangé » ne consomment pas le quota de l'API.
Chaque événement GitHub entre dans le log sous une **clé unique** (son identifiant GitHub) : le
récepteur de webhook, quand il viendra — naturellement avec la GitHub App du jalon 7 —, écrira
les mêmes lignes ; les doublons seront refusés par la base et les consommateurs ne changeront
pas. Le tick reste alors comme filet de rattrapage.

**Aucune écoute réseau au jalon 1.** Ni port ni socket : la CLI lit et écrit directement dans la
base. Le premier port arrive avec l'API de l'app et le MCP (jalons 5 et 6).

## 3. Stockage du log : SQLite, confirmé

- **Un fichier par projet** : `<répertoire d'état>/log.db`. Le répertoire d'état d'un projet est
  ainsi une unité autonome, montable telle quelle dans son conteneur (jalon 7). Le scheduler
  (jalon 4) et la kitchen (jalon 6) liront plusieurs fichiers ; la forme du stockage global leur
  appartient.
- **Ajout seul.** Une table `events` : numéro de séquence, horodatage, projet, ticket, type,
  auteur, charge utile JSON. Des déclencheurs refusent `UPDATE` et `DELETE`. Le numéro de
  séquence est l'ordre de vérité.
- **Tout état dérivé se recalcule.** Rail, baux, état des cooks sont des projections du log :
  soit repliées au démarrage, soit matérialisées dans des tables écrites dans la même
  transaction que l'événement. Dans les deux cas, les effacer et rejouer le log doit redonner
  le même état — c'est un test que #13 doit porter.
- **« Ne prêter qu'une fois » (#14)** tient à la sérialisation des écritures : vérifier et
  ajouter dans une seule transaction `BEGIN IMMEDIATE`.
- **Mode WAL, `synchronous = FULL`** : les lecteurs (la CLI) ne bloquent pas l'écrivain, et un
  événement validé survit à une coupure de courant. Le volume ne justifie pas de troquer la
  durabilité contre du débit.
- **Le flux brut d'un cook ne va pas dans la base.** Il s'écrit en `runs/<run>.jsonl` dans le
  répertoire d'état ; le log garde les faits (lancé, fini, échoué, 86, arrêté par garde-fou) et
  le chemin du fichier. Rien de ce qui sert à reconstruire l'état ne vit dans ces fichiers.

**Verrou par projet.** Node n'a pas de `flock` dans sa bibliothèque standard. Le verrou est donc
une transaction d'écriture **tenue pendant toute la vie du process** sur un fichier SQLite dédié,
`lock.db`, distinct du log pour ne pas bloquer la CLI. Le second runtime échoue immédiatement
et dit qui tient le verrou — il le lit dans le dernier événement de démarrage du log. Comme le
verrou appartient au noyau, un crash ou un `kill -9` le libère : jamais de verrou orphelin à
nettoyer à la main. Condition : le répertoire d'état est sur un **disque local**, pas sur un
montage réseau.

## 4. Piloter `claude`

L'adaptateur lance le **binaire `claude` officiel**, trouvé dans le `PATH`, authentifié par la
connexion Max déjà faite sur la machine. Pas d'Agent SDK, pas d'API, aucune lecture des
identifiants.

- **Lancement** : `claude -p --output-format stream-json --verbose`, dans le worktree du cook,
  entrée fermée, sortie et erreurs sur des tubes, `detached` pour en faire un groupe de process.
- **Lecture** : une ligne = un événement JSON. Chaque ligne remet à zéro la minuterie
  d'**inactivité** (#16).
- **Arrêt** : `SIGTERM` au groupe, puis `SIGKILL` après un délai de grâce. C'est le même geste
  pour un plafond dépassé, l'inactivité, et la commande `stop`.
- **Les trois fins (#15)** se lisent sur trois signaux : le code de sortie, l'événement `result`
  final (`subtype`, `is_error`, `terminal_reason`) et les `rate_limit_event`. Ces derniers
  donnent `resetsAt`, donc le « moment où le quota revient » que #15 veut montrer.
- **Plafonds (#16)** : tours et tokens se comptent dans le flux (`num_turns`, `usage`) ; la
  durée est une minuterie du runtime.

Reste à établir par #15, parce que cela ne s'observe qu'en le provoquant : la forme exacte du
flux quand le quota est **effectivement** épuisé, et quand la connexion Max a expiré.

**Un cook meurt avec le runtime.** Les cooks sont des enfants du runtime ; arrêter le service
les arrête. Au redémarrage, un lancement sans fin dans le log est journalisé « interrompu » et
le ticket retourne en attente. Ce que le cook avait commité dans son worktree reste. Faire
survivre un cook au redémarrage du runtime coûterait un superviseur de plus, pour un gain que le
jalon 1 ne demande pas.

**Doublure de test.** Le chemin du binaire se surcharge par `BRIGADE_CLAUDE_BIN`. Les tests
pointent vers un faux `claude` qui rejoue un flux enregistré : les gates ne consomment
**aucun quota** et couvrent les fins qu'on ne peut pas provoquer à la demande (86, connexion
expirée, cook muet). Cette variable n'est jamais posée sur la box.

## 5. Dev local, tests, isolation — ce dont #22 a besoin

Emplacement proposé du code : `runtime/` à la racine, avec son `package.json`. C'est à #22 de
déclarer la zone.

| Besoin | Commande |
|---|---|
| Préparer un worktree | `npm ci --prefix runtime` (deux dépendances de dev, rien d'autre) |
| **Jouer les tests** | `npm --prefix runtime test` → `node --test` |
| Contrôler les types | `npm --prefix runtime run typecheck` → `tsc --noEmit` |
| Lancer le runtime en local | `npm --prefix runtime start` |

Les tests ne dépendent d'aucun paquet installé : `node --test` passe sur un clone nu. Seul le
contrôle de types réclame le `npm ci`.

**Isolation de l'état : une seule variable.** `BRIGADE_STATE_DIR` désigne le répertoire qui
contient tout — `log.db`, `lock.db`, `runs/`.

- Sur la box : `/var/lib/brigade/<projet>`.
- Dans un worktree de dev : `<WT>/.brigade-state`, exporté par `worktree-setup.sh` et ignoré
  par git. Deux worktrees ont deux répertoires, donc deux bases et deux verrous.
- **Dans les tests : jamais la variable.** Chaque test crée son propre répertoire temporaire.
  Deux tests d'un même worktree ne se croisent pas non plus, et une suite ne peut pas abîmer
  l'état d'un runtime lancé à la main.

**Ports : aucun au jalon 1.** Rien à attribuer, rien à faire entrer en collision. Quand un port
arrivera, la règle est déjà fixée : `BRIGADE_PORT`, dérivé du numéro d'issue par
`worktree-setup.sh`, et les tests écoutent toujours sur le port 0, attribué par le système.

**Durée des gates** : de l'ordre de la seconde tant que la suite reste sans réseau ni vrai
`claude`. C'est une contrainte à tenir, pas un hasard : le hook `Stop` rejoue les gates à chaque
arrêt.

## 6. Déploiement sur la parade-box

Une unité systemd **système**, à gabarit, une instance par projet : `brigade@<projet>.service`.
Le fichier d'unité est versionné avec le runtime.

- **Compte** : `User=` le compte Unix qui a fait la connexion Max. Le runtime lit ainsi les
  identifiants là où `claude` les attend, sans les copier.
- **État** : `StateDirectory=brigade/%i` crée `/var/lib/brigade/<projet>` au bon propriétaire ;
  `Environment=BRIGADE_STATE_DIR=…` le désigne.
- **Code** : un clone du dépôt sur une référence publiée. Sans dépendance d'exécution ni build,
  mettre à jour revient à `git fetch`, `git checkout <tag>`, puis redémarrer le service.

| Geste | Commande |
|---|---|
| Lancer | `systemctl start brigade@<projet>` |
| Arrêter | `systemctl stop brigade@<projet>` — arrête aussi les cooks (même cgroup) : c'est le « stop » de dernier recours, qui marche même si le runtime ne répond plus |
| Surveiller | `systemctl status brigade@<projet>` ; `journalctl -u brigade@<projet> -f` pour la sortie du process ; `brigade status` (#18) pour l'état métier, lu dans le log |
| Redémarrer après un crash | `Restart=on-failure`, avec un délai de relance |
| Redémarrer après un reboot | `systemctl enable brigade@<projet>` (`WantedBy=multi-user.target`) |

Deux journaux, deux usages : **journald** garde ce que le process imprime (démarrage, erreurs,
traces) ; **le log** garde ce qui s'est passé dans la cuisine. On ne reconstruit rien depuis
journald.

**Aucun accès prod** : l'unité ne monte aucun secret de prod et le runtime n'en connaît aucun.

**Le conteneur par projet (jalon 7) reste ouvert.** Rien ne l'interdit : aucun module natif,
tout l'état dans un répertoire qui devient un volume, aucun port imposé, et un verrou par
fichier qui reste valable entre l'hôte et un conteneur du même noyau. Que le runtime tourne
dans le conteneur ou le pilote de l'extérieur est une décision du jalon 7.

## 7. Ce qui tourne où

| | Mac (poste de dev) | parade-box |
|---|---|---|
| Écrire le code, jouer les gates | oui | non |
| Tests du runtime | oui, faux `claude` | non |
| Runtime en service | non — lancé à la main pour essayer, état dans le worktree | oui, sous systemd |
| Cooks réels | à la main seulement | oui |
| systemd | absent | oui |

Conséquence pour le code : rien de propre à Linux hors du fichier d'unité. Groupes de process,
signaux, SQLite et tubes se comportent pareil sur les deux systèmes ; c'est ce qui permet aux
gates jouées sur le Mac de valoir pour la box.

## Écarté, et pourquoi

| Option | Motif |
|---|---|
| **Go** | Le meilleur déploiement (un binaire) et un `flock` natif. Mais SQLite y demande un module tiers, la chaîne d'outils est à installer sur le Mac et dans chaque worktree, et les types d'événements seraient à réécrire pour le MCP et l'interface |
| **Python** | La bibliothèque standard suffirait (`sqlite3`, `flock`, `subprocess`). Mais le Python du Mac est un 3.9.6 système, le typage sérieux réclame un outil de plus, et rien ne se partage avec la suite |
| **Bun, Deno** | SQLite et TypeScript intégrés aussi. Un runtime de plus à installer sur deux machines, pour rien que Node 26 n'apporte déjà |
| **Rust** | Itération trop lente pour un système dont la forme se cherche encore, sans gain mesurable ici |
| **TypeScript compilé** (`tsc`, bundler) | Une étape de build à chaque worktree et à chaque déploiement, devenue inutile |
| **JavaScript sans types** | Perd la vérification exhaustive des événements, qui est la raison du choix |
| **Agent SDK** | Interdit par la spec : il exige une clé API |
| **pty** (`node-pty`) | Module natif à compiler, et inutile : `claude -p` parle sur des tubes. Le pty reviendra avec le terminal de l'app, qui n'est pas le runtime |
| **Broker** (Redis, NATS, RabbitMQ) | Un démon et un état de plus, alors que le log fait déjà file |
| **Webhook GitHub dès le jalon 1** | Une entrée publique sur la box pour gagner une minute de latence |
| **Postgres** | Un serveur à exploiter, une base à créer par worktree, pour un écrivain unique et un volume minuscule |
| **Fichiers JSONL comme log** | Ni transaction ni contrainte d'unicité : « ne prêter qu'une fois » ne s'y garantit pas |
| **`better-sqlite3`** | Module natif, à côté d'un équivalent intégré. Reste le repli si `node:sqlite` se révélait insuffisant : l'API est proche, à condition d'isoler l'accès à la base dans un seul module |
| **Verrou par fichier PID** | Un PID se réutilise : verrou orphelin ou faux positif après un crash |
| **Cooks en unités systemd séparées** | Les ferait survivre au runtime, au prix d'un mécanisme propre à Linux, donc impossible à tester sur le Mac |
| **Service systemd utilisateur** (`--user` et `linger`) | Fonctionne, mais le démarrage au boot dépend d'un réglage de session facile à oublier |
| **Watchdog systemd** (`WatchdogSec`) | Node ne sait pas écrire sur la socket de notification sans dépendance. Un runtime figé se voit à l'âge de son dernier tick dans `brigade status` |

## À vérifier à la première ligne de #13

Ces points n'ont pas pu être contrôlés depuis cette session ; aucun ne remet la décision en
cause, mais chacun peut coûter une heure s'il est découvert tard.

1. La box tourne bien sous Linux avec systemd.
2. Node 26 y est installé, ou installable sans toucher au reste.
3. `claude` y est le binaire officiel, connecté, et lancé par le compte que `User=` désignera.
4. `/var/lib` est sur un disque local.
