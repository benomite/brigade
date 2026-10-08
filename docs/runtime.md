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
[`superpowers/specs/2026-10-08-garde-fous.md`](superpowers/specs/2026-10-08-garde-fous.md),
la station dans
[`superpowers/specs/2026-10-08-station-claude.md`](superpowers/specs/2026-10-08-station-claude.md),
la pass et le grant `merge` dans
[`superpowers/specs/2026-10-08-pass-et-grant-merge.md`](superpowers/specs/2026-10-08-pass-et-grant-merge.md).

## Ce qu'il fait aujourd'hui

| Geste | Ce qui se passe |
|---|---|
| Démarrer | Prend le verrou du projet, recalcule ses projections depuis le journal — le rail compris —, y écrit `runtime.started`, puis les plafonds en vigueur (`guard.configured`) s'ils ont changé, annonce sa station (`station.announced`), demande à `claude` si la machine a une session, et sonde GitHub |
| Tourner | Surveille le journal chaque seconde (ce qu'un autre process y écrit) et se réveille au tick, toutes les 60 s. À chaque réveil les garde-fous guettent le « stop » du chef ; à chaque réveil aussi, la station prend un ticket si elle peut servir, et la pass juge ce qui a été livré ; à chaque tick le runtime écrit son battement (`runtime.ticked`), sonde GitHub, rend les tickets dont le bail est échu, regarde si le worktree du cook en cours a progressé (c'est ce qui renouvelle son bail), et relève ce que chaque cook en cours a consommé (`cook.progressed`) |
| S'arrêter (`SIGTERM`, `SIGINT`) | Tue les cooks en cours et les gates en train de se jouer, écrit `runtime.stopped`, rend le verrou, sort avec le code 0 |
| Mourir sans préavis (crash, `kill -9`, coupure) | Rien n'est perdu : le noyau libère le verrou, et le démarrage suivant écrit `runtime.interrupted` avant de repartir |
| Être lancé une seconde fois sur le même projet | Refuse, code de sortie 2, en nommant le runtime qui tourne (pid, machine, heure de démarrage) |

**Il lance des cooks**, un à la fois : sa station prend les tickets du rail et y fait travailler le
binaire `claude`, sous la connexion Max de la machine — **chaque cook consomme du quota Max**. Ses
autres sous-processus sont `gh` (lire les issues, ouvrir une PR, commenter, lire la CI, merger),
`git`, et **les gates du projet** (`.claude/brigade/gates.sh`), que sa pass joue sur chaque
livraison. **Sous grant `merge`, il merge lui-même** ce que sa pass juge vert. Il n'écoute sur aucun
port.

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
4  2026-10-08T10:00:03.000Z  brigade  #7  ticket.taken  station:box/claude  {"station":"box/claude","leaseUntil":"2026-10-08T10:30:03.000Z"}
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
| **en pass** | le cook a fini ; le ticket passe les gates et la CI — ou la pass s'y est arrêtée, verte, faute de grant |
| **servi** | mergé. La pass ferme son issue : il quitte le rail au sondage suivant |
| **86** | pas servable pour l'instant (quota épuisé, station absente, pass remontée au chef) |

**Ordre de service** : `prio:1`, puis `prio:2`, `prio:3`, puis les issues sans `prio:` ; à priorité
égale, l'issue la plus ancienne d'abord.

**Un ticket ne se prête qu'une fois.** Une station qui prend un ticket reçoit un **bail** de
30 minutes. Tant que le bail court, aucune autre station ne peut prendre ce ticket.

**Le bail ne se renouvelle que sur un progrès observable** dans le worktree du cook : un commit, un
fichier touché. Jamais sur la présence du cook, ni sur ce qu'il dit faire. La station regarde le
worktree au tick, au plus une fois par dixième de bail (toutes les 3 minutes pour 30), et renouvelle
(`ticket.renewed`) s'il a bougé depuis son dernier regard. Un worktree qu'elle n'arrive pas à lire
ne vaut ni progrès ni absence de progrès : elle le dit sur journald et relit au tick suivant ; le
bail ne tombe alors qu'après un sursis d'un dixième de bail passé l'échéance.

| Compte pour un progrès | Ne compte pas |
|---|---|
| Un commit de plus, un commit réécrit | Ce que le cook écrit sur son flux de sortie |
| Un fichier suivi modifié, réécrit ou supprimé | Tout ce que le `.gitignore` du projet écarte : dépendances, builds, caches, logs |
| Un fichier neuf, non suivi et non ignoré | Le contenu de `.git` |

La frontière est celle de git : compte ce qu'un `git status` montrerait. Un outil qui écrit un log
que le projet n'ignore pas renouvelle donc le bail — c'est au `.gitignore` de le dire.

**Le bail et l'inactivité ne mesurent pas la même chose**, et jouent tous les deux. L'inactivité
(10 minutes, voir « Les garde-fous ») écoute le flux de sortie : elle dit que le cook est vivant.
Le bail regarde le worktree, à une échelle plus longue : il dit que le cook progresse. Un cook qui
lit vingt minutes avant d'écrire garde son ticket ; un cook bavard qui n'écrit rien le perd au bout
de trente.

**Quand le bail tombe, la station arrête le cook et récolte** (`guard.tripped`, motif `lease`) : ce
qu'il a commité est poussé et part en pass, comme pour tout cook arrêté ; sans commit, le ticket
revient en attente et l'arrêt compte pour un échec au disjoncteur. Un travail écrit mais pas
commité reste sur la station, sur la branche du cook. Le rail, lui, ne rend jamais un ticket dont
le cook tourne encore : il ne rend de lui-même (`ticket.released`, motif `lease-expired`, avec le
nom de la station) qu'un ticket pris sans cook — une station morte entre le prêt et le lancement.

