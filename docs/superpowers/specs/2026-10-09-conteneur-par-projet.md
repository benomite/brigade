# Un conteneur par projet, et un réseau en liste blanche (#176)

Jalon 7 de la V2 (épique #179). Spec V2, §Isolation et secrets : « **Un conteneur par projet, un
worktree par cook** », « réseau des conteneurs en liste blanche : Anthropic, GitHub, registres de
paquets », « identifiants montés en lecture seule ».

## Le problème

Tout ce que le runtime lance — setup, cook, gates, reviewer, juges — tourne sous le compte Unix du
service, sans rien autour. Un cook lit donc ce que ce compte lit : l'état, le clone, les worktrees
et le fichier de secrets des **autres** projets, le fichier de secrets du sien **en entier**, les
clés des GitHub Apps, l'environnement des autres cooks (`/proc/<pid>/environ`). Et il parle à tout
Internet. #174 et #175 ont nommé ces trous et renvoyé leur clôture ici.

## Ce qui est tranché

### Pas d'image, pas de démon : deux mailles, deux mécanismes

La box est un Linux à systemd sans rien d'installé pour cela. Un moteur de conteneurs (Docker,
Podman) y ajouterait un démon ou un magasin d'images à tenir à jour, une image par projet à
construire avec la chaîne d'outils de chacun, et le montage un par un de ce dont `claude`, `git` et
`gh` ont besoin — pour un cloisonnement que le noyau donne déjà. Le « conteneur » est ici ce dont
un conteneur est fait, sans image :

| Ce qui est cloisonné | Maille | Mécanisme | Coût par cook |
|---|---|---|---|
| **Les fichiers et les process** | **chaque lancement** (setup, cook, gates, reviewer, juge) | `bwrap` (bubblewrap) : un espace de montage et un espace de process par lancement, sans privilège | un `bwrap` qui reste le temps du lancement — chiffré plus bas |
| **Le réseau** | **le projet** | l'unité systemd `brigade@<projet>` ne joint que la boucle locale (`IPAddressDeny=any`, `IPAddressAllow=localhost`) ; sa seule sortie est **la porte**, `brigade-porte@<projet>`, un relais HTTP qui tient la liste blanche | rien : une porte par projet, pas par cook |

**Pourquoi le lancement et pas le runtime entier, pour les fichiers.** Envelopper le runtime du
projet ne coûterait rien par cook, mais laisserait le cook du même côté que le runtime : il lirait
encore les clés des Apps et le fichier de secrets en entier — précisément ce que #174 et #175
attendent d'ici. La frontière passe donc entre le runtime et ce qu'il lance.

**Pourquoi le projet et pas le lancement, pour le réseau.** Un espace réseau par lancement
couperait la boucle locale de la machine : la base de test que le setup prépare sur `localhost`
ne répondrait plus. Le filtre de l'unité, lui, laisse la boucle locale intacte — les ports que le
setup exporte restent joignables à l'identique — et ne demande aucun privilège au runtime.

### Ce qu'un lancement cloisonné voit

Posée par `BRIGADE_SANDBOX_BIN` (le binaire `bwrap`, chemin absolu) et `BRIGADE_SANDBOX_HIDDEN`
(les répertoires masqués, séparés par `:` — sur la box `/var/lib/brigade:/etc/brigade`).

