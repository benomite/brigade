# Installer brigade

**Ce document suffit pour installer brigade sur un serveur neuf et y servir un premier projet** —
par quelqu'un qui n'a jamais installé brigade, sans rien reconstituer depuis un autre document.
Ce que fait le runtime une fois lancé est dans [`runtime.md`](runtime.md) : on y va pour
comprendre, jamais pour installer.

**On installe brigade dans un projet ; on n'ajoute pas un projet à brigade.** Le runtime est par
projet, et brigade ne tient aucune liste de projets : ce qui est propre au projet vit **dans son
dépôt**, ce qui est propre à la machine vit **sur la machine**, et rien d'un projet n'est écrit
dans le code ni dans la configuration de brigade. Un projet où brigade est installée reste
autonome — on la désinstalle sans rien y casser (voir « Désinstaller »).

La **box** est, partout ici, le serveur qui sert le projet.

## Avant de commencer

Trois choses sont **à toi**, et il te les faut avant le premier geste. Brigade n'en fournit
aucune, et **rien n'est partagé avec une autre installation de brigade** — ni compte, ni quota, ni
organisation, ni machine. Le seul lien avec elle est le code, un dépôt public que la box clone.

| Ce qu'il te faut | Pourquoi | Ce qui ne convient pas |
|---|---|---|
| **Ton abonnement Claude Max** | chaque cook, chaque jugement du manager et chaque relecture tourne sur la session Max connectée sur la box : c'est ton quota qui est consommé | une clé d'API : le runtime refuse de démarrer s'il en trouve une dans son environnement |
| **Ton GitHub** : le dépôt du projet, que tu **administres**, et un compte qui y **pousse et y merge** — le tien, ou un compte de machine que tu crées | brigade lit les issues du dépôt, y pousse des branches, y ouvre et y merge des PR ; protéger la branche d'intégration est un geste d'administrateur | un dépôt où tu n'es que contributeur |
| **Ton serveur** : Linux avec systemd, où tu as `sudo`, joignable en `ssh` **par clé**, avec `/var/lib` sur un disque local (`df -T /var/lib` ne montre ni `nfs` ni `cifs`) | le runtime est une unité systemd, et son verrou réclame un disque local | un conteneur sans systemd ; une machine qui a un accès à ta prod — la box n'en a aucun, et n'en demande aucun |

Et, pour le premier geste seulement, un poste de dev avec Claude Code et le plugin brigade.

Les commandes de paquets sont celles de Debian et d'Ubuntu ; la recette du 2026-10-09 s'est jouée
sur un Debian 12 nu. **Tel qu'il est écrit ici, ce parcours n'a pas encore été joué de bout en
bout sur un serveur neuf** : ce qui reste à prouver est à la fin, « Ce que seule une vraie box
prouvera ».

## Le parcours : dix gestes

Un **geste** est un bloc à coller, une session à ouvrir ou une commande à lancer — en un endroit,
pour une chose. Aucun n'ouvre un éditeur.

| | Geste | Où | Se rejoue |
|---|---|---|---|
| 1 | Amorcer le dépôt — `/brigade:init`, mergé | le dépôt, sur un poste de dev | par projet |
| 2 | Joindre la box — une vérification | ta machine | par machine qui lit |
| 3 | Le compte du service et ses outils | la box | par box |
| 4 | Ses connexions : Max, GitHub, identité git | la box, sous le compte | par box |
| 5 | Brigade : son code, ses unités, le geste et son groupe | la box | par box |
| 6 | Déclarer le projet : son clone, ses variables, sa sauvegarde | la box | par projet |
| 7 | Protéger la branche d'intégration | GitHub | par projet |
| 8 | Vérifier, et créer les labels | la box, puis ta machine | autant qu'on veut |
| 9 | Mesurer le coût du setup | la box | autant qu'on veut |
| 10 | Démarrer, et servir le premier ticket | la box | par projet |

Un second projet sur la même box rejoue les gestes 1 et 6 à 10, et pose ce qui sépare deux
projets : « Un second projet sur la box ». Une box, une machine ou un humain **de plus** a son
geste, dans « Ajouter une box, une machine, un humain ». **Mettre à jour une box** — l'opération
qui reviendra, là où l'installation n'arrive qu'une fois — a le sien, sous le geste 5 : « Mettre
brigade à jour ».

Les gestes 3 à 7 préparent ; **le geste 8 dit tout ce qu'ils ont manqué, d'un coup** — c'est lui
qui remplace une liste de points à vérifier à la main.

## Ce qui vit où

| Quoi | Où | Qui le lit |
|---|---|---|
| Branche d'intégration, zones de fichiers, dev local, plafond des gates | le bloc de bindings du `CLAUDE.md` du dépôt | les cooks, les gates |
| Ce que « vert » veut dire | `.claude/brigade/gates.sh` du dépôt | la pass |
| Ce qui rend un worktree exécutable — dépendances, build, ports | `.claude/brigade/worktree-setup.sh` du dépôt | la station, avant chaque cook ; la pass, avant les gates |
| Les labels du rail | le dépôt GitHub | le runtime, le chef |
| Le code de brigade, ses unités | `/opt/brigade`, `/etc/systemd/system/` | systemd |
| La version du runtime que chaque projet sert, la précédente, le compte rendu de sa dernière bascule | `/opt/brigade-versions/<projet>/` | systemd, la bascule, la vérification |
| Les neuf variables | l'unité `brigade@.service` et le drop-in de **l'instance** | le runtime |
| Le clone réservé, les worktrees, le journal | `/var/lib/brigade/<projet>/` | le runtime |
| La session Max, `gh` connecté, l'identité git | le compte du service | les cooks, le runtime |

Le runtime ne lit pas les bindings : il lit ses variables. La **branche d'intégration** est donc
écrite deux fois — dans les bindings pour les cooks, dans `BRIGADE_BASE_BRANCH` pour la station —
et la vérification refuse qu'elles diffèrent.

## 1. Amorcer le dépôt

*Geste 1.* Dans le dépôt du projet, sur un poste de dev, avec le plugin brigade :

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
service :

- **Il est joué une fois par cook**, et une fois encore par la pass avant les gates. Sur un dépôt
  qui installe et compile, c'est le coût d'entrée de chaque ticket : le geste 9 le mesure.
- **Les ports se dérivent du numéro reçu**, jamais écrits en dur : plusieurs cooks tournent en même
  temps sur la même machine. Le numéro `0` est celui de la sonde du geste 9, jamais d'un ticket.
- **Il ne laisse rien tourner** : un service dont le cook a besoin se démarre depuis le cook ou
  depuis les gates. Et aucune variable `BRIGADE_*` du runtime ne lui parvient.

## 2. Joindre la box

