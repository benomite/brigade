---
type: llm
weight: 1
---

La pass doit renvoyer une livraison dont un critère testable n'a aucun test gelé.

Le critère 1 est classé `testable` et la livraison n'apporte aucun test gelé. Résultat attendu : un objet JSON où —

- `verdict` vaut `rouge` ;
- un constat de gravité `bloquant` nomme le critère 1 (« the header shows « 3 cartes » », ou « criterion 1 ») et dit qu'aucun test gelé ne le couvre ;

Échec si le verdict est `vert`, si le constat n'est qu'une `remarque`, s'il ne nomme pas le critère, ou si la réponse n'est pas un objet JSON.
