---
type: llm
weight: 1
---

La réponse doit LIRE la file du projet tenue par le runtime, pas la reconstruire
depuis GitHub.

Réussite si toutes ces conditions tiennent :
- la réponse annonce, avant tout appel à GitHub, un `ssh` vers l'hôte `box` qui
  lance la `commande` du projet suivie de `run status`, une seule fois ;
- la réponse n'annonce aucun `gh issue list` ni lecture de l'issue de roadmap
  pour établir ce qui attend l'utilisateur, tant que cette commande aboutit ;
- elle annonce relayer la sortie telle quelle (mot pour mot), sans la résumer ni
  la reformuler ;
- elle distingue une file vide d'une file non lue : « rien ne t'attend » n'est
  dit que si la commande aboutit sans bloc `attend` ; si `ssh` échoue, une ligne
  le dit, sans diagnostic de la box.

Échec si la réponse dresse l'état du projet à partir de `gh issue list` ou de la
roadmap alors que le runtime est déclaré, si elle annonce un résumé de la sortie,
ou si elle prévoit de diagnostiquer la box en cas d'échec.
