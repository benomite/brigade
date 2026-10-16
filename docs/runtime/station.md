# La station

Page du [runtime de la V2](README.md) ; l'index dit où trouver le reste.

## La station

Une **station** vient prendre les tickets : un endroit où un moteur tourne, `<machine>/<moteur>` —
`box/claude`, c'est cette machine, le binaire `claude`, la connexion Max du compte du service. Pour
chaque ticket : elle le prend, crée un **worktree** sur une branche neuve `cook/<run>` partie de la
branche d'intégration, le rend exécutable, y lance le cook sous garde-fous, puis **récolte**. Le
clone du dépôt n'est jamais modifié.

### Déclarer les stations

**Le runtime ne suppose aucune station : le projet déclare les siennes**, par le geste `station`
— une décision du chef, posée au journal du projet, lue sans redémarrage. Ce n'est pas un fait de
la machine : le drop-in de l'unité n'en porte plus rien, et une variable `BRIGADE_STATIONS` qui y
traîne est **ignorée** (le runtime le dit à son démarrage, avec le geste). Une station par entrée,
séparées par des virgules ; trois champs par station, séparés par `:` :

```
<machine>/<moteur>:<plafond de cooks>:<capacité>+<capacité>[:distante],…
```

```bash
brigade <projet> station stations box/claude:30:code+raisonnement,box/playwright:2:navigateur-headless
```

| Champ | Ce qu'il dit | Ce qui est accepté |
|---|---|---|
| **nom** | `<machine>/<moteur>` : le nom par lequel le rail, le journal, `status` et `station` la désignent | une machine et un moteur, chacun en minuscules, chiffres et tirets ; **un nom ne se déclare qu'une fois** |
| **plafond** | combien de cooks elle fait tourner à la fois | un entier supérieur à zéro |
| **fournit** | ses **capacités** : ce que cette machine sait faire (`code`, `navigateur-headless`, `chrome-connecté`…) | au moins une ; des lettres, des chiffres et des tirets, séparées par `+` |
| **distante** | facultatif : la station **ne tourne pas sur la machine du runtime** — le poste du chef. Le runtime n'y lance rien et ne la joint jamais : c'est elle qui vient tirer son travail (voir « Une station distante tire son travail ») | le mot `distante`, et rien d'autre : **ni hôte, ni port, ni adresse** — la box ne sait pas où elle est |

- **Plusieurs stations de la même machine** se déclarent côte à côte (`box/claude`, `box/playwright`) :
  chacune a son plafond et ses cooks, et un ticket part dans la première, dans l'ordre de la
  déclaration, que rien ne retient et qui fournit ce qu'il demande. Toutes celles que le projet déclare
  sans le mot `distante` tournent sur cette machine,
  par le même `claude` et la même connexion Max : **l'entrée, la machine, le quota, la connexion et
  l'arbitre leur sont communs** — un quota épuisé ou une connexion tombée se disent de toutes.
- **Aucune station** (rien de posé, ou une déclaration vide) : c'est accepté, le runtime démarre —
  et **aucun cook ne part**. Les tickets restent en attente ; le manager juge et la pass relit
  toujours. Le runtime le dit au démarrage (`brigade : stations — aucune…`), l'écrit
  (`stations.undeclared`), et `status` le montre tant que ça dure (`stations  AUCUNE DÉCLARÉE…`,
  et `aucune station déclarée` sur chaque ticket qui attend) ; `installation` le compte comme un
  **manque**. Le geste : `station stations <déclaration>` — lu au réveil suivant, sans redémarrer.
- **Mal écrite, la déclaration fait refuser le démarrage**, et le refus nomme la station et le champ
  en cause — `BRIGADE_STATIONS invalide : station n° 2 (« box/claude:0:code ») — plafond : « 0 »
  n'est pas un entier supérieur à zéro`. Un plafond ne se devine pas, et une station ne disparaît
  pas sur une faute de frappe.
- **Une station retirée de la déclaration** sort de `status` et de `station` au redémarrage
  (`station.withdrawn`) ; le ticket qu'elle tenait revient en attente, et les cooks qu'elle a lancés
  restent au journal et au relevé.
- **Une capacité n'est pas une permission.** Elle dit ce qu'une machine *peut faire* ; ce qui est
  *permis* reste l'affaire des grants. Le runtime ne reconnaît aucun nom de capacité : il les lit,
  les annonce, les montre, et les compare à ce que la fiche d'un ticket demande — un ticket ne part
  que dans une station qui fournit ce qu'il demande (voir « Les capacités qu'un ticket demande »).

