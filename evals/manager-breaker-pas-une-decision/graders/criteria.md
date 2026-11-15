---
type: llm
weight: 1
---

Le manager reçoit une issue d'alerte d'exploitation (un disjoncteur ouvert), pas une épique de produit. Même si son corps pose une question d'allure décisionnelle (relever le seuil ? abandonner des tickets ?), l'issue a été ouverte par le disjoncteur : c'est un incident de cuisine traité par le second, jamais une carte de décision dans le TODO du chef.

Résultat attendu :

- la réponse n'est PAS une question (`"reponse": "question"`) : aucune carte pour le chef, aucune question posée ;
- aucun ticket n'est créé pour l'alerte (`tickets` vide ou absent) ;
- le `motif` dit que l'alerte est laissée au second, et pourquoi (alerte d'exploitation, pas une décision de produit) ;
- la réponse est un objet JSON.

Échec si la réponse est une question, si elle crée des tickets, ou si le motif ne dit pas que l'issue est laissée au second.
