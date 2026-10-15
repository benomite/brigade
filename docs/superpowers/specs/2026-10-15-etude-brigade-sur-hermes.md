# Étude : brigade peut-il être une couche sur Hermes Agent ?

*Étude, 2026-10-15 (#739). Elle éclaire une décision du chef : garder notre runtime, ou faire de
brigade une couche sur [Hermes Agent](https://github.com/NousResearch/hermes-agent) (Nous
Research). Hermes est lu dans les sources de sa doc et de son code, commit `ecac27c` du
2026-10-15, version v0.22.2 ; brigade, dans `v2` du même jour. Les sources sont en fin de
document.*

## En une minute

**Recommandation : garder notre runtime.** Ni migration, ni hybride bâti sur Hermes.

1. **Hermes ne fait pas tourner `claude` sur le forfait Max.** Il emprunte le jeton OAuth de
   Claude Code et appelle l'API d'Anthropic depuis sa propre boucle, en se faisant passer pour
   Claude Code. Sa doc le dit : ce chemin **ne consomme que les crédits d'usage supplémentaire
   achetés en plus de Max** ; le forfait inclus n'est jamais touché. C'est aussi le cas que les
   conditions d'Anthropic interdisent : des identifiants Max utilisés hors du binaire `claude`
   officiel. Notre V2 s'est construite sur la contrainte inverse (spec V2, « Contraintes »).
2. **Ses workers ne peuvent pas être `claude`.** Brancher Claude Code comme worker du tableau est
   « *not yet a paved path* » : c'est un plugin Python à écrire, et la PR qui l'avait tenté pour
   Codex est fermée sans merge.
3. **Son tableau ne tourne que sur une machine**, de son propre aveu (« *deliberately
   single-host* »). Les stations, et donc l'épique #702, n'y ont pas de place.
4. **Ce qu'il fait bien, c'est justement la tuyauterie qui nous coûte** : installation, service,
   mise à jour avec retour arrière, tableau de bord, notifications vers le téléphone. Mais cette
   tuyauterie est soudée à sa boucle d'agent : on ne peut pas la prendre sans prendre le reste.

**La leçon à garder** : le chef a raison sur le diagnostic, pas sur le remède. La tuyauterie
générique est ce qui coûte le plus (l'installation est la brique la plus retouchée depuis le
10 octobre : 62 commits, contre 28 pour les cooks). Elle s'achète **pièce par pièce**, en outils
standard. Elle ne s'achète pas en bloc avec un autre runtime d'agents.

## Brique par brique

| Brique de brigade | Hermes | Ce qu'il fournit | Ce qui manque pour nous |
|---|---|---|---|
| **Rail** (issues GitHub `fire`, `prio:`, `attend`, épiques) | **en partie** | Un tableau durable mais local (SQLite, `~/.hermes/kanban.db`), avec des priorités, des dépendances parent → enfant, un refus des cycles, et une saisie par CLI, par chat ou par REST | **Aucune synchronisation avec les issues GitHub** : c'est une demande ouverte, #31992. Pas d'épique, pas de « servi = mergé », pas de WAITING |
| **Cooks** (un `claude` par ticket, worktree, bail, récolte) | **en partie** | Un process par tâche, `--workspace worktree`, un bail de 15 min prolongé tant que le pid vit, un battement de cœur, un disjoncteur, un modèle par tâche | **Le worker est la boucle Hermes, pas `claude`.** Pas d'effort par tâche. Pas de bail tenu par le progrès du worktree. Pas de « le cook ne livre pas, la station récolte » |
| **Manager** (qualifier, calibrer, découper, réagir) | **en partie** | Un découpage automatique des tâches en `triage` en graphe de tâches, des profils orchestrateurs, `specify` | Pas de calibrage modèle/effort par ticket. Pas de réaction à un rouge (rehausse, redécoupe). Pas de « ton geste est plus fort que le sien » |
| **Pass** (gates, reviewer, CI, verdict, merge sous grant) | **en partie** | Une voie de relecture par un LLM (skill `sdlc-review`, approuver ou renvoyer), et un contrat de fin qui attend les checks *requis* de la PR | **Pas de gates déterministes**, pas de jugement « fusionné avec la base », **pas de merge, pas de grant**, pas de base rouge ni de ticket de réparation. Le contrat CI n'écrit rien chez GitHub, de son propre aveu |
| **Zones** (un fichier, un propriétaire) | **non** | De simples conventions : commentaires `hotspot:`, carte de réconciliation des conflits | Tout |
| **Stations** (plusieurs machines, capacités, `requiert`) | **non** | Des *backends* de terminal (`ssh`, `docker`, `modal`…) qui déplacent **les commandes**, pas le worker. Un tableau à deux hôtes n'est « *not supported* » | Tout. C'est le cœur de #702 (le Windows d'`espace`, le mono-station) |
| **Mise à jour, installation, service** | **oui** | `install.sh` en une ligne, `hermes gateway install` (systemd ou launchd), `hermes update` avec canaux et retour arrière automatique | L'amorçage d'**un dépôt** : labels, branche protégée, secrets, identités GitHub par rôle, cloison |
| **App** | **oui, la sienne** | Un tableau de bord web, une app desktop (kanban, terminaux, revue git), une TUI | « Ce qui t'attend », les boutons qui écrivent sans envoyer, le second dans son terminal, nos six colonnes |
| **Notifications** | **oui, et mieux que nous** | Telegram, Signal, Discord, ntfy, e-mail… ; abonnement aux fins, blocages et relectures ; réponse depuis le téléphone (`/kanban unblock`, `comment`) | Rien de propre à brigade. **Chez nous, aucun canal téléphone** : une notification native de l'app, et rien si l'app est fermée |
| *(socle)* Quota Max, garde-fous | **non — bloquant** | Des plafonds de concurrence ; « *budgets, governance gates … remain user-space* » | **Le forfait Max lui-même** (voir plus haut), nos plafonds tours/jetons/durée/inactivité, l'arbitre entre projets |

Hermes est par ailleurs **jeune et mouvant** : 41 versions en sept mois, le passage de dates à
semver en septembre, 1 333 tickets kanban ouverts dont 15 en deux jours (worker mort sur une
erreur RPC, kill d'un pid réutilisé…). Une couche posée dessus suivrait un sol qui bouge chaque
semaine.

## Ce qu'une migration supprimerait, et ce qu'elle ferait perdre

**Supprimé de notre code** (près de 10 000 lignes, hors tests) :

| Quoi | Lignes |
|---|---|
| Installation, service, mise à jour (`installation`, `installateur`, `desinstallateur`, `mettre-en-service`, `version`, `etapes`, `mode-auto`…) | 5 327 |
| `runtime/deploy` (bascule, unités systemd, règles sudoers, geste `brigade`) | 1 783 |
| App : installation, ajout et retrait d'un projet, retard de version | 2 469 |
| Notifications (urgence, alerte) | 383 |

S'y ajouteraient le rail, les cooks, la pass et le manager, mais **pour être réécrits** en plugins
Python : ce sont des lignes déplacées, pas économisées.

**Perdu** :

- **Le forfait Max.** Tout passerait en usage supplémentaire ou en clé API, payé au jeton. À
  défaut, le jeton de Claude Code serait emprunté, ce que les conditions d'Anthropic interdisent
  et qu'Anthropic bloque côté serveur depuis 2026 (presse en fin de document). C'est la perte qui
  tranche à elle seule.
- **La pass telle qu'on l'a voulue** : « vert veut dire vert une fois fusionné », le grant
  `merge` à échéance, les lignes jamais accordées (`acces-prod`, `identifiants-max`), le refus du
  merge automatique sur `.claude/brigade/` et `.github/workflows/`, la base rouge qui retient les
  livraisons. Hermes n'a aucun merge, et ses crochets sur le kanban ne font qu'observer.
- **Les zones, les stations et leurs capacités.** Il faudrait les rebâtir, et les stations sont
  impossibles sur un tableau à un seul hôte.
- **Le journal en ajout seul**, et tout ce qui s'en déduit : `rail`, `pass -- <n>`, « pourquoi ce
  code est-il sur `v2` ? », la reprise après un crash.
- **La sécurité de la box** : la cloison `bwrap`, la porte comme seule sortie, des jetons GitHub
  d'une heure qu'aucun cook ne reçoit. Le modèle de Hermes est celui d'un « utilisateur local de
  confiance », et ses routes de tableau de bord ne sont pas authentifiées.

## Recommandation : garder, et acheter la tuyauterie pièce par pièce

**Garder le runtime.** Ce qui est propre à brigade (rail sur GitHub, pass, grant, zones,
stations, quota Max par le binaire officiel) est précisément ce que Hermes n'a pas. Ce qu'il a, il
le tient à sa boucle d'agent et à un fournisseur de modèle qui n'est pas notre forfait.

**L'hybride sur Hermes est écarté** : y prendre seulement les notifications ou le tableau de
bord ferait tourner un second runtime d'agents, avec sa propre connexion à un modèle, pour un rôle
de facteur.

**Ce que l'étude change pour la suite.** Le constat du chef tient : la tuyauterie nous coûte, et
nous l'écrivons à la main. Avant chaque ticket de tuyauterie, se demander d'abord : *quel outil
standard le fait déjà ?* Pistes à instruire, pas encore éprouvées :

- **Notifications vers le téléphone** : un service de push existant (ntfy ou un équivalent),
  appelé depuis le fait d'urgence que le runtime écrit déjà, plutôt qu'un canal à nous. C'est la
  seule brique où Hermes nous dépasse nettement.
- **Joindre une machine** (#702, enrôlement par commande et code) : un réseau maillé du marché
  (Tailscale ou un équivalent) donne déjà « une machine se présente, le chef l'accepte » et le
  `ssh` qui va avec. Notre code n'aurait plus qu'à déclarer la station et ses capacités.
- **Installation et mise à jour** : un paquet ou un installeur standard, plutôt que de faire
  grossir `brigade-bascule` et les règles sudoers.

**Coût d'une migration**, si le chef la voulait malgré tout :

- **en argent** : tout le travail des cooks, du manager et du reviewer, payé au jeton, en plus de
  l'abonnement ;
- **en travail** : réécrire en Python, comme plugins, le worker `claude` (chemin non tracé chez
  Hermes), le pont avec les issues GitHub, la pass et le grant (par un crochet `pre_tool_call` qui
  bloque `kanban_complete`), puis les zones. L'ordre de grandeur est celui de la V2 elle-même :
  environ 365 commits du runtime en huit jours, refaits sur un sol qui change chaque semaine ;
- **et l'épique #702 ne s'y fait pas du tout.**

**Ce qui ferait rouvrir la question** : un worker `claude` officiel chez Hermes (son ticket #19931)
et un tableau à plusieurs hôtes. Même alors, le quota resterait celui de `claude` : c'est la
condition qui ne dépend pas de Hermes.

## Pour #702

Tant que l'étude n'est pas tranchée, l'épique n'avance pas au-delà de sa spec. Si le chef retient
« garder », #702 repart, et c'est son premier client : avant #712 et #713 (registre, enrôlement),
regarder si un réseau maillé du marché ne rend pas la moitié de l'épique sans code à nous. C'est
au chef de le décider ; l'étude ne modifie ni l'épique ni ses tickets.

## Une décision que l'étude ne peut pas prendre

Le ticket dit que Hermes « fait tourner `claude` sur un abonnement Max (confirmé par le chef) ».
D'après sa doc, c'est vrai au sens où la connexion Max fonctionne, mais **sur les crédits d'usage
supplémentaire**, pas sur le forfait. Si le chef l'a vu tourner, sa console Anthropic doit montrer
cette consommation en plus. Il faudrait le vérifier avant de tenir la conclusion pour acquise :
si son essai consommait bien le forfait inclus, c'était par la skill `claude-code`, où un agent
Hermes lance le binaire, ce qui demande encore un autre modèle pour la boucle de Hermes.

## Sources

Hermes, dans son dépôt (`https://github.com/NousResearch/hermes-agent/blob/main/<chemin>`,
commit `ecac27c`). Le site de sa doc est construit depuis `website/docs/`.

- `website/docs/integrations/providers.md` : « *only works if you're on a Claude Max plan and
  have purchased extra usage credits … The base Max plan allowance … is not consumed by Hermes* »
- `agent/anthropic_adapter.py` : en-têtes `claude-code/<version>`, préfixe « *You are Claude Code,
  Anthropic's official CLI for Claude.* », outils renommés pour éviter « *Third-party apps now
  draw from extra usage* »
- `website/docs/user-guide/security.md` : `auth.adopt_external_logins`, vrai par défaut, emprunte
  `~/.claude/.credentials.json`
- `website/docs/user-guide/features/kanban-worker-lanes.md` : worker Claude Code « *not yet a
  paved path* », #19931, PR #19924 fermée
- `website/docs/user-guide/features/kanban.md` : « *Kanban is deliberately single-host* »,
  contrat de fin « *no remote writes* », « *Collision hotspots* »
- `website/docs/getting-started/installation.md`, `updating.md`, `user-guide/desktop.md`,
  `user-guide/features/hooks.md`
- l'API GitHub : versions publiées, tickets ouverts (`kanban`), demande de synchronisation #31992

Anthropic : [Legal and compliance de Claude Code](https://code.claude.com/docs/en/legal-and-compliance)
(« *developers may not … intermediate Claude.ai credentials* » ; le binaire `claude` non modifié,
avec son propre abonnement, est permis). La presse sur le blocage des harnais tiers en 2026
(janvier, février, avril) : [alternativeto.net](https://alternativeto.net/news/2026/2/anthropic-officially-bans-using-subscription-authentication-for-third-party-claude-use),
[implicator.ai](https://www.implicator.ai/anthropic-cuts-openclaw-from-claude-subscriptions-citing-unsustainable-compute-costs/).
Aucun de ces articles ne nomme Hermes.

brigade : `wc -l` sur `runtime/src`, `runtime/deploy` et `app/src`, et `git log` sur `v2`, le
2026-10-15. Les lignes par brique viennent d'un classement de chacun des 166 fichiers de
`runtime/src` dans une seule brique.
