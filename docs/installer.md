# Installer brigade dans un projet

**On installe brigade dans un projet ; on n'ajoute pas un projet à brigade.** Le runtime est par
projet, et brigade ne tient aucune liste de projets : ce qui est propre au projet vit **dans son
dépôt**, ce qui est propre à la machine vit **sur la machine**, et rien d'un projet n'est écrit
dans le code ni dans la configuration de brigade. Un projet où brigade est installée reste
autonome — on la désinstalle sans rien y casser (voir « Désinstaller »).

Ce document est le parcours, dans l'ordre. Ce que fait le runtime une fois lancé est dans
[`runtime.md`](runtime.md).

| Étape | Où | Ce qui en sort |
|---|---|---|
| 1. Amorcer le dépôt | le dépôt du projet, une session Claude Code | bindings, `gates.sh`, `worktree-setup.sh`, mergés sur la branche d'intégration |
| 2. Joindre la box | ta machine | `ssh <box> true` réussit, sans rien te demander |
| 3. Préparer la machine | la box, compte du service | l'unité, les neuf variables, le clone réservé |
| 4. Vérifier | la box, puis ta machine | « prêt », ou la liste de tout ce qui manque |
| 5. Créer les labels | la box | `fire`, `prio:`, `model:`, `effort:` sur le dépôt |
| 6. Mesurer le setup | la box | ce que coûte l'entrée d'un cook, et si elle tient à 30 |
| 7. Servir le premier ticket | la box | une PR ouverte, **non mergée** |

Une box, une machine ou un humain **de plus** ne rejoue pas ce parcours : chacun a son geste, dans
« Ajouter une box, une machine, un humain ».

## Ce qui vit où

| Quoi | Où | Qui le lit |
|---|---|---|
| Branche d'intégration, zones de fichiers, dev local, plafond des gates | le bloc de bindings du `CLAUDE.md` du dépôt | les cooks, les gates |
| Ce que « vert » veut dire | `.claude/brigade/gates.sh` du dépôt | la pass |
| Ce qui rend un worktree exécutable — dépendances, build, ports | `.claude/brigade/worktree-setup.sh` du dépôt | la station, avant chaque cook ; la pass, avant les gates |
| Les labels du rail | le dépôt GitHub | le runtime, le chef |
| Les neuf variables | l'unité `brigade@.service` et le drop-in de **l'instance** | le runtime |
| Le clone réservé, les worktrees, le journal | `/var/lib/brigade/<projet>/` | le runtime |
| La session Max, `gh` connecté, l'identité git | le compte du service | les cooks, le runtime |

Le runtime ne lit pas les bindings : il lit ses variables. La **branche d'intégration** est donc
écrite deux fois — dans les bindings pour les cooks, dans `BRIGADE_BASE_BRANCH` pour la station —
et la vérification refuse qu'elles diffèrent.

## 1. Amorcer le dépôt

Dans le dépôt du projet, sur un poste de dev, avec le plugin brigade :

```
/brigade:init
```

C'est le chemin de la V1, et la V2 n'en invente pas un second : `init` pose le bloc de bindings,
écrit les deux scripts, les **prouve** sur un worktree jetable, et se rejoue sans dégât. Puis
**merge le résultat sur la branche d'intégration** : le runtime ne voit que ce qu'elle porte sur
l'origine.

Ce que la V2 attend de chacun :

| Fichier | Contrat | S'il manque |
|---|---|---|
| `CLAUDE.md`, bloc « ## Équipe multi-agents » | **Branche d'intégration** égale à `BRIGADE_BASE_BRANCH` (absente, elle vaut `main`). **Zones de fichiers**, **Dev local**, **Plafond des gates** : pour le cook et les gates | bloc absent ou branche différente : **pas prêt**. Une des trois autres lignes : signalé, rien n'est retenu |
| `.claude/brigade/gates.sh` | exécutable ; `gates.sh <worktree>`, **le code de sortie est le verdict** | **pas prêt** — la pass remonterait chaque livraison (`unjudged`, cause `no-gates`) |
| `.claude/brigade/worktree-setup.sh` | exécutable ; `worktree-setup.sh <n> <worktree>`, n'imprime que des `export` sur sa sortie | signalé : le cook part dans un worktree neuf tel quel, sans dépendances |

Trois choses à savoir en écrivant le setup d'un vrai projet — un build, des dépendances, un
service. Le détail est dans `runtime.md`, « Le setup du worktree passe avant le cook ».

- **Il est joué une fois par cook**, et une fois encore par la pass avant les gates. Sur un dépôt
  qui installe et compile, c'est le coût d'entrée de chaque ticket : l'étape 6 le mesure.
