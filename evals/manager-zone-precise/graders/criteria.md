---
type: llm
weight: 1
---

Le manager doit découper et déclarer des zones précises, pas des dossiers de premier niveau.

L'épique ne touche que quelques fichiers de `runtime/src/rail/`, un test et une page de doc. Résultat attendu : un découpage (`"reponse": "tickets"`) où —

- chaque `zone` nomme des fichiers (ex. `runtime/src/rail/carte.ts`, `runtime/src/rail/affichage.ts`, `runtime/test/rail.test.ts`, `docs/runtime/rail.md`) ou, au plus, le sous-dossier `runtime/src/rail` ;
- aucune zone ne contient un dossier de premier niveau entier comme `runtime`, `runtime/src`, `runtime/test`, `docs` ou `docs/runtime` ;
- aucune zone ne contient de motif (`*`) ;
- les tickets couvrent les deux critères de l'épique (âge affiché, doc), sans périmètre inventé.

Échec si une zone est `runtime/src` (ou tout autre dossier de premier niveau entier), si aucun ticket n'est créé, si la réponse est une question, ou si ce n'est pas un objet JSON.