Au démarrage, le runtime dit ce qu'il a lu : `brigade : stations — box/claude (30 cooks au plus ;
fournit : code, raisonnement) ; box/playwright (2 cooks au plus ; fournit : navigateur-headless)`.

### Plusieurs cooks à la fois

Une station prend des tickets tant que **trois bornes** le permettent, relues à chaque prise :

| Borne | Ce qu'elle retient | Réglage |
|---|---|---|
| **Le plafond de cooks** | le nombre de tickets que la station tient en même temps | celui qu'elle déclare (`station stations`) ; à chaud : `run station -- cooks <N>`, pour **toutes** les stations du projet, `0` pour aucune limite |
| **L'entrée** | le nombre de tickets dont le worktree se prépare et le setup se joue | `BRIGADE_MAX_SETUPS`, **4** par défaut |
| **La machine** | plus aucune prise quand processeur, mémoire ou disque manquent | trois seuils, ci-dessous |

`cooks <N>` écrit `station.capped` pour chaque station, lu dans la seconde, tenu après un
redémarrage — **il l'emporte sur le plafond déclaré**, et le reste tant qu'un autre `cooks <N>` ne
le remplace pas. L'entrée et la machine sont communes aux stations du projet. **Baisser le
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
| `deploy` | une mise en service demandée — ne se lit plus que dans les journaux d'avant la station, qui ne demande plus de mise en service |
| `base` | la branche d'intégration est rouge (voir « La base est jugée seule ») |
| `setup` | le setup du projet est bloqué : il a échoué deux fois de suite à l'identique (voir « Le setup du worktree passe avant le cook ») |
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
| Le setup échoue **comme le précédent du projet** — même motif, aucun hôte refusé de plus —, sur ce ticket ou sur un autre | **le projet est bloqué** (`setup.blocked`) : plus aucun setup n'est lancé, pour aucun ticket, tant que la branche d'intégration n'a pas bougé |
| Un ticket renvoyé par la pass | le setup est joué dans le worktree neuf du renvoi |
| Le dépôt déclare un secret que la machine ne peut pas donner | **ni setup ni cook** : 86 dix minutes, motif `secrets-unavailable` ; l'issue dit lequel, une fois (voir « Les secrets du projet ») |
| Sous une identité par rôle, le ticket ne se lit pas sur GitHub | **aucun cook** : 86 dix minutes, motif `ticket-unreadable` (voir « Une identité GitHub par rôle ») |

**Un setup en échec se lit sur l'issue** : code de sortie ou plafond dépassé, la fin de sa sortie
(secrets du projet et forme des identifiants de Claude masqués), l'heure du retour, et **l'hôte que
la porte a refusé** pendant ce setup, avec le geste qui l'ouvre — une ligne dans
`.claude/brigade/reseau`, mergée sur la branche d'intégration (voir « La liste blanche »). **Une
fois par cause** : de nouveau si le motif change, si un hôte jamais nommé sur ce ticket est
refusé, ou si un cook est parti depuis. `run partition` montre les derniers refus.

**Un échec qui se répète bloque le projet, pas le ticket.** Réessayer toutes les dix minutes, ticket
par ticket, ne ferait que redire la même chose : dès qu'un setup échoue comme le précédent du
projet — le même motif (`code de sortie 1`, plafond dépassé), et aucun hôte refusé que le précédent
ne nommait pas —, la station écrit `setup.blocked` avec la cause et le commit de la branche
d'intégration dont le worktree était parti, le dit sur l'issue et dans journald, et ne lance plus
aucun setup : ses stations se retiennent (`setup`), les tickets 86 reviennent en attente à leur
heure et y restent. Un setup passé entre deux échecs remet le compte à zéro ; un échec d'une autre
cause suit le cours ordinaire. **La reprise est seule** : ce qui lève la cause — un hôte déclaré
dans `.claude/brigade/reseau`, un setup corrigé, une dépendance réparée — arrive en étant mergé
sur la branche d'intégration. Tant que le projet est bloqué, la station la rapatrie à chaque tick ;
dès qu'elle a bougé, `setup.unblocked`, les tickets 86 pour un setup en échec reviennent en
attente sans attendre leur heure, et les setups repartent. Si la cause n'est pas levée, le premier
échec à l'identique rebloque aussitôt, sur la nouvelle base : un setup par merge, pas un toutes
les dix minutes. Un échec passager (un registre en panne) bloque comme un autre : il se lève au
premier merge sur la branche d'intégration. Le blocage tient après un redémarrage.

**Le même mécanisme vaut pour toute cause de mise de côté qui ne tient pas au ticket.** Un
worktree qui ne se prépare pas (`worktree-failed`), un ticket illisible sur GitHub
(`ticket-unreadable`), des secrets indisponibles (`secrets-unavailable`) : la station écrit
`aside.failed` à chaque mise de côté ; la même cause deux fois de suite sur le projet, sans cook
parti entre les deux, écrit `aside.blocked` (la cause, le commit de la base) — une alerte
journald, et une entrée `aside` dans la file du chef, avec la cause en clair et le geste. Ces
causes se lèvent hors du dépôt (une valeur posée, GitHub revenu) : le blocage n'arrête donc pas la
cuisine, il la met **à un ticket à la fois** — les tickets reviennent à leur heure, un seul sonde.
**La reprise est seule** : dès qu'un cook part, la cause est levée et l'entrée tombe ; si une autre
cause se présente, `aside.unblocked` (`why: cause`) et c'est elle qui compte ; si la branche
d'intégration bouge, `aside.unblocked` (`why: base`) et les tickets 86 pour cette cause reviennent
sans attendre. Le setup garde son blocage propre, ci-dessus, inchangé.

**Le blocage entre dans ta file.** Tant qu'il tient, le bloc `attend` porte une entrée `setup`, une
seule pour le projet quel que soit le nombre de tickets retenus, avec la cause en clair et le geste :
``setup impossible : la porte refuse `cdn.sheetjs.com` (…) — à déclarer dans `.claude/brigade/reseau`
du projet, une ligne par hôte, puis merger sur la branche d'intégration`` ; sans hôte refusé, le
setup lui-même est à corriger, et l'entrée nomme l'issue où lire ce qu'il a dit. La ligne `setup`
en tête de `status` le redit, et la cuisine est `retenue` pour l'app — sauf si une station
distante, qui prépare son setup sur son poste, peut encore cuisiner. Au `setup.unblocked`,
l'entrée et la ligne disparaissent seules. Voir « Ce qui attend le chef ».

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

**Les tickets qu'il attend**, **la zone de fichiers qu'il possède** et **les capacités qu'il demande
à sa station** vivent dans **un commentaire de son issue**, repéré par un marqueur :

```
<!-- brigade:fiche -->
**Fiche du ticket** — lue par le runtime, corrigeable à la main.
- attend : #68, #69
- zone : runtime/src/rail.ts, runtime/test/rail.test.ts
- requiert : navigateur-headless
```

`attend` : des `#N`, séparés par des virgules ou des espaces. `zone` : des chemins relatifs à la
racine du dépôt — fichiers ou dossiers —, séparés par des virgules. `requiert` : des noms de
capacité, séparés par des virgules ou des espaces — la ligne est **facultative**, et une fiche qui
ne l'a pas se lit exactement comme avant (voir « Les capacités qu'un ticket demande »).
Sans fiche, un ticket n'attend personne, ne possède rien et ne demande rien. **Elle se corrige à la main**, en
éditant le commentaire ; la lecture tolère la casse, le gras, la puce ou son absence, l'ordre, et
de la prose autour. Le marqueur **ne compte qu'en tête de ligne, hors d'un bloc de code**. Le
manager écrit celle des tickets qu'il découpe.

