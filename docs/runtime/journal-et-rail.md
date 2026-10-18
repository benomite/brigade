## Ce qu'il fait aujourd'hui

| Geste | Ce qui se passe |
|---|---|
| Démarrer | Prend le verrou du projet, recalcule ses projections depuis le journal, écrit `runtime.started`, puis ce qui a changé de ses plafonds (`guard.configured`) et de sa cloison (`isolation.configured`), annonce les stations que le projet déclare (`station.announced` ; `stations.undeclared` s'il n'en déclare aucune), demande à `claude` si la machine a une session, et sonde GitHub |
| Tourner | Surveille le journal chaque seconde et se réveille au tick, toutes les 60 s. À chaque réveil : les garde-fous guettent le « stop », la station prend ce que ses bornes permettent, la pass juge ce qui est livré, le manager — s'il est allumé — juge, découpe et réagit. À chaque tick : `runtime.ticked`, sondage de GitHub, baux échus rendus, progrès des worktrees regardé, worktrees rangés, relevé de chaque cook (`cook.progressed`) |
| S'arrêter (`SIGTERM`, `SIGINT`) | Lâche les cooks en cours — un relais les porte, le runtime suivant les reprend ; **l'unité ne les signale pas** (`KillMode=process`) — et tue les gates en train de se jouer, écrit `runtime.stopped`, rend le verrou, sort avec le code 0 |
| Mourir sans préavis | Rien n'est perdu : le noyau libère le verrou, et le démarrage suivant écrit `runtime.interrupted` avant de repartir |
| Être lancé une seconde fois sur le même projet | Refuse, code de sortie 2, en nommant le runtime qui tourne (pid, machine, heure de démarrage) |

**Il lance des cooks**, plusieurs à la fois, par le binaire `claude` sous la connexion Max de la
machine : **chaque cook consomme du quota Max**, comme chaque appel du **manager** (court, sans
outil) et chaque relecture du **reviewer** de la pass (en lecture seule). Ses autres sous-processus
sont `gh`, `git`, et **les gates du projet** (`.claude/brigade/gates.sh`). **Sous grant `merge`, il
merge lui-même** ce que sa pass juge vert. Il n'écoute sur aucun port. **Rien de ce qu'il lance
n'est cloisonné tant que tu n'as pas posé la cloison** (voir « La cloison ») : il te le dit à chaque
démarrage. Tout part sous le compte GitHub de la machine — ou, avec des Apps, **sous une identité
par rôle**, avec des jetons d'une heure qu'aucun cook ne reçoit (voir « Une identité GitHub par
rôle »).

## Le journal

Un fichier par projet, `log.db`, dans le répertoire d'état. Chaque événement porte `seq` (l'ordre
de vérité), `at` (UTC), `project`, `ticket` (ou rien), `type`, `author` (`runtime`, `chef`,
`station:<nom>`…) et `payload` (JSON). La base refuse toute modification et toute suppression ; les
*projections* sont recalculées du journal à chaque démarrage.

### Relire le journal

```bash
npm --prefix runtime run log -- 13           # tout ce qui est arrivé au ticket 13, dans l'ordre
npm --prefix runtime run log                 # tout le journal, sans les battements du runtime
npm --prefix runtime run log -- --ticks      # tout le journal, battements compris
npm --prefix runtime run log -- --last 200   # seulement les 200 derniers événements, dans l'ordre
```

`--last <N>` se combine avec un numéro de ticket ou `--ticks`. Sans ticket, il lit par la fin du
journal (une requête bornée, pas tout le journal chargé pour n'en garder que la queue) ; avec un
ticket, il garde la fin de la liste de ce ticket. Les battements exclus ne comptent pas dans N. Sans lui, la sortie grossit avec le journal : c'est la forme qu'un
programme qui relit le journal à intervalle régulier doit demander.

Une ligne par événement. La commande lit `$BRIGADE_STATE_DIR`, n'écrit jamais, et répond pendant
que le runtime tourne.

## Le rail

Le rail porte les tickets du projet : **les issues ouvertes du dépôt qui portent le label `fire`**.
Poser le label fait entrer l'issue au sondage suivant (une minute au plus) ; la fermer ou lui
retirer le label l'en fait sortir, **quel que soit son état** — retirer `fire` est le geste pour
reprendre un ticket. Les PR ne sont jamais des tickets.

| État | Sens |
|---|---|
| **en attente** | sur le rail, à prendre — ou retenu : sa ligne dit par quoi |
| **BLOQUÉ** | en attente d'un ticket **abandonné**, ou **gelé** (86 sans heure de retour, que la pass n'a pas pu juger) : il ne partira pas sans un geste de ta part |
| **pris** | prêté à une station, sous bail |
| **en pass** | le cook a fini ; la pass juge — ou s'est arrêtée, verte, sans merger |
| **servi** | mergé. La pass ferme son issue : il quitte le rail au sondage suivant |
| **86** | pas servable pour l'instant (quota épuisé, ticket refusé, pass remontée au chef) |
| **WAITING** | en attente d'un **tiers** — un client, une décision externe, une réunion —, pas de toi : la cuisine ne le prend pas, et il n'est pas dans ce qui t'attend (voir « Un ticket attend un tiers : WAITING ») |

