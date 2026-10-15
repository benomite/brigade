# Le paquet Debian de la station

Une station serveur s'installe par un seul paquet, `brigade-station`. Tout ce que la station
demande au système vient avec lui et suit ses mises à jour : après l'installation, aucun geste
root. Le parcours du chef est dans [`docs/installation-station.md`](../../docs/installation-station.md) ;
ici, ce que le paquet porte et comment il se construit.

L'ancien chemin — une installation par projet, `runtime/deploy/`, ses drop-ins et ses règles
sudoers — n'est pas touché par ce paquet, et n'en a pas besoin.

## Construire

```sh
node runtime/paquet/construire.ts
```

écrit `runtime/paquet/construit/brigade-station_<version>_<arch>.deb` et dit son chemin. Il faut
`dpkg-deb` (Debian ; `brew install dpkg` sur un Mac), ni root ni fakeroot.

| Option | Sans elle |
|---|---|
| `--version <v>` | `0.<AAAAMMJJ>.<HHMMSS>+g<commit>` : la date (UTC) et l'empreinte du commit construit — deux commits successifs se suivent pour dpkg |
| `--sortie <dossier>` | `runtime/paquet/construit/` (ignoré par git) |
| `--node <binaire>` | le `node` qui lance la commande, vérifié contre l'`engines` du runtime |
| `--arch <amd64\|arm64>` | l'architecture de la machine ; une autre exige son `--node` |

Le paquet pèse une trentaine de mégaoctets : le binaire `node` en fait l'essentiel.

## Ce qu'il porte

| Chemin | Quoi |
|---|---|
| `/usr/lib/brigade-station/runtime/` | `src/` et `package.json` du runtime — ni tests ni dépendances de dev |
| `/usr/lib/brigade-station/node/bin/node` | le `node` de la station : celui de la machine n'y est pour rien |
| `/usr/lib/brigade-station/renouvellement` | le renouvellement de la session Max (`runtime/deploy/brigade-renouvellement`, repris tel quel) |
| `/usr/lib/systemd/system/brigade-station.service` | la station : un seul process, tous les projets de `/var/lib/brigade/projets` |
| `/usr/lib/systemd/system/brigade-station-renouvellement.{service,timer}` | le renouvellement, toutes les trente secondes |

Rien sous `/etc` : ni drop-in, ni règle sudoers, ni fichier de configuration. Les dépendances
(`git`, `gh`, `bubblewrap`, `libatomic1`, `adduser`, `systemd`…) viennent d'apt.

La commande du guide finit par la connexion Max du compte `brigade`, quand un terminal est là :
`runtime/src/connexion-max/connecter-cli.ts`, que le paquet porte avec le reste du runtime, pose
`claude` s'il manque, lance `claude auth login`, fait passer le renouvellement et attend que la
station l'ait reconnue (`/var/lib/brigade/connexion-max.json`).

À l'installation, `postinst` crée le compte système `brigade` (home `/home/brigade`, celui qui fera
la connexion Max) s'il n'existe pas, puis active et démarre la station et son minuteur. À chaque
mise à jour, il relance ce qui est activé — les cooks en cours finissent (`KillMode=process`) — et ne
réactive pas ce que l'administrateur a désactivé. Le retrait arrête la station sans toucher à
`/var/lib/brigade` ni au compte ; la purge retire en plus ses liens d'activation.

La station tourne sous `brigade`, avec `BRIGADE_STATION_DIR=/var/lib/brigade` et la cloison des
cooks posée pour tous les projets (`bwrap`, `/var/lib/brigade` et `/etc/brigade` masqués). La porte
réseau d'un projet n'est pas encore tenue par le paquet.

## Publier

La commande du guide prend la dernière release GitHub du dépôt : elle y télécharge
`installer-station.sh`, qui y télécharge à son tour `brigade-station_<arch>.deb`. Publier une
version, c'est joindre ces fichiers à une release — le `.deb` sous ce nom sans version, un par
architecture :

```sh
cp runtime/paquet/construit/brigade-station_<version>_amd64.deb /tmp/brigade-station_amd64.deb
gh release create station-<version> runtime/paquet/installer-station.sh /tmp/brigade-station_amd64.deb
```

Aucune release n'en porte encore : tant qu'il n'y en a pas, la commande du guide échoue au
téléchargement, et dit lequel.

## Éprouver sur une machine de test

Sur une machine Debian vierge (une VM jetable, jamais la box), avec le paquet et
`installer-station.sh` copiés dessus :

```sh
sudo sh installer-station.sh ./brigade-station_<version>_amd64.deb
```

C'est la commande du guide, le paquet donné au lieu d'être téléchargé. Elle se termine sur
`systemctl status brigade-station` actif et `station installée et active — <version>`. Pour la
défaire : `sudo apt purge brigade-station`, puis, si la machine resservira, `sudo rm -r
/var/lib/brigade` et `sudo deluser --remove-home brigade`.

Les tests (`runtime/test/paquet/`) construisent un paquet, l'ouvrent, y lancent la station telle que
son unité la lance, et jouent `postinst`, `prerm` et `installer-station.sh` sur des doublures des
commandes du système. Ils ne remplacent pas cet essai : aucun n'installe le paquet pour de vrai.
