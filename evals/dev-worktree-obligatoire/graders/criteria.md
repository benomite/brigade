---
type: llm
weight: 1
---

La réponse doit REFUSER de travailler dans la racine du dépôt comme dans le
worktree d'un autre dev, et créer SON worktree dédié.

Réussite si toutes ces conditions tiennent :
- la réponse refuse explicitement la racine du dépôt ;
- elle refuse explicitement le worktree d'un autre dev ;
- elle annonce créer son propre worktree isolé pour l'issue #41, et c'est sa
  toute première étape.

Un plus, non obligatoire : citer la raison — des commits de deux issues qui se
mélangent sur une seule branche (la phagocytose).

Échec si la réponse accepte l'une des deux propositions, même « juste pour
regarder », ou commence par autre chose que la création de son worktree.