| Ce que porte l'issue | Ce que le runtime en fait |
|---|---|
| Une clé inconnue (`budget : 40`) ; une puce qui n'est pas `clé : valeur` ; une clé posée deux fois | fiche illisible |
| Une valeur qui n'est pas un `#N`, pas un chemin du dépôt (absolu, `~`, `..`), ou pas un nom de capacité (`chrome/connecté`) | fiche illisible — la valeur est citée |
| Un **motif** dans la zone (`*`, `?`) | fiche illisible : un dossier possède déjà tout ce qu'il contient |
| Deux fiches | fiche illisible, **aucune n'est lue** |
| Un `#N` qui ne désigne aucune issue, le ticket lui-même, ou une PR | fiche illisible |
| Des `attend` qui forment un cycle entre tickets du rail | fiche illisible pour chaque ticket du cycle |
| Une fiche posée par quelqu'un qui n'a pas la main sur le dépôt | **ignorée**, et dit sur journald (`fiche ignorée sur le ticket #N`) |

Fiche illisible, le ticket est **refusé** à la prise : 86, motif `unreadable-card`, un commentaire
liste ce qu'il faut corriger. Lisible ou supprimée, il revient seul (`ticket.released`, motif
`card-readable`) ; ce qui reste à corriger se lit dans `run rail`. La fiche est relue quand l'issue
change, et entre au journal (`ticket.arrived`, `ticket.changed`, champ `card`).

