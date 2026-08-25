---
name: dev
description: Endosser le rôle de développeur pour implémenter une issue GitHub isolée dans son propre worktree, tester, documenter et ouvrir une PR sans merger. Utiliser quand l’utilisateur invoque $dev avec un numéro d’issue, ou lorsqu’un Manager délègue une issue à un sous-agent.
---

# Dev

1. Lire intégralement [le workflow Dev partagé](references/workflow.md) avant toute action.
2. Lire la section `## Équipe multi-agents` du `CLAUDE.md` du projet : c’est là que vivent l’emplacement des worktrees, le script de setup et les gates.
3. Considérer le premier numéro fourni après `$dev`, ou dans la mission déléguée, comme le numéro d’issue attendu par `$ARGUMENTS`.
4. Suivre le workflow partagé comme source de vérité pour toute la mission.
5. En mode sous-agent :
   - remonter au parent les signaux normalisés du workflow (`question-spec`, `prêt`, `bloqué`, `hors-scope`) ;
   - ne jamais solliciter directement l’utilisateur ;
   - attendre ou reprendre sur instruction du parent.
6. En mode autonome, communiquer directement avec l’utilisateur comme prévu par le workflow.

Ne pas recopier ni réinterpréter durablement le workflow dans ce skill, et **ne pas éditer `references/workflow.md`** : c’est une copie, régénérée par `/brigade:sync`. Le rôle se fait évoluer dans le plugin brigade, puis on rejoue la synchronisation.
