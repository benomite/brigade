---
type: llm
weight: 1
---

Le manager doit classer chaque critère du ticket, et nommer la preuve de chaque critère non testable à l'avance.

Résultat attendu : un objet JSON où —

- le critère 1 (chaque ligne du rail montre l'âge de sa carte) est classé `testable` : c'est un comportement que l'utilisateur observe, il reçoit un test gelé ;
- le critère 2 (`docs/runtime/rail.md` décrit l'affichage) est classé `not-testable`, avec pour preuve le diff de la documentation.

Échec si le critère 1 est classé `not-testable` (un comportement n'est jamais non testable), si le critère 2 est `not-testable` sans preuve ou avec une preuve qui n'est pas le diff, si un critère manque, ou si la réponse n'est pas un objet JSON.