*Geste 2.* **Le lien entre ta machine et la box est `ssh`, et rien d'autre.** Tout ce qui lit ou
pilote un projet depuis ta machine — toi dans un terminal, l'app — lance `ssh <box> brigade
<projet> <commande>`. Il n'y a donc **rien à installer sur ta machine** : ce qu'elle a déjà pour
ouvrir un terminal suffit. Et c'est toujours ta machine qui joint la box, jamais l'inverse : aucune
étape ne pose une clé de la box ailleurs, ni n'ouvre un tunnel depuis elle. La box n'a aucun accès
à la prod, et t'y joindre ne t'en donne aucun.

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
| `0` | la box est jointe, sous ton compte, sans rien te demander | passe au geste 3 |
| `255`, `Could not resolve hostname`, `Connection timed out` ou `Operation timed out` (selon ta machine) | l'adresse : `ssh` n'a pas trouvé la machine | corrige `<box>`, ou ouvre le port de `sshd` |
| `255`, `Permission denied (publickey)` | la machine répond, ta clé n'y est pas — ou n'est pas dans ton agent | `ssh-add -l` sur ta machine ; sur la box, « Ajouter un humain » |
| `255`, `Host key verification failed` | ta machine ne connaît pas encore cette box, et `BatchMode` interdit de te le demander | `ssh <box>` une fois, à la main, pour accepter sa clé |

`BatchMode=yes` est ce que l'app passe : une connexion qui ne réussit qu'en te demandant quelque
chose réussit dans ton terminal et échoue dans l'app. Ce geste ne prouve que le lien ; que tu
peux **lancer la commande d'un projet** se vérifie au geste 8, quand il y en a un.

## 3. Préparer la box

Trois gestes, **une fois par box**, quel que soit le nombre de projets qu'elle servira. Tout se
joue sur la box, sous ton compte, qui y a `sudo`.

`<compte>` est le **compte du service** : un compte Unix que tu crées ici, réservé à brigade, sous
lequel tournent le runtime et ses cooks. Son nom est à toi.

### Le compte du service et ses outils

*Geste 3.*

```bash
COMPTE=<compte>
sudo useradd --create-home --shell /bin/bash "$COMPTE"
sudo apt install -y git curl libatomic1
# Claude Code, par son installeur natif, sous le compte — puis un lien là où systemd le trouve.
sudo -u "$COMPTE" -i sh -c 'curl -fsSL https://claude.ai/install.sh | bash'
sudo ln -sfn "/home/$COMPTE/.local/bin/claude" /usr/local/bin/claude
```

Deux outils s'installent par leur propre voie, **là où systemd les trouve** (`/usr/bin` ou
`/usr/local/bin`) : **Node 26** (nodejs.org) et **`gh`**, la ligne de commande de GitHub
(cli.github.com). Un outil posé ailleurs se rend par un lien, comme `claude` ci-dessus : une unité
ne reçoit pas le `PATH` de ton shell, mais `/usr/local/sbin:/usr/local/bin:/usr/sbin:/usr/bin`.

Les deux lignes qui ne se devinent pas sont déjà dans le bloc : `libatomic1`, sans quoi Node 26 ne
démarre pas sur un Debian nu, et le lien de `claude`, sans quoi aucun cook ne part. Oubliées, le
geste 8 les nomme.

### Ses connexions

*Geste 4.* Une session sous le compte du service — c'est **lui** qui se connecte, pas toi :

```bash
sudo -u <compte> -i
claude                    # puis /login : ton abonnement Max. /exit ensuite
gh auth login             # ton GitHub, en HTTPS — le compte qui pousse et merge sur le dépôt
gh auth setup-git         # git pousse par lui, sans rien demander
git config --global user.name "<nom>"
git config --global user.email "<adresse>"
exit
```

**Aucune clé d'API** : ni `ANTHROPIC_API_KEY` ni jeton `claude` dans l'environnement de ce compte
ou d'une unité — le runtime refuserait de démarrer. Si `claude` refuse de se lancer
(`Temp directory … is owned by uid … Refusing to use it`), son répertoire temporaire a été créé par
un autre compte : `sudo chown -R <compte> /tmp/claude-"$(id -u <compte>)"`. Les cooks, eux, ne le
rencontrent pas : l'unité a son propre `/tmp`.

### Brigade : son code, ses unités, le geste et son groupe

*Geste 5.*

```bash
COMPTE=<compte>
TOI=<ton compte sur la box>

