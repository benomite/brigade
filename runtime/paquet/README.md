# Le paquet Debian de la station

Une station serveur s'installe par un seul paquet, `brigade-station`. Tout ce que la station
demande au système vient avec lui et suit ses mises à jour : après l'installation, aucun geste
root. Le parcours du chef est dans [`docs/installation-station.md`](../../docs/installation-station.md) ;
ici, ce que le paquet porte et comment il se construit.

L'ancien chemin — une installation par projet, `runtime/deploy/`, ses drop-ins et ses règles
sudoers — n'est pas touché par ce paquet, et n'en a pas besoin ; la bascule le retire d'une machine
qui le servait, portes comprises (« La porte réseau »).

## Construire

```sh
node runtime/paquet/construire.ts --repo <compte>/<dépôt> --maintainer "Nom <courriel>"
```

écrit `runtime/paquet/construit/brigade-station_<version>_<arch>.deb` et dit son chemin. Il faut
`dpkg-deb` (Debian ; `brew install dpkg` sur un Mac), ni root ni fakeroot.

| Option | Sans elle |
|---|---|
| `--version <v>` | `0.<AAAAMMJJ>.<HHMMSS>+g<commit>` : la date (UTC) et l'empreinte du commit construit — deux commits successifs se suivent pour dpkg |
| `--sortie <dossier>` | `runtime/paquet/construit/` (ignoré par git) |
| `--node <binaire>` | le `node` qui lance la commande, vérifié contre l'`engines` du runtime |
| `--arch <amd64\|arm64>` | l'architecture de la machine ; une autre exige son `--node` |
| `--repo <compte>/<dépôt>` | refusée : le dépôt GitHub qui publie le paquet (aussi `BRIGADE_PAQUET_DEPOT`) — sa page d'accueil et la source de sa mise à jour |
| `--maintainer "Nom <courriel>"` | refusée : le mainteneur dit dans le paquet (aussi `BRIGADE_PAQUET_MAINTENEUR`) |

Le paquet pèse une trentaine de mégaoctets : le binaire `node` en fait l'essentiel.

## Ce qu'il porte

| Chemin | Quoi |
|---|---|
| `/usr/lib/brigade-station/runtime/` | `src/` et `package.json` du runtime — ni tests ni dépendances de dev |
| `/usr/lib/brigade-station/node/bin/node` | le `node` de la station : celui de la machine n'y est pour rien |
| `/usr/lib/brigade-station/renouvellement` | le renouvellement de la session Max (`runtime/deploy/brigade-renouvellement`, repris tel quel) |
| `/usr/lib/systemd/system/brigade-station.service` | la station : un seul process, tous les projets de `/var/lib/brigade/projets` |
| `/usr/lib/systemd/system/brigade-station-porte.service` | ses portes : la sortie réseau de la station et de chaque projet, un process pour toutes |
| `/usr/lib/systemd/system/brigade-station-renouvellement.{service,timer}` | le renouvellement, toutes les trente secondes |
| `/usr/lib/systemd/system/brigade-station-mise-a-jour.{service,timer}` | la mise à jour de la station, toutes les dix minutes — la seule part de la station qui tourne sous root |

Rien sous `/etc` que l'installation ne pose : ni drop-in, ni règle sudoers, ni fichier de
configuration — hormis, après la connexion Max, le jeton et ses deux fichiers (voir plus bas). Les dépendances
(`git`, `gh`, `bubblewrap`, `libatomic1`, `adduser`, `systemd`…) viennent d'apt.

La commande du guide finit par la connexion Max du compte `brigade`, quand un terminal est là :
`runtime/src/connexion-max/connecter-cli.ts`, que le paquet porte avec le reste du runtime, pose
`claude` s'il manque, lance `claude setup-token` sous le compte, et range le jeton sans l'afficher :
`/etc/brigade/claude-token` (600, au compte `brigade`), la date de sa création dans
`/etc/brigade/claude-token.cree` (sans le jeton), et `/etc/brigade/jeton.env`, que l'unité lit pour
savoir où il est (`BRIGADE_CLAUDE_TOKEN_FILE`). Puis elle relance la station.

