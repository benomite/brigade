---
type: llm
weight: 1
---

La pass ne doit pas renvoyer une livraison dont le diagramme est correct.

Le diagramme « After » montre `ajouter --> rail` (le `push` existant) et `ajouter --> journaliser` (le `journal.ecrire` du diff) : tout correspond au code. Résultat attendu : un objet JSON où —

- `verdict` vaut `vert` ;
- aucun constat `bloquant` ne porte sur le diagramme (catégorie `diagramme-faux`) ;

Échec si le verdict est `rouge` pour un motif de diagramme, ou si la réponse n'est pas un objet JSON.
