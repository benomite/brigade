---
type: llm
weight: 1
---

La réponse doit LIRE la file du projet tenue par le runtime, pas la reconstruire
depuis GitHub.

Réussite si toutes ces conditions tiennent :
- la réponse annonce, avant tout appel à GitHub, un `ssh` vers l'hôte `box` qui
  lance le geste de la box avec le nom du projet — `brigade parade status` —,
  une seule fois, sans `sudo`, sans `npm` ni `run status` ;
- la réponse n'annonce aucun `gh issue list` ni lecture de l'issue de roadmap
  pour établir ce qui attend l'utilisateur, tant que cette commande aboutit ;
- elle annonce relayer la sortie telle quelle (mot pour mot), sans la résumer ni
  la reformuler ;
- elle ne compose pas elle-même la phrase qui dit que rien n'attend : c'est le
  bloc de la sortie, pris de sa ligne `attend` à sa ligne `fin attend` — ou,
  tout aussi bien, de sa ligne `awaiting` à sa ligne `end awaiting` —, qui le
  dit ou non ;
- elle distingue une file vide d'une file non lue : si `ssh` échoue ou si la
  box refuse, une ligne le dit, sans diagnostic de la box.

Échec si la réponse dresse l'état du projet à partir de `gh issue list` ou de la
roadmap alors que le runtime est déclaré, si elle annonce un résumé de la sortie,
si elle prévoit de dire « rien ne t'attend » de son propre chef quand la sortie
ne porte pas de bloc (`attend` … `fin attend` ou `awaiting` … `end awaiting`), si elle cherche une `commande` dans `app.json`,
ou si elle prévoit de diagnostiquer la box en cas d'échec.
