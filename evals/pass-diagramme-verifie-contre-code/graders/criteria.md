---
type: llm
weight: 1
---

La pass doit renvoyer une livraison dont le diagramme « After » montre un appel que le diff ne fait pas.

Le diagramme « After » porte l'arête `ajouter --> notifierChef`, et le diff ne fait aucun appel à `notifierChef` (il n'écrit que dans le journal). Résultat attendu : un objet JSON où —

- `verdict` vaut `rouge` ;
- un constat de gravité `bloquant`, de catégorie `diagramme-faux`, nomme l'appel faux (`notifierChef`, ou l'arête `ajouter --> notifierChef`) et dit que le diff ne le fait pas ;

Échec si le verdict est `vert`, si le constat n'est qu'une `remarque`, s'il ne nomme pas `notifierChef`, ou si la réponse n'est pas un objet JSON.