**Ordre de service** : `prio:1`, `prio:2`, `prio:3`, puis les issues sans `prio:` ; à priorité
égale, la plus ancienne d'abord.

**Un ticket peut en attendre un autre** : la ligne `attend` de sa fiche (voir « La fiche d'un
ticket »). Le rail ne le prête pas avant que **tous** ceux qu'il attend soient **servis**.

| Ce que dit la ligne | Sens | Ce qui le fait partir |
|---|---|---|
| `en attente … attend #12, #13` | #12 et #13 ne sont pas encore servis | rien : le dernier servi, il part seul |
| `BLOQUÉ … #12 abandonné (…)` | #12 a quitté le rail **sans avoir été servi** | remettre #12 sur le rail (issue ouverte, `fire`), ou retirer son numéro de la ligne `attend` |
| `BLOQUÉ … bloqué par #12 (86 sans heure de retour, non jugé par la pass)` | #12 est 86 sans retour ; ce ticket l'attend (`attend`), ou sa zone (`— zone tenue : <chemin>`) | trancher #12 : il se juge, se rend ou se retire, et ce ticket repart de lui-même |

- **Servi veut dire que sa livraison est mergée** — par la pass ou par toi, y compris sur un ticket
  remonté en 86. Une issue fermée à la main, ou livrée par une PR que le runtime n'a pas ouverte,
  n'est pas servie : c'est un abandon. Servi, un ticket le reste, même rouvert.
- **Abandonné** : issue fermée sans avoir été servie, label `fire` retiré, ou issue disparue — y
  compris une issue fermée qui n'est jamais entrée sur le rail.
- **Un blocage t'est dit une fois par abandon** : commentaire « Rail — ticket bloqué », fait
  `ticket.blocked`, `BLOQUÉ` sur le rail — après que la pass a relu la PR du ticket parti, s'il en
  laissait une : mergée à la main, elle le sert.
- **Un cycle est refusé** (#14 attend #15, qui attend #14) : la fiche de chacun de ses tickets
  devient illisible, cycle nommé ; ils reviennent seuls une fois une attente retirée.
- Un ticket attendu ouvert, sans `fire`, se laisse attendre. Une dépendance posée sur un ticket
  déjà pris ou en pass ne jouera que s'il revient en attente.

**Un ticket ne se prête qu'une fois** : la station qui le prend reçoit un **bail** de 30 minutes.
**Le bail ne se renouvelle que sur un progrès observable** dans le worktree du cook
(`ticket.renewed`), regardé au tick, au plus une fois par dixième de bail. Un worktree illisible ne
vaut ni progrès ni absence de progrès : le bail ne tombe alors qu'après un sursis d'un dixième de
bail.

Compte pour un progrès ce qu'un `git status` montrerait : un commit de plus ou réécrit, un fichier
suivi modifié ou supprimé, un fichier neuf non ignoré. Ne comptent pas : le flux de sortie du cook,
ce que le `.gitignore` écarte, le contenu de `.git`. L'inactivité (10 minutes, voir « Les
garde-fous ») écoute le flux : le cook est vivant ; le bail regarde le worktree : il progresse.

- **Quand le bail tombe**, la station arrête le cook et récolte (`guard.tripped`, motif `lease`) :
  ce qu'il a commité part en pass ; sans commit, le ticket revient en attente et l'arrêt compte au
  disjoncteur. Le rail ne rend de lui-même (`ticket.released`, `lease-expired`) qu'un ticket pris
  sans cook.
