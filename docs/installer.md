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
| 2. Préparer la machine | la box, compte du service | l'unité, les neuf variables, le clone réservé |
| 3. Vérifier | la box | « prêt », ou la liste de tout ce qui manque |
| 4. Créer les labels | la box | `fire`, `prio:`, `model:`, `effort:` sur le dépôt |
| 5. Mesurer le setup | la box | ce que coûte l'entrée d'un cook, et si elle tient à 30 |
| 6. Servir le premier ticket | la box | une PR ouverte, **non mergée** |

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
| `.claude/brigade/gates.sh` | exécutable ; `gates.sh <worktree>`, **le code de sortie est le verdict** | **pas prêt** — la pass remonterait chaque livraison (`no-gates`) |
| `.claude/brigade/worktree-setup.sh` | exécutable ; `worktree-setup.sh <n> <worktree>`, n'imprime que des `export` sur sa sortie | signalé : le cook part dans un worktree neuf tel quel, sans dépendances |

Trois choses à savoir en écrivant le setup d'un vrai projet — un build, des dépendances, un
service. Le détail est dans `runtime.md`, « Le setup du worktree passe avant le cook ».

- **Il est joué une fois par cook**, et une fois encore par la pass avant les gates. Sur un dépôt
  qui installe et compile, c'est le coût d'entrée de chaque ticket : l'étape 5 le mesure.
- **Les ports se dérivent du numéro reçu**, jamais écrits en dur : plusieurs cooks tournent en même
  temps sur la même machine. Le numéro `0` est celui de la sonde de l'étape 5, jamais d'un ticket.
- **Il ne laisse rien tourner** : un service dont le cook a besoin se démarre depuis le cook ou
  depuis les gates. Et aucune variable `BRIGADE_*` du runtime ne lui parvient.

## 2. Préparer la machine

Les prérequis de la machine elle-même — Node 26, `claude` connecté en Max, `gh` connecté, une
identité git qui pousse, la branche d'intégration protégée — sont dans `runtime.md`, « À vérifier
avant d'installer ». L'unité se copie **une fois par machine**, pas par projet (`runtime.md`,
« Installer »).

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

Les **neuf variables** sans lesquelles le runtime refuse de démarrer, et d'où chacune vient :

| Variable | Posée par |
|---|---|
| `BRIGADE_STATE_DIR`, `BRIGADE_PROJECT`, `BRIGADE_REPO_DIR` | l'unité, d'après le nom de l'instance — rien à écrire |
| `BRIGADE_GITHUB_REPO`, `BRIGADE_BASE_BRANCH` | le drop-in de l'instance |
| `BRIGADE_MANAGER_MODEL`, `BRIGADE_MANAGER_EFFORT`, `BRIGADE_REVIEWER_MODEL`, `BRIGADE_REVIEWER_EFFORT` | le drop-in de l'instance — c'est ton quota, il n'a pas de défaut |

Les variables facultatives et les réglages à défaut sont dans `runtime.md`, « Neuf variables,
aucun défaut ».

**Ne démarre pas encore le service** : vérifie d'abord.

## 3. Vérifier que le projet est prêt

Une commande dit si un cook peut partir, **et nomme tout ce qui manque d'un coup** — pas le
premier manque. Elle ne lance ni cook ni setup, ne consomme aucun quota, n'écrit rien sur GitHub
et n'ouvre pas le journal ; dans le clone réservé, elle ne déplace aucune référence. Elle se rejoue
autant qu'on veut, service arrêté ou non.

Elle lit **l'environnement du service**, comme le runtime. Sur la box, `I` désigne dans la suite :

```bash
sudo -u <compte> env $(systemctl show brigade@<projet>.service -p Environment --value) \
  npm --prefix /opt/brigade/runtime run installation --
```

