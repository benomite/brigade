## La cloison

Sans elle, tout ce que le runtime lance — setup, cook, gates, reviewer, juges — tourne sous le
compte du service : un cook lit l'état, le clone, les worktrees et les secrets des **autres**
projets, le fichier de secrets du sien en entier, les clés des GitHub Apps, et parle à tout
Internet. Le runtime le dit à chaque démarrage (`cloison — aucune …`, `réseau — ouvert …`). Elle se
pose **projet par projet**, en deux moitiés indépendantes :

- **Les fichiers et les process**, à chaque lancement, par `bwrap` (bubblewrap) : son espace de
  montage et son espace de process, sans privilège.
- **Le réseau**, au projet : l'unité `brigade@<projet>` ne joint que la boucle locale ; sa seule
  sortie est **la porte**, `brigade-porte@<projet>`.

**Sur une station installée par le paquet, la cloison est posée pour tous les projets, sans
réglage** : l'unité `brigade-station` ne joint que la boucle locale, et `brigade-station-porte`
tient une porte par projet de sa configuration — chacune avec la liste blanche de son projet, lue
au journal de ce projet, qui y reçoit aussi ses refus — et celle de la station elle-même
(Anthropic et GitHub seulement). Personne ne choisit leurs ports : chaque porte reprend le sien ou
en prend un libre, et les écrit dans `/var/lib/brigade/portes.json`, d'où la station donne à chaque
projet le sien ; une ligne de la configuration qui nomme sa porte (`BRIGADE_PROXY_PORT`) est
refusée. Un projet dont la porte n'a pas encore dit son port attend, et la station le dit ; la
station elle-même attend la sienne avant de rien joindre. La bascule arrête les
`brigade-porte@<projet>` de l'ancienne installation et remet leurs ports aux portes de la station :
même port, même liste — un cook en vol retrouve la sienne. Les refus se lisent par
`journalctl -u brigade-station-porte`.

La frontière des fichiers passe **entre le runtime et ce qu'il lance** : ce qu'il fait lui-même —
`git`, `gh`, `claude auth status` — n'est pas cloisonné.

### Ce qu'un lancement cloisonné voit

| | |
|---|---|
| **Masqué** — un répertoire vide à la place | chaque répertoire de `BRIGADE_SANDBOX_HIDDEN` : sur la box `/var/lib/brigade` et `/etc/brigade`, donc l'état, le clone, les worktrees, les secrets et les clés de **tous** les projets, le sien compris |
| **Rendu, en écriture** | son worktree, et **sa vue du `.git` du clone** : objets, références et worktrees sont les vrais ; la `config` et les `hooks` sont **les siens** |
| **Rendu, en lecture seule** | au reviewer, le worktree et la vue du `.git` ; au cook sans identité GitHub, son ticket remis |
| **En lecture seule** | toute la machine, **et le répertoire du compte** : son `.gitconfig`, ses chaînes d'outils, le binaire `claude` |
| **Au projet, en écriture** | ce qui s'écrit sous `~` : `~/.npm`, `~/.cache`, `~/.claude.json`, toute entrée que le compte n'a pas — dans `~` comme dans `~/.local`, `~/.local/share` et `~/.local/state` —, et ce que nomme `BRIGADE_SANDBOX_PRIVATE` — rangé dans `<état>/compte` |
| **En écriture, tel quel** | `/tmp` (celui du projet : `PrivateTmp`) |
| **Remplacé** | `~/.claude` : celui du projet, `<état>/claude` — ni transcripts ni mémoire d'un autre projet |
| **Identifiants Max** | `~/.claude/.credentials.json`, monté **en lecture seule** : `claude` les lit, rien ne les réécrit |
| **Process** | les siens : ni `ps` ni `/proc/<pid>/environ` ne montrent un autre cook |

**Rien de ce qu'un cook écrit n'est lu comme configuration, ni exécuté, par le runtime** — dont le
`git`, le `gh` et le `claude` tournent hors cloison, sous le même compte et dans le même clone :

