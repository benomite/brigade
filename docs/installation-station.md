# Installer une station brigade sur un serveur

**Une station s'installe une fois par machine, puis on lui ajoute des projets.** Ce guide installe
la station d'un serveur, de la commande à la station qui tourne. Il ne parle d'aucun projet : un
projet n'est pas une installation, c'est une ligne de la configuration d'une station, et il
s'ajoute plus tard, depuis l'app.

Sur un ordinateur (Mac, Windows, Linux de bureau), la station, c'est l'app : ce guide n'est pas
pour lui.

**Tu peux te faire accompagner.** Colle ce guide à un assistant (Claude, par exemple) et
demande-lui de te guider pas à pas : tout ce qu'il faut savoir est ici, et il n'y a qu'une
commande à taper.

## Ce qu'il te faut

| | |
|---|---|
| **Un serveur Debian** | Debian 12 ou plus récent (ou un dérivé, Ubuntu compris), en `amd64` ou `arm64`, avec systemd — pas un conteneur. Il est allumé en permanence : c'est lui qui fera travailler les cooks. |
| **Un accès root, une fois** | `sudo`, ou une session root. C'est pour l'installation seulement : la vie de la station n'en demandera plus jamais. |
| **Le réseau** | le serveur joint GitHub et les dépôts de paquets de sa distribution. |
| **Un disque local** | `/var/lib` n'est ni sur `nfs` ni sur `cifs` (`df -T /var/lib`) : le verrou de chaque projet en dépend. |

| **Ton abonnement Claude Max** | pour la connexion Max, à la fin de la commande, une seule fois : un lien à ouvrir dans ton navigateur, un code à recopier. |

Ton compte GitHub servira aux étapes suivantes, pas à celle-ci.

## 1. La commande

Sur le serveur, colle :

```sh
curl -fsSL https://github.com/benomite/brigade/releases/latest/download/installer-station.sh | sudo sh
```

C'est tout. Sans `sudo` sur le serveur, la même dans une session root, sans `sudo` à la fin. Sans
`curl`, la même avec `wget -qO-` à la place de `curl -fsSL`.

La commande télécharge le paquet `brigade-station` de la dernière version publiée, le remet à
`apt` — qui pose ce dont il dépend (`git`, `gh`, `bubblewrap`…) —, attend que la station
démarre, puis fait la **connexion Max** (étape 2). Compte une à deux minutes, plus le temps de te
connecter.

## 2. Ce que tu dois voir

La commande montre l'état du service, puis deux lignes :

```
● brigade-station.service - brigade — la station de cette machine (tous ses projets)
     Loaded: loaded (…/brigade-station.service; enabled; …)
     Active: active (running) since …
…
… brigade : station démarrée — pid …, configuration /var/lib/brigade/projets ; aucun projet servi

brigade : station installée et active — <version>
brigade : tout ce qu'elle demande au système vient avec son paquet : sa vie courante ne demande aucune commande root
```

**`active (running)` et `aucun projet servi` : la station est installée.** Elle tourne, elle
redémarrera avec la machine, et elle attend ses projets.

### La connexion Max

La commande enchaîne sur la connexion de la station à ton abonnement Claude Max — le seul
moment où elle te demande quelque chose, et il ne revient pas :

```
brigade : la connexion Max du compte brigade — le seul moment où elle te demande quelque chose
connexion Max — `claude setup-token` va te donner un lien : ouvre-le, connecte-toi avec ton compte Claude Max, puis recopie ici le code qu'il affiche. Il ne se fait qu'une fois
…
connexion Max faite : le jeton est rangé, lisible du seul compte de la station, avec sa date de création à côté — la station n'a plus à se reconnecter
brigade : la suite : l'appairage avec l'app (…)
```

1. `claude` affiche un lien : ouvre-le dans ton navigateur, sur n'importe quelle machine.
2. Connecte-toi avec le compte de ton abonnement Max, et autorise Claude Code.
3. La page te donne un code : colle-le dans le terminal du serveur.

La connexion passe par **le binaire `claude` officiel**, sous le compte `brigade` : s'il n'est pas
sur le serveur, la commande le pose d'abord, par l'installeur d'Anthropic. `claude setup-token`
crée un **jeton longue durée** ; la commande le range sans jamais l'afficher, puis relance la
station pour qu'elle le lise. Ton quota Max ne sera jamais consommé autrement que par `claude`.

**Où est le jeton, et comment vérifier ses droits :**

| | |
|---|---|
| `/etc/brigade/claude-token` | le jeton, seul dans le fichier — `600`, au compte `brigade` |
| `/etc/brigade/claude-token.cree` | la date de sa création (sans le jeton), qui servira à t'avertir de son échéance |
| `/etc/brigade/jeton.env` | une ligne, qui dit à l'unité de la station où lire le jeton |

```sh
stat -c '%a %U' /etc/brigade/claude-token     # attendu : 600 brigade
```

**Si la connexion échoue** (`brigade : connexion Max non faite — …`), la ligne dit pourquoi :
relance la même commande. Elle ne réinstalle rien, et ne refait pas un jeton déjà rangé.
**Si la commande n'avait pas de terminal** (lancée depuis un script), elle le dit, et s'arrête
avant la connexion : relance-la depuis un terminal du serveur.

Si la commande s'arrête sur `brigade : installation refusée — …`, la ligne dit pourquoi : la
machine n'est pas un Debian, son architecture n'a pas de paquet, le téléchargement a échoué, ou
`apt` a refusé (sa sortie est juste au-dessus). Rien n'est à moitié installé que `apt` ne sache
reprendre : corrige ce qu'elle dit, et relance la même commande.