À l'installation, `postinst` crée le compte système `brigade` (home `/home/brigade`, celui qui fera
la connexion Max) s'il n'existe pas, puis active et démarre la station et son minuteur. À chaque
mise à jour, il relance ce qui est activé — les cooks en cours finissent (`KillMode=process`) — et ne
réactive pas ce que l'administrateur a désactivé. Le retrait arrête la station sans toucher à
`/var/lib/brigade` ni au compte ; la purge retire en plus ses liens d'activation.

La station tourne sous `brigade`, avec `BRIGADE_STATION_DIR=/var/lib/brigade` et la cloison des
cooks posée pour tous les projets (`bwrap`, `/var/lib/brigade` et `/etc/brigade` masqués), et sa
porte réseau (ci-dessous).

Le `package.json` du runtime livré porte la version du paquet : c'est celle que la station dit
d'elle-même en démarrant (`/var/lib/brigade/en-service`).

## La porte réseau

L'unité de la station ne joint que la boucle locale (`IPAddressDeny=any`, `IPAddressAllow=localhost`).
Sa seule sortie est `brigade-station-porte.service` (`runtime/src/station/tenir-portes.ts`), une
unité à côté, sans filtre, qui ne lance rien : elle tient la porte de la station — Anthropic et
GitHub seulement — et une porte par projet de `/var/lib/brigade/projets`, ouverte quand le projet
y entre, fermée quand il en sort. La porte d'un projet ne laisse passer que sa liste blanche :
Anthropic, GitHub et ce que son dépôt déclare dans `.claude/brigade/reseau`, lu au journal du
projet (`network.declared`), où vont aussi ses refus (`network.refused`). Ce qu'un projet ouvre
ne l'est pas pour un autre.

Personne ne choisit les ports : chaque porte reprend celui qu'elle avait, ou en prend un libre, et
les écrit dans `/var/lib/brigade/portes.json` (`BRIGADE_STATION_PORTES`, dans les deux unités). La
station y lit le sien — elle attend qu'il y soit avant de rien joindre — et celui de chaque projet,
qu'elle lui donne ; un projet sans port attend sa porte, un port qui change rouvre son projet, et
une ligne qui nomme sa propre porte (`BRIGADE_PROXY_PORT`) est refusée.

La station réclame ses portes (`Wants=`, `After=`) : elles ne sont pas activées pour elles-mêmes, et
une station installée par un paquet qui ne les connaissait pas les démarre à sa première relance.
À chaque mise à jour, `postinst` les relance avant la station, si elles tournent : chacune reprend
son port, et les tunnels ouverts sont coupés le temps de la relance.

La bascule d'une machine servie à l'ancienne arrête et retire les `brigade-porte@<projet>`, et
écrit leurs ports dans `portes.json` avant que la station ne démarre : chaque porte de la station
reprend le port de l'ancienne, et la même liste, lue au même journal. Un cook en vol à la bascule
la retrouve où il la connaît, après la coupure de la bascule.

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
`installer-station.sh` (`runtime/deploy/`, la seule entrée de l'installation d'une station, sous
Linux comme sous macOS), qui y télécharge à son tour `brigade-station_<arch>.deb` sous Linux, ou
`brigade-station-mac.tar.gz` sous macOS — le répertoire `runtime/` que le paquet porte, tel quel.
Sous Windows, sa jumelle `installer-station.ps1` (`runtime/deploy/windows/`) y télécharge le même
répertoire, zippé : `brigade-station-windows.zip`. Publier une version, c'est joindre ces fichiers
à une release — le `.deb` sous ce nom sans version, un par architecture :

```sh
cp runtime/paquet/construit/brigade-station_<version>_amd64.deb /tmp/brigade-station_amd64.deb
dpkg-deb -x /tmp/brigade-station_amd64.deb /tmp/deb && tar -C /tmp/deb/usr/lib/brigade-station -czf /tmp/brigade-station-mac.tar.gz runtime
(cd /tmp/deb/usr/lib/brigade-station && zip -qr /tmp/brigade-station-windows.zip runtime)
gh release create station-<version> runtime/deploy/installer-station.sh runtime/deploy/windows/installer-station.ps1 /tmp/brigade-station_amd64.deb /tmp/brigade-station-mac.tar.gz /tmp/brigade-station-windows.zip
```

