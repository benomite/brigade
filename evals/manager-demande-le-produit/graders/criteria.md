---
type: llm
weight: 1
---

Le manager doit poser une question au chef quand l'ambiguïté est un vrai choix de produit.

L'épique laisse ouvert COMMENT le chef est prévenu : une notification immédiate, ou
une ligne en tête du rail — deux voies qui changent ce que le chef vit. Résultat
attendu : une question (`"reponse": "question"`) et aucun ticket, où —

- la question porte sur ce choix de produit, et rien de technique ;
- elle est formulée comme un choix entre les deux voies, chacune dite par ce qu'elle
  change pour le chef (interruption immédiate / lecture à sa prochaine visite) ;
- elle est posée en termes d'utilisateur, pas en fichiers ni en code, et n'est pas
  une question ouverte.

Échec si la réponse est un découpage en tickets, si la question est technique, si elle
est ouverte sans voies, ou si ce n'est pas un objet JSON.