- **Les ports se dérivent du numéro reçu**, jamais écrits en dur : plusieurs cooks tournent en même
  temps sur la même machine. Le numéro `0` est celui de la sonde de l'étape 6, jamais d'un ticket.
- **Il ne laisse rien tourner** : un service dont le cook a besoin se démarre depuis le cook ou
  depuis les gates. Et aucune variable `BRIGADE_*` du runtime ne lui parvient.

## 2. Joindre la box

**Le lien entre ta machine et la box est `ssh`, et rien d'autre.** Tout ce qui lit ou pilote un
projet depuis ta machine — toi dans un terminal, l'app — lance `ssh <box> brigade <projet>
<commande>`. Il n'y a donc **rien à installer sur ta machine** : ce qu'elle a déjà pour ouvrir un
terminal suffit. Et c'est toujours ta machine qui joint la box, jamais l'inverse : aucune étape ne
pose une clé de la box ailleurs, ni n'ouvre un tunnel depuis elle. La box n'a aucun accès à la
prod, et t'y joindre ne t'en donne aucun.

`<box>` est, partout dans ce document, **ce que tu passes à `ssh`** : `<ton compte>@<adresse>`, ou
un nom de ton `~/.ssh/config`. C'est la seule chose qui désigne la box — la même valeur est le
champ `hote` du projet dans l'app ([`app.md`](app.md)).

Ce qu'il faut, et rien de plus :

| Quoi | Où | Comment |
|---|---|---|
| Une adresse que ta machine joint | la box | une adresse publique, `sshd` ouvert **par clé seulement** (`PasswordAuthentication no`) |
| Un compte **à toi** sur la box, qui porte ta clé publique et **lance la commande qu'on lui envoie** | la box | sur une box neuve, celui que le fournisseur crée avec ta clé ; sinon « Ajouter un humain ». Un compte enfermé dans une session (`ForceCommand`) ne convient pas : `true` n'y serait pas lancé |
| Ta clé privée, dans ton agent si elle a une phrase de passe | ta machine | `ssh-add` — l'app lance `ssh` sans terminal, il ne peut rien te demander |

**Un VPN n'est pas une étape.** Tailscale ou WireGuard servent une box qui n'a pas d'adresse
joignable : c'est une option de déploiement de cette box-là, et elle oblige chaque machine
lectrice à l'installer — ce qu'un poste administré peut interdire. Derrière un VPN, `<box>` est
l'adresse que le tunnel donne ; le reste de ce document ne change pas.

**La vérification**, depuis ta machine. Le code de sortie est le verdict :

```bash
ssh -o BatchMode=yes -o ConnectTimeout=10 <box> true; echo $?
```

| Ce que tu lis | Ce que c'est | Le geste |
|---|---|---|
| `0` | la box est jointe, sous ton compte, sans rien te demander | passe à l'étape 3 |
| `255`, `Could not resolve hostname` ou `Operation timed out` | l'adresse : `ssh` n'a pas trouvé la machine | corrige `<box>`, ou ouvre le port de `sshd` |
| `255`, `Permission denied (publickey)` | la machine répond, ta clé n'y est pas — ou n'est pas dans ton agent | `ssh-add -l` sur ta machine ; sur la box, « Ajouter un humain » |
| `255`, `Host key verification failed` | ta machine ne connaît pas encore cette box, et `BatchMode` interdit de te le demander | `ssh <box>` une fois, à la main, pour accepter sa clé |

`BatchMode=yes` est ce que l'app passe : une connexion qui ne réussit qu'en te demandant quelque
chose réussit dans ton terminal et échoue dans l'app. Cette étape ne prouve que le lien ; que tu
peux **lancer la commande d'un projet** se vérifie à l'étape 4, quand il y en a un.

## 3. Préparer la machine

Les prérequis de la machine elle-même — Node 26, `claude` connecté en Max, `gh` connecté, une
identité git qui pousse, la branche d'intégration protégée — sont dans `runtime.md`, « À vérifier
avant d'installer ». L'unité se copie **une fois par machine**, pas par projet (`runtime.md`,
« Installer »).

Trois de ces prérequis ne se voient pas tant qu'on n'a pas buté dessus — c'est arrivé à la recette
du 2026-10-09, sur un Debian 12 nu :

| Ce qui arrive | Ce qui le vérifie | Ce qui le règle |
|---|---|---|
| Node 26 ne démarre pas : `error while loading shared libraries: libatomic.so.1` | `node --version` | `sudo apt install libatomic1` |
| `claude` est sous `~/.local/bin` du compte, hors du `PATH` que systemd donne à l'unité : **aucun cook ne part** | `systemctl show brigade@<projet>.service -p Environment --value` ne montre aucun `PATH=` qui le contienne ; l'étape 4 le nomme | `sudo systemctl edit brigade@.service` : `Environment=PATH=/home/<compte>/.local/bin:/usr/local/sbin:/usr/local/bin:/usr/sbin:/usr/bin` |
| `/tmp/claude-<uid du compte>` existe et n'est pas au compte : `claude` s'y refuse (`Temp directory … is owned by uid 0 … Refusing to use it`) — la connexion Max, et chaque cook d'une unité sans cloison | `ls -ld /tmp/claude-"$(id -u <compte>)"` ; l'étape 4 le nomme | `sudo chown -R <compte> /tmp/claude-"$(id -u <compte>)"`, ou `CLAUDE_CODE_TMPDIR=<un répertoire du compte>` dans le shell de la connexion et dans le drop-in de l'unité |

Le détail est aux points 2, 11 et 12 de « À vérifier avant d'installer ».

Par projet, il reste trois gestes. `<projet>` est un identifiant court que tu choisis (minuscules,
chiffres, tirets) : il nomme l'instance, rien d'autre ne le relie au dépôt.

**Le clone réservé**, sous le compte du service. Personne n'y travaille : la station y accroche
les worktrees des cooks.

```bash
sudo install -d -o <compte> /var/lib/brigade/<projet>
sudo -u <compte> git clone https://github.com/<owner>/<repo>.git /var/lib/brigade/<projet>/depot
```

**Le drop-in de l'instance** — `sudo systemctl edit brigade@<projet>.service` :

```ini
[Service]
Environment=BRIGADE_GITHUB_REPO=<owner>/<repo>
Environment=BRIGADE_BASE_BRANCH=<branche d'intégration>
Environment=BRIGADE_MANAGER_MODEL=<opus|sonnet|haiku>
Environment=BRIGADE_MANAGER_EFFORT=<low|medium|high|xhigh|max>
Environment=BRIGADE_REVIEWER_MODEL=<opus|sonnet|haiku>
Environment=BRIGADE_REVIEWER_EFFORT=<low|medium|high|xhigh|max>
```

**La sauvegarde** du journal : `runtime.md`, « Installer la sauvegarde ».

**La cloison**, si la machine sert — ou servira — un autre projet : `runtime.md`, « Installer la
cloison ». Sans elle, ce projet et les autres se voient, fichiers et secrets compris, et ses cooks
joignent tout Internet ; le runtime le dit à chaque démarrage. Avec elle, **le dépôt doit déclarer
ses registres de paquets** dans `.claude/brigade/reseau` (un hôte par ligne, mergé sur la branche
d'intégration) : aucun n'est ouvert d'office, et un setup qui installe des paquets échouerait.
Une déclaration mergée après coup est lue à la prise du ticket suivant, avant son setup — rien à
redémarrer, aucun ticket perdu.
Et le compte du service devient en lecture seule pour ses lancements : une chaîne d'outils qui
écrit sous `~` se nomme dans `BRIGADE_SANDBOX_PRIVATE`.

**La push protection de GitHub**, sur le dépôt du projet : `runtime.md`, « À vérifier avant
d'installer », point 10 — comment l'activer, comment vérifier qu'elle l'est, et quoi conclure si
le plan ne la donne pas. La station refuse déjà de pousser une livraison qui porte le nom ou la
forme des identifiants de Claude ; celle-ci est la seconde barrière, côté serveur, et **elle ne se
suppose pas**. Le jour où tu crois que la connexion Max a fui : `runtime.md`, « Révoquer la
connexion Max ».

**L'arbitre**, si la machine sert un autre projet : `runtime.md`, « Installer l'arbitre ». Sans
lui, chaque projet se tient pour seul sur la machine et sur le compte Max : leurs plafonds de cooks
s'additionnent, et rien ne dit qui passe devant. Avec lui, **chaque** projet porte
`BRIGADE_ARBITER_PORT` dans son drop-in — un projet qui ne l'a pas n'est ni arbitré ni compté.

Les **neuf variables** sans lesquelles le runtime refuse de démarrer, et d'où chacune vient :

| Variable | Posée par |
|---|---|
| `BRIGADE_STATE_DIR`, `BRIGADE_PROJECT`, `BRIGADE_REPO_DIR` | l'unité, d'après le nom de l'instance — rien à écrire |
| `BRIGADE_GITHUB_REPO`, `BRIGADE_BASE_BRANCH` | le drop-in de l'instance |
| `BRIGADE_MANAGER_MODEL`, `BRIGADE_MANAGER_EFFORT`, `BRIGADE_REVIEWER_MODEL`, `BRIGADE_REVIEWER_EFFORT` | le drop-in de l'instance — c'est ton quota, il n'a pas de défaut |

Les variables facultatives et les réglages à défaut sont dans `runtime.md`, « Neuf variables,
aucun défaut ».

**Ne démarre pas encore le service** : vérifie d'abord.

## 4. Vérifier que le projet est prêt

Une commande dit si un cook peut partir, **et nomme tout ce qui manque d'un coup** — pas le
premier manque. Elle ne lance ni cook ni setup, ne consomme aucun quota, n'écrit rien sur GitHub
et n'ouvre pas le journal ; dans le clone réservé, elle ne déplace aucune référence. Elle se rejoue
autant qu'on veut, service arrêté ou non.

Elle lit **l'environnement du service**, comme le runtime : sur la box, elle se lance par le geste
`brigade <projet> <commande>`, qui le lui donne (`runtime.md`, « Piloter » ; il se pose avec
l'unité, « Installer »). Il ne connaît un projet qu'à son drop-in — celui de l'étape 3.

```
$ brigade calculus installation

