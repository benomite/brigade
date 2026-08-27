# brigade — travail multi-agents orchestré

Quatre rôles, quatre sessions indépendantes, un backlog GitHub. Le **PO** (`/brigade:po`) alimente le backlog en issues produit priorisées ; le **Designer** (`/brigade:designer`) traite l'interface ; l'**orchestrateur** (`/brigade:manager`) qualifie, spawne et intègre ; les **dev-teammates** (`/brigade:dev`) implémentent. Isolation : **un worktree git par issue**, que le dev ou le designer crée et gère lui-même, hors du répertoire racine du dépôt.

> Toute la coordination vit dans des **artefacts durables** — issues, labels, branches, PR, issue de roadmap — jamais dans la mémoire d'une session. C'est ce qui rend le système résilient : même si l'orchestrateur meurt avec ses teammates in-process, le travail commité et poussé survit, et une nouvelle session reconstruit l'état.

Le plugin ne sait rien de votre projet. Ce qu'il ne peut pas déduire, il le lit dans un **bloc de bindings** que `/brigade:init` écrit dans votre `CLAUDE.md` ; ce qui est procédural vit dans **deux scripts** dont le plugin ne connaît que le contrat. Voir « Ce que le plugin attend du projet ».

## Installation

```bash
claude plugin marketplace add benomite/brigade
cd <votre projet> && claude plugin install brigade@brigade --scope project
```

Le dépôt est **privé** : la machine doit pouvoir le cloner. `marketplace add` tente HTTPS puis retombe sur SSH, donc une clé SSH autorisée suffit — sinon `gh auth setup-git` pour la voie HTTPS. Sur une machine distante, c'est le premier point qui casse.

Déclarer le marketplace avec `--scope project` l'écrit dans le `.claude/settings.json` du projet, à côté de `enabledPlugins` et du réglage d'équipe : le dépôt porte alors tout ce qu'il faut, et un `git clone` sur une autre machine amène la déclaration complète.

Puis, dans une session ouverte sur le projet : **`/brigade:init`**. La commande déduit ce qu'elle peut (stack, gestionnaire de paquets, commandes de test et de build, zones de fichiers), demande le reste en une passe, crée les labels et l'issue de roadmap, écrit le bloc de bindings et les deux scripts, **puis prouve leur contrat** — elle refuse de déclarer le projet initialisé si les gates ou le setup de worktree échouent. Elle est rejouable : sur un projet déjà amorcé, elle ne fait que l'écart.

### Faire descendre une mise à jour du plugin

Rien ne se propage tout seul, et c'est le piège le plus coûteux : `claude plugin update` compare la **version déclarée**. À numéro égal il ne recopie rien, **même depuis un marketplace `directory`**, et `marketplace update` n'y change rien. Un projet peut donc tourner des jours sur un cache figé.

```bash
# 1. bumper "version" dans .claude-plugin/plugin.json du plugin, puis
claude plugin marketplace update brigade
cd <votre projet> && claude plugin update brigade@brigade --scope project
# 2. si le projet a un miroir Codex :
#    /brigade:sync
```

**Les rôles le détectent désormais eux-mêmes.** `/brigade:manager` compare, à son premier point de situation, la version installée sur le projet, celle du marketplace cloné sur le poste et l'état de ce clone face au dépôt distant ; `/brigade:init` fait le même contrôle avant d'écrire quoi que ce soit. Il fallait les trois valeurs : un clone périmé fait passer pour « à jour » une installation qui a deux versions de retard. Ce qui a rendu ce contrôle nécessaire : sur un même poste, le même jour, trois projets tournaient en `0.7.0`, `0.8.0` et `0.9.0`, et c'est le plus ancien qui a produit la panne du dev-employé-permanent — deux versions après le correctif qui l'aurait évitée.

Le contrôle **signale et s'arrête ; il ne met pas à jour tout seul**, pour deux raisons. Les rôles sont chargés au démarrage de la session : jouer la mise à jour au milieu d'une conversation ne change rien à celle-ci, seulement à la suivante — c'est le genre de fausse victoire qui fait croire un correctif descendu. Et un lot de devs en vol ne doit pas voir ses règles changer en cours de route. La mise à jour se fait donc **à froid**, puis on redémarre la session.

