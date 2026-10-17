## Une identité GitHub par rôle

Par défaut, tout ce que le runtime fait sur GitHub part sous **un seul compte**, celui du `gh` et
du `git` de la machine : une protection de branche ne peut alors pas laisser merger la pass sans
laisser merger tout le reste. Sur un dépôt partagé, tu donnes au runtime **trois GitHub Apps**,
chacune une identité (`<nom>[bot]`) que les règles de branche savent nommer.

| Identité | Ce qui agit sous elle | Ce que vaut son jeton, sur le dépôt du projet seul |
|---|---|---|
| **cook** | la station, **pour le compte** du cook : rapatrier la base, pousser `cook/<run>`, ouvrir la PR | `contents: write`, `pull_requests: write` |
| **pass** | la pass : lire les PR et la CI, merger, fermer l'issue, y publier son verdict et la relecture du reviewer | `contents: write`, `pull_requests: write`, `issues: write`, `checks: read`, `statuses: read` |
| **manager** | le manager et le rail : sonder les issues, poser les labels, commenter, créer les tickets d'une épique — et ce que la station dit sur l'issue | `issues: write` |

Le **reviewer n'a aucun geste GitHub** : c'est un `claude` lancé sans jeton dans un worktree
jetable ; sa relecture est un fait du journal, que la pass publie.

### Le cook n'a aucun jeton

L'identité « cook » est celle sous laquelle la **station** livre. Le process du cook ne reçoit
**rien** : ni jeton d'écriture, ni jeton de lecture.

- Son environnement — et celui des gates, du reviewer et des juges du manager — perd `GH_TOKEN`,
  `GITHUB_TOKEN` et leurs variantes d'entreprise, y compris ceux qu'un setup de worktree
  exporterait. `GH_CONFIG_DIR` y pointe sur un répertoire vide (`gh-sans-compte/`, dans l'état) ;
  `GIT_TERMINAL_PROMPT=0`.
- **Il ne lit pas son ticket par `gh`** : la station le lui remet en fichier,
  `runs/<run>.ticket.md` — titre, corps, commentaires avec leur auteur, tels qu'au lancement —,
  hors du worktree. Illisible à ce moment-là : **aucun cook n'est lancé**, le ticket passe **86**
  dix minutes (`ticket-unreadable`), puis revient en attente.
- Ce que la station écrit sur l'issue part sous l'identité **manager** : commenter réclame
  `issues: write`, qui permet aussi de fermer et de labelliser — l'identité cook ne le peut pas.

### Des jetons d'une heure, réduits, jamais écrits

- Pour chaque geste, un jeton d'**installation** de l'App du rôle, demandé avec le **seul dépôt**
  du projet et les droits du tableau — même si l'App est installée plus large. Il **expire en une
  heure** et vit **en mémoire**, renouvelé à chaque tick avant sa fin. GitHub injoignable : dit une
  fois dans journald, retenté à chaque tick ; les gestes qui en dépendent échouent comme une panne.
- Il n'atteint `gh` et `git` que par l'**environnement du process lancé pour ce geste** — jamais
  par un argument, un fichier, un événement du journal, un flux de cook, un commentaire ou un
  message d'erreur. L'aide aux identifiants du compte est coupée pour ces gestes, un clone en SSH
  repasse en HTTPS, et l'échange va directement à l'API de GitHub.
- Aucun process long ne reçoit de jeton : ni cook, ni gates, ni reviewer, ni juge.

### Le merge dit qui l'a fait

`merge.done` porte `actor`, le compte GitHub qui a mergé ; `npm run pass -- <ticket>` l'affiche.
Quand la pass **constate** un merge (à la main, ou retrouvé au redémarrage), `by` est **ce que
GitHub nomme** : `pass` si c'est son identité, `outside` sinon — et la base est alors contrôlée.
Sous l'identité unique, `by` reste ce que le runtime suppose.

### Ce que tu crées chez GitHub

Une fois par projet, par quelqu'un qui administre l'organisation. **Ce parcours n'a pas pu être
joué depuis une session de dev** : c'est la recette.

1. **Trois GitHub Apps**, créées sur l'**organisation** (*Settings → Developer settings → GitHub
   Apps*), nommées `<projet>-cook`, `<projet>-pass`, `<projet>-manager`. Pas de webhook, pas de
   droit d'organisation ni de compte, *Only on this account*. Droits de dépôt — cook : *Contents*
   et *Pull requests* en lecture et écriture ; pass : les mêmes, plus *Issues* en lecture et
   écriture, *Checks* et *Commit statuses* en lecture ; manager : *Issues* en lecture et écriture.
   **Pas de droit *Workflows*** pour l'App cook : un ticket qui touche `.github/workflows/` ne se
   pousse pas, et son échec le dit. Donner moins fait refuser le jeton (`jeton refusé`, journald).