Sur la machine
  ok        les 9 variables obligatoires sont posées, et tout ce que le runtime lit de son environnement est lisible
  ok        clone réservé : /var/lib/brigade/calculus/depot, `main` lue sur l'origine (a1b2c3d)
  ok        session Max : `claude` est connecté sous ce compte
  ok        unité de service : brigade@calculus.service

Dans le dépôt
  MANQUE    `.claude/brigade/gates.sh` n'est pas exécutable : la pass le lance tel quel
            → `git update-index --chmod=+x .claude/brigade/gates.sh`, commité sur `main`
  ok        setup du worktree : `.claude/brigade/worktree-setup.sh`
  ok        bindings : bloc présent, branche d'intégration `main`

Sur GitHub
  ok        dépôt lu par `gh` : BOBL-tech/calculus-workspace
  MANQUE    labels absents du dépôt : fire, model:opus, model:sonnet, …
            → la même commande, suivie de `labels`

brigade : projet « calculus » : 2 manques : aucun cook ne doit être lancé tant qu'il en reste
```

| Marque | Ce qu'elle veut dire | Code de sortie |
|---|---|---|
| `ok` | constaté | |
| `MANQUE` | un cook lancé maintenant échouerait, ou sa livraison ne serait pas jugée. Le geste qui le règle suit la flèche | `1` dès qu'il y en a un |
| `à savoir` | rien n'est retenu, mais tu dois le savoir : pas de setup, sauvegarde non programmée, binding que le runtime ne lit pas | |

Sans aucun `MANQUE`, elle sort en `0` et dit « prêt ».

Ce qu'elle contrôle :

| Où | Quoi |
|---|---|
| Machine | les neuf variables, **toutes** celles qui manquent ; chaque réglage mal écrit, avec les mots que le runtime emploierait pour refuser de démarrer ; aucune clé ni jeton `claude` dans l'environnement |
| Machine | le clone réservé existe, c'est bien celui du dépôt désigné, son origine répond sous ce compte, et la branche d'intégration y existe |
| Machine | `claude` est connecté (`claude auth status`, aucun appel au modèle) ; l'unité `brigade@<projet>.service` est installée ; la sauvegarde est programmée |
| Machine | `claude` se trouve dans le `PATH` **que l'unité donnera au runtime** — celui de ses drop-ins, ou le défaut de systemd —, pas dans celui du shell qui lance la commande ; son répertoire temporaire (`/tmp/claude-<uid>`, ou sous `CLAUDE_CODE_TMPDIR`) est au compte, s'il existe |
| Dépôt | sur la branche d'intégration **telle que l'origine la porte** : gates et setup présents et exécutables, bloc de bindings, branche d'intégration cohérente |
| GitHub | `gh` lit le dépôt sous ce compte ; les labels du rail y sont |

Ce qu'elle ne contrôle **pas** : que le setup et les gates *réussissent* (l'étape 6 joue le setup ;
les gates se prouvent par `/brigade:init`), les droits d'écriture du compte sur le dépôt et la
protection de la branche (l'identité GitHub du projet, #174), ses secrets (#175), la push
protection du dépôt (`runtime.md`, « À vérifier avant d'installer », point 10). Quand elle ne
peut pas lire le dépôt — clone absent, branche introuvable — elle le dit (`dépôt non vérifié`) au
lieu de le déclarer bon.

Les deux manques que la recette a rencontrés se lisent ainsi :

```
  MANQUE    `claude` est introuvable dans le `PATH` que l'unité brigade@calculus.service donnera au runtime (/usr/local/sbin:/usr/local/bin:/usr/sbin:/usr/bin, le défaut de systemd : aucun `Environment=PATH=` dans ses drop-ins) : aucun cook ne partirait — le `PATH` du shell qui lance cette commande ne compte pas
            → `sudo systemctl edit brigade@calculus.service`, puis `[Service]` et `Environment=PATH=/home/brigade/.local/bin:/usr/local/sbin:/usr/local/bin:/usr/sbin:/usr/bin` — l'installeur natif pose `claude` sous `~/.local/bin` du compte ; docs/runtime.md, « Installer »
  MANQUE    le répertoire temporaire de `claude` (/tmp/claude-1001) n'est pas au compte (uid 0, attendu 1001) : `claude` refuse de s'y lancer, chaque cook échouerait
            → `sudo chown -R 1001 /tmp/claude-1001` s'il n'est à personne d'autre (`ls -ld /tmp/claude-1001`) ; sinon `Environment=CLAUDE_CODE_TMPDIR=<répertoire du compte>` dans le drop-in de l'unité, et la même variable dans le shell de la connexion Max — docs/runtime.md, « À vérifier avant d'installer »
