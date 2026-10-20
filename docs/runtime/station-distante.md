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
- **Son poste fermé ou en veille en pleine cuisson, rien de ce qu'elle a poussé n'est perdu.** Sa
  station se tait, son bail tombe (ou son plafond d'inactivité), et le ticket revient **en attente**.
  Avant de le rendre au service, la box relit la branche du cook sur l'origine : si elle y porte des
  commits en plus de la base, c'est le **travail conservé** — le compte-rendu le dit (`cook.reported`,
  `kept` : ses commits) et l'issue aussi. Le cook suivant **en repart**, au lieu de recommencer de
  zéro : sur la box, dans un worktree accroché à cette branche telle que l'origine la porte ; sur une
  station distante, avec la branche dans sa mission (`resumes`, `returns: 0` — ce n'est pas un
  renvoi). Sa consigne lui dit de finir ce qui est commencé, et son lancement nomme le cook qu'il
  reprend (`cook.launched`, `continues`). Rien sur l'origine : il repart de la base, comme un premier
  — une station d'ici relit l'origine juste avant de partir, au cas où la station l'aurait poussée
  depuis. Une branche qui porte la forme des identifiants de Claude n'est jamais reprise. Un renvoi
  de la pass passe avant : sa branche est celle de la livraison. Réveillée, la station apprend à sa
  demande suivante que son cook est arrêté (`stopped`, `lease`) ; ce qu'il livrerait n'est plus reçu,
  et le ticket, que la box a pu reprendre, n'a jamais qu'un cook à la fois. Le runner ne pousse
  qu'à la livraison : un cook perdu avant d'avoir livré n'a, aujourd'hui, rien laissé sur l'origine.

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
  `status` le dit dans le bloc `awaiting`, et `station` sur sa ligne `présence` :

  ```
  #16  for 3 min  station absent — `mac/claude` has not shown up lately — this is not a failure, and there is nothing to do on the box: the ticket starts again on its own as soon as the station shows up (its workstation on, its runner started)
  ```

#### Les tickets ordinaires sur le poste du chef

Une station distante tourne **sans cloison**, sur le poste du chef : un cook y lirait ce que lit
son compte — la clé `ssh` vers la box, ses accès de prod. Par défaut, elle ne prend donc **que les
tickets qui demandent une de ses capacités**, comme avant. Le chef peut lui faire prendre aussi les
**tickets ordinaires** — ceux dont la fiche ne demande rien — en la déclarant `distante+ordinaires` ;
son **plafond de cooks** est alors la limite du Mac, tickets ordinaires compris — celui qu'elle
déclare : la box ne voit pas les cœurs du Mac (`run station -- cooks <N>` le règle aussi) :

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

#### Une cuisine locale : tous ses cooks dans le bac à sable

Les tickets prêtés par la box ne sont pas les seuls à passer par le bac à sable de macOS. **Un projet
dont la cuisine tourne sur le Mac du chef** — dans la station que son app lance
(`runtime/src/station/cuisine.ts`) — **y lance tous ses cooks, sans exception** : chaque `claude`
que sa cuisine lance part dans le bac à sable de Claude Code — le **cook** d'un ticket, le
**closer** de la passe de fermeture, le **reviewer de la pass**, le **jugement du manager**
(`runtime/src/bac-a-sable/local.ts`). Une cuisine est locale quand sa station tourne sous macOS : la
box n'en est jamais une, et sa cloison (`bwrap`) la garde.

