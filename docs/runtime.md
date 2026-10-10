# Le runtime de la V2

Le runtime est le process qui tient le **journal** d'un projet : une suite d'événements en ajout
seul, dont tout le reste dérive — à commencer par le **rail**, la file des tickets à servir. Il vit
dans `runtime/`, s'exécute avec Node 26 sans build, et ne dépend d'aucun paquet à l'exécution.

Ce document dit comment le lancer, le déployer et le recetter. **Installer brigade dans un autre
projet** est un parcours à part : [`installer.md`](installer.md). Les décisions et leurs raisons
sont dans les specs, [`superpowers/specs/`](superpowers/specs/) — ici, seulement la consigne.

## Ce qu'il fait aujourd'hui

| Geste | Ce qui se passe |
|---|---|
| Démarrer | Prend le verrou du projet, recalcule ses projections depuis le journal, écrit `runtime.started`, puis ce qui a changé de ses plafonds (`guard.configured`) et de sa cloison (`isolation.configured`), annonce sa station (`station.announced`), demande à `claude` si la machine a une session, et sonde GitHub |
| Tourner | Surveille le journal chaque seconde et se réveille au tick, toutes les 60 s. À chaque réveil : les garde-fous guettent le « stop », la station prend ce que ses bornes permettent, la pass juge ce qui est livré, le manager — s'il est allumé — juge, découpe et réagit. À chaque tick : `runtime.ticked`, sondage de GitHub, baux échus rendus, progrès des worktrees regardé, worktrees rangés, relevé de chaque cook (`cook.progressed`) |
| S'arrêter (`SIGTERM`, `SIGINT`) | Tue les cooks en cours et les gates en train de se jouer, écrit `runtime.stopped`, rend le verrou, sort avec le code 0 |
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
npm --prefix runtime run journal -- 13     # tout ce qui est arrivé au ticket 13, dans l'ordre
npm --prefix runtime run journal           # tout le journal, sans les battements du runtime
npm --prefix runtime run journal -- --ticks   # tout le journal, battements compris
```

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
| **BLOQUÉ** | en attente d'un ticket **abandonné** : il ne partira pas sans un geste de ta part |
| **pris** | prêté à une station, sous bail |
| **en pass** | le cook a fini ; la pass juge — ou s'est arrêtée, verte, sans merger |
| **servi** | mergé. La pass ferme son issue : il quitte le rail au sondage suivant |
| **86** | pas servable pour l'instant (quota épuisé, ticket refusé, pass remontée au chef) |

**Ordre de service** : `prio:1`, `prio:2`, `prio:3`, puis les issues sans `prio:` ; à priorité
égale, la plus ancienne d'abord.

**Un ticket peut en attendre un autre** : la ligne `attend` de sa fiche (voir « La fiche d'un
ticket »). Le rail ne le prête pas avant que **tous** ceux qu'il attend soient **servis**.

| Ce que dit la ligne | Sens | Ce qui le fait partir |
|---|---|---|
| `en attente … attend #12, #13` | #12 et #13 ne sont pas encore servis | rien : le dernier servi, il part seul |
| `BLOQUÉ … #12 abandonné (…)` | #12 a quitté le rail **sans avoir été servi** | remettre #12 sur le rail (issue ouverte, `fire`), ou retirer son numéro de la ligne `attend` |

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

Les faits du rail : `ticket.arrived`, `ticket.changed`, `ticket.left` (au nom de `github` ; aussi
pour une issue attendue, fermée sans être entrée sur le rail), `ticket.taken`, `ticket.renewed`,
`ticket.released`, `ticket.passing`, `ticket.served`, `ticket.86`, `ticket.blocked`, `rail.commons`.

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
npm --prefix runtime run garde-fous                # l'état
npm --prefix runtime run garde-fous -- stop        # arrête tout
npm --prefix runtime run garde-fous -- reprendre   # rouvre la cuisine, referme le disjoncteur
```

« stop » et « reprendre » s'écrivent au journal au nom du `chef` ; le runtime les voit en une
seconde. L'état montre plafonds, cuisine, disjoncteur, cooks en cours et derniers arrêts.

### Pourquoi ce ticket s'est-il arrêté ?

Chaque arrêt est au journal du ticket : `npm --prefix runtime run journal -- <ticket>`.

| Événement | Sens |
|---|---|
| `cook.launched` | Un cook part, avec son calibrage (`model`, `effort`), sa station, sa branche, ses plafonds et son flux brut (`runs/<run>.jsonl` dans le répertoire d'état ; sa sortie d'erreur en `.stderr`) |
| `cook.progressed` | Le relevé du cook à chaque tick : `turns` et `tokens` |
| `guard.tripped` | Un garde-fou l'arrête. `reason` : `turns`, `duration`, `tokens`, `idle`, `lease` ou `stop` ; `limit` et `observed` |
| `cook.exited` | Le process est mort. `outcome` : `ok`, `failed`, `guard`, `stop`, `neutral` ou `refused` ; code de sortie, tours, tokens ; `credentialsMasked` : combien de fois la forme des identifiants de Claude a été masquée dans son flux et sa sortie d'erreur (voir « Ni publiés dans ce qu'un cook dit ») |
| `cook.interrupted` | Le runtime s'est arrêté pendant que le cook tournait : il est mort avec lui |
| `breaker.opened`, `kitchen.stopped`, `kitchen.resumed` | Le disjoncteur s'ouvre ; « stop », « reprendre » (hors ticket) |

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

Une **station** vient prendre les tickets : `box/claude` — cette machine, le binaire `claude`, la
connexion Max du compte du service. Pour chaque ticket : elle le prend, crée un **worktree** sur
une branche neuve `cook/<run>` partie de la branche d'intégration, le rend exécutable, y lance le
cook sous garde-fous, puis **récolte**. Le clone du dépôt n'est jamais modifié.

### Plusieurs cooks à la fois

La station prend des tickets tant que **trois bornes** le permettent, relues à chaque prise :

| Borne | Ce qu'elle retient | Réglage |
|---|---|---|
| **Le plafond de cooks** | le nombre de tickets tenus en même temps | à chaud : `run station -- cooks <N>` — **30** par défaut, `0` pour aucune limite |
| **L'entrée** | le nombre de tickets dont le worktree se prépare et le setup se joue | `BRIGADE_MAX_SETUPS`, **4** par défaut |
| **La machine** | plus aucune prise quand processeur, mémoire ou disque manquent | trois seuils, ci-dessous |

`cooks <N>` écrit `station.capped`, lu dans la seconde, tenu après un redémarrage. **Baisser le
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
| `base` | la branche d'intégration est rouge (voir « La base est jugée seule ») |
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
| Un ticket renvoyé par la pass | le setup est joué dans le worktree neuf du renvoi |
| Le dépôt déclare un secret que la machine ne peut pas donner | **ni setup ni cook** : 86 dix minutes, motif `secrets-unavailable` ; l'issue dit lequel, une fois (voir « Les secrets du projet ») |
| Sous une identité par rôle, le ticket ne se lit pas sur GitHub | **aucun cook** : 86 dix minutes, motif `ticket-unreadable` (voir « Une identité GitHub par rôle ») |

**Un setup en échec se lit sur l'issue** : code de sortie ou plafond dépassé, la fin de sa sortie
(secrets du projet et forme des identifiants de Claude masqués), l'heure du retour, et **l'hôte que
la porte a refusé** pendant ce setup, avec le geste qui l'ouvre — une ligne dans
`.claude/brigade/reseau`, mergée sur la branche d'intégration (voir « La liste blanche »). **Une
fois par cause** (`setup.failed`) : de nouveau si le motif change, si un hôte jamais nommé sur ce
ticket est refusé, ou si un cook est parti depuis. `run cloison` montre les derniers refus.

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

**Les tickets qu'il attend** et **la zone de fichiers qu'il possède** vivent dans **un commentaire
de son issue**, repéré par un marqueur :

```
<!-- brigade:fiche -->
**Fiche du ticket** — lue par le runtime, corrigeable à la main.
- attend : #68, #69
- zone : runtime/src/rail.ts, runtime/test/rail.test.ts
```

`attend` : des `#N`, séparés par des virgules ou des espaces. `zone` : des chemins relatifs à la
racine du dépôt — fichiers ou dossiers —, séparés par des virgules.
Sans fiche, un ticket n'attend personne et ne possède rien. **Elle se corrige à la main**, en
éditant le commentaire ; la lecture tolère la casse, le gras, la puce ou son absence, l'ordre, et
de la prose autour. Le marqueur **ne compte qu'en tête de ligne, hors d'un bloc de code**. Le
manager écrit celle des tickets qu'il découpe.

| Ce que porte l'issue | Ce que le runtime en fait |
|---|---|
| Une clé inconnue (`budget : 40`) ; une puce qui n'est pas `clé : valeur` ; une clé posée deux fois | fiche illisible |
| Une valeur qui n'est pas un `#N`, ou pas un chemin du dépôt (absolu, `~`, `..`) | fiche illisible — la valeur est citée |
| Un **motif** dans la zone (`*`, `?`) | fiche illisible : un dossier possède déjà tout ce qu'il contient |
| Deux fiches | fiche illisible, **aucune n'est lue** |
| Un `#N` qui ne désigne aucune issue, le ticket lui-même, ou une PR | fiche illisible |
| Des `attend` qui forment un cycle entre tickets du rail | fiche illisible pour chaque ticket du cycle |
| Une fiche posée par quelqu'un qui n'a pas la main sur le dépôt | **ignorée**, et dit sur journald (`fiche ignorée sur le ticket #N`) |