- **Le compte** est en lecture seule : un `git config --global` échoue, un `npm ci` écrit son
  cache dans celui du projet. **Les outils écrivent leur cache à leur place habituelle, sans
  réglage** : `~/.cache`, `~/.npm`, et sous `~/.local/share` et `~/.local/state` ce que le compte
  n'y a pas (le store de pnpm, `~/.local/share/pnpm`) ; jest écrit dans `/tmp`. Ce cache est au
  projet, dans `<état>/compte` : retrouvé d'un ticket à l'autre, jamais partagé avec un autre
  projet. Ce que le compte garde sous `~/.local` (le binaire `claude`) reste en lecture seule.
  Une chaîne d'outils qui écrit sous `~` (`~/.cargo`, `~/.gradle`) se nomme dans
  `BRIGADE_SANDBOX_PRIVATE` (noms séparés par `:`) : le projet a la sienne, vide au départ.
- **Le `.git`.** Ce qu'un lancement y configure (`git config`, `git remote add`, husky) va dans la
  `config` de sa vue, que le `git` du runtime ne lit jamais. La cloison pose `gc.auto=0` et
  `maintenance.auto=false` dans le clone servi. **Ne lance pas `git gc` ni `git pack-refs` à la
  main dans ce clone pendant qu'un cook tourne.**
- **Le worktree**, où le runtime lance `git` hors cloison : il lit lui-même le fichier `.git` du
  worktree et son `commondir`, et **impose le dépôt à `git`**. Un fichier qui ne mène plus au clone
  est un **refus** (``ne désigne plus son dépôt dans le clone (fichier `.git` réécrit)``, ou
  ``(`commondir` réécrit)``) : au tick, un avertissement ; à la fin du cook, la livraison échoue,
  rien n'est poussé, le worktree est gardé. Il **ne descend dans aucun sous-module** : ce qu'un
  cook y change n'est ni un progrès ni récolté — à lui de commiter le pointeur. `core.fsmonitor`
  et `core.hooksPath` sont neutralisés. Ces protections valent aussi sans `bwrap`, sans la
  remplacer : sans elle, la `config` et les `hooks` du clone restent inscriptibles par le cook.

**Le runtime refuse de démarrer** si la cloison laisse dehors ce qu'elle doit cacher —
`BRIGADE_STATE_DIR`, `BRIGADE_REPO_DIR`, `BRIGADE_SECRETS_FILE` ou `BRIGADE_GITHUB_APPS_DIR` hors
de tout répertoire masqué —, si elle masquerait le compte, `/tmp` ou le système, si un masque est
un fichier, ou si elle est posée à moitié.

### La liste blanche

Sur les ports 443 et 80 : `anthropic.com`, `claude.ai`, `claude.com`, `github.com`,
`githubusercontent.com`, leurs sous-domaines, et ce que le dépôt déclare dans
`.claude/brigade/reseau`. **Aucun registre de paquets n'est ouvert d'office.**
`/brigade:init` écrit ce fichier — il le déduit de ce que le `worktree-setup.sh` installe, et laisse
un fichier vide commenté, jamais un fichier absent, quand il n'a rien à ouvrir ou n'a pas su traduire
l'outil. Les hôtes viennent des lignes d'installation connues et des URLs que le setup nomme
(`https://cdn.sheetjs.com/…` donne `cdn.sheetjs.com`) ; `runtime/src/reseau-cli.ts` fait cette
déduction et écrit le fichier dans tous les cas, sans jamais réécrire un fichier déjà là.
C'est une proposition : elle n'ouvre rien tant qu'elle n'est pas mergée.

```
# .claude/brigade/reseau — un hôte par ligne
registry.npmjs.org
*.pythonhosted.org          # l'hôte et ses sous-domaines
base.exemple.org:5432       # un autre port que 443 et 80
```

