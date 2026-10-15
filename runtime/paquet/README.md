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
| `/usr/lib/systemd/system/brigade-station-mise-a-jour.{service,timer}` | la mise à jour de la station, toutes les dix minutes — la seule part de la station qui tourne sous root |

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

Le `package.json` du runtime livré porte la version du paquet : c'est celle que la station dit
d'elle-même en démarrant (`/var/lib/brigade/en-service`).

## La mise à jour

`brigade-station-mise-a-jour.timer` n'est pas activé pour lui-même : la station le réclame
(`Wants=`), il s'arrête avec elle (`PartOf=`). Une station installée par un paquet qui ne le
connaissait pas le prend donc à sa première relance, sans que `postinst` ait à l'activer.

Chaque passage (`runtime/src/mise-a-jour/`) lit les releases `station-<version>` du dépôt, prend la
plus récente — dans l'ordre de dpkg — et, si elle est plus récente que la version installée, la
remet à `apt-get install --allow-downgrades`. C'est le `postinst` du paquet qui recharge systemd —
une unité changée est prise — et relance la station, son seul process (`KillMode=process`) : les
cooks en cours finissent, la station suivante les reprend.

La version est gardée quand la station relancée s'est dite en service sur elle (sa version, sous le
`MainPID` de systemd) et sert au moins les projets que la version d'avant servait, dans les deux
minutes. Sinon — `apt` refuse, la station tombe, se tait ou perd un projet —, le paquet de la
version d'avant est réinstallé : la mise à jour le garde de côté (`/var/lib/brigade-station/paquets/`),
ou le retélécharge de sa release. Sans ni l'un ni l'autre, elle n'installe rien. Une version ratée
n'est pas réessayée ; la suivante l'est.

`gel=oui` dans `/var/lib/brigade/reglages` gèle la version. L'état exposé est
`/var/lib/brigade-station/etat.json` ; ce que chaque mise à jour a donné, une ligne JSON chacune, est
dans `/var/lib/brigade-station/issues` — la station le recopie au journal de chaque projet
(`update.installed`, `update.reverted`), et la file le dit : « passée en version X à 14 h 02 ».

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

Publier une release `station-<version>`, c'est aussi la livrer à toutes les stations installées :
chacune y passe seule dans les dix minutes, sauf celles dont la version est gelée. Une release ne se
retire pas d'office quand une version plus récente sort : c'est d'elle qu'une station retélécharge
le paquet d'avant si elle n'en a pas gardé un. Un brouillon ou une pré-version n'est installé par
aucune station.

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

### La mise à jour, sur une machine de test

`runtime/test/mise-a-jour/machine.test.ts` l'éprouve sans root, sur une installation de test posée
dans un répertoire : de vrais paquets construits depuis le dépôt, leur vrai `postinst` et leurs
unités joués par des doublures d'`apt-get` et de `systemctl` qui lancent pour de vrai la station
installée. Trois versions publiées passent l'une après l'autre (dont une qui change l'unité de la
station), une version qui ne démarre pas revient à la précédente, et le gel retient une version.

Sur la VM de l'essai précédent, la station installée, sans rien publier sur GitHub :

```sh
# Les versions de l'essai, lues dans un répertoire au lieu des releases.
sudo mkdir -p /etc/systemd/system/brigade-station-mise-a-jour.service.d /srv/versions
printf '[Service]\nEnvironment=BRIGADE_MISE_A_JOUR_SOURCE=/srv/versions\n' | sudo tee /etc/systemd/system/brigade-station-mise-a-jour.service.d/essai.conf
sudo systemctl daemon-reload
# La version installée, puis chaque version à éprouver, posées comme une release :
sudo mkdir /srv/versions/<version> && sudo cp brigade-station_<version>_amd64.deb /srv/versions/<version>/brigade-station_amd64.deb
# Sans attendre le minuteur :
sudo systemctl start brigade-station-mise-a-jour.service
cat /var/lib/brigade-station/etat.json
```

Trois versions construites l'une après l'autre (`node runtime/paquet/construire.ts` sur trois
commits, ou `--version 1.0.0`, `1.1.0`…, dont une qui change `systemd/brigade-station.service`)
doivent passer seules ; une version dont `src/station/main.ts` sort en erreur doit revenir à la
précédente. Le minuteur seul suffit : `start` ne fait que ne pas l'attendre. L'essai fini, retirer
le drop-in avec le reste.
