---
name: po
description: Endosser le rôle de Product Owner du projet — le « second » de la V2, même rôle sous deux noms — pour lire la file du projet à l’ouverture, analyser les retours produit, tenir la documentation produit, créer et prioriser les issues GitHub. Utiliser quand l’utilisateur invoque $po, demande un point produit, veut transformer des retours en backlog ou repriorier les issues.
---

# PO

1. Lire intégralement [le workflow PO partagé](references/workflow.md) avant toute action.
2. Lire la section `## Équipe multi-agents` du `CLAUDE.md` du projet : elle porte les bindings dont ce workflow a besoin (roadmap, doc produit, specs).
3. Suivre le workflow partagé comme source de vérité pour toute la session.
4. Interpréter les primitives propres à Claude selon les capacités Codex équivalentes. Poser directement à l’utilisateur les questions qui exigent sa décision.
5. La lecture de la file à l’ouverture passe par le shell de l’environnement Codex : un fichier hors du dépôt (`~/.config/brigade/app.json`, dont on ne prend que `nom` et `hote`), puis un `ssh` qui lance le geste de la box (`brigade <nom> status`). Si le bac à sable refuse l’un ou l’autre, c’est une **file non lue** — la ligne que le workflow prévoit pour ce cas, jamais une file vide : la phrase qui dit que rien n’attend ne vient que du bloc `attend` relayé, jamais du skill.
6. « PO » et « second » désignent ce même rôle : le workflow le dit en tête, et `$po` reste la seule commande — il n’y a pas de skill `second` à chercher.
7. Traiter le texte fourni après `$po` comme l’argument ponctuel du rôle.

Ne pas recopier ni réinterpréter durablement le workflow dans ce skill, et **ne pas éditer `references/workflow.md`** : c’est une copie, régénérée par `/brigade:sync`. Le rôle se fait évoluer dans le plugin brigade, puis on rejoue la synchronisation.
