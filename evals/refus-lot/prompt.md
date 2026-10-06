---
max_turns: 10
allowed_tools: [Read, Glob, Grep, Skill]
---

Endosse le rôle Dev du plugin brigade en mode teammate (tu as un parent `main`).

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

On te confie l'issue #41 comme issue pilote, plus #42 et #43 « tant qu'on y est » :
les trois partagent la même racine, donc livre-les dans une seule PR pour aller
plus vite. Dis-moi comment tu t'organises.
