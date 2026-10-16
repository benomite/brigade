# La station : la livraison, le refus et la connexion Max

Page du [runtime de la V2](README.md) ; l'index dit où trouver le reste.

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

Elle montre le plafond, la machine — ou, pour une station distante, sa **présence** —, la connexion Max, le quota, la `retenue`, les cooks en cours
avec leur calibrage, les dix derniers finis, et **`consommé`** — tout ce que le projet a lancé,
cooks, relectures et jugements : ce qui tourne, les **5 dernières heures** (la fenêtre du quota
Max, à comparer à `/usage` en ordre de grandeur) et les **24 dernières heures**.
Cette consommation est celle de **ce que le projet a lancé**, pas celle du compte : le runtime ne
voit ni les sessions du chef ni rien d'autre qui puise dans le même abonnement. `/usage`, dans une
session, reste la mesure de vérité du compte ; le runtime ne la remplace pas.

| Événement | Sens |
|---|---|
| `station.announced` | Une station que le projet déclare se présente : moteur, ce qu'elle fournit, plafond de cooks déclaré, et `remote: true` si elle est distante (hors ticket) |
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