Fiche illisible, le ticket est **refusé** à la prise : 86, motif `unreadable-card`, un commentaire
liste ce qu'il faut corriger. Lisible ou supprimée, il revient seul (`ticket.released`, motif
`card-readable`) ; ce qui reste à corriger se lit dans `run rail`. La fiche est relue quand l'issue
change, et entre au journal (`ticket.arrived`, `ticket.changed`, champ `card`).

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
**Pour repartir** : `claude /login` sous le compte du service, puis `garde-fous -- reprendre`.

Le runtime ne lit jamais les identifiants de `claude`, et **refuse de démarrer** si son
environnement porte `ANTHROPIC_API_KEY`, `ANTHROPIC_AUTH_TOKEN` ou `CLAUDE_CODE_OAUTH_TOKEN`.

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

Elle montre le plafond, la machine, la connexion Max, le quota, la `retenue`, les cooks en cours
avec leur calibrage, les dix derniers finis, et **`consommé`** — tout ce que le projet a lancé,
cooks, relectures et jugements : ce qui tourne, les **5 dernières heures** (la fenêtre du quota
Max, à comparer à `/usage` en ordre de grandeur) et les **24 dernières heures**.

| Événement | Sens |
|---|---|
| `station.announced` | La station se présente : moteur, ce qu'elle fournit, plafond de cooks par défaut (hors ticket) |
| `station.capped` | Le chef a réglé le plafond de cooks : `maxCooks`, `0` pour aucune limite (hors ticket) |
| `station.saturated`, `station.relieved` | La machine n'en peut plus (`resource` : `cpu`, `memory`, `disk` ; `observed`, `limit`), puis respire (hors ticket) |
| `station.held`, `station.released` | Un ticket pourrait partir et n'est pas pris (`reason`, voir « Plusieurs cooks à la fois ») ; plus rien ne retient (hors ticket) |
| `station.unarbitrated`, `station.arbitrated` | L'arbitre ne répond plus : mode dégradé, un cook à la fois, chaque `cook.launched` porte `unarbitrated: true` ; puis il répond de nouveau (hors ticket) |
| `station.86` | Le quota est épuisé jusqu'à `until` (hors ticket) |
| `station.disconnected` | La connexion Max a expiré |
| `cook.stalled` | La moitié du bail est passée sans progrès (`idleMs`, `leaseMs`). Un signal |
| `ticket.86` | Motifs de la station : `no-calibration`, `unreadable-card`, `refused` (sans heure de retour) ; `setup-failed`, `ticket-unreadable`, `secrets-unavailable`, `worktree-failed` (retour à `until`) |
| `setup.failed` | Pourquoi le setup a échoué : `why`, et `hosts`, ce que la porte a refusé. C'est ce qui décide du commentaire sur l'issue |
| `secrets.unavailable` | `problems` : des noms de variables et de fichiers, **jamais une valeur** |
| `cook.reported` | Le compte-rendu d'un cook. `ending` : `done`, `failed`, `86`, `disconnected`, `refused` ; `reason` (`no-commit`, `no-diff`, `no-deliverable`, `guard:idle`, `guard:lease`, `harvested:…`, ``secret-committed: `NOM` ``, `credentials-committed: name` ou `shape` — rien n'est poussé…) ; `summary` : son dernier message, secrets et identifiants masqués ; `deliverable` : ce qu'il a délimité, ou `null` ; `pr` ; `reconciled` |
| `cook.out-of-zone` | La livraison confrontée à la zone de la prise : `zone`, `files` (`path`, `owners`), `cardChanged`. Un signal ; jamais écrit pour un ticket pris sans zone |

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
npm --prefix runtime run manager -- allumer
npm --prefix runtime run manager -- eteindre
npm --prefix runtime run manager -- rendre 77   # lui rendre une issue qu'il a écartée parce que tu y as retiré un de ses labels
```

⚠️ **Allumé, il juge tout le backlog ouvert**, et ce qu'il juge exécutable part aussitôt en cuisine.
Avant d'allumer, pose `blocked-on-human` sur ce qui ne doit pas partir : une issue qui le porte
n'est jamais jugée, **une épique qui le porte n'est jamais découpée**. Entre deux issues que tu as
écrites toi-même, il ne pose pas de dépendances : elles partent dans l'ordre de service, sauf si tu
écris `attend` dans la fiche de l'une. Entre les tickets d'une épique qu'il découpe, il les pose.

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
| porte `blocked-on-human`, `question` ou `decision` | Rien | `manager.set-aside` (le label) |
| porte déjà, dans son corps, la liste de tickets d'une épique, sans qu'il l'ait découpée | Rien : elle a été découpée à la main | `manager.set-aside` (`already-split`) |
| porte `epic` | **Découpée** par le LLM, une fois | `manager.split`, ou une question |
| toute autre | **Jugée** par le LLM, une fois par état | `manager.judged`, ou `manager.failed` |

Aucun de ces labels n'est exigé : une épique sans `epic` va au LLM, qui la reconnaît — au prix
d'un jugement de plus.

**Le jugement** est un appel à `claude` sans outil, hors de tout worktree, au calibrage de
`BRIGADE_MANAGER_MODEL` / `BRIGADE_MANAGER_EFFORT`. Il lit le titre, le corps, les labels et les
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
| tu y as retiré `fire`, `model:` ou `effort:` qu'il avait posé (`chef-changed`) | `npm --prefix runtime run manager -- rendre <n°>` |
| elle porte `blocked-on-human`, `question` ou `decision` | Retirer le label : elle est jugée au réveil suivant |
| son corps liste déjà les tickets d'une épique (`already-split`) | Retirer la liste du corps : l'épique est découpée au réveil suivant |
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
**fiche** (`attend`, `zone`) en commentaire ; et `fire`, posé **en dernier**. Il ne repasse pas par
le jugement, et attend ceux dont il dépend (voir « La fiche d'un ticket »).

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
`86 (motif)`, `bloqué — #N abandonné (…)`, `abandonné (…)`, `fermé`. Éteint, le manager ne tient
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
| un job en échec | **rouge**, avec le nom du job, sa conclusion, son adresse |
| des jobs en cours | pas de verdict : relue à chaque tick. Trente minutes sans conclusion : remontée au chef (`unjudged`, cause `ci-silent`). Sauf constat bloquant du reviewer : rouge tout de suite, CI « non lue » |
| tout est vert | vert |
| **aucun check** | ni vert ni rouge : le verdict repose sur les gates et le reviewer (`ci: none`). Sauf si la branche porte des workflows (`.github/workflows`) : leurs checks sont attendus |

Le verdict est au journal (`pass.judged`) **avec ce qui l'a produit** et **ce sur quoi il porte** :
la tête de la branche (`sha`), celle de la base fusionnée (`base`), l'arbre obtenu (`merged`).
**Vert veut dire « une fois fusionnée avec la base, les gates et la CI n'ont rien trouvé, et un
reviewer a relu le diff sans rien trouver de bloquant ».** Pas « un humain a relu », et jamais
« vert sur sa branche ».

### Le plafond de durée des gates n'est pas jugé par la pass

Des gates peuvent se donner un plafond de durée (binding **Plafond des gates** du `CLAUDE.md` du
projet) et sortir rouges quand il est franchi. Il mesure le poste où il a été fixé, et un cook n'y
peut rien : **la pass ne le juge pas.** Elle le reconnaît à deux lignes — `durée des gates : … pour
un plafond de <n> s — … de trop` et `FAIL  plafond des gates franchi : plus de <n> s de processeur` :

