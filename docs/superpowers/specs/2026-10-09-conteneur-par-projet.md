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
| **Rendu, en écriture** | son worktree ; le `.git` du clone (sans sa `config` ni ses `hooks`, en lecture seule — sinon un cook ferait exécuter du code par le `git` du runtime, hors cloison) |
| **Rendu, en lecture seule** | le worktree et le `.git` pour le reviewer ; le ticket remis au cook (#174) |
| **Lecture seule** | toute la machine (`/usr`, `/etc`…) |
| **En écriture, tel quel** | le répertoire personnel du compte (caches, chaînes d'outils, `.gitconfig`) et `/tmp` |
| **Remplacé** | `~/.claude` : celui du projet (`<état>/claude`) — ni les transcripts ni la mémoire d'un autre projet |
| **Identifiants Max** | `~/.claude/.credentials.json`, monté par-dessus **en lecture seule** |
| **Process** | les siens seulement : ni `ps` ni `/proc/<pid>/environ` ne montrent un autre cook |

Le runtime refuse de démarrer si `BRIGADE_STATE_DIR`, `BRIGADE_REPO_DIR`, `BRIGADE_SECRETS_FILE` ou
`BRIGADE_GITHUB_APPS_DIR` n'est pas sous une racine masquée : une cloison qui laisse dehors ce
qu'elle doit cacher n'en est pas une.

Les juges du manager partent de `/tmp`, sans dépôt. Le `claude auth status` du démarrage et tout ce
que le runtime fait lui-même (`git`, `gh`) ne sont pas cloisonnés : c'est lui la frontière.

**Le répertoire personnel reste commun et inscriptible.** C'est le prix de « ne casse pas ce qui
fonctionne » : `npm ci` écrit son cache sous `~/.npm`, une chaîne d'outils (`nvm`, `rustup`) se
lit sous `~`, `git` y lit l'identité du commit. Le chef y ajoute ce qu'il veut cacher (`~/.ssh`,
`~/.config/gh`) par `BRIGADE_SANDBOX_HIDDEN`.

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
dix minutes au plus). Hors de la porte : le noyau rend `EPERM` à la connexion, aussitôt. Jamais un
délai d'attente.

**Le runtime passe par la porte aussi** (`BRIGADE_PROXY_PORT`) : il pose `HTTPS_PROXY`,
`HTTP_PROXY` et `NO_PROXY` pour lui-même et pour tout ce qu'il lance. Au démarrage, il tente une
connexion directe : refusée par le noyau, le filtre tient ; aboutie ou sans réponse, il **dit** que
la porte n'est qu'une politesse.

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
| Temps de démarrage (médiane de 50 `true`) | 0,4 ms | 1,5 ms | **+1,1 ms** (+3,1 ms poste chargé) | +33 à +93 ms cumulés |
| Mémoire résidente tant que le lancement vit (les deux process `bwrap`) | — | 3,1 Mo | **+3,1 Mo** | **+94 Mo** |

La garde machine (#98) exige 1 024 Mo libres par défaut et réserve 512 Mo à un cook qui vient de
partir : la cloison pèse moins d'un centième d'un cook. La mémoire est comptée large — résidente,
pages partagées comprises. La porte est un process Node par projet, pas par cook.

Éprouvé au même endroit avec le vrai `bwrap` : les racines masquées sont vides, le fichier de
secrets et le journal du projet introuvables, un commit passe dans le worktree, la `config` et les
`hooks` du clone sont en lecture seule, les identifiants se lisent et ne se réécrivent ni ne se
retirent, `~/.claude` est celui du projet, le cache du compte s'écrit, les process de l'hôte sont
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
  ceci : aucune sortie que la liste blanche, et aucun montage inscriptible partagé hors du compte.
  Reste **la branche poussée** : un cook qui commite le fichier le fait pousser. Le runtime n'ouvre
  jamais ce fichier, donc ne le cherche pas dans une livraison.
- **Le répertoire personnel et la boucle locale sont communs aux projets** : un cache, un service
  qui écoute sur `localhost` sont joignables de tous. La porte d'un autre projet aussi.
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