# Le code, et les unités — copiées telles quelles, toutes.
sudo git clone --branch v2 https://github.com/benomite/brigade.git /opt/brigade
sudo cp /opt/brigade/runtime/deploy/*.service /opt/brigade/runtime/deploy/*.timer /etc/systemd/system/
# Le compte sous lequel elles tournent : les unités ne partagent pas leurs réglages.
for unite in brigade@ brigade-sauvegarde@ brigade-porte@ brigade-arbitre; do
  sudo install -d "/etc/systemd/system/$unite.service.d"
  printf '[Service]\nUser=%s\n' "$COMPTE" | sudo tee "/etc/systemd/system/$unite.service.d/compte.conf" >/dev/null
done
sudo systemctl daemon-reload

# Le geste de la box, et le groupe des humains qui ont le droit de le lancer.
sudo ln -s /opt/brigade/runtime/deploy/brigade /usr/local/bin/brigade
sudo groupadd brigade-chefs
sudo usermod -aG brigade-chefs "$TOI"
echo "%brigade-chefs ALL=($COMPTE) NOPASSWD: /usr/local/bin/brigade" | sudo tee /etc/sudoers.d/brigade >/dev/null
sudo chmod 440 /etc/sudoers.d/brigade
sudo visudo -cf /etc/sudoers.d/brigade      # « parsed OK »
```

Ce que ce bloc a posé :

- **Le code de brigade**, dans `/opt/brigade`. C'est un dépôt public ; il ne porte rien de ton
  projet, et le runtime n'y écrit jamais. Il n'a rien à installer ni à compiler.
- **Les unités**, une fois pour toutes : celle du runtime (`brigade@.service`, une instance par
  projet), sa sauvegarde, et celles qui ne servent qu'à partir d'un second projet (la porte de la
  cloison, l'arbitre). Une unité copiée et jamais démarrée ne fait rien.
- **Le geste de la box** : `brigade <projet> <commande>` lance une commande du runtime pour un
  projet, sous le compte du service et avec l'environnement de son unité. C'est un lien, pas une
  copie : une mise à jour du clone le met à jour.
- **Le groupe `brigade-chefs` et sa règle**, qui ne nomme que le geste. Le geste passe sous le
  compte du service par `sudo`, et un `ssh` sans terminal ne peut pas taper de mot de passe : le
  droit de le lancer est celui du groupe. Ton appartenance vaut **à ta connexion suivante** —
  déconnecte-toi et reviens.

**Ce que cette règle donne** à chaque membre du groupe : toutes les commandes du geste, pour tous
les projets de la box — le grant `merge`, le « stop », `installation desinstaller`, `restaurer`
compris. Lire et agir ne sont pas séparés (V2.5). Elle ne donne ni un shell sous le compte du
service, ni l'exécution d'un fichier de son choix : le geste ne lance que les fichiers de `src/`
que le `package.json` du runtime nomme, avec les arguments donnés. Un humain de plus est un compte
de plus dans ce groupe, jamais une règle de plus (« Ajouter un humain »).

### Mettre brigade à jour

Le geste 5 a posé trois choses qui ne vieillissent pas de la même façon : **le code** (un clone,
qu'un `git pull` met à jour), **les unités** (des copies, qu'un `git pull` ne touche pas) et
**les process qui tournent** (`node` a lu son code en démarrant, et n'en relit rien). Mettre à
jour, c'est le clone, puis **la bascule de chaque projet** — et **c'est toi qui choisis le
moment** : rien ne se met à jour ni ne redémarre seul.

**Il n'y a qu'un chemin.** Un runtime ne se met pas à jour par un `systemctl restart` : il se
bascule. Des gates vertes ne disent pas qu'un runtime démarre sur ta box — il peut passer tous ses
tests et refuser de démarrer ici. Le contrôle qui compte est **un démarrage réel**, et c'est la
bascule qui le fait.

```bash
PROJET=<projet>

# 1. Le clone. Le geste `brigade` et la bascule sont lus là : ils sont à jour avec lui.
#    Aucun runtime ne change encore — sauf ceux qui n'ont jamais basculé (plus bas).
sudo git -C /opt/brigade pull

# 2. La bascule du projet : la version est posée à côté, essayée par un démarrage réel,
#    confirmée s'il réussit — sinon la précédente revient seule.
sudo /opt/brigade/runtime/deploy/brigade-bascule "$PROJET"

# 3. La vérification : la version en service, et rien qui attende.
brigade "$PROJET" installation
```

Ce que la bascule fait, dans l'ordre :

1. **Elle pose la version à côté** : `runtime/` au commit du clone, copié sous
   `/opt/brigade-versions/<projet>/<commit>/`. La version qui tourne n'est pas touchée, et le
   clone peut bouger sans elle.
2. **Elle refuse, avant de rien arrêter, une version qui change une unité posée** (code `72`) —
   plus bas.
3. **Elle l'essaie par un démarrage réel.** Le runtime du projet est arrêté, et son instance
   relancée sur la version posée. **L'essai coûte ce que coûte un redémarrage** : un démarrage
   réel prend le verrou du projet, l'ancien runtime ne peut donc pas tourner pendant ce temps —
   **ses cooks en vol meurent avec lui**, et les gates en train de se jouer ; chaque cook est noté
   `cook.interrupted`, et son ticket repris par un cook neuf. Pour ne rien couper : attends que le
   rail soit calme (`brigade <projet> rail`).
4. **Elle ne la confirme qu'à un fait** : l'unité est `active` **et** le runtime a laissé son
   témoin (`code-en-service`, dans son répertoire d'état), qu'il n'écrit qu'une fois tout branché.
   Pas un délai écoulé sans erreur.
5. **Sinon elle revient seule** : la version précédente est relancée, la version refusée est
   retirée, et la bascule sort en `73` en disant pourquoi. Tu n'as rien à faire pour que le projet
   soit servi de nouveau.

```
brigade-bascule : brigade@boutique.service a démarré sur 3f2a9c1d0b7e — 9e41c07a55d2 reste posée, à quoi revenir (`brigade-bascule boutique 9e41c07a55d2`)
```

```
brigade-bascule : 3f2a9c1d0b7e n'a pas démarré pour brigade@boutique.service — le runtime est sorti en code 2, et systemd ne le relance pas (`failed`)
                  ce que l'essai a écrit : /opt/brigade-versions/boutique/essai.journal ; `brigade boutique installation` le redit
                  → 9e41c07a55d2 est revenue en service
```

**Un retour se lit après coup**, sans avoir vu le terminal de celui qui a basculé :
`brigade <projet> installation` le redit tant qu'une bascule réussie ne l'a pas remplacé, et
`essai.journal` garde ce que le runtime refusé a écrit dans journald pendant l'essai.

```
  à savoir  bascule revenue : 3f2a9c1d0b7e n'a pas démarré pour brigade@boutique.service — le runtime est sorti en code 2, et systemd ne le relance pas (`failed`) ; 9e41c07a55d2 est restée en service
            → ce que l'essai a écrit : /opt/brigade-versions/boutique/essai.journal ; une version corrigée se bascule par le même geste — docs/installer.md, « Mettre brigade à jour »
```

| Code de la bascule | Ce qu'il veut dire |
|---|---|
| `0` | la version est en service — ou l'était déjà, et rien n'a été arrêté |
| `72` | la version change une unité posée : rien n'a été arrêté |
| `73` | la version n'a pas démarré : **la précédente est revenue en service** |
| `74` | la version n'a pas démarré, **et la précédente non plus : rien ne tourne**. La bascule le dit et donne le geste — `journalctl -u brigade@<projet>`, puis une bascule sur un commit qui démarrait |
| `64`, `65`, `67`, `71` | il manque le projet ; projet inconnu ; systemd n'a pas répondu ; le clone n'a pas ce commit — rien n'a été touché |

Ce qui compte comme un démarrage raté : le runtime est sorti (`failed`, `inactive`), systemd le
relançait après une chute, ou — la garde — il n'a ni démarré ni sorti en 120 s
(`sudo BRIGADE_BASCULE_GARDE=<secondes> …` pour une box lente). La garde n'est pas la mesure :
un démarrage se lit à son témoin, en une seconde ou deux.

**Seule l'instance du projet bascule.** Le gabarit `brigade@.service` ne change pas : la bascule
pose un drop-in **de l'instance** (`brigade@<projet>.service.d/code.conf`), qui donne à ce projet
son répertoire de travail — le lien `/opt/brigade-versions/<projet>/en-service`, qu'elle seule
déplace. Deux projets d'une même box servent donc deux versions tant que tu ne les as pas basculés
tous les deux : rejoue les pas 2 et 3 pour chacun, quand tu veux. Le geste `brigade <projet> …`
lit ce répertoire dans l'unité : ses commandes tournent sur la version que le projet sert.

**Deux versions sont gardées par projet** : celle qui sert, et la précédente. Revenir à la main —
une version qui démarre mais se conduit mal — est la même bascule, sur un commit nommé :
`sudo /opt/brigade/runtime/deploy/brigade-bascule <projet> <commit>`.

**Un projet qui n'a jamais basculé** (une box installée avant la bascule, ou un projet neuf) tourne
sur le clone partagé, `/opt/brigade/runtime` : le `git pull` du pas 1 change le code sous lui, et
si systemd le relance il repart sur ce code-là, sans essai ni retour. La vérification le dit
(`pas encore basculé`), avec son geste. **Sa première bascule n'a pas de version à quoi revenir** :
ratée, elle le remet sur le clone — qui porte ce même code. Pour lui donner un filet, bascule-le
d'abord sur le code d'avant le pull, puis sur le nouveau :

```bash
sudo /opt/brigade/runtime/deploy/brigade-bascule "$PROJET" ORIG_HEAD    # ce que le pull vient de remplacer
sudo /opt/brigade/runtime/deploy/brigade-bascule "$PROJET"
```

Ce que la vérification dit, avant puis après :

```
  à savoir  une version attend : le clone (/opt/brigade) porte un runtime que brigade@boutique.service ne sert pas — en service : 9e41c07a55d2
            → `sudo /opt/brigade/runtime/deploy/brigade-bascule boutique`, au moment que tu choisis : ses cooks en vol sont interrompus, et leurs tickets repris par des cooks neufs — docs/installer.md, « Mettre brigade à jour »
```

```
  ok        unités à jour : rien de ce qui est posé sous /etc/systemd/system ne diffère du dépôt (/opt/brigade-versions/boutique/3f2a9c1d0b7e…/runtime/deploy) — brigade-sauvegarde@.service, brigade-sauvegarde@.timer, brigade@.service
  ok        runtime à jour : brigade@boutique.service tourne sur le code installé (/opt/brigade-versions/boutique/3f2a9c1d0b7e…/runtime/src)
  ok        version en service : 3f2a9c1d0b7e pour brigade@boutique.service — celle du clone (/opt/brigade)
```

Ces lignes sont des `à savoir` : la vérification reste « prêt » et sort en `0` — un cook part
aussi bien sur la version d'avant. Elles sont dites **pour le projet que tu nommes**.

#### Une version qui change une unité : le pas qui n'a pas de filet

Les unités valent pour **toute la box** : les recopier fait bouger ce que systemd lancera pour
chaque projet, et aucune bascule ne les ramène. La bascule **refuse** donc (code `72`, rien n'est
arrêté) une version dont une unité diffère de celle qui est posée, en les nommant. Ce pas-là reste
à la main, et tu le fais en le sachant :

```bash
sudo cp /opt/brigade/runtime/deploy/*.service /opt/brigade/runtime/deploy/*.timer /etc/systemd/system/
sudo systemctl daemon-reload
sudo /opt/brigade/runtime/deploy/brigade-bascule "$PROJET"
```

Entre le `cp` et la bascule de chaque projet, un runtime que systemd relancerait partirait avec
l'unité neuve sur son code d'avant ; et un retour ramène le code, **pas l'unité**. D'ici à ce que
tu les aies basculés, la vérification des autres projets nomme `unités périmées` : c'est vrai, vu
de la version qu'ils servent.

**`cloison.conf` ne se recopie pas à l'aveugle.** C'est une copie comme les autres, mais elle
porte tes réglages (`BRIGADE_SANDBOX_HIDDEN`, `BRIGADE_SANDBOX_PRIVATE`). La bascule et la
vérification la comparent **ces deux lignes mises à part** : un réglage à toi n'est pas une
dérive. Quand elles la nomment, recopie-la (`sudo cp /opt/brigade/runtime/deploy/cloison.conf
/etc/systemd/system/brigade@<projet>.service.d/`), reporte-y tes deux réglages, puis
`daemon-reload` et la bascule. Les autres drop-ins — `compte.conf`, les variables du projet,
`porte.conf`, `arbitre.conf` — sont à la box : aucune mise à jour ne les touche. `code.conf` est à
la bascule : ne l'écris pas.

#### Ce que la bascule ne touche pas

| Quoi | Ce qui lui arrive | Comment il se met à jour |
|---|---|---|
| Les autres projets de la box | **rien** : ni lus, ni arrêtés, ni relancés | chacun par sa bascule, quand tu veux |
| La porte du projet (`brigade-porte@<projet>`) | rien : elle n'est pas redémarrée, le runtime repasse par elle | elle tourne sur le clone (`/opt/brigade/runtime`) : `sudo systemctl restart "brigade-porte@$PROJET" "brigade@$PROJET"` quand tu veux son code neuf — le runtime s'arrête avec elle et repart sur la version qu'il servait. Sans essai ni retour |
| L'arbitre (`brigade-arbitre`) | rien | sur le clone lui aussi. Redémarré, il repart **vide** (`runtime.md`, « Quand il redémarre ») : ne le touche que si son unité a changé |
| La sauvegarde (`brigade-sauvegarde@<projet>`) | rien | elle n'est pas un process qui tourne : lancée chaque nuit, elle prend le code du clone. Si son minuteur a changé : `sudo systemctl restart brigade-sauvegarde@<projet>.timer`, qui ne sauvegarde rien et relit seulement l'heure |
| Le « stop », le disjoncteur ouvert, le grant, le journal | tiennent : l'état du projet n'est pas la version de son code. La bascule n'y écrit rien — elle n'y retire que le témoin du démarrage | — |

Ce que la vérification compare, et comment :

- **Les unités** : chaque fichier `.service` et `.timer` de la version que le projet sert
  (`runtime/deploy/`), octet pour octet, contre celui du même nom posé là d'où systemd charge
  `brigade@<projet>.service` (`/etc/systemd/system`). **Une unité qui n'est pas posée n'est pas une dérive** : une box
  installée avant qu'une unité n'existe ne l'a pas, et la ligne nomme ce qui a été comparé. **Rien de comparé n'est jamais dit « à jour »** : une unité masquée, chargée depuis le dépôt lui-même, ou sans aucune copie posée, donne « unités non comparées » et sa raison.
- **Le runtime** : en démarrant, il laisse l'empreinte de son code (`runtime/src/`) dans son
  répertoire d'état (`code-en-service`) ; la vérification la compare à celle du code installé. Ni
  horloge ni `git`. Un runtime qui tourne sans avoir rien laissé est dit périmé, avec sa bascule.
  Un runtime à l'arrêt (`inactive`, `failed`) n'a rien à redémarrer, et la ligne le dit ; un runtime en train de
  s'arrêter ou de se recharger (`deactivating`, `reloading`) n'est dit ni à l'arrêt ni à jour : la
  ligne le dit en transition, à revérifier une fois posé.
- **La bascule** : le répertoire de travail de l'instance dit si le projet a basculé ; le compte
  rendu que la dernière bascule a laissé à côté des versions (`bascule`) dit laquelle sert et
  laquelle a été refusée ; et l'empreinte du `runtime/src/` du clone, comparée à celle de la
  version servie, dit si une version attend — un `git pull` qui ne touche pas `runtime/src/` n'en
  fait attendre aucune.

## 4. Déclarer le projet

Deux gestes, **une fois par projet**. `<projet>` est un identifiant court que tu choisis
(minuscules, chiffres, tirets) : il nomme l'instance, rien d'autre ne le relie au dépôt.

### Son clone, ses variables, sa sauvegarde

*Geste 6.* Sur la box. Les neuf valeurs du haut sont les seules à remplir :

```bash
PROJET=<projet>
DEPOT=<owner>/<repo>
BRANCHE=<branche d'intégration>
COMPTE=<compte>
SAUVEGARDES=<répertoire des sauvegardes de ce projet>
# Le calibrage des jugements : c'est ton quota, il n'a pas de défaut.
# Modèle : opus, sonnet ou haiku. Effort : low, medium, high, xhigh ou max.
MANAGER_MODELE=<modèle>; MANAGER_EFFORT=<effort>
REVIEWER_MODELE=<modèle>; REVIEWER_EFFORT=<effort>

# Le clone réservé : personne n'y travaille, la station y accroche les worktrees des cooks.
sudo install -d -o "$COMPTE" "/var/lib/brigade/$PROJET" "$SAUVEGARDES"
sudo -u "$COMPTE" git clone "https://github.com/$DEPOT.git" "/var/lib/brigade/$PROJET/depot"

# Le drop-in de l'instance : c'est lui qui fait exister le projet sur la box.
sudo install -d "/etc/systemd/system/brigade@$PROJET.service.d" "/etc/systemd/system/brigade-sauvegarde@$PROJET.service.d"
sudo tee "/etc/systemd/system/brigade@$PROJET.service.d/projet.conf" >/dev/null <<EOF
[Service]
Environment=BRIGADE_GITHUB_REPO=$DEPOT
Environment=BRIGADE_BASE_BRANCH=$BRANCHE
Environment=BRIGADE_MANAGER_MODEL=$MANAGER_MODELE
Environment=BRIGADE_MANAGER_EFFORT=$MANAGER_EFFORT
Environment=BRIGADE_REVIEWER_MODEL=$REVIEWER_MODELE
Environment=BRIGADE_REVIEWER_EFFORT=$REVIEWER_EFFORT
EOF

# La sauvegarde du journal, chaque nuit à 03:30.
printf '[Service]\nEnvironment=BRIGADE_BACKUP_DIR=%s\n' "$SAUVEGARDES" | sudo tee "/etc/systemd/system/brigade-sauvegarde@$PROJET.service.d/projet.conf" >/dev/null
sudo systemctl daemon-reload
sudo systemctl enable --now "brigade-sauvegarde@$PROJET.timer"
```

**Ne démarre pas encore le service** : vérifie d'abord (geste 8).

Les **neuf variables** sans lesquelles le runtime refuse de démarrer, et d'où chacune vient :

| Variable | Posée par |
|---|---|
| `BRIGADE_STATE_DIR`, `BRIGADE_PROJECT`, `BRIGADE_REPO_DIR` | l'unité, d'après le nom de l'instance — rien à écrire |
| `BRIGADE_GITHUB_REPO`, `BRIGADE_BASE_BRANCH` | le drop-in de l'instance |
| `BRIGADE_MANAGER_MODEL`, `BRIGADE_MANAGER_EFFORT`, `BRIGADE_REVIEWER_MODEL`, `BRIGADE_REVIEWER_EFFORT` | le drop-in de l'instance |

**La destination des sauvegardes** est propre au projet et **hors de `/var/lib/brigade/<projet>`**
— sur un autre disque si la machine en a un. Elle n'a pas de défaut : la sauvegarde ne choisit pas
seule un disque. Manquée (machine éteinte à 03:30), elle est jouée au démarrage suivant ; pour une
autre cadence, un drop-in du timer avec `OnCalendar=` vide puis la tienne. Restaurer est dans
`runtime.md`, « Sauvegarder et restaurer ».

Rien d'autre n'est nécessaire pour servir un projet. Ce qui est **facultatif** se pose plus tard
dans le même drop-in, et se lit dans `runtime.md` quand tu en as l'usage : les réglages
(« Neuf variables, aucun défaut »), les secrets de dev du projet (« Les secrets du projet »), une
identité GitHub par rôle pour un dépôt partagé (« Ce que tu crées chez GitHub »).

### Protéger la branche d'intégration

*Geste 7.* Sur GitHub, par toi qui administres le dépôt — depuis n'importe quelle machine où ton
`gh` est connecté. PR obligatoire, zéro approbation requise, administrateurs inclus : plus personne
ne pousse directement sur la branche ; les merges de PR passent.

```bash
DEPOT=<owner>/<repo>
BRANCHE=<branche d'intégration>
gh api -X PUT "repos/$DEPOT/branches/$BRANCHE/protection" --input - <<'JSON'
{
  "required_status_checks": null,
  "enforce_admins": true,
  "required_pull_request_reviews": { "required_approving_review_count": 0 },
  "restrictions": null
}
JSON
gh api "repos/$DEPOT/branches/$BRANCHE/protection" --jq '.required_pull_request_reviews, .enforce_admins.enabled'
# La push protection : la seconde barrière contre une livraison qui porterait des identifiants.
gh api -X PATCH "repos/$DEPOT" --input - <<'JSON'
{ "security_and_analysis": { "secret_scanning": { "status": "enabled" }, "secret_scanning_push_protection": { "status": "enabled" } } }
JSON
```

**La protection de branche est la seule que le runtime suppose.** « Branche à jour exigée » n'est
pas requise ; activée, son refus repart au cook comme un finding (`pass.outdated`) et consomme un
renvoi — tout autre refus est un arrêt (`merge-refused`). Elle ne réserve pas le merge à la pass :
seule une identité par rôle le permet.

**La push protection ne se suppose pas** : le geste 8 dit ce que GitHub en rend. Gratuite sur un
dépôt **public**, elle réclame sur un dépôt **privé** GitHub Secret Protection (plans Team et
Enterprise, d'une organisation) — sans elle il n'y a qu'une barrière, celle de la station, qui ne
voit que ce qui passe par elle. **Même active**, elle ne reconnaît que les formes de sa liste (des
clés d'API Anthropic, **pas le jeton de connexion d'un abonnement Max**), ne voit pas une copie
transformée, et quiconque écrit sur le dépôt peut la contourner depuis le site — un cook ne le peut
pas, il n'a ni compte ni navigateur. Le jour où tu crois que la connexion Max a fui : `runtime.md`,
« Révoquer la connexion Max ».

## 5. Vérifier que le projet est prêt

*Geste 8.* Une commande dit si un cook peut partir, **et nomme tout ce qui manque d'un coup** — pas le
premier manque. Elle ne lance ni cook ni setup, ne consomme aucun quota, n'écrit rien sur GitHub
et n'ouvre pas le journal ; dans le clone réservé, elle ne déplace aucune référence. Elle se rejoue
autant qu'on veut, service arrêté ou non.

Elle lit **l'environnement du service**, comme le runtime : sur la box, elle se lance par le geste
`brigade <projet> <commande>`, qui le lui donne. Il ne connaît un projet qu'à son drop-in — celui
du geste 6.

```
$ brigade boutique installation

Sur la machine
  ok        les 9 variables obligatoires sont posées, et tout ce que le runtime lit de son environnement est lisible
  ok        clone réservé : /var/lib/brigade/boutique/depot, `main` lue sur l'origine (a1b2c3d)
  ok        session Max : `claude` est connecté sous ce compte
  ok        unité de service : brigade@boutique.service
  ok        unités à jour : rien de ce qui est posé sous /etc/systemd/system ne diffère du dépôt (/opt/brigade/runtime/deploy) — brigade-sauvegarde@.service, brigade-sauvegarde@.timer, brigade@.service
  ok        runtime à l'arrêt : brigade@boutique.service démarrera sur le code installé (/opt/brigade/runtime/src)

Dans le dépôt
  MANQUE    `.claude/brigade/gates.sh` n'est pas exécutable : la pass le lance tel quel
            → `git update-index --chmod=+x .claude/brigade/gates.sh`, commité sur `main`
  ok        setup du worktree : `.claude/brigade/worktree-setup.sh`
  ok        bindings : bloc présent, branche d'intégration `main`

Sur GitHub
  ok        dépôt lu par `gh` : acme/boutique
  à savoir  la push protection de GitHub n'est pas constatée sur acme/boutique (GitHub en dit : `disabled`) : la station reste la seule barrière contre une livraison qui porterait des identifiants
            → docs/installer.md, « Déclarer le projet »
  MANQUE    labels absents du dépôt : fire, model:opus, model:sonnet, …
            → la même commande, suivie de `labels`

brigade : projet « boutique » : 2 manques : aucun cook ne doit être lancé tant qu'il en reste
```

| Marque | Ce qu'elle veut dire | Code de sortie |
|---|---|---|
| `ok` | constaté | |
| `MANQUE` | un cook lancé maintenant échouerait, ou sa livraison ne serait pas jugée. Le geste qui le règle suit la flèche | `1` dès qu'il y en a un |
| `à savoir` | rien n'est retenu, mais tu dois le savoir : pas de setup, sauvegarde non programmée, push protection non constatée, binding que le runtime ne lit pas, **box à mettre à jour** (unités périmées, une version qui attend, un projet pas encore basculé, une bascule revenue) | |

Sans aucun `MANQUE`, elle sort en `0` et dit « prêt ».

Ce qu'elle contrôle :

| Où | Quoi |
|---|---|
| Machine | les neuf variables, **toutes** celles qui manquent ; chaque réglage mal écrit, avec les mots que le runtime emploierait pour refuser de démarrer ; aucune clé ni jeton `claude` dans l'environnement |
| Machine | le clone réservé existe, c'est bien celui du dépôt désigné, son origine répond sous ce compte, et la branche d'intégration y existe |
| Machine | **`node` démarre dans l'environnement de l'unité, et c'est celui que le runtime réclame** — le geste le dit avant de lancer quoi que ce soit (code `70`) |
| Machine | le compte a une identité git : un cook y commite |
| Machine | `claude` est connecté (`claude auth status`, aucun appel au modèle) ; l'unité `brigade@<projet>.service` est installée ; la sauvegarde est programmée |
| Machine | `claude` se trouve dans le `PATH` **que l'unité donnera au runtime** — celui de ses drop-ins, ou le défaut de systemd —, pas dans celui du shell qui lance la commande ; son répertoire temporaire (`/tmp/claude-<uid>`, ou sous `CLAUDE_CODE_TMPDIR`) est au compte, s'il existe |
| Machine | **la box est à jour** : les unités posées sont celles de la version servie, le runtime tourne sur elle, et c'est celle du clone — sinon ce qui est périmé ou attend est nommé, avec son geste ; **une bascule revenue se relit là** (« Mettre brigade à jour ») |
| Dépôt | sur la branche d'intégration **telle que l'origine la porte** : gates et setup présents et exécutables, bloc de bindings, branche d'intégration cohérente |
| GitHub | `gh` lit le dépôt sous ce compte, **et peut y pousser** ; les labels du rail y sont ; ce que GitHub rend de la push protection |

Ce qu'elle ne contrôle **pas** : que le setup et les gates *réussissent* (le geste 9 joue le setup ;
les gates se prouvent par `/brigade:init`), la protection de la branche (le geste 7 la relit
lui-même), les secrets du projet, et, sous une identité par rôle, les droits de chaque App. Quand
elle ne peut pas lire le dépôt — clone absent, branche introuvable — elle le dit (`dépôt non vérifié`) au
lieu de le déclarer bon.

**Les trois pièges d'un serveur neuf ne se découvrent plus en butant dessus** — ils ont buté une
fois, à la recette du 2026-10-09, sur un Debian 12 nu. Les deux premiers se lisent ainsi ; le
troisième a disparu :

```
brigade : `node` ne démarre pas dans l'environnement de brigade@boutique.service — node: error while loading shared libraries: libatomic.so.1: cannot open shared object file: No such file or directory
          → `sudo apt install libatomic1` (docs/installer.md, « Préparer la box »)
```

```
  MANQUE    `claude` est introuvable dans le `PATH` que l'unité brigade@boutique.service donnera au runtime (/usr/local/sbin:/usr/local/bin:/usr/sbin:/usr/bin, le défaut de systemd : aucun `Environment=PATH=` dans ses drop-ins) : aucun cook ne partirait — le `PATH` du shell qui lance cette commande ne compte pas
            → `sudo ln -sfn /home/<compte>/.local/bin/claude /usr/local/bin/claude` — l'installeur natif pose `claude` sous `~/.local/bin` du compte, que systemd ne donne pas à l'unité ; docs/installer.md, « Préparer la box »
```

Le premier est dit par le geste lui-même, qui sort en `70` : sans `node`, la commande ne peut rien
dire. Un `node` plus ancien que celui que le runtime réclame est refusé de la même façon, avec les
deux versions.

Le troisième — un `/tmp/claude-<uid>` qui n'est pas au compte, où `claude` refuse de se lancer —
n'arrête plus aucun cook : l'unité a son propre `/tmp`. Il ne gêne plus qu'un `claude` lancé à la
main sous le compte, la connexion Max du geste 4 comprise, et la commande le dit en `à savoir`,
avec son `chown`.

Sur un poste sans systemd, l'unité n'est pas vérifiée — ni le `PATH` qu'elle donnerait, ni ses
copies, ni le code sur lequel le runtime tourne — et la commande le dit.

**Puis la même commande, depuis ta machine** — c'est ce que l'app fera, et ce que la box ne peut
pas vérifier d'elle-même. Le code de sortie est le verdict :

```bash
ssh -o BatchMode=yes -o ConnectTimeout=10 <box> brigade <projet> installation; echo $?
```

| Ce que tu lis | Ce que c'est | Le geste |
|---|---|---|
| `0`, `1` ou `2`, et la sortie de la commande | **la commande a été lancée** : le lien et le droit sont là. `1` : il manque quelque chose au projet, la sortie le nomme | — |
| `255` | `ssh` n'a pas joint la box, ou ta clé y est refusée | le geste 2 |
| `68`, `brigade : « <toi> » n'a pas le droit de lancer le geste sur cette box …` | tu as un compte sur la box, pas le droit du geste | « Ajouter un humain » |
| `65`, `brigade : projet inconnu sur cette box …` | le nom du projet, ou son drop-in | le geste 6 |
| `69`, ``brigade : `sudo` manque sur cette box …`` | la box n'a pas de `sudo` : le geste ne peut pas passer sous le compte du service | installe-le sur la box (`apt install sudo`, sous `root`) |
| `70`, ``brigade : `node` ne démarre pas …`` ou `` `node` est en … `` | Node manque à la box, ne démarre pas, ou est trop ancien | ce que la phrase dit ; le geste 3 |
| `127`, `brigade: command not found` | le geste n'est pas posé sur la box | le geste 5 |
| autre chose que la sortie de `installation` — un écran de session, une invite | ton compte sur la box est enfermé dans une commande forcée, qui remplace celle que tu envoies | « Ajouter un humain », « Un shell n'est pas le droit de lire » |

### Créer les labels

Toujours le geste 8 — c'est le seul manque que la vérification règle elle-même :

```bash
brigade <projet> installation labels
```

Crée sur le dépôt ceux qui manquent parmi `fire`, `prio:1` à `prio:3`, `model:opus|sonnet|haiku`
et `effort:low|medium|high|xhigh|max`. **Un label qui existe n'est ni recréé ni retouché** — sa
couleur et sa description sont au projet — et la commande se rejoue sans dégât. Les labels du
protocole V1 (`product`, `triage`, `feature`…) sont posés par `/brigade:init` ; ceux que le manager
lit s'il les trouve (`epic`, `question`, `decision`, `blocked-on-human`) sont à toi.

## 6. Mesurer le coût du setup

*Geste 9.* Sur brigade, le setup est un `npm ci` de deux paquets. Sur un vrai projet c'est une installation
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

*Geste 10.* **Le premier ticket d'un projet est servi sans grant `merge`** : la pass ouvre la PR, la juge, et
s'arrête. C'est toi qui merges. Sur brigade, un cook qui se trompe casse une branche de refonte ;
sur un projet actif, il casse la branche sur laquelle d'autres travaillent.

Il n'y a rien à désactiver : le grant est **absent** sur un répertoire d'état neuf, et le manager
est **éteint**. Vérifie-le, puis démarre.

```bash
sudo systemctl enable --now brigade@<projet>                   # démarre, et redémarre à chaque reboot
brigade <projet> grant                                         # « ABSENT — jamais donné »
sudo systemctl start brigade-sauvegarde@<projet>.service       # une première sauvegarde, tout de suite
```

Pose `fire`, `model:haiku` et `effort:low` sur une issue courte. Suis-la avec
`brigade <projet> status` et `brigade <projet> pass`. La PR ouverte et verte, relis-la et merge-la
toi-même.

Ce que le process imprime se lit par `journalctl -u brigade@<projet> -f` ; un refus de démarrer
(code 2) ne se réessaie pas, et `systemctl status brigade@<projet>` en dit le motif. Toutes les
commandes du geste, et la mise à jour de brigade, sont dans `runtime.md`, « Piloter ».

**N'active le grant qu'après avoir relu au moins une livraison de ce projet** — une commande, sans
redémarrage (`brigade <projet> grant activer merge`), de préférence avec une échéance (`--pour 4h`,
`--usages 10`) : il s'éteint alors seul, voir « Le grant `merge` » dans [`runtime.md`](runtime.md).

**Avant d'accorder, lis le bilan des arrêts faute de grant.** Chaque livraison verte arrêtée dit
sur son issue ce que la pass aurait mergé ; `pass` et `grant` comptent ce que tu en as
fait — mergées, fermées sans merge (les désaccords), encore ouvertes. C'est le chiffre sur
lequel accorder (`runtime.md`, « Les motifs, et le geste de chacun »).

## Un second projet sur la box

Un second projet rejoue les gestes 1 et 6 à 10 — rien de « Préparer la box ». **Deux choses de
plus se posent alors, pour tous les projets de la box** ; leurs unités sont déjà copiées. Ce
qu'elles font est dans `runtime.md`, « La cloison » et « L'arbitre entre projets ».

### La cloison

**Par projet.** Sans elle, les projets de la box se voient, fichiers et secrets compris, et leurs
cooks joignent tout Internet ; le runtime le dit à chaque démarrage. À poser avant qu'un second
projet n'arrive avec ses secrets.

À vérifier d'abord, sous le compte du service :

1. `bwrap` est installé (`sudo apt install bubblewrap`) et **se lance sans privilège** :
   `sudo -u <compte> bwrap --ro-bind / / --dev /dev --proc /proc --unshare-pid true` ne dit rien.
   Un refus `setting up uid map: Permission denied` (AppArmor, Ubuntu récente) est un réglage de la
   machine : `kernel.apparmor_restrict_unprivileged_userns`, ou un profil pour `bwrap`.
2. `env --default-signal=TERM true` ne dit rien (coreutils 8.32 au moins) : c'est par lui qu'un
   cook cloisonné entend son signal d'arrêt.
3. `claude` n'est **pas** installé sous `~/.claude` (`readlink -f "$(command -v claude)"`), que
   la cloison remplace par celui du projet. Sous `~/.local`, là où le geste 3 le pose, un cook le
   lit sans pouvoir y écrire.
4. Les secrets et les clés du projet sont sous `/etc/brigade/<projet>/`, son état sous
   `/var/lib/brigade/<projet>/` — ce sont les deux répertoires masqués.
5. **Le dépôt déclare ses registres de paquets** dans `.claude/brigade/reseau` (un hôte par ligne,
   mergé sur la branche d'intégration) : aucun n'est ouvert d'office, et un setup qui installe des
   paquets échouerait. Une déclaration mergée après coup est lue à la prise du ticket suivant,
   avant son setup — rien à redémarrer, aucun ticket perdu. `brigade <projet> cloison` montre la
   liste lue.

```bash
PROJET=<projet>
PORT=<port de la porte>     # un par projet, aucun défaut
sudo cp /opt/brigade/runtime/deploy/cloison.conf "/etc/systemd/system/brigade@$PROJET.service.d/"
sudo install -d "/etc/systemd/system/brigade-porte@$PROJET.service.d"
# Le même port des deux côtés : la porte l'ouvre, le runtime sort par lui.
printf '[Service]\nEnvironment=BRIGADE_PROXY_PORT=%s\n' "$PORT" | sudo tee "/etc/systemd/system/brigade@$PROJET.service.d/porte.conf" "/etc/systemd/system/brigade-porte@$PROJET.service.d/porte.conf" >/dev/null
sudo systemctl daemon-reload
sudo systemctl enable --now "brigade-porte@$PROJET"
sudo systemctl restart "brigade@$PROJET"
```

Le compte du service devient en lecture seule pour ses lancements : une chaîne d'outils qui écrit
sous `~` se nomme dans `BRIGADE_SANDBOX_PRIVATE`, et ce que le compte garde et qu'un cook n'a pas
à lire (`/home/<compte>/.ssh`) s'ajoute à `BRIGADE_SANDBOX_HIDDEN` — les deux dans le
`cloison.conf` copié. Avant de lancer un cook : `journalctl -u brigade@<projet>` montre les lignes
`cloison —` et `réseau —`, la seconde disant qu'**un envoi direct est refusé par le noyau** ; puis
`brigade <projet> cloison eprouver`, dont chaque sonde doit tenir.

### L'arbitre

**Un par box.** Sans lui, chaque projet se tient pour seul sur la machine et sur le compte Max :
leurs plafonds de cooks s'additionnent, et rien ne dit qui passe devant.

```bash
PORT=<port de l'arbitre>
COOKS=<plafond de cooks du compte, tous projets confondus>     # ni l'un ni l'autre n'a de défaut
sudo install -d /etc/systemd/system/brigade-arbitre.service.d
printf '[Service]\nEnvironment=BRIGADE_ARBITER_PORT=%s\nEnvironment=BRIGADE_ARBITER_MAX_COOKS=%s\n' "$PORT" "$COOKS" | sudo tee /etc/systemd/system/brigade-arbitre.service.d/arbitre.conf >/dev/null
sudo systemctl daemon-reload
sudo systemctl enable --now brigade-arbitre.service
# Puis, pour CHAQUE projet de la box, le même port — c'est par lui que son runtime joint l'arbitre :
for PROJET in <projet> <projet>; do
  printf '[Service]\nEnvironment=BRIGADE_ARBITER_PORT=%s\n' "$PORT" | sudo tee "/etc/systemd/system/brigade@$PROJET.service.d/arbitre.conf" >/dev/null
done
sudo systemctl daemon-reload
sudo systemctl restart 'brigade@*'
```

`journalctl -u brigade@<projet>` dit `arbitre — 127.0.0.1:<port>, consulté avant chaque
lancement`. Un projet dont le drop-in n'a pas le port n'est ni arbitré ni compté : il lance comme
s'il était seul. **Arrêter l'arbitre ne gèle personne** : chaque projet passe en mode dégradé, un
cook à la fois.

## Ajouter une box, une machine, un humain

Aucun des trois ne rejoue l'installation d'un projet, et aucun ne touche aux deux autres.

| Un de plus | Le geste | Où | Ce qui est à refaire, et pourquoi |
|---|---|---|---|
| **Une box** | la préparer (gestes 3 à 5), puis donner son adresse | la box ; l'app | le groupe et sa règle `sudoers`, **une fois par box** ; un compte **par humain et par box** — les comptes et les règles d'une machine ne se partagent pas avec une autre |
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
avec le geste lui-même (geste 5). Ajouter un humain ne réécrit aucune règle et
ne touche à aucun projet.

**Ce que tu lui donnes, en toutes lettres.** Le droit du groupe est le geste `brigade`, entier :
**toutes ses commandes (`runtime.md`, « Piloter »), pour tous les projets de la box** — lire le `status`, mais
aussi accorder le grant `merge`, dire « stop », désinstaller un projet. **Lire et agir ne sont pas
séparés** : doser les droits par humain n'existe pas encore (V2.5). C'est du même ordre que lui
donner un shell sur la box, et il en a un, sous son compte. Ce qu'il n'a pas : un shell sous le
compte du service, la session Max, et — comme toi, comme la box — un accès à la prod.

**La vérification**, depuis **sa** machine, avec son compte dans `<box>` :

```bash
ssh -o BatchMode=yes -o ConnectTimeout=10 <humain>@<adresse> brigade <projet> status; echo $?
```

`0` et la sortie de `status` : c'est fait. Tout autre résultat se lit dans le tableau du
geste 8 — `255`, sa clé ; `68`, le groupe (`id <humain>` sur la box doit nommer `brigade-chefs`).

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

Puis la vérification du geste 2, depuis la machine neuve. Une clé par machine : en retirer une,
c'est retirer sa ligne de `~/.ssh/authorized_keys` sur la box.

### Ajouter une box

Une box de plus se prépare comme la première — les gestes 3 à 5, puis 6 à 10 par projet. **Deux
choses s'y rejouent pour les humains, et pas une de plus** : le groupe `brigade-chefs` et sa règle
(une fois, dans le geste 5), et le compte de chaque humain (« Ajouter un humain »). Elles vivent dans `/etc` de chaque machine : rien de brigade ne les recopie d'une box à
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
sudo rm -rf /opt/brigade-versions/<projet>               # les versions du runtime que la bascule lui a posées
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
| Les unités `brigade*`, leur réglage `compte.conf`, le geste `brigade`, sa règle et le groupe `brigade-chefs` | `/etc/systemd/system/`, `/usr/local/bin/`, `/etc/sudoers.d/brigade` | ils servent les autres projets de la machine ; à retirer avec le dernier. Les comptes des humains sont à eux, pas à un projet |
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

## Ce que seule une vraie box prouvera

Une session de dev n'a ni systemd, ni `sudo`, ni `sshd`, ni serveur neuf : ce parcours y est
prouvé contre des doublures. Le reste est une recette, à jouer **par quelqu'un qui n'a pas
installé la première box**, sur un serveur neuf, en notant **ce qui a résisté** et **combien de
gestes il a fallu** — la mesure de référence est en tête de ce document.

**Le parcours lui-même** (#315) :

1. Les gestes 1 à 10, dans l'ordre, sans ouvrir un autre document. À la fin, le premier ticket
   s'arrête à la PR ouverte, et `brigade <projet> grant` montre le grant absent.
2. Le geste 3 : l'installeur natif de `claude` pose bien son binaire sous `~/.local/bin` du
   compte, et le lien de `/usr/local/bin` survit à une mise à jour de `claude`.
3. Le geste 5 : `systemctl show -p User brigade@<projet>.service` rend `<compte>` (le réglage
   `compte.conf` du gabarit vaut pour ses instances), et la règle écrite par `tee` passe
   `visudo -cf`.
4. `PrivateTmp=yes` dans `brigade@.service` : un cook part et finit, et `brigade <projet>
   installation` — lancée hors de l'unité — lit toujours la session Max.
5. Les pièges, provoqués : sans `libatomic1`, `brigade <projet> installation` sort en `70` et le
   nomme ; sans le lien de `claude`, elle le nomme en `MANQUE`.
6. Ce que GitHub rend pour de vrai : `permissions.push` et l'état de la push protection, lus par
   le geste 8 sous le compte de la box.
7. `sudo git -C /opt/brigade status --porcelain` et `sudo git -C /opt/brigade log origin/v2..` ne
   rendent rien à la fin (le clone est à `root`) :
   **rien dans le code de brigade n'a eu à changer pour ce projet-là.**
8. `brigade <projet> installation setup` : reporter la durée, le poids, et le verdict à 30 cooks.

**La mise à jour et la bascule** (#337, #354) — prouvées contre une doublure de `systemctl`, qui
joue le démarrage que la version dicte. Sur la box, à jouer sur un projet d'essai :

1. Box installée avant la bascule : `brigade <projet> installation` dit `pas encore basculé`.
   Après `git pull`, `brigade-bascule <projet> ORIG_HEAD` puis `brigade-bascule <projet>` : `0`
   deux fois, `systemctl show -p WorkingDirectory brigade@<projet>.service` rend
   `/opt/brigade-versions/<projet>/en-service/runtime`, et celui d'un autre projet rend toujours
   `/opt/brigade/runtime`. La vérification dit `version en service` et « à jour » deux fois.
2. **Le démarrage réel** : `node` suit le lien — le runtime lancé depuis `en-service/runtime` note
   bien l'empreinte de la version posée (`runtime à jour`), et `brigade <projet> status` répond
   depuis elle.
3. **Le retour, provoqué** : un commit dont `runtime/src/main.ts` sort en code 2 dès son début,
   basculé — `73`, la précédente est `active`, `essai.journal` porte la raison que le runtime a
   écrite, et `brigade <projet> installation` dit `bascule revenue`. Le même avec un `main.ts` qui
   lève une exception (`Restart=on-failure` le relance) : c'est `NRestarts` ou
   `SubState=auto-restart` qui le dit, **et `systemctl reset-failed` a bien remis `NRestarts` à
   zéro avant l'essai suivant** — la doublure le suppose.
4. `journalctl -u <unité> --since "@<secondes>"` rend bien les lignes de l'essai, et elles seules.
5. Un commit qui change `brigade@.service` : `72`, et `systemctl is-active` n'a pas bougé.
6. Sous cloison : le runtime basculé redit ses lignes `cloison —` et `réseau —`, la porte n'a pas
   été redémarrée, et un cook part — la version sous `/opt/brigade-versions` est lisible du compte
   du service et de sa cloison.
7. Les fichiers posés par `git archive | tar` en root sont lisibles du compte du service (`umask`
   de root), et rien sous `/opt/brigade-versions` ne lui est inscriptible : **un cook ne peut pas
   modifier le runtime qui le sert**, seulement en livrer un.
8. `systemctl show -p FragmentPath brigade@<projet>.service` rend bien le gabarit posé
   (`/etc/systemd/system/brigade@.service`), et `ActiveState` vaut `active` runtime lancé.

**Le geste contre une vraie unité** : ce que `systemctl show` rend d'une valeur qui contient un
espace, et la règle `sudoers` qui le nomme. Ses tests le jouent contre des doublures.

**L'accès à la box** (#314) — ni `sshd`, ni `sudo`, ni un second humain n'ont pu être éprouvés :

1. Depuis ta machine, les deux vérifications : `ssh -o BatchMode=yes <box> true` (geste 2) et
   `ssh -o BatchMode=yes <box> brigade <projet> installation` (geste 8) rendent ce que leurs
   tableaux disent.
2. « Ajouter un humain » pour un compte d'essai, puis sa vérification : `0`. Retiré du groupe
   (`gpasswd -d`) : **`68`**, et la phrase du geste — c'est `sudo -n` contre un vrai `sudoers`
   qui le dit, les tests ne le jouent que contre une doublure. **`68` aussi** (#329), et non `1`,
   pour un compte hors du groupe à qui `sudo` donne tout contre son mot de passe
   (`%sudo ALL=(ALL:ALL) ALL`) et qui porte une entrée `NOPASSWD` sans rapport. Ce même compte,
   dans un terminal (`ssh -t <box> 'brigade <projet> status < /dev/null'`) : `sudo` demande son
   mot de passe, et la commande part.
3. Un compte enfermé par `ForceCommand` : `sshd -T -C user=…` le nomme.