2. **Installe chacune sur le seul dépôt du projet** (*Only select repositories*), et relève pour
   chacune sa **clé privée** (`.pem`, donnée une seule fois) et son *App ID*.
3. **Sur la box**, un répertoire que seul le compte du service lit :

   ```bash
   sudo install -d -m 700 -o <compte> /etc/brigade/<projet>/apps
   # Pour chacun des trois rôles : cook, pass, manager
   echo <App ID> | sudo -u <compte> tee /etc/brigade/<projet>/apps/<rôle>.id
   sudo install -m 600 -o <compte> <la clé téléchargée>.pem /etc/brigade/<projet>/apps/<rôle>.pem
   ```

   puis, dans le drop-in : `Environment=BRIGADE_GITHUB_APPS_DIR=/etc/brigade/<projet>/apps`. Un
   fichier manquant, une clé lisible par d'autres que le compte, un fichier qui n'est pas une clé,
   ou deux rôles sous la même App : le runtime **refuse de démarrer** et nomme le fichier. Ces clés
   ne se copient ni dans le drop-in, ni dans une sauvegarde lisible, ni dans le dépôt.
4. **Retire le compte GitHub de la machine** : `sudo -u <compte> gh auth logout`, aucune clé SSH du
   compte chez GitHub, pas de `GH_TOKEN` dans le drop-in. Sur un dépôt privé, le premier clone se
   fait avec un jeton à toi, que tu ne laisses pas dans l'adresse de `origin`.
5. **La règle de branche qui réserve le merge** — ajoute une règle, n'en retire pas. Un *ruleset*
   actif sur la branche d'intégration (*Settings → Rules → Rulesets*, ou `gh api -X POST
   repos/<owner>/<repo>/rulesets`), avec **Restrict updates**, **Restrict deletions** et **Block
   force pushes** (`update`, `deletion`, `non_fast_forward`) ; dans *Bypass list*, l'App **pass**
   (`Integration`, *Always*) et les humains qui mergent. Ni l'App cook ni l'App manager n'y figurent.

Au démarrage, le runtime dit son mode : `GitHub — une identité par rôle (cook, pass, manager) …`
ou `GitHub — identité unique … rien ne réserve le merge à la pass`. Une App mal installée ne fait
pas refuser le démarrage : elle se dit dans journald dès le premier tick (`identité « pass » : son
App (…) n'est pas installée sur <owner>/<repo>`), et rien ne part sous ce rôle d'ici là. Ce qui
reste non garanti : voir « Ce que la pass ne garantit pas ».

## Les secrets du projet

Les secrets de dev du projet ont leur chemin, **séparé de l'environnement du runtime** : la règle
qui écarte du cook l'état du runtime, les clés Anthropic et les jetons GitHub ne bouge pas.

- **La déclaration** : `.claude/brigade/secrets`, dans le dépôt, versionné — des **noms** de
  variables, un par ligne ; `#` commente.
- **Les valeurs** : le fichier que nomme `BRIGADE_SECRETS_FILE`, sur la machine
  (`/etc/brigade/<projet>/secrets.env`) — `NOM=valeur`, une par ligne.

**Un cook reçoit l'intersection** : les variables que son dépôt déclare, avec la valeur que la
machine détient. La déclaration se lit dans le worktree du cook, sur sa branche. Une livraison qui
y touche n'est jamais mergée par la pass : elle attend ta relecture (`review-required`, cause
`declaration-modified: …` — voir « Ce que la pass décide »).

Le fichier de valeurs : un chemin absolu, **hors de `BRIGADE_STATE_DIR` et de `BRIGADE_REPO_DIR`**,
en `chmod 600` — sinon le runtime refuse de démarrer. Une valeur va jusqu'à la fin de sa ligne ; un
`export ` devant et une paire de guillemets autour sont retirés ; rien n'est interpolé. **Il est
relu à chaque lancement** : une valeur se remplace en éditant le fichier, sans rien redémarrer.

### Qui les reçoit

Le setup du worktree, le cook, et les gates que la pass joue (sur la livraison, sur la base) :
**oui**. Le reviewer et les jugements du manager : **non** — ils n'exécutent rien du projet.

