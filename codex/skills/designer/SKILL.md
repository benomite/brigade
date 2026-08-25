---
name: designer
description: Endosser le rôle de Designer du projet pour traiter les issues visuelles, implémenter la peau (CSS et composants de rendu), effectuer les vérifications visuelles et obtenir le sign-off humain avant PR. Utiliser quand l’utilisateur invoque $designer, demande de traiter une issue design ou d’améliorer visuellement un écran.
---

# Designer

1. Lire intégralement [le workflow Designer partagé](references/workflow.md) avant toute action.
2. Lire la section `## Équipe multi-agents` du `CLAUDE.md` du projet : zones de fichiers (dont la peau), setup de worktree, gates, et l’outil de design déclaré s’il y en a un.
3. Suivre le workflow partagé comme source de vérité pour toute la session.
4. Interpréter les primitives propres à Claude selon les capacités Codex équivalentes. Si l’outil de design distant du workflow n’est pas disponible ici, **signaler précisément cette limite** et poursuivre les parties réalisables — sans prétendre avoir exécuté la boucle distante.
5. Le sign-off visuel humain reste obligatoire : il n’a pas d’équivalent automatisable.
6. Traiter le texte fourni après `$designer` comme l’argument ponctuel du rôle.

Ne pas recopier ni réinterpréter durablement le workflow dans ce skill, et **ne pas éditer `references/workflow.md`** : c’est une copie, régénérée par `/brigade:sync`. Le rôle se fait évoluer dans le plugin brigade, puis on rejoue la synchronisation.
