# Le runtime de la V2

Le runtime est le process qui tient le **journal** d'un projet : une suite d'événements en ajout
seul, dont tout le reste dérive. Il vit dans `runtime/`, s'exécute avec Node 26 sans build, et ne
dépend d'aucun paquet à l'exécution.

Ce document dit comment le lancer, le déployer et le recetter. Les décisions de stack sont dans
[`superpowers/specs/2026-10-08-runtime-stack.md`](superpowers/specs/2026-10-08-runtime-stack.md),
le découpage en modules dans
[`superpowers/specs/2026-10-08-runtime-journal.md`](superpowers/specs/2026-10-08-runtime-journal.md).

## Ce qu'il fait aujourd'hui

| Geste | Ce qui se passe |
|---|---|
| Démarrer | Prend le verrou du projet, recalcule ses projections depuis le journal, y écrit `runtime.started` |
| Tourner | Surveille le journal chaque seconde (ce qu'un autre process y écrit) et se réveille au tick, toutes les 60 s. Personne n'écoute encore ces réveils : le rail (#14) et les garde-fous (#16) s'y brancheront |
| S'arrêter (`SIGTERM`, `SIGINT`) | Écrit `runtime.stopped`, rend le verrou, sort avec le code 0 |
| Mourir sans préavis (crash, `kill -9`, coupure) | Rien n'est perdu : le noyau libère le verrou, et le démarrage suivant écrit `runtime.interrupted` avant de repartir |
| Être lancé une seconde fois sur le même projet | Refuse, code de sortie 2, en nommant le runtime qui tourne (pid, machine, heure de démarrage) |

Il ne lance aucun sous-processus et n'ouvre aucune connexion réseau : **il ne consomme aucun
quota**.

## Le journal

Un fichier par projet, `log.db`, dans le répertoire d'état. Chaque événement porte :

| Champ | Sens |
|---|---|
| `seq` | numéro de séquence — l'ordre de vérité |
| `at` | horodatage UTC, posé à l'écriture |
| `project` | le projet |
| `ticket` | le numéro du ticket, ou rien pour un fait qui ne concerne aucun ticket |
| `type` | le type d'événement (`runtime.started`…) |
| `author` | qui l'a écrit : `runtime`, `chef`, `station:<nom>`… |
| `payload` | le détail, en JSON |

La base refuse toute modification et toute suppression d'un événement. L'état dérivé (les
*projections*) est recalculé depuis le journal à chaque démarrage : on peut le perdre sans rien
perdre.

### Relire le journal

```bash
npm --prefix runtime run journal -- 13     # tout ce qui est arrivé au ticket 13, dans l'ordre
npm --prefix runtime run journal           # tout le journal
```

Une ligne par événement : séquence, horodatage, projet, ticket, type, auteur, détail. La commande
lit `$BRIGADE_STATE_DIR`, n'écrit jamais, et répond pendant que le runtime tourne.

```
4  2026-10-08T10:00:03.000Z  brigade  #7  ticket.taken  station:box/claude-sonnet  {"branche":"fix/7"}
```

## Deux variables, aucun défaut

| Variable | Rôle |
|---|---|
| `BRIGADE_STATE_DIR` | Le répertoire qui contient tout l'état du projet : `log.db`, `lock.db`, plus tard `runs/`. Doit être sur un **disque local** — le verrou en dépend |
| `BRIGADE_PROJECT` | Le nom du projet : un identifiant court choisi par le chef, en minuscules, chiffres et tirets (`brigade`, `thermigo`). Il s'écrit dans chaque événement et dans le nom de l'unité systemd |

L'une ou l'autre absente, le runtime refuse de démarrer et dit laquelle.

## Sur le poste de dev

```bash
eval "$(.claude/brigade/worktree-setup.sh <n> "$PWD")"   # pose BRIGADE_STATE_DIR
BRIGADE_PROJECT=brigade npm --prefix runtime start        # Ctrl-C pour l'arrêter
```

| Besoin | Commande |
|---|---|
| Tests | `npm --prefix runtime test` — sur un clone nu, sans rien installer |
| Contrôle de types | `npm --prefix runtime run typecheck` — après le setup de worktree |

Les tests n'utilisent jamais `BRIGADE_STATE_DIR` : chacun crée son répertoire temporaire, et les
process qu'ils lancent ne reçoivent que l'environnement qu'ils leur donnent.

## Sur la parade-box

Le fichier d'unité est versionné : `runtime/deploy/brigade@.service`, une instance par projet.

### À vérifier avant d'installer

Ces quatre points n'ont pas pu être contrôlés depuis une session de dev.

1. La box tourne sous Linux avec systemd : `systemctl --version`.
2. Node 26 y est installé : `node --version`.
3. `claude` est le binaire officiel, connecté, sous le compte qui fera tourner le service.
4. `/var/lib` est sur un disque local : `df -T /var/lib` ne montre ni `nfs` ni `cifs`.

### Installer

```bash
sudo git clone --branch v2 https://github.com/benomite/brigade.git /opt/brigade
sudo cp /opt/brigade/runtime/deploy/brigade@.service /etc/systemd/system/
sudo systemctl daemon-reload
```

L'unité suppose un compte `brigade`, le clone dans `/opt/brigade` et `node` dans le `PATH` de
systemd. Ce qui diffère sur la box se règle dans un drop-in, jamais dans le fichier copié :

```bash
sudo systemctl edit brigade@.service
```

```ini
[Service]
User=<le compte qui a fait la connexion Max>
# Si node n'est pas dans /usr/bin ou /usr/local/bin :
ExecStart=
ExecStart=/chemin/absolu/vers/node src/main.ts
```

### Piloter

| Geste | Commande |
|---|---|
| Lancer | `sudo systemctl start brigade@<projet>` |
| Arrêter | `sudo systemctl stop brigade@<projet>` |
| Voir s'il tourne | `systemctl status brigade@<projet>` |
| Lire ce que le process imprime | `journalctl -u brigade@<projet> -f` |
| Le relancer à chaque reboot | `sudo systemctl enable brigade@<projet>` |
| Relire le journal | `sudo -u <compte> BRIGADE_STATE_DIR=/var/lib/brigade/<projet> npm --prefix /opt/brigade/runtime run journal` |
| Mettre à jour | `sudo git -C /opt/brigade pull`, puis `sudo systemctl restart brigade@<projet>` |

Un crash relance le runtime au bout de 5 s. Un refus de démarrer (code 2) ne se réessaie pas :
`systemctl status` montre le motif.

Deux journaux, deux usages : **journald** garde ce que le process imprime ; **le journal** garde ce
qui s'est passé dans la cuisine. On ne reconstruit rien depuis journald.

### Recette du chef

À dérouler sur la box, projet `brigade`. `J` désigne la commande « Relire le journal » ci-dessus.

1. `sudo systemctl start brigade@brigade`, puis `systemctl status brigade@brigade` : le service est
   `active (running)`. `J` montre un `runtime.started`.
2. `sudo systemctl stop brigade@brigade` puis `start` : `J` montre `runtime.started`,
   `runtime.stopped`, `runtime.started` — les événements d'avant l'arrêt sont toujours là.
3. `sudo systemctl kill -s KILL brigade@brigade` : le service repart seul au bout de 5 s. `J` montre
   un `runtime.interrupted` suivi d'un nouveau `runtime.started`.
4. Pendant que le service tourne, lancer un second runtime à la main :
   `sudo -u <compte> BRIGADE_STATE_DIR=/var/lib/brigade/brigade BRIGADE_PROJECT=brigade npm --prefix /opt/brigade/runtime start`.
   Il refuse et nomme le pid du service ; `J` ne montre aucun événement de plus.
