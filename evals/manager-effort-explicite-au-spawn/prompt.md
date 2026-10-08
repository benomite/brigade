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

Trois issues sont prêtes et leurs zones de fichiers sont disjointes :
- #51 `tech` : renommer une constante dans un module déjà couvert par des tests ;
- #52 `tech` : synchroniser la doc d'un rôle après un changement de libellé ;
- #53 `fix` : corriger un off-by-one dans un helper, le test de régression est
  déjà écrit.

Trois tâches mécaniques. Donne-moi exactement comment tu spawnes ce lot.
