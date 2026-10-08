# Le runtime de la V2

Le runtime est le process qui tient le **journal** d'un projet : une suite d'événements en ajout
seul, dont tout le reste dérive — à commencer par le **rail**, la file des tickets à servir. Il vit dans `runtime/`, s'exécute avec Node 26 sans build, et ne
dépend d'aucun paquet à l'exécution.

Ce document dit comment le lancer, le déployer et le recetter. Les décisions de stack sont dans
[`superpowers/specs/2026-10-08-runtime-stack.md`](superpowers/specs/2026-10-08-runtime-stack.md),
le découpage en modules dans
[`superpowers/specs/2026-10-08-runtime-journal.md`](superpowers/specs/2026-10-08-runtime-journal.md),
le rail dans [`superpowers/specs/2026-10-08-runtime-rail.md`](superpowers/specs/2026-10-08-runtime-rail.md),
les garde-fous dans
[`superpowers/specs/2026-10-08-garde-fous.md`](superpowers/specs/2026-10-08-garde-fous.md).

## Ce qu'il fait aujourd'hui

| Geste | Ce qui se passe |
|---|---|
| Démarrer | Prend le verrou du projet, recalcule ses projections depuis le journal — le rail compris —, y écrit `runtime.started`, puis les plafonds en vigueur (`guard.configured`) s'ils ont changé, et sonde GitHub |
| Tourner | Surveille le journal chaque seconde (ce qu'un autre process y écrit) et se réveille au tick, toutes les 60 s. À chaque réveil les garde-fous guettent le « stop » du chef ; à chaque tick le runtime écrit son battement (`runtime.ticked`), sonde GitHub, rend les tickets dont le bail est échu, et relève ce que chaque cook en cours a consommé (`cook.progressed`) |
| S'arrêter (`SIGTERM`, `SIGINT`) | Tue les cooks en cours, écrit `runtime.stopped`, rend le verrou, sort avec le code 0 |
| Mourir sans préavis (crash, `kill -9`, coupure) | Rien n'est perdu : le noyau libère le verrou, et le démarrage suivant écrit `runtime.interrupted` avant de repartir |
| Être lancé une seconde fois sur le même projet | Refuse, code de sortie 2, en nommant le runtime qui tourne (pid, machine, heure de démarrage) |

Il sait surveiller un cook, mais n'en lance encore aucun — la station arrive avec #15. Son seul
sous-processus est `gh`, pour lire les issues du dépôt : **il ne consomme aucun quota Max**. Il
n'écoute sur aucun port.

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
npm --prefix runtime run journal           # tout le journal, sans les battements du runtime
npm --prefix runtime run journal -- --ticks   # tout le journal, battements compris
```

Une ligne par événement : séquence, horodatage, projet, ticket, type, auteur, détail. La commande
lit `$BRIGADE_STATE_DIR`, n'écrit jamais, et répond pendant que le runtime tourne.

Le runtime écrit un battement par minute (`runtime.ticked`) : sans argument, la commande les
masque — `status` en donne l'âge, et c'est tout ce qu'ils ont à dire.

```
4  2026-10-08T10:00:03.000Z  brigade  #7  ticket.taken  station:box/claude-sonnet  {"station":"box/claude-sonnet","leaseUntil":"2026-10-08T10:10:03.000Z"}
```

## Le rail

Le rail porte les tickets du projet : **les issues ouvertes du dépôt qui portent le label `fire`**.
Poser le label fait entrer l'issue sur le rail au sondage suivant (une minute au plus) ; la fermer
ou lui retirer le label l'en fait sortir, **quel que soit son état** — retirer `fire` est le geste
pour reprendre un ticket. Les PR ne sont jamais des tickets.

| État | Sens |
|---|---|
| **en attente** | sur le rail, à prendre |
| **pris** | prêté à une station, sous bail — le rail dit laquelle et depuis quand |
| **en pass** | le cook a fini ; le ticket passe les gates, la CI, la revue |
| **servi** | passé. Il reste affiché tant que son issue est ouverte |
| **86** | pas servable pour l'instant (quota épuisé, station absente) |

**Ordre de service** : `prio:1`, puis `prio:2`, `prio:3`, puis les issues sans `prio:` ; à priorité
égale, l'issue la plus ancienne d'abord.

**Un ticket ne se prête qu'une fois.** Une station qui prend un ticket reçoit un **bail** de
10 minutes, qu'elle renouvelle tant qu'elle vit. Tant que le bail court, aucune autre station ne
peut prendre ce ticket. Si la station meurt, le bail échoit : le ticket revient en attente, et le
journal en garde la trace (`ticket.released`, motif `lease-expired`, avec le nom de la station).

**Un 86 revient seul** quand son heure de retour est connue (un quota épuisé annonce la sienne) :
passé cette heure, le ticket est remis en attente. Sans heure de retour, il reste 86 jusqu'à ce
qu'on le rende.

**GitHub injoignable** (réseau, connexion `gh` expirée) : le rail reste tel quel, le runtime
l'imprime (`sondage GitHub en échec`, à lire dans journald) et réessaie au tick suivant. Le rail se
recalcule depuis le journal à chaque démarrage : il se retrouve à l'identique, même sans GitHub.

Au jalon 1, rien ne prend encore de ticket : les cooks arrivent avec #15, la pass avec #17. Le rail
montre donc des tickets en attente.

### Lire le rail

```bash
npm --prefix runtime run rail
```

Une ligne par ticket, dans l'ordre de service : numéro, état, priorité, détail de l'état, titre. La
commande lit `$BRIGADE_STATE_DIR`, n'écrit jamais, et répond pendant que le runtime tourne.

```
#14  pris  prio:1  par box/claude-opus depuis 2026-10-08T10:00:05.000Z, bail jusqu'à 2026-10-08T10:10:05.000Z  Le rail porte les tickets
#18  en attente  -  depuis 2026-10-08T10:00:04.000Z  La CLI d'état
```

Les faits du rail au journal : `ticket.arrived`, `ticket.changed`, `ticket.left` (écrits au nom de
`github`), `ticket.taken`, `ticket.renewed`, `ticket.released`, `ticket.passing`, `ticket.served`,
`ticket.86`.

## Les garde-fous

Aucun cook ne se lance sans eux. Ce sont des mécanismes, pas des jugements : ils existent avant
la première exécution sans personne devant.

| Garde-fou | Ce qui se passe |
|---|---|
| Plafond de tours, de durée, de tokens | Le cook qui en dépasse un est arrêté. Les tokens comptent l'entrée, la sortie et l'écriture de cache — pas les lectures de cache |
| Inactivité | Le cook qui n'a rien produit depuis le délai d'inactivité est arrêté |
| Disjoncteur | Après N échecs d'affilée, plus aucun cook n'est lancé. Un échec : un arrêt par plafond ou inactivité, ou un cook qui sort en erreur. Ne comptent pas : le « stop » du chef, le quota épuisé (86), un redémarrage du runtime. Une réussite remet le compteur à zéro |
| « stop » | Tous les cooks en cours sont arrêtés dans la seconde, et plus aucun n'est lancé |

Arrêter un cook, c'est toujours le même geste : `SIGTERM` à son groupe de process, puis `SIGKILL`
dix secondes plus tard à ce qui reste — y compris ce que le cook avait lancé lui-même.

**Le disjoncteur ouvert et le « stop » tiennent**, redémarrage du runtime compris, jusqu'à ce que
le chef dise « reprendre ».

### Voir et commander

```bash
npm --prefix runtime run garde-fous                # l'état
npm --prefix runtime run garde-fous -- stop        # arrête tout
npm --prefix runtime run garde-fous -- reprendre   # rouvre la cuisine, referme le disjoncteur
```

La commande lit `$BRIGADE_STATE_DIR` et répond pendant que le runtime tourne. « stop » et
« reprendre » s'écrivent dans le journal au nom du `chef` ; le runtime les voit en une seconde au
plus.

```
plafonds par ticket   100 tours · 60 min · 2 000 000 tokens · inactivité 10 min
cuisine               ouverte
disjoncteur           fermé — 1 échec d'affilée, ouverture à 3
cooks en cours        1
  #12  12-3f9a01bc  lancé le 2026-10-08T10:04:11.000Z
derniers arrêts par garde-fou
  2026-10-08T10:02:40.000Z  #7  7-a41c88e2  plafond de tours dépassé : 101 pour 100
```

### Pourquoi ce ticket s'est-il arrêté ?

Chaque arrêt est au journal du ticket : `npm --prefix runtime run journal -- <ticket>`.

| Événement | Sens |
|---|---|
| `cook.launched` | Un cook part sur le ticket, avec ses plafonds et le chemin de son flux brut (`runs/<run>.jsonl` dans le répertoire d'état ; sa sortie d'erreur dans `runs/<run>.jsonl.stderr`) |
| `cook.progressed` | Le relevé du cook, à chaque tick tant qu'il tourne : `turns` et `tokens` consommés jusque-là |
| `guard.tripped` | Un garde-fou l'arrête. `reason` : `turns`, `duration`, `tokens`, `idle` ou `stop` ; `limit` et `observed` donnent le plafond et la mesure |
| `cook.exited` | Le process est mort. `outcome` : `ok`, `failed`, `guard`, `stop` ou `neutral` ; avec le code de sortie, les tours et les tokens consommés |
| `cook.interrupted` | Le runtime s'est arrêté pendant que le cook tournait : il est mort avec lui |
| `breaker.opened` | Le disjoncteur s'ouvre (hors ticket) |
| `kitchen.stopped`, `kitchen.resumed` | Le chef a dit « stop », « reprendre » (hors ticket) |

### Régler les plafonds

Les mêmes pour tous les tickets du projet, par l'environnement du runtime. Absente, une variable
prend sa valeur par défaut ; illisible, elle fait **refuser le démarrage** — un garde-fou ne se
désarme pas par une faute de frappe.

| Variable | Défaut | Rôle |
|---|---|---|
| `BRIGADE_MAX_TURNS` | 100 | Tours par cook |
| `BRIGADE_MAX_MINUTES` | 60 | Durée d'un cook |
| `BRIGADE_MAX_TOKENS` | 2 000 000 | Tokens par cook |
| `BRIGADE_IDLE_MINUTES` | 10 | Silence toléré avant de conclure à l'inactivité |
| `BRIGADE_BREAKER_FAILURES` | 3 | Échecs d'affilée qui ouvrent le disjoncteur |

Sur la box, dans le drop-in de l'unité (`sudo systemctl edit brigade@.service`) :
`Environment=BRIGADE_MAX_TURNS=60`, puis redémarrer le service.

## L'état de la cuisine

Une seule commande pour savoir où en est le projet, sans ouvrir la base :

```bash
npm --prefix runtime run status                    # la photo
npm --prefix runtime run status -- --suivre        # la photo, puis le journal en direct
npm --prefix runtime run status -- --suivre 14     # la photo, puis le ticket 14 en direct
```

```
projet     brigade
runtime    en marche d'après le journal — pid 4211 sur parade-box, démarré il y a 2 h 10
           dernier tick il y a 12 s (cadence : 1 min)
cuisine    ouverte · disjoncteur fermé (1 échec d'affilée, ouverture à 3)

rail       1 pris · 1 en pass · 1 en attente
  #14  pris  prio:1  par box/claude-opus depuis 4 min, bail encore 6 min  Le rail porte les tickets
  #15  en pass  prio:1  depuis 40 s, cuisiné par box/claude-sonnet  La station claude
  #18  en attente  prio:2  depuis 2 h 10  La CLI d'état

cooks      1 en cours
  #14  14-3f9a01bc  4 min sur 1 h 00 · 12 tours sur 100 · 184 000 tokens sur 2 000 000 (relevé il y a 20 s)

derniers événements
  41  2026-10-08T10:04:10.000Z  brigade  #14  ticket.taken  station:box/claude-opus  {"station":"box/claude-opus","leaseUntil":"2026-10-08T10:14:10.000Z"}
  42  2026-10-08T10:04:11.000Z  brigade  #14  cook.launched  runtime  {"run":"14-3f9a01bc",…}
```

| Bloc | Ce qu'il dit |
|---|---|
| `runtime` | En marche, arrêté, ou jamais démarré — **d'après le journal**. Un runtime tué sans préavis y paraît encore en marche : c'est l'**âge du dernier tick** qui le trahit. Au-delà de quelques cadences, le runtime est figé ou mort : `systemctl status brigade@<projet>` |
| `cuisine` | Le « stop » du chef et le disjoncteur, comme `run garde-fous` |
| `rail` | Le décompte par état, puis chaque ticket dans l'ordre de service. Les durées sont comptées jusqu'à l'heure de la commande ; les horodatages exacts sont dans `run rail` |
| `cooks` | Chaque cook en cours, avec son ticket et ce qu'il a consommé face à ses plafonds. La durée est exacte ; tours et tokens sont ceux du dernier relevé, vieux d'une minute au plus — son âge est affiché |
| `derniers événements` | Les quinze derniers, au format de `run journal`, sans les battements ni les relevés que les blocs du dessus résument déjà |

Avec `--suivre`, la commande reste ouverte et ajoute une ligne par événement, à mesure qu'il
s'écrit — un ticket se suit ainsi du rail au verdict. Les relevés des cooks défilent, les
battements non. Ctrl-C pour arrêter.

La commande lit `$BRIGADE_STATE_DIR`, n'écrit jamais, et répond tout de suite pendant que le
runtime et ses cooks tournent. Tout ce qu'elle montre vient du journal : rien n'est calculé ni
gardé ailleurs. Sur un journal écrit par un runtime plus ancien, elle demande de redémarrer le
runtime, qui recalcule ce qui manque.

## Trois variables, aucun défaut

| Variable | Rôle |
|---|---|
| `BRIGADE_STATE_DIR` | Le répertoire qui contient tout l'état du projet : `log.db`, `lock.db`, et `runs/` pour le flux brut des cooks. Doit être sur un **disque local** — le verrou en dépend |
| `BRIGADE_PROJECT` | Le nom du projet : un identifiant court choisi par le chef, en minuscules, chiffres et tirets (`brigade`, `thermigo`). Il s'écrit dans chaque événement et dans le nom de l'unité systemd |

| `BRIGADE_GITHUB_REPO` | Le dépôt GitHub dont le projet sert les issues, sous la forme `<owner>/<repo>` (`benomite/brigade`) |

L'une des trois absente, le runtime refuse de démarrer et dit laquelle.

Deux réglages ont un défaut :

| Variable | Rôle | Défaut |
|---|---|---|
| `BRIGADE_LEASE_SECONDS` | La durée du bail : le silence toléré d'une station avant que son ticket revienne en attente | `600` (10 minutes) |
| `BRIGADE_GH_BIN` | Le binaire `gh`. Sert aux tests, qui y mettent un faux ; **jamais posé sur la box** | `gh` |

## Sur le poste de dev

```bash
eval "$(.claude/brigade/worktree-setup.sh <n> "$PWD")"   # pose BRIGADE_STATE_DIR
BRIGADE_PROJECT=brigade BRIGADE_GITHUB_REPO=benomite/brigade npm --prefix runtime start   # Ctrl-C pour l'arrêter
```

Lancé ainsi, le runtime lit les vraies issues du dépôt avec ton `gh` ; il n'y écrit rien.

| Besoin | Commande |
|---|---|
| Tests | `npm --prefix runtime test` — sur un clone nu, sans rien installer |
| Contrôle de types | `npm --prefix runtime run typecheck` — après le setup de worktree |

Les tests n'utilisent jamais `BRIGADE_STATE_DIR` : chacun crée son répertoire temporaire, et les
process qu'ils lancent ne reçoivent que l'environnement qu'ils leur donnent. Ils ne touchent jamais
le réseau : `gh` y est un faux.

## Sur la parade-box

Le fichier d'unité est versionné : `runtime/deploy/brigade@.service`, une instance par projet.

### À vérifier avant d'installer

Ces cinq points n'ont pas pu être contrôlés depuis une session de dev.

1. La box tourne sous Linux avec systemd : `systemctl --version`.
2. Node 26 y est installé : `node --version`.
3. `claude` est le binaire officiel, connecté, sous le compte qui fera tourner le service.
4. `/var/lib` est sur un disque local : `df -T /var/lib` ne montre ni `nfs` ni `cifs`.
5. `gh` y est installé et connecté sous le compte qui fera tourner le service :
   `sudo -u <compte> gh auth status`. Le runtime ne lit aucun jeton, c'est `gh` qui s'authentifie.

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

Le dépôt GitHub, lui, est propre à chaque projet : il se pose dans un drop-in de **l'instance**.

```bash
sudo systemctl edit brigade@<projet>.service
```

```ini
[Service]
Environment=BRIGADE_GITHUB_REPO=<owner>/<repo>
```

Sans lui, le service refuse de démarrer (code 2) et `systemctl status` dit pourquoi.

### Piloter

| Geste | Commande |
|---|---|
| Lancer | `sudo systemctl start brigade@<projet>` |
| Arrêter | `sudo systemctl stop brigade@<projet>` |
| Voir s'il tourne | `systemctl status brigade@<projet>` |
| Lire ce que le process imprime | `journalctl -u brigade@<projet> -f` |
| Le relancer à chaque reboot | `sudo systemctl enable brigade@<projet>` |
| Relire le journal | `sudo -u <compte> BRIGADE_STATE_DIR=/var/lib/brigade/<projet> npm --prefix /opt/brigade/runtime run journal` |
| Lire le rail | `sudo -u <compte> BRIGADE_STATE_DIR=/var/lib/brigade/<projet> npm --prefix /opt/brigade/runtime run rail` |
| Voir l'état de la cuisine, suivre le journal en direct | `sudo -u <compte> BRIGADE_STATE_DIR=/var/lib/brigade/<projet> npm --prefix /opt/brigade/runtime run status -- [--suivre [<ticket>]]` |
| Voir les garde-fous, « stop », « reprendre » | `sudo -u <compte> BRIGADE_STATE_DIR=/var/lib/brigade/<projet> npm --prefix /opt/brigade/runtime run garde-fous -- [stop \| reprendre]` |
| Mettre à jour | `sudo git -C /opt/brigade pull`, puis `sudo systemctl restart brigade@<projet>` |

Un crash relance le runtime au bout de 5 s. Un refus de démarrer (code 2) ne se réessaie pas :
`systemctl status` montre le motif.

Deux journaux, deux usages : **journald** garde ce que le process imprime ; **le journal** garde ce
qui s'est passé dans la cuisine. On ne reconstruit rien depuis journald.

### Recette du chef

À dérouler sur la box, projet `brigade`. `J` désigne la commande « Relire le journal » ci-dessus,
`R` la commande « Lire le rail ».

1. `sudo systemctl start brigade@brigade`, puis `systemctl status brigade@brigade` : le service est
   `active (running)`. `J` montre un `runtime.started`.
2. `sudo systemctl stop brigade@brigade` puis `start` : `J` montre `runtime.started`,
   `runtime.stopped`, `runtime.started` — les événements d'avant l'arrêt sont toujours là.
3. `sudo systemctl kill -s KILL brigade@brigade` : le service repart seul au bout de 5 s. `J` montre
   un `runtime.interrupted` suivi d'un nouveau `runtime.started`.
4. Pendant que le service tourne, lancer un second runtime à la main :
   `sudo -u <compte> BRIGADE_STATE_DIR=/var/lib/brigade/brigade BRIGADE_PROJECT=brigade BRIGADE_GITHUB_REPO=benomite/brigade npm --prefix /opt/brigade/runtime start`.
   Il refuse et nomme le pid du service ; `J` ne montre aucun événement de plus.
5. Poser le label `fire` sur une issue ouverte du dépôt. Dans la minute, `R` la montre **en
   attente**, avec sa priorité ; `J <numéro>` montre son `ticket.arrived`.
6. `sudo systemctl restart brigade@brigade` : `R` montre le même rail qu'avant.
7. Retirer le label `fire` de l'issue (ou la fermer). Dans la minute, `R` ne la montre plus ;
   `J <numéro>` montre un `ticket.left` avec son motif (`unfired` ou `closed`).

Le prêt d'un ticket à une station, et son retour quand elle meurt, se recetteront avec le premier
cook (#15) : d'ici là, ce sont les tests du runtime qui les prouvent.

**Garde-fous.** `G` désigne la commande « Voir les garde-fous » ci-dessus. Tant que la station
(#15) n'est pas livrée, aucun cook ne tourne sur la box : l'arrêt d'un cook par un plafond se
prouve par les tests, pas ici.

8. `G` montre les plafonds par défaut, la cuisine ouverte, le disjoncteur fermé. `J` montre un
   `guard.configured`.
9. `G -- stop` : `G` montre la cuisine arrêtée, `J` un `kitchen.stopped` écrit par `chef`.
   `sudo systemctl restart brigade@brigade` : `G` la montre toujours arrêtée.
10. `G -- reprendre` : `G` montre la cuisine ouverte.
11. Dans le drop-in, `Environment=BRIGADE_MAX_TURNS=beaucoup`, puis `restart` : le service refuse
   de démarrer et `systemctl status` nomme la variable. Retirer la ligne, `restart` : il repart.

**État de la cuisine.** `S` désigne la commande « Voir l'état de la cuisine » ci-dessus.

12. `S` répond aussitôt : le runtime en marche avec son pid, un dernier tick vieux de moins d'une
    minute, le rail tel que `R` le montre.
13. `sudo systemctl kill -s STOP brigade@brigade` fige le runtime sans le tuer. Deux minutes plus
    tard, `S` le montre toujours « en marche » mais avec un dernier tick vieux de deux minutes :
    c'est le signe d'un runtime figé. `sudo systemctl kill -s CONT brigade@brigade` le relance, et
    le tick redevient récent.
14. `S -- --suivre`, puis poser le label `fire` sur une issue : dans la minute, son `ticket.arrived`
    s'affiche sans relancer la commande. Ctrl-C.
