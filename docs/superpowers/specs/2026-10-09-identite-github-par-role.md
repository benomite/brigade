# Une identité GitHub par rôle (#174)

Jalon 7 de la V2 (épique #179). Pilote : `BOBL-tech/calculus-workspace` — une organisation, un dépôt
privé, une branche d'intégration qui est `main`, et des humains qui y travaillent.

## Le problème

Aujourd'hui tout passe par le `gh` et le `git` de la machine : une seule identité GitHub pour le
cook, la station, la pass et le manager. Une protection de branche ne distingue que des acteurs
différents ; « seule la pass merge » ne tient donc qu'à la liste d'outils interdits au cook.

## Ce qui est tranché

### Trois Apps, pas une, pas quatre

| Identité | Ce qui agit sous elle | Droits du jeton (dépôt du projet seul) |
|---|---|---|
| **cook** | la station, pour le compte du cook : rapatrier la base, pousser `cook/<run>`, ouvrir la PR | `contents: write`, `pull_requests: write` |
| **pass** | la pass : lire PR et CI, merger, fermer l'issue, y commenter son verdict | `contents: write`, `pull_requests: write`, `issues: write`, `checks: read`, `statuses: read` |
| **manager** | le manager et le rail : sonder les issues, labels de rail et de calibrage, commentaires, issues nées d'un découpage, corps d'une épique — et ce que la station dit sur l'issue | `issues: write` |

Pourquoi ce nombre :

- **Pas une** (ce que disait la spec V2, « une GitHub App par dépôt ») : GitHub ne donne qu'une
  identité à une App. Une protection de branche ne pourrait pas laisser merger la pass sans laisser
  merger celui qui pousse les branches de cook.
- **Pas deux** (pass / tout le reste, avec des jetons réduits par rôle) : la réduction des droits
  d'un jeton est faite par le runtime, pas par GitHub. La clé qui fabrique les jetons du manager
  fabriquerait aussi ceux du cook ; et un label posé par le manager se lirait sous le même nom
  qu'une PR de cook. Le ticket demande des identités distinctes, lisibles par des humains.
- **Pas quatre** : le **reviewer n'a aucun geste GitHub**. C'est un `claude` lancé sans jeton dans un
  worktree jetable ; son verdict est un fait du journal, publié par la pass dans son commentaire.
  Une App pour lui serait une quatrième clé sur la machine pour zéro appel. Le critère « identités
  distinctes » est tenu par le plus fort : il n'en a pas.
- **Pas une par cook** : les cooks sont interchangeables, et la PR nomme déjà son ticket et son run.

### Le cook lui-même n'a aucun jeton

Le cook ne pousse pas, n'ouvre pas de PR, ne commente pas : la station le fait. Il ne reçoit donc
**rien** — ni jeton d'écriture, ni jeton de lecture. Conséquence, sur un dépôt privé : il ne peut
plus lire son ticket par `gh issue view`. En mode Apps, la station **lui remet le ticket en
fichier** (`runs/<run>.ticket.md` : titre, corps, commentaires avec leur auteur), hors de son
worktree, et la consigne l'y envoie.

L'identité « cook » est donc celle sous laquelle la station livre *pour* lui. Ce que la station dit
sur l'issue (compte-rendu, motif d'échec) part sous l'identité **manager** : commenter une issue
réclame `issues: write`, qui permet aussi de la fermer et de la labelliser — ce que l'identité cook
ne doit pas pouvoir.

### Jetons courts, réduits, jamais écrits

- Un jeton d'installation par rôle, demandé à GitHub avec `repositories: [<dépôt>]` et les droits du
  tableau : même si l'App est installée plus large ou a reçu plus de droits, le jeton ne vaut que
  pour ce dépôt et ce rôle. Il expire en une heure (GitHub).
- Le runtime le garde **en mémoire**, le redemande dix minutes avant sa fin, et l'entretient à
  chaque tick : un geste de la pass ou un push de fin de cook, même après des heures, part avec un
  jeton vivant. Aucun process long (cook, gates, reviewer, juge du manager) n'en reçoit.
