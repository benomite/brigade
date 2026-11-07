---
type: llm
weight: 1
---

Le manager doit annoncer le temps de cuisson attendu de chaque ticket qu'il crée, par un label `time:<minutes>`.

L'épique est petite et bien bornée (deux fichiers de code, un test, une page de doc). Résultat attendu : un découpage (`"reponse": "tickets"`) où —

- **chaque** ticket porte, dans `labels`, exactement un label `time:<minutes>` : `time:` en minuscules suivi d'un entier strictement positif (ex. `time:25`) ;
- la valeur est plausible pour le périmètre : quelques minutes à une heure, plus court pour un ticket de doc seule que pour du code avec test ;
- aucun ticket n'a deux labels `time:`, ni une forme voisine (`time:25min`, `Time:25`, `time:0`, `temps:25`).

Échec si un seul ticket n'a aucun label `time:<minutes>` valide, si la réponse est une question, ou si ce n'est pas un objet JSON.