### Ce qui ne se déclare pas

- Les noms par lesquels le runtime pilote ses cooks : `BRIGADE_*`, `ANTHROPIC_*`, `CLAUDE_*`,
  `GH_*`, `GITHUB_*`, `GIT_*`, `PATH`, `HOME`.
- **Rien de production** — aucun grant n'y touche. Le runtime ne sait pas ce qu'une valeur ouvre ;
  il refuse ce qui se reconnaît : un **nom** dont un mot est `PROD`, `PRODUCTION` ou `LIVE`, une
  **valeur** qui commence par `sk_live_` ou `rk_live_`. Le reste tient à ce que tu poses.
- **Une valeur de moins de 8 caractères** : ce n'est pas un secret mais une configuration, qui
  s'exporte depuis `.claude/brigade/worktree-setup.sh`.

### Quand il en manque un

Au moindre problème — un nom déclaré sans valeur, pas de `BRIGADE_SECRETS_FILE` alors que le dépôt
déclare, un fichier absent ou lisible par d'autres, une ligne mal écrite, un nom réservé, une
valeur trop courte, une marque de production — **rien n'est lancé** : le ticket passe **86** dix
minutes (`secrets-unavailable`) puis est reproposé, sans rien consommer ni compter au disjoncteur ;
**l'issue le dit, une fois**, en nommant chaque variable et le fichier — jamais une valeur. Ce qui
manque posé, le cook part à l'essai suivant. `npm run installation -- setup` joue le même contrôle
à blanc. Côté pass, des gates qui ne peuvent pas recevoir leurs secrets **ne sont pas jouées** —
jamais rouges pour cela : la livraison t'est remontée (`unjudged`, cause `secrets-unavailable`) et
n'est pas rejugée seule — les valeurs posées, retirer puis reposer `fire`. Un contrôle de la base
est « non joué », avec son motif.

### Aucune valeur ne se lit nulle part

Chaque valeur — exacte, ou sous sa forme dans un flux JSON — est remplacée par `[secret:NOM]`
partout où le runtime garde ou publie un texte venu d'un process qui a reçu les secrets :

le flux brut du cook (`runs/<run>.jsonl` et `.stderr`), masqué **à l'écriture**, ligne à ligne —
donc son compte-rendu (`cook.reported`), le commentaire de l'issue, le corps de la PR, la consigne
d'un renvoi ; la sortie du setup (journald) et des gates (`failures`, `tail`, commentaire de la
pass) ; et la relecture du reviewer, qui ne reçoit aucun secret mais lit un worktree où les gates
ont tourné avec eux.

