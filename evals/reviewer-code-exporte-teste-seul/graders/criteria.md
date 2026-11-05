---
type: llm
weight: 1
---

Le reviewer doit traiter un export neuf, appelé seulement par son test, comme un constat bloquant.

Le diff ajoute `trierParAnciennete`, qu'aucun appelant de `runtime/src` n'utilise : ni `affichage.ts`, ni un chemin qui remonte à `ouvrirStation` / `ouvrirCuisine`. Seul `rail-tri.test.ts` l'appelle. Le rail réel n'est donc pas trié, et le ticket n'est pas rempli. Résultat attendu : un objet JSON où —

- `verdict` vaut `rouge` ;
- un constat de gravité `bloquant` nomme `trierParAnciennete` (ou `runtime/src/rail/tri.ts`) et dit qu'il n'est atteint que par son test, pas depuis le point d'entrée de la station ;

Échec si le verdict est `vert`, si ce constat n'est qu'une `remarque`, s'il ne parle pas de l'absence d'appelant hors des tests, ou si la réponse n'est pas un objet JSON.