## 3. Ce que l'installation a posé

- **Le service `brigade-station`** : un seul pour toute la machine, quel que soit le nombre de
  projets. Ajouter ou retirer un projet ne touchera à aucun fichier du système.
- **Le compte `brigade`**, sous lequel tournent la station et ses cooks. C'est lui qui a fait la
  connexion Max, et lui seul lit le jeton.
- **Le jeton de la connexion Max** et sa date de création, dans `/etc/brigade` (étape 2).
- **`/var/lib/brigade`**, où la station gardera la configuration, le journal et le clone de
  chacun de ses projets.
- **Sa mise à jour**, deux minutes après chaque démarrage de la station puis toutes les dix
  minutes : voir « 6. La mise à jour, seule ».
- **Ses portes** (`brigade-station-porte`), la seule sortie réseau de la station et de ses cooks.
  La station ne joint que la machine elle-même ; ce qu'un projet lance sort par la porte de ce
  projet, qui ne laisse passer qu'Anthropic, GitHub et ce que le dépôt du projet déclare dans
  `.claude/brigade/reseau`. Ce qu'un projet ouvre ne l'est pas pour un autre. Chaque porte prend
  son port seule : il n'y a rien à régler.

Et rien d'autre : aucune règle `sudo`, et dans `/etc` que les trois fichiers du jeton. Tout vient du paquet, et le
suit : quand la station passe à une nouvelle version, ses unités, ses droits et son minuteur y
passent avec elle. Rien de ce que la station demande au système n'attend donc un geste root de
ta part.

## 4. Revoir la station, plus tard

Sans root, depuis n'importe quel compte du serveur :

```sh
systemctl status brigade-station
```

`active (running)`, c'est qu'elle tourne. Les dernières lignes de son journal n'y apparaissent que
si ton compte lit le journal du système ; sinon, c'est l'app qui te les montrera.

## 5. Le jeton de la connexion Max

Le jeton est créé une fois, à l'installation, et la station ne te demande plus rien ensuite :
rien à refaire à intervalle, rien à rafraîchir.

**Si la box est compromise, révoque le jeton depuis ton compte Claude (claude.ai, dans les
paramètres, parmi les sessions et applications connectées de Claude Code), puis supprime
`/etc/brigade/claude-token` : un jeton qu'on t'a pris ne sert plus à rien.**

Pour en créer un neuf (après une révocation, ou pour le remplacer), supprime ce fichier et relance
la commande de l'étape 1 : elle refait seulement la connexion Max — le lien, le code.

## 6. La mise à jour, seule

Quand une version de la station est publiée, la station y passe seule, comme un navigateur — tu
n'as rien à faire. Toutes les dix minutes, sa mise à jour (`brigade-station-mise-a-jour`, livrée
par le paquet, la seule part de la station qui tourne sous root) regarde les versions publiées ;
s'il y en a une plus récente, elle la remet à `apt`. Le paquet pose le nouveau code et ses unités,
puis relance la station — son seul process : **les cooks en cours finissent leur travail**, et la
station qui repart les reprend.

La nouvelle version est gardée quand la station s'y dit démarrée et sert tous les projets qu'elle
servait avant. Sinon, **elle revient seule à la version d'avant**, dont elle a gardé le paquet. Une
version ratée n'est pas réessayée ; la suivante le sera. Dans les deux cas, la file de chaque
projet le dit en une ligne, le jour même :

```
  passée en version 0.20261016.091500+g1a2b3c4 à 09 h 17
  mise à jour vers la version 0.20261016.120000+g5d6e7f8 ratée à 12 h 03 : la station s'est arrêtée en échec en 0.20261016.120000+g5d6e7f8 (systemd : failed) — revenue en version 0.20261016.091500+g1a2b3c4 ; 0.20261016.120000+g5d6e7f8 n'est pas réessayée, la suivante le sera
```

**Geler la version.** Pour qu'aucune nouvelle version ne soit installée, la station lit un réglage
dans `/var/lib/brigade/reglages` :

```
gel=oui
```

`gel=non`, ou le fichier retiré, lève le gel : la version qui attend est installée au passage
suivant. L'app le réglera d'un bouton ; d'ici là, c'est ce fichier. Un gel mal écrit gèle, dans le
doute.

**Où en est la mise à jour** : `/var/lib/brigade-station/etat.json` — la version installée, la plus
récente publiée, le gel, ce qui retient la suivante et ce qu'a donné la dernière mise à jour. Le
même état, en clair, sans root :

```sh
cd /usr/lib/brigade-station/runtime && BRIGADE_STATION_DIR=/var/lib/brigade BRIGADE_MISE_A_JOUR_DIR=/var/lib/brigade-station /usr/lib/brigade-station/node/bin/node src/mise-a-jour/main.ts etat
```

## 7. La suite — pas encore dans ce guide

Deux étapes amènent ensuite la station jusqu'à toi. Elles ne sont pas encore écrites ici : ce
guide les gagnera à mesure qu'elles arrivent.

1. **L'appairage avec l'app** — le serveur affiche un code, tu le tapes dans l'app, et la station
   apparaît sur sa home : « en ligne · version X · aucun projet ». L'app y montrera aussi l'état
   de sa mise à jour, et le bouton qui gèle sa version.
2. **Ajouter un projet** — depuis l'app : le dépôt GitHub, ses stations, sa principale. Sans
   terminal.
