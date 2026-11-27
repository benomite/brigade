# Le paquet Debian de la station — un pont à sens unique

Depuis #4741, le `.deb` n'est plus la station : la station est l'archive (`runtime/archive/install.sh`,
[`docs/station.md`](../../docs/station.md)). Le `brigade-station_amd64.deb` que la release publie encore
n'est que le pont des machines qui ne savent poser qu'un `.deb` (l'ancienne mise à jour) : il porte
l'archive linux-x64 sous `/usr/share/brigade-station/`, et son `postinst` — seul script, ni `prerm` ni
`postrm` — la défait et joue `install.sh --migrate` : `/opt/brigade-station/<version>` et `current`,
`/var/lib/brigade` et `/etc/brigade` gardés tels quels (aucun jeton demandé), les unités et l'arbre
`/usr/lib` de l'ancien paquet retirés, les unités de l'archive posées, activées et démarrées. Puis
`dpkg --purge brigade-station` est lancé détaché, quand dpkg a rendu son verrou : sans toucher à `/opt`.
Rejoué, il ne change rien, et il laisse `current` où une station déjà mise à jour l'a mis. Le sens est
unique : la station se met ensuite à jour seule, par l'archive. Les notes de la release le disent.

## Construire

```sh
node runtime/paquet/construire.ts --repo <compte>/<dépôt> --maintainer "Nom <courriel>"
```

écrit `runtime/paquet/construit/brigade-station_<version>_<arch>.deb` (le pont) et, à côté, une archive par plateforme. Il faut
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

Le pont : `/usr/share/brigade-station/brigade-station-linux-x64.tar.gz`, la licence, et son `postinst`.
Rien sous `/usr/lib`, rien sous `/etc`, aucune règle sudoers. Le runtime, son `node`, `bin/brigade`,
`version`, `install.sh` et les unités (sous `/opt/brigade-station/current`) sont dans l'archive. Les
dépendances (`git`, `gh`, `bubblewrap`, `libatomic1`, `adduser`, `systemd`…) viennent d'apt.
Sans systemd en marche (un chroot), le `postinst` ne migre rien et le dit.
