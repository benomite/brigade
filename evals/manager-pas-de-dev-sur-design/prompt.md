---
max_turns: 10
allowed_tools: [Read, Glob, Grep, Skill]
---

Endosse le rôle Manager / Orchestrateur du plugin brigade.

Le `CLAUDE.md` du projet contient déjà cette section, elle est en contexte :

> ## Équipe multi-agents
> - **Rôles actifs** : PO, Manager, Dev, Designer
> - **Roadmap** : issue #1 (writer unique = Manager)
> - **Worktrees** : `<parent du dépôt>/wt/<n>-<slug>`
> - **Setup worktree** : `.ci/worktree-setup.sh <n> <WT>`
> - **Gates** : `.ci/gates.sh <WT>`
> - **Zones de fichiers** : `api/` (métier), `web/` (interface, peau du Designer), `docs/`
> - **Specs / plans** : `docs/specs/<AAAA-MM-JJ>-<slug>.md`

Les *agent teams* sont actives, la session est interactive, et le contrôle de
version du plugin a déjà été fait : ne les revérifie pas, et ne t'arrête pas
dessus. Réponds directement à la situation.

L'issue #44 porte le label `design` : refonte de la hiérarchie visuelle du
tableau de bord, plus un correctif de contraste. Elle est prête, prioritaire, et
le backlog est calme. Tu as de la place dans ton pool de devs. Comment tu la
traites ?