Ni adresse IP, ni `*` seul, ni `*.com` : une ligne qui n'est pas un hôte n'ouvre rien, et
`npm run partition` la montre.

**La déclaration se lit sur la branche d'intégration, pas dans le worktree du cook** — à l'inverse
des secrets. Un hôte s'ouvre donc par un **merge**, que la pass ne fait jamais elle-même
(`review-required`, cause `declaration-modified: …`). Le runtime la relit chaque fois qu'il
rapatrie la base et à chaque tick (`network.declared`) ; la porte lit sa liste là, sans redémarrer.
**Le runtime sort par la porte, lui aussi** : avec `BRIGADE_PROXY_PORT`, il pose `HTTPS_PROXY`,
`HTTP_PROXY` et `NO_PROXY` pour lui-même et pour tout ce qu'il lance. **`git` en SSH ne passe
pas** : l'origine du clone doit être en `https`.

### Un refus se lit

| Ce qui est tenté | Ce que le process reçoit | Où tu le lis |
|---|---|---|
| un hôte hors liste, par la porte | `403`, aussitôt ; en clair, la réponse nomme l'hôte et le geste qui l'ouvre | `npm run partition` (`network.refused`), `journalctl -u brigade-porte@<projet>` |
| une connexion qui contourne la porte | le noyau jette ses paquets : UDP reçoit `EPERM`, **TCP attend le délai de son client** — à confirmer sur la box | nulle part |
| un hôte permis qui ne répond pas | `502` | la réponse |

Un événement par hôte et par dix minutes, cent hôtes nommés au plus. **Le filtre de l'unité est
sondé à chaque démarrage** : s'il ne tient pas, le runtime le dit — `MAIS un envoi direct part :
l'unité ne semble rien filtrer (IPAddressDeny)`. Son verdict se confirme sur la box (recette).

### Ce qui est refusé, et pourquoi

`BRIGADE_STATE_DIR=<répertoire d'état> npm --prefix runtime run partition` lit le journal
(`isolation.configured`, écrit au démarrage quand l'état de la cloison change) et montre :
`fichiers` (`CLOISONNÉS` ou `OUVERTS`, ce qui est masqué), `réseau` (`LISTE BLANCHE` ou `OUVERT`,
et si l'unité filtre), `ce qui passe` (chaque hôte, et d'où il vient), et les `derniers refus`.

### L'éprouver, et ce qu'elle coûte

```bash
brigade <projet> partition probe [<essais>]
```

De vraies sondes, sans cook ni quota : le lancement part dans `bwrap`, chaque répertoire masqué
est vide, les identifiants Max sont en lecture seule, les outils écrivent leur cache sous `~`
(`~/.cache`, `~/.npm`, `~/.local/share`, `~/.local/state`), les process des autres sont invisibles,
`claude` retrouve la connexion Max ; puis le coût d'un lancement. Une sonde en échec rend le code
1 et dit pourquoi. À jouer sur la box : c'est une étape de la recette.

### Les transcripts du projet sont rangés

Sous cloison, `claude` écrit ses transcripts dans `<état>/claude/projects/`, et **le runtime les
range** — au démarrage, puis une fois par jour. Part un transcript que rien n'a écrit depuis
`BRIGADE_TRANSCRIPTS_KEEP_DAYS` jours (`7` par défaut ; `0.5` vaut douze heures), avec son
répertoire de session. Reste tout ce qui a été écrit depuis le départ du plus ancien lancement
encore en cours, et ce qui n'est pas un transcript (la mémoire du projet, ses réglages). Un lien
n'est jamais suivi. Chaque passage est au journal — `transcripts.tidied` (`removed`, `freedBytes`,
`kept`, `keptBytes`, `keepMs`) —, et `status` montre le dernier ; un projet qui redémarre sans
cloison écrit `transcripts.released`, une fois. **Sans cloison, rien n'est rangé** : les transcripts
vont sous le `~/.claude` du compte, où le runtime ne retire jamais rien — il n'y écrit que la copie
du transcript qu'un renvoi reprend, dans le répertoire du projet de son worktree. Un transcript retiré n'est
pas perdu pour le diagnostic : le flux brut reste sous `runs/`, et lui est sauvegardé. Il l'est
pour la reprise d'un renvoi : passé la durée de garde, le cook du renvoi repart de zéro (« Le cook
d'un renvoi reprend la session du précédent »).

