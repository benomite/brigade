# Identités, secrets, cloison et arbitre

Page du [runtime de la V2](README.md) ; l'index dit où trouver le reste.

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

## La cloison

Sans elle, tout ce que le runtime lance — setup, cook, gates, reviewer, juges — tourne sous le
compte du service : un cook lit l'état, le clone, les worktrees et les secrets des **autres**
projets, le fichier de secrets du sien en entier, les clés des GitHub Apps, et parle à tout
Internet. Le runtime le dit à chaque démarrage (`cloison — aucune …`, `réseau — ouvert …`). Elle se
pose **projet par projet**, en deux moitiés indépendantes :

- **Les fichiers et les process**, à chaque lancement, par `bwrap` (bubblewrap) : son espace de
  montage et son espace de process, sans privilège.
- **Le réseau**, au projet : l'unité `brigade@<projet>` ne joint que la boucle locale ; sa seule
  sortie est **la porte**, `brigade-porte@<projet>`.

**Sur une station installée par le paquet, la cloison est posée pour tous les projets, sans
réglage** : l'unité `brigade-station` ne joint que la boucle locale, et `brigade-station-porte`
tient une porte par projet de sa configuration — chacune avec la liste blanche de son projet, lue
au journal de ce projet, qui y reçoit aussi ses refus — et celle de la station elle-même
(Anthropic et GitHub seulement). Personne ne choisit leurs ports : chaque porte reprend le sien ou
en prend un libre, et les écrit dans `/var/lib/brigade/portes.json`, d'où la station donne à chaque
projet le sien ; une ligne de la configuration qui nomme sa porte (`BRIGADE_PROXY_PORT`) est
refusée. Un projet dont la porte n'a pas encore dit son port attend, et la station le dit ; la
station elle-même attend la sienne avant de rien joindre. La bascule arrête les
`brigade-porte@<projet>` de l'ancienne installation et remet leurs ports aux portes de la station :
même port, même liste — un cook en vol retrouve la sienne. Les refus se lisent par
`journalctl -u brigade-station-porte`.

La frontière des fichiers passe **entre le runtime et ce qu'il lance** : ce qu'il fait lui-même —
`git`, `gh`, `claude auth status` — n'est pas cloisonné.

### Ce qu'un lancement cloisonné voit

| | |
|---|---|
| **Masqué** — un répertoire vide à la place | chaque répertoire de `BRIGADE_SANDBOX_HIDDEN` : sur la box `/var/lib/brigade` et `/etc/brigade`, donc l'état, le clone, les worktrees, les secrets et les clés de **tous** les projets, le sien compris |
| **Rendu, en écriture** | son worktree, et **sa vue du `.git` du clone** : objets, références et worktrees sont les vrais ; la `config` et les `hooks` sont **les siens** |
| **Rendu, en lecture seule** | au reviewer, le worktree et la vue du `.git` ; au cook sans identité GitHub, son ticket remis |
| **En lecture seule** | toute la machine, **et le répertoire du compte** : son `.gitconfig`, ses chaînes d'outils, le binaire `claude` |
| **Au projet, en écriture** | ce qui s'écrit sous `~` : `~/.npm`, `~/.cache`, `~/.claude.json`, toute entrée que le compte n'a pas — dans `~` comme dans `~/.local`, `~/.local/share` et `~/.local/state` —, et ce que nomme `BRIGADE_SANDBOX_PRIVATE` — rangé dans `<état>/compte` |
| **En écriture, tel quel** | `/tmp` (celui du projet : `PrivateTmp`) |
| **Remplacé** | `~/.claude` : celui du projet, `<état>/claude` — ni transcripts ni mémoire d'un autre projet |
| **Identifiants Max** | `~/.claude/.credentials.json`, monté **en lecture seule** : `claude` les lit, rien ne les réécrit |
| **Process** | les siens : ni `ps` ni `/proc/<pid>/environ` ne montrent un autre cook |

**Rien de ce qu'un cook écrit n'est lu comme configuration, ni exécuté, par le runtime** — dont le
`git`, le `gh` et le `claude` tournent hors cloison, sous le même compte et dans le même clone :

- **Le compte** est en lecture seule : un `git config --global` échoue, un `npm ci` écrit son
  cache dans celui du projet. **Les outils écrivent leur cache à leur place habituelle, sans
  réglage** : `~/.cache`, `~/.npm`, et sous `~/.local/share` et `~/.local/state` ce que le compte
  n'y a pas (le store de pnpm, `~/.local/share/pnpm`) ; jest écrit dans `/tmp`. Ce cache est au
  projet, dans `<état>/compte` : retrouvé d'un ticket à l'autre, jamais partagé avec un autre
  projet. Ce que le compte garde sous `~/.local` (le binaire `claude`) reste en lecture seule.
  Une chaîne d'outils qui écrit sous `~` (`~/.cargo`, `~/.gradle`) se nomme dans
  `BRIGADE_SANDBOX_PRIVATE` (noms séparés par `:`) : le projet a la sienne, vide au départ.