```
$ I

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
            → `npm --prefix runtime run installation -- labels`

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
| Dépôt | sur la branche d'intégration **telle que l'origine la porte** : gates et setup présents et exécutables, bloc de bindings, branche d'intégration cohérente |
| GitHub | `gh` lit le dépôt sous ce compte ; les labels du rail y sont |

Ce qu'elle ne contrôle **pas** : que le setup et les gates *réussissent* (l'étape 5 joue le setup ;
les gates se prouvent par `/brigade:init`), les droits d'écriture du compte sur le dépôt et la
protection de la branche (l'identité GitHub du projet, #174), ses secrets (#175). Quand elle ne
peut pas lire le dépôt — clone absent, branche introuvable — elle le dit (`dépôt non vérifié`) au
lieu de le déclarer bon.

Sur un poste sans systemd, l'unité n'est pas vérifiée et la commande le dit.

## 4. Créer les labels

```bash
I labels
```

Crée sur le dépôt ceux qui manquent parmi `fire`, `prio:1` à `prio:3`, `model:opus|sonnet|haiku`
et `effort:low|medium|high|xhigh|max`. **Un label qui existe n'est ni recréé ni retouché** — sa
couleur et sa description sont au projet — et la commande se rejoue sans dégât. Les labels du
protocole V1 (`product`, `triage`, `feature`…) sont posés par `/brigade:init` ; ceux que le manager
lit s'il les trouve (`epic`, `question`, `decision`, `blocked-on-human`) sont à toi.

## 5. Mesurer le coût du setup

Sur brigade, le setup est un `npm ci` de deux paquets. Sur un vrai projet c'est une installation
et un build, **joués une fois par cook** — et le plafond de cooks vaut 30 tant que tu ne l'as pas
réglé.

```bash
I setup          # à 30 cooks, le plafond par défaut
I setup 12       # à 12
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
  entrée      8 vagues de setups : le dernier cook part 6,4 min après le premier — plus si la machine sature
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
(`run station -- cooks <N>`) ou allège le setup — un cache partagé serait un ticket.

## 6. Servir le premier ticket — sans grant `merge`

**Le premier ticket d'un projet est servi sans grant `merge`** : la pass ouvre la PR, la juge, et
s'arrête. C'est toi qui merges. Sur brigade, un cook qui se trompe casse une branche de refonte ;
sur un projet actif, il casse la branche sur laquelle d'autres travaillent.

Il n'y a rien à désactiver : le grant est **absent** sur un répertoire d'état neuf, et le manager
est **éteint**. Vérifie-le, puis démarre.

```bash
sudo systemctl start brigade@<projet>
sudo -u <compte> BRIGADE_STATE_DIR=/var/lib/brigade/<projet> npm --prefix /opt/brigade/runtime run grant   # « ABSENT — jamais donné »
```

Pose `fire`, `model:haiku` et `effort:low` sur une issue courte. Suis-la avec `run status` et
`run pass` (`runtime.md`, « Piloter »). La PR ouverte et verte, relis-la et merge-la toi-même.

**N'active le grant qu'après avoir relu au moins une livraison de ce projet** — une commande, sans
redémarrage (`run grant -- activer merge`).

## Désinstaller

Dans l'ordre. Rien ici ne touche au dépôt.

```bash
sudo systemctl disable --now brigade@<projet>.service brigade-sauvegarde@<projet>.timer   # arrête le runtime et ses cooks
I desinstaller               # dit ce qui serait retiré, ne retire rien
I desinstaller --confirmer   # retire le clone réservé et les worktrees
sudo rm -rf /etc/systemd/system/brigade@<projet>.service.d /etc/systemd/system/brigade-sauvegarde@<projet>.service.d
sudo systemctl daemon-reload
```

`desinstaller` refuse tant que le runtime du projet tourne, refuse de supprimer un répertoire qui
n'est pas un clone git, et se rejoue sans se plaindre. Avant de retirer, il nomme les **commits du
clone qui ne sont sur aucune branche de l'origine** : ils partiraient avec lui. Le service arrêté
d'abord, joue la commande avec l'environnement du service tant que le drop-in existe.

| Ce qui reste | Où | Qu'en faire |
|---|---|---|
| Le journal, les flux des cooks, les sauvegardes | `/var/lib/brigade/<projet>/` et ta destination de sauvegarde | l'histoire de la cuisine. `sudo rm -rf` si tu n'en veux plus |
| L'unité `brigade@.service` | `/etc/systemd/system/` | elle sert les autres projets de la machine ; à retirer avec le dernier |
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

1. Dérouler les étapes 1 à 6 sur `calculus`, et noter **ce qui a résisté**.
2. `I setup` sur la box : reporter sur le ticket la durée, le poids, et le verdict à 30 cooks.
3. `git -C /opt/brigade status` et `git -C /opt/brigade log origin/v2..` sont vides à la fin :
   **rien dans le code de brigade n'a eu à changer pour ce projet-là.**
4. Le premier ticket de `calculus` s'arrête à la PR ouverte ; `run grant` montre le grant absent.

Un point de ce parcours n'a pas pu être éprouvé depuis une session de dev : la forme
`env $(systemctl show … -p Environment --value)` de `I`, qui suppose des valeurs sans espace —
c'est le cas des neuf variables.
