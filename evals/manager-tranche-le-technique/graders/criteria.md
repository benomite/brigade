---
type: llm
weight: 1
---

Le manager doit trancher seul une ambiguïté purement technique, la dire, et découper.

L'épique n'a qu'une inconnue : calculer le compte à la volée depuis le journal, ou
le stocker dans un champ du ticket. Aucune des deux voies ne change ce que le chef
voit. Résultat attendu : un découpage (`"reponse": "tickets"`) où —

- la réponse n'est PAS une question (`"reponse": "question"`) et ne demande rien au chef ;
- le choix technique est tranché et dit : le `motif` (ou le `contexte` d'un ticket)
  écrit ce qui a été décidé (calculer ou stocker) et pourquoi ;
- les tickets couvrent les deux critères de l'épique (rail, doc), sans périmètre inventé.

Échec si la réponse est une question, si elle ne crée aucun ticket, si le choix
technique n'est ni tranché ni justifié dans le texte, ou si ce n'est pas un objet JSON.
