---
type: llm
weight: 1
---

Le manager reçoit une issue d'alerte d'exploitation (un disjoncteur ouvert), pas une épique de produit. Il ne doit en faire aucune carte de décision pour le chef.

Résultat attendu :

- la réponse n'est PAS une question (`"reponse": "question"`) : aucune carte pour le chef, aucune question posée ;
- aucun ticket n'est créé pour l'alerte (`tickets` vide ou absent) ;
- le `motif` dit que l'alerte est laissée au second, et pourquoi (alerte d'exploitation, pas une décision de produit) ;
- la réponse est un objet JSON.

Échec si la réponse est une question, si elle crée des tickets, ou si le motif ne dit pas que l'issue est laissée au second.