```

Sous la cloison, le second n'est qu'un `à savoir` : l'unité a son propre `/tmp`, et seule la
connexion faite à la main s'y refuse. `sudo systemctl edit brigade@<projet>.service` règle
l'instance ; `brigade@.service`, tous les projets de la machine.

Sur un poste sans systemd, l'unité n'est pas vérifiée — ni le `PATH` qu'elle donnerait — et la
commande le dit.

**Puis la même commande, depuis ta machine** — c'est ce que l'app fera, et ce que la box ne peut
pas vérifier d'elle-même. Le code de sortie est le verdict :

```bash
ssh -o BatchMode=yes -o ConnectTimeout=10 <box> brigade <projet> installation; echo $?
```

| Ce que tu lis | Ce que c'est | Le geste |
|---|---|---|
| `0`, `1` ou `2`, et la sortie de la commande | **la commande a été lancée** : le lien et le droit sont là. `1` : il manque quelque chose au projet, la sortie le nomme | — |
| `255` | `ssh` n'a pas joint la box, ou ta clé y est refusée | l'étape 2 |
| `68`, `brigade : « <toi> » n'a pas le droit de lancer le geste sur cette box …` | tu as un compte sur la box, pas le droit du geste | « Ajouter un humain » |
| `65`, `brigade : projet inconnu sur cette box …` | le nom du projet, ou son drop-in | l'étape 3 |
| `127`, `brigade: command not found` | le geste n'est pas posé sur la box | `runtime.md`, « Installer » |
| autre chose que la sortie de `installation` — un écran de session, une invite | ton compte sur la box est enfermé dans une commande forcée, qui remplace celle que tu envoies | « Ajouter un humain », « Un shell n'est pas le droit de lire » |