- **La même politique que pour un ticket prêté**, pas une autre : la configuration de
  `runtime/src/bac-a-sable/configuration.ts`, écrite pour le répertoire où le lancement travaille —
  son worktree pour un cook, un closer ou un reviewer, le répertoire temporaire pour un jugement. Il
  n'écrit que là et dans les caches du projet, ne lit ni `~/.ssh` ni les identifiants du chef, ne
  joint que les hôtes de la liste réseau du projet (`.claude/brigade/reseau` de sa branche
  d'intégration, relue à chaque lancement ; illisible, le socle seul : Anthropic et GitHub). Le
  `--permission-mode bypassPermissions` d'un cook cède la place à `--permission-mode dontAsk
  --settings <la configuration>` ; le reviewer et le jugement, qui n'avaient pas de mode, les
  reçoivent devant `--setting-sources`.
- **Les caches du projet** se nomment dans `BRIGADE_SANDBOX_CACHES` (chemins absolus séparés par
  `:`, sur la ligne du projet ou dans l'environnement de la station) ; aucun par défaut.
- **Sans bac à sable, la cuisine ne s'ouvre pas** : aucun cook n'y part à nu. La station refuse le
  projet, et le motif nomme ce qui manque, en une phrase :
  `sur ce Mac, chaque cook part dans le bac à sable, et il n'est pas utilisable — <raison>`. Corrigé
  (un `claude update`, par exemple), le projet se rouvre au redémarrage de la station, ou quand sa
  ligne change. Ouverte, la cuisine le dit dans le journal de service :
  `bac à sable — chaque \`claude\` de la cuisine (cook, closer, reviewer, manager) part dans celui de Claude Code (claude 2.1.300) : …`.
- **Ce qu'il ne garde pas** : ce que le runtime lance lui-même hors de `claude` — le setup du
  worktree, les gates, les serveurs d'une livraison. Ce sont les scripts du dépôt, pas le modèle.

**Le bac à sable est-il utilisable sur ce Mac ?** La vérification le dit, avant d'y faire cuire un
projet :

```bash
BRIGADE_STATION_DIR=<répertoire de la station> node runtime/src/bac-a-sable/verifier.ts
```

Elle écrit `ok` (code 0), ou ce qui manque en une phrase (code 1) — pas macOS, pas de Seatbelt
(`/usr/bin/sandbox-exec`), un `claude` trop ancien ou muet, `HOME` absent, un cache relatif, ou des
worktrees là où un cook ne doit rien lire ; 2, elle est mal appelée. Le `claude` éprouvé est celui
que la station lance (`BRIGADE_CLAUDE_BIN`, sinon `claude`). Elle éprouve les lieux de la station :
**une station posée sous `~/.config/brigade`** — le répertoire par défaut de l'app — **ne tient
pas**, car un cook n'y lit rien, et ses worktrees y seraient :

```
la configuration du bac à sable ne tient pas sur ce Mac — /Users/chef/.config/brigade/station/etat/essai : un cook n'y écrirait pas sans toucher à /Users/chef/.config/brigade, qu'il ne doit pas même lire
```

**La vérification à la main**, sur le Mac, ce que les tests ne peuvent pas faire (ni macOS, ni vrai
`claude`, ni réseau) : `--settings` rend la configuration d'un `claude` lancé dans un répertoire,
la liste réseau étant les hôtes donnés ; lancé avec, `claude` doit refuser ce qu'un cook ne fait pas.
Le répertoire d'essai est sous le compte, comme un worktree de la station : `/tmp` n'est, sous macOS,
qu'un lien vers `/private/tmp`, et la configuration nomme les chemins tels quels.

```bash
mkdir -p "$HOME/brigade-essai-wt" && cd "$HOME/brigade-essai-wt"
claude -p 'Lance ces commandes une à une avec Bash et rends leur sortie brute : touch ~/brigade-essai ; touch ~/brigade-essai-wt/ok ; ls ~/.ssh ; cat ~/.claude/.credentials.json ; curl -sS -o /dev/null -w "%{http_code}" https://example.com ; curl -sS -o /dev/null -w "%{http_code}" https://registry.npmjs.org' \
  --permission-mode dontAsk --setting-sources '' \
  --settings "$(node <dépôt>/runtime/src/bac-a-sable/verifier.ts --settings "$HOME/brigade-essai-wt" registry.npmjs.org)"
```

Attendu : `touch ~/brigade-essai` échoue (`Operation not permitted`) et le fichier n'existe pas ;
`~/brigade-essai-wt/ok` est créé ; `ls ~/.ssh` et `cat ~/.claude/.credentials.json` échouent
(`Operation not permitted`) ; `example.com`, hors de la liste, est refusé (connexion refusée par le
proxy du bac à sable, aucun code `200`) ; `registry.npmjs.org`, sur la liste, répond `200`.

#### Déménager la cuisine d'un projet, quand on veut

La station principale d'un projet — celle qui fait tourner sa cuisine, son manager et sa pass — se
choisit à son ajout (« Ajouter un projet à une station depuis l'app ») ; **ce choix n'engage à
rien** : la cuisine se déménage ensuite vers cet ordinateur, vers sa box ou vers une autre station,
sans retirer ni rajouter le projet, et un projet ajouté demain se déménage de la même façon. L'app
lance l'opération sur l'ordinateur du chef (`runtime/src/demenagement/demenager.ts`) :

```bash
BRIGADE_STATION_DIR=<répertoire de la station de ce Mac> \
  node runtime/src/demenagement/demenager.ts <projet> <gist de la station visée> <gist>…
```

Les gists sont ceux des stations du chef. Elle rend une ligne JSON —
`{"moved":true,"project":"parade","from":"box","to":"mac","askedAt":"…"}` (code 0), ou
`{"moved":false,"said":"<une phrase>"}` (code 1), et rien n'a changé ; 2, elle est mal appelée ;
3, GitHub n'a pu être lu ni écrit. Elle n'écrit que deux demandes (`brigade-projets.json`) :
`remise` sur la station que la cuisine quitte, `reprise` sur celle qui la reprend — l'app doit les
garder telles quelles quand elle réécrit ces demandes, sans quoi le déménagement en cours devient un
changement de principale ordinaire. Le reste se fait entre les deux, **par leurs gists** — aucune
ne joint l'autre —, en trois temps (`runtime/src/projets/tenir.ts`) :

1. **La station visée se dit prête**, ou dit pourquoi elle ne le peut pas. Prête : ses Apps
   autorisées sur le dépôt, le dépôt cloné — et, sur cet ordinateur, le bac à sable utilisable.
   Son suivi le dit (`bascule.etape` : `acceptee`, ou `refusee` et la raison) ; rien d'autre ne
   s'ouvre chez elle.
2. **La station qu'elle quitte, seulement alors, s'arrête** : elle retire la ligne du projet — sa
   cuisine se ferme, **plus aucun cook n'en part** —, prouve par son verrou qu'aucune cuisine ne le
   tient plus, arrête chaque cook encore en vol et attend sa mort, puis publie son état dans son
   gist (`brigade-remise-<projet>.json` et ses parts) : `remise`. Tant que l'autre n'est pas prête,
   elle le sert comme avant — `served by box; moving to mac is asked…`.
3. **La station visée pose cet état, puis l'ouvre** : sa cuisine démarre sur le journal reçu
   (`recue`). Un état qu'elle gardait d'une fois précédente est mis de côté
   (`etat/.<projet>.avant-<heure>`), jamais écrasé ; le ticket qui avait préparé le dépôt la suit, et
   aucun ne se rouvre.

**Ce qui suit le projet : tout son journal** — ses tickets et leur rail, ses grants, les décisions
du chef (stations déclarées, calibrage, plafonds), son histoire. Les mêmes, à l'identique : le
déménagement n'y ajoute qu'un fait, `kitchen.moved`. **Un ticket en cours n'est pas perdu** : son
cook est arrêté par le déménagement (`cook.exited`, `outcome: stop`, `cause: move`) — ni échec, ni
panne, rien pour le disjoncteur —, le ticket revient au rail, et la station qui reprend le projet le
reprend comme un autre.

**Jamais deux cuisines à la fois.** La remise attend que la cuisine soit fermée (son verrou libre)
et ses cooks morts ; la station visée n'ouvre la sienne qu'une fois la remise publiée. Une station
qui a remis un projet ne le rouvre pas d'elle-même, même si sa demande lui en redonne la principale :
elle le refuse (`it was handed over to mac … move it back to bring it here`) — il ne revient que par
un déménagement en sens inverse.

**Vers cet ordinateur, pas sans bac à sable** (« Une cuisine locale », plus haut). La commande joue
d'abord la vérification de `bac-a-sable/verifier.ts` : indisponible, elle refuse avec sa raison, en
une phrase, et n'écrit rien. La station de l'ordinateur la rejoue avant de se dire prête : une
demande qui lui arriverait autrement est refusée de même (`refusee`), et la station qu'il devait
quitter le sert toujours. Refusé, ou pas encore accepté, un déménagement se reprend : déménager le
projet vers la station qui le sert encore efface la demande. Une fois accepté, il va à son terme :
la commande refuse un autre déménagement du même projet tant que la station visée ne le sert pas.

**Où cuit chaque projet** se lit dans le suivi de chaque station (`brigade-projets-suivi.json`,
celui que l'app lit déjà) : `station` (`nom`, `locale` : la station de l'ordinateur du chef), et par
projet `cuitSur` — la station où il cuit, telle qu'elle la connaît — et `ici` — il cuit sur
celle-ci, et c'est cet ordinateur.

**Ce qui n'est pas garanti.** Ce qui ne voyage pas : les flux bruts des cooks (`runs/`), les
worktrees, le clone (la station visée clone le dépôt). Un cook arrêté en vol repart donc de la
base — ou de sa branche sur l'origine si une station distante l'y avait poussée
(`travail-conserve.ts`) : ce qu'un cook de la box avait commité sans le pousser reste dans le clone
de la box, branche `cook/<run>`. Le journal voyage compressé, en parts, par le gist : au-delà de
10 Mo compressés, la remise est refusée et la cuisine reste fermée sur la station qu'elle quittait
— la remise se réessaie à chaque lecture. Un cook d'une station distante en vol n'est pas joint :
il est arrêté au journal, et sa station l'apprend à sa demande suivante, si une cuisine y répond.
Après le déménagement, l'état gardé sur l'ancienne station est figé : une commande tapée là
(`brigade <projet> …` sur la box) n'atteint plus la cuisine. Les stations déclarées voyagent
telles quelles, comme les autres décisions : la station posée à l'ajout garde le nom de la machine
d'alors (`box/claude`) et ses cooks partent de la station qui sert le projet, sous ce nom ; une
station marquée `distante` qui devient la principale reste marquée ainsi — le chef les
redéclare (`brigade <projet> station stations …`, « Déclarer les stations », `station.md`).

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
| `kitchen.moved` | La cuisine du projet déménage : `from`, `to` (les stations), `askedAt` (l'instant de la demande, qui le fait reconnaître), `cooks` (les runs arrêtés en vol). Écrit par la station qu'elle quitte, dernier fait de l'état remis. Hors ticket |
| `cook.exited` | Avec `cause: move` : le cook a été arrêté par un déménagement, `outcome: stop` — son ticket revient au rail, sans échec |

