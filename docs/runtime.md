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
la fiche du ticket dans
[`superpowers/specs/2026-10-08-fiche-du-ticket.md`](superpowers/specs/2026-10-08-fiche-du-ticket.md),
la pass et le grant `merge` dans
[`superpowers/specs/2026-10-08-pass-et-grant-merge.md`](superpowers/specs/2026-10-08-pass-et-grant-merge.md),
le manager dans
[`superpowers/specs/2026-10-08-manager-qualifie-et-calibre.md`](superpowers/specs/2026-10-08-manager-qualifie-et-calibre.md),
le retour d'une issue écartée au manager dans
[`superpowers/specs/2026-10-09-rendre-la-main-au-manager.md`](superpowers/specs/2026-10-09-rendre-la-main-au-manager.md),
le découpage d'une épique dans
[`superpowers/specs/2026-10-08-decoupage-epique.md`](superpowers/specs/2026-10-08-decoupage-epique.md),
la sauvegarde dans
[`superpowers/specs/2026-10-08-sauvegarde-etat-runtime.md`](superpowers/specs/2026-10-08-sauvegarde-etat-runtime.md).

## Ce qu'il fait aujourd'hui

| Geste | Ce qui se passe |
|---|---|
| Démarrer | Prend le verrou du projet, recalcule ses projections depuis le journal — le rail compris —, y écrit `runtime.started`, puis les plafonds en vigueur (`guard.configured`) s'ils ont changé, annonce sa station (`station.announced`), demande à `claude` si la machine a une session, et sonde GitHub |
| Tourner | Surveille le journal chaque seconde (ce qu'un autre process y écrit) et se réveille au tick, toutes les 60 s. À chaque réveil les garde-fous guettent le « stop » du chef ; à chaque réveil aussi, la station prend autant de tickets que son plafond, son entrée et la machine le permettent, la pass juge ce qui a été livré, et le manager, s'il est allumé, réagit aux tickets que la pass lui a passés, qualifie les issues ouvertes qui ont changé, découpe les épiques et tient à jour la liste de leurs tickets ; à chaque tick le runtime écrit son battement (`runtime.ticked`), sonde GitHub, rend les tickets dont le bail est échu, regarde si le worktree de chaque cook en cours a progressé (c'est ce qui renouvelle son bail), et relève ce que chaque cook en cours a consommé (`cook.progressed`) |
| S'arrêter (`SIGTERM`, `SIGINT`) | Tue les cooks en cours et les gates en train de se jouer, écrit `runtime.stopped`, rend le verrou, sort avec le code 0 |
| Mourir sans préavis (crash, `kill -9`, coupure) | Rien n'est perdu : le noyau libère le verrou, et le démarrage suivant écrit `runtime.interrupted` avant de repartir |
| Être lancé une seconde fois sur le même projet | Refuse, code de sortie 2, en nommant le runtime qui tourne (pid, machine, heure de démarrage) |

**Il lance des cooks**, plusieurs à la fois : sa station prend les tickets du rail et y fait travailler le
binaire `claude`, sous la connexion Max de la machine — **chaque cook consomme du quota Max**. Son
**manager**, une fois allumé par le chef, appelle le même binaire pour **juger** une issue,
**découper** une épique, ou **choisir** que faire d'un ticket resté rouge — un appel court, sans outil, qui consomme lui aussi du quota. Sa **pass**
l'appelle une troisième fois, pour **relire** : un reviewer par livraison, en lecture seule —
encore du quota. Ses
autres sous-processus sont `gh` (lire les issues et leurs commentaires, poser des labels — et remplacer un label de calibrage que le manager a posé lui-même —, créer les tickets d'une épique et réécrire la liste qu'elle en porte, ouvrir une PR, commenter, lire la CI, merger),
`git`, et **les gates du projet** (`.claude/brigade/gates.sh`), que sa pass joue sur chaque
livraison — et rejoue, quand la base a avancé sous elle, sur le résultat du merge ou sur la base
elle-même. **Sous grant `merge`, il merge lui-même** ce que sa pass juge vert. Il n'écoute sur aucun
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
| **en attente** | sur le rail, à prendre — ou retenu par un ticket qu'il attend : le rail dit lequel |
| **BLOQUÉ** | en attente d'un ticket qui a été **abandonné** : il ne partira pas sans un geste de ta part |
| **pris** | prêté à une station, sous bail — le rail dit laquelle et depuis quand |
| **en pass** | le cook a fini ; le ticket passe les gates et la CI — ou la pass s'y est arrêtée, verte, faute de grant |
| **servi** | mergé. La pass ferme son issue : il quitte le rail au sondage suivant |
| **86** | pas servable pour l'instant (quota épuisé, station absente, pass remontée au chef) |

**Ordre de service** : `prio:1`, puis `prio:2`, `prio:3`, puis les issues sans `prio:` ; à priorité
égale, l'issue la plus ancienne d'abord.

**Un ticket peut en attendre un autre.** La ligne `attend` de sa fiche (voir « La fiche d'un
ticket ») dit lesquels ; tu la poses ou la corriges à la main, le manager aussi. Le rail ne prête
jamais un ticket avant que **tous** ceux qu'il attend soient **servis**, même s'il passe devant eux
dans l'ordre de service. Ce qui le retient se lit sur sa ligne, dans `run rail` comme dans
`run status` :

| Ce que dit la ligne | Sens | Ce qui le fait partir |
|---|---|---|
| `en attente … attend #12, #13` | #12 et #13 ne sont pas encore servis | rien à faire : le dernier servi, il part **tout seul**, à la prise suivante |
| `BLOQUÉ … #12 abandonné (…)` | #12 a quitté le rail **sans avoir été servi** : il ne le sera pas | un geste de toi (plus bas) |

- **Servi veut dire que sa livraison est mergée**, pas « issue fermée » : la PR ouverte par la
  station, mergée par la pass (`ticket.served`) ou **par toi** — y compris sur un ticket que la pass
  t'avait remonté en 86 (`merge.done` au journal). Une issue fermée à la main, ou livrée par une PR
  que le runtime n'a pas ouverte, n'a pas été servie : pour le rail, c'est un abandon. Une fois
  servi, un ticket le reste — le rouvrir ne refait attendre personne, et il ne ferme aucun cycle.
- **Abandonné** : le ticket attendu a quitté le rail sans être servi — issue fermée
  (`issue fermée sans avoir été servie`), label retiré (``label `fire` retiré``) ou issue supprimée
  (`issue disparue`). Vaut aussi pour une issue fermée qui n'est **jamais entrée** sur le rail.
- **Un ticket attendu qui n'est pas sur le rail** — ouvert, sans `fire` — se laisse attendre :
  `attend #12` reste affiché tant que tu ne le lances pas.
- **Quand un ticket devient bloqué, tu es averti** : un commentaire du runtime sur son issue
  (« Rail — ticket bloqué »), un fait `ticket.blocked` au journal, et `BLOQUÉ` sur le rail, compté à
  part dans `run status`. Une fois par abandon. **Pour le débloquer** : remettre le ticket attendu
  sur le rail (issue ouverte, label `fire`) — l'autre l'attend alors de nouveau —, ou retirer son
  numéro de la ligne `attend`.
- **Un cycle est refusé au moment où il se crée** — #14 attend #15, qui attend #14 : dès le sondage
  qui lit la fiche fermant la boucle, la fiche de **chacun** de ses tickets devient illisible, avec
  le cycle nommé en entier (`#14 → #15 → #14`). Ils sont refusés comme toute fiche illisible — 86,
  un commentaire sur l'issue — et reviennent seuls une fois une des attentes retirée. Le cycle ne se
  cherche qu'entre tickets du rail : une boucle qui passe par une issue sans `fire` se verra quand
  elle y entrera.
- **Une dépendance ne reprend pas un ticket déjà parti** : posée sur un ticket pris ou en pass, elle
  ne jouera que s'il revient en attente.
- Rien de tout cela n'est gardé en mémoire : après un redémarrage, le rail recalculé du journal
  attend et bloque les mêmes tickets.

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

Une ligne par ticket, dans l'ordre de service : numéro, état, priorité, détail de l'état, titre.
Un ticket en attente qui ne part pas dit pourquoi, en tête de son détail : `attend #12, #13` — ceux
qui ne sont pas encore servis, pas toute sa fiche —, `zone tenue par #14 (runtime/src/rail.ts)` —
un ticket parti et pas encore servi possède un chemin de sa zone (voir « Les zones de fichiers ») —
ou, `BLOQUÉ`, le ticket abandonné et son motif. Si le projet a des **chemins communs**, la première
ligne les nomme. Sous un ticket qui porte une **fiche** (voir « La fiche d'un ticket »), une ligne en retrait dit ce
qu'il attend et sa zone, puis une ligne par chose que le runtime n'y comprend pas ; un ticket sans
fiche n'a pas de ligne en retrait. La commande lit `$BRIGADE_STATE_DIR`, n'écrit jamais, et répond
pendant que le runtime tourne.

```
chemins communs, à personne : docs/runtime.md
#14  pris  prio:1  par box/claude depuis 2026-10-08T10:00:05.000Z, dernier progrès 2026-10-08T10:12:05.000Z, bail jusqu'à 2026-10-08T10:42:05.000Z  Le rail porte les tickets
     fiche — attend : #12, #13 · zone : runtime/src/rail.ts, runtime/test/rail.test.ts
#18  en attente  -  depuis 2026-10-08T10:00:04.000Z  La CLI d'état
#20  en attente  -  attend #18 — depuis 2026-10-08T10:00:04.000Z  Le suivi en direct
     fiche — attend : #14, #18 · zone : aucune
#22  en attente  -  zone tenue par #14 (runtime/src/rail.ts) — depuis 2026-10-08T10:00:04.000Z  Le tri du rail
     fiche — attend : rien · zone : runtime/src/rail.ts
#21  BLOQUÉ  -  #17 abandonné (issue fermée sans avoir été servie) — depuis 2026-10-08T10:00:04.000Z  L'export du journal
     fiche — attend : #17 · zone : aucune
#19  86  -  depuis 2026-10-08T10:03:10.000Z (unreadable-card), sans heure de retour  Le budget d'un ticket
     fiche — attend : #18 · zone : aucune
     FICHE ILLISIBLE — clé inconnue « budget » — connues : attend, zone
```

Les faits du rail au journal : `ticket.arrived`, `ticket.changed`, `ticket.left` (écrits au nom de
`github`), `ticket.taken`, `ticket.renewed`, `ticket.released`, `ticket.passing`, `ticket.served`,
`ticket.86`, `ticket.blocked` (le chef a été averti d'un blocage — il ne change pas l'état du
ticket), et `rail.commons` (les chemins communs du projet, écrit au démarrage quand ils changent).
Un `ticket.left` s'écrit aussi d'une issue qui n'est jamais entrée sur le rail, quand un
ticket l'attend et qu'elle est fermée : c'est ce qui rend l'abandon lisible du journal seul.

## Les garde-fous

Aucun cook ne se lance sans eux. Ce sont des mécanismes, pas des jugements : ils existent avant
la première exécution sans personne devant.

| Garde-fou | Ce qui se passe |
|---|---|
| Plafond de tours, de durée, de tokens | Le cook qui en dépasse un est arrêté. Les tokens comptent l'entrée, la sortie et l'écriture de cache — pas les lectures de cache |
| Inactivité | Le cook qui n'a rien produit depuis le délai d'inactivité est arrêté |
| Disjoncteur | Après N échecs d'affilée, plus aucun cook n'est lancé. Un échec : un arrêt par plafond, par inactivité ou par bail tombé faute de progrès, ou un cook qui sort en erreur — **sans avoir rien commité** (un travail commité est récolté, voir « La station ») ; ou **une relance décidée par le manager dont la livraison est jugée rouge** (`relaunch.judged`). Ne comptent pas : le « stop » du chef, le quota épuisé (86), une connexion Max expirée, **un refus du modèle** (voir « Quand le modèle refuse »), un redémarrage du runtime. Une réussite remet le compteur à zéro — sauf la livraison d'une relance du manager, qui ne vaut réussite que jugée verte |
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
| `cook.exited` | Le process est mort. `outcome` : `ok`, `failed`, `guard`, `stop`, `neutral` ou `refused` (le modèle a refusé de répondre) ; avec le code de sortie, les tours et les tokens consommés |
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
qui fait tourner le service. Elle fait tourner **plusieurs cooks à la fois**, chacun sur son
ticket, dans son worktree, sur sa branche (voir « Plusieurs cooks à la fois »).

Pour chaque ticket : elle le prend, crée un **worktree** sur une branche neuve `cook/<run>` partie
de la branche d'intégration, le rend exécutable, y lance le cook sous garde-fous, puis **récolte**.
Le clone du dépôt n'est jamais modifié : la station n'y fait que rapatrier la base et accrocher des
worktrees.

### Plusieurs cooks à la fois

La station prend des tickets tant que **trois bornes** le permettent. Elles sont relues à chaque
prise — au réveil du runtime, quand un cook part, quand un cook finit :

| Borne | Ce qu'elle retient | Réglage |
|---|---|---|
| **Le plafond de cooks** | le nombre de tickets que la station tient en même temps | toi, à chaud : `run station -- cooks <N>` — **30** tant que tu n'as rien réglé, `0` pour aucune limite |
| **L'entrée** | le nombre de tickets dont le worktree se prépare et le setup se joue | `BRIGADE_MAX_SETUPS`, **4** par défaut |
| **La machine** | plus aucune prise quand le processeur, la mémoire ou le disque n'en peuvent plus | trois seuils, dans l'environnement du service |

**Le plafond se règle pendant que la cuisine tourne.**

```bash
npm --prefix runtime run station -- cooks 12     # douze cooks au plus
npm --prefix runtime run station -- cooks 0      # plus de limite : c'est la machine qui borne
```

La commande écrit un fait au journal (`station.capped`) ; le runtime le lit dans la seconde, et il
tient après un redémarrage. **Baisser le plafond n'arrête aucun cook** : la station cesse d'en
lancer jusqu'à être revenue dessous. Un ticket que tu rends ou retires pendant que son cook tourne
ne fait pas une place : il compte jusqu'à ce que ce cook soit arrêté. Le plafond ne compte que
**les cooks de tickets** : un
jugement du manager ou une relecture du reviewer en cours ne retient pas la prise. À un plafond de
N, il peut donc tourner N cooks, plus un jugement, plus les relectures en cours.

**L'entrée borne ce que coûte un ticket qui part.** Chaque ticket fait un `git worktree add`, puis
le setup du projet — un `npm ci`, le plus souvent. Trente tickets servables d'un coup ne font pas
trente installations de front : quatre entrent, les suivants sont pris à mesure que les premiers
ont leur cook. Un ticket qui attend son tour reste en attente sur le rail, et son bail ne court
pas. Mesuré sur ce dépôt le 2026-10-09 : son setup prend une demi-seconde (quatre paquets de dev) —
c'est sur un projet à grosses dépendances que ce chiffre se règle, pas ici. Les préparations de
worktree, elles, passent **une par une** : la station n'a qu'un clone, et deux `git fetch` de la
même branche s'y disputeraient le même verrou.

**La machine est le vrai plafond.** Avant chaque prise, la station lit trois choses, et se retient
si l'une manque :

| Ressource | Elle se retient quand | Variable | Défaut |
|---|---|---|---|
| processeur | la charge moyenne sur une minute dépasse ce seuil, par cœur | `BRIGADE_MAX_LOAD_PER_CORE` | `1.5` |
| mémoire | il reste moins que ce nombre de Mo de mémoire **disponible** | `BRIGADE_MIN_FREE_MEMORY_MB` | `1024` |
| disque | il reste moins que ce nombre de Mo libres sur le disque de `BRIGADE_STATE_DIR`, où vivent les worktrees | `BRIGADE_MIN_FREE_DISK_MB` | `5120` |

Elle le **dit** : un fait au journal quand la machine sature (`station.saturated`, avec la
ressource, ce qui est observé et le seuil), un autre quand elle respire (`station.relieved`), une
ligne dans `journalctl`, et `MACHINE SATURÉE` dans `run status` comme dans `run station`. **Les
cooks en cours continuent** : la garde retient la prise suivante, elle n'arrête personne. Une
saturation ne se lève qu'avec dix pour cent de marge, pour qu'une charge qui oscille autour du seuil
ne fasse pas clignoter la station. `0` pour la mémoire ou le disque : cette ressource ne retient
jamais. La mémoire lue est celle que le système peut rendre à la demande (`MemAvailable` sous
Linux, ou ce que laisse le cgroup du service), pas la mémoire inoccupée — sur macOS celle-ci tombe à
quelques centaines de Mo sur une machine qui respire. La machine est lue à chaque réveil, même quand
une autre borne retient déjà la station : ce que `status` en dit ne dépend pas du plafond. Une
machine illisible ne dit rien, et la station s'en tient à ce qu'elle savait — elle sert si elle
servait, se retient si elle se retenait — en le signalant une fois dans `journalctl`.

**Un rail plein ne part pas d'un bloc.** La charge est une moyenne sur une minute : trente cooks
lancés en quelques secondes n'y paraîtraient qu'une fois tous partis, quand il n'y a plus rien à
retenir. La station compte donc **d'avance** ceux qu'elle vient de lancer : pendant sa première
minute, chaque cook — et chaque ticket en entrée — pèse une unité de charge et 512 Mo de mémoire,
ajoutés à ce que la machine montre. Sur une machine calme de huit cœurs (douze de charge au plus),
une douzaine de cooks partent, puis les suivants par paliers, une minute après, selon ce que la
machine montre alors. Cette retenue-là n'est pas une saturation et ne s'écrit nulle part : les
tickets attendent sur le rail. L'estimation est grossière, et ne sert qu'à cela — c'est la mesure
qui borne ensuite.

Ces seuils sont un point de départ, à régler par la mesure. **Les gates que la pass joue chargent la
machine elles aussi** : sur un projet dont les gates lancent des centaines de sous-processus, la
charge passe le seuil le temps qu'elles durent, et la station attend — c'est le comportement voulu,
et c'est le premier chiffre à relever si les cooks partent trop lentement.

**Deux tickets dont les zones se recouvrent ne partent jamais ensemble.** Chaque prise est une
transaction : la zone du ticket pris est tenue avant que le suivant soit choisi, et le rail montre
le second retenu (`zone tenue par #N`). Voir « Les zones de fichiers ».

**Un cook qui tombe n'emporte pas les autres.** Chacun a son process, ses plafonds, sa minuterie
d'inactivité et son propre regard sur son worktree : un cook qui meurt, dépasse un plafond ou perd
son bail rend **son** ticket, qui repart ; les autres continuent. Un ticket rendu au rail pendant
que son cook tourne n'est repris qu'une fois ce cook arrêté : deux cooks ne tiennent jamais le même
ticket. D'ici là — le tick suivant, une minute au plus, puis le temps qu'il meure — **sa zone reste
tenue**, même s'il a quitté le rail : aucun ticket qui la recouvre ne part pendant que ce cook
écrit encore. Le « stop » du chef, lui, les arrête tous — c'est sa raison d'être.

Ce que ce parallélisme ne fait pas encore :

- **Rien n'est nettoyé** : chaque cook laisse un worktree et une branche. À trente cooks, le disque
  se remplit vite — la garde du disque retient alors la station, mais ne libère rien (#139).
- **Deux livraisons vertes séparément peuvent casser l'intégration ensemble** (#99).
- **Le disjoncteur compte toujours des échecs d'affilée** : il a été pensé pour un cook à la fois,
  et `status` liste les cooks sans tri (#100).
- **Aucune jauge de quota** : le plafond ne sait rien de ce que le compte supporte (#63). Les
  conditions d'usage Max supposent un usage « ordinaire et individuel » ; un parallélisme élevé et
  continu s'en éloigne, et rien ne préviendra — pas de `86` pour l'annoncer. Monter **par paliers**,
  en lisant ce que les cooks consomment, plutôt que partir au plafond.

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
commentaire par essai noierait le ticket. Un worktree neuf où aucun cook n'est entré — setup en
échec, ou ticket parti de la station pendant le setup — est retiré avec sa branche ; celui d'un
renvoi reste, il porte une livraison.

Deux choses à savoir en écrivant le script. **Les variables `BRIGADE_*` du runtime ne lui
parviennent pas**, ni au cook ; celles qu'il exporte lui-même, si — sauf une clé ou un jeton
(`ANTHROPIC_API_KEY`, `ANTHROPIC_AUTH_TOKEN`, `CLAUDE_CODE_OAUTH_TOKEN`), que la station retire :
un cook ne parle au modèle que par la connexion Max. Et **il ne laisse rien tourner** :
ce qu'il a lancé en arrière-plan est arrêté quand il rend la main — un service dont le cook a besoin
se démarre depuis le cook, ou depuis les gates.

### Calibrer un ticket

**Aucun cook ne part sans calibrage** : le modèle et l'effort se posent sur l'issue, par deux
labels — par le manager quand il est allumé (voir « Le manager »), à la main sinon. Il n'y a pas de
valeur par défaut.

| Label | Valeurs |
|---|---|
| `model:` | `opus`, `sonnet`, `haiku` |
| `effort:` | `low`, `medium`, `high`, `xhigh`, `max` |

Un ticket sans l'un des deux — ou qui en porte deux pour la même dimension, ou une valeur hors
liste — est **refusé** : il passe **86**, motif `no-calibration`, et un commentaire sur l'issue dit
ce qu'il manque. Une fois les labels posés, il revient en attente tout seul, au sondage suivant.

Le calibrage de chaque cook est au journal (`cook.launched`) et dans `npm run station` : le chef
lit ce qu'il paie.

### La fiche d'un ticket

Ce qu'un ticket porte en plus de ses labels — **les tickets qu'il attend** et **la zone de fichiers
qu'il possède** — vit dans **un commentaire de son issue**, la fiche, repéré par un marqueur :

```
<!-- brigade:fiche -->
**Fiche du ticket** — lue par le runtime, corrigeable à la main.
- attend : #68, #69
- zone : runtime/src/rail.ts, runtime/test/rail.test.ts
```

| Clé | Valeur | Vide |
|---|---|---|
| `attend` | des numéros de ticket, `#68`, séparés par des virgules ou des espaces | le ticket n'attend personne |
| `zone` | des chemins relatifs à la racine du dépôt — fichiers ou dossiers —, séparés par des virgules | le ticket ne possède rien |

Une issue **sans fiche** est un ticket qui n'attend personne et ne possède rien : la fiche n'est pas
obligatoire. Une valeur vide, `rien` ou `aucun` dit la même chose pour une seule clé.

**Elle se corrige à la main**, dans l'interface de GitHub, en éditant le commentaire. Ce que la
lecture tolère : la casse des clés, le gras et le code en ligne, `:` avec ou sans espace, la puce
(`-`, `*`, `+`) ou son absence, l'ordre des lignes, et de la prose autour — une ligne qui n'est pas
une puce et n'a pas la forme `mot : valeur` est ignorée. Le marqueur est un commentaire HTML : il ne
se voit qu'en éditant, et **il ne compte qu'en tête de ligne, hors d'un bloc de code** — citer le
format dans une discussion ne pose pas de fiche.

**Le runtime dit ce qu'il ne comprend pas**, il ne le lit jamais comme un champ vide :

| Ce que porte l'issue | Ce que le runtime en fait |
|---|---|
| Une clé qu'il ne connaît pas (`budget : 40`) | fiche illisible — « clé inconnue » |
| Une valeur qui n'est pas un `#N`, ou pas un chemin du dépôt (absolu, `~`, `..`) | fiche illisible — la valeur est citée |
| Un **motif** dans la zone (`*`, `?` : `runtime/**/*.ts`) | fiche illisible — « est un motif, pas un chemin » : deux motifs ne se comparent pas. Un dossier possède déjà tout ce qu'il contient |
| Une puce qui n'est pas `clé : valeur` ; une clé posée deux fois | fiche illisible |
| Deux fiches (deux commentaires marqués, ou deux marqueurs dans un seul) | fiche illisible, **aucune n'est lue** : il ne choisit pas |
| Un `#N` qui ne désigne aucune issue du dépôt, ou le ticket lui-même | fiche illisible. Une issue hors du rail se laisse attendre ; une issue fermée sans avoir été servie **bloque** le ticket (voir « Le rail ») |
| Un `#N` qui désigne une PR | fiche illisible — « est une PR, pas un ticket » |
| Des `attend` qui forment un cycle entre tickets du rail | fiche illisible **pour chaque ticket du cycle**, qui est nommé en entier |
| Une fiche posée par quelqu'un qui n'a pas la main sur le dépôt (ni propriétaire, ni membre, ni collaborateur) | **ignorée**, et dit sur journald (`fiche ignorée sur le ticket #N`) : n'importe qui peut commenter une issue publique |
| Une fiche éditée par un tiers | lue comme elle est : GitHub ne laisse éditer un commentaire qu'à son auteur et à ceux qui ont la main sur le dépôt |

Un ticket dont la fiche est illisible est **refusé** au moment où la station le prend, comme un
ticket non calibré : il passe **86**, motif `unreadable-card`, et un commentaire sur l'issue liste
ce qu'il faut corriger. Une fois la fiche lisible — ou supprimée —, il revient en attente tout seul,
au sondage suivant (`ticket.released`, motif `card-readable`). Le commentaire n'est posté qu'au
refus : après une correction partielle, ce qu'il reste à corriger se lit dans `npm run rail`.

**Lue quand l'issue change, pas à chaque sondage.** Poser, éditer ou supprimer un commentaire fait
bouger la date de modification de l'issue et l'empreinte de la liste (mesuré contre GitHub le
2026-10-08) : le sondage conditionnel le voit, et seuls les commentaires des issues modifiées sont
relus — une requête par issue modifiée, aucune tant que rien ne bouge. Au démarrage, les
commentaires de chaque ticket du rail sont lus une fois. La fiche lue entre au journal
(`ticket.arrived`, `ticket.changed`, champ `card`) et sur le rail ; si GitHub ne rend pas les
commentaires, le sondage entier échoue et se rejoue au tick suivant — un ticket n'arrive jamais sans
sa fiche.

**Trois cas changent sans que l'issue bouge**, et sont donc relus à chaque sondage tant qu'ils
durent : un `#N` attendu qui n'existe pas encore, une fiche ignorée dont l'auteur n'a pas encore
la main sur le dépôt, et un `#N` attendu **ouvert qui n'est jamais entré sur le rail** — le fermer
serait un abandon, que rien d'autre ne signalerait. Créer l'issue #N, inviter l'auteur ou fermer
#N ne modifie pas l'issue qui porte la fiche : pendant ce temps le sondage reste **inconditionnel**
(la liste entière, les commentaires de ce ticket et l'état de ses `#N`, une fois par minute), et le
ticket se répare — ou se bloque — au sondage qui suit. Ça s'arrête dès que le `#N` entre sur le
rail ou est fermé. L'avertissement « fiche ignorée » n'est imprimé qu'à la première lecture.

**Le runtime lit la fiche, l'affiche, refuse l'illisible, et fait respecter `attend`** (voir « Le
rail ») **comme `zone`** (voir « Les zones de fichiers », juste après). Le manager écrit celle des
tickets qu'il découpe ; ailleurs, tu la poses à la main.

**Pourquoi un commentaire.** Trois emplacements étaient possibles. Des **labels** : visibles et
filtrables, mais ils ne portent ni liste ni valeur chiffrée, et leur nombre explose. Un **bloc dans
le corps** de l'issue : il porte tout, mais le corps est réécrit par des humains et par le second —
il casse au premier reformatage. La **base du runtime** seule : robuste, mais l'information quitte
GitHub, qui doit rester la vérité. Un commentaire dédié tient les quatre exigences : visible sur
l'issue, éditable sans outil, **hors du corps donc indifférent à sa réécriture**, et capable de
porter des listes et des nombres. Les dépendances natives de GitHub (« blocked by ») ont été
écartées : elles n'auraient porté que `attend`, et la zone aurait exigé un second emplacement.
Les labels gardent ce qu'ils portent déjà (`fire`, `prio:`, `model:`, `effort:`).

**Ce que la fiche laisse au jalon 4.** Les capacités requises, le domaine de spécialité et le
budget n'y sont pas tranchés. Ils s'y ajouteront comme **des lignes de plus** — `requiert :`,
`domaine :`, `budget :` — sans migration : les fiches déjà posées restent lisibles telles quelles,
et les faits déjà au journal aussi (un champ neuf y sera optionnel à la relecture, comme la fiche
entière l'est aujourd'hui pour un fait écrit avant elle).
D'ici là ces clés sont **inconnues, donc dites** : une fiche qui les porte est refusée, pas lue à
moitié. C'est voulu — un runtime qui ignorerait un budget qu'on lui a écrit lancerait un cook sans
plafond.

### Les zones de fichiers

**Un fichier, un propriétaire** : deux tickets qui peuvent partir en même temps ne possèdent pas le
même fichier. C'est la règle de partition de la V1, et c'est du code qui la tient, pas un LLM.

**La notation.** La `zone` d'une fiche est une liste de chemins. Un chemin possède **le fichier
qu'il nomme et tout ce qui est dessous** : `runtime/src` possède `runtime/src/rail.ts`. Deux zones
**se recouvrent** dès qu'un chemin de l'une est égal à un chemin de l'autre, ou le contient — par
segments entiers : `runtime/src` ne possède pas `runtime/src2`. Pas de motif : ils ne se comparent
pas entre eux (voir la table de la fiche). Rien n'est lu sur le disque : un chemin peut nommer un
fichier à créer.

**Les chemins communs.** Certains fichiers sont touchés par presque tout ticket — ici,
`docs/runtime.md`. Une règle stricte ferait de tout un jalon une seule file. Le projet les déclare
donc, dans `BRIGADE_COMMON_PATHS` (facultative, vide par défaut) : un chemin commun **n'appartient
à personne**. Il ne fait pas se recouvrir deux zones qui le nomment, le découpage est prévenu de ne
le mettre dans aucune, et y écrire n'est jamais « hors zone ». Un dossier commun l'est avec tout ce
qu'il contient. Ce que ça coûte : deux livraisons peuvent se télescoper sur un fichier commun —
un conflit de texte, la pass le voit et le renvoie au cook ; une régression sans conflit, ce sont les
gates jouées sur la base après merge qui la voient (voir « Quand la base a avancé sous une
livraison »).

La règle s'applique à trois moments.

| Quand | Ce que le runtime fait | Où ça se lit |
|---|---|---|
| **Au découpage** | Deux tickets d'un découpage dont les zones se recouvrent et qui ne s'attendent pas, même indirectement : le code **pose la dépendance** — le second attend le premier | La fiche du ticket (`attend`), le commentaire de découpage sur l'épique (« Zones qui se recouvraient »), `manager.split` (`overlaps`) |
| **Sur le rail** | Un ticket en attente dont la zone recouvre celle d'un ticket **parti et pas encore servi** (pris, en pass, 86 — sauf redécoupé par le manager —, ou rendu par la pass avec sa livraison encore ouverte) est **retenu** | `npm run rail` et `status` : `zone tenue par #14 (chemin)` |
| **À la récolte** | Les fichiers de la livraison sont confrontés à la zone du ticket : un fichier livré ailleurs est **signalé**, pas arrêté | `cook.out-of-zone` au journal, et le commentaire de fin de cook sur l'issue |

**La retenue sur le rail** n'est pas une dépendance : elle ne s'écrit nulle part, elle se recalcule
à chaque lecture. Tant qu'aucun des deux n'est parti, rien ne retient personne — c'est l'ordre de
service qui dit lequel part. Dès que l'un est pris, l'autre attend son **service** : en pass, sa
livraison n'est pas encore sur la base, et un cook qui partirait maintenant écrirait le même fichier
sans elle. La retenue tombe si le premier revient en attente **sans avoir rien livré** (son cook a
échoué) ou quitte le rail — à la différence d'un `attend`, elle ne bloque jamais. **Un ticket que
la pass a rendu** (pass rouge, renvoi en attente) **garde sa zone** : il est en attente, mais sa
branche, son worktree et sa PR sont vivants, et un autre cook qui écrirait les mêmes fichiers
laisserait son renvoi reprendre sur une base périmée. Il la garde jusqu'au merge de sa livraison.
Deux tickets rendus par la pass sur une même zone ne se retiennent pas l'un l'autre : le premier
repris tient l'autre. Un ticket que la fiche dit déjà d'attendre
n'est dit qu'une fois, par sa dépendance. Deux détails : un ticket **86 tient sa zone** (un ticket
remonté au chef en pass a une PR ouverte) — même refusé avant tout cook, faute de calibrage : règle-le
ou retire-lui `fire`. Il la lâche dès que sa livraison est mergée, même par toi et même si le ticket
reste affiché 86 — et la reprend s'il est repris ensuite, ou rouvert et relancé. Exception : un ticket que le **manager a redécoupé** (86 `manager:split`) ne tient plus rien, PR ouverte ou pas — ses sous-tickets recouvrent sa zone, il les retiendrait pour toujours. Et une fiche **illisible ne tient rien**, sa zone ne fait pas foi.

**Le signal « hors zone »** dit trois choses sur l'issue : les fichiers livrés hors de la zone, le
ticket du rail qui possède chacun quand il y en a un, et que rien n'est arrêté :

```
**Hors zone — 1 fichier écrit hors de la zone du ticket** (zone du ticket : `runtime/src/rail.ts`) :
- `runtime/src/pass.ts` — dans la zone de #23

Rien n'est arrêté : la pass juge cette livraison comme une autre. C'est le signe d'un découpage à
revoir — si l'écart est légitime, élargis la zone dans la fiche du ticket.
```

Les gates, la CI et le reviewer jugent la livraison comme avant : un écart de zone est le symptôme
d'un découpage faux, pas une faute du cook. Un ticket **sans fiche, ou sans zone**, ne possède rien
et n'est jamais signalé. La consigne du cook lui dit que la fiche porte sa zone, de ne pas écrire
ailleurs sans que le ticket l'exige, et de le dire dans son compte-rendu.

**La zone qui compte est celle de la prise.** Un cook tourne sous le compte du service, qui a la
main sur le dépôt : il peut éditer la fiche de son propre ticket, et l'API de GitHub ne dit pas qui
a édité un commentaire. La livraison est donc confrontée à la zone que le ticket portait **quand il
a été pris** — elle est au journal —, pas à celle du jour. Si la zone a changé entre-temps, le
commentaire le montre (« La fiche a changé pendant la cuisson », les deux zones citées) et le fait
porte `cardChanged: true`, même quand rien n'est hors zone. Montré, pas jugé : toi aussi tu peux
corriger une fiche pendant qu'un cook tourne, et rien ne vous distingue. Un ticket renvoyé par la
pass est repris : sa zone est alors celle de cette nouvelle prise.

Limites connues. Une livraison ouverte que tu abandonnes à la main (PR fermée sans merge) tient sa
zone tant que son ticket n'est pas repris, servi ou retiré du rail. La fiche n'est relue qu'au sondage, une fois par minute : une édition faite dans
la dernière minute d'un cook peut ne pas être montrée — la zone qui juge, elle, reste celle de la
prise. La règle ne voit que les tickets **du rail** : une PR ouverte à la main, hors de tout ticket,
ne tient aucune zone. Depuis que plusieurs cooks tournent à la fois, la règle n'est plus seulement
celle du découpage : c'est elle qui empêche deux cooks d'écrire le même fichier en même temps.

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
| **fini, sans diff** | aucun commit, le cook a **conclu** et laissé un compte-rendu, et son worktree est **intact** — ni fichier modifié, ni fichier neuf que le projet n'ignore pas : un audit, une analyse, dont le compte-rendu est le livrable | ne pousse rien, n'ouvre pas de PR, met le ticket **en pass** (`cook.reported`, motif `no-diff`), commente l'issue. C'est le reviewer qui le jugera, seul | réussite |
| **échoué** | aucun commit et aucun compte-rendu ; aucun commit mais des fichiers écrits et jamais commités (`no-commit` : ce travail ne partirait nulle part) ; un cook sans commit qui n'a pas conclu ; ou un push impossible | rend le ticket au rail, commente l'issue avec le motif | échec |
| **86** | le flux du cook dit que le quota est épuisé | met le ticket **86** jusqu'à l'heure de retour du quota, et ne prend plus aucun ticket d'ici là | ne compte pas |
| connexion expirée | le flux dit que la machine n'a plus de session | rend le ticket, commente l'issue, et ne prend plus rien avant « reprendre » | ne compte pas |
| **refusé par le modèle** | le flux finit sur `stop_reason: refusal`, sans aucun commit (un travail commité avant le refus est récolté : c'est un cook **fini**) | rend le ticket et commente l'issue (« essai n/3 ») ; au **troisième refus d'affilée**, met le ticket **86**, motif `refused`, et te le remonte | ne compte pas |
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

### Quand le modèle refuse

Il arrive que le modèle refuse de répondre : `claude` sort en erreur, et son flux finit sur
`stop_reason: refusal` (« API Error: … safeguards flagged this message »). Vu à la recette du
2026-10-08, sur deux relectures de suite d'une livraison ordinaire — la troisième, même consigne,
est passée. Ce n'est **ni une panne ni un échec** : le runtime le reconnaît, le note à part au
journal (`cook.exited`, `outcome: refused`), et **le disjoncteur ne le compte pas**.

Il n'est pas non plus relancé sans fin : **au troisième refus d'affilée** du même lancement, le
runtime s'arrête et te le dit **sur l'issue**, avec la catégorie du refus quand `claude` la donne
(`reasoning_extraction`, par exemple) — sans que tu aies à ouvrir le flux brut.

| Ce que le modèle refuse | Jusqu'à deux refus d'affilée | Au troisième |
|---|---|---|
| le **cook** d'un ticket | le ticket revient en attente, un commentaire « Cook … — refusé par le modèle, essai n/3 » | le ticket passe **86**, motif `refused` ; le commentaire dit « Remonté au chef » |
| la **relecture** d'une livraison | elle est retentée au réveil suivant, rien n'est écrit sur le ticket | la pass te remonte le ticket (`review-refused`) : 86, sans merge ni renvoi |
| un **jugement**, un **découpage** ou une **réaction** du manager | il est retenté au réveil suivant, rien n'est épinglé | il s'épingle comme une réponse qui ne se lit pas (`manager.failed`, `manager.split-failed`, ou une réaction qui remonte), et le commentaire du manager porte le refus |

Une fois remonté, c'est à toi : reformuler le ticket, changer son calibrage, ou le relancer tel
quel — retirer puis reposer `fire` le remet en attente, et un cook neuf le reprend. Le compte ne
repart de zéro qu'à un lancement **qui n'est pas refusé** : relancé tel quel et refusé encore, le
ticket te revient dès ce refus-là.

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
npm --prefix runtime run station                 # la voir
npm --prefix runtime run station -- cooks 12     # régler son plafond de cooks (0 : aucune limite)
```

```
station               box/claude — moteur claude, fournit : code
cooks simultanés      30 au plus (le défaut : le chef n'a rien réglé) — `station -- cooks <N>` pour le changer, 0 pour aucune limite
machine               tient
connexion Max         tenue pour bonne
quota                 86 — épuisé, retour à 2026-10-08T15:30:00.000Z ; plus aucun ticket n'est pris d'ici là
cooks en cours        2
  #16  16-77c0d1aa  sonnet / medium  lancé le 2026-10-08T10:14:02.000Z  cook/16-77c0d1aa
  #18  18-02be9f31  haiku / low  lancé le 2026-10-08T10:14:03.000Z  cook/18-02be9f31
derniers cooks
  2026-10-08T10:12:40.000Z  #15  15-3f9a01bc  sonnet / medium  86 (quota épuisé)  9 tours · 41 200 tokens · 3,1 min
  2026-10-08T10:04:11.000Z  #14  14-a41c88e2  opus / high  fini  12 tours · 34 567 tokens · 4,2 min  https://github.com/benomite/brigade/pull/40
```

Sans argument, la commande lit `$BRIGADE_STATE_DIR`, n'écrit jamais, et répond pendant que le
runtime tourne. Tous les cooks en cours sont listés, quel que soit leur nombre ; les cooks finis,
les dix derniers. `cooks <N>` écrit un fait au journal, et rien s'il ne change rien ; sans runtime
qui tourne, le réglage vaudra à son prochain démarrage. Une machine saturée se lit sur la ligne
`machine`, avec ce qui manque.

| Événement | Sens |
|---|---|
| `station.announced` | La station se présente : son moteur, ce qu'elle fournit, et le plafond de cooks qui vaut tant que le chef n'a rien réglé (hors ticket) |
| `station.capped` | Le chef a réglé le plafond de cooks : `maxCooks`, `0` pour aucune limite. Il l'emporte sur l'annonce, et tient après un redémarrage (hors ticket) |
| `station.saturated` | La machine n'en peut plus : la station ne prend plus de ticket. `resource` : `cpu`, `memory` ou `disk` ; `observed`, `limit` : la charge et son plafond, ou ce qui reste et le minimum exigé, en Mo. Écrit quand la ressource en cause change, pas à chaque regard (hors ticket) |
| `station.relieved` | La machine respire : la station reprend (hors ticket) |
| `ticket.86` motif `no-calibration` | Le ticket est refusé faute de calibrage |
| `ticket.86` motif `unreadable-card` | Le ticket est refusé parce que le runtime ne comprend pas sa fiche |
| `ticket.86` motif `setup-failed` | Le setup du worktree a échoué : aucun cook lancé, le ticket revient en attente à `until` |
| `ticket.86` motif `refused` | Le modèle a refusé trois fois d'affilée le cook du ticket : remonté au chef, sans heure de retour |
| `cook.reported` | Le compte-rendu d'un cook. `ending` : `done`, `failed`, `86`, `disconnected` ou `refused` ; `reason` dit pourquoi (`no-commit`, `no-diff` — fini sans commit, le compte-rendu est le livrable —, `guard:idle`, `guard:lease`, `harvested:code de sortie 1`…) ; `summary` est son dernier message, `pr` l'adresse de sa PR ; `reconciled: true` quand il est écrit au démarrage, pour une livraison que la vie précédente avait envoyée en pass sans la raconter |
| `cook.out-of-zone` | La livraison d'un cook, confrontée à la zone que son ticket portait à la prise. `zone` : cette zone ; `files` : chaque fichier livré hors d'elle (`path`), et les tickets du rail qui le possèdent (`owners`) ; `cardChanged` : la zone de la fiche a changé pendant la cuisson. Un signal : il ne change l'état de rien. Jamais écrit pour un ticket pris sans zone |
| `station.86` | Le quota est épuisé jusqu'à `until` (hors ticket) |
| `station.disconnected` | La connexion Max a expiré |

## Le manager

Le manager décide **ce qui entre sur le rail, et le calibre**. Allumé, le chef pose une issue en
langage produit, sans aucun label : le manager pose `fire`, `model:` et `effort:` et dit pourquoi —
ou dit, en commentaire, pourquoi ce n'est pas un ticket exécutable. Et quand l'issue est une
**épique**, il la **découpe** : des tickets en sortent, calibrés, ordonnés et lancés (voir « Il
découpe les épiques »). Et quand un ticket **échoue en pass**, il en fait quelque chose plutôt que
de te le remonter tel quel (voir « Il réagit à un échec »).

**Il est éteint tant que tu ne l'as pas allumé.** Comme le grant `merge`, c'est un objet du runtime
— des faits au journal — pas un réglage : tu l'allumes et l'éteins sans redémarrer. Éteint pendant
un jugement, il le laisse finir mais ne pose rien : la décision reste au journal, et se pose sans
rejuger quand tu le rallumes.

```bash
npm --prefix runtime run manager                # l'interrupteur, ses quinze dernières décisions, ce qu'il a écarté, les épiques, et ses réactions aux échecs
npm --prefix runtime run manager -- allumer
npm --prefix runtime run manager -- eteindre
npm --prefix runtime run manager -- rendre 77   # lui rendre une issue qu'il a écartée parce que tu y as retiré un de ses labels
```

```
manager               ALLUMÉ depuis le 2026-10-08T16:02:11.000Z (par chef) — il juge les issues ouvertes, pose `fire` et le calibrage
dernières décisions
  2026-10-08T16:04:40.000Z  #76  refusée (un ticket incomplet) — Rien ne dit à partir de quel âge alerter.
  2026-10-08T16:03:52.000Z  #77  sur le rail, sonnet / low (posé : fire, model:sonnet, effort:low) — Un correctif borné, son motif attendu est nommé.
  2026-10-08T16:03:05.000Z  #1  écartée (roadmap)
écartées
  2026-10-08T18:12:40.000Z  #84  tu y as retiré `fire` ou un calibrage que le manager avait posé — pour la lui rendre : `npm --prefix runtime run manager -- rendre 84` : il la rejuge à neuf
  2026-10-08T16:20:02.000Z  #83  elle porte `blocked-on-human` — pour la lui rendre : retire `blocked-on-human` : elle est jugée au réveil suivant
  2026-10-08T16:03:05.000Z  #1  c'est la roadmap du projet — rien ne la rend au manager
épiques
  2026-10-08T16:09:30.000Z  #79  QUESTION POSÉE, attend ta réponse sur l'épique — « Plus rapide » : sur quel écran, et mesuré comment ?
  2026-10-08T16:05:12.000Z  #78  découpée, 1/3 servi (#80, #81, #82) — Un livrable par module touché.
réactions
  2026-10-08T17:41:09.000Z  #77  après 2 renvois, calibrage monté de sonnet / medium à sonnet / high — Le ticket est bien posé : le cook cale sur le raisonnement.
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
| a reçu des labels du manager, et il lui manque depuis `fire`, `model:` ou `effort:` | Rien, **jusqu'à ce que tu la lui rendes** : tu en as retiré, elle est à toi. Il le dit une fois sur l'issue, avec la commande qui la rend (voir « Lui rendre la main ») | `manager.set-aside` (`chef-changed`) |
| est écrite par quelqu'un qui n'a pas la main sur le dépôt | Rien, sans commentaire | `manager.set-aside` (`untrusted-author`) |
| est la roadmap (`BRIGADE_ROADMAP_ISSUE`) | Rien | `manager.set-aside` (`roadmap`) |
| est une épique déjà découpée par lui, ou un ticket né d'un de ses découpages | Rien : c'est fait, et ce qu'ils portent depuis est à toi | — |
| porte `blocked-on-human`, `question` ou `decision` | Rien | `manager.set-aside` (le label) |
| porte déjà, dans son corps, la liste de tickets d'une épique, sans qu'il l'ait découpée | Rien : elle a été découpée à la main | `manager.set-aside` (`already-split`) |
| porte `epic` | **Découpée** par le LLM, une fois | `manager.split`, ou une question |
| toute autre | **Jugée** par le LLM, une fois par état | `manager.judged`, ou `manager.failed` |

Aucun de ces labels n'est exigé, et aucun titre n'est lu : une épique que personne n'a labellisée
va au LLM, qui la reconnaît — elle est alors découpée comme une autre, au prix d'un jugement de
plus. Ce sont des raccourcis que tu peux prendre, pas un format.

### Lui rendre la main

Le manager n'écarte rien pour toujours : **chaque écart a son geste, et le relevé le dit**
(`run manager`, section « écartées » — les dix plus récentes, leur motif, et ce qui les lève).

| Écartée parce que… | Ce qui la rend au manager |
|---|---|
| tu y as retiré `fire`, `model:` ou `effort:` qu'il avait posé (`chef-changed`) | `npm --prefix runtime run manager -- rendre <n°>` |
| elle porte `blocked-on-human`, `question` ou `decision` | Retirer le label : elle est jugée au réveil suivant |
| son corps liste déjà les tickets d'une épique (`already-split`) | Retirer la liste du corps : l'épique est découpée au réveil suivant |
| c'est la roadmap, ou son auteur n'a pas la main sur le dépôt | Rien |

`rendre` ne force aucun autre écart que `chef-changed` : sur une issue retenue par un label, la
commande ne passe pas outre — elle répond le geste de la ligne qui la concerne, n'écrit rien et
sort en 1. `blocked-on-human` reste ta protection, une commande ne la contourne pas.

**Deux gestes, que le manager ne confond pas.**

- **Retirer `fire` ou un calibrage qu'il a posé, sans le remplacer** : tu reprends l'exécution. Il
  s'écarte — plus rien n'est posé ni rejugé, même si l'issue change — et te le dit sur l'issue, une
  fois : ce qui y manque pour partir, et la commande qui la lui rend — il ne le redit pas si tu la
  relances toi-même, un label après l'autre. Tu le savais avant de le faire : son
  commentaire « ticket mis sur le rail » porte le même avertissement. (Remplacer un `model:` par un
  autre n'est pas retirer : le ticket reste lancé et calibré, il ne s'écarte pas.)
- **Ranger ton backlog** — corriger `prio:`, poser ou retirer `question`, `decision` ou
  `blocked-on-human` : ce ne sont pas ses labels (les siens sont `fire`, `model:`, `effort:`), et
  aucun de ces gestes ne fait un `chef-changed`. Sur une issue qu'il n'a jamais labellisée, retirer
  le label qui la retenait la fait juger ; sur un ticket qu'il a lancé, il ne s'en mêle pas.

**Rendue, l'issue est jugée à neuf.** `rendre` écrit `manager.handed-back` au journal, à ton nom ;
au réveil suivant — une seconde si le runtime tourne et que le manager est allumé —, sans que
l'issue ait à changer :

1. le manager oublie sa décision et ce qu'il avait posé ;
2. il **retire les labels de calibrage qu'il avait posés lui-même** et que l'issue porte encore
   (`manager.withdrew`) — sans quoi l'ancien calibrage resterait, puisqu'il ne réécrit jamais une
   dimension qui porte un label. Un `model:` ou un `effort:` que **tu** as posé n'est pas touché ;
   et si entre-temps tu l'as relancée et calibrée toi-même (`fire`, `model:`, `effort:`), il n'y
   retire rien et ne la rejuge pas : elle est partie par toi ;
3. il la rejuge (un jugement, au prix d'un jugement), pose `fire` et le calibrage du nouveau
   jugement, ou dit pourquoi ce n'est pas un ticket exécutable.

**Une remise vaut pour un jugement.** Rejugée, relancée, et tu retires `fire` de nouveau : elle est
écartée de nouveau, et ne sera rejugée qu'à un nouveau `rendre`. Rien ne boucle sans ton geste.
Tant qu'elle n'est pas rejugée — manager éteint, quota épuisé —, le relevé la montre « rendue au
manager, pas encore rejugée ».

**Le jugement** est un appel à `claude` sans outil, hors de tout worktree, avec le calibrage de
`BRIGADE_MANAGER_MODEL` / `BRIGADE_MANAGER_EFFORT`. Il lit le titre, le corps, les labels et les
commentaires de ceux qui ont la main sur le dépôt (propriétaire, membres, collaborateurs — la règle
de la fiche), et répond l'une de cinq natures : `ticket`, `epic`, `question`, `decision`,
`incomplete`. Seul `ticket` entre sur le rail, avec un calibrage pris dans cette table ; `epic` part
au découpage, les trois autres sont refusées :

| Ticket | Calibrage |
|---|---|
| doc, renommage, correctif dont le test est déjà écrit | `haiku` / `low` |
| `fix`/`tech` mécanique sur un module connu | `sonnet` / `low` |
| `fix`/`tech` non mécanique, ou toute issue à critères d'acceptation précis | `sonnet` / `medium` |
| `feature`, refactor transverse, cœur du produit | `opus` / `high` |

Le manager ne pose jamais `xhigh` ni `max` : ils sont à toi seul.

### Il découpe les épiques

Tu poses une **épique** — du contexte, des critères d'acceptation en langage produit — et tu
retrouves des tickets : chacun avec ses critères d'acceptation **observables**, ses dépendances, sa
zone de fichiers et son calibrage, déjà lancés. Le label `epic` n'est pas exigé : sans lui, le
jugement reconnaît l'épique, et elle est découpée de la même façon.

**Le découpage** est un second appel à `claude`, comme le jugement : sans outil, hors de tout
worktree, au calibrage du manager, au journal comme un cook (`run` en `decoupe-<n°>-…`). Il lit
l'épique, les commentaires de confiance, et **le plan du dépôt** — ses dossiers sur deux niveaux,
tels que le clone de la station les connaît — dont il tire la zone de chaque ticket, et les chemins
communs du projet, qu'il ne met dans aucune. Il rend l'une
de trois réponses :

| Réponse | Ce que le manager fait | Au journal |
|---|---|---|
| un découpage, douze tickets au plus | Crée les tickets, les lance, le dit sur l'épique | `manager.split`, puis un fait par pas |
| **une question** : l'épique est ambiguë | La pose en commentaire, ne crée rien | `manager.split-asked` |
| « déjà découpée » : l'épique nomme déjà ses tickets | Ne crée rien, le dit une fois | `manager.split-skipped` |

Une réponse que le code ne sait pas lire — un ticket sans critère, sans zone, qui attend un ticket
placé après lui, un calibrage hors table, plus de douze tickets — ne crée **aucun** ticket
(`manager.split-failed`) : un découpage à moitié lisible n'est pas un découpage.

**Il ne découpe pas ce qu'il ne comprend pas.** Devant une épique ambiguë, il pose **une** question
plutôt que d'inventer un périmètre. La question est un commentaire sur l'épique, et se lit dans
`run manager` (« QUESTION POSÉE »). **Elle ne retient rien** : les autres issues sont jugées, les
autres épiques découpées, le rail avance. Tu réponds en commentaire ou tu édites l'épique : elle
est relue — une fois par état, comme un jugement —, **avec la question** : c'est le seul
commentaire du manager qu'un découpage relise, pour que « oui, la seconde » réponde à quelque
chose.

**Ce que porte un ticket né d'un découpage :**

- son corps commence par `Épique : #N`, puis le contexte, les critères d'acceptation, et **pourquoi
  ce calibrage** ;
- les labels `model:` et `effort:`, et le `prio:` de l'épique si elle en porte un ;
- sa **fiche** (`attend`, `zone`) en commentaire — les dépendances y portent les numéros des
  tickets nés avant lui ;
- `fire`, posé **en dernier** : une station ne prend pas un ticket dont la dépendance n'est pas
  encore lisible.

Il ne repasse pas par le jugement : il est né jugé et calibré, il ne reçoit pas un second
calibrage. Les tickets partent dans l'ordre du découpage — celui qui en attend un autre reste
« en attente » tant que l'autre n'est pas servi (voir « La fiche d'un ticket »).

**L'épique liste ses tickets, avec leur état.** Le manager écrit, à la fin du corps de l'épique, un
bloc entre deux marqueurs :

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

**C'est le seul endroit du corps qu'il réécrit** : tout ce qui est hors des marqueurs est à toi, et
n'est jamais touché. Un marqueur ne compte que **seul sur sa ligne, hors bloc de code** : le citer
dans une phrase ou dans un exemple ne pose pas de liste, et rien n'y est réécrit. Si le marqueur de fin a disparu, il ne remplace que le marqueur de début —
rien de ce qui le suit n'est effacé. La liste suit le rail : `pas sur le rail`, `en attente`,
`attend #N`, `en cuisine`, `en pass`, `servi`, `86 (motif)`, `bloqué — #N abandonné (…)`,
`abandonné (…)`, `fermé`. Elle ne porte aucune date, et ne se réécrit que quand un état change.
Éteint, le manager ne la met plus à jour ; rallumé, il la rattrape.

**Ton découpage est plus fort que le sien.** Une épique n'est découpée **qu'une fois** : ni un
réveil, ni une édition de l'épique, ni un redémarrage ne la refont. Après quoi :

- tu **fermes** un ticket : il ne renaît pas ; la liste le dit `abandonné`, et dit `bloqué` de
  ceux qui l'attendaient — c'est à toi de retirer la ligne `attend` de leur fiche ;
- tu **ajoutes** un ticket : écris `Épique : #N` dans son corps, il entre dans la liste. Il est
  jugé et calibré comme n'importe laquelle de tes issues ;
- tu **changes** un critère, une fiche, un calibrage, tu retires `fire` : rien n'est réécrit, rien
  n'est reposé ;
- tu **retiens** l'épique (`blocked-on-human`) pendant que ses tickets se créent : les créations
  attendent que tu la libères.

**Une épique déjà découpée à la main** — par toi, avant le manager — ne doit pas l'être une seconde
fois. **Le geste à faire : coller `<!-- brigade:tickets -->` dans son corps** (même seul, même
vide) avant d'allumer. Le code le reconnaît sans LLM (`already-split`) : c'est la garantie. Deux
autres règles de code vont dans le même sens — une épique **fermée** n'est jamais découpée, même
fermée pendant son jugement, et `blocked-on-human` la retient. Le découpage lui-même répond « déjà
découpée » quand l'épique nomme ses tickets, mais ce n'est qu'un filet : c'est un LLM qui lit, il
peut se tromper.

**Créer N issues n'est pas atomique**, et le journal le sait. Le découpage y est écrit **avant** le
premier appel à GitHub (`manager.split` porte tous les tickets prévus) ; chaque création est
annoncée (`manager.split-creating`) avant d'être tentée, puis constatée (`manager.split-created`).
Un runtime tué au milieu, un GitHub qui tombe : le réveil suivant reprend au premier ticket qui
manque, **sans rejuger**. Une création annoncée et jamais constatée — la réponse de GitHub s'est
perdue — est d'abord **cherchée** : chaque ticket porte dans son corps une marque
(`<!-- brigade:decoupage #N.k -->`, seule sur sa ligne), et celui qui la porte déjà est repris
(`reconciled: true`), pas recréé. La marque ne vaut que sur une issue de **quelqu'un qui a la main
sur le dépôt** — la règle de la fiche : celle qu'un inconnu poserait sur son issue n'est ni
reprise, ni lancée. De même, à la reprise, seule une fiche de confiance dispense de poser celle du
manager.

Limites connues. Le plan du dépôt est celui du dernier rapatriement du clone de la station : un
dossier créé depuis par un autre cook peut y manquer. Le manager **attribue** une zone à chaque
ticket, et le code vérifie que deux tickets concurrents n'en partagent aucun chemin (voir « Les
zones de fichiers ») — il ne vérifie pas que la zone est la bonne : c'est le signal « hors zone »,
à la récolte, qui le dira. Il ne ferme pas l'épique quand tout
est servi : la liste le dit, la fermer est ton geste. Et il ne réagit pas à l'échec d'un ticket né
d'un découpage : il reste 86 ou en attente, comme tout autre ticket.

### Il réagit à un échec

Éteint, rien ne change : la pass renvoie deux fois au même calibrage, puis te remonte le ticket.
**Allumé, la pass lui passe la main dès le second rouge** (`pass.deferred`) : le ticket reste en
pass, aucun cook ne repart avant qu'il ait décidé.

| Pass rouge n° | Ce qui se passe | Coût |
|---|---|---|
| 1 | renvoi 1/2 au même calibrage — c'est la pass, comme avant | — |
| 2 | le manager **monte le calibrage d'un cran** s'il le peut, puis renvoie 2/2. S'il ne peut pas, le second renvoi part au même calibrage, et il dit pourquoi | aucun : c'est du code |
| 3 et suivantes | le manager **choisit** : monter encore, **redécouper** le ticket, ou te le **remonter** — et dit lequel et pourquoi, sur l'issue | un jugement |

**Monter d'un cran**, c'est l'effort d'abord (`low` → `medium` → `high` → `xhigh` → `max`), puis le
modèle (`haiku` → `sonnet` → `opus`) en gardant l'effort atteint — **dans la limite du plafond du
projet**, qui n'a **pas de défaut** :

```ini
Environment=BRIGADE_CEILING_MODEL=<opus|sonnet|haiku>
Environment=BRIGADE_CEILING_EFFORT=<low|medium|high|xhigh|max>
```

Une dimension sans plafond ne monte jamais ; sans aucune des deux, le manager ne monte rien, et il
lui reste redécouper ou remonter. C'est ton plafond qui fait foi, `xhigh` et `max` compris — alors
qu'en qualifiant une issue, il ne pose jamais ni l'un ni l'autre.

**Il ne remplace que ses propres labels.** Monter, c'est retirer un label de calibrage et poser le
suivant : il ne le fait que sur un label qu'il a posé lui-même — en qualifiant l'issue, en
découpant l'épique dont elle est née, ou par une montée précédente. **Une dimension que tu as
calibrée n'est jamais touchée** : c'est l'autre qui monte, ou rien.

**Un ticket qui a échoué deux fois ne repart jamais à l'identique.** Avant de le rendre au rail, le
manager attend que celui-ci ait lu le nouveau calibrage ; si rien ne change — ni découpe, ni
calibrage —, c'est que sa décision est de remonter.

| Son choix | Ce qui se passe |
|---|---|
| **monter** | le label change, le ticket repart en attente : un cook le reprend dans le même worktree, sur la même PR. Rouge encore, le manager choisit de nouveau — sans pouvoir remonter plus haut que le plafond |
| **redécouper** | le ticket devient **l'épique de ses sous-tickets** : ils naissent calibrés, ordonnés et lancés comme ceux d'une épique, et repartent de la base. Lui passe **86** (`manager:split`) ; sa PR reste ouverte, comme référence, et **il ne tient plus sa zone** — elle est à ses sous-tickets. Un ticket né d'un tel redécoupage ne se redécoupe pas |
| **remonter** | le ticket passe **86** (`manager:escalated`), et tu reçois de quoi trancher : chaque tentative avec son calibrage et ce que la pass y a trouvé, pourquoi il remonte, et **ce qu'il propose** |

Une réponse qu'il ne sait pas lire, ou un choix qui n'était pas offert — monter au plafond,
redécouper un ticket né d'un redécoupage —, vaut **remontée** : il ne devine pas. Un redécoupage que
le découpage ne sait pas faire, de même.

**Le disjoncteur garde le dernier mot.** La livraison d'une relance qu'il a décidée ne compte comme
une réussite que jugée verte ; rouge, c'est un échec de plus. Au seuil, le disjoncteur s'ouvre, et
le manager **remonte sans plus rien relancer ni juger**, même s'il lui restait de quoi monter. Il
n'y a pas d'autre compteur : le plafond borne les montées, et un sous-ticket ne se redécoupe pas.

**Pourquoi ce ticket a-t-il été découpé en trois ?** Chaque réaction est au journal
(`manager.reacted`), avec son choix, son motif, le jugement qui l'a produite et le calibrage avant
et après : `npm --prefix runtime run manager` montre les dix dernières, `npm --prefix runtime run
journal` toutes. Les labels qu'une montée a changés sont dans `manager.raised`.

**À savoir.** Un ticket dont tu changes le calibrage pendant que le manager le tient repart à ton
calibrage, pas au sien : il ne pose rien, et le dit (« à ton calibrage ») plutôt que d'annoncer une
montée qui n'a pas eu lieu. Un redécoupage ou une remontée s'écrivent au journal **avant** d'être
dits : si GitHub ne répond pas, le ticket est déjà 86, et le commentaire suit dès qu'il répond.
Éteint pendant qu'il redécoupait, le manager n'en garde rien — aucun sous-ticket ne naît. Si tu reposes l'ancien label à la place du sien, le ticket attend, « rouge,
au manager » dans `npm run pass` : remplace le label, ou éteins le manager — la pass reprend alors
sa règle d'avant.

### Ce qu'il laisse sur l'issue

- **Exécutable** : les labels, puis un commentaire — pourquoi elle est exécutable, **pourquoi ce
  modèle et cet effort**, ce qui était déjà posé et qu'il a laissé, et ce que le jugement a coûté
  (calibrage, tours, tokens, durée).
- **Refusée** : aucun label, et un commentaire — sa nature, le motif, ce qui la rendrait
  exécutable.
- **Épique découpée** : un commentaire — pourquoi ces tickets, pourquoi cet ordre, le tableau des
  tickets avec leurs dépendances, leur zone et leur calibrage, ce que le découpage a coûté — et la
  liste dans son corps. **Question**, **déjà découpée**, **découpage illisible** : un commentaire
  qui le dit, aucun ticket.
- **Jugement illisible** (le LLM n'a rendu aucune décision que le code sache lire) : aucun label,
  un commentaire qui le dit.

Une issue ne se juge **qu'une fois par état**. L'état, c'est ce que le jugement lit : titre, corps,
commentaires de confiance. Tu édites le corps ou tu réponds en commentaire, elle est rejugée — une
réponse sur une issue refusée coûte donc un jugement. Ni tes changements de labels, ni ce que le
manager a posé et écrit lui-même ne la font rejuger. Un jugement illisible n'est pas retenté sur le
même état.

Un jugement **qui n'a pas abouti** — binaire introuvable, panne réseau, sortie en erreur, arrêt par
un garde-fou — n'est pas un jugement illisible : il ne dit rien de l'issue. Rien n'est écrit sur
elle ni épinglé au journal, il repart au réveil suivant, et c'est le disjoncteur qui borne les
essais.

### Ton geste est plus fort que le sien

- **Il ne retire jamais un label que tu as posé.** Un `fire` posé par toi reste, même sur une
  question. Les seuls qu'il retire sont les siens : un calibrage qu'il remplace en le montant (voir
  « Il réagit à un échec »), ou qu'il avait posé sur une issue que tu lui rends.
- **Il ne pose jamais dans une dimension qui porte déjà un label.** Tu as posé `model:opus` : il
  n'ajoute que `fire` et `effort:`, et son commentaire dit ce qui était déjà posé.
  Tu as posé `fire` sans calibrer : il juge, et ne pose que le calibrage.
- **Il ne pose qu'une fois par issue.** Après quoi tout ce qu'elle porte est à toi : tu retires
  `fire`, il ne le repose pas — tant que tu ne la lui rends pas (voir « Lui rendre la main ») ; tu
  remplaces `model:sonnet` par `model:opus`, il ne le réécrit pas.
  « Posé par le manager » est ce que le journal dit qu'il a posé (`manager.labeled`), pas l'auteur
  vu par GitHub — sur la box, tout passe par le même `gh`.
- **Il relit les labels juste avant de poser.** Un jugement dure, et sur un backlog ils se suivent :
  si entre-temps tu as retenu l'issue (`blocked-on-human`, `question`…), rien n'est posé ; si tu l'as
  lancée et calibrée toi-même, il n'ajoute rien.
- **`fire` posé par toi sur ce que le code écarte** (la roadmap, un label `question`…) : il ne retire
  rien, ne calibre pas, et le dit une fois. Sans calibrage aucun cook ne part ; si tu calibres toi-
  même, le cook part — c'est ton geste entier.

Limite connue : si le runtime meurt entre la pose des labels et l'écriture de `manager.labeled`, il
ne sait plus qu'il les a posés. Ils sont alors tenus pour les tiens : il n'y touchera plus.

### Ce qu'il coûte

**Il ne consomme du quota que pour juger et pour découper.** Un réveil sans issue neuve ou modifiée
coûte une requête conditionnelle à GitHub, et rien d'autre ; créer les tickets d'un découpage et
tenir la liste d'une épique ne coûtent que des appels à GitHub. Une épique sans label coûte deux
appels au LLM — le jugement qui la reconnaît, puis le découpage ; avec le label `epic`, un seul.

Chaque jugement est au journal **comme un cook** : un `cook.launched` (station `manager`, modèle,
effort — hors ticket) et un `cook.exited` (tours, tokens, durée), son flux brut dans `runs/`, et il
apparaît dans `status` et `garde-fous` pendant qu'il tourne. `manager.judged` porte le même `run`.

Il passe par les garde-fous : mêmes plafonds, et **rien n'est jugé** tant que tu as dit « stop »,
que le disjoncteur est ouvert, que le quota est épuisé ou que la connexion Max a expiré — ce qui
attendait est jugé à la reprise. Un jugement qui bute lui-même sur le quota ou sur une connexion
expirée retient la station, comme un cook (`station.86`, `station.disconnected`).

Pour le disjoncteur, un jugement illisible ou non abouti est **un échec** ; un jugement réussi ne compte **ni pour
ni contre** — il ne remet pas à zéro les échecs d'affilée des cooks. Un jugement **que le modèle
refuse** ne compte pas davantage : il est retenté, et s'épingle au troisième refus d'affilée (voir
« Quand le modèle refuse »).

Un jugement peut tourner pendant que des cooks cuisinent, et il ne retient pas la station : le
plafond de cooks ne compte que les tickets. Les labels posés sont vus par le rail au sondage suivant : compter jusqu'à une
minute entre la décision et le départ du cook.

| Événement | Sens |
|---|---|
| `manager.enabled`, `manager.disabled` | Le chef allume, éteint (hors ticket) |
| `manager.set-aside` | Le code a écarté l'issue, sans jugement. `reason` dit pourquoi ; `fired` : elle porte un `fire` que le manager a laissé ; `lacking`, sur un `chef-changed` : ce qui lui manque pour être lancée et calibrée (`fire`, `model:`, `effort:`) |
| `manager.judged` | Le LLM a jugé. `verdict` : `fire` ou `refused` ; `kind` : la nature ; `reason` : le motif ; `missing` : ce qui la rendrait exécutable ; `model`, `effort`, `calibration` : le calibrage et sa justification ; `run` : le jugement ; `fingerprint` : l'état jugé |
| `manager.failed` | Le jugement est allé à son terme, mais sa réponse ne se lit pas — ou le modèle l'a refusé trois fois d'affilée. `reason` dit quoi. Un jugement non abouti n'en écrit pas |
| `manager.labeled` | Les labels que le manager a posés, une fois GitHub servi |
| `manager.commented` | La décision est dite sur l'issue |
| `manager.handed-back` | Le chef rend au manager une issue écartée `chef-changed` (`run manager -- rendre <n°>`) : sa décision et ce qu'il y avait posé sont oubliés, elle sera rejugée |
| `manager.withdrew` | Les labels de calibrage que le manager avait posés sur une issue rendue, et qu'il en a retirés avant de la rejuger (`labels`, vide s'il n'en restait aucun) |
| `manager.split` | Le LLM a découpé l'épique : l'intention, écrite avant toute création. `reason` : pourquoi ces tickets ; `order` : pourquoi cet ordre ; `tickets` : chacun avec titre, contexte, critères, `waitsFor` (les rangs qu'il attend), zone, calibrage et sa justification, et `overlaps` — ceux de ses `waitsFor` que le code a ajoutés parce que les zones se recouvraient, avec le chemin en commun ; `run`, `fingerprint` |
| `manager.split-asked` | Le LLM pose une `question` au chef au lieu de découper |
| `manager.split-skipped` | Le LLM lit que l'épique liste déjà ses tickets : rien n'est créé |
| `manager.split-failed` | Le découpage est allé à son terme, mais sa réponse ne se lit pas. `reason` dit quoi |
| `manager.split-creating` | Le ticket de rang `index` va être créé (sur l'épique) |
| `manager.split-created` | Il existe — fait porté par **le ticket né**. `epic`, `index` ; `reconciled: true` s'il a été retrouvé sur GitHub après une création restée sans suite |
| `manager.split-fired` | Sa fiche et `fire` sont posés (sur le ticket) |
| `manager.split-done` | Tous les tickets du découpage existent et sont lancés |
| `manager.split-commented` | Ce que le manager avait à dire du découpage est dit sur l'épique |
| `manager.split-adopted` | Un ticket du chef se réclame de l'épique (`Épique : #N`) : il entre dans sa liste (sur le ticket) |
| `manager.split-seen` | Un ticket d'une épique a quitté les issues ouvertes, ou y est revenu (`open`) |
| `manager.split-listed` | La liste des tickets est écrite dans le corps de l'épique. `digest` : son empreinte — la même ne se réécrit pas |

## La pass

Quand un cook a livré, **la pass juge sa livraison sans personne** — plus le manager. Elle a trois
juges, dans cet ordre :

1. **Les gates** : `.claude/brigade/gates.sh <worktree>`, jouées dans le worktree du cook. C'est le
   contrat de la V1 — **le code de sortie est le verdict**. Si le projet a un
   `.claude/brigade/worktree-setup.sh`, il passe d'abord — comme avant un cook —, et ce qu'il exporte
   vaut pour les gates. Plafond, setup compris : 30 minutes ; au-delà elles sont arrêtées, et c'est
   rouge.
2. **Le reviewer**, appelé seulement si les gates sont vertes : un `claude` qui relit le diff. C'est
   le seul modèle que la pass appelle — voir « Le reviewer ».
3. **La CI** du commit jugé (*check runs* et statuts), lue seulement si les gates sont vertes.

| La CI dit | Ce qu'en fait la pass |
|---|---|
| un job en échec | **rouge**, avec le nom du job, sa conclusion, son adresse |
| des jobs en cours | pas de verdict : elle est relue à chaque tick. Trente minutes sans conclusion : remontée au chef (`ci-silent`). Sauf si le reviewer a déjà un constat bloquant : le verdict est rouge tout de suite, CI « non lue » |
| tout est vert | vert |
| **aucun check** | ni vert ni rouge : le verdict repose sur les gates et le reviewer, et il le dit (`ci: none`). Sauf si la branche porte des workflows (`.github/workflows`) : leurs checks sont alors attendus |

Le verdict est au journal (`pass.judged`) **avec ce qui l'a produit** : l'issue et le code des
gates, leurs lignes `FAIL`, la fin de leur sortie, chaque job de CI, et la relecture du reviewer —
son run, son résumé, chacun de ses constats. Ce qui est jugé est un commit précis, et c'est ce
commit-là qui sera mergé.

**Vert veut dire « les gates et la CI n'ont rien trouvé, et un reviewer a relu le diff sans rien
trouver de bloquant ».** Pas « un humain a relu ».

### Le reviewer

Du code écrit par un cook n'arrive plus sur la branche d'intégration sans avoir été relu. Après des
gates vertes, la pass lance un **reviewer** : un `claude` de plus, dans le worktree de la
livraison.

- **Ce n'est jamais le cook qui se relit.** Un process neuf, sa propre consigne, aucune session
  reprise. (La spec veut à terme un autre moteur ; en V2 c'est un autre Claude.)
- **Il ne peut rien écrire.** Trois outils — `Read`, `Grep`, `Glob` — et rien d'autre : ni shell,
  ni édition, ni skill, ni serveur MCP, ni réglages du compte. Aucun mode sans permission : ce qui
  n'est pas dans cette liste lui est fermé.
- **Ce qu'il lit** : le titre et le corps du ticket, les commentaires de ceux qui ont la main sur
  le dépôt (`OWNER`, `MEMBER`, `COLLABORATOR`) — sans ceux que la brigade a posés elle-même —, le
  compte-rendu du cook, la liste des fichiers changés, et le diff contre la branche d'intégration.
  Tout cela lui est donné **comme une donnée, pas comme une consigne**. Chaque morceau a un plafond,
  **en octets** : la consigne part en un seul argument de commande, que Linux borne à 128 Ko. Un
  diff de plus de 40 000 octets, ou une liste de fichiers de plus de 8 000, est coupé dans sa
  consigne, qui le lui dit : il lit le reste dans le worktree (`pass.reviewed` porte alors
  `truncated: true`). Une consigne qui pèserait malgré tout plus de 120 000 octets **ne se lance
  pas** : la pass te remonte le ticket (`review-unsendable`) au lieu d'échouer à chaque réveil.
- **Ce qu'il rend** : un verdict, un résumé, et des constats, chacun **bloquant** ou **remarque**.

| Le reviewer dit | Ce qu'en fait la pass |
|---|---|
| aucun constat bloquant | rien n'est retenu. Les remarques sont sur l'issue ; elles ne repartent pas au cook |
| **un constat bloquant** | **rouge, gates vertes ou non** : le constat repart à un cook, et consomme un renvoi comme une gate rouge |
| une réponse qui ne se lit pas — de la prose, une gravité inconnue, un verdict vert avec un constat bloquant | **ni verte ni rouge** : remontée au chef (`review-unreadable`), sans renvoi. Rien n'est deviné |

**Tu lis ce qu'il a dit sur l'issue**, sans ouvrir le journal : chaque relecture y laisse un
commentaire « Reviewer — … » avec son résumé, chaque constat et sa gravité, son calibrage, ses
tours, ses tokens et sa durée.

**Une livraison n'est relue qu'une fois.** La relecture est au journal (`pass.reviewed`), rangée
sur le run du cook et son commit : une CI qui tarde ou un redémarrage ne la refont pas. Un renvoi,
lui, est une autre livraison : il est relu.

**Un reviewer vert ne lève aucune autre règle** : sans grant la pass s'arrête, et une livraison qui
touche à ses propres juges (`judge-modified`) n'est jamais mergée par elle.

#### Ce qu'il coûte

**Une relecture par livraison, et seulement après des gates vertes** : des gates rouges, un conflit
avec la base ou un worktree sale ne paient pas de reviewer.

Son calibrage est **explicite, et sans défaut** : `BRIGADE_REVIEWER_MODEL` et
`BRIGADE_REVIEWER_EFFORT`, exigés au démarrage comme ceux du manager. Il est posé pour le projet,
pas par ticket — pas un label de plus par issue. Un reviewer ne lit qu'un diff : son calibrage n'a
pas de raison d'égaler celui d'un cook.

Chaque relecture est au journal **comme un cook** : un `cook.launched` (station `reviewer`, modèle,
effort — hors ticket, run `review-<ticket>-…`) et un `cook.exited` (tours, tokens, durée), son flux
brut dans `runs/`, et elle apparaît dans `status` et `garde-fous` pendant qu'elle tourne.
`pass.reviewed`, sur le ticket, porte le même run.

Elle passe par les garde-fous : mêmes plafonds, et **rien n'est relu** tant que tu as dit « stop »,
que le disjoncteur est ouvert, que le quota est épuisé ou que la connexion Max a expiré — la
livraison attend, sans verdict, et elle est relue à la reprise. Une relecture qui bute elle-même
sur le quota ou sur une connexion expirée retient la station, comme un cook (`station.86`,
`station.disconnected`).

Pour le disjoncteur, une relecture illisible ou non aboutie est **un échec** ; une relecture
réussie ne compte **ni pour ni contre**. Une relecture non aboutie (panne, garde-fou) n'écrit rien
sur le ticket : elle est retentée au réveil suivant, et c'est le disjoncteur qui borne. Une
relecture **que le modèle refuse** n'est pas un échec : elle est retentée sans compter au
disjoncteur, et la pass te remonte le ticket au troisième refus d'affilée (`review-refused`, voir
« Quand le modèle refuse »).

Une relecture peut tourner pendant que des cooks cuisinent d'autres tickets, et elle ne retient pas
la station : le plafond de cooks ne compte que les tickets.

### Les tickets sans diff

Un audit, une analyse, une comparaison d'approches : le cook conclut sans rien commiter, et son
**compte-rendu est le livrable**. Gates et CI n'ont rien à en dire, et il n'y a rien à merger.

**Le reviewer est alors le seul juge, et il est obligatoire : un ticket sans diff n'est jamais
servi sans avoir été relu.** Il relit le compte-rendu contre le ticket, dans un worktree du dépôt
où il peut vérifier ce que le livrable affirme du code.

| Le reviewer dit | Ce qui se passe |
|---|---|
| rien de bloquant | le ticket est **servi sans merge** (`pass.served`) et son issue fermée — **sans grant** : il n'y a rien à merger. Le livrable reste sur l'issue, dans le commentaire du cook |
| un constat bloquant | rouge : il repart à un cook, dans le même worktree, dans la limite des deux renvois. Son nouveau compte-rendu est relu |
| illisible | remontée au chef (`review-unreadable`) |
| rien — « stop », disjoncteur, quota, connexion | le ticket **attend en pass** : pas de relecture, pas de service |

Un cook sans commit **et** sans compte-rendu n'a rien livré : c'est un échec, pas un ticket sans
diff. **Un worktree qui porte du travail jamais commité non plus** : le servir fermerait l'issue
sur des fichiers poussés nulle part. La station en fait un échec (`no-commit`) ; et si c'est un cook
de renvoi qui l'a laissé ainsi, la pass le juge rouge **sans appeler le reviewer** — le finding
(« commite ce qui fait partie de la livraison, annule le reste ») repart au cook. Un cook de renvoi qui, cette fois, commite, livre un diff : gates, PR, reviewer et CI comme
pour tout autre.

Limite connue : rien ne dit d'avance qu'un ticket est « sans diff ». Un cook qui conclut sans rien
commiter sur un ticket qui demandait du code part lui aussi en pass comme tel — c'est au reviewer
de dire que le ticket n'est pas rempli, et il le lit dans le ticket.

### Ce que la pass décide

| Verdict | Grant `merge` | Ce qui se passe |
|---|---|---|
| vert | **actif** | le runtime regarde d'abord **ce que la base est devenue** (voir « Quand la base a avancé sous une livraison »), puis **merge lui-même** la PR sur la branche d'intégration, le ticket est **servi**, son issue fermée. Tu n'as rien à faire |
| vert | actif, **base rouge** | rien n'est mergé : la livraison **attend** (`pass.waiting`, motif `base-red`) et repart seule quand la base est réparée |
| vert | absent ou révoqué | la PR reste ouverte et **la pass s'arrête là** — elle le dit sur l'issue (`pass.held`, motif `no-grant`) |
| vert, mais la livraison touche `.claude/brigade/` ou `.github/workflows/` | peu importe | **jamais mergée par la pass** (`judge-modified`) : un cook qui modifie ses propres juges peut se rendre vert seul. À relire et merger à la main |
| vert, ticket sans diff | peu importe | **servi sans merge**, issue fermée (voir « Les tickets sans diff ») |
| rouge — gates, CI, ou constat bloquant du reviewer | — | les **findings repartent à un cook**, dans le même worktree (voir « La station »). Rien n'est mergé |
| rouge une seconde fois, **manager allumé** | — | la pass **passe la main au manager** (`pass.deferred`) : il monte le calibrage avant le second renvoi, puis, passé les deux renvois, choisit la suite (voir « Il réagit à un échec ») |
| rouge une troisième fois, manager éteint | — | deux renvois sont consommés : la pass **cesse de renvoyer et te remonte le ticket** (`pass.escalated`). Il passe **86** |

Seul un verdict rouge consomme un renvoi. Un cook de renvoi qui échoue sans rien livrer n'en
consomme pas : c'est le disjoncteur qui borne.

**La pass te remonte aussi, sans renvoi**, ce qu'un cook ne peut pas corriger : une PR qui ne vise
pas la branche d'intégration (`wrong-base` — une PR vers `main` est donc refusée tant que la base
est `v2`), un projet sans `gates.sh` (`no-gates` : sans gates, « vert » voudrait dire que personne
n'a regardé), une livraison dont le worktree n'existe plus (`worktree-lost` : retiré à la main, ou
jamais rendu par une restauration — la pass ne le recrée pas, la branche poussée reste sur
l'origine), une CI muette (`ci-silent`), une relecture qui ne se lit pas (`review-unreadable`), dont la consigne ne tient pas dans une
commande (`review-unsendable`), ou que le modèle a refusée trois fois d'affilée (`review-refused`).
Le ticket passe 86, motif `pass:<raison>`.

**Sortir un ticket que la pass a arrêté ou remonté** : merge sa PR à la main. La pass relit GitHub
à chaque tick ; elle le voit, sert le ticket et ferme l'issue. Ou retire `fire` : il quitte le rail.
Une PR fermée sans merge laisse le ticket en pass.

Chaque décision est commentée sur l'issue. Un conflit avec la base est un finding : rouge, renvoyé.

### Quand la base a avancé sous une livraison

Les gates jugent **la branche du cook**. Avec plusieurs cooks à la fois, la base avance pendant
qu'une livraison est jugée : deux livraisons **vertes séparément** peuvent casser `v2` **ensemble**
— et sous grant `merge`, personne ne le verrait passer. Avant de merger sous grant, la pass rapatrie
donc la base et regarde ce qu'elle a reçu depuis le départ de la branche.

| La base, depuis le départ de la branche | Ce que fait la pass | Ce que ça coûte |
|---|---|---|
| n'a pas bougé | merge. Ce que les gates ont jugé est ce qui atterrit | rien |
| a avancé, **sur d'autres fichiers** | merge **sans rejeu** — c'est écrit (`pass.base-moved`, `replay: false`) et dit dans le commentaire de merge. Le merge est alors **à vérifier** : les gates sont jouées sur la base elle-même, après coup | une suite sur la base, **partagée** par tous les merges de la même passe |
| a avancé, **sur des fichiers que la livraison touche aussi**, sans conflit | les gates sont **rejouées sur le résultat du merge**, dans un worktree jetable (`pass.base-moved`, `replay: true`, puis `pass.replayed`). Vertes : merge. Rouges : le verdict devient **rouge**, et la rencontre repart au cook comme un finding — avec la consigne de rebaser. Ça **consomme un renvoi**, comme un conflit | une suite, avant le merge |
| a avancé, et le merge ne se fait plus | conflit : finding, renvoyé au cook | rien |

**Pourquoi pas « branche à jour exigée ».** Exiger un rebase à chaque merge d'un voisin coûterait un
cook — du quota Max — par livraison et par merge : N livraisons de front, de l'ordre de N² cooks. Un
rejeu de gates ne coûte que de la machine. Et rejouer pour **chaque** livraison coûterait une suite
entière là où deux tickets aux zones disjointes n'ont, le plus souvent, rien à se dire : c'est le
contrôle de la base, une fois, qui les couvre.

**Ce qui compte comme « les mêmes fichiers »** : les fichiers réellement livrés (ceux du diff),
confrontés à ceux que la base a réellement reçus — pas les zones déclarées des fiches, qu'une
livraison peut déborder. Les **chemins communs** (`BRIGADE_COMMON_PATHS`) ne comptent pas, comme pour
les zones : ici presque tout ticket touche `docs/runtime.md`, et chaque merge se paierait une suite.

**Rien n'attend qu'un lot se forme.** La pass traite les livraisons une par une ; « merger d'un
bloc » se réduit à ceci : les merges faits sans rejeu dans une même passe sont vérifiés **ensemble**,
par un seul passage de gates sur la base. La seule attente est celle d'un rejeu — bornée par le
plafond des gates (30 minutes) — et elle se lit : `pass` montre la livraison en « gates rejouées sur
le résultat du merge ».

**Le worktree jetable** vit sous `worktrees/.essais/` : détaché de toute branche, il porte la base
rapatriée, ou le commit de merge de la livraison dans la base — un commit qui n'est sur aucune
branche et n'est jamais poussé. **La pass ne touche à aucune branche**, ni celle du cook, ni la base.
Il est retiré dans tous les cas : gates vertes, rouges, arrêtées au plafond, runtime arrêté ; et un
runtime **tué** pendant un rejeu retire au démarrage ceux qu'il a laissés, puis reprend le rejeu —
rien n'est mergé deux fois. Le setup du projet y passe d'abord, comme partout ; pour la base, qui
n'a pas de ticket, il reçoit le numéro `0`.

**Rejouer des gates consomme la machine**, comme un cook : la pass lit la même machine que la
station, sous les mêmes seuils (voir « Plusieurs cooks à la fois »). Saturée, le rejeu d'une
livraison **attend** (`pass.waiting`, motif `machine-saturated`, commenté sur l'issue) et le contrôle
de la base est remis (une ligne dans journald) ; l'un et l'autre repartent seuls. Les gates du
jugement lui-même — celles du worktree du cook — ne passent pas par cette garde : c'est l'entrée du
cook qui l'a payée.

#### La base est contrôlée après merge

Un merge que rien n'a vérifié sur la base telle qu'elle était est **à vérifier** : celui que la pass
a fait sans rejeu sur une base qui avait avancé, et **tout merge fait hors du runtime** — une PR
arrêtée ou remontée que tu merges à la main, dont la pass ne sait pas sur quoi elle a atterri. À la
fin de la passe, les gates sont jouées **sur la base elle-même**, dans un worktree jetable, **hors
ticket** — comme un jugement du manager est un cook hors ticket. Le résultat est au journal
(`base.checked` : le commit, le verdict, ce que les gates ont dit, les tickets dont le merge était à
vérifier).

**Rouge**, c'est remonté tout de suite :

- une ligne dans journald — `v2 est ROUGE après merge (…) — les merges sous grant sont suspendus` ;
- un commentaire sur **chaque ticket** dont le merge était à vérifier, avec les lignes `FAIL` ;
- `npm run pass` l'affiche en tête : `BASE ROUGE depuis … — après le merge de #17 : …`.

Et **les merges sous grant s'arrêtent** : une livraison verte n'est plus mergée, elle **attend**
(`EN ATTENTE — verte, non mergée (base-red)`), et le dit sur son issue. Rien n'est à refaire sur
elle. **La réparer est à toi** : pousse le correctif (une PR mergée à la main sur `v2`). La pass
relit la base à chaque tick tant qu'elle est rouge ; dès qu'elle a bougé, ses gates sont rejouées, et
au vert **les livraisons en attente partent seules**. Tu peux toujours merger une livraison en
attente à la main : c'est un merge hors du runtime, donc un nouveau contrôle. Une base rouge par un
test instable ne se rejoue pas seule : il lui faut un commit.

Ce que la base rouge **n'arrête pas** : la station continue de prendre des tickets, et leurs cooks
partent d'une base cassée (#143).

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

⚠️ **Grant actif, du code écrit par un cook atterrit sur la branche d'intégration sans qu'aucun
humain l'ait lu** : ses juges sont les gates et la CI du projet, et un reviewer qui est un modèle.
Ce qui casse `v2` bloque la construction de la V2.

### Voir la pass

```bash
npm --prefix runtime run pass              # les livraisons : phase, renvois consommés, PR
npm --prefix runtime run pass -- 17        # l'histoire du ticket 17 : chaque verdict et ce qui l'a produit
```

```
#17  rouge, renvoyée au cook  renvois 1/2  depuis 2026-10-08T14:12:40.000Z  https://github.com/benomite/brigade/pull/52
#18  ARRÊTÉE — verte, non mergée (no-grant)  renvois 0/2  depuis 2026-10-08T14:20:03.000Z  https://github.com/benomite/brigade/pull/53
#19  rouge, au manager  renvois 2/2, 1 relance du manager  depuis 2026-10-08T14:22:51.000Z  https://github.com/benomite/brigade/pull/54
```

```
#17  mergée  renvois 1/2  depuis 2026-10-08T14:31:07.000Z  https://github.com/benomite/brigade/pull/52
  2026-10-08T14:10:02.000Z  jugement de https://github.com/benomite/brigade/pull/52 sur 8c1d2e0 (run 17-a41c88e2)
  2026-10-08T14:12:40.000Z  verdict n° 398 : ROUGE — gates rouges (code 1) · CI non lue · reviewer non appelé
      FAIL  tests du runtime en échec — rejoue : npm --prefix runtime test
  2026-10-08T14:12:40.000Z  renvoi 1/2 : les findings repartent à un cook
  2026-10-08T14:30:58.000Z  relecture du reviewer (run review-17-5be0c1d2) : rien de bloquant
      Le correctif fait ce que le ticket demande, et son test échoue sans lui.
      reviewer — remarque (runtime/src/rail.ts) : le nom `x` ne dit pas ce qu'il porte.
  2026-10-08T14:31:05.000Z  verdict n° 412 : VERT — gates vertes (code 0) · CI aucun check · reviewer rien de bloquant (run review-17-5be0c1d2)
      reviewer — remarque (runtime/src/rail.ts) : le nom `x` ne dit pas ce qu'il porte.
  2026-10-08T14:31:05.000Z  grant merge utilisé : merge de https://github.com/benomite/brigade/pull/52 sur v2, autorisé par le verdict n° 412
  2026-10-08T14:31:07.000Z  mergée par la pass
```

Quand la base a avancé sous une livraison, son histoire le dit — le rejeu et ce qu'il a donné, ou le
merge sans rejeu, puis le contrôle de la base qui le vérifiait :

```
  2026-10-09T09:12:40.000Z  la base a avancé de 2 commits sous cette livraison (4be1f07), sans toucher à ses fichiers : mergée sans rejeu, les gates seront jouées sur la base après merge
  2026-10-09T09:12:41.000Z  mergée par la pass
  2026-10-09T09:12:52.000Z  gates jouées sur la base après merge (9c0d3aa) : ROUGES (code 1) — merges sous grant suspendus
      FAIL  tests du runtime en échec — rejoue : npm --prefix runtime test
```

Et la liste s'ouvre sur l'état de la base quand il compte :

```
BASE ROUGE depuis 2026-10-09T09:12:52.000Z (9c0d3aa) — après le merge de #17 : les merges sous grant sont suspendus, les livraisons vertes attendent
#18  EN ATTENTE — verte, non mergée (base-red)  renvois 0/2  depuis 2026-10-09T09:14:03.000Z  https://github.com/benomite/brigade/pull/53
```

Les deux commandes lisent `$BRIGADE_STATE_DIR`, n'écrivent jamais, et répondent pendant que le
runtime tourne.

| Événement | Sens |
|---|---|
| `grant.activated`, `grant.revoked` | Les commandes du chef (hors ticket) |
| `pass.started` | La pass prend une livraison : son run, sa PR (aucune pour un ticket sans diff), le commit jugé |
| `pass.reviewed` | Le reviewer a relu la livraison du `run`, sur ce `sha`. `review` : le run de sa relecture ; `outcome` : `green`, `red` ou `unreadable` (`reason` dit quoi) ; `summary`, `findings` (chacun `severity` : `blocking` ou `remark`, `file`, `text`) ; `truncated` : le diff était coupé dans sa consigne |
| `pass.judged` | Le verdict (`green`, `red`), avec `gates`, `ci`, `review` (`green`, `red`, ou `skipped` : non appelé), `findings`, `judgeModified`, et `noDiff` |
| `pass.served` | Verte et sans diff : servie sans merge, avec le numéro du verdict qui l'autorise |
| `grant.used` | L'intention de merger : l'usage du grant, avec le numéro du verdict qui l'autorise |
| `merge.done` | Mergée. `by` : `pass`, ou `outside` (à la main). `reconciled` : constaté après un redémarrage |
| `merge.failed` | Le merge n'a pas abouti : `interrupted`, ou le refus de GitHub |
| `pass.held` | Verte, non mergée : `no-grant`, `judge-modified`, `merge-refused: …` |
| `pass.base-moved` | La base a avancé sous une livraison verte : `from` (le départ de la branche, ou la base d'un rejeu déjà vert), `base`, `behind` (commits), `overlap` (les fichiers en commun, chemins communs mis à part), `replay` (`false` : mergée sans rejeu) |
| `pass.replayed` | Les gates rejouées sur le résultat du merge dans `base`. Vertes : la livraison se merge sur cette base-là. Sinon (`skipped` : conflit) le verdict devient rouge, et `findings` repart au cook |
| `pass.outdated` | GitHub exige une branche à jour et a refusé le merge : le verdict devient rouge, `findings` repart au cook |
| `pass.waiting` | Verte, sous grant, pas mergée pour l'instant : `base-red`, `machine-saturated`. Elle repart seule |
| `base.checked` | Hors ticket. Les gates jouées sur la base après merge : `sha`, `outcome` (`green`, `red`, ou `skipped` : la base n'a pas de gates), `gates`, `tickets` (les merges que ce contrôle vérifiait) |
| `pass.returned` | Rouge : renvoi `n` sur 2, avec les findings |
| `pass.escalated` | Remontée au chef : `returns-exhausted`, `wrong-base`, `no-gates`, `worktree-lost`, `ci-silent`, `review-unreadable`, `review-unsendable`, `review-refused` |

### Ce que la pass ne garantit pas

- **« Seule la pass merge » n'est pas clos au jalon 1.** Sur la box, le cook et la pass passent par
  le même `gh` : la même identité GitHub. Aucune protection de branche ne peut donc réserver le
  merge à la pass. Ce qui retient un cook de merger est la liste d'outils qui lui sont interdits au
  lancement — de bonne foi. La clôture viendra avec la GitHub App et ses tokens par rôle (jalon 7).
  Ce qu'une protection de branche **peut** garantir dès maintenant : plus aucun push direct sur la
  branche d'intégration (voir « À vérifier avant d'installer »).
- **Les gates jouées sont celles de la branche du cook**, avec les droits du runtime — comme le
  cook lui-même. D'où la règle `judge-modified`.
- **Les gates jugent la branche du cook ; le résultat du merge n'est rejoué avant de merger que si
  la base a avancé sur des fichiers que la livraison touche.** Ce qui reste non garanti :
  - Deux livraisons aux **fichiers disjoints** — ou qui ne se croisent que sur un **chemin commun** —
    peuvent casser la base ensemble (le test de l'une échoue sur le code de l'autre). Ce n'est pas
    empêché : c'est **détecté après merge**, par les gates jouées sur la base, et remonté. Entre le
    merge et ce verdict — une suite de gates — la base peut être rouge sans que personne le sache.
  - Une base rouge **reste rouge** tant que tu ne l'as pas réparée : la pass cesse de merger, elle
    ne défait rien et ne dit pas laquelle des livraisons a tort — le commentaire les nomme toutes.
  - Entre un rejeu vert et l'appel à GitHub, un merge fait **à la main** peut encore se glisser : la
    livraison atterrit alors sur une base que son rejeu n'a pas vue. GitHub ne conditionne le merge
    qu'à la tête de la PR, pas à celle de la base. Ce merge à la main déclenche, lui, un contrôle.
  - Tout cela ne vaut que **sous grant**. Une livraison arrêtée (`no-grant`, `judge-modified`) n'est
    pas rejouée : c'est toi qui la merges, et la base est contrôlée après.
  - Un push direct sur la base, ou une PR hors de tout ticket, **ne déclenche aucun contrôle** : la
    pass ne voit que les merges des tickets du rail.
  - La CI et le reviewer ne sont pas rejoués sur le résultat du merge : seules les gates le sont.
  - **Aucune protection de branche n'est supposée** au-delà de celle de « À vérifier avant
    d'installer » (PR obligatoire, pas de push direct). « Branche à jour exigée » n'est pas requise ;
    si tu l'actives, voir ce même point.
- **Le reviewer est un modèle, du même moteur que le cook.** Il attrape ce que des tests verts ne
  voient pas, pas tout ; et deux Claude peuvent partager le même angle mort. Un reviewer d'un autre
  moteur est au parking de la spec, avec le multi-moteurs.
- **« Sans droit d'écriture » tient à sa liste d'outils**, pas à une clôture du système : il tourne
  sous le compte du runtime, dans le worktree de la livraison.
- **Un diff très long n'est pas relu en entier dans sa consigne** : au-delà de 40 000 octets,
  il lit le reste fichier par fichier, dans leur état livré — sans les lignes supprimées.
- **Le diff et le ticket sont des textes écrits par d'autres** : la consigne les lui donne comme des
  données, mais rien ne garantit qu'un modèle ne se laisse jamais convaincre par ce qu'il relit.
- **Rien n'est nettoyé** : ni les worktrees, ni les branches mergées (#139). Avec plusieurs cooks
  à la fois, c'est le disque qui le paie en premier.

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
sauvegarde il y a 6 h 34 (2026-10-08T03-30-00Z, jusqu'à l'événement 38)

rail       1 pris · 1 en pass · 2 en attente · 1 BLOQUÉ
  #14  pris  prio:1  par box/claude depuis 4 min, sans progrès depuis 4 min, bail encore 26 min  Le rail porte les tickets
  #15  en pass  prio:1  depuis 40 s, cuisiné par box/claude  La station claude
  #18  en attente  prio:2  depuis 2 h 10  La CLI d'état
  #20  en attente  prio:2  attend #15, #18 — depuis 35 min  Le suivi en direct
  #21  BLOQUÉ  -  #17 abandonné (label `fire` retiré) — depuis 3 h 02  L'export du journal

cooks      1 en cours — box/claude : 30 au plus
  #14  14-3f9a01bc  opus / high  cook/14-3f9a01bc dans worktrees/14-3f9a01bc  4 min sur 1 h 00 · 12 tours sur 100 · 184 000 tokens sur 2 000 000 (relevé il y a 20 s) · sans progrès depuis 4 min

derniers événements
  41  2026-10-08T10:04:10.000Z  brigade  #14  ticket.taken  station:box/claude  {"station":"box/claude","leaseUntil":"2026-10-08T10:34:10.000Z"}
  42  2026-10-08T10:04:11.000Z  brigade  #14  cook.launched  runtime  {"run":"14-3f9a01bc",…}
```

| Bloc | Ce qu'il dit |
|---|---|
| `runtime` | En marche, arrêté, ou jamais démarré — **d'après le journal**. Un runtime tué sans préavis y paraît encore en marche : c'est l'**âge du dernier tick** qui le trahit. Au-delà de quelques cadences, le runtime est figé ou mort : `systemctl status brigade@<projet>` |
| `cuisine` | Le « stop » du chef et le disjoncteur, comme `run garde-fous` |
| `sauvegarde` | La dernière sauvegarde réussie : son âge, son nom, et le dernier événement qu'elle porte — lus dans le dernier `backup.completed` du journal. Un échec de sauvegarde n'écrit rien au journal : c'est cet **âge** qui le trahit. `TROP VIEILLE` : il dépasse `BRIGADE_BACKUP_MAX_AGE_HOURS` (48 h par défaut, deux nuits du timer livré). `JAMAIS FAITE` : le journal n'en porte aucune — le timer n'a pas été activé, ou échoue depuis le premier jour. Dans les deux cas : `systemctl status brigade-sauvegarde@<projet>` |
| `rail` | Le décompte par état, puis chaque ticket dans l'ordre de service. Les durées sont comptées jusqu'à l'heure de la commande ; les horodatages exacts sont dans `run rail`. Un ticket pris porte deux durées : depuis la prise, et **sans progrès** — le temps écoulé depuis que sa station a vu son worktree bouger. `COINCE` : son bail est échu et il est encore pris. Un ticket en attente qui ne part pas dit ce qu'il attend ; `BLOQUÉ`, compté à part : ce qu'il attendait a été abandonné, il ne partira pas seul (voir « Le rail ») |
| `cooks` | Combien tournent, et le plafond de la station — celui que tu as réglé, sinon son défaut. Dessous, `MACHINE SATURÉE` si la station se retient, avec ce qui manque. Puis **une ligne par cook** : son ticket, son calibrage, sa branche et son worktree (relatif à `BRIGADE_STATE_DIR`), ce qu'il a consommé face à ses plafonds, et son temps **sans progrès** — celui du rail. Un jugement du manager ou une relecture y figure aussi, sans branche. Les lignes ne sont ni triées ni repliées. La durée est exacte ; tours et tokens sont ceux du dernier relevé, vieux d'une minute au plus — son âge est affiché. Runtime arrêté, un cook encore listé est mort avec lui : le journal le notera au prochain démarrage |
| `derniers événements` | Les quinze derniers, au format de `run journal`, sans les battements ni les relevés que les blocs du dessus résument déjà |

Avec `--suivre`, la commande reste ouverte et ajoute une ligne par événement, à mesure qu'il
s'écrit — un ticket se suit ainsi du rail au verdict. Les relevés des cooks défilent, les
battements non. Ctrl-C pour arrêter.

La commande lit `$BRIGADE_STATE_DIR`, n'écrit jamais, et répond tout de suite pendant que le
runtime et ses cooks tournent. Tout ce qu'elle montre vient du journal : rien n'est calculé ni
gardé ailleurs. Sur un journal écrit par un runtime plus ancien, elle demande de redémarrer le
runtime, qui recalcule ce qui manque.

`BRIGADE_BACKUP_MAX_AGE_HOURS` règle l'âge au-delà duquel la sauvegarde est marquée : un nombre
entier d'heures, 1 au moins, `48` par défaut. Une valeur mal écrite est un refus (code 2), pas un
retour silencieux au défaut. La variable se lit dans l'environnement de **celui qui lance
`status`**, pas dans celui du service : un timer passé en `hourly` appelle par exemple
`BRIGADE_BACKUP_MAX_AGE_HOURS=3 … run status`. La marque ne change pas le code de sortie, et rien
n'alerte hors de `status` : une sauvegarde qui vieillit ne se voit que si quelqu'un regarde.

## Neuf variables, aucun défaut

| Variable | Rôle |
|---|---|
| `BRIGADE_STATE_DIR` | Le répertoire qui contient tout l'état du projet : `log.db`, `lock.db`, et `runs/` pour le flux brut des cooks. Doit être sur un **disque local** — le verrou en dépend. Ce qui en est sauvegardé : voir « Sauvegarder et restaurer » |
| `BRIGADE_PROJECT` | Le nom du projet : un identifiant court choisi par le chef, en minuscules, chiffres et tirets (`brigade`, `thermigo`). Il s'écrit dans chaque événement et dans le nom de l'unité systemd |

| `BRIGADE_GITHUB_REPO` | Le dépôt GitHub dont le projet sert les issues, sous la forme `<owner>/<repo>` (`benomite/brigade`) |
| `BRIGADE_REPO_DIR` | Un clone du dépôt du projet, **réservé à la station** : elle y accroche le worktree de chaque cook. Personne d'autre n'y travaille |
| `BRIGADE_BASE_BRANCH` | La branche d'intégration du projet : d'où part chaque worktree, où vise chaque PR (`v2` pour le pilote) |
| `BRIGADE_MANAGER_MODEL` | Le modèle des jugements du manager : `opus`, `sonnet` ou `haiku`. Exigé même si le manager reste éteint |
| `BRIGADE_MANAGER_EFFORT` | Leur effort : `low`, `medium`, `high`, `xhigh` ou `max`. C'est ton quota : il n'a pas de défaut, pas plus que le calibrage d'un cook |
| `BRIGADE_REVIEWER_MODEL` | Le modèle des relectures du reviewer : `opus`, `sonnet` ou `haiku`. Une relecture par livraison jugée |
| `BRIGADE_REVIEWER_EFFORT` | Leur effort : `low`, `medium`, `high`, `xhigh` ou `max`. Il n'a pas à égaler celui d'un cook : le reviewer ne lit qu'un diff |

L'une des neuf absente, le runtime refuse de démarrer et dit laquelle.

Une variable est facultative, et n'a pas de défaut : `BRIGADE_ROADMAP_ISSUE`, le numéro de l'issue
de roadmap du projet, que le manager ne juge jamais. Absente, rien n'est écarté à ce titre.

Deux autres sont facultatives, et n'ont pas de défaut non plus : `BRIGADE_CEILING_MODEL` et
`BRIGADE_CEILING_EFFORT`, le **plafond de calibrage** jusqu'où le manager peut monter un ticket qui
échoue. Absentes, il ne monte rien. Une valeur inconnue : le runtime refuse de démarrer. Voir « Il
réagit à un échec ».

Une autre est facultative, et vide par défaut : `BRIGADE_COMMON_PATHS`, les **chemins communs** du
projet — ceux qui n'appartiennent à aucun ticket, séparés par des virgules
(`docs/runtime.md,CHANGELOG.md`). Des chemins du dépôt, fichiers ou dossiers, sans motif : sinon le
runtime refuse de démarrer. Ils entrent au journal (`rail.commons`) au démarrage, quand ils
changent : `npm run rail` les lit là, sans la variable. Voir « Les zones de fichiers ».

Neuf réglages ont un défaut :

| Variable | Rôle | Défaut |
|---|---|---|
| `BRIGADE_LEASE_SECONDS` | La durée du bail : le temps qu'un cook garde son ticket sans progrès observable dans son worktree. À tenir au-dessus du délai d'inactivité | `1800` (30 minutes) |
| `BRIGADE_GH_BIN` | Le binaire `gh`. Sert aux tests, qui y mettent un faux ; **jamais posé sur la box** | `gh` |
| `BRIGADE_CLAUDE_BIN` | Le binaire `claude`. Sert aux tests, qui y mettent un faux ; **jamais posé sur la box** | `claude` |
| `BRIGADE_GATES_TIMEOUT_SECONDS` | Le plafond de durée des gates jouées par la pass : au-delà, elles sont arrêtées et rouges | `1800` (30 minutes) |
| `BRIGADE_CI_WAIT_SECONDS` | L'attente tolérée d'une CI qui ne conclut pas, avant que la pass ne remonte au chef | `1800` (30 minutes) |
| `BRIGADE_MAX_SETUPS` | Combien de tickets peuvent être en entrée à la fois — worktree et setup. Un entier, 1 au moins | `4` |
| `BRIGADE_MAX_LOAD_PER_CORE` | La charge moyenne par cœur au-delà de laquelle la station ne prend plus de ticket | `1.5` |
| `BRIGADE_MIN_FREE_MEMORY_MB` | La mémoire disponible, en Mo, sous laquelle elle n'en prend plus. `0` : jamais | `1024` |
| `BRIGADE_MIN_FREE_DISK_MB` | Le disque libre sous `BRIGADE_STATE_DIR`, en Mo, sous lequel elle n'en prend plus. `0` : jamais | `5120` |

Mal écrite, l'une de ces quatre fait **refuser le démarrage**, comme un plafond de garde-fou. Le
plafond de cooks, lui, n'est pas une variable : il se règle à chaud, par `run station -- cooks <N>`
(voir « Plusieurs cooks à la fois »).

## Sauvegarder et restaurer

Le journal est la seule vérité du projet : les projections se recalculent, lui non. **Le perdre,
c'est perdre l'histoire de chaque ticket, les usages de grant et la consommation de chaque cook.**
Le runtime porte donc sa propre sauvegarde ; elle ne dépend d'aucun outil de la machine.

### Ce qui est sauvegardé

| Dans le répertoire d'état | Sauvegardé ? | Pourquoi |
|---|---|---|
| `log.db` — le journal | **oui**, un instantané daté par sauvegarde | c'est la vérité |
| `runs/` — le flux brut des cooks | **oui, en un seul exemplaire** : seuls les flux neufs ou qui ont changé sont recopiés | ils servent au diagnostic. La sauvegarde **n'en retire jamais aucun** : elle grossit comme la source, que rien ne borne aujourd'hui |
| `lock.db` — le verrou | non | il ne contient rien : le verrou est une transaction tenue par le noyau. Il se recrée au démarrage |
| `depot/` — le clone de la station | non | il se reclone |
| `worktrees/` — le worktree de chaque cook | non | ce qui compte d'un cook est poussé à la récolte |

**L'instantané se prend pendant que le runtime tourne**, sans l'arrêter ni le ralentir : c'est
SQLite qui écrit une copie cohérente du journal (`VACUUM INTO`), pas une copie de fichiers. **Ne
sauvegarde jamais `log.db` avec `cp`, `rsync` ou un instantané de disque pendant que le runtime
tourne** : une base ouverte tient en trois fichiers qui ne se correspondent qu'à travers SQLite.

### Sauvegarder

```bash
BRIGADE_STATE_DIR=<répertoire d'état> BRIGADE_BACKUP_DIR=<destination> npm --prefix runtime run sauvegarder
```

```
brigade : sauvegarde 2026-10-08T03-30-00Z — projet « brigade », 4 211 événements jusqu'au n° 4211, 38 flux bruts dont 2 recopiés, dans /srv/sauvegardes/brigade/2026-10-08T03-30-00Z
```

| Variable | Rôle | Défaut |
|---|---|---|
| `BRIGADE_BACKUP_DIR` | La destination. **Une par projet**, et **hors du répertoire d'état** — idéalement sur un autre disque que lui. Elle se déclare, elle ne se devine pas : absente, la sauvegarde refuse (code 2) | aucun |
| `BRIGADE_BACKUP_KEEP` | Le nombre de sauvegardes datées gardées. Les plus anciennes sont retirées **après** la réussite de la nouvelle, jamais avant | `14` |

La destination, après deux nuits :

```
<destination>/2026-10-08T03-30-00Z/log.db           l'instantané du journal
<destination>/2026-10-08T03-30-00Z/manifeste.json   projet, heure, dernier événement, nombre d'événements
<destination>/2026-10-09T03-30-00Z/…
<destination>/runs/                                 les flux bruts, en un exemplaire
```

Une sauvegarde ne prend son nom qu'achevée et relue (`PRAGMA integrity_check`) : interrompue, elle
ne laisse qu'un `.en-cours-…`, retiré au passage suivant. **Chaque réussite est au journal**
(`backup.completed`, écrit au nom de `sauvegarde`, avec le nom de la sauvegarde et le dernier
événement qu'elle porte) : `npm run journal` la montre. Si ce fait ne peut pas s'écrire (journal
tenu, disque de l'état plein), la sauvegarde est faite quand même : la commande le dit, sort en
code 0, et la rotation a lieu. Un échec sort en code 1 et ne s'écrit pas
au journal : il se lit dans `systemctl status brigade-sauvegarde@<projet>`. Un `BRIGADE_STATE_DIR`
qui n'existe pas est un refus (code 2), pas « rien à sauvegarder » : un chemin mal écrit dans le
drop-in ne reste pas vert. **C'est `status` qui montre une sauvegarde qui
ne se fait plus** : sa ligne `sauvegarde` donne l'âge du dernier `backup.completed`, et le marque
`TROP VIEILLE` ou `JAMAIS FAITE` (voir « L'état de la cuisine »). Rien n'alerte hors de cette
commande.

Envoyer la sauvegarde hors de la machine n'est pas le travail de cette commande : `BRIGADE_BACKUP_DIR`
est un chemin. Qu'il soit un disque monté, ou qu'un `rsync` le relaie ailleurs, est un choix
d'installation — la destination, elle, est faite de fichiers fermés, qui se copient sans précaution.

### Restaurer

```bash
BRIGADE_STATE_DIR=<répertoire d'état neuf> npm --prefix runtime run restaurer -- <destination>/<horodatage>
```

La commande vérifie la sauvegarde (base lisible, d'accord avec son manifeste), puis pose `log.db` et
`runs/`. **Elle n'écrase jamais un journal** : si le répertoire d'état en a déjà un, elle refuse
(code 2) — déplace l'ancien état d'abord, **ses trois fichiers** : `log.db`, `log.db-wal`,
`log.db-shm`. Un `-wal` laissé par un runtime tué serait rejoué sur le journal restauré et le
rendrait illisible ; la commande refuse donc dès qu'un seul des trois est là. Les flux bruts vivent
dans `<destination>/runs/`, à côté des sauvegardes datées : une sauvegarde datée copiée seule se
restaure — le journal est complet — et la commande dit combien de flux manquent. Ensuite le runtime se démarre comme d'habitude : il lit
le journal d'un runtime mort sans préavis, écrit `runtime.interrupted`, recalcule ses projections,
et repart. **Le pid et la machine de l'ancien runtime ne le gênent pas** : ils sont dans le journal
(`runtime.started`), pas dans le verrou, et seul un verrou *tenu* fait refuser un démarrage.

**Ce qu'une restauration ne rend pas :**

- **Ce qui s'est passé depuis la sauvegarde** — un jour au plus, à la cadence par défaut. Le rail se
  recale seul sur GitHub au premier sondage (issues fermées, labels retirés). Les usages de grant et
  les relevés de cette fenêtre sont perdus : les merges, eux, restent lisibles sur GitHub.
- **Les worktrees.** Un cook qui tournait est noté `cook.interrupted` et son ticket est repris par
  un cook neuf ; **son travail non commité est perdu**. Un ticket **en pass** retrouve son état,
  mais plus son worktree : la pass ne peut pas le rejuger, et **il se finit à la main** — merge sa
  PR (la pass le voit et sert le ticket) ou retire `fire`. Une livraison que la pass n'avait pas
  encore jugée est remontée au chef sous le motif `worktree-lost`, sauf si sa PR est déjà mergée ou
  fermée. Un
  ticket renvoyé repart avec un cook neuf, dans un worktree neuf.
- **Le clone de la station, la connexion Max, `gh`, la configuration git du compte** : ce ne sont
  pas des états du runtime. Ils se refont à l'installation.

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
livraison est relue par un vrai reviewer, sur le même quota — et si
le grant `merge` est actif dans ce répertoire d'état, la pass **merge** ce qu'elle juge vert. Et si
le manager y est allumé, il juge **toutes** les issues ouvertes du dépôt, y pose des labels et les
commente — et **découpe ses épiques : il crée des issues**, et réécrit la liste que l'épique en
porte.

### Regarder le rail sans rien lancer

Pour regarder le rail et les autres commandes du chef sans laisser la station prendre de tickets,
tu dois arrêter la cuisine. **La première fois, fais-le en deux étapes.**

1. Démarre une première fois et laisse le runtime tourner quelques secondes, le temps qu'il crée le
   journal (`log.db`). Ctrl-C pour l'arrêter : c'est bon, le journal existe maintenant.
2. Redémarre, puis arrête la cuisine tout de suite : `npm --prefix runtime run garde-fous -- stop`.
   La cuisine le reste d'un démarrage à l'autre.

**Pourquoi deux démarrages ?** Le journal n'existe qu'après le premier lancement du runtime. La
commande `garde-fous -- stop` le lit, et elle échouerait sur un répertoire d'état vierge.

**Le risque du premier démarrage.** Aucun cook ne se lance sans ticket portant le label `fire`.
Tant que tu n'en poses pas, le runtime tourne sans rien faire : il sonde le dépôt et laisse la
station dormir.

| Besoin | Commande |
|---|---|
| Tests | `npm --prefix runtime test` — sur un clone nu, sans rien installer |
| Contrôle de types | `npm --prefix runtime run typecheck` — après le setup de worktree |

Les tests n'utilisent jamais `BRIGADE_STATE_DIR` : chacun crée son répertoire temporaire, et les
process qu'ils lancent ne reçoivent que l'environnement qu'ils leur donnent. Ils ne touchent jamais
le réseau ni le quota : `gh` et `claude` y sont des faux, et `git` n'y parle qu'à des dépôts locaux.

Deux suites jouées en même temps — sur deux worktrees, ou sur le même — ne se gênent pas : elles ne
partagent ni chemin, ni port, ni nom de process. Elles se ralentissent, c'est tout ; aucun test ne
court contre l'horloge, et un test bloqué est arrêté au bout de deux minutes. Ne tue jamais un
process par son nom (`pkill -f src/main.ts`) : tu arrêterais aussi les runtimes d'essai des autres
worktrees.

Un test qui attend sans fin est mis en échec au bout de deux minutes (`--test-timeout`), et le
process de son fichier sort dès ses tests finis, même s'il tient encore un minuteur ou un process
enfant (`--test-force-exit`) : la suite se termine, rouge, et nomme le test. Sans cette seconde
option, le test était bien marqué en échec, mais son fichier ne sortait jamais — et les gates avec
lui.

Un test bloqué dans du code synchrone (une boucle) échappe à ces deux options : la boucle
d'événements de son process ne tourne plus, aucun minuteur ne s'y déclenche, et tuer le lanceur ne
tue pas le process du fichier. C'est la **garde d'horloge** de `gates.sh` qui le rattrape : la suite
part dans son propre groupe de process, et passé 300 s sans qu'elle rende la main, le groupe entier
est tué et les gates rougissent — `FAIL  tests du runtime arrêtés par la garde d'horloge : plus de
300 s sans rendre la main`. Le délai est large à dessein : il doit tomber après les deux minutes du
lanceur, qui, lui, nomme le test. La garde ne le nomme pas ; la sortie gardée dans
`.brigade-state/gates/` dit jusqu'où la suite était allée. Le délai se règle par
`BRIGADE_GATES_DELAI_TESTS`, en secondes entières ; une valeur illisible rougit sans jouer la suite.
La garde appartient aux gates : un `npm --prefix runtime test` lancé à la main reste retenu, et se
tue par son pid.

Un cas reste hors de portée : un process qu'un test a lancé sans le tuer en fin de test, qui survit
à la suite sans la retenir.

Quand les gates (`.claude/brigade/gates.sh`) trouvent un test en échec, elles impriment son nom et
son erreur, et gardent la sortie entière de la suite dans `.brigade-state/gates/` du worktree — le
chemin est imprimé. C'est là que se lit un échec qui ne se reproduit pas.

**Les gates ont un plafond de durée : 75 s de processeur.** Il est déclaré dans les bindings du
`CLAUDE.md` (`- **Plafond des gates** : `75 s` de processeur`), et c'est `gates.sh` qui le lit et le
juge. Chaque passage finit par ce qu'il a coûté :

```
ok    durée des gates : 50,9 s de processeur, 8 s d'horloge (plafond : 75 s de processeur)
```

Au-delà du plafond, les gates sont rouges, et disent de combien :

```
durée des gates : 90,0 s de processeur pour un plafond de 75 s — 15,0 s de trop (+20 %)
FAIL  plafond des gates franchi : plus de 75 s de processeur
```

Le compte est celui du **temps processeur** du passage — `gates.sh` et tout ce qu'il a lancé puis
attendu —, pas celui de l'horloge. Quatre gates de front font passer la durée murale de chacune de
8 à 32 s, et son temps processeur de 51 à 59 s seulement (mesuré le 2026-10-09) : le plafond dit ce
que la suite coûte, pas ce que la machine faisait à ce moment-là, et il ne rougit pas parce que
trois autres cooks jouent leurs gates. Le sixième que la charge ajoute tout de même est dans la
marge : 59 s pour un plafond de 75. Deux limites en découlent, à connaître :

- un test qui **attend** (un `sleep`, un vrai délai) ne consomme rien et passe sous le plafond —
  c'est la règle « aucun test ne court contre l'horloge » qui le tient, pas celle-ci ;
- le chiffre dépend de la machine : un processeur plus lent compte plus de secondes pour le même
  travail. Le plafond se règle là où les gates tournent.

Un plafond franchi se traite en allégeant la suite, ou en relevant le binding dans la même PR, le
chiffre mesuré à l'appui. Sans la ligne dans les bindings, rien n'est plafonné ; une ligne présente
mais illisible rend les gates rouges, plutôt que de passer pour une absence. À ne pas confondre avec
`BRIGADE_GATES_TIMEOUT_SECONDS`, le délai au bout duquel la pass *arrête* des gates qui ne
reviennent pas (30 minutes) : celui-là est un garde-fou d'horloge, pas un budget.

## Sur la parade-box

**La voie de déploiement est une unité systemd sur l'hôte**, une instance par projet — pas un
conteneur. Elle est choisie pour brigade, pas héritée de la box :

- Le runtime n'a **rien à isoler de lui-même** : aucune dépendance à l'exécution, aucun build, aucun
  port. Un conteneur n'y ajouterait qu'une couche à tenir à jour.
- Il a **besoin de l'hôte** : la connexion Max du compte, que `claude` lit là où il l'a posée, `gh`
  connecté, `git` qui pousse. Un conteneur les ferait monter un par un.
- Le verrou par projet réclame un **disque local** : `StateDirectory=` le donne, sans volume à
  déclarer.
- Le serveur devient celui de brigade seul (#67) : la cohabitation de services qui justifiait Docker
  sur la parade-box disparaît avec eux. **Cette voie ne demande aucun changement à la parade-box**,
  et la sauvegarde ne doit rien à la sienne (`scripts/backup.sh`), qui s'arrêtera avec elle.

Le conteneur **par projet** du jalon 7 — l'isolation des cooks — reste une question ouverte, et
distincte.

Les fichiers d'unité sont versionnés dans `runtime/deploy/` : `brigade@.service` pour le runtime,
`brigade-sauvegarde@.service` et `brigade-sauvegarde@.timer` pour sa sauvegarde.

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

   **C'est la seule protection que le runtime suppose.** « Branche à jour exigée »
   (`required_status_checks.strict`) n'est **pas** requise : la pass regarde elle-même ce que la
   base est devenue avant de merger (voir « Quand la base a avancé sous une livraison »). Si tu
   l'actives quand même, GitHub refusera le merge d'une branche en retard ; ce refus-là n'arrête pas
   la pass (`pass.outdated`) : il repart au cook comme un finding, avec la consigne de rebaser, et
   consomme un renvoi — soit un cook par merge d'un voisin. Tout autre refus reste un arrêt
   (`merge-refused`).

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

Le dépôt GitHub, sa branche d'intégration et le calibrage du manager, eux, sont propres à chaque
projet : ils se posent dans un drop-in de **l'instance**.

```bash
sudo systemctl edit brigade@<projet>.service
```

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

### Installer la sauvegarde

**À faire avant de compter sur le runtime** : tant que ce timer ne tourne pas, rien ne sauvegarde
le journal. Voir « Sauvegarder et restaurer » pour ce qu'elle garde.

```bash
sudo cp /opt/brigade/runtime/deploy/brigade-sauvegarde@.service /opt/brigade/runtime/deploy/brigade-sauvegarde@.timer /etc/systemd/system/
sudo systemctl daemon-reload
sudo install -d -o <compte> <destination>
sudo systemctl edit brigade-sauvegarde@<projet>.service
```

```ini
[Service]
Environment=BRIGADE_BACKUP_DIR=<destination>
```

La destination est **propre au projet** et **hors de `/var/lib/brigade/<projet>`** — sur un autre
disque si la machine en a un. Sans ce drop-in, la sauvegarde refuse (code 2) et
`systemctl status brigade-sauvegarde@<projet>` dit pourquoi.

Les deux unités ne partagent pas leurs drop-ins : si tu as réglé `User=` ou `ExecStart=` pour
`brigade@.service`, règle-les aussi pour la sauvegarde (`sudo systemctl edit
brigade-sauvegarde@.service`, avec `node src/sauvegarder.ts`). Son environnement ne porte ni clé ni
jeton, et n'a pas à en porter : elle ne lance ni `claude` ni `gh`.

```bash
sudo systemctl enable --now brigade-sauvegarde@<projet>.timer   # chaque nuit à 03:30
sudo systemctl start brigade-sauvegarde@<projet>.service        # une première, tout de suite
```

Une sauvegarde manquée — machine éteinte à 03:30 — est jouée au démarrage suivant. Pour une autre
cadence, `sudo systemctl edit brigade-sauvegarde@<projet>.timer` :

```ini
[Timer]
OnCalendar=
OnCalendar=hourly
```

### Restaurer sur une machine neuve

1. Installer comme ci-dessus (« À vérifier avant d'installer », « Installer »), **sans démarrer le
   service**, et rapatrier la destination de sauvegarde sur la machine — **entière** : la sauvegarde
   datée et `runs/`.
2. Créer le répertoire d'état et y restaurer la dernière sauvegarde :

   ```bash
   sudo install -d -o <compte> /var/lib/brigade/<projet>
   sudo -u <compte> BRIGADE_STATE_DIR=/var/lib/brigade/<projet> npm --prefix /opt/brigade/runtime run restaurer -- <destination>/<horodatage>
   ```

3. Recloner le dépôt de la station (`/var/lib/brigade/<projet>/depot`, voir « Installer »).
4. `sudo systemctl start brigade@<projet>` : le journal montre un `runtime.interrupted` puis un
   `runtime.started`, et les tickets servis avant l'incident se relisent.
5. Remettre le timer de sauvegarde en route — une sauvegarde ne contient pas le fait de sa propre
   réussite, donc `status` montre ici la précédente, ou `JAMAIS FAITE` — et finir à la main les
   tickets qui étaient en pass (voir « Ce qu'une restauration ne rend pas »).

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
| Voir la station : plafond, machine, connexion, quota, cooks et leur calibrage | `sudo -u <compte> BRIGADE_STATE_DIR=/var/lib/brigade/<projet> npm --prefix /opt/brigade/runtime run station` |
| Régler le plafond de cooks, à chaud | `sudo -u <compte> BRIGADE_STATE_DIR=/var/lib/brigade/<projet> npm --prefix /opt/brigade/runtime run station -- cooks <N>` (`0` : aucune limite) |
| Voir les garde-fous, « stop », « reprendre » | `sudo -u <compte> BRIGADE_STATE_DIR=/var/lib/brigade/<projet> npm --prefix /opt/brigade/runtime run garde-fous -- [stop \| reprendre]` |
| Voir la pass : phases, verdicts, renvois | `sudo -u <compte> BRIGADE_STATE_DIR=/var/lib/brigade/<projet> npm --prefix /opt/brigade/runtime run pass -- [<ticket>]` |
| Voir le grant `merge`, l'activer, le révoquer | `sudo -u <compte> BRIGADE_STATE_DIR=/var/lib/brigade/<projet> npm --prefix /opt/brigade/runtime run grant -- [activer merge \| revoquer merge]` |
| Voir le manager et ses décisions, l'allumer, l'éteindre | `sudo -u <compte> BRIGADE_STATE_DIR=/var/lib/brigade/<projet> npm --prefix /opt/brigade/runtime run manager -- [allumer \| eteindre \| rendre <n°>]` |
| Mettre à jour | `sudo git -C /opt/brigade pull`, puis `sudo systemctl restart brigade@<projet>` |
| Sauvegarder tout de suite | `sudo systemctl start brigade-sauvegarde@<projet>.service` |
| Voir la dernière sauvegarde, et la prochaine | la ligne `sauvegarde` de `status` ; `systemctl status brigade-sauvegarde@<projet>.service`, `systemctl list-timers 'brigade-sauvegarde@*'` |

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
   `sudo -u <compte> BRIGADE_STATE_DIR=/var/lib/brigade/brigade BRIGADE_PROJECT=brigade BRIGADE_GITHUB_REPO=benomite/brigade BRIGADE_REPO_DIR=/var/lib/brigade/brigade/depot BRIGADE_BASE_BRANCH=v2 BRIGADE_MANAGER_MODEL=sonnet BRIGADE_MANAGER_EFFORT=medium BRIGADE_REVIEWER_MODEL=sonnet BRIGADE_REVIEWER_EFFORT=medium npm --prefix /opt/brigade/runtime start`.
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
   changé. Dans `runs/<run>.jsonl`, chercher la ligne `"subtype":"init"` : elle porte `"skills":[]`,
   `"mcp_servers":[]`, `"slash_commands":[]`, trois plugins `builtin` (`cc-plugin-agents-md`,
   `cc-plugin-telemetry`, `cc-plugin-diff`), aucun plugin du compte (chaque plugin a `"path":"builtin"`),
   et le `model` calibré ; le premier appel d'outil du cook est `gh issue view`.
d. Pendant un autre cook, `G -- stop` : il s'arrête dans la seconde, `R` montre son ticket en
   attente, et rien n'est poussé. `G -- reprendre` : un cook neuf repart.
e. Pendant un cook, `sudo systemctl restart brigade@brigade` : `J <numéro>` montre un
   `cook.interrupted`, puis un second `cook.launched`.

**La pass et le grant.** `V` désigne la commande « Voir la pass », `M` la commande « Voir le grant
`merge` ». Ces étapes consomment du quota Max (un cook par ticket, plus un par renvoi).

Avant de commencer, `M` montre le grant **absent**. Mise à jour depuis un runtime d'avant le
reviewer : sans `BRIGADE_REVIEWER_MODEL` et `BRIGADE_REVIEWER_EFFORT` dans le drop-in de l'instance,
le service refuse de démarrer et `systemctl status` nomme la variable. Ces étapes consomment du
quota Max : un cook par ticket, et **une relecture par livraison aux gates vertes**.

f. Reprendre le ticket de l'étape c, en pass. Dans la minute qui suit sa livraison, `V` le montre
   **arrêté — vert, non mergé (`no-grant`)**, l'issue porte le commentaire de la pass, et la PR est
   toujours ouverte. `V <numéro>` montre le verdict : gates vertes, « CI aucun check » (ce dépôt
   n'a pas de CI), « reviewer rien de bloquant », et au-dessus la relecture, son résumé, ses
   remarques. L'issue porte un commentaire « Reviewer — … » avec son calibrage et ses tokens ;
   `J` montre, hors ticket, le `cook.launched` de la relecture (station `reviewer`, ton calibrage)
   et son `cook.exited`.
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

**Le reviewer.** Ces étapes consomment du quota Max.

k1. **Un constat bloquant.** Poser `fire` sur une issue dont un critère d'acceptation se vérifie à
   la lecture et pas par un test (« ajoute la fonction `f`, et documente-la dans `docs/` »), et dont
   le cook risque d'oublier la moitié. Si le reviewer trouve le manque : `V <numéro>` montre
   « ROUGE — gates vertes · … · reviewer 1 constat bloquant », l'issue porte le constat, et un
   second cook part avec lui. S'il ne trouve rien, c'est vert : l'étape ne se force pas — garder le
   `runs/review-<numéro>-….jsonl` pour juger de la consigne.
k2. **Un ticket sans diff.** Poser `fire` sur une issue d'analyse, calibrée (« explique en dix
   lignes pourquoi les gates jouent le contrôle de types après les tests — ne modifie aucun
   fichier »), **grant révoqué**. Le cook fini : son commentaire dit « fini, sans diff », aucune PR
   n'est ouverte. Dans les minutes qui suivent : un commentaire « Reviewer — … · ticket sans
   diff », puis « Pass — verte, servie sans merge » ; l'issue est fermée, `R` ne la montre plus,
   `V <numéro>` montre « ticket sans diff, ni gates ni CI » et un `pass.served`.
k3. **Jamais servi sans relecture.** Sur une seconde issue d'analyse : `G -- stop` **juste après**
   le commentaire « fini, sans diff » du cook, avant celui du reviewer. `V` montre « jugement en
   cours » aussi longtemps que la cuisine est arrêtée, et l'issue reste ouverte. `G -- reprendre` :
   elle est relue, puis servie.

**La sauvegarde.** `B` désigne `<destination>`, le `BRIGADE_BACKUP_DIR` du drop-in. Ces étapes ne
consomment aucun quota.

l. Pendant que le service tourne, `sudo systemctl start brigade-sauvegarde@brigade.service` : `B`
   porte un répertoire daté (`log.db`, `manifeste.json`) et `runs/` ; `J` montre un
   `backup.completed` écrit par `sauvegarde` ; le runtime n'a pas été arrêté (`S` : même pid).
m. `systemctl list-timers 'brigade-sauvegarde@*'` montre la prochaine à 03:30.
n. **Restauration, sans toucher à l'état du service** : `sudo -u <compte>
   BRIGADE_STATE_DIR=/tmp/brigade-essai npm --prefix /opt/brigade/runtime run restaurer --
   B/<horodatage>`, puis `J` sur `/tmp/brigade-essai` : les tickets servis, les `grant.used` et les
   `cook.exited` d'avant la sauvegarde y sont. Rejouer la même commande : elle refuse, le
   répertoire a déjà un journal. Supprimer `/tmp/brigade-essai`.
o. Retirer la ligne `BRIGADE_BACKUP_DIR` du drop-in, puis `start` de la sauvegarde : elle échoue,
   et `systemctl status brigade-sauvegarde@brigade` nomme la variable. Remettre la ligne.

**La fiche du ticket.** Ces étapes ne lancent aucun cook tant que la fiche est illisible.

p. Sur une issue calibrée, **avant** de poser `fire`, ajouter un commentaire :
   `<!-- brigade:fiche -->`, puis `- attend : #<une issue ouverte, sans fire>` et `- budget : 40`. Poser
   `fire`. Dans les deux minutes, `R` montre le ticket **86** (`unreadable-card`) avec sa fiche et
   « FICHE ILLISIBLE — clé inconnue « budget » », l'issue porte un commentaire de la station qui
   le dit, et `J <numéro>` ne montre aucun `cook.launched`.
q. Éditer le commentaire dans l'interface de GitHub pour retirer la ligne `budget`. Dans les deux
   minutes, `J <numéro>` montre un `ticket.changed` puis un `ticket.released` (`card-readable`), et
   `R` montre le ticket **en attente**, « attend #<l'issue> » : il n'est pas pris tant qu'elle
   n'est pas servie.

**Les dépendances.** `X` désigne le ticket attendu, `Y` celui qui l'attend : deux issues calibrées,
`Y` plus ancienne ou plus prioritaire que `X`. Ces étapes consomment du quota Max — un cook par
ticket.

q1. Fiche de `Y` : `- attend : #X`. Poser `fire` sur les deux. `R` et `S` montrent `Y` en attente,
    « attend #X », et c'est `X` qui est pris, bien que `Y` passe devant dans l'ordre.
q2. `sudo systemctl restart brigade@brigade` pendant que `X` cuit : `R` montre toujours
    « attend #X ». Une fois `X` **servi** (mergé par la pass), `Y` est pris dans la minute, sans
    aucun geste.
q3. Sur un autre couple, retirer `fire` de `X` avant qu'il soit servi : dans les deux minutes, `R`
    montre `Y` **BLOQUÉ**, « #X abandonné (label `fire` retiré) », `S` le compte à part, l'issue de
    `Y` porte un commentaire « Rail — ticket bloqué », `J <Y>` un `ticket.blocked` — un seul, même
    après dix minutes. Reposer `fire` sur `X` : `Y` revient à « attend #X ».
q4. Fiche de `X` : `- attend : #Y` — un cycle. Dans les deux minutes, `R` montre sous chacun
    « FICHE ILLISIBLE — attend : cycle de dépendances — » suivi des deux numéros, les deux passent 86
    (`unreadable-card`) avec un commentaire de la station qui nomme le cycle, et aucun cook ne part.
    Retirer la ligne de `X` : les deux reviennent en attente.

**Le manager.** `N` désigne la commande « Voir le manager ». Ces étapes consomment du quota Max :
un jugement par issue, puis un cook par ticket lancé. **Avant de commencer, pose
`blocked-on-human` sur toute issue ouverte qui ne doit pas partir** — allumé, le manager juge tout
le backlog. **Et colle `<!-- brigade:tickets -->` dans le corps de toute épique déjà découpée à la
main** : sans cela il la découpe, et crée des doublons de ses tickets.

Avant de commencer, `N` montre le manager **éteint — jamais allumé**. Mise à jour depuis un runtime
d'avant le manager : sans `BRIGADE_MANAGER_MODEL` et `BRIGADE_MANAGER_EFFORT` dans le drop-in de
l'instance, le service refuse de démarrer et `systemctl status` nomme la variable.

r. Ouvrir une issue courte en langage produit (un correctif de doc), **sans aucun label**. Attendre
   deux minutes : rien ne s'y passe, `J <numéro>` ne montre rien — le manager est éteint.
s. `N -- allumer`, sans redémarrer. Dans les deux minutes : l'issue porte `fire`, `model:` et
   `effort:`, et un commentaire du manager qui justifie le calibrage ; `J <numéro>` montre
   `manager.judged`, `manager.labeled`, `manager.commented` ; `J` montre, hors ticket, le
   `cook.launched` du jugement (station `manager`, ton calibrage) et son `cook.exited` avec ses
   tokens. Dans la minute qui suit, `R` montre le ticket et un cook part.
t. `J` montre aussi un `manager.set-aside` pour chaque issue retenue (`blocked-on-human`) et pour
   la roadmap — et **aucun** jugement pour elles.
u. Ouvrir une issue à laquelle il manque de quoi partir (« rendre le rail plus fiable », sans
   critère). Dans les deux minutes : aucun label, un commentaire « pas un ticket exécutable » avec
   son motif, `R` ne la montre pas. Attendre cinq minutes : aucun second commentaire, `J` aucun
   second jugement.
v. Y répondre en commentaire (« je la réduis à… ») : dans les deux minutes, un second jugement.
w. Sur le ticket de l'étape s, une fois servi ou non : remplacer son label `model:` par un autre.
   Attendre deux minutes : le manager ne l'a pas réécrit. Sur une issue lancée par lui et pas encore
   prise, retirer `fire` : il ne le repose pas, `J <numéro>` montre un `manager.set-aside`
   (`chef-changed`), un commentaire du manager dit ce qui a été retiré et donne la commande, et `N`
   la montre sous « écartées ». Puis `N -- rendre <numéro>` : dans les deux minutes, `J <numéro>`
   montre `manager.handed-back`, `manager.withdrew`, un second `manager.judged`, et l'issue porte de
   nouveau `fire` et un calibrage. Corriger son `prio:` ensuite : rien ne bouge.
x. Poser `fire` à la main sur une issue qui porte `question` : `fire` reste, aucun calibrage n'est
   posé, un commentaire du manager le dit, `R` la montre 86 (`no-calibration`). Retirer `fire`.
y. `G -- stop`, puis ouvrir une issue sans label : aucun jugement tant que la cuisine est arrêtée.
   `G -- reprendre` : elle est jugée dans les deux minutes.
z. `N -- eteindre` : `N` le montre éteint, une issue neuve n'est plus jugée, et ce qui était posé
   le reste.

**Le découpage.** Manager allumé. Ces étapes créent de vraies issues et lancent de vrais cooks :
prendre une épique petite, de deux ou trois livrables de doc.

d1. Ouvrir une épique en langage produit, avec ses critères d'acceptation, **sans aucun label**.
    Dans les cinq minutes : des tickets existent, chacun avec `Épique : #N` en tête, ses critères,
    `model:`, `effort:`, une fiche en commentaire, et `fire` ; l'épique porte un commentaire du
    manager (pourquoi ces tickets, pourquoi cet ordre) et, à la fin de son corps, la liste de ses
    tickets. `J <épique>` montre `manager.judged`, `manager.split`, puis les `split-creating` ;
    `J <ticket>` montre `manager.split-created` et `manager.split-fired`, et **aucun**
    `manager.judged`. `N` montre l'épique « découpée, 0/N servi ».
d2. `R` montre les tickets : le premier part, ceux qui l'attendent sont « en attente — attend #… ».
    À mesure qu'ils sont servis, la liste de l'épique change d'elle-même, sans que tu y touches ;
    ce que tu avais écrit au-dessus n'a pas bougé.
d3. Attendre dix minutes, puis éditer le corps de l'épique (hors de la liste), puis `restart` :
    aucun ticket de plus, `J` aucun second `manager.split`.
d4. Fermer un ticket pas encore servi : il ne renaît pas, la liste le dit « abandonné », et dit
    « bloqué » de ceux qui l'attendaient.
d5. Ouvrir une issue dont le corps commence par `Épique : #N` : dans les deux minutes elle entre
    dans la liste de l'épique, et elle est jugée comme une issue ordinaire.
d6. Ouvrir une épique volontairement vague (« que ce soit plus rapide »), label `epic` : aucun
    ticket, un commentaire du manager qui pose **une** question, `N` la montre « QUESTION POSÉE ».
    Pendant ce temps, une issue ordinaire ouverte à côté est jugée et lancée. Répondre en
    commentaire : l'épique est relue dans les deux minutes.
d7. Sur une épique découpée à la main, coller `<!-- brigade:tickets -->` dans le corps avant
    d'allumer : `J <épique>` montre `manager.set-aside` (`already-split`), aucun ticket n'est créé.

**Ce qui ne se provoque pas à la demande.**

- **Le quota épuisé.** La forme du flux d'un vrai 86 n'a jamais été observée : la reconnaître
  repose sur une transposition (`runtime/test/aides/flux/LISEZMOI.md`). Au premier 86 réel, `P`
  doit montrer « 86 » avec une heure de retour, et `R` le ticket 86. Si à la place un cook est noté
  « échoué » alors que le quota était épuisé, garder son `runs/<run>.jsonl` : c'est le flux qui
  manque aux tests.
- **La connexion expirée.** Même réserve : c'est le flux d'une machine **sans** session qui a été
  enregistré. Pour l'éprouver, `sudo -u <compte> claude auth logout`, puis `restart` : `P` montre la
  connexion expirée et plus aucun ticket n'est pris. `claude /login`, puis `G -- reprendre`.