- **Le `.git`.** Ce qu'un lancement y configure (`git config`, `git remote add`, husky) va dans la
  `config` de sa vue, que le `git` du runtime ne lit jamais. La cloison pose `gc.auto=0` et
  `maintenance.auto=false` dans le clone servi. **Ne lance pas `git gc` ni `git pack-refs` à la
  main dans ce clone pendant qu'un cook tourne.**
- **Le worktree**, où le runtime lance `git` hors cloison : il lit lui-même le fichier `.git` du
  worktree et son `commondir`, et **impose le dépôt à `git`**. Un fichier qui ne mène plus au clone
  est un **refus** (``ne désigne plus son dépôt dans le clone (fichier `.git` réécrit)``, ou
  ``(`commondir` réécrit)``) : au tick, un avertissement ; à la fin du cook, la livraison échoue,
  rien n'est poussé, le worktree est gardé. Il **ne descend dans aucun sous-module** : ce qu'un
  cook y change n'est ni un progrès ni récolté — à lui de commiter le pointeur. `core.fsmonitor`
  et `core.hooksPath` sont neutralisés. Ces protections valent aussi sans `bwrap`, sans la
  remplacer : sans elle, la `config` et les `hooks` du clone restent inscriptibles par le cook.

**Le runtime refuse de démarrer** si la cloison laisse dehors ce qu'elle doit cacher —
`BRIGADE_STATE_DIR`, `BRIGADE_REPO_DIR`, `BRIGADE_SECRETS_FILE` ou `BRIGADE_GITHUB_APPS_DIR` hors
de tout répertoire masqué —, si elle masquerait le compte, `/tmp` ou le système, si un masque est
un fichier, ou si elle est posée à moitié.

### La liste blanche

Sur les ports 443 et 80 : `anthropic.com`, `claude.ai`, `claude.com`, `github.com`,
`githubusercontent.com`, leurs sous-domaines, et ce que le dépôt déclare dans
`.claude/brigade/reseau`. **Aucun registre de paquets n'est ouvert d'office.**
`/brigade:init` écrit ce fichier — il le déduit de ce que le `worktree-setup.sh` installe, et laisse
un fichier vide commenté, jamais un fichier absent, quand il n'a rien à ouvrir ou n'a pas su traduire
l'outil. Les hôtes viennent des lignes d'installation connues et des URLs que le setup nomme
(`https://cdn.sheetjs.com/…` donne `cdn.sheetjs.com`) ; `runtime/src/reseau-cli.ts` fait cette
déduction et écrit le fichier dans tous les cas, sans jamais réécrire un fichier déjà là.
C'est une proposition : elle n'ouvre rien tant qu'elle n'est pas mergée.

```
# .claude/brigade/reseau — un hôte par ligne
registry.npmjs.org
*.pythonhosted.org          # l'hôte et ses sous-domaines
base.exemple.org:5432       # un autre port que 443 et 80
```

Ni adresse IP, ni `*` seul, ni `*.com` : une ligne qui n'est pas un hôte n'ouvre rien, et
`npm run partition` la montre.

**La déclaration se lit sur la branche d'intégration, pas dans le worktree du cook** — à l'inverse
des secrets. Un hôte s'ouvre donc par un **merge**, que la pass ne fait jamais elle-même
(`review-required`, cause `declaration-modified: …`). Le runtime la relit chaque fois qu'il
rapatrie la base et à chaque tick (`network.declared`) ; la porte lit sa liste là, sans redémarrer.
**Le runtime sort par la porte, lui aussi** : avec `BRIGADE_PROXY_PORT`, il pose `HTTPS_PROXY`,
`HTTP_PROXY` et `NO_PROXY` pour lui-même et pour tout ce qu'il lance. **`git` en SSH ne passe
pas** : l'origine du clone doit être en `https`.

### Un refus se lit

| Ce qui est tenté | Ce que le process reçoit | Où tu le lis |
|---|---|---|
| un hôte hors liste, par la porte | `403`, aussitôt ; en clair, la réponse nomme l'hôte et le geste qui l'ouvre | `npm run partition` (`network.refused`), `journalctl -u brigade-porte@<projet>` |
| une connexion qui contourne la porte | le noyau jette ses paquets : UDP reçoit `EPERM`, **TCP attend le délai de son client** — à confirmer sur la box | nulle part |
| un hôte permis qui ne répond pas | `502` | la réponse |