## Prérequis et limites

- **Agent teams** (`CLAUDE_CODE_EXPERIMENTAL_AGENT_TEAMS=1`) — **prérequis dur de l'orchestrateur**, expérimental et désactivé par défaut. L'orchestrateur spawne ses devs en donnant un `name` à l'outil `Agent`, et ce paramètre n'existe pas sans ce réglage : sans lui, aucun teammate n'est créé, aucun signal ne revient. `/brigade:init` le pose dans le `.claude/settings.json` **du projet** — précédence supérieure au settings utilisateur, et versionné, donc le prérequis suit le dépôt au lieu de dépendre du poste. `/brigade:manager` le vérifie avant son premier spawn et s'arrête net s'il manque.
  Ne le vérifiez pas avec `echo $CLAUDE_CODE_EXPERIMENTAL_AGENT_TEAMS` : le harness exporte les `env` du settings dans le process, la variable paraît donc toujours active. Lisez les fichiers, et respectez leur précédence — `managed > local > project > user`, un export shell en dernier.
- **Session interactive obligatoire** pour l'orchestrateur : en mode non interactif (`-p`, SDK), aucun teammate n'est spawné, réglage actif ou pas. Il n'y a donc pas d'orchestration en cron ni en CI. Les autres rôles, eux, s'utilisent normalement.
- **`/resume` ne restaure pas les teammates** in-process. C'est ce qui rend la reprise après crash de l'orchestrateur nécessaire, et non défensive : au redémarrage, il reconstruit l'état depuis les artefacts et re-spawne les devs inachevés.
- **Pas d'équipe imbriquée** : un teammate ne peut pas spawner de teammate. La règle « seul l'orchestrateur spawne » est une contrainte de plateforme avant d'être un choix de gouvernance.
- **Coût.** Une équipe d'agents consomme plusieurs fois une session simple, et les tokens de raisonnement sont facturés en sortie. Deux réglages et une règle décident de l'ordre de grandeur :
  - `subagentPromptCacheTtl: "1h"` — les requêtes d'un teammate in-process sortent du bucket de cache de la conversation principale et retombent à 5 minutes de TTL. Un dev attend beaucoup (tests, CI, réponse de l'orchestrateur), donc son préfixe expire entre deux tours et se réécrit. `/brigade:init` pose le réglage dans le `.claude/settings.json` du projet ; les écritures 1 h sont plus chères à l'unité, et rentables dès la dizaine de tours.
  - `model` et `effort` **au spawn** — le seul moment où c'est possible, un teammate ne choisit pas le sien. Le défaut de session est un plafond, pas un point de départ : sans arbitrage explicite, tout un lot hérite du niveau du rôle le plus exigeant.
  - **Un teammate = une issue.** C'est la règle qui pèse le plus lourd, et la seule contre-intuitive : voir la panne du dev-employé-permanent ci-dessous.

## Rôles

