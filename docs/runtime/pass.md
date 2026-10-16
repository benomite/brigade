# La pass

Page du [runtime de la V2](README.md) ; l'index dit où trouver le reste.

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
| **aucun check** | ni vert ni rouge : le verdict repose sur les gates et le reviewer (`ci: none`). Sauf si la branche porte des workflows (`.github/workflows`) : leurs checks sont attendus |

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
