# Le paquet Debian de la station

Une station serveur s'installe par un seul paquet, `brigade-station`. Tout ce que la station
demande au système vient avec lui et suit ses mises à jour : après l'installation, aucun geste
root. Le parcours du chef est dans [`docs/installation-station.md`](../../docs/installation-station.md) ;
ici, ce que le paquet porte et comment il se construit.

La station, c'est la cuisine (`runtime/src/kitchen/main.ts`, [`docs/runtime/README.md`](../../docs/runtime/README.md)) :
elle sert les projets de `/var/lib/brigade/kitchen/projects`, une ligne chacun. Une machine qui
faisait tourner la cuisine par une unité posée à la main (`/etc/systemd/system/brigade-kitchen.service`)
la voit arrêtée et retirée par `postinst` : deux cuisines ne servent jamais les mêmes projets.

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
| `--repo <compte>/<dépôt>` | refusée : le dépôt GitHub qui publie le paquet (aussi `BRIGADE_PAQUET_DEPOT`) — sa page d'accueil |
| `--maintainer "Nom <courriel>"` | refusée : le mainteneur dit dans le paquet (aussi `BRIGADE_PAQUET_MAINTENEUR`) |

Le paquet pèse une trentaine de mégaoctets : le binaire `node` en fait l'essentiel.

## Ce qu'il porte

| Chemin | Quoi |
|---|---|
| `/usr/lib/brigade-station/runtime/` | `src/`, `agents/kitchen/second-judge.md` (la consigne du second juge, celle de ce commit — les archives macOS et Windows la portent aussi) et `package.json` du runtime — ni tests ni dépendances de dev |
| `/usr/lib/brigade-station/node/bin/node` | le `node` de la station : celui de la machine n'y est pour rien |
| `/usr/lib/systemd/system/brigade-station.service` | la station : la cuisine, un seul process, tous les projets de `/var/lib/brigade/kitchen/projects` |

Rien sous `/etc` que l'installation ne pose : ni drop-in, ni règle sudoers, ni fichier de
configuration. Les dépendances
(`git`, `gh`, `bubblewrap`, `libatomic1`, `adduser`, `systemd`…) viennent d'apt.

À l'installation, `postinst` crée le compte système `brigade` (home `/home/brigade`, celui qui fera
la connexion Max) s'il n'existe pas, arrête et retire l'unité `brigade-kitchen.service` posée à la
main s'il y en a une, puis active et démarre la station. À chaque
mise à jour, il relance ce qui est activé — les agents en cours finissent (`KillMode=process`) — et ne
réactive pas ce que l'administrateur a désactivé. Le retrait arrête la station sans toucher à
`/var/lib/brigade` ni au compte ; la purge retire en plus ses liens d'activation.

La station tourne sous `brigade`, avec `BRIGADE_STATION_DIR=/var/lib/brigade` et la cloison des
agents posée pour tous les projets (`bwrap`, `/var/lib/brigade` et `/etc/brigade` masqués), et sa
porte réseau (ci-dessous).

Le `package.json` du runtime livré porte la version du paquet : c'est celle que la station dit
d'elle-même en démarrant (`/var/lib/brigade/en-service`).

## Le réseau

L'unité de la station ne joint que la boucle locale (`IPAddressDeny=any`, `IPAddressAllow=localhost`).
Le port de sa porte et celui de chaque projet sont lus dans `/var/lib/brigade/portes.json`
(`BRIGADE_STATION_PORTES`) ; aucun agent d'un projet sans port ne part. Le paquet ne livre plus
l'unité qui tenait ces portes : l'ouvrir est un autre ticket.