### Ce qui n'est pas garanti

- **Rien de cela n'a encore tourné sur la box.** Deux choses ne se prouvent que là-bas : le filtre
  de l'unité (`IPAddressDeny`), et le vrai `claude` sous cloison — dont le jeton Max se renouvelle
  peut-être mal en lecture seule (un cook qui finit `disconnected` alors que `claude auth status`,
  hors cloison, répond connecté).
- **Les identifiants Max restent lisibles du cook.** « Non copiables » tient à la liste blanche et
  à l'absence de montage partagé ; reste la branche poussée, où la station refuse leur nom ou leur
  forme (`credentials-committed`). Une copie transformée passe.
- **Le répertoire du compte reste lisible de tous les projets**, en lecture seule. Ce qu'il garde
  de sensible (`~/.ssh`, `~/.config/gh`) s'ajoute à `BRIGADE_SANDBOX_HIDDEN` ; un fichier seul
  (`~/.netrc`) ne se masque pas, c'est son répertoire qui se masque.
- **Un clone où `extensions.worktreeConfig` est activé rouvre le chemin** de la configuration : ne
  l'active pas dans le clone servi. **Un cook peut faire échouer la livraison d'un autre cook du
  même projet** : `<clone>/.git/worktrees/`, les objets et les références sont partagés en
  écriture. Réécrire le répertoire d'un voisin ne fait rien lancer — sa livraison est refusée.
- **Les filtres que la configuration du compte ou du clone nomme restent appelés** (`git-lfs`).
- **Le cache du compte n'est plus partagé** : chaque projet remplit le sien, que rien ne range. Du
  `~/.claude` du projet, seuls les transcripts sont rangés ; il n'est pas sauvegardé.
- **La boucle locale est commune aux projets** : un service sur `localhost` est joignable de tous,
  et n'a pour protection que son mot de passe. **La résolution de noms reste ouverte** : un tunnel
  DNS sort. **`github.com` est en liste blanche** : sous l'identité unique, le cook y écrit avec le
  compte de la machine — la clôture est une identité par rôle.

## L'arbitre entre projets

Dès qu'un second projet tourne sur la machine, le compte Max et la machine sont partagés.
L'arbitre est le process qui les additionne : **un seul par machine**, sans LLM. Il ne répond qu'à
une question : *ce projet peut-il lancer un cook de plus ?* Il est **facultatif** — sans lui, un
projet tourne comme avant (`arbitre — aucun`). On le désigne à un runtime par
`BRIGADE_ARBITER_PORT`.

### Ce qu'il sait, et d'où

Chaque runtime lui **redit** l'état de son projet — ses cooks de tickets en cours, s'il a des
tickets qu'il pourrait lancer, s'il les retient pour « machine saturée », ce que ses cooks ont
consommé — à chaque demande de place, à chaque changement, à chaque tick, et en s'arrêtant. Un
projet arrêté par le chef, au disjoncteur ouvert, à la base rouge, déconnecté, au quota épuisé ou à
son propre plafond **ne demande rien**. L'arbitre garde ce dernier mot **en mémoire**, et ne compte
que les cooks de **tickets**. Sur disque (`arbitre.db`, dans `BRIGADE_ARBITER_STATE_DIR`) : tes
réglages seuls, relus à chaque décision.

### La règle