### Les capacités qu'un ticket demande

**Une station fournit des capacités** (la décision `stations`, voir « Déclarer les stations ») ; **un
ticket en demande** par la ligne `requiert` de sa fiche. Le manager la pose au découpage, pour un
ticket infaisable sans elle — il lit ce que fournissent les stations du projet — ; elle se corrige à
la main comme le reste. La plupart des tickets n'en demandent aucune.

| Ce que le ticket demande | Où il part |
|---|---|
| Rien | dans la première station, dans l'ordre de la déclaration, que rien ne retient — **quoi qu'elle fournisse** |
| Une ou plusieurs capacités | dans la première station libre qui les fournit **toutes** ; ce qu'elle fournit en plus ne l'écarte pas |
| Une capacité que fournit une station **pleine ou retenue** | nulle part pour l'instant : il attend sa place, aucune autre ne le prend, et `status` dit laquelle le retient |
| Une capacité qu'**aucune station déclarée ne fournit** — ou plusieurs qu'aucune ne fournit ensemble | **il ne part pas** : 86, sans cook |

- **Seule la capacité choisit la station, jamais une préférence.** Une spécialité (sécu, rédaction,
  BDD) n'est pas une capacité : rien dans le runtime n'écarte une station parce qu'un ticket « irait
  mieux » ailleurs.
- **Les noms se comparent tels quels** (`chrome-connecté` n'est pas `chrome-connecte`) : le runtime
  n'en reconnaît aucun. Seule la façon d'écrire un accent est indifférente.
- **Sans station qui la fournisse, le ticket est 86 avant toute prise** — écrit par le runtime, motif
  `no-station: chrome-connecté` (`no-station: a + b` quand chacune est fournie quelque part, jamais
  ensemble), sans heure de retour. **Aucun cook n'est lancé**, aucun worktree préparé ; les autres
  tickets partent, et lui ne tient pas sa zone. Son issue reçoit un commentaire qui nomme ce qui
  manque et les stations déclarées.
- **`status` dit ce qui manque et le geste qui le fournirait**, dans le bloc `attend` :

  ```
  #14  depuis 3 min  aucune station ne fournit `chrome-connecté` — à fournir : déclarer une station qui la fournit par `brigade <projet> station stations <machine>/<moteur>:<plafond de cooks>:chrome-connecté`, ou retirer `chrome-connecté` de la ligne `requiert` de sa fiche — il repart seul
  ```

- **Il revient en attente seul** (`ticket.released`, motif `capabilities-reread`) : au redémarrage,
  si une station déclarée fournit désormais ce qu'il demande ; au sondage, si sa fiche ne le demande
  plus. Une fiche qui demande maintenant autre chose qui manque le renvoie 86, sous le nouveau motif.
- **Sans aucune station déclarée**, un ticket qui demande une capacité est 86 de la même façon ;
  celui qui n'en demande pas attend, comme avant.
- **Demander une capacité n'autorise rien.** Elle dit dans quelle station le ticket part ; ce que son
  cook a le droit de faire ne change pas. `accès-prod` écrit sur une ligne `requiert` est un nom
  comme un autre : la liste de ce qu'aucun grant n'autorise (`runtime/src/grant.ts`) reste ce
  qu'elle était, et `grant -- activer acces-prod` est refusé comme avant.

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
| `pull <station> announce` | la station se dit là | ce qu'elle fournit, son plafond de cooks, le délai de présence, la durée du bail, les plafonds des garde-fous |
| `pull <station> claim` | prend un ticket, s'il y en a un pour elle | `mission` — le ticket, le run, la branche à créer (`cook/<run>`, depuis `base`) ou à reprendre (`resumes`, un renvoi de la pass), le calibrage, la consigne du cook et les arguments de `claude`, les plafonds, l'échéance du bail — ou `mission: null`, et `held` : ce qui la retient |
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
  autre, même s'il attend devant. Seule une station **déclarée `distante`** tire : un nom inconnu
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
  `status` le dit dans le bloc `attend`, et `station` sur sa ligne `présence` :

  ```
  #16  depuis 3 min  station absente — `mac/claude` ne s'est pas manifestée récemment — ce n'est pas une panne, et rien n'est à faire sur la box : le ticket repart seul dès que la station se manifeste (son poste allumé, son runner lancé)
  ```

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
| `ticket.86` | Motif `station-absent: <station>` : seule une station distante absente peut cuisiner ce ticket. Sans heure de retour ; `ticket.released`, motif `station-present`, quand elle revient |

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

