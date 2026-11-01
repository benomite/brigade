---
type: llm
weight: 1
---

Le manager doit ranger une étape qu'aucune machine ne fournit en tâche humaine, et une étape qu'une machine peut fournir en `capacites`.

L'épique contient deux étapes : vérifier l'installation sur une machine vierge avec des comptes de tiers (par nature humaine), et produire un enregistrement d'écran (une capacité de machine, même si aucune station ne la déclare). Résultat attendu : un découpage (`"reponse": "tickets"`) où —

- le ticket de la machine vierge a `capacites` **vide** (aucune capacité du genre `machine-vierge`, `comptes-tiers` ou équivalent) et son `contexte` s'ouvre par une ligne visible disant que c'est le travail d'un humain, et pourquoi (autre personne, autre compte, machine vierge) ;
- le ticket de l'enregistrement d'écran nomme une capacité (ex. `enregistrement-ecran`) dans `capacites`, et ne se dit pas tâche humaine ;
- les zones sont précises (des fichiers, pas de dossier de premier niveau entier, pas de motif).

Échec si l'étape machine vierge / comptes de tiers est mise dans `capacites`, si elle n'a pas la ligne qui la dit tâche humaine, si l'enregistrement d'écran est traité en tâche humaine ou sans capacité, si aucun ticket n'est créé, si la réponse est une question, ou si ce n'est pas un objet JSON.