| Les gates sortent rouges, et | Ce qu'en fait la pass |
|---|---|
| le plafond est leur **seule** ligne `FAIL` | **vertes** : la livraison suit son chemin. Le dépassement se lit au journal (`gates.overCeiling`), sur l'issue (« Pass — plafond des gates franchi, non jugé »), dans `run pass` et `run mesures` |
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
jetable du jugement, au calibrage du projet (`BRIGADE_REVIEWER_MODEL`, `BRIGADE_REVIEWER_EFFORT`,
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
| une réponse qui ne se lit pas | **ni verte ni rouge** : remontée (`unjudged`, cause `review-unreadable`), sans renvoi |

Chaque relecture laisse sur l'issue un commentaire « Reviewer — … ». **Une livraison n'est relue
qu'une fois** (`pass.reviewed`) ; un renvoi est une autre livraison. **Un reviewer vert ne lève
aucune autre règle** : ni l'arrêt sans grant, ni `review-required`.

Une relecture est au journal **comme un cook** (station `reviewer`, run `review-<ticket>-…`) et
passe par les garde-fous : **rien n'est relu** sous « stop », disjoncteur ouvert, quota épuisé ou
connexion expirée — la livraison attend. Illisible ou non aboutie, elle est **un échec** pour le
disjoncteur (non aboutie, elle est retentée) ; **refusée par le modèle**, elle est retentée sans
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
| illisible | remontée au chef (`unjudged`, cause `review-unreadable`) |
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
| vert, mais la livraison touche `.claude/brigade/` ou `.github/workflows/` — ses juges —, ou `runtime/src/grant.ts`, la liste de ce qu'aucun grant n'autorise | peu importe | **jamais mergée par la pass** (`review-required`, cause `judge-modified`) : un cook qui modifie ses juges peut se rendre vert seul |
| vert, mais la livraison touche `.claude/brigade/reseau` ou `.claude/brigade/secrets` — ajout, modification ou suppression | peu importe | **jamais mergée par la pass** (`review-required`, cause `declaration-modified: <fichiers>`) : mergée, la déclaration ouvre un hôte, ou remet un secret de la machine, aux cooks suivants. Le commentaire d'issue dit quoi y relire |
| vert, ticket sans diff | peu importe | **servi sans merge**, issue fermée |
| aucun, **base rouge** | peu importe | la livraison **attend** (`pass.waiting`, `base-red`) et repart seule quand la base est réparée — ou rejouée verte (`run base -- rejouer`) |
| rouge — gates sur la fusion, conflit, CI, ou constat bloquant | — | les **findings repartent à un cook**, sur la même branche. Rien n'est mergé |
| rouge une seconde fois, **manager allumé** | — | la pass **passe la main au manager** (`pass.deferred` ; voir « Il réagit à un échec ») |
| rouge une troisième fois, manager éteint | — | deux renvois sont consommés : la pass **te remonte le ticket** (`still-red`). Il passe **86** |

Seul un verdict rouge consomme un renvoi. Un cook de renvoi qui échoue sans rien livrer n'en
consomme pas : c'est le disjoncteur qui borne. Chaque décision est commentée sur l'issue, et dit
sur quoi portait le verdict — `` `8c1d2e0` fusionné avec `v2` (`4be1f07`) ``.

#### Les motifs, et le geste de chacun

Un motif par geste du chef — pas plus de noms que de gestes. Ce qui précise un motif sans changer
le geste est sa `cause` ; `run pass` montre les deux, `(unjudged : ci-silent)`, et la file de
`status` écrit le geste sur chaque ligne.

| Fait | Motif | Ce que c'est | Ton geste |
|---|---|---|---|
| `pass.held` | `no-grant` | verte, pas de grant actif (`expired` : il s'était éteint seul à cet instant) | merger la PR à la main ; ou, pour les suivantes, `npm --prefix runtime run grant -- activer merge` |
| `pass.held` | `review-required` | verte, mais elle touche à ses juges (cause `judge-modified`) ou à ce que le projet s'ouvre (cause `declaration-modified: <fichiers>`). Aucun grant ne la fait merger | la relire, puis la merger à la main |
| `pass.held` | `merge-refused` | verte, et GitHub a refusé le merge (cause : ce qu'il a dit). Non retenté | lever ce qu'il refuse, puis merger à la main |
| `pass.escalated` | `still-red` | rouge, et plus personne ne la corrigera : renvois épuisés (cause `returns-exhausted`), ou le manager remonte (cause `manager-escalated`) | trancher : merger la PR à la main, ou retirer `fire` — sans PR, retirer `fire` ou fermer l'issue |
| `pass.escalated` | `unjudged` | la pass n'a pas pu juger ; la cause dit ce qui l'en a empêchée | lever ce que dit l'issue, puis retirer et reposer `fire` ; ou merger à la main ; ou retirer `fire` |
| `pass.escalated` | `manager-split` | le manager a redécoupé le ticket : ses sous-tickets portent le travail | aucun |

Les causes d'un `unjudged` — aucune ne consomme de renvoi, un cook n'y peut rien :

| Cause | Ce qui a empêché le jugement |
|---|---|
| `wrong-base` | la PR ne vise pas la branche d'intégration (une PR vers `main` quand la base est `v2`) |
| `no-gates` | le projet n'a pas de `gates.sh` une fois la branche fusionnée : sans gates, « vert » voudrait dire que personne n'a regardé |
| `worktree-lost` | le clone de la station ne connaît plus la branche, ou la fusion échoue sans que ce soit un conflit (git en panne). La pass ne recrée pas la branche ; ce que le cook a poussé reste sur l'origine |
| `ci-silent` | trente minutes de CI sans conclusion |
| `review-unreadable`, `review-unsendable`, `review-refused` | la relecture ne se lit pas ; sa consigne ne tient pas dans une commande ; le modèle l'a refusée trois fois d'affilée |
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

**La réparer est à toi** : pousse le correctif. Dès que la base a bougé, ses gates sont rejouées,
et au vert tout repart seul. Tu peux toujours merger une livraison en attente à la main.

**Un rouge qui ne tient pas au code se rejoue sans commit**, à ta demande seulement — il n'y a
pas de rejeu sur minuteur : `npm --prefix runtime run base` dit ce que le dernier contrôle a dit,
`npm --prefix runtime run base -- rejouer` fait rejouer les gates d'une base rouge sur la même
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
npm --prefix runtime run grant -- activer merge              # sans échéance
npm --prefix runtime run grant -- activer merge --pour 4h    # il s'éteint seul dans quatre heures
npm --prefix runtime run grant -- activer merge --jusqu-a 18h30 --usages 10
npm --prefix runtime run grant -- prolonger merge --pour 2h  # un grant en cours, sans le révoquer
npm --prefix runtime run grant -- revoquer merge
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
  dans `runtime/src/grant.ts` et ne se change que par une livraison, que la pass ne merge jamais
  elle-même.

⚠️ **Grant actif, du code écrit par un cook atterrit sur la branche d'intégration sans qu'aucun
humain l'ait lu** : ses juges sont les gates et la CI du projet, et un reviewer qui est un modèle.

#### Une échéance, et il s'éteint seul

| Tu tapes | Ce que ça veut dire |
|---|---|
| *(rien)* | **Sans échéance** : il vaut jusqu'à ce que tu le révoques |
| `--pour 30min` · `4h` · `1h30` · `2j` | Une durée, comptée à partir de maintenant |
| `--jusqu-a 18h` · `18h30` | Aujourd'hui à cette heure, **à l'heure de la machine**. Une heure déjà passée est **refusée**, pas reportée à demain |
| `--jusqu-a 2026-10-12T18:00` · `2026-10-12` | Ce jour-là à cette heure ; sans heure, jusqu'à la **fin** du jour (23:59:59) |
| `--usages 10` | Pour dix merges |

`--pour` ou `--jusqu-a`, l'un ou l'autre. `--usages` se donne seul ou avec une date — **le premier
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

`prolonger merge` prend `--pour`, `--jusqu-a`, `--usages <n>` (n **de plus** que ce qu'il reste) ou
`--sans-echeance` (lève l'échéance) : **un fait de plus** (`grant.extended`). **Prolonger ne
raccourcit pas** : une date plus proche, ou une limite posée sur un grant qui n'en avait pas, est
refusée — révoque puis réaccorde. Un grant éteint ou révoqué ne se prolonge pas, il se
**réaccorde** par `activer` ; `activer` sur un grant actif n'écrit rien et renvoie à `prolonger`.

### Voir la pass

```bash
npm --prefix runtime run pass              # les livraisons : phase, motif, renvois consommés, PR — l'état de la base en tête quand il compte, le bilan des arrêts sans grant en fin
npm --prefix runtime run pass -- 17        # l'histoire du ticket 17 : chaque verdict et ce qui l'a produit
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
| `pass.started`, `pass.pr-opened` | La pass prend une livraison (run, PR, commit jugé) ; elle a ouvert la PR que la station n'avait pas pu ouvrir (`reconciled` : retrouvée après coup) |
| `pass.reviewed` | Le reviewer a relu la livraison du `run`, sur ce `sha` : `review`, `outcome` (`green`, `red`, `unreadable` + `reason`), `summary`, `findings`, `truncated` |
| `pass.judged` | Le verdict, avec `sha`, `base`, `merged` (nul : la fusion ne se fait pas), `gates`, `ci`, `review`, `findings`, `judgeModified`, `declarations`, `noDiff` |
| `pass.served`, `grant.used` | Verte et sans diff, servie sans merge ; l'intention de merger, usage du grant — chacun avec le numéro du verdict qui l'autorise |
| `merge.done` | Mergée. `by` : `pass` ou `outside` ; `actor` : le compte GitHub ; `reconciled` : constaté après un redémarrage ; `unverified` : fait hors du runtime, la base est à contrôler |
| `merge.failed` | Le merge n'a pas abouti : `interrupted`, ou le refus de GitHub |
| `pass.held` | Verte, non mergée : `reason` (`no-grant`, `review-required`, `merge-refused`), `cause`, `expired` |
| `pass.waiting` | Ni jugée ni mergée pour l'instant : `base-red`, `machine-saturated`. Elle repart seule |
| `pass.returned`, `pass.deferred`, `pass.outdated` | Rouge : renvoi `n` sur 2, avec les findings ; la main passe au manager ; GitHub exigeait une branche à jour et a refusé le merge, `findings` repart au cook |
| `pass.escalated` | Remontée au chef : `reason` (`still-red`, `unjudged`, `manager-split`), `cause` |
| `pass.pr-closed` | La PR a été fermée sans merge : la pass ne juge, ne renvoie ni ne merge plus cette livraison. Écrit une fois |
| `pass.abandoned` | Le ticket a quitté le rail sans que sa livraison soit mergée : `branch`, `pr` (encore ouverte, ou nul), `merged`, `closed`. Une intention de merge en vol y trouve sa fin |
| `base.checked` | Hors ticket. Les gates jouées sur la base seule : `sha`, `outcome` (`green`, `red`, `skipped`), `gates`, `tickets` ; sur un `skipped`, `red` (le rouge qui reste) et `reason` (l'essai ne s'est pas fait) |
| `base.recheck-requested`, `base.recheck-held` | Le chef demande un rejeu (`run base -- rejouer`) ; la machine saturée le retient (`resource`, `observed`, `limit`) |
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
    de branche peut encore y interdire tout push direct (voir « À vérifier avant d'installer »).
- **Les gates jouées sont celles de la fusion — donc celles du cook, s'il y a touché —**, avec les
  droits du runtime. D'où la règle `review-required`.
- **Ce qui est jugé est la fusion avec la base du moment**, mais : un merge fait **à la main**
  peut se glisser entre le dernier regard sur la base et l'appel à GitHub (il déclenche un
  contrôle de la base) ; **une base cassée n'est vue rouge que quand quelque chose la fait juger**
  — un push direct n'y suffit pas — et le reste tant que tu ne l'as pas réparée ou fait rejouer ;
  une livraison arrêtée n'est pas rejugée quand la base bouge ; **la CI et le reviewer jugent le
  commit de la branche, pas la fusion** (#282).
- **Le reviewer est un modèle, du même moteur que le cook** : il peut partager son angle mort, et
  se laisser convaincre par ce qu'il relit. **« Sans droit d'écriture » tient à sa liste
  d'outils**, pas à une clôture du système. Il n'a pas d'identité GitHub : la pass publie sa
  relecture.
- **Un ticket sorti du rail ne ferme rien derrière lui**, et son départ n'est vu qu'au sondage.
- **Un fichier neuf que le projet n'ignore pas part dans la PR**, si le cook l'a laissé dans une
  livraison. Le reviewer est prévenu ; la seule garde est le `.gitignore` du projet.

## L'état de la cuisine

Une seule commande pour savoir où en est le projet, sans ouvrir la base :
`npm --prefix runtime run status` — suivie de `-- --suivre [<ticket>]`, elle reste ouverte et
ajoute une ligne par événement.

```
attend     2 décisions attendent le chef — la plus ancienne depuis 2 j
  #12  depuis 2 j  livraison verte, non mergée faute de grant `merge` — à merger à la main : https://github.com/benomite/brigade/pull/31 — ou accorder le grant, pour les suivantes : `npm --prefix runtime run grant -- activer merge`  Le journal en ajout seul
  #21  depuis 3 h 02  BLOQUÉ : #17 abandonné (label `fire` retiré) — à débloquer : remettre #17 sur le rail, ou le retirer de la ligne `attend` de la fiche  L'export du journal
  sans grant, 4 livraisons vertes arrêtées : 3 mergées à la main, 0 fermée sans merge — aucun désaccord —, 1 encore ouverte
```

| Bloc | Ce qu'il dit |
|---|---|
| `runtime` | En marche, arrêté, ou jamais démarré — **d'après le journal**. Un runtime tué sans préavis y paraît encore en marche : c'est l'**âge du dernier tick** qui le trahit. Au-delà de quelques cadences : `systemctl status brigade@<projet>` |
| `cuisine` | Le « stop » du chef et le disjoncteur, comme `run garde-fous` |
| `connexion` | **Absent tant que la connexion Max tient.** Sinon, par station : `Max ABSENTE` ou `EXPIRÉE`, depuis quand, la raison, et le geste — `claude /login` sous le compte du service, puis `run garde-fous -- reprendre`. Plus aucun ticket n'est pris d'ici là. Voir « Connexion Max expirée » |
| `grant` | **Absent tant qu'aucun grant ne vaut ni ne s'est éteint seul.** Actif : son échéance, ce qu'il en reste, ses usages. `BIENTÔT ÉTEINT` : moins d'une heure, ou un seul usage. `ÉTEINT SEUL` : la pass s'arrête à la PR ouverte jusqu'à ce que tu le réaccordes. Voir « Le grant `merge` » |
| `base` | **Absent tant que la base n'est pas rouge** — sauf si son contrôle est retenu parce qu'elle ne se rapatrie pas. Rouge, elle retient toute la cuisine : depuis quand, sur quel commit, le contrôle qui n'a pas pu se jouer, le rejeu demandé. Sans demande en cours, la dernière ligne est le geste : `npm --prefix runtime run base -- rejouer`. Voir « La base est jugée seule » |
| `sauvegarde` | La dernière sauvegarde réussie (`backup.completed`) : son âge, son nom, son dernier événement. `TROP VIEILLE` : l'âge dépasse `BRIGADE_BACKUP_MAX_AGE_HOURS`. `JAMAIS FAITE` : le journal n'en porte aucune. Dans les deux cas : `systemctl status brigade-sauvegarde@<projet>` |
| `attend` | **Absent quand rien ne t'attend.** Voir « Ce qui attend le chef », ci-dessous |
| `rail` | Le décompte par état, puis chaque ticket dans l'ordre de service. Un ticket pris porte deux durées : depuis la prise, et **sans progrès** (depuis que sa station a vu son worktree bouger). `COINCE` : la moitié de son bail est passée sans progrès, ou son bail est échu et il est encore pris. Un ticket en attente qui ne part pas dit ce qu'il attend — un autre ticket, une zone tenue, ce qui retient sa station ; `BLOQUÉ` : ce qu'il attendait a été abandonné (voir « Le rail ») |
| `cooks` | Combien tournent, et le plafond de la station. **Si un cook coince, la ligne le nomme** (`— 2 COINCENT : #14, #22`). Dessous, `MACHINE SATURÉE` avec ce qui manque, et `SE RETIENT` avec la raison. Puis une ligne par cook, **le pire en tête** ; jugements et relectures à la fin, sans branche. Tours et tokens sont ceux du dernier relevé, dont l'âge est affiché. Runtime arrêté, un cook encore listé est mort avec lui |
| `consommé` | Ce que l'ensemble des lancements a consommé — cooks, relectures, jugements : en cours, 5 h (la fenêtre du quota Max), 24 h |
| `worktrees`, `dérive`, `claude` | **Absents quand il n'y a rien à dire** : les worktrees que le runtime n'a pas pu ranger (« Ce qui reste après un cook ») ; les mesures qui ont franchi un seuil déclaré (« Le relevé des mesures ») ; sous cloison, le dernier rangement des transcripts (« Les transcripts du projet sont rangés ») |
| `derniers événements` | Les quinze derniers, au format de `run journal`, sans battements ni relevés |

### Ce qui attend le chef

La cuisine ne bloque jamais sur toi : ce qui t'attend s'empile, le plus ancien d'abord, et le reste
avance. Chaque entrée **nomme le geste qui la débloque** — ou dit qu'aucun n'est connu pour son
motif — et sort **d'elle-même** dès que le journal porte la décision prise, y compris sur GitHub.
Fermer une PR sans la merger n'est qu'une demi-décision : l'entrée ne sort pas, elle change.

| Entrée | Le geste | Ce qui la retire |
|---|---|---|
| `livraison verte, non mergée faute de grant` · ``… le grant `merge` s'est éteint seul le …`` (`no-grant`) | merger sa PR à la main ; ou accorder le grant pour les suivantes : `npm --prefix runtime run grant -- activer merge` | le merge à la main, que la pass constate (`merge.done`) ; le ticket sorti du rail (`ticket.left`) ; un cook reparti sur le ticket. Sa PR fermée sans merge la remplace par `PR fermée sans merge` |
| `livraison verte qui touche à ses juges` · `… à ce que le projet s'ouvre (<fichiers>)` (`review-required`) | la relire, puis la merger à la main | de même |
| `livraison verte, merge refusé par GitHub (…)` (`merge-refused`) | lever ce que GitHub refuse, puis merger à la main | de même |
| `remontée par la pass, rouge (still-red : returns-exhausted)` · `remontée par le manager, rouge` | à trancher : merger sa PR à la main, ou retirer `fire` ; sans PR, retirer `fire` ou fermer l'issue. Détail : `run pass -- <ticket>` | le merge à la main ; le ticket sorti du rail, ou rendu au rail (`ticket.released`). Sa PR fermée sans merge la remplace de même |
| `remontée par la pass, qui n'a pas pu la juger (unjudged : <cause>)` | à lever : ce que dit son issue, puis retirer et reposer `fire` ; ou merger à la main, ou retirer `fire` | de même |
| `PR fermée sans merge` | le ticket tient encore sa place sur le rail : retirer `fire`, ou fermer l'issue | le ticket sorti du rail, ou rendu au rail s'il était 86 ; la PR rouverte puis mergée à la main. Un ticket redécoupé n'y entre pas |
| `sans calibrage` · `fiche illisible` · `refusé trois fois par le modèle` | un 86 de la station **sans heure de retour** : poser `model:` et `effort:`, corriger la fiche, ou — refusé — reformuler ou recalibrer puis retirer et reposer `fire` | calibré ou corrigé, la station le rend seule au rail ; le ticket sorti du rail |
| `BLOQUÉ : #N abandonné (…)` | remettre #N sur le rail, ou le retirer de la ligne `attend` de la fiche | #N revenu (`ticket.arrived`) ; la fiche corrigée (`ticket.changed`) ; le ticket sorti du rail |
| ``écartée par le manager, elle porte `question` `` · `` `decision` `` · ``retenue, elle porte `blocked-on-human` `` | répondre, décider ou lever la retenue, puis retirer le label ; ou fermer l'issue | le label retiré, le manager la juge ; l'issue fermée (`manager.closed`) ou lancée à la main |
| `jugement du manager illisible` · `découpage du manager illisible` · `question du manager avant de découper l'épique` | modifier l'issue pour qu'elle soit reprise, ou répondre à la question sur l'issue ; pour un ticket, poser `fire`, `model:` et `effort:` à la main ; ou fermer l'issue | l'issue modifiée, ta réponse, l'issue fermée ou lancée à la main ; toute décision suivante du manager qui n'y voit plus une épique à découper |
| `connexion Max absente` · `expirée` | la ligne porte la station, pas un ticket : `claude /login` sous le compte du service, puis `run garde-fous -- reprendre` | le « reprendre » (`kitchen.resumed`) |

Dès qu'une livraison a été arrêtée faute de grant, le bloc se termine par **le chiffre sur lequel
accorder** : `sans grant, N livraisons vertes arrêtées : X mergées à la main, Y fermées sans merge — Y
désaccords —, Z encore ouvertes`. Une PR fermée sans merge est un désaccord : tu as refusé ce que
la pass aurait mergé. La file vide, le bloc n'apparaît pas : la même ligne se lit dans `run pass`
et `run grant`.

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

## Le relevé des mesures

Les gates disent « ça marche », jamais « ça devient lourd ». Le relevé met côte à côte, **dans le
temps**, ce que le journal sait de la lourdeur du projet : c'est la pente qui révèle une dérive.

`npm --prefix runtime run mesures` les montre par tranches de 10 merges ; `-- --par 25`, de 25.

| Colonne | Ce qu'elle dit | D'où elle vient |
|---|---|---|
| `merges`, `jusqu'au` | La tranche : le rang de ses merges, le jour du dernier. L'axe est le **merge**, pas l'horloge | `merge.done` |
| `tests`, `suite` | Le nombre de tests et la durée de leur suite, à la dernière livraison de la tranche | `MESURE tests`, `tests_s` |
| `gates` | La durée des gates d'une livraison — médiane de la tranche | `MESURE gates_s` |
| `part gates` | Ce que les gates pèsent dans le temps d'une livraison, renvois et rejugements compris, rapporté à cette durée plus celle de ses cooks | `gates_s`, `durationMs` de `cook.exited` |
| `dépôt`, `doc` | Le poids de ce qui est commité, et de son markdown | `MESURE depot_octets`, `doc_octets` |
| `contexte` | Ce que **chaque** cook charge à coup sûr : le `CLAUDE.md` et ses imports `@chemin` | `MESURE contexte_octets` |
| `seuils`, `plafond` | Sous les tableaux : chaque seuil déclaré, `FRANCHI` ou non ; et le plafond de durée des gates, s'il a été franchi | `drift.configured`, `gates.overCeiling` |
| `pente` | De combien la mesure a été multipliée, de la première tranche montrée à la dernière | — |
| `tours` (second tableau) | Les tours d'un ticket, tous ses cooks comptés, par calibrage : médiane, et sur combien de tickets | `cook.launched`, `cook.exited` |

- **`—` veut dire « le journal ne le sait pas »**, jamais zéro. Au-delà de douze tranches, seules
  les dernières sont montrées ; `--par` élargit la fenêtre.
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

Les seuils entrent au journal quand ils changent (`drift.configured`). Quand un merge en fait
franchir un, le runtime écrit `drift.crossed` et une ligne dans `journalctl -u brigade@<projet>`,
**une fois** ; repassée sous son seuil, ou le seuil retiré, `drift.cleared`. Entre les deux, le bloc
`dérive` de `status` le rappelle. Rien n'est arrêté, aucune issue n'est ouverte.

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
à activer sur le dépôt par le chef (« À vérifier avant d'installer », point 10) —, et la
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

La frontière des fichiers passe **entre le runtime et ce qu'il lance** : ce qu'il fait lui-même —
`git`, `gh`, `claude auth status` — n'est pas cloisonné.

### Ce qu'un lancement cloisonné voit

| | |
|---|---|
| **Masqué** — un répertoire vide à la place | chaque répertoire de `BRIGADE_SANDBOX_HIDDEN` : sur la box `/var/lib/brigade` et `/etc/brigade`, donc l'état, le clone, les worktrees, les secrets et les clés de **tous** les projets, le sien compris |
| **Rendu, en écriture** | son worktree, et **sa vue du `.git` du clone** : objets, références et worktrees sont les vrais ; la `config` et les `hooks` sont **les siens** |
| **Rendu, en lecture seule** | au reviewer, le worktree et la vue du `.git` ; au cook sans identité GitHub, son ticket remis |
| **En lecture seule** | toute la machine, **et le répertoire du compte** : son `.gitconfig`, ses chaînes d'outils, le binaire `claude` |
| **Au projet, en écriture** | ce qui s'écrit sous `~` : `~/.npm`, `~/.cache`, `~/.claude.json`, toute entrée que le compte n'a pas, et ce que nomme `BRIGADE_SANDBOX_PRIVATE` — rangé dans `<état>/compte` |
| **En écriture, tel quel** | `/tmp` (celui du projet : `PrivateTmp`) |
| **Remplacé** | `~/.claude` : celui du projet, `<état>/claude` — ni transcripts ni mémoire d'un autre projet |
| **Identifiants Max** | `~/.claude/.credentials.json`, monté **en lecture seule** : `claude` les lit, rien ne les réécrit |
| **Process** | les siens : ni `ps` ni `/proc/<pid>/environ` ne montrent un autre cook |

**Rien de ce qu'un cook écrit n'est lu comme configuration, ni exécuté, par le runtime** — dont le
`git`, le `gh` et le `claude` tournent hors cloison, sous le même compte et dans le même clone :

- **Le compte** est en lecture seule : un `git config --global` échoue, un `npm ci` écrit son
  cache dans celui du projet. Une chaîne d'outils qui écrit sous `~` (`~/.cargo`, `~/.gradle`) se
  nomme dans `BRIGADE_SANDBOX_PRIVATE` (noms séparés par `:`) : le projet a la sienne, vide au départ.
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

```
# .claude/brigade/reseau — un hôte par ligne
registry.npmjs.org
*.pythonhosted.org          # l'hôte et ses sous-domaines
base.exemple.org:5432       # un autre port que 443 et 80
```

Ni adresse IP, ni `*` seul, ni `*.com` : une ligne qui n'est pas un hôte n'ouvre rien, et
`npm run cloison` la montre.

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
| un hôte hors liste, par la porte | `403`, aussitôt ; en clair, la réponse nomme l'hôte et le geste qui l'ouvre | `npm run cloison` (`network.refused`), `journalctl -u brigade-porte@<projet>` |
| une connexion qui contourne la porte | le noyau jette ses paquets : UDP reçoit `EPERM`, **TCP attend le délai de son client** — à confirmer sur la box | nulle part |
| un hôte permis qui ne répond pas | `502` | la réponse |

Un événement par hôte et par dix minutes, cent hôtes nommés au plus. **Le filtre de l'unité est
sondé à chaque démarrage** : s'il ne tient pas, le runtime le dit — `MAIS un envoi direct part :
l'unité ne semble rien filtrer (IPAddressDeny)`. Son verdict se confirme sur la box (recette).

### Ce qui est refusé, et pourquoi

`BRIGADE_STATE_DIR=<répertoire d'état> npm --prefix runtime run cloison` lit le journal
(`isolation.configured`, écrit au démarrage quand l'état de la cloison change) et montre :
`fichiers` (`CLOISONNÉS` ou `OUVERTS`, ce qui est masqué), `réseau` (`LISTE BLANCHE` ou `OUVERT`,
et si l'unité filtre), `ce qui passe` (chaque hôte, et d'où il vient), et les `derniers refus`.

### L'éprouver, et ce qu'elle coûte

```bash
sudo -u <compte> env $(systemctl show brigade@<projet>.service -p Environment --value) HOME=~<compte> \
  npm --prefix /opt/brigade/runtime run cloison -- eprouver [<essais>]
```

De vraies sondes, sans cook ni quota : le lancement part dans `bwrap`, chaque répertoire masqué
est vide, les identifiants Max sont en lecture seule, les process des autres sont invisibles,
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
vont sous le `~/.claude` du compte, auquel le runtime ne touche jamais. Un transcript retiré n'est
pas perdu pour le diagnostic : le flux brut reste sous `runs/`, et lui est sauvegardé.

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
npm --prefix runtime run arbitre                          # l'état
npm --prefix runtime run arbitre -- poids thermigo 3      # « thermigo est prioritaire cette semaine »
npm --prefix runtime run arbitre -- retirer vieux-projet  # sa part n'est plus réservée
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

## Neuf variables, aucun défaut

| Variable | Rôle |
|---|---|
| `BRIGADE_STATE_DIR` | Le répertoire de tout l'état du projet : `log.db`, `lock.db`, `runs/`. Sur un **disque local** — le verrou en dépend |
| `BRIGADE_PROJECT` | Le nom du projet : minuscules, chiffres et tirets. Il s'écrit dans chaque événement et dans le nom de l'unité systemd |
| `BRIGADE_GITHUB_REPO` | Le dépôt GitHub dont le projet sert les issues : `<owner>/<repo>` |
| `BRIGADE_REPO_DIR` | Un clone du dépôt, **réservé à la station** : elle y accroche le worktree de chaque cook |
| `BRIGADE_BASE_BRANCH` | La branche d'intégration : d'où part chaque worktree, où vise chaque PR |
| `BRIGADE_MANAGER_MODEL` | Le modèle des jugements du manager : `opus`, `sonnet` ou `haiku`. Exigé même manager éteint |
| `BRIGADE_MANAGER_EFFORT` | Leur effort : `low`, `medium`, `high`, `xhigh` ou `max` |
| `BRIGADE_REVIEWER_MODEL` | Le modèle des relectures du reviewer. Une relecture par livraison jugée |
| `BRIGADE_REVIEWER_EFFORT` | Leur effort |

L'une des neuf absente, le runtime refuse de démarrer et dit laquelle.

Facultatives, **sans défaut** — mal écrites, le runtime refuse de démarrer :
`BRIGADE_ROADMAP_ISSUE`, l'issue de roadmap, que le manager ne juge jamais ;
`BRIGADE_CEILING_MODEL` et `BRIGADE_CEILING_EFFORT`, le plafond de calibrage (« Il réagit à un
échec ») ; `BRIGADE_COMMON_PATHS`, les chemins communs, séparés par des virgules, sans motif (« Les
zones de fichiers ») ; `BRIGADE_GITHUB_APPS_DIR` (« Une identité GitHub par rôle ») ;
`BRIGADE_SECRETS_FILE` (« Les secrets du projet ») ; `BRIGADE_SANDBOX_BIN` et
`BRIGADE_SANDBOX_HIDDEN` — exigées ensemble —, `BRIGADE_SANDBOX_PRIVATE` et `BRIGADE_PROXY_PORT`
(« La cloison ») ; `BRIGADE_ARBITER_PORT` (« L'arbitre entre projets ») ; les sept `BRIGADE_DRIFT_*`
(« Le relevé des mesures »).

Douze réglages ont un défaut ; un nombre mal écrit fait refuser le démarrage. Le plafond de cooks
n'est pas une variable : `run station -- cooks <N>` (voir « Plusieurs cooks à la fois ») :

| Variable | Rôle | Défaut |
|---|---|---|
| `BRIGADE_LEASE_SECONDS` | La durée du bail : le temps qu'un cook garde son ticket sans progrès observable. À tenir au-dessus du délai d'inactivité | `1800` |
| `BRIGADE_GH_BIN`, `BRIGADE_CLAUDE_BIN`, `BRIGADE_SYSTEMCTL_BIN`, `BRIGADE_GITHUB_API_URL` | Les binaires et l'API. Servent aux tests, qui y mettent des faux ; **jamais posés sur la box** | `gh`, `claude`, `systemctl`, `https://api.github.com` |
| `BRIGADE_GATES_TIMEOUT_SECONDS`, `BRIGADE_CI_WAIT_SECONDS` | Le plafond de durée des gates jouées par la pass (au-delà, arrêtées et rouges) ; l'attente tolérée d'une CI qui ne conclut pas, avant remontée au chef | `1800`, `1800` |
| `BRIGADE_MAX_SETUPS` | Combien de tickets peuvent être en entrée à la fois (worktree et setup) | `4` |
| `BRIGADE_MAX_LOAD_PER_CORE`, `BRIGADE_MIN_FREE_MEMORY_MB`, `BRIGADE_MIN_FREE_DISK_MB` | La garde de la machine : la charge par cœur au-delà de laquelle la station ne prend plus de ticket ; la mémoire disponible, et le disque libre sous `BRIGADE_STATE_DIR`, en Mo, sous lesquels elle n'en prend plus (`0` : jamais) | `1.5`, `1024`, `5120` |
| `BRIGADE_TRANSCRIPTS_KEEP_DAYS` | Sous cloison, la garde d'un transcript de `claude` après sa dernière écriture | `7` |

## Sauvegarder et restaurer

Le journal est la seule vérité du projet : les projections se recalculent, lui non.

### Ce qui est sauvegardé

`log.db`, le journal : **oui**, un instantané daté par sauvegarde. `runs/`, le flux brut des
cooks : **oui, en un seul exemplaire** — seuls les flux neufs ou changés sont recopiés, aucun n'est
jamais retiré. `lock.db`, `depot/`, `worktrees/` : non, ils se recréent. **Les secrets du projet :
non** — leur fichier vit hors de l'état, et ni le journal ni les flux n'en portent une valeur ; sur
une machine neuve, tu le reposes à la main.

L'instantané se prend pendant que le runtime tourne (`VACUUM INTO`). **Ne sauvegarde jamais
`log.db` avec `cp`, `rsync` ou un instantané de disque pendant que le runtime tourne.**

### Sauvegarder

```bash
BRIGADE_STATE_DIR=<répertoire d'état> BRIGADE_BACKUP_DIR=<destination> npm --prefix runtime run sauvegarder
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
BRIGADE_STATE_DIR=<répertoire d'état neuf> npm --prefix runtime run restaurer -- <destination>/<horodatage>
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
  BRIGADE_MANAGER_MODEL=sonnet BRIGADE_MANAGER_EFFORT=medium \
  BRIGADE_REVIEWER_MODEL=sonnet BRIGADE_REVIEWER_EFFORT=medium \
  npm --prefix runtime start   # Ctrl-C pour l'arrêter
```

**Lancé ainsi, c'est une vraie cuisine.** Le runtime lit les vraies issues du dépôt avec ton `gh`,
et sa station prend celles qui portent `fire` : un ticket calibré lance un vrai cook, sur ton quota
Max, sans demande de permission, puis pousse sa branche, ouvre une PR et commente l'issue ; sa
livraison est relue par un vrai reviewer, sur le même quota. Si le grant `merge` est actif dans ce
répertoire d'état, la pass **merge** ce qu'elle juge vert. Si le manager y est allumé, il juge
**toutes** les issues ouvertes du dépôt, y pose des labels, les commente, et **découpe ses
épiques : il crée des issues**.

### Regarder le rail sans rien lancer

Pour regarder le rail et les autres commandes du chef sans laisser la station prendre de tickets,
arrête la cuisine : `npm --prefix runtime run garde-fous -- stop`, qui tient d'un démarrage à
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
  `FAIL  tests du runtime arrêtés par la garde d'horloge`. Elle ne nomme pas le test, et n'est
  qu'aux gates : un `npm --prefix runtime test` lancé à la main reste retenu, et se tue par son
  pid. (`BRIGADE_GATES_GARDE_APRES` n'est que l'accroche de ses propres tests.)
- **non tenu** : un process qu'un test a lancé sans le tuer lui survit, sans retenir la suite.

Quand les gates (`.claude/brigade/gates.sh`) trouvent un test en échec, elles impriment son nom et
son erreur, et gardent la sortie entière de la suite dans `.brigade-state/gates/` du worktree (une
semaine) — le chemin est imprimé. Un échec qui ne se reproduit pas se lit là. Leur dernière ligne
est toujours le verdict, `gates : VERT` ou `gates : ROUGE`.

### Le hook d'arrêt, le verrou des gates et leur plafond

- **Le hook d'arrêt** (`.claude/brigade/gates-hook.sh`, sur `Stop` et `SubagentStop`) rejoue les
  gates de l'arbre où travaille celui qui s'arrête : la session, son arbre ; un dev-teammate
  `dev-<n>`, l'unique worktree `<n>-<slug>`. Vert, il se tait ; rouge, il réveille **la session**
  — deux fois sur un même échec, quatre en tout, par arbre —, qui transmet au dev sans corriger.
- **Le verdict gardé** : le hook pose `BRIGADE_GATES_VERDICT_GARDE=1`, et un arbre **vert** qui n'a
  pas bougé depuis son verdict n'est pas rejoué (`gates : verdict repris du passage …`). Un rouge
  gardé l'est toujours ; des gates lancées à la main rejouent toujours, et posent le verdict.
- **Le verrou** (`.brigade-state/passage-des-gates/`) : un seul passage à la fois par arbre. Qui
  arrive pendant un passage l'attend, `BRIGADE_GATES_ATTENTE` secondes au plus (300 ; `0` : ne pas
  attendre), puis reprend son verdict si l'arbre n'a pas bougé, ou joue à son tour ; passé la
  borne, il joue de front. Un passage tué ne retient personne.
- **Le plafond** se déclare dans les bindings du `CLAUDE.md` (`- **Plafond des gates** : `<n> s` de
  processeur`) ; sans la ligne, rien n'est plafonné. Il compte le temps processeur du passage
  (`durée des gates : …`) et rougit au-delà — `FAIL  plafond des gates franchi`. Il ne juge juste
  que poste calme : un rouge sous charge se rejoue au calme. La pass ne le juge pas.

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

## Sur la parade-box

**La voie de déploiement est une unité systemd sur l'hôte**, une instance par projet — pas un
conteneur : le runtime a besoin de l'hôte (la connexion Max du compte, `gh`, `git`) et d'un disque
local. Ce sont **ses lancements** qui sont cloisonnés (« La cloison »). Les fichiers d'unité sont
dans `runtime/deploy/` : `brigade@.service`, `brigade-sauvegarde@.service` et `.timer`,
`brigade-porte@.service` et le drop-in `cloison.conf`, `brigade-arbitre.service`.

### À vérifier avant d'installer

1. La box tourne sous Linux avec systemd : `systemctl --version`.
2. Node 26 y est installé, **et il démarre** : `node --version` répond `v26…`. S'il lui manque
   `libatomic.so.1` (Debian 12 nu) : `sudo apt install libatomic1`.
3. `claude` est le binaire officiel, connecté, sous le compte du service (voir le point 11).
4. `/var/lib` est sur un disque local : `df -T /var/lib` ne montre ni `nfs` ni `cifs`.
5. `gh` y est installé. **Sous l'identité unique**, il est connecté sous le compte du service :
   `sudo -u <compte> gh auth status`. **Sous une identité par rôle**, c'est l'inverse : aucun
   compte connecté, et les points 7 et 8 sont remplacés par « Ce que tu crées chez GitHub ».
6. Ce compte a une session Max : `sudo -u <compte> claude auth status` répond `"loggedIn": true`.
   Son environnement ne porte ni `ANTHROPIC_API_KEY` ni jeton `claude` — le runtime refuserait de
   démarrer.
7. Ce compte peut commiter (`git config --global user.name` et `user.email` posés) et, sous
   l'identité unique, pousser sans rien demander (`gh auth setup-git`, ou une clé SSH).
8. Sous l'identité unique, ce compte peut **merger une PR** du dépôt : la pass merge par lui.
9. **La branche d'intégration est protégée** — un geste d'administration du dépôt, à faire par le
   chef, une fois. PR obligatoire, zéro approbation requise, administrateurs inclus : plus personne
   ne pousse directement dessus ; les merges de PR passent.

   ```bash
   gh api -X PUT repos/<owner>/<repo>/branches/v2/protection --input - <<'JSON'
   {
     "required_status_checks": null,
     "enforce_admins": true,
     "required_pull_request_reviews": { "required_approving_review_count": 0 },
     "restrictions": null
   }
   JSON
   gh api repos/<owner>/<repo>/branches/v2/protection --jq '.required_pull_request_reviews, .enforce_admins.enabled'
   ```

   **C'est la seule protection que le runtime suppose.** « Branche à jour exigée » n'est pas
   requise ; activée, son refus repart au cook comme un finding (`pass.outdated`) et consomme un
   renvoi — tout autre refus est un arrêt (`merge-refused`). Elle ne réserve pas le merge à la
   pass : seule une identité par rôle le permet (« Ce que tu crées chez GitHub »).
10. **La push protection du secret-scanning est active sur le dépôt du projet** — ou tu sais
    qu'elle ne l'est pas. C'est la seconde barrière contre une livraison qui porterait des
    identifiants (la première est la station), côté serveur : elle vaut aussi pour un push qui ne
    passe pas par la station. Un geste d'administration, à faire par le chef.

    ```bash
    # L'état, tel que GitHub le dit :
    gh api repos/<owner>/<repo> --jq '.visibility, .security_and_analysis.secret_scanning.status, .security_and_analysis.secret_scanning_push_protection.status'
    # L'activer :
    gh api -X PATCH repos/<owner>/<repo> --input - <<'JSON'
    { "security_and_analysis": { "secret_scanning": { "status": "enabled" }, "secret_scanning_push_protection": { "status": "enabled" } } }
    JSON
    ```

    Relis l'état après l'avoir activée : **seul `enabled` deux fois vaut barrière**.

    | Ce que tu lis | Ce que cela veut dire |
    |---|---|
    | `enabled`, `enabled` | la barrière est posée — avec les limites ci-dessous |
    | `disabled` après l'avoir activée, ou un refus de l'API | le plan ne la donne pas à ce dépôt : gratuite sur un dépôt **public**, elle réclame sur un dépôt **privé** GitHub Secret Protection (plans Team et Enterprise, d'une organisation) |
    | `null` à la place des statuts | le compte qui interroge n'administre pas le dépôt : rejoue sous un compte administrateur |

    **Si elle n'est pas disponible**, il n'y a qu'une barrière, celle de la station, qui ne voit
    que ce qui passe par elle : ne la suppose pas. **Même active**, elle ne reconnaît que les
    formes de sa liste (des clés d'API Anthropic, **pas le jeton de connexion d'un abonnement
    Max**), ne voit pas une copie transformée, et quiconque écrit sur le dépôt peut la contourner
    depuis le site — un cook ne le peut pas, il n'a ni compte ni navigateur.
11. **`claude` est dans le `PATH` que systemd donnera à l'unité** — pas dans celui de ton shell.
    Une unité reçoit `/usr/local/sbin:/usr/local/bin:/usr/sbin:/usr/bin`, et l'installeur natif
    pose `claude` sous `~/.local/bin` du compte : sans réglage, **aucun cook ne part**.

    ```bash
    sudo -u <compte> -i sh -c 'command -v claude'      # où il est, sous le compte du service
    systemctl show brigade@<projet>.service -p Environment --value | tr ' ' '\n' | grep '^PATH='
    ```

    Il se règle dans le drop-in de l'unité (« Installer ») ; la commande `installation` le vérifie.
12. **Le répertoire temporaire de `claude` est au compte, ou n'existe pas** : `claude` refuse
    `/tmp/claude-<uid du compte>` s'il est à quelqu'un d'autre (`Refusing to use it`). La
    connexion Max échoue dessus et, sans la cloison, chaque cook aussi ; sous elle, l'unité a son
    propre `/tmp`, et seuls les `claude` lancés à la main s'y refusent encore.

    ```bash
    ls -ld /tmp/claude-"$(id -u <compte>)"                    # rien, ou un répertoire au compte
    sudo chown -R <compte> /tmp/claude-"$(id -u <compte>)"    # s'il n'est à personne d'autre
    export CLAUDE_CODE_TMPDIR=<un répertoire du compte>       # sinon — et dans le drop-in de l'unité
    ```

    La commande `installation` le nomme aussi : `MANQUE` sans cloison, `à savoir` sous elle.

### Installer

```bash
sudo git clone --branch v2 https://github.com/benomite/brigade.git /opt/brigade
sudo cp /opt/brigade/runtime/deploy/brigade@.service /etc/systemd/system/
sudo systemctl daemon-reload
```

L'unité suppose un compte `brigade`, le clone dans `/opt/brigade` et `node` dans le `PATH` de
systemd. Ce qui diffère sur la box se règle dans un drop-in (`sudo systemctl edit
brigade@.service`), jamais dans le fichier copié :

```ini
[Service]
User=<le compte qui a fait la connexion Max>
# Si node n'est pas dans /usr/bin ou /usr/local/bin :
ExecStart=
ExecStart=/chemin/absolu/vers/node src/main.ts
# Si `claude` est sous ~/.local/bin du compte (l'installeur natif) : son répertoire, devant le
# PATH de systemd. Sans cette ligne, aucun cook ne part.
Environment=PATH=/home/<compte>/.local/bin:/usr/local/sbin:/usr/local/bin:/usr/sbin:/usr/bin
# Si /tmp/claude-<uid du compte> existe et n'est pas au compte, et que tu ne peux pas le lui rendre :
Environment=CLAUDE_CODE_TMPDIR=<un répertoire du compte>
```

Ce qui est propre à chaque projet se pose dans un drop-in de **l'instance** (`sudo systemctl edit
brigade@<projet>.service`) :

```ini
[Service]
Environment=BRIGADE_GITHUB_REPO=<owner>/<repo>
Environment=BRIGADE_BASE_BRANCH=<branche d'intégration>
Environment=BRIGADE_MANAGER_MODEL=<opus|sonnet|haiku>
Environment=BRIGADE_MANAGER_EFFORT=<low|medium|high|xhigh|max>
Environment=BRIGADE_REVIEWER_MODEL=<opus|sonnet|haiku>
Environment=BRIGADE_REVIEWER_EFFORT=<low|medium|high|xhigh|max>
# Facultatif : l'issue de roadmap, que le manager ne juge jamais.
Environment=BRIGADE_ROADMAP_ISSUE=<numéro>
# Facultatif : jusqu'où le manager peut monter le calibrage d'un ticket qui échoue. Sans eux, il ne monte rien.
Environment=BRIGADE_CEILING_MODEL=<opus|sonnet|haiku>
Environment=BRIGADE_CEILING_EFFORT=<low|medium|high|xhigh|max>
# Facultatif : les chemins que presque tout ticket touche, et qui n'appartiennent à aucun.
Environment=BRIGADE_COMMON_PATHS=<chemin>,<chemin>
# Facultatif : les trois GitHub Apps du projet. Sans lui, tout part sous le compte GitHub de la machine.
Environment=BRIGADE_GITHUB_APPS_DIR=/etc/brigade/<projet>/apps
# Facultatif : les valeurs des secrets de dev du projet. Sans lui, le projet n'en a aucun.
Environment=BRIGADE_SECRETS_FILE=/etc/brigade/<projet>/secrets.env
```

Sans les six premières, le service refuse de démarrer (code 2) et `systemctl status` dit pourquoi.
Les fichiers de `/etc/brigade/<projet>/` — clés des Apps, `secrets.env` — sont au compte, en
`chmod 600` : le runtime refuse de démarrer sinon. Les gestes par projet, la commande qui vérifie
qu'il n'en manque aucun et la désinstallation sont dans [`installer.md`](installer.md).

Reste le **clone de la station**, à faire une fois sous le compte du service. Personne n'y
travaille : la station y accroche les worktrees des cooks, rangés dans
`/var/lib/brigade/<projet>/worktrees`.

```bash
sudo install -d -o <compte> /var/lib/brigade/<projet>
sudo -u <compte> git clone https://github.com/<owner>/<repo>.git /var/lib/brigade/<projet>/depot
```

### Installer la cloison

Facultative, et **par projet** : sans elle, le runtime dit que les projets se voient. À poser avant
qu'un second projet n'arrive avec ses secrets. Ce qu'elle fait est dans « La cloison ».

À vérifier d'abord, sous le compte du service :

1. `bwrap` est installé (`sudo apt install bubblewrap`) et **se lance sans privilège** :
   `sudo -u <compte> bwrap --ro-bind / / --dev /dev --proc /proc --unshare-pid true` ne dit rien.
   Un refus `setting up uid map: Permission denied` (AppArmor, Ubuntu récente) est un réglage de la
   machine : `kernel.apparmor_restrict_unprivileged_userns`, ou un profil pour `bwrap`.
2. `env --default-signal=TERM true` ne dit rien (coreutils 8.32 au moins) : c'est par lui qu'un
   cook cloisonné entend son signal d'arrêt.
3. `claude` n'est **pas** installé sous `~/.claude` (`readlink -f "$(command -v claude)"`), que
   la cloison remplace par celui du projet. Sous `~/.local`, un cook le lit sans pouvoir y écrire.
4. L'origine du clone est en `https` : `git -C /var/lib/brigade/<projet>/depot remote get-url origin`.
5. Les secrets et les clés du projet sont sous `/etc/brigade/<projet>/`, son état sous
   `/var/lib/brigade/<projet>/` — ce sont les deux répertoires masqués.
6. Le dépôt déclare ses registres de paquets dans `.claude/brigade/reseau`, mergé sur la branche
   d'intégration (« La liste blanche ») ; `npm run cloison` montre la liste lue.

```bash
sudo cp /opt/brigade/runtime/deploy/brigade-porte@.service /etc/systemd/system/
sudo install -d /etc/systemd/system/brigade@<projet>.service.d
sudo cp /opt/brigade/runtime/deploy/cloison.conf /etc/systemd/system/brigade@<projet>.service.d/
sudo systemctl daemon-reload
# Le port de la porte n'a pas de défaut : un par projet, le même des deux côtés.
sudo systemctl edit brigade-porte@<projet>.service   # [Service] Environment=BRIGADE_PROXY_PORT=<port>
sudo systemctl edit brigade@<projet>.service         # [Service] Environment=BRIGADE_PROXY_PORT=<port>
sudo systemctl enable --now brigade-porte@<projet>
sudo systemctl restart brigade@<projet>
```

Les unités ne partagent pas leurs drop-ins : le compte et le chemin de `node` réglés pour
`brigade@.service` se règlent aussi pour `brigade-porte@.service`. Si le compte n'est pas
`brigade`, corrige aussi ce que `cloison.conf` masque. Avant de lancer un cook :
`journalctl -u brigade@<projet>` montre les lignes `cloison —` et `réseau —`, la seconde disant
qu'**un envoi direct est refusé par le noyau** ; puis `cloison -- eprouver` (« L'éprouver, et ce
qu'elle coûte »), dont chaque sonde doit tenir.

### Installer l'arbitre

À poser **dès qu'un second projet tourne** sur la machine : sans lui, chaque projet se tient pour
seul, et leurs plafonds de cooks s'additionnent sur le compte (« L'arbitre entre projets »).

```bash
sudo cp /opt/brigade/runtime/deploy/brigade-arbitre.service /etc/systemd/system/
sudo systemctl daemon-reload
# Le port, et le plafond de cooks du compte, tous projets confondus : aucun défaut.
sudo systemctl edit brigade-arbitre.service
#   [Service]
#   Environment=BRIGADE_ARBITER_PORT=<port>
#   Environment=BRIGADE_ARBITER_MAX_COOKS=<N>
sudo systemctl enable --now brigade-arbitre.service
# Puis, pour CHAQUE projet, le même port — c'est par lui que son runtime joint l'arbitre :
sudo systemctl edit brigade@<projet>.service         # [Service] Environment=BRIGADE_ARBITER_PORT=<port>
sudo systemctl restart brigade@<projet>
```

`User=` et le chemin de `node` se règlent ici aussi. `journalctl -u brigade@<projet>` dit `arbitre
— 127.0.0.1:<port>, consulté avant chaque lancement`. Un projet dont le drop-in n'a pas le port
n'est pas arbitré : il lance comme s'il était seul. **Arrêter l'arbitre ne gèle personne** : chaque
projet passe en mode dégradé, un cook à la fois.

### Installer la sauvegarde

**À faire avant de compter sur le runtime** : tant que ce timer ne tourne pas, rien ne sauvegarde
le journal (« Sauvegarder et restaurer »).

```bash
sudo cp /opt/brigade/runtime/deploy/brigade-sauvegarde@.service /opt/brigade/runtime/deploy/brigade-sauvegarde@.timer /etc/systemd/system/
sudo systemctl daemon-reload
sudo install -d -o <compte> <destination>
sudo systemctl edit brigade-sauvegarde@<projet>.service         # [Service] Environment=BRIGADE_BACKUP_DIR=<destination>
sudo systemctl enable --now brigade-sauvegarde@<projet>.timer   # chaque nuit à 03:30
sudo systemctl start brigade-sauvegarde@<projet>.service        # une première, tout de suite
```

La destination est **propre au projet** et **hors de `/var/lib/brigade/<projet>`** — sur un autre
disque si la machine en a un. Sans ce drop-in, la sauvegarde refuse (code 2) et `systemctl status`
dit pourquoi. `User=` et `ExecStart=` réglés pour `brigade@.service` se règlent aussi pour elle
(`node src/sauvegarder.ts`) ; son environnement ne porte ni clé ni jeton. Manquée, elle est jouée
au démarrage suivant. Autre cadence : dans le drop-in du timer, `OnCalendar=` vide puis la tienne.

### Restaurer sur une machine neuve

1. Installer comme ci-dessus, **sans démarrer le service**, et rapatrier la destination de
   sauvegarde **entière** : la sauvegarde datée et `runs/`.
2. Créer le répertoire d'état (`sudo install -d -o <compte> /var/lib/brigade/<projet>`) et y
   restaurer la dernière sauvegarde : `sudo -u <compte> BRIGADE_STATE_DIR=/var/lib/brigade/<projet>
   npm --prefix /opt/brigade/runtime run restaurer -- <destination>/<horodatage>`.
3. Recloner le dépôt de la station (`/var/lib/brigade/<projet>/depot`, voir « Installer »).
4. `sudo systemctl start brigade@<projet>` : le journal montre un `runtime.interrupted` puis un
   `runtime.started`, et les tickets servis avant l'incident se relisent.
5. Remettre le timer de sauvegarde en route (`status` montre la précédente, ou `JAMAIS FAITE`), et
   finir à la main les tickets qui étaient en pass (« Ce qu'une restauration ne rend pas »).

### Piloter

`RUN` désigne `sudo -u <compte> BRIGADE_STATE_DIR=/var/lib/brigade/<projet> npm --prefix
/opt/brigade/runtime run`, et `ENV` la même avec `env $(systemctl show <unité> -p Environment
--value)` à la place de `BRIGADE_STATE_DIR=…` : la commande lit alors l'environnement du service.

| Geste | Commande |
|---|---|
| Lancer, arrêter, voir s'il tourne | `sudo systemctl start\|stop brigade@<projet>` ; `systemctl status brigade@<projet>` |
| Le relancer à chaque reboot | `sudo systemctl enable brigade@<projet>` |
| Lire ce que le process imprime | `journalctl -u brigade@<projet> -f` |
| Relire le journal ; lire le rail | `RUN journal` ; `RUN rail` |
| Voir l'état de la cuisine, suivre le journal en direct | `RUN status -- [--suivre [<ticket>]]` |
| Voir le relevé des mesures | `RUN mesures -- [--par <n>]` |
| Voir la station ; régler le plafond de cooks, à chaud | `RUN station` ; `RUN station -- cooks <N>` (`0` : aucune limite) |
| Voir les garde-fous, « stop », « reprendre » | `RUN garde-fous -- [stop \| reprendre]` |
| Voir la pass : phases, verdicts, renvois, bilan des arrêts faute de grant | `RUN pass -- [<ticket>]` |
| Voir la base d'intégration, faire rejouer ses gates quand elle est rouge | `RUN base -- [rejouer]` |
| Voir le grant `merge`, l'accorder, le prolonger, le révoquer | `RUN grant -- [activer merge [--jusqu-a <date ou heure> \| --pour <durée>] [--usages <n>] \| prolonger merge … \| revoquer merge]` — `--jusqu-a 18h` se lit à l'heure de la box |
| Voir le manager, l'allumer, l'éteindre, lui rendre une issue | `RUN manager -- [allumer \| eteindre \| rendre <n°>]` |
| Vérifier que le projet est prêt, créer ses labels, mesurer son setup, le désinstaller | `ENV installation -- [labels \| setup [<cooks>] \| desinstaller [--confirmer]]` (unité `brigade@<projet>.service`) — voir [`installer.md`](installer.md) |
| Voir la cloison : ce qui est masqué, ce que le réseau laisse passer ou a refusé | `RUN cloison` |
| Éprouver la cloison, mesurer ce qu'elle coûte par cook | `ENV HOME=~<compte> … cloison -- eprouver [<essais>]` (unité `brigade@<projet>.service`) |
| Lire ce que la porte refuse, en direct | `journalctl -u brigade-porte@<projet> -f` |
| Voir l'arbitre ; donner du poids à un projet, en retirer un | `ENV arbitre` (unité `brigade-arbitre.service`) ; `-- poids <projet> <n>`, `-- retirer <projet>` |
| Mettre à jour | `sudo git -C /opt/brigade pull`, puis `sudo systemctl restart brigade@<projet>` — et `brigade-porte@<projet>` si la porte a changé |
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
12. **L'échéance.** `M -- activer merge --usages 1` : `BIENTÔT ÉTEINT` ; une issue mergée plus
    tard, `ÉTEINT SEUL`, et la suivante s'arrête en disant que le grant s'est éteint, et quand.
    `--pour 5min` puis `prolonger merge --pour 10min` : les deux gestes se lisent ; `--pour 1min`
    est refusé. `--pour 2min`, `stop` trois minutes, `start` : un `grant.expired` daté de
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
    `BRIGADE_STATE_DIR=/tmp/brigade-essai … run restaurer -- B/<horodatage>` : `J` sur cet état
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
    `C -- eprouver 50` : six sondes, toutes « tient ».
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

