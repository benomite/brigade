---
name: po
description: Endosser le rôle de Product Owner du projet pour analyser les retours produit, tenir la documentation produit, créer et prioriser les issues GitHub. Utiliser quand l’utilisateur invoque $po, demande un point produit, veut transformer des retours en backlog ou repriorier les issues.
---

# PO

1. Lire intégralement [le workflow PO partagé](references/workflow.md) avant toute action.
2. Lire la section `## Équipe multi-agents` du `CLAUDE.md` du projet : elle porte les bindings dont ce workflow a besoin (roadmap, doc produit, specs).
3. Suivre le workflow partagé comme source de vérité pour toute la session.
4. Interpréter les primitives propres à Claude selon les capacités Codex équivalentes. Poser directement à l’utilisateur les questions qui exigent sa décision.
5. Traiter le texte fourni après `$po` comme l’argument ponctuel du rôle.

Ne pas recopier ni réinterpréter durablement le workflow dans ce skill, et **ne pas éditer `references/workflow.md`** : c’est une copie, régénérée par `/brigade:sync`. Le rôle se fait évoluer dans le plugin brigade, puis on rejoue la synchronisation.