- Il n'atteint `gh` et `git` que par **l'environnement du process lancé pour un geste** (`GH_TOKEN` ;
  `GIT_CONFIG_*` pour l'en-tête HTTP) — jamais par un argument, jamais dans un fichier, un
  événement ou un message d'erreur.
- L'échange (JWT signé par `node:crypto`, puis `POST /app/installations/<id>/access_tokens`) passe
  par `fetch`, pas par `gh` : un JWT en argument de commande se lirait dans `ps`.
- La clé privée : un fichier par rôle, `0600` exigé (sinon refus de démarrer), lu au démarrage.

### Configuration

Une variable, facultative : `BRIGADE_GITHUB_APPS_DIR`, un répertoire qui porte, pour chacun des
trois rôles, `<rôle>.id` (l'identifiant de l'App) et `<rôle>.pem` (sa clé privée).

- **Absente** : identité unique, comme aujourd'hui. Le runtime le **dit** au démarrage, et rien
  d'autre ne change — ni la consigne du cook, ni son environnement.
- **Présente** : les six fichiers sont exigés ; l'un manque, une clé est lisible par d'autres, deux
  rôles portent la même App → refus de démarrer, qui nomme le fichier.

`BRIGADE_GITHUB_API_URL` existe pour les tests (comme `BRIGADE_GH_BIN`) : jamais posée sur la box.

### Ce que le cook, les gates et les juges voient de GitHub en mode Apps

Leur environnement perd `GH_TOKEN`, `GITHUB_TOKEN` et leurs variantes, y compris ceux qu'un setup
exporterait — pour le cook comme pour les gates, qui rejouent le setup et exécutent le code du cook ; `GH_CONFIG_DIR` pointe sur un répertoire vide et `GIT_TERMINAL_PROMPT=0`. C'est une
propreté, pas la clôture : la clôture est que ces process **ne reçoivent** aucun jeton, et que la
protection de branche refuse tout autre acteur que la pass.

### `merge.done` dit qui

- `PR` gagne `mergeePar` (le `merged_by.login` de GitHub).
- `merge.done` gagne `actor` (facultatif : les journaux d'avant se rejouent) : le compte qui a
  mergé — celui que GitHub nomme quand la pass constate un merge, l'identité de la pass quand elle
  vient de le faire elle-même.
- En mode Apps, `by` n'est plus supposé : il vaut `pass` si et seulement si GitHub nomme
  l'identité de la pass. Le cas qui change : un merge retrouvé au redémarrage après une intention
  sans résultat était mis au compte de la pass sans preuve ; fait à la main entre-temps, il est
  maintenant `outside`, et la base est contrôlée.
- En identité unique, rien ne distingue le compte de la pass de celui du chef : `by` reste
  déclaratif, et `actor` n'est connu que lorsqu'il a été lu sur GitHub.
- `npm run pass -- <ticket>` l'affiche.

## Ce qui reste non garanti (à écrire dans la doc)

- **Le cook tourne sous le compte Unix du runtime.** Il peut lire ce que ce compte peut lire : les
  clés des Apps, un `gh auth login` ou une clé SSH restés sur la machine. Le runtime ne lui *donne*
  rien, il ne l'*empêche* pas de chercher. Clôture : le conteneur (#176). D'ici là, la box ne doit
  porter ni `gh` connecté ni clé SSH enregistrée chez GitHub.
- **Le runtime tient les trois clés** : c'est lui la frontière. Une faille du runtime vaut les trois
  rôles.
- **La protection de branche est un réglage du dépôt**, posé par le chef : le runtime ne la vérifie
  pas. Sans elle, l'identité cook (`contents: write`) peut pousser sur la base.
- **Les humains du dépôt** gardent leurs droits : un merge à la main reste possible, vu comme
  `outside` et contrôlé après coup.
- En **identité unique**, rien de tout cela n'est clos : c'est l'état d'avant.

- **Un ticket qui touche `.github/workflows/` ne se pousse pas en mode Apps.** GitHub exige d'une
  App le droit `workflows` pour cela, et l'identité cook ne l'a pas : qu'un cook puisse réécrire la
  CI d'un projet est une décision du chef, pas un défaut du runtime. Le cook échoue
  (`push-failed`), et le motif nomme le droit manquant. Sous l'identité unique, ce push passait.

## Ce que joue le chef (recette, hors dépôt)

Créer les trois Apps sur l'organisation, les installer sur le seul dépôt du projet, poser clés et
identifiants sur la box, et une règle (ruleset) sur la branche d'intégration qui réserve sa mise à
jour à l'App **pass** et aux humains qui mergent déjà. Puis : demander à un cook de merger — il
échoue ; lire `npm run pass` — le merge porte l'identité de la pass. Le parcours est écrit dans
`docs/runtime.md`, « Une identité GitHub par rôle ».

## Hors scope

Secrets du projet (#175), conteneur (#176), authentification du MCP, accès multi-humains, GitHub
Enterprise (l'hôte `github.com` est supposé).

## Plan

1. `identites.ts` : configuration, JWT, échange, cache et entretien des jetons, identité (`GET /app`)
   — tests contre un faux serveur HTTP local.
2. `github.ts` : jeton par appel dans l'environnement de `gh`, `mergeePar`, `identite()` ; un GitHub
   par rôle, composé pour la station et la pass.
3. `depot.ts` : jeton dans l'environnement des gestes réseau de `git`.
4. `claude.ts` / `station.ts` : environnement sans GitHub, ticket remis en fichier, consigne.
5. `pass.ts`, `evenements/pass.ts`, `montrer-pass.ts` : `actor`, `by` vérifié.
6. `main.ts` : câblage, annonce du mode, entretien au tick.
7. `docs/runtime.md` : section neuve, variables, box, recette, « Ce que la pass ne garantit pas ».
