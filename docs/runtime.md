# Le runtime de la V2

Le runtime est le process qui tient le **journal** d'un projet : une suite d'événements en ajout
seul, dont tout le reste dérive — à commencer par le **rail**, la file des tickets à servir. Il vit
dans `runtime/`, s'exécute avec Node 26 sans build, et ne dépend d'aucun paquet à l'exécution.

Ce document dit ce qu'il fait, comment le piloter et le recetter. **Installer brigade** — sur un
serveur, pour un projet — est un parcours à part, et un seul document : [`installer.md`](installer.md). Les décisions et leurs raisons
sont dans les specs, [`superpowers/specs/`](superpowers/specs/) — ici, seulement la consigne.

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
- **Passé la moitié du bail sans progrès**, le cook est signalé : `COINCE` dans `status`, qui dit
  « sans progrès depuis … », et `cook.stalled` au journal (une fois par épisode). Rien n'est arrêté.
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

## Les garde-fous

| Garde-fou | Ce qui se passe |
|---|---|
| Plafond de tours, de durée, de tokens | Le cook qui en dépasse un est arrêté. Les tokens comptent l'entrée, la sortie et l'écriture de cache — pas les lectures de cache |
| Inactivité | Le cook qui n'a rien produit depuis le délai d'inactivité est arrêté |
| Disjoncteur | Après N échecs d'affilée, plus aucun cook n'est lancé. Un échec : un arrêt par plafond, inactivité ou bail tombé, ou un cook sorti en erreur — **sans avoir rien commité** ; ou une relance décidée par le manager dont la livraison est jugée rouge (`relaunch.judged`). Ne comptent pas : le « stop », le quota épuisé, une connexion Max expirée, un refus du modèle, un redémarrage du runtime |
| « stop » | Tous les cooks en cours sont arrêtés dans la seconde, et plus aucun n'est lancé |

Arrêter un cook : `SIGTERM` à son groupe de process, puis `SIGKILL` dix secondes plus tard. **Le
disjoncteur ouvert et le « stop » tiennent**, redémarrage compris, jusqu'à « reprendre ».

### D'affilée, à plusieurs cooks

Le disjoncteur compte les échecs de **tous** les lancements du projet — cooks, relectures,
jugements du manager — sur un seul compteur, **dans l'ordre des lancements** : le nombre d'échecs
parmi les cooks lancés **après le dernier qui a réussi**, depuis ton dernier « reprendre ». La
livraison d'une relance du manager ne vaut réussite que jugée verte. Si les trois derniers lancés
échouent, il s'ouvre, quel que soit le nombre de réussites avant. Les plafonds restent **par cook**.

### Voir et commander

```bash
npm --prefix runtime run guardrails             # l'état
npm --prefix runtime run guardrails -- stop     # arrête tout
npm --prefix runtime run guardrails -- resume   # rouvre la cuisine, referme le disjoncteur
```

« stop » et « reprendre » s'écrivent au journal au nom du `chef` ; le runtime les voit en une
seconde. L'état montre plafonds, cuisine, disjoncteur, cooks en cours et derniers arrêts.

**Les gestes que le runtime te cite** (la file, `status`, les refus) sont écrits
sous la forme qui se tape là où tu les lis : sur la box, `brigade <projet> <commande> [arguments…]`,
avec le nom du projet du service (`BRIGADE_PROJECT`) — jamais `run <commande>`, que le geste de box
refuse (code 66). `npm --prefix runtime run <commande>` est la forme du poste de dev ; les deux
lancent la même commande. Le test `test/gestes-ecrits.test.ts` vérifie que chaque geste écrit est une
commande que le geste de box accepte.

### Pourquoi ce ticket s'est-il arrêté ?

Chaque arrêt est au journal du ticket : `npm --prefix runtime run log -- <ticket>`.

| Événement | Sens |
|---|---|
| `cook.launched` | Un cook part, avec son calibrage (`model`, `effort`), sa station, sa branche, ses plafonds et son flux brut (`runs/<run>.jsonl` dans le répertoire d'état ; sa sortie d'erreur en `.stderr`) |
| `cook.progressed` | Le relevé du cook à chaque tick : `turns` et `tokens`, et `activity` — ce qu'il fait en ce moment (voir « Ce que fait un cook en ce moment ») |
| `guard.tripped` | Un garde-fou l'arrête. `reason` : `turns`, `duration`, `tokens`, `idle`, `lease` ou `stop` ; `limit` et `observed` |
| `cook.exited` | Le process est mort. `outcome` : `ok`, `failed`, `guard`, `stop`, `neutral` ou `refused` ; code de sortie, tours, tokens ; `credentialsMasked` : combien de fois la forme des identifiants de Claude a été masquée dans son flux et sa sortie d'erreur (voir « Ni publiés dans ce qu'un cook dit ») |
| `cook.interrupted` | Le runtime s'est arrêté pendant que le cook tournait : il est mort avec lui |
| `breaker.opened`, `kitchen.stopped`, `kitchen.resumed` | Le disjoncteur s'ouvre ; « stop », « reprendre » (hors ticket) |

### Ce que fait un cook en ce moment

Le surveillant d'un cook lit son flux au fil de l'eau (`runtime/src/activite.ts`) et en garde **un
seul fait** : son dernier geste, et ce qu'il vise. Chaque relevé du tick le porte au journal
(`cook.progressed`, champ `activity` : `doing`, `target`, `since`), et c'est de là que `status`,
`faits` et la carte de l'app le lisent — au rythme du reste, une fois par tick.

- **Le geste, en mots du chef** : `lit`, `écrit`, `cherche dans le code`, `lance les tests`,
  `tests rouges`, `tests rouges, corrige` (ce qui s'écrit après des tests rouges, jusqu'à ce qu'ils
  repassent), `tests verts`, `lance les gates`, `gates rouges, corrige`, `vérifie les types`,
  `commite`, `pousse sa branche`, `ouvre la PR`, `lit le ticket`, `lance <programme>`,
  `cherche sur le web`, `confie une tâche à un agent`, `planifie`, `réfléchit` (entre deux
  outils), `démarre`, `rend son travail`. Un outil sans nom pour le chef est dit par le sien :
  `utilise l'outil <nom>`.
- **Ce qu'il vise, jamais ce qu'il y a dedans.** Un fichier lu ou écrit : son chemin, relatif au
  worktree du cook quand il y est. Une commande : son programme, et sa sous-commande pour ceux qui
  en ont (`git status`, `npm install`) — **aucun argument**, ni variable posée devant, ni ce qu'elle
  cite entre guillemets ou dans un here-document. Ni le code écrit, ni ce que le modèle dit ou
  pense, ni ce qu'un outil rend ne sortent. La cible passe par le même masque que le flux
  (identifiants de Claude, secrets du projet), tient sur une ligne, et ne garde que sa fin
  au-delà de 120 caractères.
- **`since` : depuis quand il fait cette chose.** Le même geste sur la même cible garde son heure ;
  un cook « sans progrès » montre ainsi **où** il s'est arrêté, et depuis quand.
- **Un cook dont le runtime ne lit pas le flux** — celui d'une station distante — n'a pas
  d'`activity` : rien n'est inventé, `faits` le dit nul et la carte écrit `activité non communiquée`.

Ce qu'en dit `faits` (`rail[].activite`) est l'activité **du ticket**, pas seulement du cook :

| État du ticket | Ce que dit `activite.fait` |
|---|---|
| pris, cook pas encore parti | `la station prépare le poste du cook` (depuis la prise) |
| pris, cook parti | son dernier geste ; `démarre` avant son premier relevé ; `null` si son relevé ne le dit pas |
| pris, cook fini | `la station livre son travail` (depuis la fin du cook) |
| en pass | `attend la pass`, puis `gates en cours`, `relecture en cours` (le reviewer tourne), `jugement en cours` (relu, la pass attend la CI) ; après le verdict : `jugée verte, la pass décide`, `jugée rouge, la pass décide`, `merge en cours`, `la pass attend` — ou, quand ses gates ont été coupées sur une machine saturée, `gates rejouées plus tard : machine saturée, aucun test en échec` —, `arrêtée par la pass`, `remontée au chef` |

### Régler les plafonds

Par l'environnement du runtime. Absente, une variable prend son défaut ; illisible, elle fait
**refuser le démarrage**.

| Variable | Défaut | Rôle |
|---|---|---|
| `BRIGADE_MAX_TURNS` | 100 | Tours par cook |
| `BRIGADE_MAX_MINUTES` | 60 | Durée d'un cook |
| `BRIGADE_MAX_TOKENS` | 2 000 000 | Tokens par cook |
| `BRIGADE_IDLE_MINUTES` | 10 | Silence toléré avant de conclure à l'inactivité |
| `BRIGADE_BREAKER_FAILURES` | 3 | Échecs d'affilée qui ouvrent le disjoncteur |

## La station

Une **station** vient prendre les tickets : un endroit où un moteur tourne, `<machine>/<moteur>` —
`box/claude`, c'est cette machine, le binaire `claude`, la connexion Max du compte du service. Pour
chaque ticket : elle le prend, crée un **worktree** sur une branche neuve `cook/<run>` partie de la
branche d'intégration, le rend exécutable, y lance le cook sous garde-fous, puis **récolte**. Le
clone du dépôt n'est jamais modifié.

### Déclarer les stations

**Le runtime ne suppose aucune station : le projet déclare les siennes**, par le geste `station`
— une décision du chef, posée au journal du projet, lue sans redémarrage. Ce n'est pas un fait de
la machine : le drop-in de l'unité n'en porte plus rien, et une variable `BRIGADE_STATIONS` qui y
traîne est **ignorée** (le runtime le dit à son démarrage, avec le geste). Une station par entrée,
séparées par des virgules ; trois champs par station, séparés par `:` :

```
<machine>/<moteur>:<plafond de cooks>:<capacité>+<capacité>[:distante[+ordinaires]],…
```

```bash
brigade <projet> station stations box/claude:30:code+raisonnement,box/playwright:2:navigateur-headless
```

| Champ | Ce qu'il dit | Ce qui est accepté |
|---|---|---|
| **nom** | `<machine>/<moteur>` : le nom par lequel le rail, le journal, `status` et `station` la désignent | une machine et un moteur, chacun en minuscules, chiffres et tirets ; **un nom ne se déclare qu'une fois** |
| **plafond** | combien de cooks elle fait tourner à la fois | un entier supérieur à zéro |
| **fournit** | ses **capacités** : ce que cette machine sait faire (`code`, `navigateur-headless`, `chrome-connecté`…) | au moins une ; des lettres, des chiffres et des tirets, séparées par `+` |
| **distante** | facultatif : la station **ne tourne pas sur la machine du runtime** — le poste du chef. Le runtime n'y lance rien et ne la joint jamais : c'est elle qui vient tirer son travail (voir « Une station distante tire son travail ») | le mot `distante`, et rien d'autre : **ni hôte, ni port, ni adresse** — la box ne sait pas où elle est |
| **ordinaires** | facultatif, après `distante` (`distante+ordinaires`) : la station distante prend **aussi les tickets ordinaires** — ceux qui ne demandent aucune capacité —, chacun dans le bac à sable de Claude Code de son poste (voir « Les tickets ordinaires sur le poste du chef ») | le mot `ordinaires`, et seulement d'une station `distante` : une station de la box les prend déjà |

- **Plusieurs stations de la même machine** se déclarent côte à côte (`box/claude`, `box/playwright`) :
  chacune a son plafond et ses cooks, et un ticket part dans la première, dans l'ordre de la
  déclaration, que rien ne retient et qui fournit ce qu'il demande. Toutes celles que le projet déclare
  sans le mot `distante` tournent sur cette machine,
  par le même `claude` et la même connexion Max : **l'entrée, la machine, le quota, la connexion et
  l'arbitre leur sont communs** — un quota épuisé ou une connexion tombée se disent de toutes.
- **Aucune station** (rien de posé, ou une déclaration vide) : c'est accepté, le runtime démarre —
  et **aucun cook ne part**. Les tickets restent en attente ; le manager juge et la pass relit
  toujours. Le runtime le dit au démarrage (`brigade : stations — aucune…`), l'écrit
  (`stations.undeclared`), et `status` le montre tant que ça dure (`stations  AUCUNE DÉCLARÉE…`,
  et `aucune station déclarée` sur chaque ticket qui attend) ; `installation` le compte comme un
  **manque**. Le geste : `station stations <déclaration>` — lu au réveil suivant, sans redémarrer.
- **Mal écrite, la déclaration fait refuser le démarrage**, et le refus nomme la station et le champ
  en cause — `BRIGADE_STATIONS invalide : station n° 2 (« box/claude:0:code ») — plafond : « 0 »
  n'est pas un entier supérieur à zéro`. Un plafond ne se devine pas, et une station ne disparaît
  pas sur une faute de frappe.
- **Une station retirée de la déclaration** sort de `status` et de `station` au redémarrage
  (`station.withdrawn`) ; le ticket qu'elle tenait revient en attente, et les cooks qu'elle a lancés
  restent au journal et au relevé.
- **Une capacité n'est pas une permission.** Elle dit ce qu'une machine *peut faire* ; ce qui est
  *permis* reste l'affaire des grants. Le runtime ne reconnaît aucun nom de capacité : il les lit,
  les annonce, les montre, et les compare à ce que la fiche d'un ticket demande — un ticket ne part
  que dans une station qui fournit ce qu'il demande (voir « Les capacités qu'un ticket demande »).

Au démarrage, le runtime dit ce qu'il a lu : `brigade : stations — box/claude (30 cooks au plus ;
fournit : code, raisonnement) ; box/playwright (2 cooks au plus ; fournit : navigateur-headless)`.

### Plusieurs cooks à la fois

Une station prend des tickets tant que **trois bornes** le permettent, relues à chaque prise :

| Borne | Ce qu'elle retient | Réglage |
|---|---|---|
| **Le plafond de cooks** | le nombre de tickets que la station tient en même temps | celui qu'elle déclare (`station stations`) ; à chaud : `run station -- cooks <N>`, pour **toutes** les stations du projet, `0` pour aucune limite |
| **L'entrée** | le nombre de tickets dont le worktree se prépare et le setup se joue | `BRIGADE_MAX_SETUPS`, **4** par défaut |
| **La machine** | plus aucune prise quand processeur, mémoire ou disque manquent | trois seuils, ci-dessous |

`cooks <N>` écrit `station.capped` pour chaque station, lu dans la seconde, tenu après un
redémarrage — **il l'emporte sur le plafond déclaré**, et le reste tant qu'un autre `cooks <N>` ne
le remplace pas. L'entrée et la machine sont communes aux stations du projet. **Baisser le
plafond n'arrête aucun cook.** Il ne compte que les cooks de tickets — ni jugement ni relecture —,
et un ticket rendu ou retiré jusqu'à l'arrêt de son cook. Un ticket qui attend l'entrée reste en
attente, son bail ne court pas.

| Ressource | Elle se retient quand | Variable | Défaut |
|---|---|---|---|
| processeur | la charge moyenne sur une minute, par cœur, dépasse ce seuil | `BRIGADE_MAX_LOAD_PER_CORE` | `1.5` |
| mémoire | il reste moins que ce nombre de Mo de mémoire **disponible** | `BRIGADE_MIN_FREE_MEMORY_MB` | `1024` |
| disque | il reste moins que ce nombre de Mo libres sur le disque de `BRIGADE_STATE_DIR` | `BRIGADE_MIN_FREE_DISK_MB` | `5120` |

Saturée, elle le dit : `station.saturated` puis `station.relieved`, `MACHINE SATURÉE` dans `run
status` et `run station`. **Les cooks en cours continuent.** La saturation se lève avec dix pour
cent de marge ; `0` pour la mémoire ou le disque : jamais retenu. **Un rail plein ne part pas d'un
bloc** : pendant sa première minute, chaque cook lancé — et chaque ticket en entrée — pèse d'avance
une unité de charge et 512 Mo. Les gates que la pass joue chargent la machine elles aussi.

**Un ticket qui pourrait partir et ne part pas dit pourquoi** : `station.held` au journal, une ligne
`SE RETIENT` (`retenue` dans `run station`), et la raison sur la ligne du ticket.

| `reason` | Ce qui retient la station |
|---|---|
| `ramp`, `machine` | la montée progressive (les cooks tout juste partis pèsent d'avance) ; la machine saturée |
| `cap`, `setups` | le plafond de cooks, le plafond de setups atteint |
| `stopped`, `breaker` | ton « stop », le disjoncteur ouvert |
| `deploy` | une mise en service demandée — ne se lit plus que dans les journaux d'avant la station, qui ne demande plus de mise en service |
| `base` | la branche d'intégration est rouge (voir « La base est jugée seule ») |
| `setup` | le setup du projet est bloqué : il a échoué deux fois de suite à l'identique (voir « Le setup du worktree passe avant le cook ») |
| `quota`, `disconnected` | le quota épuisé, la connexion Max expirée |
| `arbiter`, `unarbitrated` | l'arbitre garde la place pour un autre projet ; il est injoignable : un seul cook à la fois (voir « L'arbitre entre projets ») |

Le fait s'écrit quand la raison change, jamais quand aucun ticket n'attend ; `station.released`
quand plus rien ne retient. **Deux tickets dont les zones se recouvrent ne partent jamais ensemble.**
**Un cook qui tombe n'emporte pas les autres** ; un ticket rendu pendant que son cook tourne n'est
repris qu'une fois ce cook arrêté, et sa zone reste tenue d'ici là. Limites : un ticket qui échoue
en boucle accumule des **branches locales** dans le clone ; **aucune jauge de quota** (#63) — monte
le plafond par paliers.

### Le setup du worktree passe avant le cook

Si le projet a un `.claude/brigade/worktree-setup.sh` sur la branche du cook, la station le joue
avant le cook — `worktree-setup.sh <n° du ticket> <worktree>` — et **ce qu'il exporte entre dans
l'environnement du cook**. La pass fait de même avant les gates.

| Cas | Ce que fait la station |
|---|---|
| Le projet n'a pas de setup | rien : le cook part |
| Le setup réussit | le cook part avec ses exports, et le bail repart de zéro |
| Le setup échoue, ou dépasse **la moitié du bail** | **aucun cook** : 86 dix minutes, motif `setup-failed`, puis retour en attente. Le disjoncteur ne compte rien |
| Le setup échoue **comme le précédent du projet** — même motif, aucun hôte refusé de plus —, sur ce ticket ou sur un autre | **le projet est bloqué** (`setup.blocked`) : plus aucun setup n'est lancé, pour aucun ticket, tant que la branche d'intégration n'a pas bougé |
| Un ticket renvoyé par la pass | le setup est joué dans le worktree neuf du renvoi |
| Le dépôt déclare un secret que la machine ne peut pas donner | **ni setup ni cook** : 86 dix minutes, motif `secrets-unavailable` ; l'issue dit lequel, une fois (voir « Les secrets du projet ») |
| Sous une identité par rôle, le ticket ne se lit pas sur GitHub | **aucun cook** : 86 dix minutes, motif `ticket-unreadable` (voir « Une identité GitHub par rôle ») |

**Un setup en échec se lit sur l'issue** : code de sortie ou plafond dépassé, la fin de sa sortie
(secrets du projet et forme des identifiants de Claude masqués), l'heure du retour, et **l'hôte que
la porte a refusé** pendant ce setup, avec le geste qui l'ouvre — une ligne dans
`.claude/brigade/reseau`, mergée sur la branche d'intégration (voir « La liste blanche »). **Une
fois par cause** : de nouveau si le motif change, si un hôte jamais nommé sur ce ticket est
refusé, ou si un cook est parti depuis. `run partition` montre les derniers refus.

**Un échec qui se répète bloque le projet, pas le ticket.** Réessayer toutes les dix minutes, ticket
par ticket, ne ferait que redire la même chose : dès qu'un setup échoue comme le précédent du
projet — le même motif (`code de sortie 1`, plafond dépassé), et aucun hôte refusé que le précédent
ne nommait pas —, la station écrit `setup.blocked` avec la cause et le commit de la branche
d'intégration dont le worktree était parti, le dit sur l'issue et dans journald, et ne lance plus
aucun setup : ses stations se retiennent (`setup`), les tickets 86 reviennent en attente à leur
heure et y restent. Un setup passé entre deux échecs remet le compte à zéro ; un échec d'une autre
cause suit le cours ordinaire. **La reprise est seule** : ce qui lève la cause — un hôte déclaré
dans `.claude/brigade/reseau`, un setup corrigé, une dépendance réparée — arrive en étant mergé
sur la branche d'intégration. Tant que le projet est bloqué, la station la rapatrie à chaque tick ;
dès qu'elle a bougé, `setup.unblocked`, les tickets 86 pour un setup en échec reviennent en
attente sans attendre leur heure, et les setups repartent. Si la cause n'est pas levée, le premier
échec à l'identique rebloque aussitôt, sur la nouvelle base : un setup par merge, pas un toutes
les dix minutes. Un échec passager (un registre en panne) bloque comme un autre : il se lève au
premier merge sur la branche d'intégration. Le blocage tient après un redémarrage.

**Le même mécanisme vaut pour toute cause de mise de côté qui ne tient pas au ticket.** Un
worktree qui ne se prépare pas (`worktree-failed`), un ticket illisible sur GitHub
(`ticket-unreadable`), des secrets indisponibles (`secrets-unavailable`) : la station écrit
`aside.failed` à chaque mise de côté ; la même cause deux fois de suite sur le projet, sans cook
parti entre les deux, écrit `aside.blocked` (la cause, le commit de la base) — une alerte
journald, et une entrée `aside` dans la file du chef, avec la cause en clair et le geste. Ces
causes se lèvent hors du dépôt (une valeur posée, GitHub revenu) : le blocage n'arrête donc pas la
cuisine, il la met **à un ticket à la fois** — les tickets reviennent à leur heure, un seul sonde.
**La reprise est seule** : dès qu'un cook part, la cause est levée et l'entrée tombe ; si une autre
cause se présente, `aside.unblocked` (`why: cause`) et c'est elle qui compte ; si la branche
d'intégration bouge, `aside.unblocked` (`why: base`) et les tickets 86 pour cette cause reviennent
sans attendre. Le setup garde son blocage propre, ci-dessus, inchangé.

**Le blocage entre dans ta file.** Tant qu'il tient, le bloc `attend` porte une entrée `setup`, une
seule pour le projet quel que soit le nombre de tickets retenus, avec la cause en clair et le geste :
``setup impossible : la porte refuse `cdn.sheetjs.com` (…) — à déclarer dans `.claude/brigade/reseau`
du projet, une ligne par hôte, puis merger sur la branche d'intégration`` ; sans hôte refusé, le
setup lui-même est à corriger, et l'entrée nomme l'issue où lire ce qu'il a dit. La ligne `setup`
en tête de `status` le redit, et la cuisine est `retenue` pour l'app — sauf si une station
distante, qui prépare son setup sur son poste, peut encore cuisiner. Au `setup.unblocked`,
l'entrée et la ligne disparaissent seules. Voir « Ce qui attend le chef ».

En écrivant le script : **les variables `BRIGADE_*` du runtime ne lui parviennent pas**, ni au
cook ; ce qu'il exporte, si — sauf `ANTHROPIC_API_KEY`, `ANTHROPIC_AUTH_TOKEN` et
`CLAUDE_CODE_OAUTH_TOKEN`, que la station retire. **Les secrets que le dépôt déclare lui
parviennent**, masqués dans ce qu'il en dit. **Il ne laisse rien tourner** en arrière-plan.

### Calibrer un ticket

**Aucun cook ne part sans calibrage**, posé sur l'issue par deux labels — par le manager s'il est
allumé, à la main sinon. Pas de valeur par défaut.
`model:` vaut `opus`, `sonnet` ou `haiku` ; `effort:` vaut `low`, `medium`, `high`, `xhigh` ou
`max`. Sans l'un des deux, avec deux pour la même dimension ou une valeur hors liste, le ticket est
**refusé** : 86, motif `no-calibration`, un commentaire dit ce qui manque. Les labels posés, il
revient en attente seul, au sondage suivant.

### La fiche d'un ticket

**Les tickets qu'il attend**, **la zone de fichiers qu'il possède** et **les capacités qu'il demande
à sa station** vivent dans **un commentaire de son issue**, repéré par un marqueur :

```
<!-- brigade:fiche -->
**Fiche du ticket** — lue par le runtime, corrigeable à la main.
- attend : #68, #69
- zone : runtime/src/rail.ts, runtime/test/rail.test.ts
- requiert : navigateur-headless
```

`attend` : des `#N`, séparés par des virgules ou des espaces. `zone` : des chemins relatifs à la
racine du dépôt — fichiers ou dossiers —, séparés par des virgules. `requiert` : des noms de
capacité, séparés par des virgules ou des espaces — la ligne est **facultative**, et une fiche qui
ne l'a pas se lit exactement comme avant (voir « Les capacités qu'un ticket demande »).
Sans fiche, un ticket n'attend personne, ne possède rien et ne demande rien. **Elle se corrige à la main**, en
éditant le commentaire ; la lecture tolère la casse, le gras, la puce ou son absence, l'ordre, et
de la prose autour. Le marqueur **ne compte qu'en tête de ligne, hors d'un bloc de code**. Le
manager écrit celle des tickets qu'il découpe.

| Ce que porte l'issue | Ce que le runtime en fait |
|---|---|
| Une clé inconnue (`budget : 40`) ; une puce qui n'est pas `clé : valeur` ; une clé posée deux fois | fiche illisible |
| Une valeur qui n'est pas un `#N`, pas un chemin du dépôt (absolu, `~`, `..`), ou pas un nom de capacité (`chrome/connecté`) | fiche illisible — la valeur est citée |
| Un **motif** dans la zone (`*`, `?`) | fiche illisible : un dossier possède déjà tout ce qu'il contient |
| Deux fiches | fiche illisible, **aucune n'est lue** |
| Un `#N` qui ne désigne aucune issue, le ticket lui-même, ou une PR | fiche illisible |
| Des `attend` qui forment un cycle entre tickets du rail | fiche illisible pour chaque ticket du cycle |
| Une fiche posée par quelqu'un qui n'a pas la main sur le dépôt | **ignorée**, et dit sur journald (`fiche ignorée sur le ticket #N`) |

Fiche illisible, le ticket est **refusé** à la prise : 86, motif `unreadable-card`, un commentaire
liste ce qu'il faut corriger. Lisible ou supprimée, il revient seul (`ticket.released`, motif
`card-readable`) ; ce qui reste à corriger se lit dans `run rail`. La fiche est relue quand l'issue
change, et entre au journal (`ticket.arrived`, `ticket.changed`, champ `card`).

### Les capacités qu'un ticket demande

**Une station fournit des capacités** (la décision `stations`, voir « Déclarer les stations ») ; **un
ticket en demande** par la ligne `requiert` de sa fiche. Le manager la pose au découpage, pour un
ticket infaisable sans elle — il lit ce que fournissent les stations du projet — ; elle se corrige à
la main comme le reste. La plupart des tickets n'en demandent aucune.

| Ce que le ticket demande | Où il part |
|---|---|
| Rien | dans la première station, dans l'ordre de la déclaration, que rien ne retient — **quoi qu'elle fournisse** |
| Une ou plusieurs capacités | dans la première station libre qui les fournit **toutes** ; ce qu'elle fournit en plus ne l'écarte pas |
| Une capacité que fournit une station **pleine ou retenue** | nulle part pour l'instant : il attend sa place, aucune autre ne le prend, et `status` dit laquelle le retient |
| Une capacité qu'**aucune station déclarée ne fournit** — ou plusieurs qu'aucune ne fournit ensemble | **il ne part pas** : 86, sans cook |

- **Seule la capacité choisit la station, jamais une préférence.** Une spécialité (sécu, rédaction,
  BDD) n'est pas une capacité : rien dans le runtime n'écarte une station parce qu'un ticket « irait
  mieux » ailleurs.