**Une livraison qui porte un secret n'est pas poussée.** Avant le push, la station cherche les
valeurs dans tout ce que la branche ajoute — chaque patch, chaque message de commit, ce qu'elle a
récolté elle-même ; un binaire s'y lit comme du texte, un commit de merge montre ce qu'il change à
chacun de ses parents. Ce que l'origine a déjà reçu n'est pas relu. Trouvée : le cook est en échec
(``secret-committed: `NOM` ``), rien ne part, le ticket revient en attente — un **premier cook**
repart de la base sur une branche neuve ; un **renvoi de la pass** reprend la même branche, que la
station **ramène à la livraison refusée** (ce que le cook fautif y avait ajouté est perdu, et
l'issue le dit).

### Les identifiants de Claude ne sont pas poussés non plus

Le runtime **n'ouvre jamais** les identifiants du compte Max : le même contrôle, avant le push, les
reconnaît **à leur nom et à leur forme**, pour tout projet — avec ou sans secrets, avec ou sans
cloison — dans **ce que la branche ajoute** (lignes ajoutées de chaque commit, messages). Un jeton
écrit puis retiré deux commits plus loin est reconnu ; un jeton que la base portait déjà, non.

| Signe | Ce qui le déclenche |
|---|---|
| `name` | un commit **crée un fichier nommé `.credentials.json`**, où que ce soit, quel que soit son contenu. Le modifier ou le supprimer ne déclenche rien |
| `shape` | **un jeton de Claude** : `sk-ant-`, un type et deux chiffres, un tiret, puis au moins 40 caractères (`A`–`Z`, `a`–`z`, chiffres, `_`, `-`) — `oat01`, `ort01`, `api03` |
| `shape` | **la structure du fichier d'identifiants** : la clé `claudeAiOauth`, puis un `accessToken` ou un `refreshToken` d'au moins 20 caractères, guillemets échappés compris |

Reconnu : le cook est en échec (`credentials-committed: name`, `shape`, ou les deux), **rien n'est
poussé**, et le ticket revient en attente comme pour un secret. Le motif, le journal et l'issue
disent **le signe, jamais le chemin ni le contenu**. Pour voir, sur la station :
`git -C "$BRIGADE_REPO_DIR" log -p origin/<base>..<la branche que le commentaire nomme>`.

**Refusé à tort** (le commentaire de l'issue le dit au cook suivant) : un `.credentials.json`
propre au projet se commite par toi — un cook ne peut ni le créer ni renommer un fichier vers ce
nom, mais le modifie une fois sur la base ; un exemple de jeton s'écrit **tronqué** (moins de 40
caractères après `sk-ant-<type>-`) ou s'**assemble à l'exécution** ; un jeton entier que la base
porte déjà et qu'un cook rajoute ailleurs (ligne déplacée, fichier copié, base mergée) se tronque
sur la base, une fois pour toutes.

**Ce qu'il n'arrête pas** : une copie **transformée** — base64, chiffrée, découpée. C'est une
reconnaissance de forme, contre l'accident et l'injection par le ticket ou le diff. Trois choses
bornent le dégât : le réseau en liste blanche (« La cloison »), la **push protection de GitHub** —
à activer sur le dépôt par le chef (`installer.md`, « Protéger la branche d'intégration ») —, et la
révocabilité (« Révoquer la connexion Max »).

### Ni publiés dans ce qu'un cook dit

Le même reconnaisseur passe sur **tout texte qu'un process lancé par le runtime dit, avant qu'il ne
soit écrit** — pour tout projet, avec ou sans secrets, avec ou sans cloison : un jeton de Claude
(la forme ci-dessus), et dans la structure `claudeAiOauth` la valeur de `accessToken` et de
`refreshToken` dès 20 caractères, y laissent leur place à `[jeton Claude masqué]`. **Seul le jeton
part** : le texte autour reste, rien n'est refusé ni retenu.

- **Où** : le flux brut de chaque `claude` lancé — cook, reviewer, jugements et découpages du
  manager —, masqué **à l'écriture**, après les secrets du projet, et donc tout ce qui s'y lit
  (compte-rendu, commentaire, corps de PR, relecture, consigne d'un renvoi, décision d'un juge) ;
  la sortie du setup et des gates, avant d'être gardée. Le flux **quitte la machine** avec
  `sauvegarder` : c'est pourquoi il est masqué à la source.
- **Ligne à ligne** : une valeur livrée en deux morceaux est masquée quand même. Ce qui n'a pas
  son saut de ligne attend, jusqu'à **1 Mio** par sortie ; au-delà, c'est masqué et écrit sans lui,
  et la coupe ne tombe jamais dans ce qui peut être un jeton `sk-ant-…`.
- **Un masquage se lit, sans rien de la valeur** : `credentialsMasked` (combien de fois) dans
  `cook.exited` et dans `gates` de `pass.judged` et `base.checked` ; sur l'issue, `Masqué N fois :
  ce qui a la forme d'identifiants de Claude`. Le compte porte sur **tout le flux** : un process a
  lu la connexion du compte. Si ce sont de vrais identifiants : « Révoquer la connexion Max ».

### Ce qui n'est pas garanti

- **Une valeur transformée passe** — base64, chiffrée, découpée, à cheval sur deux lignes : le
  masquage est un filet contre l'accident, pas une clôture. La structure du fichier d'identifiants
  ne se reconnaît que **sur une ligne**.
- **Sur une ligne de plus de 1 Mio, seul le jeton `sk-ant-…` est tenu** : un secret du projet ou la
  structure du fichier d'identifiants, à cheval sur deux tranches, n'y sont pas reconnus.
- **Sans cloison, le cloisonnement entre projets tient aux droits de fichiers** : un cook tourne
  sous le compte du runtime et peut lire le fichier de secrets de son projet en entier, et celui
  d'un autre. **Avec la cloison, ni l'un ni l'autre** : seules les valeurs déclarées lui
  parviennent, par son environnement.
- Ne sont pas masqués : le **transcript de session** de `claude` (`~/.claude/projects`, qui reste
  sur la machine et garde les identifiants Max s'ils y sont passés) ; ce que les gates du projet
  écrivent elles-mêmes sur le disque ; un commentaire qu'un cook poste lui-même sur GitHub — sous
  une identité par rôle, il n'en a aucune.