Un événement par hôte et par dix minutes, cent hôtes nommés au plus. **Le filtre de l'unité est
sondé à chaque démarrage** : s'il ne tient pas, le runtime le dit — `MAIS un envoi direct part :
l'unité ne semble rien filtrer (IPAddressDeny)`. Son verdict se confirme sur la box (recette).

### Ce qui est refusé, et pourquoi

`BRIGADE_STATE_DIR=<répertoire d'état> npm --prefix runtime run partition` lit le journal
(`isolation.configured`, écrit au démarrage quand l'état de la cloison change) et montre :
`fichiers` (`CLOISONNÉS` ou `OUVERTS`, ce qui est masqué), `réseau` (`LISTE BLANCHE` ou `OUVERT`,
et si l'unité filtre), `ce qui passe` (chaque hôte, et d'où il vient), et les `derniers refus`.

### L'éprouver, et ce qu'elle coûte

```bash
brigade <projet> partition probe [<essais>]
```

De vraies sondes, sans cook ni quota : le lancement part dans `bwrap`, chaque répertoire masqué
est vide, les identifiants Max sont en lecture seule, les outils écrivent leur cache sous `~`
(`~/.cache`, `~/.npm`, `~/.local/share`, `~/.local/state`), les process des autres sont invisibles,
`claude` retrouve la connexion Max ; puis le coût d'un lancement. Une sonde en échec rend le code
1 et dit pourquoi. À jouer sur la box : c'est une étape de la recette.

### Les transcripts du projet sont rangés

Sous cloison, `claude` écrit ses transcripts dans `<état>/claude/projects/`, et **le runtime les
range** — au démarrage, puis une fois par jour. Part un transcript que rien n'a écrit depuis
`BRIGADE_TRANSCRIPTS_KEEP_DAYS` jours (`7` par défaut ; `0.5` vaut douze heures), avec son
répertoire de session. Reste tout ce qui a été écrit depuis le départ du plus ancien lancement
encore en cours, et ce qui n'est pas un transcript (la mémoire du projet, ses réglages). Un lien
n'est jamais suivi. Chaque passage est au journal — `transcripts.tidied` (`removed`, `freedBytes`,
`kept`, `keptBytes`, `keepMs`) —, et `status` montre le dernier ; un projet qui redémarre sans
cloison écrit `transcripts.released`, une fois. **Sans cloison, rien n'est rangé** : les transcripts
vont sous le `~/.claude` du compte, auquel le runtime ne touche jamais. Un transcript retiré n'est
pas perdu pour le diagnostic : le flux brut reste sous `runs/`, et lui est sauvegardé.

### Ce qui n'est pas garanti

- **Rien de cela n'a encore tourné sur la box.** Deux choses ne se prouvent que là-bas : le filtre
  de l'unité (`IPAddressDeny`), et le vrai `claude` sous cloison — dont le jeton Max se renouvelle
  peut-être mal en lecture seule (un cook qui finit `disconnected` alors que `claude auth status`,
  hors cloison, répond connecté).
- **Les identifiants Max restent lisibles du cook.** « Non copiables » tient à la liste blanche et
  à l'absence de montage partagé ; reste la branche poussée, où la station refuse leur nom ou leur
  forme (`credentials-committed`). Une copie transformée passe.
- **Le répertoire du compte reste lisible de tous les projets**, en lecture seule. Ce qu'il garde
  de sensible (`~/.ssh`, `~/.config/gh`) s'ajoute à `BRIGADE_SANDBOX_HIDDEN` ; un fichier seul
  (`~/.netrc`) ne se masque pas, c'est son répertoire qui se masque.
- **Un clone où `extensions.worktreeConfig` est activé rouvre le chemin** de la configuration : ne
  l'active pas dans le clone servi. **Un cook peut faire échouer la livraison d'un autre cook du
  même projet** : `<clone>/.git/worktrees/`, les objets et les références sont partagés en
  écriture. Réécrire le répertoire d'un voisin ne fait rien lancer — sa livraison est refusée.
- **Les filtres que la configuration du compte ou du clone nomme restent appelés** (`git-lfs`).
- **Le cache du compte n'est plus partagé** : chaque projet remplit le sien, que rien ne range. Du
  `~/.claude` du projet, seuls les transcripts sont rangés ; il n'est pas sauvegardé.
- **La boucle locale est commune aux projets** : un service sur `localhost` est joignable de tous,
  et n'a pour protection que son mot de passe. **La résolution de noms reste ouverte** : un tunnel
  DNS sort. **`github.com` est en liste blanche** : sous l'identité unique, le cook y écrit avec le
  compte de la machine — la clôture est une identité par rôle.

## L'arbitre entre projets

Dès qu'un second projet tourne sur la machine, le compte Max et la machine sont partagés.
L'arbitre est le process qui les additionne : **un seul par machine**, sans LLM. Il ne répond qu'à
une question : *ce projet peut-il lancer un cook de plus ?* Il est **facultatif** — sans lui, un
projet tourne comme avant (`arbitre — aucun`). On le désigne à un runtime par
`BRIGADE_ARBITER_PORT`.

