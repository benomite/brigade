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

Ton abonnement Claude Max et ton compte GitHub serviront aux étapes suivantes, pas à celle-ci.

## 1. La commande

Sur le serveur, colle :

```sh
curl -fsSL https://github.com/benomite/brigade/releases/latest/download/installer-station.sh | sudo sh
```

C'est tout. Sans `sudo` sur le serveur, la même dans une session root, sans `sudo` à la fin. Sans
`curl`, la même avec `wget -qO-` à la place de `curl -fsSL`.

La commande télécharge le paquet `brigade-station` de la dernière version publiée, le remet à
`apt` — qui pose ce dont il dépend (`git`, `gh`, `bubblewrap`…) — puis attend que la station
démarre. Compte une à deux minutes.

## 2. Ce que tu dois voir

La commande finit sur l'état du service, puis sur trois lignes :

```
● brigade-station.service - brigade — la station de cette machine (tous ses projets)
     Loaded: loaded (…/brigade-station.service; enabled; …)
     Active: active (running) since …
…
… brigade : station démarrée — pid …, configuration /var/lib/brigade/projets ; aucun projet servi

brigade : station installée et active — <version>
brigade : tout ce qu'elle demande au système vient avec son paquet : sa vie courante ne demande aucune commande root
brigade : la suite : la connexion Max du compte brigade, puis l'appairage avec l'app (le guide : docs/installation-station.md, dépôt benomite/brigade)
```

**`active (running)` et `aucun projet servi` : la station est installée.** Elle tourne, elle
redémarrera avec la machine, et elle attend ses projets.

Si la commande s'arrête sur `brigade : installation refusée — …`, la ligne dit pourquoi : la
machine n'est pas un Debian, son architecture n'a pas de paquet, le téléchargement a échoué, ou
`apt` a refusé (sa sortie est juste au-dessus). Rien n'est à moitié installé que `apt` ne sache
reprendre : corrige ce qu'elle dit, et relance la même commande.

## 3. Ce que l'installation a posé

- **Le service `brigade-station`** : un seul pour toute la machine, quel que soit le nombre de
  projets. Ajouter ou retirer un projet ne touchera à aucun fichier du système.
- **Le compte `brigade`**, sous lequel tournent la station et ses cooks. C'est lui qui fera la
  connexion Max.
- **Le renouvellement de la session Max**, chaque minute. Tant que la connexion Max n'est pas
  faite, chacun de ses passages échoue, et c'est normal : c'est ainsi que la station sait qu'elle
  attend un login.
- **`/var/lib/brigade`**, où la station gardera la configuration, le journal et le clone de
  chacun de ses projets.

Et rien d'autre : aucune règle `sudo`, aucun fichier dans `/etc`. Tout vient du paquet, et le
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

## 5. La suite — pas encore dans ce guide

Trois étapes amènent ensuite la station jusqu'à toi, et une quatrième la tient à jour. Elles ne
sont pas encore écrites ici : ce guide les gagnera à mesure qu'elles arrivent.

1. **La connexion Max** — une fois, sur le serveur, pendant l'installation guidée ; la station la
   renouvellera ensuite seule.
2. **L'appairage avec l'app** — le serveur affiche un code, tu le tapes dans l'app, et la station
   apparaît sur sa home : « en ligne · version X · aucun projet ».
3. **Ajouter un projet** — depuis l'app : le dépôt GitHub, ses stations, sa principale. Sans
   terminal.
4. **La mise à jour automatique** — quand une version sort, la station y passe seule, comme un
   navigateur ; les cooks en cours finissent. Tu pourras geler sa version depuis l'app.