| Rôle | Activation | Fait | Ne fait PAS |
|---|---|---|---|
| **PO** | `/brigade:po` (une session) | Brainstorme le produit, digère les retours de tests utilisateurs, **écrit les issues `product`** (Contexte + Critères d'acceptation observables), **priorise** (labels `prio:`), tient la doc produit | N'écrit aucun code applicatif (sauf copy/wording UI), ne touche pas à la roadmap, ne qualifie pas techniquement, ne merge pas, ne spawne pas |
| **Designer** | `/brigade:designer` (une session) | Traite l'**interface** : boucle avec l'outil de design déclaré, implémente la **peau** (CSS, composants de rendu, layout, état d'UI local), **fait tester** activement à l'humain, livre 1 PR | Ne touche pas à la logique métier ni à l'API (→ dev), ne merge pas (→ Manager), ne touche pas à la roadmap, n'est jamais spawné par le Manager |
| **Orchestrateur** | `/brigade:manager` (une session) | Qualifie et priorise (**applique l'ordre `prio:` du PO**), **writer unique de la roadmap**, **spawne les dev-teammates**, supervise (idle + `SendMessage`), relaie les questions de spec, **intègre full-auto** (gates → merge → push → close) — PR des devs **et** du Designer | Ne code aucune feature lui-même ; **ne spawne jamais de dev sur une issue `design`** |
| **Dev-teammate** | `/brigade:dev <n°>` | Implémente UNE issue dans SON worktree, communique par signaux normalisés, ouvre 1 PR | Ne touche jamais la branche par défaut ni la roadmap, ne merge pas, n'appelle jamais `AskUserQuestion` |

Le flux va dans un sens : **PO → backlog → Manager → devs/designer → merge**. Le PO alimente l'amont (le « quoi » produit) ; le Designer prend les issues `design` en parallèle des devs ; l'orchestrateur n'est pas un process figé, il **draine en boucle event-driven** — les notifications *idle* et les signaux des devs le réveillent — tant qu'il a du travail non bloqué. Le rôle dev est à **double usage** : spawné comme teammate par l'orchestrateur, ou lancé à la main par un humain (mode autonome, qui sert de repli). Le Designer, lui, est **toujours** humain-piloté.

## Les deux handoffs

Les sessions sont indépendantes : elles ne se parlent **que par des artefacts GitHub**.

**PO → Manager.** Le label **`product`** signifie « née du PO, à qualifier en priorité » (distinct du `triage` « hors-scope » créé par un dev) : le PO pose `product` + `triage`, le Manager qualifie et retire `triage`. Les labels **`prio:1/2/3`** portent l'ordre voulu par le PO ; le Manager **trie la roadmap selon ces labels** à chaque réveil. La roadmap garde un **writer unique — le Manager** — mais son **ordre est dicté par le PO**. Frontière d'écriture : le PO remplit le **quoi** (Contexte + Critères d'acceptation observables), le Manager ajoute le **comment** (pointeurs fichiers, pièges, qualification, place dans la roadmap). Le PO ne touche jamais à la roadmap.

**Designer ↔ Manager.** Le label **`design`** signifie « forte composante visuelle, chasse gardée du Designer » : le Manager **ne spawne jamais de dev dessus**. Le Designer peut créer des issues `design` ; PO et Manager taggent `design` ce qui relève du visuel. Le périmètre est variable — « pure peau » (Designer seul) ou « peau + logique » (Designer pour le visuel **plus** un dev pour la logique, **séquencés** sur des zones de fichiers disjointes, le Manager partitionne). Le Designer ouvre une PR `Closes #N` que le Manager **découvre à son point de situation** (`gh pr list`) et intègre avec les mêmes gates qu'une PR de dev. Le Designer **fait tester à l'humain avant de signaler `prêt`**.

## Le cycle d'une issue

1. **Qualification** (Orchestrateur) — issue `triage` → label `feature`/`fix`/`tech` (+ `design` si visuel, donc pas de dev) + critères + pointeurs + place dans la roadmap, dont l'ordre suit les labels `prio:`.
2. **Assignation** (Orchestrateur) — forme le lot, **partitionne par zone de fichiers**, **spawne les `dev-<N>` du lot parallèle en un seul message** (pool de 2-3 en pratique).
3. **Implémentation** (Dev-teammate) — crée son worktree isolé, le rend exécutable par le script de setup, applique les skills en boucle du projet. Une issue `feature` remonte ses questions de spec **groupées** par un signal, jamais une devinette produit.
4. **Livraison** (Dev-teammate) — commit et push tôt, 1 PR, signal `prêt #N (PR <url>)`.
5. **Intégration** (Orchestrateur) — gates du projet + revue de code. **Vert → merge, push, close, roadmap, en full-auto.** Rouge → findings renvoyés au dev. Puis spawn de l'issue prête suivante.

## Communication et drainage autonome

- Le **texte brut d'un teammate est invisible** pour son parent : toute remontée passe par `SendMessage`. Signaux normalisés : `question-spec #N`, `prêt #N (PR …)`, `bloqué #N`, `hors-scope #N`.
- **Les questions de spec ne bloquent pas le pipeline** : elles sont déposées en commentaire d'issue avec le label `blocked-on-human`, et l'orchestrateur **continue de drainer le reste**. Il ne sollicite l'utilisateur — questions groupées — que s'il n'a plus aucun travail non bloqué.
- **Boucle de drainage** : à chaque *idle* ou signal, l'orchestrateur intègre puis spawne l'issue prête suivante, jusqu'à backlog vide ou tout bloqué.
- **Résilience** : les teammates sont éphémères, mais worktrees, branches, commits, PR, issues et roadmap survivent. Après un crash, un nouveau `/brigade:manager` reconstruit l'état et re-spawne les devs inachevés.

## Règles non négociables (apprises à la dure)

- **Un fichier, un seul propriétaire** entre worktrees concurrents. L'orchestrateur partitionne par **zone touchée**, pas par indépendance logique — deux issues logiquement indépendantes qui éditent le même fichier doivent être séquencées.
- **La roadmap a un writer unique : l'orchestrateur.** Deux écrivains, c'est une divergence garantie.
- **Un dev-teammate ne merge jamais et n'appelle jamais `AskUserQuestion`** : il signale, l'orchestrateur arbitre.
- **Discipline de synchronisation** : le dev rebase sur la branche par défaut **au début ET avant d'ouvrir sa PR**. L'orchestrateur **pousse aussitôt après chaque merge** — ne jamais laisser la branche locale dériver de son `origin`.
- **Merge en ordre de dépendance, jamais deux à la fois.**
- **Gates de merge** : les gates du projet **plus** la revue de code, verts. Pas de merge sur la foi d'une affirmation : **preuve par sortie de commande**.
- **Découverte hors scope** → le dev crée une issue `triage` brute, signale `hors-scope`, et **continue** sa tâche. Jamais d'extension silencieuse du scope.
- **Un teammate vit pour une seule issue.** Une issue neuve se donne par un `Agent` neuf, jamais par `SendMessage` à un dev vivant. Un dev qui a livré ne reçoit plus que les findings de **sa** PR, puis plus rien. Il refuse toute réassignation par le signal `refus-réassignation`.
- **Deux renvois maximum par PR.** Au troisième aller-retour, ce n'est plus le code qui résiste : on merge avec une issue de suite, ou on remonte à l'humain.

### Quatre pannes réelles que ce protocole prévient

Elles viennent d'un projet réel, et chacune a produit une des règles ci-dessus.

- **Doublon** — deux worktrees ont implémenté la même issue en parallèle. D'où : assignation explicite par l'orchestrateur, et un fichier / un propriétaire.
- **Dérive** — la branche locale a avancé de six commits jamais poussés, et l'orchestrateur a continué à raisonner sur un état que personne d'autre ne voyait. D'où : push immédiat après chaque merge.
- **Phagocytose** — deux devs ont travaillé dans le **même répertoire racine** ; leurs commits se sont mélangés sur une seule branche, la spec et le plan de l'un ont atterri sur la branche de l'autre, dont la branche est restée vide. D'où : **un worktree isolé par issue, créé par le dev lui-même**, jamais le répertoire racine ni celui d'un autre — et `git status` avant chaque commit, qui ne doit montrer que les fichiers de son issue.
- **Dev-employé-permanent** — l'orchestrateur a gardé trois devs vivants vingt heures en leur confiant issue après issue par `SendMessage` : 7 spawns pour 49 messages, jusqu'à 721 requêtes et ~250 k de contexte par requête pour un seul dev. Ce dev a lu **177 M de tokens de cache**, contre **6,8 M** pour un dev mono-issue comparable — facteur 26, pour le même travail livré. Le contexte hérité est repayé à chaque tour de chaque issue suivante, et il franchit le seuil des 200 k, ce qui fait basculer toutes les requêtes du dev au tarif long-contexte. Le nom de l'agent finissait par mentir : un teammate nommé `dev-117` livrait l'issue #58. D'où : **un teammate = une issue**, un dev neuf par issue, et deux renvois maximum par PR. Réutiliser un dev vivant paraît économique — le contexte d'un teammate n'est pas un actif que l'on capitalise, c'est un loyer que l'on paie à chaque tour.

## Ce que le plugin attend du projet

Trois étages de couplage, et c'est ce découpage qui rend le protocole transportable.

**Ce qui se déduit** — dépôt, racine, gestionnaire de paquets, branche par défaut — est calculé par les rôles. Rien de tout cela ne s'écrit nulle part.

**Ce qui se déclare** vit dans la section `## Équipe multi-agents` de votre `CLAUDE.md`, en fin de fichier. Ce fichier étant déjà injecté dans chaque session, un rôle lit ses bindings **sans aucun appel d'outil**. On y trouve les rôles actifs, l'issue de roadmap, l'emplacement des worktrees, les zones de fichiers (et laquelle est la peau du Designer), la doc vivante à synchroniser en livrant, les chemins de specs et de doc produit, les skills en boucle par rôle, et les pièges du projet qui ne se déduisent d'aucun code.

**Ce qui est procédural** vit dans deux scripts du projet, dont le plugin ne connaît que le contrat :

- **`gates.sh [<worktree>]`** — le **verdict**. Son code de sortie *est* le verdict : `0` = vert. Il ne met rien en route ; il juge.
- **`worktree-setup.sh <n> <worktree>`** — la **mise en route**. Il rend un worktree utilisable (dépendances, secrets non versionnés, base de test dédiée à l'issue, ports) et n'imprime **sur stdout que des lignes `export`**, tout le bruit allant sur stderr. Son code de sortie dit si le worktree est utilisable.

Garder ces deux responsabilités séparées est le point qui compte : un script qui met en route et juge à la fois rend un verdict non reproductible. Corollaire pour l'appelant — **capturez avant d'évaluer** :

```bash
SETUP="$(worktree-setup.sh "$N" "$WT")" || { echo "setup échoué" >&2; exit 1; }
eval "$SETUP"
```

Dans la forme `eval "$(script)"`, `$?` est celui de l'`eval` : un setup qui échoue sans rien imprimer passerait pour un succès, et le dev partirait coder dans le vide.

## Miroir Codex

Un projet qui travaille aussi avec Codex tient un miroir dans `.agents/`, alimenté par **`/brigade:sync`**. Les rôles ont **une seule définition** — les commandes de ce plugin ; le miroir n'en est qu'une projection.

- `.agents/skills/<rôle>/references/workflow.md` est une **copie** de la commande du rôle. Pas un symlink : le chemin du cache du plugin porte son numéro de version, et un lien casserait à la première mise à jour, silencieusement.
- `.agents/skills/<rôle>/SKILL.md` est une fine couche d'adaptation — lire le workflow partagé, traduire les primitives propres à Claude Code. **Aucune règle métier n'y est recopiée** : ce serait une seconde vérité, qui divergerait à la première évolution.
- `AGENTS.md` est un symlink vers `CLAUDE.md` : même dépôt, aucune version dans le chemin, donc le lien est ici le bon outil.

La contrepartie de la copie est qu'elle doit être resynchronisée : **rejouez `/brigade:sync` après chaque mise à jour du plugin.** Un miroir périmé ne se signale par aucune erreur — Codex tiendrait simplement le protocole d'hier.

## Conventions

- **Branches** : `feat/<n>-slug`, `fix/<n>-slug`, `tech/<n>-slug`, `design/<n>-slug`, où `<n>` est le numéro d'issue — c'est ce qui permet à l'orchestrateur de relier branche, issue et PR.
- **PR** : corps qui référence `Closes #<n>`.
- **Labels** : `feature` / `fix` / `tech` (type, posé par le Manager) ; `triage` (brute, à qualifier) ; `product` (née du PO) ; `design` (composante visuelle, jamais de dev) ; `prio:1` / `prio:2` / `prio:3` (priorité produit, posée par le PO) ; `blocked-on-human` (question de spec en attente).
- Le reste des conventions de code appartient à votre `CLAUDE.md`.