`P` est le plafond de cooks du compte, tous projets confondus (`BRIGADE_ARBITER_MAX_COOKS`, **sans
défaut** : l'arbitre refuse de démarrer sans). Un projet **compte** s'il a des cooks, des tickets
qui attendent, ou s'il est connu et n'a pas reparlé.

- **Chaque projet qui compte a une part** : le plafond au prorata de son poids, arrondi vers le
  bas, **jamais moins d'une place**. **Sous sa part, il passe**, tant que le compte n'est pas plein.
- **Au-delà, il emprunte** les places que personne ne demande — jamais tant qu'un projet connu n'a
  pas reparlé. **Sans préemption** : l'arbitre ne tue jamais un cook, il retient le suivant.
- **Quand la machine sature** (un runtime dit retenir des tickets pour elle), les parts se
  calculent sur **le nombre de cooks en cours** et plus personne n'emprunte.

Un projet refusé le lit comme une retenue : `station.held`, motif `arbiter`, dans `run status` et
`run station`. Il redemande à son réveil suivant — une minute au plus.

### Arbitre injoignable : le projet lance quand même

Quand l'arbitre désigné ne répond pas (connexion refusée, réponse illisible, dix secondes de
garde), le projet passe en **mode dégradé** : **au plus un cook de ticket à la fois**, les cooks
déjà partis finissent. C'est écrit **une fois** à l'entrée (`station.unarbitrated`, et
`journalctl`), une fois au retour (`station.arbitrated`) ; chaque cook parti ainsi porte
`unarbitrated: true` ; `run status` (`ARBITER UNREACHABLE for …`) et `run station` le montrent.
Chaque tentative de lancement redemande d'abord : dès que l'arbitre répond, la marche reprend.

### Quand il redémarre

Il repart **vide**. Tant qu'un projet **connu n'a pas reparlé**, sa part reste **réservée** (`N'A
PAS REPARLÉ depuis …`) ; elle se libère s'il reparle, si son runtime s'arrête proprement, ou si tu
le retires. **Arrêté pour de bon sans arrêt propre, il la garde jusqu'à ce que tu le retires.**

### Le lire, et le régler

```bash
export BRIGADE_ARBITER_PORT=<port> BRIGADE_ARBITER_STATE_DIR=<répertoire de l'arbitre>
npm --prefix runtime run arbiter                          # l'état
npm --prefix runtime run arbiter -- weight thermigo 3     # « thermigo est prioritaire cette semaine »
npm --prefix runtime run arbiter -- remove vieux-projet   # sa part n'est plus réservée
```

Ce que `arbiter` écrit est en anglais (`account cap`, `weight 1 · 2 running · share 5 · 3 left`, `cooks consumed`). Par projet : son poids, ses cooks en cours, sa **`part`**, et **`encore`** — ce qu'il pourrait
lancer de plus à l'instant, emprunts compris ; `machine` dit `SATURATED according to <projets>`. **Le
poids** est un entier, 1 par défaut, durable, sans échéance ; il ne touche à aucun plafond — ni
celui du compte, ni celui de chaque projet (`run station -- cooks <N>`). **La consommation des
cooks n'est pas celle du compte**, et l'arbitre ne retient rien à cause d'elle. Arbitre
injoignable, la commande le dit et sort avec le code 1.

### Ce qui n'est pas garanti

- **Un runtime mort sans le dire laisse son dernier mot** à l'arbitre jusqu'à ce qu'il reparle ou
  que tu le retires. **Juste après un redémarrage de l'arbitre**, ce qui avait été emprunté avant
  tourne encore : le plafond peut être dépassé de cet emprunt, le temps que ces cooks finissent.
- **Un cook joint la boucle locale**, donc l'arbitre : il pourrait y parler au nom d'un projet, et
  fausser un compte que le runtime redit à l'échange suivant. Il ne peut pas régler les poids, que
  la cloison lui masque.
- **L'arbitre ne connaît pas le quota du compte** : voir « 86 : le quota est épuisé ».

