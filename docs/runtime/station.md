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
<machine>/<moteur>:<plafond de cooks>:<capacité>+<capacité>[:distante[+ordinaires]],…
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
| **ordinaires** | facultatif, après `distante` (`distante+ordinaires`) : la station distante prend **aussi les tickets ordinaires** — ceux qui ne demandent aucune capacité —, chacun dans le bac à sable de Claude Code de son poste (voir « Les tickets ordinaires sur le poste du chef ») | le mot `ordinaires`, et seulement d'une station `distante` : une station de la box les prend déjà |

- **Plusieurs stations de la même machine** se déclarent côte à côte (`box/claude`, `box/playwright`) :
  chacune a son plafond et ses cooks, et un ticket part dans la première, dans l'ordre de la
  déclaration, que rien ne retient et qui fournit ce qu'il demande. Toutes celles que le projet déclare
  sans le mot `distante` tournent sur cette machine,
  par le même `claude` et la même connexion Max : **l'entrée, la machine, le quota, la connexion et
  l'arbitre leur sont communs** — un quota épuisé ou une connexion tombée se disent de toutes.
- **Aucune station** (rien de posé, ou une déclaration vide) : c'est accepté, le runtime démarre —
  et **aucun cook ne part**. Les tickets restent en attente ; le manager juge et la pass relit
  toujours. Le runtime le dit au démarrage (`brigade : stations — aucune…`), l'écrit
  (`stations.undeclared`), et `status` le montre tant que ça dure (`stations  NONE DECLARED…`,
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