Ce geste n'est pas à faire à la main : `.github/workflows/publier-station.yml` le fait à chaque
merge sur `main` qui touche `runtime/src/`, `runtime/deploy/`, `runtime/package.json` ou `runtime/paquet/`. Il construit le
paquet sans `--version` (donc `0.<AAAAMMJJ>.<HHMMSS>+g<commit>`), et publie la release
`station-<version>` — ni brouillon ni pré-version, marquée la dernière du dépôt, pour que
`releases/latest/download/installer-station.sh` la trouve. Un merge qui ne touche que l'app, la doc ou
le plugin V1 ne publie rien. Le workflow se lance aussi à la main (`workflow_dispatch`) ; une version
déjà publiée n'est pas republiée.

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
`systemctl status brigade-station` actif et `station installée et active — <version>`. La porte
se voit ensuite, un projet servi : `cat /var/lib/brigade/portes.json` donne le port de la sienne, et
`curl -sI -x http://127.0.0.1:<port> https://example.org` y reçoit un `403` qui nomme l'hôte et la
ligne qui l'ouvrirait ; `journalctl -u brigade-station-porte` dit le refus, et le journal du projet
le porte (`network.refused`). Que l'unité de la station ne sorte pas sans elle se lit à son
démarrage, pour chaque projet : `réseau — liste blanche, par la porte 127.0.0.1:<port> — un envoi
direct est refusé par le noyau : l'unité filtre` (`journalctl -u brigade-station`) ; un `MAIS` y dit
un filtre qui ne tient pas. Pour la
défaire : `sudo apt purge brigade-station`, puis, si la machine resservira, `sudo rm -r
/var/lib/brigade` et `sudo deluser --remove-home brigade`.

Les tests (`runtime/test/paquet/`) construisent un paquet, l'ouvrent, y lancent la station et ses portes telles que
son unité la lance, et jouent `postinst` et `prerm` sur des doublures des commandes du système ;
`runtime/test/deploy/installer-station.test.ts` joue de même `installer-station.sh`, sous Linux et
sous macOS. Ils ne remplacent pas cet essai : aucun n'installe le paquet pour de vrai.

### La mise à jour, sur une machine de test

`runtime/test/mise-a-jour/machine.test.ts` l'éprouve sans root, sur une installation de test posée
dans un répertoire : de vrais paquets construits depuis le dépôt, leur vrai `postinst` et leurs
unités joués par des doublures d'`apt-get` et de `systemctl` qui lancent pour de vrai la station
installée. Trois versions publiées passent l'une après l'autre (dont une qui change l'unité de la
station), une version qui ne démarre pas revient à la précédente, et le gel retient une version.

Sur la VM de l'essai précédent, la station installée, sans rien publier sur GitHub :

```sh
# Les versions de l'essai, lues dans un répertoire au lieu des releases.
# (Le paquet pose lui-même BRIGADE_MISE_A_JOUR_SOURCE=github:<dépôt de --repo> dans l'unité ;
# ce drop-in la remplace pour l'essai.)
sudo mkdir -p /etc/systemd/system/brigade-station-mise-a-jour.service.d /srv/versions
printf '[Service]\nEnvironment=BRIGADE_MISE_A_JOUR_SOURCE=/srv/versions\n' | sudo tee /etc/systemd/system/brigade-station-mise-a-jour.service.d/essai.conf
sudo systemctl daemon-reload
# La version installée, puis chaque version à éprouver, posées comme une release :
sudo mkdir /srv/versions/<version> && sudo cp brigade-station_<version>_amd64.deb /srv/versions/<version>/brigade-station_amd64.deb
# Sans attendre le minuteur :
sudo systemctl start brigade-station-mise-a-jour.service
cat /var/lib/brigade-station/etat.json
```

Trois versions construites l'une après l'autre (`node runtime/paquet/construire.ts --repo <compte>/<dépôt> --maintainer "Nom <courriel>"` sur trois
commits, ou `--version 1.0.0`, `1.1.0`…, dont une qui change `systemd/brigade-station.service`)
doivent passer seules ; une version dont `src/station/main.ts` sort en erreur doit revenir à la
précédente. Le minuteur seul suffit : `start` ne fait que ne pas l'attendre. L'essai fini, retirer
le drop-in avec le reste.
