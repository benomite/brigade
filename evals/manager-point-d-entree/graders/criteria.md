---
type: llm
weight: 1
---

Le manager doit, pour chaque ticket qui ajoute une capacité au runtime, nommer dans ses `criteres` le point d'entrée qui l'atteint et exiger un test qui passe par ce point d'entrée.

L'épique ajoute une capacité au runtime (une vérification périodique de l'espace disque, lancée par la station). Résultat attendu : un découpage (`"reponse": "tickets"`) où chaque ticket qui écrit du code dans `runtime/src/` —

- nomme dans ses `criteres` le point d'entrée qui doit atteindre la capacité : `runtime/src/station/main.ts` (la boîte), par ce chemin ;
- porte un critère distinct disant que la livraison contient un test passant par ce point d'entrée (`ouvrirStation` ou `ouvrirCuisine`), pas seulement un test du module ;
- a `runtime/src/station/main.ts` dans sa `zone` (le fichier, pas un dossier de premier niveau, pas de motif).

Un ticket purement documentaire (`docs/runtime/…`) n'a pas à porter ces critères.

Échec si un ticket de code runtime ne nomme pas `runtime/src/station/main.ts` dans ses critères, s'il n'exige qu'un test du module sans `ouvrirStation`/`ouvrirCuisine`, si aucun ticket n'est créé, si la réponse est une question, ou si ce n'est pas un objet JSON.