**Le rail retient la date du dernier progrès** de chaque ticket pris : l'heure de la prise, puis
celle de chaque renouvellement (`ticket.renewed` — le seul fait de progrès ; `cook.progressed`, le
relevé des tours et des tokens, n'en est pas un). `status` en tire « sans progrès depuis … », à côté
du temps depuis la prise : des deux durées, c'est la seule qui révèle un blocage. Elle est lue dans
le rail, jamais déduite d'un worktree ou d'un commit. C'est la date où le progrès a été **vu** : elle
retarde d'un regard au plus (trois minutes pour un bail de trente) sur le progrès lui-même.

**Le bail est le plafond du temps sans progrès** — un plafond à part des budgets (tours, durée,
tokens), qu'un cook parqué ne consomme pas. Le dépasser se lit à trois endroits : au journal
(`guard.tripped`, motif `lease`, distinct de l'inactivité `idle`), sur l'issue (la station y commente
la fin du cook sans qu'on le demande), et dans `status`, qui marque `COINCE` un ticket encore pris
dont le bail est échu — worktree illisible en sursis, runtime figé, ou station morte.

**Un 86 revient seul** quand son heure de retour est connue (un quota épuisé annonce la sienne) :
passé cette heure, le ticket est remis en attente. Sans heure de retour, il reste 86 jusqu'à ce
qu'on le rende.

**GitHub injoignable** (réseau, connexion `gh` expirée) : le rail reste tel quel, le runtime
l'imprime (`sondage GitHub en échec`, à lire dans journald) et réessaie au tick suivant. Le rail se
recalcule depuis le journal à chaque démarrage : il se retrouve à l'identique, même sans GitHub.

La station prend les tickets et les amène **en pass** ; la pass les juge, et les sert si le grant
`merge` est actif (voir « La pass »).

### Lire le rail

```bash
npm --prefix runtime run rail
```

Une ligne par ticket, dans l'ordre de service : numéro, état, priorité, détail de l'état, titre. La
commande lit `$BRIGADE_STATE_DIR`, n'écrit jamais, et répond pendant que le runtime tourne.

```
#14  pris  prio:1  par box/claude depuis 2026-10-08T10:00:05.000Z, dernier progrès 2026-10-08T10:12:05.000Z, bail jusqu'à 2026-10-08T10:42:05.000Z  Le rail porte les tickets
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
| Disjoncteur | Après N échecs d'affilée, plus aucun cook n'est lancé. Un échec : un arrêt par plafond, par inactivité ou par bail tombé faute de progrès, ou un cook qui sort en erreur — **sans avoir rien commité** (un travail commité est récolté, voir « La station »). Ne comptent pas : le « stop » du chef, le quota épuisé (86), une connexion Max expirée, un redémarrage du runtime. Une réussite remet le compteur à zéro |
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
| `cook.launched` | Un cook part sur le ticket, avec son **calibrage** (`model`, `effort`), sa station, sa branche, ses plafonds et le chemin de son flux brut (`runs/<run>.jsonl` dans le répertoire d'état ; sa sortie d'erreur dans `runs/<run>.jsonl.stderr`) |
| `cook.progressed` | Le relevé du cook, à chaque tick tant qu'il tourne : `turns` et `tokens` consommés jusque-là |
| `guard.tripped` | Un garde-fou l'arrête. `reason` : `turns`, `duration`, `tokens`, `idle`, `lease` (le bail du ticket est tombé, faute de progrès dans le worktree) ou `stop` ; `limit` et `observed` donnent le plafond et la mesure |
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

## La station

Une **station** vient prendre les tickets : le manager ne lance rien, c'est elle qui se sert. Il y
en a une, `box/claude` — cette machine, le binaire `claude` officiel, et la connexion Max du compte
qui fait tourner le service. Elle fait tourner **un cook à la fois**, quel que soit le nombre de
tickets en attente.

Pour chaque ticket : elle le prend, crée un **worktree** sur une branche neuve `cook/<run>` partie
de la branche d'intégration, le rend exécutable, y lance le cook sous garde-fous, puis **récolte**.
Le clone du dépôt n'est jamais modifié : la station n'y fait que rapatrier la base et accrocher des
worktrees.

### Le setup du worktree passe avant le cook

Un worktree neuf n'est pas exécutable : ni dépendances, ni base de test, ni ports. Si le projet a un
`.claude/brigade/worktree-setup.sh` sur la branche du cook, **la station le joue avant de lancer le
cook** — `worktree-setup.sh <n° du ticket> <worktree>`, le contrat de la V1 — et **ce qu'il exporte
entre dans l'environnement du cook**. C'est le même passage que celui de la pass avant les gates :
le cook travaille dans le worktree que la pass jugera. Le chemin du script est une convention, pas
un réglage : le runtime ne lit pas les bindings du projet.

| Cas | Ce que fait la station |
|---|---|
| Le projet n'a pas de setup | rien : le cook part comme avant |
| Le setup réussit | le cook part avec ses exports, et le bail du ticket repart de zéro |
| Le setup échoue, ou dépasse **la moitié du bail** du ticket | **aucun cook n'est lancé** : le ticket passe **86** dix minutes, motif `setup-failed`, puis revient en attente. Rien n'est consommé, et le disjoncteur ne compte rien — il ne compte que des cooks |
| Un ticket renvoyé par la pass | le setup est rejoué dans le worktree de la livraison : il doit être rejouable |

Un setup en échec laisse sa raison — son code de sortie, la fin de ce qu'il a écrit — dans
`journalctl -u brigade@<projet>`, pas sur l'issue : il est retenté toutes les dix minutes, et un
commentaire par essai noierait le ticket. Le worktree d'un setup en échec est retiré avec sa
branche, sauf celui d'un renvoi, qui porte une livraison.

Deux choses à savoir en écrivant le script. **Les variables `BRIGADE_*` du runtime ne lui
parviennent pas**, ni au cook ; celles qu'il exporte lui-même, si. Et **il ne laisse rien tourner** :
ce qu'il a lancé en arrière-plan est arrêté quand il rend la main — un service dont le cook a besoin
se démarre depuis le cook, ou depuis les gates.

### Calibrer un ticket

**Aucun cook ne part sans calibrage** : le modèle et l'effort se posent à la main sur l'issue, par
deux labels. Il n'y a pas de valeur par défaut.

| Label | Valeurs |
|---|---|
| `model:` | `opus`, `sonnet`, `haiku` |
| `effort:` | `low`, `medium`, `high`, `xhigh`, `max` |

Un ticket sans l'un des deux — ou qui en porte deux pour la même dimension, ou une valeur hors
liste — est **refusé** : il passe **86**, motif `no-calibration`, et un commentaire sur l'issue dit
ce qu'il manque. Une fois les labels posés, il revient en attente tout seul, au sondage suivant.

Le calibrage de chaque cook est au journal (`cook.launched`) et dans `npm run station` : le chef
lit ce qu'il paie.

### Ce qu'un cook charge

**Rien du compte qui fait tourner le service, et rien que le code ne nomme.** Un cook part avec le
binaire `claude`, ses outils intégrés, la connexion Max, et sa consigne. La liste de ce qu'il charge
en plus est écrite dans l'adaptateur (`SOURCES_DE_REGLAGES`, `runtime/src/claude.ts`) ; elle est
vide.

| Ce qui existe sur la machine | Un cook le charge ? | Coupé par |
|---|---|---|
| Réglages du compte (`~/.claude/settings.json`) : plugins activés, leurs skills, leurs hooks, leurs agents, leurs variables | non | `--setting-sources ""` |
| Réglages du dépôt servi (`.claude/settings.json`, `settings.local.json`) : hooks, plugins activés, variables | non | `--setting-sources ""` |
| Skills — celles du compte et celles livrées avec le binaire | non | `--disable-slash-commands` |
| Serveurs MCP — ceux du dépôt, du compte, et les connecteurs claude.ai attachés à la connexion Max | non | `--strict-mcp-config` |
| Mémoire automatique du compte (`~/.claude/projects/…/memory`) | non | `CLAUDE_CODE_DISABLE_AUTO_MEMORY=1` dans l'environnement du cook |
| `CLAUDE.md` du dépôt servi | **pas d'office** — la consigne envoie le cook le lire | part avec la source `project` |
| Connexion Max | oui | — elle ne tient pas aux réglages |

Trois conséquences à connaître :

- **Les hooks du dépôt servi ne tournent pas sous un cook.** Sur `brigade`, cela vaut pour le hook de
  gates à l'arrêt : il est écrit pour une session que quelqu'un tient, et sous `claude -p` il
  devient un hook synchrone. C'est la consigne qui demande au cook de vérifier son travail, et la
  pass qui juge.
- **Garder les réglages du dépôt n'aurait pas suffi à couper le compte** : un dépôt qui active un
  plugin dans ses réglages fait charger celui qui est installé sous le compte — skills et agents
  compris. Mesuré le 2026-10-08, `claude` 2.1.285.
- **Les conventions du dépôt passent par un tour de lecture**, plus par le prompt système : un
  `CLAUDE.md` qui en importe d'autres (`@fichier`) n'est suivi que si le cook va les lire.

Ce qui reste hors de portée de ces options : les outils intégrés au binaire, ses agents intégrés
(`Explore`, `Plan`…), et le transcript de session que `claude` écrit sous `~/.claude/projects`.
`--safe-mode` coupe en bloc sans rien nommer, et son flux annonce encore les plugins du compte ;
`--bare` coupe la connexion Max. Aucun des deux n'est utilisé.

### Le cook ne livre pas, la station récolte

Le cook commite dans son worktree et dit ce qu'il a fait. Il n'a ni à pousser, ni à ouvrir une PR,
ni à commenter : `git push`, `git merge` et `gh pr merge` lui sont interdits au lancement. C'est un
garde-fou de bonne foi, pas une clôture — le cook tourne sans demande de permission
(`bypassPermissions`), et la clôture est la protection de branche du dépôt.

Quand le process du cook s'arrête, la station regarde son worktree :

| Fin | Reconnue à | Ce que fait la station | Disjoncteur |
|---|---|---|---|
| **fini** | des commits sur la branche — que le cook ait conclu, soit sorti en erreur, ou ait été arrêté par un garde-fou ou par le bail de son ticket | pousse la branche, ouvre la PR vers la branche d'intégration, met le ticket **en pass**, commente l'issue | réussite |
| **échoué** | aucun commit, ou un push impossible | rend le ticket au rail, commente l'issue avec le motif | échec |
| **86** | le flux du cook dit que le quota est épuisé | met le ticket **86** jusqu'à l'heure de retour du quota, et ne prend plus aucun ticket d'ici là | ne compte pas |
| connexion expirée | le flux dit que la machine n'a plus de session | rend le ticket, commente l'issue, et ne prend plus rien avant « reprendre » | ne compte pas |
| « stop » du chef | — | rien n'est récolté : le ticket revient en attente | ne compte pas |

Un ticket qui échoue est repris aussitôt par un cook neuf, dans un worktree neuf : c'est le
disjoncteur qui borne la série.

**Un ticket que la pass a renvoyé** se reprend autrement : son cook repart dans le worktree de la
livraison refusée, sur sa branche, avec une consigne qui porte les findings ; il livre sur la même
PR. Seul un commit de plus s'y récolte — un cook de renvoi qui échoue sans rien commiter a échoué.
La branche d'un cook est poussée en force : elle n'appartient qu'à la station, et un renvoi peut
l'avoir rebasée.

Le **commentaire** posé sur l'issue porte la fin du cook, son calibrage, ses tours, ses tokens, sa
durée, sa branche, sa PR, puis son dernier message tel quel. Le même compte-rendu est au journal
(`cook.reported`), et le flux brut complet dans `runs/<run>.jsonl`.

**Un runtime qui meurt entre l'envoi en pass et le compte-rendu** — le temps d'ouvrir la PR — laisse
un ticket en pass que la pass ne connaît pas. Au démarrage, la station le reprend : elle retrouve la
PR de sa branche sur GitHub, ne l'ouvre que s'il n'y en a aucune, relit le dernier message du cook
dans son flux brut, et écrit le compte-rendu (`cook.reported`, avec `reconciled: true`). La pass juge
alors comme pour toute livraison. Le commentaire posé sur l'issue dit « livraison reprise après un
redémarrage » ; il ne porte ni tours ni tokens, et la raison d'une récolte (`harvested:…`) n'y est
pas — `cook.exited` et `guard.tripped` les gardent au journal. Aucun cook n'est relancé.

Le worktree d'un cook **reste** après lui, dans `worktrees/<run>` du répertoire d'état : le ménage
est à faire à la main (`git -C <clone> worktree remove <chemin>`).

### 86 : le quota est épuisé

C'est un état normal, pas une erreur. Le ticket passe 86 avec l'heure à laquelle le quota revient ;
le rail le remet en attente à cette heure-là, et la station se remet à servir. Si `claude` ne dit
pas quand le quota revient, la station réessaie une heure plus tard.

### Connexion Max expirée

La station le voit à deux moments : au démarrage, en demandant à `claude` s'il a une session
(`claude auth status`, sans appel au modèle), et dans le flux d'un cook qui n'a pas pu parler au
modèle. Elle l'écrit au journal (`station.disconnected`), l'imprime dans journald, commente le
ticket qui l'a subie, et **ne prend plus aucun ticket**.

Pour repartir : `claude /login` sous le compte du service, puis `garde-fous -- reprendre`.

Le runtime ne lit jamais les identifiants de `claude`, et refuse de démarrer si son environnement
porte `ANTHROPIC_API_KEY`, `ANTHROPIC_AUTH_TOKEN` ou `CLAUDE_CODE_OAUTH_TOKEN` : les cooks ne
passent que par la connexion Max faite dans le binaire.

### Voir la station

```bash
npm --prefix runtime run station
```

```
station               box/claude — moteur claude, fournit : code
cooks simultanés      1 au plus
connexion Max         tenue pour bonne
quota                 86 — épuisé, retour à 2026-10-08T15:30:00.000Z ; plus aucun ticket n'est pris d'ici là
cook en cours         aucun
derniers cooks
  2026-10-08T10:12:40.000Z  #15  15-3f9a01bc  sonnet / medium  86 (quota épuisé)  9 tours · 41 200 tokens · 3,1 min
  2026-10-08T10:04:11.000Z  #14  14-a41c88e2  opus / high  fini  12 tours · 34 567 tokens · 4,2 min  https://github.com/benomite/brigade/pull/40
```

La commande lit `$BRIGADE_STATE_DIR`, n'écrit jamais, et répond pendant que le runtime tourne.

| Événement | Sens |
|---|---|
| `station.announced` | La station se présente : son moteur, ce qu'elle fournit, son plafond de cooks (hors ticket) |
| `ticket.86` motif `no-calibration` | Le ticket est refusé faute de calibrage |
| `ticket.86` motif `setup-failed` | Le setup du worktree a échoué : aucun cook lancé, le ticket revient en attente à `until` |
| `cook.reported` | Le compte-rendu d'un cook. `ending` : `done`, `failed`, `86` ou `disconnected` ; `reason` dit pourquoi (`no-commit`, `guard:idle`, `guard:lease`, `harvested:code de sortie 1`…) ; `summary` est son dernier message, `pr` l'adresse de sa PR ; `reconciled: true` quand il est écrit au démarrage, pour une livraison que la vie précédente avait envoyée en pass sans la raconter |
| `station.86` | Le quota est épuisé jusqu'à `until` (hors ticket) |
| `station.disconnected` | La connexion Max a expiré |

## La pass

Quand un cook a livré, **la pass juge sa livraison sans personne** — plus le manager, et aucun
modèle : elle ne consomme aucun quota. Elle a deux juges, ceux du projet :

1. **Les gates** : `.claude/brigade/gates.sh <worktree>`, jouées dans le worktree du cook. C'est le
   contrat de la V1 — **le code de sortie est le verdict**. Si le projet a un
   `.claude/brigade/worktree-setup.sh`, il passe d'abord — comme avant un cook —, et ce qu'il exporte
   vaut pour les gates. Plafond, setup compris : 30 minutes ; au-delà elles sont arrêtées, et c'est
   rouge.
2. **La CI** du commit jugé (*check runs* et statuts), lue seulement si les gates sont vertes.

| La CI dit | Ce qu'en fait la pass |
|---|---|
| un job en échec | **rouge**, avec le nom du job, sa conclusion, son adresse |
| des jobs en cours | pas de verdict : elle est relue à chaque tick. Trente minutes sans conclusion : remontée au chef (`ci-silent`) |
| tout est vert | vert |
| **aucun check** | ni vert ni rouge : le verdict repose sur les seules gates, et il le dit (`ci: none`). Sauf si la branche porte des workflows (`.github/workflows`) : leurs checks sont alors attendus |

Le verdict est au journal (`pass.judged`) **avec ce qui l'a produit** : l'issue et le code des
gates, leurs lignes `FAIL`, la fin de leur sortie, chaque job de CI. Ce qui est jugé est un commit
précis, et c'est ce commit-là qui sera mergé.

**Vert veut dire « les gates et la CI n'ont rien trouvé », pas « quelqu'un a relu ».** Il n'y a ni
reviewer ni revue humaine au jalon 1.

### Ce que la pass décide

| Verdict | Grant `merge` | Ce qui se passe |
|---|---|---|
| vert | **actif** | le runtime **merge lui-même** la PR sur la branche d'intégration, le ticket est **servi**, son issue fermée. Tu n'as rien à faire |
| vert | absent ou révoqué | la PR reste ouverte et **la pass s'arrête là** — elle le dit sur l'issue (`pass.held`, motif `no-grant`) |
| vert, mais la livraison touche `.claude/brigade/` ou `.github/workflows/` | peu importe | **jamais mergée par la pass** (`judge-modified`) : un cook qui modifie ses propres juges peut se rendre vert seul. À relire et merger à la main |
| rouge | — | les **findings repartent à un cook**, dans le même worktree (voir « La station »). Rien n'est mergé |
| rouge une troisième fois | — | deux renvois sont consommés : la pass **cesse de renvoyer et te remonte le ticket** (`pass.escalated`). Il passe **86** |

Seul un verdict rouge consomme un renvoi. Un cook de renvoi qui échoue sans rien livrer n'en
consomme pas : c'est le disjoncteur qui borne.

**La pass te remonte aussi, sans renvoi**, ce qu'un cook ne peut pas corriger : une PR qui ne vise
pas la branche d'intégration (`wrong-base` — une PR vers `main` est donc refusée tant que la base
est `v2`), un projet sans `gates.sh` (`no-gates` : sans gates, « vert » voudrait dire que personne
n'a regardé), une CI muette (`ci-silent`). Le ticket passe 86, motif `pass:<raison>`.

**Sortir un ticket que la pass a arrêté ou remonté** : merge sa PR à la main. La pass relit GitHub
à chaque tick ; elle le voit, sert le ticket et ferme l'issue. Ou retire `fire` : il quitte le rail.
Une PR fermée sans merge laisse le ticket en pass.

Chaque décision est commentée sur l'issue. Un conflit avec la base est un finding : rouge, renvoyé.

### Le grant `merge`

Le merge automatique n'existe que **sous grant**. Le grant est un objet du runtime — des faits au
journal — pas un réglage : tu l'actives et le révoques **sans redémarrer**, et la pass le relit **à
chaque décision de merge**.

```bash
npm --prefix runtime run grant                     # son état, et ses dix derniers usages
npm --prefix runtime run grant -- activer merge
npm --prefix runtime run grant -- revoquer merge
```

```
grant merge           ACTIF depuis le 2026-10-08T14:02:11.000Z (par chef) — une pass verte est mergée sans toi
derniers usages
  2026-10-08T14:31:07.000Z  #17  merge sur v2  https://github.com/benomite/brigade/pull/52  3f9a01b  verdict n° 412  mergée
```

- **Absent par défaut.** Un runtime neuf ne merge rien.
- **Pas rétroactif.** La décision se prend une fois, au verdict. Activer le grant vaut pour les
  livraisons suivantes ; celles que la pass a déjà arrêtées, tu les merges à la main.
- **Chaque usage est journalisé** (`grant.used`) : quel ticket, quelle PR, quel commit, quel verdict
  l'a autorisé, quand. C'est la réponse à « pourquoi ce code est-il sur `v2` ? » — `grant` liste les
  usages, `pass -- <ticket>` montre le verdict cité.
- **Le merge est écrit en deux temps** : l'intention (`grant.used`) avant l'appel à GitHub, le
  résultat après (`merge.done` ou `merge.failed`). Un runtime qui meurt entre les deux relit la PR
  au redémarrage : mergée, il l'écrit et sert le ticket ; non mergée, il reprend la décision — grant
  relu. GitHub n'accepte le merge que si la branche est encore sur le commit jugé. Un merge que
  GitHub **refuse** n'est pas retenté : la pass s'arrête et dit pourquoi.

⚠️ **Grant actif, du code écrit par un cook atterrit sur la branche d'intégration avec, pour seuls
juges, les gates et la CI du projet.** Ce qui casse `v2` bloque la construction de la V2.

### Voir la pass

```bash
npm --prefix runtime run pass              # les livraisons : phase, renvois consommés, PR
npm --prefix runtime run pass -- 17        # l'histoire du ticket 17 : chaque verdict et ce qui l'a produit
```

```
#17  rouge, renvoyée au cook  renvois 1/2  depuis 2026-10-08T14:12:40.000Z  https://github.com/benomite/brigade/pull/52
#18  ARRÊTÉE — verte, non mergée (no-grant)  renvois 0/2  depuis 2026-10-08T14:20:03.000Z  https://github.com/benomite/brigade/pull/53
```

```
#17  mergée  renvois 1/2  depuis 2026-10-08T14:31:07.000Z  https://github.com/benomite/brigade/pull/52
  2026-10-08T14:10:02.000Z  jugement de https://github.com/benomite/brigade/pull/52 sur 8c1d2e0 (run 17-a41c88e2)
  2026-10-08T14:12:40.000Z  verdict n° 398 : ROUGE — gates rouges (code 1) · CI non lue
      FAIL  tests du runtime en échec — rejoue : npm --prefix runtime test
  2026-10-08T14:12:40.000Z  renvoi 1/2 : les findings repartent à un cook
  2026-10-08T14:31:05.000Z  verdict n° 412 : VERT — gates vertes (code 0) · CI aucun check
  2026-10-08T14:31:05.000Z  grant merge utilisé : merge de https://github.com/benomite/brigade/pull/52 sur v2, autorisé par le verdict n° 412
  2026-10-08T14:31:07.000Z  mergée par la pass
```

Les deux commandes lisent `$BRIGADE_STATE_DIR`, n'écrivent jamais, et répondent pendant que le
runtime tourne.

| Événement | Sens |
|---|---|
| `grant.activated`, `grant.revoked` | Les commandes du chef (hors ticket) |
| `pass.started` | La pass prend une livraison : son run, sa PR, le commit jugé |
| `pass.judged` | Le verdict (`green`, `red`), avec `gates`, `ci`, `findings`, et `judgeModified` |
| `grant.used` | L'intention de merger : l'usage du grant, avec le numéro du verdict qui l'autorise |
| `merge.done` | Mergée. `by` : `pass`, ou `outside` (à la main). `reconciled` : constaté après un redémarrage |
| `merge.failed` | Le merge n'a pas abouti : `interrupted`, ou le refus de GitHub |
| `pass.held` | Verte, non mergée : `no-grant`, `judge-modified`, `merge-refused: …` |
| `pass.returned` | Rouge : renvoi `n` sur 2, avec les findings |
| `pass.escalated` | Remontée au chef : `returns-exhausted`, `wrong-base`, `no-gates`, `ci-silent` |

### Ce que la pass ne garantit pas

- **« Seule la pass merge » n'est pas clos au jalon 1.** Sur la box, le cook et la pass passent par
  le même `gh` : la même identité GitHub. Aucune protection de branche ne peut donc réserver le
  merge à la pass. Ce qui retient un cook de merger est la liste d'outils qui lui sont interdits au
  lancement — de bonne foi. La clôture viendra avec la GitHub App et ses tokens par rôle (jalon 7).
  Ce qu'une protection de branche **peut** garantir dès maintenant : plus aucun push direct sur la
  branche d'intégration (voir « À vérifier avant d'installer »).
- **Les gates jouées sont celles de la branche du cook**, avec les droits du runtime — comme le
  cook lui-même. D'où la règle `judge-modified`.
- **Les gates jugent la branche du cook, pas le résultat du merge.** Un conflit est vu ; une
  régression née de la rencontre de deux merges propres ne l'est pas. Exiger une branche à jour est
  un réglage de la protection de branche.
- **Rien n'est nettoyé** : ni les worktrees, ni les branches mergées.

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
  #14  pris  prio:1  par box/claude depuis 4 min, sans progrès depuis 4 min, bail encore 26 min  Le rail porte les tickets
  #15  en pass  prio:1  depuis 40 s, cuisiné par box/claude  La station claude
  #18  en attente  prio:2  depuis 2 h 10  La CLI d'état

cooks      1 en cours
  #14  14-3f9a01bc  4 min sur 1 h 00 · 12 tours sur 100 · 184 000 tokens sur 2 000 000 (relevé il y a 20 s)

derniers événements
  41  2026-10-08T10:04:10.000Z  brigade  #14  ticket.taken  station:box/claude  {"station":"box/claude","leaseUntil":"2026-10-08T10:34:10.000Z"}
  42  2026-10-08T10:04:11.000Z  brigade  #14  cook.launched  runtime  {"run":"14-3f9a01bc",…}
```

| Bloc | Ce qu'il dit |
|---|---|
| `runtime` | En marche, arrêté, ou jamais démarré — **d'après le journal**. Un runtime tué sans préavis y paraît encore en marche : c'est l'**âge du dernier tick** qui le trahit. Au-delà de quelques cadences, le runtime est figé ou mort : `systemctl status brigade@<projet>` |
| `cuisine` | Le « stop » du chef et le disjoncteur, comme `run garde-fous` |
| `rail` | Le décompte par état, puis chaque ticket dans l'ordre de service. Les durées sont comptées jusqu'à l'heure de la commande ; les horodatages exacts sont dans `run rail`. Un ticket pris porte deux durées : depuis la prise, et **sans progrès** — le temps écoulé depuis que sa station a vu son worktree bouger. `COINCE` : son bail est échu et il est encore pris |
| `cooks` | Chaque cook en cours, avec son ticket et ce qu'il a consommé face à ses plafonds. La durée est exacte ; tours et tokens sont ceux du dernier relevé, vieux d'une minute au plus — son âge est affiché. Runtime arrêté, un cook encore listé est mort avec lui : le journal le notera au prochain démarrage |
| `derniers événements` | Les quinze derniers, au format de `run journal`, sans les battements ni les relevés que les blocs du dessus résument déjà |

Avec `--suivre`, la commande reste ouverte et ajoute une ligne par événement, à mesure qu'il
s'écrit — un ticket se suit ainsi du rail au verdict. Les relevés des cooks défilent, les
battements non. Ctrl-C pour arrêter.

La commande lit `$BRIGADE_STATE_DIR`, n'écrit jamais, et répond tout de suite pendant que le
runtime et ses cooks tournent. Tout ce qu'elle montre vient du journal : rien n'est calculé ni
gardé ailleurs. Sur un journal écrit par un runtime plus ancien, elle demande de redémarrer le
runtime, qui recalcule ce qui manque.

## Cinq variables, aucun défaut

| Variable | Rôle |
|---|---|
| `BRIGADE_STATE_DIR` | Le répertoire qui contient tout l'état du projet : `log.db`, `lock.db`, et `runs/` pour le flux brut des cooks. Doit être sur un **disque local** — le verrou en dépend |
| `BRIGADE_PROJECT` | Le nom du projet : un identifiant court choisi par le chef, en minuscules, chiffres et tirets (`brigade`, `thermigo`). Il s'écrit dans chaque événement et dans le nom de l'unité systemd |

| `BRIGADE_GITHUB_REPO` | Le dépôt GitHub dont le projet sert les issues, sous la forme `<owner>/<repo>` (`benomite/brigade`) |
| `BRIGADE_REPO_DIR` | Un clone du dépôt du projet, **réservé à la station** : elle y accroche le worktree de chaque cook. Personne d'autre n'y travaille |
| `BRIGADE_BASE_BRANCH` | La branche d'intégration du projet : d'où part chaque worktree, où vise chaque PR (`v2` pour le pilote) |

L'une des cinq absente, le runtime refuse de démarrer et dit laquelle.

Cinq réglages ont un défaut :

| Variable | Rôle | Défaut |
|---|---|---|
| `BRIGADE_LEASE_SECONDS` | La durée du bail : le temps qu'un cook garde son ticket sans progrès observable dans son worktree. À tenir au-dessus du délai d'inactivité | `1800` (30 minutes) |
| `BRIGADE_GH_BIN` | Le binaire `gh`. Sert aux tests, qui y mettent un faux ; **jamais posé sur la box** | `gh` |
| `BRIGADE_CLAUDE_BIN` | Le binaire `claude`. Sert aux tests, qui y mettent un faux ; **jamais posé sur la box** | `claude` |
| `BRIGADE_GATES_TIMEOUT_SECONDS` | Le plafond de durée des gates jouées par la pass : au-delà, elles sont arrêtées et rouges | `1800` (30 minutes) |
| `BRIGADE_CI_WAIT_SECONDS` | L'attente tolérée d'une CI qui ne conclut pas, avant que la pass ne remonte au chef | `1800` (30 minutes) |

## Sur le poste de dev

```bash
eval "$(.claude/brigade/worktree-setup.sh <n> "$PWD")"   # pose BRIGADE_STATE_DIR
BRIGADE_PROJECT=brigade BRIGADE_GITHUB_REPO=benomite/brigade \
  BRIGADE_REPO_DIR=<un clone réservé à cet essai> BRIGADE_BASE_BRANCH=v2 \
  npm --prefix runtime start   # Ctrl-C pour l'arrêter
```

**Lancé ainsi, c'est une vraie cuisine.** Le runtime lit les vraies issues du dépôt avec ton `gh`,
et sa station prend celles qui portent `fire` : un ticket calibré lance un vrai cook, sur ton quota
Max, sans demande de permission, puis pousse sa branche, ouvre une PR et commente l'issue — et si
le grant `merge` est actif dans ce répertoire d'état, la pass **merge** ce qu'elle juge vert. Pour
regarder le rail sans rien lancer, arrête d'abord la cuisine : `npm --prefix runtime run garde-fous
-- stop` — elle le reste d'un démarrage à l'autre.

| Besoin | Commande |
|---|---|
| Tests | `npm --prefix runtime test` — sur un clone nu, sans rien installer |
| Contrôle de types | `npm --prefix runtime run typecheck` — après le setup de worktree |

Les tests n'utilisent jamais `BRIGADE_STATE_DIR` : chacun crée son répertoire temporaire, et les
process qu'ils lancent ne reçoivent que l'environnement qu'ils leur donnent. Ils ne touchent jamais
le réseau ni le quota : `gh` et `claude` y sont des faux, et `git` n'y parle qu'à des dépôts locaux.

## Sur la parade-box

Le fichier d'unité est versionné : `runtime/deploy/brigade@.service`, une instance par projet.

### À vérifier avant d'installer

Ces neuf points n'ont pas pu être contrôlés depuis une session de dev.

1. La box tourne sous Linux avec systemd : `systemctl --version`.
2. Node 26 y est installé : `node --version`.
3. `claude` est le binaire officiel, connecté, sous le compte qui fera tourner le service.
4. `/var/lib` est sur un disque local : `df -T /var/lib` ne montre ni `nfs` ni `cifs`.
5. `gh` y est installé et connecté sous le compte qui fera tourner le service :
   `sudo -u <compte> gh auth status`. Le runtime ne lit aucun jeton, c'est `gh` qui s'authentifie.
6. Ce compte a une session Max : `sudo -u <compte> claude auth status` répond `"loggedIn": true`.
   Et son environnement ne porte ni `ANTHROPIC_API_KEY` ni jeton `claude` — le runtime refuserait
   de démarrer.
7. Ce compte peut commiter et pousser : `git config --global user.name` et `user.email` sont
   posés, et `git push` vers le dépôt du projet passe sans rien demander
   (`gh auth setup-git`, ou une clé SSH).
8. Ce compte peut **merger une PR** du dépôt (droit d'écriture) : c'est par lui que la pass merge
   sous grant.
9. **La branche d'intégration est protégée** — un geste d'administration du dépôt, à faire par le
   chef, une fois. Le 2026-10-08, ni `v2` ni `main` ne l'étaient. PR obligatoire, zéro approbation
   requise, administrateurs inclus : plus personne ne pousse directement sur `v2`, ni un cook, ni
   une erreur de manipulation ; les merges de PR — ceux de la pass, les tiens — passent.

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

   Avant de la poser, vérifie que rien dans la construction de la V2 ne pousse directement sur
   `v2`. Et retiens ce qu'elle ne fait pas : elle ne réserve pas le merge à la pass (voir « Ce que
   la pass ne garantit pas »).

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

Le dépôt GitHub et sa branche d'intégration, eux, sont propres à chaque projet : ils se posent dans
un drop-in de **l'instance**.

```bash
sudo systemctl edit brigade@<projet>.service
```

```ini
[Service]
Environment=BRIGADE_GITHUB_REPO=<owner>/<repo>
Environment=BRIGADE_BASE_BRANCH=<branche d'intégration>
```

Sans eux, le service refuse de démarrer (code 2) et `systemctl status` dit pourquoi.

Reste le **clone de la station**, que l'unité attend dans `/var/lib/brigade/<projet>/depot`. À
faire une fois, sous le compte du service :

```bash
sudo install -d -o <compte> /var/lib/brigade/<projet>
sudo -u <compte> git clone https://github.com/<owner>/<repo>.git /var/lib/brigade/<projet>/depot
```

Personne ne travaille dans ce clone : la station y accroche les worktrees des cooks, rangés dans
`/var/lib/brigade/<projet>/worktrees`.

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
| Voir la station : connexion, quota, cooks et leur calibrage | `sudo -u <compte> BRIGADE_STATE_DIR=/var/lib/brigade/<projet> npm --prefix /opt/brigade/runtime run station` |
| Voir les garde-fous, « stop », « reprendre » | `sudo -u <compte> BRIGADE_STATE_DIR=/var/lib/brigade/<projet> npm --prefix /opt/brigade/runtime run garde-fous -- [stop \| reprendre]` |
| Voir la pass : phases, verdicts, renvois | `sudo -u <compte> BRIGADE_STATE_DIR=/var/lib/brigade/<projet> npm --prefix /opt/brigade/runtime run pass -- [<ticket>]` |
| Voir le grant `merge`, l'activer, le révoquer | `sudo -u <compte> BRIGADE_STATE_DIR=/var/lib/brigade/<projet> npm --prefix /opt/brigade/runtime run grant -- [activer merge \| revoquer merge]` |
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
   `sudo -u <compte> BRIGADE_STATE_DIR=/var/lib/brigade/brigade BRIGADE_PROJECT=brigade BRIGADE_GITHUB_REPO=benomite/brigade BRIGADE_REPO_DIR=/var/lib/brigade/brigade/depot BRIGADE_BASE_BRANCH=v2 npm --prefix /opt/brigade/runtime start`.
   Il refuse et nomme le pid du service ; `J` ne montre aucun événement de plus.
5. Arrêter la cuisine (`garde-fous -- stop`) : aucun cook ne partira pendant ces trois étapes.
   Poser le label `fire` sur une issue ouverte du dépôt. Dans la minute, `R` la montre **en
   attente**, avec sa priorité ; `J <numéro>` montre son `ticket.arrived`.
6. `sudo systemctl restart brigade@brigade` : `R` montre le même rail qu'avant.
7. Retirer le label `fire` de l'issue (ou la fermer). Dans la minute, `R` ne la montre plus ;
   `J <numéro>` montre un `ticket.left` avec son motif (`unfired` ou `closed`).

**Garde-fous.** `G` désigne la commande « Voir les garde-fous » ci-dessus. La cuisine est encore
arrêtée par l'étape 5 : l'étape 10 la rouvre.

8. `G` montre les plafonds par défaut, la cuisine arrêtée, le disjoncteur fermé. `J` montre un
   `guard.configured`.
9. `J` montre le `kitchen.stopped` de l'étape 5, écrit par `chef`.
   `sudo systemctl restart brigade@brigade` : `G` montre la cuisine toujours arrêtée.
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

**Le premier cook.** `P` désigne la commande « Voir la station » ci-dessus. Ces étapes consomment
du quota Max : une issue courte suffit, calibrée `model:haiku` et `effort:low`.

Avant de commencer, `P` montre `box/claude`, un cook au plus, la connexion tenue pour bonne, le
quota disponible.

a. Poser `fire` sur une issue **sans** label `model:` ni `effort:`. Dans les deux minutes, `R` la
   montre **86** (`no-calibration`), un commentaire sur l'issue dit quels labels poser, et `J
   <numéro>` ne montre aucun `cook.launched`.
b. Poser `model:haiku` et `effort:low`. Dans les deux minutes le ticket repasse en attente puis
   **pris** ; `P` montre le cook en cours avec son calibrage, `J <numéro>` son `cook.launched`.
c. Le cook fini : une branche `cook/<run>` est sur le dépôt, une PR vise `v2`, l'issue porte le
   compte-rendu du cook, `R` montre le ticket **en pass**, `P` le cook fini avec ses tours et ses
   tokens. Dans `/var/lib/brigade/brigade/depot`, `git status` est propre et la branche n'a pas
   changé. La première ligne de `runs/<run>.jsonl` (`"subtype":"init"`) porte `"skills":[]`,
   `"mcp_servers":[]`, et aucun plugin du compte dans `plugins` ; le premier appel d'outil du cook
   est `gh issue view`.
d. Pendant un autre cook, `G -- stop` : il s'arrête dans la seconde, `R` montre son ticket en
   attente, et rien n'est poussé. `G -- reprendre` : un cook neuf repart.
e. Pendant un cook, `sudo systemctl restart brigade@brigade` : `J <numéro>` montre un
   `cook.interrupted`, puis un second `cook.launched`.

**La pass et le grant.** `V` désigne la commande « Voir la pass », `M` la commande « Voir le grant
`merge` ». Ces étapes consomment du quota Max (un cook par ticket, plus un par renvoi).

Avant de commencer, `M` montre le grant **absent**.

f. Reprendre le ticket de l'étape c, en pass. Dans la minute qui suit sa livraison, `V` le montre
   **arrêté — vert, non mergé (`no-grant`)**, l'issue porte le commentaire de la pass, et la PR est
   toujours ouverte. `V <numéro>` montre le verdict : gates vertes, « CI aucun check » (ce dépôt
   n'a pas de CI).
g. `M -- activer merge`, sans redémarrer. `M` montre le grant actif. Attendre deux minutes : la PR
   de l'étape f **n'est pas mergée** — le grant n'est pas rétroactif. La merger à la main : dans la
   minute, `R` ne montre plus le ticket, l'issue est fermée, `J <numéro>` montre un `merge.done`
   dont `by` vaut `outside`.
h. Poser `fire` sur une autre issue courte, calibrée. Le cook fini, sans rien faire : sa PR est
   mergée sur `v2`, l'issue fermée, `M` liste l'usage du grant (ticket, PR, commit, verdict), et
   `V <numéro>` montre le verdict cité.
i. `M -- revoquer merge`, puis une troisième issue : le cook fini, `V` montre le ticket arrêté
   (`no-grant`) et sa PR ouverte.
j. **Rouge.** Poser `fire` sur une issue qui demande de casser un test (« fais échouer un test du
   runtime, sans le corriger »). Le cook fini : `V` montre « rouge, renvoyée au cook, renvois
   1/2 », l'issue porte les findings, et un second cook part **dans le même worktree** (`P` montre
   la même branche). Après le troisième verdict rouge : `V` montre « REMONTÉE AU CHEF
   (returns-exhausted), renvois 2/2 », `R` le ticket **86**, et rien n'est mergé. Retirer `fire`.
k. Pendant qu'un ticket vert attend sous grant actif, `sudo systemctl kill -s KILL
   brigade@brigade` : au redémarrage, `J <numéro>` montre soit un `merge.done` (`reconciled` s'il a
   été constaté après coup), soit un `merge.failed` motif `interrupted` suivi d'un second
   `grant.used` — jamais deux merges.

**Ce qui ne se provoque pas à la demande.**

- **Le quota épuisé.** La forme du flux d'un vrai 86 n'a jamais été observée : la reconnaître
  repose sur une transposition (`runtime/test/aides/flux/LISEZMOI.md`). Au premier 86 réel, `P`
  doit montrer « 86 » avec une heure de retour, et `R` le ticket 86. Si à la place un cook est noté
  « échoué » alors que le quota était épuisé, garder son `runs/<run>.jsonl` : c'est le flux qui
  manque aux tests.
- **La connexion expirée.** Même réserve : c'est le flux d'une machine **sans** session qui a été
  enregistré. Pour l'éprouver, `sudo -u <compte> claude auth logout`, puis `restart` : `P` montre la
  connexion expirée et plus aucun ticket n'est pris. `claude /login`, puis `G -- reprendre`.
