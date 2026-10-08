## Équipe multi-agents (plugin brigade)

- **Rôles actifs** : PO, Manager, Dev, Designer
- **Roadmap** : issue #1 (writer unique = Manager)
- **Branche d'intégration** : `v2`
- **Worktrees** : `<parent du dépôt>/brigade-wt/<n>-<slug>` — frère du dépôt, le parent se calcule (`dirname "$(git rev-parse --show-toplevel)"`)
- **Setup worktree** : `.claude/brigade/worktree-setup.sh <n> <WT>`
- **Gates** : `.claude/brigade/gates.sh <WT>`, puis `/code-review`
- **Zones de fichiers** : deux zones de produit, qui n'ont pas les mêmes règles.
  - **Runtime** — `runtime/` : le runtime de la V2, TypeScript exécuté par Node 26, avec son `package.json`. Une issue runtime écrit ici, et nulle part dans la zone plugin.
  - **Plugin V1** — `commands/` (définition des rôles), `agents/` (le dev-teammate spawné), `codex/skills/` (miroir Codex, source que `/brigade:sync` copie chez le projet consommateur), `.claude-plugin/` (manifests). `evals/` porte les cas d'évaluation de ces rôles.
  - **Communs** — `scripts/` (outillage de release), `docs/`, `.claude/brigade/` (gates et setup de worktree).
  - Le Designer n'a **pas de peau** ici : ce dépôt n'a aucune UI — son terrain est le rendu textuel des rôles (formulations, tableaux, lisibilité en terminal), pas un thème.
- **Dev local** :
  - **Runtime** — Node 26, sans build. Tests : `npm --prefix runtime test` (ils passent sur un clone nu, sans rien installer). Contrôle de types : `npm --prefix runtime run typecheck` (réclame les dépendances de dev, posées par le setup de worktree). Lancer : `npm --prefix runtime start`, après le setup — l'état vit dans `$BRIGADE_STATE_DIR`. Aucun démon ne tourne sur le poste de dev ; les tests pilotent un faux `claude` (`BRIGADE_CLAUDE_BIN`) et ne consomment aucun quota.
  - **Plugin V1** — rien à lancer. Pour éprouver un rôle modifié, il faut l'installer : bumper `version` dans `.claude-plugin/plugin.json`, puis `scripts/update-partout.sh`.
  - **Ce que le setup attribue à un worktree** — `BRIGADE_STATE_DIR=<WT>/.brigade-state` (base locale `log.db`, verrou `lock.db`, `runs/` ; ignoré par git) et `BRIGADE_PORT=20000 + <n° d'issue>`. Deux worktrees ont deux répertoires et deux ports : ils ne se croisent pas. N'écris jamais un chemin d'état ni un port en dur. Les tests n'utilisent ni l'un ni l'autre : chacun crée son répertoire temporaire et écoute sur le port 0.
- **Doc vivante** : `docs/` — toute livraison qui change le comportement d'un rôle met à jour la doc concernée sous `docs/`.
- **Specs / plans** : `docs/superpowers/specs/<AAAA-MM-JJ>-<slug>.md`
- **Doc produit** : `README.md` — c'est lui qui décrit le protocole tel que l'utilisateur le vit (rôles, handoffs, règles non négociables).
- **Skills en boucle** : PO → `superpowers:brainstorming` puis `superpowers:writing-plans` quand une idée part en spec ; Dev → selon la zone : `superpowers:test-driven-development` sur le runtime, `superpowers:writing-skills` sur le plugin V1 (le produit livré y *est* du markdown de skill, ses règles s'appliquent) ; Manager → aucune ; Designer → aucune.

### Conventions propres à ce dépôt

- **Dans la zone plugin, le miroir Codex n'est pas optionnel.** Toute modification d'un `commands/<rôle>.md` doit être répercutée dans `codex/skills/<rôle>/`. Les gates l'exigent : un rôle modifié depuis la branche d'intégration sans que rien ne bouge sous son miroir les rend rouges. Elles voient que le miroir a bougé, pas qu'il dit la même chose — la justesse reste au dev. Un changement qui ne touche que `runtime/` ne doit rien au miroir.
- **Les gates jouent les tests du runtime** dès que `runtime/package.json` existe, puis le contrôle de types s'il est déclaré. Un runtime absent n'est pas un échec. Elles sont rejouées à chaque arrêt (voir plus bas) : la suite doit rester de l'ordre de la seconde — ni réseau, ni vrai `claude`.
- **Un rôle ajouté doit être déclaré** dans `commands` de `.claude-plugin/plugin.json`, sinon il ne se charge jamais. Les gates attrapent l'oubli.
- **Une mise à jour du plugin ne change pas la session en cours** : les rôles sont chargés au démarrage. Ne jamais attendre d'une orchestration en cours qu'elle prenne un correctif fraîchement publié.
- **Les gates se rejouent seules à l'arrêt**, par un hook `Stop` **et** `SubagentStop` en `asyncRewake` (`.claude/brigade/gates-hook.sh`) — les deux événements, parce que `Stop` ne se déclenche pas quand un subagent termine, et que les dev-teammates en sont. Ce hook **ne remplace pas** le passage de gates de ta Definition of Done : il rattrape ce qui aurait été oublié. Vertes, elles se taisent ; rouges, elles te réveillent — **deux fois sur un même échec, quatre fois en tout**, puis elles te demandent de signaler `bloqué` et se taisent. Un arrêt qui n'a rien changé depuis le précédent ne consomme pas de réveil. Limite connue : le hook ne sait pas à qui attribuer un arbre rouge, donc une session qui n'y est pour rien peut être réveillée une fois. Sans ces plafonds, le hook boucle à l'infini — mesuré le 2026-10-05, et de nouveau quand l'empreinte de l'échec change à chaque tour.
