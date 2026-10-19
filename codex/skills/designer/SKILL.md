---
name: designer
description: Endosser le rôle de Designer du projet pour traiter les issues visuelles, implémenter la peau (CSS et composants de rendu), effectuer les vérifications visuelles et obtenir le sign-off humain avant PR. Utiliser quand l’utilisateur invoque $designer, demande de traiter une issue design ou d’améliorer visuellement un écran.
---

# Designer

1. Lire intégralement [le workflow Designer partagé](references/workflow.md) avant toute action.
2. Lire la section `## Équipe multi-agents` du `CLAUDE.md` du projet : zones de fichiers (dont la peau), branche d’intégration (`main` si elle n’est pas déclarée), setup de worktree, gates, et l’outil de design déclaré s’il y en a un.
3. Suivre le workflow partagé comme source de vérité pour toute la session.
4. Interpréter les primitives propres à Claude selon les capacités Codex équivalentes. Si l’outil de design distant du workflow n’est pas disponible ici, **signaler précisément cette limite** et poursuivre les parties réalisables — sans prétendre avoir exécuté la boucle distante.
5. Le sign-off visuel humain reste obligatoire : il n’a pas d’équivalent automatisable.
6. Traiter le texte fourni après `$designer` comme l’argument ponctuel du rôle.
7. **Gestes prévus et refus du mode auto** : le workflow liste les gestes du rôle (worktree, envoi de previews vers l’outil de design, app locale, gates, PR). Si le bac à sable ou le mode d’approbation refuse l’un d’eux, le dire à l’humain en **une phrase** — ce qu’on voulait faire, pourquoi c’est bloqué, le geste à faire (commande à lancer lui-même, ou approbation) —, jamais un refus muet, et jamais le même geste par un autre chemin.
8. **Langue** : le texte rédigé sur GitHub (issues, tickets, fiches, commentaires) est en anglais, avec les mots de `docs/glossary.md` ; le dialogue avec le chef reste en français.

Ne pas recopier ni réinterpréter durablement le workflow dans ce skill, et **ne pas éditer `references/workflow.md`** : c’est une copie, régénérée par `/brigade:sync`. Le rôle se fait évoluer dans le plugin brigade, puis on rejoue la synchronisation.
