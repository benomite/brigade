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
parmi les cooks lancés **après le dernier qui a réussi**, depuis ton dernier « resume ». La
livraison d'une relance du manager ne vaut réussite que jugée verte. Si les trois derniers lancés
échouent, il s'ouvre, quel que soit le nombre de réussites avant. Les plafonds restent **par cook**.

### Voir et commander

```bash
npm --prefix runtime run guardrails             # l'état
npm --prefix runtime run guardrails -- stop     # arrête tout
npm --prefix runtime run guardrails -- resume   # rouvre la cuisine, referme le disjoncteur
```

« stop » et « resume » s'écrivent au journal au nom du `chef` ; le runtime les voit en une
seconde. L'état montre `caps per ticket`, `kitchen`, `breaker`, `cooks running` et `latest guardrail stops`.

Ce que `guardrails` écrit — état, `stop`, `resume`, refus, erreurs — est **en anglais** (mots de `docs/glossary.md`) : `kitchen already stopped since …`, `nothing to resume: the kitchen is open and the breaker closed`. `reprendre` répond encore, en disant `resume` (jusqu'au 2027-01-14).

### La pause du renommage du code

Avant de partir, un renommage du code demande ton accord par **une carte de ta file**
(`runtime/src/pause/pause.ts`, `demanderPause`) : combien de temps la cuisine sera en pause, et
quels tickets en vol elle retiendra — pris (son cook finit son travail, puis sa livraison attend)
ou en pass (son merge attend).

```bash
npm --prefix runtime run guardrails -- pause yes   # « oui » : la pause tient
npm --prefix runtime run guardrails -- pause no    # « non » : la carte quitte la file ; la pause acceptée, elle est levée ; la carte d'un renommage échoué, lue, est ôtée
```

- **Sans ton « oui », rien ne change** : la pass merge, les stations prennent.
- **Après ton « oui »**, et jusqu'à la fin de la pause : la pass juge encore, mais une livraison
  verte **attend** au lieu d'être mergée (`pass.waiting`, motif `paused`) ; `rail merge` est
  refusé ; les stations ne prennent plus de ticket (`station.held`, motif `paused`). Seul le ticket
  du renommage, s'il en a un, part en cuisine et se merge. Un merge déjà parti vers GitHub avant
  le « oui » n'est pas rattrapé.
- **La file le dit en une ligne**, sous la tête du bloc `awaiting`, sans compter pour une
  décision : `paused for the code rename — for …, expected about … min — finishing their work: #12 · held: #14`.
  `status` dit `kitchen PAUSED for the code rename`.
- **La pause finit** quand le renommage la lève (`leverPause`), ou sur ton « non ». La cuisine
  repart seule : chaque livraison retenue est reprise par la pass, rejugée si la base a bougé.

**Le renommage lui-même** (`runtime/src/pause/renommage.ts`) part sur ton « oui », et sur lui
seul :

1. Le runtime prépare une branche sur la tête de `v2` qu'il vient de rapatrier, y joue
   `scripts/rename-code/rename.sh --apply` (#1039) après le setup du worktree, commite l'arbre
   renommé, le pousse et ouvre sa PR.
2. Il la remet à la pass, hors du rail, comme la livraison du carnet. Elle est jugée comme toute
   livraison : la fusion avec la base, les gates, le reviewer et la CI. Verte, elle est mergée
   sous grant dans la même pause. C'est la seule PR que la pause laisse passer.
3. Mergée, la pause est levée et la cuisine repart.

En cas d'échec, **rien n'est mergé**, et la pause est levée sans geste de ta part. Les échecs
possibles : l'outil, le setup, des gates rouges, un conflit avec `v2`, une pass qui ne juge pas
ou s'arrête avant le merge, une PR fermée. La file garde alors une carte, `rename`, qui dit
pourquoi et donne la PR restée ouverte. `pause no` l'ôte une fois lue.

Sans grant `merge` actif, rien ne part : la pass ne mergerait pas le renommage.

La pause dure **moins d'une heure** : passé 55 minutes depuis ton « oui » (`LIMITE_DU_RENOMMAGE_MS`),
l'outil est arrêté s'il tourne encore, et la pause est levée de même. Seule exception : un merge
déjà parti vers GitHub, dont on attend le sort. Ton « non » sur la pause en vigueur abandonne de
même le renommage. Une PR de renommage abandonnée n'est jamais mergée par la pass, même une fois
la pause levée : elle remonte sans merge (`pass.escalated`, cause `rename-abandoned`).

Au journal, hors ticket : `pause.requested` (`ticket` du renommage ou nul, `minutes`, `inFlight`),
`pause.agreed`, `pause.declined`, `pause.released` (`why` ; et, levée par le renommage, `outcome`
— `merged` ou `failed` — avec la `cause` d'un échec), `pause.dismissed`, `rename.started`
(`run`, `branch`, `base`, `deadline`) et `rename.delivered` (`pr`, `number`, `sha`). Chacun nomme
sa demande (`request`).

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
| `breaker.opened`, `kitchen.stopped`, `kitchen.resumed` | Le disjoncteur s'ouvre ; « stop », « resume » (hors ticket) |

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