Les codes du geste sont dans `runtime.md`, « Piloter ».

## 5. Créer les labels

```bash
brigade <projet> installation labels
```

Crée sur le dépôt ceux qui manquent parmi `fire`, `prio:1` à `prio:3`, `model:opus|sonnet|haiku`
et `effort:low|medium|high|xhigh|max`. **Un label qui existe n'est ni recréé ni retouché** — sa
couleur et sa description sont au projet — et la commande se rejoue sans dégât. Les labels du
protocole V1 (`product`, `triage`, `feature`…) sont posés par `/brigade:init` ; ceux que le manager
lit s'il les trouve (`epic`, `question`, `decision`, `blocked-on-human`) sont à toi.

## 6. Mesurer le coût du setup

Sur brigade, le setup est un `npm ci` de deux paquets. Sur un vrai projet c'est une installation
et un build, **joués une fois par cook** — et le plafond de cooks vaut 30 tant que tu ne l'as pas
réglé.

```bash
brigade <projet> installation setup          # à 30 cooks, le plafond par défaut
brigade <projet> installation setup 12       # à 12
```

Elle joue le setup **une fois, à blanc**, comme la station le jouerait avant un cook : dans un
worktree neuf de la branche d'intégration, avec l'environnement d'un cook, sous la moitié du bail.
Aucun cook n'est lancé ; le worktree est retiré ensuite. Elle passe au setup le numéro `0`.
**Joue-la avant de démarrer le service, ou cuisine arrêtée** (`garde-fous -- stop`) : elle rapatrie
la base et accroche un worktree dans le clone réservé, deux gestes que la station fait aussi, et la
mesure d'un setup pris au milieu d'autres ne vaut rien.

```
brigade : setup joué en 48,2 s sur `main` (a1b2c3d) — une fois, seul, à blanc, charge de la machine 0,4 sur 8 cœurs
  worktree    11,2 Mo à sa création, 412,6 Mo une fois le setup passé
  plafond     15 min, la moitié du bail — au-delà la station arrête le setup : tient
À 30 cooks, 4 en entrée à la fois (BRIGADE_MAX_SETUPS)
  entrée      8 vagues de setups : le dernier cook part 5,6 min après le premier, au mieux — plus si la machine sature
  disque      12,1 Go pour 30 worktrees, 61,3 Go disponibles une fois la réserve de la station déduite : tient
brigade : un worktree neuf par cook tient à 30 cooks sur cette machine
```

