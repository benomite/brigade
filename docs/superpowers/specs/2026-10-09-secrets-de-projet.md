# Les secrets d'un projet parviennent à ses cooks, et à eux seuls (#175)

Jalon 7 de la V2 (épique #179). Spec V2, §Isolation et secrets : « **Secrets de dev** : un fichier
par projet, monté uniquement dans son conteneur. Jamais de prod. »

## Le problème

`brigade` n'a aucun secret ; un vrai projet n'avance pas sans — une base de test, un service tiers
en bac à sable, une clé d'API de développement. Aujourd'hui, la seule façon de donner une valeur à
un cook est de la faire exporter par `worktree-setup.sh`, qui est **versionné** : une valeur secrète
n'y a pas sa place. Reste l'environnement du runtime, que le cook hérite en vrac — c'est-à-dire
poser les secrets du projet dans l'unité systemd, à côté de ce que le runtime garde pour lui, sans
rien qui dise ce qui est attendu, ce qui manque, ni ce qui doit être caché.

## Ce qui est tranché

### Deux ensembles : des noms dans le dépôt, des valeurs sur la machine

| | Où | Ce qu'il porte |
|---|---|---|
| **La déclaration** | `.claude/brigade/secrets`, dans le dépôt du projet, versionné | des **noms** de variables, un par ligne (`#` commente) |
| **Les valeurs** | le fichier que nomme `BRIGADE_SECRETS_FILE`, sur la machine, hors dépôt | `NOM=valeur`, une par ligne |

Un cook reçoit **l'intersection** : les variables que son dépôt déclare, avec la valeur que la
machine détient. Une valeur que le dépôt ne déclare pas n'est donnée à personne ; un nom déclaré
sans valeur est un secret qui manque (voir plus bas).

La déclaration se lit **dans le worktree du cook**, comme le setup : c'est la branche qui dit ce
dont elle a besoin. Un cook qui ajoute un nom à la déclaration ne gagne rien de plus que ce que le
chef a posé dans le fichier de **ce** projet.

Le fichier de valeurs :

- **facultatif** (`BRIGADE_SECRETS_FILE` absente : le projet n'a pas de secret, rien ne change) ;
- un chemin absolu, **hors de `BRIGADE_STATE_DIR` et hors de `BRIGADE_REPO_DIR`** — donc hors de ce
  que `sauvegarder` emporte et hors de tout worktree — sinon refus de démarrer ;
- `0600` exigé (`chmod 600`), au démarrage **et à chaque lecture** ;
- relu **à chaque lancement** (cook, setup, gates) : une valeur se remplace sans redémarrer.
- Format : `NOM=valeur`, la valeur va jusqu'à la fin de la ligne ; un `export ` devant et une paire
  de guillemets autour sont retirés ; `#` commente ; pas de valeur sur plusieurs lignes, aucune
  interpolation.

### Le chemin des secrets n'est pas celui de l'environnement du runtime

La règle du jalon 1 reste entière : l'environnement du cook est celui du runtime moins `BRIGADE_*`
et moins ce qui détournerait `claude` de la connexion Max, et un setup n'y fait entrer ni clé
Anthropic ni (sous une identité par rôle) jeton GitHub. Les secrets du projet n'y passent pas : ils
sont **ajoutés** par le runtime, nommément, au moment du lancement.

Les noms que le runtime se réserve ne peuvent pas être déclarés : `BRIGADE_*`, `ANTHROPIC_*`,
`CLAUDE_*`, `GH_*`, `GITHUB_*`, `GIT_*`, `PATH`, `HOME`. Un projet ne peut donc pas, par ce chemin,
donner à un cook une clé de modèle ni un jeton GitHub — c'est l'affaire de #174.

### Qui les reçoit

| Process | Reçoit les secrets ? | Pourquoi |
|---|---|---|
| le setup du worktree | oui | c'est lui qui prépare la base de test |
| le cook | oui | c'est l'objet |
| les gates (pass : livraison, rencontre, contrôle de la base) | oui | elles jouent les tests du projet, qui ont besoin de la même base ; même projet, même code |
| le reviewer | **non** | il lit un diff, il n'exécute rien du projet |
| les juges du manager | **non** | ils lisent des tickets |

### Un secret qui manque arrête avant le lancement

Avant le setup et avant le cook, la station lit déclaration et valeurs. Au moindre problème,
**aucun cook n'est lancé** : le ticket passe 86 dix minutes (motif `secrets-unavailable`), puis
revient seul — comme un setup en échec, rien n'est consommé et le disjoncteur ne compte rien. Le
problème est écrit au journal (`secrets.unavailable`, des noms, jamais une valeur) et **commenté
sur l'issue, une fois** : le commentaire n'est reposé que si la liste des problèmes change.

Ce qui est un problème : un nom déclaré absent du fichier, `BRIGADE_SECRETS_FILE` non défini alors
que le dépôt déclare, fichier absent / lisible par d'autres / ligne mal écrite, nom mal écrit ou
réservé, valeur trop courte, marque de production.

Côté pass, des gates qui ne peuvent pas recevoir leurs secrets ne sont **pas jouées** — jamais
rouges pour cela, un renvoi au cook n'y changerait rien : la livraison est remontée au chef
(`secrets-unavailable` ; elle n'est pas rejugée seule — reposer `fire` relance un cook), une rencontre remonte `replay-failed`, un contrôle de base est « non
joué » avec son motif.

### Le masquage

Partout où un texte venu d'un process qui a reçu les secrets est gardé ou publié, chaque valeur
est remplacée par `[secret:NOM]` :

- le flux brut du cook (`runs/<run>.jsonl`, `.stderr`), **à l'écriture** — tout ce qui en découle
  (compte-rendu, `cook.reported`, commentaire d'issue, corps de PR, consigne de renvoi) est donc
  déjà masqué ;
- la sortie du setup et des gates que le runtime garde (journald, `failures` et `tail` au journal,
  commentaire de la pass, consigne de renvoi) ;
- le flux du reviewer : il ne reçoit aucun secret, mais il lit un worktree où les gates viennent
  de tourner avec eux.

Sont masquées la valeur exacte et sa forme échappée en JSON (celle qu'elle prend dans le flux).

**La règle des valeurs courtes : moins de 8 caractères, ce n'est pas un secret, et le runtime la
refuse.** Masquer `test` ou `1234` rongerait la moitié d'un compte-rendu ; ne pas les masquer
ferait deux sortes de secrets. Une valeur courte ou banale est une configuration : elle va dans les
exports de `worktree-setup.sh`. Tout ce que porte le fichier de secrets est masqué, sans exception.

**Une livraison qui porte un secret n'est pas poussée.** Avant le push, la station cherche les
valeurs dans tout ce que la branche ajoute (patchs et messages de commit, récolte comprise — un
`.env` écrit par le cook serait sinon récolté et poussé). Trouvée : le cook est en échec
(`secret-committed`), rien ne part, le ticket revient en attente, et le commentaire nomme la
variable.

- Lu en entier : un fichier binaire comme du texte (quoi qu'en dise un `.gitattributes` du cook),
  un merge contre chacun de ses parents. Ce que l'origine a déjà reçu de la branche n'est pas relu.
- **Sur un renvoi**, le cook suivant reprend la même branche : la station la ramène à la livraison
  refusée (ce que le cook fautif y avait ajouté est perdu), sinon tout cook suivant échouerait
  jusqu'au disjoncteur. Sur un premier cook, le suivant repart de la base.

### « Jamais de prod » : ce que le runtime refuse, et rien de plus

Le runtime ne sait pas ce qu'une valeur ouvre. Il refuse ce qui se reconnaît :

- un **nom** qui dit la production (`PROD`, `PRODUCTION`, `LIVE` comme mot du nom) ;
- une **valeur** qui porte une marque connue de clé de production (`sk_live_`, `rk_live_`).

Le reste tient à ce que le chef pose dans le fichier. Aucun grant n'y touche : les secrets ne
passent par aucun grant, et aucune action de grant ne les élargit.

## Ce qui reste non garanti (à écrire dans la doc)

- **Le cloisonnement entre projets tient aux droits de fichiers** tant que le conteneur (#176)
  n'existe pas. Un cook tourne sous le compte Unix du runtime : il peut lire le fichier de son
  projet en entier (pas seulement ce qui est déclaré), et celui d'un autre projet servi sous le
  même compte. D'ici #176 : un compte Unix par projet, ou rien de sensible.
- **Le masquage est un filet contre l'accident, pas une clôture contre un cook qui veut sortir une
  valeur** : transformée (base64, coupée en deux, un fragment d'URL), elle passe. La clôture est que
  ce sont des secrets de dev, et le réseau en liste blanche de #176.
- Le transcript de session que `claude` écrit sous `~/.claude/projects` n'est pas masqué : il reste
  sur la machine, sous le compte.
- Ce que les gates du projet écrivent elles-mêmes sur le disque (`.brigade-state/gates/` chez
  brigade) est au projet.
- Un secret remplacé pendant qu'un cook tourne ne l'atteint pas : il vaut pour le lancement suivant.

## Hors scope

Le conteneur et le réseau (#176) ; le jeton GitHub des rôles (#174) ; une commande pour poser un
secret (le fichier s'édite) ; le chiffrement au repos.

## Plan

1. `secrets.ts` : configuration (`BRIGADE_SECRETS_FILE`), lecture de la déclaration et des valeurs,
   problèmes, masque, recherche de fuite — tests unitaires.
2. `superviseur.ts` / `garde-fous.ts` : flux brut masqué à l'écriture, ligne à ligne.
3. `gates.ts` : sortie du setup et des gates masquée.
4. `depot.ts` : ce que la branche ajoute (patchs et messages).
5. `station.ts` : lecture avant setup, refus avant lancement (86, journal, commentaire unique),
   environnement, masque, refus de pousser un secret.
6. `pass.ts` : secrets des gates, remontée quand ils manquent.
7. `main.ts` : câblage, annonce au démarrage.
8. `installation.ts` : le vérificateur lit `BRIGADE_SECRETS_FILE`, le setup à blanc reçoit les secrets.
9. `docs/runtime.md` : section « Les secrets du projet », setup, « Ce qu'un cook charge », variables,
   « Ce que la pass ne garantit pas ».
