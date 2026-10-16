# L'état de la cuisine et les mesures

Page du [runtime de la V2](../runtime.md) ; l'index dit où trouver le reste.

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
| `rail` | Chaque ticket, dans l'ordre de service : `ticket`, `etat`, `titre`, `url` (son issue), `activite` — ce que la cuisine en fait en ce moment : `fait` (le geste, en mots du chef), `cible` (le fichier ou la commande qu'il vise, `null` s'il n'en vise pas), `depuis` (l'heure où elle s'y est mise). **`null` pour un ticket ni pris ni en pass, et pour celui dont le runtime ne sait pas ce qu'on en fait.** Voir « Ce que fait un cook en ce moment » ; `attente` — pour un ticket mis de côté (86), **ce qu'il attend** : `raison` en clair (`attend : setup du projet impossible`, `attend : quota du compte épuisé`, `attend : worktree impossible à préparer`…), `colonne` (celle où il est, comme `etat`) et `retour` (l'heure de son retour, `null` sans) ; `null` pour tout autre ticket ; `tiers` — pour un ticket en WAITING (`etat` : `WAITING`), **ce qu'il attend d'un tiers** : `quoi` (dans les mots du chef), `qui`, `depuis` (sa mise en attente), `relance` (quand y revenir) et `aLArrivee` (ce que « c'est arrivé » fera de lui, en clair) ; `null` pour tout autre ticket ; `revenu` — pour un ticket revenu de WAITING dans TODO, **pourquoi**, dans les mots du runtime : `relance du 21/10 : pas de réponse` ou `nouveau sur l'issue — de <qui>` ; `null` pour tout autre, et pour un ticket que le chef a repris lui-même |
| `cooks` | Les cooks en cours, ceux que `station` montre sous « cooks en cours », dans son ordre — station par station, le plus ancien d'abord : `ticket`, `titre` (celui du ticket), `station`. Une liste vide quand aucun ne tourne. Le titre est celui du rail : vide (`""`) si le ticket l'a quitté pendant la cuisson |
| `attend` | Les tickets que le bloc `attend` de `status` nomme, un par entrée, dans l'ordre du bloc : `ticket`, `titre`, `url`. **C'est l'adresse qui ouvre l'issue** : celle du rail pour un ticket qui y est, sinon celle que **le dépôt de la box** donne (`BRIGADE_GITHUB_REPO`) — l'app n'en compose aucune. Le titre est celui du rail, **vide (`""`) pour une issue qui n'y est pas** : le journal ne le connaît pas, et rien ne va le chercher. `url` est `null` quand la box ne connaît pas son dépôt. La connexion Max, la version, la passe de fermeture demandée, la base rouge et le setup bloqué, qui ne sont à aucun ticket, n'y sont pas — `compteurs.attend` les compte. Une liste vide quand rien n'attend |
| `livres` | Les tickets servis dans les 24 h avant `lu` — **ceux que `compteurs.livres24h` compte, un pour un** —, le plus récent d'abord : `ticket`, `titre`, `url` (son issue), `livre` (l'heure de son service), `station` (celle qui l'a cuisiné, `null` quand aucune ne l'a envoyé en pass — mergé à la main sans cook, livraison hors du rail), `pr` (la PR mergée, `null` pour un ticket servi sans merge), `relecture` (ce que le reviewer a dit de **ce qui a été servi**, mot pour mot : `resume`, son résumé ; `constats`, dans son ordre, chacun avec `gravite` — `remarque` ou `bloquant` —, `fichier` — `null` quand il n'en nomme pas — et `constat`, son texte ; une suppression qu'il demande est une `remarque` dont le texte commence par « À supprimer : »). `relecture` est `null` quand aucune relecture lisible ne porte sur la livraison servie : mergée à la main sans passer à la pass, servie sans relecture, relue sur un commit d'avant celui que la pass jugeait en dernier, ou dont la dernière relecture ne se lit pas — **rien n'est mis à sa place**, pas même une relecture d'une livraison d'avant. Une relecture rouge mergée à la main par le chef est la sienne : ses constats bloquants y sont. **Un ticket y reste après la fermeture de son issue** : il a quitté le rail, pas la liste — elle se relit au journal, titre et adresse compris. Le titre est celui du jour, vide (`""`) pour une livraison que le rail n'a jamais portée ; `url` est alors celle que le dépôt de la box donne, ou `null`. **Une issue fermée sans avoir été servie** — abandonnée, écartée — **n'y est pas**. Une liste vide quand rien n'a été servi en 24 h |

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
| `lancements` (quatrième tableau) | Un ticket par ligne, pour ceux qui ont été lancés plus d'une fois ou dont un lancement n'a rien livré : combien de lancements, leurs tokens, et ce qu'ils ont produit — `utiles`, `perdus` avec leur part. Aucun seuil | `outcome` et `tokens` de `cook.exited` |

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