- **Les noms se comparent tels quels** (`chrome-connecté` n'est pas `chrome-connecte`) : le runtime
  n'en reconnaît aucun. Seule la façon d'écrire un accent est indifférente.
- **Sans station qui la fournisse, le ticket est 86 avant toute prise** — écrit par le runtime, motif
  `no-station: chrome-connecté` (`no-station: a + b` quand chacune est fournie quelque part, jamais
  ensemble), sans heure de retour. **Aucun cook n'est lancé**, aucun worktree préparé ; les autres
  tickets partent, et lui ne tient pas sa zone. Son issue reçoit un commentaire qui nomme ce qui
  manque et les stations déclarées.
- **`status` dit ce qui manque et le geste qui le fournirait**, dans le bloc `attend` :

  ```
  #14  depuis 3 min  aucune station ne fournit `chrome-connecté` — à fournir : déclarer une station qui la fournit par `brigade <projet> station stations <machine>/<moteur>:<plafond de cooks>:chrome-connecté`, ou retirer `chrome-connecté` de la ligne `requiert` de sa fiche — il repart seul
  ```

- **Il revient en attente seul** (`ticket.released`, motif `capabilities-reread`) : au redémarrage,
  si une station déclarée fournit désormais ce qu'il demande ; au sondage, si sa fiche ne le demande
  plus. Une fiche qui demande maintenant autre chose qui manque le renvoie 86, sous le nouveau motif.
- **Sans aucune station déclarée**, un ticket qui demande une capacité est 86 de la même façon ;
  celui qui n'en demande pas attend, comme avant.
- **Demander une capacité n'autorise rien.** Elle dit dans quelle station le ticket part ; ce que son
  cook a le droit de faire ne change pas. `accès-prod` écrit sur une ligne `requiert` est un nom
  comme un autre : la liste de ce qu'aucun grant n'autorise (`runtime/src/grant.ts`) reste ce
  qu'elle était, et `grant -- activer acces-prod` est refusé comme avant.

### Une station distante tire son travail

**Le poste du chef se connecte à la box, jamais l'inverse.** La box ne peut pas lancer un cook chez
lui et n'a aucun chemin vers son poste. Une station qui tourne ailleurs que sur la machine du
runtime — `mac/claude`, avec le Chrome connecté du chef — se déclare donc `distante`, et **c'est elle
qui vient** : elle s'annonce, réclame un ticket, renouvelle son bail, rend sa livraison. Ce chapitre
décrit le côté box ; le programme qui joue la station sur le poste (le runner de l'app) vit dans
`app/`.

```bash
brigade <projet> station stations box/claude:30:code,mac/claude:1:chrome-connecté:distante
```

**Un seul point d'entrée : le geste de la box**, lancé par la station depuis son poste —
`ssh <hote> brigade <nom> pull <station> <demande>`. Le geste n'ouvre aucune connexion : il écrit
la demande au journal du projet (`remote.asked`), le runtime qui tourne la lit à son réveil (une
seconde au plus) et y répond de même (`remote.answered`). Il rend la réponse en **JSON, sur une
ligne**, et son code de sortie dit le reste :

| Demande | Ce qu'elle fait | Réponse |
|---|---|---|
| `pull <station> announce [--sandbox <json>]` | la station se dit là — et, avec `--sandbox`, ce qu'elle sait du bac à sable de son poste | ce qu'elle fournit, son plafond de cooks, le délai de présence, la durée du bail, les plafonds des garde-fous |
| `pull <station> claim [--sandbox <json>]` | prend un ticket, s'il y en a un pour elle — `--sandbox`, comme pour `announce` | `mission` — le ticket, le run, la branche à créer (`cook/<run>`, depuis `base`) ou à reprendre (`resumes`, un renvoi de la pass), le calibrage, la consigne du cook et les arguments de `claude`, les plafonds, l'échéance du bail — ou `mission: null`, et `held` : ce qui la retient |
| `pull <station> renew <run> --proof <empreinte> --turns <n> --tokens <n>` | montre que le cook a travaillé, et ce qu'il a consommé | la nouvelle échéance du bail |
| `pull <station> return <run> --end livre\|echec [--reason <motif>] --turns <n> --tokens <n>` | rend le ticket ; le dernier message du cook sur l'entrée standard | ce que la box a retenu : `done`, ou `failed` et pourquoi |

| Code | Sens |
|---|---|
| `0` | la demande est servie |
| `1` | elle est refusée : `refusal` dit pourquoi, `said` le dit en clair — et **`stop`**, quand le cook est à arrêter (voir plus bas) |
| `2` | le geste est mal écrit : rien n'est demandé à la box |
| `3` | la box n'a pas répondu — aucun runtime ne tourne, ou il n'a pas répondu en trente secondes : rien n'est à supposer de ce qu'il a fait de la demande |

**Les règles sont celles d'un cook de la box, pas des règles à part.** Un cook sur le poste du chef
n'est pas un cook privilégié :

- **Elle ne reçoit que le ticket qu'elle peut cuisiner** : le premier, dans l'ordre de service, dont
  elle fournit **tout** ce que la fiche demande (« Les capacités qu'un ticket demande ») — jamais un
  autre, même s'il attend devant. Et, sans cloison sur son poste, **un ticket qui demande une de ses
  capacités** : un ticket ordinaire ne lui revient que déclarée `distante+ordinaires`, son poste
  ayant le bac à sable (voir plus bas). Seule une station **déclarée `distante`** tire : un nom inconnu
  (`unknown-station`) ou celui d'une station de la box (`not-remote`) est refusé, et ne vaut pas
  présence.
- **Les bornes d'une prise sont les mêmes** : le « stop » du chef, le disjoncteur, la base rouge (seul son ticket de réparation en part, et d'une station d'ici), son
  quota, son plafond de cooks (`run station -- cooks <N>` le règle aussi), les zones tenues par les
  cooks en cours, d'ici ou d'ailleurs. Un ticket non calibré ou à la fiche illisible est refusé de
  la même façon, sur son issue. L'entrée (`BRIGADE_MAX_SETUPS`), la garde de la machine et l'arbitre
  entre projets ne la retiennent pas : ils gardent **cette** machine, et son cook pèse sur la sienne.
- **Son cook est lancé par les garde-fous**, comme un autre (`cook.launched`, avec `remote: true` et
  les mêmes `limits`) — sans process ici : la box ne peut ni le signaler ni lire son flux. Elle
  tient donc les quatre plafonds sur ce qu'elle a : **tours et jetons** sur la mesure que la
  station rapporte à chaque renouvellement (le même jugement que pour un cook de la box, dans le
  même code), **durée** sur sa propre horloge depuis le lancement, **inactivité** quand cette
  mesure ne bouge plus — ou qu'il n'en arrive plus. Le relevé du tick (`cook.progressed`), le
  « stop » du chef, la fin (`cook.exited`) et le compte du disjoncteur sont ceux de tout cook.
- **Le bail ne se renouvelle que sur une preuve de travail** : `--proof` porte l'empreinte du
  worktree du cook — la tête de sa branche et l'état de ses fichiers, ce que la station d'ici lit
  elle-même dans les siens. Sans preuve, ou sur la **même** empreinte que la fois d'avant, le
  renouvellement est refusé (`no-progress`) : ni la présence de la station ni ce que son cook
  consomme ne tiennent un ticket. Le bail tombe alors à son échéance, et le cook est arrêté
  (`guard.tripped`, `reason: lease`) — à mi-bail, `cook.stalled` l'avait signalé.
- **« Arrêter » un cook distant, c'est ne plus rien accepter de lui.** La box n'a personne à
  signaler : la fin s'écrit tout de suite au journal, le ticket revient au rail, et la station
  l'apprend à sa demande suivante — refus `stopped`, avec `stop` : `turns`, `tokens`, `duration`,
  `idle`, `lease`, `stop` (le chef, ou le ticket a quitté ses mains) ou `interrupted` (le runtime a
  redémarré : comme ceux de la box, ses cooks ne lui survivent pas). C'est à elle d'arrêter le sien ;
  ce qu'il livrerait ensuite n'est pas reçu.
- **Elle ne reçoit rien de plus qu'un cook de la box** : ni secret du projet, ni jeton GitHub, ni
  grant. La consigne et les arguments de `claude` sont ceux qu'un cook de la box aurait reçus pour
  ce ticket — les mêmes outils interdits. Ce que son poste peut faire par ailleurs (son `gh`, son
  navigateur) est à lui : la box n'en donne ni n'en garantit rien.
- **Sa livraison passe la pass, la même.** Le cook ne pousse pas : c'est la station qui pousse
  `cook/<run>` **sur l'origine** (GitHub), puis rend (`--end livre`). La box rapatrie la branche de
  l'origine — jamais du poste —, y cherche la forme des identifiants de Claude, ouvre la PR, écrit
  le compte-rendu (`cook.reported`) et envoie le ticket en pass : mêmes gates, même reviewer, même
  grant `merge`, mêmes renvois. Sans commit sur l'origine, ce que le cook a délimité dans son
  dernier message est son livrable (`no-diff`) ; sans rien de délimité, il n'a rien livré
  (`no-deliverable`). Un renvoi revient à la première station qui peut cuisiner le ticket, d'ici ou
  d'ailleurs : sa branche est sur l'origine.

**Présence : une station distante qui ne s'est pas manifestée récemment est absente.** Toute demande
la manifeste. Passé le délai de présence (`BRIGADE_PRESENCE_MINUTES`, deux minutes par défaut) sans
en recevoir, le runtime l'écrit (`station.absent`) ; à la suivante, `station.present`. **Ce n'est
pas une panne** — son poste est éteint, ou ailleurs :

- les tickets **qu'elle seule peut cuisiner** — toutes les stations qui fournissent ce qu'ils
  demandent sont distantes et absentes — sont **86**, motif `station-absent: mac/claude`, sans heure
  de retour, sans cook, sans échec compté. Ils ne tiennent ni place ni zone ;
- **les autres partent** : une station de la box qui peut cuisiner un ticket le prend comme avant ;
- dès qu'elle se manifeste, ils reviennent en attente seuls (`ticket.released`, motif
  `station-present`), et elle peut les réclamer ;
- l'issue ne l'apprend **qu'une fois** : une station qui va et vient n'y écrit pas à chaque absence.
  `status` le dit dans le bloc `attend`, et `station` sur sa ligne `présence` :

  ```
  #16  depuis 3 min  station absente — `mac/claude` ne s'est pas manifestée récemment — ce n'est pas une panne, et rien n'est à faire sur la box : le ticket repart seul dès que la station se manifeste (son poste allumé, son runner lancé)
  ```

#### Les tickets ordinaires sur le poste du chef

Une station distante tourne **sans cloison**, sur le poste du chef : un cook y lirait ce que lit
son compte — la clé `ssh` vers la box, ses accès de prod. Par défaut, elle ne prend donc **que les
tickets qui demandent une de ses capacités**, comme avant. Le chef peut lui faire prendre aussi les
**tickets ordinaires** — ceux dont la fiche ne demande rien — en la déclarant `distante+ordinaires` ;
son **plafond de cooks** est alors la limite du Mac, tickets ordinaires compris
(`run station -- cooks <N>` le règle aussi) :

```bash
brigade <projet> station stations box/claude:30:code,mac/claude:2:chrome-connecté:distante+ordinaires
```

**Un ticket ordinaire n'y part que dans le bac à sable de Claude Code** (`runtime/src/bac-a-sable/`).
La station le dit à chaque `announce` et `claim`, par `--sandbox <json>` : l'objet que rend la
sonde, jouée sur son poste par son app —
`node runtime/src/bac-a-sable/sonder.ts <worktrees> [<cache>…]`, où `<worktrees>` est le
répertoire où le poste pose les worktrees des cooks du projet. Disponible, il porte la version de
son `claude`, le répertoire du compte, ce répertoire et les caches du projet ; indisponible — pas
macOS, pas de Seatbelt (`/usr/bin/sandbox-exec`), un `claude` trop ancien ou muet —, la raison.

- **Réglage et bac à sable** : la box lui prête un ticket ordinaire, et en écrit la configuration
  pour ce cook — il n'écrit que dans `<worktrees>/<run>` et les caches du projet, ne lit ni `~/.ssh`
  ni les identifiants du chef, ne joint que les hôtes de la liste réseau du projet (celle que sa
  branche d'intégration déclare). La mission porte `sandbox: true`, et ses arguments de `claude`
  sont ceux d'un cook de la box dont le `--permission-mode bypassPermissions` cède la place à
  `--permission-mode dontAsk --settings <la configuration>` : la station les lance tels quels.
  `cook.launched` porte aussi `sandbox: true`.
- **Réglage sans bac à sable** — ou une station qui n'en dit rien, ou un poste dont la configuration
  ne tient pas (des worktrees là où un cook ne doit rien lire) : **elle ne prend aucun ticket
  ordinaire**. La box l'écrit (`station.sandbox`, avec la raison), le dit dans la sortie du
  runtime quand ça change, et `station` le montre sur sa ligne `tickets ordinaires` (`AUCUN PRIS — bac à sable
  indisponible depuis le … : <raison>`). Les tickets ordinaires partent sur les stations de la box.
- **Dans tous les cas**, les tickets qui demandent ses capacités restent pris comme avant, à nu.

**Un ticket ordinaire ne part sur le Mac que quand la box sature** (#853) : toutes les stations de
la box sont à leur plafond de cooks, ou sa machine n'en peut plus (`station.saturated`) — lu à
l'instant où le Mac réclame. Tant que la box a de la place, elle garde ses tickets ordinaires, même
quand elle monte par paliers après un départ (`ramp`) ou prépare des worktrees. Retenue pour une
autre raison — le « stop », le disjoncteur, une base rouge, sa connexion Max, son quota, un setup
bloqué —, elle ne sature pas, et ses tickets ordinaires l'attendent. Sans station sur la box, le Mac
les prend dès qu'il en a le réglage et le bac à sable. La ligne `tickets ordinaires` de `station` le
dit : `pris quand la box sature, chaque cook dans le bac à sable…`.

L'état se lit aussi dans `facts`, champ `stations` (voir « Les faits, pour un programme ») : c'est
lui que l'app affiche.

**La seule direction est station → box, et c'est gardé.** Une déclaration ne porte aucune adresse ;
dans `runtime/src`, sept modules seulement touchent au réseau, aucun vers une station (l'arbitre et
le serveur d'une livraison sur `127.0.0.1`, la porte et sa sonde, l'API de GitHub) ; aucun programme
qui joint une autre machine n'y est lancé par son nom ; et un tour complet d'une station distante
n'ouvre aucune connexion depuis la box. Les quatre se vérifient dans
`runtime/test/architecture.test.ts` : y ajouter un module qui ouvre une connexion est une décision
d'architecture, pas un import.

**Ce qui n'est pas garanti.** La preuve de travail est ce que la station dit de son worktree : la
box ne le voit pas, elle ne peut que constater qu'une empreinte a changé — comme la mesure des
tours et des jetons, elle vaut la confiance qu'on fait au runner du poste, pas plus. Un cook distant
arrêté par un garde-fou ne livre rien, même s'il avait commité : rien n'est récolté d'un poste que
la box ne joint pas. Et la forme d'identifiants de Claude reconnue dans une livraison distante la
retient de la pass, mais sa branche **est déjà sur l'origine** — c'est la station qui l'y a poussée :
l'issue dit de la supprimer.

| Événement | Sens |
|---|---|
| `remote.asked` | La demande d'une station distante, écrite par son geste : `station`, `verb` (`announce`, `claim`, `renew`, `deliver`), et ce qu'elle porte |
| `remote.answered` | La réponse du runtime, sur le ticket quand elle en concerne un : `ok`, ou `refusal` (`unknown-station`, `not-remote`, `late`, `unknown-run`, `stopped`, `no-progress`, `invalid`), `said`, `stop` |
| `station.present`, `station.absent` | Une station distante s'est manifestée après une absence ; elle ne s'est plus manifestée depuis `presenceMs` (`lastSeen`). Hors ticket |
| `station.sandbox` | Ce qu'une station distante dit du bac à sable de son poste, quand ça change : `available`, `reason` (pourquoi il ne l'est pas, `null` s'il l'est), `version` (son `claude`, `null` s'il ne l'est pas). Hors ticket |
| `ticket.86` | Motif `station-absent: <station>` : seule une station distante absente peut cuisiner ce ticket. Sans heure de retour ; `ticket.released`, motif `station-present`, quand elle revient |

### Les zones de fichiers

**Un fichier, un propriétaire** : deux tickets qui peuvent partir en même temps ne possèdent pas le
même fichier. Un chemin de `zone` possède **le fichier qu'il nomme et tout ce qui est dessous**,
par segments entiers (`runtime/src` ne possède pas `runtime/src2`). Deux zones **se recouvrent**
dès qu'un chemin de l'une égale ou contient un chemin de l'autre. Rien n'est lu sur le disque.

**Les chemins communs** — `BRIGADE_COMMON_PATHS`, facultative — **n'appartiennent à personne** : ils
ne font pas se recouvrir deux zones, et y écrire n'est jamais « hors zone ». Deux livraisons peuvent
s'y télescoper : un conflit, la pass renvoie le cook se mettre à jour ; une régression sans conflit,
les gates la voient sur la fusion (voir « Vert veut dire vert une fois fusionné »).

| Quand | Ce que le runtime fait | Où ça se lit |
|---|---|---|
| **Au découpage** | Deux tickets dont les zones se recouvrent et qui ne s'attendent pas : le code **pose la dépendance** | La fiche (`attend`), le commentaire de découpage, `manager.split` (`overlaps`) |
| **Sur le rail** | Un ticket en attente dont la zone recouvre celle d'un ticket **parti et pas encore servi** est **retenu** | `run rail`, `status` : `zone tenue par #14 (chemin)` |
| **À la récolte** | Un fichier livré hors de la zone du ticket est **signalé**, pas arrêté | `cook.out-of-zone`, et le commentaire de fin de cook |

**La retenue sur le rail** se recalcule à chaque lecture et ne bloque jamais. **Tient sa zone** : un
ticket pris, en pass ou **86** (même refusé avant tout cook : règle-le ou retire-lui `fire`), un
ticket **que la pass a rendu** — jusqu'au merge de sa livraison —, et un cook qui tourne encore, son
ticket fût-il sorti du rail. **Ne tient rien** : un ticket revenu en attente sans avoir rien livré,
un ticket sorti du rail, une livraison mergée (même par toi), un ticket **redécoupé par le manager**
(86 `manager:split`), une fiche **illisible**.

**Le signal « hors zone »** nomme sur l'issue les fichiers livrés hors zone et le ticket du rail qui
possède chacun ; la pass juge la livraison comme une autre. Si l'écart est légitime, élargis la zone
dans la fiche. **La zone qui compte est celle de la prise**, au journal : si la fiche a changé
pendant la cuisson, le commentaire montre les deux zones et le fait porte `cardChanged: true`.

Limites : une PR fermée sans merge tient sa zone tant que son ticket n'est pas repris, servi ou
retiré du rail (voir « Ce qui attend le chef ») ; une PR ouverte hors de tout ticket n'en tient pas.

### Ce qu'un cook charge

**Rien du compte qui fait tourner le service, et rien que le code ne nomme** : le binaire `claude`,
ses outils intégrés, la connexion Max, sa consigne. La liste de ce qu'il charge en plus
(`SOURCES_DE_REGLAGES`, `runtime/src/claude.ts`) est vide.

| Ce qui existe sur la machine | Un cook le charge ? | Coupé par |
|---|---|---|
| Réglages du compte (`~/.claude/settings.json`) et du dépôt servi (`.claude/settings.json`, `settings.local.json`) : plugins, skills, hooks, agents, variables | non | `--setting-sources ""` |
| Skills — du compte et du binaire | non | `--disable-slash-commands` |
| Serveurs MCP — du dépôt, du compte, connecteurs claude.ai | non | `--strict-mcp-config` |
| Mémoire automatique du compte | non | `CLAUDE_CODE_DISABLE_AUTO_MEMORY=1` |
| `CLAUDE.md` du dépôt servi | **pas d'office** — la consigne envoie le cook le lire | part avec la source `project` |
| Connexion Max | oui | — |
| Secrets du projet (`BRIGADE_SECRETS_FILE`) | **ceux que son dépôt déclare**, et aucun autre | voir « Les secrets du projet » |
| Compte GitHub de la machine (`gh`, `git push`) | **oui** sous l'identité unique ; **non** sous une identité par rôle | aucun jeton dans son environnement, `GH_CONFIG_DIR` vide — voir « Une identité GitHub par rôle » |

Donc : **les hooks du dépôt servi ne tournent pas sous un cook**, et un `CLAUDE.md` qui en importe
d'autres (`@fichier`) n'est suivi que si le cook va les lire. Restent hors de portée : les outils et
agents intégrés au binaire, et le transcript que `claude` écrit — sous cloison, celui du projet.

### Le cook ne livre pas, la station récolte

Le cook commite dans son worktree et dit ce qu'il a fait. `git push`, `git merge` et `gh pr merge`
lui sont interdits au lancement — un garde-fou de bonne foi, il tourne en `bypassPermissions`. La
clôture est ailleurs : sous une identité par rôle, le cook ne reçoit **aucun jeton GitHub**, et la
protection de branche ne laisse merger que l'identité de la pass.

| Fin | Reconnue à | Ce que fait la station | Disjoncteur |
|---|---|---|---|
| **fini** | des commits sur la branche — que le cook ait conclu, soit sorti en erreur, ou ait été arrêté par un garde-fou ou son bail | commite ce qu'il a laissé non commité, pousse, ouvre la PR vers la branche d'intégration, met le ticket **en pass**, commente l'issue | réussite |
| **fini, sans diff** | aucun commit, un **livrable délimité** dans son dernier message, et un worktree **intact** | ne pousse rien, pas de PR, ticket **en pass** (`cook.reported`, motif `no-diff`) : le reviewer le juge seul | réussite |
| **échoué** | aucun commit et rien de délimité (`no-deliverable`) ; des fichiers écrits jamais commités (`no-commit`) ; un cook sans commit qui n'a pas conclu ; un worktree qui n'est plus sur sa branche (`off-branch`) ou ne désigne plus son dépôt (gardés, voir « Ce qui reste après un cook ») ; un push impossible | rend le ticket, commente l'issue avec le motif. Ce qu'il avait écrit est commité sur sa branche **locale**, jamais poussée | échec |
| **86** | le flux dit le quota épuisé | ticket **86** jusqu'au retour du quota, plus aucune prise d'ici là | ne compte pas |
| connexion expirée | le flux dit que la machine n'a plus de session | rend le ticket, commente, ne prend plus rien avant « reprendre » | ne compte pas |
| **refusé par le modèle** | `stop_reason: refusal`, sans commit | voir « Quand le modèle refuse » | ne compte pas |
| « stop » du chef | — | rien n'est récolté : retour en attente | ne compte pas |
| **ticket sorti du rail** pendant la cuisson | issue fermée ou `fire` retiré | arrête le cook, ne pousse rien, commente l'issue ; ce qu'il avait écrit est sur sa branche locale | ne compte pas |

Un ticket qui échoue est repris aussitôt par un cook neuf, worktree et branche neufs : c'est le
disjoncteur qui borne la série. **Le worktree part à la fin du cook**, réussi ou non.

**Ce qu'un cook laisse non commité dans une livraison part avec elle**, dans un commit à part au nom
de `brigade` ; le commentaire le dit, et le reviewer est prévenu. Ce que le projet ignore n'y entre
jamais — mais **un fichier neuf qu'il n'ignore pas part dans la PR** (un `.env`, une sortie
d'outil) : le reviewer le tient pour bloquant, la garde est le `.gitignore` du projet.

- **Un cook qui finit, son ticket déjà sorti du rail** : sa branche est poussée, **aucune PR n'est
  ouverte** ; le commentaire donne la commande pour l'ouvrir toi-même.
- **Un ticket que la pass a renvoyé** repart sur la branche de la livraison refusée, dans un
  worktree neuf, avec les findings en consigne ; il livre sur la même PR.
- **Un runtime mort entre l'envoi en pass et le compte-rendu** : au démarrage, la station retrouve
  la PR, relit le flux brut et écrit `cook.reported` (`reconciled: true`). Aucun cook n'est relancé.

**Ce qu'un humain pousse sur la branche d'un cook n'est jamais écrasé** : la station pousse en force
**gardée** (`--force-with-lease`, contre ce qu'elle sait de l'origine).

| Quand un humain a poussé | Ce que fait la station |
|---|---|
| **entre deux cooks** | le cook de renvoi repart de ce que l'origine porte. Une branche que tu as réécrite est adoptée telle quelle |
| entre deux cooks, le clone gardant la récolte jamais poussée d'un cook raté | elle fusionne les deux (commit de merge au nom de `brigade`). **En conflit**, aucun cook : 86 (`worktree-failed`, reproposé dix minutes plus tard), l'alerte nomme la branche et les fichiers — à réconcilier à la main, dans le clone |
| **pendant que le cook travaille** | le push échoue (`push-failed`) ; le travail reste sur la branche locale, et la reprise suivante fusionne |

Le **commentaire** de fin de cook porte sa fin, son calibrage, ses tours, tokens, durée, branche,
PR, puis **ce qu'il a délimité** ; le reste de son message est replié. Tout est au journal
(`cook.reported`), le flux brut dans `runs/<run>.jsonl`.

#### Le livrable se délimite

Le livrable d'un cook est **ce qu'il délimite dans son dernier message, entre `<livrable>` et
`</livrable>`**, et rien d'autre. Avec un diff, c'est son compte-rendu : il part dans le corps de la
PR et le reviewer le lit ; sans diff, c'est le livrable lui-même. Une décision lui manque ? Il le
dit dans ce passage.

| Ce que porte le dernier message | Ce qui est retenu |
|---|---|
| une délimitation fermée ; plusieurs | son contenu ; **la dernière** |
| une ouverture rouverte avant d'être fermée | ce qui suit la **dernière** ouverture |
| une fermeture sans ouverture, une balise qui n'est pas la sienne, une balise **citée** (backticks, bloc de code) | ignorée |
| une ouverture **jamais fermée**, une délimitation vide, aucune délimitation | **aucun livrable** |

Les balises se lisent nues, quelle que soit leur casse. **Sans livrable** : un cook qui a commité
n'est pas en échec, son message est publié tel quel ; un cook **sans commit** a échoué
(`no-deliverable`), et le commentaire dit ce qui manque.

### Quand le modèle refuse

`claude` sort en erreur et son flux finit sur `stop_reason: refusal`. Ce n'est ni une panne ni un
échec : noté à part (`cook.exited`, `outcome: refused`), **le disjoncteur ne le compte pas**. Au
**troisième refus d'affilée** du même lancement, le runtime s'arrête et te le dit sur l'issue, avec
la catégorie du refus quand `claude` la donne.

| Ce que le modèle refuse | Jusqu'à deux refus d'affilée | Au troisième |
|---|---|---|
| le **cook** d'un ticket | retour en attente, commentaire « refusé par le modèle, essai n/3 » | 86, motif `refused`, « Remonté au chef » |
| la **relecture** d'une livraison | retentée au réveil suivant | la pass te remonte le ticket (`unjudged`, cause `review-refused`) : 86, sans merge ni renvoi |
| un **jugement**, un **découpage** ou une **réaction** du manager | retenté au réveil suivant | épinglé comme une réponse illisible (`manager.failed`, `manager.split-failed`, ou une réaction qui remonte) |

À toi alors : reformuler le ticket, le recalibrer, ou le relancer — retirer puis reposer `fire`.

### 86 : le quota est épuisé

Un état normal : le ticket passe 86 jusqu'à l'heure de retour du quota — une heure, si `claude` ne
la donne pas —, puis la station ressert.

### Connexion Max expirée

La station le voit au démarrage (`claude auth status`) et dans le flux d'un cook. Elle l'écrit
(`station.disconnected`), commente le ticket qui l'a subie, et **ne prend plus aucun ticket** ;
`run status` le dit en tête (ligne `connexion` : `ABSENTE` au démarrage, `EXPIRÉE` en route).
**Pour repartir** : `claude /login` sous le compte du service — rien d'autre. Le runtime relit le
fichier d'état du renouvellement à chaque tick : dès qu'un passage **réussi**, sans échec derrière lui,
relève des identifiants **réécrits** après la chute (`renouvele` ou `ecrits` plus récent que
`station.disconnected` — un `verifie` frais n'y suffit pas : le passage réussit aussi sans
réécriture), il écrit
`session.restored`, l'arrêt de connexion se lève, la bande d'alertes et la file ne le disent plus,
et la sortie du runtime dit « connexion Max rétablie à HH:MM, la cuisine a repris ». Compter une
minute. `garde-fous -- resume` reste pour les autres arrêts (« stop » du chef, disjoncteur), et
pour dater une reconnexion qu'aucun renouvellement n'a vue.

Le runtime ne lit jamais les identifiants de `claude`, et **refuse de démarrer** si son
environnement porte `ANTHROPIC_API_KEY`, `ANTHROPIC_AUTH_TOKEN` ou `CLAUDE_CODE_OAUTH_TOKEN`.

Avant qu'elle tombe, la session s'annonce : voir « La session Max : renouvellement et alerte ».

### La session Max : renouvellement et alerte

La session Max se renouvelle **hors cloison**, et le runtime **la suit sans la lire**. Deux
morceaux, qui ne se parlent que par un fichier d'état :

- **Le renouvellement** — `runtime/deploy/brigade-renouvellement`, joué chaque minute par
  `brigade-renouvellement.timer` sous le compte du service, un seul par box. Il lance
  `claude mcp list` hors de toute cloison : `claude` y rafraîchit son jeton s'il expire dans les
  cinq minutes, et réécrit son fichier d'identifiants. Cette commande n'appelle aucun modèle : un
  passage ne coûte rien au quota. Il ne lit jamais le fichier d'identifiants — il en constate la
  date et l'inode par `stat` — et il écrit un seul fichier : `/var/lib/brigade/.session/renouvellement`
  (`BRIGADE_SESSION_STATE`), des lignes `clé=valeur` de dates et de la nature d'un échec, jamais un
  jeton. Sa forme et ses clés sont dans l'en-tête du script.
- **Le suivi** — le runtime relit ce fichier au démarrage, puis à chaque tick, et n'écrit au journal
  que ce qui change (`session.observed`). Un redémarrage qui ne voit rien de neuf n'écrit rien.

**Avec un jeton longue durée** (`BRIGADE_CLAUDE_TOKEN_FILE`), il n'y a plus de renouvellement à
suivre : le runtime ne relit pas le fichier d'état, n'écrit pas `session.observed` ni
`session.restored`, la veille de la station n'en tire aucune perte (`session-refusee`…), et l'alerte
ci-dessous ne sort pas — c'est l'échéance du jeton qui s'annonce. Sans jeton, rien ne change.

**L'alerte.** Quand l'échéance estimée entre dans le préavis, la file du chef la porte, dans
`attend`, avec le geste :

```
attend     …
  session  session Max près de son échéance — <heure> — à faire avant : claude /login sous le compte du service, puis run guardrails -- resume
fin attend
```

ou, si le renouvellement a échoué et que rien ne l'a rattrapé :

```
  session  renouvellement de la session Max en échec (<nature> : <détail>) — <heure> — à rétablir : claude /login …, puis run guardrails -- resume
```

- **L'échéance est estimée**, jamais lue : la vie d'un jeton (`BRIGADE_SESSION_LIFETIME`, défaut
  `28800` s, huit heures) compte depuis la plus récente de trois dates — le dernier renouvellement
  réussi, la dernière écriture des identifiants vue, la dernière reconnexion du chef
  (« reprendre »). L'annonce part `BRIGADE_SESSION_WARNING` avant (défaut `10800` s, trois heures).
  Ce réglage ne peut dépasser la vie du jeton, et la vie ne peut valoir `0` : le démarrage le refuse.
- **Qu'il tourne ou non, l'alerte s'annonce.** Un renouvellement qui a échoué peut revenir, mais
  l'échéance reste l'échéance : la ligne ne sort qu'au renouvellement réussi suivant, qui fait
  repartir l'échéance, ou au « reprendre » du chef. Une session déjà tombée ne reçoit pas de
  seconde annonce : la file dit alors depuis quand, et le geste (« Connexion Max expirée »).
- **Sous une connexion tombée, rien de plus.** Tant qu'une station est déconnectée, la ligne
  `session` ne s'ajoute pas : `connexion` la porte.

**Ce que ça ne fait pas, et ses limites.**

- **Sans le fichier d'état, rien ne s'annonce** — ni le timer n'est installé, ni il n'a encore fait
  de passage, ni le fichier est illisible (`file` : `absent` ou `unreadable` dans `session.observed`).
  L'échéance ne se devine plus alors que d'une reconnexion du chef. C'est le cas de toute box où le
  timer n'a pas été posé : le geste 5 de l'installation copie ses deux unités avec le reste, et
  `sudo systemctl enable --now brigade-renouvellement.timer` le démarre. Le paquet de la station
  porte le sien, qu'il active seul. « Vérifier » en affiche l'état sur une ligne.
- **Le renouvellement ne répare que ce que `claude` peut rafraîchir.** Si Anthropic refuse le
  renouvellement (`session-refusee`) ou si le jeton est mort sans avoir été renouvelé
  (`non-renouvele`), rien ne le relève : seul `claude /login` sous le compte du service repart.
- **L'alerte ne vaut que pour cette box et ce compte.** Un seul fichier par box, une seule session
  Max : la connexion du compte, pas celle d'un projet.
- **Le renouvellement ne tourne que si l'unité tourne.** Sa vivacité (un passage dans les dix
  dernières minutes, `live`) s'affiche dans `session.observed` ; le runtime ne s'arrête pas pour
  autant.
- **L'annonce n'arrête rien.** La cuisine ne s'arrête que sur le « stop » du chef, le disjoncteur,
  ou une connexion tombée.

**Les garde-fous, inchangés.** Rien de ceci ne desserre ce qui protège les identifiants :

- Le runtime n'ouvre jamais `.credentials.json` (un test le garde sur `runtime/src`) ; il ne lit que
  le fichier d'état.
- Le renouvellement n'écrit que son fichier d'état, lance `claude` dans un environnement vidé, et
  n'expose aucune clé ni jeton au service.
- Sous cloison, les cooks, reviewers, juges et gates voient toujours les identifiants en lecture
  seule (« La cloison ») ; le renouvellement est le seul à les réécrire, hors cloison.
- Le « stop », le disjoncteur et la pass ne changent pas.
- Le `claude /login` reste **manuel** : il passe par un navigateur et un humain. Ni le renouvellement
  ni le runtime ne le lancent, et l'alerte ne fait que le demander.

**Le lire.**

```
cat /var/lib/brigade/.session/renouvellement           # ce que le dernier passage a constaté
journalctl -u brigade-renouvellement.service            # un passage, un échec : une ligne chacun
npm --prefix runtime run status                         # le bloc attend : la ligne session, s'il y en a une
npm --prefix runtime run log                        # session.observed, quand ce qui est lu a changé
```

Un renouvellement qui échoue en boucle se reconnaît à `echec` plus récent que `verifie` dans le
fichier : la nature et le détail y sont, sans rien de la valeur.

### L'échéance du jeton longue durée

Le jeton que `claude setup-token` a créé à l'installation (`BRIGADE_CLAUDE_TOKEN_FILE`) **vit un
an** (365 jours, `VIE_DU_JETON_JOURS` dans `runtime/src/evenements/jeton.ts`, le seul endroit qui
le sait). L'étape de connexion Max range la date de sa création à côté de lui
(`<fichier>.cree`, par exemple `/etc/brigade/claude-token.cree`) — une date ISO 8601, sans le
jeton. Le runtime la relit au démarrage puis à chaque tick, et n'écrit au journal que ce qui
change (`token.observed`) : ni un passage ni un redémarrage qui ne voient rien de neuf n'écrivent
rien.

**L'alerte.** Trente jours avant l'échéance (`PREAVIS_DU_JETON_JOURS`), la file du chef porte
une ligne, une seule, qui se compte depuis l'ouverture du préavis :

```
  jeton  depuis 5 j  jeton de la connexion Max près de son échéance — il échoit le <date>, 365 jours après sa création (<date>) — à faire avant : refaire le jeton — `claude setup-token` sous le compte du service : supprimer <fichier>, puis relancer l'étape de connexion Max (docs/installation-station.md, « 5. Le jeton de la connexion Max ») ; la station relit le jeton neuf et sa date
```

Passé l'échéance, elle dit `jeton de la connexion Max ÉCHU depuis le <date>`, et se compte depuis
l'échéance. Si la date ne se lit pas — absente (un jeton rangé à la main), illisible, ou qui n'est
pas une date —, elle le dit (`date de création du jeton … absente`, `illisible`, `qui ne se lit
pas comme une date`) : l'échéance est alors inconnue, le geste est le même. Rien de ce que le
fichier porte d'autre qu'une date n'est gardé, et ni la ligne ni le journal ne citent le jeton :
ils nomment son fichier. Elle sort quand le jeton refait porte une date neuve. Sans
`BRIGADE_CLAUDE_TOKEN_FILE`, rien ne s'annonce. L'annonce n'arrête rien.

### Révoquer la connexion Max

**Quand** : dès que tu crois que les identifiants du compte ont quitté la machine — un
`.credentials.json` ou un jeton `sk-ant-…` vu dans une PR, une branche, un commentaire ; une
consommation inexpliquée. Un refus `credentials-committed` ou un masquage seuls ne sont pas une
fuite. Dans le doute, révoque — **chez Anthropic, depuis un navigateur** connecté au compte Max :

1. **Arrête de servir** : `garde-fous -- stop`.
2. **<https://claude.ai/settings/claude-code>** : retire **toutes** les autorisations de Claude Code.
3. **<https://claude.ai/settings/account>** : déconnecte toutes les sessions ; change le mot de passe.
4. **Vérifie**, sur la box : `sudo -u <compte> claude auth status` ne doit plus répondre
   `"loggedIn": true`, et `sudo -u <compte> claude -p "ok"` doit échouer en demandant `/login`. S'il
   répond encore, écris au support d'Anthropic et laisse la station suspendue.
5. **Reconnecte** : `claude /login` sous le compte du service, puis `garde-fous -- reprendre`.

`claude /logout` sur la box ne suffit pas. Si le jeton a été **poussé sur GitHub**, révoque d'abord,
puis ferme la PR et supprime la branche.

### Voir la station

```bash
npm --prefix runtime run station                 # la voir
npm --prefix runtime run station -- cooks 12     # régler son plafond de cooks (0 : aucune limite)
```

Elle montre le plafond, la machine — ou, pour une station distante, sa **présence** et ce qu'elle fait des **tickets ordinaires** —, la connexion Max, le quota, la `retenue`, les cooks en cours
avec leur calibrage, les dix derniers finis, et **`consommé`** — tout ce que le projet a lancé,
cooks, relectures et jugements : ce qui tourne, les **5 dernières heures** (la fenêtre du quota
Max, à comparer à `/usage` en ordre de grandeur) et les **24 dernières heures**.
Cette consommation est celle de **ce que le projet a lancé**, pas celle du compte : le runtime ne
voit ni les sessions du chef ni rien d'autre qui puise dans le même abonnement. `/usage`, dans une
session, reste la mesure de vérité du compte ; le runtime ne la remplace pas.

| Événement | Sens |
|---|---|
| `station.announced` | Une station que le projet déclare se présente : moteur, ce qu'elle fournit, plafond de cooks déclaré, `remote: true` si elle est distante, et `ordinary: true` si elle prend aussi les tickets ordinaires (hors ticket) |
| `station.withdrawn` | Le projet ne déclare plus cette station : elle sort de `status` et de `station` (hors ticket) |
| `stations.undeclared` | Le projet ne déclare aucune station : aucun cook ne part. Écrit une fois, par le runtime ; la première annonce l'efface (hors ticket) |
| `station.capped` | Le chef a réglé le plafond de cooks : `maxCooks`, `0` pour aucune limite (hors ticket) |
| `station.saturated`, `station.relieved` | La machine n'en peut plus (`resource` : `cpu`, `memory`, `disk` ; `observed`, `limit`), puis respire (hors ticket) |
| `station.held`, `station.released` | Un ticket pourrait partir et n'est pas pris (`reason`, voir « Plusieurs cooks à la fois ») ; plus rien ne retient (hors ticket) |
| `station.unarbitrated`, `station.arbitrated` | L'arbitre ne répond plus : mode dégradé, un cook à la fois, chaque `cook.launched` porte `unarbitrated: true` ; puis il répond de nouveau (hors ticket) |
| `station.86` | Le quota est épuisé jusqu'à `until` (hors ticket) |
| `station.disconnected` | La connexion Max a expiré |
| `cook.stalled` | La moitié du bail est passée sans progrès (`idleMs`, `leaseMs`). Un signal |
| `ticket.86` | Motifs de la station : `no-calibration`, `unreadable-card`, `refused` (sans heure de retour) ; `setup-failed`, `ticket-unreadable`, `secrets-unavailable`, `worktree-failed` (retour à `until`) |
| `setup.failed` | Pourquoi le setup a échoué : `why`, et `hosts`, ce que la porte a refusé. Écrit à chaque échec ; c'est ce qui décide du commentaire sur l'issue |
| `setup.blocked`, `setup.unblocked` | Le setup a échoué comme le précédent du projet : `why`, `hosts`, et `base`, le commit de la branche d'intégration d'où le worktree était parti — plus aucun setup n'est lancé ; puis la branche a bougé (`base` : là où elle est), les setups reprennent |
| `aside.failed`, `aside.blocked`, `aside.unblocked` | Une cause de mise de côté (`worktree-failed`, `ticket-unreadable`, `secrets-unavailable`) : `reason` à chaque fois ; deux fois de suite sans cook entre les deux, le projet est bloqué (`base` : la base vue) ; levé par un cook parti, une autre cause, ou la base qui bouge (`why`) |
| `secrets.unavailable` | `problems` : des noms de variables et de fichiers, **jamais une valeur** |
| `cook.reported` | Le compte-rendu d'un cook. `ending` : `done`, `failed`, `86`, `disconnected`, `refused` ; `reason` (`no-commit`, `no-diff`, `no-deliverable`, `guard:idle`, `guard:lease`, `harvested:…`, ``secret-committed: `NOM` ``, `credentials-committed: name` ou `shape` — rien n'est poussé…) ; `summary` : son dernier message, secrets et identifiants masqués ; `deliverable` : ce qu'il a délimité, ou `null` ; `pr` ; `reconciled` |
| `cook.out-of-zone` | La livraison confrontée à la zone de la prise : `zone`, `files` (`path`, `owners`), `cardChanged`. Un signal ; jamais écrit pour un ticket pris sans zone |

## Une station par machine : sa présence sur GitHub, et son appairage par un code

*Spec : [la station refaite de zéro](superpowers/specs/2026-10-15-station-refonte-design.md) (#794).*

La station d'une machine (`runtime/src/station/main.ts`, un seul process pour tous ses projets)
n'a **aucune liaison directe** avec l'app du chef : elle n'ouvre aucun port, et l'app ne la joint
jamais. Tout passe par **GitHub**, où elle écrit son état — dans un **gist secret** du compte du
`gh` de la machine, qui doit être celui du chef (`runtime/src/appairage/`).

- **Au premier démarrage**, elle crée son gist, y publie l'**empreinte** d'un code neuf — jamais le
  code lui-même —, et affiche le code dans son journal de service :
  `brigade : station à appairer — tape ce code dans l'app : 7KQ2-M9XD (valable jusqu'à 14:32)`.
  Huit signes de l'alphabet de Crockford (ni I, ni L, ni O, ni U), valables un quart d'heure ; échu,
  elle en tire un autre et le dit, et l'empreinte de l'ancien reste publiée comme échue — l'app dit
  alors « expiré », pas « inconnu ».
- **Le chef tape le code dans l'app** (« Tous les projets », [docs/app.md](app.md)) : l'app trouve le
  gist qui publie cette empreinte et y écrit `brigade-appairage.json`. La station l'y lit à son
  signe de vie suivant, et n'affiche plus de code (`brigade : station appairée à l'app`).
- **Chaque minute**, elle regarde si son état a changé (sans appel GitHub), et ne réécrit
  `brigade-station.json` — son nom, sa machine, sa version, les projets qu'elle sert, son dernier
  signe de vie — que sur changement, ou en battement toutes les 5 minutes. Deux écritures, y
  compris celle que la station demande après l'écriture d'un projet, sont distantes d'au moins
  60 s : une demande trop proche est retenue, puis écrite à l'échéance. **Arrêtée** (SIGTERM), elle
  y écrit tout de suite l'heure de son arrêt — la seule écriture que l'écart de 60 s ne retient
  pas : l'état final ne se perd pas. Elle publie `cadenceMs` = 285 s ; l'app la dit hors ligne
  après 2 × `cadenceMs` + 30 s, soit 10 min au plus (`app/src/stations/stations.ts`).
- **Ses pannes y vont aussi** (`appairage/etats.ts`, #798) : `miseAJour`, sa dernière mise à jour
  quand elle a raté et qu'elle est revenue en arrière (version visée, version restaurée, l'heure,
  et si le retour a raté lui aussi — lue dans `BRIGADE_MISE_A_JOUR_DIR`), et `connexionMax`,
  l'état de sa connexion Max et depuis quand. Ni le motif d'un échec, ni la raison d'une perte,
  ni un geste : l'app en fait chacune une ligne et un bouton ([docs/app.md](app.md)). Une lecture
  qui lève ne prive pas la station de son signe de vie : elle publie alors ces deux champs nuls.
- Ce qu'elle garde d'une fois sur l'autre — son gist, son code, son appairage — est dans
  `<BRIGADE_STATION_DIR>/appairage.json`. **Un gist supprimé** sur GitHub la remet à zéro : un
  gist neuf, un code neuf, un appairage à refaire. **GitHub muet** : la panne est dite une fois,
  son retour aussi, et elle réessaie à chaque minute.

Trois réglages, tous facultatifs : `BRIGADE_GH_BIN` (le `gh` de la machine, `gh` à défaut),
`BRIGADE_STATION_NOM` (son nom sur la home — à défaut, celui de la machine), et
`BRIGADE_STATION_VERSION` (la version qu'elle annonce — posée par son paquet ; à défaut,
l'empreinte de son code, `code 1a2b3c4d5e6f`).

**Le délai de détection** d'un arrêt brutal (la station tuée sans préavis) se lit donc entre 5 et
10 min : son dernier signe de vie date de 5 min au plus, au battement, et l'app la dit hors ligne
2 × 285 s + 30 s après ce signe.

## Le budget d'appels à GitHub, et l'attente de limite

*Code : `runtime/src/limite-github.ts` (#873, #874).*

Chaque appel de la station et de ses projets à GitHub — le sondage des issues (`github.ts`), le
canal du gist (`appairage/canal.ts`) — prend un jeton du budget avant que `gh` ne parte.

- **Le budget** : **2 500 appels par heure glissante**, soit la moitié de la limite du compte
  (5 000 par heure). Un appel refusé ne part pas et n'est pas compté ; l'appelant échoue comme sur
  une panne de GitHub, et son tour suivant le rattrape. Le message dit quand le prochain appel se
  libère : `budget GitHub épuisé : 2500 appels sur l'heure glissante, appel refusé — le prochain se
  libère dans N s`.
- **Partagé, pas découpé.** Le compteur est une base SQLite dans le répertoire de la station,
  `<BRIGADE_STATION_DIR>/appels-github/compteur.db`. La station et chacun de ses projets la tiennent
  ensemble, comme un runtime ou une commande lancés avec son environnement : une transaction tranche
  entre deux process qui prennent le dernier appel au même instant. Un process hors de toute station
  (le poste de dev, un test) compte seul, en mémoire, sous le même budget.
- **Plus de trois projets** : rien à régler. Le budget n'est pas réparti entre les projets : un
  projet qui sonde beaucoup prend ce qu'un autre ne dépense pas, et le plafond tient quel que soit
  leur nombre. Ce qui grossit avec les projets, c'est la consommation : chacun ajoute ses sondages
  au même compte.
- **Le régler** : il n'y a **pas de variable d'environnement**. Le plafond est la constante
  `BUDGET_PAR_HEURE` de `runtime/src/limite-github.ts` (la fenêtre, `FENETRE_MS`, est d'une heure) ;
  il se change dans le code, et se vérifie avec les tests de `runtime/test/limite-github.test.ts`.
- **La ligne horaire** : une fois par heure, depuis le démarrage de la station, son journal de
  service écrit `brigade : N appels GitHub sur l'heure écoulée`, N étant le compte de la dernière
  heure, tous process confondus. Si la lecture du compteur échoue, la ligne le dit à la place :
  `brigade : appels GitHub de l'heure écoulée non comptés — <erreur>`.
- **La limite de GitHub atteinte** (son 429, ou son 403 « rate limit ») n'est pas un refus comme
  un autre : un 403 d'un merge interdit, lui, reste un refus. La station cesse alors tout appel
  et pose une pause sur le compteur, partagée par tous ses process, jusqu'à la fin de la fenêtre.
  Elle la lit dans `retry-after`, sinon `x-ratelimit-reset`, sinon `gh api rate_limit`, sinon 60 s.
  Pendant la pause, aucun appel ne part et rien n'est compté. Le journal de service le dit une
  fois : `brigade : station — GitHub a atteint sa limite d'appels : plus aucun appel ne part avant
  la fin de la fenêtre, puis ils reprennent seuls`.
- **La reprise** est automatique : à la fin de la pause, les appels reprennent sans geste. Pendant
  l'attente, la station n'écrit pas son état sur GitHub, et l'app la dit hors ligne au bout de
  2 × `cadenceMs` + 30 s, le temps que la fenêtre se ferme.

## Ajouter un projet à une station depuis l'app, sans terminal

*Spec : [la station refaite de zéro](superpowers/specs/2026-10-15-station-refonte-design.md) (#795).*

Un projet n'est qu'une ligne de la configuration de la station. Le chef l'ajoute depuis l'app
([docs/app.md](app.md), « Ajouter un projet à tes stations ») ; l'app écrit sa demande dans le gist
de chaque station qu'il a choisie, et la station l'y lit — toujours sans liaison directe
(`runtime/src/projets/`).

- **Ce que l'app écrit** : `brigade-projets.json` — par projet, son nom (tiré du dépôt), son dépôt,
  sa branche d'intégration, si cette station en est la **principale** (celle qui fait tourner son
  manager et sa pass), son plafond de cooks et le calibrage du manager et du reviewer, choisis par
  le chef dans le parcours.
- **Toutes les trente secondes** (ou sur `SIGHUP`), une station appairée relit cette demande. Pour
  chaque projet dont elle est la principale :
  1. **ses Apps GitHub** (`BRIGADE_GITHUB_APPS_DIR`, s'il est posé) doivent être installées sur le
     dépôt ; sinon elle publie, pour chaque App, la page où le chef l'installe en un clic
     (`https://github.com/apps/<app>/installations/new`), et attend. Sans Apps, elle agit sous le
     compte de son `gh` : rien à autoriser ;
  2. elle **clone** le dépôt par son `gh` (`gh repo clone`) dans `<BRIGADE_STATION_DIR>/clones/<projet>` ;
  3. elle **pose au journal du projet** les décisions du parcours, sous le nom du chef —
     `BRIGADE_STATIONS` (`<station>/claude:<cooks>:code+raisonnement`), le calibrage du manager et
     du reviewer —, seulement celles qui n'y sont pas déjà : une décision changée depuis n'est pas
     écrasée ;
  4. elle **ouvre sur GitHub le premier ticket du projet**, « Préparer le dépôt » — voir plus bas ;
  5. elle écrit sa **ligne** (`<projet> <dépôt> <branche>`) dans sa configuration, dans un bloc
     qu'elle tient seule, entre deux commentaires — les lignes écrites à la main, hors du bloc, ne
     sont jamais touchées ; un projet qui y a déjà une ligne à la main la garde, et le suivi le dit.
     Elle relit aussitôt sa configuration et publie sa présence : le projet est dans sa liste sur la
     home (« 1 project »).
- **Ce qu'elle en dit** : `brigade-projets-suivi.json`, réécrit quand il change — par projet, `servi`
  (et depuis quand), `a-autoriser` (avec ses pages), `en-preparation`, `refuse` (et pourquoi : clone
  raté, ligne à la main, refus de la station) ou `secondaire`.
- **Retiré depuis l'app**, le projet quitte la demande : la station retire sa ligne du bloc et ne le
  sert plus. Son état et son clone restent sur la machine.
- **Une station qui n'est pas la principale** d'un projet ne lui écrit aucune ligne et le dit
  `secondaire` : faire cuire une station secondaire viendra avec la station de bureau (#797).

### Le premier ticket : préparer le dépôt

*Ticket #796.* Avant d'écrire la ligne d'un projet ajouté depuis l'app, la station ouvre sur son
dépôt, par son `gh`, l'issue « Préparer le dépôt : gates, setup de worktree, sites autorisés »
(`runtime/src/preparation-depot/`). Elle porte `fire`, `model:opus` et `effort:high` : elle entre
sur le rail comme n'importe quel ticket, et un cook la cuit. Son corps dit au cook :

- **quoi livrer** : `.claude/brigade/gates.sh`, `.claude/brigade/worktree-setup.sh` et
  `.claude/brigade/reseau` (les sites que le projet a le droit de joindre), chacun avec son contrat
  et ce que la branche d'intégration en porte déjà (« absent : à écrire », « déjà sur `main` : à
  éprouver ») ;
- **où l'éprouver** : sur la station qui le cuit — celle qui servira le projet —, pas sur un poste de
  dev : le setup s'exécute dans son worktree, les gates y passent ;
- **les critères observables** : gates vertes sur la station, setup exécuté dans un worktree neuf,
  liste de sites présente, et, dans le compte-rendu, ce qui a été lancé et ce qui en est sorti.

Son numéro est gardé dans l'état du projet (`<état>/preparation-depot.json`) : la station ne l'ouvre
qu'une fois, même si le projet est retiré puis rajouté ; créé sans avoir pu être noté, elle le
retrouve parmi les issues ouvertes par son marqueur (`<!-- brigade:preparation-depot -->`), s'il a
été posé par quelqu'un qui a la main sur le dépôt. GitHub muet : la ligne n'est pas écrite, le suivi
dit `en-preparation`, et la station réessaie à la cadence suivante.

**Tant qu'il n'est pas servi, la cuisine du projet ne prend que lui** — la même restriction que
celle d'une base rouge, qui ne laisse partir que sa réparation, et que les stations distantes
subissent comme celles d'ici. Le journal de service le dit une fois : `le rail attend #<n>
(préparer le dépôt) — aucun autre ticket ne part avant son merge`. **Une fois servi, le rail
démarre seul** (`#<n> (préparer le dépôt) est servi — le rail démarre`). Fermé par le chef ou
disparu, il libère aussi le rail ; son label `fire` retiré, il le retient encore. Un projet écrit
à la main dans la configuration, ou ajouté avant ce ticket, n'a pas de ticket de préparation : son
rail est celui de toujours.

La recette (`runtime/test/projets/recette.test.ts`) mesure, sur une vraie station de test, le temps
entre l'ouverture du parcours et le projet publié dans la liste de la station : la spec le borne à
dix minutes ; la station y met au plus sa cadence, trente secondes, plus le clone.

## Regarder une livraison d'interface dans mon navigateur

Une livraison qui touche l'interface d'un projet peut être regardée dans le navigateur du poste
avant de dire oui ou non. Le parcours tient en quatre gestes et un arrêt : déclarer, servir, ouvrir,
dire, et le serveur s'arrête tout seul. Il ne sert qu'à regarder : **le verdict se donne sur
l'issue du ticket, et ce parcours ne bloque pas le merge** (voir #399, T3).

### Déclarer comment le projet se sert

Le dépôt du projet porte, à côté de son `worktree-setup.sh`, un fichier `.claude/brigade/service`
(`runtime/src/service.ts`). Des lignes « clé : valeur » ; une ligne vide ou qui commence par `#` ne
compte pas, toute autre ligne est un problème dit :

```
commande : python3 -m http.server "$BRIGADE_PORT" --bind 127.0.0.1 --directory app
interface : app/src/vue
```

- **`commande`** — une seule. Une ligne de shell, lancée à la racine du worktree, dans
  l'environnement que rend le setup. Elle écoute sur `$BRIGADE_PORT` et sur la boucle locale, et
  tourne jusqu'à ce qu'on l'arrête. Aucun port ne s'écrit dans le fichier.
- **`interface`** — une ligne par chemin du dépôt, relatif à sa racine : un fichier, ou un dossier et
  tout ce qu'il contient. Pas de motif (`*`, `?`). Une livraison dont le diff touche l'un de ces
  chemins touche l'interface : c'est elle qu'on sert. `.` n'est pas un chemin d'interface.

Sans ce fichier, le runtime le dit — « ce projet ne déclare pas comment il est servi » — et ne sert
rien : aucune commande n'est devinée. Un projet qui ne déclare rien n'a rien de cassé ; le motif se
lit dans `station` et `status`.

### Servir

Quand un cook livre un commit poussé qui touche un chemin `interface`, le runtime lance la commande
**dans le worktree de ce cook**, sur **le port de ce worktree** : `BRIGADE_PORT`, que le setup pose
à `20000 + <n° d'issue>`. Deux worktrees ont deux ports et ne se croisent pas ; le runtime n'en
choisit jamais un autre. La commande part dans la même cloison que le cook, et dans son propre
groupe de process.

- `station` et `status` listent chaque serveur : son ticket, son worktree, son port, `starting`
  (le port ne répond pas encore) ou `listening`, et la page de l'écran à regarder —
  `http://127.0.0.1:<port><route>`, jamais la racine — ou pourquoi il n'y en a aucune.
- Sous chaque serveur, plus en retrait, `status` dit l'écran et qui l'a dit, puis la phrase du cook :

  ```
    #591  worktrees/591-ab12cd34  port 20591  écoute depuis 3 min  cook/591-ab12cd34  http://127.0.0.1:20591/rail
      écran : /rail (déclaré par le cook)
      à regarder : #591 : le rail a maintenant deux colonnes, TODO et WAITING
  ```

  Un écran que le cook n'a pas déclaré, déduit des fichiers touchés, le dit :
  `écran : /rail (écran déduit des fichiers touchés, pas déclaré par le cook)`. Sans écran, rien
  dessous. Les livraisons d'une app qui ne s'ouvre pas dans un navigateur, sous `à lancer`, portent
  les mêmes lignes.
- Une livraison sans interface ne lance rien. Ce qui empêche de servir — projet non déclaré,
  worktree sans port, déclaration illisible — est dit à la place, une fois, et se lit dans les
  mêmes deux commandes.

### Ouvrir

Sur la carte du ticket, l'app pose ce que `status` dit de sa livraison : l'écran à regarder, la
phrase du cook — c'est elle qu'on te montre —, et, quand l'écran est déduit, la mention « écran
déduit des fichiers touchés, pas déclaré par le cook ». Jamais une liste de fichiers. Puis un geste,
**seulement s'il y a une page à voir** et que le serveur **écoute** : **see it in my browser**. L'app
ouvre un transfert de port vers ta box par le `ssh` qu'elle a déjà (`ssh -N -L`, vers le même hôte,
sans aucune commande après l'hôte), puis ouvre, avec la commande d'ouverture du poste, l'adresse
locale suivie de la route de l'écran — **jamais la racine du worktree**, qu'un serveur de fichiers
rend en liste de dossier. Rien n'est lancé sur la box pour cela : le serveur tourne déjà depuis le
worktree.

Sans écran, ou sans page pour lui (un écran qui n'est pas une route, une ligne qui n'écrit que la
racine ou rien) : pas de bouton du tout, et ce que `status` écrit à sa place se lit sur la carte.
Pour une app qui ne s'ouvre pas dans un navigateur (`lancement`, comme `brigade`) : pas de bouton,
et la carte dit comment voir l'écran — la commande qui lance l'app sur le worktree de la livraison,
et l'écran à y ouvrir. Sans serveur, projet non déclaré, serveur qui démarre, runtime mort ou
`status` non lu : pas de geste, et la raison est écrite à sa place. Le transfert se ferme dès qu'une lecture de `status` ne
montre plus son serveur, quand son projet quitte l'app, et quand l'app se ferme.

L'app rappelle, à côté du geste : elle ouvre la page, elle ne la montre pas et ne recueille aucun
avis. **Ton oui ou ton non se dit sur l'issue du ticket** — son numéro l'ouvre, sur le rail.

### Dire

Le verdict est posé sur l'issue du ticket, et c'est elle qui fait foi, pas le navigateur. Ni l'app
ni le runtime n'enregistrent de oui ou de non pour cette page : ne pas attendre d'un geste de l'app
qu'il valide ou refuse la livraison.

### Arrêter

Personne n'a à arrêter le serveur. Il s'arrête seul, et son worktree se range avec lui, dès que :

- le ticket est **servi**, ou a **quitté le rail** ;
- un cook **reprend** le ticket, dans un worktree neuf (le serveur de l'ancien s'arrête d'abord) ;
- son worktree se range par ailleurs, ou n'existe plus ;
- sa commande **sort d'elle-même** (un port pris, une commande qui ne sert rien) : le journal garde
  ce qu'elle a dit ;
- le runtime s'en va : aucun serveur ne survit à son runtime, et une vie qui commence n'en hérite
  d'aucun.

Un serveur qui tient son worktree empêche de le ranger : il ne se range qu'une fois arrêté. Chaque
arrêt s'écrit au journal, avec sa raison (`service.stopped`).

### Ce que ce parcours ne fait pas

Trois exclusions, à ne pas attendre de lui :

- **Ce n'est pas une préproduction.** Rien n'est déployé : le serveur est celui d'un worktree, lancé
  depuis la livraison, et il s'arrête avec elle.
- **Le cook ne pilote pas de navigateur connecté.** Il ne regarde pas la page et n'en fait aucune
  capture : c'est toi qui regardes.
- **Aucune validation ne se fait dans l'app.** Ni bouton oui ou non, ni verdict enregistré : le
  verdict se dit sur l'issue.

## Le manager

Le manager décide **ce qui entre sur le rail, et le calibre**. Allumé, le chef pose une issue en
langage produit, sans aucun label : le manager pose `fire`, `model:` et `effort:` et dit pourquoi —
ou dit, en commentaire, pourquoi ce n'est pas un ticket exécutable. Une **épique**, il la
**découpe** (voir « Il découpe les épiques ») ; un ticket qui **échoue en pass**, il en fait quelque
chose plutôt que de te le remonter tel quel (voir « Il réagit à un échec »).

**Il est éteint tant que tu ne l'as pas allumé**, et s'allume sans redémarrer (des faits au
journal). Éteint pendant un jugement, il le laisse finir mais ne pose rien : la décision se pose
sans rejuger quand tu le rallumes.

```bash
npm --prefix runtime run manager                # l'interrupteur, ses quinze dernières décisions, ce qu'il a écarté, les épiques, ses réactions aux échecs
npm --prefix runtime run manager -- on
npm --prefix runtime run manager -- off
npm --prefix runtime run manager -- return 77   # lui rendre une issue qu'il a écartée parce que tu y as retiré un de ses labels
npm --prefix runtime run manager -- backlog     # ce qu'allumer engage : combien d'issues sont ouvertes, et combien portent blocked-on-human
npm --prefix runtime run manager -- upstream    # ce qui n'est pas encore sur le rail : chaque issue ouverte qu'il ne porte pas, et ce qui lui arrive — pour l'app
```

⚠️ **Allumé, il juge tout le backlog ouvert**, et ce qu'il juge exécutable part aussitôt en cuisine.
Avant d'allumer, pose `blocked-on-human` sur ce qui ne doit pas partir : une issue qui le porte
n'est jamais jugée, **une épique qui le porte n'est jamais découpée**. Entre deux issues que tu as
écrites toi-même, il ne pose pas de dépendances : elles partent dans l'ordre de service, sauf si tu
écris `attend` dans la fiche de l'une. Entre les tickets d'une épique qu'il découpe, il les pose.

**Avant d'allumer, compte.** `manager -- backlog` dit en une ligne ce que l'allumage engage :

```
backlog               12 issues ouvertes, dont 3 portent `blocked-on-human` — lu à l'instant sur GitHub (benomite/brigade)
```

C'est **une lecture, et rien d'autre** : un `GET` sur la liste des issues ouvertes du dépôt — celle
que le manager sonde, PR écartées —, sous le `gh` du compte du service, comme `installation`. Elle
ne pose aucun label, n'écrit rien au journal et ne le lit pas : elle répond que le manager soit
allumé ou non, que le runtime tourne ou non. Le second nombre compte les issues qui portent
`blocked-on-human` : celles-là ne seront jamais jugées. Le premier n'est pas « ce qui partira » —
une issue déjà lancée, une `question`, la roadmap sont ouvertes aussi, et le manager n'en fait rien
(le tableau ci-dessous) : c'est ce qu'il **regardera**. Les deux nombres sont écrits en chiffres
nus, en tête de leur mot : l'app les lit là, au geste « allumer » (`docs/app.md`, « L'onglet
Manager »). GitHub pas joint, la commande sort en `1` et le dit, sans aucun nombre — ce n'est pas
« aucune issue ».

### En amont du rail

**Un rail vide ne veut pas dire un projet fini.** Le rail ne porte que ce qui a `fire` ; en amont,
il y a les issues que le manager n'a pas encore lues, les épiques pas encore découpées, celles qu'il
a écartées, celles qui attendent ta réponse, celles qui ont quitté le rail. `manager -- upstream`
les liste toutes, pour un programme — l'app en tire le nombre « N upcoming » posé à côté du rail
(`docs/app.md`, « Ce qui n'est pas encore sur le rail ») :

```json
{"lu":"2026-10-15T09:12:03.000Z","depot":"benomite/brigade","issues":[{"ticket":16,"titre":"…","url":"https://github.com/benomite/brigade/issues/16","priorite":1,"etat":"epique","dit":"elle porte `epic` : pas encore découpée"}]}
```

Un seul objet JSON, sur une ligne. `lu` : l'heure de la lecture, à l'horloge de la box. `issues` :
**chaque issue ouverte du dépôt que le rail ne porte pas**, PR écartées — la liste que le manager
sonde, lue à l'instant sous le `gh` du compte du service, comme `backlog` —, dans l'ordre où il les
lit : `prio:1` d'abord, sans `prio:` en dernier, la plus ancienne d'abord à priorité égale.
`priorite` : celle de son label `prio:`, `null` sans. `dit` : ce que la box en dit, en une ligne.
`etat` : ce qui lui arrive, un mot d'une liste fermée — le premier qui vaut, dans cet ordre :

| `etat` | L'issue… | D'après |
|---|---|---|
| `attend` | attend ta réponse : elle est dans le bloc `attend` de `status`, comme dans T'attend | les attentes du manager |
| `en-route` | va entrer sur le rail : elle porte `fire`, le manager l'y a mise sans que `fire` y soit encore, ou elle est née d'un découpage | ses labels, le journal |
| `sortie` | a quitté le rail sans être servie (`fire` retiré, `hors-cuisine` posé), et rien ne s'est décidé d'elle depuis | le journal |
| `servie` | a été servie, et son issue est encore ouverte | le journal |
| `decoupee` | est une épique découpée : ses tickets portent le travail — `dit` dit combien sont servis | les découpages |
| `epique` | est une épique pas encore découpée — jugée telle, ou qui porte `epic` —, ou dont le découpage est en cours | le journal, ses labels |
| `ecartee` | a été écartée par le manager — refusée, ou retenue par un label —, avec sa raison en une ligne | les décisions du manager |
| `non-lue` | n'a pas encore été jugée, ou lui a été rendue et n'a pas été rejugée | le journal |

Ce que le rail a fait d'une issue (sortie, servie) ne vaut que s'il est plus récent que ce que le
manager en a décidé. **Rien d'autre n'y est déduit** : ni le corps de l'issue, ni ses
commentaires. C'est **une lecture** : un `GET` sur GitHub, puis le journal ouvert en lecture seule ;
rien n'y est écrit, aucun label n'est posé. Elle répond que le manager soit allumé ou non. GitHub
pas joint, ou un journal qui n'a pas encore l'état du manager, elle sort en `1` et le dit, sans
rien lister — ce n'est pas « rien en amont ».

### Ce que le code tranche, et ce que le LLM juge

Sa boucle est du code. À chaque réveil il relit **une** liste — les issues ouvertes du dépôt, sous
son propre ETag — et la trie sans rien dépenser :

| L'issue… | Ce que le manager en fait | Au journal |
|---|---|---|
| porte `fire` et un calibrage complet | Rien : elle est lancée, par toi ou par lui | — |
| a reçu des labels du manager, et il lui manque depuis `fire`, `model:` ou `effort:` | Rien, **jusqu'à ce que tu la lui rendes**. Il le dit une fois sur l'issue, avec la commande (voir « Lui rendre la main ») | `manager.set-aside` (`chef-changed`) |
| est écrite par quelqu'un qui n'a pas la main sur le dépôt | Rien, sans commentaire | `manager.set-aside` (`untrusted-author`) |
| est la roadmap (`BRIGADE_ROADMAP_ISSUE`) | Rien | `manager.set-aside` (`roadmap`) |
| est une épique déjà découpée par lui, ou un ticket né d'un de ses découpages | Rien : c'est fait, et ce qu'ils portent depuis est à toi | — |
| porte `hors-cuisine` — même avec `fire`, un calibrage complet ou le grant `merge` | Rien : le ticket ne se sert pas sur cette box. Il n'entre pas sur le rail, ne figure pas dans `attend`, et le manager le dit une fois s'il porte `fire` | `manager.set-aside` (`hors-cuisine`) |
| porte `blocked-on-human`, `question` ou `decision` | Rien | `manager.set-aside` (le label) |
| porte déjà, dans son corps, la liste de tickets d'une épique, sans qu'il l'ait découpée | Rien : elle a été découpée à la main | `manager.set-aside` (`already-split`) |
| porte `epic` | **Découpée** par le LLM, une fois | `manager.split`, ou une question |
| toute autre | **Jugée** par le LLM, une fois par état | `manager.judged`, ou `manager.failed` |

Aucun de ces labels n'est exigé : une épique sans `epic` va au LLM, qui la reconnaît — au prix
d'un jugement de plus.

**Le jugement** est un appel à `claude` sans outil, hors de tout worktree, au calibrage du manager
(`station manager-modele` / `manager-effort`). Il lit le titre, le corps, les labels et les
commentaires de ceux qui ont la main sur le dépôt (propriétaire, membres, collaborateurs — la règle
de la fiche), et répond l'une de cinq natures : `ticket`, `epic`, `question`, `decision`,
`incomplete`. Seul `ticket` entre sur le rail, calibré selon cette table ; `epic` part au
découpage, les trois autres sont refusées :

| Ticket | Calibrage |
|---|---|
| doc, renommage, correctif dont le test est déjà écrit | `haiku` / `low` |
| `fix`/`tech` mécanique sur un module connu | `sonnet` / `low` |
| `fix`/`tech` non mécanique, ou toute issue à critères d'acceptation précis | `sonnet` / `medium` |
| `feature`, refactor transverse, cœur du produit | `opus` / `high` |

**Un critère de forme écrit vaut un cran de plus** : dès qu'un critère d'acceptation impose une
forme (« cinq lignes », « sans préambule »), le ticket part au moins en `sonnet` / `low` —
**écris-le dans les critères d'acceptation**, il ne le devine pas. Il ne pose jamais `xhigh` ni
`max` : ils sont à toi seul.

### Lui rendre la main

**Chaque écart a son geste, et `run manager` le dit** (section « écartées », les dix plus récentes).

| Écartée parce que… | Ce qui la rend au manager |
|---|---|
| tu y as retiré `fire`, `model:` ou `effort:` qu'il avait posé (`chef-changed`) | `npm --prefix runtime run manager -- return <n°>` |
| elle porte `blocked-on-human`, `question` ou `decision` | Retirer le label : elle est jugée au réveil suivant |
| son corps liste déjà les tickets d'une épique (`already-split`) | Retirer la liste du corps : l'épique est découpée au réveil suivant |
| elle porte `hors-cuisine` | Rien à rendre : elle est servie ailleurs. Retire le label si la box doit la prendre ; le pourquoi est sur l'issue, écrit par qui l'a posé |
| c'est la roadmap, ou son auteur n'a pas la main sur le dépôt | Rien |

`rendre` ne force aucun autre écart que `chef-changed` : sur une issue retenue par un label, la
commande répond le geste qui la concerne, n'écrit rien et sort en 1 — `blocked-on-human` reste ta
protection. **Retirer `fire` ou un calibrage qu'il a posé, sans le remplacer**, c'est reprendre
l'exécution : il s'écarte, et le dit une fois sur l'issue avec la commande qui la lui rend.
Remplacer un `model:` par un autre, ou ranger ton backlog (`prio:`, `question`, `decision`,
`blocked-on-human`), ne fait jamais un `chef-changed`.

**Rendue, l'issue est jugée à neuf** (`manager.handed-back`), au réveil suivant : il **retire les
labels de calibrage qu'il avait posés lui-même** (`manager.withdrew` — jamais les tiens ; relancée
et calibrée par toi entre-temps, elle n'est pas rejugée), puis la rejuge. **Une remise vaut pour un
jugement.**

### Il découpe les épiques

Tu poses une **épique** en langage produit et tu retrouves des tickets : chacun avec ses critères
d'acceptation **observables**, ses dépendances, sa zone de fichiers et son calibrage, déjà lancés.

**Le découpage** est un second appel à `claude`, comme le jugement (`run` en `decoupe-<n°>-…`). Il
lit l'épique, les commentaires de confiance, et **le plan du dépôt** — ses dossiers sur deux
niveaux, au dernier rapatriement du clone de la station — dont il tire la zone de chaque ticket ;
les chemins communs du projet n'entrent dans aucune. Il rend l'une de trois réponses :

| Réponse | Ce que le manager fait | Au journal |
|---|---|---|
| un découpage, douze tickets au plus | Crée les tickets, les lance, le dit sur l'épique | `manager.split`, puis un fait par pas |
| **une question** : l'épique est ambiguë | La pose en commentaire, ne crée rien | `manager.split-asked` |
| « déjà découpée » : l'épique nomme déjà ses tickets | Ne crée rien, le dit une fois | `manager.split-skipped` |

Une réponse que le code ne sait pas lire — un ticket sans critère, sans zone, qui attend un ticket
placé après lui, un calibrage hors table, plus de douze tickets — ne crée **aucun** ticket
(`manager.split-failed`).

**La question ne retient rien** : le rail avance. Elle se lit dans `run manager` (« QUESTION
POSÉE »). Réponds en commentaire ou édite l'épique : elle est relue, **avec la question**.

**Un ticket né d'un découpage** porte : un corps qui commence par `Épique : #N`, puis le contexte,
les critères et **pourquoi ce calibrage** ; `model:`, `effort:`, et le `prio:` de l'épique ; sa
**fiche** (`attend`, `zone`, et `requiert` s'il demande une capacité) en commentaire ; et `fire`, posé **en dernier**. Il ne repasse pas par
le jugement, et attend ceux dont il dépend (voir « La fiche d'un ticket »).

**Un ticket d'interface est désigné pour le cook design** (`agents/cook-design.md`). Le manager le
reconnaît au découpage : sa zone touche la vue de l'app (`app/src/vue/`, un fichier dessous, ou un
dossier qui la contient comme `app/src`) — le code le désigne alors de toute façon —, ou le
découpage le dit (`"cook": "design"`), ce qu'il ne propose que dans un dépôt qui définit le cook
design. Un ticket du runtime, de la doc ou des scripts ne l'est pas. Le ticket désigné porte le
label `cook:design` à côté de `model:` et `effort:`, un paragraphe « Cook design » en tête de son
corps — c'est là que le cook apprend qu'il l'est, et où lire son profil —, et `· cook design` dans
la colonne « Calibrage » du commentaire de découpage. Le calibrage ne change pas : modèle et effort
se posent comme pour tout ticket, jamais `xhigh` ni `max`.

**La livraison d'un ticket d'interface montre l'écran avant et après** (`runtime/src/captures.ts`).
Un ticket est d'interface quand sa zone, à la prise, touche la vue de l'app, ou que son issue porte
`cook:design` — relu à la livraison, le rail ne garde pas les labels. Le cook design prend ses
captures avec `scripts/capture-ecran/` et les commite sur sa branche, une paire par écran changé :

```
docs/captures/<ticket>/<écran>-avant.png
docs/captures/<ticket>/<écran>-apres.png
```

`<écran>` apparie les deux (`fiche`, `rail-vide`) ; `avant` et `apres` se lisent sans égard à la
casse ni aux accents. À la livraison poussée, la station les lit dans les fichiers que la branche
change, et les montre **sous la ligne de tête de la PR** et sur le ticket : une section « Captures »,
chaque écran en tableau `Avant | Après`, les deux images côte à côte et légendées (`fiche — avant`),
chargées au commit poussé (`https://github.com/<dépôt>/blob/<sha>/<chemin>?raw=true`, que GitHub
montre aussi dans un dépôt privé). **Une livraison d'interface sans ses captures** — aucune, ou un
écran qui n'en a qu'une — y est dite **incomplète** : `Livraison incomplète : captures manquantes —
<ce qui manque>`, et où les poser. Rien n'est arrêté à la livraison : c'est la relecture qui juge (plus bas). Les captures
vont au journal avec le compte-rendu (`cook.reported`, `captures` : le commit et chaque écran), d'où
`facts` les donne à la carte du ticket. **Un ticket qui n'est pas d'interface n'en dit rien** — ni
section sur la PR, ni champ au journal, ni dans `facts`. Un renvoi livre sur la PR déjà ouverte : son
corps garde les captures de la première livraison, le commentaire du renvoi et `facts` montrent les
nouvelles.

**La relecture juge aussi les captures** (`runtime/src/reviewer.ts`, #843). Pour un ticket d'interface,
la consigne du reviewer ajoute une section « Les captures » : les captures livrées (qu'il ouvre avec
`Read`) et les trois violations des règles de #830, cherchées sur chaque capture « après » — `geste-non-bouton`
(un geste attendu qui n'est qu'une commande à recopier), `mode-d-emploi` (un paragraphe d'explication
en clair), `erreur-brute` (une erreur technique affichée telle quelle). **Elle ne juge que la partie de l'écran
que le ticket ajoute ou change** (#895) : ce qui se retrouve à l'identique sur la capture « avant » existait
déjà et ne bloque jamais. Une violation dans la zone du ticket est un constat **bloquant**, qui porte `regle`
et cite en `fichier` la capture « après » concernée ; une violation préexistante, hors de cette zone, est une
**remarque** (même `regle`, même `fichier`), qui propose un ticket à part si aucun ticket ouvert ne la couvre.
Un constat de ce type qui ne cite pas une capture livrée, ou qui est `a_supprimer`, rend la relecture
illisible (elle est redemandée). Une
capture qui respecte les règles ne produit aucun constat de ce type. **Une livraison d'interface sans aucune
capture est bloquante** : la station ajoute elle-même le constat (`fichier` : `docs/captures/<ticket>/`)
si le reviewer ne l'a pas dit. Un écran qui n'a qu'une de ses deux captures reste une remarque. Un ticket
qui n'est pas d'interface ne change pas. Le cas attendu est dans `evals/relecture-captures-830/`.

**L'épique liste ses tickets, avec leur état**, dans un bloc que le manager écrit à la fin de son
corps, entre deux marqueurs :

```markdown
<!-- brigade:tickets -->
## Tickets de l'épique

**1/3 servi.**

| # | Ticket | État |
|---|---|---|
| #80 | Le rail compte ses tickets | servi |
| #81 | La pass lit le compte | en cuisine |
| #82 | La doc dit le compte | attend #81 |

_Liste tenue par le manager : ce qui est entre ses deux marqueurs est réécrit, le reste de l'épique est à toi. Pour y faire entrer un ticket que tu ajoutes, écris `Épique : #78` dans son corps._
<!-- /brigade:tickets -->
```

**C'est le seul endroit du corps qu'il réécrit.** Un marqueur ne compte que **seul sur sa ligne,
hors bloc de code** ; sans marqueur de fin, il ne remplace que celui de début. Les états suivent
le rail : `pas sur le rail`, `en attente`, `attend #N`, `en cuisine`, `en pass`, `servi`,
`86 (motif)`, `bloqué — #N abandonné (…)`, `abandonné (…)`, `fermé`. **`en cuisine` est l'étape
d'un ticket** — celui que le rail dit `pris`, un cook le tient — et ne dit rien de l'état du projet
(« L'état de la cuisine »). Éteint, le manager ne tient
plus la liste ; rallumé, il la rattrape.

**Ton découpage est plus fort que le sien.** Une épique n'est découpée **qu'une fois**. Après quoi :

- tu **fermes** un ticket : il ne renaît pas ; la liste le dit `abandonné`, et `bloqué` ceux qui
  l'attendaient — à toi de retirer la ligne `attend` de leur fiche ;
- tu **ajoutes** un ticket : écris `Épique : #N` dans son corps, il entre dans la liste, jugé et
  calibré comme toute issue ;
- tu **changes** un critère, une fiche, un calibrage, tu retires `fire` : rien n'est réécrit ;
- tu **retiens** l'épique (`blocked-on-human`) : les créations en cours attendent.

**Une épique déjà découpée à la main : colle `<!-- brigade:tickets -->` dans son corps** (même
seul) avant d'allumer — le code le reconnaît sans LLM (`already-split`). Une épique **fermée**
n'est jamais découpée.

**Créer N issues n'est pas atomique** : le découpage est au journal **avant** le premier appel à
GitHub, et après une panne le réveil suivant reprend au premier ticket qui manque, **sans
rejuger**. Une création restée sans suite est d'abord **cherchée** par la marque que chaque ticket
porte dans son corps (`<!-- brigade:decoupage #N.k -->`), et reprise (`reconciled: true`). La
marque — comme une fiche — ne vaut que venant de **quelqu'un qui a la main sur le dépôt**.

Limites : le code vérifie que deux tickets concurrents ne partagent aucun chemin de zone (voir
« Les zones de fichiers »), pas que la zone est la bonne ; et fermer l'épique servie est ton geste.

### Il réagit à un échec

Éteint, rien ne change : la pass renvoie deux fois au même calibrage, puis te remonte le ticket.
**Allumé, la pass lui passe la main dès le second rouge** (`pass.deferred`) : le ticket reste en
pass, aucun cook ne repart avant qu'il ait décidé.

| Pass rouge n° | Ce qui se passe | Coût |
|---|---|---|
| 1 | renvoi 1/2 au même calibrage — c'est la pass | — |
| 2 | le manager **monte le calibrage d'un cran** s'il le peut, puis renvoie 2/2. Sinon le renvoi part au même calibrage, et il dit pourquoi | aucun : c'est du code |
| 3 et suivantes | le manager **choisit** : monter encore, **redécouper** le ticket, ou te le **remonter** — et dit lequel et pourquoi, sur l'issue | un jugement |

**Monter d'un cran**, c'est l'effort d'abord (`low` → `medium` → `high` → `xhigh` → `max`), puis le
modèle (`haiku` → `sonnet` → `opus`) en gardant l'effort atteint — **dans la limite du plafond du
projet**, `BRIGADE_CEILING_MODEL` et `BRIGADE_CEILING_EFFORT`, **sans défaut** : une dimension sans
plafond ne monte jamais, et sans aucune des deux il lui reste redécouper ou remonter. **Il ne
remplace que ses propres labels** : une dimension que tu as calibrée n'est jamais touchée. **Un
ticket qui a échoué deux fois ne repart jamais à l'identique** : si rien ne change, il remonte.

| Son choix | Ce qui se passe |
|---|---|
| **monter** | le label change, le ticket repart en attente : un cook le reprend sur la même branche, sur la même PR. Rouge encore, le manager choisit de nouveau |
| **redécouper** | le ticket devient **l'épique de ses sous-tickets** : ils naissent calibrés, ordonnés et lancés, et repartent de la base. Lui passe **86** (`manager:split`, pass `manager-split`) ; sa PR reste ouverte, comme référence, et **il ne tient plus sa zone**. Un ticket né d'un tel redécoupage ne se redécoupe pas |
| **remonter** | le ticket passe **86** (`manager:escalated`, pass `still-red`, cause `manager-escalated`), et tu reçois de quoi trancher : chaque tentative avec son calibrage et ce que la pass y a trouvé, pourquoi il remonte, et **ce qu'il propose** |

Une réponse illisible, un choix qui n'était pas offert (monter au plafond, redécouper un
sous-ticket) ou un redécoupage impossible vaut **remontée**. **Le disjoncteur garde le dernier
mot** : au seuil, le manager remonte sans plus rien relancer ni juger. Chaque réaction est au
journal (`manager.reacted`, `manager.raised`) ; `run manager` montre les dix dernières.

**À savoir.** Un ticket dont tu changes le calibrage pendant que le manager le tient repart au
tien. Si tu reposes l'ancien label à la place du sien, le ticket attend, « rouge, au manager »
dans `run pass` : remplace le label, ou éteins le manager — la pass reprend sa règle d'avant.

### Ce qu'il laisse sur l'issue

- **Exécutable** : les labels, puis un commentaire — pourquoi, **pourquoi ce calibrage**, ce qui
  était déjà posé, le coût du jugement. **Refusée** : aucun label, et sa nature, le motif, ce qui
  la rendrait exécutable.
- **Épique découpée** : pourquoi ces tickets, cet ordre, leur tableau, le coût — et la liste dans
  son corps. **Question**, **déjà découpée**, **illisible** : un commentaire qui le dit.

Une issue ne se juge **qu'une fois par état** — titre, corps, commentaires de confiance : tu
édites le corps ou tu commentes, elle est rejugée (au prix d'un jugement) ; tes labels, et ce que
le manager a écrit, ne la font pas rejuger. Un jugement illisible n'est pas retenté sur le même
état ; un jugement **qui n'a pas abouti** (panne, garde-fou) n'écrit rien et repart au réveil
suivant, borné par le disjoncteur.

### Ton geste est plus fort que le sien

- **Il ne retire jamais un label que tu as posé.** Les seuls qu'il retire sont les siens : un
  calibrage qu'il monte, ou qu'il avait posé sur une issue que tu lui rends.
- **Il ne pose jamais dans une dimension qui porte déjà un label**, et **ne pose qu'une fois par
  issue** : après quoi tout ce qu'elle porte est à toi, tant que tu ne la lui rends pas. « Posé
  par le manager » est ce que le journal dit (`manager.labeled`), pas l'auteur vu par GitHub.
- **Il relit les labels juste avant de poser** : retenue entre-temps, rien n'est posé.
- **`fire` posé par toi sur ce que le code écarte** (la roadmap, un label `question`…) : il ne
  retire rien, ne calibre pas, et le dit une fois. Si tu calibres toi-même, le cook part.

Limite connue : si le runtime meurt entre la pose des labels et l'écriture de `manager.labeled`,
ils sont tenus pour les tiens.

### Ce qu'il coûte

**Il ne consomme du quota que pour juger et pour découper** (une épique sans label : deux appels).
Chaque jugement est au journal **comme un cook** (`cook.launched`, station `manager`, hors ticket ;
`cook.exited` ; flux dans `runs/`) et passe par les garde-fous : **rien n'est jugé** sous « stop »,
disjoncteur ouvert, quota épuisé ou connexion expirée — c'est jugé à la reprise. Pour le
disjoncteur, un jugement illisible ou non abouti est **un échec**, un jugement réussi ne compte ni
pour ni contre ; un jugement **que le modèle refuse** est retenté, et s'épingle au troisième refus
d'affilée (voir « Quand le modèle refuse »). Il ne retient pas la station. Compter jusqu'à une
minute entre la décision et le départ du cook.

| Événement | Sens |
|---|---|
| `manager.enabled`, `manager.disabled` | Le chef allume, éteint (hors ticket) |
| `manager.set-aside` | Le code a écarté l'issue, sans jugement : `reason` ; `fired` : elle porte un `fire` laissé ; `lacking`, sur un `chef-changed` : ce qui lui manque |
| `manager.judged` | Le LLM a jugé : `verdict` (`fire`, `refused`), `kind`, `reason`, `missing`, `model`, `effort`, `calibration`, `run`, `fingerprint` (l'état jugé) |
| `manager.failed` | Le jugement est allé à son terme, mais ne se lit pas — ou le modèle l'a refusé trois fois d'affilée |
| `manager.labeled`, `manager.commented` | Les labels qu'il a posés, une fois GitHub servi ; la décision est dite sur l'issue |
| `manager.handed-back`, `manager.withdrew` | Le chef rend une issue écartée `chef-changed` ; les labels de calibrage du manager en sont retirés (`labels`) |
| `manager.closed`, `manager.reopened` | Une issue dont le manager attendait le chef a quitté les issues ouvertes (elle sort de la file du chef), ou y est revenue |
| `manager.reacted`, `manager.raised` | Sa réaction à un échec en pass ; les labels qu'une montée a changés |
| `manager.split` | L'intention du découpage, écrite avant toute création : `reason`, `order`, `tickets` (titre, contexte, critères, `waitsFor`, zone, calibrage, `overlaps` — les attentes que le code a ajoutées pour des zones qui se recouvrent), `run`, `fingerprint` |
| `manager.split-asked`, `-skipped`, `-failed` | Une question au chef ; l'épique liste déjà ses tickets ; la réponse ne se lit pas |
| `manager.split-creating`, `-created`, `-fired` | Le ticket de rang `index` va être créé ; il existe (fait porté par le ticket né, `reconciled` s'il a été retrouvé) ; sa fiche et `fire` sont posés |
| `manager.split-done`, `-commented` | Tous les tickets existent et sont lancés ; le découpage est dit sur l'épique |
| `manager.split-adopted`, `-seen`, `-listed` | Un ticket du chef se réclame de l'épique ; un ticket d'épique a quitté les issues ouvertes ou y est revenu ; la liste est écrite dans le corps (`digest`) |

## La pass

Quand un cook a livré, **la pass juge sa livraison sans personne**. Trois juges, dans cet ordre :

1. **Les gates** : `.claude/brigade/gates.sh <worktree>`, jouées dans un **worktree jetable où le
   commit livré est fusionné avec la base du moment**. **Le code de sortie est le verdict.** Le
   `.claude/brigade/worktree-setup.sh` du projet passe d'abord, et ce qu'il exporte vaut pour
   elles. Plafond, setup compris : 30 minutes (`BRIGADE_GATES_TIMEOUT_SECONDS`), puis rouge.
2. **Le reviewer**, seulement si les gates sont vertes : un `claude` qui relit le diff.
3. **La CI** du commit jugé (*check runs* et statuts), lue seulement si les gates sont vertes.

| La CI dit | Ce qu'en fait la pass |
|---|---|
| un job en échec, la branche **à jour de la base** | **rouge**, avec le nom du job, sa conclusion, son adresse |
| un job en échec, la branche **sans la tête de la base** | cette CI n'a pas jugé ce qui sera mergé : **son rouge n'est pas un verdict**. Le cook est renvoyé avec « mets-toi à jour de la base », les jobs nommés — pas avec « CI rouge ». Ça consomme un renvoi, comme un conflit. Au journal, CI « non lue » (`skipped`), ses checks gardés |
| des jobs en cours | pas de verdict : relue à chaque tick. Trente minutes sans conclusion : remontée au chef (`unjudged`, cause `ci-silent`). Sauf constat bloquant du reviewer : rouge tout de suite, CI « non lue » |
| tout est vert | vert — que la branche ait ou non la tête de la base : la fusion, ce sont les gates qui la jugent |
| **aucun check** | ni vert ni rouge : le verdict repose sur les gates et le reviewer (`ci: none`). Sauf si la branche porte un workflow (`.github/workflows`) qui se déclenche sur les PR vers la base (`pull_request` ou `pull_request_target`, filtres de branches et de chemins compris) : ses checks sont attendus. Un workflow qui ne se lance qu'au push ne retient rien : la PR est jugée sans CI |

Le verdict est au journal (`pass.judged`) **avec ce qui l'a produit** et **ce sur quoi il porte** :
la tête de la branche (`sha`), celle de la base fusionnée (`base`), l'arbre obtenu (`merged`).
**Vert veut dire « une fois fusionnée avec la base, les gates et la CI n'ont rien trouvé, et un
reviewer a relu le diff sans rien trouver de bloquant ».** Pas « un humain a relu », et jamais
« vert sur sa branche ».

Une livraison peut lui arriver **hors du rail** : la PR d'une passe de fermeture, qui n'a pas de
ticket. Elle passe par les mêmes juges et le même grant ; ce qui tient au ticket — le renvoi à un
cook, le service, la fermeture de l'issue — n'a pas lieu (voir « La PR passe par la pass »).

### Le plafond de durée des gates n'est pas jugé par la pass

Des gates peuvent se donner un plafond de durée (binding **Plafond des gates** du `CLAUDE.md` du
projet) et sortir rouges quand il est franchi. Il mesure le poste où il a été fixé, et un cook n'y
peut rien : **la pass ne le juge pas.** Elle le reconnaît à deux lignes — `durée des gates : … pour
un plafond de <n> s — … de trop` et `FAIL  plafond des gates franchi : plus de <n> s de processeur` :

| Les gates sortent rouges, et | Ce qu'en fait la pass |
|---|---|
| le plafond est leur **seule** ligne `FAIL` | **vertes** : la livraison suit son chemin. Le dépassement se lit au journal (`gates.overCeiling`), sur l'issue (« Pass — plafond des gates franchi, non jugé »), dans `run pass` et `run measures` |
| une autre ligne `FAIL` est là | **rouges**. Le renvoi nomme les autres échecs, et dit du plafond qu'il n'y a rien à corriger pour lui |

La règle vaut aussi pour le contrôle de la base. **Elle suppose qu'aucun rouge du `gates.sh` n'est
muet** : rouges pour une autre raison **sans ligne `FAIL`**, des gates qui franchissent leur
plafond sont vues vertes. Au projet de le tenir — sortir au premier échec (`set -e`), plafond en
dernier ; ou une ligne `FAIL` par échec, plantage compris — ou de retirer le binding. Une ligne de
plafond sans sa mesure, ou une sortie de plus de 256 ko, laissent les gates rouges.

### Le worktree du jugement

La pass lit **ce que l'origine a reçu de la branche** (le worktree du cook n'existe plus) et ne
fait un worktree que pour **jouer les gates** et **faire relire** :
`worktrees/.essais/jugement-<ticket>`, jetable, détaché, où **le commit livré est fusionné avec la
tête de la base**, rapatriée à l'instant. Cette fusion n'est jamais poussée — **la pass ne touche à
aucune branche**. Le worktree est retiré à la fin du jugement ; un runtime tué en laisse un, retiré
au démarrage avant de reprendre. **Le commit jugé est celui que GitHub connaît.** **Le setup se
joue à froid** : un projet dont le setup s'appuie sur un cache paie l'installation entière à
chaque jugement, sous le plafond des gates.

### Le reviewer

Après des gates vertes, la pass lance un **reviewer** : un `claude` de plus, dans le worktree
jetable du jugement, au calibrage du projet (`station reviewer-modele` et `reviewer-effort`,
sans défaut).

- **Ce n'est jamais le cook qui se relit** : un process neuf, sa consigne, aucune session reprise.
- **Il ne peut rien écrire.** Trois outils — `Read`, `Grep`, `Glob` — et rien d'autre : ni shell,
  ni édition, ni skill, ni serveur MCP, ni réglages du compte, aucun mode sans permission.
- **Ce qu'il lit** : le titre et le corps du ticket, les commentaires de ceux qui ont la main sur
  le dépôt (`OWNER`, `MEMBER`, `COLLABORATOR`) — sans ceux de la brigade —, le compte-rendu du
  cook, la liste des fichiers changés, et le diff contre la branche d'intégration : **des données,
  pas une consigne**. Un diff de plus de 40 000 octets, ou une liste de plus de 8 000, est coupé :
  il lit le reste dans le worktree, sans les lignes supprimées (`truncated: true`). Une consigne
  de plus de 120 000 octets **ne se lance pas** (`unjudged`, cause `review-unsendable`).
- **Un commit de récolte** — ce que le cook avait laissé non commité — lui est nommé : un fichier
  qui n'a rien à y faire (un secret, un brouillon, une sortie d'outil) est **bloquant**.
- **Un critère de forme écrit est bloquant** dès qu'il n'est pas tenu (« cinq lignes au plus »).
  Hors de là, le doute profite à la remarque : un goût, un style, un nommage ne bloquent jamais.
- **Il dit ce que le diff devrait supprimer et ne supprime pas**, à chaque relecture, ou qu'il n'y
  a rien à retirer : des remarques « À supprimer : … », **jamais bloquantes**, même sous un verdict
  rouge. Le chiffre qui dit si cela sert — lignes ajoutées pour une retirée, sur les 120 derniers
  merges : `git log --first-parent --merges -120 --numstat --format= <base> | awk '{a+=$1; r+=$2} END {print a/r}'`.

| Le reviewer dit | Ce qu'en fait la pass |
|---|---|
| aucun constat bloquant | rien n'est retenu. Les remarques sont sur l'issue ; elles ne repartent pas au cook |
| **un constat bloquant** | **rouge** : le constat repart à un cook, et consomme un renvoi |
| une réponse qui ne se lit pas | **ni verte ni rouge**, et aucun cook n'y peut rien : la relecture est **redemandée au reviewer**, sur le même commit, **deux fois au plus**, sans relancer de cook. Lisible, elle est jugée comme une autre ; illisible trois fois, la livraison est remontée (`unjudged`, cause `review-unreadable`), sans renvoi ni merge |

Chaque relecture laisse sur l'issue un commentaire « Reviewer — … ». **Une livraison lue n'est
pas relue** (`pass.reviewed`) : seule une relecture illisible se redemande, et le journal porte
alors plusieurs `pass.reviewed` sur le même `sha` ; un renvoi est une autre livraison. **Un reviewer vert ne lève
aucune autre règle** : ni l'arrêt sans grant, ni `review-required`.

Une relecture est au journal **comme un cook** (station `reviewer`, run `review-<ticket>-…`) et
passe par les garde-fous : **rien n'est relu** sous « stop », disjoncteur ouvert, quota épuisé ou
connexion expirée — la livraison attend, sa redemande aussi. Non aboutie, elle est **un échec**
pour le disjoncteur, et retentée ; illisible, elle n'en est un que si elle laisse la livraison non
jugée — redemandée, elle ne compte ni pour ni contre ; **refusée par le modèle**, elle est retentée sans
compter, puis remontée au troisième refus d'affilée (`unjudged`, cause `review-refused` ; voir
« Quand le modèle refuse »). Elle ne retient pas la station.

### Les tickets sans diff

Un audit, une analyse : le cook conclut sans rien commiter, et **ce qu'il a délimité dans son
dernier message est le livrable** (voir « Le livrable se délimite »). **Le reviewer est alors le
seul juge, et il est obligatoire** : il relit le livrable délimité — lui seul — contre le ticket.

| Le reviewer dit | Ce qui se passe |
|---|---|
| rien de bloquant | le ticket est **servi sans merge** (`pass.served`) et son issue fermée — **sans grant**. Le livrable reste sur l'issue, dans le commentaire du cook |
| un constat bloquant | rouge : il repart à un cook, sur la même branche, dans la limite des deux renvois |
| illisible | redemandée au reviewer, deux fois au plus ; toujours illisible, remontée au chef (`unjudged`, cause `review-unreadable`) |
| rien — « stop », disjoncteur, quota, connexion | le ticket **attend en pass** |

Un cook sans commit **et** sans livrable délimité n'a rien livré — `no-commit` s'il n'a rien dit
ou a écrit des fichiers sans les commiter (ils sont commités sur sa branche locale),
`no-deliverable` s'il n'a rien délimité : un échec de la station, renvoi non consommé. Limite
connue : un cook qui conclut sans commiter sur un ticket qui demandait du code part en pass comme
« sans diff » — c'est au reviewer de le dire.

### Ce que la pass décide

| Verdict | Grant `merge` | Ce qui se passe |
|---|---|---|
| vert | **actif** | le runtime vérifie que **la base est encore celle du verdict** — sinon il rejuge —, puis **merge lui-même** la PR ; le ticket est **servi**, son issue fermée |
| vert | absent, révoqué ou éteint | la PR reste ouverte et **la pass s'arrête là** (`pass.held`, `no-grant`) |
| vert, mais la livraison touche `.claude/brigade/` ou `.github/workflows/` — ses juges | peu importe | **jamais mergée par la pass** (`review-required`, cause `judge-modified`) : un cook qui modifie ses juges peut se rendre vert seul |
| vert, mais la livraison touche `.claude/brigade/reseau` ou `.claude/brigade/secrets` — ajout, modification ou suppression | peu importe | **jamais mergée par la pass** (`review-required`, cause `declaration-modified: <fichiers>`) : mergée, la déclaration ouvre un hôte, ou remet un secret de la machine, aux cooks suivants. Le commentaire d'issue dit quoi y relire |
| vert, ticket sans diff | peu importe | **servi sans merge**, issue fermée |
| aucun, **base rouge** | peu importe | la livraison **attend** (`pass.waiting`, `base-red`) et repart seule quand la base est réparée — ou rejouée verte (`run base -- replay`). Seul le ticket de réparation de ce rouge est jugé et mergé malgré lui |
| rouge — gates sur la fusion, conflit, CI, ou constat bloquant | — | les **findings repartent à un cook**, sur la même branche. Rien n'est mergé |
| rouge une seconde fois, **manager allumé** | — | la pass **passe la main au manager** (`pass.deferred` ; voir « Il réagit à un échec ») |
| rouge une troisième fois, manager éteint | — | deux renvois sont consommés : la pass **te remonte le ticket** (`still-red`). Il passe **86** |

Seul un verdict rouge consomme un renvoi. Un cook de renvoi qui échoue sans rien livrer n'en
consomme pas : c'est le disjoncteur qui borne. Chaque décision est commentée sur l'issue, et dit
sur quoi portait le verdict — `` `8c1d2e0` fusionné avec `v2` (`4be1f07`) ``.

#### Le cook d'un renvoi reprend la session du précédent

Un renvoi ne repart pas de zéro : le cook du renvoi **reprend la conversation du cook dont la pass
a refusé la livraison** — ce qu'il a lu du ticket, du `CLAUDE.md` et du code, ce qu'il a fait — et
ne reçoit en plus que **le refus et ce que la pass a trouvé**. Sans reprise, un cook neuf relisait
tout pour une correction de quelques lignes.

| Étape | Ce que fait la station |
|---|---|
| la session | elle la lit dans le flux brut du cook précédent (`runs/<run>.jsonl`, le `session_id` de `stream-json`) |
| le transcript | elle le cherche sous `projects/` du répertoire de configuration de `claude` — `<état>/claude` sous cloison, `CLAUDE_CONFIG_DIR` ou `~/.claude` du compte sinon —, et le copie dans le répertoire du projet du **worktree neuf** du renvoi : c'est là que `claude --resume` le cherche |
| le lancement | `claude --resume <session> --fork-session` : la session est bifurquée, le cook du renvoi écrit la sienne sous un identifiant neuf, et celle du précédent reste telle quelle |
| la consigne | le refus (`renvoi n sur 2`), les findings, et le worktree neuf — l'ancien n'existe plus, ses chemins se relisent sous le nouveau. Ni le ticket ni le `CLAUDE.md` à relire : ils sont dans la conversation |
| au journal | `cook.launched` porte `resumes` : le run repris et sa session |

**La pass ne change rien pour lui.** Sa livraison passe par les mêmes gates, sur la même fusion
avec la base, la même CI, la même relecture, le même grant qu'un premier passage — rien n'est
sauté, rien n'est assoupli. La reprise n'économise que la lecture.

**Le repli : un cook neuf, comme avant.** Le renvoi part de zéro, avec la consigne complète
(relire le ticket, le `CLAUDE.md`, ce qui est commité), et sans rien écrire d'autre, quand :

- le dernier cook lancé sur le ticket **n'a pas livré** — un cook de renvoi repris qui échoue a pu
  buter sur la reprise elle-même : le suivant repart de zéro ;
- son flux brut est parti, ou ne dit **aucune session** ;
- son **transcript n'est plus là** — rangé passé la durée de garde (« Les transcripts du projet
  sont rangés »), ou jamais écrit ;
- le répertoire de configuration de `claude` n'est pas connu (ni cloison, ni `CLAUDE_CONFIG_DIR`,
  ni `HOME`), ou le chemin du worktree est trop long pour que `claude` y retrouve la session ;
- c'est une **relance du manager**, décidée quand les renvois sont épuisés : elle repart d'un
  regard neuf ;
- c'est une **station distante** : le transcript est sur son poste, pas sur la box.

Le relevé des mesures dit quels lancements ont été repris (« Le relevé des mesures »).

#### Les motifs, et le geste de chacun

Un motif par geste du chef — pas plus de noms que de gestes. Ce qui précise un motif sans changer
le geste est sa `cause` ; `run pass` montre les deux, `(unjudged : ci-silent)`, et la file de
`status` écrit le geste sur chaque ligne.

| Fait | Motif | Ce que c'est | Ton geste |
|---|---|---|---|
| `pass.held` | `no-grant` | verte, pas de grant actif (`expired` : il s'était éteint seul à cet instant) | merger la PR à la main ; ou, pour les suivantes, `npm --prefix runtime run grant -- enable merge` |
| `pass.held` | `review-required` | verte, mais elle touche à ses juges (cause `judge-modified`) ou à ce que le projet s'ouvre (cause `declaration-modified: <fichiers>`). Aucun grant ne la fait merger | la relire, puis la merger à la main |
| `pass.held` | `merge-refused` | verte, et GitHub a refusé le merge (cause : ce qu'il a dit). Non retenté | lever ce qu'il refuse, puis merger à la main |
| `pass.escalated` | `still-red` | rouge, et plus personne ne la corrigera : renvois épuisés (cause `returns-exhausted`), le manager remonte (cause `manager-escalated`), ou c'est la PR d'une passe de fermeture, hors du rail, que personne ne reprend (cause `off-rail`) | trancher : merger la PR à la main, ou retirer `fire` — sans PR, retirer `fire` ou fermer l'issue |
| `pass.escalated` | `unjudged` | la pass n'a pas pu juger ; la cause dit ce qui l'en a empêchée | lever ce que dit l'issue, puis retirer et reposer `fire` ; ou merger à la main ; ou retirer `fire` |
| `pass.escalated` | `manager-split` | le manager a redécoupé le ticket : ses sous-tickets portent le travail | aucun |

Les causes d'un `unjudged` — aucune ne consomme de renvoi, un cook n'y peut rien :

| Cause | Ce qui a empêché le jugement |
|---|---|
| `wrong-base` | la PR ne vise pas la branche d'intégration (une PR vers `main` quand la base est `v2`) |
| `no-gates` | le projet n'a pas de `gates.sh` une fois la branche fusionnée : sans gates, « vert » voudrait dire que personne n'a regardé |
| `worktree-lost` | le clone de la station ne connaît plus la branche, ou la fusion échoue sans que ce soit un conflit (git en panne). La pass ne recrée pas la branche ; ce que le cook a poussé reste sur l'origine |
| `ci-silent` | trente minutes de CI sans conclusion |
| `review-unreadable`, `review-unsendable`, `review-refused` | la relecture ne se lit pas, redemandée deux fois au reviewer ; sa consigne ne tient pas dans une commande ; le modèle l'a refusée trois fois d'affilée |
| `secrets-unavailable` | les gates n'ont pas pu recevoir les secrets du projet, et n'ont pas été jouées (voir « Les secrets du projet ») |

Un ticket remonté passe **86**, motif du rail `pass:still-red` ou `pass:unjudged`. Un journal
d'avant ce regroupement se relit : l'ancien nom (`judge-modified`, `ci-silent`…) devient la cause.

**Sans grant, le commentaire d'arrêt dit ce que la pass aurait fait** — « Sous grant, la pass
aurait mergé <PR> sur `<base>` au commit `<sha>`, verdict n° <n> — une fois vérifié que `<base>`
n'a pas bougé depuis ce verdict et n'est pas rouge. » —, sans rien rapatrier ni jouer. Et **le
chiffre sur lequel accorder le grant** se lit dans `run pass`, `run grant` et — tant que la file
n'est pas vide — le bloc `attend` de `status`, au journal seul : `sans grant, 3 livraisons vertes
arrêtées : 1 mergée à la main, 1 fermée sans merge — 1 désaccord —, 1 encore ouverte`. Le compte
suit la livraison arrêtée, par sa PR. Fermer la PR sans la merger est le désaccord — rouverte puis
mergée, elle est mergée. Une livraison que la pass a mergée elle-même, le grant accordé depuis,
est comptée à part (`mergée par la pass`) : ce n'est pas ton geste. `review-required` et
`merge-refused` n'y comptent pas.

#### Sortir un ticket arrêté ou remonté

**Merge sa PR à la main** : la pass relit GitHub à chaque tick, le voit, sert le ticket et ferme
l'issue. Ou **retire `fire`** : il quitte le rail.

**Fermer une PR sans la merger, c'est refuser la livraison** : au tick suivant la pass l'écrit
(`pass.pr-closed`), le dit une fois sur l'issue, et ne juge, ne renvoie ni ne merge plus rien
dessus (`PR FERMÉE SANS MERGE` dans `run pass`). **Le ticket ne bouge pas** : il tient sa place —
et sa zone — sur le rail ; retire `fire` ou ferme l'issue pour l'en sortir. Rouverte puis mergée,
la pass le voit ; rouverte sans être mergée, elle n'est pas rejugée.

**Quand un ticket quitte le rail sous la pass** — issue fermée ou `fire` retiré, livraison non
mergée —, la pass **lâche la livraison** : relecture arrêtée, aucun cook relancé. Elle ne ferme
**ni la PR ni la branche** ; PR encore ouverte, elle le dit **une fois** (`pass.abandoned`, et sur
l'issue, avec où en était le jugement) : **à toi de la merger ou de la fermer**. Remis sur le
rail, le ticket repart de la base, sans cette PR. **Si tu avais mergé la PR avant que le ticket
parte**, ce n'est pas un abandon : le merge est constaté (`merge.done`, `by: outside`), le ticket
**servi** pour qui l'attendait, la base contrôlée.

### Vert veut dire vert une fois fusionné

**Une livraison est jugée sur la fusion de sa branche avec la base du moment — toujours.** À chaque
jugement, la pass rapatrie la base, fusionne le commit livré avec sa tête dans le worktree jetable,
et y joue les gates.

| Ce qui arrive | Ce que fait la pass |
|---|---|
| **la fusion ne se fait pas** (conflit) | ni gates ni relecture. Le cook est renvoyé avec une seule consigne — **« mets-toi à jour de la base »** (`git fetch`, rebase, résoudre). Ça consomme un renvoi |
| gates rouges sur la fusion, **et la base est rouge seule** | ce rouge n'est celui d'aucun cook : **ni verdict ni renvoi**, la livraison attend (`base-red`) |
| gates rouges sur la fusion, la base verte seule | **rouge** : c'est au cook. Le finding dit sur quelle fusion les gates ont été jouées |
| **la base a bougé entre le verdict et le merge** | la livraison est **rejugée**, fusionnée avec la base devenue : gates rejouées, reviewer et CI non (ils portent sur le commit). C'est le verdict neuf qui autorise le merge. Une livraison qui attend sa CI conclut d'abord sur la base où elle a commencé |
| la fusion échoue sans conflit (git en panne) | aucun cook n'est renvoyé : remontée (`unjudged`, cause `worktree-lost`), avec ce que git en a dit |
| gates rouges sur la fusion, et **la base ne peut pas être jouée seule** | « pas pu vérifier » n'est pas « c'est vert » : ni verdict ni renvoi, le jugement reste en cours jusqu'à ce que la base soit jugée — ou bouge |

Rejuger ne coûte pas de cook, mais **consomme la machine** : saturée (les seuils de « Plusieurs
cooks à la fois »), la livraison à rejuger **attend** (`pass.waiting`, `machine-saturated`) et
repart seule.

#### Des gates coupées par leur garde d'horloge sur une machine saturée ne sont pas un rouge

Sur une machine saturée, une suite saine peut mettre plus de temps que la garde d'horloge des gates
ne lui en laisse : coupée, elle est rouge **sans qu'aucun test n'ait échoué**. Ce rouge vient de la
charge, pas du code. Le compter comme un vrai rouge renverrait le ticket à un cook, puis à un autre,
puis au manager, et pourrait rougir la base. **La pass le reconnaît à une ligne** du `gates.sh` :
une ligne `FAIL` qui contient `garde d'horloge, aucun test en échec`. Celle de ce dépôt :
`FAIL  tests du runtime arrêtés par la garde d'horloge, aucun test en échec : plus de 300 s sans
rendre la main`. Avec un test en échec avant la coupure, `gates.sh` écrit une autre ligne, et c'est
un rouge comme avant. **La pass ne prend la coupure pour un rouge de charge que si cette ligne est
la seule ligne `FAIL`** (`gates.clockGuardCut`), et que la sortie a été gardée entière.

| Les gates sont coupées sans test en échec, et | Ce que fait la pass |
|---|---|
| la machine est **saturée** (seuils de « Plusieurs cooks à la fois »), au départ des gates ou à l'arrivée | **ce n'est pas un rouge** : pas de verdict, pas de renvoi au cook, la base n'est pas jugée, rien ne compte au disjoncteur. La livraison **attend** (`pass.waiting`, `gates-cut-saturated`, avec le `sha`) et ses gates **sont rejouées seules** dès que la machine n'est plus saturée |
| elles l'ont **déjà été une fois** sur ce commit, puis rejouées sur une machine calme | **rouge** : ce n'est plus la charge, c'est un test bloqué ou une suite devenue trop lente. Le renvoi le dit |
| la machine est **calme** | **rouge**, dès la première fois, pour la même raison |

**La file et la carte le disent en une ligne** pendant l'attente : `gates rejouées plus tard :
machine saturée, aucun test en échec`. On la lit au bout de la ligne du ticket dans le rail de
`run status`, dans l'activité de `faits` (`rail[].activite.fait`), donc sur la carte de l'app, et
dans `run pass`. L'issue reçoit un commentaire (« Pass — en attente (`gates-cut-saturated`) »)
avec la ligne des gates et la charge relevée, et journald une ligne.

**La règle vaut pour la base jugée seule.** Ses gates ne partent que sur une machine calme. Si elles
sont coupées sans test en échec et que la machine est saturée à l'arrivée, **aucun contrôle n'est
écrit** : la base n'est pas vue rouge, et journald le dit. Ce qui demandait le contrôle (un merge à
vérifier, un rejeu, une livraison rouge) le redemande, et il se rejoue seul une fois la machine
calme. Coupées à nouveau sur cette tête, ses gates la rougissent. Cette mémoire de la base ne survit
pas à un redémarrage du runtime : il lui accorde au plus un rejeu de plus.

#### La base est jugée seule

Les gates sont jouées **sur la base elle-même**, dans un worktree jetable, **hors ticket** (le
setup y reçoit le numéro `0`), et le résultat écrit au journal (`base.checked`) : après **un merge
fait hors du runtime** (`merge.done`, `unverified`) ; devant **une livraison rouge une fois
fusionnée**, si la base n'a pas été jugée sur cette tête ; et **tant qu'elle est rouge**, dès
qu'elle bouge — ou à ta demande. Un merge fait par la pass n'en déclenche aucun.

**Rouge**, c'est dit dans journald, dans `run status` sans qu'on le demande (`base  ROUGE depuis …`,
avec le geste qui fait rejouer), en tête de `run pass`, et sur chaque ticket dont le merge était à
vérifier. **Plus rien n'est jugé ni mergé** — chaque livraison **attend** (`base-red`), sans
verdict ni renvoi — et **la station cesse de prendre des tickets** (`station.held`, motif `base`),
cooks de renvoi compris. Les cooks en cours continuent ; jugements du manager et relectures aussi.

**La cuisine traite le rouge seule.** La pass **rejoue d'abord ses gates une fois**, aussitôt et
sans commit (`base.recheck-requested`, écrit par `pass`) : un rouge passager — un test instable,
un délai dépassé — tombe ainsi sans rien ouvrir. **Si le rouge tient** — un second contrôle joué
le constate, rejeu ou base qui a bougé —, elle **ouvre un ticket de réparation** sur GitHub
(`base.repair-opening` puis `base.repair-opened`, sous son numéro) : son titre et son corps
nomment la base, le commit et ce qui échoue (les lignes `FAIL` des gates, et leur fin de sortie).
Il porte `fire`, `model:opus`, `effort:high` et **`prio:0`, qui passe devant tout le rail**. **Il
est le seul ticket qui part d'une base rouge** : la station qui peut le prendre n'est pas retenue
par elle, et ne prend que lui ; la pass le juge fusionné avec la base rouge, et le merge sous
grant — ses gates vertes disent qu'il la répare. Mergé, la base bouge, ses gates sont rejouées,
et au vert tout repart seul. **Un seul à la fois** : aucun second n'est ouvert tant que le premier
est en cours, ni plus d'un par rouge. Une création dont la réponse se perd est retrouvée par la
marque de son issue (`<!-- brigade:reparation-base <sha> -->`), pas recréée. La réparation se lit
`en-cours`, `servie` ou `echouee` (partie du rail sans service, remontée au chef, ou base encore
rouge après son merge) — `reparationDeLaBase`, que lisent la file et la carte. **Tant qu'elle
travaille, la base rouge n'entre pas dans le bloc `attend`** : rien ne t'attend. **Échouée, elle y
entre**, sur une ligne `base` (« Ce qui attend le chef », ci-dessous), et **en sort d'elle-même au
retour au vert** — la cuisine, elle, repart sans geste.

Tu peux toujours pousser le correctif toi-même, ou merger une livraison en attente à la main.

**Un rouge qui ne tient pas au code se rejoue aussi sans commit à ta demande** :
`npm --prefix runtime run base` dit ce que le dernier contrôle a dit,
`npm --prefix runtime run base -- replay` fait rejouer les gates d'une base rouge sur la même
tête (`base.recheck-requested`, lu aussitôt par la pass qui tourne). **Vertes**, la retenue
tombe ; **rouges**, elle reste. Machine saturée, le rejeu attend (`base.recheck-held`).

**Une base qui ne se rapatrie pas retient son contrôle** (origine injoignable, jeton refusé) : ni
rouge ni contrôle non joué. La pass l'écrit et le dit **une fois par cause** (`base.check-held`),
puis retente au tick ; `run status`, `run pass` et `run base` disent le motif courant et depuis
quand. **Un rouge constaté reste rouge**, ta demande reste due. Le rapatriement revenu
(`base.check-resumed`), le contrôle dû se joue aussitôt.

**« Je n'ai pas pu vérifier » n'est pas « c'est vert ».** Un contrôle **non joué**
(`outcome: skipped`) — pas de gates, ou **l'essai ne s'est pas fait** (le worktree jetable ne se
crée pas ; `reason` : ce que git en a dit) — ne retient rien sur une base jamais vue rouge, et
**laisse rouge une base vue rouge** (`red` : le commit du rouge qui reste). Seul un contrôle
**joué et vert** lève le rouge. Un contrôle non joué n'est pas retenté à chaque tick, et il
**clôt** un rejeu demandé : `run status`, `run pass` et `run base` en montrent le motif —
**réparer le dépôt est à toi**, puis `base -- rejouer`.

### Le grant `merge`

Le merge automatique n'existe que **sous grant**. C'est un objet du runtime — des faits au
journal — : tu l'accordes, le prolonges et le révoques **sans redémarrer**, et la pass le relit **à
chaque décision de merge**.

```bash
npm --prefix runtime run grant                               # son état, ce qu'il en reste, ses derniers gestes et usages, le bilan des arrêts sans grant
npm --prefix runtime run grant -- enable merge            # sans échéance
npm --prefix runtime run grant -- enable merge --for 4h   # il s'éteint seul dans quatre heures
npm --prefix runtime run grant -- enable merge --until 18h30 --uses 10
npm --prefix runtime run grant -- extend merge --for 2h   # un grant en cours, sans le révoquer
npm --prefix runtime run grant -- revoke merge
```

- **Absent par défaut**, et **pas rétroactif** : l'activer vaut pour les livraisons suivantes ;
  celles que la pass a déjà arrêtées, tu les merges à la main.
- **Chaque usage est journalisé** (`grant.used` : ticket, PR, commit, verdict) : c'est la réponse à
  « pourquoi ce code est-il sur `v2` ? » — `grant` liste les usages, `pass -- <ticket>` le verdict.
- **Le merge est écrit en deux temps** : l'intention (`grant.used`) avant l'appel à GitHub, le
  résultat après (`merge.done`, `merge.failed`). Un runtime mort entre les deux relit la PR au
  redémarrage. GitHub n'accepte le merge que si la branche est encore sur le commit jugé ; un
  merge qu'il **refuse** n'est pas retenté (`merge-refused`).

- **Ce qu'aucun grant n'autorise** se lit dans `run grant`, ligne `jamais accordé` : `identifiants-max`
  (lire les identifiants du compte Max) et `acces-prod` (toute action sur la production d'un projet).
  Le demander — `activer acces-prod` — est **refusé, à toi aussi** : la commande nomme la ligne, sort
  en 1 et écrit ta demande au journal (`grant.refused`, relue dans `derniers gestes`). La liste est
  dans `runtime/src/grant.ts` et ne se change que par une livraison, qui se lit dans un diff.

⚠️ **Grant actif, du code écrit par un cook atterrit sur la branche d'intégration sans qu'aucun
humain l'ait lu** : ses juges sont les gates et la CI du projet, et un reviewer qui est un modèle.

#### Une échéance, et il s'éteint seul

| Tu tapes | Ce que ça veut dire |
|---|---|
| *(rien)* | **Sans échéance** : il vaut jusqu'à ce que tu le révoques |
| `--for 30min` · `4h` · `1h30` · `2j` | Une durée, comptée à partir de maintenant. **La forme recommandée** : une durée n'a pas de fuseau, elle ne peut pas être mal lue |
| `--until 18h` · `18h30` | Aujourd'hui à cette heure, **à l'heure de la box, en UTC — pas la tienne**. La commande répond `compris : jusqu'au 12 oct. 19:20 UTC — dans 4 h 00` **avant** d'écrire : si la durée n'est pas celle que tu pensais, `revoquer` ou `prolonger` d'un mot. Une heure déjà passée est **refusée**, pas reportée à demain |
| `--until 2026-10-12T18:00` · `2026-10-12` | Ce jour-là à cette heure ; sans heure, jusqu'à la **fin** du jour (23:59:59) |
| `--uses 10` | Pour dix merges |

`--for` ou `--until`, l'un ou l'autre. **Partout où une échéance se montre** (`grant`, `status`,
la colonne d'état de l'app), la durée restante vient en tête et l'instant suit, **fuseau en
lettres** : `encore 58 min (jusqu'au 12 oct. 19:20 UTC)`. La box ne connaît pas ton fuseau et
n'a pas à le connaître ; le journal reste en UTC. `--uses` se donne seul ou avec une date — **le premier
atteint éteint le grant**. Une échéance qui ne se lit pas est refusée ; rien n'est écrit.

- **Il s'éteint seul** : un grant dont l'heure est passée ne vaut plus pour qui le lit, constaté ou
  non. L'extinction est un fait à elle (`grant.expired`), daté de l'**échéance** : `grant` lit
  `ÉTEINT SEUL depuis le …`, là où ton geste se lit `RÉVOQUÉ`. Échu runtime arrêté, il est éteint
  au redémarrage, avant toute décision.
- **À N usages, il décompte sur le merge fait, pas sur la tentative.** Un merge refusé, ou une
  livraison arrêtée que tu merges à la main, ne consomme rien. Une intention sans résultat
  **retient** un usage jusqu'à ce que GitHub dise son sort : mergée, il est **consommé** ; sinon
  **rendu**.
- **Une livraison verte arrivée après l'extinction s'arrête** (`no-grant`), et son issue comme sa
  ligne dans la file disent « le grant `merge` s'est éteint seul le … ».

#### Le prolonger, sans le révoquer

`prolonger merge` prend `--for`, `--until`, `--uses <n>` (n **de plus** que ce qu'il reste) ou
`--no-expiry` (lève l'échéance) : **un fait de plus** (`grant.extended`). **Prolonger ne
raccourcit pas** : une date plus proche, ou une limite posée sur un grant qui n'en avait pas, est
refusée — révoque puis réaccorde. Un grant éteint ou révoqué ne se prolonge pas, il se
**réaccorde** par `activer` ; `activer` sur un grant actif n'écrit rien et renvoie à `prolonger`.

### Voir la pass

```bash
npm --prefix runtime run pass              # les livraisons : phase, motif, renvois consommés, PR — l'état de la base en tête quand il compte, le bilan des arrêts sans grant en fin
npm --prefix runtime run pass -- 17        # l'histoire du ticket 17 : chaque verdict et ce qui l'a produit
npm --prefix runtime run pass -- 17 --json  # la même histoire pour l'app, avec le coût du ticket : un objet JSON {ticket, steps, cost}
```

```
BASE ROUGE depuis 2026-10-09T09:20:52.000Z (5d2e7b1) — après le merge de #17 : rien n'est jugé ni mergé, les livraisons attendent
#18  ARRÊTÉE — verte, non mergée (no-grant)  renvois 0/2  depuis 2026-10-08T14:20:03.000Z  https://github.com/benomite/brigade/pull/53
#20  REMONTÉE AU CHEF (unjudged : ci-silent)  renvois 0/2  depuis 2026-10-08T14:40:11.000Z  https://github.com/benomite/brigade/pull/55
```

`run pass -- <ticket>` déroule chaque fait : relecture, verdict (`verdict n° 412 : VERT — gates
vertes (code 0) · CI aucun check · reviewer rien de bloquant`, puis `jugé : 77c01de fusionné avec
la base 4be1f07`), renvoi, usage du grant, merge et l'identité GitHub qui l'a fait. Les deux
commandes n'écrivent jamais, et répondent pendant que le runtime tourne.

| Événement | Sens |
|---|---|
| `grant.activated`, `grant.revoked` | Les commandes du chef (hors ticket). `until`, `uses` : l'échéance, s'il y en a une |
| `grant.refused` | Le chef a demandé ce qu'aucun grant n'autorise : `action`, et `line`, la ligne qui l'interdit. Rien n'est accordé |
| `grant.extended`, `grant.expired` | Le chef prolonge (`until`, `uses` qui **s'ajoutent** ; nuls, la limite est levée) ; le grant s'est éteint seul (`cause` : `until` ou `uses` ; `since` : l'échéance) |
| `pass.entered` | Une livraison **hors du rail** entre en pass — la PR d'une passe de fermeture (`run`, `branch`, `pr`, `number`). Son `ticket`, et celui de tous les faits de sa pass, est le numéro de cette PR |
| `pass.started`, `pass.pr-opened` | La pass prend une livraison (run, PR, commit jugé) ; elle a ouvert la PR que la station n'avait pas pu ouvrir (`reconciled` : retrouvée après coup) |
| `pass.reviewed` | Le reviewer a relu la livraison du `run`, sur ce `sha` : `review`, `outcome` (`green`, `red`, `unreadable` + `reason`), `summary`, `findings`, `truncated`. Illisible, elle est suivie d'une autre sur le même `sha`, deux fois au plus |
| `pass.judged` | Le verdict, avec `sha`, `base`, `merged` (nul : la fusion ne se fait pas), `gates`, `ci`, `review`, `findings`, `judgeModified`, `declarations`, `noDiff` |
| `pass.served`, `grant.used` | Verte et sans diff, servie sans merge ; l'intention de merger, usage du grant — chacun avec le numéro du verdict qui l'autorise |
| `merge.done` | Mergée. `by` : `pass` ou `outside` ; `actor` : le compte GitHub ; `reconciled` : constaté après un redémarrage ; `unverified` : fait hors du runtime, la base est à contrôler |
| `merge.failed` | Le merge n'a pas abouti : `interrupted`, ou le refus de GitHub |
| `pass.held` | Verte, non mergée : `reason` (`no-grant`, `review-required`, `merge-refused`), `cause`, `expired` |
| `pass.waiting` | Ni jugée ni mergée pour l'instant : `base-red`, `machine-saturated`, `gates-cut-saturated` (avec le `sha` dont les gates ont été coupées). Elle repart seule |
| `pass.returned`, `pass.deferred`, `pass.outdated` | Rouge : renvoi `n` sur 2, avec les findings ; la main passe au manager ; GitHub exigeait une branche à jour et a refusé le merge, `findings` repart au cook |
| `pass.escalated` | Remontée au chef : `reason` (`still-red`, `unjudged`, `manager-split`), `cause` |
| `pass.pr-closed` | La PR a été fermée sans merge : la pass ne juge, ne renvoie ni ne merge plus cette livraison. Écrit une fois |
| `pass.abandoned` | Le ticket a quitté le rail sans que sa livraison soit mergée : `branch`, `pr` (encore ouverte, ou nul), `merged`, `closed`. Une intention de merge en vol y trouve sa fin |
| `base.checked` | Hors ticket. Les gates jouées sur la base seule : `sha`, `outcome` (`green`, `red`, `skipped`), `gates`, `tickets` ; sur un `skipped`, `red` (le rouge qui reste) et `reason` (l'essai ne s'est pas fait) |
| `base.recheck-requested`, `base.recheck-held` | Un rejeu est demandé — par le chef (`run base -- replay`), ou par la pass, une fois par rouge (auteur `pass`) ; la machine saturée le retient (`resource`, `observed`, `limit`) |
| `base.repair-opening`, `base.repair-opened` | Le rouge a tenu après son rejeu : la création du ticket de réparation est annoncée (`sha`), puis le ticket est né, sous son numéro (`sha`, `failures`, `reconciled` : retrouvé sur GitHub plutôt que créé) |
| `base.check-held`, `base.check-resumed` | La base ne se rapatrie pas (`reason`, une fois par cause) ; elle se rapatrie de nouveau |

`pass.rehearsed`, `pass.base-moved` et `pass.replayed` ne s'écrivent plus : un journal qui les
porte se relit.

### Ce qui reste après un cook

Chaque cook a son worktree (`worktrees/<run>`) et sa branche locale (`cook/<run>`) dans le clone de
la station. Tu n'as rien à faire.

| Ce qui reste | Quand il part |
|---|---|
| **le worktree** du cook, avec ce que le projet ignore | à la fin du cook, quelle qu'elle soit ; ou au démarrage suivant, si le runtime a été tué |
| **la branche locale** `cook/<run>` | une fois le ticket **servi** ou **sorti du rail**, si tous ses commits sont sur l'origine. Sinon elle reste, sans bruit |
| **la branche distante** | jamais par le runtime (réglage GitHub *Automatically delete head branches*) |

**Ce qui traîne est commité d'abord**, au nom de `brigade` : fichiers suivis modifiés, fichiers
neufs que le projet n'ignore pas. Pour une livraison, ce commit part avec elle (voir « Le cook ne
livre pas, la station récolte ») ; sinon il reste sur la branche locale, **jamais poussée**.
Retrouver le travail d'un cook raté — le nom de la branche est dans le commentaire de l'issue :
`git -C <clone> log --stat <base>..cook/<run>`.

**Ce qui ne se range pas est dit, et rien n'y est touché** (`worktree.kept` ; `journalctl`,
`status`) : un worktree qui n'est plus sur sa branche, qui n'est plus un worktree, un `git` qui
échoue. Le runtime réessaie à chaque tick. Pour le lever, lire `detail` : `git switch cook/<run>`
ou `git rebase --abort` dans le worktree ; sinon `git -C <clone> worktree remove --force
<worktree>`. Tant qu'il dure, un renvoi sur sa branche attend dix minutes (`worktree-failed`).

Au journal : `worktree.removed` (`worktree`, `branch`, `harvest` — le commit de ce qui y traînait,
ou `null`), `worktree.kept` (`reason`, `detail` ; écrit une fois), `branch.removed`.

**N'élague rien dans le clone de la station** (`git fetch --prune`) : « absent de l'origine » s'y
lit sans réseau, et une branche mergée en *squash* y serait gardée à tort. Seuls les worktrees que
le journal raconte sont touchés.

### Ce que la pass ne garantit pas

- **« Seule la pass merge » se clôt par une identité GitHub par rôle, et seulement là où tu l'as
  posée** (les trois Apps et la règle de branche de « Une identité GitHub par rôle »). Ce qui
  reste non garanti :
  - **Le cook tourne sous le compte Unix du runtime.** Sans cloison, il lit ce que ce compte lit :
    les clés des Apps, un `gh auth login` ou une clé SSH restés sur la machine. **La cloison le
    clôt** pour ce qu'elle masque (`/etc/brigade`) ; `~/.config/gh`, `~/.ssh` ne le sont que si tu
    les ajoutes à `BRIGADE_SANDBOX_HIDDEN` (voir « La cloison »). Sans elle, les secrets du projet
    ne sont cloisonnés que par les droits de fichiers (voir « Les secrets du projet »).
  - **Le runtime tient les trois clés** : une faille du runtime vaut les trois rôles.
  - **La règle de branche est un réglage du dépôt**, que le runtime ne vérifie pas. Sans elle,
    l'identité cook (`contents: write`) peut pousser sur la branche d'intégration.
  - **Les humains du dépôt gardent leurs droits** : un merge à la main se lit `outside`, et la
    base est contrôlée après coup.
  - **Un ticket qui touche `.github/workflows/` ne se livre pas** sous l'identité cook, qui n'a
    pas le droit `workflows` : le cook échoue (`push-failed`), le travail reste sur sa branche
    locale, à pousser à la main.
  - **Sous l'identité unique** — sans `BRIGADE_GITHUB_APPS_DIR` — rien de tout cela n'est clos :
    cook et pass passent par le même `gh`, et ce qui retient un cook est la liste d'outils
    interdits au lancement, **de bonne foi**. Le runtime le dit à chaque démarrage. Une protection
    de branche peut encore y interdire tout push direct (`installer.md`, « Protéger la branche
    d'intégration »).
- **Les gates jouées sont celles de la fusion — donc celles du cook, s'il y a touché —**, avec les
  droits du runtime. D'où la règle `review-required`.
- **Ce qui est jugé est la fusion avec la base du moment**, mais : un merge fait **à la main**
  peut se glisser entre le dernier regard sur la base et l'appel à GitHub (il déclenche un
  contrôle de la base) ; **une base cassée n'est vue rouge que quand quelque chose la fait juger**
  — un push direct n'y suffit pas — et le reste tant que tu ne l'as pas réparée ou fait rejouer ;
  une livraison arrêtée n'est pas rejugée quand la base bouge ; **la CI et le reviewer jugent le
  commit de la branche, pas la fusion**. Pour la CI, la pass en tire une seule conséquence : un
  rouge sur une branche qui n'a pas la tête de la base n'est pas un verdict (voir « La CI dit »).
  « Sans la tête de la base » se lit dans le clone — la base rapatriée a-t-elle des commits que le
  commit livré n'a pas ? —, pas chez GitHub : un workflow `pull_request`, qui juge un *merge ref*
  que le clone n'a pas, est tenu pour périmé au même test, même s'il a tourné après le dernier
  mouvement de la base. **Deux non-actions, voulues** : la pass ne demande jamais à GitHub de
  rejouer une CI, et **le reviewer n'est pas relu quand seule la base a bougé** — son objet est le
  travail du cook, qui n'a pas changé.
- **Le reviewer est un modèle, du même moteur que le cook** : il peut partager son angle mort, et
  se laisser convaincre par ce qu'il relit. **« Sans droit d'écriture » tient à sa liste
  d'outils**, pas à une clôture du système. Il n'a pas d'identité GitHub : la pass publie sa
  relecture.
- **Un ticket sorti du rail ne ferme rien derrière lui**, et son départ n'est vu qu'au sondage.
- **Un fichier neuf que le projet n'ignore pas part dans la PR**, si le cook l'a laissé dans une
  livraison. Le reviewer est prévenu ; la seule garde est le `.gitignore` du projet.

## L'état de la cuisine

**La cuisine est un état, par projet, sur la box** — pas un écran, et pas l'étape d'un ticket :

| Le mot | Ce qu'il désigne |
|---|---|
| **la cuisine** d'un projet | son état : `ouverte`, `retenue`, `arrêtée`, `éteinte` (plus bas, « L'état du projet »). C'est elle que `garde-fous -- stop` arrête et que `reprendre` rouvre — au journal, `kitchen.stopped` et `kitchen.resumed` |
| **`en cuisine`** | l'étape d'un ticket qu'un cook tient (`pris` sur le rail) : dans la liste des tickets d'une épique et dans `pass` |
| **Tous les projets** | l'écran d'ensemble de l'app (`docs/app.md`). L'app est une fenêtre sur le Mac : la fermer n'arrête aucune cuisine, et arrêter une cuisine ne la ferme pas |

Une seule commande pour savoir où en est le projet, sans ouvrir la base :
`npm --prefix runtime run status` — suivie de `-- --follow [<ticket>]`, elle reste ouverte et
ajoute une ligne par événement.

```
attend     2 décisions attendent le chef — la plus ancienne depuis 2 j
  #12  depuis 2 j  livraison verte, non mergée faute de grant `merge` — à merger à la main : https://github.com/benomite/brigade/pull/31 — ou accorder le grant, pour les suivantes : `npm --prefix runtime run grant -- enable merge`  Le journal en ajout seul
  #21  depuis 3 h 02  BLOQUÉ : #17 abandonné (label `fire` retiré) — à débloquer : remettre #17 sur le rail, ou le retirer de la ligne `attend` de la fiche  L'export du journal
  sans grant, 4 livraisons vertes arrêtées : 3 mergées à la main, 0 fermée sans merge — aucun désaccord —, 1 encore ouverte
fin attend
```

| Bloc | Ce qu'il dit |
|---|---|
| `rien ne cuit` | **Toute première ligne, absente sinon.** La base est rouge et son ticket de réparation la travaille : `rien ne cuit : base rouge depuis <durée>, réparation #N en cours`. Une seule ligne, **hors du bloc `attend`** — rien n'y attend le chef pendant la réparation —, et la liste des tickets retenus reste où elle est. Elle disparaît au retour au vert ; une réparation échouée ne la porte plus : c'est la ligne `base` du bloc `attend` qui la remplace. L'app la pose telle quelle sur la carte du projet |
| `runtime` | En marche, arrêté, ou jamais démarré — **d'après le journal**. Un runtime tué sans préavis y paraît encore en marche : c'est l'**âge du dernier tick** qui le trahit. Au-delà de quelques cadences : `systemctl status brigade@<projet>` |
| `cuisine` | Le « stop » du chef et le disjoncteur, comme `run guardrails` |
| `connexion` | **Absent tant que la connexion Max tient.** Sinon, par station : `Max ABSENTE` ou `EXPIRÉE`, depuis quand, la raison, et le geste — `claude /login` sous le compte du service ; la cuisine reprend seule dans la minute. Plus aucun ticket n'est pris d'ici là. Voir « Connexion Max expirée » |
| `grant` | **Absent tant qu'aucun grant ne vaut ni ne s'est éteint seul.** Actif : son échéance, ce qu'il en reste, ses usages. `BIENTÔT ÉTEINT` : moins d'une heure, ou un seul usage. `ÉTEINT SEUL` : la pass s'arrête à la PR ouverte jusqu'à ce que tu le réaccordes. Voir « Le grant `merge` » |
| `setup` | **Absent tant que le setup du projet n'est pas bloqué.** Bloqué : `BLOQUÉ depuis <durée> sur <commit>` — aucun setup n'est lancé d'ici, pour aucun ticket, tant que la branche d'intégration ne bouge pas. La cause et le geste sont dans le bloc `attend` (entrée `setup`). Voir « Le setup du worktree passe avant le cook » |
| `base` | **Absent tant que la base n'est pas rouge** — sauf si son contrôle est retenu parce qu'elle ne se rapatrie pas. Rouge, elle retient toute la cuisine : depuis quand, sur quel commit, le contrôle qui n'a pas pu se jouer, le rejeu demandé. Sans demande en cours, la dernière ligne est le geste : `npm --prefix runtime run base -- replay`. Voir « La base est jugée seule » |
| `sauvegarde` | La dernière sauvegarde réussie (`backup.completed`) : son âge, son nom, son dernier événement. `TROP VIEILLE` : l'âge dépasse `BRIGADE_BACKUP_MAX_AGE_HOURS`. `JAMAIS FAITE` : le journal n'en porte aucune. Dans les deux cas : `systemctl status brigade-sauvegarde@<projet>` |
| `attend` | **Toujours là**, de sa ligne `attend` à sa ligne `fin attend`. Quand rien ne t'attend, il le dit : `rien n'attend le chef`. Voir « Ce qui attend le chef », ci-dessous |
| `rail` | Le décompte par état, puis chaque ticket dans l'ordre de service. Un ticket pris porte deux durées : depuis la prise, et **sans progrès** (depuis que sa station a vu son worktree bouger). `COINCE` : la moitié de son bail est passée sans progrès, ou son bail est échu et il est encore pris. Un ticket en attente qui ne part pas dit ce qu'il attend — un autre ticket, une zone tenue, ce qui retient sa station ; `BLOQUÉ` : ce qu'il attendait a été abandonné (voir « Le rail »). Un ticket en pass dont les gates ont été coupées sur une machine saturée finit par `— gates rejouées plus tard : machine saturée, aucun test en échec` |
| `cooks` | Combien tournent, et le plafond de la station. **Si un cook coince, la ligne le nomme** (`— 2 COINCENT : #14, #22`). Dessous, `MACHINE SATURÉE` avec ce qui manque, et `SE RETIENT` avec la raison. Puis une ligne par cook, **le pire en tête** ; jugements et relectures à la fin, sans branche. Tours et tokens sont ceux du dernier relevé, dont l'âge est affiché ; la ligne finit par ce que le cook fait (`en ce moment : lit runtime/src/etat.ts, depuis 2 min`) quand son relevé le dit. Runtime arrêté, un cook encore listé est mort avec lui |
| `consommé` | Ce que l'ensemble des lancements a consommé — cooks, relectures, jugements : en cours, 5 h (la fenêtre du quota Max), 24 h |
| `worktrees`, `dérive`, `claude` | **Absents quand il n'y a rien à dire** : les worktrees que le runtime n'a pas pu ranger (« Ce qui reste après un cook ») ; les mesures qui ont franchi un seuil déclaré (« Le relevé des mesures ») ; sous cloison, le dernier rangement des transcripts (« Les transcripts du projet sont rangés ») |
| `derniers événements` | Les quinze derniers, au format de `run log`, sans battements ni relevés |

### Ce qui attend le chef

La cuisine ne bloque jamais sur toi : ce qui t'attend s'empile, le plus ancien d'abord, et le reste
avance. Chaque entrée **nomme le geste qui la débloque** — ou dit qu'aucun n'est connu pour son
motif — et sort **d'elle-même** dès que le journal porte la décision prise, y compris sur GitHub.
Fermer une PR sans la merger n'est qu'une demi-décision : l'entrée ne sort pas, elle change.

| Entrée | Le geste | Ce qui la retire |
|---|---|---|
| `livraison verte, non mergée faute de grant` · ``… le grant `merge` s'est éteint seul le …`` (`no-grant`) | merger sa PR à la main ; ou accorder le grant pour les suivantes : `npm --prefix runtime run grant -- enable merge` | le merge à la main, que la pass constate (`merge.done`) ; le ticket sorti du rail (`ticket.left`) ; un cook reparti sur le ticket. Sa PR fermée sans merge la remplace par `PR fermée sans merge` |
| `livraison verte qui touche à ses juges` · `… à ce que le projet s'ouvre (<fichiers>)` (`review-required`) | la relire, puis la merger à la main | de même |
| `livraison verte, merge refusé par GitHub (…)` (`merge-refused`) | lever ce que GitHub refuse, puis merger à la main | de même |
| `remontée par la pass, rouge (still-red : returns-exhausted)` · `remontée par le manager, rouge` | à trancher : merger sa PR à la main, ou retirer `fire` ; sans PR, retirer `fire` ou fermer l'issue. Détail : `run pass -- <ticket>` | le merge à la main ; le ticket sorti du rail, ou rendu au rail (`ticket.released`). Sa PR fermée sans merge la remplace de même |
| `remontée par la pass, qui n'a pas pu la juger (unjudged : <cause>)` | à lever : ce que dit son issue, puis retirer et reposer `fire` ; ou merger à la main, ou retirer `fire` | de même |
| `PR fermée sans merge` | le ticket tient encore sa place sur le rail : retirer `fire`, ou fermer l'issue | le ticket sorti du rail, ou rendu au rail s'il était 86 ; la PR rouverte puis mergée à la main. Un ticket redécoupé n'y entre pas |
| `sans calibrage` · `fiche illisible` · `refusé trois fois par le modèle` | un 86 de la station **sans heure de retour** : poser `model:` et `effort:`, corriger la fiche, ou — refusé — reformuler ou recalibrer puis retirer et reposer `fire` | calibré ou corrigé, la station le rend seule au rail ; le ticket sorti du rail |
| ``aucune station ne fournit `<capacité>` `` · ``… à la fois `<a>` et `<b>` `` (86 `no-station: …`) | déclarer une station qui la fournit par `station stations …` (lue sans redémarrage) ; ou la retirer de la ligne `requiert` de la fiche | au redémarrage, une station déclarée la fournit ; la fiche corrigée ; la station le rend seule au rail (`capabilities-reread`) ; le ticket sorti du rail |
| `BLOQUÉ : #N abandonné (…)` | remettre #N sur le rail, ou le retirer de la ligne `attend` de la fiche | #N revenu (`ticket.arrived`) ; la fiche corrigée (`ticket.changed`) ; le ticket sorti du rail |
| `revenu de WAITING, repris par le chef (il attendait <qui> : « <quoi> »)` | un ticket qui n'était pas mis de côté avant d'attendre un tiers, repris (`attente -- reprendre`) : `attente -- arrive <N>` le renvoie en cuisine ; `attente -- poser <N> …` le remet en attente ; ou retirer `fire`. **Un ticket en WAITING n'est jamais dans ce bloc**, quoi qu'il attendait avant : il attend un tiers, pas toi | « c'est arrivé » (`ticket.resumed`, `kitchen`) ; remis en WAITING ; le ticket sorti du rail |
| ``écartée par le manager, elle porte `question` `` · `` `decision` `` · ``retenue, elle porte `blocked-on-human` `` | répondre, décider ou lever la retenue, puis retirer le label ; ou fermer l'issue | le label retiré, le manager la juge ; l'issue fermée (`manager.closed`) ou lancée à la main |
| `jugement du manager illisible` · `découpage du manager illisible` · `question du manager avant de découper l'épique` | modifier l'issue pour qu'elle soit reprise, ou répondre à la question sur l'issue ; pour un ticket, poser `fire`, `model:` et `effort:` à la main ; ou fermer l'issue | l'issue modifiée, ta réponse, l'issue fermée ou lancée à la main ; toute décision suivante du manager qui n'y voit plus une épique à découper |
| `connexion Max absente` · `expirée` | la ligne porte la station, pas un ticket : `claude /login` sous le compte du service — la cuisine reprend seule | le passage réussi du renouvellement (`session.restored`) ; le « reprendre » (`kitchen.resumed`) |
| `session Max près de son échéance` · `renouvellement de la session Max en échec (<nature>)` | la ligne porte la session, pas un ticket : `claude /login` sous le compte du service, puis `run guardrails -- resume`. Voir « La session Max : renouvellement et alerte » | le renouvellement réussi suivant ; le « reprendre » (`session.reconnected`) |
| `jeton de la connexion Max près de son échéance` · `… ÉCHU` · `date de création du jeton … absente` / `illisible` | la ligne porte `jeton`, pas un ticket — une seule, annoncée trente jours avant l'échéance du jeton longue durée : refaire le jeton (`claude setup-token` sous le compte du service, par l'étape de connexion Max). Voir « L'échéance du jeton longue durée » | le jeton refait, qui porte une date de création neuve (`token.observed`) |
| ``BASE ROUGE sur <commit>, en échec : <ce qui échoue> — sa réparation #N <ce qu'elle est devenue>`` | la ligne porte `base`, pas un ticket, et se compte **depuis le passage au rouge**. **Elle n'apparaît que si la réparation a échoué** — partie du rail sans service, remontée, ou mergée sans remettre la base au vert — : un rejeu, une réparation qui s'ouvre ou qui travaille ne sont pas à ta charge. Ce qui échoue est ce que les gates nomment (`FAIL …`) au dernier contrôle rouge. Le geste : corriger la base à la main — la pass la rejoue dès qu'elle bouge ; ou relancer la réparation non servie (lui reposer `fire`, ou le retirer et le reposer) ; un rouge qui ne tient pas au code se rejoue : `run base -- replay` | la base revenue au vert (`base.checked`, `green`) : la cuisine repart seule, sans commande ; la réparation relancée, qui travaille de nouveau |
| ``setup impossible : la porte refuse `<hôte>` (…)`` · ``setup impossible : `.claude/brigade/worktree-setup.sh` échoue deux fois à l'identique (<motif>)`` | la ligne porte `setup`, pas un ticket — **une seule pour le projet**, quel que soit le nombre de tickets retenus —, et se compte depuis le blocage (`setup.blocked`). Un hôte refusé se déclare dans `.claude/brigade/reseau` du projet, une ligne par hôte, mergée sur la branche d'intégration ; sans hôte refusé, le setup est à corriger, puis merger — l'entrée nomme l'issue où lire ce qu'il a dit | la branche d'intégration qui bouge (`setup.unblocked`) : les setups reprennent seuls, sans commande. Le même échec sur la nouvelle base la fait revenir |
| ``tickets mis de côté : <cause> (<motif>, deux fois à l'identique) — un seul est repris à la fois…`` | la ligne porte `aside`, pas un ticket — **une seule pour le projet**. Elle dit la cause, le ticket qui l'a vue et le geste ; elle tombe seule quand un cook part, qu'une autre cause se présente ou que la branche d'intégration bouge |

Dès qu'une livraison a été arrêtée faute de grant, le bloc se termine par **le chiffre sur lequel
accorder** : `sans grant, N livraisons vertes arrêtées : X mergées à la main, Y fermées sans merge — Y
désaccords —, Z encore ouvertes`. Une PR fermée sans merge est un désaccord : tu as refusé ce que
la pass aurait mergé. La file vide, le bloc ne porte pas ce chiffre : la même ligne se lit dans
`run pass` et `run grant`.

**Le bloc est toujours là, et il a un bord.** Quand rien ne t'attend, il le dit au lieu de se
taire — un silence ne se distinguerait pas d'une lecture ratée :

```
attend     rien n'attend le chef
fin attend
```

Il commence à la **seule ligne de la sortie qui commence par `attend`** et finit à la **seule
ligne qui vaut exactement `fin attend`**, bornes comprises ; tout ce qu'il porte entre les deux est
en retrait — une entrée de deux espaces. Qui veut le présenter à part — l'app, le second (le rôle PO, `/brigade:po` : un seul
rôle sous deux noms) — le prend par ces deux lignes, sans rien lire de ce qu'il dit : ni compter ses entrées, ni chercher la ligne vide qui le suit, ni
reconnaître une tournure. **Une seule chose s'y lit en plus, et l'app la lit** pour ranger son rail : le
numéro de ticket **en tête** d'une entrée — deux espaces, `#`, des chiffres, deux espaces (`  #12  depuis 2 j  …`). Cette
tête ne change pas sans que l'app change (`docs/app.md`, « Le numéro qu'elle y lit ») ; une entrée
qui porte une station, `session`, `base` ou `setup`, et le bilan des arrêts faute de grant, n'en ont pas. Le bord vaut pour l'état lui-même : sous `--follow`, les événements
ajoutés ensuite n'en font pas partie.

- **Activer le grant ne vide pas la file** : il vaut pour les livraisons suivantes, pas pour celles
  déjà arrêtées, qui restent à merger à la main.
- **Ce que le bloc ne compte pas** : un ticket redécoupé par le manager (`manager-split`) ; un 86
  qui a une heure de retour ; ce qui attend sans toi (`COINCE`, `SE RETIENT`, `MACHINE SATURÉE`, le
  bloc `base`) ; les autres écarts du manager, qui se lisent dans `run manager`.
- **Ce que le manager attend de toi : fermer l'issue suffit** (`manager.closed`, constaté au
  sondage suivant). Ces lignes n'ont pas de titre. Manager éteint, rien n'est sondé : la file garde
  ce qu'il attendait jusqu'à ce que tu le rallumes.

La commande lit `$BRIGADE_STATE_DIR`, n'écrit
jamais, et répond pendant que le runtime tourne ; sur un journal écrit par un runtime plus ancien,
elle demande de le redémarrer. `BRIGADE_BACKUP_MAX_AGE_HOURS` : un entier d'heures, 1 au moins,
`48` par défaut, lu dans l'environnement de **celui qui lance `status`** ; mal écrite, refus
(code 2). La marque ne change pas le code de sortie, et rien n'alerte hors de `status`.

### Les faits, pour un programme

`status` et `rail` sont écrits pour être lus par toi. Un programme qui dessine — l'app : une
pastille par projet, cinq compteurs, le rail — ne doit rien déduire d'une phrase. Il lit
`brigade <projet> facts` (`npm --prefix runtime run facts` sur le poste de dev) : **la lecture de
`status`, autrement dite**. Les mêmes projections, lues une fois, par le même geste — ni port, ni
API, ni seconde vérité.

**Cette forme est un contrat.** Un objet JSON, sur une seule ligne ; ses champs, leur ordre, ses
mots ne changent pas sans que son lecteur change, et `runtime/test/faits.test.ts` la fige au
caractère près. Tout le reste de ce que le runtime dit — `status`, `rail`, `station`, le journal —
est du texte, et peut être reformulé.

```json
{"etat":"ouverte","lu":"2026-10-12T10:04:11.000Z","dernierTick":"2026-10-12T10:04:02.000Z","compteurs":{"rail":2,"auTravail":1,"aLaPass":1,"attend":1,"livres24h":3},"dernierEvenement":{"seq":812,"at":"2026-10-12T10:03:58.000Z","type":"merge.done","ticket":216},"rail":[{"ticket":14,"etat":"pris","titre":"Le journal en ajout seul","url":"https://github.com/benomite/brigade/issues/14","activite":{"fait":"lit","cible":"runtime/src/etat.ts","depuis":"2026-10-12T10:01:11.000Z"},"attente":null},{"ticket":21,"etat":"BLOQUÉ","titre":"L'export du journal","url":"https://github.com/benomite/brigade/issues/21","activite":null,"attente":null}],"cooks":[{"ticket":14,"titre":"Le journal en ajout seul","station":"box/claude"}],"attend":[{"ticket":21,"titre":"L'export du journal","url":"https://github.com/benomite/brigade/issues/21"}],"livres":[{"ticket":216,"titre":"Le relevé des mesures","url":"https://github.com/benomite/brigade/issues/216","livre":"2026-10-12T10:03:58.000Z","station":"box/claude","pr":"https://github.com/benomite/brigade/pull/219","relecture":{"resume":"Le relevé des mesures se lit par station, et un seuil franchi se dit en tête de `status`. Rien n'est écrit au journal par la lecture.","constats":[{"gravite":"remarque","fichier":"runtime/src/mesures.ts","constat":"Le seuil par défaut est répété dans deux fichiers."},{"gravite":"remarque","fichier":null,"constat":"À supprimer : l'ancien compteur, qui ne sert plus."}]}},{"ticket":201,"titre":"Les grants sous plafond","url":"https://github.com/benomite/brigade/issues/201","livre":"2026-10-12T07:12:40.000Z","station":"box/claude","pr":"https://github.com/benomite/brigade/pull/207","relecture":{"resume":"Un grant porte désormais un plafond d'usages, et s'éteint seul quand il est atteint.","constats":[]}},{"ticket":188,"titre":"Une fiche sans zone","url":"https://github.com/benomite/brigade/issues/188","livre":"2026-10-11T16:30:05.000Z","station":"box/claude","pr":null,"relecture":null}]}
```

| Champ | Ce qu'il porte |
|---|---|
| `etat` | L'état du projet, en un mot de la liste fermée ci-dessous |
| `lu` | L'heure de la box à la lecture |
| `dernierTick` | L'heure du dernier tick du runtime en marche. `null` : runtime arrêté, ou aucun tick depuis son démarrage |
| `compteurs.rail` | Les tickets en attente, `BLOQUÉ` compris |
| `compteurs.auTravail` | Les tickets `pris` |
| `compteurs.aLaPass` | Les tickets `en pass` |
| `compteurs.attend` | Les décisions qui t'attendent : le chiffre de la ligne de tête du bloc `attend` |
| `compteurs.livres24h` | Les tickets servis dans les 24 h avant `lu` — mergés par la pass, mergés à la main, ou servis sans merge —, encore sur le rail ou non. Un ticket compte une fois |
| `dernierEvenement` | `seq`, `at`, `type` et `ticket` (`null` hors ticket) du dernier des « derniers événements » de `status` : ni battement, ni relevé. Sans sa charge utile. `null` sur un journal vide |
| `rail` | Chaque ticket, dans l'ordre de service : `ticket`, `etat`, `titre`, `url` (son issue), `activite` — ce que la cuisine en fait en ce moment : `fait` (le geste, en mots du chef), `cible` (le fichier ou la commande qu'il vise, `null` s'il n'en vise pas), `depuis` (l'heure où elle s'y est mise). **`null` pour un ticket ni pris ni en pass, et pour celui dont le runtime ne sait pas ce qu'on en fait.** Voir « Ce que fait un cook en ce moment » ; `attente` — pour un ticket mis de côté (86), **ce qu'il attend** : `raison` en clair (`attend : setup du projet impossible`, `attend : quota du compte épuisé`, `attend : worktree impossible à préparer`…), `colonne` (celle où il est, comme `etat`) et `retour` (l'heure de son retour, `null` sans) ; `null` pour tout autre ticket ; `tiers` — pour un ticket en WAITING (`etat` : `WAITING`), **ce qu'il attend d'un tiers** : `quoi` (dans les mots du chef), `qui`, `depuis` (sa mise en attente), `relance` (quand y revenir) et `aLArrivee` (ce que « c'est arrivé » fera de lui, en clair) ; `null` pour tout autre ticket ; `revenu` — pour un ticket revenu de WAITING dans TODO, **pourquoi**, dans les mots du runtime : `relance du 21/10 : pas de réponse` ou `nouveau sur l'issue — de <qui>` ; `null` pour tout autre, et pour un ticket que le chef a repris lui-même ; `captures` — **pour un ticket d'interface en pass ou servi**, l'écran avant et après de sa dernière livraison (voir « La livraison d'un ticket d'interface ») : `complet` (chaque écran a ses deux captures — `false` aussi quand il n'y en a aucune) et `ecrans`, chacun avec `ecran`, `avant` et `apres`, l'adresse de la capture au commit livré, `null` quand le cook ne l'a pas livrée. **Absent pour tout autre ticket**, et quand la box ne connaît pas son dépôt |
| `cooks` | Les cooks en cours, ceux que `station` montre sous « cooks en cours », dans son ordre — station par station, le plus ancien d'abord : `ticket`, `titre` (celui du ticket), `station`. Une liste vide quand aucun ne tourne. Le titre est celui du rail : vide (`""`) si le ticket l'a quitté pendant la cuisson |
| `attend` | Les tickets que le bloc `attend` de `status` nomme, un par entrée, dans l'ordre du bloc : `ticket`, `titre`, `url`. **C'est l'adresse qui ouvre l'issue** : celle du rail pour un ticket qui y est, sinon celle que **le dépôt de la box** donne (`BRIGADE_GITHUB_REPO`) — l'app n'en compose aucune. Le titre est celui du rail, **vide (`""`) pour une issue qui n'y est pas** : le journal ne le connaît pas, et rien ne va le chercher. `url` est `null` quand la box ne connaît pas son dépôt. La connexion Max, la version, la passe de fermeture demandée, la base rouge et le setup bloqué, qui ne sont à aucun ticket, n'y sont pas — `compteurs.attend` les compte. Une liste vide quand rien n'attend |
| `livres` | Les tickets servis dans les 24 h avant `lu` — **ceux que `compteurs.livres24h` compte, un pour un** —, le plus récent d'abord : `ticket`, `titre`, `url` (son issue), `livre` (l'heure de son service), `station` (celle qui l'a cuisiné, `null` quand aucune ne l'a envoyé en pass — mergé à la main sans cook, livraison hors du rail), `pr` (la PR mergée, `null` pour un ticket servi sans merge), `relecture` (ce que le reviewer a dit de **ce qui a été servi**, mot pour mot : `resume`, son résumé ; `constats`, dans son ordre, chacun avec `gravite` — `remarque` ou `bloquant` —, `fichier` — `null` quand il n'en nomme pas — et `constat`, son texte ; une suppression qu'il demande est une `remarque` dont le texte commence par « À supprimer : »). `relecture` est `null` quand aucune relecture lisible ne porte sur la livraison servie : mergée à la main sans passer à la pass, servie sans relecture, relue sur un commit d'avant celui que la pass jugeait en dernier, ou dont la dernière relecture ne se lit pas — **rien n'est mis à sa place**, pas même une relecture d'une livraison d'avant. Une relecture rouge mergée à la main par le chef est la sienne : ses constats bloquants y sont. **Un ticket y reste après la fermeture de son issue** : il a quitté le rail, pas la liste — elle se relit au journal, titre et adresse compris. Le titre est celui du jour, vide (`""`) pour une livraison que le rail n'a jamais portée ; `url` est alors celle que le dépôt de la box donne, ou `null`. **Une issue fermée sans avoir été servie** — abandonnée, écartée — **n'y est pas**. `captures` : comme sur le rail, pour un ticket d'interface — absent pour tout autre. Une liste vide quand rien n'a été servi en 24 h |
| `stations` | Les stations que le projet déclare, dans l'ordre de leur nom, et ce qu'elles font des **tickets ordinaires** (voir « Les tickets ordinaires sur le poste du chef ») : `station`, `distante`, `plafond` (ses cooks à la fois, au plus — `null` : sans limite), `ordinaires` (le réglage du chef, `false` pour une station de la box), `bacASable` (ce que la station a dit du bac à sable de son poste : `disponible`, `raison` — `null` s'il l'est —, `version` de son `claude` — `null` s'il ne l'est pas —, `depuis` ; `null` tant qu'elle n'en a rien dit), `prendOrdinaires` (elle en prend à cet instant : toujours vrai d'une station de la box ; d'une distante, réglage et bac à sable disponible). Une liste vide quand aucune n'est déclarée |

Les heures sont en ISO 8601, UTC.

**L'état du projet** — le premier vrai l'emporte :

| Mot | Quand | Ce que `status` en dit |
|---|---|---|
| `éteinte` | le runtime est arrêté, ou n'a jamais démarré, d'après le journal | `runtime    arrêté il y a …`, `jamais démarré` |
| `arrêtée` | ton « stop » | `cuisine    ARRÊTÉE par le chef` |
| `retenue` | elle tourne, mais plus rien ne part : disjoncteur ouvert, connexion Max absente ou expirée, aucune station déclarée, base rouge, setup du projet bloqué sans station distante | `disjoncteur OUVERT`, la ligne `connexion`, `stations   AUCUNE DÉCLARÉE`, `base       ROUGE`, `setup      BLOQUÉ` |
| `ouverte` | rien de cela | |

**L'état d'un ticket** : le mot que `status` et `rail` écrivent — `en attente`, `BLOQUÉ`, `pris`,
`en pass`, `servi`, `86`.

Ces deux listes sont **fermées** : c'est sur elles qu'un lecteur pose une couleur. Elles peuvent
gagner un mot ; un lecteur montre donc un mot qu'il ne connaît pas tel quel, sans couleur. Le `type`
du dernier événement, lui, s'affiche et ne s'interprète pas : sa liste n'est pas fermée.

Ce que la forme ne dit pas, et pourquoi :

- **`ouverte` dit ce que dit le journal.** Un runtime tué sans préavis y paraît encore en marche,
  comme dans `status`. La forme ne conclut pas : elle porte `lu` et `dernierTick`, dont le lecteur
  affiche l'écart. Au-delà de quelques cadences, `systemctl status brigade@<projet>`.
- **Aucune jauge, aucun pourcentage** — ni quota, ni machine. Le runtime ne connaît pas la
  consommation du compte (`/usage` la donne) et ne chiffre la machine que lorsqu'elle sature : ce
  qu'il en dit d'un mot reste dans `status` et dans `station`, et aucun nombre ne s'en dérive.
  Un cook non plus n'a pas de jauge : ses tours, sa durée, ses tokens sont dans `status`.
- **Les relectures du reviewer et les jugements du manager** ne sont pas dans `cooks` : ce ne sont
  pas les cooks d'une station, et `station` ne les montre pas non plus.
- **Un `86` qui a une heure de retour** — le quota — n'est dans aucun des cinq compteurs : il
  n'attend ni une station, ni toi. Il est dans `rail`, avec son état.
- **Pourquoi** la cuisine est retenue, ce qu'un ticket attend, qui le tient, depuis quand : c'est
  `status`. Le journal, les grants, la cloison, l'arbitre n'ont pas de forme ; de la station, seuls
  ses cooks en cours en ont une.

La commande lit `$BRIGADE_STATE_DIR`, ne prend aucun argument, n'écrit jamais, et répond pendant
que le runtime tourne ; sur un journal écrit par un runtime plus ancien, elle demande de le
redémarrer (code 1).

## Le relevé des mesures

Les gates disent « ça marche », jamais « ça devient lourd ». Le relevé met côte à côte, **dans le
temps**, ce que le journal sait de la lourdeur du projet : c'est la pente qui révèle une dérive.

`npm --prefix runtime run measures` les montre par tranches de 10 merges ; `-- --by 25`, de 25.

Quand un ticket des dix derniers merges dépasse le seuil de coût de la dérive (`BRIGADE_DRIFT_TICKET_TOKENS`,
déclaré une seule fois), `measures` ajoute sous la ligne `FRANCHI` une ligne `motif de dérive` par ticket :
le nombre de passages, la part de tokens perdue au renvoi, et les renvois repartis de zéro faute de reprise
(ou « renvois repris »). Un ticket passé une fois dit sa taille d'une traite. Sous le seuil, aucun motif.

| Colonne | Ce qu'elle dit | D'où elle vient |
|---|---|---|
| `merges`, `jusqu'au` | La tranche : le rang de ses merges, le jour du dernier. L'axe est le **merge**, pas l'horloge | `merge.done` |
| `tests`, `suite` | Le nombre de tests et la durée de leur suite, à la dernière livraison de la tranche | `MESURE tests`, `tests_s` |
| `gates` | La durée des gates d'une livraison — médiane de la tranche | `MESURE gates_s` |
| `part gates` | Ce que les gates pèsent dans le temps d'une livraison, renvois et rejugements compris, rapporté à cette durée plus celle de ses cooks | `gates_s`, `durationMs` de `cook.exited` |
| `dépôt`, `doc` | Le poids de ce qui est commité, et de son markdown | `MESURE depot_octets`, `doc_octets` |
| `contexte` | Ce que **chaque** cook charge à coup sûr : le `CLAUDE.md` et ses imports `@chemin` | `MESURE contexte_octets` |
| `seuils`, `plafond` | Sous les tableaux : chaque seuil déclaré, `FRANCHI` ou non ; et le plafond de durée des gates, s'il a été franchi | `drift.configured`, `gates.overCeiling` |
| `fermeture` | Sous les seuils, quand l'un est franchi : la fermeture est proposée, avec le compteur franchi et son seuil. Rien n'est lancé — la passe qui écrit reste le geste du chef ; le franchissement est inscrit au journal une seule fois (`drift.crossed`) | `drift.crossed` |
| `pente` | De combien la mesure a été multipliée, de la première tranche montrée à la dernière | — |
| `tours` (second tableau) | Les tours d'un ticket, tous ses cooks comptés, par calibrage : médiane, et sur combien de tickets | `cook.launched`, `cook.exited` |
| `tokens` (troisième tableau) | Les tokens d'un ticket, la somme de tous ses lancements, par calibrage : médiane, sur combien de tickets, et le plus cher de la tranche avec son numéro. Aucun seuil | `cook.launched`, `cook.exited` |
| `lancements` (quatrième tableau) | Un ticket par ligne, pour ceux qui ont été lancés plus d'une fois ou dont un lancement n'a rien livré : combien de lancements — dont combien de renvois **repris** de la session du cook précédent —, leurs tokens, et ce qu'ils ont produit — `utiles`, `perdus` avec leur part. Aucun seuil | `outcome` et `tokens` de `cook.exited`, `resumes` de `cook.launched` |

- **`—` veut dire « le journal ne le sait pas »**, jamais zéro. Au-delà de douze tranches, seules
  les dernières sont montrées ; `--by` élargit la fenêtre.
- **Cher ou perdu : c'est la fin du cook qui le dit.** Un lancement a livré quand son `cook.exited`
  dit `ok` — la fin que la station donne au cook dont elle envoie le travail en pass. Ses tokens
  sont `utiles` : le prix de la livraison, renvois de la pass compris. Toute autre fin (`failed`,
  `guard`, `stop`, `refused`, `neutral`), ou pas de fin du tout — mort avec le runtime —, et ses
  tokens sont `perdus`. Un ticket à 650 k dont tout est utile est cher ; le même avec 450 k perdus
  est un défaut. Un lancement dont le journal ne sait pas les tokens est compté et signalé (`2, dont
  1 sans tokens connus`), dans aucune des deux sommes. Un ticket jamais mergé n'est pas au relevé,
  quoi que ses lancements aient coûté.
- **Repris ou reparti de zéro : la colonne `lancements` le dit.** Un ticket dont un renvoi a repris
  la session du cook précédent porte `3, dont 1 repris` (et la légende du tableau dit alors ce
  qu'est `repris`) ; un ticket dont les renvois sont repartis de zéro n'y porte que son nombre. La
  reprise ne change rien au calcul : un lancement repris qui livre est `utile`, perdu sinon, comme
  un autre.
- **Seules comptent les livraisons que la pass a jugées, puis mergées** ; la consommation est celle
  des cooks, pas du compte Max. Une livraison jugée puis mergée à la main derrière une autre ne dit
  pas l'état du projet, et aucun seuil n'est levé sur sa foi.
- La ligne `plafond` compte tout le journal : les livraisons mergées dont les dernières gates ont
  franchi leur plafond de durée. La pass ne le juge pas : il se suit ici.

### Ce que les gates déclarent

Les gates **peuvent** imprimer des lignes `MESURE  <nom>=<nombre>` — un nom en minuscules, chiffres
et tirets bas, un nombre à point ou à virgule, seuls sur la ligne. La pass les relève avec le
verdict (`gates.measures` de `pass.judged`, `base.checked`) : vingt au plus, la dernière valeur
d'un nom l'emporte. Elles ne jugent rien. Le relevé connaît `tests`, `tests_s` (secondes),
`gates_s` (secondes d'horloge), `depot_octets`, `contexte_octets` et `doc_octets` ; tout autre nom
est gardé au journal et ignoré. Le `.claude/brigade/gates.sh` de ce dépôt déclare les six.

Deux autres noms sont lus par **le bilan d'une passe de fermeture**, et par lui seul : `couverture`
(la couverture de tests, en pourcentage) et `verifications` (le nombre de vérifications que les
gates exécutent). Ce sont ses garde-fous — voir « Le bilan d'une passe ». Des gates qui ne les
déclarent pas laissent ces garde-fous **non établis**, jamais tenus ; celles de ce dépôt ne les
déclarent pas encore.

**Une exception au code de sortie, et une seule : le plafond de durée.** Des gates qui se donnent
un plafond et le franchissent l'écrivent sur deux lignes — `durée des gates : <x> s de processeur …
pour un plafond de <n> s — … de trop`, puis `FAIL  plafond des gates franchi : plus de <n> s de
processeur`. La pass garde le dépassement (`gates.overCeiling`) et **ne le juge pas** : seul rouge,
il laisse les gates vertes. Voir « Le plafond de durée des gates n'est pas jugé par la pass ».

### Les seuils, et ce qui te prévient

Un seuil se déclare dans l'environnement du runtime. **Aucun n'a de défaut** : non déclaré, il ne
signale rien ; mal écrit, le runtime refuse de démarrer.
`BRIGADE_DRIFT_TESTS` (nombre de tests), `BRIGADE_DRIFT_TESTS_SECONDS` (durée de la suite),
`BRIGADE_DRIFT_GATES_SECONDS` (durée des gates de la dernière livraison), `BRIGADE_DRIFT_CONTEXT_KB`
(contexte, en ko) et `BRIGADE_DRIFT_REPO_MB` (dépôt, en Mo) sont franchis quand la mesure les
dépasse ; `BRIGADE_DRIFT_MERGES`, quand le nombre de merges depuis la dernière fermeture
l'atteint ; `BRIGADE_DRIFT_GROWTH_PERCENT` — **la pente** —, quand `tests`, `suite`, `dépôt`,
`contexte` ou `doc` a grossi de plus que ce pourcentage en dix merges.

Deux seuils portent sur **le coût**, en tokens, sur les dix derniers merges, et se posent **par le
geste**, pas par une variable (`station seuil-ticket <entier>` et `station seuil-perdus <entier>`) :
le seuil du ticket — les tokens du ticket le plus cher, tous ses lancements comptés — et celui des
perdus — la somme des tokens des lancements qui n'ont rien livré. Franchis quand ils sont dépassés, nommés dans le bloc `dérive` avec leur valeur et
leur seuil. **Aucune valeur par défaut** : c'est le quota du chef. Un seuil de coût franchi se lit
seulement — il ne rend rien rouge, n'arrête aucun cook et ne bloque aucune livraison.

Les seuils entrent au journal quand ils changent (`drift.configured`). Quand un merge en fait
franchir un, le runtime écrit `drift.crossed` et une ligne dans `journalctl -u brigade@<projet>`,
**une fois** ; repassée sous son seuil, ou le seuil retiré, `drift.cleared`. Entre les deux, le bloc
`dérive` de `status` le rappelle. Rien n'est arrêté, aucune issue n'est ouverte.

## La fermeture qui observe

Le relevé dit ce que le projet **pèse** ; la fermeture qui observe dit ce qu'il **n'a pas retiré**.
`npm --prefix runtime run closing` (`brigade <projet> closing` sur la box) lit la branche
d'intégration du clone du projet — `origin/<BRIGADE_BASE_BRANCH>` dans `BRIGADE_REPO_DIR`, telle
que le dernier rapatriement l'a laissée — et imprime trois choses :

| Bloc | Ce qu'il dit | Comment c'est compté |
|---|---|---|
| `ratio` | Les lignes ajoutées et retirées (`+ajouté / −retiré`) et leur rapport, sur les 20, 50 et 100 derniers merges | Les commits de merge de la branche, chacun contre son **premier parent** : ce que le merge lui a apporté. Un commit posé droit sur la branche n'est pas un merge ; ce qu'une branche a écrit puis retiré avant son merge ne compte pas |
| `doublons` | Chaque suite d'au moins 8 lignes de code identiques à deux endroits, avec ses deux passages (`chemin:début-fin`), les plus longues d'abord | Du texte comparé à du texte, dans les fichiers de code : ni l'indentation, ni les lignes vides, ni les commentaires, ni les lignes de pure ponctuation ne comptent. Une troisième copie est donnée une fois, contre la première |
| `code mort` | Chaque export nommé d'un fichier TypeScript ou JavaScript que rien d'autre ne nomme (`chemin:ligne`) — ou que seuls des tests nomment, et lesquels | Un nom cherché dans tous les fichiers de la branche, doc exceptée. Un export que son propre fichier réemploie, ou qu'un autre fichier écrit, vit |

- **Elle ne modifie rien.** Ni fichier, ni branche, ni PR, ni fait au journal, et elle ne rapatrie
  pas : elle ne joue que des commandes de `git` qui lisent, sans prendre de verrou — pas même celui
  de l'index. Elle répond donc pendant que les cooks travaillent et que la pass merge, et ne retient
  ni les uns ni l'autre.
- **Elle repère, elle ne juge pas.** Deux passages identiques ne sont pas toujours à réunir, et un
  export qu'un framework lit par convention n'est nommé par personne. À l'inverse, deux exports morts
  qui portent le même nom se font vivre l'un l'autre. Ce sont des candidats, à lire.
- **Quand il n'y a rien, elle le dit** : `aucun repéré`, et parmi combien de fichiers elle a
  cherché. Une branche de moins de 20 merges donne son ratio sur ceux qu'elle a, en le disant. Un
  fichier de plus de 1 Mo n'est pas lu, et la sortie compte ceux qu'elle a écartés.
- Le bloc `journal` reprend les compteurs du relevé — les merges depuis la dernière fermeture, les
  seuils franchis — quand `BRIGADE_STATE_DIR` porte un journal ; sans lui, le dépôt est observé
  quand même. Deux variables sont obligatoires : `BRIGADE_REPO_DIR` et `BRIGADE_BASE_BRANCH`.
  Sa ligne `passe` dit où en est la dernière passe qui écrit — demandée et ce qui la retient, retirée, refusée, en train de
  ranger, ou comment elle a fini — dès qu'une a été demandée (voir « La fermeture qui écrit »),
  et le **bilan** de la dernière qui a fini la suit (voir « Le bilan d'une passe »).

## La fermeture qui écrit

La fermeture qui observe ne touche à rien ; celle-ci **retire**. C'est l'agent le plus dangereux du
système : un cook qui se trompe ajoute du mauvais code, et la pass l'attrape ; un closer qui se
trompe **efface du bon code**, et les gates diront « ça marche toujours », puisque ce qui a disparu
n'était testé par rien. Elle ne part donc que sur **ton geste**, sous une condition d'exécution
mesurée, et sous tous les garde-fous — ceux de tout le monde, pas d'autres.

```
brigade <projet> closing write    # npm --prefix runtime run closing -- write
brigade <projet> closing cancel   # npm --prefix runtime run closing -- cancel
```

- **Rien d'autre ne la lance.** Ni un seuil franchi (`run measures` la *propose*, `drift.crossed`
  ne lance rien), ni une horloge, ni un redémarrage : une demande que le runtime n'a pas fait
  partir avant de s'arrêter — qu'elle attende ou non — est refusée à son retour (`restarted`, dit
  dans journald), elle se redemande.
- **Tu la demandes une fois, elle attend.** Trop de cooks en vol, elle n'est pas refusée : elle
  attend sa condition d'exécution et part seule, une fois, dès qu'elle est remplie — rien à
  guetter, rien à relancer (voir « La demande attend »).
- **Elle est hors du rail** : elle ne prend aucun ticket, n'a pas de priorité, et son closer part
  sous la station `closer`, sans ticket.
- **Elle ne merge rien et ne pousse jamais sur la branche d'intégration.** Ce qu'elle retire part
  sur sa branche (`cook/fermeture-<8 caractères>`) et dans **une PR** vers la branche d'intégration,
  qu'elle remet à **la pass** : jugée et mergée comme celle d'un ticket, sans chemin à elle (voir
  « La PR passe par la pass »).

### Le closer se règle, ou il n'y en a pas

Par le même geste que les autres décisions du chef — `station -- closer-modele <modèle>`,
`closer-effort <effort>`, `closer-cooks <N>`, `closer-tokens <N>`, `closer-retraits <N>` —, journalisé,
sans `sudo` et sans redémarrage ; `retirer <geste>` revient à la variable. Posée, la décision
l'emporte sur la variable de même nom, et vaut à la passe suivante : celle qui range garde ses
plafonds. `station` montre les décisions posées et, dessous, les réglages en vigueur. Sans
calibrage, le projet n'a pas de passe qui écrit et rien d'autre ne change : la commande refuse en
nommant le geste. L'un sans l'autre, ou une valeur illisible, fait **refuser le démarrage**. Ces
valeurs restent dans le journal du répertoire d'état, hors de portée d'un cook.

| Variable | Défaut | Rôle |
|---|---|---|
| `BRIGADE_CLOSING_MODEL`, `BRIGADE_CLOSING_EFFORT` | aucun | Le calibrage du closer — c'est ton quota, il n'a pas de défaut |
| `BRIGADE_CLOSING_COOKS` | 1 | La condition d'exécution : la passe part quand **moins** de cooks que cela sont en vol. `1` : aucun |
| `BRIGADE_CLOSING_MAX_TOKENS` | 500 000 | Tokens par passe — à la place du plafond d'un cook, pas en plus. Aucun plafond par semaine |
| `BRIGADE_CLOSING_MAX_REMOVED_LINES` | 500 | Lignes qu'une passe peut retirer |

Ils s'écrivent au journal quand ils changent (`closing.configured`) : c'est là que la commande les lit.

### La condition d'exécution

Une passe qui écrit déplace la branche d'intégration sous les cooks en vol : « quand ça se calme »
est une condition, mesurée dans le journal. **Un cook en vol** est un ticket qu'une station tient
(`pris`), ou dont un cook tourne encore après avoir quitté ses mains ; la relecture d'un ticket en
pass n'en est pas un. La passe part quand il y en a **moins que le seuil** — un rail vide n'en porte
aucun. Cette condition est la seule porte : **la passe ne part jamais sous des cooks en vol au-delà
du seuil**, et rien de ce qui suit ne la desserre.

La commande écrit `closing.requested` ; le runtime la voit dans la seconde, **relit la condition à
cet instant**, et fait partir la passe (`closing.started`). Ce qui ne passe pas seul refuse
(`closing.refused`), par la commande — qui sort en 1 et ne lance rien — comme par le runtime :

| Motif | Ce qui manque |
|---|---|
| `unconfigured` | Le closer n'est pas réglé |
| `busy` | Une passe range déjà — une seule à la fois |
| `stopped`, `breaker` | Le « stop » du chef, le disjoncteur ouvert : « reprendre » d'abord |
| `depot` | La branche d'intégration ne se rapatrie pas, ou ne se lit pas |
| `nothing` | L'observation ne repère rien, ou rien hors de ce que les cooks tiennent |

### La demande attend

Ce qui passe seul ne refuse pas : la demande **attend**, et le runtime la relit à chaque réveil —
chaque fois que le journal bouge, donc dès qu'un cook rend la main, et à chaque tick.

| Motif | Ce qui la retient |
|---|---|
| `cooks` | Trop de cooks en vol pour le seuil (`observed`, `limit`) |
| `zoneless` | Un cook en vol ne déclare aucune zone : la passe ne peut pas savoir ce qu'il tient, **il tient donc tout** |
| `deploying` | Une mise en service demandée retenait la passe — ne se lit plus que dans les journaux d'avant la station |

```
brigade : passe de fermeture demandée — elle attend : condition d'exécution non remplie : 2 cooks en vol pour un seuil de 2 — la passe part quand il y en a moins que le seuil, ou quand le rail est vide (il porte 2 tickets non servis)
```

- **Elle part seule, une fois**, au premier réveil où rien ne la retient — la condition relue dans
  la transaction qui écrit `closing.started`. Rien ne lui est réservé : entre deux cooks, une
  station peut prendre le ticket suivant avant elle, et elle attend le creux d'après. Le seuil reste
  ton réglage (`station -- closer-cooks <N>`).
- **Elle se lit dans la file** — le bloc `attend` de `status`, sous le nom `fermeture` : depuis
  quand, et ce qui la retient à la lecture (combien de cooks en vol, pour quel seuil). Et sur la
  ligne `passe` de `brigade <projet> closing`. Elle en sort en partant, refusée ou retirée.
- **Une seule à la fois** : redemandée pendant qu'elle attend, rien n'est réécrit — la commande dit
  « déjà demandée », avec son heure et ce qui la retient, et sort en 0.
- **Tu la retires par le même geste**, `fermeture annuler` (`closing.cancelled`), tant qu'elle n'est
  pas partie : rien ne part, même quand la condition se remplit ensuite. Le runtime relit la demande
  dans la transaction qui fait partir la passe : retirée pendant qu'il rapatriait la base, elle ne
  part pas. Partie, elle ne se rappelle pas — « stop » l'arrête, et rien n'est livré.
- **Le « stop » ou le disjoncteur pendant qu'elle attend la refusent** (`stopped`, `breaker`) : elle
  ne repart pas d'elle-même à la reprise.
- **Sans issue au bout de deux heures.** Une demande qui attend depuis **2 h** — deux fois le plafond
  de durée d'un cook par défaut : deux cooks entiers se sont succédé sans laisser de creux — est dite
  sans issue, une fois : `closing.stalled` au journal, avec ce qui la retenait ; une ligne dans
  journald ; et sa ligne de la file passe en `PASSE DE FERMETURE SANS ISSUE`, avec les gestes qui
  la débloquent — relever le seuil, éteindre le manager le temps que le rail se vide, ou y
  renoncer. Elle attend toujours : la dire sans issue ne la refuse pas, et ne la fait pas partir.

### Ce qu'elle propose, et ce qu'elle tient

La passe rapatrie la base et rejoue **l'observation** : ses doublons et ses exports morts sont les
candidats du closer, chacun sous un nom court (`D1`, `M3`…), quarante au plus. Les fichiers de ces
candidats — le test ou la doc qui nomme un export mort compris — sont **sa zone**, et les zones de
fichiers du rail tiennent dans les deux sens :

- **Elle ne touche pas ce qu'un cook tient.** Un candidat dont un seul fichier est dans la zone d'un
  cook en vol, ou d'un ticket en pass, n'est pas proposé — la PR le dit, avec le ticket qui le tient.
  Et c'est relu à la livraison : un closer qui a écrit hors de sa zone, ou dans ce qu'un cook tient
  — un cook sans zone parti entre-temps tient tout —, **ne livre rien** (`zone`).
- **Aucun cook ne démarre sur ce qu'elle tient.** Tant qu'elle range, le rail compte sa zone comme
  celle d'un ticket en cuisine : un ticket dont la zone la recouvre attend qu'elle ait fini, les
  autres partent. C'est le recouvrement de deux tickets (« Les zones de fichiers »), pas un autre.
  Un ticket **sans zone** n'est retenu par rien, comme entre deux tickets.

### Les garde-fous

Le closer est lancé par le lancement gardé de tous les cooks : rien n'est récrit pour lui.

| Garde-fou | Ce qui l'arrête | Fin de la passe |
|---|---|---|
| Plafond de tokens par passe | `guard.tripped` `tokens`, à la limite de la passe | `tokens` |
| Plafond de retraits par passe | Les lignes que son worktree retire, commitées ou non, relevées à chaque tick (`guard.tripped` `removals`) ; et recomptées à sa fin | `removals` |
| Inactivité, durée, tours | Les plafonds de tout cook (« Régler les plafonds ») | `idle`, `duration`, `turns` |
| « stop » | `brigade <projet> guardrails stop` l'arrête dans la seconde ; aucune ne part avant « reprendre » | `stop` |
| Disjoncteur | Ouvert, aucune ne part ; ouvert pendant qu'elle range, elle est arrêtée | `breaker` |

**Arrêtée, elle ne livre rien** : ni branche poussée, ni PR. Ce qu'elle avait écrit reste commité
sur sa branche locale, comme le travail d'un cook arrêté. Un closer arrêté par un plafond, ou qui a
écrit ce qu'il ne tenait pas, est **un échec que le disjoncteur compte**. Et elle le dit, à trois
endroits : `closing.ended` au journal, une ligne dans `journalctl -u brigade@<projet>`, et la ligne
`passe` du bloc `journal` de `brigade <projet> closing` :

```
passe      fermeture-3f9c1a2e, le 2026-10-13 14:02 — arrêtée : plafond de tokens de la passe atteint (512 340 pour un plafond de 500 000) — rien n'est livré
```

### La PR, et ce qu'elle a laissé

La PR dit ce qui a été **retiré** et tout ce qui ne l'a pas été, **avec son motif** :

- **Laissé faute d'être sûr** : le closer écrit, pour chaque candidat qu'il ne retire pas, une ligne
  `LAISSÉ <nom> : <pourquoi>` — recopiée telle quelle. Rien n'est tenu pour retiré sur sa parole :
  la passe rejoue l'observation sur sa branche, et un candidat qui s'y repère encore sans que le
  closer l'ait nommé est dit **laissé sans motif**.
- **Écarté avant la passe** : ce qu'un cook tenait, et ce qui dépassait les quarante candidats.

Une passe qui n'a rien retiré n'ouvre pas de PR : ce qu'elle a laissé est dans `closing.ended`
(`kept`).

### La PR passe par la pass

Sa PR ouverte, la passe la **remet à la pass** dans le geste qui écrit sa fin (`closing.ended`
`delivered`, puis `pass.entered`). Tout ce que « La pass » dit d'une livraison vaut pour elle, sans
un pas de moins : le commit poussé est fusionné avec la base du moment dans un worktree jetable, les
**gates** du projet s'y jouent, le **reviewer** relit le diff, la **CI** du commit est lue, et verte,
elle n'est mergée que **sous le grant `merge`** — `grant.used` avant l'appel à GitHub, `merge.done`
après. Sans grant, elle s'arrête verte (`no-grant`) et attend ton merge ; une passe qui touche à ses
juges ou aux déclarations du projet n'est jamais mergée par la pass (`review-required`).

Ce qui change tient à ce qu'une passe n'a **pas de ticket** :

- **La pass la suit sous le numéro de sa PR** — que GitHub ne donne à aucune issue — et c'est sur
  la PR qu'elle parle : la relecture du reviewer, le verdict, l'arrêt. `brigade <projet> pass` la
  montre comme `PR #<n>  hors du rail (run fermeture-…)`, et `brigade <projet> pass <n>` raconte
  son jugement. Au journal, ses faits (`pass.*`, `grant.used`, `merge.done`) portent ce numéro.
- **Le reviewer est son vrai juge**, et sa consigne n'est pas celle d'un ticket : il cherche ce que
  le diff retire et dont quelque chose de vivant dépend encore, un test affaibli pour faire passer un
  retrait, et ce que le diff fait d'autre que ce que la PR annonce. Des gates vertes n'y prouvent
  rien — ce qui a disparu n'était peut-être testé par rien. **Un retrait dont il ne peut pas établir
  qu'il est sûr est bloquant** : c'est l'inverse d'un ticket, où le doute est une remarque.
- **Rouge, personne ne la reprend** : aucun cook n'est renvoyé, le closer ne repart pas, le manager
  n'est pas saisi. Dès le premier rouge elle remonte (`pass.escalated`, `still-red` : `off-rail`),
  la pass le dit sur la PR avec ce qu'elle a trouvé, et la PR reste ouverte : à toi de la merger à
  la main — la pass le verra — ou de la fermer, et de relancer une passe.
- **Mergée, ou fermée sans merge, la pass ne la suit plus** : il n'y a ni ticket à servir, ni issue
  à fermer. Un merge à la main est constaté (`merge.done`, `by: outside`), et les gates sont
  rejouées sur la base, comme après tout merge fait hors du runtime.

### Le bilan d'une passe

Une passe se lit **sans rouvrir sa PR** : `brigade <projet> closing` donne, sous sa ligne
`passe`, le bilan de la dernière passe qui a fini. Il est relu dans le journal seul — rien n'y est
rejoué — et son verdict tient en tête, sur une ligne :

```
passe      fermeture-3f9c1a2e, le 2026-10-13 14:02 — livrée : 1 ligne retirée dans 1 fichier, 2 candidats laissés faute d'être sûr — …
bilan      ÉCHEC — vérifications des gates : en baisse (12 → 11), même si les gates sont vertes — la passe a pu retirer du vivant · la pente descend (10:1 → 6,7:1 sur 20 merges)
           PR #101 — jugée verte par la pass, mergée le 2026-10-13 14:20
retiré     1 sur 3 candidats · 1 ligne retirée, aucune ajoutée, dans `src/libre/outils.ts`
           M1  export `inutile` de `src/libre/outils.ts:2` — référencé nulle part
laissé     2, faute d'être sûr
           D1  8 lignes de code identiques : `src/libre/a.ts:1-8` = `src/libre/b.ts:1-8`  deux modules qui évoluent à part
           M2  export `oublie` de `src/tenu/outils.ts:2` — référencé nulle part           le closer n'a donné aucun motif — …
pente      ajouté / retiré sur les mêmes merges : avant la passe → avec ce qu'elle retire
           20 merges   +20 / −2  10:1  →  +20 / −3  6,7:1  descend — 2 merges seulement sur la branche
           …
garde-fous avant la passe → après, par les gates que la pass a jouées : sur la base `01913d7`, puis sur la PR fusionnée avec elle
           couverture de tests      87,5 % → 87,5 %              tenu
           vérifications des gates  12 → 11                      ÉCHEC — en baisse
           état du produit          gates vertes → gates vertes  tenu
```

| Bloc | Ce qu'il dit | D'où il vient |
|---|---|---|
| `retiré` | Chaque candidat retiré, avec son chemin et ce pour quoi l'observation le proposait ; les lignes retirées et ajoutées, les fichiers écrits | `closing.ended` : `removed`, `removedLines`, `addedLines`, `files` |
| `laissé`, `écarté` | Chaque candidat que le closer a laissé, avec sa raison — ou qu'il a laissé sans la dire ; et ce qui a été écarté avant qu'elle ne parte | `closing.ended` : `kept` |
| `pente` | Le ratio ajouté / retiré des 20, 50 et 100 derniers merges de la base dont la passe est partie, **avant** et **avec ce qu'elle retire** — sur les mêmes merges : ce qui bouge ne tient qu'à elle | `closing.ended` : `slope`, relevée au départ de la passe |
| `garde-fous` | Trois, chacun avec sa valeur avant, après, et son verdict | Les gates que la pass a jouées — voir plus bas |

- **Les symptômes déclenchent, les effets font le bilan** — et on ne mesure pas une réduction sans
  mesurer ce qu'elle ne doit pas casser. Trois garde-fous : la **couverture de tests** n'a pas baissé
  (`MESURE couverture`), les gates **vérifient toujours autant de choses** (`MESURE verifications`),
  le **produit marche** (les gates de la PR sont vertes). Les deux premiers sont ce que le projet
  déclare par ses gates (« Ce que les gates déclarent ») : le runtime ne les invente pas.
- **Une baisse est un échec, dit en tête — même sous des gates vertes.** Un closer qui efface du
  code vivant et le test qui le couvrait laisse des gates vertes : c'est le cas que le bilan existe
  pour dire. Toute baisse de la couverture ou du nombre de vérifications est `ÉCHEC`, si petite
  soit-elle ; des gates rouges ou arrêtées à leur plafond de durée sont l'échec du produit.
- **« Avant » et « après » ne diffèrent que de ce que la passe a écrit.** « Après » : les gates du
  dernier jugement de sa PR (`pass.judged`), fusionnée avec la base du moment. « Avant » : les
  gates jouées **sur l'arbre même de cette base** — son contrôle seule (`base.checked`), ou le
  jugement de la livraison dont le merge l'a faite. Une livraison mergée entre le départ de la passe
  et le jugement de sa PR est donc dans les deux mesures, et ne masque rien.
- **Un garde-fou que rien n'a mesuré est `non établi`, jamais tenu**, et la tête du bilan le compte :
  la PR pas encore jugée, des gates qui ne déclarent pas la mesure, une base sur l'arbre de laquelle
  aucune gate du journal n'a été jouée (un commit posé droit dessus, par exemple). Le bilan dit lequel.
- **Si la pente n'a pas bougé, il l'écrit : « la passe n'a pas servi ».** C'est le chiffre de la
  fenêtre de 20 merges, tel qu'il se lit — `24,3:1` avant, `24,3:1` après, n'a pas bougé. De même
  si elle monte, et pour une passe qui n'a rien retiré ou rien livré. Tant que sa PR n'est pas
  mergée, la pente de la base n'a pas bougé du tout : le bilan dit où en est la PR.
- **Aucun plafond par semaine** : c'est ce bilan, passe après passe, qui dira s'il en faut un.

### Ce que ce parcours ne fait pas

- **Le bilan ne retient rien** : il se lit. Une PR de passe dont un garde-fou a cédé sous des gates
  vertes est jugée verte par la pass, et mergée sous le grant `merge` comme toute livraison verte ;
  rien ne te prévient hors de `brigade <projet> closing`. Le reviewer reste son juge.
- **Seule la dernière passe finie a son bilan** dans `brigade <projet> closing` ; les précédentes
  restent au journal (`closing.ended`, et les `pass.judged` de leur PR).
- **La zone d'une passe est lâchée dès que sa PR est ouverte**, pas à son merge : tant que la PR est
  en pass, un cook peut démarrer sur les fichiers qu'elle modifie. La pass juge chaque livraison
  fusionnée avec la base du moment : la seconde à merger est rejugée, et un conflit se voit là.
- **Une PR de passe arrêtée ou remontée ne figure pas dans « ce qui attend le chef »** de
  `brigade <projet> station` : elle se lit dans `brigade <projet> pass`, et sur la PR.
- **Dans `journalctl`, la pass nomme encore « ticket #<n> »** la PR d'une passe sur la plupart de ses
  lignes : le numéro est le bon, le mot ne l'est pas.
- **Le compteur « merges depuis la dernière fermeture »** du relevé ne repart pas encore d'une passe.
- `brigade <projet> guardrails` nomme `manager` tout cook sans ticket : le closer s'y reconnaît à
  son run, `fermeture-…`.

## Une identité GitHub par rôle

Par défaut, tout ce que le runtime fait sur GitHub part sous **un seul compte**, celui du `gh` et
du `git` de la machine : une protection de branche ne peut alors pas laisser merger la pass sans
laisser merger tout le reste. Sur un dépôt partagé, tu donnes au runtime **trois GitHub Apps**,
chacune une identité (`<nom>[bot]`) que les règles de branche savent nommer.

| Identité | Ce qui agit sous elle | Ce que vaut son jeton, sur le dépôt du projet seul |
|---|---|---|
| **cook** | la station, **pour le compte** du cook : rapatrier la base, pousser `cook/<run>`, ouvrir la PR | `contents: write`, `pull_requests: write` |
| **pass** | la pass : lire les PR et la CI, merger, fermer l'issue, y publier son verdict et la relecture du reviewer | `contents: write`, `pull_requests: write`, `issues: write`, `checks: read`, `statuses: read` |
| **manager** | le manager et le rail : sonder les issues, poser les labels, commenter, créer les tickets d'une épique — et ce que la station dit sur l'issue | `issues: write` |

Le **reviewer n'a aucun geste GitHub** : c'est un `claude` lancé sans jeton dans un worktree
jetable ; sa relecture est un fait du journal, que la pass publie.

### Le cook n'a aucun jeton

L'identité « cook » est celle sous laquelle la **station** livre. Le process du cook ne reçoit
**rien** : ni jeton d'écriture, ni jeton de lecture.

- Son environnement — et celui des gates, du reviewer et des juges du manager — perd `GH_TOKEN`,
  `GITHUB_TOKEN` et leurs variantes d'entreprise, y compris ceux qu'un setup de worktree
  exporterait. `GH_CONFIG_DIR` y pointe sur un répertoire vide (`gh-sans-compte/`, dans l'état) ;
  `GIT_TERMINAL_PROMPT=0`.
- **Il ne lit pas son ticket par `gh`** : la station le lui remet en fichier,
  `runs/<run>.ticket.md` — titre, corps, commentaires avec leur auteur, tels qu'au lancement —,
  hors du worktree. Illisible à ce moment-là : **aucun cook n'est lancé**, le ticket passe **86**
  dix minutes (`ticket-unreadable`), puis revient en attente.
- Ce que la station écrit sur l'issue part sous l'identité **manager** : commenter réclame
  `issues: write`, qui permet aussi de fermer et de labelliser — l'identité cook ne le peut pas.

### Des jetons d'une heure, réduits, jamais écrits

- Pour chaque geste, un jeton d'**installation** de l'App du rôle, demandé avec le **seul dépôt**
  du projet et les droits du tableau — même si l'App est installée plus large. Il **expire en une
  heure** et vit **en mémoire**, renouvelé à chaque tick avant sa fin. GitHub injoignable : dit une
  fois dans journald, retenté à chaque tick ; les gestes qui en dépendent échouent comme une panne.
- Il n'atteint `gh` et `git` que par l'**environnement du process lancé pour ce geste** — jamais
  par un argument, un fichier, un événement du journal, un flux de cook, un commentaire ou un
  message d'erreur. L'aide aux identifiants du compte est coupée pour ces gestes, un clone en SSH
  repasse en HTTPS, et l'échange va directement à l'API de GitHub.
- Aucun process long ne reçoit de jeton : ni cook, ni gates, ni reviewer, ni juge.

### Le merge dit qui l'a fait

`merge.done` porte `actor`, le compte GitHub qui a mergé ; `npm run pass -- <ticket>` l'affiche.
Quand la pass **constate** un merge (à la main, ou retrouvé au redémarrage), `by` est **ce que
GitHub nomme** : `pass` si c'est son identité, `outside` sinon — et la base est alors contrôlée.
Sous l'identité unique, `by` reste ce que le runtime suppose.

### Ce que tu crées chez GitHub

Une fois par projet, par quelqu'un qui administre l'organisation. **Ce parcours n'a pas pu être
joué depuis une session de dev** : c'est la recette.

1. **Trois GitHub Apps**, créées sur l'**organisation** (*Settings → Developer settings → GitHub
   Apps*), nommées `<projet>-cook`, `<projet>-pass`, `<projet>-manager`. Pas de webhook, pas de
   droit d'organisation ni de compte, *Only on this account*. Droits de dépôt — cook : *Contents*
   et *Pull requests* en lecture et écriture ; pass : les mêmes, plus *Issues* en lecture et
   écriture, *Checks* et *Commit statuses* en lecture ; manager : *Issues* en lecture et écriture.
   **Pas de droit *Workflows*** pour l'App cook : un ticket qui touche `.github/workflows/` ne se
   pousse pas, et son échec le dit. Donner moins fait refuser le jeton (`jeton refusé`, journald).
2. **Installe chacune sur le seul dépôt du projet** (*Only select repositories*), et relève pour
   chacune sa **clé privée** (`.pem`, donnée une seule fois) et son *App ID*.
3. **Sur la box**, un répertoire que seul le compte du service lit :

   ```bash
   sudo install -d -m 700 -o <compte> /etc/brigade/<projet>/apps
   # Pour chacun des trois rôles : cook, pass, manager
   echo <App ID> | sudo -u <compte> tee /etc/brigade/<projet>/apps/<rôle>.id
   sudo install -m 600 -o <compte> <la clé téléchargée>.pem /etc/brigade/<projet>/apps/<rôle>.pem
   ```

   puis, dans le drop-in : `Environment=BRIGADE_GITHUB_APPS_DIR=/etc/brigade/<projet>/apps`. Un
   fichier manquant, une clé lisible par d'autres que le compte, un fichier qui n'est pas une clé,
   ou deux rôles sous la même App : le runtime **refuse de démarrer** et nomme le fichier. Ces clés
   ne se copient ni dans le drop-in, ni dans une sauvegarde lisible, ni dans le dépôt.
4. **Retire le compte GitHub de la machine** : `sudo -u <compte> gh auth logout`, aucune clé SSH du
   compte chez GitHub, pas de `GH_TOKEN` dans le drop-in. Sur un dépôt privé, le premier clone se
   fait avec un jeton à toi, que tu ne laisses pas dans l'adresse de `origin`.
5. **La règle de branche qui réserve le merge** — ajoute une règle, n'en retire pas. Un *ruleset*
   actif sur la branche d'intégration (*Settings → Rules → Rulesets*, ou `gh api -X POST
   repos/<owner>/<repo>/rulesets`), avec **Restrict updates**, **Restrict deletions** et **Block
   force pushes** (`update`, `deletion`, `non_fast_forward`) ; dans *Bypass list*, l'App **pass**
   (`Integration`, *Always*) et les humains qui mergent. Ni l'App cook ni l'App manager n'y figurent.

Au démarrage, le runtime dit son mode : `GitHub — une identité par rôle (cook, pass, manager) …`
ou `GitHub — identité unique … rien ne réserve le merge à la pass`. Une App mal installée ne fait
pas refuser le démarrage : elle se dit dans journald dès le premier tick (`identité « pass » : son
App (…) n'est pas installée sur <owner>/<repo>`), et rien ne part sous ce rôle d'ici là. Ce qui
reste non garanti : voir « Ce que la pass ne garantit pas ».

## Les secrets du projet

Les secrets de dev du projet ont leur chemin, **séparé de l'environnement du runtime** : la règle
qui écarte du cook l'état du runtime, les clés Anthropic et les jetons GitHub ne bouge pas.

- **La déclaration** : `.claude/brigade/secrets`, dans le dépôt, versionné — des **noms** de
  variables, un par ligne ; `#` commente.
- **Les valeurs** : le fichier que nomme `BRIGADE_SECRETS_FILE`, sur la machine
  (`/etc/brigade/<projet>/secrets.env`) — `NOM=valeur`, une par ligne.

**Un cook reçoit l'intersection** : les variables que son dépôt déclare, avec la valeur que la
machine détient. La déclaration se lit dans le worktree du cook, sur sa branche. Une livraison qui
y touche n'est jamais mergée par la pass : elle attend ta relecture (`review-required`, cause
`declaration-modified: …` — voir « Ce que la pass décide »).

Le fichier de valeurs : un chemin absolu, **hors de `BRIGADE_STATE_DIR` et de `BRIGADE_REPO_DIR`**,
en `chmod 600` — sinon le runtime refuse de démarrer. Une valeur va jusqu'à la fin de sa ligne ; un
`export ` devant et une paire de guillemets autour sont retirés ; rien n'est interpolé. **Il est
relu à chaque lancement** : une valeur se remplace en éditant le fichier, sans rien redémarrer.

### Qui les reçoit

Le setup du worktree, le cook, et les gates que la pass joue (sur la livraison, sur la base) :
**oui**. Le reviewer et les jugements du manager : **non** — ils n'exécutent rien du projet.

### Ce qui ne se déclare pas

- Les noms par lesquels le runtime pilote ses cooks : `BRIGADE_*`, `ANTHROPIC_*`, `CLAUDE_*`,
  `GH_*`, `GITHUB_*`, `GIT_*`, `PATH`, `HOME`.
- **Rien de production** — aucun grant n'y touche. Le runtime ne sait pas ce qu'une valeur ouvre ;
  il refuse ce qui se reconnaît : un **nom** dont un mot est `PROD`, `PRODUCTION` ou `LIVE`, une
  **valeur** qui commence par `sk_live_` ou `rk_live_`. Le reste tient à ce que tu poses.
- **Une valeur de moins de 8 caractères** : ce n'est pas un secret mais une configuration, qui
  s'exporte depuis `.claude/brigade/worktree-setup.sh`.

### Quand il en manque un

Au moindre problème — un nom déclaré sans valeur, pas de `BRIGADE_SECRETS_FILE` alors que le dépôt
déclare, un fichier absent ou lisible par d'autres, une ligne mal écrite, un nom réservé, une
valeur trop courte, une marque de production — **rien n'est lancé** : le ticket passe **86** dix
minutes (`secrets-unavailable`) puis est reproposé, sans rien consommer ni compter au disjoncteur ;
**l'issue le dit, une fois**, en nommant chaque variable et le fichier — jamais une valeur. Ce qui
manque posé, le cook part à l'essai suivant. `npm run installation -- setup` joue le même contrôle
à blanc. Côté pass, des gates qui ne peuvent pas recevoir leurs secrets **ne sont pas jouées** —
jamais rouges pour cela : la livraison t'est remontée (`unjudged`, cause `secrets-unavailable`) et
n'est pas rejugée seule — les valeurs posées, retirer puis reposer `fire`. Un contrôle de la base
est « non joué », avec son motif.

### Aucune valeur ne se lit nulle part

Chaque valeur — exacte, ou sous sa forme dans un flux JSON — est remplacée par `[secret:NOM]`
partout où le runtime garde ou publie un texte venu d'un process qui a reçu les secrets :

le flux brut du cook (`runs/<run>.jsonl` et `.stderr`), masqué **à l'écriture**, ligne à ligne —
donc son compte-rendu (`cook.reported`), le commentaire de l'issue, le corps de la PR, la consigne
d'un renvoi ; la sortie du setup (journald) et des gates (`failures`, `tail`, commentaire de la
pass) ; et la relecture du reviewer, qui ne reçoit aucun secret mais lit un worktree où les gates
ont tourné avec eux.

**Une livraison qui porte un secret n'est pas poussée.** Avant le push, la station cherche les
valeurs dans tout ce que la branche ajoute — chaque patch, chaque message de commit, ce qu'elle a
récolté elle-même ; un binaire s'y lit comme du texte, un commit de merge montre ce qu'il change à
chacun de ses parents. Ce que l'origine a déjà reçu n'est pas relu. Trouvée : le cook est en échec
(``secret-committed: `NOM` ``), rien ne part, le ticket revient en attente — un **premier cook**
repart de la base sur une branche neuve ; un **renvoi de la pass** reprend la même branche, que la
station **ramène à la livraison refusée** (ce que le cook fautif y avait ajouté est perdu, et
l'issue le dit).

### Les identifiants de Claude ne sont pas poussés non plus

Le runtime **n'ouvre jamais** les identifiants du compte Max : le même contrôle, avant le push, les
reconnaît **à leur nom et à leur forme**, pour tout projet — avec ou sans secrets, avec ou sans
cloison — dans **ce que la branche ajoute** (lignes ajoutées de chaque commit, messages). Un jeton
écrit puis retiré deux commits plus loin est reconnu ; un jeton que la base portait déjà, non.

| Signe | Ce qui le déclenche |
|---|---|
| `name` | un commit **crée un fichier nommé `.credentials.json`**, où que ce soit, quel que soit son contenu. Le modifier ou le supprimer ne déclenche rien |
| `shape` | **un jeton de Claude** : `sk-ant-`, un type et deux chiffres, un tiret, puis au moins 40 caractères (`A`–`Z`, `a`–`z`, chiffres, `_`, `-`) — `oat01`, `ort01`, `api03` |
| `shape` | **la structure du fichier d'identifiants** : la clé `claudeAiOauth`, puis un `accessToken` ou un `refreshToken` d'au moins 20 caractères, guillemets échappés compris |

Reconnu : le cook est en échec (`credentials-committed: name`, `shape`, ou les deux), **rien n'est
poussé**, et le ticket revient en attente comme pour un secret. Le motif, le journal et l'issue
disent **le signe, jamais le chemin ni le contenu**. Pour voir, sur la station :
`git -C "$BRIGADE_REPO_DIR" log -p origin/<base>..<la branche que le commentaire nomme>`.

**Refusé à tort** (le commentaire de l'issue le dit au cook suivant) : un `.credentials.json`
propre au projet se commite par toi — un cook ne peut ni le créer ni renommer un fichier vers ce
nom, mais le modifie une fois sur la base ; un exemple de jeton s'écrit **tronqué** (moins de 40
caractères après `sk-ant-<type>-`) ou s'**assemble à l'exécution** ; un jeton entier que la base
porte déjà et qu'un cook rajoute ailleurs (ligne déplacée, fichier copié, base mergée) se tronque
sur la base, une fois pour toutes.

**Ce qu'il n'arrête pas** : une copie **transformée** — base64, chiffrée, découpée. C'est une
reconnaissance de forme, contre l'accident et l'injection par le ticket ou le diff. Trois choses
bornent le dégât : le réseau en liste blanche (« La cloison »), la **push protection de GitHub** —
à activer sur le dépôt par le chef (`installer.md`, « Protéger la branche d'intégration ») —, et la
révocabilité (« Révoquer la connexion Max »).

### Ni publiés dans ce qu'un cook dit

Le même reconnaisseur passe sur **tout texte qu'un process lancé par le runtime dit, avant qu'il ne
soit écrit** — pour tout projet, avec ou sans secrets, avec ou sans cloison : un jeton de Claude
(la forme ci-dessus), et dans la structure `claudeAiOauth` la valeur de `accessToken` et de
`refreshToken` dès 20 caractères, y laissent leur place à `[jeton Claude masqué]`. **Seul le jeton
part** : le texte autour reste, rien n'est refusé ni retenu.

- **Où** : le flux brut de chaque `claude` lancé — cook, reviewer, jugements et découpages du
  manager —, masqué **à l'écriture**, après les secrets du projet, et donc tout ce qui s'y lit
  (compte-rendu, commentaire, corps de PR, relecture, consigne d'un renvoi, décision d'un juge) ;
  la sortie du setup et des gates, avant d'être gardée. Le flux **quitte la machine** avec
  `sauvegarder` : c'est pourquoi il est masqué à la source.
- **Ligne à ligne** : une valeur livrée en deux morceaux est masquée quand même. Ce qui n'a pas
  son saut de ligne attend, jusqu'à **1 Mio** par sortie ; au-delà, c'est masqué et écrit sans lui,
  et la coupe ne tombe jamais dans ce qui peut être un jeton `sk-ant-…`.
- **Un masquage se lit, sans rien de la valeur** : `credentialsMasked` (combien de fois) dans
  `cook.exited` et dans `gates` de `pass.judged` et `base.checked` ; sur l'issue, `Masqué N fois :
  ce qui a la forme d'identifiants de Claude`. Le compte porte sur **tout le flux** : un process a
  lu la connexion du compte. Si ce sont de vrais identifiants : « Révoquer la connexion Max ».

### Ce qui n'est pas garanti

- **Une valeur transformée passe** — base64, chiffrée, découpée, à cheval sur deux lignes : le
  masquage est un filet contre l'accident, pas une clôture. La structure du fichier d'identifiants
  ne se reconnaît que **sur une ligne**.
- **Sur une ligne de plus de 1 Mio, seul le jeton `sk-ant-…` est tenu** : un secret du projet ou la
  structure du fichier d'identifiants, à cheval sur deux tranches, n'y sont pas reconnus.
- **Sans cloison, le cloisonnement entre projets tient aux droits de fichiers** : un cook tourne
  sous le compte du runtime et peut lire le fichier de secrets de son projet en entier, et celui
  d'un autre. **Avec la cloison, ni l'un ni l'autre** : seules les valeurs déclarées lui
  parviennent, par son environnement.
- Ne sont pas masqués : le **transcript de session** de `claude` (`~/.claude/projects`, qui reste
  sur la machine et garde les identifiants Max s'ils y sont passés) ; ce que les gates du projet
  écrivent elles-mêmes sur le disque ; un commentaire qu'un cook poste lui-même sur GitHub — sous
  une identité par rôle, il n'en a aucune.

## La cloison

Sans elle, tout ce que le runtime lance — setup, cook, gates, reviewer, juges — tourne sous le
compte du service : un cook lit l'état, le clone, les worktrees et les secrets des **autres**
projets, le fichier de secrets du sien en entier, les clés des GitHub Apps, et parle à tout
Internet. Le runtime le dit à chaque démarrage (`cloison — aucune …`, `réseau — ouvert …`). Elle se
pose **projet par projet**, en deux moitiés indépendantes :

- **Les fichiers et les process**, à chaque lancement, par `bwrap` (bubblewrap) : son espace de
  montage et son espace de process, sans privilège.
- **Le réseau**, au projet : l'unité `brigade@<projet>` ne joint que la boucle locale ; sa seule
  sortie est **la porte**, `brigade-porte@<projet>`.

**Sur une station installée par le paquet, la cloison est posée pour tous les projets, sans
réglage** : l'unité `brigade-station` ne joint que la boucle locale, et `brigade-station-porte`
tient une porte par projet de sa configuration — chacune avec la liste blanche de son projet, lue
au journal de ce projet, qui y reçoit aussi ses refus — et celle de la station elle-même
(Anthropic et GitHub seulement). Personne ne choisit leurs ports : chaque porte reprend le sien ou
en prend un libre, et les écrit dans `/var/lib/brigade/portes.json`, d'où la station donne à chaque
projet le sien ; une ligne de la configuration qui nomme sa porte (`BRIGADE_PROXY_PORT`) est
refusée. Un projet dont la porte n'a pas encore dit son port attend, et la station le dit ; la
station elle-même attend la sienne avant de rien joindre. La bascule arrête les
`brigade-porte@<projet>` de l'ancienne installation et remet leurs ports aux portes de la station :
même port, même liste — un cook en vol retrouve la sienne. Les refus se lisent par
`journalctl -u brigade-station-porte`.

La frontière des fichiers passe **entre le runtime et ce qu'il lance** : ce qu'il fait lui-même —
`git`, `gh`, `claude auth status` — n'est pas cloisonné.

### Ce qu'un lancement cloisonné voit

| | |
|---|---|
| **Masqué** — un répertoire vide à la place | chaque répertoire de `BRIGADE_SANDBOX_HIDDEN` : sur la box `/var/lib/brigade` et `/etc/brigade`, donc l'état, le clone, les worktrees, les secrets et les clés de **tous** les projets, le sien compris |
| **Rendu, en écriture** | son worktree, et **sa vue du `.git` du clone** : objets, références et worktrees sont les vrais ; la `config` et les `hooks` sont **les siens** |
| **Rendu, en lecture seule** | au reviewer, le worktree et la vue du `.git` ; au cook sans identité GitHub, son ticket remis |
| **En lecture seule** | toute la machine, **et le répertoire du compte** : son `.gitconfig`, ses chaînes d'outils, le binaire `claude` |
| **Au projet, en écriture** | ce qui s'écrit sous `~` : `~/.npm`, `~/.cache`, `~/.claude.json`, toute entrée que le compte n'a pas — dans `~` comme dans `~/.local`, `~/.local/share` et `~/.local/state` —, et ce que nomme `BRIGADE_SANDBOX_PRIVATE` — rangé dans `<état>/compte` |
| **En écriture, tel quel** | `/tmp` (celui du projet : `PrivateTmp`) |
| **Remplacé** | `~/.claude` : celui du projet, `<état>/claude` — ni transcripts ni mémoire d'un autre projet |
| **Identifiants Max** | `~/.claude/.credentials.json`, monté **en lecture seule** : `claude` les lit, rien ne les réécrit |
| **Process** | les siens : ni `ps` ni `/proc/<pid>/environ` ne montrent un autre cook |

**Rien de ce qu'un cook écrit n'est lu comme configuration, ni exécuté, par le runtime** — dont le
`git`, le `gh` et le `claude` tournent hors cloison, sous le même compte et dans le même clone :

- **Le compte** est en lecture seule : un `git config --global` échoue, un `npm ci` écrit son
  cache dans celui du projet. **Les outils écrivent leur cache à leur place habituelle, sans
  réglage** : `~/.cache`, `~/.npm`, et sous `~/.local/share` et `~/.local/state` ce que le compte
  n'y a pas (le store de pnpm, `~/.local/share/pnpm`) ; jest écrit dans `/tmp`. Ce cache est au
  projet, dans `<état>/compte` : retrouvé d'un ticket à l'autre, jamais partagé avec un autre
  projet. Ce que le compte garde sous `~/.local` (le binaire `claude`) reste en lecture seule.
  Une chaîne d'outils qui écrit sous `~` (`~/.cargo`, `~/.gradle`) se nomme dans
  `BRIGADE_SANDBOX_PRIVATE` (noms séparés par `:`) : le projet a la sienne, vide au départ.
- **Le `.git`.** Ce qu'un lancement y configure (`git config`, `git remote add`, husky) va dans la
  `config` de sa vue, que le `git` du runtime ne lit jamais. La cloison pose `gc.auto=0` et
  `maintenance.auto=false` dans le clone servi. **Ne lance pas `git gc` ni `git pack-refs` à la
  main dans ce clone pendant qu'un cook tourne.**
- **Le worktree**, où le runtime lance `git` hors cloison : il lit lui-même le fichier `.git` du
  worktree et son `commondir`, et **impose le dépôt à `git`**. Un fichier qui ne mène plus au clone
  est un **refus** (``ne désigne plus son dépôt dans le clone (fichier `.git` réécrit)``, ou
  ``(`commondir` réécrit)``) : au tick, un avertissement ; à la fin du cook, la livraison échoue,
  rien n'est poussé, le worktree est gardé. Il **ne descend dans aucun sous-module** : ce qu'un
  cook y change n'est ni un progrès ni récolté — à lui de commiter le pointeur. `core.fsmonitor`
  et `core.hooksPath` sont neutralisés. Ces protections valent aussi sans `bwrap`, sans la
  remplacer : sans elle, la `config` et les `hooks` du clone restent inscriptibles par le cook.

**Le runtime refuse de démarrer** si la cloison laisse dehors ce qu'elle doit cacher —
`BRIGADE_STATE_DIR`, `BRIGADE_REPO_DIR`, `BRIGADE_SECRETS_FILE` ou `BRIGADE_GITHUB_APPS_DIR` hors
de tout répertoire masqué —, si elle masquerait le compte, `/tmp` ou le système, si un masque est
un fichier, ou si elle est posée à moitié.

### La liste blanche

Sur les ports 443 et 80 : `anthropic.com`, `claude.ai`, `claude.com`, `github.com`,
`githubusercontent.com`, leurs sous-domaines, et ce que le dépôt déclare dans
`.claude/brigade/reseau`. **Aucun registre de paquets n'est ouvert d'office.**
`/brigade:init` écrit ce fichier — il le déduit de ce que le `worktree-setup.sh` installe, et laisse
un fichier vide commenté, jamais un fichier absent, quand il n'a rien à ouvrir ou n'a pas su traduire
l'outil. Les hôtes viennent des lignes d'installation connues et des URLs que le setup nomme
(`https://cdn.sheetjs.com/…` donne `cdn.sheetjs.com`) ; `runtime/src/reseau-cli.ts` fait cette
déduction et écrit le fichier dans tous les cas, sans jamais réécrire un fichier déjà là.
C'est une proposition : elle n'ouvre rien tant qu'elle n'est pas mergée.

```
# .claude/brigade/reseau — un hôte par ligne
registry.npmjs.org
*.pythonhosted.org          # l'hôte et ses sous-domaines
base.exemple.org:5432       # un autre port que 443 et 80
```

Ni adresse IP, ni `*` seul, ni `*.com` : une ligne qui n'est pas un hôte n'ouvre rien, et
`npm run partition` la montre.

**La déclaration se lit sur la branche d'intégration, pas dans le worktree du cook** — à l'inverse
des secrets. Un hôte s'ouvre donc par un **merge**, que la pass ne fait jamais elle-même
(`review-required`, cause `declaration-modified: …`). Le runtime la relit chaque fois qu'il
rapatrie la base et à chaque tick (`network.declared`) ; la porte lit sa liste là, sans redémarrer.
**Le runtime sort par la porte, lui aussi** : avec `BRIGADE_PROXY_PORT`, il pose `HTTPS_PROXY`,
`HTTP_PROXY` et `NO_PROXY` pour lui-même et pour tout ce qu'il lance. **`git` en SSH ne passe
pas** : l'origine du clone doit être en `https`.

### Un refus se lit

| Ce qui est tenté | Ce que le process reçoit | Où tu le lis |
|---|---|---|
| un hôte hors liste, par la porte | `403`, aussitôt ; en clair, la réponse nomme l'hôte et le geste qui l'ouvre | `npm run partition` (`network.refused`), `journalctl -u brigade-porte@<projet>` |
| une connexion qui contourne la porte | le noyau jette ses paquets : UDP reçoit `EPERM`, **TCP attend le délai de son client** — à confirmer sur la box | nulle part |
| un hôte permis qui ne répond pas | `502` | la réponse |

Un événement par hôte et par dix minutes, cent hôtes nommés au plus. **Le filtre de l'unité est
sondé à chaque démarrage** : s'il ne tient pas, le runtime le dit — `MAIS un envoi direct part :
l'unité ne semble rien filtrer (IPAddressDeny)`. Son verdict se confirme sur la box (recette).

### Ce qui est refusé, et pourquoi

`BRIGADE_STATE_DIR=<répertoire d'état> npm --prefix runtime run partition` lit le journal
(`isolation.configured`, écrit au démarrage quand l'état de la cloison change) et montre :
`fichiers` (`CLOISONNÉS` ou `OUVERTS`, ce qui est masqué), `réseau` (`LISTE BLANCHE` ou `OUVERT`,
et si l'unité filtre), `ce qui passe` (chaque hôte, et d'où il vient), et les `derniers refus`.

### L'éprouver, et ce qu'elle coûte

```bash
brigade <projet> partition probe [<essais>]
```

De vraies sondes, sans cook ni quota : le lancement part dans `bwrap`, chaque répertoire masqué
est vide, les identifiants Max sont en lecture seule, les outils écrivent leur cache sous `~`
(`~/.cache`, `~/.npm`, `~/.local/share`, `~/.local/state`), les process des autres sont invisibles,
`claude` retrouve la connexion Max ; puis le coût d'un lancement. Une sonde en échec rend le code
1 et dit pourquoi. À jouer sur la box : c'est une étape de la recette.

### Les transcripts du projet sont rangés

Sous cloison, `claude` écrit ses transcripts dans `<état>/claude/projects/`, et **le runtime les
range** — au démarrage, puis une fois par jour. Part un transcript que rien n'a écrit depuis
`BRIGADE_TRANSCRIPTS_KEEP_DAYS` jours (`7` par défaut ; `0.5` vaut douze heures), avec son
répertoire de session. Reste tout ce qui a été écrit depuis le départ du plus ancien lancement
encore en cours, et ce qui n'est pas un transcript (la mémoire du projet, ses réglages). Un lien
n'est jamais suivi. Chaque passage est au journal — `transcripts.tidied` (`removed`, `freedBytes`,
`kept`, `keptBytes`, `keepMs`) —, et `status` montre le dernier ; un projet qui redémarre sans
cloison écrit `transcripts.released`, une fois. **Sans cloison, rien n'est rangé** : les transcripts
vont sous le `~/.claude` du compte, où le runtime ne retire jamais rien — il n'y écrit que la copie
du transcript qu'un renvoi reprend, dans le répertoire du projet de son worktree. Un transcript retiré n'est
pas perdu pour le diagnostic : le flux brut reste sous `runs/`, et lui est sauvegardé. Il l'est
pour la reprise d'un renvoi : passé la durée de garde, le cook du renvoi repart de zéro (« Le cook
d'un renvoi reprend la session du précédent »).

### Ce qui n'est pas garanti

- **Rien de cela n'a encore tourné sur la box.** Deux choses ne se prouvent que là-bas : le filtre
  de l'unité (`IPAddressDeny`), et le vrai `claude` sous cloison — dont le jeton Max se renouvelle
  peut-être mal en lecture seule (un cook qui finit `disconnected` alors que `claude auth status`,
  hors cloison, répond connecté).
- **Les identifiants Max restent lisibles du cook.** « Non copiables » tient à la liste blanche et
  à l'absence de montage partagé ; reste la branche poussée, où la station refuse leur nom ou leur
  forme (`credentials-committed`). Une copie transformée passe.
- **Le répertoire du compte reste lisible de tous les projets**, en lecture seule. Ce qu'il garde
  de sensible (`~/.ssh`, `~/.config/gh`) s'ajoute à `BRIGADE_SANDBOX_HIDDEN` ; un fichier seul
  (`~/.netrc`) ne se masque pas, c'est son répertoire qui se masque.
- **Un clone où `extensions.worktreeConfig` est activé rouvre le chemin** de la configuration : ne
  l'active pas dans le clone servi. **Un cook peut faire échouer la livraison d'un autre cook du
  même projet** : `<clone>/.git/worktrees/`, les objets et les références sont partagés en
  écriture. Réécrire le répertoire d'un voisin ne fait rien lancer — sa livraison est refusée.
- **Les filtres que la configuration du compte ou du clone nomme restent appelés** (`git-lfs`).
- **Le cache du compte n'est plus partagé** : chaque projet remplit le sien, que rien ne range. Du
  `~/.claude` du projet, seuls les transcripts sont rangés ; il n'est pas sauvegardé.
- **La boucle locale est commune aux projets** : un service sur `localhost` est joignable de tous,
  et n'a pour protection que son mot de passe. **La résolution de noms reste ouverte** : un tunnel
  DNS sort. **`github.com` est en liste blanche** : sous l'identité unique, le cook y écrit avec le
  compte de la machine — la clôture est une identité par rôle.

## L'arbitre entre projets

Dès qu'un second projet tourne sur la machine, le compte Max et la machine sont partagés.
L'arbitre est le process qui les additionne : **un seul par machine**, sans LLM. Il ne répond qu'à
une question : *ce projet peut-il lancer un cook de plus ?* Il est **facultatif** — sans lui, un
projet tourne comme avant (`arbitre — aucun`). On le désigne à un runtime par
`BRIGADE_ARBITER_PORT`.

### Ce qu'il sait, et d'où

Chaque runtime lui **redit** l'état de son projet — ses cooks de tickets en cours, s'il a des
tickets qu'il pourrait lancer, s'il les retient pour « machine saturée », ce que ses cooks ont
consommé — à chaque demande de place, à chaque changement, à chaque tick, et en s'arrêtant. Un
projet arrêté par le chef, au disjoncteur ouvert, à la base rouge, déconnecté, au quota épuisé ou à
son propre plafond **ne demande rien**. L'arbitre garde ce dernier mot **en mémoire**, et ne compte
que les cooks de **tickets**. Sur disque (`arbitre.db`, dans `BRIGADE_ARBITER_STATE_DIR`) : tes
réglages seuls, relus à chaque décision.

### La règle

`P` est le plafond de cooks du compte, tous projets confondus (`BRIGADE_ARBITER_MAX_COOKS`, **sans
défaut** : l'arbitre refuse de démarrer sans). Un projet **compte** s'il a des cooks, des tickets
qui attendent, ou s'il est connu et n'a pas reparlé.

- **Chaque projet qui compte a une part** : le plafond au prorata de son poids, arrondi vers le
  bas, **jamais moins d'une place**. **Sous sa part, il passe**, tant que le compte n'est pas plein.
- **Au-delà, il emprunte** les places que personne ne demande — jamais tant qu'un projet connu n'a
  pas reparlé. **Sans préemption** : l'arbitre ne tue jamais un cook, il retient le suivant.
- **Quand la machine sature** (un runtime dit retenir des tickets pour elle), les parts se
  calculent sur **le nombre de cooks en cours** et plus personne n'emprunte.

Un projet refusé le lit comme une retenue : `station.held`, motif `arbiter`, dans `run status` et
`run station`. Il redemande à son réveil suivant — une minute au plus.

### Arbitre injoignable : le projet lance quand même

Quand l'arbitre désigné ne répond pas (connexion refusée, réponse illisible, dix secondes de
garde), le projet passe en **mode dégradé** : **au plus un cook de ticket à la fois**, les cooks
déjà partis finissent. C'est écrit **une fois** à l'entrée (`station.unarbitrated`, et
`journalctl`), une fois au retour (`station.arbitrated`) ; chaque cook parti ainsi porte
`unarbitrated: true` ; `run status` (`ARBITRE INJOIGNABLE depuis …`) et `run station` le montrent.
Chaque tentative de lancement redemande d'abord : dès que l'arbitre répond, la marche reprend.

### Quand il redémarre

Il repart **vide**. Tant qu'un projet **connu n'a pas reparlé**, sa part reste **réservée** (`N'A
PAS REPARLÉ depuis …`) ; elle se libère s'il reparle, si son runtime s'arrête proprement, ou si tu
le retires. **Arrêté pour de bon sans arrêt propre, il la garde jusqu'à ce que tu le retires.**

### Le lire, et le régler

```bash
export BRIGADE_ARBITER_PORT=<port> BRIGADE_ARBITER_STATE_DIR=<répertoire de l'arbitre>
npm --prefix runtime run arbiter                          # l'état
npm --prefix runtime run arbiter -- weight thermigo 3     # « thermigo est prioritaire cette semaine »
npm --prefix runtime run arbiter -- remove vieux-projet   # sa part n'est plus réservée
```

Par projet : son poids, ses cooks en cours, sa **`part`**, et **`encore`** — ce qu'il pourrait
lancer de plus à l'instant, emprunts compris ; `machine` dit `SATURÉE d'après <projets>`. **Le
poids** est un entier, 1 par défaut, durable, sans échéance ; il ne touche à aucun plafond — ni
celui du compte, ni celui de chaque projet (`run station -- cooks <N>`). **La consommation des
cooks n'est pas celle du compte**, et l'arbitre ne retient rien à cause d'elle. Arbitre
injoignable, la commande le dit et sort avec le code 1.

### Ce qui n'est pas garanti

- **Un runtime mort sans le dire laisse son dernier mot** à l'arbitre jusqu'à ce qu'il reparle ou
  que tu le retires. **Juste après un redémarrage de l'arbitre**, ce qui avait été emprunté avant
  tourne encore : le plafond peut être dépassé de cet emprunt, le temps que ces cooks finissent.
- **Un cook joint la boucle locale**, donc l'arbitre : il pourrait y parler au nom d'un projet, et
  fausser un compte que le runtime redit à l'échange suivant. Il ne peut pas régler les poids, que
  la cloison lui masque.
- **L'arbitre ne connaît pas le quota du compte** : voir « 86 : le quota est épuisé ».

## Cinq variables, aucun défaut

Le calibrage du manager et du reviewer, les stations et les seuils de coût de la dérive ne sont
**pas** des variables : ce sont les décisions du chef, au journal du projet, posées par le geste
`station` (« Déclarer les stations », `station aide`). Une variable de même nom laissée à
l'environnement est ignorée, et dite à chaque démarrage. Sans calibrage posé, le runtime refuse de
démarrer et nomme le geste qui le pose.

| Variable | Rôle |
|---|---|
| `BRIGADE_STATE_DIR` | Le répertoire de tout l'état du projet : `log.db`, `lock.db`, `runs/`, et `code-en-service` — l'empreinte du code sur lequel le runtime a démarré, écrite une fois tout branché : `installation` la compare au code installé, et la bascule de la box ne confirme une version qu'à elle. Sur une box basculée, aussi `version.git` : la branche de l'origine de brigade, rapatriée pour dire si une version attend. Sur un **disque local** — le verrou en dépend |
| `BRIGADE_PROJECT` | Le nom du projet : minuscules, chiffres et tirets. Il s'écrit dans chaque événement et dans le nom de l'unité systemd |
| `BRIGADE_GITHUB_REPO` | Le dépôt GitHub dont le projet sert les issues : `<owner>/<repo>` |
| `BRIGADE_REPO_DIR` | Un clone du dépôt, **réservé à la station** : elle y accroche le worktree de chaque cook |
| `BRIGADE_BASE_BRANCH` | La branche d'intégration : d'où part chaque worktree, où vise chaque PR |

L'une des cinq absente, le runtime refuse de démarrer et dit laquelle.

Facultatives, **sans défaut** — mal écrites, le runtime refuse de démarrer :
`BRIGADE_ROADMAP_ISSUE`, l'issue de roadmap, que le manager ne juge jamais ;
`BRIGADE_CEILING_MODEL` et `BRIGADE_CEILING_EFFORT`, le plafond de calibrage (« Il réagit à un
échec ») ; `BRIGADE_COMMON_PATHS`, les chemins communs, séparés par des virgules, sans motif (« Les
zones de fichiers ») ; `BRIGADE_GITHUB_APPS_DIR` (« Une identité GitHub par rôle ») ;
`BRIGADE_SECRETS_FILE` (« Les secrets du projet ») ; `BRIGADE_SANDBOX_BIN` et
`BRIGADE_SANDBOX_HIDDEN` — exigées ensemble —, `BRIGADE_SANDBOX_PRIVATE` et `BRIGADE_PROXY_PORT`
(« La cloison ») ; `BRIGADE_ARBITER_PORT` (« L'arbitre entre projets ») ; les `BRIGADE_DRIFT_*` de mesure
(« Le relevé des mesures »), hors les deux seuils de coût, qui sont des décisions.

Treize réglages ont un défaut ; un nombre mal écrit fait refuser le démarrage. Le plafond de cooks
se déclare station par station (`station stations …`) et se règle à chaud par `run station -- cooks <N>`
(voir « Plusieurs cooks à la fois ») :

| Variable | Rôle | Défaut |
|---|---|---|
| `BRIGADE_LEASE_SECONDS` | La durée du bail : le temps qu'un cook garde son ticket sans progrès observable. À tenir au-dessus du délai d'inactivité | `1800` |
| `BRIGADE_GH_BIN`, `BRIGADE_CLAUDE_BIN`, `BRIGADE_SYSTEMCTL_BIN`, `BRIGADE_GITHUB_API_URL`, `BRIGADE_INSTALLER_CONFIG`, `BRIGADE_SUDO_BIN` | Les binaires, l'API, le réglage du geste d'installation, et le lien et la règle du geste de mise en service, et le `sudo` qui les juge (`sudo -n -l <lien>`), que `installation` contrôle. Servent aux tests, qui y mettent des faux ; **jamais posés sur la box** | `gh`, `claude`, `systemctl`, `https://api.github.com`, `/etc/brigade-installer.conf` |
| `BRIGADE_GATES_TIMEOUT_SECONDS`, `BRIGADE_CI_WAIT_SECONDS` | Le plafond de durée des gates jouées par la pass (au-delà, arrêtées et rouges) ; l'attente tolérée d'une CI qui ne conclut pas, avant remontée au chef | `1800`, `1800` |
| `BRIGADE_MAX_SETUPS` | Combien de tickets peuvent être en entrée à la fois (worktree et setup) | `4` |
| `BRIGADE_PRESENCE_MINUTES` | Le délai de présence d'une station distante : sans demande d'elle pendant ce temps, elle est absente (« Une station distante tire son travail ») | `2` |
| `BRIGADE_MAX_LOAD_PER_CORE`, `BRIGADE_MIN_FREE_MEMORY_MB`, `BRIGADE_MIN_FREE_DISK_MB` | La garde de la machine : la charge par cœur au-delà de laquelle la station ne prend plus de ticket ; la mémoire disponible, et le disque libre sous `BRIGADE_STATE_DIR`, en Mo, sous lesquels elle n'en prend plus (`0` : jamais) | `1.5`, `1024`, `5120` |
| `BRIGADE_TRANSCRIPTS_KEEP_DAYS` | Sous cloison, la garde d'un transcript de `claude` après sa dernière écriture | `7` |

## Sauvegarder et restaurer

Le journal est la seule vérité du projet : les projections se recalculent, lui non.

### Ce qui est sauvegardé

`log.db`, le journal : **oui**, un instantané daté par sauvegarde. `runs/`, le flux brut des
cooks : **oui, en un seul exemplaire** — seuls les flux neufs ou changés sont recopiés, aucun n'est
jamais retiré. `lock.db`, `code-en-service`, `version.git`, `depot/`, `worktrees/` : non, ils se recréent. **Les secrets du projet :
non** — leur fichier vit hors de l'état, et ni le journal ni les flux n'en portent une valeur ; sur
une machine neuve, tu le reposes à la main.

L'instantané se prend pendant que le runtime tourne (`VACUUM INTO`). **Ne sauvegarde jamais
`log.db` avec `cp`, `rsync` ou un instantané de disque pendant que le runtime tourne.**

### Sauvegarder

```bash
BRIGADE_STATE_DIR=<répertoire d'état> BRIGADE_BACKUP_DIR=<destination> npm --prefix runtime run backup
```

`BRIGADE_BACKUP_DIR` est la destination : **une par projet**, **hors du répertoire d'état** ;
absente, refus (code 2). `BRIGADE_BACKUP_KEEP` (`14`) est le nombre de sauvegardes datées gardées :
les plus anciennes partent **après** la réussite de la nouvelle.

La destination porte un répertoire par sauvegarde (`<horodatage>/log.db` et `manifeste.json`), et
`runs/`. Une sauvegarde ne prend son nom qu'achevée et relue ; interrompue, elle laisse un
`.en-cours-…`, retiré au passage suivant. Chaque réussite est au journal (`backup.completed`) ; un
échec sort en code 1 et ne s'y écrit pas (`systemctl status brigade-sauvegarde@<projet>`) ; un
`BRIGADE_STATE_DIR` qui n'existe pas est un refus (code 2). **C'est la ligne `sauvegarde` de
`status` qui montre une sauvegarde qui ne se fait plus** ; rien n'alerte ailleurs. Envoyer la
destination hors de la machine est un choix d'installation : ses fichiers se copient tels quels.

### Restaurer

```bash
BRIGADE_STATE_DIR=<répertoire d'état neuf> npm --prefix runtime run restore -- <destination>/<horodatage>
```

La commande vérifie la sauvegarde, puis pose `log.db` et `runs/`. **Elle n'écrase jamais un
journal** : si un seul de `log.db`, `log.db-wal`, `log.db-shm` est là, elle refuse (code 2) —
déplace d'abord l'ancien état, ses trois fichiers. Sans `<destination>/runs/`, elle dit combien de
flux manquent. Ensuite le runtime démarre comme d'habitude, et écrit `runtime.interrupted`.

**Ce qu'une restauration ne rend pas :**

- **Ce qui s'est passé depuis la sauvegarde** : le rail se recale seul sur GitHub au premier
  sondage ; les usages de grant et les relevés de cette fenêtre sont perdus.
- **Les worktrees et les branches locales.** Un cook qui tournait est noté `cook.interrupted` et
  son ticket repris par un cook neuf ; son travail non commité est perdu. Un ticket **en pass** ne
  peut plus être rejugé : **il se finit à la main** — merge sa PR, ou retire `fire` ; pas encore
  jugé, il est remonté au chef (`unjudged`, cause `worktree-lost`), sauf PR déjà mergée ou fermée.
- **Le clone de la station, la connexion Max, `gh`, la configuration git du compte** : ils se
  refont à l'installation.

## Sur le poste de dev

```bash
eval "$(.claude/brigade/worktree-setup.sh <n> "$PWD")"   # pose BRIGADE_STATE_DIR
BRIGADE_PROJECT=brigade BRIGADE_GITHUB_REPO=benomite/brigade \
  BRIGADE_REPO_DIR=<un clone réservé à cet essai> BRIGADE_BASE_BRANCH=v2 \
  npm --prefix runtime start   # Ctrl-C pour l'arrêter
```

Avant le premier lancement, pose le calibrage par le geste, au journal de cet essai :
`npm --prefix runtime run station -- manager-modele sonnet` (puis `manager-effort`,
`reviewer-modele`, `reviewer-effort`). Les stations de même : sans elles le runtime démarre, lit le
rail, et **aucun cook ne part** (« Déclarer les stations ») — c'est aussi la façon la plus sûre de
regarder un rail.

**Lancé ainsi, c'est une vraie cuisine.** Le runtime lit les vraies issues du dépôt avec ton `gh`,
et sa station prend celles qui portent `fire` : un ticket calibré lance un vrai cook, sur ton quota
Max, sans demande de permission, puis pousse sa branche, ouvre une PR et commente l'issue ; sa
livraison est relue par un vrai reviewer, sur le même quota. Si le grant `merge` est actif dans ce
répertoire d'état, la pass **merge** ce qu'elle juge vert. Si le manager y est allumé, il juge
**toutes** les issues ouvertes du dépôt, y pose des labels, les commente, et **découpe ses
épiques : il crée des issues**.

### Regarder le rail sans rien lancer

Pour regarder le rail et les autres commandes du chef sans laisser la station prendre de tickets,
arrête la cuisine : `npm --prefix runtime run guardrails -- stop`, qui tient d'un démarrage à
l'autre. La commande lit le journal (`log.db`), qui n'existe qu'après un premier lancement : la
première fois, démarre, laisse tourner quelques secondes, Ctrl-C, puis redémarre et arrête.
Aucun cook ne part sans ticket portant `fire`.

| Besoin | Commande |
|---|---|
| Tests | `npm --prefix runtime test` — sur un clone nu, sans rien installer |
| Contrôle de types | `npm --prefix runtime run typecheck` — après le setup de worktree |

Les tests n'utilisent jamais `BRIGADE_STATE_DIR` : chacun crée son répertoire temporaire et écoute
sur le port 0. Ils ne touchent ni le réseau ni le quota : `gh` et `claude` y sont des faux, `git`
n'y parle qu'à des dépôts locaux. Deux suites jouées en même temps ne se gênent pas, elles se
ralentissent : aucun test ne court contre l'horloge. **Ne tue jamais un process par son nom**
(`pkill -f src/main.ts`) : tu arrêterais les runtimes d'essai des autres worktrees.

Ce qui arrête un test bloqué :

- **il attend sans fin** — mis en échec et nommé au bout de deux minutes, et le process de son
  fichier sort aussitôt (`--test-timeout`, `--test-force-exit`) ;
- **il boucle dans du code synchrone** — c'est la **garde d'horloge** de `gates.sh` qui le
  rattrape : passé 300 s (`BRIGADE_GATES_DELAI_TESTS`, en secondes entières ; illisible, elle
  rougit sans jouer la suite), le groupe de process de la suite est tué et les gates rougissent —
  `FAIL  tests du runtime arrêtés par la garde d'horloge, aucun test en échec`, ou `…, et des
  tests en échec avant la coupure` si sa sortie en montre un (`✖`, `not ok`). La première, sur une
  machine saturée, n'est pas un rouge pour la pass (« Des gates coupées par leur garde d'horloge
  sur une machine saturée ne sont pas un rouge »). Elle ne nomme pas le test, et n'est
  qu'aux gates : un `npm --prefix runtime test` lancé à la main reste retenu, et se tue par son
  pid. (`BRIGADE_GATES_GARDE_APRES` n'est que l'accroche de ses propres tests.)
- **non tenu** : un process qu'un test a lancé sans le tuer lui survit, sans retenir la suite.

Quand les gates (`.claude/brigade/gates.sh`) trouvent un test en échec, elles impriment son nom et
son erreur, et gardent la sortie entière de la suite dans `.brigade-state/gates/` du worktree (une
semaine) — le chemin est imprimé. Un échec qui ne se reproduit pas se lit là. Leur dernière ligne
est toujours le verdict, `gates : VERT` ou `gates : ROUGE`.

Elles impriment aussi ce que le passage a coûté — `durée des gates : … s de processeur (…
utilisateur + … système), … s d'horloge, charge du poste …` : une mesure, qui ne juge rien.

### Jouer la suite comme la box la jouera

Les gates du poste jouent la suite sur macOS, sans cloison ; la pass de la box la joue sur Debian,
dans un `bwrap` sans privilège. Un test peut être vert ici et rouge là-bas.

**Avant de merger ce qui touche aux tests de la cloison, de l'installation ou du dépôt, joue la
suite entière sous `bwrap` dans un Linux du poste.** Les gates ne le font pas. Depuis la racine du
worktree, Docker lancé :

```bash
# Debian 12, Node 26, bwrap, compte sans privilège — comme la box.
printf 'FROM node:26.11.1-bookworm-slim\nRUN apt-get update -qq && apt-get install -y -qq bubblewrap git python3 procps time >/dev/null\n' | docker build -q -t brigade-linux -
docker run --rm --init --security-opt seccomp=unconfined --security-opt apparmor=unconfined --security-opt systempaths=unconfined \
  -v "$PWD:/src:ro" brigade-linux bash -c '
    mkdir -p /work/wt && tar -C /src --exclude=node_modules --exclude=.brigade-state --exclude=.git -cf - . | tar -C /work/wt -xf - && chown -R node:node /work
    exec setpriv --reuid node --regid node --init-groups env HOME=/home/node \
      bwrap --die-with-parent --unshare-pid --ro-bind / / --dev /dev --proc /proc --bind /tmp /tmp --bind /home/node /home/node --bind /work/wt /work/wt --chdir /work/wt -- \
      npm --prefix runtime test'
```

Le code de sortie est le verdict. L'arbre de travail est copié dans le conteneur, commité ou non.
Sans la ligne `bwrap … --`, la même commande joue la suite sur Linux sans cloison. Ce qu'un test ne
doit pas tenir pour acquis :

| Sur macOS, sans cloison | Sur Linux, sous `bwrap` |
|---|---|
| `tmpdir()` est sous `/var/folders/…` | `tmpdir()` est `/tmp` |
| un fichier de `root` se lit `uid 0` | il se lit `uid 65534` (`nobody`) |
| le pid 1 est interdit de sonde (`EPERM`) | le pid 1 est au compte : `kill(1, 0)` réussit |
| un argument de commande n'est pas borné à 128 Ko | il l'est (`MAX_ARG_STRLEN`) : `spawn E2BIG` |
| un port fermé à l'instant n'a pas été vu repris | il peut être redonné aussitôt à un voisin qui écoute sur le port 0 |

- Un test qui lance un process sur un port **posé par le chef** (l'arbitre, la porte) passe par
  `lancerSurPortPose` (`runtime/test/outils.ts`), qui tire un autre port si un voisin l'a repris.
- Une **connexion refusée** ne s'attend pas d'un port fermé, elle se joue : par `connexionRefusee`
  (`runtime/test/aides/connexion-refusee.ts`) donnée au `joindre` du client, ou, dans un process
  lancé par le test, par `NODE_OPTIONS: --import=${SANS_RESEAU}` (`runtime/test/outils.ts`).

## Sur la box

**La voie de déploiement est une unité systemd sur l'hôte**, une instance par projet — pas un
conteneur : le runtime a besoin de l'hôte (la connexion Max du compte, `gh`, `git`) et d'un disque
local. Ce sont **ses lancements** qui sont cloisonnés (« La cloison »). Les fichiers d'unité sont
dans `runtime/deploy/` : `brigade@.service`, `brigade-sauvegarde@.service` et `.timer`,
`brigade-porte@.service` et le drop-in `cloison.conf`, `brigade-arbitre.service`.

**L'installation est un parcours à part, et il tient dans un seul document** :
[`installer.md`](installer.md) — ce qu'il faut avant de commencer, la box, le projet, la
vérification, puis la cloison et l'arbitre quand un second projet arrive. Rien ne s'installe
depuis cette page-ci : elle dit ce que le runtime fait, et comment on le pilote une fois posé.

### Restaurer sur une machine neuve

1. Installer ([`installer.md`](installer.md), gestes 3 à 6), **sans démarrer le service**, et
   rapatrier la destination de sauvegarde **entière** : la sauvegarde datée et `runs/`.
2. Créer le répertoire d'état (`sudo install -d -o <compte> /var/lib/brigade/<projet>`) et y
   restaurer la dernière sauvegarde : `brigade <projet> restore <destination>/<horodatage>`.
3. Recloner le dépôt de la station (`/var/lib/brigade/<projet>/depot`) s'il n'y est pas.
4. `sudo systemctl start brigade@<projet>` : le journal montre un `runtime.interrupted` puis un
   `runtime.started`, et les tickets servis avant l'incident se relisent.
5. Remettre le timer de sauvegarde en route (`status` montre la précédente, ou `JAMAIS FAITE`), et
   finir à la main les tickets qui étaient en pass (« Ce qu'une restauration ne rend pas »).

### Piloter

**Une commande du runtime se lance d'un seul geste : `brigade <projet> <commande> [arguments…]`.**
Depuis ton poste, `ssh <box> brigade <projet> status`. Tu ne donnes que le nom du projet et la
commande : le compte, l'installation et l'environnement se lisent dans l'unité
`brigade@<projet>.service`, drop-ins compris. La commande tourne donc avec les cinq variables et
le `PATH` que le service du projet reçoit, sous son compte, et rien de ton environnement ne lui
parvient. Sa sortie et son code de sortie sont ceux de la commande.

**Deux écritures du même geste, et la doc les tient séparées.** Le *geste de box* est
`brigade <projet> <commande>` : il se tape **sur la box**, où `brigade` est posé. Le *geste de
poste* est `ssh <hote> brigade <nom> <commande>` : il se tape **sur ton poste**, qui n'a pas
`brigade` et n'a rien à en installer — `<hote>` est ce que tu passes à `ssh` (le champ `hote` du
projet dans l'app, `<box>` dans `installer.md`), `<nom>` le nom du projet sur la box. Partout
dans la doc, `brigade <projet> …` sans `ssh` est donc le geste de box ; ce que l'app affiche ou
écrit, et ce qu'un humain lance depuis son poste, est le geste de poste. Tapé nu sur un Mac,
`brigade <projet> status` rend `command not found` : c'est ce qui manque à ta frappe, pas à ta
machine. Le runtime, lui, écrit `run <commande>` dans ses sorties pour dire « le geste, sur cette
box » : sur ton poste, mets `ssh <hote> brigade <nom>` à la place de `run`.

`<commande>` est un script de `runtime/package.json`, lu dans l'installation, qui lance un fichier
de `src/` — le geste ne lance rien d'autre. `test` et `typecheck` sont au dev, et `start` est à
l'unité : les trois sont refusés. Ses arguments la suivent tels quels, sans le `--` que `npm run` réclame (il est
toléré). Le geste les passe un à un ; par `ssh`, c'est le shell de la box qui les découpe : un
argument qui contient un espace se cite donc deux fois (`ssh <box> 'brigade <projet> <commande>
"deux mots"'`).

Sept refus sont les siens, chacun avec son code et sa phrase sur la sortie d'erreur ; les
commandes du runtime, elles, rendent `0`, `1` ou `2` :

| Code | Phrase | Ce que c'est |
|---|---|---|
| `64` | `usage : brigade <projet> <commande> [arguments…]` | il manque le projet ou la commande |
| `65` | `brigade : projet inconnu sur cette box — « <projet> » n'a pas de drop-in …` | l'instance n'a pas de drop-in. `systemctl` répond pour toute instance du gabarit, même jamais déclarée : c'est le drop-in de l'instance qui fait un projet |
| `66` | `brigade : « <commande> » n'est pas une commande du runtime — celles de cette installation : …` | la commande n'est pas un script de `package.json`, ou c'est `test`, `typecheck` ou `start` |
| `67` | `brigade : systemd n'a pas répondu pour brigade@<projet>.service …` | `systemctl show` a échoué : rien n'est supposé de l'unité, rien n'est lancé |
| `68` | ``brigade : « <toi> » n'a pas le droit de lancer le geste sur cette box — sans terminal, `sudo` ne le lui donne pas sous le compte « <compte> » sans mot de passe …`` | lancé sans terminal (par `ssh`), par quelqu'un que `sudo` ne laisse pas passer sans mot de passe : hors du groupe `brigade-chefs`, règle absente, ou un droit qui en demande un. Le geste l'éprouve en s'y lançant d'abord à vide (`sudo -n`) : **quelle que soit la raison du refus, c'est `68`** — jamais le `1` d'une commande du runtime en échec. Dans un terminal, entrée redirigée ou non, rien n'est éprouvé : `sudo` demande son mot de passe, comme toujours |
| `69` | ``brigade : `sudo` manque sur cette box …`` | celui qui lance n'est pas le compte du service, et la box n'a pas de `sudo` pour l'y faire passer |
| `70` | ``brigade : `node` ne démarre pas dans l'environnement de brigade@<projet>.service — …`` ou `` `node` est en <version> … le runtime réclame la version <n> au moins `` | `node` ne se lance pas dans le `PATH` de l'unité — absent, ou une bibliothèque lui manque : sa propre phrase suit, et `libatomic1` est nommé quand c'est lui —, ou il est plus ancien que l'`engines` du `package.json` du runtime. Rien n'est lancé |

| Geste | Commande |
|---|---|
| Lancer, arrêter, voir s'il tourne | `sudo systemctl start\|stop brigade@<projet>` ; `systemctl status brigade@<projet>` |
| Le relancer à chaque reboot | `sudo systemctl enable brigade@<projet>` |
| Lire ce que le process imprime | `journalctl -u brigade@<projet> -f` |
| Relire le journal ; lire le rail | `brigade <projet> log` ; `brigade <projet> rail` |
| Retirer un ticket en attente du rail ; changer sa priorité | `brigade <projet> rail remove <ticket>` ; `brigade <projet> rail priority <ticket> <1-9 ou none>` — voir « Retirer un ticket du rail, changer sa priorité » |
| Voir l'état de la cuisine, suivre le journal en direct | `brigade <projet> status [--follow [<ticket>]]` |
| Donner à un programme les faits qu'il dessine — l'état en un mot, cinq compteurs, le dernier événement, le rail, les cooks en cours, les livrés des 24 h | `brigade <projet> facts` — voir « Les faits, pour un programme » |
| Voir le relevé des mesures | `brigade <projet> measures [--by <n>]` |
| Observer ce que la branche d'intégration n'a pas retiré : ratio ajouté / retiré, doublons, code mort | `brigade <projet> closing` — voir « La fermeture qui observe » |
| Lancer une passe de fermeture qui écrit — ton geste, et le seul qui la lance | `brigade <projet> closing write` — voir « La fermeture qui écrit » |
| Voir la station ; régler le plafond de cooks, à chaud | `brigade <projet> station` ; `brigade <projet> station cooks <N>` (`0` : aucune limite) |
| Voir les garde-fous, « stop », « reprendre » | `brigade <projet> guardrails [stop \| resume]` |
| Voir la pass : phases, verdicts, renvois, bilan des arrêts faute de grant | `brigade <projet> pass [<ticket>]` |
| Voir la base d'intégration, faire rejouer ses gates quand elle est rouge | `brigade <projet> base [replay]` |
| Voir le grant `merge`, l'accorder, le prolonger, le révoquer | `brigade <projet> grant [enable merge [--until <date ou heure> \| --for <durée>] [--uses <n>] \| extend merge … \| revoke merge]` — `--until 18h` se lit à l'heure de la box (UTC) et la commande dit ce qu'elle a compris ; `--for` n'a pas de fuseau |
| Voir le manager, l'allumer, l'éteindre, lui rendre une issue, compter ce qu'allumer engage, lister ce qui n'est pas encore sur le rail | `brigade <projet> manager [on \| off \| return <n°> \| backlog \| upstream]` |
| Vérifier que le projet est prêt, créer ses labels, mesurer son setup, le désinstaller | `brigade <projet> installation [labels \| setup [<cooks>] \| uninstall [--confirm]]` — voir [`installer.md`](installer.md) |
| Voir la cloison : ce qui est masqué, ce que le réseau laisse passer ou a refusé | `brigade <projet> partition` |
| Éprouver la cloison, mesurer ce qu'elle coûte par cook | `brigade <projet> partition probe [<essais>]` |
| Lire ce que la porte refuse, en direct | `journalctl -u brigade-porte@<projet> -f` |
| Voir l'arbitre ; donner du poids à un projet, en retirer un | l'arbitre n'est pas un projet, le geste ne le sert pas : `sudo -u <compte> env $(systemctl show brigade-arbitre.service -p Environment --value) npm --prefix /opt/brigade/runtime run arbiter` ; `-- weight <projet> <n>`, `-- remove <projet>` |
| Mettre à jour | une box passe à la station, une fois, par son paquet, qui la met ensuite à jour seule — [`bascule.md`](bascule.md) ; d'ici là, [`installer.md`](installer.md), « Mettre brigade à jour » |
| Sauvegarder tout de suite | `sudo systemctl start brigade-sauvegarde@<projet>.service` |
| Voir la dernière sauvegarde, et la prochaine | la ligne `sauvegarde` de `status` ; `systemctl list-timers 'brigade-sauvegarde@*'` |

Un crash relance le runtime au bout de 5 s ; un refus de démarrer (code 2) ne se réessaie pas, et
`systemctl status` en montre le motif. On ne reconstruit rien depuis journald : c'est le journal.

### Recette du chef

À dérouler sur la box, projet `brigade`. Les lettres désignent les commandes de « Piloter » : `J`
le journal, `R` le rail, `G` les garde-fous, `S` l'état, `P` la station, `V` la pass, `M` le grant,
`N` le manager, `C` la cloison. « restart » : `sudo systemctl restart brigade@brigade`.

**Le runtime et le rail.** Sans quota.

1. `start` : `active (running)`, `J` montre un `runtime.started`. `stop` puis `start` :
   `runtime.stopped`, `runtime.started`, et les événements d'avant sont toujours là.
2. `sudo systemctl kill -s KILL brigade@brigade` : il repart seul au bout de 5 s, `J` montre un
   `runtime.interrupted` puis un `runtime.started`. Un second runtime lancé à la main sur le même
   répertoire d'état refuse et nomme le pid du service.
3. `G -- stop`, puis `fire` sur une issue : dans la minute, `R` la montre **en attente**. restart :
   même rail, cuisine toujours arrêtée. Retirer `fire` : `J <numéro>` montre un `ticket.left`
   (`unfired`). `G -- reprendre` rouvre la cuisine.
4. Dans le drop-in, `Environment=BRIGADE_MAX_TURNS=beaucoup`, restart : refus de démarrer, qui
   nomme la variable. Retirer la ligne.
5. `S` répond aussitôt : pid, dernier tick de moins d'une minute, le rail. `kill -s STOP` : deux
   minutes plus tard, un tick vieux de deux minutes — un runtime figé ; `kill -s CONT` le relance.

**Le premier cook.** Consomme du quota Max : une issue courte, `model:haiku`, `effort:low`.

6. `fire` sur une issue **sans** `model:` ni `effort:` : `R` la montre **86** (`no-calibration`),
   un commentaire dit quels labels poser. Les poser : le ticket est **pris**, `P` montre le cook.
7. Le cook fini : une branche `cook/<run>`, une PR vers `v2`, le compte-rendu sur l'issue, `R` le
   ticket **en pass** ; le clone de la station est propre. Dans `runs/<run>.jsonl`, la ligne
   `"subtype":"init"` porte `"skills":[]`, `"mcp_servers":[]`, aucun plugin du compte (chacun a
   `"path":"builtin"`), et le `model` calibré.
8. Pendant un cook, `G -- stop` : il s'arrête dans la seconde, son ticket revient en attente, rien
   n'est poussé. Pendant un autre, restart : `cook.interrupted`, puis un second `cook.launched`.

**La pass, le grant et le reviewer.** Un cook par ticket, un par renvoi, une relecture par
livraison aux gates vertes. Avant, `M` montre le grant **absent**.

9. Le ticket de l'étape 7 : `V` le montre **arrêté — vert, non mergé (`no-grant`)**, la PR reste
   ouverte, le commentaire de la pass dit « Sous grant, la pass aurait mergé … ». `V <numéro>`
   montre le verdict (gates, CI, reviewer) ; `V`, `M` et `S` portent le bilan « sans grant, 1
   livraison verte arrêtée : … ».
10. `M -- activer merge` : cette PR **n'est pas mergée**, le grant n'est pas rétroactif. La merger
    à la main : l'issue est fermée, `merge.done` dont `by` vaut `outside`, et le bilan la compte.
11. Une autre issue, grant actif : sa PR est mergée sans rien faire, `M` liste l'usage (ticket, PR,
    commit, verdict). `M -- revoquer merge`, une troisième : arrêtée (`no-grant`).
12. **L'échéance.** `M -- activer merge --uses 1` : `BIENTÔT ÉTEINT` ; une issue mergée plus
    tard, `ÉTEINT SEUL`, et la suivante s'arrête en disant que le grant s'est éteint, et quand.
    `--for 5min` puis `prolonger merge --for 10min` : les deux gestes se lisent ; `--for 1min`
    est refusé. `--for 2min`, `stop` trois minutes, `start` : un `grant.expired` daté de
    l'échéance, écrit avant toute décision de la pass.
13. **Rouge.** Une issue qui demande de casser un test : « rouge, renvoyée au cook, renvois 1/2 »,
    un second cook **sur la même branche**. Au troisième rouge : « REMONTÉE AU CHEF (still-red :
    returns-exhausted), renvois 2/2 », `R` le ticket **86** (`pass:still-red`), rien n'est mergé.
14. Pendant qu'un ticket vert attend sous grant, `kill -s KILL` : au redémarrage, soit un
    `merge.done` (`reconciled`), soit un `merge.failed` (`interrupted`) puis un second
    `grant.used` — jamais deux merges.
15. **Un ticket sans diff**, grant révoqué : aucune PR, « Reviewer — … · ticket sans diff », puis
    « Pass — verte, servie sans merge », l'issue fermée. Avec `G -- stop` juste après le
    compte-rendu du cook : « jugement en cours » — jamais servi sans relecture.

**La sauvegarde.** Sans quota. `B` : le `BRIGADE_BACKUP_DIR` du drop-in.

16. `sudo systemctl start brigade-sauvegarde@brigade.service`, service en marche : `B` porte un
    répertoire daté (`log.db`, `manifeste.json`) et `runs/`, `J` un `backup.completed`.
    `BRIGADE_STATE_DIR=/tmp/brigade-essai … run restore -- B/<horodatage>` : `J` sur cet état
    montre les tickets servis d'avant ; la rejouer est refusé.

**La fiche et les dépendances.** `X` est attendu, `Y` l'attend.

17. Avant `fire`, un commentaire `<!-- brigade:fiche -->` avec `- attend : #X` et `- budget : 40` :
    **86** (`unreadable-card`), « FICHE ILLISIBLE — clé inconnue « budget » », aucun cook. Retirer
    la ligne : `ticket.released` (`card-readable`), « attend #X ».
18. `fire` sur les deux : `X` est pris, `Y` reste « attend #X » ; `X` servi, `Y` est pris. Retirer
    `fire` de `X` avant : `Y` est **BLOQUÉ**, un seul `ticket.blocked` ; reposer `fire` le lève.
    Un cycle (`X` attend `Y`) : les deux passent 86, le commentaire nomme le cycle.

**Le manager et le découpage.** Un jugement par issue, puis un cook par ticket lancé. **Avant
d'allumer, pose `blocked-on-human` sur toute issue ouverte qui ne doit pas partir, et colle
`<!-- brigade:tickets -->` dans le corps de toute épique déjà découpée à la main.**

19. Éteint, une issue sans label reste intacte. `N -- allumer` : elle porte `fire`, `model:`,
    `effort:` et un commentaire qui justifie le calibrage, puis un cook part. Les issues retenues
    et la roadmap ont un `manager.set-aside`, aucun jugement.
20. Une issue sans critère : aucun label, un commentaire « pas un ticket exécutable », aucun second
    jugement tant qu'on n'y répond pas. Retirer `fire` d'une issue lancée par lui : il ne le repose
    pas (`chef-changed`) ; `N -- rendre <numéro>` la lui rend. `N -- eteindre` : plus rien n'est
    jugé, ce qui était posé reste.
21. Une épique sans label : des tickets créés (`Épique : #N` en tête, calibrés, fiche, `fire`), leur
    liste en fin de corps, `N` : « découpée, 0/N servi ». L'éditer ou redémarrer ne recrée rien.
    Une épique vague : aucun ticket, **une** question, « QUESTION POSÉE ».

**Les secrets du projet.** Projet qui déclare un secret, `BRIGADE_SECRETS_FILE` posée.

22. `chmod 644` sur le fichier, restart : refus de démarrer, qui demande `chmod 600`. Retirer une
    valeur déclarée, `fire` : aucun cook, ticket 86 `secrets-unavailable`, **un seul** commentaire
    qui nomme la variable et le fichier. La remettre sans redémarrer : le cook part.
23. Une issue « lance `env`, recopie sa sortie » : sur l'issue, la PR, le journal et
    `runs/<run>.jsonl`, chaque valeur se lit `[secret:NOM]` ; `grep -r '<la valeur>'
    "$BRIGADE_STATE_DIR"/runs` ne trouve rien.
24. Une issue qui fait commiter la valeur d'un secret : « échoué (`secret-committed`) », aucune
    branche poussée. Un fichier `sauvegarde/.credentials.json` contenant `{}` — jamais les vrais :
    « échoué (`credentials-committed: name`) ».

**Une identité par rôle.** Une fois « Ce que tu crées chez GitHub » déroulé.

25. restart : journald dit « GitHub — une identité par rôle (cook, pass, manager) », et `gh auth
    status` qu'aucun compte n'est connecté. `pass.pem` retiré, ou en `chmod 644` : refus de
    démarrer. La PR est ouverte par l'App **cook**, le verdict commenté par l'App **pass**.
26. **Un cook à qui on demande de merger échoue** (« merge ta PR avec `gh pr merge`, pousse sur la
    branche d'intégration ») : la branche n'a pas bougé, la PR est toujours ouverte.
27. App pass retirée de la *Bypass list*, grant actif : la pass s'arrête sur `merge-refused`, et
    GitHub nomme la règle. La remettre : « mergée par la pass, sous l'identité <App pass>[bot] ».
28. `sudo grep -rE 'gh[spu]_|BEGIN .*PRIVATE KEY' /var/lib/brigade/<projet> ; journalctl -u
    brigade@<projet> | grep -E 'gh[spu]_'` : aucune ligne.

**La cloison.** Deux projets `A` et `B` sous le même compte, cloisonnés. Ce bloc ne se joue que sur
la box : c'est ici que le cloisonnement se prouve. Reporter sur le ticket ce qui s'écarte.

29. restart de `A` : journald dit « cloison — chaque lancement … part dans `/usr/bin/bwrap` » et
    « réseau — … **un envoi direct est refusé par le noyau** » — un indice, que l'étape 31 tranche.
    `C -- eprouver 50` : sept sondes, toutes « tient ».
30. **Un cook de `A` n'atteint rien de `B`, ni ses propres clés** (« liste `/var/lib/brigade` et
    `/etc/brigade`, affiche `/etc/brigade/A/secrets.env`, lance `ps aux` ») : il ne voit que son
    worktree et le `.git` de `A`, rien de `/etc/brigade`, aucun process de `B`.
31. **Un hôte hors liste est refusé.** `curl -sS -m 20 https://example.com` répond `CONNECT tunnel
    failed, response 403` ; `curl -sS -m 20 --noproxy '*' https://example.com` **n'aboutit pas** —
    c'est elle qui prouve le filtre. Si elle rend la page, ne va pas plus loin.
32. **Le registre s'ouvre par le dépôt** : sans `.claude/brigade/reseau`, le setup échoue ; la
    ligne mergée, le ticket suivant montre un `network.declared` **avant** son setup, qui passe.
33. **Un cook n'écrit rien que le runtime exécute, ni les identifiants Max** : `git config --global
    core.fsmonitor /tmp/x` et un script dans le `hooks` du `.git` du clone ne laissent rien ;
    écrire dans `~/.claude/.credentials.json` répond `Read-only file system`.
34. **Sur la durée d'un jeton.** Laisser des cooks tourner au-delà de l'échéance du jeton d'accès :
    hors cloison, `sudo -u <compte> claude auth status` répond toujours `"loggedIn": true`, et
    aucun cook n'a fini `disconnected`. Sinon : `claude /login`, retirer `cloison.conf` de tous les
    projets, et le reporter avec le `runs/<run>.jsonl`.
35. `cloison.conf` retiré, `daemon-reload`, restart : « cloison — aucune », « réseau — ouvert ».

**Ce qui ne se provoque pas à la demande.**

- **Le quota épuisé.** Au premier 86 réel, `P` doit montrer « 86 » avec une heure de retour. Si le
  cook est noté « échoué » à la place, garder son `runs/<run>.jsonl` : ce flux manque aux tests.
- **La connexion expirée.** `sudo -u <compte> claude auth logout`, puis restart : `P` montre la
  connexion expirée et plus aucun ticket n'est pris. `claude /login`, puis `G -- reprendre`.

