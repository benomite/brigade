## Équipe multi-agents (plugin brigade)

- **Rôles actifs** : PO, Manager, Dev, Designer
- **Roadmap** : issue #1 (writer unique = Manager)
- **Worktrees** : `<parent du dépôt>/brigade-wt/<n>-<slug>` — frère du dépôt, le parent se calcule (`dirname "$(git rev-parse --show-toplevel)"`)
- **Setup worktree** : `.claude/brigade/worktree-setup.sh <n> <WT>`
- **Gates** : `.claude/brigade/gates.sh <WT>`, puis `/code-review`
- **Zones de fichiers** : `commands/` (définition des rôles — le cœur du produit), `agents/` (le dev-teammate spawné), `codex/skills/` (miroir Codex, source que `/brigade:sync` copie chez le projet consommateur), `scripts/` (outillage de release), `docs/`, `.claude-plugin/` (manifests). Le Designer n'a **pas de peau** ici : ce dépôt n'a aucune UI — son terrain est le rendu textuel des rôles (formulations, tableaux, lisibilité en terminal), pas un thème.
- **Dev local** : rien à lancer — le dépôt n'a ni dépendance, ni build, ni serveur. Pour éprouver un rôle modifié, il faut l'installer : bumper `version` dans `.claude-plugin/plugin.json`, puis `scripts/update-partout.sh`. Un worktree ne réserve aucun port.
- **Doc vivante** : `docs/` — toute livraison qui change le comportement d'un rôle met à jour la doc concernée sous `docs/`.
- **Specs / plans** : `docs/superpowers/specs/<AAAA-MM-JJ>-<slug>.md`
- **Doc produit** : `README.md` — c'est lui qui décrit le protocole tel que l'utilisateur le vit (rôles, handoffs, règles non négociables).
- **Skills en boucle** : PO → `superpowers:brainstorming` puis `superpowers:writing-plans` quand une idée part en spec ; Dev → `superpowers:writing-skills` (le produit livré *est* du markdown de skill, ses règles s'appliquent) ; Manager → aucune ; Designer → aucune.

### Conventions propres à ce dépôt

- **Le miroir Codex n'est pas optionnel.** Toute modification d'un `commands/<rôle>.md` doit être répercutée dans `codex/skills/<rôle>/`. Les gates vérifient la présence des fichiers du miroir, pas leur fraîcheur — c'est au dev de la garantir.
- **Un rôle ajouté doit être déclaré** dans `commands` de `.claude-plugin/plugin.json`, sinon il ne se charge jamais. Les gates attrapent l'oubli.
- **Une mise à jour du plugin ne change pas la session en cours** : les rôles sont chargés au démarrage. Ne jamais attendre d'une orchestration en cours qu'elle prenne un correctif fraîchement publié.
- **Les gates se rejouent seules à l'arrêt**, par un hook `Stop` **et** `SubagentStop` en `asyncRewake` (`.claude/brigade/gates-hook.sh`) — les deux événements, parce que `Stop` ne se déclenche pas quand un subagent termine, et que les dev-teammates en sont. Ce hook **ne remplace pas** le passage de gates de ta Definition of Done : il rattrape ce qui aurait été oublié. Vertes, elles se taisent ; rouges, elles te réveillent — **deux fois sur un même échec, quatre fois en tout**, puis elles te demandent de signaler `bloqué` et se taisent. Un arrêt qui n'a rien changé depuis le précédent ne consomme pas de réveil. Limite connue : le hook ne sait pas à qui attribuer un arbre rouge, donc une session qui n'y est pour rien peut être réveillée une fois. Sans ces plafonds, le hook boucle à l'infini — mesuré le 2026-10-05, et de nouveau quand l'empreinte de l'échec change à chaque tour.