### Ce qu'il sait, et d'où

Chaque runtime lui **redit** l'état de son projet — ses cooks de tickets en cours, s'il a des
tickets qu'il pourrait lancer, s'il les retient pour « machine saturée », ce que ses cooks ont
consommé — à chaque demande de place, à chaque changement, à chaque tick, et en s'arrêtant. Un
projet arrêté par le chef, au disjoncteur ouvert, à la base rouge, déconnecté, au quota épuisé ou à
son propre plafond **ne demande rien**. L'arbitre garde ce dernier mot **en mémoire**, et ne compte
que les cooks de **tickets**. Sur disque (`arbitre.db`, dans `BRIGADE_ARBITER_STATE_DIR`) : tes
réglages seuls, relus à chaque décision.

### La règle

`P` est le plafond de cooks du compte, tous projets confondus (`BRIGADE_ARBITER_MAX_COOKS`, **sans
défaut** : l'arbitre refuse de démarrer sans). Un projet **compte** s'il a des cooks, des tickets
qui attendent, ou s'il est connu et n'a pas reparlé.

- **Chaque projet qui compte a une part** : le plafond au prorata de son poids, arrondi vers le
  bas, **jamais moins d'une place**. **Sous sa part, il passe**, tant que le compte n'est pas plein.
- **Au-delà, il emprunte** les places que personne ne demande — jamais tant qu'un projet connu n'a
  pas reparlé. **Sans préemption** : l'arbitre ne tue jamais un cook, il retient le suivant.
- **Quand la machine sature** (un runtime dit retenir des tickets pour elle), les parts se
  calculent sur **le nombre de cooks en cours** et plus personne n'emprunte.

Un projet refusé le lit comme une retenue : `station.held`, motif `arbiter`, dans `run status` et
`run station`. Il redemande à son réveil suivant — une minute au plus.

### Arbitre injoignable : le projet lance quand même

Quand l'arbitre désigné ne répond pas (connexion refusée, réponse illisible, dix secondes de
garde), le projet passe en **mode dégradé** : **au plus un cook de ticket à la fois**, les cooks
déjà partis finissent. C'est écrit **une fois** à l'entrée (`station.unarbitrated`, et
`journalctl`), une fois au retour (`station.arbitrated`) ; chaque cook parti ainsi porte
`unarbitrated: true` ; `run status` (`ARBITRE INJOIGNABLE depuis …`) et `run station` le montrent.
Chaque tentative de lancement redemande d'abord : dès que l'arbitre répond, la marche reprend.

### Quand il redémarre

Il repart **vide**. Tant qu'un projet **connu n'a pas reparlé**, sa part reste **réservée** (`N'A
PAS REPARLÉ depuis …`) ; elle se libère s'il reparle, si son runtime s'arrête proprement, ou si tu
le retires. **Arrêté pour de bon sans arrêt propre, il la garde jusqu'à ce que tu le retires.**

### Le lire, et le régler

```bash
export BRIGADE_ARBITER_PORT=<port> BRIGADE_ARBITER_STATE_DIR=<répertoire de l'arbitre>
npm --prefix runtime run arbiter                          # l'état
npm --prefix runtime run arbiter -- weight thermigo 3     # « thermigo est prioritaire cette semaine »
npm --prefix runtime run arbiter -- remove vieux-projet   # sa part n'est plus réservée
```

Par projet : son poids, ses cooks en cours, sa **`part`**, et **`encore`** — ce qu'il pourrait
lancer de plus à l'instant, emprunts compris ; `machine` dit `SATURÉE d'après <projets>`. **Le
poids** est un entier, 1 par défaut, durable, sans échéance ; il ne touche à aucun plafond — ni
celui du compte, ni celui de chaque projet (`run station -- cooks <N>`). **La consommation des
cooks n'est pas celle du compte**, et l'arbitre ne retient rien à cause d'elle. Arbitre
injoignable, la commande le dit et sort avec le code 1.

### Ce qui n'est pas garanti

- **Un runtime mort sans le dire laisse son dernier mot** à l'arbitre jusqu'à ce qu'il reparle ou
  que tu le retires. **Juste après un redémarrage de l'arbitre**, ce qui avait été emprunté avant
  tourne encore : le plafond peut être dépassé de cet emprunt, le temps que ces cooks finissent.
- **Un cook joint la boucle locale**, donc l'arbitre : il pourrait y parler au nom d'un projet, et
  fausser un compte que le runtime redit à l'échange suivant. Il ne peut pas régler les poids, que
  la cloison lui masque.
- **L'arbitre ne connaît pas le quota du compte** : voir « 86 : le quota est épuisé ».