| | |
|---|---|
| **Masqué** (un répertoire vide à la place) | chaque racine de `BRIGADE_SANDBOX_HIDDEN` : l'état, le clone, les worktrees, les secrets et les clés de **tous** les projets, le sien compris |
| **Rendu, en écriture** | son worktree ; **sa vue du `.git` du clone** — les vrais objets, références et worktrees, mais une `config` et des `hooks` à lui |
| **Rendu, en lecture seule** | le worktree et la vue du `.git` pour le reviewer ; le ticket remis au cook (#174) |
| **Lecture seule** | toute la machine, **et le répertoire personnel du compte** (`.gitconfig`, chaînes d'outils, binaire `claude`) |
| **Au projet, en écriture** | ce qui s'écrit sous `~` : `.cache`, `.npm`, `.claude.json`, toute entrée que le compte n'a pas, et ce que nomme `BRIGADE_SANDBOX_PRIVATE` — dans `<état>/compte` |
| **En écriture, tel quel** | `/tmp` |
| **Remplacé** | `~/.claude` : celui du projet (`<état>/claude`) — ni les transcripts ni la mémoire d'un autre projet |
| **Identifiants Max** | `~/.claude/.credentials.json`, monté par-dessus **en lecture seule** |
| **Process** | les siens seulement : ni `ps` ni `/proc/<pid>/environ` ne montrent un autre cook |

Le runtime refuse de démarrer si `BRIGADE_STATE_DIR`, `BRIGADE_REPO_DIR`, `BRIGADE_SECRETS_FILE` ou
`BRIGADE_GITHUB_APPS_DIR` n'est pas sous une racine masquée : une cloison qui laisse dehors ce
qu'elle doit cacher n'en est pas une. Un masque qui est un fichier est refusé aussi.

Les juges du manager partent de `/tmp`, sans dépôt. Le `claude auth status` du démarrage et tout ce
que le runtime fait lui-même (`git`, `gh`) ne sont pas cloisonnés : c'est lui la frontière.

**Rien de ce qu'un cook écrit n'est lu comme configuration ni exécuté par le runtime** (renvoi 1 de
la revue). Le `git`, le `gh` et le `claude` du runtime tournent hors cloison, sous le même compte et
dans le même clone : un `~/.gitconfig`, un `.git/config`, un hook ou un binaire sous `~` qu'un cook
pourrait écrire seraient exécutés par le runtime, pour tous les projets. D'où deux doublures, plutôt
que deux fichiers montés en lecture seule — un fichier monté ne se remplace pas, et `git` écrit sa
config en la remplaçant (`EBUSY`) :

- **Le compte** : à sa place, le répertoire du projet (`<état>/compte`), inscriptible, et
  par-dessus chaque entrée du vrai, en lecture seule. Les caches sont ceux du projet, froids au
  premier lancement. `.claude.json` est copié une fois, puis vit sa vie.
- **Le `.git`** : à sa place, une vue par worktree (`<état>/vues-git/…`, masquée, donc atteinte
  seulement montée) dont la `config` est une copie de la vraie et les `hooks` un répertoire vide ;
  par-dessus, chaque répertoire du vrai `.git`. `git config`, `remote add`, `switch --track`, un
  sous-module, husky y écrivent ; cela tient du setup au cook et part avec le worktree. Les
  fichiers du vrai `.git` (`HEAD`, `packed-refs`, créé s'il manque) sont en lecture seule : `git
  gc` n'y range plus les références — né dans la vue, `packed-refs` aurait emporté la branche du
  cook. Pour la même raison, le clone servi ne range jamais ses références seul (`gc.auto=0`,
  `maintenance.auto=false`, posés dans sa config) : le `git fetch` du runtime ne déplace pas la
  branche d'un cook vivant. Avant chaque lancement, le runtime retire de la vue ce qu'un cook y aurait laissé à la
  place d'un point de montage.

**Le `git` du runtime dans un worktree de cook : un dépôt imposé, pas une cloison de plus**
(#213). Le runtime lance `git` dans le worktree d'un cook hors cloison — statut de chaque tick,
récolte, retour d'une branche. Or un worktree désigne lui-même son dépôt, par des fichiers que le
cook écrit : son fichier `.git`, le `commondir` de `<clone>/.git/worktrees/<id>/`, le `.git` d'un
sous-module. Deux pistes :

- *Lancer ce `git` cloisonné, en lecture seule.* Écarté : la récolte **écrit** (index, commit,
  référence), donc il faudrait une cloison en écriture, et la commande du cook y tournerait quand
  même — contenue, mais lancée, avec le `.git` du clone sous la main. Cela coûte un `bwrap` par
  tick et par cook. Et cela ne vaut rien sans cloison.
- *Imposer le dépôt et neutraliser.* **Retenu**, parce qu'il vaut avec et sans cloison et ne coûte
  aucun process : `--git-dir` et `--work-tree` imposés, `GIT_COMMON_DIR` posé sur le `.git` du
  clone, `core.fsmonitor=false`, `core.hooksPath=/dev/null`, `submodule.recurse=false`, et les
  sous-modules laissés hors du statut (`--ignore-submodules=all`) comme de la récolte (exclus du
  `git add`, un par un).

Trois choses mesurées (git 2.50), qui font la forme du code :

- **`GIT_COMMON_DIR` n'impose pas les références.** Configuration et objets viennent bien du
  répertoire imposé, mais `git` cherche encore les références par le fichier `commondir` : avec
  un `commondir` réécrit, la récolte était commitée sur une branche du dépôt du cook, et la
  station poussait l'ancienne — sans rien dire. Le runtime lit donc `commondir` lui-même et
  **refuse** s'il ne mène pas au clone. Le fichier `.git`, pareil : il doit nommer un répertoire
  de `<clone>/.git/worktrees/`, sans lien.
- **`-c core.fsmonitor=false` suit `git` dans un sous-module, pas le reste** : un filtre `clean`
  de la configuration du sous-module y est lancé quand même. Il ne suffit pas de neutraliser, il
  faut ne pas descendre.
- **`git add --all` descend dans un sous-module suivi**, même sous `diff.ignoreSubmodules=all`,
  et n'a pas d'option pour s'en abstenir : la récolte les exclut par chemin, d'après l'index.

Un fichier détourné est un **refus qui se lit**, pas un silence : worktree illisible au tick,
livraison échouée et worktree gardé à la fin du cook.

Ce que ce choix laisse ouvert : un sous-module n'est ni regardé ni récolté ; un clone où
`extensions.worktreeConfig` est activé fait lire un `config.worktree` que le cook écrit (il ne
peut pas l'activer sous cloison) ; entre la lecture de `commondir` par le runtime et celle de
`git`, un cook vivant peut le réécrire — la configuration reste celle du clone, seule l'empreinte
d'un tick peut en être faussée ; les répertoires d'administration étant partagés, un cook peut
faire refuser la livraison d'un voisin ; sans cloison, la `config` du clone reste au cook. Les
worktrees jetables de la pass ne sont pas concernés : le runtime n'y lance `git` (le merge)
qu'avant d'y faire tourner quoi que ce soit, et ne fait ensuite que les retirer — ce qui ne lit
aucune configuration du worktree, mesuré aussi.

**Le signal d'arrêt traverse.** Le superviseur envoie SIGTERM au groupe puis SIGKILL après la
grâce. `bwrap` ne relaie aucun signal et mourrait du SIGTERM en emportant le cook : il est lancé
sourd à SIGTERM, et la commande retrouve le sien (`env --default-signal=TERM`). Éprouvé sous Linux.

### La liste blanche

| Hôte | Pourquoi |
|---|---|
| `anthropic.com`, `claude.ai`, `claude.com` et leurs sous-domaines | le modèle, par la connexion Max |
| `github.com`, `githubusercontent.com` et leurs sous-domaines | le dépôt, les issues, les archives |
| ce que le dépôt déclare dans `.claude/brigade/reseau` | **ses registres de paquets** et le reste |

Aucun registre n'est ouvert d'office : « les registres du projet » sont ceux qu'il nomme. Un hôte
par ligne, `#` commente ; `*.exemple.org` ouvre les sous-domaines ; `hôte:port` ouvre un autre port
que 443 et 80. Ni adresse IP, ni `*` seul, ni `*.com`.

La déclaration se lit **sur la branche d'intégration du clone**, pas dans le worktree du cook — à
l'inverse des secrets : un cook qui ajoute un nom de secret ne gagne rien, un cook qui ajouterait
un hôte s'ouvrirait la porte. Le runtime la relit à chaque tick et écrit au journal ce qui change
(`network.declared`) ; la porte lit sa liste là.

**Un refus se lit.** Par la porte : `403`, sur-le-champ, avec l'hôte et le geste qui l'ouvre ; et
un événement `network.refused` au journal (hôte, port, nombre de tentatives — un par hôte et par
dix minutes au plus). Par la porte, jamais un délai d'attente. Ce qui la contourne exprès n'aboutit
pas ; une connexion TCP dont le noyau jette les paquets attend sans doute le délai de son client —
non observé.

**Le runtime passe par la porte aussi** (`BRIGADE_PROXY_PORT`) : il pose `HTTPS_PROXY`,
`HTTP_PROXY` et `NO_PROXY` pour lui-même et pour tout ce qu'il lance. Au démarrage, il sonde le
filtre par un datagramme vers une adresse que personne ne porte : le filtre de l'unité jette les
paquets à la sortie et le noyau rend ce refus à qui envoie (`EPERM`), alors qu'une connexion TCP
attendrait dans les deux cas. Refusé, le filtre tient ; parti, il **dit** que la porte n'est qu'une
politesse ; sans réponse, il ne conclut rien. **Ce verdict n'a jamais vu un vrai filtre** : c'est un
indice, que la recette confirme.

### Sans cloison, il le dit

Les deux moitiés sont facultatives et indépendantes. Absentes, le runtime tourne comme hier et
l'annonce au démarrage : les projets servis sous ce compte se voient, et les cooks joignent tout.
L'état de la cloison entre au journal (`isolation.configured`, quand il change).

### Ce que le chef lit

`npm --prefix runtime run cloison` : ce qui est masqué, ce qui est en lecture seule, la liste
blanche avec l'origine de chaque hôte, et les derniers refus avec leur motif — du journal, sans
variable d'environnement autre que `BRIGADE_STATE_DIR`.

`npm --prefix runtime run cloison -- eprouver [<essais>]`, avec l'environnement du service :
lance de vraies sondes dans la cloison (racines masquées vides, identifiants non inscriptibles,
process des autres invisibles, `claude` qui répond), et **mesure le coût** d'un lancement cloisonné
— temps et mémoire résidente —, multiplié par le plafond de cooks.

## Ce que ça coûte par cook

Mesuré le 2026-10-09 dans un Linux (noyau 6.x, bubblewrap 0.8.0, Node 26) sur le poste de dev, par
`cloison -- eprouver` — à refaire sur la box, c'est la recette :

| | Sans cloison | Avec | Par lancement | À 30 cooks |
|---|---|---|---|---|
| Temps de démarrage (médiane de 50 `true`) | 0,4 ms | 1,8 ms | **+1,4 ms** (jusqu'à +7 ms poste chargé) | +40 ms cumulés |
| Mémoire résidente tant que le lancement vit (les deux process `bwrap`) | — | 3,1 Mo | **+3,1 Mo** | **+94 Mo** |

La garde machine (#98) exige 1 024 Mo libres par défaut et réserve 512 Mo à un cook qui vient de
partir : la cloison pèse moins d'un centième d'un cook. La mémoire est comptée large — résidente,
pages partagées comprises. La porte est un process Node par projet, pas par cook.

Éprouvé au même endroit avec le vrai `bwrap` : les racines masquées sont vides, le fichier de
secrets et le journal du projet introuvables, un commit passe dans le worktree, la vraie `config` et
les vrais `hooks` du clone restent intacts, les identifiants se lisent et ne se réécrivent ni ne se
retirent, `~/.claude` est celui du projet, `~/.gitconfig` et un binaire sous `~` ne s'écrivent pas,
le cache s'écrit dans le compte du projet, `git config`, `remote add`, `switch --track`, un
sous-module et un hook husky passent sans toucher la vraie config, les process de l'hôte sont
invisibles, un port de la boucle locale de l'hôte se joint, le setup rend ses exports par le canal,
SIGTERM laisse sa grâce au cook et rend son code, SIGKILL ne laisse aucun survivant. Et la porte,
avec le vrai réseau : `curl`, `git`, `npm` et le `fetch` du runtime passent vers GitHub et un
registre déclaré, et sont refusés en 13 ms ailleurs.

## Ce qui reste non garanti (à écrire dans la doc)

- **Rien de tout cela n'a tourné sur la box.** La mécanique est testée derrière un faux `bwrap`,
  et la vraie est éprouvée dans un Linux du poste de dev. Le filtre de l'unité (`IPAddressDeny`)
  et `claude` sous cloison ne se prouvent que là-bas.
- **Le jeton Max se renouvelle peut-être mal en lecture seule** : si `claude` veut réécrire ses
  identifiants depuis un cook, il ne le peut pas. À regarder sur la box sur la durée d'un jeton.
- **Les identifiants Max restent lisibles du cook** — `claude` les lit. « Non copiables » tient à
  ceci : aucune sortie que la liste blanche, et aucun montage inscriptible partagé hors du projet.
  Reste **la branche poussée** : un cook qui commite le fichier le fait pousser. Le runtime n'ouvre
  jamais ce fichier, donc ne le cherche pas dans une livraison.
- **Le répertoire personnel reste lisible de tous les projets** (en lecture seule), et **la boucle
  locale est commune** : un service qui écoute sur `localhost` est joignable de tous. La porte d'un
  autre projet aussi.
- **Un sous-module n'est ni regardé ni récolté**, et **un clone où `extensions.worktreeConfig`
  est activé** fait lire au `git` du runtime un fichier du cook — ce que laisse le choix de #213,
  voir plus haut.
- **`git gc` et `git pack-refs` échouent sous cloison**, et le cache du compte n'est plus partagé
  entre projets.
- **La résolution de noms reste ouverte** (le résolveur local) : un tunnel DNS sort.
- **`github.com` est en liste blanche** : sous l'identité unique, le cook y écrit avec le compte de
  la machine. La clôture est une identité par rôle (#174).
- **Un hôte s'ouvre par un merge** : une livraison qui touche `.claude/brigade/reseau` et que la
  pass merge sous grant ouvre l'hôte au cook suivant. Le journal le dit ; rien ne l'arrête.
- **`git` en SSH ne passe pas** : l'origine du clone doit être en `https`.

## Hors scope

L'accès prod ; le runner Mac ; l'arbitre entre projets (#178) ; un espace réseau par cook ; l'arrêt
de la pass sur une livraison qui touche la déclaration du réseau.

## Plan

1. `cloison.ts` : configuration, enveloppe `bwrap` — tests unitaires derrière un faux.
2. `gates.ts`, `station.ts`, `pass.ts`, `manager.ts`, `installation.ts` : chaque lancement passe par
   la cloison.
3. `reseau.ts` : règles, déclaration, variables de relais, publication au journal.
4. `porte.ts`, `tenir-porte.ts` : le relais, ses refus, son journal.
5. `montrer-cloison.ts`, `eprouver.ts` : ce que le chef lit, les sondes, la mesure.
6. `main.ts` : câblage, annonces. `deploy/` : `brigade-porte@.service`, `cloison.conf`.
7. `docs/runtime.md`, `docs/installer.md`.
