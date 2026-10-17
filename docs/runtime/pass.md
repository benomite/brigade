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
n'est pas vide — le bloc `awaiting` de `status`, au journal seul : `sans grant, 3 livraisons vertes
arrêtées : 1 mergée à la main, 1 fermée sans merge — 1 désaccord —, 1 encore ouverte` (le bloc le dit
en anglais : `without a grant, 3 green deliveries stopped: 1 merged by hand, …`). Le compte
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