**« Tient »** veut dire deux choses, et seulement celles-là : le setup finit sous la moitié du
bail (au-delà, la station l'arrête et le ticket passe 86 `setup-failed`, à chaque essai), et tous
les worktrees tiennent ensemble sur le disque, réserve de la station déduite
(`BRIGADE_MIN_FREE_DISK_MB`). Sinon elle sort en `1` et dit quoi baisser.

Ce que la mesure ne dit pas, et qu'il faut lire avec elle :

- Elle est prise **seule**. À quatre setups de front, chacun met plus longtemps ; la station se
  retient d'elle-même quand la machine sature, mais ne raccourcit rien.
- Le temps d'**entrée** est une information, pas un seuil : le dernier ticket attend sur le rail,
  il n'échoue pas.
- Elle pèse le worktree, pas ce que le setup pose **ailleurs** (une base de test, un cache du
  gestionnaire de paquets) — et ne le retire pas non plus.
- La mémoire d'un build n'est pas mesurée.

Un setup **en échec** sort en `1` avec ses vingt dernières lignes : c'est le même échec que
celui que la station rencontrerait, sans cook perdu. Brigade ne partage rien entre les worktrees
de deux cooks : si la mesure dit que ça ne tient pas, baisse le plafond de cooks
(`brigade <projet> station cooks <N>`) ou allège le setup — un cache partagé serait un ticket.

## 7. Servir le premier ticket — sans grant `merge`

**Le premier ticket d'un projet est servi sans grant `merge`** : la pass ouvre la PR, la juge, et
s'arrête. C'est toi qui merges. Sur brigade, un cook qui se trompe casse une branche de refonte ;
sur un projet actif, il casse la branche sur laquelle d'autres travaillent.

Il n'y a rien à désactiver : le grant est **absent** sur un répertoire d'état neuf, et le manager
est **éteint**. Vérifie-le, puis démarre.

```bash
sudo systemctl start brigade@<projet>
brigade <projet> grant   # « ABSENT — jamais donné »
```

Pose `fire`, `model:haiku` et `effort:low` sur une issue courte. Suis-la avec
`brigade <projet> status` et `brigade <projet> pass` (`runtime.md`, « Piloter »). La PR ouverte et
verte, relis-la et merge-la toi-même.

**N'active le grant qu'après avoir relu au moins une livraison de ce projet** — une commande, sans
redémarrage (`brigade <projet> grant activer merge`), de préférence avec une échéance (`--pour 4h`,
`--usages 10`) : il s'éteint alors seul, voir « Le grant `merge` » dans [`runtime.md`](runtime.md).

**Avant d'accorder, lis le bilan des arrêts faute de grant.** Chaque livraison verte arrêtée dit
sur son issue ce que la pass aurait mergé ; `pass` et `grant` comptent ce que tu en as
fait — mergées, fermées sans merge (les désaccords), encore ouvertes. C'est le chiffre sur
lequel accorder (`runtime.md`, « Les motifs, et le geste de chacun »).

## Ajouter une box, une machine, un humain

Aucun des trois ne rejoue l'installation d'un projet, et aucun ne touche aux deux autres.

| Un de plus | Le geste | Où | Ce qui est à refaire, et pourquoi |
|---|---|---|---|
| **Une box** | la préparer (étape 3), puis donner son adresse | la box ; l'app | le groupe et sa règle `sudoers`, **une fois par box** ; un compte **par humain et par box** — les comptes et les règles d'une machine ne se partagent pas avec une autre |
| **Une machine** qui lit | y avoir une clé, et la poser sur ton compte de la box | la machine ; la box | rien par projet, rien par box au-delà de la clé |
| **Un humain** | lui créer un compte dans le groupe, avec sa clé publique | la box | rien par projet : le droit est celui du groupe |

### Ajouter un humain

**Un humain est un compte Unix à lui sur la box, avec sa clé publique, dans le groupe
`brigade-chefs`.** Pas de compte partagé, pas de clé commune, aucun secret à se transmettre : il
t'envoie sa clé **publique**, tu fais le reste. Le geste se joue sur la box, par quelqu'un qui y a
`sudo` — pas forcément celui qui l'a installée.

```bash
sudo useradd --create-home --shell /bin/bash --groups brigade-chefs <humain>
sudo install -d -m 700 -o <humain> /home/<humain>/.ssh
sudo install -m 600 -o <humain> <sa clé publique>.pub /home/<humain>/.ssh/authorized_keys
```

S'il a déjà un compte **sans commande forcée** sur la box, seule l'appartenance au groupe manque :
`sudo usermod -aG brigade-chefs <humain>`.

Le groupe et la règle qui lui donne le geste existent déjà : ils se posent **une fois par box**,
avec le geste lui-même (`runtime.md`, « Installer »). Ajouter un humain ne réécrit aucune règle et
ne touche à aucun projet.

**Ce que tu lui donnes, en toutes lettres.** Le droit du groupe est le geste `brigade`, entier :
**toutes les commandes de « Piloter », pour tous les projets de la box** — lire le `status`, mais
aussi accorder le grant `merge`, dire « stop », désinstaller un projet. **Lire et agir ne sont pas
séparés** : doser les droits par humain n'existe pas encore (V2.5). C'est du même ordre que lui
donner un shell sur la box, et il en a un, sous son compte. Ce qu'il n'a pas : un shell sous le
compte du service, la session Max, et — comme toi, comme la box — un accès à la prod.

**La vérification**, depuis **sa** machine, avec son compte dans `<box>` :

```bash
ssh -o BatchMode=yes -o ConnectTimeout=10 <humain>@<adresse> brigade <projet> status; echo $?
```

`0` et la sortie de `status` : c'est fait. Tout autre résultat se lit dans le tableau de
l'étape 4 — `255`, sa clé ; `68`, le groupe (`id <humain>` sur la box doit nommer `brigade-chefs`).

**Un shell n'est pas le droit de lire.** Les deux se donnent séparément, et l'un ne dit rien de
l'autre :

- Un compte de la box qui n'est pas dans `brigade-chefs` ouvre un shell et se voit refuser le geste
  (code `68`).
- Un compte enfermé par un `ForceCommand` de `sshd` — une session `tmux`, un conteneur — donne une
  session à un humain et **ne peut lancer aucune commande** : celle qu'on lui envoie est remplacée
  par la sienne. L'app ne lira jamais rien par lui, groupe ou non. Ce compte-là reste ce qu'il est ;
  l'humain en reçoit un second, par le geste ci-dessus. Pour le savoir, sur la box :

  ```bash
  sudo sshd -T -C user=<humain>,host=localhost,addr=127.0.0.1 | grep -i forcecommand   # « forcecommand none »
  ```

**Le retirer** : `sudo gpasswd -d <humain> brigade-chefs` lui retire le geste et lui laisse son
compte ; `sudo userdel -r <humain>` retire le compte. Aucun autre humain n'est touché.

### Ajouter une machine

Une machine de plus — la tienne, ou celle d'un humain déjà ajouté — **n'installe rien** : elle a
`ssh`, il lui faut une clé que ton compte de la box connaît.

```bash
ssh-keygen -t ed25519                # sur la machine neuve, si elle n'a pas de clé
ssh <box> 'cat >> ~/.ssh/authorized_keys' < <la clé publique de la machine neuve>.pub   # depuis une machine qui a déjà l'accès
```

Puis la vérification de l'étape 2, depuis la machine neuve. Une clé par machine : en retirer une,
c'est retirer sa ligne de `~/.ssh/authorized_keys` sur la box.

### Ajouter une box

Une box de plus se prépare comme la première — `runtime.md`, « À vérifier avant d'installer » et
« Installer », puis l'étape 3 par projet. **Deux choses s'y rejouent à la main, et pas une de plus** :
le groupe `brigade-chefs` et sa règle (une fois), et le compte de chaque humain (« Ajouter un
humain »). Elles vivent dans `/etc` de chaque machine : rien de brigade ne les recopie d'une box à
l'autre, et une box ne sait rien des autres.

Côté lecteur, une box de plus est **une adresse** : `<box>` pour `ssh`, le champ `hote` du projet
dans l'app. Rien d'autre ne la désigne.

## Désinstaller

Dans l'ordre. Rien ici ne touche au dépôt.

```bash
sudo systemctl disable --now brigade@<projet>.service brigade-sauvegarde@<projet>.timer   # arrête le runtime et ses cooks
brigade <projet> installation desinstaller               # dit ce qui serait retiré, ne retire rien
brigade <projet> installation desinstaller --confirmer   # retire le clone réservé et les worktrees
sudo rm -rf /etc/systemd/system/brigade@<projet>.service.d /etc/systemd/system/brigade-sauvegarde@<projet>.service.d
sudo systemctl daemon-reload
```

`desinstaller` refuse tant que le runtime du projet tourne, refuse de supprimer un répertoire qui
n'est pas un clone git ou qui contient le répertoire d'état, et se rejoue sans se plaindre. Le
service arrêté d'abord, joue la commande tant que le drop-in existe : sans lui, le geste ne connaît
plus le projet.

**Rien de ce que l'origine n'a pas ne part en silence.** À blanc, la commande nomme tout ce que le
clone et ses worktrees portent et qui serait perdu : les commits d'aucune branche de l'origine —
têtes détachées comprises —, les remises (`git stash`), les fichiers non commités. **Tant qu'il en
reste, `--confirmer` refuse** : pousse-les ou défais-les, puis rejoue. Si le clone n'y est déjà
plus, les worktrees qui restent sous le répertoire d'état sont annoncés puis retirés tels quels —
sans leur clone, git ne peut plus dire ce qu'ils portent.

| Ce qui reste | Où | Qu'en faire |
|---|---|---|
| Le journal, les flux des cooks, les sauvegardes | `/var/lib/brigade/<projet>/` et ta destination de sauvegarde | l'histoire de la cuisine. `sudo rm -rf` si tu n'en veux plus |
| L'unité `brigade@.service`, le geste `brigade`, sa règle et le groupe `brigade-chefs` | `/etc/systemd/system/`, `/usr/local/bin/`, `/etc/sudoers.d/brigade` | ils servent les autres projets de la machine ; à retirer avec le dernier. Les comptes des humains sont à eux, pas à un projet |
| Les labels, `.claude/brigade/`, le bloc de bindings | le dépôt | ne font rien sans brigade. Les gates et le setup servent à n'importe quel dev ; garde-les ou retire-les par une PR ordinaire |
| Les branches `cook/*`, les PR ouvertes, les commentaires de cook | le dépôt GitHub | des branches, des PR et des commentaires ordinaires : merge, ferme, supprime comme les tiens |

**Le dépôt reste un dépôt ordinaire.** Ses issues, ses PR et son historique ne portent aucune
dépendance à brigade : aucun hook, aucune CI, aucun fichier que le projet charge à l'exécution.

## Sur le poste de dev

La commande se joue aussi sans systemd, pour éprouver un dépôt avant de toucher la box — avec les
variables posées à la main, et un clone réservé à l'essai :

```bash
BRIGADE_STATE_DIR=<état de l'essai> BRIGADE_PROJECT=<projet> BRIGADE_GITHUB_REPO=<owner>/<repo> \
  BRIGADE_REPO_DIR=<un clone réservé à cet essai> BRIGADE_BASE_BRANCH=<branche> \
  BRIGADE_MANAGER_MODEL=sonnet BRIGADE_MANAGER_EFFORT=medium \
  BRIGADE_REVIEWER_MODEL=sonnet BRIGADE_REVIEWER_EFFORT=medium \
  npm --prefix runtime run installation
```

## Recette du jalon 7

Trois critères ne se jouent que sur la box, contre le vrai dépôt, par le chef. Le pilote choisi le
2026-10-09 est `BOBL-tech/calculus-workspace` : privé, dans une organisation, TypeScript, une
application servie, branche d'intégration `main`.

1. Dérouler les étapes 1 à 7 sur `calculus`, et noter **ce qui a résisté**.
2. `brigade calculus installation setup` sur la box : reporter sur le ticket la durée, le poids,
   et le verdict à 30 cooks.
3. `git -C /opt/brigade status` et `git -C /opt/brigade log origin/v2..` sont vides à la fin :
   **rien dans le code de brigade n'a eu à changer pour ce projet-là.**
4. Le premier ticket de `calculus` s'arrête à la PR ouverte ; `brigade calculus grant` montre le
   grant absent.

Un point de ce parcours n'a pas pu être éprouvé depuis une session de dev, qui n'a ni systemd ni
`sudo` : le geste `brigade` contre une vraie unité — ce que `systemctl show` rend d'une valeur
qui contient un espace, et la règle `sudoers` qui le nomme. Ses tests le jouent contre des
doublures.

**L'accès à la box** (#314) n'a pas pu l'être non plus — ni `sshd`, ni `sudo`, ni un second
humain. Seule la recette du chef le prouvera, sur une vraie box :

1. Depuis sa machine, les deux vérifications : `ssh -o BatchMode=yes <box> true` (étape 2) et
   `ssh -o BatchMode=yes <box> brigade <projet> installation` (étape 4) rendent ce que leurs
   tableaux disent.
2. « Ajouter un humain » pour un compte d'essai, puis sa vérification : `0`. Retiré du groupe
   (`gpasswd -d`) : **`68`**, et la phrase du geste — c'est `sudo -n -l` contre un vrai `sudoers`
   qui le dit, les tests ne le jouent que contre une doublure.
3. Un compte enfermé par `ForceCommand` : `sshd -T -C user=…` le nomme.
