## Le manager

Le manager décide **ce qui entre sur le rail, et le calibre**. Allumé, le chef pose une issue en
langage produit, sans aucun label : le manager pose `fire`, `model:` et `effort:` et dit pourquoi —
ou dit, en commentaire, pourquoi ce n'est pas un ticket exécutable. Une **épique**, il la
**découpe** (voir « Il découpe les épiques ») ; un ticket qui **échoue en pass**, il en fait quelque
chose plutôt que de te le remonter tel quel (voir « Il réagit à un échec »).

**Il est éteint tant que tu ne l'as pas allumé**, et s'allume sans redémarrer (des faits au
journal). Éteint pendant un jugement, il le laisse finir mais ne pose rien : la décision se pose
sans rejuger quand tu le rallumes.

Ce que `manager` écrit — sorties, refus, erreurs — est **en anglais** (mots de `docs/glossary.md` : `ON` / `OFF`, `latest decisions`, `set aside`, `epics`, `reactions`). Les clés du JSON d'`upstream` ne changent pas, seul le texte de `dit` passe en anglais.

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
backlog               12 open issues, of which 3 carry `blocked-on-human` — read just now on GitHub (benomite/brigade)
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
{"lu":"2026-10-15T09:12:03.000Z","depot":"benomite/brigade","issues":[{"ticket":16,"titre":"…","url":"https://github.com/benomite/brigade/issues/16","priorite":1,"etat":"epique","dit":"it carries `epic`: not split yet"}]}
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
| `decoupee` | est une épique découpée : ses tickets portent le travail — `dit` dit combien sont servis, et nomme ceux qui ne le seront pas sans le chef (« #876 closed without delivery », « #877 left the rail (…) »). Une épique dont **tous** les tickets sont servis n'est plus listée : le manager la ferme lui-même, avec un commentaire qui liste ses tickets et leurs PR (une fois ; une épique que le chef a déjà fermée n'est pas commentée). Une épique avec un ticket manquant reste ouverte | les découpages |
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

**Chaque écart a son geste, et `run manager` le dit** (section `set aside`, les dix plus récentes).

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
| **une question** : l'épique est ambiguë sur un choix de produit | La pose en commentaire, ne crée rien | `manager.split-asked` |
| « déjà découpée » : l'épique nomme déjà ses tickets | Ne crée rien, le dit une fois | `manager.split-skipped` |

La question est réservée au **choix de produit**, posée comme un choix entre des voies (ce que
l'utilisateur en retrouve). Une ambiguïté technique — où vit le code, l'ordre, le mécanisme — est
tranchée par le manager, qui écrit sur l'issue ce qu'il a décidé et pourquoi (le `motif` du découpage).

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

Une carte n'entre dans TODO que si la cause du rouge est un **choix de produit** (`product`) ou un **geste** que toi seul peux faire (`gesture`) : le manager la pose avec la remontée, en une ligne (`todo.entered`), et elle remplace la remontée nue dans `attend`. Un rouge qui ne cache ni l'un ni l'autre est remonté **sans carte** — l'issue le dit —, et aucune carte n'est jamais posée pour lui. La carte sort de TODO dès que le ticket n'est plus 86 `manager:escalated`.

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