- **Passé la moitié du bail sans progrès**, le cook est signalé : `STUCK` dans `status` (`COINCE` avant #940), qui dit
  « no progress since … », et `cook.stalled` au journal (une fois par épisode). Rien n'est arrêté.
- **Un 86 revient seul** à son heure de retour ; sans elle, il reste 86 jusqu'à ce qu'on le rende.
- **GitHub injoignable** : le rail reste tel quel (`sondage GitHub en échec`, dans journald), et le
  sondage se rejoue au tick suivant.

### Lire le rail

```bash
npm --prefix runtime run rail
```

Une ligne par ticket, dans l'ordre de service. Un ticket en attente qui ne part pas dit pourquoi :
`attend #12, #13`, `zone tenue par #14 (chemin)` (voir « Les zones de fichiers ») ou, `BLOQUÉ`, le
ticket abandonné et son motif. La première ligne nomme les **chemins communs** du projet. Sous un
ticket à fiche, une ligne en retrait dit ce qu'il attend, sa zone, et ce que le runtime n'y comprend
pas (`FICHE ILLISIBLE — clé inconnue « budget »`).

### Retirer un ticket du rail, changer sa priorité

```bash
npm --prefix runtime run rail -- remove <ticket>
npm --prefix runtime run rail -- priority <ticket> <1-9 | none>
```

Les deux gestes de la fiche de l'app (`runtime/src/geste-ticket.ts`). `remove` retire le label `fire`
de l'issue d'un ticket en attente ou `BLOQUÉ` : il quitte le rail, son issue reste ouverte. Un ticket
pris, en pass, servi ou 86 est refusé, et rien n'est touché. `priority` remplace le label `prio:<n>`
de l'issue, quel que soit l'état du ticket ; `none` le retire. Chacun pose le label sous le `gh` du
compte du service (`BRIGADE_GITHUB_REPO` est requis), écrit au journal le fait que le sondage y
aurait écrit — le rail et la fiche le lisent aussitôt —, et dit son prix (`— cost: …`) : sur la
sortie standard s'il est accompli, sur la sortie d'erreur avec sa raison, en code 1, s'il est refusé.

Les faits du rail : `ticket.arrived`, `ticket.changed`, `ticket.left` (au nom de `github` ; aussi
pour une issue attendue, fermée sans être entrée sur le rail), `ticket.taken`, `ticket.renewed`,
`ticket.released`, `ticket.passing`, `ticket.served`, `ticket.86`, `ticket.blocked`,
`ticket.waiting`, `ticket.resumed` (au nom de `chef`), `waiting.marked`, `rail.commons`.

### Un ticket attend un tiers : WAITING

Ce qui attend quelqu'un d'autre que toi — la réponse d'un client, une décision externe, une
réunion — sort de ce qui t'attend (TODO) et se range à part : **WAITING**. Le ticket y dit ce qu'il
attend, dans tes mots, de qui, depuis quand, la date à laquelle y revenir, et ce qui se passera
quand ça arrivera.

```bash
npm --prefix runtime run waiting                # les tickets en WAITING
npm --prefix runtime run waiting -- set 8 --what "sa validation écrite du devis" --from "le client" [--remind 2026-10-21]
npm --prefix runtime run waiting -- resume 8    # WAITING → TODO, tout de suite
npm --prefix runtime run waiting -- arrived 8   # « c'est arrivé, on repart » : en cuisine, sans repasser par TODO
```

- **`poser`** met en WAITING un ticket du rail **en attente ou 86** ; un ticket pris ou en pass est
  refusé — la cuisine le tient. `--remind` : une date (ce jour-là à minuit, heure de la box), une
  date et une heure (`2026-10-21T09:00`) ou une durée (`7j`, `36h`) ; **sans elle, dans sept
  jours**. Redit sur un ticket qui attend déjà, il met à jour ce qu'il attend sans changer depuis
  quand.
- **Le second le lance sur demande du chef** (« mets #8 en attente du client jusqu'au 21 ») : il
  extrait ce qu'on attend, de qui et la relance, demande ce qui manque avant d'agir, puis lance ce
  même geste par la box (`brigade <nom> waiting set 8 --what … --from … --remind 2026-10-21`) —
  jamais un label ni un commentaire posé à la main. Le mode auto le juge : aucune règle étroite
  ne nomme des arguments libres. Cas d'éval : `evals/second-met-en-attente`.
- **La cuisine ne prend jamais un ticket WAITING** : c'est un 86 sans heure de retour (le socle du
  ticket gelé), au motif `third-party`. Le relevé ne le rend pas ; il ne tient sa zone que s'il
  porte une livraison ouverte.
- **`reprendre`** le ramène dans TODO : dans l'état où il était avant d'attendre s'il était mis de
  côté (sa ligne d'`attend` revient telle quelle), sinon mis de côté pour toi (motif
  `third-party:resumed`), avec ce qu'il attendait et tes gestes. Il ne part pas en cuisine seul.
- **`arrive`** le remet sur le rail, en attente : un cook le prend à son tour — sur sa livraison
  ouverte, s'il en porte une. Il marche aussi d'un ticket revenu de WAITING dans TODO.
- **Sur l'issue**, le runtime en marche le dit dès qu'il lit le geste : le label `waiting` tant
  que le ticket attend, et un commentaire à l'entrée en WAITING et à chaque changement — de qui,
  quoi, depuis quand, la relance, ce qui se passera à l'arrivée ; à la sortie, le label est retiré
  et un commentaire dit où il est allé. Ce qui est posé s'écrit au journal (`waiting.marked`) ;
  GitHub injoignable, c'est rattrapé au réveil suivant. Le label est créé par GitHub à sa première
  pose s'il n'existe pas.
- La relance n'est aujourd'hui qu'une date dite : rien ne ramène le ticket seul quand elle passe.

